/**
 * Contratos do módulo de frota (backend `/v1/frota`). Decisões de domínio em
 * `docs/adr/0001-modulo-gestao-frota.md` na raiz do monorepo.
 */
import type { PreventivaOrdemServico } from './frota-preventiva.models';
import type { CesTone } from '@ces/ui';

export type SituacaoOperacional = 'ATIVO' | 'EM_MANUTENCAO' | 'PARADO' | 'RESERVA' | 'BAIXADO';
export type RegimeVeiculo = 'PROPRIO' | 'LOCADO';
export type Combustivel = 'DIESEL_S10' | 'DIESEL_S500' | 'GASOLINA' | 'ETANOL' | 'FLEX' | 'GNV' | 'ELETRICO';
export type ProvedorTelemetria = 'UBICALY' | 'ZUQ';
export type CategoriaCnh = 'A' | 'B' | 'C' | 'D' | 'E' | 'AB' | 'AC' | 'AD' | 'AE';
export type SituacaoVencimento = 'SEM_VENCIMENTO' | 'VIGENTE' | 'A_VENCER' | 'VENCIDO';
export type TipoDocumentoFrota =
  | 'CRLV'
  | 'LICENCIAMENTO'
  | 'IPVA'
  | 'SEGURO'
  | 'TACOGRAFO'
  | 'ANTT'
  | 'INSPECAO_VEICULAR'
  | 'LAUDO_IMPLEMENTO'
  | 'CONTRATO_LOCACAO'
  | 'OUTRO';
export type OrigemLeituraOdometro = 'MANUAL' | 'CHECKLIST' | 'ABASTECIMENTO' | 'MANUTENCAO' | 'TELEMETRIA' | 'IMPORTACAO';
export type SituacaoLeituraOdometro = 'VALIDA' | 'INCONSISTENTE' | 'ANULADA';
/** Odômetro em km ou horímetro em horas. */
export type UnidadeMedicao = 'KM' | 'HORAS';
export type TipoLeituraOdometro = 'LEITURA' | 'TROCA_PAINEL';
export type OrigemVinculoCondutor = 'MANUAL' | 'CHECKLIST' | 'TURNO' | 'IMPORTACAO';

export interface OpcaoFrota<T extends string = string> {
  valor: T;
  rotulo: string;
}

export interface OpcoesFrota {
  situacoes: OpcaoFrota<SituacaoOperacional>[];
  regimes: OpcaoFrota<RegimeVeiculo>[];
  combustiveis: OpcaoFrota<Combustivel>[];
  provedoresTelemetria: OpcaoFrota<ProvedorTelemetria>[];
  categoriasCnh: OpcaoFrota<CategoriaCnh>[];
  tiposDocumento: OpcaoFrota<TipoDocumentoFrota>[];
  origensOdometro: OpcaoFrota<OrigemLeituraOdometro>[];
  situacoesOrdemServico: OpcaoFrota<SituacaoOrdemServico>[];
  criticidades: OpcaoFrota<Criticidade>[];
  tiposManutencao: OpcaoFrota<TipoManutencao>[];
  origensOrdemServico: OpcaoFrota<OrigemOrdemServico>[];
  tiposOficina: OpcaoFrota<TipoOficina>[];
  motivosServico: OpcaoFrota<MotivoServico>[];
  naturezasServico: OpcaoFrota[];
  situacoesAprovacao: OpcaoFrota<SituacaoAprovacaoOrcamento>[];
  causasManutencao: OpcaoFrota<CausaManutencao>[];
  origensPeca: OpcaoFrota<OrigemPeca>[];
  tiposSinistro: OpcaoFrota<TipoSinistro>[];
  situacoesSinistro: OpcaoFrota<SituacaoSinistro>[];
}

/** O que aconteceu com o veículo no sinistro. */
export type TipoSinistro =
  | 'COLISAO_SEM_VITIMA'
  | 'COLISAO_COM_VITIMA'
  | 'SEM_TERCEIROS'
  | 'INTRAFROTA'
  | 'CARGA_AVARIADA'
  | 'FURTO'
  | 'ASSALTO';

/** Andamento do sinistro; só avança. */
export type SituacaoSinistro = 'RASCUNHO' | 'EM_OFICINA' | 'SEGURADORA_ACIONADA' | 'FINALIZADO' | 'CANCELADO';

