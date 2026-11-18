import { Directive, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { ParamMap, Router } from '@angular/router';
import { CesDataTableColumn, CesFilterChip, CesSelectOption } from '@ces/ui';

import { PainelSolicitacoesResponse, SolicitacaoDoPainel } from '../../../../../core/models/painel-solicitacoes.models';
import { VistaAnalise } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { CopilotoDashboardContext, filtroPainel, graficoPainel, metricaPainel, periodoPainel } from '../../../../copiloto/painel';
import { FiltroAlmox, PainelAlmoxBase } from '../painel-almox-base';
import { SITUACOES_FILTRO, aceitaSituacao, filtrarResposta, recortavelSolicitacao, visaoDoProcesso } from './analise-solicitacoes';
import {
  ETAPAS,
  ETAPAS_ABERTAS,
  FAIXAS_CICLO,
  LinhaMaterial,
  LinhaRanking,
  SEM_CHAVE,
  TIPOS_OBRA,
  TIPOS_TECNICOS,
  atrasada,
  contar,
  diaHora,
  diaMes,
  diasDeAtraso,
  diasDoPeriodo,
  distribuicaoDoCiclo,
  filaDeAtencao,
  fluxoDasAbertas,
  idadeDasAbertas,
  idadeDias,
  indicadores,
  inteiro,
  materiais,
  motivosDePendencia,
  percentual,
  plural,
  quantidade,
  ranking,
  recortar,
  rotaDaSolicitacao,
  rotuloEtapa,
  rotuloTipo,
  serieDiaria,
  situacao,
  tempo,
  variacao,
  variacaoSobre
} from './solicitacoes-calculos';
import { vistaPainel } from './solicitacoes-vistas';

type Modo = 'COMERCIAL' | 'TECNICO';

/**
 * Base dos relatórios de solicitações (comercial e técnico): o mesmo motor de cálculo e de análise,
 * com filtros, seções e leituras próprias de cada processo.
 */
@Directive()
export abstract class PainelSolicitacoesBase extends PainelAlmoxBase<PainelSolicitacoesResponse> {
  private readonly router = inject(Router);
  protected abstract readonly modo: Modo;

  protected readonly inteiro = inteiro;
  protected readonly percentual = percentual;
  protected readonly quantidade = quantidade;
  protected readonly tempo = tempo;
  protected readonly variacao = variacao;
  protected readonly plural = plural;
  protected readonly diaHora = diaHora;
  protected readonly rotuloEtapa = rotuloEtapa;
  protected readonly rotuloTipo = rotuloTipo;
  protected readonly etapas = ETAPAS;
  protected readonly Math = Math;
  protected readonly rotulosDe = (l: readonly { rotulo: string }[]) => l.map((x) => x.rotulo);
  protected readonly totaisDe = (l: readonly { total: number }[]) => l.map((x) => x.total);

  // ── Filtros próprios ─────────────────────────────────────────────────────────────────────────
  protected readonly situacoesSel = signal<string[]>([]);
  protected readonly etapasSel = signal<string[]>([]);
  protected readonly tiposSel = signal<string[]>([]);
  protected readonly tiposObraSel = signal<string[]>([]);
  protected readonly proprios = signal({ situacoes: [] as string[], etapas: [] as string[], tipos: [] as string[], tiposObra: [] as string[] });

  protected readonly opcoesSituacao: CesSelectOption<string>[] = SITUACOES_FILTRO.map((s) => ({ label: s.rotulo, value: s.valor }));
  protected readonly opcoesEtapa = computed<CesSelectOption<string>[]>(() =>
    [...ETAPAS_ABERTAS[this.modo], 'CONCLUIDO', 'REJEITADO', 'CANCELADO'].map((e) => ({ label: ETAPAS[e as keyof typeof ETAPAS].rotulo, value: e }))
  );
  protected readonly opcoesTipo: CesSelectOption<string>[] = Object.keys(TIPOS_TECNICOS).map((k) => ({ label: rotuloTipo(k), value: k }));
  protected readonly opcoesTipoObra: CesSelectOption<string>[] = Object.entries(TIPOS_OBRA).map(([value, label]) => ({ label: label!, value }));

  protected readonly chipsProprios = computed<CesFilterChip[]>(() => {
    const f = this.proprios();
    const chip = (key: string, rotulo: string, sel: string[], nome: (v: string) => string): CesFilterChip[] =>
      sel.length ? [{ key, label: `${rotulo}: ${sel.length === 1 ? nome(sel[0]) : `${sel.length} selecionados`}` }] : [];
    return [
      ...chip('situacao', 'Situação', f.situacoes, (v) => SITUACOES_FILTRO.find((s) => s.valor === v)?.rotulo ?? v),
      ...chip('etapa', 'Etapa', f.etapas, (v) => ETAPAS[v as keyof typeof ETAPAS]?.rotulo ?? v),
      ...chip('tipo', 'Tipo', f.tipos, (v) => rotuloTipo(v)),
      ...chip('tipoObra', 'Tipo de obra', f.tiposObra, (v) => TIPOS_OBRA[v] ?? v)
    ];
  });

  // ── Modelo ───────────────────────────────────────────────────────────────────────────────────
  /** Resposta já com o recorte comum e os filtros próprios. */
  protected readonly resposta = computed<PainelSolicitacoesResponse | null>(() => {
    const d = this.dados();
    if (!d) return null;
    const recorte = this.recorte.aceita();
    const f = this.proprios();
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(d.geradoEm));
    const sit = aceitaSituacao(f.situacoes, hoje);
    const etapas = f.etapas.length ? new Set(f.etapas) : null;
    const tipos = f.tipos.length ? new Set(f.tipos) : null;
    const tiposObra = f.tiposObra.length ? new Set(f.tiposObra) : null;
    return filtrarResposta(d, (s) => s.contexto === this.modo && recorte(recortavelSolicitacao(s)) && sit(s) &&
      (!etapas || (!!s.etapa && etapas.has(s.etapa))) && (!tipos || (!!s.tipoTecnico && tipos.has(s.tipoTecnico))) &&
      (!tiposObra || (!!s.tipoObra && tiposObra.has(s.tipoObra))));
  });
  protected readonly r = computed(() => {
    const d = this.resposta();
    return d ? recortar(d, this.modo) : null;
  });
  protected readonly dias = computed(() => {
    const d = this.dados();
    return d ? diasDoPeriodo(d.inicio, d.fim) : 1;
  });
  protected readonly ind = computed(() => indicadores(this.r()?.periodo ?? [], this.dias()));
  protected readonly atrasadas = computed(() => {
    const r = this.r();
    return r ? r.abertas.filter((l) => atrasada(l, r.hoje)) : [];
  });
  protected readonly varVolume = computed(() => variacaoSobre(this.ind().total, this.r()?.anterior?.total ?? null));
  protected readonly varCiclo = computed(() => variacaoSobre(this.ind().cicloMedia, this.r()?.anterior?.cicloMedioHoras ?? null));
  protected readonly varAprovacao = computed(() => variacaoSobre(this.ind().aprovacaoMediana, this.r()?.anterior?.aprovacaoMediaHoras ?? null));

  protected readonly visao = computed(() => {
    const r = this.r();
    return r ? visaoDoProcesso(r, this.modo) : null;
  });
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const a = this.analise.alvo();
    const d = this.dados();
    const r = this.r();
    if (!a || !d || !r) return null;
    return vistaPainel(a, { r, modo: this.modo, inicio: d.inicio, fim: d.fim, recorteTexto: this.recorte.descricaoPeriodo(this.recorte.aplicado() as { de: string; ate: string }) });
  });

  protected readonly serie = computed(() => {
    const d = this.dados();
    const r = this.r();
    if (!d || !r) return null;
    const s = serieDiaria(r.periodo, d.inicio, d.fim);
    return { ...s, series: [{ name: 'Concluídas', values: s.concluidas }, { name: 'Em aberto', values: s.abertas }, { name: 'Recusadas', values: s.recusadas }] };
  });
  protected readonly fluxo = computed(() => {
    const r = this.r();
    return r ? fluxoDasAbertas(r.abertas, this.modo, r.hoje, r.agora) : [];
  });
  protected readonly graficoFluxo = computed(() => ({
    rotulos: this.fluxo().map((e) => e.rotulo),
    series: [{ name: 'No prazo', values: this.fluxo().map((e) => e.total - e.atrasadas) }, { name: 'Atrasadas', values: this.fluxo().map((e) => e.atrasadas) }]
  }));
  protected readonly idade = computed(() => {
    const r = this.r();
    return r ? idadeDasAbertas(r.abertas, r.hoje, r.agora) : [];
  });
  protected readonly graficoIdade = computed(() => ({
    rotulos: this.idade().map((f) => f.rotulo),
    series: [{ name: 'No prazo', values: this.idade().map((f) => f.total - f.atrasadas) }, { name: 'Atrasadas', values: this.idade().map((f) => f.atrasadas) }]
  }));
  protected readonly ciclo = computed(() => ({
    rotulos: FAIXAS_CICLO.map((f) => f.rotulo),
    series: [{ name: 'Concluídas', values: distribuicaoDoCiclo(this.r()?.periodo ?? []) }]
  }));
  protected readonly atencao = computed(() => {
    const r = this.r();
    return r ? filaDeAtencao(r.abertas, r.hoje, r.agora, 50) : [];
  });
  protected readonly equipes = computed<LinhaRanking[]>(() => {
    const r = this.r();
    return r ? ranking(r.periodo, r.backlog, r.hoje, (l) => l.idEquipe, (l) => l.equipe,
      (l) => [l.baseOperacional, l.processo].filter(Boolean).join(' · ') || null, 'Sem equipe') : [];
  });
  protected readonly equipesTop = computed(() => this.equipes().filter((e) => e.chave !== SEM_CHAVE).slice(0, 12));
  protected readonly graficoEquipes = computed(() => ({
    rotulos: this.equipesTop().map((e) => e.rotulo),
    series: [{ name: 'Concluídas', values: this.equipesTop().map((e) => e.concluidas) }, { name: 'Em aberto', values: this.equipesTop().map((e) => e.abertas - e.atrasadas) },
      { name: 'Atrasadas', values: this.equipesTop().map((e) => e.atrasadas) }, { name: 'Recusadas', values: this.equipesTop().map((e) => e.recusadas) }]
  }));
  protected readonly almoxarifados = computed<LinhaRanking[]>(() => {
    const r = this.r();
    return r ? ranking(r.periodo, r.backlog, r.hoje, (l) => l.idAlmoxarifado, (l) => l.almoxarifado) : [];
  });
  protected readonly listaMateriais = computed<LinhaMaterial[]>(() => materiais(this.r()?.materiais ?? [], 'SAIDA'));
  protected readonly materiaisSemCorte = computed(() => {
    const f = this.recorte.aplicado();
    const multi = [f.idBase, f.idProcesso, f.idEquipe, f.idAlmoxarifado].some((l) => (l?.length ?? 0) > 1);
    const p = this.proprios();
    return multi || p.situacoes.length > 0 || p.etapas.length > 0 || p.tipos.length > 0 || p.tiposObra.length > 0;
  });
  protected readonly motivosRejeicao = computed(() =>
    contar((this.r()?.periodo ?? []).filter((l) => situacao(l) === 'recusada').map((l) => l.motivoRejeicao), 'Sem motivo informado').slice(0, 8));
  protected readonly motivosPendencia = computed(() => {
    const r = this.r();
    return r ? motivosDePendencia([...r.periodo, ...r.backlog]).slice(0, 8) : [];
  });

  // ── Colunas ──────────────────────────────────────────────────────────────────────────────────
  protected readonly colRanking: CesDataTableColumn<LinhaRanking>[] = [
    { key: 'rotulo', header: 'Nome', priority: 1 },
    { key: 'detalhe', header: 'Base · processo', priority: 3, value: (l) => l.detalhe ?? '—' },
    { key: 'total', header: 'No período', type: 'integer', priority: 1 },
    { key: 'abertas', header: 'Em aberto', type: 'integer', priority: 1 },
    { key: 'atrasadas', header: 'Atrasadas', type: 'integer', priority: 1 },
    { key: 'recusadas', header: 'Recusadas', type: 'integer', priority: 3 },
    { key: 'taxaConclusao', header: 'Concluídas', type: 'custom', priority: 2, value: (l) => l.taxaConclusao ?? -1, display: (l) => percentual(l.taxaConclusao) },
    { key: 'cicloMediana', header: 'Ciclo mediano', type: 'custom', priority: 2, value: (l) => l.cicloMediana ?? -1, display: (l) => tempo(l.cicloMediana) },
    { key: 'atendimento', header: 'Qtd. atendida', type: 'custom', priority: 3, value: (l) => l.atendimento ?? -1, display: (l) => percentual(l.atendimento) }
  ];
  protected readonly colMateriais: CesDataTableColumn<LinhaMaterial>[] = [
    { key: 'codigo', header: 'Código', priority: 1 },
    { key: 'descricao', header: 'Material', priority: 1 },
    { key: 'solicitacoes', header: 'Pedidos', type: 'integer', priority: 1 },
    { key: 'quantidadeSolicitada', header: 'Pedido', type: 'custom', priority: 2, value: (m) => m.quantidadeSolicitada, display: (m) => `${quantidade(m.quantidadeSolicitada)} ${(m.unidade ?? '').toLowerCase()}` },
    { key: 'quantidadeAtendida', header: 'Atendido', type: 'custom', priority: 2, value: (m) => m.quantidadeAtendida, display: (m) => `${quantidade(m.quantidadeAtendida)} ${(m.unidade ?? '').toLowerCase()}` },
    { key: 'atendimento', header: '% atendido', type: 'custom', priority: 1, value: (m) => m.atendimento ?? -1, display: (m) => percentual(m.atendimento) },
    { key: 'saldo', header: 'Faltou', type: 'custom', priority: 2, value: (m) => m.saldo, display: (m) => (m.saldo ? `${quantidade(m.saldo)} ${(m.unidade ?? '').toLowerCase()}` : '—') }
  ];
  protected readonly colAtencao: CesDataTableColumn<SolicitacaoDoPainel>[] = [
    { key: 'dataSolicitacao', header: 'Aberta em', type: 'custom', priority: 1, value: (l) => l.dataSolicitacao, display: (l) => diaHora(l.dataSolicitacao) },
    { key: 'equipe', header: 'Equipe', priority: 1, value: (l) => l.equipe ?? '—' },
    { key: 'obra', header: 'Obra', priority: 2, value: (l) => (l.numeroObra ? `${l.numeroObra}${l.tipoTecnico ? ' · ' + l.tipoTecnico : ''}` : '—') },
    { key: 'etapa', header: 'Etapa', priority: 1, value: (l) => rotuloEtapa(l.etapa) },
    { key: 'idade', header: 'Idade', type: 'custom', priority: 2, value: (l) => idadeDias(l, this.r()?.agora ?? Date.now()), display: (l) => tempo(idadeDias(l, this.r()?.agora ?? Date.now()) * 24) },
    { key: 'prevista', header: 'Prevista', type: 'custom', priority: 2, value: (l) => l.dataPrevista ?? '', display: (l) => (l.dataPrevista ? diaMes(l.dataPrevista) : '—') },
    { key: 'atraso', header: 'Atraso', type: 'custom', priority: 1, value: (l) => diasDeAtraso(l, this.r()?.hoje ?? ''),
      display: (l) => { const d = diasDeAtraso(l, this.r()?.hoje ?? ''); return d ? plural(d, 'dia', 'dias') : 'No prazo'; } },
    { key: 'pendencia', header: 'Pendência', priority: 3, value: (l) => l.motivosPendencia ?? '—' },
    { key: 'almoxarifado', header: 'Almoxarifado', priority: 3, value: (l) => l.almoxarifado ?? '—' }
  ];
  protected readonly chaveRanking = (l: LinhaRanking) => l.chave;
  protected readonly iconeEtapa = (l: unknown) => { const e = (l as SolicitacaoDoPainel).etapa; return e ? ETAPAS[e].icone : 'pi pi-circle'; };
  protected readonly diasAtraso = (l: unknown) => diasDeAtraso(l as SolicitacaoDoPainel, this.r()?.hoje ?? '');
  protected readonly tomEtapa = (l: unknown): 'danger' | 'warning' | 'info' => (this.diasAtraso(l) ? 'danger' : (l as SolicitacaoDoPainel).possuiPendencia ? 'warning' : 'info');
  protected readonly chaveMaterial = (m: LinhaMaterial) => m.codigo;
  protected readonly chaveSolicitacao = (l: SolicitacaoDoPainel) => l.id;
  protected readonly rotuloSolicitacao = (l: SolicitacaoDoPainel) => `Solicitação de ${diaHora(l.dataSolicitacao)}${l.equipe ? ' · ' + l.equipe : ''}`;

  constructor() {
    super();
    effect(() => {
      const d = this.dados();
      if (!d) return;
      const almox: Array<[string | null, string | null]> = [];
      const equipes: Array<[string | null, string | null]> = [];
      for (const s of d.solicitacoes) {
        almox.push([s.idAlmoxarifado, s.almoxarifado]);
        equipes.push([s.idEquipe, s.equipe]);
      }
      this.recorte.conhecer(almox, equipes);
    });
  }

  protected carregar(f: FiltroAlmox) {
    const unico = (l?: string[]) => (l && l.length === 1 ? l[0] : undefined);
    return this.relatorios.solicitacoes(f.de, f.ate, this.modo, {
      idBaseOperacional: unico(f.idBase), idProcesso: unico(f.idProcesso), idEquipe: unico(f.idEquipe), idAlmoxarifado: unico(f.idAlmoxarifado)
    });
  }

  protected parametrosProprios() {
    const f = this.proprios();
    const j = (l: string[]) => (l.length ? l.join(',') : null);
    return { situacao: j(f.situacoes), etapa: j(f.etapas), tipo: j(f.tipos), tipoObra: j(f.tiposObra) };
  }
  protected lerProprios(q: ParamMap): void {
    const l = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
    this.situacoesSel.set(l('situacao'));
    this.etapasSel.set(l('etapa'));
    this.tiposSel.set(l('tipo'));
    this.tiposObraSel.set(l('tipoObra'));
  }
  protected aplicarProprios(): void {
    this.proprios.set({ situacoes: this.situacoesSel(), etapas: this.etapasSel(), tipos: this.tiposSel(), tiposObra: this.tiposObraSel() });
  }
  protected limparProprios(): void {
    for (const s of [this.situacoesSel, this.etapasSel, this.tiposSel, this.tiposObraSel]) s.set([]);
  }
  protected removerProprio(chave: string): void {
    const mapa: Record<string, WritableSignal<string[]>> = { situacao: this.situacoesSel, etapa: this.etapasSel, tipo: this.tiposSel, tipoObra: this.tiposObraSel };
    mapa[chave]?.set([]);
  }

  // ── Ações ────────────────────────────────────────────────────────────────────────────────────
  protected analisarDia(i: number): void {
    this.selecionar(this.serie()?.dias ?? [], i, 'dia', (d) => d);
  }
  protected analisarEtapa(i: number): void {
    this.selecionar(this.fluxo(), i, 'etapa', (e) => e.etapa);
  }
  protected analisarIdade(i: number): void {
    this.selecionar(this.idade(), i, 'idade', (f) => f.id);
  }
  protected analisarEquipe(i: number): void {
    this.selecionar(this.equipesTop(), i, 'equipe', (e) => e.chave);
  }
  protected analisarRejeicao(i: number): void {
    this.selecionar(this.motivosRejeicao(), i, 'rejeicao', (m) => m.rotulo);
  }
  protected analisarPendencia(i: number): void {
    this.selecionar(this.motivosPendencia(), i, 'pendencia', (m) => m.rotulo);
  }
  protected abrirSolicitacao(l: SolicitacaoDoPainel): void {
    void this.router.navigate(rotaDaSolicitacao(l));
  }

  protected tomAtraso(): 'red' | 'amber' | 'green' {
    const r = this.r();
    if (!r || !this.atrasadas().length) return 'green';
    return this.atrasadas().length / Math.max(1, r.abertas.length) >= 0.25 ? 'red' : 'amber';
  }

  // ── Bússola ───────────────────────────────────────────────────────────────────────────────
  protected contextoBase(id: string, nome: string, descricao: string, rota: string): CopilotoDashboardContext {
    const f = this.recorte.aplicado();
    const p = this.proprios();
    const ind = this.ind();
    const r = this.r();
    return {
      id, nome, modulo: 'Almoxarifado', descricao, rota,
      periodo: periodoPainel(f.de, f.ate),
      filtros: [
        filtroPainel('situacao', 'Situação', p.situacoes.map((v) => SITUACOES_FILTRO.find((s) => s.valor === v)?.rotulo ?? v), p.situacoes),
        filtroPainel('etapa', 'Etapa', p.etapas.map((v) => ETAPAS[v as keyof typeof ETAPAS]?.rotulo ?? v), p.etapas)
      ],
      metricas: r ? [
        metricaPainel('total', 'Solicitações no período', ind.total, 'inteiro', {
          comparacao: r.anterior?.total ? { rotulo: 'vs. período anterior', valorAnterior: r.anterior.total, variacaoPercentual: this.varVolume() ?? undefined } : undefined
        }),
        metricaPainel('abertas', 'Em aberto agora', r.abertas.length, 'inteiro'),
        metricaPainel('atrasadas', 'Atrasadas na data prevista', this.atrasadas().length, 'inteiro'),
        metricaPainel('conclusao', 'Taxa de conclusão', ind.taxaConclusao, 'percentual'),
        metricaPainel('ciclo', 'Ciclo mediano', ind.cicloMediana, 'horas'),
        metricaPainel('aprovacao', 'Aprovação mediana', ind.aprovacaoMediana, 'horas'),
        metricaPainel('atendimento', 'Quantidade atendida', ind.atendimento, 'percentual')
      ] : [],
      graficos: r ? [
        graficoPainel('etapas', 'barra', 'Abertas por etapa', this.fluxo().map((e) => e.rotulo), this.fluxo().map((e) => e.total)),
        graficoPainel('equipes', 'tabela', 'Equipes', this.equipesTop().map((e) => e.rotulo), this.equipesTop().map((e) => e.total), { totalCategorias: this.equipes().length }),
        graficoPainel('materiais', 'tabela', 'Materiais mais pedidos', this.listaMateriais().slice(0, 15).map((m) => `${m.codigo} ${m.descricao}`),
          this.listaMateriais().slice(0, 15).map((m) => m.solicitacoes), { totalCategorias: this.listaMateriais().length })
      ] : [],
      datasets: ['solicitacoes_material', 'itens_solicitacao'],
      sugestoes: [
        { rotulo: 'Onde trava?', icone: 'pi pi-filter', requer: ['dados', 'analise'], pergunta: 'Em que etapa as solicitações deste recorte mais travam e por quê?' },
        { rotulo: 'Quem cobrar?', icone: 'pi pi-users', requer: ['dados', 'analise'], pergunta: 'Quais equipes e almoxarifados mais atrasam e o que cobrar de cada um?' }
      ]
    };
  }
}
