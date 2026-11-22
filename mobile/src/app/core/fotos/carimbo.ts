/**
 * Carimbo das fotos de campo: um quadro técnico gravado na própria imagem, no canto inferior esquerdo, com o contexto (obra,
 * ponto, item e momento), a data e hora com o fuso, a posição em graus com hemisfério e a precisão do GPS, quem tirou e um
 * código da foto. A evidência continua legível e rastreável fora do sistema (no PDF do book, num envio por mensagem) e não
 * depende dos metadados do arquivo, que se perdem ao reenviar.
 */

/** O que vai no quadro: título, detalhe e as linhas técnicas (rótulo e valor). */
export interface Carimbo {
  titulo: string;
  detalhe?: string;
  dados: { rotulo: string; valor: string }[];
  /** Id do registro da foto no aparelho (vai para o servidor): o código impresso sai dele. */
  id?: string;
}

export interface DadosCarimbo {
  /** Título do quadro (ex.: "Obra 1234 · Ponto 4"). */
  titulo: string;
  /** O que a foto mostra e quando (ex.: "Aterramento · Durante a execução"). */
  detalhe?: string;
  /** Momento da captura (hora do aparelho). */
  data: Date;
  latitude?: number | null;
  longitude?: number | null;
  /** Precisão do GPS em metros. */
  precisao?: number | null;
  /** Equipe e pessoa (ex.: "CON-BNF-01 · DIEGO F. ARAÚJO"). */
  autoria?: string | null;
  /** Id do registro da foto (UUID): o carimbo imprime o código curto que sai dele ("Cód. 7F3A-21C9"), o mesmo do book. */
  id?: string | null;
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** "UTC−03:00", a partir do fuso do aparelho no momento. */
export function fusoDe(data: Date): string {
  const minutos = -data.getTimezoneOffset();
  const sinal = minutos >= 0 ? '+' : '−';
  const abs = Math.abs(minutos);
  return `UTC${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** "9,42938° S · 40,48958° O": graus decimais com hemisfério, como nas plantas e nos relatórios técnicos. */
export function coordenadas(latitude: number, longitude: number): string {
  const grau = (v: number) => Math.abs(v).toFixed(5).replace('.', ',') + '°';
  return `${grau(latitude)} ${latitude < 0 ? 'S' : 'N'} · ${grau(longitude)} ${longitude < 0 ? 'O' : 'L'}`;
}

/** Código curto da foto a partir do id do registro: os 8 primeiros hexadecimais em dois blocos ("7F3A-21C9"). */
export function codigoDaFoto(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/** Monta o quadro, já em pt-BR. Sem GPS, diz isso em vez de omitir. */
export function montarCarimbo(dados: DadosCarimbo): Carimbo {
  const linhas: { rotulo: string; valor: string }[] = [];
  linhas.push({ rotulo: 'Data', valor: `${DATA_HORA.format(dados.data).replace(',', '')} (${fusoDe(dados.data)})` });
  if (dados.latitude != null && dados.longitude != null) {
    const coord = coordenadas(dados.latitude, dados.longitude);
    linhas.push({ rotulo: 'GPS', valor: dados.precisao != null ? `${coord} · ±${Math.round(dados.precisao)} m` : coord });
  } else {
    linhas.push({ rotulo: 'GPS', valor: 'Sem localização no momento da foto' });
  }
  if (dados.autoria?.trim()) linhas.push({ rotulo: 'Resp.', valor: dados.autoria.trim() });
  if (dados.id) linhas.push({ rotulo: 'Cód.', valor: codigoDaFoto(dados.id) });
  return { titulo: dados.titulo.trim(), detalhe: dados.detalhe?.trim() || undefined, dados: linhas, id: dados.id ?? undefined };
}

const FONTE = '"Inter Variable", Inter, system-ui, sans-serif';

/**
 * Cores gravadas nos pixels da foto. O canvas não lê os tokens do tema, e o carimbo precisa ser o mesmo em qualquer tema
 * (a foto sai do app). O amarelo é de sinalização: legível sobre céu, poste e chão, e é a cor própria do carimbo.
 */
const COR = {
  fundo: 'rgba(15, 23, 42, 0.74)',
  fio: '#FACC15',
  texto: '#FFFFFF',
  detalhe: 'rgba(255, 255, 255, 0.92)',
  rotulo: 'rgba(255, 255, 255, 0.62)',
  divisor: 'rgba(255, 255, 255, 0.28)',
} as const;

/** Corta com reticências em vez de espremer as letras quando o texto passa da largura. */
function caber(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && ctx.measureText(corte + '…').width > largura) corte = corte.slice(0, -1);
  return corte.trimEnd() + '…';
}

/**
 * Desenha o quadro no canto inferior esquerdo da imagem já desenhada no canvas: fundo escuro translúcido, fio de destaque
 * à esquerda, título em negrito, detalhe e as linhas técnicas em duas colunas (rótulo e valor). O tamanho da letra
 * acompanha a foto (legível na miniatura e no tamanho real) e o quadro ocupa só a largura que o texto pede.
 */
export function desenharCarimbo(ctx: CanvasRenderingContext2D, largura: number, altura: number, carimbo: Carimbo): void {
  const f = Math.max(13, Math.round(Math.min(largura, altura) * 0.026));
  const margem = Math.round(f * 0.9);
  const pad = Math.round(f * 0.75);
  const fio = Math.max(3, Math.round(f * 0.22));
  const tTitulo = Math.round(f * 1.08);
  const tDetalhe = Math.round(f * 0.94);
  const tRotulo = Math.round(f * 0.72);
  const tValor = Math.round(f * 0.86);
  const maxLargura = largura - margem * 2;

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  // Medidas: o quadro tem a largura do texto mais longo (até a largura da foto).
  ctx.font = `600 ${tTitulo}px ${FONTE}`;
  let conteudo = ctx.measureText(carimbo.titulo).width;
  if (carimbo.detalhe) {
    ctx.font = `500 ${tDetalhe}px ${FONTE}`;
    conteudo = Math.max(conteudo, ctx.measureText(carimbo.detalhe).width);
  }
  ctx.font = `600 ${tRotulo}px ${FONTE}`;
  const colunaRotulo = Math.max(...carimbo.dados.map(d => ctx.measureText(d.rotulo.toUpperCase()).width), 0) + Math.round(f * 0.6);
  ctx.font = `500 ${tValor}px ${FONTE}`;
  for (const d of carimbo.dados) conteudo = Math.max(conteudo, colunaRotulo + ctx.measureText(d.valor).width);
  const larguraQuadro = Math.min(maxLargura, Math.ceil(conteudo) + pad * 2 + fio);
  const larguraTexto = larguraQuadro - pad * 2 - fio;

  const linhaTitulo = Math.round(tTitulo * 1.25);
  const linhaDetalhe = carimbo.detalhe ? Math.round(tDetalhe * 1.3) : 0;
  const separador = Math.round(f * 0.7);
  const linhaDado = Math.round(tValor * 1.45);
  const alturaQuadro = pad * 2 + linhaTitulo + linhaDetalhe + separador + carimbo.dados.length * linhaDado - Math.round(tValor * 0.35);
  const x = margem;
  const y = altura - margem - alturaQuadro;

  // Fundo e fio de destaque.
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(x, y, larguraQuadro, alturaQuadro);
  ctx.fillStyle = COR.fio;
  ctx.fillRect(x, y, fio, alturaQuadro);

  const tx = x + fio + pad;
  let base = y + pad + tTitulo;
  ctx.fillStyle = COR.texto;
  ctx.font = `600 ${tTitulo}px ${FONTE}`;
  ctx.fillText(caber(ctx, carimbo.titulo, larguraTexto), tx, base);
  if (carimbo.detalhe) {
    base += linhaDetalhe;
    ctx.fillStyle = COR.detalhe;
    ctx.font = `500 ${tDetalhe}px ${FONTE}`;
    ctx.fillText(caber(ctx, carimbo.detalhe, larguraTexto), tx, base);
  }
  // Fio separador.
  base += Math.round(separador * 0.65);
  ctx.fillStyle = COR.divisor;
  ctx.fillRect(tx, base, larguraTexto, Math.max(1, Math.round(f * 0.06)));
  base += separador - Math.round(separador * 0.65);

  for (const d of carimbo.dados) {
    base += linhaDado;
    ctx.fillStyle = COR.rotulo;
    ctx.font = `600 ${tRotulo}px ${FONTE}`;
    ctx.fillText(d.rotulo.toUpperCase(), tx, base - Math.round(tValor * 0.35));
    ctx.fillStyle = COR.texto;
    ctx.font = `500 ${tValor}px ${FONTE}`;
    ctx.fillText(caber(ctx, d.valor, larguraTexto - colunaRotulo), tx + colunaRotulo, base - Math.round(tValor * 0.35));
  }
  ctx.restore();
}
