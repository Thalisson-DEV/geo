import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoButtonComponent,
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
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

import {
  FechamentoFiltro,
  FechamentoResumo,
  SituacaoFechamento,
  SituacaoFechamentoObra,
  TipoFechamento
} from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { AuthService } from '../../../core/services/auth.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { ObrasService } from '../../../core/services/obras.service';
import { RhService } from '../../../core/services/rh.service';
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
import { ExportarSolicitacoesDialogComponent } from '../../almoxarifado/solicitacoes-material/exportar-solicitacoes-dialog.component';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { FechamentoCalendarioComponent } from './fechamento-calendario.component';
import { FechamentoCriarDrawerComponent } from './fechamento-criar-drawer.component';
import { AbaFechamento, FechamentoDetalheDrawerComponent } from './fechamento-detalhe-drawer.component';
import { FechamentoImportacaoComponent } from './fechamento-importacao.component';
import { AcaoFechamento } from './fechamento-kanban-card.component';
import { FechamentoQuadroComponent } from './fechamento-quadro.component';
import {
  ATALHOS,
  ATALHO_EM_ABERTO,
  AtalhoFechamento,
  OPCOES_PRAZO,
  OPCOES_SITUACAO_OBRA,
  OPCOES_TIPO,
  SEM_COLABORADOR,
  SITUACOES,
  atalhoFechamento,
  iconeTipo,
  nomePessoa,
  prazo,
  rotuloObra,
  textoPrazo,
  tipoFechamento
} from './fechamento-ui';
import { AJUSTE_TEXTO_LISTAGEM } from '../obras-ui';

type Prazo = 'NO_PRAZO' | 'VENCE_EM_BREVE' | 'ATRASADO';
type Visao = 'tabela' | 'kanban' | 'calendario';

const VISOES: { value: Visao; label: string; icon: string; rota: string }[] = [
  { value: 'tabela', label: 'Tabela', icon: 'pi pi-table', rota: '/obras/encerramento' },
  { value: 'kanban', label: 'Quadro', icon: 'pi pi-objects-column', rota: '/obras/encerramento/kanban' },
  { value: 'calendario', label: 'Calendário', icon: 'pi pi-calendar', rota: '/obras/encerramento/calendario' }
];
const CONTADOS: readonly AtalhoFechamento[] = [ATALHO_EM_ABERTO, ...ATALHOS];

