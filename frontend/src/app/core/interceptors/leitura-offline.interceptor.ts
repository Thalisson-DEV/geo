import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, of, switchMap, tap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { LeiturasOfflineService } from '../offline/leituras-offline.service';
import { AuthService } from '../services/auth.service';

/**
 * Consultas de Obras sem rede: cada resposta JSON que chega é guardada; se a mesma consulta falhar por falta de
 * conexão (status 0), a tela recebe a última resposta guardada e o aviso global mostra de quando ela é.
 *
 * Só vale para GET de JSON das consultas listadas em {@link LeiturasOfflineService}; erros do servidor (4xx/5xx)
 * seguem como estão, porque ali há rede e o servidor respondeu.
 */
export const leituraOfflineInterceptor: HttpInterceptorFn = (req, next) => {
  const leituras = inject(LeiturasOfflineService);
  if (req.method !== 'GET' || req.responseType !== 'json' || !leituras.podeGuardar(req.url)) {
    return next(req);
  }
  const usuario = inject(AuthService).currentUser()?.id;
  if (!usuario) return next(req);

  return next(req).pipe(
    tap((evento) => {
      if (evento instanceof HttpResponse && evento.ok) {
        leituras.voltouARede();
        void leituras.guardar(usuario, req.urlWithParams, evento.body);
      }
    }),
    catchError((erro: unknown) => {
      if (!(erro instanceof HttpErrorResponse) || erro.status !== 0) return throwError(() => erro);
      return from(leituras.buscar(usuario, req.urlWithParams)).pipe(
        switchMap((guardada) => {
          if (!guardada) return throwError(() => erro);
          leituras.marcarExibicao(guardada.salvoEm);
          return of(new HttpResponse({ body: guardada.corpo, status: 200, statusText: 'OK (guardado)', url: req.urlWithParams }));
        })
      );
    })
  );
};
