export interface GeoPdfPonto {
  x: number;
  y: number;
}

export interface GeoPdfRegiao {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type GeoPdfRotacao = 0 | 90 | 180 | 270;

export const GEO_PDF_ZOOM_MINIMO = 0.25;
export const GEO_PDF_ZOOM_MAXIMO = 4;

/**
 * As posições ficam em [0,1] da página sem a rotação salva, para que girar nunca altere o dado.
 * Estas funções convertem entre esse espaço e o que aparece na tela.
 */
export function geoPdfParaTela(ponto: GeoPdfPonto, rotacao: number): GeoPdfPonto {
  switch (normalizarRotacao(rotacao)) {
    case 90:
      return { x: 1 - ponto.y, y: ponto.x };
    case 180:
      return { x: 1 - ponto.x, y: 1 - ponto.y };
    case 270:
      return { x: ponto.y, y: 1 - ponto.x };
    default:
      return { x: ponto.x, y: ponto.y };
  }
}

export function geoPdfDaTela(ponto: GeoPdfPonto, rotacao: number): GeoPdfPonto {
  switch (normalizarRotacao(rotacao)) {
    case 90:
      return { x: ponto.y, y: 1 - ponto.x };
    case 180:
      return { x: 1 - ponto.x, y: 1 - ponto.y };
    case 270:
      return { x: 1 - ponto.y, y: ponto.x };
    default:
      return { x: ponto.x, y: ponto.y };
  }
}

export function normalizarRotacao(rotacao: number): GeoPdfRotacao {
  return (((Math.round(rotacao / 90) * 90) % 360) + 360) % 360 as GeoPdfRotacao;
}

export function limitarZoom(zoom: number): number {
  return Math.min(GEO_PDF_ZOOM_MAXIMO, Math.max(GEO_PDF_ZOOM_MINIMO, zoom));
}

export interface GeoPdfTrechoTexto {
  texto: string;
  x: number;
  y: number;
  altura: number;
}

/**
 * Monta o texto de uma região na ordem de leitura: linhas de cima para baixo e, em cada linha, da esquerda
 * para a direita. Trechos cuja altura se sobrepõe são tratados como a mesma linha.
 */
export function geoPdfOrdenarTexto(trechos: readonly GeoPdfTrechoTexto[]): string {
  const ordenados = [...trechos].filter((t) => t.texto.trim()).sort((a, b) => a.y - b.y);
  const linhas: GeoPdfTrechoTexto[][] = [];
  for (const trecho of ordenados) {
    const linha = linhas[linhas.length - 1];
    if (linha && Math.abs(linha[0].y - trecho.y) <= Math.max(linha[0].altura, trecho.altura) * 0.6) {
      linha.push(trecho);
    } else {
      linhas.push([trecho]);
    }
  }
  return linhas
    .map((linha) => linha.sort((a, b) => a.x - b.x).map((t) => t.texto.trim()).join(' '))
    .join('\n');
}
