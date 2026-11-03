import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesIconButtonComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  NotificationService
} from '@ces/ui';
import { PendenciaChecklist, SituacaoPendenciaChecklist } from '../../../core/models/frota-checklist.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaJustificativaDrawerComponent } from '../shared/frota-justificativa-drawer.component';
import { FrotaChecklistDetalheDrawerComponent, ROTULO_PENDENCIA, TOM_PENDENCIA } from './frota-checklist-detalhe-drawer.component';
import { recorrente, textoHistorico } from './frota-checklist.util';
import { FrotaPendenciaDecisaoDrawerComponent, ModoDecisao } from './frota-pendencia-decisao-drawer.component';

const SITUACOES: CesSelectOption<SituacaoPendenciaChecklist>[] = [
  { label: 'Aguardando o gestor', value: 'ABERTA' },
  { label: 'Com OS aberta', value: 'OS_ABERTA' },
  { label: 'Resolvidas na hora', value: 'RESOLVIDA_NA_HORA' },
  { label: 'Descartadas', value: 'DESCARTADA' }
];

/**
 * Fila de Não OK dos checklists. O gestor abre a OS (uma para vários problemas do mesmo veículo),
 * registra o que foi resolvido na hora ou descarta o que foi marcado por engano. O Não OK nunca vira OS sozinho.
 */
