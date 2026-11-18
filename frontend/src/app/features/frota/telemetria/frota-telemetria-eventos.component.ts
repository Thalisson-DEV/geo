import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
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
  EventoTelemetria,
  ICONE_TIPO_EVENTO,
  ROTULO_TIPO_EVENTO,
  TOM_TIPO_EVENTO,
  TipoEventoTelemetria
} from '../../../core/models/frota-telemetria.models';
import { contar, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaEventoTelemetriaDrawerComponent } from './frota-evento-telemetria-drawer.component';

const CONDUTOR: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Só os sem condutor identificado', value: true }
];

/** Eventos de condução importados da telemetria, com o condutor de cada um. */
@Component({
  selector: 'app-frota-telemetria-eventos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    FrotaEventoTelemetriaDrawerComponent
  ],
  styles: `.tl-lista { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }`,
  template: `
    <div class="tl-lista" geoListShortcuts>
      <geo-filter-panel
        #painel
        storageKey="frota-telemetria-eventos"
        [activeCount]="lista.activeCount()"
        [summary]="lista.summary()"
        [loading]="resultado.loading()"
        (applied)="lista.apply()"
        (cleared)="lista.reset()"
        (chipRemoved)="lista.remove($any($event))"
      >
        <div class="geo-filter-grid">
          <geo-multiselect label="Tipo" [options]="tiposOpcoes" [(value)]="lista.filters.tipos" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
          <geo-select label="Condutor" [options]="condutorOpcoes" [(value)]="lista.filters.semCondutor"></geo-select>
          <geo-datepicker label="A partir de" [value]="dataLocal(lista.filters.periodo().from)" [clearable]="true" (valueChange)="periodo('from', $event)"></geo-datepicker>
          <geo-datepicker label="Até" [value]="dataLocal(lista.filters.periodo().to)" [clearable]="true" (valueChange)="periodo('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Eventos de condução"
        mode="server"
        [description]="descricaoTabela()"
        storageKey="frota-telemetria-eventos"
        exportFileName="frota-telemetria-eventos"
        rowActionLabel="Abrir evento"
        searchPlaceholder="Placa, condutor ou endereço"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowKey]="chave"
        [rowLabel]="rotuloLinha"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os eventos' : 'Nenhum evento de condução'"
        [stateDescription]="resultado.error() ?? 'Excesso de velocidade, frenagens e outros eventos aparecem aqui conforme os rastreadores informam.'"
        noResultsTitle="Nenhum evento com esse recorte."
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
        <ng-template geoCell="tipo" let-row>
          <geo-status [tone]="tom[row.tipo]" [icon]="icone[row.tipo]">{{ row.tipoRotulo }}</geo-status>
          @if (row.detalhe) { <span class="geo-cell-muted">{{ row.detalhe }}</span> }
        </ng-template>
        <ng-template geoCell="ocorridoEm" let-row>{{ row.ocorridoEm | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
        <ng-template geoCell="placa" let-row>
          @if (row.idVeiculo) {
            <a [routerLink]="['/frota/veiculos', row.idVeiculo]" [queryParams]="{ aba: 'telemetria' }" class="geo-cell-strong"
              (click)="$event.stopPropagation()">{{ placa(row.placa) }}</a>
          } @else { <span class="geo-cell-strong">{{ placa(row.placa) || '—' }}</span> }
          @if (row.base) { <span class="geo-cell-muted">{{ row.base }}</span> }
        </ng-template>
        <ng-template geoCell="condutor" let-row>
          @if (row.condutor) {
            <span>{{ row.condutor }}</span>
          } @else {
            <geo-status tone="neutral" emphasis="outline">Não identificado</geo-status>
          }
        </ng-template>
      </geo-data-table>
    </div>

    <app-frota-evento-telemetria-drawer [(visivel)]="drawerAberto" [evento]="selecionado()"></app-frota-evento-telemetria-drawer>
  `
})
export class FrotaTelemetriaEventosComponent {
  private readonly servico = inject(FrotaTelemetriaService);

