import { test, expect } from '@playwright/test';
import { MockApi, loginPelaUi } from '../support/mock-api';

/**
 * Atualização da troca de prefixo: o aparelho que vem da versão anterior tem as chaves locais com o
 * prefixo antigo. A nova versão migra essas chaves na abertura, antes de qualquer serviço ler o
 * armazenamento, e o encarregado segue dentro do app sem novo login, mesmo sem rede.
 */
test('aparelho da versão anterior abre a nova versão sem pedir login, mesmo sem rede', async ({ page, context }) => {
  const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true });
  await api.install(context);
  await loginPelaUi(page);
  await expect(page).toHaveURL(/\/hoje$/);

  // Volta as chaves ao nome antigo, como estariam no aparelho antes da atualização.
  const migradas = await page.evaluate(() => {
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave?.startsWith('geo_')) chaves.push(chave);
    }
    for (const chave of chaves) {
      localStorage.setItem(chave.replace(/^geo_/, 'ces_'), localStorage.getItem(chave)!); // renomear-geo: manter
      localStorage.removeItem(chave);
    }
    return chaves;
  });
  expect(migradas).toContain('geo_auth_token');

  // Sem rede: só o token migrado pode manter a pessoa dentro (o cookie não tem como ser usado).
  api.offline = true;
  await page.waitForTimeout(450);
  await page.close({ runBeforeUnload: false });
  const reaberta = await context.newPage();
  await reaberta.goto('/?origem=app');

  await expect(reaberta).toHaveURL(/\/hoje$/);
  const depois = await reaberta.evaluate(() => {
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) chaves.push(localStorage.key(i)!);
    return chaves;
  });
  expect(depois).toContain('geo_auth_token');
  expect(depois.filter((c) => c.startsWith('ces_'))).toEqual([]); // renomear-geo: manter
});
