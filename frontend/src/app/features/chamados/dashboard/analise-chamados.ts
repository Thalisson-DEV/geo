import { CesTone } from '@ces/ui';

import { Chamado, ChamadoFiltros, ChamadoPrioridade, ChamadoStatus } from '../../../core/models/chamado.models';
import {
  DashboardChamadosFilter,
  DashboardChamadosResponse,
  IndicadorComparativoChamado
} from '../../../core/models/chamado-dashboard.models';
import { LeituraGerencial, VereditoGerencial } from '../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { toSaoPauloIso } from '../../../shared/utils/dashboard-date.utils';
import { CHAMADO_PRIORIDADE_LABELS, CHAMADO_STATUS_LABELS } from '../chamados-ui';

/**
 * Análise do Dashboard de Chamados em funções puras: o que pede ação na fila, veredito e leituras
 * da visão gerencial, séries dos gráficos e a tradução do recorte para a fila de chamados.
 *
 * Limiares sem invenção: "parado" usa os mesmos 3 dias do backend (estagnados sem interação) e
 * "vence em breve" é a janela de 24 horas antes do prazo de resolução.
 */

export const STATUS_ABERTOS: readonly ChamadoStatus[] = ['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE'];
export const STATUS_ORDEM: readonly ChamadoStatus[] = ['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE', 'RESOLVIDO', 'FECHADO', 'CANCELADO'];
/** Da mais grave para a mais leve. */
export const PRIORIDADES: readonly ChamadoPrioridade[] = ['CRITICA', 'ALTA', 'NORMAL', 'BAIXA'];
export const DIAS_PARADO = 3;
export const HORAS_A_VENCER = 24;
const HORA = 3_600_000;
const DIA = 24 * HORA;

// ── Formatação ─────────────────────────────────────────────────────────────────────────────────

