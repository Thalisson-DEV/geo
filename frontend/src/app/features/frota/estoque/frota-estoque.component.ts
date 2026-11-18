import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
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
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoListState,
  geoUrlParam
} from '@geo/ui';
import {
  AlmoxarifadoFrota,
  MovimentoEstoqueFrota,
  PecaFrota,
  ResumoEstoqueFrota,
  SaldoPecaFrota,
  TIPO_MOVIMENTO,
  TipoMovimentoFrota
} from '../../../core/models/frota-pneu.models';
import { FornecedorFrota, contar, formatarPlaca, rotuloOs } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, OPCOES_CADASTRO, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaEstoqueMovimentoDetalheComponent } from './frota-estoque-movimento-detalhe.component';
import { FrotaEstoqueMovimentoDrawerComponent, OperacaoEstoque } from './frota-estoque-movimento-drawer.component';
import { SituacaoItem, localMovimento, moeda, numero, quantidadeMovimento, situacaoItem } from './frota-estoque.util';
import { FrotaPecaDrawerComponent } from './frota-peca-drawer.component';

type Aba = 'itens' | 'movimentos' | 'pecas' | 'almoxarifados';
const ABAS: Aba[] = ['itens', 'movimentos', 'pecas', 'almoxarifados'];

const SITUACOES: GeoSelectOption<SituacaoItem | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Abaixo do mínimo', value: 'ABAIXO' },
  { label: 'Sem saldo', value: 'SEM_SALDO' },
  { label: 'Com saldo', value: 'COM_SALDO' }
];
const SITUACAO_ITEM: Record<SituacaoItem, { rotulo: string; tom: 'warning' | 'danger' | 'success'; icone: string }> = {
  ABAIXO: { rotulo: 'Repor', tom: 'warning', icone: 'pi pi-exclamation-triangle' },
  SEM_SALDO: { rotulo: 'Sem saldo', tom: 'danger', icone: 'pi pi-times-circle' },
  COM_SALDO: { rotulo: 'Com saldo', tom: 'success', icone: 'pi pi-check-circle' }
};
const TIPOS: GeoSelectOption<TipoMovimentoFrota>[] = (Object.keys(TIPO_MOVIMENTO) as TipoMovimentoFrota[]).map((t) => ({ label: TIPO_MOVIMENTO[t].rotulo, value: t }));

/**
 * Estoque da oficina: almoxarifados do tipo FROTA, separados do almoxarifado operacional. Saldo
 * com custo médio, mínimo e localização, movimentações com motivo e veículo e o catálogo de peças.
 * O filtro de almoxarifado é um só para os totais, os itens e as movimentações.
 */
