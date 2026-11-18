import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { ParamMap, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoChartComponent,
  GeoDataTableColumn,
  GeoCellDirective,
  GeoDataTableComponent,
  GeoDrillStateService,
  GeoFilterChip,
  GeoFilterPanelComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectOption,
  GeoStatusComponent
} from '@geo/ui';

import { FechamentoRelatorio, FechamentoRelatorioResponse } from '../../../../../core/models/almoxarifado-relatorios.models';
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
import { TIPOS_TECNICOS, inteiro, pct, plural, tempo } from '../almox-analise-comum';
import { AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent } from '../almox-painel.components';
import { FiltroAlmox, PainelAlmoxBase } from '../painel-almox-base';
import { RecorteAlmoxService } from '../recorte-almox.service';
import {
  FiltrosFechamento,
  ModeloFechamento,
  ObraFechamento,
  ROTULO_PRAZO,
  ROTULO_SITUACAO_FECHAMENTO,
  ROTULO_TIPO_OBRA,
  SITUACOES_FECHAMENTO,
  TAG_OBRA,
  TAG_PRAZO,
  TAG_SITUACAO_FECHAMENTO,
  aceitaFechamento,
  colFechamento,
  emAndamento,
  modeloFechamento,
  visaoFechamento,
  vistaFechamento
} from './analise-fechamento';

/**
 * Relatório do encerramento de obras: os prazos de 48 horas úteis da reserva e da movimentação, as obras
 * que travam o encerramento, quem atrasa e as pendências.
 */
@Component({
  selector: 'app-almox-painel-fechamento',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteAlmoxService, GeoDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, GeoAsyncStateComponent, GeoCellDirective, GeoStatusComponent, GeoButtonComponent, GeoCalloutComponent, GeoChartComponent, GeoDataTableComponent,
    GeoFilterPanelComponent, GeoMultiSelectComponent, GeoPageHeaderComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './almox-painel-fechamento.component.html',
  styleUrl: '../painel-almox.css'
})
export class AlmoxPainelFechamentoComponent extends PainelAlmoxBase<FechamentoRelatorioResponse> {
  private readonly router = inject(Router);
  protected readonly inteiro = inteiro;
  protected readonly pct = pct;
  protected readonly tempo = tempo;
  protected readonly plural = plural;
  protected readonly Math = Math;

  protected readonly tiposSel = signal<string[]>([]);
  protected readonly situacoesSel = signal<string[]>([]);
  protected readonly prazosSel = signal<string[]>([]);
  protected readonly tiposObraSel = signal<string[]>([]);
  private readonly proprios = signal<FiltrosFechamento>({ tipos: [], situacoes: [], prazos: [], tiposObra: [] });

  protected readonly opcoesTipo: GeoSelectOption<string>[] = Object.entries(TIPOS_TECNICOS).map(([value, l]) => ({ label: `${value} · ${l}`, value }));
  protected readonly opcoesSituacao: GeoSelectOption<string>[] = SITUACOES_FECHAMENTO.map((s) => ({ label: ROTULO_SITUACAO_FECHAMENTO[s], value: s }));
  protected readonly opcoesPrazo: GeoSelectOption<string>[] = Object.entries(ROTULO_PRAZO).map(([value, label]) => ({ label, value }));
  protected readonly opcoesTipoObra: GeoSelectOption<string>[] = Object.entries(ROTULO_TIPO_OBRA).map(([value, label]) => ({ label, value }));

  protected readonly chipsProprios = computed<GeoFilterChip[]>(() => {
    const f = this.proprios();
    const chip = (key: string, rotulo: string, sel: string[], nome: (v: string) => string): GeoFilterChip[] =>
      sel.length ? [{ key, label: `${rotulo}: ${sel.length === 1 ? nome(sel[0]) : `${sel.length} selecionados`}` }] : [];
    return [
      ...chip('tipo', 'Tipo', f.tipos, (v) => v),
      ...chip('situacao', 'Situação', f.situacoes, (v) => ROTULO_SITUACAO_FECHAMENTO[v as keyof typeof ROTULO_SITUACAO_FECHAMENTO] ?? v),
      ...chip('prazo', 'Prazo', f.prazos, (v) => ROTULO_PRAZO[v] ?? v),
      ...chip('tipoObra', 'Tipo de obra', f.tiposObra, (v) => ROTULO_TIPO_OBRA[v] ?? v)
    ];
  });

  protected readonly modelo = computed<ModeloFechamento | null>(() => {
    const d = this.dados();
    if (!d) return null;
    const almox = this.recorte.aplicado().idAlmoxarifado;
    const set = almox?.length ? new Set(almox) : null;
    const proprios = aceitaFechamento(this.proprios());
    return modeloFechamento(d, (s) => (!set || (!!s.idAlmoxarifado && set.has(s.idAlmoxarifado))) && proprios(s));
  });
  protected readonly visao = computed(() => {
    const m = this.modelo();
    return m ? visaoFechamento(m) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const m = this.modelo();
    return a && m ? vistaFechamento(a, m) : null;
  });

