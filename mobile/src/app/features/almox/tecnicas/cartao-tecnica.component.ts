import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ResumoSolicitacao } from '../../../core/almox/almox.models';
import { dataCivil, idCurto, isoCivil, prazoRelativo } from '../../../core/almox/almox-status';
import { defTipoTecnico, etapaTecnica, podeTecnica, tituloTecnica } from '../../../core/almox/almox-tecnico';
import { IconeComponent } from '../../../ui';

export type AcaoTecnica = 'iniciar' | 'concluir' | 'entregar' | 'receber';

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/**
 * Uma solicitação técnica na fila do almoxarifado. A OC/OS vem primeiro e com o mesmo peso
 * do título (é por ela que o almoxarifado se orienta); logo abaixo, a obra, o tipo do
 * movimento e a equipe. Embaixo, a próxima ação que o backend liberou.
 */
@Component({
  selector: 'app-cartao-tecnica',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="cartao">
      <button type="button" class="corpo" (click)="abrir.emit(item())" [attr.aria-label]="rotuloAcessivel()">
        <span class="data" [attr.data-prazo]="prazo()" aria-hidden="true">
          @if (dataPrevista()) {
            <span class="dia geo-num">{{ dia() }}</span><span class="mes">{{ mes() }}</span>
          } @else {
            <geo-icone nome="calendario" [tamanho]="18" /><span class="mes">sem data</span>
          }
        </span>
        <span class="txt">
          <span class="topo">
            @if (titulo().ocorrencia; as oc) { <span class="oc geo-num">{{ oc }}</span> }
            @else { <span class="oc oc--obra">{{ titulo().obra }}</span> }
            <span class="id geo-num">#{{ id() }}</span>
          </span>
          @if (titulo().ocorrencia) { <span class="obra">{{ titulo().obra }}</span> }
          <span class="linha-status">
            <span class="tipo geo-num" [class.tipo--dev]="!tipo().adicao">{{ tipo().codigo }}</span>
            <span class="status" [attr.data-tom]="etapa().tom"><i aria-hidden="true"></i>{{ etapa().rotulo }}</span>
            <span class="sep" aria-hidden="true">·</span>
            <span class="geo-num">{{ item().totalItens }} {{ item().totalItens === 1 ? 'item' : 'itens' }}</span>
          </span>
          @if (equipe()) { <span class="equipe"><geo-icone nome="pessoas" [tamanho]="14" />{{ equipe() }}</span> }
          @if (sinais().length) {
            <span class="sinais">
              @for (s of sinais(); track s.texto) { <span class="sinal" [attr.data-tom]="s.tom"><geo-icone [nome]="s.icone" [tamanho]="13" />{{ s.texto }}</span> }
            </span>
          }
        </span>
      </button>
      @if (acoes() && acao(); as a) {
        <div class="acoes">
          <button type="button" class="geo-btn geo-btn--compacto acao" [class.geo-btn--principal]="a.principal" [class.geo-btn--tonal]="!a.principal"
            [disabled]="!!ocupado()" (click)="agir.emit({ acao: a.acao, item: item() })">
            @if (ocupado() === a.acao) { <span class="giro" aria-hidden="true"></span>{{ a.andamento }} } @else { <geo-icone [nome]="a.icone" [tamanho]="18" />{{ a.rotulo }} }
          </button>
        </div>
      }
    </article>
  `,
  styles: [`
    :host { display: block; }
    .cartao { background: var(--geo-superficie); border-radius: var(--geo-r-grupo); overflow: hidden; box-shadow: 0 1px 2px rgba(14, 23, 38, .05); }
    .corpo { display: flex; align-items: flex-start; gap: var(--geo-e3); width: 100%; padding: var(--geo-e3); border: 0; background: transparent; color: inherit;
      text-align: left; font: inherit; cursor: pointer; transition: background-color 100ms; }
    .corpo:active { background: var(--geo-superficie-2); }
    .data { flex: none; width: 44px; height: 48px; border-radius: 12px; display: grid; place-content: center; justify-items: center; gap: 1px;
      background: var(--geo-superficie-2); color: var(--geo-texto); }
    .data .dia { font: 600 1.125rem/1 var(--geo-fonte); letter-spacing: -.02em; }
    .data .mes { font: 600 .625rem/1 var(--geo-fonte); letter-spacing: .06em; color: var(--geo-texto-2); text-transform: uppercase; }
    .data[data-prazo='atrasado'] { background: var(--geo-erro-suave); color: var(--geo-erro); }
    .data[data-prazo='atrasado'] .mes { color: var(--geo-erro); }
    .data[data-prazo='hoje'] { background: var(--geo-atencao-suave); color: var(--geo-atencao); }
    .data[data-prazo='hoje'] .mes { color: var(--geo-atencao); }
    .data[data-prazo='sem'] { background: transparent; box-shadow: inset 0 0 0 1.5px var(--geo-linha); color: var(--geo-texto-3); }
    .data[data-prazo='sem'] .mes { font-size: .5625rem; letter-spacing: .02em; color: var(--geo-texto-3); }
    .txt { flex: 1; min-width: 0; display: grid; gap: 2px; padding-top: 1px; }
    .topo { display: flex; align-items: baseline; gap: var(--geo-e2); }
    .oc { flex: 1; min-width: 0; font: 600 1rem/1.25 var(--geo-fonte); letter-spacing: -.01em; overflow-wrap: anywhere; }
    .oc--obra { font-size: .9375rem; font-weight: 600; }
    .obra { font: 600 .875rem/1.3 var(--geo-fonte); color: var(--geo-texto); overflow-wrap: anywhere; }
    .id { flex: none; font: 500 .6875rem/1 var(--geo-fonte-mono); color: var(--geo-texto-3); }
    .linha-status { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 6px; margin-top: 4px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .tipo { padding: 2px 6px; border-radius: 6px; background: var(--geo-destaque-suave); color: var(--geo-destaque); font: 600 .6875rem/1.3 var(--geo-fonte-mono); }
    .tipo--dev { background: var(--geo-superficie-2); color: var(--geo-texto); }
    .status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--geo-texto); }
    .status i { width: 8px; height: 8px; border-radius: 50%; background: var(--geo-texto-3); }
    .status[data-tom='atencao'] i { background: var(--geo-atencao); }
    .status[data-tom='destaque'] i { background: var(--geo-destaque); }
    .status[data-tom='ok'] i { background: var(--geo-ok); }
    .status[data-tom='erro'] i { background: var(--geo-erro); }
    .sep { color: var(--geo-texto-3); }
    .equipe { display: inline-flex; align-items: center; gap: 4px; font: var(--geo-t-apoio); color: var(--geo-texto-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sinais { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .sinal { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: var(--geo-r-pilula); font: 600 .75rem/1.3 var(--geo-fonte);
      background: var(--geo-superficie-2); color: var(--geo-texto-2); }
    .sinal[data-tom='erro'] { background: var(--geo-erro-suave); color: var(--geo-erro); }
    .sinal[data-tom='atencao'] { background: var(--geo-atencao-suave); color: var(--geo-atencao); }
    .acoes { display: flex; justify-content: flex-end; align-items: center; gap: var(--geo-e2); padding: 6px var(--geo-e3); border-top: 1px solid var(--geo-linha); }
    .acoes .acao { min-height: 38px; padding: 0 var(--geo-e4); border-radius: var(--geo-r-pilula); }
    .giro { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: giro .8s linear infinite; }
    @keyframes giro { to { transform: rotate(360deg); } }
  `],
})
export class CartaoTecnicaComponent {
  readonly item = input.required<ResumoSolicitacao>();
  /** Nome da equipe (resolvido pela lista de estoques de quem usa o cartão). */
  readonly equipe = input<string | null>(null);
  readonly acoes = input(false);
  readonly ocupado = input<AcaoTecnica | null>(null);
  readonly abrir = output<ResumoSolicitacao>();
  readonly agir = output<{ acao: AcaoTecnica; item: ResumoSolicitacao }>();

  readonly id = computed(() => idCurto(this.item().id));
  readonly titulo = computed(() => tituloTecnica(this.item()));
  readonly tipo = computed(() => defTipoTecnico(this.item().tecnico?.tipoTecnico ?? this.item().tipoTecnico));
  readonly etapa = computed(() => etapaTecnica(this.item()));
  readonly dataPrevista = computed(() => this.item().tecnico?.dataPrevista ?? this.item().dataPrevista ?? null);
  readonly dia = computed(() => (this.dataPrevista() ? dataCivil(this.dataPrevista()!).getDate() : ''));
  readonly mes = computed(() => (this.dataPrevista() ? MESES[dataCivil(this.dataPrevista()!).getMonth()] : ''));
  readonly atrasada = computed(() => !!this.item().tecnico?.atrasada);
  readonly prazo = computed(() => {
    const d = this.dataPrevista();
    if (!d) return 'sem';
    if (this.atrasada()) return 'atrasado';
    return d.substring(0, 10) === isoCivil(new Date()) ? 'hoje' : 'futuro';
  });

  /** A próxima ação do almoxarifado, na ordem do fluxo. */
  readonly acao = computed(() => {
    const s = this.item();
    if (podeTecnica(s, 'INICIAR_SEPARACAO')) return { acao: 'iniciar' as const, rotulo: 'Iniciar separação', andamento: 'Iniciando…', icone: 'material' as const, principal: true };
    if (podeTecnica(s, 'CONCLUIR_SEPARACAO')) return { acao: 'concluir' as const, rotulo: 'Concluir separação', andamento: 'Concluindo…', icone: 'check' as const, principal: true };
    if (podeTecnica(s, 'ENTREGAR')) return { acao: 'entregar' as const, rotulo: 'Registrar entrega', andamento: '', icone: 'caminhao' as const, principal: false };
    if (podeTecnica(s, 'CONFIRMAR_DEVOLUCAO')) return { acao: 'receber' as const, rotulo: 'Receber devolução', andamento: '', icone: 'desfazer' as const, principal: false };
    return null;
  });

  readonly sinais = computed(() => {
    const s = this.item();
    const lista: { texto: string; tom: string; icone: 'alerta' | 'relogio' | 'bandeira' | 'info' }[] = [];
    const d = this.dataPrevista();
    if (this.atrasada() && d) lista.push({ texto: `Atrasada ${prazoRelativo(d)}`, tom: 'erro', icone: 'alerta' });
    else if (this.prazo() === 'hoje' && this.acao()) lista.push({ texto: 'Saque hoje', tom: 'atencao', icone: 'relogio' });
    if (s.possuiPendencia) {
      const m = s.motivosPendencia ?? [];
      lista.push({ texto: m.length === 1 ? m[0] : m.length > 1 ? `${m.length} pendências` : 'Com pendência', tom: 'atencao', icone: 'bandeira' });
    }
    if (!s.tecnico?.reserva?.numero && this.tipo().adicao && this.acao()?.acao === 'entregar') lista.push({ texto: 'Sem reserva', tom: 'atencao', icone: 'info' });
    return lista.slice(0, 2);
  });

  readonly rotuloAcessivel = computed(() => {
    const t = this.titulo();
    return `${t.ocorrencia ? t.ocorrencia + ', ' : ''}obra ${t.obra}, ${this.tipo().rotulo}, ${this.etapa().rotulo}`
      + (this.dataPrevista() ? `, saque ${prazoRelativo(this.dataPrevista()!)}` : '') + '. Abrir detalhe.';
  });
}
