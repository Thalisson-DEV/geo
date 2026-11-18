import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  DetalheCombustivelFrota,
  DetalheConformidadeFrota,
  DetalheCustosFrota,
  DetalheManutencaoFrota,
  DetalheUsoFrota,
  FiltroRelatorioFrota,
  RelatorioGerencialFrota
} from '../models/frota-relatorios.models';

/**
 * Relatórios gerenciais da frota: os indicadores do recorte (`gerencial`) e os registros de origem de
 * cada dashboard (`detalhe/*`), que alimentam o drill-down.
 */
@Injectable({ providedIn: 'root' })
export class FrotaRelatoriosService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota/relatorios`;

  gerencial(filtro: FiltroRelatorioFrota): Observable<RelatorioGerencialFrota> {
    return this.http.get<RelatorioGerencialFrota>(`${this.url}/gerencial`, { params: parametros(filtro) });
  }

  custos(filtro: FiltroRelatorioFrota): Observable<DetalheCustosFrota> {
    return this.http.get<DetalheCustosFrota>(`${this.url}/detalhe/custos`, { params: parametros(filtro) });
  }

  manutencao(filtro: FiltroRelatorioFrota): Observable<DetalheManutencaoFrota> {
    return this.http.get<DetalheManutencaoFrota>(`${this.url}/detalhe/manutencao`, { params: parametros(filtro) });
  }

  combustivel(filtro: FiltroRelatorioFrota): Observable<DetalheCombustivelFrota> {
    return this.http.get<DetalheCombustivelFrota>(`${this.url}/detalhe/combustivel`, { params: parametros(filtro) });
  }

  uso(filtro: FiltroRelatorioFrota): Observable<DetalheUsoFrota> {
    return this.http.get<DetalheUsoFrota>(`${this.url}/detalhe/uso`, { params: parametros(filtro) });
  }

  conformidade(filtro: FiltroRelatorioFrota, horizonte: number): Observable<DetalheConformidadeFrota> {
    return this.http.get<DetalheConformidadeFrota>(`${this.url}/detalhe/conformidade`, {
      params: parametros(filtro).set('horizonte', String(horizonte))
    });
  }
}

function parametros(filtro: FiltroRelatorioFrota): HttpParams {
  let params = new HttpParams();
  if (filtro.de) params = params.set('de', filtro.de);
  if (filtro.ate) params = params.set('ate', filtro.ate);
  const listas: (keyof FiltroRelatorioFrota)[] = ['idBase', 'idProcesso', 'idTipoVeiculo', 'regime', 'situacao', 'idVeiculo'];
  for (const chave of listas) {
    for (const valor of (filtro[chave] as string[] | undefined) ?? []) params = params.append(chave, valor);
  }
  return params;
}
