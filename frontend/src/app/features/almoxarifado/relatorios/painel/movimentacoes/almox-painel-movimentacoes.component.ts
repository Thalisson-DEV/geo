import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import { ParamMap } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoChartComponent,
  GeoDataTableComponent,
  GeoDrillStateService,
  GeoFilterChip,
  GeoFilterPanelComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectOption
} from '@geo/ui';

import { MovimentacoesRelatorioResponse } from '../../../../../core/models/almoxarifado-relatorios.models';
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
  NOMES_DIA,
  ROTULO_CONDICAO,
  ROTULO_NATUREZA,
  ROTULO_TIPO_MOV,
  conhecidosMov,
  inteiro,
  pct,
  recortavelMov,
  textoVariacao
} from '../almox-analise-comum';
import { AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent } from '../almox-painel.components';
import { FiltroAlmox, PainelAlmoxBase } from '../painel-almox-base';
import { RecorteAlmoxService } from '../recorte-almox.service';
import {
  FiltrosMov,
  MaterialMov,
  ModeloMov,
  NATUREZAS,
  aceitaFiltros,
  colunasGrupo,
  colunasMateriais,
  linhaGrupo,
  modeloMov,
  visaoMov,
  vistaMov
} from './analise-movimentacoes';

/**
 * Relatório de movimentações do almoxarifado: o que entrou, saiu, voltou e foi baixado; perdas, ajustes e
 * retrabalho; carga por dia, hora e operador. Todo número abre a análise com as movimentações que o compõem.
 */
@Component({
  selector: 'app-almox-painel-movimentacoes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteAlmoxService, GeoDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoChartComponent, GeoDataTableComponent,
    GeoFilterPanelComponent, GeoMultiSelectComponent, GeoPageHeaderComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './almox-painel-movimentacoes.component.html',
  styleUrl: '../painel-almox.css'
})
export class AlmoxPainelMovimentacoesComponent extends PainelAlmoxBase<MovimentacoesRelatorioResponse> {
  protected readonly inteiro = inteiro;
  protected readonly pct = pct;
  protected readonly Math = Math;
  protected readonly textoVariacao = textoVariacao;
  protected readonly rotuloNatureza = ROTULO_NATUREZA;

  // ── Filtros próprios ─────────────────────────────────────────────────────────────────────────
  protected readonly naturezasSel = signal<string[]>([]);
  protected readonly tiposSel = signal<string[]>([]);
  protected readonly condicoesSel = signal<string[]>([]);
  protected readonly materiaisSel = signal<string[]>([]);
  private readonly proprios = signal<FiltrosMov>({ naturezas: [], tipos: [], condicoes: [], materiais: [] });

