import { test, expect, Page, BrowserContext } from '@playwright/test';
import { MockApi, loginPelaUi } from '../support/mock-api';

/**
 * Retomada exata (Hoje, um fluxo em passos — a transferência — e uma lista grande — Transferências).
 * "Processo morto" = fechar a página sem eventos de saída e reabrir pelo ícone
 * (start_url) no MESMO perfil do navegador (IndexedDB e localStorage preservados).
 */

test.use({
  geolocation: { latitude: -3.7319, longitude: -38.5267, accuracy: 12 },
  permissions: ['geolocation'],
});

const DIA = 24 * 60 * 60 * 1000;

async function matarEReabrir(page: Page, context: BrowserContext): Promise<Page> {
  await page.waitForTimeout(450); // > debounce de gravação (300 ms) — nada de evento de saída
  await page.close({ runBeforeUnload: false });
  const nova = await context.newPage();
  await nova.goto('/?origem=app');
  return nova;
}

/** Lê/escreve o banco de sessão direto (para corromper ou plantar formatos antigos). */
async function sessaoDb<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(([corpo, a]) => new Promise<T>((resolve, reject) => {
    const req = indexedDB.open('ces-field-sessao'); // renomear-geo: manter
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      // eslint-disable-next-line no-new-func
      Promise.resolve(new Function('db', 'arg', corpo as string)(db, a)).then(r => { db.close(); resolve(r as T); }, reject);
    };
  }), [fn, arg] as const);
}

const PUT_SNAPSHOTS = `
  return new Promise((ok, erro) => {
    const tx = db.transaction('snapshots', 'readwrite');
    for (const r of arg) tx.objectStore('snapshots').put(r);
    tx.oncomplete = () => ok(true); tx.onerror = () => erro(tx.error);
  });`;

const CONTAR_RASCUNHOS = `
  return new Promise(ok => {
    const req = db.transaction('rascunhos').objectStore('rascunhos').getAllKeys();
    req.onsuccess = () => ok(req.result);
  });`;

/** Item da lista que está no topo da área rolável e quanto dele já passou. */
function itemNoTopo(page: Page): Promise<string> {
  return page.locator('main').evaluate(el => {
    const topo = el.getBoundingClientRect().top;
    const item = Array.from(el.querySelectorAll<HTMLElement>('[data-ancora]')).find(i => i.getBoundingClientRect().bottom > topo + 1);
    return item ? `${item.dataset['ancora']}@${Math.round(topo - item.getBoundingClientRect().top)}` : 'nenhum';
  });
}

/** Transferência parada no passo 2 (itens), com 2 m de cabo: o "lançamento pela metade" destes testes. */
async function comecarTransferencia(page: Page) {
  await page.goto('/transferencias/nova');
  await page.getByRole('button', { name: /^Vai para:/ }).click();
  await page.getByRole('dialog').getByRole('radio', { name: /Almoxarifado Central/ }).click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByRole('button', { name: 'Adicionar Cabo concêntrico 10mm' }).click();
  await page.getByRole('button', { name: 'Aumentar quantidade de Cabo concêntrico 10mm' }).click();
  await mesmoPassoEDados(page);
}

async function assinar(page: Page, quem: 'Quem entrega' | 'Quem recebe') {
  await page.getByRole('button', { name: new RegExp(quem) }).click();
  const quadro = page.getByLabel('Quadro de assinatura');
  await expect(quadro).toBeVisible();
  await page.waitForTimeout(350); // folha terminando de subir
  const caixa = (await quadro.boundingBox())!;
  await page.mouse.move(caixa.x + 30, caixa.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(caixa.x + 30 + i * 20, caixa.y + 60 + (i % 2) * 40);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Confirmar assinatura' }).click();
}

/** Continua exatamente onde parou: passo 2 de 4 e a quantidade escolhida. */
async function mesmoPassoEDados(page: Page) {
  await expect(page.getByText(/Seleção de itens · 2 de 4/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'quantidade de Cabo concêntrico 10mm' })).toHaveValue('2');
}

