import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, debounceTime, of, switchMap, tap } from 'rxjs';
import { AlmoxService } from '../../core/almox/almox.service';
import { Estoque } from '../../core/almox/almox.models';
import { ehAlmoxarifado } from '../../core/almox/almox-tecnico';
import { AuthService } from '../../core/auth/auth.service';
import { FechamentoFiltro, FechamentoResumo, TipoFechamento } from '../../core/fechamento/fechamento.models';
import { ATALHOS, TIPOS_FECHAMENTO, atalhoFechamento, tipoFechamento } from '../../core/fechamento/fechamento-ui';
import { FechamentoService } from '../../core/fechamento/fechamento.service';
import { ApiError } from '../../core/http/error.interceptor';
import { SessaoService } from '../../core/sessao/sessao.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import {
  AbasSecaoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, OpcaoSegmento, OpcaoSeletor, SegmentadoComponent, SeletorComponent, TituloGrandeComponent,
  VazioComponent,
} from '../../ui';
import { abasAlmox } from '../almox/almox-abas';
import { CalendarioFechamentoComponent } from './calendario-fechamento.component';
import { AcaoFechamento, CartaoFechamentoComponent } from './cartao-fechamento.component';
import { BaseFechamento } from './fechamento.routes';
import { QuadroFechamentoComponent } from './quadro-fechamento.component';

type Quem = 'minhas' | 'todas';
type Visao = 'lista' | 'quadro' | 'calendario';
interface EstadoTela { atalho?: string; quem?: Quem; almoxarifado?: string | null; tipo?: TipoFechamento | null; filtros?: boolean; visao?: Visao }

const QUEM: OpcaoSegmento<Quem>[] = [
  { valor: 'minhas', rotulo: 'Minhas', icone: 'conta' },
  { valor: 'todas', rotulo: 'Todas', icone: 'lista' },
];
const VISOES: OpcaoSegmento<Visao>[] = [
  { valor: 'lista', rotulo: 'Lista', icone: 'lista' },
  { valor: 'quadro', rotulo: 'Quadro', icone: 'quadro' },
  { valor: 'calendario', rotulo: 'Calendário', icone: 'calendario' },
];
const CHAVE_VISAO = 'ces_almox_visao_fechamento';
const POR_PAGINA = 20;

function lerVisao(): Visao {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    return v === 'quadro' || v === 'calendario' ? v : 'lista';
  } catch {
    return 'lista';
  }
}

/**
 * Solicitações de encerramento: a seção do técnico abre em Minhas; a aba do almoxarifado abre em
 * todas, com as abas da área e as formas de ver do almoxarifado (lista, quadro e calendário).
 * A mesma tela serve às duas, e cada pessoa só vê as ações que o backend liberou para ela.
 */
