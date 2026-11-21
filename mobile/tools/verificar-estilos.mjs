#!/usr/bin/env node
/**
 * Lint dos estilos do app: cor fixa (hex, rgb/rgba, hsl) e `!important` só nos tokens (`src/styles/geo-tokens.scss`).
 * Olha os `.scss` e os blocos `styles: [...]`/`styles: \`...\`` dos componentes. Uma linha que precise da exceção leva o
 * comentário `lint-estilos: permitido` com o motivo (ex.: `prefers-reduced-motion`, que precisa vencer os estilos inline).
 *
 *   npm run lint:estilos
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PASTAS = ['src/app', 'src/styles'];
const TOKENS = ['src', 'styles', 'geo-tokens.scss'].join(sep);
const PROIBIDO = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|!important/;
const PERMITIDO = 'lint-estilos: permitido';

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

/** Linhas de CSS dentro de um componente: do `styles:` até o fecho do bloco. */
function linhasDeEstilo(texto) {
  const linhas = texto.split('\n');
  const marcadas = [];
  let dentro = false;
  linhas.forEach((linha, i) => {
    if (/^\s*styles\s*:\s*[[`]/.test(linha)) dentro = true;
    if (dentro) marcadas.push(i);
    if (dentro && /^\s*`?\s*\]?\s*,?\s*$/.test(linha) && i > 0 && /`\s*\]?,?\s*$/.test(linha)) dentro = false;
    if (dentro && /^\s*\}\)\s*$/.test(linha)) dentro = false;
  });
  return new Set(marcadas);
}

const problemas = [];
for (const pasta of PASTAS) {
  for (const arquivo of arquivos(join(RAIZ, pasta))) {
    const rel = relative(RAIZ, arquivo);
    if (rel === TOKENS || rel.endsWith('.spec.ts')) continue;
    const ehScss = arquivo.endsWith('.scss');
    if (!ehScss && !arquivo.endsWith('.component.ts')) continue;
    const texto = readFileSync(arquivo, 'utf8');
    const linhas = texto.split('\n');
    const alvo = ehScss ? new Set(linhas.map((_, i) => i)) : linhasDeEstilo(texto);
    for (const i of alvo) {
      const linha = linhas[i];
      if (PROIBIDO.test(linha) && !linha.includes(PERMITIDO)) problemas.push(`${rel}:${i + 1}: ${linha.trim().slice(0, 140)}`);
    }
  }
}

if (problemas.length) {
  console.error(`Cor fixa ou !important fora dos tokens (${problemas.length}). Use um token de src/styles/geo-tokens.scss:\n`);
  for (const p of problemas) console.error('  ' + p);
  process.exit(1);
}
console.log('Estilos ok: nenhuma cor fixa nem !important fora dos tokens.');
