import { describe, expect, it } from 'vitest';

import {
  EstoqueRelatorioResponse,
  FechamentoRelatorio,
  FechamentoRelatorioResponse,
  MovimentacaoRelatorio,
  MovimentacoesRelatorioResponse,
  SaldoRelatorio
} from '../../../../core/models/almoxarifado-relatorios.models';
import { PainelSolicitacoesResponse, SolicitacaoDoPainel } from '../../../../core/models/painel-solicitacoes.models';
import { eixoDoPeriodo, natureza, priorizar, rotuloSemana, sentido, taxaRetornoDe } from './almox-analise-comum';
import { modeloConsumo, visaoConsumo, vistaConsumo } from './consumo/analise-consumo';
import { modeloEstoque, visaoEstoque, vistaEstoque } from './estoque/analise-estoque';
import { modeloFechamento, visaoFechamento, vistaFechamento } from './fechamento/analise-fechamento';
import { modeloGeral, vereditoGeral } from './geral/analise-geral';
import { modeloMov, visaoMov, vistaMov } from './movimentacoes/analise-movimentacoes';
import { visaoDoProcesso } from './solicitacoes/analise-solicitacoes';
import { recortar } from './solicitacoes/solicitacoes-calculos';

const ALM = 'alm-1';
const EQ = ['eq-1', 'eq-2', 'eq-3', 'eq-4'];
let seq = 0;

function mov(tipo: MovimentacaoRelatorio['tipo'], ori: string | null, tOri: string | null, dst: string | null, tDst: string | null, extra: Partial<MovimentacaoRelatorio> = {}): MovimentacaoRelatorio {
  seq++;
  return {
    id: `m${seq}`, idOperacao: `op${seq}`, dataHora: '2026-10-15T13:00:00-03:00', anterior: false, tipo, condicao: 'NOVO', motivo: null, observacao: null,
    quantidade: 10, idMaterial: 'mat-1', codigo: '300001', descricao: 'CABO MULTIPLEXADO', unidade: 'M', numSerie: null,
    idOrigem: ori, origem: ori === ALM ? 'ALMOX' : ori, tipoOrigem: tOri, idDestino: dst, destino: dst === ALM ? 'ALMOX' : dst, tipoDestino: tDst,
    idBase: 'b1', base: 'Juazeiro', idEquipe: 'eq-1', equipe: 'EQ 1', idProcesso: 'p1', processo: 'Comercial', idObra: null, obra: null,
    idSolicitacao: null, contexto: null, tipoTecnico: null, idOperador: 'u1', operador: 'Ana', ...extra
  };
}

function movimentacoes(): MovimentacoesRelatorioResponse {
  seq = 0;
  const l: MovimentacaoRelatorio[] = [];
  // Entregas do almoxarifado para quatro equipes; a eq-4 leva muito mais.
  EQ.forEach((eq, i) => {
    for (let k = 0; k < 4; k++) l.push(mov('ENTREGA', ALM, 'FISICO', `est-${eq}`, 'CAMPO', { idEquipe: eq, equipe: eq.toUpperCase(), quantidade: i === 3 ? 60 : 10 }));
  });
  l.push(mov('ESTORNO', 'est-eq-1', 'CAMPO', ALM, 'FISICO'));
  l.push(mov('DEVOLUCAO', 'est-eq-2', 'CAMPO', ALM, 'FISICO', { idEquipe: 'eq-2', quantidade: 500 }));
  l.push(mov('APLICACAO', 'est-eq-1', 'CAMPO', null, null, { quantidade: 5 }));
  l.push(mov('RETIRADA', null, null, 'est-eq-3', 'CAMPO', { idEquipe: 'eq-3', condicao: 'SUCATA', quantidade: 8 }));
  l.push(mov('ENTRADA_AVULSA', null, null, ALM, 'FISICO', { motivo: 'AQUISICAO_EXTRA', quantidade: 200 }));
  l.push(mov('BAIXA_AVULSA', ALM, 'FISICO', null, null, { motivo: 'AJUSTE_INVENTARIO', idMaterial: 'mat-2', codigo: '300010', descricao: 'CONECTOR' }));
  l.push(mov('BAIXA_AVULSA', ALM, 'FISICO', null, null, { motivo: 'AJUSTE_INVENTARIO', idMaterial: 'mat-2', codigo: '300010', descricao: 'CONECTOR' }));
  l.push(mov('BAIXA_AVULSA', ALM, 'FISICO', null, null, { motivo: 'PERDA_AVARIA', dataHora: '2026-10-17T23:30:00-03:00' }));
  l.push(mov('BAIXA_AVULSA', ALM, 'FISICO', null, null, { motivo: null }));
  l.push(mov('ENTREGA', ALM, 'FISICO', 'est-eq-1', 'CAMPO', { anterior: true, dataHora: '2026-07-10T10:00:00-03:00' }));
  return { geradoEm: '2026-11-10T12:00:00-03:00', de: '2026-09-01', ate: '2026-11-10', anteriorDe: '2026-06-22', anteriorAte: '2026-08-31', limite: 40000, truncado: false, movimentacoes: l };
}