@Component({
  selector: 'app-fechamento-lista',
  standalone: true,
  imports: [
    AbasSecaoComponent, CalendarioFechamentoComponent, CartaoFechamentoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, QuadroFechamentoComponent, RouterLink, SegmentadoComponent, SeletorComponent,
    TituloGrandeComponent, VazioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-titulo-grande [titulo]="almox ? 'Almoxarifado' : 'Encerramento'" [subtitulo]="subtitulo()">
      <ces-indicador-rede />
      <button type="button" class="ces-btn ces-btn--neutro ces-btn--compacto filtro" (click)="definir({ filtros: true })"
        [attr.aria-label]="'Filtros' + (filtrosAtivos() ? ', ' + filtrosAtivos() + ' ativos' : '')">
        <ces-icone nome="filtro" [tamanho]="18" />@if (filtrosAtivos()) { <span class="ces-num">{{ filtrosAtivos() }}</span> } @else { Filtrar }
      </button>
    </ces-titulo-grande>
    @if (almox && abas().length > 1) { <ces-abas-secao rotulo="Almoxarifado" [abas]="abas()" /> }

    @if (!rede.isOnline()) {
      <ces-vazio icone="sem_rede" titulo="O encerramento precisa de internet" texto="As solicitações dependem do saldo e dos prazos de agora no servidor. Conecte e a lista aparece aqui.">
        @if (auth.podeCriarFechamento()) { <a class="ces-btn ces-btn--tonal" [routerLink]="[base, 'novo']">Continuar preenchendo uma solicitação</a> }
      </ces-vazio>
    } @else {
      @if (almox) {
        <div class="topo"><ces-segmentado rotulo="Forma de ver" [opcoes]="visoes" [valor]="visao()" (valorChange)="definir({ visao: $event })" /></div>
      } @else {
        <div class="topo"><ces-segmentado rotulo="De quem" [opcoes]="opcoesQuem" [valor]="quem()" (valorChange)="definir({ quem: $event })" /></div>
      }

      <div class="busca">
        <ces-icone nome="busca" [tamanho]="18" />
        <input type="search" placeholder="Buscar pela obra ou reserva" enterkeyhint="search" aria-label="Buscar pela obra ou reserva" autocomplete="off" spellcheck="false"
          [value]="buscaDigitada()" (input)="buscaDigitada.set($any($event.target).value)">
        @if (buscaDigitada()) { <button type="button" class="ces-btn-icone limpar" (click)="buscaDigitada.set('')" aria-label="Limpar a busca"><ces-icone nome="fechar" [tamanho]="18" /></button> }
      </div>

      @if (visao() === 'lista') {
        <div class="atalhos" role="group" aria-label="Mostrar só a situação escolhida">
          <button type="button" class="chip" [attr.aria-pressed]="atalho() === 'ABERTO'" (click)="definir({ atalho: 'ABERTO' })">
            <ces-icone nome="relogio" [tamanho]="16" />Em aberto<span class="conta ces-num" [class.alerta]="(contagens()['ABERTO'] ?? 0) > 0">{{ contagens()['ABERTO'] ?? '–' }}</span>
          </button>
          <span class="divisor" aria-hidden="true"></span>
          @for (a of situacoes; track a.valor) {
            <button type="button" class="chip" [attr.data-tom]="a.tom" [attr.aria-pressed]="atalho() === a.valor" (click)="definir({ atalho: a.valor })">
              <span class="ponto" aria-hidden="true"></span>{{ a.rotulo }}<span class="conta ces-num">{{ contagens()[a.valor] ?? '–' }}</span>
            </button>
          }
        </div>
      }

      @if (resumoFiltros()) {
        <p class="recorte"><ces-icone nome="filtro" [tamanho]="16" /><span>{{ resumoFiltros() }}</span>
          <button type="button" class="ces-btn ces-btn--texto ces-btn--compacto" (click)="limparFiltros()">Limpar</button></p>
      }

      @if (visao() === 'quadro') {
        <app-quadro-fechamento #quadro [filtro]="recorte()" [acoes]="true" (abrir)="abrir($event)" (agir)="agir($event)" />
      } @else if (visao() === 'calendario') {
        <app-calendario-fechamento #calendario [filtro]="recorte()" [acoes]="true" (abrir)="abrir($event)" (agir)="agir($event)" />
      } @else if (erro()) {
        <ces-vazio icone="alerta" titulo="Não foi possível carregar o fechamento" [texto]="erro()">
          <button type="button" class="ces-btn ces-btn--tonal" (click)="recarregar()">Tentar de novo</button>
        </ces-vazio>
      } @else if (carregando() && !itens().length) {
        <div class="ces-esqueletos" aria-busy="true" aria-label="Carregando">@for (i of [1, 2, 3, 4]; track i) { <div class="ces-esqueleto" style="height: 128px"></div> }</div>
      } @else if (itens().length) {
        <div class="cartoes" [class.atualizando]="carregando()">
          @for (s of itens(); track s.id) {
            <app-cartao-fechamento [attr.data-ancora]="s.id" [item]="s" [acoes]="true" (abrir)="abrir($event)" (agir)="agir($event)" />
          }
        </div>
        @if (itens().length < total()) {
          <button type="button" class="ces-btn ces-btn--neutro ces-btn--bloco mais" (click)="mostrarMais()" [disabled]="carregandoMais()">
            {{ carregandoMais() ? 'Carregando…' : 'Mostrar mais' }}</button>
        }
      } @else {
        <ces-vazio icone="fechamento" [titulo]="tituloVazio()" [texto]="textoVazio()">
          @if (temRecorte()) { <button type="button" class="ces-btn ces-btn--tonal" (click)="verTudo()">Ver em aberto</button> }
        </ces-vazio>
      }
      <div class="ces-respiro"></div>
    }

    @if (auth.podeCriarFechamento() && rede.isOnline()) {
      <a class="ces-fab" [routerLink]="[base, 'novo']"><ces-icone nome="mais" />Nova</a>
    }

    <ces-folha [aberta]="folhaFiltros()" (fechar)="definir({ filtros: false })" titulo="Filtrar fechamento">
      <div class="campos">
        @if (almox && auth.podeCriarFechamento()) {
          <ces-segmentado rotulo="De quem" [opcoes]="opcoesQuem" [valor]="quem()" (valorChange)="definir({ quem: $event })" />
        }
        <ces-seletor rotulo="Almoxarifado" placeholder="Todos" [opcoes]="opcoesAlmoxarifado()" [valor]="almoxarifado()" (valorChange)="definir({ almoxarifado: $event })" />
        <ces-seletor rotulo="Tipo" placeholder="Todos" [opcoes]="opcoesTipo" [valor]="tipo()" (valorChange)="definir({ tipo: $any($event) })" />
      </div>
      <div rodape class="ces-folha-rodape">
        <button type="button" class="ces-btn ces-btn--neutro" (click)="limparFiltros()">Limpar</button>
        <button type="button" class="ces-btn ces-btn--principal" (click)="definir({ filtros: false })">Mostrar</button>
      </div>
    </ces-folha>
  `,
  styles: [`
    :host { display: block; min-height: 100%; }
    .filtro { gap: 6px; }
    .topo { padding: var(--ces-e3) var(--ces-e4) 0; }
    .busca { display: flex; align-items: center; gap: var(--ces-e2); margin: var(--ces-e3) var(--ces-e4) 0; padding: 0 var(--ces-e2) 0 var(--ces-e4); min-height: 48px;
      border-radius: var(--ces-r-pilula); background: var(--ces-superficie); color: var(--ces-texto-2); box-shadow: inset 0 0 0 1px var(--ces-linha); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ces-texto); font: var(--ces-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .limpar { color: var(--ces-texto-3); }
    .atalhos { display: flex; gap: var(--ces-e2); overflow-x: auto; padding: var(--ces-e3) var(--ces-e4) var(--ces-e2); scrollbar-width: none; overscroll-behavior-x: contain;
      scroll-snap-type: x proximity; scroll-padding-inline: var(--ces-e4); }
    .atalhos::after { content: ''; flex: 0 0 1px; }
    .atalhos::-webkit-scrollbar { display: none; }
    .chip { flex: none; scroll-snap-align: start; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 6px 0 14px; border-radius: var(--ces-r-pilula);
      border: 1px solid var(--ces-linha-forte); background: var(--ces-superficie); color: var(--ces-texto-2); font: 500 .875rem/1 var(--ces-fonte); cursor: pointer; white-space: nowrap; }
    .chip[aria-pressed='true'] { background: var(--ces-destaque-suave); border-color: transparent; color: var(--ces-destaque); font-weight: 600; }
    .chip:active { transform: scale(.97); }
    .conta { min-width: 24px; height: 26px; padding: 0 7px; box-sizing: border-box; border-radius: 13px; display: inline-grid; place-items: center;
      background: var(--ces-superficie-2); color: var(--ces-texto); font: 700 .75rem/1 var(--ces-fonte); }
    .chip[aria-pressed='true'] .conta { background: var(--ces-superficie); }
    .conta.alerta { background: var(--ces-atencao-suave); color: var(--ces-atencao); }
    .divisor { flex: none; width: 1px; align-self: stretch; margin: 6px 2px; background: var(--ces-linha-forte); }
    .ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--ces-texto-3); flex: none; }
    [data-tom='atencao'] .ponto { background: var(--ces-atencao); }
    [data-tom='destaque'] .ponto { background: var(--ces-destaque); }
    [data-tom='ok'] .ponto { background: var(--ces-ok); }
    [data-tom='erro'] .ponto { background: var(--ces-erro); }
    .recorte { display: flex; align-items: center; gap: var(--ces-e2); margin: var(--ces-e2) var(--ces-e4) 0; padding: 0 0 0 var(--ces-e4); min-height: 44px;
      border-radius: var(--ces-r-grupo); background: var(--ces-superficie); font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .recorte span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ces-texto); }
    .cartoes { display: grid; gap: var(--ces-e2); padding: var(--ces-e2) var(--ces-e4) 0; transition: opacity var(--ces-m-entrar); }
    .cartoes.atualizando { opacity: .6; }
    .mais { margin: var(--ces-e3) var(--ces-e4) 0; width: calc(100% - 2 * var(--ces-e4)); }
    .campos { display: grid; gap: var(--ces-e3); padding: 0 var(--ces-e3) var(--ces-e2); }
    .campos ces-seletor { box-shadow: inset 0 0 0 1px var(--ces-linha); border-radius: var(--ces-r-grupo); }
  `],
})
export class FechamentoListaComponent {
  private readonly fechamento = inject(FechamentoService);
  private readonly almoxService = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly sessao = inject(SessaoService);
  readonly auth = inject(AuthService);
  readonly rede = inject(ConnectivityService);

  readonly base = inject(ActivatedRoute).snapshot.data['base'] as BaseFechamento;
  readonly almox = this.base === '/almox/fechamento';
  readonly abas = abasAlmox();
  readonly situacoes = ATALHOS.filter(a => a.valor !== 'ABERTO');
  readonly visoes = VISOES;
  readonly opcoesQuem = QUEM;
  readonly opcoesTipo: OpcaoSeletor[] = TIPOS_FECHAMENTO.map(t => ({ valor: t.codigo, rotulo: `${t.codigo} · ${t.nome}` }));

  private readonly salvo = this.sessao.estadoTela<EstadoTela>();
  readonly visao = signal<Visao>(this.almox ? this.salvo.visao ?? lerVisao() : 'lista');
  private readonly quadro = viewChild<QuadroFechamentoComponent>('quadro');
  private readonly calendario = viewChild<CalendarioFechamentoComponent>('calendario');
  readonly atalho = signal(this.salvo.atalho ?? 'ABERTO');
  readonly quem = signal<Quem>(this.salvo.quem ?? (this.almox || !this.auth.podeCriarFechamento() ? 'todas' : 'minhas'));
  readonly almoxarifado = signal<string | null>(this.salvo.almoxarifado ?? null);
  readonly tipo = signal<TipoFechamento | null>(this.salvo.tipo ?? null);
  readonly busca = signal('');
  readonly buscaDigitada = signal('');
  readonly folhaFiltros = signal(!!this.salvo.filtros);

  readonly estoques = signal<Estoque[]>([]);
  readonly itens = signal<FechamentoResumo[]>([]);
  readonly total = signal(0);
  readonly contagens = signal<Partial<Record<string, number>>>({});
  readonly carregando = signal(false);
  readonly carregandoMais = signal(false);
  readonly erro = signal<string | null>(null);
  private readonly versao = signal(0);
  private pagina = 0;

  /** Recorte sem a situação: os chips contam dentro dele. */
  readonly recorte = computed<FechamentoFiltro>(() => ({
    minhas: this.quem() === 'minhas' || undefined,
    idAlmoxarifado: this.almoxarifado() ?? undefined,
    tipos: this.tipo() ? [this.tipo()!] : undefined,
    busca: this.busca() || undefined,
  }), { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });

  private readonly filtro = computed<FechamentoFiltro>(() => ({
    ...this.recorte(), ...atalhoFechamento(this.atalho()).filtro, ordenacao: 'solicitacao', direcao: 'desc', size: POR_PAGINA,
  }), { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });

  readonly opcoesAlmoxarifado = computed<OpcaoSeletor[]>(() => this.estoques().filter(ehAlmoxarifado).map(e => ({ valor: e.id, rotulo: e.nomeIdentificador })));
  readonly filtrosAtivos = computed(() => [this.almoxarifado(), this.tipo(), this.almox && this.quem() === 'minhas'].filter(Boolean).length);
  readonly resumoFiltros = computed(() => [
    this.almox && this.quem() === 'minhas' ? 'Minhas' : '',
    this.almoxarifado() ? this.estoques().find(e => e.id === this.almoxarifado())?.nomeIdentificador ?? 'Almoxarifado' : '',
    this.tipo() ? `${this.tipo()} · ${tipoFechamento(this.tipo()!).nome}` : '',
  ].filter(Boolean).join(' · '));
  readonly subtitulo = computed(() => {
    const atrasadas = this.contagens()['ATRASADA'] ?? 0;
    if (atrasadas) return `${atrasadas} ${atrasadas === 1 ? 'atrasada' : 'atrasadas'}`;
    return this.almox ? 'Encerramento de obras' : 'Regularize o saldo da obra';
  });
  readonly temRecorte = computed(() => this.atalho() !== 'ABERTO' || !!this.filtrosAtivos() || !!this.busca());
  readonly tituloVazio = computed(() => {
    if (this.temRecorte()) return 'Nenhuma solicitação neste recorte';
    return this.quem() === 'minhas' ? 'Você não tem encerramento em aberto' : 'Nada em aberto no fechamento';
  });
  readonly textoVazio = computed(() => {
    if (this.temRecorte()) return 'Tire algum filtro ou veja outra situação.';
    return this.auth.podeCriarFechamento() ? 'Toque em Nova para pedir a adição ou a devolução de material de uma obra.' : 'Quando o técnico pedir um encerramento, ele aparece aqui.';
  });

  constructor() {
    this.almoxService.estoques().subscribe(e => this.estoques.set(e));
    toObservable(this.buscaDigitada).pipe(debounceTime(400), takeUntilDestroyed()).subscribe(v => this.busca.set(v.trim()));

    combineLatest([toObservable(this.filtro), toObservable(this.versao)]).pipe(
      tap(() => this.erro.set(null)),
      switchMap(([f]) => {
        if (!this.rede.isOnline()) return of(null);
        this.carregando.set(true);
        this.pagina = 0;
        return this.fechamento.listar({ ...f, page: 0 }).pipe(
          tap(r => { this.itens.set(r.content ?? []); this.total.set(r.page?.totalElements ?? 0); }),
          catchError((e: ApiError) => { this.erro.set(e?.detail || 'Verifique a conexão e tente de novo.'); return of(null); }),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(() => this.carregando.set(false));

    combineLatest([toObservable(this.recorte), toObservable(this.versao)]).pipe(
      switchMap(([r]) => {
        if (!this.rede.isOnline()) return of({});
        const recortes = Object.fromEntries(ATALHOS.map(a => [a.valor, { ...r, ...a.filtro }]));
        return this.fechamento.contar(recortes);
      }),
      takeUntilDestroyed(),
    ).subscribe(c => this.contagens.set(c));

    let estavaOnline = this.rede.isOnline();
    effect(() => {
      const online = this.rede.isOnline();
      if (online && !estavaOnline) untracked(() => this.recarregar());
      estavaOnline = online;
    });
  }

  definir(m: Partial<EstadoTela>): void {
    if (m.visao !== undefined) {
      this.visao.set(m.visao);
      try { localStorage.setItem(CHAVE_VISAO, m.visao); } catch { /* preferência opcional */ }
    }
    if (m.atalho !== undefined) this.atalho.set(m.atalho);
    if (m.quem !== undefined) this.quem.set(m.quem);
    if (m.almoxarifado !== undefined) this.almoxarifado.set(m.almoxarifado);
    if (m.tipo !== undefined) this.tipo.set(m.tipo);
    if (m.filtros !== undefined) this.folhaFiltros.set(m.filtros);
    this.sessao.definirEstadoTela({ ...m });
  }

  limparFiltros(): void {
    this.definir({ almoxarifado: null, tipo: null, ...(this.almox ? { quem: 'todas' as const } : {}) });
  }

  verTudo(): void {
    this.buscaDigitada.set('');
    this.definir({ atalho: 'ABERTO', almoxarifado: null, tipo: null });
  }

  recarregar(): void {
    this.versao.update(v => v + 1);
    this.quadro()?.recarregar();
    this.calendario()?.recarregar();
  }

  mostrarMais(): void {
    if (this.carregandoMais()) return;
    const proxima = this.pagina + 1;
    this.carregandoMais.set(true);
    this.fechamento.listar({ ...this.filtro(), page: proxima }).subscribe({
      next: r => {
        this.pagina = proxima;
        this.itens.update(l => [...l, ...(r.content ?? [])]);
        this.total.set(r.page?.totalElements ?? this.total());
        this.carregandoMais.set(false);
      },
      error: () => this.carregandoMais.set(false),
    });
  }

  abrir(s: FechamentoResumo): void {
    void this.router.navigate([this.base, s.id]);
  }

  agir(e: { acao: AcaoFechamento; item: FechamentoResumo }): void {
    if (e.acao === 'movimentar') void this.router.navigate([this.base, e.item.id, 'movimentar']);
    else void this.router.navigate([this.base, e.item.id], { queryParams: { acao: 'reserva' } });
  }
}
