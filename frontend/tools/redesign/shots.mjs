// Prints de evidência do redesign (claro/escuro × larguras) com o Playwright.
//
// Uso: node tools/redesign/shots.mjs <pasta-destino> <nome>=<rota> [<nome>=<rota> ...]
//   ex.: node tools/redesign/shots.mjs ../docs/redesign/shots/antes obras-lista=/obras
//
// Login: reaproveita a sessão salva em GEO_SHOTS_STATE (padrão: pasta temporária do SO). Sem
// sessão válida, entra com GEO_LOGIN e GEO_SENHA (variáveis de ambiente — nunca grave a senha).
// Larguras: GEO_SHOTS_WIDTHS (padrão "1440,1280"). Temas: GEO_SHOTS_THEMES (padrão "light,dark").
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.GEO_SHOTS_BASE ?? 'http://localhost:4200';
const STATE = process.env.GEO_SHOTS_STATE ?? join(tmpdir(), 'geo-shots-state.json');
const LARGURAS = (process.env.GEO_SHOTS_WIDTHS ?? '1440,1280').split(',').map(Number);
const TEMAS = (process.env.GEO_SHOTS_THEMES ?? 'light,dark').split(',');
const ALTURA = { 1440: 900, 1280: 800, 1024: 768 };

const [destino, ...pares] = process.argv.slice(2);
if (!destino || pares.length === 0) {
  console.error('uso: node tools/redesign/shots.mjs <pasta> <nome>=<rota> ...');
  process.exit(1);
}
mkdirSync(resolve(destino), { recursive: true });

const browser = await chromium.launch();

async function contexto(largura, tema) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: ALTURA[largura] ?? 900 },
    storageState: existsSync(STATE) ? STATE : undefined,
    locale: 'pt-BR',
    colorScheme: tema === 'dark' ? 'dark' : 'light'
  });
  await ctx.addInitScript((t) => localStorage.setItem('geo_theme_mode', t), tema);
  return ctx;
}

async function garantirLogin() {
  const ctx = await contexto(1440, 'light');
  const page = await ctx.newPage();
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) {
    const login = process.env.GEO_LOGIN;
    const senha = process.env.GEO_SENHA;
    if (!login || !senha) throw new Error('Sessão expirada: defina GEO_LOGIN e GEO_SENHA.');
    await page.locator('#login').fill(login);
    await page.locator('#senha').fill(senha);
    await page.locator('#senha').press('Enter');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  }
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

await garantirLogin();

for (const par of pares) {
  const [nome, rota] = par.split('=');
  for (const tema of TEMAS) {
    for (const largura of LARGURAS) {
      const ctx = await contexto(largura, tema);
      const page = await ctx.newPage();
      await page.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const arquivo = resolve(destino, `${nome}-${tema === 'dark' ? 'escuro' : 'claro'}-${largura}.png`);
      await page.screenshot({ path: arquivo });
      console.log('ok', arquivo);
      await ctx.storageState({ path: STATE });
      await ctx.close();
    }
  }
}

await browser.close();
