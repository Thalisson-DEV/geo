import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { db } from '../db/app-db';
import { ArquivosCampoService } from './arquivos-campo.service';
import { AvisoProgramacao, ModeloApr, ModeloFoto, ObraCampo, PacoteObras, ProgramacaoCampo } from './obras.models';

const CHAVE_DESDE = 'obras_pacote_desde';
const CHAVE_MODELOS = 'obras_modelos';
const CHAVE_AVISOS = 'obras_avisos';
const CHAVE_AVISOS_VISTOS = 'obras_avisos_vistos';
const CHAVE_EQUIPE = 'obras_equipe';

/** Chave do arquivo do projeto da obra no armazenamento de arquivos. */
export function chaveProjeto(idObra: string, hash: string): string {
  return `pdf/${idObra}/${hash}`;
}

/**
 * Pacote offline da equipe de Obras: agenda de hoje + 7 dias, obras com projeto em PDF, pontos, itens, modelos e avisos.
 * Baixa sozinho ao abrir, quando a rede volta e a cada lançamento; com `desde`, só o que mudou. Limpa as obras que saíram
 * da agenda e os PDFs antigos. "Pronto para trabalhar sem sinal" quando tudo da agenda está no aparelho.
 */
@Injectable({ providedIn: 'root' })
export class PacoteObrasService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly arquivos = inject(ArquivosCampoService);
  private readonly baseUrl = environment.apiBaseUrl;

  readonly programacoes = signal<ProgramacaoCampo[]>([]);
  readonly obras = signal<ObraCampo[]>([]);
  readonly modeloApr = signal<ModeloApr | null>(null);
  readonly modelosFoto = signal<ModeloFoto[]>([]);
  readonly avisos = signal<AvisoProgramacao[]>([]);
  readonly avisosVistos = signal<string[]>([]);
  readonly ultimaSync = signal<string | null>(null);
  readonly codigoEquipe = signal<string | null>(null);
  readonly sincronizando = signal(false);
  readonly erro = signal<string | null>(null);
  /** Obras da agenda cujo PDF ainda não está no aparelho. */
  readonly projetosFaltando = signal<string[]>([]);
  readonly carregado = signal(false);

  /** Avisos de mudança que a equipe ainda não viu. */
  readonly avisosNovos = computed(() => this.avisos().filter(a => !this.avisosVistos().includes(a.id)));
  /** Tudo da agenda no aparelho: pacote recebido e PDFs baixados. */
  readonly prontoSemSinal = computed(() => !!this.ultimaSync() && this.projetosFaltando().length === 0);

  private emAndamento: Promise<void> | null = null;

  /** Lê o que já está no aparelho (abre sem rede). */
  async carregarLocal(): Promise<void> {
    const [programacoes, obras, desde, modelos, avisos, vistos, equipe] = await Promise.all([
      db.obrasProgramacoes.toArray(), db.obrasObras.toArray(), db.config.get(CHAVE_DESDE), db.config.get(CHAVE_MODELOS),
      db.config.get(CHAVE_AVISOS), db.config.get(CHAVE_AVISOS_VISTOS), db.config.get(CHAVE_EQUIPE),
    ]);
    this.programacoes.set(programacoes);
    this.obras.set(obras);
    this.ultimaSync.set(desde?.value ?? null);
    this.modeloApr.set(modelos?.value?.apr ?? null);
    this.modelosFoto.set(modelos?.value?.fotos ?? []);
    this.avisos.set(avisos?.value ?? []);
    this.avisosVistos.set(vistos?.value ?? []);
    this.codigoEquipe.set(equipe?.value ?? null);
    await this.conferirProjetos();
    this.carregado.set(true);
  }

  /** Busca o pacote no servidor (uma vez por vez). Sem rede, fica com o que está no aparelho. */
  sincronizar(): Promise<void> {
    this.emAndamento ??= this.baixar().finally(() => (this.emAndamento = null));
    return this.emAndamento;
  }

  async marcarAvisosVistos(): Promise<void> {
    const ids = [...new Set([...this.avisosVistos(), ...this.avisos().map(a => a.id)])].slice(-200);
    this.avisosVistos.set(ids);
    await db.config.put({ key: CHAVE_AVISOS_VISTOS, value: ids });
  }

  obra(id: string | null | undefined): ObraCampo | undefined {
    return id ? this.obras().find(o => o.id === id) : undefined;
  }

  programacao(id: string | null | undefined): ProgramacaoCampo | undefined {
    return id ? this.programacoes().find(p => p.id === id) : undefined;
  }

  async projeto(obra: ObraCampo): Promise<Blob | null> {
    return obra.projeto ? this.arquivos.ler(chaveProjeto(obra.id, obra.projeto.hash)) : null;
  }

  private async baixar(): Promise<void> {
    if (!this.auth.ehEquipeObras() && !this.auth.ehSupervisorObras()) return;
    this.sincronizando.set(true);
    this.erro.set(null);
    try {
      if (!this.carregado()) await this.carregarLocal();
      void this.arquivos.pedirPersistencia();
      const desde = this.ultimaSync();
      const params: Record<string, string> = desde ? { desde } : {};
      const pacote = await firstValueFrom(this.http.get<PacoteObras>(`${this.baseUrl}/v1/obras/campo/pacote`,
        { params, headers: { 'X-Silent-Error': 'true' } }));
      await this.aplicar(pacote, !desde);
      await this.baixarProjetos();
      await this.arquivos.medirEspaco();
    } catch {
      this.erro.set('Sem conexão com o servidor: o app segue com a agenda que já está no aparelho.');
    } finally {
      this.sincronizando.set(false);
    }
  }

  /** Grava o pacote: completo substitui a agenda; incremental mescla e tira as removidas. */
  async aplicar(pacote: PacoteObras, completo: boolean): Promise<void> {
    await db.transaction('rw', [db.obrasProgramacoes, db.obrasObras, db.config], async () => {
      if (completo) {
        await db.obrasProgramacoes.clear();
      }
      await db.obrasProgramacoes.bulkPut(pacote.programacoes);
      if (pacote.programacoesRemovidas.length) await db.obrasProgramacoes.bulkDelete(pacote.programacoesRemovidas);
      await db.obrasObras.bulkPut(pacote.obras);
      // Fora da janela: a agenda passou.
      const limite = pacote.inicioJanela.split('/').reverse().join('-');
      const vencidas = (await db.obrasProgramacoes.toArray())
        .filter(p => p.fim.split('/').reverse().join('-') < limite).map(p => p.id);
      if (vencidas.length) await db.obrasProgramacoes.bulkDelete(vencidas);
      // Obra sem programação na agenda sai do aparelho (concluída ou passada a outra equipe).
      const emUso = new Set((await db.obrasProgramacoes.toArray()).map(p => p.idObra));
      const sobrando = (await db.obrasObras.toArray()).filter(o => !emUso.has(o.id)).map(o => o.id);
      if (sobrando.length) await db.obrasObras.bulkDelete(sobrando);
      const avisos = [...((await db.config.get(CHAVE_AVISOS))?.value ?? []) as AvisoProgramacao[], ...pacote.avisos]
        .filter((a, i, todos) => todos.findIndex(b => b.id === a.id) === i).slice(-50);
      await db.config.bulkPut([
        { key: CHAVE_DESDE, value: pacote.geradoEm },
        { key: CHAVE_MODELOS, value: { apr: pacote.modeloApr, fotos: pacote.modelosFoto } },
        { key: CHAVE_AVISOS, value: avisos },
        { key: CHAVE_EQUIPE, value: pacote.codigoEquipe ?? null },
      ]);
    });
    await this.carregarLocal();
  }

  /** PDF de cada obra da agenda, quando o hash mudou; apaga as versões antigas e os de obras que saíram. */
  private async baixarProjetos(): Promise<void> {
    const desejadas = new Set<string>();
    for (const obra of this.obras()) {
      if (!obra.projeto) continue;
      const chave = chaveProjeto(obra.id, obra.projeto.hash);
      desejadas.add(chave);
      if (await this.arquivos.existe(chave)) continue;
      try {
        const blob = await firstValueFrom(this.http.get(`${this.baseUrl}/v1/obras/campo/obras/${obra.id}/projeto`,
          { responseType: 'blob', headers: { 'X-Silent-Error': 'true' } }));
        await this.arquivos.gravar(chave, blob);
      } catch {
        /* fica para a próxima: conta como faltando */
      }
    }
    for (const chave of await this.arquivos.chaves()) {
      if (chave.startsWith('pdf/') && !desejadas.has(chave)) await this.arquivos.apagar(chave);
    }
    await this.conferirProjetos();
  }

  private async conferirProjetos(): Promise<void> {
    const faltando: string[] = [];
    for (const obra of this.obras()) {
      if (obra.projeto && !(await this.arquivos.existe(chaveProjeto(obra.id, obra.projeto.hash)))) faltando.push(obra.numero);
    }
    this.projetosFaltando.set(faltando);
  }
}
