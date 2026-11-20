import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GeoAsyncStateComponent } from '../async-state/geo-async-state.component';

/**
 * Estado vazio padrão: ícone, frase curta que diz o porquê e, quando houver, a ação que resolve
 * ("Nenhuma obra no recorte" + "Limpar filtros" / "Nova obra"). Atalho de `geo-async-state`
 * com `state="empty"`.
 */
@Component({
  selector: 'geo-empty-state',
  standalone: true,
  imports: [GeoAsyncStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-async-state
      state="empty"
      [title]="title()"
      [description]="description()"
      [icon]="icon()"
      [compact]="compact()"
      [actionLabel]="actionLabel()"
      [actionIcon]="actionIcon()"
      [secondaryActionLabel]="secondaryActionLabel()"
      [secondaryActionIcon]="secondaryActionIcon()"
      (action)="action.emit()"
      (secondaryAction)="secondaryAction.emit()"
    />
  `
})
export class GeoEmptyStateComponent {
  readonly title = input<string>('Nada por aqui ainda');
  readonly description = input<string | undefined>();
  readonly icon = input<string | undefined>('pi-inbox');
  readonly compact = input(false);
  readonly actionLabel = input<string | undefined>();
  readonly actionIcon = input<string | undefined>();
  readonly secondaryActionLabel = input<string | undefined>();
  readonly secondaryActionIcon = input<string | undefined>();
  readonly action = output<void>();
  readonly secondaryAction = output<void>();
}
