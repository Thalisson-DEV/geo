import { describe, expect, it } from 'vitest';

import { Chamado } from '../../../core/models/chamado.models';
import {
  FilaAgora,
  LinhaChamado,
  contarMotivos,
  duracao,
  filtroFila,
  graficoFluxo,
  graficoIdade,
  graficoPrioridade,
  graficoRanking,
  graficoStatus,
  intervaloDoBalde,
  linhaChamado,
  motivoPrincipal,
  motivosDoChamado,
  naFaixa,
  noRecorte,
  parametrosFila,
  pedeAcao,
  periodoPadrao,
  prazoRelativo,
  ranking,
  recorteDosFiltros,
  situacaoSla,
  statusAbertosDoRecorte,
  temFiltroMultiplo,
  variacaoTexto,
  visaoGerencial
} from './analise-chamados';
import { AGORA, H, chamado, iso, resposta } from './analise-chamados.testing';

const nome = (id: string) => ({ u1: 'Ana', u2: 'Bruno' } as Record<string, string>)[id] ?? 'Atribuído';
const linha = (p: Partial<Chamado> = {}) => linhaChamado(chamado(p), AGORA, nome);

describe('formatação', () => {
  it('lê durações em minutos, horas e dias', () => {
    expect(duracao(0.5)).toBe('30 min');
    expect(duracao(6.5)).toBe('6,5 h');
    expect(duracao(72)).toBe('3 dias');
    expect(duracao(null)).toBe('—');
  });

  it('só compara com o período anterior quando há base', () => {
    expect(variacaoTexto({ valor: 20, anterior: 10, variacaoPercentual: 100, status: '', definicao: '' })).toBe('+100% sobre o período anterior');
    expect(variacaoTexto({ valor: 20, anterior: 0, variacaoPercentual: 0, status: '', definicao: '' })).toBeNull();
    expect(variacaoTexto(undefined)).toBeNull();
  });
});

describe('o que pede ação', () => {
  it('não marca chamado em dia', () => {
    expect(motivosDoChamado(chamado(), AGORA)).toEqual([]);
  });

  it('identifica SLA estourado, 1ª resposta vencida, sem responsável e parado', () => {
    const m = motivosDoChamado(chamado({
      slaResolucaoVencido: true, slaPrimeiraRespostaVencido: true, dataPrimeiraResposta: null,
      usuarioResponsavelId: null, dataUltimaInteracao: iso(-24 * 4), dataLimiteResolucao: iso(-5)
    }), AGORA);
    expect(m).toEqual(['sla-vencido', 'resposta-vencida', 'sem-responsavel', 'parado']);
  });

  it('marca o que vence nas próximas 24 horas, exceto com SLA pausado', () => {
    expect(motivosDoChamado(chamado({ dataLimiteResolucao: iso(5) }), AGORA)).toEqual(['a-vencer']);
    expect(motivosDoChamado(chamado({ dataLimiteResolucao: iso(5), slaPausado: true }), AGORA)).toEqual([]);
  });

  it('ignora chamados encerrados', () => {
    expect(motivosDoChamado(chamado({ status: 'RESOLVIDO', slaResolucaoVencido: true, usuarioResponsavelId: null }), AGORA)).toEqual([]);
  });

  it('ordena do mais grave para o mais leve, depois prioridade e prazo', () => {
    const lista = pedeAcao([
      linha({ id: 'parado', dataUltimaInteracao: iso(-100) }),
      linha({ id: 'sla-normal', slaResolucaoVencido: true, dataLimiteResolucao: iso(-1) }),
      linha({ id: 'sla-critico', slaResolucaoVencido: true, prioridade: 'CRITICA', dataLimiteResolucao: iso(-1) }),
      linha({ id: 'ok' }),
      linha({ id: 'sem-resp', usuarioResponsavelId: null })
    ]);
    expect(lista.map((l) => l.id)).toEqual(['sla-critico', 'sla-normal', 'sem-resp', 'parado']);
    expect(motivoPrincipal(lista[0])).toBe('sla-vencido');
  });

  it('conta cada motivo e descreve o prazo', () => {
    const linhas = [linha({ usuarioResponsavelId: null }), linha({ usuarioResponsavelId: null, dataLimiteResolucao: iso(3) })];
    expect(contarMotivos(linhas)['sem-responsavel']).toBe(2);
    expect(contarMotivos(linhas)['a-vencer']).toBe(1);
    expect(prazoRelativo(linhas[1])).toBe('vence em 3 h');
    expect(prazoRelativo(linha({ dataLimiteResolucao: iso(-72), slaResolucaoVencido: true }))).toBe('venceu há 3 dias');
  });

  it('resolve o nome do responsável e a situação do SLA', () => {
    expect(linha().responsavel).toBe('Ana');
    expect(linha({ usuarioResponsavelId: null }).responsavel).toBe('Sem responsável');
    expect(situacaoSla(linha({ slaResolucaoVencido: true })).tom).toBe('danger');
    expect(situacaoSla(linha({ status: 'FECHADO' })).texto).toBe('Concluído no prazo');
  });
});

