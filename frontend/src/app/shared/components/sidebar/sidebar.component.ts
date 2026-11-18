import { Component, ViewEncapsulation, input, output, model, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelMenuModule } from 'primeng/panelmenu';
import { TooltipModule } from 'primeng/tooltip';
import { GeoIconComponent, GeoLogoComponent } from '@geo/ui';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { MenuItem } from 'primeng/api';
import { RouterLink, Router } from '@angular/router';
import { ViewStateStore, linkToUrl } from '../../../core/navigation/view-state.store';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, PanelMenuModule, TooltipModule, RouterLink, GeoIconComponent, GeoLogoComponent],
  encapsulation: ViewEncapsulation.None,
  template: `
    <nav
      class="geo-nav"
      aria-label="Menu principal"
      [class.geo-nav--recolhido]="!menuVisible() && !isMobile()"
      [class.geo-nav--fechado]="!menuVisible() && isMobile()"
    >
      <div class="geo-nav__topo">
        <a routerLink="/home" class="geo-nav__marca" aria-label="GEO, ir para o início" (click)="irParaInicio()">
          <geo-logo size="2rem" label="GEO" />
        </a>
        @if (!isMobile()) {
          <button
            type="button"
            class="geo-nav__recolher"
            [attr.aria-label]="menuVisible() ? 'Recolher menu' : 'Expandir menu'"
            [attr.aria-expanded]="menuVisible()"
            (click)="toggleMenu.emit()"
          >
            <geo-icon [name]="menuVisible() ? 'panel-left-close' : 'panel-left-open'" />
          </button>
        }
      </div>

      <div class="geo-nav__rolagem">
        @if (menuVisible() || isMobile()) {
          @if (copilotoItem(); as item) {
            <a
              [routerLink]="item.routerLink"
              class="geo-nav__item geo-nav__item--bussola"
              [class.geo-nav__item--ativo]="isItemActive(item)"
              [attr.aria-current]="isItemActive(item) ? 'page' : null"
              (click)="onItemClick(item)"
            >
              <geo-icon class="geo-nav__icone" name="compass" />
              <span class="geo-nav__rotulo">{{ item.label }}</span>
              @if (item.badge) { <span class="geo-nav__badge">{{ item.badge }}</span> }
            </a>
          }
          <p-panelmenu [model]="panelItems()" class="custom-panelmenu geo-nav__grupos">
            <ng-template #item let-item>
              @if (item.routerLink) {
                <a
                  [routerLink]="item.routerLink"
                  [queryParams]="item.queryParams"
                  class="geo-nav__item"
                  [class.geo-nav__item--ativo]="isItemActive(item)"
                  [attr.aria-current]="isItemActive(item) ? 'page' : null"
                  (click)="onItemClick(item)"
                >
                  @if (item.icon) { <geo-icon class="geo-nav__icone" [name]="item.icon" /> }
                  <span class="geo-nav__rotulo">{{ item.label }}</span>
                  @if (item.badge) { <span class="geo-nav__badge">{{ item.badge }}</span> }
                </a>
              } @else if (item.url) {
                <a [href]="item.url" [target]="item.target || '_self'" class="geo-nav__item" (click)="onItemClick(item)">
                  @if (item.icon) { <geo-icon class="geo-nav__icone" [name]="item.icon" /> }
                  <span class="geo-nav__rotulo">{{ item.label }}</span>
                  <geo-icon class="geo-nav__seta" name="external-link" size="sm" />
                </a>
              } @else {
                <a class="geo-nav__item geo-nav__grupo" [class.geo-nav__grupo--ativo]="isItemActive(item)" (click)="onItemClick(item)">
                  @if (item.icon) { <geo-icon class="geo-nav__icone" [name]="item.icon" /> }
                  <span class="geo-nav__rotulo">{{ item.label }}</span>
                  @if (item.items && item.items.length > 0) {
                    <geo-icon class="geo-nav__seta" [class.geo-nav__seta--aberta]="item.expanded" name="chevron-down" size="sm" />
                  }
                </a>
              }
            </ng-template>
          </p-panelmenu>
        } @else {
          <ul class="geo-nav__icones" role="list">
            @for (item of menuItems(); track item.label) {
              @if (item.visible !== false) {
                <li>
                  <button
                    type="button"
                    class="geo-nav__item geo-nav__item--icone"
                    [class.geo-nav__item--ativo]="isItemActive(item)"
                    [attr.aria-current]="isItemActive(item) && item.routerLink ? 'page' : null"
                    [attr.aria-label]="item.label"
                    [pTooltip]="item.label"
                    tooltipPosition="right"
                    (click)="onExpandAndFocus(item)"
                  >
                    <geo-icon class="geo-nav__icone" [name]="item.icon || 'circle'" />
                  </button>
                </li>
              }
            }
          </ul>
        }
      </div>

      <div class="geo-nav__rodape" role="status">
        <span class="geo-nav__conexao" [attr.data-estado]="conectado() ? 'online' : 'offline'"></span>
        @if (menuVisible() || isMobile()) {
          <span class="geo-nav__rodape-texto">{{ conectado() ? 'Conectado' : 'Sem conexão: salvando no aparelho' }}</span>
        } @else {
          <span class="geo-sr-only">{{ conectado() ? 'Conectado' : 'Sem conexão' }}</span>
        }
      </div>
    </nav>
  `,
  styles: [`
    app-sidebar { display: contents; }
    .geo-nav {
      position: fixed; inset-block: 0; inset-inline-start: 0; z-index: 50;
      display: flex; flex-direction: column;
      inline-size: var(--geo-nav-width); block-size: 100%;
      background: var(--geo-nav-bg); color: var(--geo-nav-fg);
      border-inline-end: 1px solid var(--geo-nav-border);
      transition: inline-size var(--geo-motion-base) var(--geo-ease-out), transform var(--geo-motion-slow) var(--geo-ease-emphasis);
    }
    @media (min-width: 1024px) { .geo-nav { position: relative; z-index: 40; } }
    .geo-nav--recolhido { inline-size: var(--geo-nav-width-collapsed); }
    .geo-nav--fechado { transform: translateX(-100%); transition-duration: var(--geo-motion-exit); transition-timing-function: var(--geo-ease-in); }
    .geo-nav__topo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.9rem 0.9rem 0.75rem; min-block-size: 4rem; }
    .geo-nav--recolhido .geo-nav__topo { flex-direction: column; padding-inline: 0; }
    .geo-nav__marca { display: inline-flex; border-radius: var(--geo-radius-md); }
    .geo-nav__marca:focus-visible { outline: 2px solid var(--geo-nav-indicator); outline-offset: 2px; }
    .geo-nav__recolher {
      display: inline-flex; align-items: center; justify-content: center;
      inline-size: 2.25rem; block-size: 2.25rem; border: 0; border-radius: var(--geo-radius-sm);
      background: transparent; color: var(--geo-nav-fg-muted); cursor: pointer;
      transition: background-color var(--geo-motion-fast) var(--geo-ease-out), color var(--geo-motion-fast) var(--geo-ease-out);
    }
    .geo-nav__recolher:hover { background: var(--geo-nav-bg-hover); color: var(--geo-nav-fg-active); }
    .geo-nav__recolher:focus-visible { outline: 2px solid var(--geo-nav-indicator); outline-offset: 2px; }
    .geo-nav__rolagem { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0.25rem 0.6rem 0.75rem; scrollbar-width: thin; scrollbar-color: var(--geo-nav-border) transparent; }
    .geo-nav__item {
      position: relative; display: flex; align-items: center; gap: 0.7rem;
      inline-size: 100%; min-block-size: 2.5rem; margin-block: 1px; padding: 0 0.75rem;
      border: 0; border-radius: var(--geo-radius-sm); background: transparent;
      color: var(--geo-nav-fg); font: inherit; font-size: var(--geo-text-body-sm); font-weight: var(--geo-font-weight-medium);
      text-align: start; text-decoration: none; cursor: pointer;
      transition: background-color var(--geo-motion-fast) var(--geo-ease-out), color var(--geo-motion-fast) var(--geo-ease-out);
    }
    .geo-nav__item:hover { background: var(--geo-nav-bg-hover); color: var(--geo-nav-fg-active); }
    .geo-nav__item:focus-visible { outline: 2px solid var(--geo-nav-indicator); outline-offset: -2px; }
    .geo-nav__item--ativo { background: var(--geo-nav-bg-active); color: var(--geo-nav-fg-active); font-weight: var(--geo-font-weight-semibold); }
    .geo-nav__item--ativo::before {
      content: ''; position: absolute; inset-block: 0.5rem; inset-inline-start: 0;
      inline-size: 3px; border-radius: var(--geo-radius-full); background: var(--geo-nav-indicator);
    }
    .geo-nav__item--ativo .geo-nav__icone { color: var(--geo-nav-indicator); }
    .geo-nav__grupo--ativo { color: var(--geo-nav-fg-active); }
    .geo-nav__icone { color: var(--geo-nav-fg-muted); transition: color var(--geo-motion-fast) var(--geo-ease-out); }
    .geo-nav__item:hover .geo-nav__icone { color: var(--geo-nav-fg-active); }
    .geo-nav__rotulo { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .geo-nav__seta { color: var(--geo-nav-fg-muted); transition: transform var(--geo-motion-base) var(--geo-ease-out); }
    .geo-nav__seta--aberta { transform: rotate(180deg); }
    .geo-nav__item--bussola { margin-block-end: 0.5rem; box-shadow: inset 0 0 0 1px var(--geo-nav-border); }
    .geo-nav__item--bussola .geo-nav__icone { color: var(--geo-nav-indicator); }
    .geo-nav__badge {
      min-inline-size: 1.25rem; padding: 0 0.35rem; border-radius: var(--geo-radius-full);
      background: var(--geo-nav-indicator); color: var(--geo-nav-bg);
      font-size: var(--geo-text-caption); font-weight: var(--geo-font-weight-bold); line-height: 1.25rem; text-align: center;
    }
    .geo-nav__icones { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; margin: 0; padding: 0; list-style: none; }
    .geo-nav__item--icone { justify-content: center; inline-size: 2.75rem; block-size: 2.75rem; padding: 0; }
    .geo-nav__rodape {
      display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 1.1rem;
      border-block-start: 1px solid var(--geo-nav-border);
      color: var(--geo-nav-fg-muted); font-size: var(--geo-text-caption);
    }
    .geo-nav--recolhido .geo-nav__rodape { justify-content: center; padding-inline: 0; }
    .geo-nav__conexao { flex: none; inline-size: 0.5rem; block-size: 0.5rem; border-radius: var(--geo-radius-full); background: var(--geo-success-text); }
    .geo-nav__conexao[data-estado='offline'] { background: var(--geo-nav-indicator); }
  `]
})
export class SidebarComponent {
  private readonly router = inject(Router);
  private readonly viewState = inject(ViewStateStore);
  private readonly conectividade = inject(ConnectivityService);
  protected readonly conectado = computed(() => this.conectividade.isOnline());

