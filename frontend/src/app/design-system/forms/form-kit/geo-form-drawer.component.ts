import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Drawer, DrawerModule } from 'primeng/drawer';
import { GEO_COMPACT_VIEWPORT_QUERY, geoMediaQuery } from '../../core/media';
import { GeoConfirmationService } from '../../overlays/confirmation/confirmation.service';
import { GeoFormRegistry } from './form-kit.registry';

export type GeoFormDrawerSize = 'sm' | 'md' | 'lg' | 'xl';

const WIDTHS: Record<GeoFormDrawerSize, string> = {
  sm: '26rem',
  md: '34rem',
  lg: '42rem',
  xl: '56rem',
};

/** Largura máxima do drawer redimensionável, em % da largura da janela. */
export const GEO_FORM_DRAWER_MAX_VW = 90;
/** Passo do redimensionamento pelo teclado (setas), em px. */
const PASSO_TECLADO = 32;

let drawerSequence = 0;

/**
 * Shell de cadastro em drawer (tipos A e B): título, corpo rolável, rodapé fixo de ações e larguras
 * sm/md/lg/xl. Fecha com Esc, botão Fechar ou Cancelar — **pedindo confirmação se houver alterações**
 * (`dirty`). Ao abrir, foca o primeiro campo; ao fechar, o foco volta para quem abriu.
 *
 * ```html
 * <geo-form-drawer [(visible)]="aberto" [title]="editando() ? 'Editar contrato' : 'Novo contrato'"
 *   [dirty]="form.dirty" (closed)="fechar()">
 *   <form [formGroup]="form">…geo-form-section / geo-form-field…</form>
 *   <geo-form-actions drawer-footer [saveAndNew]="!editando()" (save)="salvar()" (cancel)="drawer.requestClose()" />
 * </geo-form-drawer>
 * ```
 *
 * Para F5/voltar do navegador funcionarem, ligue o drawer à URL com `bindDrawerToUrl` (core/navigation).
 *
 * Com `resizable`, a borda esquerda vira uma alça (arrastar, setas, Home/End, duplo clique ou Enter)
 * que alarga o painel da largura de `size` até `GEO_FORM_DRAWER_MAX_VW`% da janela; com `openExpanded`,
 * cada abertura já começa no máximo. Na tela compacta o drawer vira folha inferior e não redimensiona.
 */
/** Overlays que o Esc fecha antes do drawer (lista, calendário, autocompletar, confirmação). */
const OVERLAYS_ABERTOS = '.p-select-overlay, .p-multiselect-overlay, .p-autocomplete-overlay, .p-datepicker-panel, .p-confirmdialog, .p-dialog-mask';