describe('recorte', () => {
  it('converte os filtros do painel na consulta do dashboard', () => {
    const r = recorteDosFiltros({ periodo: { from: '2026-11-01', to: '2026-11-12' }, topico: ['t1'], equipe: [], prioridade: ['ALTA'], status: [], sla: true });
    expect(r.inicio?.startsWith('2026-11-01T00:00:00.000')).toBe(true);
    expect(r.fim?.startsWith('2026-11-12T23:59:59.999')).toBe(true);
    expect(r.topicoId).toEqual(['t1']);
    expect(r.prioridade).toEqual(['ALTA']);
    expect(r.slaVencido).toBe(true);
    expect('slaVencido' in recorteDosFiltros({ periodo: { from: null, to: null }, topico: [], equipe: [], prioridade: [], status: [], sla: null })).toBe(false);
  });

  it('período padrão vai do dia 1º até hoje', () => {
    expect(periodoPadrao(new Date(2026, 10, 12))).toEqual({ from: '2026-11-01', to: '2026-11-12' });
  });

  it('aplica filtros múltiplos na tela e únicos na fila', () => {
    const f = { inicio: '2026-11-01T00:00:00.000-03:00', fim: '2026-11-12T23:59:59.999-03:00', topicoId: ['t1', 't2'], equipeId: ['e1'], prioridade: [], status: [] };
    expect(temFiltroMultiplo(f)).toBe(true);
    expect(noRecorte(linha({ topico: { id: 't2', nome: 'X' } as Chamado['topico'] }), f)).toBe(true);
    expect(noRecorte(linha({ topico: { id: 't3', nome: 'X' } as Chamado['topico'] }), f)).toBe(false);
    expect(filtroFila(f, { status: 'ABERTO' })).toEqual({
      dataAberturaInicio: f.inicio, dataAberturaFim: f.fim, equipeId: 'e1', ativo: true, status: 'ABERTO'
    });
    expect(filtroFila(f, {}, false).dataAberturaInicio).toBeUndefined();
  });

  it('monta a URL da fila com os parâmetros que ela entende', () => {
    const f = { inicio: '2026-11-01T00:00:00.000-03:00', fim: '2026-11-12T23:59:59.999-03:00', topicoId: ['t1'], equipeId: ['e1', 'e2'], slaVencido: true };
    expect(parametrosFila(f, { status: 'RESOLVIDO' })).toEqual({ abertura: '2026-11-01~2026-11-12', topico: 't1', resolucao: 'true', status: 'RESOLVIDO' });
    expect(parametrosFila(f, {}, false)).toEqual({ topico: 't1', resolucao: 'true' });
  });

  it('consulta só os status abertos pedidos', () => {
    expect(statusAbertosDoRecorte({})).toEqual(['ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE']);
    expect(statusAbertosDoRecorte({ status: ['ABERTO', 'RESOLVIDO'] })).toEqual(['ABERTO']);
    expect(statusAbertosDoRecorte({ status: ['FECHADO'] })).toEqual([]);
  });

  it('encontra o intervalo de um dia da série e a faixa de idade', () => {
    const intervalo = intervaloDoBalde(resposta(), '2026-11-02')!;
    expect(Date.parse(intervalo.fim) - Date.parse(intervalo.inicio)).toBe(24 * H - 1);
    expect(intervaloDoBalde(resposta(), 'nao-existe')).toBeNull();
    const l = linha({ dataAbertura: iso(-50) });
    expect(naFaixa(l, '1-3d', AGORA)).toBe(true);
    expect(naFaixa(l, '<24h', AGORA)).toBe(false);
  });
});

