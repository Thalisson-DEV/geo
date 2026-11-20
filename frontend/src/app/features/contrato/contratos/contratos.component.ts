import { Component, ElementRef, OnInit, inject, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoImportDrawerComponent,
  GeoListShortcutsDirective,
  GeoNumberInputComponent,
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
import { GEO_FORM_KIT, GeoFormDrawerComponent, geoValidateForm } from '@geo/ui/forms';

import { ContratoImportacaoDTO, ContratoResponse } from '../../../core/models/contrato.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { bindDrawerToUrl } from '../../../core/navigation';
import { ContratoService } from '../../../core/services/contrato.service';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { DateMaskDirective } from '../../../shared/directives/date-mask.directive';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, dataIso, dataLocal, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

const COEFICIENTE = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

@Component({
  selector: 'app-contratos',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoImportDrawerComponent,
    GeoListShortcutsDirective,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    ...GEO_FORM_KIT,
    AuditDialogComponent,
    AjudaListagemComponent,
    DateMaskDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="showAddDialog()">
      <geo-page-header
        title="Contratos"
        icon="pi pi-file"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Cadastros' }, { label: 'Contratos' }]"
        description="Contratos com o cliente, a vigência e o coeficiente aplicado ao faturamento das ações."
        helpLabel="Ajuda sobre contratos"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacao.aberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo contrato" [keyShortcut]="atalhos.newShortcut()" (pressed)="showAddDialog()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="contratos" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="Cliente" [value]="lista.filters.cliente() ?? ''" (valueChange)="lista.filters.cliente.set($event || null)" placeholder="Ex.: Concessionária"></geo-text-input>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Contratos"
        mode="server"
        storageKey="contratos"
        exportFileName="contratos"
        searchPlaceholder="Número do contrato ou cliente"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo contrato"
        noResultsTitle="Nenhum contrato encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os contratos' : 'Nenhum contrato cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre um contrato ou importe uma planilha.'"
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
        (emptyAction)="showAddDialog()"
        (rowActivate)="editContrato($event)"
      >
        <ng-template geoCell="numero" let-row><span class="geo-cell-strong">{{ row.numeroContrato }}</span></ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.numeroContrato" size="icon-sm" (pressed)="toggleStatus(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.numeroContrato" size="icon-sm" (pressed)="showLogs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <!-- Cadastro de contrato (drawer, formulário único, ?novo=1 / ?editar=<id>) -->
    <geo-form-drawer
      #drawer
      [visible]="drawerUrl.open()"
      (visibleChange)="!$event && drawerUrl.close()"
      [title]="editingId() ? 'Editar contrato' : 'Novo contrato'"
      description="Contratos com o cliente e o coeficiente aplicado ao faturamento das ações."
      [dirty]="contratoForm.dirty"
      [loading]="carregandoContrato()"
      size="md"
    >
      <form [formGroup]="contratoForm" (ngSubmit)="onSave()">
        <geo-form-section title="Identificação" icon="pi pi-file">
          <geo-form-field label="Número do contrato" size="lg">
            <input pInputText formControlName="numeroContrato" pSize="small" placeholder="Ex.: 123/2024" />
          </geo-form-field>
          <geo-form-field label="Cliente" size="lg">
            <input pInputText formControlName="cliente" pSize="small" placeholder="Ex.: Concessionária" />
          </geo-form-field>
        </geo-form-section>
        <geo-form-section title="Vigência" icon="pi pi-calendar">
          <geo-form-field label="Início da vigência" size="lg">
            <p-datepicker formControlName="dataVigencia" dateFormat="dd/mm/yy" dateMask [showIcon]="true" iconDisplay="input" [showButtonBar]="true" placeholder="dd/mm/aaaa" appendTo="body" size="small"></p-datepicker>
          </geo-form-field>
          <geo-form-field label="Encerramento" size="lg">
            <p-datepicker formControlName="dataEncerramento" dateFormat="dd/mm/yy" dateMask [showIcon]="true" iconDisplay="input" [showButtonBar]="true" placeholder="dd/mm/aaaa" appendTo="body" size="small"></p-datepicker>
          </geo-form-field>
        </geo-form-section>
        <geo-form-section title="Faturamento" icon="pi pi-percentage">
          <geo-form-field
            label="Coeficiente de faturamento"
            size="lg"
            hint="Multiplicador do valor base das ações deste contrato (1,0 = sem ajuste)."
            [errorMessages]="{ min: 'Deve ser maior que 0.', max: 'Deve ser no máximo 1000.' }"
          >
            <p-inputNumber
              formControlName="coeficienteFaturamento"
              mode="decimal"
              locale="pt-BR"
              [minFractionDigits]="2"
              [maxFractionDigits]="4"
              [min]="0"
              [max]="1000"
              placeholder="Ex.: 1,0000"
              size="small"
            ></p-inputNumber>
          </geo-form-field>
        </geo-form-section>
        <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
      </form>
      <geo-form-actions
        drawer-footer
        [saving]="saving()"
        [saveAndNew]="!editingId()"
        (save)="onSave()"
        (saveAndNewClick)="onSave(true)"
        (cancel)="drawer.requestClose()"
      ></geo-form-actions>
    </geo-form-drawer>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar contratos"
      description="Planilha CSV com número, cliente, início e fim da vigência e coeficiente de faturamento."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="numero" let-row>
            @if (row.editing) { <geo-text-input label="Número" [labelVisible]="false" [(value)]="row.numeroContrato"></geo-text-input> } @else { {{ row.numeroContrato }} }
          </ng-template>
          <ng-template geoCell="cliente" let-row>
            @if (row.editing) { <geo-text-input label="Cliente" [labelVisible]="false" [(value)]="row.cliente"></geo-text-input> } @else { {{ row.cliente }} }
          </ng-template>
          <ng-template geoCell="inicio" let-row>
            @if (row.editing) {
              <geo-datepicker label="Início" [labelVisible]="false" [value]="dataLocal(row.dataVigencia)" (valueChange)="row.dataVigencia = dataIso($event) ?? ''"></geo-datepicker>
            } @else {
              {{ dataBr(row.dataVigencia) }}
            }
          </ng-template>
          <ng-template geoCell="fim" let-row>
            @if (row.editing) {
              <geo-datepicker label="Encerramento" [labelVisible]="false" [value]="dataLocal(row.dataEncerramento)" (valueChange)="row.dataEncerramento = dataIso($event) ?? ''"></geo-datepicker>
            } @else {
              {{ dataBr(row.dataEncerramento) }}
            }
          </ng-template>
          <ng-template geoCell="coeficiente" let-row>
            @if (row.editing) {
              <geo-number-input label="Coeficiente" [labelVisible]="false" [(value)]="row.coeficienteFaturamento" [min]="0" [max]="1000" [maxFractionDigits]="4"></geo-number-input>
            } @else {
              {{ coeficiente(row.coeficienteFaturamento) }}
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
    <app-ajuda-listagem #ajuda titulo="Contratos" entidadePlural="contratos" busca="número do contrato ou cliente" rotuloNovo="Novo contrato"
      [importacao]="true" video="https://www.youtube.com/embed/m-15hM3xaQU">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-percentage"></i> Coeficiente de faturamento</h4>
        <p class="help-text-desc">Multiplica o valor base das ações do contrato: 1,0 = sem ajuste. Aceita até 4 casas decimais, maior que 0 e até 1000. "Salvar e novo" mantém o painel aberto para o próximo contrato.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class ContratosComponent implements OnInit {
  private readonly contratoService = inject(ContratoService);
  private readonly importacaoService = inject(ImportacaoService);
  private readonly fb = inject(FormBuilder);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly dataLocal = dataLocal;
  protected readonly dataIso = dataIso;

  protected readonly lista = geoListState({
    storageKey: 'contratos',
    filters: {
      cliente: geoFilter.value<string | null>(null, { label: 'Cliente' }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'numero', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<ContratoResponse>(
    (pedido) => this.contratoService.listarContratos({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.contratoService.listarContratos({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<ContratoResponse>[] = [
    { key: 'numero', header: 'Contrato', type: 'custom', priority: 1, sortField: 'numeroContrato', value: (c) => c.numeroContrato, display: (c) => c.numeroContrato },
    { key: 'cliente', header: 'Cliente', priority: 1, sortField: 'cliente' },
    { key: 'inicio', header: 'Início', type: 'date', sortField: 'dataVigencia', value: (c) => c.dataVigencia },
    { key: 'fim', header: 'Término', type: 'date', sortField: 'dataEncerramento', value: (c) => c.dataEncerramento },
    { key: 'coeficiente', header: 'Coeficiente', type: 'number', sortField: 'coeficienteFaturamento', value: (c) => c.coeficienteFaturamento, display: (c) => COEFICIENTE.format(c.coeficienteFaturamento) },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (c) => c.ativo, display: (c) => (c.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (c: ContratoResponse) => c.numeroContrato;

  protected readonly saving = signal(false);
  protected readonly editingId = signal<string | null>(null);
  /** Drawer de cadastro na URL: o voltar do navegador fecha, F5 e link reabrem. */
  protected readonly drawerUrl = bindDrawerToUrl();
  private readonly drawer = viewChild(GeoFormDrawerComponent);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly carregandoContrato = signal(false);
  /** Linha clicada na tabela: evita buscar de novo o registro que já está na tela. */
  private contratoDaLista: ContratoResponse | null = null;

  protected readonly contratoForm: FormGroup = this.fb.group({
    numeroContrato: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    cliente: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    dataVigencia: [null, [Validators.required]],
    dataEncerramento: [null, [Validators.required]],
    coeficienteFaturamento: [null, [Validators.required, Validators.min(0.0001), Validators.max(1000)]]
  });

  protected readonly importacao = importacaoListagem<ContratoImportacaoDTO>({
    enviar: (arquivo) => this.contratoService.importarContratos(arquivo),
    confirmar: (contratos) => this.contratoService.confirmarImportacaoContratos({ contratos }),
    modelo: () => this.importacaoService.baixarModeloCsv('/v1/contratos/importar/modelo', 'modelo-contratos.csv'),
    aoProcessar: () => this.lista.reload()
  });
  protected readonly situacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;
  protected readonly colunasImportacao: GeoDataTableColumn<ContratoImportacaoDTO>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'numero', header: 'Contrato', type: 'custom', priority: 1, value: (r) => r.numeroContrato },
    { key: 'cliente', header: 'Cliente', type: 'custom', value: (r) => r.cliente },
    { key: 'inicio', header: 'Início', type: 'custom', value: (r) => r.dataVigencia },
    { key: 'fim', header: 'Término', type: 'custom', value: (r) => r.dataEncerramento },
    { key: 'coeficiente', header: 'Coeficiente', type: 'custom', value: (r) => r.coeficienteFaturamento },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  ngOnInit() {
    this.drawerUrl.connect((modo, id) => {
      if (modo === 'novo') this.prepararNovo();
      else if (modo === 'editar' && id) this.prepararEdicao(id);
    });
  }

  private filtro() {
    const { filters, query } = this.lista.request();
    return { cliente: filters.cliente?.trim() || undefined, ativo: filters.ativo, buscaGlobal: query || undefined };
  }

  protected coeficiente(valor: number | null | undefined): string {
    return valor === null || valor === undefined ? '—' : COEFICIENTE.format(valor);
  }

  protected dataBr(iso: string | undefined): string {
    const d = dataLocal(iso);
    return d ? d.toLocaleDateString('pt-BR') : (iso ?? '—');
  }

  protected showAddDialog() {
    this.drawerUrl.openNew();
  }

  protected editContrato(contrato: ContratoResponse) {
    this.contratoDaLista = contrato;
    this.drawerUrl.openEdit(contrato.id);
  }

  private prepararNovo() {
    this.editingId.set(null);
    this.contratoForm.reset();
  }

  private prepararEdicao(id: string) {
    this.editingId.set(id);
    const daLista = this.contratoDaLista?.id === id ? this.contratoDaLista : null;
    if (daLista) {
      this.preencher(daLista);
      return;
    }
    // Link direto ou F5 com ?editar=<id>.
    this.contratoForm.reset();
    this.carregandoContrato.set(true);
    this.contratoService.buscarContratoPorId(id).subscribe({
      next: (contrato) => {
        this.carregandoContrato.set(false);
        this.preencher(contrato);
      },
      error: (err) => {
        this.carregandoContrato.set(false);
        this.notificacoes.error(getErrorMessage(err));
        this.drawerUrl.close();
      }
    });
  }

  private preencher(contrato: ContratoResponse) {
    this.contratoForm.reset({
      numeroContrato: contrato.numeroContrato,
      cliente: contrato.cliente,
      dataVigencia: dataLocal(contrato.dataVigencia),
      dataEncerramento: dataLocal(contrato.dataEncerramento),
      coeficienteFaturamento: contrato.coeficienteFaturamento
    });
  }

  protected async toggleStatus(contrato: ContratoResponse) {
    const desativar = contrato.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar contrato' : 'Ativar contrato',
      message: desativar
        ? `${contrato.numeroContrato} deixa de aparecer nas seleções (equipes, valores de ações). O histórico é mantido.`
        : `${contrato.numeroContrato} volta a aparecer nas seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.contratoService.desativarContrato(contrato.id) : this.contratoService.ativarContrato(contrato.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Contrato desativado.' : 'Contrato ativado.');
        this.lista.reload();
      },
      error: (err) => this.notificacoes.error(getErrorMessage(err))
    });
  }

  protected async onSave(novoEmSeguida = false) {
    if (this.saving()) return;
    const painel = document.querySelector('.geo-form-drawer') ?? this.host.nativeElement;
    if (!(await geoValidateForm(this.contratoForm, painel))) return;
    this.saving.set(true);
    const valor = this.contratoForm.value;
    const request = {
      ...valor,
      dataVigencia: dataIso(valor.dataVigencia),
      dataEncerramento: dataIso(valor.dataEncerramento)
    };
    const id = this.editingId();
    (id ? this.contratoService.atualizarContrato(id, request) : this.contratoService.criarContrato(request)).subscribe({
      next: () => this.handleSaveSuccess(!id && novoEmSeguida, !!id),
      error: (err) => {
        this.saving.set(false);
        this.notificacoes.error(getErrorMessage(err));
      }
    });
  }

  private handleSaveSuccess(novoEmSeguida: boolean, edicao: boolean) {
    this.saving.set(false);
    this.notificacoes.success(edicao ? 'Contrato atualizado.' : 'Contrato cadastrado.');
    this.lista.reload();
    if (novoEmSeguida) {
      // "Salvar e novo": limpa, mantém o drawer aberto e o foco no primeiro campo.
      this.prepararNovo();
      this.drawer()?.focusFirstField();
      return;
    }
    this.contratoForm.markAsPristine();
    this.drawerUrl.close();
  }

  protected showLogs(contrato: ContratoResponse) {
    this.auditoria().show(contrato.id, contrato.numeroContrato, {
      numeroContrato: 'Nº do contrato',
      cliente: 'Cliente',
      dataVigencia: 'Data de vigência',
      dataEncerramento: 'Data de encerramento',
      coeficienteFaturamento: 'Coeficiente de faturamento',
      ativo: 'Status'
    });
  }
}
