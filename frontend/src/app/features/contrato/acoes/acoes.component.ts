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
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
  geoFilter,
  geoImportStatus,
  geoListState
} from '@geo/ui';
import { Observable, of, switchMap } from 'rxjs';

import { AcaoImportacaoDTO, AcaoResponse } from '../../../core/models/contrato.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ContratoService } from '../../../core/services/contrato.service';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

@Component({
  selector: 'app-acoes',
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
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Ações"
        icon="pi pi-bolt"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Cadastros' }, { label: 'Ações' }]"
        description="Catálogo de serviços (ações) executados em campo. Os valores por contrato ficam em Valores de ações."
        helpLabel="Ajuda sobre ações"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacao.aberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Nova ação" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="acoes" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Ações"
        mode="server"
        storageKey="acoes"
        exportFileName="acoes"
        searchPlaceholder="Código ou nome da ação"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Nova ação"
        noResultsTitle="Nenhuma ação encontrada com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as ações' : 'Nenhuma ação cadastrada'"
        [stateDescription]="resultado.error() ?? 'Cadastre uma ação ou importe uma planilha.'"
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
        <ng-template geoCell="nome" let-row>
          {{ row.nome }}
          @if (row.improdutiva) {
            <geo-status tone="warning" icon="pi pi-times-circle" emphasis="soft">Improdutivo: não conta na meta física</geo-status>
          }
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativa' : 'Inativa' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.codigo" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.codigo" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar ação' : 'Nova ação'" [description]="$safeNavigationMigration(emEdicao()?.codigo)"
      [dirty]="alterado()" size="md">
      <geo-form-section title="Ação" icon="pi pi-bolt">
        <div class="geo-form-grid">
          <geo-text-input label="Código" [required]="true" [value]="codigo()" (valueChange)="codigo.set($event.toUpperCase())" [maxlength]="20" placeholder="Ex.: SERV01" [error]="erro('codigo')"></geo-text-input>
          <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="255" [error]="erro('nome')"></geo-text-input>
        </div>
        <geo-boolean-control [label]="emEdicao() ? 'Ação ativa' : 'Cadastrar já ativa'" kind="toggle" [(value)]="ativo"></geo-boolean-control>
      </geo-form-section>
      <geo-form-section title="Meta física" icon="pi pi-bullseye">
        <geo-boolean-control label="Serviço improdutivo" kind="toggle" [(value)]="improdutiva"
          description="Serviço não efetuado (sem acesso ao padrão, defeito técnico, não executado). A nota em que todos os serviços são improdutivos não conta para a meta física da Concessionária; basta um serviço produtivo para a nota contar."></geo-boolean-control>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar ação'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar ações" description="Planilha CSV com código e nome de cada ação."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="codigo" let-row>
            @if (row.editing) { <geo-text-input label="Código" [labelVisible]="false" [(value)]="row.codigo"></geo-text-input> } @else { {{ row.codigo }} }
          </ng-template>
          <ng-template geoCell="nome" let-row>
            @if (row.editing) { <geo-text-input label="Nome" [labelVisible]="false" [(value)]="row.nome"></geo-text-input> } @else { {{ row.nome }} }
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
    <app-ajuda-listagem #ajuda titulo="Ações" entidadePlural="ações" busca="código ou nome" rotuloNovo="Nova ação" [importacao]="true"></app-ajuda-listagem>
  `
})
export class AcoesComponent {
  private readonly contratos = inject(ContratoService);
  private readonly importacaoService = inject(ImportacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;

  protected readonly lista = geoListState({
    storageKey: 'acoes',
    filters: {
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'codigo', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<AcaoResponse>(
    (pedido) => this.contratos.listarAcoes({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.contratos.listarAcoes({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<AcaoResponse>[] = [
    { key: 'codigo', header: 'Código', type: 'custom', priority: 1, sortField: 'codigo', width: '10rem', value: (a) => a.codigo, display: (a) => a.codigo },
    { key: 'nome', header: 'Nome', type: 'custom', priority: 1, sortField: 'nome', value: (a) => a.nome, display: (a) => (a.improdutiva ? `${a.nome} (improdutivo)` : a.nome) },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (a) => a.ativo, display: (a) => (a.ativo ? 'Ativa' : 'Inativa') }
  ];
  protected readonly rotulo = (a: AcaoResponse) => a.codigo;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<AcaoResponse | null>(null);
  protected readonly codigo = signal('');
  protected readonly nome = signal('');
  protected readonly ativo = signal(true);
  protected readonly improdutiva = signal(false);
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const a = this.emEdicao();
    if (!a) return !!(this.codigo() + this.nome()).trim() || !this.ativo() || this.improdutiva();
    return this.codigo() !== a.codigo || this.nome() !== a.nome || this.ativo() !== a.ativo || this.improdutiva() !== !!a.improdutiva;
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.codigo().trim()) e['codigo'] = 'Informe o código.';
    if (!this.nome().trim()) e['nome'] = 'Informe o nome.';
    return e;
  });

  protected readonly importacao = importacaoListagem<AcaoImportacaoDTO>({
    enviar: (arquivo) => this.contratos.importarAcoes(arquivo),
    confirmar: (acoes) => this.contratos.confirmarImportacaoAcoes({ acoes }),
    modelo: () => this.importacaoService.baixarModeloCsv('/v1/contratos/acoes/importar/modelo', 'modelo-acoes.csv'),
    aoProcessar: () => this.lista.reload()
  });
  protected readonly situacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;
  protected readonly colunasImportacao: GeoDataTableColumn<AcaoImportacaoDTO>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'codigo', header: 'Código', type: 'custom', priority: 1, value: (r) => r.codigo },
    { key: 'nome', header: 'Nome', type: 'custom', value: (r) => r.nome },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ativo: filters.ativo, buscaGlobal: query || undefined };
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(a: AcaoResponse): void {
    this.preencher(a);
    this.formularioAberto.set(true);
  }

  private preencher(a: AcaoResponse | null): void {
    this.emEdicao.set(a);
    this.codigo.set(a?.codigo ?? '');
    this.nome.set(a?.nome ?? '');
    this.ativo.set(a?.ativo ?? true);
    this.improdutiva.set(!!a?.improdutiva);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const ativo = this.ativo();
    const request = { codigo: this.codigo().trim(), nome: this.nome().trim(), improdutiva: this.improdutiva() };
    this.salvando.set(true);
    const alternar = (id: string, era: boolean): Observable<unknown> =>
      era === ativo ? of(null) : ativo ? this.contratos.ativarAcao(id) : this.contratos.desativarAcao(id);
    const salvar$: Observable<unknown> = atual
      ? this.contratos.atualizarAcao(atual.id, request).pipe(switchMap(() => alternar(atual.id, atual.ativo)))
      : this.contratos.criarAcao(request).pipe(switchMap((criada) => (criada ? alternar(criada.id, true) : of(null))));
    salvar$.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Ação atualizada.' : 'Ação cadastrada.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(a: AcaoResponse): Promise<void> {
    const desativar = a.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar ação' : 'Ativar ação',
      message: desativar ? `${a.codigo} deixa de aparecer nas seleções. O histórico é mantido.` : `${a.codigo} volta a aparecer nas seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.contratos.desativarAcao(a.id) : this.contratos.ativarAcao(a.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Ação desativada.' : 'Ação ativada.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(a: AcaoResponse): void {
    this.auditoria().show(a.id, a.codigo, { codigo: 'Código', nome: 'Nome', ativo: 'Status' });
  }
}
