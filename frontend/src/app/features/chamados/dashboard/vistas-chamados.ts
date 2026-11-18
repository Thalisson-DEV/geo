import { Observable, of } from 'rxjs';
import { GeoDataTableColumn } from '@geo/ui';

import { ChamadoFiltros, ChamadoPrioridade, ChamadoStatus } from '../../../core/models/chamado.models';
import { DashboardChamadosFilter, DashboardChamadosResponse } from '../../../core/models/chamado-dashboard.models';
import {
  AlvoAnalise,
  DetalheRegistro,
  GraficoAnalise,
  KpiAnalise,
  LinkAnalise,
  OrigemAnalise,
  VistaAnalise,
  VizinhoAnalise
} from '../../../shared/components/dashboard/dashboard-analise.models';
import {
  DIMENSOES,
  Dimensao,
  FAIXAS_IDADE,
  FilaAgora,
  LinhaChamado,
  MOTIVOS,
  MotivoAcao,
  ORDEM_MOTIVOS,
  PRIORIDADES,
  contarMotivos,
  contarPor,
  duracao,
  filtroFila,
  graficoFluxo,
  graficoIdade,
  graficoStatus,
  intervaloDoBalde,
  inteiro,
  naFaixa,
  noRecorte,
  parametrosFila,
  pct,
  pedeAcao,
  plural,
  prazoRelativo,
  ranking,
  rotuloPrioridade,
  rotuloStatus,
  situacaoSla,
  temFiltroMultiplo,
  variacaoTexto
} from './analise-chamados';

/**
 * Análises detalhadas (drill-down) do Dashboard de Chamados. Cada elemento clicável do painel abre
 * uma `VistaAnalise`: indicadores do recorte, gráficos que aprofundam e os chamados que compõem o
 * número (da fila, com o mesmo recorte), cada um com link para abrir o chamado.
 *
 * Alvos (`?drill=`): `kpi:<volume|resolvidos|backlog|sla|tempo>`, `motivo:<MotivoAcao>`,
 * `topico|equipe|atendente:<id>`, `status:<STATUS>`, `prioridade:<PRIORIDADE>`, `periodo:<chave>`,
 * `idade:<faixa>`, `solicitante:<id>`.
 */

export interface ContextoVistas {
  readonly d: DashboardChamadosResponse;
  readonly fila: FilaAgora | null;
  readonly recorte: DashboardChamadosFilter;
  /** Busca na fila de chamados (até `TAMANHO_ORIGEM` registros). */
  readonly carregar: (filtro: ChamadoFiltros) => Observable<{ linhas: LinhaChamado[]; total: number }>;
}

export const TAMANHO_ORIGEM = 200;

const ir = (dimension: string, value: string): AlvoAnalise => ({ dimension, value });

export const COLUNAS_CHAMADO: GeoDataTableColumn<LinhaChamado>[] = [
  { key: 'protocolo', header: 'Protocolo', priority: 1 },
  { key: 'assunto', header: 'Assunto', priority: 1 },
  { key: 'topico', header: 'Tópico', priority: 2 },
  { key: 'equipe', header: 'Equipe', priority: 2 },
  { key: 'responsavel', header: 'Responsável', priority: 2 },
  { key: 'prioridade', header: 'Prioridade', type: 'custom', priority: 2, value: (l) => PRIORIDADES.indexOf(l.prioridade), display: (l) => rotuloPrioridade(l.prioridade) },
  { key: 'status', header: 'Status', type: 'custom', priority: 1, value: (l) => l.status, display: (l) => rotuloStatus(l.status) },
  { key: 'abertura', header: 'Abertura', type: 'date', priority: 3 },
  { key: 'sla', header: 'SLA', type: 'custom', priority: 1, value: (l) => l.horasParaPrazo, display: (l) => (l.aberto ? `${situacaoSla(l).texto} · ${prazoRelativo(l)}` : situacaoSla(l).texto) }
];

const dataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function detalheChamado(l: LinhaChamado): DetalheRegistro {
  return {
    titulo: `${l.protocolo} · ${l.assunto}`,
    subtitulo: `${rotuloStatus(l.status)} · prioridade ${rotuloPrioridade(l.prioridade).toLowerCase()}`,
    campos: [
      { rotulo: 'Tópico', valor: l.topico, icone: 'pi pi-tags' },
      { rotulo: 'Equipe', valor: l.equipe, icone: 'pi pi-users' },
      { rotulo: 'Responsável', valor: l.responsavel, icone: 'pi pi-user' },
      { rotulo: 'Abertura', valor: dataHora(l.abertura), icone: 'pi pi-calendar' },
      { rotulo: 'Prazo de resolução', valor: `${dataHora(l.prazo)}${l.aberto ? ` (${prazoRelativo(l)})` : ''}`, icone: 'pi pi-clock' },
      { rotulo: 'SLA', valor: situacaoSla(l).texto, icone: situacaoSla(l).icone },
      { rotulo: 'Última interação', valor: `${dataHora(l.ultimaInteracao)}${l.aberto && l.diasParado ? ` (há ${plural(l.diasParado, 'dia', 'dias')})` : ''}`, icone: 'pi pi-comments' }
    ],
    listas: l.motivos.length ? [{ rotulo: 'Pede ação porque', itens: l.motivos.map((m) => MOTIVOS[m].rotulo) }] : undefined,
    links: [{ rotulo: 'Abrir o chamado', icone: 'pi pi-ticket', rota: ['/chamados/fila', l.id] }]
  };
}

