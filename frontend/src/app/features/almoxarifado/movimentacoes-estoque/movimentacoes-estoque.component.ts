import { iconeCondicao } from '../../../shared/utils/movimentacao.utils';
import { DevolucaoComercialDrawerComponent } from './devolucao-comercial/devolucao-comercial-drawer.component';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoAutocompleteComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoRowDetailDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoDialogShellComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTone,
  geoFilter,
  geoListState
} from '@geo/ui';
import { catchError, of, switchMap } from 'rxjs';

import { RemoteLookup as BuscaMateriais } from '../../../core/lookup/store/remote-lookup';
import { LookupStore } from '../../../core/lookup/store/lookup.store';
import {
  EstoqueResponse,
  MaterialResponse,
  MotivoMovimentacao,
  MovimentacaoContagensResponse,
  MovimentacaoOperacaoResponse,
  MovimentacaoOperacaoSummaryResponse,
  ProcessoMovimentacao,
  TipoMovimentacao
} from '../../../core/models/almoxarifado.models';
import { BaseOperacionalResponse } from '../../../core/models/rh.models';
import { generateReferenceOptions, getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { RhService } from '../../../core/services/rh.service';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { SaldoEstoqueDialogComponent } from '../../../shared/components/saldo-estoque-dialog/saldo-estoque-dialog.component';
import { SeriesGradeComponent, SerieGradeItem } from '../../../shared/components/series-grade/series-grade.component';
import {
  ItemMovimentacaoAgrupado,
  MOTIVOS_MOVIMENTACAO,
  agruparItensPorMaterial,
  iconeTipoMovimentacao,
  rotuloCondicao,
  rotuloMotivo,
  tomCondicao,
  tomTipoMovimentacao
} from '../../../shared/utils/movimentacao.utils';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import {
  CopilotoAreaComponent,
  CopilotoDashboardContext,
  CopilotoGatilhoComponent,
  CopilotoPainelService,
  filtroPainel,
  graficoPainel,
  metricaPainel,
  periodoPainel
} from '../../copiloto/painel';
import { MovimentacoesImportacaoComponent } from './movimentacoes-importacao.component';
import { OperacaoEstoqueDrawerComponent, TipoOperacaoEstoque } from './operacao-estoque/operacao-estoque-drawer.component';

export interface OperacaoCardOption {
  tipo: TipoMovimentacao | 'DEVOLUCAO_COMERCIAL' | 'DEVOLUCAO_TECNICA' | 'IMPORTACAO';
  titulo: string;
  subtitulo: string;
  tag: string;
  descricao: string;
  rota: string;
  icone: string;
  badgeTone: GeoTone;
  /** Ícone da tag do cartão; complementa o ícone grande da operação. */
  tagIcone: string;
}

const TIPOS: GeoSelectOption<TipoMovimentacao | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Entrada avulsa', value: 'ENTRADA_AVULSA' },
  { label: 'Baixa avulsa', value: 'BAIXA_AVULSA' },
  { label: 'Transferência', value: 'TRANSFERENCIA' },
  { label: 'Entrega', value: 'ENTREGA' },
  { label: 'Devolução', value: 'DEVOLUCAO' },
  { label: 'Estorno', value: 'ESTORNO' },
  { label: 'Retirada', value: 'RETIRADA' },
  { label: 'Aplicação', value: 'APLICACAO' }
];
const OPERACAO_DA_URL: Record<string, TipoOperacaoEstoque> = { entrada: 'ENTRADA', baixa: 'BAIXA', transferencia: 'TRANSFERENCIA' };
const PROCESSOS: GeoSelectOption<ProcessoMovimentacao | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Comercial', value: 'COMERCIAL' },
  { label: 'Técnico', value: 'TECNICO' },
  { label: 'Fechamento', value: 'FECHAMENTO' }
];
const OPERACOES: OperacaoCardOption[] = [
  {
    tipo: 'TRANSFERENCIA',
    titulo: 'Transferência entre estoques',
    subtitulo: 'Movimentação',
    tag: 'Transferência',
    descricao: 'Remanejamento de materiais entre bases ou almoxarifados, com conferência física e validação de saldos.',
    rota: 'TRANSFERENCIA',
    icone: 'pi pi-arrow-right-arrow-left',
    badgeTone: 'brand',
    tagIcone: 'pi-sync'
  },
  {
    tipo: 'ENTRADA_AVULSA',
    titulo: 'Entrada avulsa',
    subtitulo: 'Ajuste positivo',
    tag: 'Entrada',
    descricao: 'Incorporação extraordinária por ajuste de inventário, devolução de equipe, suprimento emergencial ou bonificação.',
    rota: 'ENTRADA',
    icone: 'pi pi-plus-circle',
    badgeTone: 'success',
    tagIcone: 'pi-plus'
  },
  {
    tipo: 'BAIXA_AVULSA',
    titulo: 'Baixa avulsa',
    subtitulo: 'Ajuste negativo',
    tag: 'Baixa / descarte',
    descricao: 'Desincorporação definitiva por sucateamento, perda, avaria irreparável ou correção de inventário.',
    rota: 'BAIXA',
    icone: 'pi pi-trash',
    badgeTone: 'danger',
    tagIcone: 'pi-minus'
  },
  {
    tipo: 'DEVOLUCAO_COMERCIAL',
    titulo: 'Devolução comercial',
    subtitulo: 'Processo comercial',
    tag: '222 — Comercial',
    descricao: 'Devolução do estoque de campo de uma equipe comercial para o almoxarifado físico (novo ou sucata).',
    rota: 'DEVOLUCAO_COMERCIAL',
    icone: 'pi pi-undo',
    badgeTone: 'brand',
    tagIcone: 'pi-briefcase'
  },
  {
    tipo: 'DEVOLUCAO_TECNICA',
    titulo: 'Devolução técnica',
    subtitulo: 'Processo de obras',
    tag: '222 / 922',
    descricao: 'Devolução de material da obra para o almoxarifado físico (novo ou sucata), mesmo que não esteja no saldo da obra.',
    rota: '/almoxarifado/solicitacoes-tecnicas/devolucao',
    icone: 'pi pi-undo',
    badgeTone: 'brand',
    tagIcone: 'pi-cog'
  },
  {
    tipo: 'IMPORTACAO',
    titulo: 'Importação em lote (planilha)',
    subtitulo: 'Entrada / saída / transferência',
    tag: 'CSV',
    descricao: 'Movimentações em lote por planilha CSV, com vários números de série na mesma linha e conferência prévia.',
    rota: 'IMPORT_MODAL',
    icone: 'pi pi-file-import',
    badgeTone: 'info',
    tagIcone: 'pi-table'
  }
];

