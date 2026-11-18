import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let fieldSequence = 0;

@Component({
  selector: 'geo-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-field',
    '[class.geo-field--invalid]': 'invalid()',
    '[class.geo-field--disabled]': 'disabled()',
    '[class.geo-field--readonly]': 'readonly()',
  },
  template: `
    @if (labelVisible()) {
      <div class="geo-field__heading">
        <label class="geo-field__label" [id]="labelId()" [for]="controlId()">
          {{ label() }}
          @if (required()) {
            <span class="geo-field__required" aria-hidden="true">*</span>
            <span class="geo-sr-only">obrigatório</span>
          } @else if (showOptional()) {
            <span class="geo-field__optional">Opcional</span>
          }
        </label>
        @if (counter()) {
          <span class="geo-field__counter">{{ counter() }}</span>
        }
      </div>
    } @else {
      <label class="geo-sr-only" [id]="labelId()" [for]="controlId()">{{ label() }}</label>
    }

    <div class="geo-field__control">
      <ng-content></ng-content>
    </div>

    @if (error()) {
      <p class="geo-field__message geo-field__message--error" [id]="errorId()" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
        {{ error() }}
      </p>
    } @else if (description()) {
      <p class="geo-field__message" [id]="descriptionId()">{{ description() }}</p>
    }
  `,
})
export class GeoFieldComponent {
  private readonly generatedId = `geo-field-${++fieldSequence}`;

  readonly label = input<string>('');
  readonly labelVisible = input(true);
  readonly inputId = input<string | undefined>();
  readonly description = input<string | undefined>();
  readonly error = input<string | undefined>();
  readonly counter = input<string | undefined>();
  readonly required = input(false);
  readonly showOptional = input(false);
  readonly disabled = input(false);
  readonly readonly = input(false);

  readonly controlId = computed(() => this.inputId() || this.generatedId);
  readonly invalid = computed(() => Boolean(this.error()));
  readonly labelId = computed(() => `${this.controlId()}-label`);
  readonly descriptionId = computed(() => `${this.controlId()}-description`);
  readonly errorId = computed(() => `${this.controlId()}-error`);
  readonly describedBy = computed(() => {
    if (this.error()) return this.errorId();
    if (this.description()) return this.descriptionId();
    return undefined;
  });
}
