import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AcaoCartao, PreviaAprovacao } from '../../../core/models/assistente.models';
import { AssistenteService } from '../../../core/services/assistente.service';
import { CopilotoStore } from '../copiloto.store';
import { CopilotoCartaoAprovacaoComponent } from './copiloto-cartao-aprovacao.component';

const previa: PreviaAprovacao = {
  tipo: 'aprovacao',
  chave: 'aprovacao',
  titulo: 'Aprovar 1 solicitação e rejeitar 1 solicitação',
  modulo: 'Financeiro',
  pronta: false,
  total: 2,
  aprovar: 1,
  rejeitar: 1,
  valorAprovar: 850,
  itens: [
    { indice: 0, decisao: 'APROVAR', tipo: 'compra', numero: 9, titulo: 'Compra nº 9', fornecedor: 'Oficina Teste', valor: 850, caminho: '/financeiro/compras/a' },
    { indice: 1, decisao: 'REJEITAR', tipo: 'pagamento', numero: 1, titulo: 'Pagamento nº 1', fornecedor: 'HC Pneus', valor: 21313, falta: 'Falta o motivo da rejeição.' },
    { indice: 2, decisao: 'APROVAR', titulo: 'Compra nº 3', fornecedor: 'HC Pneus', problema: 'O valor desta solicitação é R$ 1.231,00, não R$ 500,00.' },
  ],
};

describe('cartão de aprovação da Bússola', () => {
  const confirmarAcao = vi.fn();

  async function montar() {
    const acoes = signal<Record<string, AcaoCartao>>({});
    confirmarAcao.mockReset();
    confirmarAcao.mockReturnValue(of({ acaoId: 'a1', ferramenta: 'decidir_solicitacoes', status: 'CONFIRMADA' } as AcaoCartao));
    await TestBed.configureTestingModule({
      imports: [CopilotoCartaoAprovacaoComponent],
      providers: [
        provideRouter([]),
        { provide: AssistenteService, useValue: { confirmarAcao, revisarAcao: vi.fn(), cancelarAcao: vi.fn(), listarAcoes: vi.fn() } },
        { provide: CopilotoStore, useValue: { acoesCartao: acoes, conversaId: signal('c1'), atualizarAcao: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CopilotoCartaoAprovacaoComponent);
    fixture.componentRef.setInput('proposta', { acaoId: 'a1', ferramenta: 'decidir_solicitacoes', titulo: 'Aprovar', previa });
    fixture.detectChanges();
    return fixture;
  }

  function botaoConfirmar(el: HTMLElement): HTMLButtonElement {
    return Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Confirmar decisão')) as HTMLButtonElement;
  }

  it('mostra número, fornecedor e valor de cada solicitação e o que ficou de fora', async () => {
    const fixture = await montar();
    const el = fixture.nativeElement as HTMLElement;
    const lista = el.querySelector('[aria-label="Solicitações desta decisão"]') as HTMLElement;
    expect(lista.textContent).toContain('Compra nº 9');
    expect(lista.textContent).toContain('Oficina Teste');
    expect(lista.textContent).toMatch(/R\$\s850,00/);
    expect(lista.textContent).not.toContain('Compra nº 3');
    expect(el.querySelector('.fora')?.textContent).toContain('1.231,00');
  });

  it('só confirma com o motivo da rejeição e manda o motivo junto, num clique', async () => {
    const fixture = await montar();
    const el = fixture.nativeElement as HTMLElement;
    expect(botaoConfirmar(el).disabled).toBe(true);

    const motivo = el.querySelector('textarea') as HTMLTextAreaElement;
    motivo.value = 'Acima do orçamento';
    motivo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(botaoConfirmar(el).disabled).toBe(false);

    botaoConfirmar(el).click();
    expect(confirmarAcao).toHaveBeenCalledWith('a1', [{ registro: 1, caminho: 'observacao', valor: 'Acima do orçamento' }]);
  });
});
