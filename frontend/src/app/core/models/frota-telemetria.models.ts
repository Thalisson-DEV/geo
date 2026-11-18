import { GeoTone } from '@geo/ui';

/** Contratos de `/v1/frota/telemetria`. */

export type ProvedorTelemetria = 'UBICALY' | 'ZUQ';
export type SituacaoRastreador = 'VINCULADO' | 'SEM_VEICULO' | 'IGNORADO';
export type SituacaoSincronizacao = 'OK' | 'ERRO' | 'NAO_CONFIGURADO';
export type OrigemCondutorTelemetria = 'PROVEDOR' | 'VINCULO';
export type UnidadeTelemetria = 'KM' | 'HORAS';
export type TipoEventoTelemetria =
  | 'EXCESSO_VELOCIDADE'
  | 'FRENAGEM_BRUSCA'
  | 'ACELERACAO_BRUSCA'
  | 'CURVA_BRUSCA'
  | 'CONDUCAO_AGRESSIVA'
  | 'MOTOR_LIGADO_PARADO'
  | 'PANICO'
  | 'SEM_MOTORISTA'
  | 'DESCONEXAO_BATERIA';

export interface RotinaTelemetria {
  situacao: SituacaoSincronizacao;
  situacaoRotulo: string;
  ultimaExecucao: string | null;
  ultimoSucesso: string | null;
  mensagem: string | null;
  falhasSeguidas: number;
  itens: number;
}

export interface ProvedorSituacao {
  provedor: ProvedorTelemetria;
  rotulo: string;
  configurado: boolean;
  veiculos: RotinaTelemetria;
  eventos: RotinaTelemetria;
}

export interface SituacaoTelemetria {
  provedores: ProvedorSituacao[];
  resumo: { vinculados: number; semVeiculo: number; ignorados: number; semComunicacao: number; eventos24h: number };
}

export interface RastreadorTelemetria {
  id: string;
  provedor: ProvedorTelemetria;
  provedorRotulo: string;
  idExterno: string;
  placaProvedor: string | null;
  nomeProvedor: string | null;
  situacao: SituacaoRastreador;
  situacaoRotulo: string;
  vinculoManual: boolean;
  idVeiculo: string | null;
  placa: string | null;
  base: string | null;
  ultimaComunicacao: string | null;
  latitude: number | null;
  longitude: number | null;
  velocidadeKmh: number | null;
  ignicao: boolean | null;
  odometroKm: number | null;
  horimetroHoras: number | null;
  motoristaNome: string | null;
  idColaboradorMotorista: string | null;
  condutor: string | null;
  semComunicacao: boolean;
}

export interface FiltroRastreadores {
  busca?: string | null;
  provedores?: ProvedorTelemetria[];
  situacoes?: SituacaoRastreador[];
  semComunicacao?: boolean | null;
  idsBase?: string[];
}

export interface EventoTelemetria {
  id: string;
  provedor: ProvedorTelemetria;
  provedorRotulo: string;
  tipo: TipoEventoTelemetria;
  tipoRotulo: string;
  ocorridoEm: string;
  idVeiculo: string | null;
  placa: string | null;
  base: string | null;
  latitude: number | null;
  longitude: number | null;
  endereco: string | null;
  velocidadeKmh: number | null;
  limiteKmh: number | null;
  duracaoSegundos: number | null;
  descricao: string | null;
  detalhe: string;
  motoristaNome: string | null;
  idColaborador: string | null;
  condutor: string | null;
  origemCondutor: OrigemCondutorTelemetria | null;
  origemCondutorRotulo: string | null;
}

export interface FiltroEventosTelemetria {
  busca?: string | null;
  tipos?: TipoEventoTelemetria[];
  provedores?: ProvedorTelemetria[];
  idVeiculo?: string | null;
  idColaborador?: string | null;
  idsBase?: string[];
  semCondutor?: boolean | null;
  de?: string | null;
  ate?: string | null;
}

export interface TelemetriaVeiculo {
  rastreado: boolean;
  rastreador: RastreadorTelemetria | null;
  outros: RastreadorTelemetria[];
  unidade: UnidadeTelemetria;
  rodado7d: number | null;
  rodado30d: number | null;
  litros30d: number | null;
  consumo30d: number | null;
  eventos30d: { tipo: TipoEventoTelemetria; rotulo: string; total: number }[];
  ultimosEventos: EventoTelemetria[];
}

export interface PontoTrajeto {
  lidoEm: string;
  latitude: number | null;
  longitude: number | null;
  velocidadeKmh: number | null;
  ignicao: boolean | null;
}

export interface TrajetoTelemetria {
  pontos: PontoTrajeto[];
  truncado: boolean;
}

