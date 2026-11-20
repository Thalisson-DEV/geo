// Troca cores hexadecimais literais do CSS das telas pelo primitivo mais próximo do preset
// (`var(--p-<cor>-<tom>)`), para que toda cor venha da mesma fonte (o preset do PrimeNG).
//
// Escopo seguro: arquivos .css e, nos .ts/.html, só blocos `styles:` e atributos `style="…"`.
// Cores passadas por JS a canvas (chart.js, Leaflet, PDF) ficam como estão: lá var() não funciona.
// Neutros (baixa saturação) vão para a escala zinc; cromáticos, para a cor mais próxima em Lab.
//
// Uso: node tools/redesign/hex-para-tokens.mjs [--dry] [caminho...]   (padrão: src/app)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const base = readFileSync(
  require.resolve('@primeuix/themes/aura-compat').replace(/index\.(mjs|js)$/, 'base/index.mjs'),
  'utf8'
);
const CORES = ['zinc', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const PALETA = [];
for (const m of base.matchAll(/([a-z]+):\{50:"#[^}]+\}/g)) {
  if (!CORES.includes(m[1])) continue;
  for (const t of m[0].matchAll(/(\d+):"(#[0-9a-f]{6})"/gi)) PALETA.push({ nome: `--p-${m[1]}-${t[1]}`, cor: m[1], hex: t[2] });
}

const rgb = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
function lab([r, g, b]) {
  const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * k(Y) - 16, 500 * (k(X) - k(Y)), 200 * (k(Y) - k(Z))];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const PALETA_LAB = PALETA.map((p) => ({ ...p, lab: lab(rgb(p.hex)) }));

function token(hex) {
  const c = rgb(hex);
  const h = hex.toLowerCase().replace('#', '');
  if (/^(fff|ffffff)$/.test(h)) return 'var(--p-surface-0)';
  if (/^(000|000000)$/.test(h)) return 'black';
  const l = lab(c);
  const croma = Math.hypot(l[1], l[2]);
  const candidatos = croma < 22 ? PALETA_LAB.filter((p) => p.cor === 'zinc') : PALETA_LAB;
  let melhor = candidatos[0];
  for (const p of candidatos) if (dist(l, p.lab) < dist(l, melhor.lab)) melhor = p;
  return `var(${melhor.nome})`;
}

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?![0-9a-fA-F])/g;
const trocar = (texto) => texto.replace(HEX, (m) => token(m));

function processar(arquivo, conteudo) {
  if (arquivo.endsWith('.css')) return trocar(conteudo);
  let novo = conteudo;
  // styles: `…`  e  styles: [`…`, `…`]
  novo = novo.replace(/styles:\s*(\[\s*)?`[\s\S]*?`(\s*,\s*`[\s\S]*?`)*/g, (bloco) => trocar(bloco));
  // style="…" em templates
  novo = novo.replace(/\sstyle="[^"]*"/g, (attr) => trocar(attr));
  return novo;
}

const IGNORAR = [/design-system[\\/]styles[\\/]tokens\.css$/, /geo-preset\.ts$/, /\.spec\.ts$/, /api[\\/]generated/, /pi-lucide\.css$/, /design-system[\\/]catalog/];
function* arquivos(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* arquivos(p);
    else if (/\.(css|ts|html)$/.test(n)) yield p;
  }
}

const dry = process.argv.includes('--dry');
const alvos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let total = 0;
let mudados = 0;
for (const alvo of alvos.length ? alvos : ['src/app']) {
  const lista = statSync(alvo).isDirectory() ? [...arquivos(resolve(alvo))] : [resolve(alvo)];
  for (const f of lista) {
    if (IGNORAR.some((r) => r.test(f))) continue;
    const antes = readFileSync(f, 'utf8');
    const depois = processar(f, antes);
    if (antes !== depois) {
      const n = (antes.match(HEX) ?? []).length - (depois.match(HEX) ?? []).length;
      total += n;
      mudados++;
      if (!dry) writeFileSync(f, depois);
    }
  }
}
console.log(`${dry ? '[dry] ' : ''}${total} cores trocadas em ${mudados} arquivos`);
