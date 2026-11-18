import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Fila de aprovação do abastecimento, só do administrativo. `CanMatchFn` para o chunk nem ser
 * baixado por quem não aprova; o aviso que chega com o link manda o campo para a aba Frota.
 */
export const aprovacaoAbastecimentoGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.podeAprovarAbastecimento() ? true : inject(Router).createUrlTree(['/frota']);
};
