import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Telas da equipe de Obras (turno, APR, execução). */
export const obrasGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.ehEquipeObras() ? true : inject(Router).createUrlTree(['/hoje']);
};

/** Telas do supervisor de Obras no app. */
export const supervisaoObrasGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.ehSupervisorObras() ? true : inject(Router).createUrlTree(['/hoje']);
};
