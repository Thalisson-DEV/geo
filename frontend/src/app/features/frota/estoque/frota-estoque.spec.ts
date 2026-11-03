import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../core/lookup';
import { AlmoxarifadoFrota, MovimentoEstoqueFrota, PecaFrota, SaldoPecaFrota } from '../../../core/models/frota-pneu.models';
import { AuthService } from '../../../core/services/auth.service';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { FrotaService } from '../../../core/services/frota.service';
import { paginaDe } from '../shared/frota-teste';
import { FrotaEstoqueMovimentoDrawerComponent } from './frota-estoque-movimento-drawer.component';
import { FrotaEstoqueComponent } from './frota-estoque.component';
import { casasDecimais, quantidadeMovimento, situacaoItem } from './frota-estoque.util';
import { FrotaPecaDrawerComponent } from './frota-peca-drawer.component';

registerLocaleData(localePt, 'pt-BR');

// As abas do PrimeNG observam o tamanho da lista; o jsdom não tem ResizeObserver.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

// Acesso aos membros protegidos que o template usa.
type Tela = Record<string, any>;

const A: AlmoxarifadoFrota = { id: 'a', nome: 'OFICINA A', idBaseOperacional: null, baseOperacional: null, ativo: true };
const B: AlmoxarifadoFrota = { ...A, id: 'b', nome: 'OFICINA B' };

const PECA: PecaFrota = { id: 'p1', codigo: 'FO-1', descricao: 'Filtro de óleo', unidade: 'UN', grupo: 'Filtros', ativo: true, saldoTotal: 5 };
const OLEO: PecaFrota = { id: 'p2', codigo: 'OL-1', descricao: 'Óleo', unidade: 'L', grupo: 'Lubrificantes', ativo: true, saldoTotal: 0 };

// A API omite os campos nulos: custoMedio e estoqueMinimo podem vir ausentes no JSON.
function saldo(extra: Partial<SaldoPecaFrota> = {}): SaldoPecaFrota {
  return {
    idEstoque: 'a', estoque: 'OFICINA A', idMaterial: 'p1', codigo: 'FO-1', descricao: 'Filtro de óleo', unidade: 'UN', grupo: 'Filtros',
    quantidade: 5, custoMedio: 10, valorTotal: 50, abaixoMinimo: false, ...extra
  } as SaldoPecaFrota;
}

function servicoFalso(extra: Partial<Record<keyof FrotaPneuService, unknown>> = {}): any {
  return {
    almoxarifados: vi.fn(() => of([A, B])),
    pecas: vi.fn(() => paginaDe([PECA, OLEO])),
    grupos: vi.fn(() => of(['Filtros'])),
    saldos: vi.fn(() => of([saldo(), saldo({ idEstoque: 'b', estoque: 'OFICINA B', quantidade: 1, abaixoMinimo: true, estoqueMinimo: 3 })])),
    resumoEstoque: vi.fn(() => of({ itens: 2, valorTotal: 60, entradas: 0, saidas: 0, abaixoMinimo: 1, semSaldo: 0 })),
    movimentos: vi.fn(() => paginaDe<MovimentoEstoqueFrota>([])),
    entrada: vi.fn(() => of([])),
    saida: vi.fn(() => of([])),
    transferencia: vi.fn(() => of([])),
    ajuste: vi.fn(() => of(null)),
    desativarPeca: vi.fn(() => of(undefined)),
    salvarPeca: vi.fn(() => of(PECA)),
    definirParametros: vi.fn(() => of(saldo())),
    ...extra
  };
}

function montar<T>(componente: Type<T>, servico: object, entradas: Record<string, unknown> = {}, permissoes = ['frota:estoque:read', 'frota:estoque:write']): ComponentFixture<T> {
  TestBed.configureTestingModule({
    imports: [componente],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      ConfirmationService,
      MessageService,
      { provide: FrotaPneuService, useValue: servico },
      { provide: FinanceiroService, useValue: {} },
      { provide: FrotaService, useValue: { fornecedoresOficina: () => of([]), listarVeiculos: () => paginaDe([]) } },
      { provide: LookupStore, useValue: { loadBootstrap: () => of(null), operationalBases: signal([]) } },
      { provide: AuthService, useValue: { currentUser: signal({ permissoes }) } }
    ]
  });
  const fixture = TestBed.createComponent(componente);
  Object.entries(entradas).forEach(([chave, valor]) => fixture.componentRef.setInput(chave, valor));
  fixture.detectChanges();
  return fixture;
}

