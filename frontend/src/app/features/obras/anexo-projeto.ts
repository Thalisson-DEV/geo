import { AnexoObraResponse } from '../../core/models/obras.models';

/**
 * Projeto da obra em CAD (DXF ou DWG) e a planta em PDF que o sistema gera dele. As regras seguem as do backend
 * (`PlantaDoProjetoCad`): a planta se chama `<arquivo>-planta.pdf` e a observação começa por "Planta gerada do arquivo CAD".
 */
const PREFIXO_PLANTA_GERADA = 'Planta gerada do arquivo CAD';

export function ehPdf(anexo: Pick<AnexoObraResponse, 'nomeArquivo' | 'contentType'>): boolean {
  return anexo.contentType === 'application/pdf' || anexo.nomeArquivo.toLowerCase().endsWith('.pdf');
}

export function ehArquivoCad(nomeArquivo: string): boolean {
  return /\.(dxf|dwg)$/i.test(nomeArquivo);
}

export function ehPlantaGerada(anexo: Pick<AnexoObraResponse, 'nomeArquivo' | 'contentType' | 'observacoes'>): boolean {
  return ehPdf(anexo) && (anexo.observacoes ?? '').startsWith(PREFIXO_PLANTA_GERADA);
}

export function nomePlantaDoCad(nomeCad: string): string {
  return nomeCad.replace(/\.(dxf|dwg)$/i, '') + '-planta.pdf';
}
