import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabeçalho das abas principais: título grande à esquerda, ação discreta à direita. */
@Component({
  selector: 'geo-titulo-grande',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cab">
      <div class="txt">
        <h1>{{ titulo() }}</h1>
        @if (subtitulo()) { <p>{{ subtitulo() }}</p> }
      </div>
      <div class="acoes"><ng-content /></div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .cab { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--geo-e3);
      padding: calc(var(--geo-safe-topo) + var(--geo-e5)) var(--geo-margem) var(--geo-e1); }
    .txt { flex: 1; min-width: 0; }
    h1 { margin: 0; font: var(--geo-t-titulo); letter-spacing: -.02em; text-wrap: balance; overflow-wrap: anywhere; }
    p { margin: 2px 0 0; font: var(--geo-t-apoio); font-size: .875rem; color: var(--geo-texto-2); }
    /* Ações agrupadas, sem encolher: o título é que cede espaço (e quebra linha se precisar). */
    .acoes { display: flex; align-items: center; gap: var(--geo-e2); flex: none; padding-bottom: 2px; }
    .acoes:empty { display: none; }
  `],
})
export class TituloGrandeComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string | null | undefined>(null);
}
