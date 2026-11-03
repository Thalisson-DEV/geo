import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../core/lookup';
import { ContagensPreventiva, ControlePreventivo, aparenciaPreventiva } from '../../../core/models/frota-preventiva.models';
import { AuthService } from '../../../core/services/auth.service';
import { FrotaPreventivaService } from '../../../core/services/frota-preventiva.service';
import { FrotaService } from '../../../core/services/frota.service';
import { FrotaAcompanhamentoPreventivaComponent } from './frota-acompanhamento-preventiva.component';
import { FrotaInformarRealizacaoDrawerComponent } from './frota-informar-realizacao-drawer.component';
import { FrotaPlanosPreventivaComponent, valePara } from './frota-planos-preventiva.component';

registerLocaleData(localePt, 'pt-BR');

type Tela = Record<string, any>;

const VENCIDA: ControlePreventivo = {
  id: 'c1', idVeiculo: 'v1', placa: 'ABC1D23', base: 'JUAZEIRO', idPlano: 'p1', plano: 'Revisão 10 mil km',
  frequencia: 'a cada 10.000 km ou 180 dias', situacao: 'VENCIDA', situacaoRotulo: 'Vencida', semHistorico: false, unidade: 'KM',
  medicaoAtual: 50120, baseData: '2026-05-01', baseMedicao: 40000, baseOrigem: 'INFORMADA', baseOrigemRotulo: 'Realização informada',
  proximaMedicao: 50000, faltaMedicao: -120, proximaData: '2026-10-28', faltaDias: 4, previsao: '2026-10-24', falta: 'passou 120 km',
  idOrdemServico: null, numeroOrdemServico: null
};
const PROXIMA: ControlePreventivo = { ...VENCIDA, id: 'c2', idVeiculo: 'v2', placa: 'DEF4G56', situacao: 'PROXIMA', situacaoRotulo: 'Próxima', falta: 'faltam 500 km' };
const COM_OS: ControlePreventivo = { ...VENCIDA, id: 'c3', idVeiculo: 'v3', placa: 'GHI7J89', idOrdemServico: 'os9', numeroOrdemServico: 1009 };
const SEM_HISTORICO: ControlePreventivo = { ...VENCIDA, id: 'c4', idVeiculo: 'v4', placa: 'JKL0M12', situacao: 'EM_DIA', situacaoRotulo: 'Em dia', semHistorico: true, baseOrigem: 'INICIO', falta: 'faltam 9.000 km ou 170 dias' };
const CONTAGENS: ContagensPreventiva = { vencidas: 1, proximas: 1, comOs: 1, semHistorico: 1, emDia: 1, todas: 4 };

function montarAcompanhamento(permissoes: string[], contagens = CONTAGENS, controles = [VENCIDA, PROXIMA, COM_OS, SEM_HISTORICO]) {
  const servico = {
    planos: vi.fn(() => of([])),
    acompanhamento: vi.fn(() => of({ pagina: { content: controles, page: { size: 2000, number: 0, totalElements: controles.length, totalPages: 1 } }, contagens })),
    abrirOs: vi.fn(() => of({ ordens: [{ id: 'os10', numero: 1010, placa: 'ABC1D23', planos: ['Revisão 10 mil km'] }] }))
  };
  TestBed.configureTestingModule({
    imports: [FrotaAcompanhamentoPreventivaComponent],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      MessageService,
      ConfirmationService,
      { provide: FrotaPreventivaService, useValue: servico },
      { provide: AuthService, useValue: { currentUser: signal({ permissoes }) } },
      { provide: LookupStore, useValue: { operationalBases: signal([]), loadBootstrap: () => of({}) } }
    ]
  });
  const fixture = TestBed.createComponent(FrotaAcompanhamentoPreventivaComponent);
  fixture.detectChanges();
  return { fixture, tela: fixture.componentInstance as unknown as Tela, el: fixture.nativeElement as HTMLElement, servico };
}

describe('aparenciaPreventiva', () => {
  it('com OS aberta acompanha (info); sem OS, vencida é perigo e próxima é aviso', () => {
    expect(aparenciaPreventiva(COM_OS)).toEqual({ tom: 'info', icone: 'pi-wrench', rotulo: 'Com OS aberta' });
    expect(aparenciaPreventiva(VENCIDA).tom).toBe('danger');
    expect(aparenciaPreventiva(PROXIMA).tom).toBe('warning');
    expect(aparenciaPreventiva(SEM_HISTORICO).rotulo).toBe('Em dia');
  });
});

describe('FrotaAcompanhamentoPreventivaComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('abre nas vencidas, sem a que já tem OS, e mostra a contagem de cada situação', () => {
    const { tela, el } = montarAcompanhamento(['frota:preventiva:read']);
    expect(tela['recorte']()).toBe('VENCIDA');
    expect(tela['linhas']().map((c: ControlePreventivo) => c.id)).toEqual(['c1']);
    const valores = Array.from(el.querySelectorAll('.ces-kpi__value')).map((v) => v.textContent!.trim());
    expect(valores).toEqual(['1', '1', '1', '1', '1']);
  });

  it('sem vencidas abre nas próximas; o atalho clicado de novo volta a todas', () => {
    const { tela } = montarAcompanhamento(['frota:preventiva:read'], { ...CONTAGENS, vencidas: 0 }, [PROXIMA, SEM_HISTORICO]);
    expect(tela['recorte']()).toBe('PROXIMA');
    tela['escolher']('SEM_HISTORICO');
    expect(tela['linhas']().map((c: ControlePreventivo) => c.id)).toEqual(['c4']);
    tela['escolher']('SEM_HISTORICO');
    expect(tela['recorte']()).toBe('TODAS');
  });

  it('só oferece abrir OS para quem escreve na preventiva e nas OS', () => {
    expect(montarAcompanhamento(['frota:preventiva:read', 'frota:preventiva:write']).tela['podeAbrirOs']()).toBe(false);
    TestBed.resetTestingModule();
    expect(montarAcompanhamento(['frota:preventiva:write', 'frota:os:write']).tela['podeAbrirOs']()).toBe(true);
  });

  it('abre uma OS por veículo e ignora o plano que já tem OS', async () => {
    const { tela, servico } = montarAcompanhamento(['frota:preventiva:write', 'frota:os:write']);
    const confirmacao = (tela['confirmacao'] as { confirm: (o: unknown) => Promise<boolean> });
    vi.spyOn(confirmacao, 'confirm').mockResolvedValue(true);
    await tela['abrirOs']([VENCIDA, COM_OS]);
    expect(servico.abrirOs).toHaveBeenCalledWith(['c1']);
  });

  it('o botão do lote conta só os veículos sem OS e o filtro de base vai para a consulta', () => {
    const { tela, servico } = montarAcompanhamento(['frota:preventiva:write', 'frota:os:write']);
    tela['selecionados'].set([VENCIDA, PROXIMA, COM_OS]);
    expect(tela['rotuloAbrirSelecionados']()).toBe('Abrir 2 OS');
    tela['selecionados'].set([COM_OS]);
    expect(tela['livresSelecionados']()).toEqual([]);
    tela['lista'].set('idsBase', ['b1']);
    expect(servico.acompanhamento).toHaveBeenLastCalledWith(expect.objectContaining({ idBase: ['b1'] }), { page: 0, size: 2000 });
  });

  it('sem nenhum plano oferece cadastrar um', () => {
    const vazio = { vencidas: 0, proximas: 0, comOs: 0, semHistorico: 0, emDia: 0, todas: 0 };
    const { tela } = montarAcompanhamento(['frota:preventiva:write'], vazio, []);
    expect(tela['semPlanos']()).toBe(true);
    expect(tela['vazioTitulo']()).toBe('Nenhum veículo acompanhado');
  });
});

describe('FrotaInformarRealizacaoDrawerComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function montarDrawer() {
    const servico = { informarRealizacao: vi.fn(() => of({ ...VENCIDA, situacao: 'EM_DIA', situacaoRotulo: 'Em dia', falta: 'faltam 10.000 km' })) };
    TestBed.configureTestingModule({
      imports: [FrotaInformarRealizacaoDrawerComponent],
      providers: [provideNoopAnimations(), MessageService, ConfirmationService, { provide: FrotaPreventivaService, useValue: servico }]
    });
    const fixture = TestBed.createComponent(FrotaInformarRealizacaoDrawerComponent);
    fixture.componentRef.setInput('controle', VENCIDA);
    fixture.componentRef.setInput('visivel', true);
    fixture.detectChanges();
    return { tela: fixture.componentInstance as unknown as Tela, servico };
  }

  it('recusa leitura acima da atual e exige data e leitura antes de enviar', () => {
    const { tela, servico } = montarDrawer();
    tela['registrar']();
    expect(servico.informarRealizacao).not.toHaveBeenCalled();
    expect(tela['erroMedicao']()).toBe('Informe o valor do painel.');
    tela['data'].set('2026-10-01');
    tela['valor'].set(60000);
    expect(tela['erroMedicao']()).toContain('Passa da leitura atual');
    tela['registrar']();
    expect(servico.informarRealizacao).not.toHaveBeenCalled();
    tela['valor'].set(50000);
    tela['registrar']();
    expect(servico.informarRealizacao).toHaveBeenCalledWith('c1', { data: '2026-10-01', medicao: 50000, observacao: null });
  });
});

describe('FrotaPlanosPreventivaComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('descreve a abrangência e recusa antecedência igual ou maior que a frequência', () => {
    expect(valePara({ tiposVeiculo: [{ id: 't1', nome: 'PICAPE', ativo: true }], tiposImplemento: [{ id: 'i1', nome: 'MUNCK', ativo: true }] }))
      .toBe('PICAPE, com MUNCK');
    TestBed.configureTestingModule({
      imports: [FrotaPlanosPreventivaComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        ConfirmationService,
        { provide: FrotaPreventivaService, useValue: { planos: () => of([]), salvarPlano: vi.fn() } },
        {
          provide: FrotaService,
          useValue: {
            tiposVeiculo: () => of({ content: [] }),
            tiposImplemento: () => of({ content: [] }),
            itensManutencao: () => of({ content: [] })
          }
        },
        { provide: AuthService, useValue: { currentUser: signal({ permissoes: ['frota:preventiva:write'] }) } }
      ]
    });
    const fixture = TestBed.createComponent(FrotaPlanosPreventivaComponent);
    fixture.detectChanges();
    const tela = fixture.componentInstance as unknown as Tela;
    expect(tela['erroAntecedencia'](5000, 5000, 'km')).toBe('A antecedência em km precisa ser menor que a frequência.');
    expect(tela['erroAntecedencia'](5000, 500, 'km')).toBeUndefined();
    tela['abrir'](null);
    tela['salvar']();
    const servico = TestBed.inject(FrotaPreventivaService) as unknown as { salvarPlano: ReturnType<typeof vi.fn> };
    expect(servico.salvarPlano).not.toHaveBeenCalled();
    expect(tela['semFrequencia']()).toBe(true);
  });
});
