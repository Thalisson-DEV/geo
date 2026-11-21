import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BoletimEquipes,
  FiltroTurnosObra,
  ListaTurnosObra,
  OcorrenciaDaObra,
  TurnoObraDetalhe
} from '../models/obras-turnos.models';
import { BaseService } from './base.service';

/** Consulta dos turnos das equipes de Obras: listagem, boletim e detalhe. Quem lança é a equipe, em campo. */
@Injectable({ providedIn: 'root' })
export class ObrasTurnosService extends BaseService {
  private readonly base = `${environment.apiUrl}/v1/obras`;

  listar(filtro: FiltroTurnosObra): Observable<ListaTurnosObra> {
    let params = new HttpParams().set('page', filtro.page).set('size', filtro.size);
    for (const campo of ['idEquipe', 'status', 'meta', 'obra', 'de', 'ate', 'q'] as const) {
      const valor = filtro[campo];
      if (valor) params = params.set(campo, valor);
    }
    for (const id of filtro.idBaseOperacional ?? []) params = params.append('idBaseOperacional', id);
    if (filtro.semRelatorio) params = params.set('semRelatorio', true);
    if (filtro.comOcorrencia) params = params.set('comOcorrencia', true);
    for (const ordem of filtro.sort ?? []) params = params.append('sort', ordem);
    return this.http.get<ListaTurnosObra>(`${this.base}/turnos`, { params });
  }

  boletim(data?: string | null, idBase?: string | null): Observable<BoletimEquipes> {
    let params = new HttpParams();
    if (data) params = params.set('data', data);
    if (idBase) params = params.set('idBase', idBase);
    return this.http.get<BoletimEquipes>(`${this.base}/turnos/boletim`, { params });
  }

  /** As últimas ocorrências que as equipes lançaram na obra, da mais recente para a mais antiga. */
  ocorrenciasDaObra(idObra: string): Observable<OcorrenciaDaObra[]> {
    return this.http.get<OcorrenciaDaObra[]>(`${this.base}/${idObra}/ocorrencias-campo`);
  }

  detalhar(id: string): Observable<TurnoObraDetalhe> {
    return this.http.get<TurnoObraDetalhe>(`${this.base}/turnos/${id}`);
  }

  baixarAnexo(id: string, idAnexo: string): Observable<Blob> {
    return this.http.get(`${this.base}/turnos/${id}/anexos/${idAnexo}/download`, { responseType: 'blob' });
  }

  /** Situação de cada equipe agora (turno, chegada/saída na obra, apontamentos, "sem condição"), calculada no servidor. */
  statusEquipes(): Observable<StatusEquipeAgora[]> {
    return this.http.get<StatusEquipeAgora[]>(`${this.base}/campo/status-equipes`);
  }
}

export type StatusOperacionalEquipe = 'SEM_TURNO' | 'ENCERRADO' | 'A_CAMINHO' | 'NA_OBRA' | 'EM_EXECUCAO' | 'PARADA' | 'IMPEDIDA' | 'SEM_OBRA';

export interface StatusEquipeAgora {
  idEquipe: string;
  codigo: string;
  status: StatusOperacionalEquipe;
  rotulo: string;
  numeroObraAtual?: string | null;
  aprsPendentes: number;
  ocorrenciasImpeditivas: number;
  ultimaAtividade?: string | null;
}
