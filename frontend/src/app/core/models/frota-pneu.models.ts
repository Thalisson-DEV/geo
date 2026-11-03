import type { CesTone } from '@ces/ui';

// ── Estoque da oficina ──────────────────────────────────────────────────────────

export interface AlmoxarifadoFrota {
  id: string;
  nome: string;
  idBaseOperacional: string | null;
  baseOperacional: string | null;
  ativo: boolean;
}

export interface AlmoxarifadoFrotaRequest {
  nome: string;
  idBaseOperacional: string | null;
}

export interface PecaFrota {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  ativo: boolean;
  saldoTotal: number;
}

export interface PecaFrotaRequest {
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
}

export interface SaldoPecaFrota {
  idEstoque: string;
  estoque: string;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  quantidade: number;
  custoMedio: number | null;
  valorTotal: number;
  estoqueMinimo: number | null;
  localizacao: string | null;
  abaixoMinimo: boolean;
}

export interface ResumoEstoqueFrota {
  itens: number;
  valorTotal: number;
  entradas: number;
  saidas: number;
  abaixoMinimo: number;
  semSaldo: number;
}

export type MotivoMovimentoFrota =
  | 'COMPRA' | 'DEVOLUCAO' | 'ORDEM_SERVICO' | 'USO_OFICINA' | 'VEICULO' | 'TRANSFERENCIA'
  | 'AJUSTE_INVENTARIO' | 'PERDA' | 'VENDA' | 'ESTORNO' | 'SALDO_INICIAL';

export type TipoMovimentoFrota = 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'AJUSTE' | 'ESTORNO';

export const ROTULO_MOTIVO_MOVIMENTO: Record<MotivoMovimentoFrota, string> = {
  COMPRA: 'Compra',
  DEVOLUCAO: 'Devolução',
  ORDEM_SERVICO: 'Ordem de serviço',
  USO_OFICINA: 'Uso na oficina',
  VEICULO: 'Retirada para veículo',
  TRANSFERENCIA: 'Transferência',
  AJUSTE_INVENTARIO: 'Ajuste de inventário',
  PERDA: 'Perda ou avaria',
  VENDA: 'Venda',
  ESTORNO: 'Estorno',
  SALDO_INICIAL: 'Saldo inicial'
};

export const MOTIVOS_ENTRADA: MotivoMovimentoFrota[] = ['COMPRA', 'DEVOLUCAO', 'SALDO_INICIAL'];
export const MOTIVOS_SAIDA: MotivoMovimentoFrota[] = ['VEICULO', 'USO_OFICINA', 'PERDA', 'VENDA'];

export const TIPO_MOVIMENTO: Record<TipoMovimentoFrota, { rotulo: string; tom: CesTone; icone: string; sinal: 1 | -1 | 0 }> = {
  ENTRADA: { rotulo: 'Entrada', tom: 'success', icone: 'pi pi-arrow-down-left', sinal: 1 },
  SAIDA: { rotulo: 'Saída', tom: 'warning', icone: 'pi pi-arrow-up-right', sinal: -1 },
  TRANSFERENCIA: { rotulo: 'Transferência', tom: 'info', icone: 'pi pi-arrow-right-arrow-left', sinal: 0 },
  AJUSTE: { rotulo: 'Ajuste', tom: 'neutral', icone: 'pi pi-sliders-h', sinal: 0 },
  ESTORNO: { rotulo: 'Estorno', tom: 'info', icone: 'pi pi-replay', sinal: 1 }
};

export interface MovimentoEstoqueFrota {
  id: string;
  dataHora: string;
  tipo: TipoMovimentoFrota;
  motivo: MotivoMovimentoFrota | null;
  motivoRotulo: string | null;
  idEstoqueOrigem: string | null;
  estoqueOrigem: string | null;
  idEstoqueDestino: string | null;
  estoqueDestino: string | null;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number | null;
  valorTotal: number;
  documento: string | null;
  observacao: string | null;
  idVeiculo: string | null;
  placa: string | null;
  idFornecedor: string | null;
  fornecedor: string | null;
  idOrdemServico: string | null;
  numeroOrdemServico: number | null;
  usuario: string | null;
  estornado: boolean;
}

export interface FiltroMovimentosFrota {
  idEstoque?: string | null;
  idMaterial?: string | null;
  idVeiculo?: string | null;
  tipos?: TipoMovimentoFrota[];
  busca?: string | null;
  de?: string | null;
  ate?: string | null;
}

export interface ItemEntradaFrota {
  idMaterial: string;
  quantidade: number;
  valorUnitario: number;
}

export interface ItemSaidaFrota {
  idMaterial: string;
  quantidade: number;
}