  protected readonly opcoesNatureza: GeoSelectOption<string>[] = NATUREZAS.map((n) => ({ label: ROTULO_NATUREZA[n], value: n }));
  protected readonly opcoesTipo: GeoSelectOption<string>[] = Object.entries(ROTULO_TIPO_MOV).map(([value, label]) => ({ label, value }));
  protected readonly opcoesCondicao: GeoSelectOption<string>[] = Object.entries(ROTULO_CONDICAO).map(([value, label]) => ({ label, value }));
  protected readonly opcoesMaterial = computed<GeoSelectOption<string>[]>(() => {
    const vistos = new Map<string, string>();
    for (const m of this.dados()?.movimentacoes ?? []) vistos.set(m.idMaterial, `${m.codigo} · ${m.descricao}`);
    return [...vistos.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  });

  protected readonly chipsProprios = computed<GeoFilterChip[]>(() => {
    const f = this.proprios();
    const chip = (key: string, rotulo: string, sel: string[], nome: (v: string) => string): GeoFilterChip[] =>
      sel.length ? [{ key, label: `${rotulo}: ${sel.length === 1 ? nome(sel[0]) : `${sel.length} selecionados`}` }] : [];
    return [
      ...chip('natureza', 'Natureza', f.naturezas, (v) => ROTULO_NATUREZA[v as keyof typeof ROTULO_NATUREZA] ?? v),
      ...chip('tipo', 'Tipo', f.tipos, (v) => ROTULO_TIPO_MOV[v as keyof typeof ROTULO_TIPO_MOV] ?? v),
      ...chip('condicao', 'Condição', f.condicoes, (v) => ROTULO_CONDICAO[v] ?? v),
      ...chip('material', 'Material', f.materiais, (v) => this.opcoesMaterial().find((o) => o.value === v)?.label.split(' · ')[0] ?? 'Material')
    ];
  });

  // ── Modelo ───────────────────────────────────────────────────────────────────────────────────
  protected readonly modelo = computed<ModeloMov | null>(() => {
    const d = this.dados();
    if (!d) return null;
    const recorte = this.recorte.aceita();
    const proprios = aceitaFiltros(this.proprios());
    return modeloMov(d, (m) => recorte(recortavelMov(m)) && proprios(m));
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoMov(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaMov(a, m) : null;
  });

  protected readonly serie = computed(() => {
    const m = this.modelo();
    if (!m) return { rotulos: [] as string[], series: [] as { name: string; values: number[] }[] };
    const presentes = NATUREZAS.filter((n) => m.porNatureza[n].length);
    return { rotulos: m.serie.map((s) => s.rotulo), series: presentes.map((n) => ({ name: ROTULO_NATUREZA[n], values: m.serie.map((s) => s.porNatureza[n]) })) };
  });
  protected readonly naturezasComValor = computed(() => {
    const m = this.modelo();
    return m ? NATUREZAS.filter((n) => m.porNatureza[n].length).map((n) => ({ n, v: m.porNatureza[n].length })) : [];
  });
  protected readonly graficoNatureza = computed(() => ({
    rotulos: this.naturezasComValor().map((x) => ROTULO_NATUREZA[x.n]),
    series: [{ name: 'Itens', values: this.naturezasComValor().map((x) => x.v) }]
  }));
  protected readonly almoxTop = computed(() => (this.modelo()?.almox ?? []).slice(0, 10));
  protected readonly graficoAlmox = computed(() => {
    const g = this.almoxTop();
    return {
      rotulos: g.map((x) => x.rotulo),
      series: [
        { name: 'Entradas', values: g.map((x) => x.linhas.filter((m) => m.idDestino === x.chave).length) },
        { name: 'Saídas', values: g.map((x) => x.linhas.filter((m) => m.idOrigem === x.chave).length) }
      ]
    };
  });
  protected readonly operadoresTop = computed(() => (this.modelo()?.operadores ?? []).slice(0, 10));
  protected readonly graficoOperadores = computed(() => ({
    rotulos: this.operadoresTop().map((x) => x.rotulo),
    series: [{ name: 'Operações', values: this.operadoresTop().map((x) => linhaGrupo(x).operacoes) }]
  }));
  protected readonly motivosComValor = computed(() => this.modelo()?.motivos ?? []);
  protected readonly graficoMotivos = computed(() => ({
    rotulos: this.motivosComValor().map((x) => x.rotulo),
    series: [
      { name: 'Entradas', values: this.motivosComValor().map((x) => x.linhas.filter((m) => m.tipo === 'ENTRADA_AVULSA').length) },
      { name: 'Baixas', values: this.motivosComValor().map((x) => x.linhas.filter((m) => m.tipo === 'BAIXA_AVULSA').length) }
    ]
  }));
  protected readonly horas = Array.from({ length: 24 }, (_, h) => `${h}h`);
  protected readonly nomesDia = NOMES_DIA;
  protected readonly equipesTabela = computed(() => (this.modelo()?.equipes ?? []).map(linhaGrupo));

  protected readonly colMateriais = colunasMateriais;
  protected readonly colGrupo = colunasGrupo;
  protected readonly chaveMaterial = (x: MaterialMov) => x.idMaterial;
  protected readonly rotuloMaterial = (x: MaterialMov) => x.codigo;
  protected readonly chaveGrupo = (x: { chave: string }) => x.chave;

  constructor() {
    super();
    effect(() => {
      const d = this.dados();
      if (d) this.recorte.conhecer(...conhecidosMov(d.movimentacoes));
    });
    this.iniciar();
  }

  protected carregar(f: FiltroAlmox) {
    return this.relatorios.movimentacoes(f.de, f.ate);
  }

  // ── Filtros próprios ─────────────────────────────────────────────────────────────────────────
  protected parametrosProprios() {
    const f = this.proprios();
    const j = (l: string[]) => (l.length ? l.join(',') : null);
    return { natureza: j(f.naturezas), tipo: j(f.tipos), condicao: j(f.condicoes), material: j(f.materiais) };
  }
  protected lerProprios(q: ParamMap): void {
    const l = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
    this.naturezasSel.set(l('natureza'));
    this.tiposSel.set(l('tipo'));
    this.condicoesSel.set(l('condicao'));
    this.materiaisSel.set(l('material'));
  }
  protected aplicarProprios(): void {
    this.proprios.set({ naturezas: this.naturezasSel(), tipos: this.tiposSel(), condicoes: this.condicoesSel(), materiais: this.materiaisSel() });
  }
  protected limparProprios(): void {
    this.naturezasSel.set([]);
    this.tiposSel.set([]);
    this.condicoesSel.set([]);
    this.materiaisSel.set([]);
  }
  protected removerProprio(chave: string): void {
    ({ natureza: this.naturezasSel, tipo: this.tiposSel, condicao: this.condicoesSel, material: this.materiaisSel } as Record<string, ReturnType<typeof signal<string[]>>>)[chave]?.set([]);
  }

  // ── Ações ────────────────────────────────────────────────────────────────────────────────────
  protected analisarPeriodo(i: number): void {
    this.selecionar(this.modelo()?.serie ?? [], i, 'periodo', (s) => s.chave);
  }
  protected analisarNatureza(i: number): void {
    this.selecionar(this.naturezasComValor(), i, 'natureza', (x) => x.n);
  }
  protected analisarAlmox(i: number): void {
    this.selecionar(this.almoxTop(), i, 'almox', (x) => x.chave);
  }
  protected analisarOperador(i: number): void {
    this.selecionar(this.operadoresTop(), i, 'operador', (x) => x.chave);
  }
  protected analisarMotivo(i: number): void {
    this.selecionar(this.motivosComValor(), i, 'motivo', (x) => x.chave);
  }

  protected tomEstorno(m: ModeloMov): 'amber' | 'green' | 'slate' {
    if (m.taxaEstorno == null) return 'slate';
    return m.taxaEstorno >= 0.1 ? 'amber' : m.taxaEstorno <= 0.03 ? 'green' : 'slate';
  }

  // ── Bússola ───────────────────────────────────────────────────────────────────────────────
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    const p = this.proprios();
    return {
      id: 'almoxarifado.relatorios.movimentacoes',
      nome: 'Movimentações do almoxarifado',
      modulo: 'Almoxarifado',
      descricao: 'Entradas, saídas, retornos, baixas, perdas, ajustes e estornos do almoxarifado, por período, natureza, tipo, almoxarifado, operador, equipe e material.',
      rota: '/almoxarifado/relatorios/movimentacoes',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [
        filtroPainel('natureza', 'Natureza', p.naturezas.map((n) => ROTULO_NATUREZA[n as keyof typeof ROTULO_NATUREZA] ?? n), p.naturezas),
        filtroPainel('tipo', 'Tipo', p.tipos.map((n) => ROTULO_TIPO_MOV[n as keyof typeof ROTULO_TIPO_MOV] ?? n), p.tipos)
      ],
      metricas: m ? [
        metricaPainel('operacoes', 'Operações', m.operacoes, 'inteiro', {
          comparacao: m.operacoesAnt ? { rotulo: 'vs. período anterior', valorAnterior: m.operacoesAnt, variacaoPercentual: (m.operacoes / m.operacoesAnt - 1) * 100 } : undefined
        }),
        metricaPainel('atendimento', 'Itens entregues às equipes', m.porNatureza.atendimento.length, 'inteiro'),
        metricaPainel('retornos', 'Itens retornados', m.porNatureza.retorno.length, 'inteiro'),
        metricaPainel('estornos', 'Estornos', m.estornos.length, 'inteiro', { descricao: `taxa ${pct(m.taxaEstorno)}` }),
        metricaPainel('perdas', 'Baixas por perda', m.perdas.length, 'inteiro'),
        metricaPainel('ajustes', 'Ajustes de inventário', m.ajustes.length, 'inteiro')
      ] : [],
      graficos: m ? [
        graficoPainel('naturezas', 'pizza', 'Itens por natureza', this.graficoNatureza().rotulos, this.graficoNatureza().series[0].values),
        graficoPainel('materiais', 'tabela', 'Materiais mais movimentados', m.materiais.slice(0, 15).map((x) => `${x.codigo} ${x.descricao}`),
          m.materiais.slice(0, 15).map((x) => x.movimentos), { totalCategorias: m.materiais.length }),
        graficoPainel('operadores', 'barra', 'Operações por operador', this.graficoOperadores().rotulos, this.graficoOperadores().series[0].values)
      ] : [],
      datasets: ['movimentacoes', 'saldos'],
      sugestoes: [
        { rotulo: 'O que preocupa?', icone: 'pi pi-exclamation-triangle', requer: ['dados', 'analise'],
          pergunta: 'O que mais preocupa nas movimentações do almoxarifado deste recorte (perdas, ajustes, estornos) e o que fazer?' },
        { rotulo: 'Por que mudou?', icone: 'pi pi-arrow-right-arrow-left', requer: ['dados', 'analise'],
          pergunta: 'O que explica a variação do volume de movimentações em relação ao período anterior?' }
      ]
    };
  });
}
