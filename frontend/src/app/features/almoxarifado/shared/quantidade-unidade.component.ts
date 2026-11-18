import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { CesNumberInputComponent } from '@ces/ui';

import { MaterialResponse } from '../../../core/models/almoxarifado.models';
import { equivalenciaDe, fraseEquivalencia, numero, paraUnidadeBase, temEquivalencias, unidadeBase, unidadesDoMaterial } from './unidade-material';

/**
 * Quantidade com a unidade escolhida pela pessoa. Quando o material tem equivalências (ex.: cabo
 * em KG, fita em M), aparecem as unidades para tocar e a conversão logo abaixo, do jeito que vai
 * para o saldo. Sem equivalência, é só o campo de quantidade com a unidade do material.
 */
@Component({
  selector: 'app-quantidade-unidade',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesNumberInputComponent],
  /** Com outras unidades, quem usa o campo numa coluna estreita pode dar mais espaço (pílulas e conta). */
  host: { '[class.qu--multi]': 'multiplas()' },
  styles: `
    :host { display: block; min-width: 0; }
    .qu { display: flex; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap; }
    .qu ces-number-input { flex: 1 1 7rem; min-width: 6.5rem; }
    /* Com outras unidades o campo não estica: número do tamanho de um número, pílulas ao lado. */
    :host(.qu--multi) .qu ces-number-input { flex: 0 1 9rem; }
    .qu-unidades { display: inline-flex; gap: 0.25rem; padding-top: 0.125rem; }
    .qu--rotulo .qu-unidades { padding-top: 1.625rem; }
    .qu-pilula {
      min-height: 2.25rem; min-width: 2.75rem; padding: 0 0.625rem; border: 1px solid var(--ces-border); border-radius: 999px;
      background: var(--ces-surface); color: var(--ces-foreground); font: inherit; font-size: var(--ces-font-caption); font-weight: 600; cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .qu-pilula:hover { border-color: var(--ces-border-strong, var(--ces-border)); }
    .qu-pilula:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 2px; }
    .qu-pilula[aria-checked='true'] { border-color: var(--ces-brand); background: var(--ces-brand-soft); color: var(--ces-brand); }
    .qu-conversao { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; margin: 0.375rem 0 0; font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .qu-conversao strong { color: var(--ces-foreground); font-weight: 600; font-variant-numeric: tabular-nums; }
    .qu-conversao .pi { font-size: 0.75rem; }
    @media (prefers-reduced-motion: reduce) { .qu-pilula { transition: none; } }
  `,
  template: `
    <div class="qu" [class.qu--rotulo]="labelVisible()">
      <ces-number-input
        [label]="label()"
        [labelVisible]="labelVisible()"
        [min]="0"
        [max]="maxNaUnidade()"
        [maxFractionDigits]="3"
        [suffix]="' ' + unidadeAtual()"
        [value]="value()"
        (valueChange)="value.set($event)"
        [error]="error()"
        [description]="description()"
      />
      @if (multiplas()) {
        <div class="qu-unidades" role="radiogroup" [attr.aria-label]="'Unidade de ' + (label() || 'quantidade')">
          @for (u of unidades(); track u) {
            <button type="button" role="radio" class="qu-pilula" [attr.aria-checked]="unidadeAtual() === u" (click)="escolher(u)">{{ u }}</button>
          }
        </div>
      }
    </div>
    @if (conversao(); as c) {
      <p class="qu-conversao" aria-live="polite">
        <i class="pi pi-arrow-right-arrow-left" aria-hidden="true"></i>
        <span>Vai para o saldo como <strong>{{ c.base }}</strong></span>
        <span aria-hidden="true">·</span>
        <span>{{ c.frase }}</span>
      </p>
    }
  `
})
export class QuantidadeUnidadeComponent {
  readonly material = input<Pick<MaterialResponse, 'unidadeMedida' | 'equivalencias'> | null>(null);
  readonly label = input('Quantidade');
  readonly labelVisible = input(true);
  readonly error = input<string | undefined>();
  readonly description = input<string | undefined>();
  /** Máximo na unidade do material (ex.: o que falta entregar); é convertido para a unidade escolhida. */
  readonly maxBase = input<number | undefined>();
  /** Quantidade na unidade escolhida. */
  readonly value = model<number | null>(null);
  /** Unidade escolhida; nula = unidade do material. */
  readonly unidade = model<string | null>(null);

  protected readonly unidades = computed(() => unidadesDoMaterial(this.material()));
  protected readonly multiplas = computed(() => temEquivalencias(this.material()));
  protected readonly unidadeAtual = computed(() => {
    const escolhida = this.unidade()?.toUpperCase();
    return escolhida && this.unidades().includes(escolhida) ? escolhida : unidadeBase(this.material());
  });
  protected readonly maxNaUnidade = computed(() => {
    const max = this.maxBase();
    const eq = equivalenciaDe(this.material(), this.unidadeAtual());
    if (max === undefined || !eq) return max;
    return Math.floor(((max * eq.quantidadeUnidade) / eq.quantidadeBase) * 1000) / 1000;
  });
  protected readonly conversao = computed(() => {
    const eq = equivalenciaDe(this.material(), this.unidadeAtual());
    if (!eq) return null;
    const base = unidadeBase(this.material());
    const convertida = paraUnidadeBase(this.material(), this.value(), this.unidadeAtual());
    return {
      base: convertida === null ? `— ${base}` : `${numero(convertida)} ${base}`,
      frase: fraseEquivalencia(eq, base)
    };
  });

  protected escolher(u: string): void {
    this.unidade.set(u === unidadeBase(this.material()) ? null : u);
  }
}
