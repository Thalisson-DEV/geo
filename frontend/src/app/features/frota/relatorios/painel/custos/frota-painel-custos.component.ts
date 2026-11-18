import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ParamMap, Router } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesChartComponent,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDrillStateService,
  CesFilterChip,
  CesFilterPanelComponent,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesSelectOption
} from '@ces/ui';

import { DetalheCustosFrota, FiltroRelatorioFrota, LancamentoFrota } from '../../../../../core/models/frota-relatorios.models';
import { VistaAnalise } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { DashboardAnaliseComponent } from '../../../../../shared/components/dashboard/dashboard-analise.component';
import { NavegacaoAnaliseService } from '../../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardMetricCardComponent } from '../../../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardVisaoGerencialComponent } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  CopilotoAreaComponent,
  CopilotoDashboardContext,
  CopilotoGatilhoComponent,
  CopilotoPerguntarComponent,
  filtroPainel,
  graficoPainel,
  metricaPainel,
  periodoPainel
} from '../../../../copiloto/painel';
import {
  ROTULO_CATEGORIA,
  ROTULO_REGIME,
  dividir,
  inteiro,
  moeda,
  moedaCurta,
  numero,
  pct,
  rotuloMes,
  soma,
  textoVariacao
} from '../frota-analise-comum';
import { FrotaPainelTopoComponent, FrotaRecorteCamposComponent } from '../frota-painel.components';
import { PainelFrotaBase } from '../painel-frota-base';
import { RecorteFrotaService } from '../recorte-frota.service';
import {
  DimensaoGrupo,
  GrupoCusto,
  ModeloCustos,
  PARTES,
  Parte,
  VeiculoCusto,
  gruposParaGrafico,
  modeloCustos,
  tipoDespesa,
  vistaCustos,
  visaoCustos
} from './analise-custos';

/**
 * Painel de custos da frota: quanto custa, onde está o dinheiro, quem foge da curva e o que mudou.
 * Filtro próprio de categoria; todo número abre a análise com os lançamentos que o compõem.
 */
@Component({
  selector: 'app-frota-painel-custos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteFrotaService, CesDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, CesAsyncStateComponent, CesButtonComponent, CesCalloutComponent, CesChartComponent, CesDataTableComponent,
    CesFilterPanelComponent, CesMultiSelectComponent, CesPageHeaderComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, FrotaPainelTopoComponent, FrotaRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './frota-painel-custos.component.html',
  styleUrl: '../painel-frota.css'
})
export class FrotaPainelCustosComponent extends PainelFrotaBase<DetalheCustosFrota> {
  private readonly router = inject(Router);

  protected readonly moeda = moeda;
  protected readonly moedaCurta = moedaCurta;
  protected readonly inteiro = inteiro;
  protected readonly numero = numero;
  protected readonly pct = pct;
  protected readonly textoVariacao = textoVariacao;
  protected readonly rotuloCategoria = ROTULO_CATEGORIA;

  // ── Filtro próprio ───────────────────────────────────────────────────────────────────────────
  protected readonly categoriasSel = signal<string[]>([]);
  private readonly categoriasAplicadas = signal<string[]>([]);
  protected readonly opcoesCategoria = computed<CesSelectOption<string>[]>(() => {
    const visiveis = this.gerencial()?.custos.porCategoria.map((c) => c.categoria) ?? [...PARTES];
    return visiveis.map((c) => ({ label: ROTULO_CATEGORIA[c], value: c }));
  });
  protected readonly chipsProprios = computed<CesFilterChip[]>(() => {
    const c = this.categoriasAplicadas();
    return c.length ? [{ key: 'categoria', label: `Categoria: ${c.length === 1 ? ROTULO_CATEGORIA[c[0]] : `${c.length} selecionadas`}` }] : [];
  });

