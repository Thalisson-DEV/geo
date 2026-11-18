import { GeoSelectOption } from '@geo/ui';

import { EquipeResponse } from '../../../../core/models/rh.models';

/** Hoje à meia-noite: o saque não pode ser no passado. */
export function hoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Data do calendário (sem fuso) no formato da API. */
export function dataCivil(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Saque em menos de 48 horas: o backend marca a solicitação como fora do prazo. */
export function foraDoPrazo(data: Date | null): boolean {
  if (!data) return false;
  const limite = new Date();
  limite.setHours(limite.getHours() + 48);
  const fimDoDia = new Date(data);
  fimDoDia.setHours(23, 59, 59, 999);
  return fimDoDia < limite;
}

/** Membros ativos da equipe, com o responsável marcado. */
export function membrosDaEquipe(equipe: EquipeResponse | null | undefined): GeoSelectOption<string>[] {
  return (equipe?.membros ?? [])
    .filter((m) => m.vinculoAtivo)
    .map((m) => ({ label: m.funcao === 'RESPONSAVEL' ? `${m.nomeColaborador} (responsável)` : m.nomeColaborador, value: m.idColaborador }));
}
