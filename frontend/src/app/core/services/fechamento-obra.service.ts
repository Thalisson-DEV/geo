import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  CriarFechamentoRequest,
  EditarFechamentoRequest,
  EstornarFechamentoRequest,
  FechamentoDetalhe,
  FechamentoFiltro,
  FechamentoImportacaoRegistro,
  FechamentoImportacaoResposta,
  FechamentoResumo,
  FormatoExportacaoFechamento,
  MovimentarFechamentoRequest,
  PessoaFechamento,
  PreviaSaldo,
  SituacaoFechamentoObra,
  SituacaoObraFechamento
} from '../models/fechamento-obra.models';
import { PagedResponse } from '../models/shared.models';
import { HistoricoSolicitacaoResponse } from '../models/solicitacao-material-tecnica.models';
import { HEADER_IDEMPOTENCIA } from '../utils/idempotencia.util';
import { toHttpParams } from '../utils/http-params.util';

@Injectable({ providedIn: 'root' })
export class FechamentoObraService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/v1/obras/encerramento`;

  listar(filtro: FechamentoFiltro): Observable<PagedResponse<FechamentoResumo>> {
    return this.http.get<PagedResponse<FechamentoResumo>>(this.base, { params: toHttpParams({ ...filtro }) });
  }

  solicitantes(): Observable<PessoaFechamento[]> {
    return this.http.get<PessoaFechamento[]>(`${this.base}/solicitantes`);
  }

  situacaoObra(idObra: string): Observable<SituacaoObraFechamento> {
    return this.http.get<SituacaoObraFechamento>(`${this.base}/obras/${idObra}/situacao`);
  }

  /** Obra sem solicitação de encerramento não vem no resultado. */
  situacoesObras(ids: string[]): Observable<Record<string, SituacaoFechamentoObra>> {
    return this.http.get<Record<string, SituacaoFechamentoObra>>(`${this.base}/obras/situacoes`, { params: toHttpParams({ ids }) });
  }

  detalhe(id: string): Observable<FechamentoDetalhe> {
    return this.http.get<FechamentoDetalhe>(`${this.base}/${id}`);
  }

  historico(id: string): Observable<HistoricoSolicitacaoResponse> {
    return this.http.get<HistoricoSolicitacaoResponse>(`${this.base}/${id}/historico`, { params: { size: 200 } });
  }

  criar(pedido: CriarFechamentoRequest, chave: string): Observable<{ ids: string[] }> {
    return this.http.post<{ ids: string[] }>(this.base, pedido, { headers: this.chave(chave) });
  }

  editar(id: string, pedido: EditarFechamentoRequest): Observable<FechamentoDetalhe> {
    return this.http.put<FechamentoDetalhe>(`${this.base}/${id}`, pedido);
  }

  registrarReserva(id: string, versaoEsperada: number, numero: string, dataCriacao: string | null): Observable<FechamentoDetalhe> {
    return this.http.put<FechamentoDetalhe>(`${this.base}/${id}/reserva`, { versaoEsperada, numero, dataCriacao });
  }

  registrarPendencia(id: string, idItem: string | null, idMotivoPendencia: string, justificativa: string | null): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.base}/${id}/pendencias`, { idItem, idMotivoPendencia, justificativa });
  }

  removerPendencia(id: string, idItem: string | null): Observable<FechamentoDetalhe> {
    return this.http.delete<FechamentoDetalhe>(`${this.base}/${id}/pendencias`, {
      params: idItem ? { idItem } : {}
    });
  }

  cancelar(id: string, versaoEsperada: number, motivo: string): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.base}/${id}/cancelamento`, { versaoEsperada, motivo });
  }

  movimentar(id: string, pedido: MovimentarFechamentoRequest, chave: string): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.base}/${id}/movimentacoes`, pedido, { headers: this.chave(chave) });
  }

  previaMovimentacao(id: string, pedido: MovimentarFechamentoRequest): Observable<PreviaSaldo> {
    return this.http.post<PreviaSaldo>(`${this.base}/${id}/movimentacoes/previa`, pedido);
  }

  estornar(id: string, idOperacao: string, pedido: EstornarFechamentoRequest, chave: string): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.base}/${id}/movimentacoes/${idOperacao}/estorno`, pedido, {
      headers: this.chave(chave)
    });
  }

  previaEstorno(id: string, idOperacao: string, pedido: EstornarFechamentoRequest): Observable<PreviaSaldo> {
    return this.http.post<PreviaSaldo>(`${this.base}/${id}/movimentacoes/${idOperacao}/estorno/previa`, pedido);
  }

  exportar(formato: FormatoExportacaoFechamento, filtro: FechamentoFiltro): Observable<Blob> {
    return this.http.get(`${this.base}/exportar/${formato}`, { params: toHttpParams({ ...filtro }), responseType: 'blob' });
  }

  baixarModeloImportacao(): Observable<Blob> {
    return this.http.get(`${this.base}/importar/modelo`, { responseType: 'blob' });
  }

  validarImportacao(arquivo: File): Observable<FechamentoImportacaoResposta> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    return this.http.post<FechamentoImportacaoResposta>(`${this.base}/importar/validar`, corpo);
  }

  revalidarImportacao(registros: FechamentoImportacaoRegistro[]): Observable<FechamentoImportacaoResposta> {
    return this.http.post<FechamentoImportacaoResposta>(`${this.base}/importar/revalidar`, { registros });
  }

  confirmarImportacao(registros: FechamentoImportacaoRegistro[], chave: string): Observable<FechamentoImportacaoResposta> {
    return this.http.post<FechamentoImportacaoResposta>(`${this.base}/importar/confirmar`, { registros }, { headers: this.chave(chave) });
  }

  private chave(chave: string): HttpHeaders {
    return new HttpHeaders({ [HEADER_IDEMPOTENCIA]: chave });
  }
}
