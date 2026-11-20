/**
 * Utilitários de apresentação das respostas da Bússola: próximos passos clicáveis, citações de resultados
 * (rN) e versões de arquivos/artefatos refeitos na mesma conversa.
 */

const TITULO_PASSOS = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*pr[óo]ximos passos\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i;
const ITEM_LISTA = /^\s*(?:[-*+]|\d{1,2}[.)])\s+(.+?)\s*$/;
const MAXIMO_PASSOS = 4;

export interface TextoComPassos {
  corpo: string;
  passos: string[];
}

/**
 * Separa o bloco final "Próximos passos" (título seguido só de uma lista) do restante da resposta. Os itens viram
 * botões que enviam o pedido; se o bloco tiver texto solto ou não estiver no fim, a resposta fica como veio.
 */
export function separarProximosPassos(texto: string): TextoComPassos {
  const linhas = (texto ?? '').replace(/\r\n/g, '\n').split('\n');
  let inicio = -1;
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (TITULO_PASSOS.test(linhas[i])) {
      inicio = i;
      break;
    }
  }
  if (inicio < 0) return { corpo: texto, passos: [] };
  const passos: string[] = [];
  for (const linha of linhas.slice(inicio + 1)) {
    if (!linha.trim()) continue;
    const item = ITEM_LISTA.exec(linha);
    if (!item) return { corpo: texto, passos: [] };
    const limpo = limparPasso(item[1]);
    if (limpo) passos.push(limpo);
  }
  if (!passos.length) return { corpo: texto, passos: [] };
  const corpo = linhas.slice(0, inicio).join('\n').replace(/\s*(?:---|\*\*\*)?\s*$/, '').trimEnd();
  return { corpo, passos: passos.slice(0, MAXIMO_PASSOS) };
}

function limparPasso(valor: string): string {
  return valor
    .replace(/\*\*|__|`/g, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** Códigos de resultado (r1, r12...) citados entre parênteses, na ordem e sem repetir. */
export function codigosResultado(trecho: string): string[] {
  const codigos = trecho.match(/\br\d{1,4}\b/g) ?? [];
  return [...new Set(codigos)];
}

/** Citação de resultados entre parênteses: "(r2)", "(r3, r7)", "(r10 e r12)". */
export const CITACAO_RESULTADOS = /\s?\((?:\s*r\d{1,4}\s*(?:,|;|\be\b)?)+\s*\)/g;

/**
 * Mantém só a última versão de cada item com a mesma chave (arquivo refeito com o mesmo nome, artefato refeito
 * com o mesmo título), na posição da última versão.
 */
export function ultimasVersoes<T>(itens: readonly T[], chave: (item: T) => string): T[] {
  const ultimo = new Map<string, number>();
  itens.forEach((item, indice) => ultimo.set(chave(item), indice));
  return itens.filter((item, indice) => ultimo.get(chave(item)) === indice);
}

/** Tempo decorrido em texto curto: "45 s", "3 min 05 s", "1 h 02 min". */
export function tempoDecorrido(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutos = Math.floor(total / 60);
  if (minutos < 60) return `${minutos} min ${String(total % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}
