import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { PopoverModule } from 'primeng/popover';
import { GeoKanbanColumn, GeoKanbanMetrica } from './geo-kanban.types';

export interface KanbanCopilotoContext {
  columnId: string;
  columnLabel: string;
  metricas: GeoKanbanMetrica[];
}

/**
 * Botão ℹ que abre um popover com métricas agregadas da coluna Kanban.
 * Emite `copilotoClicked` com o contexto da coluna para que o pai
 * possa navegar até a Bússola com os filtros corretos.
 *
 * Uso de `primeng/popover` é interno ao DS — não é API de feature.
 */
@Component({
  selector: 'geo-kanban-column-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PopoverModule],
  template: `
    <button
      type="button"
      class="inline-flex items-center justify-center w-6 h-6 rounded-full
             text-[var(--geo-fg-muted)] hover:text-[var(--geo-fg-default)]
             hover:bg-[var(--geo-surface-raised)] transition-colors
             focus-visible:outline-2 focus-visible:outline-offset-2
             focus-visible:outline-[var(--geo-border-focus)]"
      [attr.aria-label]="'Métricas de ' + column().label"
      (click)="popoverRef.show($event)"
    >
      <i class="pi pi-info-circle text-[13px]" aria-hidden="true"></i>
    </button>

    <p-popover #popoverRef appendTo="body">
      <div class="min-w-[200px] max-w-[280px] p-1">
        <p class="text-sm font-semibold text-[var(--geo-fg-default)] mb-2">
          {{ column().label }}
        </p>

        @if (column().metricas?.length) {
          <div class="space-y-1 mb-3">
            @for (m of column().metricas; track m.label) {
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs text-[var(--geo-fg-muted)]">{{ m.label }}</span>
                <span
                  class="text-xs font-semibold"
                  [class.text-rose-600]="m.alerta && +m.valor > 0"
                  [class.text-[var(--geo-fg-default)]]="!(m.alerta && +m.valor > 0)"
                >
                  {{ formatarValor(m) }}
                </span>
              </div>
            }
          </div>
        } @else {
          <p class="text-xs text-[var(--geo-fg-muted)] mb-3">
            Sem métricas disponíveis.
          </p>
        }

        @if (temCopiloto()) {
          <hr class="border-[var(--geo-border)] mb-2" />
          <button
            type="button"
            class="w-full text-left text-xs text-[var(--geo-action-ghost-fg)]
                   hover:text-[var(--geo-action-ghost-fg-hover)]
                   hover:bg-[var(--geo-action-ghost-surface-hover)]
                   px-2 py-1.5 rounded-md transition-colors
                   focus-visible:outline-2 focus-visible:outline-offset-1
                   focus-visible:outline-[var(--geo-border-focus)]
                   flex items-center gap-1.5"
            (click)="onCopilotoClick()"
          >
            <i class="pi pi-compass text-[11px]" aria-hidden="true"></i>
            Analisar com Bússola
          </button>
        }
      </div>
    </p-popover>
  `,
})
export class GeoKanbanColumnInfoComponent {
  column = input.required<GeoKanbanColumn<unknown>>();
  /** Se fornecido, exibe o botão "Analisar com Bússola" */
  copilotoEnabled = input(false);

  /** Emitido quando o usuário clica em "Analisar com Bússola" */
  copilotoClicked = output<KanbanCopilotoContext>();

  protected readonly temCopiloto = computed(() => this.copilotoEnabled());

  protected formatarValor(m: GeoKanbanMetrica): string {
    const v = Number(m.valor);
    if (Number.isNaN(v)) return String(m.valor);
    if (m.formato === 'dias') return `${v}d`;
    if (m.formato === 'percentual') return `${v.toFixed(1)}%`;
    return String(m.valor);
  }

  protected onCopilotoClick(): void {
    this.copilotoClicked.emit({
      columnId: this.column().id,
      columnLabel: this.column().label,
      metricas: this.column().metricas ?? [],
    });
  }
}
