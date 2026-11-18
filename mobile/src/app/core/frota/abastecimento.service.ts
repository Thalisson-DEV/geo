import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { OutboxItem } from '../db/models';
import { silentContext } from '../http/http-context';
import { OutboxService } from '../sync/outbox.service';
import { ChecklistVeiculoService } from './checklist-veiculo.service';
import {
  AbastecimentoLocal,
  AbastecimentoServidor,
  CatalogoAbastecimento,
  FotoAbastecimentoLocal,
  RealizadoLocal,
  emAndamento,
  mesclarServidor,
  montarRealizado,
  montarSolicitacao
} from './abastecimento.models';

/** Endpoint sentinela da fila: cada item é uma operação (pedir, cancelar ou registrar) e as fotos dela. */
export const ABASTECIMENTO_ENDPOINT = '/_orchestrator/frota/abastecimento';
const CHAVE_CATALOGO = 'frota:abastecimento:catalogo';

type Operacao = 'SOLICITAR' | 'CANCELAR' | 'REALIZAR';

/**
 * Abastecimento no aparelho: catálogo para uso offline, rascunho gravado a cada toque, fila de envio
 * e o processamento da fila. O servidor não duplica: reenviar o mesmo pedido (id do aparelho), o mesmo
 * cancelamento, o mesmo realizado ou a mesma foto devolve o que já foi gravado.
 */
@Injectable({ providedIn: 'root' })
export class AbastecimentoService {
  private readonly http = inject(HttpClient);
  private readonly outbox = inject(OutboxService);
  private readonly frota = inject(ChecklistVeiculoService);
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly url = `${this.baseUrl}/v1/frota/app/abastecimento`;

  readonly catalogo = signal<CatalogoAbastecimento | null>(null);

  constructor() {
    void this.carregarCatalogoLocal();
  }

  /** Etapa da sincronização: catálogo e a situação dos pedidos (aprovado, liberado…). */
  async sincronizarCatalogo(): Promise<void> {
    const catalogo = await firstValueFrom(this.http.get<CatalogoAbastecimento>(`${this.url}/catalogo`, { context: silentContext() }));
    await db.config.put({ key: CHAVE_CATALOGO, value: catalogo });
    this.catalogo.set(catalogo);
    await this.atualizarDoServidor();
  }

  async carregarCatalogoLocal(): Promise<CatalogoAbastecimento | null> {
    const salvo = await db.config.get(CHAVE_CATALOGO);
    const catalogo = (salvo?.value as CatalogoAbastecimento | undefined) ?? null;
    this.catalogo.set(catalogo);
    return catalogo;
  }

  /** Pedidos do usuário e da equipe dele nos últimos dias, mesclados com o que está no aparelho. */
  async atualizarDoServidor(): Promise<void> {
    const lista = await firstValueFrom(this.http.get<AbastecimentoServidor[]>(`${this.url}/solicitacoes`, { context: silentContext() }));
    await db.transaction('rw', db.abastecimentos, async () => {
      for (const s of lista) {
        const local = await db.abastecimentos.get(s.idAparelho);
        // Rascunho de realizado/cancelamento ainda não enviado não é sobrescrito pelo servidor.
        await db.abastecimentos.put(mesclarServidor(local, s));
      }
    });
  }

