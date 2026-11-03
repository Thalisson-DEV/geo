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
import {
  Apolice,
  ParcelaApolice,
  SeguradoraFrota,
  Sinistro,
  formatarTelefone,
  pagamentoParcela,
  situacaoSinistro,
  vigenciaApolice
} from '../../../core/models/frota-seguro.models';
import { FrotaSeguradorasCadastroComponent } from './frota-seguradoras-cadastro.component';
import { AuthService } from '../../../core/services/auth.service';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { FrotaService } from '../../../core/services/frota.service';
import { FrotaOrdemServicoFormComponent } from '../ordens-servico/frota-ordem-servico-form.component';
import { OPCOES_VAZIAS, paginaDe } from '../shared/frota-teste';
import { FrotaApoliceDrawerComponent } from './frota-apolice-drawer.component';
import { FrotaSinistroDrawerComponent } from './frota-sinistro-drawer.component';
import { FrotaVeiculoSinistrosComponent } from './frota-veiculo-sinistros.component';

registerLocaleData(localePt, 'pt-BR');

// Acesso aos membros protegidos que o template usa.
type Tela = Record<string, any>;

const PARCELA: ParcelaApolice = {
  id: 'p1', numero: 1, vencimento: '2026-11-10', valor: 500, idSolicitacaoFinanceira: null, numeroSolicitacaoFinanceira: null,
  situacaoPagamento: null, situacaoPagamentoRotulo: null, motivoReprovacaoPagamento: null, podePedirPagamento: true, vencida: false,
  pedirEmBreve: true
};
const APOLICE: Apolice = {
  id: 'a1', numero: '123/2026', idSeguradora: 'f1', seguradora: 'SEGURADORA TESTE', idCorretor: null, corretor: null, segurado: 'NEXO',
  idBaseOperacional: null, baseOperacional: null, idProcesso: null, processo: null, vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31',
  valor: 6000, franquia: 2500, observacao: null, situacao: 'VIGENTE', situacaoRotulo: 'Vigente', diasParaVencer: 64, diasParaComecar: -302,
  veiculosHoje: 1, renovadaPor: null,
  veiculos: [{ id: 'c1', idVeiculo: 'v1', placa: 'ABC1D23', modelo: 'HILUX', inicio: '2026-01-01', fim: null, cobertoHoje: true,
    motivoEncerramento: null, motivoEncerramentoRotulo: null, observacaoEncerramento: null }],
  parcelas: [PARCELA], totalParcelas: 500, anexos: [], dataCriacao: '2026-01-02T10:00:00-03:00', usuarioCriacao: 'GESTOR'
};
const SINISTRO: Sinistro = {
  id: 's1', numero: 7, idVeiculo: 'v1', placa: 'ABC1D23', modelo: 'HILUX', idBaseOperacional: 'b1', baseOperacional: 'JUAZEIRO',
  ocorridoEm: '2026-10-27T14:05:00-03:00', local: 'BR-324', tipo: 'COLISAO_SEM_VITIMA', tipoRotulo: 'Colisão sem vítima',
  idCondutor: 'col1', condutor: 'ANA TESTE', culpaCondutor: null, descricao: 'Traseira batida.', terceiros: null, boletimOcorrencia: null,
  seguradora: null, franquiaPaga: null, reparo: null, situacao: 'RASCUNHO', situacaoRotulo: 'Rascunho', podeFinalizar: true,
  finalizadoEm: null, canceladoEm: null, motivoCancelamento: null, anexos: [], dataCriacao: '2026-10-27T15:00:00-03:00', usuarioCriacao: 'GESTOR'
};

const SEGURADORA_CADASTRO: SeguradoraFrota = {
  id: 's1', idFornecedor: 'f1', nome: 'SEGURADORA TESTE', papel: 'SEGURADORA', papelRotulo: 'Seguradora',
  telefoneAssistencia: null, observacao: null, apolicesVigentes: 1, ativo: true
};

function montar<T>(tipo: Type<T>, seguros: object, permissoes: string[], entradas: Record<string, unknown> = {}, frota: object = {},
  financeiro: object = {}) {
  TestBed.configureTestingModule({
    imports: [tipo],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
      { provide: FrotaSeguroService, useValue: { coberturaVeiculos: () => of([]), listarSeguradoras: () => of([]), ...seguros } },
      { provide: FinanceiroService, useValue: financeiro },
      { provide: FrotaService, useValue: { fornecedoresOficina: () => of([]), listarCondutores: () => paginaDe([]), opcoes: () => of(OPCOES_VAZIAS), ...frota } },
      { provide: AuthService, useValue: { currentUser: signal({ permissoes }) } },
      { provide: LookupStore, useValue: { operationalBases: signal([]), processes: signal([]), loadBootstrap: () => of({}) } }
    ]
  });
  const fixture = TestBed.createComponent(tipo) as ComponentFixture<T>;
  for (const [nome, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nome, valor);
  fixture.detectChanges();
  return { fixture, tela: fixture.componentInstance as unknown as Tela, el: fixture.nativeElement as HTMLElement };
}

