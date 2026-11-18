import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoIconButtonComponent,
  GeoRowActionsDirective,
  GeoStatusComponent
} from '@geo/ui';
import { VeiculoSemChecklist } from '../../../core/models/frota-checklist.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';

/**
 * Veículos usados hoje sem o checklist do dia, ou com troca de condutor depois dele. A falta não
 * bloqueia nada: a lista é para cobrar, e às 10h cada base recebe o aviso.
 */
@Component({
  selector: 'app-frota-sem-checklist-hoje',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent, GeoCellDirective, GeoDataTableComponent, GeoIconButtonComponent, GeoRowActionsDirective, GeoStatusComponent],
  template: `
    <geo-data-table title="Sem checklist hoje"
      description="Usados hoje (KM lançado, OS ou troca de condutor) sem o checklist do dia. Não bloqueia nada; às 10h cada base recebe o aviso."
      storageKey="frota-sem-checklist" searchPlaceholder="Filtrar nesta lista" [(query)]="busca" [columns]="colunas" [rows]="veiculos()" [rowKey]="chave"
      [state]="carregando() ? 'loading' : erro() ? 'error' : veiculos().length ? 'ready' : 'empty'"
      [stateTitle]="erro() ? 'Não foi possível carregar' : 'Todos os veículos usados hoje têm checklist'"
      [stateDescription]="erro() ?? 'Nenhum veículo foi usado hoje sem o checklist do dia.'"
      [rowClickable]="true" (rowActivate)="verVeiculo($event)">
      <ng-container table-actions>
        <geo-button size="sm" variant="outline" icon="pi pi-refresh" label="Atualizar" [loading]="carregando()" (pressed)="carregar()"></geo-button>
      </ng-container>
      <ng-template geoCell="placa" let-row>
        <span class="geo-cell-strong">{{ placa(row.placa) }}</span>
        <span class="geo-cell-muted">{{ row.baseNome ?? 'Sem base' }}</span>
      </ng-template>
      <ng-template geoCell="motivo" let-row>
        <geo-status tone="warning" icon="pi-exclamation-triangle">{{ row.motivo }}</geo-status>
      </ng-template>
      <ng-template geoCell="ultimoChecklistEm" let-row>
        @if (row.ultimoChecklistEm) {
          {{ row.ultimoChecklistEm | date: 'HH:mm' }}
        } @else {
          <span class="geo-cell-muted">Nenhum hoje</span>
        }
      </ng-template>
      <ng-template geoRowActions let-row>
        <span class="geo-table-actions">
          <geo-icon-button icon="pi pi-external-link" [label]="'Abrir o veículo ' + placa(row.placa)" tooltip="Abrir o veículo" size="icon-sm" (pressed)="verVeiculo(row)"></geo-icon-button>
        </span>
      </ng-template>
    </geo-data-table>
  `
})
export class FrotaSemChecklistHojeComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly router = inject(Router);
  /** Bases escolhidas no topo da página; vazio é todas. */
  readonly idsBase = input<string[]>([]);

  protected readonly placa = formatarPlaca;
  protected readonly veiculos = signal<VeiculoSemChecklist[]>([]);
  /** Aberta com ?busca= (o mapa da frota leva a placa): a lista já vem filtrada. */
  protected readonly busca = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('busca') ?? '');
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly colunas: GeoDataTableColumn<VeiculoSemChecklist>[] = [
    { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, value: (v) => v.placa, display: (v) => `${formatarPlaca(v.placa)} ${v.baseNome ?? ''}` },
    { key: 'motivo', header: 'Situação', type: 'custom', priority: 1, value: (v) => v.motivo, display: (v) => v.motivo },
    { key: 'condutorAtualNome', header: 'Condutor agora', priority: 1, display: (v) => v.condutorAtualNome ?? 'Sem condutor vinculado' },
    { key: 'ultimoChecklistEm', header: 'Último checklist hoje', type: 'custom', value: (v) => v.ultimoChecklistEm ?? '', display: (v) => v.ultimoChecklistEm ?? '' }
  ];
  protected readonly chave = (v: VeiculoSemChecklist) => v.idVeiculo;

  constructor() {
    effect(() => {
      this.idsBase();
      untracked(() => this.carregar());
    });
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.checklist.semChecklistHoje(this.idsBase()).subscribe({
      next: (lista) => {
        this.veiculos.set(lista);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected verVeiculo(v: VeiculoSemChecklist): void {
    void this.router.navigate(['/frota/veiculos', v.idVeiculo]);
  }
}
