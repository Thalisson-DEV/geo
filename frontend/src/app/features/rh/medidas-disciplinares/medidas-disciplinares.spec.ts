import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../core/lookup';
import {
  MedidaDisciplinar,
  MotivoMedidaDisciplinar,
  ReincidenciaMedida,
  TipoMedidaDisciplinar,
  diasEntre,
  situacaoMedida
} from '../../../core/models/rh-medida-disciplinar.models';
import { AuthService } from '../../../core/services/auth.service';
import { RhMedidaDisciplinarService } from '../../../core/services/rh-medida-disciplinar.service';
import { abrirListagem, paginaTeste } from '../../../shared/listagem/listagem-teste';
import { MedidaDisciplinarDrawerComponent } from './medida-disciplinar-drawer.component';
import { MedidasDisciplinaresComponent } from './medidas-disciplinares.component';

registerLocaleData(localePt, 'pt-BR');

// Acesso aos membros protegidos que o template usa.
type Tela = Record<string, any>;

const VERBAL: TipoMedidaDisciplinar = { id: 't2', nome: 'Advertência verbal', gravidade: 2, exigePeriodo: false, ativo: true };
const ESCRITA: TipoMedidaDisciplinar = { id: 't3', nome: 'Advertência escrita', gravidade: 3, exigePeriodo: false, ativo: true };
const SUSPENSAO: TipoMedidaDisciplinar = { id: 't4', nome: 'Suspensão', gravidade: 4, exigePeriodo: true, ativo: true };
const TRANSITO: MotivoMedidaDisciplinar = { id: 'm1', nome: 'Trânsito', ativo: true };

const MEDIDA: MedidaDisciplinar = {
  id: 'md1', idColaborador: 'c1', colaboradorNome: 'CARLOS SOUZA', colaboradorFuncao: 'ELETRICISTA', idBaseOperacional: 'b1', baseNome: 'JUAZEIRO',
  idTipo: 't3', tipoNome: 'Advertência escrita', gravidade: 3, exigePeriodo: false, idMotivo: 'm1', motivoNome: 'Trânsito',
  dataFato: '2026-10-10', dataAplicacao: '2026-10-15', descricao: 'Excesso de velocidade.', diasSuspensao: null, inicioSuspensao: null, fimSuspensao: null,
  situacao: 'APLICADA', situacaoRotulo: 'Aplicada', aplicadaPorNome: 'ANA RH', aplicadaEm: '2026-10-15T10:00:00-03:00',
  origem: 'MANUAL', origemRotulo: 'Manual', idOrigem: null, idExterno: null,
  canceladaEm: null, justificativaCancelamento: null, diasDesdeOFato: 5, foraDaImediatidade: false, quantidadeAnexos: 0,
  anexos: [], historico: [], dataCriacao: '2026-10-11T10:00:00-03:00'
};

const SEM_REINCIDENCIA: ReincidenciaMedida = { janelaMeses: 12, diasImediatidade: 30, anteriores: [], gravidadeUltima: null, idTipoSugerido: null, tipoSugeridoNome: null };

function servicoMedidas(extra: Record<string, unknown> = {}) {
  return {
    listar: vi.fn(() => paginaTeste([MEDIDA])),
    buscar: vi.fn(() => of(MEDIDA)),
    tipos: vi.fn(() => of([VERBAL, ESCRITA, SUSPENSAO])),
    motivos: vi.fn(() => of([TRANSITO])),
    parametros: vi.fn(() => of({ janelaReincidenciaMeses: 12, diasImediatidade: 30 })),
    reincidencia: vi.fn((..._args: unknown[]) => of(SEM_REINCIDENCIA)),
    salvar: vi.fn(() => of(MEDIDA)),
    anexar: vi.fn((..._args: unknown[]) => of({ ...MEDIDA, quantidadeAnexos: 1 })),
    ...extra
  };
}

const lookups = { operationalBases: signal([{ value: 'b1', label: 'JUAZEIRO' }]), loadBootstrap: () => of({}), searchCollaborators: vi.fn(() => of({ items: [] })) };
const auth = (permissoes: string[]) => ({ provide: AuthService, useValue: { currentUser: signal({ permissoes }) } });
const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');
const isoDiasAtras = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('situacaoMedida', () => {
  it('diz em que pé a medida está, com ícone além do tom', () => {
    expect(situacaoMedida({ situacao: 'APLICADA' })).toEqual({ rotulo: 'Aplicada', tom: 'success', icone: 'pi-check-circle' });
    expect(situacaoMedida({ situacao: 'CANCELADA' }).tom).toBe('neutral');
  });

  it('conta os dias corridos entre duas datas', () => {
    expect(diasEntre('2026-10-01', '2026-10-31')).toBe(30);
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2);
  });
});

