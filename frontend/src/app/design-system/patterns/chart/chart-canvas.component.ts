import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import Chart from 'chart.js/auto';
import type { ActiveElement, ChartData, ChartOptions, ChartType, Plugin } from 'chart.js';

/** Ponto tocado num `geo-chart-canvas` (mesmo formato que o `p-chart` emitia). */
export interface GeoChartCanvasSelectEvent {
  readonly originalEvent: MouseEvent;
  /** Elemento mais próximo do clique (`index` = categoria, `datasetIndex` = série). */
  readonly element: ActiveElement;
  /** Elementos da série tocada. */
  readonly dataset: readonly ActiveElement[];
}

/**
 * Canvas do Chart.js para os gráficos do GEO, sem intermediário: substitui o `p-chart` (descontinuado
 * no PrimeNG 22). Tipado pelo tipo do gráfico — `type="doughnut"` exige `ChartData<'doughnut'>` e aceita
 * `cutout` nas opções. Para gráficos de painel prefira o `geo-chart`, que já cuida de cores, formato
 * pt-BR, resumo acessível e tabela de dados; este componente é a peça de baixo nível.
 *
 * Comportamento igual ao do `p-chart`: cria o gráfico depois da renderização, recria quando tipo, dados,
 * opções ou plugins mudam, e com altura ou largura fixa desliga `maintainAspectRatio`.
 */
@Component({
  selector: 'geo-chart-canvas',
  template: `
    <canvas
      #canvas
      role="img"
      [attr.aria-label]="ariaLabel() ?? null"
      [attr.aria-labelledby]="ariaLabelledBy() ?? null"
      [attr.width]="canvasWidth()"
      [attr.height]="canvasHeight()"
      (click)="onCanvasClick($event)"
    ></canvas>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-chart-canvas',
    '[style.display]': '"block"',
    '[style.position]': '"relative"',
    '[style.width]': 'width() ?? null',
    '[style.height]': 'height() ?? null',
  },
})
export class GeoChartCanvasComponent<TType extends ChartType = ChartType> {
  readonly type = input.required<TType>();
  readonly data = input<ChartData<TType> | null | undefined>();
  readonly options = input<ChartOptions<TType> | null | undefined>();
  readonly plugins = input<Plugin<TType>[]>([]);
  /** Largura do host (CSS, ex.: `100%`, `320px`). */
  readonly width = input<string | undefined>();
  /** Altura do host (CSS, ex.: `310px`, `13rem`). */
  readonly height = input<string | undefined>();
  readonly responsive = input(true, { transform: booleanAttribute });
  readonly ariaLabel = input<string | undefined>();
  readonly ariaLabelledBy = input<string | undefined>();

  readonly dataSelect = output<GeoChartCanvasSelectEvent>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart<TType> | null = null;
  private renderizado = false;

  constructor() {
    afterNextRender(() => {
      this.renderizado = true;
      this.criar();
    });
    effect(() => {
      // Lidos aqui para o efeito acompanhar; a recriação em si não registra dependências.
      this.type();
      this.data();
      this.options();
      this.plugins();
      this.responsive();
      this.width();
      this.height();
      if (this.renderizado) untracked(() => this.recriar());
    });
    inject(DestroyRef).onDestroy(() => this.destruir());
  }

  protected canvasWidth(): string | null {
    return this.responsive() && !this.width() ? null : (this.width() ?? null);
  }

  protected canvasHeight(): string | null {
    return this.responsive() && !this.height() ? null : (this.height() ?? null);
  }

  protected onCanvasClick(event: MouseEvent): void {
    if (!this.chart) return;
    const element = this.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
    const dataset = this.chart.getElementsAtEventForMode(event, 'dataset', { intersect: true }, false);
    if (element[0]) this.dataSelect.emit({ originalEvent: event, element: element[0], dataset });
  }

  private criar(): void {
    const data = this.data();
    if (!data) return;
    const responsivo = this.responsive();
    // O TypeScript não consegue checar o spread de um DeepPartial genérico em TType; o objeto é o
    // ChartOptions<TType> recebido mais `responsive`/`maintainAspectRatio`, que existem em todo tipo.
    const options = {
      ...(this.options() ?? {}),
      responsive: responsivo,
      ...(responsivo && (this.height() || this.width()) ? { maintainAspectRatio: false } : {}),
    } as ChartOptions<TType>;
    this.chart = new Chart<TType>(this.canvas().nativeElement, {
      type: this.type(),
      data,
      options,
      plugins: this.plugins(),
    });
  }

  private recriar(): void {
    this.destruir();
    this.criar();
  }

  private destruir(): void {
    this.chart?.destroy();
    this.chart = null;
  }
}
