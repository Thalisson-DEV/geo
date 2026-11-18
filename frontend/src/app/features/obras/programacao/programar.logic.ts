import { PlanejamentoObra } from '../../../core/models/obras-planejamento.models';
import { rotuloVao } from '../planejamento/planejamento.logic';

/** Ponto ou vão do planejamento com serviço ainda por programar. */
export interface LocalProgramavel {
  id: string;
  rotulo: string;
  kits: string[];
  servicos: number;
  idsItens: string[];
}

/**
 * Locais com serviço pendente, na ordem do planejamento. Vão todos os itens pendentes do kit: o servidor separa o
 * que já foi programado e o material acompanha o serviço, como na seleção pela árvore do planejamento.
 */
export function locaisProgramaveis(plano: PlanejamentoObra): LocalProgramavel[] {
  const pontos = new Map(plano.pontos.map((p) => [p.id, p]));
  const rotulos = new Map<string, string>([
    ...plano.pontos.map((p): [string, string] => [p.id, `P${p.numero}`]),
    ...plano.vaos.map((v): [string, string] => [v.id, `Vão ${rotuloVao(v, pontos)}`])
  ]);
  const locais = new Map<string, LocalProgramavel>();
  for (const kit of plano.kits) {
    const idLocal = kit.idPonto ?? kit.idVao;
    if (!idLocal || kit.executadoAntes) continue;
    const pendentes = kit.itens.filter((i) => i.status === 'PENDENTE');
    const servicos = pendentes.filter((i) => i.tipo === 'SERVICO').length;
    if (!servicos) continue;
    const local = locais.get(idLocal) ?? { id: idLocal, rotulo: rotulos.get(idLocal) ?? 'Local', kits: [], servicos: 0, idsItens: [] };
    local.kits.push(kit.codigo);
    local.servicos += servicos;
    local.idsItens.push(...pendentes.map((i) => i.id));
    locais.set(idLocal, local);
  }
  const ordem = [...plano.pontos.map((p) => p.id), ...plano.vaos.map((v) => v.id)];
  return [...locais.values()].sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id));
}
