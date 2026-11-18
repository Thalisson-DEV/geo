import { describe, expect, it } from 'vitest';
import {
  contagemSlaClass,
  contagemSlaLabel,
  contagemSlaTom,
  prazoClass,
  prazoIcon,
  prazoLabel,
  prazoTom,
  prioridadeClass
} from './chamados-ui';

describe('chamados-ui SLA helpers', () => {
  describe('contagemSlaLabel', () => {
    it('deve retornar Concluída no prazo para chamados resolvidos com SLA em dia', () => {
      expect(
        contagemSlaLabel({
          status: 'RESOLVIDO',
          slaResolucaoVencido: false,
          slaPausado: false
        })
      ).toBe('Concluída no prazo');
    });

    it('deve retornar Concluída no prazo para chamados fechados com SLA em dia', () => {
      expect(
        contagemSlaLabel({
          status: 'FECHADO',
          slaResolucaoVencido: false,
          slaPausado: false
        })
      ).toBe('Concluída no prazo');
    });

    it('deve retornar Concluída fora do prazo para chamados resolvidos/fechados com SLA vencido', () => {
      expect(
        contagemSlaLabel({
          status: 'RESOLVIDO',
          slaResolucaoVencido: true,
          slaPausado: false
        })
      ).toBe('Concluída fora do prazo');

      expect(
        contagemSlaLabel({
          status: 'FECHADO',
          slaResolucaoVencido: true,
          slaPausado: false
        })
      ).toBe('Concluída fora do prazo');
    });

    it('deve retornar Cancelada para chamados cancelados', () => {
      expect(
        contagemSlaLabel({
          status: 'CANCELADO',
          slaResolucaoVencido: false,
          slaPausado: false
        })
      ).toBe('Cancelada');
    });

    it('deve retornar Pausada para chamados com SLA pausado', () => {
      expect(
        contagemSlaLabel({
          status: 'AGUARDANDO_SOLICITANTE',
          slaResolucaoVencido: false,
          slaPausado: true
        })
      ).toBe('Pausada');
    });

    it('deve retornar Vencida para chamados em andamento com SLA vencido', () => {
      expect(
        contagemSlaLabel({
          status: 'EM_ATENDIMENTO',
          slaResolucaoVencido: true,
          slaPausado: false
        })
      ).toBe('Vencida');
    });

    it('deve retornar Em andamento para chamados em curso com SLA no prazo', () => {
      expect(
        contagemSlaLabel({
          status: 'EM_ATENDIMENTO',
          slaResolucaoVencido: false,
          slaPausado: false
        })
      ).toBe('Em andamento');
    });
  });

  describe('contagemSlaClass', () => {
    it('deve retornar classe de sucesso para resolvido/fechado no prazo', () => {
      expect(
        contagemSlaClass({
          status: 'RESOLVIDO',
          slaResolucaoVencido: false,
          slaPausado: false
        })
      ).toBe('!text-[var(--geo-success-text)]');
    });

    it('deve retornar classe de erro para resolvido/fechado fora do prazo', () => {
      expect(
        contagemSlaClass({
          status: 'FECHADO',
          slaResolucaoVencido: true,
          slaPausado: false
        })
      ).toBe('!text-[var(--geo-danger-text)]');
    });

    it('deve retornar classe neutra para cancelado', () => {
      expect(
        contagemSlaClass({
          status: 'CANCELADO',
          slaResolucaoVencido: false,
          slaPausado: false
        })
      ).toBe('!text-[var(--geo-foreground-muted)]');
    });
  });

  describe('prazoClass e prazoIcon', () => {
    it('deve indicar cancelado com ícone de cancelamento e cor neutra', () => {
      const chamado = {
        status: 'CANCELADO' as const,
        slaResolucaoVencido: false,
        slaPausado: false,
        dataLimiteResolucao: new Date(Date.now() - 3600000).toISOString()
      };
      expect(prazoClass(chamado)).toBe('text-[var(--geo-foreground-muted)] bg-[var(--geo-surface-muted)]');
      expect(prazoIcon(chamado)).toBe('pi pi-times-circle');
    });

    it('deve indicar resolvido no prazo como sucesso e não como alerta de prazo próximo', () => {
      const chamado = {
        status: 'RESOLVIDO' as const,
        slaResolucaoVencido: false,
        slaPausado: false,
        dataLimiteResolucao: new Date(Date.now() - 3600000).toISOString()
      };
      expect(prazoClass(chamado)).toBe('text-[var(--geo-success-text)] bg-[var(--geo-success-soft)]');
      expect(prazoIcon(chamado)).toBe('pi pi-check-circle');
    });

    it('deve indicar resolvido fora do prazo como perigo', () => {
      const chamado = {
        status: 'RESOLVIDO' as const,
        slaResolucaoVencido: true,
        slaPausado: false,
        dataLimiteResolucao: new Date(Date.now() - 3600000).toISOString()
      };
      expect(prazoClass(chamado)).toBe('text-[var(--geo-danger-text)] bg-[var(--geo-danger-soft)]');
      expect(prazoIcon(chamado)).toBe('pi pi-exclamation-circle');
    });
  });

  describe('situação do prazo em curso', () => {
    const emCurso = (horas: number, extra: Partial<{ slaPausado: boolean; slaResolucaoVencido: boolean }> = {}) => ({
      status: 'EM_ATENDIMENTO' as const,
      slaResolucaoVencido: false,
      slaPausado: false,
      dataLimiteResolucao: new Date(Date.now() + horas * 3_600_000).toISOString(),
      ...extra
    });

    it('distingue "no prazo" e "vence em breve" por tom, ícone e texto', () => {
      expect([prazoTom(emCurso(10)), prazoIcon(emCurso(10)), prazoLabel(emCurso(10))]).toEqual(['success', 'pi pi-clock', 'No prazo']);
      expect([prazoTom(emCurso(2)), prazoIcon(emCurso(2)), prazoLabel(emCurso(2))]).toEqual(['warning', 'pi pi-hourglass', 'Vence em breve']);
    });

    it('vencido prevalece sobre pausado no prazo; pausado prevalece na contagem', () => {
      const chamado = emCurso(-1, { slaResolucaoVencido: true, slaPausado: true });
      expect([prazoTom(chamado), prazoLabel(chamado)]).toEqual(['danger', 'Vencido']);
      expect([contagemSlaTom(chamado), contagemSlaLabel(chamado)]).toEqual(['neutral', 'Pausada']);
    });

    it('pausado sem vencimento fica neutro com ícone de pausa', () => {
      const chamado = emCurso(1, { slaPausado: true });
      expect([prazoTom(chamado), prazoIcon(chamado), prazoLabel(chamado)]).toEqual(['neutral', 'pi pi-pause-circle', 'Pausado']);
    });

    it('prazoIcon segue aceitando chamados sem a data limite', () => {
      expect(prazoIcon({ status: 'ABERTO', slaResolucaoVencido: false, slaPausado: false })).toBe('pi pi-clock');
    });
  });

  it('prioridadeClass usa tokens semânticos (sem paleta fixa)', () => {
    expect(prioridadeClass('CRITICA')).toBe('text-[var(--geo-danger-text)] bg-[var(--geo-danger-soft)]');
    expect(prioridadeClass('BAIXA')).toBe('text-[var(--geo-foreground-muted)] bg-[var(--geo-surface-muted)]');
  });
});
