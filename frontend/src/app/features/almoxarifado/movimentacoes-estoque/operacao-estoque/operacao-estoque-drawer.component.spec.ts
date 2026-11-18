import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { CesConfirmationService, NotificationService } from '@ces/ui';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { OperacaoEstoqueDrawerComponent, TipoOperacaoEstoque } from './operacao-estoque-drawer.component';

/* eslint-disable @typescript-eslint/no-explicit-any */
const cabo = { id: 'm1', codigo: 'C-1', descricao: 'Cabo', unidadeMedida: 'M', detalhaSerie: false };
const medidor = { id: 'm2', codigo: 'MED', descricao: 'Medidor', unidadeMedida: 'UN', detalhaSerie: true };
const saldos = [
  { id: 's1', material: cabo, quantidade: 10, condicao: 'NOVO' },
  { id: 's2', material: medidor, quantidade: 2, condicao: 'NOVO' },
  { id: 's3', material: cabo, quantidade: 0, condicao: 'SUCATA' }
];

describe('OperacaoEstoqueDrawerComponent', () => {
  let almox: Record<string, ReturnType<typeof vi.fn>>;
  let notificacoes: Record<string, ReturnType<typeof vi.fn>>;
  let confirmar: ReturnType<typeof vi.fn>;

  function abrir(tipo: TipoOperacaoEstoque) {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AlmoxarifadoService, useValue: almox },
        { provide: NotificationService, useValue: notificacoes },
        { provide: CesConfirmationService, useValue: { confirm: confirmar } },
        { provide: LookupStore, useValue: { searchMaterials: () => of({ items: [], nextCursor: null, hasMore: false }) } }
      ]
    });
    const fixture = TestBed.createComponent(OperacaoEstoqueDrawerComponent);
    fixture.componentRef.setInput('tipo', tipo);
    fixture.componentRef.setInput('estoques', [{ id: 'e1', nomeIdentificador: 'ALMOX' }, { id: 'e2', nomeIdentificador: 'EQUIPE' }]);
    fixture.componentRef.setInput('visible', true);
    TestBed.tick();
    return { fixture, tela: fixture.componentInstance as unknown as Record<string, any> };
  }

  function comOrigem(tela: Record<string, any>) {
    tela['trocarOrigem']('e1');
    TestBed.tick();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    almox = {
      listarSaldos: vi.fn(() => of({ content: saldos })),
      listarSeriais: vi.fn(() => of({ content: [{ numSerie: 'A2' }, { numSerie: 'A1' }] })),
      buscarMaterialPorId: vi.fn(() => of(cabo)),
      registrarEntradaLote: vi.fn(() => of(undefined)),
      registrarBaixaLote: vi.fn(() => of(undefined)),
      registrarTransferenciaLote: vi.fn(() => of('id'))
    };
    notificacoes = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };
    confirmar = vi.fn(async () => true);
  });

  it('só oferece o que tem saldo e mostra o saldo antes e depois', () => {
    const { tela } = abrir('BAIXA');
    comOrigem(tela);
    expect(tela['opcoesSaldo']().map((o: any) => o.value)).toEqual(['s1', 's2']);

    tela['escolherSaldo']('s1');
    const linha = tela['linhas']()[0];
    tela['alterar'](linha, { quantidade: 4 });
    expect(tela['saldoDepois'](tela['linhas']()[0])).toBe(6);
    expect(tela['opcoesSaldo']().map((o: any) => o.value)).toEqual(['s2']);
  });

  it('baixa exige motivo e observação, recusa quantidade acima do saldo e pede confirmação', async () => {
    const { tela } = abrir('BAIXA');
    comOrigem(tela);
    tela['escolherSaldo']('s1');
    tela['alterar'](tela['linhas']()[0], { quantidade: 11 });

    await tela['registrar'](false);
    expect(notificacoes['warning']).toHaveBeenCalledWith('Escolha o motivo.');
    tela['motivo'].set('PERDA_AVARIA');
    await tela['registrar'](false);
    expect(notificacoes['warning']).toHaveBeenCalledWith('Conte o que aconteceu com o material.');
    tela['observacao'].set('  caiu  ');
    await tela['registrar'](false);
    expect(notificacoes['warning']).toHaveBeenCalledWith('C-1: a quantidade passa do saldo disponível.');
    expect(almox['registrarBaixaLote']).not.toHaveBeenCalled();

    tela['alterar'](tela['linhas']()[0], { quantidade: 4 });
    await tela['registrar'](false);

    expect(confirmar).toHaveBeenCalledOnce();
    expect(almox['registrarBaixaLote']).toHaveBeenCalledWith(expect.objectContaining({
      idEstoqueOrigem: 'e1',
      motivo: 'PERDA_AVARIA',
      observacao: 'caiu',
      itens: [{ idMaterial: 'm1', quantidade: 4, condicao: 'NOVO' }]
    }));
  });

  it('não registra a baixa quando a confirmação é recusada', async () => {
    confirmar.mockResolvedValue(false);
    const { tela } = abrir('BAIXA');
    comOrigem(tela);
    tela['motivo'].set('OUTROS');
    tela['observacao'].set('x');
    tela['escolherSaldo']('s1');
    tela['alterar'](tela['linhas']()[0], { quantidade: 1 });

    await tela['registrar'](false);

    expect(almox['registrarBaixaLote']).not.toHaveBeenCalled();
  });

  it('entrada inclui séries coladas, avisa as repetidas e manda uma linha por série', async () => {
    almox['buscarMaterialPorId'].mockReturnValue(of(medidor));
    const { tela } = abrir('ENTRADA');
    tela['idDestino'].set('e1');
    tela['motivo'].set('OUTROS');
    tela['escolherMaterial']('m2');
    const linha = tela['linhas']()[0];

    tela['digitarSeries'](linha, 'S1, S2\nS2');
    tela['incluirSeries'](linha);
    tela['digitarSeries'](tela['linhas']()[0], 's1 S3');
    tela['incluirSeries'](tela['linhas']()[0]);

    expect(tela['linhas']()[0].series).toEqual(['S1', 'S2', 'S3']);
    expect(notificacoes['warning']).toHaveBeenCalledWith('Já na lista: s1.');

    await tela['registrar'](false);
    expect(almox['registrarEntradaLote'].mock.calls[0][0].itens).toHaveLength(3);
    expect(almox['registrarEntradaLote'].mock.calls[0][0].itens[0]).toEqual({ idMaterial: 'm2', quantidade: 1, numSerie: 'S1', condicao: 'NOVO' });
  });

  it('colar séries na baixa só marca as do estoque e deixa as outras no campo', () => {
    const { tela } = abrir('BAIXA');
    comOrigem(tela);
    tela['escolherSaldo']('s2');
    const linha = tela['linhas']()[0];

    tela['digitarSeries'](linha, 'a1 ZZ');
    tela['incluirSeries'](linha);

    expect(tela['linhas']()[0].series).toEqual(['A1']);
    expect(tela['textoSeries']()[linha.chave]).toBe('ZZ');
    expect(notificacoes['warning']).toHaveBeenCalledWith('Fora deste estoque: ZZ.');
  });

  it('transferir tudo traz o saldo inteiro, com as séries marcadas, e passa pelas assinaturas', async () => {
    const { tela } = abrir('TRANSFERENCIA');
    comOrigem(tela);
    tela['idDestino'].set('e2');
    expect(tela['opcoesDestino']().map((o: any) => o.value)).toEqual(['e2']);

    tela['transferirTudo']();
    expect(tela['linhas']().map((l: any) => tela['quantidade'](l))).toEqual([10, 2]);

    await tela['registrar'](false);
    expect(tela['assinando']()).toBe(true);
    expect(almox['registrarTransferenciaLote']).not.toHaveBeenCalled();

    tela['enviar']();
    expect(almox['registrarTransferenciaLote']).toHaveBeenCalledWith(expect.objectContaining({ assinaturaEntregador: 'FISICA', assinaturaRecebedor: 'FISICA' }));
    expect(almox['registrarTransferenciaLote'].mock.calls[0][0].itens).toHaveLength(3);
  });

  it('trocar a origem limpa os materiais; inverter troca os estoques', () => {
    const { tela } = abrir('TRANSFERENCIA');
    comOrigem(tela);
    tela['idDestino'].set('e2');
    tela['escolherSaldo']('s1');

    tela['inverter']();

    expect(tela['idOrigem']()).toBe('e2');
    expect(tela['idDestino']()).toBe('e1');
    expect(tela['linhas']()).toHaveLength(0);
    expect(notificacoes['info']).toHaveBeenCalled();
  });

  it('registrar e fazer outra mantém estoque e motivo, limpa os itens e recarrega o saldo', async () => {
    const { fixture, tela } = abrir('ENTRADA');
    const registrada = vi.fn();
    fixture.componentInstance.registrada.subscribe(registrada);
    tela['idDestino'].set('e1');
    tela['motivo'].set('OUTROS');
    TestBed.tick();
    tela['escolherMaterial']('m1');
    tela['alterar'](tela['linhas']()[0], { quantidade: 3 });
    almox['listarSaldos'].mockClear();

    await tela['registrar'](true);

    expect(registrada).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.visible()).toBe(true);
    expect(tela['idDestino']()).toBe('e1');
    expect(tela['motivo']()).toBe('OUTROS');
    expect(tela['linhas']()).toHaveLength(0);
    expect(almox['listarSaldos']).toHaveBeenCalledOnce();
  });

  it('erro do servidor mantém o que foi preenchido', async () => {
    almox['registrarEntradaLote'].mockReturnValue(throwError(() => new Error('falhou')));
    const { fixture, tela } = abrir('ENTRADA');
    tela['idDestino'].set('e1');
    tela['motivo'].set('OUTROS');
    tela['escolherMaterial']('m1');
    tela['alterar'](tela['linhas']()[0], { quantidade: 3 });

    await tela['registrar'](false);

    expect(notificacoes['error']).toHaveBeenCalled();
    expect(fixture.componentInstance.visible()).toBe(true);
    expect(tela['linhas']()).toHaveLength(1);
  });
});
