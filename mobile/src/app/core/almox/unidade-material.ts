/**
 * Equivalências de unidade do material (iguais às do web). O saldo fica na unidade do cadastro;
 * a pessoa pode informar em outra (cabo em KG, fita em M) e o servidor converte. Aqui só a
 * prévia, com o mesmo arredondamento do servidor (3 casas).
 */
export interface Equivalencia {
  unidade: string;
  quantidadeUnidade: number;
  quantidadeBase: number;
}

export interface ComUnidade {
  unidadeMedida?: string | null;
  equivalencias?: Equivalencia[] | null;
}

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const NUMERO_FINO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

export function unidadeBase(m: ComUnidade | null | undefined): string {
  return (m?.unidadeMedida || 'UN').toUpperCase();
}

export function unidadesDo(m: ComUnidade | null | undefined): string[] {
  return [unidadeBase(m), ...(m?.equivalencias ?? []).map(e => e.unidade)];
}

export function equivalenciaDe(m: ComUnidade | null | undefined, unidade: string | null | undefined): Equivalencia | null {
  if (!m || !unidade) return null;
  const alvo = unidade.toUpperCase();
  if (alvo === unidadeBase(m)) return null;
  return (m.equivalencias ?? []).find(e => e.unidade.toUpperCase() === alvo) ?? null;
}

export function paraBase(m: ComUnidade | null | undefined, quantidade: number, unidade: string | null | undefined): number {
  const eq = equivalenciaDe(m, unidade);
  return eq ? Math.round(((quantidade * eq.quantidadeBase) / eq.quantidadeUnidade) * 1000) / 1000 : quantidade;
}

export function daBase(m: ComUnidade | null | undefined, base: number, unidade: string | null | undefined): number {
  const eq = equivalenciaDe(m, unidade);
  return eq ? Math.round(((base * eq.quantidadeUnidade) / eq.quantidadeBase) * 1000) / 1000 : base;
}

export function frase(eq: Equivalencia, base: string): string {
  return `${NUMERO_FINO.format(eq.quantidadeUnidade)} ${eq.unidade} = ${NUMERO_FINO.format(eq.quantidadeBase)} ${base}`;
}

export function numero(n: number): string {
  return NUMERO.format(n);
}
