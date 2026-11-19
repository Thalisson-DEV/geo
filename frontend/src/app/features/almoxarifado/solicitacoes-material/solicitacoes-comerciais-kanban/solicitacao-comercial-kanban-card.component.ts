import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { GeoButtonComponent } from '@geo/ui';

import { SolicitacaoMaterialSummaryResponse } from '../../../../core/models/solicitacao-material-tecnica.models';
import { UsuarioLookupService } from '../../../../core/services/usuario-lookup.service';
import { dataCivil, isoCivil, saqueAtrasado, statusComercial } from '../solicitacao-comercial-status';
import { tipoTecnicoEhAdicao, tipoTecnicoLabel } from '../solicitacao-tecnica-presentation';
import { statusTecnicoDef } from '../solicitacao-tecnica-situacao';

export type AcaoCardComercial = 'APROVAR' | 'ENTREGAR' | 'REJEITAR' | 'DETALHAR' | 'PLANEJAR' | 'INICIAR_SEPARACAO' | 'CONCLUIR_SEPARACAO' | 'DEVOLVER';

/** Próximo passo do cartão técnico (botão do rodapé). */
const PASSO_TECNICO: { acao: string; acaoCard: AcaoCardComercial; rotulo: string; icone: string }[] = [
  { acao: 'INICIAR_SEPARACAO', acaoCard: 'INICIAR_SEPARACAO', rotulo: 'Separar', icone: 'pi pi-play' },
  { acao: 'CONCLUIR_SEPARACAO', acaoCard: 'CONCLUIR_SEPARACAO', rotulo: 'Concluir', icone: 'pi pi-box' },
  { acao: 'ENTREGAR', acaoCard: 'ENTREGAR', rotulo: 'Entregar', icone: 'pi pi-truck' },
  { acao: 'CONFIRMAR_DEVOLUCAO', acaoCard: 'DEVOLVER', rotulo: 'Receber', icone: 'pi pi-undo' }
];

/**
 * Cartão do quadro comercial. Arrastar é atalho: toda ação também existe por botão e teclado
 * (Enter/Espaço abre o detalhe).
 */
