import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';

/**
 * Cabeçalho das abas principais: título grande à esquerda, ação discreta à direita.
 * Ao rolar, quando o título grande sai da tela, aparece uma barra compacta fixa no topo com o
 * nome da tela (título grande que recolhe, como no iOS e no Material 3): quem rolou uma lista
 * longa continua sabendo onde está.
 *
 * O host usa `display: contents` para a barra compacta ser filha direta da tela e poder ficar
 * presa ao topo durante toda a rolagem (um `sticky` só gruda dentro do próprio pai).
 */
@Component({
  selector: 'geo-titulo-grande',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="compacta" [class.visivel]="recolhido()" aria-hidden="true"><span>{{ titulo() }}</span></div>
    <header class="cab">
      <div class="txt">
        <h1 #tituloGrande>{{ titulo() }}</h1>
        @if (subtitulo()) { <p>{{ subtitulo() }}</p> }
      </div>
      <div class="acoes"><ng-content /></div>
    </header>
  `,
  styles: [`
    :host { display: contents; }
    .cab { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--geo-e3);
      padding: calc(var(--geo-safe-topo) + var(--geo-e5)) var(--geo-margem) var(--geo-e1); }
    .txt { flex: 1; min-width: 0; }
    h1 { margin: 0; font: var(--geo-t-titulo); letter-spacing: -.02em; text-wrap: balance; overflow-wrap: anywhere; }
    p { margin: 2px 0 0; font: var(--geo-t-apoio); font-size: .875rem; color: var(--geo-texto-2); }
    /* Ações agrupadas, sem encolher: o título é que cede espaço (e quebra linha se precisar). */
    .acoes { display: flex; align-items: center; gap: var(--geo-e2); flex: none; padding-bottom: 2px; }
    .acoes:empty { display: none; }

    /* Barra compacta: altura zero no fluxo, desenhada por cima do conteúdo quando o título grande some. */
    .compacta { position: sticky; top: 0; z-index: 8; height: 0; }
    .compacta > span { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; justify-content: center;
      min-height: calc(48px + var(--geo-safe-topo)); padding: var(--geo-safe-topo) var(--geo-margem) 0; box-sizing: border-box;
      background: var(--geo-fundo); border-bottom: 1px solid var(--geo-linha); font: var(--geo-t-barra);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      opacity: 0; transform: translateY(-6px); pointer-events: none;
      transition: opacity var(--geo-m-sair) var(--geo-curva-saida), transform var(--geo-m-sair) var(--geo-curva-saida); }
    .compacta.visivel > span { opacity: 1; transform: none;
      transition: opacity var(--geo-m-entrar) var(--geo-curva), transform var(--geo-m-entrar) var(--geo-curva); }
  `],
})
export class TituloGrandeComponent implements AfterViewInit {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string | null | undefined>(null);
  readonly recolhido = signal(false);
  private readonly h1 = viewChild.required<ElementRef<HTMLElement>>('tituloGrande');
  private readonly destroyRef = inject(DestroyRef);

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    // Recolhe só quando o título passou para cima da tela (não quando está abaixo, ex.: tela curta).
    const observador = new IntersectionObserver(([entrada]) => {
      this.recolhido.set(!entrada.isIntersecting && entrada.boundingClientRect.top < 0);
    }, { threshold: 0 });
    observador.observe(this.h1().nativeElement);
    this.destroyRef.onDestroy(() => observador.disconnect());
  }
}
