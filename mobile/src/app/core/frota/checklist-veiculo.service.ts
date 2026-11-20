import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { OutboxItem } from '../db/models';
import { silentContext } from '../http/http-context';
import { OutboxService } from '../sync/outbox.service';
import {
  CatalogoChecklist,
  ChecklistAppItem,
  ChecklistDetalheServidor,
  ChecklistVeiculoLocal,
  montarRequest,
  todasAsFotos
} from './checklist-veiculo.models';

/** Endpoint sentinela da fila: lança o checklist e depois sobe as fotos, uma a uma. */
export const CHECKLIST_LANCAR_ENDPOINT = '/_orchestrator/frota/checklist';
const CHAVE_CATALOGO = 'frota:checklist:catalogo';

interface ChecklistRegistradoResponse {
  id: string;
  passagemVeiculo: boolean;
  medicaoValida: boolean;
  motivoMedicao: string | null;
  fotosPendentes: string[];
}

/**
 * Checklist do veículo no aparelho: catálogo para uso offline, rascunho gravado a cada toque,
 * fila de envio e o processamento da fila (o checklist primeiro, as fotos depois). O servidor
 * não duplica: reenviar o mesmo checklist ou a mesma foto devolve o que já foi gravado.
 */
@Injectable({ providedIn: 'root' })
export class ChecklistVeiculoService {
  private readonly http = inject(HttpClient);
  private readonly outbox = inject(OutboxService);
  private readonly baseUrl = environment.apiBaseUrl;

  readonly catalogo = signal<CatalogoChecklist | null>(null);

  constructor() {
    void this.carregarCatalogoLocal();
  }

  /** Etapa da sincronização: baixa o catálogo e guarda no aparelho. */
  async sincronizarCatalogo(): Promise<void> {
    const catalogo = normalizarCatalogo(await firstValueFrom(
      this.http.get<Partial<CatalogoChecklist>>(`${this.baseUrl}/v1/frota/app/checklist/catalogo`, { context: silentContext() })
    ));
    await db.config.put({ key: CHAVE_CATALOGO, value: catalogo });
    this.catalogo.set(catalogo);
  }

  async carregarCatalogoLocal(): Promise<CatalogoChecklist | null> {
    const salvo = await db.config.get(CHAVE_CATALOGO);
    const catalogo = salvo?.value ? normalizarCatalogo(salvo.value as Partial<CatalogoChecklist>) : null;
    this.catalogo.set(catalogo);
    return catalogo;
  }

  // ── Consulta no servidor (precisa de sinal) ──────────────────────────────

  /** Os que a pessoa preencheu nos últimos dias, em qualquer aparelho. */
  async meusNoServidor(dias = 30): Promise<ChecklistAppItem[]> {
    const itens = await firstValueFrom(this.http.get<ChecklistAppItem[]>(`${this.baseUrl}/v1/frota/app/checklists`,
      { params: { dias }, context: silentContext() }));
    await this.guardarIdsServidor(itens);
    return itens;
  }

  /** Os últimos checklists do veículo, de qualquer pessoa: como ele foi entregue. */
  async doVeiculo(idVeiculo: string): Promise<ChecklistAppItem[]> {
    const itens = await firstValueFrom(this.http.get<ChecklistAppItem[]>(`${this.baseUrl}/v1/frota/app/checklists/veiculo/${idVeiculo}`,
      { context: silentContext() }));
    await this.guardarIdsServidor(itens);
    return itens;
  }

  /** Registros enviados antes de o app guardar o id do servidor: completa pelo que a consulta trouxe. */
  private async guardarIdsServidor(itens: ChecklistAppItem[]): Promise<void> {
    for (const i of itens) {
      const local = await db.checklistsVeiculo.get(i.idAparelho);
      if (local && !local.idServidor) await db.checklistsVeiculo.update(i.idAparelho, { idServidor: i.checklist.id });
    }
  }

  /** Detalhe pelo id do servidor: respostas, fotos e a decisão do gestor em cada Não OK. */
  async detalhar(idServidor: string): Promise<ChecklistDetalheServidor> {
    return firstValueFrom(this.http.get<ChecklistDetalheServidor>(`${this.baseUrl}/v1/frota/app/checklists/${idServidor}`,
      { context: silentContext() }));
  }

