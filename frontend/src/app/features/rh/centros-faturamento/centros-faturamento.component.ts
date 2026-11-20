import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  GeoBooleanControlComponent,
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
import { RhService } from '../../../core/services/rh.service';
import { CentroFaturamentoResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

@Component({
  selector: 'app-centros-faturamento',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
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
        title="Centros de custo"
        icon="pi pi-wallet"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Cadastros' }, { label: 'Centros de Custo' }]"
        description="Centros de faturamento (custo) usados para agrupar a produção e os contratos."
        helpLabel="Ajuda sobre centros de custo"
        (help)="ajuda.show()"
      >
        <geo-button actions icon="pi pi-plus" label="Novo centro" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="rh-centros-faturamento" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Centros de custo"
        mode="server"
        storageKey="rh-centros-faturamento"
        exportFileName="centros-custo"
        searchPlaceholder="Nome do centro"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo centro"
        noResultsTitle="Nenhum centro encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os centros' : 'Nenhum centro de custo cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre o primeiro centro de custo.'"
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
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.nome"
              size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.nome" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar centro de custo' : 'Novo centro de custo'"
      [description]="$safeNavigationMigration(emEdicao()?.nome)" [dirty]="alterado()" size="sm">
      <geo-form-section title="Dados do centro" icon="pi pi-wallet">
        <geo-text-input label="Nome" [required]="true" [(value)]="descricao" [maxlength]="120" placeholder="Ex.: Centro Norte" [error]="erro('descricao')"></geo-text-input>
        <geo-boolean-control label="Centro ativo" kind="toggle" [(value)]="ativo"></geo-boolean-control>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar centro'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Centros de custo" entidadePlural="centros de custo" busca="nome do centro" rotuloNovo="Novo centro"
      video="https://www.youtube.com/embed/ngit7xdouC4"></app-ajuda-listagem>
  `
})
export class CentrosFaturamentoComponent {
  private readonly service = inject(RhService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly lista = geoListState({
    storageKey: 'rh-centros-faturamento',
    filters: { ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS }) },
    sort: [{ key: 'nome', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<CentroFaturamentoResponse>(
    (pedido) => this.service.listarCentrosFaturamento({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.service.listarCentrosFaturamento({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<CentroFaturamentoResponse>[] = [
    { key: 'nome', header: 'Nome', priority: 1, sortField: 'nome' },
    { key: 'ativo', header: 'Status', type: 'custom', priority: 1, sortField: 'ativo', value: (m) => m.ativo, display: (m) => (m.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (m: CentroFaturamentoResponse) => m.nome;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<CentroFaturamentoResponse | null>(null);
  protected readonly descricao = signal('');
  protected readonly ativo = signal(true);
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const atual = this.emEdicao();
    return atual ? this.descricao() !== atual.nome || this.ativo() !== atual.ativo : !!this.descricao().trim();
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.descricao().trim()) e['descricao'] = 'Informe o nome do centro.';
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

  protected editar(motivo: CentroFaturamentoResponse): void {
    this.preencher(motivo);
    this.formularioAberto.set(true);
  }

  private preencher(motivo: CentroFaturamentoResponse | null): void {
    this.emEdicao.set(motivo);
    this.descricao.set(motivo?.nome ?? '');
    this.ativo.set(motivo?.ativo ?? true);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    // O cadastro do centro já recebe o status.
    const request = { nome: this.descricao().trim(), ativo: this.ativo() };
    this.salvando.set(true);
    (atual ? this.service.atualizarCentroFaturamento(atual.id, request) : this.service.criarCentroFaturamento(request)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Centro atualizado.' : 'Centro cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(motivo: CentroFaturamentoResponse): Promise<void> {
    const desativar = motivo.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar centro de custo' : 'Ativar centro de custo',
      message: desativar ? `${motivo.nome} deixa de aparecer nas seleções.` : `${motivo.nome} volta a aparecer nas seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.service.desativarCentroFaturamento(motivo.id) : this.service.ativarCentroFaturamento(motivo.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Centro desativado.' : 'Centro ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(motivo: CentroFaturamentoResponse): void {
    this.auditoria().show(motivo.id, motivo.nome, { nome: 'Nome do centro', ativo: 'Status (ativo)' });
  }
}
