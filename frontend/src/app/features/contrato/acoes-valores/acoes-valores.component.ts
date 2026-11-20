import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoImportDrawerComponent,
  GeoListShortcutsDirective,
  GeoNumberInputComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  NotificationService,
  geoFilter,
  geoImportStatus,
  geoListState
} from '@geo/ui';
import { Observable, of, switchMap } from 'rxjs';

import { AcaoResponse, AcaoValorImportacaoDTO, AcaoValorRequest, AcaoValorResponse, ContratoResponse } from '../../../core/models/contrato.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ContratoService } from '../../../core/services/contrato.service';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, dataIso, dataLocal, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

@Component({
  selector: 'app-acoes-valores',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoImportDrawerComponent,
    GeoListShortcutsDirective,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Valores de ações"
        icon="pi pi-dollar"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Cadastros' }, { label: 'Valores de ações' }]"
        description="Valor base de cada ação por contrato, a partir de uma data de vigência."
        helpLabel="Ajuda sobre valores de ações"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacao.aberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo valor" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="acoes-valores" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Ação" [options]="acoesOpcoes()" [(value)]="lista.filters.idAcao" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-select label="Contrato" [options]="contratosOpcoes()" [(value)]="lista.filters.idContrato" [clearable]="true" [filter]="true" placeholder="Todos"></geo-select>
          <geo-datepicker label="Vigência" [value]="dataLocal(lista.filters.vigencia())" [clearable]="true" (valueChange)="lista.filters.vigencia.set(dataIso($event))"></geo-datepicker>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Valores de ações"
        mode="server"
        [textFit]="{ minColumnWidth: '7.5rem', maxLines: 1 }"
        storageKey="acoes-valores"
        exportFileName="valores-de-acoes"
        searchPlaceholder="Ação ou contrato"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo valor"
        noResultsTitle="Nenhum valor encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os valores' : 'Nenhum valor cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre o valor de uma ação por contrato ou importe uma planilha.'"
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
        <ng-template geoCell="acao" let-row>
          <span class="geo-cell-strong">{{ row.acao?.codigo }}</span>
          <span class="geo-cell-muted">{{ row.acao?.nome }}</span>
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + rotulo(row)" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + rotulo(row)" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar valor' : 'Novo valor'" [description]="emEdicao() ? rotulo(emEdicao()!) : undefined"
      [dirty]="alterado()" size="md">
      <geo-form-section title="Valor da ação" icon="pi pi-dollar">
        <geo-select label="Ação" [required]="true" [options]="acoesOpcoes()" [(value)]="idAcao" [filter]="true" [error]="erro('acao')"></geo-select>
        <geo-select label="Contrato" [required]="true" [options]="contratosOpcoes()" [(value)]="idContrato" [filter]="true" [error]="erro('contrato')"></geo-select>
        <div class="geo-form-grid">
          <geo-number-input label="Valor base" [required]="true" mode="currency" currency="BRL" locale="pt-BR" [min]="0" [(value)]="valorBase" [error]="erro('valor')"></geo-number-input>
          <geo-datepicker label="Início da vigência" [required]="true" [(value)]="vigencia" [readonly]="!!emEdicao()"
            [description]="emEdicao() ? 'Para mudar a vigência, cadastre um novo valor.' : undefined" [error]="erro('vigencia')"></geo-datepicker>
        </div>
        <geo-boolean-control [label]="emEdicao() ? 'Valor ativo' : 'Cadastrar já ativo'" kind="toggle" [(value)]="ativo"></geo-boolean-control>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar valor'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar valores de ações"
      description="Planilha CSV com código da ação, número do contrato, valor base e início da vigência."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="acao" let-row>
            @if (row.editing) {
              <geo-select label="Ação" [labelVisible]="false" [options]="acoesPorCodigo()" [(value)]="row.codigoAcao" [filter]="true"></geo-select>
            } @else {
              {{ row.codigoAcao }}
            }
          </ng-template>
          <ng-template geoCell="contrato" let-row>
            @if (row.editing) {
              <geo-select label="Contrato" [labelVisible]="false" [options]="contratosPorNumero()" [(value)]="row.numeroContrato" [filter]="true"></geo-select>
            } @else {
              {{ row.numeroContrato }}
            }
          </ng-template>
          <ng-template geoCell="valor" let-row>
            @if (row.editing) {
              <geo-number-input label="Valor base" [labelVisible]="false" mode="currency" currency="BRL" locale="pt-BR" [(value)]="row.valorBase"></geo-number-input>
            } @else {
              {{ reais(row.valorBase) }}
            }
          </ng-template>
          <ng-template geoCell="vigencia" let-row>
            @if (row.editing) {
              <geo-datepicker label="Vigência" [labelVisible]="false" [value]="dataLocal(row.dataVigencia)" (valueChange)="row.dataVigencia = dataIso($event) ?? ''"></geo-datepicker>
            } @else {
              {{ dataBr(row.dataVigencia) }}
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
    <app-ajuda-listagem #ajuda titulo="Valores de ações" entidadePlural="valores" busca="ação ou contrato" rotuloNovo="Novo valor" [importacao]="true">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-calendar"></i> Vigência</h4>
        <p class="help-text-desc">Cada valor vale a partir da data de vigência. Para reajustar, cadastre um novo valor com a nova data; o anterior continua no histórico.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class AcoesValoresComponent {
  private readonly contratos = inject(ContratoService);
  private readonly importacaoService = inject(ImportacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly dataLocal = dataLocal;
  protected readonly dataIso = dataIso;

  protected readonly acoes = signal<AcaoResponse[]>([]);
  protected readonly contratosAtivos = signal<ContratoResponse[]>([]);
  protected readonly acoesOpcoes = computed<GeoSelectOption<string>[]>(() => this.acoes().map((a) => ({ label: `${a.codigo} · ${a.nome}`, value: a.id })));
  protected readonly contratosOpcoes = computed<GeoSelectOption<string>[]>(() =>
    this.contratosAtivos().map((c) => ({ label: c.cliente ? `${c.numeroContrato} · ${c.cliente}` : c.numeroContrato, value: c.id }))
  );
  protected readonly acoesPorCodigo = computed(() => this.acoes().map((a) => ({ label: `${a.codigo} · ${a.nome}`, value: a.codigo })));
  protected readonly contratosPorNumero = computed(() => this.contratosAtivos().map((c) => ({ label: c.numeroContrato, value: c.numeroContrato })));

  protected readonly lista = geoListState({
    storageKey: 'acoes-valores',
    filters: {
      idAcao: geoFilter.value<string | null>(null, {
        label: 'Ação',
        param: 'acao',
        format: (id): string | null => (id ? (this.acoes().find((a) => a.id === id)?.codigo ?? 'ação selecionada') : null)
      }),
      idContrato: geoFilter.value<string | null>(null, {
        label: 'Contrato',
        param: 'contrato',
        format: (id): string | null => (id ? (this.contratosAtivos().find((c) => c.id === id)?.numeroContrato ?? 'contrato selecionado') : null)
      }),
      vigencia: geoFilter.date(null, { label: 'Vigência' }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'vigencia', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<AcaoValorResponse>(
    (pedido) => this.contratos.listarAcoesValores({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.contratos.listarAcoesValores({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<AcaoValorResponse>[] = [
    { key: 'acao', header: 'Ação', type: 'custom', priority: 1, sortField: 'acao.codigo', value: (v) => v.acao?.codigo, display: (v) => `${v.acao?.codigo ?? ''} · ${v.acao?.nome ?? ''}` },
    { key: 'contrato', header: 'Contrato', priority: 1, sortField: 'contrato.numeroContrato', value: (v) => v.contrato?.numeroContrato, display: (v) => v.contrato?.numeroContrato ?? '—' },
    { key: 'valor', header: 'Valor base', type: 'currency', sortField: 'valorBase', value: (v) => v.valorBase },
    { key: 'vigencia', header: 'Vigência', type: 'date', sortField: 'dataVigencia', value: (v) => v.dataVigencia },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (v) => v.ativo, display: (v) => (v.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (v: AcaoValorResponse) => `${v.acao?.codigo ?? 'Ação'} no contrato ${v.contrato?.numeroContrato ?? ''}`.trim();

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<AcaoValorResponse | null>(null);
  protected readonly idAcao = signal<string | null>(null);
  protected readonly idContrato = signal<string | null>(null);
  protected readonly valorBase = signal<number | null>(null);
  protected readonly vigencia = signal<Date | null>(null);
  protected readonly ativo = signal(true);
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const v = this.emEdicao();
    if (!v) return !!this.idAcao() || !!this.idContrato() || !!this.valorBase() || !!this.vigencia() || !this.ativo();
    return this.idAcao() !== v.acao?.id || this.idContrato() !== v.contrato?.id || this.valorBase() !== v.valorBase || this.ativo() !== v.ativo;
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.idAcao()) e['acao'] = 'Escolha a ação.';
    if (!this.idContrato()) e['contrato'] = 'Escolha o contrato.';
    if (!this.valorBase() || this.valorBase()! < 0.01) e['valor'] = 'Informe um valor maior que zero.';
    if (!this.vigencia()) e['vigencia'] = 'Informe o início da vigência.';
    return e;
  });

  protected readonly importacao = importacaoListagem<AcaoValorImportacaoDTO>({
    enviar: (arquivo) => this.contratos.importarAcoesValores(arquivo),
    confirmar: (registros) => this.contratos.confirmarImportacaoAcoesValores({ registros }),
    modelo: () => this.importacaoService.baixarModeloCsv('/v1/contratos/acoes/valores/importar/modelo', 'modelo-acoes-valores.csv'),
    aoProcessar: () => this.lista.reload()
  });
  protected readonly situacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;
  protected readonly colunasImportacao: GeoDataTableColumn<AcaoValorImportacaoDTO>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'acao', header: 'Ação', type: 'custom', priority: 1, value: (r) => r.codigoAcao },
    { key: 'contrato', header: 'Contrato', type: 'custom', value: (r) => r.numeroContrato },
    { key: 'valor', header: 'Valor base', type: 'custom', value: (r) => r.valorBase },
    { key: 'vigencia', header: 'Vigência', type: 'custom', value: (r) => r.dataVigencia },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  constructor() {
    this.contratos.listarAcoesAtivas().subscribe({ next: (r) => this.acoes.set(r.content ?? []), error: () => undefined });
    this.contratos.listarContratosAtivos().subscribe({ next: (r) => this.contratosAtivos.set(r.content ?? []), error: () => undefined });
  }

  private filtro() {
    const { filters, query } = this.lista.request();
    return {
      idAcao: filters.idAcao ?? undefined,
      idContrato: filters.idContrato ?? undefined,
      dataVigencia: filters.vigencia ?? undefined,
      ativo: filters.ativo,
      buscaGlobal: query || undefined
    };
  }

  protected reais(valor: number | null | undefined): string {
    return valor === null || valor === undefined ? '—' : REAIS.format(valor);
  }

  protected dataBr(iso: string | undefined): string {
    const d = dataLocal(iso);
    return d ? d.toLocaleDateString('pt-BR') : (iso ?? '—');
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(v: AcaoValorResponse): void {
    this.preencher(v);
    this.formularioAberto.set(true);
  }

  private preencher(v: AcaoValorResponse | null): void {
    this.emEdicao.set(v);
    this.idAcao.set(v?.acao?.id ?? null);
    this.idContrato.set(v?.contrato?.id ?? null);
    this.valorBase.set(v?.valorBase ?? null);
    this.vigencia.set(dataLocal(v?.dataVigencia));
    this.ativo.set(v?.ativo ?? true);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const ativo = this.ativo();
    const request: AcaoValorRequest = { idAcao: this.idAcao()!, idContrato: this.idContrato()!, valorBase: this.valorBase()!, dataVigencia: dataIso(this.vigencia())! };
    this.salvando.set(true);
    const alternar = (id: string, era: boolean): Observable<unknown> =>
      era === ativo ? of(null) : ativo ? this.contratos.ativarAcaoValor(id) : this.contratos.desativarAcaoValor(id);
    const salvar$: Observable<unknown> = atual
      ? this.contratos.atualizarAcaoValor(atual.id, request).pipe(switchMap(() => alternar(atual.id, atual.ativo)))
      : this.contratos.criarAcaoValor(request).pipe(switchMap((criado) => (criado ? alternar(criado.id, true) : of(null))));
    salvar$.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Valor atualizado.' : 'Valor cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(v: AcaoValorResponse): Promise<void> {
    const desativar = v.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar valor' : 'Ativar valor',
      message: desativar ? `O valor de ${this.rotulo(v)} deixa de ser usado no faturamento.` : `O valor de ${this.rotulo(v)} volta a valer.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.contratos.desativarAcaoValor(v.id) : this.contratos.ativarAcaoValor(v.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Valor desativado.' : 'Valor ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(v: AcaoValorResponse): void {
    this.auditoria().show(v.id, v.acao?.codigo ?? 'Valor', {
      idAcao: 'Ação',
      idContrato: 'Contrato',
      valorBase: 'Valor base',
      dataVigencia: 'Vigência',
      ativo: 'Status'
    });
  }
}
