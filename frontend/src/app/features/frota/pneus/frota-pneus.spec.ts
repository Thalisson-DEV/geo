import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoConfirmationService } from '@geo/ui';

import { MovimentacaoPneusRequest, Pneu, VeiculoPneus, erroKmMovimentacao, formatarCustoKm, rotuloPosicao, tomSulco } from '../../../core/models/frota-pneu.models';
import { AuthService } from '../../../core/services/auth.service';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { paginaDe } from '../shared/frota-teste';
import { FrotaPneuDiagramaComponent } from './frota-pneu-diagrama.component';
import { FrotaPneuInspecaoDrawerComponent } from './frota-pneu-inspecao-drawer.component';
import { FrotaPneuMontagemComponent } from './frota-pneu-montagem.component';
import { FrotaPneuRodizioComponent } from './frota-pneu-rodizio.component';

// Acesso aos membros protegidos que o template usa.
type Tela = Record<string, any>;

function pneu(id: string, extra: Partial<Pneu> = {}): Pneu {
  return {
    id, numero: 1, marcaFogo: id.toUpperCase(), marca: 'Goodyear', modelo: null, medida: '215/75 R17.5', sulcoAtualMm: 10, vida: 0, kmVida: 0, kmTotal: 0,
    situacao: 'DISPONIVEL', situacaoRotulo: 'Disponível', idEstoque: 'e1', alertas: [], custoTotal: 0, custoPorKm: null, ultimaPressaoPsi: null,
    pressaoRecomendadaPsi: 100, idVeiculo: null, placa: null, posicao: null, ...extra
  } as Pneu;
}

const montado = (id: string, posicao: string) => pneu(id, { situacao: 'EM_USO', idEstoque: null, idVeiculo: 'v1', posicao });
const posicao = (codigo: string, p: Pneu | null) => ({ codigo, eixo: 1, rotulo: rotuloPosicao(codigo), estepe: codigo.startsWith('S'), pneu: p });

// A API omite os campos nulos: kmAtual e eixos podem vir ausentes no JSON.
const VEICULO = {
  idVeiculo: 'v1', placa: 'ABC1D23', eixos: 'S,D', estepes: 1, kmAtual: 1000, unidade: 'KM', sulcoMinimoMm: 3,
  posicoes: [posicao('1E', montado('a', '1E')), posicao('1D', montado('b', '1D')), posicao('2EE', null), posicao('2EI', null), posicao('2DI', null), posicao('2DE', null), posicao('S1', null)]
} as unknown as VeiculoPneus;

function montar<T>(componente: Type<T>, servico: Partial<FrotaPneuService>, entradas: Record<string, unknown> = {}): ComponentFixture<T> {
  TestBed.configureTestingModule({
    imports: [componente],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      ConfirmationService,
      MessageService,
      { provide: FrotaPneuService, useValue: servico },
      { provide: AuthService, useValue: { currentUser: signal({ permissoes: ['frota:pneu:read', 'frota:pneu:write'] }) } }
    ]
  });
  const fixture = TestBed.createComponent(componente);
  Object.entries(entradas).forEach(([chave, valor]) => fixture.componentRef.setInput(chave, valor));
  fixture.detectChanges();
  return fixture;
}

function montagem(servico: Partial<FrotaPneuService> = {}) {
  const fixture = montar(FrotaPneuMontagemComponent, {
    veiculo: vi.fn(() => of(VEICULO)),
    listar: vi.fn(() => paginaDe([pneu('c'), pneu('d')])) as never,
    ...servico
  }, { podeEditar: true, almoxarifados: [{ id: 'e1', nome: 'OFICINA', idBaseOperacional: null, baseOperacional: null, ativo: true }], idVeiculoInicial: 'v1' });
  fixture.detectChanges();
  return { fixture, tela: fixture.componentInstance as unknown as Tela };
}