  protected readonly graficoPrazos = computed(() => {
    const m = this.modelo();
    const meses = m?.meses ?? [];
    return {
      rotulos: meses.map((x) => x.rotulo),
      series: [
        { name: 'Reserva no prazo', values: meses.map((x) => x.reserva.taxa) },
        { name: 'Movimentação no prazo', values: meses.map((x) => x.movimentacao.taxa) }
      ]
    };
  });
  protected readonly situacoesComValor = computed(() => {
    const m = this.modelo();
    return m ? SITUACOES_FECHAMENTO.map((s) => ({ s, n: m.todas.filter((x) => x.situacao === s).length })).filter((x) => x.n) : [];
  });
  protected readonly graficoSituacoes = computed(() => ({
    rotulos: this.situacoesComValor().map((x) => ROTULO_SITUACAO_FECHAMENTO[x.s]),
    series: [{ name: 'Solicitações', values: this.situacoesComValor().map((x) => x.n) }]
  }));
  protected readonly obrasTop = computed(() => (this.modelo()?.obras ?? []).slice(0, 12));
  protected readonly graficoObras = computed(() => {
    const o = this.obrasTop();
    return {
      rotulos: o.map((x) => x.rotulo),
      series: [
        { name: 'Concluídas', values: o.map((x) => x.linhas.filter((s) => s.situacao === 'MOVIMENTADA').length) },
        { name: 'Em andamento no prazo', values: o.map((x) => x.abertas - x.atrasadas) },
        { name: 'Atrasadas', values: o.map((x) => x.atrasadas) }
      ]
    };
  });
  protected readonly supervisoresTop = computed(() => (this.modelo()?.porSupervisor ?? []).slice(0, 10));
  protected readonly graficoSupervisores = computed(() => {
    const g = this.supervisoresTop();
    return {
      rotulos: g.map((x) => x.rotulo),
      series: [
        { name: 'Em andamento', values: g.map((x) => x.linhas.filter((s) => emAndamento(s) && s.situacaoPrazo !== 'ATRASADO').length) },
        { name: 'Atrasadas', values: g.map((x) => x.linhas.filter((s) => s.situacaoPrazo === 'ATRASADO').length) },
        { name: 'Concluídas', values: g.map((x) => x.linhas.filter((s) => s.situacao === 'MOVIMENTADA').length) }
      ]
    };
  });
  protected readonly fila = computed(() => {
    const m = this.modelo();
    if (!m) return [];
    const peso: Record<string, number> = { ATRASADO: 0, VENCE_EM_BREVE: 1, NO_PRAZO: 2 };
    return [...m.abertas].sort((a, b) => (peso[a.situacaoPrazo ?? ''] ?? 3) - (peso[b.situacaoPrazo ?? ''] ?? 3)
      || (a.prazoVigenteAte ?? '').localeCompare(b.prazoVigenteAte ?? ''));
  });

  protected readonly colFechamento = colFechamento;
  protected readonly colObras: GeoDataTableColumn<ObraFechamento>[] = [
    { key: 'rotulo', header: 'Obra', priority: 1 },
    { key: 'titulo', header: 'Título', priority: 2, value: (o) => o.titulo ?? '—' },
    { key: 'tipoObra', header: 'Tipo', priority: 3, value: (o) => ROTULO_TIPO_OBRA[o.tipoObra ?? ''] ?? '—' },
    { key: 'situacaoObra', header: 'Encerramento da obra', priority: 1,
      value: (o) => ({ PENDENTE: 'Pendente', PARCIAL: 'Parcial', FINALIZADO: 'Finalizado', SEM_SOLICITACOES: 'Sem solicitações' } as Record<string, string>)[o.situacaoObra ?? ''] ?? '—' },
    { key: 'solicitacoes', header: 'Solicitações', type: 'custom', priority: 2, value: (o) => o.linhas.length, display: (o) => inteiro(o.linhas.length) },
    { key: 'abertas', header: 'Em andamento', type: 'integer', priority: 1 },
    { key: 'atrasadas', header: 'Atrasadas', type: 'integer', priority: 1 },
    { key: 'pendencias', header: 'Com pendência', type: 'integer', priority: 3 }
  ];
  protected readonly chaveLinha = (s: FechamentoRelatorio) => s.id;
  protected readonly devolucao = (s: unknown) => ['222', '922'].includes((s as FechamentoRelatorio).tipo);
  protected readonly tagSituacao = (s: unknown) => TAG_SITUACAO_FECHAMENTO[(s as FechamentoRelatorio).situacao];
  protected readonly rotuloSituacao = (s: unknown) => ROTULO_SITUACAO_FECHAMENTO[(s as FechamentoRelatorio).situacao];
  protected readonly tagPrazo = (s: unknown) => TAG_PRAZO[(s as FechamentoRelatorio).situacaoPrazo ?? ''] ?? null;
  protected readonly rotuloPrazo = (s: unknown) => ROTULO_PRAZO[(s as FechamentoRelatorio).situacaoPrazo ?? ''] ?? '';
  protected readonly tagObra = (o: unknown) => TAG_OBRA[(o as ObraFechamento).situacaoObra ?? 'SEM_SOLICITACOES'] ?? TAG_OBRA['SEM_SOLICITACOES'];
  protected readonly chaveObra = (o: ObraFechamento) => o.chave;

