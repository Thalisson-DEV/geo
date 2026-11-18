import { Directive, TemplateRef, inject, input } from '@angular/core';

export interface GeoCellContext<T> {
  readonly $implicit: T;
  readonly index: number;
}

/** Célula customizada: `<ng-template geoCell="percentual" let-row>…</ng-template>`. */
@Directive({ selector: 'ng-template[geoCell]', standalone: true })
export class GeoCellDirective<T = unknown> {
  readonly geoCell = input.required<string>();
  readonly template = inject<TemplateRef<GeoCellContext<T>>>(TemplateRef);

  // A linha chega sem tipo no template (as diretivas não conhecem o `T` da tabela).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static ngTemplateContextGuard(_dir: GeoCellDirective<unknown>, ctx: unknown): ctx is GeoCellContext<any> {
    return true;
  }
}

/** Conteúdo da linha expandida: `<ng-template geoRowDetail let-row>…</ng-template>`. */
@Directive({ selector: 'ng-template[geoRowDetail]', standalone: true })
export class GeoRowDetailDirective<T = unknown> {
  readonly template = inject<TemplateRef<GeoCellContext<T>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static ngTemplateContextGuard(_dir: GeoRowDetailDirective<unknown>, ctx: unknown): ctx is GeoCellContext<any> {
    return true;
  }
}

/**
 * Ações secundárias da linha (até três `geo-icon-button`), na mesma célula do botão da ação principal:
 * `<ng-template geoRowActions let-row>…</ng-template>`. No mobile aparecem junto do botão do card.
 */
@Directive({ selector: 'ng-template[geoRowActions]', standalone: true })
export class GeoRowActionsDirective<T = unknown> {
  readonly template = inject<TemplateRef<GeoCellContext<T>>>(TemplateRef);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static ngTemplateContextGuard(_dir: GeoRowActionsDirective<unknown>, ctx: unknown): ctx is GeoCellContext<any> {
    return true;
  }
}
