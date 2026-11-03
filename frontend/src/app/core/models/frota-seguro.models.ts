/** Seguros e sinistros da frota na web: apólices, veículos cobertos, parcelas e sinistros. */
import { CesTone } from '@ces/ui';
import { SituacaoPagamentoDespesa } from './frota-despesa.models';
import { SituacaoOrdemServico, SituacaoSinistro, SituacaoVencimento, TipoSinistro } from './frota.models';

export interface AnexoFrota {
  id: string;
  nome: string;
  contentType: string | null;
  tamanhoBytes: number | null;
  enviadoEm: string;
}

// ── Apólices ───────────────────────────────────────────────────────────────

export interface CoberturaApolice {
  id: string;
  idVeiculo: string;
  placa: string | null;
  modelo: string | null;
  inicio: string;
  /** Nulo: até o fim da vigência. */
  fim: string | null;
  cobertoHoje: boolean;
  motivoEncerramento: MotivoEncerramentoCobertura | null;
  motivoEncerramentoRotulo: string | null;
  observacaoEncerramento: string | null;
}

export type MotivoEncerramentoCobertura = 'VENDA' | 'PERDA_TOTAL' | 'FURTO_ROUBO' | 'DEVOLUCAO' | 'TROCA_APOLICE' | 'OUTRO';

export const MOTIVOS_ENCERRAMENTO: { label: string; value: MotivoEncerramentoCobertura }[] = [
  { label: 'Venda do veículo', value: 'VENDA' },
  { label: 'Perda total', value: 'PERDA_TOTAL' },
  { label: 'Furto ou roubo', value: 'FURTO_ROUBO' },
  { label: 'Devolução à locadora', value: 'DEVOLUCAO' },
  { label: 'Passou para outra apólice', value: 'TROCA_APOLICE' },
  { label: 'Outro motivo', value: 'OUTRO' }
];

export type PapelSeguradora = 'SEGURADORA' | 'CORRETORA';

/** Seguradora ou corretora da frota, ligada a um fornecedor do financeiro. */
export interface SeguradoraFrota {
  id: string;
  idFornecedor: string;
  nome: string;
  papel: PapelSeguradora;
  papelRotulo: string;
  /** Só dígitos. */
  telefoneAssistencia: string | null;
  observacao: string | null;
  apolicesVigentes: number;
  ativo: boolean;
}

export interface SeguradoraFrotaRequest {
  idFornecedor: string;
  papel: PapelSeguradora;
  telefoneAssistencia: string | null;
  observacao: string | null;
}

