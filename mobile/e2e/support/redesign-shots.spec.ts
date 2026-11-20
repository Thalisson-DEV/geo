import { test, expect, Page } from '@playwright/test';
import { MockApi, Perfil, loginPelaUi } from '../support/mock-api';

/**
 * Screenshots do redesign do app (não é teste de regressão): telas principais em claro e escuro,
 * no celular, no tablet em pé e no tablet deitado. Saída em docs/redesign/mobile/<etapa>/.
 *
 *   ETAPA=1-identidade npx playwright test e2e/support/redesign-shots.spec.ts --project=android
 */

const ETAPA = process.env['ETAPA'] ?? 'atual';
const APARELHOS = {
  celular: { width: 412, height: 915 },
  'tablet-retrato': { width: 800, height: 1280 },
  'tablet-paisagem': { width: 1280, height: 800 },
} as const;

test.use({
  geolocation: { latitude: -3.7319, longitude: -38.5267, accuracy: 12 },
  permissions: ['geolocation'],
});

for (const [aparelho, viewport] of Object.entries(APARELHOS)) {
  for (const tema of ['claro', 'escuro'] as const) {
    test.describe(`${aparelho} ${tema}`, () => {
      test.use({ viewport, deviceScaleFactor: 1.5, isMobile: aparelho === 'celular', hasTouch: true });
      test.beforeEach(async ({ page }) => {
        if (tema === 'escuro') await page.addInitScript(() => localStorage.setItem('geo_tema', 'escuro'));
        await page.clock.setFixedTime(new Date('2026-10-08T10:30:00-03:00'));
      });

      async function foto(page: Page, nome: string) {
        await page.waitForTimeout(450);
        await page.screenshot({ path: `../docs/redesign/mobile/${ETAPA}/${aparelho}/${nome}-${tema}.png` });
      }

      async function entrar(page: Page, perfil: Perfil) {
        await new MockApi({ perfil, turnoAberto: true, historico: 12 }).install(page);
        await page.goto('/login');
        await expect(page.locator('#login')).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(300);
        if (perfil === 'CAMPO') await foto(page, '00-login');
        await loginPelaUi(page, perfil === 'CAMPO' ? 'encarregado' : 'tecnica');
      }

      test('campo', async ({ page }) => {
        test.setTimeout(120_000);
        await entrar(page, 'CAMPO');
        await foto(page, '01-hoje');
        await page.goto('/campo');
        await foto(page, '02-servicos');
        await page.goto('/campo/nova');
        await expect(page.locator('#nota')).toBeVisible();
        await foto(page, '03-nova-execucao');
        await page.getByRole('button', { name: /^Tipo de serviço/ }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await foto(page, '03b-folha-seletor');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.waitForTimeout(300);
        await page.goto('/material');
        await foto(page, '04-material');
        await page.goto('/frota');
        await foto(page, '05-frota');
        await page.goto('/perfil');
        await foto(page, '06-conta');
      });

      test('administrativo', async ({ page }) => {
        test.setTimeout(90_000);
        await entrar(page, 'ADMINISTRATIVO');
        await foto(page, '10-admin-hoje');
        await page.goto('/inspecoes');
        await foto(page, '11-admin-inspecoes');
      });
    });
  }
}
