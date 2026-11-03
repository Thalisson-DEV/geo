import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, map } from 'rxjs';

import {
  CesButtonComponent,
  CesCalloutComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesDrillStateService,
  CesFilterChip,
  CesFilterPanelComponent,
  CesMeterComponent,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesSortRule,
  CesStatusComponent,
  CesTabItem,
  CesTabPanelDirective,
  CesTabValue,
  CesTabsComponent,
  CesTone,
  NotificationService
} from '@ces/ui';
import { BaseOperacionalResponse, CentroFaturamentoResponse, FuncaoResponse, ProcessoNegocioResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { TipoInspecaoResponse } from '../../../core/models/sst.models';
import {
  AcompanhamentoMetaFilter,
  AcompanhamentoMetaItem,
  AcompanhamentoMetasResponse,
  ESCOPO_META_LABELS,
  PERIODICIDADE_LABELS,
  STATUS_META_LABELS,
  StatusMeta,
  formatarDataBr,
  toDataIso
} from '../../../core/models/meta-inspecao.models';
import { CentrosCustoLookupService } from '../../../core/services/centros-custo-lookup.service';
import { MetasInspecaoService } from '../../../core/services/metas-inspecao.service';
import { RhService } from '../../../core/services/rh.service';
import { SstService } from '../../../core/services/sst.service';
import { temSelecao } from '../../../core/utils/http-params.util';
import { createUrlFilters, qp } from '../../../core/navigation';
import { chipsDoRecorte, opcoesDe } from '../../../shared/components/dashboard/dashboard-filtros';
import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup } from '../../../core/lookup/store/remote-lookup';
import { DashboardAnaliseComponent } from '../../../shared/components/dashboard/dashboard-analise.component';
import { AlvoAnalise, VistaAnalise } from '../../../shared/components/dashboard/dashboard-analise.models';
import { NavegacaoAnaliseService } from '../../../shared/components/dashboard/dashboard-analise.navegacao';
import { chavePessoa, vistaMetas } from './analise-metas';

const TOM_STATUS: Record<StatusMeta, CesTone> = { NAO_ATINGIDA: 'danger', EM_ANDAMENTO: 'warning', ATINGIDA: 'success' };
const ICONE_STATUS: Record<StatusMeta, string> = { NAO_ATINGIDA: 'pi-times-circle', EM_ANDAMENTO: 'pi-clock', ATINGIDA: 'pi-check-circle' };
/** Ordem de cobrança: quem não atingiu primeiro. */
const PESO_STATUS: Record<StatusMeta, number> = { NAO_ATINGIDA: 0, EM_ANDAMENTO: 1, ATINGIDA: 2 };

type Visao = 'pessoas' | 'bases' | 'funcoes';

/** Consolidado de um grupo (base ou função) a partir das metas por colaborador. */
interface GrupoMeta {
  id: string;
  nome: string;
  pessoas: number;
  atingiram: number;
  emAndamento: number;
  naoAtingiram: number;
  meta: number;
  realizado: number;
  percentual: number;
}

function agrupar(itens: readonly AcompanhamentoMetaItem[], chave: (i: AcompanhamentoMetaItem) => string | null, nome: (i: AcompanhamentoMetaItem) => string | null, vazio: string): GrupoMeta[] {
  const grupos = new Map<string, GrupoMeta>();
  for (const item of itens) {
    const id = chave(item) ?? 'sem';
    const g = grupos.get(id) ?? { id, nome: nome(item) ?? vazio, pessoas: 0, atingiram: 0, emAndamento: 0, naoAtingiram: 0, meta: 0, realizado: 0, percentual: 0 };
    g.pessoas++;
    if (item.status === 'ATINGIDA') g.atingiram++;
    else if (item.status === 'EM_ANDAMENTO') g.emAndamento++;
    else g.naoAtingiram++;
    g.meta += item.meta;
    // O excedente de um não compensa a falta de outro.
    g.realizado += Math.min(item.realizado, item.meta);
    grupos.set(id, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, percentual: g.meta ? (g.realizado / g.meta) * 100 : 0 }));
}

