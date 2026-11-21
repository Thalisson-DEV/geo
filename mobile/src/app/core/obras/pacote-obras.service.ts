import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { db } from '../db/app-db';
import { ArquivosCampoService } from './arquivos-campo.service';
import { AvisoProgramacao, ItemCampo, LiberacaoDia, ObraResumo, ModeloApr, ModeloFoto, ObraCampo, PacoteObras, ProgramacaoCampo } from './obras.models';

const CHAVE_DESDE = 'obras_pacote_desde';
const CHAVE_MODELOS = 'obras_modelos';
const CHAVE_AVISOS = 'obras_avisos';
const CHAVE_AVISOS_VISTOS = 'obras_avisos_vistos';
const CHAVE_EQUIPE = 'obras_equipe';
/** Hora do aparelho em que o último pacote chegou: o que foi enviado antes disso já vem na execução do pacote. */
const CHAVE_RECEBIDO_EM = 'obras_pacote_recebido_em';
const CHAVE_LIBERACAO = 'obras_liberacao_do_dia';
const CHAVE_ABERTAS = 'obras_abertas_da_base';

/** Chave do arquivo do projeto da obra no armazenamento de arquivos. */
/** Tempo máximo para baixar um PDF de projeto (arquivos grandes em 4G fraco). */
const TEMPO_LIMITE_PROJETO_MS = 180_000;

/** Prefixo da programação montada no aparelho para a execução avulsa (obra fora da agenda). */
export const PREFIXO_AVULSA = 'avulsa-';

export function idAvulsa(idObra: string): string {
  return `${PREFIXO_AVULSA}${idObra}`;
}

