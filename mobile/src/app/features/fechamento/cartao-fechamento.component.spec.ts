import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FechamentoResumo } from '../../core/fechamento/fechamento.models';
import { CartaoFechamentoComponent } from './cartao-fechamento.component';

const acoes = { editar: false, registrarReserva: false, alterarReserva: false, pendencias: false, cancelar: false, movimentar: false };
const resumo = (extra: Partial<FechamentoResumo>): FechamentoResumo => ({
  id: 'a', versao: 1, tipo: '221', obra: { id: 'o', numero: '283712', titulo: 'Rede BT' }, situacao: 'AGUARDANDO_MOVIMENTACAO', situacaoObra: 'PENDENTE',
  prazoVigente: { limite: '2026-11-10T15:00:00-03:00', situacao: 'NO_PRAZO' }, possuiPendencia: false, numeroReserva: '123', solicitante: { id: 'u', nome: 'Ana Souza' }, encarregado: null,
  supervisor: null, coordenador: null, totalItens: 2, quantidadeSolicitada: 10, quantidadeMovimentada: 0, criadaEm: '2026-11-06T15:00:00-03:00', almoxarifadoAtendimento: null,
  movimentacaoConcluidaEm: null, acoes, ...extra,
});

describe('CartaoFechamentoComponent', () => {
  let fixture: ComponentFixture<CartaoFechamentoComponent>;

  function criar(item: FechamentoResumo, mostrarAcoes = true): HTMLElement {
    fixture = TestBed.createComponent(CartaoFechamentoComponent);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('acoes', mostrarAcoes);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('mostra a obra, a situação e o nome de quem pediu', () => {
    const el = criar(resumo({}));
    expect(el.textContent).toContain('283712 · Rede BT');
    expect(el.textContent).toContain('Aguardando movimentação');
    expect(el.textContent).toContain('Ana Souza');
  });

  it('só oferece a ação que o backend liberou', () => {
    expect(criar(resumo({})).querySelector('.acao')).toBeNull();
    expect(criar(resumo({ acoes: { ...acoes, movimentar: true } })).querySelector('.acao')?.textContent).toContain('Movimentar');
    expect(criar(resumo({ acoes: { ...acoes, registrarReserva: true } })).querySelector('.acao')?.textContent).toContain('Registrar reserva');
    expect(criar(resumo({ acoes: { ...acoes, movimentar: true } }), false).querySelector('.acao')).toBeNull();
  });

  it('avisa o atraso e a pendência', () => {
    const el = criar(resumo({ prazoVigente: { limite: '2026-11-01T15:00:00-03:00', situacao: 'ATRASADO' }, possuiPendencia: true }));
    expect(el.textContent).toContain('Atrasado');
    expect(el.textContent).toContain('Com pendência');
  });
});
