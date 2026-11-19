import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmationService, MessageService } from 'primeng/api';
import { GeoConfirmationService, NotificationService } from '@geo/ui';

import { SolicitacaoMaterialDetalheResponse } from '../../../../core/models/solicitacao-material-tecnica.models';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ConnectivityService } from '../../../../core/services/connectivity.service';
import { ObrasService } from '../../../../core/services/obras.service';
import { RhService } from '../../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../../core/services/solicitacao-material-tecnica.service';
import { UsuarioLookupService } from '../../../../core/services/usuario-lookup.service';
import { SolicitacaoTecnicaDetalheComponent } from './solicitacao-tecnica-detalhe.component';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

// O painel lateral usa abas do PrimeNG, que observam o tamanho; o jsdom não tem ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

const material = { id: 'mat-1', codigo: 'CABO-001', descricao: 'Cabo', unidadeMedida: 'M', detalhaSerie: false, ativo: true } as any;
const itens = [{ id: 'item-1', material, quantidade: 8, quantidadeEntregue: 0, quantidadePendente: 8, tipoMovimentacao: 'ADICAO_COMUM' }];
const tecnico = (extra: Record<string, unknown> = {}) => ({
  tipoTecnico: 'ADICAO_COMUM', tipoObra: 'OBRA', idObra: 'obra-1', ocorrencia: { id: 'oc', codigo: '88415' },
  idAlmoxarifadoAtendimento: 'almox-1', idEquipe: 'equipe-1', dataPrevista: '2026-08-30', observacao: null,
  statusSeparacao: 'PRONTO_PARA_SEPARACAO', versao: 2, atrasada: false, reserva: null, encerradaEm: null, motivoEncerramento: null,
  acoesPermitidas: ['EDITAR_PLANEJAMENTO', 'INICIAR_SEPARACAO', 'VER_HISTORICO'],
  totais: { solicitada: 8, entregaBruta: 0, entregaEstornada: 0, entregaLiquida: 0, devolucaoBruta: 0, devolucaoEstornada: 0, devolucaoLiquida: 0, pendente: 8 },
  operacoes: [],
  ...extra
});
const detalhe = (status = 'APROVADO', extra: Record<string, unknown> = {}, sol: Record<string, unknown> = {}): SolicitacaoMaterialDetalheResponse =>
  ({ id: 'sol-12345678', contexto: 'TECNICO', status, versao: 2, acoesPermitidas: [], dataSolicitacao: '2026-08-20T10:00:00Z', itens, tecnico: tecnico(extra), ...sol }) as any;

