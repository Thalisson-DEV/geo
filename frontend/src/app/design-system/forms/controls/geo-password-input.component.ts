import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { InputTextModule } from 'primeng/inputtext';
import { GeoFieldComponent } from '../field';
import { createControlId, getDescribedBy, getTextInputValue } from './form-control.helpers';

/**
 * Campo de senha com botão de revelar. O `autocomplete` padrão é `new-password` (cadastro de
 * acesso); em telas de login use `current-password`.
 */
@Component({
  selector: 'geo-password-input',
  standalone: true,
  imports: [InputTextModule, GeoFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .geo-password-input {
      position: relative;
      display: block;
    }
    .geo-password-input input {
      padding-inline-end: 2.5rem;
    }
    .geo-password-input__reveal {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      margin-block: auto;
      height: 2rem;
      border: 0;
      border-radius: var(--geo-radius-sm);
      background: transparent;
      color: var(--geo-foreground-muted);
      cursor: pointer;
    }
    .geo-password-input__reveal:hover {
      color: var(--geo-foreground);
      background: var(--geo-surface-muted);
    }
    .geo-password-input__reveal:focus-visible {
      outline: none;
      box-shadow: var(--geo-focus-ring);
    }
    .geo-password-input__reveal:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  `,
  template: `
    <geo-field
      [label]="label()"
      [labelVisible]="labelVisible()"
      [inputId]="controlId()"
      [description]="description()"
      [error]="error()"
      [required]="required()"
      [showOptional]="showOptional()"
      [disabled]="disabled()"
    >
      <span class="geo-password-input">
        <input
          pInputText
          class="geo-prime-control"
          pSize="small"
          [type]="revealed() ? 'text' : 'password'"
          [id]="controlId()"
          [value]="value()"
          [placeholder]="placeholder()"
          [autocomplete]="autocomplete()"
          [attr.minlength]="minlength()"
          [attr.maxlength]="maxlength()"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="invalid()"
          [attr.aria-required]="required()"
          [required]="required()"
          [disabled]="disabled()"
          [invalid]="invalid()"
          (input)="onInput($event)"
        />
        <button
          type="button"
          class="geo-password-input__reveal"
          [disabled]="disabled()"
          [attr.aria-label]="revealed() ? 'Ocultar senha' : 'Mostrar senha'"
          [attr.aria-pressed]="revealed()"
          [attr.aria-controls]="controlId()"
          (click)="revealed.set(!revealed())"
        >
          <i [class]="revealed() ? 'pi pi-eye-slash' : 'pi pi-eye'" aria-hidden="true"></i>
        </button>
      </span>
    </geo-field>
  `,
})
export class GeoPasswordInputComponent {
  private readonly generatedId = createControlId();

  readonly label = input<string>('');
  readonly labelVisible = input(true);
  readonly inputId = input<string | undefined>();
  readonly description = input<string | undefined>();
  readonly error = input<string | undefined>();
  readonly required = input(false);
  readonly showOptional = input(false);
  readonly disabled = input(false);

  readonly controlId = computed(() => this.inputId() || this.generatedId);
  readonly invalid = computed(() => Boolean(this.error()));
  readonly describedBy = computed(() =>
    getDescribedBy(this.controlId(), this.description(), this.error()),
  );

  readonly value = model('');
  readonly placeholder = input('');
  readonly autocomplete = input<'new-password' | 'current-password' | 'off'>('new-password');
  readonly minlength = input<number | undefined>();
  readonly maxlength = input<number | undefined>();

  protected readonly revealed = signal(false);

  protected onInput(event: Event): void {
    if (!this.disabled()) this.value.set(getTextInputValue(event));
  }
}
