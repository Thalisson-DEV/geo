import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrdemServicoDetalhe } from '../../../core/models/frota.models';
import { OPCOES_VAZIAS, OS_BASE, abrirTelaFrota, paginaDe } from '../shared/frota-teste';
import { FrotaOrdemServicoDetalheComponent } from './frota-ordem-servico-detalhe.component';

function detalhe(parcial: Partial<OrdemServicoDetalhe['ordem']> = {}): OrdemServicoDetalhe {
  return {
    ordem: { ...OS_BASE, ...parcial },
    itens: [
      {
        idItem: 'i1',
        nome: 'PASTILHA DE FREIO DIANTEIRA',
        natureza: 'SUSPENSAO_FREIOS',
        naturezaRotulo: 'Suspensão / freios',
        repeticao: { idOsAnterior: 'os0', numeroOsAnterior: 30, fimRealAnterior: '2026-09-20T10:00:00-03:00', diasDesdeAnterior: 20, janelaDias: 90 }
      }
    ],
    orcamentos: [
      {
        idSolicitacao: 's1', tipo: 'COMPRA', numero: 77, status: 'SOLICITADO', valor: 1200, valorAprovado: null,
        fornecedor: 'OFICINA DO ZÉ', descricao: 'Pastilhas', dataSubmissao: null, dataDecisao: null, motivoRejeicao: null
      }
    ],
    historico: [{ tipo: 'ABERTA', tipoRotulo: 'Aberta', descricao: 'Urgente — Freio', usuario: 'gestor', ocorridoEm: '2026-10-10T08:00:00-03:00' }],
    kmAtualVeiculo: 12050,
    avisos: [],
    servicos: [],
    pecas: [],
    totais: { servicos: 0, pecas: 0, desconto: 0, acrescimo: 0, total: null, calculado: false },
    preventivas: []
  };
}

// As abas medem o espaço com ResizeObserver, que o jsdom não implementa.
class ResizeObserverFalso {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverFalso as unknown as typeof ResizeObserver;

describe('FrotaOrdemServicoDetalheComponent', () => {
  let frota: Record<string, ReturnType<typeof vi.fn>>;
  let permissoes: string[];

  const abrir = (url = '/frota/ordens-servico/os1') =>
    abrirTelaFrota(FrotaOrdemServicoDetalheComponent, 'frota/ordens-servico/:id', url, frota, permissoes);

  beforeEach(() => {
    TestBed.resetTestingModule();
    permissoes = ['frota:os:read'];
    frota = {
      opcoes: vi.fn(() => of(OPCOES_VAZIAS)),
      detalharOrdemServico: vi.fn(() => of(detalhe())),
      documentosFiscaisOs: vi.fn(() => of([])),
      anexosOs: vi.fn(() => of([])),
      listarOrdensServico: vi.fn(() => of({ content: [], page: { size: 200, number: 0, totalElements: 0, totalPages: 0 } })),
      itensManutencao: vi.fn(() => paginaDe([])),
      fornecedoresOficina: vi.fn(() => of([])),
      listarVeiculos: vi.fn(() => paginaDe([])),
      listarCondutores: vi.fn(() => paginaDe([])),
      cancelarOrdemServico: vi.fn(() => of(detalhe({ situacao: 'CANCELADA', paradaEmCurso: false }))),
      alterarParadaOrdemServico: vi.fn(() => of(detalhe({ paradaEmCurso: false, liberadoEm: '2026-10-12T10:00:00-03:00' })))
    };
  });

  afterEach(() => localStorage.clear());

  it('mostra situação, prazo, parada, orçamento e repetição', async () => {
    const { el } = await abrir();
    expect(frota['detalharOrdemServico']).toHaveBeenCalledWith('os1');
    const texto = el.textContent as string;
    expect(texto).toContain('OS 42 · ABC-1234');
    expect(texto).toContain('Em andamento');
    expect(texto).toContain('Prazo estourado');
    expect(texto).toContain('Parado');
    expect(texto).toContain('Aguardando aprovação');
    expect(texto).toContain('1 item');
  });

  it('quem só lê não vê ações de mudança', async () => {
    const { el } = await abrir();
    const cabecalho = el.querySelector('geo-page-header')?.textContent ?? '';
    expect(cabecalho).not.toContain('Concluir');
    expect(cabecalho).not.toContain('Cancelar OS');
    expect(el.textContent).not.toContain('Liberar veículo');
  });

  it('a oficina conclui e altera a previsão; a operação edita e cancela', async () => {
    permissoes = ['frota:os:read', 'frota:os:executar'];
    let tela = await abrir();
    let cabecalho = tela.el.querySelector('geo-page-header')?.textContent ?? '';
    expect(cabecalho).toContain('Concluir');
    expect(cabecalho).toContain('Alterar previsão');
    expect(cabecalho).not.toContain('Cancelar OS');

    TestBed.resetTestingModule();
    permissoes = ['frota:os:read', 'frota:os:write'];
    tela = await abrir();
    cabecalho = tela.el.querySelector('geo-page-header')?.textContent ?? '';
    expect(cabecalho).toContain('Editar');
    expect(cabecalho).toContain('Cancelar OS');
    expect(cabecalho).not.toContain('Concluir');
  });

  it('OS concluída não oferece ações', async () => {
    permissoes = ['frota:os:read', 'frota:os:write', 'frota:os:executar'];
    frota['detalharOrdemServico'] = vi.fn(() => of(detalhe({ situacao: 'CONCLUIDA', atrasada: false, paradaEmCurso: false })));
    const { el } = await abrir();
    const cabecalho = el.querySelector('geo-page-header')?.textContent ?? '';
    expect(cabecalho).not.toContain('Concluir');
    expect(cabecalho).not.toContain('Editar');
  });

  it('solicitar compra leva ao financeiro com a OS como origem', async () => {
    permissoes = ['frota:os:read', 'frota:os:write', 'financeiro:compra:write'];
    const { componente } = await abrir('/frota/ordens-servico/os1?aba=orcamentos');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (componente as unknown as { solicitar(t: string): void }).solicitar('COMPRA');
    expect(navegar).toHaveBeenCalledWith(['/financeiro', 'compras', 'nova'], {
      queryParams: { origem: 'FROTA_OS', origemId: 'os1' }
    });
  });

  it('cancelar envia o motivo e mostra a OS cancelada', async () => {
    permissoes = ['frota:os:read', 'frota:os:write'];
    const { componente, harness, el } = await abrir();
    (componente as unknown as { cancelar(m: string): void }).cancelar('Aberta em duplicidade');
    harness.detectChanges();
    expect(frota['cancelarOrdemServico']).toHaveBeenCalledWith('os1', 'Aberta em duplicidade');
    expect(el.textContent).toContain('Cancelada');
  });

  it('liberar o veículo chama a parada com parado=false', async () => {
    permissoes = ['frota:os:read', 'frota:os:executar'];
    const { componente } = await abrir();
    (componente as unknown as { alternarParada(): void }).alternarParada();
    expect(frota['alterarParadaOrdemServico']).toHaveBeenCalledWith('os1', false);
  });

  it('mostra o erro quando a OS não carrega', async () => {
    frota['detalharOrdemServico'] = vi.fn(() => throwError(() => ({ error: { detail: 'Ordem de serviço não encontrada.' } })));
    const { el } = await abrir();
    expect(el.textContent).toContain('Não foi possível carregar a OS');
    expect(el.textContent).toContain('Ordem de serviço não encontrada.');
  });
});
