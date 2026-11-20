import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoChartComponent,
  GeoChartSeries,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoDrillStateService,
  GeoFilterChip,
  GeoFilterPanelComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent
} from '@geo/ui';

import {
  DIMENSOES_FILTRO_FINANCEIRO,
  DashboardFinanceiroFilter,
  DashboardFinanceiroResponse,
  GranularidadeDashboard,
  GrauPrioridade,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS_SOLICITACAO,
  ROTULO_TIPO_DESPESA,
  RankingFinanceiroItem,
  TipoDespesa
} from '../../../core/models/financeiro-dashboard.models';
import { FormularioResumo, Fornecedor, SolicitacaoFinanceira, StatusSolicitacao } from '../../../core/models/financeiro.models';
import { ContratoResponse } from '../../../core/models/contrato.models';
import { BaseOperacionalResponse, ProcessoNegocioResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ContratoService } from '../../../core/services/contrato.service';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { RhService } from '../../../core/services/rh.service';
import { normalizarSelecao } from '../../../core/utils/http-params.util';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { atualizarPeriodicamente } from '../../../shared/components/dashboard/atualizacao-automatica';
import { DashboardAnaliseComponent } from '../../../shared/components/dashboard/dashboard-analise.component';
import { AlvoAnalise, VistaAnalise } from '../../../shared/components/dashboard/dashboard-analise.models';
import { NavegacaoAnaliseService } from '../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardMetricCardComponent } from '../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardVisaoGerencialComponent } from '../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { toSaoPauloIso } from '../../../shared/utils/dashboard-date.utils';
import {
  CopilotoAreaComponent,
  CopilotoDashboardContext,
  CopilotoGatilhoComponent,
  CopilotoPainelService,
  CopilotoPerguntarComponent,
  filtroPainel,
  graficoPainel,
  metricaPainel,
  periodoPainel,
  rotuloDasOpcoes
} from '../../copiloto/painel';
import {
  CartaoFinanceiro,
  DIMENSOES_RANKING,
  DimensaoRanking,
  PendenciaFinanceira,
  ROTA_LISTAGEM_GESTAO,
  RegistrosAcao,
  cartoesFinanceiros,
  diaDe,
  filaDeDecisao,
  leiturasFinanceiras,
  nomeDoItem,
  paramsDaListagem,
  pendenciasFinanceiras,
  rankingDe,
  recorteNaListagem,
  somarDias,
  totalALiquidar,
  vereditoFinanceiro
} from './analise-financeiro';
import { formatarMoeda, formatarPercentual, plural, umaCasa } from './financeiro-dashboard-insights';
import { graficoVencimentos, vistaFinanceiro } from './vistas-financeiro';

type SerieModo = 'periodo' | 'acumulado';
type PeriodoRapido = 'mensal' | 'trimestral' | 'anual';

/** Acima disto, um ranking em barras vira ruído em vez de comparação. */
const MAX_BARRAS_NO_GRAFICO = 10;
/** Quantos registros cada consulta de "o que pede ação" traz para escolher os mais graves. */
const AMOSTRA_ACAO = 40;

/**
 * Painel do financeiro, lido como um gestor: veredito do recorte, o que pede ação hoje (com link
 * para o registro), quatro números que levam à análise e gráficos que respondem para onde vai o
 * dinheiro, onde a fila trava e o que vence a seguir. A análise detalhada (`?drill=`) fica em
 * `vistas-financeiro.ts`; as regras de leitura, em `analise-financeiro.ts`.
 */
