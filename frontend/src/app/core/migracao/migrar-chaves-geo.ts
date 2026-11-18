/**
 * Migração das chaves salvas no aparelho depois da troca do prefixo `ces` por `geo`.
 *
 * Toda chave do `localStorage` e do `sessionStorage` que começa com `ces_`, `ces.` ou `ces:` é
 * copiada para o mesmo nome com `geo` (sem sobrescrever uma chave nova que já exista) e a antiga
 * é apagada. Assim a sessão (`geo_session_enc`), a chave de criptografia local, as preferências
 * e o estado das telas continuam valendo, sem novo login. A fila offline fica no IndexedDB, cujo
 * nome do banco não muda, e não depende desta migração.
 *
 * É idempotente: num aparelho já migrado não há chaves antigas e nada muda.
 */

// renomear-geo: manter a linha seguinte (prefixos antigos lidos pela migração)
const PREFIXOS_ANTIGOS = /^ces([_.:])/;

export interface ResultadoMigracaoChaves {
  migradas: number;
  descartadas: number;
}

export function migrarChavesGeo(armazenamento: Storage): ResultadoMigracaoChaves {
  const antigas: string[] = [];
  for (let i = 0; i < armazenamento.length; i++) {
    const chave = armazenamento.key(i);
    if (chave && PREFIXOS_ANTIGOS.test(chave)) antigas.push(chave);
  }

  let migradas = 0;
  let descartadas = 0;
  for (const antiga of antigas) {
    const nova = antiga.replace(PREFIXOS_ANTIGOS, 'geo$1');
    const valor = armazenamento.getItem(antiga);
    if (valor !== null && armazenamento.getItem(nova) === null) {
      armazenamento.setItem(nova, valor);
      migradas++;
    } else {
      descartadas++;
    }
    armazenamento.removeItem(antiga);
  }
  return { migradas, descartadas };
}

/** Roda nos dois armazenamentos; nunca impede a aplicação de abrir. */
export function migrarChavesGeoNoNavegador(): void {
  for (const obter of [() => globalThis.localStorage, () => globalThis.sessionStorage]) {
    try {
      const armazenamento = obter();
      if (armazenamento) migrarChavesGeo(armazenamento);
    } catch {
      // Armazenamento bloqueado (modo privado, política do navegador): segue sem migrar.
    }
  }
}
