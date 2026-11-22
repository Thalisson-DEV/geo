import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { OutboxItem } from '../db/models';
import { OutboxService } from '../sync/outbox.service';
import { TurnoService } from '../turno/turno.service';
import { ArquivosCampoService } from './arquivos-campo.service';
import { LocalizacaoService, Posicao } from './localizacao.service';
import { hojeLocal } from './obras-regras';
import { PREFIXO_AVULSA } from './pacote-obras.service';
import { CampoDoAparelho, EnvioObra, RegistroObraLocal, TipoRegistroObra } from './obras.models';

/** Endpoint sentinela da fila: o item da fila só aponta o registro; quem envia é este serviço. */
export const OBRAS_ENDPOINT = '/_obras/registro';
const DURAVEL = '/v1/sincronizacao/operacoes';

/** Resposta do envio durável (`OperacaoResponse`). */
interface RespostaDuravel {
  status: 'SALVO_NO_SERVIDOR' | 'EM_TRATAMENTO' | 'RESOLVIDO' | 'REJEITADO';
  motivo?: string | null;
  idCaso?: string | null;
  idsRegistros?: string[];
}

/** Erro de envio que deve deixar o item na fila (rede, 5xx): a fila do app trata como as demais. */
export class FalhaDeEnvioObras extends Error {
  constructor(readonly status: number | undefined, mensagem: string) {
    super(mensagem);
  }
}

export interface NovoRegistro {
  tipo: TipoRegistroObra;
  idObra?: string | null;
  idProgramacao?: string | null;
  idPonto?: string | null;
  dependeDe?: string | null;
  /** O comando sem o `campo` (preenchido aqui com id, hora e GPS). */
  comando: Record<string, unknown>;
  arquivo?: { blob: Blob; nome: string; tipo: string } | null;
  /** Já com a posição (a foto do carimbo pegou o GPS); sem ela, pega agora. */
  posicao?: Posicao | null;
  /** Id já reservado (o código impresso no carimbo da foto sai dele); sem ele, gera um. */
  id?: string;
}

/**
 * Registros de Obras lançados no aparelho: gravados no IndexedDB na hora (nada se perde sem sinal) e enviados pela fila,
 * na ordem de criação, pelo envio durável (`OBRA_*`). A APR vai antes dos apontamentos que ela libera; se ela for
 * recusada, os dependentes esperam com o motivo. Recusa do servidor vira "conflito" com o motivo traduzido.
 */
@Injectable({ providedIn: 'root' })
export class RegistrosObrasService {
  private readonly http = inject(HttpClient);
  private readonly outbox = inject(OutboxService);
  private readonly turno = inject(TurnoService);
  private readonly gps = inject(LocalizacaoService);
  private readonly arquivos = inject(ArquivosCampoService);
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly injector = inject(Injector);

  readonly registros = signal<RegistroObraLocal[]>([]);
  readonly doDia = computed(() => this.registros().filter(r => r.dia === hojeLocal()));
  readonly pendentes = computed(() => this.registros().filter(r => r.envio !== 'ENVIADO').length);
  readonly conflitos = computed(() => this.registros().filter(r => r.envio === 'CONFLITO' || r.envio === 'AGUARDANDO'));

  async carregar(): Promise<void> {
    this.registros.set(await db.obrasRegistros.orderBy('criadoEm').toArray());
  }

  /** Grava o registro e o põe na fila. Devolve o id do aparelho. */
  async registrar(novo: NovoRegistro): Promise<RegistroObraLocal> {
    const idLocal = novo.id ?? crypto.randomUUID();
    const posicao = novo.posicao !== undefined ? novo.posicao : await this.gps.agora(3000);
    const agora = new Date();
    const campo: CampoDoAparelho = {
      idLocal,
      idTurno: this.turno.turnoAtivo()?.id ?? null,
      instante: isoComFuso(agora),
      latitude: posicao?.latitude ?? null,
      longitude: posicao?.longitude ?? null,
      precisao: posicao?.precisao ?? null,
    };
    // Execução avulsa: a programação é do aparelho; o servidor recebe a obra e monta a programação avulsa dele.
    const avulsa = !!novo.idProgramacao?.startsWith(PREFIXO_AVULSA);
    const comando = avulsa ? { ...novo.comando, idProgramacao: null, idObra: novo.idObra ?? null } : novo.comando;
    let arquivo: RegistroObraLocal['arquivo'] = null;
    if (novo.arquivo) {
      const chave = `foto/${idLocal}`;
      await this.arquivos.gravar(chave, novo.arquivo.blob);
      arquivo = { chave, nome: novo.arquivo.nome, tipo: novo.arquivo.tipo };
    }
    const registro: RegistroObraLocal = {
      id: idLocal, tipo: novo.tipo, idObra: novo.idObra ?? null, idProgramacao: novo.idProgramacao ?? null,
      idPonto: novo.idPonto ?? null, dependeDe: novo.dependeDe ?? null,
      comando: { ...comando, campo }, arquivo, envio: 'NO_APARELHO', criadoEm: agora.toISOString(), dia: hojeLocal(agora),
    };
    await db.transaction('rw', [db.obrasRegistros, db.outbox], async () => {
      await db.obrasRegistros.add(registro);
      await this.outbox.enqueue({ endpoint: OBRAS_ENDPOINT, method: 'POST', payload: { idRegistro: idLocal, tipo: novo.tipo }, operationType: `OBRA_${novo.tipo}` });
    });
    await this.carregar();
    this.enviarLogo();
    return registro;
  }

