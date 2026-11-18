/**
 * Relatórios gerenciais da frota (`GET /v1/frota/relatorios/gerencial`). Cada seção vem nula para
 * quem não lê o assunto; `partesOmitidas` diz o que ficou fora do custo total. Percentuais e
 * proporções vêm como fração (0,95 = 95%).
 */

export interface FiltroRelatorioFrota {
  de?: string | null;
  ate?: string | null;
  idBase?: string[];
  idProcesso?: string[];
  idTipoVeiculo?: string[];
  regime?: string[];
  situacao?: string[];
  idVeiculo?: string[];
}

/** Valor no período e no período anterior de mesma duração. */
export interface IndicadorFrota {
  atual: number | null;
  anterior: number | null;
}

export interface ContagemFrota {
  chave: string;
  rotulo: string;
  total: number;
}

export interface RelatorioGerencialFrota {
  periodo: {
    de: string;
    ate: string;
    anteriorDe: string;
    anteriorAte: string;
    dias: number;
    diasUteis: number;
    calculadoEm: string;
  };
  recorte: { veiculos: number; emOperacao: number; baixados: number; locados: number };
  partesOmitidas: string[];
  resumo: {
    custoTotal: IndicadorFrota;
    custoPorKm: IndicadorFrota;
    custoVeiculoMes: IndicadorFrota;
    km: IndicadorFrota;
    disponibilidade: IndicadorFrota | null;
    percentualPreventiva: IndicadorFrota | null;
    custoSobreFaturamento: IndicadorFrota;
    aguardandoFinanceiro: number;
  };
  custos: CustosFrota;
  manutencao: ManutencaoFrota | null;
  combustivel: CombustivelFrota | null;
  uso: UsoFrota;
  conformidade: ConformidadeFrota;
  veiculos: VeiculoRelatorioFrota[];
}

export interface GrupoCustoFrota {
  id: string | null;
  nome: string;
  veiculos: number;
  valor: number;
  km: number;
  custoPorKm: number | null;
}

export interface CustosFrota {
  porCategoria: { categoria: string; rotulo: string; valor: number; anterior: number }[];
  mensal: {
    mes: string;
    manutencao: number;
    combustivel: number;
    despesas: number;
    seguro: number;
    locacao: number;
    franquias: number;
    total: number;
    km: number;
  }[];
  porBase: GrupoCustoFrota[];
  porTipo: GrupoCustoFrota[];
  porRegime: GrupoCustoFrota[];
  porProcesso: GrupoCustoFrota[];
  despesasPorTipo: GrupoCustoFrota[] | null;
}

export interface OsFilaFrota {
  idOs: string;
  numero: number | null;
  idVeiculo: string;
  placa: string;
  situacao: string;
  criticidade: string;
  tipoManutencao: string;
  abertaEm: string;
  diasAberta: number;
  atrasada: boolean;
  veiculoParado: boolean;
}

export interface ManutencaoFrota {
  osConcluidas: IndicadorFrota;
  corretivas: number;
  preventivas: number;
  valor: IndicadorFrota;
  percentualPreventiva: IndicadorFrota;
  mttrHoras: IndicadorFrota;
  mtbfDias: IndicadorFrota;
  disponibilidade: IndicadorFrota;
  fila: { total: number; ate7Dias: number; de8a30Dias: number; acima30Dias: number; atrasadas: number; comVeiculoParado: number };
  filaMaisAntiga: OsFilaFrota[];
  paradosAgora: {
    idVeiculo: string;
    placa: string;
    idOs: string;
    numeroOs: number | null;
    desde: string;
    dias: number;
    descricao: string | null;
  }[];
  porOrigem: ContagemFrota[];
  porCausa: ContagemFrota[];
  porOficina: { nome: string; os: number; valor: number; horasMedias: number | null }[];
  retrabalho: {
    idOs: string;
    numero: number | null;
    idVeiculo: string;
    placa: string;
    item: string;
    numeroAnterior: number | null;
    dias: number;
  }[];
  preventivasVencidas: number;
  preventivasProximas: number;
  mensal: { mes: string; corretivas: number; preventivas: number; valor: number }[];
}

