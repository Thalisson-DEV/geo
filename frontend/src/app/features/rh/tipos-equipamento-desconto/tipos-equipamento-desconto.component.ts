import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoRowActionsDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';

import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { RhDescontosService } from '../../../core/services/rh-descontos.service';
import { TipoEquipamentoResponse } from '../../../core/models/desconto.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

@Component({
  selector: 'app-tipos-equipamento-desconto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCellDirective,
    GeoRowActionsDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Tipos de equipamento de desconto"
        icon="pi pi-box"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Recursos Humanos' }, { label: 'Tipos de Equipamento de Desconto' }]"
        description="Tipos de equipamento (EPI, ferramentas, uniformes) que podem gerar desconto."
        helpLabel="Ajuda sobre tipos de equipamento"
        (help)="ajuda.show()"
      >
        <geo-button actions icon="pi pi-plus" label="Novo tipo" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="rh-tipos-equipamento-desconto" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Tipos de equipamento"
        mode="server"
        storageKey="rh-tipos-equipamento-desconto"
        exportFileName="tipos-equipamento-desconto"
        searchPlaceholder="Descrição do tipo"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo tipo"
        noResultsTitle="Nenhum tipo encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os tipos' : 'Nenhum tipo de equipamento cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre os tipos de equipamento usados nos descontos.'"
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="editar($event)"
      >
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.descricao"
              size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.descricao" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar tipo de equipamento' : 'Novo tipo de equipamento'"
      [description]="$safeNavigationMigration(emEdicao()?.descricao)" [dirty]="alterado()" size="sm">
      <geo-form-section title="Dados do tipo" icon="pi pi-box">
        <geo-text-input label="Descrição" [required]="true" [(value)]="descricao" [maxlength]="120" placeholder="Ex.: EPI" [error]="erro('descricao')"></geo-text-input>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar tipo'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Tipos de equipamento de desconto" entidadePlural="tipos de equipamento" busca="descrição do tipo" rotuloNovo="Novo tipo"></app-ajuda-listagem>
  `
})
export class TiposEquipamentoDescontoComponent {
  private readonly service = inject(RhDescontosService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly lista = geoListState({
    storageKey: 'rh-tipos-equipamento-desconto',
    filters: { ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS }) },
    sort: [{ key: 'descricao', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<TipoEquipamentoResponse>(
    (pedido) => this.service.listarTiposEquipamento({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.service.listarTiposEquipamento({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<TipoEquipamentoResponse>[] = [
    { key: 'descricao', header: 'Descrição', priority: 1, sortField: 'descricao' },
    { key: 'ativo', header: 'Status', type: 'custom', priority: 1, sortField: 'ativo', value: (m) => m.ativo, display: (m) => (m.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (m: TipoEquipamentoResponse) => m.descricao;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<TipoEquipamentoResponse | null>(null);
  protected readonly descricao = signal('');
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const atual = this.emEdicao();
    return atual ? this.descricao() !== atual.descricao : !!this.descricao().trim();
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.descricao().trim()) e['descricao'] = 'Informe a descrição.';
    return e;
  });

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ...filters, buscaGlobal: query || undefined };
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(motivo: TipoEquipamentoResponse): void {
    this.preencher(motivo);
    this.formularioAberto.set(true);
  }

  private preencher(motivo: TipoEquipamentoResponse | null): void {
    this.emEdicao.set(motivo);
    this.descricao.set(motivo?.descricao ?? '');
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const request = { descricao: this.descricao().trim() };
    this.salvando.set(true);
    (atual ? this.service.atualizarTipoEquipamento(atual.id, request) : this.service.criarTipoEquipamento(request)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Tipo atualizado.' : 'Tipo cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(motivo: TipoEquipamentoResponse): Promise<void> {
    const desativar = motivo.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar tipo de equipamento' : 'Ativar tipo de equipamento',
      message: desativar ? `"${motivo.descricao}" deixa de aparecer no lançamento de descontos.` : `"${motivo.descricao}" volta a aparecer no lançamento de descontos.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.service.desativarTipoEquipamento(motivo.id) : this.service.ativarTipoEquipamento(motivo.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Tipo desativado.' : 'Tipo ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(motivo: TipoEquipamentoResponse): void {
    this.auditoria().show(motivo.id, 'TipoEquipamento');
  }
}
