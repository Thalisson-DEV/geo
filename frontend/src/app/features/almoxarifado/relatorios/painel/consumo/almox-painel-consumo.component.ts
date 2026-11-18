import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, WritableSignal, computed, effect, signal } from '@angular/core';
import { ParamMap } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesChartComponent,
  CesCellDirective,
  CesDataTableComponent,
  CesDrillStateService,
  CesFilterChip,
  CesFilterPanelComponent,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesSelectOption,
  CesStatusComponent
} from '@ces/ui';

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
  graficoPainel,
  metricaPainel,
  periodoPainel
} from '../../../../copiloto/painel';
import { conhecidosMov, inteiro, pct, recortavelMov, textoVariacao } from '../almox-analise-comum';
import { AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent } from '../almox-painel.components';
import { FiltroAlmox, PainelAlmoxBase } from '../painel-almox-base';
import { RecorteAlmoxService } from '../recorte-almox.service';
import {
  ClasseAbc,
  ConsumoEquipe,
  ConsumoMaterial,
  ForaDaCurva,
  ModeloConsumo,
  colEquipesConsumo,
  colForaDaCurva,
  colMateriaisConsumo,
  modeloConsumo,
  visaoConsumo,
  vistaConsumo
} from './analise-consumo';

const DESTINOS: CesSelectOption<string>[] = [
  { label: 'Equipes', value: 'CAMPO' },
  { label: 'Obras', value: 'OBRA' }
];

/**
 * Relatório de consumo de materiais: quanto cada equipe, obra e processo consome, quem foge da curva,
 * quem não aplica em nota, a sucata que não volta e a curva ABC dos materiais.
 */
@Component({
  selector: 'app-almox-painel-consumo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteAlmoxService, CesDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, CesAsyncStateComponent, CesCellDirective, CesStatusComponent, CesButtonComponent, CesCalloutComponent, CesChartComponent, CesDataTableComponent,
    CesFilterPanelComponent, CesMultiSelectComponent, CesPageHeaderComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './almox-painel-consumo.component.html',
  styleUrl: '../painel-almox.css'
})
export class AlmoxPainelConsumoComponent extends PainelAlmoxBase<MovimentacoesRelatorioResponse> {
  protected readonly inteiro = inteiro;
  protected readonly pct = pct;
  protected readonly textoVariacao = textoVariacao;
  protected readonly Math = Math;
  protected readonly rotulos = (g: readonly { rotulo: string }[]) => g.map((x) => x.rotulo);
  protected readonly totais = (g: readonly { linhas: readonly unknown[] }[]) => g.map((x) => x.linhas.length);

