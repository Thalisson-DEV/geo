import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contraste, verificar } from './check-tokens.mjs';

const css = (raiz, escuro) => `@layer geo.tokens {\n  :root {\n${raiz}\n  }\n  @media screen {\n    :root.app-dark, .app-dark {\n${escuro}\n    }\n  }\n}`;

test('os tokens do GEO passam', () => {
  const real = readFileSync(new URL('../../src/app/design-system/styles/tokens.css', import.meta.url), 'utf8');
  assert.deepEqual(verificar(real), []);
});

test('acusa token de cor sem valor no escuro', () => {
  const erros = verificar(css('--geo-surface-novo: #ffffff;', ''));
  assert.ok(erros.some((e) => e.includes('--geo-surface-novo') && e.includes('tema escuro')));
});

test('alias e token sem cor não precisam de valor no escuro', () => {
  const erros = verificar(css('--geo-radius-sm: 4px;\n--geo-border-focus: var(--geo-focus-ring);', ''));
  assert.ok(!erros.some((e) => e.includes('--geo-radius-sm') || e.includes('--geo-border-focus:')));
});

test('acusa nome fora da convenção', () => {
  const erros = verificar(css('--geo-azul: #2563eb;', '--geo-azul: #6093fa;'));
  assert.ok(erros.some((e) => e.includes('--geo-azul') && e.includes('categoria')));
});

test('mede contraste como o WCAG', () => {
  assert.equal(contraste('#000000', '#ffffff').toFixed(0), '21');
  assert.ok(contraste('#767676', '#ffffff') >= 4.5);
});