describe('MedidasDisciplinaresComponent', () => {
  let servico: ReturnType<typeof servicoMedidas>;
  const abrir = (url: string, permissoes: string[]) =>
    abrirListagem(MedidasDisciplinaresComponent, 'lista', url, [
      { provide: RhMedidaDisciplinarService, useValue: servico },
      { provide: LookupStore, useValue: lookups },
      auth(permissoes)
    ]);

  beforeEach(() => {
    TestBed.resetTestingModule();
    servico = servicoMedidas();
  });
  afterEach(() => localStorage.clear());

  it('abre nos dados, do fato mais recente, com a situação e o colaborador', async () => {
    const { el } = await abrir('/lista', ['rh:medida-disciplinar:read']);

    expect(servico.listar).toHaveBeenCalledWith(expect.objectContaining({ busca: null, idColaborador: null }),
      expect.objectContaining({ page: 0, sort: ['dataFato,desc'] }));
    expect(el.textContent).toContain('CARLOS SOUZA');
    expect(el.textContent).toContain('Aplicada');
    expect(el.textContent).not.toContain('Lançar medida');
  });

  it('vindo do colaborador, filtra só as medidas dele', async () => {
    await abrir('/lista?colaborador=c1', ['rh:medida-disciplinar:read']);

    expect(servico.listar).toHaveBeenLastCalledWith(expect.objectContaining({ idColaborador: 'c1' }), expect.anything());
  });

  it('aberta pela multa da frota, guarda a origem e abre o formulário novo', async () => {
    const { componente } = await abrir('/lista?origem=FROTA_MULTA&origemId=multa31', ['rh:medida-disciplinar:read', 'rh:medida-disciplinar:write']);
    const tela = componente as unknown as Tela;

    expect(tela['drawerAberto']()).toBe(true);
    expect(tela['emEdicao']()).toBeNull();
    expect(tela['origem']()).toEqual({ tipo: 'FROTA_MULTA', id: 'multa31' });
    // A porta de preenchimento da frota chega com as multas (Fase 5): por ora, o formulário avisa e abre vazio.
    expect(tela['preenchimentoIndisponivel']()).toBe(true);
  });

  it('sem permissão de escrita, ignora a origem', async () => {
    const { componente } = await abrir('/lista?origem=FROTA_MULTA&origemId=multa31', ['rh:medida-disciplinar:read']);

    expect((componente as unknown as Tela)['drawerAberto']()).toBe(false);
  });
});