describe('gráficos', () => {
  const d = resposta();

  it('fluxo tem abertos, resolvidos e estourados com a chave de cada período', () => {
    const g = graficoFluxo(d);
    expect(g.rotulos).toEqual(['01/11', '02/11']);
    expect(g.series.map((s) => s.values)).toEqual([[3, 5], [2, 4], [1, 0]]);
    expect(g.chaves).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('status omite os vazios e mantém a ordem do fluxo', () => {
    const g = graficoStatus(resposta({ totalPorStatus: { ABERTO: 1, EM_ATENDIMENTO: 0, AGUARDANDO_SOLICITANTE: 0, RESOLVIDO: 3, FECHADO: 0, CANCELADO: 0 } }));
    expect(g.chaves).toEqual(['ABERTO', 'RESOLVIDO']);
    expect(g.series[0].values).toEqual([1, 3]);
  });

  it('idade empilha por prioridade, da crítica para a baixa', () => {
    const g = graficoIdade(d);
    expect(g.series.map((s) => s.name)).toEqual(['Crítica', 'Alta', 'Normal', 'Baixa']);
    expect(g.series[0].values).toEqual([0, 1]);
  });

  it('prioridade compara com o período anterior', () => {
    const g = graficoPrioridade(d);
    expect(g.chaves).toEqual(['CRITICA', 'ALTA', 'NORMAL', 'BAIXA']);
    expect(g.series[1].values).toEqual([0, 1, 6, 3]);
  });

  it('ranking soma resolvidos, em aberto e cancelados ao total', () => {
    const linhas = ranking(d, 'equipe');
    expect(linhas[0]).toMatchObject({ chave: 'e1', total: 14, resolvidos: 9, pendentes: 4, outros: 1, sla: 70 });
    const g = graficoRanking(linhas);
    expect(g.series.map((s) => s.values[0]).reduce((a, b) => a + b)).toBe(14);
    expect(ranking(d, 'atendente')[0].participacao).toBe(50);
  });
});

describe('visão gerencial', () => {
  const d = resposta();

  it('pede ação agora quando há SLA estourado na fila', () => {
    const fila: FilaAgora = { linhas: [linha({ slaResolucaoVencido: true, dataLimiteResolucao: iso(-10) }), linha({ id: 'c2' })], truncado: false };
    const v = visaoGerencial(d, fila);
    expect(v.veredito.tom).toBe('danger');
    expect(v.veredito.titulo).toBe('1 chamado fora do prazo na fila');
    expect(v.veredito.progresso?.marcador).toBe(85);
    expect(v.leituras[0]).toMatchObject({ id: 'sla-vencido', acao: { alvo: { dimension: 'motivo', value: 'sla-vencido' } } });
    expect(v.leituras.length).toBeLessThanOrEqual(6);
    expect(v.leituras.every((l) => !!l.acao)).toBe(true);
  });

  it('aponta a equipe com o pior SLA e o SLA em queda', () => {
    const v = visaoGerencial(d, { linhas: [], truncado: false });
    expect(v.leituras.find((l) => l.id === 'equipe-sla')).toMatchObject({ valor: 'Suporte', acao: { alvo: { dimension: 'equipe', value: 'e1' } } });
    expect(v.leituras.find((l) => l.id === 'sla-tendencia')?.titulo).toBe('SLA piorou');
  });

  it('fica sob controle sem pendências', () => {
    const v = visaoGerencial(resposta({ desempenhoPorEquipe: [], taxaReabertura: 0, indicadores: {} }), { linhas: [linha()], truncado: false });
    expect(v.veredito.tom).toBe('success');
    expect(v.veredito.titulo).toBe('Atendimento em dia');
  });

  it('sem a fila lida usa os números do backend e não oferece lista', () => {
    const v = visaoGerencial(d, null);
    const sem = v.leituras.find((l) => l.id === 'sem-responsavel');
    expect(sem?.valor).toBe('2 chamados');
    expect(sem?.acao).toBeUndefined();
  });

  it('recorte vazio diz que não há movimento', () => {
    const v = visaoGerencial(resposta({ totalChamados: 0, totalPendentes: 0 }), { linhas: [] as LinhaChamado[], truncado: false });
    expect(v.veredito.tom).toBe('neutral');
  });
});
