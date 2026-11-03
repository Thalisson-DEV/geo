import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ContagensPreventiva,
  ControlePreventivo,
  CorretivaPorItem,
  FiltroAcompanhamentoPreventiva,
  InformarRealizacaoRequest,
  OsPreventivaAberta,
  PlanoPreventivo,
  PlanoPreventivoRequest,
  PreventivaVeiculo
} from '../models/frota-preventiva.models';
import { PagedResponse } from '../models/shared.models';
import { PaginaFrota } from './frota.service';

export interface AcompanhamentoPreventiva {
  pagina: PagedResponse<ControlePreventivo>;
  contagens: ContagensPreventiva;
}

/** Preventiva da frota: planos, acompanhamento por veículo, realização informada, OS e corretivas por serviço. */
@Injectable({ providedIn: 'root' })
export class FrotaPreventivaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota/preventiva`;

  planos(ativo: boolean | null = null): Observable<PlanoPreventivo[]> {
    let params = new HttpParams();
    if (ativo !== null) params = params.set('ativo', ativo);
    return this.http.get<PlanoPreventivo[]>(`${this.url}/planos`, { params });
  }

  plano(id: string): Observable<PlanoPreventivo> {
    return this.http.get<PlanoPreventivo>(`${this.url}/planos/${id}`);
  }

  salvarPlano(request: PlanoPreventivoRequest, id?: string): Observable<PlanoPreventivo> {
    return id
      ? this.http.put<PlanoPreventivo>(`${this.url}/planos/${id}`, request)
      : this.http.post<PlanoPreventivo>(`${this.url}/planos`, request);
  }

  alternarPlano(plano: Pick<PlanoPreventivo, 'id' | 'ativo'>): Observable<void> {
    return plano.ativo
      ? this.http.delete<void>(`${this.url}/planos/${plano.id}`)
      : this.http.put<void>(`${this.url}/planos/${plano.id}/ativar`, null);
  }

  acompanhamento(filtro: FiltroAcompanhamentoPreventiva, pagina: PaginaFrota = {}): Observable<AcompanhamentoPreventiva> {
    let params = new HttpParams();
    filtro.situacao.forEach((s) => (params = params.append('situacao', s)));
    filtro.idBase.forEach((b) => (params = params.append('idBase', b)));
    if (filtro.idPlano) params = params.set('idPlano', filtro.idPlano);
    if (filtro.idVeiculo) params = params.set('idVeiculo', filtro.idVeiculo);
    if (filtro.busca) params = params.set('busca', filtro.busca);
    if (pagina.page !== undefined) params = params.set('page', pagina.page);
    if (pagina.size !== undefined) params = params.set('size', pagina.size);
    return this.http.get<AcompanhamentoPreventiva>(`${this.url}/acompanhamento`, { params });
  }

  informarRealizacao(idControle: string, request: InformarRealizacaoRequest): Observable<ControlePreventivo> {
    return this.http.post<ControlePreventivo>(`${this.url}/controles/${idControle}/realizacao`, request);
  }

  abrirOs(idsControle: string[]): Observable<OsPreventivaAberta> {
    return this.http.post<OsPreventivaAberta>(`${this.url}/controles/abrir-os`, { idsControle });
  }

  doVeiculo(idVeiculo: string): Observable<PreventivaVeiculo> {
    return this.http.get<PreventivaVeiculo>(`${this.url}/veiculos/${idVeiculo}`);
  }

  corretivas(de: string | null, ate: string | null, idsBase: string[] = [], idsTipoVeiculo: string[] = []): Observable<CorretivaPorItem[]> {
    let params = new HttpParams();
    if (de) params = params.set('de', de);
    if (ate) params = params.set('ate', ate);
    idsBase.forEach((b) => (params = params.append('idBase', b)));
    idsTipoVeiculo.forEach((t) => (params = params.append('idTipoVeiculo', t)));
    return this.http.get<CorretivaPorItem[]>(`${this.url}/corretivas`, { params });
  }
}
