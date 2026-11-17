import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AbastecimentoDetalhe, ConferenciaFatura } from '../../../core/models/frota-abastecimento.models';
import { FrotaAnaliseIaService } from '../../../core/services/frota-analise-ia.service';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { FrotaAbastecimentoDetalheDrawerComponent } from './frota-abastecimento-detalhe-drawer.component';
import { formatarWhatsapp, haQuantoTempo, produtoTrocado, rotuloFatura, textoDiferenca } from './frota-abastecimento.util';
import { FrotaFaturaPostoDrawerComponent } from './frota-fatura-posto-drawer.component';

registerLocaleData(localePt, 'pt-BR');

const AGORA = new Date('2026-10-15T14:00:00-03:00');

const PEDIDO: AbastecimentoDetalhe = {
  id: 'a1', idVeiculo: 'v1', placa: 'ABC1D23', veiculoDescricao: 'HILUX', situacao: 'AGUARDANDO_APROVACAO',
  situacaoRotulo: 'Aguardando aprovação', idBaseOperacional: 'b1', baseNome: 'JUAZEIRO', solicitante: 'MARIA TESTE',
  condutor: 'MARIA TESTE', idPosto: 'p1', posto: 'Posto Central Teste', postoWhatsapp: '5574999990000', unidadeMedicao: 'KM',
  medicaoSolicitacao: 130, medicaoRealizado: null, capacidadeTanque: 80, observacao: 'Tanque na reserva',
  solicitadoEm: '2026-10-15T11:00:00-03:00', aprovador: null, aprovadoEm: null, motivoReprovacao: null, liberador: null,
  liberadoEm: null, venceEm: null, cancelador: null, canceladoEm: null, motivoCancelamento: null, realizadoEm: null,
  valorTotal: null,
  itens: [{ id: 'i1', categoria: 'COMBUSTIVEL', idProdutoPedido: 's10', produtoPedido: 'Diesel S10', quantidadePedida: null, unidade: 'l',
    idProduto: null, produto: null, quantidade: null, valorTotal: null, valorUnitario: null, tanqueCheio: null,
    quantidadeAprovada: null, quantidadeLiberada: null, quantidadeAutorizada: null }],
  fotos: [{ id: 'f1', tipo: 'PAINEL_ANTES', tipoRotulo: 'Painel antes', recebida: false }],
  alertas: [{ tipo: 'MEDICAO_MENOR', tipoRotulo: 'Medição menor que a anterior', etapa: 'SOLICITACAO',
    mensagem: 'Medição informada (130 km) menor que a última registrada (135 km).' }],
  avisos: [], podeAprovar: true, podeLiberar: false, podeCancelar: true,
  destino: 'Juazeiro → Sobradinho', origem: 'APP', origemRotulo: 'Pedido pelo app', sugestoesPreco: []
};

const CONFERENCIA: ConferenciaFatura = {
  fatura: { id: 'fat1', idPosto: 'p1', posto: 'Posto Central Teste', numero: '2026-1015', periodoInicio: '2026-10-13',
    periodoFim: '2026-10-15', valor: 340, situacao: 'RASCUNHO', situacaoRotulo: 'Em conferência', quantidadeAbastecimentos: 0,
    valorAbastecimentos: 0, diferenca: 340, conferidaEm: null },
  abastecimentos: [
    { id: 'a1', placa: 'TST0H01', realizadoEm: '2026-10-14T20:46:00-03:00', itens: 'Diesel S500 48,4 l', valor: 333.96, incluido: false },
    { id: 'a2', placa: 'RET0T01', realizadoEm: '2026-10-15T09:10:00-03:00', itens: 'Diesel S10 1 l', valor: 6.04, incluido: false }
  ]
};

const texto = () => document.body.textContent ?? '';

