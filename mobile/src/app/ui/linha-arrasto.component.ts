import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { IconeComponent, NomeIcone } from './icone.component';

const LARGURA_ACAO = 96;

/**
 * Linha com ação por arrasto (padrão de listas nativas): arrastar para a esquerda mostra a ação; soltar depois da
 * metade a executa. A mesma ação sempre existe como botão visível na linha (quem projeta o conteúdo coloca), então o
 * arrasto é só atalho — nunca o único caminho, e funciona igual com teclado e leitor de tela.
 */
@Component({
  selector: 'geo-linha-arrasto',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fundo" [class.perigo]="tom() === 'perigo'" aria-hidden="true">
      <span class="acao"><geo-icone [nome]="icone()" [tamanho]="20" />{{ rotulo() }}</span>
    </div>
    <div class="frente" [style.transform]="'translateX(' + (-deslocamento()) + 'px)'" [class.solto]="!arrastando()"
      (pointerdown)="comecar($event)" (pointermove)="mover($event)" (pointerup)="soltar()" (pointercancel)="cancelar()">
      <ng-content />
    </div>
  `,
  styles: [`
    :host { display: block; position: relative; overflow: hidden; }
    .fundo { position: absolute; inset: 0; display: flex; justify-content: flex-end; align-items: center; padding-right: var(--geo-e4);
      background: var(--geo-destaque); color: var(--geo-destaque-texto); }
    .fundo.perigo { background: var(--geo-erro); }
    .acao { display: inline-flex; align-items: center; gap: var(--geo-e2); font: 600 .9375rem/1 var(--geo-fonte); }
    .frente { position: relative; background: var(--geo-superficie); touch-action: pan-y; }
    .frente.solto { transition: transform var(--geo-m-sair) var(--geo-curva); }
    @media (prefers-reduced-motion: reduce) { .frente.solto { transition: none; } }
  `],
})
export class LinhaArrastoComponent {
  readonly rotulo = input.required<string>();
  readonly icone = input<NomeIcone>('desfazer');
  readonly tom = input<'destaque' | 'perigo'>('destaque');
  readonly acao = output<void>();

  readonly deslocamento = signal(0);
  readonly arrastando = signal(false);
  private inicioX: number | null = null;
  private inicioY = 0;

  comecar(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    this.inicioX = e.clientX;
    this.inicioY = e.clientY;
  }

  mover(e: PointerEvent): void {
    if (this.inicioX === null) return;
    const dx = this.inicioX - e.clientX;
    if (!this.arrastando() && Math.abs(e.clientY - this.inicioY) > Math.abs(dx)) {
      this.inicioX = null;
      return;
    }
    if (dx > 6) this.arrastando.set(true);
    if (this.arrastando()) this.deslocamento.set(Math.max(0, Math.min(LARGURA_ACAO * 1.4, dx)));
  }

  soltar(): void {
    const executar = this.deslocamento() >= LARGURA_ACAO * 0.6;
    this.cancelar();
    if (executar) this.acao.emit();
  }

  cancelar(): void {
    this.inicioX = null;
    this.arrastando.set(false);
    this.deslocamento.set(0);
  }
}
