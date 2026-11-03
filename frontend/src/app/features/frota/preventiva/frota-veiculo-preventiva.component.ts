import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesConfirmationService,
  CesDataTableColumn,
  CesDataTableComponent,
  CesIconButtonComponent,
  CesRowActionsDirective,
  CesStatusComponent,
  NotificationService
} from '@ces/ui';
import { ControlePreventivo, PreventivaVeiculo, RealizacaoPreventiva, aparenciaPreventiva, resumoOsPreventivas } from '../../../core/models/frota-preventiva.models';
import { formatarMedicao, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPreventivaService } from '../../../core/services/frota-preventiva.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaInformarRealizacaoDrawerComponent } from './frota-informar-realizacao-drawer.component';

/** Aba Preventiva da ficha: os planos que acompanham o veículo, quanto falta em cada um e as realizações. */
@Component({
  selector: 'app-frota-veiculo-preventiva',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CesButtonComponent, CesCellDirective, CesDataTableComponent, CesIconButtonComponent, CesRowActionsDirective, CesStatusComponent,
    FrotaInformarRealizacaoDrawerComponent],
  styles: `
    :host { display: grid; gap: 1rem; }
    .falta--danger { color: var(--ces-danger-text); font-weight: 600; }
    .falta--warning { color: var(--ces-warning-text); font-weight: 600; }
  `,
  template: `
    <ces-data-table title="Planos do veículo" description="Pelo tipo do veículo e pelos implementos acoplados. Vence pelo que chegar primeiro."
      storageKey="frota-veiculo-preventiva" searchPlaceholder="Filtrar nesta lista" [columns]="colunas" [rows]="dados()?.controles ?? []"
      [rowKey]="chave" [state]="carregando() ? 'loading' : (dados()?.controles?.length ? 'ready' : 'empty')"
      stateTitle="Nenhum plano de preventiva para este veículo"
      stateDescription="Os planos valem por tipo de veículo ou por implemento acoplado. Confira o tipo na ficha ou cadastre um plano.">
      <ng-container table-actions>
        <ces-button size="sm" variant="outline" icon="pi pi-calendar-clock" label="Acompanhamento da frota" (pressed)="irParaAcompanhamento()"></ces-button>
      </ng-container>
      <ng-template cesCell="plano" let-row>
        <span class="ces-cell-strong">{{ row.plano }}</span>
        <span class="ces-cell-muted">{{ row.frequencia }}</span>
      </ng-template>
      <ng-template cesCell="situacao" let-row>
        @let ap = aparencia(row);
        <ces-status [tone]="ap.tom" [icon]="ap.icone">{{ ap.rotulo }}</ces-status>
        <span class="ces-cell-muted" [class.falta--danger]="row.situacao === 'VENCIDA'" [class.falta--warning]="row.situacao === 'PROXIMA'">{{ row.falta }}</span>
      </ng-template>
      <ng-template cesCell="ultima" let-row>
        {{ row.baseData | date: 'dd/MM/yyyy' }}{{ row.baseMedicao != null ? ' · ' + medicao(row.baseMedicao, row.unidade) : '' }}
        <span class="ces-cell-muted">{{ row.semHistorico ? 'Sem histórico: contando desde a entrada no plano' : row.baseOrigemRotulo }}</span>
      </ng-template>
      <ng-template cesCell="proxima" let-row>
        {{ proxima(row) }}
        @if (row.previsao && row.situacao !== 'VENCIDA') { <span class="ces-cell-muted">Previsão {{ row.previsao | date: 'dd/MM/yyyy' }}</span> }
      </ng-template>
      <ng-template cesRowActions let-row>
        <span class="ces-table-actions">
          @if (row.idOrdemServico) {
            <ces-icon-button icon="pi pi-external-link" [label]="'Ver a OS ' + row.numeroOrdemServico" tooltip="Ver a OS" size="icon-sm" (pressed)="verOs(row.idOrdemServico)"></ces-icon-button>
          } @else if (podeAbrirOs()) {
            <ces-icon-button icon="pi pi-wrench" [label]="'Abrir OS de ' + row.plano" tooltip="Abrir OS" size="icon-sm" [disabled]="abrindo()" (pressed)="abrirOs(row)"></ces-icon-button>
          }
          @if (acesso.editarPreventiva()) {
            <ces-icon-button icon="pi pi-history" [label]="'Informar a última realização de ' + row.plano" tooltip="Informar última realização" size="icon-sm" (pressed)="informar(row)"></ces-icon-button>
          }
        </span>
      </ng-template>
    </ces-data-table>

    <ces-data-table title="Realizações" description="Revisões informadas e OS preventivas deste veículo, da mais recente para a mais antiga."
      storageKey="frota-veiculo-preventiva-realizacoes" searchPlaceholder="Filtrar nesta lista" [columns]="colunasRealizacoes"
      [rows]="dados()?.realizacoes ?? []" [rowKey]="chaveRealizacao" [state]="carregando() ? 'loading' : (dados()?.realizacoes?.length ? 'ready' : 'empty')"
      stateTitle="Nenhuma realização registrada" stateDescription="Aparecem aqui as OS preventivas concluídas e as revisões informadas no acompanhamento.">
      <ng-template cesCell="realizadaEm" let-row>
        @if (row.realizadaEm) { {{ row.realizadaEm | date: 'dd/MM/yyyy' }} } @else { <span class="ces-cell-muted">—</span> }
        @if (row.medicao != null) { <span class="ces-cell-muted">{{ medicao(row.medicao, row.unidade) }}</span> }
      </ng-template>
      <ng-template cesCell="origem" let-row>
        {{ row.numeroOrdemServico ? 'OS ' + row.numeroOrdemServico : row.origemRotulo }}
        <span class="ces-cell-muted">{{ row.usuario ?? '' }}{{ row.observacao ? (row.usuario ? ' · ' : '') + row.observacao : '' }}</span>
      </ng-template>
      <ng-template cesCell="situacao" let-row>
        <ces-status [tone]="row.situacao === 'CONCLUIDA' ? 'success' : row.situacao === 'ABERTA' ? 'info' : 'neutral'" emphasis="outline">{{ row.situacaoRotulo }}</ces-status>
      </ng-template>
      <ng-template cesRowActions let-row>
        @if (row.idOrdemServico) {
          <span class="ces-table-actions">
            <ces-icon-button icon="pi pi-external-link" [label]="'Ver a OS ' + row.numeroOrdemServico" tooltip="Ver a OS" size="icon-sm" (pressed)="verOs(row.idOrdemServico)"></ces-icon-button>
          </span>
        }
      </ng-template>
    </ces-data-table>

    <app-frota-informar-realizacao-drawer [(visivel)]="informarAberto" [controle]="emInforme()" (registrado)="alterou.emit()"></app-frota-informar-realizacao-drawer>
  `
})
export class FrotaVeiculoPreventivaComponent {
  private readonly preventiva = inject(FrotaPreventivaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();

  readonly dados = input<PreventivaVeiculo | null>(null);
  readonly carregando = input(false);
  /** Uma OS foi aberta ou uma realização informada: a ficha recarrega. */
  readonly alterou = output<void>();

  protected readonly aparencia = aparenciaPreventiva;
  protected readonly medicao = formatarMedicao;
  protected readonly abrindo = signal(false);
  protected readonly informarAberto = signal(false);
  protected readonly emInforme = signal<ControlePreventivo | null>(null);
  protected readonly podeAbrirOs = () => this.acesso.editarPreventiva() && this.acesso.editarOs();

  protected readonly colunas: CesDataTableColumn<ControlePreventivo>[] = [
    { key: 'plano', header: 'Plano', type: 'custom', priority: 1, value: (c) => c.plano, display: (c) => c.plano },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (c) => aparenciaPreventiva(c).rotulo, display: (c) => `${aparenciaPreventiva(c).rotulo} ${c.falta}` },
    { key: 'ultima', header: 'Última realização', type: 'custom', priority: 1, value: (c) => c.baseData, display: (c) => c.baseData },
    { key: 'proxima', header: 'Próxima', type: 'custom', priority: 2, value: (c) => c.proximaData ?? '', display: (c) => this.proxima(c) }
  ];
  protected readonly colunasRealizacoes: CesDataTableColumn<RealizacaoPreventiva>[] = [
    { key: 'plano', header: 'Plano', priority: 1 },
    { key: 'realizadaEm', header: 'Quando', type: 'custom', priority: 1, value: (r) => r.realizadaEm ?? '', display: (r) => r.realizadaEm ?? '' },
    { key: 'origem', header: 'Como', type: 'custom', priority: 1, value: (r) => r.origemRotulo, display: (r) => r.origemRotulo },
    { key: 'situacao', header: 'Situação', type: 'custom', value: (r) => r.situacaoRotulo, display: (r) => r.situacaoRotulo }
  ];
  protected readonly chave = (c: ControlePreventivo) => c.id;
  protected readonly chaveRealizacao = (r: RealizacaoPreventiva) => r.id;

