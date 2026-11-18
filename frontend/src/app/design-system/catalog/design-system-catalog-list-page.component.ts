import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { GeoDataTableColumn, GeoDataTableComponent, GeoCellDirective } from '../data';
import { GeoMultiSelectComponent, GeoSelectComponent, GeoSelectOption, GeoTextInputComponent } from '../forms';
import { GeoFormDrawerComponent } from '../forms/form-kit';
import { GeoFilterPanelComponent } from '../patterns/filter-panel';
import { GeoImportDrawerComponent, GeoImportRow, geoImportStatus } from '../patterns/import-drawer';
import { GeoListShortcutsDirective } from '../patterns/list-shortcuts';
import { GeoListRequest, geoFilter, geoListState } from '../patterns/list-state';
import { GeoPageHeaderComponent } from '../patterns/page-header';
import { GeoButtonComponent, GeoStatusComponent } from '../primitives';

interface Registro {
  id: string;
  placa: string;
  base: string;
  situacao: 'OPERANDO' | 'MANUTENCAO' | 'PARADO';
  km: number;
}

const BASES: GeoSelectOption<string>[] = [
  { label: 'Feira de Santana', value: 'FSA' },
  { label: 'Salvador', value: 'SSA' },
  { label: 'Vitória da Conquista', value: 'VDC' },
];
const SITUACOES: GeoSelectOption<Registro['situacao']>[] = [
  { label: 'Operando', value: 'OPERANDO' },
  { label: 'Em manutenção', value: 'MANUTENCAO' },
  { label: 'Parado', value: 'PARADO' },
];
const REGISTROS: Registro[] = Array.from({ length: 240 }, (_, i) => ({
  id: `r-${i}`,
  placa: `GEO${String(1000 + i)}`,
  base: BASES[i % 3].value,
  situacao: SITUACOES[i % 7 === 0 ? 2 : i % 5 === 0 ? 1 : 0].value,
  km: 12000 + i * 731,
}));

interface LinhaImportada extends GeoImportRow {
  placa: string;
  base: string;
  observacao: string;
}

/** Pré-visualização simulada: textos longos para mostrar a largura mínima e o limite de 3 linhas. */
const LINHAS_IMPORTADAS: LinhaImportada[] = Array.from({ length: 6 }, (_, i) => ({
  linha: i + 2,
  status: i === 2 ? 'COM_ERRO' : 'AGUARDANDO_PROCESSAMENTO',
  mensagemErro: i === 2 ? 'Base operacional não encontrada. Confira o código da base na planilha ou cadastre a base antes de importar.' : null,
  placa: `NEX${2000 + i}`,
  base: BASES[i % 3].label,
  observacao:
    'Veículo transferido da base anterior com documentação em dia, aguardando vistoria de entrada, troca de pneus dianteiros e instalação do rastreador da nova operadora.',
}));

type Filtros = { bases: string[]; situacao: Registro['situacao'] | null };

/** Servidor simulado: filtra, busca, ordena e pagina com atraso de rede. */
function servidor(pedido: GeoListRequest<Filtros>): Observable<{ content: Registro[]; page: { totalElements: number } }> {
  const termo = pedido.query.toLocaleLowerCase('pt-BR');
  let linhas = REGISTROS.filter(
    (r) =>
      (!pedido.filters.bases.length || pedido.filters.bases.includes(r.base)) &&
      (!pedido.filters.situacao || r.situacao === pedido.filters.situacao) &&
      (!termo || r.placa.toLocaleLowerCase('pt-BR').includes(termo)),
  );
  for (const regra of [...pedido.sort].reverse()) {
    const campo = regra.key as keyof Registro;
    linhas = [...linhas].sort((a, b) => (a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : 0) * (regra.direction === 'asc' ? 1 : -1));
  }
  const inicio = pedido.page * pedido.size;
  return of({ content: linhas.slice(inicio, inicio + pedido.size), page: { totalElements: linhas.length } }).pipe(delay(350));
}

