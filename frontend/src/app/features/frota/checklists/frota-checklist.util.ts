import { HistoricoItemChecklist } from '../../../core/models/frota-checklist.models';

const diaMes = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Item recorrente: com problema há uma semana ou em três checklists seguidos. */
export function recorrente(h: HistoricoItemChecklist | null | undefined): boolean {
  return !!h && (h.diasComProblema >= 7 || h.checklistsSeguidos >= 3);
}

/**
 * Leitura rápida do histórico do item no veículo, ex.: "Não OK há 5 dias, em 3 checklists seguidos ·
 * 4 vezes nos últimos 30 dias · último OK em 10/10".
 */
export function textoHistorico(h: HistoricoItemChecklist | null | undefined): string | null {
  if (!h || !h.checklistsSeguidos) return null;
  const partes: string[] = [];
  if (h.checklistsSeguidos === 1) {
    // Primeira vez seguida: diz se é novo (estava OK) ou se não há histórico do item no veículo.
    partes.push(h.ultimoOkEm ? `Apareceu agora: estava OK em ${diaMes(h.ultimoOkEm)}` : 'Primeira vez registrada neste veículo');
    if (h.vezes30Dias > 1) partes.push(`${h.vezes30Dias} vezes nos últimos 30 dias`);
    return partes.join(' · ');
  }
  const dias = h.diasComProblema === 0 ? 'desde hoje' : `há ${h.diasComProblema} ${h.diasComProblema === 1 ? 'dia' : 'dias'}`;
  partes.push(`Não OK ${dias}, em ${h.checklistsSeguidos} checklists seguidos`);
  if (h.vezes30Dias > 1) partes.push(`${h.vezes30Dias} vezes nos últimos 30 dias`);
  partes.push(h.ultimoOkEm ? `último OK em ${diaMes(h.ultimoOkEm)}` : 'sem OK anterior registrado');
  return partes.join(' · ');
}
