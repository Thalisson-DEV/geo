import { expect, Page, test } from '@playwright/test';

/**
 * Atualização da versão com prefixo antigo para a versão `geo`: quem estava logado e tinha itens
 * na fila offline continua logado e com a fila intacta.
 */

// renomear-geo: manter a linha seguinte (nomes gravados pela versão anterior)
const ANTIGO = { sessao: 'ces_session_enc', tema: 'ces_theme_mode', banco: 'CesDatabase' };

async function apiForaDoAr(page: Page): Promise<void> {
  // 503 é transitório: os itens ficam na fila sem gastar tentativas.
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, body: '' }));
}

function sessaoCodificada(): string {
  const carga = Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'teste' })).toString('base64');
  const sessao = {
    id: 'u1', tema: 'light', corPrimaria: 'blue', animacoesAtivadas: false,
    token: `x.${carga}.y`, login: 'teste', nome: 'Teste', permissoes: []
  };
  return Buffer.from(encodeURIComponent(JSON.stringify(sessao)).split('').reverse().join('')).toString('base64');
}

async function contarFila(page: Page, banco: string): Promise<number> {
  return page.evaluate((nome) => new Promise<number>((resolve, reject) => {
    const pedido = indexedDB.open(nome);
    pedido.onerror = () => reject(pedido.error);
    pedido.onsuccess = () => {
      const db = pedido.result;
      const contagem = db.transaction('syncQueue', 'readonly').objectStore('syncQueue').count();
      contagem.onsuccess = () => { db.close(); resolve(contagem.result); };
      contagem.onerror = () => reject(contagem.error);
    };
  }), banco);
}

test('quem estava logado com 3 itens na fila continua logado e com a fila depois de atualizar', async ({ page }) => {
  await apiForaDoAr(page);
  await page.goto('/login');
  await page.evaluate((sessao) => localStorage.setItem('geo_session_enc', sessao), sessaoCodificada());
  await page.goto('/home');
  // Espera o app criar o banco do aparelho.
  await expect.poll(() => page.evaluate(async (nome) =>
    (await indexedDB.databases()).some((db) => db.name === nome), ANTIGO.banco), { timeout: 20_000 }).toBe(true);

  // Estado deixado pela versão anterior: chaves antigas e 3 itens enfileirados.
  await page.evaluate(({ antigo, sessao }) => new Promise<void>((resolve, reject) => {
    for (const chave of Object.keys(localStorage)) if (chave.startsWith('geo')) localStorage.removeItem(chave);
    localStorage.setItem(antigo.sessao, sessao);
    localStorage.setItem(antigo.tema, 'dark');
    const pedido = indexedDB.open(antigo.banco);
    pedido.onerror = () => reject(pedido.error);
    pedido.onsuccess = () => {
      const db = pedido.result;
      const tx = db.transaction('syncQueue', 'readwrite');
      const fila = tx.objectStore('syncQueue');
      for (let i = 0; i < 3; i++) {
        fila.add({ url: `/api/v1/teste/${i}`, method: 'POST', body: { i }, timestamp: Date.now() + i, usuarioId: 'u1' });
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { antigo: ANTIGO, sessao: sessaoCodificada() });

  await page.goto('/home');

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('html')).toHaveClass(/app-dark/);
  const chaves = await page.evaluate(() => ({
    nova: localStorage.getItem('geo_session_enc'),
    tema: localStorage.getItem('geo_theme_mode'),
    antigas: Object.keys(localStorage).filter((chave) => /^ces[_.:]/.test(chave))
  }));
  expect(chaves.nova).toBe(sessaoCodificada());
  expect(chaves.tema).toBe('dark');
  expect(chaves.antigas).toEqual([]);
  expect(await contarFila(page, ANTIGO.banco)).toBe(3);
});
