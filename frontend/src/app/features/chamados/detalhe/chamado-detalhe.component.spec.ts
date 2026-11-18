import '@angular/compiler';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { GeoConfirmationService } from '@geo/ui';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ChamadoDetalheComponent } from './chamado-detalhe.component';
import { ChamadosService } from '../../../core/services/chamados.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { Chamado, InteracaoChamado } from '../../../core/models/chamado.models';
import { UsuarioResponse } from '../../../core/models/iam.models';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('ChamadoDetalheComponent', () => {
  let fixture: ComponentFixture<ChamadoDetalheComponent>;
  let component: ChamadoDetalheComponent;
  let chamadosService: any;
  let usuariosService: any;
  let confirmacao: { confirm: ReturnType<typeof vi.fn> };
  let messages: { add: ReturnType<typeof vi.fn> };

  const mockChamado: Chamado = {
    id: 'chamado-1',
    protocolo: 'CHM-2026-0001',
    assunto: 'Problema na impressora',
    descricao: 'Não está imprimindo',
    prioridade: 'NORMAL',
    status: 'EM_ATENDIMENTO',
    usuarioSolicitanteId: 'user-solicitante',
    usuarioResponsavelId: 'user-responsavel',
    solucao: null,
    topico: {
      id: 'topico-1',
      codigo: 'TI',
      nome: 'Tecnologia da Informação',
      prioridadePadrao: 'NORMAL',
      equipePadrao: { id: 'eq-1', codigo: 'TI-SUP', nome: 'Suporte TI' },
      slaPrimeiraRespostaHoras: 4,
      slaResolucaoHoras: 24,
      pausarSlaAguardandoSolicitante: true,
      prazoReaberturaHoras: 48,
      ordemExibicao: 1,
      ativo: true
    },
    equipeAtendimento: {
      id: 'eq-1',
      codigo: 'TI-SUP',
      nome: 'Suporte TI'
    },
    dataAbertura: '2026-09-10T10:00:00Z',
    dataLimitePrimeiraResposta: '2026-09-10T14:00:00Z',
    dataLimiteResolucao: '2026-09-11T10:00:00Z',
    pausarSlaAguardandoSolicitante: true,
    prazoReaberturaHoras: 48,
    totalSegundosPausaSla: 0,
    dataUltimaInteracao: '2026-09-10T10:30:00Z',
    slaPrimeiraRespostaVencido: false,
    slaResolucaoVencido: false,
    slaPausado: false,
    anexos: [],
    dataCriacao: '2026-09-10T10:00:00Z'
  };

  const mockInteracoes: InteracaoChamado[] = [
    {
      id: 'int-1',
      tipo: 'ABERTURA',
      mensagem: 'Chamado aberto',
      interno: false,
      usuarioAutorId: 'user-solicitante',
      dataEvento: '2026-09-10T10:00:00Z'
    },
    {
      id: 'int-2',
      tipo: 'ALTERACAO_STATUS',
      interno: false,
      statusAnterior: 'ABERTO',
      statusNovo: 'EM_ATENDIMENTO',
      usuarioAutorId: 'user-responsavel',
      dataEvento: '2026-09-10T10:20:00Z'
    }
  ];

  const mockUsuario: UsuarioResponse = {
    id: 'user-responsavel',
    login: 'tecnico.ti',
    email: 'tecnico@empresa.com',
    tipo: 'ADMINISTRATIVO',
    perfil: { id: 'p1', nome: 'Admin' } as any,
    tema: 'light',
    corPrimaria: 'emerald',
    animacoesAtivadas: true,
    ativo: true
  };

  async function montar(modo: 'central' | 'solicitante' = 'central'): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ChamadoDetalheComponent],
      providers: [
        provideRouter([]),
        { provide: ChamadosService, useValue: chamadosService },
        { provide: UsuariosService, useValue: usuariosService },
        { provide: GeoConfirmationService, useValue: confirmacao },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'chamado-1' },
              data: { modo }
            }
          }
        },
        { provide: MessageService, useValue: messages }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChamadoDetalheComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    chamadosService = {
      buscar: vi.fn().mockReturnValue(of(mockChamado)),
      listarInteracoes: vi.fn().mockReturnValue(of(mockInteracoes)),
      listarEquipes: vi.fn().mockReturnValue(
        of({ content: [], page: { number: 0, totalPages: 1, totalElements: 0, size: 30 } })
      ),
      buscarEquipe: vi.fn().mockReturnValue(
        of({
          id: 'eq-1',
          codigo: 'TI-SUP',
          nome: 'Suporte TI',
          membros: ['user-responsavel'],
          ativo: true,
          dataCriacao: '2026-01-01T00:00:00Z'
        })
      ),
      atualizarAtendimento: vi.fn().mockReturnValue(
        of({ ...mockChamado, status: 'RESOLVIDO', solucao: 'Configuração restabelecida' })
      ),
      adicionarInteracao: vi.fn().mockReturnValue(of({})),
      responderComoSolicitante: vi.fn().mockReturnValue(of({})),
      cancelarMeu: vi.fn().mockReturnValue(of({})),
      reabrirMeu: vi.fn().mockReturnValue(of({}))
    };

    usuariosService = {
      listarUsuarios: vi.fn().mockReturnValue(
        of({ content: [mockUsuario], page: { number: 0, totalPages: 1, totalElements: 1, size: 30 } })
      ),
      buscarUsuarioPorId: vi.fn().mockReturnValue(of(mockUsuario))
    };

    confirmacao = { confirm: vi.fn().mockResolvedValue(true) };
    messages = { add: vi.fn() };
  });

  describe('modo central', () => {
    beforeEach(() => montar('central'));

    it('deve carregar os dados do chamado e renderizar detalhes', () => {
      expect(chamadosService.buscar).toHaveBeenCalledWith('chamado-1');
      expect(chamadosService.listarInteracoes).toHaveBeenCalledWith('chamado-1');
      expect(component['chamado']()?.assunto).toBe('Problema na impressora');
      expect(texto()).toContain('Problema na impressora');
      expect(texto()).toContain('CHM-2026-0001');
      expect(texto()).toContain('Em atendimento');
    });

    it('deve detalhar a mudança de status na linha do tempo', () => {
      expect(texto()).toContain('Aberto → Em atendimento');
      expect(component['resumoEventos']()).toBe('2 eventos');
    });

    it('deve listar as próximas ações conforme o status atual', () => {
      const rotulos = component['acoesCentral']().map((acao) => acao.label);
      expect(rotulos).toEqual(['Aguardar solicitante', 'Resolver chamado', 'Cancelar chamado']);
      expect(texto()).toContain('Próximas ações');
    });

    it('não deve lançar erro ao invocar responsaveisDisponiveis quando equipe não possui membros definidos', () => {
      component['equipeAtendimentoId'].set('eq-1');
      component['equipeLookup'].setSeed([{ id: 'eq-1', codigo: 'TI-SUP', nome: 'Suporte TI' } as any]);

      expect(() => {
        const responsaveis = component['responsaveisDisponiveis']();
        expect(responsaveis).toBeDefined();
      }).not.toThrow();
    });

    it('deve exigir a solução antes de resolver, sem chamar o servidor', () => {
      component['abrirAtendimento']('RESOLVIDO');
      component['salvarAtendimento']();

      expect(chamadosService.atualizarAtendimento).not.toHaveBeenCalled();
      expect(component['erroSolucao']()).toContain('Descreva a solução');
      expect(component['dialogAtendimento']()).toBe(true);
    });

    it('deve finalizar/atualizar o atendimento e recarregar os dados sem quebrar a tela', () => {
      component['abrirAtendimento']('RESOLVIDO');
      component['definirSolucao']('Problema resolvido com sucesso.');

      chamadosService.buscar.mockReturnValue(
        of({ ...mockChamado, status: 'RESOLVIDO', solucao: 'Problema resolvido com sucesso.' })
      );

      component['salvarAtendimento']();

      expect(chamadosService.atualizarAtendimento).toHaveBeenCalledWith('chamado-1', {
        status: 'RESOLVIDO',
        solucao: 'Problema resolvido com sucesso.'
      });

      fixture.detectChanges();

      expect(component['chamado']()?.status).toBe('RESOLVIDO');
      expect(component['dialogAtendimento']()).toBe(false);
      expect(texto()).toContain('Solução registrada');
    });

    it('deve enviar comentário interno quando marcado', () => {
      component['mensagem'].set('Verificar driver');
      component['interno'].set(true);
      component['enviarMensagem']();

      expect(chamadosService.adicionarInteracao).toHaveBeenCalledWith('chamado-1', {
        mensagem: 'Verificar driver',
        interno: true
      });
      expect(component['mensagem']()).toBe('');
    });

    it('deve destacar o prazo estourado com texto, não só com cor', () => {
      chamadosService.buscar.mockReturnValue(of({ ...mockChamado, slaResolucaoVencido: true }));
      component['carregar']();
      fixture.detectChanges();

      expect(component['prazoEstourado']()).toBe(true);
      expect(texto()).toContain('Prazo estourado');
      expect(texto()).toContain('Resolução fora do prazo');
    });

    it('deve manter os dados e avisar quando a atualização falha', () => {
      chamadosService.buscar.mockReturnValue(
        throwError(() => ({ status: 500, error: { detail: 'Falha no servidor' } }))
      );
      component['carregar']();
      fixture.detectChanges();

      expect(component['chamado']()).not.toBeNull();
      expect(texto()).toContain('Não foi possível atualizar o chamado');
    });
  });

  describe('modo solicitante', () => {
    it('deve mostrar estado de erro com nova tentativa quando a carga inicial falha', async () => {
      chamadosService.buscar.mockReturnValue(
        throwError(() => ({ status: 404, error: { detail: 'Chamado não encontrado' } }))
      );
      await montar('solicitante');

      expect(component['chamado']()).toBeNull();
      expect(texto()).toContain('Chamado indisponível');
      expect(texto()).toContain('Tentar novamente');
    });

    it('não deve oferecer ações da central nem comentário interno', async () => {
      await montar('solicitante');

      expect(component['acoesCentral']()).toEqual([]);
      expect(component['modoInterno']()).toBe(false);
      expect(texto()).not.toContain('Próximas ações');
    });

    it('deve responder como solicitante', async () => {
      await montar('solicitante');
      component['mensagem'].set('Segue o print');
      component['enviarMensagem']();

      expect(chamadosService.responderComoSolicitante).toHaveBeenCalledWith('chamado-1', 'Segue o print');
    });

    it('deve cancelar o próprio chamado após confirmação no host global', async () => {
      chamadosService.buscar.mockReturnValue(of({ ...mockChamado, status: 'ABERTO' }));
      await montar('solicitante');

      expect(component['podeCancelarMeu']()).toBe(true);
      await component['confirmarCancelamento']();

      expect(confirmacao.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
      expect(chamadosService.cancelarMeu).toHaveBeenCalledWith('chamado-1');
    });

    it('não deve cancelar quando a confirmação é recusada', async () => {
      chamadosService.buscar.mockReturnValue(of({ ...mockChamado, status: 'ABERTO' }));
      confirmacao.confirm.mockResolvedValue(false);
      await montar('solicitante');

      await component['confirmarCancelamento']();

      expect(chamadosService.cancelarMeu).not.toHaveBeenCalled();
    });

    it('deve permitir reabrir dentro do prazo de reabertura', async () => {
      chamadosService.buscar.mockReturnValue(
        of({
          ...mockChamado,
          status: 'RESOLVIDO',
          dataResolucao: new Date(Date.now() - 3_600_000).toISOString()
        })
      );
      await montar('solicitante');

      expect(component['podeReabrirMeu']()).toBe(true);
      component['abrirReabertura']();
      component['motivoReabertura'].set('Voltou a falhar');
      component['reabrirMeu']();

      expect(chamadosService.reabrirMeu).toHaveBeenCalledWith('chamado-1', 'Voltou a falhar');
      expect(component['dialogReabertura']()).toBe(false);
    });
  });
});
