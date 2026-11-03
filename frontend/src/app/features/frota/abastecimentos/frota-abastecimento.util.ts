import { CesTone } from '@ces/ui';
import { FaturaPosto, ItemAbastecimento, SituacaoAbastecimento, SituacaoFaturaPosto } from '../../../core/models/frota-abastecimento.models';

/** "5574999990000" → "(74) 99999-0000"; números de outro país ficam com o DDI. */
export function formatarWhatsapp(numero: string | null | undefined): string {
  if (!numero) return '';
  const d = numero.replace(/\D/g, '');
  const local = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : null;
  if (!local) return `+${d}`;
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  return resto.length === 9 ? `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}` : `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}

export const TOM_SITUACAO: Record<SituacaoAbastecimento, CesTone> = {
  AGUARDANDO_APROVACAO: 'warning',
  APROVADA: 'info',
  REPROVADA: 'danger',
  LIBERADA: 'brand',
  REALIZADA: 'success',
  CANCELADA: 'neutral',
  VENCIDA: 'neutral'
};

export const ICONE_SITUACAO: Record<SituacaoAbastecimento, string> = {
  AGUARDANDO_APROVACAO: 'pi-clock',
  APROVADA: 'pi-check',
  REPROVADA: 'pi-times',
  LIBERADA: 'pi-send',
  REALIZADA: 'pi-check-circle',
  CANCELADA: 'pi-ban',
  VENCIDA: 'pi-hourglass'
};

/** "há 5 min", "há 2 h", "há 3 dias" — para a fila mostrar há quanto tempo o pedido espera. */
export function haQuantoTempo(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return '';
  const minutos = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** "60 l" ou "60,5 l" (quantidade com a unidade do produto). */
export function quantidade(valor: number | null | undefined, unidade: string): string {
  if (valor === null || valor === undefined) return '—';
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade}`;
}

export function moeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** R$ por unidade com 3 casas, como no cupom. */
export function precoUnitario(valor: number | null | undefined, unidade: string): string {
  if (valor === null || valor === undefined) return '—';
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}/${unidade}`;
}

/** O item foi entregue com outro produto (ex.: S500 no lugar do S10). */
export function produtoTrocado(item: ItemAbastecimento): boolean {
  return !!item.idProduto && item.idProduto !== item.idProdutoPedido;
}

export const TOM_FATURA: Record<SituacaoFaturaPosto, CesTone> = {
  RASCUNHO: 'warning',
  CONFERIDA: 'info',
  ENVIADA_AO_FINANCEIRO: 'success'
};
export const ICONE_FATURA: Record<SituacaoFaturaPosto, string> = {
  RASCUNHO: 'pi-clock',
  CONFERIDA: 'pi-check',
  ENVIADA_AO_FINANCEIRO: 'pi-send'
};
/** "R$ 12,40 a mais na fatura", "R$ 3,00 a menos" ou "Bate com a fatura". */
export function textoDiferenca(diferenca: number): string {
  if (Math.abs(diferenca) < 0.005) return 'Bate com a fatura';
  return `${moeda(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais na fatura' : 'a menos na fatura'}`;
}

/** "Falta conferir" diz o que fazer; as demais situações usam o rótulo do backend. */
export function rotuloFatura(f: Pick<FaturaPosto, 'situacao' | 'situacaoRotulo'>): string {
  return f.situacao === 'RASCUNHO' ? 'Falta conferir' : f.situacaoRotulo;
}
