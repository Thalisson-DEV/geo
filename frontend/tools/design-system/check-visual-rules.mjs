#!/usr/bin/env node
/**
 * Catraca das regras visuais do GEO em src/app/features e src/app/shared.
 *
 * Cada regra conta ocorrências por arquivo e compara com visual-rules-baseline.json:
 *   - subiu  → falha, com a forma única que substitui o código barrado;
 *   - desceu → falha pedindo para gravar a nova linha de base (a catraca só aperta).
 *
 *   node tools/design-system/check-visual-rules.mjs              confere
 *   node tools/design-system/check-visual-rules.mjs --atualizar  grava a linha de base atual
 *   node tools/design-system/check-visual-rules.mjs --resumo     totais por regra
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVOS_ISENTOS, MARCAS_PROIBIDAS } from './visual-rules-exceptions.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PASTAS = ['src/app/features', 'src/app/shared'];
const EXTENSOES = new Set(['.ts', '.html', '.css', '.scss']);
export const CAMINHO_BASELINE = resolve(RAIZ, 'tools/design-system/visual-rules-baseline.json');

const PALETA_TAILWIND =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITARIOS_COR = 'text|bg|border|ring|from|via|to|fill|stroke|outline|divide|shadow|accent|caret|decoration|placeholder';

/** Regras: id, padrão (global) e a forma única que substitui o código barrado. */
export const REGRAS = [
  {
    id: 'cor-literal',
    padrao: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b(?![-\w])|\b(?:rgba?|hsla?)\(/g,
    css: true,
    forma: 'use um token de cor: var(--geo-surface), var(--geo-foreground-muted), var(--geo-brand), var(--geo-danger-text)…',
  },
  {
    id: 'paleta-tailwind',
    padrao: new RegExp(`(?<![\\w-])(?:[a-z-]+:)*!?(?:${UTILITARIOS_COR})-(?:(?:${PALETA_TAILWIND})-\\d{2,3}|white|black)(?:\\/\\d+)?(?![\\w-])`, 'g'),
    forma: 'use o token pela classe arbitrária, ex.: text-[var(--geo-foreground-muted)], ou um componente do DS (geo-status, geo-callout)',
  },
  {
    id: 'important',
    padrao: /!important/g,
    css: true,
    forma: 'resolva a especificidade com as camadas (@layer geo.components) em vez de !important',
  },
  {
    id: 'ng-deep',
    padrao: /::ng-deep/g,
    css: true,
    forma: 'exponha o ajuste como input ou token do componente do DS; ::ng-deep não é permitido',
  },
  {
    id: 'p-button',
    padrao: /<p-button\b|\bpButton\b/g,
    forma: 'use <geo-button label="…" variant="primary|secondary|outline|ghost|danger">',
  },
  {
    id: 'primeng-direto',
    padrao: /from\s+['"]primeng\/[\w-]+['"]/g,
    forma: 'importe o componente equivalente de @geo/ui; PrimeNG direto só com disposição registrada na cobertura',
  },
  {
    id: 'icone-primeicons',
    padrao: /\bpi pi-[a-z][\w-]*/g,
    forma: 'use <geo-icon name="nome-do-lucide"> (ex.: <geo-icon name="check">)',
  },
  {
    id: 'movimento-literal',
    padrao: /(?:transition|animation)(?:-duration|-timing-function)?\s*:[^;{}]*?\b(?:\d*\.?\d+m?s\b|cubic-bezier\(|ease(?:-in|-out|-in-out)?\b|linear\b)[^;{}]*/g,
    css: true,
    filtro: (trecho) => !/var\(--geo-(?:motion|ease|duration)/.test(trecho),
    forma: 'use os tokens de movimento: transition: opacity var(--geo-motion-fast) var(--geo-ease-out), ou as classes geo-enter-*/geo-leave-*',
  },
  {
    id: 'movimento-tailwind',
    padrao: /(?<![\w-])(?:[a-z-]+:)*(?:duration-\d+|ease-(?:linear|in|out|in-out)|animate-(?:spin|ping|pulse|bounce)|transition-all)(?![\w-])/g,
    forma: 'use as classes geo-enter-*/geo-leave-* ou os tokens --geo-motion-*; para carregamento, geo-async-state',
  },
  {
    id: 'marca-proibida',
    padrao: new RegExp(MARCAS_PROIBIDAS.map((m) => m.padrao).join('|'), 'gi'),
    forma: 'produto white label: use "GEO" e "Bússola"; nome do contratante vem da configuração da empresa',
  },
];

function* percorrer(pasta) {
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = resolve(pasta, entrada.name);
    if (entrada.isDirectory()) yield* percorrer(caminho);
    else if (EXTENSOES.has(extname(entrada.name)) && !/\.spec\.ts$/.test(entrada.name)) yield caminho;
  }
}

const paraRepo = (arquivo) => relative(RAIZ, arquivo).split(sep).join('/');

/** Conta as ocorrências de cada regra num texto. */
export function contar(texto, caminho = '') {
  const semComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  const resultado = {};
  for (const regra of REGRAS) {
    const fonte = regra.id === 'marca-proibida' ? texto : semComentarios;
    let total = 0;
    for (const m of fonte.matchAll(regra.padrao)) {
      if (regra.filtro && !regra.filtro(m[0])) continue;
      // Cor literal só em contexto de estilo ou de template (evita ids, âncoras e hashes).
      if (regra.id === 'cor-literal' && caminho.endsWith('.ts') && /^#/.test(m[0]) && !pareceCor(fonte, m.index)) continue;
      total++;
    }
    if (total) resultado[regra.id] = total;
  }
  return resultado;
}

function pareceCor(texto, indice) {
  const antes = texto.slice(Math.max(0, indice - 40), indice);
  return /(?:color|background|border|fill|stroke|shadow|['"`:(,\[]\s*)$/i.test(antes);
}

export function medir() {
  const medida = {};
  for (const pasta of PASTAS) {
    for (const arquivo of percorrer(resolve(RAIZ, pasta))) {
      const caminho = paraRepo(arquivo);
      if (ARQUIVOS_ISENTOS.some((isento) => isento.caminho === caminho)) continue;
      const contagem = contar(readFileSync(arquivo, 'utf8'), caminho);
      if (Object.keys(contagem).length) medida[caminho] = contagem;
    }
  }
  return medida;
}

/** Compara a medida com a linha de base: devolve o que subiu e o que desceu. */
export function comparar(medida, base) {
  const subiu = [];
  const desceu = [];
  const arquivos = new Set([...Object.keys(medida), ...Object.keys(base)]);
  for (const arquivo of [...arquivos].sort()) {
    const atual = medida[arquivo] ?? {};
    const antes = base[arquivo] ?? {};
    for (const regra of new Set([...Object.keys(atual), ...Object.keys(antes)])) {
      const a = atual[regra] ?? 0;
      const b = antes[regra] ?? 0;
      if (a > b) subiu.push({ arquivo, regra, atual: a, base: b });
      if (a < b) desceu.push({ arquivo, regra, atual: a, base: b });
    }
  }
  return { subiu, desceu };
}

function ordenar(medida) {
  return Object.fromEntries(
    Object.keys(medida)
      .sort()
      .map((arquivo) => [arquivo, Object.fromEntries(Object.entries(medida[arquivo]).sort())]),
  );
}

function principal() {
  const args = new Set(process.argv.slice(2));
  const medida = medir();

  if (args.has('--atualizar')) {
    writeFileSync(CAMINHO_BASELINE, JSON.stringify(ordenar(medida), null, 2) + '\n');
    console.log(`ds:visual: linha de base gravada (${Object.keys(medida).length} arquivo(s)).`);
    return;
  }

  if (args.has('--resumo')) {
    const totais = {};
    for (const contagem of Object.values(medida)) for (const [r, n] of Object.entries(contagem)) totais[r] = (totais[r] ?? 0) + n;
    for (const regra of REGRAS) console.log(`${String(totais[regra.id] ?? 0).padStart(6)}  ${regra.id}`);
    return;
  }

  const base = JSON.parse(readFileSync(CAMINHO_BASELINE, 'utf8'));
  const { subiu, desceu } = comparar(medida, base);
  const formas = Object.fromEntries(REGRAS.map((r) => [r.id, r.forma]));

  if (subiu.length) {
    console.error(`ds:visual: ${subiu.length} regra(s) visual(is) com mais ocorrências que a linha de base.`);
    for (const { arquivo, regra, atual, base: b } of subiu) {
      console.error(`  ${arquivo}: ${regra} ${b} → ${atual}. Em vez disso, ${formas[regra]}.`);
    }
  }
  if (desceu.length) {
    console.error(`ds:visual: ${desceu.length} contagem(ns) caíram. Ótimo: grave a nova linha de base com \`npm run ds:visual -- --atualizar\`.`);
    for (const { arquivo, regra, atual, base: b } of desceu.slice(0, 20)) console.error(`  ${arquivo}: ${regra} ${b} → ${atual}`);
  }
  if (subiu.length || desceu.length) {
    process.exitCode = 1;
    return;
  }
  console.log('ds:visual: nenhuma regra visual piorou.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
