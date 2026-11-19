import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let sequencia = 0;

/**
 * Logo do GEO: só o "G" aberto com o ponto âmbar. É a única forma de representar o produto.
 *
 * - `tile` (padrão): quadrado azul com o G branco; contraste de 3:1 em fundo claro, escuro e no
 *   menu azul-marinho.
 * - `mono`: só o traço do G na cor do texto (`currentColor`), com o ponto âmbar; para usos
 *   pequenos sobre superfícies já coloridas.
 *
 * As cores da marca são fixas aqui de propósito (arquivo do DS, fora da catraca visual).
 */
@Component({
  selector: 'geo-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-logo',
    role: 'img',
    '[attr.aria-label]': 'label()',
    '[style.--geo-logo-size]': 'size()',
  },
  template: `
    @if (variant() === 'tile') {
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient [attr.id]="gradiente" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#2563EB" />
            <stop offset="1" stop-color="#1E40AF" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="26" [attr.fill]="'url(#' + gradiente + ')'" />
        <path d="M71.2 34.5A26 26 0 1 0 76 50H52" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="71.5" cy="31" r="7.5" fill="#FBBF24" stroke="#1E40AF" stroke-width="3" />
      </svg>
    } @else {
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
        <path d="M71.2 34.5A26 26 0 1 0 76 50H52" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="71.5" cy="31" r="7.5" fill="#FBBF24" />
      </svg>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        inline-size: var(--geo-logo-size, 2rem);
        block-size: var(--geo-logo-size, 2rem);
      }
      svg {
        inline-size: 100%;
        block-size: 100%;
      }
    `,
  ],
})
export class GeoLogoComponent {
  readonly variant = input<'tile' | 'mono'>('tile');
  /** Tamanho CSS (ex.: '2rem', '40px'). */
  readonly size = input<string>('2rem');
  readonly label = input<string>('GEO');

  protected readonly gradiente = `geo-logo-g-${++sequencia}`;
}