export interface EntradaEstoqueFrotaRequest {
  idEstoque: string;
  motivo: MotivoMovimentoFrota;
  documento: string | null;
  idFornecedor: string | null;
  observacao: string | null;
  dataHora: string | null;
  itens: ItemEntradaFrota[];
}

export interface SaidaEstoqueFrotaRequest {
  idEstoque: string;
  motivo: MotivoMovimentoFrota;
  idVeiculo: string | null;
  observacao: string | null;
  itens: ItemSaidaFrota[];
}

export interface TransferenciaEstoqueFrotaRequest {
  idOrigem: string;
  idDestino: string;
  observacao: string | null;
  itens: ItemSaidaFrota[];
}

export interface AjusteEstoqueFrotaRequest {
  idEstoque: string;
  idMaterial: string;
  quantidadeContada: number;
  observacao: string;
}

// ── Pneus ───────────────────────────────────────────────────────────────────────

export type SituacaoPneu = 'DISPONIVEL' | 'EM_USO' | 'EM_REPARO' | 'EM_REFORMA' | 'DESCARTADO';
export type AlertaPneu = 'SULCO_BAIXO' | 'SULCO_ATENCAO' | 'SERVICO_ATRASADO' | 'PRESSAO_FORA';
export type TipoEventoPneu =
  | 'CADASTRO' | 'MONTAGEM' | 'DESMONTAGEM' | 'RODIZIO' | 'ENVIO_REPARO' | 'RETORNO_REPARO'
  | 'ENVIO_REFORMA' | 'RETORNO_REFORMA' | 'DESCARTE' | 'INSPECAO' | 'TRANSFERENCIA' | 'CORRECAO';

export const SITUACAO_PNEU: Record<SituacaoPneu, { rotulo: string; tom: CesTone; icone: string }> = {
  DISPONIVEL: { rotulo: 'Disponível', tom: 'success', icone: 'pi pi-box' },
  EM_USO: { rotulo: 'Em uso', tom: 'info', icone: 'pi pi-car' },
  EM_REPARO: { rotulo: 'Em reparo', tom: 'warning', icone: 'pi pi-wrench' },
  EM_REFORMA: { rotulo: 'Em reforma', tom: 'warning', icone: 'pi pi-refresh' },
  DESCARTADO: { rotulo: 'Descartado', tom: 'neutral', icone: 'pi pi-trash' }
};

export const ALERTA_PNEU: Record<AlertaPneu, { rotulo: string; tom: CesTone; icone: string }> = {
  SULCO_BAIXO: { rotulo: 'Sulco no limite', tom: 'danger', icone: 'pi pi-exclamation-triangle' },
  SULCO_ATENCAO: { rotulo: 'Sulco perto do limite', tom: 'warning', icone: 'pi pi-exclamation-circle' },
  SERVICO_ATRASADO: { rotulo: 'Há mais de 30 dias no serviço', tom: 'warning', icone: 'pi pi-clock' },
  PRESSAO_FORA: { rotulo: 'Pressão fora da faixa', tom: 'warning', icone: 'pi pi-gauge' }
};

export const EVENTO_PNEU: Record<TipoEventoPneu, { rotulo: string; icone: string; tom: CesTone }> = {
  CADASTRO: { rotulo: 'Cadastro', icone: 'pi pi-plus-circle', tom: 'neutral' },
  MONTAGEM: { rotulo: 'Montagem', icone: 'pi pi-download', tom: 'info' },
  DESMONTAGEM: { rotulo: 'Desmontagem', icone: 'pi pi-upload', tom: 'neutral' },
  RODIZIO: { rotulo: 'Rodízio', icone: 'pi pi-sync', tom: 'info' },
  ENVIO_REPARO: { rotulo: 'Envio para reparo', icone: 'pi pi-wrench', tom: 'warning' },
  RETORNO_REPARO: { rotulo: 'Retorno do reparo', icone: 'pi pi-check-circle', tom: 'success' },
  ENVIO_REFORMA: { rotulo: 'Envio para reforma', icone: 'pi pi-refresh', tom: 'warning' },
  RETORNO_REFORMA: { rotulo: 'Retorno da reforma', icone: 'pi pi-check-circle', tom: 'success' },
  DESCARTE: { rotulo: 'Descarte', icone: 'pi pi-trash', tom: 'danger' },
  INSPECAO: { rotulo: 'Inspeção', icone: 'pi pi-gauge', tom: 'neutral' },
  TRANSFERENCIA: { rotulo: 'Transferência', icone: 'pi pi-arrow-right-arrow-left', tom: 'neutral' },
  CORRECAO: { rotulo: 'Correção', icone: 'pi pi-pencil', tom: 'neutral' }
};

