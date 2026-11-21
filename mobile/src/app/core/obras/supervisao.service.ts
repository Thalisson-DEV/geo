import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { OutboxService } from '../sync/outbox.service';

export type StatusEquipe = 'SEM_TURNO' | 'ENCERRADO' | 'A_CAMINHO' | 'NA_OBRA' | 'EM_EXECUCAO' | 'PARADA' | 'IMPEDIDA' | 'SEM_OBRA';

export interface StatusEquipeObra {
  idEquipe: string; codigo: string; baseOperacional?: string | null; status: StatusEquipe; rotulo: string; idTurno?: string | null;
  idObraAtual?: string | null; numeroObraAtual?: string | null; programacoesHoje: number; concluidas: number; aprsPendentes: number;
  ocorrenciasImpeditivas: number; ultimaAtividade?: string | null; lider?: string | null;
}

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

  /** Visita prévia: entra na fila e sai com sinal. */
  async registrarVisita(idObra: string, visita: { idModelo: string; dataVisita: string; observacoes: string | null; respostas: unknown[] }): Promise<void> {
    await this.outbox.enqueue({ endpoint: `/v1/obras/${idObra}/documentacao/visitas`, method: 'POST', payload: visita });
  }

  async gerar(idObra: string, tipo: 'as-built' | 'book'): Promise<void> {
    await this.outbox.enqueue({ endpoint: `/v1/obras/${idObra}/documentacao/${tipo}`, method: 'POST', payload: {} });
  }
}
