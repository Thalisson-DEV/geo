import { expect, Page, test } from '@playwright/test';

/**
 * O tema, a densidade e o movimento são aplicados pelo script inline do index.html, antes da
 * aplicação carregar. Para provar isso, os scripts da aplicação são bloqueados: o que estiver no
 * <html> veio só do script inline, ou seja, da primeira pintura.
 */
async function semAplicacao(page: Page): Promise<void> {
  await page.route(/\.js(\?|$)/, (route) =>
    route.request().url().endsWith('/env.js') ? route.continue() : route.abort()
  );
}

test('tema escuro salvo já vale na primeira pintura', async ({ page }) => {
  await semAplicacao(page);
  await page.addInitScript(() => localStorage.setItem('geo_theme_mode', 'dark'));
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  const html = page.locator('html');
  await expect(html).toHaveClass(/app-dark/);
  expect(await html.evaluate((el) => el.style.colorScheme)).toBe('dark');
  const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fundo).toBe('rgb(11, 15, 23)');
});

test('seguir o sistema usa o esquema de cores do sistema operacional', async ({ page }) => {
  await semAplicacao(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/app-dark/);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).not.toHaveClass(/app-dark/);
});

test('reduzir movimento do sistema marca o documento antes da aplicação', async ({ page }) => {
  await semAplicacao(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});

test('a impressão sai clara mesmo no tema escuro', async ({ page }) => {
  await semAplicacao(page);
  await page.addInitScript(() => localStorage.setItem('geo_theme_mode', 'dark'));
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.emulateMedia({ media: 'print' });
  const superficie = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--geo-surface').trim()
  );
  expect(superficie).toBe('#ffffff');
});
