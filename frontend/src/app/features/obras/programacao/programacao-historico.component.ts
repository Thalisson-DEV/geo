import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  geoFilter,
  geoListState
} from '@geo/ui';
import { catchError, debounceTime, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { getErrorMessage } from '../../../core/models/shared.models';
import { EventoProgramacao, TipoEventoProgramacao } from '../../../core/models/obras-programacao.models';
import { ObrasProgramacaoService } from '../../../core/services/obras-programacao.service';
import { LIMITE_EXPORTACAO, dataIso, dataLocal, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';
import { formatarDataHora } from '../obras-ui';
import { ProgramacaoDetalheComponent } from './programacao-detalhe.component';
import { MudancaEvento, TIPO_EVENTO, lerEvento } from './programacao.logic';

const ORDEM_TIPOS: TipoEventoProgramacao[] = ['CRIADA', 'REPROGRAMADA', 'EDITADA', 'CANCELADA', 'EXCLUIDA'];
const TIPOS: GeoSelectOption<TipoEventoProgramacao>[] = ORDEM_TIPOS.map((value) => ({ value, label: TIPO_EVENTO[value].rotulo }));
const POR_PAGINA_LINHA = 30;

type MudouFiltro = 'EQUIPE' | 'PERIODO';
type VisaoHistorico = 'linha' | 'tabela';
const OPCOES_MUDOU: GeoSelectOption<MudouFiltro | null>[] = [
  { label: 'Qualquer mudança', value: null },
  { label: 'Trocou de equipe', value: 'EQUIPE' },
  { label: 'Mudou o período', value: 'PERIODO' }
];

function periodo(inicio?: string | null, fim?: string | null): string {
  return inicio ? (fim && fim !== inicio ? `${inicio} a ${fim}` : inicio) : '—';
}

interface EventoLido {
  e: EventoProgramacao;
  mudancas: MudancaEvento[];
  motivo: string | null;
  hora: string;
}

interface DiaDaLinha {
  dia: string;
  eventos: EventoLido[];
}

/** "04/11/2026 09:12" → dia e hora separados, para agrupar a linha do tempo por dia. */
function separarDataHora(iso: string): { dia: string; hora: string } {
  const texto = formatarDataHora(iso);
  const [dia, hora] = texto.split(' ');
  return { dia: dia ?? texto, hora: hora ?? '' };
}

function rotuloDia(dia: string): string {
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  if (dia === fmt(hoje)) return `Hoje · ${dia}`;
  if (dia === fmt(ontem)) return `Ontem · ${dia}`;
  return dia;
}

/**
 * Histórico da programação: da criação ao cancelamento, quem mudou o quê, quando e por quê. A linha do tempo lê
 * como uma conversa (o que mudou, antes → depois, e o motivo); a tabela serve para filtrar, ordenar e exportar.
 */
@Component({
  selector: 'app-programacao-historico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    ProgramacaoDetalheComponent
  ],
  template: `
    <div class="geo-page">
      <geo-page-header title="Programação" icon="pi pi-calendar"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Programação', route: '/obras/programacao' }, { label: 'Histórico' }]"
        description="Criações, edições, reprogramações, cancelamentos e exclusões: o que mudou, antes e depois, quem e por quê."></geo-page-header>


      <geo-filter-panel #painel storageKey="obras-programacao-historico" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading() || linha().carregando" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-multiselect label="Tipo de evento" [options]="tipos" [(value)]="lista.filters.tipos" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-select label="O que mudou" [options]="opcoesMudou" [(value)]="lista.filters.mudou"></geo-select>
          <geo-text-input label="Obra" [(value)]="lista.filters.obra" placeholder="Número da obra"></geo-text-input>
          <geo-text-input label="Equipe" [(value)]="lista.filters.equipe" placeholder="De origem ou de destino"></geo-text-input>
          <geo-text-input label="Usuário" [(value)]="lista.filters.usuario" placeholder="Quem alterou"></geo-text-input>
          <geo-text-input label="Programação nº" [value]="lista.filters.programacao() ? '' + lista.filters.programacao() : ''" (valueChange)="definirProgramacao($event)" placeholder="Ex.: 1687"></geo-text-input>
          <geo-datepicker label="Alteradas a partir de" [value]="dataLocal(lista.filters.periodo().from)" [clearable]="true" (valueChange)="definirPeriodo('from', $any($event))"></geo-datepicker>
          <geo-datepicker label="Alteradas até" [value]="dataLocal(lista.filters.periodo().to)" [clearable]="true" (valueChange)="definirPeriodo('to', $any($event))"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <div class="hist-barra">
        <div class="geo-quick-filters" role="group" aria-label="Mostrar só os tipos escolhidos">
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="!tiposAplicados().length" (click)="definirTipos([])">
            Todos <span class="hist-contagem">{{ contagemTotal() ?? '–' }}</span>
          </button>
          <span class="hist-divisor" aria-hidden="true"></span>
          @for (t of ordemTipos; track t) {
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="tiposAplicados().includes(t)" [attr.data-tone]="tipoEvento[t].tom" (click)="alternarTipo(t)"
              [attr.aria-label]="tipoEvento[t].rotulo + ': ' + (contagens()[t] ?? 'contagem indisponível')">
              <i [class]="tipoEvento[t].icone" aria-hidden="true"></i> {{ tipoEvento[t].rotulo }} <span class="hist-contagem">{{ contagens()[t] ?? '–' }}</span>
            </button>
          }
        </div>
        <nav class="hist-visoes" aria-label="Forma de visualizar">
          <button type="button" [attr.aria-current]="visao() === 'linha' ? 'page' : null" (click)="trocarVisao('linha')"><i class="pi pi-list" aria-hidden="true"></i>Linha do tempo</button>
          <button type="button" [attr.aria-current]="visao() === 'tabela' ? 'page' : null" (click)="trocarVisao('tabela')"><i class="pi pi-table" aria-hidden="true"></i>Tabela</button>
        </nav>
      </div>

      @if (visao() === 'linha') {
        <section class="hist-card" aria-label="Linha do tempo das mudanças">
          <div class="hist-card__topo">
            <geo-text-input class="hist-busca" label="Buscar" [labelVisible]="false" placeholder="Obra, equipe, nº da programação, usuário ou motivo" [(value)]="lista.query"></geo-text-input>
            <span class="hist-card__total" aria-live="polite">{{ linha().total }} {{ linha().total === 1 ? 'evento' : 'eventos' }}</span>
          </div>
          @if (linha().erro; as mensagem) {
            <geo-async-state state="error" title="Não foi possível carregar o histórico" [description]="mensagem" actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="recarregarLinha()"></geo-async-state>
          } @else if (linha().carregando && !linha().eventos.length) {
            <geo-async-state state="loading" title="Carregando o histórico" [compact]="true"></geo-async-state>
          } @else if (!linha().eventos.length) {
            <geo-async-state state="empty" icon="pi pi-history" [title]="lista.filtered() ? 'Nenhum evento com esse recorte' : 'Nenhuma programação foi registrada ainda'"
              [description]="lista.filtered() ? 'Ajuste ou limpe os filtros para ver mais eventos.' : 'Criações, edições, reprogramações e cancelamentos aparecem aqui.'"></geo-async-state>
          } @else {
            @for (grupo of dias(); track grupo.dia) {
              <h3 class="hist-dia">{{ rotuloDia(grupo.dia) }}</h3>
              <ol class="hist-linha">
                @for (ev of grupo.eventos; track ev.e.id) {
                  <li class="hist-evento" [attr.data-tone]="tipoEvento[ev.e.tipo].tom">
                    <span class="hist-evento__marca" aria-hidden="true"><i [class]="tipoEvento[ev.e.tipo].icone"></i></span>
                    <article class="hist-evento__corpo">
                      <header class="hist-evento__topo">
                        <geo-status [tone]="tipoEvento[ev.e.tipo].tom" [icon]="tipoEvento[ev.e.tipo].icone">{{ tipoEvento[ev.e.tipo].rotulo }}</geo-status>
                        @if (ev.e.tipo !== 'EXCLUIDA') {
                          <button type="button" class="hist-link" (click)="abrir(ev.e)">Programação #{{ ev.e.numeroProgramacao }}</button>
                        } @else {
                          <span class="hist-numero">Programação #{{ ev.e.numeroProgramacao }}</span>
                        }
                        <span class="hist-sep" aria-hidden="true">·</span>
                        <a class="hist-link" [routerLink]="['/obras', ev.e.idObra]">Obra {{ ev.e.numeroObra }}</a>
                        <span class="hist-evento__quem"><i class="pi pi-user" aria-hidden="true"></i> {{ ev.e.usuario ?? 'Sistema' }} · {{ ev.hora }}</span>
                      </header>
                      @if (ev.mudancas.length) {
                        <dl class="hist-mudancas">
                          @for (m of ev.mudancas; track m.campo) {
                            <div>
                              <dt>{{ m.campo }}</dt>
                              <dd>
                                @if (m.antes !== undefined) {
                                  <del>{{ m.antes ?? 'vazio' }}</del>
                                  <i class="pi pi-arrow-right" aria-label="para"></i>
                                }
                                <ins>{{ m.depois ?? 'vazio' }}</ins>
                              </dd>
                            </div>
                          }
                        </dl>
                      }
                      @if (ev.motivo) {
                        <p class="hist-motivo"><span>{{ ev.e.tipo === 'CRIADA' ? 'Descrição' : 'Motivo' }}:</span> {{ ev.motivo }}</p>
                      }
                    </article>
                  </li>
                }
              </ol>
            }
            @if (linha().eventos.length < linha().total) {
              <div class="hist-mais">
                <geo-button variant="outline" icon="pi pi-angle-down" [label]="'Carregar mais ' + Math.min(porPagina, linha().total - linha().eventos.length)" [loading]="linha().carregando" (pressed)="carregarMais()"></geo-button>
              </div>
            }
          }
        </section>
      } @else {
        <geo-data-table
          title="Eventos"
          mode="server"
          storageKey="obras-programacao-historico"
          exportFileName="historico-programacoes"
          searchPlaceholder="Obra, equipe, programação, usuário ou motivo"
          rowActionLabel="Abrir programação"
          rowActionIcon="pi pi-eye"
          noResultsTitle="Nenhum evento com esse recorte."
          [columns]="colunas"
          [rows]="resultado.rows()"
          [totalRecords]="resultado.total()"
          [rowLabel]="rotulo"
          [state]="resultado.state()"
          [stateTitle]="resultado.error() ? 'Não foi possível carregar o histórico' : 'Nenhuma programação foi registrada ainda'"
          [stateDescription]="resultado.error() ?? 'Criações, edições, reprogramações, cancelamentos e exclusões aparecem aqui.'"
          [filtered]="lista.filtered()"
          [exportRows]="exportar"
          [exportLimit]="limiteExportacao"
          [(page)]="lista.page"
          [(pageSize)]="lista.pageSize"
          [(sort)]="lista.sort"
          [(query)]="lista.query"
          (lazyLoad)="lista.load($event)"
          (adjustFilters)="painel.expandAndFocus()"
          (clearFilters)="lista.reset()"
          (rowActivate)="abrir($event)"
        >
          <ng-template geoCell="tipo" let-row>
            <geo-status [tone]="tipoDe(row).tom" [icon]="tipoDe(row).icone">{{ tipoDe(row).rotulo }}</geo-status>
          </ng-template>
        </geo-data-table>
      }
    </div>

    <app-programacao-detalhe [(aberto)]="detalheAberto" [idProgramacao]="idDetalhe()" (alterada)="recarregarTudo()"></app-programacao-detalhe>
  `,
  styles: [`
    .hist-barra { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
    .hist-contagem { display: inline-flex; align-items: center; justify-content: center; min-width: 1.375rem; height: 1.25rem; padding: 0 0.375rem; border-radius: 999px; background: var(--geo-surface-muted); color: var(--geo-foreground-muted); font-size: 0.7rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .geo-quick-filter[aria-pressed='true'] .hist-contagem { background: var(--geo-surface); color: var(--geo-foreground); }
    .hist-divisor { width: 1px; align-self: stretch; margin: 0.25rem 0.125rem; background: var(--geo-border); }
    .geo-quick-filters .pi { font-size: 0.75rem; }
    .geo-quick-filters [data-tone='info'] .pi { color: var(--geo-info); }
    .geo-quick-filters [data-tone='warning'] .pi { color: var(--geo-warning); }
    .geo-quick-filters [data-tone='danger'] .pi { color: var(--geo-danger); }
    .geo-quick-filters [data-tone='success'] .pi { color: var(--geo-success); }
    .hist-visoes { display: inline-flex; flex: none; padding: 2px; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-muted); }
    .hist-visoes button { display: inline-flex; gap: 0.375rem; align-items: center; min-height: calc(var(--geo-control-height-sm) - 2px); padding: 0 0.75rem; border: 0; border-radius: calc(var(--geo-radius-md) - 2px); background: transparent; color: var(--geo-foreground-muted); font: inherit; font-size: var(--geo-font-control); font-weight: 600; cursor: pointer; }
    .hist-visoes button:hover { color: var(--geo-foreground); }
    .hist-visoes button[aria-current='page'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-shadow-sm); }
    .hist-visoes button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .hist-visoes .pi { font-size: 0.8rem; }
    .hist-card { padding: 1rem 1.25rem 1.25rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-xl); background: var(--geo-surface); box-shadow: var(--geo-shadow-sm); }
    .hist-card__topo { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .hist-busca { width: min(28rem, 100%); }
    .hist-card__total { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-variant-numeric: tabular-nums; }
    .hist-dia { position: sticky; top: 0; z-index: 1; margin: 1rem 0 0.5rem; padding: 0.25rem 0; background: var(--geo-surface); color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
    .hist-linha { margin: 0; padding: 0; list-style: none; }
    .hist-evento { position: relative; display: flex; gap: 0.75rem; padding-bottom: 0.75rem; }
    .hist-evento:not(:last-child)::before { position: absolute; top: 2rem; bottom: 0; left: 0.9375rem; width: 1px; background: var(--geo-border); content: ''; }
    .hist-evento__marca { display: grid; flex: none; width: 2rem; height: 2rem; place-items: center; border-radius: 999px; background: var(--geo-surface-muted); color: var(--geo-foreground-muted); font-size: 0.8rem; }
    .hist-evento[data-tone='info'] .hist-evento__marca { background: var(--geo-info-soft); color: var(--geo-info-text); }
    .hist-evento[data-tone='warning'] .hist-evento__marca { background: var(--geo-warning-soft); color: var(--geo-warning-text); }
    .hist-evento[data-tone='danger'] .hist-evento__marca { background: var(--geo-danger-soft); color: var(--geo-danger-text); }
    .hist-evento[data-tone='success'] .hist-evento__marca { background: var(--geo-success-soft); color: var(--geo-success-text); }
    .hist-evento__corpo { flex: 1; min-width: 0; padding: 0.625rem 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .hist-evento__topo { display: flex; flex-wrap: wrap; gap: 0.375rem 0.5rem; align-items: center; font-size: var(--geo-font-control); }
    .hist-evento__quem { display: inline-flex; gap: 0.375rem; align-items: center; margin-left: auto; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .hist-evento__quem .pi { font-size: 0.7rem; }
    .hist-link { padding: 0; border: 0; background: transparent; color: var(--geo-brand); font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
    .hist-link:hover { text-decoration: underline; }
    .hist-link:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .hist-numero { font-weight: 700; }
    .hist-sep { color: var(--geo-foreground-muted); }
    .hist-mudancas { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.375rem 1rem; margin: 0.5rem 0 0; }
    .hist-mudancas dt { color: var(--geo-foreground-muted); font-size: 0.6875rem; font-weight: 600; }
    .hist-mudancas dd { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; margin: 0; font-size: var(--geo-font-control); }
    .hist-mudancas del { color: var(--geo-foreground-muted); }
    .hist-mudancas ins { font-weight: 600; text-decoration: none; }
    .hist-mudancas .pi { color: var(--geo-foreground-muted); font-size: 0.625rem; }
    .hist-motivo { margin: 0.5rem 0 0; padding: 0.375rem 0.625rem; border-left: 3px solid var(--geo-border); background: var(--geo-surface-subtle); font-size: var(--geo-font-control); }
    .hist-motivo span { color: var(--geo-foreground-muted); font-weight: 600; }
    .hist-mais { display: flex; justify-content: center; margin-top: 0.5rem; }
    @media (max-width: 40rem) {
      .hist-evento__quem { margin-left: 0; width: 100%; }
      .hist-card { padding: 0.75rem; }
    }
  `]
})
export class ProgramacaoHistoricoComponent {
  private readonly api = inject(ObrasProgramacaoService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tipos = TIPOS;
  protected readonly ordemTipos = ORDEM_TIPOS;
  protected readonly tipoEvento = TIPO_EVENTO;
  protected readonly opcoesMudou = OPCOES_MUDOU;
  protected readonly dataLocal = dataLocal;
  protected readonly rotuloDia = rotuloDia;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly porPagina = POR_PAGINA_LINHA;
  protected readonly Math = Math;
  protected readonly detalheAberto = signal(false);
  protected readonly idDetalhe = signal<string | null>(null);
  protected readonly visao = signal<VisaoHistorico>(this.rota.snapshot.queryParamMap.get('visao') === 'tabela' ? 'tabela' : 'linha');

  protected readonly lista = geoListState({
    storageKey: 'obras-programacao-historico',
    filters: {
      tipos: geoFilter.list<TipoEventoProgramacao>([], { label: 'Tipo', param: 'tipo', itemLabel: (t) => TIPO_EVENTO[t].rotulo }),
      mudou: geoFilter.value<MudouFiltro | null>(null, { label: 'O que mudou', param: 'mudou', options: () => OPCOES_MUDOU }),
      obra: geoFilter.value<string>('', { label: 'Obra', param: 'obra' }),
      equipe: geoFilter.value<string>('', { label: 'Equipe', param: 'equipe' }),
      usuario: geoFilter.value<string>('', { label: 'Usuário', param: 'usuario' }),
      programacao: geoFilter.value<number | null>(null, { label: 'Programação', param: 'programacao', type: 'number', format: (n) => (n ? `#${n}` : null) }),
      periodo: geoFilter.range({ from: null, to: null }, { label: 'Alteração', param: 'periodo' })
    },
    sort: [{ key: 'dataCriacao', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<EventoProgramacao>(
    (pedido) => this.api.historico({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = exportacaoPadrao((pagina) => this.api.historico({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<EventoProgramacao>[] = [
    { key: 'data', header: 'Data e hora', sortField: 'dataCriacao', priority: 1, value: (e) => e.data, display: (e) => formatarDataHora(e.data) },
    { key: 'tipo', header: 'Tipo', type: 'custom', sortField: 'tipo', priority: 1, value: (e) => TIPO_EVENTO[e.tipo].rotulo },
    { key: 'numeroProgramacao', header: 'Programação', sortField: 'numeroProgramacao', priority: 1, value: (e) => e.numeroProgramacao, display: (e) => `#${e.numeroProgramacao}` },
    { key: 'numeroObra', header: 'Obra', sortField: 'numeroObra', priority: 1, value: (e) => e.numeroObra },
    { key: 'equipeOrigem', header: 'Equipe de origem', sortField: 'equipeOrigem', value: (e) => e.equipeOrigem },
    { key: 'equipeDestino', header: 'Equipe de destino', sortField: 'equipeDestino', value: (e) => e.equipeDestino },
    { key: 'periodoOriginal', header: 'Período original', value: (e) => periodo(e.inicioOriginal, e.fimOriginal) },
    { key: 'periodoNovo', header: 'Período novo', value: (e) => periodo(e.inicioNovo, e.fimNovo) },
    { key: 'usuario', header: 'Usuário', sortField: 'usuarioCriacao', value: (e) => e.usuario },
    { key: 'observacao', header: 'Motivo ou mudança', value: (e) => e.observacao }
  ];

  protected readonly rotulo = (e: EventoProgramacao): string => `Programação ${e.numeroProgramacao}, ${TIPO_EVENTO[e.tipo].rotulo}`;

  protected readonly tiposAplicados = computed(() => this.lista.applied().tipos);
  /** Quantos eventos há de cada tipo no recorte, ignorando os atalhos, para o número não sumir ao filtrar. */
  protected readonly contagens = signal<Partial<Record<TipoEventoProgramacao, number>>>({});
  protected readonly contagemTotal = computed(() => {
    const c = this.contagens();
    return ORDEM_TIPOS.every((t) => c[t] !== undefined) ? ORDEM_TIPOS.reduce((soma, t) => soma + (c[t] ?? 0), 0) : null;
  });

  /** Linha do tempo: páginas acumuladas ("Carregar mais"), recomeçando a cada mudança do recorte ou da busca. */
  protected readonly linha = signal<{ eventos: EventoProgramacao[]; total: number; pagina: number; carregando: boolean; erro: string | null }>(
    { eventos: [], total: 0, pagina: 0, carregando: true, erro: null }
  );
  private readonly recargaLinha = signal(0);
  protected readonly dias = computed<DiaDaLinha[]>(() => {
    const grupos = new Map<string, EventoLido[]>();
    for (const e of this.linha().eventos) {
      const { dia, hora } = separarDataHora(e.data);
      const lido = { e, hora, ...lerEvento(e) };
      grupos.set(dia, [...(grupos.get(dia) ?? []), lido]);
    }
    return [...grupos].map(([dia, eventos]) => ({ dia, eventos }));
  });

  constructor() {
    const consulta = computed(() => {
      const { tipos: _tipos, ...semTipo } = this.filtro();
      return semTipo;
    }, { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
    toObservable(consulta)
      .pipe(
        switchMap((filtro) => forkJoin(ORDEM_TIPOS.map((tipo) =>
          this.api.historico({ ...filtro, tipos: [tipo], page: 0, size: 1 }).pipe(
            map((r) => [tipo, r.page?.totalElements ?? 0] as const),
            catchError(() => of([tipo, undefined] as const))
          )
        ))),
        takeUntilDestroyed()
      )
      .subscribe((pares) => this.contagens.set(Object.fromEntries(pares.filter(([, n]) => n !== undefined))));

    const consultaLinha = computed(() => ({ filtro: this.filtro(), recarga: this.recargaLinha() }), {
      equal: (a, b) => JSON.stringify(a) === JSON.stringify(b)
    });
    toObservable(consultaLinha)
      .pipe(
        debounceTime(250),
        tap(() => this.linha.update((l) => ({ ...l, carregando: true, erro: null }))),
        switchMap(({ filtro }) => this.api.historico({ ...filtro, page: 0, size: POR_PAGINA_LINHA, sort: 'dataCriacao,desc' }).pipe(
          map((r) => ({ eventos: r.content ?? [], total: r.page?.totalElements ?? 0, pagina: 0, carregando: false, erro: null as string | null })),
          catchError((e) => of({ eventos: [] as EventoProgramacao[], total: 0, pagina: 0, carregando: false, erro: getErrorMessage(e) }))
        )),
        takeUntilDestroyed()
      )
      .subscribe((estado) => this.linha.set(estado));
  }

  /** Filtros aplicados e busca. A busca vale nas duas visões: a tabela e a linha do tempo leem o mesmo campo. */
  private filtro() {
    const f = this.lista.applied();
    return {
      tipos: f.tipos,
      mudou: f.mudou,
      obra: f.obra.trim() || null,
      equipe: f.equipe.trim() || null,
      usuario: f.usuario.trim() || null,
      programacao: f.programacao,
      de: f.periodo.from,
      ate: f.periodo.to,
      q: this.lista.query().trim() || null
    };
  }

  protected carregarMais(): void {
    const atual = this.linha();
    const proxima = atual.pagina + 1;
    this.linha.set({ ...atual, carregando: true });
    this.api.historico({ ...this.filtro(), page: proxima, size: POR_PAGINA_LINHA, sort: 'dataCriacao,desc' }).subscribe({
      next: (r) => this.linha.update((l) => ({ ...l, eventos: [...l.eventos, ...(r.content ?? [])], total: r.page?.totalElements ?? l.total, pagina: proxima, carregando: false })),
      error: (e) => this.linha.update((l) => ({ ...l, carregando: false, erro: getErrorMessage(e) }))
    });
  }

  protected recarregarLinha(): void {
    this.recargaLinha.update((n) => n + 1);
  }

  protected recarregarTudo(): void {
    this.lista.reload();
    this.recarregarLinha();
  }

  protected trocarVisao(visao: VisaoHistorico): void {
    this.visao.set(visao);
    void this.router.navigate([], { relativeTo: this.rota, queryParams: { visao: visao === 'tabela' ? 'tabela' : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected definirTipos(tipos: readonly TipoEventoProgramacao[]): void {
    this.lista.set('tipos', [...tipos]);
  }

  /** Atalho: liga ou desliga o tipo, somando aos já escolhidos. */
  protected alternarTipo(tipo: TipoEventoProgramacao): void {
    const atuais = this.tiposAplicados();
    const proximos = atuais.includes(tipo) ? atuais.filter((t) => t !== tipo) : [...atuais, tipo];
    this.definirTipos(ORDEM_TIPOS.filter((t) => proximos.includes(t)));
  }

  protected definirProgramacao(texto: string): void {
    const numero = Number(texto.replace(/\D/g, ''));
    this.lista.filters.programacao.set(numero > 0 ? numero : null);
  }

  protected definirPeriodo(ponta: 'from' | 'to', data: Date | null): void {
    const atual = this.lista.filters.periodo();
    const valor = dataIso(data);
    if (atual[ponta] !== valor) this.lista.filters.periodo.set({ ...atual, [ponta]: valor });
  }

  protected tipoDe(evento: EventoProgramacao) {
    return TIPO_EVENTO[evento.tipo];
  }

  protected abrir(evento: EventoProgramacao): void {
    if (evento.tipo === 'EXCLUIDA') return;
    this.idDetalhe.set(evento.idProgramacao);
    this.detalheAberto.set(true);
  }
}
