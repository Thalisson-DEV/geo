import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { GeoFieldComponent } from '../field';
import { createControlId } from './form-control.helpers';

@Component({
  selector: 'geo-file-input',
  standalone: true,
  imports: [GeoFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .geo-file-input { display: grid; gap: .55rem; }
    .geo-file-input__picker { display: flex; min-height: var(--geo-touch-target); align-items: center; gap: .7rem; padding: .6rem .75rem; border: 1px dashed var(--geo-border-strong); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); color: var(--geo-foreground); cursor: pointer; }
    .geo-file-input__picker:hover { border-color: var(--geo-brand); background: var(--geo-brand-soft); }
    .geo-file-input__picker:focus-within { outline: 3px solid var(--geo-focus-ring); outline-offset: 2px; }
    .geo-file-input__picker[data-invalid='true'] { border-color: var(--geo-danger); background: var(--geo-danger-soft); }
    .geo-file-input__picker[data-disabled='true'] { cursor: not-allowed; opacity: .7; }
    .geo-file-input__picker input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
    .geo-file-input__copy { display: grid; min-width: 0; gap: .15rem; }
    .geo-file-input__copy strong { font-size: var(--geo-font-body); }
    .geo-file-input__copy span { overflow: hidden; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); text-overflow: ellipsis; white-space: nowrap; }
    .geo-file-input__clear { justify-self: start; min-height: var(--geo-touch-target); border: 0; background: transparent; color: var(--geo-brand); font-weight: 700; cursor: pointer; }
  `,
  template: `
    <geo-field
      [label]="label()"
      [inputId]="controlId()"
      [description]="description()"
      [error]="effectiveError()"
      [required]="required()"
      [showOptional]="showOptional()"
      [disabled]="disabled()"
    >
      <div class="geo-file-input">
        <label class="geo-file-input__picker" [attr.data-invalid]="!!effectiveError()" [attr.data-disabled]="disabled()">
          <input
            #nativeInput
            type="file"
            [id]="controlId()"
            [accept]="accept()"
            [required]="required()"
            [disabled]="disabled()"
            [attr.aria-invalid]="!!effectiveError()"
            [attr.aria-describedby]="effectiveError() ? controlId() + '-error' : (description() ? controlId() + '-description' : null)"
            (change)="selectFile($event)"
          />
          <i class="pi pi-upload" aria-hidden="true"></i>
          <span class="geo-file-input__copy">
            <strong>{{ file() ? 'Arquivo selecionado' : buttonLabel() }}</strong>
            <span>{{ file()?.name || emptyLabel() }}</span>
          </span>
        </label>
        @if (file() && !disabled()) {
          <button type="button" class="geo-file-input__clear" (click)="clear(nativeInput)">Remover arquivo</button>
        }
      </div>
    </geo-field>
  `
})
export class GeoFileInputComponent {
  private readonly generatedId = createControlId();
  readonly label = input<string>('');
  readonly inputId = input<string | undefined>();
  readonly description = input<string | undefined>();
  readonly error = input<string | undefined>();
  readonly required = input(false);
  readonly showOptional = input(false);
  readonly disabled = input(false);
  readonly accept = input('');
  readonly maxBytes = input<number | undefined>();
  readonly buttonLabel = input('Selecionar arquivo');
  readonly emptyLabel = input('Nenhum arquivo selecionado');
  readonly file = model<File | null>(null);
  readonly rejected = output<string>();
  readonly internalError = model<string | undefined>(undefined);
  readonly controlId = computed(() => this.inputId() || this.generatedId);
  readonly effectiveError = computed(() => this.error() || this.internalError());

  protected selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0] ?? null;
    this.internalError.set(undefined);
    if (!selected) { this.file.set(null); return; }
    const limit = this.maxBytes();
    if (limit !== undefined && selected.size > limit) {
      const message = `O arquivo excede o limite de ${this.formatBytes(limit)}.`;
      this.internalError.set(message); this.file.set(null); input.value = ''; this.rejected.emit(message); return;
    }
    this.file.set(selected);
  }

  protected clear(input: HTMLInputElement): void {
    input.value = ''; this.file.set(null); this.internalError.set(undefined);
  }

  private formatBytes(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)} MiB` : `${Math.round(bytes / 1024)} KiB`;
  }
}
