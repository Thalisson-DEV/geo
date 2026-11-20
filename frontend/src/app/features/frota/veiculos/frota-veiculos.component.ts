import { DecimalPipe } from '@angular/common';
import { ICONE_SITUACAO } from '../../../core/models/frota.models';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTone,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import {
  OpcoesFrota,
  ROTULO_REGIME,
  ROTULO_SITUACAO,
  RegimeVeiculo,
  SituacaoOperacional,
  TOM_SITUACAO,
  TipoVeiculo,
  VeiculoFrotaDetalhe,
  VeiculoFrotaResumo,
  contar,
  formatarMedida,
  formatarPlaca,
  formatarMedicao
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { AJUSTE_TEXTO_FROTA, LIMITE_EXPORTACAO_FROTA, OPCOES_CADASTRO, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaVeiculoFormComponent } from './frota-veiculo-form.component';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';

@Component({
  selector: 'app-frota-veiculos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    FrotaVeiculoFormComponent
  ],
  styles: `
    /* Linha densa (padrão da carteira de obras): modelo, condutor e selos numa linha só. */
    .vei-linha { display: block; max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vei-selos { flex-wrap: nowrap; white-space: nowrap; }
  `,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="acesso.editarVeiculo()" (newRequested)="formularioAberto.set(true)">
      <geo-page-header
        title="Veículos"
        icon="pi pi-car"
        [breadcrumb]="[{ label: 'Frota' }, { label: 'Veículos' }]"
        description="Situação, condutor, quilometragem e pendências de cada placa. Clique numa linha para abrir a ficha. Atalhos: / busca, F filtros, N novo veículo."
      >
        @if (acesso.editarVeiculo()) {
          <geo-button actions icon="pi pi-plus" label="Novo veículo" [keyShortcut]="atalhos.newShortcut()" (pressed)="formularioAberto.set(true)"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel
        #painel
        storageKey="frota-veiculos"
        [activeCount]="lista.activeCount()"
        [summary]="lista.summary()"
        [loading]="resultado.loading()"
        (applied)="lista.apply()"
        (cleared)="lista.reset()"
        (chipRemoved)="lista.remove($any($event))"
      >
        <div class="geo-filter-grid">
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Tipo" [options]="tiposOpcoes()" [(value)]="lista.filters.idsTipoVeiculo" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Situação" [options]="situacoesOpcoes()" [(value)]="lista.filters.situacoes" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-select label="Regime" [options]="regimesOpcoes()" [(value)]="lista.filters.regime" [clearable]="true" placeholder="Todos"></geo-select>
          <geo-select label="Cadastro" [options]="cadastroOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Veículos"
        mode="server"
        [description]="descricaoTabela()"
        storageKey="frota-veiculos"
        exportFileName="frota-veiculos"
        rowActionLabel="Abrir ficha"
        [textFit]="ajusteTexto"
        searchPlaceholder="Placa, chassi ou renavam"
        [emptyActionLabel]="acesso.editarVeiculo() ? 'Novo veículo' : undefined"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowKey]="chave"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os veículos' : 'Nenhum veículo cadastrado'"
        [stateDescription]="resultado.error() ?? 'Para incluir uma placa, use Novo veículo.'"
        noResultsTitle="Nenhum veículo encontrado com esse recorte."
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="formularioAberto.set(true)"
        (rowActivate)="abrir($event)"
      >
        @if (acesso.verTelemetria()) {
          <div table-filters class="geo-quick-filters" role="group" aria-label="Atalhos de uso">
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="!!lista.applied().foraExpediente" (click)="alternar('foraExpediente')">
              <i class="pi pi-moon" aria-hidden="true"></i> Fora do expediente
            </button>
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="!!lista.applied().rodaPouco" (click)="alternar('rodaPouco')">
              <i class="pi pi-arrow-down-right" aria-hidden="true"></i> Roda pouco
            </button>
          </div>
        }
        <ng-template geoCell="uso" let-row>
          @if (row.uso; as u) {
            <span class="geo-cell-num">{{ u.km | number: '1.0-0' }} km</span>
            <span class="geo-cell-chips vei-selos">
              @if (u.rodaPouco) { <geo-status tone="warning" icon="pi-arrow-down-right">Roda pouco</geo-status> }
              @if (u.diasForaExpediente) {
                <geo-status tone="warning" icon="pi-moon">{{ contar(u.diasForaExpediente, 'dia', 'dias') }} fora do expediente</geo-status>
              }
            </span>
          } @else {
            <span class="geo-cell-muted">Sem rastreador</span>
          }
        </ng-template>
        <ng-template geoCell="placa" let-row>
          <span class="geo-cell-strong">{{ placa(row.placa) }}</span>
          <span class="geo-cell-muted vei-linha" [title]="(row.fabricante ?? '') + ' ' + (row.modelo ?? '')">{{ row.fabricante }} {{ row.modelo }}{{ row.anoModelo ? ' · ' + row.anoModelo : '' }}</span>
        </ng-template>
        <ng-template geoCell="situacao" let-row>
          <span class="geo-cell-chips vei-selos">
            <geo-status [tone]="tomSituacao[row.situacao]" [icon]="iconeSituacao[row.situacao]">{{ rotuloSituacao[row.situacao] }}</geo-status>
            @if (!row.ativo) {
              <geo-status tone="neutral" emphasis="outline" icon="pi-ban">Desativado</geo-status>
            }
          </span>
        </ng-template>
        <ng-template geoCell="kmAtual" let-row>
          @if (row.kmAtual != null) {
            <span class="geo-cell-num">{{ row.kmAtual != null ? medicao(row.kmAtual, row.unidadeMedicao) : '—' }}</span>
          } @else {
            <span class="geo-cell-muted">Sem leitura</span>
          }
        </ng-template>
        <ng-template geoCell="condutorAtual" let-row>
          @if (row.condutorAtual) {
            <span class="vei-linha" [title]="row.condutorAtual">{{ row.condutorAtual }}</span>
          } @else {
            <span class="geo-cell-muted">Sem condutor</span>
          }
        </ng-template>
        <ng-template geoCell="pendencias" let-row>
          <span class="geo-cell-chips vei-selos">
            @if (row.documentosVencidos) {
              <geo-status tone="danger" icon="pi-file">{{ contar(row.documentosVencidos, 'doc. vencido', 'docs. vencidos') }}</geo-status>
            }
            @if (row.documentosAVencer) {
              <geo-status tone="warning" icon="pi-clock">{{ contar(row.documentosAVencer, 'doc. a vencer', 'docs. a vencer') }}</geo-status>
            }
            @if (row.leiturasInconsistentes) {
              <geo-status tone="warning" icon="pi-exclamation-triangle">{{ contar(row.leiturasInconsistentes, 'leitura', 'leituras', '') }} a conferir</geo-status>
            }
            @if (semChecklist().has(row.idVeiculo)) {
              <geo-status tone="warning" icon="pi-list-check" [attr.title]="semChecklist().get(row.idVeiculo)">Sem checklist hoje</geo-status>
            }
            @if (!row.documentosVencidos && !row.documentosAVencer && !row.leiturasInconsistentes && !semChecklist().has(row.idVeiculo)) {
              <geo-status tone="success" icon="pi-check">Em dia</geo-status>
            }
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-frota-veiculo-form
      [(visivel)]="formularioAberto"
      [opcoes]="opcoes()"
      [tiposVeiculo]="tiposVeiculo()"
      (salvo)="aoCadastrar($event)"
    ></app-frota-veiculo-form>
  `
})
export class FrotaVeiculosComponent {
  private readonly frota = inject(FrotaService);
  private readonly checklist = inject(FrotaChecklistService);
  /** Veículos usados hoje sem checklist (só para quem vê checklists), com o motivo. */
  protected readonly semChecklist = signal(new Map<string, string>());
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  protected readonly tomSituacao: Record<string, GeoTone> = TOM_SITUACAO;
  protected readonly iconeSituacao: Record<string, string> = ICONE_SITUACAO;
  protected readonly rotuloSituacao: Record<string, string> = ROTULO_SITUACAO;
  protected readonly placa = formatarPlaca;
  protected readonly medida = formatarMedida;
  protected readonly contar = contar;
  protected readonly medicao = formatarMedicao;
  protected readonly cadastroOpcoes = OPCOES_CADASTRO;

  protected readonly opcoes = signal<OpcoesFrota | null>(null);
  protected readonly tiposVeiculo = signal<TipoVeiculo[]>([]);
  protected readonly formularioAberto = signal(false);

  protected readonly tiposOpcoes = computed(() => this.tiposVeiculo().map((t) => ({ label: t.nome, value: t.id })));
  protected readonly situacoesOpcoes = computed(() =>
    (this.opcoes()?.situacoes ?? []).map((o) => ({ label: o.rotulo, value: o.valor }))
  );
  protected readonly regimesOpcoes = computed(() =>
    (this.opcoes()?.regimes ?? []).map((o) => ({ label: o.rotulo, value: o.valor }))
  );

  protected readonly lista = geoListState({
    storageKey: 'frota-veiculos',
    rememberFilters: 'frota-veiculos',
    filters: {
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      idsTipoVeiculo: geoFilter.list<string>([], {
        label: 'Tipo',
        param: 'tipo',
        itemLabel: (id) => this.tiposVeiculo().find((t) => t.id === id)?.nome ?? 'tipo selecionado'
      }),
      situacoes: geoFilter.list<SituacaoOperacional>([], {
        label: 'Situação',
        param: 'situacao',
        itemLabel: (s) => ROTULO_SITUACAO[s],
        countLabel: (n) => `${n} selecionadas`
      }),
      regime: geoFilter.value<RegimeVeiculo | null>(null, { label: 'Regime', format: (r) => (r ? ROTULO_REGIME[r] : null) }),
      ativo: geoFilter.value<boolean | null>(true, { label: 'Cadastro', options: () => OPCOES_CADASTRO }),
      foraExpediente: geoFilter.value<boolean | null>(null, { label: 'Uso', param: 'foraExpediente', format: (v) => (v ? 'Fora do expediente (30 dias)' : null) }),
      rodaPouco: geoFilter.value<boolean | null>(null, { label: 'Uso', param: 'rodaPouco', format: (v) => (v ? 'Roda pouco (30 dias)' : null) })
    },
    sort: [{ key: 'placa', direction: 'asc' }]
  });

  protected readonly resultado = this.lista.results<VeiculoFrotaResumo>(
    (pedido) => this.frota.listarVeiculos(this.filtro(), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );

  protected readonly descricaoTabela = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'veículo', 'veículos', 'Nenhum veículo')
  );

  protected readonly colunas: GeoDataTableColumn<VeiculoFrotaResumo>[] = [
    { key: 'placa', header: 'Placa', type: 'custom', priority: 1, sortField: 'placa', value: (r) => r.placa, display: (r) => `${r.placa} ${r.modelo ?? ''}` },
    { key: 'baseOperacional', header: 'Base', priority: 1 },
    { key: 'tipoVeiculo', header: 'Tipo', sortField: 'tipoVeiculo.nome', display: (r) => r.tipoVeiculo ?? 'Sem tipo' },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, sortField: 'situacao', value: (r) => r.situacao, display: (r) => ROTULO_SITUACAO[r.situacao] },
    { key: 'regime', header: 'Regime', sortField: 'regime', display: (r) => ROTULO_REGIME[r.regime] },
    { key: 'kmAtual', header: 'KM / horas', type: 'custom', align: 'end', value: (r) => r.kmAtual, display: (r) => (r.kmAtual != null ? formatarMedicao(r.kmAtual, r.unidadeMedicao) : '') },
    { key: 'uso', header: 'Uso em 30 dias', type: 'custom', value: (r) => r.uso?.km ?? -1,
      display: (r) => (r.uso ? `${Math.round(r.uso.km)} km${r.uso.rodaPouco ? ', roda pouco' : ''}${r.uso.diasForaExpediente ? `, ${r.uso.diasForaExpediente} dias fora do expediente` : ''}` : 'Sem rastreador') },
    { key: 'condutorAtual', header: 'Condutor', type: 'custom', value: (r) => r.condutorAtual, display: (r) => r.condutorAtual ?? 'Sem condutor' },
    { key: 'implementos', header: 'Implementos', value: (r) => r.implementosAcoplados.join(', '), display: (r) => r.implementosAcoplados.join(', ') || '—' },
    {
      key: 'pendencias',
      header: 'Pendências',
      type: 'custom',
      value: (r) => r.documentosVencidos * 100 + r.documentosAVencer * 10 + r.leiturasInconsistentes,
      display: (r) => `${r.documentosVencidos} vencidos, ${r.documentosAVencer} a vencer, ${r.leiturasInconsistentes} leituras a conferir`
    }
  ];

  protected readonly chave = (r: VeiculoFrotaResumo) => r.idVeiculo;
  protected readonly rotulo = (r: VeiculoFrotaResumo) => `Veículo ${r.placa}`;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly ajusteTexto = AJUSTE_TEXTO_FROTA;
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.frota.listarVeiculos(this.filtro(), pagina),
    () => this.lista.request()
  );

  constructor() {
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    this.frota.tiposVeiculo().subscribe({ next: (p) => this.tiposVeiculo.set(p.content), error: () => undefined });
    if (this.acesso.verChecklist()) {
      this.checklist.semChecklistHoje().subscribe({
        next: (lista) => this.semChecklist.set(new Map(lista.map((v) => [v.idVeiculo, v.motivo]))),
        error: () => undefined
      });
    }
  }

  protected abrir(veiculo: VeiculoFrotaResumo): void {
    void this.router.navigate(['/frota/veiculos', veiculo.idVeiculo]);
  }

  protected aoCadastrar(veiculo: VeiculoFrotaDetalhe): void {
    this.notificacoes.info('Abrindo a ficha do veículo cadastrado.');
    navegarAposFecharDrawer(this.router, ['/frota/veiculos', veiculo.idVeiculo]);
  }

  protected alternar(chave: 'foraExpediente' | 'rodaPouco'): void {
    this.lista.set(chave, this.lista.applied()[chave] ? null : true);
  }

  private filtro() {
    const pedido = this.lista.request();
    return { ...pedido.filters, busca: pedido.query || null };
  }
}
