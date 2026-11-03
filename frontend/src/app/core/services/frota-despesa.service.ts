import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  DespesaImportacaoLinha,
  DespesaVeiculo,
  DespesaVeiculoRequest,
  FiltroDespesas,
  ImportacaoDespesas,
  ResumoDespesas,
  TipoDespesa,
  TipoDespesaRequest
} from '../models/frota-despesa.models';
import { PreenchimentoFinanceiro } from '../models/frota.models';
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';
import { PaginaFrota } from './frota.service';

/** Despesas por veículo: lançamento, totais, comprovantes, importação e o pagamento pelo financeiro. */
@Injectable({ providedIn: 'root' })
export class FrotaDespesaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota/despesas`;

  listar(filtro: FiltroDespesas, pagina: PaginaFrota): Observable<PagedResponse<DespesaVeiculo>> {
    return this.http.get<PagedResponse<DespesaVeiculo>>(this.url, { params: this.params(filtro, pagina) });
  }

  resumo(filtro: FiltroDespesas): Observable<ResumoDespesas> {
    return this.http.get<ResumoDespesas>(`${this.url}/resumo`, { params: this.params(filtro, {}) });
  }

  buscar(id: string): Observable<DespesaVeiculo> {
    return this.http.get<DespesaVeiculo>(`${this.url}/${id}`);
  }

  salvar(request: DespesaVeiculoRequest, id?: string): Observable<DespesaVeiculo> {
    return id ? this.http.put<DespesaVeiculo>(`${this.url}/${id}`, request) : this.http.post<DespesaVeiculo>(this.url, request);
  }

  excluir(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  anexar(id: string, arquivo: File): Observable<DespesaVeiculo> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    return this.http.post<DespesaVeiculo>(`${this.url}/${id}/anexos`, corpo);
  }

  baixarAnexo(id: string, idAnexo: string): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/anexos/${idAnexo}`, { responseType: 'blob' });
  }

  removerAnexo(id: string, idAnexo: string): Observable<DespesaVeiculo> {
    return this.http.delete<DespesaVeiculo>(`${this.url}/${id}/anexos/${idAnexo}`);
  }

  /** Valores para o formulário de pagamento do financeiro (origem FROTA_DESPESA). */
  preenchimentoFinanceiro(id: string): Observable<PreenchimentoFinanceiro> {
    return this.http.get<PreenchimentoFinanceiro>(`${this.url}/${id}/preenchimento-financeiro`);
  }

  validarImportacao(arquivo: File): Observable<ImportacaoDespesas> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    return this.http.post<ImportacaoDespesas>(`${this.url}/importacao`, corpo);
  }

  confirmarImportacao(linhas: DespesaImportacaoLinha[]): Observable<ImportacaoDespesas> {
    return this.http.post<ImportacaoDespesas>(`${this.url}/importacao/confirmacao`, linhas);
  }

  modelo(): Observable<Blob> {
    return this.http.get(`${this.url}/importacao/modelo`, { responseType: 'blob' });
  }

  // ── Tipos ─────────────────────────────────────────────────────────────────
  tipos(apenasAtivos = true): Observable<TipoDespesa[]> {
    return this.http.get<TipoDespesa[]>(`${this.url}/tipos`, { params: { apenasAtivos } });
  }

  salvarTipo(request: TipoDespesaRequest, id?: string): Observable<TipoDespesa> {
    return id ? this.http.put<TipoDespesa>(`${this.url}/tipos/${id}`, request) : this.http.post<TipoDespesa>(`${this.url}/tipos`, request);
  }

  alternarTipo(tipo: TipoDespesa): Observable<void> {
    return tipo.ativo ? this.http.delete<void>(`${this.url}/tipos/${tipo.id}`) : this.http.put<void>(`${this.url}/tipos/${tipo.id}/ativar`, null);
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
