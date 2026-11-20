import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { FolhaComponent } from './folha.component';
import { IconeComponent } from './icone.component';

export interface OpcaoSeletor {
  valor: string;
  rotulo: string;
  apoio?: string | null;
  desabilitado?: boolean;
}

/**
 * Campo de escolha no padrão do celular: uma linha com o rótulo e o valor; o toque
 * abre uma folha inferior com busca. Substitui `<select>` e dropdowns caseiros.
 * Um valor (`valor`) ou vários (`valores`, com `multiplo`). `aberto` é um model para
 * a tela poder persistir a folha aberta no rascunho.
 */
@Component({
  selector: 'geo-seletor',
  standalone: true,
  imports: [FolhaComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="campo" [class.vazio]="!resumo()" [class.invalido]="invalido()" [disabled]="desabilitado()"
      (click)="abrir()" [attr.aria-haspopup]="'dialog'" [attr.aria-label]="rotulo() + ': ' + (resumo() || 'não escolhido')">
      <span class="txt">
        <span class="rotulo">{{ rotulo() }}@if (obrigatorio()) {<span aria-hidden="true"> *</span>}</span>
        <span class="valor">{{ resumo() || placeholder() }}</span>
      </span>
      <geo-icone nome="avancar" [tamanho]="18" />
    </button>

    <geo-folha [aberta]="aberto()" (fechar)="fechar()" [titulo]="rotulo()" [descricao]="multiplo() ? 'Marque quantos precisar.' : null">
      @if (buscavel() ?? opcoes().length > 6) {
        <div class="busca">
          <geo-icone nome="busca" [tamanho]="18" />
          <input type="search" [placeholder]="placeholderBusca()" enterkeyhint="search" autocomplete="off" [attr.aria-label]="'Buscar ' + rotulo()"
            [value]="busca()" (input)="busca.set($any($event.target).value)">
        </div>
      }
      <ul class="geo-grupo lista" [attr.role]="multiplo() ? 'group' : 'radiogroup'" [attr.aria-label]="rotulo()">
        @for (o of filtradas(); track o.valor) {
          <li>
            <button type="button" class="geo-linha geo-linha--acao" [attr.role]="multiplo() ? 'checkbox' : 'radio'"
              [attr.aria-checked]="marcado(o.valor)" [disabled]="o.desabilitado" (click)="escolher(o)">
              @if (multiplo()) {
                <span class="caixa" [class.marcada]="marcado(o.valor)" aria-hidden="true"><geo-icone nome="check" [tamanho]="16" /></span>
              }
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo">{{ o.rotulo }}</span>
                @if (o.apoio) { <span class="geo-linha__apoio">{{ o.apoio }}</span> }
              </span>
              @if (!multiplo() && marcado(o.valor)) { <geo-icone nome="check" /> }
            </button>
          </li>
        } @empty {
          <li><div class="geo-linha"><span class="geo-linha__apoio">Nada encontrado</span></div></li>
        }
      </ul>
      @if (multiplo()) {
        <div rodape class="rodape"><button type="button" class="geo-btn geo-btn--principal geo-btn--bloco" (click)="fechar()">Pronto</button></div>
      }
    </geo-folha>
  `,
  styles: [`
    :host { display: block; }
    .campo { width: 100%; display: flex; align-items: center; gap: var(--geo-e3); min-height: 64px; padding: var(--geo-e3) var(--geo-e4);
      background: var(--geo-superficie); border: 0; border-radius: var(--geo-r-grupo); text-align: left; color: var(--geo-texto); cursor: pointer; }
    .campo:active:not(:disabled) { background: var(--geo-superficie-2); }
    .campo:disabled { cursor: default; opacity: .7; }
    .campo.invalido { box-shadow: inset 0 0 0 1.5px var(--geo-erro); }
    .txt { flex: 1; min-width: 0; display: grid; gap: 2px; }
    .rotulo { font: 500 .8125rem/1.3 var(--geo-fonte); color: var(--geo-texto-2); }
    .valor { font: var(--geo-t-corpo-forte); overflow-wrap: anywhere; }
    .vazio .valor { color: var(--geo-texto-3); font-weight: 400; }
    .busca { margin: 0 var(--geo-e3) var(--geo-e3); display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 48px;
      border-radius: var(--geo-r-pilula); background: var(--geo-superficie-2); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .lista { background: var(--geo-fundo); }
    .lista .geo-linha:disabled { opacity: .5; }
    .caixa { width: 24px; height: 24px; border-radius: 7px; border: 2px solid var(--geo-borda-campo); display: grid; place-items: center; color: transparent; flex: none; }
    .caixa.marcada { background: var(--geo-destaque); border-color: var(--geo-destaque); color: var(--geo-destaque-texto); }
    .rodape { padding: var(--geo-e3) var(--geo-e4) 0; }
  `],
})
export class SeletorComponent {
  readonly rotulo = input.required<string>();
  readonly opcoes = input.required<OpcaoSeletor[]>();
  readonly placeholder = input('Escolher');
  readonly obrigatorio = input(false);
  readonly multiplo = input(false);
  readonly desabilitado = input(false);
  readonly invalido = input(false);
  /** Busca no topo da folha: sem valor, aparece a partir de 7 opções; `true` sempre (lista que cresce com o cadastro). */
  readonly buscavel = input<boolean | null>(null);
  readonly placeholderBusca = input('Buscar');
  readonly valor = model<string | null>(null);
  readonly valores = model<string[]>([]);
  readonly aberto = model(false);
  readonly escolhido = output<OpcaoSeletor>();
  readonly busca = signal('');

  readonly filtradas = computed(() => {
    const q = normalizar(this.busca());
    return q ? this.opcoes().filter(o => normalizar(`${o.rotulo} ${o.apoio ?? ''}`).includes(q)) : this.opcoes();
  });

  readonly resumo = computed(() => {
    if (this.multiplo()) {
      const sel = this.opcoes().filter(o => this.valores().includes(o.valor));
      if (!sel.length) return '';
      return sel.length <= 2 ? sel.map(o => o.rotulo).join(', ') : `${sel[0].rotulo} e mais ${sel.length - 1}`;
    }
    return this.opcoes().find(o => o.valor === this.valor())?.rotulo ?? '';
  });

  marcado(v: string): boolean {
    return this.multiplo() ? this.valores().includes(v) : this.valor() === v;
  }

  abrir(): void {
    this.busca.set('');
    this.aberto.set(true);
  }

  fechar(): void {
    this.aberto.set(false);
  }

  escolher(o: OpcaoSeletor): void {
    if (o.desabilitado) return;
    if (this.multiplo()) {
      const atual = this.valores();
      this.valores.set(atual.includes(o.valor) ? atual.filter(v => v !== o.valor) : [...atual, o.valor]);
    } else {
      this.valor.set(o.valor);
      this.fechar();
    }
    this.escolhido.emit(o);
  }
}

function normalizar(v: string): string {
  return (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
