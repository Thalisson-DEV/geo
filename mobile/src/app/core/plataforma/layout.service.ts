import { Injectable, signal } from '@angular/core';

/** Tablet deitado: largo e alto o bastante para barra lateral e lista + detalhe lado a lado. */
export const CONSULTA_EXPANDIDO = '(min-width: 900px) and (min-height: 600px)';

/**
 * Classe de tamanho da tela (Material 3: compacto/médio × expandido). Um só lugar para o shell
 * (barra lateral) e para as telas de lista + detalhe decidirem o layout.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** Celular deitado (≈ 915 × 412) não entra: não comporta a barra lateral nem dois painéis. */
  readonly expandido = signal(false);

  constructor() {
    const consulta = consultar();
    if (!consulta) return;
    this.expandido.set(consulta.matches);
    consulta.addEventListener('change', e => this.expandido.set(e.matches));
  }
}

function consultar(): MediaQueryList | null {
  try {
    return typeof matchMedia === 'function' ? matchMedia(CONSULTA_EXPANDIDO) : null;
  } catch {
    return null;
  }
}
