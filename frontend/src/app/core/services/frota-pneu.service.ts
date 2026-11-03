import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AjusteEstoqueFrotaRequest,
  AlmoxarifadoFrota,
  AlmoxarifadoFrotaRequest,
  EntradaEstoqueFrotaRequest,
  EventoPneu,
  FiltroEventosPneu,
  FiltroMovimentosFrota,
  FiltroPneus,
  InspecaoPneu,
  InspecaoPneuRequest,
  MovimentacaoPneusRequest,
  MovimentoEstoqueFrota,
  PecaFrota,
  PecaFrotaRequest,
  Pneu,
  PneuRequest,
  ResumoEstoqueFrota,
  ResumoPneus,
  RetornoPneuRequest,
  SaidaEstoqueFrotaRequest,
  SaldoPecaFrota,
  TransferenciaEstoqueFrotaRequest,
  VeiculoPneus
} from '../models/frota-pneu.models';
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';
import { PaginaFrota } from './frota.service';

/** Estoque da oficina (almoxarifados FROTA, peças, saldos e movimentações) e pneus da frota. */
@Injectable({ providedIn: 'root' })
export class FrotaPneuService {
  private readonly http = inject(HttpClient);
  private readonly estoque = `${environment.apiUrl}/v1/frota/estoque`;
  private readonly pneus = `${environment.apiUrl}/v1/frota/pneus`;

  // ── Estoque da oficina ───────────────────────────────────────────────────
  almoxarifados(): Observable<AlmoxarifadoFrota[]> {
    return this.http.get<AlmoxarifadoFrota[]>(`${this.estoque}/almoxarifados`);
  }

  salvarAlmoxarifado(request: AlmoxarifadoFrotaRequest, id?: string): Observable<AlmoxarifadoFrota> {
    return id ? this.http.put<AlmoxarifadoFrota>(`${this.estoque}/almoxarifados/${id}`, request)
      : this.http.post<AlmoxarifadoFrota>(`${this.estoque}/almoxarifados`, request);
  }

  desativarAlmoxarifado(id: string): Observable<void> {
    return this.http.delete<void>(`${this.estoque}/almoxarifados/${id}`);
  }

  pecas(busca: string | null, grupo: string | null, pagina: PaginaFrota, ativo: boolean | null = true): Observable<PagedResponse<PecaFrota>> {
    return this.http.get<PagedResponse<PecaFrota>>(`${this.estoque}/pecas`, { params: params({ busca, grupo, ativo }, pagina) });
  }

  grupos(): Observable<string[]> {
    return this.http.get<string[]>(`${this.estoque}/pecas/grupos`);
  }

  salvarPeca(request: PecaFrotaRequest, id?: string): Observable<PecaFrota> {
    return id ? this.http.put<PecaFrota>(`${this.estoque}/pecas/${id}`, request) : this.http.post<PecaFrota>(`${this.estoque}/pecas`, request);
  }

  desativarPeca(id: string): Observable<void> {
    return this.http.delete<void>(`${this.estoque}/pecas/${id}`);
  }

  saldos(idEstoque: string | null): Observable<SaldoPecaFrota[]> {
    return this.http.get<SaldoPecaFrota[]>(`${this.estoque}/saldos`, { params: params({ idEstoque }, {}) });
  }

  resumoEstoque(idEstoque: string | null): Observable<ResumoEstoqueFrota> {
    return this.http.get<ResumoEstoqueFrota>(`${this.estoque}/resumo`, { params: params({ idEstoque }, {}) });
  }

  definirParametros(idEstoque: string, idMaterial: string, estoqueMinimo: number | null, localizacao: string | null): Observable<SaldoPecaFrota> {
    return this.http.put<SaldoPecaFrota>(`${this.estoque}/almoxarifados/${idEstoque}/pecas/${idMaterial}`, { estoqueMinimo, localizacao });
  }

  movimentos(filtro: FiltroMovimentosFrota, pagina: PaginaFrota): Observable<PagedResponse<MovimentoEstoqueFrota>> {
    return this.http.get<PagedResponse<MovimentoEstoqueFrota>>(`${this.estoque}/movimentos`, { params: params(filtro, pagina) });
  }

  entrada(request: EntradaEstoqueFrotaRequest): Observable<MovimentoEstoqueFrota[]> {
    return this.http.post<MovimentoEstoqueFrota[]>(`${this.estoque}/entradas`, request);
  }

  saida(request: SaidaEstoqueFrotaRequest): Observable<MovimentoEstoqueFrota[]> {
    return this.http.post<MovimentoEstoqueFrota[]>(`${this.estoque}/saidas`, request);
  }

