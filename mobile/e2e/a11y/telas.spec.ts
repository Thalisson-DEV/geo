import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockApi, loginPelaUi } from '../support/mock-api';

/**
 * Acessibilidade das telas principais do app (WCAG 2.1 A/AA via axe-core), claro e escuro.
 * Falha com qualquer violação "serious" ou "critical".
 */

test.use({
  geolocation: { latitude: -3.7319, longitude: -38.5267, accuracy: 12 },
  permissions: ['geolocation'],
});

async function auditar(page: Page, tela: string) {
  await page.waitForTimeout(400);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const graves = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(graves.map(v => `${tela}: ${v.id} (${v.impact}) → ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

for (const tema of ['claro', 'escuro'] as const) {
  test(`telas do piloto sem violação grave · tema ${tema}`, async ({ page }) => {
    test.setTimeout(90_000);
    if (tema === 'escuro') await page.addInitScript(() => localStorage.setItem('geo_tema', 'escuro'));
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
    await page.goto('/login');
    await auditar(page, 'login');
    await loginPelaUi(page);
    await auditar(page, 'hoje');
    await page.getByRole('button', { name: /Conexão/ }).click();
    await auditar(page, 'folha envios');
    await page.keyboard.press('Escape');

    await page.goto('/material');
    await auditar(page, 'material');
    await page.goto('/material/saldo');
    await auditar(page, 'saldo do caminhão');
    await page.goto('/transferencias');
    await auditar(page, 'transferências');

    // Transferência: fluxo em passos com seletor (folha), quantidade e conferência.
    await page.goto('/transferencias/nova');
    await page.getByRole('button', { name: /^Vai para:/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await auditar(page, 'transferência folha destino');
    await page.getByRole('dialog').getByRole('radio', { name: /Almoxarifado Central/ }).click();
    await auditar(page, 'transferência passo 1');
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByRole('button', { name: 'Adicionar Cabo concêntrico 10mm' }).click();
    await auditar(page, 'transferência passo 2');
    await page.getByRole('button', { name: /Continuar/ }).click();
    await auditar(page, 'transferência conferir');

    await page.goto('/frota');
    await auditar(page, 'frota');
    await page.goto('/perfil');
    await auditar(page, 'conta');
    await page.goto('/catalogo');
    await auditar(page, 'catálogo de componentes');
  });
}
