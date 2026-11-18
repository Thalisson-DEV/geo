import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ParamMap, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoChartComponent,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDrillStateService,
  GeoFilterChip,
  GeoFilterPanelComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectOption,
  GeoStatusComponent
} from '@geo/ui';

import { AbastecimentoDetalheFrota, DetalheCombustivelFrota, FiltroRelatorioFrota } from '../../../../../core/models/frota-relatorios.models';
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
import { NOMES_DIA, ROTULO_ALERTA, inteiro, moeda, moedaCurta, numero, pct, rotulo, rotuloMes, textoVariacao } from '../frota-analise-comum';
import { FrotaPainelTopoComponent, FrotaRecorteCamposComponent } from '../frota-painel.components';
import { PainelFrotaBase } from '../painel-frota-base';
import { RecorteFrotaService } from '../recorte-frota.service';
import {
  CondutorCombustivel,
  FiltrosCombustivel,
  ModeloCombustivel,
  PostoCombustivel,
  VeiculoCombustivel,
  modeloCombustivel,
  vistaCombustivel,
  visaoCombustivel
} from './analise-combustivel';

const ALERTAS: GeoSelectOption<string>[] = Object.entries(ROTULO_ALERTA).map(([value, label]) => ({ label, value }));

/**
 * Painel de combustível: litros, preço, consumo contra a referência, postos, alertas, condutores e
 * horários. Filtros próprios de posto, alerta e condutor.
 */
@Component({
  selector: 'app-frota-painel-combustivel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteFrotaService, GeoDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoCellDirective, GeoChartComponent, GeoDataTableComponent,
    GeoFilterPanelComponent, GeoMultiSelectComponent, GeoPageHeaderComponent, GeoStatusComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, FrotaPainelTopoComponent, FrotaRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './frota-painel-combustivel.component.html',
  styleUrl: '../painel-frota.css'
})
export class FrotaPainelCombustivelComponent extends PainelFrotaBase<DetalheCombustivelFrota> {
  private readonly router = inject(Router);

  protected readonly moeda = moeda;
  protected readonly moedaCurta = moedaCurta;
  protected readonly inteiro = inteiro;
  protected readonly numero = numero;
  protected readonly pct = pct;
  protected readonly textoVariacao = textoVariacao;
  protected readonly alertasOpcoes = ALERTAS;

  protected readonly postoSel = signal<string[]>([]);
  protected readonly alertaSel = signal<string[]>([]);
  protected readonly condutorSel = signal<string[]>([]);
  private readonly proprios = signal<FiltrosCombustivel>({ postos: [], alertas: [], condutores: [] });

