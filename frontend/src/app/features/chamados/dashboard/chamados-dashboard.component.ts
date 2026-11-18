import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesCellDirective,
  CesChartComponent,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesDrillStateService,
  CesFilterPanelComponent,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTabItem,
  CesTabPanelDirective,
  CesTabsComponent,
  cesFilter,
  cesListState
} from '@ces/ui';
import { Chamado, ChamadoFiltros, ChamadoPrioridade, ChamadoStatus, EquipeChamado, TopicoChamado } from '../../../core/models/chamado.models';
import { DashboardChamadosFilter, DashboardChamadosResponse, RankingSolicitanteItem } from '../../../core/models/chamado-dashboard.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ChamadosService } from '../../../core/services/chamados.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { atualizarPeriodicamente } from '../../../shared/components/dashboard/atualizacao-automatica';
import { DashboardAnaliseComponent } from '../../../shared/components/dashboard/dashboard-analise.component';
import { VistaAnalise } from '../../../shared/components/dashboard/dashboard-analise.models';
import { NavegacaoAnaliseService } from '../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardMetricCardComponent } from '../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardVisaoGerencialComponent } from '../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import {
  CopilotoAreaComponent,
  CopilotoDashboardContext,
  CopilotoGatilhoComponent,
  CopilotoPainelService,
  CopilotoPerguntarComponent,
  filtroPainel,
  graficoPainel,
  metricaPainel,
  periodoPainel,
  rotuloDasOpcoes
} from '../../copiloto/painel';
import { PRIORIDADE_OPTIONS, STATUS_OPTIONS, prioridadeTom } from '../chamados-ui';
import {
  DIMENSOES,
  Dimensao,
  FilaAgora,
  FiltrosAplicados,
  LinhaChamado,
  LinhaRanking,
  MOTIVOS,
  MotivoAcao,
  contarMotivos,
  duracao,
  filtroFila,
  graficoFluxo,
  graficoIdade,
  graficoPrioridade,
  graficoRanking,
  graficoStatus,
  inteiro,
  linhaChamado,
  motivoPrincipal,
  noRecorte,
  pct,
  pedeAcao,
  periodoPadrao,
  plural,
  prazoRelativo,
  ranking,
  recorteDosFiltros,
  rotuloPrioridade,
  rotuloStatus,
  statusAbertosDoRecorte,
  variacaoTexto,
  visaoGerencial
} from './analise-chamados';
import { vistaChamados } from './vistas-chamados';

/** Abertos lidos por status (a fila aceita um status por consulta). */
const LIMITE_ABERTOS_POR_STATUS = 200;
/** Logins buscados por rodada para nomear responsáveis fora do ranking de atendentes. */
const LIMITE_LOGINS = 30;

interface Carga {
  readonly recorte: DashboardChamadosFilter;
  readonly d: DashboardChamadosResponse;
  /** Abertos agora no recorte; `null` quando a fila não pôde ser lida. */
  readonly abertos: { readonly chamados: Chamado[]; readonly truncado: boolean } | null;
  readonly em: number;
}

/**
 * Dashboard de Chamados (Chamados → Relatórios): veredito do recorte, o que pede ação na fila agora,
 * indicadores clicáveis e gráficos com análise detalhada (`?drill=`). Cada número leva à análise ou à
 * fila com o mesmo recorte; cada chamado abre a ficha em `/chamados/fila/:id`.
 */
@Component({
  selector: 'app-chamados-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CesDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe,
    CesAsyncStateComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesCellDirective,
    CesChartComponent,
    CesDataTableComponent,
    CesDatepickerComponent,
    CesFilterPanelComponent,
    CesMultiSelectComponent,
    CesPageHeaderComponent,
    CesSelectComponent,
    CesStatusComponent,
    CesTabPanelDirective,
    CesTabsComponent,
    DashboardAnaliseComponent,
    DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent,
    CopilotoAreaComponent,
    CopilotoGatilhoComponent,
    CopilotoPerguntarComponent
  ],
  templateUrl: './chamados-dashboard.component.html',
  styleUrl: './chamados-dashboard.component.css'
})
export class ChamadosDashboardComponent {
  private readonly service = inject(ChamadosService);
  private readonly usuarios = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly copiloto = inject(CopilotoPainelService);
  protected readonly analise = inject(NavegacaoAnaliseService);
  protected readonly copilotoDisponivel = this.copiloto.disponivelParaUsuario();

