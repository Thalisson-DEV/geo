import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTone,
  geoFilter,
  geoListState
} from '@geo/ui';

import {
  ProvedorTelemetria,
  ROTULO_PROVEDOR,
  ROTULO_SITUACAO_RASTREADOR,
  RastreadorTelemetria,
  SituacaoRastreador,
  TOM_SITUACAO_RASTREADOR,
  haQuanto
} from '../../../core/models/frota-telemetria.models';
import { contar, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaRastreadorDrawerComponent } from './frota-rastreador-drawer.component';

const SIM: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Só os sem comunicação há 24 h', value: true }
];

/** Rastreadores dos provedores, vinculados ou não a um veículo da frota. */
@Component({
  selector: 'app-frota-telemetria-rastreadores',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    FrotaRastreadorDrawerComponent
  ],
  styles: `.tl-lista { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }`,
  template: `
    <div class="tl-lista" geoListShortcuts>
      <geo-filter-panel
        #painel
        storageKey="frota-telemetria-rastreadores"
        [activeCount]="lista.activeCount()"
        [summary]="lista.summary()"
        [loading]="resultado.loading()"
        (applied)="lista.apply()"
        (cleared)="lista.reset()"
        (chipRemoved)="lista.remove($any($event))"
      >
        <div class="geo-filter-grid">
          <geo-multiselect label="Situação" [options]="situacoesOpcoes" [(value)]="lista.filters.situacoes" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Provedor" [options]="provedoresOpcoes" [(value)]="lista.filters.provedores" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
          <geo-select label="Comunicação" [options]="sim" [(value)]="lista.filters.semComunicacao"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Rastreadores"
        mode="server"
        [description]="descricaoTabela()"
        storageKey="frota-telemetria-rastreadores"
        exportFileName="frota-telemetria-rastreadores"
        rowActionLabel="Abrir rastreador"
        searchPlaceholder="Placa, nome no provedor ou motorista"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowKey]="chave"
        [rowLabel]="rotuloLinha"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os rastreadores' : 'Nenhum rastreador ainda'"
        [stateDescription]="resultado.error() ?? 'Os rastreadores aparecem sozinhos assim que os provedores mandam a primeira leitura.'"
        noResultsTitle="Nenhum rastreador com esse recorte."
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (rowActivate)="abrir($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
      >
        <div table-filters class="geo-quick-filters" role="group" aria-label="Atalhos de rastreadores">
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="semVeiculoAplicado()" (click)="alternarSemVeiculo()">
            <i class="pi pi-question-circle" aria-hidden="true"></i> Sem veículo
          </button>
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="lista.applied().semComunicacao === true" (click)="alternarSemSinal()">
            <i class="pi pi-wifi" aria-hidden="true"></i> Sem sinal há 24 h
          </button>
        </div>
        <ng-template geoCell="veiculo" let-row>
          @if (row.idVeiculo) {
            <a [routerLink]="['/frota/veiculos', row.idVeiculo]" [queryParams]="{ aba: 'telemetria' }" class="geo-cell-strong"
              (click)="$event.stopPropagation()">{{ placa(row.placa) }}</a>
            @if (row.base) { <span class="geo-cell-muted">{{ row.base }}</span> }
          } @else {
            <span class="geo-cell-strong">{{ row.placaProvedor ?? row.nomeProvedor ?? row.idExterno }}</span>
            <span class="geo-cell-muted">Placa no provedor</span>
          }
        </ng-template>
        <ng-template geoCell="situacao" let-row>
          <geo-status [tone]="tom[row.situacao]">{{ row.situacaoRotulo }}</geo-status>
          @if (row.vinculoManual) { <span class="geo-cell-muted">Vínculo manual</span> }
        </ng-template>
        <ng-template geoCell="comunicacao" let-row>
          @if (row.semComunicacao) {
            <geo-status tone="warning" icon="pi pi-exclamation-triangle">{{ quanto(row.ultimaComunicacao) }}</geo-status>
          } @else {
            <span>{{ quanto(row.ultimaComunicacao) }}</span>
          }
          @if (row.ultimaComunicacao) { <span class="geo-cell-muted">{{ row.ultimaComunicacao | date: 'dd/MM HH:mm' }}</span> }
        </ng-template>
        <ng-template geoCell="movimento" let-row>
          @if (!row.ultimaComunicacao) {
            <span class="geo-cell-muted">—</span>
          } @else if (row.velocidadeKmh != null && row.velocidadeKmh > 3) {
            <span class="geo-cell-num">{{ row.velocidadeKmh | number: '1.0-0' }} km/h</span>
          } @else {
            <span class="geo-cell-muted">Parado</span>
          }
          @if (row.ultimaComunicacao && row.ignicao != null) { <span class="geo-cell-muted">Ignição {{ row.ignicao ? 'ligada' : 'desligada' }}</span> }
        </ng-template>
      </geo-data-table>
    </div>

    <app-frota-rastreador-drawer [(visivel)]="drawerAberto" [rastreador]="selecionado()" (alterado)="aoAlterar($event)"></app-frota-rastreador-drawer>
  `
})
export class FrotaTelemetriaRastreadoresComponent {
  private readonly servico = inject(FrotaTelemetriaService);
  /** Um vínculo mudou: a tela atualiza os indicadores. */
  readonly alterado = output<void>();

