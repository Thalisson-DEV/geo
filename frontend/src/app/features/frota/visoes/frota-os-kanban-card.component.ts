import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GeoButtonComponent, GeoIconButtonComponent } from '@geo/ui';

import { OrdemServico, ROTULO_CRITICIDADE, identificacaoOs, rotuloOs } from '../../../core/models/frota.models';

/** Ação do cartão: abre o formulário da etapa ou o detalhe. */
export type AcaoCardOs = 'AGENDAR' | 'INICIAR' | 'CONCLUIR' | 'LANCAR_VALORES' | 'REABRIR' | 'CANCELAR' | 'DETALHAR' | 'RELATORIO';

/**
 * Cartão do quadro de OS, no desenho do cartão do quadro comercial. Arrastar é atalho: toda
 * ação também existe por botão e teclado (Enter ou Espaço abre a OS).
 */
@Component({
  selector: 'app-frota-os-kanban-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent, GeoIconButtonComponent],
  styles: `
    :host { display: block; }
    .kc {
      display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; overflow: hidden; gap: 0.625rem; padding: 0.75rem;
      border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface); color: var(--geo-foreground);
      cursor: pointer; outline: none;
      transition: border-color var(--geo-duration-fast) var(--geo-ease-standard), box-shadow var(--geo-duration-fast) var(--geo-ease-standard),
        transform var(--geo-duration-fast) var(--geo-ease-standard), opacity var(--geo-duration-fast) var(--geo-ease-standard);
    }
    .kc:hover { border-color: var(--geo-border-strong); box-shadow: var(--geo-shadow-md); transform: translateY(-1px); }
    .kc--arrastando { opacity: 0.4; transform: scale(0.98); box-shadow: none; }
    [draggable='true'].kc { cursor: grab; }
    [draggable='true'].kc:active { cursor: grabbing; }
    .kc:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    /* Faixa da criticidade (vermelho, laranja, amarelo, verde), para separar de relance numa lista longa. */
    .kc[data-crit] { box-shadow: inset 4px 0 0 var(--kc-crit); }
    .kc[data-crit]:hover { box-shadow: inset 4px 0 0 var(--kc-crit), var(--geo-shadow-md); }
    [data-crit='URGENTE'] { --kc-crit: var(--geo-danger); --kc-crit-soft: var(--geo-danger-soft); --kc-crit-ink: var(--geo-danger-text); }
    [data-crit='ALTA'] { --kc-crit: #ea580c; --kc-crit-soft: color-mix(in srgb, #ea580c 14%, var(--geo-surface)); --kc-crit-ink: color-mix(in srgb, #ea580c 70%, var(--geo-foreground)); }
    [data-crit='MEDIA'] { --kc-crit: #eab308; --kc-crit-soft: color-mix(in srgb, #eab308 18%, var(--geo-surface)); --kc-crit-ink: color-mix(in srgb, #a16207 75%, var(--geo-foreground)); }
    [data-crit='BAIXA'] { --kc-crit: var(--geo-success); --kc-crit-soft: var(--geo-success-soft); --kc-crit-ink: var(--geo-success-text); }
    .kc__tag.kc__tag--crit { background: var(--kc-crit-soft); color: var(--kc-crit-ink); }
    .kc__head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.125rem 0.5rem; align-items: baseline; }
    .kc__titulo { overflow: hidden; font-size: var(--geo-font-control); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .kc__id { font-size: var(--geo-font-caption); color: var(--geo-foreground-subtle); font-variant-numeric: tabular-nums; }
    .kc__descricao {
      grid-column: 1 / -1; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
      font-size: var(--geo-font-caption); line-height: 1.4; color: var(--geo-foreground-muted); word-break: break-word;
    }
    .kc__tags { display: flex; flex-wrap: wrap; gap: 0.25rem; min-width: 0; }
    .kc__tag {
      display: inline-flex; max-width: 100%; overflow: hidden; text-overflow: ellipsis; align-items: center; gap: 0.3rem; height: 1.375rem;
      padding: 0 0.5rem; border-radius: var(--geo-radius-sm); background: var(--geo-surface-muted); color: var(--geo-foreground-muted);
      font-size: 0.72rem; font-weight: 600; white-space: nowrap;
    }
    .kc__tag .pi { font-size: 0.65rem; }
    .kc__tag--perigo { background: var(--geo-danger-soft); color: var(--geo-danger-text); }
    .kc__tag--aviso { background: var(--geo-warning-soft); color: var(--geo-warning-text); }
    .kc__tag--ok { background: var(--geo-success-soft); color: var(--geo-success-text); }
    .kc__tag--info { background: var(--geo-info-soft); color: var(--geo-info-text); }
    .kc__foot { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.75rem; }
    .kc__foot geo-button, .kc__foot geo-icon-button { flex: none; }
    .kc__acoes { display: inline-flex; flex: none; align-items: center; gap: 0.125rem; }
    .kc__oficina { display: inline-flex; flex: 1 1 auto; align-items: center; gap: 0.4rem; min-width: 0; overflow: hidden;
      font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .kc__oficina span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kc__icone { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem;
      border-radius: 999px; background: var(--geo-brand-soft); color: var(--geo-brand); font-size: 0.7rem; }
    @media (prefers-reduced-motion: reduce) { .kc { transition: none; } .kc:hover { transform: none; } }
  `,
  template: `
    <article
      class="kc"
      tabindex="0"
      role="button"
      [attr.data-crit]="item().situacao !== 'CONCLUIDA' ? item().criticidade : null"
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
        <span class="kc__titulo" [title]="identificacao()">{{ identificacao() }}</span>
        <span class="kc__id">{{ rotuloOs(item().numero) }}</span>
        <span class="kc__descricao" [title]="item().descricao">{{ item().descricao }}</span>
      </div>

      <div class="kc__tags">
        @if (item().situacao !== 'CONCLUIDA') {
          <span class="kc__tag kc__tag--crit" [attr.data-crit]="item().criticidade">
            <i class="pi pi-flag" aria-hidden="true"></i>{{ rotuloCriticidade[item().criticidade] }}
          </span>
        }
        @switch (item().situacao) {
          @case ('AGENDADA') {
            <span class="kc__tag" [class.kc__tag--perigo]="agendadaPassou()" [class.kc__tag--info]="!agendadaPassou()">
              <i class="pi pi-calendar" aria-hidden="true"></i>{{ item().agendadaPara | date: 'dd/MM HH:mm' }}{{ agendadaPassou() ? ' · não iniciada' : '' }}
            </span>
          }
          @case ('EM_ANDAMENTO') {
            @if (item().atrasada) {
              <span class="kc__tag kc__tag--perigo"><i class="pi pi-clock" aria-hidden="true"></i>Prazo {{ item().previsaoTermino | date: 'dd/MM HH:mm' }}</span>
            } @else if (item().previsaoTermino) {
              <span class="kc__tag"><i class="pi pi-clock" aria-hidden="true"></i>Previsão {{ item().previsaoTermino | date: 'dd/MM HH:mm' }}</span>
            } @else {
              <span class="kc__tag"><i class="pi pi-play" aria-hidden="true"></i>Desde {{ item().inicioReal | date: 'dd/MM HH:mm' }}</span>
            }
          }
          @case ('CONCLUIDA') {
            <span class="kc__tag kc__tag--ok"><i class="pi pi-check" aria-hidden="true"></i>Concluída {{ item().fimReal | date: 'dd/MM HH:mm' }}</span>
            @if (item().baixaPendente) {
              <span class="kc__tag kc__tag--aviso"><i class="pi pi-hourglass" aria-hidden="true"></i>Valores pendentes</span>
            }
          }
        }
        @if (item().paradaEmCurso) {
          <span class="kc__tag kc__tag--perigo"><i class="pi pi-stop-circle" aria-hidden="true"></i>Veículo parado</span>
        }
        @if (item().situacaoAprovacao === 'AGUARDANDO_APROVACAO' || item().situacaoAprovacao === 'EM_ORCAMENTO') {
          <span class="kc__tag kc__tag--aviso"><i class="pi pi-wallet" aria-hidden="true"></i>{{ item().situacaoAprovacao === 'EM_ORCAMENTO' ? 'Em orçamento' : 'Aguardando aprovação' }}</span>
        }
        @if (item().temRepeticao) {
          <span class="kc__tag kc__tag--aviso"><i class="pi pi-replay" aria-hidden="true"></i>Repetição</span>
        }
        @if (item().tipoManutencao === 'PREVENTIVA') {
          <span class="kc__tag kc__tag--info"><i class="pi pi-shield" aria-hidden="true"></i>Preventiva</span>
        }
      </div>

      <div class="kc__foot">
        <span class="kc__oficina" [title]="item().oficina + (item().base ? ' · ' + item().base : '')">
          <span class="kc__icone" aria-hidden="true"><i class="pi pi-wrench"></i></span>
          <span>{{ item().oficina }}{{ item().base ? ' · ' + item().base : '' }}</span>
        </span>
        <span class="kc__acoes">
          @if (podeCancelar() && item().situacao !== 'CONCLUIDA' && item().situacao !== 'CANCELADA') {
            <geo-icon-button icon="pi pi-ban" [label]="'Cancelar ' + rotuloOs(item().numero)" tooltip="Cancelar OS" size="icon-sm"
              (pressed)="actionTriggered.emit({ item: item(), action: 'CANCELAR' })" (click)="$event.stopPropagation()" />
          }
          @if (podeReabrir() && item().situacao === 'CONCLUIDA') {
            <geo-icon-button icon="pi pi-replay" [label]="'Voltar ' + rotuloOs(item().numero) + ' para em andamento'" tooltip="Voltar para em andamento" size="icon-sm"
              (pressed)="actionTriggered.emit({ item: item(), action: 'REABRIR' })" (click)="$event.stopPropagation()" />
          }
          @if (acao(); as a) {
            <geo-button [label]="a.rotulo" [icon]="a.icone" size="sm" variant="outline" [ariaLabel]="a.rotulo + ' a ' + rotuloOs(item().numero)"
              (pressed)="actionTriggered.emit({ item: item(), action: a.acao })" (click)="$event.stopPropagation()" />
          }
        </span>
      </div>
    </article>
  `
})
export class FrotaOsKanbanCardComponent {
  readonly item = input.required<OrdemServico>();
  readonly arrastando = input(false);
  readonly arrastavel = input(true);
  /** Mostra o botão da próxima etapa (quem tem permissão de executar). */
  readonly podeAgir = input(false);
  /** Mostra o cancelamento (quem edita a OS). Cancelar nunca é por arraste. */
  readonly podeCancelar = input(false);
  /** Mostra "voltar para em andamento" na OS concluída (quem executa). */
  readonly podeReabrir = input(false);