function saldo(extra: Partial<SaldoRelatorio>): SaldoRelatorio {
  return {
    idEstoque: ALM, estoque: 'ALMOX', tipoEstoque: 'FISICO', idBase: 'b1', base: 'Juazeiro', idEquipe: null, equipe: null, idProcesso: null, processo: null,
    idObra: null, obra: null, idMaterial: 'mat-1', codigo: '300001', descricao: 'CABO MULTIPLEXADO', unidade: 'M', detalhaSerie: false, condicao: 'NOVO',
    quantidade: 30, series: 0, seriesReservadas: 0, ultimaEntrada: '2026-10-01T10:00:00-03:00', ultimaSaida: '2026-10-15T13:00:00-03:00', desde: null, ...extra
  };
}

function estoque(): EstoqueRelatorioResponse {
  return {
    geradoEm: '2026-11-10T12:00:00-03:00', limite: 30000, truncado: false,
    saldos: [
      saldo({}),
      saldo({ idMaterial: 'mat-9', codigo: '300900', descricao: 'PARA-RAIOS', quantidade: 40, ultimaSaida: '2026-03-01T10:00:00-03:00' }),
      saldo({ idEstoque: 'est-eq-3', estoque: 'EQ-3', tipoEstoque: 'CAMPO', idEquipe: 'eq-3', equipe: 'EQ-3', ultimaEntrada: '2026-08-01T10:00:00-03:00', ultimaSaida: null }),
      saldo({ idEstoque: 'est-eq-3', estoque: 'EQ-3', tipoEstoque: 'CAMPO', idEquipe: 'eq-3', equipe: 'EQ-3', condicao: 'SUCATA', quantidade: 8 }),
      saldo({ idEstoque: 'est-obra', estoque: 'OBRA 1', tipoEstoque: 'OBRA', idObra: 'o1', obra: '3101' })
    ]
  };
}

function solicitacao(i: number, extra: Partial<SolicitacaoDoPainel>): SolicitacaoDoPainel {
  return {
    id: `s${i}`, contexto: 'COMERCIAL', status: 'ENTREGUE', etapa: 'CONCLUIDO', macroEtapa: 'ENTREGA', tipoTecnico: null, tipoObra: null, ocorrencia: null,
    idObra: null, numeroObra: null, statusSeparacao: null, dataSolicitacao: '2026-10-01T09:00:00-03:00', dataVerificacao: '2026-10-01T19:00:00-03:00',
    dataEntrega: '2026-10-02T10:00:00-03:00', dataPrevista: '2026-10-03', separacaoIniciadaEm: null, separacaoConcluidaEm: null, encerradaEm: null,
    estoqueOrigem: 'ALMOX', estoqueDestino: 'EQ', idAlmoxarifado: ALM, almoxarifado: 'ALMOX', idEquipe: 'eq-1', equipe: 'EQ 1', baseOperacional: 'Juazeiro',
    processo: 'Comercial', motivoRejeicao: null, possuiPendencia: false, motivosPendencia: null, foraPrazoSaque: false, saqueForaEquipe: false, temReserva: false,
    itens: 2, quantidadeSolicitada: 10, quantidadeAtendida: 10, anteriorAoPeriodo: false, idBaseOperacional: 'b1', idProcesso: 'p1', ...extra
  };
}

