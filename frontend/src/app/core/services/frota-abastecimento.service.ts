import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AbastecimentoAvulsoRequest,
  AbastecimentoDetalhe,
  AbastecimentoFiltro,
  AbastecimentoResumo,
  CarteiraAprovacao,
  ConferenciaFatura,
  FaturaPosto,
  FaturaPostoRequest,
  LiberarAbastecimentoRequest,
  PostoAbastecimento,
  PostoAbastecimentoRequest,
  PrecoPosto,
  PrecoPostoRequest,
  ProdutoAbastecimento,
  ProdutoAbastecimentoRequest,
  SituacaoFaturaPosto,
  SugestaoPrecoPosto
} from '../models/frota-abastecimento.models';
import { PreenchimentoFinanceiro } from '../models/frota.models';
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';
import { PaginaFrota } from './frota.service';

/** Abastecimento na web: postos, produtos, carteiras de aprovação, filas, detalhe e faturas do posto. */
@Injectable({ providedIn: 'root' })
export class FrotaAbastecimentoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota`;

  // ── Cadastros ────────────────────────────────────────────────────────────
  postos(apenasAtivos = false): Observable<PagedResponse<PostoAbastecimento>> {
    return this.http.get<PagedResponse<PostoAbastecimento>>(`${this.url}/abastecimento/postos`, {
      params: this.params({ ativo: apenasAtivos ? true : null }, { size: 500, sort: ['nome'] })
    });
  }

  salvarPosto(request: PostoAbastecimentoRequest, id?: string): Observable<PostoAbastecimento> {
    return id
      ? this.http.put<PostoAbastecimento>(`${this.url}/abastecimento/postos/${id}`, request)
      : this.http.post<PostoAbastecimento>(`${this.url}/abastecimento/postos`, request);
  }

  alternarPosto(posto: PostoAbastecimento): Observable<void> {
    return posto.ativo
      ? this.http.delete<void>(`${this.url}/abastecimento/postos/${posto.id}`)
      : this.http.put<void>(`${this.url}/abastecimento/postos/${posto.id}/ativar`, null);
  }

  produtos(): Observable<PagedResponse<ProdutoAbastecimento>> {
    return this.http.get<PagedResponse<ProdutoAbastecimento>>(`${this.url}/abastecimento/produtos`, {
      params: this.params({}, { size: 500, sort: ['categoria', 'nome'] })
    });
  }

  salvarProduto(request: ProdutoAbastecimentoRequest, id?: string): Observable<ProdutoAbastecimento> {
    return id
      ? this.http.put<ProdutoAbastecimento>(`${this.url}/abastecimento/produtos/${id}`, request)
      : this.http.post<ProdutoAbastecimento>(`${this.url}/abastecimento/produtos`, request);
  }

  alternarProduto(produto: ProdutoAbastecimento): Observable<void> {
    return produto.ativo
      ? this.http.delete<void>(`${this.url}/abastecimento/produtos/${produto.id}`)
      : this.http.put<void>(`${this.url}/abastecimento/produtos/${produto.id}/ativar`, null);
  }

  carteiras(): Observable<CarteiraAprovacao[]> {
    return this.http.get<CarteiraAprovacao[]>(`${this.url}/abastecimento/carteiras`);
  }

  definirPlacas(idUsuario: string, idsVeiculo: string[]): Observable<CarteiraAprovacao> {
    return this.http.put<CarteiraAprovacao>(`${this.url}/abastecimento/carteiras/${idUsuario}`, { idsVeiculo });
  }

  incluirBase(idUsuario: string, idBaseOperacional: string): Observable<CarteiraAprovacao> {
    return this.http.post<CarteiraAprovacao>(`${this.url}/abastecimento/carteiras/${idUsuario}/bases`, { idBaseOperacional });
  }

  // ── Abastecimentos ───────────────────────────────────────────────────────
  listar(filtro: AbastecimentoFiltro, pagina: PaginaFrota): Observable<PagedResponse<AbastecimentoResumo>> {
    return this.http.get<PagedResponse<AbastecimentoResumo>>(`${this.url}/abastecimentos`, { params: this.params(filtro, pagina) });
  }

  detalhar(id: string): Observable<AbastecimentoDetalhe> {
    return this.http.get<AbastecimentoDetalhe>(`${this.url}/abastecimentos/${id}`);
  }

  /** O aprovador define a quantidade de cada item (id do item → quantidade); zero tira o item. */
  aprovar(id: string, quantidades: Record<string, number>): Observable<AbastecimentoDetalhe> {
    return this.http.post<AbastecimentoDetalhe>(`${this.url}/abastecimentos/${id}/aprovacao`, { quantidades });
  }

  lancarAvulso(request: AbastecimentoAvulsoRequest): Observable<AbastecimentoDetalhe> {
    return this.http.post<AbastecimentoDetalhe>(`${this.url}/abastecimentos/avulsos`, request);
  }

  // ── Preços do posto ──────────────────────────────────────────────────────
  precos(idPosto: string): Observable<PrecoPosto[]> {
    return this.http.get<PrecoPosto[]>(`${this.url}/abastecimento/postos/${idPosto}/precos`);
  }

  registrarPreco(idPosto: string, request: PrecoPostoRequest): Observable<PrecoPosto> {
    return this.http.post<PrecoPosto>(`${this.url}/abastecimento/postos/${idPosto}/precos`, request);
  }

  sugestoesPreco(): Observable<SugestaoPrecoPosto[]> {
    return this.http.get<SugestaoPrecoPosto[]>(`${this.url}/abastecimento/sugestoes-preco`);
  }

  confirmarSugestaoPreco(id: string): Observable<SugestaoPrecoPosto> {
    return this.http.post<SugestaoPrecoPosto>(`${this.url}/abastecimento/sugestoes-preco/${id}/confirmacao`, null);
  }

  descartarSugestaoPreco(id: string): Observable<SugestaoPrecoPosto> {
    return this.http.post<SugestaoPrecoPosto>(`${this.url}/abastecimento/sugestoes-preco/${id}/descarte`, null);
  }

  reprovar(id: string, justificativa: string): Observable<AbastecimentoDetalhe> {
    return this.http.post<AbastecimentoDetalhe>(`${this.url}/abastecimentos/${id}/reprovacao`, { justificativa });
  }

  liberar(id: string, request: LiberarAbastecimentoRequest): Observable<AbastecimentoDetalhe> {
    return this.http.post<AbastecimentoDetalhe>(`${this.url}/abastecimentos/${id}/liberacao`, request);
  }

  cancelar(id: string, motivo: string | null): Observable<AbastecimentoDetalhe> {
    return this.http.post<AbastecimentoDetalhe>(`${this.url}/abastecimentos/${id}/cancelamento`, { motivo });
  }

  marcarAvisoAberto(id: string, idAviso: string): Observable<AbastecimentoDetalhe> {
    return this.http.post<AbastecimentoDetalhe>(`${this.url}/abastecimentos/${id}/avisos/${idAviso}/aberto`, null);
  }

  foto(id: string, idFoto: string): Observable<Blob> {
    return this.http.get(`${this.url}/abastecimentos/${id}/fotos/${idFoto}`, { responseType: 'blob' });
  }

  // ── Faturas do posto ─────────────────────────────────────────────────────
  faturas(idPosto: string | null, situacao: SituacaoFaturaPosto | null, pagina: PaginaFrota): Observable<PagedResponse<FaturaPosto>> {
    return this.http.get<PagedResponse<FaturaPosto>>(`${this.url}/abastecimento/faturas`, {
      params: this.params({ idPosto, situacao }, pagina)
    });
  }

  salvarFatura(request: FaturaPostoRequest, id?: string): Observable<FaturaPosto> {
    return id
      ? this.http.put<FaturaPosto>(`${this.url}/abastecimento/faturas/${id}`, request)
      : this.http.post<FaturaPosto>(`${this.url}/abastecimento/faturas`, request);
  }

  conferencia(id: string): Observable<ConferenciaFatura> {
    return this.http.get<ConferenciaFatura>(`${this.url}/abastecimento/faturas/${id}/conferencia`);
  }

  conferir(id: string, idsAbastecimento: string[]): Observable<FaturaPosto> {
    return this.http.post<FaturaPosto>(`${this.url}/abastecimento/faturas/${id}/conferencia`, { idsAbastecimento });
  }

  preenchimentoFinanceiro(id: string): Observable<PreenchimentoFinanceiro> {
    return this.http.get<PreenchimentoFinanceiro>(`${this.url}/abastecimento/faturas/${id}/preenchimento-financeiro`);
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
