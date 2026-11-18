import { Chamado } from '../../../core/models/chamado.models';
import { DashboardChamadosResponse } from '../../../core/models/chamado-dashboard.models';

/** Dados de teste do Dashboard de Chamados (usados pelas specs da pasta). */

export const AGORA = Date.parse('2026-11-12T12:00:00Z');
export const H = 3_600_000;
export const iso = (deslocamentoHoras: number) => new Date(AGORA + deslocamentoHoras * H).toISOString();

export function chamado(parcial: Partial<Chamado> = {}): Chamado {
  return {
    id: 'c1',
    protocolo: 'CH-1',
    topico: { id: 't1', nome: 'Rede' } as Chamado['topico'],
    equipeAtendimento: { id: 'e1', nome: 'Suporte' } as Chamado['equipeAtendimento'],
    assunto: 'Sem acesso',
    descricao: '',
    prioridade: 'NORMAL',
    status: 'EM_ATENDIMENTO',
    usuarioSolicitanteId: 's1',
    usuarioResponsavelId: 'u1',
    dataAbertura: iso(-30),
    dataLimitePrimeiraResposta: iso(-26),
    dataLimiteResolucao: iso(48),
    pausarSlaAguardandoSolicitante: false,
    prazoReaberturaHoras: 72,
    dataPrimeiraResposta: iso(-29),
    totalSegundosPausaSla: 0,
    dataUltimaInteracao: iso(-2),
    slaPrimeiraRespostaVencido: false,
    slaResolucaoVencido: false,
    slaPausado: false,
    anexos: [],
    dataCriacao: iso(-30),
    ...parcial
  };
}


export function resposta(parcial: Partial<DashboardChamadosResponse> = {}): DashboardChamadosResponse {
  return {
    inicio: '2026-11-01T03:00:00Z',
    fim: '2026-11-13T02:59:59Z',
    atualizadoEm: '2026-11-12T12:00:00Z',
    periodo: { inicio: '2026-11-01T03:00:00Z', fim: '2026-11-13T02:59:59Z', timezone: 'America/Sao_Paulo', comparacaoInicio: '2026-10-20T03:00:00Z', comparacaoFim: '2026-11-01T02:59:59Z' },
    qualidadeDados: { ultimaCargaEm: '', chamadosSemResponsavel: 2, chamadosComSlaPausado: 0, chamadosEstagnadosSemInteracao: 1, coberturaResponsavelPercentual: 80 },
    indicadores: {
      totalChamados: { valor: 20, anterior: 10, variacaoPercentual: 100, status: 'SEM_META', definicao: '' },
      taxaSlaResolucao: { valor: 80, anterior: 90, variacaoPercentual: -11.1, meta: 85, status: 'FORA_META', definicao: '' }
    },
    totalChamados: 20, totalAbertos: 3, totalEmAtendimento: 2, totalAguardandoSolicitante: 1, totalResolvidos: 10, totalFechados: 2,
    totalCancelados: 2, totalPendentes: 6, totalCriticos: 3, totalReabertos: 1,
    taxaReabertura: 8.3, taxaResolucao: 60, taxaSlaPrimeiraRespostaPercentual: 90, taxaSlaResolucaoPercentual: 80,
    tempoMedianoPrimeiraRespostaHoras: 1.5, tempoP90PrimeiraRespostaHoras: 4, tempoMedianoResolucaoHoras: 10, tempoP90ResolucaoHoras: 30, tempoMedioResolucaoHoras: 12,
    totalPrimeiraRespostaNoPrazo: 18, totalPrimeiraRespostaVencida: 2, totalResolucaoNoPrazo: 12, totalResolucaoVencida: 3,
    totalPorStatus: { ABERTO: 3, EM_ATENDIMENTO: 2, AGUARDANDO_SOLICITANTE: 1, RESOLVIDO: 10, FECHADO: 2, CANCELADO: 2 },
    totalPorPrioridade: { BAIXA: 5, NORMAL: 12, ALTA: 2, CRITICA: 1 },
    volumePorPrioridade: [
      { prioridade: 'BAIXA', total: 5, anterior: 3, variacaoPercentual: 66.7, percentual: 25 },
      { prioridade: 'NORMAL', total: 12, anterior: 6, variacaoPercentual: 100, percentual: 60 },
      { prioridade: 'ALTA', total: 2, anterior: 1, variacaoPercentual: 100, percentual: 10 },
      { prioridade: 'CRITICA', total: 1, anterior: 0, variacaoPercentual: 0, percentual: 5 }
    ],
    backlogPorIdade: [
      { faixa: '<24h', rotulo: 'Até 24 horas', total: 2, percentual: 33, porPrioridade: { BAIXA: 1, NORMAL: 1, ALTA: 0, CRITICA: 0 } },
      { faixa: '1-3d', rotulo: '1 a 3 dias', total: 4, percentual: 67, porPrioridade: { BAIXA: 0, NORMAL: 2, ALTA: 1, CRITICA: 1 } }
    ],
    desempenhoPorTopico: [
      { id: 't1', codigo: 'RED', nome: 'Rede', totalChamados: 12, resolvidos: 8, pendentes: 3, taxaSlaCumprido: 75, tempoMedianoResolucaoHoras: 9, reabertos: 1, participacaoPercentual: 60 },
      { id: 't2', codigo: 'SIS', nome: 'Sistemas', totalChamados: 8, resolvidos: 4, pendentes: 3, taxaSlaCumprido: 100, tempoMedianoResolucaoHoras: 4, reabertos: 0, participacaoPercentual: 40 }
    ],
    desempenhoPorEquipe: [
      { id: 'e1', codigo: 'SUP', nome: 'Suporte', totalChamados: 14, resolvidos: 9, pendentes: 4, taxaSlaPrimeiraResposta: 90, taxaSlaResolucao: 70, tempoMedianoResolucaoHoras: 11, participacaoPercentual: 70 },
      { id: 'e2', codigo: 'INF', nome: 'Infra', totalChamados: 6, resolvidos: 3, pendentes: 2, taxaSlaPrimeiraResposta: 100, taxaSlaResolucao: 100, tempoMedianoResolucaoHoras: 5, participacaoPercentual: 30 }
    ],
    desempenhoPorAtendente: [
      { id: 'u1', nome: 'Ana', equipe: 'Suporte', totalChamados: 10, resolvidos: 7, pendentes: 3, taxaSlaResolucao: 85, tempoMedianoResolucaoHoras: 8 }
    ],
    rankingSolicitantes: [{ id: 's1', nome: 'Carla', totalChamados: 5, participacaoPercentual: 25 }],
    prioridades: [],
    granularidade: 'DIA',
    serieTemporal: [
      { chave: '2026-11-01', rotulo: '01/11', data: '2026-11-01', totalAbertos: 3, totalResolvidos: 2, totalVencidos: 1 },
      { chave: '2026-11-02', rotulo: '02/11', data: '2026-11-02', totalAbertos: 5, totalResolvidos: 4, totalVencidos: 0 }
    ],
    ...parcial
  };
}
