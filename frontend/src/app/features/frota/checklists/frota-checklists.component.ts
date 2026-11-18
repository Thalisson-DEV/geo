import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  geoUrlParam
} from '@geo/ui';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { basesFrota } from '../shared/frota-lista';
import { FrotaChecklistsPreenchidosComponent } from './frota-checklists-preenchidos.component';
import { FrotaLiberacoesCnhComponent } from './frota-liberacoes-cnh.component';
import { FrotaPendenciasChecklistComponent } from './frota-pendencias-checklist.component';
import { FrotaSemChecklistHojeComponent } from './frota-sem-checklist-hoje.component';
import { sinalBaseFrota } from '../shared/frota-base-compartilhada';

const ABAS = ['pendencias', 'preenchidos', 'sem-checklist', 'liberacoes'] as const;
type Aba = (typeof ABAS)[number];
/** Cada gestor costuma olhar sempre as mesmas bases: a escolha fica no navegador. */
/** Checklists do veículo: problemas para decidir, preenchidos, veículos sem checklist hoje e liberações de CNH. */
@Component({
  selector: 'app-frota-checklists',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoMultiSelectComponent, GeoPageHeaderComponent, GeoTabPanelDirective, GeoTabsComponent, FrotaChecklistsPreenchidosComponent,
    FrotaLiberacoesCnhComponent, FrotaPendenciasChecklistComponent, FrotaSemChecklistHojeComponent],
  styles: `
    .checklists-base { min-width: min(16rem, 100%); }
  `,
  template: `
    <div class="geo-page">
      <geo-page-header title="Checklists" icon="pi pi-list-check" [breadcrumb]="[{ label: 'Frota' }, { label: 'Checklists' }]"
        description="O que os condutores conferiram no app antes de usar o veículo, com as fotos e os problemas apontados.">
        <!-- Os preenchidos têm o próprio painel de filtros, com a base entre eles. -->
        @if (aba() !== 'preenchidos') {
          <geo-multiselect actions class="checklists-base" label="Base" [labelVisible]="false" [options]="bases.opcoes()"
            [value]="idsBase()" (valueChange)="escolherBases($event)" placeholder="Todas as bases" [clearable]="true"
            selectedItemsLabel="{0} bases"></geo-multiselect>
        }
      </geo-page-header>

      <geo-tabs [tabs]="abas()" [(value)]="aba" ariaLabel="Seções dos checklists">
        <ng-template geoTabPanel="pendencias">
          <app-frota-pendencias-checklist [idsBase]="idsBase()" (alterou)="contar()"></app-frota-pendencias-checklist>
        </ng-template>
        <ng-template geoTabPanel="sem-checklist">
          <app-frota-sem-checklist-hoje [idsBase]="idsBase()"></app-frota-sem-checklist-hoje>
        </ng-template>
        <ng-template geoTabPanel="preenchidos">
          <app-frota-checklists-preenchidos></app-frota-checklists-preenchidos>
        </ng-template>
        <ng-template geoTabPanel="liberacoes">
          <app-frota-liberacoes-cnh [idsBase]="idsBase()"></app-frota-liberacoes-cnh>
        </ng-template>
      </geo-tabs>
    </div>
  `
})
export class FrotaChecklistsComponent {
  private readonly checklist = inject(FrotaChecklistService);
  protected readonly bases = basesFrota();
  /** Bases escolhidas no topo; valem para pendências, sem checklist hoje e liberações. Vazio é todas. */
  protected readonly idsBase = sinalBaseFrota();
  /** Contadores das abas que pedem atenção. */
  private readonly pendentes = signal<number | undefined>(undefined);
  private readonly semChecklist = signal<number | undefined>(undefined);
  protected readonly aba = geoUrlParam<Aba>({ values: ABAS, default: 'pendencias' });
  protected readonly abas = computed<GeoTabItem[]>(() => [
    { value: 'pendencias', label: 'Pendências', icon: 'pi pi-exclamation-triangle', badge: this.pendentes() || undefined },
    { value: 'preenchidos', label: 'Preenchidos', icon: 'pi pi-list-check' },
    { value: 'sem-checklist', label: 'Sem checklist hoje', icon: 'pi pi-clock', badge: this.semChecklist() || undefined },
    { value: 'liberacoes', label: 'Liberações de CNH', icon: 'pi pi-unlock' }
  ]);

  constructor() {
    effect(() => {
      this.idsBase();
      untracked(() => this.contar());
    });
  }

  protected escolherBases(ids: string[] | null): void {
    const escolhidas = ids ?? [];
    // A base escolhida vale também nas outras telas da frota.
    this.idsBase.set(escolhidas);
  }

  protected contar(): void {
    const bases = this.idsBase();
    this.checklist.pendencias('ABERTA', bases, { page: 0, size: 1 }).subscribe({
      next: (p) => this.pendentes.set(p.page.totalElements),
      error: () => undefined
    });
    this.checklist.semChecklistHoje(bases).subscribe({ next: (l) => this.semChecklist.set(l.length), error: () => undefined });
  }
}
