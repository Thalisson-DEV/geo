import { idAtual } from './ids-trocados';
import { OBRAS_ENDPOINT, RegistrosObrasService } from '../obras/registros-obras.service';
import { PacoteObrasService } from '../obras/pacote-obras.service';
import { registrarIdTrocado } from './ids-trocados';
import { Injectable, InjectionToken, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from '../auth/token.service';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db/db.service';
import { OutboxService } from './outbox.service';
import { TurnoService } from '../turno/turno.service';
import { silentContext } from '../http/http-context';
import { CHECKLIST_LANCAR_ENDPOINT, ChecklistVeiculoService } from '../frota/checklist-veiculo.service';
import { DocumentosVeiculoService } from '../frota/documentos-veiculo.service';
import { ABASTECIMENTO_ENDPOINT, AbastecimentoService } from '../frota/abastecimento.service';
import { BaseOperacionalService } from '../sst/base-operacional.service';
import {
  EquipeLocal,
  ColaboradorLocal,
  MunicipioLocal,
  VeiculoLocal,
  MaterialLocal,
  EstoqueLocal,
  SaldoLocal,
  SaldoSerieLocal,
  ProcessoLocal,
  TransferenciaLocal,
  OutboxItem,
  InspecaoLocal,
  TipoInspecaoLocal
} from '../db/models';
import {
  AnexoPendenteLocal,
  EvidenciaInspecaoResponse,
  EvidenciaLocal,
  InspecaoSegurancaResponse,
  RegistrarInspecaoRequest,
  sanitizarRegistrarInspecao,
} from '../sst/inspecao.models';

export const INSPECAO_LANCAR_ENDPOINT = '/_orchestrator/inspecao/lancar';
export const INSPECAO_ANEXO_ENDPOINT = '/_orchestrator/inspecao/anexo';
const DURABLE_OPERATION_ENDPOINT = '/v1/sincronizacao/operacoes';

/**
 * Nenhuma inspeção é aceita sem foto. Um item antigo, enfileirado antes desta
 * regra, fica retido com esta mensagem em vez de receber um `400` opaco.
 */
const SEM_EVIDENCIA_DETALHE =
  'Esta inspeção não tem foto de evidência e não pode ser enviada. '
  + 'Refaça o lançamento anexando ao menos uma foto.';

/**
 * Marca erros ocorridos no upload das evidências, que acontece **antes** do
 * `POST /v1/sst/inspecoes`. Sem isso, uma queda de rede no envio de uma foto
 * seria tratada como envio de inspeção com resultado incerto.
 */
const FASE_EVIDENCIA = '__faseEvidenciaInspecao';

/** Espera usada quando o 429 não diz quanto aguardar. */
const ESPERA_PADRAO_LIMITE_MS = 30_000;
export const RETOMADA_SEM_REDE_BASE_MS = 15_000;
export const RETOMADA_SEM_REDE_MAX_MS = 5 * 60_000;

/**
 * Quanto o servidor pediu para esperar num 429, em milissegundos. Vem em `retryAfter` no
 * corpo (já normalizado pelo errorInterceptor) ou no header `Retry-After` da resposta crua.
 * O teto de 15 minutos protege contra um valor absurdo travar a fila.
 */
export function esperaPedidaMs(error: unknown): number | undefined {
  const e = error as {
    retryAfter?: unknown;
    error?: { retryAfter?: unknown } | null;
    headers?: { get?: (nome: string) => string | null };
  } | null;
  const bruto = e?.retryAfter ?? e?.error?.retryAfter ?? e?.headers?.get?.('Retry-After');
  const segundos = Number(bruto);
  return Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos, 15 * 60) * 1000 : undefined;
}

interface PageResponse<T> {
  content: T[];
  page: {
    size: number;
    number: number;
    totalElements: number;
    totalPages: number;
  };
}

/**
 * Etapa de sincronização que não pôde ser concluída.
 * Um usuário de campo tem um perfil de acesso restrito, então é esperado que
 * alguns catálogos administrativos respondam 403 — isso não pode derrubar o
 * sync inteiro, mas também não pode ficar invisível.
 */
export interface SyncStepFalha {
  etapa: string;
  motivo: string;
  semPermissao: boolean;
  /** Status HTTP da falha, quando houve resposta do servidor. */
  status?: number;
}

export interface SyncResult {
  sincronizados: number;
  erros: number;
  /** Catálogos/listas que falharam. Vazio quando o sync veio completo. */
  falhas: SyncStepFalha[];
}

const RESULTADO_VAZIO = (): SyncResult => ({ sincronizados: 0, erros: 0, falhas: [] });

/**
 * Executa o envio da fila com exclusão entre abas. Padrão: Web Locks
 * (`ifAvailable`: se outra aba já está enviando, esta não espera nem duplica).
 * Injetável para testes com relógio falso, onde o callback do lock não avança.
 */
export type ExecutorComTrava = (fn: () => Promise<SyncResult>) => Promise<SyncResult>;
export const TRAVA_FILA = new InjectionToken<ExecutorComTrava>('TRAVA_FILA', {
  providedIn: 'root',
  factory: () => async (fn) => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) return fn();
    const resultado: unknown = await locks.request('ces-outbox', { ifAvailable: true }, lock => (lock ? fn() : RESULTADO_VAZIO())); // renomear-geo: manter
    return resultado as SyncResult;
  },
});

/**
 * IDs dos membros com vínculo ativo, sem repetição. A API da equipe devolve o
 * histórico de vínculos: cada troca de responsável encerra o vínculo antigo e
 * cria outro para a mesma pessoa, então sem o filtro ela aparece duas vezes.
 */
