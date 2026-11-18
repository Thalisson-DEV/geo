import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesChartComponent,
  CesChartPointSelection,
  CesDrillStateService,
  CesFilterChip,
  CesFilterPanelComponent,
  CesMeterComponent,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  NotificationService
} from '@ces/ui';

import { createUrlFilters, qp } from '../../../../core/navigation';
import { getErrorMessage } from '../../../../core/models/shared.models';
import {
  DashboardMetaFisicaFiltros,
  DashboardMetaFisicaResponse,
  competenciaAtual,
  deslocarCompetencia,
  nomeMes,
  nomeMesCurto
} from '../../../../core/models/meta-fisica.models';
import { DashboardService } from '../../../../core/services/dashboard.service';
import { DashboardMetricCardComponent } from '../../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardAnaliseComponent } from '../../../../shared/components/dashboard/dashboard-analise.component';
import { AlvoAnalise, VistaAnalise } from '../../../../shared/components/dashboard/dashboard-analise.models';
import { NavegacaoAnaliseService } from '../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardVisaoGerencialComponent } from '../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { atualizarPeriodicamente } from '../../../../shared/components/dashboard/atualizacao-automatica';
import {
  CopilotoAreaComponent,
  CopilotoDashboardContext,
  CopilotoGatilhoComponent,
  CopilotoPainelService,
  CopilotoPerguntarComponent,
  filtroPainel,
  graficoPainel,
  metricaPainel,
  periodoPainel
} from '../../../copiloto/painel';
import { graficosDaAnalise } from '../analise/analise-copiloto';
import { diaMes, percentual, tomDaMeta } from '../execucao-dashboards.utils';
import { RecorteDashboardService } from '../recorte-dashboard.service';
import { leituraApuracao, vistaMetaFisica, visaoMetaFisica } from './meta-fisica-analise';
import {
  Apuracao,
  CelulaFisica,
  GrupoFisico,
  ModeloMetaFisica,
  SITUACAO_FISICA,
  inteiro,
  modeloMetaFisica,
  notas,
  ordenarPorAtencao,
  umaCasa
} from './meta-fisica-calculos';

type MesRapido = 'atual' | 'anterior' | 'proximo';
type OrdemBases = 'atencao' | 'atingimento' | 'nome';

/**
 * Painel da meta física da Concessionária: notas executadas por base e tipo de serviço contra a meta do
 * mês distribuída pelos dias úteis, com ritmo, projeção e o que falta por dia para fechar o mês.
 */
