import type { CesTone } from '@ces/ui';
import type { Criticidade, UnidadeMedicao } from './frota.models';

/** Quanto falta para a próxima realização. */
export type SituacaoPreventiva = 'VENCIDA' | 'PROXIMA' | 'EM_DIA';
export type OrigemBasePreventiva = 'INICIO' | 'INFORMADA' | 'ORDEM_SERVICO';
export type OrigemRealizacaoPreventiva = 'INFORMADA' | 'ORDEM_SERVICO';
export type SituacaoRealizacaoPreventiva = 'ABERTA' | 'CONCLUIDA' | 'CANCELADA';

/** Filtros rápidos do acompanhamento. "Com OS" tira a linha de vencida, próxima e em dia. */
export type FiltroRapidoPreventiva = SituacaoPreventiva | 'COM_OS' | 'SEM_HISTORICO';

export interface ReferenciaPlano {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface PlanoPreventivo {
  id: string;
  nome: string;
  descricao: string | null;
  tiposVeiculo: ReferenciaPlano[];
  tiposImplemento: ReferenciaPlano[];
  intervaloKm: number | null;
  intervaloHoras: number | null;
  intervaloDias: number | null;
  antecedenciaKm: number | null;
  antecedenciaHoras: number | null;
  antecedenciaDias: number | null;
  /** Texto pronto, ex.: "a cada 10.000 km ou 180 dias". */
  frequencia: string;
  criticidade: Criticidade;
  criticidadeRotulo: string;
  abrirOsAutomaticamente: boolean;
  itens: ReferenciaPlano[];
  tarefas: string[];
  /** Quantos veículos o plano acompanha. */
  veiculos: number;
  ativo: boolean;
}

export interface PlanoPreventivoRequest {
  nome: string;
  descricao: string | null;
  idsTiposVeiculo: string[];
  idsTiposImplemento: string[];
  intervaloKm: number | null;
  intervaloHoras: number | null;
  intervaloDias: number | null;
  antecedenciaKm: number | null;
  antecedenciaHoras: number | null;
  antecedenciaDias: number | null;
  criticidade: Criticidade;
  abrirOsAutomaticamente: boolean;
  idsItem: string[];
  tarefas: string[];
}

/** Um plano num veículo: a última realização, a próxima e quanto falta (medições acumuladas). */
export interface ControlePreventivo {
  id: string;
  idVeiculo: string;
  placa: string;
  base: string | null;
  idPlano: string;
  plano: string;
  frequencia: string;
  situacao: SituacaoPreventiva;
  situacaoRotulo: string;
  semHistorico: boolean;
  unidade: UnidadeMedicao;
  medicaoAtual: number | null;
  baseData: string;
  baseMedicao: number | null;
  baseOrigem: OrigemBasePreventiva;
  baseOrigemRotulo: string;
  proximaMedicao: number | null;
  faltaMedicao: number | null;
  proximaData: string | null;
  faltaDias: number | null;
  previsao: string | null;
  /** Ex.: "passou 120 km", "faltam 10 dias". */
  falta: string;
  idOrdemServico: string | null;
  numeroOrdemServico: number | null;
}

export interface ContagensPreventiva {
  vencidas: number;
  proximas: number;
  comOs: number;
  semHistorico: number;
  emDia: number;
  todas: number;
}

export interface FiltroAcompanhamentoPreventiva {
  situacao: FiltroRapidoPreventiva[];
  idBase: string[];
  idPlano: string | null;
  idVeiculo: string | null;
  busca: string | null;
}

export interface RealizacaoPreventiva {
  id: string;
  idControle: string;
  plano: string;
  origem: OrigemRealizacaoPreventiva;
  origemRotulo: string;
  situacao: SituacaoRealizacaoPreventiva;
  situacaoRotulo: string;
  realizadaEm: string | null;
  medicao: number | null;
  unidade: UnidadeMedicao;
  observacao: string | null;
  idOrdemServico: string | null;
  numeroOrdemServico: number | null;
  usuario: string | null;
  registradaEm: string;
}

export interface PreventivaVeiculo {
  controles: ControlePreventivo[];
  realizacoes: RealizacaoPreventiva[];
}

export interface InformarRealizacaoRequest {
  data: string;
  medicao: number | null;
  observacao: string | null;
}

export interface OsPreventivaAberta {
  /** {@code incluida}: os planos entraram numa OS preventiva do veículo que ainda não tinha começado. */
  ordens: { id: string; numero: number | null; placa: string; planos: string[]; incluida: boolean }[];
}

export interface CorretivaPorItem {
  idItem: string;
  item: string;
  ordens: number;
  veiculos: number;
  valor: number;
  ultima: string | null;
  /** Planos ativos que já levam o item; vazio = nenhum plano cobre. */
  planos: string[];
}

/** Plano coberto por uma OS preventiva, com o roteiro copiado na abertura. */
export interface PreventivaOrdemServico {
  idControle: string;
  idPlano: string;
  plano: string;
  roteiro: string | null;
  situacaoRotulo: string;
}

/** Texto do aviso de abertura: OS novas e planos que entraram numa OS que já esperava a oficina. */
export function resumoOsPreventivas(r: OsPreventivaAberta, placa: (p: string) => string): string {
  const novas = r.ordens.filter((o) => !o.incluida).map((o) => `OS ${o.numero} (${placa(o.placa)})`);
  const incluidas = r.ordens.filter((o) => o.incluida)
    .map((o) => `${o.planos.join(', ')} entrou na OS ${o.numero} (${placa(o.placa)}), que já esperava a oficina`);
  const partes = [
    novas.length ? `${novas.join(', ')} ${novas.length === 1 ? 'aberta' : 'abertas'}` : '',
    incluidas.join('. ')
  ].filter(Boolean);
  return partes.join('. ') + '.';
}

/** Tom e ícone da situação na tabela e na ficha. Com OS aberta, o tom é de acompanhamento (info). */
export function aparenciaPreventiva(c: Pick<ControlePreventivo, 'situacao' | 'idOrdemServico'>): { tom: CesTone; icone: string; rotulo: string } {
  if (c.idOrdemServico) return { tom: 'info', icone: 'pi-wrench', rotulo: 'Com OS aberta' };
  switch (c.situacao) {
    case 'VENCIDA':
      return { tom: 'danger', icone: 'pi-exclamation-circle', rotulo: 'Vencida' };
    case 'PROXIMA':
      return { tom: 'warning', icone: 'pi-clock', rotulo: 'Próxima' };
    default:
      return { tom: 'success', icone: 'pi-check-circle', rotulo: 'Em dia' };
  }
}
