/** Abastecimento da frota na web: cadastros, filas de aprovação e liberação, detalhe e faturas do posto. */

export type CategoriaProdutoAbastecimento = 'COMBUSTIVEL' | 'ARLA' | 'OLEO' | 'FLUIDO';
export type UnidadeProdutoAbastecimento = 'L' | 'UN';
export type CombustivelPosto = 'DIESEL_S10' | 'DIESEL_S500' | 'GASOLINA' | 'ETANOL' | 'GNV';
export type SituacaoAbastecimento =
  | 'AGUARDANDO_APROVACAO'
  | 'APROVADA'
  | 'REPROVADA'
  | 'LIBERADA'
  | 'REALIZADA'
  | 'CANCELADA'
  | 'VENCIDA';
export type TipoAlertaAbastecimento =
  | 'MEDICAO_MENOR'
  | 'VOLUME_ACIMA_TANQUE'
  | 'CONSUMO_FORA_PADRAO'
  | 'PRECO_ACIMA_MEDIA'
  | 'FOTO_REPETIDA'
  | 'FREQUENCIA_ALTA'
  | 'POSTO_SEM_PRECO'
  | 'SEM_CHECKLIST'
  | 'LONGE_DO_POSTO';
/** APP: pedido da equipe pelo celular. AVULSA: lançado na web por quem aprova, já aprovado. */
export type OrigemAbastecimento = 'APP' | 'AVULSA';
export type TipoFotoAbastecimento = 'PAINEL_ANTES' | 'PAINEL_DEPOIS' | 'CUPOM';
export type SituacaoFaturaPosto = 'RASCUNHO' | 'CONFERIDA' | 'ENVIADA_AO_FINANCEIRO';

export const ROTULO_CATEGORIA_PRODUTO: Record<CategoriaProdutoAbastecimento, string> = {
  COMBUSTIVEL: 'Combustível',
  ARLA: 'ARLA',
  OLEO: 'Óleo',
  FLUIDO: 'Fluido'
};

export const ROTULO_ALERTA: Record<TipoAlertaAbastecimento, string> = {
  MEDICAO_MENOR: 'KM menor',
  VOLUME_ACIMA_TANQUE: 'Acima do tanque',
  CONSUMO_FORA_PADRAO: 'Consumo fora do padrão',
  PRECO_ACIMA_MEDIA: 'Preço acima da média',
  FOTO_REPETIDA: 'Foto repetida',
  FREQUENCIA_ALTA: 'Intervalo curto',
  POSTO_SEM_PRECO: 'Posto sem preço',
  SEM_CHECKLIST: 'Sem checklist do dia',
  LONGE_DO_POSTO: 'Longe do posto'
};