describe('Utilitários do abastecimento', () => {
  it('formata o WhatsApp, o tempo de espera e a diferença da fatura', () => {
    expect(formatarWhatsapp('5574999990000')).toBe('(74) 99999-0000');
    expect(formatarWhatsapp('557433334444')).toBe('(74) 3333-4444');
    expect(formatarWhatsapp('14155550100')).toBe('+14155550100');
    expect(haQuantoTempo('2026-10-15T13:55:00-03:00', AGORA)).toBe('há 5 min');
    expect(haQuantoTempo('2026-10-15T11:00:00-03:00', AGORA)).toBe('há 3 h');
    expect(haQuantoTempo('2026-10-13T14:00:00-03:00', AGORA)).toBe('há 2 dias');
    expect(textoDiferenca(0.001)).toBe('Bate com a fatura');
    expect(textoDiferenca(6.04).replace(/\s/g, ' ')).toBe('R$ 6,04 a mais na fatura');
    expect(textoDiferenca(-3).replace(/\s/g, ' ')).toBe('R$ 3,00 a menos na fatura');
  });

  it('diz o que fazer com a fatura em rascunho e reconhece o produto trocado no posto', () => {
    expect(rotuloFatura({ situacao: 'RASCUNHO', situacaoRotulo: 'Em conferência' })).toBe('Falta conferir');
    expect(rotuloFatura({ situacao: 'CONFERIDA', situacaoRotulo: 'Conferida' })).toBe('Conferida');
    expect(produtoTrocado({ ...PEDIDO.itens[0], idProduto: 's500' })).toBe(true);
    expect(produtoTrocado({ ...PEDIDO.itens[0], idProduto: 's10' })).toBe(false);
    expect(produtoTrocado(PEDIDO.itens[0])).toBe(false);
  });
});

describe('FrotaAbastecimentoDetalheDrawerComponent', () => {
  let servico: Record<string, ReturnType<typeof vi.fn>>;
  let fixture: ComponentFixture<FrotaAbastecimentoDetalheDrawerComponent>;
  let ref: ComponentRef<FrotaAbastecimentoDetalheDrawerComponent>;

  async function abrir(pedido: AbastecimentoDetalhe): Promise<void> {
    servico['detalhar'].mockReturnValue(of(pedido));
    fixture = TestBed.createComponent(FrotaAbastecimentoDetalheDrawerComponent);
    ref = fixture.componentRef;
    ref.setInput('idAbastecimento', pedido.id);
    ref.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
    servico = {
      detalhar: vi.fn(),
      aprovar: vi.fn(() => of({ ...PEDIDO, situacao: 'APROVADA', situacaoRotulo: 'Aprovada', aprovador: 'GESTOR TESTE',
        aprovadoEm: '2026-10-15T14:00:00-03:00', venceEm: '2026-10-16T00:00:00-03:00', podeAprovar: false })),
      foto: vi.fn(),
      postos: vi.fn()
    };
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations(), provideRouter([]), MessageService, ConfirmationService, { provide: FrotaAbastecimentoService, useValue: servico },
        { provide: FrotaAnaliseIaService, useValue: { estado: () => of({ disponivel: false, motivoIndisponivel: null, ultima: null }) } }]
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('abre no tom da situação, com o fluxo, a espera e o alerta para conferir antes de decidir', async () => {
    await abrir(PEDIDO);
    expect(texto()).toContain('ABC1D23 · HILUX');
    expect(texto()).toContain('1 ponto para conferir');
    expect(texto()).toContain('JUAZEIRO');
    expect(texto()).toContain('Posto Central Teste');
    expect(texto()).toContain('(74) 99999-0000');
    expect(texto()).toContain('Esperando há 3 h');
    expect(texto()).toContain('Gestor da placa');
    expect(texto()).toContain('Confira antes de decidir');
    expect(texto()).toContain('Medição informada (130 km) menor que a última registrada (135 km).');
    expect(texto()).toContain('Observação da equipe');
    expect(texto()).toContain('Juazeiro → Sobradinho');
    expect(texto()).toContain('A definir');
    expect(texto()).toContain('Ainda no celular');
    expect(document.querySelector('.dd-fluxo__etapa[data-estado="atual"]')?.textContent).toContain('Aprovação');
  });

  it('aprovar troca o cartão de espera pelo prazo até as 23h59', async () => {
    await abrir(PEDIDO);
    const aprovar = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Aprovar');
    aprovar!.click();
    fixture.detectChanges();
    expect(texto()).toContain('A equipe pede só o produto');
    (fixture.componentInstance as unknown as { ajustar(id: string, v: number): void }).ajustar('i1', 60);
    fixture.detectChanges();
    const confirmar = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Aprovar').at(-1);
    confirmar!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(servico['aprovar']).toHaveBeenCalledWith('a1', { i1: 60 });
    expect(texto()).toContain('Vale até');
    expect(texto()).toContain('23h59 de 15/10');
    expect(texto()).toContain('Faltam 10 h');
    expect(document.querySelector('.dd-fluxo__etapa[data-estado="atual"]')?.textContent).toContain('Liberação');
  });

  it('reprovado interrompe o fluxo onde parou e mostra o motivo', async () => {
    await abrir({ ...PEDIDO, situacao: 'REPROVADA', situacaoRotulo: 'Reprovada', aprovador: 'GESTOR TESTE',
      aprovadoEm: '2026-10-15T12:00:00-03:00', motivoReprovacao: 'Refaça a foto do painel.', podeAprovar: false, podeCancelar: false });
    expect(document.querySelector('.dd-fluxo__etapa[data-estado="interrompido"]')?.textContent).toContain('Reprovado');
    expect(texto()).toContain('Reprovado por GESTOR TESTE');
    expect(texto()).toContain('Refaça a foto do painel.');
    expect(texto()).toContain('Ponto apontado pelo GEO');
    expect(texto()).not.toContain('Confira antes de decidir');
  });
});