  protected readonly materiaisSel = signal<string[]>([]);
  protected readonly destinosSel = signal<string[]>([]);
  private readonly proprios = signal({ materiais: [] as string[], destinos: [] as string[] });
  protected readonly opcoesDestino = DESTINOS;
  protected readonly opcoesMaterial = computed<CesSelectOption<string>[]>(() => {
    const vistos = new Map<string, string>();
    for (const m of this.dados()?.movimentacoes ?? []) vistos.set(m.idMaterial, `${m.codigo} · ${m.descricao}`);
    return [...vistos.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  });
  protected readonly chipsProprios = computed<CesFilterChip[]>(() => {
    const f = this.proprios();
    return [
      ...(f.materiais.length ? [{ key: 'material', label: `Material: ${f.materiais.length === 1 ? (this.opcoesMaterial().find((o) => o.value === f.materiais[0])?.label.split(' · ')[0] ?? '1') : `${f.materiais.length} selecionados`}` }] : []),
      ...(f.destinos.length === 1 ? [{ key: 'destino', label: `Destino: ${DESTINOS.find((d) => d.value === f.destinos[0])?.label}` }] : [])
    ];
  });

  protected readonly modelo = computed<ModeloConsumo | null>(() => {
    const d = this.dados();
    if (!d) return null;
    const recorte = this.recorte.aceita();
    const f = this.proprios();
    const mats = f.materiais.length ? new Set(f.materiais) : null;
    const dest = f.destinos.length ? new Set(f.destinos) : null;
    return modeloConsumo(d, (m) => recorte(recortavelMov(m)) && (!mats || mats.has(m.idMaterial))
      && (!dest || dest.has(m.tipoDestino ?? '') || dest.has(m.tipoOrigem ?? '')));
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoConsumo(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaConsumo(a, m) : null;
  });

  protected readonly graficoSerie = computed(() => {
    const m = this.modelo();
    return { rotulos: m?.serie.map((x) => x.rotulo) ?? [], series: [{ name: 'Saídas', values: m?.serie.map((x) => x.saidas) ?? [] }, { name: 'Retornos', values: m?.serie.map((x) => x.retornos) ?? [] }] };
  });
  protected readonly classes: ClasseAbc[] = ['A', 'B', 'C'];
  protected readonly graficoAbc = computed(() => {
    const m = this.modelo();
    return { rotulos: this.classes.map((c) => `Classe ${c} (${m?.abc[c].length ?? 0} materiais)`), series: [{ name: 'Saídas', values: this.classes.map((c) => (m?.abc[c] ?? []).reduce((s, x) => s + x.saidas, 0)) }] };
  });
  protected readonly equipesTop = computed(() => (this.modelo()?.equipes ?? []).slice(0, 12));
  protected readonly graficoEquipes = computed(() => ({
    rotulos: this.equipesTop().map((e) => e.rotulo),
    series: [{ name: 'Saídas', values: this.equipesTop().map((e) => e.saidas) }, { name: 'Retornos', values: this.equipesTop().map((e) => e.retornos) }]
  }));
  protected readonly comAplicacao = computed(() => (this.modelo()?.equipes ?? []).filter((e) => e.aplicacao != null && e.saidas >= 3).sort((a, b) => (a.aplicacao ?? 0) - (b.aplicacao ?? 0)).slice(0, 12));
  protected readonly graficoAplicacao = computed(() => ({
    rotulos: this.comAplicacao().map((e) => e.rotulo),
    series: [{ name: 'Aplicado em nota', values: this.comAplicacao().map((e) => Math.min(1.5, e.aplicacao ?? 0)) }]
  }));
  protected readonly processosTop = computed(() => (this.modelo()?.processos ?? []).slice(0, 8));
  protected readonly obrasTop = computed(() => (this.modelo()?.obras ?? []).slice(0, 10));

  protected readonly colMateriais = colMateriaisConsumo;
  protected readonly colEquipes = colEquipesConsumo;
  protected readonly colFora = colForaDaCurva;
  protected readonly chaveMaterial = (x: ConsumoMaterial) => x.idMaterial;
  protected readonly chaveEquipe = (e: ConsumoEquipe) => e.chave;
  protected readonly chaveFora = (f: ForaDaCurva) => f.chave;

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
  protected parametrosProprios() {
    const f = this.proprios();
    return { material: f.materiais.join(',') || null, destino: f.destinos.join(',') || null };
  }
  protected lerProprios(q: ParamMap): void {
    this.materiaisSel.set((q.get('material') ?? '').split(',').filter(Boolean));
    this.destinosSel.set((q.get('destino') ?? '').split(',').filter(Boolean));
  }
  protected aplicarProprios(): void {
    this.proprios.set({ materiais: this.materiaisSel(), destinos: this.destinosSel() });
  }
  protected limparProprios(): void {
    this.materiaisSel.set([]);
    this.destinosSel.set([]);
  }
  protected removerProprio(chave: string): void {
    ({ material: this.materiaisSel, destino: this.destinosSel } as Record<string, WritableSignal<string[]>>)[chave]?.set([]);
  }

  protected analisarPeriodo(i: number): void {
    this.selecionar(this.modelo()?.serie ?? [], i, 'periodo', (x) => x.chave);
  }
  protected analisarEquipe(i: number): void {
    this.selecionar(this.equipesTop(), i, 'equipe', (e) => e.chave);
  }
  protected analisarAplicacao(i: number): void {
    this.selecionar(this.comAplicacao(), i, 'equipe', (e) => e.chave);
  }
  protected analisarProcesso(i: number): void {
    this.selecionar(this.processosTop(), i, 'processo', (g) => g.chave);
  }
  protected analisarObra(i: number): void {
    this.selecionar(this.obrasTop(), i, 'obra', (g) => g.chave);
  }

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    return {
      id: 'almoxarifado.relatorios.consumo',
      nome: 'Consumo de materiais',
      modulo: 'Almoxarifado',
      descricao: 'Consumo de materiais por equipe, obra, processo e base: curva ABC, consumo fora da curva, aplicação em nota, devoluções e sucata.',
      rota: '/almoxarifado/relatorios/consumo',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [],
      metricas: m ? [
        metricaPainel('saidas', 'Saídas para equipes e obras', m.saidas.length, 'inteiro', {
          comparacao: m.saidasAnterior ? { rotulo: 'vs. período anterior', valorAnterior: m.saidasAnterior, variacaoPercentual: (m.saidas.length / m.saidasAnterior - 1) * 100 } : undefined }),
        metricaPainel('materiais', 'Materiais diferentes', m.materiais.length, 'inteiro'),
        metricaPainel('retorno', 'Devolvido ao almoxarifado', m.taxaRetorno == null ? null : m.taxaRetorno * 100, 'percentual'),
        metricaPainel('foraCurva', 'Casos fora da curva', m.foraDaCurva.length, 'inteiro')
      ] : [],
      graficos: m ? [
        graficoPainel('materiais', 'tabela', 'Materiais mais consumidos', m.materiais.slice(0, 20).map((x) => `${x.codigo} ${x.descricao}`), m.materiais.slice(0, 20).map((x) => x.saidas),
          { totalCategorias: m.materiais.length }),
        graficoPainel('equipes', 'barra', 'Saídas por equipe', this.graficoEquipes().rotulos, this.graficoEquipes().series[0].values)
      ] : [],
      datasets: ['movimentacoes'],
      sugestoes: [
        { rotulo: 'Onde há desperdício?', icone: 'pi pi-search', requer: ['dados', 'analise'], pergunta: 'Onde há sinal de desperdício ou desvio de material no consumo deste recorte?' },
        { rotulo: 'Previsão de compra', icone: 'pi pi-shopping-cart', requer: ['dados', 'analise'], pergunta: 'Com base no consumo, quanto devo comprar dos materiais classe A no próximo mês?' }
      ]
    };
  });
}
