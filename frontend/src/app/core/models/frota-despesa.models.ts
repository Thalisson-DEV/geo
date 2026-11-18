/** Despesas por veículo na web: lavagem, estacionamento, pedágio, mensalidade, taxa e outras. */
import { GeoTone } from '@geo/ui';

export type FormaPagamentoDespesa = 'A_PAGAR' | 'CARTAO' | 'REEMBOLSO' | 'JA_PAGO';
export type SituacaoPagamentoDespesa = 'SOLICITADO' | 'APROVADO' | 'REPROVADO';
export type TipoDocumentoDespesa = 'NFE' | 'NFSE' | 'CUPOM' | 'RECIBO' | 'OUTRO';

export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamentoDespesa, string> = {
  A_PAGAR: 'Pagar pelo financeiro',
  CARTAO: 'Cartão corporativo',
  REEMBOLSO: 'Reembolso',
  JA_PAGO: 'Já pago'
};

export const ROTULO_DOCUMENTO: Record<TipoDocumentoDespesa, string> = {
  NFE: 'NF-e',
  NFSE: 'NFS-e',
  CUPOM: 'Cupom fiscal',
  RECIBO: 'Recibo',
  OUTRO: 'Outro'
};

export interface SubtipoDespesa {
  id: string;
  nome: string;
}

export interface TipoDespesa {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  subtipos: SubtipoDespesa[];
}

export interface TipoDespesaRequest {
  nome: string;
  subtipos: string[];
}

export interface AnexoDespesa {
  id: string;
  nome: string;
  contentType: string | null;
  tamanhoBytes: number | null;
  enviadoEm: string;
}

export interface DespesaVeiculo {
  id: string;
  idVeiculo: string;
  placa: string | null;
  veiculoDescricao: string | null;
  data: string;
  idTipo: string;
  tipo: string;
  idSubtipo: string | null;
  subtipo: string | null;
  descricao: string | null;
  valor: number;
  idBaseOperacional: string | null;
  baseNome: string | null;
  idProcesso: string | null;
  processoNome: string | null;
  idFornecedor: string | null;
  fornecedorNome: string | null;
  documentoTipo: TipoDocumentoDespesa | null;
  documentoTipoRotulo: string | null;
  documentoNumero: string | null;
  medicao: number | null;
  formaPagamento: FormaPagamentoDespesa;
  formaPagamentoRotulo: string;
  idSolicitacaoFinanceira: string | null;
  numeroSolicitacaoFinanceira: number | null;
  situacaoPagamento: SituacaoPagamentoDespesa | null;
  situacaoPagamentoRotulo: string | null;
  motivoReprovacaoPagamento: string | null;
  podePedirPagamento: boolean;
  origem: 'MANUAL' | 'IMPORTACAO';
  idExterno: string | null;
  anexos: AnexoDespesa[];
  criadaEm: string;
  criadaPor: string | null;
}

export interface DespesaVeiculoRequest {
  idVeiculo: string;
  data: string;
  idTipo: string;
  idSubtipo: string | null;
  descricao: string | null;
  valor: number;
  idBaseOperacional: string | null;
  idProcesso: string | null;
  idFornecedor: string | null;
  fornecedorNome: string | null;
  documentoTipo: TipoDocumentoDespesa | null;
  documentoNumero: string | null;
  medicao: number | null;
  formaPagamento: FormaPagamentoDespesa;
}

export interface FiltroDespesas {
  idVeiculo?: string | null;
  busca?: string | null;
  idsBase?: string[];
  idsTipo?: string[];
  de?: string | null;
  ate?: string | null;
  formaPagamento?: FormaPagamentoDespesa | null;
  situacaoPagamento?: SituacaoPagamentoDespesa | null;
  semPagamento?: boolean | null;
}

export interface ResumoDespesas {
  quantidade: number;
  total: number;
  aPagarSemSolicitacao: number;
  valorAPagarSemSolicitacao: number;
  porTipo: { idTipo: string; tipo: string; quantidade: number; total: number }[];
}

export interface DespesaImportacaoLinha {
  linha: number;
  placa: string | null;
  data: string | null;
  tipo: string | null;
  subtipo: string | null;
  valor: string | null;
  descricao: string | null;
  fornecedor: string | null;
  documento: string | null;
  numeroDocumento: string | null;
  formaPagamento: string | null;
  sistemaOrigem: string | null;
  idExterno: string | null;
  status: string;
  mensagemErro: string | null;
  acao: string | null;
  editing?: boolean;
}

export interface ImportacaoDespesas {
  registros: DespesaImportacaoLinha[];
  totalProcessados: number;
  totalSucesso: number;
  totalFalha: number;
}

/** Situação do pagamento para a equipe: a pagar ainda sem solicitação, solicitado, aprovado, reprovado ou só registro. */
export function pagamentoDespesa(d: Pick<DespesaVeiculo, 'formaPagamento' | 'formaPagamentoRotulo' | 'situacaoPagamento' | 'situacaoPagamentoRotulo'>): {
  rotulo: string; tom: GeoTone; icone: string;
} {
  if (d.formaPagamento !== 'A_PAGAR') return { rotulo: d.formaPagamentoRotulo, tom: 'neutral', icone: 'pi-credit-card' };
  switch (d.situacaoPagamento) {
    case 'SOLICITADO': return { rotulo: 'Pagamento solicitado', tom: 'info', icone: 'pi-send' };
    case 'APROVADO': return { rotulo: 'Pagamento aprovado', tom: 'success', icone: 'pi-check-circle' };
    case 'REPROVADO': return { rotulo: 'Pagamento reprovado', tom: 'danger', icone: 'pi-times' };
    default: return { rotulo: 'Falta pedir o pagamento', tom: 'warning', icone: 'pi-clock' };
  }
}
