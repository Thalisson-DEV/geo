import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '@geo/ui';
import { ConfirmationService, MessageService } from 'primeng/api';

import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { ObrasService } from '../../../../core/services/obras.service';
import { RhService } from '../../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../../core/services/solicitacao-material-tecnica.service';
import { NovaSolicitacaoComercialDrawerComponent } from './nova-solicitacao-comercial-drawer.component';
import { NovaSolicitacaoMateriaisComponent } from './nova-solicitacao-materiais.component';
import { NovaSolicitacaoTecnicaDrawerComponent } from './nova-solicitacao-tecnica-drawer.component';
import { foraDoPrazo } from './nova-solicitacao.util';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const cabo = { id: 'mat-1', codigo: 'CABO-11', descricao: 'CABO DE COBRE', unidadeMedida: 'MT', detalhaSerie: false, ativo: true } as any;
const medidor = { id: 'mat-2', codigo: '89127398', descricao: 'MEDIDOR', unidadeMedida: 'UN', detalhaSerie: false, ativo: true } as any;
const estoques = [
  { id: 'alm-1', nomeIdentificador: 'ALMOXARIFADO_JUAZEIRO', ativo: true, idBaseOperacional: 'base-1', tipoEstoque: { nome: 'FISICO' } },
  { id: 'alm-2', nomeIdentificador: 'ALMOXARIFADO_SENHOR_DO_BONFIM', ativo: true, idBaseOperacional: 'base-2', tipoEstoque: { nome: 'FISICO' } },
  { id: 'campo-1', nomeIdentificador: 'FAF1234123', ativo: true, idEquipe: 'eq-1', tipoEstoque: { nome: 'CAMPO' } }
];
const equipes = [
  { id: 'eq-1', codigo: 'FAF1234123', tipoEquipe: { nome: 'LEVE' }, baseOperacional: { id: 'base-1' }, membros: [{ idColaborador: 'col-1', nomeColaborador: 'JOAO', funcao: 'RESPONSAVEL', vinculoAtivo: true }] },
  { id: 'eq-2', codigo: 'SEM-ESTOQUE', tipoEquipe: { nome: 'LEVE' }, baseOperacional: { id: 'base-2' }, membros: [] }
];

