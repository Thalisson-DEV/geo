import { Equivalencia } from './unidade-material';

// Contratos do almoxarifado consumidos pelo perfil administrativo (gestão de solicitações
// comerciais e movimentações de estoque). Espelham os DTOs do backend (`/v1/solicitacoes-material`,
// `/v1/movimentacoes-estoque`, `/v1/saldos`) — só os campos que o app usa.

export interface Pagina<T> {
  content: T[];
  page: { size: number; number: number; totalElements: number; totalPages: number };
}

export type StatusSolicitacao = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'ENTREGUE_PARCIAL' | 'ENTREGUE' | 'ESTORNADO'
  | 'DEVOLVIDO_PARCIAL' | 'DEVOLVIDO' | 'CANCELADO';
export type AcaoSolicitacao = 'APROVAR' | 'REJEITAR' | 'ENTREGAR' | 'INICIAR_SEPARACAO' | 'CONCLUIR_SEPARACAO' | 'PULAR_SEPARACAO'
  | 'CONFIRMAR_DEVOLUCAO' | 'ESTORNAR' | string;
export type ContextoSolicitacao = 'COMERCIAL' | 'TECNICO' | 'FECHAMENTO';
export type StatusSeparacao = 'AGUARDANDO_AGENDAMENTO' | 'PRONTO_PARA_SEPARACAO' | 'EM_SEPARACAO' | 'SEPARADO';
export type EtapaOperacional = 'AGUARDANDO_PLANEJAMENTO' | 'PRONTO_PARA_SEPARACAO' | 'EM_SEPARACAO' | 'PENDENTE_ENTREGA' | 'PENDENTE_DEVOLUCAO' | 'CONCLUIDA';
export type SubEtapaKanban = 'PENDENTE_APROVACAO' | 'PENDENTE_PLANEJAMENTO' | 'PLANEJADO' | 'PRONTO_PARA_SEPARACAO' | 'EM_SEPARACAO' | 'SEPARADO'
  | 'PENDENTE_RETIRADA' | 'PENDENTE_DEVOLUCAO' | 'CONCLUIDO' | 'REJEITADO' | 'CANCELADO';
export type Condicao = 'NOVO' | 'USADO' | 'RECUPERADO' | 'SUCATA';

export interface TipoEstoque { id?: string; nome?: string }

export interface Estoque {
  id: string;
  nomeIdentificador: string;
  tipoEstoque?: TipoEstoque | null;
  idEquipe?: string | null;
  idBaseOperacional?: string | null;
  ativo: boolean;
}

export interface Material {
  id: string;
  codigo: string;
  descricao: string;
  unidadeMedida?: string | null;
  detalhaSerie: boolean;
  ativo?: boolean;
  /** Processo do cadastro: Obras atende técnica e fechamento; os demais, a comercial. */
  processo?: { id: string; nome: string } | null;
  /** Outras unidades em que a quantidade pode ser informada (ex.: KG para cabo em MT). */
  equivalencias?: Equivalencia[];
}

export interface Motivo { id: string; nome: string; descricao?: string | null; ativo?: boolean }

export interface ResumoSolicitacao {
  id: string;
  status: StatusSolicitacao;
  possuiPendencia?: boolean;
  motivosPendencia?: string[];
  encerrada?: boolean;
  estoqueOrigemNome?: string;
  estoqueDestinoNome?: string;
  estoqueOrigemNomeIdentificador?: string;
  estoqueDestinoNomeIdentificador?: string;
  tipoTecnico?: string | null;
  dataSolicitacao: string;
  dataVerificacao?: string | null;
  dataEntrega?: string | null;
  dataPrevista?: string | null;
  foraPrazoSaque?: boolean;
  idRequisitante?: string;
  totalItens: number;
  acoesPermitidas?: AcaoSolicitacao[];
  contexto?: ContextoSolicitacao;
  versao?: number;
  statusSeparacao?: StatusSeparacao | null;
  etapaOperacional?: EtapaOperacional | null;
  idEquipe?: string | null;
  tecnico?: DetalhesTecnicos | null;
}

/** Contexto do fluxo técnico (obra, OC/OS, equipe, separação e operações). */
export interface DetalhesTecnicos {
  /** O backend serializa pelo código (221, 921, 222, 922); aceita também o nome do enum. */
  tipoTecnico?: string | null;
  idObra?: string | null;
  ocorrencia?: { id: string; codigo: string } | null;
  idAlmoxarifadoAtendimento?: string | null;
  idEquipe?: string | null;
  idColaboradorSaque?: string | null;
  saqueForaEquipe?: boolean;
  dataPrevista?: string | null;
  observacao?: string | null;
  statusSeparacao?: StatusSeparacao | null;
  reserva?: { numero?: string | null; dataCriacao?: string | null } | null;
  totais?: {
    solicitada: number; entregaLiquida: number; devolucaoLiquida: number; pendente: number;
    entregaEstornada?: number; devolucaoEstornada?: number;
  } | null;
  operacoes?: OperacaoTecnica[];
  versao: number;
  acoesPermitidas?: AcaoSolicitacao[];
  atrasada?: boolean;
  encerrada?: boolean;
  motivoEncerramento?: string | null;
  etapaOperacional?: EtapaOperacional | null;
}

