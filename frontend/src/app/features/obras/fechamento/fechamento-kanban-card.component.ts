import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CesButtonComponent } from '@ces/ui';

import { FechamentoResumo } from '../../../core/models/fechamento-obra.models';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { SITUACOES, dataHora, iconeTipo, nomePessoa, quantidade, rotuloObra, textoPrazo, tipoFechamento } from './fechamento-ui';

export type AcaoFechamento = 'RESERVA' | 'MOVIMENTAR';

/** Cartão do quadro de fechamento. Arrastar é atalho: a mesma ação existe no botão e no detalhe. */
@Component({
  selector: 'app-fechamento-kanban-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesButtonComponent],
  styleUrl: '../../almoxarifado/solicitacoes-material/solicitacoes-comerciais-kanban/solicitacao-comercial-kanban-card.component.css',
  template: `
    <article
      class="kc"
      tabindex="0"
      role="button"
      [attr.aria-label]="ariaLabel()"
      [attr.draggable]="arrastavel() ? 'true' : null"
      [class.kc--arrastando]="arrastando()"
      (dragstart)="aoIniciarArraste($event)"
      (dragend)="dragEnded.emit()"
      (click)="cardClicked.emit(item())"
      (keydown.enter)="abrirPorTeclado($event)"
      (keydown.space)="abrirPorTeclado($event)"
    >
      <div class="kc__head">
        <span class="kc__titulo" [title]="titulo()">{{ titulo() }}</span>
        <span class="kc__id">#{{ idCurto() }}</span>
        <span class="kc__origem" [title]="subtitulo()">{{ subtitulo() }}</span>
      </div>

      <div class="kc__tags">
        <span class="kc__tag" [class.kc__tag--info]="tipo().adicao">
          <i [class]="iconeTipo(item().tipo)" aria-hidden="true"></i>{{ item().tipo }}
        </span>
        @if (item().situacao === 'MOVIMENTADA') {
          <span class="kc__tag kc__tag--ok"><i class="pi pi-check" aria-hidden="true"></i>{{ concluida() }}</span>
        } @else if (item().prazoVigente.limite) {
          <span class="kc__tag" [class.kc__tag--perigo]="atrasada()" [class.kc__tag--aviso]="item().prazoVigente.situacao === 'VENCE_EM_BREVE'">
            <i [class]="atrasada() ? 'pi pi-exclamation-triangle' : 'pi pi-clock'" aria-hidden="true"></i>{{ prazo() }}
          </span>
        }
        @if (item().numeroReserva; as reserva) {
          <span class="kc__tag"><i class="pi pi-hashtag" aria-hidden="true"></i>{{ reserva }}</span>
        }
        @if (item().possuiPendencia) {
          <span class="kc__tag kc__tag--aviso"><i class="pi pi-flag" aria-hidden="true"></i>Pendência</span>
        }
        @if (item().situacao === 'MOVIMENTADA_PARCIALMENTE') {
          <span class="kc__tag kc__tag--info"><i class="pi pi-percentage" aria-hidden="true"></i>{{ quantidade(item().quantidadeMovimentada) }} de {{ quantidade(item().quantidadeSolicitada) }}</span>
        }
        <span class="kc__tag"><i class="pi pi-box" aria-hidden="true"></i>{{ item().totalItens }} {{ item().totalItens === 1 ? 'material' : 'materiais' }}</span>
      </div>

      <div class="kc__foot">
        <span class="kc__pessoa" [title]="'Solicitante: ' + solicitante()">
          <span class="kc__avatar" aria-hidden="true">
            @if (iniciais(); as i) { {{ i }} } @else { <i class="pi pi-user"></i> }
          </span>
          <span>{{ solicitante() }}</span>
        </span>
        @if (item().acoes.registrarReserva) {
          <ces-button label="Reserva" icon="pi pi-hashtag" size="sm" variant="outline" [ariaLabel]="'Registrar reserva da solicitação #' + idCurto()"
            (pressed)="actionTriggered.emit({ item: item(), action: 'RESERVA' })" (click)="$event.stopPropagation()" />
        } @else if (item().acoes.movimentar) {
          <ces-button label="Movimentar" icon="pi pi-check-square" size="sm" variant="outline" [ariaLabel]="'Marcar como movimentado a solicitação #' + idCurto()"
            (pressed)="actionTriggered.emit({ item: item(), action: 'MOVIMENTAR' })" (click)="$event.stopPropagation()" />
        }
      </div>
    </article>
  `
})
export class FechamentoKanbanCardComponent {
  readonly item = input.required<FechamentoResumo>();
  /** Este cartão é o que está sendo arrastado (fica esmaecido no lugar de origem). */
  readonly arrastando = input(false);
  /** Em telas de toque o cartão não é arrastável (a rolagem do quadro tem prioridade). */
  readonly arrastavel = input(true);

  readonly cardClicked = output<FechamentoResumo>();
  readonly dragStarted = output<FechamentoResumo>();
  readonly dragEnded = output<void>();
  readonly actionTriggered = output<{ item: FechamentoResumo; action: AcaoFechamento }>();

  protected readonly quantidade = quantidade;
  protected readonly iconeTipo = iconeTipo;
  protected readonly tipo = computed(() => tipoFechamento(this.item().tipo));
  protected readonly titulo = computed(() => rotuloObra(this.item().obra));
  protected readonly subtitulo = computed(() => formatarAlmoxarifado(this.item().almoxarifadoAtendimento?.nome));
  protected readonly idCurto = computed(() => this.item().id.slice(0, 8));
  protected readonly atrasada = computed(() => this.item().prazoVigente.situacao === 'ATRASADO');
  protected readonly prazo = computed(() => textoPrazo(this.item().situacao, this.item().prazoVigente));
  protected readonly concluida = computed(() => `Movimentada ${dataHora(this.item().movimentacaoConcluidaEm).split(' ')[0]}`);
  protected readonly solicitante = computed(() => nomePessoa(this.item().solicitante, 'Solicitante não informado'));
  protected readonly iniciais = computed(() => {
    const nome = this.item().solicitante?.nome?.trim();
    if (!nome) return '';
    const partes = nome.split(/\s+/);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : (partes[0]?.[1] ?? ''))).toUpperCase();
  });

  protected readonly ariaLabel = computed(() => {
    const it = this.item();
    const partes = [`Solicitação ${this.idCurto()}: ${this.titulo()}`, `tipo ${it.tipo}`, SITUACOES[it.situacao].label, `${it.totalItens} ${it.totalItens === 1 ? 'material' : 'materiais'}`];
    if (this.atrasada()) partes.push('prazo atrasado');
    if (it.possuiPendencia) partes.push('com pendência');
    return `${partes.join(', ')}. Enter abre o detalhe.`;
  });

  protected aoIniciarArraste(evento: DragEvent): void {
    evento.dataTransfer?.setData('text/plain', this.item().id);
    if (evento.dataTransfer) evento.dataTransfer.effectAllowed = 'move';
    this.dragStarted.emit(this.item());
  }

  protected abrirPorTeclado(evento: Event): void {
    if (evento.target !== evento.currentTarget) return;
    evento.preventDefault();
    this.cardClicked.emit(this.item());
  }
}
