import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';

import { EstoqueResponse, MaterialResponse, SolicitacaoSummaryResponse } from '../../../core/models/almoxarifado.models';
import { AgenteResponsavelResponse, ObraResumoResponse } from '../../../core/models/obras.models';
import { EquipeResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import {
  OrigemSolicitacaoTecnica,
  SolicitacaoMaterialFilter,
  SolicitacaoMaterialSummaryResponse,
  StatusSeparacao,
  StatusSolicitacaoMaterial,
  TipoSolicitacaoTecnica
} from '../../../core/models/solicitacao-material-tecnica.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { ObrasService } from '../../../core/services/obras.service';
import { RhService } from '../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
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
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { ExportarSolicitacoesDialogComponent } from './exportar-solicitacoes-dialog.component';
import { NovaSolicitacaoTecnicaDrawerComponent } from './nova-solicitacao/nova-solicitacao-tecnica-drawer.component';
import { SolicitacaoTecnicaPainelComponent } from './solicitacao-tecnica-painel.component';
import { formatarAlmoxarifado, separacaoLabel, separacaoTone, statusLabel, statusTone, tipoTecnicoEhAdicao, tipoTecnicoIcon, tipoTecnicoLabel, tipoTecnicoNome } from './solicitacao-tecnica-presentation';
import { LEGENDA_TECNICA, SITUACAO_EM_ABERTO, SITUACOES_TECNICAS, SituacaoTecnicaDef, situacaoCalendarioTecnico, situacaoTecnica, statusTecnicoDef, situacaoAtual } from './solicitacao-tecnica-situacao';
import { DetalheCalendario, SolicitacoesComerciaisCalendarioComponent } from './solicitacoes-comerciais-calendario/solicitacoes-comerciais-calendario.component';
import { SolicitacaoMaterialListaTecnicaResponse } from '../../../core/models/solicitacao-material-tecnica.models';

/** A lista geral traz os campos técnicos aninhados em `tecnico`. */
function tecnicoDe(s: SolicitacaoSummaryResponse): Partial<SolicitacaoMaterialListaTecnicaResponse> | null {
  return (s as unknown as { tecnico?: Partial<SolicitacaoMaterialListaTecnicaResponse> | null }).tecnico ?? null;
}
import { SolicitacoesTecnicasImportacaoComponent } from './solicitacoes-tecnicas-importacao/solicitacoes-tecnicas-importacao.component';
import { DevolucaoTecnicaFormComponent } from './devolucao-tecnica-form/devolucao-tecnica-form.component';
import { SolicitacoesTecnicasQuadroComponent } from './solicitacoes-tecnicas-quadro/solicitacoes-tecnicas-quadro.component';

type VisaoTecnica = 'tabela' | 'kanban' | 'calendario';
const VISOES: { value: VisaoTecnica; label: string; icon: string; rota: string }[] = [
  { value: 'tabela', label: 'Tabela', icon: 'pi pi-table', rota: '/almoxarifado/solicitacoes-tecnicas' },
  { value: 'kanban', label: 'Quadro', icon: 'pi pi-objects-column', rota: '/almoxarifado/solicitacoes-tecnicas/kanban' },
  { value: 'calendario', label: 'Calendário', icon: 'pi pi-calendar', rota: '/almoxarifado/solicitacoes-tecnicas/calendario' }
];

const comTodos = <T,>(opcoes: GeoSelectOption<T>[], todos = 'Todos'): GeoSelectOption<T | null>[] => [{ label: todos, value: null }, ...opcoes];
/** No GEO a devolução (222/922) é uma solicitação: entra na lista junto com as adições. */
const TIPOS_TECNICOS = comTodos<TipoSolicitacaoTecnica>(
  (['ADICAO_COMUM', 'ADICAO_CONCRETO', 'DEVOLUCAO_COMUM', 'DEVOLUCAO_CONCRETO'] as const).map((value) => ({ label: tipoTecnicoLabel(value), value }))
);
const STATUS: GeoSelectOption<StatusSolicitacaoMaterial>[] = (
  ['PENDENTE', 'APROVADO', 'REJEITADO', 'ENTREGUE_PARCIAL', 'ENTREGUE', 'DEVOLVIDO_PARCIAL', 'DEVOLVIDO', 'ESTORNADO', 'CANCELADO'] as const
).map((value) => ({ label: statusLabel(value), value }));
const ORIGENS = comTodos<OrigemSolicitacaoTecnica>([
  { label: 'Programação da obra', value: 'PROGRAMACAO' },
  { label: 'Manual', value: 'MANUAL' }
]);
const SEPARACAO = comTodos<StatusSeparacao>(
  (['AGUARDANDO_AGENDAMENTO', 'PRONTO_PARA_SEPARACAO', 'EM_SEPARACAO', 'SEPARADO'] as const).map((value) => ({ label: separacaoLabel(value), value })),
  'Todas'
);
const TIPOS_OBRA: GeoSelectOption<string>[] = [
  { label: 'Comum', value: 'OBRA' },
  { label: 'LPT', value: 'LPT' },
  { label: 'Corretiva', value: 'CORRETIVA' },
  { label: 'Preventiva', value: 'PREVENTIVA' }
];
const CONTADAS: readonly SituacaoTecnicaDef[] = [SITUACAO_EM_ABERTO, ...SITUACOES_TECNICAS];

@Component({
  selector: 'app-solicitacoes-material-tecnicas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DevolucaoTecnicaFormComponent,
    DatePipe,
    NgTemplateOutlet,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AjudaListagemComponent,
    ExportarSolicitacoesDialogComponent,
    NovaSolicitacaoTecnicaDrawerComponent,
    SolicitacaoTecnicaPainelComponent,
    SolicitacoesComerciaisCalendarioComponent,
    SolicitacoesTecnicasImportacaoComponent,
    SolicitacoesTecnicasQuadroComponent,
    CopilotoAreaComponent,
    CopilotoGatilhoComponent
  ],
  styles: `
    .sol-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .sol-atalhos { flex: 1 1 auto; min-width: 0; }
    .sol-contagem {
      display: inline-flex; align-items: center; justify-content: center; min-width: 1.375rem; height: 1.25rem; padding: 0 0.375rem;
      border-radius: 999px; background: var(--geo-surface-muted); color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption); font-weight: 600; font-variant-numeric: tabular-nums;
    }
    .geo-quick-filter[aria-pressed='true'] .sol-contagem { background: var(--geo-surface); color: var(--geo-foreground); }
    .sol-contagem--alerta { background: var(--geo-warning-soft); color: var(--geo-warning-text); }
    .sol-divisor { width: 1px; align-self: stretch; margin: 0.25rem 0.125rem; background: var(--geo-border); }
    .sol-tom { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--sol-tom); flex: none; }
    [data-tone='warning'] { --sol-tom: var(--geo-warning); }
    [data-tone='info'] { --sol-tom: var(--geo-info); }
    [data-tone='success'] { --sol-tom: var(--geo-success); }
    [data-tone='danger'] { --sol-tom: var(--geo-danger); }
    [data-tone='neutral'] { --sol-tom: var(--geo-foreground-subtle); }
    .sol-visoes { display: inline-flex; flex: none; padding: 2px; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .sol-visoes button {
      display: inline-flex; align-items: center; gap: 0.375rem; min-height: calc(var(--geo-control-height-sm) - 2px); padding: 0 0.75rem;
      border: 0; border-radius: calc(var(--geo-radius-md) - 2px); background: transparent; color: var(--geo-foreground-muted);
      font: inherit; font-size: var(--geo-font-control); font-weight: 600; cursor: pointer;
    }
    .sol-visoes button:hover { color: var(--geo-foreground); }
    .sol-visoes button[aria-current='page'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-shadow-sm); }
    .sol-visoes button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .sol-visoes .pi { font-size: var(--geo-font-caption); }
    .sol-prazo { display: grid; gap: 0.125rem; justify-items: start; }
    /* Códigos de equipe (CON-JZR-02) e data+hora não quebram no hífen nem no espaço. */
    .sol-nowrap { white-space: nowrap; }
    @media (max-width: 40rem) {
      .sol-toolbar { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.625rem; }
      .sol-atalhos { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; scroll-snap-type: x proximity; }
      .sol-atalhos::-webkit-scrollbar { display: none; }
      .sol-atalhos .geo-quick-filter { flex: none; scroll-snap-align: start; }
      .sol-visoes { width: 100%; }
      .sol-visoes button { flex: 1; justify-content: center; }
    }
  `,
  template: `
    <app-copiloto-area [contexto]="contextoCopiloto()">
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="canCreate" (newRequested)="novaSolicitacao()">
      <geo-page-header
        title="Solicitações técnicas"
        icon="pi pi-wrench"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Solicitações técnicas' }]"
        description="Material para obras: planejar, separar e entregar (221/921) e receber as devoluções (222/922)."
        helpLabel="Ajuda sobre solicitações técnicas"
        (help)="ajuda.show()"
      >
        <app-copiloto-gatilho actions></app-copiloto-gatilho>
        <geo-button actions variant="outline" icon="pi pi-download" label="Exportar" (pressed)="exportacaoAberta.set(true)"></geo-button>
        @if (canImport) {
          <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacaoAberta.set(true)"></geo-button>
        }
        @if (canReturn) {
          <geo-button actions variant="outline" icon="pi pi-undo" label="Nova devolução" (pressed)="novaDevolucao()"></geo-button>
        }
        @if (canCreate) {
          <geo-button actions icon="pi pi-plus" label="Nova solicitação" [keyShortcut]="atalhos.newShortcut()" (pressed)="novaSolicitacao()"></geo-button>
        }
      </geo-page-header>

      @if (!isOnline()) {
        <geo-callout tone="warning" icon="pi pi-wifi" title="Sem conexão">Os dados podem estar desatualizados. Criar solicitações exige reconexão.</geo-callout>
      }

      <geo-filter-panel #painelFiltros [storageKey]="chave" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        @if (visao !== 'tabela') {
          <div filter-actions class="geo-quick-filters"><ng-container [ngTemplateOutlet]="soAsMinhas"></ng-container></div>
        }
        <div class="geo-filter-grid">
          <geo-select label="Obra" [options]="obraOptions()" [(value)]="lista.filters.idObra" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-text-input label="OS / OC" [(value)]="lista.filters.ocorrencia" placeholder="Número digitado na solicitação"></geo-text-input>
          <geo-select label="Tipo de obra" [options]="tiposObra" [(value)]="lista.filters.tipoObra" [clearable]="true" placeholder="Todos"></geo-select>
          <geo-select label="Tipo de solicitação" [options]="tiposTecnicos" [(value)]="lista.filters.tipoTecnico"></geo-select>
          <geo-select label="Origem" [options]="origens" [(value)]="lista.filters.origem"></geo-select>
          <geo-select label="Almoxarifado" [options]="almoxarifadoOptions()" [(value)]="lista.filters.idAlmoxarifado" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Equipe" [options]="equipeOptions()" [(value)]="lista.filters.idEquipe" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-multiselect label="Status" [options]="statusOpcoes" [(value)]="lista.filters.statuses" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-select label="Separação" [options]="separacaoOpcoes" [(value)]="lista.filters.statusSeparacao"></geo-select>
          <geo-text-input label="Número da reserva" [(value)]="lista.filters.numeroReserva"></geo-text-input>
          <geo-select label="Agente da reserva" [options]="agenteOptions()" [(value)]="lista.filters.idAgenteReserva" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-text-input label="Número de série" [(value)]="lista.filters.numSerie" [maxlength]="120" hint="Não fica salvo no endereço da página."></geo-text-input>
          <geo-datepicker label="Solicitadas a partir de" [value]="dataLocal(lista.filters.periodo().from)" [clearable]="true" (valueChange)="periodo('from', $event)"></geo-datepicker>
          <geo-datepicker label="Solicitadas até" [value]="dataLocal(lista.filters.periodo().to)" [clearable]="true" (valueChange)="periodo('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <div class="sol-toolbar">
        <div class="geo-quick-filters sol-atalhos" role="group" aria-label="Mostrar só a situação escolhida">
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="!situacaoAplicada()" (click)="definirSituacao(null)">
            Todas <span class="sol-contagem">{{ contagemTotal() ?? '–' }}</span>
          </button>
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="situacaoAplicada() === emAberto.value" (click)="alternarSituacao(emAberto.value)" [title]="emAberto.descricao">
            <i class="pi pi-inbox" aria-hidden="true"></i> Em aberto
            <span class="sol-contagem" [class.sol-contagem--alerta]="(contagens()[emAberto.value] ?? 0) > 0">{{ contagens()[emAberto.value] ?? '–' }}</span>
          </button>
          <span class="sol-divisor" aria-hidden="true"></span>
          @for (s of situacoes; track s.value) {
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="situacaoAplicada() === s.value" [attr.data-tone]="s.tone"
              [title]="s.descricao" (click)="alternarSituacao(s.value)" [attr.aria-label]="s.atalho + ': ' + (contagens()[s.value] ?? 'contagem indisponível')">
              <span class="sol-tom" aria-hidden="true"></span> {{ s.atalho }} <span class="sol-contagem">{{ contagens()[s.value] ?? '–' }}</span>
            </button>
          }
        </div>
        <nav class="sol-visoes" aria-label="Forma de visualizar">
          @for (v of visoes; track v.value) {
            <button type="button" [attr.aria-current]="visao === v.value ? 'page' : null" (click)="trocarVisao(v.value)">
              <i [class]="v.icon" aria-hidden="true"></i>{{ v.label }}
            </button>
          }
        </nav>
      </div>

      <ng-template #soAsMinhas>
        <button type="button" class="geo-quick-filter" [attr.aria-pressed]="lista.applied().minhas" (click)="escopo(!lista.applied().minhas)">
          <i class="pi pi-user" aria-hidden="true"></i> Só as minhas
        </button>
      </ng-template>

      @switch (visao) {
        @case ('kanban') {
          <app-solicitacoes-tecnicas-quadro #quadro [filtros]="filtroVisao()" [nomeObra]="nomeObraPorId" (abrir)="abrirDetalhe($event)"
            (acao)="executar($event.item, $event.acao)" (verNaTabela)="trocarVisao('tabela')"></app-solicitacoes-tecnicas-quadro>
        }
        @case ('calendario') {
          <app-solicitacoes-comerciais-calendario #calendario [filtros]="filtroVisao()" [statusDe]="statusCalendario"
            [situacaoDe]="situacaoNoCalendario" [detalheDe]="detalheNoCalendario" iconeVazio="pi-building"
            [legendaItens]="legendaTecnica" [nomeItem]="nomeNoCalendario" (abrir)="abrirDetalhe($event)"></app-solicitacoes-comerciais-calendario>
        }
        @default {
          <geo-data-table
            title="Solicitações técnicas"
            mode="server"
            [storageKey]="chave"
            searchPlaceholder="Obra, OS/OC, reserva ou nº de série"
            rowActionLabel="Ver detalhe"
            rowActionIcon="pi pi-arrow-right"
            [emptyActionLabel]="canCreate ? 'Nova solicitação' : undefined"
            noResultsTitle="Nenhuma solicitação encontrada com esse recorte."
            [columns]="colunas"
            [rows]="resultado.rows()"
            [totalRecords]="resultado.total()"
            [rowLabel]="rotulo"
            [state]="resultado.state()"
            [stateTitle]="resultado.error() ? 'Não foi possível carregar as solicitações técnicas' : 'Nenhuma solicitação técnica'"
            [stateDescription]="resultado.error() ?? 'Crie uma solicitação ou importe uma planilha.'"
            [filtered]="lista.filtered()"
            [(page)]="lista.page"
            [(pageSize)]="lista.pageSize"
            [(sort)]="lista.sort"
            [(query)]="lista.query"
            (lazyLoad)="lista.load($event)"
            (adjustFilters)="painelFiltros.expandAndFocus()"
            (clearFilters)="lista.reset()"
            (emptyAction)="novaSolicitacao()"
            (rowActivate)="abrirDetalhe($event)"
          >
            <div table-filters class="geo-quick-filters" role="group" aria-label="Atalhos das solicitações">
              <ng-container [ngTemplateOutlet]="soAsMinhas"></ng-container>
            </div>
            <ng-template geoCell="solicitacao" let-row>
              <span class="geo-cell-strong">#{{ row.id.slice(0, 8) }}</span>
              <span class="geo-cell-muted sol-nowrap">{{ row.dataSolicitacao | date: 'dd/MM/yyyy HH:mm' }}</span>
              @if (row.numeroProgramacao) {
                <span class="geo-cell-muted" title="Gerada ao programar a obra"><i class="pi pi-calendar-plus" aria-hidden="true"></i> Programação #{{ row.numeroProgramacao }}</span>
              } @else {
                <span class="geo-cell-muted">Manual</span>
              }
            </ng-template>
            <ng-template geoCell="obra" let-row>
              <span [title]="obraLabel(row.idObra)">{{ obraLabel(row.idObra) }}</span>
              @if (row.ocorrencia?.codigo) {
                <span class="geo-cell-muted">{{ rotuloOcorrencia(row.idObra, row.ocorrencia.codigo) }}</span>
              } @else {
                <span class="geo-cell-muted">{{ tipoObraLabel(row.idObra, row.tipoObra) }}</span>
              }
            </ng-template>
            <ng-template geoCell="tipo" let-row>
              @if (row.tipo) {
                <geo-status [tone]="tipoTecnicoEhAdicao(row.tipo) ? 'info' : 'neutral'" [icon]="tipoTecnicoIcon(row.tipo)">{{ tipoTecnicoLabel(row.tipo) }}</geo-status>
              } @else {
                <span class="geo-cell-muted">—</span>
              }
            </ng-template>
            <ng-template geoCell="equipe" let-row>
              <span class="sol-nowrap" [class.geo-cell-muted]="!row.idEquipe">{{ row.idEquipe ? equipeLabel(row.idEquipe) : 'A definir' }}</span>
              @if (row.saqueForaEquipe) { <span class="geo-cell-muted">Saque fora da equipe</span> }
            </ng-template>
            <ng-template geoCell="saque" let-row>
              <span class="sol-prazo">
                @if (row.dataPrevista) {
                  <span>{{ row.dataPrevista | date: 'dd/MM/yyyy' : 'UTC' }}</span>
                  @if (row.atrasada) { <geo-status tone="danger" icon="pi-exclamation-triangle">Atrasada</geo-status> }
                } @else {
                  <span class="geo-cell-muted">Sem data</span>
                }
              </span>
            </ng-template>
            <ng-template geoCell="status" let-row>
              @let sit = situacaoAtual(row.status, row.dataPrevista, row.statusSeparacao);
              <geo-status [tone]="sit.tone" [icon]="'pi ' + sit.icon">{{ sit.label }}</geo-status>
              @if (row.possuiPendencia) { <geo-status tone="warning" icon="pi-flag">Com pendência</geo-status> }
            </ng-template>
            <ng-template geoCell="reserva" let-row>
              @if (row.numeroReserva) {
                <span class="geo-cell-strong">{{ row.numeroReserva }}</span>
              } @else {
                <span class="geo-cell-muted">Sem reserva</span>
              }
            </ng-template>
            <ng-template geoRowActions let-row>
              <span class="geo-table-actions">
                @if (podeAcao(row, 'EDITAR_PLANEJAMENTO') && ['PENDENTE', 'APROVADO', 'ENTREGUE_PARCIAL'].includes(row.status)) {
                  <geo-icon-button [icon]="row.dataPrevista ? 'pi pi-pencil' : 'pi pi-calendar-plus'"
                    [label]="(row.dataPrevista ? 'Editar' : 'Planejar') + ' a solicitação #' + row.id.slice(0, 8)" size="icon-sm" (pressed)="executar(row, 'PLANEJAR')"></geo-icon-button>
                }
                @if (podeAcao(row, 'ENTREGAR')) {
                  <geo-icon-button icon="pi pi-truck" [label]="'Entregar a solicitação #' + row.id.slice(0, 8)" size="icon-sm" (pressed)="executar(row, 'ENTREGAR')"></geo-icon-button>
                }
                @if (podeAcao(row, 'CONFIRMAR_DEVOLUCAO')) {
                  <geo-icon-button icon="pi pi-inbox" [label]="'Receber a devolução #' + row.id.slice(0, 8)" size="icon-sm" (pressed)="executar(row, 'DEVOLVER')"></geo-icon-button>
                }
                <geo-icon-button icon="pi pi-print" [label]="'Imprimir relatório da solicitação #' + row.id.slice(0, 8)" size="icon-sm" (pressed)="imprimirRelatorio(row)"></geo-icon-button>
              </span>
            </ng-template>
          </geo-data-table>
        }
      }
    </div>
    </app-copiloto-area>

    <app-solicitacao-tecnica-painel #painel (alterado)="aoAlterar()" />

    <app-nova-solicitacao-tecnica-drawer [(visible)]="formularioAberto" [idObraInicial]="obraFormulario()" (criada)="aoCriar($event)" />

    @if (devolucaoAberta()) {
      <app-devolucao-tecnica-form [idObra]="obraFormulario()" (registrada)="aoAlterar()" (fechado)="devolucaoAberta.set(false)"></app-devolucao-tecnica-form>
    }

    <app-solicitacoes-tecnicas-importacao [(visible)]="importacaoAberta" [obras]="obras()" [equipes]="equipes()" [almoxarifados]="almoxarifados()"
      [materiaisList]="materiais()" [agentesList]="agentes()" (processado)="aoAlterar()"></app-solicitacoes-tecnicas-importacao>

    <app-exportar-solicitacoes-dialog [visible]="exportacaoAberta()" (visibleChange)="exportacaoAberta.set($event)" contextoInicial="TECNICO"
      [filtrosAtivos]="filtrosExportacao()" [obraOptions]="obraOptions()" [almoxarifadoOptions]="almoxarifadoOptions()" [equipeOptions]="equipeOptions()"></app-exportar-solicitacoes-dialog>

    <app-ajuda-listagem #ajuda titulo="Solicitações técnicas" artigoPlural="as" entidadePlural="solicitações" busca="obra, OS/OC, reserva ou número de série"
      rotuloNovo="Nova solicitação" [podeCriar]="canCreate" [importacao]="canImport">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-calendar-plus"></i> Planejar</h4>
        <p class="help-text-desc">Dá para cadastrar ou importar sem data de saque. Enquanto não tiver data, a etapa é planejar: defina a data prevista; equipe e colaborador do saque são opcionais.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-box"></i> Separar e entregar</h4>
        <p class="help-text-desc">Planejada, a solicitação vai para a separação e, separada, para a entrega à equipe.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-undo"></i> Devoluções (222/922)</h4>
        <p class="help-text-desc">Em "Nova devolução", informe a obra e os materiais que voltam do estoque da obra. A devolução aparece nesta lista e o almoxarifado a recebe no painel, dizendo se cada material volta novo ou como sucata.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-calendar-plus"></i> Origem</h4>
        <p class="help-text-desc">Ao programar a obra, os materiais a instalar viram uma solicitação com o início da programação como saque previsto ("Programação #N"). As lançadas aqui aparecem como "Manual".</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-objects-column"></i> Tabela, quadro e calendário</h4>
        <p class="help-text-desc">O mesmo recorte aparece nas três formas. Clique numa solicitação para ver o detalhe ao lado; planejar, editar, separar e entregar acontecem no próprio painel.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class SolicitacoesMaterialTecnicasComponent {
  private readonly service = inject(SolicitacaoMaterialTecnicaService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly obrasService = inject(ObrasService);
  private readonly rh = inject(RhService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly painel = viewChild<SolicitacaoTecnicaPainelComponent>('painel');
  private readonly quadro = viewChild<SolicitacoesTecnicasQuadroComponent>('quadro');
  private readonly calendario = viewChild<SolicitacoesComerciaisCalendarioComponent>('calendario');
  private readonly copiloto = inject(CopilotoPainelService);

  protected readonly visao: VisaoTecnica = lerVisao(inject(ActivatedRoute).snapshot.data['modo']);
  /** Uma chave só: o recorte acompanha a troca de visualização. */
  protected readonly chave = 'almox-solicitacoes-tecnicas';
  protected readonly visoes = VISOES;
  protected readonly isOnline = inject(ConnectivityService).isOnline;
  protected readonly canCreate = this.hasPermission('estoque:solicitacao:create');
  protected readonly canImport = this.hasPermission('estoque:solicitacao:import');
  protected readonly canReturn = this.hasPermission('estoque:solicitacao:return');
  protected readonly importacaoAberta = signal(false);
  protected readonly exportacaoAberta = signal(false);
  protected readonly formularioAberto = signal(false);
  protected readonly devolucaoAberta = signal(false);
  protected readonly obraFormulario = signal<string | null>(null);

  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;
  protected readonly separacaoLabel = separacaoLabel;
  protected readonly separacaoTone = separacaoTone;
  protected readonly tipoTecnicoLabel = tipoTecnicoLabel;
  protected readonly tipoTecnicoIcon = tipoTecnicoIcon;
  protected readonly tipoTecnicoEhAdicao = tipoTecnicoEhAdicao;
  protected readonly dataLocal = dataLocal;
  protected readonly situacaoAtual = situacaoAtual;
  protected readonly tiposTecnicos = TIPOS_TECNICOS;
  protected readonly tiposObra = TIPOS_OBRA;
  protected readonly statusOpcoes = STATUS;
  protected readonly separacaoOpcoes = SEPARACAO;
  protected readonly situacoes = SITUACOES_TECNICAS;
  protected readonly emAberto = SITUACAO_EM_ABERTO;
  protected readonly statusCalendario = statusTecnicoDef;
  protected readonly legendaTecnica = LEGENDA_TECNICA;
  protected readonly situacaoNoCalendario = (s: SolicitacaoSummaryResponse) =>
    situacaoCalendarioTecnico(s.status, tecnicoDe(s)?.statusSeparacao ?? s.statusSeparacao);
  /** Cartão do dia: OS/OC, obra, almoxarifado e equipe, tipo e reserva. */
  protected readonly detalheNoCalendario = (s: SolicitacaoSummaryResponse): DetalheCalendario => {
    const t = tecnicoDe(s);
    const tipo = t?.tipoTecnico ?? s.tipoTecnico;
    const obra = this.obras().find((o) => o.id === t?.idObra);
    const equipe = this.equipes().find((e) => e.id === (t?.idEquipe ?? s.idEquipe));
    const almoxarifado = this.almoxarifados().find((a) => a.id === t?.idAlmoxarifadoAtendimento)?.nomeIdentificador
      ?? (s.estoqueOrigemNome ? formatarAlmoxarifado(s.estoqueOrigemNome) : null);
    const reserva = t?.reserva?.numero;
    return {
      codigo: t?.ocorrencia?.codigo || '#' + s.id.substring(0, 8),
      titulo: obra ? `${obra.numero} · ${obra.titulo}` : s.estoqueDestinoNome || 'Obra não identificada',
      linha: `${almoxarifado ?? 'Almoxarifado'} → ${equipe ? 'Equipe ' + equipe.codigo : 'equipe a definir'}${t?.saqueForaEquipe ? ' (saque por outra equipe)' : ''}`,
      etiqueta: tipo ? tipoTecnicoLabel(tipo as never) : null,
      meta: [
        { icon: tipoTecnicoEhAdicao(tipo) ? 'pi-shopping-cart' : 'pi-undo', texto: tipoTecnicoNome(tipo) },
        { icon: 'pi-bookmark', texto: reserva ? `Reserva ${reserva}` : 'Sem reserva' },
        { icon: 'pi-box', texto: `${s.totalItens} ${s.totalItens === 1 ? 'item' : 'itens'}` }
      ]
    };
  };

  protected readonly obras = signal<ObraResumoResponse[]>([]);
  protected readonly equipes = signal<EquipeResponse[]>([]);
  protected readonly almoxarifados = signal<EstoqueResponse[]>([]);
  protected readonly materiais = signal<MaterialResponse[]>([]);
  protected readonly agentes = signal<AgenteResponsavelResponse[]>([]);
  protected readonly agenteOptions = computed(() => this.agentes().map((a) => ({ label: a.nome, value: a.id })));
  protected readonly origens = ORIGENS;
  protected readonly obraOptions = computed(() => this.obras().map((o) => ({ label: `${o.numero} — ${o.titulo}`, value: o.id })));
  protected readonly equipeOptions = computed(() => this.equipes().map((e) => ({ label: e.codigo, value: e.id })));
  protected readonly almoxarifadoOptions = computed(() => this.almoxarifados().map((e) => ({ label: e.nomeIdentificador, value: e.id })));

  protected readonly lista = geoListState({
    storageKey: this.chave,
    filters: {
      minhas: geoFilter.value<boolean>(false, { label: 'Escopo', format: (v): string | null => (v ? 'Só as minhas' : null) }),
      idObra: geoFilter.value<string | null>(null, { label: 'Obra', param: 'obra', format: (id): string | null => (id ? this.obraLabel(id) : null) }),
      ocorrencia: geoFilter.value<string>('', { label: 'OS/OC', param: 'oc' }),
      tipoObra: geoFilter.value<string | null>(null, { label: 'Tipo de obra', param: 'tipoObra', options: () => TIPOS_OBRA }),
      tipoTecnico: geoFilter.value<TipoSolicitacaoTecnica | null>(null, { label: 'Tipo', options: () => TIPOS_TECNICOS }),
      origem: geoFilter.value<OrigemSolicitacaoTecnica | null>(null, { label: 'Origem', options: () => ORIGENS }),
      idAlmoxarifado: geoFilter.value<string | null>(null, {
        label: 'Almoxarifado',
        param: 'almoxarifado',
        format: (id): string | null => (id ? (this.almoxarifados().find((e) => e.id === id)?.nomeIdentificador ?? 'selecionado') : null)
      }),
      idEquipe: geoFilter.value<string | null>(null, { label: 'Equipe', param: 'equipe', format: (id): string | null => (id ? this.equipeLabel(id) : null) }),
      statuses: geoFilter.list<StatusSolicitacaoMaterial>([], { label: 'Status', param: 'status', itemLabel: (s) => statusLabel(s) }),
      situacao: geoFilter.value<string | null>(null, { label: 'Situação', param: 'situacao', format: (s): string | null => (s ? (situacaoTecnica(s)?.atalho ?? s) : null) }),
      statusSeparacao: geoFilter.value<StatusSeparacao | null>(null, { label: 'Separação', param: 'separacao', options: () => SEPARACAO }),
      numeroReserva: geoFilter.value<string>('', { label: 'Reserva', param: 'reserva' }),
      idAgenteReserva: geoFilter.value<string | null>(null, {
        label: 'Agente',
        param: 'agenteReserva',
        format: (id): string | null => (id ? (this.agentes().find((a) => a.id === id)?.nome ?? 'selecionado') : null)
      }),
      // Nº de série é dado sensível: fica fora da URL.
      numSerie: geoFilter.value<string>('', { label: 'Nº de série', url: false }),
      periodo: geoFilter.range({ from: null, to: null }, { label: 'Solicitação' })
    },
    sort: [{ key: 'solicitacao', direction: 'desc' }]
  });

  protected readonly resultado = this.lista.results<SolicitacaoMaterialSummaryResponse>(
    (pedido) =>
      this.visao !== 'tabela'
        ? of({ content: [], page: { size: 0, number: 0, totalElements: 0, totalPages: 0 } })
        : this.service.listar({
            ...this.filtro(),
            page: pedido.page,
            size: pedido.size,
            sort: pedido.sort.map((r) => `${r.key},${r.direction}`)[0] ?? 'dataSolicitacao,desc'
          } as SolicitacaoMaterialFilter),
    { errorMessage: getErrorMessage }
  );

  protected readonly situacaoAplicada = computed(() => this.lista.applied().situacao);

  /** Recorte aplicado para o quadro e o calendário (sem paginação). */
  protected readonly filtroVisao = computed(
    () => {
      this.lista.applied();
      return limpar(this.filtro() as unknown as Record<string, unknown>);
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );
  protected readonly filtrosExportacao = computed(() => {
    this.lista.applied();
    const f = this.filtro();
    return { ...f, dataInicio: dataLocal(f.dataInicio ?? null), dataFim: dataLocal(f.dataFim ?? null), apenasMinhas: this.lista.applied().minhas };
  });

  /** Contagem de cada situação no recorte, ignorando o atalho escolhido (o número não some ao filtrar). */
  protected readonly contagens = signal<Partial<Record<string, number>>>({});
  protected readonly contagemTotal = signal<number | null>(null);
  private readonly versaoContagens = signal(0);

  /** O que a Bússola recebe: o recorte em tela e a contagem de cada situação. */
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const f = this.lista.applied();
    const c = this.contagens();
    const situacoes = SITUACOES_TECNICAS.filter((s) => c[s.value] !== undefined);
    return {
      id: 'almoxarifado.solicitacoes-tecnicas',
      nome: 'Gestão de solicitações técnicas',
      modulo: 'Almoxarifado',
      descricao: 'Fila de solicitações técnicas de material para obras: planejamento do saque, separação, entrega (221/921) e recebimento das devoluções (222/922).',
      rota: VISOES.find((v) => v.value === this.visao)!.rota,
      periodo: periodoPainel(f.periodo.from ? dataLocal(f.periodo.from) : null, f.periodo.to ? dataLocal(f.periodo.to) : null),
      filtros: [
        filtroPainel('situacao', 'Situação', situacaoTecnica(f.situacao)?.atalho, f.situacao),
        filtroPainel('status', 'Status', f.statuses.map((s) => statusLabel(s)), f.statuses),
        filtroPainel('obra', 'Obra', f.idObra ? this.obraLabel(f.idObra) : null, f.idObra),
        filtroPainel('tipoObra', 'Tipo de obra', TIPOS_OBRA.find((t) => t.value === f.tipoObra)?.label, f.tipoObra),
        filtroPainel('almoxarifado', 'Almoxarifado', this.almoxarifados().find((e) => e.id === f.idAlmoxarifado)?.nomeIdentificador, f.idAlmoxarifado),
        filtroPainel('equipe', 'Equipe', f.idEquipe ? this.equipeLabel(f.idEquipe) : null, f.idEquipe),
        filtroPainel('origem', 'Origem', f.origem ? (ORIGENS.find((o) => o.value === f.origem)?.label ?? null) : null, f.origem),
        filtroPainel('escopo', 'Escopo', f.minhas ? 'Só as minhas' : null)
      ],
      metricas: [
        metricaPainel('emAberto', 'Em aberto (a planejar, separar ou entregar)', c[SITUACAO_EM_ABERTO.value], 'inteiro'),
        ...situacoes.map((s) => metricaPainel(`situacao.${s.value}`, s.atalho, c[s.value], 'inteiro'))
      ],
      graficos: situacoes.length
        ? [graficoPainel('porSituacao', 'rosca', 'Solicitações por situação', situacoes.map((s) => s.atalho), situacoes.map((s) => c[s.value] ?? 0), { metrica: 'solicitações', dimensao: 'situação', formato: 'inteiro' })]
        : [],
      datasets: ['solicitacoes', 'itens_solicitacao', 'operacoes_solicitacao', 'historico_solicitacoes', 'materiais', 'estoques'],
      sugestoes: [
        { rotulo: 'Priorizar a fila', icone: 'pi pi-clock', requer: ['dados'], pergunta: 'Quais solicitações técnicas deste recorte devo planejar ou separar primeiro, considerando o saque previsto e as pendências?' },
        { rotulo: 'Saques atrasados', icone: 'pi pi-truck', requer: ['dados'], pergunta: 'Quais saques estão atrasados neste recorte, para quais obras e equipes, e há saldo no almoxarifado para atendê-los?' },
        { rotulo: 'Pendências abertas', icone: 'pi pi-flag', requer: ['dados'], pergunta: 'Resuma as pendências abertas nas solicitações deste recorte, agrupadas por motivo.' }
      ]
    };
  });

  protected readonly colunas: GeoDataTableColumn<SolicitacaoMaterialSummaryResponse>[] = [
    { key: 'solicitacao', header: 'Solicitação', type: 'custom', priority: 1, sortField: 'dataSolicitacao', value: (s) => s.dataSolicitacao },
    { key: 'obra', header: 'Obra / OS-OC', type: 'custom', priority: 1, value: (s) => this.obraLabel(s.idObra) },
    { key: 'tipo', header: 'Tipo', type: 'custom', value: (s) => (s.tipo ? tipoTecnicoLabel(s.tipo) : '') },
    { key: 'equipe', header: 'Equipe', type: 'custom', value: (s) => this.equipeLabel(s.idEquipe) },
    { key: 'saque', header: 'Saque previsto', type: 'custom', sortField: 'dataPrevistaRetirada', value: (s) => s.dataPrevista },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, sortField: 'status', value: (s) => situacaoAtual(s.status, s.dataPrevista, s.statusSeparacao).label },
    { key: 'reserva', header: 'Reserva', type: 'custom', value: (s) => s.numeroReserva },
    { key: 'itens', header: 'Itens', type: 'integer', value: (s) => s.quantidadeItens }
  ];
  protected readonly rotulo = (s: SolicitacaoMaterialSummaryResponse) => `Solicitação #${s.id.slice(0, 8)}`;
  protected readonly nomeObraPorId = (idObra?: string | null): string | null => {
    const obra = this.obras().find((o) => o.id === idObra);
    return obra ? `${obra.numero} · ${obra.titulo}` : null;
  };
  protected readonly nomeNoCalendario = (s: SolicitacaoSummaryResponse): string => {
    const obra = this.obras().find((o) => o.id === tecnicoDe(s)?.idObra);
    return obra ? `${obra.numero} · ${obra.titulo}` : s.estoqueDestinoNome || '#' + s.id.substring(0, 8);
  };

  constructor() {
    forkJoin({
      obras: this.obrasService.listarObras({ ativo: true, size: 1000, sort: 'numero,asc' }),
      equipes: this.rh.listarEquipes({ ativo: true, size: 1000, sort: 'codigo,asc' }),
      estoques: this.almoxarifado.listarEstoquesAtivos(),
      materiais: this.almoxarifado.listarMateriais({ ativo: true, size: 1000, sort: 'codigo,asc' })
    }).subscribe({
      next: ({ obras, equipes, estoques, materiais }) => {
        this.obrasService.listarAgentesAtivos().subscribe({ next: (agentes) => this.agentes.set(agentes), error: () => {} });
        this.obras.set((obras.content || []).filter((o) => o.ativo && (!o.processoNome || o.processoNome.trim().toUpperCase() === 'OBRAS')));
        this.equipes.set(equipes.content);
        this.almoxarifados.set(estoques.content);
        this.materiais.set(materiais?.content || []);
      },
      error: () => this.notifications.warning('Alguns filtros de apoio não puderam ser carregados.')
    });

    const consultaContagens = computed(
      () => {
        this.lista.applied();
        return { filtro: limpar(this.filtro(false) as unknown as Record<string, unknown>), versao: this.versaoContagens() };
      },
      { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );
    toObservable(consultaContagens)
      .pipe(
        switchMap(({ filtro }) =>
          forkJoin([
            this.contar(filtro).pipe(map((n) => ['__TOTAL__', n] as const)),
            ...CONTADAS.map((s) => this.contar({ ...filtro, ...parametrosSituacao(s, filtro['statuses'] as StatusSolicitacaoMaterial[] | undefined) }).pipe(map((n) => [s.value, n] as const)))
          ])
        ),
        takeUntilDestroyed()
      )
      .subscribe((pares) => {
        this.contagemTotal.set(pares.find(([k]) => k === '__TOTAL__')?.[1] ?? null);
        const c: Record<string, number> = {};
        for (const [k, n] of pares) if (k !== '__TOTAL__' && n !== null) c[k] = n;
        this.contagens.set(c);
      });

    // Entradas por link: ?nova=1&idObra=... (ficha da obra), ?devolucao=1 e ?abrir=<id> (outras telas).
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    if (q.get('nova') === '1') this.abrirFormulario(q.get('idObra'));
    else if (q.get('devolucao') === '1') this.abrirDevolucao(q.get('idObra'));
    const abrir = q.get('abrir');
    if (abrir) setTimeout(() => this.painel()?.abrirDetalhe({ id: abrir }));
  }

  private contar(filtro: Record<string, unknown>) {
    return this.service.listar({ ...filtro, page: 0, size: 1 } as SolicitacaoMaterialFilter).pipe(
      map((r) => r.page?.totalElements ?? 0),
      catchError(() => of(null))
    );
  }

  /** Recorte no formato do backend; `comSituacao = false` ignora o atalho (para as contagens). */
  private filtro(comSituacao = true): SolicitacaoMaterialFilter {
    const { filters: f, query } = this.lista.request();
    const situacao = comSituacao ? situacaoTecnica(f.situacao) : undefined;
    const extra = situacao ? parametrosSituacao(situacao, f.statuses) : { statuses: f.statuses.length ? [...f.statuses] : undefined };
    return {
      contexto: 'TECNICO',
      idObra: f.idObra,
      ocorrencia: f.ocorrencia.trim() || null,
      tipoObra: f.tipoObra,
      tipoTecnico: f.tipoTecnico,
      origem: f.origem,
      idEquipe: f.idEquipe,
      idAlmoxarifado: f.idAlmoxarifado,
      numeroReserva: f.numeroReserva.trim() || null,
      idAgenteReserva: f.idAgenteReserva,
      statusSeparacao: f.statusSeparacao,
      ...extra,
      dataInicio: f.periodo.from,
      dataFim: f.periodo.to,
      numSerie: f.numSerie.trim() || null,
      buscaGlobal: query || null,
      idRequisitante: f.minhas ? (this.auth.currentUser()?.id ?? null) : null
    } as SolicitacaoMaterialFilter;
  }

  protected escopo(minhas: boolean): void {
    this.lista.filters.minhas.set(minhas);
    this.lista.apply();
  }

  protected definirSituacao(valor: string | null): void {
    this.lista.set('situacao', valor);
  }

  /** Um atalho de cada vez (como abas): clicar de novo volta para "Todas". */
  protected alternarSituacao(valor: string): void {
    this.definirSituacao(this.situacaoAplicada() === valor ? null : valor);
  }

  protected trocarVisao(visao: VisaoTecnica): void {
    if (visao === this.visao) return;
    void this.router.navigate([VISOES.find((v) => v.value === visao)!.rota], { queryParams: this.lista.queryParams() });
  }

  protected periodo(ponta: 'from' | 'to', data: Date | null): void {
    const atual = this.lista.filters.periodo();
    const valor = dataIso(data);
    if (atual[ponta] !== valor) this.lista.filters.periodo.set({ ...atual, [ponta]: valor });
  }

  protected novaSolicitacao(): void {
    this.abrirFormulario(null);
  }

  protected novaDevolucao(): void {
    this.abrirDevolucao(null);
  }

  private abrirFormulario(idObra: string | null): void {
    if (!this.canCreate) return;
    this.obraFormulario.set(idObra);
    this.formularioAberto.set(true);
  }

  private abrirDevolucao(idObra: string | null): void {
    if (!this.canReturn) return;
    this.obraFormulario.set(idObra);
    this.devolucaoAberta.set(true);
  }

  protected aoCriar(ids: string[]): void {
    this.formularioAberto.set(false);
    this.aoAlterar();
    if (ids.length === 1) this.abrirDetalhe({ id: ids[0] });
  }

  protected abrirDetalhe(item: { id: string }): void {
    this.fecharBússolaEmTelaEstreita();
    this.painel()?.abrirDetalhe(item);
  }

  protected executar(item: SolicitacaoMaterialSummaryResponse, acao: string): void {
    this.fecharBússolaEmTelaEstreita();
    this.painel()?.executar(item, acao);
  }

  /** Abaixo de 1280px a Bússola sobrepõe a tela: não deixa os dois painéis empilhados. */
  private fecharBússolaEmTelaEstreita(): void {
    if (typeof matchMedia === 'function' && !matchMedia('(min-width: 1280px)').matches) this.copiloto.fechar();
  }

  protected podeAcao(item: SolicitacaoMaterialSummaryResponse, acao: string): boolean {
    return (item.acoesPermitidas as string[] | undefined)?.includes(acao) ?? false;
  }

  protected aoAlterar(): void {
    this.versaoContagens.update((v) => v + 1);
    if (this.visao === 'kanban') this.quadro()?.recarregar();
    else if (this.visao === 'calendario') this.calendario()?.recarregar();
    else this.lista.reload();
  }

  protected imprimirRelatorio(item: SolicitacaoMaterialSummaryResponse): void {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/almoxarifado/solicitacoes-tecnicas', item.id], { queryParams: { mode: 'print' } }));
    window.open(url, '_blank', 'noopener');
  }

  protected obraLabel(idObra?: string | null): string {
    if (!idObra) return 'Obra não informada';
    const obra = this.obras().find((item) => item.id === idObra);
    return obra ? `${obra.numero} · ${obra.titulo}` : `Obra ${idObra.slice(0, 8)}`;
  }

  protected tipoObraLabel(idObra?: string | null, fallback?: string | null): string {
    const obra = this.obras().find((item) => item.id === idObra);
    return obra?.tipoObraNome || fallback || 'Tipo não informado';
  }

  protected rotuloExecucao(idObra?: string | null): string {
    const obra = this.obras().find((item) => item.id === idObra);
    return obra?.controleExecucao === 'OS' ? 'OS' : 'OC';
  }

  /** "OC 88412" — sem repetir o prefixo quando o número já foi digitado com ele. */
  protected rotuloOcorrencia(idObra: string | null | undefined, codigo: string): string {
    return /^(OS|OC)\b/i.test(codigo.trim()) ? codigo : `${this.rotuloExecucao(idObra)} ${codigo}`;
  }

  protected equipeLabel(idEquipe?: string | null): string {
    if (!idEquipe) return '—';
    return this.equipes().find((item) => item.id === idEquipe)?.codigo ?? `Eq. ${idEquipe.slice(0, 8)}`;
  }

  private hasPermission(permission: string): boolean {
    return this.auth.currentUser()?.permissoes?.includes(permission) ?? false;
  }
}

function lerVisao(modo: unknown): VisaoTecnica {
  return modo === 'kanban' || modo === 'calendario' ? modo : 'tabela';
}

/** Remove vazios para o filtro ir limpo ao backend e às comparações. */
function limpar(f: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
}

/** Situação → parâmetros do backend. Se o painel já filtra status, vale a interseção. */
function parametrosSituacao(s: SituacaoTecnicaDef, statusPainel?: readonly StatusSolicitacaoMaterial[] | null): { etapa?: string; statuses?: StatusSolicitacaoMaterial[]; saldoAberto?: boolean } {
  const painel = statusPainel?.length ? statusPainel : null;
  if (s.etapa) return { etapa: s.etapa, statuses: painel ? [...painel] : undefined };
  const intersecao = painel ? (s.statuses ?? []).filter((x) => painel.includes(x)) : [];
  // Sem interseção, o atalho prevalece sobre o status do painel.
  return { statuses: intersecao.length ? intersecao : [...(s.statuses ?? [])], ...(s.saldoAberto ? { saldoAberto: true } : {}) };
}
