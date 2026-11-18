import { AprovarSolicitacaoRequest, ItemSolicitacaoResponse, MaterialResponse } from '../../../core/models/almoxarifado.models';

/** Um material na aprovação; `idItem` nulo quando o gestor incluiu na hora. */
export interface LinhaAprovacao {
  readonly chave: string;
  readonly idItem: string | null;
  readonly material: MaterialResponse;
  /** O que a equipe pediu (0 no material incluído na aprovação). */
  readonly pedido: number;
  readonly quantidade: number | null;
  readonly removido: boolean;
}

type AjustesAprovacao = Pick<AprovarSolicitacaoRequest, 'itensEditados' | 'itensAdicionados' | 'itensRemovidos'>;

export const QUANTIDADE_MINIMA = 0.001;

export function rascunhoDaAprovacao(itens: readonly ItemSolicitacaoResponse[] | null | undefined): LinhaAprovacao[] {
  return (itens ?? []).map((i) => ({
    chave: i.id,
    idItem: i.id,
    material: i.material,
    pedido: Number(i.quantidade) || 0,
    quantidade: Number(i.quantidade) || 0,
    removido: false
  }));
}

export const linhaAlterada = (l: LinhaAprovacao): boolean => !l.idItem || l.removido || Number(l.quantidade) !== l.pedido;

/** O primeiro problema que impede aprovar com os ajustes, ou `null`. */
export function problemaDaAprovacao(linhas: readonly LinhaAprovacao[]): string | null {
  const ativas = linhas.filter((l) => !l.removido);
  if (!ativas.length) return 'A solicitação precisa ficar com ao menos um material. Para não atender nada, reprove.';
  const semQuantidade = ativas.find((l) => (Number(l.quantidade) || 0) < QUANTIDADE_MINIMA);
  if (semQuantidade) return `${semQuantidade.material.codigo}: informe a quantidade aprovada ou tire o material da solicitação.`;
  return null;
}

/** Só manda o que mudou: o item mantido com a mesma quantidade não vai no pedido. */
export function montarAjustesAprovacao(linhas: readonly LinhaAprovacao[]): AjustesAprovacao {
  const editados = linhas
    .filter((l) => l.idItem && !l.removido && Number(l.quantidade) !== l.pedido)
    .map((l) => ({ idItemSolicitacao: l.idItem!, novaQuantidade: Number(l.quantidade) }));
  const adicionados = linhas
    .filter((l) => !l.idItem && !l.removido)
    .map((l) => ({ idMaterial: l.material.id, quantidade: Number(l.quantidade) }));
  const removidos = linhas.filter((l) => l.idItem && l.removido).map((l) => l.idItem!);
  return {
    ...(editados.length ? { itensEditados: editados } : {}),
    ...(adicionados.length ? { itensAdicionados: adicionados } : {}),
    ...(removidos.length ? { itensRemovidos: removidos } : {})
  };
}