export interface ParametrosFrota {
  faixasAlertaDias: number[];
  limiteKmDia: number;
  /** Salto diário máximo, em horas, para veículos com horímetro. */
  limiteHorasDia?: number | null;
  /** Dias em que o mesmo item na mesma placa conta como manutenção repetida. */
  janelaRepeticaoDias?: number | null;
  /** Trava do campo: o app e o servidor recusam KM acima disto sobre a última leitura. */
  limiteSaltoKm?: number | null;
  /** Mesma trava no horímetro; zero ou vazio, sem trava de salto. */
  limiteSaltoHoras?: number | null;
  /** Expediente que separa o uso normal do uso fora do expediente; ausente mantém o atual. */
  expediente?: ExpedienteFrota | null;
}

export interface ExpedienteFrota {
  /** "HH:mm" ou "HH:mm:ss". */
  inicio: string;
  fim: string;
  sabado: boolean;
}

export interface TipoVeiculo {
  id: string;
  nome: string;
  descricao: string | null;
  categoriaCnhMinima: CategoriaCnh | null;
  ativo: boolean;
}

export interface TipoVeiculoRequest {
  nome: string;
  descricao: string | null;
  categoriaCnhMinima: CategoriaCnh | null;
}

export interface TipoImplemento {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export interface TipoImplementoRequest {
  nome: string;
  descricao: string | null;
}

export interface FiltroVeiculosFrota {
  busca?: string | null;
  idsBase?: string[];
  idsTipoVeiculo?: string[];
  situacoes?: SituacaoOperacional[];
  regime?: RegimeVeiculo | null;
  ativo?: boolean | null;
  /** Pela telemetria, nos últimos 30 dias. */
  foraExpediente?: boolean | null;
  rodaPouco?: boolean | null;
}

export interface VeiculoFrotaResumo {
  idVeiculo: string;
  placa: string;
  modelo: string | null;
  fabricante: string | null;
  idBaseOperacional: string | null;
  baseOperacional: string | null;
  idTipoVeiculo: string | null;
  tipoVeiculo: string | null;
  situacao: SituacaoOperacional;
  regime: RegimeVeiculo;
  combustivel: Combustivel | null;
  anoModelo: number | null;
  kmAtual: number | null;
  kmAtualEm: string | null;
  idCondutorAtual: string | null;
  condutorAtual: string | null;
  implementosAcoplados: string[];
  documentosVencidos: number;
  documentosAVencer: number;
  leiturasInconsistentes: number;
  ativo: boolean;
  /** Unidade de `kmAtual`. */
  unidadeMedicao: UnidadeMedicao;
  /** Valor atual somado ao que os painéis anteriores rodaram. */
  acumulado: number | null;
  /** Uso nos últimos 30 dias pela telemetria; nulo sem rastreador medindo o veículo. */
  uso: UsoRecenteVeiculo | null;
}

/** {@code rodaPouco}: menos de 20 km por dia útil medido (com ao menos 5 dias medidos). */
export interface UsoRecenteVeiculo {
  km: number;
  kmPorDiaUtil: number;
  kmForaExpediente: number;
  diasForaExpediente: number;
  rodaPouco: boolean;
}

export interface VeiculoFrotaRequest {
  placa: string;
  modelo: string;
  fabricante: string;
  idBaseOperacional: string;
  idTipoVeiculo: string | null;
  anoFabricacao: number | null;
  anoModelo: number | null;
  chassi: string | null;
  renavam: string | null;
  cor: string | null;
  combustivel: Combustivel | null;
  capacidadeTanqueLitros: number | null;
  consumoReferenciaKmL: number | null;
  situacao: SituacaoOperacional | null;
  regime: RegimeVeiculo | null;
  locadora: string | null;
  custoMensalLocacao: number | null;
  inicioLocacao: string | null;
  fimLocacao: string | null;
  provedorTelemetria: ProvedorTelemetria | null;
  idRastreador: string | null;
  observacao: string | null;
  /** Nula mantém a atual. Com leituras, só muda por troca de painel. */
  unidadeMedicao?: UnidadeMedicao | null;
}

export interface VinculoCondutor {
  id: string;
  idVeiculo: string;
  placa: string | null;
  idColaborador: string;
  condutor: string | null;
  inicio: string;
  fim: string | null;
  origem: OrigemVinculoCondutor;
  observacao: string | null;
}

export interface AcoplamentoImplemento {
  id: string;
  idImplemento: string;
  identificacao: string;
  tipoImplemento: string;
  idVeiculo: string;
  placa: string | null;
  inicio: string;
  fim: string | null;
  observacao: string | null;
}

export interface VeiculoFrotaDetalhe {
  idVeiculo: string;
  placa: string;
  modelo: string | null;
  fabricante: string | null;
  idBaseOperacional: string | null;
  baseOperacional: string | null;
  tipoVeiculo: TipoVeiculo | null;
  anoFabricacao: number | null;
  anoModelo: number | null;
  chassi: string | null;
  renavam: string | null;
  cor: string | null;
  combustivel: Combustivel | null;
  capacidadeTanqueLitros: number | null;
  consumoReferenciaKmL: number | null;
  situacao: SituacaoOperacional;
  regime: RegimeVeiculo;
  locadora: string | null;
  custoMensalLocacao: number | null;
  inicioLocacao: string | null;
  fimLocacao: string | null;
  provedorTelemetria: ProvedorTelemetria | null;
  idRastreador: string | null;
  observacao: string | null;
  kmAtual: number | null;
  kmAtualEm: string | null;
  condutorAtual: VinculoCondutor | null;
  implementosAcoplados: AcoplamentoImplemento[];
  documentosVencidos: number;
  documentosAVencer: number;
  leiturasInconsistentes: number;
  ativo: boolean;
  unidadeMedicao: UnidadeMedicao;
  acumulado: number | null;
}

export interface VincularCondutorRequest {
  idColaborador: string;
  inicio: string;
  observacao: string | null;
}

export interface FiltroImplementos {
  busca?: string | null;
  idsBase?: string[];
  idsTipoImplemento?: string[];
  situacoes?: SituacaoOperacional[];
  idVeiculo?: string | null;
  acoplado?: boolean | null;
  ativo?: boolean | null;
}

export interface Implemento {
  id: string;
  identificacao: string;
  idTipoImplemento: string;
  tipoImplemento: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  anoFabricacao: number | null;
  idBaseOperacional: string;
  baseOperacional: string | null;
  situacao: SituacaoOperacional;
  observacao: string | null;
  acoplamentoAtual: AcoplamentoImplemento | null;
  ativo: boolean;
}

export interface ImplementoRequest {
  identificacao: string;
  idTipoImplemento: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  anoFabricacao: number | null;
  idBaseOperacional: string;
  situacao: SituacaoOperacional | null;
  observacao: string | null;
}

export interface AcoplarImplementoRequest {
  idVeiculo: string;
  inicio: string;
  observacao: string | null;
}

export interface FiltroCondutores {
  busca?: string | null;
  idsBase?: string[];
  categorias?: CategoriaCnh[];
  situacaoCnh?: SituacaoVencimento | null;
  ativo?: boolean | null;
}

export interface Condutor {
  id: string;
  idColaborador: string;
  nome: string | null;
  funcao: string | null;
  baseOperacional: string | null;
  cnhNumeroMascarado: string | null;
  cnhCategoria: CategoriaCnh | null;
  cnhValidade: string | null;
  cnhPrimeiraHabilitacao: string | null;
  situacaoCnh: SituacaoVencimento;
  diasParaVencerCnh: number | null;
  idVeiculoAtual: string | null;
  placaAtual: string | null;
  conduzDesde: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface CondutorRequest {
  cnhNumero: string;
  cnhCategoria: CategoriaCnh;
  cnhValidade: string;
  cnhPrimeiraHabilitacao: string | null;
  observacao: string | null;
}

export interface FiltroDocumentosFrota {
  busca?: string | null;
  idVeiculo?: string | null;
  idImplemento?: string | null;
  idsBase?: string[];
  tipos?: TipoDocumentoFrota[];
  situacao?: SituacaoVencimento | null;
  vencimentoAte?: string | null;
}

export interface DocumentoFrota {
  id: string;
  idVeiculo: string | null;
  placa: string | null;
  idImplemento: string | null;
  implemento: string | null;
  tipo: TipoDocumentoFrota;
  tipoRotulo: string;
  descricao: string | null;
  numero: string | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  situacaoVencimento: SituacaoVencimento;
  diasParaVencer: number | null;
  observacao: string | null;
  possuiArquivo: boolean;
  arquivoNome: string | null;
  arquivoContentType: string | null;
  arquivoTamanhoBytes: number | null;
}

export interface DocumentoFrotaRequest {
  idVeiculo: string | null;
  idImplemento: string | null;
  tipo: TipoDocumentoFrota;
  descricao: string | null;
  numero: string | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  observacao: string | null;
}

export interface FiltroLeiturasOdometro {
  idVeiculo?: string | null;
  idsBase?: string[];
  situacoes?: SituacaoLeituraOdometro[];
  origens?: OrigemLeituraOdometro[];
}

export interface LeituraOdometro {
  id: string;
  idVeiculo: string;
  placa: string | null;
  km: number;
  lidoEm: string;
  origem: OrigemLeituraOdometro;
  idOrigem: string | null;
  situacao: SituacaoLeituraOdometro;
  motivoSituacao: string | null;
  kmAnterior: number | null;
  registradoPor: string | null;
  dataAnulacao: string | null;
  justificativaAnulacao: string | null;
  /** Unidade de `km` e `kmAnterior`. */
  unidade: UnidadeMedicao;
  tipo: TipoLeituraOdometro;
  /** Na troca de painel: último valor do painel antigo menos o inicial do novo. */
  deslocamento: number | null;
}

export interface RegistrarLeituraRequest {
  km: number;
  lidoEm: string;
  /** Obrigatória quando o valor passa a trava de salto (viagem longa sem lançamentos). */
  justificativa?: string | null;
}

export interface TrocaPainelRequest {
  valorFechamento: number;
  valorInicial: number;
  /** Nula mantém a unidade atual do veículo. */
  unidade: UnidadeMedicao | null;
  lidoEm: string;
  observacao: string | null;
}

// ── Apresentação ───────────────────────────────────────────────────────────────

export const TOM_SITUACAO: Record<SituacaoOperacional, CesTone> = {
  ATIVO: 'success',
  EM_MANUTENCAO: 'warning',
  PARADO: 'danger',
  RESERVA: 'info',
  BAIXADO: 'neutral'
};

export const ROTULO_SITUACAO: Record<SituacaoOperacional, string> = {
  ATIVO: 'Ativo',
  EM_MANUTENCAO: 'Em manutenção',
  PARADO: 'Parado',
  RESERVA: 'Reserva',
  BAIXADO: 'Baixado'
};

export const ROTULO_REGIME: Record<RegimeVeiculo, string> = {
  PROPRIO: 'Próprio',
  LOCADO: 'Locado'
};

export const TOM_VENCIMENTO: Record<SituacaoVencimento, CesTone> = {
  SEM_VENCIMENTO: 'neutral',
  VIGENTE: 'success',
  A_VENCER: 'warning',
  VENCIDO: 'danger'
};

export const ROTULO_VENCIMENTO: Record<SituacaoVencimento, string> = {
  SEM_VENCIMENTO: 'Sem vencimento',
  VIGENTE: 'Vigente',
  A_VENCER: 'A vencer',
  VENCIDO: 'Vencido'
};

export const TOM_LEITURA: Record<SituacaoLeituraOdometro, CesTone> = {
  VALIDA: 'success',
  INCONSISTENTE: 'warning',
  ANULADA: 'neutral'
};

export const ROTULO_LEITURA: Record<SituacaoLeituraOdometro, string> = {
  VALIDA: 'Válida',
  INCONSISTENTE: 'Inconsistente',
  ANULADA: 'Anulada'
};

export const ROTULO_UNIDADE: Record<UnidadeMedicao, string> = {
  KM: 'Quilômetros (odômetro)',
  HORAS: 'Horas (horímetro)'
};

/** Sufixo do valor medido: "km" ou "h". */
export function sufixoUnidade(unidade: UnidadeMedicao | null | undefined): string {
  return unidade === 'HORAS' ? 'h' : 'km';
}

/** Nome do instrumento: "Odômetro" ou "Horímetro". */
export function nomeMedidor(unidade: UnidadeMedicao | null | undefined): string {
  return unidade === 'HORAS' ? 'Horímetro' : 'Odômetro';
}

/** Valor com o sufixo da unidade e separador de milhar: "4.009 h", "264.776 km". */
export function formatarMedicao(valor: number | null | undefined, unidade: UnidadeMedicao | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return `${valor.toLocaleString('pt-BR')} ${sufixoUnidade(unidade)}`;
}

/** Origem para exibir: a troca de painel aparece como tal, não como lançamento manual. */
export function rotuloOrigemLeitura(l: Pick<LeituraOdometro, 'origem' | 'tipo'>): string {
  return l.tipo === 'TROCA_PAINEL' ? 'Troca de painel' : ROTULO_ORIGEM_LEITURA[l.origem];
}

/** Rótulo do valor atual: "KM atual" ou "Horímetro atual". */
export function rotuloValorAtual(unidade: UnidadeMedicao | null | undefined): string {
  return unidade === 'HORAS' ? 'Horímetro atual' : 'KM atual';
}

export const ROTULO_ORIGEM_LEITURA: Record<OrigemLeituraOdometro, string> = {
  MANUAL: 'Lançamento manual',
  CHECKLIST: 'Checklist',
  ABASTECIMENTO: 'Abastecimento',
  MANUTENCAO: 'Manutenção',
  TELEMETRIA: 'Telemetria',
  IMPORTACAO: 'Importação'
};

/** Frase curta do prazo de um vencimento: "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function descreverPrazo(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return 'Sem vencimento';
  if (dias === 0) return 'Vence hoje';
  if (dias > 0) return `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const atraso = -dias;
  return `Venceu há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`;
}

/** Data local (`Date`) → `yyyy-MM-dd`, sem deslocar pelo fuso. */
export function paraDataIso(data: Date | null | undefined): string | null {
  if (!data) return null;
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** `yyyy-MM-dd` → `Date` local à meia-noite. */
export function deDataIso(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const [ano, mes, dia] = valor.substring(0, 10).split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Instante local → ISO 8601 com o deslocamento do navegador (ex.: `2026-10-09T14:30:00-03:00`). */
export function paraInstanteIso(data: Date): string {
  const deslocamento = -data.getTimezoneOffset();
  const sinal = deslocamento >= 0 ? '+' : '-';
  const abs = Math.abs(deslocamento);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}` +
    `T${pad(data.getHours())}:${pad(data.getMinutes())}:00` +
    `${sinal}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Placa no formato de exibição: AAA-1234 ou AAA1A23 (Mercosul). */
export function formatarPlaca(placa: string | null | undefined): string {
  if (!placa) return '';
  const limpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}\d{4}$/.test(limpa) ? `${limpa.slice(0, 3)}-${limpa.slice(3)}` : limpa;
}

/**
 * Número com unidade em pt-BR (`12.345 km`, `1,5 km/l`). Valor ausente vira o texto de
 * `vazio`, para a tela nunca mostrar "null km".
 */
export function formatarMedida(
  valor: number | null | undefined,
  unidade: string,
  casas = 0,
  vazio = '—'
): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return vazio;
  const numero = valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
  return unidade ? `${numero} ${unidade}` : numero;
}

/** "1 veículo", "3 veículos", "Nenhum veículo" — contagem com o plural certo. */
export function contar(quantidade: number, singular: string, plural: string, nenhum?: string): string {
  if (quantidade === 0 && nenhum) return nenhum;
  return `${quantidade.toLocaleString('pt-BR')} ${quantidade === 1 ? singular : plural}`;
}

// ── Ordens de serviço (Fase 1) ─────────────────────────────────────────────────

export type SituacaoOrdemServico = 'PENDENTE' | 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
export type Criticidade = 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAIXA';
export type TipoManutencao = 'CORRETIVA' | 'PREVENTIVA';
export type OrigemOrdemServico = 'VERBAL' | 'CHECKLIST' | 'INSPECAO' | 'PREVENTIVA' | 'MANUAL' | 'IMPORTACAO' | 'SINISTRO';
export type TipoOficina = 'INTERNA' | 'EXTERNA';
export type MotivoServico = 'DESGASTE_NATURAL' | 'ADEQUACAO_DE_MELHORIA' | 'PROBLEMA_MECANICO' | 'MAU_USO_DESCONTO' | 'OUTRA';
export type SituacaoAprovacaoOrcamento = 'SEM_ORCAMENTO' | 'EM_ORCAMENTO' | 'AGUARDANDO_APROVACAO' | 'APROVADO' | 'REPROVADO';
export type StatusSolicitacaoFinanceira = 'RASCUNHO' | 'SOLICITADO' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';

export interface ItemManutencao {
  id: string;
  nome: string;
  natureza: string;
  naturezaRotulo: string;
  descricao: string | null;
  diasRepeticao: number | null;
  ativo: boolean;
}

export interface ItemManutencaoRequest {
  nome: string;
  natureza: string;
  descricao: string | null;
  diasRepeticao: number | null;
}

export interface FiltroOrdensServico {
  busca?: string | null;
  idsBase?: string[];
  situacoes?: SituacaoOrdemServico[];
  criticidades?: Criticidade[];
  tiposManutencao?: TipoManutencao[];
  origens?: OrigemOrdemServico[];
  idsItem?: string[];
  idVeiculo?: string | null;
  idCondutor?: string | null;
  abertaDe?: string | null;
  abertaAte?: string | null;
  /** Período de conclusão (fim real): o quadro mostra as concluídas da última semana. */
  concluidaDe?: string | null;
  concluidaAte?: string | null;
  atrasadas?: boolean | null;
  veiculoParado?: boolean | null;
  comRepeticao?: boolean | null;
}

export interface OrdemServico {
  id: string;
  numero: number;
  /** Nulo na OS sem veículo (ferramental, oficina, equipamento sem placa). */
  idVeiculo: string | null;
  placa: string | null;
  veicular: boolean;
  descricaoEquipamento: string | null;
  idBaseOperacional: string | null;
  base: string | null;
  tipoManutencao: TipoManutencao;
  origem: OrigemOrdemServico;
  criticidade: Criticidade;
  motivo: MotivoServico | null;
  situacao: SituacaoOrdemServico;
  descricao: string;
  itens: string[];
  idCondutor: string | null;
  condutor: string | null;
  abertaEm: string;
  usuarioAbertura: string | null;
  kmAbertura: number | null;
  /** Unidade de kmAbertura e kmEncerramento: a do veículo na abertura. */
  unidadeMedicao: UnidadeMedicao;
  tipoOficina: TipoOficina;
  idFornecedor: string | null;
  oficinaNome: string | null;
  oficina: string;
  agendadaPara: string | null;
  localAgendamento: string | null;
  inicioReal: string | null;
  previsaoTermino: string | null;
  fimReal: string | null;
  atrasada: boolean;
  veiculoParado: boolean;
  paradoDesde: string | null;
  liberadoEm: string | null;
  paradaEmCurso: boolean;
  descricaoServico: string | null;
  itensSubstituidos: string | null;
  valorTotal: number | null;
  kmEncerramento: number | null;
  causa: CausaManutencao | null;
  canceladaEm: string | null;
  motivoCancelamento: string | null;
  situacaoAprovacao: SituacaoAprovacaoOrcamento;
  quantidadeOrcamentos: number;
  temRepeticao: boolean;
}

export interface RepeticaoManutencao {
  idOsAnterior: string;
  numeroOsAnterior: number;
  fimRealAnterior: string | null;
  diasDesdeAnterior: number | null;
  janelaDias: number;
}

export interface ItemOrdemServico {
  idItem: string;
  nome: string;
  natureza: string;
  naturezaRotulo: string;
  repeticao: RepeticaoManutencao | null;
}

export interface OrcamentoOrdemServico {
  idSolicitacao: string;
  tipo: 'COMPRA' | 'PAGAMENTO';
  numero: number;
  status: StatusSolicitacaoFinanceira;
  valor: number | null;
  valorAprovado: number | null;
  fornecedor: string | null;
  descricao: string | null;
  dataSubmissao: string | null;
  dataDecisao: string | null;
  motivoRejeicao: string | null;
}

export interface HistoricoOrdemServico {
  tipo: string;
  tipoRotulo: string;
  descricao: string | null;
  usuario: string | null;
  ocorridoEm: string;
}

export interface OrdemServicoDetalhe {
  ordem: OrdemServico;
  itens: ItemOrdemServico[];
  orcamentos: OrcamentoOrdemServico[];
  historico: HistoricoOrdemServico[];
  kmAtualVeiculo: number | null;
  avisos: string[];
  servicos: ServicoOrdemServico[];
  pecas: PecaOrdemServico[];
  totais: TotaisOrdemServico;
  /** Planos preventivos que a OS cobre, com o roteiro de inspeção copiado na abertura. */
  preventivas: PreventivaOrdemServico[];
  /** Sinistro que abriu a OS de reparo (origem SINISTRO). */
  sinistro?: { id: string; numero: number; tipo: string; situacao: string } | null;
}

/** Por que a manutenção aconteceu (obrigatória para concluir). */
export type CausaManutencao =
  | 'AVARIA'
  | 'DESGASTE_NATURAL'
  | 'USO_INDEVIDO'
  | 'SERVICO_CORRETIVO'
  | 'SERVICO_PREVENTIVO'
  | 'ESTOQUE'
  | 'SUBSTITUICAO_PNEUS';

/** De onde veio a peça: estoque só registra a origem; a baixa vem na Fase 4. */
export type OrigemPeca = 'ESTOQUE' | 'COMPRA';

export interface ServicoOrdemServico {
  id: string;
  descricao: string;
  idItemManutencao: string | null;
  itemManutencao: string | null;
  idMecanico: string | null;
  /** Nome do colaborador (oficina interna) ou o nome livre (externa). */
  mecanico: string | null;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
}

export interface PecaOrdemServico {
  id: string;
  descricao: string;
  codigo: string | null;
  origem: OrigemPeca;
  origemRotulo: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  subtotal: number;
  idMaterial?: string | null;
  idEstoque?: string | null;
  estoque?: string | null;
  baixadaNoEstoque?: boolean;
}

export interface TotaisOrdemServico {
  servicos: number;
  pecas: number;
  desconto: number;
  acrescimo: number;
  total: number | null;
  /** Verdadeiro quando o total vem dos lançamentos; falso quando vale o valor digitado. */
  calculado: boolean;
}

export type TipoDocumentoFiscal = 'NFE' | 'NFSE' | 'CUPOM' | 'RECIBO' | 'OUTRO';

export const ROTULO_DOCUMENTO_FISCAL: Record<TipoDocumentoFiscal, string> = {
  NFE: 'NF-e',
  NFSE: 'NFS-e',
  CUPOM: 'Cupom fiscal',
  RECIBO: 'Recibo',
  OUTRO: 'Outro'
};

export interface DocumentoFiscalOrdemServico {
  id: string;
  tipo: TipoDocumentoFiscal;
  tipoRotulo: string;
  numero: string;
  serie: string | null;
  emitidoEm: string;
  idFornecedor: string | null;
  fornecedor: string | null;
  valor: number;
  possuiArquivo: boolean;
  arquivoNome: string | null;
  arquivoContentType: string | null;
  arquivoTamanhoBytes: number | null;
  registradoEm: string;
  registradoPor: string | null;
}

export interface DocumentoFiscalOrdemServicoRequest {
  tipo: TipoDocumentoFiscal;
  numero: string;
  serie: string | null;
  emitidoEm: string;
  idFornecedor: string | null;
  fornecedorNome: string | null;
  valor: number;
}

export interface ServicoOrdemServicoRequest {
  descricao: string;
  idItemManutencao: string | null;
  idMecanico: string | null;
  mecanicoNome: string | null;
  quantidade: number;
  valorUnitario: number;
}

export interface PecaOrdemServicoRequest {
  descricao: string;
  codigo: string | null;
  origem: OrigemPeca;
  quantidade: number;
  unidade: string;
  /** Nulo na peça do almoxarifado: vale o custo médio. */
  valorUnitario: number | null;
  idMaterial?: string | null;
  idEstoque?: string | null;
}

export interface PainelOrdensServico {
  pendentes: number;
  pendentesPorCriticidade: Record<Criticidade, number>;
  agendadas: number;
  agendadasVencidas: number;
  emAndamento: number;
  atrasadas: number;
  concluidasUltimos30Dias: number;
  veiculosParados: number;
  aguardandoAprovacao: number;
}

export interface AbrirOrdemServicoRequest {
  /** Nulo abre a OS sem veículo, com base e equipamento. */
  idVeiculo: string | null;
  tipoManutencao: TipoManutencao;
  origem: OrigemOrdemServico;
  criticidade: Criticidade;
  motivo: MotivoServico | null;
  descricao: string;
  idsItem: string[];
  idCondutor: string | null;
  abertaEm: string | null;
  kmAbertura: number | null;
  tipoOficina: TipoOficina;
  idFornecedor: string | null;
  oficinaNome: string | null;
  veiculoParado: boolean | null;
  idBaseOperacional?: string | null;
  descricaoEquipamento?: string | null;
}

export type EditarOrdemServicoRequest = Omit<
  AbrirOrdemServicoRequest,
  'idVeiculo' | 'abertaEm' | 'kmAbertura' | 'veiculoParado' | 'idBaseOperacional' | 'descricaoEquipamento'
>;

export interface ConcluirOrdemServicoRequest {
  inicioReal: string | null;
  fimReal: string;
  descricaoServico: string;
  itensSubstituidos: string | null;
  valorTotal: number | null;
  kmEncerramento: number | null;
  tipoOficina: TipoOficina;
  idFornecedor: string | null;
  oficinaNome: string | null;
  idsItem: string[] | null;
  causa: CausaManutencao | null;
}

export interface PreviaRepeticao {
  idItem: string;
  nome: string;
  repeticao: RepeticaoManutencao;
}

export interface FornecedorFrota {
  id: string;
  nome: string;
}

/** Valores da OS para pré-preencher a compra ou o pagamento no financeiro (chaves canônicas). */
export interface PreenchimentoFinanceiro {
  origemTipo: string;
  referencia: string;
  varianteSugerida: string;
  valores: Record<string, unknown>;
  rotulos: Record<string, string>;
}

export const TOM_SITUACAO_OS: Record<SituacaoOrdemServico, CesTone> = {
  PENDENTE: 'warning',
  AGENDADA: 'info',
  EM_ANDAMENTO: 'info',
  CONCLUIDA: 'success',
  CANCELADA: 'neutral'
};

export const ROTULO_SITUACAO_OS: Record<SituacaoOrdemServico, string> = {
  PENDENTE: 'Pendente',
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada'
};

export const ICONE_SITUACAO_OS: Record<SituacaoOrdemServico, string> = {
  PENDENTE: 'pi-inbox',
  AGENDADA: 'pi-calendar',
  EM_ANDAMENTO: 'pi-wrench',
  CONCLUIDA: 'pi-check',
  CANCELADA: 'pi-ban'
};

export const TOM_CRITICIDADE: Record<Criticidade, CesTone> = {
  URGENTE: 'danger',
  ALTA: 'warning',
  MEDIA: 'info',
  BAIXA: 'neutral'
};

export const ROTULO_CRITICIDADE: Record<Criticidade, string> = {
  URGENTE: 'Urgente',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa'
};

export const ROTULO_TIPO_MANUTENCAO: Record<TipoManutencao, string> = {
  CORRETIVA: 'Corretiva',
  PREVENTIVA: 'Preventiva'
};

export const ROTULO_ORIGEM_OS: Record<OrigemOrdemServico, string> = {
  VERBAL: 'Comunicação verbal',
  CHECKLIST: 'Checklist',
  INSPECAO: 'Inspeção',
  PREVENTIVA: 'Plano preventivo',
  MANUAL: 'Lançamento manual',
  IMPORTACAO: 'Importação',
  SINISTRO: 'Sinistro'
};

export const ROTULO_TIPO_OFICINA: Record<TipoOficina, string> = {
  INTERNA: 'Oficina interna',
  EXTERNA: 'Oficina externa'
};

export const TOM_APROVACAO: Record<SituacaoAprovacaoOrcamento, CesTone> = {
  SEM_ORCAMENTO: 'neutral',
  EM_ORCAMENTO: 'info',
  AGUARDANDO_APROVACAO: 'warning',
  APROVADO: 'success',
  REPROVADO: 'danger'
};

export const ROTULO_APROVACAO: Record<SituacaoAprovacaoOrcamento, string> = {
  SEM_ORCAMENTO: 'Pendente de orçamento',
  EM_ORCAMENTO: 'Orçamento em preparação',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado'
};

export const TOM_STATUS_FINANCEIRO: Record<StatusSolicitacaoFinanceira, CesTone> = {
  RASCUNHO: 'neutral',
  SOLICITADO: 'warning',
  APROVADO: 'success',
  REJEITADO: 'danger',
  CANCELADO: 'neutral'
};

export const ROTULO_STATUS_FINANCEIRO: Record<StatusSolicitacaoFinanceira, string> = {
  RASCUNHO: 'Rascunho',
  SOLICITADO: 'Aguardando aprovação',
  APROVADO: 'Aprovada',
  REJEITADO: 'Reprovada',
  CANCELADO: 'Cancelada'
};

/** OS que ainda pode mudar (pendente, agendada ou em andamento). */
/** Placa formatada ou, na OS sem veículo, o equipamento. */
export function identificacaoOs(os: Pick<OrdemServico, 'veicular' | 'placa' | 'descricaoEquipamento'>): string {
  return os.veicular ? formatarPlaca(os.placa) : (os.descricaoEquipamento ?? 'Sem veículo');
}

export function osAberta(situacao: SituacaoOrdemServico): boolean {
  return situacao === 'PENDENTE' || situacao === 'AGENDADA' || situacao === 'EM_ANDAMENTO';
}

/** "OS 123" — como a equipe se refere à ordem de serviço. */
export function rotuloOs(numero: number | null | undefined): string {
  return numero == null ? 'OS' : `OS ${numero}`;
}

/** Calendário da frota: o que cada evento representa. */
export type TipoEventoAgendaFrota =
  | 'OS_AGENDADA'
  | 'OS_PREVISAO_TERMINO'
  | 'DOCUMENTO_VENCIMENTO'
  | 'CNH_VENCIMENTO'
  | 'PREVENTIVA_PREVISTA'
  | 'APOLICE_VENCIMENTO';

export interface EventoAgendaFrota {
  tipo: TipoEventoAgendaFrota;
  tipoRotulo: string;
  /** Dia civil (yyyy-MM-dd). */
  data: string;
  instante: string | null;
  titulo: string;
  detalhe: string | null;
  placa: string | null;
  base: string | null;
  idReferencia: string;
  numeroOs: number | null;
  tom: CesTone;
  atrasado: boolean;
}

export interface AgendaFrota {
  eventos: EventoAgendaFrota[];
  truncado: boolean;
}
