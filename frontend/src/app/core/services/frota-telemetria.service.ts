import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ConsumoAbastecimentoTelemetria,
  EventoTelemetria,
  FiltroEventosTelemetria,
  FiltroRastreadores,
  MapaFrota,
  RastreadorTelemetria,
  SaudeRastreadores,
  SituacaoTelemetria,
  TelemetriaVeiculo,
  TrajetoTelemetria,
  UsoVeiculo
} from '../models/frota-telemetria.models';
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';
import { PaginaFrota } from './frota.service';

/** Telemetria da frota (Ubicaly e Zuq): situação, rastreadores, eventos, veículo e consumo. */
@Injectable({ providedIn: 'root' })
export class FrotaTelemetriaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota/telemetria`;

  situacao(): Observable<SituacaoTelemetria> {
    return this.http.get<SituacaoTelemetria>(`${this.url}/situacao`);
  }

  /** Uso do veículo nos últimos 7, 30 ou 90 dias (aba Uso da ficha). */
  uso(idVeiculo: string, dias: number): Observable<UsoVeiculo> {
    return this.http.get<UsoVeiculo>(`${environment.apiUrl}/v1/frota/veiculos/${idVeiculo}/uso`, { params: new HttpParams().set('dias', dias) });
  }

  /** Placas com dois rastreadores (o que fica e o que pode ser cancelado). */
  saude(): Observable<SaudeRastreadores> {
    return this.http.get<SaudeRastreadores>(`${this.url}/saude`);
  }

  listarRastreadores(filtro: FiltroRastreadores, pagina: PaginaFrota = {}): Observable<PagedResponse<RastreadorTelemetria>> {
    return this.http.get<PagedResponse<RastreadorTelemetria>>(`${this.url}/rastreadores`, { params: this.params(filtro, pagina) });
  }

  detalharRastreador(id: string): Observable<RastreadorTelemetria> {
    return this.http.get<RastreadorTelemetria>(`${this.url}/rastreadores/${id}`);
  }

  vincular(id: string, idVeiculo: string): Observable<RastreadorTelemetria> {
    return this.http.put<RastreadorTelemetria>(`${this.url}/rastreadores/${id}/veiculo`, { idVeiculo });
  }

  desfazerVinculo(id: string): Observable<RastreadorTelemetria> {
    return this.http.delete<RastreadorTelemetria>(`${this.url}/rastreadores/${id}/veiculo`);
  }

  ignorar(id: string): Observable<RastreadorTelemetria> {
    return this.http.post<RastreadorTelemetria>(`${this.url}/rastreadores/${id}/ignorar`, {});
  }

  reativar(id: string): Observable<RastreadorTelemetria> {
    return this.http.post<RastreadorTelemetria>(`${this.url}/rastreadores/${id}/reativar`, {});
  }

  listarEventos(filtro: FiltroEventosTelemetria, pagina: PaginaFrota = {}): Observable<PagedResponse<EventoTelemetria>> {
    return this.http.get<PagedResponse<EventoTelemetria>>(`${this.url}/eventos`, { params: this.params(filtro, pagina) });
  }

  detalharEvento(id: string): Observable<EventoTelemetria> {
    return this.http.get<EventoTelemetria>(`${this.url}/eventos/${id}`);
  }

  mapa(idsBase: string[] = []): Observable<MapaFrota> {
    return this.http.get<MapaFrota>(`${this.url}/mapa`, { params: this.params({ idsBase }, {}) });
  }

  veiculo(idVeiculo: string): Observable<TelemetriaVeiculo> {
    return this.http.get<TelemetriaVeiculo>(`${this.url}/veiculos/${idVeiculo}`);
  }

  trajeto(idVeiculo: string, de: string, ate: string): Observable<TrajetoTelemetria> {
    return this.http.get<TrajetoTelemetria>(`${this.url}/veiculos/${idVeiculo}/trajeto`, { params: { de, ate } });
  }

  consumoAbastecimento(idAbastecimento: string): Observable<ConsumoAbastecimentoTelemetria> {
    return this.http.get<ConsumoAbastecimentoTelemetria>(`${this.url}/abastecimentos/${idAbastecimento}/consumo`);
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
