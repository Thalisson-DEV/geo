import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FechamentoResumo } from '../../core/fechamento/fechamento.models';
import { PRAZOS, SITUACOES, iconeTipo, nomePessoa, rotuloObra, textoPrazo, tipoFechamento } from '../../core/fechamento/fechamento-ui';
import { IconeComponent, numeroBr } from '../../ui';

export type AcaoFechamento = 'movimentar' | 'reserva';

/**
 * Uma solicitação de encerramento na lista: o tipo com o ícone, a obra, a situação, o prazo em
 * curso e a próxima ação que o backend liberou para a pessoa.
 */
@Component({
  selector: 'app-cartao-fechamento',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="cartao">
      <button type="button" class="corpo" (click)="abrir.emit(item())" [attr.aria-label]="rotuloAcessivel()">
        <span class="tipo" [class.tipo--dev]="!tipo().adicao" aria-hidden="true">
          <ces-icone [nome]="icone()" [tamanho]="18" /><span class="ces-num">{{ item().tipo }}</span>
        </span>
        <span class="txt">
          <span class="obra">{{ obra() }}</span>
          <span class="linha-status">
            <span class="status" [attr.data-tom]="situacao().tom"><i aria-hidden="true"></i>{{ situacao().rotulo }}</span>
            <span class="sep" aria-hidden="true">·</span>
            <span class="ces-num">{{ item().totalItens }} {{ item().totalItens === 1 ? 'item' : 'itens' }}</span>
          </span>
          @if (prazo()) { <span class="prazo ces-num"><ces-icone nome="relogio" [tamanho]="14" />{{ prazo() }}</span> }
          <span class="quem"><ces-icone nome="pessoas" [tamanho]="14" /><span>{{ solicitante() }}</span></span>
          @if (sinais().length) {
            <span class="sinais">
              @for (s of sinais(); track s.texto) { <span class="ces-etiqueta" [class]="'ces-etiqueta--' + s.tom"><ces-icone [nome]="s.icone" [tamanho]="13" />{{ s.texto }}</span> }
            </span>
          }
        </span>
      </button>
      @if (acoes() && acao(); as a) {
        <div class="acoes">
          <button type="button" class="ces-btn ces-btn--compacto ces-btn--principal acao" (click)="agir.emit({ acao: a.acao, item: item() })">
            <ces-icone [nome]="a.icone" [tamanho]="18" />{{ a.rotulo }}
          </button>
        </div>
      }
    </article>
  `,
  styles: [`
    :host { display: block; }
    .cartao { background: var(--ces-superficie); border-radius: var(--ces-r-grupo); overflow: hidden; box-shadow: 0 1px 2px rgba(14, 23, 38, .05); }
    .corpo { display: flex; align-items: flex-start; gap: var(--ces-e3); width: 100%; min-height: 56px; padding: var(--ces-e3); border: 0; background: transparent; color: inherit;
      text-align: left; font: inherit; cursor: pointer; transition: background-color 100ms; }
    .corpo:active { background: var(--ces-superficie-2); }
    .tipo { flex: none; width: 48px; height: 52px; border-radius: 12px; display: grid; place-content: center; justify-items: center; gap: 2px;
      background: var(--ces-destaque-suave); color: var(--ces-destaque); font: 700 .75rem/1 var(--ces-fonte-mono); }
    .tipo--dev { background: var(--ces-superficie-2); color: var(--ces-texto); }
    .txt { flex: 1; min-width: 0; display: grid; gap: 3px; }
    .obra { font: 700 1rem/1.25 var(--ces-fonte); letter-spacing: -.01em; overflow-wrap: anywhere; }
    .linha-status { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 6px; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--ces-texto); }
    .status i { width: 8px; height: 8px; border-radius: 50%; background: var(--ces-texto-3); }
    .status[data-tom='atencao'] i { background: var(--ces-atencao); }
    .status[data-tom='destaque'] i { background: var(--ces-destaque); }
    .status[data-tom='ok'] i { background: var(--ces-ok); }
    .sep { color: var(--ces-texto-3); }
    .prazo, .quem { display: flex; align-items: center; gap: 4px; min-width: 0; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .quem span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sinais { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .acoes { display: flex; justify-content: flex-end; padding: 6px var(--ces-e3); border-top: 1px solid var(--ces-linha); }
    .acoes .acao { min-height: 38px; padding: 0 var(--ces-e4); border-radius: var(--ces-r-pilula); }
  `],
})
export class CartaoFechamentoComponent {
  readonly item = input.required<FechamentoResumo>();
  /** Online e com permissão para agir daqui. */
  readonly acoes = input(false);
  readonly abrir = output<FechamentoResumo>();
  readonly agir = output<{ acao: AcaoFechamento; item: FechamentoResumo }>();

  readonly tipo = computed(() => tipoFechamento(this.item().tipo));
  readonly icone = computed(() => iconeTipo(this.item().tipo));
  readonly obra = computed(() => rotuloObra(this.item().obra));
  readonly situacao = computed(() => SITUACOES[this.item().situacao]);
  readonly prazo = computed(() => textoPrazo(this.item().situacao, this.item().prazoVigente));
  readonly solicitante = computed(() => nomePessoa(this.item().solicitante));

  readonly acao = computed(() => {
    const a = this.item().acoes;
    if (a?.movimentar) return { acao: 'movimentar' as const, rotulo: 'Movimentar', icone: 'transferencia' as const };
    if (a?.registrarReserva) return { acao: 'reserva' as const, rotulo: 'Registrar reserva', icone: 'documento' as const };
    return null;
  });

  readonly sinais = computed(() => {
    const s = this.item();
    const lista: { texto: string; tom: string; icone: 'alerta' | 'relogio' | 'bandeira' }[] = [];
    const prazo = s.prazoVigente?.situacao;
    if (prazo === 'ATRASADO' || prazo === 'VENCE_EM_BREVE') lista.push({ texto: PRAZOS[prazo].rotulo, tom: PRAZOS[prazo].tom, icone: prazo === 'ATRASADO' ? 'alerta' : 'relogio' });
    if (s.possuiPendencia) lista.push({ texto: 'Com pendência', tom: 'atencao', icone: 'bandeira' });
    return lista;
  });

  readonly rotuloAcessivel = computed(() => `${this.item().tipo} ${this.tipo().nome}, obra ${this.obra()}, ${this.situacao().rotulo}`
    + `${this.prazo() ? ', ' + this.prazo() : ''}, ${numeroBr(this.item().totalItens)} ${this.item().totalItens === 1 ? 'item' : 'itens'}. Abrir detalhe.`);
}
