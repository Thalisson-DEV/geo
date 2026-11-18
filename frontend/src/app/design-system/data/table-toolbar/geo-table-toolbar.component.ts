import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'geo-table-toolbar',
  standalone: true,
  imports: [FormsModule, IconFieldModule, InputIconModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-table-toolbar' },
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
    }

    .geo-table-toolbar__primary,
    .geo-table-toolbar__actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .geo-table-toolbar__primary {
      min-width: 0;
      flex: 1 1 auto;
    }

    .geo-table-toolbar__search {
      width: min(100%, 22rem);
    }

    .geo-table-toolbar__search input {
      padding-left: 2rem;
    }

    .geo-table-toolbar__actions {
      flex: 0 0 auto;
      justify-content: flex-end;
    }

    @media (max-width: 40rem) {
      :host {
        align-items: stretch;
        flex-direction: column;
      }

      .geo-table-toolbar__search,
      .geo-table-toolbar__actions {
        width: 100%;
      }

      .geo-table-toolbar__actions {
        flex-wrap: wrap;
        justify-content: flex-start;
      }
    }
  `,
  template: `
    <div class="geo-table-toolbar__primary">
      @if (showSearch()) {
        <p-iconfield iconPosition="left" class="geo-table-toolbar__search">
          <p-inputicon class="pi pi-search" aria-hidden="true"></p-inputicon>
          <input
            pInputText
            type="search"
            class="geo-prime-control"
            [placeholder]="searchPlaceholder()"
            [attr.aria-label]="searchLabel()"
            [attr.aria-keyshortcuts]="keyShortcut() || null"
            [title]="keyShortcut() ? searchLabel() + ' (' + keyShortcut() + ')' : ''"
            [(ngModel)]="query"
            (input)="searchChanged.emit(query())"
          />
        </p-iconfield>
      }
      <ng-content select="[table-filters]"></ng-content>
    </div>

    <div class="geo-table-toolbar__actions" role="group" [attr.aria-label]="actionsLabel()">
      <ng-content></ng-content>
    </div>
  `
})
export class GeoTableToolbarComponent {
  readonly query = model('');
  readonly showSearch = input(true);
  readonly searchPlaceholder = input('Pesquisar registros');
  readonly searchLabel = input('Pesquisar registros');
  readonly actionsLabel = input('Ações da tabela');
  /** Atalho que leva o foco à busca, anunciado com `aria-keyshortcuts`. */
  readonly keyShortcut = input<string | undefined>();

  readonly searchChanged = output<string>();
}
