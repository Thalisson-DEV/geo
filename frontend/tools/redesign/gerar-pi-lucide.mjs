// Gera src/app/design-system/styles/pi-lucide.css: as classes `pi pi-*` (PrimeIcons) passam a
// desenhar o ícone Lucide equivalente (máscara SVG pintada com currentColor). Assim o app inteiro
// fala um único conjunto de ícones sem reescrever as centenas de `<i class="pi pi-…">`, e o
// PrimeIcons (fonte) sai do bundle.
//
// Fonte do mapeamento: PI_PARA_LUCIDE em design-system/icons/geo-icons.ts (o mesmo que o
// <geo-icon> usa para `icon="pi pi-…"`). Uso: node tools/redesign/gerar-pi-lucide.mjs [--check]
import '@angular/compiler';
import * as L from '@lucide/angular';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('../../', import.meta.url);
const geoIcons = readFileSync(new URL('src/app/design-system/icons/geo-icons.ts', RAIZ), 'utf8');
const bloco = geoIcons.slice(geoIcons.indexOf('export const PI_PARA_LUCIDE'));
const fim = bloco.indexOf('\n};');
const mapa = {};
for (const m of bloco.slice(0, fim).matchAll(/'([a-z0-9-]+)':\s*'([a-z0-9-]+)'/g)) mapa[m[1]] = m[2];

const pascal = (s) => s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

function svg(nome) {
  const comp = L[`Lucide${pascal(nome)}`];
  if (!comp?.icon) return undefined;
  const filhos = comp.icon.node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}='${v}'`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' ` +
    `stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'>${filhos}</svg>`
  );
}

// Nomes de pi-* usados no código.
function* arquivos(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* arquivos(p);
    else if (/\.(ts|html|css)$/.test(n) && !n.endsWith('.spec.ts') && n !== 'pi-lucide.css') yield p;
  }
}
const usados = new Set();
for (const f of arquivos(new URL('src/app', RAIZ).pathname.replace(/^\/([A-Z]:)/, '$1'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\bpi-([a-z][a-z0-9-]*)/g)) usados.add(m[1]);
}
const utilitarios = new Set(['spin', 'fw']);
const semMapa = [...usados].filter((n) => !utilitarios.has(n) && !mapa[n]).sort();
const semSvg = Object.entries(mapa).filter(([, l]) => !svg(l)).map(([p, l]) => `${p}→${l}`);

if (process.argv.includes('--check')) {
  console.log('sem mapeamento:', semMapa.join(' ') || '(nenhum)');
  console.log('lucide inexistente:', semSvg.join(' ') || '(nenhum)');
  process.exit(semMapa.length || semSvg.length ? 1 : 0);
}

const linhas = [
  '/* GERADO por tools/redesign/gerar-pi-lucide.mjs — não edite à mão. */',
  '/*',
  ' * Camada de compatibilidade: `pi pi-*` desenha o ícone Lucide equivalente (máscara SVG em',
  ' * currentColor, 1em × 1em, traço do GEO). Para um nome novo, acrescente-o em PI_PARA_LUCIDE',
  ' * (geo-icons.ts) e rode o gerador. Código novo usa <geo-icon name="…">.',
  ' */',
  '@layer geo.base {',
  '  .pi {',
  '    display: inline-block;',
  '    flex: none;',
  '    inline-size: 1em;',
  '    block-size: 1em;',
  '    line-height: 1;',
  '    vertical-align: -0.125em;',
  '    background-color: currentColor;',
  '    -webkit-mask: var(--geo-pi) center / contain no-repeat;',
  '    mask: var(--geo-pi) center / contain no-repeat;',
  '    speak: none;',
  '  }',
  '  .pi::before { content: none; }',
  '  .pi-fw { inline-size: 1.28571429em; }',
  '  .pi-spin { animation: geo-pi-girar 1s linear infinite; }',
  '  @keyframes geo-pi-girar { to { transform: rotate(360deg); } }',
  "  :root[data-motion='reduced'] .pi-spin { animation-duration: 2.4s; }"
];
for (const [pi, lucide] of Object.entries(mapa).sort()) {
  const s = svg(lucide);
  if (!s) continue;
  linhas.push(`  .pi-${pi} { --geo-pi: url("data:image/svg+xml,${encodeURIComponent(s).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%27/g, "'")}"); }`);
}
linhas.push('}', '');
writeFileSync(new URL('src/app/design-system/styles/pi-lucide.css', RAIZ), linhas.join('\n'));
console.log(`pi-lucide.css: ${Object.keys(mapa).length} ícones; sem mapeamento: ${semMapa.join(' ') || '(nenhum)'}`);