describe('SolicitacaoTecnicaDetalheComponent (relatório)', () => {
  let fixture: ComponentFixture<SolicitacaoTecnicaDetalheComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let confirmar: ReturnType<typeof vi.fn>;
  const notifications = { error: vi.fn(), warning: vi.fn(), success: vi.fn() };

  const montar = async (d: SolicitacaoMaterialDetalheResponse) => {
    service['buscarPorId'].mockReturnValue(of(d));
    fixture = TestBed.createComponent(SolicitacaoTecnicaDetalheComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const botoes = (el: HTMLElement) => [...el.querySelectorAll('.fixed button')].map((b) => b.textContent?.trim()).filter(Boolean);
  const tela = () => fixture.componentInstance as any;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    confirmar = vi.fn().mockResolvedValue(true);
    service = {
      buscarPorId: vi.fn(),
      historico: vi.fn().mockReturnValue(of({ eventos: [], integridade: [], page: { number: 0, size: 20, totalElements: 0, totalPages: 1 } })),
      iniciarSeparacao: vi.fn().mockReturnValue(of({})),
      concluirSeparacao: vi.fn().mockReturnValue(of({}))
    };
    await TestBed.configureTestingModule({
      imports: [SolicitacaoTecnicaDetalheComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'sol-12345678' }, queryParamMap: { get: () => null } } } },
        { provide: SolicitacaoMaterialTecnicaService, useValue: service },
        {
          provide: ObrasService,
          useValue: {
            buscarObraPorId: vi.fn().mockReturnValue(of({ id: 'obra-1', numero: '3310', titulo: 'CORRETIVA REDE BT', tipoObraNome: 'CORRETIVA', controleExecucao: 'OC' })),
            listarAgentesAtivos: vi.fn().mockReturnValue(of([]))
          }
        },
        {
          provide: AlmoxarifadoService,
          useValue: {
            listarEstoquesAtivos: vi.fn().mockReturnValue(of({ content: [{ id: 'almox-1', nomeIdentificador: 'ALMOXARIFADO_JUAZEIRO' }] })),
            buscarAssinaturaSolicitacao: vi.fn().mockReturnValue(of(null)),
            listarMotivosPendencia: vi.fn().mockReturnValue(of([])),
            listarMotivosRejeicaoAtivos: vi.fn().mockReturnValue(of({ content: [] }))
          }
        },
        {
          provide: RhService,
          useValue: {
            listarEquipes: vi.fn().mockReturnValue(of({ content: [{ id: 'equipe-1', codigo: 'FAF1234123', tipoEquipe: { nome: 'LEVE' } }] })),
            buscarColaboradorPorId: vi.fn().mockReturnValue(of({ nomeCompleto: 'JOAO DA SILVA' }))
          }
        },
        { provide: AuthService, useValue: { currentUser: signal({ permissoes: ['estoque:solicitacao:read'] }) } },
        { provide: ConnectivityService, useValue: { isOnline: signal(true) } },
        { provide: NotificationService, useValue: notifications },
        { provide: GeoConfirmationService, useValue: { confirm: confirmar } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: ConfirmationService, useValue: { confirm: vi.fn() } },
        { provide: UsuarioLookupService, useValue: { resolverNome: vi.fn((v: string) => v ?? 'Não informado') } }
      ]
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('monta o documento no padrão do comercial: título, faixa, quadro de dados, resumo e termo', async () => {
    const el = await montar(detalhe());
    const texto = el.textContent ?? '';
    expect(service['buscarPorId']).toHaveBeenCalledWith('sol-12345678');
    expect(texto).toContain('Solicitação Técnica #sol-1234');
    expect(texto).toContain('Planejada, a separar');
    expect(texto).toContain('Obra & Atendimento');
    expect(texto).toContain('3310 · CORRETIVA REDE BT');
    expect(texto).toContain('OC 88415');
    expect(texto).toContain('FAF1234123 · LEVE');
    expect(texto).toContain('ALMOXARIFADO_JUAZEIRO');
    expect(texto).toContain('Saldo pendente');
    expect(texto).toContain('Termo de Responsabilidade');
  });

  it('a planejar: o próximo passo é PLANEJAR, sem editar ao lado', async () => {
    const el = await montar(detalhe('APROVADO', { dataPrevista: null, idEquipe: null, acoesPermitidas: ['EDITAR_PLANEJAMENTO'] }));
    expect(el.textContent).toContain('Defina a data do saque e, se já souber, a equipe');
    expect(botoes(el)).toEqual(['VOLTAR', 'IMPRIMIR', 'PENDÊNCIA', 'PLANEJAR']);
  });

  it('planejada: um único botão principal (iniciar separação) e editar como ação neutra', async () => {
    const el = await montar(detalhe());
    expect(botoes(el)).toEqual(['VOLTAR', 'IMPRIMIR', 'PENDÊNCIA', 'EDITAR', 'INICIAR SEPARAÇÃO']);
  });

  it('separação confirma antes e recarrega o relatório', async () => {
    await montar(detalhe());
    await tela().separar('INICIAR_SEPARACAO');
    expect(confirmar).toHaveBeenCalled();
    expect(service['iniciarSeparacao']).toHaveBeenCalledWith('sol-12345678', { versaoEsperada: 2 }, expect.any(String));
    expect(service['buscarPorId']).toHaveBeenCalledTimes(2);
  });

  it('entrega parcial: estornar, encerrar, pendência e registrar entrega na ordem do comercial', async () => {
    const el = await montar(
      detalhe('ENTREGUE_PARCIAL', {
        statusSeparacao: 'SEPARADO',
        acoesPermitidas: ['ENTREGAR', 'ESTORNAR', 'ENCERRAR_SALDO', 'VER_HISTORICO'],
        totais: { solicitada: 8, entregaBruta: 5, entregaEstornada: 0, entregaLiquida: 5, devolucaoBruta: 0, devolucaoEstornada: 0, devolucaoLiquida: 0, pendente: 3 }
      })
    );
    expect(el.textContent).toContain('Saíram 5 de 8; faltam 3');
    expect(botoes(el)).toEqual(['VOLTAR', 'IMPRIMIR', 'ESTORNAR', 'ENCERRAR SALDO', 'PENDÊNCIA', 'REGISTRAR ENTREGA']);
  });

  it.each([
    ['REGISTRAR ENTREGA', 'entrega', null],
    ['ESTORNAR', 'itens', 'ESTORNAR'],
    ['ENCERRAR SALDO', 'itens', 'ENCERRAR_SALDO']
  ] as const)('%s abre o painel lateral da lista (aba %s)', async (rotulo, aba, acao) => {
    const el = await montar(detalhe('ENTREGUE_PARCIAL', { statusSeparacao: 'SEPARADO', acoesPermitidas: ['ENTREGAR', 'ESTORNAR', 'ENCERRAR_SALDO'] }));
    vi.useFakeTimers();
    ([...el.querySelectorAll('.fixed button')].find((b) => b.textContent?.trim() === rotulo) as HTMLButtonElement).click();
    vi.runAllTimers();
    expect(tela().painelAba()).toBe(aba);
    expect(tela().painelAcao()).toBe(acao);
    expect(tela().painelAberto()).toBe(true);
  });

  it('encerrada: faixa e quadro avisam o encerramento e não sobra ação de operação', async () => {
    const el = await montar(detalhe('ENTREGUE_PARCIAL', { encerrada: true, encerradaEm: '2026-09-21T10:00:00Z', motivoEncerramento: 'Obra cancelada', acoesPermitidas: ['VER_HISTORICO'] }));
    expect(el.textContent).toContain('Saldo encerrado');
    expect(el.textContent).toContain('Obra cancelada');
    expect(el.textContent).toContain('A solicitação já foi encerrada.');
    expect(botoes(el)).toEqual(['VOLTAR', 'IMPRIMIR']);
  });

  it('rejeitada: mostra o motivo e a justificativa', async () => {
    const el = await montar(
      detalhe('REJEITADO', { acoesPermitidas: [] }, { motivoRejeicao: { id: 'm', nome: 'Material indisponível', descricao: 'Sem estoque' }, justificativaRejeicao: 'Falta no almoxarifado' })
    );
    expect(el.textContent).toContain('Solicitação rejeitada');
    expect(el.textContent).toContain('Falta no almoxarifado');
    expect(botoes(el)).toEqual(['VOLTAR', 'IMPRIMIR']);
  });
});
