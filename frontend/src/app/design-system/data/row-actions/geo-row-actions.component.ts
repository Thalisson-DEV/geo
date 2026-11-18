import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GeoActionVariant } from '../../core';
import { GeoIconButtonComponent } from '../../primitives/button';

export interface GeoRowAction<T> {
  id: string;
  label: string;
  icon: string;
  variant?: Extract<GeoActionVariant, 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success'>;
  disabled?: boolean | ((row: T) => boolean);
  loading?: boolean | ((row: T) => boolean);
  visible?: boolean | ((row: T) => boolean);
}

export interface GeoRowActionEvent<T> {
  action: GeoRowAction<T>;
  row: T;
}

@Component({
  selector: 'geo-row-actions',
  standalone: true,
  imports: [GeoIconButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-row-actions' },
  styles: `
    :host,
    .geo-row-actions__group {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
    }
  `,
  template: `
    <div class="geo-row-actions__group" role="group" [attr.aria-label]="label()">
      @for (action of actions(); track action.id) {
        @if (isVisible(action)) {
          <geo-icon-button
            [icon]="action.icon"
            [label]="action.label"
            [variant]="action.variant || 'ghost'"
            [disabled]="isDisabled(action)"
            [loading]="isLoading(action)"
            size="icon-sm"
            (pressed)="activate(action)"
          ></geo-icon-button>
        }
      }
    </div>
  `
})
export class GeoRowActionsComponent<T = unknown> {
  readonly row = input.required<T>();
  readonly actions = input.required<readonly GeoRowAction<T>[]>();
  readonly label = input('Ações do registro');

  readonly actionSelected = output<GeoRowActionEvent<T>>();

  protected isVisible(action: GeoRowAction<T>): boolean {
    return this.resolve(action.visible, true);
  }

  protected isDisabled(action: GeoRowAction<T>): boolean {
    return this.resolve(action.disabled, false);
  }

  protected isLoading(action: GeoRowAction<T>): boolean {
    return this.resolve(action.loading, false);
  }

  protected activate(action: GeoRowAction<T>): void {
    if (this.isDisabled(action) || this.isLoading(action)) return;
    this.actionSelected.emit({ action, row: this.row() });
  }

  private resolve(
    value: boolean | ((row: T) => boolean) | undefined,
    fallback: boolean
  ): boolean {
    return typeof value === 'function' ? value(this.row()) : (value ?? fallback);
  }
}
