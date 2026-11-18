import { DashboardMetaFisicaResponse, distribuirPeloParcial } from '../../../../core/models/meta-fisica.models';
import { apurar, modeloMetaFisica } from './meta-fisica-calculos';

const CALENDARIO = Array.from({ length: 30 }, (_, i) => {
  const data = `2026-11-${String(i + 1).padStart(2, '0')}`;
  const dia = new Date(2026, 10, i + 1).getDay();
  return { data, util: dia !== 0 && dia !== 6 && data !== '2026-11-02' && data !== '2026-11-20' };
});

function painel(parcial: Partial<DashboardMetaFisicaResponse> = {}): DashboardMetaFisicaResponse {
  return {
    competencia: '2026-11',
    inicio: '2026-11-01',
    fim: '2026-11-30',
    hoje: '2026-11-13',
    geradoEm: '2026-11-13T15:00:00-03:00',
    diasUteis: 19,
    diasUteisEncerrados: 8,
    diasUteisRestantes: 11,
    calendario: CALENDARIO,
    bases: [{ id: 'rem', nome: 'REMANSO' }],
    tipos: [
      { id: 'corte', codigo: 'CS', descricao: 'CORTE' },
      { id: 'enlace', codigo: 'CM', descricao: 'ENLACE' }
    ],
    metas: [
      { idMeta: 'm1', idBaseOperacional: 'rem', idTipoServico: 'corte', quantidade: 190 },
      { idMeta: 'm1', idBaseOperacional: 'rem', idTipoServico: 'enlace', quantidade: 19 }
    ],
    equipes: [{ id: 'eq', codigo: 'USR-R01', idBaseOperacional: 'rem' }],
    producao: [
      { data: '2026-11-03', idBaseOperacional: 'rem', idTipoServico: 'corte', idEquipe: 'eq', notas: 40 },
      { data: '2026-11-12', idBaseOperacional: 'rem', idTipoServico: 'corte', idEquipe: 'eq', notas: 24 },
      { data: '2026-11-13', idBaseOperacional: 'rem', idTipoServico: 'corte', idEquipe: 'eq', notas: 6 },
      { data: '2026-11-05', idBaseOperacional: 'rem', idTipoServico: 'enlace', idEquipe: 'eq', notas: 9 }
    ],
    historico: [
      { competencia: '2026-10', idBaseOperacional: 'rem', idTipoServico: 'corte', meta: 100, realizado: 110 },
      { competencia: '2026-11', idBaseOperacional: 'rem', idTipoServico: 'corte', meta: 190, realizado: 70 }
    ],
    ...parcial
  };
}

describe('meta física: cálculos', () => {
  it('reparte o total pelo parcial da Concessionária e fecha com o total (Remanso: 626 → 528/69/29)', () => {
    expect(distribuirPeloParcial(626, [215, 28, 12])).toEqual([528, 69, 29]);
    expect(distribuirPeloParcial(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(distribuirPeloParcial(626, [0, 0])).toBeNull();
    expect(distribuirPeloParcial(null, [1])).toBeNull();
  });

  it('distribui a meta pelos dias úteis: esperado até ontem, ritmo, projeção e o que falta por dia', () => {
    const d = painel();
    const a = apurar(190, d.producao.filter((p) => p.idTipoServico === 'corte'), d);
    expect(a.realizado).toBe(70);
    expect(a.realizadoAteOntem).toBe(64);
    expect(a.notasHoje).toBe(6);
    expect(a.esperado).toBe(80); // 190 × 8 / 19
    expect(a.ritmo).toBe(8); // 64 / 8
    expect(a.projecao).toBe(152); // 64 + 8 × 11
    expect(a.falta).toBe(120);
    expect(a.necessarioPorDia).toBeCloseTo(10.909, 2);
    expect(a.situacao).toBe('ABAIXO');
  });

  it('mês encerrado não projeta e marca a meta não atingida; mês futuro fica a iniciar', () => {
    const encerrado = painel({ hoje: '2026-12-02', diasUteisEncerrados: 19, diasUteisRestantes: 0 });
    const a = apurar(190, [{ data: '2026-11-10', notas: 100 }], encerrado);
    expect(a.esperado).toBe(190);
    expect(a.projecao).toBe(100);
    expect(a.situacao).toBe('NAO_ATINGIDA');

    const futuro = painel({ hoje: '2026-10-20', diasUteisEncerrados: 0, diasUteisRestantes: 19 });
    expect(apurar(190, [], futuro).situacao).toBe('A_INICIAR');
    expect(apurar(190, [], futuro).projecao).toBeNull();
  });

  it('monta células, grupos, série diária e histórico só com o que tem meta', () => {
    const m = modeloMetaFisica(painel());
    expect(m.geral.meta).toBe(209);
    expect(m.geral.realizado).toBe(79);
    expect(m.celulas.map((c) => [c.servico, c.realizado])).toEqual([
      ['Corte', 70],
      ['Enlace', 9]
    ]);
    expect(m.celulas[1].situacao).toBe('NO_RITMO'); // 9 executadas, 8 esperadas até ontem
    expect(m.bases.length).toBe(1);
    expect(m.servicos.map((s) => s.nome)).toEqual(['Corte', 'Enlace']);
    const ultimo = m.diario[m.diario.length - 1];
    expect(ultimo.metaAcumulada).toBeCloseTo(209, 5);
    expect(ultimo.realizadoAcumulado).toBeNull();
    expect(m.diario.find((x) => x.data === '2026-11-12')!.projecaoAcumulada).toBe(73);
    expect(m.historico.map((h) => [h.competencia, Math.round((h.pct ?? 0) * 10) / 10])).toEqual([
      ['2026-10', 110],
      ['2026-11', 36.8]
    ]);
    expect(m.equipes[0].notas).toBe(79);
  });
});
