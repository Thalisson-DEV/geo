import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AbrirOrdemServicoRequest,
  BaixaOrdemServicoRequest,
  ConcluirOrdemServicoRequest,
  EditarOrdemServicoRequest,
  FiltroOrdensServico,
  FornecedorFrota,
  ItemManutencao,
  ItemManutencaoRequest,
  OrdemServico,
  OrdemServicoDetalhe,
  PainelOrdensServico,
  PreenchimentoFinanceiro,
  PreviaRepeticao,
  AcoplamentoImplemento,
  AcoplarImplementoRequest,
  Condutor,
  CondutorRequest,
  DocumentoFrota,
  DocumentoFrotaRequest,
  FiltroCondutores,
  FiltroDocumentosFrota,
  FiltroImplementos,
  FiltroLeiturasOdometro,
  FiltroVeiculosFrota,
  Implemento,
  ImplementoRequest,
  LeituraOdometro,
  OpcoesFrota,
  ParametrosFrota,
  AgendaFrota,
  AnexoOrdemServico,
  DocumentoFiscalOrdemServico,
  DocumentoFiscalOrdemServicoRequest,
  TipoEventoAgendaFrota,
  PecaOrdemServicoRequest,
  RegistrarLeituraRequest,
  ServicoOrdemServicoRequest,
  TrocaPainelRequest,
  TipoImplemento,
  TipoImplementoRequest,
  TipoVeiculo,
  TipoVeiculoRequest,
  VeiculoFrotaDetalhe,
  VeiculoFrotaRequest,
  VeiculoFrotaResumo,
  VincularCondutorRequest,
  VinculoCondutor
} from '../models/frota.models';
import { PagedResponse } from '../models/shared.models';
import { comSelecao } from '../utils/http-params.util';

/** Paginação aceita pelos endpoints da frota (`sort` no formato `campo,asc|desc`). */
export interface PaginaFrota {
  page?: number;
  size?: number;
  sort?: string[];
}

/** Página grande para listas de opção (selects de veículo/implemento), não para listagens. */
export const PAGINA_OPCOES: PaginaFrota = { size: 500 };

/**
 * Cliente HTTP do módulo de frota. A frota é tela de escritório: leituras e escritas
 * vão direto ao servidor (sem fila offline); o app de campo terá seu próprio fluxo.
 */