export function idsMembrosAtivos(membros: any[] | null | undefined): string[] {
  const ids = (membros ?? [])
    .filter((m: any) => m?.vinculoAtivo !== false)
    .map((m: any) => m.idColaborador || m.id)
    .filter(Boolean);
  return [...new Set<string>(ids)];
}

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly tokenService = inject(TokenService);
  private readonly dbService = inject(DbService);
  private readonly outboxService = inject(OutboxService);
  private readonly turnoService = inject(TurnoService);
  private readonly baseOperacionalService = inject(BaseOperacionalService);
  private readonly checklistVeiculo = inject(ChecklistVeiculoService);
  private readonly documentosVeiculo = inject(DocumentosVeiculoService);
  private readonly abastecimento = inject(AbastecimentoService);
  private readonly registrosObras = inject(RegistrosObrasService);
  private readonly pacoteObras = inject(PacoteObrasService);

  readonly isSyncing = signal(false);
  readonly lastSyncAt = signal<Date | null>(null);
  readonly currentStep = signal<{ label: string, icon: string }>({ label: '', icon: '' });
  readonly outboxSyncVersion = signal(0);

  /** Execução corrente do outbox, compartilhada pelos gatilhos concorrentes. */
  private outboxSyncPromise: Promise<SyncResult> | null = null;

  /** Etapas que falharam no último sync (ex.: catálogos negados por permissão). */
  readonly falhasUltimoSync = signal<SyncStepFalha[]>([]);

  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * Garante uma credencial antes de sincronizar. Token vencido é renovado pelo cookie da
   * sessão; só quando a sessão acabou no servidor (ou não há como renovar) a sincronização
   * para — sem tirar a pessoa da tela e sem tocar nos dados locais.
   */
  private async requireValidSession(): Promise<void> {
    if (this.tokenService.token() && !this.tokenService.reautenticacaoNecessaria()) {
      await this.authService.tokenAtualizado();
      if (!this.tokenService.isTokenExpired()) return;
    }
    throw {
      status: 401,
      detail: this.tokenService.reautenticacaoNecessaria()
        ? 'Entre novamente com a mesma conta para sincronizar. Os dados locais foram preservados.'
        : 'Não foi possível renovar o acesso agora. Os dados locais foram preservados e serão enviados quando houver conexão.'
    };
  }

  /**
   * Requisições de sincronização não devem disparar o toast global de erro:
   * as falhas são consolidadas em `falhasUltimoSync` / no outbox e
   * apresentadas de forma única ao usuário.
   */
  private get silentOpts() {
    return { context: silentContext() };
  }

  /**
   * Opções de envio de uma escrita do outbox, carimbadas com a chave de idempotência.
   *
   * <p>A chave é o próprio `id` do item — um UUID criado no enfileiramento e estável por
   * toda a vida dele. Isso é o que faltava para o reenvio ser seguro: até aqui, um item
   * que falhou por rede era reenviado sem que ninguém soubesse se a tentativa anterior
   * havia gravado ou não. Erro de rede é ausência de resposta, não prova de que nada
   * aconteceu — a requisição pode ter chegado, gravado, e se perdido só na volta.</p>
   *
   * <p>O `sufixo` separa as várias requisições de um mesmo item composto (cada foto, o
   * lançamento em si). Sem ele, a segunda requisição do item herdaria a resposta gravada
   * da primeira, que é o oposto do que se quer.</p>
   */
  private opcoesDeEscrita(idItem: string, sufixo?: string) {
    const chave = sufixo ? `${idItem}:${sufixo}` : idItem;
    return {
      ...this.silentOpts,
      headers: { 'Idempotency-Key': chave }
    };
  }


  constructor() {
    this.loadLastSync();
  }

  private async loadLastSync(): Promise<void> {
    const savedDate = await this.dbService.getConfig('lastSyncAt');
    if (savedDate) {
      this.lastSyncAt.set(new Date(savedDate));
    }
  }

  /**
   * Sincronização Parcial / Simplificada:
   * Envia operações pendentes (PUSH do Outbox) e atualiza apenas os saldos de estoque e
   * registros transacionais imediatos (solicitações, transferências, execuções, eventos do turno).
   * Rápida e ideal para o uso contínuo em campo.
   */
  async syncParcial(): Promise<SyncResult> {
    await this.requireValidSession();
    if (this.isSyncing()) return RESULTADO_VAZIO();

    this.isSyncing.set(true);
    const falhas: SyncStepFalha[] = [];
    let outboxResult: SyncResult = RESULTADO_VAZIO();

    try {
      this.currentStep.set({ label: 'Sincronizando operações pendentes...', icon: 'refresh-cw' });
      outboxResult = await this.syncOutbox({ reconciliar: false });

      if (this.authService.isCampo()) {
        await this.runStep('Turno ativo', 'clock', () => this.turnoService.syncTurnoAtivoComServidor(), falhas);
      }
      if (this.authService.ehEquipeObras() || this.authService.ehSupervisorObras()) {
        await this.runStep('Agenda das obras', 'map', () => this.pacoteObras.sincronizar(), falhas);
      }

      this.currentStep.set({ label: 'Atualizando saldos e listas operacionais...', icon: 'refresh-cw' });
      await this.pullParcialData(falhas);

      await this.registrarConclusao(falhas, 'Sincronização parcial concluída!');

      return { ...outboxResult, falhas };
    } catch (error) {
      console.error('Erro na Sincronização Parcial:', error);
      this.falhasUltimoSync.set(falhas);
      throw error;
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * Sincronização Total / Completa:
   * Equivalente ao primeiro login da aplicação. Envia pendências e atualiza TODOS os catálogos no IndexedDB
   * (municípios, bases, veículos, processos, ações, estoques, materiais, colaboradores) usando substituição
   * atômica para eliminar registros obsoletos e garantir conformidade total com o servidor.
   */
  async syncTotal(): Promise<SyncResult> {
    await this.requireValidSession();
    if (this.isSyncing()) return RESULTADO_VAZIO();

    this.isSyncing.set(true);
    const falhas: SyncStepFalha[] = [];
    let outboxResult: SyncResult = RESULTADO_VAZIO();

    try {
      const equipeId = this.tokenService.equipeId();
      const estoqueId = this.tokenService.estoqueId();
      const isCampo = this.authService.isCampo();

      if (isCampo && !equipeId) {
        throw new Error(
          'Seu usuário não está vinculado a uma equipe. Peça ao administrador para vincular seu colaborador a uma equipe antes de usar o aplicativo.'
        );
      }

      // 1. Processar Outbox inicial se houver (PUSH primeiro para garantir reconciliação no servidor antes do pull)
      this.currentStep.set({ label: 'Sincronizando operações pendentes...', icon: 'refresh-cw' });
      outboxResult = await this.syncOutbox({ reconciliar: false });

      // 2. Dados de identidade operacional (equipe/colaboradores).
      // Cada etapa é isolada: o perfil de acesso de campo é restrito e
      // catálogos administrativos podem responder 403 legitimamente.
      if (isCampo) {
        await this.runStep('Turno ativo', 'clock', () => this.turnoService.syncTurnoAtivoComServidor(), falhas);
        await this.runStep('Dados da equipe', 'settings', () => this.syncEquipeDoUsuario(equipeId!), falhas);
        await this.runStep('Membros da equipe', 'users', () => this.syncMembrosEquipe(equipeId!), falhas);
        // Composição confirmada no turno (veículo/membros), opções para a
        // conferência e meta mensal. Sobrepõe a lista de membros acima.
        await this.runStep('Composição e meta da equipe', 'users', async () => {
          await this.turnoService.sincronizarComposicao();
        }, falhas);
        if (this.authService.ehEquipeObras()) {
          await this.runStep('Agenda e projetos das obras', 'map', () => this.pacoteObras.sincronizar(), falhas);
        }
      } else if (this.authService.isAdministrativo()) {
        await this.runStep('Equipes', 'settings', () => this.syncTodasEquipes(), falhas);
        await this.runStep('Colaboradores', 'users', () => this.syncTodosColaboradores(), falhas);
      }

      // 3. Catálogos, com substituição atômica no IndexedDB.
      // Uma etapa que falha nunca chega a chamar o `replace*` correspondente,
      // então o cache local anterior é preservado em vez de ser apagado.
      await this.runStep('Municípios e bases', 'map-pin', () => this.syncMunicipios(), falhas);
      await this.runStep('Frota de veículos', 'truck', () => this.syncVeiculos(), falhas);
      await this.runStep('Catálogo de processos', 'clipboard-list', () => this.syncProcessos(), falhas);
      // Todo usuário do app preenche o checklist do veículo (campo e administrativo).
      await this.runStep('Checklist do veículo', 'clipboard-check', () => this.checklistVeiculo.sincronizarCatalogo(), falhas);
      // Documentos do veículo (CRLV, tacógrafo) guardados para a fiscalização sem sinal; em segundo
      // plano, porque arquivo grande não pode segurar a sincronização nem virar falha dela.
      void this.documentosVeiculo.guardarDoMeuVeiculo().catch(() => undefined);
      // Abastecimento também é de todo usuário do app: postos, produtos e a situação dos pedidos.
      await this.runStep('Abastecimento', 'truck', () => this.abastecimento.sincronizarCatalogo(), falhas);

      if (this.authService.podeAcessarInspecoes()) {
        await this.runStep('Bases operacionais', 'map-pin', async () => {
          await this.baseOperacionalService.sincronizarAtivas();
        }, falhas);
        await this.runStep('Tipos de inspeção', 'tag', () => this.syncTiposInspecao(), falhas);
        await this.runStep('Formulários de inspeção', 'clipboard-check', () => this.syncFormularios(), falhas);
      }

      // Catálogos de material: exclusivos de quem opera logística.
      // Para o perfil administrativo esses endpoints respondem 403 e nada no
      // app consome os dados, então nem chegam a ser solicitados.
      if (this.authService.podeAcessarLogistica()) {
        await this.runStep('Catálogo de materiais', 'package', () => this.syncMateriais(), falhas);
        await this.runStep('Estoques', 'archive', () => this.syncEstoques(), falhas);

        if (estoqueId) {
          await this.runStep('Saldos de materiais', 'database', () => this.syncSaldos(estoqueId), falhas);
          await this.runStep('Números de série', 'qr_code', () => this.syncSeriais(estoqueId), falhas);
          // Reaplicar deduções só faz sentido depois que saldos e seriais oficiais
          // estiverem no lugar — caso contrário o replace desfaz as deduções.
          await this.runStep('Saldos locais pendentes', 'database', () => this.reaplicarDeducoesPendentes(estoqueId), falhas);
        }
      }

      // 4. Atualizar listas operacionais da equipe.
      // O catálogo de materiais acabou de ser baixado acima; repeti-lo aqui só
      // duplicava a requisição — e a etapa na lista de falhas.
      await this.pullParcialData(falhas, { incluirCatalogoMateriais: false });

      await this.registrarConclusao(falhas, 'Sincronização total concluída!');

      return { ...outboxResult, falhas };
    } catch (error) {
      console.error('Erro na Sincronização Total:', error);
      this.falhasUltimoSync.set(falhas);
      throw error;
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * Executa uma etapa de sincronização de forma isolada.
   *
   * Uma etapa negada por permissão (403) ou indisponível não pode derrubar o
   * sync inteiro: usuários de campo têm perfil restrito e é normal que parte
   * dos catálogos administrativos não esteja acessível a eles. A falha é
   * registrada para que a UI possa informar exatamente o que não veio.
   */
  private async runStep(
    etapa: string,
    icon: string,
    fn: () => Promise<void>,
    falhas: SyncStepFalha[]
  ): Promise<void> {
    this.currentStep.set({ label: `Sincronizando ${etapa.toLowerCase()}...`, icon });

    try {
      await fn();
    } catch (error) {
      if (this.extrairStatus(error) === 401) throw error;
      const falha = this.descreverFalha(etapa, error);
      falhas.push(falha);
      console.warn(
        `[Sync] Etapa "${etapa}" ignorada (HTTP ${falha.status ?? 'n/d'}): ${falha.motivo}`,
        error
      );
    }
  }

  private descreverFalha(etapa: string, error: unknown): SyncStepFalha {
    const status = this.extrairStatus(error);

    if (status === 403) {
      return {
        etapa,
        motivo: 'Seu perfil de acesso não permite consultar estes dados.',
        semPermissao: true,
        status
      };
    }

    return {
      etapa,
      motivo: this.extrairDetalheErro(error) || 'Não foi possível baixar estes dados.',
      semPermissao: false,
      status
    };
  }

  /** Há token e a sessão não foi encerrada: só assim vale a pena enviar a fila. */
  private sessaoAtiva(): boolean {
    return !!this.tokenService.token() && !this.tokenService.reautenticacaoNecessaria();
  }

  private extrairStatus(error: unknown): number | undefined {
    return (error as { status?: number } | null)?.status;
  }

  /**
   * Extrai uma mensagem de erro apresentável ao usuário, considerando as duas
   * formas que chegam até aqui: o `ApiError` já normalizado pelo
   * `errorInterceptor` (`{ status, detail }`) e o `HttpErrorResponse` cru
   * (quando o interceptor não está na cadeia).
   *
   * Retorna `undefined` quando só existe a mensagem técnica do Angular
   * ("Http failure response for ...") — nesse caso o chamador usa seu próprio
   * texto em português, conforme a seção 9 do CLAUDE.md.
   */
  private extrairDetalheErro(error: unknown): string | undefined {
    const e = error as {
      status?: number;
      detail?: string;
      title?: string;
      error?: { detail?: string; title?: string };
      message?: string;
    } | null;

    const detalheDaApi = e?.detail || e?.error?.detail || e?.title || e?.error?.title;
    if (detalheDaApi) return detalheDaApi;

    // Erro HTTP sem Problem Details: `message` seria a string técnica do Angular.
    if (typeof e?.status === 'number') return undefined;

    // Exceções locais (ex.: `new Error('...')`) trazem mensagem já em português.
    return e?.message;
  }

  private async registrarConclusao(falhas: SyncStepFalha[], labelSucesso: string): Promise<void> {
    this.falhasUltimoSync.set(falhas);

    const now = new Date();
    await this.dbService.setConfig('lastSyncAt', now.toISOString());
    this.lastSyncAt.set(now);

    this.currentStep.set(
      falhas.length === 0
        ? { label: labelSucesso, icon: 'check-circle' }
        : { label: `Sincronização concluída com ${falhas.length} pendência(s).`, icon: 'alert-triangle' }
    );
  }

  private async syncEquipeDoUsuario(equipeId: string): Promise<void> {
    const equipeData = await firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/v1/equipes/${equipeId}`, this.silentOpts)
    );

    const equipeLocal: EquipeLocal = {
      id: equipeData.id,
      codigo: equipeData.codigo,
      nomeTipoEquipe: equipeData.tipoEquipe?.nome,
      nomeProcesso: equipeData.processo?.nome,
      idBaseOperacional: equipeData.baseOperacional?.id,
      nomeBaseOperacional: equipeData.baseOperacional?.nome,
      idVeiculo: equipeData.veiculo?.id,
      membrosIds: idsMembrosAtivos(equipeData.membros)
    };
    await this.dbService.saveEquipe(equipeLocal);
  }

  private async syncMembrosEquipe(equipeId: string): Promise<void> {
    const rawMembros = await firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/v1/equipes/${equipeId}/membros`, this.silentOpts)
    );

    // Garante que temos um array, mesmo que o retorno esteja em uma propriedade content ou seja o array direto
    const membrosData = Array.isArray(rawMembros) ? rawMembros : (rawMembros?.content || []);

    const colaboradores: ColaboradorLocal[] = membrosData.map((m: any) => ({
      id: m.idColaborador || m.id,
      idUsuario: m.idUsuario || '',
      nomeCompleto: m.nomeColaborador || m.nomeCompleto || 'Sem nome',
      funcao: m.funcao?.nome || m.funcao || 'N/A',
      ativo: m.vinculoAtivo ?? m.ativo ?? true
    }));

    await this.dbService.replaceColaboradores(colaboradores);
  }

  private async syncTodasEquipes(): Promise<void> {
    const rawEquipes = await firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/v1/equipes?size=10000`, this.silentOpts)
    );
    const equipesData = rawEquipes?.content || [];
    const equipesLocais: EquipeLocal[] = equipesData.map((e: any) => ({
      id: e.id,
      codigo: e.codigo,
      nomeTipoEquipe: e.tipoEquipe?.nome,
      nomeProcesso: e.processo?.nome,
      idBaseOperacional: e.baseOperacional?.id,
      nomeBaseOperacional: e.baseOperacional?.nome,
      idVeiculo: e.veiculo?.id,
      membrosIds: idsMembrosAtivos(e.membros)
    }));
    await this.dbService.replaceEquipes(equipesLocais);
  }

  private async syncTodosColaboradores(): Promise<void> {
    const rawColaboradores = await firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/v1/rh/colaboradores?size=10000`, this.silentOpts)
    );
    const colaboradoresData = rawColaboradores?.content || [];
    const colaboradoresGlobais: ColaboradorLocal[] = colaboradoresData.map((c: any) => ({
      id: c.id,
      idUsuario: c.idUsuario || '',
      nomeCompleto: c.nomeCompleto || c.primeiroNome || 'Sem nome',
      funcao: c.funcao?.nome || c.funcao || 'N/A',
      ativo: c.ativo ?? true
    }));
    await this.dbService.replaceColaboradores(colaboradoresGlobais);
  }

  /**
   * Sincronização inicial do aplicativo.
   * Aciona a sincronização total (`syncTotal`).
   */
  async initialSync(): Promise<SyncResult> {
    return this.syncTotal();
  }

  /**
   * Força uma sincronização geral bidirecional (Push do Outbox + Pull e reconciliação de todas as entidades).
   */
  async forceFullSync(): Promise<SyncResult> {
    return this.syncTotal();
  }

  /**
   * Processa a fila de outbox, enviando as operações pendentes para o backend.
   *
   * @param opts.reconciliar quando `false`, não dispara o pull de reconciliação
   * ao final. Usado por `syncTotal`/`syncParcial`, que já fazem o pull logo em
   * seguida — sem isso, todo sync baixava as listas operacionais duas vezes.
   */
  syncOutbox(opts: { reconciliar?: boolean } = {}): Promise<SyncResult> {
    if (this.outboxSyncPromise) return this.outboxSyncPromise;

    const run = this.comTravaEntreAbas(() => this.processarOutbox(opts)).finally(() => void this.agendarDespertar());
    this.outboxSyncPromise = run;
    const release = () => {
      if (this.outboxSyncPromise === run) this.outboxSyncPromise = null;
    };
    run.then(release, release);
    return run;
  }

  /** Uma aba por vez processa a fila; a idempotência no servidor é a última barreira. */
  private readonly comTravaEntreAbas = inject(TRAVA_FILA);

  private despertador: ReturnType<typeof setTimeout> | null = null;

  /** Itens adiados por espera crescente voltam sozinhos quando o prazo vence. */
  private async agendarDespertar(): Promise<void> {
    if (this.despertador) clearTimeout(this.despertador);
    this.despertador = null;
    const proximo = await this.outboxService.proximoReenvioAgendado?.();
    if (!proximo) return;
    this.despertador = setTimeout(() => {
      this.despertador = null;
      if (this.tokenService.token() && !this.tokenService.reautenticacaoNecessaria()) {
        void this.syncOutbox().catch(() => {});
      }
    }, Math.max(0, proximo - Date.now()) + 50);
  }

  private retomadaSemRede: ReturnType<typeof setTimeout> | null = null;
  private rodadasSemRede = 0;

  /**
   * Depois de uma rodada que falhou por rede, agenda outra com espera crescente
   * (15 s, 30 s, 1 min… até 5 min). Não usa `proximaTentativaEm` de propósito:
   * o item continua elegível para "Sincronizar agora" e para a volta da rede.
   */
  private agendarRetomadaSemRede(falhouPorRede: boolean): void {
    if (this.retomadaSemRede) clearTimeout(this.retomadaSemRede);
    this.retomadaSemRede = null;
    if (!falhouPorRede) {
      this.rodadasSemRede = 0;
      return;
    }
    this.rodadasSemRede++;
    const espera = Math.min(RETOMADA_SEM_REDE_MAX_MS, RETOMADA_SEM_REDE_BASE_MS * 2 ** (this.rodadasSemRede - 1));
    this.retomadaSemRede = setTimeout(() => {
      this.retomadaSemRede = null;
      if (this.tokenService.token() && !this.tokenService.reautenticacaoNecessaria()) {
        void this.syncOutbox().catch(() => {});
      }
    }, espera);
  }

  private async registrarOperacaoParaBackoffice(item: OutboxItem, motivo: string): Promise<boolean> {
    try {
      const tipo = item.endpoint.includes('execu') ? 'EXECUCAO'
        : item.endpoint.includes('solicit') ? 'SOLICITACAO'
        : item.endpoint.includes('transfer') ? 'TRANSFERENCIA'
        : item.endpoint.includes('inspec') && item.endpoint.includes('anexo') ? 'ANEXO'
        : item.endpoint.includes('inspec') ? 'INSPECAO'
        : item.endpoint.includes('turno') ? 'TURNO' : undefined;
      if (!tipo) return false;
      const anexos = await this.serializarAnexosParaRecebimento(item);
      if (anexos === null) return false;
      const response = await firstValueFrom(this.http.post<any>(`${this.baseUrl}${DURABLE_OPERATION_ENDPOINT}`, {
        idOperacaoLocal: item.id,
        tipo,
        idRegistroLocal: item.payload?.tempId ?? item.payload?.id ?? item.id,
        instanteOrigem: item.criadoEm instanceof Date ? item.criadoEm.toISOString() : new Date(item.criadoEm).toISOString(),
        payload: item.originalPayload ?? item.payload,
        anexos,
        erroOrigem: motivo
      }, this.opcoesDeEscrita(item.id, 'recebimento')));
      await this.outboxService.markServerReceipt(item.id, {
        operationId: response?.idCaso ?? response?.idOperacaoLocal,
        status: 'RECEIVED',
        detail: motivo
      });
      return true;
    } catch (receiptError) {
      console.warn(`[Sync] Recebimento administrativo ainda não confirmado para ${item.id}.`, receiptError);
      return false;
    }
  }

  private async serializarAnexosParaRecebimento(item: OutboxItem): Promise<any[] | null> {
    const payload = item.originalPayload ?? item.payload;
    const candidates = [
      ...(Array.isArray(payload?.evidencias) ? payload.evidencias : []),
      ...(Array.isArray(payload?.anexosPendentes) ? payload.anexosPendentes : []),
      ...(Array.isArray(payload?.anexos) ? payload.anexos : []),
      ...(payload?.anexo ? [payload.anexo] : [])
    ];
    if (!candidates.length) return [];
    const anexos: any[] = [];
    let estimatedBytes = 0;
    for (const anexo of candidates) {
      const arquivo = anexo?.arquivo;
      if (!(arquivo instanceof Blob)) return null;
      const bytes = await arquivo.arrayBuffer();
      const base64 = this.arrayBufferToBase64(bytes);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      estimatedBytes += base64.length;
      // Mantém margem para DTO e cabeçalhos dentro do limite de 20 MiB.
      if (estimatedBytes > 18 * 1024 * 1024) return null;
      anexos.push({
        idLocal: anexo.idLocal,
        nome: anexo.nomeArquivo ?? 'anexo',
        contentType: arquivo.type || 'application/octet-stream',
        sha256,
        conteudoBase64: base64
      });
    }
    return anexos;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  private async reconciliarOperacaoRecebida(item: OutboxItem): Promise<boolean> {
    try {
      const response = await firstValueFrom(this.http.get<any>(
        `${this.baseUrl}${DURABLE_OPERATION_ENDPOINT}/${encodeURIComponent(item.id)}`,
        this.silentOpts
      ));
      if (!response?.status) return false;
      const resolved = response.status === 'RESOLVIDO';
      await this.outboxService.markServerReceipt(item.id, {
        operationId: response.idCaso ?? response.idOperacaoLocal,
        status: resolved ? 'RESOLVED' : 'RECEIVED',
        detail: response.backofficeInformado ? 'Registro preservado e backoffice informado para tratamento.' : undefined
      });
      await this.outboxService.updateStatus(item.id, resolved ? 'SINCRONIZADO' : 'ERRO',
        response.backofficeInformado ? 'Registro preservado e backoffice informado para tratamento.' : 'Recebimento confirmado; aguardando tratamento administrativo.');
      return true;
    } catch {
      return false;
    }
  }

  private async processarOutbox(opts: { reconciliar?: boolean } = {}): Promise<SyncResult> {
    await this.requireValidSession();
    const { reconciliar = true } = opts;
    const processados = new Set<string>();
    let sincronizados = 0;
    let erros = 0;
    // 429: o servidor pediu para esperar. Os demais itens ficam para a próxima rodada,
    // que o despertador agenda pelo prazo do item adiado.
    let limiteDoServidor = false;
    // Falha por rede não muda `isOnline` quando o aparelho tem sinal sem internet
    // (navigator.onLine mente): sem uma nova rodada agendada, o item ficava parado
    // até alguém tocar em "Sincronizar".
    let falhouPorRede = false;
    // A pessoa saiu da conta (ou a sessão caiu) no meio do envio: sem token o servidor
    // responde 403 a tudo, e cada item virava erro definitivo de "perfil de acesso".
    // Isso já prendeu notas de uma equipe na fila. A fila para e espera o próximo login.
    let semSessao = false;

    try {
      for (const item of await this.outboxService.getErrorItems()) {
        if (item.receiptStatus === 'RECEIVED') {
          await this.reconciliarOperacaoRecebida(item);
        } else if (item.receiptStatus !== 'RESOLVED') {
          await this.registrarOperacaoParaBackoffice(item, item.erroDetalhes || 'Falha anterior de sincronizacao.');
        }
      }
      // Alguns fluxos compostos criam novos itens enquanto são processados
      // (ex.: o lançamento da inspeção cria os uploads dos anexos). Recarrega a
      // fila até não haver itens novos, sem repetir nesta execução os que
      // falharam e continuaram PENDENTE.
      while (true) {
        const uncertainItems = (this.outboxService as any).getUncertainItems
          ? await (this.outboxService as any).getUncertainItems()
          : [];
        for (const uncertain of uncertainItems) {
          if (!processados.has(uncertain.id)) {
            processados.add(uncertain.id);
            const confirmado = await this.reconciliarOperacaoRecebida(uncertain);
            if (!confirmado) {
              const recebido = await this.registrarOperacaoParaBackoffice(uncertain,
                uncertain.erroDetalhes || 'Resultado operacional incerto apos perda de resposta.');
              if (recebido) await this.outboxService.updateStatus(uncertain.id, 'ERRO',
                'Registro preservado e backoffice informado para conciliacao.');
            }
          }
        }
        const pendingItems = (await this.outboxService.getPendingItems())
          .filter(item => !processados.has(item.id));
        if (pendingItems.length === 0) break;

        for (const listado of pendingItems) {
          if (!this.sessaoAtiva()) {
            semSessao = true;
            break;
          }
          processados.add(listado.id);
          // A lista foi lida antes: o item pode ter sido corrigido ou descartado desde
          // então. Reivindicar relê e trava a correção, para nunca enviar uma versão
          // substituída nem deixar corrigir o que já pode estar no servidor.
          const item = await this.outboxService.reivindicarParaEnvio(listado.id);
          if (!item) continue;
          try {
            // Endpoints sentinela (começam com "/_") são orquestrações compostas
            // resolvidas localmente, e não chamadas HTTP únicas.
            if (item.endpoint === INSPECAO_LANCAR_ENDPOINT) {
              await this.processarInspecaoLancamento(item);
            } else if (item.endpoint === INSPECAO_ANEXO_ENDPOINT) {
              await this.processarAnexoInspecao(item);
            } else if (item.endpoint === CHECKLIST_LANCAR_ENDPOINT) {
              await this.checklistVeiculo.processarEnvio(item);
            } else if (item.endpoint === ABASTECIMENTO_ENDPOINT) {
              await this.abastecimento.processarEnvio(item);
            } else if (item.endpoint === OBRAS_ENDPOINT) {
              await this.registrosObras.processarEnvio(item);
            } else if (item.endpoint?.includes('eventos')) {
              // Itens legados de eventos de turno nunca são descartados: o payload
              // original precisa permanecer disponível para o tratamento administrativo.
              await this.outboxService.updateStatus(
                item.id,
                'ERRO',
                'Operação legada preservada para tratamento administrativo.'
              );
              continue;
            } else {
              // Fechamento de turno aberto sem sinal: o id provisório vira o do servidor.
              const endpoint = item.endpoint.replace(/local-[0-9a-f-]{36}/, (tmp) => idAtual(tmp) ?? tmp);
              if (/local-[0-9a-f-]{36}/.test(endpoint)) {
                // A abertura ainda não saiu: espera na fila sem gastar tentativa.
                throw Object.assign(new Error('Aguardando a abertura do turno.'), { status: 0 });
              }
              const response = await firstValueFrom(
                this.http.request<any>(item.method, `${this.baseUrl}${endpoint}`, {
                  body: (item.endpoint === '/v1/movimentacoes-estoque/transferencia' || item.endpoint === '/v1/turnos/abrir') && item.payload?.tempId
                    ? (({ tempId: _tempId, ...request }) => request)(item.payload)
                    : item.payload,
                  ...this.opcoesDeEscrita(item.id)
                })
              );

              // O backend pode devolver o recibo durável junto do resultado
              // operacional. Persistimos esse recibo antes de qualquer limpeza
              // local, para que a UI nunca anuncie tratamento sem confirmação.
              const receiptId = response?.operationId ?? response?.idOperacao ?? response?.idReferenciaOperacao;
              if (response?.receiptStatus || receiptId) {
                await this.outboxService.markServerReceipt(item.id, {
                  operationId: receiptId,
                  status: response.receiptStatus ?? 'RECEIVED'
                });
              }

              if (item.endpoint === '/v1/turnos/abrir' && item.payload?.tempId && response?.id) {
                await this.turnoService.trocarIdTurnoLocal(item.payload.tempId, response);
              }
              if (/^\/v1\/turnos\/[^/]+\/fechar\?dataFim=/.test(item.endpoint)) this.turnoService.fechamentoEnviado();

              // Se for uma transferência, atualizar o registro local
              if (item.endpoint === '/v1/movimentacoes-estoque/transferencia' && item.payload?.tempId) {
                const localTransf = await this.dbService.getTransferenciaById(item.payload.tempId);
                if (localTransf) {
                  const realId = typeof response === 'string' ? response : (response?.idReferenciaOperacao || response?.id || localTransf.id);

                  await this.dbService.deleteTransferencia(item.payload.tempId);
                  registrarIdTrocado(item.payload.tempId, realId);
                  await this.dbService.saveTransferencia({
                    ...localTransf,
                    id: realId,
                    statusSync: 'SINCRONIZADO'
                  });
                }
              }

              await this.outboxService.updateStatus(item.id, 'SINCRONIZADO');
              await this.outboxService.discard(item.id);
            }
            sincronizados++;
          } catch (error: any) {
            erros++;
            console.error(`Erro ao sincronizar item ${item.id}:`, error);

            // Verifica se é um erro de rede/timeout/offline
            const status = this.extrairStatus(error);
            // O errorInterceptor já normalizou o erro para `ApiError` ({ status, detail }),
            // então o detalhe do backend precisa ser lido de `detail` — e não apenas de
            // `error.error.detail`, que só existe no `HttpErrorResponse` cru.
            const detalhe = this.extrairDetalheErro(error);
            const isNetworkOrTimeout = (typeof navigator !== 'undefined' && !navigator.onLine) ||
              status === 0 || status === 408 || status === 504 ||
              (status === undefined && (
                detalhe?.toLowerCase().includes('fetch') ||
                detalhe?.toLowerCase().includes('network') ||
                detalhe?.toLowerCase().includes('timeout') ||
                (error as any)?.name === 'TimeoutError'
              ));

            // Falha no upload da evidência é anterior à criação da inspeção:
            // o item volta para a fila como qualquer outro erro de rede.
            const falhouAntesDoLancamento = (error as Record<string, unknown>)?.[FASE_EVIDENCIA] === true;
            const reconciliado = !falhouAntesDoLancamento && (isNetworkOrTimeout || status === undefined || status >= 500)
              ? await this.reconciliarOperacaoRecebida(item)
              : false;
            if (reconciliado) continue;

            if (status === 429) {
              // Limite de envios: o servidor recusou antes de gravar qualquer coisa. Não é erro
              // do lançamento nem conta como tentativa; o item volta sozinho depois da espera.
              await this.outboxService.updateStatus(item.id, 'PENDENTE',
                'Muitos envios em pouco tempo. O app tenta de novo sozinho em instantes.');
              await this.outboxService.adiarPor(item.id, esperaPedidaMs(error) ?? ESPERA_PADRAO_LIMITE_MS);
              limiteDoServidor = true;
              break;
            }

            if (isNetworkOrTimeout) falhouPorRede = true;

            if (isNetworkOrTimeout && item.endpoint === INSPECAO_LANCAR_ENDPOINT
              && !falhouAntesDoLancamento) {
              await this.outboxService.incrementAttempt(item.id);
              await this.outboxService.updateStatus(
                item.id,
                'RESULTADO_INCERTO',
                'O servidor pode ter criado esta inspeção. Consulte “Minhas inspeções” antes de confirmar um reenvio.'
              );
              const local = await this.dbService.getInspecao(item.id);
              if (local) {
                await this.dbService.saveInspecao({
                  ...local,
                  statusSync: 'RESULTADO_INCERTO',
                  erroDetalhes: 'Resultado do envio incerto. Confirme no servidor antes de reenviar.',
                });
              }
            } else if (isNetworkOrTimeout) {
              // Em caso de falha de conexão/timeout, NÃO marcamos ERRO definitivo nem descartamos.
              // Mantém PENDENTE para que o reenvio aconteça automaticamente quando a rede estabilizar.
              await this.outboxService.incrementAttempt(item.id);
              await this.outboxService.updateStatus(item.id, 'PENDENTE', 'Aguardando conexão ou resposta do servidor para envio...');
            } else if (status === 401) {
              await this.outboxService.updateStatus(item.id, 'PENDENTE', 'Entre novamente com a mesma conta para sincronizar.');
              throw error;
            } else if (status === 403 && !this.sessaoAtiva()) {
              await this.outboxService.updateStatus(item.id, 'PENDENTE', 'Entre novamente com a mesma conta para sincronizar.');
              semSessao = true;
              break;
            } else if (status === 403) {
              // Sem permissão para esta operação: reenviar não resolve. O item fica
              // retido com uma mensagem acionável em vez de tentar 5 vezes em vão.
              await this.outboxService.updateStatus(
                item.id,
                'ERRO',
                detalhe || 'Seu perfil de acesso não permite enviar esta operação. Fale com o administrador do sistema.'
              );
            } else if (status !== undefined && status >= 400 && status < 500) {
              // Erro de Negócio ou Validação do Servidor (4xx exceto 408) - Requer correção do usuário
              const received = await this.registrarOperacaoParaBackoffice(item, detalhe || 'Erro de validação no servidor.');
              await this.outboxService.updateStatus(item.id, 'ERRO', received
                ? 'Registro preservado e backoffice informado para tratamento.'
                : detalhe || 'Erro de validação no servidor.');
            } else {
              // Outros erros de servidor (5xx) ou exceções locais: tenta até 5 vezes antes de sinalizar erro na UI
              const tentativas = await this.outboxService.incrementAttempt(item.id);
              if (tentativas >= 5) {
                const received = await this.registrarOperacaoParaBackoffice(item, detalhe || 'Falha na sincronização após múltiplas tentativas.');
                await this.outboxService.updateStatus(item.id, 'ERRO', received
                  ? 'Registro preservado e backoffice informado para tratamento.'
                  : detalhe || 'Falha na sincronização. Verifique sua conexão ou tente novamente.');
              } else {
                await this.outboxService.updateStatus(item.id, 'PENDENTE', `Tentativa ${tentativas}/5 de sincronização...`);
                await this.outboxService.adiarNovaTentativa(item.id, tentativas);
              }
            }
          }
        }
        if (limiteDoServidor || semSessao) break;
      }

      // Reconciliação operacional bidirecional simplificada.
      // Só faz sentido quando o chamador não vai puxar os dados logo em seguida.
      const online = typeof navigator === 'undefined' || navigator.onLine;
      if (reconciliar && online && !semSessao) {
        await this.pullParcialData();
      }
    } finally {
      this.outboxSyncVersion.update(v => v + 1);
    }

    this.agendarRetomadaSemRede(falhouPorRede);
    return { sincronizados, erros, falhas: [] };
  }

  private async syncMunicipios(): Promise<void> {
    const data = await this.fetchAllPages<any>(`${this.baseUrl}/v1/municipios`);
    const local = data.map(m => ({
      id: m.id,
      nome: m.nome,
      idBaseOperacional: m.baseOperacional?.id,
      ativo: m.ativo
    }));
    await this.dbService.replaceMunicipios(local);
  }

  private async syncVeiculos(): Promise<void> {
    const data = await this.fetchAllPages<any>(`${this.baseUrl}/v1/veiculos`);
    const local: VeiculoLocal[] = data.map(v => ({
      id: v.id,
      placa: v.placa,
      modelo: v.modelo,
      fabricante: v.fabricante,
      ativo: v.ativo
    }));
    await this.dbService.replaceVeiculos(local);
  }

  private async syncProcessos(): Promise<void> {
    const data = await this.fetchAllPages<any>(`${this.baseUrl}/v1/processos-negocio`);
    const local: ProcessoLocal[] = data.map(p => ({
      id: p.id,
      nome: p.nome,
      ativo: p.ativo
    }));
    await this.dbService.replaceProcessos(local);
  }

  private async syncTiposInspecao(): Promise<void> {
    const data = await firstValueFrom(
      this.http.get<TipoInspecaoLocal[]>(`${this.baseUrl}/v1/sst/tipos-inspecao/opcoes`, this.silentOpts)
    );
    if (Array.isArray(data)) {
      await this.dbService.replaceTiposInspecao(data);
    }
  }

  private async syncFormularios(): Promise<void> {
    const resumos = await this.fetchAllPages<any>(`${this.baseUrl}/v1/sst/formularios-inspecao?ativo=true`);
    const formularios: any[] = [];

    for (const resumo of resumos) {
      const fullForm = await firstValueFrom(
        this.http.get<any>(`${this.baseUrl}/v1/sst/formularios-inspecao/${resumo.id}`, this.silentOpts)
      );
      formularios.push(fullForm);
    }

    await this.dbService.replaceFormularios(formularios);
  }

  private async syncMateriais(): Promise<void> {
    const data = await this.fetchAllPages<any>(`${this.baseUrl}/v1/materiais`);
    const local: MaterialLocal[] = data.map(m => ({
      id: m.id,
      codigo: m.codigo,
      descricao: m.descricao,
      unidadeMedida: m.unidadeMedida,
      detalhaSerie: m.detalhaSerie,
      equivalencias: (m.equivalencias ?? []).map((e: any) => ({
        unidade: e.unidade, quantidadeUnidade: Number(e.quantidadeUnidade), quantidadeBase: Number(e.quantidadeBase)
      }))
    }));
    await this.dbService.replaceMateriais(local);
  }

  private async syncEstoques(): Promise<void> {
    const data = await this.fetchAllPages<any>(`${this.baseUrl}/v1/estoques`);
    const local: EstoqueLocal[] = data.map(e => ({
      id: e.id,
      nomeIdentificador: e.nomeIdentificador,
      tipoEstoque: e.tipoEstoque?.nome,
      idEquipe: e.idEquipe,
      ativo: e.ativo
    }));
    await this.dbService.replaceEstoques(local);
  }

  async syncInspecoes(): Promise<void> {
    const params = { size: 50, sort: 'dataRealizacao,desc' };
    const endpoint = `${this.baseUrl}/v1/sst/inspecoes/minhas`;

    const data = await this.fetchAllPages<any>(endpoint, params);

    const locais: InspecaoLocal[] = data.map(item => ({
      id: item.id,
      idFormulario: item.formulario?.id,
      idTipoInspecao: item.tipoInspecao?.id,
      nomeTipoInspecao: item.tipoInspecao?.nome,
      tipoInspecao: item.tipoInspecao,
      idProcesso: item.processo?.id,
      idEquipe: item.equipe?.id,
      idBaseOperacional: item.baseOperacional?.id,
      nomeBaseOperacional: item.baseOperacional?.nome,
      idVeiculo: item.veiculo?.id,
      idColaboradoresInspecionados: (item.colaboradoresInspecionados || []).map((c: any) => c.id),
      idInspetor: item.idInspetor || '',
      latitude: item.latitude,
      longitude: item.longitude,
      observacoes: item.observacoes,
      status: item.status,
      dataRealizacao: item.dataRealizacao,
      statusSync: 'SINCRONIZADO',
      // Inspeções anteriores à exigência de evidência vêm com lista vazia; isso
      // não é erro nem pendência.
      evidenciasRemotas: (item.evidencias || []) as EvidenciaInspecaoResponse[],
      draftData: JSON.stringify({
        respostas: item.respostas || [],
        desvios: (item.desvios || []).map((desvio: { status: string; dataResolucao?: string | null }) =>
          desvio.status === 'RESOLVIDO' ? desvio : { ...desvio, dataResolucao: null }
        )
      })
    }));

    await this.dbService.replaceInspecoesSincronizadas(locais);
  }

  /**
   * Atualiza as listas operacionais (saldos, solicitações, transferências,
   * inspeções e execuções).
   *
   * Usa `allSettled`: uma lista negada por permissão não pode impedir que as
   * demais sejam atualizadas — com `Promise.all`, um único 403 abortava o pull
   * inteiro e, por consequência, todo o sync.
   */
  private async pullParcialData(
    falhas: SyncStepFalha[] = [],
    opts: { incluirCatalogoMateriais?: boolean } = {}
  ): Promise<void> {
    const { incluirCatalogoMateriais = true } = opts;
    const estoqueId = this.tokenService.estoqueId();
    const podeLogistica = typeof this.authService.podeAcessarLogistica === 'function' ? this.authService.podeAcessarLogistica() : !!this.authService.podeAcessarLogistica;

    const etapas: { nome: string, exec: () => Promise<void> }[] = [];

    // Listas de material só existem para quem opera logística. O perfil
    // administrativo trabalha apenas com inspeções e desvios.
    if (podeLogistica) {
      if (incluirCatalogoMateriais) {
        etapas.push({ nome: 'Catálogo de materiais', exec: () => this.syncMateriais() });
      }
      etapas.push({ nome: 'Transferências', exec: () => this.syncTransferencias() });
    }

    // Inspeções de segurança são um módulo administrativo: o encarregado de
    // campo não as acessa, então baixá-las só gera 403 e ruído na UI.
    const podeInspecoes = typeof this.authService.podeAcessarInspecoes === 'function' ? this.authService.podeAcessarInspecoes() : !!this.authService.podeAcessarInspecoes;
    if (podeInspecoes) {
      etapas.push({ nome: 'Inspeções de segurança', exec: () => this.syncInspecoes() });
    }

    if (podeLogistica && estoqueId) {
      etapas.push({ nome: 'Saldos de materiais', exec: () => this.syncSaldos(estoqueId) });
      etapas.push({ nome: 'Números de série', exec: () => this.syncSeriais(estoqueId) });
    }

    const resultados = await Promise.allSettled(etapas.map(e => e.exec()));

    const unauthorized = resultados.find(resultado =>
      resultado.status === 'rejected' && this.extrairStatus(resultado.reason) === 401
    );
    if (unauthorized?.status === 'rejected') throw unauthorized.reason;

    resultados.forEach((resultado, i) => {
      if (resultado.status === 'rejected') {
        const falha = this.descreverFalha(etapas[i].nome, resultado.reason);
        falhas.push(falha);
        console.warn(
          `[Sync] Etapa "${etapas[i].nome}" ignorada (HTTP ${falha.status ?? 'n/d'}): ${falha.motivo}`,
          resultado.reason
        );
      }
    });

    // Reaplicar as deduções locais só depois que saldos e seriais oficiais
    // estiverem gravados, senão a substituição atômica desfaz o trabalho offline.
    if (podeLogistica && estoqueId) {
      try {
        await this.reaplicarDeducoesPendentes(estoqueId);
      } catch (error) {
        falhas.push(this.descreverFalha('Saldos locais pendentes', error));
      }
    }
  }

  /**
   * Sincroniza as quantidades de saldo do estoque da equipe.
   */
  async syncSaldos(estoqueId?: string): Promise<void> {
    if (!estoqueId) return;

    const saldosData = await this.fetchAllPages<any>(`${this.baseUrl}/v1/saldos`, { idEstoque: estoqueId });

    const materiaisMap = new Map<string, MaterialLocal>();
    const saldos: SaldoLocal[] = [];

    saldosData.forEach(s => {
      if (s.material) {
        materiaisMap.set(s.material.id, {
          id: s.material.id,
          codigo: s.material.codigo,
          descricao: s.material.descricao,
          unidadeMedida: s.material.unidadeMedida,
          detalhaSerie: s.material.detalhaSerie
        });
      }
      saldos.push({
        id: s.id,
        idEstoque: s.estoque?.id,
        idMaterial: s.material?.id,
        quantidade: s.quantidade,
        ativo: s.ativo,
        condicao: s.condicao,
        ultimaMovimentacao: s.ultimaMovimentacao ?? null
      });
    });

    await this.dbService.bulkSaveMateriais(Array.from(materiaisMap.values()));

    // Substituição atômica de saldos
    await this.dbService.replaceSaldos(saldos);
  }

  /**
   * Sincroniza os números de série ativos no estoque da equipe.
   *
   * Separado de `syncSaldos` para que a falha de um não impeça o outro nem
   * pule a reconciliação das deduções pendentes.
   */
  async syncSeriais(estoqueId?: string): Promise<void> {
    if (!estoqueId) return;

    const seriaisData = await this.fetchAllPages<any>(`${this.baseUrl}/v1/saldos/seriais`, { idEstoque: estoqueId });
    const seriais: SaldoSerieLocal[] = seriaisData.map(ss => ({
      id: ss.id,
      idEstoque: ss.estoque?.id,
      idMaterial: ss.material?.id,
      numSerie: ss.numSerie,
      ativo: ss.ativo,
      condicao: ss.condicao,
      noSaldoDesde: ss.noSaldoDesde ?? null
    }));

    // Substituição atômica de seriais
    await this.dbService.replaceSaldosSeriais(seriais);
  }

  /**
   * Lança a inspeção respeitando a ordem exigida pela evidência fotográfica:
   * as fotos sobem **antes** do `POST /v1/sst/inspecoes`, uma requisição por
   * foto, e cada `idRemoto` é gravado assim que o 201 chega — foto já enviada
   * não sobe de novo se o lançamento falhar depois.
   *
   * Os `Blob`s só são liberados após o 201 do lançamento: até lá o `idRemoto`
   * pode ter sido expurgado pelo servidor (72 h) e o reenvio depende do binário
   * local.
   */
  private async processarInspecaoLancamento(item: OutboxItem): Promise<void> {
    const payload = item.payload ?? {};
    const request = sanitizarRegistrarInspecao(
      (payload.request ?? payload) as RegistrarInspecaoRequest
    );
    const anexos = (payload.anexosPendentes ?? []) as AnexoPendenteLocal[];
    const evidencias = (payload.evidencias ?? []) as EvidenciaLocal[];
    let response = payload.respostaServidor as InspecaoSegurancaResponse | undefined;

    if (!response?.id) {
      if (evidencias.length === 0) {
        throw Object.assign(
          new Error(SEM_EVIDENCIA_DETALHE),
          { status: 400, detail: SEM_EVIDENCIA_DETALHE }
        );
      }

      await this.subirEvidenciasInspecao(item, payload, evidencias);
      request.evidencias = this.idsEvidenciasEnviadas(evidencias);

      try {
        response = await this.enviarLancamentoInspecao(request, item.id);
      } catch (error) {
        // `404` numa evidência: a foto foi expurgada (rascunho parado por mais
        // de 72 h) ou descartada. Como o `Blob` continua retido, basta reenviar
        // as fotos e refazer o lançamento uma única vez.
        if (this.extrairStatus(error) !== 404) throw error;

        for (const evidencia of evidencias) {
          evidencia.idRemoto = null;
          evidencia.estado = 'LOCAL';
        }
        await this.persistirEvidenciasInspecao(item, payload, evidencias);
        await this.subirEvidenciasInspecao(item, payload, evidencias);
        request.evidencias = this.idsEvidenciasEnviadas(evidencias);
        // Chave distinta: depois do expurgo das fotos este é OUTRO pedido — carrega ids
        // de evidência novos. Reaproveitar a chave anterior faria o servidor recusá-lo
        // como reuso indevido, em vez de processá-lo.
        response = await this.enviarLancamentoInspecao(request, `${item.id}:reenvio`);
      }

      // Checkpoint durável: se a reconciliação local falhar depois do POST, a
      // próxima execução retoma daqui sem criar outra inspeção no servidor.
      await this.outboxService.updatePayload(item.id, {
        ...payload,
        evidencias,
        respostaServidor: response,
      });
    }

    const local = await this.dbService.getInspecao(item.id);
    if (local) {
      await this.dbService.deleteInspecao(item.id);
      await this.dbService.saveInspecao({
        ...local,
        id: response.id,
        idRemoto: response.id,
        idInspetor: response.idInspetor,
        status: response.status,
        dataRealizacao: response.dataRealizacao,
        observacoes: response.observacoes ?? undefined,
        latitude: response.latitude ?? undefined,
        longitude: response.longitude ?? undefined,
        statusSync: 'SINCRONIZADO',
        erroDetalhes: undefined,
        draftData: JSON.stringify({ respostas: response.respostas, desvios: response.desvios }),
        payload: undefined,
        anexosPendentes: anexos,
        // 201 recebido: as evidências estão vinculadas e permanentes no servidor,
        // então os `Blob`s locais podem ser liberados.
        evidencias: [],
        evidenciasRemotas: response.evidencias ?? [],
      });
    }

    for (const anexo of anexos) {
      const desvio = response.desvios.find(
        itemResponse => `${itemResponse.idPergunta}:${itemResponse.idOpcaoResposta}` === anexo.chaveDesvioLocal
      );
      if (desvio) {
        await this.outboxService.enqueue({
          endpoint: INSPECAO_ANEXO_ENDPOINT,
          method: 'POST',
          payload: { idInspecao: response.id, idDesvio: desvio.id, anexo },
        });
      }
    }

    await this.outboxService.updateStatus(item.id, 'SINCRONIZADO');
    await this.outboxService.discard(item.id);
  }

  /**
   * Sobe as evidências ainda pendentes, uma requisição por foto. Cada `idRemoto`
   * é persistido assim que o 201 chega, então uma falha no meio da fila (ou no
   * lançamento seguinte) não faz as fotos já enviadas subirem de novo.
   */
  private async subirEvidenciasInspecao(
    item: OutboxItem,
    payload: Record<string, unknown>,
    evidencias: EvidenciaLocal[]
  ): Promise<void> {
    for (const evidencia of evidencias) {
      if (evidencia.estado === 'ENVIADA' && evidencia.idRemoto) continue;

      evidencia.estado = 'ENVIANDO';
      evidencia.tentativas = (evidencia.tentativas ?? 0) + 1;

      try {
        const formData = new FormData();
        formData.append('arquivo', evidencia.arquivo, evidencia.nomeArquivo);
        // Sufixo pelo idLocal da foto: cada evidência é uma intenção distinta dentro do
        // mesmo item de outbox. O `idRemoto` já evitava o reenvio das que deram certo;
        // a chave cobre a janela que ele não alcança — a foto que o servidor gravou mas
        // cujo 201 se perdeu antes de ser persistido aqui.
        const resposta = await firstValueFrom(this.http.post<EvidenciaInspecaoResponse>(
          `${this.baseUrl}/v1/sst/inspecoes/anexos`, formData,
          this.opcoesDeEscrita(item.id, `evidencia:${evidencia.idLocal}`)
        ));
        if (!resposta?.id) {
          throw new Error('Resposta inválida do servidor ao enviar a evidência (id ausente).');
        }

        evidencia.idRemoto = resposta.id;
        evidencia.estado = 'ENVIADA';
        evidencia.erroDetalhes = null;
      } catch (error) {
        evidencia.estado = 'ERRO';
        evidencia.erroDetalhes = this.extrairDetalheErro(error)
          ?? 'Falha ao enviar a foto. Ela será reenviada automaticamente.';
        await this.persistirEvidenciasInspecao(item, payload, evidencias);
        // Marca a fase: uma queda de rede aqui é anterior ao lançamento, então
        // não existe risco de duplicidade e o item não pode virar
        // RESULTADO_INCERTO — ele apenas volta para a fila.
        throw Object.assign(error as object, { [FASE_EVIDENCIA]: true });
      }

      await this.persistirEvidenciasInspecao(item, payload, evidencias);
    }
  }

  private idsEvidenciasEnviadas(evidencias: EvidenciaLocal[]): string[] {
    return evidencias
      .map(evidencia => evidencia.idRemoto)
      .filter((id): id is string => !!id);
  }

  private async enviarLancamentoInspecao(
    request: RegistrarInspecaoRequest,
    idItem: string
  ): Promise<InspecaoSegurancaResponse> {
    // Este é o envio que originou o estado RESULTADO_INCERTO: uma queda de rede aqui
    // deixava em aberto se a inspeção havia sido criada, e a única saída era pedir ao
    // usuário que conferisse no servidor. Com a chave, o reenvio devolve a resposta do
    // lançamento original em vez de criar um segundo.
    const response = await firstValueFrom(this.http.post<InspecaoSegurancaResponse>(
      `${this.baseUrl}/v1/sst/inspecoes`, request, this.opcoesDeEscrita(idItem, 'lancamento')
    ));
    if (!response?.id) {
      throw new Error('Resposta inválida do servidor ao lançar inspeção (id ausente).');
    }
    return response;
  }

  /** Grava o progresso das fotos na fila e no registro local, para a UI acompanhar. */
  private async persistirEvidenciasInspecao(
    item: OutboxItem,
    payload: Record<string, unknown>,
    evidencias: EvidenciaLocal[]
  ): Promise<void> {
    await this.outboxService.updatePayload(item.id, { ...payload, evidencias });
    const local = await this.dbService.getInspecao(item.id);
    if (local) {
      await this.dbService.saveInspecao({ ...local, evidencias });
    }
  }

  private async processarAnexoInspecao(item: OutboxItem): Promise<void> {
    const payload = item.payload as {
      idInspecao: string;
      idDesvio: string;
      anexo: AnexoPendenteLocal;
    };
    const formData = new FormData();
    formData.append('arquivo', payload.anexo.arquivo, payload.anexo.nomeArquivo);
    await firstValueFrom(this.http.post(
      `${this.baseUrl}/v1/sst/inspecoes/${encodeURIComponent(payload.idInspecao)}`
        + `/desvios/${encodeURIComponent(payload.idDesvio)}/anexos`,
      formData,
      {
        params: { contexto: payload.anexo.contexto },
        ...this.opcoesDeEscrita(item.id, `anexo:${payload.anexo.idLocal}`)
      }
    ));

    const local = await this.dbService.getInspecao(payload.idInspecao);
    if (local?.anexosPendentes?.some(anexo => anexo.idLocal === payload.anexo.idLocal)) {
      await this.dbService.saveInspecao({
        ...local,
        anexosPendentes: local.anexosPendentes.filter(
          anexo => anexo.idLocal !== payload.anexo.idLocal
        ),
      });
    }

    await this.outboxService.updateStatus(item.id, 'SINCRONIZADO');
    await this.outboxService.discard(item.id);
  }



  /**
   * Transferências ainda na fila não constam do saldo que o servidor devolveu: deduz de novo
   * no aparelho, depois que saldos e séries oficiais foram gravados.
   */
  private async reaplicarDeducoesPendentes(idEstoque: string): Promise<void> {
    const pendentes = (await this.dbService.getTransferencias())
      .filter(t => t.statusSync === 'PENDENTE' && t.idEstoqueOrigem === idEstoque);
    for (const transf of pendentes) {
      for (const item of transf.itens) {
        await this.dbService.deduzirSaldoLocal(idEstoque, item.idMaterial, item.quantidade, item.condicao,
          item.numSerie ? [item.numSerie] : undefined);
      }
    }
  }

  /**
   * Utilitário para buscar todas as páginas de um endpoint paginado.
   */
  private async fetchAllPages<T>(url: string, params: any = {}): Promise<T[]> {
    let allContent: T[] = [];
    let currentPage = 0;
    let totalPages = 1;

    do {
      const response: any = await firstValueFrom(
        this.http.get<any>(url, {
          params: { ...params, page: currentPage, size: 500 },
          ...this.silentOpts
        })
      );
      if (!response) break;
      const content = response.content || (Array.isArray(response) ? response : []);
      if (Array.isArray(content)) {
        allContent = allContent.concat(content);
      }
      totalPages = response?.page?.totalPages ?? response?.totalPages ?? 1;
      currentPage++;
    } while (currentPage < totalPages && currentPage < 100);

    return allContent;
  }

  /**
   * Sincroniza o histórico de transferências da equipe.
   */
  async syncTransferencias(): Promise<void> {
    const estoqueId = this.tokenService.estoqueId();
    if (!estoqueId) return;

    // Busca transferências onde o estoque da equipe é origem ou destino
    // O backend agrupa por operação, o que é ideal para o histórico
    const data = await this.fetchAllPages<any>(`${this.baseUrl}/v1/movimentacoes-estoque`, {
      idEstoque: estoqueId,
      tipo: 'TRANSFERENCIA'
    });

    const locais: TransferenciaLocal[] = [];
    for (const item of data) {
      // Se o summary não tiver itens, buscamos o detalhe
      let itens = item.itens;
      let assinaturaEntregador = item.assinaturaEntregador;
      let assinaturaRecebedor = item.assinaturaRecebedor;
      if (!itens || itens.length === 0) {
        try {
          const detail = await firstValueFrom(
            this.http.get<any>(`${this.baseUrl}/v1/movimentacoes-estoque/operacao/${item.idReferenciaOperacao}`, this.silentOpts)
          );
          itens = detail.itens;
          assinaturaEntregador = detail.assinaturaEntregador ?? assinaturaEntregador;
          assinaturaRecebedor = detail.assinaturaRecebedor ?? assinaturaRecebedor;
        } catch {
          // Detalhe de uma operação isolada não impede o resto do histórico.
          console.warn(`Não foi possível carregar detalhes da operação ${item.idReferenciaOperacao}`);
          continue;
        }
      }

      const local: TransferenciaLocal = {
        id: item.idReferenciaOperacao,
        idEstoqueOrigem: item.estoqueOrigem?.id,
        idEstoqueDestino: item.estoqueDestino?.id,
        dataTransferencia: item.dataHora,
        statusSync: 'SINCRONIZADO',
        itens: (itens || []).map((i: any) => ({
          idMaterial: i.material?.id,
          quantidade: i.quantidade,
          condicao: i.condicao,
          numSerie: i.numSerie
        })),
        assinaturaEntregador,
        assinaturaRecebedor
      };

      locais.push(local);
    }

    await this.dbService.replaceTransferenciasSincronizadas(locais);
  }
}
