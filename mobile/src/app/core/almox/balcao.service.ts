import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AtendimentoEquipe, AtendimentoResumo, EquipeNoBalcao, ItemNasEquipes, PainelBalcao, RegistrarDevolucaoRequest, RegistrarRetiradaRequest,
} from './balcao.models';

/** Balcão do almoxarifado (mesma API do web): quadro do dia, atendimento da equipe e registro com comprovantes. */
@Injectable({ providedIn: 'root' })
export class BalcaoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/v1/balcao`;

  painel(idAlmoxarifado?: string | null): Observable<PainelBalcao> {
    const params: Record<string, string> = {};
    if (idAlmoxarifado) params['idAlmoxarifado'] = idAlmoxarifado;
    return this.http.get<PainelBalcao>(this.base, { params });
  }

  atendimento(idEquipe: string, idAlmoxarifado: string): Observable<AtendimentoEquipe> {
    return this.http.get<AtendimentoEquipe>(`${this.base}/equipes/${idEquipe}`, { params: { idAlmoxarifado } });
  }

  registrarRetirada(idEquipe: string, request: RegistrarRetiradaRequest): Observable<AtendimentoResumo> {
    return this.http.post<AtendimentoResumo>(`${this.base}/equipes/${idEquipe}/retiradas`, request);
  }

  /** Equipes com o resumo do caminhão (todas as bases). */
  estoqueEquipes(): Observable<EquipeNoBalcao[]> {
    return this.http.get<EquipeNoBalcao[]>(`${this.base}/estoque-equipes`);
  }

  /** Inventário dos caminhões: equipe × obra × material (negativo = saldo negativo). */
  itensDasEquipes(): Observable<ItemNasEquipes[]> {
    return this.http.get<ItemNasEquipes[]>(`${this.base}/estoque-equipes/itens`);
  }

  registrarDevolucao(idEquipe: string, request: RegistrarDevolucaoRequest): Observable<AtendimentoResumo> {
    return this.http.post<AtendimentoResumo>(`${this.base}/equipes/${idEquipe}/devolucoes`, request);
  }
}
