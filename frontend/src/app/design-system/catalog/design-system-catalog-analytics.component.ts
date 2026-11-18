import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';
import { GeoCellDirective, GeoDataTableColumn, GeoDataTableComponent } from '../data/data-table';
import { GeoDrawerComponent } from '../overlays';
import { GeoChartComponent, GeoChartPointSelection } from '../patterns/chart';
import {
  GEO_CHART_CATALOG_LABELS,
  GEO_CHART_CATALOG_SERIES,
} from '../patterns/chart/chart.catalog.fixture';
import {
  GeoButtonComponent,
  GeoMeterComponent,
  GeoRankBadgeComponent,
  GeoSurfaceComponent,
} from '../primitives';

interface CatalogInspector {
  id: string;
  posicao: number;
  nome: string;
  realizado: number;
  meta: number;
  percentual: number;
  desvios: number;
}

/**
 * Página do catálogo dedicada aos padrões analíticos (drill-down, tabela analítica, medidores).
 * Fica fora da página principal para não alterar a regressão visual existente.
 */
@Component({
  selector: 'geo-design-system-catalog-analytics',
  standalone: true,
  imports: [
    GeoButtonComponent,
    GeoCellDirective,
    GeoChartComponent,
    GeoDataTableComponent,
    GeoDrawerComponent,
    GeoMeterComponent,
    GeoRankBadgeComponent,
    GeoSurfaceComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './design-system-catalog.component.css',
  styles: `
    .geo-catalog-analytics {
      display: grid;
      gap: 1.5rem;
      max-width: 72rem;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
    }

    .geo-catalog-analytics__header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;
    }

    .geo-catalog-analytics__header h1 {
      margin: 0.25rem 0 0;
      color: var(--geo-foreground);
      font-size: 1.5rem;
    }

    .geo-catalog-analytics__header p {
      margin: 0.35rem 0 0;
      color: var(--geo-foreground-muted);
    }

    .geo-catalog-analytics__grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    }

    .geo-catalog-analytics__meters {
      display: grid;
      gap: 0.875rem;
    }

    .geo-catalog-analytics__podium {
      display: flex;
      gap: 0.5rem;
    }
  `,
  template: `
    <main class="geo-catalog-analytics">
      <header class="geo-catalog-analytics__header">
        <div>
          <span class="geo-catalog__eyebrow">Design System GEO · BI</span>
          <h1>Analítico e drill-down</h1>
          <p>
            Gráfico selecionável abrindo painel de detalhe, tabela analítica com ordenação
            multicoluna (Shift+clique), busca, paginação lembrada, CSV e cards no celular.
          </p>
        </div>
        <geo-button
          [label]="theme.isDarkMode() ? 'Usar tema claro' : 'Usar tema escuro'"
          [icon]="theme.isDarkMode() ? 'pi pi-sun' : 'pi pi-moon'"
          variant="outline"
          (pressed)="theme.setDarkMode(!theme.isDarkMode())"
        ></geo-button>
      </header>

      <div class="geo-catalog-analytics__grid">
        <geo-surface variant="outlined" [padded]="true">
          <geo-chart
            kind="bar"
            title="Inspeções por mês"
            description="Clique numa barra ou use “Ver dados” para detalhar."
            [labels]="chartLabels"
            [series]="chartSeries"
            valueFormat="integer"
            [height]="220"
            [animated]="false"
            [selectable]="true"
            (pointSelect)="openDrill($event)"
          ></geo-chart>
        </geo-surface>
        <geo-surface variant="outlined" [padded]="true">
          <div class="geo-catalog-analytics__meters">
            <geo-meter [value]="112" detail="45/40" label="Atingimento acima da meta"></geo-meter>
            <geo-meter [value]="91" detail="36/40" label="Atingimento em atenção"></geo-meter>
            <geo-meter [value]="54" detail="21/40" label="Atingimento crítico"></geo-meter>
            <div class="geo-catalog-analytics__podium">
              <geo-rank-badge [position]="1"></geo-rank-badge>
              <geo-rank-badge [position]="2"></geo-rank-badge>
              <geo-rank-badge [position]="3"></geo-rank-badge>
              <geo-rank-badge [position]="4"></geo-rank-badge>
            </div>
          </div>
        </geo-surface>
      </div>

      <geo-data-table
        title="Produtividade · Inspetores"
        description="Ranking de realização e atingimento da meta individual."
        storageKey="catalogo-inspetores"
        exportFileName="inspetores-catalogo"
        rowActionLabel="Ver histórico"
        [columns]="tableColumns"
        [rows]="tableRows"
        [rowLabel]="nomeInspetor"
        (rowActivate)="openInspector($event)"
      >
        <ng-template geoCell="posicao" let-row>
          <geo-rank-badge [position]="row.posicao"></geo-rank-badge>
        </ng-template>
        <ng-template geoCell="percentual" let-row>
          <geo-meter
            [value]="row.percentual"
            [detail]="row.realizado + '/' + row.meta"
            [label]="'Atingimento de ' + row.nome"
          ></geo-meter>
        </ng-template>
      </geo-data-table>
    </main>

    <!-- Criado já aberto dentro de @if, como nos dashboards (drill pela URL). -->
    @if (drillOpen()) {
    <geo-drawer
      [visible]="true"
      (visibleChange)="drillOpen.set($event)"
      eyebrow="Detalhe"
      [title]="drillLabel()"
      description="Recorte com os filtros aplicados no painel."
    >
      <p>Conteúdo do recorte: mini-KPIs, lista paginada e quebras.</p>
      <geo-button drawer-footer variant="outline" label="Ver todas na listagem" icon="pi pi-external-link"></geo-button>
      <geo-button drawer-footer label="Fechar" (pressed)="drillOpen.set(false)"></geo-button>
    </geo-drawer>
    }
  `,
})
export class DesignSystemCatalogAnalyticsComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly chartLabels = GEO_CHART_CATALOG_LABELS;
  protected readonly chartSeries = GEO_CHART_CATALOG_SERIES.slice(0, 1);
  protected readonly drillOpen = signal(false);
  protected readonly drillLabel = signal('');
  protected readonly nomeInspetor = (row: CatalogInspector) => row.nome;

  protected readonly tableColumns: GeoDataTableColumn<CatalogInspector>[] = [
    { key: 'posicao', header: 'Posição', type: 'custom', value: (row) => row.posicao, width: '5rem', priority: 1, exportable: false },
    { key: 'nome', header: 'Inspetor', priority: 1 },
    { key: 'realizado', header: 'Realizado', type: 'integer', priority: 1 },
    { key: 'percentual', header: '% atingido', type: 'custom', value: (row) => row.percentual, width: '11rem', priority: 1 },
    { key: 'desvios', header: 'Desvios', type: 'integer' },
  ];

  protected readonly tableRows: CatalogInspector[] = [
    'Ana Ribeiro', 'Bruno Costa', 'Carla Nunes', 'Diego Alves', 'Elisa Prado', 'Fábio Reis',
    'Gabriela Lins', 'Hugo Matos', 'Íris Campos', 'João Teles', 'Karen Duarte', 'Luís Pires',
  ].map((nome, indice) => {
    const realizado = 48 - indice * 3;
    return {
      id: `insp-${indice}`,
      posicao: indice + 1,
      nome,
      realizado,
      meta: 40,
      percentual: (realizado / 40) * 100,
      desvios: (indice * 7) % 5,
    };
  });

  protected openDrill(selection: GeoChartPointSelection): void {
    this.drillLabel.set(`Inspeções em ${selection.label}`);
    this.drillOpen.set(true);
  }

  protected openInspector(row: CatalogInspector): void {
    this.drillLabel.set(`Histórico de ${row.nome}`);
    this.drillOpen.set(true);
  }
}
