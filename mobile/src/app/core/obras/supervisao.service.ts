import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { OutboxService } from '../sync/outbox.service';
import { OutboxItem } from '../db/models';
import { silentContext } from '../http/http-context';

export type StatusEquipe = 'SEM_TURNO' | 'ENCERRADO' | 'A_CAMINHO' | 'NA_OBRA' | 'EM_EXECUCAO' | 'PARADA' | 'IMPEDIDA' | 'SEM_OBRA';

export interface StatusEquipeObra {
  idEquipe: string; codigo: string; baseOperacional?: string | null; status: StatusEquipe; rotulo: string; idTurno?: string | null;
  idObraAtual?: string | null; numeroObraAtual?: string | null; programacoesHoje: number; concluidas: number; aprsPendentes: number;
  ocorrenciasImpeditivas: number; ultimaAtividade?: string | null; lider?: string | null;
}

/** Envio composto da visita prévia: a visita e depois as fotos, cada uma com a sua chave de idempotência. */
export const VISITA_ENDPOINT = '/_obras/visita';

/** Foto da visita guardada na fila em bytes (o WebKit não guarda Blob no IndexedDB). Sem pergunta, é foto geral. */
export interface FotoVisitaFila {
  id: string; idPergunta: string | null; legenda: string | null; nome: string; tipo: string; bytes: ArrayBuffer; enviada: boolean;
}

export interface CorpoVisita {
  idModelo: string; dataVisita: string; idColaborador: string | null; observacoes: string | null; respostas: unknown[];
}

interface PayloadVisita { idObra: string; visita: CorpoVisita; idVisita: string | null; fotos: FotoVisitaFila[] }

export interface ObraResumo { id: string; numero: string; titulo?: string | null; municipioNome?: string | null }

export interface PerguntaChecklist {
  id: string; enunciado: string; tipo: 'ESCOLHA_UNICA' | 'MULTIPLA_ESCOLHA' | 'TEXTO' | 'NUMERO' | 'DATA'; obrigatoria: boolean;
  aceitaNaoSeAplica: boolean; opcoes: string[]; opcaoConforme?: string | null;
}
export interface ModeloChecklist { id: string; titulo: string; finalidade: 'VISITA_PREVIA' | 'AS_BUILT'; estrutura: { grupos: { titulo: string; perguntas: PerguntaChecklist[] }[] } }
export interface DocumentacaoObra {
  visitaRealizada: boolean;
  visitas: { id: string; tituloModelo: string; dataVisita: string; responsavel?: string | null; naoConformidades: number }[];
  asBuilt: { pontosExecutados: number; fichasCompletas: number; pontosPendentes: string[]; pontosSemEvidencia: string[] };
  documentos: { id: string; tipo: string; numeroVersao: number; status: string }[];
}

const CHAVE_STATUS = 'supervisao_status';

/**
 * Supervisor de Obras no app: status das equipes (com a última leitura guardada para abrir sem sinal), documentação da
 * obra e lançamentos de visita prévia/As Built/book. Os lançamentos vão pela fila (saem quando houver sinal).
 */
@Injectable({ providedIn: 'root' })
export class SupervisaoService {
  private readonly http = inject(HttpClient);
  private readonly outbox = inject(OutboxService);
  private readonly injector = inject(Injector);
  private readonly baseUrl = environment.apiBaseUrl;

  readonly equipes = signal<StatusEquipeObra[]>([]);
  readonly atualizadoEm = signal<string | null>(null);
  readonly erro = signal<string | null>(null);

  async carregarEquipes(): Promise<void> {
    const salvo = await db.config.get(CHAVE_STATUS);
    if (salvo?.value) {
      this.equipes.set(salvo.value.equipes);
      this.atualizadoEm.set(salvo.value.em);
    }
    try {
      const lista = await firstValueFrom(this.http.get<StatusEquipeObra[]>(`${this.baseUrl}/v1/obras/campo/status-equipes`, { headers: { 'X-Silent-Error': 'true' } }));
      const em = new Date().toISOString();
      this.equipes.set(lista);
      this.atualizadoEm.set(em);
      this.erro.set(null);
      await db.config.put({ key: CHAVE_STATUS, value: { equipes: lista, em } });
    } catch {
      this.erro.set('Sem conexão: mostrando a última leitura.');
    }
  }

