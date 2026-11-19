import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SolicitacaoMaterialSummaryResponse } from '../../../core/models/solicitacao-material-tecnica.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { ObrasService } from '../../../core/services/obras.service';
import { RhService } from '../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
import { UsuarioLookupService } from '../../../core/services/usuario-lookup.service';
import { abrirListagem, chipsDoPainel, paginaTeste } from '../../../shared/listagem/listagem-teste';
import { SolicitacoesMaterialTecnicasComponent } from './solicitacoes-material-tecnicas.component';

const solicitacao = {
  id: 'abcdef12-0000-0000-0000-000000000000',
  idObra: 'obra-1',
  tipoObra: 'OBRA',
  tipo: 'ADICAO_COMUM',
  idEquipe: 'eq-1',
  dataSolicitacao: '2026-09-10T10:00:00Z',
  dataPrevista: '2026-09-20',
  statusSeparacao: 'PRONTO_PARA_SEPARACAO',
  status: 'APROVADO',
  numeroReserva: 'R-778',
  nomeAgenteReserva: 'Carlos',
  quantidadeItens: 3,
  atrasada: true
} as unknown as SolicitacaoMaterialSummaryResponse;

describe('SolicitacoesMaterialTecnicasComponent', () => {
  let listar: ReturnType<typeof vi.fn>;
  let online: ReturnType<typeof signal<boolean>>;
  const abrir = (url = '/lista', data: Record<string, unknown> = {}) =>
    abrirListagem(
      SolicitacoesMaterialTecnicasComponent,
      'lista',
      url,
      [
        { provide: SolicitacaoMaterialTecnicaService, useValue: { listar, obterKanban: vi.fn(() => of({ colunas: [] })) } },
        {
          provide: AlmoxarifadoService,
          useValue: { listarEstoquesAtivos: () => paginaTeste([{ id: 'alm-1', nomeIdentificador: 'ALMOX CENTRAL' }]), listarMateriais: () => paginaTeste([]) }
        },
        {
          provide: ObrasService,
          useValue: {
            listarObras: () => paginaTeste([
              { id: 'obra-1', numero: '1228694', titulo: 'REDE NOVA', ativo: true, processoNome: 'OBRAS' },
              { id: 'obra-2', numero: '9999999', titulo: 'COMERCIAL', ativo: true, processoNome: 'COMERCIAL' }
            ]),
            listarAgentesAtivos: () => of([])
          }
        },
        { provide: RhService, useValue: { listarEquipes: () => paginaTeste([{ id: 'eq-1', codigo: 'EQ-01' }]) } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'usuario-1', permissoes: ['estoque:solicitacao:create', 'estoque:solicitacao:import'] }) } },
        { provide: ConnectivityService, useValue: { isOnline: online } },
        { provide: UsuarioLookupService, useValue: { resolverNome: () => 'Usuário' } }
      ],
      data
    );
  const ultimaConsulta = () => listar.mock.lastCall![0];

  beforeEach(() => {
    TestBed.resetTestingModule();
    listar = vi.fn(() => paginaTeste([solicitacao]));
    online = signal(true);
  });

  afterEach(() => localStorage.clear());

  it('abre já nos dados do contexto técnico, mais recentes primeiro, com obra e etapas', async () => {
    const { el } = await abrir();
    // No GEO a devolução (222/922) é solicitação: a lista não restringe os tipos.
    expect(ultimaConsulta()).toMatchObject({
      contexto: 'TECNICO',
      page: 0,
      sort: 'dataSolicitacao,desc'
    });
    expect(ultimaConsulta()).not.toHaveProperty('tiposTecnicos');
    expect(el.textContent).toContain('Manual');
    expect(el.textContent).toContain('1228694 · REDE NOVA');
    expect(el.textContent).toContain('A separar');
    expect(el.textContent).toContain('Atrasada');
    expect(el.textContent).toContain('R-778');
    expect(el.textContent).toContain('#abcdef12');
  });

  it('filtros da URL viram a consulta e chips nomeados; nº de série não vai para a URL', async () => {
    const { el, componente } = await abrir('/lista?obra=obra-1&status=PENDENTE,APROVADO&periodo=2026-09-01~2026-09-30&ordem=saque,asc');
    expect(ultimaConsulta()).toMatchObject({
      idObra: 'obra-1',
      statuses: ['PENDENTE', 'APROVADO'],
      dataInicio: '2026-09-01',
      dataFim: '2026-09-30',
      sort: 'dataPrevistaRetirada,asc'
    });
    expect(chipsDoPainel(el)).toEqual(expect.arrayContaining(['Obra: 1228694 · REDE NOVA', 'Status: 2 selecionados']));
    const tela = componente as unknown as { lista: { set(k: string, v: unknown): void } };
    tela.lista.set('numSerie', 'SN-1');
    await new Promise((r) => setTimeout(r));
    expect(ultimaConsulta()).toMatchObject({ numSerie: 'SN-1' });
    expect(TestBed.inject(Router).url).not.toContain('SN-1');
  });

  it('só obras do processo OBRAS entram nas opções', async () => {
    const { componente } = await abrir();
    const tela = componente as unknown as { obraOptions(): { value: string }[] };
    expect(tela.obraOptions().map((o) => o.value)).toEqual(['obra-1']);
  });

  it('modo quadro mostra o quadro no lugar da tabela; trocar de visão navega entre as rotas', async () => {
    const { el, componente } = await abrir('/lista', { modo: 'kanban' });
    expect(el.querySelector('app-solicitacoes-tecnicas-quadro')).not.toBeNull();
    expect(el.querySelector('geo-data-table')).toBeNull();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (componente as unknown as { trocarVisao(v: string): void }).trocarVisao('tabela');
    expect(navegar).toHaveBeenCalledWith(['/almoxarifado/solicitacoes-tecnicas'], expect.anything());
  });

  it('sem conexão mostra o aviso; linha abre o detalhe no painel lateral', async () => {
    online.set(false);
    const { el, componente } = await abrir();
    expect(el.textContent).toContain('Sem conexão');
    const tela = componente as unknown as { painel(): { abrirDetalhe(s: unknown): void }; abrirDetalhe(s: unknown): void };
    const abrirPainel = vi.spyOn(tela.painel(), 'abrirDetalhe');
    tela.abrirDetalhe(solicitacao);
    expect(abrirPainel).toHaveBeenCalledWith(solicitacao);
  });

  it('Só as minhas filtra pelo usuário logado e entra nas contagens e na exportação', async () => {
    const { el, harness, componente } = await abrir();
    expect(ultimaConsulta().idRequisitante).toBeNull();
    const botao = Array.from(el.querySelectorAll<HTMLButtonElement>('.geo-quick-filter')).find((b) => b.textContent!.includes('Só as minhas'))!;
    botao.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    expect(ultimaConsulta().idRequisitante).toBe('usuario-1');
    expect(listar.mock.calls.filter(([p]) => p.size === 1).at(-1)![0].idRequisitante).toBe('usuario-1');
    const tela = componente as unknown as { filtrosExportacao(): { apenasMinhas: boolean } };
    expect(tela.filtrosExportacao().apenasMinhas).toBe(true);
  });

  it('Em aberto deixa de fora o saldo encerrado, na lista e na contagem; Parcial continua mostrando', async () => {
    await abrir('/lista?situacao=ABERTO');
    expect(ultimaConsulta()).toMatchObject({ statuses: ['PENDENTE', 'APROVADO', 'ENTREGUE_PARCIAL'], saldoAberto: true });
    const contagens = listar.mock.calls.map(([p]) => p).filter((p) => p.size === 1);
    expect(contagens.find((p) => p.statuses?.length === 3)).toMatchObject({ saldoAberto: true });
    expect(contagens.find((p) => p.statuses?.length === 1 && p.statuses[0] === 'ENTREGUE_PARCIAL')?.saldoAberto).toBeUndefined();
  });

  it('entrega à Bússola o recorte e as contagens da fila técnica', async () => {
    const { componente } = await abrir();
    const tela = componente as unknown as { contextoCopiloto(): { id: string; datasets?: string[] } };
    expect(tela.contextoCopiloto()).toMatchObject({ id: 'almoxarifado.solicitacoes-tecnicas', datasets: expect.arrayContaining(['solicitacoes']) });
  });
});