const verNaFila = (queryParams: Record<string, string>): LinkAnalise => ({ rotulo: 'Ver na fila', icone: 'pi pi-list', rota: '/chamados/fila', queryParams });

/** Chamados do período com o recorte do painel e o filtro do elemento analisado. */
function origemDoPeriodo(
  ctx: ContextoVistas,
  opcoes: { id?: string; titulo: string; aba: string; filtro: ChamadoFiltros; fila: Record<string, string>; arquivo: string; vazio?: string }
): OrigemAnalise<LinhaChamado> {
  const filtro = filtroFila(ctx.recorte, { ...opcoes.filtro, page: 0, size: TAMANHO_ORIGEM, sort: 'dataAbertura,desc' });
  const multiplo = temFiltroMultiplo(ctx.recorte);
  return {
    id: opcoes.id,
    chave: JSON.stringify(filtro),
    titulo: opcoes.titulo,
    rotuloAba: opcoes.aba,
    descricao: `Pela data de abertura, do mais recente ao mais antigo.${multiplo ? ' Os filtros do painel com mais de um valor são aplicados sobre os registros lidos.' : ''}`,
    icone: 'pi pi-ticket',
    colunas: COLUNAS_CHAMADO,
    carregar: () => ctx.carregar(filtro),
    chaveLinha: (l) => l.id,
    rotuloLinha: (l) => `Chamado ${l.protocolo}`,
    filtroInicial: multiplo ? { chave: 'recorte', rotulo: 'Filtros do painel', aceita: (l: LinhaChamado) => noRecorte(l, ctx.recorte) } : undefined,
    detalhar: (l) => detalheChamado(l),
    verTudo: verNaFila(parametrosFila(ctx.recorte, opcoes.fila)),
    nomeArquivo: opcoes.arquivo,
    vazio: opcoes.vazio ?? 'Nenhum chamado neste recorte'
  };
}

/** Abertos agora (já lidos pelo painel) que atendem a um critério. */
function origemAbertos(
  linhas: readonly LinhaChamado[],
  opcoes: { id?: string; titulo: string; aba?: string; descricao?: string; arquivo: string; fila?: LinkAnalise; vazio?: string }
): OrigemAnalise<LinhaChamado> {
  return {
    id: opcoes.id,
    chave: `abertos:${opcoes.arquivo}:${linhas.length}:${linhas[0]?.id ?? ''}`,
    titulo: opcoes.titulo,
    rotuloAba: opcoes.aba ?? 'Chamados',
    descricao: opcoes.descricao ?? 'Em aberto agora, do que pede ação primeiro ao mais tranquilo.',
    icone: 'pi pi-inbox',
    colunas: COLUNAS_CHAMADO,
    carregar: () => of({ linhas: [...linhas], total: linhas.length }),
    chaveLinha: (l) => l.id,
    rotuloLinha: (l) => `Chamado ${l.protocolo}`,
    detalhar: (l) => detalheChamado(l),
    verTudo: opcoes.fila,
    nomeArquivo: opcoes.arquivo,
    vazio: opcoes.vazio ?? 'Nenhum chamado em aberto neste recorte'
  };
}

/** Abertos ordenados: pede ação primeiro, depois o prazo mais curto. */
function ordenarAbertos(linhas: readonly LinhaChamado[]): LinhaChamado[] {
  const acao = pedeAcao(linhas);
  const ids = new Set(acao.map((l) => l.id));
  return [...acao, ...linhas.filter((l) => !ids.has(l.id)).sort((a, b) => a.horasParaPrazo - b.horasParaPrazo)];
}

function vizinhos<T>(lista: readonly T[], indice: number, alvo: (t: T) => AlvoAnalise, rotulo: (t: T) => string): { anterior?: VizinhoAnalise; proximo?: VizinhoAnalise } {
  const a = lista[indice - 1];
  const p = lista[indice + 1];
  return {
    anterior: a !== undefined ? { alvo: alvo(a), rotulo: rotulo(a) } : undefined,
    proximo: p !== undefined ? { alvo: alvo(p), rotulo: rotulo(p) } : undefined
  };
}