  protected readonly inteiro = inteiro;
  protected readonly pct = pct;
  protected readonly plural = plural;
  protected readonly duracao = duracao;
  protected readonly motivos = MOTIVOS;
  protected readonly Math = Math;

  // ── Filtros ──────────────────────────────────────────────────────────────────────────────────
  protected readonly topicos = signal<TopicoChamado[]>([]);
  protected readonly equipes = signal<EquipeChamado[]>([]);
  protected readonly topicoOpcoes = computed<CesSelectOption<string>[]>(() => this.topicos().map((t) => ({ label: t.nome, value: t.id })));
  protected readonly equipeOpcoes = computed<CesSelectOption<string>[]>(() => this.equipes().map((e) => ({ label: e.nome, value: e.id })));
  protected readonly prioridadeOpcoes = PRIORIDADE_OPTIONS;
  protected readonly statusOpcoes = STATUS_OPTIONS;
  protected readonly slaOpcoes: CesSelectOption<boolean | null>[] = [
    { label: 'Todos os prazos', value: null },
    { label: 'Só com SLA estourado', value: true },
    { label: 'Só dentro do prazo', value: false }
  ];

  protected readonly lista = cesListState({
    storageKey: 'chamados-dashboard',
    queryParam: false,
    filters: {
      periodo: cesFilter.range(periodoPadrao(), { label: 'Período' }),
      topico: cesFilter.list<string>([], { label: 'Tópico', itemLabel: (id) => this.topicoOpcoes().find((o) => o.value === id)?.label ?? 'tópico selecionado', countLabel: (n) => `${n} tópicos` }),
      equipe: cesFilter.list<string>([], { label: 'Equipe', itemLabel: (id) => this.equipeOpcoes().find((o) => o.value === id)?.label ?? 'equipe selecionada', countLabel: (n) => `${n} equipes` }),
      prioridade: cesFilter.list<string>([], { label: 'Prioridade', itemLabel: (v) => rotuloPrioridade(v as ChamadoPrioridade), countLabel: (n) => `${n} prioridades` }),
      status: cesFilter.list<string>([], { label: 'Status', itemLabel: (v) => rotuloStatus(v as ChamadoStatus), countLabel: (n) => `${n} status` }),
      sla: cesFilter.value<boolean | null>(null, { label: 'Prazo', type: 'boolean', options: () => this.slaOpcoes })
    }
  });

  protected readonly resultado = this.lista.results<Carga>(
    (pedido) => this.carregar(recorteDosFiltros(pedido.filters)).pipe(map((c) => [c])),
    { immediate: true, errorMessage: getErrorMessage }
  );
  protected readonly carga = computed<Carga | null>(() => this.resultado.rows()[0] ?? null);
  protected readonly carregando = this.resultado.loading;
  protected readonly erro = this.resultado.error;

  /** Logins de responsáveis que não estão no ranking de atendentes do período. */
  private readonly logins = signal<Readonly<Record<string, string>>>({});

  // ── Modelo ───────────────────────────────────────────────────────────────────────────────────
  protected readonly d = computed(() => this.carga()?.d ?? null);
  private readonly nomesAtendentes = computed(() => new Map((this.d()?.desempenhoPorAtendente ?? []).map((a) => [a.id, a.nome])));
  private readonly nomeUsuario = (id: string): string => this.nomesAtendentes().get(id) ?? this.logins()[id] ?? 'Atribuído';

  protected readonly fila = computed<FilaAgora | null>(() => {
    const c = this.carga();
    if (!c?.abertos) return null;
    const linhas = c.abertos.chamados.map((ch) => linhaChamado(ch, c.em, this.nomeUsuario)).filter((l) => noRecorte(l, c.recorte));
    return { linhas, truncado: c.abertos.truncado };
  });
  protected readonly acao = computed(() => pedeAcao(this.fila()?.linhas ?? []));
  protected readonly contagem = computed(() => (this.fila() ? contarMotivos(this.fila()!.linhas) : null));
  protected readonly visao = computed(() => {
    const d = this.d();
    return d ? visaoGerencial(d, this.fila()) : null;
  });
  protected readonly semDados = computed(() => {
    const d = this.d();
    return !!d && !d.totalChamados && !(this.fila()?.linhas.length ?? d.totalPendentes);
  });

