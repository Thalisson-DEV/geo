// Leaflet é carregado globalmente (angular.json), como nos demais mapas do CES.
declare const L: any;

export interface OpcoesTrajeto {
  /** Elemento de onde vêm os tokens do tema (o Leaflet precisa da cor como valor literal). */
  tema: HTMLElement;
  /** Texto do marcador de saída (ex.: "Saída às 07:12"). Sem texto, não há marcador de saída. */
  saida?: string | null;
  /** Texto do marcador de chegada (ex.: "Último ponto às 14:40"). Sem texto, não há marcador de chegada. */
  chegada?: string | null;
  /**
   * Quando cada ponto foi lido (mesma ordem de `pontos`). Com ele, cada leitura vira um ponto no
   * mapa e o trajeto não liga leituras separadas por sinal perdido ou por um salto impossível.
   */
  instantes?: readonly string[] | null;
}

/** Sem leitura por mais que isto, o trajeto não liga os dois pontos como se fosse um caminho. */
const INTERVALO_MAXIMO_MS = 15 * 60_000;
/** Ligar dois pontos exigiria andar mais rápido que isto: é salto do rastreador, não caminho. */
const VELOCIDADE_IMPOSSIVEL_KMH = 160;
/** Leituras até este intervalo (mediano) já desenham a via; acima disso, cada leitura é marcada. */
const LEITURA_DENSA_MS = 60_000;

/** Distância entre setas de sentido, em fração do trajeto; nunca mais perto que isto (metros). */
const SETAS_POR_TRAJETO = 12;
const SETA_MINIMA_METROS = 120;

/**
 * Desenha um trajeto que se lê sobre qualquer trecho do mapa: um contorno claro sob a linha,
 * a linha na cor da marca, setas mostrando o sentido e, quando informados, os marcadores de
 * saída e de chegada. Devolve a camada (`removeLayer` para apagar) ou `null` com menos de 2 pontos.
 */
