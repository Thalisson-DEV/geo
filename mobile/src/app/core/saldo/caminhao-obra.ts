import { SaldoObraLocal } from '../db/models';

export interface ItemCaminhao {
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  quantidade: number;
}

/** Um bloco do caminhão: uma obra, o material livre ou a sucata a devolver. */
export interface GrupoCaminhao {
  chave: string;
  tipo: 'OBRA' | 'LIVRE' | 'SUCATA';
  idObra: string | null;
  titulo: string;
  /** Obra programada para hoje: vem primeiro e com selo. */
  hoje: boolean;
  itens: ItemCaminhao[];
}

/**
 * O caminhão como a equipe pensa: primeiro as obras de hoje, depois as outras obras, o material livre e, por último,
 * a sucata (que volta ao almoxarifado no fim do dia).
 */
export function caminhaoPorObra(saldos: SaldoObraLocal[], obrasDeHoje: ReadonlySet<string>): GrupoCaminhao[] {
  const grupos = new Map<string, GrupoCaminhao>();
  for (const s of saldos) {
    if (!(s.quantidade > 0)) continue;
    const sucata = s.condicao === 'SUCATA';
    const chave = sucata ? 'sucata' : s.idObra ?? 'livre';
    const grupo = grupos.get(chave) ?? {
      chave,
      tipo: sucata ? 'SUCATA' : s.idObra ? 'OBRA' : 'LIVRE',
      idObra: sucata ? null : s.idObra,
      titulo: sucata ? 'Sucata para devolver' : s.idObra ? `Obra ${s.numeroObra ?? 'sem número'}` : 'Sem obra',
      hoje: !sucata && !!s.idObra && obrasDeHoje.has(s.idObra),
      itens: [],
    } satisfies GrupoCaminhao;
    const existente = grupo.itens.find(i => i.idMaterial === s.idMaterial);
    if (existente) existente.quantidade = arred(existente.quantidade + s.quantidade);
    else grupo.itens.push({ idMaterial: s.idMaterial, codigo: s.codigo, descricao: s.descricao, unidade: s.unidadeMedida ?? null, quantidade: s.quantidade });
    grupos.set(chave, grupo);
  }
  const ordem = (g: GrupoCaminhao) => (g.tipo === 'OBRA' ? (g.hoje ? 0 : 1) : g.tipo === 'LIVRE' ? 2 : 3);
  return [...grupos.values()]
    .map(g => ({ ...g, itens: [...g.itens].sort((a, b) => a.descricao.localeCompare(b.descricao)) }))
    .sort((a, b) => ordem(a) - ordem(b) || a.titulo.localeCompare(b.titulo));
}

export interface ResumoCaminhao {
  materiais: number;
  obras: number;
  sucatas: number;
}

export function resumoCaminhao(grupos: GrupoCaminhao[]): ResumoCaminhao {
  const materiais = new Set<string>();
  for (const g of grupos) if (g.tipo !== 'SUCATA') g.itens.forEach(i => materiais.add(i.idMaterial));
  return {
    materiais: materiais.size,
    obras: grupos.filter(g => g.tipo === 'OBRA').length,
    sucatas: grupos.find(g => g.tipo === 'SUCATA')?.itens.length ?? 0,
  };
}

function arred(n: number): number {
  return Math.round(n * 1000) / 1000;
}
