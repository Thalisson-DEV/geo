import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Renderer2,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { GEO_ICONES, resolverIcone } from './geo-icons';

export type GeoIconSize = 'sm' | 'md' | 'lg';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Ícone de traço do GEO (Lucide). Aceita o nome Lucide (`name="check"`) e, durante a migração,
 * a classe PrimeIcons (`name="pi pi-check"`). Sem `label` o ícone é decorativo (aria-hidden);
 * com `label` ele é anunciado. Tamanho e espessura vêm dos tokens `--geo-icon-*`.
 */
@Component({
  selector: 'geo-icon',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-icon',
    '[class.geo-icon--sm]': "size() === 'sm'",
    '[class.geo-icon--lg]': "size() === 'lg'",
    '[class.geo-icon--spin]': 'spin() || resolvido()?.girar',
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
    '[attr.data-icon]': 'resolvido()?.nome ?? null',
  },
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        inline-size: var(--geo-icon-size-md);
        block-size: var(--geo-icon-size-md);
        color: inherit;
        line-height: 0;
      }
      :host(.geo-icon--sm) {
        inline-size: var(--geo-icon-size-sm);
        block-size: var(--geo-icon-size-sm);
      }
      :host(.geo-icon--lg) {
        inline-size: var(--geo-icon-size-lg);
        block-size: var(--geo-icon-size-lg);
      }
      :host(.geo-icon--spin) svg {
        animation: geo-icon-girar 0.9s linear infinite;
      }
      :host ::slotted(svg),
      svg {
        inline-size: 100%;
        block-size: 100%;
        stroke-width: var(--geo-icon-stroke);
      }
      @keyframes geo-icon-girar {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class GeoIconComponent {
  readonly name = input.required<string>();
  readonly size = input<GeoIconSize>('md');
  /** Nome acessível. Use só quando o ícone comunica algo que não está escrito ao lado. */
  readonly label = input<string>();
  /** Gira continuamente (carregando). Para no "reduzir movimento". */
  readonly spin = input(false);

  protected readonly resolvido = computed(() => resolverIcone(this.name()));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  constructor() {
    effect(() => this.desenhar(this.resolvido()?.nome));
  }

  private desenhar(nome: keyof typeof GEO_ICONES | undefined): void {
    const el = this.host.nativeElement;
    for (const filho of Array.from(el.childNodes)) this.renderer.removeChild(el, filho);
    if (!nome) return;

    const svg = this.renderer.createElement('svg', SVG_NS) as SVGElement;
    const atributos: Record<string, string> = {
      xmlns: SVG_NS,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
    };
    for (const [chave, valor] of Object.entries(atributos)) this.renderer.setAttribute(svg, chave, valor);

    for (const [tag, attrs] of GEO_ICONES[nome]) {
      const no = this.renderer.createElement(tag, SVG_NS);
      for (const [chave, valor] of Object.entries(attrs)) {
        if (chave !== 'key') this.renderer.setAttribute(no, chave, String(valor));
      }
      this.renderer.appendChild(svg, no);
    }
    this.renderer.appendChild(el, svg);
  }
}
