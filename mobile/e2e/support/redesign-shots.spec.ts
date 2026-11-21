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
        await new MockApi({ perfil, turnoAberto: true, transferencias: 12 }).install(page);
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
        await page.goto('/material');
        await foto(page, '04-material');
        await page.goto('/frota');
        await foto(page, '05-frota');
        await page.goto('/perfil');
        await foto(page, '06-conta');
      });

      test('catalogo', async ({ page }) => {
        test.setTimeout(90_000);
        await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
        await loginPelaUi(page);
        await page.goto('/catalogo');
        await expect(page.getByText('Catálogo de componentes')).toBeVisible();
        const main = page.locator('main');
        const altura = await main.evaluate(el => el.scrollHeight - el.clientHeight);
        const passos = altura > 0 ? 3 : 1;
        for (let i = 0; i < passos; i++) {
          await main.evaluate((el, y) => el.scrollTo(0, y), Math.round((altura * i) / Math.max(1, passos - 1)));
          await foto(page, `20-catalogo-${i + 1}`);
        }
        await page.getByRole('button', { name: 'Abrir folha' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await foto(page, '21-catalogo-folha');
      });

      test('obras', async ({ page }) => {
        test.setTimeout(150_000);
        const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
        api.hojeObras = new Date('2026-10-08T10:30:00-03:00');
        await api.install(page);
        await loginPelaUi(page);
        await expect(page.getByText('Pronto para trabalhar sem sinal')).toBeVisible({ timeout: 20_000 });
        await foto(page, '30-obras-hoje');
        await page.goto('/obras');
        await expect(page.getByText('Obras', { exact: true }).first()).toBeVisible();
        await foto(page, '31-obras-agenda');
        await page.goto('/obras/p-12');
        await expect(page.getByText('Rua das Flores, 100 - Vila Nova')).toBeVisible();
        await foto(page, '32-obras-ficha');
        await page.getByTestId('presenca').click();
        await page.goto('/obras/p-12/apr');
        await expect(page.getByText('APR · Equipe')).toBeVisible();
        await foto(page, '33-obras-apr-equipe');
        await page.getByTestId('apr-avancar').click();
        await foto(page, '34-obras-apr-riscos');
        await page.getByTestId('apr-avancar').click();
        await page.getByTestId('apr-avancar').click();
        await foto(page, '35-obras-apr-verificacoes');
        await page.goto('/obras/p-12/execucao');
        await expect(page.getByTestId('ponto-4')).toBeVisible();
        await page.waitForTimeout(800);
        await foto(page, '36-obras-execucao');
        await page.getByRole('button', { name: 'Abrir Ponto 4' }).click();
        await expect(page.getByTestId('detalhe-ponto')).toBeVisible();
        await foto(page, '37-obras-ponto');
        await page.goto('/obras/p-12/ocorrencia?impede=1');
        await foto(page, '38-obras-sem-condicao');
        await page.goto('/obras/relatorio');
        await foto(page, '39-obras-relatorio');
        // Projeto aproximado em tela cheia.
        await page.goto('/obras/p-12/execucao');
        await expect(page.getByTestId('ponto-4')).toBeVisible();
        if (await page.getByRole('radio', { name: 'Projeto' }).isVisible()) await page.getByRole('radio', { name: 'Projeto' }).click();
        await page.getByTestId('projeto-tela-cheia').click();
        await page.getByRole('button', { name: 'Aproximar' }).click();
        await page.waitForTimeout(900);
        await foto(page, '41-obras-projeto-cheio');
        // Execução avulsa: busca, obra encontrada, ficha.
        await page.goto('/obras/nao-programada');
        await page.getByTestId('busca-obra').fill('7000009');
        await page.getByTestId('buscar-obra').click();
        await expect(page.getByTestId('obra-avulsa')).toBeVisible();
        await page.getByRole('radio', { name: 'Emergência' }).click();
        await foto(page, '42-obras-avulsa-busca');
        await page.getByTestId('comecar-avulsa').click();
        await expect(page.getByText('Execução avulsa (fora da agenda)')).toBeVisible();
        await foto(page, '43-obras-avulsa-ficha');
      });

      test('supervisor de obras', async ({ page }) => {
        test.setTimeout(90_000);
        await new MockApi({ perfil: 'ADMINISTRATIVO', obras: true }).install(page);
        await loginPelaUi(page, 'supervisor');
        await page.goto('/supervisao');
        await expect(page.getByTestId('equipe-EQ-202')).toBeVisible();
        await foto(page, '40-supervisor-equipes');
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
