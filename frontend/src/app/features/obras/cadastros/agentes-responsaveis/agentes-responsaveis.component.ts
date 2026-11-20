import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
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
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';

import { AgenteResponsavelResponse } from '../../../../core/models/obras.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AuthService } from '../../../../core/services/auth.service';
import { ObrasService } from '../../../../core/services/obras.service';
import { AuditDialogComponent } from '../../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../../shared/listagem/listagem';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-agentes-responsaveis',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
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
        title="Agentes responsáveis"
        icon="pi pi-id-card"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Cadastros' }, { label: 'Agentes Responsáveis' }]"
        description="Pessoas de órgãos e empresas responsáveis pelas obras, com os contatos."
        helpLabel="Ajuda sobre agentes responsáveis"
        (help)="ajuda.show()"
      >
        @if (podeEscrever) {
          <geo-button actions icon="pi pi-plus" label="Novo agente" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel storageKey="obras-agentes" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="Empresa / órgão" [value]="lista.filters.empresaOrgao() ?? ''" (valueChange)="lista.filters.empresaOrgao.set($event || null)"
            placeholder="Ex.: Prefeitura"></geo-text-input>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Agentes responsáveis"
        mode="server"
        storageKey="obras-agentes"
        exportFileName="agentes-responsaveis"
        searchPlaceholder="Nome, e-mail ou empresa"
        [rowActionLabel]="podeEscrever ? 'Editar' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="podeEscrever ? 'Novo agente' : undefined"
        noResultsTitle="Nenhum agente encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os agentes' : 'Nenhum agente cadastrado'"
        [stateDescription]="resultado.error() ?? 'Os agentes cadastrados aparecem aqui.'"
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
        <ng-template geoCell="email" let-row>
          @if (row.email) {
            <a class="geo-cell-strong" [href]="'mailto:' + row.email">{{ row.email }}</a>
          } @else {
            <span class="geo-cell-muted">Sem e-mail</span>
          }
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
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

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar agente' : 'Novo agente'"
      [description]="$safeNavigationMigration(emEdicao()?.nome)" [dirty]="alterado()" size="md">
      <geo-form-section title="Identificação" icon="pi pi-id-card">
        <div class="geo-form-grid">
          <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="150" description="Gravado em letras maiúsculas." [error]="erro('nome')"></geo-text-input>
          <geo-text-input label="Empresa ou órgão" [(value)]="empresaOrgao" [maxlength]="150" [showOptional]="true"></geo-text-input>
        </div>
      </geo-form-section>
      <geo-form-section title="Contato" icon="pi pi-envelope">
        <div class="geo-form-grid">
          <geo-text-input label="E-mail" [(value)]="email" [maxlength]="150" [showOptional]="true" [error]="erro('email')"></geo-text-input>
          <geo-text-input label="Telefone / celular" [(value)]="telefone" [maxlength]="30" [showOptional]="true"></geo-text-input>
        </div>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar agente'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Agentes responsáveis" entidadePlural="agentes" busca="nome, e-mail ou empresa"
      rotuloNovo="Novo agente" [podeCriar]="podeEscrever"></app-ajuda-listagem>
  `
})
export class AgentesResponsaveisComponent {
  private readonly servico = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  protected readonly podeEscrever = inject(AuthService).currentUser()?.permissoes?.includes('obras:cadastros:write') ?? false;

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly lista = geoListState({
    storageKey: 'obras-agentes',
    filters: {
      empresaOrgao: geoFilter.value<string | null>(null, { label: 'Empresa', param: 'empresa' }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'nome', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<AgenteResponsavelResponse>(
    (pedido) => this.servico.listarAgentes({ ...this.filtro(), ...(paginaPadrao(pedido) as { page: number; size: number; sort?: string }) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao(
    (pagina) => this.servico.listarAgentes({ ...this.filtro(), ...(pagina as { page: number; size: number; sort?: string }) }),
    () => this.lista.request()
  );

  protected readonly colunas: GeoDataTableColumn<AgenteResponsavelResponse>[] = [
    { key: 'nome', header: 'Nome', priority: 1, sortField: 'nome' },
    { key: 'empresaOrgao', header: 'Empresa / órgão', sortField: 'empresaOrgao', display: (a) => a.empresaOrgao || '—' },
    { key: 'email', header: 'E-mail', type: 'custom', sortField: 'email', value: (a) => a.email, display: (a) => a.email ?? '' },
    { key: 'telefone', header: 'Telefone', display: (a) => a.telefone || '—' },
    { key: 'ativo', header: 'Status', type: 'custom', priority: 1, sortField: 'ativo', value: (a) => a.ativo, display: (a) => (a.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (a: AgenteResponsavelResponse) => a.nome;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<AgenteResponsavelResponse | null>(null);
  protected readonly nome = signal('');
  protected readonly empresaOrgao = signal('');
  protected readonly email = signal('');
  protected readonly telefone = signal('');
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const a = this.emEdicao();
    return a
      ? this.nome() !== a.nome || this.empresaOrgao() !== (a.empresaOrgao ?? '') || this.email() !== (a.email ?? '') || this.telefone() !== (a.telefone ?? '')
      : !!(this.nome() + this.empresaOrgao() + this.email() + this.telefone()).trim();
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.nome().trim()) e['nome'] = 'Informe o nome do agente.';
    if (this.email().trim() && !EMAIL.test(this.email().trim())) e['email'] = 'E-mail inválido.';
    return e;
  });

  private filtro() {
    const { filters, query } = this.lista.request();
    return {
      empresaOrgao: filters.empresaOrgao?.trim() || undefined,
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

  protected editar(agente: AgenteResponsavelResponse): void {
    this.preencher(agente);
    this.formularioAberto.set(true);
  }

  private preencher(a: AgenteResponsavelResponse | null): void {
    this.emEdicao.set(a);
    this.nome.set(a?.nome ?? '');
    this.empresaOrgao.set(a?.empresaOrgao ?? '');
    this.email.set(a?.email ?? '');
    this.telefone.set(a?.telefone ?? '');
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const request = {
      nome: this.nome().trim().toUpperCase(),
      email: this.email().trim() || undefined,
      telefone: this.telefone().trim() || undefined,
      empresaOrgao: this.empresaOrgao().trim().toUpperCase() || undefined
    };
    this.salvando.set(true);
    (atual ? this.servico.atualizarAgente(atual.id, request) : this.servico.criarAgente(request)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Agente atualizado.' : 'Agente cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async desativar(agente: AgenteResponsavelResponse): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Desativar agente',
      message: `${agente.nome} deixa de aparecer nas seleções de obras. O histórico é mantido.`,
      confirmLabel: 'Desativar',
      variant: 'destructive'
    });
    if (!ok) return;
    this.servico.desativarAgente(agente.id).subscribe({
      next: () => {
        this.notificacoes.success('Agente desativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(agente: AgenteResponsavelResponse): void {
    this.auditoria().show(agente.id, 'Agente Responsável', {
      nome: 'Nome do agente',
      empresaOrgao: 'Empresa / órgão',
      email: 'E-mail',
      telefone: 'Telefone'
    });
  }
}
