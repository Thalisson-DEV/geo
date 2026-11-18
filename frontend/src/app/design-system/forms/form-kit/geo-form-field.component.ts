import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  computed,
  contentChild,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { AbstractControl, NgControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { GEO_FORM_SECTION, GeoFormRegistry } from './form-kit.registry';
import { GeoErrorMessages, geoErrorMessage, geoFocusableIn, geoIsRequired } from './form-kit.utils';

/**
 * Largura do campo na grade de 12 colunas da seção. Proporcional ao conteúdo: CEP/UF/quantidade
 * não ocupam a linha inteira. Em telas estreitas todo campo vira linha inteira.
 */
export type GeoFormFieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SPANS: Record<GeoFormFieldSize, number> = { xs: 2, sm: 3, md: 4, lg: 6, xl: 8, full: 12 };

let fieldSequence = 0;

/**
 * Campo do kit de formulário: rótulo, indicador de obrigatório, ajuda, erro e largura.
 *
 * ```html
 * <geo-form-field label="Número do contrato" size="md" hint="Como aparece no contrato assinado">
 *   <input pInputText formControlName="numero" />
 * </geo-form-field>
 * ```
 *
 * O controle projetado (`formControlName`, `[formControl]` ou `ngModel`) é detectado sozinho:
 * obrigatório vem do `Validators.required`, e o erro aparece depois que o campo é tocado (ou no envio,
 * com `markAllAsTouched`). O elemento focável recebe `aria-labelledby`, `aria-describedby`,
 * `aria-invalid` e `aria-required`.
 */
@Component({
  selector: 'geo-form-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-form-field',
    '[style.--geo-form-span]': 'span()',
    '[class.geo-form-field--invalid]': 'invalid()',
    '[class.geo-form-field--disabled]': 'isDisabled()',
    '[class.geo-form-field--readonly]': 'readonly()',
  },
  template: `
    <div class="geo-form-field__heading">
      <label class="geo-form-field__label" [id]="labelId" [attr.for]="nativeId()">
        {{ label() }}
        @if (isRequired() && !readonly()) {
          <span class="geo-form-field__required" aria-hidden="true">*</span>
        }
      </label>
      @if (help()) {
        <i class="pi pi-info-circle geo-form-field__help" [attr.title]="help()" [attr.aria-label]="help()" role="img"></i>
      }
    </div>

    <div class="geo-form-field__control">
      <ng-content></ng-content>
    </div>

    @if (errorText(); as erro) {
      <p class="geo-form-field__message geo-form-field__message--error" [id]="messageId">
        <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
        <span>{{ erro }}</span>
      </p>
    } @else if (disabledReason() && isDisabled()) {
      <p class="geo-form-field__message" [id]="messageId">
        <i class="pi pi-lock" aria-hidden="true"></i>
        <span>{{ disabledReason() }}</span>
      </p>
    } @else if (hint()) {
      <p class="geo-form-field__message" [id]="messageId">{{ hint() }}</p>
    }
  `,
})
export class GeoFormFieldComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly registry = inject(GeoFormRegistry, { optional: true });
  private readonly section = inject(GEO_FORM_SECTION, { optional: true });

  readonly label = input.required<string>();
  readonly size = input<GeoFormFieldSize>('lg');
  /** Texto de apoio abaixo do campo. */
  readonly hint = input<string | undefined>();
  /** Ajuda curta no ícone ao lado do rótulo. */
  readonly help = input<string | undefined>();
  /** Força o indicador de obrigatório; por padrão vem do `Validators.required`. */
  readonly required = input<boolean | undefined>(undefined);
  /** Erro definido pela tela (ex.: retorno do servidor). Tem prioridade sobre os validadores. */
  readonly error = input<string | null | undefined>();
  readonly errorMessages = input<GeoErrorMessages>({});
  /** Motivo exibido quando o controle está desabilitado. */
  readonly disabledReason = input<string | undefined>();
  readonly readonly = input(false);
  /** Controle explícito, quando não há `formControlName`/`ngModel` projetado. */
  readonly control = input<AbstractControl | null | undefined>();

  private readonly ngControl = contentChild(NgControl, { descendants: true });
  private readonly version = signal(0);

  protected readonly labelId = `geo-form-field-${++fieldSequence}-label`;
  protected readonly messageId = `geo-form-field-${fieldSequence}-message`;
  protected readonly nativeId = signal<string | null>(null);

  readonly span = computed(() => SPANS[this.size()] ?? 12);
  readonly resolvedControl = computed<AbstractControl | null>(
    () => this.control() ?? this.ngControl()?.control ?? null,
  );
  protected readonly isRequired = computed(() => {
    this.version();
    return this.required() ?? geoIsRequired(this.resolvedControl());
  });
  protected readonly isDisabled = computed(() => {
    this.version();
    return !!this.resolvedControl()?.disabled;
  });
  readonly errorText = computed<string | null>(() => {
    this.version();
    const manual = this.error();
    if (manual) return manual;
    const control = this.resolvedControl();
    if (!control || control.disabled || !control.invalid || !control.touched) return null;
    return geoErrorMessage(control.errors, this.errorMessages());
  });
  readonly invalid = computed(() => !!this.errorText());

  constructor() {
    let subscription: Subscription | undefined;
    effect(() => {
      subscription?.unsubscribe();
      const control = this.resolvedControl();
      subscription = control?.events.subscribe(() => {
        this.version.update((value) => value + 1);
        this.registry?.touch();
      });
      this.version.update((value) => value + 1);
    });
    inject(DestroyRef).onDestroy(() => subscription?.unsubscribe());

    if (this.registry) {
      const unregister = this.registry.addField({
        label: this.label,
        control: this.resolvedControl,
        section: () => this.section?.title() ?? null,
        sectionIcon: () => this.section?.icon() ?? null,
        invalid: () => this.invalid(),
        errorText: () => this.errorText(),
        focus: () => this.focus(),
        element: () => this.host.nativeElement,
      });
      inject(DestroyRef).onDestroy(unregister);
    }

    // Os controles do PrimeNG desenham o elemento focável depois; sincroniza a cada renderização.
    afterEveryRender(() => this.syncAria());
  }

  /** Foca o controle do campo e o traz para a área visível. */
  focus(): void {
    const target = geoFocusableIn(this.host.nativeElement.querySelector('.geo-form-field__control'));
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }

  private syncAria(): void {
    const target = geoFocusableIn(this.host.nativeElement.querySelector('.geo-form-field__control'));
    if (!target) return;
    const native = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (native && !target.id) target.id = `${this.labelId.replace(/-label$/, '')}-control`;
    const nativeId = native ? target.id : null;
    if (this.nativeId() !== nativeId) this.nativeId.set(nativeId);

    setAttr(target, 'aria-labelledby', native ? null : this.labelId);
    const hasMessage = !!(this.errorText() || this.hint() || (this.disabledReason() && this.isDisabled()));
    setAttr(target, 'aria-describedby', hasMessage ? this.messageId : null);
    setAttr(target, 'aria-invalid', this.invalid() ? 'true' : null);
    setAttr(target, 'aria-required', this.isRequired() ? 'true' : null);
  }
}

function setAttr(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    if (element.hasAttribute(name)) element.removeAttribute(name);
  } else if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}
