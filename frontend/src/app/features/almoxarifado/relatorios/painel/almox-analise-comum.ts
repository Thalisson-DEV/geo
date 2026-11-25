import { ROTULOS_LISTAS } from '../../../../core/models/listas.models';
import { GeoChartSeries, GeoDataTableColumn, GeoTone } from '@geo/ui';
import { of } from 'rxjs';

import { MovimentacaoRelatorio, SaldoRelatorio, TipoMovimentacao } from '../../../../core/models/almoxarifado-relatorios.models';
import {
  AcaoAnalise,
  AlvoAnalise,
  DetalheRegistro,
  GraficoAnalise,
  LinkAnalise,
  OrigemAnalise
} from '../../../../shared/components/dashboard/dashboard-analise.models';
import { dataLocal } from '../../../../shared/listagem/listagem';
import { Recortavel } from './recorte-almox.service';

/**
 * Cálculos comuns dos relatórios do almoxarifado, sem Angular: formatação, rótulos, classificação das
 * movimentações do ponto de vista do almoxarifado, agrupamentos e peças da análise detalhada.
 */

export const FUSO = 'America/Sao_Paulo';
export const DIA_MS = 86_400_000;
const DIA_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const HORA = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });
const DIA_SEMANA = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short' });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Formatação ───────────────────────────────────────────────────────────────────────────────────

const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export const inteiro = (v: number | null | undefined) => (ok(v) ? Math.round(v).toLocaleString('pt-BR') : '—');
export const numero = (v: number | null | undefined, casas = 1) =>
  ok(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 }) : '—';
/** Quantidade de material (até 2 casas) com a unidade, se houver. */
export const qtd = (v: number | null | undefined, unidade?: string | null) =>
  ok(v) ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unidade ? ' ' + unidade.toLowerCase() : ''}` : '—';
/** Fração (0–1) em porcentagem. */
export const pct = (v: number | null | undefined, casas = 1) =>
  ok(v) ? `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%` : '—';
export const dias = (v: number | null | undefined) =>
  !ok(v) ? '—' : v < 1 ? 'menos de 1 dia' : `${Math.round(v).toLocaleString('pt-BR')} ${Math.round(v) === 1 ? 'dia' : 'dias'}`;
/** "45 min", "6h", "2,5 dias". */
export function tempo(horas: number | null | undefined): string {
  if (!ok(horas) || horas < 0) return '—';
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${horas.toLocaleString('pt-BR', { maximumFractionDigits: horas < 10 ? 1 : 0 })}h`;
  return `${(horas / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}
export const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`;

export const diaDe = (iso: string) => DIA_ISO.format(new Date(iso));
export const diaHora = (iso: string | null | undefined) => (iso ? DIA_HORA.format(new Date(iso)) : '—');
export const dataBr = (iso: string | null | undefined) =>
  !iso ? '—' : (iso.length === 10 ? dataLocal(iso)! : new Date(iso)).toLocaleDateString('pt-BR', { timeZone: iso.length === 10 ? undefined : FUSO });
export const horaDe = (iso: string) => Number(HORA.format(new Date(iso)));
const SEMANA_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const diaSemanaDe = (iso: string) => SEMANA_EN.indexOf(DIA_SEMANA.format(new Date(iso)));
export const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const mesDe = (iso: string) => `${diaDe(iso).substring(0, 7)}-01`;
export const rotuloMes = (mes: string) => `${MESES[Number(mes.substring(5, 7)) - 1]}/${mes.substring(2, 4)}`;
export const rotuloDia = (dia: string) => `${dia.substring(8, 10)}/${dia.substring(5, 7)}`;

