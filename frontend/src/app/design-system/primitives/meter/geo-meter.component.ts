import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GeoTone } from '../../core';

/** Limiar a partir do qual o atingimento deixa de ser crítico. Compartilhado com a Bússola. */
export const GEO_ATTAINMENT_WARNING_THRESHOLD = 80;

export type GeoAttainmentBand = 'success' | 'warning' | 'danger';

/** Faixa de atingimento de meta: ≥ 100% sucesso; 80–99% atenção; < 80% crítico. */
export function geoAttainmentBand(percent: number): GeoAttainmentBand {
  if (percent >= 100) return 'success';
  if (percent >= GEO_ATTAINMENT_WARNING_THRESHOLD) return 'warning';
  return 'danger';
}

const BAND_ICON: Record<GeoAttainmentBand, string> = {
  success: 'pi pi-check-circle',
  warning: 'pi pi-exclamation-circle',
  danger: 'pi pi-times-circle'
};

const BAND_TEXT: Record<GeoAttainmentBand, string> = {
  success: 'meta atingida',
  warning: 'abaixo da meta',
  danger: 'crítico'
};

/**
 * Medidor de atingimento (realizado/meta) com tom semântico, ícone e texto — cor nunca é o único
 * indicador. A barra satura em 100%; o percentual exibido não.
 */
@Component({
  selector: 'geo-meter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-meter',
    '[attr.data-tone]': 'tone()'
  },
  styles: `
    :host {
      display: grid;
      gap: 0.25rem;
      min-width: 0;
      --geo-meter-color: var(--geo-info);
      --geo-meter-text: var(--geo-info-text);
    }

    :host([data-tone='success']) { --geo-meter-color: var(--geo-success); --geo-meter-text: var(--geo-success-text); }
    :host([data-tone='warning']) { --geo-meter-color: var(--geo-warning); --geo-meter-text: var(--geo-warning-text); }
    :host([data-tone='danger']) { --geo-meter-color: var(--geo-danger); --geo-meter-text: var(--geo-danger-text); }
    :host([data-tone='neutral']) { --geo-meter-color: var(--geo-foreground-muted); --geo-meter-text: var(--geo-foreground-muted); }

    .geo-meter__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: var(--geo-font-caption);
      font-variant-numeric: tabular-nums;
    }

    .geo-meter__detail {
      color: var(--geo-foreground-muted);
    }

    .geo-meter__value {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--geo-meter-text);
      font-weight: var(--geo-font-weight-semibold);
    }

    .geo-meter__track {
      height: 0.375rem;
      overflow: hidden;
      border-radius: 999px;
      background: var(--geo-surface-muted);
    }

    .geo-meter__bar {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--geo-meter-color);
      transition: width 200ms ease;
    }

    @media (prefers-reduced-motion: reduce) {
      .geo-meter__bar { transition: none; }
    }
  `,
  template: `
    <div class="geo-meter__head">
      @if (detail()) {
        <span class="geo-meter__detail">{{ detail() }}</span>
      }
      <span class="geo-meter__value">
        <i [class]="icon()" aria-hidden="true"></i>
        {{ percentLabel() }}
        <span class="geo-sr-only">— {{ bandText() }}</span>
      </span>
    </div>
    <div
      class="geo-meter__track"
      role="meter"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="clamped()"
      [attr.aria-valuetext]="percentLabel() + ' — ' + bandText()"
      [attr.aria-label]="label()"
    >
      <span class="geo-meter__bar" [style.width.%]="clamped()"></span>
    </div>
  `
})
export class GeoMeterComponent {
  /** Percentual atingido (0–100+). */
  readonly value = input.required<number>();
  /** Nome acessível do medidor (ex.: "Atingimento da meta de Maria"). */
  readonly label = input('Atingimento da meta');
  /** Texto auxiliar à esquerda (ex.: "42/40"). */
  readonly detail = input<string | undefined>();
  /** Força um tom; padrão = faixa de atingimento. */
  readonly toneOverride = input<GeoTone | undefined>(undefined, { alias: 'tone' });

  protected readonly band = computed(() => geoAttainmentBand(this.value() ?? 0));
  protected readonly tone = computed<GeoTone>(() => this.toneOverride() ?? this.band());
  protected readonly clamped = computed(() => Math.max(0, Math.min(100, Math.round(this.value() ?? 0))));
  protected readonly percentLabel = computed(
    () => `${(this.value() ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
  );
  protected readonly icon = computed(() => BAND_ICON[this.band()]);
  protected readonly bandText = computed(() => BAND_TEXT[this.band()]);
}