@Component({
  selector: 'app-sst-acompanhamento-metas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    CesButtonComponent,
    CesCalloutComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesDatepickerComponent,
    CesFilterPanelComponent,
    CesMeterComponent,
    CesMultiSelectComponent,
    CesPageHeaderComponent,
    CesStatusComponent,
    CesTabPanelDirective,
    CesTabsComponent,
    DashboardAnaliseComponent
  ],
  providers: [CesDrillStateService, NavegacaoAnaliseService],
  styleUrl: './acompanhamento-metas.component.css',
  template: `
    <div class="ces-page">
      <ces-page-header
        title="Acompanhamento das metas de inspeção"
        icon="pi pi-flag"
        [breadcrumb]="[{ label: 'Segurança' }, { label: 'Metas de inspeção' }, { label: 'Acompanhamento' }]"
        description="Quem já cumpriu, quem está a caminho e quem ficou para trás no período da meta. Conta só as inspeções lançadas pela própria pessoa."
      >
        <ces-button actions label="Cadastro de metas" icon="pi pi-cog" variant="outline" (pressed)="irParaCadastro()"></ces-button>
        <ces-button actions label="Atualizar" icon="pi pi-refresh" variant="ghost" [loading]="loading()" (pressed)="carregar()"></ces-button>
      </ces-page-header>

      <ces-filter-panel storageKey="dash-metas-inspecao" [activeCount]="chips().length" [summary]="chips()" [loading]="loading()"
        (applied)="carregar()" (cleared)="limpar()" (chipRemoved)="removerFiltro($event)">
        <div class="ces-filter-grid">
          <ces-datepicker label="Data de referência" placeholder="Hoje" [(value)]="dataReferencia" [clearable]="true"
            description="Mostra a situação como estava neste dia."></ces-datepicker>
          <ces-multiselect label="Tipo de inspeção" [options]="opcoes.tipos()" [value]="$any(filtros.idTipoInspecao ?? [])" (valueChange)="filtros.idTipoInspecao = $event" placeholder="Todos"></ces-multiselect>
          <ces-multiselect label="Função" [options]="opcoes.funcoes()" [value]="$any(filtros.idFuncao ?? [])" (valueChange)="filtros.idFuncao = $event" placeholder="Todas"></ces-multiselect>
          <ces-multiselect label="Colaborador" [options]="colaboradores()" [value]="$any(filtros.idColaborador ?? [])" (valueChange)="filtros.idColaborador = $event"
            placeholder="Todos" [loading]="colaboradoresLoading()" (search)="searchColaboradores({ filter: $event })" description="Digite ao menos 2 letras do nome."></ces-multiselect>
          <ces-multiselect label="Centro de custo" [options]="opcoes.centros()" [value]="$any(filtros.idCentroCusto ?? [])" (valueChange)="filtros.idCentroCusto = $event" placeholder="Todos"></ces-multiselect>
          <ces-multiselect label="Base operacional" [options]="opcoes.bases()" [value]="$any(filtros.idBaseOperacional ?? [])" (valueChange)="filtros.idBaseOperacional = $event" placeholder="Todas"></ces-multiselect>
          <ces-multiselect label="Processo" [options]="opcoes.processos()" [value]="$any(filtros.idProcesso ?? [])" (valueChange)="filtros.idProcesso = $event" placeholder="Todos"></ces-multiselect>
          <ces-multiselect label="Situação" [options]="statusOptions" [value]="$any(filtros.status ?? [])" (valueChange)="filtros.status = $event" [filter]="false" placeholder="Todas"></ces-multiselect>
        </div>
      </ces-filter-panel>

      @if (loading() && !data()) {
        <div class="am-skeleton" role="status" aria-label="Carregando o acompanhamento">
          <span class="am-skeleton__hero"></span>
          <span></span><span></span><span></span><span></span>
          <span class="am-skeleton__tabela"></span>
        </div>
      } @else if (erro()) {
        <ces-callout tone="danger" title="Não foi possível carregar o acompanhamento">
          {{ erro() }}
          <div class="am-callout-acao"><ces-button size="sm" variant="outline" icon="pi pi-refresh" label="Tentar de novo" (pressed)="carregar()"></ces-button></div>
        </ces-callout>
      } @else if (data(); as d) {
        @if (resumo(); as r) {
          <!-- Os números do topo ignoram o filtro de situação: com "Atingiram" aplicado, os outros grupos zerariam. -->
          <section class="am-panorama" aria-label="Panorama das metas">
            <div class="am-panorama__execucao">
              <div class="am-panorama__topo">
                <span class="am-rotulo">Execução das metas</span>
                <ces-button size="sm" variant="outline" icon="pi pi-chart-bar" label="Analisar" (pressed)="analisar('geral', 'todos')"></ces-button>
              </div>
              <strong class="am-panorama__numero" [attr.data-tone]="tomPercentual(r.percentualExecucaoGlobal)">{{ r.percentualExecucaoGlobal | number: '1.0-1' }}%</strong>
              <span class="am-muted">{{ r.somaRealizado }} de {{ r.somaMetas }} inspeções previstas no período</span>
              <div class="am-progresso" role="meter" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="r.percentualExecucaoGlobal" aria-label="Execução geral das metas" [attr.data-tone]="tomPercentual(r.percentualExecucaoGlobal)">
                <span [style.width.%]="r.percentualExecucaoGlobal > 100 ? 100 : r.percentualExecucaoGlobal"></span>
              </div>
            </div>

            <div class="am-panorama__pessoas">
              <div class="am-panorama__topo">
                <span class="am-rotulo">{{ r.totalColaboradores }} {{ r.totalColaboradores === 1 ? 'pessoa com meta' : 'pessoas com meta' }}</span>
                <span class="am-muted">Referência {{ formatarData(d.dataReferencia) }}</span>
              </div>
              @if (r.totalColaboradores) {
                <div class="am-barra" role="img" [attr.aria-label]="descricaoBarra()">
                  @for (fatia of fatias(); track fatia.status) {
                    @if (fatia.quantidade) {
                      <span [attr.data-tone]="fatia.tom" [style.flex-grow]="fatia.quantidade"></span>
                    }
                  }
                </div>
              }
              <div class="am-situacoes" role="group" aria-label="Filtrar a lista pela situação">
                @for (fatia of fatias(); track fatia.status) {
                  <button type="button" class="ces-kpi am-situacao" [attr.data-tone]="fatia.tom" [attr.aria-pressed]="situacaoUnica() === fatia.status" (click)="alternarSituacao(fatia.status)">
                    <span class="ces-kpi__icon"><i [class]="'pi ' + fatia.icone" aria-hidden="true"></i></span>
                    <span class="ces-kpi__body">
                      <span class="ces-kpi__label">{{ fatia.rotulo }}</span>
                      <span class="ces-kpi__value">{{ fatia.quantidade }}</span>
                      <span class="ces-kpi__detail">{{ fatia.percentual | number: '1.0-0' }}% das pessoas</span>
                    </span>
                  </button>
                }
              </div>
            </div>
          </section>
        }

        @if (filtrandoPorSituacao()) {
          <ces-callout tone="info" [dense]="true">
            A lista mostra só {{ situacoesSelecionadas() }}. O panorama acima continua com todo o recorte.
          </ces-callout>
        }
        @if (semAcesso() > 0) {
          <ces-callout tone="warning" [title]="semAcesso() === 1 ? '1 pessoa sem usuário no sistema' : semAcesso() + ' pessoas sem usuário no sistema'">
            Sem usuário, a pessoa não consegue lançar inspeções: o zero dela é falta de acesso, não falta de trabalho. Elas aparecem marcadas na lista.
          </ces-callout>
        }

        <ces-tabs [(value)]="visao" [tabs]="abas()" ariaLabel="Forma de ver as metas">
          <ng-template cesTabPanel="pessoas">
            <ces-data-table
              title="Metas por pessoa"
              storageKey="sst-metas-acompanhamento"
              exportFileName="acompanhamento-metas-inspecao"
              searchPlaceholder="Nome, função, base ou processo"
              noResultsTitle="Ninguém encontrado com essa busca."
              stateTitle="Nenhuma meta vigente neste recorte"
              stateDescription="Cadastre metas por função ou por pessoa para acompanhar aqui."
              emptyActionLabel="Cadastrar metas"
              [columns]="colunasPessoas"
              [rows]="d.itens"
              [rowKey]="chavePessoa"
              [rowLabel]="rotuloPessoa"
              [state]="d.itens.length ? 'ready' : 'empty'"
              [filtered]="chips().length > 0"
              [(sort)]="ordemPessoas"
              rowActionLabel="Analisar"
              rowActionIcon="pi pi-chart-bar"
              (rowActivate)="analisar('pessoa', chavePessoa($event))"
              (emptyAction)="irParaCadastro()"
              (clearFilters)="limpar()"
            >
              <ng-template cesCell="pessoa" let-row>
                <span class="ces-cell-strong">
                  {{ row.nomeColaborador || 'Cadastro não disponível' }}
                  @if (!row.possuiUsuario) {
                    <ces-status tone="warning" icon="pi-user-minus">Sem usuário</ces-status>
                  }
                </span>
                <span class="ces-cell-muted">{{ row.nomeFuncao || 'Função não informada' }} · {{ row.nomeBaseOperacional || 'Base não informada' }}</span>
              </ng-template>
              <ng-template cesCell="progresso" let-row>
                <ces-meter class="am-medidor" [value]="row.percentualAtingimento" [detail]="row.realizado + ' de ' + row.meta" [label]="'Atingimento da meta de ' + (row.nomeColaborador || 'colaborador')"></ces-meter>
              </ng-template>
              <ng-template cesCell="situacao" let-row>
                <ces-status [tone]="tomStatus(row.status)" [icon]="iconeStatus(row.status)">{{ rotuloStatus(row.status) }}</ces-status>
              </ng-template>
              <ng-template cesCell="falta" let-row>
                @if (row.saldo > 0) {
                  <span class="ces-cell-strong ces-tabular-nums">{{ row.saldo }}</span>
                  <span class="ces-cell-muted">{{ row.saldo === 1 ? 'inspeção' : 'inspeções' }}</span>
                } @else {
                  <span class="ces-cell-muted">Nada</span>
                }
              </ng-template>
              <ng-template cesCell="prazo" let-row>
                @if (encerrada(row, d.dataReferencia)) {
                  <span class="ces-cell-muted">Período encerrado</span>
                } @else {
                  <span [class.am-texto-alerta]="row.diasRestantes <= 5 && row.saldo > 0">{{ tempoRestante(row) }}</span>
                }
                <span class="ces-cell-muted">{{ formatarData(row.janelaInicio) }} a {{ formatarData(row.janelaFim) }}</span>
              </ng-template>
              <ng-template cesCell="meta" let-row>
                <span>{{ row.nomeTipoInspecao || 'Todos os tipos' }} · {{ rotuloPeriodicidade(row) }}</span>
                <span class="ces-cell-muted">{{ row.origem === 'COLABORADOR' ? 'Meta individual' : 'Meta da função' }}</span>
              </ng-template>
            </ces-data-table>
          </ng-template>

          <ng-template cesTabPanel="bases">
            <ng-container [ngTemplateOutlet]="grupos" [ngTemplateOutletContext]="{ $implicit: porBase(), titulo: 'Metas por base operacional', chave: 'sst-metas-por-base', coluna: 'Base', dimensao: 'base' }"></ng-container>
          </ng-template>
          <ng-template cesTabPanel="funcoes">
            <ng-container [ngTemplateOutlet]="grupos" [ngTemplateOutletContext]="{ $implicit: porFuncao(), titulo: 'Metas por função', chave: 'sst-metas-por-funcao', coluna: 'Função', dimensao: 'funcao' }"></ng-container>
          </ng-template>
        </ces-tabs>
      }
    </div>

    <app-dashboard-analise [vista]="vistaAnalise()" [trilha]="analise.trilha()"
      (fechar)="analise.fechar()" (navegar)="aprofundar($event)" (trocar)="analise.trocar($event)" (voltar)="analise.voltar($event)" />

    <ng-template #grupos let-linhas let-titulo="titulo" let-chave="chave" let-coluna="coluna" let-dimensao="dimensao">
      <ces-data-table
        [title]="titulo"
        [storageKey]="chave"
        [exportFileName]="chave"
        [columns]="colunasGrupo(coluna)"
        [rows]="linhas"
        [rowKey]="chaveGrupo"
        [state]="linhas.length ? 'ready' : 'empty'"
        stateTitle="Nenhuma meta vigente neste recorte"
        [(sort)]="ordemGrupos"
        rowActionLabel="Analisar"
        rowActionIcon="pi pi-chart-bar"
        (rowActivate)="analisar(dimensao, $event.id)"
      >
        <ng-template cesCell="grupo" let-row>
          <span class="ces-cell-strong">{{ row.nome }}</span>
          <span class="ces-cell-muted">{{ row.pessoas }} {{ row.pessoas === 1 ? 'pessoa' : 'pessoas' }}</span>
        </ng-template>
        <ng-template cesCell="execucao" let-row>
          <ces-meter class="am-medidor" [value]="row.percentual" [detail]="row.realizado + ' de ' + row.meta" [label]="'Execução das metas de ' + row.nome"></ces-meter>
        </ng-template>
        <ng-template cesCell="distribuicao" let-row>
          <div class="am-mini" role="img" [attr.aria-label]="row.atingiram + ' atingiram, ' + row.emAndamento + ' em andamento, ' + row.naoAtingiram + ' não atingiram'">
            @if (row.naoAtingiram) { <span data-tone="danger" [style.flex-grow]="row.naoAtingiram"></span> }
            @if (row.emAndamento) { <span data-tone="warning" [style.flex-grow]="row.emAndamento"></span> }
            @if (row.atingiram) { <span data-tone="success" [style.flex-grow]="row.atingiram"></span> }
          </div>
          <span class="ces-cell-muted">{{ row.atingiram }} atingiram · {{ row.emAndamento }} a caminho · {{ row.naoAtingiram }} não atingiram</span>
        </ng-template>
      </ces-data-table>
    </ng-template>
  `
})
export class AcompanhamentoMetasComponent implements OnInit {
  private readonly metasService = inject(MetasInspecaoService);
  private readonly rh = inject(RhService);
  private readonly sstService = inject(SstService);
  private readonly lookupStore = inject(LookupStore);
  private readonly centrosCustoLookup = inject(CentrosCustoLookupService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly colaboradorLookup = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: () => this.filtros.idColaborador ?? [],
    destroyRef: this.destroyRef
  });

  protected readonly analise = inject(NavegacaoAnaliseService);
  protected readonly chavePessoa = chavePessoa;

  protected readonly loading = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** Resposta filtrada: alimenta as listas. */
  protected readonly data = signal<AcompanhamentoMetasResponse | null>(null);
  /** Resposta sem o filtro de situação: alimenta o panorama. */
  protected readonly resumo = signal<AcompanhamentoMetasResponse | null>(null);
  protected readonly tiposInspecao = signal<TipoInspecaoResponse[]>([]);
  protected readonly funcoes = signal<FuncaoResponse[]>([]);
  protected readonly colaboradores = this.colaboradorLookup.items;
  protected readonly colaboradoresLoading = this.colaboradorLookup.loading;
  protected readonly bases = signal<BaseOperacionalResponse[]>([]);
  protected readonly centrosCusto = signal<CentroFaturamentoResponse[]>([]);
  protected readonly processos = signal<ProcessoNegocioResponse[]>([]);

  protected readonly formatarData = formatarDataBr;
  protected readonly tomStatus = (s: StatusMeta) => TOM_STATUS[s];
  protected readonly iconeStatus = (s: StatusMeta) => ICONE_STATUS[s];
  protected readonly rotuloStatus = (s: StatusMeta) => STATUS_META_LABELS[s];
  protected readonly tomPercentual = (p: number): CesTone => (p >= 100 ? 'success' : p >= 80 ? 'warning' : 'danger');

  protected readonly statusOptions = [
    { label: STATUS_META_LABELS.NAO_ATINGIDA, value: 'NAO_ATINGIDA' as StatusMeta },
    { label: STATUS_META_LABELS.EM_ANDAMENTO, value: 'EM_ANDAMENTO' as StatusMeta },
    { label: STATUS_META_LABELS.ATINGIDA, value: 'ATINGIDA' as StatusMeta }
  ];

  protected readonly visao = signal<CesTabValue | undefined>('pessoas' satisfies Visao);
  protected readonly abas = computed<CesTabItem[]>(() => {
    const itens = this.data()?.itens ?? [];
    return [
      { value: 'pessoas', label: 'Por pessoa', icon: 'pi pi-user', badge: itens.length },
      { value: 'bases', label: 'Por base', icon: 'pi pi-building', badge: this.porBase().length },
      { value: 'funcoes', label: 'Por função', icon: 'pi pi-briefcase', badge: this.porFuncao().length }
    ];
  });

  /** Cobrança primeiro: menor atingimento no topo. */
  protected readonly ordemPessoas = signal<CesSortRule[]>([{ key: 'progresso', direction: 'asc' }]);
  protected readonly ordemGrupos = signal<CesSortRule[]>([{ key: 'execucao', direction: 'asc' }]);

  protected readonly colunasPessoas: CesDataTableColumn<AcompanhamentoMetaItem>[] = [
    { key: 'pessoa', header: 'Pessoa', type: 'custom', priority: 1, width: '16rem', value: (i) => i.nomeColaborador, display: (i) => i.nomeColaborador ?? 'Cadastro não disponível' },
    { key: 'progresso', header: 'Atingimento', type: 'custom', priority: 1, width: '13rem', value: (i) => i.percentualAtingimento, display: (i) => `${i.realizado} de ${i.meta} (${Math.round(i.percentualAtingimento)}%)` },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (i) => PESO_STATUS[i.status], display: (i) => STATUS_META_LABELS[i.status] },
    { key: 'falta', header: 'Falta', type: 'custom', value: (i) => i.saldo, display: (i) => String(i.saldo) },
    { key: 'prazo', header: 'Tempo restante', type: 'custom', value: (i) => i.diasRestantes, display: (i) => `${i.diasRestantes} dias (até ${formatarDataBr(i.janelaFim)})` },
    { key: 'meta', header: 'Meta', type: 'custom', priority: 3, value: (i) => i.nomeTipoInspecao, display: (i) => `${i.nomeTipoInspecao ?? 'Todos os tipos'} · ${PERIODICIDADE_LABELS[i.periodicidade]} · ${ESCOPO_META_LABELS[i.origem]}` },
    { key: 'centro', header: 'Centro de custo', priority: 3, value: (i) => i.nomeCentroCusto, display: (i) => i.nomeCentroCusto ?? '—' },
    { key: 'processo', header: 'Processo', priority: 3, value: (i) => i.nomeProcesso, display: (i) => i.nomeProcesso ?? '—' }
  ];
  protected readonly rotuloPessoa = (i: AcompanhamentoMetaItem) => i.nomeColaborador ?? 'colaborador';

  private readonly colunasPorGrupo = new Map<string, CesDataTableColumn<GrupoMeta>[]>();
  protected colunasGrupo(nome: string): CesDataTableColumn<GrupoMeta>[] {
    let colunas = this.colunasPorGrupo.get(nome);
    if (!colunas) {
      colunas = [
        { key: 'grupo', header: nome, type: 'custom', priority: 1, value: (g) => g.nome, display: (g) => g.nome },
        { key: 'execucao', header: 'Execução', type: 'custom', priority: 1, width: '13rem', value: (g) => g.percentual, display: (g) => `${g.realizado} de ${g.meta} (${Math.round(g.percentual)}%)` },
        { key: 'distribuicao', header: 'Pessoas', type: 'custom', priority: 1, value: (g) => g.naoAtingiram, display: (g) => `${g.atingiram} atingiram, ${g.emAndamento} em andamento, ${g.naoAtingiram} não atingiram` }
      ];
      this.colunasPorGrupo.set(nome, colunas);
    }
    return colunas;
  }
  protected readonly chaveGrupo = (g: GrupoMeta) => g.id;

  protected readonly porBase = computed(() => agrupar(this.data()?.itens ?? [], (i) => i.idBaseOperacional, (i) => i.nomeBaseOperacional, 'Sem base'));
  protected readonly porFuncao = computed(() => agrupar(this.data()?.itens ?? [], (i) => i.idFuncao, (i) => i.nomeFuncao, 'Sem função'));

  protected dataReferencia: Date | null = null;
  protected filtros: AcompanhamentoMetaFilter = this.filtroVazio();

  /** Recorte na URL (link compartilhável e voltar do navegador). */
  private readonly filtrosUrl = createUrlFilters<{
    referencia: Date;
    tipo: string[];
    funcao: string[];
    colaborador: string[];
    centro: string[];
    base: string[];
    processo: string[];
    situacao: string[];
  }>({
    referencia: qp.date('referencia'),
    tipo: qp.list('tipo'),
    funcao: qp.list('funcao'),
    colaborador: qp.list('colaborador'),
    centro: qp.list('centro'),
    base: qp.list('base'),
    processo: qp.list('processo'),
    situacao: qp.list('situacao')
  });
  /** Filtros da consulta que produziu `data()`: os chips mostram esse recorte. */
  private readonly filtrosAplicados = signal<AcompanhamentoMetaFilter>({});

  protected readonly opcoes = {
    tipos: computed(() => opcoesDe(this.tiposInspecao(), 'nome')),
    funcoes: computed(() => opcoesDe(this.funcoes(), 'nome')),
    centros: computed(() => opcoesDe(this.centrosCusto(), 'nome')),
    bases: computed(() => opcoesDe(this.bases(), 'nome')),
    processos: computed(() => opcoesDe(this.processos(), 'nome'))
  };

  protected readonly chips = computed<CesFilterChip[]>(() => {
    const f = this.filtrosAplicados();
    const chips = chipsDoRecorte(f as Record<string, unknown>, [
      { chave: 'idTipoInspecao', rotulo: 'Tipo', opcoes: this.opcoes.tipos() },
      { chave: 'idFuncao', rotulo: 'Função', opcoes: this.opcoes.funcoes() },
      { chave: 'idColaborador', rotulo: 'Colaborador', opcoes: this.colaboradores() },
      { chave: 'idCentroCusto', rotulo: 'Centro de custo', opcoes: this.opcoes.centros() },
      { chave: 'idBaseOperacional', rotulo: 'Base', opcoes: this.opcoes.bases() },
      { chave: 'idProcesso', rotulo: 'Processo', opcoes: this.opcoes.processos() },
      { chave: 'status', rotulo: 'Situação', opcoes: this.statusOptions }
    ]);
    if (f.dataReferencia) chips.unshift({ key: 'referencia', label: `Referência: ${formatarDataBr(f.dataReferencia)}` });
    return chips;
  });

  private readonly statusAplicado = signal<StatusMeta[]>([]);
  protected readonly situacaoUnica = computed(() => (this.statusAplicado().length === 1 ? this.statusAplicado()[0] : null));
  protected readonly filtrandoPorSituacao = computed(() => this.statusAplicado().length > 0);
  protected readonly situacoesSelecionadas = computed(() =>
    this.statusAplicado()
      .map((status) => `quem ${STATUS_META_LABELS[status].toLowerCase()}`)
      .join(' e ')
  );
  protected readonly semAcesso = computed(() => (this.data()?.itens ?? []).filter((item) => !item.possuiUsuario).length);

  protected readonly fatias = computed(() => {
    const r = this.resumo();
    const total = r?.totalColaboradores || 0;
    const fatia = (status: StatusMeta, rotulo: string, quantidade: number) => ({
      status,
      rotulo,
      quantidade,
      tom: TOM_STATUS[status],
      icone: ICONE_STATUS[status],
      percentual: total ? (quantidade / total) * 100 : 0
    });
    return [
      fatia('NAO_ATINGIDA', 'Não atingiram', r?.naoAtingiram ?? 0),
      fatia('EM_ANDAMENTO', 'A caminho', r?.emAndamento ?? 0),
      fatia('ATINGIDA', 'Atingiram', r?.atingiram ?? 0)
    ];
  });
  /** Análise detalhada aberta (`?drill=`), resolvida contra o acompanhamento em tela. */
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => {
    const alvo = this.analise.alvo();
    const d = this.data();
    return alvo && d ? vistaMetas(alvo, { d, sst: this.sstService }) : null;
  });

  protected readonly descricaoBarra = computed(() =>
    this.fatias()
      .map((f) => `${f.quantidade} ${f.rotulo.toLowerCase()}`)
      .join(', ')
  );

  constructor() {
    // Link de análise que não existe no recorte carregado (ex.: pessoa fora do filtro): fecha o painel.
    effect(() => {
      if (this.analise.alvo() && this.data() && !this.loading() && !this.vistaAnalise()) this.analise.fechar();
    });
  }

  protected analisar(dimension: string, value: string): void {
    this.analise.abrir(dimension, value);
  }

  protected aprofundar(alvo: AlvoAnalise): void {
    this.analise.aprofundar(alvo, this.vistaAnalise()?.titulo ?? '');
  }

  ngOnInit(): void {
    const url = this.filtrosUrl.read();
    this.dataReferencia = url.referencia ?? null;
    this.filtros = {
      idTipoInspecao: url.tipo ?? [],
      idFuncao: url.funcao ?? [],
      idColaborador: url.colaborador ?? [],
      idCentroCusto: url.centro ?? [],
      idBaseOperacional: url.base ?? [],
      idProcesso: url.processo ?? [],
      status: (url.situacao ?? []) as StatusMeta[]
    };
    this.carregarLookups();
    this.carregar();
  }

  protected removerFiltro(chave: string): void {
    if (chave === 'referencia') this.dataReferencia = null;
    else this.filtros = { ...this.filtros, [chave]: [] };
    this.carregar();
  }

  /** Os cartões de situação filtram a lista; clicar de novo desfaz. */
  protected alternarSituacao(status: StatusMeta): void {
    this.filtros = { ...this.filtros, status: this.situacaoUnica() === status ? [] : [status] };
    this.carregar();
  }

  protected carregar(): void {
    this.loading.set(true);
    this.erro.set(null);
    const filtros: AcompanhamentoMetaFilter = {
      ...this.filtros,
      dataReferencia: this.dataReferencia ? toDataIso(this.dataReferencia) : null,
      ordenarPor: 'PERCENTUAL',
      direcao: 'ASC'
    };
    const status = (filtros.status ?? []) as StatusMeta[];
    this.filtrosUrl.write({
      referencia: this.dataReferencia ?? undefined,
      tipo: this.filtros.idTipoInspecao ?? [],
      funcao: this.filtros.idFuncao ?? [],
      colaborador: this.filtros.idColaborador ?? [],
      centro: this.filtros.idCentroCusto ?? [],
      base: this.filtros.idBaseOperacional ?? [],
      processo: this.filtros.idProcesso ?? [],
      situacao: status
    });

    // Com uma situação escolhida, o panorama vem de uma segunda consulta sem esse recorte.
    const consulta$ = temSelecao(status)
      ? forkJoin({
          tabela: this.metasService.acompanhamento(filtros),
          cartoes: this.metasService.acompanhamento({ ...filtros, status: null })
        })
      : this.metasService.acompanhamento(filtros).pipe(map((resposta) => ({ tabela: resposta, cartoes: resposta })));

    consulta$.subscribe({
      next: ({ tabela, cartoes }) => {
        this.data.set(tabela);
        this.resumo.set(cartoes);
        this.statusAplicado.set(status);
        this.filtrosAplicados.set(filtros);
        this.loading.set(false);
      },
      error: (erro) => {
        this.loading.set(false);
        const mensagem = getErrorMessage(erro);
        if (this.data()) this.notificacoes.error(mensagem, { title: 'Não foi possível atualizar' });
        else this.erro.set(mensagem);
      }
    });
  }

  protected searchColaboradores(event: { filter?: string }): void {
    this.colaboradorLookup.search(event.filter ?? '');
  }

  protected limpar(): void {
    this.dataReferencia = null;
    this.filtros = this.filtroVazio();
    this.carregar();
  }

  private filtroVazio(): AcompanhamentoMetaFilter {
    return {
      idTipoInspecao: [],
      idFuncao: [],
      idColaborador: [],
      idBaseOperacional: [],
      idCentroCusto: [],
      idProcesso: [],
      status: []
    };
  }

  /** O período acaba no fim do dia `janelaFim`; no último dia `diasRestantes` já vem 0. */
  protected encerrada(item: AcompanhamentoMetaItem, referencia: string): boolean {
    return item.janelaFim.substring(0, 10) < referencia.substring(0, 10);
  }

  protected tempoRestante(item: AcompanhamentoMetaItem): string {
    if (item.diasRestantes === 0) return 'Termina hoje';
    if (item.diasRestantes === 1) return 'Termina amanhã';
    return `${item.diasRestantes} dias`;
  }

  protected rotuloPeriodicidade(item: AcompanhamentoMetaItem): string {
    return PERIODICIDADE_LABELS[item.periodicidade];
  }

  protected irParaCadastro(): void {
    void this.router.navigate(['/sst/metas-inspecao']);
  }

  private carregarLookups(): void {
    forkJoin({
      tiposInspecao: this.sstService.listarOpcoesTiposInspecao(),
      funcoes: this.rh.listarFuncoesAtivas(),
      bases: this.rh.listarBasesOperacionais({ ativo: true, page: 0, size: 100, sort: 'nome,asc' }),
      centrosCusto: this.centrosCustoLookup.listar(),
      processos: this.rh.listarProcessosAtivos()
    }).subscribe({
      next: (resposta) => {
        this.tiposInspecao.set(resposta.tiposInspecao);
        this.funcoes.set(resposta.funcoes.content);
        this.bases.set(resposta.bases.content);
        this.centrosCusto.set(resposta.centrosCusto);
        this.processos.set(resposta.processos.content);
      },
      error: () => undefined
    });
  }
}
