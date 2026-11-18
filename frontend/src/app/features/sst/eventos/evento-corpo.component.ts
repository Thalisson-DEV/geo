import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { RegiaoCorpo } from './evento-relatorio.util';

/**
 * Silhueta de frente com a região da lesão destacada. Vista de frente, o lado direito do
 * acidentado fica à esquerda de quem lê, por isso a figura traz "D" e "E" embaixo.
 */
@Component({
  selector: 'app-evento-corpo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="corpo" [attr.aria-label]="descricao()">
      <svg viewBox="0 0 120 268" role="img" aria-hidden="true" focusable="false">
        <circle [class]="cls('cabeca')" cx="60" cy="22" r="16" />
        <rect [class]="cls('pescoco')" x="53" y="38" width="14" height="10" rx="3" />
        <rect [class]="cls('torax')" x="40" y="49" width="40" height="42" rx="9" />
        <rect [class]="cls('abdome')" x="42" y="92" width="36" height="29" rx="6" />
        <rect [class]="cls('quadril')" x="40" y="122" width="40" height="18" rx="7" />

        <ellipse [class]="cls('ombro-d')" cx="33" cy="56" rx="9" ry="8" />
        <ellipse [class]="cls('ombro-e')" cx="87" cy="56" rx="9" ry="8" />
        <rect [class]="cls('braco-d')" x="23" y="64" width="12" height="38" rx="6" />
        <rect [class]="cls('braco-e')" x="85" y="64" width="12" height="38" rx="6" />
        <rect [class]="cls('antebraco-d')" x="19" y="104" width="12" height="36" rx="6" />
        <rect [class]="cls('antebraco-e')" x="89" y="104" width="12" height="36" rx="6" />
        <ellipse [class]="cls('mao-d')" cx="24" cy="150" rx="8" ry="10" />
        <ellipse [class]="cls('mao-e')" cx="96" cy="150" rx="8" ry="10" />

        <rect [class]="cls('coxa-d')" x="42" y="142" width="16" height="48" rx="7" />
        <rect [class]="cls('coxa-e')" x="62" y="142" width="16" height="48" rx="7" />
        <circle [class]="cls('joelho-d')" cx="50" cy="197" r="7" />
        <circle [class]="cls('joelho-e')" cx="70" cy="197" r="7" />
        <rect [class]="cls('perna-d')" x="43" y="205" width="14" height="38" rx="6" />
        <rect [class]="cls('perna-e')" x="63" y="205" width="14" height="38" rx="6" />
        <ellipse [class]="cls('pe-d')" cx="48" cy="251" rx="9" ry="5" />
        <ellipse [class]="cls('pe-e')" cx="72" cy="251" rx="9" ry="5" />

        <text x="4" y="268" class="lado">D</text>
        <text x="104" y="268" class="lado">E</text>
      </svg>
    </figure>
  `,
  styles: `
    :host { display: block; }
    .corpo { margin: 0; display: flex; justify-content: center; }
    svg { width: 100%; max-width: 4.75rem; height: auto; overflow: visible; }
    .r { fill: var(--geo-surface-muted); stroke: var(--geo-border-strong); stroke-width: 1; transition: fill 0.2s ease; }
    .r--on { fill: var(--geo-danger); stroke: var(--geo-danger-text); stroke-width: 1.5; }
    .lado { font-size: 15px; font-weight: 700; fill: var(--geo-foreground-muted); }
    @media print {
      .r { fill: #f1f5f9; stroke: #94a3b8; }
      .r--on { fill: #dc2626; stroke: #7f1d1d; }
      .lado { fill: #334155; }
    }
  `
})
export class EventoCorpoComponent {
  readonly regioes = input<RegiaoCorpo[]>([]);
  readonly local = input<string | null>(null);

  private readonly ativas = computed(() => new Set<string>(this.regioes()));

  protected readonly descricao = computed(() =>
    this.local() ? `Figura do corpo humano com a região atingida destacada: ${this.local()}` : 'Figura do corpo humano'
  );

  protected cls(regiao: RegiaoCorpo): string {
    return this.ativas().has(regiao) ? 'r r--on' : 'r';
  }
}
