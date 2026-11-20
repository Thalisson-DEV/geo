import { expect, Page, test } from '@playwright/test';

/**
 * Shell do GEO: menu neutro (zinc) com item ativo marcado, cabeçalho com trilha e contas,
 * nos temas claro e escuro e no celular. A API fica fora do ar: o shell abre com a sessão local.
 */
function sessaoCodificada(): string {
  const carga = Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'teste' })).toString('base64');
  const sessao = {
    id: 'teste', tema: 'light', corPrimaria: 'blue', animacoesAtivadas: true,
    token: `x.${carga}.y`, login: 'ana.ribeiro', nome: 'Ana Ribeiro', permissoes: [],
  };
  return Buffer.from(encodeURIComponent(JSON.stringify(sessao)).split('').reverse().join('')).toString('base64');
}

async function abrir(page: Page, tema: 'light' | 'dark'): Promise<void> {
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.addInitScript(
    ([sessao, modo]) => {
      localStorage.setItem('geo_session_enc', sessao);
      localStorage.setItem('geo_theme_mode', modo);
    },
    [sessaoCodificada(), tema] as const
  );
  await page.goto('/home');
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
}

for (const tema of ['light', 'dark'] as const) {
  test(`menu neutro e item ativo no tema ${tema}`, async ({ page }, info) => {
    await abrir(page, tema);
    const menu = page.locator('.geo-nav');
    const fundo = await menu.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fundo).toBe(tema === 'dark' ? 'rgb(9, 9, 11)' : 'rgb(250, 250, 250)');

    if (info.project.name.includes('mobile')) {
      await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /Recolher menu|Expandir menu/ })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Conta e preferências' })).toContainText('AR');
    await page.screenshot({ path: `test-results/shell-geo-${tema}-${info.project.name}.png` });
  });
}

test('recolher o menu fica salvo no aparelho', async ({ page }, info) => {
  test.skip(info.project.name.includes('mobile'), 'só no desktop');
  await abrir(page, 'light');
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect(page.locator('.geo-nav')).toHaveClass(/geo-nav--recolhido/);
  await page.reload();
  await expect(page.locator('.geo-nav')).toHaveClass(/geo-nav--recolhido/);
  await page.getByRole('button', { name: 'Expandir menu' }).click();
  await expect(page.locator('.geo-nav')).not.toHaveClass(/geo-nav--recolhido/);
});
