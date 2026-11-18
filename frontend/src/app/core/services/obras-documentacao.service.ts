import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CarteiraBook, ComparativoBook, PainelBook } from '../models/obras-book.models';
import {
  DocumentacaoObra,
  DocumentoAsBuilt,
  EtapaEvidencia,
  EquipamentoRequest,
  ModeloChecklistFilter,
  ModeloChecklistRequest,
  ModeloChecklistResponse,
  RespostaInformada,
  EvidenciaVisita,
  VisitaPrevia,
  VisitaPreviaRequest
} from '../models/obras-documentacao.models';
import { PagedResponse } from '../models/shared.models';
import { BaseService } from './base.service';

/** Modelos de checklist e documentação técnica da obra: visita prévia, fichas As Built, fotos do book e equipamentos. */
@Injectable({ providedIn: 'root' })
export class ObrasDocumentacaoService extends BaseService {
  private readonly obrasUrl = `${environment.apiUrl}/v1/obras`;
  private readonly modelosUrl = `${this.obrasUrl}/checklists`;

  listarModelos(filter: ModeloChecklistFilter = {}): Observable<PagedResponse<ModeloChecklistResponse>> {
    return this.getList<ModeloChecklistResponse>(this.modelosUrl, filter);
  }

  buscarModelo(id: string): Observable<ModeloChecklistResponse> {
    return this.http.get<ModeloChecklistResponse>(`${this.modelosUrl}/${id}`);
  }

  criarModelo(request: ModeloChecklistRequest): Observable<ModeloChecklistResponse> {
    return this.http.post<ModeloChecklistResponse>(this.modelosUrl, request);
  }

  atualizarModelo(id: string, request: ModeloChecklistRequest): Observable<ModeloChecklistResponse> {
    return this.http.put<ModeloChecklistResponse>(`${this.modelosUrl}/${id}`, request);
  }

  duplicarModelo(id: string): Observable<ModeloChecklistResponse> {
    return this.http.post<ModeloChecklistResponse>(`${this.modelosUrl}/${id}/duplicacao`, {});
  }

  desativarModelo(id: string): Observable<void> {
    return this.http.delete<void>(`${this.modelosUrl}/${id}`);
  }

  ativarModelo(id: string): Observable<void> {
    return this.http.put<void>(`${this.modelosUrl}/${id}/ativar`, {});
  }

  consultar(idObra: string): Observable<DocumentacaoObra> {
    return this.http.get<DocumentacaoObra>(this.url(idObra));
  }

  salvarVisita(idObra: string, idVisita: string | null, request: VisitaPreviaRequest): Observable<VisitaPrevia> {
    return idVisita
      ? this.http.put<VisitaPrevia>(`${this.url(idObra)}/visitas/${idVisita}`, request)
      : this.http.post<VisitaPrevia>(`${this.url(idObra)}/visitas`, request);
  }

  removerVisita(idObra: string, idVisita: string): Observable<void> {
    return this.http.delete<void>(`${this.url(idObra)}/visitas/${idVisita}`);
  }

  baixarPdfDaVisita(idObra: string, idVisita: string): Observable<Blob> {
    return this.http.get(`${this.url(idObra)}/visitas/${idVisita}/pdf`, { responseType: 'blob' });
  }