function graficoMotivos(linhas: readonly LinhaChamado[], titulo: string): GraficoAnalise | null {
  const c = contarMotivos(linhas);
  const chaves = ORDEM_MOTIVOS.filter((m) => c[m] > 0);
  if (!chaves.length) return null;
  return {
    id: 'motivos', titulo, descricao: 'Um chamado pode ter mais de um motivo. Clique para ver os chamados.',
    tipo: 'bar-horizontal', rotulos: chaves.map((m) => MOTIVOS[m].curto), series: [{ name: 'Chamados', values: chaves.map((m) => c[m]) }],
    formato: 'integer', aoSelecionar: (i) => (chaves[i] ? { tipo: 'navegar', alvo: ir('motivo', chaves[i]) } : null), rotuloSelecao: 'Ver os chamados'
  };
}

function graficoAbertosPorEquipe(linhas: readonly LinhaChamado[]): GraficoAnalise | null {
  const g = contarPor(linhas, (l) => l.equipeId, (l) => l.equipe);
  if (!g.chaves.length) return null;
  return {
    id: 'abertos-equipe', titulo: 'Com qual equipe estão', descricao: 'Clique numa equipe para analisá-la.', tipo: 'bar-horizontal',
    rotulos: g.rotulos, series: g.series, formato: 'integer', altura: Math.max(200, g.chaves.length * 32),
    aoSelecionar: (i) => (g.chaves[i] ? { tipo: 'navegar', alvo: ir('equipe', g.chaves[i]) } : null), rotuloSelecao: 'Analisar a equipe'
  };
}

function graficoFluxoAnalise(d: DashboardChamadosResponse, titulo = 'Abertura e resolução no período'): GraficoAnalise {
  const g = graficoFluxo(d);
  return {
    id: 'fluxo', titulo, descricao: 'Chamados abertos em cada período e quantos deles já foram resolvidos. Clique para analisar o período.',
    tipo: 'line', rotulos: g.rotulos, series: g.series, formato: 'integer', inteiro: true,
    aoSelecionar: (i) => (g.chaves[i] ? { tipo: 'navegar', alvo: ir('periodo', g.chaves[i]) } : null), rotuloSelecao: 'Analisar o período'
  };
}

const kpiFila = (fila: FilaAgora | null, d: DashboardChamadosResponse): KpiAnalise => ({
  rotulo: 'Em aberto agora', valor: inteiro(fila?.linhas.length ?? d.totalPendentes), icone: 'pi pi-inbox'
});

// ── Vistas ─────────────────────────────────────────────────────────────────────────────────────

export function vistaChamados(alvo: AlvoAnalise | null, ctx: ContextoVistas): VistaAnalise | null {
  if (!alvo) return null;
  const chave = `${alvo.dimension}:${alvo.value}`;
  switch (alvo.dimension) {
    case 'kpi': return vistaKpi(alvo.value, chave, ctx);
    case 'motivo': return vistaMotivo(alvo.value as MotivoAcao, chave, ctx);
    case 'topico':
    case 'equipe':
    case 'atendente': return vistaDimensao(alvo.dimension, alvo.value, chave, ctx);
    case 'status': return vistaStatus(alvo.value as ChamadoStatus, chave, ctx);
    case 'prioridade': return vistaPrioridade(alvo.value as ChamadoPrioridade, chave, ctx);
    case 'periodo': return vistaPeriodo(alvo.value, chave, ctx);
    case 'idade': return vistaIdade(alvo.value, chave, ctx);
    case 'solicitante': return vistaSolicitante(alvo.value, chave, ctx);
    default: return null;
  }
}

