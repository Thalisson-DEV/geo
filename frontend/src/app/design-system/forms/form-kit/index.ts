export * from './form-kit.registry';
export * from './form-kit.utils';
export * from './geo-form-field.component';
export * from './geo-form-section.component';
export * from './geo-form-actions.component';
export * from './geo-form-stepper.component';
export * from './geo-form-summary.component';
export * from './geo-form-page.component';
export * from './geo-form-drawer.component';
export * from './unsaved-changes.guard';

import { GeoFormActionsComponent } from './geo-form-actions.component';
import { GeoFormDrawerComponent } from './geo-form-drawer.component';
import { GeoFormFieldComponent } from './geo-form-field.component';
import { GeoFormPageComponent } from './geo-form-page.component';
import { GeoFormSectionComponent } from './geo-form-section.component';
import { GeoFormStepperComponent } from './geo-form-stepper.component';
import { GeoFormSummaryComponent } from './geo-form-summary.component';

/** Todos os componentes do kit de formulário, para o `imports` da tela. */
export const GEO_FORM_KIT = [
  GeoFormPageComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoFormFieldComponent,
  GeoFormActionsComponent,
  GeoFormSummaryComponent,
  GeoFormStepperComponent,
] as const;
