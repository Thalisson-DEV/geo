import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { ContratoService } from '../../../core/services/contrato.service';
import { ExecucaoService } from '../../../core/services/execucao.service';
import { abrirListagem, chipsDoPainel, paginaTeste } from '../../../shared/listagem/listagem-teste';
import { RecorteDashboardService } from '../dashboards/recorte-dashboard.service';
import { ExecucaoListComponent } from './execucao-list.component';

const execucao = {
  id: 'e1',
  referenciaNota: '123456',
  idTurno: 't1',
  tipoServico: { id: 'ts-cs', codigo: 'CS', descricao: 'CORTE', ativo: true },
  equipe: { id: 'q1', codigo: 'EQ-01' },
  municipio: { id: 'm1', nome: 'JUAZEIRO' },
  dataLancamento: '2026-10-10T10:00:00',
  statusExecucao: 'CONCLUIDO',
  valorTotalFaturado: 850,
  acoes: [],
  materiais: []
};

describe('ExecucaoListComponent', () => {
  let servico: Record<string, ReturnType<typeof vi.fn>>;
  let materiais: ReturnType<typeof vi.fn>;
  const abrir = (url = '/lista') =>
    abrirListagem(ExecucaoListComponent, 'lista', url, [
      { provide: ExecucaoService, useValue: servico },
      { provide: ContratoService, useValue: { listarAcoesAtivas: () => paginaTeste([]) } },
      { provide: LookupStore, useValue: { searchMaterials: materiais } },
      {
        provide: RecorteDashboardService,
        useValue: {
          carregar: vi.fn(),
          carregando: signal(false),
          opcoesBases: signal([{ label: 'JUAZEIRO', value: 'b1' }, { label: 'SENHOR DO BONFIM', value: 'b2' }]),
          carregarEquipes: vi.fn(),
          carregandoEquipes: signal(false),
          opcoesEquipes: signal([{ label: 'EQ-01', value: 'q1' }])
        }
      }
    ]);

  beforeEach(() => {
    TestBed.resetTestingModule();
    servico = {
      listarExecucoes: vi.fn(() => paginaTeste([execucao])),
      listarTiposServico: vi.fn(() => paginaTeste([{ id: 'ts-cs', codigo: 'CS', descricao: 'CORTE', ativo: true }]))
    };
    materiais = vi.fn(() => of({ items: [{ value: 'mat1', label: 'CABO 16MM' }], nextCursor: null, hasMore: false }));
  });

  afterEach(() => localStorage.clear());

  it('abre nos últimos 30 dias, mais recentes primeiro', async () => {
    const { el } = await abrir();
    const filtro = servico['listarExecucoes'].mock.calls[0][0];
    const esperado = new Date();
    esperado.setDate(esperado.getDate() - 30);
    expect(new Date(filtro.dataLancamentoDe).toDateString()).toBe(esperado.toDateString());
    expect(filtro).toMatchObject({ sort: ['dataLancamento,desc'], page: 0, size: 25 });
    expect(chipsDoPainel(el)[0]).toMatch(/^Lançamento: a partir de /);
    expect(el.textContent).toContain('123456');
    expect(el.textContent).toContain('CS · CORTE');
  });

  it('vindo do turno (?idTurno=) mostra todas as notas dele, sem limite de data', async () => {
    const { el } = await abrir('/lista?idTurno=t1');
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ idTurno: 't1', dataLancamentoDe: undefined }));
    expect(chipsDoPainel(el)).toEqual(['Turno: notas do turno']);
  });

  it('o material escolhido vira filtro e chip com o nome', async () => {
    const { componente, el, harness } = await abrir('/lista?lancamento=~');
    const tela = componente as unknown as { materiais: { search(q: string): void }; escolherMaterial(id: string): void; lista: { apply(): void } };
    tela.materiais.search('cabo');
    await new Promise((r) => setTimeout(r, 400));
    tela.escolherMaterial('mat1');
    tela.lista.apply();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ idMaterial: 'mat1' }));
    expect(chipsDoPainel(el)).toContain('Material: CABO 16MM');
  });

  it('filtra pelo número de série e procura em todo o histórico', async () => {
    const { componente, el, harness } = await abrir();
    const tela = componente as unknown as { filtrarSerie(v: string): void; lista: { apply(): void } };
    tela.filtrarSerie(' 12345678 ');
    tela.lista.apply();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ numSerieMaterial: '12345678', dataLancamentoDe: undefined }));
    expect(chipsDoPainel(el)).toEqual(['Nº de série: 12345678', 'Lançamento: Todos']);
  });

  it('série vinda do link mantém a data escolhida pelo usuário', async () => {
    await abrir('/lista?serie=ABC123&lancamento=2026-01-01~');
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ numSerieMaterial: 'ABC123' }));
    expect(servico['listarExecucoes'].mock.lastCall![0].dataLancamentoDe).toBeDefined();
  });

  it('filtra por tipo de serviço, inclusive pelas notas sem tipo', async () => {
    const { el } = await abrir('/lista?tipo=ts-cs');
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ idTipoServico: 'ts-cs', semTipoServico: undefined }));
    expect(chipsDoPainel(el)).toContain('Tipo de serviço: CS · CORTE');

    TestBed.resetTestingModule();
    await abrir('/lista?tipo=sem-tipo');
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ idTipoServico: undefined, semTipoServico: true }));
  });

  it('filtra pelo tipo de lançamento e pelas avulsas sem número oficial', async () => {
    const { el } = await abrir('/lista?tipoNota=OCORRENCIA&semNumero=true');
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ tipoNota: 'OCORRENCIA', aguardandoNumeroOficial: true }));
    expect(chipsDoPainel(el)).toContain('Tipo de lançamento: Ocorrência');
    expect(chipsDoPainel(el)).toContain('Avulsas: sem número oficial');
  });

  it('filtra pelas bases operacionais escolhidas', async () => {
    const { el } = await abrir('/lista?base=b1,b2');
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(expect.objectContaining({ idBaseOperacional: ['b1', 'b2'] }));
    expect(chipsDoPainel(el)).toContain('Base: 2 bases');

    TestBed.resetTestingModule();
    await abrir();
    expect(servico['listarExecucoes'].mock.lastCall![0].idBaseOperacional).toBeUndefined();
  });

  it('marca a avulsa sem número oficial e oferece informar o número', async () => {
    servico['listarExecucoes'] = vi.fn(() =>
      paginaTeste([{ ...execucao, referenciaNota: 'AV-EQ01-261019-01', tipoNota: 'AVULSA', referenciaProvisoria: 'AV-EQ01-261019-01', aguardandoNumeroOficial: true }])
    );
    const { el } = await abrir();
    expect(el.textContent).toContain('Sem nº oficial');
    expect(el.querySelector('[aria-label="Informar número oficial da nota AV-EQ01-261019-01"]')).not.toBeNull();
  });

  it('exporta pelo drawer: abre no recorte da lista, conta e manda o formato escolhido sem mexer na tela', async () => {
    servico['exportarExecucoes'] = vi.fn(() => of(new HttpResponse<Blob>({ body: null })));
    const { el, componente } = await abrir('/lista?equipe=q1&lancamento=~');
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent!.includes('Exportar CSV'))).toBe(true);

    const tela = componente as unknown as {
      limiteExportacao: number;
      abrirExportacao(): void;
      mudar(chave: string, valor: unknown): void;
      expBusca: { set(v: string): void };
      exportarCsv(formato: 'resumo' | 'detalhado'): void;
      totalExportacao(): number | null;
      lista: { applied(): { alterada: boolean } };
    };
    expect(tela.limiteExportacao).toBe(30_000);
    tela.abrirExportacao();
    tela.mudar('alterada', true);
    tela.expBusca.set('poste 12');
    servico['listarExecucoes'].mockReturnValue(paginaTeste([execucao], 31_000));
    await new Promise((r) => setTimeout(r, 400));
    expect(servico['listarExecucoes']).toHaveBeenLastCalledWith(
      expect.objectContaining({ idEquipe: 'q1', alterada: true, buscaGlobal: 'poste 12', page: 0, size: 1 })
    );
    expect(tela.totalExportacao()).toBe(31_000);

    tela.exportarCsv('detalhado');
    const [formato, filtro] = servico['exportarExecucoes'].mock.lastCall!;
    expect(formato).toBe('detalhado');
    expect(filtro).toMatchObject({ idEquipe: 'q1', alterada: true, buscaGlobal: 'poste 12' });
    expect(filtro).not.toHaveProperty('page');
    expect(tela.lista.applied().alterada).toBe(false);
  });

  it('ver nota abre o detalhe em nova aba', async () => {
    const abrirAba = vi.fn();
    vi.stubGlobal('open', abrirAba);
    const { componente } = await abrir();
    (componente as unknown as { verNota(e: unknown): void }).verNota(execucao);
    expect(abrirAba).toHaveBeenCalledWith(TestBed.inject(Router).serializeUrl(TestBed.inject(Router).createUrlTree(['/execucao/comercial', 'e1'])), '_blank');
    vi.unstubAllGlobals();
  });
});
