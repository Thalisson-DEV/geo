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
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent
} from '@geo/ui';

import {
  CnhDetalheFrota,
  DetalheConformidadeFrota,
  DocumentoDetalheFrota,
  FiltroRelatorioFrota,
  PendenciaDetalheFrota,
  VeiculoRelatorioFrota
} from '../../../../../core/models/frota-relatorios.models';
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
import { ROTULO_DOCUMENTO, inteiro, moeda, numero, pct, rotulo, textoVariacao } from '../frota-analise-comum';
import { FrotaPainelTopoComponent, FrotaRecorteCamposComponent } from '../frota-painel.components';
import { PainelFrotaBase } from '../painel-frota-base';
import { RecorteFrotaService } from '../recorte-frota.service';
import { GrupoChecklist, ModeloConformidade, modeloConformidade, vistaConformidade, visaoConformidade } from './analise-conformidade';

const HORIZONTES: GeoSelectOption<number>[] = [
  { label: 'Próximos 30 dias', value: 30 }, { label: 'Próximos 60 dias', value: 60 },
  { label: 'Próximos 90 dias', value: 90 }, { label: 'Próximos 180 dias', value: 180 }
];

/**
 * Painel de conformidade e risco: documentos, CNH, seguro, checklist e pendências, sinistros, eventos de
 * condução e acidentes. Filtro próprio do horizonte de vencimento.
 */
@Component({
  selector: 'app-frota-painel-conformidade',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteFrotaService, GeoDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoCellDirective, GeoChartComponent, GeoDataTableComponent,
    GeoFilterPanelComponent, GeoPageHeaderComponent, GeoSelectComponent, GeoStatusComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, FrotaPainelTopoComponent, FrotaRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './frota-painel-conformidade.component.html',
  styleUrl: '../painel-frota.css'
})
export class FrotaPainelConformidadeComponent extends PainelFrotaBase<DetalheConformidadeFrota> {
  protected readonly inteiro = inteiro;
  protected readonly numero = numero;
  protected readonly moeda = moeda;
  protected readonly pct = pct;
  protected readonly textoVariacao = textoVariacao;
  protected readonly horizontes = HORIZONTES;
  protected readonly limites = LIMITES_FROTA;

  protected readonly horizonteSel = signal<number | null>(90);
  private readonly horizonte = signal(90);
  protected readonly chipsProprios = computed<GeoFilterChip[]>(() =>
    this.horizonte() !== 90 ? [{ key: 'horizonte', label: `Vencimentos: ${HORIZONTES.find((h) => h.value === this.horizonte())?.label.toLowerCase()}` }] : []);

