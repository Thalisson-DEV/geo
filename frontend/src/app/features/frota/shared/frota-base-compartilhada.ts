import { WritableSignal, effect, signal } from '@angular/core';
import { readSharedFilter, writeSharedFilter } from '@geo/ui';

/** Chave da base escolhida nas telas da frota: escolher numa tela vale para as outras. */
export const CHAVE_BASE_FROTA = 'frota.base';

export function lerBaseFrota(): string[] {
  const valor = readSharedFilter(CHAVE_BASE_FROTA);
  return valor ? valor.split(',').filter(Boolean) : [];
}

/**
 * Bases escolhidas, lembradas entre as telas da frota (listas, checklists, mapa, relatórios).
 * Chame num inicializador de campo: a gravação acompanha cada troca.
 */
export function sinalBaseFrota(): WritableSignal<string[]> {
  const bases = signal<string[]>(lerBaseFrota());
  effect(() => writeSharedFilter(CHAVE_BASE_FROTA, bases().join(',')));
  return bases;
}
