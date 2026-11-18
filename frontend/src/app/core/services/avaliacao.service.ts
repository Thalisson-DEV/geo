import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CampanhaAvaliacao,
  CampanhaAvaliacaoRequest,
  ConviteAvaliacao,
  OrigemAvaliacao,
  RespostaAvaliacao,
  RespostaAvaliacaoRequest,
  ResumoAvaliacao
} from '../models/avaliacao.models';

/** Chamadas HTTP da avaliação do aplicativo. */
@Injectable({ providedIn: 'root' })
export class AvaliacaoService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/v1/avaliacoes`;

  /** `null` quando não há pesquisa no ar (o servidor responde 204). */
  convite(): Observable<ConviteAvaliacao | null> {
    return this.http.get<ConviteAvaliacao | null>(`${this.apiUrl}/convite`);
  }

  responder(campanhaId: string, resposta: RespostaAvaliacaoRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${campanhaId}/respostas`, resposta);
  }

  adiar(campanhaId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${campanhaId}/adiamento`, {});
  }

  recusar(campanhaId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${campanhaId}/recusa`, {});
  }

  listarCampanhas(): Observable<CampanhaAvaliacao[]> {
    return this.http.get<CampanhaAvaliacao[]>(`${this.apiUrl}/campanhas`);
  }

  abrirCampanha(req: CampanhaAvaliacaoRequest): Observable<CampanhaAvaliacao> {
    return this.http.post<CampanhaAvaliacao>(`${this.apiUrl}/campanhas`, req);
  }

  encerrarCampanha(id: string): Observable<CampanhaAvaliacao> {
    return this.http.patch<CampanhaAvaliacao>(`${this.apiUrl}/campanhas/${id}/encerramento`, {});
  }

  resumo(id: string, origem: OrigemAvaliacao | null): Observable<ResumoAvaliacao> {
    return this.http.get<ResumoAvaliacao>(`${this.apiUrl}/campanhas/${id}/resumo`, { params: this.params(origem) });
  }

  respostas(id: string, origem: OrigemAvaliacao | null): Observable<RespostaAvaliacao[]> {
    return this.http.get<RespostaAvaliacao[]>(`${this.apiUrl}/campanhas/${id}/respostas`, { params: this.params(origem) });
  }

  private params(origem: OrigemAvaliacao | null): HttpParams {
    return origem ? new HttpParams().set('origem', origem) : new HttpParams();
  }
}
