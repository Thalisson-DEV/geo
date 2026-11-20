import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDatepickerComponent,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTone,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import {
  Criticidade,
  ItemManutencao,
  OpcoesFrota,
  OrdemServico,
  OrdemServicoDetalhe,
  OrigemOrdemServico,
  PainelOrdensServico,
  ROTULO_APROVACAO,
  ROTULO_CRITICIDADE,
  ROTULO_ORIGEM_OS,
  ROTULO_SITUACAO_OS,
  rotuloSituacaoOs,
  tomSituacaoOs,
  ROTULO_TIPO_MANUTENCAO,
  SituacaoOrdemServico,
  TOM_APROVACAO,
  TOM_CRITICIDADE,
  TOM_SITUACAO_OS,
  TipoManutencao,
  contar,
  formatarPlaca,
  osAberta,
  rotuloOs,
  identificacaoOs
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaOrdemServicoFormComponent } from './frota-ordem-servico-form.component';
import { colunasPlanilhaOs } from './frota-ordem-servico.util';
import { baixarPlanilha } from '../shared/frota-planilha';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';
import { FrotaOsCalendarioComponent } from '../visoes/frota-os-calendario.component';
import { FrotaOsKanbanComponent } from '../visoes/frota-os-kanban.component';

type VisaoOs = 'tabela' | 'kanban' | 'calendario';
const VISOES: { value: VisaoOs; label: string; icon: string; rota: string }[] = [
  { value: 'tabela', label: 'Tabela', icon: 'pi pi-table', rota: '/frota/ordens-servico' },
  { value: 'kanban', label: 'Quadro', icon: 'pi pi-objects-column', rota: '/frota/ordens-servico/quadro' },
  { value: 'calendario', label: 'Calendário', icon: 'pi pi-calendar', rota: '/frota/ordens-servico/calendario' }
];

const ABERTAS: SituacaoOrdemServico[] = ['PENDENTE', 'AGENDADA', 'EM_ANDAMENTO'];
const SIM_NAO: GeoSelectOption<boolean | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Somente estas', value: true }
];

/**
 * Painel de manutenção: indicadores por situação (atalhos para o recorte) e a lista de OS.
 * Abre nas OS em aberto, que é o que a operação acompanha no dia a dia.
 */
