import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, debounceTime, from, of, switchMap, tap } from 'rxjs';
import { AprovacaoAbastecimentoService, PedidoParaAprovar, SituacaoAbastecimento } from '../../core/frota/aprovacao-abastecimento.service';
import { formatarPlaca } from '../../core/frota/checklist-veiculo.models';
import { SessaoService } from '../../core/sessao/sessao.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { PeriodFilter, periodStartTime } from '../../shared/components/filter-sheet/period-filter.util';
import {
  BarraTopoComponent, ChipsComponent, FolhaComponent, IconeComponent, OpcaoChip, OpcaoSeletor, PERIODOS, SeletorComponent, VazioComponent,
  agruparPorDia, hora,
} from '../../ui';

type Recorte = 'pendentes' | 'liberacao' | 'liberados' | 'abastecidos' | 'encerrados' | 'todos';
interface EstadoTela { recorte?: Recorte; periodo?: PeriodFilter; filtros?: boolean }

const RECORTES: (OpcaoChip<Recorte> & { situacoes: SituacaoAbastecimento[] })[] = [
  { valor: 'pendentes', rotulo: 'Para aprovar', situacoes: ['AGUARDANDO_APROVACAO'] },
  { valor: 'liberacao', rotulo: 'Na liberação', situacoes: ['APROVADA'] },
  { valor: 'liberados', rotulo: 'Liberados', situacoes: ['LIBERADA'] },
  { valor: 'abastecidos', rotulo: 'Abastecidos', situacoes: ['REALIZADA'] },
  { valor: 'encerrados', rotulo: 'Reprovados e cancelados', situacoes: ['REPROVADA', 'CANCELADA', 'VENCIDA'] },
  { valor: 'todos', rotulo: 'Todos', situacoes: [] },
];

/** Em que pé está o pedido, em palavras de quem acompanha. */
const ETAPA: Record<SituacaoAbastecimento, { texto: string; tom: 'atencao' | 'destaque' | 'ok' | 'erro' | 'neutro' }> = {
  AGUARDANDO_APROVACAO: { texto: 'Esperando sua aprovação', tom: 'atencao' },
  APROVADA: { texto: 'Aprovado · esperando a liberação', tom: 'destaque' },
  LIBERADA: { texto: 'Liberado · a equipe já pode abastecer', tom: 'destaque' },
  REALIZADA: { texto: 'Abastecido', tom: 'ok' },
  REPROVADA: { texto: 'Reprovado', tom: 'erro' },
  CANCELADA: { texto: 'Cancelado', tom: 'neutro' },
  VENCIDA: { texto: 'Venceu sem abastecer', tom: 'neutro' },
};
const TAMANHO = 30;
/** Rota fixa: ao voltar do detalhe, a sessão ainda aponta para o detalhe quando a tela nasce. */
const ROTA = '/abastecimento/aprovacoes';

/**
 * Abastecimentos das placas da carteira de quem aprova: abre nos que esperam a aprovação e
 * acompanha o resto do caminho (liberação, abastecimento, encerrados), com filtro por placa e
 * período. Precisa de sinal, porque a situação de cada pedido está no servidor.
 */