export function desenharTrajeto(mapa: any, pontos: readonly [number, number][], opcoes: OpcoesTrajeto): any | null {
  if (typeof L === 'undefined' || pontos.length < 2) return null;
  const estilo = getComputedStyle(opcoes.tema);
  const cor = (token: string, reserva: string) => estilo.getPropertyValue(`--ces-${token}`).trim() || reserva;
  const linha = cor('brand', '#2563eb');
  const contorno = cor('surface', '#ffffff');
  const sucesso = cor('success', '#16a34a');

  const apagado = cor('foreground-subtle', '#64748b');

  const grupo = L.layerGroup();
  const traco = { lineCap: 'round', lineJoin: 'round', interactive: false };
  const trechos = dividirTrajeto(pontos, opcoes.instantes);
  for (let i = 1; i < trechos.length; i++) {
    const lacuna = [trechos[i - 1][trechos[i - 1].length - 1], trechos[i][0]];
    L.polyline(lacuna, { ...traco, color: apagado, weight: 3, opacity: 0.8, dashArray: '2 8' })
      .bindTooltip('Sem leitura do rastreador neste trecho', { sticky: true }).addTo(grupo);
  }
  for (const t of trechos) {
    if (t.length < 2) continue;
    L.polyline(t, { ...traco, color: contorno, weight: 10, opacity: 0.95 }).addTo(grupo);
    L.polyline(t, { ...traco, color: linha, weight: 5, opacity: 1 }).addTo(grupo);
  }
  // Leituras espaçadas (o tempo real a cada 2 minutos): cada uma vira um ponto, para ficar claro
  // que entre elas o traço é reta. No histórico denso do provedor a linha já segue a via.
  if (opcoes.instantes && intervaloMediano(opcoes.instantes) > LEITURA_DENSA_MS) {
    pontos.forEach((p, i) => {
      const hora = new Date(opcoes.instantes![i]).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      L.circleMarker(p, { radius: 3, color: linha, weight: 2, fillColor: contorno, fillOpacity: 1 })
        .bindTooltip(`Leitura às ${hora}`, { direction: 'top', offset: [0, -4] }).addTo(grupo);
    });
  }

  for (const s of setas(pontos)) {
    const html = `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block;transform:rotate(${s.graus}deg)">`
      + `<path d="M8 2 L13 12 L8 9.5 L3 12 Z" fill="${linha}" stroke="${contorno}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    L.marker(s.ponto, { icon: L.divIcon({ html, className: '', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, keyboard: false })
      .addTo(grupo);
  }

  if (opcoes.saida) {
    L.circleMarker(pontos[0], { radius: 8, color: contorno, weight: 3, fillColor: sucesso, fillOpacity: 1 })
      .bindTooltip(escapar(opcoes.saida), { direction: 'top', offset: [0, -8] }).addTo(grupo);
  }
  if (opcoes.chegada) {
    L.circleMarker(pontos[pontos.length - 1], { radius: 8, color: contorno, weight: 3, fillColor: linha, fillOpacity: 1 })
      .bindTooltip(escapar(opcoes.chegada), { direction: 'top', offset: [0, -8] }).addTo(grupo);
  }
  grupo.addTo(mapa);
  return grupo;
}

function intervaloMediano(instantes: readonly string[]): number {
  const t = instantes.map((i) => Date.parse(i));
  const dif = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
  return dif.length ? dif[Math.floor(dif.length / 2)] : 0;
}

/**
 * Corta o trajeto onde o rastreador ficou sem ler por muito tempo ou onde ligar dois pontos
 * exigiria uma velocidade impossível. Sem os instantes, o trajeto fica inteiro.
 */
export function dividirTrajeto(pontos: readonly [number, number][], instantes?: readonly string[] | null): [number, number][][] {
  if (!pontos.length) return [];
  if (!instantes || instantes.length !== pontos.length) return [[...pontos]];
  const trechos: [number, number][][] = [[pontos[0]]];
  for (let i = 1; i < pontos.length; i++) {
    const ms = Date.parse(instantes[i]) - Date.parse(instantes[i - 1]);
    const kmh = ms > 0 ? distancia(pontos[i - 1], pontos[i]) / 1000 / (ms / 3_600_000) : Infinity;
    const quebra = ms > INTERVALO_MAXIMO_MS || (distancia(pontos[i - 1], pontos[i]) > 500 && kmh > VELOCIDADE_IMPOSSIVEL_KMH);
    if (quebra) trechos.push([pontos[i]]);
    else trechos[trechos.length - 1].push(pontos[i]);
  }
  return trechos;
}

/** Pontos igualmente espaçados ao longo do caminho, com o rumo (graus a partir do norte). */
export function setas(pontos: readonly [number, number][]): { ponto: [number, number]; graus: number }[] {
  const trechos: { de: [number, number]; para: [number, number]; metros: number }[] = [];
  let total = 0;
  for (let i = 1; i < pontos.length; i++) {
    const metros = distancia(pontos[i - 1], pontos[i]);
    if (metros <= 0) continue;
    trechos.push({ de: pontos[i - 1], para: pontos[i], metros });
    total += metros;
  }
  if (!trechos.length) return [];
  const passo = Math.max(total / SETAS_POR_TRAJETO, SETA_MINIMA_METROS);
  const resultado: { ponto: [number, number]; graus: number }[] = [];
  let proxima = passo / 2;
  let percorrido = 0;
  for (const t of trechos) {
    while (proxima <= percorrido + t.metros && proxima < total) {
      const f = (proxima - percorrido) / t.metros;
      resultado.push({
        ponto: [t.de[0] + (t.para[0] - t.de[0]) * f, t.de[1] + (t.para[1] - t.de[1]) * f],
        graus: rumo(t.de, t.para)
      });
      proxima += passo;
    }
    percorrido += t.metros;
  }
  return resultado;
}

function distancia(a: [number, number], b: [number, number]): number {
  const lat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dy = (b[0] - a[0]) * 111_320;
  const dx = (b[1] - a[1]) * 111_320 * Math.cos(lat);
  return Math.hypot(dx, dy);
}

function rumo(a: [number, number], b: [number, number]): number {
  const lat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  return (Math.atan2((b[1] - a[1]) * Math.cos(lat), b[0] - a[0]) * 180) / Math.PI;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
