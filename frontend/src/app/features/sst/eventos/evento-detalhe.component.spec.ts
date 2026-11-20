import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { GeoConfirmationService } from '@geo/ui';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventoSstResponse } from '../../../core/models/sst-evento.models';
import { AuthService } from '../../../core/services/auth.service';
import { SstService } from '../../../core/services/sst.service';
import { EventoDetalheComponent } from './evento-detalhe.component';

const evento: EventoSstResponse = {
  id: 'ev-1',
  numeroRegistro: 'EVT-2026-000042',
  tipo: 'ACIDENTE_TIPICO',
  status: 'REGISTRADO',
  dataOcorrencia: '2026-09-10T13:30:00Z',
  dataComunicacao: '2026-09-11T19:30:00Z',
  horasAteComunicacao: 30,
  comunicacaoAtrasada: true,
  idAtividade: 'a1',
  atividadeNome: 'PODA',
  idGestor: 'g1',
  gestorNome: 'CARLOS SOUZA',
  gestorFuncao: 'Supervisor',
  gestorSubstituto: false,
  idBaseOperacional: 'b1',
  baseNome: 'BASE JUAZEIRO',
  idEquipe: 'e1',
  equipeCodigo: 'EQ-01',
  idVeiculo: null,
  veiculoPlaca: null,
  idClassificacao: 'c1',
  classificacaoNome: 'GRAVE',
  idProcesso: null,
  processoNome: null,
  telemetria: 'SIM',
  filmagem: 'NAO',
  localOcorrencia: 'Rua A, 10',
  latitude: null,
  longitude: null,
  descricao: 'Queda durante a poda.',
  comLesao: true,
  idLocalLesao: 'l1',
  localLesaoNome: 'Mão direita',
  idNaturezaLesao: 'n1',
  naturezaLesaoNome: 'Corte',
  idAgenteCausador: 'ag1',
  agenteCausadorNome: 'Ferramenta',
  diasPerdidos: 3,
  possuiCat: true,
  tipoCat: 'INICIAL',
  numeroCat: '123456',
  dataEmissaoCat: '2026-09-11',
  tratativa: null,
  dataConclusao: null,
  dataCancelamento: null,
  motivoCancelamento: null,
  motivoReabertura: null,
  tecnicos: [{ id: 't1', idColaborador: 'col-1', nome: 'JOÃO LIMA', funcao: 'Eletricista' }],
  envolvidos: [
    { id: 'en1', tipo: 'COLABORADOR', papel: 'ACIDENTADO', idColaborador: 'col-1', nome: 'JOÃO LIMA', funcao: 'Eletricista', baseOperacional: null, empresa: null },
    { id: 'en2', tipo: 'TERCEIRO', papel: 'TESTEMUNHA', idColaborador: null, nome: 'ANA', funcao: null, baseOperacional: null, empresa: 'Mercado X' }
  ],
  anexos: [],
  ativo: true,
  dataCriacao: '2026-09-11T20:00:00Z',
  usuarioCriacao: 'tecnico.sst'
};

describe('EventoDetalheComponent', { timeout: 15000 }, () => {
  let cancelarEvento: ReturnType<typeof vi.fn>;

  async function montar(permissoes: string[], dados: EventoSstResponse = evento) {
    cancelarEvento = vi.fn(() => of({ ...dados, status: 'CANCELADO', motivoCancelamento: 'Duplicado' }));
    await TestBed.configureTestingModule({
      imports: [EventoDetalheComponent],
      providers: [
        provideRouter([]),
        MessageService,
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'ev-1' } } } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'u1', permissoes }) } },
        { provide: GeoConfirmationService, useValue: { confirm: vi.fn() } },
        {
          provide: SstService,
          useValue: {
            buscarEventoPorId: vi.fn(() => of(dados)),
            listarAnexosEvento: vi.fn(() => of([])),
            cancelarEvento
          }
        }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(EventoDetalheComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('monta o relatório no padrão dos documentos: título, situação, resumo e seções', async () => {
    const fixture = await montar(['sst:evento:read']);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Relatório de Investigação de Acidente');
    expect(texto).toContain('EVT-2026-000042');
    expect(texto).toContain('Aguardando tratativa');
    expect(texto).toContain('fora do prazo legal de 24 h');
    expect(texto).toContain('Com afastamento');
    expect(texto).toContain('Lesão e Afastamento');
    expect(texto).toContain('Acidentados, Testemunhas e Envolvidos');
    expect(texto).toContain('Declaração & Assinaturas');
    // A mão direita do acidentado fica destacada na figura do corpo.
    expect(fixture.nativeElement.querySelectorAll('app-evento-corpo .r--on').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.linha-acidentado').length).toBe(1);
  });

  it('esconde as ações de escrita de quem só pode ler', async () => {
    const fixture = await montar(['sst:evento:read']);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Assumir tratativa');
    expect(texto).not.toContain('Cancelar registro');
  });

  it('cancelamento exige motivo antes de chamar o servidor', async () => {
    const fixture = await montar(['sst:evento:read', 'sst:evento:write']);
    const cmp = fixture.componentInstance as any;
    cmp.abrir('cancelamento');
    cmp.confirmar();
    expect(cancelarEvento).not.toHaveBeenCalled();
    cmp.textoAcao.set('Duplicado');
    cmp.confirmar();
    expect(cancelarEvento).toHaveBeenCalledWith('ev-1', { motivo: 'Duplicado' });
    expect(cmp.evento().status).toBe('CANCELADO');
  });
});
