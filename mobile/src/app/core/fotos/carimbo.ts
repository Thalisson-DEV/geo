/**
 * Carimbo das fotos de campo: o contexto (obra, ponto, etapa), a data e hora e a posição ficam
 * gravados na própria imagem, numa faixa no pé da foto. Assim a evidência continua legível fora do
 * sistema (no PDF do book, num envio por mensagem) e não depende dos metadados do arquivo.
 */

export interface DadosCarimbo {
  /** Linhas de contexto, da mais importante para a menos (ex.: "Obra 1234 · Ponto 4", "Depois"). */
  contexto: string[];
  /** Momento da captura (hora do aparelho). */
  data: Date;
  latitude?: number | null;
  longitude?: number | null;
  /** Precisão do GPS em metros. */
  precisao?: number | null;
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Linhas do carimbo, já formatadas em pt-BR. Sem GPS, diz isso em vez de omitir. */
export function linhasDoCarimbo(dados: DadosCarimbo): string[] {
  const linhas = dados.contexto.map(l => l.trim()).filter(Boolean);
  linhas.push(FORMATO_DATA.format(dados.data).replace(',', ''));
  if (dados.latitude != null && dados.longitude != null) {
    const coord = `${dados.latitude.toFixed(5)}, ${dados.longitude.toFixed(5)}`;
    linhas.push(dados.precisao != null ? `${coord} · ±${Math.round(dados.precisao)} m` : coord);
  } else {
    linhas.push('Sem localização');
  }
  return linhas;
}

/**
 * Desenha a faixa do carimbo no pé da imagem já desenhada no canvas. O tamanho da letra acompanha
 * a largura da foto (legível na miniatura e no tamanho real).
 */
export function desenharCarimbo(ctx: CanvasRenderingContext2D, largura: number, altura: number, linhas: string[]): void {
  if (!linhas.length) return;
  const fonte = Math.max(14, Math.round(Math.min(largura, altura) * 0.032));
  const entrelinha = Math.round(fonte * 1.3);
  const margem = Math.round(fonte * 0.8);
  const alturaFaixa = linhas.length * entrelinha + margem * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, altura - alturaFaixa, largura, alturaFaixa);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  linhas.forEach((linha, i) => {
    ctx.font = `${i === 0 ? 600 : 400} ${fonte}px "Inter Variable", Inter, system-ui, sans-serif`;
    ctx.fillText(linha, margem, altura - alturaFaixa + margem + i * entrelinha, largura - margem * 2);
  });
  ctx.restore();
}
