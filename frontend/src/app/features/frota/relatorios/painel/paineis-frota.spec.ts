import { describe, expect, it } from 'vitest';

import {
  DetalheCombustivelFrota,
  DetalheConformidadeFrota,
  DetalheCustosFrota,
  DetalheManutencaoFrota,
  DetalheUsoFrota,
  RelatorioGerencialFrota,
  VeiculoRelatorioFrota
} from '../../../../core/models/frota-relatorios.models';
import { modeloCombustivel, vistaCombustivel, visaoCombustivel } from './combustivel/analise-combustivel';
import { modeloConformidade, vistaConformidade, visaoConformidade } from './conformidade/analise-conformidade';
import { modeloCustos, vistaCustos, visaoCustos } from './custos/analise-custos';
import { modeloGeral, vistaGeral } from './geral/analise-geral';
import { modeloManutencao, vistaManutencao, visaoManutencao } from './manutencao/analise-manutencao';
import { modeloUso, vistaUso, visaoUso } from './uso/analise-uso';

const ids = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

function veiculo(i: number): VeiculoRelatorioFrota {
  const km = [0, 300, 2500, 4000, 6000, 800][i];
  const total = [3000, 1500, 9000, 7000, 5000, 20000][i];
  return {
    idVeiculo: ids[i], placa: `ABC${i}D2${i}`, base: i % 2 ? 'Juazeiro' : 'Bonfim', tipo: i < 3 ? 'Picape' : 'Caminhão', regime: i === 0 ? 'LOCADO' : 'PROPRIO',
    situacao: 'ATIVO', processo: i % 2 ? 'Comercial' : 'Obras', manutencao: total * 0.3, combustivel: total * 0.4, despesas: total * 0.1, seguro: total * 0.1,
    locacao: total * 0.1, franquias: 0, total, km, custoPorKm: km ? total / km : null, litros: km / 8, kmPorLitro: km ? 8 - i : null,
    kmPorLitroReferencia: 9, osConcluidas: i, corretivas: i, preventivas: 1, horasParado: i * 10, disponibilidade: 1 - i * 0.02, preventivasVencidas: i % 2,
    turnos: i * 3, notas: i * 10, faturado: i * 4000, custoSobreFaturamento: i ? total / (i * 4000) : null, diasComChecklist: i * 3, coberturaChecklist: i / 6,
    pendenciasChecklist: i, eventosConducao: i * 2, sinistros: i === 5 ? 1 : 0, horasLigadoParado: i * 4, kmForaExpediente: i * 30,
    idBase: i % 2 ? 'b2' : 'b1', idTipo: i < 3 ? 't1' : 't2', idProcesso: i % 2 ? 'p2' : 'p1', totalAnterior: total * 0.8, kmAnterior: km * 0.9
  };
}

const ind = (atual: number | null, anterior: number | null) => ({ atual, anterior });

