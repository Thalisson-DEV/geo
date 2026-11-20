import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoImportDrawerComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  geoFilter,
  geoImportStatus,
  geoListState
} from '@geo/ui';
import { LookupStore } from '../../../core/lookup';
import {
  DespesaImportacaoLinha,
  DespesaVeiculo,
  FiltroDespesas,
  FormaPagamentoDespesa,
  ROTULO_FORMA_PAGAMENTO,
  ResumoDespesas,
  TipoDespesa,
  pagamentoDespesa
} from '../../../core/models/frota-despesa.models';
import { FornecedorFrota, contar, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaDespesaService } from '../../../core/services/frota-despesa.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaDespesaFormComponent, VeiculoDespesa } from './frota-despesa-form.component';

type Pagamento = 'FALTA_PEDIR' | 'SOLICITADO' | 'APROVADO' | 'REPROVADO';
const PAGAMENTOS: GeoSelectOption<Pagamento | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Falta pedir o pagamento', value: 'FALTA_PEDIR' },
  { label: 'Pagamento solicitado', value: 'SOLICITADO' },
  { label: 'Pagamento aprovado', value: 'APROVADO' },
  { label: 'Pagamento reprovado', value: 'REPROVADO' }
];
const FORMAS: GeoSelectOption<FormaPagamentoDespesa | null>[] = [
  { label: 'Todas', value: null },
  ...(Object.keys(ROTULO_FORMA_PAGAMENTO) as FormaPagamentoDespesa[]).map((f) => ({ label: ROTULO_FORMA_PAGAMENTO[f], value: f }))
];

/** Primeiro dia do mês corrente (yyyy-mm-dd): a lista abre no mês, como o fechamento de custos. */
function inicioDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Despesas por veículo: lavagens, pedágios, estacionamentos, mensalidades, taxas e outras. Abre no
 * mês corrente, com o total do recorte e o que falta mandar ao financeiro; lança, corrige e importa
 * a planilha do modelo GEO.
 */
