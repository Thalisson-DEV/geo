import { Directive, TemplateRef, inject, input } from '@angular/core';

export type GeoTabValue = string | number;

@Directive({
  selector: 'ng-template[geoTabPanel]',
  standalone: true
})
export class GeoTabPanelDirective {
  readonly value = input.required<GeoTabValue>({ alias: 'geoTabPanel' });
  readonly template = inject(TemplateRef<unknown>);
}
