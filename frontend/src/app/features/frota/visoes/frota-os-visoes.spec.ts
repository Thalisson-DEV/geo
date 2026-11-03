import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@ces/ui';
import { ConfirmationService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventoAgendaFrota, OrdemServico, SituacaoOrdemServico } from '../../../core/models/frota.models';
import { AuthService } from '../../../core/services/auth.service';
import { FrotaService } from '../../../core/services/frota.service';
import { OS_BASE, paginaDe } from '../shared/frota-teste';
import { FrotaOsCalendarioComponent } from './frota-os-calendario.component';
import { FrotaOsKanbanComponent } from './frota-os-kanban.component';

const DIA = 86_400_000;
const em = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

const os = (id: string, situacao: SituacaoOrdemServico, extra: Partial<OrdemServico> = {}): OrdemServico => ({
  ...OS_BASE,
  id,
  numero: Number(id.replace(/\D/g, '')) || 1,
  situacao,
  criticidade: 'MEDIA',
  atrasada: false,
  paradaEmCurso: false,
  situacaoAprovacao: null,
  agendadaPara: null,
  previsaoTermino: null,
  ...extra
} as OrdemServico);

type Quadro = {
  colunas(): { def: { id: string }; total: number; carregados: number; atrasadas: number; grupos: { id: string; total: number }[] }[];
  agrupar(v: string): void;
  acaoDeSoltar(c: string): { acao: string } | null;
  iniciarArraste(item: OrdemServico, de: string): void;
  aoSoltar(e: DragEvent, c: string): void;
  aoAgir(item: OrdemServico, acao: string): void;
  cancelar(item: OrdemServico, motivo: string): void;
  etapaAberta(): boolean;
  etapa(): string;
  conclusaoAberta(): boolean;
  cancelamentoAberto(): boolean;
};

const soltar = () => ({ preventDefault: () => undefined }) as unknown as DragEvent;

