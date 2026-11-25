import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AtendimentoEquipe,
  AtendimentoResumo,
  EquipeNoBalcao,
  GrupoCaminhao,
  ItemNasEquipes,
  PainelBalcao,
  RegistrarDevolucaoRequest,
  RegistrarRetiradaRequest,
  RegrasBalcao,
} from '../models/balcao.models';

/** Balcão do almoxarifado: fila do dia, atendimento da equipe, retirada, devolução e estoque das equipes. */
@Injectable({ providedIn: 'root' })
export class BalcaoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/v1/balcao`;

  painel(idAlmoxarifado?: string | null, data?: string | null): Observable<PainelBalcao> {
    const params: Record<string, string> = {};
    if (idAlmoxarifado) params['idAlmoxarifado'] = idAlmoxarifado;
    if (data) params['data'] = data;
    return this.http.get<PainelBalcao>(this.base, { params });
  }

  atendimento(idEquipe: string, idAlmoxarifado: string, data?: string | null): Observable<AtendimentoEquipe> {
    const params: Record<string, string> = { idAlmoxarifado };
    if (data) params['data'] = data;
    return this.http.get<AtendimentoEquipe>(`${this.base}/equipes/${idEquipe}`, { params });
  }

  registrarRetirada(idEquipe: string, request: RegistrarRetiradaRequest): Observable<AtendimentoResumo> {
    return this.http.post<AtendimentoResumo>(`${this.base}/equipes/${idEquipe}/retiradas`, request);
  }

  registrarDevolucao(idEquipe: string, request: RegistrarDevolucaoRequest): Observable<AtendimentoResumo> {
    return this.http.post<AtendimentoResumo>(`${this.base}/equipes/${idEquipe}/devolucoes`, request);
  }

  atendimentoPorId(id: string): Observable<AtendimentoResumo> {
    return this.http.get<AtendimentoResumo>(`${this.base}/atendimentos/${id}`);
  }

  comprovante(id: string, parte: 'assinatura' | 'foto'): Observable<Blob> {
    return this.http.get(`${this.base}/atendimentos/${id}/${parte}`, { responseType: 'blob' });
  }

  estoqueDasEquipes(): Observable<EquipeNoBalcao[]> {
    return this.http.get<EquipeNoBalcao[]>(`${this.base}/estoque-equipes`);
  }

  itensDasEquipes(): Observable<ItemNasEquipes[]> {
    return this.http.get<ItemNasEquipes[]>(`${this.base}/estoque-equipes/itens`);
  }

  caminhaoPorObra(idEquipe: string): Observable<GrupoCaminhao[]> {
    return this.http.get<GrupoCaminhao[]>(`${this.base}/estoque-equipes/${idEquipe}/caminhao`);
  }

  regras(): Observable<RegrasBalcao> {
    return this.http.get<RegrasBalcao>(`${this.base}/parametros`);
  }

  salvarRegras(regras: RegrasBalcao): Observable<RegrasBalcao> {
    return this.http.put<RegrasBalcao>(`${this.base}/parametros`, regras);
  }
}
