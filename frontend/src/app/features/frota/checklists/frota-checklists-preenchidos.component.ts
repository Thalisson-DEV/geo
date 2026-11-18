import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesFilterPanelComponent,
  CesMultiSelectComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  cesFilter,
  cesListState
} from '@ces/ui';
import { ChecklistResumo } from '../../../core/models/frota-checklist.models';
import { contar, formatarMedicao, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaChecklistDetalheDrawerComponent } from './frota-checklist-detalhe-drawer.component';

const OPCOES_PROBLEMA: CesSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Com Não OK', value: true },
  { label: 'Sem problema', value: false }
];

/** Checklists preenchidos no app, do mais recente para o mais antigo; a linha abre o detalhe com as fotos. */
@Component({
  selector: 'app-frota-checklists-preenchidos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesCellDirective,
    CesDataTableComponent,
    CesDatepickerComponent,
    CesFilterPanelComponent,
    CesMultiSelectComponent,
    CesSelectComponent,
    CesStatusComponent,
    FrotaChecklistDetalheDrawerComponent
  ],
  template: `
    <div class="ces-form-stack">
      <ces-filter-panel #painel storageKey="frota-checklists" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="ces-filter-grid">
          <ces-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></ces-multiselect>
          <ces-datepicker label="De" [value]="dataLocal(lista.filters.de())" [clearable]="true" (valueChange)="lista.filters.de.set(dataIso($event))"></ces-datepicker>
          <ces-datepicker label="Até" [value]="dataLocal(lista.filters.ate())" [clearable]="true" (valueChange)="lista.filters.ate.set(dataIso($event))"></ces-datepicker>
          <ces-select label="Problemas" [options]="opcoesProblema" [(value)]="lista.filters.comProblema"></ces-select>
        </div>
      </ces-filter-panel>

      <ces-data-table title="Checklists preenchidos" mode="server" [description]="descricao()" [searchable]="false"
        storageKey="frota-checklists" exportFileName="frota-checklists" [columns]="colunas" [rows]="resultado.rows()"
        [totalRecords]="resultado.total()" [rowKey]="chave" [rowLabel]="rotulo" [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os checklists' : 'Nenhum checklist preenchido'"
        [stateDescription]="resultado.error() ?? 'Os checklists feitos no app aparecem aqui.'"
        noResultsTitle="Nenhum checklist com esse recorte." [filtered]="lista.filtered()"
        [exportRows]="exportar" [exportLimit]="limiteExportacao"
        [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()"
        [rowClickable]="true" (rowActivate)="abrir($event)">
        <ng-template cesCell="preenchidoEm" let-row>{{ row.preenchidoEm | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
        <ng-template cesCell="placa" let-row>
          <span class="ces-cell-strong">{{ placa(row.placa) }}</span>
          <span class="ces-cell-muted">{{ row.modeloNome }}</span>
        </ng-template>
        <ng-template cesCell="condutorNome" let-row>
          {{ row.condutorNome ?? '—' }}
          @if (row.passagemVeiculo) {
            <span class="ces-cell-muted">Recebeu o veículo</span>
          }
        </ng-template>
        <ng-template cesCell="problemas" let-row>
          @if (row.problemas) {
            <ces-status tone="warning" icon="pi-exclamation-triangle">{{ row.problemas }} Não OK</ces-status>
          } @else {
            <ces-status tone="success" icon="pi-check">Tudo OK</ces-status>
          }
          @if (row.liberacaoCnh) {
            <span class="ces-cell-muted">Com liberação de CNH</span>
          }
        </ng-template>
      </ces-data-table>
    </div>

    <app-frota-checklist-detalhe-drawer [(visible)]="detalheAberto" [idChecklist]="selecionado()"></app-frota-checklist-detalhe-drawer>
  `
})
export class FrotaChecklistsPreenchidosComponent {
  private readonly checklist = inject(FrotaChecklistService);
  /** Placa que acompanha o filtro de veículo quando a tela é aberta a partir do mapa ou da ficha. */
  private readonly placaDoFiltro = inject(ActivatedRoute).snapshot.queryParamMap.get('placa');

  protected readonly bases = basesFrota();
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly placa = formatarPlaca;
  protected readonly opcoesProblema = OPCOES_PROBLEMA;
  protected readonly detalheAberto = signal(false);
  protected readonly selecionado = signal<string | null>(null);

  protected readonly lista = cesListState({
    storageKey: 'frota-checklists',
    rememberFilters: 'frota-checklists',
    filters: {
      idVeiculo: cesFilter.value<string | null>(null, {
        label: 'Veículo',
        param: 'veiculo',
        type: 'string',
        format: (id) => (id ? (this.placaDoFiltro ? formatarPlaca(this.placaDoFiltro) : 'Veículo escolhido') : null)
      }),
      idsBase: cesFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      de: cesFilter.date(null, { label: 'De' }),
      ate: cesFilter.date(null, { label: 'Até' }),
      comProblema: cesFilter.value<boolean | null>(null, { label: 'Problemas', param: 'problema', options: () => OPCOES_PROBLEMA })
    },
    sort: [{ key: 'preenchidoEm', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<ChecklistResumo>(
    (pedido) => this.checklist.checklists(pedido.filters, paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.checklist.checklists(this.lista.request().filters, pagina),
    () => this.lista.request()
  );
  protected readonly descricao = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'checklist', 'checklists', 'Nenhum checklist')
  );

  protected readonly colunas: CesDataTableColumn<ChecklistResumo>[] = [
    { key: 'preenchidoEm', header: 'Quando', type: 'custom', priority: 1, sortField: 'preenchidoEm', value: (c) => c.preenchidoEm, display: (c) => c.preenchidoEm },
    { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, sortField: 'placa', value: (c) => c.placa, display: (c) => `${formatarPlaca(c.placa)} ${c.modeloNome}` },
    { key: 'condutorNome', header: 'Condutor', type: 'custom', priority: 1, value: (c) => c.condutorNome, display: (c) => c.condutorNome ?? '' },
    { key: 'medicao', header: 'KM / horas', type: 'custom', sortField: 'medicao', value: (c) => c.medicao, display: (c) => formatarMedicao(c.medicao, c.unidadeMedicao) },
    { key: 'problemas', header: 'Resultado', type: 'custom', priority: 1, value: (c) => c.problemas, display: (c) => (c.problemas ? `${c.problemas} Não OK` : 'Tudo OK') },
    { key: 'baseNome', header: 'Base', display: (c) => c.baseNome ?? '—' },
    { key: 'preenchidoPor', header: 'Preenchido por', display: (c) => c.preenchidoPor ?? '—' }
  ];
  protected readonly chave = (c: ChecklistResumo) => c.id;
  protected readonly rotulo = (c: ChecklistResumo) => `checklist de ${formatarPlaca(c.placa)}`;

  protected abrir(c: ChecklistResumo): void {
    this.selecionado.set(c.id);
    this.detalheAberto.set(true);
  }
}
