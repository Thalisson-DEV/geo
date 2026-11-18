import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoStatusComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';

import { FormularioInspecaoResumoResponse } from '../../../core/models/sst.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { SstService } from '../../../core/services/sst.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { FormulariosImportacaoComponent } from './formularios-importacao.component';
import { LIMITE_EXPORTACAO, OPCOES_STATUS, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

@Component({
  selector: 'app-sst-formularios',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    AjudaListagemComponent,
    FormulariosImportacaoComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Formulários de inspeção"
        icon="pi pi-list-check"
        [breadcrumb]="[{ label: 'SST' }, { label: 'Formulários de inspeção' }]"
        description="Modelos de checklist usados nas inspeções. O construtor define seções, perguntas e respostas."
        helpLabel="Ajuda sobre formulários de inspeção"
        (help)="ajuda.show()"
      >
        <geo-button actions variant="outline" icon="pi pi-upload" label="Importar" (pressed)="importacaoAberta.set(true)"></geo-button>
        <geo-button actions icon="pi pi-plus" label="Novo formulário" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="sst-formularios" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Formulários"
        mode="server"
        storageKey="sst-formularios"
        exportFileName="formularios-inspecao"
        searchPlaceholder="Título do formulário"
        rowActionLabel="Abrir construtor"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo formulário"
        noResultsTitle="Nenhum formulário encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [totalRecords]="resultado.total()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os formulários' : 'Nenhum formulário criado'"
        [stateDescription]="resultado.error() ?? 'Crie um formulário para usar nas inspeções.'"
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
        (rowActivate)="abrirConstrutor($event)"
      >
        <ng-template geoCell="titulo" let-row>
          <span class="geo-cell-strong">{{ row.titulo }}</span>
          @if (row.descricao) {
            <span class="geo-cell-muted">{{ row.descricao }}</span>
          }
        </ng-template>
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button icon="pi pi-copy" [label]="'Duplicar ' + row.titulo" size="icon-sm" (pressed)="duplicar(row)"></geo-icon-button>
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.titulo" size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-formularios-importacao [(visible)]="importacaoAberta" (processado)="lista.reload()"></app-formularios-importacao>

    <app-ajuda-listagem #ajuda titulo="Formulários de inspeção" entidadePlural="formulários" busca="título" rotuloNovo="Novo formulário">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-copy"></i> Duplicar</h4>
        <p class="help-text-desc">Duplicar cria uma cópia editável e abre o construtor nela: útil para variar um checklist sem mexer no original, que pode já ter inspeções respondidas.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-upload"></i> Importar</h4>
        <p class="help-text-desc">Uma pergunta por linha. Linhas com o mesmo formulário viram um formulário, e com o mesmo grupo, um grupo. O tipo padrão é o checklist Conforme / Não conforme / Não se aplica, com Conforme já marcado.</p>
      </div>
    </app-ajuda-listagem>
  `
})
export class FormulariosComponent {
  private readonly sst = inject(SstService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly importacaoAberta = signal(false);

  protected readonly lista = geoListState({
    storageKey: 'sst-formularios',
    filters: {
      ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS })
    },
    sort: [{ key: 'titulo', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<FormularioInspecaoResumoResponse>(
    (pedido) => this.sst.listarFormularios({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.sst.listarFormularios({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<FormularioInspecaoResumoResponse>[] = [
    { key: 'titulo', header: 'Formulário', type: 'custom', priority: 1, sortField: 'titulo', value: (f) => f.titulo, display: (f) => f.titulo },
    { key: 'perguntas', header: 'Perguntas', type: 'integer', width: '8rem', value: (f) => f.totalPerguntas },
    { key: 'ativo', header: 'Status', type: 'custom', sortField: 'ativo', value: (f) => f.ativo, display: (f) => (f.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly rotulo = (f: FormularioInspecaoResumoResponse) => f.titulo;

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ativo: filters.ativo, buscaGlobal: query || undefined };
  }

  protected novo(): void {
    void this.router.navigate(['/sst/formularios/novo']);
  }

  protected abrirConstrutor(f: FormularioInspecaoResumoResponse): void {
    void this.router.navigate(['/sst/formularios', f.id]);
  }

  protected async duplicar(f: FormularioInspecaoResumoResponse): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Duplicar formulário',
      message: `Cria uma cópia de "${f.titulo}" e abre o construtor nela.`,
      confirmLabel: 'Duplicar'
    });
    if (!ok) return;
    this.sst.duplicarFormulario(f.id).subscribe({
      next: (copia) => (copia ? void this.router.navigate(['/sst/formularios', copia.id]) : this.lista.reload()),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async alternar(f: FormularioInspecaoResumoResponse): Promise<void> {
    const desativar = f.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar formulário' : 'Ativar formulário',
      message: desativar ? `"${f.titulo}" deixa de ser oferecido em novas inspeções. As já respondidas são mantidas.` : `"${f.titulo}" volta a ser oferecido em novas inspeções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.sst.desativarFormulario(f.id) : this.sst.ativarFormulario(f.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Formulário desativado.' : 'Formulário ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }
}
