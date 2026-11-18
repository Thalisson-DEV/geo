import { DestroyRef, Injectable, Signal, effect, inject, signal } from '@angular/core';
import type { Params } from '@angular/router';

/** Trecho da trilha que a página informa ao cabeçalho. */
export interface GeoTrechoDaTrilha {
  readonly label: string;
  readonly route?: string | readonly unknown[];
  readonly queryParams?: Params | null;
}

/**
 * Trilha "você está em" da página aberta. A trilha aparece só no cabeçalho do app: as páginas
 * (por `geo-page-header` e `geo-form-page`) informam aqui os trechos que só elas conhecem, como
 * o número do registro aberto ou o recorte da lista de origem, e o cabeçalho junta isso ao menu.
 */
@Injectable({ providedIn: 'root' })
export class GeoTrilhaDaPagina {
  private readonly trechosAtuais = signal<readonly GeoTrechoDaTrilha[]>([]);
  private dono: object | null = null;

  readonly trechos: Signal<readonly GeoTrechoDaTrilha[]> = this.trechosAtuais.asReadonly();

  /** Publica os trechos de `dono`; a última página a publicar prevalece. */
  definir(dono: object, trechos: readonly GeoTrechoDaTrilha[]): void {
    this.dono = dono;
    this.trechosAtuais.set(trechos);
  }

  /** Limpa a trilha se ela ainda for de `dono` (outra página pode já ter publicado a sua). */
  limpar(dono: object): void {
    if (this.dono !== dono) return;
    this.dono = null;
    this.trechosAtuais.set([]);
  }
}

/** Publica os trechos de um componente enquanto ele existir. Chamar no contexto de injeção. */
export function publicarTrilhaDaPagina(trechos: () => readonly GeoTrechoDaTrilha[]): void {
  const trilha = inject(GeoTrilhaDaPagina);
  const dono = {};
  effect(() => trilha.definir(dono, trechos()));
  inject(DestroyRef).onDestroy(() => trilha.limpar(dono));
}
