import { Injectable, InjectionToken, computed, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/** Campo registrado por um `geo-form-field` (usado pelo resumo de pendências e pelo foco no erro). */
export interface GeoFormFieldRef {
  readonly label: () => string;
  readonly control: () => AbstractControl | null;
  readonly section: () => string | null;
  readonly sectionIcon: () => string | null;
  readonly invalid: () => boolean;
  readonly errorText: () => string | null;
  focus(): void;
  /** Posição no documento: ordena pendências na ordem visual. */
  element(): HTMLElement;
}

/** Seção registrada por um `geo-form-section` (índice de âncoras do tipo C). */
export interface GeoFormSectionRef {
  readonly id: string;
  readonly title: () => string;
  readonly icon: () => string | undefined;
  element(): HTMLElement;
}

/**
 * Registro de campos e seções de UM formulário. Provido por `geo-form-page` e `geo-form-drawer`;
 * os campos/seções projetados neles se registram sozinhos.
 */
@Injectable()
export class GeoFormRegistry {
  private readonly fieldList = signal<GeoFormFieldRef[]>([]);
  private readonly sectionList = signal<GeoFormSectionRef[]>([]);
  /** Incrementado quando o status de algum controle muda (controles não são signals). */
  readonly version = signal(0);

  readonly sections = computed(() => sortByDocument(this.sectionList()));
  readonly fields = computed(() => sortByDocument(this.fieldList()));

  /** Campos inválidos e já tocados, na ordem visual. */
  readonly pending = computed(() => {
    this.version();
    return this.fields().filter((field) => field.invalid());
  });

  addField(field: GeoFormFieldRef): () => void {
    this.fieldList.update((list) => [...list, field]);
    return () => this.fieldList.update((list) => list.filter((item) => item !== field));
  }

  addSection(section: GeoFormSectionRef): () => void {
    this.sectionList.update((list) => [...list, section]);
    return () => this.sectionList.update((list) => list.filter((item) => item !== section));
  }

  touch(): void {
    this.version.update((value) => value + 1);
  }
}

function sortByDocument<T extends { element(): HTMLElement }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const position = a.element().compareDocumentPosition(b.element());
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

/** Seção atual de um campo (provida por `geo-form-section`). */
export interface GeoFormSectionContext {
  readonly title: () => string;
  readonly icon: () => string | undefined;
}
export const GEO_FORM_SECTION = new InjectionToken<GeoFormSectionContext>('GEO_FORM_SECTION');
