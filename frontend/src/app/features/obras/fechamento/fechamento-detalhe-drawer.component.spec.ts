import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@ces/ui';
import { ConfirmationService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FechamentoDetalhe, MovimentacaoFechamento } from '../../../core/models/fechamento-obra.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { FechamentoDetalheDrawerComponent } from './fechamento-detalhe-drawer.component';
import { historicoFechamentoLegivel } from './fechamento-historico.util';
import { FechamentoOperacoesHistoricoComponent } from './fechamento-operacoes-historico.component';
import { movimentacoesRecentes, rotaFechamento, situacaoItem, ultimaMovimentacao } from './fechamento-ui';

const ACOES = { editar: false, registrarReserva: false, alterarReserva: false, pendencias: true, cancelar: false, movimentar: false };

function solicitacao(parcial: Partial<FechamentoDetalhe> = {}): FechamentoDetalhe {
  return {
    id: 'abcdef12-0000',
    versao: 3,
    tipo: '221',
    obra: { id: 'o1', numero: '3101', titulo: 'Extensão' },
    almoxarifadoAtendimento: { id: 'a1', nome: 'ALMOXARIFADO_JUAZEIRO' },
    estoqueObra: { id: 'e1', nome: 'OBRA 3101' },
    situacao: 'AGUARDANDO_RESERVA',
    situacaoObra: 'PENDENTE',
    prazoReserva: { limite: '2026-11-10T12:00:00Z', situacao: 'NO_PRAZO' },
    prazoMovimentacao: null,
    prazoVigente: { limite: '2026-11-10T12:00:00Z', situacao: 'NO_PRAZO' },
    reserva: null,
    solicitante: { id: 'u1', nome: 'Ana' },
    encarregado: null,
    supervisor: null,
    coordenador: null,
    observacao: null,
    pendenciaGeral: null,
    possuiPendencia: false,
    criadaEm: '2026-11-06T12:00:00Z',
    movimentacaoConcluidaEm: null,
    canceladaEm: null,
    motivoCancelamento: null,
    itens: [
      { id: 'i1', idMaterial: 'm1', codigoMaterial: 'CABO', descricaoMaterial: 'Cabo', unidade: 'MT', quantidade: 10, quantidadeMovimentada: 4, quantidadePendente: 6, pendencia: null, removivel: false }
    ],
    movimentacoes: [],
    acoes: ACOES,
    ...parcial
  };
}

function movimentacao(id: string, realizadaEm: string, tipo: MovimentacaoFechamento['tipo'] = 'MOVIMENTACAO'): MovimentacaoFechamento {
  return { id, tipo, efeitoEstoque: 'VIRTUAL', idMovimentacaoOriginal: null, realizadaEm, operador: { id: 'u2', nome: `Operador ${id}` }, motivo: null, itens: [], podeEstornar: false };
}

type Tela = {
  aba(): string;
  abas(): { value: string; label: string }[];
  fluxo(): { rotulo: string; estado: string; quando?: string | null }[];
  percentual(): number;
  rota(): { de: string; para: string };
  reservaNumero: { set(v: string): void };
  salvarReserva(): void;
  tentouReserva(): boolean;
  erro(): string | null;
};

