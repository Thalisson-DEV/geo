import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Canteiro,
  CanteiroRequest,
  DevolverSobraRequest,
  MaterialDaObra,
  MovimentarCanteiroRequest,
  RemanejarRequest,
  SaldoPorObra,
} from '../models/estoque-obra.models';

/** Estoque por obra: material da obra, caminhões e canteiros separados por obra, devolução de sobra e remanejamento. */
@Injectable({ providedIn: 'root' })
export class EstoqueObraService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/v1/estoque-obra`;

  materialDaObra(idObra: string): Observable<MaterialDaObra> {
    return this.http.get<MaterialDaObra>(`${this.base}/obras/${idObra}`);
  }

  saldoPorObra(idEstoque: string): Observable<SaldoPorObra> {
    return this.http.get<SaldoPorObra>(`${this.base}/estoques/${idEstoque}`);
  }

  devolverSobra(request: DevolverSobraRequest): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/devolucoes-sobra`, request);
  }

  remanejar(request: RemanejarRequest): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/remanejamentos`, request);
  }

  listarCanteiros(incluirInativos = false): Observable<Canteiro[]> {
    return this.http.get<Canteiro[]>(`${this.base}/canteiros`, { params: { incluirInativos } });
  }

  criarCanteiro(request: CanteiroRequest): Observable<Canteiro> {
    return this.http.post<Canteiro>(`${this.base}/canteiros`, request);
  }

  editarCanteiro(id: string, request: CanteiroRequest): Observable<Canteiro> {
    return this.http.put<Canteiro>(`${this.base}/canteiros/${id}`, request);
  }

  desativarCanteiro(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/canteiros/${id}`);
  }

  movimentarCanteiro(id: string, request: MovimentarCanteiroRequest): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/canteiros/${id}/movimentos`, request);
  }
}