  protected readonly fluxo = computed(() => (this.d() ? graficoFluxo(this.d()!) : null));
  protected readonly status = computed(() => (this.d() ? graficoStatus(this.d()!) : null));
  protected readonly idade = computed(() => (this.d() ? graficoIdade(this.d()!) : null));
  protected readonly prioridade = computed(() => (this.d() ? graficoPrioridade(this.d()!) : null));

  protected readonly dimensao = signal<Dimensao>('topico');
  protected readonly abasDimensao: CesTabItem[] = (Object.keys(DIMENSOES) as Dimensao[]).map((k) => ({ value: k, label: DIMENSOES[k].rotulo, icon: DIMENSOES[k].icone }));
  protected readonly dimensoes = DIMENSOES;
  protected readonly linhasRanking = computed(() => (this.d() ? ranking(this.d()!, this.dimensao()) : []));
  protected readonly graficoDimensao = computed(() => graficoRanking(this.linhasRanking()));

  /** Número de cada cartão "pede ação": da fila lida agora ou, sem ela, do backend. */
  protected motivo(m: MotivoAcao): number {
    const c = this.contagem();
    if (c) return c[m];
    const q = this.d()?.qualidadeDados;
    return m === 'sem-responsavel' ? q?.chamadosSemResponsavel ?? 0 : m === 'parado' ? q?.chamadosEstagnadosSemInteracao ?? 0 : 0;
  }
  protected readonly comparacao = (chave: string, alternativo: string): string => variacaoTexto(this.d()?.indicadores?.[chave]) ?? alternativo;

  // ── Tabelas ──────────────────────────────────────────────────────────────────────────────────
  protected readonly colAcao: CesDataTableColumn<LinhaChamado>[] = [
    { key: 'situacao', header: 'Por que pede ação', type: 'custom', priority: 1, value: (l) => MOTIVOS[motivoPrincipal(l)!].peso, display: (l) => l.motivos.map((m) => MOTIVOS[m].curto).join(', ') },
    { key: 'protocolo', header: 'Protocolo', priority: 1 },
    { key: 'assunto', header: 'Assunto', priority: 1 },
    { key: 'prioridade', header: 'Prioridade', type: 'custom', priority: 2, value: (l) => ['CRITICA', 'ALTA', 'NORMAL', 'BAIXA'].indexOf(l.prioridade), display: (l) => rotuloPrioridade(l.prioridade) },
    { key: 'equipe', header: 'Equipe', priority: 2 },
    { key: 'responsavel', header: 'Responsável', priority: 2 },
    { key: 'prazo', header: 'Prazo', type: 'custom', priority: 1, value: (l) => l.horasParaPrazo, display: (l) => prazoRelativo(l) },
    { key: 'parado', header: 'Sem interação', type: 'custom', priority: 3, value: (l) => l.diasParado, display: (l) => (l.diasParado ? plural(l.diasParado, 'dia', 'dias') : 'hoje') }
  ];
  protected readonly chaveLinha = (l: LinhaChamado) => l.id;
  protected readonly rotuloLinha = (l: LinhaChamado) => `Chamado ${l.protocolo}`;
  protected readonly principal = (l: unknown) => MOTIVOS[motivoPrincipal(l as LinhaChamado)!];
  protected readonly extras = (l: unknown) => (l as LinhaChamado).motivos.length - 1;
  protected readonly tomPrioridade = (l: unknown) => prioridadeTom((l as LinhaChamado).prioridade);
  protected readonly rotuloPrioridade = (l: unknown) => rotuloPrioridade((l as LinhaChamado).prioridade);
  protected readonly vencido = (l: unknown) => (l as LinhaChamado).horasParaPrazo < 0 && !(l as LinhaChamado).slaPausado;
  protected readonly prazo = (l: unknown) => prazoRelativo(l as LinhaChamado);

  protected readonly colRanking = computed<CesDataTableColumn<LinhaRanking>[]>(() => [
    { key: 'nome', header: DIMENSOES[this.dimensao()].singular, priority: 1 },
    { key: 'detalhe', header: this.dimensao() === 'atendente' ? 'Equipe' : 'Código', priority: 3 },
    { key: 'total', header: 'Chamados', type: 'integer', priority: 1 },
    { key: 'resolvidos', header: 'Resolvidos', type: 'integer', priority: 2 },
    { key: 'pendentes', header: 'Em aberto', type: 'integer', priority: 1 },
    { key: 'taxaResolucao', header: 'Resolução', type: 'percent', priority: 2 },
    { key: 'sla', header: 'SLA', type: 'percent', priority: 1 },
    { key: 'mediana', header: 'Resolução mediana', type: 'custom', priority: 3, value: (l) => l.mediana, display: (l) => (l.resolvidos ? duracao(l.mediana) : '—') }
  ]);
  protected readonly chaveRanking = (l: LinhaRanking) => l.chave;
  protected readonly rotuloRanking = (l: LinhaRanking) => l.nome;

