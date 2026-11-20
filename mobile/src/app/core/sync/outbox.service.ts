import { Injectable, signal } from '@angular/core';
import { db } from '../db/app-db';
import { InspecaoLocal, OutboxItem } from '../db/models';

@Injectable({
  providedIn: 'root'
})
export class OutboxService {
  private readonly attachment413RecoveryKey = 'outbox:recover-inspecao-anexo-413:v1';
  private attachment413RecoveryPromise?: Promise<void>;

  /**
   * Signal que rastreia a contagem total de itens que precisam de atenção.
   */
  readonly pendingCount = signal<number>(0);

  /**
   * Signal que rastreia a contagem de itens com erro.
   */
  readonly errorCount = signal<number>(0);

  constructor() {
    void this.migrateLegacyItems();
    this.updatePendingCount();
  }

  /**
   * Adiciona um novo item à fila de outbox.
   */
  async enqueue(item: Omit<OutboxItem, 'id' | 'criadoEm' | 'status' | 'tentativas'>): Promise<string> {
    const id = crypto.randomUUID();
    const newItem: OutboxItem = {
      ...item,
      id,
      status: 'PENDENTE',
      receiptStatus: 'QUEUED',
      originalPayload: structuredClone(item.originalPayload ?? item.payload),
      tentativas: 0,
      criadoEm: new Date()
    };
    
    await db.outbox.add(newItem);
    await this.updatePendingCount();
    return id;
  }

  /**
   * Persiste a inspeção concluída e seu envio na mesma transação IndexedDB.
   * A remoção do rascunho também sofre rollback caso qualquer gravação falhe.
   */
  async enqueueInspecao(
    item: Omit<OutboxItem, 'id' | 'criadoEm' | 'status' | 'tentativas'>,
    inspecao: Omit<InspecaoLocal, 'id'>,
    draftId?: string
  ): Promise<string> {
    const id = crypto.randomUUID();
    const newItem: OutboxItem = {
      ...item,
      id,
      status: 'PENDENTE',
      receiptStatus: 'QUEUED',
      originalPayload: structuredClone(item.originalPayload ?? item.payload),
      tentativas: 0,
      criadoEm: new Date()
    };

    await db.transaction('rw', [db.outbox, db.inspecoes], async () => {
      if (draftId && draftId !== id) {
        await db.inspecoes.delete(draftId);
      }
      await db.inspecoes.add({ ...inspecao, id });
      await db.outbox.add(newItem);
    });

    await this.updatePendingCount();
    return id;
  }

  /**
   * Reivindica um item pendente para envio, de forma atômica. Devolve o item atual,
   * ou nada se ele saiu da fila (corrigido, descartado) ou não está mais pendente.
   * Depois disso o item não pode ser corrigido nem descartado no aparelho.
   */
  async reivindicarParaEnvio(id: string): Promise<OutboxItem | undefined> {
    return db.transaction('rw', db.outbox, async () => {
      const item = await db.outbox.get(id);
      if (!item || item.status !== 'PENDENTE' || item.receiptStatus === 'CONFLICT') return undefined;
      if (!item.envioIniciadoEm) {
        item.envioIniciadoEm = Date.now();
        await db.outbox.update(id, { envioIniciadoEm: item.envioIniciadoEm });
      }
      return item;
    });
  }

  /**
   * Retorna um item específico pelo ID.
   */
  async getById(id: string): Promise<OutboxItem | undefined> {
    return db.outbox.get(id);
  }

  /**
   * Retorna todos os itens pendentes ordenados por data de criação.
   */
  async getPendingItems(): Promise<OutboxItem[]> {
    await this.recoverAttachment413ErrorsOnce();
    const agora = Date.now();
    return db.outbox
      .where('status')
      .equals('PENDENTE')
      // CONFLICT pendente é versão substituída por correção (versões antigas do app).
      .filter(item => item.receiptStatus !== 'CONFLICT' && (!item.proximaTentativaEm || item.proximaTentativaEm <= agora))
      .sortBy('criadoEm');
  }