  /** Envio a cada lançamento (o iPhone não tem sincronização em segundo plano). Sem rede, a fila espera. */
  private enviarLogo(): void {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    setTimeout(() => {
      void import('../sync/sync.service').then(({ SyncService }) => this.injector.get(SyncService).syncOutbox().catch(() => undefined));
    }, 300);
  }

  /** Desfaz um registro que ainda não saiu do aparelho (o "Desfazer" do toast). */
  async desfazer(idLocal: string): Promise<boolean> {
    const r = await db.obrasRegistros.get(idLocal);
    if (!r || r.envio !== 'NO_APARELHO') return false;
    const itens = (await db.outbox.toArray()).filter(i => i.endpoint === OBRAS_ENDPOINT && i.payload?.idRegistro === idLocal && !i.envioIniciadoEm);
    if (!itens.length) return false;
    await db.transaction('rw', [db.obrasRegistros, db.outbox], async () => {
      await db.outbox.bulkDelete(itens.map(i => i.id));
      await db.obrasRegistros.delete(idLocal);
    });
    if (r.arquivo) await this.arquivos.apagar(r.arquivo.chave);
    await this.outbox.updatePendingCount?.();
    await this.carregar();
    return true;
  }

  /**
   * Envia um item da fila de Obras. Rede/5xx: lança `FalhaDeEnvioObras` e a fila tenta de novo. Recusa de negócio:
   * o registro vira conflito (o servidor guardou o caso para o backoffice) e o item sai da fila.
   */
  async processarEnvio(item: OutboxItem): Promise<void> {
    const registro = await db.obrasRegistros.get(item.payload?.idRegistro);
    if (!registro) {
      await this.outbox.discard(item.id);
      return;
    }
    if (registro.dependeDe) {
      const dependencia = await db.obrasRegistros.get(registro.dependeDe);
      if (dependencia && (dependencia.envio === 'CONFLITO' || dependencia.envio === 'AGUARDANDO')) {
        await this.marcar(registro.id, 'AGUARDANDO', `Aguardando a APR: ${dependencia.motivo ?? 'ela foi recusada pelo servidor.'}`);
        await this.outbox.updateStatus(item.id, 'ERRO', 'Aguardando a APR do dia.');
        return;
      }
      if (dependencia && dependencia.envio !== 'ENVIADO') {
        throw new FalhaDeEnvioObras(0, 'A APR do dia ainda não foi enviada.');
      }
    }
    await this.marcar(registro.id, 'ENVIANDO');
    const anexos = await this.anexos(registro);
    let resposta: RespostaDuravel;
    try {
      resposta = await firstValueFrom(this.http.post<RespostaDuravel>(`${this.baseUrl}${DURAVEL}`, {
        idOperacaoLocal: registro.id,
        idRegistroLocal: registro.id,
        tipo: `OBRA_${registro.tipo}`,
        instanteOrigem: registro.comando.campo.instante,
        payload: registro.comando,
        anexos,
      }, { headers: { 'Idempotency-Key': registro.id, 'X-Silent-Error': 'true' } }));
    } catch (e) {
      await this.marcar(registro.id, 'NO_APARELHO');
      const status = (e as { status?: number })?.status;
      throw Object.assign(new FalhaDeEnvioObras(status, (e as { detail?: string })?.detail ?? 'Falha ao enviar.'), { status, detail: (e as { detail?: string })?.detail });
    }
    if (resposta.status === 'RESOLVIDO') {
      await this.marcar(registro.id, 'ENVIADO', null, new Date().toISOString());
      if (registro.arquivo) await this.arquivos.apagar(registro.arquivo.chave);
      await this.outbox.updateStatus(item.id, 'SINCRONIZADO');
      await this.outbox.discard(item.id);
      // Os que esperavam por este registro voltam para a fila.
      await this.liberarDependentes(registro.id);
      return;
    }
    await this.marcar(registro.id, 'CONFLITO', resposta.motivo ?? 'O servidor recusou o registro; o escritório foi avisado.');
    await this.outbox.markServerReceipt?.(item.id, { operationId: resposta.idCaso ?? undefined, status: 'RECEIVED', detail: resposta.motivo ?? undefined });
    await this.outbox.updateStatus(item.id, 'SINCRONIZADO');
    await this.outbox.discard(item.id);
  }

