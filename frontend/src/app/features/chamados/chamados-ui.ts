import { GeoTone } from '@geo/ui';
import {
  Chamado,
  ChamadoPrioridade,
  ChamadoStatus,
  InteracaoChamadoTipo
} from '../../core/models/chamado.models';

export const CHAMADO_STATUS_LABELS: Record<ChamadoStatus, string> = {
  ABERTO: 'Aberto',
  EM_ATENDIMENTO: 'Em atendimento',
  AGUARDANDO_SOLICITANTE: 'Aguardando solicitante',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
  CANCELADO: 'Cancelado'
};

export const CHAMADO_PRIORIDADE_LABELS: Record<ChamadoPrioridade, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

export const INTERACAO_LABELS: Record<InteracaoChamadoTipo, string> = {
  ABERTURA: 'Abertura',
  MENSAGEM_PUBLICA: 'Mensagem pública',
  COMENTARIO_INTERNO: 'Comentário interno',
  ALTERACAO_STATUS: 'Alteração de status',
  ALTERACAO_PRIORIDADE: 'Alteração de prioridade',
  ATRIBUICAO: 'Atribuição',
  ENCAMINHAMENTO: 'Encaminhamento',
  REABERTURA: 'Reabertura',
  CANCELAMENTO: 'Cancelamento',
  EVIDENCIA_ADICIONADA: 'Evidência adicionada'
};

export const STATUS_OPTIONS = Object.entries(CHAMADO_STATUS_LABELS).map(([value, label]) => ({
  value: value as ChamadoStatus,
  label
}));

export const PRIORIDADE_OPTIONS = Object.entries(CHAMADO_PRIORIDADE_LABELS).map(
  ([value, label]) => ({ value: value as ChamadoPrioridade, label })
);

export function statusSeverity(status: ChamadoStatus): 'info' | 'warn' | 'success' | 'danger' | 'secondary' {
  const severities: Record<ChamadoStatus, 'info' | 'warn' | 'success' | 'danger' | 'secondary'> = {
    ABERTO: 'info',
    EM_ATENDIMENTO: 'warn',
    AGUARDANDO_SOLICITANTE: 'secondary',
    RESOLVIDO: 'success',
    FECHADO: 'secondary',
    // Cancelado é estado final, não erro: neutro como no financeiro.
    CANCELADO: 'secondary'
  };
  return severities[status];
}

/**
 * Classes de texto e fundo suave por tom, com os tokens semânticos do GEO (tema claro/escuro).
 * Os literais ficam completos para o Tailwind gerar as utilities.
 */
const TOM_TEXTO: Record<GeoTone, string> = {
  neutral: 'text-[var(--geo-foreground-muted)]',
  brand: 'text-[var(--geo-brand)]',
  info: 'text-[var(--geo-info-text)]',
  success: 'text-[var(--geo-success-text)]',
  warning: 'text-[var(--geo-warning-text)]',
  danger: 'text-[var(--geo-danger-text)]'
};

const TOM_TEXTO_FORCADO: Record<GeoTone, string> = {
  neutral: '!text-[var(--geo-foreground-muted)]',
  brand: '!text-[var(--geo-brand)]',
  info: '!text-[var(--geo-info-text)]',
  success: '!text-[var(--geo-success-text)]',
  warning: '!text-[var(--geo-warning-text)]',
  danger: '!text-[var(--geo-danger-text)]'
};

const TOM_FUNDO: Record<GeoTone, string> = {
  neutral: 'bg-[var(--geo-surface-muted)]',
  brand: 'bg-[var(--geo-brand-soft)]',
  info: 'bg-[var(--geo-info-soft)]',
  success: 'bg-[var(--geo-success-soft)]',
  warning: 'bg-[var(--geo-warning-soft)]',
  danger: 'bg-[var(--geo-danger-soft)]'
};

/** Texto + fundo suave do tom (selos montados à mão; prefira `geo-status`). */
export function tomClass(tom: GeoTone): string {
  return `${TOM_TEXTO[tom]} ${TOM_FUNDO[tom]}`;
}

