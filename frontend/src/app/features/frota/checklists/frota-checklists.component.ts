import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CesPageHeaderComponent, CesTabItem, CesTabPanelDirective, CesTabsComponent, cesUrlParam } from '@ces/ui';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { FrotaChecklistsPreenchidosComponent } from './frota-checklists-preenchidos.component';
import { FrotaLiberacoesCnhComponent } from './frota-liberacoes-cnh.component';
import { FrotaPendenciasChecklistComponent } from './frota-pendencias-checklist.component';
import { FrotaSemChecklistHojeComponent } from './frota-sem-checklist-hoje.component';

const ABAS = ['pendencias', 'preenchidos', 'sem-checklist', 'liberacoes'] as const;
type Aba = (typeof ABAS)[number];

/** Checklists do veículo: problemas para decidir, preenchidos, veículos sem checklist hoje e liberações de CNH. */
@Component({
  selector: 'app-frota-checklists',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesPageHeaderComponent, CesTabPanelDirective, CesTabsComponent, FrotaChecklistsPreenchidosComponent, FrotaLiberacoesCnhComponent,
    FrotaPendenciasChecklistComponent, FrotaSemChecklistHojeComponent],
  template: `
    <div class="ces-page">
      <ces-page-header title="Checklists" icon="pi pi-list-check" [breadcrumb]="[{ label: 'Frota' }, { label: 'Checklists' }]"
        description="O que os condutores conferiram no app antes de usar o veículo, com as fotos e os problemas apontados."></ces-page-header>

      <ces-tabs [tabs]="abas()" [(value)]="aba" ariaLabel="Seções dos checklists">
        <ng-template cesTabPanel="pendencias">
          <app-frota-pendencias-checklist (alterou)="contar()"></app-frota-pendencias-checklist>
        </ng-template>
        <ng-template cesTabPanel="sem-checklist">
          <app-frota-sem-checklist-hoje></app-frota-sem-checklist-hoje>
        </ng-template>
        <ng-template cesTabPanel="preenchidos">
          <app-frota-checklists-preenchidos></app-frota-checklists-preenchidos>
        </ng-template>
        <ng-template cesTabPanel="liberacoes">
          <app-frota-liberacoes-cnh></app-frota-liberacoes-cnh>
        </ng-template>
      </ces-tabs>
    </div>
  `
})
export class FrotaChecklistsComponent {
  private readonly checklist = inject(FrotaChecklistService);
  /** Contadores das abas que pedem atenção. */
  private readonly pendentes = signal<number | undefined>(undefined);
  private readonly semChecklist = signal<number | undefined>(undefined);
  protected readonly aba = cesUrlParam<Aba>({ values: ABAS, default: 'pendencias' });
  protected readonly abas = computed<CesTabItem[]>(() => [
    { value: 'pendencias', label: 'Pendências', icon: 'pi pi-exclamation-triangle', badge: this.pendentes() || undefined },
    { value: 'preenchidos', label: 'Preenchidos', icon: 'pi pi-list-check' },
    { value: 'sem-checklist', label: 'Sem checklist hoje', icon: 'pi pi-clock', badge: this.semChecklist() || undefined },
    { value: 'liberacoes', label: 'Liberações de CNH', icon: 'pi pi-unlock' }
  ]);

  constructor() {
    this.contar();
  }

  protected contar(): void {
    this.checklist.pendencias('ABERTA', [], { page: 0, size: 1 }).subscribe({
      next: (p) => this.pendentes.set(p.page.totalElements),
      error: () => undefined
    });
    this.checklist.semChecklistHoje().subscribe({ next: (l) => this.semChecklist.set(l.length), error: () => undefined });
  }
}