@Component({
  selector: 'app-solicitacao-comercial-kanban-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent],
  styleUrl: './solicitacao-comercial-kanban-card.component.css',
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
        @if (tecnico() && tipoTecnico()) {
          <span class="kc__tag" [class.kc__tag--info]="ehAdicao()"><i [class]="ehAdicao() ? 'pi pi-shopping-cart' : 'pi pi-undo'" aria-hidden="true"></i>{{ tipoTecnicoLabel($any(tipoTecnico())) }}</span>
        }
        @if (tecnico() && ehAdicao() && !item().dataPrevista && item().status === 'APROVADO') {
          <span class="kc__tag kc__tag--aviso"><i class="pi pi-calendar-plus" aria-hidden="true"></i>A planejar</span>
        }
        @switch (prazo().tipo) {
          @case ('entregue') {
            <span class="kc__tag kc__tag--ok"><i class="pi pi-check" aria-hidden="true"></i>Entregue {{ item().dataEntrega | date: 'dd/MM' }}</span>
          }
          @case ('atrasada') {
            <span class="kc__tag kc__tag--perigo"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>Saque {{ item().dataPrevista | date: 'dd/MM' }} · {{ prazo().texto }}</span>
          }
          @case ('hoje') {
            <span class="kc__tag kc__tag--aviso"><i class="pi pi-calendar" aria-hidden="true"></i>Saque hoje</span>
          }
          @case ('prevista') {
            <span class="kc__tag"><i class="pi pi-calendar" aria-hidden="true"></i>Saque {{ item().dataPrevista | date: 'dd/MM' }} · {{ prazo().texto }}</span>
          }
        }
        @if (item().status === 'ENTREGUE_PARCIAL') {
          @if (item().encerrada) {
            <span class="kc__tag" title="O saldo que faltava foi encerrado e não será mais entregue"><i class="pi pi-lock" aria-hidden="true"></i>Saldo encerrado</span>
          } @else {
            <span class="kc__tag kc__tag--info"><i class="pi pi-truck" aria-hidden="true"></i>Parcial</span>
          }
        }
        @if (item().status === 'REJEITADO' || item().status === 'ESTORNADO') {
          <span class="kc__tag" [class.kc__tag--perigo]="item().status === 'REJEITADO'"><i [class]="'pi ' + status().icon" aria-hidden="true"></i>{{ status().label }}</span>
        }
        @if (item().possuiPendencia) {
          <span class="kc__tag kc__tag--aviso"><i class="pi pi-flag" aria-hidden="true"></i>Pendência</span>
        }
        <span class="kc__tag"><i class="pi pi-box" aria-hidden="true"></i>{{ quantidadeItens() }} {{ quantidadeItens() === 1 ? 'item' : 'itens' }}</span>
      </div>

      <div class="kc__foot">
        <span class="kc__pessoa" [title]="'Requisitante: ' + requisitante()">
          <span class="kc__avatar" aria-hidden="true">{{ iniciais() }}</span>
          <span>{{ requisitante() }}</span>
        </span>
        @if (tecnico()) {
          @if (passoTecnico(); as passo) {
            <geo-button [label]="passo.rotulo" [icon]="passo.icone" size="sm" variant="outline" [ariaLabel]="passo.rotulo + ' a solicitação #' + idCurto()" (pressed)="disparar(passo.acaoCard)" (click)="$event.stopPropagation()" />
          }
        } @else if (podeAprovar()) {
          <geo-button label="Aprovar" icon="pi pi-check" size="sm" variant="outline" [ariaLabel]="'Aprovar solicitação #' + idCurto()" (pressed)="disparar('APROVAR')" (click)="$event.stopPropagation()" />
        } @else if (podeEntregar()) {
          <geo-button label="Entregar" icon="pi pi-truck" size="sm" variant="outline" [ariaLabel]="'Registrar entrega da solicitação #' + idCurto()" (pressed)="disparar('ENTREGAR')" (click)="$event.stopPropagation()" />
        }
      </div>
    </article>
  `
})
export class SolicitacaoComercialKanbanCardComponent {
  private readonly usuarios = inject(UsuarioLookupService);

  readonly item = input.required<SolicitacaoMaterialSummaryResponse>();
  /** Este cartão é o que está sendo arrastado (fica esmaecido no lugar de origem). */
  readonly arrastando = input(false);
  /** Em telas de toque o cartão não é arrastável (a rolagem do quadro tem prioridade). */
  readonly arrastavel = input(true);

  /** Cartão do quadro técnico: título é a obra, mostra 221/922 e o próximo passo da fila. */
  readonly tecnico = input(false);
  /** Nome da obra (o quadro técnico resolve pelo cadastro). */
  readonly nomeObra = input<string | null>(null);

  readonly cardClicked = output<SolicitacaoMaterialSummaryResponse>();
  readonly dragStarted = output<SolicitacaoMaterialSummaryResponse>();
  readonly dragEnded = output<void>();
  readonly actionTriggered = output<{ item: SolicitacaoMaterialSummaryResponse; action: AcaoCardComercial }>();

  protected readonly status = computed(() => (this.tecnico() ? statusTecnicoDef(this.item().status) : statusComercial(this.item().status)));
  protected readonly tipoTecnicoLabel = tipoTecnicoLabel;
  protected readonly tipoTecnico = computed(() => (this.item() as { tipoTecnico?: string | null; tipo?: string | null }).tipoTecnico ?? this.item().tipo ?? null);
  protected readonly ehAdicao = computed(() => tipoTecnicoEhAdicao(this.tipoTecnico() as never));
  protected readonly titulo = computed(() => {
    const it = this.item();
    if (!this.tecnico()) return it.estoqueDestinoNome || 'Destino não informado';
    return this.nomeObra() || (this.ehAdicao() ? it.estoqueDestinoNome : it.estoqueOrigemNome) || 'Obra não informada';
  });
  protected readonly subtitulo = computed(() => {
    const it = this.item();
    if (!this.tecnico()) return `de ${it.estoqueOrigemNome || 'origem não informada'}`;
    const codigo = it.ocorrencia?.codigo?.trim();
    // O número pode ter sido digitado com o prefixo ("OC-88412"); não repete.
    const oc = codigo ? (/^(OS|OC)\b/i.test(codigo) ? codigo : `OS/OC ${codigo}`) : null;
    const almox = it.estoqueOrigemNome ? `de ${it.estoqueOrigemNome}` : null;
    return [oc, almox].filter(Boolean).join(' · ') || 'Direto na obra';
  });
  protected readonly passoTecnico = computed(() => {
    const it = this.item();
    const acoes = (it.acoesPermitidas ?? []) as string[];
    if (this.ehAdicao() && !it.dataPrevista && acoes.includes('EDITAR_PLANEJAMENTO')) return { acao: 'PLANEJAR', acaoCard: 'PLANEJAR' as AcaoCardComercial, rotulo: 'Planejar', icone: 'pi pi-calendar-plus' };
    return PASSO_TECNICO.find((p) => acoes.includes(p.acao)) ?? null;
  });
  protected readonly idCurto = computed(() => this.item().id.slice(0, 8));
  protected readonly quantidadeItens = computed(() => {
    const it = this.item() as SolicitacaoMaterialSummaryResponse & { totalItens?: number };
    return it.quantidadeItens ?? it.totalItens ?? 0;
  });
  protected readonly requisitante = computed(() => this.usuarios.resolverNome(this.item().idRequisitante, 'Requisitante'));
  protected readonly iniciais = computed(() => {
    const partes = this.requisitante().trim().split(/[\s._-]+/).filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : (partes[0]?.[1] ?? ''))).toUpperCase();
  });
  protected readonly atrasada = computed(() => saqueAtrasado(this.item()));

  /** Um único indicador de prazo: entregue, atrasada, hoje ou data prevista. */
  protected readonly prazo = computed<{ tipo: 'entregue' | 'atrasada' | 'hoje' | 'prevista' | 'nenhum'; texto: string }>(() => {
    const it = this.item();
    if (it.status === 'ENTREGUE' && it.dataEntrega) return { tipo: 'entregue', texto: '' };
    if (!it.dataPrevista || it.encerrada || it.status === 'REJEITADO' || it.status === 'ESTORNADO') return { tipo: 'nenhum', texto: '' };
    const hoje = dataCivil(isoCivil(new Date()));
    const dias = Math.round((dataCivil(it.dataPrevista).getTime() - hoje.getTime()) / 86_400_000);
    if (this.atrasada()) return { tipo: 'atrasada', texto: `${-dias}d de atraso` };
    if (dias === 0) return { tipo: 'hoje', texto: '' };
    return { tipo: 'prevista', texto: dias === 1 ? 'amanhã' : dias > 0 ? `em ${dias}d` : `há ${-dias}d` };
  });

  protected readonly podeAprovar = computed(() => {
    const it = this.item();
    return it.status === 'PENDENTE' && (it.acoesPermitidas?.includes('APROVAR') ?? true);
  });
  protected readonly podeEntregar = computed(() => this.item().acoesPermitidas?.includes('ENTREGAR') ?? false);

  protected readonly ariaLabel = computed(() => {
    const it = this.item();
    const partes = [
      `Solicitação ${this.idCurto()}: ${this.titulo()}`,
      this.subtitulo(),
      this.status().label,
      `${this.quantidadeItens()} ${this.quantidadeItens() === 1 ? 'item' : 'itens'}`
    ];
    if (this.atrasada()) partes.push('saque atrasado');
    if (it.possuiPendencia) partes.push('com pendência');
    return `${partes.join(', ')}. Enter abre o detalhe.`;
  });

  protected disparar(action: AcaoCardComercial): void {
    this.actionTriggered.emit({ item: this.item(), action });
  }

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