/** (71) 3333-4444, (71) 99999-0000 ou 0800 123 4567. */
export function formatarTelefone(digitos: string | null): string {
  if (!digitos) return '';
  if (digitos.startsWith('0800') && digitos.length === 11) return `0800 ${digitos.slice(4, 7)} ${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  return digitos;
}

/** Seguro de cada veículo ativo hoje (para escolher veículos e achar quem está sem seguro). */
export interface CoberturaVeiculo {
  idVeiculo: string;
  placa: string;
  modelo: string | null;
  idBaseOperacional: string | null;
  baseOperacional: string | null;
  cobertoHoje: boolean;
  /** Coberto: a apólice de hoje. Sem cobertura: a que começa depois, se houver. */
  idApolice: string | null;
  numeroApolice: string | null;
  /** Último dia coberto sem interrupção, somando as renovações cadastradas. */
  cobertoAte: string | null;
  /** Primeiro dia sem seguro, quando cai na faixa de aviso. */
  perdeCoberturaEm: string | null;
  ultimaCoberturaAte: string | null;
  proximaCoberturaEm: string | null;
}

export interface ParcelaApolice {
  id: string;
  numero: number;
  vencimento: string;
  valor: number;
  idSolicitacaoFinanceira: string | null;
  numeroSolicitacaoFinanceira: number | null;
  situacaoPagamento: SituacaoPagamentoDespesa | null;
  situacaoPagamentoRotulo: string | null;
  motivoReprovacaoPagamento: string | null;
  podePedirPagamento: boolean;
  /** Venceu sem ter ido ao financeiro. */
  vencida: boolean;
  /** Sem pedido e vence nos próximos 30 dias. */
  pedirEmBreve: boolean;
}

export interface Apolice {
  id: string;
  numero: string;
  idSeguradora: string;
  seguradora: string | null;
  idCorretor: string | null;
  corretor: string | null;
  segurado: string | null;
  idBaseOperacional: string | null;
  baseOperacional: string | null;
  idProcesso: string | null;
  processo: string | null;
  vigenciaInicio: string;
  vigenciaFim: string;
  valor: number;
  franquia: number | null;
  observacao: string | null;
  situacao: SituacaoVencimento;
  situacaoRotulo: string;
  /** Negativo depois de vencida. */
  diasParaVencer: number;
  /** Positivo enquanto a vigência não começou. */
  diasParaComecar: number;
  veiculosHoje: number;
  /** Apólice que continua a cobertura dos veículos depois do fim desta. */
  renovadaPor: { id: string; numero: string; vigenciaInicio: string } | null;
  veiculos: CoberturaApolice[];
  parcelas: ParcelaApolice[];
  totalParcelas: number;
  anexos: AnexoFrota[];
  dataCriacao: string;
  usuarioCriacao: string | null;
}

export interface ApoliceRequest {
  numero: string;
  idSeguradora: string;
  idCorretor: string | null;
  segurado: string | null;
  idBaseOperacional: string | null;
  idProcesso: string | null;
  vigenciaInicio: string;
  vigenciaFim: string;
  valor: number;
  franquia: number | null;
  observacao: string | null;
  /** Só no cadastro: cobertos por toda a vigência. */
  idsVeiculo?: string[];
}

export interface FiltroApolices {
  busca?: string | null;
  idsSeguradora?: string[];
  idVeiculo?: string | null;
  idsBase?: string[];
  situacao?: SituacaoVencimento | null;
}

// ── Sinistros ──────────────────────────────────────────────────────────────

export interface SeguradoraSinistro {
  idApolice: string;
  numeroApolice: string;
  seguradora: string | null;
  franquiaApolice: number | null;
  numeroSinistro: string | null;
  acionadaEm: string;
}

export interface ReparoSinistro {
  idOrdemServico: string;
  numero: number;
  situacao: SituacaoOrdemServico;
  situacaoRotulo: string;
  aberta: boolean;
  veiculoParado: boolean;
  fimReal: string | null;
}

export interface Sinistro {
  id: string;
  numero: number;
  idVeiculo: string;
  placa: string;
  modelo: string | null;
  idBaseOperacional: string | null;
  baseOperacional: string | null;
  ocorridoEm: string;
  local: string | null;
  tipo: TipoSinistro;
  tipoRotulo: string;
  idCondutor: string | null;
  condutor: string | null;
  /** Nulo enquanto não apurado. */
  culpaCondutor: boolean | null;
  descricao: string;
  terceiros: string | null;
  boletimOcorrencia: string | null;
  seguradora: SeguradoraSinistro | null;
  franquiaPaga: number | null;
  reparo: ReparoSinistro | null;
  situacao: SituacaoSinistro;
  situacaoRotulo: string;
  podeFinalizar: boolean;
  finalizadoEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  anexos: AnexoFrota[];
  dataCriacao: string;
  usuarioCriacao: string | null;
}

export interface SinistroRequest {
  idVeiculo: string;
  ocorridoEm: string;
  local: string | null;
  tipo: TipoSinistro;
  idCondutor: string | null;
  culpaCondutor: boolean | null;
  descricao: string;
  terceiros: string | null;
  boletimOcorrencia: string | null;
}

export interface FiltroSinistros {
  idVeiculo?: string | null;
  busca?: string | null;
  idsBase?: string[];
  tipos?: TipoSinistro[];
  situacoes?: SituacaoSinistro[];
  idCondutor?: string | null;
  idApolice?: string | null;
  de?: string | null;
  ate?: string | null;
}

export interface LinhaResumoSinistros {
  chave: string;
  rotulo: string;
  quantidade: number;
}

export interface ResumoSinistros {
  quantidade: number;
  emAndamento: number;
  comCulpaCondutor: number;
  franquiasPagas: number;
  porTipo: LinhaResumoSinistros[];
  porBase: LinhaResumoSinistros[];
  porCondutor: LinhaResumoSinistros[];
}

export const ROTULO_TIPO_SINISTRO: Record<TipoSinistro, string> = {
  COLISAO_SEM_VITIMA: 'Colisão sem vítima',
  COLISAO_COM_VITIMA: 'Colisão com vítima',
  SEM_TERCEIROS: 'Sem terceiros envolvidos',
  INTRAFROTA: 'Intrafrota',
  CARGA_AVARIADA: 'Carga avariada',
  FURTO: 'Furto',
  ASSALTO: 'Assalto'
};

export const ROTULO_SITUACAO_SINISTRO: Record<SituacaoSinistro, string> = {
  RASCUNHO: 'Rascunho',
  EM_OFICINA: 'Em oficina',
  SEGURADORA_ACIONADA: 'Seguradora acionada',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado'
};

/** Tom e ícone da situação do sinistro (a cor nunca vem sozinha: o rótulo acompanha). */
export function situacaoSinistro(s: SituacaoSinistro): { tom: CesTone; icone: string; rotulo: string } {
  switch (s) {
    case 'RASCUNHO': return { tom: 'warning', icone: 'pi pi-pencil', rotulo: ROTULO_SITUACAO_SINISTRO[s] };
    case 'EM_OFICINA': return { tom: 'info', icone: 'pi pi-wrench', rotulo: ROTULO_SITUACAO_SINISTRO[s] };
    case 'SEGURADORA_ACIONADA': return { tom: 'info', icone: 'pi pi-shield', rotulo: ROTULO_SITUACAO_SINISTRO[s] };
    case 'FINALIZADO': return { tom: 'success', icone: 'pi pi-check-circle', rotulo: ROTULO_SITUACAO_SINISTRO[s] };
    case 'CANCELADO': return { tom: 'neutral', icone: 'pi pi-ban', rotulo: ROTULO_SITUACAO_SINISTRO[s] };
  }
}

/** Tom e ícone da vigência da apólice. */
export function vigenciaApolice(
  a: Pick<Apolice, 'situacao' | 'diasParaVencer'> & Partial<Pick<Apolice, 'diasParaComecar' | 'vigenciaInicio' | 'renovadaPor'>>
): { tom: CesTone; icone: string; rotulo: string } {
  if ((a.diasParaComecar ?? 0) > 0 && a.vigenciaInicio) {
    return { tom: 'info', icone: 'pi pi-calendar', rotulo: `Começa em ${dataCurta(a.vigenciaInicio)}` };
  }
  if (a.renovadaPor && a.situacao !== 'VIGENTE') return { tom: 'success', icone: 'pi pi-replay', rotulo: 'Renovada' };
  if (a.situacao === 'VENCIDO') return { tom: 'danger', icone: 'pi pi-times-circle', rotulo: 'Vencida' };
  if (a.situacao === 'A_VENCER') {
    const dias = a.diasParaVencer;
    return { tom: 'warning', icone: 'pi pi-clock', rotulo: dias === 0 ? 'Vence hoje' : `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}` };
  }
  return { tom: 'success', icone: 'pi pi-check-circle', rotulo: 'Vigente' };
}

/** Situação do pagamento da parcela. */
export function pagamentoParcela(p: ParcelaApolice): { tom: CesTone; icone: string; rotulo: string } {
  switch (p.situacaoPagamento) {
    case 'SOLICITADO': return { tom: 'info', icone: 'pi pi-send', rotulo: 'Pagamento solicitado' };
    case 'APROVADO': return { tom: 'success', icone: 'pi pi-check-circle', rotulo: 'Pagamento aprovado' };
    case 'REPROVADO': return { tom: 'danger', icone: 'pi pi-times-circle', rotulo: 'Pagamento reprovado' };
    default:
      if (p.vencida) return { tom: 'danger', icone: 'pi pi-exclamation-triangle', rotulo: 'Vencida sem pedido' };
      // Só alerta perto do vencimento; as do ano que vem não pedem nada agora.
      return p.pedirEmBreve
        ? { tom: 'warning', icone: 'pi pi-clock', rotulo: 'Falta pedir o pagamento' }
        : { tom: 'neutral', icone: 'pi pi-calendar', rotulo: 'Programada' };
  }
}

/** Situação do veículo dentro da apólice: coberto hoje, a partir de quando ou desde quando saiu. */
export function coberturaNaApolice(c: CoberturaApolice, a: Pick<Apolice, 'vigenciaInicio' | 'vigenciaFim'>, hoje = hojeIso()): {
  tom: CesTone; icone: string; rotulo: string;
} {
  if (c.cobertoHoje) return { tom: 'success', icone: 'pi pi-check-circle', rotulo: 'Coberto hoje' };
  const inicio = c.inicio > a.vigenciaInicio ? c.inicio : a.vigenciaInicio;
  if (inicio > hoje) return { tom: 'info', icone: 'pi pi-calendar', rotulo: `Coberto a partir de ${dataCurta(inicio)}` };
  const fim = c.fim ?? a.vigenciaFim;
  return { tom: 'neutral', icone: 'pi pi-minus-circle', rotulo: c.motivoEncerramentoRotulo ? `Saiu em ${dataCurta(fim)}` : `Coberto até ${dataCurta(fim)}` };
}

/** Rótulo do veículo para escolher: placa, modelo, base e o seguro de hoje. */
export function rotuloVeiculoSeguro(placa: string, modelo: string | null, c: CoberturaVeiculo | undefined): string {
  const partes = [placa + (modelo ? ' · ' + modelo : '')];
  if (c?.baseOperacional) partes.push(c.baseOperacional);
  if (c) {
    partes.push(c.cobertoHoje
      ? `coberto pela ${c.numeroApolice} até ${dataCurta(c.cobertoAte!)}`
      : c.proximaCoberturaEm ? `sem seguro até ${dataCurta(c.proximaCoberturaEm)}` : 'sem seguro');
  }
  return partes.join(' — ');
}

function dataCurta(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
