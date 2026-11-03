import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../core/lookup';
import { DespesaVeiculo, ResumoDespesas, TipoDespesa, pagamentoDespesa } from '../../../core/models/frota-despesa.models';
import { AuthService } from '../../../core/services/auth.service';
import { FrotaDespesaService } from '../../../core/services/frota-despesa.service';
import { FrotaService } from '../../../core/services/frota.service';
import { FrotaTiposDespesaComponent } from '../configuracoes/frota-tipos-despesa.component';
import { FrotaVeiculoDespesasComponent } from './frota-veiculo-despesas.component';

registerLocaleData(localePt, 'pt-BR');

// Acesso aos membros protegidos que o template usa.
type Tela = Record<string, any>;

const LAVAGEM: DespesaVeiculo = {
  id: 'd1', idVeiculo: 'v1', placa: 'ABC1D23', veiculoDescricao: 'HILUX', data: '2026-10-14', idTipo: 't1', tipo: 'Lavagem',
  idSubtipo: 's1', subtipo: 'Completa', descricao: 'Depois da obra', valor: 80, idBaseOperacional: 'b1', baseNome: 'JUAZEIRO',
  idProcesso: null, processoNome: null, idFornecedor: null, fornecedorNome: 'Lava Rápido Teste', documentoTipo: 'RECIBO',
  documentoTipoRotulo: 'Recibo', documentoNumero: '101', medicao: null, formaPagamento: 'A_PAGAR', formaPagamentoRotulo: 'Pagar pelo financeiro',
  idSolicitacaoFinanceira: null, numeroSolicitacaoFinanceira: null, situacaoPagamento: null, situacaoPagamentoRotulo: null,
  motivoReprovacaoPagamento: null, podePedirPagamento: true, origem: 'MANUAL', idExterno: null, anexos: [],
  criadaEm: '2026-10-14T10:00:00-03:00', criadaPor: 'COLABORADOR TESTE'
};
const PEDAGIO: DespesaVeiculo = {
  ...LAVAGEM, id: 'd2', data: '2026-10-16', idTipo: 't2', tipo: 'Pedágio', idSubtipo: null, subtipo: null, descricao: null, valor: 20,
  fornecedorNome: null, documentoTipo: null, documentoTipoRotulo: null, documentoNumero: null, formaPagamento: 'CARTAO',
  formaPagamentoRotulo: 'Cartão corporativo', podePedirPagamento: false
};
const RESUMO: ResumoDespesas = {
  quantidade: 2, total: 100, aPagarSemSolicitacao: 1, valorAPagarSemSolicitacao: 80,
  porTipo: [{ idTipo: 't1', tipo: 'Lavagem', quantidade: 1, total: 80 }, { idTipo: 't2', tipo: 'Pedágio', quantidade: 1, total: 20 }]
};
const TIPO_LAVAGEM: TipoDespesa = { id: 't1', nome: 'Lavagem', codigo: 'LAVAGEM', ativo: true, subtipos: [{ id: 's1', nome: 'Completa' }] };

function montar<T>(tipo: Type<T>, despesas: object, permissoes: string[], entradas: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [tipo],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
      { provide: FrotaDespesaService, useValue: despesas },
      { provide: FrotaService, useValue: { fornecedoresOficina: () => of([]) } },
      { provide: AuthService, useValue: { currentUser: signal({ permissoes }) } },
      { provide: LookupStore, useValue: { operationalBases: signal([]), processes: signal([]), loadBootstrap: () => of({}) } }
    ]
  });
  const fixture = TestBed.createComponent(tipo) as ComponentFixture<T>;
  for (const [nome, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nome, valor);
  fixture.detectChanges();
  return { fixture, tela: fixture.componentInstance as unknown as Tela, el: fixture.nativeElement as HTMLElement };
}

const normalizar = (t: string | null | undefined) => (t ?? '').replace(/\s/g, ' ');

describe('pagamentoDespesa', () => {
  it('diz o que falta no pagamento: pedir, solicitado, aprovado, reprovado ou só registro', () => {
    expect(pagamentoDespesa(LAVAGEM)).toEqual({ rotulo: 'Falta pedir o pagamento', tom: 'warning', icone: 'pi-clock' });
    expect(pagamentoDespesa({ ...LAVAGEM, situacaoPagamento: 'SOLICITADO' }).rotulo).toBe('Pagamento solicitado');
    expect(pagamentoDespesa({ ...LAVAGEM, situacaoPagamento: 'APROVADO' }).tom).toBe('success');
    expect(pagamentoDespesa({ ...LAVAGEM, situacaoPagamento: 'REPROVADO' }).tom).toBe('danger');
    expect(pagamentoDespesa(PEDAGIO)).toEqual({ rotulo: 'Cartão corporativo', tom: 'neutral', icone: 'pi-credit-card' });
  });
});

describe('FrotaVeiculoDespesasComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  const veiculo = { idVeiculo: 'v1', placa: 'ABC1D23', modelo: 'HILUX', idBaseOperacional: 'b1' };

  it('mostra o total, o que falta pedir e o maior gasto do veículo', async () => {
    const servico = {
      listar: vi.fn(() => of({ content: [PEDAGIO, LAVAGEM], page: { totalElements: 2 } })),
      resumo: vi.fn(() => of(RESUMO))
    };
    const { fixture, el } = montar(FrotaVeiculoDespesasComponent, servico, ['frota:despesa:read'], { veiculo });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(servico.listar).toHaveBeenCalledWith({ idVeiculo: 'v1' }, { size: 200, sort: ['data,desc'] });
    const texto = normalizar(el.textContent);
    expect(texto).toContain('R$ 100,00');
    expect(texto).toContain('2 despesas');
    expect(texto).toContain('Falta pedir o pagamento');
    expect(texto).toContain('1 despesa sem solicitação');
    expect(texto).toContain('Maior gasto');
    expect(texto).toContain('R$ 80,00 · 80% do total');
    expect(texto).toContain('Lavagem · Completa');
  });

  it('sem despesa, esconde os cartões e convida a lançar', async () => {
    const servico = {
      listar: vi.fn(() => of({ content: [], page: { totalElements: 0 } })),
      resumo: vi.fn(() => of({ quantidade: 0, total: 0, aPagarSemSolicitacao: 0, valorAPagarSemSolicitacao: 0, porTipo: [] }))
    };
    const { fixture, el } = montar(FrotaVeiculoDespesasComponent, servico, ['frota:despesa:read', 'frota:despesa:write'],
      { veiculo, podeLancar: true });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.ces-kpis')).toBeNull();
    expect(el.textContent).toContain('Nenhuma despesa lançada');
    expect(el.textContent).toContain('Lançar despesa');
  });

  it('o atalho da linha abre o pagamento no financeiro com a origem da despesa', async () => {
    const servico = { listar: vi.fn(() => of({ content: [LAVAGEM], page: { totalElements: 1 } })), resumo: vi.fn(() => of(RESUMO)) };
    const { tela } = montar(FrotaVeiculoDespesasComponent, servico, ['frota:despesa:read', 'financeiro:pagamento:write'], { veiculo });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    tela['pedirPagamento'](LAVAGEM);

    expect(navegar).toHaveBeenCalledWith(['/financeiro', 'pagamentos', 'nova'], { queryParams: { origem: 'FROTA_DESPESA', origemId: 'd1' } });
  });
});

describe('FrotaTiposDespesaComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('recusa subtipo repetido e envia a lista sem campos vazios', () => {
    const servico = {
      tipos: vi.fn(() => of([TIPO_LAVAGEM])),
      salvarTipo: vi.fn(() => of({ ...TIPO_LAVAGEM, subtipos: [...TIPO_LAVAGEM.subtipos, { id: 's2', nome: 'Externa' }] }))
    };
    const { tela } = montar(FrotaTiposDespesaComponent, servico, ['frota:despesa:read', 'frota:despesa:write']);
    expect(servico.tipos).toHaveBeenCalledWith(false);

    tela['abrir'](TIPO_LAVAGEM);
    tela['adicionar']();
    tela['adicionar']();
    const [, segundo, terceiro] = tela['subtipos']();
    tela['renomear'](segundo.chave, ' completa ');
    tela['salvar']();
    expect(servico.salvarTipo).not.toHaveBeenCalled();
    expect(tela['repetido'](tela['subtipos']()[1])).toBe(true);

    tela['renomear'](segundo.chave, ' Externa ');
    tela['salvar']();
    expect(terceiro.nome).toBe('');
    expect(servico.salvarTipo).toHaveBeenCalledWith({ nome: 'Lavagem', subtipos: ['Completa', 'Externa'] }, 't1');
  });
});