function solicitacoes(): PainelSolicitacoesResponse {
  const l: SolicitacaoDoPainel[] = [];
  for (let i = 0; i < 12; i++) l.push(solicitacao(i, {}));
  l.push(solicitacao(20, { etapa: 'PENDENTE_RETIRADA', status: 'APROVADO', dataEntrega: null, dataPrevista: '2026-10-05', quantidadeAtendida: 0 }));
  l.push(solicitacao(21, { etapa: 'PENDENTE_RETIRADA', status: 'ENTREGUE_PARCIAL', dataEntrega: null, dataPrevista: '2026-10-05', quantidadeAtendida: 4 }));
  l.push(solicitacao(22, { contexto: 'TECNICO', tipoTecnico: '221', etapa: 'PRONTO_PARA_SEPARACAO', status: 'APROVADO', idObra: 'o1', numeroObra: '3101', dataEntrega: null }));
  for (let i = 0; i < 6; i++) l.push(solicitacao(30 + i, { contexto: 'TECNICO', tipoTecnico: '221', idObra: 'o1', numeroObra: '3101' }));
  for (let i = 0; i < 3; i++) l.push(solicitacao(40 + i, { contexto: 'TECNICO', tipoTecnico: '222', idObra: 'o1', numeroObra: '3101' }));
  return { geradoEm: '2026-11-10T12:00:00-03:00', inicio: '2026-09-01T03:00:00Z', fim: '2026-11-11T02:59:59Z', limite: 5000, truncado: false, solicitacoes: l, materiais: [], periodoAnterior: [] };
}

function fech(i: number, extra: Partial<FechamentoRelatorio>): FechamentoRelatorio {
  return {
    id: `f${i}`, tipo: '221', idObra: 'o1', numeroObra: '3101', tituloObra: 'Extensão', tipoObra: 'OBRA', situacao: 'MOVIMENTADA', situacaoObra: 'PARCIAL',
    situacaoPrazo: 'CUMPRIDO', prazoVigenteAte: '2026-10-05T10:00:00-03:00', criadaEm: '2026-10-01T10:00:00-03:00', prazoReservaAte: '2026-10-03T10:00:00-03:00',
    reservaCumpridaEm: '2026-10-02T10:00:00-03:00', prazoMovimentacaoAte: '2026-10-06T10:00:00-03:00', movimentacaoConcluidaEm: '2026-10-04T10:00:00-03:00',
    canceladaEm: null, numeroReserva: '123', possuiPendencia: false, motivoPendencia: null, idSolicitante: 'u1', solicitante: 'Ana', idEncarregado: null,
    encarregado: null, idSupervisor: 'sup1', supervisor: 'Bruno', idCoordenador: null, coordenador: null, idAlmoxarifado: ALM, almoxarifado: 'ALMOX',
    itens: 2, quantidadeSolicitada: 10, quantidadeMovimentada: 10, anteriorAoPeriodo: false, ...extra
  };
}

function fechamento(): FechamentoRelatorioResponse {
  const l = [fech(1, {}), fech(2, {}), fech(3, { reservaCumpridaEm: '2026-10-08T10:00:00-03:00', prazoMovimentacaoAte: '2026-10-10T10:00:00-03:00', movimentacaoConcluidaEm: '2026-10-09T10:00:00-03:00' }),
    fech(4, { situacao: 'AGUARDANDO_MOVIMENTACAO', situacaoPrazo: 'ATRASADO', movimentacaoConcluidaEm: null, possuiPendencia: true, motivoPendencia: 'Sem saldo' }),
    fech(5, { situacao: 'AGUARDANDO_RESERVA', situacaoPrazo: 'VENCE_EM_BREVE', reservaCumpridaEm: null, prazoMovimentacaoAte: null, movimentacaoConcluidaEm: null }),
    fech(6, { situacao: 'CANCELADA', situacaoPrazo: null, canceladaEm: '2026-10-01T12:00:00-03:00', reservaCumpridaEm: null, prazoMovimentacaoAte: null, movimentacaoConcluidaEm: null })];
  return { geradoEm: '2026-11-10T12:00:00-03:00', de: '2026-09-01', ate: '2026-11-10', solicitacoes: l };
}

const todos = () => true;

