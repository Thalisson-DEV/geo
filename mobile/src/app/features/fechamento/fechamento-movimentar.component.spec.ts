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
    let servico: any;
    let toast: any;

    beforeEach(async () => {
        servico = {
            detalhe: vi.fn().mockName("FechamentoService.detalhe"),
            movimentar: vi.fn().mockName("FechamentoService.movimentar"),
            previaMovimentacao: vi.fn().mockName("FechamentoService.previaMovimentacao"),
            novaChave: vi.fn().mockName("FechamentoService.novaChave")
        };
        toast = {
            success: vi.fn().mockName("ToastService.success"),
            error: vi.fn().mockName("ToastService.error"),
            warning: vi.fn().mockName("ToastService.warning"),
            info: vi.fn().mockName("ToastService.info")
        };
        servico.detalhe.mockReturnValue(of(detalhe));
        servico.movimentar.mockReturnValue(of(detalhe));
        servico.previaMovimentacao.mockReturnValue(of({ deixaSaldoNegativo: false }) as unknown as ReturnType<FechamentoService['previaMovimentacao']>);
        servico.novaChave.mockReturnValueOnce('chave-1').mockReturnValueOnce('chave-2');
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
        expect(servico.movimentar).toHaveBeenCalledTimes(1);
        expect(servico.movimentar).toHaveBeenCalledWith('f1', { versaoEsperada: 3, itens: [{ idItem: 'i1', quantidade: 2 }] }, 'chave-1');
    });

    it('não passa do que falta movimentar', () => {
        c.definirQuantidade(0, 7);
        expect(c.itens()[0].quantidade).toBe(6);
        expect(toast.warning).toHaveBeenCalled();
    });

    it('repete a mesma chave quando a conexão cai antes da resposta', () => {
        servico.movimentar.mockReturnValueOnce(throwError(() => ({ status: 0, title: '', detail: '' }))).mockReturnValueOnce(of(detalhe));
        c.confirmar();
        c.confirmar();
        c.confirmar();
        c.confirmar();
        expect(vi.mocked(servico.movimentar).mock.calls.map((a: unknown[]) => a[2])).toEqual(['chave-1', 'chave-1']);
    });
});