function vistaKpi(valor: string, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const { d, fila } = ctx;
  const pergunta = (p: string) => ({ foco: { tipo: 'metrica' as const, id: valor, rotulo: chave }, pergunta: p });
  switch (valor) {
    case 'volume': {
      const st = graficoStatus(d);
      return {
        chave, eyebrow: 'Indicador', titulo: 'Chamados abertos no período', icone: 'pi pi-ticket',
        descricao: 'Todos os chamados com data de abertura no período, com os filtros do painel.',
        kpis: [
          { rotulo: 'Chamados', valor: inteiro(d.totalChamados), detalhe: variacaoTexto(d.indicadores?.['totalChamados']) ?? undefined },
          { rotulo: 'Já resolvidos', valor: inteiro(d.totalResolvidos + d.totalFechados), detalhe: pct(d.taxaResolucao), tom: 'success' },
          { rotulo: 'Seguem em aberto', valor: inteiro(d.totalAbertos + d.totalEmAtendimento + d.totalAguardandoSolicitante) },
          { rotulo: 'Cancelados', valor: inteiro(d.totalCancelados) }
        ],
        graficos: [
          graficoFluxoAnalise(d),
          { id: 'status', titulo: 'Como estão hoje', descricao: 'Situação atual dos chamados do período. Clique num status.', tipo: 'bar-horizontal',
            rotulos: st.rotulos, series: st.series, formato: 'integer', aoSelecionar: (i) => (st.chaves[i] ? { tipo: 'navegar', alvo: ir('status', st.chaves[i]) } : null), rotuloSelecao: 'Analisar o status' }
        ],
        origem: origemDoPeriodo(ctx, { titulo: 'Chamados do período', aba: 'Chamados', filtro: {}, fila: {}, arquivo: 'chamados-periodo' }),
        copiloto: pergunta('O que explica o volume de chamados deste período em relação ao anterior? Quais tópicos e equipes puxaram a variação?')
      };
    }
    case 'resolvidos':
      return {
        chave, eyebrow: 'Indicador', titulo: 'Chamados resolvidos', icone: 'pi pi-check-circle',
        descricao: 'Chamados abertos no período que já estão resolvidos ou fechados.',
        kpis: [
          { rotulo: 'Resolvidos ou fechados', valor: inteiro(d.totalResolvidos + d.totalFechados), detalhe: variacaoTexto(d.indicadores?.['chamadosResolvidos']) ?? undefined, tom: 'success' },
          { rotulo: 'Taxa de resolução', valor: pct(d.taxaResolucao), detalhe: `de ${plural(d.totalChamados, 'chamado', 'chamados')}` },
          { rotulo: 'Resolução mediana', valor: duracao(d.totalResolvidos ? d.tempoMedianoResolucaoHoras : null) },
          { rotulo: 'Reabertos', valor: inteiro(d.totalReabertos), detalhe: pct(d.taxaReabertura), tom: d.taxaReabertura > 5 ? 'warning' : 'neutral' }
        ],
        graficos: [graficoFluxoAnalise(d)],
        origem: origemDoPeriodo(ctx, { titulo: 'Resolvidos', aba: 'Resolvidos', filtro: { status: 'RESOLVIDO' }, fila: { status: 'RESOLVIDO' }, arquivo: 'chamados-resolvidos' }),
        origensExtras: [origemDoPeriodo(ctx, { id: 'fechados', titulo: 'Fechados', aba: 'Fechados', filtro: { status: 'FECHADO' }, fila: { status: 'FECHADO' }, arquivo: 'chamados-fechados' })],
        copiloto: pergunta('Como está a capacidade de resolução neste período? Onde a resolução está mais lenta?')
      };
    case 'backlog': {
      const idade = graficoIdade(d);
      const linhas = fila ? ordenarAbertos(fila.linhas) : [];
      return {
        chave, eyebrow: 'Indicador', titulo: 'Fila em aberto', icone: 'pi pi-inbox',
        descricao: 'Chamados abertos, em atendimento ou aguardando o solicitante, de qualquer data de abertura.',
        kpis: [
          kpiFila(fila, d),
          { rotulo: 'Aguardando solicitante', valor: inteiro(fila ? fila.linhas.filter((l) => l.status === 'AGUARDANDO_SOLICITANTE').length : d.totalAguardandoSolicitante), detalhe: 'SLA pausado quando configurado' },
          { rotulo: 'Sem responsável', valor: inteiro(fila ? contarMotivos(fila.linhas)['sem-responsavel'] : d.qualidadeDados?.chamadosSemResponsavel), tom: 'warning' },
          { rotulo: 'Variação da fila', valor: variacaoTexto(d.indicadores?.['backlogTotal'], '') ?? '—', detalhe: 'contra o fim do período anterior' }
        ],
        graficos: [
          { id: 'idade', titulo: 'Há quanto tempo esperam', descricao: 'Fila por tempo desde a abertura e prioridade. Clique numa faixa.', tipo: 'bar-stacked',
            rotulos: idade.rotulos, series: idade.series, formato: 'integer', aoSelecionar: (i) => (idade.chaves[i] ? { tipo: 'navegar', alvo: ir('idade', idade.chaves[i]) } : null), rotuloSelecao: 'Analisar a faixa' },
          ...(fila ? [graficoMotivos(fila.linhas, 'Por que pedem ação'), graficoAbertosPorEquipe(fila.linhas)].filter((g): g is GraficoAnalise => !!g) : [])
        ],
        origem: fila ? origemAbertos(linhas, { titulo: 'Chamados em aberto', arquivo: 'chamados-em-aberto' }) : undefined,
        copiloto: pergunta('Como está a fila de chamados em aberto? Onde ela está acumulando e o que destravar primeiro?')
      };
    }
    case 'sla': {
      const equipes = ranking(d, 'equipe').filter((e) => e.resolvidos > 0).sort((a, b) => a.sla - b.sla);
      const fluxo = graficoFluxo(d);
      return {
        chave, eyebrow: 'Indicador', titulo: 'SLA de resolução', icone: 'pi pi-stopwatch',
        descricao: 'Chamados do período resolvidos dentro do prazo, contando os ainda abertos que já venceram.',
        kpis: [
          { rotulo: 'No prazo', valor: pct(d.taxaSlaResolucaoPercentual), detalhe: `${inteiro(d.totalResolucaoNoPrazo)} de ${inteiro(d.totalResolucaoNoPrazo + d.totalResolucaoVencida)}`, tom: 'success' },
          { rotulo: 'Fora do prazo', valor: inteiro(d.totalResolucaoVencida), tom: d.totalResolucaoVencida ? 'danger' : 'neutral' },
          { rotulo: '1ª resposta no prazo', valor: pct(d.taxaSlaPrimeiraRespostaPercentual), detalhe: `${inteiro(d.totalPrimeiraRespostaVencida)} fora do prazo` },
          { rotulo: 'Contra o anterior', valor: variacaoTexto(d.indicadores?.['taxaSlaResolucao'], '') ?? '—' }
        ],
        graficos: [
          { id: 'sla-equipe', titulo: 'SLA por equipe', descricao: 'Da pior para a melhor. Clique numa equipe.', tipo: 'bar-horizontal',
            rotulos: equipes.map((e) => e.nome), series: [{ name: 'Resolvidos no prazo', values: equipes.map((e) => e.sla / 100) }], formato: 'percent',
            altura: Math.max(200, equipes.length * 32), aoSelecionar: (i) => (equipes[i] ? { tipo: 'navegar', alvo: ir('equipe', equipes[i].chave) } : null), rotuloSelecao: 'Analisar a equipe' },
          { id: 'vencidos', titulo: 'Estouros por período de abertura', descricao: 'Chamados com SLA estourado. Clique num período.', tipo: 'bar',
            rotulos: fluxo.rotulos, series: [fluxo.series[2]], formato: 'integer',
            aoSelecionar: (i) => (fluxo.chaves[i] ? { tipo: 'navegar', alvo: ir('periodo', fluxo.chaves[i]) } : null), rotuloSelecao: 'Analisar o período' }
        ],
        origem: origemDoPeriodo(ctx, { titulo: 'Com SLA estourado', aba: 'SLA estourado', filtro: { slaResolucaoVencido: true }, fila: { resolucao: 'true' }, arquivo: 'chamados-sla-estourado' }),
        origensExtras: [origemDoPeriodo(ctx, { id: 'resposta', titulo: '1ª resposta vencida', aba: '1ª resposta vencida', filtro: { slaPrimeiraRespostaVencido: true }, fila: { primeiraResposta: 'true' }, arquivo: 'chamados-primeira-resposta-vencida' })],
        copiloto: pergunta('O que explica o cumprimento de SLA deste recorte em relação ao período anterior? Detalhe por tópico e equipe.')
      };
    }
    case 'tempo': {
      const topicos = ranking(d, 'topico').filter((t) => t.resolvidos > 0).sort((a, b) => b.mediana - a.mediana).slice(0, 10);
      const equipes = ranking(d, 'equipe').filter((t) => t.resolvidos > 0).sort((a, b) => b.mediana - a.mediana).slice(0, 10);
      return {
        chave, eyebrow: 'Indicador', titulo: 'Tempo de atendimento', icone: 'pi pi-clock',
        descricao: 'Tempo útil até a resolução (sem as pausas de SLA) e até a 1ª resposta, dos chamados do período.',
        kpis: [
          { rotulo: 'Resolução (mediana)', valor: duracao(d.totalResolvidos ? d.tempoMedianoResolucaoHoras : null), detalhe: 'metade resolvida em até' },
          { rotulo: 'Resolução (9 em 10)', valor: duracao(d.totalResolvidos ? d.tempoP90ResolucaoHoras : null), detalhe: 'P90' },
          { rotulo: '1ª resposta (mediana)', valor: duracao(d.tempoMedianoPrimeiraRespostaHoras || null), detalhe: `P90 ${duracao(d.tempoP90PrimeiraRespostaHoras || null)}` },
          { rotulo: 'Reaberturas', valor: pct(d.taxaReabertura), detalhe: plural(d.totalReabertos, 'chamado reaberto', 'chamados reabertos'), tom: d.taxaReabertura > 5 ? 'warning' : 'neutral' }
        ],
        graficos: [
          { id: 'tempo-topico', titulo: 'Resolução mediana por tópico', descricao: 'Os mais demorados primeiro. Clique num tópico.', tipo: 'bar-horizontal',
            rotulos: topicos.map((t) => t.nome), series: [{ name: 'Horas (mediana)', values: topicos.map((t) => t.mediana) }], formato: 'number',
            altura: Math.max(200, topicos.length * 32), aoSelecionar: (i) => (topicos[i] ? { tipo: 'navegar', alvo: ir('topico', topicos[i].chave) } : null), rotuloSelecao: 'Analisar o tópico' },
          { id: 'tempo-equipe', titulo: 'Resolução mediana por equipe', descricao: 'Clique numa equipe.', tipo: 'bar-horizontal',
            rotulos: equipes.map((t) => t.nome), series: [{ name: 'Horas (mediana)', values: equipes.map((t) => t.mediana) }], formato: 'number',
            altura: Math.max(200, equipes.length * 32), aoSelecionar: (i) => (equipes[i] ? { tipo: 'navegar', alvo: ir('equipe', equipes[i].chave) } : null), rotuloSelecao: 'Analisar a equipe' }
        ],
        origem: origemDoPeriodo(ctx, { titulo: 'Resolvidos', aba: 'Resolvidos', filtro: { status: 'RESOLVIDO' }, fila: { status: 'RESOLVIDO' }, arquivo: 'chamados-resolvidos' }),
        copiloto: pergunta('Quais tópicos e equipes estão demorando mais para resolver e por quê?')
      };
    }
    default:
      return null;
  }
}

