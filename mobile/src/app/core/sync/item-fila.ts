import { OutboxItem } from '../db/models';
import type { EstadoEnvio } from '../../ui/status-envio.component';

/**
 * Descrição dos itens da fila de envio no vocabulário que o encarregado vê (folha "Envios").
 * Regra de ouro: nunca dizer "Enviado" para algo que só está na fila.
 */

export type TipoItemFila = 'pedido' | 'transferencia' | 'inspecao' | 'anexo' | 'turno' | 'visita' | 'outro';

export interface ItemFilaDescrito {
  id: string;
  tipo: TipoItemFila;
  titulo: string;
  detalhe: string;
  estado: EstadoEnvio;
  /** Mensagem de erro/conflito pronta para o usuário (sem jargão técnico). */
  motivo?: string;
  criadoEm: Date;
}

const TITULOS: Record<TipoItemFila, string> = {
  pedido: 'Pedido de material',
  transferencia: 'Transferência',
  inspecao: 'Inspeção',
  anexo: 'Foto da inspeção',
  turno: 'Turno',
  visita: 'Visita prévia',
  outro: 'Envio',
};

export function tipoDoItem(endpoint: string): TipoItemFila {
  if (endpoint === '/_obras/visita' || endpoint.includes('documentacao/visitas')) return 'visita';
  if (endpoint.includes('inspecao/anexo')) return 'anexo';
  if (endpoint.includes('inspec')) return 'inspecao';
  if (endpoint.includes('solicitac')) return 'pedido';
  if (endpoint.includes('transferencia')) return 'transferencia';
  if (endpoint.includes('turno')) return 'turno';
  return 'outro';
}

/** Linha da folha "Envios": o quê, de quando e em que pé está. */
export function descreverItemFila(item: OutboxItem, enviandoAgora: boolean, agora = new Date()): ItemFilaDescrito {
  const tipo = tipoDoItem(item.endpoint ?? '');
  const titulo = TITULOS[tipo];
  const criadoEm = item.criadoEm instanceof Date ? item.criadoEm : new Date(item.criadoEm);
  const hora = criadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const mesmoDia = criadoEm.toDateString() === agora.toDateString();
  const quando = mesmoDia ? hora : `${criadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;

  let estado: EstadoEnvio;
  let motivo: string | undefined;
  if (item.status === 'RESULTADO_INCERTO') {
    estado = 'conflict';
    motivo = 'Pode já ter chegado ao servidor. Confira antes de reenviar.';
  } else if (item.status === 'ERRO') {
    estado = 'error';
    motivo = item.receiptStatus === 'RECEIVED' || item.serverOperationId
      ? 'Chegou ao escritório e está em análise.'
      : (item.erroDetalhes || 'Não foi aceito pelo servidor.');
  } else if (item.status === 'SINCRONIZADO') {
    estado = 'synced';
  } else {
    estado = enviandoAgora ? 'syncing' : 'queued';
    if ((item.tentativas ?? 0) > 0 && item.proximaTentativaEm && item.proximaTentativaEm > agora.getTime()) {
      motivo = 'Servidor instável. Tenta de novo sozinho em instantes.';
    }
  }

  return {
    id: item.id,
    tipo,
    titulo,
    detalhe: quando,
    estado,
    motivo,
    criadoEm,
  };
}
