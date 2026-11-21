import { expect, Page, test } from '@playwright/test';

/**
 * Capturas das telas de Obras ligadas ao app de campo (revisão de fotos e status das equipes no boletim), claro e
 * escuro, com a API mockada. Saída em docs/redesign/screenshots/obras-campo/.
 */
const SAIDA = '../docs/redesign/screenshots/obras-campo';
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPhfDwAEhQHLz9lbwQAAAABJRU5ErkJggg==', 'base64');

function sessaoCodificada(): string {
  const carga = Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'teste' })).toString('base64');
  const sessao = {
    id: 'teste', tema: 'light', corPrimaria: 'blue', animacoesAtivadas: true, token: `x.${carga}.y`, login: 'ana.ribeiro', nome: 'Ana Ribeiro',
    permissoes: ['obras:documentacao:read', 'obras:documentacao:write', 'obras:turno:read', 'obras:obra:read'],
  };
  return Buffer.from(encodeURIComponent(JSON.stringify(sessao)).split('').reverse().join('')).toString('base64');
}

const fotos = [
  { id: 'f-1', idObra: 'o-1', numeroObra: '7000001', idPonto: 'pt-4', numeroPonto: '4', tituloItem: 'Poste instalado', etapa: 'DEPOIS',
    dataFoto: '2026-11-20T10:42:00-03:00', latitude: -3.73191, longitude: -38.52672, idEquipe: 'e-1', equipe: 'FIC-01', doApp: true, status: 'PENDENTE' },
  { id: 'f-2', idObra: 'o-1', numeroObra: '7000001', idPonto: 'pt-5', numeroPonto: '5', tituloItem: 'Cruzeta e isoladores', etapa: 'DURANTE',
    dataFoto: '2026-11-20T11:05:00-03:00', idEquipe: 'e-1', equipe: 'FIC-01', doApp: true, status: 'PENDENTE' },
  { id: 'f-3', idObra: 'o-2', numeroObra: '7000002', idPonto: 'pt-9', numeroPonto: '9', tituloItem: 'Aterramento', etapa: 'ANTES',
    dataFoto: '2026-11-20T08:15:00-03:00', idEquipe: 'e-2', equipe: 'FIC-02', doApp: true, status: 'REPROVADA',
    inconformidade: 'FORA_DE_FOCO', rotuloInconformidade: 'Fora de foco ou escura', motivo: 'Não dá para ver a haste' },
];

function hojeBr(): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function boletim() {
  const membro = (nome: string, lider = false) => ({ idColaborador: nome, nome, funcao: lider ? 'Encarregado' : 'Eletricista', lider, substituto: false });
  const equipe = (id: string, codigo: string, situacao: string, liberacao: string) => ({
    idEquipe: id, codigo, tipoEquipe: 'Linha morta', idBase: 'b-1', baseOperacional: 'Base Centro', situacao, idTurno: situacao === 'SEM_TURNO' ? null : `t-${id}`,
    abertura: situacao === 'SEM_TURNO' ? null : new Date(Date.now() - 4 * 3600_000).toISOString(), fechamento: null, minutosEmTurno: 240,
    abertoDesdeOutroDia: false, placa: 'ABC1D23', lider: membro('José Encarregado', true), componentes: [membro('Maria Eletricista')],
    noCiclo: { programado: 42000, executado: 18000 }, noDia: { programado: 8000, executado: 3500 }, diaAnterior: { programado: 7000, executado: 7000 },
    metaDiaria: 8000, percentualMeta: 43.7, agendamentoSemTurno: false,
    agenda: [{ idProgramacao: `p-${id}`, numero: 12, idObra: 'o-1', numeroObra: '7000001', tituloObra: 'Rede Vila Nova', descricao: 'Implantar rede',
      valor: 8000, itens: 5, itensConcluidos: 2, liberacao }],
  });
  return {
    data: hojeBr(), diaAnterior: hojeBr(), hoje: true, geradoEm: new Date().toISOString(),
    resumo: { equipes: 3, emTurno: 2, encerrados: 0, semTurno: 1, agendamentosSemTurno: 0, programadoDia: 24000, executadoDia: 3500 },
    equipes: [equipe('e-1', 'FIC-01', 'EM_TURNO', 'LIBERADA'), equipe('e-2', 'FIC-02', 'EM_TURNO', 'IMPEDIDA'), equipe('e-3', 'FIC-03', 'SEM_TURNO', 'PENDENTE')],
  };
}

