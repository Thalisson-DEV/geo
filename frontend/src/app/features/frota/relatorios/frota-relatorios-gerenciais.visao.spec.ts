import { describe, expect, it } from 'vitest';
import { IndicadorFrota, RelatorioGerencialFrota } from '../../../core/models/frota-relatorios.models';
import { comparacao, pct, rotuloMes, variacao, visaoRelatorioFrota } from './frota-relatorios-gerenciais.visao';

function relatorio(parcial: Partial<RelatorioGerencialFrota> = {}): RelatorioGerencialFrota {
  return {
    periodo: { de: '2026-10-01', ate: '2026-10-30', anteriorDe: '2026-09-01', anteriorAte: '2026-09-30', dias: 30, diasUteis: 22, calculadoEm: '2026-10-30T12:00:00Z' },
    recorte: { veiculos: 10, emOperacao: 10, baixados: 0, locados: 2 },
    partesOmitidas: [],
    resumo: {
      custoTotal: { atual: 100000, anterior: 95000 },
      custoPorKm: { atual: 2.1, anterior: 2 },
      custoVeiculoMes: { atual: 10000, anterior: 9500 },
      km: { atual: 47000, anterior: 46000 },
      disponibilidade: { atual: 0.97, anterior: 0.96 },
      percentualPreventiva: { atual: 0.72, anterior: 0.7 },
      custoSobreFaturamento: { atual: null, anterior: null },
      aguardandoFinanceiro: 0
    },
    custos: { porCategoria: [], mensal: [], porBase: [], porTipo: [], porRegime: [], porProcesso: [], despesasPorTipo: null },
    manutencao: null,
    combustivel: null,
    uso: {
      km: { atual: 47000, anterior: 46000 }, veiculosComKm: 10, ociosos: [], turnos: 0, notas: 0,
      faturado: { atual: 0, anterior: 0 }, custoSobreFaturamento: { atual: null, anterior: null }, comTelemetria: false,
      horasLigadoParado: null, kmForaExpediente: null, mensal: []
    },
    conformidade: {
      coberturaChecklist: null, veiculosChecklistAbaixoMeta: 0, pendenciasAbertas: 0, documentosVencidos: 0, documentosAVencer: 0,
      documentos: [], cnhVencidas: 0, cnhAVencer: 0, cnh: [], semSeguro: null, apolicesVencendo: null, sinistros: null,
      eventosConducao: null, condutores: null, acidentes: { total: 0, diasPerdidos: 0, porTipo: [], lista: [] }
    },
    veiculos: [],
    ...parcial
  };
}

describe('visão gerencial dos relatórios da frota', () => {
  it('fica sob controle quando nada passa dos limites', () => {
    const v = visaoRelatorioFrota(relatorio());
    expect(v.veredito.tom).toBe('success');
    expect(v.leituras).toHaveLength(0);
  });

  it('pede ação quando há documento vencido e leva à aba de conformidade', () => {
    const r = relatorio();
    r.conformidade.documentosVencidos = 2;
    const v = visaoRelatorioFrota(r);
    expect(v.veredito.tom).toBe('danger');
    expect(v.leituras[0]).toMatchObject({ id: 'vencidos', aba: 'conformidade', tom: 'danger' });
  });

  it('disponibilidade abaixo de 90% é crítica; entre 90% e 95%, atenção', () => {
    const critica = relatorio();
    critica.resumo.disponibilidade = { atual: 0.88, anterior: 0.95 };
    expect(visaoRelatorioFrota(critica).veredito.tom).toBe('danger');

    const atencao = relatorio();
    atencao.resumo.disponibilidade = { atual: 0.93, anterior: 0.95 };
    const v = visaoRelatorioFrota(atencao);
    expect(v.veredito.tom).toBe('warning');
    expect(v.leituras.find((l) => l.id === 'disponibilidade')?.tom).toBe('warning');
  });

  it('custo 15% acima do período anterior aponta a categoria que mais cresceu', () => {
    const r = relatorio();
    r.resumo.custoTotal = { atual: 130000, anterior: 100000 };
    r.custos.porCategoria = [
      { categoria: 'MANUTENCAO', rotulo: 'Manutenção', valor: 60000, anterior: 35000 },
      { categoria: 'COMBUSTIVEL', rotulo: 'Combustível', valor: 70000, anterior: 65000 }
    ];
    const leitura = visaoRelatorioFrota(r).leituras.find((l) => l.id === 'custo');
    expect(leitura?.texto).toContain('manutenção');
  });

  it('ordena o que pede ação antes do contexto', () => {
    const r = relatorio();
    r.conformidade.cnhVencidas = 1;
    r.uso.ociosos = [{ idVeiculo: 'x', placa: 'ABC1D23', base: null, tipo: null, situacao: 'RESERVA' }];
    const tons = visaoRelatorioFrota(r).leituras.map((l) => l.tom);
    expect(tons[0]).toBe('danger');
    expect(tons.at(-1)).toBe('info');
  });
});

describe('formatação', () => {
  it('compara frações em pontos percentuais e valores em variação relativa', () => {
    expect(comparacao({ atual: 0.95, anterior: 0.9 }, 'fracao')).toBe('+5 p.p. sobre o período anterior');
    expect(comparacao({ atual: 110, anterior: 100 })).toBe('+10% sobre o período anterior');
    expect(comparacao({ atual: 10, anterior: null })).toBe('Sem base no período anterior');
  });

  it('variação sem base é nula', () => {
    expect(variacao({ atual: 10, anterior: 0 })).toBeNull();
  });

  it('indicador sem o campo anterior (a API omite nulos) não vira NaN', () => {
    const semAnterior = { atual: 44.6 } as IndicadorFrota;
    expect(variacao(semAnterior)).toBeNull();
    expect(comparacao(semAnterior)).toBe('Sem base no período anterior');
    expect(comparacao(semAnterior, 'fracao')).toBe('Sem base no período anterior');
    expect(comparacao({} as IndicadorFrota)).toBe('Sem dados no período');
  });

  it('formata percentual e mês', () => {
    expect(pct(0.9533)).toBe('95,3%');
    expect(rotuloMes('2026-03-01')).toBe('Mar/26');
  });
});
