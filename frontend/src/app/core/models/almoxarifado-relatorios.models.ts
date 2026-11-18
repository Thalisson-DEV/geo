/**
 * Dados dos relatórios gerenciais do almoxarifado (`/v1/almoxarifado/relatorios/*`). Uma linha por
 * movimentação ou por saldo: os painéis calculam indicadores, rankings e leituras sobre essas linhas, para
 * que todo número possa ser aberto até a origem.
 */

export type TipoMovimentacao =
  | 'ENTRADA_AVULSA'
  | 'BAIXA_AVULSA'
  | 'TRANSFERENCIA'
  | 'ENTREGA'
  | 'ESTORNO'
  | 'APLICACAO'
  | 'RETIRADA'
  | 'DEVOLUCAO';

export type TipoEstoqueAlmox = 'FISICO' | 'CAMPO' | 'OBRA';

export interface MovimentacaoRelatorio {
  id: string;
  idOperacao: string | null;
  dataHora: string;
  /** Do período anterior de mesma duração (comparação). */
  anterior: boolean;
  tipo: TipoMovimentacao;
  condicao: 'NOVO' | 'SUCATA';
  motivo: string | null;
  observacao: string | null;
  quantidade: number;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  numSerie: string | null;
  idOrigem: string | null;
  origem: string | null;
  tipoOrigem: string | null;
  idDestino: string | null;
  destino: string | null;
  tipoDestino: string | null;
  idBase: string | null;
  base: string | null;
  idEquipe: string | null;
  equipe: string | null;
  idProcesso: string | null;
  processo: string | null;
  idObra: string | null;
  obra: string | null;
  idSolicitacao: string | null;
  contexto: 'COMERCIAL' | 'TECNICO' | 'FECHAMENTO' | null;
  tipoTecnico: string | null;
  idOperador: string | null;
  operador: string | null;
}

export interface MovimentacoesRelatorioResponse {
  geradoEm: string;
  de: string;
  ate: string;
  anteriorDe: string;
  anteriorAte: string;
  limite: number;
  truncado: boolean;
  movimentacoes: MovimentacaoRelatorio[];
}

export interface SaldoRelatorio {
  idEstoque: string;
  estoque: string;
  tipoEstoque: TipoEstoqueAlmox | string;
  idBase: string | null;
  base: string | null;
  idEquipe: string | null;
  equipe: string | null;
  idProcesso: string | null;
  processo: string | null;
  idObra: string | null;
  obra: string | null;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  detalhaSerie: boolean;
  condicao: 'NOVO' | 'SUCATA';
  quantidade: number;
  series: number;
  seriesReservadas: number;
  ultimaEntrada: string | null;
  ultimaSaida: string | null;
  desde: string | null;
}

export interface EstoqueRelatorioResponse {
  geradoEm: string;
  limite: number;
  truncado: boolean;
  saldos: SaldoRelatorio[];
}

/** Recorte comum dos relatórios do almoxarifado (o que vai na URL). */
export interface RecorteAlmox {
  de?: string;
  ate?: string;
  idBase?: string[];
  idProcesso?: string[];
  idAlmoxarifado?: string[];
  idEquipe?: string[];
}

// ── Encerramento de obras ─────────────────────────────────────────────────────────────────────────

export type SituacaoFechamento = 'AGUARDANDO_RESERVA' | 'AGUARDANDO_MOVIMENTACAO' | 'MOVIMENTADA_PARCIALMENTE' | 'MOVIMENTADA' | 'CANCELADA';
export type SituacaoPrazoFechamento = 'NO_PRAZO' | 'VENCE_EM_BREVE' | 'ATRASADO' | 'CUMPRIDO' | 'CUMPRIDO_COM_ATRASO';

export interface FechamentoRelatorio {
  id: string;
  tipo: string;
  idObra: string | null;
  numeroObra: string | null;
  tituloObra: string | null;
  tipoObra: string | null;
  situacao: SituacaoFechamento;
  situacaoObra: 'SEM_SOLICITACOES' | 'PENDENTE' | 'PARCIAL' | 'FINALIZADO' | null;
  situacaoPrazo: SituacaoPrazoFechamento | null;
  prazoVigenteAte: string | null;
  criadaEm: string;
  prazoReservaAte: string | null;
  reservaCumpridaEm: string | null;
  prazoMovimentacaoAte: string | null;
  movimentacaoConcluidaEm: string | null;
  canceladaEm: string | null;
  numeroReserva: string | null;
  possuiPendencia: boolean;
  motivoPendencia: string | null;
  idSolicitante: string | null;
  solicitante: string | null;
  idEncarregado: string | null;
  encarregado: string | null;
  idSupervisor: string | null;
  supervisor: string | null;
  idCoordenador: string | null;
  coordenador: string | null;
  idAlmoxarifado: string | null;
  almoxarifado: string | null;
  itens: number;
  quantidadeSolicitada: number;
  quantidadeMovimentada: number;
  anteriorAoPeriodo: boolean;
}

export interface FechamentoRelatorioResponse {
  geradoEm: string;
  de: string;
  ate: string;
  solicitacoes: FechamentoRelatorio[];
}
