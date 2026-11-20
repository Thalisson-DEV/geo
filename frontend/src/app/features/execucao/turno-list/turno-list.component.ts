import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
  GeoMultiSelectComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoAttainmentBand,
  geoFilter,
  geoListState
} from '@geo/ui';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';

import { ConsultaTurnosFiltros, StatusTurno, TurnoConsulta } from '../../../core/models/dashboard.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { baixarCsv, mensagemDoErroDeExportacao } from '../../../shared/listagem/exportacao-csv';
import { ExportacaoCsvDrawerComponent, FormatoExportacao } from '../../../shared/listagem/exportacao-csv-drawer.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { duracao, percentual } from '../dashboards/execucao-dashboards.utils';
import { RecorteDashboardService } from '../dashboards/recorte-dashboard.service';
import { situacaoDoTurno } from './turno-list.utils';
import { AJUSTE_TEXTO_LISTAGEM } from '../../obras/obras-ui';

const STATUS: GeoSelectOption<StatusTurno | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Em turno', value: 'ABERTO' },
  { label: 'Encerrado', value: 'FECHADO' }
];
/** Padrão: turnos abertos nos últimos 30 dias (a consulta aberta varre o histórico inteiro). */
export const DIAS_PADRAO_TURNOS = 30;
/** Os turnos exportam bem mais que o padrão das listagens. */
const LIMITE_EXPORTACAO_TURNOS = 30_000;

function inicioPadrao(): string {
  const d = new Date();
  d.setDate(d.getDate() - DIAS_PADRAO_TURNOS);
  return dataIso(d)!;
}

