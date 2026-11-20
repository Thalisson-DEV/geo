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
  GeoListShortcutsDirective,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { Observable, of, switchMap } from 'rxjs';

import { AuditDialogComponent } from '../../../shared/components/audit-dialog/audit-dialog.component';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { MotivoRejeicaoResponse } from '../../../core/models/almoxarifado.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import { OPCOES_STATUS, LIMITE_EXPORTACAO, exportacaoPadrao, paginaPadrao } from '../../../shared/listagem/listagem';

@Component({
  selector: 'app-motivos-rejeicao',
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
    GeoListShortcutsDirective,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    AuditDialogComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts #atalhos="geoListShortcuts" [newAction]="true" (newRequested)="novo()">
      <geo-page-header
        title="Motivos de rejeição"
        icon="pi pi-times-circle"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Motivos de Rejeição' }]"
        description="Motivos usados para rejeitar solicitações de material."
        helpLabel="Ajuda sobre motivos de rejeição"
        (help)="ajuda.show()"
      >
        <geo-button actions icon="pi pi-plus" label="Novo motivo" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></geo-button>
      </geo-page-header>

      <geo-filter-panel #painel storageKey="almox-motivos-rejeicao" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-select label="Status" [options]="statusOpcoes" [(value)]="lista.filters.ativo"></geo-select>
        </div>
      </geo-filter-panel>

      <geo-data-table
        title="Motivos de rejeição"
        mode="server"
        storageKey="almox-motivos-rejeicao"
        exportFileName="motivos-rejeicao"
        searchPlaceholder="Nome ou descrição"
        rowActionLabel="Editar"
        rowActionIcon="pi pi-pencil"
        emptyActionLabel="Novo motivo"
        noResultsTitle="Nenhum motivo encontrado com esse recorte."
        [columns]="colunas"
        [rows]="resultado.rows()"
        [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os motivos de rejeição' : 'Nenhum motivo cadastrado'"
        [stateDescription]="resultado.error() ?? 'Cadastre os motivos de rejeição de solicitações.'"
        [filtered]="lista.filtered()"
        [totalRecords]="resultado.total()"
        [exportRows]="exportar"
        [exportLimit]="limiteExportacao"
        [(page)]="lista.page"
        [(pageSize)]="lista.pageSize"
        [(sort)]="lista.sort"
        (lazyLoad)="lista.load($event)"
        [(query)]="lista.query"
        (adjustFilters)="painel.expandAndFocus()"
        (clearFilters)="lista.reset()"
        (emptyAction)="novo()"
        (rowActivate)="editar($event)"
      >
        <ng-template geoCell="ativo" let-row>
          <geo-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'" [icon]="row.ativo ? 'pi pi-check-circle' : 'pi pi-ban'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</geo-status>
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            <geo-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Ativar ') + row.nome"
              size="icon-sm" (pressed)="alternar(row)"></geo-icon-button>
            <geo-icon-button icon="pi pi-history" [label]="'Histórico de alterações de ' + row.nome" size="icon-sm" (pressed)="logs(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <geo-form-drawer [(visible)]="formularioAberto" [title]="emEdicao() ? 'Editar motivo' : 'Novo motivo'"
      [description]="$safeNavigationMigration(emEdicao()?.nome)" [dirty]="alterado()" size="sm">
      <geo-form-section title="Dados do motivo" icon="pi pi-times-circle">
        <geo-text-input label="Nome" [required]="true" [(value)]="principal" [maxlength]="100" placeholder="Ex.: Falta de estoque" [error]="erro('principal')"></geo-text-input>
        <geo-textarea label="Descrição" [required]="true" [(value)]="descricao" [rows]="3" [maxlength]="255" placeholder="Ex.: Material avariado ou fora de conformidade" [error]="erro('descricao')"></geo-textarea>
        <geo-boolean-control label="Motivo ativo" kind="toggle" [(value)]="ativo"></geo-boolean-control>
      </geo-form-section>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar alterações' : 'Cadastrar motivo'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-audit-dialog #auditoria></app-audit-dialog>
    <app-ajuda-listagem #ajuda titulo="Motivos de rejeição" entidadePlural="motivos de rejeição" artigoPlural="os" busca="nome ou descrição"
      rotuloNovo="Novo motivo"></app-ajuda-listagem>
  `
})
export class MotivosRejeicaoComponent {
  private readonly servico = inject(AlmoxarifadoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly auditoria = viewChild.required<AuditDialogComponent>('auditoria');

  protected readonly statusOpcoes = OPCOES_STATUS;
  protected readonly lista = geoListState({
    storageKey: 'almox-motivos-rejeicao',
    filters: { ativo: geoFilter.value<boolean | null>(null, { label: 'Status', param: 'status', options: () => OPCOES_STATUS }) },
    sort: [{ key: 'nome', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<MotivoRejeicaoResponse>(
    (pedido) => this.servico.listarMotivosRejeicao({ ...this.filtro(), ...paginaPadrao(pedido) }),
    { errorMessage: getErrorMessage }
  );
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;
  protected readonly exportar = exportacaoPadrao((pagina) => this.servico.listarMotivosRejeicao({ ...this.filtro(), ...pagina }), () => this.lista.request());

  protected readonly colunas: GeoDataTableColumn<MotivoRejeicaoResponse>[] = [
    { key: 'nome', header: 'Nome', priority: 1, sortField: 'nome' },
    { key: 'descricao', header: 'Descrição', sortField: 'descricao', display: (r) => r.descricao || '—' },
    { key: 'ativo', header: 'Status', type: 'custom', priority: 1, sortField: 'ativo', value: (r) => r.ativo, display: (r) => (r.ativo ? 'Ativo' : 'Inativo') },
  ];
  protected readonly rotulo = (r: MotivoRejeicaoResponse) => r.nome;

  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<MotivoRejeicaoResponse | null>(null);
  protected readonly principal = signal('');
  protected readonly descricao = signal('');
  protected readonly ativo = signal(true);
  protected readonly salvando = signal(false);
  private readonly tentouSalvar = signal(false);
  protected readonly alterado = computed(() => {
    const atual = this.emEdicao();
    return atual
      ? this.principal() !== atual.nome || this.descricao() !== (atual.descricao ?? '') || this.ativo() !== atual.ativo
      : !!this.principal().trim() || !!this.descricao().trim();
  });
  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (this.principal().trim().length < 3) e['principal'] = 'Nome com pelo menos 3 caracteres.';
    if (this.descricao().trim().length < 5) e['descricao'] = 'Descrição com pelo menos 5 caracteres.';
    return e;
  });

  private filtro() {
    const { filters, query } = this.lista.request();
    return { ...filters, buscaGlobal: query || undefined };
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected novo(): void {
    this.preencher(null);
    this.formularioAberto.set(true);
  }

  protected editar(registro: MotivoRejeicaoResponse): void {
    this.preencher(registro);
    this.formularioAberto.set(true);
  }

  private preencher(registro: MotivoRejeicaoResponse | null): void {
    this.emEdicao.set(registro);
    this.principal.set(registro?.nome ?? '');
    this.descricao.set(registro?.descricao ?? '');
    this.ativo.set(registro?.ativo ?? true);
    this.tentouSalvar.set(false);
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const atual = this.emEdicao();
    const request = { nome: this.principal().trim(), descricao: this.descricao().trim() };
    this.salvando.set(true);
    const ativo = this.ativo();
    // O status é alterado por ativar/desativar depois de gravar os dados.
    const salvar$: Observable<unknown> = atual
      ? this.servico.atualizarMotivoRejeicao(atual.id, request).pipe(
          switchMap(() => (atual.ativo === ativo ? of(null) : ativo ? this.servico.ativarMotivoRejeicao(atual.id) : this.servico.desativarMotivoRejeicao(atual.id)))
        )
      : this.servico.criarMotivoRejeicao(request).pipe(switchMap((criado) => (criado && !ativo ? this.servico.desativarMotivoRejeicao(criado.id) : of(null))));
    salvar$.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(atual ? 'Motivo atualizado.' : 'Motivo cadastrado.');
        this.lista.reload();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async alternar(registro: MotivoRejeicaoResponse): Promise<void> {
    const desativar = registro.ativo;
    const ok = await this.confirmacao.confirm({
      title: desativar ? 'Desativar motivo' : 'Ativar motivo',
      message: desativar ? `${registro.nome} deixa de aparecer nas seleções. O histórico é mantido.` : `${registro.nome} volta a aparecer nas seleções.`,
      confirmLabel: desativar ? 'Desativar' : 'Ativar',
      variant: desativar ? 'destructive' : 'default'
    });
    if (!ok) return;
    (desativar ? this.servico.desativarMotivoRejeicao(registro.id) : this.servico.ativarMotivoRejeicao(registro.id)).subscribe({
      next: () => {
        this.notificacoes.success(desativar ? 'Motivo desativado.' : 'Motivo ativado.');
        this.lista.reload();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected logs(registro: MotivoRejeicaoResponse): void {
    this.auditoria().show(registro.id, registro.nome, { nome: 'Nome', descricao: 'Descrição', ativo: 'Status' });
  }
}