export interface CombustivelFrota {
  litros: IndicadorFrota;
  valor: IndicadorFrota;
  precoMedio: IndicadorFrota;
  kmPorLitro: IndicadorFrota;
  abastecimentos: number;
  veiculosForaDoPadrao: number;
  porProduto: { nome: string; categoria: string; quantidade: number; valor: number }[];
  porPosto: { idPosto: string; nome: string; abastecimentos: number; litros: number; valor: number; precoMedio: number | null }[];
  alertas: ContagemFrota[];
  mensal: { mes: string; litros: number; valor: number; precoMedio: number | null }[];
}

export interface VeiculoRefFrota {
  idVeiculo: string;
  placa: string;
  base: string | null;
  tipo: string | null;
  situacao: string;
}

export interface UsoFrota {
  km: IndicadorFrota;
  veiculosComKm: number;
  ociosos: VeiculoRefFrota[];
  turnos: number;
  notas: number;
  faturado: IndicadorFrota;
  custoSobreFaturamento: IndicadorFrota;
  comTelemetria: boolean;
  horasLigadoParado: number | null;
  kmForaExpediente: number | null;
  mensal: { mes: string; km: number }[];
}

export interface ConformidadeFrota {
  coberturaChecklist: IndicadorFrota | null;
  veiculosChecklistAbaixoMeta: number;
  pendenciasAbertas: number;
  documentosVencidos: number;
  documentosAVencer: number;
  documentos: {
    id: string;
    idVeiculo: string;
    placa: string;
    tipo: string;
    descricao: string | null;
    vencimento: string;
    vencido: boolean;
  }[];
  cnhVencidas: number;
  cnhAVencer: number;
  cnh: { idCondutor: string; idColaborador: string; nome: string; categoria: string | null; validade: string; vencida: boolean }[];
  semSeguro: VeiculoRefFrota[] | null;
  apolicesVencendo: { id: string; numero: string; seguradora: string | null; vigenciaFim: string; veiculos: number }[] | null;
  sinistros: {
    total: IndicadorFrota;
    comCulpaDoCondutor: number;
    franquias: number;
    porTipo: ContagemFrota[];
    lista: {
      id: string;
      numero: number | null;
      idVeiculo: string;
      placa: string;
      tipo: string;
      situacao: string;
      culpaCondutor: boolean | null;
      franquia: number | null;
      ocorridoEm: string;
    }[];
  } | null;
  eventosConducao: { total: IndicadorFrota; por100Km: IndicadorFrota; porTipo: ContagemFrota[] } | null;
  condutores: { idColaborador: string | null; nome: string; eventos: number; sinistros: number; sinistrosComCulpa: number }[] | null;
  acidentes: {
    total: number;
    diasPerdidos: number;
    porTipo: ContagemFrota[];
    lista: {
      idEvento: string;
      idVeiculo: string;
      placa: string;
      tipo: string;
      rotulo: string;
      ocorridoEm: string;
      diasPerdidos: number;
    }[];
  };
}

export interface VeiculoRelatorioFrota {
  idVeiculo: string;
  placa: string;
  base: string | null;
  tipo: string | null;
  regime: string | null;
  situacao: string;
  processo: string | null;
  manutencao: number | null;
  combustivel: number | null;
  despesas: number | null;
  seguro: number | null;
  locacao: number;
  franquias: number | null;
  total: number;
  km: number;
  custoPorKm: number | null;
  litros: number | null;
  kmPorLitro: number | null;
  kmPorLitroReferencia: number | null;
  osConcluidas: number;
  corretivas: number;
  preventivas: number;
  horasParado: number | null;
  disponibilidade: number | null;
  preventivasVencidas: number;
  turnos: number;
  notas: number;
  faturado: number;
  custoSobreFaturamento: number | null;
  diasComChecklist: number | null;
  coberturaChecklist: number | null;
  pendenciasChecklist: number | null;
  eventosConducao: number | null;
  sinistros: number | null;
  horasLigadoParado: number | null;
  kmForaExpediente: number | null;
  idBase: string | null;
  idTipo: string | null;
  idProcesso: string | null;
  totalAnterior: number;
  kmAnterior: number;
}