describe('FechamentoDetalheDrawerComponent', () => {
  let service: Record<string, ReturnType<typeof vi.fn>>;

  async function abrir(d: FechamentoDetalhe, aba: 'itens' | 'reserva' | 'movimentar' = 'itens') {
    service['detalhe'].mockReturnValue(of(d));
    const fixture = TestBed.createComponent(FechamentoDetalheDrawerComponent);
    fixture.componentRef.setInput('solicitacaoId', d.id);
    fixture.componentRef.setInput('abaInicial', aba);
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, tela: fixture.componentInstance as unknown as Tela };
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    service = { detalhe: vi.fn(), registrarReserva: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ConfirmationService,
        provideNoopAnimations(),
        provideRouter([]),
        { provide: FechamentoObraService, useValue: service },
        { provide: AlmoxarifadoService, useValue: { listarMotivosPendencia: vi.fn(() => of([])) } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }
      ]
    });
  });

  it('mostra só as abas que o usuário pode operar', async () => {
    const { tela } = await abrir(solicitacao());
    expect(tela.abas().map((a) => a.value)).toEqual(['itens', 'movimentacoes']);
  });

  it('abre direto na aba da ação pedida pelo quadro ou pela lista', async () => {
    const { tela } = await abrir(solicitacao({ acoes: { ...ACOES, registrarReserva: true } }), 'reserva');
    expect(tela.aba()).toBe('reserva');
    expect(tela.abas().find((a) => a.value === 'reserva')?.label).toBe('Registrar reserva');
  });

  it('volta para os materiais quando a aba pedida não vale para a solicitação', async () => {
    const { tela } = await abrir(solicitacao(), 'movimentar');
    expect(tela.aba()).toBe('itens');
  });

  it('não salva reserva com número inválido', async () => {
    const { tela } = await abrir(solicitacao({ acoes: { ...ACOES, registrarReserva: true } }), 'reserva');
    tela.reservaNumero.set('12A');
    tela.salvarReserva();
    expect(tela.tentouReserva()).toBe(true);
    expect(service['registrarReserva']).not.toHaveBeenCalled();
  });

  it('salva a reserva com a versão atual e volta para os materiais', async () => {
    const d = solicitacao({ acoes: { ...ACOES, registrarReserva: true } });
    service['registrarReserva'].mockReturnValue(of(solicitacao({ situacao: 'AGUARDANDO_MOVIMENTACAO' })));
    const { tela } = await abrir(d, 'reserva');
    tela.reservaNumero.set('4500123456');
    tela.salvarReserva();
    expect(service['registrarReserva']).toHaveBeenCalledWith(d.id, 3, '4500123456', null);
    expect(tela.aba()).toBe('itens');
  });

  it('marca a etapa atual do fluxo e usa a movimentação mais recente', async () => {
    const { tela } = await abrir(
      solicitacao({
        situacao: 'MOVIMENTADA_PARCIALMENTE',
        reserva: { numero: '1', dataCriacao: '2026-11-06', registradaEm: '2026-11-06T12:00:00Z' },
        movimentacoes: [movimentacao('novo', '2026-11-06T20:00:00Z'), movimentacao('antigo', '2026-11-06T13:00:00Z')]
      })
    );
    const etapa = tela.fluxo()[2];
    expect(etapa).toMatchObject({ rotulo: 'Movimentada em parte', estado: 'atual', quando: '2026-11-06T20:00:00Z' });
    expect(tela.percentual()).toBe(40);
  });

  it('interrompe o fluxo na solicitação cancelada', async () => {
    const { tela } = await abrir(solicitacao({ situacao: 'CANCELADA', canceladaEm: '2026-11-06T13:00:00Z', motivoCancelamento: 'Erro' }));
    expect(tela.fluxo().map((e) => e.estado)).toEqual(['feito', 'futuro', 'interrompido']);
  });

  it('mostra a falha ao carregar', async () => {
    service['detalhe'].mockReturnValue(throwError(() => new Error('falhou')));
    const fixture = TestBed.createComponent(FechamentoDetalheDrawerComponent);
    fixture.componentRef.setInput('solicitacaoId', 'x');
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.componentInstance as unknown as Tela).erro()).toBeTruthy();
  });
});

