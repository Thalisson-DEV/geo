import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface GeoSegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: string;
  /** Número ao lado do rótulo (ex.: quantos itens a opção mostra). */
  count?: number | null;
  /** Texto de apoio para leitores de tela e dica ao passar o mouse. */
  description?: string;
  disabled?: boolean;
}

/**
 * Controle segmentado: escolhe uma entre poucas opções mutuamente exclusivas que estão sempre à vista
 * (forma de visualizar, destino de um item). O estado escolhido usa `aria-pressed`, fundo e sombra — não só cor.
 * Para filtros que se somam, use `.geo-quick-filter`.
 */
@Component({
  selector: 'geo-segmented',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-segmented',
    role: 'group',
    '[attr.aria-label]': 'label()',
    '[attr.data-size]': 'size()',
    '[class.geo-segmented--full]': 'fullWidth()',
  },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      max-width: 100%;
      padding: 2px;
      border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-md);
      background: var(--geo-surface-subtle);
    }
    :host(.geo-segmented--full) { display: flex; width: 100%; }
    :host(.geo-segmented--full) button { flex: 1; justify-content: center; }
    button {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: calc(var(--geo-control-height-sm) - 2px);
      padding: 0 0.75rem;
      border: 0;
      border-radius: calc(var(--geo-radius-md) - 2px);
      background: transparent;
      color: var(--geo-foreground-muted);
      font: inherit;
      font-size: var(--geo-font-control);
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }
    :host([data-size='md']) button { min-height: calc(var(--geo-control-height-md) - 2px); }
    button:hover:not(:disabled) { color: var(--geo-foreground); }
    button[aria-pressed='true'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-shadow-sm); }
    button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    button:disabled { cursor: not-allowed; opacity: 0.5; }
    .pi { font-size: var(--geo-font-caption); }
    .geo-segmented__count {
      min-width: 1.25rem;
      padding: 0 0.3125rem;
      border-radius: 999px;
      background: var(--geo-surface-muted);
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    button[aria-pressed='true'] .geo-segmented__count { background: var(--geo-brand-soft); color: var(--geo-foreground); }
  `,
  template: `
    @for (o of options(); track o.value) {
      <button type="button" [attr.aria-pressed]="value() === o.value" [disabled]="o.disabled || disabled()"
        [attr.title]="o.description ?? null" (click)="escolher(o)">
        @if (o.icon) { <i [class]="o.icon" aria-hidden="true"></i> }
        <span>{{ o.label }}</span>
        @if (o.count !== undefined && o.count !== null) { <span class="geo-segmented__count">{{ o.count }}</span> }
      </button>
    }
  `,
})
export class GeoSegmentedComponent<T extends string = string> {
  readonly options = input.required<readonly GeoSegmentedOption<T>[]>();
  readonly value = model<T | null>(null);
  /** Nome do grupo para leitores de tela (ex.: "Forma de visualizar"). */
  readonly label = input.required<string>();
  readonly size = input<'sm' | 'md'>('sm');
  readonly fullWidth = input(false);
  readonly disabled = input(false);

  protected escolher(o: GeoSegmentedOption<T>): void {
    if (o.disabled || this.disabled() || o.value === this.value()) return;
    this.value.set(o.value);
  }
}
