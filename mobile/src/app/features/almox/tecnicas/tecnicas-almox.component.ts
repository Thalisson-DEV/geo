import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, combineLatest, debounceTime, of, switchMap, tap } from 'rxjs';
import { AlmoxService } from '../../../core/almox/almox.service';
import { Estoque, FiltroTecnicas, KanbanTecnico, ResumoSolicitacao, SubEtapaKanban } from '../../../core/almox/almox.models';
import { idCurto } from '../../../core/almox/almox-status';
import {
  FILAS, FilaTecnica, SUBETAPAS_ABERTAS, TIPOS_TECNICOS, ehAlmoxarifado, nomeEquipe, subEtapasDaFila, tituloTecnica,
} from '../../../core/almox/almox-tecnico';
import { ApiError } from '../../../core/http/error.interceptor';
import { SessaoService } from '../../../core/sessao/sessao.service';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import { ToastService } from '../../../core/ui/toast.service';
import {
  AbasSecaoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, OpcaoSegmento, OpcaoSeletor, SegmentadoComponent, SeletorComponent, TituloGrandeComponent,
  VazioComponent,
} from '../../../ui';
import { abasAlmox } from '../almox-abas';
import { CalendarioSolicitacoesComponent } from '../solicitacoes/calendario-solicitacoes.component';
import { AcaoTecnica, CartaoTecnicaComponent } from './cartao-tecnica.component';
import { QuadroTecnicasComponent } from './quadro-tecnicas.component';

type Visao = 'lista' | 'quadro' | 'calendario';
interface EstadoTela { fila?: FilaTecnica; almoxarifado?: string | null; tipo?: string | null; filtros?: boolean; visao?: Visao }

const VISOES: OpcaoSegmento<Visao>[] = [
  { valor: 'lista', rotulo: 'Lista', icone: 'lista' },
  { valor: 'quadro', rotulo: 'Quadro', icone: 'quadro' },
  { valor: 'calendario', rotulo: 'Calendário', icone: 'calendario' },
];
const CHAVE_VISAO = 'ces_almox_visao_tecnica';

function lerVisao(): Visao {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    return v === 'quadro' || v === 'calendario' ? v : 'lista';
  } catch {
    return 'lista';
  }
}

/**
 * Fila técnica do almoxarifado no celular: o que separar, entregar e receber, com a OC/OS em
 * destaque em cada cartão. Lê o mesmo quadro do web (até 30 por etapa) e as ações são as que o
 * backend libera para a pessoa: separar, entregar (com assinaturas) e receber a devolução.
 */