describe('Montagem de pneus', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mostra o estoque e os pneus de cada posição', () => {
    const { tela } = montagem();
    expect(tela['noEstoque']().map((p: Pneu) => p.id)).toEqual(['c', 'd']);
    expect(tela['montados']()).toBe(2);
    expect(tela['rodas']()).toBe(6);
  });

  it('arrastar do estoque para uma posição vazia vira uma mudança, sem gravar', () => {
    const movimentar = vi.fn();
    const { tela } = montagem({ movimentar } as never);
    tela['arrastando'].set('c');
    tela['soltarNaPosicao']('2EE');
    expect(tela['alteracoes']()).toHaveLength(1);
    expect(tela['posicoesView']().find((p: { codigo: string }) => p.codigo === '2EE').pneu.id).toBe('c');
    expect(tela['noEstoque']().map((p: Pneu) => p.id)).toEqual(['d']);
    expect(movimentar).not.toHaveBeenCalled();
  });

  it('soltar sobre uma posição ocupada troca os dois pneus (rodízio)', () => {
    const { tela } = montagem();
    tela['arrastando'].set('a');
    tela['soltarNaPosicao']('1D');
    const view = tela['posicoesView']();
    expect(view.find((p: { codigo: string }) => p.codigo === '1D').pneu.id).toBe('a');
    expect(view.find((p: { codigo: string }) => p.codigo === '1E').pneu.id).toBe('b');
    expect(tela['alteracoes']()).toHaveLength(2);
    expect(tela['conflitos']()).toEqual([]);
  });

  it('pneu do estoque sobre posição ocupada manda o que estava lá para o almoxarifado', () => {
    const { tela } = montagem();
    tela['arrastando'].set('c');
    tela['soltarNaPosicao']('1E');
    const a = tela['alteracoes']().find((x: { pneu: Pneu }) => x.pneu.id === 'a');
    expect(a.para).toEqual({ tipo: 'ESTOQUE', idEstoque: 'e1' });
  });

  it('funciona sem arrastar: escolhe o pneu e depois o destino', () => {
    const { tela } = montagem();
    tela['selecionar']('c');
    tela['acionarPosicao']('2DE');
    expect(tela['posicoesView']().find((p: { codigo: string }) => p.codigo === '2DE').pneu.id).toBe('c');
    expect(tela['selecionado']()).toBeNull();
  });

  it('voltar o pneu ao lugar de origem tira a mudança da lista', () => {
    const { tela } = montagem();
    tela['arrastando'].set('a');
    tela['soltarNaPosicao']('2EE');
    expect(tela['alteracoes']()).toHaveLength(1);
    tela['arrastando'].set('a');
    tela['soltarNaPosicao']('1E');
    expect(tela['alteracoes']()).toHaveLength(0);
  });

  it('descarte exige motivo e confirmação antes de salvar, e o lote leva o destino de cada pneu', async () => {
    const movimentar = vi.fn((_: MovimentacaoPneusRequest) => of(VEICULO));
    const { tela } = montagem({ movimentar } as never);
    const confirmar = vi.spyOn(TestBed.inject(GeoConfirmationService), 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    tela['arrastando'].set('a');
    tela['soltarEm']('DESCARTE');
    expect(tela['podeSalvar']()).toBe(false);
    tela['definir']('a', { tipo: 'DESCARTE', motivo: 'Carcaça cortada' });
    expect(tela['podeSalvar']()).toBe(true);
    await tela['salvar']();
    expect(movimentar).not.toHaveBeenCalled();
    await tela['salvar']();
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(movimentar).toHaveBeenCalledTimes(1);
    const pedido = movimentar.mock.calls[0][0];
    expect(pedido.km).toBe(1000);
    expect(pedido.destinos).toEqual([{ idPneu: 'a', destino: 'DESCARTE', posicao: null, idEstoque: null, idFornecedor: null, motivo: 'Carcaça cortada' }]);
    expect(tela['alteracoes']()).toHaveLength(0);
  });

  it('tocar na posição vazia e depois no pneu monta nela; Esc cancela a escolha', () => {
    const { tela } = montagem();
    tela['acionarPosicao']('2EE');
    expect(tela['posicaoAlvo']()).toBe('2EE');
    tela['cancelarEscolha']();
    expect(tela['posicaoAlvo']()).toBeNull();
    tela['acionarPosicao']('2EE');
    tela['selecionar']('c');
    expect(tela['posicoesView']().find((p: { codigo: string }) => p.codigo === '2EE').pneu.id).toBe('c');
    expect(tela['posicaoAlvo']()).toBeNull();
    expect(tela['selecionado']()).toBeNull();
  });

  it('desfazer um lado da troca desfaz os dois, sem deixar pneus na mesma posição', () => {
    const { tela } = montagem();
    tela['arrastando'].set('a');
    tela['soltarNaPosicao']('1D');
    tela['desfazer']('a');
    expect(tela['alteracoes']()).toHaveLength(0);
    expect(tela['conflitos']()).toEqual([]);
  });

  it('km menor que o último registrado impede salvar, salvo lançamento com data', () => {
    const { tela } = montagem();
    tela['arrastando'].set('c');
    tela['soltarNaPosicao']('2EE');
    expect(tela['podeSalvar']()).toBe(true);
    tela['km'].set(500);
    expect(tela['podeSalvar']()).toBe(false);
    tela['quando'].set(new Date('2026-01-01T10:00:00'));
    expect(tela['podeSalvar']()).toBe(true);
    expect(erroKmMovimentacao(undefined, 1000, false)).toBeUndefined();
    expect(erroKmMovimentacao(1000, undefined, false)).toBeUndefined();
  });

  it('avisa medida diferente no eixo e sulco no limite, sem impedir de salvar', () => {
    const outraMedida = pneu('c', { medida: '295/80 R22.5', sulcoAtualMm: 2 });
    const { tela } = montagem({ listar: vi.fn(() => paginaDe([outraMedida])) as never });
    expect(tela['medidaDiferente'](outraMedida)).toBe(true);
    tela['arrastando'].set('c');
    tela['soltarNaPosicao']('1E');
    expect(tela['avisos']().join(' ')).toContain('medidas diferentes');
    expect(tela['avisos']().join(' ')).toContain('sulco no limite');
    expect(tela['podeSalvar']()).toBe(true);
  });

  it('não deixa salvar um diagrama que tira a posição de um pneu montado', () => {
    const { tela } = montagem();
    tela['configurar']();
    expect(tela['semPosicao']()).toEqual([]);
    tela['usarModelo']('D,D', 1);
    expect(tela['semPosicao']()).toEqual(['A (Eixo 1 esquerda)', 'B (Eixo 1 direita)']);
  });

  it('sugere o modelo pelo tipo do veículo, sem confundir caminhonete com caminhão', () => {
    const { tela } = montagem();
    expect(tela['modeloSugerido']('CAMINHÃO').rotulo).toBe('Caminhão toco');
    expect(tela['modeloSugerido']('Caminhonete').rotulo).toBe('Carro ou picape');
    expect(tela['modeloSugerido']('Cavalo mecânico').rotulo).toBe('Cavalo mecânico');
    expect(tela['modeloSugerido'](undefined).rotulo).toBe('Carro ou picape');
  });

  it('veículo sem diagrama abre a escolha do modelo, com kmAtual ausente no JSON', () => {
    const semDiagrama = { idVeiculo: 'v1', placa: 'ABC1D23', estepes: 1, unidade: 'KM', sulcoMinimoMm: 3, posicoes: [] } as unknown as VeiculoPneus;
    const definirDiagrama = vi.fn(() => of(VEICULO));
    const { fixture, tela } = montagem({ veiculo: vi.fn(() => of(semDiagrama)), definirDiagrama } as never);
    expect(fixture.nativeElement.textContent).toContain('Defina o diagrama');
    expect(tela['km']()).toBeNull();
    tela['usarModelo']('S,D,D', 1);
    tela['salvarDiagrama']();
    expect(definirDiagrama).toHaveBeenCalledWith('v1', 'S,D,D', 1);
  });
});

