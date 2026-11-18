import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  CesButtonComponent,
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
import {
  PapelSeguradora,
  SeguradoraFrota,
  formatarTelefone
} from '../../../core/models/frota-seguro.models';
import { FornecedorFrota } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { FrotaService } from '../../../core/services/frota.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { OPCOES_STATUS } from '../../../shared/listagem/listagem';
import { acessoFrota } from '../shared/frota-acesso';

const PAPEIS: CesSelectOption<PapelSeguradora>[] = [
  { label: 'Seguradora', value: 'SEGURADORA' },
  { label: 'Corretora', value: 'CORRETORA' }
];
const FILTRO_PAPEL: CesSelectOption<PapelSeguradora | null>[] = [{ label: 'Todos', value: null }, ...PAPEIS];
type Assistencia = 'COM' | 'SEM';
const FILTRO_ASSISTENCIA: CesSelectOption<Assistencia | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Com telefone', value: 'COM' },
  { label: 'Sem telefone', value: 'SEM' }
];

/**
 * Cadastro das seguradoras e corretoras da frota. Cada uma aponta para um fornecedor do
 * financeiro (quem recebe as parcelas) e guarda o telefone de assistência 24h.
 */
@Component({
  selector: 'app-frota-seguradoras-cadastro',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
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
    .bloco { display: grid; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--ces-border); border-radius: var(--ces-radius-md);
      background: var(--ces-surface-subtle); }
    .bloco__titulo { font-weight: 600; }
    .bloco__texto { margin: 0; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .acoes { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
    .acoes > * { flex: 1 1 12rem; }
    .acoes > ces-button { flex: 0 0 auto; }
    .links { display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.25rem; margin-top: -0.5rem;
      color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
  `,
  template: `
    <div class="ces-page" cesListShortcuts #atalhos="cesListShortcuts" [newAction]="acesso.editarSeguro()" (newRequested)="novo()">
      <ces-page-header
        title="Seguradoras e corretoras"
        icon="pi pi-shield"
        [breadcrumb]="[{ label: 'Frota' }, { label: 'Cadastros' }, { label: 'Seguradoras e Corretoras' }]"
        description="Quem emite e quem intermedia as apólices, com o fornecedor que recebe as parcelas e o telefone de assistência 24h."
        helpLabel="Ajuda sobre seguradoras e corretoras"
        (help)="ajuda.show()"
      >
        @if (acesso.editarSeguro()) {
          <ces-button actions icon="pi pi-plus" label="Nova seguradora" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></ces-button>
        }
      </ces-page-header>

      <ces-filter-panel #painel storageKey="frota-seguradoras" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="carregando()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="ces-filter-grid">
          <ces-select label="Papel" [options]="filtroPapel" [(value)]="lista.filters.papel"></ces-select>
          <ces-select label="Assistência 24h" [options]="filtroAssistencia" [(value)]="lista.filters.assistencia"></ces-select>
          <ces-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></ces-select>
        </div>
      </ces-filter-panel>

      <ces-data-table
        title="Seguradoras e corretoras"
        storageKey="frota-seguradoras"
        exportFileName="frota-seguradoras"
        searchPlaceholder="Nome da seguradora ou corretora"
        [rowActionLabel]="acesso.editarSeguro() ? 'Editar' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="acesso.editarSeguro() ? 'Nova seguradora' : undefined"
        noResultsTitle="Nenhuma seguradora ou corretora encontrada com esse recorte."
        [columns]="colunas"
        [rows]="linhas()"
        [rowKey]="chave"
        [rowLabel]="rotulo"
        [rowClickable]="acesso.editarSeguro()"
        [state]="estado()"
        [stateTitle]="erro() ? 'Não foi possível carregar as seguradoras e corretoras' : 'Nenhuma seguradora ou corretora cadastrada'"
        [stateDescription]="erro() ?? 'Cadastre as seguradoras e corretoras para escolher nas apólices. As usadas numa apólice entram aqui sozinhas.'"
        [filtered]="lista.filtered()"
        [(query)]="lista.query"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="editar($event)"
      >
        <ng-template cesCell="papel" let-row>
          <ces-status [tone]="row.papel === 'SEGURADORA' ? 'info' : 'neutral'" emphasis="soft"
            [icon]="row.papel === 'SEGURADORA' ? 'pi pi-shield' : 'pi pi-briefcase'">{{ row.papelRotulo }}</ces-status>
        </ng-template>
        <ng-template cesCell="telefoneAssistencia" let-row>
          @if (row.telefoneAssistencia) { {{ telefone(row.telefoneAssistencia) }} }
          @else if (row.papel === 'SEGURADORA') { <ces-status tone="warning" emphasis="soft">Sem telefone</ces-status> }
          @else { — }
        </ng-template>
        <ng-template cesCell="ativo" let-row>
          <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            @if (acesso.editarSeguro()) {
              <ces-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.nome"
                size="icon-sm" (pressed)="alternar(row)"></ces-icon-button>
            }
            <ces-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.nome" size="icon-sm" (pressed)="logs(row)"></ces-icon-button>
          </span>
        </ng-template>
      </ces-data-table>
    </div>

    <ces-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar ' + emEdicao()!.papelRotulo.toLowerCase() : 'Nova seguradora ou corretora'"
      [description]="emEdicao()?.nome" [dirty]="alterado()" [loading]="salvando()" size="md">
      <ces-form-section title="Dados da seguradora" icon="pi pi-shield">
        <ces-select label="Papel" [required]="true" [options]="papeis" [(value)]="papel"
          description="A seguradora emite a apólice; a corretora intermedia e cuida dos endossos."></ces-select>
        <ces-select label="Fornecedor do financeiro" [required]="true" [options]="opcoesFornecedor()" [(value)]="fornecedor" [filter]="true"
          filterPlaceholder="Nome do fornecedor" [loading]="carregandoFornecedores()" [disabled]="novoFornecedor()"
          description="Quem recebe o pagamento das parcelas." [error]="erroFornecedor()"></ces-select>
        @if (acesso.cadastrarFornecedor() && !novoFornecedor()) {
          <div class="links">
            <span>Não está no financeiro?</span>
            <ces-button variant="link" size="sm" icon="pi pi-plus" label="Cadastrar fornecedor" (pressed)="abrirNovoFornecedor()"></ces-button>
          </div>
        }
        @if (novoFornecedor()) {
          <div class="bloco">
            <span class="bloco__titulo">Novo fornecedor</span>
            <p class="bloco__texto">Entra no cadastro de fornecedores do financeiro, que confere e homologa depois.</p>
            <div class="acoes">
              <ces-text-input label="Nome" [required]="true" [(value)]="fornecedorNome" [maxlength]="150"></ces-text-input>
              <ces-text-input label="CNPJ" [(value)]="fornecedorCnpj" [maxlength]="18" [showOptional]="true" placeholder="Só números"></ces-text-input>
              <ces-button variant="ghost" label="Cancelar" (pressed)="novoFornecedor.set(false)"></ces-button>
              <ces-button icon="pi pi-check" label="Cadastrar" [disabled]="!fornecedorNome().trim()" [loading]="gravandoFornecedor()"
                (pressed)="cadastrarFornecedor()"></ces-button>
            </div>
          </div>
        }
        <ces-text-input label="Telefone de assistência 24h" [(value)]="telefoneAssistencia" [maxlength]="25" [showOptional]="true"
          placeholder="Ex.: 0800 701 0101" description="O número que a equipe liga num acidente, pane ou guincho."></ces-text-input>
        <ces-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="500" [showOptional]="true"
          placeholder="Ex.: contato do corretor, e-mail para endossos"></ces-textarea>
      </ces-form-section>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar seguradora'" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Seguradoras e corretoras" entidadePlural="seguradoras e corretoras" artigoPlural="as"
      busca="nome da seguradora ou corretora" rotuloNovo="Nova seguradora" [podeCriar]="acesso.editarSeguro()"></app-ajuda-listagem>
  `
})
export class FrotaSeguradorasCadastroComponent {
  private readonly servico = inject(FrotaSeguroService);
  private readonly frota = inject(FrotaService);
  private readonly financeiro = inject(FinanceiroService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  protected readonly acesso = acessoFrota();

  protected readonly papeis = PAPEIS;
  protected readonly filtroPapel = FILTRO_PAPEL;
  protected readonly filtroAssistencia = FILTRO_ASSISTENCIA;
  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly lista = cesListState({
    storageKey: 'frota-seguradoras',
    rememberFilters: 'frota-seguradoras',
    filters: {
      papel: cesFilter.value<PapelSeguradora | null>(null, { label: 'Papel', param: 'papel', options: () => FILTRO_PAPEL }),
      assistencia: cesFilter.value<Assistencia | null>(null, { label: 'Assistência 24h', param: 'assistencia', options: () => FILTRO_ASSISTENCIA }),
      ativo: cesFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'nome', direction: 'asc' }]
  });
  protected readonly telefone = formatarTelefone;
  /** O endpoint devolve a lista completa (catálogo pequeno): busca, filtro e paginação ficam na tabela. */
  protected readonly todas = signal<SeguradoraFrota[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.erro() ? 'error' : this.todas().length ? 'ready' : 'empty'));
  protected readonly linhas = computed(() => {
    const { papel, assistencia, ativo } = this.lista.applied();
    return this.todas().filter((s) =>
      (papel === null || s.papel === papel)
      && (assistencia === null || (assistencia === 'COM') === !!s.telefoneAssistencia)
      && (ativo === null || s.ativo === ativo));
  });

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<SeguradoraFrota | null>(null);
  protected readonly papel = signal<PapelSeguradora | null>('SEGURADORA');
  protected readonly fornecedor = signal<string | null>(null);
  protected readonly telefoneAssistencia = signal('');
  protected readonly observacao = signal('');
  protected readonly salvando = signal(false);
  private readonly tentou = signal(false);
  protected readonly erroFornecedor = computed(() => (this.tentou() && !this.fornecedor() ? 'Escolha o fornecedor.' : undefined));
  protected readonly alterado = computed(() => {
    const s = this.emEdicao();
    return this.papel() !== (s?.papel ?? 'SEGURADORA')
      || this.fornecedor() !== (s?.idFornecedor ?? null)
      || this.telefoneAssistencia().replace(/\D/g, '') !== (s?.telefoneAssistencia ?? '')
      || this.observacao().trim() !== (s?.observacao ?? '');
  });

  private readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly carregandoFornecedores = signal(false);
  protected readonly novoFornecedor = signal(false);
  protected readonly fornecedorNome = signal('');
  protected readonly fornecedorCnpj = signal('');
  protected readonly gravandoFornecedor = signal(false);

  /** Sem os fornecedores que já estão cadastrados no mesmo papel (fora o que está em edição). */
  protected readonly opcoesFornecedor = computed<CesSelectOption<string>[]>(() => {
    const usados = new Set(this.todas()
      .filter((s) => s.ativo && s.papel === this.papel() && s.id !== this.emEdicao()?.id)
      .map((s) => s.idFornecedor));
    return this.fornecedores().filter((f) => !usados.has(f.id)).map((f) => ({ label: f.nome, value: f.id }));
  });

  protected readonly colunas: CesDataTableColumn<SeguradoraFrota>[] = [
    { key: 'nome', header: 'Nome', priority: 1 },
    { key: 'papel', header: 'Papel', type: 'custom', value: (s) => s.papelRotulo, display: (s) => s.papelRotulo },
    { key: 'telefoneAssistencia', header: 'Assistência 24h', type: 'custom', value: (s) => s.telefoneAssistencia ?? '',
      display: (s) => formatarTelefone(s.telefoneAssistencia) },
    { key: 'apolicesVigentes', header: 'Apólices em vigor', type: 'number', value: (s) => s.apolicesVigentes },
    { key: 'ativo', header: 'Status', type: 'custom', priority: 1, value: (s) => s.ativo, display: (s) => (s.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chave = (s: SeguradoraFrota) => s.id;
  protected readonly rotulo = (s: SeguradoraFrota) => `${s.nome} (${s.papelRotulo.toLowerCase()})`;

  constructor() {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.listarSeguradoras().subscribe({
      next: (lista) => (this.todas.set(lista), this.carregando.set(false)),
      error: (e) => (this.carregando.set(false), this.erro.set(getErrorMessage(e)))
    });
  }

  protected novo(): void {
    if (!this.acesso.editarSeguro()) return;
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(s: SeguradoraFrota): void {
    if (!this.acesso.editarSeguro()) return;
    this.preencher(s);
    this.formularioAberto.set(true);
  }

  private preencher(s: SeguradoraFrota | null): void {
    this.emEdicao.set(s);
    this.papel.set(s?.papel ?? 'SEGURADORA');
    this.fornecedor.set(s?.idFornecedor ?? null);
    this.telefoneAssistencia.set(formatarTelefone(s?.telefoneAssistencia ?? null));
    this.observacao.set(s?.observacao ?? '');
    this.novoFornecedor.set(false);
    this.tentou.set(false);
    if (!this.fornecedores().length) {
      this.carregandoFornecedores.set(true);
      this.frota.fornecedoresOficina().subscribe({
        next: (f) => (this.fornecedores.set(f), this.carregandoFornecedores.set(false)),
        error: () => this.carregandoFornecedores.set(false)
      });
    }
  }

  protected abrirNovoFornecedor(): void {
    this.fornecedorNome.set('');
    this.fornecedorCnpj.set('');
    this.novoFornecedor.set(true);
  }

  protected cadastrarFornecedor(): void {
    const nome = this.fornecedorNome().trim();
    if (!nome) return;
    this.gravandoFornecedor.set(true);
    this.financeiro.criarFornecedor({ nomeFantasia: nome, documento: this.fornecedorCnpj().replace(/\D/g, '') || null }).subscribe({
      next: (f) => {
        this.gravandoFornecedor.set(false);
        this.fornecedores.update((lista) => [...lista, { id: f.id, nome: f.nomeFantasia }]);
        this.fornecedor.set(f.id);
        this.novoFornecedor.set(false);
        this.notificacoes.success(`${nome} cadastrado no financeiro.`);
      },
      error: (e) => (this.gravandoFornecedor.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  protected salvar(): void {
    this.tentou.set(true);
    const idFornecedor = this.fornecedor();
    const papel = this.papel();
    if (!idFornecedor || !papel) return;
    this.salvando.set(true);
    const request = {
      idFornecedor,
      papel,
      telefoneAssistencia: this.telefoneAssistencia().trim() || null,
      observacao: this.observacao().trim() || null
    };
    this.servico.salvarSeguradora(request, this.emEdicao()?.id).subscribe({
      next: (s) => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(this.emEdicao() ? `${s.nome} atualizada.` : `${s.nome} cadastrada como ${s.papelRotulo.toLowerCase()}.`);
        this.carregar();
      },
      error: (e) => (this.salvando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  protected async alternar(s: SeguradoraFrota): Promise<void> {
    const desativar = s.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar ' + s.papelRotulo.toLowerCase() : 'Ativar ' + s.papelRotulo.toLowerCase(),
      message: desativar
        ? `${s.nome} deixa de aparecer nas novas apólices. As apólices que já a usam continuam com ela.`
        : `${s.nome} volta a aparecer nas apólices.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    this.servico.alternarSeguradora(s).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? `${s.nome} desativada.` : `${s.nome} ativada.`);
        this.carregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(s: SeguradoraFrota): void {
    this.auditoria().show(s.id, s.nome, {
      idFornecedor: 'Fornecedor', papel: 'Papel', telefoneAssistencia: 'Telefone de assistência', observacao: 'Observação', ativo: 'Status'
    });
  }
}