describe('situações de seguro e sinistro', () => {
  it('vigência diz quantos dias faltam e marca a vencida', () => {
    expect(vigenciaApolice({ situacao: 'A_VENCER', diasParaVencer: 1 }).rotulo).toBe('Vence em 1 dia');
    expect(vigenciaApolice({ situacao: 'A_VENCER', diasParaVencer: 0 }).rotulo).toBe('Vence hoje');
    expect(vigenciaApolice({ situacao: 'VENCIDO', diasParaVencer: -3 })).toEqual({ tom: 'danger', icone: 'pi pi-times-circle', rotulo: 'Vencida' });
    expect(vigenciaApolice({ situacao: 'VIGENTE', diasParaVencer: 90 }).tom).toBe('success');
    expect(vigenciaApolice({ situacao: 'VIGENTE', diasParaVencer: 380, diasParaComecar: 16, vigenciaInicio: '2026-11-15' }).rotulo)
      .toBe('Começa em 15/11/2026');
    expect(vigenciaApolice({ situacao: 'A_VENCER', diasParaVencer: 15, renovadaPor: { id: 'a2', numero: '124', vigenciaInicio: '2026-11-15' } }).rotulo)
      .toBe('Renovada');
  });

  it('parcela vencida sem pedido se destaca; enviada mostra a situação no financeiro', () => {
    expect(pagamentoParcela(PARCELA).rotulo).toBe('Falta pedir o pagamento');
    expect(pagamentoParcela({ ...PARCELA, vencida: true })).toEqual({ tom: 'danger', icone: 'pi pi-exclamation-triangle', rotulo: 'Vencida sem pedido' });
    // Longe do vencimento não alerta.
    expect(pagamentoParcela({ ...PARCELA, pedirEmBreve: false })).toEqual({ tom: 'neutral', icone: 'pi pi-calendar', rotulo: 'Programada' });
    expect(pagamentoParcela({ ...PARCELA, situacaoPagamento: 'APROVADO' }).tom).toBe('success');
  });

  it('cada situação do sinistro tem rótulo e ícone, não só cor', () => {
    expect(situacaoSinistro('EM_OFICINA')).toEqual({ tom: 'info', icone: 'pi pi-wrench', rotulo: 'Em oficina' });
    expect(situacaoSinistro('CANCELADO').icone).toBe('pi pi-ban');
  });
});

describe('FrotaApoliceDrawerComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('gera as parcelas pela quantidade e pede o pagamento ao financeiro com a origem da parcela', () => {
    const seguros = { gerarParcelas: vi.fn(() => of(APOLICE)) };
    const { tela } = montar(FrotaApoliceDrawerComponent, seguros, ['frota:seguro:write'],
      { apolice: { ...APOLICE, parcelas: [] }, podeEditar: true, podePedirPagamento: true, visivel: true });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    tela['quantidade'].set(12);
    tela['primeiroVencimento'].set(new Date(2026, 0, 10));
    tela['gerarParcelas']();
    expect(seguros.gerarParcelas).toHaveBeenCalledWith('a1', 12, '2026-01-10', null);

    vi.useFakeTimers();
    tela['pedirPagamento'](PARCELA);
    vi.runAllTimers();
    vi.useRealTimers();
    expect(navegar).toHaveBeenCalledWith(['/financeiro', 'pagamentos', 'nova'], { queryParams: { origem: 'FROTA_SEGURO', origemId: 'p1' } });
  });

  it('seguradora e corretor saem do cadastro; incluir um fornecedor já o escolhe na apólice', () => {
    const cadastro = [
      { ...SEGURADORA_CADASTRO },
      { ...SEGURADORA_CADASTRO, id: 's2', idFornecedor: 'f2', nome: 'CORRETORA X', papel: 'CORRETORA' as const, papelRotulo: 'Corretora' },
      { ...SEGURADORA_CADASTRO, id: 's3', idFornecedor: 'f3', nome: 'ANTIGA SEGUROS', ativo: false }
    ];
    const seguros = {
      listarSeguradoras: () => of(cadastro),
      salvarSeguradora: vi.fn(() => of({ ...SEGURADORA_CADASTRO, id: 's4', idFornecedor: 'f4', nome: 'NOVA SEGUROS' }))
    };
    const { tela } = montar(FrotaApoliceDrawerComponent, seguros, ['frota:seguro:write'],
      { podeEditar: true, visivel: true, fornecedores: [{ id: 'f4', nome: 'NOVA SEGUROS' }, { id: 'f1', nome: 'SEGURADORA TESTE' }] });

    expect(tela['opcoesSeguradora']()).toEqual([{ label: 'SEGURADORA TESTE', value: 'f1' }]);
    expect(tela['opcoesCorretor']()).toEqual([{ label: 'CORRETORA X', value: 'f2' }]);

    tela['abrirNovoFornecedor']('SEGURADORA');
    // Quem já é seguradora não aparece de novo.
    expect(tela['opcoesFornecedorNovo']()).toEqual([{ label: 'NOVA SEGUROS', value: 'f4' }]);
    tela['incluirSeguradora']('SEGURADORA', 'f4');

    expect(seguros.salvarSeguradora).toHaveBeenCalledWith({ idFornecedor: 'f4', papel: 'SEGURADORA', telefoneAssistencia: null, observacao: null });
    expect(tela['seguradora']()).toBe('f4');
    expect(tela['opcoesSeguradora']().map((o: { value: string }) => o.value)).toEqual(['f1', 'f4']);
  });

  it('cadastro de seguradoras não oferece o fornecedor que já está no mesmo papel', () => {
    const seguros = {
      listarSeguradoras: () => of([SEGURADORA_CADASTRO]),
      salvarSeguradora: vi.fn(() => of({ ...SEGURADORA_CADASTRO, id: 's9', papel: 'CORRETORA' as const, papelRotulo: 'Corretora' }))
    };
    const frota = { fornecedoresOficina: () => of([{ id: 'f1', nome: 'SEGURADORA TESTE' }, { id: 'f2', nome: 'OUTRA' }]) };
    const { tela } = montar(FrotaSeguradorasCadastroComponent, seguros, ['frota:seguro:write'], {}, frota);

    expect(tela['linhas']()).toHaveLength(1);
    tela['lista'].filters.papel.set('CORRETORA');
    tela['lista'].apply();
    expect(tela['linhas']()).toHaveLength(0);
    tela['lista'].reset();
    tela['lista'].filters.assistencia.set('SEM');
    tela['lista'].apply();
    expect(tela['linhas']()).toHaveLength(1);

    tela['novo']();
    expect(tela['opcoesFornecedor']().map((o: { value: string }) => o.value)).toEqual(['f2']);
    tela['papel'].set('CORRETORA');
    expect(tela['opcoesFornecedor']().map((o: { value: string }) => o.value)).toEqual(['f1', 'f2']);

    tela['salvar']();
    expect(seguros.salvarSeguradora).not.toHaveBeenCalled();
    tela['fornecedor'].set('f1');
    tela['telefoneAssistencia'].set('0800 701 0101');
    tela['salvar']();
    expect(seguros.salvarSeguradora).toHaveBeenCalledWith(
      { idFornecedor: 'f1', papel: 'CORRETORA', telefoneAssistencia: '0800 701 0101', observacao: null }, undefined);
    expect(formatarTelefone('08007010101')).toBe('0800 701 0101');
    expect(formatarTelefone('71999990000')).toBe('(71) 99999-0000');
  });

  it('não salva sem número e seguradora; no cadastro manda os veículos cobertos', () => {
    const seguros = { salvarApolice: vi.fn(() => of(APOLICE)) };
    const { tela } = montar(FrotaApoliceDrawerComponent, seguros, ['frota:seguro:write'], { podeEditar: true, visivel: true });

    tela['salvar']();
    expect(seguros.salvarApolice).not.toHaveBeenCalled();
    expect(tela['erro']('seguradora')).toBe('Escolha a seguradora.');

    tela['numero'].set(' 555 ');
    tela['seguradora'].set('f1');
    tela['inicio'].set(new Date(2026, 0, 1));
    tela['fim'].set(new Date(2026, 11, 31));
    tela['valor'].set(6000);
    tela['idsVeiculo'].set(['v1']);
    tela['salvar']();
    expect(seguros.salvarApolice).not.toHaveBeenCalled();
    expect(tela['erro']('base')).toContain('pagamento das parcelas');

    tela['base'].set('b1');
    tela['processo'].set('s1');
    tela['salvar']();
    expect(seguros.salvarApolice).toHaveBeenCalledWith(expect.objectContaining({
      numero: '555', idSeguradora: 'f1', vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31', idsVeiculo: ['v1']
    }), undefined);
  });

  it('renovar começa no dia seguinte ao fim, por um ano, com os veículos que ainda estavam cobertos', () => {
    const atual = {
      ...APOLICE, idBaseOperacional: 'b1', idProcesso: 's1',
      veiculos: [...APOLICE.veiculos, { ...APOLICE.veiculos[0], id: 'c2', idVeiculo: 'v2', fim: '2026-06-30' }]
    };
    const { tela } = montar(FrotaApoliceDrawerComponent, {}, ['frota:seguro:write'], { renovacaoDe: atual, podeEditar: true, visivel: true });

    expect(tela['titulo']()).toBe('Renovar apólice 123/2026');
    expect(tela['request']()).toEqual(expect.objectContaining({
      numero: '', idSeguradora: 'f1', idBaseOperacional: 'b1', idProcesso: 's1',
      vigenciaInicio: '2027-01-01', vigenciaFim: '2027-12-31', idsVeiculo: ['v1']
    }));
  });

  it('com uma parcela já pedida, pede as outras repetindo a solicitação e troca valor e vencimento', () => {
    const pedida = { ...PARCELA, idSolicitacaoFinanceira: 'sol1', numeroSolicitacaoFinanceira: 41, situacaoPagamento: 'APROVADO' as const, podePedirPagamento: false };
    const segunda = { ...PARCELA, id: 'p2', numero: 2, vencimento: '2026-12-10' };
    const apolice = { ...APOLICE, parcelas: [pedida, segunda] };
    const seguros = {
      preenchimentoFinanceiro: vi.fn(() => of({ origemTipo: 'FROTA_SEGURO', referencia: 'parcela 2/2', varianteSugerida: 'PADRAO', rotulos: {},
        valores: { valor: 500, vencimento: '2026-12-10', observacoes: 'Parcela 2/2', descricao: 'não existe no formulário' } })),
      buscarApolice: vi.fn(() => of(apolice))
    };
    const financeiro = {
      buscarSolicitacao: vi.fn(() => of({ formulario: { id: 'form1' }, valores: {
        valor: { valor: 500 }, vencimento: { valor: '2026-11-10' }, observacoes: { valor: 'Parcela 1/2' }, formaPagamento: { valor: 'BOLETO' } } })),
      criarSolicitacao: vi.fn(() => of({ id: 'sol2' })),
      submeter: vi.fn(() => of({ id: 'sol2' }))
    };
    const { tela } = montar(FrotaApoliceDrawerComponent, seguros, ['frota:seguro:write'],
      { apolice, podeEditar: true, podePedirPagamento: true, visivel: true }, {}, financeiro);

    expect(tela['modeloPagamento']().id).toBe('p1');
    expect(tela['parcelasPedido']()).toEqual(['p2']);
    tela['pedirEmLote'](pedida);

    expect(financeiro.criarSolicitacao).toHaveBeenCalledWith('PAGAMENTO', {
      formularioId: 'form1',
      valores: { valor: 500, vencimento: '2026-12-10', observacoes: 'Parcela 2/2', formaPagamento: 'BOLETO' },
      origem: { tipo: 'FROTA_SEGURO', id: 'p2' }
    });
    expect(financeiro.submeter).toHaveBeenCalledWith('PAGAMENTO', 'sol2');
  });

  it('a saída do veículo pede o motivo antes de gravar', () => {
    const seguros = { encerrarCobertura: vi.fn(() => of(APOLICE)) };
    const { tela } = montar(FrotaApoliceDrawerComponent, seguros, ['frota:seguro:write'], { apolice: APOLICE, podeEditar: true, visivel: true });
    const cobertura = APOLICE.veiculos[0];

    tela['iniciarEncerramento'](cobertura);
    tela['fimCobertura'].set(new Date(2026, 5, 30));
    tela['encerrarCobertura'](cobertura);
    expect(seguros.encerrarCobertura).not.toHaveBeenCalled();

    tela['motivoEncerramento'].set('VENDA');
    tela['encerrarCobertura'](cobertura);
    expect(seguros.encerrarCobertura).toHaveBeenCalledWith('a1', 'c1', '2026-06-30', 'VENDA', null);
  });
});

describe('FrotaSinistroDrawerComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('registra sem condutor para o servidor achar quem dirigia, com culpa ainda não apurada', () => {
    const seguros = { salvarSinistro: vi.fn(() => of(SINISTRO)) };
    const { tela } = montar(FrotaSinistroDrawerComponent, seguros, ['frota:sinistro:write'],
      { podeEditar: true, idVeiculoFixo: 'v1', visivel: true });

    tela['tipo'].set('FURTO');
    tela['descricao'].set('Estepe furtado no pátio.');
    tela['salvar']();

    expect(seguros.salvarSinistro).toHaveBeenCalledWith(expect.objectContaining({
      idVeiculo: 'v1', tipo: 'FURTO', idCondutor: null, culpaCondutor: null, descricao: 'Estepe furtado no pátio.'
    }), undefined);
  });

  it('com a OS de reparo aberta, finalizar e cancelar ficam travados e o motivo aparece', async () => {
    const aberto = { ...SINISTRO, situacao: 'EM_OFICINA' as const, podeFinalizar: false,
      reparo: { idOrdemServico: 'os1', numero: 42, situacao: 'EM_ANDAMENTO' as const, situacaoRotulo: 'Em andamento', aberta: true, veiculoParado: true, fimReal: null } };
    const { fixture, el } = montar(FrotaSinistroDrawerComponent, {}, ['frota:sinistro:write'], { sinistro: aberto, podeEditar: true, visivel: true });
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = document.body.textContent ?? el.textContent ?? '';
    expect(texto).toContain('OS 42');
    expect(texto).toContain('conclua ou cancele antes a OS 42');
  });

  it('acionar a seguradora busca as apólices do dia do sinistro e escolhe a única', () => {
    const seguros = { apolicesCobrindo: vi.fn(() => of([APOLICE])), acionarSeguradora: vi.fn(() => of(SINISTRO)) };
    const { tela } = montar(FrotaSinistroDrawerComponent, seguros, ['frota:sinistro:write'], { sinistro: SINISTRO, podeEditar: true, visivel: true });

    tela['abrirEtapa']('seguradora');
    expect(seguros.apolicesCobrindo).toHaveBeenCalledWith('v1', '2026-10-27');
    expect(tela['idApolice']()).toBe('a1');

    tela['numeroSeguradora'].set(' SIN-9 ');
    tela['acionar']();
    expect(seguros.acionarSeguradora).toHaveBeenCalledWith('s1', 'a1', 'SIN-9', null);
  });
});

describe('FrotaVeiculoSinistrosComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lista os sinistros do veículo com a OS de reparo', async () => {
    const comOs = { ...SINISTRO, situacao: 'EM_OFICINA' as const, situacaoRotulo: 'Em oficina',
      reparo: { idOrdemServico: 'os1', numero: 42, situacao: 'PENDENTE' as const, situacaoRotulo: 'Pendente', aberta: true, veiculoParado: false, fimReal: null } };
    const seguros = { listarSinistros: vi.fn(() => paginaDe([comOs])) };
    const { fixture, el } = montar(FrotaVeiculoSinistrosComponent, seguros, ['frota:sinistro:read'],
      { veiculo: { idVeiculo: 'v1', placa: 'ABC1D23', modelo: 'HILUX' } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(seguros.listarSinistros).toHaveBeenCalledWith({ idVeiculo: 'v1' }, { size: 100, sort: ['ocorridoEm,desc'] });
    expect(el.textContent).toContain('Colisão sem vítima');
    expect(el.textContent).toContain('OS 42 · Pendente');
  });
});

describe('FrotaOrdemServicoFormComponent pelo sinistro', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('abre a OS de reparo pelo sinistro, com origem sinistro e o relato na descrição', () => {
    const seguros = { abrirOrdemServico: vi.fn(() => of({ ...SINISTRO, reparo: { numero: 42 } })) };
    const frota = {
      listarVeiculos: () => paginaDe([]),
      itensManutencao: () => paginaDe([]),
      fornecedoresOficina: () => of([]),
      listarCondutores: () => paginaDe([])
    };
    const { tela } = montar(FrotaOrdemServicoFormComponent, seguros, ['frota:os:write'], { sinistro: SINISTRO, visivel: true }, frota);
    const atualizado = vi.fn();
    tela['sinistroAtualizado'].subscribe(atualizado);

    expect(tela['origem']()).toBe('SINISTRO');
    expect(tela['origemFixa']()).toBe(true);
    expect(tela['descricao']()).toBe('Sinistro 7 (colisão sem vítima): Traseira batida.');
    tela['idsItem'].set(['i1']);
    tela['salvar']();

    expect(seguros.abrirOrdemServico).toHaveBeenCalledWith('s1', expect.objectContaining({
      idCondutor: 'col1', idsItem: ['i1'], descricao: 'Sinistro 7 (colisão sem vítima): Traseira batida.'
    }));
    expect(atualizado).toHaveBeenCalled();
  });
});
