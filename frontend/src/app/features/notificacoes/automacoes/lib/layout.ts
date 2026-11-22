import { Definicao, FlowNode } from '../../../../core/models/automacao.models';
import { InsertTarget, ListRef, Slot, contarNos, filhos } from './arvore';

/**
 * Layout do canvas: fluxo da esquerda para a direita, como num diagrama. O gatilho abre a linha
 * e cada passo vem à direita do anterior. Contêineres de ramos (condição, escolher caso,
 * paralelo) abrem linhas empilhadas, uma por ramo, que se juntam de novo à direita; contêineres
 * de bloco (para cada, repetir até, escopo) envolvem os passos internos numa moldura. Cartões
 * movidos à mão guardam o deslocamento em `definicao.layout` (só visual).
 *
 * Convenção: `x` é o eixo do fluxo; cada passo é posicionado pela borda esquerda e pelo centro
 * vertical da sua linha.
 */
export const CARD_W = 248;
export const CARD_H = 64;
const GAP = 56;
const PAD = 20;
const LINHA_GAP = 28;
const LABEL_W = 104;
const LABEL_H = 24;
const LABEL_GAP = 24;
const SLOT_W = 168;
const SLOT_H = 48;
const FIM_W = 176;
const FIM_H = 40;
const RECOLHIDO_EXTRA = 20;
const RAMOS = new Set(['control.condition', 'control.switch', 'control.parallel']);
const MOLDURAS = new Set(['control.foreach', 'control.until', 'control.scope']);

export type Tom = 'yes' | 'no' | 'case' | 'default' | 'branch';

export type Item =
  | { tipo: 'gatilho'; id: 'trigger'; x: number; y: number; w: number; h: number }
  | { tipo: 'passo'; id: string; x: number; y: number; w: number; h: number; no: FlowNode; ref: ListRef; index: number; recolhido: boolean; filhos: number }
  | { tipo: 'moldura'; id: string; x: number; y: number; w: number; h: number; noId: string; tom: 'branch' | 'loop' }
  | { tipo: 'rotulo'; id: string; x: number; y: number; w: number; h: number; texto: string; tom: Tom; noId: string; slot: Slot }
  | { tipo: 'vaga'; id: string; x: number; y: number; w: number; h: number; alvo: InsertTarget; interna: boolean; pequena: boolean }
  | { tipo: 'ponto'; id: string; x: number; y: number; w: number; h: number }
  | { tipo: 'fim'; id: string; x: number; y: number; w: number; h: number; alvo: InsertTarget };

export interface Conexao {
  id: string;
  de: string;
  para: string;
  alvo?: InsertTarget;
  dobra: boolean;
  /** Preenchidos por `tracar`. */
  caminho?: string;
  maisX?: number;
  maisY?: number;
}

export interface Limites {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Layout {
  itens: Item[];
  conexoes: Conexao[];
  /** Alvos de inserção com o ponto no canvas (para soltar cartões arrastados). */
  alvos: { alvo: InsertTarget; x: number; y: number }[];
  /** Caixa que contém o fluxo inteiro (o gatilho fica em x = 0, centrado em y = 0). */
  limites: Limites;
}

export interface Rotulos {
  sim: string;
  nao: string;
  senao: string;
}

/** Medida de um trecho: `w` ao longo do fluxo, `h` na altura que ele ocupa. */
interface Caixa {
  w: number;
  h: number;
}

export function colunasDe(no: FlowNode, r: Rotulos): { slot: Slot; lista: FlowNode[]; texto: string; tom: Tom }[] {
  if (no.type === 'control.condition') {
    return [
      { slot: 'then', lista: no.then ?? [], texto: r.sim, tom: 'yes' },
      { slot: 'else', lista: no.else ?? [], texto: r.nao, tom: 'no' }
    ];
  }
  if (no.type === 'control.switch') {
    return [
      ...(no.cases ?? []).map((c) => ({ slot: `case:${c.id}` as Slot, lista: c.steps, texto: c.value || '…', tom: 'case' as Tom })),
      { slot: 'default' as Slot, lista: no.default ?? [], texto: r.senao, tom: 'default' as Tom }
    ];
  }
  return (no.branches ?? []).map((b) => ({ slot: `branch:${b.id}` as Slot, lista: b.steps, texto: b.label || 'Ramo', tom: 'branch' as Tom }));
}

class Construtor {
  itens: Item[] = [];
  conexoes: Conexao[] = [];
  alvos: Layout['alvos'] = [];
  private desloc = { x: 0, y: 0 };

