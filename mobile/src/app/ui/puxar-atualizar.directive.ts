import { Directive, ElementRef, OnDestroy, OnInit, Renderer2, effect, inject, input, output } from '@angular/core';

/** Distância (px) que dispara a atualização; o puxão é amortecido para a mão sentir o limite. */
const LIMIAR = 72;
const MAXIMO = 110;

/**
 * Puxar para atualizar (padrão de mercado): na área rolável, com a lista no topo, puxar para baixo mostra o indicador e,
 * passando do limite, pede a atualização. Só toque; no mouse e no teclado a alternativa é o "Sincronizar agora" da Conta.
 * O indicador é anunciado ("Atualizando…") e respeita o movimento reduzido.
 */
@Directive({
  selector: '[geoPuxarAtualizar]',
  standalone: true,
})
export class PuxarAtualizarDirective implements OnInit, OnDestroy {
  readonly ativo = input(true, { alias: 'geoPuxarAtualizar' });
  /** Enquanto verdadeiro, o indicador gira no topo. */
  readonly atualizando = input(false);
  readonly atualizar = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly r = inject(Renderer2);
  private indicador!: HTMLElement;
  private inicioY: number | null = null;
  private distancia = 0;
  private readonly remover: (() => void)[] = [];

  constructor() {
    effect(() => {
      const girando = this.atualizando();
      if (!this.indicador) return;
      this.indicador.classList.toggle('geo-puxar--girando', girando);
      this.indicador.setAttribute('aria-hidden', girando ? 'false' : 'true');
      this.indicador.textContent = '';
      if (girando) this.indicador.append(this.rotulo('Atualizando…'));
      if (!girando) this.posicionar(0);
    });
  }

  ngOnInit(): void {
    this.indicador = this.r.createElement('div');
    this.indicador.className = 'geo-puxar';
    this.indicador.setAttribute('role', 'status');
    this.indicador.setAttribute('aria-hidden', 'true');
    const el = this.host.nativeElement;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.insertBefore(this.indicador, el.firstChild);
    this.remover.push(
      this.r.listen(el, 'touchstart', (e: TouchEvent) => this.comecar(e)),
      this.r.listen(el, 'touchmove', (e: TouchEvent) => this.mover(e)),
      this.r.listen(el, 'touchend', () => this.soltar()),
      this.r.listen(el, 'touchcancel', () => this.soltar()),
    );
  }

  ngOnDestroy(): void {
    this.remover.forEach(f => f());
    this.indicador?.remove();
  }

  private comecar(e: TouchEvent): void {
    this.inicioY = this.ativo() && !this.atualizando() && this.host.nativeElement.scrollTop <= 0 && e.touches.length === 1
      ? e.touches[0].clientY : null;
    this.distancia = 0;
  }

  private mover(e: TouchEvent): void {
    if (this.inicioY === null) return;
    const dy = e.touches[0].clientY - this.inicioY;
    if (dy <= 0 || this.host.nativeElement.scrollTop > 0) {
      this.posicionar(0);
      return;
    }
    this.distancia = Math.min(MAXIMO, dy * 0.5);
    this.posicionar(this.distancia);
  }

  private soltar(): void {
    if (this.inicioY === null) return;
    this.inicioY = null;
    if (this.distancia >= LIMIAR * 0.75) {
      this.atualizar.emit();
      this.posicionar(LIMIAR * 0.6);
    } else {
      this.posicionar(0);
    }
    this.distancia = 0;
  }

  private posicionar(px: number): void {
    this.indicador.style.setProperty('--geo-puxar', `${px}px`);
    this.indicador.classList.toggle('geo-puxar--pronto', px >= LIMIAR * 0.75);
  }

  private rotulo(texto: string): HTMLElement {
    const span = this.r.createElement('span');
    span.className = 'geo-sr-only';
    span.textContent = texto;
    return span;
  }
}
