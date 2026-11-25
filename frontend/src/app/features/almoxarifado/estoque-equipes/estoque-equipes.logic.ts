import { EquipeNoBalcao, ItemNasEquipes } from '../../../core/models/balcao.models';

export type SituacaoEquipe = 'negativo' | 'atrasada' | 'retirar' | 'sucata' | 'ok';

export const ROTULO_SITUACAO: Record<SituacaoEquipe, string> = {
  negativo: 'Saldo negativo',
  atrasada: 'Retirada atrasada',
  retirar: 'Retirada aberta',
  sucata: 'Sucata a devolver',
  ok: 'Em dia',
};

export const TOM_SITUACAO: Record<SituacaoEquipe, 'danger' | 'warning' | 'info' | 'success'> = {
  negativo: 'danger',
  atrasada: 'warning',
  retirar: 'info',
  sucata: 'warning',
  ok: 'success',
};

/** A pendência mais grave da equipe: é o que o almoxarife precisa resolver primeiro. */
export function situacaoDaEquipe(e: EquipeNoBalcao): SituacaoEquipe {
  if (e.negativosNoCaminhao > 0) return 'negativo';
  if (e.retiradaAtrasada) return 'atrasada';
  if (e.itensRetirada > 0) return 'retirar';
  if (e.sucatasNoCaminhao > 0) return 'sucata';
  return 'ok';
}

export const ORDEM_SITUACAO: SituacaoEquipe[] = ['negativo', 'atrasada', 'retirar', 'sucata', 'ok'];

export interface PorEquipe {
  equipe: string;
  idEquipe: string;
  quantidade: number;
}

/** Um material somado em todos os caminhões. */
export interface LinhaMaterial {
  id: string;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  condicao: 'NOVO' | 'SUCATA';
  total: number;
  negativo: boolean;
  equipes: PorEquipe[];
  obras: number;
  itens: ItemNasEquipes[];
}

/** Uma obra com o material dela espalhado pelos caminhões. */
export interface LinhaObra {
  id: string;
  idObra: string | null;
  numeroObra: string | null;
  tituloObra: string | null;
  equipes: string[];
  materiais: number;
  sucatas: number;
  itens: ItemNasEquipes[];
}

export function porMaterial(itens: readonly ItemNasEquipes[]): LinhaMaterial[] {
  const mapa = new Map<string, LinhaMaterial>();
  for (const i of itens) {
    const id = `${i.idMaterial}:${i.condicao}`;
    let l = mapa.get(id);
    if (!l) {
      l = { id, idMaterial: i.idMaterial, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, condicao: i.condicao,
        total: 0, negativo: false, equipes: [], obras: 0, itens: [] };
      mapa.set(id, l);
    }
    l.total += i.quantidade;
    l.itens.push(i);
    if (i.quantidade < 0) l.negativo = true;
    const eq = l.equipes.find((e) => e.idEquipe === i.idEquipe);
    if (eq) eq.quantidade += i.quantidade;
    else l.equipes.push({ idEquipe: i.idEquipe, equipe: i.equipe, quantidade: i.quantidade });
  }
  for (const l of mapa.values()) {
    l.obras = new Set(l.itens.map((i) => i.idObra).filter(Boolean)).size;
    l.equipes.sort((a, b) => b.quantidade - a.quantidade);
    l.total = arredondar(l.total);
  }
  return [...mapa.values()].sort((a, b) => Number(b.negativo) - Number(a.negativo) || a.descricao.localeCompare(b.descricao));
}

export function porObra(itens: readonly ItemNasEquipes[]): LinhaObra[] {
  const mapa = new Map<string, LinhaObra>();
  for (const i of itens) {
    if (i.quantidade <= 0) continue;
    const id = i.idObra ?? 'livre';
    let l = mapa.get(id);
    if (!l) {
      l = { id, idObra: i.idObra, numeroObra: i.numeroObra, tituloObra: i.tituloObra, equipes: [], materiais: 0, sucatas: 0, itens: [] };
      mapa.set(id, l);
    }
    l.itens.push(i);
    if (!l.equipes.includes(i.equipe)) l.equipes.push(i.equipe);
  }
  for (const l of mapa.values()) {
    l.materiais = new Set(l.itens.map((i) => `${i.idMaterial}:${i.condicao}`)).size;
    l.sucatas = new Set(l.itens.filter((i) => i.condicao === 'SUCATA').map((i) => i.idMaterial)).size;
    l.equipes.sort();
    l.itens.sort((a, b) => a.descricao.localeCompare(b.descricao) || a.equipe.localeCompare(b.equipe));
  }
  // "Sem obra" por último: é o material solto da equipe, não pertence a nenhuma obra.
  return [...mapa.values()].sort((a, b) => Number(!a.idObra) - Number(!b.idObra) || (a.numeroObra ?? '').localeCompare(b.numeroObra ?? ''));
}

/** Caminhão de uma equipe separado por obra (sem obra por último, negativos à parte). */
export function caminhaoDaEquipe(itens: readonly ItemNasEquipes[], idEquipe: string): LinhaObra[] {
  const daEquipe = itens.filter((i) => i.idEquipe === idEquipe);
  const grupos = porObra(daEquipe);
  const negativos = daEquipe.filter((i) => i.quantidade < 0);
  if (negativos.length) {
    grupos.unshift({ id: 'negativos', idObra: null, numeroObra: null, tituloObra: 'Saldo negativo', equipes: [], materiais: negativos.length,
      sucatas: 0, itens: negativos });
  }
  return grupos;
}

function arredondar(v: number): number {
  return Math.round(v * 1000) / 1000;
}
