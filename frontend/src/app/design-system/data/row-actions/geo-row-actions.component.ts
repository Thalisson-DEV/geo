import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
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
  imports: [GeoIconButtonComponent, MenuModule],
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
      @for (action of inline(); track action.id) {
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
      @if (overflow().length) {
        <geo-icon-button icon="pi pi-ellipsis-h" [label]="moreLabel()" size="icon-sm" aria-haspopup="menu" (click)="menu.toggle($event)"></geo-icon-button>
        <p-menu #menu [model]="overflow()" [popup]="true" appendTo="body"></p-menu>
      }
    </div>
  `
})
export class GeoRowActionsComponent<T = unknown> {
  readonly row = input.required<T>();
  readonly actions = input.required<readonly GeoRowAction<T>[]>();
  readonly label = input('Ações do registro');
  /** Quantas ações ficam como ícone na linha; as demais vão para o menu "Mais ações". Sem valor, todas inline. */
  readonly maxVisible = input<number | null>(null);
  readonly moreLabel = input('Mais ações');

  private readonly visibleActions = computed(() => this.actions().filter((action) => this.isVisible(action)));

  protected readonly inline = computed(() => {
    const visiveis = this.visibleActions();
    const max = this.maxVisible();
    // Menu só compensa a partir de duas ações escondidas; uma sobra fica inline.
    return max == null || visiveis.length <= max + 1 ? visiveis : visiveis.slice(0, max);
  });

  protected readonly overflow = computed<MenuItem[]>(() => {
    const inline = this.inline();
    return this.visibleActions()
      .filter((action) => !inline.includes(action))
      .map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        disabled: this.isDisabled(action) || this.isLoading(action),
        styleClass: action.variant === 'destructive' ? 'geo-menu-item--danger' : undefined,
        command: () => this.activate(action)
      }));
  });

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