export const inteiro = (n: number | null | undefined): string => (n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
/** Percentual em escala 0–100. */
export const pct = (n: number | null | undefined, casas = 1): string =>
  `${(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`;
export const plural = (n: number, um: string, varios: string): string => `${inteiro(n)} ${n === 1 ? um : varios}`;

/** Duração em horas como leitura humana: "45 min", "6,5 h", "3,2 dias". */
export function duracao(horas: number | null | undefined): string {
  if (horas === null || horas === undefined || !Number.isFinite(horas)) return '—';
  const h = Math.abs(horas);
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

export const rotuloStatus = (s: ChamadoStatus): string => CHAMADO_STATUS_LABELS[s] ?? s;
export const rotuloPrioridade = (p: ChamadoPrioridade): string => CHAMADO_PRIORIDADE_LABELS[p] ?? p;

/** "+12,5% sobre o período anterior"; sem base anterior, `null`. */
export function variacaoTexto(ind: IndicadorComparativoChamado | undefined, sufixo = 'sobre o período anterior'): string | null {
  if (!ind || !ind.anterior) return null;
  const v = ind.variacaoPercentual ?? 0;
  return `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${sufixo}`;
}

// ── Linhas de chamado e o que pede ação ────────────────────────────────────────────────────────

export type MotivoAcao = 'sla-vencido' | 'resposta-vencida' | 'a-vencer' | 'sem-responsavel' | 'parado';

export const MOTIVOS: Record<MotivoAcao, { readonly rotulo: string; readonly curto: string; readonly icone: string; readonly tom: CesTone; readonly peso: number }> = {
  'sla-vencido': { rotulo: 'SLA de resolução estourado', curto: 'SLA estourado', icone: 'pi pi-exclamation-circle', tom: 'danger', peso: 0 },
  'resposta-vencida': { rotulo: 'Sem 1ª resposta no prazo', curto: '1ª resposta vencida', icone: 'pi pi-comment', tom: 'danger', peso: 1 },
  'a-vencer': { rotulo: `Vence nas próximas ${HORAS_A_VENCER} h`, curto: 'Vence em breve', icone: 'pi pi-hourglass', tom: 'warning', peso: 2 },
  'sem-responsavel': { rotulo: 'Sem responsável', curto: 'Sem responsável', icone: 'pi pi-user-minus', tom: 'warning', peso: 3 },
  parado: { rotulo: `Parado há ${DIAS_PARADO} dias ou mais`, curto: 'Parado', icone: 'pi pi-pause-circle', tom: 'warning', peso: 4 }
};
export const ORDEM_MOTIVOS = Object.keys(MOTIVOS) as MotivoAcao[];

/** Chamado já resolvido para a tela: nomes, prazos relativos e motivos de ação. */
export interface LinhaChamado {
  readonly id: string;
  readonly protocolo: string;
  readonly assunto: string;
  readonly topicoId: string | null;
  readonly topico: string;
  readonly equipeId: string | null;
  readonly equipe: string;
  readonly prioridade: ChamadoPrioridade;
  readonly status: ChamadoStatus;
  readonly responsavelId: string | null;
  readonly responsavel: string;
  readonly solicitanteId: string;
  readonly abertura: string;
  readonly prazo: string;
  readonly ultimaInteracao: string;
  readonly aberto: boolean;
  readonly slaVencido: boolean;
  readonly slaPausado: boolean;
  /** Horas até o prazo de resolução (negativo: venceu há). */
  readonly horasParaPrazo: number;
  readonly diasParado: number;
  readonly motivos: readonly MotivoAcao[];
}

export function motivosDoChamado(c: Chamado, agora: number): MotivoAcao[] {
  if (!STATUS_ABERTOS.includes(c.status)) return [];
  const motivos: MotivoAcao[] = [];
  const horas = (Date.parse(c.dataLimiteResolucao) - agora) / HORA;
  if (c.slaResolucaoVencido) motivos.push('sla-vencido');
  if (c.slaPrimeiraRespostaVencido && !c.dataPrimeiraResposta) motivos.push('resposta-vencida');
  if (!c.slaResolucaoVencido && !c.slaPausado && horas >= 0 && horas <= HORAS_A_VENCER) motivos.push('a-vencer');
  if (!c.usuarioResponsavelId) motivos.push('sem-responsavel');
  if ((agora - Date.parse(c.dataUltimaInteracao)) / DIA >= DIAS_PARADO) motivos.push('parado');
  return motivos;
}

export function linhaChamado(c: Chamado, agora: number, nomeUsuario: (id: string) => string): LinhaChamado {
  return {
    id: c.id,
    protocolo: c.protocolo,
    assunto: c.assunto,
    topicoId: c.topico?.id ?? null,
    topico: c.topico?.nome ?? '—',
    equipeId: c.equipeAtendimento?.id ?? null,
    equipe: c.equipeAtendimento?.nome ?? '—',
    prioridade: c.prioridade,
    status: c.status,
    responsavelId: c.usuarioResponsavelId ?? null,
    responsavel: c.usuarioResponsavelId ? nomeUsuario(c.usuarioResponsavelId) : 'Sem responsável',
    solicitanteId: c.usuarioSolicitanteId,
    abertura: c.dataAbertura,
    prazo: c.dataLimiteResolucao,
    ultimaInteracao: c.dataUltimaInteracao,
    aberto: STATUS_ABERTOS.includes(c.status),
    slaVencido: c.slaResolucaoVencido,
    slaPausado: c.slaPausado,
    horasParaPrazo: (Date.parse(c.dataLimiteResolucao) - agora) / HORA,
    diasParado: Math.max(0, Math.floor((agora - Date.parse(c.dataUltimaInteracao)) / DIA)),
    motivos: motivosDoChamado(c, agora)
  };
}

export const motivoPrincipal = (l: LinhaChamado): MotivoAcao | null =>
  l.motivos.length ? [...l.motivos].sort((a, b) => MOTIVOS[a].peso - MOTIVOS[b].peso)[0] : null;

/** Abertos que pedem ação: mais grave primeiro, depois prioridade e prazo mais curto. */
export function pedeAcao(linhas: readonly LinhaChamado[]): LinhaChamado[] {
  const peso = (l: LinhaChamado) => MOTIVOS[motivoPrincipal(l)!].peso;
  return linhas
    .filter((l) => l.motivos.length > 0)
    .sort((a, b) => peso(a) - peso(b) || PRIORIDADES.indexOf(a.prioridade) - PRIORIDADES.indexOf(b.prioridade) || a.horasParaPrazo - b.horasParaPrazo);
}

export function contarMotivos(linhas: readonly LinhaChamado[]): Record<MotivoAcao, number> {
  const contagem = Object.fromEntries(ORDEM_MOTIVOS.map((m) => [m, 0])) as Record<MotivoAcao, number>;
  for (const l of linhas) for (const m of l.motivos) contagem[m]++;
  return contagem;
}

/** "venceu há 2 dias", "vence em 5 h", "pausado". */
export function prazoRelativo(l: Pick<LinhaChamado, 'horasParaPrazo' | 'slaPausado' | 'aberto'>): string {
  if (!l.aberto) return '—';
  if (l.slaPausado) return 'SLA pausado';
  return l.horasParaPrazo < 0 ? `venceu há ${duracao(-l.horasParaPrazo)}` : `vence em ${duracao(l.horasParaPrazo)}`;
}

export function situacaoSla(l: LinhaChamado): { readonly texto: string; readonly tom: CesTone; readonly icone: string } {
  if (l.status === 'CANCELADO') return { texto: 'Cancelado', tom: 'neutral', icone: 'pi pi-times-circle' };
  if (!l.aberto) return l.slaVencido
    ? { texto: 'Concluído fora do prazo', tom: 'danger', icone: 'pi pi-exclamation-circle' }
    : { texto: 'Concluído no prazo', tom: 'success', icone: 'pi pi-check-circle' };
  if (l.slaVencido) return { texto: 'SLA estourado', tom: 'danger', icone: 'pi pi-exclamation-circle' };
  if (l.slaPausado) return { texto: 'SLA pausado', tom: 'neutral', icone: 'pi pi-pause-circle' };
  if (l.horasParaPrazo <= HORAS_A_VENCER) return { texto: 'Vence em breve', tom: 'warning', icone: 'pi pi-hourglass' };
  return { texto: 'No prazo', tom: 'success', icone: 'pi pi-clock' };
}

// ── Recorte ────────────────────────────────────────────────────────────────────────────────────

/** Filtros do painel como ficam no `cesListState` (período em `yyyy-MM-dd`). */
export interface FiltrosAplicados {
  readonly periodo: { readonly from: string | null; readonly to: string | null };
  readonly topico: string[];
  readonly equipe: string[];
  readonly prioridade: string[];
  readonly status: string[];
  readonly sla: boolean | null;
}

/** Período padrão: do dia 1º do mês corrente até hoje. */
export function periodoPadrao(hoje = new Date()): { from: string; to: string } {
  return { from: dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))!, to: dataIso(hoje)! };
}

