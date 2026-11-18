import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { GeoAutocompleteComponent } from '@geo/ui/forms';

import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../core/lookup/store/remote-lookup';
import { ProcessoNegocioResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AtividadeSstResponse } from '../../../core/models/sst-evento.models';
import { AuthService } from '../../../core/services/auth.service';
import { RhService } from '../../../core/services/rh.service';
import { SstService } from '../../../core/services/sst.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { LIMITE_EXPORTACAO, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

const SITUACOES: GeoSelectOption<boolean | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Ativas', value: true },
  { label: 'Desativadas', value: false }
];

/**
 * Atividades sob as quais um evento de SST acontece — trajeto, detonação, poda.
 *
 * O gestor é **opcional aqui e obrigatório no evento**: a carga inicial trouxe as atividades do
 * contrato antes de se saber quem responde por cada uma. Enquanto a atividade estiver sem gestor,
 * o registro do evento cobra o responsável.
 */
@Component({
  selector: 'app-sst-atividades',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    GeoAutocompleteComponent,
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
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="podeEscrever" (newRequested)="novo()">
      <geo-page-header
        title="Atividades de SST"
        icon="pi pi-briefcase"
        [breadcrumb]="[{ label: 'SST' }, { label: 'Atividades de SST' }]"
        description="Atividades sob as quais os eventos de SST acontecem, com o gestor e o processo sugeridos no registro do evento."
        helpLabel="Ajuda sobre atividades de SST"
        (help)="ajuda.show()"
      >
        @if (podeEscrever) {
          <geo-button actions icon="pi pi-plus" label="Nova atividade" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel storageKey="sst-atividades" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Situação" [options]="situacoes" [(value)]="lista.filters.ativo"></geo-select>
          <geo-autocomplete label="Gestor" placeholder="Todos" [clearable]="true" [options]="colaboradores()" [loading]="colaboradoresLoading()"
            [status]="colaboradoresStatus()" [error]="colaboradoresError()" [minLength]="2" [virtualScroll]="true" [virtualScrollItemSize]="38"
            [ngModel]="lista.filters.idGestor()" (ngModelChange)="lista.filters.idGestor.set($event ?? null)"
            (search)="buscarColaboradores($event)" (loadMore)="colaboradorLookup.loadNext()" (retry)="colaboradorLookup.retry()"></geo-autocomplete>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Atividades de SST"
        mode="server"
        storageKey="sst-atividades"
        exportFileName="atividades-sst"
        searchPlaceholder="Nome ou descrição da atividade"
        [rowActionLabel]="podeEscrever ? 'Editar' : undefined"
        rowActionIcon="pi pi-pencil"
        [emptyActionLabel]="podeEscrever ? 'Nova atividade' : undefined"
        noResultsTitle="Nenhuma atividade encontrada com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as atividades' : 'Nenhuma atividade ativa'"
        [stateDescription]="resultado.error() ?? 'Para ver as desativadas, remova a situação nos filtros.'"
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
        <ng-template geoCell="nome" let-row>
          <span class="geo-cell-strong">{{ row.nome }}</span>
          <span class="geo-cell-muted">{{ row.descricao || '—' }}</span>
        </ng-template>
        <ng-template geoCell="gestor" let-row>
          @if (row.nomeGestor) {
            {{ row.nomeGestor }}
          } @else {
            <geo-status tone="warning" icon="pi-exclamation-circle" emphasis="outline">Definir no evento</geo-status>
          }
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativa' : 'Desativada' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          @if (podeEscrever) {
            <span class="geo-table-actions">
              <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
                size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            </span>
          }
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar atividade de SST' : 'Nova atividade de SST'"
      [description]="emEdicao()?.nome" [dirty]="alterado()" size="md">
      <geo-form-section title="Atividade" icon="pi pi-briefcase">
        <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="120" placeholder="Ex.: Poda de árvores"
          description="Use o nome pelo qual a atividade é reconhecida pelas equipes." [error]="tentouSalvar() && !nome().trim() ? 'Informe o nome.' : undefined"></geo-text-input>
        <geo-textarea label="Descrição" [(value)]="descricao" [rows]="3" [maxlength]="500" [showOptional]="true"
          placeholder="Descreva brevemente o escopo da atividade"></geo-textarea>
      </geo-form-section>
      <geo-form-section title="Sugestões para o evento" icon="pi pi-lightbulb">
        <geo-autocomplete label="Gestor responsável" placeholder="Selecione o gestor padrão" [clearable]="true" [options]="colaboradores()"
          [loading]="colaboradoresLoading()" [status]="colaboradoresStatus()" [error]="colaboradoresError()" [minLength]="2"
          [virtualScroll]="true" [virtualScrollItemSize]="38" description="Se ficar vazio, o gestor será obrigatório no registro do evento."
          [ngModel]="idGestor()" (ngModelChange)="idGestor.set($event ?? null)"
          (search)="buscarColaboradores($event)" (loadMore)="colaboradorLookup.loadNext()" (retry)="colaboradorLookup.retry()"></geo-autocomplete>
        <geo-select label="Processo" [options]="processosOpcoes()" [(value)]="idProcesso" [filter]="true" [clearable]="true" [showOptional]="true"
          placeholder="Selecione o processo relacionado" description="Sugerido automaticamente nos novos eventos."></geo-select>
        <geo-callout tone="info" [dense]="true">Mudanças de gestor ou processo valem só para registros futuros; eventos existentes mantêm o contexto original.</geo-callout>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar atividade'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-ajuda-listagem #ajuda titulo="Atividades de SST" entidadePlural="atividades" artigoPlural="as" busca="nome ou descrição"
      rotuloNovo="Nova atividade" [podeCriar]="podeEscrever">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-info-circle"></i> Gestor e processo</h4>
        <p class="help-text-desc">O gestor é opcional aqui: atividades sem gestor exigem o responsável no registro do evento. Desativar tira a atividade das novas seleções, mas os eventos antigos continuam mostrando-a.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class AtividadesSstComponent {
  private readonly sst = inject(SstService);
  private readonly rh = inject(RhService);
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  protected readonly podeEscrever = inject(AuthService).currentUser()?.permissoes?.includes('sst:catalogo:write') ?? false;

  protected readonly situacoes = SITUACOES;
  protected readonly processos = signal<ProcessoNegocioResponse[]>([]);
  protected readonly processosOpcoes = computed(() => this.processos().map((p) => ({ label: p.nome, value: p.id })));

  protected readonly lista = geoListState({
    storageKey: 'sst-atividades',
    filters: {
      ativo: geoFilter.value<boolean | null>(true, { label: 'Situação', param: 'situacao', options: () => SITUACOES }),
      idGestor: geoFilter.value<string | null>(null, {
        label: 'Gestor',
        param: 'gestor',
        format: (id): string | null => (id ? this.nomeGestor(id) : null)
      })
    },
    sort: [{ key: 'nome', direction: 'asc' }]
  });

  // Formulário (declarado antes do lookup, que preserva as opções selecionadas).
  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<AtividadeSstResponse | null>(null);
  protected readonly nome = signal('');
  protected readonly descricao = signal('');
  protected readonly idGestor = signal<string | null>(null);
  protected readonly idProcesso = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly tentouSalvar = signal(false);

  protected readonly colaboradorLookup = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: (): string[] => [this.lista.filters.idGestor() as string | null, this.idGestor()].filter((id): id is string => !!id),
    destroyRef: inject(DestroyRef)
  });
  protected readonly colaboradores = this.colaboradorLookup.items;
  protected readonly colaboradoresLoading = this.colaboradorLookup.loading;
  protected readonly colaboradoresStatus = this.colaboradorLookup.status;
  protected readonly colaboradoresError = () => {
    const erro = this.colaboradorLookup.error();
    return erro ? getErrorMessage(erro) : undefined;
  };

  protected readonly resultado = this.lista.results<AtividadeSstResponse>(
    (pedido) => this.sst.listarAtividadesSst({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.sst.listarAtividadesSst({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<AtividadeSstResponse>[] = [
    { key: 'nome', header: 'Atividade', type: 'custom', priority: 1, sortField: 'nome', value: (a) => a.nome, display: (a) => `${a.nome} ${a.descricao ?? ''}` },
    { key: 'gestor', header: 'Gestor responsável', type: 'custom', priority: 1, value: (a) => a.nomeGestor, display: (a) => a.nomeGestor ?? 'Definir no evento' },
    { key: 'processo', header: 'Processo', display: (a) => a.nomeProcesso || '—' },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (a) => a.ativo, display: (a) => (a.ativo ? 'Ativa' : 'Desativada') }
  ];
  protected readonly rotulo = (a: AtividadeSstResponse) => a.nome;
  protected readonly alterado = computed(() => {
    const a = this.emEdicao();
    return a
      ? this.nome() !== a.nome || this.descricao() !== (a.descricao ?? '') || this.idGestor() !== a.idGestor || this.idProcesso() !== a.idProcesso
      : !!(this.nome() + this.descricao()).trim() || !!this.idGestor() || !!this.idProcesso();
  });

  constructor() {
    this.rh.listarProcessosAtivos().subscribe({ next: (r) => this.processos.set(r.content), error: () => undefined });
  }

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ativo: filters.ativo, idGestor: filters.idGestor, buscaGlobal: query || null };
  }

  private nomeGestor(id: string): string {
    return this.colaboradorLookup.items().find((o) => o.value === id)?.label ?? 'gestor selecionado';
  }

  protected buscarColaboradores(termo: string): void {
    this.colaboradorLookup.search(termo);
  }

  protected novo(): void {
    if (!this.podeEscrever) return;
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(item: AtividadeSstResponse): void {
    this.preencher(item);
    if (item.idGestor && item.nomeGestor) this.colaboradorLookup.seedSelected({ value: item.idGestor, label: item.nomeGestor });
    this.formularioAberto.set(true);
  }

  private preencher(a: AtividadeSstResponse | null): void {
    this.emEdicao.set(a);
    this.nome.set(a?.nome ?? '');
    this.descricao.set(a?.descricao ?? '');
    this.idGestor.set(a?.idGestor ?? null);
    this.idProcesso.set(a?.idProcesso ?? null);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (this.salvando() || !this.nome().trim()) return;
    const atual = this.emEdicao();
    const request = {
      nome: this.nome().trim(),
      descricao: this.descricao().trim() || null,
      idGestor: this.idGestor(),
      idProcesso: this.idProcesso()
    };
    this.salvando.set(true);
    (atual ? this.sst.atualizarAtividadeSst(atual.id, request) : this.sst.criarAtividadeSst(request)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(`Atividade ${request.nome} salva.`);
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Desativar não apaga: a atividade some das opções e segue legível nos eventos antigos. */
  protected async alternar(item: AtividadeSstResponse): Promise<void> {
    const desativar = item.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar atividade' : 'Reativar atividade',
      message: desativar ? `${item.nome} sai das novas seleções; os eventos antigos continuam mostrando-a.` : `${item.nome} volta às seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Reativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.sst.desativarAtividadeSst(item.id) : this.sst.ativarAtividadeSst(item.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Atividade desativada.' : 'Atividade reativada.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }
}