  /**
   * Adia o próximo reenvio de um item após falha do servidor (5xx):
   * 5 s, 10 s, 20 s… até 5 min, com variação de ±25% para que vários aparelhos
   * não voltem todos no mesmo segundo quando o servidor se recuperar.
   * Devolve o instante agendado.
   */
  async adiarNovaTentativa(id: string, tentativas: number, agora = Date.now(), aleatorio = Math.random()): Promise<number> {
    const em = agora + calcularEspera(tentativas, aleatorio);
    await db.outbox.update(id, { proximaTentativaEm: em });
    return em;
  }

  /**
   * Adia pelo tempo que o servidor pediu (429 com Retry-After). A folga de até 20% evita que
   * os aparelhos barrados juntos voltem todos no mesmo instante.
   */
  async adiarPor(id: string, esperaMs: number, agora = Date.now(), aleatorio = Math.random()): Promise<number> {
    const base = Math.min(ESPERA_MAX_MS, Math.max(1_000, Number.isFinite(esperaMs) ? esperaMs : ESPERA_BASE_MS));
    const em = agora + Math.round(base * (1 + Math.min(1, Math.max(0, aleatorio)) * 0.2));
    await db.outbox.update(id, { proximaTentativaEm: em });
    return em;
  }

  /** Menor instante agendado entre os pendentes adiados (para acordar a fila na hora certa). */
  async proximoReenvioAgendado(): Promise<number | null> {
    const agora = Date.now();
    let menor: number | null = null;
    await db.outbox.where('status').equals('PENDENTE').each(item => {
      if (item.proximaTentativaEm && item.proximaTentativaEm > agora && (menor === null || item.proximaTentativaEm < menor)) {
        menor = item.proximaTentativaEm;
      }
    });
    return menor;
  }

  async getUncertainItems(): Promise<OutboxItem[]> {
    return db.outbox.where('status').equals('RESULTADO_INCERTO').sortBy('criadoEm');
  }

  /**
   * Versoes anteriores eram servidas pelo limite padrao de 1 MB do Nginx.
   * Esses uploads recebiam 413 e ficavam em ERRO, portanto nao entravam mais
   * nas tentativas automaticas. Reativa apenas os anexos afetados, uma vez,
   * depois que o proxy passa a aceitar o limite de 15 MB da aplicacao.
   */
  private recoverAttachment413ErrorsOnce(): Promise<void> {
    return this.attachment413RecoveryPromise ??= this.recoverAttachment413Errors();
  }

  private async recoverAttachment413Errors(): Promise<void> {
    if ((await db.config.get(this.attachment413RecoveryKey))?.value === true) return;

    let recovered = 0;
    await db.transaction('rw', [db.outbox, db.config], async () => {
      // Protege tambem contra duas leituras concorrentes em abas diferentes.
      if ((await db.config.get(this.attachment413RecoveryKey))?.value === true) return;

      const blockedAttachments = await db.outbox
        .where('status')
        .equals('ERRO')
        .filter(item =>
          item.endpoint === '/_orchestrator/inspecao/anexo'
          && /(?:\b413\b|request entity too large|payload too large)/i.test(item.erroDetalhes ?? '')
        )
        .toArray();

      for (const item of blockedAttachments) {
        await db.outbox.update(item.id, {
          status: 'PENDENTE',
          tentativas: 0,
          erroDetalhes: undefined
        });
      }
      recovered = blockedAttachments.length;
      await db.config.put({ key: this.attachment413RecoveryKey, value: true });
    });

    if (recovered > 0) await this.updatePendingCount();
  }

  /**
   * Retorna itens que falharam (status ERRO).
   */
  async getErrorItems(): Promise<OutboxItem[]> {
    return db.outbox
      .where('status')
      .equals('ERRO')
      .sortBy('criadoEm');
  }

  /**
   * Atualiza o status e detalhes de erro de um item.
   */
  async updateStatus(id: string, status: OutboxItem['status'], erroDetalhes?: string): Promise<void> {
    await db.outbox.update(id, {
      status, erroDetalhes,
      ...(status === 'SINCRONIZADO' ? { receiptStatus: 'RESOLVED', proximaTentativaEm: undefined } : {}),
    });
    await this.updatePendingCount();
  }

  /** Volta um item recusado para a fila (depois de corrigida a causa), do zero. */
  async reenviar(id: string): Promise<void> {
    await db.outbox.update(id, { status: 'PENDENTE', erroDetalhes: undefined, tentativas: 0, proximaTentativaEm: undefined });
    await this.updatePendingCount();
  }