  transferencia(request: TransferenciaEstoqueFrotaRequest): Observable<MovimentoEstoqueFrota[]> {
    return this.http.post<MovimentoEstoqueFrota[]>(`${this.estoque}/transferencias`, request);
  }

  /** Nulo quando o contado é igual ao saldo. */
  ajuste(request: AjusteEstoqueFrotaRequest): Observable<MovimentoEstoqueFrota | null> {
    return this.http.post<MovimentoEstoqueFrota | null>(`${this.estoque}/ajustes`, request);
  }

  // ── Pneus ────────────────────────────────────────────────────────────────
  listar(filtro: FiltroPneus, pagina: PaginaFrota): Observable<PagedResponse<Pneu>> {
    return this.http.get<PagedResponse<Pneu>>(this.pneus, { params: params(filtro, pagina) });
  }

  resumo(): Observable<ResumoPneus> {
    return this.http.get<ResumoPneus>(`${this.pneus}/resumo`);
  }

  marcas(): Observable<string[]> {
    return this.http.get<string[]>(`${this.pneus}/marcas`);
  }

  buscar(id: string): Observable<Pneu> {
    return this.http.get<Pneu>(`${this.pneus}/${id}`);
  }

  salvar(request: PneuRequest, id?: string): Observable<Pneu> {
    return id ? this.http.put<Pneu>(`${this.pneus}/${id}`, request) : this.http.post<Pneu>(this.pneus, request);
  }

  historico(id: string): Observable<EventoPneu[]> {
    return this.http.get<EventoPneu[]>(`${this.pneus}/${id}/historico`);
  }

  eventos(filtro: FiltroEventosPneu, pagina: PaginaFrota): Observable<PagedResponse<EventoPneu>> {
    return this.http.get<PagedResponse<EventoPneu>>(`${this.pneus}/eventos`, { params: params(filtro, pagina) });
  }

  enviar(id: string, destino: 'REPARO' | 'REFORMA', idFornecedor: string | null, observacao: string | null): Observable<Pneu> {
    return this.http.post<Pneu>(`${this.pneus}/${id}/envio`, { destino, idFornecedor, observacao });
  }

  retornar(id: string, request: RetornoPneuRequest): Observable<Pneu> {
    return this.http.post<Pneu>(`${this.pneus}/${id}/retorno`, request);
  }

  descartar(id: string, motivo: string): Observable<Pneu> {
    return this.http.post<Pneu>(`${this.pneus}/${id}/descarte`, { motivo });
  }

  transferir(id: string, idEstoque: string): Observable<Pneu> {
    return this.http.post<Pneu>(`${this.pneus}/${id}/transferencia`, null, { params: new HttpParams().set('idEstoque', idEstoque) });
  }

  veiculo(idVeiculo: string): Observable<VeiculoPneus> {
    return this.http.get<VeiculoPneus>(`${this.pneus}/veiculos/${idVeiculo}`);
  }

  definirDiagrama(idVeiculo: string, eixos: string, estepes: number): Observable<VeiculoPneus> {
    return this.http.put<VeiculoPneus>(`${this.pneus}/veiculos/${idVeiculo}/diagrama`, { eixos, estepes });
  }

  movimentar(request: MovimentacaoPneusRequest): Observable<VeiculoPneus> {
    return this.http.post<VeiculoPneus>(`${this.pneus}/movimentacoes`, request);
  }

  inspecoes(idVeiculo: string | null, pagina: PaginaFrota, de?: string | null, ate?: string | null): Observable<PagedResponse<InspecaoPneu>> {
    return this.http.get<PagedResponse<InspecaoPneu>>(`${this.pneus}/inspecoes`, { params: params({ idVeiculo, de, ate }, pagina) });
  }

  registrarInspecao(request: InspecaoPneuRequest): Observable<InspecaoPneu> {
    return this.http.post<InspecaoPneu>(`${this.pneus}/inspecoes`, request);
  }
}

function params(filtro: object, pagina: PaginaFrota): HttpParams {
  let p = new HttpParams();
  for (const [chave, valor] of Object.entries(filtro)) {
    if (Array.isArray(valor)) {
      p = comSelecao(p, chave, valor);
    } else if (valor !== null && valor !== undefined && valor !== '') {
      p = p.set(chave, String(valor));
    }
  }
  if (pagina.page !== undefined) p = p.set('page', pagina.page);
  if (pagina.size !== undefined) p = p.set('size', pagina.size);
  for (const ordem of pagina.sort ?? []) p = p.append('sort', ordem);
  return p;
}
