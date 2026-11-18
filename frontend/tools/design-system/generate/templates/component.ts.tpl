import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'geo-{{NAME}}',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{NAME}}.component.html',
  styleUrl: './{{NAME}}.component.css',
  host: {
    class: 'geo-{{NAME}}',
    '[attr.aria-label]': 'ariaLabel()'
  }
})
export class {{CLASS_NAME}}Component {
  /** Replace this baseline API with the smallest semantic contract the component needs. */
  readonly ariaLabel = input<string | null>(null);
}
