import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { ComUnidade, equivalenciaDe, frase, numero, paraBase, unidadeBase, unidadesDo } from '../core/almox/unidade-material';
import { QuantidadeComponent } from './controles.component';
import { IconeComponent } from './icone.component';

/**
 * Quantidade com a unidade escolhida. Sem equivalência é o seletor de sempre; com equivalência
 * aparecem as unidades para tocar (ex.: UN | M) e a conta logo abaixo, do jeito que vai para o saldo.
 */
@Component({
  selector: 'ces-quantidade-unidade',
  standalone: true,
  imports: [QuantidadeComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qu">
      <ces-quantidade [grande]="grande()" [unidade]="atual()" [valor]="valor()" (valorChange)="valor.set($event)" [minimo]="minimo()" [rotulo]="rotulo()" />
      @if (unidades().length > 1) {
        <div class="unidades" role="radiogroup" [attr.aria-label]="'Unidade de ' + rotulo()">
          @for (u of unidades(); track u) {
            <button type="button" role="radio" class="un" [attr.aria-checked]="atual() === u" (click)="escolher(u)">{{ u }}</button>
          }
        </div>
      }
    </div>
    @if (conta(); as c) {
      <p class="conta ces-num" aria-live="polite"><ces-icone nome="transferencia" [tamanho]="14" />Vai para o saldo como <strong>{{ c.base }}</strong> · {{ c.frase }}</p>
    }
  `,
  styles: [`
    :host { display: block; }
    .qu { display: flex; align-items: center; gap: var(--ces-e2); flex-wrap: wrap; justify-content: flex-end; }
    .unidades { display: inline-flex; gap: 4px; }
    .un { min-width: 48px; min-height: 44px; padding: 0 var(--ces-e3); border: 1.5px solid var(--ces-linha-forte); border-radius: var(--ces-r-pilula);
      background: transparent; color: var(--ces-texto); font: 600 .875rem/1 var(--ces-fonte); cursor: pointer; }
    .un[aria-checked='true'] { border-color: var(--ces-destaque); background: var(--ces-destaque-suave); color: var(--ces-destaque); }
    .un:focus-visible { outline: 2px solid var(--ces-destaque); outline-offset: 2px; }
    .conta { display: flex; align-items: center; justify-content: flex-end; gap: 4px; flex-wrap: wrap; margin: var(--ces-e1) 0 0; font: var(--ces-t-apoio); color: var(--ces-texto-2); text-align: right; }
    .conta strong { color: var(--ces-texto); }
  `],
})
export class QuantidadeUnidadeComponent {
  readonly material = input<ComUnidade | null>(null);
  /** Quantidade na unidade escolhida. */
  readonly valor = model.required<number>();
  /** Unidade escolhida; nula = unidade do material. */
  readonly unidade = model<string | null>(null);
  readonly minimo = input(0.001);
  readonly rotulo = input('quantidade');
  readonly grande = input(true);

  readonly unidades = computed(() => unidadesDo(this.material()));
  readonly atual = computed(() => {
    const u = this.unidade()?.toUpperCase();
    return u && this.unidades().includes(u) ? u : unidadeBase(this.material());
  });
  readonly conta = computed(() => {
    const eq = equivalenciaDe(this.material(), this.atual());
    if (!eq) return null;
    const base = unidadeBase(this.material());
    return { base: `${numero(paraBase(this.material(), this.valor(), this.atual()))} ${base}`, frase: frase(eq, base) };
  });

  escolher(u: string): void {
    this.unidade.set(u === unidadeBase(this.material()) ? null : u);
  }
}
