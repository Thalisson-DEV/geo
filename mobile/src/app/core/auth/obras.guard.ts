import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { TurnoService } from '../turno/turno.service';

/** Telas da equipe de Obras (turno, APR, execução). */
export const obrasGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  if (!auth.ehEquipeObras()) return inject(Router).createUrlTree(['/hoje']);
  // O app pode reabrir direto na execução ou na APR (retomada): o turno do aparelho precisa estar carregado, senão a
  // foto e o apontamento são recusados com "Abra o turno".
  const turno = inject(TurnoService);
  if (!turno.turnoAtivo()) await turno.loadTurnoAtivo();
  return true;
};

/** Telas do supervisor de Obras no app. */
export const supervisaoObrasGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.ehSupervisorObras() ? true : inject(Router).createUrlTree(['/hoje']);
};
