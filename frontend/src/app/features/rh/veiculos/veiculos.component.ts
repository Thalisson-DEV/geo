import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
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
import { Observable, map, of, switchMap } from 'rxjs';

import { BaseOperacionalResponse, VeiculoImportacaoDTO, VeiculoRequest, VeiculoResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { ImportacaoService } from '../../../core/services/importacao.service';
import { RhService } from '../../../core/services/rh.service';
import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { CHAVE_LINHA_IMPORTACAO, importacaoListagem } from '../../../shared/listagem/importacao-listagem';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

@Component({
  selector: 'app-veiculos',
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
        title="Veículos"
        icon="pi pi-car"
        [breadcrumb]="[{ label: 'Admin' }, { label: 'Cadastros' }, { label: 'Veículos' }]"
        description="Cadastro básico das placas (modelo, fabricante e base). A ficha completa de cada veículo fica no módulo Frota."
        helpLabel="Ajuda sobre veículos"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacao.aberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo veículo" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="rh-veiculos" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-text-input label="Modelo" [value]="lista.filters.modelo() ?? ''" (valueChange)="lista.filters.modelo.set($event || null)" placeholder="Ex.: Hilux"></geo-text-input>
          <geo-select label="Base operacional" [options]="basesOpcoes()" [(value)]="lista.filters.idBaseOperacional" [clearable]="true" [filter]="true" placeholder="Todas"></geo-select>
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Veículos"
        mode="server"
        [textFit]="{ minColumnWidth: '7.5rem', maxLines: 1 }"
        storageKey="rh-veiculos"
        exportFileName="veiculos"
        searchPlaceholder="Placa, modelo ou fabricante"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo veículo"
        noResultsTitle="Nenhum veículo encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os veículos' : 'Nenhum veículo cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre um veículo ou importe uma planilha.'"
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
        <ng-template geoCell="placa" let-row><span class="geo-cell-strong">{{ row.placa }}</span></ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (verFrota) {
              <geo-icon-button icon="pi pi-external-link" [label]="'Abrir a ficha da frota de ' + row.placa" size="icon-sm" (pressed)="abrirFicha(row)"></geo-icon-button>
            }
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.placa" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.placa" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar veículo' : 'Novo veículo'" [description]="$safeNavigationMigration(emEdicao()?.placa)"
      [dirty]="alterado()" size="md">
      <geo-form-section title="Veículo" icon="pi pi-car">
        <div class="geo-form-grid">
          <geo-text-input label="Placa" [required]="true" [value]="placa()" (valueChange)="placa.set($event.toUpperCase())" [maxlength]="8" placeholder="ABC-1234" [error]="erro('placa')"></geo-text-input>
          <geo-text-input label="Modelo" [required]="true" [(value)]="modelo" [maxlength]="100" placeholder="Ex.: Hilux" [error]="erro('modelo')"></geo-text-input>
          <geo-text-input label="Fabricante" [(value)]="fabricante" [maxlength]="100" placeholder="Ex.: Toyota" [showOptional]="true"></geo-text-input>
          <geo-select label="Base operacional" [required]="true" [options]="basesOpcoes()" [(value)]="idBase" [filter]="true" [error]="erro('base')"></geo-select>
        </div>
        @if (emEdicao()) {
          <geo-boolean-control label="Veículo ativo" kind="toggle" [(value)]="ativo"></geo-boolean-control>
        }
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar veículo'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <geo-import-drawer [(visible)]="importacao.aberta" title="Importar veículos" description="Planilha CSV com placa, modelo, fabricante e base."
      [rows]="importacao.linhas()" [uploading]="importacao.enviando()" [processing]="importacao.processando()"
      (templateRequested)="importacao.baixarModelo()" (fileSelected)="importacao.enviarArquivo($event)"
      (processed)="importacao.processar()" (cleared)="importacao.limpar()">
      @if (importacao.linhas().length) {
        <geo-data-table caption="Pré-visualização da importação" [searchable]="false" [columns]="colunasImportacao"
          [rows]="importacao.linhas()" [rowKey]="chaveImportacao" [pageSizeOptions]="[25, 50, 100]">
          <ng-template geoCell="placa" let-row>
            @if (row.editing) { <geo-text-input label="Placa" [labelVisible]="false" [(value)]="row.placa"></geo-text-input> } @else { {{ row.placa }} }
          </ng-template>
          <ng-template geoCell="modelo" let-row>
            @if (row.editing) { <geo-text-input label="Modelo" [labelVisible]="false" [(value)]="row.modelo"></geo-text-input> } @else { {{ row.modelo }} }
          </ng-template>
          <ng-template geoCell="fabricante" let-row>
            @if (row.editing) { <geo-text-input label="Fabricante" [labelVisible]="false" [(value)]="row.fabricante"></geo-text-input> } @else { {{ row.fabricante || '—' }} }
          </ng-template>
          <ng-template geoCell="base" let-row>
            @if (row.editing) {
              <geo-select label="Base" [labelVisible]="false" [options]="basesPorNome()" [(value)]="row.nomeBaseOperacional" [filter]="true"></geo-select>
            } @else {
              {{ row.nomeBaseOperacional || '—' }}
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
    <app-ajuda-listagem #ajuda titulo="Veículos" entidadePlural="veículos" busca="placa, modelo ou fabricante" rotuloNovo="Novo veículo"
      [importacao]="true" video="https://www.youtube.com/embed/LT3yf-0hhhc">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-external-link"></i> Ficha da frota</h4>
        <p class="help-text-desc">Quem tem acesso à frota vê na linha o atalho para a ficha completa do veículo (documentos, condutor, odômetro).</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class VeiculosComponent {
  private readonly rh = inject(RhService);
  private readonly importacaoService = inject(ImportacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly router = inject(Router);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');
  /** O veículo do RH e a ficha da frota são o mesmo registro (1:1). */
  protected readonly verFrota = inject(AuthService).currentUser()?.permissoes?.includes('frota:veiculo:read') ?? false;

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly bases = signal<BaseOperacionalResponse[]>([]);
  protected readonly basesOpcoes = computed<GeoSelectOption<string>[]>(() => this.bases().map((b) => ({ label: b.nome, value: b.id })));
  protected readonly basesPorNome = computed<GeoSelectOption<string>[]>(() => this.bases().map((b) => ({ label: b.nome, value: b.nome })));

  protected readonly lista = geoListState({
    storageKey: 'rh-veiculos',
    filters: {
      modelo: geoFilter.value<string | null>(null, { label: 'Modelo' }),
      idBaseOperacional: geoFilter.value<string | null>(null, { label: 'Base', param: 'base', format: (id): string | null => (id ? this.nomeBase(id) : null) }),
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'placa', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<VeiculoResponse>(
    (pedido) => this.rh.listarVeiculos({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.rh.listarVeiculos({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<VeiculoResponse>[] = [
    { key: 'placa', header: 'Placa', type: 'custom', priority: 1, sortField: 'placa', value: (v) => v.placa, display: (v) => v.placa },
    { key: 'modelo', header: 'Modelo', priority: 1, sortField: 'modelo' },
    { key: 'fabricante', header: 'Fabricante', sortField: 'fabricante', display: (v) => v.fabricante || '—' },
    { key: 'base', header: 'Base', sortField: 'baseOperacional.nome', value: (v) => v.baseOperacional?.nome, display: (v) => v.baseOperacional?.nome ?? '—' },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (v) => v.ativo, display: (v) => (v.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (v: VeiculoResponse) => v.placa;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<VeiculoResponse | null>(null);
  protected readonly placa = signal('');
  protected readonly modelo = signal('');
  protected readonly fabricante = signal('');
  protected readonly idBase = signal<string | null>(null);
  protected readonly ativo = signal(true);
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const v = this.emEdicao();
    if (!v) return !!(this.placa() + this.modelo() + this.fabricante()).trim() || !!this.idBase();
    return this.placa() !== v.placa || this.modelo() !== v.modelo || this.fabricante() !== (v.fabricante ?? '') || this.idBase() !== v.baseOperacional?.id || this.ativo() !== v.ativo;
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.placa().trim()) e['placa'] = 'Informe a placa.';
    if (!this.modelo().trim()) e['modelo'] = 'Informe o modelo.';
    if (!this.idBase()) e['base'] = 'Escolha a base.';
    return e;
  });

  protected readonly importacao = importacaoListagem<VeiculoImportacaoDTO>({
    // O endpoint de veículos responde `totalFalhas`.
    enviar: (arquivo) => this.rh.importarVeiculos(arquivo).pipe(map((r) => ({ registros: r.registros, totalFalha: r.totalFalhas }))),
    confirmar: (veiculos) => this.rh.confirmarImportacaoVeiculos({ veiculos }).pipe(map((r) => ({ registros: r.registros, totalFalha: r.totalFalhas }))),
    modelo: () => this.importacaoService.baixarModeloCsv('/v1/veiculos/importar/modelo', 'modelo-veiculos.csv'),
    aoProcessar: () => this.lista.reload()
  });
  protected readonly situacao = geoImportStatus;
  protected readonly chaveImportacao = CHAVE_LINHA_IMPORTACAO;
  protected readonly colunasImportacao: GeoDataTableColumn<VeiculoImportacaoDTO>[] = [
    { key: 'linha', header: 'Linha', type: 'integer', width: '4.5rem' },
    { key: 'placa', header: 'Placa', type: 'custom', priority: 1, value: (r) => r.placa },
    { key: 'modelo', header: 'Modelo', type: 'custom', value: (r) => r.modelo },
    { key: 'fabricante', header: 'Fabricante', type: 'custom', value: (r) => r.fabricante },
    { key: 'base', header: 'Base', type: 'custom', value: (r) => r.nomeBaseOperacional },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status }
  ];

  constructor() {
    this.rh.listarBasesOperacionaisAtivas().subscribe({ next: (r) => this.bases.set(r.content), error: () => undefined });
  }

  private filtro() {
    const { filters, query } = this.lista.request();
    return { modelo: filters.modelo?.trim() || undefined, idBaseOperacional: filters.idBaseOperacional, ativo: filters.ativo, buscaGlobal: query || undefined };
  }

  private nomeBase(id: string): string {
    return this.bases().find((b) => b.id === id)?.nome ?? 'base selecionada';
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(v: VeiculoResponse): void {
    this.preencher(v);
    this.formularioAberto.set(true);
  }

  private preencher(v: VeiculoResponse | null): void {
    this.emEdicao.set(v);
    this.placa.set(v?.placa ?? '');
    this.modelo.set(v?.modelo ?? '');
    this.fabricante.set(v?.fabricante ?? '');
    this.idBase.set(v?.baseOperacional?.id ?? null);
    this.ativo.set(v?.ativo ?? true);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const ativo = this.ativo();
    const request: VeiculoRequest = {
      placa: this.placa().trim().toUpperCase(),
      modelo: this.modelo().trim(),
      fabricante: this.fabricante().trim() || undefined,
      baseOperacionalId: this.idBase()!,
      ativo
    };
    this.salvando.set(true);
    const salvar$: Observable<unknown> = atual
      ? this.rh.atualizarVeiculo(atual.id, request).pipe(
          switchMap((r) => (r && r.ativo !== ativo ? (ativo ? this.rh.ativarVeiculo(atual.id) : this.rh.desativarVeiculo(atual.id)) : of(null)))
        )
      : this.rh.criarVeiculo(request);
    salvar$.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Veículo atualizado.' : 'Veículo cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(v: VeiculoResponse): Promise<void> {
    const desativar = v.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar veículo' : 'Ativar veículo',
      message: desativar ? `${v.placa} deixa de aparecer nas seleções. O histórico é mantido.` : `${v.placa} volta a aparecer nas seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.rh.desativarVeiculo(v.id) : this.rh.ativarVeiculo(v.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Veículo desativado.' : 'Veículo ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected abrirFicha(v: VeiculoResponse): void {
    void this.router.navigate(['/frota/veiculos', v.id]);
  }

  protected logs(v: VeiculoResponse): void {
    this.auditoria().show(v.id, v.placa, {
      placa: 'Placa',
      descricao: 'Descrição',
      modelo: 'Modelo',
      fabricante: 'Fabricante',
      baseOperacional: 'Base operacional',
      ativo: 'Status (ativo)'
    });
  }
}
