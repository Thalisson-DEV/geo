import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { ModeloChecklistResumo } from '../../../core/models/frota-checklist.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { FrotaModeloChecklistFormComponent } from '../checklists/frota-modelo-checklist-form.component';
import { acessoFrota } from '../shared/frota-acesso';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';

/**
 * Modelos de checklist (aba das configurações). A edição abre o construtor em página própria,
 * no formato do construtor de formulários do SST.
 */
@Component({
  selector: 'app-frota-modelos-checklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesIconButtonComponent,
    CesRowActionsDirective,
    CesStatusComponent,
    FrotaModeloChecklistFormComponent
  ],
  template: `
    <ces-data-table title="Modelos de checklist"
      description="Perguntas que o condutor responde no app. Abra um modelo para ver e editar as perguntas."
      storageKey="frota-modelos-checklist" searchPlaceholder="Filtrar nesta lista"
      [columns]="colunas" [rows]="modelos()" [rowKey]="chave" [state]="estado()"
      stateTitle="Nenhum modelo de checklist"
      stateDescription="Crie um modelo principal, como Caminhonete, para o app oferecer o checklist aos veículos."
      [rowClickable]="true" (rowActivate)="editar($event)">
      <ng-container table-actions>
        @if (podeConfigurar()) {
          <ces-button size="sm" icon="pi pi-plus" label="Novo modelo" (pressed)="novo()"></ces-button>
        }
      </ng-container>
      <ng-template cesCell="ativo" let-row>
        <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
      </ng-template>
      <ng-template cesRowActions let-row>
        @if (podeConfigurar()) {
          <span class="ces-table-actions">
            <ces-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar modelo" size="icon-sm" (pressed)="editar(row)"></ces-icon-button>
            <ces-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
              [tooltip]="row.ativo ? 'Desativar modelo' : 'Reativar modelo'" size="icon-sm" (pressed)="alternar(row)"></ces-icon-button>
          </span>
        }
      </ng-template>
    </ces-data-table>

    <app-frota-modelo-checklist-form [(visible)]="novoAberto" (salvo)="abrirCriado($event)"></app-frota-modelo-checklist-form>
  `
})
export class FrotaModelosChecklistComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  private readonly router = inject(Router);

  protected readonly podeConfigurar = acessoFrota().configurarChecklist;
  protected readonly modelos = signal<ModeloChecklistResumo[]>([]);
  protected readonly carregando = signal(false);
  protected readonly novoAberto = signal(false);
  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.modelos().length ? 'ready' : 'empty'));

  protected readonly colunas: CesDataTableColumn<ModeloChecklistResumo>[] = [
    { key: 'nome', header: 'Modelo', priority: 1 },
    { key: 'tipoRotulo', header: 'Tipo', priority: 1 },
    { key: 'aplicacao', header: 'Vale para', value: (m) => aplicacao(m), display: (m) => aplicacao(m) },
    { key: 'quantidadePerguntas', header: 'Perguntas', type: 'number' },
    { key: 'quantidadeFotosRecebimento', header: 'Fotos de recebimento', type: 'number' },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (m) => m.ativo, display: (m) => (m.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chave = (m: ModeloChecklistResumo) => m.id;

  constructor() {
    this.carregar();
  }

  protected novo(): void {
    this.novoAberto.set(true);
  }

  /** Depois de criar, vai para a página do modelo (esperando o drawer sair da tela). */
  protected abrirCriado(m: { id: string }): void {
    navegarAposFecharDrawer(this.router, ['/frota/checklists/modelos', m.id]);
  }

  protected editar(m: Pick<ModeloChecklistResumo, 'id'>): void {
    this.router.navigate(['/frota/checklists/modelos', m.id]);
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.checklist.modelos().subscribe({
      next: (p) => {
        this.modelos.set(p.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(m: ModeloChecklistResumo): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: m.ativo ? 'Desativar modelo' : 'Reativar modelo',
      message: m.ativo
        ? `O app deixa de oferecer ${m.nome}. Os checklists já preenchidos continuam como foram.`
        : `O app volta a oferecer ${m.nome} na próxima sincronização.`,
      confirmLabel: m.ativo ? 'Desativar' : 'Reativar',
      variant: m.ativo ? 'destructive' : 'default'
    });
    if (!ok) return;
    this.checklist.alternarModelo(m).subscribe({
      next: () => {
        this.notificacoes.success(m.ativo ? `${m.nome} desativado.` : `${m.nome} reativado.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }
}

/** "Todos os veículos" no principal sem tipo; senão, os tipos. */
export function aplicacao(m: ModeloChecklistResumo): string {
  if (m.tipo === 'ADICIONAL') return m.tiposImplemento.join(', ');
  return m.tiposVeiculo.length ? m.tiposVeiculo.join(', ') : 'Todos os veículos';
}