/** Classes do selo de prioridade (mesma regra de `prioridadeTom`). */
export function prioridadeClass(prioridade: ChamadoPrioridade): string {
  return tomClass(prioridadeTom(prioridade));
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fimDoDiaIso(date: Date, fim: boolean): string {
  const value = new Date(date);
  value.setHours(fim ? 23 : 0, fim ? 59 : 0, fim ? 59 : 0, fim ? 999 : 0);
  return value.toISOString();
}

type SituacaoSla = Pick<Chamado, 'status' | 'slaPausado' | 'slaResolucaoVencido'>;
type SituacaoPrazo = SituacaoSla & Pick<Chamado, 'dataLimiteResolucao'>;

/** Antecedência (em horas) em que o prazo de resolução passa a ser destacado como "vence em breve". */
export const PRAZO_ALERTA_HORAS = 4;

function concluido(status: ChamadoStatus): boolean {
  return status === 'RESOLVIDO' || status === 'FECHADO';
}

function venceEmBreve(chamado: Pick<Chamado, 'dataLimiteResolucao'>): boolean {
  const horas = (new Date(chamado.dataLimiteResolucao).getTime() - Date.now()) / 3_600_000;
  return horas <= PRAZO_ALERTA_HORAS;
}

export function contagemSlaLabel(chamado: SituacaoSla): string {
  if (chamado.status === 'CANCELADO') return 'Cancelada';
  if (concluido(chamado.status)) {
    return chamado.slaResolucaoVencido ? 'Concluída fora do prazo' : 'Concluída no prazo';
  }
  if (chamado.slaPausado) return 'Pausada';
  return chamado.slaResolucaoVencido ? 'Vencida' : 'Em andamento';
}

/** Tom da contagem do SLA de resolução (acompanha `contagemSlaLabel`). */
export function contagemSlaTom(chamado: SituacaoSla): GeoTone {
  if (chamado.status === 'CANCELADO') return 'neutral';
  if (concluido(chamado.status)) return chamado.slaResolucaoVencido ? 'danger' : 'success';
  if (chamado.slaPausado) return 'neutral';
  return chamado.slaResolucaoVencido ? 'danger' : 'info';
}

/** Cor do texto da contagem (com `!` para vencer o estilo do contêiner). */
export function contagemSlaClass(chamado: SituacaoSla): string {
  return TOM_TEXTO_FORCADO[contagemSlaTom(chamado)];
}

/** Classes do selo de prazo (mesma regra de `prazoTom`). */
export function prazoClass(chamado: SituacaoPrazo): string {
  return tomClass(prazoTom(chamado));
}

/**
 * Ícone do prazo de resolução. Cada situação tem ícone próprio para que a cor não seja o único
 * indicador; sem `dataLimiteResolucao`, o prazo em curso usa o relógio.
 */
export function prazoIcon(chamado: SituacaoSla & Partial<Pick<Chamado, 'dataLimiteResolucao'>>): string {
  if (chamado.status === 'CANCELADO') return 'pi pi-times-circle';
  if (concluido(chamado.status)) {
    return chamado.slaResolucaoVencido ? 'pi pi-exclamation-circle' : 'pi pi-check-circle';
  }
  if (chamado.slaResolucaoVencido) return 'pi pi-exclamation-circle';
  if (chamado.slaPausado) return 'pi pi-pause-circle';
  if (chamado.dataLimiteResolucao && venceEmBreve({ dataLimiteResolucao: chamado.dataLimiteResolucao })) {
    return 'pi pi-hourglass';
  }
  return 'pi pi-clock';
}

/** Situação do prazo de resolução em texto (acompanha `prazoTom` e `prazoIcon`). */
export function prazoLabel(chamado: SituacaoPrazo): string {
  if (chamado.status === 'CANCELADO') return 'Cancelado';
  if (concluido(chamado.status)) {
    return chamado.slaResolucaoVencido ? 'Concluído fora do prazo' : 'Concluído no prazo';
  }
  if (chamado.slaResolucaoVencido) return 'Vencido';
  if (chamado.slaPausado) return 'Pausado';
  return venceEmBreve(chamado) ? 'Vence em breve' : 'No prazo';
}

/** Tom do DS (`geo-status`) para o status do chamado. */
export function statusTom(status: ChamadoStatus): GeoTone {
  const tons: Record<ChamadoStatus, GeoTone> = {
    ABERTO: 'info',
    EM_ATENDIMENTO: 'warning',
    AGUARDANDO_SOLICITANTE: 'neutral',
    RESOLVIDO: 'success',
    FECHADO: 'neutral',
    CANCELADO: 'danger'
  };
  return tons[status];
}

/** Ícone da tag de status do chamado. */
export function statusIcone(status: ChamadoStatus): string {
  const icones: Record<ChamadoStatus, string> = {
    ABERTO: 'pi-inbox',
    EM_ATENDIMENTO: 'pi-comments',
    AGUARDANDO_SOLICITANTE: 'pi-hourglass',
    RESOLVIDO: 'pi-check-circle',
    FECHADO: 'pi-lock',
    CANCELADO: 'pi-ban'
  };
  return icones[status];
}

/** Tom do DS (`geo-status`) para a prioridade. */
export function prioridadeTom(prioridade: ChamadoPrioridade): GeoTone {
  const tons: Record<ChamadoPrioridade, GeoTone> = { BAIXA: 'neutral', NORMAL: 'neutral', ALTA: 'warning', CRITICA: 'danger' };
  return tons[prioridade];
}

/** Tom do DS para o prazo de resolução (`prazoClass`, `prazoIcon` e `prazoLabel` seguem a mesma regra). */
export function prazoTom(chamado: SituacaoPrazo): GeoTone {
  if (chamado.status === 'CANCELADO') return 'neutral';
  if (concluido(chamado.status)) return chamado.slaResolucaoVencido ? 'danger' : 'success';
  if (chamado.slaResolucaoVencido) return 'danger';
  if (chamado.slaPausado) return 'neutral';
  return venceEmBreve(chamado) ? 'warning' : 'success';
}
