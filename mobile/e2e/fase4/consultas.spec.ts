import { test, expect } from '@playwright/test';
import { MockApi, loginPelaUi } from '../support/mock-api';

/** Fase 4 · Telas de consulta do material: transferências e saldo do caminhão, com números em evidência. */

test.describe('consultas de material', () => {
  test('transferência aparece na lista com quantidade e situação; o detalhe mostra os itens', async ({ page }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true, transferencias: 3 }).install(page);
    await loginPelaUi(page);
    await page.goto('/transferencias');
    const linha = page.locator('[data-ancora="tr-0"] a');
    await expect(linha).toBeVisible();
    await expect(linha.getByText(/Para Almoxarifado Central/)).toBeVisible();
    await expect(linha.getByRole('status')).toBeVisible();
    await linha.click();
    await expect(page).toHaveURL(/\/transferencias\/tr-0$/);
    await expect(page.getByText('Cabo concêntrico 10mm')).toBeVisible();
    await expect(page.getByText('Almoxarifado Central')).toBeVisible();
  });

  test('filtro e período da lista de transferências voltam iguais depois de reabrir', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true, transferencias: 5 }).install(context);
    await loginPelaUi(page);
    await page.goto('/transferencias');
    await page.getByRole('radio', { name: /Enviadas/ }).click();
    await page.getByRole('button', { name: /Período:/ }).click();
    await page.getByRole('dialog', { name: 'Período' }).getByRole('radio', { name: 'Todo o período' }).click();
    await page.waitForTimeout(450);
    await page.close({ runBeforeUnload: false });
    const reaberta = await context.newPage();
    await reaberta.goto('/?origem=app');
    await expect(reaberta).toHaveURL(/\/transferencias$/);
    await expect(reaberta.getByRole('radio', { name: /Enviadas/ })).toHaveAttribute('aria-checked', 'true');
    await expect(reaberta.getByRole('button', { name: 'Período: Todo o período' })).toBeVisible();
  });

  test('saldo do caminhão mostra quantidade e condição, e busca no saldo', async ({ page }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
    await loginPelaUi(page);
    await page.goto('/material');
    await page.getByRole('link', { name: /Saldo do caminhão/ }).click();
    await expect(page).toHaveURL(/\/material\/saldo$/);
    const lista = page.getByRole('list', { name: 'Materiais no caminhão' });
    await expect(lista.getByText('Cabo concêntrico 10mm')).toBeVisible();
    await expect(lista.locator('.geo-qtd').first()).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar no saldo' }).fill('zzz-nada');
    await expect(page.getByText('Nada encontrado')).toBeVisible();
  });

  test('a equipe de campo não tem pedido de material no app', async ({ page }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
    await loginPelaUi(page);
    await page.goto('/material');
    await expect(page.getByRole('link', { name: /Pedir material/ })).toHaveCount(0);
    await page.goto('/solicitacoes/nova');
    await expect(page).toHaveURL(/\/hoje$/);
  });
});
