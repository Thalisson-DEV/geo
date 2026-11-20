import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoAutocompleteComponent,
  GeoButtonComponent,
  GeoBooleanControlComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';

import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../core/lookup/store/remote-lookup';
import {
  ExecucaoComercialResponse,
  ExecucaoFilters,
  OperacaoMaterial,
  StatusExecucao,
  TIPOS_NOTA,
  TIPO_SERVICO_NAO_INFORMADO,
  TipoNota,
  rotuloTipoServico
} from '../../../core/models/execucao.models';
import { generateReferenceOptions, getErrorMessage } from '../../../core/models/shared.models';
import { ContratoService } from '../../../core/services/contrato.service';
import { ExecucaoService } from '../../../core/services/execucao.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { baixarCsv, mensagemDoErroDeExportacao } from '../../../shared/listagem/exportacao-csv';
import { ExportacaoCsvDrawerComponent, FormatoExportacao } from '../../../shared/listagem/exportacao-csv-drawer.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { RecorteDashboardService } from '../dashboards/recorte-dashboard.service';
import { STATUS_EXECUCAO } from './execucao-list.utils';
import { NumeroOficialDialogComponent } from './numero-oficial-dialog.component';
import { AJUSTE_TEXTO_LISTAGEM } from '../../obras/obras-ui';

/** As notas exportam bem mais que o padrão das listagens: o mês inteiro cabe numa planilha. */
const LIMITE_EXPORTACAO_NOTAS = 30_000;

const STATUS: GeoSelectOption<StatusExecucao | null>[] = [
  { label: 'Todos', value: null },
  ...(Object.keys(STATUS_EXECUCAO) as StatusExecucao[]).map((s) => ({ label: STATUS_EXECUCAO[s].rotulo, value: s }))
];
const OPERACOES: GeoSelectOption<OperacaoMaterial | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Aplicado', value: 'APLICADO' },
  { label: 'Retirado', value: 'RETIRADO' }
];
const TIPOS_LANCAMENTO: GeoSelectOption<TipoNota | null>[] = [
  { label: 'Todos', value: null },
  ...(Object.keys(TIPOS_NOTA) as TipoNota[]).map((t) => ({ label: TIPOS_NOTA[t].rotulo, value: t }))
];
/** Valor do filtro "Tipo de serviço" para as notas lançadas sem tipo. */
export const SEM_TIPO_SERVICO = 'sem-tipo';

/** Padrão: lançamentos dos últimos 30 dias (a consulta aberta varre o histórico inteiro). */
export const DIAS_PADRAO_EXECUCOES = 30;

function inicioPadrao(): string {
  const d = new Date();
  d.setDate(d.getDate() - DIAS_PADRAO_EXECUCOES);
  return dataIso(d)!;
}

