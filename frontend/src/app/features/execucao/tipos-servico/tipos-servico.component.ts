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
import { ExecucaoService } from '../../../core/services/execucao.service';
import { TipoServicoResponse } from '../../../core/models/execucao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

/**
 * Cadastro dos tipos de serviço que o encarregado escolhe ao lançar uma nota.
 * O código é a classificação da nota e pode se repetir entre tipos; a descrição
 * é única entre os tipos ativos.
 */
@Component({
  selector: 'app-tipos-servico',
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
        title="Tipos de serviço"
        icon="pi pi-tags"
        [breadcrumb]="[{ label: 'Execução' }, { label: 'Cadastros' }, { label: 'Tipos de Serviço' }]"
        description="Tipos de serviço que o encarregado informa ao lançar cada nota em campo."
        helpLabel="Ajuda sobre tipos de serviço"
        (help)="ajuda.show()"
      >
        <geo-button actions icon="pi pi-plus" label="Novo tipo" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="execucao-tipos-servico" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="Código" [(value)]="lista.filters.codigo" [maxlength]="10" placeholder="Ex.: CL"></geo-text-input>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Tipos de serviço"
        mode="server"
        storageKey="execucao-tipos-servico"
        exportFileName="tipos-servico"
        searchPlaceholder="Código ou descrição"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo tipo"
        noResultsTitle="Nenhum tipo encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os tipos' : 'Nenhum tipo de serviço cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre os tipos de serviço que as equipes executam em campo.'"
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

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar tipo de serviço' : 'Novo tipo de serviço'"
      [description]="emEdicao()?.descricao" [dirty]="alterado()" size="sm">
      <geo-form-section title="Dados do tipo" icon="pi pi-tags">
        <geo-text-input label="Código" [required]="true" [(value)]="codigo" [maxlength]="10" placeholder="Ex.: CL"
          description="Classificação da nota. Pode se repetir entre tipos." [error]="erro('codigo')"></geo-text-input>
        <geo-text-input label="Descrição" [required]="true" [(value)]="descricao" [maxlength]="120" placeholder="Ex.: LIGAÇÃO NOVA"
          description="É o que o encarregado vê no app de campo." [error]="erro('descricao')"></geo-text-input>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar tipo'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Tipos de serviço" entidadePlural="tipos de serviço" busca="código ou descrição" rotuloNovo="Novo tipo"></app-ajuda-listagem>
  `
})
export class TiposServicoComponent {
  private readonly service = inject(ExecucaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly lista = geoListState({
    storageKey: 'execucao-tipos-servico',
    filters: {
      codigo: geoFilter.value<string>('', { label: 'Código', param: 'codigo' }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'descricao', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<TipoServicoResponse>(
    (pedido) => this.service.listarTiposServico({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.service.listarTiposServico({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<TipoServicoResponse>[] = [
    { key: 'codigo', header: 'Código', priority: 1, sortField: 'codigo', width: '7rem' },
    { key: 'descricao', header: 'Descrição', priority: 1, sortField: 'descricao' },
    { key: 'ativo', header: 'Status', type: 'custom', priority: 1, sortField: 'ativo', value: (t) => t.ativo, display: (t) => (t.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (t: TipoServicoResponse) => `${t.codigo} · ${t.descricao}`;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<TipoServicoResponse | null>(null);
  protected readonly codigo = signal('');
  protected readonly descricao = signal('');
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const atual = this.emEdicao();
    return atual
      ? this.codigo() !== atual.codigo || this.descricao() !== atual.descricao
      : !!(this.codigo().trim() || this.descricao().trim());
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.codigo().trim()) e['codigo'] = 'Informe o código.';
    const descricao = this.descricao().trim();
    if (!descricao) e['descricao'] = 'Informe a descrição.';
    else if (descricao.length < 2) e['descricao'] = 'Use ao menos 2 caracteres.';
    return e;
  });

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ...filters, codigo: filters.codigo.trim() || undefined, buscaGlobal: query || undefined };
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(tipo: TipoServicoResponse): void {
    if (!tipo.ativo) {
      this.notificacoes.info('Ative o tipo antes de editá-lo.');
      return;
    }
    this.preencher(tipo);
    this.formularioAberto.set(true);
  }

  private preencher(tipo: TipoServicoResponse | null): void {
    this.emEdicao.set(tipo);
    this.codigo.set(tipo?.codigo ?? '');
    this.descricao.set(tipo?.descricao ?? '');
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const request = { codigo: this.codigo().trim().toUpperCase(), descricao: this.descricao().trim() };
    this.salvando.set(true);
    (atual ? this.service.atualizarTipoServico(atual.id, request) : this.service.criarTipoServico(request)).subscribe({
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

  protected async alternar(tipo: TipoServicoResponse): Promise<void> {
    const desativar = tipo.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar tipo de serviço' : 'Ativar tipo de serviço',
      message: desativar
        ? `"${tipo.descricao}" deixa de aparecer no lançamento de notas. As notas já lançadas com ele continuam com o tipo.`
        : `"${tipo.descricao}" volta a aparecer no lançamento de notas.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    this.service.alternarStatusTipoServico(tipo.id).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Tipo desativado.' : 'Tipo ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(tipo: TipoServicoResponse): void {
    this.auditoria().show(tipo.id, 'TipoServico');
  }
}