export interface ItemOperacaoTecnica {
  id: string;
  idItemSolicitacao: string;
  idMaterial: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  quantidade: number;
  numeroSerie?: string | null;
  condicao?: Condicao | null;
  idItemOperacaoOriginal?: string | null;
}

export interface OperacaoTecnica {
  id: string;
  tipo: 'ENTREGA' | 'DEVOLUCAO' | 'ESTORNO' | string;
  idEquipe?: string | null;
  idColaboradorSaque?: string | null;
  idUsuarioOperador: string;
  realizadaEm: string;
  motivo?: string | null;
  idOperacaoOriginal?: string | null;
  itens: ItemOperacaoTecnica[];
}

export interface KanbanTecnico {
  colunas: {
    etapa: string;
    label: string;
    subColunas: { subEtapa: SubEtapaKanban; label: string; total: number; itens: ResumoSolicitacao[] }[];
  }[];
}

export interface FiltroTecnicas {
  idAlmoxarifado?: string | null;
  tipoTecnico?: string | null;
  ocorrencia?: string | null;
  dataInicio?: string | null;
}

export interface ItemComandoTecnico {
  idItemSolicitacao: string;
  quantidade: number;
  numeroSerie?: string | null;
  /** Unidade em que a quantidade foi digitada; ausente = unidade do material. */
  unidade?: string;
}

export interface EntregaTecnicaRequest {
  versaoEsperada: number;
  idEquipe: string;
  idColaboradorSaque?: string | null;
  saqueForaEquipe?: boolean;
  assinaturaAlmox: string;
  assinaturaEquipe: string;
  itens: ItemComandoTecnico[];
  /** Só quando a solicitação ainda não tem reserva: o backend registra junto. */
  numeroReserva?: string | null;
}

export interface DevolucaoTecnicaRequest {
  versaoEsperada: number;
  idEquipe: string;
  numeroReserva?: string | null;
  itens: (ItemComandoTecnico & { condicao: 'NOVO' | 'SUCATA'; guardarNoEstoque: boolean })[];
}

export interface EstornoTecnicoRequest {
  versaoEsperada: number;
  idOperacaoOriginal: string;
  motivo: string;
  itens: { idItemOperacaoOriginal: string; quantidade: number; numeroSerie?: string | null }[];
}

/** Devolução 222/922 registrada direto como movimentação (sem solicitação prévia). */
export interface RegistroDevolucaoTecnicaRequest {
  idObra: string;
  ocorrencia?: string | null;
  idEquipe: string;
  idAlmoxarifado: string;
  observacao?: string | null;
  itens: {
    idMaterial: string;
    tipoMovimentacao: 'DEVOLUCAO_COMUM' | 'DEVOLUCAO_CONCRETO';
    quantidade: number;
    condicao: 'NOVO' | 'SUCATA';
    numerosSerie?: string[];
    guardarNoEstoque: boolean;
    /** Unidade em que a quantidade foi digitada; ausente = unidade do material. */
    unidade?: string;
  }[];
}

/** Devolução comercial: do estoque de campo da equipe para um almoxarifado. */
export interface DevolucaoComercialRequest {
  idEquipe: string;
  idEstoqueDestino: string;
  observacao?: string | null;
  itens: { idMaterial: string; quantidade: number; condicao: 'NOVO' | 'SUCATA'; numSerie?: string; guardarNoEstoque: boolean; unidade?: string }[];
}

export interface ObraResumo {
  id: string;
  numero: string;
  titulo: string;
  tipoObraNome?: string | null;
  /** OS ou OC: a devolução precisa do número da ocorrência. */
  controleExecucao?: 'OBRA' | 'OS' | 'OC' | string | null;
  ativo?: boolean;
}

export interface ItemSolicitacao {
  id: string;
  material: Material;
  quantidade: number;
  quantidadeEntregue: number;
  quantidadeEntregaLiquida?: number;
  quantidadeDevolucaoLiquida?: number;
  quantidadePendente?: number;
  numSerie?: string | null;
  motivoPendencia?: Motivo | null;
  justificativaPendencia?: string | null;
}

export interface ItemOperacao {
  id: string;
  idItemSolicitacao?: string | null;
  codigoMaterial: string;
  descricaoMaterial: string;
  quantidade: number;
  numeroSerie?: string | null;
}

export interface OperacaoSolicitacao {
  id: string;
  tipo: 'ENTREGA' | 'ESTORNO';
  idColaboradorSaque?: string | null;
  saqueForaEquipe: boolean;
  idUsuarioOperador: string;
  realizadaEm: string;
  motivo?: string | null;
  itens: ItemOperacao[];
}

