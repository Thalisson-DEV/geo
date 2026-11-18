import { ICONE_LEITURA } from '../../../core/models/frota.models';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GeoCellDirective,
  GeoRowActionsDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoStatusComponent,
  NotificationService,
  GeoTone,
  geoFilter,
  geoListState
} from '@geo/ui';
import {
  LeituraOdometro,
  OrigemLeituraOdometro,
  ROTULO_LEITURA,
  ROTULO_ORIGEM_LEITURA,
  SituacaoLeituraOdometro,
  TOM_LEITURA,
  contar,
  formatarMedida,
  formatarPlaca,
  formatarMedicao,
  rotuloOrigemLeitura
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaJustificativaDrawerComponent } from '../shared/frota-justificativa-drawer.component';

/** Fila de conferência do odômetro: leituras incoerentes com o histórico, para anular ou confirmar. */
@Component({
  selector: 'app-frota-odometro',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    GeoCellDirective,
    GeoRowActionsDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoStatusComponent,
    FrotaJustificativaDrawerComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts>
      <geo-page-header
        title="Conferência de KM"
        icon="pi pi-gauge"
        [breadcrumb]="[{ label: 'Frota' }, { label: 'Conferência de KM' }]"
        description="Leituras com KM menor que a anterior, maior que a seguinte ou com salto acima do limite diário. Não contam para o KM atual até serem confirmadas. Atalho: F filtros."
      ></geo-page-header>

      <geo-filter-panel
        #painel
        storageKey="frota-odometro"
        [activeCount]="lista.activeCount()"
        [summary]="lista.summary()"
        [loading]="resultado.loading()"
        (applied)="lista.apply()"
        (cleared)="lista.reset()"
        (chipRemoved)="lista.remove($any($event))"
      >
        <div class="geo-filter-grid">
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Situação" [options]="situacoesOpcoes" [(value)]="lista.filters.situacoes" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Origem" [options]="origensOpcoes" [(value)]="lista.filters.origens" [filter]="false" placeholder="Todas"></geo-multiselect>
        </div>
      </geo-filter-panel>

      <!-- O endpoint de leituras não tem busca textual: a busca da tabela fica desligada (tasks.md 2.3). -->
      <geo-data-table
        title="Leituras"
        mode="server"
        [description]="descricaoTabela()"
        [searchable]="false"
        storageKey="frota-odometro"
        exportFileName="frota-odometro"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowKey]="chave"
        [rowLabel]="rotuloLinha"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as leituras' : 'Nada para conferir'"
        [stateDescription]="resultado.error() ?? (lista.filtered() ? undefined : 'Nenhuma leitura inconsistente agora. Para ver todas as leituras, remova a situação nos filtros.')"
        noResultsTitle="Nenhuma leitura com esse recorte."
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
      >
        <ng-template geoCell="placa" let-row>
          <a [routerLink]="['/frota/veiculos', row.idVeiculo]" [queryParams]="{ aba: 'odometro' }" class="geo-cell-strong" [attr.aria-label]="'Abrir o odômetro do veículo ' + placa(row.placa)">{{ placa(row.placa) }}</a>
        </ng-template>
        <ng-template geoCell="lidoEm" let-row>{{ row.lidoEm | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
        <ng-template geoCell="km" let-row>
          <span class="geo-cell-strong geo-cell-num">{{ medicao(row.km, row.unidade) }}</span>
          @if (row.kmAnterior != null) {
            <span class="geo-cell-muted">{{ row.tipo === 'TROCA_PAINEL' ? 'Painel antigo' : 'Anterior' }}: {{ medicao(row.kmAnterior, row.unidade) }}</span>
          }
        </ng-template>
        <ng-template geoCell="situacao" let-row>
          <geo-status [tone]="tom[row.situacao]" [icon]="icone[row.situacao]">{{ rotulo[row.situacao] }}</geo-status>
          @if (row.justificativaAnulacao || row.motivoSituacao) {
            <span class="geo-cell-muted">{{ row.justificativaAnulacao ?? row.motivoSituacao }}</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          @if (acesso.anularKm() && row.situacao !== 'ANULADA') {
            <span class="geo-table-actions">
              @if (row.situacao === 'INCONSISTENTE') {
                <geo-icon-button icon="pi pi-check" [label]="'Confirmar ' + rotuloLinha(row)" tooltip="Confirmar leitura" size="icon-sm"
                  (pressed)="pedir(row, 'confirmar')"></geo-icon-button>
              }
              <geo-icon-button icon="pi pi-ban" [label]="'Anular ' + rotuloLinha(row)" tooltip="Anular leitura" size="icon-sm" (pressed)="pedir(row, 'anular')"></geo-icon-button>
            </span>
          }
        </ng-template>
      </geo-data-table>
    </div>

    <app-frota-justificativa-drawer
      [(visivel)]="justificativaAberta"
      [titulo]="acao() === 'anular' ? 'Anular leitura de KM' : 'Confirmar leitura de KM'"
      [descricao]="descricaoAcao()"
      [rotuloConfirmar]="acao() === 'anular' ? 'Anular leitura' : 'Confirmar leitura'"
      [destrutivo]="acao() === 'anular'"
      [processando]="processando()"
      (confirmado)="executar($event)"
    ></app-frota-justificativa-drawer>
  `
})
export class FrotaOdometroComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  protected readonly acesso = acessoFrota();

  protected readonly tom: Record<string, GeoTone> = TOM_LEITURA;
  protected readonly icone: Record<string, string> = ICONE_LEITURA;
  protected readonly rotulo: Record<string, string> = ROTULO_LEITURA;
  protected readonly placa = formatarPlaca;
  protected readonly medida = formatarMedida;

  protected readonly bases = basesFrota();

  protected readonly justificativaAberta = signal(false);
  protected readonly selecionada = signal<LeituraOdometro | null>(null);
  protected readonly acao = signal<'anular' | 'confirmar'>('anular');
  protected readonly processando = signal(false);

  protected readonly situacoesOpcoes = (Object.keys(ROTULO_LEITURA) as SituacaoLeituraOdometro[]).map((s) => ({
    label: ROTULO_LEITURA[s],
    value: s
  }));
  protected readonly origensOpcoes = (Object.keys(ROTULO_ORIGEM_LEITURA) as OrigemLeituraOdometro[]).map((o) => ({
    label: ROTULO_ORIGEM_LEITURA[o],
    value: o
  }));
  /** Fila de conferência: abre nas inconsistentes (padrão), mostrado como chip. */
  protected readonly lista = geoListState({
    storageKey: 'frota-odometro',
    rememberFilters: 'frota-odometro',
    filters: {
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      situacoes: geoFilter.list<SituacaoLeituraOdometro>(['INCONSISTENTE'], {
        label: 'Situação',
        param: 'situacao',
        itemLabel: (s) => ROTULO_LEITURA[s],
        countLabel: (n) => `${n} selecionadas`
      }),
      origens: geoFilter.list<OrigemLeituraOdometro>([], {
        label: 'Origem',
        param: 'origem',
        itemLabel: (o) => ROTULO_ORIGEM_LEITURA[o],
        countLabel: (n) => `${n} selecionadas`
      })
    },
    sort: [{ key: 'lidoEm', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<LeituraOdometro>(
    (pedido) => this.frota.listarLeituras(pedido.filters, paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.frota.listarLeituras(this.lista.request().filters, pagina),
    () => this.lista.request()
  );
  protected readonly descricaoTabela = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'leitura', 'leituras', 'Nenhuma leitura')
  );
  protected readonly descricaoAcao = computed(() => {
    const l = this.selecionada();
    if (!l) return undefined;
    return `${formatarPlaca(l.placa)}: leitura de ${formatarMedicao(l.km, l.unidade)}.`;
  });

  protected readonly colunas: GeoDataTableColumn<LeituraOdometro>[] = [
    { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, value: (l) => l.placa, display: (l) => l.placa ?? '' },
    { key: 'lidoEm', header: 'Data', type: 'custom', priority: 1, sortField: 'lidoEm', value: (l) => l.lidoEm, display: (l) => l.lidoEm },
    { key: 'km', header: 'KM / horas', type: 'custom', sortField: 'km', value: (l) => l.km, display: (l) => formatarMedicao(l.km, l.unidade) },
    { key: 'origem', header: 'Origem', sortField: 'origem', display: (l) => rotuloOrigemLeitura(l) },
    { key: 'situacao', header: 'Situação', type: 'custom', sortField: 'situacao', value: (l) => l.situacao, display: (l) => `${ROTULO_LEITURA[l.situacao]} ${l.motivoSituacao ?? ''}` },
    { key: 'registradoPor', header: 'Registrado por', display: (l) => l.registradoPor ?? '—' }
  ];
  protected readonly chave = (l: LeituraOdometro) => l.id;
  protected readonly rotuloLinha = (l: LeituraOdometro) => `leitura de ${formatarMedicao(l.km, l.unidade)} de ${formatarPlaca(l.placa)}`;
  protected readonly medicao = formatarMedicao;

  protected pedir(leitura: LeituraOdometro, acao: 'anular' | 'confirmar'): void {
    this.selecionada.set(leitura);
    this.acao.set(acao);
    this.justificativaAberta.set(true);
  }

  protected executar(justificativa: string): void {
    const leitura = this.selecionada();
    if (!leitura) return;
    const operacao =
      this.acao() === 'anular' ? this.frota.anularLeitura(leitura.id, justificativa) : this.frota.confirmarLeitura(leitura.id, justificativa);
    this.processando.set(true);
    operacao.subscribe({
      next: () => {
        this.processando.set(false);
        this.justificativaAberta.set(false);
        this.notificacoes.success(this.acao() === 'anular' ? 'Leitura anulada.' : 'Leitura confirmada.');
        this.lista.reload();
      },
      error: (e) => {
        this.processando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
