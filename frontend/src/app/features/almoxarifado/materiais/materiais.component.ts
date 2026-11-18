import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoImportDrawerComponent,
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
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
import { Observable, of, switchMap } from 'rxjs';
import { GeoNumberInputComponent } from '@geo/ui';

import { AvaliacaoMaterialResponse, CentroInvestimentoResponse, MaterialImportacaoDTO, MaterialRequest, MaterialResponse } from '../../../core/models/almoxarifado.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { RhService } from '../../../core/services/rh.service';
import { ProcessoNegocioResponse } from '../../../core/models/rh.models';
import { PROCESSO_OBRAS, ondeOMaterialEntra, processoMaterial } from '../shared/processo-material';
import { fraseEquivalencia, numero, unidadeBase } from '../shared/unidade-material';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

interface LinhaEquivalencia {
  chave: number;
  unidade: string;
  quantidadeUnidade: number | null;
  quantidadeBase: number | null;
}

let proximaChave = 1;

const OPCOES_SERIE: GeoSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Sim', value: true },
  { label: 'Não', value: false }
];

@Component({
  selector: 'app-materiais',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoImportDrawerComponent,
    GeoNumberInputComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  styles: `
    .mat-unidade { display: inline-flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
    .mat-eq { display: grid; gap: 0.625rem; margin: 0 0 0.75rem; padding: 0; list-style: none; }
    .mat-eq__linha { display: grid; grid-template-columns: minmax(0, 6.5rem) minmax(0, 6rem) auto minmax(0, 8rem) auto; gap: 0.5rem; align-items: start; }
    .mat-eq__igual { padding-top: 0.5rem; font-weight: 600; color: var(--geo-foreground-muted); }
    .mat-eq__exemplo { grid-column: 1 / -1; margin: -0.125rem 0 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .mat-eq__vazio { margin: 0 0 0.75rem; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    @media (max-width: 30rem) {
      .mat-eq__linha { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
      .mat-eq__igual { display: none; }
    }
  `,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Materiais"
        icon="pi pi-box"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Materiais' }]"
        description="Catálogo de materiais: processo, unidade e equivalências, avaliação técnica, centro de investimento e controle de número de série."
        helpLabel="Ajuda sobre materiais"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacao.aberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo material" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="almox-materiais" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Processo" [options]="processosOpcoes()" [(value)]="lista.filters.idProcesso" [clearable]="true" placeholder="Todos"></geo-select>
          <geo-select label="Avaliação técnica" [options]="avaliacoesOpcoes()" [(value)]="lista.filters.idAvaliacaoTecnica" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-select label="Controla nº de série" [options]="opcoesSerie" [(value)]="lista.filters.detalhaSerie"></geo-select>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Materiais"
        mode="server"
        storageKey="almox-materiais"
        exportFileName="materiais"
        searchPlaceholder="Código ou descrição"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo material"
        noResultsTitle="Nenhum material encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os materiais' : 'Nenhum material cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre um material ou importe uma planilha.'"
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
        (emptyAction)="novo()"
        (rowActivate)="editar($event)"
      >
        <ng-template geoCell="codigo" let-row><span class="geo-cell-strong">{{ row.codigo }}</span></ng-template>
        <ng-template geoCell="processo" let-row>
          @if (visualProcesso(row.processo?.nome); as p) {
            <geo-status tone="neutral" [icon]="p.icone">{{ p.rotulo }}</geo-status>
          } @else {
            <span class="geo-cell-muted">—</span>
          }
        </ng-template>
        <ng-template geoCell="unidade" let-row>
          <span class="mat-unidade">
            <span>{{ row.unidadeMedida || 'UN' }}</span>
            @if (row.equivalencias?.length) {
              <geo-status tone="info" icon="pi pi-arrow-right-arrow-left" [title]="frasesDe(row)">{{ row.equivalencias.length === 1 ? '1 equivalência' : row.equivalencias.length + ' equivalências' }}</geo-status>
            }
          </span>
        </ng-template>
        <ng-template geoCell="serie" let-row>
          @if (row.detalhaSerie) {
            <geo-status tone="info" icon="pi-hashtag">Controla</geo-status>
          } @else {
            <span class="geo-cell-muted">Não</span>
          }
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.codigo" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.codigo" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar material' : 'Novo material'" [description]="emEdicao()?.codigo"
      [dirty]="alterado()" size="md">
      <geo-form-section title="Material" icon="pi pi-box">
        <div class="geo-form-grid">
          <geo-text-input label="Código" [required]="true" [value]="codigo()" (valueChange)="codigo.set($event.toUpperCase())" [maxlength]="40" placeholder="Ex.: MAT001" [error]="erro('codigo')"></geo-text-input>
          <geo-text-input label="Unidade de medida" [(value)]="unidade" [maxlength]="10" placeholder="Ex.: MT" [showOptional]="true"></geo-text-input>
        </div>
        <geo-text-input label="Descrição" [required]="true" [(value)]="descricao" [maxlength]="255" placeholder="Ex.: Cabo de cobre 16mm" [error]="erro('descricao')"></geo-text-input>
        <geo-text-input label="SUPR/MATR" [(value)]="suprMatr" [maxlength]="10" placeholder="Ex.: SUPR" [showOptional]="true"></geo-text-input>
      </geo-form-section>
      <geo-form-section title="Processo" icon="pi pi-sitemap" description="Define em quais solicitações o material pode ser pedido e separa o saldo do comercial e de obras.">
        <geo-select label="Processo do material" [required]="true" [options]="processosOpcoes()" [(value)]="idProcesso"
          [description]="dicaProcesso()" [error]="erro('idProcesso')"></geo-select>
      </geo-form-section>
      <geo-form-section title="Unidades equivalentes" icon="pi pi-arrow-right-arrow-left"
        [description]="'O saldo fica sempre em ' + base() + '. Cadastre outras unidades para receber, entregar ou lançar nas notas e o GEO converte.'">
        @if (equivalencias().length) {
          <ul class="mat-eq" aria-label="Unidades equivalentes">
            @for (e of equivalencias(); track e.chave; let i = $index) {
              <li class="mat-eq__linha">
                <geo-number-input class="mat-eq__qtd" [label]="'Quantidade na outra unidade, linha ' + (i + 1)" [labelVisible]="false" [min]="0" [maxFractionDigits]="6"
                  [value]="e.quantidadeUnidade" (valueChange)="alterarEquivalencia(i, { quantidadeUnidade: $event })" [error]="erroEquivalencia(e, 'quantidadeUnidade')"></geo-number-input>
                <geo-text-input class="mat-eq__unidade" [label]="'Outra unidade, linha ' + (i + 1)" [labelVisible]="false" [maxlength]="10" placeholder="Ex.: KG"
                  [value]="e.unidade" (valueChange)="alterarEquivalencia(i, { unidade: $event.toUpperCase() })" [error]="erroEquivalencia(e, 'unidade')"></geo-text-input>
                <span class="mat-eq__igual" aria-hidden="true">=</span>
                <geo-number-input class="mat-eq__qtd" [label]="'Quantidade em ' + base() + ', linha ' + (i + 1)" [labelVisible]="false" [min]="0" [maxFractionDigits]="6"
                  [suffix]="' ' + base()" [value]="e.quantidadeBase" (valueChange)="alterarEquivalencia(i, { quantidadeBase: $event })" [error]="erroEquivalencia(e, 'quantidadeBase')"></geo-number-input>
                <geo-icon-button icon="pi pi-trash" [label]="'Tirar a equivalência ' + (e.unidade || (i + 1))" tooltip="Tirar" size="icon-sm" (pressed)="removerEquivalencia(i)"></geo-icon-button>
                @if (exemplo(e); as ex) {
                  <p class="mat-eq__exemplo"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ ex }}</p>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="mat-eq__vazio">Nenhuma equivalência. Ex.: cabo controlado em MT e recebido em KG (1 KG = 4,2 MT), ou rolo de fita em UN usado em metros nas notas (20 M = 1 UN).</p>
        }
        <geo-button variant="outline" size="sm" icon="pi pi-plus" label="Adicionar equivalência" (pressed)="adicionarEquivalencia()"></geo-button>
      </geo-form-section>
      <geo-form-section title="Classificação" icon="pi pi-sliders-h">
        <div class="geo-form-grid">
          <geo-select label="Avaliação técnica" [options]="avaliacoesOpcoes()" [(value)]="idAvaliacao" [filter]="true" [clearable]="true" [showOptional]="true"></geo-select>
          <geo-select label="Centro de investimento" [options]="centrosOpcoes()" [(value)]="idCentro" [filter]="true" [clearable]="true" [showOptional]="true"></geo-select>
        </div>
        <geo-boolean-control label="Controla número de série" kind="toggle" [(value)]="detalhaSerie"
          description="Exige informar o número de série em cada movimentação."></geo-boolean-control>
        <geo-boolean-control [label]="emEdicao() ? 'Material ativo' : 'Cadastrar já ativo'" kind="toggle" [(value)]="ativo"></geo-boolean-control>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar material'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar materiais"
      description="Planilha CSV com código, descrição, unidade, SUPR/MATR, avaliação, centro de investimento e se controla nº de série."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="codigo" let-row>
            @if (row.editing) { <geo-text-input label="Código" [labelVisible]="false" [(value)]="row.codigo"></geo-text-input> } @else { {{ row.codigo }} }
          </ng-template>
          <ng-template geoCell="descricao" let-row>
            @if (row.editing) { <geo-text-input label="Descrição" [labelVisible]="false" [(value)]="row.descricao"></geo-text-input> } @else { {{ row.descricao }} }
          </ng-template>
          <ng-template geoCell="unidade" let-row>
            @if (row.editing) { <geo-text-input label="Unidade" [labelVisible]="false" [(value)]="row.unidadeMedida"></geo-text-input> } @else { {{ row.unidadeMedida || '—' }} }
          </ng-template>
          <ng-template geoCell="serie" let-row>
            @if (row.editing) {
              <geo-boolean-control label="Controla nº de série" [inline]="true" [(value)]="row.detalhaSerie"></geo-boolean-control>
            } @else {
              {{ row.detalhaSerie ? 'Sim' : 'Não' }}
            }
          </ng-template>
          <ng-template geoCell="status" let-row>
            <geo-status [tone]="situacao(row.status).tone" [icon]="situacao(row.status).icon">{{ situacao(row.status).label }}</geo-status>
            @if (row.mensagemErro) {
              <span class="geo-cell-muted">{{ row.mensagemErro }}</span>
            }
          </ng-template>
          <ng-template geoRowActions let-row>
            <span class="geo-table-actions">
              @if (row.editing) {
                <geo-icon-button icon="pi pi-check" [label]="'Concluir correção da linha ' + row.linha" size="icon-sm" (pressed)="importacao.concluirCorrecao(row)"></geo-icon-button>
              } @else {
                <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir linha ' + row.linha" size="icon-sm" (pressed)="row.editing = true"></geo-icon-button>
                <geo-icon-button icon="pi pi-trash" [label]="'Remover linha ' + row.linha" size="icon-sm" (pressed)="importacao.remover(row)"></geo-icon-button>
              }
            </span>
          </ng-template>
        </geo-data-table>
      }
    </geo-import-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Materiais" entidadePlural="materiais" busca="código ou descrição" rotuloNovo="Novo material" [importacao]="true">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-hashtag"></i> Número de série</h4>
        <p class="help-text-desc">Materiais que controlam nº de série exigem o número em cada entrada, saída e transferência.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class MateriaisComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly importacaoService = inject(ImportacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly rh = inject(RhService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly opcoesSerie = OPCOES_SERIE;
  protected readonly avaliacoes = signal<AvaliacaoMaterialResponse[]>([]);
  protected readonly centros = signal<CentroInvestimentoResponse[]>([]);
  protected readonly processos = signal<ProcessoNegocioResponse[]>([]);
  protected readonly processosOpcoes = computed<GeoSelectOption<string>[]>(() =>
    this.processos().map((p) => ({ label: processoMaterial(p.nome)?.rotulo ?? p.nome, value: p.id })));
  protected readonly visualProcesso = processoMaterial;
  protected readonly avaliacoesOpcoes = computed<GeoSelectOption<string>[]>(() => this.avaliacoes().map((a) => ({ label: a.nome, value: a.id })));
  protected readonly centrosOpcoes = computed<GeoSelectOption<string>[]>(() => this.centros().map((c) => ({ label: c.codigo, value: c.id })));

  protected readonly lista = geoListState({
    storageKey: 'almox-materiais',
    filters: {
      idProcesso: geoFilter.value<string | null>(null, {
        label: 'Processo',
        param: 'processo',
        format: (id): string | null => (id ? (processoMaterial(this.processos().find((p) => p.id === id)?.nome)?.rotulo ?? 'processo selecionado') : null)
      }),
      idAvaliacaoTecnica: geoFilter.value<string | null>(null, {
        label: 'Avaliação',
        param: 'avaliacao',
        format: (id): string | null => (id ? (this.avaliacoes().find((a) => a.id === id)?.nome ?? 'avaliação selecionada') : null)
      }),
      detalhaSerie: geoFilter.value<boolean | null>(null, { label: 'Nº de série', param: 'serie', options: () => OPCOES_SERIE }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'codigo', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<MaterialResponse>(
    (pedido) => this.almoxarifado.listarMateriais({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.almoxarifado.listarMateriais({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<MaterialResponse>[] = [
    { key: 'codigo', header: 'Código', type: 'custom', priority: 1, sortField: 'codigo', width: '9rem', value: (m) => m.codigo, display: (m) => m.codigo },
    { key: 'descricao', header: 'Descrição', priority: 1, sortField: 'descricao' },
    { key: 'processo', header: 'Processo', type: 'custom', sortable: false, width: '9rem', value: (m) => m.processo?.nome, display: (m) => processoMaterial(m.processo?.nome)?.rotulo ?? '—' },
    { key: 'unidade', header: 'Unidade', type: 'custom', sortField: 'unidadeMedida', width: '11rem', value: (m) => m.unidadeMedida, display: (m) => m.unidadeMedida || '—' },
    { key: 'avaliacao', header: 'Avaliação', sortField: 'avaliacaoTecnica.nome', value: (m) => m.avaliacaoTecnica?.nome, display: (m) => m.avaliacaoTecnica?.nome ?? '—' },
    { key: 'serie', header: 'Nº de série', type: 'custom', sortField: 'detalhaSerie', value: (m) => m.detalhaSerie, display: (m) => (m.detalhaSerie ? 'Sim' : 'Não') },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (m) => m.ativo, display: (m) => (m.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (m: MaterialResponse) => m.codigo;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<MaterialResponse | null>(null);
  protected readonly codigo = signal('');
  protected readonly descricao = signal('');
  protected readonly unidade = signal('');
  protected readonly suprMatr = signal('');
  protected readonly idAvaliacao = signal<string | null>(null);
  protected readonly idCentro = signal<string | null>(null);
  protected readonly detalhaSerie = signal(false);
  protected readonly idProcesso = signal<string | null>(null);
  protected readonly equivalencias = signal<LinhaEquivalencia[]>([]);
  protected readonly ativo = signal(true);
  protected readonly base = computed(() => unidadeBase({ unidadeMedida: this.unidade().trim() }));
  protected readonly dicaProcesso = computed(() => {
    const nome = this.processos().find((p) => p.id === this.idProcesso())?.nome;
    return nome ? ondeOMaterialEntra(nome) + '.' : 'Obras atende a solicitação técnica e o fechamento; os demais, a comercial.';
  });
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const m = this.emEdicao();
    const atual = [this.codigo(), this.descricao(), this.unidade(), this.suprMatr(), this.idAvaliacao(), this.idCentro(), this.detalhaSerie(), this.ativo(),
      this.idProcesso(), JSON.stringify(this.equivalencias().map(({ chave, ...e }) => e))];
    const original = m
      ? [m.codigo, m.descricao, m.unidadeMedida ?? '', m.suprMatrFlag ?? '', m.avaliacaoTecnica?.id ?? null, m.centroInvestimento?.id ?? null, m.detalhaSerie, m.ativo,
        m.processo?.id ?? this.idComercial(), JSON.stringify((m.equivalencias ?? []).map((e) => ({ unidade: e.unidade, quantidadeUnidade: e.quantidadeUnidade, quantidadeBase: e.quantidadeBase })))]
      : ['', '', '', '', null, null, false, true, this.idComercial(), '[]'];
    return atual.some((v, i) => v !== original[i]);
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.codigo().trim()) e['codigo'] = 'Informe o código.';
    if (!this.descricao().trim()) e['descricao'] = 'Informe a descrição.';
    if (!this.idProcesso()) e['idProcesso'] = 'Escolha o processo.';
    const vistas = new Set<string>();
    this.equivalencias().forEach((l) => {
      const u = l.unidade.trim().toUpperCase();
      if (!u) e[`eq-${l.chave}-unidade`] = 'Informe a unidade.';
      else if (u === this.base()) e[`eq-${l.chave}-unidade`] = `${u} já é a unidade do material.`;
      else if (vistas.has(u)) e[`eq-${l.chave}-unidade`] = `${u} já está na lista.`;
      vistas.add(u);
      if (!((l.quantidadeUnidade ?? 0) > 0)) e[`eq-${l.chave}-quantidadeUnidade`] = 'Maior que zero.';
      if (!((l.quantidadeBase ?? 0) > 0)) e[`eq-${l.chave}-quantidadeBase`] = 'Maior que zero.';
    });
    return e;
  });

  protected readonly importacao = importacaoListagem<MaterialImportacaoDTO>({
    enviar: (arquivo) => this.almoxarifado.importarMateriais(arquivo),
    confirmar: (materiais) => this.almoxarifado.confirmarImportacaoMateriais({ materiais }),
    modelo: () => this.importacaoService.baixarModeloCsv('/v1/materiais/importar/modelo', 'modelo-materiais.csv'),
    aoProcessar: () => this.lista.reload()
  });
  protected readonly situacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;
  protected readonly colunasImportacao: GeoDataTableColumn<MaterialImportacaoDTO>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'codigo', header: 'Código', type: 'custom', priority: 1, value: (r) => r.codigo },
    { key: 'descricao', header: 'Descrição', type: 'custom', value: (r) => r.descricao },
    { key: 'unidade', header: 'Unidade', type: 'custom', value: (r) => r.unidadeMedida },
    { key: 'avaliacao', header: 'Avaliação', value: (r) => r.nomeAvaliacao, display: (r) => r.nomeAvaliacao || '—' },
    { key: 'centro', header: 'Centro de investimento', value: (r) => r.codigoCentroInvestimento, display: (r) => r.codigoCentroInvestimento || '—' },
    { key: 'serie', header: 'Nº de série', type: 'custom', value: (r) => r.detalhaSerie },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  constructor() {
    this.rh.listarProcessosAtivos().subscribe({ next: (r) => this.processos.set(r.content ?? []), error: () => undefined });
    this.almoxarifado.listarAvaliacoesAtivas().subscribe({ next: (r) => this.avaliacoes.set(r.content ?? []), error: () => undefined });
    this.almoxarifado.listarCentrosInvestimentoAtivos().subscribe({ next: (r) => this.centros.set(r.content ?? []), error: () => undefined });
  }

  private filtro() {
    const { filters, query } = this.lista.request();
    return {
      idAvaliacaoTecnica: filters.idAvaliacaoTecnica ?? undefined,
      idProcesso: filters.idProcesso ?? undefined,
      detalhaSerie: filters.detalhaSerie ?? undefined,
      ativo: filters.ativo ?? undefined,
      buscaGlobal: query || undefined
    };
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(m: MaterialResponse): void {
    this.preencher(m);
    this.formularioAberto.set(true);
  }

  private preencher(m: MaterialResponse | null): void {
    this.emEdicao.set(m);
    this.codigo.set(m?.codigo ?? '');
    this.descricao.set(m?.descricao ?? '');
    this.unidade.set(m?.unidadeMedida ?? '');
    this.suprMatr.set(m?.suprMatrFlag ?? '');
    this.idAvaliacao.set(m?.avaliacaoTecnica?.id ?? null);
    this.idCentro.set(m?.centroInvestimento?.id ?? null);
    this.detalhaSerie.set(m?.detalhaSerie ?? false);
    this.idProcesso.set(m?.processo?.id ?? this.idComercial());
    this.equivalencias.set((m?.equivalencias ?? []).map((e) => ({ chave: proximaChave++, unidade: e.unidade, quantidadeUnidade: e.quantidadeUnidade, quantidadeBase: e.quantidadeBase })));
    this.ativo.set(m?.ativo ?? true);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const ativo = this.ativo();
    const request: MaterialRequest = {
      codigo: this.codigo().trim(),
      descricao: this.descricao().trim(),
      unidadeMedida: this.unidade().trim() || undefined,
      suprMatrFlag: this.suprMatr().trim() || undefined,
      idAvaliacaoTecnica: this.idAvaliacao() ?? undefined,
      idCentroInvestimento: this.idCentro() ?? undefined,
      detalhaSerie: this.detalhaSerie(),
      idProcesso: this.idProcesso() ?? undefined,
      equivalencias: this.equivalencias().map((l) => ({
        unidade: l.unidade.trim().toUpperCase(),
        quantidadeUnidade: l.quantidadeUnidade as number,
        quantidadeBase: l.quantidadeBase as number
      }))
    };
    this.salvando.set(true);
    const alternar = (id: string, era: boolean): Observable<unknown> =>
      era === ativo ? of(null) : ativo ? this.almoxarifado.ativarMaterial(id) : this.almoxarifado.desativarMaterial(id);
    const salvar$: Observable<unknown> = atual
      ? this.almoxarifado.atualizarMaterial(atual.id, request).pipe(switchMap(() => alternar(atual.id, atual.ativo)))
      : this.almoxarifado.criarMaterial(request).pipe(switchMap((criado) => (criado ? alternar(criado.id, true) : of(null))));
    salvar$.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Material atualizado.' : 'Material cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private idComercial(): string | null {
    return this.processos().find((p) => p.nome.trim().toUpperCase() === 'COMERCIAL')?.id ?? null;
  }

  protected frasesDe(m: MaterialResponse): string {
    const base = unidadeBase(m);
    return (m.equivalencias ?? []).map((e) => fraseEquivalencia(e, base)).join(' · ');
  }

  protected adicionarEquivalencia(): void {
    this.equivalencias.update((l) => [...l, { chave: proximaChave++, unidade: '', quantidadeUnidade: 1, quantidadeBase: null }]);
  }

  protected alterarEquivalencia(indice: number, mudanca: Partial<Omit<LinhaEquivalencia, 'chave'>>): void {
    this.equivalencias.update((l) => l.map((e, i) => (i === indice ? { ...e, ...mudanca } : e)));
  }

  protected removerEquivalencia(indice: number): void {
    this.equivalencias.update((l) => l.filter((_, i) => i !== indice));
  }

  protected erroEquivalencia(l: LinhaEquivalencia, campo: 'unidade' | 'quantidadeUnidade' | 'quantidadeBase'): string | undefined {
    return this.tentouSalvar() ? this.erros()[`eq-${l.chave}-${campo}`] : undefined;
  }

  /** Mostra a conta com um número redondo, para a pessoa conferir se a equivalência está certa. */
  protected exemplo(l: LinhaEquivalencia): string | null {
    const u = l.unidade.trim().toUpperCase();
    if (!u || !((l.quantidadeUnidade ?? 0) > 0) || !((l.quantidadeBase ?? 0) > 0) || u === this.base()) return null;
    const fator = (l.quantidadeBase as number) / (l.quantidadeUnidade as number);
    const amostra = fator >= 1 ? 10 : Math.max(1, Math.round((l.quantidadeUnidade as number) / 2));
    return `Ex.: ${numero(amostra)} ${u} entram no saldo como ${numero(Math.round(amostra * fator * 1000) / 1000)} ${this.base()}.`;
  }

  protected async alternar(m: MaterialResponse): Promise<void> {
    const desativar = m.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar material' : 'Ativar material',
      message: desativar ? `${m.codigo} deixa de aparecer nas seleções. O saldo e o histórico são mantidos.` : `${m.codigo} volta a aparecer nas seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.almoxarifado.desativarMaterial(m.id) : this.almoxarifado.ativarMaterial(m.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Material desativado.' : 'Material ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(m: MaterialResponse): void {
    this.auditoria().show(m.id, m.codigo, {
      codigo: 'Código',
      descricao: 'Descrição',
      unidadeMedida: 'Unidade de medida',
      suprMatrFlag: 'SUPR/MATR',
      detalhaSerie: 'Controla nº de série',
      ativo: 'Status'
    });
  }
}
