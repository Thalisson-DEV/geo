import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  geoAttainmentBand,
  geoFilter,
  geoListState
} from '@geo/ui';
import { map, take, tap } from 'rxjs';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FiltroTurnosObra, IndicadoresTurnosObra, MetaTurnoFiltro, StatusTurnoObra, TurnoObraDetalhe, TurnoObraLinha } from '../../../core/models/obras-turnos.models';
import { ObrasTurnosService } from '../../../core/services/obras-turnos.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { duracao, percentual } from '../../execucao/dashboards/execucao-dashboards.utils';
import { RecorteDashboardService } from '../../execucao/dashboards/recorte-dashboard.service';
import { situacaoDoTurno } from '../../execucao/turno-list/turno-list.utils';
import { formatarMoeda, AJUSTE_TEXTO_LISTAGEM } from '../obras-ui';
import { horasTotais } from './turnos-obra.logic';

const STATUS: GeoSelectOption<StatusTurnoObra | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Em turno', value: 'ABERTO' },
  { label: 'Encerrado', value: 'FECHADO' }
];
const METAS: GeoSelectOption<MetaTurnoFiltro | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Bateu a meta', value: 'BATEU' },
  { label: 'Não bateu a meta', value: 'NAO_BATEU' }
];
const DIAS_PADRAO = 30;

function inicioPadrao(): string {
  const d = new Date();
  d.setDate(d.getDate() - DIAS_PADRAO);
  return dataIso(d)!;
}