function vistaMotivo(motivo: MotivoAcao, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const def = MOTIVOS[motivo];
  if (!def || !ctx.fila) return null;
  const linhas = pedeAcao(ctx.fila.linhas.filter((l) => l.motivos.includes(motivo)));
  const criticos = linhas.filter((l) => l.prioridade === 'CRITICA' || l.prioridade === 'ALTA').length;
  const prio = contarPor(linhas, (l) => l.prioridade, (l) => rotuloPrioridade(l.prioridade));
  const fila: Record<string, string> | null = motivo === 'sla-vencido' ? { resolucao: 'true' } : motivo === 'resposta-vencida' ? { primeiraResposta: 'true' } : null;
  const indice = ORDEM_MOTIVOS.indexOf(motivo);
  return {
    chave, eyebrow: 'Pede ação', titulo: def.rotulo, icone: def.icone,
    descricao: 'Chamados em aberto agora, de qualquer data de abertura, com os filtros do painel.',
    ...vizinhos(ORDEM_MOTIVOS, indice, (m) => ir('motivo', m), (m) => MOTIVOS[m].rotulo),
    kpis: [
      { rotulo: 'Chamados', valor: inteiro(linhas.length), tom: def.tom, icone: def.icone },
      { rotulo: 'Alta ou crítica', valor: inteiro(criticos), tom: criticos ? 'danger' : 'neutral' },
      { rotulo: 'Sem responsável', valor: inteiro(linhas.filter((l) => !l.responsavelId).length) },
      { rotulo: 'Parados (mediana)', valor: plural(mediana(linhas.map((l) => l.diasParado)), 'dia', 'dias') }
    ],
    graficos: [
      graficoAbertosPorEquipe(linhas),
      prio.chaves.length ? { id: 'prioridade', titulo: 'Por prioridade', tipo: 'bar' as const, rotulos: prio.rotulos, series: prio.series, formato: 'integer' as const } : null
    ].filter((g): g is GraficoAnalise => !!g),
    origem: origemAbertos(linhas, {
      titulo: def.rotulo, arquivo: `chamados-${motivo}`,
      fila: fila ? verNaFila(parametrosFila(ctx.recorte, fila, false)) : undefined
    }),
    copiloto: { foco: { tipo: 'tabela', id: `motivo.${motivo}`, rotulo: def.rotulo }, pergunta: `Destes chamados (${def.rotulo.toLowerCase()}), quais atacar primeiro e quem cobrar em cada um?` }
  };
}