describe('Visões das OS', () => {
  let frota: Record<string, ReturnType<typeof vi.fn>>;
  let notificacoes: Record<string, ReturnType<typeof vi.fn>>;
  let permissoes: string[];
  let porSituacao: Record<string, { itens: OrdemServico[]; total?: number }>;

  function configurar() {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        ConfirmationService,
        { provide: FrotaService, useValue: frota },
        { provide: AuthService, useValue: { currentUser: () => ({ permissoes }) } },
        { provide: NotificationService, useValue: notificacoes }
      ]
    });
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    permissoes = ['frota:os:read', 'frota:os:write', 'frota:os:executar'];
    notificacoes = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
    porSituacao = {
      PENDENTE: {
        itens: [
          os('p1', 'PENDENTE', { criticidade: 'URGENTE' }),
          os('p2', 'PENDENTE', { situacaoAprovacao: 'EM_ORCAMENTO' }),
          os('p3', 'PENDENTE')
        ],
        total: 250
      },
      AGENDADA: { itens: [os('a4', 'AGENDADA', { agendadaPara: em(-1) }), os('a5', 'AGENDADA', { agendadaPara: em(3) })] },
      EM_ANDAMENTO: { itens: [os('e6', 'EM_ANDAMENTO', { atrasada: true, previsaoTermino: em(-1) })] },
      CONCLUIDA: { itens: [] }
    };
    frota = {
      listarOrdensServico: vi.fn((f: { situacoes: string[] }) => {
        const faixa = porSituacao[f.situacoes[0]];
        return paginaDe(faixa.itens, faixa.total ?? faixa.itens.length);
      }),
      detalharOrdemServico: vi.fn((id: string) => {
        const todas = Object.values(porSituacao).flatMap((f) => f.itens);
        return of({ ordem: todas.find((o) => o.id === id)! });
      }),
      cancelarOrdemServico: vi.fn(() => of({ ordem: os('p3', 'CANCELADA') })),
      agenda: vi.fn(() => of({ eventos: [], truncado: false }))
    };
  });

  afterEach(() => localStorage.clear());

  describe('quadro', () => {
    async function abrirQuadro() {
      configurar();
      const fixture = TestBed.createComponent(FrotaOsKanbanComponent);
      fixture.componentRef.setInput('filtros', { idsBase: ['b1'], situacoes: ['PENDENTE'] });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, quadro: fixture.componentInstance as unknown as Quadro };
    }

    it('consulta uma coluna por situação com o recorte da tela, sem a situação do filtro', async () => {
      await abrirQuadro();
      const chamadas = frota['listarOrdensServico'].mock.calls;
      expect(chamadas.map((c) => c[0].situacoes[0])).toEqual(['PENDENTE', 'AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA']);
      expect(chamadas.every((c) => c[0].idsBase[0] === 'b1')).toBe(true);
      expect(chamadas[3][0].concluidaDe).toBeTruthy();
      expect(chamadas[0][1]).toEqual({ page: 0, size: 200, sort: ['abertaEm,asc'] });
      expect(chamadas[3][1].size).toBe(50);
    });

    it('agrupa pela próxima ação e conta as atrasadas de cada coluna', async () => {
      const { quadro } = await abrirQuadro();
      const [aAgendar, agendadas, emExecucao] = quadro.colunas();
      expect(aAgendar.grupos.map((g) => g.id)).toEqual(['URGENTES', 'ORCAMENTO', 'DEMAIS']);
      expect(agendadas.grupos.map((g) => g.id)).toEqual(['PASSADA', 'SEMANA']);
      expect(agendadas.atrasadas).toBe(1);
      expect(emExecucao.grupos.map((g) => g.id)).toEqual(['ESTOURADO']);
      expect(emExecucao.atrasadas).toBe(1);
    });

    it('acima do limite mostra o total e leva para a tabela', async () => {
      const { el, quadro } = await abrirQuadro();
      const aAgendar = quadro.colunas()[0];
      expect(aAgendar.total).toBe(250);
      expect(aAgendar.carregados).toBe(3);
      expect(el.querySelector('#kb-os-col-A_AGENDAR .kb-mais')?.textContent).toContain('Ver todas as 250 na tabela');
    });

    it('agrupa por criticidade e guarda a escolha', async () => {
      const { quadro } = await abrirQuadro();
      quadro.agrupar('criticidade');
      expect(quadro.colunas()[0].grupos.map((g) => g.id)).toEqual(['URGENTE', 'MEDIA']);
      expect(localStorage.getItem('ces_kanban_frota_os_agrupamento')).toBe('criticidade');
    });

    it('soltar em Concluídas abre a conclusão, sem mudar a situação', async () => {
      const { quadro } = await abrirQuadro();
      const item = porSituacao['EM_ANDAMENTO'].itens[0];
      quadro.iniciarArraste(item, 'EM_EXECUCAO');
      expect(quadro.acaoDeSoltar('CONCLUIDAS')?.acao).toBe('CONCLUIR');
      expect(quadro.acaoDeSoltar('A_AGENDAR')).toBeNull();
      quadro.aoSoltar(soltar(), 'CONCLUIDAS');
      expect(frota['detalharOrdemServico']).toHaveBeenCalledWith('e6');
      expect(quadro.conclusaoAberta()).toBe(true);
    });

    it('soltar de A agendar em Agendadas abre o agendamento', async () => {
      const { quadro } = await abrirQuadro();
      quadro.iniciarArraste(porSituacao['PENDENTE'].itens[2], 'A_AGENDAR');
      quadro.aoSoltar(soltar(), 'AGENDADAS');
      expect(quadro.etapaAberta()).toBe(true);
      expect(quadro.etapa()).toBe('agendar');
    });

    it('quem só lê não arrasta e nenhuma coluna aceita o cartão', async () => {
      permissoes = ['frota:os:read'];
      const { el, quadro } = await abrirQuadro();
      expect(el.querySelector('[draggable="true"]')).toBeNull();
      quadro.iniciarArraste(porSituacao['PENDENTE'].itens[0], 'A_AGENDAR');
      expect(['AGENDADAS', 'EM_EXECUCAO', 'CONCLUIDAS'].map((c) => quadro.acaoDeSoltar(c))).toEqual([null, null, null]);
      expect(el.querySelector('ces-icon-button')).toBeNull();
    });

    it('cartão desatualizado não abre a etapa: avisa e recarrega', async () => {
      const { fixture, quadro } = await abrirQuadro();
      const item = porSituacao['PENDENTE'].itens[2];
      frota['detalharOrdemServico'].mockReturnValueOnce(of({ ordem: { ...item, situacao: 'AGENDADA' } }));
      const consultas = frota['listarOrdensServico'].mock.calls.length;
      quadro.aoAgir(item, 'AGENDAR');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(quadro.etapaAberta()).toBe(false);
      expect(notificacoes['warning']).toHaveBeenCalled();
      expect(frota['listarOrdensServico'].mock.calls.length).toBeGreaterThan(consultas);
    });

    it('cancela pelo cartão com motivo e tira a OS do quadro', async () => {
      const { quadro } = await abrirQuadro();
      const item = porSituacao['PENDENTE'].itens[2];
      quadro.aoAgir(item, 'CANCELAR');
      expect(quadro.cancelamentoAberto()).toBe(true);
      quadro.cancelar(item, 'Aberta em duplicidade');
      expect(frota['cancelarOrdemServico']).toHaveBeenCalledWith('p3', 'Aberta em duplicidade');
      expect(quadro.cancelamentoAberto()).toBe(false);
      expect(notificacoes['success']).toHaveBeenCalled();
    });

    it('conflito ao cancelar recarrega com aviso', async () => {
      const { quadro } = await abrirQuadro();
      frota['cancelarOrdemServico'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
      const item = porSituacao['PENDENTE'].itens[2];
      quadro.aoAgir(item, 'CANCELAR');
      quadro.cancelar(item, 'Aberta em duplicidade');
      expect(notificacoes['warning']).toHaveBeenCalled();
      expect(notificacoes['error']).not.toHaveBeenCalled();
      expect(quadro.cancelamentoAberto()).toBe(false);
    });
  });

  describe('calendário', () => {
    type Calendario = {
      aoSoltar(e: DragEvent, iso: string): void;
      iniciarArraste(e: DragEvent, evento: EventoAgendaFrota): void;
      alternarTipo(t: string): void;
      etapaAberta(): boolean;
      dataSugerida(): Date | null;
      agendaSelecionada(): EventoAgendaFrota[];
    };

    const hoje = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const instante = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 8, 30);
    const agendada: EventoAgendaFrota = {
      tipo: 'OS_AGENDADA', tipoRotulo: 'OS agendada', data: iso(hoje), instante: instante.toISOString(),
      titulo: 'OS 12 · ABC1D23', detalhe: 'Troca de pastilhas', placa: 'ABC1D23', base: 'Feira', idReferencia: 'a12',
      numeroOs: 12, tom: 'info', atrasado: false
    };
    const cnh: EventoAgendaFrota = {
      ...agendada, tipo: 'CNH_VENCIMENTO', tipoRotulo: 'CNH vencendo', instante: null, titulo: 'CNH · Maria', idReferencia: 'c1', numeroOs: null
    };

    async function abrirCalendario() {
      frota['agenda'].mockReturnValue(of({ eventos: [agendada, cnh], truncado: false }));
      configurar();
      const fixture = TestBed.createComponent(FrotaOsCalendarioComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, cal: fixture.componentInstance as unknown as Calendario };
    }

    it('abre no mês atual com a agenda de hoje', async () => {
      const { cal } = await abrirCalendario();
      expect(frota['agenda']).toHaveBeenCalledTimes(1);
      expect(cal.agendaSelecionada().map((e) => e.tipo)).toEqual(['OS_AGENDADA', 'CNH_VENCIMENTO']);
    });

    it('o filtro de tipo esconde os eventos e fica guardado', async () => {
      const { cal } = await abrirCalendario();
      cal.alternarTipo('CNH_VENCIMENTO');
      expect(cal.agendaSelecionada().map((e) => e.tipo)).toEqual(['OS_AGENDADA']);
      expect(localStorage.getItem('ces_calendario_frota_tipos_ocultos')).toContain('CNH_VENCIMENTO');
    });

    it('arrastar a OS para outro dia abre o agendamento com a nova data e o horário original', async () => {
      porSituacao['AGENDADA'].itens = [os('a12', 'AGENDADA', { agendadaPara: agendada.instante })];
      const { cal } = await abrirCalendario();
      const destino = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 2);
      cal.iniciarArraste({ dataTransfer: null } as unknown as DragEvent, agendada);
      cal.aoSoltar(soltar(), iso(destino));
      expect(cal.etapaAberta()).toBe(true);
      const sugerida = cal.dataSugerida()!;
      expect(iso(sugerida)).toBe(iso(destino));
      expect([sugerida.getHours(), sugerida.getMinutes()]).toEqual([8, 30]);
      expect(frota['agendarOrdemServico']).toBeUndefined();
    });

    it('OS que já não está agendada não abre o reagendamento', async () => {
      porSituacao['EM_ANDAMENTO'].itens = [os('a12', 'EM_ANDAMENTO')];
      const { cal } = await abrirCalendario();
      cal.iniciarArraste({ dataTransfer: null } as unknown as DragEvent, agendada);
      cal.aoSoltar(soltar(), iso(new Date(hoje.getTime() + 2 * DIA)));
      expect(cal.etapaAberta()).toBe(false);
      expect(notificacoes['warning']).toHaveBeenCalled();
    });
  });
});