describe('Nova solicitação (drawers)', () => {
  let almox: Record<string, ReturnType<typeof vi.fn>>;
  let tecnica: Record<string, ReturnType<typeof vi.fn>>;
  const notificacoes = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    Object.values(notificacoes).forEach((f) => f.mockClear());
    almox = {
      listarEstoquesAtivos: vi.fn(() => of({ content: estoques })),
      listarSaldos: vi.fn(() => of({ content: [{ quantidade: 54, condicao: 'NOVO' }, { quantidade: 9, condicao: 'SUCATA' }] })),
      buscarMaterialPorId: vi.fn((id: string) => of(id === 'mat-1' ? cabo : medidor)),
      criarSolicitacaoDireta: vi.fn(() => of({ id: 'sol-1' }))
    };
    tecnica = {
      criar: vi.fn(() => of({ solicitacoesCriadas: [{ id: 's-221' }, { id: 's-921' }] })),
      obterProjecaoObra: vi.fn(() => of({ ocorrencias: [{ id: 'a', codigo: '88412' }, { id: 'b', codigo: 'OC-88412' }, { id: 'c', codigo: 'OC-88415' }] }))
    };
    await TestBed.configureTestingModule({
      imports: [NovaSolicitacaoComercialDrawerComponent, NovaSolicitacaoTecnicaDrawerComponent, NovaSolicitacaoMateriaisComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
      providers: [
        { provide: AlmoxarifadoService, useValue: almox },
        { provide: SolicitacaoMaterialTecnicaService, useValue: tecnica },
        { provide: RhService, useValue: { listarEquipes: vi.fn(() => of({ content: equipes })) } },
        {
          provide: ObrasService,
          useValue: {
            listarObras: vi.fn(() => of({ content: [{ id: 'ob-1', numero: '3310', titulo: 'CORRETIVA REDE BT', controleExecucao: 'OC' }] })),
            buscarObraPorId: vi.fn(() => of({ id: 'ob-1', numero: '3310', titulo: 'CORRETIVA REDE BT', controleExecucao: 'OC', tipoObraNome: 'CORRETIVA', baseOperacionalId: 'base-1' }))
          }
        },
        { provide: LookupStore, useValue: { searchMaterials: vi.fn(() => of({ items: [], nextCursor: null })), searchCollaborators: vi.fn(() => of({ items: [], nextCursor: null })) } },
        { provide: NotificationService, useValue: notificacoes },
        { provide: ConfirmationService, useValue: { confirm: vi.fn() } },
        { provide: MessageService, useValue: { add: vi.fn() } }
      ]
    }).compileComponents();
  });

  describe('materiais', () => {
    it('mostra o saldo novo da origem e avisa quando o pedido passa dele, somando o mesmo material', () => {
      const f = TestBed.createComponent(NovaSolicitacaoMateriaisComponent);
      f.componentRef.setInput('idEstoque', 'alm-1');
      f.detectChanges();
      const c = f.componentInstance as any;
      c.escolher('mat-1');
      expect(almox['listarSaldos']).toHaveBeenCalledWith({ idEstoque: 'alm-1', idMaterial: 'mat-1', size: 100 });
      expect(c.saldo('mat-1')).toBe(54);

      c.quantidade.set(40);
      c.incluir();
      c.escolher('mat-1');
      c.quantidade.set(20);
      c.incluir();
      expect(c.linhas()).toHaveLength(1);
      expect(c.linhas()[0].quantidade).toBe(60);
      expect(c.falta(c.linhas()[0])).toBe(true);
      expect(notificacoes.info).toHaveBeenCalled();
    });

    it('na técnica cada material leva o tipo escolhido (221 ou 921)', () => {
      const f = TestBed.createComponent(NovaSolicitacaoMateriaisComponent);
      f.componentRef.setInput('comTipo', true);
      f.detectChanges();
      const c = f.componentInstance as any;
      c.escolher('mat-1');
      c.quantidade.set(5);
      c.incluir();
      c.tipo.set('ADICAO_CONCRETO');
      c.escolher('mat-1');
      c.quantidade.set(3);
      c.incluir();
      expect(c.linhas().map((l: any) => l.tipo)).toEqual(['ADICAO_COMUM', 'ADICAO_CONCRETO']);
    });
  });

  describe('comercial', () => {
    const abrir = () => {
      const f = TestBed.createComponent(NovaSolicitacaoComercialDrawerComponent);
      f.componentInstance.visible.set(true);
      f.detectChanges();
      return f.componentInstance as any;
    };

    it('a equipe define o destino e sugere o almoxarifado da base dela', () => {
      const c = abrir();
      c.trocarEquipe('eq-1');
      expect(c.destino()?.nomeIdentificador).toBe('FAF1234123');
      expect(c.idOrigem()).toBe('alm-1');
      expect(c.opcoesMembro()).toEqual([{ label: 'JOAO (responsável)', value: 'col-1' }]);
    });

    it('equipe sem estoque de campo é barrada com explicação', () => {
      const c = abrir();
      c.trocarEquipe('eq-2');
      expect(c.erroEquipe()).toContain('não tem estoque de campo');
      c.criar();
      expect(almox['criarSolicitacaoDireta']).not.toHaveBeenCalled();
    });

    it('envia o pedido completo e fecha', () => {
      const c = abrir();
      const criada = vi.fn();
      c.criada.subscribe(criada);
      c.trocarEquipe('eq-1');
      c.idColaborador.set('col-1');
      c.dataPrevista.set(new Date(2026, 11, 20));
      c.linhas.set([{ chave: 1, material: cabo, quantidade: 10 }]);
      c.criar();
      expect(almox['criarSolicitacaoDireta']).toHaveBeenCalledWith({
        idEstoqueOrigem: 'alm-1',
        idEquipe: 'eq-1',
        dataPrevista: '2026-12-20',
        idColaboradorSaque: 'col-1',
        saqueForaEquipe: false,
        itens: [{ idMaterial: 'mat-1', quantidade: 10 }]
      });
      expect(c.visible()).toBe(false);
      expect(criada).toHaveBeenCalled();
    });
  });

  describe('técnica', () => {
    const abrir = (idObra: string | null = null) => {
      const f = TestBed.createComponent(NovaSolicitacaoTecnicaDrawerComponent);
      f.componentRef.setInput('idObraInicial', idObra);
      f.componentInstance.visible.set(true);
      f.detectChanges();
      return f.componentInstance as any;
    };

    it('obra com OC exige o número, sugere o almoxarifado da base e junta OCs repetidas', () => {
      const c = abrir('ob-1');
      expect(c.exigeOcorrencia()).toBe(true);
      expect(c.idAlmoxarifado()).toBe('alm-1');
      expect(c.sugerido()).toBe(true);
      expect(c.ocorrenciasDaObra()).toEqual(['OC-88412', 'OC-88415']);
      c.linhas.set([{ chave: 1, material: cabo, quantidade: 2, tipo: 'ADICAO_COMUM' }]);
      c.criar();
      expect(tecnica['criar']).not.toHaveBeenCalled();
      expect(notificacoes.warning).toHaveBeenCalledWith('Informe o número da OC.');
    });

    it('221 e 921 juntos avisam que viram duas solicitações e enviam data e equipe opcionais', () => {
      const c = abrir('ob-1');
      const criada = vi.fn();
      c.criada.subscribe(criada);
      c.ocorrencia.set(' oc-88415 ');
      c.linhas.set([
        { chave: 1, material: cabo, quantidade: 2, tipo: 'ADICAO_COMUM' },
        { chave: 2, material: medidor, quantidade: 1, tipo: 'ADICAO_CONCRETO' }
      ]);
      expect(c.tiposJuntos()).toBe(true);
      c.criar();
      const [pedido, chave] = tecnica['criar'].mock.lastCall!;
      expect(pedido).toMatchObject({
        idObra: 'ob-1',
        idAlmoxarifadoAtendimento: 'alm-1',
        idEquipe: null,
        dataPrevista: null,
        ocorrencia: 'OC-88415',
        itens: [
          { idMaterial: 'mat-1', tipoMovimentacao: 'ADICAO_COMUM', quantidade: 2 },
          { idMaterial: 'mat-2', tipoMovimentacao: 'ADICAO_CONCRETO', quantidade: 1 }
        ]
      });
      expect(chave).toEqual(expect.any(String));
      expect(criada).toHaveBeenCalledWith(['s-221', 's-921']);
    });

    it('queda de conexão: tentar de novo reusa a mesma chave para não duplicar', () => {
      const c = abrir('ob-1');
      c.ocorrencia.set('OC-1');
      c.linhas.set([{ chave: 1, material: cabo, quantidade: 2, tipo: 'ADICAO_COMUM' }]);
      tecnica['criar'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      c.criar();
      expect(c.pendente()).toBe(true);
      const primeira = tecnica['criar'].mock.calls[0][1];
      c.criar();
      expect(tecnica['criar'].mock.calls[1][1]).toBe(primeira);
      expect(c.pendente()).toBe(false);
    });
  });

  it('prazo: menos de 48 horas fica fora do prazo', () => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const semana = new Date();
    semana.setDate(semana.getDate() + 7);
    expect(foraDoPrazo(amanha)).toBe(true);
    expect(foraDoPrazo(semana)).toBe(false);
    expect(foraDoPrazo(null)).toBe(false);
  });
});