function relatorio(): RelatorioGerencialFrota {
  const veiculos = ids.map((_, i) => veiculo(i));
  return {
    periodo: { de: '2026-08-01', ate: '2026-10-31', anteriorDe: '2026-05-01', anteriorAte: '2026-07-31', dias: 92, diasUteis: 65, calculadoEm: '2026-11-01T12:00:00Z' },
    recorte: { veiculos: 6, emOperacao: 6, baixados: 0, locados: 1 },
    partesOmitidas: [],
    resumo: { custoTotal: ind(45500, 36400), custoPorKm: ind(3.2, 3), custoVeiculoMes: ind(2500, 2000), km: ind(13600, 12000), disponibilidade: ind(0.93, 0.95),
      percentualPreventiva: ind(0.4, 0.5), custoSobreFaturamento: ind(0.5, 0.4), aguardandoFinanceiro: 1200 },
    custos: {
      porCategoria: ['MANUTENCAO', 'COMBUSTIVEL', 'DESPESAS', 'SEGURO', 'LOCACAO'].map((c, i) => ({ categoria: c, rotulo: c, valor: 9000 - i * 1000, anterior: 8000 - i * 900 })),
      mensal: ['2026-08-01', '2026-09-01', '2026-10-01'].map((mes, i) => ({ mes, manutencao: 3000 + i, combustivel: 4000, despesas: 500, seguro: 600, locacao: 700, franquias: 0, total: 8800 + i, km: 4500 })),
      porBase: [], porTipo: [], porRegime: [], porProcesso: [], despesasPorTipo: []
    },
    manutencao: {
      osConcluidas: ind(5, 4), corretivas: 3, preventivas: 2, valor: ind(5000, 4000), percentualPreventiva: ind(0.4, 0.5), mttrHoras: ind(30, 20), mtbfDias: ind(40, 50),
      disponibilidade: ind(0.93, 0.95), fila: { total: 2, ate7Dias: 1, de8a30Dias: 0, acima30Dias: 1, atrasadas: 1, comVeiculoParado: 1 }, filaMaisAntiga: [],
      paradosAgora: [{ idVeiculo: 'v3', placa: 'ABC3D23', idOs: 'oa1', numeroOs: 10, desde: '2026-09-01T10:00:00Z', dias: 60, descricao: 'Motor' }],
      porOrigem: [], porCausa: [], porOficina: [], retrabalho: [], preventivasVencidas: 3, preventivasProximas: 1, mensal: []
    },
    combustivel: { litros: ind(1700, 1500), valor: ind(10000, 9000), precoMedio: ind(6, 5.8), kmPorLitro: ind(8, 8.5), abastecimentos: 6, veiculosForaDoPadrao: 2,
      porProduto: [], porPosto: [], alertas: [], mensal: [] },
    uso: { km: ind(13600, 12000), veiculosComKm: 5, ociosos: [{ idVeiculo: 'v1', placa: 'ABC0D20', base: 'Bonfim', tipo: 'Picape', situacao: 'ATIVO' }], turnos: 45, notas: 150,
      faturado: ind(60000, 50000), custoSobreFaturamento: ind(0.5, 0.4), comTelemetria: true, horasLigadoParado: 60, kmForaExpediente: 450, mensal: [] },
    conformidade: {
      coberturaChecklist: ind(0.5, 0.6), veiculosChecklistAbaixoMeta: 4, pendenciasAbertas: 3, documentosVencidos: 1, documentosAVencer: 1,
      documentos: [{ id: 'd1', idVeiculo: 'v2', placa: 'ABC1D21', tipo: 'CRLV', descricao: null, vencimento: '2026-10-01', vencido: true }],
      cnhVencidas: 1, cnhAVencer: 0, cnh: [], semSeguro: [{ idVeiculo: 'v4', placa: 'ABC3D23', base: null, tipo: null, situacao: 'ATIVO' }], apolicesVencendo: [],
      sinistros: { total: ind(1, 0), comCulpaDoCondutor: 1, franquias: 500, porTipo: [{ chave: 'FURTO', rotulo: 'Furto', total: 1 }],
        lista: [{ id: 's1', numero: 1, idVeiculo: 'v6', placa: 'ABC5D25', tipo: 'FURTO', situacao: 'FINALIZADO', culpaCondutor: true, franquia: 500, ocorridoEm: '2026-09-10T10:00:00Z' }] },
      eventosConducao: { total: ind(30, 20), por100Km: ind(0.2, 0.15), porTipo: [{ chave: 'EXCESSO_VELOCIDADE', rotulo: 'Excesso', total: 30 }] },
      condutores: [{ idColaborador: 'c1', nome: 'Fulano', eventos: 10, sinistros: 1, sinistrosComCulpa: 1 }],
      acidentes: { total: 1, diasPerdidos: 2, porTipo: [{ chave: 'X', rotulo: 'Batida', total: 1 }], lista: [{ idEvento: 'e1', idVeiculo: 'v6', placa: 'ABC5D25', tipo: 'X', rotulo: 'Batida', ocorridoEm: '2026-09-10T10:00:00Z', diasPerdidos: 2 }] }
    },
    veiculos
  };
}

