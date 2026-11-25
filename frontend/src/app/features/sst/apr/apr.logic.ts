import { EstruturaApr } from '../../../core/models/sst-apr.models';

export type ListaApr = 'riscos' | 'medidas' | 'verificacoes';

export const LIMITE_TEXTO_APR = 200;
const NOME: Record<ListaApr, string> = { riscos: 'risco', medidas: 'medida', verificacoes: 'verificação' };

/** O mesmo que o servidor recusa, para avisar antes de salvar; vazio = pode salvar. */
export function problemaDaApr(e: EstruturaApr): string | null {
  if (!e.riscos.length) return 'Cadastre ao menos um risco.';
  if (!e.medidas.length) return 'Cadastre ao menos uma medida de controle.';
  if (!e.verificacoes.length) return 'Cadastre ao menos uma verificação: sem ela a equipe não consegue concluir a APR.';
  for (const lista of ['riscos', 'medidas', 'verificacoes'] as ListaApr[]) {
    const vistos = new Set<string>();
    for (const item of e[lista]) {
      const texto = item.texto.trim().replace(/\s+/g, ' ');
      if (!texto) return `Escreva o texto de cada ${NOME[lista]} ou remova a linha vazia.`;
      if (texto.length > LIMITE_TEXTO_APR) return `"${texto.slice(0, 40)}…" passa de ${LIMITE_TEXTO_APR} caracteres.`;
      const chave = texto.toLocaleLowerCase('pt-BR');
      if (vistos.has(chave)) return `"${texto}" aparece duas vezes em ${lista === 'riscos' ? 'Riscos' : lista === 'medidas' ? 'Medidas' : 'Verificações'}.`;
      vistos.add(chave);
    }
  }
  return null;
}

/** Tira a medida da lista e dos riscos que a marcavam junto. */
export function removerMedida(e: EstruturaApr, id: string): EstruturaApr {
  return {
    ...e,
    medidas: e.medidas.filter(m => m.id !== id),
    riscos: e.riscos.map(r => (r.medidas.includes(id) ? { ...r, medidas: r.medidas.filter(x => x !== id) } : r))
  };
}

export function mover<T>(lista: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

/** Riscos que marcam a medida junto, para mostrar na linha da medida. */
export function riscosQueMarcam(e: EstruturaApr, idMedida: string): string[] {
  return e.riscos.filter(r => r.medidas.includes(idMedida)).map(r => r.texto.trim()).filter(Boolean);
}
