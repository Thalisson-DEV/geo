import { ICONE_VENCIMENTO } from '../../../core/models/frota.models';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  GeoAutocompleteComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoRowActionsDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  LookupOption,
  LookupStatus,
  NotificationService,
  GeoTone,
  geoFilter,
  geoListState
} from '@geo/ui';
import { LookupStore } from '../../../core/lookup';
import {
  CategoriaCnh,
  Condutor,
  OpcoesFrota,
  ROTULO_VENCIMENTO,
  SituacaoVencimento,
  TOM_VENCIMENTO,
  VinculoCondutor,
  contar,
  deDataIso,
  descreverPrazo,
  formatarPlaca,
  paraDataIso
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, OPCOES_CADASTRO, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';

@Component({
  selector: 'app-frota-condutores',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    GeoAutocompleteComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoRowActionsDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="acesso.editarCondutor()" (newRequested)="novo()">
      <geo-page-header
        title="Condutores"
        icon="pi pi-id-card"
        [breadcrumb]="[{ label: 'Frota' }, { label: 'Condutores' }]"
        description="Colaboradores habilitados a dirigir a frota, com a CNH e o veículo que conduzem agora. CNH vencida impede novo vínculo. Atalhos: / busca, F filtros, N novo condutor."
      >
        @if (acesso.editarCondutor()) {
          <geo-button actions icon="pi pi-plus" label="Novo condutor" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel
        #painel
        storageKey="frota-condutores"
        [activeCount]="lista.activeCount()"
        [summary]="lista.summary()"
        [loading]="resultado.loading()"
        (applied)="lista.apply()"
        (cleared)="lista.reset()"
        (chipRemoved)="lista.remove($any($event))"
      >
        <div class="geo-filter-grid">
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Categoria" [options]="categorias()" [(value)]="lista.filters.categorias" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-select label="CNH" [options]="situacoesCnh" [(value)]="lista.filters.situacaoCnh" [clearable]="true" placeholder="Todas"></geo-select>
          <geo-select label="Cadastro" [options]="cadastroOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Condutores"
        mode="server"
        [description]="descricaoTabela()"
        searchPlaceholder="Nome ou número completo da CNH"
        storageKey="frota-condutores"
        exportFileName="frota-condutores"
        [rowActionLabel]="acesso.editarCondutor() ? 'Atualizar CNH' : 'Ver histórico'"
        [rowActionIcon]="acesso.editarCondutor() ? 'pi pi-pencil' : 'pi pi-history'"
        [emptyActionLabel]="acesso.editarCondutor() ? 'Novo condutor' : undefined"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowKey]="chave"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os condutores' : 'Nenhum condutor cadastrado'"
        [stateDescription]="resultado.error() ?? 'Para habilitar alguém, use Novo condutor.'"
        noResultsTitle="Nenhum condutor encontrado com esse recorte."
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
        (rowActivate)="acesso.editarCondutor() ? editar($event) : abrirHistorico($event)"
      >
        <ng-template geoCell="nome" let-row>
          <span class="geo-cell-strong">{{ row.nome ?? '—' }}</span>
          <span class="geo-cell-muted">{{ row.funcao }} · {{ row.baseOperacional }}</span>
        </ng-template>
        <ng-template geoCell="cnh" let-row>
          <span class="geo-cell-strong">{{ row.cnhCategoria ?? '—' }}</span>
          <span class="geo-cell-muted">{{ row.cnhNumeroMascarado }}</span>
        </ng-template>
        <ng-template geoCell="cnhValidade" let-row>
          <span class="geo-cell-strong">{{ row.cnhValidade | date: 'dd/MM/yyyy' }}</span>
          @if (row.situacaoCnh !== 'VIGENTE') {
            <span class="geo-cell-muted">{{ prazo(row.diasParaVencerCnh) }}</span>
          }
        </ng-template>
        <ng-template geoCell="situacaoCnh" let-row>
          <geo-status [tone]="tom[row.situacaoCnh]" [icon]="icone[row.situacaoCnh]">{{ rotuloVencimento[row.situacaoCnh] }}</geo-status>
          @if (!row.ativo) {
            <geo-status tone="neutral" emphasis="outline" icon="pi-history">Retirado</geo-status>
          }
        </ng-template>
        <ng-template geoCell="placaAtual" let-row>
          @if (row.placaAtual) {
            <span class="geo-cell-strong">{{ placa(row.placaAtual) }}</span>
            <span class="geo-cell-muted">desde {{ row.conduzDesde | date: 'dd/MM/yyyy' }}</span>
          } @else {
            <span class="geo-cell-muted">Sem veículo</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (acesso.editarCondutor()) {
              <geo-icon-button icon="pi pi-history" [label]="'Veículos conduzidos por ' + row.nome" tooltip="Histórico de veículos" size="icon-sm"
                (pressed)="abrirHistorico(row)"></geo-icon-button>
              @if (row.ativo) {
                <geo-icon-button icon="pi pi-user-minus" [label]="'Retirar ' + row.nome + ' dos condutores'" tooltip="Retirar dos condutores"
                  size="icon-sm" (pressed)="desativar(row)"></geo-icon-button>
              }
            }
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Atualizar CNH' : 'Novo condutor'"
      [description]="emEdicao() ? emEdicao()!.nome + '. O número da CNH é guardado cifrado e aparece mascarado nas telas.' : 'Registre a CNH de um colaborador para ele poder conduzir veículos da frota.'"
      [dirty]="alterado()" [loading]="salvando()" size="md">
      <geo-form-section title="Habilitação" icon="pi pi-id-card">
        @if (!emEdicao()) {
          <geo-autocomplete label="Colaborador" [required]="true" [options]="opcoesColaborador()" [status]="statusBusca()"
            [loading]="statusBusca() === 'loading'" [ngModel]="idColaborador()" (ngModelChange)="idColaborador.set($event)" (search)="buscarColaborador($event)"
            [error]="erroCampo('colaborador')"></geo-autocomplete>
        }
        <div class="geo-form-grid">
          <geo-text-input label="Número da CNH" [required]="true" [(value)]="cnhNumero" [maxlength]="14"
            [description]="emEdicao() ? 'Digite os 11 dígitos novamente para confirmar.' : '11 dígitos, só números.'"
            [error]="erroCampo('numero')"></geo-text-input>
          <geo-select label="Categoria" [required]="true" [options]="categorias()" [(value)]="cnhCategoria" [error]="erroCampo('categoria')"></geo-select>
          <geo-datepicker label="Validade" [required]="true" [(value)]="cnhValidade" [error]="erroCampo('validade')"></geo-datepicker>
          <geo-datepicker label="Primeira habilitação" [(value)]="primeiraHabilitacao" [clearable]="true" [maxDate]="hoje" [showOptional]="true"></geo-datepicker>
        </div>
        <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="1000" [showOptional]="true"></geo-textarea>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar condutor'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-form-drawer [(visible)]="historicoAberto" title="Histórico de veículos"
      [description]="(historicoDe()?.nome ?? '') + ' — períodos em que foi o condutor responsável.'" size="md">
      <geo-data-table caption="Histórico de veículos" [searchable]="false" [columns]="colunasHistorico" [rows]="historico()"
        [rowKey]="chaveVinculo" [state]="carregandoHistorico() ? 'loading' : historico().length ? 'ready' : 'empty'"
        stateTitle="Nenhum veículo conduzido ainda">
        <ng-template geoCell="placa" let-row><span class="geo-cell-strong">{{ placa(row.placa) }}</span></ng-template>
        <ng-template geoCell="inicio" let-row>{{ row.inicio | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
        <ng-template geoCell="fim" let-row>
          @if (row.fim) {
            {{ row.fim | date: 'dd/MM/yyyy HH:mm' }}
          } @else {
            <geo-status tone="success" icon="pi-check-circle">Atual</geo-status>
          }
        </ng-template>
      </geo-data-table>
    </geo-form-drawer>
  `
})
export class FrotaCondutoresComponent {
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();

  protected readonly tom: Record<string, GeoTone> = TOM_VENCIMENTO;
  protected readonly icone: Record<string, string> = ICONE_VENCIMENTO;
  protected readonly rotuloVencimento: Record<string, string> = ROTULO_VENCIMENTO;
  protected readonly prazo = descreverPrazo;
  protected readonly placa = formatarPlaca;
  protected readonly hoje = new Date();

  protected readonly bases = basesFrota();
  protected readonly cadastroOpcoes = OPCOES_CADASTRO;
  protected readonly opcoes = signal<OpcoesFrota | null>(null);

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<Condutor | null>(null);
  protected readonly idColaborador = signal<string | null>(null);
  protected readonly cnhNumero = signal('');
  protected readonly cnhCategoria = signal<CategoriaCnh | null>(null);
  protected readonly cnhValidade = signal<Date | null>(null);
  protected readonly primeiraHabilitacao = signal<Date | null>(null);
  protected readonly observacao = signal('');
  protected readonly salvando = signal(false);
  protected readonly tentouSalvar = signal(false);
  protected readonly opcoesColaborador = signal<LookupOption<string>[]>([]);
  protected readonly statusBusca = signal<LookupStatus>('idle');

  protected readonly historicoAberto = signal(false);
  protected readonly historicoDe = signal<Condutor | null>(null);
  protected readonly historico = signal<VinculoCondutor[]>([]);
  protected readonly carregandoHistorico = signal(false);

  protected readonly situacoesCnh: GeoSelectOption<SituacaoVencimento>[] = (
    ['VENCIDO', 'A_VENCER', 'VIGENTE'] as SituacaoVencimento[]
  ).map((s) => ({ label: ROTULO_VENCIMENTO[s], value: s }));
  protected readonly categorias = computed<GeoSelectOption<CategoriaCnh>[]>(() =>
    (this.opcoes()?.categoriasCnh ?? []).map((c) => ({ label: c.rotulo, value: c.valor }))
  );

  /** A busca aceita o número da CNH: por isso não vai para a URL (`queryParam: false`). */
  protected readonly lista = geoListState({
    storageKey: 'frota-condutores',
    rememberFilters: 'frota-condutores',
    queryParam: false,
    filters: {
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      categorias: geoFilter.list<CategoriaCnh>([], { label: 'Categoria', param: 'categoria', countLabel: (n) => `${n} selecionadas` }),
      situacaoCnh: geoFilter.value<SituacaoVencimento | null>(null, { label: 'CNH', param: 'cnh', options: () => this.situacoesCnh }),
      ativo: geoFilter.value<boolean | null>(true, { label: 'Cadastro', options: () => OPCOES_CADASTRO })
    },
    sort: [{ key: 'cnhValidade', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<Condutor>(
    (pedido) => this.frota.listarCondutores(this.filtro(), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.frota.listarCondutores(this.filtro(), pagina),
    () => this.lista.request()
  );
  protected readonly descricaoTabela = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'condutor', 'condutores', 'Nenhum condutor')
  );
  /** Algo digitado no formulário: fechar pede confirmação para não perder o que foi preenchido. */
  protected readonly alterado = computed(
    () => !!this.cnhNumero().trim() || (!this.emEdicao() && !!this.idColaborador())
  );

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.emEdicao() && !this.idColaborador()) e['colaborador'] = 'Escolha o colaborador.';
    if (this.cnhNumero().replace(/\D/g, '').length !== 11) e['numero'] = 'A CNH tem 11 dígitos.';
    if (!this.cnhCategoria()) e['categoria'] = 'Escolha a categoria.';
    if (!this.cnhValidade()) e['validade'] = 'Informe a validade.';
    return e;
  });

  protected readonly colunas: GeoDataTableColumn<Condutor>[] = [
    { key: 'nome', header: 'Condutor', type: 'custom', priority: 1, value: (c) => c.nome, display: (c) => c.nome ?? '' },
    { key: 'cnh', header: 'CNH', type: 'custom', sortField: 'cnhCategoria', value: (c) => c.cnhCategoria, display: (c) => `${c.cnhCategoria ?? ''} ${c.cnhNumeroMascarado ?? ''}` },
    { key: 'cnhValidade', header: 'Validade da CNH', type: 'custom', sortField: 'cnhValidade', value: (c) => c.cnhValidade ?? '9999', display: (c) => c.cnhValidade ?? '' },
    { key: 'situacaoCnh', header: 'Situação', type: 'custom', priority: 1, value: (c) => c.diasParaVencerCnh ?? 99999, display: (c) => ROTULO_VENCIMENTO[c.situacaoCnh] },
    { key: 'placaAtual', header: 'Conduz agora', type: 'custom', value: (c) => c.placaAtual, display: (c) => c.placaAtual ?? 'Sem veículo' }
  ];
  protected readonly colunasHistorico: GeoDataTableColumn<VinculoCondutor>[] = [
    { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, value: (v) => v.placa, display: (v) => v.placa ?? '' },
    { key: 'inicio', header: 'Início', type: 'custom', value: (v) => v.inicio, display: (v) => v.inicio },
    { key: 'fim', header: 'Fim', type: 'custom', value: (v) => v.fim ?? '9999', display: (v) => v.fim ?? 'Atual' }
  ];
  protected readonly chave = (c: Condutor) => c.id;
  protected readonly rotulo = (c: Condutor) => c.nome ?? 'condutor';
  protected readonly chaveVinculo = (v: VinculoCondutor) => v.id;

  constructor() {
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    this.abrirCondutorDoLink();
    effect(() => {
      if (!this.formularioAberto()) untracked(() => this.tentouSalvar.set(false));
    });
  }

  /**
   * Aberta com ?condutor=<colaborador> (o mapa da frota aponta a CNH vencida de quem dirige): abre
   * a CNH desse condutor para atualizar, ou o histórico de veículos para quem só consulta.
   */
  private abrirCondutorDoLink(): void {
    const id = this.rota.snapshot.queryParamMap.get('condutor');
    if (!id) return;
    void this.router.navigate([], { relativeTo: this.rota, queryParams: { condutor: null }, queryParamsHandling: 'merge', replaceUrl: true });
    this.frota.buscarCondutor(id).subscribe({
      next: (c) => (this.acesso.editarCondutor() ? this.editar(c) : this.abrirHistorico(c)),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private filtro() {
    const pedido = this.lista.request();
    return { ...pedido.filters, busca: pedido.query || null };
  }

  protected erroCampo(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected buscarColaborador(termo: string): void {
    this.statusBusca.set('loading');
    this.lookups.searchCollaborators({ query: termo, limit: 20 }).subscribe({
      next: (pagina) => {
        this.opcoesColaborador.set(pagina.items);
        this.statusBusca.set(pagina.items.length ? 'success' : 'empty');
      },
      error: () => this.statusBusca.set('error')
    });
  }

  protected novo(): void {
    this.emEdicao.set(null);
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(condutor: Condutor): void {
    this.emEdicao.set(condutor);
    this.preencher(condutor);
    this.formularioAberto.set(true);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const idColaborador = this.emEdicao()?.idColaborador ?? this.idColaborador()!;
    this.salvando.set(true);
    this.frota
      .registrarCnh(idColaborador, {
        cnhNumero: this.cnhNumero().replace(/\D/g, ''),
        cnhCategoria: this.cnhCategoria()!,
        cnhValidade: paraDataIso(this.cnhValidade())!,
        cnhPrimeiraHabilitacao: paraDataIso(this.primeiraHabilitacao()),
        observacao: this.observacao().trim() || null
      })
      .subscribe({
        next: (c) => {
          this.salvando.set(false);
          this.formularioAberto.set(false);
          this.notificacoes.success(`CNH de ${c.nome ?? 'colaborador'} salva.`);
          this.lista.reload();
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
  }

  protected async desativar(condutor: Condutor): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Retirar dos condutores',
      message: `${condutor.nome} deixa de aparecer como condutor e não pode mais ser vinculado a veículos. O histórico continua guardado.`,
      confirmLabel: 'Retirar condutor',
      variant: 'destructive'
    });
    if (!ok) return;
    this.frota.desativarCondutor(condutor.idColaborador).subscribe({
      next: () => {
        this.notificacoes.success(`${condutor.nome} retirado dos condutores.`);
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected abrirHistorico(condutor: Condutor): void {
    this.historicoDe.set(condutor);
    this.historico.set([]);
    this.historicoAberto.set(true);
    this.carregandoHistorico.set(true);
    this.frota.historicoVeiculosCondutor(condutor.idColaborador).subscribe({
      next: (p) => {
        this.historico.set(p.content);
        this.carregandoHistorico.set(false);
      },
      error: (e) => {
        this.carregandoHistorico.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private preencher(c: Condutor | null): void {
    this.tentouSalvar.set(false);
    this.idColaborador.set(null);
    this.opcoesColaborador.set([]);
    this.statusBusca.set('idle');
    this.cnhNumero.set('');
    this.cnhCategoria.set(c?.cnhCategoria ?? null);
    this.cnhValidade.set(deDataIso(c?.cnhValidade));
    this.primeiraHabilitacao.set(deDataIso(c?.cnhPrimeiraHabilitacao));
    this.observacao.set(c?.observacao ?? '');
  }
}
