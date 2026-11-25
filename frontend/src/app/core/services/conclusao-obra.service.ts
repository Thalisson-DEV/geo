import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** O que falta para a obra concluir (serviços, fotos obrigatórias, ocorrências que esperam decisão). */
export interface ConclusaoObra {
  concluida: boolean;
  servicos: number;
  servicosAbertos: number;
  fotos: { idPonto: string; numeroPonto: string | null; titulo: string; motivoReprovacao: string | null }[];
  ocorrencias: { id: string; tipo: string; rotulo: string; descricao: string; registradaEm: string }[];
}

@Injectable({ providedIn: 'root' })
export class ConclusaoObraService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/v1/obras`;

  consultar(idObra: string): Observable<ConclusaoObra> {
    return this.http.get<ConclusaoObra>(`${this.base}/${idObra}/conclusao`);
  }

  resolver(idObra: string, idOcorrencia: string, resolucao: string): Observable<ConclusaoObra> {
    return this.http.post<ConclusaoObra>(`${this.base}/${idObra}/conclusao/ocorrencias/${idOcorrencia}/resolver`, { resolucao });
  }
}
