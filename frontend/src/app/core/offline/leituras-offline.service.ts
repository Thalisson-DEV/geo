import { Injectable, signal } from '@angular/core';

/** Nome do cache do navegador; mudar o sufixo descarta o que foi guardado no formato antigo. */
const CACHE = 'geo-leituras-v1';
/** Quantas consultas ficam guardadas; passou disso, as mais antigas saem. */
const LIMITE = 300;
/** Cabeçalho interno com a hora em que a resposta foi guardada. */
const SALVO_EM = 'x-geo-salvo-em';

/**
 * Consultas que podem ser mostradas sem rede: as telas de Obras e os cadastros que elas usam. Fica de fora o que não é
 * de Obras (financeiro, RH, descontos...): o cache fica no navegador, e dado sensível de outros módulos não deve ficar
 * no computador por causa de uma queda de rede.
 */
const CONSULTAS_GUARDADAS = [
  /\/v1\/obras(\/|\?|$)/,
  /\/v1\/bases-operacionais/,
  /\/v1\/municipios/,
  /\/v1\/contratos/,
  /\/v1\/processos-negocio/,
  /\/v1\/centros-custo/,
  /\/v1\/rh\/(equipes|supervisores|coordenadores)/,
  /\/v1\/estoque\/solicitacoes/
];

export interface LeituraGuardada<T = unknown> {
  corpo: T;
  salvoEm: Date;
}

/**
 * Última resposta de cada consulta de Obras, por usuário, para o administrativo continuar vendo o que já abriu quando a
 * rede cai. Só leitura: gravar sem rede continua recusado (o servidor é quem valida programação, medição e estoque).
 * O cache é apagado no logout.
 */
@Injectable({ providedIn: 'root' })
export class LeiturasOfflineService {
  /** Hora da leitura guardada que a tela está mostrando agora; `null` quando tudo veio do servidor. */
  readonly mostrandoDesde = signal<Date | null>(null);

  private readonly disponivel = typeof caches !== 'undefined';

  podeGuardar(url: string): boolean {
    return this.disponivel && CONSULTAS_GUARDADAS.some((padrao) => padrao.test(url));
  }

  async guardar(usuario: string, url: string, corpo: unknown): Promise<void> {
    if (!this.disponivel || corpo === null || corpo === undefined) return;
    try {
      const cache = await caches.open(CACHE);
      await cache.put(this.chave(usuario, url), new Response(JSON.stringify(corpo), {
        headers: { 'content-type': 'application/json', [SALVO_EM]: new Date().toISOString() }
      }));
      void this.podar(cache);
    } catch {
      /* cota cheia ou navegador sem cache: segue sem guardar */
    }
  }

  async buscar<T>(usuario: string, url: string): Promise<LeituraGuardada<T> | null> {
    if (!this.disponivel) return null;
    try {
      const cache = await caches.open(CACHE);
      const resposta = await cache.match(this.chave(usuario, url));
      if (!resposta) return null;
      const salvoEm = new Date(resposta.headers.get(SALVO_EM) ?? Date.now());
      return { corpo: (await resposta.json()) as T, salvoEm };
    } catch {
      return null;
    }
  }

  /** A tela mostrou uma leitura guardada: o aviso exibe a mais antiga das que estão na tela. */
  marcarExibicao(salvoEm: Date): void {
    const atual = this.mostrandoDesde();
    if (!atual || salvoEm < atual) this.mostrandoDesde.set(salvoEm);
  }

  /** O servidor respondeu: o aviso de dados guardados sai. */
  voltouARede(): void {
    if (this.mostrandoDesde()) this.mostrandoDesde.set(null);
  }

  async limpar(): Promise<void> {
    this.mostrandoDesde.set(null);
    if (this.disponivel) await caches.delete(CACHE).catch(() => false);
  }

  /** A chave leva o usuário: quem entrar depois no mesmo computador não vê o que outro abriu. */
  private chave(usuario: string, url: string): string {
    const endereco = new URL(url, location.origin);
    endereco.searchParams.set('__geo_usuario', usuario);
    return endereco.toString();
  }

  private async podar(cache: Cache): Promise<void> {
    const chaves = await cache.keys();
    if (chaves.length <= LIMITE) return;
    // A ordem de keys() é a de inserção; cache.put de uma chave existente a move para o fim.
    await Promise.all(chaves.slice(0, chaves.length - LIMITE).map((k) => cache.delete(k)));
  }
}
