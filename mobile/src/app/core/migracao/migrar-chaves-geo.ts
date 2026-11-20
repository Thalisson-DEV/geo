/**
 * Migração das chaves salvas no aparelho depois da troca do prefixo `ces` por `geo`.
 *
 * Toda chave do `localStorage` e do `sessionStorage` que começa com o prefixo antigo seguido de
 * `_`, `.` ou `:` é copiada para o mesmo nome com `geo` (sem sobrescrever uma chave nova que já
 * exista) e a antiga é apagada. No app de campo isso mantém o token (`geo_auth_token`), o dono do
 * aparelho, a troca de ids da fila, o tema e as preferências de rede, sem novo login. A fila, os
 * rascunhos e a sessão ficam no IndexedDB, cujos bancos mantêm o nome, e não dependem desta migração.
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