  readonly cardClicked = output<OrdemServico>();
  readonly dragStarted = output<OrdemServico>();
  readonly dragEnded = output<void>();
  readonly actionTriggered = output<{ item: OrdemServico; action: AcaoCardOs }>();

  protected readonly rotuloOs = rotuloOs;
  protected readonly rotuloCriticidade = ROTULO_CRITICIDADE;
  protected readonly identificacao = computed(() => identificacaoOs(this.item()));
  protected readonly agendadaPassou = computed(() => {
    const a = this.item().agendadaPara;
    return !!a && new Date(a).getTime() < Date.now();
  });

  /** A próxima etapa, no mesmo texto da ficha da OS. */
  protected readonly acao = computed<{ acao: AcaoCardOs; rotulo: string; icone: string } | null>(() => {
    if (!this.podeAgir()) return null;
    switch (this.item().situacao) {
      case 'PENDENTE':
        return { acao: 'AGENDAR', rotulo: 'Agendar', icone: 'pi pi-calendar' };
      case 'AGENDADA':
        return { acao: 'INICIAR', rotulo: 'Iniciar', icone: 'pi pi-play' };
      case 'EM_ANDAMENTO':
        return { acao: 'CONCLUIR', rotulo: 'Concluir', icone: 'pi pi-check' };
      case 'CONCLUIDA':
        return this.item().baixaPendente
          ? { acao: 'LANCAR_VALORES', rotulo: 'Lançar valores', icone: 'pi pi-dollar' }
          : { acao: 'RELATORIO', rotulo: 'Relatório', icone: 'pi pi-file' };
      default:
        return null;
    }
  });

  protected readonly ariaLabel = computed(() => {
    const it = this.item();
    const partes = [`${rotuloOs(it.numero)} ${this.identificacao()}`, it.descricao, `criticidade ${ROTULO_CRITICIDADE[it.criticidade].toLowerCase()}`];
    if (it.atrasada) partes.push('prazo estourado');
    if (it.paradaEmCurso) partes.push('veículo parado');
    if (it.baixaPendente) partes.push('valores pendentes');
    return `${partes.join(', ')}. Enter abre a OS.`;
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
