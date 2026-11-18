import { competencia as montarCompetencia, diasUteisDaJanela, janelaDaCompetencia, nomeCompetencia } from './meta-faturamento.models';

/**
 * Meta física da Concessionária: quantas notas de cada tipo de serviço cada base deve executar
 * no mês. Cada nota conta uma vez, não importa quantos serviços tenha.
 */

export interface MetaFisicaServico {
  idTipoServico: string;
  codigoTipoServico: string | null;
  tipoServico: string | null;
  quantidade: number;
  /** Parcial que a Concessionária enviou; nulo quando a meta mensal veio pronta. */
  parcialConcessionária: number | null;
  porDiaUtil: number | null;
}

export interface MetaFisicaResponse {
  id: string;
  idBaseOperacional: string;
  baseOperacional: string | null;
  /** `yyyy-MM`. */
  competencia: string;
  total: number;
  totalMesConcessionária: number | null;
  parcialAte: string | null;
  descricao: string | null;
  diasUteis: number;
  porDiaUtil: number | null;
  servicos: MetaFisicaServico[];
  ativo: boolean;
  dataCriacao: string | null;
  usuarioCriacao: string | null;
  dataUltimaAlteracao: string | null;
  usuarioUltimaAlteracao: string | null;
}

export interface MetaFisicaRequest {
  idBaseOperacional: string;
  competencia: string;
  totalMesConcessionária: number | null;
  parcialAte: string | null;
  descricao: string | null;
  servicos: { idTipoServico: string; quantidade: number | null; parcialConcessionária: number | null }[];
}

export interface MetaFisicaFilter {
  idBaseOperacional?: string | null;
  competencia?: string | null;
  ano?: number | null;
  idTipoServico?: string | null;
  ativo?: boolean | null;
  buscaGlobal?: string | null;
  page?: number;
  size?: number;
  sort?: string | string[];
}

// ---------------------------------------------------------------- painel

export interface DashboardMetaFisicaFiltros {
  competencia?: string;
  idBaseOperacional?: string[];
  idTipoServico?: string[];
}

export interface DashboardMetaFisicaResponse {
  competencia: string;
  inicio: string;
  fim: string;
  hoje: string;
  geradoEm: string;
  diasUteis: number;
  diasUteisEncerrados: number;
  diasUteisRestantes: number;
  calendario: { data: string; util: boolean }[];
  bases: { id: string; nome: string }[];
  tipos: { id: string; codigo: string | null; descricao: string }[];
  metas: { idMeta: string; idBaseOperacional: string; idTipoServico: string; quantidade: number }[];
  equipes: { id: string; codigo: string; idBaseOperacional: string }[];
  producao: { data: string; idBaseOperacional: string; idTipoServico: string; idEquipe: string; notas: number }[];
  historico: { competencia: string; idBaseOperacional: string; idTipoServico: string; meta: number | null; realizado: number }[];
}

// ---------------------------------------------------------------- helpers

/** Mês corrente em `yyyy-MM`. */
export function competenciaAtual(hoje = new Date()): string {
  return montarCompetencia(hoje.getFullYear(), hoje.getMonth() + 1);
}

export function deslocarCompetencia(comp: string, meses: number): string {
  const [ano, mes] = comp.split('-').map(Number);
  return montarCompetencia(ano, mes + meses);
}

/** "Novembro/2026". */
export function nomeMes(comp: string): string {
  return nomeCompetencia('MENSAL', comp);
}

/** "nov/26", para eixos de gráfico. */
export function nomeMesCurto(comp: string): string {
  const [ano, mes] = comp.split('-').map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${nome}/${String(ano).slice(2)}`;
}

/** Segunda a sexta do mês, sem os feriados nacionais (mesma regra do backend). */
export function diasUteisDoMes(comp: string): number {
  return diasUteisDaJanela(janelaDaCompetencia('MENSAL', comp));
}

/**
 * Reparte o total do mês pelos serviços na proporção do parcial da Concessionária, pelos maiores
 * restos (no empate, o maior parcial e depois a ordem). Espelha o cálculo do backend.
 * `null` quando não há como repartir (total ou parciais ausentes, soma zero).
 */
export function distribuirPeloParcial(total: number | null, parciais: readonly (number | null)[]): number[] | null {
  if (!total || total <= 0 || !parciais.length || parciais.some((p) => p == null || p < 0)) return null;
  const valores = parciais as number[];
  const soma = valores.reduce((t, p) => t + p, 0);
  if (soma <= 0) return null;
  const base = valores.map((p) => Math.floor((total * p) / soma));
  const restos = valores.map((p) => (total * p) % soma);
  let sobra = total - base.reduce((t, q) => t + q, 0);
  const ordem = valores.map((_, i) => i).sort((a, b) => restos[b] - restos[a] || valores[b] - valores[a] || a - b);
  for (let k = 0; sobra > 0; k++, sobra--) base[ordem[k % ordem.length]]++;
  return base;
}

/** Rótulo do tipo de serviço: "CS · CORTE". */
export function rotuloTipoServico(codigo: string | null | undefined, descricao: string | null | undefined): string {
  if (!descricao) return 'Tipo removido';
  return codigo ? `${codigo} · ${descricao}` : descricao;
}

/** Nome do serviço em caixa de título para a tela ("Baixa adm"). */
export function nomeServico(descricao: string | null | undefined): string {
  if (!descricao) return 'Tipo removido';
  const minusculo = descricao.toLocaleLowerCase('pt-BR');
  return minusculo.charAt(0).toLocaleUpperCase('pt-BR') + minusculo.slice(1);
}
