import { Injectable, signal } from '@angular/core';
import { db } from '../db/app-db';

/**
 * PDFs do projeto e fotos de Obras em arquivo: no OPFS (sistema de arquivos privado do navegador), que aguenta arquivos
 * grandes sem pesar no IndexedDB; sem OPFS (Safari antigo, modo privado), numa tabela de reserva do IndexedDB. Pede o
 * armazenamento persistente na primeira vez, para o iPhone não limpar os dados por falta de uso.
 */
@Injectable({ providedIn: 'root' })
export class ArquivosCampoService {
  /** Espaço livre estimado em bytes (nulo se o navegador não informa). */
  readonly livre = signal<number | null>(null);
  /** Pouco espaço: menos de 200 MB livres. */
  readonly pouco = signal(false);
  readonly persistente = signal<boolean | null>(null);

  private pasta: Promise<FileSystemDirectoryHandle | null> | null = null;

  async pedirPersistencia(): Promise<boolean> {
    try {
      const armazenamento = navigator.storage;
      if (!armazenamento?.persist) return false;
      const ja = await armazenamento.persisted?.();
      const ok = ja || (await armazenamento.persist());
      this.persistente.set(ok);
      return ok;
    } catch {
      return false;
    }
  }

  async medirEspaco(): Promise<void> {
    try {
      const e = await navigator.storage?.estimate?.();
      if (!e?.quota) return;
      const livre = e.quota - (e.usage ?? 0);
      this.livre.set(livre);
      this.pouco.set(livre < 200 * 1024 * 1024);
    } catch {
      /* sem estimativa */
    }
  }

  async gravar(chave: string, blob: Blob): Promise<void> {
    const dir = await this.diretorio();
    if (dir) {
      try {
        const arquivo = await dir.getFileHandle(this.nome(chave), { create: true });
        const escrita = await (arquivo as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
        await escrita.write(blob);
        await escrita.close();
        return;
      } catch {
        // Sem escrita no OPFS (Safari): não deixa o arquivo vazio criado para trás e cai para a reserva.
        await dir.removeEntry(this.nome(chave)).catch(() => undefined);
      }
    }
    // ArrayBuffer em vez de Blob: alguns WebKit não guardam Blob no IndexedDB.
    await db.obrasArquivos.put({ chave, dados: await blob.arrayBuffer(), tipo: blob.type, tamanho: blob.size, criadoEm: new Date().toISOString() });
  }

  async ler(chave: string): Promise<Blob | null> {
    const dir = await this.diretorio();
    if (dir) {
      try {
        const arquivo = await (await dir.getFileHandle(this.nome(chave))).getFile();
        if (arquivo.size > 0) return arquivo;
      } catch {
        /* não está no OPFS: tenta a reserva */
      }
    }
    const reserva = await db.obrasArquivos.get(chave);
    return reserva ? new Blob([reserva.dados], { type: reserva.tipo }) : null;
  }

  async existe(chave: string): Promise<boolean> {
    return (await this.ler(chave)) !== null;
  }

  async apagar(chave: string): Promise<void> {
    const dir = await this.diretorio();
    if (dir) {
      try {
        await dir.removeEntry(this.nome(chave));
      } catch {
        /* não existia */
      }
    }
    await db.obrasArquivos.delete(chave);
  }

  /** Chaves gravadas (OPFS + reserva), para a limpeza de obras concluídas. */
  async chaves(): Promise<string[]> {
    const chaves = new Set<string>((await db.obrasArquivos.toCollection().primaryKeys()) as string[]);
    const dir = await this.diretorio();
    if (dir) {
      try {
        for await (const nome of (dir as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) {
          chaves.add(decodeURIComponent(nome));
        }
      } catch {
        /* sem listagem */
      }
    }
    return [...chaves];
  }

  private nome(chave: string): string {
    return encodeURIComponent(chave);
  }

  private diretorio(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.pasta) {
      this.pasta = (async () => {
        try {
          const raiz = await navigator.storage?.getDirectory?.();
          return raiz ? await raiz.getDirectoryHandle('obras', { create: true }) : null;
        } catch {
          return null;
        }
      })();
    }
    return this.pasta;
  }
}
