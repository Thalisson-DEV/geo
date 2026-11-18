import { Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';

const CLASSE = 'geo-valor-animado--mudou';

/**
 * Realce breve quando um valor exibido muda (ex.: indicador em tempo real). O primeiro valor não
 * anima; cada mudança reinicia o realce. Com reduzir movimento o realce vira instantâneo.
 *
 *   <strong [geoValorAnimado]="total()">{{ total() | number }}</strong>
 */
@Directive({
  selector: '[geoValorAnimado]',
  host: { '(animationend)': 'limpar($event)' },
})
export class GeoValorAnimadoDirective {
  readonly geoValorAnimado = input<unknown>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private primeiro = true;
  private anterior: unknown;

  constructor() {
    effect(() => {
      const valor = this.geoValorAnimado();
      untracked(() => this.mudou(valor));
    });
  }

  private mudou(valor: unknown): void {
    if (this.primeiro) {
      this.primeiro = false;
      this.anterior = valor;
      return;
    }
    if (Object.is(valor, this.anterior)) return;
    this.anterior = valor;
    this.el.classList.remove(CLASSE);
    // Força o navegador a notar a remoção para a animação reiniciar.
    void this.el.offsetWidth;
    this.el.classList.add(CLASSE);
  }

  protected limpar(evento: AnimationEvent): void {
    if (evento.target === this.el) this.el.classList.remove(CLASSE);
  }
}