/** Obra buscada para a execução avulsa: a obra e os itens que ainda podem ser executados por esta equipe. */
export interface ObraAvulsa {
  obra: ObraCampo;
  itens: ItemCampo[];
  /** Itens da obra já programados para outra programação: ficam de fora. */
  programadosEmOutra: number;
}

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
  readonly recebidoEm = signal<string | null>(null);
  /** O que o servidor sabe da APR do dia (feita em outro aparelho ou antes de sair e entrar). */
  readonly liberacaoServidor = signal<LiberacaoDia[]>([]);
  /** Obras em aberto da base: sem sinal, a equipe ainda acha a obra da execução avulsa. */
  readonly obrasAbertas = signal<ObraResumo[]>([]);
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
    const [programacoes, obras, desde, modelos, avisos, vistos, equipe, recebido, liberacao, abertas] = await Promise.all([
      db.obrasProgramacoes.toArray(), db.obrasObras.toArray(), db.config.get(CHAVE_DESDE), db.config.get(CHAVE_MODELOS),
      db.config.get(CHAVE_AVISOS), db.config.get(CHAVE_AVISOS_VISTOS), db.config.get(CHAVE_EQUIPE),
      db.config.get(CHAVE_RECEBIDO_EM), db.config.get(CHAVE_LIBERACAO), db.config.get(CHAVE_ABERTAS),
    ]);
    this.programacoes.set(programacoes);
    this.obras.set(obras);
    this.ultimaSync.set(desde?.value ?? null);
    this.recebidoEm.set(recebido?.value ?? null);
    this.liberacaoServidor.set(liberacao?.value ?? []);
    this.obrasAbertas.set(abertas?.value ?? []);
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
    // O pacote é da equipe: o supervisor usa as próprias consultas (status, documentação).
    if (!this.auth.ehEquipeObras()) return;
    this.sincronizando.set(true);
    this.erro.set(null);
    try {
      if (!this.carregado()) await this.carregarLocal();
      void this.arquivos.pedirPersistencia();
      // Obra guardada antes dos itens além do programado (pacote antigo): pede o pacote completo uma vez.
      const desde = this.obras().some(o => o.itensExtras === undefined || o.visitaPrevia === undefined) ? null : this.ultimaSync();
      const params: Record<string, string> = desde ? { desde } : {};
      const pacote = await firstValueFrom(this.http.get<PacoteObras>(`${this.baseUrl}/v1/obras/campo/pacote`,
        { params, headers: { 'X-Silent-Error': 'true' } }));
      await this.aplicar(pacote, !desde);
      await this.completarAvulsas();
      await this.baixarProjetos();
      await this.arquivos.medirEspaco();
    } catch {
      this.erro.set('Sem conexão com o servidor: o app segue com a agenda que já está no aparelho.');
    } finally {
      this.sincronizando.set(false);
    }
  }

  /**
   * A obra para a execução avulsa sem ir ao servidor: obra da agenda (os itens além do programado vêm no pacote) ou,
   * sem sinal, a obra em aberto da base, ainda sem pontos (eles chegam com o sinal, em {@link completarAvulsas}).
   */
  avulsaNoAparelho(numero: string): (ObraAvulsa & { semDados?: boolean }) | null {
    const n = numero.trim();
    const daAgenda = this.obras().find(o => o.numero === n);
    if (daAgenda) return { obra: daAgenda, itens: daAgenda.itensExtras ?? [], programadosEmOutra: 0 };
    const resumo = this.obrasAbertas().find(o => o.numero === n);
    if (!resumo) return null;
    return {
      obra: { id: resumo.id, numero: resumo.numero, titulo: resumo.titulo, municipio: resumo.municipio, pontos: [], vaos: [], fotos: [], pendenciasFoto: [], itensExtras: [] },
      itens: [], programadosEmOutra: 0, semDados: true,
    };
  }

  /** Avulsas começadas sem sinal: com sinal, busca os pontos, o projeto e os itens da obra e completa a do aparelho. */
  async completarAvulsas(): Promise<void> {
    const incompletas = this.programacoes().filter(p => p.avulsa && !p.itens.length);
    for (const p of incompletas) {
      const dados = await this.buscarAvulsa(p.numeroObra ?? '').catch(() => null);
      if (!dados) continue;
      await db.transaction('rw', [db.obrasProgramacoes, db.obrasObras], async () => {
        await db.obrasObras.put(dados.obra);
        await db.obrasProgramacoes.put({ ...p, itens: dados.itens });
      });
    }
    if (incompletas.length) {
      await this.carregarLocal();
      await this.baixarProjetos();
    }
  }

  /** Busca a obra fora da agenda no servidor (precisa de sinal). Nulo quando não existe ou está encerrada. */
  async buscarAvulsa(numero: string): Promise<ObraAvulsa | null> {
    try {
      return await firstValueFrom(this.http.get<ObraAvulsa>(`${this.baseUrl}/v1/obras/campo/obras/avulsa`,
        { params: { numero: numero.trim() }, headers: { 'X-Silent-Error': 'true' } }).pipe(timeout(20_000)));
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }

  /**
   * Guarda no aparelho a obra e uma programação "avulsa" montada com os itens que a equipe pode executar hoje. A partir
   * daí a obra funciona como as da agenda (ficha, APR, pontos, fotos, relatório), também sem sinal.
   */
  async iniciarAvulsa(dados: ObraAvulsa, motivo: string, hoje: string): Promise<ProgramacaoCampo> {
    const dia = hoje.split('-').reverse().join('/');
    const programacao: ProgramacaoCampo = {
      id: idAvulsa(dados.obra.id), numero: 0, idObra: dados.obra.id, numeroObra: dados.obra.numero, inicio: dia, fim: dia,
      descricao: dados.obra.titulo ?? 'Execução avulsa', turno: 'DIA_TODO', linhaViva: false, desligamento: false, finalizaObra: false,
      observacao: motivo, situacao: 'PROGRAMADA', avulsa: true, itens: dados.itens,
    };
    await db.transaction('rw', [db.obrasProgramacoes, db.obrasObras], async () => {
      await db.obrasObras.put(dados.obra);
      await db.obrasProgramacoes.put(programacao);
    });
    await this.carregarLocal();
    void this.baixarProjetos();
    return programacao;
  }

  /** Grava o pacote: completo substitui a agenda; incremental mescla e tira as removidas. */
  async aplicar(pacote: PacoteObras, completo: boolean, recebidoEm = new Date().toISOString()): Promise<void> {
    await db.transaction('rw', [db.obrasProgramacoes, db.obrasObras, db.config], async () => {
      // A execução avulsa é montada no aparelho: o pacote não a substitui. A programação avulsa que o servidor cria
      // para guardar o valor executado fica fora da agenda do app (a equipe já trabalha na do aparelho).
      const avulsas = (await db.obrasProgramacoes.toArray()).filter(p => p.id.startsWith(PREFIXO_AVULSA));
      if (completo) {
        await db.obrasProgramacoes.clear();
        if (avulsas.length) await db.obrasProgramacoes.bulkPut(avulsas);
      }
      await db.obrasProgramacoes.bulkPut(pacote.programacoes.filter(p => !p.avulsa));
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
        { key: CHAVE_RECEBIDO_EM, value: recebidoEm },
        { key: CHAVE_LIBERACAO, value: pacote.liberacaoDoDia ?? [] },
        ...(pacote.obrasAbertas ? [{ key: CHAVE_ABERTAS, value: pacote.obrasAbertas }] : []),
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
        // Com tempo limite: um download pendurado seguraria todas as sincronizações seguintes do pacote.
        const blob = await firstValueFrom(this.http.get(`${this.baseUrl}/v1/obras/campo/obras/${obra.id}/projeto`,
          { responseType: 'blob', headers: { 'X-Silent-Error': 'true' } }).pipe(timeout(TEMPO_LIMITE_PROJETO_MS)));
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
