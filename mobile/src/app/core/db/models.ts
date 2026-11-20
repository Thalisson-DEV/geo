export interface EquipeLocal {
  id: string;
  codigo: string;
  nomeTipoEquipe: string;
  nomeProcesso: string;
  idBaseOperacional?: string;
  nomeBaseOperacional: string;
  idVeiculo?: string;
  membrosIds?: string[];
}

export interface BaseOperacionalLocal {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  raio: number | null;
  ativo: boolean;
}

export interface ColaboradorLocal {
  id: string;
  idUsuario: string;
  nomeCompleto: string;
  funcao: string;
  ativo: boolean;
}

export interface MunicipioLocal {
  id: string;
  nome: string;
  idBaseOperacional: string;
  ativo: boolean;
}

export interface VeiculoLocal {
  id: string;
  placa: string;
  modelo: string;
  fabricante: string;
  ativo: boolean;
}

export interface MaterialLocal {
  id: string;
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  detalhaSerie: boolean;
  /** Outras unidades em que a quantidade pode ser lançada (ex.: M para fita em UN). */
  equivalencias?: Equivalencia[];
}

export interface EstoqueLocal {
  id: string;
  nomeIdentificador: string;
  tipoEstoque: string; // ex: 'CAMPO', 'MOVEL', 'DEPOSITO'
  idEquipe?: string;
  ativo?: boolean;
}

export interface SaldoLocal {
  id: string;
  idEstoque: string;
  idMaterial: string;
  quantidade: number;
  ativo: boolean;
  condicao: 'NOVO' | 'SUCATA';
  /** Última vez que a quantidade mudou (ISO): base do "parado há N dias". */
  ultimaMovimentacao?: string | null;
}

export interface SaldoSerieLocal {
  id: string;
  idEstoque: string;
  idMaterial: string;
  numSerie: string;
  ativo: boolean;
  condicao: 'NOVO' | 'SUCATA';
  /** Desde quando a série está neste estoque (ISO). */
  noSaldoDesde?: string | null;
}