@Component({
  selector: 'app-turno-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    GeoBooleanControlComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoMultiSelectComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoButtonComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    AjudaListagemComponent,
    ExportacaoCsvDrawerComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts>
      <geo-page-header
        title="Turnos"
        icon="pi pi-calendar-clock"
        [breadcrumb]="[{ label: 'Execução' }, { label: 'Turnos' }]"
        description="Turnos das equipes: abertura, fechamento, notas lançadas, produção e atingimento da meta do dia."
        helpLabel="Ajuda sobre turnos"
        (help)="ajuda.show()"
      ></geo-page-header>

      <geo-filter-panel #painel storageKey="execucao-turnos" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Equipe" [options]="recorte.opcoesEquipes()" [(value)]="lista.filters.idEquipe" [clearable]="true" [filter]="true"
            [loading]="recorte.carregandoEquipes()" placeholder="Todas"></geo-select>
          <geo-multiselect label="Base operacional" [options]="recorte.opcoesBases()" [(value)]="lista.filters.idBaseOperacional" [clearable]="true"
            selectedItemsLabel="{0} bases" [maxSelectedLabels]="2" [loading]="recorte.carregando()" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Processo" [options]="recorte.opcoesProcessos()" [(value)]="lista.filters.idProcesso" [clearable]="true"
            selectedItemsLabel="{0} processos" [maxSelectedLabels]="2" [loading]="recorte.carregando()" placeholder="Todos"></geo-multiselect>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.status"></geo-select>
          <geo-datepicker label="Abertos a partir de" [value]="dataLocal(lista.filters.abertura().from)" [clearable]="true" (valueChange)="abertura('from', $event)"></geo-datepicker>
          <geo-datepicker label="Abertos até" [value]="dataLocal(lista.filters.abertura().to)" [clearable]="true" [minDate]="dataLocal(lista.filters.abertura().from)"
            (valueChange)="abertura('to', $event)"></geo-datepicker>
          <geo-boolean-control label="Só os abertos hoje" kind="toggle" [inline]="true" [value]="lista.filters.apenasHoje()" (valueChange)="lista.filters.apenasHoje.set($event)"></geo-boolean-control>
        </div>
      </geo-filter-panel>

      <geo-data-table [textFit]="ajusteTexto"
        title="Turnos"
        mode="server"
        storageKey="execucao-turnos"
        searchPlaceholder="Equipe ou placa"
        rowActionLabel="Relatório"
        rowActionIcon="pi pi-external-link"
        noResultsTitle="Nenhum turno encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os turnos' : 'Nenhum turno aberto'"
        [stateDescription]="resultado.error() ?? 'Os turnos aparecem aqui quando as equipes os abrem no aplicativo de campo.'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (rowActivate)="verRelatorio($event)"
      >
        <div table-filters class="geo-quick-filters" role="group" aria-label="Atalhos de turnos">
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="lista.applied().status === 'ABERTO'" (click)="alternarEmTurno()">
            <i class="pi pi-play-circle" aria-hidden="true"></i> Em turno
          </button>
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="lista.applied().apenasHoje" (click)="lista.set('apenasHoje', !lista.applied().apenasHoje)">
            <i class="pi pi-calendar" aria-hidden="true"></i> Abertos hoje
          </button>
        </div>
        <geo-button table-actions size="sm" variant="outline" icon="pi pi-download" label="Exportar CSV" (pressed)="abrirExportacao()"></geo-button>
        <ng-template geoCell="equipe" let-row>
          <span class="geo-cell-strong">{{ row.codigoEquipe || 'Equipe removida' }}</span>
          <span class="geo-cell-muted turno-local" [title]="local(row)">{{ local(row) }}</span>
        </ng-template>
        <ng-template geoCell="abertura" let-row>
          <span>{{ row.dataInicio | date: 'dd/MM/yyyy HH:mm' }}</span>
          @if (row.abertoPor) {
            <span class="geo-cell-muted">por {{ row.abertoPor }}</span>
          }
        </ng-template>
        <ng-template geoCell="fechamento" let-row>
          @if (row.dataFim) {
            {{ row.dataFim | date: 'dd/MM/yyyy HH:mm' }}
          } @else {
            <span class="geo-cell-muted">Em aberto</span>
          }
        </ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status [tone]="situacao(row).tom" [icon]="situacao(row).icone.replace('pi ', '')">{{ situacao(row).rotulo }}</geo-status>
        </ng-template>
        <ng-template geoCell="meta" let-row>
          @if (row.percentualMetaDiaria !== null) {
            <geo-status [tone]="faixa(row.percentualMetaDiaria)" icon="pi-chart-line">{{ percentual(row.percentualMetaDiaria) }}</geo-status>
            <span class="geo-cell-muted turno-nowrap">de {{ row.metaDiaria | currency: 'BRL' }}</span>
          } @else {
            <span class="geo-cell-muted">Sem meta</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button icon="pi pi-print" [label]="'Imprimir turno de ' + rotulo(row)" size="icon-sm" (pressed)="imprimir(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-list" [label]="'Notas do turno de ' + rotulo(row)" size="icon-sm" [disabled]="row.notas === 0" (pressed)="verNotas(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações do turno de ' + rotulo(row)" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-exportacao-csv-drawer [(visible)]="exportacaoAberta" [(formato)]="exportFormato" titulo="Exportar turnos (CSV)"
      [resumo]="formatoResumo" [detalhado]="formatoDetalhado" singular="turno" plural="turnos"
      [total]="totalExportacao()" [contando]="contandoExportacao()" [limite]="limiteExportacao" [exportando]="exportando()"
      (exportar)="exportarCsv($event)">
      @if (exportacaoAberta()) {
        <geo-text-input label="Equipe, placa ou quem abriu" [value]="expBusca()" (valueChange)="expBusca.set($event)"></geo-text-input>
        <geo-select label="Equipe" [options]="recorte.opcoesEquipes()" [value]="exp().idEquipe" (valueChange)="mudar('idEquipe', $event)" [clearable]="true" [filter]="true"
          [loading]="recorte.carregandoEquipes()" placeholder="Todas"></geo-select>
        <geo-datepicker label="Abertos a partir de" [value]="dataLocal(exp().abertura.from)" [clearable]="true" (valueChange)="periodoExportacao('from', $event)"></geo-datepicker>
        <geo-datepicker label="Abertos até" [value]="dataLocal(exp().abertura.to)" [clearable]="true" [minDate]="dataLocal(exp().abertura.from)"
          (valueChange)="periodoExportacao('to', $event)"></geo-datepicker>
        <geo-select label="Status" [options]="statusOpcoes" [value]="exp().status" (valueChange)="mudar('status', $event)"></geo-select>
        <geo-multiselect label="Base operacional" [options]="recorte.opcoesBases()" [value]="exp().idBaseOperacional" (valueChange)="mudar('idBaseOperacional', $event)"
          [clearable]="true" selectedItemsLabel="{0} bases" [maxSelectedLabels]="2" [loading]="recorte.carregando()" placeholder="Todas"></geo-multiselect>
        <geo-multiselect label="Processo" [options]="recorte.opcoesProcessos()" [value]="exp().idProcesso" (valueChange)="mudar('idProcesso', $event)"
          [clearable]="true" selectedItemsLabel="{0} processos" [maxSelectedLabels]="2" [loading]="recorte.carregando()" placeholder="Todos"></geo-multiselect>
        <geo-boolean-control label="Só os abertos hoje" kind="toggle" [inline]="true" [value]="exp().apenasHoje" (valueChange)="mudar('apenasHoje', $event)"></geo-boolean-control>
      }
    </app-exportacao-csv-drawer>
    <app-ajuda-listagem #ajuda titulo="Turnos" entidadePlural="turnos" busca="equipe, placa ou quem abriu" [podeCriar]="false">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-filter"></i> Recorte inicial</h4>
        <p class="help-text-desc">A lista abre nos turnos dos últimos {{ diasPadrao }} dias. Tire o chip de abertura (ou mude as datas) para ver o histórico mais antigo.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-exclamation-triangle"></i> Aberto desde outro dia</h4>
        <p class="help-text-desc">Turno aberto há mais de um dia aparece em amarelo: quase sempre a equipe esqueceu de fechar.</p>
      </div>
    </app-ajuda-listagem>
  `,
  styles: `
    .turno-local { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .turno-nowrap { white-space: nowrap; }
  `
})
export class TurnoListComponent {
  protected readonly ajusteTexto = AJUSTE_TEXTO_LISTAGEM;
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  protected readonly recorte = inject(RecorteDashboardService);

  protected readonly statusOpcoes = STATUS;
  protected readonly diasPadrao = DIAS_PADRAO_TURNOS;
  protected readonly dataLocal = dataLocal;
  protected readonly percentual = percentual;
  protected readonly situacao = situacaoDoTurno;
  protected readonly faixa = geoAttainmentBand;

  protected readonly lista = geoListState({
    storageKey: 'execucao-turnos',
    filters: {
      idEquipe: geoFilter.value<string | null>(null, { label: 'Equipe', param: 'equipe', format: (id): string | null => (id ? this.nome(this.recorte.opcoesEquipes(), id) : null) }),
      idBaseOperacional: geoFilter.list<string>([], { label: 'Base', param: 'base', itemLabel: (id) => this.nome(this.recorte.opcoesBases(), id), countLabel: (n) => `${n} bases` }),
      idProcesso: geoFilter.list<string>([], { label: 'Processo', param: 'processo', itemLabel: (id) => this.nome(this.recorte.opcoesProcessos(), id), countLabel: (n) => `${n} processos` }),
      status: geoFilter.value<StatusTurno | null>(null, { label: 'Status', type: 'string', options: () => STATUS }),
      apenasHoje: geoFilter.value<boolean>(false, { label: 'Abertura', param: 'hoje', format: (v): string | null => (v ? 'hoje' : null) }),
      abertura: geoFilter.range({ from: inicioPadrao(), to: null }, { label: 'Abertura' })
    },
    sort: [{ key: 'abertura', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<TurnoConsulta>((pedido) => this.dashboard.consultarTurnos(this.filtro(pedido)), { errorMessage: getErrorMessage });
  /*
   * Exportação no desenho das solicitações: o drawer abre com o recorte da lista e deixa
   * ajustá-lo sem mexer na tela; o servidor gera o CSV (resumido ou detalhado).
   */
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_TURNOS;
  protected readonly formatoResumo = { rotulo: 'Resumido', dica: 'Uma linha por turno, com duração, notas, produção e atingimento da meta do dia.' };
  protected readonly formatoDetalhado = { rotulo: 'Detalhado', dica: 'Uma linha por nota lançada em cada turno: número, tipo de serviço, horário, status e faturado.' };
  protected readonly exportacaoAberta = signal(false);
  protected readonly exportFormato = signal<FormatoExportacao>('resumo');
  protected readonly exportando = signal(false);
  /** Rascunho dos filtros da exportação; começa igual ao da lista. */
  protected readonly exp = signal(this.lista.applied());
  protected readonly expBusca = signal('');
  protected readonly totalExportacao = signal<number | null>(null);
  protected readonly contandoExportacao = signal(false);
  private readonly recorteExportacao = computed(() => this.paraApi(this.exp(), this.expBusca()));

  protected readonly colunas: GeoDataTableColumn<TurnoConsulta>[] = [
    { key: 'equipe', header: 'Equipe', type: 'custom', priority: 1, width: '11rem', value: (t) => t.codigoEquipe, display: (t) => t.codigoEquipe ?? 'Equipe removida' },
    { key: 'abertura', header: 'Abertura', type: 'custom', priority: 1, width: '9.5rem', sortField: 'dataInicio', value: (t) => t.dataInicio, display: (t) => new Date(t.dataInicio).toLocaleString('pt-BR') },
    { key: 'fechamento', header: 'Fechamento', type: 'custom', sortField: 'dataFim', value: (t) => t.dataFim, display: (t) => (t.dataFim ? new Date(t.dataFim).toLocaleString('pt-BR') : 'Em aberto') },
    { key: 'duracao', header: 'Duração', align: 'end', value: (t) => t.duracaoMinutos, display: (t) => duracao(t.duracaoMinutos) },
    { key: 'status', header: 'Status', type: 'custom', priority: 1, sortField: 'status', value: (t) => t.status, display: (t) => situacaoDoTurno(t).rotulo },
    { key: 'notas', header: 'Notas', type: 'integer', value: (t) => t.notas },
    { key: 'producao', header: 'Produção', type: 'currency', value: (t) => t.producao },
    { key: 'meta', header: 'Meta do dia', type: 'custom', value: (t) => t.percentualMetaDiaria, display: (t) => (t.percentualMetaDiaria !== null ? percentual(t.percentualMetaDiaria) : 'Sem meta') }
  ];
  protected readonly rotulo = (t: TurnoConsulta) => t.codigoEquipe ?? 'equipe removida';

  constructor() {
    // Quantos turnos vão no arquivo: recontado a cada ajuste do recorte, só com o drawer aberto.
    toObservable(computed(() => (this.exportacaoAberta() ? this.recorteExportacao() : null)))
      .pipe(
        debounceTime(300),
        tap((r) => {
          this.contandoExportacao.set(!!r);
          if (!r) this.totalExportacao.set(null);
        }),
        switchMap((r) =>
          r
            ? this.dashboard.consultarTurnos({ ...r, page: 0, size: 1 }).pipe(map((p) => p.page.totalElements), catchError(() => of(null)))
            : of(null)
        ),
        takeUntilDestroyed()
      )
      .subscribe((total) => {
        this.contandoExportacao.set(false);
        if (this.exportacaoAberta()) this.totalExportacao.set(total);
      });
    const destroyRef = inject(DestroyRef);
    this.recorte.carregar(destroyRef);
    this.recorte.carregarEquipes(destroyRef);
  }

  private nome(opcoes: readonly GeoSelectOption<string>[], id: string): string {
    return opcoes.find((o) => o.value === id)?.label ?? 'selecionado';
  }

  private filtro(pedido: { page: number; size: number; sort: readonly { key: string; direction: string }[] }): ConsultaTurnosFiltros {
    const { filters, query } = this.lista.request();
    return {
      ...this.paraApi(filters, query),
      page: pedido.page,
      size: pedido.size,
      sort: pedido.sort.length ? pedido.sort.map((r) => `${r.key},${r.direction}`) : ['dataInicio,desc']
    };
  }

  /** Filtros da tela (ou do drawer de exportação) no formato da API, sem paginação. */
  private paraApi(filters = this.lista.applied(), query = ''): ConsultaTurnosFiltros {
    return {
      idEquipe: filters.idEquipe ?? undefined,
      idBaseOperacional: filters.idBaseOperacional.length ? filters.idBaseOperacional : undefined,
      idProcesso: filters.idProcesso.length ? filters.idProcesso : undefined,
      status: filters.status ?? undefined,
      apenasHoje: filters.apenasHoje || undefined,
      aberturaDe: filters.abertura.from ?? undefined,
      aberturaAte: filters.abertura.to ?? undefined,
      buscaGlobal: query.trim() || undefined
    };
  }

  protected abrirExportacao(): void {
    const { filters, query } = this.lista.request();
    this.exp.set({ ...filters, abertura: { ...filters.abertura } });
    this.expBusca.set(query ?? '');
    this.exportFormato.set('resumo');
    this.exportacaoAberta.set(true);
  }

  /** Ajusta um filtro só na exportação. */
  protected mudar<K extends keyof ReturnType<typeof this.exp>>(chave: K, valor: ReturnType<typeof this.exp>[K]): void {
    this.exp.update((f) => ({ ...f, [chave]: valor }));
  }

  protected periodoExportacao(limite: 'from' | 'to', data: Date | null): void {
    this.exp.update((f) => ({ ...f, abertura: { ...f.abertura, [limite]: dataIso(data) } }));
  }

  protected exportarCsv(formato: FormatoExportacao): void {
    if (this.exportando()) return;
    this.exportando.set(true);
    this.dashboard.exportarTurnos(formato, this.recorteExportacao()).subscribe({
      next: (resposta) => {
        this.exportando.set(false);
        this.exportacaoAberta.set(false);
        if (baixarCsv(resposta, `turnos_${formato}.csv`)) {
          this.notificacoes.success(`CSV dos turnos (${formato === 'resumo' ? 'resumido' : 'detalhado'}) gerado.`);
        }
      },
      error: async (erro: unknown) => {
        this.exportando.set(false);
        this.notificacoes.error(await mensagemDoErroDeExportacao(erro), { title: 'Não foi possível exportar' });
      }
    });
  }

  protected local(t: TurnoConsulta): string {
    return [t.baseOperacional, t.processo].filter(Boolean).join(' · ');
  }

  protected abertura(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.abertura.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  protected alternarEmTurno(): void {
    this.lista.set('status', this.lista.applied().status === 'ABERTO' ? null : 'ABERTO');
  }

  protected verRelatorio(t: TurnoConsulta): void {
    window.open(this.router.serializeUrl(this.router.createUrlTree(['/execucao/turnos', t.id, 'detalhamento'])), '_blank');
  }

  protected imprimir(t: TurnoConsulta): void {
    void this.router.navigate(['/execucao/turnos', t.id, 'detalhamento'], { queryParams: { mode: 'print' } });
  }

  protected verNotas(t: TurnoConsulta): void {
    void this.router.navigate(['/execucao/comercial'], { queryParams: { idTurno: t.id } });
  }

  protected logs(t: TurnoConsulta): void {
    this.auditoria().show(t.id, `Turno ${t.codigoEquipe ?? ''}`, { status: 'Status', dataInicio: 'Abertura', dataFim: 'Fechamento', idVeiculo: 'Veículo' });
  }
}