function vistaDimensao(dim: Dimensao, id: string, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const { d, fila } = ctx;
  const linhas = ranking(d, dim);
  const indice = linhas.findIndex((l) => l.chave === id);
  const item = linhas[indice];
  if (!item) return null;
  const def = DIMENSOES[dim];
  const filtro: ChamadoFiltros = dim === 'topico' ? { topicoId: id } : dim === 'equipe' ? { equipeId: id } : { usuarioResponsavelId: id };
  const paramFila: Record<string, string> = dim === 'topico' ? { topico: id } : dim === 'equipe' ? { equipe: id } : { responsavel: id };
  const daDim = (l: LinhaChamado) => (dim === 'topico' ? l.topicoId : dim === 'equipe' ? l.equipeId : l.responsavelId) === id;
  const abertos = fila ? ordenarAbertos(fila.linhas.filter(daDim)) : null;
  const geralSla = d.taxaSlaResolucaoPercentual;
  return {
    chave, eyebrow: def.singular, titulo: item.nome, descricao: `${item.detalhe ? `${item.detalhe} · ` : ''}chamados abertos no período, com os filtros do painel.`, icone: def.icone,
    ...vizinhos(linhas, indice, (l) => ir(dim, l.chave), (l) => l.nome),
    kpis: [
      { rotulo: 'Chamados no período', valor: inteiro(item.total), detalhe: `${pct(item.participacao)} do total` },
      { rotulo: 'Resolvidos', valor: inteiro(item.resolvidos), detalhe: pct(item.taxaResolucao), tom: 'success' },
      { rotulo: 'SLA de resolução', valor: item.resolvidos ? pct(item.sla) : '—', detalhe: `geral ${pct(geralSla)}`, tom: item.resolvidos && item.sla < geralSla ? 'warning' : 'neutral' },
      { rotulo: 'Resolução mediana', valor: duracao(item.resolvidos ? item.mediana : null) },
      ...(abertos ? [{ rotulo: 'Em aberto agora', valor: inteiro(abertos.length), detalhe: `${inteiro(pedeAcao(abertos).length)} pedem ação`, icone: 'pi pi-inbox' }] : [])
    ],
    graficos: abertos ? [graficoMotivos(abertos, 'O que pede ação agora')].filter((g): g is GraficoAnalise => !!g) : [],
    origem: origemDoPeriodo(ctx, { titulo: `Chamados do período · ${item.nome}`, aba: 'Do período', filtro, fila: paramFila, arquivo: `chamados-${dim}` }),
    origensExtras: abertos ? [origemAbertos(abertos, { id: 'abertos', titulo: `Em aberto agora · ${item.nome}`, aba: 'Em aberto agora', arquivo: `chamados-${dim}-abertos`, fila: verNaFila(parametrosFila(ctx.recorte, paramFila, false)) })] : undefined,
    copiloto: { foco: { tipo: 'tabela', id: `desempenho.${dim}`, rotulo: item.nome }, pergunta: `Como está o atendimento de ${item.nome} neste recorte? Compare com os demais e diga o que melhorar.` }
  };
}

