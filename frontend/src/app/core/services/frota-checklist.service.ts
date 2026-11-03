import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AbrirOsPendenciasRequest,
  AptidaoConducao,
  CatalogoChecklist,
  ChecklistDetalhe,
  ChecklistFiltro,
  ChecklistResumo,
  LiberacaoCnh,
  LiberacaoCnhRequest,
  ModeloChecklist,
  ModeloChecklistRequest,
  ModeloChecklistResumo,
  PendenciaChecklist,
  ResolverPendenciasRequest,
  SituacaoPendenciaChecklist,
  VeiculoSemChecklist
} from '../models/frota-checklist.models';
import { OrdemServicoDetalhe } from '../models/frota.models';
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';
import { PaginaFrota } from './frota.service';

/** Checklist do veículo na web: modelos, checklists preenchidos, pendências de Não OK e liberação de CNH. */
@Injectable({ providedIn: 'root' })
export class FrotaChecklistService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota`;

  // ── Modelos ──────────────────────────────────────────────────────────────
  modelos(): Observable<PagedResponse<ModeloChecklistResumo>> {
    return this.http.get<PagedResponse<ModeloChecklistResumo>>(`${this.url}/checklist/modelos`, {
      params: this.params({}, { size: 500, sort: ['nome'] })
    });
  }

  modelo(id: string): Observable<ModeloChecklist> {
    return this.http.get<ModeloChecklist>(`${this.url}/checklist/modelos/${id}`);
  }

  salvarModelo(request: ModeloChecklistRequest, id?: string | null): Observable<ModeloChecklist> {
    return id
      ? this.http.put<ModeloChecklist>(`${this.url}/checklist/modelos/${id}`, request)
      : this.http.post<ModeloChecklist>(`${this.url}/checklist/modelos`, request);
  }

  alternarModelo(modelo: Pick<ModeloChecklistResumo, 'id' | 'ativo'>): Observable<void> {
    return modelo.ativo
      ? this.http.delete<void>(`${this.url}/checklist/modelos/${modelo.id}`)
      : this.http.put<void>(`${this.url}/checklist/modelos/${modelo.id}/ativar`, {});
  }

  // ── Checklists ───────────────────────────────────────────────────────────
  checklists(filtro: ChecklistFiltro, pagina: PaginaFrota): Observable<PagedResponse<ChecklistResumo>> {
    return this.http.get<PagedResponse<ChecklistResumo>>(`${this.url}/checklists`, { params: this.params(filtro, pagina) });
  }

  checklist(id: string): Observable<ChecklistDetalhe> {
    return this.http.get<ChecklistDetalhe>(`${this.url}/checklists/${id}`);
  }

  /** Imagem da foto (com o token do interceptor), para virar object URL na tela. */
  foto(idChecklist: string, idFoto: string): Observable<Blob> {
    return this.http.get(`${this.url}/checklists/${idChecklist}/fotos/${idFoto}`, { responseType: 'blob' });
  }

  semChecklistHoje(idsBase: string[] = []): Observable<VeiculoSemChecklist[]> {
    return this.http.get<VeiculoSemChecklist[]>(`${this.url}/checklists/sem-checklist-hoje`, {
      params: this.params({ idsBase }, {})
    });
  }

  // ── Pendências ───────────────────────────────────────────────────────────
  pendencias(situacao: SituacaoPendenciaChecklist | null, idsBase: string[], pagina: PaginaFrota): Observable<PagedResponse<PendenciaChecklist>> {
    return this.http.get<PagedResponse<PendenciaChecklist>>(`${this.url}/checklist/pendencias`, {
      params: this.params({ situacao, idsBase }, pagina)
    });
  }

  abrirOs(request: AbrirOsPendenciasRequest): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/checklist/pendencias/ordem-servico`, request);
  }

  resolverNaHora(request: ResolverPendenciasRequest): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/checklist/pendencias/resolucao`, request);
  }

  descartar(id: string, justificativa: string): Observable<PendenciaChecklist> {
    return this.http.post<PendenciaChecklist>(`${this.url}/checklist/pendencias/${id}/descarte`, { justificativa });
  }

  catalogo(): Observable<CatalogoChecklist> {
    return this.http.get<CatalogoChecklist>(`${this.url}/app/checklist/catalogo`);
  }

  // ── CNH ──────────────────────────────────────────────────────────────────
  aptidao(idColaborador: string, idVeiculo: string): Observable<AptidaoConducao> {
    return this.http.get<AptidaoConducao>(`${this.url}/condutores/${idColaborador}/aptidao`, {
      params: new HttpParams().set('idVeiculo', idVeiculo)
    });
  }

  liberacoesCnh(pagina: PaginaFrota): Observable<PagedResponse<LiberacaoCnh>> {
    return this.http.get<PagedResponse<LiberacaoCnh>>(`${this.url}/liberacoes-cnh`, { params: this.params({}, pagina) });
  }

  liberarCnh(request: LiberacaoCnhRequest): Observable<LiberacaoCnh> {
    return this.http.post<LiberacaoCnh>(`${this.url}/liberacoes-cnh`, request);
  }

  private params(filtro: object, pagina: PaginaFrota): HttpParams {
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
