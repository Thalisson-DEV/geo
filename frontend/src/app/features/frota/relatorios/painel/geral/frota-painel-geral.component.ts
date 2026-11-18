import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ParamMap, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoChartComponent,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDrillStateService,
  GeoFilterChip,
  GeoFilterPanelComponent,
  GeoPageHeaderComponent,
  GeoTone
} from '@geo/ui';
import { of } from 'rxjs';

import { FiltroRelatorioFrota } from '../../../../../core/models/frota-relatorios.models';
import { AlvoAnalise, VistaAnalise } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { DashboardAnaliseComponent } from '../../../../../shared/components/dashboard/dashboard-analise.component';
import { NavegacaoAnaliseService } from '../../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardMetricCardComponent, MetricTone } from '../../../../../shared/components/dashboard/dashboard-ui.components';
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
import { LIMITES_FROTA, visaoRelatorioFrota } from '../../frota-relatorios-gerenciais.visao';
import { comparacao, inteiro, moeda, moedaCurta, numero, pct, rotuloMes } from '../frota-analise-comum';
import { FrotaPainelTopoComponent, FrotaRecorteCamposComponent } from '../frota-painel.components';
import { PainelFrotaBase } from '../painel-frota-base';
import { RecorteFrotaService } from '../recorte-frota.service';
import { BaseScore, ModeloGeral, VeiculoAtencao, modeloGeral, vistaGeral } from './analise-geral';

interface ItemSituacao {
  id: string;
  rotulo: string;
  valor: string;
  tom: GeoTone;
  painel: string;
  drill: string;
}

/**
 * Visão geral da frota: o veredito do período, os grandes números de cada assunto e a porta de entrada
 * para os painéis de custos, manutenção, combustível, uso e conformidade, levando o mesmo recorte.
 */
@Component({
  selector: 'app-frota-painel-geral',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteFrotaService, GeoDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoChartComponent, GeoDataTableComponent, GeoFilterPanelComponent,
    GeoPageHeaderComponent, DashboardMetricCardComponent, DashboardVisaoGerencialComponent, DashboardAnaliseComponent, FrotaPainelTopoComponent,
    FrotaRecorteCamposComponent, CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './frota-painel-geral.component.html',
  styleUrl: '../painel-frota.css'
})
export class FrotaPainelGeralComponent extends PainelFrotaBase<boolean> {
  private readonly router = inject(Router);

  protected readonly moeda = moeda;
  protected readonly moedaCurta = moedaCurta;
  protected readonly inteiro = inteiro;
  protected readonly pct = pct;
  protected readonly numero = numero;
  protected readonly comparacao = comparacao;
  protected readonly limites = LIMITES_FROTA;
  protected readonly chipsProprios = computed<GeoFilterChip[]>(() => []);

  protected readonly modelo = computed<ModeloGeral | null>(() => {
    const g = this.gerencial();
    return g ? modeloGeral(g) : null;
  });
  protected readonly visao = computed(() => {
    const g = this.gerencial();
    return g ? visaoRelatorioFrota(g) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaGeral(a, m, this.recorte.queryParams()) : null;
  });

  /** Documento ou CNH vencidos e veículo sem seguro: o que pode parar a frota hoje. */
  protected readonly irregularidades = computed(() => {
    const c = this.gerencial()?.conformidade;
    return c ? c.documentosVencidos + c.cnhVencidas + (c.semSeguro?.length ?? 0) : 0;
  });

  /** Situação de hoje, cada linha levando ao painel e à análise que a explica. */
  protected readonly situacao = computed<ItemSituacao[]>(() => {
    const d = this.gerencial();
    if (!d) return [];
    const c = d.conformidade;
    const itens: ItemSituacao[] = [];
    if (d.manutencao) {
      itens.push({ id: 'parados', rotulo: 'Parados por manutenção', valor: inteiro(d.manutencao.paradosAgora.length),
        tom: d.manutencao.paradosAgora.length ? 'warning' : 'success', painel: 'manutencao', drill: 'kpi:parados' });
      itens.push({ id: 'fila', rotulo: 'OS abertas há mais de 30 dias', valor: inteiro(d.manutencao.fila.acima30Dias),
        tom: d.manutencao.fila.acima30Dias ? 'warning' : 'success', painel: 'manutencao', drill: 'faixa:acima30' });
      itens.push({ id: 'preventiva', rotulo: 'Preventivas vencidas', valor: inteiro(d.manutencao.preventivasVencidas),
        tom: d.manutencao.preventivasVencidas ? 'warning' : 'success', painel: 'manutencao', drill: 'kpi:preventiva' });
    }
    itens.push({ id: 'docs', rotulo: 'Documentos vencidos', valor: inteiro(c.documentosVencidos), tom: c.documentosVencidos ? 'danger' : 'success',
      painel: 'conformidade', drill: 'kpi:documentos' });
    itens.push({ id: 'cnh', rotulo: 'CNH vencidas', valor: inteiro(c.cnhVencidas), tom: c.cnhVencidas ? 'danger' : 'success', painel: 'conformidade', drill: 'kpi:cnh' });
    if (c.semSeguro) {
      itens.push({ id: 'seguro', rotulo: 'Sem seguro vigente', valor: inteiro(c.semSeguro.length), tom: c.semSeguro.length ? 'danger' : 'success',
        painel: 'conformidade', drill: 'kpi:seguro' });
    }
    itens.push({ id: 'pendencias', rotulo: 'Pendências de checklist', valor: inteiro(c.pendenciasAbertas), tom: c.pendenciasAbertas ? 'warning' : 'success',
      painel: 'conformidade', drill: 'kpi:pendencias' });
    return itens;
  });