/** Filtros aplicados → consulta do dashboard (datas no fuso de São Paulo, fim no último instante do dia). */
export function recorteDosFiltros(f: FiltrosAplicados): DashboardChamadosFilter {
  const inicio = dataLocal(f.periodo.from);
  const fim = dataLocal(f.periodo.to);
  return {
    inicio: inicio ? toSaoPauloIso(inicio, false) : null,
    fim: fim ? toSaoPauloIso(fim, true) : null,
    topicoId: [...f.topico],
    equipeId: [...f.equipe],
    prioridade: f.prioridade as ChamadoPrioridade[],
    status: f.status as ChamadoStatus[],
    ...(f.sla === null ? {} : { slaVencido: f.sla })
  };
}

const naLista = <T>(lista: readonly T[] | undefined, valor: T | null): boolean => !lista?.length || (valor !== null && lista.includes(valor));

/** O chamado pertence ao recorte de tópico, equipe, prioridade, status e SLA do painel (sem o período). */
export function noRecorte(l: LinhaChamado, f: DashboardChamadosFilter): boolean {
  return naLista(f.topicoId, l.topicoId) && naLista(f.equipeId, l.equipeId) && naLista(f.prioridade, l.prioridade) &&
    naLista(f.status, l.status) && naLista(f.usuarioResponsavelId, l.responsavelId) &&
    (f.slaVencido === undefined || f.slaVencido === null || l.slaVencido === f.slaVencido);
}

/** Algum filtro do painel tem mais de um valor (a fila só aceita um por filtro). */
export const temFiltroMultiplo = (f: DashboardChamadosFilter): boolean =>
  [f.topicoId, f.equipeId, f.prioridade, f.status, f.usuarioResponsavelId].some((l) => (l?.length ?? 0) > 1);

const unico = <T>(lista: readonly T[] | undefined): T | undefined => (lista?.length === 1 ? lista[0] : undefined);