function drawer(operacao: string, servico = servicoFalso(), saldos: SaldoPecaFrota[] = [saldo()]) {
  const fixture = montar(FrotaEstoqueMovimentoDrawerComponent, servico, { operacao, almoxarifados: [A, B], pecas: [PECA, OLEO], saldos, idEstoqueInicial: 'a' });
  fixture.componentRef.setInput('visivel', true);
  fixture.detectChanges();
  return { fixture, tela: fixture.componentInstance as unknown as Tela, servico };
}

afterEach(() => TestBed.resetTestingModule());

describe('utilitários do estoque da oficina', () => {
  it('peça contada por unidade não aceita fração; litro, quilo e metro aceitam', () => {
    expect(casasDecimais('UN')).toBe(0);
    expect(casasDecimais('JG')).toBe(0);
    expect(casasDecimais('L')).toBe(3);
    expect(casasDecimais(null)).toBe(3);
  });

  it('sem saldo vem antes de abaixo do mínimo', () => {
    expect(situacaoItem(saldo({ quantidade: 0, abaixoMinimo: true }))).toBe('SEM_SALDO');
    expect(situacaoItem(saldo({ abaixoMinimo: true }))).toBe('ABAIXO');
    expect(situacaoItem(saldo())).toBe('COM_SALDO');
  });

  it('a quantidade do movimento diz se somou ou tirou', () => {
    const m = { quantidade: 2, unidade: 'UN' } as MovimentoEstoqueFrota;
    expect(quantidadeMovimento({ ...m, tipo: 'ENTRADA' })).toBe('+2 UN');
    expect(quantidadeMovimento({ ...m, tipo: 'SAIDA' })).toBe('−2 UN');
    expect(quantidadeMovimento({ ...m, tipo: 'TRANSFERENCIA' })).toBe('2 UN');
    expect(quantidadeMovimento({ ...m, tipo: 'AJUSTE', idEstoqueDestino: 'a' })).toBe('+2 UN');
    expect(quantidadeMovimento({ ...m, tipo: 'AJUSTE', idEstoqueOrigem: 'a' })).toBe('−2 UN');
  });
});

describe('FrotaEstoqueComponent', () => {
  it('filtra os itens no navegador e sempre busca os saldos de todos os almoxarifados', () => {
    const servico = servicoFalso();
    const fixture = montar(FrotaEstoqueComponent, servico);
    const tela = fixture.componentInstance as unknown as Tela;
    expect(tela['itens']()).toHaveLength(2);

    tela['listaItens'].set('idEstoque', 'b');
    fixture.detectChanges();

    expect(tela['itens']().map((s: SaldoPecaFrota) => s.idEstoque)).toEqual(['b']);
    expect(tela['saldos']()).toHaveLength(2);
    for (const chamada of servico.saldos.mock.calls as unknown[][]) expect(chamada[0]).toBeNull();
  });

  it('o indicador de mínimo liga e desliga o recorte de itens para repor', async () => {
    const fixture = montar(FrotaEstoqueComponent, servicoFalso());
    const tela = fixture.componentInstance as unknown as Tela;

    await tela['alternarAbaixo']();
    expect(tela['soAbaixo']()).toBe(true);
    expect(tela['itens']().map((s: SaldoPecaFrota) => s.idEstoque)).toEqual(['b']);

    await tela['alternarAbaixo']();
    expect(tela['soAbaixo']()).toBe(false);
    expect(tela['itens']()).toHaveLength(2);
  });

  it('o almoxarifado filtrado vale também para as movimentações e para os totais', async () => {
    const servico = servicoFalso();
    const fixture = montar(FrotaEstoqueComponent, servico);
    const tela = fixture.componentInstance as unknown as Tela;

    tela['listaItens'].set('idEstoque', 'b');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));

    expect(tela['listaMovimentos'].applied().idEstoque).toBe('b');
    expect(servico.resumoEstoque).toHaveBeenLastCalledWith('b');
  });

  it('abrir um movimento do item fecha a peça e mostra as movimentações dela', async () => {
    const servico = servicoFalso();
    const fixture = montar(FrotaEstoqueComponent, servico);
    const tela = fixture.componentInstance as unknown as Tela;
    tela['abrirSaldo'](saldo({ idEstoque: 'b' }));

    await tela['verMovimentacoesDaPeca']();

    expect(tela['pecaAberta']()).toBe(false);
    expect(tela['aba']()).toBe('movimentos');
    expect(servico.movimentos).toHaveBeenLastCalledWith(expect.objectContaining({ idMaterial: 'p1', idEstoque: 'b' }), expect.anything());
  });

  it('a peça do catálogo lista todo almoxarifado ativo, mesmo sem saldo', () => {
    const fixture = montar(FrotaEstoqueComponent, servicoFalso({ saldos: vi.fn(() => of([saldo()])) }));
    const tela = fixture.componentInstance as unknown as Tela;

    tela['abrirPeca'](PECA);

    const locais = tela['locaisDaPeca']() as SaldoPecaFrota[];
    expect(locais.map((l) => [l.idEstoque, l.quantidade])).toEqual([['a', 5], ['b', 0]]);
  });

  it('erro ao carregar os almoxarifados não manda criar o primeiro', () => {
    const erro = { error: { detail: 'Falhou' } };
    const servico = servicoFalso({ almoxarifados: vi.fn(() => throwError(() => erro)) });
    const fixture = montar(FrotaEstoqueComponent, servico);
    expect(fixture.nativeElement.textContent).not.toContain('Crie o primeiro almoxarifado');
    expect(fixture.nativeElement.textContent).toContain('Não foi possível carregar os almoxarifados');
  });
});

