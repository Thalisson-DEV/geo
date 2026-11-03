import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AlvoAnaliseIa, AnaliseIa, EstadoAnaliseIa, FotoAnaliseIa } from '../models/frota-analise-ia.models';

const CAMINHO: Record<AlvoAnaliseIa, string> = {
  ORDEM_SERVICO: 'ordens-servico',
  CHECKLIST: 'checklists',
  ABASTECIMENTO: 'abastecimentos'
};

/** Análise da IA nos relatórios da frota: parecer do registro e leitura das fotos. */
@Injectable({ providedIn: 'root' })
export class FrotaAnaliseIaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota`;

  estado(alvo: AlvoAnaliseIa, id: string): Observable<EstadoAnaliseIa> {
    return this.http.get<EstadoAnaliseIa>(`${this.url}/${CAMINHO[alvo]}/${id}/analise-ia`);
  }

  /** Leva de 10 a 60 segundos: o modelo lê cada foto. */
  analisar(alvo: AlvoAnaliseIa, id: string): Observable<AnaliseIa> {
    return this.http.post<AnaliseIa>(`${this.url}/${CAMINHO[alvo]}/${id}/analise-ia`, null);
  }

  /** Imagem de uma foto citada na análise, de onde ela mora. */
  foto(foto: Pick<FotoAnaliseIa, 'origem' | 'idOrigem' | 'idFoto'>): Observable<Blob> {
    const caminho = {
      CHECKLIST: `checklists/${foto.idOrigem}/fotos/${foto.idFoto}`,
      ABASTECIMENTO: `abastecimentos/${foto.idOrigem}/fotos/${foto.idFoto}`,
      ABASTECIMENTO_ANTERIOR: `abastecimentos/${foto.idOrigem}/fotos/${foto.idFoto}`,
      DOCUMENTO_FISCAL: `ordens-servico/${foto.idOrigem}/documentos-fiscais/${foto.idFoto}/arquivo`
    }[foto.origem];
    return this.http.get(`${this.url}/${caminho}`, { responseType: 'blob' });
  }
}
