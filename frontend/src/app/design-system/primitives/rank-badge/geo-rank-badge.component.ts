import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Posição em ranking. Do 1º ao 3º lugar o selo ganha destaque (tokens `--geo-rank-*`) e ícone de
 * medalha; o texto "1º lugar" sempre acompanha para leitores de tela — cor não é o único indicador.
 */
@Component({
  selector: 'geo-rank-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-rank-badge',
    '[attr.data-podium]': 'podium()',
    '[attr.title]': 'label()'
  },
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border: 1px solid transparent;
      border-radius: var(--geo-radius-sm);
      background: var(--geo-surface-muted);
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption);
      font-weight: var(--geo-font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }

    :host([data-podium='1']) { background: var(--geo-rank-1-soft); border-color: var(--geo-rank-1); color: var(--geo-rank-1-text); }
    :host([data-podium='2']) { background: var(--geo-rank-2-soft); border-color: var(--geo-rank-2); color: var(--geo-rank-2-text); }
    :host([data-podium='3']) { background: var(--geo-rank-3-soft); border-color: var(--geo-rank-3); color: var(--geo-rank-3-text); }
  `,
  template: `
    @if (podium()) {
      <i class="pi pi-trophy" aria-hidden="true"></i>
    } @else {
      <span aria-hidden="true">{{ position() }}</span>
    }
    <span class="geo-sr-only">{{ label() }}</span>
  `
})
export class GeoRankBadgeComponent {
  readonly position = input.required<number>();

  protected readonly podium = computed(() => (this.position() >= 1 && this.position() <= 3 ? String(this.position()) : null));
  protected readonly label = computed(() => `${this.position()}º lugar`);
}