@Component({
  selector: 'app-frota-ordens-servico',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    FrotaOrdemServicoFormComponent,
    FrotaOsCalendarioComponent,
    FrotaOsKanbanComponent
  ],
  styles: `
    .os-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .os-toolbar__texto { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .os-visoes { display: inline-flex; flex: none; margin-left: auto; padding: 2px; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .os-visoes button {
      display: inline-flex; align-items: center; gap: 0.375rem; min-height: calc(var(--geo-control-height-sm) - 2px); padding: 0 0.75rem;
      border: 0; border-radius: calc(var(--geo-radius-md) - 2px); background: transparent; color: var(--geo-foreground-muted);
      font: inherit; font-size: var(--geo-font-control); font-weight: 600; cursor: pointer;
    }
    .os-visoes button:hover { color: var(--geo-foreground); }
    .os-visoes button[aria-current='page'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-shadow-sm); }
    .os-visoes button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .os-visoes .pi { font-size: var(--geo-font-caption); }
    @media (max-width: 40rem) { .os-visoes { width: 100%; } .os-visoes button { flex: 1; justify-content: center; } }
    /* Descrição e itens em poucas linhas: a preventiva traz o roteiro inteiro, que fica na ficha. */
    .os-resumo { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; max-width: 28rem; }
    .os-resumo--1 { -webkit-line-clamp: 1; line-clamp: 1; }
  `,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="acesso.editarOs()" (newRequested)="formularioAberto.set(true)">
      <geo-page-header
        title="Ordens de serviço"
        icon="pi pi-wrench"
        [breadcrumb]="[{ label: 'Frota' }, { label: 'Ordens de serviço' }]"
        description="Manutenções pendentes, agendadas, em andamento e concluídas. Os indicadores filtram a lista. Atalhos: / busca, F filtros, N nova OS."
      >
        <!-- Uma linha por OS com datas, horas e valor, para calcular indicadores no Excel. -->
        <geo-button actions variant="outline" icon="pi pi-file-excel" label="Planilha detalhada" [loading]="exportando()"
          (pressed)="exportarDetalhado()"></geo-button>
        @if (acesso.editarOs()) {
          <geo-button actions icon="pi pi-plus" label="Abrir OS" [keyShortcut]="atalhos.newShortcut()" (pressed)="formularioAberto.set(true)"></geo-button>
        }
      </geo-page-header>

      <div class="geo-kpis" aria-label="Painel de manutenção">
        <button type="button" class="geo-kpi" [attr.data-tone]="(painel()?.pendentesPorCriticidade?.URGENTE ?? 0) > 0 ? 'danger' : 'warning'"
          (click)="atalho({ situacoes: ['PENDENTE'] })">
          <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-inbox"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">Pendentes</span>
            <span class="geo-kpi__value">{{ valor($safeNavigationMigration(painel()?.pendentes)) }}</span>
            <span class="geo-kpi__detail">{{ detalheCriticidade() }}</span>
          </span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="painel()?.agendadasVencidas ? 'warning' : 'info'"
          (click)="atalho({ situacoes: ['AGENDADA'] })">
          <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-calendar"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">Agendadas</span>
            <span class="geo-kpi__value">{{ valor($safeNavigationMigration(painel()?.agendadas)) }}</span>
            <span class="geo-kpi__detail">{{ contar(painel()?.agendadasVencidas ?? 0, 'com data passada', 'com data passada', 'Nenhuma com data passada') }}</span>
          </span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="painel()?.atrasadas ? 'danger' : 'info'"
          (click)="atalho({ situacoes: ['EM_ANDAMENTO'], atrasadas: (painel()?.atrasadas ?? 0) > 0 ? true : null })">
          <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-cog"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">Em andamento</span>
            <span class="geo-kpi__value">{{ valor($safeNavigationMigration(painel()?.emAndamento)) }}</span>
            <span class="geo-kpi__detail">{{ contar(painel()?.atrasadas ?? 0, 'com prazo estourado', 'com prazo estourado', 'Todas dentro do prazo') }}</span>
          </span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="painel()?.veiculosParados ? 'danger' : 'success'"
          (click)="atalho({ situacoes: abertas, veiculoParado: true })">
          <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-stop-circle"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">Veículos parados</span>
            <span class="geo-kpi__value">{{ valor($safeNavigationMigration(painel()?.veiculosParados)) }}</span>
            <span class="geo-kpi__detail">{{ contar(painel()?.aguardandoAprovacao ?? 0, 'OS aguardando aprovação', 'OS aguardando aprovação', 'Nenhuma aguardando aprovação') }}</span>
          </span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
        <button type="button" class="geo-kpi" data-tone="success" (click)="atalho({ situacoes: ['CONCLUIDA'] })">
          <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-check-circle"></i></span>
          <span class="geo-kpi__body">
            <span class="geo-kpi__label">Concluídas</span>
            <span class="geo-kpi__value">{{ valor($safeNavigationMigration(painel()?.concluidasUltimos30Dias)) }}</span>
            <span class="geo-kpi__detail">{{ painel()?.baixaPendente ? 'Nos últimos 30 dias · ' + contar(painel()!.baixaPendente!, 'com valores pendentes', 'com valores pendentes', '') : 'Nos últimos 30 dias' }}</span>
          </span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
      </div>

      <geo-filter-panel
        #painelFiltros
        storageKey="frota-ordens-servico"
        [activeCount]="lista.activeCount()"
        [summary]="lista.summary()"
        [loading]="resultado.loading()"
        (applied)="lista.apply()"
        (cleared)="lista.reset()"
        (chipRemoved)="lista.remove($any($event))"
      >
        <div class="geo-filter-grid">
          <geo-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Situação" [options]="situacoesOpcoes()" [(value)]="lista.filters.situacoes" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Criticidade" [options]="criticidadesOpcoes()" [(value)]="lista.filters.criticidades" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Tipo" [options]="tiposOpcoes()" [(value)]="lista.filters.tiposManutencao" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Origem" [options]="origensOpcoes()" [(value)]="lista.filters.origens" [filter]="false" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Item de manutenção" [options]="itensOpcoes()" [(value)]="lista.filters.idsItem" placeholder="Todos"></geo-multiselect>
          <geo-select label="Prazo estourado" [options]="simNao" [(value)]="lista.filters.atrasadas"></geo-select>
          <geo-select label="Veículo parado" [options]="simNao" [(value)]="lista.filters.veiculoParado"></geo-select>
          <geo-select label="Manutenção repetida" [options]="simNao" [(value)]="lista.filters.comRepeticao"></geo-select>
          <geo-select label="Valores pendentes" [options]="simNao" [(value)]="lista.filters.baixaPendente"
            description="Concluídas que ainda esperam causa, serviço e valores."></geo-select>
          <geo-datepicker label="Concluída de" [value]="dataLocal(lista.filters.concluida().from)" [clearable]="true"
            (valueChange)="lista.filters.concluida.set({ from: dataIso($event), to: lista.filters.concluida().to })"></geo-datepicker>
          <geo-datepicker label="Concluída até" [value]="dataLocal(lista.filters.concluida().to)" [clearable]="true"
            (valueChange)="lista.filters.concluida.set({ from: lista.filters.concluida().from, to: dataIso($event) })"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <div class="os-toolbar">
        @if (textoVisao()) {
          <span class="os-toolbar__texto">{{ textoVisao() }}</span>
        }
        <nav class="os-visoes" aria-label="Forma de visualizar">
          @for (v of visoes; track v.value) {
            <button type="button" [attr.aria-current]="visao === v.value ? 'page' : null" (click)="trocarVisao(v.value)">
              <i [class]="v.icon" aria-hidden="true"></i>{{ v.label }}
            </button>
          }
        </nav>
      </div>

      @switch (visao) {
        @case ('kanban') {
          <app-frota-os-kanban #quadro [filtros]="filtroVisao()" [opcoes]="opcoes()" (abrir)="abrir($event)" (lancarValores)="lancarValores($event)" (relatorio)="abrirRelatorio($event.id)"
            (verNaTabela)="verNaTabela($event)" (alterado)="carregarPainel(lista.applied().idsBase)"></app-frota-os-kanban>
        }
        @case ('calendario') {
          <app-frota-os-calendario #calendario [idsBase]="lista.applied().idsBase" (abrirOs)="abrirPorId($event)"
            (abrirDocumentos)="irPara('/frota/documentos')" (abrirCondutores)="irPara('/frota/condutores')"
            (alterado)="carregarPainel(lista.applied().idsBase)"></app-frota-os-calendario>
        }
        @default {
      <geo-data-table
        title="Ordens de serviço"
        mode="server"
        [description]="descricaoTabela()"
        storageKey="frota-ordens-servico"
        exportFileName="frota-ordens-servico"
        rowActionLabel="Abrir OS"
        searchPlaceholder="Número, placa, descrição ou oficina"
        [emptyActionLabel]="acesso.editarOs() ? 'Abrir OS' : undefined"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowKey]="chave"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as ordens de serviço' : 'Nenhuma ordem de serviço em aberto'"
        [stateDescription]="resultado.error() ?? 'Para registrar uma manutenção, use Abrir OS.'"
        noResultsTitle="Nenhuma OS encontrada com esse recorte."
        [filtered]="lista.filtered()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painelFiltros.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="formularioAberto.set(true)"
        (rowActivate)="abrir($event)"
      >
        <ng-template geoCell="numero" let-row>
          <span class="geo-cell-strong">{{ rotuloOs(row.numero) }} · {{ identificacao(row) }}</span>
          <span class="geo-cell-muted os-resumo os-resumo--1" [title]="row.itens.join(', ')">{{ row.itens.join(', ') }}</span>
        </ng-template>
        <ng-template geoCell="abertaEm" let-row>{{ row.abertaEm | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
        <ng-template geoCell="criticidade" let-row>
          <geo-status [tone]="tomCriticidade[row.criticidade]">{{ rotuloCriticidade[row.criticidade] }}</geo-status>
        </ng-template>
        <ng-template geoCell="situacao" let-row>
          <span class="geo-cell-chips">
            <geo-status [tone]="tomSituacaoOs(row)">{{ rotuloSituacaoOs(row) }}</geo-status>
            @if (row.atrasada) {
              <geo-status tone="danger" icon="pi-clock">Prazo estourado</geo-status>
            }
            @if (row.paradaEmCurso) {
              <geo-status tone="danger" emphasis="outline" icon="pi-stop-circle">Veículo parado</geo-status>
            }
            @if (row.temRepeticao) {
              <geo-status tone="warning" icon="pi-replay">Repetição</geo-status>
            }
          </span>
        </ng-template>
        <ng-template geoCell="descricao" let-row>
          <span class="geo-cell-muted os-resumo" [title]="row.descricao">{{ row.descricao }}</span>
        </ng-template>
        <ng-template geoCell="execucao" let-row>
          @switch (row.situacao) {
            @case ('AGENDADA') { {{ row.agendadaPara | date: 'dd/MM/yyyy HH:mm' }} }
            @case ('EM_ANDAMENTO') {
              Desde {{ row.inicioReal | date: 'dd/MM HH:mm' }}
              @if (row.previsaoTermino) { <span class="geo-cell-muted">Previsão {{ row.previsaoTermino | date: 'dd/MM HH:mm' }}</span> }
            }
            @case ('CONCLUIDA') { {{ row.fimReal | date: 'dd/MM/yyyy HH:mm' }} }
            @default { <span class="geo-cell-muted">—</span> }
          }
        </ng-template>
        <ng-template geoCell="situacaoAprovacao" let-row>
          @if (row.quantidadeOrcamentos || aberta(row.situacao)) {
            <geo-status [tone]="tomAprovacao[row.situacaoAprovacao]" emphasis="outline">{{ rotuloAprovacao[row.situacaoAprovacao] }}</geo-status>
          } @else {
            <span class="geo-cell-muted">—</span>
          }
        </ng-template>
      </geo-data-table>
        }
      }
    </div>

    <app-frota-ordem-servico-form [(visivel)]="formularioAberto" [opcoes]="opcoes()" (salvo)="aoAbrir($event)"></app-frota-ordem-servico-form>
  `
})
export class FrotaOrdensServicoComponent {
  private readonly frota = inject(FrotaService);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  protected readonly placa = formatarPlaca;
  protected readonly identificacao = identificacaoOs;
  protected readonly rotuloOs = rotuloOs;
  protected readonly contar = contar;
  protected readonly aberta = osAberta;
  protected readonly abertas = ABERTAS;
  protected readonly simNao = SIM_NAO;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly tomSituacao: Record<string, GeoTone> = TOM_SITUACAO_OS;
  protected readonly rotuloSituacao: Record<string, string> = ROTULO_SITUACAO_OS;
  protected readonly tomCriticidade: Record<string, GeoTone> = TOM_CRITICIDADE;
  protected readonly rotuloCriticidade: Record<string, string> = ROTULO_CRITICIDADE;
  protected readonly tomAprovacao: Record<string, GeoTone> = TOM_APROVACAO;
  protected readonly rotuloAprovacao: Record<string, string> = ROTULO_APROVACAO;

  protected readonly visoes = VISOES;
  protected readonly visao: VisaoOs = lerVisao(inject(ActivatedRoute).snapshot.data['modo']);
  private readonly quadro = viewChild<FrotaOsKanbanComponent>('quadro');
  private readonly calendario = viewChild<FrotaOsCalendarioComponent>('calendario');

  protected readonly opcoes = signal<OpcoesFrota | null>(null);
  protected readonly itens = signal<ItemManutencao[]>([]);
  protected readonly painel = signal<PainelOrdensServico | null>(null);
  protected readonly formularioAberto = signal(false);
  protected readonly exportando = signal(false);
  private readonly notificacoes = inject(NotificationService);

  protected readonly situacoesOpcoes = computed(() => this.paraOpcoes(this.opcoes()?.situacoesOrdemServico));
  protected readonly criticidadesOpcoes = computed(() => this.paraOpcoes(this.opcoes()?.criticidades));
  protected readonly tiposOpcoes = computed(() => this.paraOpcoes(this.opcoes()?.tiposManutencao));
  protected readonly origensOpcoes = computed(() => this.paraOpcoes(this.opcoes()?.origensOrdemServico));
  protected readonly itensOpcoes = computed(() => this.itens().map((i) => ({ label: i.nome, value: i.id })));

  protected readonly rotuloSituacaoOs = rotuloSituacaoOs;
  protected readonly tomSituacaoOs = tomSituacaoOs;

  protected readonly lista = geoListState({
    storageKey: 'frota-ordens-servico',
    // Os filtros ficam guardados no aparelho: voltar à tela (ou trocar de visão) mantém o recorte.
    rememberFilters: 'frota-ordens-servico',
    filters: {
      idsBase: geoFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      situacoes: geoFilter.list<SituacaoOrdemServico>(ABERTAS, {
        label: 'Situação',
        param: 'situacao',
        itemLabel: (s) => ROTULO_SITUACAO_OS[s],
        countLabel: (n) => (n === 3 ? 'Em aberto' : `${n} selecionadas`)
      }),
      criticidades: geoFilter.list<Criticidade>([], { label: 'Criticidade', param: 'criticidade', itemLabel: (c) => ROTULO_CRITICIDADE[c] }),
      tiposManutencao: geoFilter.list<TipoManutencao>([], { label: 'Tipo', param: 'tipo', itemLabel: (t) => ROTULO_TIPO_MANUTENCAO[t] }),
      origens: geoFilter.list<OrigemOrdemServico>([], { label: 'Origem', param: 'origem', itemLabel: (o) => ROTULO_ORIGEM_OS[o] }),
      idsItem: geoFilter.list<string>([], {
        label: 'Item',
        param: 'item',
        itemLabel: (id) => this.itens().find((i) => i.id === id)?.nome ?? 'item selecionado'
      }),
      atrasadas: geoFilter.value<boolean | null>(null, { label: 'Prazo estourado', param: 'atrasadas', options: () => SIM_NAO }),
      veiculoParado: geoFilter.value<boolean | null>(null, { label: 'Veículo parado', param: 'parado', options: () => SIM_NAO }),
      comRepeticao: geoFilter.value<boolean | null>(null, { label: 'Repetição', param: 'repeticao', options: () => SIM_NAO }),
      baixaPendente: geoFilter.value<boolean | null>(null, { label: 'Valores pendentes', param: 'baixa', options: () => SIM_NAO }),
      concluida: geoFilter.range({ from: null, to: null }, { label: 'Concluída', param: 'concluida' })
    },
    // Gravidade primeiro: veículo parado, depois urgente → baixa (o backend ordena "criticidade" assim).
    sort: [{ key: 'criticidade', direction: 'desc' }]
  });

  protected readonly resultado = this.lista.results<OrdemServico>(
    (pedido) => this.frota.listarOrdensServico(this.filtro(), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );

  protected readonly descricaoTabela = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'OS', 'OS', 'Nenhuma OS')
  );

  protected readonly detalheCriticidade = computed(() => {
    const p = this.painel()?.pendentesPorCriticidade;
    if (!p) return 'Por criticidade';
    const partes = (['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'] as Criticidade[])
      .filter((c) => p[c])
      .map((c) => `${p[c]} ${ROTULO_CRITICIDADE[c].toLowerCase()}`);
    return partes.length ? partes.join(' · ') : 'Nenhuma pendente';
  });

  protected readonly colunas: GeoDataTableColumn<OrdemServico>[] = [
    { key: 'numero', header: 'OS', type: 'custom', priority: 1, sortField: 'numero', value: (r) => r.numero, display: (r) => `${rotuloOs(r.numero)} ${r.placa} ${r.itens.join(', ')}` },
    { key: 'base', header: 'Base', priority: 2, display: (r) => r.base ?? '—' },
    { key: 'abertaEm', header: 'Aberta em', type: 'custom', sortField: 'abertaEm', value: (r) => r.abertaEm, display: (r) => r.abertaEm },
    { key: 'tipoManutencao', header: 'Tipo', sortField: 'tipoManutencao', display: (r) => ROTULO_TIPO_MANUTENCAO[r.tipoManutencao] },
    { key: 'criticidade', header: 'Criticidade', type: 'custom', priority: 1, sortField: 'criticidade', value: (r) => r.criticidade, display: (r) => ROTULO_CRITICIDADE[r.criticidade] },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, sortField: 'situacao', value: (r) => r.situacao, display: (r) => ROTULO_SITUACAO_OS[r.situacao] },
    { key: 'descricao', header: 'Descrição', type: 'custom', value: (r) => r.descricao, display: (r) => r.descricao },
    { key: 'oficina', header: 'Oficina', display: (r) => r.oficina },
    { key: 'condutor', header: 'Condutor', display: (r) => r.condutor ?? '—' },
    { key: 'execucao', header: 'Execução', type: 'custom', value: (r) => r.fimReal ?? r.inicioReal ?? r.agendadaPara, display: (r) => r.fimReal ?? r.inicioReal ?? r.agendadaPara ?? '' },
    { key: 'situacaoAprovacao', header: 'Orçamento', type: 'custom', value: (r) => r.situacaoAprovacao, display: (r) => ROTULO_APROVACAO[r.situacaoAprovacao] }
  ];

  protected readonly chave = (r: OrdemServico) => r.id;
  protected readonly rotulo = (r: OrdemServico) => `${rotuloOs(r.numero)} do veículo ${r.placa}`;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.frota.listarOrdensServico(this.filtro(), pagina),
    () => this.lista.request()
  );

  constructor() {
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    this.frota.itensManutencao().subscribe({ next: (p) => this.itens.set(p.content), error: () => undefined });
    // O painel acompanha a base filtrada; as demais dimensões são da lista.
    effect(() => this.carregarPainel(this.lista.applied().idsBase));
  }

  protected valor(n: number | null | undefined): string {
    return n == null ? '—' : n.toLocaleString('pt-BR');
  }

  /** Indicador clicado: troca o recorte da lista mantendo a base. */
  protected atalho(recorte: { situacoes: SituacaoOrdemServico[]; atrasadas?: boolean | null; veiculoParado?: boolean | null }): void {
    const f = this.lista.filters;
    f.situacoes.set(recorte.situacoes);
    f.atrasadas.set(recorte.atrasadas ?? null);
    f.veiculoParado.set(recorte.veiculoParado ?? null);
    f.criticidades.set([]);
    f.comRepeticao.set(null);
    f.baixaPendente.set(null);
    this.lista.apply();
  }

  /** Recorte aplicado para o quadro (a situação vem das colunas). */
  protected readonly filtroVisao = computed(() => {
    // O quadro usa o próprio período das concluídas.
    // Valores pendentes só existem nas concluídas: no quadro ela aparece como grupo da coluna.
    const { concluida: _periodo, baixaPendente: _baixa, ...resto } = this.lista.applied();
    return { ...resto, busca: null };
  });

  protected readonly textoVisao = computed(() => {
    switch (this.visao) {
      case 'kanban':
        return 'Fila pela próxima ação. Os filtros valem para o quadro, menos a situação, que vira coluna.';
      case 'calendario':
        return 'OS agendadas, previsões de término e vencimentos de documentos e CNH. O filtro de base vale aqui.';
      default:
        return '';
    }
  });

  protected trocarVisao(visao: VisaoOs): void {
    if (visao === this.visao) return;
    void this.router.navigate([VISOES.find((v) => v.value === visao)!.rota], { queryParams: this.lista.queryParams() });
  }

  /** "Ver todas" de uma coluna do quadro: tabela com essa situação. */
  protected verNaTabela(situacao: SituacaoOrdemServico): void {
    this.lista.filters.situacoes.set([situacao]);
    this.lista.apply();
    void this.router.navigate(['/frota/ordens-servico'], { queryParams: this.lista.queryParams() });
  }

  protected abrirPorId(id: string): void {
    void this.router.navigate(['/frota/ordens-servico', id]);
  }

  protected abrirRelatorio(id: string): void {
    void this.router.navigate(['/frota/ordens-servico', id, 'relatorio']);
  }

  protected irPara(rota: string): void {
    void this.router.navigate([rota]);
  }

  protected abrir(os: OrdemServico): void {
    void this.router.navigate(['/frota/ordens-servico', os.id]);
  }

  protected lancarValores(os: OrdemServico): void {
    void this.router.navigate(['/frota/ordens-servico', os.id], { queryParams: { aba: 'execucao' } });
  }

  protected aoAbrir(os: OrdemServicoDetalhe): void {
    navegarAposFecharDrawer(this.router, ['/frota/ordens-servico', os.ordem.id]);
  }

  protected carregarPainel(idsBase: string[]): void {
    this.frota.painelOrdensServico(idsBase).subscribe({ next: (p) => this.painel.set(p), error: () => this.painel.set(null) });
  }

  /** Planilha com o recorte filtrado (até o limite de exportação), uma linha por OS. */
  protected exportarDetalhado(): void {
    this.exportando.set(true);
    this.frota.listarOrdensServico(this.filtro(), { page: 0, size: LIMITE_EXPORTACAO_FROTA, sort: ['abertaEm,desc'] }).subscribe({
      next: (pagina) => {
        this.exportando.set(false);
        if (!pagina.content.length) {
          this.notificacoes.info('Nenhuma OS no recorte para exportar.');
          return;
        }
        const motivos = new Map((this.opcoes()?.motivosServico ?? []).map((m) => [m.valor as string, m.rotulo]));
        baixarPlanilha('frota-ordens-servico-detalhado', pagina.content, colunasPlanilhaOs(motivos));
        const total = pagina.page?.totalElements ?? pagina.content.length;
        if (total > pagina.content.length) {
          this.notificacoes.warning(`Exportadas as ${pagina.content.length} OS mais recentes de ${total}. Refine os filtros para exportar o restante.`);
        } else {
          this.notificacoes.success(`${pagina.content.length} OS exportadas.`);
        }
      },
      error: (e) => {
        this.exportando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private filtro() {
    const pedido = this.lista.request();
    const { concluida, ...filtros } = pedido.filters;
    return {
      ...filtros,
      busca: pedido.query || null,
      // Dia inteiro no fuso local: de 00:00 do início a 23:59 do fim.
      concluidaDe: concluida.from ? new Date(`${concluida.from}T00:00:00`).toISOString() : null,
      concluidaAte: concluida.to ? new Date(`${concluida.to}T23:59:59.999`).toISOString() : null
    };
  }

  private paraOpcoes<T extends string>(lista: { valor: T; rotulo: string }[] | undefined): GeoSelectOption<T>[] {
    return (lista ?? []).map((o) => ({ label: o.rotulo, value: o.valor }));
  }
}

function lerVisao(modo: unknown): VisaoOs {
  return modo === 'kanban' || modo === 'calendario' ? modo : 'tabela';
}
