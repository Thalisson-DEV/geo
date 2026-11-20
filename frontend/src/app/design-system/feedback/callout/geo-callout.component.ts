import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GeoTone } from '../../core';
import { GeoIconComponent } from '../../icons/geo-icon.component';

interface CalloutPresentation {
  icon: string;
  label: string;
}

/**
 * Bloco de mensagem contextual para conteúdo editorial e instrucional.
 *
 * Diferente de `geo-status` (rótulo inline) e de `geo-async-state` (estado de carga de
 * uma região), o callout carrega texto explicativo que precisa continuar legível em
 * papel. O tom nunca é o único indicador: um rótulo textual acompanha a cor e o ícone.
 */
@Component({
  selector: 'geo-callout',
  standalone: true,
  imports: [GeoIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-callout',
    '[attr.data-tone]': 'tone()',
    '[class.geo-callout--dense]': 'dense()'
  },
  template: `
    <span class="geo-callout__icon" aria-hidden="true">
      <geo-icon class="geo-icon--texto" [name]="presentation().icon" />
    </span>

    <div class="geo-callout__body">
      <p class="geo-callout__heading">
        <span class="geo-callout__label">{{ label() || presentation().label }}</span>
        @if (title()) {
          <strong class="geo-callout__title">{{ title() }}</strong>
        }
      </p>

      <div class="geo-callout__content">
        <ng-content></ng-content>
      </div>
    </div>
  `
})
export class GeoCalloutComponent {
  readonly tone = input<GeoTone>('info');
  readonly title = input<string | undefined>();
  readonly icon = input<string | undefined>();
  readonly label = input<string | undefined>();
  readonly dense = input(false);

  protected readonly presentation = computed<CalloutPresentation>(() => {
    const presentations: Record<GeoTone, CalloutPresentation> = {
      neutral: { icon: 'info', label: 'Nota' },
      brand: { icon: 'lightbulb', label: 'Destaque' },
      info: { icon: 'info', label: 'Informação' },
      success: { icon: 'circle-check', label: 'Confirmado' },
      warning: { icon: 'triangle-alert', label: 'Atenção' },
      danger: { icon: 'circle-x', label: 'Crítico' }
    };

    const presentation = presentations[this.tone()];
    const custom = this.icon()?.trim();
    if (!custom) return presentation;

    // Nome Lucide ou classe PrimeIcons (`pi pi-star`): o geo-icon resolve os dois.
    return { ...presentation, icon: custom };
  });
}
