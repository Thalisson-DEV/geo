import { EvidenciaVisita } from '../../../core/models/obras-documentacao.models';

export const LIMITE_EVIDENCIA_BYTES = 15 * 1024 * 1024;
export const TIPOS_EVIDENCIA = ['image/jpeg', 'image/png', 'application/pdf'];

/** Evidência escolhida no aparelho e ainda não enviada; vai junto quando a visita for salva. */
export interface EvidenciaPendente {
  chave: string;
  /** Sem pergunta, é evidência geral da visita. */
  idPergunta: string | null;
  arquivo: File;
  /** Endereço local da foto, para a miniatura; nulo no PDF. */
  url: string | null;
}

/** Por que o arquivo não pode ser anexado; `null` quando pode. O celular às vezes manda a foto sem tipo: vale a extensão. */
export function problemaDoArquivo(arquivo: File, limite = LIMITE_EVIDENCIA_BYTES): string | null {
  const tipo = arquivo.type || tipoPelaExtensao(arquivo.name);
  if (!TIPOS_EVIDENCIA.includes(tipo)) return `"${arquivo.name}" não foi anexado: envie foto em JPG ou PNG, ou um PDF.`;
  if (arquivo.size > limite) return `"${arquivo.name}" passa de ${Math.round(limite / 1024 / 1024)} MB.`;
  return null;
}

function tipoPelaExtensao(nome: string): string {
  const ext = nome.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return ext === 'pdf' ? 'application/pdf' : '';
}

export function novaPendente(arquivo: File, idPergunta: string | null): EvidenciaPendente {
  const foto = arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf');
  return { chave: crypto.randomUUID(), idPergunta, arquivo, url: foto && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(arquivo) : null };
}

export function descricaoDaEvidencia(e: EvidenciaVisita): string {
  const tipo = e.foto ? 'foto' : 'PDF';
  return e.legenda ? `${tipo} ${e.nomeArquivo}, ${e.legenda}` : `${tipo} ${e.nomeArquivo}`;
}

/** Evidências agrupadas pela pergunta; a chave nula guarda as gerais. */
export function porPergunta<T extends { idPergunta?: string | null }>(lista: T[]): Map<string | null, T[]> {
  const mapa = new Map<string | null, T[]>();
  for (const item of lista) {
    // A API omite campo nulo: sem pergunta pode chegar como `undefined`.
    const chave = item.idPergunta ?? null;
    const atual = mapa.get(chave) ?? [];
    atual.push(item);
    mapa.set(chave, atual);
  }
  return mapa;
}