describe('FechamentoOperacoesHistoricoComponent', () => {
  async function abrir(entrada: Record<string, unknown>) {
    const fixture = TestBed.createComponent(FechamentoOperacoesHistoricoComponent);
    for (const [nome, valor] of Object.entries(entrada)) fixture.componentRef.setInput(nome, valor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const lista = [
    { ...movimentacao('antiga', '2026-11-06T13:00:00Z'), podeEstornar: true },
    { ...movimentacao('nova', '2026-11-06T20:00:00Z'), podeEstornar: true }
  ];

  it('no painel lateral já abre com a mais recente no topo e com as ações', async () => {
    const el = await abrir({ movimentacoes: lista, recolhivel: false, acoes: true });
    expect(el.textContent).not.toContain('Histórico de Operações');
    const cartoes = [...el.querySelectorAll('[aria-expanded]')];
    expect(cartoes.map((c) => c.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(cartoes[0].textContent).toContain('#nova');
    expect(el.textContent).toContain('Estornar');
  });

  it('no relatório fica recolhido e traz as ações que a movimentação permite', async () => {
    const el = await abrir({ movimentacoes: lista, acoes: true });
    expect(el.textContent).toContain('Histórico de Operações');
    expect(el.textContent).toContain('2 movimentações realizadas');
    expect(el.textContent).toContain('Estornar');
    expect(el.textContent).not.toContain('Trocar para');
  });

  it('sem permissão da movimentação, não mostra as ações', async () => {
    const el = await abrir({ movimentacoes: [movimentacao('fechada', '2026-11-06T13:00:00Z')], acoes: true, recolhivel: false });
    expect(el.textContent).not.toContain('Estornar');
    expect(el.textContent).not.toContain('Trocar para');
  });

  it('avisa quando não há movimentação', async () => {
    const el = await abrir({ movimentacoes: [], recolhivel: false, textoVazio: 'Nada ainda' });
    expect(el.textContent).toContain('Nada ainda');
  });
});

describe('historicoFechamentoLegivel', () => {
  const material = { id: 'item-1', material: { id: 'm1', snapshot: 'CABO-11 - CABO DE COBRE' }, quantidade: '10.000', tipoTecnico: 'ADICAO_COMUM' };
  const evento = (parcial: Record<string, unknown>) =>
    ({ id: 'e1', sequencia: 2, tipo: 'MOVIMENTACAO_CONFIRMADA', ocorridoEm: '2026-11-06T12:00:00Z', autor: { id: 'u1', nome: 'Ana' }, ...parcial }) as never;
  const legivel = (e: never) => historicoFechamentoLegivel({ eventos: [e] } as never).eventos[0];

  it('liga a alteração ao item pelo código do material e some com a situação que não mudou', () => {
    const r = legivel(evento({ payload: { snapshots: { itens: [material] }, alteracoes: [
      { caminho: 'itens[CABO-11].quantidadeMovimentada', valorAnterior: '4.000', valorNovo: '6.000' },
      { caminho: 'situacao', valorAnterior: 'MOVIMENTADA', valorNovo: 'MOVIMENTADA' }
    ] } }));
    expect(r.payload?.alteracoes?.map((a) => a.caminho)).toEqual(['itens[item-1].quantidadeMovimentada']);
  });

  it('traduz situação e efeito no estoque', () => {
    const r = legivel(evento({ payload: { alteracoes: [
      { caminho: 'situacao', valorAnterior: 'AGUARDANDO_MOVIMENTACAO', valorNovo: 'MOVIMENTADA' },
      { caminho: 'movimentacoes[op-1].efeitoEstoque', valorAnterior: 'FISICO', valorNovo: 'VIRTUAL' }
    ] } }));
    expect(r.payload?.alteracoes).toEqual([
      { caminho: 'situacao', valorAnterior: 'Aguardando movimentação', valorNovo: 'Movimentada' },
      { caminho: 'efeitoEstoque', valorAnterior: 'Físico', valorNovo: 'Virtual' }
    ]);
  });

  it('não mostra status, login nem equipe nos detalhes da criação', () => {
    const r = legivel(evento({ payload: { snapshots: { status: 'APROVADO', usuario: { snapshot: 'spladmin' }, equipe: null, almoxarifado: { snapshot: 'ALMOX' }, itens: [material] } } }));
    expect(Object.keys(r.payload?.snapshots as object).sort()).toEqual(['almoxarifado', 'itens']);
  });

  it('mostra quem não tem colaborador sem cair no login', () => {
    expect(legivel(evento({ autor: { id: 'u1', nome: null }, payload: {} })).autor).toEqual({ id: '', nome: 'Sem colaborador vinculado' });
    expect(legivel(evento({ autor: { id: 'u1', nome: 'Ana' }, payload: {} })).autor).toEqual({ id: '', nome: 'Ana' });
  });
});

describe('fechamento-ui', () => {
  it('ordena as movimentações pela data, qualquer que seja a ordem recebida', () => {
    const lista = [movimentacao('b', '2026-11-06T13:00:00Z'), movimentacao('c', '2026-11-06T20:00:00Z'), movimentacao('a', '2026-11-06T10:00:00Z')];
    expect(movimentacoesRecentes(lista).map((m) => m.id)).toEqual(['c', 'b', 'a']);
  });

  it('ignora o estorno ao buscar a última movimentação', () => {
    const lista = [movimentacao('estorno', '2026-11-06T20:00:00Z', 'ESTORNO'), movimentacao('mov', '2026-11-06T13:00:00Z')];
    expect(ultimaMovimentacao(lista)?.id).toBe('mov');
  });

  it('inverte a rota na devolução', () => {
    expect(rotaFechamento(solicitacao(), 'Almox')).toEqual({ de: 'Almox', para: 'OBRA 3101' });
    expect(rotaFechamento(solicitacao({ tipo: '222' }), 'Almox')).toEqual({ de: 'OBRA 3101', para: 'Almox' });
  });

  it('dá prioridade à pendência enquanto falta movimentar', () => {
    const item = solicitacao().itens[0];
    expect(situacaoItem(item).label).toBe('Em parte');
    expect(situacaoItem({ ...item, pendencia: { idMotivo: 'p', motivo: 'Falta nota', justificativa: null } }).label).toBe('Falta nota');
    expect(situacaoItem({ ...item, quantidadeMovimentada: 10, quantidadePendente: 0 }).label).toBe('Movimentado');
    expect(situacaoItem({ ...item, quantidadeMovimentada: 0 }).label).toBe('A movimentar');
  });
});
