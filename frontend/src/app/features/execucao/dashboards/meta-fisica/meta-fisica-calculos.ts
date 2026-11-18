import { CesTone } from '@ces/ui';
import { DashboardMetaFisicaResponse, nomeServico } from '../../../../core/models/meta-fisica.models';

/**
 * Cálculos da meta física: a meta do mês distribuída pelos dias úteis, o realizado (uma nota
 * conta uma vez, pelo tipo de serviço) e, com isso, o esperado até ontem, o ritmo, a projeção e
 * quantas notas por dia útil faltam. Tudo sai das metas e da produção diária que o backend envia.
 */

export type SituacaoFisica = 'ATINGIDA' | 'NO_RITMO' | 'ABAIXO' | 'NAO_ATINGIDA' | 'A_INICIAR';
export type EstadoMes = 'andamento' | 'encerrado' | 'futuro';

export const SITUACAO_FISICA: Record<SituacaoFisica, { rotulo: string; tom: CesTone; icone: string }> = {
  ATINGIDA: { rotulo: 'Meta batida', tom: 'success', icone: 'pi pi-check-circle' },
  NO_RITMO: { rotulo: 'No ritmo', tom: 'info', icone: 'pi pi-arrow-up-right' },
  ABAIXO: { rotulo: 'Abaixo do ritmo', tom: 'warning', icone: 'pi pi-exclamation-triangle' },
  NAO_ATINGIDA: { rotulo: 'Não atingida', tom: 'danger', icone: 'pi pi-times-circle' },
  A_INICIAR: { rotulo: 'Mês não começou', tom: 'neutral', icone: 'pi pi-calendar' }
};

/** Atenção primeiro: abaixo do ritmo e não atingida, depois no ritmo, por fim batida. */
export const PESO_SITUACAO: Record<SituacaoFisica, number> = { NAO_ATINGIDA: 0, ABAIXO: 1, NO_RITMO: 2, A_INICIAR: 3, ATINGIDA: 4 };

export interface Apuracao {
  readonly meta: number;
  readonly realizado: number;
  readonly realizadoAteOntem: number;
  readonly notasHoje: number;
  /** Meta proporcional aos dias úteis encerrados (até ontem); a meta inteira com o mês fechado. */
  readonly esperado: number;
  readonly falta: number;
  /** Notas por dia útil que faltam, de hoje ao fim do mês. */
  readonly necessarioPorDia: number | null;
  /** Notas por dia útil encerrado. */
  readonly ritmo: number | null;
  readonly projecao: number | null;
  readonly pct: number | null;
  readonly pctEsperado: number | null;
  readonly pctProjecao: number | null;
  /** Realizado menos o esperado até ontem (negativo = atraso). */
  readonly saldo: number;
  readonly situacao: SituacaoFisica;
}

export interface CelulaFisica extends Apuracao {
  readonly chave: string;
  readonly idBase: string;
  readonly base: string;
  readonly idTipo: string;
  readonly servico: string;
  readonly codigo: string | null;
}

export interface EquipeFisica {
  readonly id: string;
  readonly codigo: string;
  readonly idBase: string;
  readonly base: string;
  readonly notas: number;
  readonly porTipo: Readonly<Record<string, number>>;
  readonly diasComNota: number;
}

export interface GrupoFisico extends Apuracao {
  readonly id: string;
  readonly nome: string;
  readonly codigo?: string | null;
  readonly celulas: readonly CelulaFisica[];
}

export interface DiaFisico {
  readonly data: string;
  readonly util: boolean;
  readonly metaDia: number;
  readonly realizado: number;
  readonly metaAcumulada: number;
  /** Nulo nos dias que ainda não chegaram. */
  readonly realizadoAcumulado: number | null;
  /** Linha da projeção: parte do realizado de ontem e soma o ritmo a cada dia útil. */
  readonly projecaoAcumulada: number | null;
}

export interface MesHistorico {
  readonly competencia: string;
  readonly meta: number;
  readonly realizado: number;
  readonly pct: number | null;
}

/** Recorte de produção: quais pares base × tipo entram na conta. */
export type FiltroCelula = (idBase: string, idTipo: string) => boolean;

export interface ModeloMetaFisica {
  readonly d: DashboardMetaFisicaResponse;
  readonly estado: EstadoMes;
  readonly geral: Apuracao;
  readonly celulas: readonly CelulaFisica[];
  readonly bases: readonly GrupoFisico[];
  readonly servicos: readonly GrupoFisico[];
  readonly equipes: readonly EquipeFisica[];
  readonly diario: readonly DiaFisico[];
  readonly historico: readonly MesHistorico[];
}

const chaveCelula = (idBase: string, idTipo: string) => `${idBase}|${idTipo}`;

export function estadoDoMes(d: Pick<DashboardMetaFisicaResponse, 'hoje' | 'inicio' | 'fim'>): EstadoMes {
  if (d.hoje > d.fim) return 'encerrado';
  if (d.hoje < d.inicio) return 'futuro';
  return 'andamento';
}

