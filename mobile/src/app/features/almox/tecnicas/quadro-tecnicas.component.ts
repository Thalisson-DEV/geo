import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import { Estoque, KanbanTecnico, ResumoSolicitacao, SubEtapaKanban } from '../../../core/almox/almox.models';
import { Tom } from '../../../core/almox/almox-status';
import { nomeEquipe } from '../../../core/almox/almox-tecnico';
import { IconeComponent, NomeIcone } from '../../../ui';
import { AcaoTecnica, CartaoTecnicaComponent } from './cartao-tecnica.component';

interface DefGrupo { sub: SubEtapaKanban; rotulo: string; tom: Tom }
interface DefColuna { id: string; titulo: string; subtitulo: string; icone: NomeIcone; tom: Tom; grupos: DefGrupo[]; vazio: string; encerrada?: boolean }

/** Colunas pela próxima ação do almoxarifado no fluxo técnico (mesmas etapas do quadro do web). */
const COLUNAS: readonly DefColuna[] = [
  { id: 'SEPARAR', titulo: 'Separar', subtitulo: 'Prontas ou em separação', icone: 'material', tom: 'atencao', vazio: 'Nada para separar neste recorte.',
    grupos: [{ sub: 'PRONTO_PARA_SEPARACAO', rotulo: 'Para separar', tom: 'atencao' }, { sub: 'EM_SEPARACAO', rotulo: 'Em separação', tom: 'destaque' }] },
  { id: 'ENTREGAR', titulo: 'Entregar', subtitulo: 'Separadas, esperando a retirada', icone: 'caminhao', tom: 'destaque', vazio: 'Nenhuma retirada pendente.',
    grupos: [{ sub: 'SEPARADO', rotulo: 'Separadas', tom: 'destaque' }, { sub: 'PENDENTE_RETIRADA', rotulo: 'Entregues em parte', tom: 'atencao' }] },
  { id: 'RECEBER', titulo: 'Receber', subtitulo: 'Devoluções 222/922 a receber', icone: 'desfazer', tom: 'atencao', vazio: 'Nenhuma devolução a receber.',
    grupos: [{ sub: 'PENDENTE_DEVOLUCAO', rotulo: 'A receber', tom: 'atencao' }] },
  { id: 'PLANEJAMENTO', titulo: 'Planejamento', subtitulo: 'Ainda sem data ou sem reserva', icone: 'calendario', tom: 'neutro', vazio: 'Nada em planejamento.',
    grupos: [{ sub: 'PENDENTE_PLANEJAMENTO', rotulo: 'Pendente de planejamento', tom: 'atencao' }, { sub: 'PLANEJADO', rotulo: 'Planejadas', tom: 'neutro' }] },
  { id: 'ENCERRADAS', titulo: 'Encerradas', subtitulo: 'Concluídas, rejeitadas ou canceladas', icone: 'check', tom: 'neutro', vazio: 'Nada encerrado ainda.', encerrada: true,
    grupos: [{ sub: 'CONCLUIDO', rotulo: 'Concluídas', tom: 'ok' }, { sub: 'REJEITADO', rotulo: 'Rejeitadas', tom: 'erro' }, { sub: 'CANCELADO', rotulo: 'Canceladas', tom: 'neutro' }] },
];

/**
 * Quadro técnico no celular, no mesmo jeito do comercial: uma coluna por vez, rolagem lateral
 * que encaixa e atalhos no topo para pular de coluna. Os dados são os do quadro do backend que a
 * tela já carregou (até 30 por etapa); as ações ficam nos botões de cada cartão.
 */
