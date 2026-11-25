import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EstruturaApr, ModeloAprResponse } from '../models/sst-apr.models';
import { BaseService } from './base.service';

/** Cadastro da APR que a equipe preenche no app de campo antes de executar. */
@Injectable({ providedIn: 'root' })
export class SstAprService extends BaseService {
  private readonly url = `${environment.apiUrl}/v1/sst/apr/modelo`;

  obter(): Observable<ModeloAprResponse> {
    return this.http.get<ModeloAprResponse>(this.url);
  }

  salvar(estrutura: EstruturaApr): Observable<ModeloAprResponse> {
    return this.http.put<ModeloAprResponse>(this.url, { estrutura });
  }
}
