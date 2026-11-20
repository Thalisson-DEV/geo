import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GeoTone } from '../../core';
import { GeoStatusComponent } from './geo-status.component';

/** Severidade do contrato de API (valores do p-tag). */
export type GeoUiSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** Status pronto para a interface, como o backend devolve (`StatusDto`). */
export interface GeoStatusDto {
  code: string;
  label: string;
  severity: GeoUiSeverity;
}

const TOM_POR_SEVERIDADE: Readonly<Record<GeoUiSeverity, GeoTone>> = {
  success: 'success',
  info: 'info',
  warn: 'warning',
  danger: 'danger',
  secondary: 'neutral',
  contrast: 'brand'
};

/** Tom do GEO para uma severidade do contrato (desconhecida → neutro). */
export function geoToneDaSeveridade(severity: string | null | undefined): GeoTone {
  return TOM_POR_SEVERIDADE[severity as GeoUiSeverity] ?? 'neutral';
}

/**
 * Tag de status alimentada direto pelo `StatusDto` da API ({ code, label, severity }): a tela não
 * mantém tabela própria de rótulos e cores. Para status montado na tela, use `<geo-status>`.
 */
@Component({
  selector: 'geo-status-tag',
  standalone: true,
  imports: [GeoStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status(); as s) {
      <geo-status [tone]="tom()" [icon]="icon()" [attr.data-code]="s.code">{{ s.label }}</geo-status>
    } @else {
      <span class="geo-status-tag__vazio" aria-label="Sem status">—</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; }
    .geo-status-tag__vazio { color: var(--geo-foreground-subtle); }
  `]
})
export class GeoStatusTagComponent {
  readonly status = input<GeoStatusDto | null | undefined>();
  /** Ícone específico do status (`pi-truck`); sem ele, vale o ícone padrão do tom. */
  readonly icon = input<string | null | undefined>();
  protected readonly tom = computed(() => geoToneDaSeveridade(this.status()?.severity));
}