@Component({
  selector: 'app-execucao-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    GeoAutocompleteComponent,
    GeoBooleanControlComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    AjudaListagemComponent,
    GeoButtonComponent,
    ExportacaoCsvDrawerComponent,
    NumeroOficialDialogComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts>
      <geo-page-header
        title="Execuções"
        icon="pi pi-bolt"
        [breadcrumb]="[{ label: 'Execução' }, { label: 'Comercial' }]"
        description="Notas lançadas pelas equipes: ações, materiais aplicados e retirados e o valor faturado."
        helpLabel="Ajuda sobre execuções"
        (help)="ajuda.show()"
      ></geo-page-header>

      <geo-filter-panel #painel storageKey="execucao-comercial" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="Nota" [value]="lista.filters.referenciaNota() ?? ''" (valueChange)="lista.filters.referenciaNota.set($event || null)" placeholder="Ex.: 123456"></geo-text-input>
          <geo-text-input label="Nº de série do material" [value]="lista.filters.numSerie() ?? ''" (valueChange)="filtrarSerie($event)" placeholder="Ex.: 12345678"></geo-text-input>
          <geo-select label="Tipo de lançamento" [options]="tiposLancamento" [(value)]="lista.filters.tipoNota"></geo-select>
          <geo-select label="Referência" [options]="referencias" [(value)]="lista.filters.referencia" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-select label="Equipe" [options]="recorte.opcoesEquipes()" [(value)]="lista.filters.idEquipe" [clearable]="true" [filter]="true"
            [loading]="recorte.carregandoEquipes()" placeholder="Todas"></geo-select>
          <geo-multiselect label="Base operacional" [options]="recorte.opcoesBases()" [(value)]="lista.filters.idBaseOperacional" [clearable]="true"
            selectedItemsLabel="{0} bases" [maxSelectedLabels]="2" [loading]="recorte.carregando()" placeholder="Todas"></geo-multiselect>
          <geo-select label="Tipo de serviço" [options]="tiposServico()" [(value)]="lista.filters.tipoServico" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.status"></geo-select>
          <geo-select label="Ação" [options]="acoes()" [(value)]="lista.filters.idAcao" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-autocomplete label="Material" placeholder="Código ou descrição" [options]="materiais.items()" [ngModel]="lista.filters.idMaterial()"
            (ngModelChange)="escolherMaterial($event)" [loading]="materiais.loading()" [status]="materiais.status()" [clearable]="true"
            (search)="materiais.search($event)" (loadMore)="materiais.loadNext()" (retry)="materiais.retry()"></geo-autocomplete>
          <geo-select label="Operação do material" [options]="operacoes" [(value)]="lista.filters.operacaoMaterial"></geo-select>
          <geo-datepicker label="Lançadas a partir de" [value]="dataLocal(lista.filters.lancamento().from)" [clearable]="true" (valueChange)="lancamento('from', $event)"></geo-datepicker>
          <geo-datepicker label="Lançadas até" [value]="dataLocal(lista.filters.lancamento().to)" [clearable]="true" [minDate]="dataLocal(lista.filters.lancamento().from)"
            (valueChange)="lancamento('to', $event)"></geo-datepicker>
          <geo-boolean-control label="Só as lançadas hoje" kind="toggle" [inline]="true" [value]="lista.filters.apenasHoje()" (valueChange)="lista.filters.apenasHoje.set($event)"></geo-boolean-control>
          <geo-boolean-control class="geo-filter-grid__wide" label="Só avulsas sem número oficial" kind="toggle" [inline]="true" [value]="lista.filters.semNumeroOficial()" (valueChange)="lista.filters.semNumeroOficial.set($event)"></geo-boolean-control>
          <geo-boolean-control label="Só notas alteradas" kind="toggle" [inline]="true" [value]="lista.filters.alterada()" (valueChange)="lista.filters.alterada.set($event)"></geo-boolean-control>
        </div>
      </geo-filter-panel>

      <geo-data-table [textFit]="ajusteTexto"
        title="Execuções"
        mode="server"
        storageKey="execucao-comercial"
        searchPlaceholder="Nº de poste ou posto"
        rowActionLabel="Ver nota"
        rowActionIcon="pi pi-external-link"
        noResultsTitle="Nenhuma execução encontrada com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as execuções' : 'Nenhuma execução lançada'"
        [stateDescription]="resultado.error() ?? 'As notas aparecem aqui quando as equipes as lançam no aplicativo de campo.'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (rowActivate)="verNota($event)"
        [hiddenColumns]="colunasOcultasPadrao"
        [columnPicker]="true"
      >
        <geo-button table-actions size="sm" variant="outline" icon="pi pi-download" label="Exportar CSV" (pressed)="abrirExportacao()"></geo-button>
        <ng-template geoCell="nota" let-row>
          <span class="nota-cel">
            @if (row.referenciaNota) {
              <span class="geo-cell-strong">{{ row.referenciaNota }}</span>
            } @else {
              <!-- Sem nº oficial: a referência provisória (ou o início do id) ainda distingue uma nota da outra. -->
              <span class="geo-cell-strong" [title]="'Referência provisória da nota'">{{ row.referenciaProvisoria || 'Prov. ' + row.id.slice(0, 8) }}</span>
            }
            @if (row.aguardandoNumeroOficial) {
              <geo-status tone="neutral" icon="pi-clock">Sem nº oficial</geo-status>
            } @else if (tipoDe(row); as tipo) {
              <geo-status [tone]="tipo.tom" [icon]="tipo.icone">{{ tipo.rotulo }}</geo-status>
            }
            @if (row.alterada) {
              <geo-status tone="warning" icon="pi-pencil" [attr.title]="'Alterada ' + (row.totalAlteracoes === 1 ? '1 vez' : row.totalAlteracoes + ' vezes') + ' depois de sincronizada'">Alterada</geo-status>
            }
          </span>
        </ng-template>
        <!-- Código da equipe e data com hora sempre inteiros (sem reticências) -->
        <ng-template geoCell="equipe" let-row><span class="cel-inteira">{{ row.equipe?.codigo ?? '—' }}</span></ng-template>
        <ng-template geoCell="lancamento" let-row><span class="cel-inteira">{{ row.dataLancamento | date: 'dd/MM/yyyy HH:mm' }}</span></ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status [tone]="status(row.statusExecucao)?.tom ?? 'neutral'" [icon]="$safeNavigationMigration(status(row.statusExecucao)?.icone?.replace('pi ', ''))">
            {{ status(row.statusExecucao)?.rotulo ?? row.statusExecucao }}
          </geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (row.tipoNota === 'AVULSA') {
              <geo-icon-button icon="pi pi-pencil" [label]="(row.aguardandoNumeroOficial ? 'Informar número oficial da nota ' : 'Corrigir número oficial da nota ') + row.referenciaNota"
                size="icon-sm" (pressed)="informarNumero(row)"></geo-icon-button>
            }
            <geo-icon-button icon="pi pi-print" [label]="'Imprimir nota ' + row.referenciaNota" size="icon-sm" (pressed)="imprimir(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações da nota ' + row.referenciaNota" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-numero-oficial-dialog [(visible)]="numeroOficialAberto" [execucao]="avulsaEscolhida()" (informado)="lista.reload()"></app-numero-oficial-dialog>
    <app-exportacao-csv-drawer [(visible)]="exportacaoAberta" [(formato)]="exportFormato" titulo="Exportar notas (CSV)"
      [resumo]="formatoResumo" [detalhado]="formatoDetalhado" singular="nota" plural="notas" [feminino]="true"
      [total]="totalExportacao()" [contando]="contandoExportacao()" [limite]="limiteExportacao" [exportando]="exportando()"
      (exportar)="exportarCsv($event)">
      @if (exportacaoAberta()) {
        <geo-text-input label="Nota" [value]="exp().referenciaNota ?? ''" (valueChange)="mudar('referenciaNota', $event || null)" placeholder="Ex.: 123456"></geo-text-input>
        <geo-text-input label="Nº de poste ou posto" [value]="expBusca()" (valueChange)="expBusca.set($event)"></geo-text-input>
        <geo-datepicker label="Lançadas a partir de" [value]="dataLocal(exp().lancamento.from)" [clearable]="true" (valueChange)="periodoExportacao('from', $event)"></geo-datepicker>
        <geo-datepicker label="Lançadas até" [value]="dataLocal(exp().lancamento.to)" [clearable]="true" [minDate]="dataLocal(exp().lancamento.from)"
          (valueChange)="periodoExportacao('to', $event)"></geo-datepicker>
        <geo-select label="Equipe" [options]="recorte.opcoesEquipes()" [value]="exp().idEquipe" (valueChange)="mudar('idEquipe', $event)" [clearable]="true" [filter]="true"
          [loading]="recorte.carregandoEquipes()" placeholder="Todas"></geo-select>
        <geo-select label="Status" [options]="statusOpcoes" [value]="exp().status" (valueChange)="mudar('status', $event)"></geo-select>
        <geo-select label="Tipo de serviço" [options]="tiposServico()" [value]="exp().tipoServico" (valueChange)="mudar('tipoServico', $event)" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
        <geo-select label="Tipo de lançamento" [options]="tiposLancamento" [value]="exp().tipoNota" (valueChange)="mudar('tipoNota', $event)"></geo-select>
        <geo-select label="Ação" [options]="acoes()" [value]="exp().idAcao" (valueChange)="mudar('idAcao', $event)" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
        <geo-select label="Referência" [options]="referencias" [value]="exp().referencia" (valueChange)="mudar('referencia', $event)" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
        <geo-autocomplete label="Material" placeholder="Código ou descrição" [options]="materiais.items()" [ngModel]="exp().idMaterial"
          (ngModelChange)="escolherMaterialExportacao($event)" [loading]="materiais.loading()" [status]="materiais.status()" [clearable]="true"
          (search)="materiais.search($event)" (loadMore)="materiais.loadNext()" (retry)="materiais.retry()"></geo-autocomplete>
        <geo-select label="Operação do material" [options]="operacoes" [value]="exp().operacaoMaterial" (valueChange)="mudar('operacaoMaterial', $event)"></geo-select>
        <geo-text-input label="Nº de série do material" [value]="exp().numSerie ?? ''" (valueChange)="mudar('numSerie', $event || null)" placeholder="Ex.: 12345678"></geo-text-input>
        @if (exp().idTurno) {
          <geo-boolean-control label="Só as notas do turno" kind="toggle" [inline]="true" [value]="true" (valueChange)="mudar('idTurno', $event ? exp().idTurno : null)"></geo-boolean-control>
        }
        <geo-boolean-control label="Só as lançadas hoje" kind="toggle" [inline]="true" [value]="exp().apenasHoje" (valueChange)="mudar('apenasHoje', $event)"></geo-boolean-control>
        <geo-boolean-control label="Só avulsas sem número oficial" kind="toggle" [inline]="true" [value]="exp().semNumeroOficial" (valueChange)="mudar('semNumeroOficial', $event)"></geo-boolean-control>
        <geo-boolean-control label="Só notas alteradas" kind="toggle" [inline]="true" [value]="exp().alterada" (valueChange)="mudar('alterada', $event)"></geo-boolean-control>
      }
    </app-exportacao-csv-drawer>
    <app-ajuda-listagem #ajuda titulo="Execuções" artigoPlural="as" entidadePlural="execuções" busca="nº de poste ou posto" [podeCriar]="false">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-filter"></i> Recorte inicial</h4>
        <p class="help-text-desc">A lista abre nas notas lançadas nos últimos {{ diasPadrao }} dias. Vindo de um turno ("Notas do turno"), mostra todas as notas dele, sem limite de data.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-file-edit"></i> Nota avulsa e ocorrência</h4>
        <p class="help-text-desc">A nota avulsa é lançada em campo com um número provisório gerado pelo app. Use o lápis da linha para informar o número oficial; o provisório fica guardado. Na ocorrência comercial, material da Concessionária fica só no registro e não mexe no saldo da equipe. Os três tipos contam faturamento e meta.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-pencil"></i> Nota alterada</h4>
        <p class="help-text-desc">A equipe (pelo app, até 7 dias depois do lançamento, mesmo offline) e o escritório (no relatório da nota, a qualquer tempo) podem corrigir serviços e materiais de uma nota já sincronizada. A nota ganha o selo "Alterada", o valor é recalculado e o saldo do caminhão é ajustado. O relatório mostra o histórico de alterações com o lançamento original, quem alterou, de onde e por quê.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-box"></i> Material</h4>
        <p class="help-text-desc">Filtrar por material traz as notas que usaram aquele material; combine com "Operação do material" para separar aplicados de retirados.</p>
        <p class="help-text-desc">"Nº de série do material" acha as notas em que um medidor (ou outro material com série) foi aplicado ou retirado, em todo o histórico; basta parte da série. A Bússola também responde, para várias séries de uma vez: "em quais notas foram aplicados os medidores 123 e 456?".</p>
      </div>
    </app-ajuda-listagem>
  `,
  styles: `
    .cel-inteira { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .nota-cel { display: inline-flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  `
})
export class ExecucaoListComponent {
  protected readonly ajusteTexto = AJUSTE_TEXTO_LISTAGEM;
  private readonly execucoes = inject(ExecucaoService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly lookupStore = inject(LookupStore);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  protected readonly recorte = inject(RecorteDashboardService);

  protected readonly statusOpcoes = STATUS;
  protected readonly operacoes = OPERACOES;
  protected readonly tiposLancamento = TIPOS_LANCAMENTO;
  protected readonly numeroOficialAberto = signal(false);
  protected readonly avulsaEscolhida = signal<ExecucaoComercialResponse | null>(null);
  protected readonly referencias: GeoSelectOption<string>[] = generateReferenceOptions();
  protected readonly diasPadrao = DIAS_PADRAO_EXECUCOES;
  protected readonly dataLocal = dataLocal;
  protected readonly acoes = signal<GeoSelectOption<string>[]>([]);
  protected readonly tiposServico = signal<GeoSelectOption<string>[]>([{ label: TIPO_SERVICO_NAO_INFORMADO, value: SEM_TIPO_SERVICO }]);
  private readonly nomeMaterial = signal<Record<string, string>>({});

  protected readonly materiais = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchMaterials({ query, cursor }),
    selectedValues: () => (this.lista.filters.idMaterial() ? [this.lista.filters.idMaterial()!] : []),
    destroyRef: inject(DestroyRef)
  });

  /** Vindo de um turno (`?idTurno=`) as notas dele aparecem todas, sem o limite de data. */
  private readonly doTurno = inject(ActivatedRoute).snapshot.queryParamMap.has('idTurno');

  protected readonly lista = geoListState({
    storageKey: 'execucao-comercial',
    filters: {
      idTurno: geoFilter.value<string | null>(null, { label: 'Turno', param: 'idTurno', format: (id): string | null => (id ? 'notas do turno' : null) }),
      referenciaNota: geoFilter.value<string | null>(null, { label: 'Nota', param: 'nota' }),
      numSerie: geoFilter.value<string | null>(null, { label: 'Nº de série', param: 'serie' }),
      tipoNota: geoFilter.value<TipoNota | null>(null, { label: 'Tipo de lançamento', param: 'tipoNota', type: 'string', options: () => TIPOS_LANCAMENTO }),
      semNumeroOficial: geoFilter.value<boolean>(false, { label: 'Avulsas', param: 'semNumero', format: (v): string | null => (v ? 'sem número oficial' : null) }),
      alterada: geoFilter.value<boolean>(false, { label: 'Notas', param: 'alterada', format: (v): string | null => (v ? 'alteradas' : null) }),
      referencia: geoFilter.value<string | null>(null, { label: 'Referência', param: 'ref' }),
      idEquipe: geoFilter.value<string | null>(null, { label: 'Equipe', param: 'equipe', format: (id): string | null => (id ? this.nome(this.recorte.opcoesEquipes(), id) : null) }),
      idBaseOperacional: geoFilter.list<string>([], { label: 'Base', param: 'base', itemLabel: (id) => this.nome(this.recorte.opcoesBases(), id), countLabel: (n) => `${n} bases` }),
      tipoServico: geoFilter.value<string | null>(null, { label: 'Tipo de serviço', param: 'tipo', format: (id): string | null => (id ? this.nome(this.tiposServico(), id) : null) }),
      status: geoFilter.value<StatusExecucao | null>(null, { label: 'Status', type: 'string', options: () => STATUS }),
      idAcao: geoFilter.value<string | null>(null, { label: 'Ação', param: 'acao', format: (id): string | null => (id ? this.nome(this.acoes(), id) : null) }),
      idMaterial: geoFilter.value<string | null>(null, { label: 'Material', param: 'material', format: (id): string | null => (id ? (this.nomeMaterial()[id] ?? 'material selecionado') : null) }),
      operacaoMaterial: geoFilter.value<OperacaoMaterial | null>(null, { label: 'Operação', param: 'operacao', type: 'string', options: () => OPERACOES }),
      apenasHoje: geoFilter.value<boolean>(false, { label: 'Lançamento', param: 'hoje', format: (v): string | null => (v ? 'hoje' : null) }),
      lancamento: geoFilter.range(this.doTurno ? { from: null, to: null } : { from: inicioPadrao(), to: null }, { label: 'Lançamento' })
    },
    sort: [{ key: 'lancamento', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<ExecucaoComercialResponse>((pedido) => this.execucoes.listarExecucoes(this.filtro(pedido)), { errorMessage: getErrorMessage });
  /*
   * Exportação no desenho das solicitações: o drawer abre com o recorte da lista e deixa
   * ajustá-lo sem mexer na tela; o servidor gera o CSV (resumido ou detalhado).
   */
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_NOTAS;
  protected readonly formatoResumo = { rotulo: 'Resumido', dica: 'Uma linha por nota, com o faturado e quantos serviços e materiais ela tem.' };
  protected readonly formatoDetalhado = {
    rotulo: 'Detalhado',
    dica: 'Uma linha por serviço e por material de cada nota: código, descrição, quantidade, operação, série e origem.'
  };
  protected readonly exportacaoAberta = signal(false);
  protected readonly exportFormato = signal<FormatoExportacao>('resumo');
  protected readonly exportando = signal(false);
  /** Rascunho dos filtros da exportação; começa igual ao da lista. */
  protected readonly exp = signal(this.lista.applied());
  protected readonly expBusca = signal('');
  protected readonly totalExportacao = signal<number | null>(null);
  protected readonly contandoExportacao = signal(false);
  private readonly recorteExportacao = computed(() => this.paraApi(this.exp(), this.expBusca()));

  protected readonly colunas: GeoDataTableColumn<ExecucaoComercialResponse>[] = [
    { key: 'nota', header: 'Nota', type: 'custom', priority: 1, sortField: 'referenciaNota', value: (e) => e.referenciaNota, display: (e) => e.referenciaNota },
    { key: 'tipoNota', header: 'Tipo de nota', priority: 2, sortField: 'tipoNota', value: (e) => e.tipoNota, display: (e) => TIPOS_NOTA[e.tipoNota]?.rotulo ?? 'Comum' },
    { key: 'tipoServico', header: 'Tipo de serviço', priority: 1, value: (e) => e.tipoServico?.descricao, display: (e) => rotuloTipoServico(e.tipoServico) },
    // A nota guarda só o id da equipe: o backend não ordena pelo código.
    { key: 'equipe', header: 'Equipe', type: 'custom', priority: 1, value: (e) => e.equipe?.codigo, display: (e) => e.equipe?.codigo ?? '—' },
    { key: 'lancamento', header: 'Lançamento', type: 'custom', sortField: 'dataLancamento', value: (e) => e.dataLancamento,
      display: (e) => new Date(e.dataLancamento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', '') },
    { key: 'status', header: 'Status', type: 'custom', sortField: 'statusExecucao', value: (e) => e.statusExecucao, display: (e) => STATUS_EXECUCAO[e.statusExecucao]?.rotulo ?? e.statusExecucao },
    { key: 'faturado', header: 'Faturado', type: 'currency', sortField: 'valorTotalFaturado', value: (e) => e.valorTotalFaturado },
    // Na exportação, deixa claro que a nota não é mais como foi lançada.
    { key: 'alteracoes', header: 'Alterações', priority: 3, sortField: 'totalAlteracoes', value: (e) => e.totalAlteracoes,
      display: (e) => (e.alterada ? (e.totalAlteracoes === 1 ? '1 alteração' : `${e.totalAlteracoes} alterações`) : '—') }
  ];
  /** Padrão enxuto para a ação da linha caber em 1280–1440px; o usuário reexibe em "Colunas". */
  protected readonly colunasOcultasPadrao = ['tipoNota', 'alteracoes'];
  protected readonly rotulo = (e: ExecucaoComercialResponse) => e.referenciaNota || e.referenciaProvisoria || 'Nota sem número';

  constructor() {
    // Quantas notas vão no arquivo: recontado a cada ajuste do recorte, só com o drawer aberto.
    toObservable(computed(() => (this.exportacaoAberta() ? this.recorteExportacao() : null)))
      .pipe(
        debounceTime(300),
        tap((r) => {
          this.contandoExportacao.set(!!r);
          if (!r) this.totalExportacao.set(null);
        }),
        switchMap((r) =>
          r
            ? this.execucoes.listarExecucoes({ ...r, page: 0, size: 1 }).pipe(map((p) => p.page.totalElements), catchError(() => of(null)))
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
    inject(ContratoService)
      .listarAcoesAtivas()
      .subscribe({ next: (r) => this.acoes.set(r.content.map((a) => ({ label: a.nome, value: a.id }))), error: () => undefined });
    // Inclui os desativados: notas antigas continuam com o tipo que tinham.
    this.execucoes.listarTiposServico({ size: 200, sort: 'descricao,asc' }).subscribe({
      next: (r) =>
        this.tiposServico.set([
          ...r.content.map((t) => ({ label: `${rotuloTipoServico(t)}${t.ativo ? '' : ' (inativo)'}`, value: t.id })),
          { label: TIPO_SERVICO_NAO_INFORMADO, value: SEM_TIPO_SERVICO }
        ]),
      error: () => undefined
    });
  }

  private nome(opcoes: readonly GeoSelectOption<string>[], id: string): string {
    return opcoes.find((o) => o.value === id)?.label ?? 'selecionado';
  }

  private filtro(pedido: { page: number; size: number; sort: readonly { key: string; direction: string }[] }): ExecucaoFilters {
    const { filters, query } = this.lista.request();
    return {
      ...this.paraApi(filters, query),
      page: pedido.page,
      size: pedido.size,
      sort: pedido.sort.length ? pedido.sort.map((r) => `${r.key},${r.direction}`) : ['dataLancamento,desc']
    };
  }

  /** Filtros da tela (ou do drawer de exportação) no formato da API, sem paginação. */
  private paraApi(f = this.lista.applied(), query = ''): ExecucaoFilters {
    const de = dataLocal(f.lancamento.from);
    const ate = dataLocal(f.lancamento.to);
    // "Até" inclui o dia inteiro escolhido.
    ate?.setHours(23, 59, 59, 999);
    return {
      idTurno: f.idTurno ?? undefined,
      referenciaNota: f.referenciaNota?.trim() || undefined,
      referencia: f.referencia ?? undefined,
      idEquipe: f.idEquipe ?? undefined,
      idBaseOperacional: f.idBaseOperacional.length ? f.idBaseOperacional : undefined,
      idTipoServico: f.tipoServico && f.tipoServico !== SEM_TIPO_SERVICO ? f.tipoServico : undefined,
      semTipoServico: f.tipoServico === SEM_TIPO_SERVICO || undefined,
      tipoNota: f.tipoNota ?? undefined,
      aguardandoNumeroOficial: f.semNumeroOficial || undefined,
      alterada: f.alterada || undefined,
      status: f.status ?? undefined,
      idAcao: f.idAcao ?? undefined,
      idMaterial: f.idMaterial ?? undefined,
      operacaoMaterial: f.operacaoMaterial ?? undefined,
      numSerieMaterial: f.numSerie?.trim() || undefined,
      apenasHoje: f.apenasHoje || undefined,
      dataLancamentoDe: de?.toISOString(),
      dataLancamentoAte: ate?.toISOString(),
      buscaGlobal: query.trim() || undefined
    };
  }

  protected abrirExportacao(): void {
    const { filters, query } = this.lista.request();
    this.exp.set({ ...filters, lancamento: { ...filters.lancamento } });
    this.expBusca.set(query ?? '');
    this.exportFormato.set('resumo');
    this.exportacaoAberta.set(true);
  }

  /** Ajusta um filtro só na exportação. */
  protected mudar<K extends keyof ReturnType<typeof this.exp>>(chave: K, valor: ReturnType<typeof this.exp>[K]): void {
    this.exp.update((f) => ({ ...f, [chave]: valor }));
  }

  protected periodoExportacao(limite: 'from' | 'to', data: Date | null): void {
    this.exp.update((f) => ({ ...f, lancamento: { ...f.lancamento, [limite]: dataIso(data) } }));
  }

  protected escolherMaterialExportacao(id: string | null): void {
    const opcao = this.materiais.items().find((m) => m.value === id);
    if (opcao) this.nomeMaterial.update((n) => ({ ...n, [opcao.value]: opcao.label }));
    this.mudar('idMaterial', id);
  }

  protected exportarCsv(formato: FormatoExportacao): void {
    if (this.exportando()) return;
    this.exportando.set(true);
    this.execucoes.exportarExecucoes(formato, this.recorteExportacao()).subscribe({
      next: (resposta) => {
        this.exportando.set(false);
        this.exportacaoAberta.set(false);
        if (baixarCsv(resposta, `notas_${formato}.csv`)) {
          this.notificacoes.success(`CSV das notas (${formato === 'resumo' ? 'resumido' : 'detalhado'}) gerado.`);
        }
      },
      error: async (erro: unknown) => {
        this.exportando.set(false);
        this.notificacoes.error(await mensagemDoErroDeExportacao(erro), { title: 'Não foi possível exportar' });
      }
    });
  }

  protected escolherMaterial(id: string | null): void {
    const opcao = this.materiais.items().find((m) => m.value === id);
    if (opcao) this.nomeMaterial.update((n) => ({ ...n, [opcao.value]: opcao.label }));
    this.lista.filters.idMaterial.set(id);
  }

  /**
   * Quem procura uma série (ex.: em que nota o medidor foi aplicado) quer o histórico inteiro:
   * o recorte padrão dos últimos dias sai, e o chip de data some junto. Data escolhida pelo usuário fica.
   */
  protected filtrarSerie(valor: string): void {
    this.lista.filters.numSerie.set(valor.trim() || null);
    const { from, to } = this.lista.filters.lancamento();
    if (valor.trim() && from === inicioPadrao() && !to) {
      this.lista.filters.lancamento.set({ from: null, to: null });
    }
  }

  protected lancamento(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.lancamento.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  protected status(s: StatusExecucao): (typeof STATUS_EXECUCAO)[StatusExecucao] | null {
    return STATUS_EXECUCAO[s] ?? null;
  }

  protected verNota(e: ExecucaoComercialResponse): void {
    window.open(this.router.serializeUrl(this.router.createUrlTree(['/execucao/comercial', e.id])), '_blank');
  }

  /** Selo da coluna Nota: só avulsa e ocorrência ganham selo; a comum fica limpa. */
  protected tipoDe(e: ExecucaoComercialResponse): (typeof TIPOS_NOTA)[TipoNota] | null {
    return e.tipoNota && e.tipoNota !== 'COMUM' ? TIPOS_NOTA[e.tipoNota] : null;
  }

  protected informarNumero(e: ExecucaoComercialResponse): void {
    this.avulsaEscolhida.set(e);
    this.numeroOficialAberto.set(true);
  }

  protected imprimir(e: ExecucaoComercialResponse): void {
    void this.router.navigate(['/execucao/comercial', e.id], { queryParams: { mode: 'print' } });
  }

  protected logs(e: ExecucaoComercialResponse): void {
    this.auditoria().show(e.id, e.referenciaNota, {
      referenciaNota: 'Ref. nota',
      statusExecucao: 'Status',
      valorTotalFaturado: 'Valor faturado',
      totalAlteracoes: 'Alterações'
    });
  }
}
