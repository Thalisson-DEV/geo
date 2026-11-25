import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface FaixaParte {
  chave: string;
  rotulo: string;
  total: number;
  tom: 'danger' | 'warning' | 'info' | 'success' | 'neutral' | 'subtle';
}

/**
 * Faixa de situação: uma barra proporcional com a legenda embaixo. Mostra de relance quanto do dia (ou das
 * equipes) está em cada situação. Clicar numa parte filtra a lista (a escolhida fica com `aria-pressed`).
 */
@Component({
  selector: 'app-faixa-situacao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: grid; gap: var(--geo-space-2); min-width: 0; }
    .fx__topo { display: flex; align-items: baseline; justify-content: space-between; gap: var(--geo-space-3); flex-wrap: wrap; }
    .fx__titulo { margin: 0; font-size: var(--geo-font-title); font-weight: var(--geo-font-weight-semibold); }
    .fx__titulo strong { font-variant-numeric: tabular-nums; }
    .fx__apoio { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .fx__barra { display: flex; gap: 2px; height: 0.625rem; overflow: hidden; border-radius: 999px; background: var(--geo-surface-muted); }
    .fx__seg { min-width: 0.5rem; height: 100%; padding: 0; border: 0; background: var(--fx-cor); cursor: pointer; transition: opacity 120ms ease, filter 120ms ease; }
    .fx__seg:hover { filter: brightness(1.08); }
    .fx--filtrado .fx__seg:not([aria-pressed='true']) { opacity: 0.3; }
    .fx__seg:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .fx__legenda { display: flex; flex-wrap: wrap; gap: var(--geo-space-1) var(--geo-space-4); margin: 0; padding: 0; list-style: none; }
    .fx__legenda button {
      display: inline-flex; align-items: center; gap: var(--geo-space-2); padding: 2px 0; border: 0; background: none;
      color: var(--geo-foreground-muted); font: inherit; font-size: var(--geo-font-caption); cursor: pointer;
    }
    .fx__legenda button:hover, .fx__legenda button[aria-pressed='true'] { color: var(--geo-foreground); }
    .fx__legenda button[aria-pressed='true'] .fx__rot { text-decoration: underline; text-underline-offset: 3px; }
    .fx__legenda button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; border-radius: 2px; }
    .fx__ponto { width: 0.625rem; height: 0.625rem; border-radius: 3px; background: var(--fx-cor); }
    .fx__num { color: var(--geo-foreground); font-weight: var(--geo-font-weight-semibold); font-variant-numeric: tabular-nums; }
    [data-tom='danger'] { --fx-cor: var(--geo-danger); }
    [data-tom='warning'] { --fx-cor: var(--geo-warning); }
    [data-tom='info'] { --fx-cor: var(--geo-info); }
    [data-tom='success'] { --fx-cor: var(--geo-success); }
    [data-tom='neutral'] { --fx-cor: var(--geo-foreground-muted); }
    [data-tom='subtle'] { --fx-cor: var(--geo-border-strong); }
    @media (prefers-reduced-motion: reduce) { .fx__seg { transition: none; } }
  `,
  template: `
    <div class="fx__topo">
      <p class="fx__titulo">{{ titulo() }}</p>
      @if (apoio()) { <span class="fx__apoio">{{ apoio() }}</span> }
    </div>
    <div class="fx__barra" aria-hidden="true">
      @for (p of visiveis(); track p.chave) {
        <button type="button" tabindex="-1" class="fx__seg" [attr.data-tom]="p.tom" [style.flex-grow]="p.total"
          [attr.aria-pressed]="ativo() === p.chave" [title]="p.rotulo + ': ' + p.total" (click)="alternar(p.chave)"></button>
      }
    </div>
    <ul class="fx__legenda" [attr.aria-label]="rotuloGrupo()">
      @for (p of visiveis(); track p.chave) {
        <li>
          <button type="button" [attr.data-tom]="p.tom" [attr.aria-pressed]="ativo() === p.chave" (click)="alternar(p.chave)">
            <span class="fx__ponto" aria-hidden="true"></span><span class="fx__num">{{ p.total }}</span><span class="fx__rot">{{ p.rotulo }}</span>
          </button>
        </li>
      }
    </ul>
  `,
  host: { '[class.fx--filtrado]': 'ativo()' },
})
export class FaixaSituacaoComponent {
  readonly titulo = input.required<string>();
  readonly apoio = input<string | null>(null);
  readonly partes = input.required<readonly FaixaParte[]>();
  readonly ativo = input<string | null>(null);
  readonly rotuloGrupo = input('Filtrar pela situação');
  readonly escolher = output<string | null>();

  protected readonly visiveis = computed(() => this.partes().filter((p) => p.total > 0));

  protected alternar(chave: string): void {
    this.escolher.emit(this.ativo() === chave ? null : chave);
  }
}
