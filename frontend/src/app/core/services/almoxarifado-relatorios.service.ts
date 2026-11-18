import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { EstoqueRelatorioResponse, FechamentoRelatorioResponse, MovimentacoesRelatorioResponse } from '../models/almoxarifado-relatorios.models';
import { PainelSolicitacoesResponse, ProcessoSolicitacao } from '../models/painel-solicitacoes.models';

/** Dados dos relatórios gerenciais do almoxarifado. */
@Injectable({ providedIn: 'root' })
export class AlmoxarifadoRelatoriosService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/v1`;

  /** Movimentações do período e do período anterior de mesma duração (`anterior = true`). */
  movimentacoes(de: string, ate: string): Observable<MovimentacoesRelatorioResponse> {
    return this.http.get<MovimentacoesRelatorioResponse>(`${this.api}/almoxarifado/relatorios/movimentacoes`, {
      params: new HttpParams().set('de', de).set('ate', ate)
    });
  }

  /** Posição atual do estoque (saldos positivos). */
  estoque(): Observable<EstoqueRelatorioResponse> {
    return this.http.get<EstoqueRelatorioResponse>(`${this.api}/almoxarifado/relatorios/estoque`);
  }

  /** Encerramento de obras: criadas no período e as em andamento de antes dele. */
  fechamento(de: string, ate: string): Observable<FechamentoRelatorioResponse> {
    return this.http.get<FechamentoRelatorioResponse>(`${this.api}/almoxarifado/relatorios/fechamento`, {
      params: new HttpParams().set('de', de).set('ate', ate)
    });
  }

  /**
   * Solicitações do período (mais o backlog aberto de antes dele). Base, processo, equipe e almoxarifado
   * com seleção múltipla são filtrados no cliente.
   */
  solicitacoes(de: string, ate: string, contexto?: ProcessoSolicitacao,
               unicos: { idBaseOperacional?: string; idProcesso?: string; idEquipe?: string; idAlmoxarifado?: string } = {}): Observable<PainelSolicitacoesResponse> {
    let params = new HttpParams()
      .set('dataInicio', new Date(`${de}T00:00:00`).toISOString())
      .set('dataFim', new Date(`${ate}T23:59:59.999`).toISOString());
    if (contexto) params = params.set('contexto', contexto);
    // Seleção única vai ao servidor: assim os materiais agregados respeitam o mesmo recorte.
    for (const [k, v] of Object.entries(unicos)) if (v) params = params.set(k, v);
    return this.http.get<PainelSolicitacoesResponse>(`${this.api}/dashboard/solicitacoes/analitico`, { params });
  }
}