  // ── Modelo ───────────────────────────────────────────────────────────────────────────────────
  protected readonly modelo = computed<ModeloCustos | null>(() => {
    const g = this.gerencial();
    const d = this.detalhe();
    return g && d ? modeloCustos(g, d.lancamentos, this.categoriasAplicadas()) : null;
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoCustos(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaCustos(a, m) : null;
  });

  protected readonly mensal = computed(() => {
    const m = this.modelo();
    if (!m) return { rotulos: [] as string[], series: [] as { name: string; values: number[] }[] };
    const partes = m.categorias.filter((p) => m.mensal.some((x) => x.partes[p] > 0));
    return { rotulos: m.mensal.map((x) => rotuloMes(x.mes)), series: partes.map((p) => ({ name: ROTULO_CATEGORIA[p], values: m.mensal.map((x) => x.partes[p]) })) };
  });
  protected readonly categoriasComValor = computed(() => (this.modelo()?.porCategoria ?? []).filter((c) => c.valor > 0));
  protected readonly graficoCategorias = computed(() => ({
    rotulos: this.categoriasComValor().map((c) => c.rotulo),
    series: [{ name: 'Custo', values: this.categoriasComValor().map((c) => c.valor) }]
  }));
  protected readonly gruposBase = computed(() => gruposParaGrafico(this.modelo()?.grupos.base ?? []));
  protected readonly gruposProcesso = computed(() => gruposParaGrafico(this.modelo()?.grupos.processo ?? []));
  protected readonly despesasTipo = computed(() => (this.modelo()?.despesasPorTipo ?? []).slice(0, 10));
  protected readonly maioresLancamentos = computed(() => (this.modelo()?.lancamentos ?? []).slice(0, 25));

  protected readonly serieGrupo = (g: GrupoCusto[]) => [{ name: 'Custo', values: g.map((x) => x.custo) }];
  protected readonly rotulosGrupo = (g: GrupoCusto[]) => g.map((x) => x.nome);
  protected readonly somaDespesa = (linhas: LancamentoFrota[]) => soma(linhas, (l) => l.valor);
  protected readonly rotulosDespesas = computed(() => this.despesasTipo().map((g) => g.rotulo));
  protected readonly seriesDespesas = computed(() => [{ name: 'Valor', values: this.despesasTipo().map((g) => soma(g.linhas, (l) => l.valor)) }]);

  // ── Tabelas ──────────────────────────────────────────────────────────────────────────────────
  protected readonly chaveVeiculo = (v: { idVeiculo: string }) => v.idVeiculo;
  protected readonly rotuloVeiculo = (v: { placa: string }) => v.placa;
  protected readonly chaveGrupo = (g: GrupoCusto) => `${g.dimensao}:${g.id}`;
  protected readonly chaveLancamento = (l: LancamentoFrota) => `${l.categoria}:${l.id}`;

  protected readonly colVeiculos: CesDataTableColumn<VeiculoCusto>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'tipo', header: 'Tipo', priority: 2, value: (v) => v.tipo ?? '' },
    { key: 'base', header: 'Base', priority: 2, value: (v) => v.base ?? '' },
    { key: 'processo', header: 'Processo', priority: 3, value: (v) => v.processo ?? '' },
    { key: 'regime', header: 'Regime', priority: 3, value: (v) => ROTULO_REGIME[v.regime ?? ''] ?? '' },
    { key: 'manutencao', header: 'Manutenção', type: 'currency', priority: 2 },
    { key: 'combustivel', header: 'Combustível', type: 'currency', priority: 2 },
    { key: 'despesas', header: 'Despesas', type: 'currency', priority: 3 },
    { key: 'seguro', header: 'Seguro', type: 'currency', priority: 3 },
    { key: 'locacao', header: 'Locação', type: 'currency', priority: 3 },
    { key: 'franquias', header: 'Franquias', type: 'currency', priority: 3 },
    { key: 'custo', header: 'Custo', type: 'currency', priority: 1 },
    { key: 'km', header: 'Km', type: 'integer', priority: 2 },
    { key: 'custoKm', header: 'R$/km', type: 'custom', priority: 1, value: (v) => v.custoKm ?? -1, display: (v) => moeda(v.custoKm) },
    { key: 'delta', header: 'Variação', type: 'custom', priority: 2, value: (v) => v.delta ?? 0,
      display: (v) => (v.delta == null ? '—' : `${v.delta >= 0 ? '+' : '−'}${moeda(Math.abs(v.delta))}`) }
  ];

  protected readonly colGrupos: CesDataTableColumn<GrupoCusto>[] = [
    { key: 'nome', header: 'Grupo', priority: 1 },
    { key: 'veiculos', header: 'Veículos', type: 'custom', priority: 2, value: (g) => g.veiculos.length, display: (g) => inteiro(g.veiculos.length) },
    { key: 'custo', header: 'Custo', type: 'currency', priority: 1 },
    { key: 'km', header: 'Km', type: 'integer', priority: 2 },
    { key: 'custoKm', header: 'R$/km', type: 'custom', priority: 1, value: (g) => g.custoKm ?? -1, display: (g) => moeda(g.custoKm) },
    { key: 'porVeiculo', header: 'Por veículo', type: 'custom', priority: 3, value: (g) => g.custo / (g.veiculos.length || 1),
      display: (g) => moeda(dividir(g.custo, g.veiculos.length)) }
  ];

  protected readonly colForaCurva: CesDataTableColumn<VeiculoCusto>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'tipo', header: 'Tipo', priority: 2, value: (v) => v.tipo ?? '' },
    { key: 'custoKm', header: 'R$/km', type: 'custom', priority: 1, value: (v) => v.custoKm ?? -1, display: (v) => moeda(v.custoKm) },
    { key: 'sobreTipo', header: 'Sobre o tipo', type: 'custom', priority: 1, value: (v) => v.sobreTipo ?? 0, display: (v) => `${numero(v.sobreTipo, 2)}×` }
  ];

  protected readonly colAltas: CesDataTableColumn<VeiculoCusto>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'totalAnterior', header: 'Anterior', type: 'currency', priority: 2 },
    { key: 'total', header: 'Atual', type: 'currency', priority: 1 },
    { key: 'delta', header: 'Alta', type: 'currency', priority: 1 }
  ];

  protected readonly colLancamentos: CesDataTableColumn<LancamentoFrota>[] = [
    { key: 'data', header: 'Data', type: 'date', priority: 2 },
    { key: 'placa', header: 'Veículo', priority: 1, value: (l) => l.placa ?? '—' },
    { key: 'categoria', header: 'Categoria', priority: 2, value: (l) => ROTULO_CATEGORIA[l.categoria] ?? l.categoria },
    { key: 'descricao', header: 'Descrição', priority: 1, value: (l) => (l.numero ? `#${l.numero} · ` : '') + (l.descricao ?? '') },
    { key: 'contraparte', header: 'Fornecedor / posto', priority: 3, value: (l) => l.contraparte ?? '—' },
    { key: 'valor', header: 'Valor', type: 'currency', priority: 1 }
  ];

  constructor() {
    super();
    this.iniciar();
  }

  // ── Filtros próprios ─────────────────────────────────────────────────────────────────────────
  protected carregarDetalhe(f: FiltroRelatorioFrota) {
    return this.relatorios.custos(f);
  }
  protected parametrosProprios() {
    return { categoria: this.categoriasAplicadas().join(',') || null };
  }
  protected lerProprios(q: ParamMap): void {
    this.categoriasSel.set((q.get('categoria') ?? '').split(',').filter(Boolean));
  }
  protected aplicarProprios(): void {
    this.categoriasAplicadas.set(this.categoriasSel());
  }
  protected limparProprios(): void {
    this.categoriasSel.set([]);
  }
  protected removerProprio(chave: string): void {
    if (chave === 'categoria') this.categoriasSel.set([]);
  }

  // ── Ações ────────────────────────────────────────────────────────────────────────────────────
  protected analisarGrupo(dim: DimensaoGrupo, g: GrupoCusto): void {
    this.analisar('grupo', `${dim}~${g.id}`);
  }

  protected analisarCategoria(indice: number): void {
    this.selecionar(this.categoriasComValor(), indice, 'categoria', (c) => c.parte);
  }

  protected analisarMes(indice: number): void {
    this.selecionar(this.modelo()?.mensal ?? [], indice, 'mes', (x) => x.mes);
  }

  protected analisarDespesa(indice: number): void {
    this.selecionar(this.despesasTipo(), indice, 'despesa', (g) => g.chave);
  }

  protected abrirLancamento(l: LancamentoFrota): void {
    const destino: Record<string, [unknown[], Record<string, string>?]> = {
      MANUTENCAO: [['/frota/ordens-servico', l.id]],
      COMBUSTIVEL: [['/frota/abastecimentos'], { abastecimento: l.id }],
      DESPESAS: [['/frota/despesas'], { despesa: l.id }],
      FRANQUIAS: [['/frota/sinistros'], { sinistro: l.id }]
    };
    const [rota, query] = destino[l.categoria];
    void this.router.navigate(rota, { queryParams: query });
  }

  protected verDespesasAguardando(): void {
    void this.router.navigate(['/frota/despesas']);
  }

  protected tomCusto(m: ModeloCustos): 'amber' | 'green' | 'primary' {
    if (!m.anterior) return 'primary';
    const v = (m.total - m.anterior) / m.anterior;
    return v > 0.15 ? 'amber' : v < -0.05 ? 'green' : 'primary';
  }

  protected tipoDespesa = tipoDespesa;

  // ── Bússola ───────────────────────────────────────────────────────────────────────────────
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    return {
      id: 'frota.custos',
      nome: 'Custos da frota',
      modulo: 'Frota',
      descricao: 'Custo da frota por categoria, mês, base, processo, tipo, regime e veículo; concentração, veículos fora da curva e maiores altas.',
      rota: '/frota/relatorios/custos',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [
        filtroPainel('base', 'Base', (f.idBase ?? []).map((id) => this.recorte.nomeBase(id)), f.idBase ?? []),
        filtroPainel('categoria', 'Categoria', this.categoriasAplicadas().map((c) => ROTULO_CATEGORIA[c]), this.categoriasAplicadas())
      ],
      metricas: m ? [
        metricaPainel('custoTotal', 'Custo total', m.total, 'moeda', {
          comparacao: m.anterior ? { rotulo: 'vs. período anterior', valorAnterior: m.anterior, variacaoPercentual: (m.total / m.anterior - 1) * 100, melhorQuando: 'menor' } : undefined
        }),
        metricaPainel('custoKm', 'Custo por km', m.custoKm, 'moeda'),
        metricaPainel('veiculoMes', 'Custo por veículo/mês', m.veiculoMes, 'moeda'),
        metricaPainel('concentracao', 'Veículos que fazem 80% do custo', m.concentracao.itens, 'inteiro', { descricao: `de ${m.concentracao.total} com custo` }),
        metricaPainel('foraDaCurva', 'Veículos com R$/km 50% acima do tipo', m.foraDaCurva.length, 'inteiro')
      ] : [],
      graficos: m ? [
        graficoPainel('categorias', 'pizza', 'Custo por categoria', m.porCategoria.map((c) => c.rotulo), m.porCategoria.map((c) => c.valor), { formato: 'moeda' }),
        graficoPainel('mensal', 'barra', 'Custo por mês', m.mensal.map((x) => rotuloMes(x.mes)), m.mensal.map((x) => x.total), { formato: 'moeda' }),
        graficoPainel('veiculos', 'tabela', 'Veículos que mais custaram', m.veiculos.slice(0, 15).map((v) => v.placa), m.veiculos.slice(0, 15).map((v) => v.custo),
          { formato: 'moeda', totalCategorias: m.veiculos.length }),
        graficoPainel('bases', 'barra', 'Custo por base', m.grupos.base.map((g) => g.nome), m.grupos.base.map((g) => g.custo), { formato: 'moeda' })
      ] : [],
      datasets: ['veiculos', 'ordens_servico', 'abastecimentos', 'despesas'],
      sugestoes: [
        { rotulo: 'Onde cortar custo', icone: 'pi pi-scissors', requer: ['dados', 'analise'],
          pergunta: 'Onde está o maior desperdício nos custos da frota deste recorte e quanto dá para economizar?' },
        { rotulo: 'Por que o custo mudou?', icone: 'pi pi-arrow-right-arrow-left', requer: ['dados', 'analise'],
          pergunta: 'O que explica a variação do custo da frota em relação ao período anterior?' }
      ]
    };
  });
}