  /** Postos e condutores que aparecem nos abastecimentos do recorte. */
  protected readonly opcoesPosto = computed<GeoSelectOption<string>[]>(() => {
    const mapa = new Map((this.detalhe()?.atual ?? []).map((a) => [a.idPosto, a.posto]));
    return [...mapa].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  });
  protected readonly opcoesCondutor = computed<GeoSelectOption<string>[]>(() => {
    const mapa = new Map((this.detalhe()?.atual ?? []).filter((a) => a.idCondutor).map((a) => [a.idCondutor!, a.condutor ?? 'Condutor']));
    return [...mapa].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly chipsProprios = computed<GeoFilterChip[]>(() => {
    const f = this.proprios();
    const chip = (key: string, nome: string, sel: string[], ops: GeoSelectOption<string>[]) =>
      sel.length ? [{ key, label: `${nome}: ${sel.length === 1 ? (ops.find((o) => o.value === sel[0])?.label ?? 'selecionado') : `${sel.length} selecionados`}` }] : [];
    return [...chip('posto', 'Posto', f.postos, this.opcoesPosto()), ...chip('alerta', 'Alerta', f.alertas, ALERTAS),
      ...chip('condutor', 'Condutor', f.condutores, this.opcoesCondutor())];
  });

  protected readonly modelo = computed<ModeloCombustivel | null>(() => {
    const g = this.gerencial();
    const d = this.detalhe();
    return g && d ? modeloCombustivel(g, d, this.proprios()) : null;
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoCombustivel(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaCombustivel(a, m) : null;
  });

  protected readonly graficoMensal = computed(() => {
    const m = this.modelo();
    const x = m?.mensal ?? [];
    return { rotulos: x.map((i) => rotuloMes(i.mes)), litros: [{ name: 'Litros', values: x.map((i) => i.litros) }], preco: [{ name: 'R$/litro', values: x.map((i) => i.preco) }] };
  });
  protected readonly postosTop = computed(() => [...(this.modelo()?.postos ?? [])].filter((p) => p.preco != null).sort((a, b) => (b.preco ?? 0) - (a.preco ?? 0)).slice(0, 12));
  protected readonly graficoPostos = computed(() => ({
    rotulos: this.postosTop().map((p) => p.nome), series: [{ name: 'R$/litro', values: this.postosTop().map((p) => p.preco ?? 0) }]
  }));
  protected readonly graficoAlertas = computed(() => {
    const g = this.modelo()?.alertas ?? [];
    return { rotulos: g.map((x) => x.rotulo), series: [{ name: 'Abastecimentos', values: g.map((x) => x.linhas.length) }] };
  });
  protected readonly graficoDias = computed(() => ({ rotulos: NOMES_DIA, series: [{ name: 'Abastecimentos', values: this.modelo()?.porDia ?? [] }] }));
  protected readonly dias = NOMES_DIA.map((_, i) => String(i));

  protected readonly chaveId = (x: { id: string }) => x.id;
  protected readonly chaveVeiculo = (x: { idVeiculo: string }) => x.idVeiculo;
  protected readonly chaveCondutor = (x: CondutorCombustivel) => x.chave;
  protected readonly chaveGrupo = (g: { chave: string }) => g.chave;
  protected readonly mesDoGrafico = (x: { mes: string }) => x.mes;
  protected readonly identidade = (v: string) => v;

  protected readonly colVeiculos: GeoDataTableColumn<VeiculoCombustivel>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'tipo', header: 'Tipo', priority: 3, value: (x) => x.v.tipo ?? '' },
    { key: 'abastecimentos', header: 'Abastecimentos', type: 'custom', priority: 2, value: (x) => x.linhas.length, display: (x) => inteiro(x.linhas.length) },
    { key: 'litros', header: 'Litros', type: 'number', priority: 2 },
    { key: 'valor', header: 'Gasto', type: 'currency', priority: 1 },
    { key: 'kmL', header: 'km/l', type: 'custom', priority: 1, value: (x) => x.kmL ?? -1, display: (x) => numero(x.kmL, 2) },
    { key: 'referencia', header: 'Referência', type: 'custom', priority: 2, value: (x) => x.referencia ?? -1, display: (x) => numero(x.referencia, 2) },
    { key: 'desvio', header: 'Situação', type: 'custom', priority: 1, value: (x) => x.desvio ?? 0 },
    { key: 'custoKm', header: 'R$/km', type: 'custom', priority: 3, value: (x) => x.custoKm ?? -1, display: (x) => moeda(x.custoKm) },
    { key: 'alertas', header: 'Com alerta', type: 'integer', priority: 2 }
  ];
  protected readonly colPostos: GeoDataTableColumn<PostoCombustivel>[] = [
    { key: 'nome', header: 'Posto', priority: 1 },
    { key: 'abastecimentos', header: 'Abastecimentos', type: 'custom', priority: 2, value: (p) => p.linhas.length, display: (p) => inteiro(p.linhas.length) },
    { key: 'litros', header: 'Litros', type: 'number', priority: 2 },
    { key: 'valor', header: 'Gasto', type: 'currency', priority: 1 },
    { key: 'preco', header: 'R$/litro', type: 'custom', priority: 1, value: (p) => p.preco ?? 0, display: (p) => moeda(p.preco) },
    { key: 'sobrepreco', header: 'Contra a média', type: 'custom', priority: 1, value: (p) => p.sobrepreco,
      display: (p) => `${p.sobrepreco >= 0 ? '+' : '−'}${moeda(Math.abs(p.sobrepreco))}` }
  ];
  protected readonly colCondutores: GeoDataTableColumn<CondutorCombustivel>[] = [
    { key: 'nome', header: 'Condutor', priority: 1 },
    { key: 'abastecimentos', header: 'Abastecimentos', type: 'custom', priority: 1, value: (c) => c.linhas.length, display: (c) => inteiro(c.linhas.length) },
    { key: 'litros', header: 'Litros', type: 'number', priority: 2 },
    { key: 'veiculos', header: 'Veículos', type: 'integer', priority: 3 },
    { key: 'alertas', header: 'Com alerta', type: 'integer', priority: 1 }
  ];
  protected readonly colAbastecimentos: GeoDataTableColumn<AbastecimentoDetalheFrota>[] = [
    { key: 'realizadoEm', header: 'Data', type: 'date', priority: 1 },
    { key: 'placa', header: 'Veículo', priority: 1, value: (a) => a.placa ?? '—' },
    { key: 'posto', header: 'Posto', priority: 2 },
    { key: 'condutor', header: 'Condutor', priority: 3, value: (a) => a.condutor ?? '—' },
    { key: 'litros', header: 'Litros', type: 'number', priority: 2 },
    { key: 'precoLitro', header: 'R$/l', type: 'custom', priority: 2, value: (a) => a.precoLitro ?? 0, display: (a) => moeda(a.precoLitro) },
    { key: 'valorTotal', header: 'Valor', type: 'currency', priority: 1 },
    { key: 'alertas', header: 'Alertas', type: 'custom', priority: 1, value: (a) => a.alertas.length,
      display: (a) => a.alertas.map((t) => rotulo(ROTULO_ALERTA, t)).join(', ') || '—' }
  ];

  constructor() {
    super();
    this.iniciar();
  }

  protected carregarDetalhe(f: FiltroRelatorioFrota) {
    return this.relatorios.combustivel(f);
  }
  protected parametrosProprios() {
    const f = this.proprios();
    const j = (l: string[]) => l.join(',') || null;
    return { posto: j(f.postos), alerta: j(f.alertas), condutor: j(f.condutores) };
  }
  protected lerProprios(q: ParamMap): void {
    const l = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
    this.postoSel.set(l('posto'));
    this.alertaSel.set(l('alerta'));
    this.condutorSel.set(l('condutor'));
  }
  protected aplicarProprios(): void {
    this.proprios.set({ postos: this.postoSel(), alertas: this.alertaSel(), condutores: this.condutorSel() });
  }
  protected limparProprios(): void {
    this.postoSel.set([]);
    this.alertaSel.set([]);
    this.condutorSel.set([]);
  }
  protected removerProprio(chave: string): void {
    if (chave === 'posto') this.postoSel.set([]);
    if (chave === 'alerta') this.alertaSel.set([]);
    if (chave === 'condutor') this.condutorSel.set([]);
  }

  protected abrirAbastecimento(a: AbastecimentoDetalheFrota): void {
    void this.router.navigate(['/frota/abastecimentos'], { queryParams: { abastecimento: a.id } });
  }

  // ── Bússola ───────────────────────────────────────────────────────────────────────────────
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    const p = this.proprios();
    return {
      id: 'frota.combustivel', nome: 'Combustível da frota', modulo: 'Frota', rota: '/frota/relatorios/combustivel',
      descricao: 'Abastecimentos realizados: litros, gasto, preço por posto, consumo contra a referência, alertas, condutores e dias da semana.',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [
        filtroPainel('base', 'Base', (f.idBase ?? []).map((id) => this.recorte.nomeBase(id)), f.idBase ?? []),
        filtroPainel('posto', 'Posto', p.postos.map((id) => this.opcoesPosto().find((o) => o.value === id)?.label ?? id), p.postos),
        filtroPainel('alerta', 'Alerta', p.alertas.map((a) => rotulo(ROTULO_ALERTA, a)), p.alertas)
      ],
      metricas: m ? [
        metricaPainel('litros', 'Litros', m.litros, 'numero', { comparacao: m.litrosAnterior ? { rotulo: 'vs. período anterior', valorAnterior: m.litrosAnterior, melhorQuando: 'menor' } : undefined }),
        metricaPainel('gasto', 'Gasto com combustível', m.valor, 'moeda'),
        metricaPainel('preco', 'Preço médio do litro', m.preco, 'moeda'),
        metricaPainel('kmL', 'Consumo médio (km/l)', m.kmL, 'numero'),
        metricaPainel('foraDoPadrao', 'Veículos fora do padrão de consumo', m.foraDoPadrao.length, 'inteiro'),
        metricaPainel('comAlerta', 'Abastecimentos com alerta', m.comAlerta.length, 'inteiro'),
        metricaPainel('economia', 'Economia possível nos postos', m.economiaPotencial, 'moeda')
      ] : [],
      graficos: m ? [
        graficoPainel('mensal', 'barra', 'Litros por mês', m.mensal.map((x) => rotuloMes(x.mes)), m.mensal.map((x) => x.litros), { formato: 'numero' }),
        graficoPainel('postos', 'tabela', 'Preço por posto', m.postos.map((x) => x.nome), m.postos.map((x) => x.preco), { formato: 'moeda' }),
        graficoPainel('alertas', 'barra', 'Alertas por tipo', m.alertas.map((x) => x.rotulo), m.alertas.map((x) => x.linhas.length), { formato: 'inteiro' })
      ] : [],
      datasets: ['abastecimentos', 'abastecimento_itens', 'veiculos'],
      sugestoes: [
        { rotulo: 'Sinais de fraude', icone: 'pi pi-shield', requer: ['dados', 'analise'], pergunta: 'Há sinais de fraude ou desvio de combustível neste recorte? Quais abastecimentos e veículos conferir primeiro?' },
        { rotulo: 'Postos', icone: 'pi pi-map-marker', requer: ['dados', 'analise'], pergunta: 'Quais postos estão cobrando acima da média e quanto dá para economizar trocando de posto?' }
      ]
    };
  });
}