  protected proxima(c: ControlePreventivo): string {
    const partes = [
      c.proximaMedicao != null ? formatarMedicao(c.proximaMedicao, c.unidade) : null,
      c.proximaData ? c.proximaData.split('-').reverse().join('/') : null
    ].filter(Boolean);
    return partes.length ? partes.join(' ou ') : 'Aguardando a primeira leitura';
  }

  protected async abrirOs(c: ControlePreventivo): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Abrir OS preventiva',
      message: `${c.plano}: a OS entra como pendente, com os itens e o roteiro do plano.`,
      confirmLabel: 'Abrir OS'
    });
    if (!ok) return;
    this.abrindo.set(true);
    this.preventiva.abrirOs([c.id]).subscribe({
      next: (r) => {
        this.abrindo.set(false);
        const os = r.ordens[0];
        this.notificacoes.success(resumoOsPreventivas(r, formatarPlaca), os ? { action: { label: `Ver a OS ${os.numero}`, run: () => this.verOs(os.id) } } : {});
        this.alterou.emit();
      },
      error: (e) => {
        this.abrindo.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected informar(c: ControlePreventivo): void {
    this.emInforme.set(c);
    this.informarAberto.set(true);
  }

  protected irParaAcompanhamento(): void {
    void this.router.navigate(['/frota/preventiva']);
  }

  protected verOs(id: string): void {
    void this.router.navigate(['/frota/ordens-servico', id]);
  }
}