  /** Foto que já está no servidor, para o detalhe (a do aparelho sai depois do envio). */
  async baixarFoto(id: string, idFoto: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.url}/solicitacoes/${id}/fotos/${idFoto}`, { responseType: 'blob', context: silentContext() }));
  }

  async listar(): Promise<AbastecimentoLocal[]> {
    return db.abastecimentos.toArray();
  }

  async buscar(id: string): Promise<AbastecimentoLocal | undefined> {
    return db.abastecimentos.get(id);
  }

  async rascunhoAtual(): Promise<AbastecimentoLocal | undefined> {
    return db.abastecimentos.where('statusSync').equals('RASCUNHO').first();
  }

  /** Pedido em andamento para o veículo (só um por vez). */
  async abertoDoVeiculo(idVeiculo: string, ignorar?: string): Promise<AbastecimentoLocal | undefined> {
    return (await db.abastecimentos.where('idVeiculo').equals(idVeiculo).toArray()).find((a) => a.id !== ignorar && emAndamento(a));
  }

  novoRascunho(): AbastecimentoLocal {
    return {
      id: crypto.randomUUID(),
      statusSync: 'RASCUNHO',
      passo: 1,
      idVeiculo: null,
      placa: null,
      idCondutor: null,
      condutorNome: null,
      idPosto: null,
      postoNome: null,
      medicao: null,
      observacao: '',
      itens: [],
      fotoPainel: null,
      solicitadoEm: null,
      criadoEm: new Date().toISOString()
    };
  }

  /** Grava o rascunho a cada mudança: o app pode ser fechado (ou morto pela câmera) a qualquer momento. */
  async salvar(a: AbastecimentoLocal): Promise<void> {
    await db.abastecimentos.put(a);
  }

  async descartar(id: string): Promise<void> {
    await db.abastecimentos.delete(id);
  }

  /** Recusado e sem conserto: sai do aparelho e da fila. */
  async descartarRecusado(id: string): Promise<void> {
    await db.transaction('rw', [db.abastecimentos, db.outbox], async () => {
      await db.outbox.delete(chave(id, 'SOLICITAR'));
      await db.abastecimentos.delete(id);
    });
    await this.outbox.updatePendingCount();
  }

  /** O pedido já está no servidor, mas a foto falhou: volta para a fila e tenta de novo. */
  async tentarDeNovo(id: string): Promise<void> {
    await db.abastecimentos.update(id, { statusSync: 'FILA', erro: null });
    await this.outbox.reenviar(chave(id, 'SOLICITAR'));
  }

  /** O servidor recusou o pedido: volta a ser rascunho para corrigir e enviar de novo. */
  async reabrir(id: string): Promise<boolean> {
    const a = await db.abastecimentos.get(id);
    if (!a || a.statusSync !== 'ERRO' || a.registrado) return false;
    const outro = await this.rascunhoAtual();
    if (outro && outro.id !== id) return false;
    await db.transaction('rw', [db.abastecimentos, db.outbox], async () => {
      await db.outbox.delete(chave(id, 'SOLICITAR'));
      await db.abastecimentos.update(id, { statusSync: 'RASCUNHO', erro: null, passo: 99 });
    });
    await this.outbox.updatePendingCount();
    return true;
  }

  /** Confirma o pedido: fica salvo no aparelho e enfileirado, na mesma transação. */
  async enfileirarPedido(a: AbastecimentoLocal): Promise<void> {
    const confirmado: AbastecimentoLocal = { ...a, statusSync: 'FILA', solicitadoEm: a.solicitadoEm ?? new Date().toISOString(), erro: null };
    await this.enfileirar(confirmado, 'SOLICITAR', confirmado.placa);
    await this.frota.registrarMedicaoLocal(confirmado.idVeiculo, confirmado.medicao);
  }

  /**
   * Cancela. Pedido que ainda nem saiu do aparelho sai da fila e fica como cancelado aqui mesmo;
   * o que já está no servidor vai pela fila.
   */
  async cancelar(a: AbastecimentoLocal, motivo: string): Promise<void> {
    if (!a.registrado) {
      await db.transaction('rw', [db.abastecimentos, db.outbox], async () => {
        await db.outbox.delete(chave(a.id, 'SOLICITAR'));
        await db.abastecimentos.put({ ...a, statusSync: 'ENVIADO', cancelamento: { statusSync: 'ENVIADO', motivo, erro: null },
          fotoPainel: a.fotoPainel ? { ...a.fotoPainel, arquivo: new Blob() } : null });
      });
      await this.outbox.updatePendingCount();
      return;
    }
    await this.enfileirar({ ...a, cancelamento: { statusSync: 'FILA', motivo, erro: null } }, 'CANCELAR', a.placa);
  }

  async salvarRealizado(a: AbastecimentoLocal, realizado: RealizadoLocal): Promise<void> {
    await db.abastecimentos.update(a.id, { realizado });
  }

  async enfileirarRealizado(a: AbastecimentoLocal, realizado: RealizadoLocal): Promise<void> {
    const confirmado: RealizadoLocal = { ...realizado, statusSync: 'FILA', realizadoEm: realizado.realizadoEm ?? new Date().toISOString(), erro: null };
    await this.enfileirar({ ...a, realizado: confirmado }, 'REALIZAR', a.placa);
    await this.frota.registrarMedicaoLocal(a.idVeiculo, confirmado.medicao);
  }

  /** Processamento do item da fila: a operação (uma vez) e as fotos que faltam. */
  async processarEnvio(item: OutboxItem): Promise<void> {
    const { id, operacao } = item.payload as { id: string; operacao: Operacao };
    const a = await db.abastecimentos.get(id);
    if (!a) {
      await this.concluirItem(item.id);
      return;
    }
    try {
      if (operacao === 'SOLICITAR') await this.enviarPedido(a);
      else if (operacao === 'CANCELAR') await this.enviarCancelamento(a);
      else await this.enviarRealizado(a);
    } catch (erro) {
      const status = (erro as { status?: number } | null)?.status;
      const recusado = status !== undefined && status >= 400 && status < 500 && ![401, 408, 425, 429].includes(status);
      await this.marcarFalha(id, operacao, recusado ? detalhe(erro) : null);
      throw erro;
    }
    await this.concluirItem(item.id);
  }

  private async enviarPedido(a: AbastecimentoLocal): Promise<void> {
    await db.abastecimentos.update(a.id, { statusSync: 'ENVIANDO' });
    let resposta: AbastecimentoServidor | null = a.servidor ?? null;
    if (!a.registrado) {
      resposta = await firstValueFrom(this.http.post<AbastecimentoServidor>(`${this.url}/solicitacoes`, montarSolicitacao(a), { context: silentContext() }));
      a = { ...a, registrado: true, servidor: resposta, aviso: resposta.medicaoValida ? null : resposta.motivoMedicao };
      await db.abastecimentos.put(a);
    }
    if (a.fotoPainel && !a.fotoPainel.enviada) {
      resposta = await this.subirFoto(a.id, a.fotoPainel);
      a = { ...a, fotoPainel: { ...a.fotoPainel, enviada: true }, servidor: resposta };
    }
    // A foto já está no servidor: o arquivo sai do aparelho, fica só o registro.
    await db.abastecimentos.put({ ...a, statusSync: 'ENVIADO', erro: null, fotoPainel: a.fotoPainel ? { ...a.fotoPainel, arquivo: new Blob() } : null });
  }

  private async enviarCancelamento(a: AbastecimentoLocal): Promise<void> {
    if (!a.registrado) throw aindaNaoChegou();
    const resposta = await firstValueFrom(this.http.post<AbastecimentoServidor>(`${this.url}/solicitacoes/${a.id}/cancelamento`,
      { motivo: a.cancelamento?.motivo?.trim() || null }, { context: silentContext() }));
    await db.abastecimentos.put(mesclarServidor({ ...a, cancelamento: { ...a.cancelamento!, statusSync: 'ENVIADO', erro: null } }, resposta));
  }

  private async enviarRealizado(a: AbastecimentoLocal): Promise<void> {
    if (!a.registrado) throw aindaNaoChegou();
    let r = a.realizado!;
    await db.abastecimentos.update(a.id, { realizado: { ...r, statusSync: 'ENVIANDO' } });
    let resposta = a.servidor!;
    if (!r.registrado) {
      resposta = await firstValueFrom(this.http.post<AbastecimentoServidor>(`${this.url}/solicitacoes/${a.id}/realizado`, montarRealizado(r),
        { context: silentContext() }));
      r = { ...r, registrado: true };
      await db.abastecimentos.update(a.id, { realizado: r, servidor: resposta, aviso: resposta.medicaoValida ? a.aviso : resposta.motivoMedicao });
    }
    for (const campo of ['fotoPainel', 'fotoCupom'] as const) {
      const foto = r[campo];
      if (!foto || foto.enviada) continue;
      resposta = await this.subirFoto(a.id, foto);
      r = { ...r, [campo]: { ...foto, enviada: true } };
      await db.abastecimentos.update(a.id, { realizado: r });
    }
    const leve = (f: FotoAbastecimentoLocal | null) => (f ? { ...f, arquivo: new Blob() } : null);
    await db.abastecimentos.update(a.id, {
      servidor: resposta,
      realizado: { ...r, statusSync: 'ENVIADO', erro: null, fotoPainel: leve(r.fotoPainel), fotoCupom: leve(r.fotoCupom) }
    });
  }

  private async subirFoto(id: string, foto: FotoAbastecimentoLocal): Promise<AbastecimentoServidor> {
    const formData = new FormData();
    formData.append('arquivo', foto.arquivo, foto.nomeArquivo);
    try {
      return await firstValueFrom(this.http.post<AbastecimentoServidor>(`${this.url}/solicitacoes/${id}/fotos/${foto.idFoto}`, formData,
        { context: silentContext() }));
    } catch (erro) {
      // 404: a foto não faz parte do pedido gravado. Segue sem ela, com a situação atual do servidor.
      if ((erro as { status?: number } | null)?.status !== 404) throw erro;
      const atual = await db.abastecimentos.get(id);
      return atual!.servidor!;
    }
  }

  private async enfileirar(a: AbastecimentoLocal, operacao: Operacao, placa: string | null): Promise<void> {
    await db.transaction('rw', [db.abastecimentos, db.outbox], async () => {
      await db.abastecimentos.put(a);
      await db.outbox.put({
        id: chave(a.id, operacao),
        endpoint: ABASTECIMENTO_ENDPOINT,
        method: 'POST',
        payload: { id: a.id, operacao },
        originalPayload: { id: a.id, operacao, placa },
        operationType: 'ABASTECIMENTO',
        status: 'PENDENTE',
        receiptStatus: 'QUEUED',
        tentativas: 0,
        criadoEm: new Date()
      } satisfies OutboxItem);
    });
    await this.outbox.updatePendingCount();
  }

  private async marcarFalha(id: string, operacao: Operacao, erro: string | null): Promise<void> {
    const a = await db.abastecimentos.get(id);
    if (!a) return;
    const status = erro ? 'ERRO' : 'FILA';
    if (operacao === 'SOLICITAR') await db.abastecimentos.update(id, { statusSync: status, erro });
    else if (operacao === 'CANCELAR' && a.cancelamento) await db.abastecimentos.update(id, { cancelamento: { ...a.cancelamento, statusSync: status, erro } });
    else if (a.realizado) await db.abastecimentos.update(id, { realizado: { ...a.realizado, statusSync: status, erro } });
  }

  private async concluirItem(idItem: string): Promise<void> {
    await this.outbox.updateStatus(idItem, 'SINCRONIZADO');
    await this.outbox.discard(idItem);
  }
}

function chave(id: string, operacao: Operacao): string {
  return `abastecimento:${id}:${operacao.toLowerCase()}`;
}

/** O pedido ainda não chegou ao servidor: a operação espera na fila (erro de rede, não recusa). */
function aindaNaoChegou(): Error & { status: number } {
  return Object.assign(new Error('O pedido ainda não chegou ao servidor.'), { status: 0 });
}

function detalhe(erro: unknown): string {
  const e = erro as { detail?: string; error?: { detail?: string }; message?: string } | null;
  return e?.detail ?? e?.error?.detail ?? 'O servidor recusou a operação.';
}
