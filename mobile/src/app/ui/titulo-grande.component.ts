import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabeçalho das abas principais: título grande à esquerda, ação discreta à direita. */
@Component({
  selector: 'ces-titulo-grande',
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
    .cab { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--ces-e3);
      padding: calc(var(--ces-safe-topo) + var(--ces-e5)) var(--ces-e5) var(--ces-e1); }
    .txt { flex: 1; min-width: 0; }
    h1 { margin: 0; font: var(--ces-t-titulo); letter-spacing: -.02em; text-wrap: balance; overflow-wrap: anywhere; }
    p { margin: 2px 0 0; font: var(--ces-t-apoio); font-size: .875rem; color: var(--ces-texto-2); }
    /* Ações agrupadas, sem encolher: o título é que cede espaço (e quebra linha se precisar). */
    .acoes { display: flex; align-items: center; gap: var(--ces-e2); flex: none; padding-bottom: 2px; }
    .acoes:empty { display: none; }
    @media (max-width: 430px) { .cab { padding-left: var(--ces-e4); padding-right: var(--ces-e4); } }
  `],
})
export class TituloGrandeComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string | null | undefined>(null);
}
