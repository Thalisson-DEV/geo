import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
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
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  GeoTone,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { Observable } from 'rxjs';

import { Fornecedor, FornecedorRequest } from '../../../core/models/financeiro.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

type Curadoria = Fornecedor['status'];

const CURADORIA: GeoSelectOption<Curadoria | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Pendente', value: 'PENDENTE' },
  { label: 'Homologado', value: 'HOMOLOGADO' },
  { label: 'Bloqueado', value: 'BLOQUEADO' }
];
const DISPONIBILIDADE: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Somente utilizáveis', value: true },
  { label: 'Somente indisponíveis', value: false }
];
const ATIVOS: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Ativos', value: true },
  { label: 'Inativos', value: false }
];
const TOM_CURADORIA: Record<Curadoria, GeoTone> = { PENDENTE: 'warning', HOMOLOGADO: 'success', BLOQUEADO: 'danger' };
const ICONE_CURADORIA: Record<Curadoria, string> = { PENDENTE: 'pi-hourglass', HOMOLOGADO: 'pi-verified', BLOQUEADO: 'pi-lock' };

/** `00000000000` / `00000000000000` → CPF / CNPJ formatado. */
export function formatarDocumento(valor?: string | null): string {
  if (!valor) return '';
  const d = valor.replace(/\D/g, '');
  return d.length === 14
    ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

@Component({
  selector: 'app-fornecedores',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
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
    GeoTextareaComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="podeEditar" (newRequested)="novo()">
      <geo-page-header
        title="Fornecedores"
        icon="pi pi-building"
        [breadcrumb]="[{ label: 'Financeiro' }, { label: 'Admin' }, { label: 'Fornecedores' }]"
        description="Cadastro e curadoria (homologação e bloqueio) dos fornecedores usados nas solicitações financeiras."
        helpLabel="Ajuda sobre fornecedores"
        (help)="ajuda.show()"
      >
        @if (podeEditar) {
          <geo-button actions icon="pi pi-plus" label="Novo fornecedor" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel storageKey="fin-fornecedores" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Curadoria" [options]="curadoria" [(value)]="lista.filters.status"></geo-select>
          <geo-select label="Disponibilidade" [options]="disponibilidade" [(value)]="lista.filters.utilizavel"></geo-select>
          <geo-select label="Status" [options]="ativos" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Fornecedores"
        mode="server"
        storageKey="fin-fornecedores"
        exportFileName="fornecedores"
        searchPlaceholder="Nome, razão social ou CPF/CNPJ"
        [rowActionLabel]="podeEditar ? 'Editar' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="podeEditar ? 'Novo fornecedor' : undefined"
        noResultsTitle="Nenhum fornecedor encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os fornecedores' : 'Nenhum fornecedor cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre um fornecedor: só o nome fantasia é obrigatório.'"
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
        (rowActivate)="podeEditar && editar($event)"
      >
        <ng-template geoCell="nome" let-row>
          <span class="geo-cell-strong">{{ row.nomeFantasia }}</span>
          <span class="geo-cell-muted">{{ row.razaoSocial || 'Razão social não informada' }}</span>
        </ng-template>
        <ng-template geoCell="curadoria" let-row>
          <geo-status [tone]="tom(row.status)" [icon]="iconeCuradoria[row.status]">{{ rotuloCuradoria(row.status) }}</geo-status>
          @if (row.motivoBloqueio) {
            <span class="geo-cell-muted">{{ row.motivoBloqueio }}</span>
          }
        </ng-template>
        <ng-template geoCell="utilizavel" let-row>
          <geo-status [tone]="row.utilizavel ? 'success' : 'neutral'" [emphasis]="row.utilizavel ? 'soft' : 'outline'" [icon]="row.utilizavel ? 'pi-check-circle' : 'pi-ban'">
            {{ row.utilizavel ? 'Sim' : 'Não' }}
          </geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (podeHomologar && row.status === 'PENDENTE') {
              <geo-icon-button icon="pi pi-verified" [label]="'Homologar ' + row.nomeFantasia" size="icon-sm" (pressed)="homologar(row)"></geo-icon-button>
            }
            @if (podeHomologar && row.status !== 'BLOQUEADO') {
              <geo-icon-button icon="pi pi-lock" [label]="'Bloquear ' + row.nomeFantasia" size="icon-sm" (pressed)="abrirBloqueio(row)"></geo-icon-button>
            }
            @if (podeHomologar && row.status === 'BLOQUEADO') {
              <geo-icon-button icon="pi pi-lock-open" [label]="'Desbloquear ' + row.nomeFantasia" size="icon-sm" (pressed)="executar(row, 'desbloquear', 'Fornecedor desbloqueado.')"></geo-icon-button>
            }
            @if (podeEditar) {
              <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.nomeFantasia" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            }
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar fornecedor' : 'Novo fornecedor'" [description]="$safeNavigationMigration(emEdicao()?.nomeFantasia)"
      [dirty]="alterado()" size="md">
      <geo-form-section title="Identificação" icon="pi pi-building">
        <geo-text-input label="Nome fantasia" [required]="true" [(value)]="nomeFantasia" [maxlength]="150" placeholder="Nome pelo qual o fornecedor é conhecido" [error]="erro('nome')"></geo-text-input>
        <geo-text-input label="Razão social" [(value)]="razaoSocial" [maxlength]="200" [showOptional]="true" description="Necessária para homologar."></geo-text-input>
        <geo-text-input label="CPF ou CNPJ" [(value)]="documento" [maxlength]="18" [showOptional]="true" placeholder="Somente números ou com máscara"
          description="Necessário para homologar; não pode repetir." [error]="erro('documento')"></geo-text-input>
      </geo-form-section>
      <geo-form-section title="Financeiro" icon="pi pi-wallet">
        <geo-textarea label="Dados bancários" [(value)]="dadosBancarios" [rows]="3" [showOptional]="true" placeholder="Banco, agência, conta, tipo e titular"
          description="Dado sensível: guardado cifrado e não pesquisável."></geo-textarea>
        <geo-textarea label="Observações" [(value)]="observacoes" [rows]="3" [showOptional]="true" placeholder="Informações úteis para a equipe financeira"></geo-textarea>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar fornecedor'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-form-drawer [(visible)]="bloqueioAberto" title="Bloquear fornecedor" [description]="$safeNavigationMigration(emBloqueio()?.nomeFantasia)" [dirty]="!!motivo().trim()" size="sm">
      <geo-callout tone="warning">Novas solicitações não poderão usar este fornecedor até o desbloqueio.</geo-callout>
      <geo-textarea label="Motivo do bloqueio" [required]="true" [(value)]="motivo" [rows]="4" [error]="tentouBloquear() && !motivo().trim() ? 'Informe o motivo.' : undefined"></geo-textarea>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Voltar" (pressed)="bloqueioAberto.set(false)"></geo-button>
        <geo-button variant="destructive" icon="pi pi-lock" label="Confirmar bloqueio" [loading]="salvando()" (pressed)="bloquear()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-ajuda-listagem #ajuda titulo="Fornecedores" entidadePlural="fornecedores" busca="nome, razão social ou CPF/CNPJ" rotuloNovo="Novo fornecedor" [podeCriar]="podeEditar">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-verified"></i> Curadoria</h4>
        <p class="help-text-desc">Cadastros rápidos (só o nome fantasia) nascem pendentes e já podem ser usados. Para homologar, complete razão social e CPF/CNPJ. Bloqueados deixam de aparecer em novas solicitações; o motivo é obrigatório.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-id-card"></i> Busca</h4>
        <p class="help-text-desc">A busca aceita CPF/CNPJ e, por isso, não fica salva no endereço da página.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class FornecedoresComponent {
  private readonly financeiro = inject(FinanceiroService);
  private readonly auth = inject(AuthService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  protected readonly podeEditar = this.temPermissao('financeiro:fornecedor:write');
  protected readonly podeHomologar = this.temPermissao('financeiro:fornecedor:homologar');
  protected readonly curadoria = CURADORIA;
  protected readonly disponibilidade = DISPONIBILIDADE;
  protected readonly ativos = ATIVOS;
  protected readonly formatarDocumento = formatarDocumento;

  protected readonly lista = geoListState({
    storageKey: 'fin-fornecedores',
    // A busca pode ser o CPF de um fornecedor pessoa física: não vai para a URL.
    queryParam: false,
    filters: {
      status: geoFilter.value<Curadoria | null>(null, { label: 'Curadoria', type: 'string', options: () => CURADORIA }),
      utilizavel: geoFilter.value<boolean | null>(null, { label: 'Disponibilidade', options: () => DISPONIBILIDADE }),
      ativo: geoFilter.value<boolean | null>(true, { label: 'Status', options: () => ATIVOS })
    },
    sort: [{ key: 'nome', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<Fornecedor>(
    (pedido) => this.financeiro.listarFornecedores({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.financeiro.listarFornecedores({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<Fornecedor>[] = [
    { key: 'nome', header: 'Fornecedor', type: 'custom', priority: 1, sortField: 'nomeFantasia', value: (f) => f.nomeFantasia, display: (f) => f.nomeFantasia },
    { key: 'documento', header: 'CPF / CNPJ', value: (f) => f.documento, display: (f) => formatarDocumento(f.documento) || '—' },
    { key: 'curadoria', header: 'Curadoria', type: 'custom', priority: 1, sortField: 'status', value: (f) => f.status, display: (f) => this.rotuloCuradoria(f.status) },
    { key: 'utilizavel', header: 'Disponível', type: 'custom', value: (f) => f.utilizavel, display: (f) => (f.utilizavel ? 'Sim' : 'Não') }
  ];
  protected readonly rotulo = (f: Fornecedor) => f.nomeFantasia;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<Fornecedor | null>(null);
  protected readonly nomeFantasia = signal('');
  protected readonly razaoSocial = signal('');
  protected readonly documento = signal('');
  protected readonly dadosBancarios = signal('');
  protected readonly observacoes = signal('');
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const f = this.emEdicao();
    const atual = [this.nomeFantasia(), this.razaoSocial(), this.documento(), this.dadosBancarios(), this.observacoes()];
    const original = [f?.nomeFantasia ?? '', f?.razaoSocial ?? '', f?.documento ?? '', f?.dadosBancarios ?? '', f?.observacoes ?? ''];
    return atual.some((v, i) => v !== original[i]);
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.nomeFantasia().trim()) e['nome'] = 'Informe o nome fantasia.';
    const digitos = this.documento().replace(/\D/g, '');
    if (digitos && digitos.length !== 11 && digitos.length !== 14) e['documento'] = 'Informe um CPF com 11 ou um CNPJ com 14 dígitos.';
    return e;
  });

  protected readonly bloqueioAberto = signal(false);
  protected readonly emBloqueio = signal<Fornecedor | null>(null);
  protected readonly motivo = signal('');
  protected readonly tentouBloquear = signal(false);

  private filtro() {
    const { filters, query } = this.lista.request();
    return {
      buscaGlobal: query || undefined,
      status: filters.status ?? undefined,
      apenasUtilizaveis: filters.utilizavel ?? undefined,
      ativo: filters.ativo ?? undefined
    };
  }

  protected readonly iconeCuradoria: Record<string, string> = ICONE_CURADORIA;

  protected tom(status: Curadoria): GeoTone {
    return TOM_CURADORIA[status] ?? 'neutral';
  }

  protected rotuloCuradoria(status: Curadoria): string {
    return CURADORIA.find((c) => c.value === status)?.label ?? status;
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    if (!this.podeEditar) return;
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(f: Fornecedor): void {
    this.preencher(f);
    this.formularioAberto.set(true);
  }

  private preencher(f: Fornecedor | null): void {
    this.emEdicao.set(f);
    this.nomeFantasia.set(f?.nomeFantasia ?? '');
    this.razaoSocial.set(f?.razaoSocial ?? '');
    this.documento.set(f?.documento ?? '');
    this.dadosBancarios.set(f?.dadosBancarios ?? '');
    this.observacoes.set(f?.observacoes ?? '');
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const request: FornecedorRequest = {
      nomeFantasia: this.nomeFantasia().trim(),
      razaoSocial: this.razaoSocial().trim() || null,
      documento: this.documento().trim() || null,
      dadosBancarios: this.dadosBancarios().trim() || null,
      observacoes: this.observacoes().trim() || null
    };
    this.salvando.set(true);
    const salvar$: Observable<unknown> = atual ? this.financeiro.atualizarFornecedor(atual.id, request) : this.financeiro.criarFornecedor(request);
    salvar$.subscribe({
      next: () => {
        this.formularioAberto.set(false);
        this.concluir(atual ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      },
      error: (e) => this.falhar(e)
    });
  }

  protected homologar(f: Fornecedor): void {
    if (!f.razaoSocial || !f.documento) {
      this.notificacoes.warning('Informe razão social e CPF/CNPJ antes de homologar.');
      if (this.podeEditar) this.editar(f);
      return;
    }
    this.executar(f, 'homologar', 'Fornecedor homologado.');
  }

  protected executar(f: Fornecedor, acao: 'homologar' | 'desbloquear' | 'ativar', mensagem: string): void {
    this.financeiro.acaoFornecedor(f.id, acao).subscribe({ next: () => this.concluir(mensagem), error: (e) => this.falhar(e) });
  }

  protected abrirBloqueio(f: Fornecedor): void {
    this.emBloqueio.set(f);
    this.motivo.set('');
    this.tentouBloquear.set(false);
    this.bloqueioAberto.set(true);
  }

  protected bloquear(): void {
    this.tentouBloquear.set(true);
    const f = this.emBloqueio();
    if (!f || !this.motivo().trim()) return;
    this.salvando.set(true);
    this.financeiro.bloquearFornecedor(f.id, this.motivo().trim()).subscribe({
      next: () => {
        this.bloqueioAberto.set(false);
        this.concluir('Fornecedor bloqueado.');
      },
      error: (e) => this.falhar(e)
    });
  }

  protected async alternar(f: Fornecedor): Promise<void> {
    if (!f.ativo) return this.executar(f, 'ativar', 'Fornecedor ativado.');
    const ok = await this.confirmacao.confirm({
      title: 'Desativar fornecedor',
      message: `${f.nomeFantasia} deixa de aparecer em novas solicitações.`,
      confirmLabel: 'Desativar',
      variant: 'destructive'
    });
    if (!ok) return;
    this.financeiro.desativarFornecedor(f.id).subscribe({ next: () => this.concluir('Fornecedor desativado.'), error: (e) => this.falhar(e) });
  }

  private concluir(mensagem: string): void {
    this.salvando.set(false);
    this.notificacoes.success(mensagem);
    this.lista.reload();
  }

  private falhar(e: unknown): void {
    this.salvando.set(false);
    this.notificacoes.error(getErrorMessage(e));
  }

  private temPermissao(permissao: string): boolean {
    return this.auth.currentUser()?.permissoes?.includes(permissao) ?? false;
  }
}
