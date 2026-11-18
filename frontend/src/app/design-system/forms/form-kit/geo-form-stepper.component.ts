import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface GeoFormStep {
  label: string;
  description?: string;
}

/**
 * Indicador de etapas do **tipo D** (wizard enxuto: 2–3 etapas, só quando a etapa N depende da N-1).
 * Só indica e navega para etapas já concluídas; a validação de avanço é da tela. Revisão não é etapa:
 * use `geo-form-summary` e confirme ao enviar.
 *
 * ```html
 * <geo-form-stepper [steps]="etapas" [(active)]="etapa" />
 * ```
 */
@Component({
  selector: 'geo-form-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-form-stepper' },
  template: `
    <ol class="geo-form-stepper__list" aria-label="Etapas">
      @for (step of steps(); track step.label; let i = $index) {
        @let numero = i + 1;
        <li
          class="geo-form-stepper__item"
          [class.geo-form-stepper__item--active]="numero === active()"
          [class.geo-form-stepper__item--done]="numero < active()"
          [attr.aria-current]="numero === active() ? 'step' : null"
        >
          <button
            type="button"
            class="geo-form-stepper__button"
            [disabled]="numero >= active()"
            (click)="active.set(numero)"
          >
            <span class="geo-form-stepper__marker" aria-hidden="true">
              @if (numero < active()) {
                <i class="pi pi-check"></i>
              } @else {
                {{ numero }}
              }
            </span>
            <span class="geo-form-stepper__text">
              <span class="geo-form-stepper__label">{{ step.label }}</span>
              @if (step.description) {
                <span class="geo-form-stepper__description">{{ step.description }}</span>
              }
            </span>
            <span class="geo-sr-only">{{ numero < active() ? '(concluída)' : numero === active() ? '(atual)' : '' }}</span>
          </button>
        </li>
      }
    </ol>
  `,
})
export class GeoFormStepperComponent {
  readonly steps = input.required<readonly GeoFormStep[]>();
  /** Etapa atual, começando em 1. */
  readonly active = model(1);
}
