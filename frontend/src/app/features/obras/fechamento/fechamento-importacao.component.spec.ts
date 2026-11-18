import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CesConfirmationService, NotificationService } from '@ces/ui';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FechamentoImportacaoRegistro, FechamentoImportacaoResposta } from '../../../core/models/fechamento-obra.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { ObrasService } from '../../../core/services/obras.service';
import { FechamentoImportacaoComponent } from './fechamento-importacao.component';

function linha(numero: number, parcial: Partial<FechamentoImportacaoRegistro> = {}): FechamentoImportacaoRegistro {
  return {
    linha: numero,
    numeroObra: '3101',
    almoxarifado: 'ALMOX',
    tipo: '221',
    codigoMaterial: 'MAT-1',
    quantidade: 2,
    numeroReserva: null,
    dataReserva: null,
    observacao: null,
    status: 'AGUARDANDO_PROCESSAMENTO',
    ...parcial
  };
}

function resposta(registros: FechamentoImportacaoRegistro[], totalSolicitacoes = 1): FechamentoImportacaoResposta {
  const totalFalha = registros.filter((r) => r.status === 'COM_ERRO').length;
  return { registros, totalProcessados: registros.length, totalSucesso: registros.length - totalFalha, totalFalha, totalSolicitacoes };
}

describe('FechamentoImportacaoComponent', () => {
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let notificacoes: Record<string, ReturnType<typeof vi.fn>>;
  let confirmar: ReturnType<typeof vi.fn>;

  function criar() {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        { provide: FechamentoObraService, useValue: service },
        { provide: NotificationService, useValue: notificacoes },
        { provide: CesConfirmationService, useValue: { confirm: confirmar } },
        {
          provide: AlmoxarifadoService,
          useValue: { listarEstoquesAtivos: () => of({ content: [] }), listarMateriais: () => of({ content: [] }) }
        },
        { provide: ObrasService, useValue: { listarObras: () => of({ content: [] }) } }
      ]
    });
    const fixture = TestBed.createComponent(FechamentoImportacaoComponent);
    return { fixture, tela: fixture.componentInstance as unknown as Record<string, any> };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    service = { validarImportacao: vi.fn(), revalidarImportacao: vi.fn(), confirmarImportacao: vi.fn(), baixarModeloImportacao: vi.fn() };
    notificacoes = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };
    confirmar = vi.fn(async () => true);
  });

  it('mostra as linhas validadas e avisa quantas têm inconsistência', () => {
    service['validarImportacao'].mockReturnValue(of(resposta([linha(2), linha(3, { status: 'COM_ERRO', campoErro: 'tipo' })])));
    const { tela } = criar();

    tela['aoEscolherArquivo'](new File(['x'], 'fechamento.csv'));

    expect(tela['registros']()).toHaveLength(2);
    expect(tela['validos']()).toBe(1);
    expect(tela['comErro']()).toBe(1);
    expect(tela['solicitacoesPrevistas']()).toBe(1);
    expect(notificacoes['warning']).toHaveBeenCalledWith('1 de 2 linhas têm inconsistências.');
  });

  it('corrigir uma linha revalida o conjunto no servidor, sem o campo de edição', () => {
    service['validarImportacao'].mockReturnValue(of(resposta([linha(2, { status: 'COM_ERRO', tipo: '999' })], 0)));
    service['revalidarImportacao'].mockReturnValue(of(resposta([linha(2)])));
    const { tela } = criar();
    tela['aoEscolherArquivo'](new File(['x'], 'fechamento.csv'));

    const registro = tela['registros']()[0];
    tela['editar'](registro);
    expect(registro.editing).toBe(true);
    registro.tipo = '221';
    tela['concluirEdicao'](registro);

    expect(service['revalidarImportacao'].mock.calls[0][0][0]).not.toHaveProperty('editing');
    expect(service['revalidarImportacao'].mock.calls[0][0][0].tipo).toBe('221');
    expect(tela['comErro']()).toBe(0);
    expect(tela['solicitacoesPrevistas']()).toBe(1);
  });

  it('não processa com linha aberta e, sucesso, fecha, limpa e avisa a lista', async () => {
    service['validarImportacao'].mockReturnValue(of(resposta([linha(2), linha(3, { status: 'COM_ERRO' })])));
    service['confirmarImportacao'].mockReturnValue(of(resposta([{ ...linha(2), status: 'CONCLUIDO' }], 1)));
    const { fixture, tela } = criar();
    const processado = vi.fn();
    fixture.componentInstance.processado.subscribe(processado);
    fixture.componentRef.setInput('visible', true);
    tela['aoEscolherArquivo'](new File(['x'], 'fechamento.csv'));

    tela['editar'](tela['registros']()[0]);
    await tela['processar']();
    expect(service['confirmarImportacao']).not.toHaveBeenCalled();
    expect(notificacoes['warning']).toHaveBeenCalledWith('Conclua a correção das linhas abertas antes de processar.');

    tela['registros']()[0].editing = false;
    await tela['processar']();

    expect(service['confirmarImportacao'].mock.calls[0][0]).toHaveLength(1);
    expect(notificacoes['success']).toHaveBeenCalledWith('1 solicitação criada. 1 linha com erro ficou de fora.', { title: 'Importação concluída' });
    expect(processado).toHaveBeenCalledOnce();
    expect(tela['registros']()).toHaveLength(0);
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  it('importação parcial deixa só as linhas com erro para corrigir', async () => {
    service['validarImportacao'].mockReturnValue(of(resposta([linha(2), linha(3, { tipo: '222' })], 2)));
    service['confirmarImportacao'].mockReturnValue(
      of(resposta([{ ...linha(2), status: 'CONCLUIDO' }, linha(3, { tipo: '222', status: 'COM_ERRO', mensagemErro: 'Falhou.' })], 1))
    );
    const { tela } = criar();
    tela['aoEscolherArquivo'](new File(['x'], 'fechamento.csv'));

    await tela['processar']();

    expect(tela['registros']().map((r: FechamentoImportacaoRegistro) => r.linha)).toEqual([3]);
    expect(notificacoes['warning']).toHaveBeenCalledWith('1 solicitação criada; 1 linha ficou com erro.', { title: 'Importação parcial' });
  });

  it('repetir depois de falha de rede usa a mesma chave', async () => {
    service['validarImportacao'].mockReturnValue(of(resposta([linha(2)])));
    service['confirmarImportacao'].mockReturnValue(throwError(() => new Error('rede')));
    const { tela } = criar();
    tela['aoEscolherArquivo'](new File(['x'], 'fechamento.csv'));

    await tela['processar']();
    await tela['processar']();

    const [primeira, segunda] = service['confirmarImportacao'].mock.calls.map((chamada) => chamada[1]);
    expect(primeira).toBeTruthy();
    expect(segunda).toBe(primeira);
  });
});