export interface ConsumoAbastecimentoTelemetria {
  disponivel: boolean;
  motivo: string | null;
  unidade: UnidadeTelemetria;
  anteriorEm: string | null;
  rodado: number | null;
  litros: number | null;
  consumo: number | null;
  /** Onde o veículo estava no abastecimento (nulo sem posição no horário). */
  local: LocalAbastecimento | null;
}

export type EstadoMapa = 'EM_MOVIMENTO' | 'LIGADO_PARADO' | 'DESLIGADO' | 'SEM_SINAL';

export interface VeiculoMapa {
  idVeiculo: string;
  placa: string;
  modelo: string | null;
  fabricante: string | null;
  tipoVeiculo: string | null;
  idBaseOperacional: string | null;
  base: string | null;
  situacaoOperacional: string | null;
  situacaoOperacionalRotulo: string | null;
  latitude: number;
  longitude: number;
  velocidadeKmh: number | null;
  ignicao: boolean | null;
  ultimaComunicacao: string | null;
  estado: EstadoMapa;
  estadoRotulo: string;
  /** Motorista informado pelo rastreador, casado com a frota. */
  condutor: string | null;
  /** Quem está vinculado ao veículo (checklist ou manual). */
  condutorVinculado: string | null;
  kmAtual: number | null;
  unidade: UnidadeTelemetria;
  eventos24h: number;
  documentosVencidos: number;
  /** O que pede decisão sobre o veículo agora. */
  atencao: AtencaoVeiculoMapa | null;
}

export interface AtencaoVeiculoMapa {
  /** Quem está vinculado ao veículo agora. */
  idCondutor: string | null;
  cnhVencida: boolean;
  /** A OS aberta mais urgente: parada em curso e prazo estourado primeiro. */
  os: { id: string; numero: number; situacaoRotulo: string; veiculoParado: boolean; atrasada: boolean } | null;
  osAbertas: number;
  /** Itens apontados no checklist ainda sem decisão. */
  pendenciasChecklist: number;
  semChecklistHoje: boolean;
  abastecimento: { id: string; situacao: 'AGUARDANDO_APROVACAO' | 'APROVADA' | 'LIBERADA'; situacaoRotulo: string } | null;
  /** Andando agora, fora do expediente. */
  foraDoExpediente: boolean;
}

export interface MapaFrota {
  veiculos: VeiculoMapa[];
  semPosicao: number;
  geradoEm: string;
  /** As posições pararam de chegar desde este instante; nulo quando chegam em dia. */
  posicoesAtrasadasDesde: string | null;
}

/** Onde o rastreador mostra o veículo no abastecimento e o lugar aprendido do posto. */
export interface LocalAbastecimento {
  latitude: number;
  longitude: number;
  latitudePosto: number | null;
  longitudePosto: number | null;
  distanciaPostoMetros: number | null;
  longeDoPosto: boolean;
}

export interface RastreadorDuplicado {
  idRastreador: string;
  provedor: ProvedorTelemetria;
  provedorRotulo: string;
  ultimaComunicacao: string | null;
  comOdometro: boolean;
  /** O que comunica melhor fica; os demais são candidatos a cancelar. */
  manter: boolean;
}

export interface DuplicadoRastreador {
  placa: string;
  idVeiculo: string | null;
  modelo: string | null;
  base: string | null;
  rastreadores: RastreadorDuplicado[];
}

export interface SaudeRastreadores {
  duplicados: DuplicadoRastreador[];
  geradoEm: string;
}

export const ESTADOS_MAPA: { value: EstadoMapa; label: string; icon: string; token: string }[] = [
  { value: 'EM_MOVIMENTO', label: 'Em movimento', icon: 'pi pi-play', token: 'success' },
  { value: 'LIGADO_PARADO', label: 'Ligado parado', icon: 'pi pi-pause', token: 'warning' },
  { value: 'DESLIGADO', label: 'Desligado', icon: 'pi pi-power-off', token: 'foreground-subtle' },
  { value: 'SEM_SINAL', label: 'Sem sinal', icon: 'pi pi-wifi', token: 'danger' }
];

export const ROTULO_PROVEDOR: Record<ProvedorTelemetria, string> = { UBICALY: 'Vivo (Ubicaly)', ZUQ: 'Zuq' };

export const ROTULO_SITUACAO_RASTREADOR: Record<SituacaoRastreador, string> = {
  VINCULADO: 'Vinculado',
  SEM_VEICULO: 'Sem veículo',
  IGNORADO: 'Ignorado'
};

export const TOM_SITUACAO_RASTREADOR: Record<SituacaoRastreador, GeoTone> = {
  VINCULADO: 'success',
  SEM_VEICULO: 'warning',
  IGNORADO: 'neutral'
};

export const TOM_SINCRONIZACAO: Record<SituacaoSincronizacao, GeoTone> = { OK: 'success', ERRO: 'danger', NAO_CONFIGURADO: 'neutral' };

