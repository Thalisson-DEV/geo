import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesCellDirective,
  CesConfirmationService,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFilterPanelComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesListShortcutsDirective,
  CesPageHeaderComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService,
  cesFilter,
  cesListState
} from '@ces/ui';

import { ControleExecucaoObra, TipoDeObraResponse } from '../../../../core/models/obras.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AuthService } from '../../../../core/services/auth.service';
import { ObrasService } from '../../../../core/services/obras.service';
import { AuditDialogComponent } from '../../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../../shared/listagem/ajuda-listagem.component';
import { OPCOES_STATUS, paginaPadrao } from '../../../../shared/listagem/listagem';
import { CONTROLES_OBRA, controleObra } from '../../obras-controle';

const OPCOES_CONTROLE: CesSelectOption<ControleExecucaoObra | null>[] = [
  { label: 'Todos', value: null },
  ...CONTROLES_OBRA.map((c) => ({ label: c.titulo, value: c.value }))
];

@Component({
  selector: 'app-tipos-obra',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCalloutComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFilterPanelComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesListShortcutsDirective,
    CesPageHeaderComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent,
    CesTextareaComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  styles: `
    .to-escolhas { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.5rem; }
    .to-escolha {
      display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.625rem; align-items: start; text-align: left;
      padding: 0.75rem; border: 1px solid var(--ces-border); border-radius: var(--ces-radius-md);
      background: var(--ces-surface); color: var(--ces-foreground); font: inherit; cursor: pointer;
    }
    .to-escolha:hover { border-color: var(--ces-border-strong); }
    .to-escolha:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 1px; }
    .to-escolha[aria-checked='true'] { border-color: var(--ces-brand); background: var(--ces-brand-soft); }
    .to-escolha .pi { grid-row: span 2; margin-top: 0.125rem; color: var(--ces-foreground-muted); }
    .to-escolha[aria-checked='true'] .pi { color: var(--ces-brand); }
    .to-escolha strong { font-size: var(--ces-font-control); }
    .to-escolha span { color: var(--ces-foreground-muted); font-size: 0.8125rem; line-height: 1.35; }
    .to-legenda { margin: 0 0 0.375rem; font-size: var(--ces-font-control); font-weight: 600; color: var(--ces-foreground); }
  `,
  template: `
    <div class="ces-page" cesListShortcuts #atalhos="cesListShortcuts" [newAction]="podeEscrever" (newRequested)="novo()">
      <ces-page-header
        title="Tipos de obra"
        icon="pi pi-tags"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Cadastros' }, { label: 'Tipos de obra' }]"
        description="Tipos de obra e para onde vai o material pedido: direto na obra ou na OS/OC digitada na solicitação."
        helpLabel="Ajuda sobre tipos de obra"
        (help)="ajuda.show()"
      >
        @if (podeEscrever) {
          <ces-button actions icon="pi pi-plus" label="Novo tipo" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></ces-button>
        }
      </ces-page-header>

      <ces-filter-panel #painel storageKey="obras-tipos-obra" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="ces-filter-grid">
          <ces-select label="Pedido de material" [options]="opcoesControle" [(value)]="lista.filters.controle"></ces-select>
          <ces-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></ces-select>
        </div>
      </ces-filter-panel>

      <ces-data-table
        title="Tipos de obra"
        mode="server"
        storageKey="obras-tipos-obra"
        searchPlaceholder="Nome do tipo"
        [rowActionLabel]="podeEscrever ? 'Editar' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="podeEscrever ? 'Novo tipo' : undefined"
        noResultsTitle="Nenhum tipo encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os tipos de obra' : 'Nenhum tipo de obra cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre os tipos usados nas obras (Comum, LPT, Corretiva...).'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="podeEscrever && editar($event)"
      >
        <ng-template cesCell="nome" let-row>
          <span class="ces-cell-strong">{{ row.nome }}</span>
          @if (row.descricao) { <span class="ces-cell-muted">{{ row.descricao }}</span> }
        </ng-template>
        <ng-template cesCell="controle" let-row>
          <ces-status [tone]="controle(row.controleExecucao).tone" [icon]="controle(row.controleExecucao).icone.replace('pi ', '')">{{ controle(row.controleExecucao).titulo }}</ces-status>
        </ng-template>
        <ng-template cesCell="subtipo" let-row>
          @if (row.subtipo) { <ces-status tone="neutral" icon="pi-sitemap">Subtipo</ces-status> } @else { <span class="ces-cell-muted">Principal</span> }
        </ng-template>
        <ng-template cesCell="ativo" let-row>
          <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            @if (podeEscrever && row.ativo) {
              <ces-icon-button icon="pi pi-ban" [label]="'Desativar ' + row.nome" size="icon-sm" (pressed)="desativar(row)"></ces-icon-button>
            }
            @if (podeEscrever && !row.ativo) {
              <ces-icon-button icon="pi pi-refresh" [label]="'Reativar ' + row.nome" size="icon-sm" (pressed)="reativar(row)"></ces-icon-button>
            }
            <ces-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.nome" size="icon-sm" (pressed)="logs(row)"></ces-icon-button>
          </span>
        </ng-template>
      </ces-data-table>
    </div>

    <ces-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar tipo de obra' : 'Novo tipo de obra'"
      [description]="emEdicao()?.nome" [dirty]="alterado()" size="sm">
      <ces-form-section title="Dados do tipo" icon="pi pi-tags">
        <ces-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="60" description="Ex.: COMUM, LPT, CORRETIVA. Gravado em letras maiúsculas." [error]="erro('nome')"></ces-text-input>
        <ces-textarea label="Descrição" [(value)]="descricao" [rows]="2" [maxlength]="255" [showOptional]="true"></ces-textarea>
      </ces-form-section>
      <ces-form-section title="Como o material é pedido" icon="pi pi-box">
        <div role="radiogroup" aria-label="Como o material é pedido" class="to-escolhas">
          @for (c of controles; track c.value) {
            <button type="button" role="radio" class="to-escolha" [attr.aria-checked]="controleEscolhido() === c.value" (click)="controleEscolhido.set(c.value)">
              <i [class]="c.icone" aria-hidden="true"></i>
              <strong>{{ c.titulo }}</strong>
              <span>{{ c.texto }}</span>
            </button>
          }
        </div>
        @if (controleEscolhido() !== 'OBRA') {
          <ces-callout tone="info" [title]="'Não precisa cadastrar a ' + controleEscolhido()">Na solicitação, a pessoa digita o número da {{ controleEscolhido() }} (pode ter letras) e o material vai direto para ela.</ces-callout>
        }
      </ces-form-section>
      <ces-form-section title="Classificação" icon="pi pi-sitemap">
        <p class="to-legenda">Este tipo é um subtipo?</p>
        <div role="radiogroup" aria-label="Este tipo é um subtipo?" class="to-escolhas">
          <button type="button" role="radio" class="to-escolha" [attr.aria-checked]="!subtipo()" (click)="subtipo.set(false)">
            <i class="pi pi-building" aria-hidden="true"></i><strong>Tipo principal</strong><span>Obra própria, como Comum ou LPT.</span>
          </button>
          <button type="button" role="radio" class="to-escolha" [attr.aria-checked]="subtipo()" (click)="subtipo.set(true)">
            <i class="pi pi-sitemap" aria-hidden="true"></i><strong>Subtipo</strong><span>Complementa uma obra principal, como Kit ou Medidor.</span>
          </button>
        </div>
      </ces-form-section>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar tipo'" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Tipos de obra" entidadePlural="tipos de obra" busca="nome do tipo" rotuloNovo="Novo tipo" [podeCriar]="podeEscrever">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-box"></i> Direto na obra, OS ou OC</h4>
        <p class="help-text-desc">Comum, LPT, Kit e Medidor pedem material direto na obra. Corretiva e preventiva pedem direto na OC ou na OS: basta digitar o número na solicitação, sem cadastrar antes.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-sitemap"></i> Subtipos</h4>
        <p class="help-text-desc">Kit e Medidor são subtipos: complementam uma obra principal.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class TiposObraComponent {
  private readonly servico = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  protected readonly podeEscrever = inject(AuthService).currentUser()?.permissoes?.includes('obras:cadastros:write') ?? false;

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly opcoesControle = OPCOES_CONTROLE;
  protected readonly controles = CONTROLES_OBRA;
  protected readonly controle = controleObra;
  protected readonly lista = cesListState({
    storageKey: 'obras-tipos-obra',
    filters: {
      controle: cesFilter.value<ControleExecucaoObra | null>(null, { label: 'Pedido', param: 'controle', options: () => OPCOES_CONTROLE }),
      ativo: cesFilter.value<boolean | null>(true, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'nome', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<TipoDeObraResponse>(
    (pedido) => this.servico.listarTiposObra({ ...this.filtro(), ...(paginaPadrao(pedido) as { page: number; size: number; sort?: string }) }),
    { errorMessage: getErrorMessage }
  );

  protected readonly colunas: CesDataTableColumn<TipoDeObraResponse>[] = [
    { key: 'nome', header: 'Tipo', type: 'custom', priority: 1, sortField: 'nome', value: (t) => t.nome },
    { key: 'controle', header: 'Pedido de material', type: 'custom', priority: 1, sortField: 'controleExecucao', value: (t) => t.controleExecucao },
    { key: 'subtipo', header: 'Classificação', type: 'custom', sortField: 'subtipo', value: (t) => (t.subtipo ? 'Subtipo' : 'Principal') },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (t) => t.ativo, display: (t) => (t.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (t: TipoDeObraResponse) => t.nome;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<TipoDeObraResponse | null>(null);
  protected readonly nome = signal('');
  protected readonly descricao = signal('');
  protected readonly controleEscolhido = signal<ControleExecucaoObra>('OBRA');
  protected readonly subtipo = signal(false);
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const t = this.emEdicao();
    if (!t) return !!(this.nome() + this.descricao()).trim();
    return this.nome() !== t.nome || this.descricao() !== (t.descricao ?? '') || this.controleEscolhido() !== t.controleExecucao || this.subtipo() !== t.subtipo;
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const nome = this.nome().trim();
    const e: Record<string, string> = {};
    if (!nome) e['nome'] = 'Informe o nome do tipo.';
    else if (nome.length < 2) e['nome'] = 'Use ao menos 2 letras.';
    return e;
  });

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ativo: filters.ativo ?? undefined, controleExecucao: filters.controle ?? undefined, buscaGlobal: query || undefined };
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    if (!this.podeEscrever) return;
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(tipo: TipoDeObraResponse): void {
    this.preencher(tipo);
    this.formularioAberto.set(true);
  }

  private preencher(t: TipoDeObraResponse | null): void {
    this.emEdicao.set(t);
    this.nome.set(t?.nome ?? '');
    this.descricao.set(t?.descricao ?? '');
    this.controleEscolhido.set(t?.controleExecucao ?? 'OBRA');
    this.subtipo.set(t?.subtipo ?? false);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const request = {
      nome: this.nome().trim().toUpperCase(),
      descricao: this.descricao().trim() || undefined,
      controleExecucao: this.controleEscolhido(),
      subtipo: this.subtipo()
    };
    this.salvando.set(true);
    (atual ? this.servico.atualizarTipoObra(atual.id, request) : this.servico.criarTipoObra(request)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Tipo de obra atualizado.' : 'Tipo de obra cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async desativar(tipo: TipoDeObraResponse): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Desativar tipo de obra',
      message: `${tipo.nome} deixa de aparecer no cadastro de obras. As obras que já usam este tipo continuam como estão.`,
      confirmLabel: 'Desativar',
      variant: 'destructive'
    });
    if (!ok) return;
    this.servico.desativarTipoObra(tipo.id).subscribe({
      next: () => {
        this.notificacoes.success('Tipo de obra desativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected reativar(tipo: TipoDeObraResponse): void {
    this.servico.reativarTipoObra(tipo.id).subscribe({
      next: () => {
        this.notificacoes.success('Tipo de obra reativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(tipo: TipoDeObraResponse): void {
    this.auditoria().show(tipo.id, 'Tipo de obra', { nome: 'Nome', descricao: 'Descrição', controleExecucao: 'Pedido de material', subtipo: 'Subtipo' });
  }
}
