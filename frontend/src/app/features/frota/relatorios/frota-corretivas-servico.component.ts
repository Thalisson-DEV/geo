import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent
} from '@geo/ui';
import { CorretivaPorItem } from '../../../core/models/frota-preventiva.models';
import { contar } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPreventivaService } from '../../../core/services/frota-preventiva.service';
import { FrotaService } from '../../../core/services/frota.service';
import { dataIso } from '../../../shared/listagem/listagem';
import { basesFrota } from '../shared/frota-lista';
import { sinalBaseFrota } from '../shared/frota-base-compartilhada';

const PERIODOS: GeoSelectOption<number>[] = [
  { label: 'Últimos 30 dias', value: 30 },
  { label: 'Últimos 90 dias', value: 90 },
  { label: 'Últimos 6 meses', value: 182 },
  { label: 'Últimos 12 meses', value: 365 }
];

const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Relatório da frota — o que mais quebra: as corretivas concluídas por item de manutenção no período,
 * com quantos veículos e quanto custaram as OS. O item que quebra muito e nenhum plano cobre é
 * candidato a preventiva.
 */
@Component({
  selector: 'app-frota-corretivas-servico',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent, GeoCellDirective, GeoDataTableComponent, GeoMultiSelectComponent, GeoPageHeaderComponent, GeoSelectComponent, GeoStatusComponent],
  styles: `.valor { font-weight: 600; font-variant-numeric: tabular-nums; }`,
  template: `
    <div class="geo-page">
      <geo-page-header title="Corretivas por serviço" icon="pi pi-chart-bar"
        [breadcrumb]="[{ label: 'Frota' }, { label: 'Relatórios' }, { label: 'Corretivas por serviço' }]"
        description="O que mais quebra: as OS corretivas concluídas por item de manutenção, com quantos veículos e quanto custaram. Item que se repete sem plano é candidato a preventiva.">
        <ng-container ngProjectAs="[actions]">
          <geo-button variant="outline" icon="pi pi-calendar-clock" label="Planos de preventiva" (pressed)="irParaPlanos()"></geo-button>
        </ng-container>
      </geo-page-header>

      <geo-data-table title="Itens de manutenção" [description]="descricao()" storageKey="frota-preventiva-corretivas"
        exportFileName="corretivas-por-servico" searchPlaceholder="Filtrar item" [columns]="colunas" [rows]="linhas()" [rowKey]="chave"
        [state]="carregando() ? 'loading' : erro() ? 'error' : linhas().length ? 'ready' : 'empty'"
        [stateTitle]="erro() ? 'Não foi possível carregar as corretivas' : 'Nenhuma corretiva concluída no período'"
        [stateDescription]="erro() ?? 'As OS corretivas concluídas aparecem aqui, agrupadas pelo item de manutenção.'"
        rowActionLabel="Ver as OS" (rowActivate)="verOs($event)">
        <ng-container table-actions>
          <geo-select label="Período" [labelVisible]="false" [options]="periodos" [value]="dias()" (valueChange)="dias.set($event ?? 90)"></geo-select>
          <geo-multiselect label="Tipo de veículo" [labelVisible]="false" [options]="tipos()" [value]="idsTipo()" placeholder="Todos os tipos"
            (valueChange)="idsTipo.set($event)"></geo-multiselect>
          <geo-multiselect label="Base" [labelVisible]="false" [options]="bases.opcoes()" [value]="idsBase()" placeholder="Todas as bases"
            (valueChange)="idsBase.set($event)"></geo-multiselect>
        </ng-container>
        <ng-template geoCell="item" let-row>
          <span class="geo-cell-strong">{{ row.item }}</span>
          @if (row.ultima) { <span class="geo-cell-muted">Última em {{ row.ultima | date: 'dd/MM/yyyy' }}</span> }
        </ng-template>
        <ng-template geoCell="ordens" let-row>
          <span class="geo-cell-strong">{{ contar(row.ordens, 'OS', 'OS') }}</span>
          <span class="geo-cell-muted">{{ contar(row.veiculos, 'veículo', 'veículos') }}</span>
        </ng-template>
        <ng-template geoCell="valor" let-row><span class="valor">{{ moeda(row.valor) }}</span></ng-template>
        <ng-template geoCell="planos" let-row>
          @if (row.planos.length) {
            <geo-status tone="success" icon="pi-calendar">{{ row.planos.length === 1 ? 'No plano' : 'Em ' + row.planos.length + ' planos' }}</geo-status>
            <span class="geo-cell-muted">{{ row.planos.join(', ') }}</span>
          } @else {
            <geo-status [tone]="row.ordens > 1 ? 'warning' : 'neutral'" emphasis="outline">Sem plano</geo-status>
          }
        </ng-template>
      </geo-data-table>
    </div>
  `
})
export class FrotaCorretivasServicoComponent {
  private readonly preventiva = inject(FrotaPreventivaService);
  private readonly frota = inject(FrotaService);
  private readonly router = inject(Router);
  protected readonly bases = basesFrota();
  protected readonly periodos = PERIODOS;
  protected readonly contar = contar;
  protected readonly moeda = moeda;