describe('FrotaEstoqueMovimentoDrawerComponent', () => {
  it('na saída, só oferece a peça com saldo na origem e com a quantidade à vista', () => {
    const { tela } = drawer('SAIDA');
    const opcoes = tela['opcoesCatalogo']() as { label: string; value: string }[];
    expect(opcoes.map((o) => o.value)).toEqual(['p1']);
    expect(opcoes[0].label).toContain('5 UN');
  });

  it('a peça já escolhida em outra linha sai das opções', () => {
    const { tela } = drawer('ENTRADA');
    const [primeira] = tela['linhas']();
    tela['alterar'](primeira.chave, 'idMaterial', 'p1');
    tela['adicionar']();
    const segunda = tela['linhas']()[1];
    expect(tela['opcoesDaLinha'](segunda).map((o: { value: string }) => o.value)).toEqual(['p2']);
  });

  it('trocar a origem valida o saldo do almoxarifado escolhido, não o do filtro da tela', () => {
    const { tela } = drawer('SAIDA', servicoFalso(), [saldo(), saldo({ idEstoque: 'b', estoque: 'OFICINA B', quantidade: 2 })]);
    const [linha] = tela['linhas']();
    tela['alterar'](linha.chave, 'idMaterial', 'p1');
    tela['alterar'](linha.chave, 'quantidade', 3);
    expect(tela['erroQuantidade'](tela['linhas']()[0])).toBeUndefined();

    tela['escolherAlmoxarifado']('b');
    expect(tela['erroQuantidade'](tela['linhas']()[0])).toContain('Maior que o saldo (2 UN)');
  });

  it('peça sem saldo na nova origem deixa de estar escolhida', () => {
    const { tela } = drawer('SAIDA');
    const [linha] = tela['linhas']();
    tela['alterar'](linha.chave, 'idMaterial', 'p1');
    tela['escolherAlmoxarifado']('b');
    expect(tela['linhas']()[0].idMaterial).toBeNull();
    expect(tela['semSaldoNaOrigem']()).toBe(true);
  });

  it('com dois almoxarifados, a transferência já sugere o outro como destino', () => {
    const { tela } = drawer('TRANSFERENCIA');
    expect(tela['idDestino']()).toBe('b');
    tela['escolherAlmoxarifado']('b');
    expect(tela['idDestino']()).toBe('a');
  });

  it('a entrada mostra o novo custo médio antes de confirmar', () => {
    const { tela } = drawer('ENTRADA');
    const [linha] = tela['linhas']();
    tela['alterar'](linha.chave, 'idMaterial', 'p1');
    tela['alterar'](linha.chave, 'quantidade', 5);
    tela['alterar'](linha.chave, 'valorUnitario', 20);
    const info = tela['infoLinha'](tela['linhas']()[0]);
    expect(info.texto).toContain('saldo vai a 10 UN');
    expect(info.texto.replace(/\s/g, ' ')).toContain('custo médio R$ 15,00');
  });

  it('a saída avisa quando deixa a peça abaixo do mínimo', () => {
    const { tela } = drawer('SAIDA', servicoFalso(), [saldo({ estoqueMinimo: 4 })]);
    const [linha] = tela['linhas']();
    tela['alterar'](linha.chave, 'idMaterial', 'p1');
    tela['alterar'](linha.chave, 'quantidade', 2);
    const info = tela['infoLinha'](tela['linhas']()[0]);
    expect(info.texto).toContain('Fica com 3 UN');
    expect(info.aviso).toContain('Abaixo do mínimo de 4');
  });

  it('o ajuste mostra a diferença e não envia contagem igual ao saldo', () => {
    const servico = servicoFalso();
    const { tela } = drawer('AJUSTE', servico);
    const [linha] = tela['linhas']();
    tela['alterar'](linha.chave, 'idMaterial', 'p1');
    tela['alterar'](linha.chave, 'quantidade', 3);
    expect(tela['infoLinha'](tela['linhas']()[0]).texto).toContain('−2 UN');

    tela['alterar'](linha.chave, 'quantidade', 5);
    tela['observacao'].set('Contagem');
    tela['salvar']();

    expect(servico.ajuste).not.toHaveBeenCalled();
    expect(tela['erroQuantidade'](tela['linhas']()[0])).toContain('Igual ao saldo');
  });

  it('saldo inicial não leva nota nem fornecedor', () => {
    const servico = servicoFalso();
    const { tela } = drawer('ENTRADA', servico);
    tela['motivo'].set('SALDO_INICIAL');
    tela['documento'].set('NF 1');
    tela['idFornecedor'].set('f1');
    const [linha] = tela['linhas']();
    tela['alterar'](linha.chave, 'idMaterial', 'p1');
    tela['alterar'](linha.chave, 'quantidade', 1);
    tela['alterar'](linha.chave, 'valorUnitario', 1);
    tela['salvar']();
    expect(servico.entrada).toHaveBeenCalledWith(expect.objectContaining({ documento: null, idFornecedor: null }));
  });

  it('a peça cadastrada na hora entra na linha vazia', () => {
    const { fixture, tela } = drawer('ENTRADA');
    const emitido = vi.fn();
    fixture.componentInstance.pecaCadastrada.subscribe(emitido);
    const nova = { ...PECA, id: 'p9', codigo: 'NOVA', saldoTotal: 0 };
    tela['pecaNova'](nova);
    expect(tela['linhas']()[0].idMaterial).toBe('p9');
    expect(tela['opcoesCatalogo']().some((o: { value: string }) => o.value === 'p9')).toBe(true);
    expect(emitido).toHaveBeenCalled();
  });

  it('só avisa alteração quando algo mudou de verdade', () => {
    const { tela } = drawer('ENTRADA');
    expect(tela['alterado']()).toBe(false);
    tela['observacao'].set('Algo');
    expect(tela['alterado']()).toBe(true);
  });
});