describe('Rodízio de pneus', () => {
  afterEach(() => TestBed.resetTestingModule());

  function rodizio(servico: Partial<FrotaPneuService> = {}) {
    const fixture = montar(FrotaPneuRodizioComponent, {
      veiculo: vi.fn(() => of(VEICULO)),
      eventos: vi.fn(() => paginaDe([{ ocorridoEm: '2026-10-01T10:00:00-03:00', kmVeiculo: 400 }])) as never,
      ...servico
    }, { podeEditar: true, idVeiculoInicial: 'v1' });
    fixture.detectChanges();
    return { fixture, tela: fixture.componentInstance as unknown as Tela };
  }

  it('o diagrama de antes não muda; o de depois troca os dois pneus ao soltar sobre uma posição ocupada', () => {
    const { tela } = rodizio();
    tela['arrastando'].set('a');
    tela['soltar']('1D');
    const em = (lista: { codigo: string; pneu: Pneu | null }[], c: string) => lista.find((p) => p.codigo === c)?.pneu?.id;
    expect(em(tela['antes'](), '1E')).toBe('a');
    expect(em(tela['depois'](), '1E')).toBe('b');
    expect(em(tela['depois'](), '1D')).toBe('a');
    expect(tela['trocas']()).toHaveLength(2);
  });

  it('funciona por toque e voltar ao lugar original tira a troca', () => {
    const { tela } = rodizio();
    tela['acionar']('1E');
    tela['acionar']('2EE');
    expect(tela['trocas']()).toEqual([expect.objectContaining({ de: '1E', para: '2EE' })]);
    tela['arrastando'].set('a');
    tela['soltar']('1E');
    expect(tela['trocas']()).toHaveLength(0);
  });

  it('desfazer uma troca volta os dois pneus e km menor bloqueia salvar', () => {
    const movimentar = vi.fn((_: MovimentacaoPneusRequest) => of(VEICULO));
    const { tela } = rodizio({ movimentar } as never);
    tela['arrastando'].set('a');
    tela['soltar']('1D');
    tela['desfazerTroca']('b');
    expect(tela['trocas']()).toHaveLength(0);
    tela['arrastando'].set('a');
    tela['soltar']('1D');
    tela['km'].set(10);
    tela['salvar']();
    expect(movimentar).not.toHaveBeenCalled();
  });

  it('trocar de veículo com trocas por salvar pergunta antes de descartar', async () => {
    const { tela } = rodizio();
    tela['arrastando'].set('a');
    tela['soltar']('1D');
    const confirmar = vi.spyOn(TestBed.inject(GeoConfirmationService), 'confirm').mockResolvedValue(false);
    await tela['escolherVeiculo']('v2');
    await new Promise((r) => setTimeout(r, 60));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(tela['idVeiculo']()).toBe('v1');
    expect(tela['trocas']()).toHaveLength(2);
  });

  it('salva só as posições que mudaram e mostra os km desde o último rodízio', () => {
    const movimentar = vi.fn((_: MovimentacaoPneusRequest) => of(VEICULO));
    const { tela } = rodizio({ movimentar } as never);
    expect(tela['kmDesdeUltimo']()).toBe(600);
    tela['arrastando'].set('a');
    tela['soltar']('1D');
    tela['salvar']();
    expect(movimentar.mock.calls[0][0].destinos).toEqual([
      { idPneu: 'a', destino: 'POSICAO', posicao: '1D' },
      { idPneu: 'b', destino: 'POSICAO', posicao: '1E' }
    ]);
    expect(tela['trocas']()).toHaveLength(0);
  });
});

