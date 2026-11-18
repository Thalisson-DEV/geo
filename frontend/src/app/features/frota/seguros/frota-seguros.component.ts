import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  geoFilter,
  geoListState
} from '@geo/ui';
import { LookupStore } from '../../../core/lookup';
import { Apolice, CoberturaVeiculo, FiltroApolices, SeguradoraFrota, vigenciaApolice } from '../../../core/models/frota-seguro.models';
import { FornecedorFrota, SituacaoVencimento, contar, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaApoliceDrawerComponent, VeiculoSeguro } from './frota-apolice-drawer.component';

type Vigencia = Exclude<SituacaoVencimento, 'SEM_VENCIMENTO'>;
const VIGENCIAS: GeoSelectOption<Vigencia | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Vigentes', value: 'VIGENTE' },
  { label: 'A vencer', value: 'A_VENCER' },
  { label: 'Vencidas', value: 'VENCIDO' }
];

const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/**
 * Seguros da frota: apólices com seguradora, vigência, veículos cobertos e parcelas. A lista abre
 * ordenada pelo fim da vigência, com as que vencem primeiro no topo.
 */
@Component({
  selector: 'app-frota-seguros',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    FrotaApoliceDrawerComponent
  ],
  styles: `
    .valor { font-weight: 700; font-variant-numeric: tabular-nums; }
    .avisos { display: grid; gap: 0.5rem; }
    .aviso { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
    .aviso__texto { flex: 1 1 18rem; min-width: 0; }
  `,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="acesso.editarSeguro()" (newRequested)="novo()">
      <geo-page-header title="Seguros" icon="pi pi-shield" [breadcrumb]="[{ label: 'Frota' }, { label: 'Seguros' }]"
        description="Apólices da frota com seguradora, vigência, veículos cobertos e parcelas pagas pelo financeiro. O fim da vigência avisa pelas faixas da frota e entra na agenda. Atalhos: / busca, F filtros, N nova apólice.">
        <ng-container ngProjectAs="[actions]">
          @if (acesso.editarSeguro()) {
            <geo-button icon="pi pi-plus" label="Cadastrar apólice" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
          }
        </ng-container>
      </geo-page-header>

      @if (semSeguro().length || perdendoCobertura().length) {
        <div class="avisos">
          @if (semSeguro().length) {
            <geo-callout tone="danger" icon="pi pi-exclamation-triangle" [dense]="true"
              [title]="semSeguro().length === 1 ? '1 veículo sem seguro hoje' : semSeguro().length + ' veículos sem seguro hoje'">
              <div class="aviso">
                <span class="aviso__texto">{{ listaPlacas(semSeguro()) }}</span>
                @if (acesso.editarSeguro()) {
                  <geo-button size="sm" variant="outline" icon="pi pi-plus" label="Cadastrar apólice com eles" (pressed)="novo(idsSemSeguro())"></geo-button>
                }
              </div>
            </geo-callout>
          }
          @if (perdendoCobertura().length) {
            <geo-callout tone="warning" icon="pi pi-clock" [dense]="true"
              [title]="perdendoCobertura().length === 1 ? '1 veículo perde a cobertura em breve' : perdendoCobertura().length + ' veículos perdem a cobertura em breve'">
              {{ listaPerdendo() }}. Abra a apólice e use Renovar.
            </geo-callout>
          }
        </div>
      }

      <geo-filter-panel #painel storageKey="frota-seguros" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Vigência" [options]="vigencias" [(value)]="lista.filters.situacao"></geo-select>
          <geo-multiselect label="Seguradora" [options]="opcoesFornecedor()" [(value)]="lista.filters.idsSeguradora" [filter]="true" placeholder="Todas"></geo-multiselect>
          <geo-select label="Veículo coberto" [options]="opcoesVeiculo()" [(value)]="lista.filters.idVeiculo" [filter]="true" [clearable]="true"></geo-select>
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
        </div>
      </geo-filter-panel>

      <geo-data-table title="Apólices" mode="server" [description]="descricao()" [searchable]="true" searchPlaceholder="Buscar número ou segurado"
        storageKey="frota-seguros" exportFileName="frota-apolices" [exportRows]="exportar" [exportLimit]="limiteExportacao"
        [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()" [rowKey]="chave" [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as apólices' : 'Nenhuma apólice cadastrada'"
        [stateDescription]="resultado.error() ?? 'Cadastre as apólices com a seguradora, a vigência e os veículos cobertos.'"
        [emptyActionLabel]="acesso.editarSeguro() ? 'Cadastrar apólice' : undefined" (emptyAction)="novo()"
        noResultsTitle="Nenhuma apólice com esse recorte." [filtered]="lista.filtered()"
        [(query)]="lista.query" [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()" [rowClickable]="true" (rowActivate)="abrir($event)">
        <ng-template geoCell="apolice" let-row>
          <span class="geo-cell-strong">{{ row.numero }}</span>
          <span class="geo-cell-muted">{{ row.seguradora ?? 'Seguradora' }}{{ row.corretor ? ' · corretor ' + row.corretor : '' }}</span>
        </ng-template>
        <ng-template geoCell="vigencia" let-row>
          @let v = vigencia(row);
          <geo-status [tone]="v.tom" [icon]="v.icone">{{ v.rotulo }}</geo-status>
          <span class="geo-cell-muted">{{ row.vigenciaInicio | date: 'dd/MM/yyyy' }} a {{ row.vigenciaFim | date: 'dd/MM/yyyy' }}</span>
        </ng-template>
        <ng-template geoCell="veiculos" let-row>
          @if (row.diasParaComecar > 0) {
            {{ contar(row.veiculos.length, 'veículo', 'veículos', 'Nenhum') }}
            <span class="geo-cell-muted">a partir de {{ row.vigenciaInicio | date: 'dd/MM/yyyy' }}</span>
          } @else {
            {{ contar(row.veiculosHoje, 'veículo', 'veículos', 'Nenhum') }}
          }
          @if (row.veiculos.length === 1) { <span class="geo-cell-muted">{{ placa(row.veiculos[0].placa) }}</span> }
        </ng-template>
        <ng-template geoCell="valor" let-row>
          <span class="valor">{{ moeda(row.valor) }}</span>
          @if (row.franquia) { <span class="geo-cell-muted">Franquia {{ moeda(row.franquia) }}</span> }
        </ng-template>
        <ng-template geoCell="parcelas" let-row>
          @if (row.parcelas.length) {
            {{ pedidas(row) }} de {{ row.parcelas.length }} no financeiro
            @if (vencidasSemPedido(row)) { <geo-status tone="danger" icon="pi pi-exclamation-triangle">{{ vencidasSemPedido(row) }} vencida(s) sem pedido</geo-status> }
          } @else {
            <span class="geo-cell-muted">Sem parcelas</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button icon="pi pi-angle-right" [label]="'Abrir ' + rotulo(row)" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-frota-apolice-drawer [(visivel)]="painelAberto" [apolice]="emEdicao()" [renovacaoDe]="renovacao()" [idsVeiculoIniciais]="idsIniciais()"
      [veiculos]="veiculos()" [fornecedores]="fornecedores()"
      [carregandoFornecedores]="carregandoFornecedores()" [bases]="bases.opcoes()" [processos]="processos()"
      [podeEditar]="acesso.editarSeguro()" [podePedirPagamento]="acesso.solicitarPagamento()"
      (salva)="aoSalvar($event)" (excluida)="aoExcluir()" (renovar)="renovar($event)"></app-frota-apolice-drawer>
  `
})
export class FrotaSegurosComponent {
  private readonly servico = inject(FrotaSeguroService);
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  protected readonly vigencias = VIGENCIAS;
  protected readonly moeda = moeda;
  protected readonly contar = contar;
  protected readonly placa = formatarPlaca;
  protected readonly vigencia = vigenciaApolice;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;

  protected readonly veiculos = signal<VeiculoSeguro[]>([]);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly carregandoFornecedores = signal(true);
  protected readonly painelAberto = signal(false);
  protected readonly emEdicao = signal<Apolice | null>(null);
  protected readonly renovacao = signal<Apolice | null>(null);
  protected readonly idsIniciais = signal<string[]>([]);
  /** Seguro de hoje de cada veículo ativo: alimenta os avisos de sem seguro e de cobertura acabando. */
  private readonly coberturas = signal<CoberturaVeiculo[]>([]);
  protected readonly semSeguro = computed(() => this.coberturas().filter((c) => !c.cobertoHoje));
  protected readonly idsSemSeguro = computed(() => this.semSeguro().map((c) => c.idVeiculo));
  protected readonly perdendoCobertura = computed(() => this.coberturas().filter((c) => c.perdeCoberturaEm));
  protected readonly processos = computed<GeoSelectOption<string>[]>(() => this.lookups.processes().map((p) => ({ label: p.label, value: p.value })));
  /** Filtro de seguradora: as do cadastro de seguradoras (inclusive as desativadas, que ainda têm apólices). */
  private readonly seguradoras = signal<SeguradoraFrota[]>([]);
  protected readonly opcoesFornecedor = computed<GeoSelectOption<string>[]>(() =>
    this.seguradoras().filter((s) => s.papel === 'SEGURADORA').map((s) => ({ label: s.nome, value: s.idFornecedor })));
  protected readonly opcoesVeiculo = computed<GeoSelectOption<string>[]>(() =>
    this.veiculos().map((v) => ({ label: `${formatarPlaca(v.placa)}${v.modelo ? ' · ' + v.modelo : ''}`, value: v.idVeiculo })));

  protected readonly lista = geoListState({
    storageKey: 'frota-seguros',
    rememberFilters: 'frota-seguros',
    filters: {
      situacao: geoFilter.value<Vigencia | null>(null, { label: 'Vigência', options: () => VIGENCIAS }),
      idsSeguradora: geoFilter.list<string>([], {
        label: 'Seguradora', param: 'seguradora',
        itemLabel: (id) => this.seguradoras().find((s) => s.idFornecedor === id)?.nome ?? 'seguradora', countLabel: (n) => `${n} selecionadas`
      }),
      idVeiculo: geoFilter.value<string | null>(null, {
        label: 'Veículo', param: 'veiculo',
        options: () => this.opcoesVeiculo()
      }),
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` })
    },
    sort: [{ key: 'vigenciaFim', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<Apolice>(
    (pedido) => this.servico.listarApolices(this.filtro(pedido.filters, pedido.query), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.servico.listarApolices(this.filtro(this.lista.request().filters, this.lista.request().query), pagina),
    () => this.lista.request()
  );
  protected readonly descricao = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'apólice', 'apólices', 'Nenhuma apólice'));

  protected readonly colunas: GeoDataTableColumn<Apolice>[] = [
    { key: 'apolice', header: 'Apólice', type: 'custom', priority: 1, sortField: 'numero', value: (a) => a.numero, display: (a) => `${a.numero} ${a.seguradora ?? ''}` },
    { key: 'vigencia', header: 'Vigência', type: 'custom', priority: 1, sortField: 'vigenciaFim', value: (a) => a.vigenciaFim, display: (a) => `${vigenciaApolice(a).rotulo} até ${a.vigenciaFim}` },
    { key: 'veiculos', header: 'Veículos hoje', type: 'custom', priority: 2, value: (a) => a.veiculosHoje, display: (a) => String(a.veiculosHoje) },
    { key: 'valor', header: 'Valor', type: 'custom', priority: 2, sortField: 'valor', value: (a) => a.valor, display: (a) => moeda(a.valor) },
    { key: 'parcelas', header: 'Parcelas', type: 'custom', priority: 2, value: (a) => a.parcelas.length, display: (a) => `${this.pedidas(a)} de ${a.parcelas.length}` }
  ];
  protected readonly chave = (a: Apolice) => a.id;
  protected readonly rotulo = (a: Apolice) => `apólice ${a.numero}`;

  constructor() {
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => this.veiculos.set(p.content.map((v) => ({ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo }))),
      error: () => undefined
    });
    this.frota.fornecedoresOficina().subscribe({
      next: (f) => (this.fornecedores.set(f), this.carregandoFornecedores.set(false)),
      error: () => this.carregandoFornecedores.set(false)
    });
    this.carregarCoberturas();
    this.servico.listarSeguradoras().subscribe({ next: (lista) => this.seguradoras.set(lista), error: () => undefined });
    // Aviso de vencimento e agenda abrem a apólice pelo link (?apolice=).
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('apolice');
    if (id) this.servico.buscarApolice(id).subscribe({ next: (a) => this.abrir(a), error: () => undefined });
  }

  protected novo(idsVeiculo: string[] = []): void {
    this.renovacao.set(null);
    this.idsIniciais.set(idsVeiculo);
    this.emEdicao.set(null);
    this.painelAberto.set(true);
  }

  protected abrir(a: Apolice): void {
    this.renovacao.set(null);
    this.emEdicao.set(a);
    this.painelAberto.set(true);
  }

  /** Troca o painel aberto pelo cadastro da renovação, já preenchido a partir da apólice. */
  protected renovar(a: Apolice): void {
    this.emEdicao.set(null);
    this.renovacao.set(a);
  }

  protected aoSalvar(a: Apolice): void {
    if (this.painelAberto()) {
      this.renovacao.set(null);
      this.emEdicao.set(a);
    }
    this.lista.reload();
    this.carregarCoberturas();
  }

  protected aoExcluir(): void {
    this.lista.reload();
    this.carregarCoberturas();
  }

  protected listaPlacas(lista: CoberturaVeiculo[]): string {
    return lista.map((c) => {
      const quando = c.proximaCoberturaEm ? ` (coberto a partir de ${dataBr(c.proximaCoberturaEm)})`
        : c.ultimaCoberturaAte ? ` (sem seguro desde ${dataBr(c.ultimaCoberturaAte)})` : '';
      return `${formatarPlaca(c.placa)}${c.modelo ? ' · ' + c.modelo : ''}${quando}`;
    }).join(' · ');
  }

  protected listaPerdendo(): string {
    return this.perdendoCobertura().map((c) => `${formatarPlaca(c.placa)} em ${dataBr(c.perdeCoberturaEm)} (apólice ${c.numeroApolice})`).join(' · ');
  }

  private carregarCoberturas(): void {
    if (!this.acesso.verSeguro()) return;
    this.servico.coberturaVeiculos().subscribe({ next: (lista) => this.coberturas.set(lista), error: () => undefined });
  }

  protected pedidas(a: Apolice): number {
    return a.parcelas.filter((p) => p.situacaoPagamento === 'SOLICITADO' || p.situacaoPagamento === 'APROVADO').length;
  }

  protected vencidasSemPedido(a: Apolice): number {
    return a.parcelas.filter((p) => p.vencida).length;
  }

  private filtro(f: Record<string, unknown>, busca: string | null | undefined): FiltroApolices {
    return {
      busca: busca || null,
      situacao: f['situacao'] as Vigencia | null,
      idsSeguradora: f['idsSeguradora'] as string[],
      idVeiculo: f['idVeiculo'] as string | null,
      idsBase: f['idsBase'] as string[]
    };
  }
}
