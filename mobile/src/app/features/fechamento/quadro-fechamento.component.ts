import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { FechamentoFiltro, FechamentoResumo, SituacaoFechamento } from '../../core/fechamento/fechamento.models';
import { TomFechamento } from '../../core/fechamento/fechamento-ui';
import { FechamentoService } from '../../core/fechamento/fechamento.service';
import { ApiError } from '../../core/http/error.interceptor';
import { IconeComponent, NomeIcone, VazioComponent } from '../../ui';
import { AcaoFechamento, CartaoFechamentoComponent } from './cartao-fechamento.component';

interface DefGrupo { situacao: SituacaoFechamento; rotulo: string; tom: TomFechamento }
interface DefColuna { id: string; titulo: string; subtitulo: string; icone: NomeIcone; tom: TomFechamento; grupos: DefGrupo[]; vazio: string; encerrada?: boolean }
interface Faixa { total: number; itens: FechamentoResumo[] }

/** Mesmas colunas do quadro do web. */
const COLUNAS: readonly DefColuna[] = [
  { id: 'RESERVA', titulo: 'Reserva', subtitulo: 'Falta o número da reserva', icone: 'documento', tom: 'atencao', vazio: 'Nada sem reserva neste recorte.',
    grupos: [{ situacao: 'AGUARDANDO_RESERVA', rotulo: 'Aguardando reserva', tom: 'atencao' }] },
  { id: 'MOVIMENTACAO', titulo: 'Movimentar', subtitulo: 'Com reserva, aguardando o almoxarifado', icone: 'transferencia', tom: 'atencao', vazio: 'Nada para movimentar.',
    grupos: [{ situacao: 'AGUARDANDO_MOVIMENTACAO', rotulo: 'A movimentar', tom: 'atencao' }] },
  { id: 'PARCIAL', titulo: 'Em parte', subtitulo: 'Com restante a movimentar', icone: 'relogio', tom: 'destaque', vazio: 'Nada movimentado pela metade.',
    grupos: [{ situacao: 'MOVIMENTADA_PARCIALMENTE', rotulo: 'Restante a movimentar', tom: 'destaque' }] },
  { id: 'ENCERRADAS', titulo: 'Encerradas', subtitulo: 'Movimentadas ou canceladas', icone: 'check', tom: 'neutro', vazio: 'Nada encerrado ainda.', encerrada: true,
    grupos: [{ situacao: 'MOVIMENTADA', rotulo: 'Movimentadas', tom: 'ok' }, { situacao: 'CANCELADA', rotulo: 'Canceladas', tom: 'neutro' }] },
];
const POR_FAIXA = 30;

/**
 * Quadro do encerramento no celular, no mesmo jeito do técnico: uma coluna por vez, rolagem lateral
 * que encaixa e atalhos no topo para pular de coluna. Cada faixa traz até 30 solicitações.
 */