  /** Conflito resolvido pela equipe ("Refazer"): descarta o registro recusado. */
  /**
   * Manda de novo um registro recusado (o motivo pode ter sido resolvido no servidor ou pela supervisão): sai numa
   * operação nova da fila, com o mesmo id do aparelho, então não duplica se o primeiro envio tiver chegado.
   */
  async reenviarConflito(idLocal: string): Promise<void> {
    const r = await db.obrasRegistros.get(idLocal);
    if (!r || (r.envio !== 'CONFLITO' && r.envio !== 'AGUARDANDO')) return;
    const itens = (await db.outbox.toArray()).filter(i => i.endpoint === OBRAS_ENDPOINT && i.payload?.idRegistro === idLocal);
    await db.transaction('rw', [db.obrasRegistros, db.outbox], async () => {
      await db.outbox.bulkDelete(itens.map(i => i.id));
      await db.obrasRegistros.update(idLocal, { envio: 'NO_APARELHO', motivo: null });
      await this.outbox.enqueue({ endpoint: OBRAS_ENDPOINT, method: 'POST', payload: { idRegistro: idLocal, tipo: r.tipo }, operationType: `OBRA_${r.tipo}` });
    });
    await this.carregar();
    this.enviarLogo();
  }

  async descartarConflito(idLocal: string): Promise<void> {
    const r = await db.obrasRegistros.get(idLocal);
    if (!r || (r.envio !== 'CONFLITO' && r.envio !== 'AGUARDANDO')) return;
    const itens = (await db.outbox.toArray()).filter(i => i.endpoint === OBRAS_ENDPOINT && i.payload?.idRegistro === idLocal);
    await db.transaction('rw', [db.obrasRegistros, db.outbox], async () => {
      await db.outbox.bulkDelete(itens.map(i => i.id));
      await db.obrasRegistros.delete(idLocal);
    });
    if (r.arquivo) await this.arquivos.apagar(r.arquivo.chave);
    await this.carregar();
  }

  /** Limpeza: registros enviados de dias anteriores saem do aparelho (o servidor já tem). */
  async limparEnviados(diasParaManter = 2): Promise<void> {
    const limite = hojeLocal(new Date(Date.now() - diasParaManter * 86_400_000));
    const velhos = (await db.obrasRegistros.toArray()).filter(r => r.envio === 'ENVIADO' && r.dia < limite).map(r => r.id);
    if (velhos.length) await db.obrasRegistros.bulkDelete(velhos);
    await this.carregar();
  }

  private async liberarDependentes(id: string): Promise<void> {
    const dependentes = (await db.obrasRegistros.toArray()).filter(r => r.dependeDe === id && r.envio === 'AGUARDANDO');
    for (const d of dependentes) {
      await this.marcar(d.id, 'NO_APARELHO', null);
      const itens = (await db.outbox.toArray()).filter(i => i.endpoint === OBRAS_ENDPOINT && i.payload?.idRegistro === d.id);
      for (const i of itens) await this.outbox.updateStatus(i.id, 'PENDENTE', 'Na fila.');
    }
  }

  private async anexos(r: RegistroObraLocal): Promise<unknown[]> {
    if (!r.arquivo) return [];
    const blob = await this.arquivos.ler(r.arquivo.chave);
    if (!blob) return [];
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [{
      idLocal: r.id,
      nome: r.arquivo.nome,
      contentType: r.arquivo.tipo || 'image/jpeg',
      sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''),
      conteudoBase64: base64(bytes),
    }];
  }

  private async marcar(id: string, envio: EnvioObra, motivo?: string | null, enviadoEm?: string): Promise<void> {
    await db.obrasRegistros.update(id, { envio, ...(motivo !== undefined ? { motivo } : {}), ...(enviadoEm ? { enviadoEm } : {}) });
    await this.carregar();
  }
}

/** ISO com o fuso do aparelho (o servidor guarda a hora como a equipe viu). */
export function isoComFuso(d: Date): string {
  const p = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `.${String(d.getMilliseconds()).padStart(3, '0')}${sinal}${p(off / 60)}:${p(off % 60)}`;
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}