@Component({
  selector: 'app-tecnicas-almox',
  standalone: true,
  imports: [
    AbasSecaoComponent, CalendarioSolicitacoesComponent, CartaoTecnicaComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, QuadroTecnicasComponent,
    SegmentadoComponent, SeletorComponent, TituloGrandeComponent, VazioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-titulo-grande titulo="Almoxarifado" [subtitulo]="subtitulo()">
      <ces-indicador-rede />
      <button type="button" class="ces-btn ces-btn--neutro ces-btn--compacto filtro" (click)="definir({ filtros: true })"
        [attr.aria-label]="'Filtros' + (filtrosAtivos() ? ', ' + filtrosAtivos() + ' ativos' : '')">
        <ces-icone nome="filtro" [tamanho]="18" />@if (filtrosAtivos()) { <span class="ces-num">{{ filtrosAtivos() }}</span> } @else { Filtrar }
      </button>
    </ces-titulo-grande>
    @if (abas().length > 1) { <ces-abas-secao rotulo="Almoxarifado" [abas]="abas()" /> }

    @if (!rede.isOnline()) {
      <ces-vazio icone="sem_rede" titulo="O almoxarifado precisa de internet" texto="Separar, entregar e receber dependem do saldo de agora no servidor. Conecte e a fila aparece aqui." />
    } @else {
      <div class="visoes">
        <ces-segmentado rotulo="Forma de ver" [opcoes]="visoes" [valor]="visao()" (valorChange)="definir({ visao: $event })" />
      </div>

      <div class="busca-oc">
        <ces-icone nome="busca" [tamanho]="18" />
        <input type="search" placeholder="Buscar pela OC ou OS" enterkeyhint="search" aria-label="Buscar pela OC ou OS" autocapitalize="characters"
          autocomplete="off" spellcheck="false" [value]="ocorrenciaDigitada()" (input)="ocorrenciaDigitada.set($any($event.target).value)">
        @if (ocorrenciaDigitada()) { <button type="button" class="ces-btn-icone limpar" (click)="ocorrenciaDigitada.set('')" aria-label="Limpar a busca"><ces-icone nome="fechar" [tamanho]="18" /></button> }
      </div>

      @if (visao() === 'lista') {
      <div class="atalhos" role="group" aria-label="Mostrar só a etapa escolhida">
        <button type="button" class="chip" [attr.aria-pressed]="fila() === 'abertas'" (click)="definir({ fila: 'abertas' })">
          <ces-icone nome="relogio" [tamanho]="16" />Em aberto<span class="conta ces-num" [class.alerta]="(abertas() ?? 0) > 0">{{ abertas() ?? '–' }}</span>
        </button>
        <span class="divisor" aria-hidden="true"></span>
        @for (f of filas; track f.valor) {
          <button type="button" class="chip" [attr.data-tom]="f.tom" [attr.aria-pressed]="fila() === f.valor" (click)="definir({ fila: f.valor })">
            <span class="ponto" aria-hidden="true"></span>{{ f.rotulo }}<span class="conta ces-num">{{ contagem(f.valor) ?? '–' }}</span>
          </button>
        }
      </div>

      }

      @if (resumoFiltros()) {
        <p class="recorte"><ces-icone nome="filtro" [tamanho]="16" /><span>{{ resumoFiltros() }}</span>
          <button type="button" class="ces-btn ces-btn--texto ces-btn--compacto" (click)="limparFiltros()">Limpar</button></p>
      }

      @if (visao() === 'calendario') {
        <app-calendario-solicitacoes #calendario [tecnico]="true" [filtroTecnico]="filtro()" [acoes]="rede.isOnline()" [ocupado]="ocupado()" (abrir)="abrir($event)" (agir)="agir($event)" />
      } @else if (erro()) {
        <ces-vazio icone="alerta" titulo="Não foi possível carregar a fila técnica" [texto]="erro()">
          <button type="button" class="ces-btn ces-btn--tonal" (click)="recarregar()">Tentar de novo</button>
        </ces-vazio>
      } @else if (visao() === 'quadro') {
        <app-quadro-tecnicas [quadro]="quadro()" [estoques]="estoques()" [carregando]="carregando()" [acoes]="rede.isOnline()" [ocupado]="ocupado()"
          (abrir)="abrir($event)" (agir)="agir($event)" />
      } @else if (carregando() && !quadro()) {
        <div class="ces-esqueletos" aria-busy="true" aria-label="Carregando">@for (i of [1, 2, 3, 4]; track i) { <div class="ces-esqueleto" style="height: 136px"></div> }</div>
      } @else if (grupos().length) {
        <div class="grupos" [class.atualizando]="carregando()">
          @for (g of grupos(); track g.chave) {
            <h2 class="ces-secao grupo-titulo"><span>{{ g.titulo }}</span><span class="ces-num">{{ g.total }}</span></h2>
            <div class="cartoes">
              @for (s of g.itens; track s.id) {
                <app-cartao-tecnica [attr.data-ancora]="s.id" [item]="s" [equipe]="equipe(s)" [acoes]="rede.isOnline()"
                  [ocupado]="ocupado()?.id === s.id ? ocupado()!.acao : null" (abrir)="abrir($event)" (agir)="agir($event)" />
              }
            </div>
            @if (g.total > g.itens.length) {
              <p class="fim ces-num">Mostrando {{ g.itens.length }} de {{ g.total }}. Busque pela OC/OS ou filtre para achar as demais.</p>
            }
          }
        </div>
      } @else {
        <ces-vazio icone="documento" [titulo]="fila() === 'abertas' && !filtrosAtivos() ? 'Nada aguardando o almoxarifado' : 'Nenhuma solicitação técnica neste recorte'"
          [texto]="fila() === 'abertas' && !filtrosAtivos() ? 'Não há material para separar, entregar nem devolução a receber.' : 'Tire algum filtro ou veja outra etapa.'">
          @if (fila() !== 'abertas' || filtrosAtivos()) { <button type="button" class="ces-btn ces-btn--tonal" (click)="verAbertas()">Ver em aberto</button> }
        </ces-vazio>
      }
      <div class="ces-respiro"></div>
    }

    <ces-folha [aberta]="folhaFiltros()" (fechar)="definir({ filtros: false })" titulo="Filtrar solicitações técnicas">
      <div class="campos">
        <ces-seletor rotulo="Almoxarifado de atendimento" placeholder="Todos" [opcoes]="opcoesAlmoxarifado()" [valor]="almoxarifado()" (valorChange)="definir({ almoxarifado: $event })" />
        <ces-seletor rotulo="Tipo de movimento" placeholder="Todos" [opcoes]="opcoesTipo" [valor]="tipo()" (valorChange)="definir({ tipo: $event })" />
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
    .visoes { padding: var(--ces-e3) var(--ces-e4) 0; }
    .busca-oc { display: flex; align-items: center; gap: var(--ces-e2); margin: var(--ces-e3) var(--ces-e4) 0; padding: 0 var(--ces-e2) 0 var(--ces-e4); min-height: 48px;
      border-radius: var(--ces-r-pilula); background: var(--ces-superficie); color: var(--ces-texto-2); box-shadow: inset 0 0 0 1px var(--ces-linha); }
    .busca-oc input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ces-texto); font: var(--ces-t-corpo); font-size: 1rem; }
    .busca-oc input:focus { outline: none; }
    .limpar { color: var(--ces-texto-3); }
    /* Os chips rolam de lado sem encostar na borda da tela (início e fim com o mesmo respiro). */
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
    .ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--ces-texto-3); flex: none; }
    [data-tom='atencao'] .ponto { background: var(--ces-atencao); }
    [data-tom='destaque'] .ponto { background: var(--ces-destaque); }
    [data-tom='ok'] .ponto { background: var(--ces-ok); }
    [data-tom='erro'] .ponto { background: var(--ces-erro); }
    .divisor { flex: none; width: 1px; align-self: stretch; margin: 6px 2px; background: var(--ces-linha-forte); }
    .recorte { display: flex; align-items: center; gap: var(--ces-e2); margin: var(--ces-e2) var(--ces-e4) 0; padding: 0 0 0 var(--ces-e4); min-height: 44px;
      border-radius: var(--ces-r-grupo); background: var(--ces-superficie); font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .recorte span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ces-texto); }
    .grupos { transition: opacity var(--ces-m-entrar); }
    .grupos.atualizando { opacity: .6; }
    .grupo-titulo { padding-top: var(--ces-e4); }
    .cartoes { display: grid; gap: var(--ces-e2); padding: 0 var(--ces-e4); }
    .fim { margin: var(--ces-e3) var(--ces-e4) 0; text-align: center; font: var(--ces-t-apoio); color: var(--ces-texto-3); }
    .campos { display: grid; gap: var(--ces-e3); padding: 0 var(--ces-e3) var(--ces-e2); }
    .campos ces-seletor { box-shadow: inset 0 0 0 1px var(--ces-linha); border-radius: var(--ces-r-grupo); }
  `],
})
export class TecnicasAlmoxComponent {
  private readonly almox = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly sessao = inject(SessaoService);
  private readonly toast = inject(ToastService);
  readonly rede = inject(ConnectivityService);

  readonly filas = FILAS;
  readonly opcoesTipo: OpcaoSeletor[] = TIPOS_TECNICOS.map(t => ({ valor: t.nome, rotulo: `${t.codigo} · ${t.rotulo}` }));

  private readonly salvo = this.sessao.estadoTela<EstadoTela>();
  readonly visoes = VISOES;
  readonly visao = signal<Visao>(this.salvo.visao ?? lerVisao());
  private readonly calendario = viewChild<CalendarioSolicitacoesComponent>('calendario');
  readonly fila = signal<FilaTecnica>(this.salvo.fila ?? 'abertas');
  readonly almoxarifado = signal<string | null>(this.salvo.almoxarifado ?? null);
  readonly tipo = signal<string | null>(this.salvo.tipo ?? null);
  readonly ocorrencia = signal('');
  readonly ocorrenciaDigitada = signal('');
  readonly folhaFiltros = signal(!!this.salvo.filtros);

  readonly estoques = signal<Estoque[]>([]);
  readonly quadro = signal<KanbanTecnico | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly ocupado = signal<{ id: string; acao: AcaoTecnica } | null>(null);
  private readonly versao = signal(0);

  /** Total e itens de cada subetapa do quadro. */
  private readonly subColunas = computed(() => {
    const mapa = new Map<SubEtapaKanban, { total: number; itens: ResumoSolicitacao[] }>();
    for (const c of this.quadro()?.colunas ?? []) for (const s of c.subColunas ?? []) mapa.set(s.subEtapa, { total: s.total ?? 0, itens: s.itens ?? [] });
    return mapa;
  });
  readonly abertas = computed(() => (this.quadro() ? this.somar(SUBETAPAS_ABERTAS) : null));
  readonly abas = abasAlmox(null, () => this.abertas());
  readonly subtitulo = computed(() => {
    const atrasadas = [...this.subColunas().entries()].filter(([k]) => SUBETAPAS_ABERTAS.includes(k)).flatMap(([, v]) => v.itens).filter(s => s.tecnico?.atrasada).length;
    return atrasadas ? `${atrasadas} com saque atrasado` : 'Solicitações técnicas';
  });

  /** "Em aberto" mostra um bloco por etapa; as demais, um bloco só. */
  readonly grupos = computed(() => {
    const blocos = this.fila() === 'abertas' ? FILAS.filter(f => f.subEtapas.some(s => SUBETAPAS_ABERTAS.includes(s))) : FILAS.filter(f => f.valor === this.fila());
    return blocos.map(f => {
      const itens = f.subEtapas.flatMap(s => this.subColunas().get(s)?.itens ?? []);
      return { chave: f.valor, titulo: f.rotulo, total: this.somar(f.subEtapas), itens };
    }).filter(g => g.itens.length);
  });

  readonly opcoesAlmoxarifado = computed<OpcaoSeletor[]>(() => this.estoques().filter(ehAlmoxarifado).map(e => ({ valor: e.id, rotulo: e.nomeIdentificador })));
  readonly filtrosAtivos = computed(() => [this.almoxarifado(), this.tipo()].filter(Boolean).length);
  readonly resumoFiltros = computed(() => [
    this.almoxarifado() ? this.estoques().find(e => e.id === this.almoxarifado())?.nomeIdentificador ?? 'Almoxarifado' : '',
    this.tipo() ? TIPOS_TECNICOS.find(t => t.nome === this.tipo())?.rotulo ?? '' : '',
  ].filter(Boolean).join(' · '));

  readonly filtro = computed<FiltroTecnicas>(() => ({
    idAlmoxarifado: this.almoxarifado(), tipoTecnico: this.tipo(), ocorrencia: this.ocorrencia().trim() || null,
  }), { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });

  constructor() {
    this.almox.estoques().subscribe(e => this.estoques.set(e));
    this.almox.carregarNomes();
    toObservable(this.ocorrenciaDigitada).pipe(debounceTime(450), takeUntilDestroyed()).subscribe(v => this.ocorrencia.set(v.trim().toUpperCase()));

    combineLatest([toObservable(this.filtro), toObservable(this.versao)]).pipe(
      tap(() => this.erro.set(null)),
      switchMap(([f]) => {
        if (!this.rede.isOnline()) return of(null);
        this.carregando.set(true);
        return this.almox.quadroTecnico(f).pipe(
          tap(q => this.quadro.set(q)),
          catchError((e: ApiError) => { this.erro.set(e?.detail || 'Verifique a conexão e tente de novo.'); return of(null); }),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(() => this.carregando.set(false));

    let estavaOnline = this.rede.isOnline();
    effect(() => {
      const online = this.rede.isOnline();
      if (online && !estavaOnline) untracked(() => this.recarregar());
      estavaOnline = online;
    });
  }

  contagem(fila: FilaTecnica): number | null {
    return this.quadro() ? this.somar(subEtapasDaFila(fila)) : null;
  }

  private somar(subEtapas: readonly SubEtapaKanban[]): number {
    return subEtapas.reduce((a, s) => a + (this.subColunas().get(s)?.total ?? 0), 0);
  }

  equipe(s: ResumoSolicitacao): string | null {
    return nomeEquipe(this.estoques(), s.tecnico?.idEquipe ?? s.idEquipe);
  }

  definir(m: Partial<EstadoTela>): void {
    if (m.visao !== undefined) {
      this.visao.set(m.visao);
      try { localStorage.setItem(CHAVE_VISAO, m.visao); } catch { /* preferência opcional */ }
    }
    if (m.fila !== undefined) this.fila.set(m.fila);
    if (m.almoxarifado !== undefined) this.almoxarifado.set(m.almoxarifado);
    if (m.tipo !== undefined) this.tipo.set(m.tipo);
    if (m.filtros !== undefined) this.folhaFiltros.set(m.filtros);
    this.sessao.definirEstadoTela({ ...m });
  }

  limparFiltros(): void {
    this.definir({ almoxarifado: null, tipo: null });
  }

  verAbertas(): void {
    this.ocorrenciaDigitada.set('');
    this.definir({ fila: 'abertas', almoxarifado: null, tipo: null });
  }

  recarregar(): void {
    this.versao.update(v => v + 1);
    this.calendario()?.recarregar();
  }

  abrir(s: ResumoSolicitacao): void {
    void this.router.navigate(['/almox/tecnicas', s.id]);
  }

  agir(e: { acao: AcaoTecnica; item: ResumoSolicitacao }): void {
    if (e.acao === 'entregar') { void this.router.navigate(['/almox/tecnicas', e.item.id, 'entrega']); return; }
    if (e.acao === 'receber') { void this.router.navigate(['/almox/tecnicas', e.item.id, 'devolucao']); return; }
    if (this.ocupado()) return;
    const versao = e.item.tecnico?.versao ?? e.item.versao ?? 0;
    const t = tituloTecnica(e.item);
    const nome = t.ocorrencia ?? `#${idCurto(e.item.id)}`;
    this.ocupado.set({ id: e.item.id, acao: e.acao });
    const chamada = e.acao === 'iniciar' ? this.almox.iniciarSeparacao(e.item.id, versao) : this.almox.concluirSeparacao(e.item.id, versao);
    chamada.subscribe({
      next: () => {
        this.ocupado.set(null);
        this.toast.success(e.acao === 'iniciar' ? `Separação de ${nome} iniciada.` : `${nome} separada. Agora aguarda a retirada.`);
        this.recarregar();
      },
      error: (err: ApiError) => {
        this.ocupado.set(null);
        if (err.status === 409) { this.toast.warning('Outra pessoa alterou esta solicitação. A fila foi atualizada.'); this.recarregar(); }
        else this.toast.error(err.detail || 'Não foi possível atualizar a separação.');
      },
    });
  }
}