  /** Foto (JPG/PNG) ou PDF da visita; sem pergunta, é evidência geral. */
  enviarEvidenciaDaVisita(idObra: string, idVisita: string, arquivo: File, idPergunta: string | null, legenda: string | null = null): Observable<EvidenciaVisita> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    if (idPergunta) corpo.append('idPergunta', idPergunta);
    if (legenda) corpo.append('legenda', legenda);
    return this.http.post<EvidenciaVisita>(`${this.url(idObra)}/visitas/${idVisita}/evidencias`, corpo);
  }

  alterarLegendaDaEvidenciaDaVisita(idObra: string, idVisita: string, idEvidencia: string, legenda: string | null): Observable<void> {
    return this.http.put<void>(`${this.url(idObra)}/visitas/${idVisita}/evidencias/${idEvidencia}/legenda`, { legenda });
  }

  removerEvidenciaDaVisita(idObra: string, idVisita: string, idEvidencia: string): Observable<void> {
    return this.http.delete<void>(`${this.url(idObra)}/visitas/${idVisita}/evidencias/${idEvidencia}`);
  }

  miniaturaDaEvidenciaDaVisita(idObra: string, idVisita: string, idEvidencia: string): Observable<Blob> {
    return this.http.get(`${this.url(idObra)}/visitas/${idVisita}/evidencias/${idEvidencia}/miniatura`, { responseType: 'blob' });
  }

  arquivoDaEvidenciaDaVisita(idObra: string, idVisita: string, idEvidencia: string): Observable<Blob> {
    return this.http.get(`${this.url(idObra)}/visitas/${idVisita}/evidencias/${idEvidencia}/arquivo`, { responseType: 'blob' });
  }

  preencherFicha(idObra: string, idPonto: string, idModelo: string, respostas: RespostaInformada[]): Observable<void> {
    return this.http.put<void>(`${this.url(idObra)}/fichas/${idPonto}`, { idModelo, respostas });
  }

  enviarEvidencia(idObra: string, idPonto: string, arquivo: File, item: { idModelo: string; idItem: string } | null): Observable<string> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    if (item) {
      corpo.append('idModelo', item.idModelo);
      corpo.append('idItem', item.idItem);
    }
    return this.http.post<string>(`${this.url(idObra)}/pontos/${idPonto}/evidencias`, corpo);
  }

  alterarLegenda(idObra: string, idEvidencia: string, legenda: string | null): Observable<void> {
    return this.http.put<void>(`${this.url(idObra)}/evidencias/${idEvidencia}/legenda`, { legenda });
  }

  removerEvidencia(idObra: string, idEvidencia: string): Observable<void> {
    return this.http.delete<void>(`${this.url(idObra)}/evidencias/${idEvidencia}`);
  }

  baixarMiniatura(idObra: string, idEvidencia: string): Observable<Blob> {
    return this.http.get(`${this.url(idObra)}/evidencias/${idEvidencia}/miniatura`, { responseType: 'blob' });
  }

  baixarFoto(idObra: string, idEvidencia: string): Observable<Blob> {
    return this.http.get(`${this.url(idObra)}/evidencias/${idEvidencia}/arquivo`, { responseType: 'blob' });
  }

  gerarAsBuilt(idObra: string): Observable<DocumentoAsBuilt> {
    return this.http.post<DocumentoAsBuilt>(`${this.url(idObra)}/as-built`, {});
  }

  /** Book fotográfico: capa, sumário e as fotos de cada ponto por etapa. Não exige ficha completa nem projeto mestre. */
  gerarBook(idObra: string): Observable<DocumentoAsBuilt> {
    return this.http.post<DocumentoAsBuilt>(`${this.url(idObra)}/book`, {});
  }

  classificarEtapa(idObra: string, idEvidencia: string, etapa: EtapaEvidencia | null): Observable<void> {
    return this.http.put<void>(`${this.url(idObra)}/evidencias/${idEvidencia}/etapa`, { etapa });
  }

  /** Completude do book, semáforo, pendências, auditoria de entrega e versões. */
  painel(idObra: string): Observable<PainelBook> {
    return this.http.get<PainelBook>(`${this.url(idObra)}/painel`);
  }

  /** Previsto x realizado por ponto e vão, com as divergências da documentação. */
  comparativo(idObra: string): Observable<ComparativoBook> {
    return this.http.get<ComparativoBook>(`${this.url(idObra)}/comparativo`);
  }

  /** Situação documental de todas as obras ativas. */
  carteira(): Observable<CarteiraBook> {
    return this.http.get<CarteiraBook>(`${this.obrasUrl}/book/consolidado`);
  }

  definirEquipamento(idObra: string, idPonto: string, request: EquipamentoRequest): Observable<void> {
    return this.http.put<void>(`${this.url(idObra)}/equipamentos/${idPonto}`, request);
  }

  removerEquipamento(idObra: string, idPonto: string): Observable<void> {
    return this.http.delete<void>(`${this.url(idObra)}/equipamentos/${idPonto}`);
  }

  private url(idObra: string): string {
    return `${this.obrasUrl}/${idObra}/documentacao`;
  }
}
