import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesIconButtonComponent,
  CesRowActionsDirective,
  CesStatusComponent
} from '@ces/ui';
import { Subscription } from 'rxjs';

import { FechamentoResumo, SituacaoFechamento } from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { AbaFechamento } from './fechamento-detalhe-drawer.component';
import { SITUACOES, iconeTipo, prazo, quantidade, textoPrazo, tipoFechamento } from './fechamento-ui';

/** Pedido para abrir o painel da solicitação, já na aba da ação escolhida. */
export interface AberturaFechamento {
  id: string;
  aba: AbaFechamento;
}

/**
 * Solicitações de encerramento de uma obra, numa tabela só, no relatório da obra e no painel da lista
 * de obras. A linha abre o detalhe; reserva e movimentação abrem a aba correspondente do painel.
 */
@Component({
  selector: 'app-obra-fechamentos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CesButtonComponent, CesCellDirective, CesDataTableComponent, CesIconButtonComponent, CesRowActionsDirective, CesStatusComponent],
  styles: `
    :host { display: block; }
    .of-repetir { margin-top: 0.5rem; }
    .of-pilha { display: grid; gap: 0.125rem; justify-items: start; min-width: 0; }
  `,
  template: `
    <ces-data-table
      caption="Solicitações de encerramento da obra"
      searchPlaceholder="Buscar por número, tipo ou reserva"
      stateTitle="Nenhuma solicitação de encerramento"
      [stateDescription]="erro() ?? (podeCriar() ? 'Abra uma solicitação para regularizar no SAP o saldo desta obra.' : 'As solicitações de encerramento desta obra aparecem aqui.')"
      noResultsTitle="Nenhuma solicitação encontrada."
      [emptyActionLabel]="podeCriar() && !erro() ? 'Nova solicitação de encerramento' : undefined"
      emptyActionIcon="pi pi-flag"
      rowActionLabel="Ver detalhe"
      rowActionIcon="pi pi-arrow-right"
      [state]="estado()"
      [columns]="colunas()"
      [rows]="linhas()"
      [rowKey]="chave"
      [rowLabel]="rotulo"
      [pageSizeOptions]="[10, 25, 50]"
      [pageSize]="10"
      (emptyAction)="nova.emit()"
      (rowActivate)="abrir.emit({ id: $event.id, aba: 'itens' })"
    >
      <ng-template cesCell="solicitacao" let-row>
        <span class="of-pilha">
          <span class="ces-cell-strong">#{{ row.id.slice(0, 8) }}</span>
          <span class="ces-cell-muted">{{ row.criadaEm | date: 'dd/MM/yyyy HH:mm' }}</span>
        </span>
      </ng-template>
      <ng-template cesCell="tipo" let-row>
        <ces-status [tone]="tipo(row.tipo).adicao ? 'info' : 'neutral'" [icon]="iconeTipo(row.tipo)" [title]="tipo(row.tipo).nome">{{ row.tipo }}</ces-status>
      </ng-template>
      <ng-template cesCell="reserva" let-row>
        @if (row.numeroReserva) {
          <span class="ces-cell-strong">{{ row.numeroReserva }}</span>
        } @else {
          <span class="ces-cell-muted">Sem reserva</span>
        }
      </ng-template>
      <ng-template cesCell="prazo" let-row>
        <span class="of-pilha">
          @if (row.prazoVigente.limite) {
            <span>{{ textoPrazo(row.situacao, row.prazoVigente) }}</span>
          } @else if (row.situacao === 'MOVIMENTADA') {
            <span class="ces-cell-muted">Concluída {{ row.movimentacaoConcluidaEm | date: 'dd/MM/yyyy' }}</span>
          } @else {
            <span class="ces-cell-muted">Sem prazo</span>
          }
          @if (prazo(row.prazoVigente.situacao); as p) {
            <ces-status [tone]="p.tone" [icon]="p.icon">{{ p.label }}</ces-status>
          }
        </span>
      </ng-template>
      <ng-template cesCell="situacao" let-row>
        <span class="of-pilha">
          <ces-status [tone]="sit(row.situacao).tone" [icon]="sit(row.situacao).icon">{{ sit(row.situacao).label }}</ces-status>
          @if (row.possuiPendencia) { <ces-status tone="warning" icon="pi pi-flag">Com pendência</ces-status> }
          @if (compacta()) {
            @if (prazo(row.prazoVigente.situacao); as p) {
              <span class="ces-cell-muted" [title]="textoPrazo(row.situacao, row.prazoVigente)">{{ textoPrazo(row.situacao, row.prazoVigente) }}</span>
              @if (p.tone !== 'success') { <ces-status [tone]="p.tone" [icon]="p.icon">{{ p.label }}</ces-status> }
            }
          }
        </span>
      </ng-template>
      <ng-template cesCell="movimentado" let-row>
        <span [class.ces-cell-muted]="!row.quantidadeMovimentada">{{ qtd(row.quantidadeMovimentada) }} de {{ qtd(row.quantidadeSolicitada) }}</span>
      </ng-template>
      <ng-template cesRowActions let-row>
        <span class="ces-table-actions">
          @if (row.acoes.registrarReserva) {
            <ces-icon-button icon="pi pi-hashtag" [label]="'Registrar reserva da solicitação #' + row.id.slice(0, 8)" size="icon-sm"
              (pressed)="abrir.emit({ id: row.id, aba: 'reserva' })"></ces-icon-button>
          }
          @if (row.acoes.movimentar) {
            <ces-icon-button icon="pi pi-check-square" [label]="'Marcar como movimentado a solicitação #' + row.id.slice(0, 8)" size="icon-sm"
              (pressed)="abrir.emit({ id: row.id, aba: 'movimentar' })"></ces-icon-button>
          }
          <ces-icon-button icon="pi pi-print" [label]="'Imprimir relatório da solicitação #' + row.id.slice(0, 8)" size="icon-sm"
            (pressed)="imprimir.emit(row)"></ces-icon-button>
        </span>
      </ng-template>
    </ces-data-table>
    @if (estado() === 'error') {
      <div class="of-repetir">
        <ces-button variant="ghost" size="sm" icon="pi pi-refresh" label="Tentar novamente" (pressed)="recarregar()"></ces-button>
      </div>
    }
  `
})
export class ObraFechamentosComponent {
  private readonly service = inject(FechamentoObraService);

