/**
 * Formatação usada pelo painel do financeiro (cartões, leituras, tabelas e análises). Fica num
 * arquivo próprio porque a análise pura (`analise-financeiro.ts`), as vistas do drill-down e o
 * componente escrevem os mesmos números do mesmo jeito.
 */

export function formatarMoeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  });
}

/**
 * Valor abreviado para cartão e texto corrido: `R$ 1,2 mil`, `R$ 3,4 mi`. Sete dígitos num cartão
 * ficam ilegíveis muito antes de ficarem imprecisos.
 */
export function formatarMoedaCompacta(valor: number | null | undefined): string {
  const numero = valor ?? 0;
  const absoluto = Math.abs(numero);
  if (absoluto >= 1_000_000) {
    return `R$ ${(numero / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (absoluto >= 1_000) {
    return `R$ ${(numero / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return formatarMoeda(numero);
}

export function formatarPercentual(valor: number | null | undefined, casas = 1): string {
  return `${(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;
}

/** Variação com sinal: `+12,5%`, `-3%`. */
export function formatarVariacao(valor: number, casas = 1): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: casas, signDisplay: 'always' })}%`;
}

export function umaCasa(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** `1 pedido`, `3 pedidos` — com o número no formato brasileiro. */
export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}