  /**
   * Incrementa o contador de tentativas de um item.
   */
  async incrementAttempt(id: string): Promise<number> {
    const item = await db.outbox.get(id);
    if (!item) return 0;

    const novasTentativas = (item.tentativas || 0) + 1;
    await db.outbox.update(id, { tentativas: novasTentativas });
    return novasTentativas;
  }

  /**
   * Atualiza o payload de um item da fila (usado em sync compostos
   * para registrar progresso parcial e permitir retomada idempotente).
   */
  async updatePayload(id: string, payload: any): Promise<void> {
    await db.outbox.update(id, { payload });
  }

  /**
   * Atualiza o endpoint de um item da fila (usado quando um ID temporário
   * é trocado por um ID real do servidor).
   */
  async updateEndpoint(id: string, endpoint: string): Promise<void> {
    await db.outbox.update(id, { endpoint });
  }

  /**
   * Determina se um item pode ser descartado localmente pelo aplicativo.
   * Regras:
   * 1. Se o item não existe, operação de descarte é considerada concluída (true).
   * 2. Se já foi sincronizado com sucesso ou resolvido pelo servidor, pode ser limpo (true).
   * 3. Se o resultado do envio é incerto ('RESULTADO_INCERTO'), NÃO pode descartar (false).
   * 4. Se já foi recebido/em conflito no servidor ou possui ID de operação no backoffice, NÃO pode descartar (false).
   * 5. Se já houve tentativas de envio ou está em erro que chegou ao servidor, NÃO pode descartar (false).
   * 6. Apenas itens locais que nunca tentaram envio (tentativas === 0, receiptStatus LOCAL/QUEUED/ausente, sem serverOperationId) podem ser descartados pelo mobile.
   */
  canDiscard(item?: OutboxItem | null): boolean {
    if (!item) return true;
    if (item.status === 'SINCRONIZADO' || item.receiptStatus === 'RESOLVED') {
      return true;
    }
    if (item.status === 'RESULTADO_INCERTO') {
      return false;
    }
    if (item.receiptStatus === 'RECEIVED' || item.receiptStatus === 'CONFLICT' || Boolean(item.serverOperationId)) {
      return false;
    }
    if ((item.tentativas || 0) > 0 || item.status === 'ERRO' || item.envioIniciadoEm) {
      return false;
    }
    return (!item.receiptStatus || item.receiptStatus === 'LOCAL' || item.receiptStatus === 'QUEUED') && !item.serverOperationId;
  }

  /**
   * Determina se um item pode ser editado localmente pela equipe no aplicativo.
   * Regras:
   * 1. Se não há item no outbox (rascunho local puro), pode editar (true).
   * 2. Se já foi sincronizado com sucesso ou resolvido, não pode editar como rascunho (false).
   * 3. Se o resultado é incerto, deve reconciliar primeiro; não pode editar (false).
   * 4. Se está no backoffice (RECEIVED/CONFLICT/serverOperationId ou erro após tentativa), não pode editar no mobile (false).
   * 5. Apenas registros locais ainda não tentados (tentativas === 0, LOCAL/QUEUED/ausente, sem serverOperationId) podem ser editados.
   */
  canEdit(item?: OutboxItem | null): boolean {
    if (!item) return true;
    if (item.status === 'SINCRONIZADO' || item.receiptStatus === 'RESOLVED') {
      return false;
    }
    if (item.status === 'RESULTADO_INCERTO') {
      return false;
    }
    if (item.receiptStatus === 'RECEIVED' || item.receiptStatus === 'CONFLICT' || Boolean(item.serverOperationId)) {
      return false;
    }
    if ((item.tentativas || 0) > 0 || item.status === 'ERRO' || item.envioIniciadoEm) {
      return false;
    }
    return (!item.receiptStatus || item.receiptStatus === 'LOCAL' || item.receiptStatus === 'QUEUED') && !item.serverOperationId;
  }

