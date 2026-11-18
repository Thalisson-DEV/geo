import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { GeoConfirmationService, NotificationService } from '@geo/ui';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { RhService } from '../../../../core/services/rh.service';
import { DevolucaoComercialDrawerComponent } from './devolucao-comercial-drawer.component';

/* eslint-disable @typescript-eslint/no-explicit-any */
const cabo = { id: 'm1', codigo: 'C-1', descricao: 'Cabo', unidadeMedida: 'M', detalhaSerie: false };
const medidor = { id: 'm2', codigo: 'MED', descricao: 'Medidor', unidadeMedida: 'UN', detalhaSerie: true };
const estoques = [
  { id: 'f1', nomeIdentificador: 'ALMOX', ativo: true, tipoEstoque: { nome: 'FISICO' } },
  { id: 'c1', nomeIdentificador: 'CAMPO', ativo: true, idEquipe: 'q1', tipoEstoque: { nome: 'CAMPO' } }
];
const saldos = [
  { id: 's1', material: cabo, quantidade: 10, condicao: 'NOVO' },
  { id: 's2', material: cabo, quantidade: 3, condicao: 'SUCATA' },
  { id: 's3', material: medidor, quantidade: 2, condicao: 'NOVO' }
];

describe('DevolucaoComercialDrawerComponent', () => {
  let almox: Record<string, ReturnType<typeof vi.fn>>;
  let notificacoes: Record<string, ReturnType<typeof vi.fn>>;
  let confirmar: ReturnType<typeof vi.fn>;

  function abrir() {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AlmoxarifadoService, useValue: almox },
        { provide: NotificationService, useValue: notificacoes },
        { provide: GeoConfirmationService, useValue: { confirm: confirmar } },
        { provide: RhService, useValue: { listarEquipes: () => of({ content: [{ id: 'q1', codigo: 'EQ-1' }, { id: 'q2', codigo: 'EQ-2' }] }) } }
      ]
    });
    const fixture = TestBed.createComponent(DevolucaoComercialDrawerComponent);
    fixture.componentRef.setInput('estoques', estoques);
    fixture.componentRef.setInput('visible', true);
    TestBed.tick();
    return { fixture, tela: fixture.componentInstance as unknown as Record<string, any> };
  }

  function comEquipe(tela: Record<string, any>) {
    tela['trocarEquipe']('q1');
    tela['idDestino'].set('f1');
    TestBed.tick();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    almox = {
      listarSaldos: vi.fn(() => of({ content: saldos })),
      listarSeriais: vi.fn(() => of({ content: [{ numSerie: 'B' }, { numSerie: 'A' }] })),
      registrarDevolucaoComercial: vi.fn(() => of('id'))
    };
    notificacoes = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };
    confirmar = vi.fn(async () => true);
  });

  it('só aceita almoxarifado físico e busca o saldo no estoque de campo da equipe', () => {
    const { tela } = abrir();
    comEquipe(tela);

    expect(tela['opcoesDestino']().map((o: any) => o.value)).toEqual(['f1']);
    expect(almox['listarSaldos']).toHaveBeenCalledWith({ idEstoque: 'c1', size: 1000 });
  });

  it('avisa quando a equipe não tem estoque de campo e não registra', async () => {
    const { tela } = abrir();
    tela['trocarEquipe']('q2');
    TestBed.tick();

    await tela['registrar']();

    expect(tela['estoqueCampo']()).toBeNull();
    expect(notificacoes['warning']).toHaveBeenCalledWith('A equipe não tem estoque de campo ativo.');
  });

  it('abre em sucata, com dar baixa marcado; material novo vem para guardar', () => {
    const { tela } = abrir();
    comEquipe(tela);
    expect(tela['condicaoFiltro']()).toBe('SUCATA');
    expect(tela['opcoesSaldo']().map((o: any) => o.value)).toEqual(['s2']);

    tela['escolher']('s2');
    expect(tela['linhas']()[0]).toMatchObject({ condicao: 'SUCATA', guardar: false });
    expect(tela['contagem']()).toEqual({ NOVO: 2, SUCATA: 0 });

    tela['condicaoFiltro'].set('NOVO');
    expect(tela['opcoesSaldo']().map((o: any) => o.value)).toEqual(['s1', 's3']);
    tela['escolher']('s1');
    expect(tela['linhas']()[1]).toMatchObject({ condicao: 'NOVO', guardar: true });
  });

  it('não registra quantidade acima do saldo da condição', async () => {
    const { tela } = abrir();
    comEquipe(tela);
    tela['condicaoFiltro'].set('SUCATA');
    tela['escolher']('s2');
    tela['alterar'](tela['linhas']()[0], { quantidade: 4 });

    await tela['registrar']();

    expect(notificacoes['warning']).toHaveBeenCalledWith('C-1: a quantidade passa do saldo da equipe.');
    expect(almox['registrarDevolucaoComercial']).not.toHaveBeenCalled();
  });

  it('busca as séries na condição do item e envia uma linha por série, com o destino de cada item', async () => {
    const { tela } = abrir();
    comEquipe(tela);
    tela['escolher']('s3');
    tela['escolher']('s1');
    const [serial, comum] = tela['linhas']();
    expect(almox['listarSeriais']).toHaveBeenCalledWith(expect.objectContaining({ idEstoque: 'c1', idMaterial: 'm2', condicao: 'NOVO' }));
    expect(tela['disponiveis'](serial)).toEqual(['A', 'B']);

    tela['alterar'](serial, { series: ['A', 'B'] });
    tela['alterar'](comum, { quantidade: 2, guardar: false });
    tela['observacao'].set('  sobra  ');
    await tela['registrar']();

    expect(confirmar.mock.calls[0][0].message).toContain('1 em baixa');
    expect(almox['registrarDevolucaoComercial']).toHaveBeenCalledWith({
      idEquipe: 'q1',
      idEstoqueDestino: 'f1',
      observacao: 'sobra',
      itens: [
        { idMaterial: 'm2', quantidade: 1, condicao: 'NOVO', numSerie: 'A', guardarNoEstoque: true },
        { idMaterial: 'm2', quantidade: 1, condicao: 'NOVO', numSerie: 'B', guardarNoEstoque: true },
        { idMaterial: 'm1', quantidade: 2, condicao: 'NOVO', guardarNoEstoque: false }
      ]
    });
  });

  it('material com série segue as séries da equipe, mesmo com o saldo divergente', () => {
    const { tela } = abrir();
    comEquipe(tela);
    tela['escolher']('s3');
    tela['alterar'](tela['linhas']()[0], { series: ['A', 'B', 'C'] });

    expect(tela['acimaDoSaldo'](tela['linhas']()[0])).toBe(false);
  });

  it('trocar a equipe limpa os materiais', () => {
    const { tela } = abrir();
    comEquipe(tela);
    tela['escolher']('s1');

    tela['trocarEquipe']('q2');

    expect(tela['linhas']()).toHaveLength(0);
    expect(notificacoes['info']).toHaveBeenCalled();
  });

  it('sucesso fecha e avisa a lista; erro mantém o que foi preenchido', async () => {
    almox['registrarDevolucaoComercial'].mockReturnValueOnce(throwError(() => new Error('falhou')));
    const { fixture, tela } = abrir();
    const registrada = vi.fn();
    fixture.componentInstance.registrada.subscribe(registrada);
    comEquipe(tela);
    tela['escolher']('s1');
    tela['alterar'](tela['linhas']()[0], { quantidade: 1 });

    await tela['registrar']();
    expect(notificacoes['error']).toHaveBeenCalled();
    expect(tela['linhas']()).toHaveLength(1);

    await tela['registrar']();
    expect(registrada).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.visible()).toBe(false);
  });
});