@Component({
  selector: 'app-frota-despesas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoImportDrawerComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    FrotaDespesaFormComponent
  ],
  styles: `
    .resumo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(0, 1.6fr); gap: 0.75rem; }
    @media (max-width: 1100px) { .resumo { grid-template-columns: repeat(2, minmax(0, 1fr)); } .resumo__tipos { grid-column: 1 / -1; } }
    @media (max-width: 640px) { .resumo { grid-template-columns: minmax(0, 1fr); } }
    .resumo__valor { font-size: 1.5rem; line-height: 1.2; }
    .resumo__valor--aviso { color: var(--geo-warning-text); }
    .resumo__acao { margin-top: 0.25rem; font-size: var(--geo-font-caption); font-weight: 600; color: var(--geo-brand); }
    .resumo__atalho[aria-pressed='true'] { border-color: var(--geo-warning); box-shadow: inset 3px 0 0 var(--geo-warning), var(--geo-shadow-sm); }
    .tipos { list-style: none; margin: 0.375rem 0 0; padding: 0; display: grid; gap: 0.125rem; }
    .tipo { display: grid; gap: 0.25rem; width: 100%; padding: 0.3125rem 0.5rem; margin: 0 -0.5rem; box-sizing: content-box;
      border: 0; border-radius: var(--geo-radius-sm); background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
    .tipo:hover { background: var(--geo-surface-subtle); }
    .tipo:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .tipo[aria-pressed='true'] { background: var(--geo-brand-soft); }
    .tipo__linha { display: flex; justify-content: space-between; gap: 0.75rem; font-size: var(--geo-font-caption); }
    .tipo__nome { font-weight: 600; color: var(--geo-foreground); }
    .tipo__valor { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .tipo__qtd { margin-left: 0.25rem; font-weight: 500; color: var(--geo-foreground-subtle); }
    .tipo__barra { display: block; height: 0.375rem; border-radius: 999px; background: var(--geo-surface-muted); overflow: hidden; }
    .tipo__barra > span { display: block; height: 100%; min-width: 0.375rem; border-radius: inherit; background: var(--geo-brand); transition: width 240ms ease; }
    .correcao { display: grid; grid-template-columns: repeat(3, minmax(6rem, 1fr)); gap: 0.5rem; }
    .valor { font-weight: 600; font-variant-numeric: tabular-nums; }
  `,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="acesso.editarDespesa()" (newRequested)="novo()">
      <geo-page-header title="Despesas por veículo" icon="pi pi-receipt" [breadcrumb]="[{ label: 'Frota' }, { label: 'Despesas' }]"
        description="Lavagem, pedágio, estacionamento, mensalidade, taxa e outras despesas lançadas por veículo. A pagar, vão ao financeiro já preenchidas. Atalhos: / busca, F filtros, N nova despesa.">
        <ng-container ngProjectAs="[actions]">
          @if (acesso.editarDespesa()) {
            <geo-button variant="outline" icon="pi pi-upload" label="Importar planilha" (pressed)="importacao.aberta.set(true)"></geo-button>
            <geo-button icon="pi pi-plus" label="Lançar despesa" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
          }
        </ng-container>
      </geo-page-header>

      @if (resumo(); as r) {
        <section class="resumo" aria-label="Totais do recorte">
          <div class="geo-kpi" data-tone="info">
            <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-wallet"></i></span>
            <span class="geo-kpi__body">
              <span class="geo-kpi__label">Total no recorte</span>
              <span class="geo-kpi__value resumo__valor">{{ moeda(r.total) }}</span>
              <span class="geo-kpi__detail">{{ contar(r.quantidade, 'despesa', 'despesas', 'Nenhuma despesa') }}{{ periodo() }}</span>
              @if (r.quantidade > 1) {
                <span class="geo-kpi__detail">Média de {{ moeda(r.total / r.quantidade) }} por despesa</span>
              }
            </span>
          </div>

          <button type="button" class="geo-kpi resumo__atalho" [attr.data-tone]="r.aPagarSemSolicitacao ? 'warning' : 'success'"
            [attr.aria-pressed]="lista.applied().pagamento === 'FALTA_PEDIR'" (click)="alternarFaltaPedir()"
            [attr.aria-label]="lista.applied().pagamento === 'FALTA_PEDIR' ? 'Mostrar todas as despesas' : 'Mostrar só as despesas que falta pedir o pagamento'">
            <span class="geo-kpi__icon" aria-hidden="true"><i class="pi" [class.pi-clock]="r.aPagarSemSolicitacao" [class.pi-check-circle]="!r.aPagarSemSolicitacao"></i></span>
            <span class="geo-kpi__body">
              <span class="geo-kpi__label">Falta pedir o pagamento</span>
              <span class="geo-kpi__value resumo__valor" [class.resumo__valor--aviso]="r.aPagarSemSolicitacao">{{ moeda(r.valorAPagarSemSolicitacao) }}</span>
              <span class="geo-kpi__detail">
                {{ r.aPagarSemSolicitacao ? contar(r.aPagarSemSolicitacao, 'despesa a pagar', 'despesas a pagar', '') + ' ainda sem solicitação no financeiro' : 'Tudo o que é a pagar já foi ao financeiro' }}
              </span>
              @if (r.aPagarSemSolicitacao) {
                <span class="resumo__acao">{{ lista.applied().pagamento === 'FALTA_PEDIR' ? 'Mostrando só essas · ver todas' : 'Ver só essas' }}</span>
              }
            </span>
            <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
          </button>

          <div class="geo-kpi resumo__tipos" data-tone="info">
            <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-chart-bar"></i></span>
            <span class="geo-kpi__body">
              <span class="geo-kpi__label">Onde foi o dinheiro</span>
              @let tiposResumo = porTipo() ?? r.porTipo;
              @let totalTipos = somaTipos(tiposResumo);
              @if (tiposResumo.length) {
                <ul class="tipos">
                  @for (t of tiposResumo.slice(0, 5); track t.idTipo) {
                    @let fatia = totalTipos ? t.total / totalTipos : 0;
                    <li>
                      <button type="button" class="tipo" [attr.aria-pressed]="tipoSelecionado(t.idTipo)" (click)="alternarTipo(t.idTipo)"
                        [attr.aria-label]="t.tipo + ': ' + moeda(t.total) + ', ' + porcento(fatia) + ' do total. ' + (tipoSelecionado(t.idTipo) ? 'Mostrar todos os tipos' : 'Mostrar só este tipo')">
                        <span class="tipo__linha">
                          <span class="tipo__nome">{{ t.tipo }} <span class="tipo__qtd">{{ t.quantidade }}</span></span>
                          <span class="tipo__valor">{{ moeda(t.total) }} <span class="tipo__qtd">{{ porcento(fatia) }}</span></span>
                        </span>
                        <span class="tipo__barra" aria-hidden="true"><span [style.width.%]="fatia * 100"></span></span>
                      </button>
                    </li>
                  }
                </ul>
                @if (tiposResumo.length > 5) {
                  <span class="geo-kpi__detail">E mais {{ contar(tiposResumo.length - 5, 'tipo', 'tipos', '') }} no filtro Tipo.</span>
                }
              } @else {
                <span class="geo-kpi__detail">Os tipos aparecem aqui quando houver despesas no recorte.</span>
              }
            </span>
          </div>
        </section>
      }

      <geo-filter-panel #painel storageKey="frota-despesas" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-datepicker label="De" [value]="dataLocal(lista.filters.de())" [clearable]="true" (valueChange)="lista.filters.de.set(dataIso($event))"></geo-datepicker>
          <geo-datepicker label="Até" [value]="dataLocal(lista.filters.ate())" [clearable]="true" (valueChange)="lista.filters.ate.set(dataIso($event))"></geo-datepicker>
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Tipo" [options]="opcoesTipo()" [(value)]="lista.filters.idsTipo" placeholder="Todos"></geo-multiselect>
          <geo-select label="Forma" [options]="formas" [(value)]="lista.filters.forma"></geo-select>
          <geo-select label="Pagamento" [options]="pagamentos" [(value)]="lista.filters.pagamento"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table title="Despesas" mode="server" [description]="descricao()" [searchable]="true" searchPlaceholder="Buscar placa"
        storageKey="frota-despesas" exportFileName="frota-despesas" [exportRows]="exportar" [exportLimit]="limiteExportacao"
        [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()" [rowKey]="chave" [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as despesas' : 'Nenhuma despesa no período'"
        [stateDescription]="resultado.error() ?? 'Lance as lavagens, pedágios e demais despesas de cada veículo, ou importe a planilha.'"
        [emptyActionLabel]="acesso.editarDespesa() ? 'Lançar despesa' : undefined" (emptyAction)="novo()"
        noResultsTitle="Nenhuma despesa com esse recorte." [filtered]="lista.filtered()"
        [(query)]="lista.query" [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()" [rowClickable]="true" (rowActivate)="abrir($event)">
        <ng-template geoCell="data" let-row>{{ row.data | date: 'dd/MM/yyyy' }}</ng-template>
        <ng-template geoCell="veiculo" let-row>
          <span class="geo-cell-strong">{{ placa(row.placa) }}</span>
          <span class="geo-cell-muted">{{ row.baseNome ?? 'Sem base' }}</span>
        </ng-template>
        <ng-template geoCell="tipo" let-row>
          <span class="geo-cell-strong">{{ row.tipo }}{{ row.subtipo ? ' · ' + row.subtipo : '' }}</span>
          @if (row.descricao) { <span class="geo-cell-muted">{{ row.descricao }}</span> }
        </ng-template>
        <ng-template geoCell="valor" let-row><span class="valor">{{ moeda(row.valor) }}</span></ng-template>
        <ng-template geoCell="fornecedor" let-row>
          {{ row.fornecedorNome ?? '—' }}
          @if (row.documentoTipoRotulo) { <span class="geo-cell-muted">{{ row.documentoTipoRotulo }} {{ row.documentoNumero }}</span> }
        </ng-template>
        <ng-template geoCell="pagamento" let-row>
          @let p = pagamento(row);
          <geo-status [tone]="p.tom" [icon]="p.icone">{{ p.rotulo }}</geo-status>
          @if (row.numeroSolicitacaoFinanceira) { <span class="geo-cell-muted">Solicitação nº {{ row.numeroSolicitacaoFinanceira }}</span> }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (row.anexos.length) {
              <geo-icon-button icon="pi pi-paperclip" [label]="row.anexos.length + ' comprovante(s) de ' + rotulo(row)"
                [tooltip]="row.anexos.length === 1 ? '1 comprovante' : row.anexos.length + ' comprovantes'" size="icon-sm" (pressed)="abrir(row)"></geo-icon-button>
            }
            @if (acesso.solicitarPagamento() && row.podePedirPagamento) {
              <geo-icon-button icon="pi pi-send" [label]="'Pedir o pagamento de ' + rotulo(row)" tooltip="Pedir pagamento" size="icon-sm"
                (pressed)="pedirPagamento(row)"></geo-icon-button>
            }
            <geo-icon-button icon="pi pi-angle-right" [label]="'Abrir ' + rotulo(row)" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-frota-despesa-form [(visivel)]="formularioAberto" [despesa]="emEdicao()" [veiculos]="veiculos()" [tipos]="tipos()"
      [fornecedores]="fornecedores()" [carregandoFornecedores]="carregandoFornecedores()" [bases]="bases.opcoes()" [processos]="processos()"
      [podePedirPagamento]="acesso.solicitarPagamento()" (salva)="aoSalvar($event)" (excluida)="recarregar()"></app-frota-despesa-form>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar despesas" description="Planilha CSV no modelo GEO (separada por ponto e vírgula). Com o id externo, reimportar atualiza em vez de duplicar."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()" [blockOnErrors]="true"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="despesa" let-row>
            @if (row.editing) {
              <span class="correcao">
                <geo-text-input label="Placa" [value]="row.placa ?? ''" (valueChange)="row.placa = $event"></geo-text-input>
                <geo-text-input label="Data" placeholder="dd/mm/aaaa" [value]="row.data ?? ''" (valueChange)="row.data = $event"></geo-text-input>
                <geo-text-input label="Tipo" [value]="row.tipo ?? ''" (valueChange)="row.tipo = $event"></geo-text-input>
              </span>
            } @else {
              <span class="geo-cell-strong">{{ row.placa ?? '—' }} · {{ row.tipo ?? '—' }}{{ row.subtipo ? ' · ' + row.subtipo : '' }}</span>
              <span class="geo-cell-muted">{{ row.data ?? 'sem data' }}{{ row.fornecedor ? ' · ' + row.fornecedor : '' }}</span>
            }
          </ng-template>
          <ng-template geoCell="valor" let-row>
            @if (row.editing) {
              <geo-text-input label="Valor" [labelVisible]="false" [value]="row.valor ?? ''" (valueChange)="row.valor = $event"></geo-text-input>
            } @else {
              {{ row.valor ?? '—' }}
            }
          </ng-template>
          <ng-template geoCell="status" let-row>
            @let s = statusImportacao(row.status);
            <geo-status [tone]="s.tone" [icon]="s.icon">{{ s.label }}</geo-status>
            <span class="geo-cell-muted">{{ row.mensagemErro ?? row.acao }}</span>
          </ng-template>
          <ng-template geoRowActions let-row>
            <span class="geo-table-actions">
              @if (row.editing) {
                <geo-icon-button icon="pi pi-check" [label]="'Concluir correção da linha ' + row.linha" size="icon-sm" (pressed)="concluirCorrecao(row)"></geo-icon-button>
              } @else {
                <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir linha ' + row.linha" size="icon-sm" (pressed)="row.editing = true"></geo-icon-button>
                <geo-icon-button icon="pi pi-trash" [label]="'Remover linha ' + row.linha" size="icon-sm" (pressed)="importacao.remover(row)"></geo-icon-button>
              }
            </span>
          </ng-template>
        </geo-data-table>
      }
    </geo-import-drawer>
  `
})
export class FrotaDespesasComponent {
  private readonly servico = inject(FrotaDespesaService);
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  protected readonly formas = FORMAS;
  protected readonly pagamentos = PAGAMENTOS;
  protected readonly moeda = moeda;
  protected readonly contar = contar;
  protected readonly placa = formatarPlaca;
  protected readonly pagamento = pagamentoDespesa;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly statusImportacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;

  protected readonly tipos = signal<TipoDespesa[]>([]);
  protected readonly veiculos = signal<VeiculoDespesa[]>([]);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly carregandoFornecedores = signal(true);
  protected readonly resumo = signal<ResumoDespesas | null>(null);
  /** Com tipo filtrado, a divisão por tipo ignora esse filtro: os outros tipos continuam à vista para trocar. */
  protected readonly porTipo = signal<ResumoDespesas['porTipo'] | null>(null);
  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<DespesaVeiculo | null>(null);
  protected readonly processos = computed<GeoSelectOption<string>[]>(() => this.lookups.processes().map((p) => ({ label: p.label, value: p.value })));
  protected readonly opcoesTipo = computed<GeoSelectOption<string>[]>(() => this.tipos().map((t) => ({ label: t.nome, value: t.id })));

  protected readonly lista = geoListState({
    storageKey: 'frota-despesas',
    rememberFilters: 'frota-despesas',
    filters: {
      de: geoFilter.date(inicioDoMes(), { label: 'De' }),
      ate: geoFilter.date(null, { label: 'Até' }),
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      idsTipo: geoFilter.list<string>([], { label: 'Tipo', param: 'tipo', itemLabel: (id) => this.tipos().find((t) => t.id === id)?.nome ?? 'tipo', countLabel: (n) => `${n} selecionados` }),
      forma: geoFilter.value<FormaPagamentoDespesa | null>(null, { label: 'Forma', options: () => FORMAS }),
      pagamento: geoFilter.value<Pagamento | null>(null, { label: 'Pagamento', options: () => PAGAMENTOS })
    },
    sort: [{ key: 'data', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<DespesaVeiculo>(
    (pedido) => this.servico.listar(this.filtro(pedido.filters, pedido.query), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.servico.listar(this.filtro(this.lista.request().filters, this.lista.request().query), pagina),
    () => this.lista.request()
  );
  protected readonly importacao = importacaoListagem<DespesaImportacaoLinha>({
    enviar: (arquivo) => this.servico.validarImportacao(arquivo),
    confirmar: (linhas) => this.servico.confirmarImportacao(linhas),
    modelo: () => this.servico.modelo().subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'modelo-despesas-frota.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }),
    aoProcessar: () => this.recarregar()
  });

  protected readonly descricao = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'despesa', 'despesas', 'Nenhuma despesa'));
  protected readonly periodo = computed(() => {
    const { de, ate } = this.lista.applied();
    const fmt = (iso: string) => iso.split('-').reverse().join('/');
    if (de && ate) return ` de ${fmt(de)} a ${fmt(ate)}`;
    if (de) return ` desde ${fmt(de)}`;
    if (ate) return ` até ${fmt(ate)}`;
    return '';
  });

  protected readonly colunas: GeoDataTableColumn<DespesaVeiculo>[] = [
    { key: 'data', header: 'Data', type: 'custom', priority: 1, sortField: 'data', value: (d) => d.data, display: (d) => d.data },
    { key: 'veiculo', header: 'Veículo', type: 'custom', priority: 1, value: (d) => d.placa, display: (d) => formatarPlaca(d.placa) },
    { key: 'tipo', header: 'Despesa', type: 'custom', priority: 1, value: (d) => d.tipo, display: (d) => `${d.tipo}${d.subtipo ? ' ' + d.subtipo : ''}` },
    { key: 'valor', header: 'Valor', type: 'custom', priority: 1, sortField: 'valor', value: (d) => d.valor, display: (d) => moeda(d.valor) },
    { key: 'fornecedor', header: 'Quem recebeu', type: 'custom', priority: 2, value: (d) => d.fornecedorNome, display: (d) => d.fornecedorNome ?? '' },
    { key: 'pagamento', header: 'Pagamento', type: 'custom', priority: 1, value: (d) => d.situacaoPagamento ?? d.formaPagamento, display: (d) => pagamentoDespesa(d).rotulo }
  ];
  protected readonly colunasImportacao: GeoDataTableColumn<DespesaImportacaoLinha>[] = [
    { key: 'linha', header: 'Linha', display: (l) => String(l.linha) },
    { key: 'despesa', header: 'Despesa', type: 'custom', value: (l) => l.placa, display: (l) => `${l.placa} ${l.tipo}` },
    { key: 'valor', header: 'Valor', type: 'custom', value: (l) => l.valor, display: (l) => l.valor ?? '—' },
    { key: 'status', header: 'Situação', type: 'custom', value: (l) => l.status, display: (l) => l.mensagemErro ?? l.acao ?? '' }
  ];
  protected readonly chave = (d: DespesaVeiculo) => d.id;
  protected readonly rotulo = (d: DespesaVeiculo) => `${d.tipo.toLowerCase()} do ${formatarPlaca(d.placa)}`;

  constructor() {
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    this.servico.tipos(false).subscribe({ next: (t) => this.tipos.set(t), error: () => undefined });
    this.frota.listarVeiculos({ ativo: true }, PAGINA_OPCOES).subscribe({
      next: (p) => this.veiculos.set(p.content.map((v) => ({ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo, idBaseOperacional: v.idBaseOperacional }))),
      error: () => undefined
    });
    this.frota.fornecedoresOficina().subscribe({
      next: (f) => (this.fornecedores.set(f), this.carregandoFornecedores.set(false)),
      error: () => this.carregandoFornecedores.set(false)
    });
    // Os totais seguem o recorte aplicado (filtros e busca).
    effect(() => {
      const { filters, query } = this.lista.request();
      untracked(() => this.carregarResumo(filters, query));
    });
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('despesa');
    if (id) this.servico.buscar(id).subscribe({ next: (d) => this.abrir(d), error: () => undefined });
  }

  protected novo(): void {
    this.emEdicao.set(null);
    this.formularioAberto.set(true);
  }

  protected abrir(d: DespesaVeiculo): void {
    this.emEdicao.set(d);
    this.formularioAberto.set(true);
  }

  /** Atalho da linha: abre o pagamento no financeiro já preenchido com a despesa. */
  protected pedirPagamento(d: DespesaVeiculo): void {
    void this.router.navigate(['/financeiro', 'pagamentos', 'nova'], { queryParams: { origem: 'FROTA_DESPESA', origemId: d.id } });
  }

  /** A linha corrigida volta a "Pronta"; ao processar, o servidor confere tudo de novo e não grava nada se ainda houver erro. */
  protected concluirCorrecao(linha: DespesaImportacaoLinha): void {
    if (linha.status === 'COM_ERRO') {
      linha.status = 'AGUARDANDO_PROCESSAMENTO';
      linha.mensagemErro = null;
      linha.acao = 'Corrigida; confere de novo ao processar';
    }
    this.importacao.concluirCorrecao(linha);
  }

  protected aoSalvar(d: DespesaVeiculo): void {
    if (this.formularioAberto()) this.emEdicao.set(d);
    this.recarregar();
  }

  protected recarregar(): void {
    this.lista.reload();
    this.carregarResumo(this.lista.request().filters, this.lista.request().query);
  }

  protected readonly porcento = (fatia: number) => `${Math.round(fatia * 100)}%`;

  protected somaTipos(tipos: ResumoDespesas['porTipo']): number {
    return tipos.reduce((soma, t) => soma + t.total, 0);
  }

  protected tipoSelecionado(id: string): boolean {
    const ids = this.lista.applied().idsTipo;
    return ids.length === 1 && ids[0] === id;
  }

  /** Clicar num tipo do resumo filtra a lista por ele; clicar de novo volta a todos. */
  protected alternarTipo(id: string): void {
    if (this.tipoSelecionado(id)) this.lista.remove('idsTipo');
    else this.lista.set('idsTipo', [id]);
  }

  protected alternarFaltaPedir(): void {
    if (this.lista.applied().pagamento === 'FALTA_PEDIR') this.lista.remove('pagamento');
    else this.lista.set('pagamento', 'FALTA_PEDIR');
  }

  private carregarResumo(filters: Record<string, unknown>, query: string): void {
    this.servico.resumo(this.filtro(filters, query)).subscribe({ next: (r) => this.resumo.set(r), error: () => this.resumo.set(null) });
    if (!(filters['idsTipo'] as string[]).length) {
      this.porTipo.set(null);
      return;
    }
    this.servico.resumo(this.filtro({ ...filters, idsTipo: [] }, query)).subscribe({
      next: (r) => this.porTipo.set(r.porTipo),
      error: () => this.porTipo.set(null)
    });
  }

  private filtro(f: Record<string, unknown>, busca: string | null | undefined): FiltroDespesas {
    const pagamento = f['pagamento'] as Pagamento | null;
    return {
      busca: busca || null,
      de: f['de'] as string | null,
      ate: f['ate'] as string | null,
      idsBase: f['idsBase'] as string[],
      idsTipo: f['idsTipo'] as string[],
      formaPagamento: pagamento === 'FALTA_PEDIR' ? null : (f['forma'] as FormaPagamentoDespesa | null),
      situacaoPagamento: pagamento && pagamento !== 'FALTA_PEDIR' ? pagamento : null,
      semPagamento: pagamento === 'FALTA_PEDIR' ? true : null
    };
  }
}