describe('regras comuns', () => {
  it('classifica a movimentação pelo almoxarifado', () => {
    const m = movimentacoes().movimentacoes;
    expect(sentido(m[0])).toBe('saida');
    expect(natureza(m[0])).toBe('atendimento');
    expect(natureza(m.find((x) => x.tipo === 'ESTORNO')!)).toBe('retorno');
    expect(natureza(m.find((x) => x.tipo === 'APLICACAO')!)).toBe('aplicacao');
    expect(natureza(m.find((x) => x.tipo === 'ENTRADA_AVULSA')!)).toBe('abastecimento');
    expect(natureza(m.find((x) => x.tipo === 'BAIXA_AVULSA')!)).toBe('baixa');
  });

  it('não deixa devolução de material antigo passar de 100% de retorno', () => {
    const l = movimentacoes().movimentacoes.filter((m) => !m.anterior && m.idEquipe === 'eq-2');
    expect(taxaRetornoDe(l)).toBe(1);
  });

  it('escolhe o eixo pelo tamanho do período', () => {
    expect(eixoDoPeriodo('2026-10-01', '2026-10-30').unidade).toBe('dia');
    expect(eixoDoPeriodo('2026-08-01', '2026-11-10').unidade).toBe('semana');
    expect(rotuloSemana('2026-09-01')).toBe('01 a 07/09');
    expect(rotuloSemana('2026-09-29')).toBe('29/09 a 05/10');
    expect(eixoDoPeriodo('2026-01-01', '2026-11-10').unidade).toBe('mes');
  });

  it('prioriza o que pede ação', () => {
    const l = priorizar([{ tom: 'info' as const }, { tom: 'danger' as const }, { tom: 'warning' as const }]);
    expect(l.map((x) => x.tom)).toEqual(['danger', 'warning', 'info']);
  });
});

describe('movimentações', () => {
  const m = modeloMov(movimentacoes(), todos);

  it('separa período e anterior e acha perdas, ajustes e o balcão fora do horário', () => {
    expect(m.operacoesAnt).toBe(1);
    expect(m.perdas).toHaveLength(1);
    expect(m.ajustes).toHaveLength(2);
    expect(m.avulsasSemMotivo).toHaveLength(1);
    expect(m.foraDoHorario).toHaveLength(1);
  });

  it('aponta o ajuste repetido pelo material', () => {
    const l = visaoMov(m).leituras;
    expect(l.find((x) => x.id === 'ajustes')?.valor).toContain('300010');
    expect(l[0].tom).toBe('danger');
  });

  it('abre todas as análises', () => {
    const alvos = [['kpi', 'operacoes'], ['kpi', 'estornos'], ['kpi', 'perdas'], ['kpi', 'fora-horario'], ['kpi', 'materiais'], ['natureza', 'atendimento'],
      ['tipo', 'ENTREGA'], ['periodo', m.serie.find((s) => s.total)!.chave], ['almox', ALM], ['operador', 'u1'], ['equipe', 'eq-1'],
      ['motivo', 'AJUSTE_INVENTARIO'], ['material', 'mat-1'], ['hora', '13'], ['semana', '4']];
    for (const [dimension, value] of alvos) expect(vistaMov({ dimension, value }, m), `${dimension}:${value}`).not.toBeNull();
  });
});

describe('estoque', () => {
  const comFalta = movimentacoes();
  // Material que saiu para equipe e não tem mais saldo no almoxarifado.
  comFalta.movimentacoes.push(mov('ENTREGA', ALM, 'FISICO', 'est-eq-1', 'CAMPO', { idMaterial: 'mat-3', codigo: '300040', descricao: 'ELO FUSIVEL' }));
  const m = modeloEstoque(estoque(), comFalta, todos, todos, []);

  it('classifica cobertura, parado, ruptura e o que está com equipes e obras', () => {
    expect(m.porFaixa.parado.map((p) => p.codigo)).toEqual(['300900']);
    expect(m.porFaixa.ruptura.map((p) => p.codigo)).toEqual(['300040']);
    expect(m.campoEsquecido).toHaveLength(1);
    expect(m.sucataCampo).toHaveLength(1);
    expect(m.porObra).toHaveLength(1);
    expect(visaoEstoque(m).leituras[0].id).toBe('ruptura');
  });

  it('abre todas as análises', () => {
    const p = m.almox[0];
    const alvos = [['faixa', 'parado'], ['faixa', 'ruptura'], ['kpi', 'campo'], ['kpi', 'campo-esquecido'], ['kpi', 'sucata-campo'], ['kpi', 'obras'], ['kpi', 'itens'],
      ['kpi', 'series'], ['almox', ALM], ['equipe', 'est-eq-3'], ['obra', 'est-obra'], ['posicao', p.chave], ['material', 'mat-1']];
    for (const [dimension, value] of alvos) expect(vistaEstoque({ dimension, value }, m), `${dimension}:${value}`).not.toBeNull();
  });
});