@Injectable({ providedIn: 'root' })
export class FrotaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/v1/frota`;
  private opcoesCache$?: Observable<OpcoesFrota>;

  // ── Configuração ──────────────────────────────────────────────────────────
  opcoes(): Observable<OpcoesFrota> {
    this.opcoesCache$ ??= this.http.get<OpcoesFrota>(`${this.url}/opcoes`).pipe(shareReplay(1));
    return this.opcoesCache$;
  }

  parametros(): Observable<ParametrosFrota> {
    return this.http.get<ParametrosFrota>(`${this.url}/parametros`);
  }

  atualizarParametros(request: ParametrosFrota): Observable<ParametrosFrota> {
    return this.http.put<ParametrosFrota>(`${this.url}/parametros`, request);
  }

  tiposVeiculo(apenasAtivos = false): Observable<PagedResponse<TipoVeiculo>> {
    return this.http.get<PagedResponse<TipoVeiculo>>(`${this.url}/tipos-veiculo`, {
      params: this.params({ ativo: apenasAtivos ? true : null }, { ...PAGINA_OPCOES, sort: ['nome'] })
    });
  }

  salvarTipoVeiculo(request: TipoVeiculoRequest, id?: string | null): Observable<TipoVeiculo> {
    return id
      ? this.http.put<TipoVeiculo>(`${this.url}/tipos-veiculo/${id}`, request)
      : this.http.post<TipoVeiculo>(`${this.url}/tipos-veiculo`, request);
  }

  alternarTipoVeiculo(tipo: TipoVeiculo): Observable<void> {
    return tipo.ativo
      ? this.http.delete<void>(`${this.url}/tipos-veiculo/${tipo.id}`)
      : this.http.put<void>(`${this.url}/tipos-veiculo/${tipo.id}/ativar`, {});
  }

  tiposImplemento(apenasAtivos = false): Observable<PagedResponse<TipoImplemento>> {
    return this.http.get<PagedResponse<TipoImplemento>>(`${this.url}/tipos-implemento`, {
      params: this.params({ ativo: apenasAtivos ? true : null }, { ...PAGINA_OPCOES, sort: ['nome'] })
    });
  }

  salvarTipoImplemento(request: TipoImplementoRequest, id?: string | null): Observable<TipoImplemento> {
    return id
      ? this.http.put<TipoImplemento>(`${this.url}/tipos-implemento/${id}`, request)
      : this.http.post<TipoImplemento>(`${this.url}/tipos-implemento`, request);
  }

  alternarTipoImplemento(tipo: TipoImplemento): Observable<void> {
    return tipo.ativo
      ? this.http.delete<void>(`${this.url}/tipos-implemento/${tipo.id}`)
      : this.http.put<void>(`${this.url}/tipos-implemento/${tipo.id}/ativar`, {});
  }

  // ── Veículos ──────────────────────────────────────────────────────────────
  listarVeiculos(filtro: FiltroVeiculosFrota, pagina: PaginaFrota = {}): Observable<PagedResponse<VeiculoFrotaResumo>> {
    return this.http.get<PagedResponse<VeiculoFrotaResumo>>(`${this.url}/veiculos`, {
      params: this.params(filtro, { sort: ['placa'], ...pagina })
    });
  }

  detalharVeiculo(idVeiculo: string): Observable<VeiculoFrotaDetalhe> {
    return this.http.get<VeiculoFrotaDetalhe>(`${this.url}/veiculos/${idVeiculo}`);
  }

  salvarVeiculo(request: VeiculoFrotaRequest, idVeiculo?: string | null): Observable<VeiculoFrotaDetalhe> {
    return idVeiculo
      ? this.http.put<VeiculoFrotaDetalhe>(`${this.url}/veiculos/${idVeiculo}`, request)
      : this.http.post<VeiculoFrotaDetalhe>(`${this.url}/veiculos`, request);
  }

  historicoCondutoresVeiculo(idVeiculo: string): Observable<PagedResponse<VinculoCondutor>> {
    return this.http.get<PagedResponse<VinculoCondutor>>(`${this.url}/veiculos/${idVeiculo}/condutores`, {
      params: this.params({}, { size: 200 })
    });
  }

  vincularCondutor(idVeiculo: string, request: VincularCondutorRequest): Observable<VinculoCondutor> {
    return this.http.post<VinculoCondutor>(`${this.url}/veiculos/${idVeiculo}/condutores`, request);
  }

  encerrarVinculo(idVinculo: string, fim: string): Observable<VinculoCondutor> {
    return this.http.post<VinculoCondutor>(`${this.url}/vinculos-condutor/${idVinculo}/encerramento`, { fim });
  }

  historicoImplementosVeiculo(idVeiculo: string): Observable<AcoplamentoImplemento[]> {
    return this.http.get<AcoplamentoImplemento[]>(`${this.url}/veiculos/${idVeiculo}/implementos`);
  }

  leiturasVeiculo(idVeiculo: string): Observable<PagedResponse<LeituraOdometro>> {
    return this.http.get<PagedResponse<LeituraOdometro>>(`${this.url}/veiculos/${idVeiculo}/odometro`, {
      params: this.params({}, { size: 200 })
    });
  }

  registrarLeitura(idVeiculo: string, request: RegistrarLeituraRequest): Observable<LeituraOdometro> {
    return this.http.post<LeituraOdometro>(`${this.url}/veiculos/${idVeiculo}/odometro`, request);
  }

  trocarPainel(idVeiculo: string, request: TrocaPainelRequest): Observable<LeituraOdometro> {
    return this.http.post<LeituraOdometro>(`${this.url}/veiculos/${idVeiculo}/odometro/troca-painel`, request);
  }

  // ── Odômetro ──────────────────────────────────────────────────────────────
  listarLeituras(filtro: FiltroLeiturasOdometro, pagina: PaginaFrota = {}): Observable<PagedResponse<LeituraOdometro>> {
    return this.http.get<PagedResponse<LeituraOdometro>>(`${this.url}/odometro`, {
      params: this.params(filtro, { sort: ['lidoEm,desc'], ...pagina })
    });
  }

  anularLeitura(id: string, justificativa: string): Observable<LeituraOdometro> {
    return this.http.post<LeituraOdometro>(`${this.url}/odometro/${id}/anulacao`, { justificativa });
  }

  confirmarLeitura(id: string, justificativa: string): Observable<LeituraOdometro> {
    return this.http.post<LeituraOdometro>(`${this.url}/odometro/${id}/confirmacao`, { justificativa });
  }

  // ── Implementos ───────────────────────────────────────────────────────────
  listarImplementos(filtro: FiltroImplementos, pagina: PaginaFrota = {}): Observable<PagedResponse<Implemento>> {
    return this.http.get<PagedResponse<Implemento>>(`${this.url}/implementos`, {
      params: this.params(filtro, { sort: ['identificacao'], ...pagina })
    });
  }

  salvarImplemento(request: ImplementoRequest, id?: string | null): Observable<Implemento> {
    return id
      ? this.http.put<Implemento>(`${this.url}/implementos/${id}`, request)
      : this.http.post<Implemento>(`${this.url}/implementos`, request);
  }

  alternarImplemento(implemento: Implemento): Observable<void> {
    return implemento.ativo
      ? this.http.delete<void>(`${this.url}/implementos/${implemento.id}`)
      : this.http.put<void>(`${this.url}/implementos/${implemento.id}/ativar`, {});
  }

  acoplarImplemento(id: string, request: AcoplarImplementoRequest): Observable<AcoplamentoImplemento> {
    return this.http.post<AcoplamentoImplemento>(`${this.url}/implementos/${id}/acoplamentos`, request);
  }

  desacoplarImplemento(id: string, fim: string): Observable<AcoplamentoImplemento> {
    return this.http.post<AcoplamentoImplemento>(`${this.url}/implementos/${id}/desacoplamento`, { fim });
  }

  historicoImplemento(id: string): Observable<AcoplamentoImplemento[]> {
    return this.http.get<AcoplamentoImplemento[]>(`${this.url}/implementos/${id}/acoplamentos`);
  }

  // ── Condutores ────────────────────────────────────────────────────────────
  listarCondutores(filtro: FiltroCondutores, pagina: PaginaFrota = {}): Observable<PagedResponse<Condutor>> {
    return this.http.get<PagedResponse<Condutor>>(`${this.url}/condutores`, {
      params: this.params(filtro, { sort: ['cnhValidade'], ...pagina })
    });
  }

  buscarCondutor(idColaborador: string): Observable<Condutor> {
    return this.http.get<Condutor>(`${this.url}/condutores/${idColaborador}`);
  }

  registrarCnh(idColaborador: string, request: CondutorRequest): Observable<Condutor> {
    return this.http.put<Condutor>(`${this.url}/condutores/${idColaborador}`, request);
  }

  desativarCondutor(idColaborador: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/condutores/${idColaborador}`);
  }

  historicoVeiculosCondutor(idColaborador: string): Observable<PagedResponse<VinculoCondutor>> {
    return this.http.get<PagedResponse<VinculoCondutor>>(`${this.url}/condutores/${idColaborador}/veiculos`, {
      params: this.params({}, { size: 200 })
    });
  }

  // ── Documentos ────────────────────────────────────────────────────────────
  listarDocumentos(filtro: FiltroDocumentosFrota, pagina: PaginaFrota = {}): Observable<PagedResponse<DocumentoFrota>> {
    return this.http.get<PagedResponse<DocumentoFrota>>(`${this.url}/documentos`, {
      params: this.params(filtro, { sort: ['dataVencimento'], ...pagina })
    });
  }

  criarDocumento(request: DocumentoFrotaRequest, arquivo?: File | null): Observable<DocumentoFrota> {
    const corpo = new FormData();
    corpo.append('dados', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    if (arquivo) corpo.append('arquivo', arquivo, arquivo.name);
    return this.http.post<DocumentoFrota>(`${this.url}/documentos`, corpo);
  }

  atualizarDocumento(id: string, request: DocumentoFrotaRequest): Observable<DocumentoFrota> {
    return this.http.put<DocumentoFrota>(`${this.url}/documentos/${id}`, request);
  }

  anexarArquivoDocumento(id: string, arquivo: File): Observable<DocumentoFrota> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    return this.http.post<DocumentoFrota>(`${this.url}/documentos/${id}/arquivo`, corpo);
  }

  baixarArquivoDocumento(id: string): Observable<Blob> {
    return this.http.get(`${this.url}/documentos/${id}/arquivo`, { responseType: 'blob' });
  }

  excluirDocumento(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/documentos/${id}`);
  }

  // ── Itens de manutenção ───────────────────────────────────────────────────
  itensManutencao(apenasAtivos = false): Observable<PagedResponse<ItemManutencao>> {
    return this.http.get<PagedResponse<ItemManutencao>>(`${this.url}/itens-manutencao`, {
      params: this.params({ ativo: apenasAtivos ? true : null }, { ...PAGINA_OPCOES, sort: ['nome'] })
    });
  }

  salvarItemManutencao(request: ItemManutencaoRequest, id?: string | null): Observable<ItemManutencao> {
    return id
      ? this.http.put<ItemManutencao>(`${this.url}/itens-manutencao/${id}`, request)
      : this.http.post<ItemManutencao>(`${this.url}/itens-manutencao`, request);
  }

  alternarItemManutencao(item: ItemManutencao): Observable<void> {
    return item.ativo
      ? this.http.delete<void>(`${this.url}/itens-manutencao/${item.id}`)
      : this.http.put<void>(`${this.url}/itens-manutencao/${item.id}/ativar`, {});
  }

  // ── Ordens de serviço ─────────────────────────────────────────────────────
  listarOrdensServico(filtro: FiltroOrdensServico, pagina: PaginaFrota = {}): Observable<PagedResponse<OrdemServico>> {
    return this.http.get<PagedResponse<OrdemServico>>(`${this.url}/ordens-servico`, {
      params: this.params(filtro, pagina)
    });
  }

  painelOrdensServico(idsBase: string[] = []): Observable<PainelOrdensServico> {
    return this.http.get<PainelOrdensServico>(`${this.url}/ordens-servico/painel`, {
      params: this.params({ idsBase }, {})
    });
  }

  /** Calendário: OS agendadas, previsões de término e vencimentos no período (até 62 dias). */
  agenda(de: string, ate: string, idsBase: string[] = [], tipos: TipoEventoAgendaFrota[] = []): Observable<AgendaFrota> {
    return this.http.get<AgendaFrota>(`${this.url}/agenda`, { params: this.params({ de, ate, idsBase, tipos }, {}) });
  }

  detalharOrdemServico(id: string): Observable<OrdemServicoDetalhe> {
    return this.http.get<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}`);
  }

  abrirOrdemServico(request: AbrirOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico`, request);
  }

  editarOrdemServico(id: string, request: EditarOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.put<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}`, request);
  }

  agendarOrdemServico(id: string, agendadaPara: string, local: string | null): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/agendamento`, { agendadaPara, local });
  }

  iniciarOrdemServico(id: string, inicioReal: string, previsaoTermino: string | null): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/inicio`, { inicioReal, previsaoTermino });
  }

  alterarPrevisaoOrdemServico(id: string, previsaoTermino: string): Observable<OrdemServicoDetalhe> {
    return this.http.put<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/previsao`, { previsaoTermino });
  }

  lancarServicoOs(id: string, request: ServicoOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/servicos`, request);
  }

  alterarServicoOs(id: string, idServico: string, request: ServicoOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.put<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/servicos/${idServico}`, request);
  }

  excluirServicoOs(id: string, idServico: string): Observable<OrdemServicoDetalhe> {
    return this.http.delete<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/servicos/${idServico}`);
  }

  definirMecanicoOs(id: string, idMecanico: string | null, mecanicoNome: string | null): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/servicos/mecanico`, { idMecanico, mecanicoNome });
  }

  lancarPecaOs(id: string, request: PecaOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/pecas`, request);
  }

  alterarPecaOs(id: string, idPeca: string, request: PecaOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.put<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/pecas/${idPeca}`, request);
  }

  excluirPecaOs(id: string, idPeca: string): Observable<OrdemServicoDetalhe> {
    return this.http.delete<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/pecas/${idPeca}`);
  }

  definirAjustesOs(id: string, desconto: number | null, acrescimo: number | null): Observable<OrdemServicoDetalhe> {
    return this.http.put<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/ajustes`, { desconto, acrescimo });
  }

  documentosFiscaisOs(id: string): Observable<DocumentoFiscalOrdemServico[]> {
    return this.http.get<DocumentoFiscalOrdemServico[]>(`${this.url}/ordens-servico/${id}/documentos-fiscais`);
  }

  criarDocumentoFiscalOs(id: string, request: DocumentoFiscalOrdemServicoRequest, arquivo?: File | null): Observable<DocumentoFiscalOrdemServico> {
    const corpo = new FormData();
    corpo.append('dados', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    if (arquivo) corpo.append('arquivo', arquivo, arquivo.name);
    return this.http.post<DocumentoFiscalOrdemServico>(`${this.url}/ordens-servico/${id}/documentos-fiscais`, corpo);
  }

  anexarArquivoDocumentoFiscalOs(id: string, idDocumento: string, arquivo: File): Observable<DocumentoFiscalOrdemServico> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    return this.http.post<DocumentoFiscalOrdemServico>(`${this.url}/ordens-servico/${id}/documentos-fiscais/${idDocumento}/arquivo`, corpo);
  }

  baixarArquivoDocumentoFiscalOs(id: string, idDocumento: string): Observable<Blob> {
    return this.http.get(`${this.url}/ordens-servico/${id}/documentos-fiscais/${idDocumento}/arquivo`, { responseType: 'blob' });
  }

  anexosOs(id: string): Observable<AnexoOrdemServico[]> {
    return this.http.get<AnexoOrdemServico[]>(`${this.url}/ordens-servico/${id}/anexos`);
  }

  anexarOs(id: string, arquivo: File, descricao?: string | null): Observable<AnexoOrdemServico[]> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    if (descricao?.trim()) corpo.append('descricao', descricao.trim());
    return this.http.post<AnexoOrdemServico[]>(`${this.url}/ordens-servico/${id}/anexos`, corpo);
  }

  baixarAnexoOs(id: string, idAnexo: string): Observable<Blob> {
    return this.http.get(`${this.url}/ordens-servico/${id}/anexos/${idAnexo}`, { responseType: 'blob' });
  }

  removerAnexoOs(id: string, idAnexo: string): Observable<AnexoOrdemServico[]> {
    return this.http.delete<AnexoOrdemServico[]>(`${this.url}/ordens-servico/${id}/anexos/${idAnexo}`);
  }

  excluirDocumentoFiscalOs(id: string, idDocumento: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/ordens-servico/${id}/documentos-fiscais/${idDocumento}`);
  }

  concluirOrdemServico(id: string, request: ConcluirOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/conclusao`, request);
  }

  /** Completa a OS concluída com valores pendentes; sem mais nada faltando, ela fica finalizada. */
  completarConclusaoOrdemServico(id: string, request: BaixaOrdemServicoRequest): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/baixa`, request);
  }

  /** A OS concluída volta para em andamento (ex.: deu problema no teste). */
  reabrirOrdemServico(id: string, justificativa: string): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/reabertura`, { justificativa });
  }

  cancelarOrdemServico(id: string, justificativa: string): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/cancelamento`, { justificativa });
  }

  alterarParadaOrdemServico(id: string, parado: boolean, instante: string | null = null): Observable<OrdemServicoDetalhe> {
    return this.http.post<OrdemServicoDetalhe>(`${this.url}/ordens-servico/${id}/parada`, { parado, instante });
  }

  preenchimentoFinanceiro(id: string): Observable<PreenchimentoFinanceiro> {
    return this.http.get<PreenchimentoFinanceiro>(`${this.url}/ordens-servico/${id}/preenchimento-financeiro`);
  }

  previaRepeticoes(idVeiculo: string, idsItem: string[]): Observable<PreviaRepeticao[]> {
    return this.http.get<PreviaRepeticao[]>(`${this.url}/ordens-servico/repeticoes`, {
      params: this.params({ idVeiculo, idsItem }, {})
    });
  }

  fornecedoresOficina(): Observable<FornecedorFrota[]> {
    return this.http.get<FornecedorFrota[]>(`${this.url}/ordens-servico/fornecedores`);
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