  readonly idObra = input.required<string>();
  readonly podeCriar = input(false);
  /** No painel lateral: o prazo vai junto da situação e sai a coluna de quantidade. */
  readonly compacta = input(false);
  readonly abrir = output<AberturaFechamento>();
  readonly nova = output<void>();
  readonly imprimir = output<FechamentoResumo>();
  /** As linhas carregadas: o relatório usa para a versão impressa e os pontos de atenção. */
  readonly carregadas = output<FechamentoResumo[]>();

  protected readonly linhas = signal<FechamentoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly estado = computed(() =>
    this.carregando() ? ('loading' as const) : this.erro() ? ('error' as const) : this.linhas().length ? ('ready' as const) : ('empty' as const)
  );

  protected readonly tipo = tipoFechamento;
  protected readonly iconeTipo = iconeTipo;
  protected readonly sit = (s: SituacaoFechamento) => SITUACOES[s];
  protected readonly prazo = prazo;
  protected readonly textoPrazo = textoPrazo;
  protected readonly qtd = quantidade;
  protected readonly chave = (r: FechamentoResumo) => r.id;
  protected readonly rotulo = (r: FechamentoResumo) => `Encerramento ${r.tipo} #${r.id.slice(0, 8)}`;

  private readonly todasColunas: CesDataTableColumn<FechamentoResumo>[] = [
    { key: 'solicitacao', header: 'Solicitação', type: 'custom', priority: 1, width: '9rem', value: (r) => r.criadaEm, display: (r) => '#' + r.id.slice(0, 8) },
    { key: 'tipo', header: 'Tipo', type: 'custom', priority: 1, width: '5.5rem', value: (r) => r.tipo, display: (r) => `${r.tipo} ${tipoFechamento(r.tipo).nome}` },
    { key: 'reserva', header: 'Reserva', type: 'custom', priority: 2, width: '8rem', value: (r) => r.numeroReserva, display: (r) => r.numeroReserva ?? 'Sem reserva' },
    { key: 'prazo', header: 'Prazo', type: 'custom', priority: 2, value: (r) => r.prazoVigente.limite, display: (r) => textoPrazo(r.situacao, r.prazoVigente) },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, width: '11rem', value: (r) => SITUACOES[r.situacao].label },
    { key: 'movimentado', header: 'Movimentado', type: 'custom', priority: 3, width: '8rem', value: (r) => r.quantidadeMovimentada }
  ];

  protected readonly colunas = computed(() =>
    this.compacta() ? this.todasColunas.filter((c) => c.key !== 'prazo' && c.key !== 'movimentado') : this.todasColunas
  );

  private consulta?: Subscription;

  constructor() {
    effect(() => {
      const id = this.idObra();
      untracked(() => this.carregar(id));
    });
  }

  /** Busca de novo (depois de criar, registrar reserva ou movimentar). */
  recarregar(): void {
    this.carregar(this.idObra());
  }

  private carregar(idObra: string): void {
    this.consulta?.unsubscribe();
    this.carregando.set(true);
    this.erro.set(null);
    this.consulta = this.service.listar({ idObra, ordenacao: 'solicitacao', direcao: 'desc', page: 0, size: 200 }).subscribe({
      next: (r) => {
        const linhas = r.content ?? [];
        this.linhas.set(linhas);
        this.carregando.set(false);
        this.carregadas.emit(linhas);
      },
      error: (e) => {
        this.linhas.set([]);
        this.erro.set(getErrorMessage(e) || 'Não foi possível carregar o encerramento desta obra.');
        this.carregando.set(false);
        this.carregadas.emit([]);
      }
    });
  }
}
