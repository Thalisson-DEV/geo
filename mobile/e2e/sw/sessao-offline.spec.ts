import { test, expect } from '@playwright/test';
import { MockApi, fakeJwt, loginPelaUi } from '../support/mock-api';

/**
 * Garantia de campo com o service worker de verdade: aparelho em modo avião (nenhuma
 * conexão), token vencido, app fechado pelo sistema. Reabrir pelo ícone tem de cair
 * direto no app — o shell vem do cache do SW — e NUNCA na tela de login.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'interceptação de requisições do SW só no Chromium');
test.describe.configure({ mode: 'serial' });
test.use({
  baseURL: 'http://localhost:4301',
  serviceWorkers: 'allow',
  geolocation: { latitude: -3.7319, longitude: -38.5267, accuracy: 12 },
  permissions: ['geolocation'],
});

test('modo avião + token vencido: reabre o app instalado direto, sem login, e abre um fluxo de lançamento', async ({ page, context, request }) => {
  test.setTimeout(90_000);
  await request.get('/__versao/v1');
  const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true });
  await api.install(context);
  await loginPelaUi(page);

  // Shell do app instalado e controlado pelo service worker antes de ir para o campo.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => (navigator.serviceWorker.controller as ServiceWorker | null)?.postMessage({ action: 'CHECK_FOR_UPDATES', nonce: 1 }));
  await page.waitForTimeout(1_500);

  // Um dia em campo: token vencido no aparelho e nenhuma conexão.
  const vencido = fakeJwt('CAMPO', -24 * 3600);
  await page.evaluate((t) => localStorage.setItem('geo_auth_token', t), vencido);
  api.offline = true;
  await context.setOffline(true);

  await page.waitForTimeout(450);
  await page.close({ runBeforeUnload: false });
  const reaberta = await context.newPage();
  await reaberta.goto('/?origem=app');
  await expect(reaberta.locator('app-splash-screen > div')).toHaveCount(0, { timeout: 15_000 });

  await expect(reaberta).toHaveURL(/\/hoje$/);
  await reaberta.goto('/transferencias/nova');
  await expect(reaberta.getByRole('button', { name: /^Vai para:/ })).toBeVisible();
  await reaberta.getByRole('button', { name: /^Vai para:/ }).click();
  await reaberta.getByRole('dialog').getByRole('radio', { name: /Almoxarifado Central/ }).click();
  await expect(reaberta).not.toHaveURL(/\/login/);

  await context.setOffline(false);
});
