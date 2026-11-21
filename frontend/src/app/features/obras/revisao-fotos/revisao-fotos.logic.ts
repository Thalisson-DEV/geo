import { GeoSelectOption } from '@geo/ui';
import { RevisaoFoto } from '../../../core/models/obras-revisao-fotos.models';

export const ROTULO_STATUS: Record<RevisaoFoto, string> = { PENDENTE: 'Para revisar', APROVADA: 'Aprovada', REPROVADA: 'Reprovada' };
export const TOM_STATUS: Record<RevisaoFoto, 'warning' | 'success' | 'danger'> = { PENDENTE: 'warning', APROVADA: 'success', REPROVADA: 'danger' };
export const ETAPAS: Record<string, string> = { ANTES: 'Antes', DURANTE: 'Durante', DEPOIS: 'Depois' };

export function opcoesStatus(): GeoSelectOption<RevisaoFoto | null>[] {
  return [
    { label: 'Para revisar', value: 'PENDENTE' },
    { label: 'Aprovadas', value: 'APROVADA' },
    { label: 'Reprovadas', value: 'REPROVADA' }
  ];
}