describe('Diagrama de pneus', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('desenha os eixos simples e duplos, e cada roda é um botão com nome acessível', () => {
    const fixture = montar(FrotaPneuDiagramaComponent, {}, { eixos: 'S,D', posicoes: VEICULO.posicoes, sulcoMinimo: 3 });
    const rodas: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button.roda'));
    expect(rodas).toHaveLength(7);
    expect(rodas[0].getAttribute('aria-label')).toContain('Eixo 1 esquerda: pneu A');
    expect(rodas[2].getAttribute('aria-label')).toBe('Eixo 2 esquerda externa: vazia');
  });

  it('com eixo duplo, o eixo simples ocupa a largura de duas rodas com um pneu só; sem duplo, não muda', () => {
    const comDuplo = montar(FrotaPneuDiagramaComponent, {}, { eixos: 'S,D', posicoes: VEICULO.posicoes });
    expect(comDuplo.nativeElement.querySelector('.veiculo').classList.contains('veiculo--com-duplo')).toBe(true);
    const lados = comDuplo.nativeElement.querySelectorAll('.lado');
    expect(lados[0].querySelectorAll('.roda')).toHaveLength(1);
    expect(lados[2].querySelectorAll('.roda')).toHaveLength(2);
    TestBed.resetTestingModule();
    const soSimples = montar(FrotaPneuDiagramaComponent, {}, { eixos: 'S,S', posicoes: [] });
    expect(soSimples.nativeElement.querySelector('.veiculo').classList.contains('veiculo--com-duplo')).toBe(false);
  });

  it('só oferece o + na posição vazia quando dá para montar', () => {
    const leitura = montar(FrotaPneuDiagramaComponent, {}, { eixos: 'S,D', posicoes: VEICULO.posicoes });
    const rodasLeitura: HTMLButtonElement[] = Array.from(leitura.nativeElement.querySelectorAll('button.roda'));
    expect(rodasLeitura[2].disabled).toBe(true);
    expect(leitura.nativeElement.querySelector('.pi-plus')).toBeNull();
    TestBed.resetTestingModule();
    const edicao = montar(FrotaPneuDiagramaComponent, {}, { eixos: 'S,D', posicoes: VEICULO.posicoes, arrastavel: true, destacarDestinos: true });
    expect(edicao.nativeElement.querySelector('.pi-plus')).not.toBeNull();
    expect(edicao.nativeElement.querySelectorAll('.roda--destino')).toHaveLength(7);
  });

  it('classifica o sulco frente ao mínimo da frota', () => {
    expect(tomSulco(2.5, 3)).toBe('danger');
    expect(tomSulco(3, 3)).toBe('danger');
    expect(tomSulco(4, 3)).toBe('warning');
    expect(tomSulco(8, 3)).toBe('success');
    expect(tomSulco(undefined, 3)).toBe('neutral');
  });
});

describe('Inspeção de pneus', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('avisa quando o sulco medido é maior que o anterior', () => {
    const fixture = montar(FrotaPneuInspecaoDrawerComponent, { veiculo: vi.fn(() => of(VEICULO)) }, { visivel: false, veiculos: [] });
    const tela = fixture.componentInstance as unknown as Tela;
    expect(tela['sulcoMaior']({ sulco: 12, sulcoAnterior: 10 })).toBe(true);
    expect(tela['sulcoMaior']({ sulco: 9, sulcoAnterior: 10 })).toBe(false);
    expect(tela['sulcoMaior']({ sulco: null, sulcoAnterior: 10 })).toBe(false);
  });
});

describe('Custo por km', () => {
  it('usa sempre 3 casas e traço quando não há km', () => {
    expect(formatarCustoKm(0.4444)).toBe('R$ 0,444/km');
    expect(formatarCustoKm(undefined)).toBe('—');
  });
});