/** Apuração de uma meta contra a produção diária (já recortada). */
export function apurar(
  meta: number,
  producao: readonly { data: string; notas: number }[],
  d: Pick<DashboardMetaFisicaResponse, 'hoje' | 'inicio' | 'fim' | 'diasUteis' | 'diasUteisEncerrados' | 'diasUteisRestantes'>
): Apuracao {
  const estado = estadoDoMes(d);
  let realizado = 0;
  let realizadoAteOntem = 0;
  let notasHoje = 0;
  for (const p of producao) {
    realizado += p.notas;
    if (p.data < d.hoje) realizadoAteOntem += p.notas;
    else if (p.data === d.hoje) notasHoje += p.notas;
  }
  const esperado = estado === 'encerrado' ? meta : d.diasUteis ? (meta * d.diasUteisEncerrados) / d.diasUteis : 0;
  const ritmo = d.diasUteisEncerrados > 0 ? realizadoAteOntem / d.diasUteisEncerrados : null;
  let projecao: number | null = null;
  if (estado === 'encerrado') projecao = realizado;
  else if (estado === 'andamento' && ritmo != null) projecao = Math.max(realizado, Math.round(realizadoAteOntem + ritmo * d.diasUteisRestantes));
  const falta = Math.max(0, meta - realizado);
  const pct = meta > 0 ? (realizado / meta) * 100 : null;

  let situacao: SituacaoFisica;
  if (meta > 0 && realizado >= meta) situacao = 'ATINGIDA';
  else if (estado === 'futuro') situacao = 'A_INICIAR';
  else if (estado === 'encerrado') situacao = 'NAO_ATINGIDA';
  else situacao = realizado >= esperado ? 'NO_RITMO' : 'ABAIXO';

  return {
    meta,
    realizado,
    realizadoAteOntem,
    notasHoje,
    esperado,
    falta,
    necessarioPorDia: d.diasUteisRestantes > 0 ? falta / d.diasUteisRestantes : null,
    ritmo,
    projecao,
    pct,
    pctEsperado: meta > 0 ? (esperado / meta) * 100 : null,
    pctProjecao: meta > 0 && projecao != null ? (projecao / meta) * 100 : null,
    saldo: realizado - esperado,
    situacao
  };
}

/** Série diária de uma meta: meta do dia útil, realizado e acumulados, com a linha da projeção. */
export function diarioDe(
  d: DashboardMetaFisicaResponse,
  meta: number,
  filtro: FiltroCelula,
  ritmo: number | null
): DiaFisico[] {
  const porDia = new Map<string, number>();
  for (const p of d.producao) {
    if (filtro(p.idBaseOperacional, p.idTipoServico)) porDia.set(p.data, (porDia.get(p.data) ?? 0) + p.notas);
  }
  const metaDiaUtil = d.diasUteis ? meta / d.diasUteis : 0;
  const projetar = estadoDoMes(d) === 'andamento' && ritmo != null;
  const dias: DiaFisico[] = [];
  let metaAcumulada = 0;
  let realizadoAcumulado = 0;
  let projecao: number | null = null;
  for (const dia of d.calendario) {
    const metaDia = dia.util ? metaDiaUtil : 0;
    const realizado = porDia.get(dia.data) ?? 0;
    metaAcumulada += metaDia;
    realizadoAcumulado += realizado;
    let projecaoAcumulada: number | null = null;
    if (projetar) {
      if (dia.data >= d.hoje) {
        projecao = (projecao ?? realizadoAcumulado - realizado) + (dia.util ? ritmo! : 0);
        projecaoAcumulada = projecao;
      } else if (proximoDia(dia.data) === d.hoje) {
        projecaoAcumulada = realizadoAcumulado;
        projecao = realizadoAcumulado;
      }
    }
    dias.push({
      data: dia.data,
      util: dia.util,
      metaDia,
      realizado,
      metaAcumulada,
      realizadoAcumulado: dia.data > d.hoje ? null : realizadoAcumulado,
      projecaoAcumulada
    });
  }
  return dias;
}