  constructor(private recolhidos: Set<string>, private r: Rotulos, private offsets: Record<string, { x: number; y: number }>) {}

  add(item: Item): void {
    this.itens.push({ ...item, x: item.x + this.desloc.x, y: item.y + this.desloc.y } as Item);
  }

  medirLista(lista: FlowNode[]): Caixa {
    if (!lista.length) return { w: SLOT_W, h: SLOT_H };
    let w = 0;
    let h = CARD_H;
    lista.forEach((no, i) => {
      const c = this.medir(no);
      w += c.w + (i ? GAP : 0);
      h = Math.max(h, c.h);
    });
    return { w, h };
  }

  medir(no: FlowNode): Caixa {
    if (this.recolhidos.has(no.id) && filhos(no).length) return { w: CARD_W, h: CARD_H + RECOLHIDO_EXTRA };
    if (MOLDURAS.has(no.type)) {
      const dentro = this.medirLista(no.steps ?? []);
      return { w: CARD_W + GAP + dentro.w + GAP / 2 + PAD, h: Math.max(CARD_H, dentro.h) + PAD * 2 };
    }
    if (RAMOS.has(no.type)) {
      const linhas = colunasDe(no, this.r).map((c) => this.medirLista(c.lista));
      const altura = linhas.reduce((s, c) => s + c.h, 0) + LINHA_GAP * Math.max(0, linhas.length - 1);
      const largura = Math.max(SLOT_W, ...linhas.map((c) => c.w));
      return { w: CARD_W + GAP + LABEL_W + LABEL_GAP + largura + GAP, h: Math.max(CARD_H, altura) + PAD * 2 };
    }
    return { w: CARD_W, h: CARD_H };
  }

  ligar(de: string, para: string, alvo?: InsertTarget, dobra = false): void {
    this.conexoes.push({ id: `${de}->${para}`, de, para, alvo, dobra });
  }

  ponto(id: string, x: number, y: number): void {
    this.add({ tipo: 'ponto', id, x: x - 1, y: y - 1, w: 2, h: 2 });
  }

  alvo(alvo: InsertTarget, x: number, y: number): void {
    this.alvos.push({ alvo, x: x + this.desloc.x, y: y + this.desloc.y });
  }

  posicionarLista(lista: FlowNode[], ref: ListRef, x: number, cy: number, origem: string, interna: boolean): { saida: string; fim: number } {
    if (!lista.length) {
      const id = `vaga:${ref.parentId ?? 'raiz'}:${ref.slot}`;
      const alvo = { ...ref, index: 0 };
      this.add({ tipo: 'vaga', id, x, y: cy - SLOT_H / 2, w: SLOT_W, h: SLOT_H, alvo, interna, pequena: false });
      this.ligar(origem, id);
      this.alvo(alvo, x + SLOT_W / 2, cy);
      return { saida: id, fim: x + SLOT_W };
    }
    let anterior = origem;
    let esquerda = x;
    lista.forEach((no, index) => {
      const p = this.posicionar(no, ref, index, esquerda, cy);
      const alvo = { ...ref, index };
      this.ligar(anterior, p.entrada, alvo);
      this.alvo(alvo, esquerda - GAP / 2, cy);
      anterior = p.saida;
      esquerda = p.fim + GAP;
    });
    return { saida: anterior, fim: esquerda - GAP };
  }

