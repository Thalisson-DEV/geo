import { MovimentoEstoqueFrota, SaldoPecaFrota, TIPO_MOVIMENTO } from '../../../core/models/frota-pneu.models';

export const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const numero = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Unidades que se medem em fração. O resto (UN, JG, PC, CX, KIT) é contado inteiro. */
const FRACIONADAS = ['L', 'KG', 'M'];

/** Casas decimais que a quantidade aceita na unidade da peça; sem peça escolhida, as 3 do cadastro. */
export function casasDecimais(unidade: string | null | undefined): number {
  return !unidade || FRACIONADAS.includes(unidade.toUpperCase()) ? 3 : 0;
}

export type SituacaoItem = 'ABAIXO' | 'SEM_SALDO' | 'COM_SALDO';

/** Situação do item para a coluna, o filtro e a exportação. */
export function situacaoItem(s: SaldoPecaFrota): SituacaoItem {
  if (s.quantidade <= 0) return 'SEM_SALDO';
  return s.abaixoMinimo ? 'ABAIXO' : 'COM_SALDO';
}

/** Quanto o movimento somou ou tirou do almoxarifado: "+2 UN", "−2 UN" ou, na transferência, só "2 UN". */
export function quantidadeMovimento(m: MovimentoEstoqueFrota): string {
  const base = `${numero(m.quantidade)} ${m.unidade}`;
  const sinal = m.tipo === 'AJUSTE' ? (m.idEstoqueDestino ? 1 : -1) : TIPO_MOVIMENTO[m.tipo].sinal;
  return sinal > 0 ? `+${base}` : sinal < 0 ? `−${base}` : base;
}

/** Almoxarifado do movimento; na transferência, de onde saiu e para onde foi. */
export function localMovimento(m: MovimentoEstoqueFrota): string {
  if (m.estoqueOrigem && m.estoqueDestino) return `${m.estoqueOrigem} → ${m.estoqueDestino}`;
  return m.estoqueDestino ?? m.estoqueOrigem ?? '';
}