export const ROTULO_TIPO_EVENTO: Record<TipoEventoTelemetria, string> = {
  EXCESSO_VELOCIDADE: 'Excesso de velocidade',
  FRENAGEM_BRUSCA: 'Frenagem brusca',
  ACELERACAO_BRUSCA: 'Aceleração brusca',
  CURVA_BRUSCA: 'Curva brusca',
  CONDUCAO_AGRESSIVA: 'Condução agressiva',
  MOTOR_LIGADO_PARADO: 'Motor ligado parado',
  PANICO: 'Pânico',
  SEM_MOTORISTA: 'Sem motorista identificado',
  DESCONEXAO_BATERIA: 'Desconexão da bateria'
};

export const ICONE_TIPO_EVENTO: Record<TipoEventoTelemetria, string> = {
  EXCESSO_VELOCIDADE: 'pi pi-gauge',
  FRENAGEM_BRUSCA: 'pi pi-stop-circle',
  ACELERACAO_BRUSCA: 'pi pi-forward',
  CURVA_BRUSCA: 'pi pi-directions',
  CONDUCAO_AGRESSIVA: 'pi pi-exclamation-triangle',
  MOTOR_LIGADO_PARADO: 'pi pi-clock',
  PANICO: 'pi pi-bell',
  SEM_MOTORISTA: 'pi pi-user-minus',
  DESCONEXAO_BATERIA: 'pi pi-bolt'
};

export const TOM_TIPO_EVENTO: Record<TipoEventoTelemetria, GeoTone> = {
  EXCESSO_VELOCIDADE: 'danger',
  FRENAGEM_BRUSCA: 'warning',
  ACELERACAO_BRUSCA: 'warning',
  CURVA_BRUSCA: 'warning',
  CONDUCAO_AGRESSIVA: 'warning',
  MOTOR_LIGADO_PARADO: 'info',
  PANICO: 'danger',
  SEM_MOTORISTA: 'neutral',
  DESCONEXAO_BATERIA: 'danger'
};

/** "há 3 min", "há 2 h", "há 4 dias"; nulo vira "nunca". */
export function haQuanto(iso: string | null, agora = Date.now()): string {
  if (!iso) return 'nunca';
  const minutos = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 48) return `há ${horas} h`;
  return `há ${Math.round(horas / 24)} dias`;
}

/** Rodado e consumo na unidade do veículo: "410 km" / "8,2 km/l" ou "12 h" / "3,1 l/h". */
export function formatarRodado(valor: number | null, unidade: UnidadeTelemetria): string {
  if (valor == null) return '—';
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: unidade === 'KM' ? 0 : 1 })} ${unidade === 'KM' ? 'km' : 'h'}`;
}

export function formatarConsumo(valor: number | null, unidade: UnidadeTelemetria): string {
  if (valor == null) return '—';
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unidade === 'KM' ? 'km/l' : 'l/h'}`;
}

// ── Uso do veículo (aba Uso da ficha) ───────────────────────────────────────────

export interface SaidaForaExpediente {
  inicio: string;
  fim: string;
  km: number;
  minutos: number;
  /** "seg.", "sáb."… no fuso de São Paulo. */
  diaSemana: string;
  trajeto: [number, number][];
}

export interface CustoVeiculoUso {
  /** Os custos contam a partir deste dia (o primeiro com rastreador no período). */
  desde: string;
  combustivel: number;
  litros: number;
  manutencao: number;
  despesas: number;
  locacao: number | null;
  total: number;
  porKm: number | null;
  kmPorLitro: number | null;
  custoOcioso: number | null;
}

export interface UsoVeiculo {
  dias: number;
  de: string;
  ate: string;
  /** "seg. a sex., das 06:00 às 19:00". */
  expediente: string;
  rastreado: boolean;
  /** Há posição no período. */
  medido: boolean;
  km: number;
  kmPorDiaUtil: number;
  diasComUso: number;
  diasUteisMedidos: number;
  rodaPouco: boolean;
  kmDiaRodaPouco: number;
  minutosAndando: number;
  minutosLigadoParado: number;
  litrosOciosos: number;
  kmForaExpediente: number;
  diasForaExpediente: number;
  saidas: SaidaForaExpediente[];
  /** O período passa de 31 dias: as saídas mostram só os últimos 31. */
  saidasRecortadas: boolean;
  custo: CustoVeiculoUso;
}

/** "2 h 05 min", "45 min" ou "—". */
export function formatarMinutos(minutos: number | null | undefined): string {
  if (minutos == null) return '—';
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** "350 m" ou "1,2 km". */
export function formatarDistancia(metros: number | null | undefined): string {
  if (metros == null) return '—';
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

export function formatarMoeda(valor: number | null | undefined, casas = 2): string {
  return valor == null ? '—' : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
}