/** Obras › Fechamento: solicitações para regularizar o saldo da obra no SAP. */
@Component({
  selector: 'app-fechamento-lista',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    AjudaListagemComponent,
    GeoButtonComponent,
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
    FechamentoCalendarioComponent,
    FechamentoCriarDrawerComponent,
    FechamentoDetalheDrawerComponent,
    ExportarSolicitacoesDialogComponent,
    FechamentoImportacaoComponent,
    FechamentoQuadroComponent,
    CopilotoAreaComponent,
    CopilotoGatilhoComponent
  ],
  styles: `
    .fl-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
    .fl-atalhos { flex: 1 1 auto; min-width: 0; gap: 0.25rem; }
    .fl-atalhos .geo-quick-filter { padding-inline: 0.5rem; }
    .fl-contagem {
      display: inline-flex; align-items: center; justify-content: center; min-width: 1.375rem; height: 1.25rem; padding: 0 0.375rem;
      border-radius: 999px; background: var(--geo-surface-muted); color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption); font-weight: 600; font-variant-numeric: tabular-nums;
    }
    .geo-quick-filter[aria-pressed='true'] .fl-contagem { background: var(--geo-surface); color: var(--geo-foreground); }
    .fl-contagem--alerta { background: var(--geo-warning-soft); color: var(--geo-warning-text); }
    .fl-divisor { width: 1px; align-self: stretch; margin: 0.25rem 0.125rem; background: var(--geo-border); }
    .geo-quick-filter[data-tone] .pi { color: var(--fl-tom); }
    [data-tone='warning'] { --fl-tom: var(--geo-warning); }
    [data-tone='info'] { --fl-tom: var(--geo-info); }
    [data-tone='success'] { --fl-tom: var(--geo-success); }
    [data-tone='danger'] { --fl-tom: var(--geo-danger); }
    [data-tone='neutral'] { --fl-tom: var(--geo-foreground-subtle); }
    .fl-visoes { display: inline-flex; flex: none; padding: 2px; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .fl-visoes button {
      display: inline-flex; align-items: center; gap: 0.375rem; min-height: calc(var(--geo-control-height-sm) - 2px); padding: 0 0.75rem;
      border: 0; border-radius: calc(var(--geo-radius-md) - 2px); background: transparent; color: var(--geo-foreground-muted);
      font: inherit; font-size: var(--geo-font-control); font-weight: 600; cursor: pointer;
    }
    .fl-visoes button:hover { color: var(--geo-foreground); }
    .fl-visoes button[aria-current='page'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-shadow-sm); }
    .fl-visoes button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .fl-visoes .pi { font-size: var(--geo-font-caption); }
    .fl-obra { display: grid; gap: 0.125rem; min-width: 15rem; }
    .fl-pilha { display: grid; gap: 0.125rem; justify-items: start; min-width: 0; }
    @media (max-width: 40rem) {
      .fl-toolbar { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.625rem; }
      .fl-atalhos { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; scroll-snap-type: x proximity; }
      .fl-atalhos::-webkit-scrollbar { display: none; }
      .fl-atalhos .geo-quick-filter { flex: none; scroll-snap-align: start; }
      .fl-visoes { width: 100%; }
      .fl-visoes button { flex: 1; justify-content: center; }
    }
  `,
  template: `
    <app-copiloto-area [contexto]="contextoCopiloto()">
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="podeCriar" (newRequested)="criacaoAberta.set(true)">
      <geo-page-header
        title="Encerramento de obras"
        icon="pi pi-flag"
        [breadcrumb]="[{ label: 'Obras', route: '/obras' }, { label: 'Encerramento' }]"
        description="Regularização do saldo da obra no SAP: adições (221/921) e devoluções (222/922). O almoxarifado marca como movimentado."
        helpLabel="Ajuda sobre o encerramento de obras"
        (help)="ajuda.show()"
      >
        <app-copiloto-gatilho actions></app-copiloto-gatilho>
        <geo-button actions variant="outline" icon="pi pi-download" label="Exportar" (pressed)="exportacaoAberta.set(true)"></geo-button>
        @if (podeCriar) {
          <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacaoAberta.set(true)"></geo-button>
        }
        @if (podeCriar) {
          <geo-button actions icon="pi pi-plus" label="Nova solicitação" [keyShortcut]="atalhos.newShortcut()" (pressed)="criacaoAberta.set(true)"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel [storageKey]="chave" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        @if (visao !== 'tabela') {
          <div filter-actions class="geo-quick-filters"><ng-container [ngTemplateOutlet]="soAsMinhas"></ng-container></div>
        }
        <div class="geo-filter-grid">
          <geo-select label="Obra" [options]="opcoesObra()" [(value)]="lista.filters.obra" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-multiselect label="Tipo" [options]="opcoesTipo" [(value)]="lista.filters.tipos" [clearable]="true" [filter]="false" placeholder="Todos"></geo-multiselect>
          <geo-select label="Prazo" [options]="opcoesPrazo" [(value)]="lista.filters.prazo" [clearable]="true" placeholder="Todos"></geo-select>
          <geo-select label="Pendência" [options]="opcoesPendencia" [(value)]="lista.filters.pendencia" [clearable]="true" placeholder="Todas"></geo-select>
          <geo-select label="Almoxarifado" [options]="opcoesAlmoxarifado()" [(value)]="lista.filters.almoxarifado" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Solicitante" [options]="opcoesSolicitante()" [(value)]="lista.filters.solicitante" [clearable]="true" [filter]="true" placeholder="Todos"
            [disabled]="lista.filters.minhas()" [description]="lista.filters.minhas() ? 'Desligue Só as minhas para escolher outro solicitante.' : undefined"></geo-select>
          <geo-select label="Supervisor" [options]="opcoesSupervisor()" [(value)]="lista.filters.supervisor" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Coordenador" [options]="opcoesCoordenador()" [(value)]="lista.filters.coordenador" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Encerramento da obra" [options]="opcoesSituacaoObra" [(value)]="lista.filters.situacaoObra" [clearable]="true" placeholder="Todos"></geo-select>
          <geo-text-input label="Número da reserva" [(value)]="lista.filters.reserva" [maxlength]="20"></geo-text-input>
          <geo-datepicker label="Criadas a partir de" [value]="dataLocal(lista.filters.periodo().from)" [clearable]="true" (valueChange)="periodo('from', $event)"></geo-datepicker>
          <geo-datepicker label="Criadas até" [value]="dataLocal(lista.filters.periodo().to)" [clearable]="true" (valueChange)="periodo('to', $event)"></geo-datepicker>
        </div>
      </geo-filter-panel>

      <div class="fl-toolbar">
        <div class="geo-quick-filters fl-atalhos" role="group" aria-label="Mostrar só a situação escolhida">
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="!atalhoAplicado()" (click)="definirAtalho(null)">
            <i class="pi pi-list" aria-hidden="true"></i> Todas <span class="fl-contagem">{{ contagemTotal() ?? '–' }}</span>
          </button>
          <button type="button" class="geo-quick-filter" [attr.aria-pressed]="atalhoAplicado() === emAberto.value" (click)="alternarAtalho(emAberto.value)" [title]="emAberto.descricao">
            <i [class]="emAberto.icon" aria-hidden="true"></i> Em aberto
            <span class="fl-contagem" [class.fl-contagem--alerta]="(contagens()[emAberto.value] ?? 0) > 0">{{ contagens()[emAberto.value] ?? '–' }}</span>
          </button>
          <span class="fl-divisor" aria-hidden="true"></span>
          @for (a of atalhosStatus; track a.value) {
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="atalhoAplicado() === a.value" [attr.data-tone]="a.tone"
              [title]="a.descricao" (click)="alternarAtalho(a.value)" [attr.aria-label]="a.atalho + ': ' + (contagens()[a.value] ?? 'contagem indisponível')">
              <i [class]="a.icon" aria-hidden="true"></i> {{ a.atalho }} <span class="fl-contagem">{{ contagens()[a.value] ?? '–' }}</span>
            </button>
          }
        </div>
        <nav class="fl-visoes" aria-label="Forma de visualizar">
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
          <app-fechamento-quadro #quadro [filtros]="filtroVisao()" (abrir)="abrir($event)" (acao)="executar($event.item, $event.acao)" (verNaTabela)="trocarVisao('tabela')"></app-fechamento-quadro>
        }
        @case ('calendario') {
          <app-fechamento-calendario #calendario [filtros]="filtroVisao()" (abrir)="abrir($event)"></app-fechamento-calendario>
        }
        @default {
          <geo-data-table [textFit]="ajusteTexto"
            title="Solicitações de encerramento"
            mode="server"
            storageKey="obras-fechamento-lista-v5"
            searchPlaceholder="Obra ou número da reserva"
            rowActionLabel="Ver detalhe"
            rowActionIcon="pi pi-arrow-right"
            [emptyActionLabel]="podeCriar ? 'Nova solicitação' : undefined"
            noResultsTitle="Nenhuma solicitação encontrada com esse recorte."
            [columns]="colunas"
            [rows]="resultado.rows()"
            [totalRecords]="resultado.total()"
            [rowLabel]="rotulo"
            [state]="resultado.state()"
            [stateTitle]="resultado.error() ? 'Não foi possível carregar o fechamento' : 'Nenhuma solicitação de encerramento'"
            [stateDescription]="resultado.error() ?? (podeCriar ? 'Crie a primeira solicitação para uma obra.' : 'As solicitações dos técnicos de encerramento aparecem aqui.')"
            [filtered]="lista.filtered()"
            [(page)]="lista.page"
            [(pageSize)]="lista.pageSize"
            [(sort)]="lista.sort"
            [(query)]="lista.query"
            (lazyLoad)="lista.load($event)"
            (adjustFilters)="painel.expandAndFocus()"
            (clearFilters)="lista.reset()"
            (emptyAction)="criacaoAberta.set(true)"
            (rowActivate)="abrir($event)"
          >
            <div table-filters class="geo-quick-filters" role="group" aria-label="Atalhos do fechamento">
              <ng-container [ngTemplateOutlet]="soAsMinhas"></ng-container>
            </div>
            <ng-template geoCell="solicitacao" let-row>
              <span class="geo-cell-strong">#{{ row.id.slice(0, 8) }}</span>
              <span class="geo-cell-muted">{{ row.criadaEm | date: 'dd/MM/yyyy HH:mm' }}</span>
            </ng-template>
            <ng-template geoCell="obra" let-row>
              <span class="fl-obra">
                <span class="geo-cell-strong">{{ row.obra.numero ?? '—' }}</span>
                <span class="geo-cell-muted" [title]="row.obra.titulo ?? ''">{{ row.obra.titulo }}</span>
              </span>
            </ng-template>
            <ng-template geoCell="tipo" let-row>
              <geo-status [tone]="tipo(row.tipo).adicao ? 'info' : 'neutral'" [icon]="iconeTipo(row.tipo)" [title]="tipo(row.tipo).nome">{{ row.tipo }}</geo-status>
            </ng-template>
            <ng-template geoCell="encarregado" let-row>
              <span [class.geo-cell-muted]="!row.encarregado">{{ pessoa(row.encarregado, 'Sem encarregado') }}</span>
            </ng-template>
            <ng-template geoCell="supervisor" let-row>
              <span [class.geo-cell-muted]="!row.supervisor">{{ pessoa(row.supervisor, 'Sem supervisor') }}</span>
            </ng-template>
            <ng-template geoCell="coordenador" let-row>
              <span [class.geo-cell-muted]="!row.coordenador">{{ pessoa(row.coordenador, 'Sem coordenador') }}</span>
            </ng-template>
            <ng-template geoCell="solicitante" let-row>
              <span [class.geo-cell-muted]="semColaborador(row)">{{ pessoa(row.solicitante) }}</span>
            </ng-template>
            <ng-template geoCell="prazo" let-row>
              <span class="fl-pilha">
                @if (row.prazoVigente.limite) {
                  <span>{{ textoPrazo(row.situacao, row.prazoVigente) }}</span>
                } @else if (row.situacao === 'MOVIMENTADA') {
                  <span class="geo-cell-muted">Concluída {{ row.movimentacaoConcluidaEm | date: 'dd/MM/yyyy' }}</span>
                } @else {
                  <span class="geo-cell-muted">Sem prazo</span>
                }
                @if (prazo(row.prazoVigente.situacao); as p) {
                  <geo-status [tone]="p.tone" [icon]="p.icon">{{ p.label }}</geo-status>
                }
              </span>
            </ng-template>
            <ng-template geoCell="situacao" let-row>
              <span class="fl-pilha">
                <geo-status [tone]="sit(row.situacao).tone" [icon]="sit(row.situacao).icon">{{ sit(row.situacao).label }}</geo-status>
                @if (row.possuiPendencia) { <geo-status tone="warning" icon="pi pi-flag">Com pendência</geo-status> }
              </span>
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
                <geo-icon-button icon="pi pi-print" [label]="'Imprimir relatório da solicitação #' + row.id.slice(0, 8)" size="icon-sm" (pressed)="imprimirRelatorio(row)"></geo-icon-button>
                @if (row.acoes.registrarReserva) {
                  <geo-icon-button icon="pi pi-hashtag" [label]="'Registrar reserva da solicitação #' + row.id.slice(0, 8)" size="icon-sm" (pressed)="executar(row, 'RESERVA')"></geo-icon-button>
                }
                @if (row.acoes.movimentar) {
                  <geo-icon-button icon="pi pi-check-square" [label]="'Marcar como movimentado a solicitação #' + row.id.slice(0, 8)" size="icon-sm" (pressed)="executar(row, 'MOVIMENTAR')"></geo-icon-button>
                }
              </span>
            </ng-template>
          </geo-data-table>
        }
      }
    </div>
    </app-copiloto-area>

    <app-fechamento-criar-drawer [(visible)]="criacaoAberta" [idObraInicial]="idObraInicial" (criadas)="aoCriar($event)"></app-fechamento-criar-drawer>
    <app-fechamento-detalhe-drawer [(visible)]="detalheAberto" [solicitacaoId]="idDetalhe()" [abaInicial]="abaDetalhe()" (alterado)="aoAlterar()" />
    @if (podeCriar) {
      <app-fechamento-importacao [(visible)]="importacaoAberta" (processado)="aoAlterar()" />
    }
    <app-exportar-solicitacoes-dialog [visible]="exportacaoAberta()" (visibleChange)="exportacaoAberta.set($event)" contextoInicial="FECHAMENTO"
      [filtrosAtivos]="filtroVisao()" [obraOptions]="opcoesObra()" [almoxarifadoOptions]="opcoesAlmoxarifado()" [solicitanteOptions]="opcoesSolicitante()"
      [supervisorOptions]="opcoesSupervisor()" [coordenadorOptions]="opcoesCoordenador()"></app-exportar-solicitacoes-dialog>

    <app-ajuda-listagem #ajuda titulo="Encerramento de obras" artigoPlural="as" entidadePlural="solicitações" busca="obra ou número da reserva"
      rotuloNovo="Nova solicitação" [podeCriar]="podeCriar" [importacao]="podeCriar">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-hashtag"></i> Reserva</h4>
        <p class="help-text-desc">A solicitação pode nascer sem reserva. Da criação, são 48 horas úteis para informar o número; com a reserva registrada, começa o prazo do almoxarifado.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-check-square"></i> Movimentar</h4>
        <p class="help-text-desc">O almoxarifado tem 48 horas úteis para marcar como movimentado o que já foi feito no SAP, no todo ou em parte, escolhendo se é físico (muda o saldo entre almoxarifado e obra) ou virtual (só registra).</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-objects-column"></i> Tabela, quadro e calendário</h4>
        <p class="help-text-desc">O mesmo recorte aparece nas três formas. O quadro mostra o que falta fazer; arraste um cartão para registrar a reserva ou movimentar. O calendário mostra o dia em que cada prazo vence e o dia em que a movimentação terminou.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-download"></i> Exportar</h4>
        <p class="help-text-desc">A exportação abre com o recorte da tela e os filtros podem ser ajustados: resumo, com uma linha por solicitação, ou detalhado, com uma linha por material.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class FechamentoListaComponent {
  protected readonly ajusteTexto = AJUSTE_TEXTO_LISTAGEM;
  private readonly service = inject(FechamentoObraService);
  private readonly obras = inject(ObrasService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly rh = inject(RhService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly copiloto = inject(CopilotoPainelService);
  private readonly quadro = viewChild<FechamentoQuadroComponent>('quadro');
  private readonly calendario = viewChild<FechamentoCalendarioComponent>('calendario');

  private readonly permissoes = inject(AuthService).currentUser()?.permissoes ?? [];
  protected readonly podeCriar = this.permissoes.includes('obras:fechamento:create');

  private readonly rota = inject(ActivatedRoute).snapshot;
  protected readonly visao: Visao = lerVisao(this.rota.data['modo']);
  /** Uma chave só: o recorte acompanha a troca de visualização. */
  protected readonly chave = 'obras-fechamento-v3';
  protected readonly visoes = VISOES;
  protected readonly atalhosStatus = ATALHOS;
  protected readonly emAberto = ATALHO_EM_ABERTO;
  protected readonly opcoesTipo = OPCOES_TIPO;
  protected readonly opcoesPrazo = OPCOES_PRAZO;
  protected readonly opcoesSituacaoObra = OPCOES_SITUACAO_OBRA;
  protected readonly opcoesPendencia: GeoSelectOption<boolean>[] = [
    { label: 'Com pendência', value: true },
    { label: 'Sem pendência', value: false }
  ];
  protected readonly tipo = tipoFechamento;
  protected readonly iconeTipo = iconeTipo;
  protected readonly sit = (s: SituacaoFechamento) => SITUACOES[s];
  protected readonly obra = (r: FechamentoResumo) => rotuloObra(r.obra);
  protected readonly pessoa = nomePessoa;
  protected readonly semColaborador = (r: FechamentoResumo) => !r.solicitante?.nome;
  protected readonly prazo = prazo;
  protected readonly textoPrazo = textoPrazo;
  protected readonly dataLocal = dataLocal;

  protected readonly criacaoAberta = signal(false);
  protected readonly importacaoAberta = signal(false);
  protected readonly exportacaoAberta = signal(false);
  protected readonly idObraInicial = this.rota.queryParamMap.get('novaParaObra');
  protected readonly detalheAberto = signal(false);
  protected readonly idDetalhe = signal<string | null>(null);
  protected readonly abaDetalhe = signal<AbaFechamento>('itens');

  private readonly obrasLista = signal<{ id: string; numero: string; titulo: string }[]>([]);
  private readonly almoxarifados = signal<{ id: string; nome: string }[]>([]);
  private readonly solicitantes = signal<{ id: string; nome: string | null }[]>([]);
  private readonly supervisores = signal<{ id: string; nome: string; idCoordenador: string; nomeCoordenador: string }[]>([]);

  protected readonly opcoesObra = computed<GeoSelectOption<string>[]>(() =>
    this.obrasLista().map((o) => ({ label: `${o.numero} · ${o.titulo}`, value: o.id }))
  );
  protected readonly opcoesAlmoxarifado = computed<GeoSelectOption<string>[]>(() => this.almoxarifados().map((a) => ({ label: a.nome, value: a.id })));
  protected readonly opcoesSolicitante = computed<GeoSelectOption<string>[]>(() =>
    this.solicitantes().map((s) => ({ label: s.nome ?? SEM_COLABORADOR, value: s.id }))
  );
  protected readonly opcoesSupervisor = computed<GeoSelectOption<string>[]>(() =>
    this.supervisores().map((s) => ({ label: s.nome, value: s.id }))
  );
  protected readonly opcoesCoordenador = computed<GeoSelectOption<string>[]>(() => {
    const vistos = new Map<string, string>();
    this.supervisores().forEach((s) => vistos.set(s.idCoordenador, s.nomeCoordenador));
    return [...vistos.entries()].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly lista = geoListState({
    storageKey: this.chave,
    filters: {
      minhas: geoFilter.value<boolean>(false, { label: 'Escopo', format: (v): string | null => (v ? 'Só as minhas' : null) }),
      obra: geoFilter.value<string | null>(null, { label: 'Obra', format: (id): string | null => (id ? this.rotuloDe(this.opcoesObra(), id) : null) }),
      tipos: geoFilter.list<TipoFechamento>([], { label: 'Tipo' }),
      situacao: geoFilter.value<string | null>(null, { label: 'Situação', format: (s): string | null => (s ? (atalhoFechamento(s)?.atalho ?? s) : null) }),
      prazo: geoFilter.value<Prazo | null>(null, { label: 'Prazo', type: 'string', options: () => OPCOES_PRAZO }),
      pendencia: geoFilter.value<boolean | null>(null, { label: 'Pendência', type: 'boolean', options: () => this.opcoesPendencia }),
      almoxarifado: geoFilter.value<string | null>(null, { label: 'Almoxarifado', format: (id): string | null => (id ? this.rotuloDe(this.opcoesAlmoxarifado(), id) : null) }),
      solicitante: geoFilter.value<string | null>(null, { label: 'Solicitante', format: (id): string | null => (id ? this.rotuloDe(this.opcoesSolicitante(), id) : null) }),
      supervisor: geoFilter.value<string | null>(null, { label: 'Supervisor', format: (id): string | null => (id ? this.rotuloDe(this.opcoesSupervisor(), id) : null) }),
      coordenador: geoFilter.value<string | null>(null, { label: 'Coordenador', format: (id): string | null => (id ? this.rotuloDe(this.opcoesCoordenador(), id) : null) }),
      situacaoObra: geoFilter.value<SituacaoFechamentoObra | null>(null, { label: 'Encerramento da obra', type: 'string', options: () => OPCOES_SITUACAO_OBRA }),
      reserva: geoFilter.value<string>('', { label: 'Reserva' }),
      periodo: geoFilter.range({ from: null, to: null }, { label: 'Criação' })
    },
    sort: [{ key: 'solicitacao', direction: 'desc' }]
  });

  protected readonly resultado = this.lista.results<FechamentoResumo>(
    (pedido) =>
      this.visao !== 'tabela'
        ? of({ content: [], page: { size: 0, number: 0, totalElements: 0, totalPages: 0 } })
        : this.service.listar({
            ...this.filtro(),
            ordenacao: (pedido.sort[0]?.key as FechamentoFiltro['ordenacao']) ?? 'solicitacao',
            direcao: pedido.sort[0]?.direction ?? 'desc',
            page: pedido.page,
            size: pedido.size
          }),
    { errorMessage: getErrorMessage }
  );

  protected readonly atalhoAplicado = computed(() => this.lista.applied().situacao);

  /** Recorte aplicado para o quadro e o calendário (sem paginação). */
  protected readonly filtroVisao = computed(
    () => {
      this.lista.applied();
      return this.filtro();
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

  /** Contagem de cada atalho no recorte, ignorando o atalho escolhido (o número não some ao filtrar). */
  protected readonly contagens = signal<Partial<Record<string, number>>>({});
  protected readonly contagemTotal = signal<number | null>(null);
  private readonly versaoContagens = signal(0);

  /** O que a Bússola recebe: o recorte em tela e a contagem de cada situação. */
  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const f = this.lista.applied();
    const c = this.contagens();
    const situacoes = ATALHOS.filter((a) => c[a.value] !== undefined);
    return {
      id: 'obras.fechamento',
      nome: 'Encerramento de obras',
      modulo: 'Obras',
      descricao: 'Solicitações para regularizar o saldo da obra no SAP: adições (221/921) e devoluções (222/922). O técnico registra a reserva e o almoxarifado marca como movimentado, cada um com 48 horas úteis.',
      rota: VISOES.find((v) => v.value === this.visao)!.rota,
      periodo: periodoPainel(f.periodo.from ? dataLocal(f.periodo.from) : null, f.periodo.to ? dataLocal(f.periodo.to) : null),
      filtros: [
        filtroPainel('situacao', 'Situação', atalhoFechamento(f.situacao)?.atalho, f.situacao),
        filtroPainel('obra', 'Obra', f.obra ? this.rotuloDe(this.opcoesObra(), f.obra) : null, f.obra),
        filtroPainel('tipos', 'Tipo', f.tipos, f.tipos),
        filtroPainel('prazo', 'Prazo', OPCOES_PRAZO.find((o) => o.value === f.prazo)?.label, f.prazo),
        filtroPainel('almoxarifado', 'Almoxarifado', f.almoxarifado ? this.rotuloDe(this.opcoesAlmoxarifado(), f.almoxarifado) : null, f.almoxarifado),
        filtroPainel('supervisor', 'Supervisor', f.supervisor ? this.rotuloDe(this.opcoesSupervisor(), f.supervisor) : null, f.supervisor),
        filtroPainel('coordenador', 'Coordenador', f.coordenador ? this.rotuloDe(this.opcoesCoordenador(), f.coordenador) : null, f.coordenador),
        filtroPainel('escopo', 'Escopo', f.minhas ? 'Só as minhas' : null)
      ],
      metricas: [
        metricaPainel('emAberto', 'Em aberto (reserva ou movimentação pendente)', c[ATALHO_EM_ABERTO.value], 'inteiro'),
        ...situacoes.map((a) => metricaPainel(`situacao.${a.value}`, a.atalho, c[a.value], 'inteiro'))
      ],
      graficos: situacoes.length
        ? [graficoPainel('porSituacao', 'rosca', 'Solicitações por situação', situacoes.map((a) => a.atalho), situacoes.map((a) => c[a.value] ?? 0), { metrica: 'solicitações', dimensao: 'situação', formato: 'inteiro' })]
        : [],
      datasets: ['solicitacoes', 'itens_solicitacao', 'operacoes_solicitacao', 'historico_solicitacoes', 'materiais', 'estoques'],
      sugestoes: [
        { rotulo: 'Priorizar a fila', icone: 'pi pi-clock', requer: ['dados'], pergunta: 'Quais solicitações de encerramento deste recorte estão mais perto de vencer o prazo e devem ser tratadas primeiro?' },
        { rotulo: 'Reservas pendentes', icone: 'pi pi-hashtag', requer: ['dados'], pergunta: 'Quais solicitações de encerramento deste recorte ainda estão sem reserva, em quais obras e há quanto tempo?' },
        { rotulo: 'Pendências abertas', icone: 'pi pi-flag', requer: ['dados'], pergunta: 'Resuma as pendências abertas nas solicitações de encerramento deste recorte, agrupadas por motivo.' }
      ]
    };
  });

  protected readonly colunas: GeoDataTableColumn<FechamentoResumo>[] = [
    { key: 'solicitacao', header: 'Solicitação', type: 'custom', priority: 1, sortField: 'solicitacao', value: (r) => r.criadaEm },
    { key: 'obra', header: 'Obra', type: 'custom', priority: 1, sortField: 'obra', value: (r) => rotuloObra(r.obra) },
    { key: 'tipo', header: 'Tipo', type: 'custom', priority: 1, width: '6rem', sortField: 'tipo', value: (r) => r.tipo },
    { key: 'almoxarifado', header: 'Almoxarifado', sortField: 'almoxarifado', value: (r) => r.almoxarifadoAtendimento?.nome, display: (r) => formatarAlmoxarifado(r.almoxarifadoAtendimento?.nome) },
    { key: 'encarregado', header: 'Encarregado', type: 'custom', sortField: 'encarregado', value: (r) => nomePessoa(r.encarregado) },
    { key: 'supervisor', header: 'Supervisor', type: 'custom', sortField: 'supervisor', value: (r) => nomePessoa(r.supervisor) },
    { key: 'coordenador', header: 'Coordenador', type: 'custom', priority: 3, sortField: 'coordenador', value: (r) => nomePessoa(r.coordenador) },
    { key: 'solicitante', header: 'Solicitante', type: 'custom', sortField: 'solicitante', value: (r) => nomePessoa(r.solicitante) },
    { key: 'prazo', header: 'Prazo', type: 'custom', priority: 1, sortField: 'prazo', value: (r) => r.prazoVigente.limite, display: (r) => textoPrazo(r.situacao, r.prazoVigente) },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, sortField: 'situacao', value: (r) => SITUACOES[r.situacao].label },
    { key: 'reserva', header: 'Reserva', type: 'custom', sortField: 'reserva', value: (r) => r.numeroReserva },
    { key: 'itens', header: 'Itens', type: 'integer', sortField: 'itens', value: (r) => r.totalItens }
  ];
  protected readonly rotulo = (r: FechamentoResumo) => `Encerramento ${r.tipo} da obra ${r.obra.numero ?? ''}`;

  constructor() {
    const aviso = (nome: string) => () => this.notificacoes.warning(`Não foi possível carregar ${nome} para os filtros.`);
    this.obras.listarObras({ ativo: true, size: 1000, sort: 'numero,asc' }).subscribe({
      next: (r) => this.obrasLista.set((r.content ?? []).map((o) => ({ id: o.id, numero: o.numero, titulo: o.titulo }))),
      error: aviso('as obras')
    });
    this.almoxarifado.listarEstoquesAtivos().subscribe({
      next: (r) => this.almoxarifados.set((r.content ?? []).map((e) => ({ id: e.id, nome: e.nomeIdentificador }))),
      error: aviso('os almoxarifados')
    });
    this.service.solicitantes().subscribe({ next: (r) => this.solicitantes.set(r), error: aviso('os solicitantes') });
    this.rh.listarSupervisoresAtivosMin().subscribe({
      next: (r) => this.supervisores.set(r.map((s) => ({ id: s.id, nome: s.nomeColaborador, idCoordenador: s.idCoordenador, nomeCoordenador: s.nomeCoordenador }))),
      error: () => undefined
    });

    const consultaContagens = computed(
      () => {
        this.lista.applied();
        return { filtro: this.filtro(false), versao: this.versaoContagens() };
      },
      { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );
    toObservable(consultaContagens)
      .pipe(
        switchMap(({ filtro }) =>
          forkJoin([
            this.contar(filtro).pipe(map((n) => ['__TOTAL__', n] as const)),
            ...CONTADOS.map((a) => this.contar(comAtalho(filtro, a)).pipe(map((n) => [a.value, n] as const)))
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

    const nova = this.rota.queryParamMap.get('nova') === '1';
    if ((nova || this.idObraInicial) && this.podeCriar) this.criacaoAberta.set(true);
    const abrir = this.rota.queryParamMap.get('abrir');
    if (abrir) this.abrirDetalhe(abrir);
  }

  private contar(filtro: FechamentoFiltro) {
    return this.service.listar({ ...filtro, page: 0, size: 1 }).pipe(
      map((r) => r.page?.totalElements ?? 0),
      catchError(() => of(null))
    );
  }

  /** Recorte no formato do backend; `atalho = false` ignora o atalho de status (para as contagens). */
  private filtro(atalho = true): FechamentoFiltro {
    const { filters: f, query } = this.lista.request();
    const base: FechamentoFiltro = {
      minhas: f.minhas || undefined,
      idSolicitante: f.minhas ? undefined : (f.solicitante ?? undefined),
      idObra: f.obra ?? undefined,
      tipos: f.tipos.length ? [...f.tipos] : undefined,
      prazo: f.prazo ?? undefined,
      comPendencia: f.pendencia ?? undefined,
      idAlmoxarifado: f.almoxarifado ?? undefined,
      idSupervisor: f.supervisor ?? undefined,
      idCoordenador: f.coordenador ?? undefined,
      situacaoObra: f.situacaoObra ?? undefined,
      reserva: f.reserva.trim() || undefined,
      criadaDe: f.periodo.from ?? undefined,
      criadaAte: f.periodo.to ?? undefined,
      busca: query?.trim() || undefined
    };
    const escolhido = atalho ? atalhoFechamento(f.situacao) : undefined;
    return escolhido ? comAtalho(base, escolhido) : base;
  }

  private rotuloDe(opcoes: GeoSelectOption<string>[], id: string): string {
    return opcoes.find((o) => o.value === id)?.label ?? 'selecionado';
  }

  protected escopo(minhas: boolean): void {
    this.lista.filters.minhas.set(minhas);
    if (minhas) this.lista.filters.solicitante.set(null);
    this.lista.apply();
  }

  protected definirAtalho(valor: string | null): void {
    this.lista.set('situacao', valor);
  }

  /** Um atalho de cada vez (como abas): clicar de novo volta para "Todas". */
  protected alternarAtalho(valor: string): void {
    this.definirAtalho(this.atalhoAplicado() === valor ? null : valor);
  }

  protected trocarVisao(visao: Visao): void {
    if (visao === this.visao) return;
    void this.router.navigate([VISOES.find((v) => v.value === visao)!.rota], { queryParams: this.lista.queryParams() });
  }

  protected periodo(ponta: 'from' | 'to', data: Date | null): void {
    const atual = this.lista.filters.periodo();
    const valor = dataIso(data);
    if (atual[ponta] !== valor) this.lista.filters.periodo.set({ ...atual, [ponta]: valor });
  }

  protected abrir(linha: FechamentoResumo): void {
    this.abrirDetalhe(linha.id);
  }

  /** Reserva e movimentação são abas do painel, sem sair da lista, do quadro ou do calendário. */
  protected executar(item: FechamentoResumo, acao: AcaoFechamento): void {
    this.abrirDetalhe(item.id, acao === 'RESERVA' ? 'reserva' : 'movimentar');
  }

  private abrirDetalhe(id: string, aba: AbaFechamento = 'itens'): void {
    // Abaixo de 1280px a Bússola sobrepõe a tela: não deixa os dois painéis empilhados.
    if (typeof matchMedia === 'function' && !matchMedia('(min-width: 1280px)').matches) this.copiloto.fechar();
    // Reabrir a mesma solicitação em outra aba: fecha e abre para o efeito do painel rodar de novo.
    if (this.detalheAberto() && this.idDetalhe() === id) this.detalheAberto.set(false);
    this.abaDetalhe.set(aba);
    this.idDetalhe.set(id);
    setTimeout(() => this.detalheAberto.set(true));
  }

  protected imprimirRelatorio(item: FechamentoResumo): void {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/obras/encerramento', item.id], { queryParams: { mode: 'print' } }));
    window.open(url, '_blank', 'noopener');
  }

  protected aoAlterar(): void {
    this.versaoContagens.update((v) => v + 1);
    if (this.visao === 'kanban') this.quadro()?.recarregar();
    else if (this.visao === 'calendario') this.calendario()?.recarregar();
    else this.lista.reload();
  }

  protected aoCriar(ids: string[]): void {
    this.aoAlterar();
    if (ids.length === 1) this.abrirDetalhe(ids[0]);
  }
}

function lerVisao(modo: unknown): Visao {
  return modo === 'kanban' || modo === 'calendario' ? modo : 'tabela';
}

/** O atalho define a situação; o de atrasadas define o prazo e vale sobre o filtro do painel. */
function comAtalho(filtro: FechamentoFiltro, atalho: AtalhoFechamento): FechamentoFiltro {
  return { ...filtro, situacoes: atalho.situacoes, prazo: atalho.prazo ?? filtro.prazo };
}
