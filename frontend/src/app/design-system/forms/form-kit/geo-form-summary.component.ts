import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GeoFormRegistry } from './form-kit.registry';

/**
 * Painel de resumo do **tipo C**: o conteúdo projetado (totais, itens, situação) e a lista de
 * **pendências** — campos inválidos já tocados (ou todos depois do primeiro envio). Cada pendência é
 * um botão que leva ao campo. Substitui a antiga etapa "Revisão".
 *
 * ```html
 * <geo-form-summary form-aside title="Resumo">
 *   <dl>…totais…</dl>
 * </geo-form-summary>
 * ```
 *
 * Fica dentro de `geo-form-page` (ou `geo-form-drawer`), que fornece o registro de campos.
 */
@Component({
  selector: 'geo-form-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-form-summary', role: 'complementary', '[attr.aria-label]': 'title()' },
  template: `
    <h2 class="geo-form-summary__title">{{ title() }}</h2>
    <div class="geo-form-summary__content"><ng-content></ng-content></div>

    <div class="geo-form-summary__status" aria-live="polite">
      @if (pendencias().length) {
        <p class="geo-form-summary__pending-title">
          <i class="pi pi-exclamation-circle" aria-hidden="true"></i>
          {{ pendencias().length === 1 ? '1 pendência' : pendencias().length + ' pendências' }}
        </p>
        <ul class="geo-form-summary__pending">
          @for (campo of pendencias(); track campo) {
            <li>
              <button type="button" (click)="campo.focus()">
                <span class="geo-form-summary__field">
                  @if (campo.sectionIcon()) {
                    <i [class]="campo.sectionIcon()" aria-hidden="true"></i>
                  }
                  {{ campo.label() }}
                </span>
                <span class="geo-form-summary__error">
                  @if (campo.section()) {
                    {{ campo.section() }} ·
                  }
                  {{ campo.errorText() }}
                </span>
              </button>
            </li>
          }
        </ul>
      } @else if (showReady()) {
        <p class="geo-form-summary__ready">
          <i class="pi pi-check-circle" aria-hidden="true"></i>
          {{ readyLabel() }}
        </p>
      }
    </div>
  `,
})
export class GeoFormSummaryComponent {
  private readonly registry = inject(GeoFormRegistry);

  readonly title = input('Resumo');
  readonly readyLabel = input('Tudo certo para enviar.');
  /** Mostra a mensagem de pronto quando não há pendências. */
  readonly showReady = input(true);

  protected readonly pendencias = computed(() => this.registry.pending());
}
