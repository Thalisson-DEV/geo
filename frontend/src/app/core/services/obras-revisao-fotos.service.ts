import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DecisaoFoto, FotoParaRevisao, LinhaRankingFotos, OpcaoInconformidade, RevisaoFotoFilter,
} from '../models/obras-revisao-fotos.models';
import { PagedResponse } from '../models/shared.models';
import { BaseService } from './base.service';

/** Revisão das fotos de campo: fila, decisão e ranking de qualidade por equipe. */
@Injectable({ providedIn: 'root' })
export class ObrasRevisaoFotosService extends BaseService {
  private readonly url = `${environment.apiUrl}/v1/obras/evidencias`;

  listar(filtro: RevisaoFotoFilter = {}): Observable<PagedResponse<FotoParaRevisao>> {
    return this.getList<FotoParaRevisao>(`${this.url}/revisao`, filtro as Record<string, unknown>);
  }

  revisar(id: string, decisao: DecisaoFoto): Observable<FotoParaRevisao> {
    return this.http.put<FotoParaRevisao>(`${this.url}/${id}/revisao`, decisao);
  }

  ranking(de?: string, ate?: string): Observable<LinhaRankingFotos[]> {
    const params: Record<string, string> = {};
    if (de) params['de'] = de;
    if (ate) params['ate'] = ate;
    return this.http.get<LinhaRankingFotos[]>(`${this.url}/ranking`, { params });
  }

  inconformidades(): Observable<OpcaoInconformidade[]> {
    return this.http.get<OpcaoInconformidade[]>(`${this.url}/inconformidades`);
  }

  miniatura(idObra: string, idEvidencia: string): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/v1/obras/${idObra}/documentacao/evidencias/${idEvidencia}/miniatura`, { responseType: 'blob' });
  }
}