@Component({
  selector: 'app-movimentacoes-estoque',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DevolucaoComercialDrawerComponent,
    DatePipe,
    DecimalPipe,
    FormsModule,
    GeoAutocompleteComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoRowDetailDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoDialogShellComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    CopilotoAreaComponent,
    CopilotoGatilhoComponent,
    AuditDialogComponent,
    SaldoEstoqueDialogComponent,
    SeriesGradeComponent,
    AjudaListagemComponent,
    MovimentacoesImportacaoComponent,
    OperacaoEstoqueDrawerComponent
  ],
  template: `
    <app-copiloto-area [contexto]="contextoCopiloto()">
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novaOperacaoAberta.set(true)">
      <geo-page-header
        title="Movimentações de estoque"
        icon="pi pi-arrows-h"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Movimentações de estoque' }]"
        description="Entradas, baixas, transferências, entregas e devoluções, agrupadas por operação. Clique na linha para ver os itens."
        helpLabel="Ajuda sobre movimentações de estoque"
        (help)="ajuda.show()"
      >
        <app-copiloto-gatilho actions></app-copiloto-gatilho>
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacaoAberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Nova movimentação" [keyShortcut]="atalhos.newShortcut()" (pressed)="novaOperacaoAberta.set(true)"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="almox-movimentacoes" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Estoque" [options]="estoqueOptions()" [(value)]="lista.filters.idEstoque" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-autocomplete label="Material" placeholder="Digite para buscar" [options]="materiaisFiltro.items()" [ngModel]="lista.filters.idMaterial()"
            (ngModelChange)="lista.filters.idMaterial.set($event)" [loading]="materiaisFiltro.loading()" [status]="materiaisFiltro.status()" [minLength]="2" [clearable]="true"
            (search)="materiaisFiltro.search($event)" (loadMore)="materiaisFiltro.loadNext()" (retry)="materiaisFiltro.retry()"></geo-autocomplete>
          <geo-select label="Base de origem" [options]="baseOptions()" [(value)]="lista.filters.idBaseOrigem" [clearable]="true" [filter]="true" placeholder="Todas"
            [loading]="bases.loading()" (opened)="bases.open()" (search)="bases.search($event)"></geo-select>
          <geo-select label="Base de destino" [options]="baseOptions()" [(value)]="lista.filters.idBaseDestino" [clearable]="true" [filter]="true" placeholder="Todas"
            [loading]="bases.loading()" (opened)="bases.open()" (search)="bases.search($event)"></geo-select>
          <geo-select label="Tipo" [options]="tipos" [(value)]="lista.filters.tipo"></geo-select>
          <geo-select label="Motivo" [options]="motivos" [(value)]="lista.filters.motivo" [clearable]="true" placeholder="Todos"></geo-select>
          <geo-select label="Referência" [options]="referencias" [(value)]="lista.filters.referencia" [clearable]="true" [filter]="true" placeholder="Mês/ano"></geo-select>
          <geo-text-input label="Número de série" [(value)]="lista.filters.numSerie" hint="Não fica salvo no endereço da página."></geo-text-input>
          <geo-datepicker label="A partir de" [value]="dataLocal(lista.filters.periodo().from)" [clearable]="true" (valueChange)="periodo('from', $event)"></geo-datepicker>
          <geo-datepicker label="Até" [value]="dataLocal(lista.filters.periodo().to)" [clearable]="true" (valueChange)="periodo('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <div class="mov-toolbar">
        <div class="geo-quick-filters mov-atalhos" role="group" aria-label="Mostrar só o tipo escolhido">
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="!lista.applied().tipo" (click)="definirTipo(null)">
            Todas <span class="mov-contagem">{{ contagens()?.total ?? '–' }}</span>
          </button>
          <span class="mov-divisor" aria-hidden="true"></span>
          @for (t of atalhosTipo; track t.value) {
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="lista.applied().tipo === t.value" [attr.data-tone]="tipoTone(t.value)" (click)="definirTipo(t.value)"
              [attr.aria-label]="t.label + ': ' + contagemTipo(t.value)">
              <i [class]="tipoIcone(t.value)" aria-hidden="true"></i> {{ t.label }} <span class="mov-contagem">{{ contagemTipo(t.value) }}</span>
            </button>
          }
        </div>
        <div class="mov-processos" role="group" aria-label="Mostrar só o processo escolhido">
          @for (p of processos; track p.value) {
            <button type="button" [attr.aria-pressed]="lista.applied().processo === p.value" (click)="lista.set('processo', p.value)">{{ p.label }}</button>
          }
        </div>
      </div>

      <geo-data-table
        title="Operações"
        mode="server"
        storageKey="almox-movimentacoes"
        searchPlaceholder="Operação, material ou número de série"
        rowActionLabel="Ver itens"
        rowActionIcon="pi pi-eye"
        emptyActionLabel="Nova movimentação"
        noResultsTitle="Nenhuma movimentação encontrada com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as movimentações' : 'Nenhuma movimentação registrada'"
        [stateDescription]="resultado.error() ?? 'Entradas, baixas e transferências aparecem aqui.'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novaOperacaoAberta.set(true)"
        (rowActivate)="verDetalhes($event)"
      >
        <ng-template geoCell="operacao" let-mov><span class="geo-cell-strong">#{{ mov.idReferenciaOperacao?.substring(0, 8) }}</span></ng-template>
        <ng-template geoCell="tipo" let-mov><geo-status [tone]="tipoTone(mov.tipo)" [icon]="tipoIcone(mov.tipo)">{{ tipoLabel(mov.tipo) }}</geo-status></ng-template>
        <ng-template geoRowActions let-mov>
          <span class="geo-table-actions">
            <geo-icon-button icon="pi pi-print" [label]="'Imprimir relatório da operação #' + $safeNavigationMigration(mov.idReferenciaOperacao?.substring(0, 8))" size="icon-sm" (pressed)="imprimir(mov)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações da operação #' + $safeNavigationMigration(mov.idReferenciaOperacao?.substring(0, 8))" size="icon-sm" (pressed)="showLogs(mov)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>
    </app-copiloto-area>

    <geo-dialog-shell title="Nova operação de estoque" size="lg" [visible]="novaOperacaoAberta()" (visibleChange)="novaOperacaoAberta.set($event)">
      <div class="geo-card-grid">
        @for (op of operacoes; track op.tipo) {
          <button type="button" class="geo-choice-card" (click)="navigateToOperation(op.rota)">
            <span class="geo-choice-card__head">
              <i [class]="op.icone" aria-hidden="true"></i>
              <geo-status [tone]="op.badgeTone" [icon]="op.tagIcone">{{ op.tag }}</geo-status>
            </span>
            <span class="geo-cell-muted">{{ op.subtitulo }}</span>
            <strong>{{ op.titulo }}</strong>
            <span class="geo-cell-muted">{{ op.descricao }}</span>
          </button>
        }
      </div>
      <div dialog-footer>
        <geo-button label="Fechar" variant="secondary" size="sm" (pressed)="novaOperacaoAberta.set(false)"></geo-button>
      </div>
    </geo-dialog-shell>

    <geo-dialog-shell title="Prévia da movimentação" size="lg" [visible]="detalheVisible()" (visibleChange)="detalheVisible.set($event)"
      [loading]="loadingDetalhe()" loadingLabel="Buscando os itens da operação…">
      @if (operacaoSelecionada(); as op) {
        <dl class="geo-details-grid">
          <div><dt>Operação</dt><dd class="geo-cell-strong">#{{ op.idReferenciaOperacao.slice(0, 8) }}</dd></div>
          <div><dt>Data</dt><dd>{{ op.dataHora | date: 'dd/MM/yyyy HH:mm:ss' }}</dd></div>
          <div><dt>Tipo</dt><dd><geo-status [tone]="tipoTone(op.tipo)" [icon]="tipoIcone(op.tipo)">{{ tipoLabel(op.tipo) }}</geo-status></dd></div>
          @if (op.numeroNota) {
            <div><dt>Nota</dt><dd class="geo-cell-strong">{{ op.numeroNota }}</dd></div>
          }
          @if (op.motivo) {
            <div><dt>Motivo</dt><dd>{{ rotuloMotivo(op.motivo) }}</dd></div>
          }
          <div><dt>Operador</dt><dd>{{ op.operadorNome || 'Não identificado' }}</dd></div>
          <div>
            <dt>Origem</dt>
            <dd>
              {{ op.estoqueOrigem?.nomeIdentificador || '—' }}
              @if (op.estoqueOrigem; as origem) {
                <geo-icon-button icon="pi pi-search" [label]="'Ver saldo de ' + origem.nomeIdentificador" size="icon-sm" (pressed)="abrirSaldoEstoque(origem.id, origem.nomeIdentificador)"></geo-icon-button>
              }
            </dd>
          </div>
          <div>
            <dt>Destino</dt>
            <dd>
              {{ op.estoqueDestino?.nomeIdentificador || '—' }}
              @if (op.estoqueDestino; as destino) {
                <geo-icon-button icon="pi pi-search" [label]="'Ver saldo de ' + destino.nomeIdentificador" size="icon-sm" (pressed)="abrirSaldoEstoque(destino.id, destino.nomeIdentificador)"></geo-icon-button>
              }
            </dd>
          </div>
        </dl>
        @if (op.observacao) {
          <p class="geo-detalhe-observacao"><strong>Observação:</strong> {{ op.observacao }}</p>
        }
        <geo-data-table [caption]="itensAgrupados().length + (itensAgrupados().length === 1 ? ' material' : ' materiais') + ' · total ' + (totalSelecionado() | number: '1.0-3')"
          searchPlaceholder="Buscar por código, material ou série" [searchable]="itensAgrupados().length > 8"
          [columns]="colunasItens" [rows]="itensAgrupados()" [rowKey]="chaveItem" [rowExpandable]="temSeries" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="descricao" let-g>
            <span class="geo-cell-strong">{{ g.material?.descricao }}</span>
            @if (g.series.length) {
              <geo-status tone="brand" icon="pi pi-barcode">{{ g.series.length }} {{ g.series.length === 1 ? 'série' : 'séries' }}</geo-status>
            }
          </ng-template>
          <ng-template geoCell="condicao" let-g><geo-status [tone]="tomCondicao(g.condicao)" [icon]="iconeCondicao(g.condicao)">{{ rotuloCondicao(g.condicao) }}</geo-status></ng-template>
          <ng-template geoRowDetail let-g>
            <app-series-grade [series]="g.grade" [rotulo]="'Números de série de ' + $safeNavigationMigration(g.material?.descricao)" />
          </ng-template>
        </geo-data-table>
      }
      <div dialog-footer class="geo-actions-row">
        @if (operacaoSelecionada(); as op) {
          <geo-button variant="link" icon="pi pi-external-link" label="Abrir relatório completo" (pressed)="abrirRelatorio(op.idReferenciaOperacao)"></geo-button>
        }
        <geo-button label="Fechar" variant="secondary" size="sm" (pressed)="detalheVisible.set(false)"></geo-button>
      </div>
    </geo-dialog-shell>

    <app-operacao-estoque-drawer [(visible)]="operacaoAberta" [tipo]="tipoOperacao()" [estoques]="estoques()" (registrada)="atualizar()" (importar)="abrirImportacao()" />
    <app-devolucao-comercial-drawer [(visible)]="devolucaoComercialAberta" [estoques]="estoques()" (registrada)="atualizar()" />
    <app-movimentacoes-importacao [(visible)]="importacaoAberta" [estoques]="estoques()" [materiais]="materiais()" (processado)="atualizar()"></app-movimentacoes-importacao>
    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-saldo-estoque-dialog #saldo></app-saldo-estoque-dialog>
    <app-ajuda-listagem #ajuda titulo="Movimentações de estoque" artigoPlural="as" entidadePlural="movimentações" busca="operação, material ou número de série"
      rotuloNovo="Nova movimentação" [importacao]="true">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-bolt"></i> Operações</h4>
        <p class="help-text-desc">"Nova movimentação" leva à transferência entre estoques, entrada avulsa, baixa avulsa, devolução comercial ou à importação em lote.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-filter"></i> Atalhos de tipo e processo</h4>
        <p class="help-text-desc">Abaixo dos filtros, escolha um tipo à esquerda e um processo à direita; os dois se combinam. O comercial reúne também as aplicações, retiradas e devoluções, que não têm solicitação. Ajustes avulsos e transferências aparecem só em "Todos".</p>
      </div>
    </app-ajuda-listagem>
  `,
  styles: `
    .mov-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .mov-atalhos { flex: 1 1 auto; min-width: 0; }
    .mov-atalhos .pi { font-size: 0.75rem; color: var(--mov-tom, currentColor); }
    .geo-quick-filter[aria-pressed='true'] .pi { color: inherit; }
    .mov-contagem {
      display: inline-flex; align-items: center; justify-content: center; min-width: 1.375rem; height: 1.25rem; padding: 0 0.375rem;
      border-radius: 999px; background: var(--geo-surface-muted); color: var(--geo-foreground-muted);
      font-size: 0.7rem; font-weight: 700; font-variant-numeric: tabular-nums;
    }
    .geo-quick-filter[aria-pressed='true'] .mov-contagem { background: var(--geo-surface); color: var(--geo-foreground); }
    .mov-divisor { width: 1px; align-self: stretch; margin: 0.25rem 0.125rem; background: var(--geo-border); }
    [data-tone='warning'] { --mov-tom: var(--geo-warning); }
    [data-tone='info'] { --mov-tom: var(--geo-info); }
    [data-tone='success'] { --mov-tom: var(--geo-success); }
    [data-tone='danger'] { --mov-tom: var(--geo-danger); }
    [data-tone='brand'] { --mov-tom: var(--geo-primary); }
    [data-tone='neutral'] { --mov-tom: var(--geo-foreground-subtle); }
    .mov-processos { display: inline-flex; flex: none; padding: 2px; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .mov-processos button {
      display: inline-flex; align-items: center; min-height: calc(var(--geo-control-height-sm) - 2px); padding: 0 0.75rem;
      border: 0; border-radius: calc(var(--geo-radius-md) - 2px); background: transparent; color: var(--geo-foreground-muted);
      font: inherit; font-size: var(--geo-font-control); font-weight: 600; cursor: pointer;
    }
    .mov-processos button:hover { color: var(--geo-foreground); }
    .mov-processos button[aria-pressed='true'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-shadow-sm); }
    .mov-processos button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    @media (max-width: 40rem) {
      .mov-toolbar { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.625rem; }
      .mov-atalhos { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; scroll-snap-type: x proximity; }
      .mov-atalhos::-webkit-scrollbar { display: none; }
      .mov-atalhos .geo-quick-filter { flex: none; scroll-snap-align: start; }
      .mov-processos { width: 100%; }
      .mov-processos button { flex: 1; justify-content: center; }
    }
    .geo-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
      gap: var(--geo-space-3, 0.75rem);
    }
    .geo-choice-card {
      display: flex;
      flex-direction: column;
      gap: var(--geo-space-1, 0.25rem);
      padding: var(--geo-space-4, 1rem);
      border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-lg, 0.75rem);
      background: var(--geo-surface);
      color: var(--geo-foreground);
      text-align: left;
      cursor: pointer;
    }
    .geo-choice-card:hover,
    .geo-choice-card:focus-visible {
      border-color: var(--geo-primary, currentColor);
    }
    .geo-choice-card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--geo-space-2, 0.5rem);
      font-size: 1.25rem;
    }
    .geo-detalhe-observacao { margin: 0 0 var(--geo-space-4, 1rem); white-space: pre-line; }
    .geo-details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
      gap: var(--geo-space-3, 0.75rem);
      margin: 0 0 var(--geo-space-4, 1rem);
    }
    .geo-details-grid dt {
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption, 0.75rem);
    }
    .geo-details-grid dd {
      display: flex;
      align-items: center;
      gap: var(--geo-space-1, 0.25rem);
      margin: 0;
    }
  `
})
export class MovimentacoesEstoqueComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly rh = inject(RhService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly lookupStore = inject(LookupStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly copiloto = inject(CopilotoPainelService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  private readonly saldo = viewChild.required<SaldoEstoqueDialogComponent>('saldo');

  protected readonly operacoes = OPERACOES;
  protected readonly tipos = TIPOS;
  protected readonly atalhosTipo = TIPOS.filter((t) => t.value);
  protected readonly processos = PROCESSOS;
  protected readonly motivos = MOTIVOS_MOVIMENTACAO;
  protected readonly rotuloMotivo = rotuloMotivo;
  protected readonly referencias: GeoSelectOption<string>[] = generateReferenceOptions(24);
  protected readonly dataLocal = dataLocal;
  protected readonly novaOperacaoAberta = signal(false);
  protected readonly importacaoAberta = signal(false);
  protected readonly devolucaoComercialAberta = signal(false);
  protected readonly operacaoAberta = signal(false);
  protected readonly tipoOperacao = signal<TipoOperacaoEstoque>('ENTRADA');

  protected readonly estoques = signal<EstoqueResponse[]>([]);
  protected readonly materiais = signal<MaterialResponse[]>([]);
  protected readonly estoqueOptions = computed<GeoSelectOption<string>[]>(() => this.estoques().map((e) => ({ label: e.nomeIdentificador, value: e.id })));
  protected readonly bases = new RemoteLookup<BaseOperacionalResponse>(
    {
      identify: (b) => b.id,
      selectedKeys: () => [this.lista.filters.idBaseOrigem(), this.lista.filters.idBaseDestino()].filter((id): id is string => !!id),
      load: ({ query, page, size }) => this.rh.listarBasesOperacionais({ ativo: true, buscaGlobal: query, page, size, sort: 'nome,asc' })
    },
    this.destroyRef
  );
  protected readonly baseOptions = computed<GeoSelectOption<string>[]>(() => this.bases.items().map((b) => ({ label: b.nome, value: b.id })));
  protected readonly materiaisFiltro: BuscaMateriais<string> = new BuscaMateriais<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchMaterials({ query, cursor }),
    selectedValues: () => [this.lista.filters.idMaterial()].filter((id): id is string => !!id),
    destroyRef: this.destroyRef
  });

  protected readonly lista = geoListState({
    storageKey: 'almox-movimentacoes',
    filters: {
      idEstoque: geoFilter.value<string | null>(null, {
        label: 'Estoque',
        param: 'estoque',
        format: (id): string | null => (id ? (this.estoques().find((e) => e.id === id)?.nomeIdentificador ?? 'selecionado') : null)
      }),
      idMaterial: geoFilter.value<string | null>(null, {
        label: 'Material',
        param: 'material',
        format: (id): string | null => (id ? (this.materiaisFiltro.items().find((m) => m.value === id)?.label ?? 'material selecionado') : null)
      }),
      idBaseOrigem: geoFilter.value<string | null>(null, { label: 'Base de origem', param: 'baseOrigem', format: (id): string | null => (id ? this.nomeBase(id) : null) }),
      idBaseDestino: geoFilter.value<string | null>(null, { label: 'Base de destino', param: 'baseDestino', format: (id): string | null => (id ? this.nomeBase(id) : null) }),
      tipo: geoFilter.value<TipoMovimentacao | null>(null, { label: 'Tipo', options: () => TIPOS }),
      processo: geoFilter.value<ProcessoMovimentacao | null>(null, { label: 'Processo', options: () => PROCESSOS }),
      motivo: geoFilter.value<MotivoMovimentacao | null>(null, { label: 'Motivo', options: () => MOTIVOS_MOVIMENTACAO }),
      referencia: geoFilter.value<string | null>(null, { label: 'Referência', param: 'ref', type: 'string' }),
      // Nº de série é dado sensível: fica fora da URL.
      numSerie: geoFilter.value<string>('', { label: 'Nº de série', url: false }),
      periodo: geoFilter.range({ from: null, to: null }, { label: 'Período' })
    },
    sort: [{ key: 'data', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<MovimentacaoOperacaoSummaryResponse>(
    (pedido) =>
      this.almoxarifado.listarMovimentacoes({
        ...this.filtro(),
        page: pedido.page,
        size: pedido.size,
        sort: pedido.sort.map((r) => `${r.key},${r.direction}`)[0] ?? 'dataHora,desc'
      } as never),
    { errorMessage: getErrorMessage }
  );
  /** Quantas operações há de cada tipo no recorte, ignorando o tipo escolhido (para o número não sumir ao filtrar). */
  protected readonly contagens = signal<MovimentacaoContagensResponse | null>(null);
  private readonly versaoContagens = signal(0);

  /** O que a Bússola recebe: o recorte em tela e a contagem de cada tipo. */
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const f = this.lista.applied();
    const c = this.contagens();
    const tipos = this.atalhosTipo.filter((t) => c?.porTipo?.[t.value!] !== undefined);
    return {
      id: 'almoxarifado.movimentacoes',
      nome: 'Movimentações de estoque',
      modulo: 'Almoxarifado',
      descricao: 'Operações de estoque: entradas e baixas avulsas, transferências, entregas, devoluções, estornos e o que as equipes aplicam e retiram nas notas.',
      rota: '/almoxarifado/movimentacoes',
      periodo: periodoPainel(f.periodo.from ? dataLocal(f.periodo.from) : null, f.periodo.to ? dataLocal(f.periodo.to) : null),
      filtros: [
        filtroPainel('tipo', 'Tipo', f.tipo ? this.tipoLabel(f.tipo) : null, f.tipo),
        filtroPainel('processo', 'Processo', f.processo ? PROCESSOS.find((p) => p.value === f.processo)?.label : null, f.processo),
        filtroPainel('motivo', 'Motivo', f.motivo ? rotuloMotivo(f.motivo) : null, f.motivo),
        filtroPainel('estoque', 'Estoque', f.idEstoque ? this.estoques().find((e) => e.id === f.idEstoque)?.nomeIdentificador : null, f.idEstoque),
        filtroPainel('baseOrigem', 'Base de origem', f.idBaseOrigem ? this.nomeBase(f.idBaseOrigem) : null, f.idBaseOrigem),
        filtroPainel('baseDestino', 'Base de destino', f.idBaseDestino ? this.nomeBase(f.idBaseDestino) : null, f.idBaseDestino),
        filtroPainel('referencia', 'Referência', f.referencia, f.referencia)
      ],
      metricas: [
        metricaPainel('total', 'Operações no recorte', c?.total, 'inteiro'),
        ...tipos.map((t) => metricaPainel(`tipo.${t.value}`, t.label, c?.porTipo?.[t.value!], 'inteiro'))
      ],
      graficos: tipos.length
        ? [graficoPainel('porTipo', 'rosca', 'Operações por tipo', tipos.map((t) => t.label), tipos.map((t) => c?.porTipo?.[t.value!] ?? 0), { metrica: 'operações', dimensao: 'tipo', formato: 'inteiro' })]
        : [],
      datasets: ['movimentacoes', 'materiais', 'estoques'],
      sugestoes: [
        { rotulo: 'Maiores saídas', icone: 'pi pi-sort-amount-down', requer: ['dados'], pergunta: 'Quais materiais tiveram mais saídas neste mês? Compare com o mês anterior.' },
        { rotulo: 'Resumo do recorte', icone: 'pi pi-list', requer: ['dados'], pergunta: 'Resuma as movimentações deste recorte por tipo e aponte o que foge do normal.' }
      ]
    };
  });

  protected readonly colunas: GeoDataTableColumn<MovimentacaoOperacaoSummaryResponse>[] = [
    { key: 'operacao', header: 'Operação', type: 'custom', priority: 1, sortField: 'idReferenciaOperacao', value: (m) => m.idReferenciaOperacao },
    {
      key: 'data',
      header: 'Data',
      type: 'date',
      priority: 1,
      sortField: 'dataHora',
      value: (m) => m.dataHora,
      display: (m) => new Date(m.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    },
    { key: 'tipo', header: 'Tipo', type: 'custom', priority: 1, sortField: 'tipo', value: (m) => this.tipoLabel(m.tipo) },
    { key: 'nota', header: 'Nota', value: (m) => m.numeroNota, display: (m) => m.numeroNota ?? '—' },
    { key: 'origem', header: 'Origem', value: (m) => m.estoqueOrigem?.nomeIdentificador, display: (m) => m.estoqueOrigem?.nomeIdentificador ?? '—' },
    { key: 'destino', header: 'Destino', value: (m) => m.estoqueDestino?.nomeIdentificador, display: (m) => m.estoqueDestino?.nomeIdentificador ?? '—' },
    { key: 'operador', header: 'Operador', sortField: 'operadorNome', value: (m) => m.operadorNome, display: (m) => m.operadorNome || '—' }
  ];
  protected readonly rotulo = (m: MovimentacaoOperacaoSummaryResponse) => `Operação #${m.idReferenciaOperacao?.substring(0, 8)}`;

  // Prévia da operação
  protected readonly detalheVisible = signal(false);
  protected readonly loadingDetalhe = signal(false);
  protected readonly operacaoSelecionada = signal<MovimentacaoOperacaoResponse | null>(null);
  protected readonly totalSelecionado = computed(() => (this.operacaoSelecionada()?.itens ?? []).reduce((total, item) => total + (item.quantidade || 0), 0));
  protected readonly rotuloCondicao = rotuloCondicao;
  protected readonly tomCondicao = tomCondicao;
  protected readonly iconeCondicao = iconeCondicao;
  /** Um material por linha; os seriados expandem com as séries (o backend manda uma linha por série). */
  protected readonly itensAgrupados = computed<(ItemMovimentacaoAgrupado & { grade: SerieGradeItem[] })[]>(() =>
    agruparItensPorMaterial(this.operacaoSelecionada()?.itens).map((g) => ({ ...g, grade: g.series.map((numSerie) => ({ numSerie })) }))
  );
  protected readonly chaveItem = (g: ItemMovimentacaoAgrupado) => g.chave;
  protected readonly temSeries = (g: ItemMovimentacaoAgrupado) => g.series.length > 0;
  protected readonly colunasItens: GeoDataTableColumn<ItemMovimentacaoAgrupado>[] = [
    { key: 'codigo', header: 'Código', priority: 1, value: (g) => g.material?.codigo },
    {
      key: 'descricao',
      header: 'Material',
      type: 'custom',
      priority: 1,
      searchable: true,
      value: (g) => g.material?.descricao,
      display: (g) => [g.material?.descricao, ...g.series].join(' ')
    },
    { key: 'condicao', header: 'Condição', type: 'custom', value: (g) => rotuloCondicao(g.condicao) },
    { key: 'quantidade', header: 'Quantidade', type: 'number', value: (g) => g.quantidade }
  ];

  constructor() {
    this.almoxarifado.listarEstoquesAtivos().subscribe({ next: (r) => this.estoques.set(r?.content ?? []), error: () => undefined });
    this.almoxarifado.listarMateriais({ page: 0, size: 1000, ativo: true }).subscribe({ next: (r) => this.materiais.set(r?.content ?? []), error: () => undefined });

    const consultaContagens = computed(
      () => {
        const { tipo: _tipo, ...recorte } = this.filtro();
        return { recorte, versao: this.versaoContagens() };
      },
      { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );
    toObservable(consultaContagens)
      .pipe(
        switchMap(({ recorte }) => this.almoxarifado.contarMovimentacoes(recorte).pipe(catchError(() => of(null)))),
        takeUntilDestroyed()
      )
      .subscribe((contagens) => this.contagens.set(contagens));

    // Menu, favoritos e notificações chegam aqui pelas rotas antigas de cada operação.
    this.rota.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const operacao = params.get('operacao');
      const tipo = OPERACAO_DA_URL[operacao ?? ''];
      if (!tipo && operacao !== 'devolucao-comercial') return;
      if (tipo) this.abrirOperacao(tipo);
      else this.devolucaoComercialAberta.set(true);
      void this.router.navigate([], { relativeTo: this.rota, queryParams: { operacao: null }, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  private abrirOperacao(tipo: TipoOperacaoEstoque): void {
    this.tipoOperacao.set(tipo);
    this.operacaoAberta.set(true);
  }

  protected abrirImportacao(): void {
    this.operacaoAberta.set(false);
    this.importacaoAberta.set(true);
  }

  /** Atalho de tipo: um por vez; clicar no escolhido volta para todas. */
  protected definirTipo(tipo: TipoMovimentacao | null | undefined): void {
    this.lista.set('tipo', this.lista.applied().tipo === tipo ? null : (tipo ?? null));
  }

  protected contagemTipo(tipo: TipoMovimentacao | null | undefined): number | string {
    const c = this.contagens();
    return c ? (c.porTipo?.[tipo!] ?? 0) : '–';
  }

  protected tipoIcone(tipo?: string | null): string {
    return iconeTipoMovimentacao(tipo);
  }

  /** Algo foi lançado (importação, devolução): atualiza a lista e as contagens. */
  protected atualizar(): void {
    this.lista.reload();
    this.versaoContagens.update((v) => v + 1);
  }

  private filtro(): Record<string, unknown> {
    const { filters: f, query } = this.lista.request();
    const params: Record<string, unknown> = {};
    if (f.idEstoque) params['idEstoque'] = f.idEstoque;
    if (f.idMaterial) params['idMaterial'] = f.idMaterial;
    if (f.idBaseOrigem) params['idBaseOrigem'] = f.idBaseOrigem;
    if (f.idBaseDestino) params['idBaseDestino'] = f.idBaseDestino;
    if (f.tipo) params['tipo'] = f.tipo;
    if (f.processo) params['processo'] = f.processo;
    if (f.motivo) params['motivo'] = f.motivo;
    if (f.numSerie.trim()) params['numSerie'] = f.numSerie.trim();
    if (f.referencia) params['referencia'] = f.referencia;
    if (f.periodo.from) params['dataInicio'] = dataLocal(f.periodo.from)!.toISOString();
    if (f.periodo.to) params['dataFim'] = dataLocal(f.periodo.to)!.toISOString();
    if (query) params['buscaGlobal'] = query;
    return params;
  }

  private nomeBase(id: string): string {
    return this.baseOptions().find((o) => o.value === id)?.label ?? 'selecionada';
  }

  protected periodo(ponta: 'from' | 'to', data: Date | null): void {
    this.lista.filters.periodo.update((atual) => ({ ...atual, [ponta]: dataIso(data) }));
  }

  protected tipoTone(tipo?: string | null): GeoTone {
    return tomTipoMovimentacao(tipo);
  }

  protected tipoLabel(tipo?: string | null): string {
    return TIPOS.find((t) => t.value === tipo)?.label ?? (tipo ? String(tipo).replace('_', ' ') : '—');
  }

  protected verDetalhes(mov: MovimentacaoOperacaoSummaryResponse): void {
    // Abaixo de 1280px a Bússola sobrepõe a tela: não deixa os dois painéis empilhados.
    if (typeof matchMedia === 'function' && !matchMedia('(min-width: 1280px)').matches) this.copiloto.fechar();
    this.operacaoSelecionada.set(null);
    this.loadingDetalhe.set(true);
    this.detalheVisible.set(true);
    this.almoxarifado.buscarOperacaoPorIdReferencia(mov.idReferenciaOperacao).subscribe({
      next: (res) => {
        this.operacaoSelecionada.set(res);
        this.loadingDetalhe.set(false);
      },
      error: () => {
        this.loadingDetalhe.set(false);
        this.detalheVisible.set(false);
      }
    });
  }

  protected navigateToOperation(rota: string): void {
    this.novaOperacaoAberta.set(false);
    if (rota === 'IMPORT_MODAL') {
      this.importacaoAberta.set(true);
      return;
    }
    if (rota === 'ENTRADA' || rota === 'BAIXA' || rota === 'TRANSFERENCIA') {
      this.abrirOperacao(rota);
      return;
    }
    if (rota === 'DEVOLUCAO_COMERCIAL') {
      this.devolucaoComercialAberta.set(true);
      return;
    }
    void this.router.navigate([rota]);
  }

  protected imprimir(mov: MovimentacaoOperacaoSummaryResponse): void {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/almoxarifado/movimentacoes', mov.idReferenciaOperacao], { queryParams: { mode: 'print' } }));
    window.open(url, '_blank', 'noopener');
  }

  protected abrirRelatorio(idReferencia: string): void {
    window.open(this.router.serializeUrl(this.router.createUrlTree(['/almoxarifado/movimentacoes', idReferencia])), '_blank', 'noopener');
  }

  protected abrirSaldoEstoque(estoqueId: string, estoqueNome: string): void {
    this.saldo().show(estoqueId, estoqueNome);
  }

  protected showLogs(mov: MovimentacaoOperacaoSummaryResponse): void {
    this.auditoria().show(mov.idReferenciaOperacao, 'movimentacoes_estoque');
  }
}