  private readonly categorias = computed(() => (this.gerencial()?.custos.porCategoria ?? []).filter((c) => c.valor > 0));
  protected readonly graficoCategorias = computed(() => ({
    rotulos: this.categorias().map((c) => c.rotulo), series: [{ name: 'Custo', values: this.categorias().map((c) => c.valor) }]
  }));

  protected readonly graficoMensal = computed(() => {
    const m = this.gerencial()?.custos.mensal ?? [];
    const partes = [['manutencao', 'Manutenção'], ['combustivel', 'Combustível'], ['despesas', 'Despesas'], ['seguro', 'Seguro'],
      ['locacao', 'Locação'], ['franquias', 'Franquias']] as const;
    return {
      rotulos: m.map((x) => rotuloMes(x.mes)),
      series: partes.filter(([k]) => m.some((x) => Number(x[k]) > 0)).map(([k, nome]) => ({ name: nome, values: m.map((x) => Number(x[k])) }))
    };
  });
  protected readonly basesGrafico = computed(() => (this.modelo()?.bases ?? []).filter((b) => b.custoKm != null).slice(0, 12));
  protected readonly graficoBases = computed(() => ({
    rotulos: this.basesGrafico().map((b) => b.nome), series: [{ name: 'R$/km', values: this.basesGrafico().map((b) => b.custoKm ?? 0) }]
  }));

  protected readonly chaveVeiculo = (x: { idVeiculo: string }) => x.idVeiculo;
  protected readonly chaveBase = (b: BaseScore) => b.id;
  protected readonly mesDoGrafico = (x: { mes: string }) => x.mes;