describe('consumo', () => {
  const m = modeloConsumo(movimentacoes(), todos);

  it('acha a equipe fora da curva e a sucata que não volta', () => {
    expect(m.foraDaCurva.map((f) => f.idEquipe)).toEqual(['eq-4']);
    expect(m.abc.A.length).toBeGreaterThan(0);
    const leituras = visaoConsumo(m).leituras;
    expect(leituras.some((l) => l.id === 'fora-curva')).toBe(true);
    expect(leituras.some((l) => l.id === 'sucata')).toBe(true);
  });

  it('abre todas as análises', () => {
    const alvos = [['material', 'mat-1'], ['equipe', 'eq-4'], ['abc', 'A'], ['processo', 'p1'], ['base', 'b1'], ['kpi', 'fora-curva'], ['kpi', 'saidas'],
      ['periodo', m.serie.find((s) => s.saidas)!.chave]];
    for (const [dimension, value] of alvos) expect(vistaConsumo({ dimension, value }, m), `${dimension}:${value}`).not.toBeNull();
  });
});

describe('fechamento', () => {
  const m = modeloFechamento(fechamento(), todos);

  it('mede os prazos de reserva e movimentação', () => {
    expect(m.reserva.total).toBe(4);
    expect(m.reserva.atrasados).toBe(1);
    expect(m.movimentacao.total).toBe(3);
    expect(m.atrasadas).toHaveLength(1);
    expect(m.venceEmBreve).toHaveLength(1);
    expect(visaoFechamento(m).leituras[0].id).toBe('atrasadas');
  });

  it('abre todas as análises', () => {
    const alvos = [['kpi', 'periodo'], ['kpi', 'abertas'], ['kpi', 'atrasadas'], ['kpi', 'pendencias'], ['kpi', 'reserva'], ['kpi', 'movimentacao'], ['kpi', 'obras'],
      ['situacao', 'MOVIMENTADA'], ['prazo', 'ATRASADO'], ['tipo', '221'], ['obra', 'o1'], ['supervisor', 'sup1'], ['solicitante', 'u1'], ['almox', ALM], ['mes', '2026-10-01']];
    for (const [dimension, value] of alvos) expect(vistaFechamento({ dimension, value }, m), `${dimension}:${value}`).not.toBeNull();
  });
});

describe('solicitações', () => {
  it('separa pedido não retirado de entrega parcial', () => {
    const r = recortar(solicitacoes(), 'COMERCIAL');
    const ids = visaoDoProcesso(r, 'COMERCIAL').leituras.map((l) => l.id);
    expect(ids).toContain('nao-retiradas');
    expect(ids).toContain('saldo-pendente');
  });

  it('acha a obra que devolve demais no técnico', () => {
    const r = recortar(solicitacoes(), 'TECNICO');
    expect(visaoDoProcesso(r, 'TECNICO').leituras.map((l) => l.id)).toContain('obra-devolve');
  });
});

describe('visão geral', () => {
  it('junta as áreas, leva as ações ao relatório da área e lista o que pede ação', () => {
    const g = modeloGeral({ mov: movimentacoes(), estoque: estoque(), solicitacoes: solicitacoes(), fechamento: fechamento() }, todos, undefined);
    expect(g.leituras.every((l) => !l.acao || l.acao.alvo.dimension === 'ir')).toBe(true);
    expect(g.pendencias.some((p) => p.area === 'fechamento')).toBe(true);
    expect(g.pendencias.some((p) => p.area === 'estoque')).toBe(true);
    expect(vereditoGeral(g).tom).toBe('danger');
  });

  it('funciona sem as áreas que o perfil não lê', () => {
    const g = modeloGeral({ mov: null, estoque: null, solicitacoes: solicitacoes(), fechamento: null }, todos, undefined);
    expect(g.mov).toBeNull();
    expect(g.estoque).toBeNull();
    expect(vereditoGeral(g).texto).not.toContain('falta');
  });
});
