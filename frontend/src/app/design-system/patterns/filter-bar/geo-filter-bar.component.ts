import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GeoButtonComponent } from '../../primitives/button/geo-button.component';

/**
 * Barra de filtros em linha, acima da tabela: os campos (projetados, `size="small"`, 28px), os
 * chips dos filtros ativos (slot `[chips]`) e "Limpar" quando há filtro ativo. Para muitos
 * filtros, prefira o `geo-filter-panel` recolhível; esta barra é para 1–4 filtros diretos.
 *
 *   <geo-filter-bar [activeCount]="ativos()" (clear)="limpar()">
 *     <p-select size="small" ... />
 *     <geo-chip chips ... />
 *   </geo-filter-bar>
 */
@Component({
  selector: 'geo-filter-bar',
  standalone: true,
  imports: [GeoButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-filter-bar', role: 'search', '[attr.aria-label]': 'ariaLabel()' },
  template: `
    <div class="geo-filter-bar__campos"><ng-content /></div>
    <div class="geo-filter-bar__chips"><ng-content select="[chips]" /></div>
    @if (activeCount() > 0) {
      <geo-button
        class="geo-filter-bar__limpar"
        variant="ghost"
        size="sm"
        icon="pi-filter-slash"
        [label]="activeCount() === 1 ? 'Limpar filtro' : 'Limpar ' + activeCount() + ' filtros'"
        (pressed)="clear.emit()"
      />
    }
    <div class="geo-filter-bar__fim"><ng-content select="[end]" /></div>
  `,
  styles: [`
    :host { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-block-size: var(--geo-control-height-md); }
    .geo-filter-bar__campos { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .geo-filter-bar__chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .geo-filter-bar__chips:empty { display: none; }
    .geo-filter-bar__fim { display: flex; align-items: center; gap: 8px; margin-inline-start: auto; }
    .geo-filter-bar__fim:empty { display: none; }
  `]
})
export class GeoFilterBarComponent {
  /** Quantos filtros estão ativos; com 1 ou mais, aparece "Limpar". */
  readonly activeCount = input(0);
  readonly ariaLabel = input('Filtros');
  readonly clear = output<void>();
}