describe('FrotaFaturaPostoDrawerComponent', () => {
  let servico: Record<string, ReturnType<typeof vi.fn>>;
  let fixture: ComponentFixture<FrotaFaturaPostoDrawerComponent>;

  async function abrir(conferencia: ConferenciaFatura): Promise<void> {
    servico['conferencia'].mockReturnValue(of(conferencia));
    fixture = TestBed.createComponent(FrotaFaturaPostoDrawerComponent);
    fixture.componentRef.setInput('idFatura', conferencia.fatura.id);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const botao = (rotulo: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === rotulo);

  beforeEach(() => {
    servico = {
      conferencia: vi.fn(),
      conferir: vi.fn(() => of({ ...CONFERENCIA.fatura, situacao: 'CONFERIDA', diferenca: 6.04 }))
    };
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations(), provideRouter([]), MessageService, ConfirmationService, { provide: FrotaAbastecimentoService, useValue: servico }]
    });
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('fatura nova sugere todos do período e recalcula a diferença a cada marcação', async () => {
    await abrir(CONFERENCIA);
    expect(texto()).toContain('Falta conferir');
    expect(texto()).toContain('2 de 2 abastecimentos');
    expect(texto()).toContain('Bate com a fatura');

    (document.querySelector('.fat-linha') as HTMLElement).click();
    fixture.detectChanges();
    expect(texto()).toContain('1 de 2 abastecimentos');
    expect(texto().replace(/\s/g, ' ')).toContain('R$ 333,96 a mais na fatura');
    expect(texto()).toContain('1 abastecimento realizado neste posto no período não está marcado');

    botao('Concluir conferência')!.click();
    expect(servico['conferir']).toHaveBeenCalledWith('fat1', ['a2']);
  });

  it('conferida com diferença avisa antes e envia ao financeiro com a origem da fatura', async () => {
    await abrir({
      fatura: { ...CONFERENCIA.fatura, situacao: 'CONFERIDA', situacaoRotulo: 'Conferida', quantidadeAbastecimentos: 1,
        valorAbastecimentos: 333.96, diferenca: 6.04, conferidaEm: '2026-10-15T20:14:00-03:00' },
      abastecimentos: [{ ...CONFERENCIA.abastecimentos[0], incluido: true }]
    });
    expect(texto()).toContain('Vai ao financeiro com diferença');
    expect(texto().replace(/\s/g, ' ')).toContain('R$ 6,04 acima do que foi conferido');

    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    botao('Enviar ao financeiro')!.click();
    await vi.waitFor(() => expect(navegar).toHaveBeenCalled(), { timeout: 3000 });
    expect(navegar).toHaveBeenCalledWith(['/financeiro', 'pagamentos', 'nova'],
      { queryParams: { origem: 'FROTA_FATURA_POSTO', origemId: 'fat1' } });
  });
});
