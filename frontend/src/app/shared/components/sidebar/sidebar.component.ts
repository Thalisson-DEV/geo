import { Component, DestroyRef, ViewEncapsulation, computed, inject, input, model, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelMenuModule } from 'primeng/panelmenu';
import { TooltipModule } from 'primeng/tooltip';
import { GeoIconComponent, GeoLogoComponent } from '@geo/ui';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { MenuItem } from 'primeng/api';
import { RouterLink, Router } from '@angular/router';
import { ViewStateStore, linkToUrl } from '../../../core/navigation/view-state.store';

const CHAVE_LARGURA = 'geo_menu_largura';
const LARGURA_PADRAO = 232;
const PASSO_TECLADO = 16;

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
      [class.geo-nav--arrastando]="arrastando()"
      [style.--geo-nav-largura]="larguraCss()"
    >
      <div class="geo-nav__topo">
        <a routerLink="/home" class="geo-nav__marca" aria-label="GEO, ir para o início" (click)="irParaInicio()">
          <geo-logo size="1.875rem" label="GEO" />
          <span class="geo-nav__marca-texto" aria-hidden="true">
            <strong>GEO</strong>
            <small>Gestão de Equipes e Operações</small>
          </span>
        </a>
        @if (!isMobile()) {
          <button
            type="button"
            class="geo-nav__recolher"
            [attr.aria-label]="menuVisible() ? 'Recolher menu' : 'Expandir menu'"
            [attr.aria-expanded]="menuVisible()"
            [pTooltip]="menuVisible() ? 'Recolher menu' : 'Expandir menu'"
            tooltipPosition="right"
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
              <span class="geo-nav__icone"><geo-icon name="compass" /></span>
              <span class="geo-nav__rotulo">{{ item.label }}</span>
              @if (item.badge) { <span class="geo-nav__badge">{{ item.badge }}</span> }
            </a>
          }
          <p class="geo-nav__secao" aria-hidden="true">Módulos</p>
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
                  <span class="geo-nav__icone"><geo-icon [name]="item.icon || 'circle'" /></span>
                  <span class="geo-nav__rotulo">{{ item.label }}</span>
                  @if (item.badge) { <span class="geo-nav__badge">{{ item.badge }}</span> }
                </a>
              } @else if (item.url) {
                <a [href]="item.url" [target]="item.target || '_self'" class="geo-nav__item" (click)="onItemClick(item)">
                  <span class="geo-nav__icone"><geo-icon [name]="item.icon || 'circle'" /></span>
                  <span class="geo-nav__rotulo">{{ item.label }}</span>
                  <geo-icon class="geo-nav__seta" name="external-link" size="sm" />
                </a>
              } @else {
                <a
                  class="geo-nav__item geo-nav__grupo"
                  [class.geo-nav__grupo--ativo]="isItemActive(item)"
                  [class.geo-nav__grupo--aberto]="item.expanded"
                  (click)="onItemClick(item)"
                >
                  <span class="geo-nav__icone"><geo-icon [name]="item.icon || 'folder'" /></span>
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
                    [class.geo-nav__item--bussola]="item.routerLink === '/bussola'"
                    [attr.aria-current]="isItemActive(item) && item.routerLink ? 'page' : null"
                    [attr.aria-label]="item.label"
                    [pTooltip]="item.label"
                    tooltipPosition="right"
                    (click)="onExpandAndFocus(item)"
                  >
                    <span class="geo-nav__icone"><geo-icon [name]="item.icon || 'circle'" /></span>
                  </button>
                </li>
              }
            }
          </ul>
        }
      </div>

      <div class="geo-nav__rodape" role="status">
        @if (!conectado()) {
          <span class="geo-nav__conexao" aria-hidden="true"></span>
          @if (menuVisible() || isMobile()) {
            <span>Sem conexão</span>
          } @else {
            <span class="geo-sr-only">Sem conexão</span>
          }
        }
      </div>

      @if (menuVisible() && !isMobile()) {
        <div
          class="geo-nav__alca"
          role="separator"
          tabindex="0"
          aria-orientation="vertical"
          aria-label="Largura do menu. Arraste ou use as setas; clique duplo volta ao padrão."
          [attr.aria-valuenow]="largura()"
          [attr.aria-valuemin]="LARGURA_MIN"
          [attr.aria-valuemax]="LARGURA_MAX"
          (pointerdown)="iniciarArraste($event)"
          (keydown)="ajustarPeloTeclado($event)"
          (dblclick)="restaurarLargura()"
        ></div>
      }
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    app-sidebar { display: contents; }
    .geo-nav {
      --geo-nav-largura: var(--geo-nav-width);
      border-inline-end: 1px solid var(--geo-nav-border);
      position: fixed; inset-block: 0; inset-inline-start: 0; z-index: 50;
      display: flex; flex-direction: column;
      inline-size: var(--geo-nav-largura); max-inline-size: 100vw; block-size: 100%;
      background: var(--geo-nav-bg); color: var(--geo-nav-fg);
      transition: inline-size var(--geo-motion-base) var(--geo-ease-out), transform var(--geo-motion-slow) var(--geo-ease-emphasis);
    }
    @media (min-width: 1024px) { .geo-nav { position: relative; z-index: 40; flex: none; } }
    .geo-nav--recolhido { inline-size: var(--geo-nav-width-collapsed); }
    .geo-nav--fechado { transform: translateX(-100%); transition-duration: var(--geo-motion-exit); transition-timing-function: var(--geo-ease-in); }
    .geo-nav--arrastando { transition: none; user-select: none; }

    /* Topo: marca com o nome por extenso e botão de recolher, na altura do cabeçalho. */
    .geo-nav__topo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex: none; block-size: var(--geo-nav-topbar-height); padding-inline: 12px 8px; border-block-end: 1px solid var(--geo-nav-border); }
    .geo-nav--recolhido .geo-nav__topo { justify-content: center; padding-inline: 0; }
    .geo-nav--recolhido .geo-nav__marca { display: none; }
    .geo-nav__marca { display: inline-flex; align-items: center; gap: 0.625rem; min-inline-size: 0; border-radius: var(--geo-radius-sm); color: var(--geo-nav-fg-active); text-decoration: none; }
    .geo-nav__marca:focus-visible { outline: 2px solid var(--geo-nav-indicator); outline-offset: 2px; }
    .geo-nav__marca-texto { display: flex; flex-direction: column; min-inline-size: 0; line-height: 1.2; }
    .geo-nav__marca-texto strong { font-size: var(--geo-text-body); font-weight: var(--geo-font-weight-bold); letter-spacing: 0; }
    .geo-nav__marca-texto small { overflow: hidden; color: var(--geo-nav-fg-muted); font-size: var(--geo-text-caption); text-overflow: ellipsis; white-space: nowrap; }
    .geo-nav__recolher {
      display: inline-flex; flex: none; align-items: center; justify-content: center;
      inline-size: 28px; block-size: 28px; border: 0; border-radius: var(--geo-radius-sm);
      background: transparent; color: var(--geo-nav-fg-muted); cursor: pointer;
      transition: background-color var(--geo-motion-fast) var(--geo-ease-out), color var(--geo-motion-fast) var(--geo-ease-out);
    }
    .geo-nav__recolher:hover { background: var(--geo-nav-bg-hover); color: var(--geo-nav-fg-active); }
    .geo-nav__recolher:focus-visible { outline: 2px solid var(--geo-nav-indicator); outline-offset: 2px; }

    .geo-nav__rolagem { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 8px 16px; scrollbar-width: thin; scrollbar-color: var(--geo-nav-border-strong) transparent; }
    .geo-nav__secao { margin: 12px 0 4px; padding-inline: 8px; color: var(--geo-nav-fg-muted); font-size: var(--geo-text-caption); font-weight: var(--geo-font-weight-semibold); letter-spacing: 0; text-transform: none; }

    /* Item: ícone em ladrilho, rótulo legível e área de toque confortável. */
    .geo-nav__item {
      position: relative; display: flex; align-items: center; gap: 8px;
      box-sizing: border-box; inline-size: 100%; min-block-size: 30px; margin-block: 1px; padding: 0 8px;
      border: 0; border-radius: var(--geo-radius-md); background: transparent;
      color: var(--geo-nav-fg); font: inherit; font-size: var(--geo-text-body); font-weight: var(--geo-font-weight-medium);
      line-height: 1.25; text-align: start; text-decoration: none; cursor: pointer;
      transition: background-color var(--geo-motion-fast) var(--geo-ease-out), color var(--geo-motion-fast) var(--geo-ease-out);
    }
    .geo-nav__item:hover { background: var(--geo-nav-bg-hover); color: var(--geo-nav-fg-active); }
    .geo-nav__item:focus-visible { outline: 2px solid var(--geo-nav-indicator); outline-offset: -2px; }
    .geo-nav__icone {
      display: inline-flex; flex: none; align-items: center; justify-content: center;
      inline-size: 1.1429rem; block-size: 1.1429rem; border-radius: 0;
      background: transparent; color: var(--geo-nav-fg-muted);
      transition: background-color var(--geo-motion-fast) var(--geo-ease-out), color var(--geo-motion-fast) var(--geo-ease-out);
    }
    .geo-nav__item:hover .geo-nav__icone { color: var(--geo-nav-fg-active); }
    .geo-nav__rotulo { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .geo-nav__seta { flex: none; color: var(--geo-nav-fg-muted); transition: transform var(--geo-motion-base) var(--geo-ease-out); }
    .geo-nav__seta--aberta { transform: rotate(180deg); }

    /* Grupo aberto ou com a tela ativa dentro. */
    .geo-nav__grupo--aberto, .geo-nav__grupo--ativo { color: var(--geo-nav-fg-active); }
    .geo-nav__grupo--ativo .geo-nav__icone { color: var(--geo-nav-indicator); }

    /* Tela ativa: fundo neutro, texto forte, ícone e marcador no acento. */
    .geo-nav__item--ativo, .geo-nav__item--ativo:hover { background: var(--geo-nav-bg-active); color: var(--geo-nav-fg-active); font-weight: var(--geo-font-weight-semibold); }
    .geo-nav__item--ativo .geo-nav__icone, .geo-nav__item--ativo:hover .geo-nav__icone { color: var(--geo-nav-indicator); }
    .geo-nav__item--ativo::before {
      content: ''; position: absolute; inset-block: 7px; inset-inline-start: -8px;
      inline-size: 3px; border-radius: 0 3px 3px 0; background: var(--geo-nav-indicator);
    }

    /* Bússola: ícone no acento. */
    .geo-nav__item--bussola .geo-nav__icone { color: var(--geo-nav-indicator); }
    .geo-nav__badge {
      flex: none; padding: 0 6px; border-radius: var(--geo-radius-xs);
      background: var(--geo-nav-badge-bg); color: var(--geo-nav-indicator);
      font-size: var(--geo-text-caption); font-weight: var(--geo-font-weight-semibold); line-height: 18px; letter-spacing: 0;
    }

    /* Subníveis: ícone menor, recuo alinhado ao ladrilho do pai e linha guia. */
    .geo-nav__grupos .p-panelmenu-panel { margin: 0; padding: 0; border: 0; background: transparent; }
    .geo-nav__grupos .p-panelmenu-header-content { border: 0; background: transparent; }
    .geo-nav__grupos .p-panelmenu-content {
      position: relative; box-sizing: border-box; inline-size: auto;
      margin-inline-start: 15px;
      border: 0; background: transparent;
    }
    .geo-nav__grupos .p-panelmenu-content::before {
      content: ''; position: absolute; inset-block: 0.25rem; inset-inline-start: 0;
      inline-size: 1px; background: var(--geo-nav-border-strong);
    }
    .geo-nav__grupos .p-panelmenu-item-content { border: 0; background: transparent; }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__item { min-block-size: 28px; gap: 8px; padding-inline-start: 8px; font-size: var(--geo-text-body-sm); font-weight: var(--geo-font-weight-regular); color: var(--geo-nav-fg); }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__icone { inline-size: 1rem; block-size: 1rem; background: transparent; color: var(--geo-nav-fg-muted); }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__item:hover { color: var(--geo-nav-fg-active); }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__item:hover .geo-nav__icone { background: transparent; color: var(--geo-nav-fg-active); }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__grupo--aberto,
    .geo-nav__grupos .p-panelmenu-content .geo-nav__grupo--ativo { color: var(--geo-nav-fg-active); font-weight: var(--geo-font-weight-medium); }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__grupo--ativo .geo-nav__icone,
    .geo-nav__grupos .p-panelmenu-content .geo-nav__item--ativo .geo-nav__icone { background: transparent; color: var(--geo-nav-indicator); }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__item--ativo { font-weight: var(--geo-font-weight-semibold); }
    .geo-nav__grupos .p-panelmenu-submenu { margin: 0; padding: 0 0 0 8px; }
    .geo-nav__grupos .p-panelmenu-content .geo-nav__item--ativo::before { inset-inline-start: -9px; inset-block: 6px; border-radius: 2px; inline-size: 2px; }
    .geo-nav__grupos .p-panelmenu-content .p-panelmenu-content { margin-inline-start: 12px; }

    /* Recolhido: só os ladrilhos. */
    .geo-nav--recolhido .geo-nav__rolagem { padding-inline: 0; }
    .geo-nav__icones { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: 0; padding: 0; list-style: none; }
    .geo-nav__item--icone { justify-content: center; inline-size: 36px; block-size: 32px; min-block-size: 0; padding: 0; }
    .geo-nav__item--icone.geo-nav__item--ativo::before { inset-inline-start: -8px; }

    /* Alça de largura na borda direita do menu aberto. */
    .geo-nav__alca {
      position: absolute; inset-block: 0; inset-inline-end: -4px; z-index: 2;
      inline-size: 8px; cursor: col-resize; touch-action: none;
    }
    .geo-nav__alca::after {
      content: ''; position: absolute; inset-block: 0; inset-inline-start: 3px; inline-size: 2px;
      background: transparent; transition: background-color var(--geo-motion-fast) var(--geo-ease-out);
    }
    .geo-nav__alca:hover::after, .geo-nav__alca:focus-visible::after, .geo-nav--arrastando .geo-nav__alca::after { background: var(--geo-nav-indicator); }
    .geo-nav__alca:focus-visible { outline: none; }

    .geo-nav__rodape:empty { display: none; }
    .geo-nav__rodape {
      display: flex; align-items: center; gap: 8px; padding: 8px 12px;
      border-block-start: 1px solid var(--geo-nav-border);
      color: var(--geo-nav-indicator); font-size: var(--geo-text-caption);
    }
    .geo-nav--recolhido .geo-nav__rodape { justify-content: center; padding-inline: 0; }
    .geo-nav__conexao { flex: none; inline-size: 0.5rem; block-size: 0.5rem; border-radius: var(--geo-radius-full); background: var(--geo-nav-indicator); }
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

  protected readonly LARGURA_MIN = 200;
  protected readonly LARGURA_MAX = 440;
  /** Largura do menu aberto, em px, ajustada pela alça e guardada no aparelho. */
  readonly largura = signal(this.larguraSalva());
  protected readonly arrastando = signal(false);
  protected readonly larguraCss = computed(() => (this.menuVisible() && !this.isMobile() ? `${this.largura()}px` : null));
  private pararArraste?: () => void;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pararArraste?.());
  }

  protected iniciarArraste(evento: PointerEvent): void {
    if (evento.button !== 0) return;
    evento.preventDefault();
    const inicioX = evento.clientX;
    const inicio = this.largura();
    this.arrastando.set(true);
    const mover = (e: PointerEvent) => this.definirLargura(inicio + (e.clientX - inicioX), false);
    const soltar = () => {
      this.pararArraste?.();
      this.salvarLargura();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    this.pararArraste = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      this.arrastando.set(false);
      this.pararArraste = undefined;
    };
  }

  protected ajustarPeloTeclado(evento: KeyboardEvent): void {
    if (evento.key === 'ArrowLeft' || evento.key === 'ArrowRight') {
      evento.preventDefault();
      this.definirLargura(this.largura() + (evento.key === 'ArrowRight' ? PASSO_TECLADO : -PASSO_TECLADO));
    } else if (evento.key === 'Home' || evento.key === 'End') {
      evento.preventDefault();
      this.definirLargura(evento.key === 'Home' ? this.LARGURA_MIN : this.LARGURA_MAX);
    }
  }

  protected restaurarLargura(): void {
    this.definirLargura(LARGURA_PADRAO);
  }

  definirLargura(valor: number, salvar = true): void {
    this.largura.set(Math.round(Math.min(this.LARGURA_MAX, Math.max(this.LARGURA_MIN, valor))));
    if (salvar) this.salvarLargura();
  }

  private salvarLargura(): void {
    try { localStorage.setItem(CHAVE_LARGURA, String(this.largura())); } catch { /* armazenamento indisponível */ }
  }

  private larguraSalva(): number {
    try {
      const salvo = Number(localStorage.getItem(CHAVE_LARGURA));
      if (Number.isFinite(salvo) && salvo > 0) return Math.min(440, Math.max(232, salvo));
    } catch { /* armazenamento indisponível */ }
    return LARGURA_PADRAO;
  }

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