@Component({
  selector: 'app-frota-pendencias-checklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesIconButtonComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    FrotaChecklistDetalheDrawerComponent,
    FrotaJustificativaDrawerComponent,
    FrotaPendenciaDecisaoDrawerComponent
  ],
  template: `
    <ces-data-table title="Pendências do checklist" [description]="descricao()" storageKey="frota-checklist-pendencias"
      searchPlaceholder="Filtrar nesta lista" [(query)]="busca" [columns]="colunasVisiveis()" [rows]="pendencias()" [rowKey]="chave"
      [state]="carregando() ? 'loading' : erro() ? 'error' : pendencias().length ? 'ready' : 'empty'"
      [stateTitle]="erro() ? 'Não foi possível carregar as pendências' : situacao() === 'ABERTA' ? 'Nenhum problema esperando decisão' : 'Nenhuma pendência nessa situação'"
      [stateDescription]="erro() ?? (situacao() === 'ABERTA' ? 'Os Não OK dos checklists aparecem aqui para você abrir a OS, registrar o que foi resolvido ou descartar.' : undefined)"
      [selectable]="situacao() === 'ABERTA' && acesso.editarOs()" [(selection)]="selecionadas"
      [rowClickable]="true" (rowActivate)="verChecklist($event)">
      <ng-container table-actions>
        <ces-select label="Situação" [labelVisible]="false" [options]="situacoes" [value]="situacao()" (valueChange)="situacao.set($event ?? 'ABERTA')"></ces-select>
      </ng-container>
      <ces-button selection-actions size="sm" icon="pi pi-wrench" label="Abrir uma OS" (pressed)="decidirSelecionadas('os')"></ces-button>
      <ces-button selection-actions size="sm" variant="outline" icon="pi pi-check" label="Resolvido na hora" (pressed)="decidirSelecionadas('hora')"></ces-button>

      <ng-template cesCell="placa" let-row>
        <span class="ces-cell-strong">{{ placa(row.placa) }}</span>
        <span class="ces-cell-muted">{{ row.baseNome ?? 'Sem base' }}</span>
      </ng-template>
      <ng-template cesCell="resumo" let-row>
        <span class="ces-cell-strong">{{ row.resumo }}</span>
        @if (row.comentario) {
          <span class="ces-cell-muted">{{ row.comentario }}</span>
        }
      </ng-template>
      <ng-template cesCell="historico" let-row>
        @if (recorrente(row.historico)) {
          <ces-status tone="danger" emphasis="outline" icon="pi-history">Recorrente</ces-status>
        }
        <span class="ces-cell-muted">{{ textoHistorico(row.historico) ?? '—' }}</span>
      </ng-template>
      <ng-template cesCell="preenchidoEm" let-row>
        {{ row.preenchidoEm | date: 'dd/MM HH:mm' }}
        <span class="ces-cell-muted">{{ row.condutorNome ?? '—' }}</span>
      </ng-template>
      <ng-template cesCell="fotos" let-row>
        @if (row.fotosAChegar) {
          <ces-status tone="info" icon="pi-mobile">{{ row.fotosAChegar === 1 ? '1 no celular' : row.fotosAChegar + ' no celular' }}</ces-status>
        } @else if (row.fotos.length) {
          <ces-status tone="neutral" icon="pi-camera">{{ row.fotos.length }}</ces-status>
        } @else {
          <span class="ces-cell-muted">—</span>
        }
      </ng-template>
      <ng-template cesCell="decisao" let-row>
        <ces-status [tone]="tomDe(row.situacao)" emphasis="outline">{{ rotuloDe(row.situacao) }}</ces-status>
        @if (row.numeroOrdemServico) {
          <span class="ces-cell-muted">OS {{ row.numeroOrdemServico }}{{ row.decididaPor ? ' · ' + row.decididaPor : '' }}</span>
        } @else if (row.justificativa) {
          <span class="ces-cell-muted">{{ row.justificativa }}</span>
        }
      </ng-template>
      <ng-template cesRowActions let-row>
        <span class="ces-table-actions">
          @if (row.situacao === 'ABERTA' && acesso.editarOs()) {
            <ces-icon-button icon="pi pi-wrench" [label]="'Abrir OS para ' + row.resumo" tooltip="Abrir OS" size="icon-sm" (pressed)="decidir([row], 'os')"></ces-icon-button>
            <ces-icon-button icon="pi pi-check" [label]="'Resolvido na hora: ' + row.resumo" tooltip="Resolvido na hora" size="icon-sm" (pressed)="decidir([row], 'hora')"></ces-icon-button>
            <ces-icon-button icon="pi pi-times" [label]="'Descartar ' + row.resumo" tooltip="Descartar (marcado por engano)" size="icon-sm" (pressed)="pedirDescarte(row)"></ces-icon-button>
          } @else if (row.idOrdemServico) {
            <ces-icon-button icon="pi pi-external-link" [label]="'Ver a OS ' + row.numeroOrdemServico" tooltip="Ver a OS" size="icon-sm" (pressed)="verOs(row.idOrdemServico)"></ces-icon-button>
          }
        </span>
      </ng-template>
    </ces-data-table>

    <app-frota-pendencia-decisao-drawer [(visible)]="decisaoAberta" [modo]="modo()" [pendencias]="emDecisao()" (concluido)="aposDecidir()"></app-frota-pendencia-decisao-drawer>

    <app-frota-justificativa-drawer [(visivel)]="descarteAberto" titulo="Descartar pendência"
      [descricao]="emDecisao()[0] ? placa(emDecisao()[0].placa) + ': ' + emDecisao()[0].resumo + '. Use só para o Não OK marcado por engano.' : undefined"
      rotuloConfirmar="Descartar" [destrutivo]="true" [processando]="descartando()" (confirmado)="descartar($event)"></app-frota-justificativa-drawer>

    <app-frota-checklist-detalhe-drawer [(visible)]="checklistAberto" [idChecklist]="idChecklist()"></app-frota-checklist-detalhe-drawer>
  `
})
export class FrotaPendenciasChecklistComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();
  /** A fila mudou (decisão tomada): a página reconta o que pede atenção. */
  readonly alterou = output<void>();

  protected readonly situacoes = SITUACOES;
  protected readonly rotuloDe = (s: SituacaoPendenciaChecklist) => ROTULO_PENDENCIA[s];
  protected readonly tomDe = (s: SituacaoPendenciaChecklist) => TOM_PENDENCIA[s];
  protected readonly placa = formatarPlaca;
  protected readonly textoHistorico = textoHistorico;
  protected readonly recorrente = recorrente;

  protected readonly situacao = signal<SituacaoPendenciaChecklist>('ABERTA');
  /** Aberta com ?busca= (o mapa da frota leva a placa): a lista já vem filtrada. */
  protected readonly busca = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('busca') ?? '');
  protected readonly pendencias = signal<PendenciaChecklist[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly selecionadas = signal<readonly PendenciaChecklist[]>([]);

  protected readonly decisaoAberta = signal(false);
  protected readonly modo = signal<ModoDecisao>('os');
  protected readonly emDecisao = signal<readonly PendenciaChecklist[]>([]);
  protected readonly descarteAberto = signal(false);
  protected readonly descartando = signal(false);
  protected readonly checklistAberto = signal(false);
  protected readonly idChecklist = signal<string | null>(null);

  protected readonly descricao = computed(() => {
    const n = this.pendencias().length;
    if (this.carregando() && !n) return undefined;
    const recorrentes = this.pendencias().filter((p) => recorrente(p.historico)).length;
    const base = n ? `${n} ${n === 1 ? 'problema' : 'problemas'}` : 'Nenhum problema';
    return recorrentes ? `${base} · ${recorrentes} ${recorrentes === 1 ? 'recorrente' : 'recorrentes'}` : base;
  });

  protected readonly colunas: CesDataTableColumn<PendenciaChecklist>[] = [
    { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, value: (p) => p.placa, display: (p) => formatarPlaca(p.placa) },
    { key: 'resumo', header: 'Problema', type: 'custom', priority: 1, value: (p) => p.resumo, display: (p) => `${p.resumo} ${p.comentario ?? ''}` },
    { key: 'historico', header: 'Há quanto tempo', type: 'custom', priority: 1, value: (p) => p.historico?.diasComProblema ?? 0, display: (p) => textoHistorico(p.historico) ?? '' },
    { key: 'preenchidoEm', header: 'Apontado em', type: 'custom', value: (p) => p.preenchidoEm, display: (p) => `${p.preenchidoEm} ${p.condutorNome ?? ''}` },
    { key: 'fotos', header: 'Fotos', type: 'custom', value: (p) => p.fotos.length, display: (p) => String(p.fotos.length) },
    { key: 'decisao', header: 'Decisão', type: 'custom', value: (p) => p.situacao, display: (p) => ROTULO_PENDENCIA[p.situacao] }
  ];
  /** Na fila aberta a decisão é sempre a mesma: a coluna só aparece nas já decididas. */
  protected readonly colunasVisiveis = computed(() =>
    this.situacao() === 'ABERTA' ? this.colunas.filter((c) => c.key !== 'decisao') : this.colunas
  );
  protected readonly chave = (p: PendenciaChecklist) => p.id;

  constructor() {
    effect(() => {
      this.situacao();
      untracked(() => this.carregar());
    });
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.selecionadas.set([]);
    this.checklist.pendencias(this.situacao(), [], { page: 0, size: 200, sort: ['dataCriacao,desc'] }).subscribe({
      next: (p) => {
        this.pendencias.set(p.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected decidir(pendencias: readonly PendenciaChecklist[], modo: ModoDecisao): void {
    this.emDecisao.set(pendencias);
    this.modo.set(modo);
    this.decisaoAberta.set(true);
  }

  /** Uma OS vale para um veículo: a seleção precisa ser de uma placa só. */
  protected decidirSelecionadas(modo: ModoDecisao): void {
    const selecionadas = this.selecionadas();
    if (new Set(selecionadas.map((p) => p.idVeiculo)).size > 1) {
      this.notificacoes.warning('Escolha problemas de um único veículo para a mesma OS.');
      return;
    }
    this.decidir(selecionadas, modo);
  }

  protected aposDecidir(): void {
    this.carregar();
    this.alterou.emit();
  }

  protected pedirDescarte(p: PendenciaChecklist): void {
    this.emDecisao.set([p]);
    this.descarteAberto.set(true);
  }

  protected descartar(justificativa: string): void {
    const p = this.emDecisao()[0];
    this.descartando.set(true);
    this.checklist.descartar(p.id, justificativa).subscribe({
      next: () => {
        this.descartando.set(false);
        this.descarteAberto.set(false);
        this.notificacoes.success('Pendência descartada.');
        this.aposDecidir();
      },
      error: (e) => {
        this.descartando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected verChecklist(p: PendenciaChecklist): void {
    this.idChecklist.set(p.idChecklist);
    this.checklistAberto.set(true);
  }

  protected verOs(id: string): void {
    void this.router.navigate(['/frota/ordens-servico', id]);
  }
}
