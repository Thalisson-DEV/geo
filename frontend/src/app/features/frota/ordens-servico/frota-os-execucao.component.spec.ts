import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../core/lookup';
import { OrdemServicoDetalhe } from '../../../core/models/frota.models';
import { FrotaService } from '../../../core/services/frota.service';
import { OPCOES_VAZIAS, OS_BASE } from '../shared/frota-teste';
import { FrotaOrdemServicoConclusaoComponent } from './frota-ordem-servico-conclusao.component';
import { FrotaOsExecucaoComponent } from './frota-os-execucao.component';
import { FrotaOsLancamentoComponent } from './frota-os-lancamento.component';

// Acesso aos membros protegidos que o template usa.
type Tela = Record<string, any>;

function detalhe(parcial: Partial<OrdemServicoDetalhe['ordem']> = {}, comLancamentos = true): OrdemServicoDetalhe {
  return {
    ordem: { ...OS_BASE, tipoOficina: 'INTERNA', situacao: 'EM_ANDAMENTO', ...parcial },
    itens: [{ idItem: 'i1', nome: 'PASTILHA', natureza: 'SUSPENSAO_FREIOS', naturezaRotulo: 'Suspensão / freios', repeticao: null }],
    orcamentos: [],
    historico: [],
    kmAtualVeiculo: null,
    avisos: [],
    servicos: comLancamentos
      ? [{ id: 's1', descricao: 'Troca de pastilhas', idItemManutencao: 'i1', itemManutencao: 'PASTILHA', idMecanico: 'c1',
          mecanico: 'MECANICO TESTE', quantidade: 1.5, valorUnitario: 80, subtotal: 120 }]
      : [],
    pecas: comLancamentos
      ? [{ id: 'p1', descricao: 'Óleo 15W40', codigo: null, origem: 'ESTOQUE', origemRotulo: 'Estoque', quantidade: 4,
          unidade: 'L', valorUnitario: 32.5, subtotal: 130 }]
      : [],
    totais: comLancamentos
      ? { servicos: 120, pecas: 130, desconto: 20, acrescimo: 0, total: 230, calculado: true }
      : { servicos: 0, pecas: 0, desconto: 0, acrescimo: 0, total: null, calculado: false },
    preventivas: []
  };
}

function montar<T>(tipo: Type<T>, frota: object, entradas: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [tipo],
    providers: [
      provideNoopAnimations(),
      MessageService,
      ConfirmationService,
      { provide: FrotaService, useValue: frota },
      {
        provide: LookupStore,
        useValue: {
          operationalBases: signal([]),
          loadBootstrap: () => of({}),
          searchCollaborators: vi.fn(() => of({ items: [{ value: 'c2', label: 'ANA TESTE' }] }))
        }
      }
    ]
  });
  const fixture = TestBed.createComponent(tipo) as ComponentFixture<T>;
  for (const [nome, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nome, valor);
  fixture.detectChanges();
  return { fixture, tela: fixture.componentInstance as unknown as Tela, el: fixture.nativeElement as HTMLElement };
}

describe('FrotaOsExecucaoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('mostra serviços, peças e totais e oferece os lançamentos com a OS aberta', () => {
    const { el } = montar(FrotaOsExecucaoComponent, {}, { detalhe: detalhe(), podeEditar: true });
    const texto = el.textContent ?? '';

    expect(texto).toContain('Troca de pastilhas');
    expect(texto).toContain('MECANICO TESTE');
    expect(texto).toContain('Óleo 15W40');
    expect(texto).toMatch(/R\$\s230,00/);
    expect(texto).toContain('Adicionar serviço');
    expect(texto).toContain('Desconto e acréscimo');
  });

  it('OS concluída fica só para leitura', () => {
    const { el } = montar(FrotaOsExecucaoComponent, {}, { detalhe: detalhe({ situacao: 'CONCLUIDA' }), podeEditar: true });
    const texto = el.textContent ?? '';

    expect(texto).not.toContain('Adicionar serviço');
    expect(texto).not.toContain('Adicionar peça');
    expect(el.querySelector('button[aria-label^="Excluir"]')).toBeNull();
  });

  it('desconto acima da soma não é enviado', () => {
    const frota = { definirAjustesOs: vi.fn(() => of(detalhe())) };
    const { tela } = montar(FrotaOsExecucaoComponent, frota, { detalhe: detalhe(), podeEditar: true });
    tela['abrirAjustes']();
    tela['desconto'].set(300);

    tela['salvarAjustes']();

    expect(tela['erroDesconto']()).toContain('não pode passar');
    expect(frota.definirAjustesOs).not.toHaveBeenCalled();
  });
});

