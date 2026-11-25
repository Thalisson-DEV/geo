import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
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
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { catchError, of } from 'rxjs';
import { ListaConfiguravel, OpcaoListaResponse } from '../../core/models/listas.models';
import { getErrorMessage } from '../../core/models/shared.models';
import { AuthService } from '../../core/services/auth.service';
import { ListasService } from '../../core/services/listas.service';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../shared/listagem/listagem';
import { AuditDialogComponent } from '../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../shared/listagem/ajuda-listagem.component';

/** O que cada rota informa: a lista, quem altera, a trilha do menu e o ícone. */
export interface DadosRotaLista {
  lista: ListaConfiguravel;
  permissaoEscrita: string;
  trilha: string[];
  icone: string;
  /** Como a lista chama cada opção, para os textos da tela ("motivo", "motivos", "Novo motivo"). */
  singular: string;
  plural: string;
  feminino?: boolean;
}

/**
 * Cadastro de uma lista configurável (motivos de ocorrência, de movimentação, tipos de documento, causas e naturezas).
 * A mesma tela atende todas; cada rota diz qual lista mostra. O código da opção nasce do nome e não muda.
 */
@Component({
  selector: 'app-lista-configuravel',
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
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="podeEscrever" (newRequested)="novo()">
      <geo-page-header
        [title]="titulo()"
        [icon]="dados.icone"
        [breadcrumb]="trilha()"
        [description]="descricao()"
        [helpLabel]="'Ajuda sobre ' + dados.plural"
        (help)="ajuda.show()"
      >
        @if (podeEscrever) {
          <geo-button actions icon="pi pi-plus" [label]="rotuloNovo" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel [storageKey]="chave" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        [title]="tituloTabela"
        mode="server"
        [storageKey]="chave"
        [exportFileName]="chave"
        searchPlaceholder="Nome ou código"
        [rowActionLabel]="podeEscrever ? 'Editar' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="podeEscrever ? rotuloNovo : undefined"
        [noResultsTitle]="'Nenhum resultado com esse recorte.'"
        [columns]="colunas()"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar ' + artigoPlural + ' ' + dados.plural : 'Nenhum cadastro ainda'"
        [stateDescription]="resultado.error() ?? 'Sem opção ativa, o formulário que usa esta lista fica sem escolha.'"
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
        <ng-template geoCell="rotulo" let-row>
          <span>{{ row.rotulo }}</span>
          @if (row.sistema) { <geo-status tone="info" icon="pi pi-lock" class="lc-sistema">Usada pelo sistema</geo-status> }
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativa' : 'Inativa' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
          @if (podeEscrever) {
              <geo-icon-button icon="pi pi-chevron-up" [label]="'Subir ' + row.rotulo" size="icon-sm" (pressed)="mover(row, -1)"></geo-icon-button>
              <geo-icon-button icon="pi pi-chevron-down" [label]="'Descer ' + row.rotulo" size="icon-sm" (pressed)="mover(row, 1)"></geo-icon-button>
              @if (row.ativo && !row.sistema) {
                <geo-icon-button icon="pi pi-ban" [label]="'Desativar ' + row.rotulo" size="icon-sm" (pressed)="desativar(row)"></geo-icon-button>
              } @else if (!row.ativo) {
                <geo-icon-button icon="pi pi-check-circle" [label]="'Reativar ' + row.rotulo" size="icon-sm" (pressed)="reativar(row)"></geo-icon-button>
              }
          }
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.rotulo" size="icon-sm" (pressed)="historico(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="aberto" [title]="emEdicao() ? 'Editar ' + dados.singular : rotuloNovo" [description]="emEdicao()?.rotulo ?? undefined" [dirty]="alterado()" size="sm">
      <geo-form-section [title]="'Dados d' + (dados.feminino ? 'a ' : 'o ') + dados.singular" [icon]="dados.icone">
        <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="80" [readonly]="!podeEscrever"
          description="Como aparece no web e no app. Pode ser corrigido depois." [error]="tentou() && !nome().trim() ? 'Informe o nome.' : undefined"></geo-text-input>
        <geo-textarea label="Descrição" [(value)]="texto" [rows]="2" [maxlength]="255" [showOptional]="true" [readonly]="!podeEscrever"></geo-textarea>
        @if (contextos().length) {
          <geo-multiselect label="Vale para" placeholder="Todos" [options]="contextos()" [(value)]="usos" display="chip" [maxSelectedLabels]="10" [readonly]="!podeEscrever"
            description="Onde a opção aparece. Sem marcar, aparece em todos."></geo-multiselect>
        }
        @if (emEdicao(); as e) {
          <p class="lc-codigo">Código gravado nos registros: <code>{{ e.codigo }}</code></p>
        }
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" [label]="podeEscrever ? 'Cancelar' : 'Fechar'" (pressed)="aberto.set(false)"></geo-button>
        @if (podeEscrever) {
          <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar ' + dados.singular" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        }
      </div>
    </geo-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda [titulo]="titulo()" [entidadePlural]="dados.plural" [artigoPlural]="artigoPlural" busca="nome ou código"
      [rotuloNovo]="rotuloNovo" [podeCriar]="podeEscrever"></app-ajuda-listagem>
  `,
  styles: `
    .lc-sistema { margin-left: 0.5rem; }
    .lc-codigo { margin: 0.25rem 0 0; color: var(--geo-foreground-muted); font-size: 0.75rem; }
  `
})
export class ListaConfiguravelComponent {
  private readonly servico = inject(ListasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  protected readonly dados = inject(ActivatedRoute).snapshot.data as DadosRotaLista;
  protected readonly podeEscrever = (inject(AuthService).currentUser()?.permissoes ?? []).includes(this.dados.permissaoEscrita);
  protected readonly chave = 'lista-' + this.dados.lista.toLowerCase().replace(/_/g, '-');
  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly rotulo = (o: OpcaoListaResponse) => o.rotulo;
  protected readonly rotuloNovo = (this.dados.feminino ? 'Nova ' : 'Novo ') + this.dados.singular;
  protected readonly artigoPlural: 'os' | 'as' = this.dados.feminino ? 'as' : 'os';
  protected readonly tituloTabela = this.dados.plural.charAt(0).toUpperCase() + this.dados.plural.slice(1);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  private readonly descritor = toSignal(this.servico.descrever(this.dados.lista).pipe(catchError(() => of(null))), { initialValue: null });
  protected readonly titulo = computed(() => this.descritor()?.rotulo ?? this.tituloTabela);
  protected readonly descricao = computed(() => this.descritor()?.descricao ?? '');
  protected readonly trilha = computed(() => [...this.dados.trilha.map((label) => ({ label })), { label: this.titulo() }]);
  protected readonly contextos = computed<GeoSelectOption<string>[]>(() =>
    (this.descritor()?.contextos ?? []).map((c) => ({ label: c.rotulo, value: c.codigo })));
  protected readonly colunas = computed<GeoDataTableColumn<OpcaoListaResponse>[]>(() => {
    const nomes = new Map(this.contextos().map((c) => [c.value, c.label]));
    return [
      { key: 'ordem', header: 'Ordem', width: '6rem', sortField: 'ordem', display: (o) => String(o.ordem) },
      { key: 'rotulo', header: 'Nome', type: 'custom', priority: 1, sortField: 'rotulo', value: (o) => o.rotulo, display: (o) => o.rotulo },
      ...(nomes.size ? [{ key: 'contextos', header: 'Vale para', width: '12rem', display: (o: OpcaoListaResponse) =>
        o.contextos?.length ? o.contextos.map((c) => nomes.get(c) ?? c).join(', ') : 'Todos' }] : []),
      { key: 'descricao', header: 'Descrição', display: (o) => o.descricao || '—' },
      { key: 'ativo', header: 'Status', type: 'custom', width: '7rem', sortField: 'ativo', value: (o) => o.ativo, display: (o) => (o.ativo ? 'Ativa' : 'Inativa') }
    ];
  });

  protected readonly lista = geoListState({
    storageKey: this.chave,
    filters: {
      ativo: geoFilter.value<boolean | null>(true, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'ordem', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<OpcaoListaResponse>(
    (pedido) => this.servico.listar(this.dados.lista, { ...this.filtro(), ...(paginaPadrao(pedido) as { page: number; size: number; sort?: string }) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = exportacaoPadrao(
    (pagina) => this.servico.listar(this.dados.lista, { ...this.filtro(), ...(pagina as { page: number; size: number; sort?: string }) }),
    () => this.lista.request()
  );

  protected readonly aberto = signal(false);
  protected readonly emEdicao = signal<OpcaoListaResponse | null>(null);
  protected readonly nome = signal('');
  protected readonly texto = signal('');
  protected readonly usos = signal<string[]>([]);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly alterado = computed(() => {
    const o = this.emEdicao();
    const usos = [...this.usos()].sort().join(',');
    return o
      ? this.nome() !== o.rotulo || this.texto() !== (o.descricao ?? '') || usos !== [...(o.contextos ?? [])].sort().join(',')
      : !!(this.nome() + this.texto()).trim() || !!usos;
  });

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ativo: filters.ativo ?? undefined, buscaGlobal: query || undefined };
  }

  protected novo(): void {
    if (!this.podeEscrever) return;
    this.preencher(null);
  }

  protected editar(o: OpcaoListaResponse): void {
    this.preencher(o);
  }

  private preencher(o: OpcaoListaResponse | null): void {
    this.emEdicao.set(o);
    this.nome.set(o?.rotulo ?? '');
    this.texto.set(o?.descricao ?? '');
    this.usos.set(o?.contextos ?? []);
    this.tentou.set(false);
    this.aberto.set(true);
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (!this.nome().trim()) return;
    const atual = this.emEdicao();
    const request = { rotulo: this.nome().trim(), descricao: this.texto().trim() || undefined, contextos: this.usos() };
    this.salvando.set(true);
    (atual ? this.servico.atualizar(this.dados.lista, atual.id, request) : this.servico.criar(this.dados.lista, request)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.aberto.set(false);
        const nome = this.tituloTabela.replace(/s$/, '');
        this.notificacoes.success(atual ? `${nome} atualizad${this.dados.feminino ? 'a' : 'o'}.` : `${nome} cadastrad${this.dados.feminino ? 'a' : 'o'}.`);
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected mover(o: OpcaoListaResponse, delta: -1 | 1): void {
    this.servico.mover(this.dados.lista, o.id, delta).subscribe({
      next: () => this.lista.reload(),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async desativar(o: OpcaoListaResponse): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Desativar ' + this.dados.singular,
      message: `"${o.rotulo}" deixa de aparecer nas escolhas. Os registros que já usam continuam mostrando o nome.`,
      confirmLabel: 'Desativar',
      variant: 'destructive'
    });
    if (!ok) return;
    this.servico.desativar(this.dados.lista, o.id).subscribe({
      next: () => {
        this.notificacoes.success('Opção desativada.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected historico(o: OpcaoListaResponse): void {
    this.auditoria().show(o.id, 'Opção de lista', { rotulo: 'Nome', descricao: 'Descrição', ordem: 'Ordem', contextos: 'Vale para', ativo: 'Ativa' });
  }

  protected reativar(o: OpcaoListaResponse): void {
    this.servico.reativar(this.dados.lista, o.id).subscribe({
      next: () => {
        this.notificacoes.success('Opção reativada.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }
}
