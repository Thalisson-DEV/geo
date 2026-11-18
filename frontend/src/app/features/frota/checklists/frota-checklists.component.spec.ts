import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChecklistDetalhe, ChecklistResumo, PendenciaChecklist } from '../../../core/models/frota-checklist.models';
import { FrotaAnaliseIaService } from '../../../core/services/frota-analise-ia.service';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { abrirTelaFrota, paginaDe } from '../shared/frota-teste';
import { FrotaChecklistsComponent } from './frota-checklists.component';
import { recorrente, textoHistorico } from './frota-checklist.util';

// As abas medem o espaço com ResizeObserver, que o jsdom não implementa.
class ResizeObserverFalso {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverFalso as unknown as typeof ResizeObserver;

const resumo: ChecklistResumo = {
  id: 'c1', preenchidoEm: '2026-10-15T07:12:00-03:00', idVeiculo: 'v1', placa: 'ABC1D23', baseNome: 'JUAZEIRO', modeloNome: 'Caminhonete',
  condutorNome: 'MARIA TESTE', preenchidoPor: 'maria', medicao: 15000, unidadeMedicao: 'KM', passagemVeiculo: true, problemas: 1,
  fotosAChegar: 0, liberacaoCnh: false, finalidade: 'USO', finalidadeRotulo: 'Uso do veículo', avisoCnh: null
};
const detalhe: ChecklistDetalhe = {
  resumo, comentario: null, assinado: false, justificativaLiberacaoCnh: null, fotosRecebimento: [],
  respostas: [{
    id: 'r1', grupo: 'Iluminação', pergunta: 'Faróis', tipoResposta: 'OK_NOK', conforme: false, resposta: 'Não OK — Queimado',
    comentario: 'Lado esquerdo', problema: true, fotos: [], idPendencia: 'p1', situacaoPendencia: 'ABERTA', numeroOrdemServico: null,
    idOrdemServico: null,
    historico: { problemaDesde: '2026-10-10T07:00:00-03:00', diasComProblema: 5, checklistsSeguidos: 4, vezes30Dias: 6, ultimoOkEm: '2026-10-09T07:00:00-03:00' }
  }]
};

const pendencia: PendenciaChecklist = {
  id: 'p1', situacao: 'ABERTA', situacaoRotulo: 'Aberta', idChecklist: 'c1', preenchidoEm: resumo.preenchidoEm, idVeiculo: 'v1',
  placa: 'ABC1D23', baseNome: 'JUAZEIRO', condutorNome: 'MARIA TESTE', grupo: 'Iluminação', pergunta: 'Faróis', resumo: 'Faróis — Queimado',
  comentario: 'Lado esquerdo', fotos: [], fotosAChegar: 1, idOrdemServico: null, numeroOrdemServico: null, justificativa: null,
  decididaPor: null, decididaEm: null, historico: detalhe.respostas[0].historico
};

describe('Histórico do item', () => {
  it('resume desde quando o item está com problema e marca recorrente', () => {
    const h = detalhe.respostas[0].historico!;
    expect(textoHistorico(h)).toBe('Não OK há 5 dias, em 4 checklists seguidos · 6 vezes nos últimos 30 dias · último OK em 09/10');
    expect(recorrente(h)).toBe(true);
    expect(textoHistorico({ ...h, checklistsSeguidos: 1, vezes30Dias: 1, ultimoOkEm: null })).toBe('Primeira vez registrada neste veículo');
    expect(textoHistorico({ ...h, checklistsSeguidos: 1, vezes30Dias: 3, ultimoOkEm: '2026-10-09T08:00:00-03:00' }))
      .toBe('Apareceu agora: estava OK em 09/10 · 3 vezes nos últimos 30 dias');
    expect(recorrente({ ...h, diasComProblema: 1, checklistsSeguidos: 2 })).toBe(false);
  });
});

describe('FrotaChecklistsComponent', () => {
  let checklist: Record<string, ReturnType<typeof vi.fn>>;
  const abrir = (url = '/frota/checklists') =>
    abrirTelaFrota(FrotaChecklistsComponent, 'frota/checklists', url, {}, ['frota:checklist:read', 'frota:condutor:write', 'frota:os:write'],
      [{ provide: FrotaChecklistService, useValue: checklist },
        { provide: FrotaAnaliseIaService, useValue: { estado: () => of({ disponivel: false, motivoIndisponivel: null, ultima: null }) } }]);

  beforeEach(() => {
    TestBed.resetTestingModule();
    checklist = {
      checklists: vi.fn(() => paginaDe([resumo])),
      checklist: vi.fn(() => of(detalhe)),
      foto: vi.fn(() => of(new Blob())),
      liberacoesCnh: vi.fn(() => paginaDe([])),
      pendencias: vi.fn(() => paginaDe([pendencia])),
      semChecklistHoje: vi.fn(() => of([{ idVeiculo: 'v2', placa: 'DEF4G56', idBaseOperacional: 'b1', baseNome: 'JUAZEIRO', motivo: 'Usado hoje sem checklist', ultimoChecklistEm: null, condutorAtualNome: null }])),
      catalogo: vi.fn(() => of({ geradoEm: '', modelos: [], veiculos: [], condutores: [], liberacoesCnh: [] }))
    };
  });

  afterEach(() => localStorage.clear());

  it('lista os preenchidos do mais recente, no servidor', async () => {
    const { el } = await abrir('/frota/checklists?aba=preenchidos');
    expect(checklist['checklists']).toHaveBeenCalledWith(expect.objectContaining({ comProblema: null }), expect.objectContaining({ sort: ['preenchidoEm,desc'] }));
    expect(el.textContent).toContain('MARIA TESTE');
    expect(el.textContent).toContain('1 Não OK');
    expect(el.textContent).toContain('Recebeu o veículo');
  });

  it('a linha abre o detalhe com a resposta, o histórico do item e a decisão', async () => {
    const { el, harness } = await abrir('/frota/checklists?aba=preenchidos');
    (el.querySelector('tbody tr td') as HTMLElement).click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(checklist['checklist']).toHaveBeenCalledWith('c1');
    const painel = document.body.textContent!;
    // O problema vem primeiro: etiqueta Não OK, o motivo em destaque, o histórico e a decisão.
    expect(painel).toContain('1 item com problema');
    expect(painel).toContain('0 de 1 decididos');
    expect(painel).toContain('Problemas apontados');
    expect(document.querySelector('.chk-problema__motivo')?.textContent?.trim()).toBe('Queimado');
    expect(painel).toContain('Não OK há 5 dias, em 4 checklists seguidos');
    expect(painel).toContain('Problema recorrente');
    expect(painel).toContain('Aguardando o gestor');
    expect(painel).toContain('Folha do checklist');
  });

  it('abre na fila de pendências agrupada por checklist, com os contadores das abas e as ações do gestor', async () => {
    const { el } = await abrir();
    expect(checklist['pendencias']).toHaveBeenCalledWith('ABERTA', [], expect.anything());
    expect(el.textContent).toContain('Faróis — Queimado');
    expect(el.textContent).toContain('1 recorrente');
    expect(el.textContent).toContain('1 no celular');
    expect(el.querySelector('[aria-label^="Abrir uma OS para os problemas de"]')).not.toBeNull();
  });

  it('por problema mostra item a item, com as ações de cada um', async () => {
    localStorage.setItem('frota-checklist-pendencias-agrupamento', 'problema');
    const { el } = await abrir();
    expect(el.textContent).toContain('Recorrente');
    expect(Array.from(el.querySelectorAll('th')).map((th) => th.textContent!.trim())).not.toContain('Decisão');
    expect(el.querySelector('[aria-label="Abrir OS para Faróis — Queimado"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Descartar Faróis — Queimado"]')).not.toBeNull();
  });

  it('a base escolhida no topo filtra as pendências e fica guardada', async () => {
    localStorage.setItem('ces.filtros.compartilhados', JSON.stringify({ 'frota.base': 'b1' }));
    await abrir();
    expect(checklist['pendencias']).toHaveBeenCalledWith('ABERTA', ['b1'], expect.anything());
    expect(checklist['semChecklistHoje']).toHaveBeenCalledWith(['b1']);
  });

  it('a aba sem checklist hoje mostra o motivo', async () => {
    const { el } = await abrir('/frota/checklists?aba=sem-checklist');
    expect(el.textContent).toContain('DEF4G56');
    expect(el.textContent).toContain('Usado hoje sem checklist');
  });

  it('a aba de liberações oferece liberar a quem edita condutores', async () => {
    const { el } = await abrir('/frota/checklists?aba=liberacoes');
    expect(checklist['liberacoesCnh']).toHaveBeenCalled();
    expect(el.textContent).toContain('Liberar condutor');
    expect(el.textContent).toContain('Nenhuma liberação de CNH');
  });
});