@Component({
  selector: 'app-dashboard-financeiro',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoCellDirective, GeoChartComponent, GeoDataTableComponent,
    GeoDatepickerComponent, GeoFilterPanelComponent, GeoMultiSelectComponent, GeoPageHeaderComponent, GeoSelectComponent, GeoStatusComponent,
    DashboardAnaliseComponent, DashboardMetricCardComponent, DashboardVisaoGerencialComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  providers: [GeoDrillStateService, NavegacaoAnaliseService],
  templateUrl: './dashboard-financeiro.component.html',
  styleUrl: './dashboard-financeiro.component.css'
})
export class DashboardFinanceiroComponent implements OnInit {
  private readonly financeiro = inject(FinanceiroService);
  private readonly rh = inject(RhService);
  private readonly contratos = inject(ContratoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly copiloto = inject(CopilotoPainelService);
  protected readonly analise = inject(NavegacaoAnaliseService);
  protected readonly copilotoDisponivel = this.copiloto.disponivelParaUsuario();

  private readonly formularioLookup = new RemoteLookup<FormularioResumo>(
    {
      identify: (formulario) => formulario.id,
      selectedKeys: () => this.filter.idFormulario ?? [],
      load: ({ query, page, size }) => this.financeiro.listarFormularios({ ativo: true, buscaGlobal: query, page, size, sort: 'titulo,asc' })
    },
    this.destroyRef
  );
  private readonly baseLookup = new RemoteLookup<BaseOperacionalResponse>(
    {
      identify: (base) => base.id,
      selectedKeys: () => this.filter.idBase ?? [],
      load: ({ query, page, size }) => this.rh.listarBasesOperacionais({ ativo: true, buscaGlobal: query, page, size, sort: 'nome,asc' })
    },
    this.destroyRef
  );
  private readonly processoLookup = new RemoteLookup<ProcessoNegocioResponse>(
    {
      identify: (processo) => processo.id,
      selectedKeys: () => this.filter.idProcesso ?? [],
      load: ({ query, page, size }) => this.rh.listarProcessos({ ativo: true, buscaGlobal: query, page, size, sort: 'nome,asc' })
    },
    this.destroyRef
  );
  private readonly obraLookup = new RemoteLookup<ContratoResponse>(
    {
      identify: (obra) => obra.id,
      selectedKeys: () => this.filter.idObra ?? [],
      load: ({ query, page, size }) => this.contratos.listarContratos({ ativo: true, buscaGlobal: query, page, size, sort: 'numeroContrato,asc' })
    },
    this.destroyRef
  );
  private readonly fornecedorLookup = new RemoteLookup<Fornecedor>(
    {
      identify: (fornecedor) => fornecedor.id,
      selectedKeys: () => this.filter.idFornecedor ?? [],
      load: ({ query, page, size }) => this.financeiro.listarFornecedores({ ativo: true, buscaGlobal: query, page, size, sort: 'nomeFantasia,asc' })
    },
    this.destroyRef
  );

  // ------------------------------------------------------------------ estado

  protected readonly loading = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly data = signal<DashboardFinanceiroResponse | null>(null);
  protected readonly atualizadoEm = signal<Date | null>(null);
  protected readonly registros = signal<RegistrosAcao | null>(null);
  protected readonly registrosCarregando = signal(false);
  /** Dia de gestão (São Paulo) em que os números foram lidos. */
  private readonly hoje = signal(diaDe(new Date()));
  protected readonly periodoAtivo = signal<PeriodoRapido | ''>('');
  protected readonly periodoInvalido = signal(false);
  protected readonly serieModo = signal<SerieModo>('periodo');
  protected readonly dimensaoRanking = signal<DimensaoRanking>('fornecedor');
  /** Filtros que estavam ativos na consulta que produziu `data()`. */
  private readonly filtrosAplicados = signal<DashboardFinanceiroFilter>({});
  private carga: Subscription | null = null;
  private cargaRegistros: Subscription | null = null;

  protected readonly formularios = this.formularioLookup.items;
  protected readonly formulariosLoading = this.formularioLookup.loading;
  protected readonly bases = this.baseLookup.items;
  protected readonly basesLoading = this.baseLookup.loading;
  protected readonly processos = this.processoLookup.items;
  protected readonly processosLoading = this.processoLookup.loading;
  protected readonly obras = this.obraLookup.items;
  protected readonly obrasLoading = this.obraLookup.loading;
  protected readonly fornecedores = this.fornecedorLookup.items;
  protected readonly fornecedoresLoading = this.fornecedorLookup.loading;

  /** Atualização automática repete o recorte aplicado sem mostrar carregamento nem avisar erro. */
  private readonly atualizacao = atualizarPeriodicamente(() => this.buscar(this.filtrosAplicados(), true), {
    pode: () => !this.loading() && !!this.data()
  });

  // ------------------------------------------------------------------ filtros

  protected dataInicio: Date | null = null;
  protected dataFim: Date | null = null;
  protected filter: DashboardFinanceiroFilter = this.filtroVazio();

  protected readonly tipoOptions = [
    { label: 'Compras e pagamentos', value: null },
    { label: 'Só compras', value: 'COMPRA' as const },
    { label: 'Só pagamentos', value: 'PAGAMENTO' as const }
  ];
  protected readonly granularidadeOptions = [
    { label: 'Automático', value: null },
    { label: 'Por dia', value: 'DIA' as GranularidadeDashboard },
    { label: 'Por mês', value: 'MES' as GranularidadeDashboard },
    { label: 'Por ano', value: 'ANO' as GranularidadeDashboard }
  ];
  protected readonly statusOptions = (Object.keys(ROTULO_STATUS_SOLICITACAO) as StatusSolicitacao[]).map((value) => ({ label: ROTULO_STATUS_SOLICITACAO[value], value }));
  protected readonly tipoDespesaOptions = (Object.keys(ROTULO_TIPO_DESPESA) as TipoDespesa[]).map((value) => ({ label: ROTULO_TIPO_DESPESA[value], value }));
  protected readonly prioridadeOptions = (Object.keys(ROTULO_PRIORIDADE) as GrauPrioridade[]).map((value) => ({ label: ROTULO_PRIORIDADE[value], value }));
  protected readonly periodosRapidos: { label: string; value: PeriodoRapido }[] = [
    { label: '30 dias', value: 'mensal' },
    { label: '90 dias', value: 'trimestral' },
    { label: '1 ano', value: 'anual' }
  ];
  protected readonly abasSerie: { label: string; value: SerieModo }[] = [
    { label: 'Por período', value: 'periodo' },
    { label: 'Acumulado', value: 'acumulado' }
  ];
  protected readonly abasRanking = (Object.keys(DIMENSOES_RANKING) as DimensaoRanking[]).map((value) => ({ label: DIMENSOES_RANKING[value].aba, value }));

  protected readonly opcoesFornecedores = computed<GeoSelectOption<string>[]>(() => this.fornecedores().map((f) => ({ label: f.nomeFantasia, value: f.id })));
  protected readonly opcoesBases = computed<GeoSelectOption<string>[]>(() => this.bases().map((b) => ({ label: b.nome, value: b.id })));
  protected readonly opcoesProcessos = computed<GeoSelectOption<string>[]>(() => this.processos().map((p) => ({ label: p.nome, value: p.id })));
  protected readonly opcoesObras = computed<GeoSelectOption<string>[]>(() => this.obras().map((o) => ({ label: o.numeroContrato, value: o.id })));
  protected readonly opcoesFormularios = computed<GeoSelectOption<string>[]>(() => this.formularios().map((f) => ({ label: f.titulo, value: f.id })));

  /** Recorte aplicado como chips; o agrupamento do gráfico não recorta e fica fora. */
  protected readonly chips = computed<GeoFilterChip[]>(() => {
    const f = this.filtrosAplicados();
    const chips: GeoFilterChip[] = [];
    const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
    if (f.tipo) chips.push({ key: 'tipo', label: f.tipo === 'COMPRA' ? 'Só compras' : 'Só pagamentos' });
    if (f.inicio || f.fim) {
      const texto = f.inicio && f.fim ? `${dia(f.inicio)} a ${dia(f.fim)}` : f.inicio ? `a partir de ${dia(f.inicio)}` : `até ${dia(f.fim!)}`;
      chips.push({ key: 'periodo', label: `Abertura: ${texto}` });
    }
    const grupos: [keyof DashboardFinanceiroFilter, string, GeoSelectOption<string>[]][] = [
      ['idFornecedor', 'Fornecedor', this.opcoesFornecedores()],
      ['idBase', 'Base', this.opcoesBases()],
      ['idProcesso', 'Centro de custo', this.opcoesProcessos()],
      ['idObra', 'Obra', this.opcoesObras()],
      ['tipoDespesa', 'Despesa', this.tipoDespesaOptions],
      ['status', 'Situação', this.statusOptions],
      ['prioridade', 'Urgência', this.prioridadeOptions],
      ['idFormulario', 'Formulário', this.opcoesFormularios()]
    ];
    for (const [chave, rotulo, opcoes] of grupos) {
      const ids = (f[chave] as string[] | null | undefined) ?? [];
      if (!ids.length) continue;
      const texto = ids.length === 1 ? (opcoes.find((o) => o.value === ids[0])?.label ?? 'selecionado') : `${ids.length} selecionados`;
      chips.push({ key: chave, label: `${rotulo}: ${texto}` });
    }
    return chips;
  });

  // ------------------------------------------------------------------ leitura de gestor

  protected readonly leituras = computed(() => {
    const d = this.data();
    return d ? leiturasFinanceiras(d) : [];
  });
  protected readonly veredito = computed(() => {
    const d = this.data();
    return d ? vereditoFinanceiro(d, this.leituras()) : null;
  });
  protected readonly cartoes = computed(() => {
    const d = this.data();
    return d ? cartoesFinanceiros(d) : [];
  });
  protected readonly pendencias = computed(() => {
    const d = this.data();
    return d ? pendenciasFinanceiras(d, this.filtrosAplicados(), this.registros(), this.hoje()) : [];
  });
  protected readonly estadoPendencias = computed(() =>
    this.pendencias().length ? 'ready' as const : this.registrosCarregando() ? 'loading' as const : 'empty' as const
  );
  /** Ressalvas que mudam a leitura dos rankings (cadastro incompleto nos pedidos). */
  protected readonly ressalvas = computed(() => {
    const q = this.data()?.qualidade;
    if (!q) return [];
    const itens: string[] = [];
    if (q.semFornecedorIdentificado) itens.push(`${plural(q.semFornecedorIdentificado, 'pedido não diz', 'pedidos não dizem')} de quem foi a compra e fica(m) fora do ranking de fornecedores.`);
    if (q.semCentroCusto) itens.push(`${plural(q.semCentroCusto, 'pedido está', 'pedidos estão')} sem centro de custo: a despesa não tem a quem ser rateada.`);
    return itens;
  });

  protected readonly fila = computed(() => {
    const d = this.data();
    return d ? filaDeDecisao(d) : null;
  });

  // ------------------------------------------------------------------ gráficos

  protected readonly graficoSerie = computed(() => {
    const serie = this.data()?.serieTemporal ?? [];
    const acumulado = this.serieModo() === 'acumulado';
    const corrida = (valores: number[]) => {
      let total = 0;
      return valores.map((v) => (total += v));
    };
    const pedido = serie.map((s) => s.valorSolicitado);
    const autorizado = serie.map((s) => s.valorAprovado);
    return {
      tipo: acumulado ? 'line' as const : 'bar' as const,
      rotulos: serie.map((s) => s.rotulo),
      series: [
        { name: acumulado ? 'Pedido (acumulado)' : 'Pedido', values: acumulado ? corrida(pedido) : pedido },
        { name: acumulado ? 'Autorizado (acumulado)' : 'Autorizado', values: acumulado ? corrida(autorizado) : autorizado }
      ] as GeoChartSeries[]
    };
  });

  protected readonly graficoFila = computed(() => {
    const faixas = this.data()?.envelhecimento ?? [];
    return {
      rotulos: faixas.map((f) => `${f.faixa} dias`),
      series: [
        { name: 'Compras', values: faixas.map((f) => f.porTipo?.COMPRA ?? 0) },
        { name: 'Pagamentos', values: faixas.map((f) => f.porTipo?.PAGAMENTO ?? 0) }
      ] as GeoChartSeries[]
    };
  });

  protected readonly linhasRanking = computed<RankingFinanceiroItem[]>(() => {
    const d = this.data();
    return d ? rankingDe(d, this.dimensaoRanking()) : [];
  });
  protected readonly graficoRanking = computed(() => {
    const itens = this.linhasRanking().filter((i) => i.valorAprovado > 0 || i.valorSolicitado > 0).slice(0, MAX_BARRAS_NO_GRAFICO);
    return {
      itens,
      rotulos: itens.map(nomeDoItem),
      series: [
        { name: 'Autorizado', values: itens.map((i) => i.valorAprovado) },
        { name: 'Pedido', values: itens.map((i) => i.valorSolicitado) }
      ] as GeoChartSeries[]
    };
  });
  protected readonly rotuloRanking = computed(() => DIMENSOES_RANKING[this.dimensaoRanking()].rotulo);
  protected readonly colunasRanking = computed<GeoDataTableColumn<RankingFinanceiroItem>[]>(() => [
    { key: 'nome', header: this.rotuloRanking(), priority: 1, value: nomeDoItem },
    { key: 'valorAprovado', header: 'Autorizado', type: 'currency', priority: 1 },
    { key: 'percentualValor', header: '% do autorizado', type: 'percent', priority: 1 },
    { key: 'valorSolicitado', header: 'Pedido', type: 'currency', priority: 2 },
    { key: 'quantidade', header: 'Pedidos', type: 'integer', priority: 2 },
    { key: 'pendentes', header: 'Esperando', type: 'integer', priority: 2 },
    {
      key: 'taxaAprovacao', header: 'Aprovação', type: 'custom', priority: 3,
      value: (i) => (i.aprovadas + i.rejeitadas ? i.taxaAprovacao : -1),
      display: (i) => (i.aprovadas + i.rejeitadas ? formatarPercentual(i.taxaAprovacao) : '—')
    },
    {
      key: 'percentualComDocumentoFiscal', header: 'Com nota ou boleto', type: 'custom', priority: 3,
      value: (i) => (i.aprovadas ? i.percentualComDocumentoFiscal : -1),
      display: (i) => (i.aprovadas ? formatarPercentual(i.percentualComDocumentoFiscal, 0) : '—')
    }
  ]);

  protected readonly graficoVencimentos = computed(() => {
    const d = this.data();
    return d && totalALiquidar(d) > 0 ? graficoVencimentos(d) : null;
  });

  protected readonly graficoDocumentos = computed(() => {
    const situacoes = (this.data()?.documentosPorSituacao ?? []).filter((s) => s.quantidade > 0);
    return {
      itens: situacoes,
      rotulos: situacoes.map((s) => s.rotulo),
      series: [{ name: 'Documentos', values: situacoes.map((s) => s.quantidade) }] as GeoChartSeries[]
    };
  });

  // ------------------------------------------------------------------ tabelas

  protected readonly colunasPendencias: GeoDataTableColumn<PendenciaFinanceira>[] = [
    { key: 'gravidade', header: 'Gravidade', type: 'custom', priority: 1, width: '8.5rem', value: (p) => p.peso, display: (p) => p.gravidade },
    { key: 'oQue', header: 'O quê', priority: 1 },
    { key: 'detalhe', header: 'Detalhe', priority: 1 },
    { key: 'valor', header: 'Valor', type: 'custom', priority: 2, value: (p) => p.valor ?? -1, display: (p) => (p.valor === null ? '—' : formatarMoeda(p.valor)) },
    { key: 'prazo', header: 'Prazo', type: 'custom', priority: 2, value: (p) => p.dias, display: (p) => p.prazo },
    { key: 'proximoPasso', header: 'Próximo passo', priority: 2 }
  ];
  protected readonly chavePendencia = (p: PendenciaFinanceira) => p.chave;
  protected readonly rotuloPendencia = (p: PendenciaFinanceira) => `${p.oQue}: ${p.detalhe}`;
  protected readonly chaveRanking = (i: RankingFinanceiroItem) => i.chave;
  protected readonly rotuloItemRanking = (i: RankingFinanceiroItem) => nomeDoItem(i);
  protected readonly pendenciaDe = (p: unknown) => p as PendenciaFinanceira;
  protected readonly umaCasa = umaCasa;
  protected readonly plural = plural;
  protected readonly Math = Math;

  // ------------------------------------------------------------------ análise detalhada

  /** Análise aberta (`?drill=`), resolvida contra os dados em tela. */
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const alvo = this.analise.alvo();
    const d = this.data();
    if (!alvo || !d) return null;
    return vistaFinanceiro(alvo, { d, filtros: this.filtrosAplicados(), financeiro: this.financeiro, hoje: this.hoje() });
  });

  /** Contexto do painel para a Bússola: o recorte aplicado e os números em tela. */
  protected readonly contextoCopiloto = computed(() => this.montarContextoCopiloto());

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.carga?.unsubscribe();
      this.cargaRegistros?.unsubscribe();
    });
    // Link de análise que não existe mais no recorte: fecha o painel.
    effect(() => {
      if (this.analise.alvo() && this.data() && !this.loading() && !this.vistaAnalise()) this.analise.fechar();
    });
  }

  ngOnInit(): void {
    this.restaurarFiltrosDaUrl();
    this.hidratarLookupsSelecionados();
    this.carregar();
  }

  // ------------------------------------------------------------------ ações do recorte

  protected aplicar(): void {
    if (!this.periodoValido()) return;
    this.periodoAtivo.set('');
    this.carregar();
  }

  protected limpar(): void {
    this.periodoInvalido.set(false);
    this.dataInicio = null;
    this.dataFim = null;
    this.filter = this.filtroVazio();
    this.periodoAtivo.set('');
    this.carregar();
  }

  protected removerFiltro(chave: string): void {
    if (chave === 'periodo') {
      this.dataInicio = null;
      this.dataFim = null;
    } else if (chave === 'tipo') {
      this.filter = { ...this.filter, tipo: null };
    } else {
      this.filter = { ...this.filter, [chave]: [] };
    }
    this.carregar();
  }

  protected setPeriodo(tipo: PeriodoRapido): void {
    const hoje = new Date();
    this.dataFim = new Date(hoje);
    this.dataInicio = new Date(hoje);
    if (tipo === 'mensal') this.dataInicio.setMonth(hoje.getMonth() - 1);
    if (tipo === 'trimestral') this.dataInicio.setMonth(hoje.getMonth() - 3);
    if (tipo === 'anual') this.dataInicio.setFullYear(hoje.getFullYear() - 1);
    this.periodoAtivo.set(tipo);
    this.carregar();
  }

  protected openFormularios(): void { this.formularioLookup.open(); }
  protected searchFormularios(event: { filter?: string }): void { this.formularioLookup.search(event.filter ?? ''); }
  protected openBases(): void { this.baseLookup.open(); }
  protected searchBases(event: { filter?: string }): void { this.baseLookup.search(event.filter ?? ''); }
  protected openProcessos(): void { this.processoLookup.open(); }
  protected searchProcessos(event: { filter?: string }): void { this.processoLookup.search(event.filter ?? ''); }
  protected openObras(): void { this.obraLookup.open(); }
  protected searchObras(event: { filter?: string }): void { this.obraLookup.search(event.filter ?? ''); }
  protected openFornecedores(): void { this.fornecedorLookup.open(); }
  protected searchFornecedores(event: { filter?: string }): void { this.fornecedorLookup.search(event.filter ?? ''); }

  // ------------------------------------------------------------------ navegação

  protected analisar(alvo: AlvoAnalise): void {
    this.analise.abrir(alvo.dimension, alvo.value);
  }

  protected abrirCartao(cartao: CartaoFinanceiro): void {
    this.analisar(cartao.alvo);
  }

  protected abrirPendencia(p: PendenciaFinanceira): void {
    if (p.destino.tipo === 'analise') {
      this.analisar(p.destino.alvo);
      return;
    }
    void this.router.navigate([...p.destino.rota], p.destino.queryParams ? { queryParams: p.destino.queryParams } : {});
  }

  protected abrirPeriodo(indice: number): void {
    const ponto = this.data()?.serieTemporal[indice];
    if (ponto) this.analise.abrir('periodo', ponto.chave);
  }

  protected abrirFaixaFila(indice: number): void {
    const faixa = this.data()?.envelhecimento[indice];
    if (faixa) this.analise.abrir('faixa', faixa.faixa);
  }

  protected abrirVencimento(indice: number): void {
    const faixa = this.data()?.vencimentos[indice];
    if (faixa) this.analise.abrir('vencimento', faixa.faixa);
  }

  protected abrirItemRanking(item: RankingFinanceiroItem | undefined): void {
    if (item) this.analise.abrir('ranking', `${this.dimensaoRanking()}~${item.chave}`);
  }

  protected abrirSituacaoDocumento(indice: number): void {
    const situacao = this.graficoDocumentos().itens[indice];
    if (situacao) void this.router.navigate(['/financeiro/documentos'], { queryParams: { situacao: situacao.chave } });
  }

  /** As solicitações do recorte, na listagem de gestão (mesmo período e filtros que ela aceita). */
  protected verSolicitacoes(): void {
    const d = this.data();
    const f = this.filtrosAplicados();
    const periodo = d ? { dataCriacaoInicio: f.inicio ?? d.inicio, dataCriacaoFim: f.fim ?? d.fim } : {};
    void this.router.navigate([ROTA_LISTAGEM_GESTAO], { queryParams: paramsDaListagem(recorteNaListagem(f), periodo) });
  }

  protected aprofundar(alvo: AlvoAnalise): void {
    this.analise.aprofundar(alvo, this.vistaAnalise()?.titulo ?? '');
  }

  protected perguntarAnalise(vista: VistaAnalise): void {
    if (!vista.copiloto) return;
    this.analise.fechar();
    this.copiloto.perguntarSobre(vista.copiloto.foco, vista.copiloto.pergunta);
  }

  protected perguntarVisao(): void {
    const v = this.veredito();
    this.copiloto.perguntarSobre(
      { tipo: 'secao', id: 'visaoGerencial', rotulo: 'Visão gerencial' },
      `Faça a leitura gerencial do financeiro neste recorte: ${v ? `${v.titulo.toLowerCase()} (${v.texto})` : ''} Quais as 3 ações prioritárias para hoje e com quem tratar cada uma?`
    );
  }

  // ------------------------------------------------------------------ carga

  private filtroVazio(): DashboardFinanceiroFilter {
    return {
      tipo: null, idFormulario: [], idBase: [], idProcesso: [], idObra: [],
      idFornecedor: [], idSolicitante: [], status: [], tipoDespesa: [], prioridade: [],
      granularidade: null
    };
  }

  /** Recompõe o recorte compartilhado por link (`?idFornecedor=a&idFornecedor=b`). */
  private restaurarFiltrosDaUrl(): void {
    const query = this.route.snapshot.queryParamMap;
    DIMENSOES_FILTRO_FINANCEIRO.forEach((chave) => {
      (this.filter[chave] as string[]) = normalizarSelecao(query.getAll(chave));
    });
    const tipo = query.get('tipo');
    if (tipo === 'COMPRA' || tipo === 'PAGAMENTO') this.filter.tipo = tipo;
    const granularidade = query.get('granularidade') as GranularidadeDashboard | null;
    if (granularidade && ['DIA', 'MES', 'ANO'].includes(granularidade)) this.filter.granularidade = granularidade;
    this.dataInicio = this.parsearData(query.get('inicio'));
    this.dataFim = this.parsearData(query.get('fim'));
  }

  private parsearData(valor: string | null): Date | null {
    if (!valor) return null;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  /** Deixa o recorte na URL para o gestor compartilhar a tela; `merge` preserva o `?drill=`. */
  private sincronizarUrl(filter: DashboardFinanceiroFilter): void {
    const queryParams: Record<string, string[] | string | null> = {};
    DIMENSOES_FILTRO_FINANCEIRO.forEach((chave) => {
      const selecao = (filter[chave] as string[] | null) ?? [];
      queryParams[chave] = selecao.length ? selecao : null;
    });
    queryParams['tipo'] = filter.tipo ?? null;
    queryParams['granularidade'] = filter.granularidade ?? null;
    queryParams['inicio'] = filter.inicio ?? null;
    queryParams['fim'] = filter.fim ?? null;
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Opções já selecionadas na URL (nome legível no chip); um lookup que falha só deixa o chip genérico. */
  private hidratarLookupsSelecionados(): void {
    this.hidratarSelecionados(this.filter.idFormulario, (id) => this.financeiro.buscarSchema(id), this.formularioLookup);
    this.hidratarSelecionados(this.filter.idBase, (id) => this.rh.buscarBaseOperacionalPorId(id), this.baseLookup);
    this.hidratarSelecionados(this.filter.idProcesso, (id) => this.rh.buscarProcessoPorId(id), this.processoLookup);
    this.hidratarSelecionados(this.filter.idObra, (id) => this.contratos.buscarContratoPorId(id), this.obraLookup);
    this.hidratarSelecionados(this.filter.idFornecedor, (id) => this.financeiro.buscarFornecedorPorId(id), this.fornecedorLookup);
  }

  private hidratarSelecionados<T>(ids: string[] | null | undefined, buscar: (id: string) => Observable<T>, lookup: RemoteLookup<T>): void {
    if (!ids?.length) return;
    forkJoin(ids.map((id) => buscar(id).pipe(catchError(() => of(null)))))
      .subscribe((itens) => lookup.setSeed(itens.filter((item): item is T => item != null)));
  }

  private carregar(): void {
    const filter: DashboardFinanceiroFilter = {
      ...this.filter,
      inicio: this.dataInicio ? this.toIso(this.dataInicio, false) : null,
      fim: this.dataFim ? this.toIso(this.dataFim, true) : null
    };
    this.sincronizarUrl(filter);
    this.buscar(filter);
  }

  /** Busca um recorte. Em atualização silenciosa, uma falha mantém os números atuais sem avisar. */
  private buscar(filter: DashboardFinanceiroFilter, silencioso = false): void {
    this.carga?.unsubscribe();
    if (!silencioso) {
      this.loading.set(true);
      this.erro.set(null);
    }
    this.carga = this.financeiro.gerarDashboard(filter).subscribe({
      next: (resposta) => {
        this.hoje.set(diaDe(new Date()));
        this.filtrosAplicados.set(filter);
        this.data.set(resposta);
        this.atualizadoEm.set(new Date(resposta.atualizadoEm));
        this.loading.set(false);
        this.erro.set(null);
        this.buscarRegistros(filter);
      },
      error: (erro) => {
        if (silencioso) return;
        this.loading.set(false);
        this.erro.set(getErrorMessage(erro));
      }
    });
  }

  /**
   * Registros que dá para abrir direto em "o que pede ação": pedidos que esperam decisão há mais
   * tempo e despesas aprovadas já vencidas. Cada consulta degrada sozinha para `null` (perfil sem
   * acesso a um dos tipos, falha de rede): a tabela continua com as prioridades do painel.
   */
  private buscarRegistros(filter: DashboardFinanceiroFilter): void {
    this.cargaRegistros?.unsubscribe();
    const recorte = recorteNaListagem(filter, ['status']);
    const base = { ...recorte.filtro, ativo: true, page: 0, size: AMOSTRA_ACAO };
    const pagina = (o: Observable<{ content: SolicitacaoFinanceira[] }>) => o.pipe(map((p) => p.content), catchError(() => of(null)));
    this.registrosCarregando.set(true);
    this.cargaRegistros = forkJoin({
      parados: pagina(this.financeiro.listarSolicitacoes(recorte.tipo, { ...base, status: 'SOLICITADO', sort: 'dataSubmissao,asc' })),
      vencidas: pagina(this.financeiro.listarSolicitacoes(recorte.tipo, { ...base, status: 'APROVADO', vencimentoFim: somarDias(this.hoje(), -1), sort: 'dataCriacao,asc' }))
    }).subscribe((registros) => {
      this.registros.set(registros);
      this.registrosCarregando.set(false);
    });
  }

  /** Período invertido não consulta: o aviso fica junto aos filtros até a próxima aplicação válida. */
  private periodoValido(): boolean {
    const valido = !this.dataInicio || !this.dataFim || this.dataInicio <= this.dataFim;
    this.periodoInvalido.set(!valido);
    return valido;
  }

  private toIso(date: Date, endOfDay: boolean): string {
    const value = new Date(date);
    value.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return toSaoPauloIso(value, endOfDay);
  }

  // ------------------------------------------------------------------ Bússola

  /**
   * Recorte estruturado para a Bússola: período, filtros aplicados (com nomes legíveis e ids), os
   * números dos cartões, o que pede ação e as agregações dos gráficos. Nunca os registros: o agente
   * aprofunda pelas ferramentas, com as permissões do usuário.
   */
  private montarContextoCopiloto(): CopilotoDashboardContext | null {
    const d = this.data();
    const f = this.filtrosAplicados();
    const nomes = <T>(itens: readonly T[], ids: readonly string[] | null | undefined, id: (i: T) => string, nome: (i: T) => string) =>
      rotuloDasOpcoes(itens, ids ?? [], id, nome);
    const rotulos = <T extends string>(valores: readonly T[] | null | undefined, mapa: Record<T, string>) => (valores ?? []).map((valor) => mapa[valor] ?? valor);
    const fila = this.fila();
    const ranking = this.linhasRanking();
    const serie = d?.serieTemporal ?? [];
    const pendencias = this.pendencias();
    const veredito = this.veredito();
    return {
      id: 'financeiro.executivo',
      nome: 'Painel do financeiro — compras e pagamentos',
      modulo: 'Financeiro',
      descricao: 'Veredito do recorte, o que pede ação hoje (vencidos sem comprovante, pedidos parados, documentação), autorizado × pedido, fila de aprovação por idade, para onde vai o dinheiro e o que vence a seguir. Pedidos contados pela data de abertura, com o desfecho atual; fila e conferência consideram todo o histórico em aberto.',
      rota: '/financeiro/dashboard',
      periodo: d ? periodoPainel(d.inicio, d.fim) : periodoPainel(this.dataInicio, this.dataFim),
      filtros: [
        filtroPainel('tipo', 'Tipo', f.tipo === 'COMPRA' ? 'Só compras' : f.tipo === 'PAGAMENTO' ? 'Só pagamentos' : null, f.tipo ?? null),
        filtroPainel('fornecedor', 'Fornecedor', nomes(this.fornecedores(), f.idFornecedor, (i) => i.id, (i) => i.nomeFantasia), f.idFornecedor ?? []),
        filtroPainel('base', 'Base operacional', nomes(this.bases(), f.idBase, (i) => i.id, (i) => i.nome), f.idBase ?? []),
        filtroPainel('centroCusto', 'Centro de custo', nomes(this.processos(), f.idProcesso, (i) => i.id, (i) => i.nome), f.idProcesso ?? []),
        filtroPainel('obra', 'Obra', nomes(this.obras(), f.idObra, (i) => i.id, (i) => i.numeroContrato), f.idObra ?? []),
        filtroPainel('tipoDespesa', 'Tipo de despesa', rotulos(f.tipoDespesa, ROTULO_TIPO_DESPESA), f.tipoDespesa ?? []),
        filtroPainel('status', 'Situação', rotulos(f.status, ROTULO_STATUS_SOLICITACAO), f.status ?? []),
        filtroPainel('prioridade', 'Urgência', rotulos(f.prioridade, ROTULO_PRIORIDADE), f.prioridade ?? []),
        filtroPainel('formulario', 'Formulário', nomes(this.formularios(), f.idFormulario, (i) => i.id, (i) => i.titulo), f.idFormulario ?? [])
      ],
      metricas: d && fila
        ? [
            metricaPainel('valorAprovado', 'Autorizado no período', d.valores.valorAprovado, 'moeda', {
              descricao: `${formatarPercentual(d.valores.taxaAutorizacao)} de ${formatarMoeda(d.valores.valorSolicitado)} pedidos`,
              comparacao: d.valores.valorAprovadoPeriodoAnterior
                ? { rotulo: 'vs. período anterior', valorAnterior: d.valores.valorAprovadoPeriodoAnterior, variacaoPercentual: d.valores.variacaoValorAprovado, melhorQuando: d.indicadores?.valorAprovado?.direcaoDesejada === 'DESCER' ? 'menor' : 'maior' }
                : undefined
            }),
            metricaPainel('corteNaAprovacao', 'Cortado ao aprovar', d.valores.corteNaAprovacao, 'moeda', { descricao: `${formatarPercentual(d.valores.percentualCorte)} das aprovadas` }),
            metricaPainel('filaDecisao', 'Pedidos esperando decisão (histórico)', fila.quantidade, 'inteiro', {
              descricao: `${formatarMoeda(fila.valor)} parados; o mais antigo há ${plural(fila.maisAntigoDias, 'dia', 'dias')}; ${fila.acimaDoEscalonamento} há mais de 15 dias`
            }),
            metricaPainel('p90DiasAteDecisao', 'P90 de dias até a decisão', d.ciclo.p90DiasAteDecisao, 'dias', {
              descricao: `mediana ${umaCasa(d.ciclo.medianaDiasAteDecisao)} ${d.ciclo.medianaDiasAteDecisao === 1 ? 'dia' : 'dias'}`
            }),
            metricaPainel('valorVencido', 'Vencido e sem comprovante', d.valores.valorVencido, 'moeda', {
              descricao: `${plural(d.valores.quantidadeVencida, 'despesa vencida', 'despesas vencidas')}; ${formatarMoeda(d.valores.valorAVencer)} vencem nos próximos 30 dias`
            }),
            metricaPainel('coberturaFiscal', 'Aprovadas com nota ou boleto', d.conformidade.coberturaFiscal, 'percentual', {
              descricao: `${d.conformidade.aprovadasSemDocumentoFiscal} sem documento fiscal (${formatarMoeda(d.conformidade.valorSemDocumentoFiscal)}); ${d.conformidade.aguardandoConferencia} documentos esperando conferência`
            }),
            metricaPainel('pedeAcao', 'Itens que pedem ação', pendencias.length, 'inteiro', {
              descricao: pendencias.slice(0, 5).map((p) => `${p.gravidade}: ${p.oQue}`).join('; ') || 'nada pendente'
            })
          ]
        : [],
      graficos: d
        ? [
            graficoPainel('pedidoAutorizado', 'barra', 'Pedido × autorizado ao longo do período', serie.map((i) => i.rotulo), [
              { nome: 'Pedido (R$)', valores: serie.map((i) => i.valorSolicitado) },
              { nome: 'Autorizado (R$)', valores: serie.map((i) => i.valorAprovado) }
            ], { metrica: 'valor', dimensao: `período (${d.granularidade.toLowerCase()})`, formato: 'moeda' }),
            graficoPainel('filaDecisao', 'barra_empilhada', 'Há quanto tempo os pedidos esperam decisão', d.envelhecimento.map((x) => `${x.faixa} dias`),
              d.envelhecimento.map((x) => x.quantidade), { metrica: 'pedidos', dimensao: 'faixa de espera', formato: 'inteiro' }),
            graficoPainel(`ranking.${this.dimensaoRanking()}`, 'ranking', `Para onde vai o dinheiro — por ${this.rotuloRanking().toLowerCase()}`,
              ranking.map(nomeDoItem), ranking.map((i) => i.valorAprovado), {
                metrica: 'valor autorizado', dimensao: this.rotuloRanking().toLowerCase(), formato: 'moeda', totalCategorias: ranking.length
              }),
            graficoPainel('vencimentos', 'barra', 'O que vence a seguir', d.vencimentos.map((v) => v.rotulo), d.vencimentos.map((v) => v.valor), {
              metrica: 'valor a pagar', dimensao: 'faixa de vencimento', formato: 'moeda'
            }),
            graficoPainel('documentosSituacao', 'barra', 'Documentos por situação', d.documentosPorSituacao.map((x) => x.rotulo), d.documentosPorSituacao.map((x) => x.quantidade), {
              metrica: 'documentos', dimensao: 'situação', formato: 'inteiro'
            })
          ]
        : [],
      datasets: ['solicitacoes_compra', 'solicitacoes_pagamento', 'documentos_financeiros', 'fornecedores', 'bases_operacionais', 'processos_negocio', 'obras'],
      extras: d
        ? {
            'Veredito': veredito ? `${veredito.rotulo} — ${veredito.titulo}` : '',
            'Período de comparação': `${new Date(d.periodo.comparacaoInicio).toLocaleDateString('pt-BR')} a ${new Date(d.periodo.comparacaoFim).toLocaleDateString('pt-BR')}`
          }
        : undefined,
      sugestoes: [
        { rotulo: 'O que fazer primeiro', icone: 'pi pi-list-check', requer: ['dados', 'analise'],
          pergunta: 'Quais são as 5 prioridades do financeiro hoje neste recorte, em ordem, e com quem tratar cada uma?' },
        { rotulo: 'Por que o autorizado variou?', icone: 'pi pi-arrow-right-arrow-left', requer: ['dados', 'analise'],
          pergunta: 'O que explica a variação do valor autorizado em relação ao período anterior? Detalhe por fornecedor, centro de custo e tipo de despesa.' },
        { rotulo: 'Onde a fila trava', icone: 'pi pi-hourglass', requer: ['dados'],
          pergunta: 'Quais pedidos estão há mais tempo esperando decisão neste recorte, quem precisa decidir e quanto valor está parado?' },
        { rotulo: 'Despesas sem documento', icone: 'pi pi-file-excel', requer: ['dados'],
          pergunta: 'Quais despesas aprovadas deste recorte estão sem nota ou boleto, e quais fornecedores concentram essa pendência?' }
      ]
    };
  }
}