  constructor() {
    super();
    effect(() => {
      const d = this.dados();
      if (d) this.recorte.conhecer(d.solicitacoes.map((s) => [s.idAlmoxarifado, s.almoxarifado] as [string | null, string | null]), []);
    });
    this.iniciar();
  }

  protected carregar(f: FiltroAlmox) {
    return this.relatorios.fechamento(f.de, f.ate);
  }
  protected parametrosProprios() {
    const f = this.proprios();
    const j = (l: string[]) => (l.length ? l.join(',') : null);
    return { tipo: j(f.tipos), situacao: j(f.situacoes), prazo: j(f.prazos), tipoObra: j(f.tiposObra) };
  }
  protected lerProprios(q: ParamMap): void {
    const l = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
    this.tiposSel.set(l('tipo'));
    this.situacoesSel.set(l('situacao'));
    this.prazosSel.set(l('prazo'));
    this.tiposObraSel.set(l('tipoObra'));
  }
  protected aplicarProprios(): void {
    this.proprios.set({ tipos: this.tiposSel(), situacoes: this.situacoesSel(), prazos: this.prazosSel(), tiposObra: this.tiposObraSel() });
  }
  protected limparProprios(): void {
    for (const s of [this.tiposSel, this.situacoesSel, this.prazosSel, this.tiposObraSel]) s.set([]);
  }
  protected removerProprio(chave: string): void {
    const mapa: Record<string, WritableSignal<string[]>> = { tipo: this.tiposSel, situacao: this.situacoesSel, prazo: this.prazosSel, tipoObra: this.tiposObraSel };
    mapa[chave]?.set([]);
  }

  protected analisarMes(i: number): void {
    this.selecionar(this.modelo()?.meses ?? [], i, 'mes', (x) => x.mes);
  }
  protected analisarSituacao(i: number): void {
    this.selecionar(this.situacoesComValor(), i, 'situacao', (x) => x.s);
  }
  protected analisarObra(i: number): void {
    this.selecionar(this.obrasTop(), i, 'obra', (o) => o.chave);
  }
  protected analisarSupervisor(i: number): void {
    this.selecionar(this.supervisoresTop(), i, 'supervisor', (g) => g.chave);
  }
  protected abrir(s: FechamentoRelatorio): void {
    void this.router.navigate(['/obras/encerramento', s.id]);
  }
  protected tom(t: number | null): 'green' | 'amber' | 'red' | 'slate' {
    return t == null ? 'slate' : t >= 0.9 ? 'green' : t >= 0.75 ? 'amber' : 'red';
  }

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    const p = this.proprios();
    return {
      id: 'almoxarifado.relatorios.fechamento',
      nome: 'Encerramento de obras',
      modulo: 'Almoxarifado',
      descricao: 'Solicitações de encerramento de obra (221/921/222/922): prazos de 48 horas úteis da reserva e da movimentação, obras, supervisores, pendências.',
      rota: '/almoxarifado/relatorios/fechamento',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [filtroPainel('situacao', 'Situação', p.situacoes.map((s) => ROTULO_SITUACAO_FECHAMENTO[s as keyof typeof ROTULO_SITUACAO_FECHAMENTO] ?? s), p.situacoes)],
      metricas: m ? [
        metricaPainel('periodo', 'Solicitações no período', m.periodo.length, 'inteiro'),
        metricaPainel('abertas', 'Em andamento', m.abertas.length, 'inteiro'),
        metricaPainel('atrasadas', 'Com prazo vencido', m.atrasadas.length, 'inteiro'),
        metricaPainel('reserva', 'Reserva no prazo', m.reserva.taxa == null ? null : m.reserva.taxa * 100, 'percentual'),
        metricaPainel('movimentacao', 'Movimentação no prazo', m.movimentacao.taxa == null ? null : m.movimentacao.taxa * 100, 'percentual'),
        metricaPainel('obras', 'Obras finalizadas', m.obrasFinalizadas, 'inteiro', { descricao: `de ${m.obras.length}` })
      ] : [],
      graficos: m ? [
        graficoPainel('obras', 'tabela', 'Obras com encerramento em andamento', m.obras.slice(0, 15).map((o) => o.rotulo), m.obras.slice(0, 15).map((o) => o.abertas), { totalCategorias: m.obras.length }),
        graficoPainel('situacoes', 'pizza', 'Por situação', this.graficoSituacoes().rotulos, this.graficoSituacoes().series[0].values)
      ] : [],
      datasets: ['solicitacoes_material'],
      sugestoes: [
        { rotulo: 'O que trava?', icone: 'pi pi-filter', requer: ['dados', 'analise'], pergunta: 'O que trava o encerramento das obras neste recorte e quem cobrar?' }
      ]
    };
  });
}
