import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Pagina } from '../almox/almox.models';
import { chaveIdempotente, params } from '../almox/almox.service';
import { silentContext } from '../http/http-context';
import {
  CriarFechamentoRequest, EditarFechamentoRequest, EstornarFechamentoRequest, FechamentoDetalhe, FechamentoFiltro, FechamentoResumo,
  MovimentarFechamentoRequest, PreviaSaldo,
} from './fechamento.models';

export interface SupervisorFechamento { id: string; nomeColaborador: string; nomeCoordenador?: string | null }

/** Encerramento de obras: sempre online, com a versão e o saldo de agora no servidor. */
@Injectable({ providedIn: 'root' })
export class FechamentoService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiBaseUrl}/v1`;
  private readonly base = `${this.api}/obras/encerramento`;
  private supervisores$?: Observable<SupervisorFechamento[]>;

  /** Chave de um envio: repetir o mesmo envio depois de a conexão cair não duplica nada. */
  novaChave(): string {
    return chaveIdempotente();
  }

  listar(filtro: FechamentoFiltro): Observable<Pagina<FechamentoResumo>> {
    return this.http.get<Pagina<FechamentoResumo>>(this.base, { params: params({ ...filtro }), context: silentContext() });
  }

  /** Total de cada recorte (uma consulta de 1 linha cada). Recorte que falha fica sem número. */
  contar(recortes: Record<string, FechamentoFiltro>): Observable<Record<string, number>> {
    const consultas = Object.entries(recortes).map(([chave, filtro]) => this.listar({ ...filtro, page: 0, size: 1 }).pipe(
      map(r => [chave, r.page?.totalElements ?? 0] as const),
      catchError(() => of([chave, undefined] as const)),
    ));
    return forkJoin(consultas).pipe(map(pares => Object.fromEntries(pares.filter(([, n]) => n !== undefined)) as Record<string, number>));
  }

  detalhe(id: string): Observable<FechamentoDetalhe> {
    return this.http.get<FechamentoDetalhe>(this.url(id), { context: silentContext() });
  }

  criar(pedido: CriarFechamentoRequest, chave: string): Observable<{ ids: string[] }> {
    return this.http.post<{ ids: string[] }>(this.base, pedido, { headers: cabecalho(chave), context: silentContext() });
  }

  editar(id: string, pedido: EditarFechamentoRequest): Observable<FechamentoDetalhe> {
    return this.http.put<FechamentoDetalhe>(this.url(id), pedido, { context: silentContext() });
  }

  registrarReserva(id: string, versaoEsperada: number, numero: string, dataCriacao: string | null): Observable<FechamentoDetalhe> {
    return this.http.put<FechamentoDetalhe>(`${this.url(id)}/reserva`, { versaoEsperada, numero, dataCriacao }, { context: silentContext() });
  }

  registrarPendencia(id: string, idItem: string | null, idMotivoPendencia: string, justificativa: string | null): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.url(id)}/pendencias`, { idItem, idMotivoPendencia, justificativa }, { context: silentContext() });
  }

  removerPendencia(id: string, idItem: string | null): Observable<FechamentoDetalhe> {
    return this.http.delete<FechamentoDetalhe>(`${this.url(id)}/pendencias`, { params: idItem ? { idItem } : {}, context: silentContext() });
  }

  cancelar(id: string, versaoEsperada: number, motivo: string): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.url(id)}/cancelamento`, { versaoEsperada, motivo }, { context: silentContext() });
  }

  movimentar(id: string, pedido: MovimentarFechamentoRequest, chave: string): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.url(id)}/movimentacoes`, pedido, { headers: cabecalho(chave), context: silentContext() });
  }

  previaMovimentacao(id: string, pedido: MovimentarFechamentoRequest): Observable<PreviaSaldo> {
    return this.http.post<PreviaSaldo>(`${this.url(id)}/movimentacoes/previa`, pedido, { context: silentContext() });
  }

  estornar(id: string, idOperacao: string, pedido: EstornarFechamentoRequest, chave: string): Observable<FechamentoDetalhe> {
    return this.http.post<FechamentoDetalhe>(`${this.url(id)}/movimentacoes/${encodeURIComponent(idOperacao)}/estorno`, pedido, {
      headers: cabecalho(chave), context: silentContext(),
    });
  }

  previaEstorno(id: string, idOperacao: string, pedido: EstornarFechamentoRequest): Observable<PreviaSaldo> {
    return this.http.post<PreviaSaldo>(`${this.url(id)}/movimentacoes/${encodeURIComponent(idOperacao)}/estorno/previa`, pedido, { context: silentContext() });
  }

  /** Supervisores do cadastro de RH; o coordenador vem junto. Falha não trava a tela. */
  supervisores(): Observable<SupervisorFechamento[]> {
    this.supervisores$ ??= this.http.get<SupervisorFechamento[]>(`${this.api}/rh/supervisores/min`, { context: silentContext() })
      .pipe(map(r => r ?? []), catchError(() => { this.supervisores$ = undefined; return of([]); }), shareReplay(1));
    return this.supervisores$;
  }

  private url(id: string): string {
    return `${this.base}/${encodeURIComponent(id)}`;
  }
}

function cabecalho(chave: string): Record<string, string> {
  return { 'Idempotency-Key': chave };
}