  async buscarObras(numero: string): Promise<ObraResumo[]> {
    const r = await firstValueFrom(this.http.get<{ content: ObraResumo[] }>(`${this.baseUrl}/v1/obras`, { params: { numero, size: 20 }, headers: { 'X-Silent-Error': 'true' } }));
    return r.content ?? [];
  }

  documentacao(idObra: string): Promise<DocumentacaoObra> {
    return firstValueFrom(this.http.get<DocumentacaoObra>(`${this.baseUrl}/v1/obras/${idObra}/documentacao`, { headers: { 'X-Silent-Error': 'true' } }));
  }

  async modelos(finalidade: 'VISITA_PREVIA' | 'AS_BUILT'): Promise<ModeloChecklist[]> {
    const r = await firstValueFrom(this.http.get<{ content: ModeloChecklist[] }>(`${this.baseUrl}/v1/obras/checklists`, { params: { finalidade, size: 50 }, headers: { 'X-Silent-Error': 'true' } }));
    return r.content ?? [];
  }

  /** Visita prévia com as fotos: entra na fila e sai com sinal, primeiro a visita e depois cada foto. */
  async registrarVisita(idObra: string, visita: CorpoVisita, fotos: FotoVisitaFila[] = []): Promise<void> {
    const payload: PayloadVisita = { idObra, visita, idVisita: null, fotos };
    await this.outbox.enqueue({
      endpoint: VISITA_ENDPOINT, method: 'POST', payload, operationType: 'OBRA_VISITA_PREVIA',
      // A cópia para suporte não leva os bytes das fotos: eles já estão no payload.
      originalPayload: { idObra, visita, fotos: fotos.map(({ bytes: _b, ...f }) => f) },
    });
    this.enviarLogo();
  }

  /**
   * Envia a visita e as fotos. Cada passo usa a sua chave de idempotência e o progresso fica no item da fila: se o sinal
   * cair no meio, o reenvio não duplica a visita nem as fotos que já foram.
   */
  async processarVisita(item: OutboxItem): Promise<void> {
    const p = item.payload as PayloadVisita;
    const url = `${this.baseUrl}/v1/obras/${p.idObra}/documentacao/visitas`;
    if (!p.idVisita) {
      const criada = await firstValueFrom(this.http.post<{ id: string }>(url, p.visita,
        { context: silentContext(), headers: { 'Idempotency-Key': `${item.id}:visita` } }));
      p.idVisita = criada.id;
      await db.outbox.update(item.id, { payload: p });
    }
    for (const foto of p.fotos) {
      if (foto.enviada) continue;
      const corpo = new FormData();
      corpo.append('arquivo', new Blob([foto.bytes], { type: foto.tipo }), foto.nome);
      if (foto.idPergunta) corpo.append('idPergunta', foto.idPergunta);
      if (foto.legenda) corpo.append('legenda', foto.legenda);
      await firstValueFrom(this.http.post(`${url}/${p.idVisita}/evidencias`, corpo,
        { context: silentContext(), headers: { 'Idempotency-Key': `${item.id}:foto:${foto.id}` } }));
      foto.enviada = true;
      // A foto já está no servidor: os bytes saem do aparelho.
      foto.bytes = new ArrayBuffer(0);
      await db.outbox.update(item.id, { payload: p });
    }
    await this.outbox.updateStatus(item.id, 'SINCRONIZADO');
    await this.outbox.discard(item.id);
  }

  async gerar(idObra: string, tipo: 'as-built' | 'book'): Promise<void> {
    await this.outbox.enqueue({ endpoint: `/v1/obras/${idObra}/documentacao/${tipo}`, method: 'POST', payload: {} });
    this.enviarLogo();
  }

  /** Com sinal, a fila sai na hora (sem esperar a próxima sincronização). */
  private enviarLogo(): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    setTimeout(() => {
      void import('../sync/sync.service').then(({ SyncService }) => this.injector.get(SyncService).syncOutbox().catch(() => undefined));
    }, 300);
  }
}