describe('FrotaOsLancamentoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('na oficina interna exige o mecânico colaborador', () => {
    const frota = { lancarServicoOs: vi.fn(() => of(detalhe())) };
    const { tela } = montar(FrotaOsLancamentoComponent, frota, { tipo: 'servico', detalhe: detalhe(), visivel: true });
    tela['nome'].set('Regulagem');
    tela['valorUnitario'].set(50);

    tela['salvar']();

    expect(tela['erro']('mecanico')).toBe('Escolha o mecânico.');
    expect(frota.lancarServicoOs).not.toHaveBeenCalled();
  });

  it('na oficina externa envia só o nome do mecânico', () => {
    const frota = { lancarServicoOs: vi.fn(() => of(detalhe())) };
    const { tela } = montar(FrotaOsLancamentoComponent, frota, {
      tipo: 'servico', detalhe: detalhe({ tipoOficina: 'EXTERNA' }), visivel: true
    });
    tela['nome'].set('Regulagem');
    tela['mecanicoNome'].set(' Zé ');
    tela['valorUnitario'].set(50);

    tela['salvar']();

    expect(frota.lancarServicoOs).toHaveBeenCalledWith('os1', expect.objectContaining({
      descricao: 'Regulagem', idMecanico: null, mecanicoNome: 'Zé', quantidade: 1, valorUnitario: 50, idItemManutencao: 'i1'
    }));
  });

  it('peça vai com origem, unidade e subtotal previsto', () => {
    const frota = { lancarPecaOs: vi.fn(() => of(detalhe())) };
    const { tela } = montar(FrotaOsLancamentoComponent, frota, { tipo: 'peca', detalhe: detalhe(), visivel: true });
    tela['nome'].set('Filtro de ar');
    tela['origem'].set('COMPRA');
    tela['quantidade'].set(2);
    tela['valorUnitario'].set(45.5);

    expect(tela['subtotal']()).toBe(91);
    tela['salvar']();

    expect(frota.lancarPecaOs).toHaveBeenCalledWith('os1', expect.objectContaining({
      descricao: 'Filtro de ar', origem: 'COMPRA', quantidade: 2, unidade: 'UN', valorUnitario: 45.5
    }));
  });
});

describe('FrotaOrdemServicoConclusaoComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  const frotaConclusao = () => ({
    concluirOrdemServico: vi.fn(() => of(detalhe({ situacao: 'CONCLUIDA' }))),
    itensManutencao: vi.fn(() => of({ content: [] })),
    fornecedoresOficina: vi.fn(() => of([]))
  });

  it('não conclui sem a causa', () => {
    const frota = frotaConclusao();
    const { tela } = montar(FrotaOrdemServicoConclusaoComponent, frota, {
      ordem: detalhe(), opcoes: OPCOES_VAZIAS, visivel: true
    });
    tela['inicio'].set(new Date(Date.now() - 3600_000));
    tela['descricaoServico'].set('Feito');

    tela['salvar']();

    expect(tela['erros']()['causa']).toBe('Escolha a causa da manutenção.');
    expect(frota.concluirOrdemServico).not.toHaveBeenCalled();
  });

  it('com lançamentos envia a causa e deixa o valor para o cálculo do servidor', () => {
    const frota = frotaConclusao();
    const { tela } = montar(FrotaOrdemServicoConclusaoComponent, frota, {
      ordem: detalhe(), opcoes: OPCOES_VAZIAS, visivel: true
    });
    tela['inicio'].set(new Date(Date.now() - 3600_000));
    tela['descricaoServico'].set('Feito');
    tela['causa'].set('AVARIA');
    tela['valorTotal'].set(999);

    tela['salvar']();

    expect(frota.concluirOrdemServico).toHaveBeenCalledWith('os1', expect.objectContaining({ causa: 'AVARIA', valorTotal: null }));
  });

  it('preventiva sugere a causa serviço preventivo', () => {
    const { tela } = montar(FrotaOrdemServicoConclusaoComponent, frotaConclusao(), {
      ordem: detalhe({ tipoManutencao: 'PREVENTIVA' }), opcoes: OPCOES_VAZIAS, visivel: true
    });

    expect(tela['causa']()).toBe('SERVICO_PREVENTIVO');
  });
});