async function abrir(page: Page, tema: 'light' | 'dark', rota: string): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api/, '');
    const json = (corpo: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (p === '/v1/obras/evidencias/revisao') {
      const status = url.searchParams.get('status') ?? 'PENDENTE';
      const lista = fotos.filter((f) => f.status === status);
      return json({ content: lista, page: { size: 24, number: 0, totalElements: lista.length, totalPages: 1 } });
    }
    if (p === '/v1/obras/evidencias/inconformidades') {
      return json([{ valor: 'FORA_DE_FOCO', rotulo: 'Fora de foco ou escura' }, { valor: 'ITEM_ERRADO', rotulo: 'Não mostra o item pedido' }, { valor: 'OUTRA', rotulo: 'Outra' }]);
    }
    if (p === '/v1/obras/evidencias/ranking') {
      return json([
        { idEquipe: 'e-1', equipe: 'FIC-01', total: 48, aprovadas: 44, reprovadas: 2, pendentes: 2, percentualAprovacao: 95.7, principalInconformidade: 'Ângulo ou enquadramento ruim' },
        { idEquipe: 'e-2', equipe: 'FIC-02', total: 30, aprovadas: 21, reprovadas: 6, pendentes: 3, percentualAprovacao: 77.8, principalInconformidade: 'Fora de foco ou escura' },
      ]);
    }
    if (/\/miniatura$/.test(p)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX });
    if (p === '/v1/obras/turnos/boletim') return json(boletim());
    if (p === '/v1/obras/campo/status-equipes') {
      return json([
        { idEquipe: 'e-1', codigo: 'FIC-01', status: 'EM_EXECUCAO', rotulo: 'Executando', numeroObraAtual: '7000001', aprsPendentes: 0, ocorrenciasImpeditivas: 0 },
        { idEquipe: 'e-2', codigo: 'FIC-02', status: 'IMPEDIDA', rotulo: 'Sem condição de executar', numeroObraAtual: '7000001', aprsPendentes: 0, ocorrenciasImpeditivas: 1 },
        { idEquipe: 'e-3', codigo: 'FIC-03', status: 'SEM_TURNO', rotulo: 'Sem turno', aprsPendentes: 0, ocorrenciasImpeditivas: 0 },
      ]);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(([sessao, modo]) => {
    localStorage.setItem('geo_session_enc', sessao);
    localStorage.setItem('geo_theme_mode', modo);
  }, [sessaoCodificada(), tema] as const);
  await page.goto(rota);
}

for (const tema of ['light', 'dark'] as const) {
  test(`revisão de fotos (${tema})`, async ({ page }, info) => {
    await abrir(page, tema, '/obras/revisao-fotos');
    await expect(page.getByRole('heading', { name: 'Revisão de fotos' })).toBeVisible();
    await expect(page.getByText('Poste instalado').first()).toBeVisible();
    await page.screenshot({ path: `${SAIDA}/revisao-fotos-fila-${tema}-${info.project.name}.png`, fullPage: true });

    await page.getByRole('button', { name: 'Reprovar foto do ponto 4' }).click();
    await expect(page.getByText('A equipe vê o motivo no app')).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SAIDA}/revisao-fotos-reprovar-${tema}-${info.project.name}.png` });
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: /Ranking/ }).click();
    await expect(page.getByRole('tab', { name: /Ranking/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('FIC-02')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SAIDA}/revisao-fotos-ranking-${tema}-${info.project.name}.png`, fullPage: true });
  });

  test(`boletim com status agora (${tema})`, async ({ page }, info) => {
    await abrir(page, tema, '/obras/boletim');
    await expect(page.getByText(/Agora: Executando · obra 7000001/).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText(/Agora: Executando/).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SAIDA}/boletim-status-agora-${tema}-${info.project.name}.png` });
  });
}