  protected readonly colAtencao: GeoDataTableColumn<VeiculoAtencao>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'base', header: 'Base', priority: 3, value: (x) => x.v.base ?? '' },
    { key: 'pontos', header: 'Pontos', type: 'integer', priority: 2 },
    { key: 'resumo', header: 'Por quê', priority: 1 }
  ];
  protected abrirMes(indice: number): void {
    const mes = this.gerencial()?.custos.mensal[indice];
    if (mes) this.abrirPainel('custos', `mes:${mes.mes}`);
  }

  protected abrirCategoria(indice: number): void {
    const c = this.categorias()[indice];
    if (c) this.abrirPainel('custos', `categoria:${c.categoria}`);
  }

  protected tomPreventiva(v: number | null | undefined): MetricTone {
    if (v == null) return 'slate';
    return v < LIMITES_FROTA.preventivaMinima ? 'amber' : v >= LIMITES_FROTA.preventivaBoa ? 'green' : 'primary';
  }

  protected readonly colBases: GeoDataTableColumn<BaseScore>[] = [
    { key: 'nome', header: 'Base', priority: 1 },
    { key: 'veiculos', header: 'Veículos', type: 'custom', priority: 2, value: (b) => b.veiculos.length, display: (b) => inteiro(b.veiculos.length) },
    { key: 'custo', header: 'Custo', type: 'currency', priority: 1 },
    { key: 'custoKm', header: 'R$/km', type: 'custom', priority: 1, value: (b) => b.custoKm ?? -1, display: (b) => moeda(b.custoKm) },
    { key: 'disponibilidade', header: 'Disponibilidade', type: 'custom', priority: 1, value: (b) => b.disponibilidade ?? -1, display: (b) => pct(b.disponibilidade) },
    { key: 'checklist', header: 'Checklist', type: 'custom', priority: 2, value: (b) => b.checklist ?? -1, display: (b) => pct(b.checklist) },
    { key: 'foraConsumo', header: 'Consumo fora', type: 'integer', priority: 3 },
    { key: 'ociosos', header: 'Ociosos', type: 'integer', priority: 2 },
    { key: 'custoSobreFaturamento', header: 'Custo/faturamento', type: 'custom', priority: 3, value: (b) => b.custoSobreFaturamento ?? -1, display: (b) => pct(b.custoSobreFaturamento) }
  ];

  constructor() {
    super();
    this.iniciar();
  }

  protected carregarDetalhe(_f: FiltroRelatorioFrota) {
    return of(true);
  }
  protected parametrosProprios() {
    return {};
  }
  protected lerProprios(_q: ParamMap): void {}
  protected aplicarProprios(): void {}
  protected limparProprios(): void {}
  protected removerProprio(_chave: string): void {}

  protected abrirPainel(painel: string, drill?: string): void {
    void this.router.navigate(painel === 'geral' ? ['/frota/relatorios'] : ['/frota/relatorios', painel],
      { queryParams: { ...this.recorte.queryParams(), ...(drill ? { drill } : {}) } });
  }

  /** As leituras da visão gerencial apontam para o painel do assunto. */
  protected abrirLeitura(alvo: AlvoAnalise): void {
    if (alvo.dimension === 'aba') this.abrirPainel(alvo.value);
    else this.analisar(alvo.dimension, alvo.value);
  }

  protected tomCusto(): MetricTone {
    const d = this.gerencial();
    if (!d?.resumo.custoTotal.anterior) return 'primary';
    return ((d.resumo.custoTotal.atual ?? 0) - d.resumo.custoTotal.anterior) / d.resumo.custoTotal.anterior > LIMITES_FROTA.aumentoCusto ? 'amber' : 'primary';
  }

  protected tomDisponibilidade(v: number | null | undefined): MetricTone {
    if (v == null) return 'slate';
    return v < LIMITES_FROTA.disponibilidadeCritica ? 'red' : v < LIMITES_FROTA.disponibilidadeAtencao ? 'amber' : 'green';
  }

  protected percentual(v: number | null | undefined): number | null {
    return v == null ? null : v * 100;
  }

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const d = this.gerencial();
    const f = this.recorte.aplicado();
    return {
      id: 'frota.visao-geral', nome: 'Visão geral da frota', modulo: 'Frota', rota: '/frota/relatorios',
      descricao: 'Resumo executivo da frota: custo, disponibilidade, preventiva, combustível, uso, conformidade, ranking das bases e veículos que pedem atenção.',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [filtroPainel('base', 'Base', (f.idBase ?? []).map((id) => this.recorte.nomeBase(id)), f.idBase ?? [])],
      metricas: d ? [
        metricaPainel('custoTotal', 'Custo total', d.resumo.custoTotal.atual, 'moeda', { comparacao: d.resumo.custoTotal.anterior ? { rotulo: 'vs. período anterior', valorAnterior: d.resumo.custoTotal.anterior, melhorQuando: 'menor' } : undefined }),
        metricaPainel('custoKm', 'Custo por km', d.resumo.custoPorKm.atual, 'moeda'),
        metricaPainel('disponibilidade', 'Disponibilidade (%)', d.resumo.disponibilidade?.atual != null ? d.resumo.disponibilidade.atual * 100 : null, 'percentual'),
        metricaPainel('preventiva', 'OS preventivas (%)', d.resumo.percentualPreventiva?.atual != null ? d.resumo.percentualPreventiva.atual * 100 : null, 'percentual'),
        metricaPainel('custoFaturamento', 'Custo sobre faturamento (%)', d.resumo.custoSobreFaturamento.atual != null ? d.resumo.custoSobreFaturamento.atual * 100 : null, 'percentual'),
        metricaPainel('atencao', 'Veículos que pedem atenção', this.modelo()?.atencao.length ?? null, 'inteiro')
      ] : [],
      graficos: d ? [
        graficoPainel('mensal', 'barra', 'Custo por mês', d.custos.mensal.map((x) => rotuloMes(x.mes)), d.custos.mensal.map((x) => x.total), { formato: 'moeda' }),
        graficoPainel('bases', 'tabela', 'Custo por km por base', (this.modelo()?.bases ?? []).map((b) => b.nome), (this.modelo()?.bases ?? []).map((b) => b.custoKm), { formato: 'moeda' })
      ] : [],
      datasets: ['veiculos', 'ordens_servico', 'abastecimentos', 'despesas', 'checklists'],
      sugestoes: [
        { rotulo: 'Resumo para a diretoria', icone: 'pi pi-briefcase', requer: ['dados', 'analise'], pergunta: 'Escreva um resumo executivo da frota neste período para a diretoria: números, riscos e 3 decisões.' }
      ]
    };
  });
}
