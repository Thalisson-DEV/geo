import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BaseService } from './base.service';
import { PagedResponse } from '../models/shared.models';
import { MetaFisicaFilter, MetaFisicaRequest, MetaFisicaResponse } from '../models/meta-fisica.models';

/**
 * Meta física da Concessionária por base, mês e tipo de serviço. Leitura exige
 * `execucao:meta-fisica:read`; escrita, `execucao:meta-fisica:write`.
 */
@Injectable({ providedIn: 'root' })
export class MetasFisicasService extends BaseService {
  private readonly url = `${environment.apiUrl}/v1/metas-fisicas`;

  listar(filtros: MetaFisicaFilter): Observable<PagedResponse<MetaFisicaResponse>> {
    const limpos: Record<string, unknown> = {};
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor !== null && valor !== undefined && valor !== '') limpos[chave] = valor;
    });
    return this.getList<MetaFisicaResponse>(this.url, limpos);
  }

  criar(request: MetaFisicaRequest): Observable<MetaFisicaResponse | null> {
    return this.createSync<MetaFisicaResponse>(this.url, request);
  }

  atualizar(id: string, request: MetaFisicaRequest): Observable<MetaFisicaResponse | null> {
    return this.updateSync<MetaFisicaResponse>(this.url, id, request);
  }

  desativar(id: string): Observable<void | null> {
    return this.deleteSync(this.url, id);
  }

  ativar(id: string): Observable<void | null> {
    return this.updateSync<void>(this.url, `${id}/ativar`, {});
  }
}
