import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  Apolice,
  ApoliceRequest,
  CoberturaVeiculo,
  FiltroApolices,
  MotivoEncerramentoCobertura,
  SeguradoraFrota,
  SeguradoraFrotaRequest,
  FiltroSinistros,
  ResumoSinistros,
  Sinistro,
  SinistroRequest
} from '../models/frota-seguro.models';
import { AbrirOrdemServicoRequest, PreenchimentoFinanceiro } from '../models/frota.models';

export type AbrirReparoSinistroRequest = Omit<AbrirOrdemServicoRequest, 'idVeiculo' | 'origem' | 'idBaseOperacional' | 'descricaoEquipamento'>;
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';
import { PaginaFrota } from './frota.service';

/** Seguros (apólices, veículos cobertos, parcelas) e sinistros da frota. */
@Injectable({ providedIn: 'root' })
export class FrotaSeguroService {
  private readonly http = inject(HttpClient);
  private readonly apolices = `${environment.apiUrl}/v1/frota/apolices`;
  private readonly sinistros = `${environment.apiUrl}/v1/frota/sinistros`;
  private readonly seguradoras = `${environment.apiUrl}/v1/frota/seguradoras`;

  // ── Seguradoras e corretoras ─────────────────────────────────────────────
  listarSeguradoras(): Observable<SeguradoraFrota[]> {
    return this.http.get<SeguradoraFrota[]>(this.seguradoras);
  }

  salvarSeguradora(request: SeguradoraFrotaRequest, id?: string): Observable<SeguradoraFrota> {
    return id ? this.http.put<SeguradoraFrota>(`${this.seguradoras}/${id}`, request) : this.http.post<SeguradoraFrota>(this.seguradoras, request);
  }

  alternarSeguradora(s: SeguradoraFrota): Observable<void> {
    return s.ativo ? this.http.delete<void>(`${this.seguradoras}/${s.id}`) : this.http.put<void>(`${this.seguradoras}/${s.id}/ativar`, {});
  }

  // ── Apólices ──────────────────────────────────────────────────────────────
  listarApolices(filtro: FiltroApolices, pagina: PaginaFrota): Observable<PagedResponse<Apolice>> {
    return this.http.get<PagedResponse<Apolice>>(this.apolices, { params: params(filtro, pagina) });
  }

  /** Apólices que cobriam o veículo no dia (para acionar no sinistro). */
  apolicesCobrindo(idVeiculo: string, dia?: string | null): Observable<Apolice[]> {
    let p = new HttpParams().set('idVeiculo', idVeiculo);
    if (dia) p = p.set('dia', dia);
    return this.http.get<Apolice[]>(`${this.apolices}/cobrindo`, { params: p });
  }

  /** Seguro de hoje de cada veículo ativo: coberto até quando, quem perde a cobertura e quem está sem. */
  coberturaVeiculos(): Observable<CoberturaVeiculo[]> {
    return this.http.get<CoberturaVeiculo[]>(`${this.apolices}/veiculos`);
  }

  buscarApolice(id: string): Observable<Apolice> {
    return this.http.get<Apolice>(`${this.apolices}/${id}`);
  }

  salvarApolice(request: ApoliceRequest, id?: string): Observable<Apolice> {
    return id ? this.http.put<Apolice>(`${this.apolices}/${id}`, request) : this.http.post<Apolice>(this.apolices, request);
  }