const os = (id: string, v: number, tipo: string, mes: string, extra: Partial<DetalheManutencaoFrota['concluidas'][number]> = {}) => ({
  id, numero: Number(id.replace(/\D/g, '')) || 1, idVeiculo: ids[v], placa: `ABC${v}D2${v}`, tipoManutencao: tipo, origem: 'CHECKLIST', causa: tipo === 'CORRETIVA' ? 'USO_INDEVIDO' : null,
  criticidade: 'ALTA', tipoOficina: 'EXTERNA', oficina: v % 2 ? 'Oficina A' : 'Oficina B', valor: 1000 + v * 100, valorPecas: 600, valorServicos: 400,
  abertaEm: `${mes}T08:00:00Z`, inicioReal: `${mes}T10:00:00Z`, fimReal: `${mes.slice(0, 8)}20T18:00:00Z`, veiculoParado: true, horasReparo: 60, diasAteInicio: 4,
  baixaPendente: v === 2, descricao: 'Troca', ...extra
});

const detManutencao: DetalheManutencaoFrota = {
  concluidas: [os('o1', 2, 'CORRETIVA', '2026-08-05'), os('o2', 2, 'CORRETIVA', '2026-09-05'), os('o3', 2, 'CORRETIVA', '2026-10-05'), os('o4', 3, 'PREVENTIVA', '2026-10-05'), os('o5', 4, 'CORRETIVA', '2026-09-05')],
  concluidasAnterior: [os('o9', 1, 'PREVENTIVA', '2026-06-05')],
  abertas: [{ id: 'oa1', numero: 10, idVeiculo: 'v3', placa: 'ABC2D22', situacao: 'EM_ANDAMENTO', tipoManutencao: 'CORRETIVA', origem: 'VERBAL', criticidade: 'URGENTE',
    tipoOficina: 'INTERNA', oficina: 'Oficina interna', abertaEm: '2026-09-01T10:00:00Z', agendadaPara: null, previsaoTermino: '2026-09-05T10:00:00Z', veiculoParado: true,
    paradoDesde: '2026-09-01T10:00:00Z', diasAberta: 60, atrasada: true, descricao: 'Motor' }],
  itens: [{ idOs: 'o1', item: 'Freio', tipo: 'PECA', retrabalho: false }, { idOs: 'o2', item: 'Freio', tipo: 'PECA', retrabalho: true }, { idOs: 'o3', item: 'Freio', tipo: 'PECA', retrabalho: false }],
  pecas: [{ idOs: 'o1', descricao: 'Pastilha', origem: 'COMPRA', quantidade: 2, unidade: 'UN', valor: 300 }],
  servicos: [{ idOs: 'o1', descricao: 'Troca', mecanico: 'João', valor: 200 }]
};

const abast = (id: string, v: number, data: string, alertas: string[] = [], preco = 6) => ({
  id, realizadoEm: data, idVeiculo: ids[v], placa: `ABC${v}D2${v}`, idPosto: v % 2 ? 'po1' : 'po2', posto: v % 2 ? 'Posto Caro' : 'Posto Barato', idCondutor: 'c1', condutor: 'Fulano',
  origem: 'APP', litros: 100, valorCombustivel: 100 * preco, valorTotal: 100 * preco + 20, precoLitro: preco, produtos: 'Diesel S10', medicao: 1000, kmDesdeAnterior: 700,
  kmPorLitro: 7, horasAprovacao: 5, alertas
});

const detCombustivel: DetalheCombustivelFrota = {
  atual: [abast('a1', 1, '2026-08-02T10:00:00Z', [], 6.5), abast('a2', 2, '2026-09-06T10:00:00Z', ['FOTO_REPETIDA']), abast('a3', 3, '2026-10-04T10:00:00Z', ['FOTO_REPETIDA'], 6.4),
    abast('a4', 4, '2026-10-10T10:00:00Z'), abast('a5', 5, '2026-10-11T10:00:00Z', ['MEDICAO_MENOR'], 6.6)],
  anterior: [abast('a9', 1, '2026-06-02T10:00:00Z', [], 5.9)]
};

