import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ListaConfiguravel,
  ListaConfiguravelResponse,
  OpcaoAtiva,
  OpcaoListaFilter,
  OpcaoListaRequest,
  OpcaoListaResponse,
  OPCOES_FILTRO_LISTAS,
  ROTULOS_LISTAS
} from '../models/listas.models';
import { PagedResponse } from '../models/shared.models';
import { BaseService } from './base.service';

/** Cadastro das listas configuráveis e as opções ativas para os formulários. */
@Injectable({ providedIn: 'root' })
export class ListasService extends BaseService {
  private readonly url = `${environment.apiUrl}/v1/listas`;
  private readonly ativasEmCache = new Map<ListaConfiguravel, Observable<OpcaoAtiva[]>>();

  descrever(lista: ListaConfiguravel): Observable<ListaConfiguravelResponse> {
    return this.http.get<ListaConfiguravelResponse>(`${this.url}/${lista}`);
  }

  listar(lista: ListaConfiguravel, filtro: OpcaoListaFilter = {}): Observable<PagedResponse<OpcaoListaResponse>> {
    return this.getList<OpcaoListaResponse>(`${this.url}/${lista}/opcoes`, filtro);
  }

  /** Opções ativas na ordem do cadastro; guardadas enquanto a página está aberta e renovadas a cada alteração. */
  ativas(lista: ListaConfiguravel): Observable<OpcaoAtiva[]> {
    let o = this.ativasEmCache.get(lista);
    if (!o) {
      o = this.http.get<OpcaoAtiva[]>(`${this.url}/${lista}/opcoes/ativas`).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.ativasEmCache.set(lista, o);
    }
    return o;
  }

  private rotulosCarregados = false;

  /**
   * Completa os nomes das listas com o cadastro do cliente (inclusive desativados) e troca as opções dos filtros pelas
   * ativas. Chamado ao entrar no sistema; sem rede, ficam os nomes padrão.
   */
  carregarRotulos(forcar = false): void {
    if (this.rotulosCarregados && !forcar) return;
    this.rotulosCarregados = true;
    const listas = Object.keys(ROTULOS_LISTAS) as ListaConfiguravel[];
    forkJoin(listas.map((l) => forkJoin({
      rotulos: this.http.get<Record<string, string>>(`${this.url}/${l}/rotulos`).pipe(catchError(() => of(null))),
      ativas: this.ativas(l).pipe(catchError(() => of(null)))
    }))).subscribe((r) => r.forEach(({ rotulos, ativas }, i) => {
      const lista = listas[i];
      if (rotulos) Object.assign(ROTULOS_LISTAS[lista], rotulos);
      if (ativas) OPCOES_FILTRO_LISTAS[lista].splice(0, OPCOES_FILTRO_LISTAS[lista].length, ...ativas.map((o) => ({ label: o.rotulo, value: o.codigo })));
    }));
  }

  criar(lista: ListaConfiguravel, request: OpcaoListaRequest): Observable<OpcaoListaResponse> {
    this.ativasEmCache.delete(lista);
    this.rotulosCarregados = false;
    return this.http.post<OpcaoListaResponse>(`${this.url}/${lista}/opcoes`, request);
  }

  atualizar(lista: ListaConfiguravel, id: string, request: OpcaoListaRequest): Observable<OpcaoListaResponse> {
    this.ativasEmCache.delete(lista);
    this.rotulosCarregados = false;
    return this.http.put<OpcaoListaResponse>(`${this.url}/${lista}/opcoes/${id}`, request);
  }

  mover(lista: ListaConfiguravel, id: string, delta: -1 | 1): Observable<void> {
    this.ativasEmCache.delete(lista);
    this.rotulosCarregados = false;
    return this.http.patch<void>(`${this.url}/${lista}/opcoes/${id}/posicao`, null, { params: { delta } });
  }

  desativar(lista: ListaConfiguravel, id: string): Observable<void> {
    this.ativasEmCache.delete(lista);
    this.rotulosCarregados = false;
    return this.http.patch<void>(`${this.url}/${lista}/opcoes/${id}/desativar`, null);
  }

  reativar(lista: ListaConfiguravel, id: string): Observable<void> {
    this.ativasEmCache.delete(lista);
    this.rotulosCarregados = false;
    return this.http.patch<void>(`${this.url}/${lista}/opcoes/${id}/reativar`, null);
  }
}