describe('FrotaPecaDrawerComponent', () => {
  it('desativar pede confirmação antes de chamar a API', async () => {
    const servico = servicoFalso();
    const fixture = montar(FrotaPecaDrawerComponent, servico, { peca: { ...PECA, saldoTotal: 0 }, podeEditar: true });
    const confirmar = vi.spyOn(TestBed.inject(ConfirmationService), 'confirm').mockImplementation((c: any) => { c.reject?.(); return TestBed.inject(ConfirmationService); });
    const tela = fixture.componentInstance as unknown as Tela;

    await Promise.race([tela['desativar'](), new Promise((resolve) => setTimeout(resolve, 20))]);

    expect(confirmar).toHaveBeenCalled();
    expect(servico.desativarPeca).not.toHaveBeenCalled();
  });

  it('peça desativada só se consulta', () => {
    const fixture = montar(FrotaPecaDrawerComponent, servicoFalso(), { peca: { ...PECA, ativo: false }, podeEditar: true });
    expect((fixture.componentInstance as unknown as Tela)['editavel']()).toBe(false);
  });

  it('não salva grupo novo sem nome', () => {
    const servico = servicoFalso();
    const fixture = montar(FrotaPecaDrawerComponent, servico, { podeEditar: true });
    const tela = fixture.componentInstance as unknown as Tela;
    tela['codigo'].set('X');
    tela['descricao'].set('Y');
    tela['grupo'].set(tela['novoGrupo']);
    tela['salvar']();
    expect(servico.salvarPeca).not.toHaveBeenCalled();
    expect(tela['erroGrupo']()).toBeTruthy();
  });
});
