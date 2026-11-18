import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ParamMap, Router } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesCellDirective,
  CesChartComponent,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDrillStateService,
  CesFilterChip,
  CesFilterPanelComponent,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesSelectOption,
  CesStatusComponent
} from '@ces/ui';

import { DetalheManutencaoFrota, FiltroRelatorioFrota, OsAbertaDetalheFrota } from '../../../../../core/models/frota-relatorios.models';
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
import {
  ROTULO_CRITICIDADE,
  ROTULO_OFICINA,
  ROTULO_ORIGEM_OS,
  ROTULO_SITUACAO_OS,
  ROTULO_TIPO_MANUTENCAO,
  inteiro,
  moeda,
  moedaCurta,
  numero,
  pct,
  rotulo,
  rotuloMes,
  textoVariacao
} from '../frota-analise-comum';
import { FrotaPainelTopoComponent, FrotaRecorteCamposComponent } from '../frota-painel.components';
import { PainelFrotaBase } from '../painel-frota-base';
import { RecorteFrotaService } from '../recorte-frota.service';
import {
  FiltrosManutencao,
  ItemManutencao,
  ModeloManutencao,
  OficinaManutencao,
  VeiculoManutencao,
  modeloManutencao,
  vistaManutencao,
  visaoManutencao
} from './analise-manutencao';