@Component({
  selector: 'app-dashboard-meta-fisica',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesAsyncStateComponent,
    CesButtonComponent,
    CesChartComponent,
    CesFilterPanelComponent,
    CesMeterComponent,
    CesMultiSelectComponent,
    CesPageHeaderComponent,
    CesSelectComponent,
    CesStatusComponent,
    DashboardMetricCardComponent,
    DashboardAnaliseComponent,
    DashboardVisaoGerencialComponent,
    CopilotoAreaComponent,
    CopilotoGatilhoComponent,
    CopilotoPerguntarComponent
  ],
  providers: [CesDrillStateService, NavegacaoAnaliseService],
  templateUrl: './dashboard-meta-fisica.component.html',
  styleUrls: ['../execucao-dashboards.css', './dashboard-meta-fisica.component.css']
})
export class DashboardMetaFisicaComponent implements OnInit {
  private readonly service = inject(DashboardService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly recorte = inject(RecorteDashboardService);
  protected readonly analise = inject(NavegacaoAnaliseService);
  private readonly copiloto = inject(CopilotoPainelService);
  protected readonly copilotoDisponivel = this.copiloto.disponivelParaUsuario();

  protected readonly situacao = SITUACAO_FISICA;
  protected readonly percentual = percentual;
  protected readonly tomDaMeta = tomDaMeta;
  protected readonly notas = notas;
  protected readonly inteiro = inteiro;
  protected readonly umaCasa = umaCasa;
  protected readonly nomeMes = nomeMes;
  protected readonly diaMes = diaMes;
  protected readonly leitura = leituraApuracao;

  protected readonly loading = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly data = signal<DashboardMetaFisicaResponse | null>(null);

  // Filtros em edição (valem depois de "Aplicar").
  protected readonly competencia = signal<string>(competenciaAtual());
  protected readonly idsBase = signal<string[]>([]);
  protected readonly idsTipo = signal<string[]>([]);
  private readonly aplicado = signal<DashboardMetaFisicaFiltros>({});

  private readonly atualizacao = atualizarPeriodicamente(() => this.buscar(this.aplicado(), true), {
    pode: () => !this.loading() && !!this.data() && this.modelo()?.estado === 'andamento'
  });

  protected readonly visaoSerie = signal<'acumulado' | 'dia'>('acumulado');
  protected readonly ordemBases = signal<OrdemBases>('atencao');
  protected readonly ordens: { valor: OrdemBases; rotulo: string }[] = [
    { valor: 'atencao', rotulo: 'Atenção primeiro' },
    { valor: 'atingimento', rotulo: 'Maior atingimento' },
    { valor: 'nome', rotulo: 'Base' }
  ];
  protected readonly mesesRapidos: { valor: MesRapido; rotulo: string }[] = [
    { valor: 'atual', rotulo: 'Este mês' },
    { valor: 'anterior', rotulo: 'Mês anterior' },
    { valor: 'proximo', rotulo: 'Próximo mês' }
  ];

  private readonly filtrosUrl = createUrlFilters<{ mes: string; idBaseOperacional: string[]; idTipoServico: string[] }>({
    mes: qp.text('mes'),
    idBaseOperacional: qp.list('base'),
    idTipoServico: qp.list('servico')
  });

  protected readonly opcoesMeses = computed<CesSelectOption<string>[]>(() => {
    const atual = competenciaAtual();
    const opcoes: CesSelectOption<string>[] = [];
    for (let i = 3; i >= -18; i--) {
      const comp = deslocarCompetencia(atual, i);
      opcoes.push({ label: nomeMes(comp) + (i === 0 ? ' · atual' : ''), value: comp });
    }
    const escolhido = this.competencia();
    return opcoes.some((o) => o.value === escolhido) ? opcoes : [{ label: nomeMes(escolhido), value: escolhido }, ...opcoes];
  });
  /** Tipos de serviço vêm das metas do período; enquanto o painel não carrega, ficam os do recorte aplicado. */
  protected readonly opcoesTipos = computed<CesSelectOption<string>[]>(() =>
    (this.data()?.tipos ?? []).map((t) => ({ label: t.codigo ? `${t.codigo} · ${t.descricao}` : t.descricao, value: t.id }))
  );

  protected readonly modelo = computed<ModeloMetaFisica | null>(() => {
    const d = this.data();
    return d ? modeloMetaFisica(d) : null;
  });

  protected readonly visaoGerencial = computed(() => {
    const m = this.modelo();
    return m && m.celulas.length ? visaoMetaFisica(m) : null;
  });

  protected readonly mesAtivo = computed<MesRapido | null>(() => {
    const comp = this.aplicado().competencia;
    const atual = competenciaAtual();
    if (comp === atual) return 'atual';
    if (comp === deslocarCompetencia(atual, -1)) return 'anterior';
    if (comp === deslocarCompetencia(atual, 1)) return 'proximo';
    return null;
  });

  protected readonly serieMes = computed(() => {
    const m = this.modelo();
    const dias = m?.diario ?? [];
    const rotulos = dias.map((x) => diaMes(x.data));
    if (this.visaoSerie() === 'dia') {
      return {
        rotulos,
        series: [
          { name: 'Executado no dia', values: dias.map((x) => (x.data > (m?.d.hoje ?? '') ? null : x.realizado)) },
          { name: 'Meta do dia útil', values: dias.map((x) => Math.round(x.metaDia * 10) / 10) }
        ]
      };
    }
    const temProjecao = dias.some((x) => x.projecaoAcumulada != null);
    return {
      rotulos,
      series: [
        { name: 'Meta acumulada', values: dias.map((x) => Math.round(x.metaAcumulada * 10) / 10) },
        { name: 'Executado acumulado', values: dias.map((x) => x.realizadoAcumulado) },
        ...(temProjecao ? [{ name: 'Projeção', values: dias.map((x) => (x.projecaoAcumulada == null ? null : Math.round(x.projecaoAcumulada))) }] : [])
      ]
    };
  });

  protected readonly serieBases = computed(() => {
    const bases = this.modelo()?.bases ?? [];
    const estado = this.modelo()?.estado;
    return {
      rotulos: bases.map((b) => b.nome),
      series: [
        { name: '% da meta executado', values: bases.map((b) => fracao(b.pct)) },
        ...(estado === 'andamento' ? [{ name: '% esperado até ontem', values: bases.map((b) => fracao(b.pctEsperado)) }] : []),
        ...(estado === 'andamento' ? [{ name: '% projetado', values: bases.map((b) => fracao(b.pctProjecao)) }] : [])
      ]
    };
  });

  protected readonly serieHistorico = computed(() => {
    const historico = this.modelo()?.historico ?? [];
    return {
      rotulos: historico.map((h) => nomeMesCurto(h.competencia)),
      series: [
        { name: 'Meta', values: historico.map((h) => h.meta) },
        { name: 'Executado', values: historico.map((h) => h.realizado) }
      ]
    };
  });

  protected readonly basesOrdenadas = computed<GrupoFisico[]>(() => {
    const bases = this.modelo()?.bases ?? [];
    switch (this.ordemBases()) {
      case 'atingimento':
        return [...bases].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
      case 'nome':
        return [...bases].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      default:
        return ordenarPorAtencao(bases);
    }
  });

  /** Matriz base × serviço: colunas são os serviços com meta no mês. */
  protected readonly matriz = computed(() => {
    const m = this.modelo();
    if (!m) return null;
    return {
      servicos: m.servicos,
      linhas: m.bases.map((b) => ({ base: b, celulas: m.servicos.map((s) => b.celulas.find((c) => c.idTipo === s.id) ?? null) }))
    };
  });

  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const alvo = this.analise.alvo();
    const m = this.modelo();
    if (!alvo || !m) return null;
    return vistaMetaFisica(alvo, { m, service: this.service });
  });

  private readonly analiseNoCopiloto = signal<VistaAnalise | null>(null);

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.aplicado();
    const d = m?.d;
    return {
      id: 'execucao.meta-fisica',
      nome: 'Painel da meta física',
      modulo: 'Execução',
      descricao:
        'Meta física da Concessionária: notas por base e tipo de serviço no mês (cada nota conta uma vez; notas só com serviços improdutivos, de serviço não efetuado, não contam), distribuída pelos dias úteis, com executado, esperado até ontem, ritmo, projeção e notas por dia útil que faltam.',
      rota: '/execucao/dashboard-meta-fisica',
      periodo: periodoPainel(d?.inicio ?? null, d?.fim ?? null),
      filtros: [
        filtroPainel('mes', 'Mês', f.competencia ? nomeMes(f.competencia) : null, f.competencia ?? null),
        filtroPainel('baseOperacional', 'Base operacional', this.recorte.resumoDasBases(f.idBaseOperacional), f.idBaseOperacional?.join(',') ?? null),
        filtroPainel('tipoServico', 'Tipo de serviço', this.resumoTipos(f.idTipoServico), f.idTipoServico?.join(',') ?? null)
      ],
      metricas: m
        ? [
            metricaPainel('meta', 'Meta física do mês (notas)', m.geral.meta, 'inteiro'),
            metricaPainel('executadas', 'Notas executadas', m.geral.realizado, 'inteiro', {
              comparacao: { rotulo: 'esperado até ontem', valorAnterior: Math.round(m.geral.esperado), melhorQuando: 'maior' }
            }),
            metricaPainel('percentual', 'Meta atingida', m.geral.pct, 'percentual', { comparacao: { rotulo: 'meta', valorAnterior: 100, melhorQuando: 'maior' } }),
            metricaPainel('projecao', 'Projeção do mês (notas)', m.geral.projecao, 'inteiro'),
            metricaPainel('necessarioPorDia', 'Notas por dia útil para fechar', m.geral.necessarioPorDia, 'numero'),
            metricaPainel('ritmo', 'Ritmo atual (notas por dia útil)', m.geral.ritmo, 'numero'),
            metricaPainel('diasUteisRestantes', 'Dias úteis restantes', m.d.diasUteisRestantes, 'inteiro')
          ]
        : [],
      graficos: m
        ? [
            graficoPainel(
              'matriz',
              'tabela',
              'Base e serviço',
              m.celulas.map((c) => `${c.base} · ${c.servico}`),
              [
                { nome: 'Meta', valores: m.celulas.map((c) => c.meta) },
                { nome: 'Executado', valores: m.celulas.map((c) => c.realizado) },
                { nome: 'Esperado até ontem', valores: m.celulas.map((c) => Math.round(c.esperado)) },
                { nome: 'Projeção', valores: m.celulas.map((c) => c.projecao) },
                { nome: 'Por dia útil para fechar', valores: m.celulas.map((c) => arred(c.necessarioPorDia)) }
              ],
              { metrica: 'notas', dimensao: 'base e serviço', totalCategorias: m.celulas.length * 5 }
            ),
            graficoPainel('acumulado', 'linha', 'Executado × meta acumulada', this.serieMes().rotulos,
              this.serieMes().series.map((s) => ({ nome: s.name, valores: s.values })), { metrica: 'notas', dimensao: 'dia' }),
            graficoPainel('historico', 'barra', 'Meses anteriores', this.serieHistorico().rotulos,
              this.serieHistorico().series.map((s) => ({ nome: s.name, valores: s.values })), { metrica: 'notas', dimensao: 'mês' }),
            ...graficosDaAnalise(this.analiseNoCopiloto())
          ]
        : [],
      datasets: ['execucoes_comerciais', 'equipes'],
      sugestoes: [
        {
          rotulo: 'Onde agir para fechar o mês',
          icone: 'pi pi-flag',
          requer: ['dados'],
          pergunta: 'Quais bases e serviços estão abaixo do ritmo da meta física e quantas notas por dia útil cada um precisa até o fim do mês?'
        },
        {
          rotulo: 'Comparar com meses anteriores',
          icone: 'pi pi-history',
          requer: ['dados'],
          pergunta: 'Como o atingimento da meta física deste mês se compara aos meses anteriores, por base e serviço?'
        }
      ]
    };
  });

  constructor() {
    effect(() => {
      if (this.analise.alvo() && this.data() && !this.loading() && !this.vistaAnalise()) this.analise.fechar();
    });
  }

  ngOnInit(): void {
    this.recorte.carregar(this.destroyRef);
    const lidos = this.filtrosUrl.read();
    this.competencia.set(lidos.mes && /^\d{4}-\d{2}$/.test(lidos.mes) ? lidos.mes : competenciaAtual());
    this.idsBase.set(lidos.idBaseOperacional ?? []);
    this.idsTipo.set(lidos.idTipoServico ?? []);
    this.aplicar();
  }

  protected aplicar(): void {
    const filtros: DashboardMetaFisicaFiltros = {
      competencia: this.competencia(),
      idBaseOperacional: this.idsBase().length ? this.idsBase() : undefined,
      idTipoServico: this.idsTipo().length ? this.idsTipo() : undefined
    };
    this.filtrosUrl.write({
      mes: filtros.competencia === competenciaAtual() ? undefined : filtros.competencia,
      idBaseOperacional: filtros.idBaseOperacional,
      idTipoServico: filtros.idTipoServico
    });
    this.buscar(filtros);
  }

  private buscar(filtros: DashboardMetaFisicaFiltros, silencioso = false): void {
    if (!silencioso) {
      this.loading.set(true);
      this.erro.set(null);
    }
    this.service
      .gerarDashboardMetaFisica(filtros)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.aplicado.set({ ...filtros, competencia: res.competencia });
          this.loading.set(false);
        },
        error: (err) => {
          if (silencioso) return;
          const mensagem = getErrorMessage(err);
          this.erro.set(mensagem);
          this.loading.set(false);
          this.notificacoes.show({ variant: 'error', title: 'Não foi possível carregar o painel', message: mensagem });
        }
      });
  }

  protected readonly chips = computed<CesFilterChip[]>(() => {
    const f = this.aplicado();
    const chips: CesFilterChip[] = [];
    if (f.competencia) chips.push({ key: 'mes', label: `Mês: ${nomeMes(f.competencia)}`, removable: false });
    for (const id of f.idBaseOperacional ?? []) chips.push({ key: `base:${id}`, label: `Base: ${this.recorte.nomeDaBase(id)}` });
    for (const id of f.idTipoServico ?? []) chips.push({ key: `tipo:${id}`, label: `Serviço: ${this.nomeTipo(id)}` });
    return chips;
  });

  protected removerFiltro(chave: string): void {
    const [dimensao, id] = chave.split(':');
    if (dimensao === 'base') this.idsBase.update((ids) => ids.filter((i) => i !== id));
    if (dimensao === 'tipo') this.idsTipo.update((ids) => ids.filter((i) => i !== id));
    this.aplicar();
  }

  protected limpar(): void {
    this.competencia.set(competenciaAtual());
    this.idsBase.set([]);
    this.idsTipo.set([]);
    this.aplicar();
  }

  protected usarMes(mes: MesRapido): void {
    const atual = competenciaAtual();
    this.competencia.set(mes === 'anterior' ? deslocarCompetencia(atual, -1) : mes === 'proximo' ? deslocarCompetencia(atual, 1) : atual);
    this.aplicar();
  }

  protected cadastrar(): void {
    void this.router.navigate(['/execucao/metas-fisicas'], { queryParams: { mes: this.aplicado().competencia ?? null } });
  }

  // ------------------------------------------------------------------ análise

  protected analisar(dimension: string, value: string): void {
    this.analise.abrir(dimension, value);
  }

  protected aprofundar(alvo: AlvoAnalise): void {
    this.analise.aprofundar(alvo, this.vistaAnalise()?.titulo ?? '');
  }

  protected selecionarDia(selecao: CesChartPointSelection): void {
    const dia = this.modelo()?.diario[selecao.index];
    if (dia) this.analisar('dia', dia.data);
  }

  protected selecionarBase(selecao: CesChartPointSelection): void {
    const base = this.modelo()?.bases[selecao.index];
    if (base) this.analisar('base', base.id);
  }

  protected selecionarMes(selecao: CesChartPointSelection): void {
    const mes = this.modelo()?.historico[selecao.index];
    if (mes) this.analisar('mes', mes.competencia);
  }

  protected perguntarVisao(pergunta: string): void {
    this.copiloto.perguntarSobre({ tipo: 'secao', id: 'visaoGerencial', rotulo: 'Visão gerencial' }, pergunta);
  }

  protected perguntarAnalise(vista: VistaAnalise): void {
    if (!vista.copiloto) return;
    this.analiseNoCopiloto.set(vista);
    this.analise.fechar();
    this.copiloto.perguntarSobre(vista.copiloto.foco, vista.copiloto.pergunta);
  }

  // ------------------------------------------------------------------ apoio ao template

  protected tom(a: Apuracao): 'green' | 'amber' | 'red' | 'slate' {
    const t = SITUACAO_FISICA[a.situacao].tom;
    return t === 'success' ? 'green' : t === 'warning' ? 'amber' : t === 'danger' ? 'red' : 'slate';
  }

  protected detalheExecutadas(m: ModeloMetaFisica): string {
    const g = m.geral;
    if (m.estado === 'futuro') return 'O mês ainda não começou';
    const partes = [`${percentual(g.pct)} da meta de ${inteiro(g.meta)}`];
    if (m.estado === 'andamento') partes.push(`${inteiro(g.notasHoje)} hoje`);
    return partes.join(' · ');
  }

  protected detalheRitmo(m: ModeloMetaFisica): string {
    const g = m.geral;
    if (m.estado === 'encerrado') return `Média de ${umaCasa(m.d.diasUteis ? g.realizado / m.d.diasUteis : null)} por dia útil no mês`;
    if (g.necessarioPorDia == null) return 'Sem dias úteis restantes';
    return g.falta > 0
      ? `Precisa de ${umaCasa(g.necessarioPorDia)} por dia útil nos ${m.d.diasUteisRestantes} que faltam`
      : 'A meta do mês já foi batida';
  }

  protected detalheProjecao(m: ModeloMetaFisica): string {
    const g = m.geral;
    if (m.estado === 'encerrado') return g.falta > 0 ? `Faltaram ${notas(g.falta)}` : `${notas(g.realizado - g.meta)} acima da meta`;
    if (g.projecao == null) return 'Sem dia útil encerrado para medir o ritmo';
    return `${percentual(g.pctProjecao)} da meta no ritmo atual`;
  }

  protected abaixoDoRitmo(m: ModeloMetaFisica): CelulaFisica[] {
    return m.celulas.filter((c) => c.situacao === 'ABAIXO' || c.situacao === 'NAO_ATINGIDA');
  }

  protected barrasBase(m: ModeloMetaFisica, base: GrupoFisico): { data: string; altura: number; vazio: boolean; rotulo: string; util: boolean }[] {
    const chaves = new Set(base.celulas.map((c) => c.chave));
    const porDia = new Map<string, number>();
    for (const p of m.d.producao) {
      if (chaves.has(`${p.idBaseOperacional}|${p.idTipoServico}`)) porDia.set(p.data, (porDia.get(p.data) ?? 0) + p.notas);
    }
    const metaDia = m.d.diasUteis ? base.meta / m.d.diasUteis : 0;
    const maximo = Math.max(1, metaDia, ...porDia.values());
    return m.d.calendario.map((c) => {
      const n = porDia.get(c.data) ?? 0;
      return {
        data: c.data,
        altura: (n / maximo) * 100,
        vazio: n === 0,
        util: c.util,
        rotulo: `${diaMes(c.data)}: ${notas(n)}${c.util ? ` (meta do dia ${umaCasa(metaDia)})` : ' (sem meta)'}`
      };
    });
  }

  protected linhaMetaDia(m: ModeloMetaFisica, base: GrupoFisico): number {
    const chaves = new Set(base.celulas.map((c) => c.chave));
    const valores = m.d.producao.filter((p) => chaves.has(`${p.idBaseOperacional}|${p.idTipoServico}`));
    const porDia = new Map<string, number>();
    for (const p of valores) porDia.set(p.data, (porDia.get(p.data) ?? 0) + p.notas);
    const metaDia = m.d.diasUteis ? base.meta / m.d.diasUteis : 0;
    const maximo = Math.max(1, metaDia, ...porDia.values());
    return (metaDia / maximo) * 100;
  }

  protected rotuloCelula(c: CelulaFisica): string {
    return `${c.base}, ${c.servico}: ${inteiro(c.realizado)} de ${notas(c.meta)}, ${percentual(c.pct)}. ${SITUACAO_FISICA[c.situacao].rotulo}. Analisar.`;
  }

  private nomeTipo(id: string): string {
    return this.data()?.tipos.find((t) => t.id === id)?.descricao ?? 'selecionado';
  }

  private resumoTipos(ids: readonly string[] | undefined): string | null {
    if (!ids?.length) return null;
    return ids.length > 2 ? `${ids.length} serviços` : ids.map((id) => this.nomeTipo(id)).join(' e ');
  }
}

function arred(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

/** Percentual (36,4) como fração para o eixo em % do gráfico (0,364). */
function fracao(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 1000;
}
