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
import { forkJoin } from 'rxjs';

import { EstoqueRelatorioResponse, MovimentacoesRelatorioResponse } from '../../../../../core/models/almoxarifado-relatorios.models';
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
import { ROTULO_CONDICAO, ROTULO_TIPO_ESTOQUE, conhecidosMov, dias, inteiro, pct, plural, recortavelMov, recortavelSaldo } from '../almox-analise-comum';
import { AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent } from '../almox-painel.components';
import { FiltroAlmox, PainelAlmoxBase } from '../painel-almox-base';
import { RecorteAlmoxService } from '../recorte-almox.service';
import {
  DIAS_EM_CAMPO,
  DIAS_PARADO,
  FAIXAS,
  Faixa,
  FiltrosEstoque,
  ModeloEstoque,
  PosicaoAlmox,
  PosicaoCampo,
  ROTULO_FAIXA,
  aceitaFiltrosEstoque,
  colCampo,
  colPosicao,
  modeloEstoque,
  visaoEstoque,
  vistaEstoque
} from './analise-estoque';

interface DadosEstoque {
  e: EstoqueRelatorioResponse;
  mov: MovimentacoesRelatorioResponse;
}

/**
 * Relatório de estoque e saldos: o que vai faltar, o que sobra ou está parado, o que está esquecido com
 * equipes e obras e a sucata a destinar. A cobertura usa o ritmo de saída do período escolhido.
 */
@Component({
  selector: 'app-almox-painel-estoque',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteAlmoxService, CesDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, CesAsyncStateComponent, CesCellDirective, CesStatusComponent, CesButtonComponent, CesCalloutComponent, CesChartComponent, CesDataTableComponent,
    CesFilterPanelComponent, CesMultiSelectComponent, CesPageHeaderComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './almox-painel-estoque.component.html',
  styleUrl: '../painel-almox.css'
})
export class AlmoxPainelEstoqueComponent extends PainelAlmoxBase<DadosEstoque> {
  protected readonly inteiro = inteiro;
  protected readonly pct = pct;
  protected readonly dias = dias;
  protected readonly plural = plural;
  protected readonly faixas = FAIXAS;
  protected readonly diasParado = DIAS_PARADO;
  protected readonly diasEmCampo = DIAS_EM_CAMPO;

  // ── Filtros próprios ─────────────────────────────────────────────────────────────────────────
  protected readonly tiposSel = signal<string[]>([]);
  protected readonly condicoesSel = signal<string[]>([]);
  protected readonly faixasSel = signal<string[]>([]);
  protected readonly materiaisSel = signal<string[]>([]);
  private readonly proprios = signal<FiltrosEstoque>({ tipos: [], condicoes: [], faixas: [], materiais: [] });