/** Status abertos que a busca da fila precisa consultar (um pedido por status). */
export function statusAbertosDoRecorte(f: DashboardChamadosFilter): ChamadoStatus[] {
  return f.status?.length ? STATUS_ABERTOS.filter((s) => f.status!.includes(s)) : [...STATUS_ABERTOS];
}

/** Filtros da API da fila com os valores únicos do painel (os múltiplos são aplicados na tela). */
export function filtroFila(f: DashboardChamadosFilter, extra: ChamadoFiltros = {}, comPeriodo = true): ChamadoFiltros {
  return {
    ...(comPeriodo && f.inicio ? { dataAberturaInicio: f.inicio } : {}),
    ...(comPeriodo && f.fim ? { dataAberturaFim: f.fim } : {}),
    ...(unico(f.topicoId) ? { topicoId: unico(f.topicoId) } : {}),
    ...(unico(f.equipeId) ? { equipeId: unico(f.equipeId) } : {}),
    ...(unico(f.prioridade) ? { prioridade: unico(f.prioridade) } : {}),
    ...(unico(f.status) ? { status: unico(f.status) } : {}),
    ...(unico(f.usuarioResponsavelId) ? { usuarioResponsavelId: unico(f.usuarioResponsavelId) } : {}),
    ...(f.slaVencido === true ? { slaResolucaoVencido: true } : f.slaVencido === false ? { slaResolucaoVencido: false } : {}),
    ativo: true,
    ...extra
  };
}

/** Parâmetros da URL da fila (`/chamados/fila`) com o recorte do painel e o elemento clicado. */
export function parametrosFila(f: DashboardChamadosFilter, extra: Record<string, string> = {}, comPeriodo = true): Record<string, string> {
  const params: Record<string, string> = {};
  if (comPeriodo && (f.inicio || f.fim)) params['abertura'] = `${f.inicio?.substring(0, 10) ?? ''}~${f.fim?.substring(0, 10) ?? ''}`;
  if (unico(f.topicoId)) params['topico'] = unico(f.topicoId)!;
  if (unico(f.equipeId)) params['equipe'] = unico(f.equipeId)!;
  if (unico(f.prioridade)) params['prioridade'] = unico(f.prioridade)!;
  if (unico(f.status)) params['status'] = unico(f.status)!;
  if (unico(f.usuarioResponsavelId)) params['responsavel'] = unico(f.usuarioResponsavelId)!;
  if (f.slaVencido === true || f.slaVencido === false) params['resolucao'] = String(f.slaVencido);
  return { ...params, ...extra };
}

/** Intervalo `[inicio, fim]` (ISO) do balde da série temporal. */
export function intervaloDoBalde(d: DashboardChamadosResponse, chave: string): { inicio: string; fim: string } | null {
  const item = d.serieTemporal.find((s) => s.chave === chave);
  if (!item) return null;
  const [ano, mes, dia] = item.data.substring(0, 10).split('-').map(Number);
  const inicio = new Date(ano, mes - 1, dia);
  const fim = d.granularidade === 'ANO' ? new Date(ano + 1, 0, 1) : d.granularidade === 'MES' ? new Date(ano, mes, 1) : new Date(ano, mes - 1, dia + 1);
  fim.setMilliseconds(-1);
  const limiteIni = Date.parse(d.inicio);
  const limiteFim = Date.parse(d.fim);
  return {
    inicio: new Date(Math.max(inicio.getTime(), limiteIni)).toISOString(),
    fim: new Date(Math.min(fim.getTime(), limiteFim)).toISOString()
  };
}

// ── Faixas de idade da fila (mesmas do backend) ───────────────────────────────────────────────

export const FAIXAS_IDADE: Record<string, { readonly min: number; readonly max: number | null; readonly rotulo: string }> = {
  '<24h': { min: 0, max: 0, rotulo: 'Até 24 horas' },
  '1-3d': { min: 1, max: 3, rotulo: '1 a 3 dias' },
  '4-7d': { min: 4, max: 7, rotulo: '4 a 7 dias' },
  '8-15d': { min: 8, max: 15, rotulo: '8 a 15 dias' },
  '>15d': { min: 16, max: null, rotulo: 'Mais de 15 dias' }
};

