/**
 * Lacunas do jsdom para a suíte de testes (não entra no app).
 *
 * O PrimeNG 22 observa o tamanho de alguns componentes (ex.: p-tabs, que agora rola por padrão) com
 * `ResizeObserver`, que o jsdom não implementa. Sem isto, os specs passam mas o Vitest registra erros
 * não tratados e o `npm test` sai com código 1. O stub não observa nada: em teste não há layout.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverDeTeste implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverDeTeste;
}
