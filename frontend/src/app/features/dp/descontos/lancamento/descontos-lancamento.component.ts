import { CurrencyPipe, SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  GeoAutocompleteComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
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
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../../core/lookup/store/remote-lookup';
import { DescontoResponse, DescontoStatus, MotivoDescontoResponse } from '../../../../core/models/desconto.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { RhDescontosService } from '../../../../core/services/rh-descontos.service';
import { RhService } from '../../../../core/services/rh.service';
import { FileDownloadUtil } from '../../../../core/utils/file-download.util';
import { AjudaListagemComponent } from '../../../../shared/listagem/ajuda-listagem.component';
import { dataIso, dataLocal } from '../../../../shared/listagem/listagem';

/** A mesma tela atende a consulta livre e as filas de trabalho (validar, baixar e finalizar). */
type ModoConsulta = 'todos' | 'validar' | 'baixar' | 'finalizar';

interface Fila {
  status: DescontoStatus;
  titulo: string;
  descricao: string;
  icone: string;
  vazioTitulo: string;
  vazioDescricao: string;
  /** Atalhos para as outras filas, na ordem do ciclo. */
  outrasFilas: { label: string; rota: string }[];
}

const FILAS: Record<Exclude<ModoConsulta, 'todos'>, Fila> = {
  validar: {
    status: 'SOLICITADO',
    titulo: 'Descontos a validar',
    descricao: 'Solicitações que ainda não passaram pela validação; itens e valores continuam editáveis. As mais antigas primeiro.',
    icone: 'pi pi-check-square',
    vazioTitulo: 'Nenhum desconto aguardando validação',
    vazioDescricao: 'A fila está zerada: nada pendente de análise no momento.',
    outrasFilas: [
      { label: 'Fila de baixa', rota: '/dp/descontos/baixa' },
      { label: 'Fila de finalização', rota: '/dp/descontos/finalizacao' }
    ]
  },
  baixar: {
    status: 'VALIDADO',
    titulo: 'Descontos a baixar',
    descricao: 'Descontos validados, com itens congelados, esperando o lançamento na folha. Os mais antigos primeiro.',
    icone: 'pi pi-wallet',
    vazioTitulo: 'Nenhum desconto aguardando baixa',
    vazioDescricao: 'Tudo que foi validado já está baixado em folha.',
    outrasFilas: [
      { label: 'Fila de validação', rota: '/dp/descontos/validacao' },
      { label: 'Fila de finalização', rota: '/dp/descontos/finalizacao' }
    ]
  },
  finalizar: {
    status: 'BAIXADO',
    titulo: 'Descontos a finalizar',
    descricao: 'Baixados em folha esperando o termo assinado pelo colaborador. Imprima, colete a assinatura e anexe no termo. Os mais antigos primeiro.',
    icone: 'pi pi-verified',
    vazioTitulo: 'Nenhum desconto aguardando o termo assinado',
    vazioDescricao: 'Todo desconto baixado já tem o termo assinado anexado.',
    outrasFilas: [
      { label: 'Fila de validação', rota: '/dp/descontos/validacao' },
      { label: 'Fila de baixa', rota: '/dp/descontos/baixa' }
    ]
  }
};

const STATUS_DESCONTO: GeoSelectOption<DescontoStatus>[] = [
  { label: 'Solicitado', value: 'SOLICITADO' },
  { label: 'Validado', value: 'VALIDADO' },
  { label: 'Baixado', value: 'BAIXADO' },
  { label: 'Finalizado', value: 'FINALIZADO' },
  { label: 'Rejeitado', value: 'REJEITADO' }
];
const ORDEM_STATUS = STATUS_DESCONTO.map((s) => s.value);
const TOM_STATUS: Record<DescontoStatus, GeoTone> = { SOLICITADO: 'warning', VALIDADO: 'info', BAIXADO: 'success', FINALIZADO: 'success', REJEITADO: 'danger' };
/** Finalizado é o verde cheio: o fim do ciclo salta aos olhos e não se confunde com validado nem com baixado. */
const ENFASE_STATUS: Partial<Record<DescontoStatus, 'soft' | 'solid'>> = { FINALIZADO: 'solid' };
/** Cor nunca é o único indicador: cada status tem também o seu ícone. */
const ICONE_STATUS: Record<DescontoStatus, string> = {
  SOLICITADO: 'pi-clock',
  VALIDADO: 'pi-check-circle',
  BAIXADO: 'pi-wallet',
  FINALIZADO: 'pi-verified',
  REJEITADO: 'pi-times-circle'
};
/** Padrão da consulta: criados nos últimos 90 dias (links com parâmetros abrem sem limite). */
export const DIAS_PADRAO_DESCONTOS = 90;
const FORMATOS: GeoSelectOption<'resumo' | 'detalhado'>[] = [
  { label: 'Resumo (um por desconto)', value: 'resumo' },
  { label: 'Detalhado (um por item)', value: 'detalhado' }
];

@Component({
  selector: 'app-descontos-lancamento',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    FormsModule,
    RouterLink,
    SlicePipe,
    GeoAutocompleteComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        [title]="titulo"
        [icon]="fila?.icone ?? 'pi pi-money-bill'"
        [breadcrumb]="breadcrumb"
        [description]="fila?.descricao ?? 'Descontos em folha: solicitação, validação, baixa e rejeição, com os valores de cada etapa.'"
        helpLabel="Ajuda sobre descontos"
        (help)="ajuda.show()"
      >
        <!-- Botões fixos: o slot "actions" do cabeçalho não projeta conteúdo de um @for. -->
        @if (fila) {
          <geo-button actions variant="ghost" icon="pi pi-arrow-right-arrow-left" [label]="fila.outrasFilas[0].label" [routerLink]="fila.outrasFilas[0].rota"></geo-button>
        }
        @if (fila) {
          <geo-button actions variant="ghost" icon="pi pi-arrow-right-arrow-left" [label]="fila.outrasFilas[1].label" [routerLink]="fila.outrasFilas[1].rota"></geo-button>
        }
        <geo-button actions variant="outline" icon="pi pi-download" label="Exportar CSV" (pressed)="exportacaoAberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo desconto" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel [storageKey]="'dp-descontos-' + modo" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-autocomplete label="Colaborador" placeholder="Digite o nome" [options]="colaboradores.items()" [ngModel]="lista.filters.colaboradorId()"
            (ngModelChange)="lista.filters.colaboradorId.set($event)" [loading]="colaboradores.loading()" [status]="colaboradores.status()" [clearable]="true"
            (search)="colaboradores.search($event)" (loadMore)="colaboradores.loadNext()" (retry)="colaboradores.retry()"></geo-autocomplete>
          <geo-select label="Motivo" [options]="motivosOpcoes()" [(value)]="lista.filters.motivoId" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          @if (!fila) {
            <geo-multiselect label="Status" [options]="statusOpcoes" [(value)]="lista.filters.status" [filter]="false" placeholder="Todos"></geo-multiselect>
          }
          <geo-datepicker label="Criados a partir de" [value]="dataLocal(lista.filters.criacao().from)" [clearable]="true" (valueChange)="intervalo('criacao', 'from', $event)"></geo-datepicker>
          <geo-datepicker label="Criados até" [value]="dataLocal(lista.filters.criacao().to)" [clearable]="true" (valueChange)="intervalo('criacao', 'to', $event)"></geo-datepicker>
          <geo-datepicker label="Ocorrência a partir de" [value]="dataLocal(lista.filters.ocorrencia().from)" [clearable]="true" (valueChange)="intervalo('ocorrencia', 'from', $event)"></geo-datepicker>
          <geo-datepicker label="Ocorrência até" [value]="dataLocal(lista.filters.ocorrencia().to)" [clearable]="true" (valueChange)="intervalo('ocorrencia', 'to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <geo-data-table
        [title]="titulo"
        mode="server"
        [storageKey]="'dp-descontos-' + modo"
        searchPlaceholder="Colaborador, motivo, status, observações ou código"
        rowActionLabel="Detalhes"
        rowActionIcon="pi pi-external-link"
        emptyActionLabel="Novo desconto"
        noResultsTitle="Nenhum desconto encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os descontos' : (fila?.vazioTitulo ?? 'Nenhum desconto lançado')"
        [stateDescription]="resultado.error() ?? (fila?.vazioDescricao ?? 'Lance um desconto para descontá-lo em folha.')"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="abrir($event.id)"
      >
        @if (!fila) {
          <div table-filters class="geo-quick-filters" role="group" aria-label="Mostrar só os status escolhidos">
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="!statusAplicados().length" (click)="definirStatus([])">
              <i class="pi pi-list" aria-hidden="true"></i> Todos
            </button>
            @for (s of statusOpcoes; track s.value) {
              <button type="button" class="geo-quick-filter" [attr.aria-pressed]="statusAplicados().includes(s.value)" (click)="alternarStatus(s.value)">
                <i [class]="'pi ' + icone(s.value)" aria-hidden="true"></i> {{ s.label }}
              </button>
            }
          </div>
        }
        <ng-template geoCell="colaborador" let-row>
          <span class="geo-cell-strong">{{ nomeColaborador(row.colaboradorId) }}</span>
          <span class="geo-cell-muted">#{{ row.id | slice: 0 : 8 }}</span>
        </ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status [tone]="tom(row.status)" [emphasis]="enfase(row.status)" [icon]="icone(row.status)">{{ rotuloStatus(row.status) }}</geo-status>
        </ng-template>
        <ng-template geoCell="sugerido" let-row>
          <span [title]="'Soma de ' + (row.itens?.length ?? 0) + ' item(ns) lançado(s)'">{{ row.valorSugerido | currency: 'BRL' }}</span>
        </ng-template>
        <ng-template geoCell="validado" let-row>
          @if (row.valorValidado !== null && row.valorValidado !== undefined) {
            <span>{{ row.valorValidado | currency: 'BRL' }}</span>
            @if (divergencia(row, 'validado'); as diff) {
              <geo-status [tone]="diff > 0 ? 'warning' : 'info'" [icon]="diff > 0 ? 'pi-arrow-up' : 'pi-arrow-down'" emphasis="outline">{{ abs(diff) | currency: 'BRL' }}</geo-status>
            }
          } @else {
            <span class="geo-cell-muted">—</span>
          }
        </ng-template>
        <ng-template geoCell="baixado" let-row>
          @if (row.valorBaixado !== null && row.valorBaixado !== undefined) {
            <span class="geo-cell-strong">{{ row.valorBaixado | currency: 'BRL' }}</span>
            @if (divergencia(row, 'baixado'); as diff) {
              <geo-status [tone]="diff > 0 ? 'warning' : 'info'" [icon]="diff > 0 ? 'pi-arrow-up' : 'pi-arrow-down'" emphasis="outline">{{ abs(diff) | currency: 'BRL' }}</geo-status>
            }
          } @else {
            <span class="geo-cell-muted">—</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <geo-icon-button icon="pi pi-print" [label]="'Imprimir desconto de ' + nomeColaborador(row.colaboradorId)" size="icon-sm" (pressed)="abrir(row.id, true)"></geo-icon-button>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="exportacaoAberta" title="Exportar descontos (CSV)" description="Exporta o recorte atual da lista, inclusive a busca." size="sm">
      <geo-select label="Formato" [options]="formatos" [(value)]="formato"></geo-select>
      <geo-callout tone="info">Limite de 10.000 registros. Se o recorte for maior, reduza o período nos filtros.</geo-callout>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="exportacaoAberta.set(false)"></geo-button>
        <geo-button icon="pi pi-download" label="Exportar" [loading]="exportando()" (pressed)="exportar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-ajuda-listagem #ajuda [titulo]="titulo" entidadePlural="descontos" busca="colaborador, motivo, status, observações ou código" rotuloNovo="Novo desconto">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-sort-amount-down"></i> Valores por etapa</h4>
        <p class="help-text-desc"><strong>Sugerido</strong> é a soma dos itens; <strong>Validado</strong> e <strong>Baixado</strong> mostram a diferença em relação à etapa anterior (seta para cima: valor maior). O que vale no fim é o baixado.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-inbox"></i> Filas de trabalho</h4>
        <p class="help-text-desc">"A validar", "A baixar" e "A finalizar" mostram só o status da fila, mais antigos primeiro. A consulta geral abre nos últimos {{ diasPadrao }} dias; links do painel abrem sem limite de data.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class DescontosLancamentoComponent {
  private readonly descontos = inject(RhDescontosService);
  private readonly rh = inject(RhService);
  private readonly notificacoes = inject(NotificationService);
  private readonly lookupStore = inject(LookupStore);
  private readonly rota = inject(ActivatedRoute);

  protected readonly modo: ModoConsulta = (this.rota.snapshot.data['modo'] as ModoConsulta) ?? 'todos';
  protected readonly fila: Fila | null = this.modo === 'todos' ? null : FILAS[this.modo];
  protected readonly titulo = this.fila?.titulo ?? 'Descontos em folha';
  protected readonly breadcrumb = [{ label: 'DP' }, { label: 'Descontos em folha' }, { label: this.fila ? this.fila.titulo : 'Consulta' }];
  protected readonly statusOpcoes = STATUS_DESCONTO;
  protected readonly formatos = FORMATOS;
  protected readonly diasPadrao = DIAS_PADRAO_DESCONTOS;
  protected readonly dataLocal = dataLocal;
  protected readonly abs = Math.abs;

  protected readonly motivos = signal<MotivoDescontoResponse[]>([]);
  protected readonly motivosOpcoes = computed<GeoSelectOption<string>[]>(() => this.motivos().map((m) => ({ label: m.descricao, value: m.id })));
  /** Nomes dos colaboradores da página (a resposta traz só o ID). */
  private readonly nomes = signal<Record<string, string>>({});
  protected readonly colaboradores: RemoteLookup<string> = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor, limit: 50 }),
    selectedValues: () => (this.lista.filters.colaboradorId() ? [this.lista.filters.colaboradorId()!] : []),
    destroyRef: inject(DestroyRef)
  });

  /** Sem parâmetros (menu), a consulta abre nos últimos 90 dias; links (painel) abrem sem limite. */
  private readonly comLimite = this.modo === 'todos' && this.rota.snapshot.queryParamMap.keys.length === 0;

  protected readonly lista = geoListState({
    storageKey: `dp-descontos-${this.modo}`,
    pageSize: 20,
    // A busca é texto livre (pode conter nome de pessoa): não vai para a URL.
    queryParam: false,
    filters: {
      colaboradorId: geoFilter.value<string | null>(null, { label: 'Colaborador', param: 'colaboradorId', format: (id): string | null => (id ? (this.nomes()[id] ?? 'colaborador selecionado') : null) }),
      motivoId: geoFilter.value<string | null>(null, {
        label: 'Motivo',
        param: 'motivo',
        format: (id): string | null => (id ? (this.motivos().find((m) => m.id === id)?.descricao ?? 'motivo selecionado') : null)
      }),
      status: geoFilter.list<DescontoStatus>([], { label: 'Status', itemLabel: (s) => STATUS_DESCONTO.find((o) => o.value === s)?.label ?? s }),
      criacao: geoFilter.range(this.comLimite ? { from: this.inicioPadrao(), to: null } : { from: null, to: null }, { label: 'Criação' }),
      ocorrencia: geoFilter.range({ from: null, to: null }, { label: 'Ocorrência' })
    },
    // Fila é trabalho a fazer: o mais antigo primeiro. Na consulta, o mais recente.
    sort: [{ key: 'criado', direction: this.fila ? 'asc' : 'desc' }]
  });
  protected readonly statusAplicados = computed(() => this.lista.applied().status);
  protected readonly resultado = this.lista.results<DescontoResponse>((pedido) => this.descontos.buscarDescontos(this.filtro(pedido)), { errorMessage: getErrorMessage });

  protected readonly colunas: GeoDataTableColumn<DescontoResponse>[] = [
    { key: 'colaborador', header: 'Colaborador', type: 'custom', priority: 1, sortField: 'colaborador', value: (d) => this.nomeColaborador(d.colaboradorId) },
    { key: 'motivo', header: 'Motivo', priority: 1, sortField: 'motivo.descricao', value: (d) => d.motivo?.descricao, display: (d) => d.motivo?.descricao ?? '—' },
    { key: 'status', header: 'Status', type: 'custom', priority: 1, sortField: 'status', value: (d) => d.status, display: (d) => this.rotuloStatus(d.status) },
    { key: 'sugerido', header: 'Sugerido', type: 'custom', sortField: 'valorSugerido', value: (d) => d.valorSugerido },
    { key: 'validado', header: 'Validado', type: 'custom', sortField: 'valorValidado', value: (d) => d.valorValidado },
    { key: 'baixado', header: 'Baixado', type: 'custom', sortField: 'valorBaixado', value: (d) => d.valorBaixado },
    { key: 'parcelas', header: 'Parcelas', sortField: 'quantidadeParcelas', value: (d) => d.quantidadeParcelas, display: (d) => `${d.quantidadeParcelas}x` },
    { key: 'ocorrencia', header: 'Ocorrência', type: 'date', sortField: 'dataOcorrencia', value: (d) => d.dataOcorrencia },
    { key: 'criado', header: 'Criado em', type: 'date', sortField: 'dataCriacao', value: (d) => d.dataCriacao }
  ];
  protected readonly rotulo = (d: DescontoResponse) => this.nomeColaborador(d.colaboradorId);

  protected readonly exportacaoAberta = signal(false);
  protected readonly formato = signal<'resumo' | 'detalhado'>('resumo');
  protected readonly exportando = signal(false);

  constructor() {
    this.descontos.listarMotivos({ page: 0, size: 200, ativo: true }).subscribe({ next: (r) => this.motivos.set(r.content), error: () => undefined });
    effect(() => {
      const ids = [...this.resultado.rows().map((d) => d.colaboradorId), this.lista.filters.colaboradorId()];
      untracked(() => this.carregarNomes(ids));
    });
  }

  private inicioPadrao(): string {
    const d = new Date();
    d.setDate(d.getDate() - DIAS_PADRAO_DESCONTOS);
    return dataIso(d)!;
  }

  private carregarNomes(ids: readonly (string | null)[]): void {
    const conhecidos = this.nomes();
    new Set(ids.filter((id): id is string => !!id && !(id in conhecidos))).forEach((id) =>
      this.rh
        .buscarColaboradorPorId(id)
        .pipe(catchError(() => of(null)))
        .subscribe((c) => {
          this.nomes.update((n) => ({ ...n, [id]: c?.nomeCompleto ?? 'Colaborador removido' }));
          if (c) this.colaboradores.seedSelected({ value: c.id, label: c.nomeCompleto });
        })
    );
  }

  /** Parâmetros da consulta (também usados na exportação). */
  private filtro(pedido?: { page: number; size: number; sort: readonly { key: string; direction: string }[] }): Record<string, unknown> {
    const { filters: f, query } = this.lista.request();
    const inicioDoDia = (iso: string | null) => dataLocal(iso)?.toISOString();
    const fimDoDia = (iso: string | null) => {
      const d = dataLocal(iso);
      d?.setHours(23, 59, 59, 999);
      return d?.toISOString();
    };
    const params: Record<string, unknown> = {
      colaboradorId: f.colaboradorId ?? undefined,
      motivoId: f.motivoId ?? undefined,
      // Numa fila o status é o da fila, não escolha do usuário.
      status: this.fila ? this.fila.status : f.status.length ? f.status.join(',') : undefined,
      dataCriacaoInicio: inicioDoDia(f.criacao.from),
      dataCriacaoFim: fimDoDia(f.criacao.to),
      dataOcorrenciaInicio: inicioDoDia(f.ocorrencia.from),
      dataOcorrenciaFim: fimDoDia(f.ocorrencia.to),
      buscaGlobal: query || undefined
    };
    if (pedido) {
      params['page'] = pedido.page;
      params['size'] = pedido.size;
      params['sort'] = pedido.sort.map((r) => `${r.key},${r.direction}`)[0] ?? (this.fila ? 'dataCriacao,asc' : 'dataCriacao,desc');
    }
    return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  }

  protected intervalo(filtro: 'criacao' | 'ocorrencia', limite: 'from' | 'to', data: Date | null): void {
    this.lista.filters[filtro].update((atual) => ({ ...atual, [limite]: dataIso(data) }));
  }

  protected nomeColaborador(id: string): string {
    return this.nomes()[id] ?? '…';
  }

  protected tom(s: DescontoStatus): GeoTone {
    return TOM_STATUS[s] ?? 'neutral';
  }

  protected enfase(s: DescontoStatus): 'soft' | 'solid' {
    return ENFASE_STATUS[s] ?? 'soft';
  }

  protected icone(s: DescontoStatus): string {
    return ICONE_STATUS[s] ?? 'pi-circle';
  }

  protected definirStatus(status: readonly DescontoStatus[]): void {
    this.lista.set('status', [...status]);
  }

  /** Atalho de status: liga/desliga o status, somando aos já escolhidos. */
  protected alternarStatus(status: DescontoStatus): void {
    const atuais = this.statusAplicados();
    const proximos = atuais.includes(status) ? atuais.filter((s) => s !== status) : [...atuais, status];
    this.definirStatus(ORDEM_STATUS.filter((s) => proximos.includes(s)));
  }

  protected rotuloStatus(s: DescontoStatus): string {
    return STATUS_DESCONTO.find((o) => o.value === s)?.label ?? s;
  }

  /** Diferença em relação à etapa anterior; `null` sem divergência. */
  protected divergencia(d: DescontoResponse, etapa: 'validado' | 'baixado'): number | null {
    if (etapa === 'validado') {
      if (d.valorValidado === null || d.valorValidado === undefined) return null;
      const diff = d.valorValidado - (d.valorSugerido ?? 0);
      return Math.abs(diff) < 0.005 ? null : diff;
    }
    if (d.valorBaixado === null || d.valorBaixado === undefined) return null;
    const diff = d.valorBaixado - (d.valorValidado ?? d.valorSugerido ?? 0);
    return Math.abs(diff) < 0.005 ? null : diff;
  }

  protected novo(): void {
    window.open('/dp/descontos/novo', '_blank');
  }

  protected abrir(id: string, imprimir = false): void {
    window.open(imprimir ? `/dp/descontos/${id}?mode=print` : `/dp/descontos/${id}`, '_blank');
  }

  protected exportar(): void {
    const formato = this.formato();
    this.exportando.set(true);
    const params = this.filtro();
    (formato === 'resumo' ? this.descontos.exportarResumo(params) : this.descontos.exportarDetalhado(params)).subscribe({
      next: (blob) => {
        this.exportando.set(false);
        this.exportacaoAberta.set(false);
        FileDownloadUtil.downloadBlob(blob, `descontos_${formato}.csv`);
        this.notificacoes.success('Exportação iniciada.');
      },
      error: (e) => {
        this.exportando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
