import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GeoSurfaceVariant } from '../../core';

@Component({
  selector: 'geo-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-surface',
    '[attr.data-variant]': 'variant()',
    '[class.geo-surface--padded]': 'padded()',
    '[attr.tabindex]': "variant() === 'interactive' ? 0 : null"
  },
  template: `<ng-content></ng-content>`
})
export class GeoSurfaceComponent {
  readonly variant = input<GeoSurfaceVariant>('outlined');
  readonly padded = input(true);
}
