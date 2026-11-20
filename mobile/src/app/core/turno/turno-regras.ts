/** Horário de corte diário do servidor: turno ainda aberto nele é encerrado sozinho. */
const HORA_CORTE_TURNO = 22;
/** Horário de Brasília (as bases não têm horário de verão). */
const FUSO_BASES_MS = -3 * 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Primeiro corte depois da abertura: o turno vale até ele (mesma conta do servidor). */
export function corteDoTurno(dataInicio: string): Date {
  const abertura = new Date(dataInicio).getTime();
  const local = new Date(abertura + FUSO_BASES_MS);
  let corte = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), HORA_CORTE_TURNO) - FUSO_BASES_MS;
  if (corte <= abertura) corte += UM_DIA_MS;
  return new Date(corte);
}

/**
 * O turno passou do corte: o servidor já o encerrou e recusa lançamentos feitos
 * depois dele. Vale mesmo sem sinal, porque o corte é o mesmo todo dia.
 */
export function turnoVencido(dataInicio: string, agora: Date = new Date()): boolean {
  return agora.getTime() > corteDoTurno(dataInicio).getTime();
}
