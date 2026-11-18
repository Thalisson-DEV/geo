import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ParamMap } from '@angular/router';
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

import { DetalheUsoFrota, FiltroRelatorioFrota } from '../../../../../core/models/frota-relatorios.models';
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
import { LIMITES_FROTA } from '../../frota-relatorios-gerenciais.visao';
import { inteiro, moeda, moedaCurta, numero, pct, rotuloMes, textoVariacao } from '../frota-analise-comum';
import { FrotaPainelTopoComponent, FrotaRecorteCamposComponent } from '../frota-painel.components';
import { PainelFrotaBase } from '../painel-frota-base';
import { RecorteFrotaService } from '../recorte-frota.service';
import { ClasseUso, GrupoUso, ModeloUso, ROTULO_CLASSE, VeiculoUso, modeloUso, vistaUso, visaoUso } from './analise-uso';

const CLASSES: GeoSelectOption<string>[] = Object.entries(ROTULO_CLASSE).map(([value, label]) => ({ label, value }));

/**
 * Painel de uso e produtividade: km, turnos, faturamento por veículo, custo da frota sobre o que ela
 * ajuda a faturar, ociosos, subutilizados e telemetria. Filtro próprio de classe de uso.
 */
@Component({
  selector: 'app-frota-painel-uso',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteFrotaService, GeoDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoCellDirective, GeoChartComponent, GeoDataTableComponent,
    GeoFilterPanelComponent, GeoMultiSelectComponent, GeoPageHeaderComponent, GeoStatusComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, FrotaPainelTopoComponent, FrotaRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './frota-painel-uso.component.html',
  styleUrl: '../painel-frota.css'
})
export class FrotaPainelUsoComponent extends PainelFrotaBase<DetalheUsoFrota> {
  protected readonly moeda = moeda;
  protected readonly moedaCurta = moedaCurta;
  protected readonly inteiro = inteiro;
  protected readonly numero = numero;
  protected readonly pct = pct;
  protected readonly textoVariacao = textoVariacao;
  protected readonly limites = LIMITES_FROTA;
  protected readonly classes = CLASSES;
  protected readonly rotuloDaClasse = (c: string) => ROTULO_CLASSE[c as ClasseUso] ?? c;

  protected readonly classeSel = signal<string[]>([]);
  private readonly classesAplicadas = signal<string[]>([]);
  protected readonly chipsProprios = computed<GeoFilterChip[]>(() => {
    const c = this.classesAplicadas();
    return c.length ? [{ key: 'uso', label: `Uso: ${c.length === 1 ? ROTULO_CLASSE[c[0] as ClasseUso] : `${c.length} selecionados`}` }] : [];
  });

