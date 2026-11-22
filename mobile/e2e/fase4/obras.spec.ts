import { test, expect, Page, BrowserContext } from '@playwright/test';
import { MockApi, loginPelaUi } from '../support/mock-api';

/**
 * Obras offline: o dia inteiro da equipe sem sinal (turno → chegada → APR → "Tudo feito" → foto → relatório), enviado uma
 * única vez ao reconectar; conflito quando a programação foi cancelada; app morto no meio da APR; aviso de mudança.
 */

async function semRede(page: Page, context: BrowserContext, api: MockApi) {
  api.offline = true;
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

async function comRede(page: Page, context: BrowserContext, api: MockApi) {
  api.offline = false;
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

async function assinar(page: Page, quem: string) {
  // Depois de uma assinatura, o quadro da próxima pessoa abre sozinho: só toca no nome se ele ainda não estiver aberto.
  const aberto = page.getByRole('dialog', { name: new RegExp(`Assinatura de ${quem}`) });
  await page.waitForTimeout(500);
  if (!(await aberto.isVisible())) {
    await page.getByRole('button', { name: new RegExp(`Assinatura de ${quem}`) }).click();
  }
  const quadro = page.getByLabel('Quadro de assinatura');
  await expect(quadro).toBeVisible();
  await page.waitForTimeout(350);
  const caixa = (await quadro.boundingBox())!;
  await page.mouse.move(caixa.x + 30, caixa.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(caixa.x + 30 + i * 20, caixa.y + 60 + (i % 2) * 40);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Confirmar assinatura' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Assinatura de ${quem}: assinada`) })).toBeVisible();
}

/** Da ficha da obra até a APR concluída (vai para a execução). */
async function fazerApr(page: Page) {
  await page.getByTestId('passo-obra').click();
  await expect(page.getByText('APR · Equipe')).toBeVisible();
  await page.getByTestId('apr-avancar').click(); // Equipe
  await expect(page.getByRole('checkbox', { name: /Choque elétrico/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('apr-avancar').click(); // Riscos
  await page.getByTestId('apr-avancar').click(); // Medidas
  await expect(page.getByText('APR · Verificações')).toBeVisible();
  const grupos = page.getByRole('radiogroup');
  await expect(grupos).toHaveCount(3); // com desligamento: as três verificações
  for (let i = 0; i < 3; i++) await grupos.nth(i).getByRole('radio', { name: 'Sim' }).click();
  await page.getByTestId('apr-avancar').click(); // Verificações
  await assinar(page, 'José Encarregado');
  await assinar(page, 'Maria Eletricista');
  await page.getByTestId('apr-avancar').click(); // Assinaturas
  await page.getByTestId('apr-concluir').click();
  await expect(page).toHaveURL(/\/obras\/p-12\/execucao$/);
}

/** Execução → ficha → agenda → Hoje, pelos botões do app. */
async function irParaHoje(page: Page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
  await expect(page).toHaveURL(/\/obras\/p-12$/);
  await page.getByRole('button', { name: 'Voltar', exact: true }).first().click();
  await expect(page).toHaveURL(/\/obras$/);
  await page.getByRole('link', { name: 'Hoje' }).first().click();
  await expect(page).toHaveURL(/\/hoje$/);
}

test.describe('Obras offline', () => {
  test('dia inteiro sem sinal: tudo sai uma vez só, na ordem, ao voltar a rede', async ({ page, context }) => {
    test.setTimeout(120_000);
    const api = new MockApi({ perfil: 'CAMPO', turnoAberto: false, obras: true });
    await api.install(context);
    await loginPelaUi(page);
    await expect(page.getByText('Pronto para trabalhar sem sinal')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('hoje-obra-12')).toContainText('Desligamento 08:00–12:00 · manobra 4471');

    await semRede(page, context, api);

    // Turno aberto sem sinal.
    await page.getByTestId('proximo-passo').click();
    await expect(page).toHaveURL(/\/turno\/abrir$/);
    await expect(page.getByText('Sem sinal: o turno abre no aparelho')).toBeVisible();
    await page.getByRole('button', { name: /^Abrir turno/ }).click();
    await expect(page).toHaveURL(/\/hoje$/);

    // Chegada na obra.
    await expect(page.getByTestId('proximo-passo')).toContainText('Ir para a obra');
    await page.getByTestId('proximo-passo').click();
    await expect(page.getByText('Rua das Flores, 100 - Vila Nova')).toBeVisible();
    await expect(page.getByTestId('como-chegar')).toHaveAttribute('href', /-3.7319,-38.5267/);
    await expect(page.getByText(/faltam 2/i).first()).toBeVisible();
    await page.getByTestId('presenca').click();
    await expect(page.getByText('Equipe na obra')).toBeVisible();

    // APR com desligamento: choque e arco já vêm marcados; assinam os dois.
    await fazerApr(page);

    // Tudo feito no ponto 4.
    await page.getByTestId('tudo-feito-4').click();
    await expect(page.getByTestId('ponto-4')).toContainText('Feito');

    // Foto do modelo no ponto 4 pelo "Próxima foto" (a de depois, com o ponto pronto); a pendência some.
    await page.getByRole('button', { name: 'Abrir Ponto 4' }).click();
    const detalhe = page.getByTestId('detalhe-ponto');
    await expect(detalhe.getByText('Falta', { exact: true })).toBeVisible();
    await expect(detalhe.getByTestId('proxima-foto')).toContainText('Poste instalado');
    await expect(detalhe.getByTestId('proxima-foto')).toContainText('Depois de pronto');
    await detalhe.getByTestId('proxima-foto').locator('input[type=file]').setInputFiles({ name: 'poste.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_1PX, 'base64') });
    await expect(page.getByText('Foto guardada')).toBeVisible();
    await expect(detalhe.getByText('Falta', { exact: true })).toHaveCount(0);
    await expect(detalhe.getByText('Todas as fotos pedidas neste ponto estão tiradas.')).toBeVisible();

    // Fecha o dia com o relatório montado (navegando no app: sem rede não há recarga).
    await irParaHoje(page);
    await page.getByRole('link', { name: 'Fechar o dia' }).click();
    await expect(page.getByTestId('texto-relatorio')).toHaveValue(/Obra 7000001 \(programação #12\): pontos feitos 4; parcial em 5\./);
    await page.getByTestId('fechar-dia').click();
    await expect(page).toHaveURL(/\/hoje$/);
    expect(api.operacoesObras).toHaveLength(0);
    expect(api.escritasEm('/v1/turnos/abrir')).toHaveLength(0);

    // Volta a rede: tudo vai, na ordem e uma vez só.
    await comRede(page, context, api);
    await expect.poll(() => api.operacoesObras.map(o => o.tipo), { timeout: 20_000 })
      .toEqual(['OBRA_PRESENCA', 'OBRA_APR', 'OBRA_APONTAMENTO', 'OBRA_EVIDENCIA', 'OBRA_RELATORIO']);
    await expect.poll(() => api.escritasEm(/\/v1\/turnos\/[^/]+\/fechar/).length, { timeout: 20_000 }).toBe(1);
    expect(api.escritasEm('/v1/turnos/abrir')).toHaveLength(1);
    expect(api.escritasEm('/v1/turnos/abrir')[0].body).toEqual(expect.objectContaining({ idEquipe: 'e-1', idLider: 'c-1' }));
    const apontamento = api.operacoesObras[2].payload as { pontoInteiro: boolean; idPonto: string; idApr: string; campo: { instante: string } };
    expect(apontamento).toEqual(expect.objectContaining({ pontoInteiro: true, idPonto: 'pt-4' }));
    expect(apontamento.idApr).toBe((api.operacoesObras[1].payload as { campo: { idLocal: string } }).campo.idLocal);
    expect((api.operacoesObras[1].payload as { concluir: boolean; assinaturas: unknown[] }).assinaturas).toHaveLength(2);
    expect(api.operacoesObras[3].anexos).toHaveLength(1);

    // Outra rodada da fila não repete nada.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1500);
    expect(api.operacoesObras).toHaveLength(5);
  });

  test('programação cancelada enquanto a equipe estava sem sinal: o apontamento vira conflito com o motivo', async ({ page, context }) => {
    test.setTimeout(90_000);
    const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
    api.recusarObras['OBRA_APONTAMENTO'] = 'Não é possível apontar a programação #12: ela foi cancelada ou excluída.';
    await api.install(context);
    await loginPelaUi(page);
    await expect(page.getByText('Pronto para trabalhar sem sinal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('hoje-obra-12').click();
    await page.getByTestId('presenca').click();
    await fazerApr(page);
    await page.getByTestId('tudo-feito-4').click();
    await irParaHoje(page);
    const conflito = page.getByTestId('conflito-obra');
    await expect(conflito).toContainText('Apontamento: recusado pelo servidor', { timeout: 15_000 });
    await expect(conflito).toContainText('cancelada ou excluída');
  });

  test('app morto no meio da APR volta no mesmo passo, com o que já foi marcado', async ({ page, context }) => {
    const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
    await api.install(context);
    await loginPelaUi(page);
    await expect(page.getByText('Pronto para trabalhar sem sinal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('hoje-obra-12').click();
    await page.getByTestId('presenca').click();
    await page.getByTestId('passo-obra').click();
    await page.getByTestId('apr-avancar').click();
    await page.getByRole('checkbox', { name: /Queda de altura/ }).click();
    await page.getByTestId('apr-avancar').click();
    await expect(page.getByText('APR · Medidas')).toBeVisible();

    await page.waitForTimeout(450);
    await page.close({ runBeforeUnload: false });
    const nova = await context.newPage();
    await nova.goto('/?origem=app');
    await expect(nova.getByText('APR · Medidas')).toBeVisible({ timeout: 15_000 });
    await nova.getByRole('button', { name: 'Anterior' }).click();
    await expect(nova.getByRole('checkbox', { name: /Queda de altura/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('foto reprovada pelo escritório: aparece no Hoje com o motivo, abre no ponto e sai ao tirar outra; a errada pode ser apagada', async ({ page, context }) => {
    test.setTimeout(90_000);
    const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
    api.fotoReprovada = true;
    await api.install(context);
    await loginPelaUi(page);
    const aviso = page.getByTestId('foto-refazer');
    await expect(aviso).toContainText('Refazer foto: Poste instalado', { timeout: 15_000 });
    await expect(aviso).toContainText('Fora de foco ou escura: carimbo ilegível');
    await aviso.click();
    await expect(page).toHaveURL(/\/obras\/p-12\/execucao\?ponto=pt-5/);
    const detalhe = page.getByTestId('detalhe-ponto');
    await expect(detalhe.getByTestId('proxima-foto')).toContainText('Refazer a foto');
    await expect(detalhe.getByTestId('proxima-foto')).toContainText('Fora de foco ou escura · carimbo ilegível');

    await semRede(page, context, api);
    await detalhe.getByTestId('proxima-foto').locator('input[type=file]').setInputFiles({ name: 'poste.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(JPEG_1PX, 'base64') });
    await expect(page.getByText(/Foto guardada/)).toBeVisible();
    await expect(detalhe.getByText('Refazer', { exact: true })).toHaveCount(0);

    // Foto em tela cheia: o Voltar do aparelho fecha a foto, e o ponto continua aberto.
    await detalhe.getByRole('button', { name: /em tela cheia/ }).first().click();
    await expect(page.getByRole('dialog', { name: /Poste instalado/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: /Poste instalado/ })).toHaveCount(0);
    await expect(detalhe).toBeVisible();

    // Foto tirada errada: apaga antes de enviar (a pendência volta) e desfaz.
    await detalhe.getByRole('button', { name: /^Apagar/ }).first().click();
    await expect(detalhe.getByTestId('proxima-foto')).toContainText('Refazer a foto');
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(detalhe.getByTestId('proxima-foto')).toHaveCount(0);
  });

  test('aviso de cancelamento aparece ao abrir e a obra sai da agenda', async ({ page, context }) => {
    const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
    api.programacaoCancelada = true;
    await api.install(context);
    await loginPelaUi(page);
    await expect(page.getByText('Programação #12 da obra 7000001 foi cancelada: desligamento negado.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('hoje-obra-12')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ok' }).click();
    await expect(page.getByText('Mudança na agenda')).toHaveCount(0);
  });

  test('execução avulsa: busca a obra fora da agenda, executa como programada e o servidor recebe a obra', async ({ page, context }) => {
    test.setTimeout(90_000);
    const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true, obras: true });
    await api.install(context);
    await loginPelaUi(page);
    await expect(page.getByText('Pronto para trabalhar sem sinal')).toBeVisible({ timeout: 15_000 });
    // A APR do dia (feita na obra da agenda) libera também a avulsa.
    await page.getByTestId('hoje-obra-12').click();
    await page.getByTestId('presenca').click();
    await fazerApr(page);

    await page.goto('/obras/nao-programada');
    await page.getByTestId('busca-obra').fill('7000001x');
    await page.getByTestId('buscar-obra').click();
    await expect(page.getByText(/não encontrada ou já encerrada/)).toBeVisible();
    await page.getByTestId('busca-obra').fill('7000009');
    await page.getByTestId('buscar-obra').click();
    const obra = page.getByTestId('obra-avulsa');
    await expect(obra).toContainText('Obra 7000009');
    await expect(obra).toContainText('1 item já está programado para outra equipe e não aparece aqui');
    await expect(page.getByTestId('comecar-avulsa')).toBeDisabled();
    await page.getByRole('radio', { name: 'Emergência' }).click();
    await page.getByTestId('comecar-avulsa').click();
    await expect(page).toHaveURL(/\/obras\/avulsa-o-9$/);
    await expect(page.getByText('Execução avulsa (fora da agenda)')).toBeVisible();
    await expect(page.getByText('Instalar transformador')).toBeVisible();

    await page.goto('/obras/avulsa-o-9/execucao');
    await expect(page.getByText('próximo:')).toBeVisible();
    await page.getByTestId('tudo-feito-1').click();
    await expect(page.getByTestId('ponto-1')).toContainText('Feito');
    await expect.poll(() => api.operacoesObras.map(o => o.tipo), { timeout: 20_000 }).toEqual(expect.arrayContaining(['OBRA_ATIVIDADE', 'OBRA_APONTAMENTO']));
    const ativ = api.operacoesObras.find(o => o.tipo === 'OBRA_ATIVIDADE')!.payload as { idObra: string; motivo: string };
    expect(ativ).toEqual(expect.objectContaining({ idObra: 'o-9', motivo: 'Emergência' }));
    const apont = api.operacoesObras.filter(o => o.tipo === 'OBRA_APONTAMENTO').at(-1)!.payload as { idObra: string; idProgramacao: string | null; idPonto: string };
    expect(apont).toEqual(expect.objectContaining({ idObra: 'o-9', idProgramacao: null, idPonto: 'pt-91' }));
  });

  test('supervisor acompanha as equipes: quem está sem condição de executar aparece', async ({ page, context }) => {
    const api = new MockApi({ perfil: 'ADMINISTRATIVO', obras: true });
    await api.install(context);
    await loginPelaUi(page, 'supervisor');
    await page.getByRole('link', { name: 'Obras' }).first().click();
    await expect(page.getByTestId('equipe-EQ-202')).toContainText('Sem condição de executar');
    await expect(page.getByTestId('equipe-EQ-101')).toContainText('Obra 7000001');
  });
});

/** JPEG 1×1 válido (a foto passa pela compressão e pelo carimbo do app). */
const JPEG_1PX = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
