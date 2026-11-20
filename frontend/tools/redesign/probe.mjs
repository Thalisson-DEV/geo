// Diagnóstico: abre uma rota com a sessão salva e avalia uma expressão JS na página.
// Uso: node tools/redesign/probe.mjs <rota> "<expressão>" [tema]
import { chromium } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const STATE = process.env.GEO_SHOTS_STATE ?? join(tmpdir(), 'geo-shots-state.json');
const [rota, expr, tema = 'light'] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
await ctx.addInitScript((t) => localStorage.setItem('geo_theme_mode', t), tema);
const p = await ctx.newPage();
const erros = [];
p.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
p.on('response', (r) => r.status() >= 400 && erros.push(r.status() + ' ' + r.url().slice(0, 160)));
await p.goto('http://localhost:4200' + rota, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
console.log(JSON.stringify(await p.evaluate(expr), null, 1));
if (erros.length) console.log('console errors:', erros.slice(0, 5));
await ctx.storageState({ path: STATE });
await b.close();
