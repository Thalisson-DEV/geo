import { CesTone } from '@ces/ui';

import { StatusSolicitacaoMaterial } from '../../../core/models/solicitacao-material-tecnica.models';
import { statusLabel, statusTone } from './solicitacao-tecnica-presentation';

/** Etapa da fila técnica que o backend filtra (`etapa`). */
export type EtapaTecnica = 'AGUARDANDO_PLANEJAMENTO' | 'EM_SEPARACAO' | 'PENDENTE_ENTREGA';

/**
 * Atalhos de situação da lista técnica, no mesmo formato dos atalhos de status do comercial:
 * o que falta fazer (planejar, separar, entregar) e como terminou.
 */
export interface SituacaoTecnicaDef {
  value: string;
  atalho: string;
  descricao: string;
  tone: CesTone;
  icon: string;
  etapa?: EtapaTecnica;
  statuses?: StatusSolicitacaoMaterial[];
  /** Deixa de fora quem teve o saldo pendente encerrado. */
  saldoAberto?: boolean;
}

/** Tudo o que ainda exige ação do almoxarifado (planejar, separar, entregar, completar). */
export const SITUACAO_EM_ABERTO: SituacaoTecnicaDef = {
  value: 'ABERTO', atalho: 'Em aberto', descricao: 'A planejar, em separação, a entregar e parciais com saldo a retirar: tudo o que ainda exige ação.',
  tone: 'warning', icon: 'pi-inbox', statuses: ['PENDENTE', 'APROVADO', 'ENTREGUE_PARCIAL'], saldoAberto: true
};

export const SITUACOES_TECNICAS: readonly SituacaoTecnicaDef[] = [
  { value: 'PLANEJAR', atalho: 'A planejar', descricao: 'Sem data de saque: falta definir a data prevista (a equipe é opcional).', tone: 'warning', icon: 'pi-calendar-plus', etapa: 'AGUARDANDO_PLANEJAMENTO' },
  { value: 'SEPARAR', atalho: 'Em separação', descricao: 'Planejadas, aguardando ou em separação física.', tone: 'info', icon: 'pi-box', etapa: 'EM_SEPARACAO' },
  { value: 'ENTREGAR', atalho: 'A entregar', descricao: 'Separadas, aguardando a retirada pela equipe.', tone: 'info', icon: 'pi-truck', etapa: 'PENDENTE_ENTREGA' },
  { value: 'PARCIAL', atalho: 'Parcial', descricao: 'Entregues em parte: o restante ainda aguarda retirada.', tone: 'warning', icon: 'pi-hourglass', statuses: ['ENTREGUE_PARCIAL'] },
  { value: 'CONCLUIDA', atalho: 'Concluídas', descricao: 'Entregues por completo.', tone: 'success', icon: 'pi-check-circle', statuses: ['ENTREGUE'] },
  { value: 'CANCELADA', atalho: 'Rejeitadas ou estornadas', descricao: 'Fora da fila.', tone: 'neutral', icon: 'pi-times-circle', statuses: ['REJEITADO', 'CANCELADO', 'ESTORNADO'] }
];

const ICONES: Record<string, string> = {
  PENDENTE: 'pi-clock',
  APROVADO: 'pi-check',
  ENTREGUE_PARCIAL: 'pi-truck',
  ENTREGUE: 'pi-check-circle',
  DEVOLVIDO_PARCIAL: 'pi-undo',
  DEVOLVIDO: 'pi-check-circle',
  REJEITADO: 'pi-times-circle',
  CANCELADO: 'pi-times-circle',
  ESTORNADO: 'pi-replay'
};

/** Status técnico no formato que o calendário usa. */
export function statusTecnicoDef(valor: string): { value: string; label: string; tone: CesTone; icon: string } {
  return { value: valor, label: statusLabel(valor), tone: statusTone(valor), icon: ICONES[valor] ?? 'pi-circle' };
}

/**
 * Situações do calendário técnico: o que acontece no dia do saque para a obra. A cor segue a etapa
 * física (separar, separando, pronta na prateleira, retirada), não a aprovação do comercial.
 */
const SIT_CAL = {
  SEPARAR: { value: 'SEPARAR', label: 'A separar', tone: 'neutral', icon: 'pi-box' },
  SEPARANDO: { value: 'SEPARANDO', label: 'Em separação', tone: 'warning', icon: 'pi-sync' },
  PRONTA: { value: 'PRONTA', label: 'Pronta para retirada', tone: 'info', icon: 'pi-truck' },
  PARCIAL: { value: 'PARCIAL', label: 'Retirada parcial', tone: 'warning', icon: 'pi-hourglass' },
  ENTREGUE: { value: 'ENTREGUE', label: 'Entregue na obra', tone: 'success', icon: 'pi-check-circle' },
  FORA: { value: 'FORA', label: 'Rejeitada ou estornada', tone: 'danger', icon: 'pi-times-circle' }
} as const satisfies Record<string, { value: string; label: string; tone: CesTone; icon: string }>;

export type SituacaoCalendarioTecnico = (typeof SIT_CAL)[keyof typeof SIT_CAL];

export function situacaoCalendarioTecnico(status: string | null | undefined, statusSeparacao: string | null | undefined): SituacaoCalendarioTecnico {
  switch (status) {
    case 'ENTREGUE_PARCIAL':
      return SIT_CAL.PARCIAL;
    case 'ENTREGUE':
    case 'DEVOLVIDO_PARCIAL':
    case 'DEVOLVIDO':
      return SIT_CAL.ENTREGUE;
    case 'REJEITADO':
    case 'CANCELADO':
    case 'ESTORNADO':
      return SIT_CAL.FORA;
  }
  if (statusSeparacao === 'EM_SEPARACAO') return SIT_CAL.SEPARANDO;
  if (statusSeparacao === 'SEPARADO') return SIT_CAL.PRONTA;
  return SIT_CAL.SEPARAR;
}

export const LEGENDA_TECNICA: readonly SituacaoCalendarioTecnico[] = Object.values(SIT_CAL);

/**
 * Selo da etapa em que a solicitação está. Técnica não passa por aprovação: enquanto aberta,
 * o que importa é o próximo passo (planejar, separar, entregar).
 */
export function situacaoAtual(
  status: string | null | undefined,
  dataPrevista: string | null | undefined,
  statusSeparacao: string | null | undefined
): { label: string; tone: CesTone; icon: string } {
  if (status !== 'APROVADO' && status !== 'PENDENTE') {
    const def = statusTecnicoDef(status ?? '');
    return { label: def.label, tone: def.tone, icon: def.icon };
  }
  if (!dataPrevista) return { label: 'A planejar', tone: 'warning', icon: 'pi-calendar-plus' };
  if (statusSeparacao === 'EM_SEPARACAO') return { label: 'Em separação', tone: 'info', icon: 'pi-box' };
  if (statusSeparacao === 'SEPARADO') return { label: 'A entregar', tone: 'info', icon: 'pi-truck' };
  return { label: 'A separar', tone: 'info', icon: 'pi-box' };
}

export function situacaoTecnica(valor?: string | null): SituacaoTecnicaDef | undefined {
  return valor === SITUACAO_EM_ABERTO.value ? SITUACAO_EM_ABERTO : SITUACOES_TECNICAS.find((s) => s.value === valor);
}