export interface Pneu {
  id: string;
  numero: number;
  marcaFogo: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string | null;
  medida: string | null;
  largura: number | null;
  perfil: number | null;
  aro: string | null;
  radial: boolean;
  comCamara: boolean;
  indiceCarga: string | null;
  indiceVelocidade: string | null;
  lonas: number | null;
  dot: string | null;
  idFornecedor: string | null;
  fornecedor: string | null;
  notaFiscal: string | null;
  dataCompra: string | null;
  valorCompra: number | null;
  sulcoInicialMm: number | null;
  sulcoAtualMm: number | null;
  pressaoRecomendadaPsi: number | null;
  ultimaPressaoPsi: number | null;
  vida: number;
  kmVida: number;
  kmTotal: number;
  situacao: SituacaoPneu;
  situacaoRotulo: string;
  idEstoque: string | null;
  estoque: string | null;
  idVeiculo: string | null;
  placa: string | null;
  posicao: string | null;
  posicaoRotulo: string | null;
  montadoEm: string | null;
  idFornecedorServico: string | null;
  fornecedorServico: string | null;
  enviadoEm: string | null;
  descartadoEm: string | null;
  motivoDescarte: string | null;
  observacao: string | null;
  custoTotal: number;
  custoPorKm: number | null;
  alertas: AlertaPneu[];
}

export interface PneuRequest {
  marcaFogo: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string | null;
  largura: number | null;
  perfil: number | null;
  aro: string | null;
  radial: boolean;
  comCamara: boolean;
  indiceCarga: string | null;
  indiceVelocidade: string | null;
  lonas: number | null;
  dot: string | null;
  idFornecedor: string | null;
  notaFiscal: string | null;
  dataCompra: string | null;
  valorCompra: number | null;
  sulcoInicialMm: number | null;
  pressaoRecomendadaPsi: number | null;
  observacao: string | null;
  vida: number | null;
  kmVida: number | null;
  sulcoAtualMm: number | null;
  idEstoque: string | null;
}

export interface FiltroPneus {
  busca?: string | null;
  situacoes?: SituacaoPneu[];
  idVeiculo?: string | null;
  idEstoque?: string | null;
  marca?: string | null;
  sulcoBaixo?: boolean | null;
}

export interface ResumoPneus {
  total: number;
  emUso: number;
  disponiveis: number;
  emReparo: number;
  emReforma: number;
  descartados: number;
  sulcoBaixo: number;
  sulcoAtencao: number;
  servicoAtrasado: number;
  sulcoMinimoMm: number;
  custoTotal: number;
  custoPorKm: number | null;
}

export interface EventoPneu {
  id: string;
  idPneu: string;
  marcaFogo: string | null;
  tipo: TipoEventoPneu;
  tipoRotulo: string;
  ocorridoEm: string;
  idVeiculo: string | null;
  placa: string | null;
  posicaoOrigem: string | null;
  posicaoOrigemRotulo: string | null;
  posicaoDestino: string | null;
  posicaoDestinoRotulo: string | null;
  kmVeiculo: number | null;
  kmRodado: number | null;
  vida: number;
  sulcoMm: number | null;
  pressaoPsi: number | null;
  valor: number | null;
  fornecedor: string | null;
  documento: string | null;
  descricao: string;
  observacao: string | null;
  usuario: string | null;
}

export interface FiltroEventosPneu {
  idPneu?: string | null;
  idVeiculo?: string | null;
  tipos?: TipoEventoPneu[];
  de?: string | null;
  ate?: string | null;
}

export interface PosicaoPneuVeiculo {
  codigo: string;
  eixo: number;
  rotulo: string;
  estepe: boolean;
  pneu: Pneu | null;
}

export interface VeiculoPneus {
  idVeiculo: string;
  placa: string;
  tipoVeiculo: string | null;
  eixos: string | null;
  estepes: number;
  kmAtual: number | null;
  unidade: 'KM' | 'HORAS';
  sulcoMinimoMm: number;
  ultimaInspecaoEm: string | null;
  posicoes: PosicaoPneuVeiculo[];
}

export type TipoDestinoPneu = 'POSICAO' | 'ESTOQUE' | 'REPARO' | 'REFORMA' | 'DESCARTE';

export interface DestinoPneu {
  idPneu: string;
  destino: TipoDestinoPneu;
  posicao?: string | null;
  idEstoque?: string | null;
  idFornecedor?: string | null;
  motivo?: string | null;
}

