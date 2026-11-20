import { test, expect, Page } from '@playwright/test';
import { MockApi, loginPelaUi } from '../support/mock-api';

/**
 * Regressão visual das telas principais do app (Hoje, um fluxo em passos — a transferência —,
 * Material, saldo do caminhão, Frota, Conta e o catálogo de componentes), em claro e escuro.
 * Atualizar as referências depois de uma mudança visual revisada:
 * `npx playwright test e2e/visual --update-snapshots`.
 */

test.use({
  geolocation: { latitude: -3.7319, longitude: -38.5267, accuracy: 12 },
  permissions: ['geolocation'],
});

test('celular em modo escuro: o app abre no tema claro (padrão)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
  await loginPelaUi(page);
  const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fundo).toBe('rgb(244, 244, 245)');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-tema'))).toBeNull();
});

test('tema "Sistema" segue o modo escuro do aparelho', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('geo_tema', 'sistema'));
  await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
  await loginPelaUi(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-tema'))).toBe('escuro');
});

for (const tema of ['light', 'dark'] as const) {
  test.describe(`tema ${tema}`, () => {
    // O escuro é escolha do usuário (Conta → Aparência), não do sistema.
    test.beforeEach(async ({ page }) => {
      if (tema === 'dark') await page.addInitScript(() => localStorage.setItem('geo_tema', 'escuro'));
    });

    async function foto(page: Page, nome: string) {
      await page.waitForTimeout(400); // transições de entrada
      await expect(page).toHaveScreenshot(`${nome}-${tema}.png`, { maxDiffPixelRatio: 0.02, animations: 'disabled' });
    }

    test('telas principais', async ({ page }) => {
      test.setTimeout(90_000);
      const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true });
      await api.install(page);
      // Data e hora fixas: "Hoje" e horários estáveis entre execuções.
      await page.clock.setFixedTime(new Date('2026-10-08T10:30:00-03:00'));
      await loginPelaUi(page);
      await expect(page).toHaveURL(/\/hoje$/);
      await foto(page, '01-hoje');

      await page.goto('/material');
      await foto(page, '02-material');
      await page.goto('/material/saldo');
      await expect(page.getByRole('list', { name: 'Materiais no caminhão' })).toBeVisible();
      await foto(page, '03-saldo');

      await page.goto('/transferencias/nova');
      await page.getByRole('button', { name: /^Vai para:/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await foto(page, '04-transferencia-folha');
      await page.getByRole('dialog').getByRole('radio', { name: /Almoxarifado Central/ }).click();
      await foto(page, '05-transferencia-destino');
      await page.getByRole('button', { name: /Continuar/ }).click();
      await page.getByRole('button', { name: 'Adicionar Cabo concêntrico 10mm' }).click();
      await foto(page, '06-transferencia-itens');
      await page.getByRole('button', { name: /Continuar/ }).click();
      await foto(page, '07-transferencia-revisao');

      await page.goto('/frota');
      await foto(page, '08-frota');
      await page.goto('/perfil');
      await foto(page, '09-conta');
    });
  });
}
