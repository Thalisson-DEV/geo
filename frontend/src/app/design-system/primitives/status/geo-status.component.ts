import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GeoTone } from '../../core';
import { GeoIconComponent } from '../../icons/geo-icon.component';

/**
 * Ícone usado quando a tag não informa um próprio. Toda tag do GEO tem ícone:
 * prefira passar um ícone que diga o significado (ex.: `pi-truck` para "Em trânsito");
 * na falta dele, o tom define o ícone para a cor nunca ser o único indicador.
 */
export const GEO_STATUS_ICONE_PADRAO: Readonly<Record<GeoTone, string>> = {
  neutral: 'pi-circle',
  brand: 'pi-bookmark',
  info: 'pi-info-circle',
  success: 'pi-check-circle',
  warning: 'pi-exclamation-triangle',
  danger: 'pi-times-circle'
};

@Component({
  selector: 'geo-status',
  standalone: true,
  imports: [GeoIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-status',
    '[attr.data-tone]': 'tone()',
    '[attr.data-emphasis]': 'emphasis()'
  },
  template: `
    <geo-icon class="geo-status__icon" [name]="primeIcon()" size="sm" />
    <span><ng-content></ng-content></span>
  `
})
export class GeoStatusComponent {
  readonly tone = input<GeoTone>('neutral');
  readonly emphasis = input<'soft' | 'outline' | 'solid'>('soft');
  /** Ícone PrimeIcons (`pi-check` ou `pi pi-check`). Sem ele, vale o ícone padrão do tom. */
  readonly icon = input<string | null | undefined>();

  protected readonly primeIcon = computed(() => {
    const icon = this.icon()?.trim() || GEO_STATUS_ICONE_PADRAO[this.tone()] || GEO_STATUS_ICONE_PADRAO.neutral;
    return icon.startsWith('pi ') ? icon : `pi ${icon}`;
  });
}
