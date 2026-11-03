import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CesButtonComponent, CesPageHeaderComponent } from '@ces/ui';
import { FrotaAcompanhamentoPreventivaComponent } from './frota-acompanhamento-preventiva.component';

/**
 * Preventiva da frota: o acompanhamento de cada plano em cada veículo. A análise do que mais quebra
 * (corretivas por serviço) fica em Frota › Relatórios.
 */
@Component({
  selector: 'app-frota-preventiva',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesButtonComponent, CesPageHeaderComponent, FrotaAcompanhamentoPreventivaComponent],
  template: `
    <div class="ces-page">
      <ces-page-header title="Preventiva" icon="pi pi-calendar-clock" [breadcrumb]="[{ label: 'Frota' }, { label: 'Manutenção' }, { label: 'Preventiva' }]"
        description="Quando cada veículo precisa da revisão: pelo km, pelas horas ou pela data, o que vencer primeiro. Os indicadores filtram a lista. Atalhos: / busca, F filtros.">
        <ng-container ngProjectAs="[actions]">
          <ces-button variant="outline" icon="pi pi-cog" label="Planos de preventiva" (pressed)="irParaPlanos()"></ces-button>
        </ng-container>
      </ces-page-header>

      <app-frota-acompanhamento-preventiva></app-frota-acompanhamento-preventiva>
    </div>
  `
})
export class FrotaPreventivaComponent {
  private readonly router = inject(Router);

  protected irParaPlanos(): void {
    void this.router.navigate(['/frota/cadastros/planos-preventiva']);
  }
}