  /**
   * Verifica se o item foi recebido pelo servidor e está sendo tratado no backoffice / retido para reconciliação administrativa.
   */
  isEmTratamentoBackoffice(item?: OutboxItem | null): boolean {
    if (!item) return false;
    if (item.status === 'SINCRONIZADO' || item.receiptStatus === 'RESOLVED') {
      return false;
    }
    if (item.receiptStatus === 'RECEIVED' || item.receiptStatus === 'CONFLICT' || Boolean(item.serverOperationId)) {
      return true;
    }
    return item.status === 'ERRO' && ((item.tentativas || 0) > 0 || Boolean(item.erroDetalhes));
  }

  /**
   * Verifica se o envio do item teve resultado incerto (por exemplo, queda de rede/timeout durante a requisição).
   */
  isResultadoIncerto(item?: OutboxItem | null): boolean {
    return item?.status === 'RESULTADO_INCERTO';
  }

  /**
   * Remove um item do outbox (apenas quando permitido pelas regras de descarte).
   * Retorna true se o item foi removido, false se foi retido para preservar o histórico/backoffice.
   */
  async discard(id: string): Promise<boolean> {
    const item = await db.outbox.get(id);
    if (!item) return true;

    if (!this.canDiscard(item)) {
      await this.updatePendingCount();
      return false;
    }
    await db.outbox.delete(id);
    await this.updatePendingCount();
    return true;
  }

  /**
   * Atualiza o valor do signal pendingCount.
   */
  /** Reconta a fila; público para quem grava item e registro local na mesma transação. */
  async updatePendingCount(): Promise<void> {
    const [total, errors] = await Promise.all([
      db.outbox.where('status').anyOf(['PENDENTE', 'ERRO', 'RESULTADO_INCERTO']).count(),
      db.outbox.where('status').equals('ERRO').count()
    ]);
    
    this.pendingCount.set(total);
    this.errorCount.set(errors);
  }

  /**
   * Limpa todos os itens sincronizados.
   */
  async clearSyncedItems(): Promise<void> {
    await db.outbox.where('status').equals('SINCRONIZADO').delete();
  }

  /** Marca que o backend persistiu a intenção, mesmo quando o domínio ainda exige tratamento. */
  async markServerReceipt(
    id: string,
    receipt: { operationId?: string; status?: OutboxItem['receiptStatus']; detail?: string }
  ): Promise<void> {
    await db.outbox.update(id, {
      receiptStatus: receipt.status ?? 'RECEIVED',
      serverOperationId: receipt.operationId,
      erroDetalhes: receipt.detail
    });
    await this.updatePendingCount();
  }

  /** Migra itens criados por versões anteriores sem apagar payload ou erro original. */
  async migrateLegacyItems(): Promise<void> {
    await db.transaction('rw', db.outbox, async () => {
      const items = await db.outbox.toArray();
      for (const item of items) {
        const patch: Partial<OutboxItem> = {};
        if (!item.receiptStatus) patch.receiptStatus = item.status === 'SINCRONIZADO' ? 'RESOLVED' : 'QUEUED';
        if (item.originalPayload === undefined) patch.originalPayload = structuredClone(item.payload);
        if (item.status === 'PENDENTE' && item.receiptStatus === 'CONFLICT') {
          // Versões antigas do app marcavam a versão corrigida assim e a deixavam na
          // fila, e o sync enviava as duas. Nunca tentada: sai da fila. Já tentada:
          // pode estar no servidor, então fica retida para o administrativo conferir.
          if (!(item.tentativas > 0) && !item.serverOperationId) {
            await db.outbox.delete(item.id);
            continue;
          }
          patch.status = 'ERRO';
          patch.erroDetalhes = 'Versão anterior de um registro corrigido no aparelho. Confira se não ficou duplicado.';
        }
        if (Object.keys(patch).length) await db.outbox.update(item.id, patch);
      }
    });
    await this.updatePendingCount();
  }
}

export const ESPERA_BASE_MS = 5_000;
export const ESPERA_MAX_MS = 5 * 60_000;

/** Espera exponencial com variação: 5 s · 2^(n-1), teto de 5 min, ±25%. */
export function calcularEspera(tentativas: number, aleatorio: number): number {
  const base = Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * 2 ** Math.max(0, tentativas - 1));
  const variacao = 0.75 + Math.min(1, Math.max(0, aleatorio)) * 0.5;
  return Math.round(base * variacao);
}