@Component({
  selector: 'app-frota-estoque',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    AjudaListagemComponent,
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
    GeoTabPanelDirective,
    GeoTabsComponent,
    GeoTextInputComponent,
    FrotaEstoqueMovimentoDetalheComponent,
    FrotaEstoqueMovimentoDrawerComponent,
    FrotaPecaDrawerComponent
  ],
  styles: `
    .resumo { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; }
    @media (max-width: 1100px) { .resumo { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 480px) {
      .resumo { gap: 0.5rem; }
      .resumo .geo-kpi { gap: 0.5rem; padding: 0.625rem 0.75rem; }
      .resumo .geo-kpi__icon { display: none; }
      .resumo__valor { font-size: 1.125rem; }
    }
    .resumo__valor { font-size: 1.5rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
    .resumo__atalho[aria-pressed='true'] { border-color: var(--geo-warning); box-shadow: inset 3px 0 0 var(--geo-warning), var(--geo-shadow-sm); }
    .aba { display: grid; gap: 0.75rem; }
    .selos { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
  `,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="acesso.editarEstoque() && !!almoxarifadosAtivos().length" (newRequested)="novoDaAba()">
      <geo-page-header title="Estoque da oficina" icon="pi pi-warehouse" [breadcrumb]="[{ label: 'Frota' }, { label: 'Estoque da oficina' }]"
        description="Peças da frota com saldo, custo médio e mínimo por almoxarifado, separadas do almoxarifado operacional."
        helpLabel="Ajuda sobre o estoque da oficina" (help)="ajuda.show()">
        <ng-container ngProjectAs="[actions]">
          @if (acesso.editarEstoque() && almoxarifadosAtivos().length) {
            <geo-button variant="ghost" icon="pi pi-sliders-h" label="Ajustar" (pressed)="movimentar('AJUSTE')"></geo-button>
            <geo-button variant="outline" icon="pi pi-arrow-up-right" label="Saída" (pressed)="movimentar('SAIDA')"></geo-button>
            @if (almoxarifadosAtivos().length > 1) {
              <geo-button variant="outline" icon="pi pi-arrow-right-arrow-left" label="Transferir" (pressed)="movimentar('TRANSFERENCIA')"></geo-button>
            }
            <geo-button icon="pi pi-arrow-down-left" label="Entrada" [keyShortcut]="aba() === 'itens' || aba() === 'movimentos' ? atalhos.newShortcut() : undefined" (pressed)="movimentar('ENTRADA')"></geo-button>
          }
        </ng-container>
      </geo-page-header>

      @if (erroAlmoxarifados()) {
        <geo-callout tone="danger" icon="pi pi-exclamation-circle" title="Não foi possível carregar os almoxarifados">
          {{ erroAlmoxarifados() }}
          <geo-button size="sm" variant="outline" icon="pi pi-refresh" label="Tentar de novo" (pressed)="carregarAlmoxarifados()"></geo-button>
        </geo-callout>
      } @else if (carregouAlmoxarifados() && !almoxarifadosAtivos().length) {
        @if (acesso.editarEstoque()) {
          <geo-callout tone="info" icon="pi pi-warehouse" title="Crie o primeiro almoxarifado">
            Em geral é um por base, onde ficam as peças e os pneus da oficina.
            <geo-button size="sm" variant="outline" icon="pi pi-plus" label="Criar almoxarifado" (pressed)="editarAlmoxarifado(null)"></geo-button>
          </geo-callout>
        } @else {
          <geo-callout tone="info" icon="pi pi-warehouse" title="Nenhum almoxarifado da oficina">
            Quando a oficina criar o primeiro almoxarifado, as peças aparecem aqui.
          </geo-callout>
        }
      } @else {
        @if (resumo(); as r) {
          <section class="resumo" aria-label="Totais do estoque">
            <div class="geo-kpi" data-tone="info">
              <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-wallet"></i></span>
              <span class="geo-kpi__body">
                <span class="geo-kpi__label">Valor em estoque</span>
                <span class="geo-kpi__value resumo__valor">{{ moeda(r.valorTotal) }}</span>
                <span class="geo-kpi__detail">{{ contar(r.itens, 'item', 'itens', 'Nenhum item') }}{{ nomeAlmoxarifado() ? ' em ' + nomeAlmoxarifado() : '' }}</span>
              </span>
            </div>
            <button type="button" class="geo-kpi" data-tone="success" aria-label="Ver as entradas dos últimos 30 dias" (click)="verUltimos30Dias('ENTRADA')">
              <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-arrow-down-left"></i></span>
              <span class="geo-kpi__body">
                <span class="geo-kpi__label">Entradas em 30 dias</span>
                <span class="geo-kpi__value resumo__valor">{{ moeda(r.entradas) }}</span>
                <span class="geo-kpi__detail">Ver movimentações</span>
              </span>
              <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
            </button>
            <button type="button" class="geo-kpi" data-tone="info" aria-label="Ver as saídas dos últimos 30 dias" (click)="verUltimos30Dias('SAIDA')">
              <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-arrow-up-right"></i></span>
              <span class="geo-kpi__body">
                <span class="geo-kpi__label">Saídas em 30 dias</span>
                <span class="geo-kpi__value resumo__valor">{{ moeda(r.saidas) }}</span>
                <span class="geo-kpi__detail">Ver movimentações</span>
              </span>
              <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
            </button>
            <button type="button" class="geo-kpi resumo__atalho" [attr.data-tone]="r.abaixoMinimo ? 'warning' : 'success'" [attr.aria-pressed]="soAbaixo()"
              (click)="alternarAbaixo()" [attr.aria-label]="soAbaixo() ? 'Mostrar todas as peças' : 'Mostrar só as peças abaixo do mínimo'">
              <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-exclamation-triangle"></i></span>
              <span class="geo-kpi__body">
                <span class="geo-kpi__label">Abaixo do mínimo</span>
                <span class="geo-kpi__value resumo__valor">{{ r.abaixoMinimo }}</span>
                <span class="geo-kpi__detail">{{ r.semSaldo ? contar(r.semSaldo, 'item sem saldo', 'itens sem saldo', '') : 'Nenhum item zerado' }}</span>
              </span>
              <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
            </button>
          </section>
        }

        <geo-tabs [tabs]="abas" [(value)]="aba" ariaLabel="Seções do estoque da oficina">
          <ng-template geoTabPanel="itens">
            <div class="aba">
              <geo-filter-panel #painelItens storageKey="frota-estoque-itens" [activeCount]="listaItens.activeCount()" [summary]="listaItens.summary()"
                [loading]="resultadoItens.loading()" (applied)="listaItens.apply()" (cleared)="listaItens.reset()" (chipRemoved)="listaItens.remove($any($event))">
                <div class="geo-filter-grid">
                  <geo-select label="Almoxarifado" [options]="opcoesAlmoxarifado()" [(value)]="listaItens.filters.idEstoque" placeholder="Todos" [clearable]="true"></geo-select>
                  <geo-select label="Grupo" [options]="opcoesGrupo()" [(value)]="listaItens.filters.grupo" placeholder="Todos" [filter]="true" [clearable]="true"></geo-select>
                  <geo-select label="Situação" [options]="situacoes" [(value)]="listaItens.filters.situacao"></geo-select>
                </div>
              </geo-filter-panel>

              <geo-data-table title="Itens" [description]="contar(itens().length, 'item', 'itens', 'Nenhum item')" searchPlaceholder="Código, nome ou grupo" storageKey="frota-estoque-itens"
                exportFileName="frota-estoque" rowActionLabel="Abrir" [columns]="colunasItens" [rows]="itens()" [rowKey]="chaveSaldo" [rowLabel]="rotuloSaldo"
                [state]="resultadoItens.state()" [rowClickable]="true" (rowActivate)="abrirSaldo($event)"
                [stateTitle]="resultadoItens.error() ? 'Não foi possível carregar o estoque' : 'Nenhuma peça em estoque'"
                [stateDescription]="resultadoItens.error() ?? (pecas().length ? 'Lance a primeira entrada para a peça aparecer aqui.' : 'Cadastre as peças da oficina e lance a primeira entrada.')"
                [emptyActionLabel]="acesso.editarEstoque() ? 'Lançar entrada' : undefined" (emptyAction)="movimentar('ENTRADA')"
                noResultsTitle="Nenhum item com esse recorte." [filtered]="listaItens.filtered()" [(query)]="listaItens.query"
                (adjustFilters)="painelItens.expandAndFocus()" (clearFilters)="listaItens.reset()">
                <ng-template geoCell="peca" let-row>
                  <span class="geo-cell-strong">{{ row.descricao }}</span>
                  <span class="geo-cell-muted">{{ row.codigo }}{{ row.grupo ? ' · ' + row.grupo : '' }}</span>
                </ng-template>
                <ng-template geoCell="almoxarifado" let-row>
                  {{ row.estoque }}
                  @if (row.localizacao) { <span class="geo-cell-muted">{{ row.localizacao }}</span> }
                </ng-template>
                <ng-template geoCell="saldo" let-row>
                  <span class="geo-cell-num geo-cell-strong">{{ numero(row.quantidade) }} {{ row.unidade }}</span>
                  @if (row.estoqueMinimo) { <span class="geo-cell-muted">Mínimo {{ numero(row.estoqueMinimo) }}</span> }
                </ng-template>
                <ng-template geoCell="situacao" let-row>
                  @let s = situacaoDe(row);
                  <geo-status [tone]="s.tom" [icon]="s.icone">{{ s.rotulo }}</geo-status>
                </ng-template>
                <ng-template geoRowActions let-row>
                  @if (acesso.editarEstoque()) {
                    <span class="geo-table-actions">
                      <geo-icon-button icon="pi pi-arrow-down-left" [label]="'Entrada de ' + row.descricao" tooltip="Entrada" size="icon-sm" (pressed)="movimentarItem('ENTRADA', row)"></geo-icon-button>
                      <geo-icon-button icon="pi pi-arrow-up-right" [label]="'Saída de ' + row.descricao" tooltip="Saída" size="icon-sm" [disabled]="row.quantidade <= 0" (pressed)="movimentarItem('SAIDA', row)"></geo-icon-button>
                    </span>
                  }
                </ng-template>
              </geo-data-table>
            </div>
          </ng-template>

          <ng-template geoTabPanel="movimentos">
            <div class="aba">
              <geo-filter-panel #painelMovimentos storageKey="frota-estoque-movimentos" [activeCount]="listaMovimentos.activeCount()" [summary]="listaMovimentos.summary()"
                [loading]="resultadoMovimentos.loading()" (applied)="listaMovimentos.apply()" (cleared)="listaMovimentos.reset()" (chipRemoved)="listaMovimentos.remove($any($event))">
                <div class="geo-filter-grid">
                  <geo-datepicker label="De" [value]="dataLocal(listaMovimentos.filters.de())" [clearable]="true" (valueChange)="listaMovimentos.filters.de.set(dataIso($event))"></geo-datepicker>
                  <geo-datepicker label="Até" [value]="dataLocal(listaMovimentos.filters.ate())" [clearable]="true" (valueChange)="listaMovimentos.filters.ate.set(dataIso($event))"></geo-datepicker>
                  <geo-multiselect label="Tipo" [options]="tipos" [(value)]="listaMovimentos.filters.tipos" placeholder="Todos"></geo-multiselect>
                  <geo-select label="Almoxarifado" [options]="opcoesAlmoxarifado()" [(value)]="listaMovimentos.filters.idEstoque" placeholder="Todos" [clearable]="true"></geo-select>
                  <geo-select label="Peça" [options]="opcoesPeca()" [(value)]="listaMovimentos.filters.idMaterial" placeholder="Todas" [filter]="true" [clearable]="true"></geo-select>
                  <geo-select label="Veículo" [options]="veiculos()" [(value)]="listaMovimentos.filters.idVeiculo" placeholder="Todos" [filter]="true" filterPlaceholder="Placa ou modelo" [clearable]="true"></geo-select>
                </div>
              </geo-filter-panel>

              <geo-data-table title="Movimentações" mode="server" [description]="contar(resultadoMovimentos.total(), 'movimentação', 'movimentações', 'Nenhuma movimentação')"
                searchPlaceholder="Código, nome da peça ou documento" storageKey="frota-estoque-movimentos" exportFileName="frota-estoque-movimentacoes"
                [exportRows]="exportarMovimentos" [exportLimit]="limiteExportacao" [columns]="colunasMovimentos" [rows]="resultadoMovimentos.rows()" [totalRecords]="resultadoMovimentos.total()"
                [rowKey]="chaveMovimento" [rowLabel]="rotuloMovimento" [state]="resultadoMovimentos.state()" rowActionLabel="Ver" [rowClickable]="true" (rowActivate)="abrirMovimento($event)"
                [stateTitle]="resultadoMovimentos.error() ? 'Não foi possível carregar as movimentações' : 'Nenhuma movimentação'"
                [stateDescription]="resultadoMovimentos.error() ?? 'Entradas, saídas, transferências, ajustes e baixas pelas OS aparecem aqui.'"
                noResultsTitle="Nenhuma movimentação com esse recorte." [filtered]="listaMovimentos.filtered()"
                [(query)]="listaMovimentos.query" [(page)]="listaMovimentos.page" [(pageSize)]="listaMovimentos.pageSize" [(sort)]="listaMovimentos.sort" (lazyLoad)="listaMovimentos.load($event)"
                (adjustFilters)="painelMovimentos.expandAndFocus()" (clearFilters)="listaMovimentos.reset()">
                <ng-template geoCell="quando" let-row>
                  <span class="geo-cell-strong">{{ row.dataHora | date: 'dd/MM/yyyy HH:mm' }}</span>
                  <span class="geo-cell-muted">{{ row.usuario ?? '' }}</span>
                </ng-template>
                <ng-template geoCell="tipo" let-row>
                  @let t = tipo(row);
                  <span class="selos">
                    <geo-status [tone]="t.tom" [icon]="t.icone">{{ t.rotulo }}</geo-status>
                    @if (row.estornado) { <geo-status tone="neutral" emphasis="outline">Estornada</geo-status> }
                  </span>
                  <span class="geo-cell-muted">{{ row.motivoRotulo ?? '' }}</span>
                </ng-template>
                <ng-template geoCell="peca" let-row>
                  <span class="geo-cell-strong">{{ row.descricao }}</span>
                  <span class="geo-cell-muted">{{ row.codigo }}</span>
                </ng-template>
                <ng-template geoCell="quantidade" let-row>
                  <span class="geo-cell-num geo-cell-strong">{{ quantidade(row) }}</span>
                  <span class="geo-cell-muted geo-cell-num">{{ moeda(row.valorTotal) }}</span>
                </ng-template>
                <ng-template geoCell="referencia" let-row>
                  @if (row.idOrdemServico) { <a [routerLink]="['/frota/ordens-servico', row.idOrdemServico]" (click)="$event.stopPropagation()">{{ rotuloOs(row.numeroOrdemServico) }}</a> }
                  @if (row.placa) { <span class="geo-cell-muted">{{ placa(row.placa) }}</span> }
                  @if (row.documento) { <span class="geo-cell-muted">{{ row.documento }}</span> }
                  @if (row.fornecedor) { <span class="geo-cell-muted">{{ row.fornecedor }}</span> }
                </ng-template>
              </geo-data-table>
            </div>
          </ng-template>

          <ng-template geoTabPanel="pecas">
            <div class="aba">
              <geo-filter-panel #painelPecas storageKey="frota-estoque-pecas" [activeCount]="listaPecas.activeCount()" [summary]="listaPecas.summary()"
                [loading]="resultadoPecas.loading()" (applied)="listaPecas.apply()" (cleared)="listaPecas.reset()" (chipRemoved)="listaPecas.remove($any($event))">
                <div class="geo-filter-grid">
                  <geo-select label="Grupo" [options]="opcoesGrupo()" [(value)]="listaPecas.filters.grupo" placeholder="Todos" [filter]="true" [clearable]="true"></geo-select>
                  <geo-select label="Cadastro" [options]="cadastro" [(value)]="listaPecas.filters.ativo"></geo-select>
                </div>
              </geo-filter-panel>

              <geo-data-table title="Catálogo de peças" [description]="contar(linhasPecas().length, 'peça', 'peças', 'Nenhuma peça')" searchPlaceholder="Código, nome ou grupo" storageKey="frota-estoque-pecas"
                exportFileName="frota-pecas" rowActionLabel="Abrir" [columns]="colunasPecas" [rows]="linhasPecas()" [rowKey]="chavePeca" [rowLabel]="rotuloPeca" [state]="resultadoPecas.state()"
                [rowClickable]="true" (rowActivate)="abrirPeca($event)"
                [stateTitle]="resultadoPecas.error() ? 'Não foi possível carregar o catálogo' : 'Nenhuma peça cadastrada'"
                [stateDescription]="resultadoPecas.error() ?? 'Cadastre as peças da oficina: filtros, óleos, pastilhas, lâmpadas.'"
                [emptyActionLabel]="acesso.editarEstoque() ? 'Cadastrar peça' : undefined" (emptyAction)="abrirPeca(null)"
                noResultsTitle="Nenhuma peça com esse recorte." [filtered]="listaPecas.filtered()" [(query)]="listaPecas.query"
                (adjustFilters)="painelPecas.expandAndFocus()" (clearFilters)="listaPecas.reset()">
                <ng-container table-actions>
                  @if (acesso.editarEstoque()) {
                    <geo-button size="sm" icon="pi pi-plus" label="Cadastrar peça" [keyShortcut]="aba() === 'pecas' ? atalhos.newShortcut() : undefined" (pressed)="abrirPeca(null)"></geo-button>
                  }
                </ng-container>
                <ng-template geoCell="saldo" let-row><span class="geo-cell-num geo-cell-strong">{{ numero(row.saldoTotal) }} {{ row.unidade }}</span></ng-template>
                <ng-template geoCell="ativo" let-row>
                  <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativa' : 'Desativada' }}</geo-status>
                </ng-template>
              </geo-data-table>
            </div>
          </ng-template>

          <ng-template geoTabPanel="almoxarifados">
            <geo-data-table title="Almoxarifados da frota" [description]="contar(almoxarifadosAtivos().length, 'almoxarifado', 'almoxarifados', 'Nenhum almoxarifado')" [columns]="colunasAlmoxarifados"
              [rows]="almoxarifadosAtivos()" [rowKey]="chaveAlmoxarifado" [rowLabel]="rotuloAlmoxarifado" [searchable]="false" exportFileName="frota-almoxarifados"
              [state]="almoxarifadosAtivos().length ? 'ready' : 'empty'" stateTitle="Nenhum almoxarifado" [rowClickable]="acesso.editarEstoque()" (rowActivate)="editarAlmoxarifado($event)"
              [rowActionLabel]="acesso.editarEstoque() ? 'Alterar' : undefined" rowActionIcon="pi pi-pencil">
              <ng-container table-actions>
                @if (acesso.editarEstoque()) {
                  <geo-button size="sm" icon="pi pi-plus" label="Criar almoxarifado" [keyShortcut]="aba() === 'almoxarifados' ? atalhos.newShortcut() : undefined" (pressed)="editarAlmoxarifado(null)"></geo-button>
                }
              </ng-container>
              <ng-template geoRowActions let-row>
                <span class="geo-table-actions">
                  <geo-icon-button icon="pi pi-box" [label]="'Ver os itens de ' + row.nome" tooltip="Ver itens" size="icon-sm" (pressed)="verItens(row)"></geo-icon-button>
                  @if (acesso.editarEstoque()) {
                    <geo-icon-button icon="pi pi-ban" [label]="'Desativar ' + row.nome" tooltip="Desativar" size="icon-sm" (pressed)="desativarAlmoxarifado(row)"></geo-icon-button>
                  }
                </span>
              </ng-template>
            </geo-data-table>
          </ng-template>
        </geo-tabs>
      }
    </div>

    <app-frota-estoque-movimento-drawer [(visivel)]="movimentoAberto" [operacao]="operacao()" [almoxarifados]="almoxarifados()" [pecas]="pecas()" [saldos]="saldos()"
      [fornecedores]="fornecedores()" [veiculos]="veiculos()" [grupos]="grupos()" [idEstoqueInicial]="estoqueMovimento()" [idMaterialInicial]="materialMovimento()"
      (registrado)="recarregar()" (pecaCadastrada)="recarregarPecas()"></app-frota-estoque-movimento-drawer>
    <app-frota-peca-drawer [(visivel)]="pecaAberta" [peca]="pecaEmEdicao()" [saldo]="saldoEmEdicao()" [grupos]="grupos()" [podeEditar]="acesso.editarEstoque()"
      [podeTransferir]="almoxarifadosAtivos().length > 1" [locais]="locaisDaPeca()" (salva)="recarregar()" (movimentar)="movimentarDaPeca($event)" (abrirSaldo)="abrirSaldo($event)"
      (verMovimentacoes)="verMovimentacoesDaPeca()"></app-frota-peca-drawer>
    <app-frota-estoque-movimento-detalhe [(visivel)]="detalheAberto" [movimento]="movimentoEmDetalhe()"></app-frota-estoque-movimento-detalhe>

    <geo-form-drawer [(visible)]="almoxarifadoAberto" [title]="almoxarifadoEmEdicao() ? 'Alterar almoxarifado' : 'Criar almoxarifado'" size="sm" [loading]="salvandoAlmoxarifado()"
      description="Local físico das peças e dos pneus da oficina." [dirty]="almoxarifadoAlterado()">
      <geo-text-input label="Nome" [required]="true" [(value)]="nomeNovoAlmoxarifado" [maxlength]="100" placeholder="Ex.: Oficina Juazeiro"
        [error]="tentouAlmoxarifado() && nomeNovoAlmoxarifado().trim().length < 3 ? 'Informe ao menos 3 letras.' : undefined"></geo-text-input>
      <geo-select label="Base" [options]="bases.opcoes()" [(value)]="baseAlmoxarifado" [filter]="true" [clearable]="true" [showOptional]="true"></geo-select>
      <div drawer-footer class="rodape">
        <span class="rodape__espaco"></span>
        <geo-button variant="ghost" label="Cancelar" (pressed)="almoxarifadoAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="almoxarifadoEmEdicao() ? 'Salvar alterações' : 'Criar almoxarifado'" [loading]="salvandoAlmoxarifado()" (pressed)="salvarAlmoxarifado()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-ajuda-listagem #ajuda titulo="Estoque da oficina" entidadePlural="peças" artigoPlural="as" busca="código, nome ou grupo" rotuloNovo="Entrada" [podeCriar]="acesso.editarEstoque()">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-calculator"></i> Custo médio</h4>
        <p class="help-text-desc">Cada entrada recalcula o custo médio da peça naquele almoxarifado. Saídas, ajustes e baixas pela OS saem por ele; a transferência leva o custo da origem para o destino.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-exclamation-triangle"></i> Mínimo e localização</h4>
        <p class="help-text-desc">Abra a peça pela linha para definir o mínimo e a prateleira em cada almoxarifado. Quem fica abaixo do mínimo aparece como Repor e no indicador do topo.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-wrench"></i> Peças usadas numa OS</h4>
        <p class="help-text-desc">A saída para uma ordem de serviço é lançada na própria OS, na aba de execução. Tirar a peça da OS devolve a quantidade ao almoxarifado.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-sliders-h"></i> Inventário</h4>
        <p class="help-text-desc">Em Ajustar, informe a quantidade contada e o motivo. A tela mostra a diferença antes de registrar.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class FrotaEstoqueComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  protected readonly moeda = moeda;
  protected readonly numero = numero;
  protected readonly contar = contar;
  protected readonly placa = formatarPlaca;
  protected readonly rotuloOs = rotuloOs;
  protected readonly quantidade = quantidadeMovimento;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly situacoes = SITUACOES;
  protected readonly tipos = TIPOS;
  protected readonly cadastro = OPCOES_CADASTRO;

  protected readonly aba = geoUrlParam<Aba>({ values: ABAS, default: 'itens' });
  protected readonly abas: GeoTabItem[] = [
    { value: 'itens', label: 'Itens', icon: 'pi pi-box' },
    { value: 'movimentos', label: 'Movimentações', icon: 'pi pi-arrow-right-arrow-left' },
    { value: 'pecas', label: 'Catálogo de peças', icon: 'pi pi-wrench' },
    { value: 'almoxarifados', label: 'Almoxarifados', icon: 'pi pi-warehouse' }
  ];

  protected readonly almoxarifados = signal<AlmoxarifadoFrota[]>([]);
  protected readonly carregouAlmoxarifados = signal(false);
  protected readonly erroAlmoxarifados = signal<string | null>(null);
  protected readonly almoxarifadosAtivos = computed(() => this.almoxarifados().filter((a) => a.ativo));
  protected readonly opcoesAlmoxarifado = computed<GeoSelectOption<string>[]>(() => this.almoxarifadosAtivos().map((a) => ({ label: a.nome, value: a.id })));
  protected readonly grupos = signal<string[]>([]);
  protected readonly opcoesGrupo = computed<GeoSelectOption<string>[]>(() => this.grupos().map((g) => ({ label: g, value: g })));
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly veiculos = signal<GeoSelectOption<string>[]>([]);
  private readonly todasPecas = signal<readonly PecaFrota[]>([]);
  protected readonly opcoesPeca = computed<GeoSelectOption<string>[]>(() => this.todasPecas().map((p) => ({ label: `${p.codigo} · ${p.descricao}`, value: p.id })));

  // Itens e catálogo paginam na própria tabela: sem storageKey aqui, o tamanho de página não vai para a URL.
  protected readonly listaItens = geoListState({
    filters: {
      idEstoque: geoFilter.value<string | null>(null, { label: 'Almoxarifado', param: 'almoxarifado', options: () => this.opcoesAlmoxarifado() }),
      grupo: geoFilter.value<string | null>(null, { label: 'Grupo', param: 'grupo', options: () => this.opcoesGrupo() }),
      situacao: geoFilter.value<SituacaoItem | null>(null, { label: 'Situação', param: 'situacao', options: () => SITUACOES })
    }
  });
  /** Busca os saldos de todos os almoxarifados: o painel de movimento precisa deles e o recorte é local. */
  protected readonly resultadoItens = this.listaItens.results<SaldoPecaFrota>(() => this.servico.saldos(null), { immediate: true, errorMessage: getErrorMessage });
  protected readonly saldos = this.resultadoItens.rows;
  protected readonly itens = computed(() => {
    const { idEstoque, grupo, situacao } = this.listaItens.applied();
    return this.saldos().filter((s) =>
      (!idEstoque || s.idEstoque === idEstoque)
      && (!grupo || s.grupo === grupo)
      && (!situacao || situacaoItem(s) === situacao));
  });
  protected readonly soAbaixo = computed(() => this.listaItens.applied().situacao === 'ABAIXO');
  protected readonly nomeAlmoxarifado = computed(() => this.almoxarifados().find((a) => a.id === this.listaItens.applied().idEstoque)?.nome ?? '');

  protected readonly listaMovimentos = geoListState({
    storageKey: 'frota-estoque-movimentos',
    rememberFilters: 'frota-estoque-movimentos',
    queryParam: 'buscaMovimento',
    filters: {
      de: geoFilter.date(null, { label: 'De' }),
      ate: geoFilter.date(null, { label: 'Até' }),
      tipos: geoFilter.list<TipoMovimentoFrota>([], { label: 'Tipo', param: 'tipo', itemLabel: (t) => TIPO_MOVIMENTO[t]?.rotulo ?? 'tipo', countLabel: (n) => `${n} selecionados` }),
      idEstoque: geoFilter.value<string | null>(null, { label: 'Almoxarifado', param: 'almoxarifado', options: () => this.opcoesAlmoxarifado() }),
      idMaterial: geoFilter.value<string | null>(null, { label: 'Peça', param: 'peca', options: () => this.opcoesPeca() }),
      idVeiculo: geoFilter.value<string | null>(null, { label: 'Veículo', param: 'placa', options: () => this.veiculos() })
    },
    sort: [{ key: 'quando', direction: 'desc' }]
  });
  protected readonly resultadoMovimentos = this.listaMovimentos.results<MovimentoEstoqueFrota>(
    (pedido) => this.servico.movimentos(this.filtroMovimentos(pedido.filters, pedido.query), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportarMovimentos = exportacaoFrota(
    (pagina) => this.servico.movimentos(this.filtroMovimentos(this.listaMovimentos.request().filters, this.listaMovimentos.request().query), pagina),
    () => this.listaMovimentos.request()
  );

  protected readonly listaPecas = geoListState({
    queryParam: 'buscaPeca',
    filters: {
      grupo: geoFilter.value<string | null>(null, { label: 'Grupo', param: 'grupoPeca', options: () => this.opcoesGrupo() }),
      ativo: geoFilter.value<boolean | null>(true, { label: 'Cadastro', param: 'cadastro', options: () => OPCOES_CADASTRO })
    }
  });
  protected readonly resultadoPecas = this.listaPecas.results<PecaFrota>(() => this.servico.pecas(null, null, { size: LIMITE_EXPORTACAO_FROTA, sort: ['descricao'] }, null), { immediate: true, errorMessage: getErrorMessage });
  protected readonly linhasPecas = computed(() => {
    const { grupo, ativo } = this.listaPecas.applied();
    return this.resultadoPecas.rows().filter((p) => (!grupo || p.grupo === grupo) && (ativo === null || p.ativo === ativo));
  });
  protected readonly pecas = computed(() => [...this.resultadoPecas.rows()]);

  protected readonly resumo = signal<ResumoEstoqueFrota | null>(null);

  protected readonly movimentoAberto = signal(false);
  protected readonly operacao = signal<OperacaoEstoque>('ENTRADA');
  protected readonly estoqueMovimento = signal<string | null>(null);
  protected readonly materialMovimento = signal<string | null>(null);
  protected readonly pecaAberta = signal(false);
  protected readonly pecaEmEdicao = signal<PecaFrota | null>(null);
  protected readonly saldoEmEdicao = signal<SaldoPecaFrota | null>(null);
  protected readonly detalheAberto = signal(false);
  protected readonly movimentoEmDetalhe = signal<MovimentoEstoqueFrota | null>(null);
  protected readonly almoxarifadoAberto = signal(false);
  protected readonly almoxarifadoEmEdicao = signal<AlmoxarifadoFrota | null>(null);
  protected readonly nomeNovoAlmoxarifado = signal('');
  protected readonly baseAlmoxarifado = signal<string | null>(null);
  protected readonly salvandoAlmoxarifado = signal(false);
  protected readonly tentouAlmoxarifado = signal(false);
  protected readonly almoxarifadoAlterado = computed(() => {
    const a = this.almoxarifadoEmEdicao();
    return this.nomeNovoAlmoxarifado().trim() !== (a?.nome ?? '') || this.baseAlmoxarifado() !== (a?.idBaseOperacional ?? null);
  });

  /** No catálogo: a peça em cada almoxarifado ativo, mesmo onde não há saldo (para definir mínimo e localização). */
  protected readonly locaisDaPeca = computed<SaldoPecaFrota[]>(() => {
    const p = this.pecaEmEdicao();
    if (!p || this.saldoEmEdicao()) return [];
    return this.almoxarifadosAtivos().map((a) => this.saldos().find((s) => s.idMaterial === p.id && s.idEstoque === a.id) ?? {
      idEstoque: a.id, estoque: a.nome, idMaterial: p.id, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, grupo: p.grupo,
      quantidade: 0, custoMedio: null, valorTotal: 0, estoqueMinimo: null, localizacao: null, abaixoMinimo: false
    });
  });

  private readonly totaisPorAlmoxarifado = computed(() => {
    const totais = new Map<string, { itens: number; valor: number; abaixo: number }>();
    for (const s of this.saldos()) {
      const t = totais.get(s.idEstoque) ?? { itens: 0, valor: 0, abaixo: 0 };
      totais.set(s.idEstoque, { itens: t.itens + (s.quantidade > 0 ? 1 : 0), valor: t.valor + s.valorTotal, abaixo: t.abaixo + (s.abaixoMinimo ? 1 : 0) });
    }
    return totais;
  });

  protected readonly colunasItens: GeoDataTableColumn<SaldoPecaFrota>[] = [
    { key: 'peca', header: 'Peça', type: 'custom', priority: 1, value: (s) => s.descricao, display: (s) => `${s.descricao} ${s.codigo} ${s.grupo ?? ''}` },
    { key: 'almoxarifado', header: 'Almoxarifado', type: 'custom', priority: 2, value: (s) => s.estoque, display: (s) => `${s.estoque} ${s.localizacao ?? ''}` },
    { key: 'saldo', header: 'Saldo', type: 'number', priority: 1, value: (s) => s.quantidade, display: (s) => `${numero(s.quantidade)} ${s.unidade}` },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (s) => situacaoItem(s), display: (s) => SITUACAO_ITEM[situacaoItem(s)].rotulo },
    { key: 'custo', header: 'Custo médio', type: 'currency', priority: 2, value: (s) => s.custoMedio ?? null, searchable: false },
    { key: 'valor', header: 'Valor', type: 'currency', priority: 2, value: (s) => s.valorTotal, searchable: false }
  ];
  protected readonly colunasMovimentos: GeoDataTableColumn<MovimentoEstoqueFrota>[] = [
    { key: 'quando', header: 'Quando', type: 'custom', priority: 1, sortField: 'dataHora', value: (m) => m.dataHora, display: (m) => new Date(m.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
    { key: 'tipo', header: 'Tipo', type: 'custom', priority: 1, value: (m) => m.tipo, display: (m) => `${TIPO_MOVIMENTO[m.tipo].rotulo} ${m.motivoRotulo ?? ''}${m.estornado ? ' (estornada)' : ''}` },
    { key: 'peca', header: 'Peça', type: 'custom', priority: 1, value: (m) => m.descricao, display: (m) => `${m.descricao} ${m.codigo}` },
    { key: 'local', header: 'Almoxarifado', type: 'custom', priority: 3, value: (m) => localMovimento(m), display: (m) => localMovimento(m) },
    { key: 'quantidade', header: 'Quantidade', type: 'number', priority: 1, value: (m) => m.quantidade, display: (m) => quantidadeMovimento(m) },
    { key: 'referencia', header: 'Referência', type: 'custom', priority: 2, value: (m) => m.placa ?? m.documento ?? '', display: (m) => [m.numeroOrdemServico ? rotuloOs(m.numeroOrdemServico) : '', m.placa ?? '', m.documento ?? '', m.fornecedor ?? ''].filter(Boolean).join(' · ') }
  ];
  protected readonly colunasPecas: GeoDataTableColumn<PecaFrota>[] = [
    { key: 'codigo', header: 'Código', type: 'text', priority: 1, value: (p) => p.codigo, display: (p) => p.codigo },
    { key: 'descricao', header: 'Nome', type: 'text', priority: 1, value: (p) => p.descricao, display: (p) => p.descricao },
    { key: 'grupo', header: 'Grupo', type: 'text', priority: 2, value: (p) => p.grupo ?? '', display: (p) => p.grupo ?? '' },
    { key: 'saldo', header: 'Saldo total', type: 'number', priority: 1, value: (p) => p.saldoTotal, display: (p) => `${numero(p.saldoTotal)} ${p.unidade}` },
    { key: 'ativo', header: 'Cadastro', type: 'custom', priority: 2, value: (p) => p.ativo, display: (p) => (p.ativo ? 'Ativa' : 'Desativada') }
  ];
  protected readonly colunasAlmoxarifados: GeoDataTableColumn<AlmoxarifadoFrota>[] = [
    { key: 'nome', header: 'Nome', type: 'text', priority: 1, value: (a) => a.nome, display: (a) => a.nome },
    { key: 'base', header: 'Base', type: 'text', priority: 2, value: (a) => a.baseOperacional ?? '', display: (a) => a.baseOperacional ?? '—' },
    { key: 'itens', header: 'Itens com saldo', type: 'integer', priority: 1, value: (a) => this.totaisPorAlmoxarifado().get(a.id)?.itens ?? 0 },
    { key: 'abaixo', header: 'Abaixo do mínimo', type: 'integer', priority: 2, value: (a) => this.totaisPorAlmoxarifado().get(a.id)?.abaixo ?? 0 },
    { key: 'valor', header: 'Valor em estoque', type: 'currency', priority: 1, value: (a) => this.totaisPorAlmoxarifado().get(a.id)?.valor ?? 0 }
  ];
  protected readonly chaveSaldo = (s: SaldoPecaFrota) => `${s.idEstoque}:${s.idMaterial}`;
  protected readonly rotuloSaldo = (s: SaldoPecaFrota) => `${s.descricao} em ${s.estoque}`;
  protected readonly chaveMovimento = (m: MovimentoEstoqueFrota) => m.id;
  protected readonly rotuloMovimento = (m: MovimentoEstoqueFrota) => `${TIPO_MOVIMENTO[m.tipo].rotulo} de ${m.descricao}`;
  protected readonly chavePeca = (p: PecaFrota) => p.id;
  protected readonly rotuloPeca = (p: PecaFrota) => p.descricao;
  protected readonly chaveAlmoxarifado = (a: AlmoxarifadoFrota) => a.id;
  protected readonly rotuloAlmoxarifado = (a: AlmoxarifadoFrota) => a.nome;

  constructor() {
    this.carregarAlmoxarifados();
    this.carregarGrupos();
    this.frota.fornecedoresOficina().subscribe({ next: (f) => this.fornecedores.set(f), error: () => undefined });
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => this.veiculos.set(p.content.map((v) => ({ label: `${formatarPlaca(v.placa)}${v.modelo ? ' · ' + v.modelo : ''}`, value: v.idVeiculo }))),
      error: () => undefined
    });
    // O filtro de peça das movimentações é criado antes do catálogo.
    effect(() => this.todasPecas.set(this.resultadoPecas.rows()));
    // O almoxarifado é o mesmo recorte nos totais, nos itens e nas movimentações.
    effect(() => {
      const id = this.listaItens.applied().idEstoque;
      untracked(() => {
        this.carregarResumo(id);
        if (this.listaMovimentos.applied().idEstoque !== id) this.depoisDaUrl(() => this.listaMovimentos.set('idEstoque', id));
      });
    });
    effect(() => {
      const id = this.listaMovimentos.applied().idEstoque;
      untracked(() => {
        if (this.listaItens.applied().idEstoque !== id) this.depoisDaUrl(() => this.listaItens.set('idEstoque', id));
      });
    });
  }

  protected tipo(m: MovimentoEstoqueFrota) {
    return TIPO_MOVIMENTO[m.tipo];
  }

  protected situacaoDe(s: SaldoPecaFrota) {
    return SITUACAO_ITEM[situacaoItem(s)];
  }

  protected async alternarAbaixo(): Promise<void> {
    const situacao = this.soAbaixo() ? null : 'ABAIXO';
    await this.irParaAba('itens');
    this.listaItens.set('situacao', situacao);
  }

  /** Atalho dos indicadores: o que entrou ou saiu nos últimos 30 dias, os mesmos dias do total. */
  protected async verUltimos30Dias(tipo: TipoMovimentoFrota): Promise<void> {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 30);
    const f = this.listaMovimentos.filters;
    f.tipos.set([tipo]);
    f.de.set(dataIso(inicio));
    f.ate.set(null);
    f.idMaterial.set(null);
    f.idVeiculo.set(null);
    await this.irParaAba('movimentos');
    this.listaMovimentos.apply();
  }

  protected async verItens(a: AlmoxarifadoFrota): Promise<void> {
    await this.irParaAba('itens');
    this.listaItens.set('idEstoque', a.id);
  }

  protected novoDaAba(): void {
    if (this.aba() === 'pecas') this.abrirPeca(null);
    else if (this.aba() === 'almoxarifados') this.editarAlmoxarifado(null);
    else this.movimentar('ENTRADA');
  }

  protected movimentar(operacao: OperacaoEstoque, idMaterial: string | null = null, idEstoque: string | null = this.listaItens.applied().idEstoque): void {
    this.operacao.set(operacao);
    this.estoqueMovimento.set(idEstoque);
    this.materialMovimento.set(idMaterial);
    this.movimentoAberto.set(true);
  }

  protected movimentarItem(operacao: OperacaoEstoque, s: SaldoPecaFrota): void {
    this.movimentar(operacao, s.idMaterial, s.idEstoque);
  }

  protected movimentarDaPeca(operacao: OperacaoEstoque): void {
    const saldo = this.saldoEmEdicao();
    const peca = this.pecaEmEdicao();
    this.pecaAberta.set(false);
    this.movimentar(operacao, peca?.id ?? null, saldo?.idEstoque ?? this.listaItens.applied().idEstoque);
  }

  protected async verMovimentacoesDaPeca(): Promise<void> {
    const saldo = this.saldoEmEdicao();
    const f = this.listaMovimentos.filters;
    f.idMaterial.set(this.pecaEmEdicao()?.id ?? null);
    f.idEstoque.set(saldo?.idEstoque ?? null);
    f.tipos.set([]);
    f.de.set(null);
    f.ate.set(null);
    f.idVeiculo.set(null);
    this.pecaAberta.set(false);
    await this.irParaAba('movimentos');
    this.listaMovimentos.apply();
  }

  protected abrirSaldo(s: SaldoPecaFrota): void {
    this.saldoEmEdicao.set(s);
    this.pecaEmEdicao.set(this.pecas().find((p) => p.id === s.idMaterial)
      ?? { id: s.idMaterial, codigo: s.codigo, descricao: s.descricao, unidade: s.unidade, grupo: s.grupo, ativo: true, saldoTotal: s.quantidade });
    this.pecaAberta.set(true);
  }

  protected abrirPeca(p: PecaFrota | null): void {
    this.saldoEmEdicao.set(null);
    this.pecaEmEdicao.set(p);
    this.pecaAberta.set(true);
  }

  protected abrirMovimento(m: MovimentoEstoqueFrota): void {
    this.movimentoEmDetalhe.set(m);
    this.detalheAberto.set(true);
  }

  protected recarregar(): void {
    this.listaItens.reload();
    this.listaMovimentos.reload();
    this.carregarResumo(this.listaItens.applied().idEstoque);
    this.recarregarPecas();
  }

  protected recarregarPecas(): void {
    this.listaPecas.reload();
    this.carregarGrupos();
  }

  protected editarAlmoxarifado(a: AlmoxarifadoFrota | null): void {
    this.almoxarifadoEmEdicao.set(a);
    this.nomeNovoAlmoxarifado.set(a?.nome ?? '');
    this.baseAlmoxarifado.set(a?.idBaseOperacional ?? null);
    this.tentouAlmoxarifado.set(false);
    this.almoxarifadoAberto.set(true);
  }

  protected salvarAlmoxarifado(): void {
    this.tentouAlmoxarifado.set(true);
    if (this.nomeNovoAlmoxarifado().trim().length < 3) return;
    this.salvandoAlmoxarifado.set(true);
    this.servico.salvarAlmoxarifado({ nome: this.nomeNovoAlmoxarifado().trim(), idBaseOperacional: this.baseAlmoxarifado() }, this.almoxarifadoEmEdicao()?.id).subscribe({
      next: (a) => {
        this.salvandoAlmoxarifado.set(false);
        this.almoxarifadoEmEdicao.set(a);
        this.nomeNovoAlmoxarifado.set(a.nome);
        this.baseAlmoxarifado.set(a.idBaseOperacional ?? null);
        this.almoxarifadoAberto.set(false);
        this.notificacoes.success(`Almoxarifado ${a.nome} salvo.`);
        this.carregarAlmoxarifados();
        this.listaItens.reload();
      },
      error: (e) => (this.salvandoAlmoxarifado.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  protected async desativarAlmoxarifado(a: AlmoxarifadoFrota): Promise<void> {
    const totais = this.totaisPorAlmoxarifado().get(a.id);
    if (totais?.itens) {
      this.notificacoes.warning(`O ${a.nome} ainda tem ${contar(totais.itens, 'item', 'itens')} com saldo. Transfira ou zere antes de desativar.`);
      return;
    }
    const ok = await this.confirmacao.confirm({ title: 'Desativar almoxarifado', message: `Desativar o ${a.nome}? Ele deixa de aparecer nas entradas, saídas e ordens de serviço.`, confirmLabel: 'Desativar', variant: 'destructive' });
    if (!ok) return;
    this.servico.desativarAlmoxarifado(a.id).subscribe({
      next: () => {
        this.notificacoes.success(`${a.nome} desativado.`);
        if (this.listaItens.applied().idEstoque === a.id) this.listaItens.set('idEstoque', null);
        this.carregarAlmoxarifados();
        this.listaItens.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected carregarAlmoxarifados(): void {
    this.erroAlmoxarifados.set(null);
    this.servico.almoxarifados().subscribe({
      next: (a) => (this.almoxarifados.set(a), this.carregouAlmoxarifados.set(true)),
      error: (e) => (this.erroAlmoxarifados.set(getErrorMessage(e)), this.carregouAlmoxarifados.set(true))
    });
  }

  /**
   * A aba e os filtros ficam na URL e cada um navega por conta própria: duas navegações seguidas se
   * cancelam. Por isso a aba muda primeiro, e o filtro só é aplicado depois que a URL assentou.
   */
  private async irParaAba(aba: Aba): Promise<void> {
    if (this.aba() === aba) return;
    await this.router.navigate([], { relativeTo: this.rota, queryParams: { aba: aba === 'itens' ? null : aba }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private depoisDaUrl(acao: () => void): void {
    setTimeout(acao);
  }

  private carregarGrupos(): void {
    this.servico.grupos().subscribe({ next: (g) => this.grupos.set(g), error: () => undefined });
  }

  private carregarResumo(id: string | null): void {
    this.servico.resumoEstoque(id).subscribe({ next: (r) => this.resumo.set(r), error: () => undefined });
  }

  private filtroMovimentos(f: { de: string | null; ate: string | null; tipos: TipoMovimentoFrota[]; idEstoque: string | null; idMaterial: string | null; idVeiculo: string | null }, busca: string) {
    return { ...f, busca: busca || null };
  }
}
