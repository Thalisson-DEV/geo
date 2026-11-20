import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { bindDrawerToUrl } from '../../../core/navigation';
import { DevolucaoTecnicaFormComponent } from '../../almoxarifado/solicitacoes-material/devolucao-tecnica-form/devolucao-tecnica-form.component';
import { NovaSolicitacaoTecnicaDrawerComponent } from '../../almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao-tecnica-drawer.component';
import { ObraFormComponent } from '../form/obra-form.component';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoImportDrawerComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoNumberInputComponent,
  GeoPageHeaderComponent,
  GeoRowAction,
  GeoRowActionsComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoImportStatus,
  geoListState
} from '@geo/ui';

import {
  ImportacaoStatus,
  IndicadoresCarteiraResponse,
  ObraFilter,
  ObraImportacaoDTO,
  ObraResumoResponse,
  PRIORIDADES_OBRA,
  PrioridadeObra,
  StatusObraResponse
} from '../../../core/models/obras.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ResumoPlanejamentoObra } from '../../../core/models/obras-programacao.models';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasProgramacaoService } from '../../../core/services/obras-programacao.service';
import { formatarNumero } from '../programacao/programacao.logic';
import { ContratoService } from '../../../core/services/contrato.service';
import { ObrasService } from '../../../core/services/obras.service';
import { RhService } from '../../../core/services/rh.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { ImportacaoPlanilhaObrasComponent } from '../importacao/importacao-planilha-obras.component';
import { COLUNAS_CARTEIRA, COLUNAS_ORCAMENTO, fonteCarteira, fonteOrcamento } from '../importacao/importacoes-obras';
import { ObrasKitService } from '../../../core/services/obras-kit.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { SituacaoFechamentoObra } from '../../../core/models/fechamento-obra.models';
import { SITUACOES_OBRA } from '../fechamento/fechamento-ui';
import { formatarDataParaApi, formatarMoeda, parseDataBrParaDate, sanitizarNumeroObra, sanitizarTituloObra, statusIcon, statusTone } from '../obras-ui';

export type ObraImportRow = ObraImportacaoDTO & { editing?: boolean };

type Lookup = 'status' | 'processos' | 'bases' | 'municipios' | 'centros' | 'supervisores' | 'coordenadores' | 'agentes';
type CampoImportacao = 'nomeStatus' | 'nomeProcesso' | 'nomeBaseOperacional' | 'nomeMunicipio' | 'nomeCentroCusto' | 'nomeSupervisor' | 'nomeCoordenador' | 'nomeAgenteResponsavel';

/** Colunas da pré-visualização que se corrigem escolhendo um cadastro (o backend casa pelo nome). */
const SELECOES_IMPORTACAO: { key: string; campo: CampoImportacao; header: string; lookup: Lookup }[] = [
  { key: 'processo', campo: 'nomeProcesso', header: 'Processo', lookup: 'processos' },
  { key: 'base', campo: 'nomeBaseOperacional', header: 'Base', lookup: 'bases' },
  { key: 'municipio', campo: 'nomeMunicipio', header: 'Município', lookup: 'municipios' },
  { key: 'centro', campo: 'nomeCentroCusto', header: 'Centro de custo', lookup: 'centros' },
  { key: 'supervisor', campo: 'nomeSupervisor', header: 'Supervisor', lookup: 'supervisores' },
  { key: 'coordenador', campo: 'nomeCoordenador', header: 'Coordenador', lookup: 'coordenadores' },
  { key: 'statusObra', campo: 'nomeStatus', header: 'Status da obra', lookup: 'status' },
  { key: 'agente', campo: 'nomeAgenteResponsavel', header: 'Agente', lookup: 'agentes' }
];
const PRINCIPAIS: GeoSelectOption<boolean | null>[] = [
  { label: 'Obras e subprojetos', value: null },
  { label: 'Só obras principais', value: true }
];
const FORMATOS: GeoSelectOption<'resumo' | 'detalhado'>[] = [
  { label: 'Listagem resumida', value: 'resumo' },
  { label: 'Relatório completo', value: 'detalhado' }
];
const ISO_PARA_BR = (iso: string | null) => formatarDataParaApi(dataLocal(iso));

