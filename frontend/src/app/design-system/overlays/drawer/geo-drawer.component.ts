import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, model, output, viewChild } from '@angular/core';
import { Drawer, DrawerModule } from 'primeng/drawer';
import { GEO_COMPACT_VIEWPORT_QUERY, geoMediaQuery } from '../../core/media';

export type GeoDrawerSize = 'sm' | 'md' | 'lg' | 'xl';

const DRAWER_WIDTHS: Record<GeoDrawerSize, string> = {
  sm: '26rem',
  md: '34rem',
  lg: '42rem',
  xl: '56rem'
};

let drawerSequence = 0;

/**
 * Painel de detalhe sem sair da tela. No desktop abre à direita; em telas compactas vira folha
 * inferior (até 92% da altura) com o botão Fechar sempre visível — arrastar nunca é o único jeito
 * de fechar. Foco preso, `Esc` e retorno de foco vêm do `p-drawer`.
 */
@Component({
  selector: 'geo-drawer',
  standalone: true,
  imports: [DrawerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .geo-drawer__header {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }

    .geo-drawer__eyebrow {
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption);
      font-weight: var(--geo-font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: none;
    }

    .geo-drawer__title {
      margin: 0;
      color: var(--geo-foreground);
      font-size: var(--geo-font-title);
      line-height: 1.3;
    }

    .geo-drawer__description {
      margin: 0;
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption);
      line-height: 1.45;
    }

    /* Alça da folha inferior: centrada no painel inteiro, não só na coluna do título (que divide a linha com o Fechar). */
    .geo-drawer__handle {
      position: absolute;
      top: 0.5rem;
      left: 50%;
      width: 2.5rem;
      height: 0.25rem;
      border-radius: 999px;
      background: var(--geo-border-strong, var(--geo-border));
      transform: translateX(-50%);
    }

    .geo-drawer__header--compacto {
      padding-top: 0.5rem;
    }

    .geo-drawer__body {
      display: grid;
      gap: 1rem;
      min-width: 0;
    }

    .geo-drawer__footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      width: 100%;
    }

    .geo-drawer__footer:empty {
      display: none;
    }
  `,
  template: `
    <p-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [position]="compact() ? 'bottom' : 'right'"
      [modal]="true"
      [blockScroll]="true"
      [dismissible]="true"
      [closeOnEscape]="true"
      [style]="drawerStyle()"
      [ariaCloseLabel]="closeLabel()"
      appendTo="body"
      (onHide)="closed.emit()"
    >
      <ng-template #header>
        <div class="geo-drawer__header" [class.geo-drawer__header--compacto]="compact()">
          @if (compact()) {
            <span class="geo-drawer__handle" aria-hidden="true"></span>
          }
          @if (eyebrow()) {
            <span class="geo-drawer__eyebrow">{{ eyebrow() }}</span>
          }
          <h2 class="geo-drawer__title" [id]="titleId">{{ title() }}</h2>
          @if (description()) {
            <p class="geo-drawer__description">{{ description() }}</p>
          }
        </div>
      </ng-template>

      <section class="geo-drawer__body" [attr.aria-labelledby]="titleId">
        <ng-content></ng-content>
      </section>

      <ng-template #footer>
        <div class="geo-drawer__footer">
          <ng-content select="[drawer-footer]"></ng-content>
        </div>
      </ng-template>
    </p-drawer>
  `
})
export class GeoDrawerComponent {
  readonly visible = model(false);
  readonly title = input.required<string>();
  readonly eyebrow = input<string | undefined>();
  readonly description = input<string | undefined>();
  readonly size = input<GeoDrawerSize>('md');
  readonly closeLabel = input('Fechar painel');

  readonly closed = output<void>();

  protected readonly titleId = `geo-drawer-title-${++drawerSequence}`;
  private readonly drawer = viewChild(Drawer);

  constructor() {
    // Fechar e sair da tela no mesmo clique ("Abrir completa"): o p-drawer é destruído no meio da
    // animação de saída e, como já não está visível, não remove a máscara — a página ficava
    // escura e sem clique. Sobrou máscara, ela sai junto com o drawer.
    inject(DestroyRef).onDestroy(() => {
      const drawer = this.drawer();
      if (drawer?.mask) drawer.destroyModal();
    });
  }
  protected readonly compact = geoMediaQuery(GEO_COMPACT_VIEWPORT_QUERY);

  /**
   * Superfície e texto vêm dos tokens GEO: o overlay do Lara usa `surface.900`, que no esquema
   * escuro do preset (escala invertida) é claro — sem isto o painel ficava claro com texto claro.
   */
  private readonly surfaceStyle: Record<string, string> = {
    background: 'var(--geo-surface)',
    color: 'var(--geo-foreground)',
    borderColor: 'var(--geo-border)'
  };

  protected readonly drawerStyle = computed<Record<string, string>>((): Record<string, string> =>
    this.compact()
      ? {
          ...this.surfaceStyle,
          height: 'auto',
          maxHeight: '92dvh',
          borderTopLeftRadius: 'var(--geo-radius-lg)',
          borderTopRightRadius: 'var(--geo-radius-lg)'
        }
      : { ...this.surfaceStyle, width: `min(${DRAWER_WIDTHS[this.size()]}, 100vw)` }
  );
}