export interface Solicitacao {
  id: string;
  /** No técnico, a adição não tem origem (sai do almoxarifado de atendimento) e a devolução não tem destino. */
  estoqueOrigem: Estoque;
  estoqueDestino: Estoque;
  contexto?: ContextoSolicitacao;
  versao?: number;
  statusSeparacao?: StatusSeparacao | null;
  tecnico?: DetalhesTecnicos | null;
  tipoTecnico?: string | null;
  idRequisitante: string;
  idAprovador?: string | null;
  idEntregadorAlmox?: string | null;
  idEquipe?: string | null;
  idColaboradorSaque?: string | null;
  saqueForaEquipe?: boolean;
  status: StatusSolicitacao;
  dataSolicitacao: string;
  dataVerificacao?: string | null;
  dataEntrega?: string | null;
  dataPrevista?: string | null;
  foraPrazoSaque?: boolean;
  observacao?: string | null;
  motivoRejeicao?: Motivo | null;
  justificativaRejeicao?: string | null;
  motivoPendencia?: Motivo | null;
  justificativaPendencia?: string | null;
  possuiPendencia?: boolean;
  itens: ItemSolicitacao[];
  operacoes?: OperacaoSolicitacao[];
  encerrada?: boolean;
  motivoEncerramento?: string | null;
  acoesPermitidas?: AcaoSolicitacao[];
}

export interface FiltroSolicitacoes {
  statuses?: StatusSolicitacao[];
  idEstoqueOrigem?: string | null;
  idEstoqueDestino?: string | null;
  numSerie?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  previstaDe?: string | null;
  previstaAte?: string | null;
  page?: number;
  size?: number;
  sort?: string;
}

export interface ItemEntregaRequest {
  idItemSolicitacao: string;
  quantidade: number;
  novaQuantidadeSolicitada: number;
  numSerie?: string;
  unidade?: string;
}

export interface EntregaRequest {
  assinaturaAlmox: string;
  assinaturaEquipe: string;
  idColaboradorSaque: string;
  saqueForaEquipe: boolean;
  itens: ItemEntregaRequest[];
}

export interface PendenciaRequest {
  idMotivoPendencia: string;
  justificativa: string;
  idItem?: string | null;
}

export interface EstornoParcialRequest {
  itens: { idItemSolicitacao: string; quantidade: number }[];
}

export interface Saldo {
  id: string;
  estoque: Estoque;
  material: Material;
  quantidade: number;
  condicao?: Condicao | null;
}

export interface SaldoSerie { id: string; numSerie: string; material: Material; condicao?: Condicao | null; estoque?: Pick<Estoque, 'id' | 'nomeIdentificador'> | null }

export interface MembroEquipe { idColaborador: string; nomeColaborador: string; vinculoAtivo?: boolean }

export interface Colaborador { id: string; nomeCompleto: string; idUsuario?: string | null }

export interface Usuario { id: string; login: string; idColaborador?: string | null; colaborador?: { nomeCompleto?: string } | null }

export type TipoMovimentacao =
  | 'ENTRADA_AVULSA' | 'BAIXA_AVULSA' | 'TRANSFERENCIA' | 'ENTREGA' | 'ESTORNO' | 'APLICACAO' | 'RETIRADA' | 'DEVOLUCAO';

export interface ResumoMovimentacao {
  idReferenciaOperacao: string;
  tipo: TipoMovimentacao;
  dataHora: string;
  operadorNome: string;
  estoqueOrigem?: Estoque | null;
  estoqueDestino?: Estoque | null;
  idSolicitacao?: string | null;
}

export interface ItemMovimentado {
  id: string;
  material: Material;
  quantidade: number;
  numSerie?: string | null;
  condicao?: Condicao | null;
  /** O que foi digitado em outra unidade (ex.: 30 KG); {@link quantidade} está na unidade do material. */
  quantidadeInformada?: number | null;
  unidadeInformada?: string | null;
}

export interface Movimentacao extends ResumoMovimentacao {
  itens: ItemMovimentado[];
  assinaturaEntregador?: string | null;
  assinaturaRecebedor?: string | null;
}

export interface FiltroMovimentacoes {
  tipo?: TipoMovimentacao | null;
  idEstoque?: string | null;
  numSerie?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  page?: number;
  size?: number;
  sort?: string;
}

export interface ItemMovimentacaoRequest {
  idMaterial: string;
  quantidade: number;
  numSerie?: string;
  condicao: Condicao;
  /** Unidade em que a quantidade foi digitada; ausente = unidade do material. */
  unidade?: string;
}

export interface MovimentacaoRequest {
  idEstoqueOrigem?: string;
  idEstoqueDestino?: string;
  itens: ItemMovimentacaoRequest[];
  assinaturaEntregador?: string;
  assinaturaRecebedor?: string;
}