@Component({
  selector: 'app-quadro-tecnicas',
  standalone: true,
  imports: [CartaoTecnicaComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="atalhos" aria-label="Ir para a coluna">
      @for (c of colunas(); track c.def.id; let i = $index) {
        <button type="button" class="atalho" [attr.data-tom]="c.def.tom" [attr.aria-current]="visivel() === i ? 'true' : null" (click)="irPara(i)">
          {{ c.def.titulo }}<strong class="ces-num">{{ quadro() ? c.total : '–' }}</strong>
        </button>
      }
    </nav>

    @if (!quadro()) {
      <div class="trilho" aria-busy="true" aria-label="Carregando o quadro">
        <div class="coluna"><div class="ces-esqueleto" style="height: 76px; border-radius: 16px"></div><div class="ces-esqueleto" style="height: 128px"></div></div>
      </div>
    } @else {
      <div #trilho class="trilho" [class.atualizando]="carregando()" (scroll)="aoRolar()" role="region" aria-label="Quadro de solicitações técnicas">
        @for (c of colunas(); track c.def.id) {
          <section class="coluna" [attr.data-tom]="c.def.tom" [attr.aria-labelledby]="'qt-' + c.def.id">
            <header class="cab">
              <span class="cab__icone"><ces-icone [nome]="c.def.icone" [tamanho]="20" /></span>
              <div class="cab__txt"><h3 [id]="'qt-' + c.def.id">{{ c.def.titulo }}</h3><p>{{ c.def.subtitulo }}</p></div>
              <span class="cab__total ces-num">{{ c.total }}</span>
            </header>
            @if (c.atrasadas) {
              <div class="alertas"><span class="alerta"><ces-icone nome="alerta" [tamanho]="14" />{{ c.atrasadas }} {{ c.atrasadas === 1 ? 'atrasada' : 'atrasadas' }}</span></div>
            }
            @if (c.total === 0) {
              <div class="vazio"><span class="vazio__icone"><ces-icone nome="check" [tamanho]="22" /></span><strong>Tudo em dia</strong><span>{{ c.def.vazio }}</span></div>
            } @else {
              @for (g of c.grupos; track g.def.sub) {
                @if (g.total > 0) {
                  <div class="grupo">
                    @if (c.varios) {
                      <p class="grupo__cab" [attr.data-tom]="g.def.tom"><span class="grupo__ponto" aria-hidden="true"></span><span class="grupo__rotulo">{{ g.def.rotulo }}</span><span class="ces-num conta">{{ g.total }}</span></p>
                    }
                    <div class="cartoes">
                      @for (s of g.itens; track s.id) {
                        <app-cartao-tecnica [item]="s" [equipe]="equipe(s)" [acoes]="acoes()" [ocupado]="ocupado()?.id === s.id ? ocupado()!.acao : null"
                          (abrir)="abrir.emit($event)" (agir)="agir.emit($event)" />
                      }
                      @if (g.total > g.itens.length) { <p class="mais">Mostrando {{ g.itens.length }} de {{ g.total }}. Busque pela OC/OS para achar as demais.</p> }
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
    .atalhos { display: flex; gap: 2px; margin: var(--ces-e3) var(--ces-e4) 0; padding: 3px; border-radius: var(--ces-r-pilula); background: var(--ces-superficie-2);
      overflow-x: auto; scrollbar-width: none; }
    .atalhos::-webkit-scrollbar { display: none; }
    .atalho { flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 36px; padding: 0 10px; border: 0;
      border-radius: var(--ces-r-pilula); background: transparent; color: var(--ces-texto-2); font: 600 .8125rem/1 var(--ces-fonte); cursor: pointer; white-space: nowrap;
      transition: background-color var(--ces-m-entrar), color var(--ces-m-entrar); }
    .atalho strong { min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 10px; display: inline-grid; place-items: center;
      font: 700 .6875rem/1 var(--ces-fonte); background: var(--ces-superficie); color: var(--ces-texto); }
    .atalho[aria-current='true'] { background: var(--ces-superficie); color: var(--ces-texto); box-shadow: 0 1px 2px rgba(0, 0, 0, .1); }
    .atalho[aria-current='true'][data-tom='atencao'] strong { background: var(--ces-atencao-suave); color: var(--ces-atencao); }
    .atalho[aria-current='true'][data-tom='destaque'] strong { background: var(--ces-destaque-suave); color: var(--ces-destaque); }
    .trilho { display: grid; grid-auto-flow: column; grid-auto-columns: 100%; gap: var(--ces-e3); overflow-x: auto; overscroll-behavior-x: contain; align-items: start;
      scroll-snap-type: x mandatory; scroll-padding: 0 var(--ces-e4); padding: var(--ces-e3) var(--ces-e4) var(--ces-e2); scrollbar-width: none; transition: opacity var(--ces-m-entrar); }
    .trilho::-webkit-scrollbar { display: none; }
    .trilho.atualizando { opacity: .6; }
    .coluna { scroll-snap-align: start; display: grid; align-content: start; gap: var(--ces-e3); min-width: 0; padding: var(--ces-e2);
      border-radius: var(--ces-r-folha); background: var(--ces-superficie-2); }
    .coluna[data-tom='atencao'] { --cor: var(--ces-atencao); --suave: var(--ces-atencao-suave); }
    .coluna[data-tom='destaque'] { --cor: var(--ces-destaque); --suave: var(--ces-destaque-suave); }
    .coluna[data-tom='neutro'] { --cor: var(--ces-texto-2); --suave: var(--ces-superficie); }
    .cab { display: flex; align-items: center; gap: var(--ces-e3); padding: var(--ces-e2) var(--ces-e2) var(--ces-e1); }
    .cab__icone { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--suave); color: var(--cor); flex: none; }
    .cab__txt { flex: 1; min-width: 0; }
    .cab h3 { margin: 0; font: 600 .9375rem/1.25 var(--ces-fonte); }
    .cab p { margin: 0; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .cab__total { min-width: 26px; height: 24px; padding: 0 8px; box-sizing: border-box; border-radius: 12px; display: grid; place-items: center; background: var(--ces-superficie);
      font: 700 .8125rem/1 var(--ces-fonte); color: var(--cor); }
    .alertas { display: flex; padding: 0 var(--ces-e1); }
    .alerta { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: var(--ces-r-pilula); font: 600 .75rem/1.3 var(--ces-fonte);
      background: var(--ces-erro-suave); color: var(--ces-erro); }
    .vazio { display: grid; justify-items: center; gap: 4px; padding: var(--ces-e5) var(--ces-e4); margin: 0 var(--ces-e1); border-radius: var(--ces-r-grupo); background: var(--ces-superficie);
      text-align: center; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .vazio strong { font: var(--ces-t-corpo-forte); color: var(--ces-texto); }
    .vazio__icone { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 4px; background: var(--ces-ok-suave); color: var(--ces-ok); }
    .grupo { display: grid; gap: var(--ces-e2); }
    .grupo__cab { display: flex; align-items: center; gap: var(--ces-e2); margin: 0; min-height: 32px; padding: 0 var(--ces-e2); font: 600 .8125rem/1.2 var(--ces-fonte); }
    .grupo__ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--ces-texto-3); flex: none; }
    .grupo__cab[data-tom='erro'] .grupo__ponto { background: var(--ces-erro); }
    .grupo__cab[data-tom='atencao'] .grupo__ponto { background: var(--ces-atencao); }
    .grupo__cab[data-tom='destaque'] .grupo__ponto { background: var(--ces-destaque); }
    .grupo__cab[data-tom='ok'] .grupo__ponto { background: var(--ces-ok); }
    .grupo__rotulo { flex: 1; }
    .conta { font: 700 .75rem/1 var(--ces-fonte); color: var(--ces-texto-2); }
    .cartoes { display: grid; gap: var(--ces-e2); }
    .mais { margin: 0; text-align: center; font: var(--ces-t-apoio); color: var(--ces-texto-2); padding: var(--ces-e2); }
  `],
})
export class QuadroTecnicasComponent {
  readonly quadro = input<KanbanTecnico | null>(null);
  readonly estoques = input<Estoque[]>([]);
  readonly carregando = input(false);
  readonly acoes = input(false);
  readonly ocupado = input<{ id: string; acao: AcaoTecnica } | null>(null);
  readonly abrir = output<ResumoSolicitacao>();
  readonly agir = output<{ acao: AcaoTecnica; item: ResumoSolicitacao }>();

  readonly visivel = signal(0);
  private jaPosicionou = false;
  private readonly trilho = viewChild<ElementRef<HTMLElement>>('trilho');

  readonly colunas = computed(() => {
    const subs = new Map<SubEtapaKanban, { total: number; itens: ResumoSolicitacao[] }>();
    for (const c of this.quadro()?.colunas ?? []) for (const s of c.subColunas ?? []) subs.set(s.subEtapa, { total: s.total ?? 0, itens: s.itens ?? [] });
    return COLUNAS.map(def => {
      const grupos = def.grupos.map(g => ({ def: g, total: subs.get(g.sub)?.total ?? 0, itens: subs.get(g.sub)?.itens ?? [] }));
      return {
        def, grupos, varios: grupos.filter(g => g.total > 0).length > 1,
        total: grupos.reduce((a, g) => a + g.total, 0),
        atrasadas: def.encerrada ? 0 : grupos.flatMap(g => g.itens).filter(s => s.tecnico?.atrasada).length,
      };
    });
  });

  constructor() {
    // Abre na primeira coluna com trabalho (ex.: nada para separar → Entregar).
    effect(() => {
      const el = this.trilho();
      const cols = this.colunas();
      if (!el || this.jaPosicionou || !this.quadro()) return;
      this.jaPosicionou = true;
      const alvo = cols.findIndex(c => c.total > 0 && !c.def.encerrada);
      if (alvo > 0) untracked(() => requestAnimationFrame(() => this.irPara(alvo, false)));
    });
  }

  equipe(s: ResumoSolicitacao): string | null {
    return nomeEquipe(this.estoques(), s.tecnico?.idEquipe ?? s.idEquipe);
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