export interface MovimentacaoPneusRequest {
  idVeiculo: string;
  realizadaEm: string | null;
  km: number | null;
  observacao: string | null;
  destinos: DestinoPneu[];
}

export interface RetornoPneuRequest {
  idEstoque: string;
  valor: number | null;
  idFornecedor: string | null;
  documento: string | null;
  sulcoMm: number | null;
  ocorridoEm: string | null;
  observacao: string | null;
}

export interface InspecaoPneuRequest {
  idVeiculo: string;
  realizadaEm: string | null;
  km: number | null;
  idResponsavel: string | null;
  observacao: string | null;
  itens: { idPneu: string; pressaoPsi: number | null; sulcoMm: number | null; observacao: string | null }[];
}

export interface InspecaoPneu {
  id: string;
  idVeiculo: string;
  placa: string;
  realizadaEm: string;
  km: number | null;
  idResponsavel: string | null;
  responsavel: string | null;
  observacao: string | null;
  registradoPor: string | null;
  alertas: number;
  itens: {
    idPneu: string;
    marcaFogo: string | null;
    posicao: string;
    posicaoRotulo: string;
    pressaoPsi: number | null;
    pressaoRecomendadaPsi: number | null;
    pressaoFora: boolean;
    sulcoMm: number | null;
    sulcoBaixo: boolean;
    observacao: string | null;
  }[];
}

/** Diagramas prontos para escolher no veículo (eixos da frente para trás). */
export const MODELOS_DIAGRAMA: { rotulo: string; descricao: string; eixos: string; estepes: number }[] = [
  { rotulo: 'Carro ou picape', descricao: '2 eixos simples, 4 rodas', eixos: 'S,S', estepes: 1 },
  { rotulo: 'Caminhão toco', descricao: 'Dianteiro simples e traseiro duplo, 6 rodas', eixos: 'S,D', estepes: 1 },
  { rotulo: 'Caminhão truck', descricao: 'Dianteiro simples e 2 traseiros duplos, 10 rodas', eixos: 'S,D,D', estepes: 1 },
  { rotulo: 'Bitruck', descricao: '2 dianteiros simples e 2 traseiros duplos, 12 rodas', eixos: 'S,S,D,D', estepes: 1 },
  { rotulo: 'Cavalo mecânico', descricao: 'Dianteiro simples e 2 traseiros duplos', eixos: 'S,D,D', estepes: 0 },
  { rotulo: 'Carreta 3 eixos', descricao: '3 eixos duplos, 12 rodas', eixos: 'D,D,D', estepes: 1 },
  { rotulo: 'Máquina (2 eixos)', descricao: 'Retroescavadeira, compressor', eixos: 'S,S', estepes: 0 }
];

export const formatarKm = (km: number | null | undefined, unidade: 'KM' | 'HORAS' = 'KM') =>
  km === null || km === undefined ? '—' : `${km.toLocaleString('pt-BR')} ${unidade === 'HORAS' ? 'h' : 'km'}`;

export const formatarSulco = (mm: number | null | undefined) =>
  mm === null || mm === undefined ? '—' : `${mm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;

/** Tom do sulco: abaixo do mínimo é perigo; até 1,5 mm acima, atenção. */
export function tomSulco(mm: number | null | undefined, minimo: number): CesTone {
  if (mm === null || mm === undefined) return 'neutral';
  if (mm <= minimo) return 'danger';
  if (mm <= minimo + 1.5) return 'warning';
  return 'success';
}

export function rotuloPosicao(codigo: string | null | undefined): string {
  if (!codigo) return '';
  if (codigo.startsWith('S')) return codigo === 'S1' ? 'Estepe' : `Estepe ${codigo.slice(1)}`;
  const eixo = codigo.replace(/\D/g, '');
  const lado = codigo.replace(/\d/g, '');
  const texto: Record<string, string> = {
    E: 'esquerda', D: 'direita', EE: 'esquerda externa', EI: 'esquerda interna', DI: 'direita interna', DE: 'direita externa'
  };
  return `Eixo ${eixo} ${texto[lado] ?? lado}`;
}

export const formatarCustoKm = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? '—' : `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}/km`;

/**
 * Km abaixo do último registrado distorce o km rodado de cada pneu montado. Só faz sentido em
 * lançamento retroativo, com a data preenchida.
 */
export function erroKmMovimentacao(km: number | null | undefined, atual: number | null | undefined, comData: boolean, unidade: 'KM' | 'HORAS' = 'KM'): string | undefined {
  if (km === null || km === undefined || atual === null || atual === undefined || km >= atual || comData) return undefined;
  return `Menor que o último registrado (${formatarKm(atual, unidade)}). Confira o valor ou informe em Quando a data da troca.`;
}