  protected readonly modelo = computed<ModeloConformidade | null>(() => {
    const g = this.gerencial();
    const d = this.detalhe();
    return g && d ? modeloConformidade(g, d, this.horizonte()) : null;
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoConformidade(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaConformidade(a, m) : null;
  });

  protected readonly graficoSemanas = computed(() => {
    const s = this.modelo()?.semanas ?? [];
    return { rotulos: s.map((x) => x.rotulo), series: [{ name: 'Documentos', values: s.map((x) => x.docs.length) }, { name: 'CNH', values: s.map((x) => x.cnh.length) }] };
  });
  protected readonly graficoTipos = computed(() => {
    const g = this.modelo()?.docsPorTipo ?? [];
    return { rotulos: g.map((x) => x.rotulo), series: [
      { name: 'Vencidos', values: g.map((x) => x.linhas.filter((d) => d.dias < 0).length) },
      { name: 'A vencer', values: g.map((x) => x.linhas.filter((d) => d.dias >= 0).length) }] };
  });
  protected readonly graficoBases = computed(() => {
    const g = this.modelo()?.checklistBases ?? [];
    return { rotulos: g.map((x) => x.nome), series: [{ name: 'Cobertura', values: g.map((x) => x.cobertura ?? 0) }] };
  });
  protected readonly itensPend = computed(() => (this.modelo()?.pendPorItem ?? []).slice(0, 10));
  protected readonly graficoItens = computed(() => ({
    rotulos: this.itensPend().map((g) => g.rotulo), series: [{ name: 'Pendências', values: this.itensPend().map((g) => g.linhas.length) }]
  }));
  protected readonly tiposSinistro = computed(() => this.modelo()?.r.conformidade.sinistros?.porTipo ?? []);
  protected readonly graficoSinistros = computed(() => ({
    rotulos: this.tiposSinistro().map((x) => x.rotulo), series: [{ name: 'Sinistros', values: this.tiposSinistro().map((x) => x.total) }]
  }));

  protected readonly chaveId = (x: { id: string }) => x.id;
  protected readonly chaveVeiculo = (x: { idVeiculo: string }) => x.idVeiculo;
  protected readonly chaveCondutor = (x: CnhDetalheFrota) => x.idCondutor;
  protected readonly chaveGrupo = (g: { chave: string }) => g.chave;
  protected readonly chaveBase = (g: GrupoChecklist) => g.id;
  protected readonly chaveSemana = (s: { inicio: string }) => s.inicio;

  protected readonly colDocs: GeoDataTableColumn<DocumentoDetalheFrota>[] = [
    { key: 'placa', header: 'Veículo', priority: 1, value: (d) => d.placa ?? '—' },
    { key: 'tipo', header: 'Documento', priority: 1, value: (d) => rotulo(ROTULO_DOCUMENTO, d.tipo) },
    { key: 'vencimento', header: 'Vencimento', type: 'date', priority: 2 },
    { key: 'dias', header: 'Situação', type: 'custom', priority: 1, value: (d) => d.dias }
  ];
  protected readonly colCnh: GeoDataTableColumn<CnhDetalheFrota>[] = [
    { key: 'nome', header: 'Condutor', priority: 1 },
    { key: 'validade', header: 'Validade', type: 'date', priority: 2 },
    { key: 'dias', header: 'Situação', type: 'custom', priority: 1, value: (c) => c.dias ?? -9999 },
    { key: 'placas', header: 'Veículo atual', type: 'custom', priority: 2, value: (c) => c.placas.join(', '), display: (c) => c.placas.join(', ') || '—' }
  ];
  protected readonly colPend: GeoDataTableColumn<PendenciaDetalheFrota>[] = [
    { key: 'placa', header: 'Veículo', priority: 1, value: (p) => p.placa ?? '—' },
    { key: 'item', header: 'Item', priority: 1 },
    { key: 'dias', header: 'Dias aberta', type: 'integer', priority: 1 },
    { key: 'idOrdemServico', header: 'OS', type: 'custom', priority: 2, value: (p) => (p.idOrdemServico ? 1 : 0), display: (p) => (p.idOrdemServico ? 'Com OS' : 'Sem OS') }
  ];
  protected readonly colChecklist: GeoDataTableColumn<VeiculoRelatorioFrota>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'base', header: 'Base', priority: 2, value: (v) => v.base ?? '' },
    { key: 'diasComChecklist', header: 'Dias com checklist', type: 'custom', priority: 2, value: (v) => v.diasComChecklist ?? 0, display: (v) => inteiro(v.diasComChecklist) },
    { key: 'coberturaChecklist', header: 'Cobertura', type: 'custom', priority: 1, value: (v) => v.coberturaChecklist ?? -1 },
    { key: 'pendenciasChecklist', header: 'Pendências', type: 'custom', priority: 1, value: (v) => v.pendenciasChecklist ?? 0, display: (v) => inteiro(v.pendenciasChecklist) }
  ];

  constructor() {
    super();
    this.iniciar();
  }

  protected carregarDetalhe(f: FiltroRelatorioFrota) {
    return this.relatorios.conformidade(f, this.horizonte());
  }
  protected parametrosProprios() {
    return { horizonte: this.horizonte() !== 90 ? String(this.horizonte()) : null };
  }
  protected lerProprios(q: ParamMap): void {
    const h = Number(q.get('horizonte'));
    this.horizonteSel.set(HORIZONTES.some((x) => x.value === h) ? h : 90);
  }
  protected aplicarProprios(): void {
    this.horizonte.set(this.horizonteSel() ?? 90);
  }
  protected limparProprios(): void {
    this.horizonteSel.set(90);
  }
  protected removerProprio(chave: string): void {
    if (chave === 'horizonte') this.horizonteSel.set(90);
  }

  protected situacao(dias: number | null): { tom: 'danger' | 'warning' | 'info'; texto: string } {
    if (dias == null) return { tom: 'warning', texto: 'Sem validade' };
    if (dias < 0) return { tom: 'danger', texto: `Vencido há ${-dias} d` };
    if (dias <= 30) return { tom: 'warning', texto: dias === 0 ? 'Vence hoje' : `Vence em ${dias} d` };
    return { tom: 'info', texto: `Vence em ${dias} d` };
  }

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    const c = m?.r.conformidade;
    return {
      id: 'frota.conformidade', nome: 'Conformidade e risco da frota', modulo: 'Frota', rota: '/frota/relatorios/conformidade',
      descricao: 'Documentos e CNH vencidos ou vencendo, seguro, checklist e pendências, sinistros, eventos de condução e acidentes com veículo.',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [
        filtroPainel('base', 'Base', (f.idBase ?? []).map((id) => this.recorte.nomeBase(id)), f.idBase ?? []),
        filtroPainel('horizonte', 'Horizonte de vencimento', `${this.horizonte()} dias`)
      ],
      metricas: m && c ? [
        metricaPainel('docVencidos', 'Documentos vencidos', m.docVencidos.length, 'inteiro'),
        metricaPainel('cnhVencidas', 'CNH vencidas', m.cnhVencidas.length, 'inteiro'),
        metricaPainel('cnhRodando', 'CNH vencida com veículo vinculado', m.cnhRodando.length, 'inteiro'),
        metricaPainel('semSeguro', 'Veículos sem seguro', c.semSeguro?.length ?? null, 'inteiro'),
        metricaPainel('checklist', 'Checklist nos dias úteis (%)', c.coberturaChecklist?.atual != null ? c.coberturaChecklist.atual * 100 : null, 'percentual'),
        metricaPainel('pendencias', 'Pendências de checklist abertas', m.pendencias?.length ?? null, 'inteiro'),
        metricaPainel('sinistros', 'Sinistros', c.sinistros?.total.atual ?? null, 'inteiro'),
        metricaPainel('eventos100km', 'Eventos de condução por 100 km', c.eventosConducao?.por100Km.atual ?? null, 'numero')
      ] : [],
      graficos: m ? [
        graficoPainel('semanas', 'barra', 'Vencimentos por semana', m.semanas.map((s) => s.rotulo), [
          { nome: 'Documentos', valores: m.semanas.map((s) => s.docs.length) }, { nome: 'CNH', valores: m.semanas.map((s) => s.cnh.length) }], { formato: 'inteiro' }),
        graficoPainel('checklist', 'barra', 'Cobertura de checklist por base', m.checklistBases.map((g) => g.nome), m.checklistBases.map((g) => (g.cobertura ?? 0) * 100), { formato: 'percentual' })
      ] : [],
      datasets: ['veiculos', 'documentos', 'condutores', 'checklists', 'sinistros'],
      sugestoes: [
        { rotulo: 'O que pode parar a frota', icone: 'pi pi-shield', requer: ['dados', 'analise'], pergunta: 'O que neste recorte pode gerar multa, apreensão ou parada de veículo nos próximos 30 dias?' }
      ]
    };
  });
}
