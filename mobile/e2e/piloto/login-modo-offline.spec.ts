import { test, expect } from '@playwright/test';
import { MockApi, loginPelaUi } from '../support/mock-api';

/**
 * Aparelho preso no login: "Trabalhar sem internet" ligado ou dados móveis desligados
 * ficam gravados no aparelho e sobrevivem à saída da conta. Na tela de login essas opções
 * não aparecem, e o app recusava o "Entrar" sem nem tentar a rede, com "A conexão com o
 * servidor falhou" e "Sem internet. Entrar precisa de conexão" em qualquer Wi-Fi ou 4G.
 */

test.describe('Login com o modo offline gravado no aparelho', () => {
  test('"Trabalhar sem internet" ligado: entra e o modo desliga', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: false }).install(context);
    await context.addInitScript(() => localStorage.setItem('geo_mobile_forcar_offline', 'true'));

    await loginPelaUi(page);

    await expect(page.getByText('A conexão com o servidor falhou')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('geo_mobile_forcar_offline'))).toBeNull();
  });

  test('no 4G com dados móveis desligados: entra e os dados móveis passam a valer', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: false }).install(context);
    await context.addInitScript(() => {
      localStorage.setItem('geo_mobile_usar_redes_moveis', 'false');
      const conexao = Object.assign(new EventTarget(), { type: 'cellular', effectiveType: '4g' });
      Object.defineProperty(navigator, 'connection', { get: () => conexao, configurable: true });
    });

    await page.goto('/login');
    await expect(page.locator('app-splash-screen > div')).toHaveCount(0, { timeout: 15_000 });
    // Há rede: o aviso de "sem internet" não pode aparecer antes de tentar.
    await expect(page.getByText('Sem internet. Entrar precisa de conexão.')).toHaveCount(0);

    await loginPelaUi(page);

    expect(await page.evaluate(() => localStorage.getItem('geo_mobile_usar_redes_moveis'))).toBe('true');
  });
});

test('login mostra a versão e busca atualização sem precisar entrar', async ({ page, context }) => {
  await new MockApi({ perfil: 'CAMPO', turnoAberto: false }).install(context);
  await page.goto('/login');
  await expect(page.locator('app-splash-screen > div')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText(/^Versão \S+/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buscar atualização' })).toBeVisible();
});
