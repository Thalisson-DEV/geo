import { ICONE_STATUS_INSPECAO } from '../../../core/models/sst.models';
import { ChangeDetectionStrategy, Component, DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoDrawerComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTone,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';

import { InspecaoFilters, InspecaoSegurancaResponse, STATUS_INSPECAO_LABELS, StatusInspecao } from '../../../core/models/sst.models';
import { EquipeResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { CentrosCustoLookupService } from '../../../core/services/centros-custo-lookup.service';
import { RhService } from '../../../core/services/rh.service';
import { ArquivoExportacao, SstService } from '../../../core/services/sst.service';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { InspecaoSegurancaHistoricoComponent } from './inspecao-seguranca-historico/inspecao-seguranca-historico.component';

const TOM_STATUS: Record<StatusInspecao, GeoTone> = { EM_ANDAMENTO: 'warning', CONCLUIDA: 'success', CANCELADA: 'neutral' };
const OPCOES_STATUS: GeoSelectOption<StatusInspecao>[] = (Object.keys(STATUS_INSPECAO_LABELS) as StatusInspecao[]).map((value) => ({
  label: STATUS_INSPECAO_LABELS[value],
  value
}));
const OPCOES_DESVIOS: GeoSelectOption<boolean | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Com desvios', value: true },
  { label: 'Sem desvios', value: false }
];
const EXPORTACOES: GeoSelectOption<'inspecoes' | 'desvios'>[] = [
  { label: 'Inspeções', value: 'inspecoes' },
  { label: 'Desvios', value: 'desvios' }
];
const FORMATOS: GeoSelectOption<'resumo' | 'detalhado'>[] = [
  { label: 'Resumo', value: 'resumo' },
  { label: 'Detalhado', value: 'detalhado' }
];
const ARQUIVOS: GeoSelectOption<ArquivoExportacao>[] = [
  { label: 'Excel (.xlsx)', value: 'xlsx' },
  { label: 'CSV (.csv)', value: 'csv' }
];
/** Padrão: inspeções realizadas nos últimos 90 dias (links de painéis abrem no recorte deles). */
export const DIAS_PADRAO_INSPECOES = 90;

@Component({
  selector: 'app-sst-inspecoes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoDrawerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    AjudaListagemComponent,
    InspecaoSegurancaHistoricoComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="nova()">
      <geo-page-header
        title="Inspeções"
        icon="pi pi-shield"
        [breadcrumb]="[{ label: 'SST' }, { label: 'Inspeções' }]"
        description="Inspeções de segurança realizadas em campo: formulário, local, inspetor e desvios apontados."
        helpLabel="Ajuda sobre inspeções"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-download" label="Exportar" (pressed)="exportacaoAberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Nova inspeção" [keyShortcut]="atalhos.newShortcut()" (pressed)="nova()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="sst-inspecoes" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-multiselect label="Tipo de inspeção" [options]="tipos()" [(value)]="lista.filters.tipo" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Formulário" [options]="formularios()" [(value)]="lista.filters.formulario" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Processo da inspeção" [options]="processos()" [(value)]="lista.filters.processo" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Processo do inspetor" [options]="processos()" [(value)]="lista.filters.processoInspetor" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Base operacional" [options]="bases()" [(value)]="lista.filters.base" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Centro de custo" [options]="centros()" [(value)]="lista.filters.centroCusto" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Equipe" [options]="equipesOpcoes()" [(value)]="lista.filters.equipe" placeholder="Todas"
            [loading]="equipes.loading()" (opened)="equipes.open()" (search)="equipes.search($event)"></geo-multiselect>
          <geo-multiselect label="Status" [options]="opcoesStatus" [(value)]="lista.filters.status" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-select label="Desvios" [options]="opcoesDesvios" [(value)]="lista.filters.comDesvios"></geo-select>
          <geo-datepicker label="Realizadas a partir de" [value]="dataLocal(lista.filters.realizacao().from)" [clearable]="true" (valueChange)="realizacao('from', $event)"></geo-datepicker>
          <geo-datepicker label="Realizadas até" [value]="dataLocal(lista.filters.realizacao().to)" [clearable]="true" (valueChange)="realizacao('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Inspeções"
        mode="server"
        storageKey="sst-inspecoes"
        searchPlaceholder="Formulário, inspetor ou local"
        rowActionLabel="Ver detalhes"
        rowActionIcon="pi pi-external-link"
        emptyActionLabel="Nova inspeção"
        noResultsTitle="Nenhuma inspeção encontrada com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as inspeções' : 'Nenhuma inspeção realizada'"
        [stateDescription]="resultado.error() ?? 'Registre uma inspeção em campo ou pelo botão Nova inspeção.'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="nova()"
        (rowActivate)="verDetalhe($event)"
      >
        <div table-filters class="geo-quick-filters" role="group" aria-label="Atalhos de inspeções">
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="lista.applied().minhas" (click)="lista.set('minhas', !lista.applied().minhas)">
            <i class="pi pi-user" aria-hidden="true"></i> Só as minhas
          </button>
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="lista.applied().comDesvios === true" (click)="lista.set('comDesvios', lista.applied().comDesvios === true ? null : true)">
            <i class="pi pi-exclamation-triangle" aria-hidden="true"></i> Com desvios
          </button>
        </div>
        <ng-template geoCell="formulario" let-row>
          <span class="geo-cell-strong">{{ row.formulario?.titulo || '—' }}</span>
          <span class="geo-cell-muted">{{ row.tipoInspecao?.nome || 'Sem tipo' }}</span>
        </ng-template>
        <ng-template geoCell="local" let-row>
          <span>{{ row.baseOperacional?.nome || '—' }}</span>
          <span class="geo-cell-muted">{{ row.processo?.nome || '' }}</span>
        </ng-template>
        <ng-template geoCell="desvios" let-row>
          @if (row.desvios?.length) {
            <geo-status [tone]="emAberto(row) ? 'warning' : 'success'" [icon]="emAberto(row) ? 'pi-exclamation-triangle' : 'pi-check-circle'">{{ row.desvios.length }}</geo-status>
            <span class="geo-cell-muted">{{ emAberto(row) ? (emAberto(row) === 1 ? '1 em aberto' : emAberto(row) + ' em aberto') : 'Todos resolvidos' }}</span>
          } @else {
            <span class="geo-cell-muted">Nenhum</span>
          }
        </ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status [tone]="tom(row.status)" [icon]="iconeStatus[row.status]">{{ rotuloStatus(row.status) }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações da inspeção de ' + rotulo(row)" size="icon-sm" (pressed)="historico.set(row.id)"></geo-icon-button>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="exportacaoAberta" title="Exportar dados de SST" description="Exporta o recorte atual da lista." size="sm">
      <geo-select label="O que exportar" [options]="exportacoes" [(value)]="exportTipo"></geo-select>
      <geo-select label="Formato" [options]="formatos" [(value)]="exportFormato"></geo-select>
      <geo-select label="Arquivo" [options]="arquivos" [(value)]="exportArquivo"></geo-select>
      @if (lista.applied().minhas) {
        <geo-callout tone="info">Só as suas inspeções, como na lista.</geo-callout>
      }
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="exportacaoAberta.set(false)"></geo-button>
        <geo-button icon="pi pi-download" [label]="exportArquivo() === 'xlsx' ? 'Baixar Excel' : 'Baixar CSV'" [loading]="exportando()" (pressed)="exportar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-drawer [visible]="!!historico()" (visibleChange)="!$event && historico.set(null)" title="Histórico da inspeção" size="lg">
      @if (historico(); as id) {
        <app-inspecao-seguranca-historico [idInspecao]="id"></app-inspecao-seguranca-historico>
      }
    </geo-drawer>

    <app-ajuda-listagem #ajuda titulo="Inspeções" artigoPlural="as" entidadePlural="inspeções" busca="formulário, inspetor ou local" rotuloNovo="Nova inspeção">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-filter"></i> Recorte inicial</h4>
        <p class="help-text-desc">A lista abre nas inspeções dos últimos {{ diasPadrao }} dias. Vindo de um painel, abre no recorte dele. "Só as minhas" mostra as inspeções feitas por você.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class InspecoesComponent {
  private readonly sst = inject(SstService);
  private readonly rh = inject(RhService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly rota = inject(ActivatedRoute);

  protected readonly opcoesStatus = OPCOES_STATUS;
  protected readonly opcoesDesvios = OPCOES_DESVIOS;
  protected readonly exportacoes = EXPORTACOES;
  protected readonly formatos = FORMATOS;
  protected readonly arquivos = ARQUIVOS;
  protected readonly diasPadrao = DIAS_PADRAO_INSPECOES;
  protected readonly dataLocal = dataLocal;

  protected readonly tipos = signal<GeoSelectOption<string>[]>([]);
  protected readonly formularios = signal<GeoSelectOption<string>[]>([]);
  protected readonly processos = signal<GeoSelectOption<string>[]>([]);
  protected readonly bases = signal<GeoSelectOption<string>[]>([]);
  protected readonly centros = signal<GeoSelectOption<string>[]>([]);
  /** Nome do inspetor vindo do drill de um painel (`?idInspetor=&inspetor=`). */
  private readonly nomeInspetor = this.rota.snapshot.queryParamMap.get('inspetor');

  protected readonly equipes: RemoteLookup<EquipeResponse> = new RemoteLookup<EquipeResponse>(
    {
      identify: (e) => e.id,
      selectedKeys: () => this.lista.filters.equipe(),
      load: ({ query, page, size }) => this.rh.listarEquipes({ ativo: true, buscaGlobal: query || undefined, page, size, sort: 'codigo,asc' })
    },
    inject(DestroyRef)
  );
  protected readonly equipesOpcoes: Signal<GeoSelectOption<string>[]> = computed(() => this.equipes.items().map((e) => ({ label: e.codigo, value: e.id })));

  private readonly comLimite = this.rota.snapshot.queryParamMap.keys.length === 0;

  protected readonly lista = geoListState({
    storageKey: 'sst-inspecoes',
    filters: {
      tipo: geoFilter.list<string>([], { label: 'Tipo', param: 'idTipoInspecao', itemLabel: (id) => this.nome(this.tipos(), id) }),
      formulario: geoFilter.list<string>([], { label: 'Formulário', param: 'idFormulario', itemLabel: (id) => this.nome(this.formularios(), id) }),
      processo: geoFilter.list<string>([], { label: 'Processo', param: 'idProcesso', itemLabel: (id) => this.nome(this.processos(), id) }),
      processoInspetor: geoFilter.list<string>([], { label: 'Processo do inspetor', param: 'idProcessoInspetor', itemLabel: (id) => this.nome(this.processos(), id) }),
      base: geoFilter.list<string>([], { label: 'Base', param: 'idBaseOperacional', itemLabel: (id) => this.nome(this.bases(), id), countLabel: (n) => `${n} selecionadas` }),
      centroCusto: geoFilter.list<string>([], { label: 'Centro de custo', param: 'idCentroCusto', itemLabel: (id) => this.nome(this.centros(), id) }),
      equipe: geoFilter.list<string>([], { label: 'Equipe', param: 'idEquipe', itemLabel: (id) => this.nome(this.equipesOpcoes(), id), countLabel: (n) => `${n} selecionadas` }),
      inspetor: geoFilter.list<string>([], { label: 'Inspetor', param: 'idInspetor', itemLabel: () => this.nomeInspetor || 'inspetor selecionado' }),
      status: geoFilter.list<StatusInspecao>([], { label: 'Status', itemLabel: (s) => STATUS_INSPECAO_LABELS[s] ?? s }),
      comDesvios: geoFilter.value<boolean | null>(null, { label: 'Desvios', param: 'desvios', options: () => OPCOES_DESVIOS }),
      minhas: geoFilter.value<boolean>(false, { label: 'Inspetor', param: 'minhas', format: (v): string | null => (v ? 'só as minhas' : null) }),
      realizacao: geoFilter.range(this.comLimite ? { from: this.inicioPadrao(), to: null } : { from: null, to: null }, { label: 'Realização' })
    },
    sort: [{ key: 'data', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<InspecaoSegurancaResponse>(
    (pedido) => {
      const filtro = this.filtro({ page: pedido.page, size: pedido.size, sort: pedido.sort.map((r) => `${r.key},${r.direction}`)[0] ?? 'dataRealizacao,desc' });
      return this.lista.request().filters.minhas ? this.sst.listarMinhasInspecoes(filtro) : this.sst.listarInspecoes(filtro);
    },
    { errorMessage: getErrorMessage }
  );

  protected readonly colunas: GeoDataTableColumn<InspecaoSegurancaResponse>[] = [
    { key: 'formulario', header: 'Formulário', type: 'custom', priority: 1, value: (i) => i.formulario?.titulo, display: (i) => i.formulario?.titulo ?? '—' },
    { key: 'local', header: 'Base / processo', type: 'custom', value: (i) => i.baseOperacional?.nome },
    { key: 'inspetor', header: 'Inspetor', priority: 1, value: (i) => i.nomeInspetor, display: (i) => i.nomeInspetor || '—' },
    { key: 'data', header: 'Realizada em', type: 'date', sortField: 'dataRealizacao', value: (i) => i.dataRealizacao },
    { key: 'desvios', header: 'Desvios', type: 'custom', value: (i) => i.desvios?.length ?? 0, display: (i) => String(i.desvios?.length ?? 0) },
    { key: 'status', header: 'Status', type: 'custom', value: (i) => i.status, display: (i) => STATUS_INSPECAO_LABELS[i.status] ?? i.status }
  ];
  /** Desvios da inspeção ainda não resolvidos. */
  protected readonly emAberto = (i: InspecaoSegurancaResponse) => i.desvios?.filter((d) => d.status !== 'RESOLVIDO').length ?? 0;
  protected readonly rotulo = (i: InspecaoSegurancaResponse) => `${i.formulario?.titulo ?? 'inspeção'} (${new Date(i.dataRealizacao).toLocaleDateString('pt-BR')})`;

  protected readonly historico = signal<string | null>(null);
  protected readonly exportacaoAberta = signal(false);
  protected readonly exportTipo = signal<'inspecoes' | 'desvios'>('inspecoes');
  protected readonly exportFormato = signal<'resumo' | 'detalhado'>('resumo');
  protected readonly exportArquivo = signal<ArquivoExportacao>('xlsx');
  protected readonly exportando = signal(false);

  constructor() {
    const opcoes = (itens: readonly { id: string; nome?: string; titulo?: string }[]) => itens.map((i) => ({ label: i.nome ?? i.titulo ?? i.id, value: i.id }));
    this.sst.listarOpcoesTiposInspecao().subscribe({ next: (r) => this.tipos.set(opcoes(r)), error: () => undefined });
    this.sst.listarFormulariosAtivos().subscribe({ next: (r) => this.formularios.set(opcoes(r.content)), error: () => undefined });
    this.rh.listarProcessosAtivos().subscribe({ next: (r) => this.processos.set(opcoes(r.content)), error: () => undefined });
    this.rh.listarBasesOperacionais({ ativo: true, page: 0, size: 100, sort: 'nome,asc' }).subscribe({ next: (r) => this.bases.set(opcoes(r.content)), error: () => undefined });
    inject(CentrosCustoLookupService).listar().subscribe({ next: (c) => this.centros.set(opcoes(c)), error: () => undefined });
  }

  private inicioPadrao(): string {
    const d = new Date();
    d.setDate(d.getDate() - DIAS_PADRAO_INSPECOES);
    return dataIso(d)!;
  }

  private nome(opcoes: readonly GeoSelectOption<string>[], id: string): string {
    return opcoes.find((o) => o.value === id)?.label ?? 'selecionado';
  }

  /** Filtros da consulta (e da exportação). `/inspecoes/minhas` não recebe inspetor. */
  private filtro(pagina?: { page: number; size: number; sort: string }): InspecaoFilters {
    const { filters: f, query } = this.lista.request();
    const lista = <T>(v: readonly T[]): T[] | undefined => (v.length ? [...v] : undefined);
    const de = dataLocal(f.realizacao.from);
    const ate = dataLocal(f.realizacao.to);
    ate?.setHours(23, 59, 59, 999);
    const filtro: InspecaoFilters = {
      idTipoInspecao: lista(f.tipo),
      idFormulario: lista(f.formulario),
      idProcesso: lista(f.processo),
      idProcessoInspetor: lista(f.processoInspetor),
      idBaseOperacional: lista(f.base),
      idCentroCusto: lista(f.centroCusto),
      idEquipe: lista(f.equipe),
      idInspetor: f.minhas ? undefined : lista(f.inspetor),
      status: lista(f.status),
      apenasComDesvios: f.comDesvios ?? undefined,
      dataRealizacaoDe: de?.toISOString(),
      dataRealizacaoAte: ate?.toISOString(),
      buscaGlobal: query || undefined,
      ...pagina
    };
    return Object.fromEntries(Object.entries(filtro).filter(([, v]) => v !== undefined)) as InspecaoFilters;
  }

  protected realizacao(limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters.realizacao.update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  protected readonly iconeStatus: Record<string, string> = ICONE_STATUS_INSPECAO;

  protected tom(s: StatusInspecao): GeoTone {
    return TOM_STATUS[s] ?? 'neutral';
  }

  protected rotuloStatus(s: StatusInspecao): string {
    return STATUS_INSPECAO_LABELS[s] ?? s;
  }

  protected nova(): void {
    void this.router.navigate(['/sst/inspecoes/nova']);
  }

  protected verDetalhe(i: InspecaoSegurancaResponse): void {
    window.open(this.router.serializeUrl(this.router.createUrlTree(['/sst/inspecoes', i.id])), '_blank');
  }

  protected exportar(): void {
    const filtro: InspecaoFilters = { ...this.filtro(), ...(this.lista.request().filters.minhas ? { apenasMinhas: true } : {}) };
    const tipo = this.exportTipo();
    const formato = this.exportFormato();
    const arquivo = this.exportArquivo();
    const pedido =
      tipo === 'inspecoes'
        ? formato === 'resumo'
          ? this.sst.exportarInspecoesResumo(filtro, arquivo)
          : this.sst.exportarInspecoesDetalhado(filtro, arquivo)
        : formato === 'resumo'
          ? this.sst.exportarDesviosResumo(filtro, arquivo)
          : this.sst.exportarDesviosDetalhado(filtro, arquivo);
    this.exportando.set(true);
    pedido.subscribe({
      next: (blob) => {
        this.exportando.set(false);
        this.exportacaoAberta.set(false);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${tipo}_${formato}.${arquivo}`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.exportando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
