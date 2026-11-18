import { HttpResponse } from '@angular/common/http';

import { getErrorMessage } from '../../core/models/shared.models';
import { FileDownloadUtil } from '../../core/utils/file-download.util';

/** Baixa o CSV com o nome que o servidor mandou (ou o padrão). Devolve false sem corpo. */
export function baixarCsv(resposta: HttpResponse<Blob>, nomePadrao: string): boolean {
  if (!resposta.body) return false;
  const disposicao = resposta.headers.get('content-disposition');
  const nome = (disposicao && /filename="?([^";]+)"?/i.exec(disposicao)?.[1]?.trim()) || nomePadrao;
  FileDownloadUtil.downloadBlob(resposta.body, nome);
  return true;
}

/** Na resposta em blob, o Problem Details do erro chega como Blob: lê o texto dele. */
export async function mensagemDoErroDeExportacao(erro: unknown): Promise<string> {
  const corpo = (erro as { error?: unknown })?.error;
  let mensagem = getErrorMessage(erro);
  if (corpo instanceof Blob) {
    try {
      const json = JSON.parse(await corpo.text());
      mensagem = json.detail || json.title || mensagem;
    } catch {
      // não era JSON
    }
  }
  return mensagem;
}
