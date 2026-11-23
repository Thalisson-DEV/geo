import { GeoTone } from '@geo/ui';

import {
  ItemOrcamentoObraResponse,
  OrcamentoObraResponse,
  OrigemOrcamento,
  SituacaoItemOrcamento
} from '../../../core/models/obras.models';

export type FiltroSituacao = 'TODOS' | SituacaoItemOrcamento;

export const SITUACAO_ORCAMENTO: Record<SituacaoItemOrcamento, { rotulo: string; tom: GeoTone; icone: string; ajuda: string }> = {
  ACIMA: {
    rotulo: 'Acima do orçado',
    tom: 'warning',
    icone: 'pi pi-arrow-up',
    ajuda: 'O planejado, o executado ou o medido passou da quantidade orçada.'
  },
  FORA_DO_ORCAMENTO: {
    rotulo: 'Fora do orçamento',
    tom: 'danger',
    icone: 'pi pi-exclamation-circle',
    ajuda: 'Está no planejamento, na execução ou na medição, mas não no orçamento.'
  },
  NAO_PLANEJADO: {
    rotulo: 'Não planejado',
    tom: 'info',
    icone: 'pi pi-clock',
    ajuda: 'Orçado e ainda sem kit nos pontos do planejamento.'
  },
  DENTRO: {
    rotulo: 'Dentro do orçado',
    tom: 'success',
    icone: 'pi pi-check',
    ajuda: 'Planejado, executado e medido dentro do orçado.'
  },
  SEM_ORCADO: {
    rotulo: 'Sem orçado',
    tom: 'neutral',
    icone: 'pi pi-minus',
    ajuda: 'O orçamento não traz itens deste tipo: não há com o que comparar.'
  }
};

export const ORIGEM_ORCAMENTO: Record<OrigemOrcamento, { rotulo: string; icone: string }> = {
  IMPORTACAO: { rotulo: 'Importado de planilha', icone: 'pi pi-file-import' },
  PLANEJAMENTO: { rotulo: 'Gerado do planejamento', icone: 'pi pi-sitemap' },
  MANUAL: { rotulo: 'Lançado na ficha', icone: 'pi pi-pencil' },
  PLANILHA_MEDICAO: { rotulo: 'Planilha do relatório de medição', icone: 'pi pi-table' }
};

/** Itens de um tipo, com o filtro de situação. */
export function itensDoTipo(
  orcamento: OrcamentoObraResponse | null | undefined,
  tipo: 'SERVICO' | 'MATERIAL',
  filtro: FiltroSituacao
): ItemOrcamentoObraResponse[] {
  return (orcamento?.itens ?? []).filter((i) => i.tipo === tipo && (filtro === 'TODOS' || i.situacao === filtro));
}

/** Contagem por situação de um tipo, para os atalhos acima da tabela. */
export function contarSituacoes(
  orcamento: OrcamentoObraResponse | null | undefined,
  tipo: 'SERVICO' | 'MATERIAL'
): Record<FiltroSituacao, number> {
  const contagem: Record<FiltroSituacao, number> = { TODOS: 0, ACIMA: 0, FORA_DO_ORCAMENTO: 0, NAO_PLANEJADO: 0, DENTRO: 0, SEM_ORCADO: 0 };
  for (const item of orcamento?.itens ?? []) {
    if (item.tipo !== tipo) continue;
    contagem.TODOS++;
    contagem[item.situacao]++;
  }
  return contagem;
}

/** Quanto do orçado já está planejado ou medido, em % (0 quando não há orçado). */
export function percentual(parte: number | null | undefined, total: number | null | undefined): number {
  if (!total) return 0;
  return Math.round(((parte ?? 0) / total) * 100);
}

/** Orçado que ainda falta medir, na unidade do item; nulo quando o item não é orçado. */
export function saldoQuantidade(item: ItemOrcamentoObraResponse): number | null {
  if (item.orcadoQuantidade == null) return null;
  return item.orcadoQuantidade - (item.medidoQuantidade ?? 0);
}

/** Frase única com o que pede atenção no orçamento; nula quando está tudo dentro. */
export function resumoAtencao(orcamento: OrcamentoObraResponse | null | undefined): string | null {
  if (!orcamento?.possuiOrcamento) return null;
  const c = orcamento.contagens;
  const partes: string[] = [];
  if (c.acima) partes.push(`${c.acima} ${c.acima === 1 ? 'item acima' : 'itens acima'} do orçado`);
  if (c.foraDoOrcamento) partes.push(`${c.foraDoOrcamento} fora do orçamento`);
  if (c.semReferencia) partes.push(`${c.semReferencia} sem vínculo com o contrato ou o catálogo`);
  return partes.length ? partes.join(' · ') : null;
}