@Component({
  selector: 'app-obras-lista',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .geo-kpis {
      margin-bottom: 1rem;
    }

    /* O título é a coluna de leitura da carteira: não deixa a tabela larga espremer em várias linhas. */
    .obra-planejado,
    .obra-sub {
      white-space: nowrap;
    }
    .obra-sub { display: block; font-size: var(--geo-font-caption); }

    .obra-encerramento { display: inline-flex; margin-top: 0.25rem; padding: 0; border: 0; background: none; cursor: pointer; border-radius: var(--geo-radius-sm); }
    .obra-encerramento:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    /* Título em uma linha; o texto completo fica no title da célula. */
    .obra-titulo {
      display: block;
      min-width: 16rem;
      max-width: 20rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .importacao-opcoes {
      display: grid;
      gap: 0.5rem;
    }
  `,
  imports: [
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    ObraFormComponent,
    DevolucaoTecnicaFormComponent,
    NovaSolicitacaoTecnicaDrawerComponent,
    GeoIconButtonComponent,
    GeoImportDrawerComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoRowActionsComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    AjudaListagemComponent,
    ImportacaoPlanilhaObrasComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="podeEscrever" (newRequested)="novaObra()">
      <geo-page-header
        title="Obras e projetos"
        icon="pi pi-building"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Gestão de obras e projetos' }]"
        description="Carteira de obras: status, responsáveis, prazos e valor do projeto. Clique na linha para abrir a ficha da obra."
        helpLabel="Ajuda sobre obras"
        (help)="ajuda.show()"
      >
        @if (podeExportar) {
          <geo-button actions variant="outline" icon="pi pi-download" label="Exportar CSV" (pressed)="exportacaoAberta.set(true)"></geo-button>
        }
        @if (podeImportar) {
          <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="escolhaImportacaoAberta.set(true)"></geo-button>
        }
        @if (podeEscrever) {
          <geo-button actions icon="pi pi-plus" label="Nova obra" [keyShortcut]="atalhos.newShortcut()" (pressed)="novaObra()"></geo-button>
        }
      </geo-page-header>

      <geo-filter-panel #painel storageKey="obras-lista" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="Número" [(value)]="lista.filters.numero" placeholder="Ex.: 1228694"></geo-text-input>
          <geo-text-input label="Título" [(value)]="lista.filters.titulo"></geo-text-input>
          <geo-text-input label="Nota da obra" [(value)]="lista.filters.notaObra"></geo-text-input>
          <geo-multiselect label="Status" [options]="opcoes('status')" [(value)]="lista.filters.status" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Processo" [options]="opcoes('processos')" [(value)]="lista.filters.processo" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Base operacional" [options]="opcoes('bases')" [(value)]="lista.filters.base" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Município" [options]="opcoes('municipios')" [(value)]="lista.filters.municipio" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Centro de custo" [options]="opcoes('centros')" [(value)]="lista.filters.centroCusto" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Supervisor" [options]="opcoes('supervisores')" [(value)]="lista.filters.supervisor" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Coordenador" [options]="opcoes('coordenadores')" [(value)]="lista.filters.coordenador" placeholder="Todos"></geo-multiselect>
          <geo-select label="Agente responsável" [options]="opcoes('agentes')" [(value)]="lista.filters.agente" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-select label="Hierarquia" [options]="principais" [(value)]="lista.filters.apenasPrincipais"></geo-select>
          <geo-datepicker label="Início a partir de" [value]="dataLocal(lista.filters.inicio().from)" [clearable]="true" (valueChange)="periodo('inicio', 'from', $event)"></geo-datepicker>
          <geo-datepicker label="Início até" [value]="dataLocal(lista.filters.inicio().to)" [clearable]="true" (valueChange)="periodo('inicio', 'to', $event)"></geo-datepicker>
          <geo-datepicker label="Previsão de fim a partir de" [value]="dataLocal(lista.filters.previsaoFim().from)" [clearable]="true" (valueChange)="periodo('previsaoFim', 'from', $event)"></geo-datepicker>
          <geo-datepicker label="Previsão de fim até" [value]="dataLocal(lista.filters.previsaoFim().to)" [clearable]="true" (valueChange)="periodo('previsaoFim', 'to', $event)"></geo-datepicker>
          <geo-number-input label="Valor mínimo" mode="currency" [min]="0" [(value)]="lista.filters.valorMin"></geo-number-input>
          <geo-number-input label="Valor máximo" mode="currency" [min]="0" [(value)]="lista.filters.valorMax"></geo-number-input>
        </div>
      </geo-filter-panel>

      <section class="geo-kpis" aria-label="Indicadores do recorte" aria-live="polite">
        <div class="geo-kpi" data-tone="info">
          <span class="geo-kpi__icon"><i class="pi pi-building" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Obras no recorte</span>
            <span class="geo-kpi__value">{{ indicador('quantidade') }}</span>
            <span class="geo-kpi__detail">{{ indicador('municipios') }}</span></span>
        </div>
        <div class="geo-kpi" data-tone="neutral">
          <span class="geo-kpi__icon"><i class="pi pi-wallet" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Valor de projeto</span><span class="geo-kpi__value">{{ indicador('valorProjeto') }}</span></span>
        </div>
        <div class="geo-kpi" data-tone="neutral">
          <span class="geo-kpi__icon"><i class="pi pi-box" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Material previsto</span><span class="geo-kpi__value">{{ indicador('valorMaterialPrevisto') }}</span></span>
        </div>
        <div class="geo-kpi" data-tone="neutral">
          <span class="geo-kpi__icon"><i class="pi pi-wrench" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Serviço previsto</span><span class="geo-kpi__value">{{ indicador('valorServicoPrevisto') }}</span></span>
        </div>
      </section>

      <geo-data-table
        title="Obras"
        mode="server"
        storageKey="obras-lista"
        searchPlaceholder="Número, título ou nota"
        rowActionLabel="Abrir ficha"
        rowActionIcon="pi pi-external-link"
        [emptyActionLabel]="podeEscrever ? 'Nova obra' : undefined"
        noResultsTitle="Nenhuma obra encontrada com esse recorte."
        [textFit]="ajusteTexto"
        [hiddenColumns]="colunasOcultasPadrao"
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as obras' : 'Nenhuma obra cadastrada'"
        [stateDescription]="resultado.error() ?? 'Cadastre uma obra ou importe uma planilha.'"
        [filtered]="lista.filtered()"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        [(query)]="lista.query"
        (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novaObra()"
        (rowActivate)="visualizarObra($event)"
      >
        <ng-template geoCell="numero" let-row>
          <span class="geo-cell-strong">{{ row.numero }}</span>
          @if (row.obraPaiNumero) {
            <span class="geo-cell-muted obra-sub" [title]="'Subprojeto da obra ' + row.obraPaiNumero"><i class="pi pi-link" aria-hidden="true"></i> sub. de {{ row.obraPaiNumero }}</span>
          }
        </ng-template>
        <ng-template geoCell="titulo" let-row><span class="obra-titulo" [title]="row.titulo">{{ row.titulo }}</span></ng-template>
        <ng-template geoCell="status" let-row>
          <geo-status [tone]="statusTone(row.statusNome, row.statusConcluida)" [icon]="statusIcon(row.statusNome)">{{ row.statusNome }}</geo-status>
          @if (encerramentoDe(row); as enc) {
            <button type="button" class="obra-encerramento" [title]="'Ver o encerramento da obra ' + row.numero" (click)="verEncerramento(row); $event.stopPropagation()">
              <geo-status [tone]="enc.tone" [icon]="enc.icon">{{ enc.label }}</geo-status>
            </button>
          }
        </ng-template>
        <ng-template geoCell="planejado" let-row>
          @if (resumoDe(row); as r) {
            @if (r.temKits) {
              <strong>{{ moedaResumo(r.valorTotal) }}</strong>
              <span class="geo-cell-muted obra-planejado">{{ numeroResumo(r.percentualProgramado) }}% prog. · {{ numeroResumo(r.percentualConcluido) }}% concl.@if (r.pontosSemKit) { · {{ r.pontosSemKit }} sem kit }</span>
            } @else {
              <span class="geo-cell-muted">Sem kits</span>
            }
          } @else {
            <span class="geo-cell-muted">—</span>
          }
        </ng-template>
        <ng-template geoCell="prazo" let-row>
          <span>{{ row.dataInicio }} → {{ row.dataPrevisaoFim }}</span>
          @if (row.dataFimEfetiva) {
            <span class="geo-cell-muted">Concluída em {{ row.dataFimEfetiva }}</span>
          }
        </ng-template>
        <ng-template geoCell="tensao" let-row>
          @if (row.carteira?.classeTensaoRotulo) {
            {{ row.carteira.classeTensaoRotulo }}
          } @else {
            <span class="geo-cell-muted" title="Classe de tensão não informada">—</span>
          }
        </ng-template>
        <ng-template geoCell="prioridade" let-row>
          @if (row.carteira?.prioridade; as p) {
            <geo-status [tone]="tomPrioridade(p)" [icon]="p === 'URGENTE' ? 'pi-exclamation-circle' : undefined">{{ rotuloPrioridade(p) }}</geo-status>
          } @else {
            <span class="geo-cell-muted">—</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <geo-row-actions [row]="row" [actions]="acoesLinha" [maxVisible]="2" [label]="'Ações da obra ' + row.numero"
            (actionSelected)="executarAcaoLinha($event.action.id, $event.row)"></geo-row-actions>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [visible]="!!obraStatus()" (visibleChange)="!$event && obraStatus.set(null)" title="Alterar status da obra"
      [description]="obraStatus() ? obraStatus()!.numero + ' · ' + obraStatus()!.titulo : undefined" size="sm">
      <geo-select label="Novo status" [required]="true" [options]="opcoes('status')" [(value)]="novoStatusId"></geo-select>
      @if (statusSelecionadoEhConcluido()) {
        <geo-datepicker label="Data de conclusão efetiva" [(value)]="novaDataFimEfetiva" [maxDate]="hoje" [clearable]="true"
          hint="Se ficar em branco, o sistema usa a data de hoje."></geo-datepicker>
      }
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="obraStatus.set(null)"></geo-button>
        <geo-button icon="pi pi-check" label="Salvar status" [disabled]="!novoStatusId()" [loading]="salvandoStatus()" (pressed)="salvarAlteracaoStatus()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-form-drawer [(visible)]="exportacaoAberta" title="Exportar obras (CSV)" description="Exporta o recorte atual da lista, inclusive a busca." size="sm">
      <geo-select label="Formato" [options]="formatos" [(value)]="exportFormato"></geo-select>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="exportacaoAberta.set(false)"></geo-button>
        <geo-button icon="pi pi-download" label="Exportar" [loading]="exportando()" (pressed)="executarExportacao()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar obras"
      description="Planilha CSV com número, título, datas, processo, base, município, centro de custo, supervisor e coordenador."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="numero" let-row>
            @if (row.editing) { <geo-text-input label="Número" [labelVisible]="false" [(value)]="row.numero" [maxlength]="7"></geo-text-input> } @else { {{ row.numero || '—' }} }
          </ng-template>
          <ng-template geoCell="titulo" let-row>
            @if (row.editing) { <geo-text-input label="Título" [labelVisible]="false" [(value)]="row.titulo"></geo-text-input> } @else { {{ row.titulo || '—' }} }
          </ng-template>
          @for (sel of selecoesImportacao; track sel.key) {
            <ng-template [geoCell]="sel.key" let-row>
              @if (row.editing) {
                <geo-select [label]="sel.header" [labelVisible]="false" [options]="nomes(sel.lookup)" [value]="row[sel.campo] ?? null"
                  (valueChange)="row[sel.campo] = $event ?? undefined" [clearable]="true" [filter]="true"></geo-select>
              } @else {
                {{ row[sel.campo] || '—' }}
              }
            </ng-template>
          }
          <ng-template geoCell="situacao" let-row>
            <geo-status [tone]="situacao(row.status).tone" [icon]="situacao(row.status).icon">{{ situacao(row.status).label }}</geo-status>
            @if (row.mensagemErro) {
              <span class="geo-cell-muted">{{ row.mensagemErro }}</span>
            }
          </ng-template>
          <ng-template geoRowActions let-row>
            <span class="geo-table-actions">
              @if (row.editing) {
                <geo-icon-button icon="pi pi-check" [label]="'Concluir correção da linha ' + row.linha" size="icon-sm" (pressed)="finishImportEdit(row)"></geo-icon-button>
              } @else {
                <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir linha ' + row.linha" size="icon-sm" (pressed)="row.editing = true"></geo-icon-button>
                <geo-icon-button icon="pi pi-trash" [label]="'Remover linha ' + row.linha" size="icon-sm" (pressed)="importacao.remover(row)"></geo-icon-button>
              }
            </span>
          </ng-template>
        </geo-data-table>
      }
    </geo-import-drawer>

    <geo-form-drawer [(visible)]="escolhaImportacaoAberta" title="Importar planilha" description="Escolha o que a planilha traz." size="sm">
      <div class="importacao-opcoes">
        <button type="button" class="geo-kpi" (click)="abrirImportacao('obras')">
          <span class="geo-kpi__icon"><i class="pi pi-building" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Cadastro de obras</span>
            <span class="geo-kpi__detail">CSV conferido e corrigido linha a linha antes de gravar.</span></span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
        <button type="button" class="geo-kpi" (click)="abrirImportacao('carteira')">
          <span class="geo-kpi__icon"><i class="pi pi-briefcase" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Carteira do contrato</span>
            <span class="geo-kpi__detail">Cria e atualiza obras pelo número, com tensão, prazos, prioridade e valores previstos.</span></span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
        <button type="button" class="geo-kpi" (click)="abrirImportacao('orcamento')">
          <span class="geo-kpi__icon"><i class="pi pi-calculator" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Serviços e orçamento previstos</span>
            <span class="geo-kpi__detail">Serviços com preço por obra, para comparar com o planejamento.</span></span>
          <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
        </button>
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="escolhaImportacaoAberta.set(false)"></geo-button>
      </div>
    </geo-form-drawer>

    <app-importacao-planilha-obras [(visible)]="importacaoCarteiraAberta" tipo="CARTEIRA" titulo="Importar carteira"
      descricao="Obras existentes são atualizadas pelo número (célula vazia mantém o valor atual); obras novas são criadas. Planejamento, programação e medições não são alterados."
      [colunas]="colunasCarteira" [fonte]="fonteCarteira" [exigeContrato]="true" [contratos]="contratoOpcoes()"
      (processada)="lista.reload()"></app-importacao-planilha-obras>
    <app-importacao-planilha-obras [(visible)]="importacaoOrcamentoAberta" tipo="ORCAMENTO" titulo="Importar serviços e orçamento previstos"
      descricao="Uma linha por serviço, identificada pelo número da obra. Os serviços previstos anteriores de cada obra da planilha são substituídos."
      [colunas]="colunasOrcamento" [fonte]="fonteOrcamento" (processada)="lista.reload()"></app-importacao-planilha-obras>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Obras e projetos" artigoPlural="as" entidadePlural="obras" busca="número, título ou nota da obra"
      rotuloNovo="Nova obra" [podeCriar]="podeEscrever" [importacao]="podeImportar">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-sync"></i> Status</h4>
        <p class="help-text-desc">"Alterar status" muda a etapa da obra; ao concluir, informe a data efetiva (em branco, vale a de hoje).</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-cart-plus"></i> Materiais</h4>
        <p class="help-text-desc">"Solicitar materiais" abre uma solicitação técnica já vinculada à obra, e "Devolver materiais" registra a devolução ao almoxarifado.</p>
      </div>
    </app-ajuda-listagem>

    @if (drawerObra.open() && podeEscrever) {
      <app-obra-form [idObra]="drawerObra.id()" (salva)="lista.reload()" (fechado)="drawerObra.close()"></app-obra-form>
    }
    @if (solicitandoObra(); as idObra) {
      <app-nova-solicitacao-tecnica-drawer [visible]="true" (visibleChange)="!$event && solicitandoObra.set(null)" [idObraInicial]="idObra" (criada)="lista.reload()" />
    }
    @if (devolvendoObra(); as idObra) {
      <app-devolucao-tecnica-form [idObra]="idObra" (fechado)="devolvendoObra.set(null)"></app-devolucao-tecnica-form>
    }
  `
})
export class ObrasListComponent {
  private readonly service = inject(ObrasService);
  private readonly contratos = inject(ContratoService);
  private readonly rh = inject(RhService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  private readonly permissoes = this.auth.currentUser()?.permissoes ?? [];
  protected readonly podeEscrever = this.permissoes.includes('obras:obra:write');
  protected readonly podeImportar = this.permissoes.includes('obras:obra:import');
  protected readonly podeDevolver = this.permissoes.includes('estoque:movimentacao:write');
  protected readonly podeExportar = this.permissoes.includes('obras:obra:export');

  protected readonly statusTone = statusTone;
  protected readonly statusIcon = statusIcon;
  protected readonly dataLocal = dataLocal;
  protected readonly principais = PRINCIPAIS;
  protected readonly formatos = FORMATOS;
  protected readonly hoje = new Date();

  /** Cadastros dos filtros e da correção da importação, como `{ id, nome }`. */
  private readonly cadastros = signal<Record<Lookup, { id: string; nome: string }[]>>({
    status: [], processos: [], bases: [], municipios: [], centros: [], supervisores: [], coordenadores: [], agentes: []
  });
  private readonly statusObras = signal<StatusObraResponse[]>([]);

  protected readonly lista = geoListState({
    storageKey: 'obras-lista',
    filters: {
      numero: geoFilter.value<string>('', { label: 'Número' }),
      titulo: geoFilter.value<string>('', { label: 'Título' }),
      notaObra: geoFilter.value<string>('', { label: 'Nota' }),
      status: geoFilter.list<string>([], { label: 'Status', itemLabel: (id) => this.nome('status', id) }),
      processo: geoFilter.list<string>([], { label: 'Processo', itemLabel: (id) => this.nome('processos', id) }),
      base: geoFilter.list<string>([], { label: 'Base', itemLabel: (id) => this.nome('bases', id), countLabel: (n) => `${n} selecionadas` }),
      municipio: geoFilter.list<string>([], { label: 'Município', itemLabel: (id) => this.nome('municipios', id) }),
      centroCusto: geoFilter.list<string>([], { label: 'Centro de custo', itemLabel: (id) => this.nome('centros', id) }),
      supervisor: geoFilter.list<string>([], { label: 'Supervisor', itemLabel: (id) => this.nome('supervisores', id) }),
      coordenador: geoFilter.list<string>([], { label: 'Coordenador', itemLabel: (id) => this.nome('coordenadores', id) }),
      agente: geoFilter.value<string | null>(null, { label: 'Agente', format: (id): string | null => (id ? this.nome('agentes', id) : null) }),
      apenasPrincipais: geoFilter.value<boolean | null>(null, { label: 'Hierarquia', param: 'principais', options: () => PRINCIPAIS }),
      inicio: geoFilter.range({ from: null, to: null }, { label: 'Início' }),
      previsaoFim: geoFilter.range({ from: null, to: null }, { label: 'Previsão de fim' }),
      valorMin: geoFilter.value<number | null>(null, { label: 'Valor mínimo', type: 'number' }),
      valorMax: geoFilter.value<number | null>(null, { label: 'Valor máximo', type: 'number' })
    },
    sort: [{ key: 'prazo', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<ObraResumoResponse>(
    (pedido) => this.service.listarObras({ ...this.filtro(), page: pedido.page, size: pedido.size, sort: pedido.sort.map((r) => `${r.key},${r.direction}`)[0] }),
    { errorMessage: getErrorMessage }
  );

  /** Carteira larga (18 colunas): texto em uma linha, o resto no title da célula. */
  protected readonly ajusteTexto = { minColumnWidth: '7.5rem', maxLines: 1 } as const;
  /** Padrão enxuto (10 colunas, valor do projeto logo após o status); o usuário escolhe as demais em "Colunas". */
  protected readonly colunasOcultasPadrao = ['processo', 'centro', 'coordenador', 'tensao', 'prioridade', 'prazoRegulado', 'materialPrevisto', 'servicoPrevisto'];
  protected readonly colunas: GeoDataTableColumn<ObraResumoResponse>[] = [
    { key: 'numero', header: 'Número', type: 'custom', priority: 1, sortField: 'numero', width: '9rem', value: (o) => o.numero, display: (o) => o.numero },
    { key: 'titulo', header: 'Título', type: 'custom', priority: 1, sortField: 'titulo', value: (o) => o.titulo, display: (o) => o.titulo },
    { key: 'nota', header: 'Nota', sortField: 'notaObra', value: (o) => o.notaObra, display: (o) => o.notaObra || '—' },
    { key: 'status', header: 'Status', type: 'custom', priority: 1, sortField: 'status.nome', value: (o) => o.statusNome, display: (o) => o.statusNome },
    { key: 'valor', header: 'Valor do projeto', type: 'currency', sortField: 'valorProjeto', value: (o) => o.valorProjeto },
    { key: 'planejado', header: 'Planejamento', type: 'custom', width: '12rem', value: (o) => this.resumoDe(o)?.valorTotal },
    { key: 'processo', header: 'Processo', sortField: 'processo.nome', value: (o) => o.processoNome, display: (o) => o.processoNome || '—' },
    { key: 'base', header: 'Base', sortField: 'baseOperacional.nome', value: (o) => o.baseOperacionalNome, display: (o) => o.baseOperacionalNome || '—' },
    { key: 'municipio', header: 'Município', sortField: 'municipio.nome', value: (o) => o.municipioNome, display: (o) => o.municipioNome || '—' },
    { key: 'centro', header: 'Centro de custo', sortField: 'centroCusto.nome', value: (o) => o.centroCustoNome, display: (o) => o.centroCustoNome || '—' },
    { key: 'supervisor', header: 'Supervisor', sortField: 'supervisor', value: (o) => o.supervisorNome, display: (o) => o.supervisorNome || '—' },
    { key: 'coordenador', header: 'Coordenador', sortField: 'coordenador', value: (o) => o.coordenadorNome, display: (o) => o.coordenadorNome || '—' },
    { key: 'prazo', header: 'Início → previsão', type: 'custom', sortField: 'dataInicio', value: (o) => o.dataInicio, display: (o) => `${o.dataInicio} → ${o.dataPrevisaoFim}` },
    { key: 'tensao', header: 'Tensão', type: 'custom', sortField: 'classeTensao', width: '7rem', value: (o) => o.carteira?.classeTensao, display: (o) => o.carteira?.classeTensaoRotulo || '—' },
    { key: 'prioridade', header: 'Prioridade', type: 'custom', sortField: 'prioridade', width: '7rem', value: (o) => o.carteira?.prioridade, display: (o) => this.rotuloPrioridade(o.carteira?.prioridade) },
    { key: 'prazoRegulado', header: 'Prazo regulado', sortField: 'prazoRegulado', width: '8rem', value: (o) => o.carteira?.prazoRegulado, display: (o) => o.carteira?.prazoRegulado || '—' },
    { key: 'materialPrevisto', header: 'Material previsto', type: 'currency', sortField: 'valorMaterialPrevisto', value: (o) => o.carteira?.valorMaterialPrevisto },
    { key: 'servicoPrevisto', header: 'Serviço previsto', type: 'currency', sortField: 'valorServicoPrevisto', value: (o) => o.carteira?.valorServicoPrevisto }
  ];
  protected readonly rotulo = (o: ObraResumoResponse) => `Obra ${o.numero}`;

  // Situação do planejamento das obras da página, carregada à parte para não pesar a listagem.
  private readonly programacoes = inject(ObrasProgramacaoService);
  private readonly podeVerPlanejamento = (inject(AuthService).currentUser()?.permissoes ?? []).some((p) => p === 'obras:planejamento:read' || p === 'obras:programacao:read');
  private readonly resumos = signal<ReadonlyMap<string, ResumoPlanejamentoObra>>(new Map());
  private readonly carregaResumos = effect(() => {
    const ids = this.resultado.rows().map((o) => o.id);
    if (!this.podeVerPlanejamento || !ids.length) return;
    untracked(() => this.programacoes.resumos(ids).pipe(catchError(() => of([]))).subscribe((lista) => this.resumos.set(new Map(lista.map((r) => [r.idObra, r])))));
  });
  // Situação do encerramento das obras da página (solicitações para regularizar o material depois de finalizada).
  private readonly encerramentos = inject(FechamentoObraService);
  private readonly podeVerEncerramento = this.permissoes.includes('obras:fechamento:read');
  protected readonly podeCriarEncerramento = this.podeVerEncerramento && this.permissoes.includes('obras:fechamento:create');
  private readonly situacoesEncerramento = signal<Record<string, SituacaoFechamentoObra>>({});
  private readonly carregaEncerramentos = effect(() => {
    const ids = this.resultado.rows().map((o) => o.id);
    if (!this.podeVerEncerramento || !ids.length) return;
    untracked(() => this.encerramentos.situacoesObras(ids).pipe(catchError(() => of({}))).subscribe((s) => this.situacoesEncerramento.set(s)));
  });
  /** Só mostra quando a obra já tem solicitação de encerramento. */
  protected encerramentoDe(obra: ObraResumoResponse) {
    const situacao = this.situacoesEncerramento()[obra.id];
    return situacao && situacao !== 'SEM_SOLICITACOES' ? SITUACOES_OBRA[situacao] : null;
  }
  protected verEncerramento(obra: ObraResumoResponse): void {
    void this.router.navigate(['/obras/encerramento'], { queryParams: { obra: obra.id } });
  }
  protected novoEncerramento(obra: ObraResumoResponse): void {
    void this.router.navigate(['/obras/encerramento'], { queryParams: { obra: obra.id, novaParaObra: obra.id } });
  }

  protected resumoDe(obra: ObraResumoResponse): ResumoPlanejamentoObra | undefined {
    return this.resumos().get(obra.id);
  }
  protected readonly moedaResumo = formatarMoeda;
  protected readonly numeroResumo = formatarNumero;

  // Alteração rápida de status
  protected readonly obraStatus = signal<ObraResumoResponse | null>(null);
  protected readonly novoStatusId = signal<string | null>(null);
  protected readonly novaDataFimEfetiva = signal<Date | null>(null);
  protected readonly salvandoStatus = signal(false);
  protected readonly statusSelecionadoEhConcluido = computed(() => this.statusObras().find((s) => s.id === this.novoStatusId())?.concluida ?? false);

  // Exportação
  protected readonly exportacaoAberta = signal(false);
  protected readonly exportFormato = signal<'resumo' | 'detalhado'>('resumo');
  protected readonly exportando = signal(false);

  // Indicadores do recorte: mesmos filtros e busca da tabela, sem paginação. Recalculam a cada carga da
  // tabela (filtro novo, recarga depois de importar ou alterar uma obra).
  private readonly indicadores = toSignal(
    toObservable(computed(() => ({ recorte: JSON.stringify(this.filtro()), linhas: this.resultado.rows() }))).pipe(
      debounceTime(250),
      distinctUntilChanged((a, b) => a.recorte === b.recorte && a.linhas === b.linhas),
      switchMap(({ recorte }) =>
        this.service.indicadoresCarteira(JSON.parse(recorte) as ObraFilter).pipe(
          map((i): IndicadoresCarteiraResponse | 'erro' => i),
          catchError(() => of('erro' as const)),
          startWith(null)
        )
      )
    ),
    { initialValue: null }
  );

  // Importações: cadastro (CSV com pré-visualização), carteira e orçamento (processadas no servidor)
  protected readonly escolhaImportacaoAberta = signal(false);
  protected readonly importacaoCarteiraAberta = signal(false);
  protected readonly importacaoOrcamentoAberta = signal(false);
  private readonly importacoesObras = inject(ObrasKitService);
  protected readonly colunasCarteira = COLUNAS_CARTEIRA;
  protected readonly colunasOrcamento = COLUNAS_ORCAMENTO;
  protected readonly fonteCarteira = fonteCarteira(this.importacoesObras);
  protected readonly fonteOrcamento = fonteOrcamento(this.importacoesObras);
  protected readonly contratoOpcoes = toSignal(
    this.contratos.listarContratosAtivos().pipe(
      map((p) => p.content.map((c) => ({ label: `${c.numeroContrato} · ${c.cliente}`, value: c.id }))),
      catchError(() => of([] as GeoSelectOption<string>[]))
    ),
    { initialValue: [] as GeoSelectOption<string>[] }
  );
  protected readonly importacao = importacaoListagem<ObraImportRow>({
    enviar: (arquivo) => this.service.validarImportacao(arquivo),
    confirmar: (registros) => this.service.confirmarImportacao({ registros }),
    modelo: () =>
      this.service.baixarModeloCsv().subscribe({
        next: (blob) => this.service.baixarArquivoBlob(blob, 'modelo_importacao_obras.csv'),
        error: () => this.notificacoes.error('Não foi possível baixar o modelo CSV de importação.')
      }),
    aoProcessar: () => this.lista.reload()
  });
  protected readonly situacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;
  protected readonly selecoesImportacao = SELECOES_IMPORTACAO;
  protected readonly colunasImportacao: GeoDataTableColumn<ObraImportRow>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'numero', header: 'Número', type: 'custom', priority: 1, value: (r) => r.numero },
    { key: 'titulo', header: 'Título', type: 'custom', priority: 1, value: (r) => r.titulo },
    { key: 'datas', header: 'Início → previsão', value: (r) => r.dataInicio, display: (r) => `${r.dataInicio || '—'} → ${r.dataPrevisaoFim || '—'}` },
    ...SELECOES_IMPORTACAO.map((s): GeoDataTableColumn<ObraImportRow> => ({ key: s.key, header: s.header, type: 'custom', value: (r) => r[s.campo] })),
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  protected readonly drawerObra = bindDrawerToUrl();
  protected readonly solicitandoObra = signal<string | null>(null);
  protected readonly devolvendoObra = signal<string | null>(null);

  constructor() {
    this.drawerObra.connect((modo) => {
      // A URL antiga do cadastro redireciona para cá sem guard: sem permissão, o drawer não abre.
      if (modo && !this.podeEscrever) {
        this.notificacoes.warning('Você não tem permissão para cadastrar ou editar obras.');
        this.drawerObra.close();
      }
    });
    const definir = (chave: Lookup, itens: { id: string; nome: string }[]) => this.cadastros.update((c) => ({ ...c, [chave]: itens }));
    const aviso = (nome: string) => () => this.notificacoes.warning(`Não foi possível carregar ${nome} para os filtros.`);
    this.service.listarStatusAtivos().subscribe({
      next: (r) => {
        this.statusObras.set(r);
        definir('status', r);
      },
      error: aviso('os status de obra')
    });
    this.service.listarAgentesAtivos().subscribe({ next: (r) => definir('agentes', r), error: aviso('os agentes responsáveis') });
    this.rh.listarBasesOperacionaisAtivas().subscribe({ next: (r) => definir('bases', r.content ?? []), error: aviso('as bases operacionais') });
    this.rh.listarProcessosAtivos().subscribe({ next: (r) => definir('processos', r.content ?? []), error: aviso('os processos') });
    this.rh.listarMunicipios({ ativo: true, size: 500, sort: 'nome,asc' }).subscribe({ next: (r) => definir('municipios', r.content ?? []), error: aviso('os municípios') });
    this.rh.listarCentrosFaturamentoAtivos().subscribe({ next: (r) => definir('centros', r.content ?? []), error: aviso('os centros de custo') });
    this.rh.listarSupervisoresAtivosMin().subscribe({
      next: (r) => definir('supervisores', r.map((s) => ({ id: s.id, nome: s.nomeColaborador }))),
      error: aviso('os supervisores')
    });
    this.rh.listarCoordenadoresAtivosMin().subscribe({
      next: (r) => definir('coordenadores', r.map((c) => ({ id: c.id, nome: c.nomeColaborador }))),
      error: aviso('os coordenadores')
    });
  }

  /** Indicador formatado; "…" enquanto carrega e "—" se a consulta falhou. */
  protected indicador(campo: keyof IndicadoresCarteiraResponse): string {
    const atual = this.indicadores();
    if (atual === null) return '…';
    if (atual === 'erro') return '—';
    const valor = atual[campo];
    if (campo === 'quantidade') return valor.toLocaleString('pt-BR');
    if (campo === 'municipios') return `${valor} ${valor === 1 ? 'município' : 'municípios'}`;
    return formatarMoeda(valor);
  }

  protected rotuloPrioridade(p?: PrioridadeObra | null): string {
    return PRIORIDADES_OBRA.find((o) => o.value === p)?.label ?? '—';
  }

  protected tomPrioridade(p: PrioridadeObra): 'neutral' | 'info' | 'warning' | 'danger' {
    return p === 'URGENTE' ? 'danger' : p === 'ALTA' ? 'warning' : p === 'NORMAL' ? 'info' : 'neutral';
  }

  protected abrirImportacao(tipo: 'obras' | 'carteira' | 'orcamento'): void {
    this.escolhaImportacaoAberta.set(false);
    if (tipo === 'obras') this.importacao.aberta.set(true);
    else if (tipo === 'carteira') this.importacaoCarteiraAberta.set(true);
    else this.importacaoOrcamentoAberta.set(true);
  }

  private nome(chave: Lookup, id: string): string {
    return this.cadastros()[chave].find((i) => i.id === id)?.nome ?? 'selecionado';
  }

  protected opcoes(chave: Lookup): GeoSelectOption<string>[] {
    return this.cadastros()[chave].map((i) => ({ label: i.nome, value: i.id }));
  }

  /** Na importação o backend casa os cadastros pelo nome. */
  protected nomes(chave: Lookup): GeoSelectOption<string>[] {
    return this.cadastros()[chave].map((i) => ({ label: i.nome, value: i.nome }));
  }

  protected periodo(filtro: 'inicio' | 'previsaoFim', ponta: 'from' | 'to', data: Date | null): void {
    const atual = this.lista.filters[filtro]();
    this.lista.filters[filtro].set({ ...atual, [ponta]: dataIso(data) });
  }

  /** Recorte aplicado no formato do backend (também usado na exportação). */
  private filtro(): ObraFilter {
    const { filters: f, query } = this.lista.request();
    const lista = (v: string[]) => (v.length ? v : undefined);
    return {
      buscaGlobal: query || undefined,
      numero: f.numero.trim() || undefined,
      titulo: f.titulo.trim() || undefined,
      notaObra: f.notaObra.trim() || undefined,
      statusIds: lista(f.status),
      processoIds: lista(f.processo),
      baseOperacionalIds: lista(f.base),
      municipioIds: lista(f.municipio),
      centroCustoIds: lista(f.centroCusto),
      supervisorIds: lista(f.supervisor),
      coordenadorIds: lista(f.coordenador),
      agenteResponsavelId: f.agente ?? undefined,
      apenasPrincipais: f.apenasPrincipais ?? false,
      dataInicioDe: ISO_PARA_BR(f.inicio.from),
      dataInicioAte: ISO_PARA_BR(f.inicio.to),
      dataPrevisaoFimDe: ISO_PARA_BR(f.previsaoFim.from),
      dataPrevisaoFimAte: ISO_PARA_BR(f.previsaoFim.to),
      valorProjetoMin: f.valorMin ?? undefined,
      valorProjetoMax: f.valorMax ?? undefined,
      ativo: true
    };
  }

  protected novaObra(): void {
    if (this.podeEscrever) this.drawerObra.openNew();
  }

  /** A ficha abre em outra aba para não perder o recorte da carteira. */
  protected visualizarObra(obra: ObraResumoResponse): void {
    window.open(this.router.serializeUrl(this.router.createUrlTree(['/obras', obra.id])), '_blank');
  }

  /** Ações da linha: as duas mais usadas como ícone; o resto no menu "Mais ações". */
  protected readonly acoesLinha: GeoRowAction<ObraResumoResponse>[] = [
    { id: 'materiais', label: 'Solicitar materiais', icon: 'pi pi-cart-plus' },
    { id: 'editar', label: 'Editar obra', icon: 'pi pi-pencil', visible: this.podeEscrever },
    { id: 'status', label: 'Alterar status', icon: 'pi pi-sync', visible: this.podeEscrever },
    { id: 'encerramento', label: 'Solicitar encerramento', icon: 'pi pi-flag', visible: this.podeCriarEncerramento },
    { id: 'devolver', label: 'Devolver materiais', icon: 'pi pi-undo', visible: this.podeDevolver },
    { id: 'historico', label: 'Histórico de alterações', icon: 'pi pi-history' },
    { id: 'desativar', label: 'Desativar obra', icon: 'pi pi-ban', variant: 'destructive', visible: this.podeEscrever }
  ];

  protected executarAcaoLinha(id: string, obra: ObraResumoResponse): void {
    switch (id) {
      case 'materiais': return this.solicitarMateriais(obra);
      case 'editar': return this.editarObra(obra);
      case 'status': return this.abrirAlteracaoStatus(obra);
      case 'encerramento': return this.novoEncerramento(obra);
      case 'devolver': return this.devolvendoObra.set(obra.id);
      case 'historico': return this.showLogs(obra);
      case 'desativar': void this.desativarObra(obra); return;
    }
  }

  protected solicitarMateriais(obra: ObraResumoResponse): void {
    this.solicitandoObra.set(obra.id);
  }

  protected editarObra(obra: ObraResumoResponse): void {
    this.drawerObra.openEdit(obra.id);
  }

  protected showLogs(obra: ObraResumoResponse): void {
    this.auditoria().show(obra.id, 'Obra / Projeto', {
      numero: 'Número da Obra',
      titulo: 'Título',
      notaObra: 'Nota da Obra',
      statusNome: 'Status',
      valorProjeto: 'Valor do Projeto',
      dataInicio: 'Data de Início',
      dataPrevisaoFim: 'Previsão de Término'
    });
  }

  protected abrirAlteracaoStatus(obra: ObraResumoResponse): void {
    this.novoStatusId.set(obra.statusId);
    this.novaDataFimEfetiva.set(obra.dataFimEfetiva ? parseDataBrParaDate(obra.dataFimEfetiva) : null);
    this.obraStatus.set(obra);
  }

  protected salvarAlteracaoStatus(): void {
    const obra = this.obraStatus();
    const status = this.novoStatusId();
    if (!obra || !status || this.salvandoStatus()) return;
    this.salvandoStatus.set(true);
    this.service.alterarStatus(obra.id, status, formatarDataParaApi(this.novaDataFimEfetiva())).subscribe({
      next: (atualizada) => {
        this.salvandoStatus.set(false);
        this.obraStatus.set(null);
        this.notificacoes.success(`A obra ${atualizada.numero} agora está "${atualizada.statusNome}".`);
        this.lista.reload();
      },
      error: (erro) => {
        this.salvandoStatus.set(false);
        this.notificacoes.error(getErrorMessage(erro));
      }
    });
  }

  protected async desativarObra(obra: ObraResumoResponse): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Desativar obra',
      message: `${obra.numero} (${obra.titulo}) deixa de aparecer na carteira. O histórico é mantido.`,
      confirmLabel: 'Desativar',
      variant: 'destructive'
    });
    if (!ok) return;
    this.service.desativarObra(obra.id).subscribe({
      next: () => {
        this.notificacoes.success(`Obra ${obra.numero} desativada.`);
        this.lista.reload();
      },
      error: (erro) => this.notificacoes.error(getErrorMessage(erro))
    });
  }

  protected executarExportacao(): void {
    if (this.exportando()) return;
    const formato = this.exportFormato();
    this.exportando.set(true);
    (formato === 'detalhado' ? this.service.exportarDetalhado(this.filtro()) : this.service.exportarResumo(this.filtro())).subscribe({
      next: (resposta) => {
        this.exportando.set(false);
        this.exportacaoAberta.set(false);
        if (!resposta.body) return;
        this.service.baixarArquivoBlob(resposta.body, `obras_${formato}_${dataIso(new Date())}.csv`);
        this.notificacoes.success(`CSV de obras (${formato}) gerado.`);
      },
      error: (erro) => {
        this.exportando.set(false);
        this.notificacoes.error(getErrorMessage(erro));
      }
    });
  }

  /** Concluir a correção: normaliza número e título e libera a linha se os obrigatórios estão preenchidos. */
  protected finishImportEdit(linha: ObraImportRow): void {
    linha.numero = sanitizarNumeroObra(linha.numero);
    linha.titulo = sanitizarTituloObra(linha.titulo);
    const completa = [linha.numero, linha.titulo, linha.dataInicio, linha.dataPrevisaoFim, linha.nomeProcesso, linha.nomeBaseOperacional,
      linha.nomeMunicipio, linha.nomeCentroCusto, linha.nomeSupervisor, linha.nomeCoordenador].every((v) => !!v);
    if (completa) {
      linha.status = ImportacaoStatus.AGUARDANDO_PROCESSAMENTO;
      linha.mensagemErro = undefined;
    }
    this.importacao.concluirCorrecao(linha);
  }

}
