import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { silentContext } from '../http/http-context';

export type ParecerCopiloto = 'SEM_RESSALVAS' | 'ATENCAO' | 'CRITICO';

export type SituacaoAbastecimento = 'AGUARDANDO_APROVACAO' | 'APROVADA' | 'REPROVADA' | 'LIBERADA' | 'REALIZADA' | 'CANCELADA' | 'VENCIDA';

/** Linha da fila "Para aprovar" e do acompanhamento (placas da carteira de quem consulta). */
export interface PedidoParaAprovar {
  id: string;
  placa: string | null;
  situacao: SituacaoAbastecimento;
  situacaoRotulo: string;
  venceEm: string | null;
  solicitadoEm: string;
  solicitante: string | null;
  condutor: string | null;
  baseNome: string | null;
  posto: string;
  itens: string;
  destino: string | null;
  alertas: string[];
  origem: 'APP' | 'AVULSA';
}

export interface ItemParaAprovar {
  id: string;
  categoria: 'COMBUSTIVEL' | 'ARLA' | 'OLEO' | 'FLUIDO';
  produtoPedido: string;
  unidade: string;
  quantidadePedida: number | null;
  quantidadeAprovada: number | null;
  quantidadeLiberada: number | null;
  /** Entregue no posto (depois do registro). */
  quantidade: number | null;
}

/** Filtro do acompanhamento da carteira. */
export interface FiltroCarteira {
  situacoes: SituacaoAbastecimento[];
  busca: string | null;
  /** Dia inicial (aaaa-mm-dd), no fuso do aparelho. */
  de: string | null;
  page: number;
  size: number;
}

export interface PaginaCarteira {
  content: PedidoParaAprovar[];
  page: { totalElements: number };
}

/** Pedido completo para o gestor decidir no celular, com o que a Bússola apontou. */
export interface PedidoParaDecidir {
  abastecimento: {
    id: string;
    placa: string | null;
    veiculoDescricao: string | null;
    situacao: SituacaoAbastecimento;
    situacaoRotulo: string;
    aprovador: string | null;
    aprovadoEm: string | null;
    motivoReprovacao: string | null;
    liberador: string | null;
    liberadoEm: string | null;
    venceEm: string | null;
    cancelador: string | null;
    canceladoEm: string | null;
    motivoCancelamento: string | null;
    realizadoEm: string | null;
    baseNome: string | null;
    solicitante: string | null;
    condutor: string | null;
    posto: string;
    unidadeMedicao: 'KM' | 'HORAS';
    medicaoSolicitacao: number | null;
    capacidadeTanque: number | null;
    observacao: string | null;
    destino: string | null;
    solicitadoEm: string;
    itens: ItemParaAprovar[];
    fotos: { id: string; tipo: string; tipoRotulo: string; recebida: boolean }[];
    alertas: { tipoRotulo: string; mensagem: string }[];
    podeAprovar: boolean;
  };
  analise: { parecer: ParecerCopiloto; parecerRotulo: string; resumo: string; pontos: { titulo: string; detalhe: string; gravidade: string }[] } | null;
}

/**
 * Aprovação do abastecimento pelo celular: o gestor de campo quase não usa computador nem lê
 * e-mail (gestores, 23/10/2026). Decide sobre o estado do servidor, então precisa de sinal; não
 * vai pela fila offline.
 */
@Injectable({ providedIn: 'root' })
export class AprovacaoAbastecimentoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/v1/frota/app/abastecimento/aprovacoes`;

  fila(): Promise<PedidoParaAprovar[]> {
    return firstValueFrom(this.http.get<PedidoParaAprovar[]>(this.url));
  }

  /** Todos os pedidos das placas da carteira, de qualquer situação, para acompanhar. */
  carteira(f: FiltroCarteira): Promise<PaginaCarteira> {
    let params = new HttpParams().set('page', f.page).set('size', f.size).set('sort', 'solicitadoEm,desc');
    f.situacoes.forEach((s) => (params = params.append('situacao', s)));
    if (f.busca) params = params.set('busca', f.busca);
    if (f.de) params = params.set('de', f.de);
    return firstValueFrom(this.http.get<PaginaCarteira>(`${this.url}/carteira`, { params }));
  }

  detalhar(id: string): Promise<PedidoParaDecidir> {
    return firstValueFrom(this.http.get<PedidoParaDecidir>(`${this.url}/${id}`));
  }

  aprovar(id: string, quantidades: Record<string, number>): Promise<PedidoParaDecidir> {
    return firstValueFrom(this.http.post<PedidoParaDecidir>(`${this.url}/${id}/aprovacao`, { quantidades }));
  }

  reprovar(id: string, justificativa: string): Promise<PedidoParaDecidir> {
    return firstValueFrom(this.http.post<PedidoParaDecidir>(`${this.url}/${id}/reprovacao`, { justificativa }));
  }

  foto(id: string, idFoto: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.url}/${id}/fotos/${idFoto}`, { responseType: 'blob', context: silentContext() }));
  }
}