export function naFaixa(l: LinhaChamado, faixa: string, referencia: number): boolean {
  const def = FAIXAS_IDADE[faixa];
  if (!def) return false;
  const dias = Math.max(0, Math.floor((referencia - Date.parse(l.abertura)) / DIA));
  return dias >= def.min && (def.max === null || dias <= def.max);
}

// ── Gráficos do painel ─────────────────────────────────────────────────────────────────────────

export interface Grafico<K = string> {
  readonly rotulos: string[];
  readonly series: { name: string; values: number[] }[];
  readonly chaves: K[];
}

export function graficoFluxo(d: DashboardChamadosResponse): Grafico {
  const s = d.serieTemporal ?? [];
  return {
    rotulos: s.map((i) => i.rotulo),
    series: [
      { name: 'Abertos', values: s.map((i) => i.totalAbertos) },
      { name: 'Já resolvidos', values: s.map((i) => i.totalResolvidos) },
      { name: 'Com SLA estourado', values: s.map((i) => i.totalVencidos) }
    ],
    chaves: s.map((i) => i.chave)
  };
}

export function graficoStatus(d: DashboardChamadosResponse): Grafico<ChamadoStatus> {
  const chaves = STATUS_ORDEM.filter((s) => (d.totalPorStatus?.[s] ?? 0) > 0);
  return { rotulos: chaves.map(rotuloStatus), series: [{ name: 'Chamados', values: chaves.map((s) => d.totalPorStatus[s]) }], chaves };
}

export function graficoIdade(d: DashboardChamadosResponse): Grafico {
  const faixas = d.backlogPorIdade ?? [];
  return {
    rotulos: faixas.map((f) => f.rotulo || FAIXAS_IDADE[f.faixa]?.rotulo || f.faixa),
    series: PRIORIDADES.map((p) => ({ name: rotuloPrioridade(p), values: faixas.map((f) => f.porPrioridade?.[p] ?? 0) })),
    chaves: faixas.map((f) => f.faixa)
  };
}

export function graficoPrioridade(d: DashboardChamadosResponse): Grafico<ChamadoPrioridade> {
  const itens = PRIORIDADES.map((p) => d.volumePorPrioridade?.find((v) => v.prioridade === p) ?? { prioridade: p, total: 0, anterior: 0 });
  return {
    rotulos: itens.map((i) => rotuloPrioridade(i.prioridade)),
    series: [
      { name: 'Período atual', values: itens.map((i) => i.total) },
      { name: 'Período anterior', values: itens.map((i) => i.anterior) }
    ],
    chaves: itens.map((i) => i.prioridade)
  };
}

export type Dimensao = 'topico' | 'equipe' | 'atendente';

export const DIMENSOES: Record<Dimensao, { readonly rotulo: string; readonly singular: string; readonly icone: string }> = {
  topico: { rotulo: 'Tópicos', singular: 'Tópico', icone: 'pi pi-tags' },
  equipe: { rotulo: 'Equipes', singular: 'Equipe de atendimento', icone: 'pi pi-users' },
  atendente: { rotulo: 'Atendentes', singular: 'Atendente', icone: 'pi pi-user' }
};

/** Uma linha dos rankings de tópico, equipe e atendente. */
export interface LinhaRanking {
  readonly chave: string;
  readonly nome: string;
  readonly detalhe: string;
  readonly total: number;
  readonly resolvidos: number;
  readonly pendentes: number;
  /** Cancelados e demais encerramentos sem solução. */
  readonly outros: number;
  readonly taxaResolucao: number;
  readonly sla: number;
  readonly mediana: number;
  readonly participacao: number;
}

export function ranking(d: DashboardChamadosResponse, dim: Dimensao): LinhaRanking[] {
  const base = (id: string, nome: string, detalhe: string, total: number, resolvidos: number, pendentes: number, sla: number, mediana: number, participacao: number): LinhaRanking => ({
    chave: id, nome, detalhe, total, resolvidos, pendentes, outros: Math.max(0, total - resolvidos - pendentes),
    taxaResolucao: total ? (resolvidos / total) * 100 : 0, sla, mediana, participacao
  });
  const total = d.totalChamados || 0;
  if (dim === 'topico') return (d.desempenhoPorTopico ?? []).map((i) =>
    base(i.id, i.nome || 'Sem tópico', i.codigo ?? '', i.totalChamados, i.resolvidos, i.pendentes, i.taxaSlaCumprido, i.tempoMedianoResolucaoHoras, i.participacaoPercentual));
  if (dim === 'equipe') return (d.desempenhoPorEquipe ?? []).map((i) =>
    base(i.id, i.nome || 'Sem equipe', i.codigo ?? '', i.totalChamados, i.resolvidos, i.pendentes, i.taxaSlaResolucao, i.tempoMedianoResolucaoHoras, i.participacaoPercentual));
  return (d.desempenhoPorAtendente ?? []).map((i) =>
    base(i.id, i.nome || 'Não atribuído', i.equipe || 'Equipe não informada', i.totalChamados, i.resolvidos, i.pendentes, i.taxaSlaResolucao, i.tempoMedianoResolucaoHoras,
      total ? (i.totalChamados / total) * 100 : 0));
}