describe('MedidaDisciplinarDrawerComponent', () => {
  let servico: ReturnType<typeof servicoMedidas>;

  function montar(entradas: Record<string, unknown>) {
    TestBed.configureTestingModule({
      imports: [MedidaDisciplinarDrawerComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        MessageService,
        ConfirmationService,
        { provide: RhMedidaDisciplinarService, useValue: servico },
        { provide: LookupStore, useValue: lookups }
      ]
    });
    const fixture = TestBed.createComponent(MedidaDisciplinarDrawerComponent);
    fixture.componentRef.setInput('tipos', [VERBAL, ESCRITA, SUSPENSAO]);
    fixture.componentRef.setInput('motivos', [TRANSITO]);
    fixture.componentRef.setInput('podeEditar', true);
    for (const [nome, valor] of Object.entries(entradas)) fixture.componentRef.setInput(nome, valor);
    fixture.componentInstance.visivel.set(true);
    fixture.detectChanges();
    return { fixture, tela: fixture.componentInstance as unknown as Tela };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    servico = servicoMedidas();
  });
  afterEach(() => TestBed.resetTestingModule());

  /** Preenche o mínimo de um lançamento válido. */
  function preencher(tela: Tela) {
    tela['idMotivo'].set('m1');
    tela['idTipo'].set('t3');
    tela['dataFato'].set(new Date());
    tela['descricao'].set('Multa por excesso de velocidade.');
  }

  it('lança já aplicada, com a aplicação hoje por padrão, sem ciência nem termo', () => {
    const { fixture, tela } = montar({ colaborador: { id: 'c1', nome: 'CARLOS SOUZA' } });
    preencher(tela);
    tela['dataAplicacao'].set(null);
    tela['salvar']();
    fixture.detectChanges();

    expect(servico.salvar).not.toHaveBeenCalled();
    expect(tela['erro']('dataAplicacao')).toBe('Informe quando a medida foi aplicada.');
    tela['dataAplicacao'].set(new Date());
    tela['salvar']();

    expect(servico.salvar).toHaveBeenCalledWith(expect.not.objectContaining({ ciencia: expect.anything() }));
    expect(servico.salvar).toHaveBeenCalledWith(expect.objectContaining({ dataAplicacao: isoDiasAtras(0) }));
    expect(texto()).toContain('Lançar medida');
    expect(texto()).not.toContain('Ciência');
    expect(texto()).not.toContain('termo');
  });

  it('anexos são opcionais e, se houver, vão depois do lançamento', () => {
    const { tela } = montar({ colaborador: { id: 'c1', nome: 'CARLOS SOUZA' } });
    const documento = new File(['x'], 'advertencia-assinada.pdf', { type: 'application/pdf' });
    const foto = new File(['y'], 'foto.jpg', { type: 'image/jpeg' });
    preencher(tela);
    tela['incluirAnexo'](documento);
    tela['incluirAnexo'](foto);
    tela['salvar']();

    expect(servico.anexar).toHaveBeenCalledTimes(2);
    expect(servico.anexar).toHaveBeenNthCalledWith(1, 'md1', documento);
    expect(servico.anexar).toHaveBeenNthCalledWith(2, 'md1', foto);
    expect(tela['anexosPendentes']()).toEqual([]);
  });

  it('anexo que falha não desfaz o lançamento e avisa', () => {
    servico.anexar.mockReturnValue(throwError(() => new Error('rede')));
    const { tela } = montar({ colaborador: { id: 'c1', nome: 'CARLOS SOUZA' } });
    const salva = vi.fn();
    (tela as unknown as MedidaDisciplinarDrawerComponent).salva.subscribe(salva);
    preencher(tela);
    tela['incluirAnexo'](new File(['x'], 'termo.pdf', { type: 'application/pdf' }));
    tela['salvar']();

    expect(salva).toHaveBeenCalledWith(MEDIDA);
  });

  it('suspensão sem dias e início não é enviada e aponta os campos', () => {
    const { fixture, tela } = montar({ colaborador: { id: 'c1', nome: 'CARLOS SOUZA' } });
    tela['idMotivo'].set('m1');
    tela['idTipo'].set('t4');
    tela['dataFato'].set(new Date());
    tela['descricao'].set('Briga no canteiro.');
    tela['salvar']();
    fixture.detectChanges();

    expect(servico.salvar).not.toHaveBeenCalled();
    expect(tela['erro']('dias')).toBe('Informe os dias da suspensão.');
    expect(tela['erro']('inicio')).toBe('Informe o início da suspensão.');
  });

  it('segunda multa em 6 meses mostra a anterior e sugere advertência escrita', () => {
    servico.reincidencia.mockReturnValue(of({
      ...SEM_REINCIDENCIA,
      anteriores: [{ id: 'a1', tipoNome: 'Advertência verbal', gravidade: 2, dataFato: isoDiasAtras(180), dataAplicacao: isoDiasAtras(178), situacaoRotulo: 'Aplicada' }],
      gravidadeUltima: 2, idTipoSugerido: 't3', tipoSugeridoNome: 'Advertência escrita'
    }));
    const { fixture, tela } = montar({ colaborador: { id: 'c1', nome: 'CARLOS SOUZA' } });
    tela['idMotivo'].set('m1');
    tela['carregarReincidencia']();
    fixture.detectChanges();

    expect(servico.reincidencia).toHaveBeenLastCalledWith('c1', 'm1', null, undefined);
    expect(texto()).toContain('Reincidência: 1 medida pelo mesmo motivo em 12 meses');
    expect(texto()).toContain('Sugestão: Advertência escrita');
  });

  it('avisa da imediatidade quando a aplicação passa do prazo, sem bloquear', () => {
    const { fixture, tela } = montar({ colaborador: { id: 'c1', nome: 'CARLOS SOUZA' } });
    tela['dataFato'].set(new Date(Date.now() - 40 * 86_400_000));
    fixture.detectChanges();

    expect(tela['avisoImediatidade']()).toBeGreaterThan(30);
    expect(texto()).toContain('Aplicação longe do fato');
  });

  it('no lançamento pela multa, manda a origem junto', () => {
    const { tela } = montar({ colaborador: { id: 'c1', nome: 'CARLOS SOUZA' }, origem: { tipo: 'FROTA_MULTA', id: 'multa31' } });
    preencher(tela);
    tela['salvar']();

    expect(servico.salvar).toHaveBeenCalledWith(expect.objectContaining({ idColaborador: 'c1', origem: { tipo: 'FROTA_MULTA', id: 'multa31' } }));
  });

  it('medida lançada abre no resumo e é corrigida só pelo botão', () => {
    const { fixture, tela } = montar({ medida: MEDIDA });

    expect(tela['formulario']()).toBe(false);
    expect(texto()).toContain('Corrigir dados');
    tela['corrigir']();
    fixture.detectChanges();
    expect(tela['formulario']()).toBe(true);
    tela['descricao'].set('Excesso de velocidade na BR-324.');
    tela['salvar']();

    expect(servico.salvar).toHaveBeenCalledWith(expect.objectContaining({ dataAplicacao: '2026-10-15', origem: null }), 'md1');
    expect(tela['corrigindo']()).toBe(false);
  });

  it('cancelada, mantém os anexos para consulta, sem mexer neles', () => {
    const anexo = { id: 'an1', nome: 'advertencia-assinada.pdf', contentType: 'application/pdf', tamanhoBytes: 2048,
      sha256: 'a'.repeat(64), enviadoEm: '2026-10-16T10:00:00-03:00' };
    montar({ medida: { ...MEDIDA, situacao: 'CANCELADA', canceladaEm: '2026-10-20T10:00:00-03:00',
      justificativaCancelamento: 'Multa anulada.', anexos: [anexo], quantidadeAnexos: 1 } });

    expect(texto()).toContain('advertencia-assinada.pdf');
    expect(document.querySelector('[aria-label="Baixar advertencia-assinada.pdf"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Remover advertencia-assinada.pdf"]')).toBeNull();
    expect(document.querySelector('ces-file-input')).toBeNull();
  });
});