const opcoes = (mapa: Record<string, string>): CesSelectOption<string>[] => Object.entries(mapa).map(([value, label]) => ({ label, value }));
const TIPOS = opcoes({ CORRETIVA: 'Corretiva', PREVENTIVA: 'Preventiva' });
const CRITICIDADES = opcoes({ URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' });
const OFICINAS = opcoes(ROTULO_OFICINA);
const ORIGENS = opcoes(ROTULO_ORIGEM_OS);

/**
 * Painel de manutenção da frota: disponibilidade, fila, corretiva × preventiva, tempo de reparo,
 * oficinas, itens, peças e retrabalho. Filtros próprios de tipo, criticidade, oficina e origem.
 */
@Component({
  selector: 'app-frota-painel-manutencao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteFrotaService, CesDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, CesAsyncStateComponent, CesButtonComponent, CesCalloutComponent, CesCellDirective, CesChartComponent, CesDataTableComponent,
    CesFilterPanelComponent, CesMultiSelectComponent, CesPageHeaderComponent, CesStatusComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, FrotaPainelTopoComponent, FrotaRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './frota-painel-manutencao.component.html',
  styleUrl: '../painel-frota.css'
})
export class FrotaPainelManutencaoComponent extends PainelFrotaBase<DetalheManutencaoFrota> {
  private readonly router = inject(Router);

  protected readonly moeda = moeda;
  protected readonly moedaCurta = moedaCurta;
  protected readonly inteiro = inteiro;
  protected readonly numero = numero;
  protected readonly pct = pct;
  protected readonly textoVariacao = textoVariacao;
  protected readonly limites = LIMITES_FROTA;
  protected readonly tipos = TIPOS;
  protected readonly criticidades = CRITICIDADES;
  protected readonly oficinasOpcoes = OFICINAS;
  protected readonly origens = ORIGENS;

  // ── Filtros próprios ─────────────────────────────────────────────────────────────────────────
  protected readonly tipoSel = signal<string[]>([]);
  protected readonly criticidadeSel = signal<string[]>([]);
  protected readonly oficinaSel = signal<string[]>([]);
  protected readonly origemSel = signal<string[]>([]);
  private readonly proprios = signal<FiltrosManutencao>({ tipo: [], criticidade: [], oficina: [], origem: [] });

  protected readonly chipsProprios = computed<CesFilterChip[]>(() => {
    const f = this.proprios();
    const chip = (key: string, nome: string, sel: string[], mapa: CesSelectOption<string>[]) =>
      sel.length ? [{ key, label: `${nome}: ${sel.length === 1 ? mapa.find((o) => o.value === sel[0])?.label : `${sel.length} selecionados`}` }] : [];
    return [...chip('tipoManutencao', 'Tipo', f.tipo, TIPOS), ...chip('criticidade', 'Criticidade', f.criticidade, CRITICIDADES),
      ...chip('oficina', 'Oficina', f.oficina, OFICINAS), ...chip('origem', 'Origem', f.origem, ORIGENS)];
  });

  // ── Modelo ───────────────────────────────────────────────────────────────────────────────────
  protected readonly modelo = computed<ModeloManutencao | null>(() => {
    const g = this.gerencial();
    const d = this.detalhe();
    return g && d ? modeloManutencao(g, d, this.proprios()) : null;
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoManutencao(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaManutencao(a, m) : null;
  });

  protected readonly mensal = computed(() => {
    const m = this.modelo();
    return {
      rotulos: (m?.mensal ?? []).map((x) => rotuloMes(x.mes)),
      series: [{ name: 'Corretivas', values: (m?.mensal ?? []).map((x) => x.corretivas) }, { name: 'Preventivas', values: (m?.mensal ?? []).map((x) => x.preventivas) }]
    };
  });
  protected readonly causas = computed(() => this.modelo()?.porCausa ?? []);
  protected readonly graficoCausas = computed(() => ({
    rotulos: this.causas().map((g) => g.rotulo), series: [{ name: 'Corretivas', values: this.causas().map((g) => g.linhas.length) }]
  }));
  protected readonly origensGrupos = computed(() => this.modelo()?.porOrigem ?? []);
  protected readonly graficoOrigens = computed(() => ({
    rotulos: this.origensGrupos().map((g) => g.rotulo), series: [{ name: 'OS', values: this.origensGrupos().map((g) => g.linhas.length) }]
  }));
  protected readonly itensTop = computed(() => (this.modelo()?.itens ?? []).slice(0, 12));
  protected readonly graficoItens = computed(() => ({
    rotulos: this.itensTop().map((i) => i.item), series: [{ name: 'OS', values: this.itensTop().map((i) => i.os.length) }]
  }));
  protected readonly graficoFila = computed(() => {
    const f = this.modelo()?.fila ?? [];
    return { rotulos: f.map((x) => x.faixa.rotulo), series: [{ name: 'OS abertas', values: f.map((x) => x.abertas.length) }] };
  });
  protected readonly criticidadeFila = computed(() => {
    const ab = this.modelo()?.abertas ?? [];
    const chaves = ['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'].filter((c) => ab.some((o) => o.criticidade === c));
    return { chaves, rotulos: chaves.map((c) => rotulo(ROTULO_CRITICIDADE, c)), series: [{ name: 'OS abertas', values: chaves.map((c) => ab.filter((o) => o.criticidade === c).length) }] };
  });
  protected readonly veiculosComOs = computed(() => (this.modelo()?.veiculos ?? []).filter((v) => v.os.length || v.abertas || (v.horasParado ?? 0) > 0));

  // ── Tabelas ──────────────────────────────────────────────────────────────────────────────────
  protected readonly chaveId = (o: { id: string }) => o.id;
  protected readonly chaveVeiculo = (v: { idVeiculo: string }) => v.idVeiculo;
  protected readonly chaveNome = (o: { nome: string }) => o.nome;
  protected readonly chaveItem = (i: ItemManutencao) => i.item;
  protected readonly chaveDescricao = (p: { descricao: string }) => p.descricao;
  protected readonly rotuloSituacao = (s: string) => rotulo(ROTULO_SITUACAO_OS, s);

  protected readonly colParados: CesDataTableColumn<OsAbertaDetalheFrota>[] = [
    { key: 'placa', header: 'Veículo', priority: 1, value: (o) => o.placa ?? '—' },
    { key: 'numero', header: 'OS', type: 'custom', priority: 1, value: (o) => o.numero ?? 0, display: (o) => (o.numero ? `#${o.numero}` : '—') },
    { key: 'diasAberta', header: 'Dias', type: 'integer', priority: 1 },
    { key: 'oficina', header: 'Oficina', priority: 3 },
    { key: 'descricao', header: 'Motivo', priority: 2, value: (o) => o.descricao ?? '' }
  ];
  protected readonly colFila: CesDataTableColumn<OsAbertaDetalheFrota>[] = [
    { key: 'numero', header: 'OS', type: 'custom', priority: 1, value: (o) => o.numero ?? 0, display: (o) => (o.numero ? `#${o.numero}` : '—') },
    { key: 'placa', header: 'Veículo', priority: 1, value: (o) => o.placa ?? '—' },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (o) => o.situacao },
    { key: 'criticidade', header: 'Criticidade', priority: 2, value: (o) => rotulo(ROTULO_CRITICIDADE, o.criticidade) },
    { key: 'diasAberta', header: 'Dias aberta', type: 'integer', priority: 1 }
  ];
  protected readonly colOficinas: CesDataTableColumn<OficinaManutencao>[] = [
    { key: 'nome', header: 'Oficina', priority: 1 },
    { key: 'os', header: 'OS', type: 'custom', priority: 1, value: (o) => o.os.length, display: (o) => inteiro(o.os.length) },
    { key: 'valor', header: 'Valor', type: 'currency', priority: 1 },
    { key: 'ticket', header: 'Por OS', type: 'custom', priority: 2, value: (o) => o.ticket ?? 0, display: (o) => moeda(o.ticket) },
    { key: 'horas', header: 'Horas por OS', type: 'custom', priority: 2, value: (o) => o.horas ?? -1, display: (o) => (o.horas == null ? '—' : numero(o.horas)) },
    { key: 'retrabalhos', header: 'Retrabalho', type: 'integer', priority: 2 }
  ];
  protected readonly colItens: CesDataTableColumn<ItemManutencao>[] = [
    { key: 'item', header: 'Item', priority: 1 },
    { key: 'tipo', header: 'Tipo', priority: 3, value: (i) => (i.tipo === 'PECA' ? 'Peça' : 'Mão de obra') },
    { key: 'os', header: 'OS', type: 'custom', priority: 1, value: (i) => i.os.length, display: (i) => inteiro(i.os.length) },
    { key: 'veiculos', header: 'Veículos', type: 'integer', priority: 2 },
    { key: 'retrabalhos', header: 'Retrabalho', type: 'integer', priority: 2 },
    { key: 'valor', header: 'Valor das OS', type: 'currency', priority: 3 }
  ];
  protected readonly colPecas: CesDataTableColumn<{ descricao: string; quantidade: number; valor: number; os: number }>[] = [
    { key: 'descricao', header: 'Peça', priority: 1 },
    { key: 'quantidade', header: 'Quantidade', type: 'number', priority: 2 },
    { key: 'os', header: 'OS', type: 'integer', priority: 2 },
    { key: 'valor', header: 'Valor', type: 'currency', priority: 1 }
  ];
  protected readonly colMecanicos: CesDataTableColumn<{ nome: string; servicos: number; valor: number; os: number }>[] = [
    { key: 'nome', header: 'Mecânico', priority: 1 },
    { key: 'os', header: 'OS', type: 'integer', priority: 1 },
    { key: 'servicos', header: 'Serviços', type: 'integer', priority: 2 },
    { key: 'valor', header: 'Valor', type: 'currency', priority: 2 }
  ];
  protected readonly colVeiculos: CesDataTableColumn<VeiculoManutencao>[] = [
    { key: 'placa', header: 'Veículo', priority: 1 },
    { key: 'tipo', header: 'Tipo', priority: 3, value: (v) => v.tipo ?? '' },
    { key: 'corretivas', header: 'Corretivas', type: 'integer', priority: 1 },
    { key: 'preventivas', header: 'Preventivas', type: 'integer', priority: 2 },
    { key: 'valor', header: 'Valor', type: 'currency', priority: 2 },
    { key: 'horasParado', header: 'Horas parado', type: 'custom', priority: 1, value: (v) => v.horasParado ?? 0, display: (v) => numero(v.horasParado) },
    { key: 'disponibilidade', header: 'Disponibilidade', type: 'custom', priority: 1, value: (v) => v.disponibilidade ?? -1, display: (v) => pct(v.disponibilidade) },
    { key: 'preventivasVencidas', header: 'Preventivas vencidas', type: 'integer', priority: 2 },
    { key: 'abertas', header: 'OS abertas', type: 'integer', priority: 2 }
  ];

  constructor() {
    super();
    this.iniciar();
  }

  protected carregarDetalhe(f: FiltroRelatorioFrota) {
    return this.relatorios.manutencao(f);
  }
  protected parametrosProprios() {
    const j = (l: string[]) => l.join(',') || null;
    const f = this.proprios();
    return { tipoManutencao: j(f.tipo), criticidade: j(f.criticidade), oficina: j(f.oficina), origem: j(f.origem) };
  }
  protected lerProprios(q: ParamMap): void {
    const l = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
    this.tipoSel.set(l('tipoManutencao'));
    this.criticidadeSel.set(l('criticidade'));
    this.oficinaSel.set(l('oficina'));
    this.origemSel.set(l('origem'));
  }
  protected aplicarProprios(): void {
    this.proprios.set({ tipo: this.tipoSel(), criticidade: this.criticidadeSel(), oficina: this.oficinaSel(), origem: this.origemSel() });
  }
  protected limparProprios(): void {
    this.tipoSel.set([]);
    this.criticidadeSel.set([]);
    this.oficinaSel.set([]);
    this.origemSel.set([]);
  }
  protected removerProprio(chave: string): void {
    ({ tipoManutencao: this.tipoSel, criticidade: this.criticidadeSel, oficina: this.oficinaSel, origem: this.origemSel } as Record<string, ReturnType<typeof signal<string[]>>>)[chave]?.set([]);
  }

  protected abrirOs(o: { id: string }): void {
    void this.router.navigate(['/frota/ordens-servico', o.id]);
  }

  protected tomDisponibilidade(v: number | null | undefined): 'red' | 'amber' | 'green' | 'slate' {
    if (v == null) return 'slate';
    return v < LIMITES_FROTA.disponibilidadeCritica ? 'red' : v < LIMITES_FROTA.disponibilidadeAtencao ? 'amber' : 'green';
  }

  protected percentual(v: number | null | undefined): number | null {
    return v == null ? null : v * 100;
  }

  protected rotuloTipo = (t: string) => rotulo(ROTULO_TIPO_MANUTENCAO, t);
  protected readonly mesDoGrafico = (x: { mes: string }) => x.mes;
  protected readonly chaveGrupo = (g: { chave: string }) => g.chave;
  protected readonly chaveFaixa = (f: { faixa: { chave: string } }) => f.faixa.chave;
  protected readonly identidade = (v: string) => v;

  // ── Bússola ───────────────────────────────────────────────────────────────────────────────
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    const p = this.proprios();
    return {
      id: 'frota.manutencao', nome: 'Manutenção da frota', modulo: 'Frota', rota: '/frota/relatorios/manutencao',
      descricao: 'OS concluídas e abertas, disponibilidade, corretiva × preventiva, MTTR, MTBF, oficinas, itens, peças, mecânicos e retrabalho.',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [
        filtroPainel('base', 'Base', (f.idBase ?? []).map((id) => this.recorte.nomeBase(id)), f.idBase ?? []),
        filtroPainel('tipo', 'Tipo de manutenção', p.tipo.map(this.rotuloTipo), p.tipo),
        filtroPainel('criticidade', 'Criticidade', p.criticidade.map((c) => rotulo(ROTULO_CRITICIDADE, c)), p.criticidade),
        filtroPainel('oficina', 'Oficina', p.oficina.map((c) => rotulo(ROTULO_OFICINA, c)), p.oficina),
        filtroPainel('origem', 'Origem', p.origem.map((c) => rotulo(ROTULO_ORIGEM_OS, c)), p.origem)
      ],
      metricas: m ? [
        metricaPainel('os', 'OS concluídas', m.os.length, 'inteiro'),
        metricaPainel('valor', 'Custo de manutenção', m.valor, 'moeda'),
        metricaPainel('preventiva', 'OS preventivas (%)', m.percPreventiva != null ? m.percPreventiva * 100 : null, 'percentual'),
        metricaPainel('mttr', 'Tempo médio de reparo', m.mttr, 'horas'),
        metricaPainel('mtbf', 'Tempo entre falhas', m.mtbf, 'dias'),
        metricaPainel('disponibilidade', 'Disponibilidade (%)', m.r.manutencao?.disponibilidade.atual != null ? m.r.manutencao.disponibilidade.atual * 100 : null, 'percentual'),
        metricaPainel('abertas', 'OS abertas', m.abertas.length, 'inteiro'),
        metricaPainel('parados', 'Veículos parados agora', m.paradas.length, 'inteiro'),
        metricaPainel('retrabalho', 'OS com retrabalho', m.retrabalho.length, 'inteiro')
      ] : [],
      graficos: m ? [
        graficoPainel('mensal', 'barra', 'OS por mês', m.mensal.map((x) => rotuloMes(x.mes)), [
          { nome: 'Corretivas', valores: m.mensal.map((x) => x.corretivas) }, { nome: 'Preventivas', valores: m.mensal.map((x) => x.preventivas) }], { formato: 'inteiro' }),
        graficoPainel('causas', 'pizza', 'Causa das corretivas', m.porCausa.map((g) => g.rotulo), m.porCausa.map((g) => g.linhas.length), { formato: 'inteiro' }),
        graficoPainel('oficinas', 'tabela', 'Oficinas', m.oficinas.map((o) => o.nome), m.oficinas.map((o) => o.valor), { formato: 'moeda' }),
        graficoPainel('itens', 'tabela', 'Itens mais frequentes', m.itens.slice(0, 15).map((i) => i.item), m.itens.slice(0, 15).map((i) => i.os.length), { formato: 'inteiro' })
      ] : [],
      datasets: ['ordens_servico', 'veiculos'],
      sugestoes: [
        { rotulo: 'O que tira veículo de operação', icone: 'pi pi-wrench', requer: ['dados', 'analise'],
          pergunta: 'O que mais tira veículo de operação neste recorte e como reduzir o tempo parado?' },
        { rotulo: 'Oficinas', icone: 'pi pi-building', requer: ['dados', 'analise'],
          pergunta: 'Compare as oficinas deste recorte em preço, prazo e retrabalho. Qual vale manter?' }
      ]
    };
  });
}