/** Turnos das equipes de Obras, no molde da listagem de turnos do comercial, com o executado vindo dos apontamentos. */
@Component({
  selector: 'app-turnos-obra',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AjudaListagemComponent,
  ],
  template: `
    <div class="geo-page" geoListShortcuts>
      <geo-page-header title="Turnos" icon="pi pi-calendar-clock"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Turnos' }]"
        description="Jornadas das equipes de Obras: quem trabalhou, em quais obras, quanto executou contra a meta do dia e o que foi registrado."
        helpLabel="Ajuda sobre turnos" (help)="ajuda.show()">
        <geo-button actions label="Boletim" icon="pi pi-th-large" variant="outline" (pressed)="irParaBoletim()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="obras-turnos" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Equipe" [options]="equipes()" [(value)]="lista.filters.idEquipe" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-text-input label="Obra" placeholder="Número da obra" [value]="lista.filters.obra()" (valueChange)="lista.filters.obra.set($event)"></geo-text-input>
          <geo-multiselect label="Base operacional" [options]="recorte.opcoesBases()" [(value)]="lista.filters.idBaseOperacional" [clearable]="true"
            selectedItemsLabel="{0} bases" [maxSelectedLabels]="2" [loading]="recorte.carregando()" placeholder="Todas"></geo-multiselect>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.status"></geo-select>
          <geo-select label="Meta do dia" [options]="metaOpcoes" [(value)]="lista.filters.meta"></geo-select>
          <geo-datepicker label="Abertos a partir de" [value]="dataLocal(lista.filters.abertura().from)" [clearable]="true" (valueChange)="abertura('from', $event)"></geo-datepicker>
          <geo-datepicker label="Abertos até" [value]="dataLocal(lista.filters.abertura().to)" [clearable]="true" [minDate]="dataLocal(lista.filters.abertura().from)"
            (valueChange)="abertura('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <section class="geo-kpis turnos-kpis" aria-label="Indicadores dos turnos" aria-live="polite">
        <button type="button" class="geo-kpi" data-tone="info" [attr.aria-pressed]="semAtalho()" (click)="limparAtalhos()">
          <span class="geo-kpi__icon"><i class="pi pi-calendar-clock" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Turnos</span>
            <span class="geo-kpi__value">{{ ind().turnos }}</span>
            <span class="geo-kpi__detail">{{ horas(ind().minutosTotais) }} no total</span></span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="ind().emAndamento ? 'success' : 'neutral'" [attr.aria-pressed]="lista.applied().status === 'ABERTO'" (click)="alternarStatus('ABERTO')">
          <span class="geo-kpi__icon"><i class="pi pi-play-circle" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Em andamento</span>
            <span class="geo-kpi__value">{{ ind().emAndamento }}</span>
            <span class="geo-kpi__detail">Ainda não fechados</span></span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="ind().comMeta && ind().bateuMeta === ind().comMeta ? 'success' : 'neutral'" [attr.aria-pressed]="lista.applied().meta === 'BATEU'" (click)="alternarMeta('BATEU')">
          <span class="geo-kpi__icon"><i class="pi pi-flag" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Bateu a meta</span>
            <span class="geo-kpi__value">{{ ind().bateuMeta }} de {{ ind().comMeta }}</span>
            <span class="geo-kpi__detail">Turnos com meta no dia</span></span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="ind().semRelatorio ? 'warning' : 'neutral'" [attr.aria-pressed]="lista.applied().semRelatorio" (click)="lista.set('semRelatorio', !lista.applied().semRelatorio)">
          <span class="geo-kpi__icon"><i class="pi pi-file-excel" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Sem relatório</span>
            <span class="geo-kpi__value">{{ ind().semRelatorio }}</span>
            <span class="geo-kpi__detail">Fechados sem relatório diário</span></span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="ind().comOcorrencias ? 'danger' : 'neutral'" [attr.aria-pressed]="lista.applied().comOcorrencia" (click)="lista.set('comOcorrencia', !lista.applied().comOcorrencia)">
          <span class="geo-kpi__icon"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Com ocorrências</span>
            <span class="geo-kpi__value">{{ ind().comOcorrencias }}</span>
            <span class="geo-kpi__detail">Turnos com algum registro</span></span>
        </button>
        <div class="geo-kpi" data-tone="neutral">
          <span class="geo-kpi__icon"><i class="pi pi-check-square" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Serviços executados</span>
            <span class="geo-kpi__value">{{ ind().servicosExecutados }}</span>
            <span class="geo-kpi__detail">{{ moeda(ind().valorExecutado) }}</span></span>
        </div>
      </section>

      <geo-data-table [textFit]="ajusteTexto" title="Turnos" mode="server" storageKey="obras-turnos" exportFileName="turnos-obras"
        searchPlaceholder="Equipe, placa, quem abriu ou obra" rowActionLabel="Ver turno" rowActionIcon="pi pi-angle-right"
        noResultsTitle="Nenhum turno encontrado com esse recorte."
        [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()" [rowLabel]="rotulo" [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os turnos' : 'Nenhum turno de Obras ainda'"
        [stateDescription]="resultado.error() ?? 'Os turnos aparecem aqui quando a equipe abre pelo aplicativo ou quando o supervisor abre em nome dela.'"
        [filtered]="lista.filtered()" [exportRows]="exportar" [exportLimit]="limiteExportacao"
        [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" [(query)]="lista.query"
        (lazyLoad)="lista.load($event)" (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()" (rowActivate)="ver($event)">
        <ng-template geoCell="equipe" let-row>
          <span class="geo-cell-strong">{{ row.codigoEquipe || 'Equipe removida' }}</span>
          <span class="geo-cell-muted turno-local" [title]="local(row)">{{ local(row) }}</span>
        </ng-template>
        <ng-template geoCell="abertura" let-row>
          <span>{{ row.dataInicio | date: 'dd/MM/yyyy HH:mm' }}</span>
          @if (row.abertoPor) { <span class="geo-cell-muted">por {{ row.abertoPor }}</span> }
        </ng-template>
        <ng-template geoCell="fechamento" let-row>
          @if (row.dataFim) { {{ row.dataFim | date: 'dd/MM/yyyy HH:mm' }} } @else { <span class="geo-cell-muted">Em aberto</span> }
        </ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status [tone]="situacao(row).tom" [icon]="situacao(row).icone.replace('pi ', '')">{{ situacao(row).rotulo }}</geo-status>
        </ng-template>
        <ng-template geoCell="obras" let-row>
          @if (row.obras.length) {
            <span [title]="row.obras.join(', ')">{{ row.obras[0] }}{{ row.obras.length > 1 ? ' +' + (row.obras.length - 1) : '' }}</span>
          } @else { <span class="geo-cell-muted">Sem atividade</span> }
        </ng-template>
        <ng-template geoCell="meta" let-row>
          <span class="turnos-meta">
            <span class="geo-cell-num">{{ row.realizado | currency: 'BRL' }}</span>
            @if (row.percentualMeta != null) { <geo-status [tone]="faixa(row.percentualMeta)">{{ percentual(row.percentualMeta) }}</geo-status> }
          </span>
          <span class="geo-cell-muted turnos-meta__base">{{ row.percentualMeta != null ? 'meta ' + (row.metaDiaria | currency: 'BRL') : 'Sem meta' }}</span>
        </ng-template>
        <ng-template geoCell="registros" let-row>
          <span class="turnos-registros">
            @if (row.semRelatorio) { <geo-status tone="warning" icon="pi-file-excel">Sem relatório</geo-status> }
            @if (row.ocorrencias) { <geo-status tone="danger" icon="pi-exclamation-triangle">{{ row.ocorrencias === 1 ? '1 ocorrência' : row.ocorrencias + ' ocorrências' }}</geo-status> }
            @if (row.aprs) { <geo-status [tone]="row.aprsEmRascunho ? 'warning' : 'neutral'" icon="pi-shield">{{ rotuloApr(row) }}</geo-status> }
            @if (row.substitutos) { <geo-status tone="info" icon="pi-sync">{{ row.substitutos === 1 ? '1 substituto' : row.substitutos + ' substitutos' }}</geo-status> }
            @if (!row.semRelatorio && !row.ocorrencias && !row.aprs && !row.substitutos) { <span class="geo-cell-muted">—</span> }
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-ajuda-listagem #ajuda titulo="Turnos de Obras" entidadePlural="turnos" busca="equipe, placa, quem abriu ou obra" [podeCriar]="false">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-filter"></i> Recorte e indicadores</h4>
        <p class="help-text-desc">A lista abre nos últimos {{ diasPadrao }} dias. Os indicadores resumem o recorte de equipe, base, obra e período. Clique em um deles para ver só aqueles turnos: os números continuam os mesmos.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-wallet"></i> De onde vem o realizado</h4>
        <p class="help-text-desc">O realizado é a soma dos apontamentos do turno, pelo valor congelado em cada programação. Material não tem valor.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-clock"></i> Encerrado pelo sistema</h4>
        <p class="help-text-desc">Turno ainda aberto no horário de corte é encerrado pelo sistema, como no comercial. Sem nota lançada, o fim fica igual à abertura.</p>
      </div>
    </app-ajuda-listagem>
  `,
  styles: `
    .geo-kpis.turnos-kpis { grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); margin-bottom: 1rem; }
    .turnos-meta { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; justify-content: flex-end; }
    .turnos-meta__base { display: block; text-align: right; }
    .turnos-registros { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .turno-local { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `
})
export class TurnosObraComponent {
  protected readonly ajusteTexto = AJUSTE_TEXTO_LISTAGEM;
  private readonly api = inject(ObrasTurnosService);
  private readonly router = inject(Router);
  protected readonly recorte = inject(RecorteDashboardService);