  protected readonly tom: Record<string, GeoTone> = TOM_SITUACAO_RASTREADOR;
  protected readonly placa = formatarPlaca;
  protected readonly quanto = haQuanto;
  protected readonly sim = SIM;
  protected readonly bases = basesFrota();
  protected readonly drawerAberto = signal(false);
  protected readonly selecionado = signal<RastreadorTelemetria | null>(null);

  protected readonly situacoesOpcoes = (Object.keys(ROTULO_SITUACAO_RASTREADOR) as SituacaoRastreador[])
    .map((s) => ({ label: ROTULO_SITUACAO_RASTREADOR[s], value: s }));
  protected readonly provedoresOpcoes = (Object.keys(ROTULO_PROVEDOR) as ProvedorTelemetria[])
    .map((p) => ({ label: ROTULO_PROVEDOR[p], value: p }));

  protected readonly lista = geoListState({
    storageKey: 'frota-telemetria-rastreadores',
    rememberFilters: 'frota-telemetria-rastreadores',
    filters: {
      situacoes: geoFilter.list<SituacaoRastreador>([], {
        label: 'Situação', param: 'situacao', itemLabel: (s) => ROTULO_SITUACAO_RASTREADOR[s], countLabel: (n) => `${n} selecionadas`
      }),
      provedores: geoFilter.list<ProvedorTelemetria>([], {
        label: 'Provedor', param: 'provedor', itemLabel: (p) => ROTULO_PROVEDOR[p], countLabel: (n) => `${n} selecionados`
      }),
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      semComunicacao: geoFilter.value<boolean | null>(null, { label: 'Comunicação', param: 'semComunicacao', options: () => SIM })
    },
    sort: [{ key: 'situacao', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<RastreadorTelemetria>(
    (pedido) => this.servico.listarRastreadores(this.filtro(pedido), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.servico.listarRastreadores(this.filtro(this.lista.request()), pagina),
    () => this.lista.request()
  );
  protected readonly descricaoTabela = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined
      : contar(this.resultado.total(), 'rastreador', 'rastreadores', 'Nenhum rastreador'));

  protected readonly colunas: GeoDataTableColumn<RastreadorTelemetria>[] = [
    { key: 'veiculo', header: 'Veículo', type: 'custom', priority: 1, value: (r) => r.placa ?? r.placaProvedor,
      display: (r) => (r.placa ? formatarPlaca(r.placa) : r.placaProvedor ?? r.idExterno) },
    { key: 'provedor', header: 'Provedor', sortField: 'provedor', display: (r) => r.provedorRotulo },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, sortField: 'situacao', value: (r) => r.situacao, display: (r) => r.situacaoRotulo },
    { key: 'comunicacao', header: 'Última comunicação', type: 'custom', sortField: 'ultimaComunicacao', value: (r) => r.ultimaComunicacao,
      display: (r) => r.ultimaComunicacao ?? 'nunca' },
    { key: 'movimento', header: 'Agora', type: 'custom', value: (r) => r.velocidadeKmh, display: (r) => (r.velocidadeKmh ? `${r.velocidadeKmh} km/h` : 'Parado') },
    { key: 'motorista', header: 'Motorista', display: (r) => r.condutor ?? r.motoristaNome ?? '—' }
  ];
  protected readonly chave = (r: RastreadorTelemetria) => r.id;
  protected readonly rotuloLinha = (r: RastreadorTelemetria) =>
    `rastreador ${r.placa ? formatarPlaca(r.placa) : r.placaProvedor ?? r.idExterno} (${r.provedorRotulo})`;

  /** Atalhos dos indicadores da tela. */
  aplicar(recorte: { situacoes?: SituacaoRastreador[]; semComunicacao?: boolean | null }): void {
    this.lista.filters.situacoes.set(recorte.situacoes ?? []);
    this.lista.filters.semComunicacao.set(recorte.semComunicacao ?? null);
    this.lista.filters.provedores.set([]);
    this.lista.apply();
  }

  protected semVeiculoAplicado(): boolean {
    const s = this.lista.applied().situacoes;
    return s.length === 1 && s[0] === 'SEM_VEICULO';
  }

  protected alternarSemVeiculo(): void {
    this.lista.set('situacoes', this.semVeiculoAplicado() ? [] : ['SEM_VEICULO']);
  }

  protected alternarSemSinal(): void {
    this.lista.set('semComunicacao', this.lista.applied().semComunicacao === true ? null : true);
  }

  recarregar(): void {
    this.lista.reload();
  }

  /** Abre pelo id (deeplink `?rastreador=`). */
  abrirPorId(id: string): void {
    this.servico.detalharRastreador(id).subscribe({ next: (r) => this.abrir(r), error: () => undefined });
  }

  protected abrir(r: RastreadorTelemetria): void {
    this.selecionado.set(r);
    this.drawerAberto.set(true);
  }

  protected aoAlterar(r: RastreadorTelemetria): void {
    this.selecionado.set(r);
    this.lista.reload();
    this.alterado.emit();
  }

  private filtro(pedido: { filters: object; query?: string }) {
    return { ...pedido.filters, busca: pedido.query || null };
  }
}