@Component({
  selector: 'geo-form-drawer',
  standalone: true,
  imports: [DrawerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GeoFormRegistry],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    <p-drawer
      [visible]="visible()"
      (visibleChange)="!$event && requestClose()"
      [position]="compact() ? 'bottom' : 'right'"
      [modal]="true"
      [blockScroll]="true"
      [dismissible]="false"
      [closeOnEscape]="false"
      [showCloseIcon]="false"
      [style]="drawerStyle()"
      styleClass="geo-form-drawer"
      appendTo="body"
      (onShow)="onShow()"
      (onHide)="onHide()"
    >
      <ng-template #header>
        @if (resizable() && !compact()) {
          <div
            class="geo-form-drawer__resize"
            role="separator"
            tabindex="0"
            aria-orientation="vertical"
            aria-label="Redimensionar painel"
            title="Arraste para alargar o painel (duplo clique alterna entre o tamanho padrão e o máximo)"
            [attr.aria-valuemin]="limites().min"
            [attr.aria-valuemax]="limites().max"
            [attr.aria-valuenow]="larguraAtual()"
            [attr.aria-valuetext]="larguraTexto()"
            [attr.data-resizing]="redimensionando()"
            (pointerdown)="iniciarRedimensionamento($event)"
            (pointermove)="redimensionar($event)"
            (pointerup)="finalizarRedimensionamento($event)"
            (pointercancel)="finalizarRedimensionamento($event)"
            (lostpointercapture)="redimensionando.set(false)"
            (dblclick)="alternarLargura()"
            (keydown)="onResizeKey($event)"
          ></div>
        }
        <div class="geo-form-drawer__header">
          @if (compact()) {
            <span class="geo-drawer__handle" aria-hidden="true"></span>
          }
          <div class="geo-form-drawer__heading">
            <h2 class="geo-form-drawer__title" [id]="titleId">{{ title() }}</h2>
            @if (description()) {
              <p class="geo-form-drawer__description">{{ description() }}</p>
            }
          </div>
          <button type="button" class="geo-form-drawer__close" aria-label="Fechar" title="Fechar (Esc)" (click)="requestClose()">
            <i class="pi pi-times" aria-hidden="true"></i>
          </button>
        </div>
      </ng-template>

      <section #body class="geo-form-drawer__body" role="form" [attr.aria-labelledby]="titleId" [attr.aria-busy]="loading()"
       >
        @if (loading()) {
          <div class="geo-form-skeleton" role="status" aria-label="Carregando">
            <span class="geo-form-skeleton__title"></span>
            <span class="geo-form-skeleton__row"><span></span><span></span></span>
            <span class="geo-form-skeleton__row"><span></span><span></span></span>
          </div>
        }
        <div [hidden]="loading()" class="geo-form-drawer__content">
          <ng-content></ng-content>
        </div>
      </section>

      <ng-template #footer>
        <div class="geo-form-drawer__footer">
          <ng-content select="[drawer-footer]"></ng-content>
        </div>
      </ng-template>
    </p-drawer>
  `,
})
export class GeoFormDrawerComponent {
  private readonly confirmacao = inject(GeoConfirmationService);
  readonly registry = inject(GeoFormRegistry);

  readonly visible = model(false);
  readonly title = input.required<string>();
  readonly description = input<string | undefined>();
  readonly size = input<GeoFormDrawerSize>('md');
  /** Há alterações não salvas: fechar pede confirmação. */
  readonly dirty = input(false);
  readonly loading = input(false);
  readonly discardMessage = input('As alterações feitas neste formulário serão perdidas.');
  /** Mostra a alça na borda esquerda para alargar o painel até `GEO_FORM_DRAWER_MAX_VW`% da janela. */
  readonly resizable = input(false);
  /** Com `resizable`: cada abertura começa na largura máxima (a alça ainda reduz até `size`). */
  readonly openExpanded = input(false);

  /** Depois de fechar (por qualquer meio). */
  readonly closed = output<void>();

  private readonly body = viewChild<ElementRef<HTMLElement>>('body');
  private readonly drawer = viewChild(Drawer);
  protected readonly titleId = `geo-form-drawer-${++drawerSequence}`;
  protected readonly compact = geoMediaQuery(GEO_COMPACT_VIEWPORT_QUERY);
  private confirmando = false;
  private origemFoco: HTMLElement | null = null;
  /** Largura escolhida pela alça, em px; `null` = largura padrão (de `size` ou a máxima). Volta ao padrão ao fechar. */
  private readonly larguraPx = signal<number | null>(null);
  private readonly janela = signal(typeof window === 'undefined' ? 1280 : window.innerWidth);
  protected readonly redimensionando = signal(false);

  /** Esc que chegou com um overlay aberto: a lista do PrimeNG fecha antes do listener do documento, então anota na captura. */
  private escFechouOverlay = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Fechou e saiu da tela antes do fim da animação: o p-drawer não remove a máscara sozinho
    // (ver geo-drawer). Sobrou máscara, ela sai junto com o drawer.
    destroyRef.onDestroy(() => {
      const drawer = this.drawer();
      if (drawer?.mask) drawer.destroyModal();
    });
    if (typeof document !== 'undefined') {
      const anotar = (e: KeyboardEvent) => {
        if (e.key === 'Escape') this.escFechouOverlay = !!document.querySelector(OVERLAYS_ABERTOS);
      };
      document.addEventListener('keydown', anotar, true);
      destroyRef.onDestroy(() => document.removeEventListener('keydown', anotar, true));
    }
    // Guarda quem abriu o drawer antes de o foco entrar nele, para devolver ao fechar.
    effect(() => {
      if (this.visible() && !this.origemFoco) this.origemFoco = document.activeElement as HTMLElement | null;
    });
  }

  protected readonly drawerStyle = computed<Record<string, string>>((): Record<string, string> => {
    if (this.compact()) {
      return {
        height: 'auto',
        maxHeight: '92dvh',
        borderTopLeftRadius: 'var(--geo-radius-lg)',
        borderTopRightRadius: 'var(--geo-radius-lg)',
      };
    }
    const largura = this.larguraPx();
    if (largura !== null) return { width: `min(${largura}px, ${GEO_FORM_DRAWER_MAX_VW}vw)` };
    return { width: this.abreNoMaximo() ? `${GEO_FORM_DRAWER_MAX_VW}vw` : `min(${WIDTHS[this.size()]}, 100vw)` };
  });

  /** Limites da alça em px: da largura de `size` (ou da janela, se menor) até o máximo. */
  protected readonly limites = computed(() => {
    const max = Math.round((this.janela() * GEO_FORM_DRAWER_MAX_VW) / 100);
    return { min: Math.min(remParaPx(WIDTHS[this.size()]), max), max };
  });
  private readonly abreNoMaximo = computed(() => this.resizable() && this.openExpanded());
  protected readonly larguraAtual = computed(() => {
    const { min, max } = this.limites();
    const padrao = this.abreNoMaximo() ? max : min;
    return Math.min(Math.max(this.larguraPx() ?? padrao, min), max);
  });
  protected readonly larguraTexto = computed(
    () => `${Math.round((this.larguraAtual() / this.janela()) * 100)}% da largura da tela`,
  );

  /** Fecha; com alterações, pergunta antes. Use no Cancelar do rodapé. */
  async requestClose(): Promise<boolean> {
    if (!this.visible() || this.confirmando) return false;
    if (this.dirty()) {
      this.confirmando = true;
      const descartar = await this.confirmacao.confirm({
        title: 'Descartar alterações?',
        message: this.discardMessage(),
        confirmLabel: 'Descartar',
        cancelLabel: 'Continuar editando',
        variant: 'destructive',
      });
      this.confirmando = false;
      if (!descartar) return false;
    }
    this.visible.set(false);
    return true;
  }

  /** Foca o primeiro campo (útil depois de "Salvar e novo"). */
  focusFirstField(): void {
    const primeiro = this.registry.fields()[0];
    if (primeiro) {
      primeiro.focus();
      return;
    }
    this.body()?.nativeElement.querySelector<HTMLElement>('input, textarea, [role="combobox"]')?.focus();
  }

  /**
   * Leva ao primeiro campo com erro depois de uma tentativa de salvar: rola até ele e foca. Sem isso o
   * erro abaixo da dobra passa despercebido e o botão parece não ter feito nada. Chame logo após
   * marcar os erros; espera a renderização.
   */
  focusFirstError(): void {
    setTimeout(() => {
      const corpo = this.body()?.nativeElement;
      const campo = corpo?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const alvo = campo ?? corpo?.querySelector<HTMLElement>('.geo-field__error');
      if (!alvo) return;
      alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (campo) campo.focus({ preventScroll: true });
    });
  }

  protected onEscape(event: Event): void {
    const fechouOverlay = this.escFechouOverlay;
    this.escFechouOverlay = false;
    if (!this.visible() || event.defaultPrevented || fechouOverlay) return;
    // Esc com um overlay aberto (select, datepicker, confirmação) fecha só o overlay.
    const alvo = event.target as HTMLElement | null;
    if (alvo?.closest?.('.p-overlay, .p-select-overlay, .p-datepicker-panel, .p-confirmdialog')) return;
    if (document.querySelector(OVERLAYS_ABERTOS)) return;
    // Só o drawer de cima responde.
    const paineis = Array.from(document.querySelectorAll('.p-drawer'));
    const meu = this.body()?.nativeElement.closest('.p-drawer');
    if (meu && paineis.at(-1) !== meu) return;
    event.preventDefault();
    void this.requestClose();
  }

  protected iniciarRedimensionamento(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.janela.set(window.innerWidth);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.redimensionando.set(true);
  }

  protected redimensionar(event: PointerEvent): void {
    if (!this.redimensionando()) return;
    // O painel fica à direita: a largura é a distância do ponteiro até a borda direita da janela.
    this.definirLargura(window.innerWidth - event.clientX);
  }

  protected finalizarRedimensionamento(event: PointerEvent): void {
    if (!this.redimensionando()) return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.redimensionando.set(false);
  }

  /** Alterna entre a largura de `size` e a máxima. */
  protected alternarLargura(): void {
    this.janela.set(window.innerWidth);
    const { min, max } = this.limites();
    this.definirLargura(this.larguraAtual() < max ? max : min);
  }

  protected onResizeKey(event: KeyboardEvent): void {
    this.janela.set(window.innerWidth);
    const { min, max } = this.limites();
    const atual = this.larguraAtual();
    const proxima: Record<string, number> = {
      ArrowLeft: atual + PASSO_TECLADO,
      ArrowRight: atual - PASSO_TECLADO,
      Home: min,
      End: max,
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.alternarLargura();
    } else if (event.key in proxima) {
      event.preventDefault();
      this.definirLargura(proxima[event.key]);
    }
  }

  private definirLargura(px: number): void {
    const { min, max } = this.limites();
    this.larguraPx.set(Math.round(Math.min(Math.max(px, min), max)));
  }

  protected onShow(): void {
    setTimeout(() => this.focusFirstField());
  }

  protected onHide(): void {
    this.larguraPx.set(null);
    if (this.origemFoco?.isConnected) this.origemFoco.focus();
    this.origemFoco = null;
    this.closed.emit();
  }
}

function remParaPx(valor: string): number {
  const raiz = typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(parseFloat(valor) * raiz);
}