  protected readonly statusOpcoes = STATUS;
  protected readonly metaOpcoes = METAS;
  protected readonly diasPadrao = DIAS_PADRAO;
  protected readonly dataLocal = dataLocal;
  protected readonly percentual = percentual;
  protected readonly situacao = situacaoDoTurno;
  protected readonly faixa = geoAttainmentBand;
  protected readonly horas = horasTotais;
  protected readonly moeda = formatarMoeda;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly equipes = signal<GeoSelectOption<string>[]>([]);
  private readonly indicadores = signal<IndicadoresTurnosObra | null>(null);

  protected readonly lista = geoListState({
    storageKey: 'obras-turnos',
    filters: {
      idEquipe: geoFilter.value<string | null>(null, { label: 'Equipe', param: 'equipe', format: (id): string | null => (id ? this.nome(this.equipes(), id) : null) }),
      idBaseOperacional: geoFilter.list<string>([], { label: 'Base', param: 'base', itemLabel: (id) => this.nome(this.recorte.opcoesBases(), id), countLabel: (n) => `${n} bases` }),
      obra: geoFilter.value<string>('', { label: 'Obra', param: 'obra', format: (v): string | null => v || null }),
      status: geoFilter.value<StatusTurnoObra | null>(null, { label: 'Status', type: 'string', options: () => STATUS }),
      meta: geoFilter.value<MetaTurnoFiltro | null>(null, { label: 'Meta', type: 'string', options: () => METAS }),
      semRelatorio: geoFilter.value<boolean>(false, { label: 'Relatório', param: 'semRelatorio', format: (v): string | null => (v ? 'sem relatório' : null) }),
      comOcorrencia: geoFilter.value<boolean>(false, { label: 'Ocorrências', param: 'comOcorrencia', format: (v): string | null => (v ? 'com ocorrências' : null) }),
      abertura: geoFilter.range({ from: inicioPadrao(), to: null }, { label: 'Abertura' })
    },
    sort: [{ key: 'abertura', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<TurnoObraLinha>(
    (pedido) => this.api.listar(this.filtro(pedido)).pipe(tap((r) => this.indicadores.set(r.indicadores))),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = (_evento: unknown, limite: number) =>
    this.api.listar({ ...this.filtro(this.lista.request()), page: 0, size: limite }).pipe(map((r) => r.content));

  protected readonly ind = computed<IndicadoresTurnosObra>(() =>
    this.indicadores() ?? { turnos: 0, emAndamento: 0, minutosTotais: 0, comMeta: 0, bateuMeta: 0, semRelatorio: 0, comOcorrencias: 0, servicosExecutados: 0, valorExecutado: 0 }
  );
  protected readonly semAtalho = computed(() => {
    const a = this.lista.applied();
    return !a.status && !a.meta && !a.semRelatorio && !a.comOcorrencia;
  });

  protected readonly colunas: GeoDataTableColumn<TurnoObraLinha>[] = [
    { key: 'equipe', header: 'Equipe', type: 'custom', priority: 1, width: '11rem', sortField: 'equipe', value: (t) => t.codigoEquipe, display: (t) => t.codigoEquipe ?? 'Equipe removida' },
    { key: 'abertura', header: 'Abertura', type: 'custom', priority: 1, width: '9.5rem', sortField: 'dataInicio', value: (t) => t.dataInicio, display: (t) => new Date(t.dataInicio).toLocaleString('pt-BR') },
    { key: 'fechamento', header: 'Fechamento', type: 'custom', sortField: 'dataFim', value: (t) => t.dataFim, display: (t) => (t.dataFim ? new Date(t.dataFim).toLocaleString('pt-BR') : 'Em aberto') },
    { key: 'duracao', header: 'Duração', align: 'end', sortField: 'duracao', value: (t) => t.duracaoMinutos, display: (t) => duracao(t.duracaoMinutos) },
    { key: 'status', header: 'Status', type: 'custom', priority: 1, sortField: 'status', value: (t) => t.status, display: (t) => situacaoDoTurno(t).rotulo },
    { key: 'obras', header: 'Obras', type: 'custom', value: (t) => t.obras.join(', '), display: (t) => t.obras.join(', ') },
    { key: 'meta', header: 'Realizado × meta', type: 'custom', align: 'end', sortField: 'meta', value: (t) => t.realizado, display: (t) => (t.percentualMeta != null ? `${formatarMoeda(t.realizado)} (${percentual(t.percentualMeta)})` : formatarMoeda(t.realizado)) },
    { key: 'registros', header: 'Registros', type: 'custom', value: (t) => t.ocorrencias, display: (t) => `${t.semRelatorio ? 'Sem relatório; ' : ''}${t.ocorrencias} ocorrências; ${t.aprs} APRs` }
  ];
  protected readonly rotulo = (t: TurnoObraLinha) => t.codigoEquipe ?? 'equipe removida';

  constructor() {
    this.recorte.carregar(inject(DestroyRef));
    this.api.boletim().pipe(take(1)).subscribe((b) => this.equipes.set(b.equipes.map((e) => ({ value: e.idEquipe, label: e.codigo }))));
  }

  private nome(opcoes: readonly GeoSelectOption<string>[], id: string): string {
    return opcoes.find((o) => o.value === id)?.label ?? 'selecionada';
  }

  private filtro(pedido: { page: number; size: number; sort: readonly { key: string; direction: string }[] }): FiltroTurnosObra {
    const { filters, query } = this.lista.request();
    return {
      idEquipe: filters.idEquipe ?? undefined,
      idBaseOperacional: filters.idBaseOperacional.length ? filters.idBaseOperacional : undefined,
      obra: filters.obra || undefined,
      status: filters.status ?? undefined,
      meta: filters.meta ?? undefined,
      semRelatorio: filters.semRelatorio || undefined,
      comOcorrencia: filters.comOcorrencia || undefined,
      de: filters.abertura.from ?? undefined,
      ate: filters.abertura.to ?? undefined,
      q: query || undefined,
      page: pedido.page,
      size: pedido.size,
      sort: pedido.sort.length ? pedido.sort.map((r) => `${r.key},${r.direction}`) : ['dataInicio,desc']
    };
  }

  protected local(t: TurnoObraLinha): string {
    return [t.baseOperacional, t.placa, `${t.membros} ${t.membros === 1 ? 'pessoa' : 'pessoas'}`].filter(Boolean).join(' · ');
  }

  protected rotuloApr(t: TurnoObraLinha): string {
    const base = t.aprs === 1 ? '1 APR' : `${t.aprs} APRs`;
    return t.aprsEmRascunho ? `${base} (${t.aprsEmRascunho} em rascunho)` : base;
  }

  protected abertura(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.abertura.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  protected alternarStatus(status: StatusTurnoObra): void {
    this.lista.set('status', this.lista.applied().status === status ? null : status);
  }

  protected alternarMeta(meta: MetaTurnoFiltro): void {
    this.lista.set('meta', this.lista.applied().meta === meta ? null : meta);
  }

  protected limparAtalhos(): void {
    this.lista.set('status', null);
    this.lista.set('meta', null);
    this.lista.set('semRelatorio', false);
    this.lista.set('comOcorrencia', false);
  }

  protected irParaBoletim(): void {
    void this.router.navigate(['/obras/boletim']);
  }

  protected ver(t: Pick<TurnoObraDetalhe, 'id'>): void {
    void this.router.navigate(['/obras/turnos', t.id]);
  }
}
