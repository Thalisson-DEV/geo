import { ChangeDetectionStrategy, Component, InjectionToken, Signal, computed, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { GeoIconButtonComponent } from '../../primitives/button';

/** Trecho da trilha acima do título. O primeiro item é o módulo; o último é a página atual. */
export interface GeoBreadcrumbItem {
  readonly label: string;
  /** Rota do trecho. Sem rota, o trecho é texto (o último sempre é a página atual). */
  readonly route?: string | readonly unknown[];
  /** Preserva o recorte da lista de origem ("voltar ao mesmo recorte"). */
  readonly queryParams?: Params | null;
}

/**
 * Favoritos da página atual. O DS não depende de `core/`: o app provê este token
 * (em `app.config.ts`) a partir do serviço de favoritos do usuário.
 */
export interface GeoPageFavorites {
  readonly isCurrentPageFavorite: Signal<boolean>;
  toggle(title: string, icon?: string): void;
}

export const GEO_PAGE_FAVORITES = new InjectionToken<GeoPageFavorites>('GEO_PAGE_FAVORITES');

/**
 * Cabeçalho de página de listagem e de painel: trilha, ícone do assunto, título (`h1`),
 * descrição curta, selos de situação (`[status]`), ações principais (`[actions]`),
 * favoritar e ajuda.
 */
@Component({
  selector: 'geo-page-header',
  standalone: true,
  imports: [RouterLink, GeoIconButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-page-header' },
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem 1rem;
    }

    .geo-page-header__main {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      min-width: 0;
      flex: 1 1 24rem;
    }

    .geo-page-header__mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--geo-radius-md);
      background: var(--geo-brand-soft);
      color: var(--geo-brand);
      font-size: 1.125rem;
    }

    .geo-page-header__text {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }

    .geo-page-header__trail ol {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--geo-font-caption);
      font-weight: 600;
      color: var(--geo-foreground-subtle);
    }

    .geo-page-header__trail li {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    .geo-page-header__trail a {
      color: inherit;
      text-decoration: none;
      border-radius: var(--geo-radius-sm);
    }

    .geo-page-header__trail a:hover {
      color: var(--geo-brand);
      text-decoration: underline;
    }

    .geo-page-header__trail a:focus-visible {
      outline: 2px solid var(--geo-focus-ring);
      outline-offset: 2px;
    }

    .geo-page-header__trail .pi {
      font-size: 0.625rem;
    }

    .geo-page-header__title-row {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      min-width: 0;
    }

    h1 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      line-height: 1.3;
      color: var(--geo-foreground);
      overflow-wrap: anywhere;
    }

    p {
      margin: 0;
      max-width: 52rem;
      font-size: var(--geo-font-body);
      color: var(--geo-foreground-muted);
    }

    .geo-page-header__status {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      margin-top: 0.375rem;
    }

    .geo-page-header__status:empty,
    .geo-page-header__actions:empty {
      display: none;
    }

    .geo-page-header__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    @media (max-width: 40rem) {
      .geo-page-header__actions {
        width: 100%;
      }

      .geo-page-header__actions > * {
        flex: 1 1 auto;
      }
    }
  `,
  template: `
    <div class="geo-page-header__main">
      @if (icon()) {
        <span class="geo-page-header__mark" aria-hidden="true"><i [class]="icon()"></i></span>
      }
      <div class="geo-page-header__text">
        @if (breadcrumb().length) {
          <nav class="geo-page-header__trail" aria-label="Você está em">
            <ol>
              @for (item of breadcrumb(); track $index; let last = $last) {
                <li>
                  @if ($index > 0) {
                    <i class="pi pi-angle-right" aria-hidden="true"></i>
                  }
                  @if (last) {
                    <span aria-current="page">{{ item.label }}</span>
                  } @else if (item.route) {
                    <a [routerLink]="item.route" [queryParams]="item.queryParams ?? null">{{ item.label }}</a>
                  } @else {
                    <span>{{ item.label }}</span>
                  }
                </li>
              }
            </ol>
          </nav>
        }
        <div class="geo-page-header__title-row">
          <h1>{{ title() }}</h1>
          @if (showFavorite()) {
            <geo-icon-button
              class="geo-page-header__favorite"
              size="icon-sm"
              [className]="isFavorite() ? 'geo-page-favorite--active' : ''"
              [icon]="isFavorite() ? 'pi pi-star-fill' : 'pi pi-star'"
              [label]="isFavorite() ? 'Remover dos favoritos' : 'Adicionar aos favoritos'"
              (pressed)="toggleFavorite()"
            ></geo-icon-button>
          }
          @if (helpLabel()) {
            <geo-icon-button
              class="geo-page-header__help"
              size="icon-sm"
              icon="pi pi-question-circle"
              [label]="helpLabel()!"
              (pressed)="help.emit()"
            ></geo-icon-button>
          }
        </div>
        @if (description()) {
          <p>{{ description() }}</p>
        }
        <div class="geo-page-header__status"><ng-content select="[status]"></ng-content></div>
      </div>
    </div>
    <div class="geo-page-header__actions"><ng-content select="[actions]"></ng-content></div>
  `
})
export class GeoPageHeaderComponent {
  private readonly favorites = inject(GEO_PAGE_FAVORITES, { optional: true });

  readonly title = input.required<string>();
  readonly description = input<string | undefined>();
  /** Classe do ícone do assunto (PrimeIcons), por exemplo `pi pi-car`. */
  readonly icon = input<string | undefined>();
  readonly breadcrumb = input<readonly GeoBreadcrumbItem[]>([]);
  /** Mostra a estrela de favoritos quando o app provê `GEO_PAGE_FAVORITES`. */
  readonly favoritable = input(true);
  /** Rótulo do botão de ajuda; sem rótulo, o botão não aparece. */
  readonly helpLabel = input<string | undefined>();

  readonly help = output<void>();

  protected readonly showFavorite = computed(() => this.favoritable() && !!this.favorites);
  protected readonly isFavorite = computed(() => this.favorites?.isCurrentPageFavorite() ?? false);

  protected toggleFavorite(): void {
    this.favorites?.toggle(this.title(), this.icon());
  }
}