export const LIMITE_GRAFICO_RANKING = 10;

export function graficoRanking(linhas: readonly LinhaRanking[]): Grafico {
  const top = linhas.slice(0, LIMITE_GRAFICO_RANKING);
  return {
    rotulos: top.map((l) => l.nome),
    series: [
      { name: 'Resolvidos', values: top.map((l) => l.resolvidos) },
      { name: 'Em aberto', values: top.map((l) => l.pendentes) },
      { name: 'Cancelados', values: top.map((l) => l.outros) }
    ],
    chaves: top.map((l) => l.chave)
  };
}

/** Contagem de linhas por um campo (para gráficos dentro das análises). */
export function contarPor<T>(linhas: readonly T[], chave: (l: T) => string | null, rotulo: (l: T) => string, limite = 10): Grafico {
  const mapa = new Map<string, { rotulo: string; total: number }>();
  for (const l of linhas) {
    const k = chave(l);
    if (k === null) continue;
    const atual = mapa.get(k) ?? { rotulo: rotulo(l), total: 0 };
    atual.total++;
    mapa.set(k, atual);
  }
  const ordenadas = [...mapa.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, limite);
  return { rotulos: ordenadas.map(([, v]) => v.rotulo), series: [{ name: 'Chamados', values: ordenadas.map(([, v]) => v.total) }], chaves: ordenadas.map(([k]) => k) };
}

// ── Visão gerencial ────────────────────────────────────────────────────────────────────────────

/** Abertos agora no recorte; `null` quando a fila não pôde ser lida (usa os números do backend). */
export interface FilaAgora {
  readonly linhas: readonly LinhaChamado[];
  readonly truncado: boolean;
}

export interface VisaoChamados {
  readonly veredito: VereditoGerencial;
  readonly leituras: LeituraGerencial[];
}

const alvo = (dimension: string, value: string) => ({ dimension, value });