  protected readonly dias = signal(90);
  protected readonly idsTipo = signal<string[]>([]);
  protected readonly idsBase = sinalBaseFrota();
  protected readonly tipos = signal<GeoSelectOption<string>[]>([]);
  protected readonly linhas = signal<CorretivaPorItem[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly descricao = computed(() => {
    if (this.carregando() && !this.linhas().length) return undefined;
    const semPlano = this.linhas().filter((l) => !l.planos.length && l.ordens > 1).length;
    const base = contar(this.linhas().length, 'item', 'itens', 'Nenhum item');
    return semPlano ? `${base} · ${contar(semPlano, 'repetido sem plano', 'repetidos sem plano')}` : base;
  });

  protected readonly colunas: GeoDataTableColumn<CorretivaPorItem>[] = [
    { key: 'item', header: 'Item de manutenção', type: 'custom', priority: 1, value: (l) => l.item, display: (l) => l.item },
    { key: 'ordens', header: 'Corretivas', type: 'custom', priority: 1, value: (l) => l.ordens, display: (l) => `${l.ordens} OS em ${l.veiculos} veículos` },
    { key: 'valor', header: 'Valor das OS', type: 'custom', priority: 1, value: (l) => l.valor, display: (l) => moeda(l.valor) },
    { key: 'planos', header: 'Preventiva', type: 'custom', priority: 1, value: (l) => l.planos.length, display: (l) => (l.planos.length ? l.planos.join(', ') : 'Sem plano') }
  ];
  protected readonly chave = (l: CorretivaPorItem) => l.idItem;

  constructor() {
    this.frota.tiposVeiculo(true).subscribe({
      next: (p) => this.tipos.set(p.content.map((t) => ({ label: t.nome, value: t.id }))),
      error: () => undefined
    });
    effect(() => {
      this.dias();
      this.idsTipo();
      this.idsBase();
      untracked(() => this.carregar());
    });
  }

  protected irParaPlanos(): void {
    void this.router.navigate(['/frota/cadastros/planos-preventiva']);
  }

  /** As corretivas concluídas do item na lista de OS, na mesma base e no mesmo período. */
  protected verOs(l: CorretivaPorItem): void {
    const de = new Date();
    de.setDate(de.getDate() - this.dias());
    // Mesmo período do relatório: a contagem da lista bate com a da linha.
    const queryParams: Record<string, string> = { item: l.idItem, tipo: 'CORRETIVA', situacao: 'CONCLUIDA', concluida: `${dataIso(de)}~` };
    if (this.idsBase().length) queryParams['base'] = this.idsBase().join(',');
    void this.router.navigate(['/frota/ordens-servico'], { queryParams });
  }

  private carregar(): void {
    const de = new Date();
    de.setDate(de.getDate() - this.dias());
    this.carregando.set(true);
    this.erro.set(null);
    this.preventiva.corretivas(dataIso(de), null, this.idsBase(), this.idsTipo()).subscribe({
      next: (l) => {
        this.linhas.set(l);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }
}
