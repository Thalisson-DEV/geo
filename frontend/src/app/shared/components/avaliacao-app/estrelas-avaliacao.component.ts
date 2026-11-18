import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ROTULO_ESTRELAS } from '../../../core/models/avaliacao.models';

/**
 * As cinco estrelas da avaliação, usadas no convite e no formulário.
 *
 * <p><b>Por que o hover é do grupo, e não de cada estrela.</b> Com mouseenter/mouseleave
 * por estrela, o vão entre duas delas zerava o destaque e o rótulo piscava. Aqui só a saída
 * do grupo inteiro apaga a prévia, e o rótulo mora numa linha de altura fixa embaixo das
 * estrelas — trocar de texto nunca mexe no que está sob o cursor.</p>
 *
 * <p>Todas as estrelas são preenchidas; as apagadas só ficam em cinza suave, como nas lojas
 * de aplicativo. Contorno fino ao lado de preenchido parecia dois ícones diferentes.</p>
 */
@Component({
  selector: 'app-estrelas-avaliacao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ea" [class.ea--compacto]="compacto()">
      <div class="ea-linha" role="radiogroup" [attr.aria-label]="rotuloGrupo()" (mouseleave)="previa.set(0)">
        @for (n of notas; track n) {
          <button
            type="button"
            role="radio"
            class="ea-estrela"
            [class.ea-estrela--acesa]="n <= exibida()"
            [class.ea-estrela--escolhida]="n === pulando()"
            [attr.aria-checked]="valor() === n"
            [attr.aria-label]="n + (n === 1 ? ' estrela, ' : ' estrelas, ') + rotulos[n]"
            (mouseenter)="previa.set(n)"
            (focus)="previa.set(n)"
            (blur)="previa.set(0)"
            (click)="tocar(n)"
          >
            <i class="pi pi-star-fill" aria-hidden="true"></i>
          </button>
        }
      </div>
      <span class="ea-rotulo" [class.ea-rotulo--vazio]="!exibida()" aria-hidden="true">
        {{ exibida() ? rotulos[exibida()] : dica() }}
      </span>
    </div>
  `,
  styles: `
    :host { display: block; }
    .ea { display: grid; justify-items: center; gap: 0.375rem; }
    .ea-linha { display: flex; gap: 0.25rem; }
    .ea-estrela {
      display: inline-flex; align-items: center; justify-content: center;
      width: 3rem; height: 3rem; padding: 0; border: 0; border-radius: 999px;
      background: transparent; cursor: pointer; font-size: 2rem; line-height: 1;
      color: color-mix(in srgb, var(--geo-foreground) 16%, transparent);
      transition: color 140ms ease, transform 140ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .ea-estrela .pi { font-size: inherit; line-height: 1; }
    .ea-estrela:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .ea-estrela:active { transform: scale(0.9); }
    .ea-estrela--acesa { color: var(--geo-warning); }
    .ea-estrela--escolhida { animation: ea-pulo 320ms cubic-bezier(0.34, 1.56, 0.64, 1); }
    @keyframes ea-pulo { 0% { transform: scale(1); } 45% { transform: scale(1.18); } 100% { transform: scale(1); } }

    .ea-rotulo {
      min-height: 1.25rem; font-size: var(--geo-font-body); font-weight: 600; line-height: 1.25rem;
      color: var(--geo-foreground);
    }
    .ea-rotulo--vazio { font-weight: 400; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }

    .ea--compacto .ea-estrela { width: 2.5rem; height: 2.5rem; font-size: 1.625rem; }
    .ea--compacto .ea-linha { gap: 0.125rem; }

    @media (prefers-reduced-motion: reduce) {
      .ea-estrela { transition: none; }
      .ea-estrela--escolhida { animation: none; }
    }
  `
})
export class EstrelasAvaliacaoComponent {
  readonly valor = input<number | null>(null);
  readonly compacto = input(false);
  readonly dica = input('Toque numa estrela');
  readonly rotuloGrupo = input('Nota de 1 a 5 estrelas');
  readonly escolher = output<number>();

  protected readonly notas = [1, 2, 3, 4, 5];
  protected readonly rotulos = ROTULO_ESTRELAS;
  protected readonly previa = signal(0);
  protected readonly exibida = computed(() => this.previa() || this.valor() || 0);
  /** A estrela que acabou de ser tocada dá um pulinho; só no toque, nunca ao passar o mouse. */
  protected readonly pulando = signal(0);
  private pulo?: ReturnType<typeof setTimeout>;

  protected tocar(n: number): void {
    clearTimeout(this.pulo);
    this.pulando.set(0);
    queueMicrotask(() => this.pulando.set(n));
    this.pulo = setTimeout(() => this.pulando.set(0), 340);
    this.escolher.emit(n);
  }
}
