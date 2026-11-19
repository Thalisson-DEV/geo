import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparar, contar } from './check-visual-rules.mjs';

test('conta cor literal, paleta Tailwind, !important e ::ng-deep', () => {
  const css = '.a { color: #2563eb !important; } :host ::ng-deep .b { background: rgb(0 0 0); }';
  assert.deepEqual(contar(css, 'x.css'), { 'cor-literal': 2, important: 1, 'ng-deep': 1 });
  const html = '<div class="text-slate-600 dark:bg-blue-950/30 hover:!border-white"></div>';
  assert.equal(contar(html, 'x.html')['paleta-tailwind'], 3);
});

test('tokens e classes arbitrárias com token não contam', () => {
  const html = '<div class="text-[var(--geo-foreground-muted)] bg-[var(--geo-surface)]"></div>';
  assert.deepEqual(contar(html, 'x.html'), {});
  const css = '.a { transition: opacity var(--geo-motion-fast) var(--geo-ease-out); color: var(--geo-brand); }';
  assert.deepEqual(contar(css, 'x.css'), {});
});

test('movimento literal e utilitários de movimento do Tailwind', () => {
  assert.equal(contar('.a { transition: all 0.2s ease; }', 'x.css')['movimento-literal'], 1);
  assert.equal(contar('<i class="transition-all duration-300 animate-pulse"></i>', 'x.html')['movimento-tailwind'], 3);
});

test('p-button, PrimeNG direto e PrimeIcons', () => {
  const ts = "import { ButtonModule } from 'primeng/button';\nconst t = `<p-button icon=\"pi pi-check\"></p-button>`;";
  assert.deepEqual(contar(ts, 'x.ts'), { 'p-button': 1, 'primeng-direto': 1, 'icone-primeicons': 1 });
});

test('marcas proibidas, inclusive em comentário', () => {
  assert.equal(contar('/* tokens do C.E.S */', 'x.css')['marca-proibida'], 1);
  assert.equal(contar('const empresa = "Sipel";', 'x.ts')['marca-proibida'], 1);
  assert.equal(contar('acesso, processo e sucesso', 'x.ts')['marca-proibida'], undefined);
});

test('hash que não é cor não conta no .ts', () => {
  assert.equal(contar("const id = 'x#fff1'; const ancora = '#cabecalho'; issue #123;", 'x.ts')['cor-literal'], undefined);
  assert.equal(contar("const cor = '#fff';", 'x.ts')['cor-literal'], 1);
});

test('a catraca acusa o que subiu e o que desceu', () => {
  const base = { 'a.ts': { 'p-button': 2 }, 'b.ts': { important: 1 } };
  const medida = { 'a.ts': { 'p-button': 3 }, 'c.ts': { 'ng-deep': 1 } };
  const { subiu, desceu } = comparar(medida, base);
  assert.deepEqual(subiu.map((s) => `${s.arquivo}:${s.regra}`), ['a.ts:p-button', 'c.ts:ng-deep']);
  assert.deepEqual(desceu.map((s) => `${s.arquivo}:${s.regra}`), ['b.ts:important']);
});