test.describe('Transferências: lista grande com filtro, período e rolagem', () => {
  test('processo morto com a lista rolada e filtrada: volta igual', async ({ page, context }, info) => {
    test.setTimeout(90_000);
    // O IndexedDB do WebKit para Windows (o do Playwright) grava ~15x mais devagar que o Chromium.
    const volume = info.project.name === 'ios' ? 150 : 600;
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true, transferencias: volume }).install(context);
    await loginPelaUi(page, 'encarregado', 60_000);
    await page.goto('/transferencias');
    await page.getByRole('button', { name: 'Período: Últimos 30 dias' }).click();
    await page.getByRole('radio', { name: 'Todo o período' }).click();
    await page.getByRole('radio', { name: /Enviadas/ }).click();
    await expect(page.locator('[data-ancora="tr-0"]')).toBeVisible();

    const rolagem = page.locator('main');
    await rolagem.evaluate(el => el.scrollTo(0, 6000));
    await page.waitForTimeout(400);
    expect(await rolagem.evaluate(el => el.scrollTop)).toBeGreaterThan(5000);
    const antes = await itemNoTopo(page);

    const reaberta = await matarEReabrir(page, context);
    await expect(reaberta).toHaveURL(/\/transferencias$/);
    await expect(reaberta.getByRole('radio', { name: /Enviadas/ })).toHaveAttribute('aria-checked', 'true');
    await expect(reaberta.getByRole('button', { name: 'Período: Todo o período' })).toBeVisible();
    // A garantia é o MESMO ITEM no topo (como as listas nativas). O scrollTop em pixels pode mudar:
    // linhas acima ainda não desenhadas (content-visibility) entram com altura estimada.
    const [idAntes, pxAntes] = antes.split('@');
    await expect.poll(async () => {
      const [idDepois, pxDepois] = (await itemNoTopo(reaberta)).split('@');
      return idDepois === idAntes && Math.abs(Number(pxDepois) - Number(pxAntes)) <= 4;
    }, { timeout: 15_000 }).toBe(true);
  });

  test('abrir o detalhe e voltar mantém o mesmo item no topo', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true, transferencias: 300 }).install(context);
    await loginPelaUi(page);
    await page.goto('/transferencias');
    await expect(page.locator('[data-ancora="tr-0"]')).toBeVisible();
    await page.locator('main').evaluate(el => el.scrollTo(0, 2500));
    await page.waitForTimeout(350);
    const antes = await itemNoTopo(page);

    // Toca numa linha que já está na tela (sem o Playwright rolar até ela).
    const id = antes.split('@')[0];
    await page.locator(`[data-ancora="${id}"] a`).dispatchEvent('click');
    await expect(page).toHaveURL(new RegExp(`/transferencias/${id}$`));
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page).toHaveURL(/\/transferencias$/);
    // Mesmo item no topo; o deslocamento pode variar 1–2 px por arredondamento subpixel.
    const [idAntes, pxAntes] = antes.split('@');
    await expect.poll(async () => {
      const [idDepois, pxDepois] = (await itemNoTopo(page)).split('@');
      return idDepois === idAntes && Math.abs(Number(pxDepois) - Number(pxAntes)) <= 4;
    }).toBe(true);
  });

  test('folha de período aberta continua aberta depois do processo morto', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true, transferencias: 20 }).install(context);
    await loginPelaUi(page);
    await page.goto('/transferencias');
    await page.getByRole('button', { name: /Período:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Período' })).toBeVisible();
    const reaberta = await matarEReabrir(page, context);
    await expect(reaberta).toHaveURL(/\/transferencias$/);
    await expect(reaberta.getByRole('dialog', { name: 'Período' })).toBeVisible();
  });

  test('registro que não existe mais: tela segura, sem erro', async ({ page }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
    await loginPelaUi(page);
    await page.goto('/transferencias/nao-existe-mais');
    await expect(page.getByText('Transferência não encontrada')).toBeVisible();
    await page.getByRole('button', { name: 'Ver transferências' }).click();
    await expect(page).toHaveURL(/\/transferencias$/);
  });
});

test.describe('janelas de tempo fora do app', () => {
  for (const [rotulo, ms] of [['1 s', 1000], ['30 s', 30_000], ['10 min', 600_000], ['3 h', 3 * 3600_000]] as const) {
    test(`volta depois de ${rotulo}: mesmo passo e dados`, async ({ page, context }) => {
      await context.clock.install({ time: new Date('2026-10-08T09:00:00-03:00') });
      await new MockApi({ perfil: 'CAMPO', turnoAberto: true, expiraEmSegundos: 2 * DIA / 1000 }).install(context);
      await loginPelaUi(page);
      await comecarTransferencia(page);
      await page.waitForTimeout(450);
      await page.close({ runBeforeUnload: false });

      await context.clock.fastForward(ms);
      const reaberta = await context.newPage();
      await reaberta.goto('/?origem=app');
      await mesmoPassoEDados(reaberta);
    });
  }

  test('volta depois de 13 h: abre em Hoje, mas o lançamento continua a um toque', async ({ page, context }) => {
    await context.clock.install({ time: new Date('2026-10-08T07:00:00-03:00') });
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true, expiraEmSegundos: 2 * DIA / 1000 }).install(context);
    await loginPelaUi(page);
    await comecarTransferencia(page);
    await page.waitForTimeout(450);
    await page.close({ runBeforeUnload: false });

    await context.clock.fastForward(13 * 3600_000);
    const reaberta = await context.newPage();
    await reaberta.goto('/?origem=app');
    await expect(reaberta).toHaveURL(/\/hoje$/);
    await expect(reaberta.getByText('Transferência · seleção de itens')).toBeVisible();
    await reaberta.getByRole('button', { name: 'Continuar' }).click();
    await mesmoPassoEDados(reaberta);
  });
});

