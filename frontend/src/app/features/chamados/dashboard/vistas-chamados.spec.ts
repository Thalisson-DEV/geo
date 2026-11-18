import { describe, expect, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';

import { ChamadoFiltros } from '../../../core/models/chamado.models';
import { FilaAgora, linhaChamado } from './analise-chamados';
import { AGORA, chamado, resposta } from './analise-chamados.testing';
import { ContextoVistas, detalheChamado, vistaChamados } from './vistas-chamados';

const linha = (p: Parameters<typeof chamado>[0] = {}) => linhaChamado(chamado(p), AGORA, () => 'Ana');

function contexto(fila: FilaAgora | null = { linhas: [linha({ id: 'a', slaResolucaoVencido: true }), linha({ id: 'b', usuarioResponsavelId: null })], truncado: false }) {
  const pedidos: ChamadoFiltros[] = [];
  const ctx: ContextoVistas = {
    d: resposta(),
    fila,
    recorte: { inicio: '2026-11-01T00:00:00.000-03:00', fim: '2026-11-12T23:59:59.999-03:00', topicoId: ['t1'] },
    carregar: (f) => {
      pedidos.push(f);
      return of({ linhas: [], total: 0 });
    }
  };
  return { ctx, pedidos };
}

describe('análises do dashboard de chamados', () => {
  it('alvo desconhecido ou inexistente não abre análise', () => {
    const { ctx } = contexto();
    expect(vistaChamados(null, ctx)).toBeNull();
    expect(vistaChamados({ dimension: 'xyz', value: '1' }, ctx)).toBeNull();
    expect(vistaChamados({ dimension: 'equipe', value: 'nao-existe' }, ctx)).toBeNull();
    expect(vistaChamados({ dimension: 'kpi', value: 'nao-existe' }, ctx)).toBeNull();
  });

  it('volume: gráficos clicáveis levam ao período e ao status', () => {
    const { ctx, pedidos } = contexto();
    const v = vistaChamados({ dimension: 'kpi', value: 'volume' }, ctx)!;
    expect(v.titulo).toBe('Chamados abertos no período');
    const fluxo = v.graficos.find((g) => g.id === 'fluxo')!;
    expect(fluxo.aoSelecionar!(1)).toEqual({ tipo: 'navegar', alvo: { dimension: 'periodo', value: '2026-11-02' } });
    const status = v.graficos.find((g) => g.id === 'status')!;
    expect(status.aoSelecionar!(0)).toEqual({ tipo: 'navegar', alvo: { dimension: 'status', value: 'ABERTO' } });
    void firstValueFrom(v.origem!.carregar());
    expect(pedidos[0]).toMatchObject({ topicoId: 't1', dataAberturaInicio: ctx.recorte.inicio, size: 200, sort: 'dataAbertura,desc' });
    expect(v.origem!.verTudo).toMatchObject({ rota: '/chamados/fila', queryParams: { abertura: '2026-11-01~2026-11-12', topico: 't1' } });
  });

  it('motivo: lista os abertos do motivo e navega entre motivos', async () => {
    const { ctx } = contexto();
    const v = vistaChamados({ dimension: 'motivo', value: 'sla-vencido' }, ctx)!;
    expect(v.kpis[0].valor).toBe('1');
    expect(v.proximo?.alvo).toEqual({ dimension: 'motivo', value: 'resposta-vencida' });
    const origem = await firstValueFrom(v.origem!.carregar());
    expect(origem.linhas.map((l) => l.id)).toEqual(['a']);
    expect(v.origem!.verTudo?.queryParams).toEqual({ topico: 't1', resolucao: 'true' });
  });

  it('motivo sem a fila lida não abre', () => {
    const { ctx } = contexto(null);
    expect(vistaChamados({ dimension: 'motivo', value: 'parado' }, ctx)).toBeNull();
  });

  it('equipe: indicadores, vizinhos, chamados do período e abertos agora', async () => {
    const { ctx, pedidos } = contexto();
    const v = vistaChamados({ dimension: 'equipe', value: 'e1' }, ctx)!;
    expect(v.titulo).toBe('Suporte');
    expect(v.proximo?.alvo).toEqual({ dimension: 'equipe', value: 'e2' });
    expect(v.kpis.find((k) => k.rotulo === 'SLA de resolução')?.tom).toBe('warning');
    void firstValueFrom(v.origem!.carregar());
    expect(pedidos[0]).toMatchObject({ equipeId: 'e1' });
    const abertos = await firstValueFrom(v.origensExtras![0].carregar());
    expect(abertos.total).toBe(2);
  });

  it('atendente filtra a fila pelo responsável', () => {
    const { ctx, pedidos } = contexto();
    const v = vistaChamados({ dimension: 'atendente', value: 'u1' }, ctx)!;
    void firstValueFrom(v.origem!.carregar());
    expect(pedidos[0]).toMatchObject({ usuarioResponsavelId: 'u1' });
    expect(v.origem!.verTudo?.queryParams).toMatchObject({ responsavel: 'u1' });
  });

  it('período restringe a origem ao dia clicado', () => {
    const { ctx, pedidos } = contexto();
    const v = vistaChamados({ dimension: 'periodo', value: '2026-11-02' }, ctx)!;
    expect(v.anterior?.alvo).toEqual({ dimension: 'periodo', value: '2026-11-01' });
    void firstValueFrom(v.origem!.carregar());
    const ini = Date.parse(pedidos[0].dataAberturaInicio!);
    const fim = Date.parse(pedidos[0].dataAberturaFim!);
    expect(fim - ini).toBe(24 * 3_600_000 - 1);
  });

  it('SLA usa percentuais em fração no gráfico por equipe e abre a equipe', () => {
    const { ctx } = contexto();
    const v = vistaChamados({ dimension: 'kpi', value: 'sla' }, ctx)!;
    const g = v.graficos.find((x) => x.id === 'sla-equipe')!;
    expect(g.formato).toBe('percent');
    expect(g.series[0].values[0]).toBe(0.7);
    expect(g.aoSelecionar!(0)).toEqual({ tipo: 'navegar', alvo: { dimension: 'equipe', value: 'e1' } });
    expect(v.origensExtras?.[0].verTudo?.queryParams).toMatchObject({ primeiraResposta: 'true' });
  });

  it('idade, prioridade, status e solicitante abrem com os números do painel', () => {
    const { ctx } = contexto();
    expect(vistaChamados({ dimension: 'idade', value: '1-3d' }, ctx)?.kpis[0].valor).toBe('4');
    expect(vistaChamados({ dimension: 'prioridade', value: 'NORMAL' }, ctx)?.kpis[0].valor).toBe('12');
    expect(vistaChamados({ dimension: 'status', value: 'RESOLVIDO' }, ctx)?.kpis[0].valor).toBe('10');
    expect(vistaChamados({ dimension: 'solicitante', value: 's1' }, ctx)?.titulo).toBe('Carla');
  });

  it('detalhe do chamado leva à ficha na fila', () => {
    const d = detalheChamado(linha({ id: 'x', usuarioResponsavelId: null }));
    expect(d.links?.[0].rota).toEqual(['/chamados/fila', 'x']);
    expect(d.listas?.[0].itens).toContain('Sem responsável');
  });
});
