import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { silentContext } from '../http/http-context';
import { ChecklistVeiculoService } from './checklist-veiculo.service';
import { MeuVeiculoService } from './meu-veiculo';
import { DocumentoComArquivo, DocumentoConjunto, temArquivo } from './situacao-veiculo.models';
import { SituacaoVeiculoService } from './situacao-veiculo.service';

/** Cache do navegador onde ficam os arquivos (PDF, foto) dos documentos do veículo. */
const CACHE = 'ces-documentos-veiculo-v1';
const chaveLista = (idVeiculo: string) => `documentos-veiculo:${idVeiculo}`;
/** Endereço fictício do arquivo no cache: muda com a versão, então arquivo trocado é baixado de novo. */
const chaveArquivo = (a: DocumentoComArquivo) => `/__ces/documentos-veiculo/${a.id}?v=${encodeURIComponent(a.versao)}`;

/** O que o app tem guardado de um veículo: a lista de documentos e quando foi atualizada. */
export interface DocumentosGuardados {
  documentos: DocumentoConjunto[];
  guardadoEm: string;
}

/**
 * Documentos do veículo no aparelho (CRLV, tacógrafo, laudo do implemento): baixados ao entrar
 * no app e ao abrir a situação do veículo, para mostrar na fiscalização mesmo sem sinal. O
 * documento impresso some e fica velho; o daqui é sempre o último que o escritório anexou.
 */
@Injectable({ providedIn: 'root' })
export class DocumentosVeiculoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;
  private readonly situacao = inject(SituacaoVeiculoService);
  private readonly meuVeiculo = inject(MeuVeiculoService);
  private readonly checklists = inject(ChecklistVeiculoService);

  /** Etapa silenciosa da sincronização: guarda os documentos do veículo que está com a pessoa. */
  async guardarDoMeuVeiculo(): Promise<void> {
    const catalogo = this.checklists.catalogo() ?? (await this.checklists.carregarCatalogoLocal());
    const id = await this.meuVeiculo.sugerido(catalogo?.veiculos ?? []);
    if (!id) return;
    const situacao = await this.situacao.situacao(id);
    await this.guardar(id, situacao.documentosDoConjunto ?? []);
  }

  /** Guarda a lista e baixa os arquivos que ainda não estão no aparelho (ou que mudaram). */
  async guardar(idVeiculo: string, documentos: DocumentoConjunto[]): Promise<void> {
    await db.config.put({ key: chaveLista(idVeiculo), value: { documentos, guardadoEm: new Date().toISOString() } satisfies DocumentosGuardados });
    const cache = await this.abrirCache();
    if (!cache) return;
    for (const a of documentos.filter(temArquivo)) {
      if (await cache.match(chaveArquivo(a))) continue;
      try {
        const blob = await this.baixar(idVeiculo, a.id);
        await cache.put(chaveArquivo(a), new Response(blob, { headers: { 'Content-Type': a.arquivoContentType ?? blob.type } }));
      } catch {
        // Sem sinal ou arquivo indisponível: tenta de novo na próxima vez; os outros seguem.
      }
    }
  }

  async listaLocal(idVeiculo: string): Promise<DocumentosGuardados | null> {
    const salvo = (await db.config.get(chaveLista(idVeiculo)))?.value as Partial<DocumentosGuardados> | undefined;
    // Lista salva pela versão anterior do app (só com arquivos) também serve.
    const documentos = salvo?.documentos ?? (salvo as { arquivos?: DocumentoConjunto[] } | undefined)?.arquivos;
    return documentos ? { documentos, guardadoEm: salvo?.guardadoEm ?? '' } : null;
  }

  /** Se o arquivo já está no aparelho (abre sem sinal). */
  async noAparelho(a: DocumentoComArquivo): Promise<boolean> {
    const cache = await this.abrirCache();
    return !!cache && !!(await cache.match(chaveArquivo(a)));
  }

  /** O arquivo do aparelho; sem ele, baixa (precisa de sinal) e já guarda. */
  async arquivo(idVeiculo: string, a: DocumentoComArquivo): Promise<Blob> {
    const cache = await this.abrirCache();
    const guardado = await cache?.match(chaveArquivo(a));
    if (guardado) return guardado.blob();
    const blob = await this.baixar(idVeiculo, a.id);
    await cache?.put(chaveArquivo(a), new Response(blob, { headers: { 'Content-Type': a.arquivoContentType ?? blob.type } }));
    return blob;
  }

  private baixar(idVeiculo: string, idDocumento: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.baseUrl}/v1/frota/app/veiculos/${idVeiculo}/documentos/${idDocumento}/arquivo`,
      { responseType: 'blob', context: silentContext() }));
  }

  private async abrirCache(): Promise<Cache | null> {
    try {
      return typeof caches === 'undefined' ? null : await caches.open(CACHE);
    } catch {
      return null;
    }
  }
}