  protected readonly opcoesTipo: CesSelectOption<string>[] = Object.entries(ROTULO_TIPO_ESTOQUE).map(([value, label]) => ({ label, value }));
  protected readonly opcoesCondicao: CesSelectOption<string>[] = Object.entries(ROTULO_CONDICAO).map(([value, label]) => ({ label, value }));
  protected readonly opcoesFaixa: CesSelectOption<string>[] = FAIXAS.map((f) => ({ label: f.rotulo, value: f.id }));
  protected readonly opcoesMaterial = computed<CesSelectOption<string>[]>(() => {
    const vistos = new Map<string, string>();
    for (const s of this.dados()?.e.saldos ?? []) vistos.set(s.idMaterial, `${s.codigo} · ${s.descricao}`);
    return [...vistos.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  });

  protected readonly chipsProprios = computed<CesFilterChip[]>(() => {
    const f = this.proprios();
    const chip = (key: string, rotulo: string, sel: string[], nome: (v: string) => string): CesFilterChip[] =>
      sel.length ? [{ key, label: `${rotulo}: ${sel.length === 1 ? nome(sel[0]) : `${sel.length} selecionados`}` }] : [];
    return [
      ...chip('tipo', 'Estoque', f.tipos, (v) => ROTULO_TIPO_ESTOQUE[v] ?? v),
      ...chip('condicao', 'Condição', f.condicoes, (v) => ROTULO_CONDICAO[v] ?? v),
      ...chip('situacao', 'Situação', f.faixas, (v) => ROTULO_FAIXA[v as Faixa] ?? v),
      ...chip('material', 'Material', f.materiais, (v) => this.opcoesMaterial().find((o) => o.value === v)?.label.split(' · ')[0] ?? 'Material')
    ];
  });

  // ── Modelo ───────────────────────────────────────────────────────────────────────────────────
  protected readonly modelo = computed<ModeloEstoque | null>(() => {
    const d = this.dados();
    if (!d) return null;
    const recorte = this.recorte.aceita();
    const p = this.proprios();
    const proprios = aceitaFiltrosEstoque(p);
    const materiais = p.materiais.length ? new Set(p.materiais) : null;
    return modeloEstoque(d.e, d.mov, (s) => recorte(recortavelSaldo(s)) && proprios(s),
      (m) => recorte(recortavelMov(m)) && (!materiais || materiais.has(m.idMaterial)), p.faixas);
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoEstoque(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaEstoque(a, m) : null;
  });

  protected readonly graficoFaixas = computed(() => {
    const m = this.modelo();
    const grupo = (ids: Faixa[]) => FAIXAS.map((f) => (ids.includes(f.id) ? (m?.porFaixa[f.id].length ?? 0) : 0));
    return {
      rotulos: FAIXAS.map((f) => f.rotulo),
      series: [
        { name: 'Em falta ou < 15 dias', values: grupo(['ruptura', 'critica', 'baixa']) },
        { name: 'Saudável', values: grupo(['adequada']) },
        { name: 'Excesso, parado ou sem saída', values: grupo(['excesso', 'parado', 'sem-consumo']) }
      ]
    };
  });
  protected readonly almoxTop = computed(() => (this.modelo()?.porAlmox ?? []).slice(0, 10));
  protected readonly graficoAlmox = computed(() => {
    const g = this.almoxTop();
    const conta = (l: PosicaoAlmox[], fs: Faixa[]) => l.filter((p) => fs.includes(p.faixa)).length;
    return {
      rotulos: g.map((x) => x.rotulo),
      series: [
        { name: 'Em falta ou < 15 dias', values: g.map((x) => conta(x.linhas, ['ruptura', 'critica', 'baixa'])) },
        { name: 'Saudável', values: g.map((x) => conta(x.linhas, ['adequada'])) },
        { name: 'Excesso, parado ou sem saída', values: g.map((x) => conta(x.linhas, ['excesso', 'parado', 'sem-consumo'])) }
      ]
    };
  });
  protected readonly equipesTop = computed(() => (this.modelo()?.porEquipe ?? []).slice(0, 12));
  protected readonly graficoEquipes = computed(() => {
    const g = this.equipesTop();
    return {
      rotulos: g.map((x) => x.rotulo),
      series: [
        { name: `Até ${DIAS_EM_CAMPO} dias`, values: g.map((x) => x.linhas.filter((c) => (c.diasSemSaida ?? 0) < DIAS_EM_CAMPO).length) },
        { name: `Mais de ${DIAS_EM_CAMPO} dias`, values: g.map((x) => x.linhas.filter((c) => (c.diasSemSaida ?? 0) >= DIAS_EM_CAMPO).length) }
      ]
    };
  });
  protected readonly obrasTop = computed(() => (this.modelo()?.porObra ?? []).slice(0, 10));
  protected readonly graficoObras = computed(() => ({
    rotulos: this.obrasTop().map((x) => x.rotulo),
    series: [{ name: 'Itens', values: this.obrasTop().map((x) => x.linhas.length) }]
  }));
  /** O que pede decisão: falta, crítico, baixo (repor) e parado/excesso (remanejar). */
  protected readonly repor = computed(() => {
    const m = this.modelo();
    return m ? [...m.porFaixa.ruptura, ...m.porFaixa.critica, ...m.porFaixa.baixa] : [];
  });
  protected readonly sobrando = computed(() => {
    const m = this.modelo();
    return m ? [...m.porFaixa.parado, ...m.porFaixa.excesso].sort((a, b) => (b.diasSemSaida ?? 0) - (a.diasSemSaida ?? 0)) : [];
  });

  protected readonly colPosicao = colPosicao;
  protected readonly colCampo = colCampo;
  protected readonly chavePosicao = (p: PosicaoAlmox) => p.chave;
  protected readonly rotuloPosicao = (p: PosicaoAlmox) => `${p.codigo} em ${p.estoque}`;
  protected readonly chaveCampo = (c: PosicaoCampo) => c.chave;
  protected readonly faixaDe = (p: unknown) => FAIXAS.find((f) => f.id === (p as PosicaoAlmox).faixa) ?? FAIXAS[3];

  constructor() {
    super();
    effect(() => {
      const d = this.dados();
      if (!d) return;
      const [almox, equipes] = conhecidosMov(d.mov.movimentacoes);
      for (const s of d.e.saldos) {
        if (s.tipoEstoque === 'FISICO') almox.push([s.idEstoque, s.estoque]);
        if (s.idEquipe) equipes.push([s.idEquipe, s.equipe]);
      }
      this.recorte.conhecer(almox, equipes);
    });
    this.iniciar();
  }

  protected carregar(f: FiltroAlmox) {
    return forkJoin({ e: this.relatorios.estoque(), mov: this.relatorios.movimentacoes(f.de, f.ate) });
  }

  protected parametrosProprios() {
    const f = this.proprios();
    const j = (l: string[]) => (l.length ? l.join(',') : null);
    return { estoque: j(f.tipos), condicao: j(f.condicoes), situacao: j(f.faixas), material: j(f.materiais) };
  }
  protected lerProprios(q: ParamMap): void {
    const l = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
    this.tiposSel.set(l('estoque'));
    this.condicoesSel.set(l('condicao'));
    this.faixasSel.set(l('situacao'));
    this.materiaisSel.set(l('material'));
  }
  protected aplicarProprios(): void {
    this.proprios.set({ tipos: this.tiposSel(), condicoes: this.condicoesSel(), faixas: this.faixasSel(), materiais: this.materiaisSel() });
  }
  protected limparProprios(): void {
    for (const s of [this.tiposSel, this.condicoesSel, this.faixasSel, this.materiaisSel]) s.set([]);
  }
  protected removerProprio(chave: string): void {
    const mapa: Record<string, WritableSignal<string[]>> = { tipo: this.tiposSel, condicao: this.condicoesSel, situacao: this.faixasSel, material: this.materiaisSel };
    mapa[chave]?.set([]);
  }

  protected analisarFaixa(i: number): void {
    this.selecionar(FAIXAS, i, 'faixa', (f) => f.id);
  }
  protected analisarAlmox(i: number): void {
    this.selecionar(this.almoxTop(), i, 'almox', (g) => g.chave);
  }
  protected analisarEquipe(i: number): void {
    this.selecionar(this.equipesTop(), i, 'equipe', (g) => g.chave);
  }
  protected analisarObra(i: number): void {
    this.selecionar(this.obrasTop(), i, 'obra', (g) => g.chave);
  }

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    return {
      id: 'almoxarifado.relatorios.estoque',
      nome: 'Estoque e saldos do almoxarifado',
      modulo: 'Almoxarifado',
      descricao: 'Posição dos almoxarifados com cobertura em dias pelo ritmo de saída do período, faltas, excesso, material parado, saldo com equipes e obras e sucata.',
      rota: '/almoxarifado/relatorios/estoque',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [filtroPainel('situacao', 'Situação', this.proprios().faixas.map((x) => ROTULO_FAIXA[x as Faixa] ?? x), this.proprios().faixas)],
      metricas: m ? [
        metricaPainel('ruptura', 'Itens em falta', m.porFaixa.ruptura.length, 'inteiro'),
        metricaPainel('critica', 'Itens com menos de 7 dias de cobertura', m.porFaixa.critica.length, 'inteiro'),
        metricaPainel('parado', `Itens sem saída há mais de ${DIAS_PARADO} dias`, m.porFaixa.parado.length, 'inteiro'),
        metricaPainel('excesso', 'Itens com mais de 90 dias de cobertura', m.porFaixa.excesso.length, 'inteiro'),
        metricaPainel('campo', 'Itens com as equipes', m.campo.length, 'inteiro', { descricao: `${m.campoEsquecido.length} parados há mais de ${DIAS_EM_CAMPO} dias` }),
        metricaPainel('obras', 'Obras com saldo', m.porObra.length, 'inteiro')
      ] : [],
      graficos: m ? [
        graficoPainel('faixas', 'barra', 'Itens por situação de cobertura', FAIXAS.map((f) => f.rotulo), FAIXAS.map((f) => m.porFaixa[f.id].length)),
        graficoPainel('repor', 'tabela', 'Itens para repor', this.repor().slice(0, 15).map((p) => `${p.codigo} ${p.estoque}`),
          this.repor().slice(0, 15).map((p) => p.cobertura ?? 0), { formato: 'dias', totalCategorias: this.repor().length })
      ] : [],
      datasets: ['saldos', 'movimentacoes'],
      sugestoes: [
        { rotulo: 'O que comprar?', icone: 'pi pi-shopping-cart', requer: ['dados', 'analise'],
          pergunta: 'Com base na cobertura e no ritmo de saída, o que preciso comprar ou remanejar primeiro e em que quantidade?' },
        { rotulo: 'O que está sobrando?', icone: 'pi pi-database', requer: ['dados', 'analise'],
          pergunta: 'Quais materiais estão parados ou em excesso e o que fazer com eles?' }
      ]
    };
  });
}