const detCustos: DetalheCustosFrota = {
  lancamentos: [
    { categoria: 'MANUTENCAO', id: 'o1', numero: 1, data: '2026-08-20T18:00:00Z', idVeiculo: 'v3', placa: 'ABC2D22', descricao: 'Troca', contraparte: 'Oficina B', valor: 1200 },
    { categoria: 'DESPESAS', id: 'd1', numero: null, data: '2026-09-10T03:00:00Z', idVeiculo: 'v2', placa: 'ABC1D21', descricao: 'Lavagem · completa', contraparte: null, valor: 150 },
    { categoria: 'COMBUSTIVEL', id: 'a1', numero: null, data: '2026-10-02T10:00:00Z', idVeiculo: 'v2', placa: 'ABC1D21', descricao: 'Abastecimento', contraparte: 'Posto', valor: 600 }
  ]
};

const detUso: DetalheUsoFrota = {
  kmMensal: ids.map((id, i) => ({ idVeiculo: id, mes: '2026-09-01', km: i * 100 })),
  producaoMensal: ids.map((id, i) => ({ idVeiculo: id, mes: '2026-09-01', turnos: i, notas: i * 2, faturado: i * 1000 }))
};

const detConformidade: DetalheConformidadeFrota = {
  documentos: [{ id: 'd1', idVeiculo: 'v2', placa: 'ABC1D21', tipo: 'CRLV', descricao: null, vencimento: '2026-10-01', dias: -10, comArquivo: false },
    { id: 'd2', idVeiculo: 'v3', placa: 'ABC2D22', tipo: 'IPVA', descricao: null, vencimento: '2026-12-01', dias: 20, comArquivo: true }],
  cnh: [{ idCondutor: 'k1', idColaborador: 'c1', nome: 'Fulano', categoria: 'D', validade: '2026-10-01', dias: -5, placas: ['ABC1D21'] }],
  pendencias: [{ id: 'p1', idChecklist: 'ch1', idVeiculo: 'v2', placa: 'ABC1D21', item: 'Pneu careca', grupo: 'Pneus', abertaEm: '2026-10-01T10:00:00Z', dias: 20, comentario: null, idOrdemServico: null }]
};

function semErro(nome: string, vista: () => unknown) {
  const v = vista();
  expect(v, nome).not.toBeNull();
}