  protected readonly tom: Record<string, GeoTone> = TOM_TIPO_EVENTO;
  protected readonly icone: Record<string, string> = ICONE_TIPO_EVENTO;
  protected readonly placa = formatarPlaca;
  protected readonly dataLocal = dataLocal;
  protected readonly bases = basesFrota();
  protected readonly condutorOpcoes = CONDUTOR;
  protected readonly drawerAberto = signal(false);
  protected readonly selecionado = signal<EventoTelemetria | null>(null);

  protected readonly tiposOpcoes = (Object.keys(ROTULO_TIPO_EVENTO) as TipoEventoTelemetria[])
    .map((t) => ({ label: ROTULO_TIPO_EVENTO[t], value: t }));

  protected readonly lista = geoListState({
    storageKey: 'frota-telemetria-eventos',
    rememberFilters: 'frota-telemetria-eventos',
    filters: {
      tipos: geoFilter.list<TipoEventoTelemetria>([], {
        label: 'Tipo', param: 'tipo', itemLabel: (t) => ROTULO_TIPO_EVENTO[t], countLabel: (n) => `${n} selecionados`
      }),
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      semCondutor: geoFilter.value<boolean | null>(null, { label: 'Condutor', param: 'semCondutor', options: () => CONDUTOR }),
      periodo: geoFilter.range({ from: null, to: null }, { label: 'Período' })
    },
    sort: [{ key: 'ocorridoEm', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<EventoTelemetria>(
    (pedido) => this.servico.listarEventos(this.filtro(pedido), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.servico.listarEventos(this.filtro(this.lista.request()), pagina),
    () => this.lista.request()
  );
  protected readonly descricaoTabela = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'evento', 'eventos', 'Nenhum evento'));

  protected readonly colunas: GeoDataTableColumn<EventoTelemetria>[] = [
    { key: 'tipo', header: 'Evento', type: 'custom', priority: 1, sortField: 'tipo', value: (e) => e.tipo, display: (e) => `${e.tipoRotulo} ${e.detalhe}` },
    { key: 'ocorridoEm', header: 'Quando', type: 'custom', priority: 1, sortField: 'ocorridoEm', value: (e) => e.ocorridoEm, display: (e) => e.ocorridoEm },
    { key: 'placa', header: 'Veículo', type: 'custom', sortField: 'placa', value: (e) => e.placa, display: (e) => formatarPlaca(e.placa) },
    { key: 'condutor', header: 'Condutor', type: 'custom', value: (e) => e.condutor, display: (e) => e.condutor ?? 'Não identificado' },
    { key: 'endereco', header: 'Local', display: (e) => e.endereco ?? '—' }
  ];
  protected readonly chave = (e: EventoTelemetria) => e.id;
  protected readonly rotuloLinha = (e: EventoTelemetria) => `${e.tipoRotulo} de ${formatarPlaca(e.placa) || 'veículo sem placa'}`;

  /** Atalho do indicador da tela: eventos das últimas 24 horas. */
  ultimasHoras(): void {
    const ontem = new Date(Date.now() - 86_400_000);
    this.lista.filters.periodo.set({ from: dataIso(ontem), to: null });
    this.lista.filters.tipos.set([]);
    this.lista.apply();
  }

  /** Abre pelo id (deeplink `?evento=` das notificações). */
  abrirPorId(id: string): void {
    this.servico.detalharEvento(id).subscribe({ next: (e) => this.abrir(e), error: () => undefined });
  }

  protected abrir(e: EventoTelemetria): void {
    this.selecionado.set(e);
    this.drawerAberto.set(true);
  }

  protected periodo(ponta: 'from' | 'to', data: Date | null): void {
    this.lista.filters.periodo.update((atual) => ({ ...atual, [ponta]: dataIso(data) }));
  }

  private filtro(pedido: { filters: { periodo: { from: string | null; to: string | null } } & object; query?: string }) {
    const { periodo, ...resto } = pedido.filters;
    return { ...resto, busca: pedido.query || null, de: inicioDoDia(periodo.from, 0), ate: inicioDoDia(periodo.to, 1) };
  }
}

/** Data civil (yyyy-mm-dd) → instante do início do dia local, deslocado em dias. */
function inicioDoDia(iso: string | null, deslocamento: number): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d + deslocamento).toISOString();
}
