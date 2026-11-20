import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoNumberInputComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';

import { StatusObraResponse } from '../../../../core/models/obras.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AuthService } from '../../../../core/services/auth.service';
import { ObrasService } from '../../../../core/services/obras.service';
import { AuditDialogComponent } from '../../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../../shared/listagem/listagem';

/** Opções do filtro "Tipo de status". */
const OPCOES_CONCLUSAO = [
  { label: 'Todos os tipos', value: null },
  { label: 'Em andamento', value: false },
  { label: 'Concluída / finalizada', value: true }
];

@Component({
  selector: 'app-status-obras',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="podeEscrever" (newRequested)="novo()">
      <geo-page-header
        title="Status de obras"
        icon="pi pi-flag"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Cadastros' }, { label: 'Status de Obras' }]"
        description="Etapas pelas quais uma obra passa, na ordem de exibição do painel, e quais encerram a obra."
        helpLabel="Ajuda sobre status de obras"
        (help)="ajuda.show()"
      >
        @if (podeEscrever) {
          <geo-button actions icon="pi pi-plus" label="Novo status" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel storageKey="obras-status" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Tipo de status" [options]="conclusaoOpcoes" [(value)]="lista.filters.concluida"></geo-select>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Status de obras"
        mode="server"
        storageKey="obras-status"
        exportFileName="status-obras"
        searchPlaceholder="Nome do status"
        [rowActionLabel]="podeEscrever ? 'Editar' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="podeEscrever ? 'Novo status' : undefined"
        noResultsTitle="Nenhum status encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os status' : 'Nenhum status cadastrado'"
        [stateDescription]="resultado.error() ?? 'Os status cadastrados aparecem aqui.'"
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
        <ng-template geoCell="concluida" let-row>
          <geo-status [tone]="row.concluida ? 'success' : 'info'" [icon]="row.concluida ? 'pi-check-circle' : 'pi-spinner'">
            {{ row.concluida ? 'Concluída / finalizada' : 'Em andamento' }}
          </geo-status>
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (podeEscrever && row.ativo) {
              <geo-icon-button icon="pi pi-ban" [label]="'Desativar ' + row.nome" size="icon-sm" (pressed)="desativar(row)"></geo-icon-button>
            }
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.nome" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar status' : 'Novo status'"
      [description]="$safeNavigationMigration(emEdicao()?.nome)" [dirty]="alterado()" size="sm">
      <geo-form-section title="Dados do status" icon="pi pi-flag">
        <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="100" description="Gravado em letras maiúsculas." [error]="erro('nome')"></geo-text-input>
        <geo-number-input label="Ordem de exibição" [(value)]="ordem" [min]="0" [useGrouping]="false" description="Posição do status no painel de obras."></geo-number-input>
        <geo-boolean-control label="Este status conclui a obra" [(value)]="concluida"
          description="Obras neste status contam como concluídas/finalizadas."></geo-boolean-control>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar status'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Status de obras" entidadePlural="status" busca="nome do status"
      rotuloNovo="Novo agente" [podeCriar]="podeEscrever"></app-ajuda-listagem>
  `
})
export class StatusObrasComponent {
  private readonly servico = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  protected readonly podeEscrever = inject(AuthService).currentUser()?.permissoes?.includes('obras:cadastros:write') ?? false;

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly conclusaoOpcoes = OPCOES_CONCLUSAO;
  protected readonly lista = geoListState({
    storageKey: 'obras-status',
    filters: {
      concluida: geoFilter.value<boolean | null>(null, { label: 'Tipo', param: 'tipo', options: () => OPCOES_CONCLUSAO }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'ordem', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<StatusObraResponse>(
    (pedido) => this.servico.listarStatus({ ...this.filtro(), ...(paginaPadrao(pedido) as { page: number; size: number; sort?: string }) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao(
    (pagina) => this.servico.listarStatus({ ...this.filtro(), ...(pagina as { page: number; size: number; sort?: string }) }),
    () => this.lista.request()
  );

  protected readonly colunas: GeoDataTableColumn<StatusObraResponse>[] = [
    { key: 'ordem', header: 'Ordem', type: 'integer', sortField: 'ordem', width: '6rem' },
    { key: 'nome', header: 'Nome', priority: 1, sortField: 'nome' },
    { key: 'concluida', header: 'Tipo de status', type: 'custom', sortField: 'concluida', value: (s) => s.concluida, display: (s) => (s.concluida ? 'Concluída / finalizada' : 'Em andamento') },
    { key: 'ativo', header: 'Status', type: 'custom', priority: 1, sortField: 'ativo', value: (s) => s.ativo, display: (s) => (s.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (a: StatusObraResponse) => a.nome;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<StatusObraResponse | null>(null);
  protected readonly nome = signal('');
  protected readonly ordem = signal<number | null>(0);
  protected readonly concluida = signal(false);
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const s = this.emEdicao();
    return s ? this.nome() !== s.nome || this.ordem() !== s.ordem || this.concluida() !== s.concluida : !!this.nome().trim();
  });
  private readonly erros = computed<Record<string, string>>(() => (this.nome().trim() ? ({} as Record<string, string>) : { nome: 'Informe o nome do status.' }));

  private filtro() {
    const { filters, query } = this.lista.request();
    return {
      concluida: filters.concluida ?? undefined,
      ativo: filters.ativo ?? undefined,
      buscaGlobal: query || undefined
    };
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    if (!this.podeEscrever) return;
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(agente: StatusObraResponse): void {
    this.preencher(agente);
    this.formularioAberto.set(true);
  }

  private preencher(s: StatusObraResponse | null): void {
    this.emEdicao.set(s);
    this.nome.set(s?.nome ?? '');
    this.ordem.set(s?.ordem ?? 0);
    this.concluida.set(s?.concluida ?? false);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const request = { nome: this.nome().trim().toUpperCase(), ordem: this.ordem() ?? 0, concluida: this.concluida() };
    this.salvando.set(true);
    (atual ? this.servico.atualizarStatus(atual.id, request) : this.servico.criarStatus(request)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Status atualizado.' : 'Status cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async desativar(agente: StatusObraResponse): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Desativar status',
      message: `${agente.nome} deixa de aparecer na seleção de status das obras. As obras que já estão nele não mudam.`,
      confirmLabel: 'Desativar',
      variant: 'destructive'
    });
    if (!ok) return;
    this.servico.desativarStatus(agente.id).subscribe({
      next: () => {
        this.notificacoes.success('Status desativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(agente: StatusObraResponse): void {
    this.auditoria().show(agente.id, 'Status de Obra', { nome: 'Nome do status', ordem: 'Ordem de exibição', concluida: 'Obra concluída' });
  }
}