export interface PostoAbastecimento {
  id: string;
  nome: string;
  cnpj: string | null;
  idBaseOperacional: string | null;
  baseNome: string | null;
  whatsapp: string | null;
  idFornecedor: string | null;
  fornecedorNome: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface PostoAbastecimentoRequest {
  nome: string;
  cnpj: string | null;
  idBaseOperacional: string | null;
  whatsapp: string | null;
  idFornecedor: string | null;
  observacao: string | null;
}

export interface ProdutoAbastecimento {
  id: string;
  nome: string;
  categoria: CategoriaProdutoAbastecimento;
  unidade: UnidadeProdutoAbastecimento;
  combustivel: CombustivelPosto | null;
  ativo: boolean;
}

export interface ProdutoAbastecimentoRequest {
  nome: string;
  categoria: CategoriaProdutoAbastecimento;
  unidade: UnidadeProdutoAbastecimento;
  combustivel: CombustivelPosto | null;
}

export interface PlacaCarteira {
  idVeiculo: string;
  placa: string;
  descricao: string | null;
  idBaseOperacional: string | null;
  baseNome: string | null;
}

export interface CarteiraAprovacao {
  idUsuario: string;
  login: string;
  nome: string;
  placas: PlacaCarteira[];
}

export interface AbastecimentoResumo {
  id: string;
  idVeiculo: string;
  placa: string | null;
  situacao: SituacaoAbastecimento;
  situacaoRotulo: string;
  solicitadoEm: string;
  solicitante: string | null;
  condutor: string | null;
  idBaseOperacional: string | null;
  baseNome: string | null;
  posto: string;
  itens: string;
  valorTotal: number | null;
  alertas: TipoAlertaAbastecimento[];
  avisoPosto: 'PENDENTE' | 'ENVIADO' | 'FALHOU' | null;
  venceEm: string | null;
  destino: string | null;
  origem: OrigemAbastecimento;
  origemRotulo: string;
}

export interface ItemAbastecimento {
  id: string;
  categoria: CategoriaProdutoAbastecimento;
  idProdutoPedido: string;
  produtoPedido: string;
  /** Só nos pedidos antigos: hoje a equipe pede só o produto. */
  quantidadePedida: number | null;
  /** Definida por quem aprova. */
  quantidadeAprovada: number | null;
  /** Ajuste da liberação (nula até liberar). */
  quantidadeLiberada: number | null;
  /** A que vale no posto: liberada, senão aprovada. */
  quantidadeAutorizada: number | null;
  unidade: string;
  idProduto: string | null;
  produto: string | null;
  quantidade: number | null;
  valorTotal: number | null;
  valorUnitario: number | null;
  tanqueCheio: boolean | null;
}

export interface FotoAbastecimento {
  id: string;
  tipo: TipoFotoAbastecimento;
  tipoRotulo: string;
  recebida: boolean;
}

export interface AlertaAbastecimento {
  tipo: TipoAlertaAbastecimento;
  tipoRotulo: string;
  /** TELEMETRIA: depois de realizado, pelo lugar onde o rastreador mostra o veículo. */
  etapa: 'SOLICITACAO' | 'APROVACAO' | 'REALIZADO' | 'TELEMETRIA';
  mensagem: string;
}

export interface AvisoPosto {
  id: string;
  motivo: 'LIBERACAO' | 'CANCELAMENTO';
  situacao: 'PENDENTE' | 'ENVIADO' | 'FALHOU';
  mensagem: string;
  linkWhatsapp: string | null;
  abertoPor: string | null;
  abertoEm: string | null;
  criadoEm: string;
}

export interface AbastecimentoDetalhe {
  id: string;
  idVeiculo: string;
  placa: string | null;
  veiculoDescricao: string | null;
  situacao: SituacaoAbastecimento;
  situacaoRotulo: string;
  idBaseOperacional: string | null;
  baseNome: string | null;
  solicitante: string | null;
  condutor: string | null;
  idPosto: string;
  posto: string;
  postoWhatsapp: string | null;
  unidadeMedicao: 'KM' | 'HORAS';
  /** Nula só no avulso lançado sem KM. */
  medicaoSolicitacao: number | null;
  medicaoRealizado: number | null;
  capacidadeTanque: number | null;
  observacao: string | null;
  solicitadoEm: string;
  aprovador: string | null;
  aprovadoEm: string | null;
  motivoReprovacao: string | null;
  liberador: string | null;
  liberadoEm: string | null;
  venceEm: string | null;
  cancelador: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  realizadoEm: string | null;
  valorTotal: number | null;
  itens: ItemAbastecimento[];
  fotos: FotoAbastecimento[];
  alertas: AlertaAbastecimento[];
  avisos: AvisoPosto[];
  podeAprovar: boolean;
  podeLiberar: boolean;
  podeCancelar: boolean;
  destino: string | null;
  origem: OrigemAbastecimento;
  origemRotulo: string;
  sugestoesPreco: SugestaoPrecoPosto[];
}

/** Preço do produto no posto, com vigência; o realizado calcula o valor por ele. */
export interface PrecoPosto {
  id: string;
  idProduto: string;
  produto: string;
  categoria: CategoriaProdutoAbastecimento;
  unidade: string;
  precoUnitario: number;
  vigenteDesde: string;
  origem: 'MANUAL' | 'CUPOM_CONFIRMADO';
  origemRotulo: string;
  registradoPor: string | null;
  registradoEm: string;
  vigente: boolean;
}

export interface PrecoPostoRequest {
  idProduto: string;
  precoUnitario: number;
  vigenteDesde: string | null;
}

/** Preço lido no cupom pelo Assistente, diferente do cadastrado, aguardando quem confirma. */
export interface SugestaoPrecoPosto {
  id: string;
  idAbastecimento: string;
  idPosto: string;
  posto: string;
  idProduto: string;
  produto: string;
  precoCadastrado: number | null;
  precoCupom: number;
  dataCupom: string;
  situacao: 'PENDENTE' | 'CONFIRMADA' | 'DESCARTADA';
  situacaoRotulo: string;
  decididoPor: string | null;
  decididoEm: string | null;
  criadoEm: string;
}

/** Abastecimento avulso: lançado na web por quem aprova a placa, já aprovado com as quantidades. */
export interface AbastecimentoAvulsoRequest {
  idVeiculo: string;
  idCondutor: string;
  idPosto: string;
  destino: string;
  medicao: number | null;
  observacao: string | null;
  itens: { idProduto: string; quantidade: number }[];
}

export type FilaAbastecimento = 'APROVAR' | 'LIBERAR';

export interface AbastecimentoFiltro {
  fila?: FilaAbastecimento | null;
  busca?: string | null;
  situacoes?: SituacaoAbastecimento[];
  idsBase?: string[];
  idPosto?: string | null;
  de?: string | null;
  ate?: string | null;
  comAlerta?: boolean | null;
  origem?: OrigemAbastecimento | null;
}

export interface LiberarAbastecimentoRequest {
  idPosto: string | null;
  quantidades: Record<string, number> | null;
}

export interface FaturaPosto {
  id: string;
  idPosto: string;
  posto: string;
  numero: string;
  periodoInicio: string;
  periodoFim: string;
  valor: number;
  situacao: SituacaoFaturaPosto;
  situacaoRotulo: string;
  quantidadeAbastecimentos: number;
  valorAbastecimentos: number;
  diferenca: number;
  conferidaEm: string | null;
}

export interface FaturaPostoRequest {
  idPosto: string;
  numero: string;
  periodoInicio: string;
  periodoFim: string;
  valor: number;
}

export interface ConferenciaFatura {
  fatura: FaturaPosto;
  abastecimentos: { id: string; placa: string | null; realizadoEm: string; itens: string; valor: number; incluido: boolean }[];
}