describe('painéis da frota', () => {
  const r = relatorio();

  it('custos: visão e todas as análises', () => {
    const m = modeloCustos(r, detCustos.lancamentos, []);
    expect(visaoCustos(m).leituras.length).toBeGreaterThan(0);
    expect(m.concentracao.total).toBe(6);
    for (const a of ['kpi:total', 'kpi:km', 'kpi:veiculo-mes', 'kpi:concentracao', 'kpi:fora-da-curva', 'kpi:altas', 'mes:2026-09-01', 'categoria:MANUTENCAO',
      'categoria:SEGURO', 'grupo:base~b1', 'grupo:regime~LOCADO', 'veiculo:v3', 'despesa:Lavagem']) {
      const [dimension, value] = [a.slice(0, a.indexOf(':')), a.slice(a.indexOf(':') + 1)];
      semErro(a, () => vistaCustos({ dimension, value }, m));
    }
    const soManutencao = modeloCustos(r, detCustos.lancamentos, ['MANUTENCAO']);
    expect(soManutencao.total).toBe(9000);
    expect(soManutencao.lancamentos.length).toBe(1);
  });

  it('manutenção: visão, filtros e análises', () => {
    const m = modeloManutencao(r, detManutencao, { tipo: [], criticidade: [], oficina: [], origem: [] });
    expect(m.retrabalho.length).toBe(1);
    expect(visaoManutencao(m).leituras.map((l) => l.id)).toContain('reincidente');
    for (const a of ['kpi:os', 'kpi:custo', 'kpi:mttr', 'kpi:mtbf', 'kpi:espera', 'kpi:retrabalho', 'kpi:baixa', 'kpi:fila', 'kpi:parados', 'kpi:preventiva',
      'tipo:CORRETIVA', 'causa:USO_INDEVIDO', 'origem:CHECKLIST', 'mes:2026-09-01', 'oficina:Oficina A', 'item:Freio', 'faixa:acima30', 'criticidade:URGENTE', 'veiculo:v3']) {
      const i = a.indexOf(':');
      semErro(a, () => vistaManutencao({ dimension: a.slice(0, i), value: a.slice(i + 1) }, m));
    }
    expect(modeloManutencao(r, detManutencao, { tipo: ['PREVENTIVA'], criticidade: [], oficina: [], origem: [] }).os.length).toBe(1);
  });

  it('combustível: visão, filtros e análises', () => {
    const m = modeloCombustivel(r, detCombustivel, { postos: [], alertas: [], condutores: [] });
    expect(m.comAlerta.length).toBe(3);
    expect(m.economiaPotencial).toBeGreaterThan(0);
    expect(visaoCombustivel(m).leituras.length).toBeGreaterThan(0);
    for (const a of ['kpi:litros', 'kpi:gasto', 'kpi:preco', 'kpi:postos', 'kpi:consumo', 'kpi:alertas', 'kpi:fim-de-semana', 'mes:2026-10-01', 'posto:po1',
      'alerta:FOTO_REPETIDA', 'condutor:c1', 'dia:6', 'veiculo:v3']) {
      const i = a.indexOf(':');
      semErro(a, () => vistaCombustivel({ dimension: a.slice(0, i), value: a.slice(i + 1) }, m));
    }
    expect(modeloCombustivel(r, detCombustivel, { postos: [], alertas: ['FOTO_REPETIDA'], condutores: [] }).atual.length).toBe(2);
  });

  it('uso: visão, classes e análises', () => {
    const m = modeloUso(r, detUso, []);
    expect(m.ociosos.map((v) => v.idVeiculo)).toEqual(['v1']);
    expect(visaoUso(m).leituras.map((l) => l.id)).toContain('ociosos');
    for (const a of ['kpi:km', 'kpi:producao', 'kpi:custo-faturamento', 'kpi:ociosos', 'kpi:subutilizados', 'kpi:telemetria', 'mes:2026-09-01', 'grupo:base~b1',
      'grupo:processo~p2', 'faixa:ate500', 'classe:OCIOSO', 'veiculo:v4']) {
      const i = a.indexOf(':');
      semErro(a, () => vistaUso({ dimension: a.slice(0, i), value: a.slice(i + 1) }, m));
    }
  });

  it('conformidade: visão e análises', () => {
    const m = modeloConformidade(r, detConformidade, 90);
    const v = visaoConformidade(m);
    expect(v.veredito.tom).toBe('danger');
    expect(v.veredito.titulo).toContain('podem parar');
    expect(m.cnhRodando.length).toBe(1);
    for (const a of ['kpi:documentos', 'kpi:agenda', 'kpi:cnh', 'kpi:checklist', 'kpi:pendencias', 'kpi:seguro', 'kpi:sinistros', 'kpi:eventos', 'kpi:acidentes',
      'tipo-doc:CRLV', `semana:${m.semanas[0].inicio}`, 'base:b1', 'item:Pneu careca', 'tipo-sinistro:FURTO', 'veiculo:v2']) {
      const i = a.indexOf(':');
      semErro(a, () => vistaConformidade({ dimension: a.slice(0, i), value: a.slice(i + 1) }, m));
    }
  });

  it('visão geral: atenção, bases e análises', () => {
    const m = modeloGeral(r);
    expect(m.atencao[0].motivos.length).toBeGreaterThan(0);
    expect(m.bases.length).toBe(2);
    for (const a of ['veiculo:v3', 'base:b1', 'mes:2026-09-01', 'kpi:atencao']) {
      const i = a.indexOf(':');
      semErro(a, () => vistaGeral({ dimension: a.slice(0, i), value: a.slice(i + 1) }, m, {}));
    }
  });
});