  protected readonly colSolicitantes: CesDataTableColumn<RankingSolicitanteItem>[] = [
    { key: 'nome', header: 'Solicitante', priority: 1 },
    { key: 'totalChamados', header: 'Chamados', type: 'integer', priority: 1 },
    { key: 'participacaoPercentual', header: 'Do total', type: 'percent', priority: 2 }
  ];
  protected readonly chaveSolicitante = (s: RankingSolicitanteItem) => s.id;

  // ── Análise detalhada ────────────────────────────────────────────────────────────────────────
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const c = this.carga();
    if (!c) return null;
    return vistaChamados(this.analise.alvo(), {
      d: c.d,
      fila: this.fila(),
      recorte: c.recorte,
      carregar: (f) => this.lerFila(f)
    });
  });

  constructor() {
    this.carregarLookups();
    atualizarPeriodicamente(() => this.lista.reload(), { pode: () => !this.carregando() && !!this.carga() });

    // Link de análise que não existe mais no recorte: fecha o painel.
    effect(() => {
      if (this.analise.alvo() && this.carga() && !this.carregando() && !this.vistaAnalise()) this.analise.fechar();
    });

    // Nomeia responsáveis que não aparecem no ranking de atendentes do período.
    effect(() => {
      const c = this.carga();
      if (!c?.abertos) return;
      const conhecidos = untracked(() => ({ ...this.logins(), ...Object.fromEntries(this.nomesAtendentes()) }));
      const faltam = [...new Set(c.abertos.chamados.map((ch) => ch.usuarioResponsavelId).filter((id): id is string => !!id && !(id in conhecidos)))];
      untracked(() => this.carregarLogins(faltam.slice(0, LIMITE_LOGINS)));
    });
  }

  private carregarLookups(): void {
    forkJoin({
      topicos: this.service.listarTopicosAtivos().pipe(catchError(() => of([] as TopicoChamado[]))),
      equipes: this.service.listarEquipes({ ativo: true, size: 100 }).pipe(catchError(() => of({ content: [] as EquipeChamado[] })))
    }).subscribe(({ topicos, equipes }) => {
      this.topicos.set(topicos);
      this.equipes.set(equipes.content ?? []);
    });
  }

  private carregarLogins(ids: readonly string[]): void {
    if (!ids.length) return;
    // Marca como em busca: uma recarga antes da resposta não repete a consulta.
    this.logins.update((atual) => ({ ...atual, ...Object.fromEntries(ids.map((id) => [id, '…'])) }));
    for (const id of ids) {
      this.usuarios.buscarUsuarioPorId(id).pipe(catchError(() => of(null))).subscribe((u) =>
        this.logins.update((atual) => ({ ...atual, [id]: u?.login ?? 'Usuário removido' }))
      );
    }
  }

  /** Dashboard do recorte + abertos agora (a falha da fila não derruba o painel). */
  private carregar(recorte: DashboardChamadosFilter): Observable<Carga> {
    const status = statusAbertosDoRecorte(recorte);
    const abertos$ = status.length
      ? forkJoin(status.map((s) => this.service.listarFila(filtroFila(recorte, { status: s, page: 0, size: LIMITE_ABERTOS_POR_STATUS, sort: 'dataLimiteResolucao,asc' }, false)))).pipe(
          map((paginas) => ({ chamados: paginas.flatMap((p) => p.content), truncado: paginas.some((p) => (p.page?.totalElements ?? 0) > p.content.length) })),
          catchError(() => of(null))
        )
      : of({ chamados: [], truncado: false });
    return forkJoin({ d: this.service.obterDashboard(recorte), abertos: abertos$ }).pipe(map(({ d, abertos }) => ({ recorte, d, abertos, em: Date.now() })));
  }

  private lerFila(f: ChamadoFiltros): Observable<{ linhas: LinhaChamado[]; total: number }> {
    return this.service.listarFila(f).pipe(map((p) => {
      const agora = Date.now();
      return { linhas: p.content.map((c) => linhaChamado(c, agora, this.nomeUsuario)), total: p.page?.totalElements ?? p.content.length };
    }));
  }

  // ── Ações ────────────────────────────────────────────────────────────────────────────────────
  protected definirPeriodo(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.periodo.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }
  protected readonly dataLocal = dataLocal;

  protected removerFiltro(chave: string): void {
    this.lista.remove(chave as keyof FiltrosAplicados);
  }

  protected analisar(dimension: string, value: string): void {
    this.analise.abrir(dimension, value);
  }

  protected selecionar<K>(chaves: readonly K[] | undefined, indice: number, dimensao: string): void {
    const k = chaves?.[indice];
    if (k !== undefined) this.analisar(dimensao, String(k));
  }

  protected abrirChamado(l: LinhaChamado): void {
    void this.router.navigate(['/chamados/fila', l.id]);
  }

  protected abrirFila(): void {
    void this.router.navigate(['/chamados/fila']);
  }

  protected aprofundar(alvo: { dimension: string; value: string }): void {
    this.analise.aprofundar(alvo, this.vistaAnalise()?.titulo ?? '');
  }

  protected perguntarAnalise(vista: VistaAnalise): void {
    if (!vista.copiloto) return;
    this.analise.fechar();
    this.copiloto.perguntarSobre(vista.copiloto.foco, vista.copiloto.pergunta);
  }

  protected perguntarVisao(): void {
    this.copiloto.perguntarSobre(
      { tipo: 'secao', id: 'visaoGerencial', rotulo: 'Visão gerencial' },
      'Quais são as prioridades da central de chamados agora e o que fazer primeiro?'
    );
  }

  // ── Bússola ───────────────────────────────────────────────────────────────────────────────
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const c = this.carga();
    const d = c?.d ?? null;
    const f = c?.recorte ?? recorteDosFiltros(this.lista.applied());
    const indicador = (chave: string, rotulo: string, formato: 'inteiro' | 'percentual', melhor: 'maior' | 'menor') => {
      const ind = d?.indicadores?.[chave];
      return metricaPainel(chave, rotulo, ind?.valor, formato, {
        descricao: ind?.definicao,
        comparacao: ind && ind.anterior
          ? { rotulo: 'vs. período anterior', valorAnterior: ind.anterior, variacaoPercentual: ind.variacaoPercentual, melhorQuando: melhor }
          : undefined
      });
    };
    const dim = this.dimensao();
    const linhas = this.linhasRanking();
    const fluxo = this.fluxo();
    const idade = this.idade();
    const prio = this.prioridade();
    const st = this.status();
    return {
      id: 'chamados.gestao',
      nome: 'Dashboard de chamados',
      modulo: 'Chamados',
      descricao: 'Volume, tempo de atendimento e cumprimento de SLA dos chamados; fila em aberto com o que pede ação agora (SLA estourado, prazo a vencer, sem responsável, parados) e desempenho por tópico, equipe e atendente.',
      rota: '/chamados/dashboard',
      periodo: periodoPainel(d?.inicio ?? f.inicio ?? null, d?.fim ?? f.fim ?? null),
      filtros: [
        filtroPainel('topico', 'Tópico', rotuloDasOpcoes(this.topicos(), f.topicoId ?? [], (i) => i.id, (i) => i.nome), f.topicoId ?? []),
        filtroPainel('equipe', 'Equipe', rotuloDasOpcoes(this.equipes(), f.equipeId ?? [], (i) => i.id, (i) => i.nome), f.equipeId ?? []),
        filtroPainel('prioridade', 'Prioridade', (f.prioridade ?? []).map(rotuloPrioridade), f.prioridade ?? []),
        filtroPainel('status', 'Status', (f.status ?? []).map(rotuloStatus), f.status ?? []),
        filtroPainel('sla', 'Prazo', f.slaVencido === true ? 'Só com SLA estourado' : f.slaVencido === false ? 'Só dentro do prazo' : null)
      ],
      metricas: d
        ? [
            indicador('totalChamados', 'Chamados abertos no período', 'inteiro', 'menor'),
            indicador('chamadosResolvidos', 'Chamados resolvidos', 'inteiro', 'maior'),
            indicador('backlogTotal', 'Fila em aberto', 'inteiro', 'menor'),
            indicador('taxaSlaResolucao', 'SLA de resolução', 'percentual', 'maior'),
            metricaPainel('taxaResolucao', 'Taxa de resolução', d.taxaResolucao, 'percentual'),
            metricaPainel('tempoMedianoResolucaoHoras', 'Resolução mediana', d.tempoMedianoResolucaoHoras, 'horas', { descricao: `P90 ${duracao(d.tempoP90ResolucaoHoras)}` }),
            metricaPainel('tempoMedianoPrimeiraRespostaHoras', '1ª resposta (mediana)', d.tempoMedianoPrimeiraRespostaHoras, 'horas', { descricao: `SLA de 1ª resposta ${pct(d.taxaSlaPrimeiraRespostaPercentual)}` }),
            metricaPainel('taxaReabertura', 'Reaberturas', d.taxaReabertura, 'percentual', { descricao: `${d.totalReabertos} reabertos` }),
            metricaPainel('slaEstourado', 'Em aberto com SLA estourado', this.motivo('sla-vencido'), 'inteiro'),
            metricaPainel('aVencer', 'Vencem nas próximas 24 h', this.motivo('a-vencer'), 'inteiro'),
            metricaPainel('semResponsavel', 'Em aberto sem responsável', this.motivo('sem-responsavel'), 'inteiro'),
            metricaPainel('parados', 'Parados há 3 dias ou mais', this.motivo('parado'), 'inteiro'),
            metricaPainel('pedeAcao', 'Chamados que pedem ação', this.acao().length, 'inteiro')
          ]
        : [],
      graficos: d && fluxo && idade && prio && st
        ? [
            graficoPainel('fluxo', 'linha', 'Abertura e resolução no período', fluxo.rotulos, fluxo.series.map((s) => ({ nome: s.name, valores: s.values })),
              { metrica: 'chamados', dimensao: 'período de abertura', formato: 'inteiro' }),
            graficoPainel('status', 'barra', 'Situação dos chamados do período', st.rotulos, st.series[0].values, { metrica: 'chamados', dimensao: 'status', formato: 'inteiro' }),
            graficoPainel('idade', 'barra', 'Fila em aberto por tempo desde a abertura', idade.rotulos, idade.series.map((s) => ({ nome: s.name, valores: s.values })),
              { metrica: 'chamados em aberto', dimensao: 'tempo em aberto', formato: 'inteiro' }),
            graficoPainel('prioridade', 'barra', 'Volume por prioridade', prio.rotulos, prio.series.map((s) => ({ nome: s.name, valores: s.values })),
              { metrica: 'chamados', dimensao: 'prioridade', formato: 'inteiro' }),
            graficoPainel(`desempenho.${dim}`, 'tabela', `Desempenho por ${DIMENSOES[dim].singular.toLowerCase()}`, linhas.map((l) => l.nome), [
              { nome: 'Chamados', valores: linhas.map((l) => l.total) },
              { nome: 'Resolvidos', valores: linhas.map((l) => l.resolvidos) },
              { nome: 'Em aberto', valores: linhas.map((l) => l.pendentes) },
              { nome: 'SLA (%)', valores: linhas.map((l) => l.sla) }
            ], { metrica: 'chamados', dimensao: DIMENSOES[dim].singular.toLowerCase(), totalCategorias: linhas.length * 4 })
          ]
        : [],
      datasets: ['chamados'],
      extras: d?.periodo?.comparacaoInicio
        ? { 'Período de comparação': `${new Date(d.periodo.comparacaoInicio).toLocaleDateString('pt-BR')} a ${new Date(d.periodo.comparacaoFim).toLocaleDateString('pt-BR')}` }
        : undefined,
      sugestoes: [
        { rotulo: 'O que atacar primeiro', icone: 'pi pi-list-check', requer: ['dados', 'analise'],
          pergunta: 'Dos chamados em aberto, quais atacar primeiro (SLA estourado, a vencer, sem responsável) e quem cobrar em cada um?' },
        { rotulo: 'Chamados mais antigos', icone: 'pi pi-clock', requer: ['dados'],
          pergunta: 'Quais chamados deste recorte estão há mais tempo em aberto, com qual prioridade e quem é o responsável?' },
        { rotulo: 'Por que o SLA mudou?', icone: 'pi pi-arrow-right-arrow-left', requer: ['dados', 'analise'],
          pergunta: 'O que explica o cumprimento de SLA deste recorte em relação ao período anterior? Detalhe por tópico e equipe.' }
      ]
    };
  });
}