// ── Registros de origem dos dashboards (`GET /v1/frota/relatorios/detalhe/*`) ──────────────────────

export type CategoriaLancamento = 'MANUTENCAO' | 'DESPESAS' | 'COMBUSTIVEL' | 'FRANQUIAS';

export interface LancamentoFrota {
  categoria: CategoriaLancamento;
  id: string;
  numero: number | null;
  data: string;
  idVeiculo: string;
  placa: string | null;
  descricao: string | null;
  contraparte: string | null;
  valor: number;
}

export interface DetalheCustosFrota {
  lancamentos: LancamentoFrota[];
}

export interface OsDetalheFrota {
  id: string;
  numero: number | null;
  idVeiculo: string;
  placa: string | null;
  tipoManutencao: string;
  origem: string;
  causa: string | null;
  criticidade: string;
  tipoOficina: string;
  oficina: string;
  valor: number;
  valorPecas: number;
  valorServicos: number;
  abertaEm: string | null;
  inicioReal: string | null;
  fimReal: string | null;
  veiculoParado: boolean;
  horasReparo: number | null;
  diasAteInicio: number | null;
  baixaPendente: boolean;
  descricao: string | null;
}

export interface OsAbertaDetalheFrota {
  id: string;
  numero: number | null;
  idVeiculo: string;
  placa: string | null;
  situacao: string;
  tipoManutencao: string;
  origem: string;
  criticidade: string;
  tipoOficina: string;
  oficina: string;
  abertaEm: string | null;
  agendadaPara: string | null;
  previsaoTermino: string | null;
  veiculoParado: boolean;
  paradoDesde: string | null;
  diasAberta: number;
  atrasada: boolean;
  descricao: string | null;
}

export interface DetalheManutencaoFrota {
  concluidas: OsDetalheFrota[];
  concluidasAnterior: OsDetalheFrota[];
  abertas: OsAbertaDetalheFrota[];
  itens: { idOs: string; item: string; tipo: string; retrabalho: boolean }[];
  pecas: { idOs: string; descricao: string; origem: string; quantidade: number; unidade: string; valor: number }[];
  servicos: { idOs: string; descricao: string; mecanico: string | null; valor: number }[];
}

export interface AbastecimentoDetalheFrota {
  id: string;
  realizadoEm: string;
  idVeiculo: string;
  placa: string | null;
  idPosto: string;
  posto: string;
  idCondutor: string | null;
  condutor: string | null;
  origem: string;
  litros: number;
  valorCombustivel: number;
  valorTotal: number;
  precoLitro: number | null;
  produtos: string | null;
  medicao: number | null;
  kmDesdeAnterior: number | null;
  kmPorLitro: number | null;
  horasAprovacao: number | null;
  alertas: string[];
}

export interface DetalheCombustivelFrota {
  atual: AbastecimentoDetalheFrota[];
  anterior: AbastecimentoDetalheFrota[];
}

export interface DetalheUsoFrota {
  kmMensal: { idVeiculo: string; mes: string; km: number }[];
  producaoMensal: { idVeiculo: string; mes: string; turnos: number; notas: number; faturado: number }[];
}

export interface DocumentoDetalheFrota {
  id: string;
  idVeiculo: string;
  placa: string | null;
  tipo: string;
  descricao: string | null;
  vencimento: string;
  dias: number;
  comArquivo: boolean;
}

export interface CnhDetalheFrota {
  idCondutor: string;
  idColaborador: string;
  nome: string;
  categoria: string | null;
  validade: string | null;
  dias: number | null;
  placas: string[];
}

export interface PendenciaDetalheFrota {
  id: string;
  idChecklist: string;
  idVeiculo: string;
  placa: string | null;
  item: string;
  grupo: string | null;
  abertaEm: string | null;
  dias: number;
  comentario: string | null;
  idOrdemServico: string | null;
}

export interface DetalheConformidadeFrota {
  documentos: DocumentoDetalheFrota[] | null;
  cnh: CnhDetalheFrota[] | null;
  pendencias: PendenciaDetalheFrota[] | null;
}
