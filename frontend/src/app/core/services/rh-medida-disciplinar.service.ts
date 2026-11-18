import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  FiltroMedidas,
  MedidaDisciplinar,
  MedidaDisciplinarRequest,
  MotivoMedidaDisciplinar,
  ParametrosRh,
  ReincidenciaMedida,
  TipoMedidaDisciplinar,
  TipoMedidaDisciplinarRequest
} from '../models/rh-medida-disciplinar.models';
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';

export interface PaginaMedidas {
  page?: number;
  size?: number;
  sort?: string[];
}

/** Medidas disciplinares do RH: lançamento, reincidência, anexos e cadastros. */
@Injectable({ providedIn: 'root' })
export class RhMedidaDisciplinarService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/rh/medidas-disciplinares`;
  private readonly config = `${this.url}/configuracao`;

  listar(filtro: FiltroMedidas, pagina: PaginaMedidas): Observable<PagedResponse<MedidaDisciplinar>> {
    return this.http.get<PagedResponse<MedidaDisciplinar>>(this.url, { params: this.params(filtro, pagina) });
  }

  buscar(id: string): Observable<MedidaDisciplinar> {
    return this.http.get<MedidaDisciplinar>(`${this.url}/${id}`);
  }

  reincidencia(idColaborador: string, idMotivo: string, dataFato: string | null, idIgnorar?: string | null): Observable<ReincidenciaMedida> {
    let params = new HttpParams().set('idColaborador', idColaborador).set('idMotivo', idMotivo);
    if (dataFato) params = params.set('dataFato', dataFato);
    if (idIgnorar) params = params.set('idIgnorar', idIgnorar);
    return this.http.get<ReincidenciaMedida>(`${this.url}/reincidencia`, { params });
  }

  salvar(request: MedidaDisciplinarRequest, id?: string | null): Observable<MedidaDisciplinar> {
    return id ? this.http.put<MedidaDisciplinar>(`${this.url}/${id}`, request) : this.http.post<MedidaDisciplinar>(this.url, request);
  }

  cancelar(id: string, justificativa: string): Observable<MedidaDisciplinar> {
    return this.http.post<MedidaDisciplinar>(`${this.url}/${id}/cancelamento`, { justificativa });
  }

  anexar(id: string, arquivo: File): Observable<MedidaDisciplinar> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    return this.http.post<MedidaDisciplinar>(`${this.url}/${id}/anexos`, corpo);
  }

  baixarAnexo(id: string, idAnexo: string): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/anexos/${idAnexo}`, { responseType: 'blob' });
  }

  removerAnexo(id: string, idAnexo: string): Observable<MedidaDisciplinar> {
    return this.http.delete<MedidaDisciplinar>(`${this.url}/${id}/anexos/${idAnexo}`);
  }

  // ── Configuração ───────────────────────────────────────────────────────────
  tipos(apenasAtivos = false): Observable<TipoMedidaDisciplinar[]> {
    return this.http.get<TipoMedidaDisciplinar[]>(`${this.config}/tipos`, { params: { apenasAtivos } });
  }

  salvarTipo(request: TipoMedidaDisciplinarRequest, id?: string | null): Observable<TipoMedidaDisciplinar> {
    return id
      ? this.http.put<TipoMedidaDisciplinar>(`${this.config}/tipos/${id}`, request)
      : this.http.post<TipoMedidaDisciplinar>(`${this.config}/tipos`, request);
  }

  alternarTipo(tipo: TipoMedidaDisciplinar): Observable<void> {
    return this.http.patch<void>(`${this.config}/tipos/${tipo.id}/${tipo.ativo ? 'desativar' : 'ativar'}`, null);
  }

  motivos(apenasAtivos = false): Observable<MotivoMedidaDisciplinar[]> {
    return this.http.get<MotivoMedidaDisciplinar[]>(`${this.config}/motivos`, { params: { apenasAtivos } });
  }

  salvarMotivo(nome: string, id?: string | null): Observable<MotivoMedidaDisciplinar> {
    return id
      ? this.http.put<MotivoMedidaDisciplinar>(`${this.config}/motivos/${id}`, { nome })
      : this.http.post<MotivoMedidaDisciplinar>(`${this.config}/motivos`, { nome });
  }

  alternarMotivo(motivo: MotivoMedidaDisciplinar): Observable<void> {
    return this.http.patch<void>(`${this.config}/motivos/${motivo.id}/${motivo.ativo ? 'desativar' : 'ativar'}`, null);
  }

  parametros(): Observable<ParametrosRh> {
    return this.http.get<ParametrosRh>(`${this.config}/parametros`);
  }

  salvarParametros(parametros: ParametrosRh): Observable<ParametrosRh> {
    return this.http.put<ParametrosRh>(`${this.config}/parametros`, parametros);
  }

  private params(filtro: FiltroMedidas, pagina: PaginaMedidas): HttpParams {
    let params = new HttpParams();
    for (const [chave, valor] of Object.entries(filtro)) {
      if (Array.isArray(valor)) {
        params = comSelecao(params, chave, valor);
      } else if (valor !== null && valor !== undefined && valor !== '') {
        params = params.set(chave, String(valor));
      }
    }
    if (pagina.page !== undefined) params = params.set('page', pagina.page);
    if (pagina.size !== undefined) params = params.set('size', pagina.size);
    for (const ordem of pagina.sort ?? []) params = params.append('sort', ordem);
    return params;
  }
}