@Component({
  selector: 'app-quadro-fechamento',
  standalone: true,
  imports: [CartaoFechamentoComponent, IconeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="atalhos" aria-label="Ir para a coluna">
      @for (c of colunas(); track c.def.id; let i = $index) {
        <button type="button" class="atalho" [attr.data-tom]="c.def.tom" [attr.aria-current]="visivel() === i ? 'true' : null" (click)="irPara(i)">
          {{ c.def.titulo }}<strong class="geo-num">{{ faixas() ? c.total : '–' }}</strong>
        </button>
      }
    </nav>

    @if (erro()) {
      <geo-vazio icone="alerta" titulo="Não foi possível carregar o quadro" [texto]="erro()">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="recarregar()">Tentar de novo</button>
      </geo-vazio>
    } @else if (!faixas()) {
      <div class="trilho" role="status" aria-busy="true" aria-label="Carregando o quadro">
        <div class="coluna"><div class="geo-esqueleto" style="height: 76px; border-radius: 16px"></div><div class="geo-esqueleto" style="height: 128px"></div></div>
      </div>
    } @else {
      <div #trilho class="trilho" [class.atualizando]="carregando()" (scroll)="aoRolar()" role="region" aria-label="Quadro do fechamento">
        @for (c of colunas(); track c.def.id) {
          <section class="coluna" [attr.data-tom]="c.def.tom" [attr.aria-labelledby]="'qf-' + c.def.id">
            <header class="cab">
              <span class="cab__icone"><geo-icone [nome]="c.def.icone" [tamanho]="20" /></span>
              <div class="cab__txt"><h3 [id]="'qf-' + c.def.id">{{ c.def.titulo }}</h3><p>{{ c.def.subtitulo }}</p></div>
              <span class="cab__total geo-num">{{ c.total }}</span>
            </header>
            @if (c.atrasadas) {
              <div class="alertas"><span class="alerta"><geo-icone nome="alerta" [tamanho]="14" />{{ c.atrasadas }} {{ c.atrasadas === 1 ? 'atrasada' : 'atrasadas' }}</span></div>
            }
            @if (c.total === 0) {
              <div class="vazio"><span class="vazio__icone"><geo-icone nome="check" [tamanho]="22" /></span><strong>Tudo em dia</strong><span>{{ c.def.vazio }}</span></div>
            } @else {
              @for (g of c.grupos; track g.def.situacao) {
                @if (g.total > 0) {
                  <div class="grupo">
                    @if (c.varios) {
                      <p class="grupo__cab" [attr.data-tom]="g.def.tom"><span class="grupo__ponto" aria-hidden="true"></span><span class="grupo__rotulo">{{ g.def.rotulo }}</span><span class="geo-num conta">{{ g.total }}</span></p>
                    }
                    <div class="cartoes">
                      @for (s of g.itens; track s.id) {
                        <app-cartao-fechamento [item]="s" [acoes]="acoes()" (abrir)="abrir.emit($event)" (agir)="agir.emit($event)" />
                      }
                      @if (g.total > g.itens.length) { <p class="mais">Mostrando {{ g.itens.length }} de {{ g.total }}. Busque pela obra para achar as demais.</p> }
                    </div>
                  </div>
                }
              }
            }
          </section>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .atalhos { display: flex; gap: 2px; margin: var(--geo-e3) var(--geo-e4) 0; padding: 3px; border-radius: var(--geo-r-pilula); background: var(--geo-superficie-2);
      overflow-x: auto; scrollbar-width: none; }
    .atalhos::-webkit-scrollbar { display: none; }
    .atalho { flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 36px; padding: 0 10px; border: 0;
      border-radius: var(--geo-r-pilula); background: transparent; color: var(--geo-texto-2); font: 600 .8125rem/1 var(--geo-fonte); cursor: pointer; white-space: nowrap;
      transition: background-color var(--geo-m-entrar), color var(--geo-m-entrar); }
    .atalho strong { min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 10px; display: inline-grid; place-items: center;
      font: 600 .6875rem/1 var(--geo-fonte); background: var(--geo-superficie); color: var(--geo-texto); }
    .atalho[aria-current='true'] { background: var(--geo-superficie); color: var(--geo-texto); box-shadow: 0 1px 2px rgba(0, 0, 0, .1); }
    .atalho[aria-current='true'][data-tom='atencao'] strong { background: var(--geo-atencao-suave); color: var(--geo-atencao); }
    .atalho[aria-current='true'][data-tom='destaque'] strong { background: var(--geo-destaque-suave); color: var(--geo-destaque); }
    .trilho { display: grid; grid-auto-flow: column; grid-auto-columns: 100%; gap: var(--geo-e3); overflow-x: auto; overscroll-behavior-x: contain; align-items: start;
      scroll-snap-type: x mandatory; scroll-padding: 0 var(--geo-e4); padding: var(--geo-e3) var(--geo-e4) var(--geo-e2); scrollbar-width: none; transition: opacity var(--geo-m-entrar); }
    .trilho::-webkit-scrollbar { display: none; }
    .trilho.atualizando { opacity: .6; }
    .coluna { scroll-snap-align: start; display: grid; align-content: start; gap: var(--geo-e3); min-width: 0; padding: var(--geo-e2);
      border-radius: var(--geo-r-folha); background: var(--geo-superficie-2); }
    .coluna[data-tom='atencao'] { --cor: var(--geo-atencao); --suave: var(--geo-atencao-suave); }
    .coluna[data-tom='destaque'] { --cor: var(--geo-destaque); --suave: var(--geo-destaque-suave); }
    .coluna[data-tom='neutro'] { --cor: var(--geo-texto-2); --suave: var(--geo-superficie); }
    .cab { display: flex; align-items: center; gap: var(--geo-e3); padding: var(--geo-e2) var(--geo-e2) var(--geo-e1); }
    .cab__icone { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--suave); color: var(--cor); flex: none; }
    .cab__txt { flex: 1; min-width: 0; }
    .cab h3 { margin: 0; font: 600 .9375rem/1.25 var(--geo-fonte); }
    .cab p { margin: 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .cab__total { min-width: 26px; height: 24px; padding: 0 8px; box-sizing: border-box; border-radius: 12px; display: grid; place-items: center; background: var(--geo-superficie);
      font: 600 .8125rem/1 var(--geo-fonte); color: var(--cor); }
    .alertas { display: flex; padding: 0 var(--geo-e1); }
    .alerta { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: var(--geo-r-pilula); font: 600 .75rem/1.3 var(--geo-fonte);
      background: var(--geo-erro-suave); color: var(--geo-erro); }
    .vazio { display: grid; justify-items: center; gap: 4px; padding: var(--geo-e5) var(--geo-e4); margin: 0 var(--geo-e1); border-radius: var(--geo-r-grupo); background: var(--geo-superficie);
      text-align: center; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .vazio strong { font: var(--geo-t-corpo-forte); color: var(--geo-texto); }
    .vazio__icone { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 4px; background: var(--geo-ok-suave); color: var(--geo-ok); }
    .grupo { display: grid; gap: var(--geo-e2); }
    .grupo__cab { display: flex; align-items: center; gap: var(--geo-e2); margin: 0; min-height: 32px; padding: 0 var(--geo-e2); font: 600 .8125rem/1.2 var(--geo-fonte); }
    .grupo__ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--geo-texto-3); flex: none; }
    .grupo__cab[data-tom='ok'] .grupo__ponto { background: var(--geo-ok); }
    .grupo__rotulo { flex: 1; }
    .conta { font: 600 .75rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .cartoes { display: grid; gap: var(--geo-e2); }
    .mais { margin: 0; text-align: center; font: var(--geo-t-apoio); color: var(--geo-texto-2); padding: var(--geo-e2); }
  `],
})
export class QuadroFechamentoComponent {
  private readonly fechamento = inject(FechamentoService);

  /** Recorte sem a situação: as colunas é que separam por situação. */
  readonly filtro = input<FechamentoFiltro>({});
  readonly acoes = input(false);
  readonly abrir = output<FechamentoResumo>();
  readonly agir = output<{ acao: AcaoFechamento; item: FechamentoResumo }>();

  readonly faixas = signal<Partial<Record<SituacaoFechamento, Faixa>> | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly visivel = signal(0);
  private readonly versao = signal(0);
  private jaPosicionou = false;
  private readonly trilho = viewChild<ElementRef<HTMLElement>>('trilho');

  readonly colunas = computed(() => COLUNAS.map(def => {
    const grupos = def.grupos.map(g => ({ def: g, total: this.faixas()?.[g.situacao]?.total ?? 0, itens: this.faixas()?.[g.situacao]?.itens ?? [] }));
    return {
      def, grupos, varios: grupos.filter(g => g.total > 0).length > 1,
      total: grupos.reduce((a, g) => a + g.total, 0),
      atrasadas: def.encerrada ? 0 : grupos.flatMap(g => g.itens).filter(s => s.prazoVigente?.situacao === 'ATRASADO').length,
    };
  }));

  constructor() {
    combineLatest([toObservable(this.filtro), toObservable(this.versao)]).pipe(
      tap(() => { this.carregando.set(true); this.erro.set(null); }),
      switchMap(([f]) => forkJoin(COLUNAS.flatMap(c => c.grupos).map(g => this.fechamento.listar({
        ...f, situacoes: [g.situacao], ordenacao: 'solicitacao', direcao: 'desc', page: 0, size: POR_FAIXA,
      }).pipe(map(r => [g.situacao, { total: r.page?.totalElements ?? 0, itens: r.content ?? [] }] as const)))).pipe(
        map(pares => Object.fromEntries(pares) as Partial<Record<SituacaoFechamento, Faixa>>),
        catchError((e: ApiError) => { this.erro.set(e?.detail || 'Verifique a conexão e tente de novo.'); return of(null); }),
      )),
      takeUntilDestroyed(),
    ).subscribe(f => {
      this.carregando.set(false);
      if (f) this.faixas.set(f);
    });

    // Abre na primeira coluna com trabalho.
    effect(() => {
      const el = this.trilho();
      const cols = this.colunas();
      if (!el || this.jaPosicionou || !this.faixas()) return;
      this.jaPosicionou = true;
      const alvo = cols.findIndex(c => c.total > 0 && !c.def.encerrada);
      if (alvo > 0) untracked(() => requestAnimationFrame(() => this.irPara(alvo, false)));
    });
  }

  recarregar(): void {
    this.versao.update(v => v + 1);
  }

  aoRolar(): void {
    const el = this.trilho()?.nativeElement;
    const col = el?.querySelector<HTMLElement>('.coluna');
    if (!el || !col) return;
    this.visivel.set(Math.max(0, Math.min(COLUNAS.length - 1, Math.round(el.scrollLeft / (col.offsetWidth + 12)))));
  }

  irPara(i: number, animar = true): void {
    const el = this.trilho()?.nativeElement;
    const col = el?.querySelectorAll<HTMLElement>('.coluna')[i];
    if (!el || !col) return;
    const reduzir = !animar || matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: el.scrollLeft + col.getBoundingClientRect().left - el.getBoundingClientRect().left - 16, behavior: reduzir ? 'auto' : 'smooth' });
    this.visivel.set(i);
  }
}