function proximoDia(iso: string): string {
  const [a, m, dd] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, dd + 1, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function modeloMetaFisica(d: DashboardMetaFisicaResponse): ModeloMetaFisica {
  const nomeBase = new Map(d.bases.map((b) => [b.id, b.nome]));
  const tipos = new Map(d.tipos.map((t) => [t.id, t]));
  const metaPorCelula = new Map(d.metas.map((m) => [chaveCelula(m.idBaseOperacional, m.idTipoServico), m.quantidade]));
  const naMeta: FiltroCelula = (b, t) => metaPorCelula.has(chaveCelula(b, t));

  const producaoPorCelula = new Map<string, { data: string; notas: number }[]>();
  for (const p of d.producao) {
    const chave = chaveCelula(p.idBaseOperacional, p.idTipoServico);
    if (!metaPorCelula.has(chave)) continue;
    const lista = producaoPorCelula.get(chave) ?? [];
    lista.push({ data: p.data, notas: p.notas });
    producaoPorCelula.set(chave, lista);
  }

  const celulas: CelulaFisica[] = d.metas.map((m) => {
    const chave = chaveCelula(m.idBaseOperacional, m.idTipoServico);
    const tipo = tipos.get(m.idTipoServico);
    return {
      ...apurar(m.quantidade, producaoPorCelula.get(chave) ?? [], d),
      chave,
      idBase: m.idBaseOperacional,
      base: nomeBase.get(m.idBaseOperacional) ?? 'Base removida',
      idTipo: m.idTipoServico,
      servico: nomeServico(tipo?.descricao),
      codigo: tipo?.codigo ?? null
    };
  });

  const agrupar = (chave: (c: CelulaFisica) => string, nome: (c: CelulaFisica) => string, codigo?: (c: CelulaFisica) => string | null): GrupoFisico[] => {
    const grupos = new Map<string, CelulaFisica[]>();
    for (const c of celulas) grupos.set(chave(c), [...(grupos.get(chave(c)) ?? []), c]);
    return [...grupos.entries()].map(([id, cs]) => {
      const pares = new Set(cs.map((c) => c.chave));
      const producao = d.producao.filter((p) => pares.has(chaveCelula(p.idBaseOperacional, p.idTipoServico)));
      return {
        ...apurar(cs.reduce((t, c) => t + c.meta, 0), producao, d),
        id,
        nome: nome(cs[0]),
        codigo: codigo?.(cs[0]) ?? null,
        celulas: [...cs].sort((a, b) => b.meta - a.meta)
      };
    });
  };

  const bases = agrupar((c) => c.idBase, (c) => c.base).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const servicos = agrupar((c) => c.idTipo, (c) => c.servico, (c) => c.codigo).sort((a, b) => b.meta - a.meta || a.nome.localeCompare(b.nome, 'pt-BR'));
  const geral = apurar(
    celulas.reduce((t, c) => t + c.meta, 0),
    d.producao.filter((p) => naMeta(p.idBaseOperacional, p.idTipoServico)),
    d
  );

  return {
    d,
    estado: estadoDoMes(d),
    geral,
    celulas,
    bases,
    servicos,
    equipes: equipesDe(d, naMeta),
    diario: diarioDe(d, geral.meta, naMeta, geral.ritmo),
    historico: historicoDe(d, () => true)
  };
}

/** Equipes que lançaram notas no recorte, da que mais lançou para a que menos lançou. */
export function equipesDe(d: DashboardMetaFisicaResponse, filtro: FiltroCelula): EquipeFisica[] {
  const nomeBase = new Map(d.bases.map((b) => [b.id, b.nome]));
  const acumulado = new Map<string, { notas: number; porTipo: Record<string, number>; dias: Set<string> }>();
  for (const p of d.producao) {
    if (!filtro(p.idBaseOperacional, p.idTipoServico)) continue;
    const e = acumulado.get(p.idEquipe) ?? { notas: 0, porTipo: {}, dias: new Set<string>() };
    e.notas += p.notas;
    e.porTipo[p.idTipoServico] = (e.porTipo[p.idTipoServico] ?? 0) + p.notas;
    e.dias.add(p.data);
    acumulado.set(p.idEquipe, e);
  }
  return d.equipes
    .filter((e) => acumulado.has(e.id))
    .map((e) => {
      const a = acumulado.get(e.id)!;
      return {
        id: e.id,
        codigo: e.codigo,
        idBase: e.idBaseOperacional,
        base: nomeBase.get(e.idBaseOperacional) ?? '—',
        notas: a.notas,
        porTipo: a.porTipo,
        diasComNota: a.dias.size
      };
    })
    .sort((a, b) => b.notas - a.notas || a.codigo.localeCompare(b.codigo, 'pt-BR'));
}

/** Meta e realizado mês a mês; o realizado só conta onde havia meta naquele mês. */
export function historicoDe(d: DashboardMetaFisicaResponse, filtro: FiltroCelula): MesHistorico[] {
  const meses = new Map<string, { meta: number; realizado: number }>();
  for (const h of d.historico) {
    if (h.meta == null || !filtro(h.idBaseOperacional, h.idTipoServico)) continue;
    const m = meses.get(h.competencia) ?? { meta: 0, realizado: 0 };
    m.meta += h.meta;
    m.realizado += h.realizado;
    meses.set(h.competencia, m);
  }
  return [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([competencia, m]) => ({ competencia, meta: m.meta, realizado: m.realizado, pct: m.meta > 0 ? (m.realizado / m.meta) * 100 : null }));
}

export function ordenarPorAtencao<T extends Apuracao>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => PESO_SITUACAO[a.situacao] - PESO_SITUACAO[b.situacao] || a.saldo - b.saldo);
}

// ------------------------------------------------------------------ formatação

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function notas(n: number | null | undefined): string {
  if (n == null || n === undefined || !Number.isFinite(n)) return '—';
  const valor = Math.round(n);
  return `${INTEIRO.format(valor)} ${valor === 1 ? 'nota' : 'notas'}`;
}

export function inteiro(n: number | null | undefined): string {
  return n == null || n === undefined || !Number.isFinite(n) ? '—' : INTEIRO.format(Math.round(n));
}

export function umaCasa(n: number | null | undefined): string {
  return n == null || n === undefined || !Number.isFinite(n) ? '—' : UMA_CASA.format(n);
}