  protected readonly modelo = computed<ModeloUso | null>(() => {
    const g = this.gerencial();
    const d = this.detalhe();
    return g && d ? modeloUso(g, d, this.classesAplicadas()) : null;
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoUso(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaUso(a, m) : null;
  });

  protected readonly graficoMensal = computed(() => {
    const x = this.modelo()?.mensal ?? [];
    return { rotulos: x.map((i) => rotuloMes(i.mes)), km: [{ name: 'Km', values: x.map((i) => i.km) }], faturado: [{ name: 'Faturado', values: x.map((i) => i.faturado) }] };
  });
  protected readonly basesGrafico = computed(() => (this.modelo()?.porBase ?? []).slice(0, 12));
  protected readonly processosGrafico = computed(() => (this.modelo()?.porProcesso ?? []).filter((g) => g.custoSobreFaturamento != null).slice(0, 12));
  protected readonly graficoBases = computed(() => ({ rotulos: this.basesGrafico().map((g) => g.nome), series: [{ name: 'Km', values: this.basesGrafico().map((g) => g.km) }] }));
  protected readonly graficoProcessos = computed(() => ({
    rotulos: this.processosGrafico().map((g) => g.nome), series: [{ name: 'Custo/faturamento', values: this.processosGrafico().map((g) => g.custoSobreFaturamento ?? 0) }]
  }));
  protected readonly graficoFaixas = computed(() => {
    const f = this.modelo()?.faixas ?? [];
    return { rotulos: f.map((x) => x.faixa.rotulo), series: [{ name: 'Veículos', values: f.map((x) => x.veiculos.length) }] };
  });

  protected readonly chaveVeiculo = (v: { idVeiculo: string }) => v.idVeiculo;
  protected readonly chaveGrupo = (g: { id: string }) => g.id;
  protected readonly mesDoGrafico = (x: { mes: string }) => x.mes;
  protected readonly chaveFaixa = (f: { faixa: { chave: string } }) => f.faixa.chave;

  protected readonly colVeiculos: GeoDataTableColumn<VeiculoUso>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'processo', header: 'Processo', priority: 3, value: (v) => v.processo ?? '' },
    { key: 'classe', header: 'Uso', type: 'custom', priority: 1, value: (v) => v.classe },
    { key: 'km', header: 'Km', type: 'integer', priority: 1 },
    { key: 'kmDiaUtil', header: 'Km/dia útil', type: 'custom', priority: 3, value: (v) => v.kmDiaUtil ?? 0, display: (v) => numero(v.kmDiaUtil, 0) },
    { key: 'turnos', header: 'Turnos', type: 'integer', priority: 2 },
    { key: 'notas', header: 'Notas', type: 'integer', priority: 3 },
    { key: 'faturado', header: 'Faturado', type: 'currency', priority: 1 },
    { key: 'total', header: 'Custo', type: 'currency', priority: 2 },
    { key: 'custoSobreFaturamento', header: 'Custo/faturamento', type: 'custom', priority: 1, value: (v) => v.custoSobreFaturamento ?? -1, display: (v) => pct(v.custoSobreFaturamento) },
    { key: 'horasLigadoParado', header: 'Ligado parado (h)', type: 'custom', priority: 3, value: (v) => v.horasLigadoParado ?? -1, display: (v) => numero(v.horasLigadoParado) },
    { key: 'kmForaExpediente', header: 'Km fora do expediente', type: 'custom', priority: 3, value: (v) => v.kmForaExpediente ?? -1, display: (v) => numero(v.kmForaExpediente) }
  ];
  protected readonly colGrupos: GeoDataTableColumn<GrupoUso>[] = [
    { key: 'nome', header: 'Processo', priority: 1 },
    { key: 'veiculos', header: 'Veículos', type: 'custom', priority: 2, value: (g) => g.veiculos.length, display: (g) => inteiro(g.veiculos.length) },
    { key: 'km', header: 'Km', type: 'integer', priority: 2 },
    { key: 'turnos', header: 'Turnos', type: 'integer', priority: 2 },
    { key: 'faturado', header: 'Faturado', type: 'currency', priority: 1 },
    { key: 'custo', header: 'Custo da frota', type: 'currency', priority: 2 },
    { key: 'custoSobreFaturamento', header: 'Custo/faturamento', type: 'custom', priority: 1, value: (g) => g.custoSobreFaturamento ?? -1, display: (g) => pct(g.custoSobreFaturamento) }
  ];
  protected readonly colOciosos: GeoDataTableColumn<VeiculoUso>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'tipo', header: 'Tipo', priority: 2, value: (v) => v.tipo ?? '' },
    { key: 'base', header: 'Base', priority: 2, value: (v) => v.base ?? '' },
    { key: 'regime', header: 'Regime', priority: 2, value: (v) => (v.regime === 'LOCADO' ? 'Locado' : v.regime === 'PROPRIO' ? 'Próprio' : '') },
    { key: 'total', header: 'Custo no período', type: 'currency', priority: 1 }
  ];

  constructor() {
    super();
    this.iniciar();
  }

  protected carregarDetalhe(f: FiltroRelatorioFrota) {
    return this.relatorios.uso(f);
  }
  protected parametrosProprios() {
    return { uso: this.classesAplicadas().join(',') || null };
  }
  protected lerProprios(q: ParamMap): void {
    this.classeSel.set((q.get('uso') ?? '').split(',').filter(Boolean));
  }
  protected aplicarProprios(): void {
    this.classesAplicadas.set(this.classeSel());
  }
  protected limparProprios(): void {
    this.classeSel.set([]);
  }
  protected removerProprio(chave: string): void {
    if (chave === 'uso') this.classeSel.set([]);
  }

  protected tomClasse(c: string): 'warning' | 'info' | 'success' | 'neutral' {
    return c === 'OCIOSO' ? 'warning' : c === 'SUBUTILIZADO' ? 'info' : c === 'INTENSO' ? 'neutral' : 'success';
  }

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    return {
      id: 'frota.uso', nome: 'Uso e produtividade da frota', modulo: 'Frota', rota: '/frota/relatorios/uso',
      descricao: 'Km rodado, turnos, notas e faturamento por veículo, custo da frota sobre o faturamento, veículos ociosos e subutilizados e telemetria.',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [
        filtroPainel('base', 'Base', (f.idBase ?? []).map((id) => this.recorte.nomeBase(id)), f.idBase ?? []),
        filtroPainel('uso', 'Uso', this.classesAplicadas().map((c) => ROTULO_CLASSE[c as ClasseUso]), this.classesAplicadas())
      ],
      metricas: m ? [
        metricaPainel('km', 'Km rodado', m.km, 'inteiro'),
        metricaPainel('faturado', 'Faturado pelas equipes com veículo', m.faturado, 'moeda'),
        metricaPainel('custoSobreFaturamento', 'Custo da frota sobre o faturamento (%)', m.custoSobreFaturamento != null ? m.custoSobreFaturamento * 100 : null, 'percentual'),
        metricaPainel('ociosos', 'Veículos ociosos', m.ociosos.length, 'inteiro'),
        metricaPainel('subutilizados', 'Veículos subutilizados', m.subutilizados.length, 'inteiro'),
        metricaPainel('ligadoParado', 'Horas de motor ligado parado', m.ligadoParado, 'horas')
      ] : [],
      graficos: m ? [
        graficoPainel('km', 'barra', 'Km por mês', m.mensal.map((x) => rotuloMes(x.mes)), m.mensal.map((x) => x.km), { formato: 'inteiro' }),
        graficoPainel('processos', 'tabela', 'Custo sobre faturamento por processo', m.porProcesso.map((g) => g.nome), m.porProcesso.map((g) => (g.custoSobreFaturamento ?? 0) * 100), { formato: 'percentual' })
      ] : [],
      datasets: ['veiculos', 'turnos', 'execucoes'],
      sugestoes: [
        { rotulo: 'Tamanho da frota', icone: 'pi pi-car', requer: ['dados', 'analise'], pergunta: 'A frota deste recorte está do tamanho certo? Quantos veículos dá para devolver ou remanejar e quanto isso economiza?' }
      ]
    };
  });
}
