import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { FechamentoDetalhe } from '../../core/fechamento/fechamento.models';
import { FechamentoService } from '../../core/fechamento/fechamento.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { FechamentoMovimentarComponent } from './fechamento-movimentar.component';

const detalhe = {
  id: 'f1', versao: 3, tipo: '221', obra: { id: 'o', numero: '283712', titulo: 'Rede BT' }, almoxarifadoAtendimento: { id: 'a', nome: 'ALMOX' }, estoqueObra: { id: 'e', nome: 'OBRA 283712' },
  reserva: { numero: '123', dataCriacao: '2026-11-05', registradaEm: '2026-11-05T10:00:00Z' }, acoes: { movimentar: true },
  itens: [
    { id: 'i1', codigoMaterial: '100', descricaoMaterial: 'Cabo', unidade: 'MT', quantidade: 10, quantidadeMovimentada: 4, quantidadePendente: 6 },
    { id: 'i2', codigoMaterial: '200', descricaoMaterial: 'Poste', unidade: 'UN', quantidade: 2, quantidadeMovimentada: 2, quantidadePendente: 0 },
  ],
} as unknown as FechamentoDetalhe;

describe('FechamentoMovimentarComponent', () => {
  let fixture: ComponentFixture<FechamentoMovimentarComponent>;
  let c: FechamentoMovimentarComponent;
  let servico: jasmine.SpyObj<FechamentoService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    servico = jasmine.createSpyObj('FechamentoService', ['detalhe', 'movimentar', 'previaMovimentacao', 'novaChave']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']);
    servico.detalhe.and.returnValue(of(detalhe));
    servico.movimentar.and.returnValue(of(detalhe));
    servico.previaMovimentacao.and.returnValue(of({ deixaSaldoNegativo: false }) as unknown as ReturnType<FechamentoService['previaMovimentacao']>);
    servico.novaChave.and.returnValues('chave-1', 'chave-2');
    await TestBed.configureTestingModule({
      imports: [FechamentoMovimentarComponent],
      providers: [
        provideRouter([]),
        { provide: FechamentoService, useValue: servico },
        { provide: ToastService, useValue: toast },
        { provide: ConnectivityService, useValue: { isOnline: signal(true), statusConexao: signal('online') } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { base: '/almox/fechamento' }, paramMap: convertToParamMap({ id: 'f1' }) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FechamentoMovimentarComponent);
    c = fixture.componentInstance;
    c.carregar();
    fixture.detectChanges();
  });

  it('traz só o que falta movimentar, já com a quantidade pendente', () => {
    expect(c.itens().map(i => [i.id, i.quantidade])).toEqual([['i1', 6]]);
  });

  it('não pergunta Físico ou Virtual: a movimentação é sempre entre almoxarifado e obra', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Virtual');
    expect(fixture.nativeElement.querySelector('.efeito')).toBeNull();
  });

  it('envia a parte escolhida depois do segundo toque, sem efeito no pedido', () => {
    c.definirQuantidade(0, 2);
    c.confirmar();
    expect(servico.movimentar).not.toHaveBeenCalled();
    c.confirmar();
    expect(servico.movimentar).toHaveBeenCalledOnceWith('f1', { versaoEsperada: 3, itens: [{ idItem: 'i1', quantidade: 2 }] }, 'chave-1');
  });

  it('não passa do que falta movimentar', () => {
    c.definirQuantidade(0, 7);
    expect(c.itens()[0].quantidade).toBe(6);
    expect(toast.warning).toHaveBeenCalled();
  });

  it('repete a mesma chave quando a conexão cai antes da resposta', () => {
    servico.movimentar.and.returnValues(throwError(() => ({ status: 0, title: '', detail: '' })), of(detalhe));
    c.confirmar();
    c.confirmar();
    c.confirmar();
    c.confirmar();
    expect(servico.movimentar.calls.allArgs().map(a => a[2])).toEqual(['chave-1', 'chave-1']);
  });
});
