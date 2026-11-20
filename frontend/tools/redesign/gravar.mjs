// Grava em vídeo (.webm) o fluxo principal de uma tela, para evidência do redesign.
// (O gif_creator do Chrome ficou indisponível: a extensão não renderiza capturas.)
//
// Uso: node tools/redesign/gravar.mjs <saida.webm> <passos.json> [tema]
// passos.json: [{ "goto": "/obras" }, { "fill": ["input[type=search]", "1029"] }, { "press": "Enter" },
//               { "click": "tbody tr:first-child" }, { "wait": 1500 }, { "key": "Escape" }]
// Cada passo aceita também "label" (só documentação). Sessão: GEO_SHOTS_STATE.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const BASE = process.env.GEO_SHOTS_BASE ?? 'http://localhost:4200';
const STATE = process.env.GEO_SHOTS_STATE ?? join(tmpdir(), 'geo-shots-state.json');
const [saida, arquivoPassos, tema = 'light'] = process.argv.slice(2);
const passos = JSON.parse(readFileSync(arquivoPassos, 'utf8'));
const pastaVideo = join(tmpdir(), `geo-video-${Date.now()}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: STATE,
  recordVideo: { dir: pastaVideo, size: { width: 1440, height: 900 } }
});
await ctx.addInitScript((t) => localStorage.setItem('geo_theme_mode', t), tema);
const page = await ctx.newPage();
for (const p of passos) {
  try {
    if (p.goto) await page.goto(BASE + p.goto, { waitUntil: 'networkidle' });
    if (p.click) await page.locator(p.click).first().click({ timeout: 8000 });
    if (p.fill) await page.locator(p.fill[0]).first().fill(p.fill[1], { timeout: 8000 });
    if (p.press) await page.keyboard.press(p.press);
    if (p.key) await page.keyboard.press(p.key);
    if (p.type) await page.keyboard.type(p.type, { delay: 60 });
    await page.waitForTimeout(p.wait ?? 900);
  } catch (erro) {
    console.warn('passo falhou:', JSON.stringify(p), String(erro).slice(0, 160));
  }
}
const video = page.video();
await ctx.close();
await browser.close();
mkdirSync(dirname(resolve(saida)), { recursive: true });
renameSync(await video.path(), resolve(saida));
rmSync(pastaVideo, { recursive: true, force: true });
console.log('ok', resolve(saida));
