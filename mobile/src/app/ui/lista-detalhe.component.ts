import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LayoutService } from '../core/plataforma/layout.service';
import { NomeIcone } from './icone.component';
import { VazioComponent } from './controles.component';

/**
 * Lista + detalhe (Material 3, "list-detail"). No tablet deitado a lista fica à esquerda e o
 * detalhe (rota filha, ex.: /campo/:id) à direita, cada um com a sua rolagem; o encarregado troca
 * de item sem perder a lista. No celular e no tablet em pé continua uma tela de cada vez.
 *
 * A lista entra por projeção de conteúdo; o detalhe, pelo `router-outlet` desta tela. Cada painel
 * é o "bloco de contenção" dos seus elementos fixos (botão flutuante, rodapé de ação), que assim
 * ficam dentro do próprio painel.
 */
@Component({
  selector: 'geo-lista-detalhe',
  standalone: true,
  imports: [RouterOutlet, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-lista-detalhe',
    '[class.dividido]': 'layout.expandido()',
    '[class.com-detalhe]': 'temDetalhe()',
  },
  template: `
    <section class="painel lista" [attr.aria-hidden]="!layout.expandido() && temDetalhe() ? true : null"><ng-content /></section>
    <section class="painel detalhe">
      @if (layout.expandido() && !temDetalhe()) {
        <geo-vazio [icone]="iconeVazio()" [titulo]="tituloVazio()" [texto]="textoVazio()" />
      }
      <router-outlet (activate)="temDetalhe.set(true)" (deactivate)="temDetalhe.set(false)" />
    </section>
  `,
  styles: [`
    :host { display: block; }
    /* Uma tela de cada vez: com detalhe aberto, a lista sai; sem detalhe, o painel vazio some. */
    :host(:not(.dividido).com-detalhe) .lista { display: none; }
    :host(:not(.dividido):not(.com-detalhe)) .detalhe { display: none; }

    :host(.dividido) { display: grid; grid-template-columns: minmax(360px, 2fr) 3fr; height: 100%; min-height: 0;
      /* Dentro dos painéis os fixos se alinham ao próprio painel, não à tela. */
      --geo-nav-lateral: 0px; --geo-recuo-coluna: 0px; }
    :host(.dividido) .painel { min-width: 0; height: 100%; overflow-y: auto; overscroll-behavior: contain;
      display: flex; flex-direction: column; transform: translateZ(0); }
    :host(.dividido) .detalhe { border-left: 1px solid var(--geo-linha); background: var(--geo-fundo); }
    :host(.dividido) .detalhe > geo-vazio { margin: auto; }
  `],
})
export class ListaDetalheComponent {
  readonly layout = inject(LayoutService);
  readonly tituloVazio = input('Nada selecionado');
  readonly textoVazio = input<string | null>('Toque num item da lista para ver os detalhes aqui.');
  readonly iconeVazio = input<NomeIcone>('lista');
  readonly temDetalhe = signal(false);
}
