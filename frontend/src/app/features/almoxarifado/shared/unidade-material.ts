import { MaterialResponse, UnidadeEquivalente } from '../../../core/models/almoxarifado.models';

/**
 * Equivalências de unidade do material. O saldo fica sempre na unidade do cadastro; a pessoa
 * pode informar em outra (ex.: cabo em KG, fita em M) e o servidor converte. Aqui só se calcula
 * a prévia que aparece na tela, com o mesmo arredondamento do servidor (3 casas, meio para cima).
 */
type MaterialComUnidade = Pick<MaterialResponse, 'unidadeMedida' | 'equivalencias'>;

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const NUMERO_FINO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

export function unidadeBase(material: MaterialComUnidade | null | undefined): string {
  return (material?.unidadeMedida || 'UN').toUpperCase();
}

export function temEquivalencias(material: MaterialComUnidade | null | undefined): boolean {
  return (material?.equivalencias?.length ?? 0) > 0;
}

/** Unidades em que a quantidade pode ser informada: a do material primeiro. */
export function unidadesDoMaterial(material: MaterialComUnidade | null | undefined): string[] {
  return [unidadeBase(material), ...(material?.equivalencias ?? []).map((e) => e.unidade)];
}

export function equivalenciaDe(material: MaterialComUnidade | null | undefined, unidade: string | null | undefined): UnidadeEquivalente | null {
  if (!material || !unidade) return null;
  const alvo = unidade.toUpperCase();
  if (alvo === unidadeBase(material)) return null;
  return (material.equivalencias ?? []).find((e) => e.unidade.toUpperCase() === alvo) ?? null;
}

/** Quantidade na unidade do material, como o servidor vai gravar. */
export function paraUnidadeBase(material: MaterialComUnidade | null | undefined, quantidade: number | null | undefined, unidade: string | null | undefined): number | null {
  if (quantidade === null || quantidade === undefined || Number.isNaN(quantidade)) return null;
  const eq = equivalenciaDe(material, unidade);
  if (!eq) return quantidade;
  return Math.round(((quantidade * eq.quantidadeBase) / eq.quantidadeUnidade) * 1000) / 1000;
}

/** Converte da unidade do material para a escolhida (para mostrar o que falta em KG, por ex.). */
export function daUnidadeBase(material: MaterialComUnidade | null | undefined, quantidadeBase: number, unidade: string | null | undefined): number {
  const eq = equivalenciaDe(material, unidade);
  if (!eq) return quantidadeBase;
  return Math.round(((quantidadeBase * eq.quantidadeUnidade) / eq.quantidadeBase) * 1000) / 1000;
}

export function numero(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : NUMERO.format(n);
}

/** "1 KG = 4,2 MT" ou "20 M = 1 UN", exatamente como foi cadastrada. */
export function fraseEquivalencia(eq: Pick<UnidadeEquivalente, 'unidade' | 'quantidadeUnidade' | 'quantidadeBase'>, base: string): string {
  return `${NUMERO_FINO.format(eq.quantidadeUnidade)} ${eq.unidade} = ${NUMERO_FINO.format(eq.quantidadeBase)} ${base}`;
}

/** "126 MT (informado: 30 KG)" quando houve conversão; senão só "126 MT". */
export function quantidadeComInformada(
  quantidade: number,
  unidade: string | null | undefined,
  informada?: number | null,
  unidadeInformada?: string | null
): string {
  const principal = `${numero(quantidade)} ${(unidade || 'UN').toUpperCase()}`;
  return unidadeInformada && informada !== null && informada !== undefined
    ? `${principal} (informado: ${numero(informada)} ${unidadeInformada})`
    : principal;
}