/** Template de referência do padrão de listagem (docs/design-system/components/list-page.md). */
@Component({
  selector: 'geo-catalog-list-page',
  standalone: true,
  imports: [
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoImportDrawerComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo.set(true)">
      <geo-page-header
        title="Veículos"
        icon="pi pi-car"
        description="Abre direto nos dados. Filtros recolhidos com resumo, busca única no servidor e cadastro em drawer."
        helpLabel="Ajuda sobre a listagem"
        [favoritable]="false"
        [breadcrumb]="[{ label: 'Catálogo' }, { label: 'Listagem' }]"
      >
        <geo-status status tone="info" icon="pi-info-circle">Servidor simulado</geo-status>
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importando.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo veículo" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo.set(true)"></geo-button>
      </geo-page-header>

      <geo-filter-panel
        #painel
        storageKey="catalogo-listagem"
        [activeCount]="lista.activeCount()"
        [summary]="lista.summary()"
        [loading]="resultado.loading()"
        (applied)="lista.apply()"
        (cleared)="lista.reset()"
        (chipRemoved)="lista.remove($any($event))"
      >
        <div class="geo-filter-grid">
          <geo-multiselect label="Base" [options]="bases" [(value)]="lista.filters.bases" placeholder="Todas"></geo-multiselect>
          <geo-select label="Situação" [options]="situacoes" [(value)]="lista.filters.situacao" [clearable]="true" placeholder="Todas"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Veículos"
        mode="server"
        storageKey="catalogo-listagem"
        exportFileName="catalogo-veiculos"
        searchPlaceholder="Placa"
        rowActionLabel="Abrir ficha"
        emptyActionLabel="Novo veículo"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os veículos' : 'Nenhum veículo cadastrado'"
        [stateDescription]="resultado.error() ?? undefined"
        [filtered]="lista.filtered()"
        [pageSizeOptions]="[10, 25, 50, 100]"
        [selectable]="true"
        [selectionLimit]="100"
        [(selection)]="selecionados"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo.set(true)"
        (rowActivate)="novo.set(true)"
      >
        <geo-button selection-actions size="sm" variant="outline" icon="pi pi-wrench" label="Enviar para manutenção" (pressed)="selecionados.set([])"></geo-button>
        <ng-template geoCell="placa" let-row>
          <span class="geo-cell-strong">{{ row.placa }}</span>
          <span class="geo-cell-muted">{{ nomeBase(row.base) }}</span>
        </ng-template>
        <ng-template geoCell="situacao" let-row>
          <geo-status [tone]="row.situacao === 'OPERANDO' ? 'success' : row.situacao === 'PARADO' ? 'danger' : 'warning'" [icon]="row.situacao === 'OPERANDO' ? 'pi-check-circle' : row.situacao === 'PARADO' ? 'pi-pause-circle' : 'pi-wrench'">
            {{ nomeSituacao(row.situacao) }}
          </geo-status>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-import-drawer [(visible)]="importando" title="Importar veículos"
      description="Exemplo: selecione ou arraste qualquer .csv para carregar a pré-visualização simulada."
      [rows]="linhasImportadas()" (fileSelected)="linhasImportadas.set(exemploImportacao)"
      (cleared)="linhasImportadas.set([])" (processed)="linhasImportadas.set([]); importando.set(false)">
      <geo-select import-params label="Base de destino" [options]="bases" placeholder="Selecione a base"
        description="Parâmetro da importação (slot import-params), escolhido antes do arquivo."></geo-select>
      @if (linhasImportadas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao" [rows]="linhasImportadas()">
          <ng-template geoCell="status" let-row>
            @let situacao = situacaoImportacao(row.status);
            <geo-status [tone]="situacao.tone" [icon]="situacao.icon">{{ situacao.label }}</geo-status>
          </ng-template>
        </geo-data-table>
      }
    </geo-import-drawer>

    <geo-form-drawer [(visible)]="novo" title="Novo veículo" description="Exemplo de cadastro em drawer." size="md">
      <div class="geo-form-grid">
        <geo-text-input label="Placa" [required]="true"></geo-text-input>
        <geo-select label="Base" [options]="bases" [required]="true"></geo-select>
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="novo.set(false)"></geo-button>
        <geo-button label="Cadastrar veículo" (pressed)="novo.set(false)"></geo-button>
      </div>
    </geo-form-drawer>
  `,
})
export class DesignSystemCatalogListPageComponent {
  protected readonly bases = BASES;
  protected readonly situacoes = SITUACOES;
  protected readonly novo = signal(false);
  protected readonly importando = signal(false);
  protected readonly linhasImportadas = signal<readonly LinhaImportada[]>([]);
  protected readonly exemploImportacao = LINHAS_IMPORTADAS;
  protected readonly situacaoImportacao = geoImportStatus;
  protected readonly colunasImportacao: GeoDataTableColumn<LinhaImportada>[] = [
    { key: 'linha', header: 'Linha', type: 'integer' },
    { key: 'status', header: 'Situação', type: 'custom', value: (r) => r.status },
    { key: 'placa', header: 'Placa' },
    { key: 'base', header: 'Base' },
    { key: 'observacao', header: 'Observação' },
    { key: 'mensagemErro', header: 'Erro', display: (r) => r.mensagemErro ?? '—' },
  ];
  protected readonly selecionados = signal<readonly Registro[]>([]);

  protected readonly lista = geoListState({
    storageKey: 'catalogo-listagem',
    url: false,
    filters: {
      bases: geoFilter.list<string>([], { label: 'Base', itemLabel: (v) => this.nomeBase(v), countLabel: (n) => `${n} selecionadas` }),
      situacao: geoFilter.value<Registro['situacao'] | null>(null, { label: 'Situação', options: () => SITUACOES }),
    },
    sort: [{ key: 'placa', direction: 'asc' }],
  });
  protected readonly resultado = this.lista.results<Registro>(servidor);

  protected readonly colunas: GeoDataTableColumn<Registro>[] = [
    { key: 'placa', header: 'Placa', type: 'custom', priority: 1, sortField: 'placa', value: (r) => r.placa },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, sortField: 'situacao', value: (r) => r.situacao, display: (r) => this.nomeSituacao(r.situacao) },
    { key: 'km', header: 'KM atual', type: 'integer', sortField: 'km' },
  ];

  protected nomeBase(valor: string): string {
    return BASES.find((b) => b.value === valor)?.label ?? valor;
  }

  protected nomeSituacao(valor: string): string {
    return SITUACOES.find((s) => s.value === valor)?.label ?? valor;
  }
}
