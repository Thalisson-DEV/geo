#!/usr/bin/env node
/**
 * Confere os tokens do GEO (src/app/design-system/styles/tokens.css):
 *   1. nome no formato --geo-<categoria>-<papel>[-<variante>], com categoria conhecida;
 *   2. todo token de cor em :root tem valor no tema escuro;
 *   3. contraste mínimo dos pares de texto e controle nos dois temas (4,5:1 texto, 3:1 controle).
 *
 *   node tools/design-system/check-tokens.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/**
 * Primitivos do preset (`--p-zinc-200`, `--p-blue-600`...): os tokens --geo-* apontam para eles.
 * Lidos do próprio @primeuix/themes para medir o contraste com os valores reais.
 */
const PRIMITIVOS = (() => {
  try {
    const require = createRequire(import.meta.url);
    const caminho = require.resolve('@primeuix/themes/aura-compat');
    const fonte = readFileSync(caminho.replace(/index\.(mjs|js)$/, 'base/index.mjs'), 'utf8');
    const mapa = new Map();
    for (const cor of fonte.matchAll(/([a-z]+):\{50:"#[^}]+\}/g)) {
      const nome = cor[1];
      for (const t of cor[0].matchAll(/(\d+):"(#[0-9a-f]{6})"/gi)) mapa.set(`--p-${nome}-${t[1]}`, t[2]);
    }
    return mapa;
  } catch {
    return new Map();
  }
})();

export const CATEGORIAS = [
  'accent', 'border', 'brand', 'canvas', 'chart', 'control', 'danger', 'duration', 'ease',
  'elevation', 'focus', 'font', 'foreground', 'form', 'icon', 'info', 'motion', 'nav', 'overlay',
  'radius', 'rank', 'ring', 'shadow', 'space', 'success', 'surface', 'table', 'text', 'touch',
  'warning',
];

/** Pares [tinta, fundo, mínimo] verificados nos dois temas. */
export const PARES_CONTRASTE = [
  ['--geo-foreground', '--geo-surface', 4.5],
  ['--geo-foreground', '--geo-canvas', 4.5],
  ['--geo-foreground-muted', '--geo-surface', 4.5],
  ['--geo-foreground-muted', '--geo-surface-muted', 4.5],
  ['--geo-foreground-subtle', '--geo-surface', 4.5],
  ['--geo-foreground-subtle', '--geo-canvas', 4.5],
  ['--geo-brand-text', '--geo-surface', 4.5],
  ['--geo-brand-foreground', '--geo-brand', 4.5],
  ['--geo-info-text', '--geo-surface', 4.5],
  ['--geo-success-text', '--geo-surface', 4.5],
  ['--geo-warning-text', '--geo-surface', 4.5],
  ['--geo-danger-text', '--geo-surface', 4.5],
  ['--geo-accent-text', '--geo-surface', 4.5],
  ['--geo-nav-fg', '--geo-nav-bg', 4.5],
  ['--geo-nav-fg-muted', '--geo-nav-bg', 4.5],
  ['--geo-nav-indicator', '--geo-nav-bg', 3],
  ['--geo-focus-ring', '--geo-surface', 3],
  ['--geo-focus-ring', '--geo-canvas', 3],
  ['--geo-border-strong', '--geo-surface', 1.4],
  ['--geo-chart-axis', '--geo-surface', 4.5],
];

const CAMINHO = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/app/design-system/styles/tokens.css');

/** Extrai as declarações de um bloco cujo seletor começa com `inicio`. */
export function bloco(css, inicio) {
  const i = css.indexOf(inicio);
  if (i < 0) return new Map();
  const abre = css.indexOf('{', i);
  let nivel = 0;
  let fim = abre;
  for (; fim < css.length; fim++) {
    if (css[fim] === '{') nivel++;
    if (css[fim] === '}' && --nivel === 0) break;
  }
  const corpo = css.slice(abre + 1, fim).replace(/\/\*[\s\S]*?\*\//g, '');
  const mapa = new Map();
  for (const m of corpo.matchAll(/(--geo-[a-z0-9-]+)\s*:\s*([^;]+);/g)) mapa.set(m[1], m[2].trim());
  return mapa;
}

export function ehCor(valor) {
  return /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|color-mix\(/i.test(valor) && !/^var\(/.test(valor);
}

export function resolver(nome, ...mapas) {
  let valor;
  for (const mapa of mapas) if (mapa.has(nome)) { valor = mapa.get(nome); break; }
  const primitivo = valor?.match(/^var\((--p-[a-z]+-\d+)(?:,\s*#[0-9a-f]{6})?\)$/i);
  if (primitivo) return PRIMITIVOS.get(primitivo[1]) ?? valor;
  const alias = valor?.match(/^var\((--geo-[a-z0-9-]+)\)$/);
  return alias ? resolver(alias[1], ...mapas) : valor;
}

function rgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}

export function contraste(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function verificar(css) {
  const erros = [];
  const claro = bloco(css, ':root {');
  const escuro = bloco(css, ':root.app-dark');

  for (const nome of claro.keys()) {
    const categoria = nome.split('-')[3];
    if (!CATEGORIAS.includes(categoria)) {
      erros.push(`${nome}: categoria "${categoria}" fora da convenção --geo-<categoria>-<papel> (${CATEGORIAS.join(', ')}).`);
    }
    if (ehCor(claro.get(nome)) && !escuro.has(nome)) {
      erros.push(`${nome}: token de cor sem valor no tema escuro (.app-dark).`);
    }
  }
  for (const nome of escuro.keys()) {
    if (!claro.has(nome)) erros.push(`${nome}: existe só no tema escuro; declare também em :root.`);
  }

  for (const [tema, mapas] of [['claro', [claro]], ['escuro', [escuro, claro]]]) {
    for (const [tinta, fundo, minimo] of PARES_CONTRASTE) {
      const a = resolver(tinta, ...mapas);
      const b = resolver(fundo, ...mapas);
      if (!/^#[0-9a-f]{6}$/i.test(a ?? '') || !/^#[0-9a-f]{6}$/i.test(b ?? '')) {
        erros.push(`${tinta} sobre ${fundo} (${tema}): use hexadecimal de 6 dígitos para medir o contraste.`);
        continue;
      }
      const razao = contraste(a, b);
      if (razao < minimo) {
        erros.push(`${tinta} sobre ${fundo} (${tema}): contraste ${razao.toFixed(2)}:1, mínimo ${minimo}:1.`);
      }
    }
  }
  return erros;
}

function principal() {
  const erros = verificar(readFileSync(CAMINHO, 'utf8'));
  if (erros.length === 0) {
    console.log('ds:tokens: convenção, tema escuro e contraste em ordem.');
    return;
  }
  console.error(`ds:tokens: ${erros.length} problema(s) em tokens.css`);
  for (const erro of erros) console.error(`  ${erro}`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
