import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ROTULO_ESTRELAS } from '../../core/avaliacao/avaliacao.service';

/**
 * Cinco estrelas tocáveis (alvo de 44 px), usadas no convite e na folha da avaliação.
 * O SVG é próprio porque a estrela acesa é preenchida, e os ícones do app são só traço.
 */
@Component({
  selector: 'geo-estrelas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="estrelas" role="radiogroup" [attr.aria-label]="rotulo()">
      @for (n of notas; track n) {
        <button type="button" role="radio" class="estrela" [class.acesa]="n <= (valor() ?? 0)"
          [attr.aria-checked]="valor() === n"
          [attr.aria-label]="n + (n === 1 ? ' estrela, ' : ' estrelas, ') + rotulos[n]"
          (click)="escolher.emit(n)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.4 2.85 1-6L3.3 9.6l6-.9z" />
          </svg>
        </button>
      }
    </div>
    @if (mostrarRotulo()) {
      <span class="rotulo" [class.vazio]="!valor()" aria-hidden="true">{{ valor() ? rotulos[valor()!] : 'Toque numa estrela' }}</span>
    }
  `,
  styles: [`
    /* Dourado próprio da nota: é decoração, não estado. O --geo-atencao (âmbar escuro, feito para
       texto de alerta) deixava a estrela marrom. */
    :host { --estrela: #F5B400; --estrela-apagada: color-mix(in srgb, var(--geo-texto) 14%, transparent);
      display: grid; justify-items: center; gap: var(--geo-e1); }
    .estrelas { display: flex; gap: var(--geo-e2); }
    .estrela { width: 48px; height: 48px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
      background: transparent; color: var(--estrela-apagada); cursor: pointer; -webkit-tap-highlight-color: transparent;
      transition: color var(--geo-m-entrar), transform var(--geo-m-entrar) var(--geo-curva); }
    .estrela:active { transform: scale(.88); }
    .estrela:focus-visible { outline: 2px solid var(--geo-destaque); outline-offset: 1px; }
    .estrela svg { width: 38px; height: 38px; fill: currentColor; stroke: currentColor; stroke-width: 1; stroke-linejoin: round; }
    .estrela.acesa { color: var(--estrela); }
    .rotulo { min-height: 1.375rem; font: var(--geo-t-corpo-forte); color: var(--geo-texto); }
    .rotulo.vazio { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    @media (prefers-reduced-motion: reduce) { .estrela { transition: none; } }
  `],
})
export class EstrelasComponent {
  readonly valor = input<number | null>(null);
  readonly rotulo = input('Nota de 1 a 5 estrelas');
  readonly mostrarRotulo = input(true);
  readonly escolher = output<number>();

  protected readonly notas = [1, 2, 3, 4, 5];
  protected readonly rotulos = ROTULO_ESTRELAS;
}