test.describe('falhas do armazenamento local', () => {
  test('retrato da sessão corrompido: abre em Hoje sem erro e o rascunho continua lá', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(context);
    await loginPelaUi(page);
    await comecarTransferencia(page);
    await page.waitForTimeout(450);
    await sessaoDb(page, PUT_SNAPSHOTS, [
      { chave: 'atual', dados: { schema: 2, rota: '/transferencias/nova', checksum: 'quebrado' } },
      { chave: 'anterior', dados: '{"isto nao e um objeto' },
    ]);
    const erros: string[] = [];
    const reaberta = await (async () => {
      await page.close({ runBeforeUnload: false });
      const p = await context.newPage();
      p.on('pageerror', e => erros.push(e.message));
      await p.goto('/?origem=app');
      return p;
    })();
    await expect(reaberta).toHaveURL(/\/hoje$/);
    await expect(reaberta.getByText('Transferência · seleção de itens')).toBeVisible();
    expect(erros).toEqual([]);
  });

  test('retrato no formato antigo (schema v1) é migrado e restaurado', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(context);
    await loginPelaUi(page);
    await page.goto('/material');
    await page.waitForTimeout(450);
    await sessaoDb(page, PUT_SNAPSHOTS, [
      { chave: 'atual', dados: { versao: 1, ts: Date.now() - 60_000, usuario: 'u-encarregado-1', url: '/material/saldo', ui: {} } },
    ]);
    await page.close({ runBeforeUnload: false });
    const reaberta = await context.newPage();
    await reaberta.goto('/?origem=app');
    await expect(reaberta).toHaveURL(/\/material\/saldo$/);
  });
});

test.describe('concorrência', () => {
  test('duas abas no mesmo lançamento: a última vence e a outra versão é preservada', async ({ page, context }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(context);
    await loginPelaUi(page);
    await comecarTransferencia(page);
    await page.waitForTimeout(450);

    const outra = await context.newPage();
    await outra.goto('/transferencias/nova');
    await mesmoPassoEDados(outra);
    await outra.getByRole('button', { name: 'Aumentar quantidade de Cabo concêntrico 10mm' }).click();
    await expect(outra.getByRole('textbox', { name: 'quantidade de Cabo concêntrico 10mm' })).toHaveValue('3');
    await outra.waitForTimeout(450);

    // A primeira aba não viu a mudança e continua mexendo.
    await page.getByRole('button', { name: 'Aumentar quantidade de Cabo concêntrico 10mm' }).click();
    await page.getByRole('button', { name: 'Aumentar quantidade de Cabo concêntrico 10mm' }).click();
    await expect(page.getByRole('textbox', { name: 'quantidade de Cabo concêntrico 10mm' })).toHaveValue('4');
    await page.waitForTimeout(450);

    const chaves = await sessaoDb<string[]>(page, CONTAR_RASCUNHOS);
    expect(chaves).toContain('transferencia:nova');
    expect(chaves.some(c => c.startsWith('transferencia:nova#conflito-'))).toBe(true);

    await outra.close();
    await page.close({ runBeforeUnload: false });
    const reaberta = await context.newPage();
    await reaberta.goto('/transferencias/nova');
    await expect(reaberta.getByRole('textbox', { name: 'quantidade de Cabo concêntrico 10mm' })).toHaveValue('4');
  });
});

test.describe('Hoje', () => {
  test('folha de envios aberta com item na fila: volta aberta depois do processo morto', async ({ page, context }) => {
    const api = new MockApi({ perfil: 'CAMPO', turnoAberto: true });
    await api.install(context);
    await loginPelaUi(page);
    // Transfere sem acesso ao servidor: o item fica na fila.
    api.offline = true;
    await comecarTransferencia(page);
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await assinar(page, 'Quem entrega');
    await assinar(page, 'Quem recebe');
    await page.getByRole('button', { name: 'Confirmar transferência' }).click();
    await expect(page).toHaveURL(/\/transferencias$/);
    await page.goto('/hoje');
    await page.getByRole('button', { name: /aguardando envio/ }).click();
    const folha = page.getByRole('dialog', { name: 'Envios' });
    await expect(folha).toBeVisible();
    await expect(folha.getByText('Transferência', { exact: true })).toBeVisible();

    const reaberta = await matarEReabrir(page, context);
    await expect(reaberta).toHaveURL(/\/hoje$/);
    await expect(reaberta.getByRole('dialog', { name: 'Envios' })).toBeVisible();
    await expect(reaberta.getByRole('dialog', { name: 'Envios' }).getByText('Transferência', { exact: true })).toBeVisible();
    await reaberta.keyboard.press('Escape');
    await expect(reaberta.getByRole('dialog', { name: 'Envios' })).toBeHidden();
  });

  test('voltar do Android fecha a folha em vez de sair da tela', async ({ page }) => {
    await new MockApi({ perfil: 'CAMPO', turnoAberto: true }).install(page);
    await loginPelaUi(page);
    await page.getByRole('button', { name: /Conexão/ }).click();
    await expect(page.getByRole('dialog', { name: 'Envios' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Envios' })).toBeHidden();
    await expect(page).toHaveURL(/\/hoje$/);
  });
});