  isMobile = input<boolean>(false);
  menuVisible = input<boolean>(false);
  menuItems = model<MenuItem[]>([]);
  protected readonly copilotoItem = computed(() => this.menuItems().find((item) => item.routerLink === '/bussola' && item.visible !== false));
  protected readonly panelItems = computed(() => this.menuItems().filter((item) => item.routerLink !== '/bussola'));

  toggleMenu = output<void>();
  expandAndFocus = output<MenuItem>();

  irParaInicio() {
    this.onItemClick({ routerLink: '/home' });
  }

  onItemClick(item: MenuItem) {
    // Navegação intencional pelo menu abre a tela limpa (sem rascunho/estado antigo).
    if (item.routerLink) this.viewState.clearRoute(linkToUrl(item.routerLink));
    if (this.isMobile() && item.routerLink) {
      this.toggleMenu.emit();
    }
  }

  onExpandAndFocus(item: MenuItem) {
    if (item.routerLink && !item.items?.length) {
      this.viewState.clearRoute(linkToUrl(item.routerLink));
      void this.router.navigateByUrl(Array.isArray(item.routerLink) ? item.routerLink.join('/') : String(item.routerLink));
      return;
    }
    this.expandAndFocus.emit(item);
  }

  isItemActive(item: MenuItem): boolean {
    if (item.routerLink) {
      const currentUrl = this.router.url;
      const currentUrlTree = this.router.parseUrl(currentUrl);

      const currentPath = currentUrl.split('?')[0];

      const itemLink = Array.isArray(item.routerLink)
        ? item.routerLink.join('/')
        : item.routerLink;
      const itemPath = itemLink.split('?')[0];

      const isExact = item.routerLinkActiveOptions?.exact === true;
      const pathMatches = isExact
        ? currentPath === itemPath
        : (currentPath === itemPath || currentPath.startsWith(itemPath + '/'));
      if (!pathMatches) {
        return false;
      }

      const currentParams = currentUrlTree.queryParams || {};
      const itemParams = item.queryParams || {};
      const itemParamKeys = Object.keys(itemParams);

      if (itemParamKeys.length > 0) {
        return itemParamKeys.every(
          (key) => String(currentParams[key]) === String(itemParams[key])
        );
      }

      if (Object.keys(currentParams).length > 0) {
        return false;
      }

      // Se este item deu match apenas por prefixo (não exato), mas existe no menu outro item
      // com match mais específico (ou exato) para a rota atual, este item não deve ficar ativo.
      if (currentPath !== itemPath && this.hasMoreSpecificMatch(currentPath, itemPath)) {
        return false;
      }

      return true;
    }

    if (item.items && item.items.length > 0) {
      return item.items.some((child) => this.isItemActive(child));
    }

    return false;
  }

  private hasMoreSpecificMatch(currentPath: string, currentItemPath: string): boolean {
    const allLinks = this.collectAllRouterLinks(this.menuItems());
    return allLinks.some((link) => {
      if (link === currentItemPath) return false;
      if (link === currentPath) return true;
      if (currentPath.startsWith(link + '/') && link.length > currentItemPath.length) return true;
      return false;
    });
  }

  private collectAllRouterLinks(items: MenuItem[]): string[] {
    const links: string[] = [];
    for (const item of items) {
      if (item.routerLink) {
        const link = Array.isArray(item.routerLink) ? item.routerLink.join('/') : item.routerLink;
        links.push(link.split('?')[0]);
      }
      if (item.items && item.items.length > 0) {
        links.push(...this.collectAllRouterLinks(item.items));
      }
    }
    return links;
  }
}
