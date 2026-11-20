import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { IconeComponent, NomeIcone } from './icone.component';

/** Seletor de quantidade: − valor +, com digitação direta pelo teclado decimal. */
@Component({
  selector: 'geo-quantidade',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="caixa" [class.grande]="grande()" role="group" [attr.aria-label]="rotulo()">
      <button type="button" class="b" (click)="mudar(-passo())" [disabled]="valor() - passo() < minimo()" [attr.aria-label]="'Diminuir ' + rotulo()">
        <geo-icone nome="menos" [tamanho]="20" />
      </button>
      <span class="numero">
        <input #campo class="geo-num" type="text" inputmode="decimal" enterkeyhint="done" [value]="texto()" [style.width.ch]="largura()"
          (change)="digitar(campo.value); campo.value = texto()" (focus)="campo.select()" [attr.aria-label]="rotulo()">
        @if (unidade()) { <span class="un" aria-hidden="true">{{ unidade() }}</span> }
      </span>
      <button type="button" class="b" (click)="mudar(passo())" [attr.aria-label]="'Aumentar ' + rotulo()">
        <geo-icone nome="mais" [tamanho]="20" />
      </button>
    </div>
  `,
  styles: [`
    :host { display: inline-flex; }
    .caixa { display: inline-flex; align-items: center; border: 1px solid var(--geo-borda-campo); border-radius: var(--geo-r-pilula); }
    .b { width: 44px; height: 44px; border: 0; background: transparent; color: var(--geo-destaque); display: grid; place-items: center;
      border-radius: 50%; cursor: pointer; }
    .b:active:not(:disabled) { background: var(--geo-destaque-suave); }
    .b:disabled { color: var(--geo-texto-3); }
    .numero { display: inline-flex; align-items: baseline; justify-content: center; gap: 3px; min-width: 3.2em; }
    input { min-width: 2ch; border: 0; background: transparent; text-align: center; color: var(--geo-texto);
      font: 600 1rem/1 var(--geo-fonte); padding: 0; }
    input:focus { outline: none; }
    .un { font: 600 .8125rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    /* Versão para lançamentos: o número é a informação principal da linha. */
    .grande { border-width: 1.5px; }
    .grande .b { width: 52px; height: 52px; }
    .grande .numero { min-width: 4.5em; }
    .grande input { font: 600 1.5rem/1 var(--geo-fonte); }
    .grande .un { font-size: .9375rem; }
  `],
})
export class QuantidadeComponent {
  readonly valor = model.required<number>();
  readonly minimo = input(1);
  readonly passo = input(1);
  readonly rotulo = input('quantidade');
  readonly unidade = input<string | null>(null);
  readonly grande = input(false);
  /** Vírgula decimal, como o usuário escreve e lê. */
  readonly texto = computed(() => String(this.valor()).replace('.', ','));
  readonly largura = computed(() => Math.max(2, this.texto().length + 0.5));

  mudar(delta: number): void {
    const n = arredondar(this.valor() + delta);
    // Abaixo do mínimo o botão não faz nada (0,5 − 1 não vira 0,001).
    if (n < this.minimo()) return;
    this.valor.set(n);
  }

  digitar(texto: string): void {
    const n = Number(String(texto).replace(',', '.'));
    this.valor.set(Number.isFinite(n) ? Math.max(this.minimo(), arredondar(n)) : this.valor());
  }
}

function arredondar(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface OpcaoSegmento<T extends string = string> {
  valor: T;
  rotulo: string;
  icone?: NomeIcone;
}

/** Escolha entre 2–3 opções exclusivas. */
@Component({
  selector: 'geo-segmentado',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="trilho" role="radiogroup" [attr.aria-label]="rotulo()" [style.grid-template-columns]="colunas()">
      @for (o of opcoes(); track o.valor) {
        <button type="button" role="radio" [attr.aria-checked]="o.valor === valor()" (click)="valor.set(o.valor)">
          @if (o.valor === valor()) { <geo-icone nome="check" [tamanho]="18" /> }
          @else if (o.icone) { <geo-icone [nome]="o.icone" [tamanho]="18" /> }
          {{ o.rotulo }}
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    /* Botão segmentado (Material 3): contorno, divisórias e o selecionado com fundo de destaque + check. */
    .trilho { display: grid; border: 1px solid var(--geo-borda-campo); border-radius: var(--geo-r-pilula); overflow: hidden; }
    button { min-height: var(--geo-alvo); border: 0; border-left: 1px solid var(--geo-borda-campo); background: var(--geo-superficie);
      color: var(--geo-texto); font: 500 .875rem/1.1 var(--geo-fonte); display: inline-flex; align-items: center; justify-content: center;
      gap: 6px; padding: 0 var(--geo-e2); cursor: pointer; -webkit-user-select: none; user-select: none; touch-action: manipulation;
      transition: background-color var(--geo-m-entrar) var(--geo-curva), color var(--geo-m-entrar); }
    button:first-child { border-left: 0; }
    button:active { background: var(--geo-superficie-2); }
    button[aria-checked='true'] { background: var(--geo-destaque-suave); color: var(--geo-destaque); font-weight: 600; }
    button:focus-visible { outline: 2px solid var(--geo-destaque); outline-offset: -3px; }
  `],
})
export class SegmentadoComponent<T extends string = string> {
  readonly opcoes = input.required<OpcaoSegmento<T>[]>();
  readonly valor = model.required<T>();
  readonly rotulo = input('');
  readonly colunas = computed(() => `repeat(${this.opcoes().length}, 1fr)`);
}

/** Estado vazio útil: diz o que aparece aqui e como começar. */
@Component({
  selector: 'geo-vazio',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vazio">
      <span class="geo-selo geo-selo--destaque"><geo-icone [nome]="icone()" /></span>
      <h2>{{ titulo() }}</h2>
      @if (texto()) { <p>{{ texto() }}</p> }
      <ng-content />
    </div>
  `,
  styles: [`
    :host { display: block; }
    .vazio { display: grid; justify-items: center; text-align: center; gap: var(--geo-e2); padding: var(--geo-e8) var(--geo-e6); }
    h2 { margin: var(--geo-e2) 0 0; font: var(--geo-t-barra); }
    p { margin: 0; font: var(--geo-t-corpo); color: var(--geo-texto-2); max-width: 32ch; }
  `],
})
export class VazioComponent {
  readonly icone = input<NomeIcone>('info');
  readonly titulo = input.required<string>();
  readonly texto = input<string | null>(null);
}