/** Dias do período (yyyy-MM-dd), em ordem. */
export function diasEntre(de: string, ate: string): string[] {
  const lista: string[] = [];
  const inicio = dataLocal(de)!;
  const fim = dataLocal(ate)!;
  for (let d = new Date(inicio); d <= fim && lista.length < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return lista;
}

/** Meses do período ("2026-08-01", …). */
export function mesesEntre(de: string, ate: string): string[] {
  const inicio = dataLocal(de)!;
  const fim = dataLocal(ate)!;
  const meses: string[] = [];
  for (let d = new Date(inicio.getFullYear(), inicio.getMonth(), 1); d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  return meses;
}

/** "01 a 07/09" ou "29/09 a 05/10": a semana de segunda a domingo, por extenso. */
export function rotuloSemana(segunda: string): string {
  const ini = dataLocal(segunda)!;
  const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6);
  const dd = (d: Date) => String(d.getDate()).padStart(2, '0');
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0');
  return ini.getMonth() === fim.getMonth() ? `${dd(ini)} a ${dd(fim)}/${mm(fim)}` : `${dd(ini)}/${mm(ini)} a ${dd(fim)}/${mm(fim)}`;
}

/** Eixo do tempo: por dia até 45 dias, por semana até 6 meses, por mês acima disso. */
export interface Eixo {
  readonly chaves: string[];
  readonly rotulos: string[];
  readonly chaveDe: (iso: string) => string;
  readonly unidade: 'dia' | 'semana' | 'mes';
}

export function eixoDoPeriodo(de: string, ate: string): Eixo {
  const lista = diasEntre(de, ate);
  if (lista.length <= 45) return { chaves: lista, rotulos: lista.map(rotuloDia), chaveDe: diaDe, unidade: 'dia' };
  if (lista.length <= 190) {
    const semana = (dia: string) => {
      const d = dataLocal(dia)!;
      const seg = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      return `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`;
    };
    const chaves = [...new Set(lista.map(semana))];
    return { chaves, rotulos: chaves.map(rotuloSemana), chaveDe: (iso) => semana(diaDe(iso)), unidade: 'semana' };
  }
  const chaves = mesesEntre(de, ate);
  return { chaves, rotulos: chaves.map(rotuloMes), chaveDe: mesDe, unidade: 'mes' };
}

// ── Números ──────────────────────────────────────────────────────────────────────────────────────

export const soma = <T>(linhas: readonly T[], fn: (l: T) => number | null | undefined) =>
  linhas.reduce((s, l) => s + (Number(fn(l)) || 0), 0);

export function mediana(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter(ok).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function media(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter(ok);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const dividir = (a: number | null | undefined, b: number | null | undefined) => (a == null || !b ? null : a / b);

/** Variação relativa (fração); nula sem base. */
export const variacao = (atual: number | null | undefined, anterior: number | null | undefined) =>
  atual == null || anterior == null || anterior === 0 ? null : atual / anterior - 1;

/** "+12% sobre o período anterior". */
export function textoVariacao(atual: number | null, anterior: number | null, sufixo = 'sobre o anterior'): string {
  if (atual == null) return 'Sem dados no período';
  if (anterior == null || anterior === 0) return atual ? 'Sem base no período anterior' : 'Igual ao período anterior';
  const v = atual / anterior - 1;
  return Math.abs(v) < 0.005 ? 'Igual ao período anterior' : `${v > 0 ? '+' : '−'}${pct(Math.abs(v), 0)} ${sufixo}`;
}

/** Pareto: quantos itens (do maior para o menor) somam `corte` do total. */
export function pareto(valores: readonly number[], corte = 0.8): { itens: number; total: number; fracao: number } {
  const ordenados = [...valores].filter((v) => v > 0).sort((a, b) => b - a);
  const total = ordenados.reduce((a, b) => a + b, 0);
  let acumulado = 0;
  let itens = 0;
  for (const v of ordenados) {
    acumulado += v;
    itens++;
    if (acumulado >= total * corte) break;
  }
  return { itens, total: ordenados.length, fracao: ordenados.length ? itens / ordenados.length : 0 };
}

// ── Agrupamento ──────────────────────────────────────────────────────────────────────────────────

export interface Grupo<T> {
  chave: string;
  rotulo: string;
  linhas: T[];
}

export const SEM = '—';

/** Agrupa e ordena pelo critério (padrão: quantidade de linhas, decrescente). */
export function agrupar<T>(linhas: readonly T[], chave: (l: T) => string | null | undefined, nome: (l: T) => string | null | undefined,
                           ordem: (g: Grupo<T>) => number = (g) => g.linhas.length, vazio = 'Não informado'): Grupo<T>[] {
  const mapa = new Map<string, Grupo<T>>();
  for (const l of linhas) {
    const k = chave(l) ?? SEM;
    let g = mapa.get(k);
    if (!g) mapa.set(k, (g = { chave: k, rotulo: k === SEM ? vazio : (nome(l) ?? vazio), linhas: [] }));
    g.linhas.push(l);
  }
  return [...mapa.values()].sort((a, b) => ordem(b) - ordem(a) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

// ── Rótulos ──────────────────────────────────────────────────────────────────────────────────────

export const ROTULO_TIPO_MOV: Record<TipoMovimentacao, string> = {
  ENTRADA_AVULSA: 'Entrada avulsa',
  BAIXA_AVULSA: 'Baixa avulsa',
  TRANSFERENCIA: 'Transferência',
  ENTREGA: 'Entrega',
  ESTORNO: 'Estorno',
  APLICACAO: 'Aplicação em nota',
  RETIRADA: 'Retirada',
  DEVOLUCAO: 'Devolução'
};

/** Nomes do cadastro de motivos de entrada e baixa (lista configurável). */
export const ROTULO_MOTIVO: Record<string, string> = ROTULOS_LISTAS.MOTIVO_MOVIMENTACAO_ESTOQUE;

/** Motivos de baixa que são perda de material (e não destinação normal de sucata). */
export const MOTIVOS_PERDA = new Set(['PERDA_AVARIA', 'DANIFICACAO', 'OBSOLESCENCIA']);

export const ROTULO_TIPO_ESTOQUE: Record<string, string> = { FISICO: 'Almoxarifado', CAMPO: 'Equipe', OBRA: 'Obra' };
export const ROTULO_CONDICAO: Record<string, string> = { NOVO: 'Novo', SUCATA: 'Sucata' };
export const ROTULO_CONTEXTO: Record<string, string> = { COMERCIAL: 'Comercial', TECNICO: 'Técnico', FECHAMENTO: 'Encerramento de obra' };
export const TIPOS_TECNICOS: Record<string, string> = {
  '221': 'Retirada', '921': 'Retirada · concreto', '222': 'Devolução', '922': 'Devolução · concreto'
};

export const rotulo = (mapa: Record<string, string>, chave: string | null | undefined, vazio = 'Não informado') =>
  chave ? (mapa[chave] ?? chave) : vazio;

// ── Movimentações do ponto de vista do almoxarifado ──────────────────────────────────────────────

/**
 * Sentido da movimentação para o almoxarifado (estoque físico):
 * entrada (chega ao almoxarifado), saída (sai dele), interna (entre almoxarifados) ou campo (não passa
 * pelo almoxarifado: aplicação em nota, retirada em campo, estorno de obra).
 */
export type Sentido = 'entrada' | 'saida' | 'interna' | 'campo';

export function sentido(m: Pick<MovimentacaoRelatorio, 'tipoOrigem' | 'tipoDestino'>): Sentido {
  const deFisico = m.tipoOrigem === 'FISICO';
  const paraFisico = m.tipoDestino === 'FISICO';
  if (deFisico && paraFisico) return 'interna';
  if (paraFisico) return 'entrada';
  if (deFisico) return 'saida';
  return 'campo';
}

export const ROTULO_SENTIDO: Record<Sentido, string> = {
  entrada: 'Entrada no almoxarifado', saida: 'Saída do almoxarifado', interna: 'Entre almoxarifados', campo: 'Em campo'
};

/**
 * Natureza gerencial de uma movimentação: o que ela significa para quem cuida do almoxarifado.
 */
export type Natureza =
  | 'abastecimento'   // entrada avulsa (compra, ajuste para mais, doação)
  | 'retorno'         // devolução, estorno e transferência de volta ao almoxarifado
  | 'sucata-recebida' // sucata que chega ao almoxarifado
  | 'atendimento'     // entrega e transferência do almoxarifado para equipe ou obra
  | 'baixa'           // baixa avulsa do almoxarifado (perda, sucata, ajuste)
  | 'remanejamento'   // entre almoxarifados
  | 'aplicacao'       // material aplicado em nota (consumo confirmado em campo)
  | 'retirada-campo'  // material retirado da rede em campo
  | 'outros-campo';   // movimentos entre equipe e obra, estornos sem almoxarifado

export const ROTULO_NATUREZA: Record<Natureza, string> = {
  abastecimento: 'Abastecimento',
  retorno: 'Retorno ao almoxarifado',
  'sucata-recebida': 'Sucata recebida',
  atendimento: 'Atendimento às equipes',
  baixa: 'Baixa do almoxarifado',
  remanejamento: 'Remanejamento entre almoxarifados',
  aplicacao: 'Aplicação em nota',
  'retirada-campo': 'Retirada em campo',
  'outros-campo': 'Outros movimentos em campo'
};

export function natureza(m: MovimentacaoRelatorio): Natureza {
  const s = sentido(m);
  if (s === 'interna') return 'remanejamento';
  if (s === 'entrada') {
    if (m.tipo === 'ENTRADA_AVULSA') return 'abastecimento';
    return m.condicao === 'SUCATA' ? 'sucata-recebida' : 'retorno';
  }
  if (s === 'saida') return m.tipo === 'BAIXA_AVULSA' ? 'baixa' : 'atendimento';
  if (m.tipo === 'APLICACAO') return 'aplicacao';
  if (m.tipo === 'RETIRADA') return 'retirada-campo';
  return 'outros-campo';
}

/**
 * Parte do que saiu que voltou, por quantidade de cada material (o retorno de um material é limitado ao
 * que dele saiu no período: devolução de material entregue antes não infla a taxa), ponderada pelo número
 * de saídas de cada material.
 */
export function taxaRetornoDe(linhas: readonly MovimentacaoRelatorio[]): number | null {
  const porMat = new Map<string, { ent: number; ret: number; n: number }>();
  for (const m of linhas) {
    const s = natureza(m) === 'atendimento' && m.condicao === 'NOVO';
    if (!s && natureza(m) !== 'retorno') continue;
    const x = porMat.get(m.idMaterial) ?? { ent: 0, ret: 0, n: 0 };
    if (s) { x.ent += m.quantidade; x.n++; } else x.ret += m.quantidade;
    porMat.set(m.idMaterial, x);
  }
  let peso = 0;
  let acc = 0;
  for (const x of porMat.values()) {
    if (x.ent <= 0) continue;
    peso += x.n;
    acc += x.n * Math.min(1, x.ret / x.ent);
  }
  return peso ? acc / peso : null;
}

/** Almoxarifados (estoques físicos) envolvidos numa movimentação. */
export function almoxDa(m: MovimentacaoRelatorio): (string | null)[] {
  return [m.tipoOrigem === 'FISICO' ? m.idOrigem : null, m.tipoDestino === 'FISICO' ? m.idDestino : null];
}

export const recortavelMov = (m: MovimentacaoRelatorio): Recortavel =>
  ({ idBase: m.idBase, idProcesso: m.idProcesso, idEquipe: m.idEquipe, almox: almoxDa(m) });

export const recortavelSaldo = (s: SaldoRelatorio): Recortavel =>
  ({ idBase: s.idBase, idProcesso: s.idProcesso, idEquipe: s.idEquipe, almox: [s.tipoEstoque === 'FISICO' ? s.idEstoque : null] });

/** Nome do almoxarifado envolvido (origem ou destino físico). */
export function nomeAlmox(m: MovimentacaoRelatorio): string | null {
  return m.tipoOrigem === 'FISICO' ? m.origem : m.tipoDestino === 'FISICO' ? m.destino : null;
}
export function idAlmox(m: MovimentacaoRelatorio): string | null {
  return m.tipoOrigem === 'FISICO' ? m.idOrigem : m.tipoDestino === 'FISICO' ? m.idDestino : null;
}

/** Almoxarifados e equipes presentes nos dados (para as opções do recorte). */
export function conhecidosMov(linhas: readonly MovimentacaoRelatorio[]): [Array<[string | null, string | null]>, Array<[string | null, string | null]>] {
  const almox: Array<[string | null, string | null]> = [];
  const equipes: Array<[string | null, string | null]> = [];
  for (const m of linhas) {
    if (m.tipoOrigem === 'FISICO') almox.push([m.idOrigem, m.origem]);
    if (m.tipoDestino === 'FISICO') almox.push([m.idDestino, m.destino]);
    if (m.idEquipe) equipes.push([m.idEquipe, m.equipe]);
  }
  return [almox, equipes];
}

// ── Alvos, ações e peças da análise ──────────────────────────────────────────────────────────────

export const alvo = (dimension: string, value: string): AlvoAnalise => ({ dimension, value });
export const navegar = (dimension: string, value: string): AcaoAnalise => ({ tipo: 'navegar', alvo: alvo(dimension, value) });

export function grafico(id: string, titulo: string, tipo: GraficoAnalise['tipo'], rotulos: readonly string[],
                        series: readonly GeoChartSeries[], extra: Partial<GraficoAnalise> = {}): GraficoAnalise {
  const altura = extra.altura ?? (tipo === 'bar-horizontal' ? Math.max(200, rotulos.length * 30) : undefined);
  // Contagens sem formato explícito: eixo e rótulos inteiros.
  const contagem = !extra.formato && series.every((x) => x.values.every((v) => v == null || Number.isInteger(v)));
  return { id, titulo, tipo, rotulos, series, ...(contagem ? { formato: 'integer' as const } : {}), ...extra, ...(altura ? { altura } : {}) };
}

/** Gráfico de barras horizontais a partir de grupos, com o clique abrindo a análise do grupo. */
export function graficoGrupos<T>(id: string, titulo: string, grupos: readonly Grupo<T>[], nome: string, valor: (g: Grupo<T>) => number,
                                 dimensao: string | null, extra: Partial<GraficoAnalise> = {}, limite = 12): GraficoAnalise {
  const g = grupos.filter((x) => valor(x) > 0).slice(0, limite);
  return grafico(id, titulo, 'bar-horizontal', g.map((x) => x.rotulo), [{ name: nome, values: g.map(valor) }], {
    ...(dimensao ? { aoSelecionar: (i: number) => (g[i] && g[i].chave !== SEM ? navegar(dimensao, g[i].chave) : null), rotuloSelecao: 'Analisar' } : {}),
    ...extra
  });
}

/** Rótulos e uma série a partir de grupos (para `geo-chart`). */
export function serieDeGrupos<T>(grupos: readonly Grupo<T>[], nome: string, valor: (g: Grupo<T>) => number, limite = 12) {
  const g = grupos.filter((x) => valor(x) > 0).slice(0, limite);
  return { rotulos: g.map((x) => x.rotulo), series: [{ name: nome, values: g.map(valor) }] as GeoChartSeries[], grupos: g };
}

/** Tom de um número contra uma referência ("menor é melhor" por padrão). */
export function tomContra(valor: number | null, referencia: number | null, tolerancia = 0.15, menorMelhor = true): GeoTone {
  if (valor == null || referencia == null || referencia === 0) return 'neutral';
  const desvio = valor / referencia - 1;
  const ruim = menorMelhor ? desvio > tolerancia : desvio < -tolerancia;
  const bom = menorMelhor ? desvio < -tolerancia : desvio > tolerancia;
  return ruim ? 'warning' : bom ? 'success' : 'neutral';
}

/** Leituras da visão gerencial: o que pede ação primeiro, até `limite`. */
export function priorizar<T extends { tom: GeoTone }>(leituras: readonly T[], limite = 6): T[] {
  const peso: Partial<Record<GeoTone, number>> = { danger: 0, warning: 1, success: 3 };
  return [...leituras].sort((a, b) => (peso[a.tom] ?? 2) - (peso[b.tom] ?? 2)).slice(0, limite);
}

// ── Links para os registros de origem ────────────────────────────────────────────────────────────

export const linkOperacao = (idOperacao: string): LinkAnalise =>
  ({ rotulo: 'Abrir a movimentação', icone: 'pi pi-file', rota: ['/almoxarifado/movimentacoes', idOperacao] });
export const linkSolicitacao = (id: string, contexto: string | null): LinkAnalise =>
  ({ rotulo: 'Abrir a solicitação', icone: 'pi pi-inbox',
    rota: contexto === 'TECNICO' ? ['/almoxarifado/solicitacoes-tecnicas', id] : ['/almoxarifado/solicitacoes', id] });
export const linkSaldoEstoque = (idEstoque: string, rotuloLink = 'Abrir os saldos do estoque'): LinkAnalise =>
  ({ rotulo: rotuloLink, icone: 'pi pi-database', rota: ['/almoxarifado/saldos/relatorio'], queryParams: { idEstoque } });
export const linkObra = (id: string): LinkAnalise => ({ rotulo: 'Abrir a obra', icone: 'pi pi-building', rota: ['/obras', id] });
export const linkMovimentacoesMaterial = (codigo: string): LinkAnalise =>
  ({ rotulo: 'Ver no histórico de movimentações', icone: 'pi pi-history', rota: ['/almoxarifado/movimentacoes'], queryParams: { busca: codigo } });

// ── Origem: movimentações ────────────────────────────────────────────────────────────────────────

export const colMovimentacoes: GeoDataTableColumn<MovimentacaoRelatorio>[] = [
  { key: 'dataHora', header: 'Data', priority: 1, type: 'custom', value: (m) => m.dataHora, display: (m) => diaHora(m.dataHora) },
  { key: 'tipo', header: 'Tipo', priority: 1, value: (m) => ROTULO_TIPO_MOV[m.tipo] ?? m.tipo },
  { key: 'material', header: 'Material', priority: 1, value: (m) => `${m.codigo} · ${m.descricao}` },
  { key: 'quantidade', header: 'Qtd.', priority: 1, type: 'custom', value: (m) => m.quantidade, display: (m) => qtd(m.quantidade, m.unidade) },
  { key: 'condicao', header: 'Condição', priority: 3, value: (m) => rotulo(ROTULO_CONDICAO, m.condicao) },
  { key: 'origem', header: 'De', priority: 2, value: (m) => m.origem ?? 'Fora do estoque' },
  { key: 'destino', header: 'Para', priority: 2, value: (m) => m.destino ?? 'Fora do estoque' },
  { key: 'equipe', header: 'Equipe', priority: 3, value: (m) => m.equipe ?? '—' },
  { key: 'obra', header: 'Obra', priority: 3, value: (m) => m.obra ?? '—' },
  { key: 'operador', header: 'Operador', priority: 3, value: (m) => m.operador ?? '—' },
  { key: 'motivo', header: 'Motivo', priority: 3, value: (m) => (m.motivo ? rotulo(ROTULO_MOTIVO, m.motivo) : '—') }
];

export function detalheMovimentacao(m: MovimentacaoRelatorio): DetalheRegistro {
  const links: LinkAnalise[] = [];
  if (m.idOperacao) links.push(linkOperacao(m.idOperacao));
  if (m.idSolicitacao) links.push(linkSolicitacao(m.idSolicitacao, m.contexto));
  if (m.idObra) links.push(linkObra(m.idObra));
  return {
    titulo: `${ROTULO_TIPO_MOV[m.tipo] ?? m.tipo} · ${m.codigo}`,
    subtitulo: m.descricao,
    campos: [
      { rotulo: 'Data', valor: diaHora(m.dataHora), icone: 'pi pi-calendar' },
      { rotulo: 'Quantidade', valor: qtd(m.quantidade, m.unidade), icone: 'pi pi-box' },
      { rotulo: 'Condição', valor: rotulo(ROTULO_CONDICAO, m.condicao) },
      { rotulo: 'De', valor: m.origem ?? 'Fora do estoque' },
      { rotulo: 'Para', valor: m.destino ?? 'Fora do estoque' },
      { rotulo: 'Equipe', valor: m.equipe ?? '—' },
      { rotulo: 'Obra', valor: m.obra ?? '—' },
      { rotulo: 'Base', valor: m.base ?? '—' },
      { rotulo: 'Processo', valor: m.processo ?? '—' },
      { rotulo: 'Operador', valor: m.operador ?? '—', icone: 'pi pi-user' },
      ...(m.motivo ? [{ rotulo: 'Motivo', valor: rotulo(ROTULO_MOTIVO, m.motivo) }] : []),
      ...(m.numSerie ? [{ rotulo: 'Número de série', valor: m.numSerie }] : []),
      ...(m.tipoTecnico ? [{ rotulo: 'Tipo técnico', valor: `${m.tipoTecnico} · ${TIPOS_TECNICOS[m.tipoTecnico] ?? ''}` }] : []),
      ...(m.observacao ? [{ rotulo: 'Observação', valor: m.observacao }] : [])
    ],
    links
  };
}

/** Origem da análise com as movimentações que compõem o número. */
export function origemMovimentacoes(chave: string, titulo: string, linhas: readonly MovimentacaoRelatorio[],
                                    extra: Partial<OrigemAnalise<MovimentacaoRelatorio>> = {}): OrigemAnalise<MovimentacaoRelatorio> {
  const ordenadas = [...linhas].sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  return {
    chave,
    titulo,
    rotuloAba: 'Movimentações',
    icone: 'pi pi-list',
    colunas: colMovimentacoes,
    carregar: () => of({ linhas: ordenadas, total: ordenadas.length }),
    chaveLinha: (m) => m.id,
    rotuloLinha: (m) => `${ROTULO_TIPO_MOV[m.tipo]} de ${m.codigo}`,
    detalhar: (m) => detalheMovimentacao(m),
    nomeArquivo: `almoxarifado-${chave}`,
    vazio: 'Nenhuma movimentação neste recorte.',
    ...extra
  };
}