function vistaStatus(status: ChamadoStatus, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const { d } = ctx;
  const total = d.totalPorStatus?.[status];
  if (total === undefined) return null;
  const st = graficoStatus(d);
  return {
    chave, eyebrow: 'Status', titulo: rotuloStatus(status), icone: 'pi pi-flag',
    descricao: 'Chamados abertos no período que estão hoje neste status.',
    ...vizinhos(st.chaves, st.chaves.indexOf(status), (s) => ir('status', s), rotuloStatus),
    kpis: [
      { rotulo: 'Chamados', valor: inteiro(total), detalhe: d.totalChamados ? `${pct((total / d.totalChamados) * 100)} do período` : undefined },
      { rotulo: 'No período', valor: inteiro(d.totalChamados) }
    ],
    graficos: [],
    origem: origemDoPeriodo(ctx, { titulo: rotuloStatus(status), aba: 'Chamados', filtro: { status }, fila: { status }, arquivo: `chamados-${status.toLowerCase()}` })
  };
}

function vistaPrioridade(p: ChamadoPrioridade, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const { d, fila } = ctx;
  if (!PRIORIDADES.includes(p)) return null;
  const v = d.volumePorPrioridade?.find((x) => x.prioridade === p) ?? { total: 0, anterior: 0, variacaoPercentual: 0, percentual: 0 };
  const abertos = fila ? ordenarAbertos(fila.linhas.filter((l) => l.prioridade === p)) : null;
  return {
    chave, eyebrow: 'Prioridade', titulo: rotuloPrioridade(p), icone: 'pi pi-bolt',
    descricao: 'Chamados abertos no período com esta prioridade.',
    ...vizinhos(PRIORIDADES, PRIORIDADES.indexOf(p), (x) => ir('prioridade', x), rotuloPrioridade),
    kpis: [
      { rotulo: 'No período', valor: inteiro(v.total), detalhe: `${pct(v.percentual)} do volume` },
      { rotulo: 'Período anterior', valor: inteiro(v.anterior), detalhe: v.anterior ? `${v.variacaoPercentual > 0 ? '+' : ''}${pct(v.variacaoPercentual)}` : 'sem base' },
      ...(abertos ? [{ rotulo: 'Em aberto agora', valor: inteiro(abertos.length), detalhe: `${inteiro(pedeAcao(abertos).length)} pedem ação`, icone: 'pi pi-inbox' }] : [])
    ],
    graficos: abertos ? [graficoMotivos(abertos, 'O que pede ação agora')].filter((g): g is GraficoAnalise => !!g) : [],
    origem: origemDoPeriodo(ctx, { titulo: `Prioridade ${rotuloPrioridade(p).toLowerCase()}`, aba: 'Do período', filtro: { prioridade: p }, fila: { prioridade: p }, arquivo: `chamados-prioridade-${p.toLowerCase()}` }),
    origensExtras: abertos ? [origemAbertos(abertos, { id: 'abertos', titulo: 'Em aberto agora', aba: 'Em aberto agora', arquivo: `chamados-prioridade-${p.toLowerCase()}-abertos`, fila: verNaFila(parametrosFila(ctx.recorte, { prioridade: p }, false)) })] : undefined
  };
}