  excluirApolice(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apolices}/${id}`);
  }

  incluirVeiculo(id: string, idVeiculo: string, inicio: string | null, fim: string | null): Observable<Apolice> {
    return this.http.post<Apolice>(`${this.apolices}/${id}/veiculos`, { idVeiculo, inicio, fim });
  }

  encerrarCobertura(id: string, idCobertura: string, fim: string, motivo: MotivoEncerramentoCobertura, observacao: string | null): Observable<Apolice> {
    return this.http.post<Apolice>(`${this.apolices}/${id}/veiculos/${idCobertura}/encerramento`, { fim, motivo, observacao });
  }

  removerCobertura(id: string, idCobertura: string): Observable<Apolice> {
    return this.http.delete<Apolice>(`${this.apolices}/${id}/veiculos/${idCobertura}`);
  }

  gerarParcelas(id: string, quantidade: number, primeiroVencimento: string, valorTotal: number | null): Observable<Apolice> {
    return this.http.post<Apolice>(`${this.apolices}/${id}/parcelas/geracao`, { quantidade, primeiroVencimento, valorTotal });
  }

  salvarParcela(id: string, vencimento: string, valor: number, idParcela?: string): Observable<Apolice> {
    return idParcela
      ? this.http.put<Apolice>(`${this.apolices}/${id}/parcelas/${idParcela}`, { vencimento, valor })
      : this.http.post<Apolice>(`${this.apolices}/${id}/parcelas`, { vencimento, valor });
  }

  removerParcela(id: string, idParcela: string): Observable<Apolice> {
    return this.http.delete<Apolice>(`${this.apolices}/${id}/parcelas/${idParcela}`);
  }

  /** Valores para o formulário de pagamento do financeiro (origem FROTA_SEGURO, id da parcela). */
  preenchimentoFinanceiro(idParcela: string): Observable<PreenchimentoFinanceiro> {
    return this.http.get<PreenchimentoFinanceiro>(`${this.apolices}/parcelas/${idParcela}/preenchimento-financeiro`);
  }

  anexarApolice(id: string, arquivo: File): Observable<Apolice> {
    return this.http.post<Apolice>(`${this.apolices}/${id}/anexos`, formulario(arquivo));
  }

  baixarAnexoApolice(id: string, idAnexo: string): Observable<Blob> {
    return this.http.get(`${this.apolices}/${id}/anexos/${idAnexo}`, { responseType: 'blob' });
  }

  removerAnexoApolice(id: string, idAnexo: string): Observable<Apolice> {
    return this.http.delete<Apolice>(`${this.apolices}/${id}/anexos/${idAnexo}`);
  }

  // ── Sinistros ─────────────────────────────────────────────────────────────
  listarSinistros(filtro: FiltroSinistros, pagina: PaginaFrota): Observable<PagedResponse<Sinistro>> {
    return this.http.get<PagedResponse<Sinistro>>(this.sinistros, { params: params(filtro, pagina) });
  }

  resumoSinistros(filtro: FiltroSinistros): Observable<ResumoSinistros> {
    return this.http.get<ResumoSinistros>(`${this.sinistros}/resumo`, { params: params(filtro, {}) });
  }

  buscarSinistro(id: string): Observable<Sinistro> {
    return this.http.get<Sinistro>(`${this.sinistros}/${id}`);
  }

  salvarSinistro(request: SinistroRequest, id?: string): Observable<Sinistro> {
    return id ? this.http.put<Sinistro>(`${this.sinistros}/${id}`, request) : this.http.post<Sinistro>(this.sinistros, request);
  }

  /** Veículo e origem vêm do sinistro; sem descrição, vai o relato dele. */
  abrirOrdemServico(id: string, request: AbrirReparoSinistroRequest): Observable<Sinistro> {
    return this.http.post<Sinistro>(`${this.sinistros}/${id}/ordem-servico`, request);
  }

  acionarSeguradora(id: string, idApolice: string, numeroSinistroSeguradora: string | null, acionadaEm: string | null): Observable<Sinistro> {
    return this.http.post<Sinistro>(`${this.sinistros}/${id}/seguradora`, { idApolice, numeroSinistroSeguradora, acionadaEm });
  }

  finalizarSinistro(id: string, franquiaPaga: number | null): Observable<Sinistro> {
    return this.http.post<Sinistro>(`${this.sinistros}/${id}/finalizacao`, { franquiaPaga });
  }

  cancelarSinistro(id: string, motivo: string): Observable<Sinistro> {
    return this.http.post<Sinistro>(`${this.sinistros}/${id}/cancelamento`, { motivo });
  }

  anexarSinistro(id: string, arquivo: File): Observable<Sinistro> {
    return this.http.post<Sinistro>(`${this.sinistros}/${id}/anexos`, formulario(arquivo));
  }

  baixarAnexoSinistro(id: string, idAnexo: string): Observable<Blob> {
    return this.http.get(`${this.sinistros}/${id}/anexos/${idAnexo}`, { responseType: 'blob' });
  }

  removerAnexoSinistro(id: string, idAnexo: string): Observable<Sinistro> {
    return this.http.delete<Sinistro>(`${this.sinistros}/${id}/anexos/${idAnexo}`);
  }
}

function formulario(arquivo: File): FormData {
  const corpo = new FormData();
  corpo.append('arquivo', arquivo, arquivo.name);
  return corpo;
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
