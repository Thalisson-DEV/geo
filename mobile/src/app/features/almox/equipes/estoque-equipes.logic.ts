import { CondicaoBalcao, EquipeNoBalcao, ItemNasEquipes } from '../../../core/almox/balcao.models';

export type AtalhoEquipes = 'todas' | 'negativo' | 'sucata' | 'retirada';

/** Atalho que a equipe atende (a contagem de cada chip usa a mesma regra). */
export function atendeAtalho(e: EquipeNoBalcao, atalho: AtalhoEquipes): boolean {
  switch (atalho) {
    case 'negativo': return e.negativosNoCaminhao > 0;
    case 'sucata': return e.sucatasNoCaminhao > 0;
    case 'retirada': return e.itensRetirada > 0;
    default: return true;
  }
}

export function normalizar(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface ObraNoCaminhao {
  chave: string;
  numeroObra: string | null;
  tituloObra: string | null;
  negativo: boolean;
  itens: ItemNasEquipes[];
}

/** O caminhão da equipe por obra; os saldos negativos (sem obra) vêm primeiro, porque pedem ação. */
export function obrasDaEquipe(itens: ItemNasEquipes[], idEquipe: string): ObraNoCaminhao[] {
  const mapa = new Map<string, ObraNoCaminhao>();
  for (const i of itens) {
    if (i.idEquipe !== idEquipe) continue;
    const negativo = i.quantidade < 0;
    const chave = negativo ? 'negativo' : i.idObra ?? 'sem-obra';
    const g = mapa.get(chave) ?? { chave, numeroObra: negativo ? null : i.numeroObra, tituloObra: negativo ? null : i.tituloObra, negativo, itens: [] };
    g.itens.push(i);
    mapa.set(chave, g);
  }
  return [...mapa.values()].sort((a, b) =>
    Number(b.negativo) - Number(a.negativo) || (a.numeroObra ?? '~').localeCompare(b.numeroObra ?? '~'));
}

export interface MaterialNasEquipes {
  chave: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  condicao: CondicaoBalcao;
  total: number;
  negativo: number;
  equipes: number;
  linhas: ItemNasEquipes[];
}

/** Soma de cada material (e condição) em todos os caminhões; negativos somados à parte. */
export function porMaterial(itens: ItemNasEquipes[]): MaterialNasEquipes[] {
  const mapa = new Map<string, MaterialNasEquipes>();
  for (const i of itens) {
    const chave = `${i.idMaterial}|${i.condicao}`;
    const m = mapa.get(chave) ?? { chave, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, condicao: i.condicao, total: 0, negativo: 0, equipes: 0, linhas: [] };
    if (i.quantidade < 0) m.negativo += i.quantidade;
    else m.total += i.quantidade;
    m.linhas.push(i);
    mapa.set(chave, m);
  }
  for (const m of mapa.values()) {
    m.equipes = new Set(m.linhas.map(l => l.idEquipe)).size;
    m.linhas.sort((a, b) => a.equipe.localeCompare(b.equipe) || (a.numeroObra ?? '~').localeCompare(b.numeroObra ?? '~'));
  }
  return [...mapa.values()].sort((a, b) => Number(b.negativo < 0) - Number(a.negativo < 0) || a.descricao.localeCompare(b.descricao));
}

/** Uma linha de apoio da equipe: o que o caminhão leva agora. */
export function textoCaminhao(e: EquipeNoBalcao): string {
  if (!e.itensNoCaminhao && !e.negativosNoCaminhao) return 'Caminhão vazio';
  const partes: string[] = [];
  if (e.itensNoCaminhao) {
    partes.push(`${e.itensNoCaminhao} ${e.itensNoCaminhao === 1 ? 'material' : 'materiais'}`
      + (e.obrasNoCaminhao ? ` em ${e.obrasNoCaminhao} ${e.obrasNoCaminhao === 1 ? 'obra' : 'obras'}` : ''));
  }
  if (e.sucatasNoCaminhao) partes.push(`${e.sucatasNoCaminhao} de sucata`);
  return partes.join(' · ');
}