  async baixarFoto(idServidor: string, idFoto: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.baseUrl}/v1/frota/app/checklists/${idServidor}/fotos/${idFoto}`,
      { responseType: 'blob', context: silentContext() }));
  }

  async listar(): Promise<ChecklistVeiculoLocal[]> {
    const todos = await db.checklistsVeiculo.toArray();
    return todos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async buscar(id: string): Promise<ChecklistVeiculoLocal | undefined> {
    return db.checklistsVeiculo.get(id);
  }

  /** O rascunho em andamento, se houver (um por vez). */
  async rascunhoAtual(): Promise<ChecklistVeiculoLocal | undefined> {
    return db.checklistsVeiculo.where('statusSync').equals('RASCUNHO').first();
  }

  novoRascunho(): ChecklistVeiculoLocal {
    return {
      id: crypto.randomUUID(),
      statusSync: 'RASCUNHO',
      passo: 1,
      idVeiculo: null,
      placa: null,
      idModelo: null,
      idsModelosAdicionais: [],
      idCondutor: null,
      condutorNome: null,
      preenchidoEm: null,
      medicao: null,
      comentario: '',
      assinado: false,
      respostas: [],
      fotosRecebimento: [],
      criadoEm: new Date().toISOString()
    };
  }

  /** Grava o rascunho a cada mudança: o app pode ser fechado (ou morto pela câmera) a qualquer momento. */
  async salvarRascunho(checklist: ChecklistVeiculoLocal): Promise<void> {
    await db.checklistsVeiculo.put(checklist);
  }

  async descartar(id: string): Promise<void> {
    await db.checklistsVeiculo.delete(id);
  }

  /**
   * O servidor recusou: o checklist volta a ser rascunho (e sai da fila) para a pessoa corrigir
   * e enviar de novo. Só um rascunho por vez; devolve `false` se já houver outro em andamento.
   */
  async reabrir(id: string): Promise<boolean> {
    const checklist = await db.checklistsVeiculo.get(id);
    if (!checklist || checklist.statusSync !== 'ERRO' || checklist.registrado) return false;
    const outro = await this.rascunhoAtual();
    if (outro && outro.id !== id) return false;
    await db.transaction('rw', [db.checklistsVeiculo, db.outbox], async () => {
      await db.outbox.delete(id);
      // Abre na conferência: o passo é limitado ao último da tela.
      await db.checklistsVeiculo.update(id, { statusSync: 'RASCUNHO', erro: null, passo: 99 });
    });
    await this.outbox.updatePendingCount();
    return true;
  }

  /** Já gravado no servidor, mas uma foto falhou: volta para a fila e tenta de novo. */
  async tentarDeNovo(id: string): Promise<void> {
    await db.checklistsVeiculo.update(id, { statusSync: 'FILA', erro: null });
    await this.outbox.reenviar(id);
  }

  /** Recusado pelo servidor e sem conserto: sai do aparelho e da fila. */
  async descartarRecusado(id: string): Promise<void> {
    await db.transaction('rw', [db.checklistsVeiculo, db.outbox], async () => {
      await db.outbox.delete(id);
      await db.checklistsVeiculo.delete(id);
    });
    await this.outbox.updatePendingCount();
  }

  /** Confirma: o checklist fica salvo no aparelho e enfileirado, na mesma transação. */
  async enfileirar(checklist: ChecklistVeiculoLocal): Promise<void> {
    const confirmado: ChecklistVeiculoLocal = {
      ...checklist,
      statusSync: 'FILA',
      preenchidoEm: checklist.preenchidoEm ?? new Date().toISOString(),
      erro: null
    };
    await db.transaction('rw', [db.checklistsVeiculo, db.outbox], async () => {
      await db.checklistsVeiculo.put(confirmado);
      await db.outbox.add({
        id: confirmado.id,
        endpoint: CHECKLIST_LANCAR_ENDPOINT,
        method: 'POST',
        payload: { idChecklist: confirmado.id },
        originalPayload: { idChecklist: confirmado.id, placa: confirmado.placa },
        operationType: 'CHECKLIST_VEICULO',
        status: 'PENDENTE',
        receiptStatus: 'QUEUED',
        tentativas: 0,
        criadoEm: new Date()
      } satisfies OutboxItem);
    });
    await this.outbox.updatePendingCount();
    await this.registrarMedicaoLocal(confirmado.idVeiculo, confirmado.medicao);
  }

  /**
   * Leva a medição enviada para o catálogo do aparelho: o próximo registro do veículo já trava
   * a partir dela, mesmo antes de o catálogo voltar do servidor (ou sem internet).
   */
  async registrarMedicaoLocal(idVeiculo: string | null | undefined, medicao: number | null | undefined): Promise<void> {
    const catalogo = this.catalogo() ?? (await this.carregarCatalogoLocal());
    if (!catalogo || !idVeiculo || medicao == null) return;
    const veiculo = catalogo.veiculos.find((v) => v.idVeiculo === idVeiculo);
    if (!veiculo || (veiculo.medicaoAtual != null && veiculo.medicaoAtual >= medicao)) return;
    const atualizado: CatalogoChecklist = {
      ...catalogo,
      veiculos: catalogo.veiculos.map((v) => (v.idVeiculo === idVeiculo ? { ...v, medicaoAtual: medicao } : v))
    };
    await db.config.put({ key: CHAVE_CATALOGO, value: atualizado });
    this.catalogo.set(atualizado);
  }

  /** Processamento do item da fila: lança (uma vez) e sobe as fotos que faltam. */
  async processarEnvio(item: OutboxItem): Promise<void> {
    const checklist = await db.checklistsVeiculo.get((item.payload as { idChecklist: string }).idChecklist);
    if (!checklist) {
      await this.outbox.updateStatus(item.id, 'SINCRONIZADO');
      await this.outbox.discard(item.id);
      return;
    }
    await db.checklistsVeiculo.update(checklist.id, { statusSync: 'ENVIANDO' });
    try {
      if (!checklist.registrado) {
        const resposta = await firstValueFrom(this.http.post<ChecklistRegistradoResponse>(
          `${this.baseUrl}/v1/frota/app/checklists`, montarRequest(checklist), { context: silentContext() }
        ));
        checklist.registrado = true;
        checklist.idServidor = resposta.id;
        checklist.aviso = resposta.medicaoValida ? null : resposta.motivoMedicao;
        checklist.fotosEsperadas = resposta.fotosPendentes;
        await db.checklistsVeiculo.update(checklist.id, {
          registrado: true, idServidor: resposta.id, aviso: checklist.aviso, fotosEsperadas: checklist.fotosEsperadas
        });
      }
      for (const foto of todasAsFotos(checklist)) {
        // O servidor decide a troca de condutor: foto de recebimento que ele não pediu não sobe.
        if (foto.enviada || (checklist.fotosEsperadas && !checklist.fotosEsperadas.includes(foto.idFoto))) continue;
        const formData = new FormData();
        formData.append('arquivo', foto.arquivo, foto.nomeArquivo);
        try {
          await firstValueFrom(this.http.post(
            `${this.baseUrl}/v1/frota/app/checklists/${checklist.id}/fotos/${foto.idFoto}`, formData, { context: silentContext() }
          ));
        } catch (erro) {
          // 404: a foto não faz parte do checklist gravado (ex.: não houve troca de condutor). Segue sem ela.
          if ((erro as { status?: number } | null)?.status !== 404) throw erro;
        }
        foto.enviada = true;
        await db.checklistsVeiculo.put(checklist);
      }
    } catch (erro) {
      const status = (erro as { status?: number } | null)?.status;
      const recusado = status !== undefined && status >= 400 && status < 500 && ![401, 408, 425, 429].includes(status);
      await db.checklistsVeiculo.update(checklist.id, {
        statusSync: recusado ? 'ERRO' : 'FILA',
        erro: recusado ? detalhe(erro) : null
      });
      throw erro;
    }
    // As fotos já estão no servidor: os arquivos saem do aparelho, fica só o registro.
    await db.checklistsVeiculo.put({
      ...checklist,
      statusSync: 'ENVIADO',
      erro: null,
      respostas: checklist.respostas.map((r) => ({ ...r, fotos: r.fotos.map((f) => ({ ...f, arquivo: new Blob() })) })),
      fotosRecebimento: checklist.fotosRecebimento.map((f) => ({ ...f, foto: { ...f.foto, arquivo: new Blob() } }))
    });
    await this.outbox.updateStatus(item.id, 'SINCRONIZADO');
    await this.outbox.discard(item.id);
  }
}

function detalhe(erro: unknown): string {
  const e = erro as { detail?: string; error?: { detail?: string }; message?: string } | null;
  return e?.detail ?? e?.error?.detail ?? 'O servidor recusou o checklist.';
}

/**
 * Catálogo sempre com as listas presentes: resposta parcial (ou de uma versão antiga do servidor) não pode
 * quebrar a abertura do turno, que lê `veiculos` para saber se o veículo exige checklist.
 */
export function normalizarCatalogo(c: Partial<CatalogoChecklist> | null | undefined): CatalogoChecklist {
  return {
    geradoEm: c?.geradoEm ?? new Date(0).toISOString(),
    modelos: c?.modelos ?? [],
    veiculos: c?.veiculos ?? [],
    condutores: c?.condutores ?? [],
    liberacoesCnh: c?.liberacoesCnh ?? [],
  };
}