function vistaPeriodo(chaveBalde: string, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const { d } = ctx;
  const serie = d.serieTemporal ?? [];
  const indice = serie.findIndex((s) => s.chave === chaveBalde);
  const item = serie[indice];
  const intervalo = intervaloDoBalde(d, chaveBalde);
  if (!item || !intervalo) return null;
  const recortePeriodo: ContextoVistas = { ...ctx, recorte: { ...ctx.recorte, inicio: intervalo.inicio, fim: intervalo.fim } };
  return {
    chave, eyebrow: d.granularidade === 'DIA' ? 'Dia' : d.granularidade === 'MES' ? 'Mês' : 'Ano', titulo: item.rotulo, icone: 'pi pi-calendar',
    descricao: 'Chamados abertos neste período, com os filtros do painel.',
    ...vizinhos(serie, indice, (s) => ir('periodo', s.chave), (s) => s.rotulo),
    kpis: [
      { rotulo: 'Abertos', valor: inteiro(item.totalAbertos) },
      { rotulo: 'Já resolvidos', valor: inteiro(item.totalResolvidos), detalhe: item.totalAbertos ? pct((item.totalResolvidos / item.totalAbertos) * 100) : undefined, tom: 'success' },
      { rotulo: 'Com SLA estourado', valor: inteiro(item.totalVencidos), tom: item.totalVencidos ? 'danger' : 'neutral' }
    ],
    graficos: [],
    origem: origemDoPeriodo(recortePeriodo, { titulo: `Abertos em ${item.rotulo}`, aba: 'Chamados', filtro: {}, fila: {}, arquivo: `chamados-${chaveBalde}` })
  };
}

function vistaIdade(faixa: string, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const { d, fila } = ctx;
  const faixas = d.backlogPorIdade ?? [];
  const indice = faixas.findIndex((f) => f.faixa === faixa);
  const item = faixas[indice];
  if (!item) return null;
  const referencia = Math.min(Date.now(), Date.parse(d.fim));
  const linhas = fila ? ordenarAbertos(fila.linhas.filter((l) => naFaixa(l, faixa, referencia))) : null;
  const rotulo = item.rotulo || FAIXAS_IDADE[faixa]?.rotulo || faixa;
  return {
    chave, eyebrow: 'Tempo em aberto', titulo: rotulo, icone: 'pi pi-hourglass',
    descricao: 'Chamados em aberto há este tempo desde a abertura, com os filtros do painel.',
    ...vizinhos(faixas, indice, (f) => ir('idade', f.faixa), (f) => f.rotulo || f.faixa),
    kpis: [
      { rotulo: 'Chamados', valor: inteiro(item.total), detalhe: `${pct(item.percentual)} da fila` },
      ...PRIORIDADES.map((p) => ({ rotulo: rotuloPrioridade(p), valor: inteiro(item.porPrioridade?.[p] ?? 0), tom: p === 'CRITICA' && item.porPrioridade?.[p] ? ('danger' as const) : ('neutral' as const) }))
    ],
    graficos: linhas ? [graficoMotivos(linhas, 'O que pede ação'), graficoAbertosPorEquipe(linhas)].filter((g): g is GraficoAnalise => !!g) : [],
    origem: linhas ? origemAbertos(linhas, { titulo: `Em aberto há ${rotulo.toLowerCase()}`, arquivo: `chamados-idade-${indice + 1}` }) : undefined
  };
}

function vistaSolicitante(id: string, chave: string, ctx: ContextoVistas): VistaAnalise | null {
  const lista = ctx.d.rankingSolicitantes ?? [];
  const indice = lista.findIndex((s) => s.id === id);
  const item = lista[indice];
  if (!item) return null;
  return {
    chave, eyebrow: 'Solicitante', titulo: item.nome, icone: 'pi pi-user',
    descricao: 'Chamados abertos por este usuário no período, com os filtros do painel.',
    ...vizinhos(lista, indice, (s) => ir('solicitante', s.id), (s) => s.nome),
    kpis: [
      { rotulo: 'Chamados', valor: inteiro(item.totalChamados), detalhe: `${pct(item.participacaoPercentual)} do período` },
      { rotulo: 'Posição', valor: `${indice + 1}º`, detalhe: 'entre quem mais abre chamados' }
    ],
    graficos: [],
    origem: origemDoPeriodo(ctx, { titulo: `Abertos por ${item.nome}`, aba: 'Chamados', filtro: { usuarioSolicitanteId: id }, fila: { solicitante: id }, arquivo: 'chamados-solicitante' })
  };
}

function mediana(valores: readonly number[]): number {
  if (!valores.length) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}