export function visaoGerencial(d: DashboardChamadosResponse, fila: FilaAgora | null): VisaoChamados {
  const motivos = fila ? contarMotivos(fila.linhas) : null;
  const abertos = fila ? fila.linhas.length : d.totalPendentes;
  const estourados = motivos ? motivos['sla-vencido'] : 0;
  const semResposta = motivos ? motivos['resposta-vencida'] : 0;
  const semResponsavel = motivos ? motivos['sem-responsavel'] : d.qualidadeDados?.chamadosSemResponsavel ?? 0;
  const parados = motivos ? motivos.parado : d.qualidadeDados?.chamadosEstagnadosSemInteracao ?? 0;
  const aVencer = motivos ? motivos['a-vencer'] : 0;
  const varVolume = variacaoTexto(d.indicadores?.['totalChamados'], 'contra o período anterior');
  const avaliadosSla = (d.totalResolucaoNoPrazo ?? 0) + (d.totalResolucaoVencida ?? 0);

  let veredito: VereditoGerencial;
  if (!d.totalChamados && !abertos) {
    veredito = {
      tom: 'neutral',
      rotulo: 'Sem movimento',
      titulo: 'Nenhum chamado neste recorte',
      texto: 'Não há chamados abertos no período nem pendentes na fila. Amplie o período ou retire filtros.'
    };
  } else {
    const graves = estourados + semResposta;
    const atencao = aVencer + semResponsavel + parados;
    const tom: CesTone = graves ? 'danger' : atencao ? 'warning' : 'success';
    const partes = [
      `${plural(d.totalChamados, 'chamado aberto', 'chamados abertos')} no período${varVolume ? ` (${varVolume})` : ''}`,
      d.totalChamados ? `${pct(d.taxaResolucao)} já resolvidos` : null,
      avaliadosSla ? `SLA de resolução cumprido em ${pct(d.taxaSlaResolucaoPercentual)}` : null,
      d.totalResolvidos ? `resolução mediana de ${duracao(d.tempoMedianoResolucaoHoras)}` : null
    ].filter(Boolean);
    const filaTexto = abertos
      ? `${plural(abertos, 'chamado segue', 'chamados seguem')} em aberto agora` +
        `${estourados ? `; ${plural(estourados, 'com SLA estourado', 'com SLA estourado')}` : ''}` +
        `${semResponsavel ? `; ${plural(semResponsavel, 'sem responsável', 'sem responsável')}` : ''}.`
      : 'Nenhum chamado em aberto.';
    const meta = d.indicadores?.['taxaSlaResolucao']?.meta ?? undefined;
    veredito = {
      tom,
      rotulo: tom === 'danger' ? 'Agir agora' : tom === 'warning' ? 'Acompanhar' : 'Sob controle',
      titulo: graves
        ? `${plural(graves, 'chamado fora do prazo', 'chamados fora do prazo')} na fila`
        : atencao ? 'Fila com pontos de atenção' : abertos ? 'Atendimento em dia' : 'Fila zerada',
      texto: `${partes.join(', ')}. ${filaTexto}`,
      progresso: avaliadosSla
        ? {
            valor: d.taxaSlaResolucaoPercentual,
            rotulo: `${pct(d.taxaSlaResolucaoPercentual)} dos chamados avaliados dentro do SLA de resolução`,
            ...(meta !== undefined && meta !== null ? { marcador: meta, rotuloMarcador: `Meta: ${pct(meta)}` } : {})
          }
        : undefined
    };
  }

  const leituras: LeituraGerencial[] = [];
  if (estourados) leituras.push({
    id: 'sla-vencido', tom: 'danger', icone: MOTIVOS['sla-vencido'].icone, titulo: 'SLA de resolução estourado',
    valor: plural(estourados, 'chamado', 'chamados'),
    texto: `Ainda em aberto e já passaram do prazo de solução.${pior(fila!.linhas, 'sla-vencido')}`,
    acao: { rotulo: 'Ver os chamados', alvo: alvo('motivo', 'sla-vencido') }
  });
  if (semResposta) leituras.push({
    id: 'resposta-vencida', tom: 'danger', icone: MOTIVOS['resposta-vencida'].icone, titulo: 'Sem 1ª resposta no prazo',
    valor: plural(semResposta, 'chamado', 'chamados'),
    texto: 'O solicitante ainda não recebeu nenhuma resposta e o prazo da 1ª resposta já venceu.',
    acao: { rotulo: 'Ver os chamados', alvo: alvo('motivo', 'resposta-vencida') }
  });
  if (aVencer) leituras.push({
    id: 'a-vencer', tom: 'warning', icone: MOTIVOS['a-vencer'].icone, titulo: `Vencem nas próximas ${HORAS_A_VENCER} horas`,
    valor: plural(aVencer, 'chamado', 'chamados'),
    texto: 'Ainda dentro do prazo, mas estouram o SLA se não forem resolvidos hoje.',
    acao: { rotulo: 'Ver os chamados', alvo: alvo('motivo', 'a-vencer') }
  });
  if (semResponsavel) {
    const criticos = fila ? fila.linhas.filter((l) => l.motivos.includes('sem-responsavel') && (l.prioridade === 'CRITICA' || l.prioridade === 'ALTA')).length : 0;
    leituras.push({
      id: 'sem-responsavel', tom: criticos ? 'danger' : 'warning', icone: MOTIVOS['sem-responsavel'].icone, titulo: 'Sem responsável',
      valor: plural(semResponsavel, 'chamado', 'chamados'),
      texto: criticos ? `${plural(criticos, 'é', 'são')} de prioridade alta ou crítica. Atribua um atendente.` : 'Ninguém está com o chamado. Atribua um atendente na fila.',
      acao: fila ? { rotulo: 'Ver os chamados', alvo: alvo('motivo', 'sem-responsavel') } : undefined
    });
  }
  if (parados) leituras.push({
    id: 'parado', tom: 'warning', icone: MOTIVOS.parado.icone, titulo: 'Parados sem interação',
    valor: plural(parados, 'chamado', 'chamados'),
    texto: `Em aberto e sem nenhuma interação há ${DIAS_PARADO} dias ou mais.`,
    acao: fila ? { rotulo: 'Ver os chamados', alvo: alvo('motivo', 'parado') } : undefined
  });

  const equipes = ranking(d, 'equipe').filter((e) => e.resolvidos > 0);
  const piorEquipe = [...equipes].sort((a, b) => a.sla - b.sla)[0];
  if (piorEquipe && equipes.length > 1 && piorEquipe.sla < d.taxaSlaResolucaoPercentual) leituras.push({
    id: 'equipe-sla', tom: 'warning', icone: 'pi pi-users', titulo: 'Equipe com o pior SLA', valor: piorEquipe.nome,
    texto: `${pct(piorEquipe.sla)} das resoluções no prazo, contra ${pct(d.taxaSlaResolucaoPercentual)} no geral; ${plural(piorEquipe.pendentes, 'chamado segue', 'chamados seguem')} em aberto.`,
    acao: { rotulo: 'Analisar a equipe', alvo: alvo('equipe', piorEquipe.chave) }
  });

  const reab = d.taxaReabertura ?? 0;
  if (reab > 5 && d.totalReabertos > 0) leituras.push({
    id: 'reabertura', tom: 'warning', icone: 'pi pi-replay', titulo: 'Reaberturas acima de 5%', valor: pct(reab),
    texto: `${plural(d.totalReabertos, 'chamado voltou', 'chamados voltaram')} depois de resolvido: a solução não resolveu de fato.`,
    acao: { rotulo: 'Analisar os tempos', alvo: alvo('kpi', 'tempo') }
  });

  const topico = ranking(d, 'topico')[0];
  if (topico && d.totalChamados >= 5 && topico.participacao >= 30) leituras.push({
    id: 'topico', tom: 'info', icone: 'pi pi-tags', titulo: 'Assunto que concentra a demanda', valor: topico.nome,
    texto: `${pct(topico.participacao)} dos chamados do período (${inteiro(topico.total)}). Vale olhar a causa na origem.`,
    acao: { rotulo: 'Analisar o tópico', alvo: alvo('topico', topico.chave) }
  });

  const sla = d.indicadores?.['taxaSlaResolucao'];
  if (sla && sla.anterior && Math.abs(sla.valor - sla.anterior) >= 1) {
    const melhorou = sla.valor > sla.anterior;
    leituras.push({
      id: 'sla-tendencia', tom: melhorou ? 'success' : 'warning', icone: melhorou ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right',
      titulo: melhorou ? 'SLA melhorou' : 'SLA piorou', valor: `${pct(sla.anterior)} → ${pct(sla.valor)}`,
      texto: 'Cumprimento do SLA de resolução contra o período anterior de mesma duração.',
      acao: { rotulo: 'Analisar o SLA', alvo: alvo('kpi', 'sla') }
    });
  }

  const vol = d.indicadores?.['totalChamados'];
  if (vol && vol.anterior && Math.abs(vol.variacaoPercentual) >= 20) leituras.push({
    id: 'volume', tom: 'info', icone: vol.variacaoPercentual > 0 ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right',
    titulo: vol.variacaoPercentual > 0 ? 'Demanda em alta' : 'Demanda em queda', valor: variacaoTexto(vol, '')!.trim(),
    texto: `${plural(vol.valor, 'chamado', 'chamados')} contra ${inteiro(vol.anterior)} no período anterior.`,
    acao: { rotulo: 'Analisar o volume', alvo: alvo('kpi', 'volume') }
  });

  const peso: Record<CesTone, number> = { danger: 0, warning: 1, info: 2, brand: 2, neutral: 3, success: 4 };
  return { veredito, leituras: leituras.sort((a, b) => peso[a.tom] - peso[b.tom]).slice(0, 6) };
}

function pior(linhas: readonly LinhaChamado[], motivo: MotivoAcao): string {
  const l = linhas.filter((x) => x.motivos.includes(motivo)).sort((a, b) => a.horasParaPrazo - b.horasParaPrazo)[0];
  return l ? ` O mais atrasado (${l.protocolo}, ${l.equipe}) ${prazoRelativo(l)}.` : '';
}