@Component({
  selector: 'app-aprovacoes-lista',
  standalone: true,
  imports: [RouterLink, BarraTopoComponent, ChipsComponent, FolhaComponent, IconeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Abastecimentos" [subtitulo]="subtitulo()" (voltar)="voltar()">
      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto filtro" (click)="definir({ filtros: true })"
        [attr.aria-label]="'Filtros' + (filtrosAtivos() ? ', ' + filtrosAtivos() + ' ativos' : '')">
        <geo-icone nome="filtro" [tamanho]="18" />@if (filtrosAtivos()) { <span class="geo-num">{{ filtrosAtivos() }}</span> } @else { Filtrar }
      </button>
    </geo-barra-topo>

    @if (!rede.isOnline()) {
      <geo-vazio icone="sem_rede" titulo="Sem internet" texto="A situação dos pedidos está no servidor. Conecte e a lista aparece aqui." />
    } @else {
      <geo-chips rotulo="Situação do pedido" [opcoes]="recortes" [contagem]="{ pendentes: pendentes() ?? 0 }" [valor]="recorte()"
        (valorChange)="definir({ recorte: $any($event) })" />

      @if (erro()) {
        <geo-vazio icone="alerta" titulo="Não foi possível carregar os pedidos" [texto]="erro()">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="recarregar()">Tentar de novo</button>
        </geo-vazio>
      } @else if (carregando() && !itens().length) {
        <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">@for (i of [1, 2, 3]; track i) { <div class="geo-esqueleto" style="height: 88px"></div> }</div>
      } @else if (grupos().length) {
        <div class="lista" [class.atualizando]="carregando()">
          @for (g of grupos(); track g.titulo) {
            <h2 class="geo-secao">{{ g.titulo }}</h2>
            <ul class="geo-grupo">
              @for (p of g.itens; track p.id) {
                <li><a class="geo-linha geo-linha--acao" [routerLink]="['/abastecimento/aprovacoes', p.id]">
                  <span class="geo-selo" [class]="'geo-selo geo-selo--' + etapa(p).tom"><geo-icone nome="combustivel" /></span>
                  <span class="geo-linha__texto">
                    <span class="geo-linha__titulo"><span class="geo-num">{{ placa(p.placa) }}</span> · {{ p.itens }}</span>
                    <span class="geo-linha__resumo" [attr.data-tom]="etapa(p).tom">{{ etapa(p).texto }}</span>
                    <span class="geo-linha__apoio">{{ p.destino ? 'Destino: ' + p.destino : 'Sem destino informado' }}</span>
                    <span class="geo-linha__apoio geo-num">{{ hora(p.solicitadoEm) }}{{ p.condutor ? ' · ' + p.condutor : '' }}{{ p.alertas.length ? ' · ' + p.alertas.length + (p.alertas.length === 1 ? ' alerta' : ' alertas') : '' }}</span>
                  </span>
                  <geo-icone nome="avancar" [tamanho]="18" />
                </a></li>
              }
            </ul>
          }
          @if (itens().length < total()) {
            <button type="button" class="geo-btn geo-btn--neutro geo-btn--bloco mais" (click)="pagina.set(pagina() + 1)" [disabled]="carregando()">
              {{ carregando() ? 'Carregando…' : 'Mostrar mais (' + (total() - itens().length) + ')' }}</button>
          }
        </div>
      } @else if (recorte() === 'pendentes' && !filtrosAtivos()) {
        <geo-vazio icone="check" titulo="Nada para aprovar" texto="Os pedidos das placas da sua carteira aparecem aqui assim que a equipe pede pelo app.">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="definir({ recorte: 'todos' })">Ver todos os pedidos</button>
        </geo-vazio>
      } @else {
        <geo-vazio icone="combustivel" titulo="Nenhum pedido neste recorte" [texto]="filtrosAtivos() ? 'Tire algum filtro para ver mais.' : 'Os pedidos das placas da sua carteira aparecem aqui.'">
          @if (filtrosAtivos()) { <button type="button" class="geo-btn geo-btn--tonal" (click)="limpar()">Limpar filtros</button> }
        </geo-vazio>
      }
      <div class="geo-respiro"></div>
    }

    <geo-folha [aberta]="folhaFiltros()" (fechar)="definir({ filtros: false })" titulo="Filtrar abastecimentos">
      <div class="campos">
        <label class="geo-campo"><span class="geo-campo__rotulo">Placa</span>
          <input class="geo-input" [value]="buscaDigitada()" (input)="buscaDigitada.set($any($event.target).value)" autocapitalize="characters"
            autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="Ex.: ABC1D23"></label>
        <geo-seletor rotulo="Período do pedido" [opcoes]="opcoesPeriodo" [valor]="periodo()" (valorChange)="definir({ periodo: $any($event) ?? '30dias' })" />
      </div>
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="limpar()">Limpar</button>
        <button type="button" class="geo-btn geo-btn--principal" (click)="definir({ filtros: false })">Mostrar</button>
      </div>
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    .filtro { gap: 6px; }
    .lista { transition: opacity var(--geo-m-entrar); }
    .lista.atualizando { opacity: .6; }
    .geo-linha__resumo[data-tom='atencao'] { color: var(--geo-atencao); font-weight: 600; }
    .geo-linha__resumo[data-tom='destaque'] { color: var(--geo-destaque); }
    .geo-linha__resumo[data-tom='ok'] { color: var(--geo-ok); }
    .geo-linha__resumo[data-tom='erro'] { color: var(--geo-erro); }
    .mais { margin: var(--geo-e3) var(--geo-e3) 0; width: calc(100% - 24px); }
    .campos { display: grid; gap: var(--geo-e3); padding: 0 var(--geo-e3) var(--geo-e2); }
    .campos geo-seletor { box-shadow: inset 0 0 0 1px var(--geo-linha); border-radius: var(--geo-r-grupo); }
    .campos .geo-campo__rotulo { padding-left: var(--geo-e4); }
  `]
})
export class AprovacoesListaComponent {
  private readonly servico = inject(AprovacaoAbastecimentoService);
  private readonly router = inject(Router);
  private readonly sessao = inject(SessaoService);
  protected readonly rede = inject(ConnectivityService);

  protected readonly recortes = RECORTES;
  protected readonly hora = hora;
  protected readonly opcoesPeriodo: OpcaoSeletor[] = PERIODOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo }));
  private readonly salvo = this.sessao.estadoTela<EstadoTela>(ROTA);
  protected readonly recorte = signal<Recorte>(this.salvo.recorte ?? 'pendentes');
  protected readonly periodo = signal<PeriodFilter>(this.salvo.periodo ?? '30dias');
  protected readonly busca = signal('');
  protected readonly buscaDigitada = signal('');
  protected readonly folhaFiltros = signal(!!this.salvo.filtros);
  protected readonly itens = signal<PedidoParaAprovar[]>([]);
  protected readonly total = signal(0);
  /** Esperando a aprovação, em qualquer data: a contagem do chip não depende do recorte. */
  protected readonly pendentes = signal<number | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly pagina = signal(0);
  private readonly versao = signal(0);

  protected readonly filtrosAtivos = computed(() => [this.busca().trim(), this.periodo() !== '30dias' ? 1 : null].filter(Boolean).length);
  protected readonly grupos = computed(() => agruparPorDia(this.itens(), (p) => p.solicitadoEm));
  protected readonly subtitulo = computed(() => {
    const r = RECORTES.find((x) => x.valor === this.recorte())!;
    const p = PERIODOS.find((x) => x.valor === this.periodo())?.rotulo.toLowerCase() ?? '';
    return `${r.rotulo} · ${this.total()} · ${p}`;
  });

  constructor() {
    toObservable(this.buscaDigitada).pipe(debounceTime(450), takeUntilDestroyed()).subscribe((v) => {
      if (v.trim() !== this.busca()) { this.busca.set(v.trim()); this.pagina.set(0); }
    });

    combineLatest([toObservable(this.recorte), toObservable(this.periodo), toObservable(this.busca), toObservable(this.pagina), toObservable(this.versao)]).pipe(
      tap(() => this.erro.set(null)),
      switchMap(([recorte, periodo, busca, pagina]) => {
        if (!this.rede.isOnline()) return of(null);
        this.carregando.set(true);
        const inicio = periodStartTime(periodo);
        return from(this.servico.carteira({
          situacoes: RECORTES.find((r) => r.valor === recorte)!.situacoes, busca: busca.toUpperCase() || null,
          de: inicio !== null ? diaLocal(new Date(inicio)) : null, page: pagina, size: TAMANHO,
        })).pipe(
          tap((r) => { this.itens.set(pagina === 0 ? r.content : [...this.itens(), ...r.content]); this.total.set(r.page?.totalElements ?? 0); }),
          catchError((e: { detail?: string }) => { this.erro.set(e?.detail || 'Verifique a conexão e tente de novo.'); return of(null); }),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(() => this.carregando.set(false));

    toObservable(this.versao).pipe(
      switchMap(() => (this.rede.isOnline()
        ? from(this.servico.carteira({ situacoes: ['AGUARDANDO_APROVACAO'], busca: null, de: null, page: 0, size: 1 })).pipe(catchError(() => of(null)))
        : of(null))),
      takeUntilDestroyed(),
    ).subscribe((r) => { if (r) this.pendentes.set(r.page?.totalElements ?? 0); });

    let estavaOnline = this.rede.isOnline();
    effect(() => {
      const online = this.rede.isOnline();
      if (online && !estavaOnline) untracked(() => this.recarregar());
      estavaOnline = online;
    });
  }

  protected definir(m: Partial<EstadoTela>): void {
    if (m.recorte !== undefined) this.recorte.set(m.recorte);
    if (m.periodo !== undefined) this.periodo.set(m.periodo);
    if (m.filtros !== undefined) this.folhaFiltros.set(m.filtros);
    if (m.recorte !== undefined || m.periodo !== undefined) this.pagina.set(0);
    this.sessao.definirEstadoTela({ ...m }, ROTA);
  }

  protected limpar(): void {
    this.buscaDigitada.set('');
    this.busca.set('');
    this.definir({ periodo: '30dias' });
  }

  protected recarregar(): void {
    this.pagina.set(0);
    this.versao.update((v) => v + 1);
  }

  protected etapa(p: PedidoParaAprovar) {
    return ETAPA[p.situacao] ?? { texto: p.situacaoRotulo, tom: 'neutro' as const };
  }

  protected placa(p: string | null): string {
    return formatarPlaca(p);
  }

  protected voltar(): void {
    void this.router.navigate(['/frota']);
  }
}

/** aaaa-mm-dd no fuso do aparelho (o servidor filtra pelo dia do pedido). */
function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