export interface ProcessoLocal {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface TransferenciaLocal {
  id: string;
  idEstoqueOrigem: string;
  idEstoqueDestino: string;
  dataTransferencia?: string;
  itens: {
    idMaterial: string;
    quantidade: number;
    condicao: 'NOVO' | 'SUCATA';
    numSerie?: string | null;
  }[];
  assinaturaEntregador?: string;
  assinaturaRecebedor?: string;
  // Controle local para a lista histórica
  statusSync: 'PENDENTE' | 'SINCRONIZADO' | 'ERRO' | 'RESULTADO_INCERTO' | 'RECEBIDO_BACKOFFICE';
  erroDetalhes?: string;
}

export interface VeiculoComposicaoLocal {
  id: string;
  placa: string;
  modelo?: string | null;
}

export interface MembroComposicaoLocal {
  idColaborador: string;
  nome: string;
  funcao?: string | null;
  responsavel: boolean;
}

export interface OpcaoColaboradorLocal {
  id: string;
  nome: string;
  funcao?: string | null;
  /** Código da equipe em que o colaborador está hoje (pode ser a própria). */
  equipeAtual?: string | null;
  /** Responsável de outra equipe não pode ser transferido pelo app. */
  responsavelEmOutraEquipe: boolean;
}

/**
 * Retrato da equipe do encarregado para a conferência na abertura do turno.
 * Guardado em `config` para funcionar offline.
 */
export interface ComposicaoEquipeLocal {
  idEquipe: string;
  codigo: string;
  veiculo: VeiculoComposicaoLocal | null;
  membros: MembroComposicaoLocal[];
  usuarioResponsavel: boolean;
  opcoes: {
    colaboradores: OpcaoColaboradorLocal[];
    veiculos: VeiculoComposicaoLocal[];
  };
  atualizadoEm: string;
}

export interface TurnoLocal {
  id: string;
  idEquipe: string;
  idUsuarioAbertura: string;
  dataInicio: string;
  dataFim?: string;
  status: 'ABERTO' | 'FECHADO';
  idVeiculo?: string | null;
  idsColaboradores?: string[];
  /** A equipe esqueceu o turno aberto e o servidor o encerrou no horário de corte. */
  encerradoAutomaticamente?: boolean;
  motivoEncerramento?: string | null;
}

export interface OutboxItem {
  id: string; // UUID local
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload: any;
  status: 'PENDENTE' | 'ERRO' | 'RESULTADO_INCERTO' | 'SINCRONIZADO';
  /** Estado do recebimento durável no servidor, independente do resultado do domínio. */
  receiptStatus?: 'LOCAL' | 'QUEUED' | 'RECEIVED' | 'RESOLVED' | 'CONFLICT';
  /** Identificador da operação no backoffice, quando o backend confirmar o recebimento. */
  serverOperationId?: string;
  /** Cópia imutável da intenção original, preservada para reconciliação e suporte. */
  originalPayload?: any;
  operationType?: string;
  erroDetalhes?: string;
  tentativas: number;
  criadoEm: Date;
  /**
   * Epoch (ms) antes do qual o item não é reenviado (espera crescente após 5xx).
   * Campo não indexado: entra sem mudar a versão do `ces-field-db` (decisão D5). // renomear-geo: manter
   */
  proximaTentativaEm?: number;
  /**
   * Epoch (ms) em que o sync reivindicou o item para enviar. A partir daí o servidor
   * pode ter gravado a operação, então o item não pode mais ser corrigido nem
   * substituído no aparelho. Campo não indexado, sem mudar a versão do banco.
   */
  envioIniciadoEm?: number;
}

export interface TipoInspecaoLocal {
  id: string;
  nome: string;
  descricao?: string | null;
  ordem: number;
  ativo: boolean;
  dataCriacao?: string;
  dataUltimaAlteracao?: string;
}

export interface InspecaoLocal {
  id: string;
  idFormulario: string;
  idTipoInspecao?: string;
  nomeTipoInspecao?: string;
  tipoInspecao?: TipoInspecaoLocal;
  idProcesso?: string;
  idEquipe?: string;
  idBaseOperacional?: string;
  nomeBaseOperacional?: string;
  idVeiculo?: string;
  idColaboradoresInspecionados?: string[];
  /** Identificador retornado pelo servidor; nunca faz parte do payload de lançamento. */
  idInspetor?: string;
  latitude?: number;
  longitude?: number;
  observacoes?: string;
  status: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  dataRealizacao: string;
  statusSync: 'PENDENTE' | 'SINCRONIZADO' | 'ERRO' | 'RESULTADO_INCERTO';
  erroDetalhes?: string;
  draftData?: string; // JSON with partial respostas and desvios
  formularioSnapshot?: FormularioInspecao;
  payload?: RegistrarInspecaoRequest;
  anexosPendentes?: AnexoPendenteLocal[];
  /**
   * Evidências obrigatórias com os `Blob`s retidos. Só são liberadas depois do
   * `201` do lançamento — antes disso o `idRemoto` pode ter expirado.
   */
  evidencias?: EvidenciaLocal[];
  /** Metadados das evidências já vinculadas, vindos da resposta canônica. */
  evidenciasRemotas?: EvidenciaInspecaoResponse[];
  idRemoto?: string | null;
}

export interface OpcaoRespostaLocal {
  id: string;
  texto: string;
  geraDesvio: boolean;
  gravidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA' | null;
  padrao?: boolean;
  ordem: number;
}

export interface PerguntaLocal {
  id: string;
  enunciado: string;
  tipoResposta: 'MULTIPLA_ESCOLHA' | 'MULTIPLA_SELECAO' | 'TEXTO' | 'NUMERO' | 'DATA';
  obrigatoria: boolean;
  ordem: number;
  opcoes: OpcaoRespostaLocal[];
  /** Quantidade esperada ou observação do item ("Individual", "Quantidade: 5"). */
  orientacao?: string | null;
  /** Falso para itens da equipe ou do veículo: o desvio pode sair sem colaborador. */
  desvioPorColaborador?: boolean;
}

export interface GrupoPerguntaLocal {
  id: string;
  titulo: string;
  ordem: number;
  perguntas: PerguntaLocal[];
}

export interface FormularioLocal {
  id: string;
  titulo: string;
  descricao: string | null;
  ativo: boolean;
  emUso?: boolean;
  grupos: GrupoPerguntaLocal[];
}
import { Equivalencia } from '../almox/unidade-material';
import {
  AnexoPendenteLocal,
  EvidenciaInspecaoResponse,
  EvidenciaLocal,
  FormularioInspecao,
  RegistrarInspecaoRequest,
} from '../sst/inspecao.models';