  posicionar(no: FlowNode, ref: ListRef, index: number, x: number, cy: number): { entrada: string; saida: string; fim: number } {
    const pai = this.desloc;
    const proprio = this.offsets[no.id];
    if (proprio) this.desloc = { x: pai.x + proprio.x, y: pai.y + proprio.y };
    try {
      return this.posicionarDeslocado(no, ref, index, x, cy);
    } finally {
      this.desloc = pai;
    }
  }

  private posicionarDeslocado(no: FlowNode, ref: ListRef, index: number, x: number, cy: number): { entrada: string; saida: string; fim: number } {
    const caixa = this.medir(no);
    const listas = filhos(no);
    const recolhido = this.recolhidos.has(no.id) && listas.length > 0;
    const altura = recolhido ? CARD_H + RECOLHIDO_EXTRA : CARD_H;
    const cartao: Item = {
      tipo: 'passo', id: no.id, x, y: cy - altura / 2, w: CARD_W, h: altura,
      no, ref, index, recolhido, filhos: listas.reduce((s, [, l]) => s + contarNos(l), 0)
    };
    if (recolhido || (!MOLDURAS.has(no.type) && !RAMOS.has(no.type))) {
      this.add(cartao);
      return { entrada: no.id, saida: no.id, fim: x + caixa.w };
    }
    // A moldura começa no meio do cartão do contêiner e envolve o que vem à direita dele.
    this.add({
      tipo: 'moldura', id: `moldura:${no.id}`, x: x + CARD_W / 2, y: cy - caixa.h / 2, w: caixa.w - CARD_W / 2, h: caixa.h,
      noId: no.id, tom: RAMOS.has(no.type) ? 'branch' : 'loop'
    });
    this.add(cartao);
    const saidaId = `saida:${no.id}`;
    this.ponto(saidaId, x + caixa.w, cy);
    if (MOLDURAS.has(no.type)) {
      const ref2: ListRef = { parentId: no.id, slot: 'steps' };
      const p = this.posicionarLista(no.steps ?? [], ref2, x + CARD_W + GAP, cy, no.id, true);
      if ((no.steps ?? []).length) {
        const fimId = `vaga:${no.id}:fim`;
        const alvo = { ...ref2, index: (no.steps ?? []).length };
        const fimX = p.fim + GAP / 2 - 14;
        this.add({ tipo: 'vaga', id: fimId, x: fimX, y: cy - 14, w: 28, h: 28, alvo, interna: true, pequena: true });
        this.ligar(p.saida, fimId);
        this.alvo(alvo, fimX + 14, cy);
      }
      return { entrada: no.id, saida: saidaId, fim: x + caixa.w };
    }
    const linhas = colunasDe(no, this.r);
    const caixas = linhas.map((c) => this.medirLista(c.lista));
    const total = caixas.reduce((s, c) => s + c.h, 0) + LINHA_GAP * Math.max(0, linhas.length - 1);
    let topo = cy - total / 2;
    const rotuloX = x + CARD_W + GAP;
    const juntaId = `junta:${no.id}`;
    this.ponto(juntaId, x + caixa.w - GAP / 2, cy);
    linhas.forEach((linha, i) => {
      const c = caixas[i]!;
      const lcy = topo + c.h / 2;
      const rotuloId = `rotulo:${no.id}:${linha.slot}`;
      this.add({ tipo: 'rotulo', id: rotuloId, x: rotuloX, y: lcy - LABEL_H / 2, w: LABEL_W, h: LABEL_H, texto: linha.texto, tom: linha.tom, noId: no.id, slot: linha.slot });
      this.ligar(no.id, rotuloId, undefined, true);
      const ref2: ListRef = { parentId: no.id, slot: linha.slot };
      const p = this.posicionarLista(linha.lista, ref2, rotuloX + LABEL_W + LABEL_GAP, lcy, rotuloId, true);
      const fim = { ...ref2, index: linha.lista.length };
      if (linha.lista.length) {
        this.ligar(p.saida, juntaId, fim, true);
        this.alvo(fim, p.fim + GAP / 2, lcy);
      } else {
        this.ligar(p.saida, juntaId, undefined, true);
      }
      topo += c.h + LINHA_GAP;
    });
    this.ligar(juntaId, saidaId);
    return { entrada: no.id, saida: saidaId, fim: x + caixa.w };
  }
}

export function montarLayout(d: Definicao, recolhidos: Set<string>, r: Rotulos): Layout {
  const offsets = d.layout ?? {};
  const b = new Construtor(recolhidos, r, offsets);
  const movido = offsets['trigger'] ?? { x: 0, y: 0 };
  b.itens.push({ tipo: 'gatilho', id: 'trigger', x: movido.x, y: -CARD_H / 2 + movido.y, w: CARD_W, h: CARD_H });
  const p = b.posicionarLista(d.steps, { parentId: null, slot: 'steps' }, CARD_W + GAP, 0, 'trigger', false);
  if (d.steps.length) {
    const alvo: InsertTarget = { parentId: null, slot: 'steps', index: d.steps.length };
    b.itens.push({ tipo: 'fim', id: 'fim', x: p.fim + GAP, y: -FIM_H / 2, w: FIM_W, h: FIM_H, alvo });
    b.ligar(p.saida, 'fim', alvo);
    b.alvos.push({ alvo, x: p.fim + GAP / 2, y: 0 });
  }
  tracar(b.itens, b.conexoes);
  const limites: Limites = { x0: 0, x1: 0, y0: 0, y1: 0 };
  for (const i of b.itens) {
    limites.x0 = Math.min(limites.x0, i.x);
    limites.x1 = Math.max(limites.x1, i.x + i.w);
    limites.y0 = Math.min(limites.y0, i.y);
    limites.y1 = Math.max(limites.y1, i.y + i.h);
  }
  return { itens: b.itens, conexoes: b.conexoes, alvos: b.alvos, limites };
}

/**
 * Caminhos SVG da direita de um cartão à esquerda do próximo: reto quando estão na mesma linha,
 * em degrau com cantos arredondados quando o destino está acima ou abaixo (ramos).
 */
function tracar(itens: Item[], conexoes: Conexao[]): void {
  const porId = new Map(itens.map((i) => [i.id, i]));
  for (const c of conexoes) {
    const a = porId.get(c.de);
    const b = porId.get(c.para);
    if (!a || !b) continue;
    const sx = a.x + a.w;
    const sy = a.y + a.h / 2;
    const tx = b.x;
    const ty = b.y + b.h / 2;
    if (Math.abs(sy - ty) < 1) {
      c.caminho = `M ${sx} ${sy} L ${tx} ${ty}`;
      c.maisX = (sx + tx) / 2;
      c.maisY = sy;
      continue;
    }
    const meio = c.dobra && b.tipo !== 'ponto' ? sx + 18 : (b.tipo === 'ponto' ? tx - 16 : sx + (tx - sx) / 2);
    const raio = Math.min(12, Math.abs(ty - sy) / 2, Math.abs(meio - sx), Math.abs(tx - meio));
    const dir = ty > sy ? 1 : -1;
    c.caminho = [
      `M ${sx} ${sy}`,
      `L ${meio - raio} ${sy}`,
      `Q ${meio} ${sy} ${meio} ${sy + dir * raio}`,
      `L ${meio} ${ty - dir * raio}`,
      `Q ${meio} ${ty} ${meio + raio} ${ty}`,
      `L ${tx} ${ty}`
    ].join(' ');
    c.maisX = b.tipo === 'ponto' ? sx + (meio - sx) / 2 : meio + (tx - meio) / 2;
    c.maisY = b.tipo === 'ponto' ? sy : ty;
  }
}
