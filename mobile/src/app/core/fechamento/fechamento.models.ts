import { Equivalencia } from '../almox/unidade-material';
/** Encerramento de obras: solicitações para regularizar o saldo da obra no SAP. */

export type TipoFechamento = '221' | '921' | '222' | '922';
export type EfeitoEstoque = 'FISICO' | 'VIRTUAL';
export type SituacaoFechamento =
  | 'AGUARDANDO_RESERVA'
  | 'AGUARDANDO_MOVIMENTACAO'
  | 'MOVIMENTADA_PARCIALMENTE'
  | 'MOVIMENTADA'
  | 'CANCELADA';
export type SituacaoFechamentoObra = 'SEM_SOLICITACOES' | 'PENDENTE' | 'PARCIAL' | 'FINALIZADO';
export type SituacaoPrazo = 'NO_PRAZO' | 'VENCE_EM_BREVE' | 'ATRASADO' | 'CUMPRIDO' | 'CUMPRIDO_COM_ATRASO';

export interface PessoaFechamento {
  id: string;
  nome: string | null;
}

export interface ObraFechamento {
  id: string;
  numero: string | null;
  titulo: string | null;
}

export interface EstoqueFechamento {
  id: string;
  nome: string;
}

export interface PrazoFechamento {
  limite: string | null;
  situacao: SituacaoPrazo | null;
}

export interface PendenciaFechamento {
  idMotivo: string;
  motivo: string;
  justificativa: string | null;
}

export interface FechamentoResumo {
  id: string;
  versao: number;
  tipo: TipoFechamento;
  obra: ObraFechamento;
  situacao: SituacaoFechamento;
  situacaoObra: SituacaoFechamentoObra;
  prazoVigente: PrazoFechamento;
  possuiPendencia: boolean;
  numeroReserva: string | null;
  solicitante: PessoaFechamento | null;
  encarregado: PessoaFechamento | null;
  supervisor: PessoaFechamento | null;
  coordenador: PessoaFechamento | null;
  totalItens: number;
  quantidadeSolicitada: number;
  quantidadeMovimentada: number;
  criadaEm: string;
  almoxarifadoAtendimento: EstoqueFechamento | null;
  movimentacaoConcluidaEm: string | null;
  acoes: AcoesFechamento;
}

export interface ItemFechamento {
  id: string;
  idMaterial: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string | null;
  quantidade: number;
  quantidadeMovimentada: number;
  quantidadePendente: number;
  pendencia: PendenciaFechamento | null;
  removivel: boolean;
  equivalencias?: Equivalencia[];
}

export interface ItemMovimentacaoFechamento {
  id: string;
  idItemSolicitacao: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  quantidade: number;
  quantidadeEstornavel: number;
}

export interface MovimentacaoFechamento {
  id: string;
  tipo: 'MOVIMENTACAO' | 'ESTORNO';
  efeitoEstoque: EfeitoEstoque | null;
  idMovimentacaoOriginal: string | null;
  realizadaEm: string;
  operador: PessoaFechamento;
  motivo: string | null;
  itens: ItemMovimentacaoFechamento[];
  podeEstornar: boolean;
}

export interface AcoesFechamento {
  editar: boolean;
  registrarReserva: boolean;
  alterarReserva: boolean;
  pendencias: boolean;
  cancelar: boolean;
  movimentar: boolean;
}

export interface FechamentoDetalhe {
  id: string;
  versao: number;
  tipo: TipoFechamento;
  obra: ObraFechamento;
  almoxarifadoAtendimento: EstoqueFechamento;
  estoqueObra: EstoqueFechamento;
  situacao: SituacaoFechamento;
  situacaoObra: SituacaoFechamentoObra;
  prazoReserva: PrazoFechamento;
  prazoMovimentacao: PrazoFechamento | null;
  prazoVigente: PrazoFechamento;
  reserva: { numero: string; dataCriacao: string; registradaEm: string } | null;
  solicitante: PessoaFechamento | null;
  encarregado: PessoaFechamento | null;
  supervisor: PessoaFechamento | null;
  coordenador: PessoaFechamento | null;
  observacao: string | null;
  pendenciaGeral: PendenciaFechamento | null;
  possuiPendencia: boolean;
  criadaEm: string;
  movimentacaoConcluidaEm: string | null;
  canceladaEm: string | null;
  motivoCancelamento: string | null;
  itens: ItemFechamento[];
  movimentacoes: MovimentacaoFechamento[];
  acoes: AcoesFechamento;
}

export interface FechamentoFiltro {
  minhas?: boolean;
  idSolicitante?: string;
  idObra?: string;
  tipos?: TipoFechamento[];
  situacoes?: SituacaoFechamento[];
  prazo?: Extract<SituacaoPrazo, 'NO_PRAZO' | 'VENCE_EM_BREVE' | 'ATRASADO'>;
  comPendencia?: boolean;
  idSupervisor?: string;
  idCoordenador?: string;
  idEncarregado?: string;
  situacaoObra?: SituacaoFechamentoObra;
  reserva?: string;
  idAlmoxarifado?: string;
  criadaDe?: string;
  criadaAte?: string;
  /** Traz o que vence ou foi concluído no intervalo (calendário). */
  agendaDe?: string;
  agendaAte?: string;
  busca?: string;
  ordenacao?: 'prazo' | 'solicitacao' | 'situacao' | 'obra' | 'tipo' | 'almoxarifado' | 'encarregado' | 'supervisor' | 'coordenador' | 'solicitante' | 'reserva' | 'itens';
  direcao?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

export interface CriarFechamentoRequest {
  idObra: string;
  idAlmoxarifadoAtendimento: string;
  idEncarregado: string | null;
  idSupervisor: string | null;
  observacao: string | null;
  solicitacoes: {
    tipo: TipoFechamento;
    numeroReserva: string | null;
    dataReserva: string | null;
    itens: { idMaterial: string; quantidade: number }[];
  }[];
}

export interface EditarFechamentoRequest {
  versaoEsperada: number;
  idEncarregado: string | null;
  idSupervisor: string | null;
  observacao: string | null;
  itens: { idItem: string | null; idMaterial: string; quantidade: number }[];
}

export interface MovimentarFechamentoRequest {
  versaoEsperada: number;
  itens: { idItem: string; quantidade: number; unidade?: string }[];
}

export interface EstornarFechamentoRequest {
  versaoEsperada: number;
  motivo: string;
  itens: { idItemOperacao: string; quantidade: number }[];
}

export interface LinhaPreviaSaldo {
  idMaterial: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  estoque: EstoqueFechamento;
  saldoAtual: number;
  variacao: number;
  saldoResultante: number;
}

export interface PreviaSaldo {
  deixaSaldoNegativo: boolean;
  linhas: LinhaPreviaSaldo[];
}

export interface SituacaoObraFechamento {
  idObra: string;
  situacao: SituacaoFechamentoObra;
  total: number;
  movimentadas: number;
  emAndamento: number;
  canceladas: number;
}
