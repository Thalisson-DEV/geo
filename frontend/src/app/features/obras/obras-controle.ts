import { CesTone } from '@ces/ui';

import { ControleExecucaoObra } from '../../core/models/obras.models';

/** Como o material é pedido em cada tipo de obra, em linguagem de quem usa. */
export interface ControleObraInfo {
  value: ControleExecucaoObra;
  /** Rótulo curto para tabela e etiqueta. */
  curto: string;
  titulo: string;
  texto: string;
  icone: string;
  tone: CesTone;
  /** Nome do número digitado na solicitação (OS/OC). */
  campo?: string;
}

export const CONTROLES_OBRA: ControleObraInfo[] = [
  { value: 'OBRA', curto: 'Direto na obra', titulo: 'Direto na obra', texto: 'O material é pedido para a própria obra. Ex.: Comum, LPT, Kit, Medidor.', icone: 'pi pi-building', tone: 'info' },
  { value: 'OC', curto: 'Por OC', titulo: 'Por ocorrência (OC)', texto: 'O material vai direto para a OC, digitada na hora da solicitação.', icone: 'pi pi-bolt', tone: 'warning', campo: 'Número da OC' },
  { value: 'OS', curto: 'Por OS', titulo: 'Por ordem de serviço (OS)', texto: 'O material vai direto para a OS, digitada na hora da solicitação.', icone: 'pi pi-file-edit', tone: 'warning', campo: 'Número da OS' }
];

export function controleObra(valor?: ControleExecucaoObra | null): ControleObraInfo {
  return CONTROLES_OBRA.find((c) => c.value === valor) ?? CONTROLES_OBRA[0];
}
