import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesFilterPanelComponent,
  CesIconButtonComponent,
  CesListRequest,
  CesListShortcutsDirective,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesRowActionsDirective,
  CesSelectOption,
  CesStatusComponent,
  cesFilter,
  cesListState,
  NotificationService
} from '@ces/ui';
import { Observable, map } from 'rxjs';
import { LookupStore } from '../../../core/lookup';
import {
  FiltroMedidas,
  MedidaDisciplinar,
  MotivoMedidaDisciplinar,
  OrigemMedidaDisciplinar,
  OrigemMedidaRequest,
  ROTULO_ORIGEM_MEDIDA,
  ROTULO_SITUACAO_MEDIDA,
  SituacaoMedidaDisciplinar,
  TipoMedidaDisciplinar,
  situacaoMedida
} from '../../../core/models/rh-medida-disciplinar.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { PaginaMedidas, RhMedidaDisciplinarService } from '../../../core/services/rh-medida-disciplinar.service';
import { LIMITE_EXPORTACAO, dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { ColaboradorMedida, MedidaDisciplinarDrawerComponent, PreenchimentoMedida } from './medida-disciplinar-drawer.component';

const SITUACOES: CesSelectOption<SituacaoMedidaDisciplinar>[] = (Object.keys(ROTULO_SITUACAO_MEDIDA) as SituacaoMedidaDisciplinar[])
  .map((s) => ({ label: ROTULO_SITUACAO_MEDIDA[s], value: s }));
const ORIGENS: CesSelectOption<OrigemMedidaDisciplinar>[] = (Object.keys(ROTULO_ORIGEM_MEDIDA) as OrigemMedidaDisciplinar[])
  .map((o) => ({ label: ROTULO_ORIGEM_MEDIDA[o], value: o }));

/**
 * De onde vêm os dados de uma medida aberta por outro módulo. A frota preenche a medida da multa
 * pela porta pública dela (Fase 5, multas); até lá, a origem é aceita e o formulário abre vazio.
 */
export const PREENCHIMENTO_POR_ORIGEM: Record<string, ((id: string) => Observable<PreenchimentoMedida>) | undefined> = {
  FROTA_MULTA: undefined
};

/** Pedido da listagem no formato do endpoint (sort como lista). */
export function paginaMedidas(pedido: Pick<CesListRequest<unknown>, 'page' | 'size' | 'sort'>): PaginaMedidas {
  return {
    page: pedido.page,
    size: pedido.size,
    sort: pedido.sort.length ? pedido.sort.map((r) => `${r.key},${r.direction}`) : undefined
  };
}

/**
 * Medidas disciplinares de todos os colaboradores (dado restrito). Abre em todas as medidas,
 * com a situação de cada uma e o aviso de imediatidade. O lançamento é feito depois que a medida
 * foi aplicada; tipos, motivos e parâmetros ficam nos cadastros do Departamento Pessoal.
 */
@Component({
  selector: 'app-medidas-disciplinares',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesDatepickerComponent,
    CesFilterPanelComponent,
    CesIconButtonComponent,
    CesListShortcutsDirective,
    CesMultiSelectComponent,
    CesPageHeaderComponent,
    CesRowActionsDirective,
    CesStatusComponent,
    MedidaDisciplinarDrawerComponent
  ],
  styles: `
    .avisos { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
  `,
  template: `
    <div class="ces-page" cesListShortcuts #atalhos="cesListShortcuts" [newAction]="podeEditar()" (newRequested)="novo()">
      <ces-page-header title="Medidas disciplinares" icon="pi pi-exclamation-triangle" [breadcrumb]="[{ label: 'Departamento Pessoal' }, { label: 'Medidas disciplinares' }]"
        description="Orientações, advertências, suspensões e desligamentos já aplicados, por qualquer motivo, com anexos e histórico por colaborador. Atalhos: / busca, F filtros, N lançar medida.">
        <ng-container ngProjectAs="[actions]">
          @if (podeEditar()) {
            <ces-button icon="pi pi-plus" label="Lançar medida" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></ces-button>
          }
        </ng-container>
      </ces-page-header>

      <ces-filter-panel #painel storageKey="rh-medidas-disciplinares" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="ces-filter-grid">
          <ces-datepicker label="Fato de" [value]="dataLocal(lista.filters.de())" [clearable]="true" (valueChange)="lista.filters.de.set(dataIso($event))"></ces-datepicker>
          <ces-datepicker label="Fato até" [value]="dataLocal(lista.filters.ate())" [clearable]="true" (valueChange)="lista.filters.ate.set(dataIso($event))"></ces-datepicker>
          <ces-multiselect label="Base" [options]="opcoesBase()" [(value)]="lista.filters.idsBase" placeholder="Todas"></ces-multiselect>
          <ces-multiselect label="Tipo" [options]="opcoesTipo()" [(value)]="lista.filters.idsTipo" placeholder="Todos"></ces-multiselect>
          <ces-multiselect label="Motivo" [options]="opcoesMotivo()" [(value)]="lista.filters.idsMotivo" placeholder="Todos"></ces-multiselect>
          <ces-multiselect label="Situação" [options]="situacoes" [(value)]="lista.filters.situacoes" placeholder="Todas"></ces-multiselect>
          <ces-multiselect label="Origem" [options]="origens" [(value)]="lista.filters.origens" placeholder="Todas"></ces-multiselect>
        </div>
      </ces-filter-panel>

      <ces-data-table title="Medidas" mode="server" [description]="descricao()" [searchable]="true" searchPlaceholder="Buscar colaborador"
        storageKey="rh-medidas-disciplinares" exportFileName="medidas-disciplinares" [exportRows]="exportar" [exportLimit]="limiteExportacao"
        [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()" [rowKey]="chave" [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as medidas' : 'Nenhuma medida disciplinar'"
        [stateDescription]="resultado.error() ?? 'As medidas lançadas pelo RH depois de aplicadas, ou pedidas por outros módulos, aparecem aqui.'"
        [emptyActionLabel]="podeEditar() ? 'Lançar medida' : undefined" (emptyAction)="novo()"
        noResultsTitle="Nenhuma medida com esse recorte." [filtered]="lista.filtered()"
        [(query)]="lista.query" [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()" [rowClickable]="true" (rowActivate)="abrir($event)">
        <ng-template cesCell="colaborador" let-row>
          <span class="ces-cell-strong">{{ row.colaboradorNome ?? '—' }}</span>
          <span class="ces-cell-muted">{{ row.colaboradorFuncao ?? '' }}{{ row.baseNome ? ' · ' + row.baseNome : '' }}</span>
        </ng-template>
        <ng-template cesCell="medida" let-row>
          <span class="ces-cell-strong">{{ row.tipoNome }}</span>
          <span class="ces-cell-muted">{{ row.motivoNome }}{{ row.origem !== 'MANUAL' ? ' · ' + row.origemRotulo.toLowerCase() : '' }}</span>
        </ng-template>
        <ng-template cesCell="dataFato" let-row>{{ row.dataFato | date: 'dd/MM/yyyy' }}</ng-template>
        <ng-template cesCell="dataAplicacao" let-row>{{ row.dataAplicacao | date: 'dd/MM/yyyy' }}</ng-template>
        <ng-template cesCell="situacao" let-row>
          @let s = situacao(row);
          <ces-status [tone]="s.tom" [icon]="'pi ' + s.icone">{{ s.rotulo }}</ces-status>
          @if (row.foraDaImediatidade) {
            <span class="avisos">
              <ces-status tone="warning" emphasis="outline" icon="pi pi-exclamation-triangle">{{ row.diasDesdeOFato }} dias do fato</ces-status>
            </span>
          }
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir ' + rotulo(row)" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
          </span>
        </ng-template>
      </ces-data-table>
    </div>

    <app-medida-disciplinar-drawer [(visivel)]="drawerAberto" [medida]="emEdicao()" [tipos]="tipos()" [motivos]="motivos()"
      [colaborador]="colaboradorNovo()" [origem]="origem()" [preenchimento]="preenchimento()" [preenchimentoIndisponivel]="preenchimentoIndisponivel()"
      [podeEditar]="podeEditar()" [podeCancelar]="podeCancelar()" (salva)="aoSalvar($event)"></app-medida-disciplinar-drawer>
  `
})
export class MedidasDisciplinaresComponent {
  private readonly servico = inject(RhMedidaDisciplinarService);
  private readonly lookups = inject(LookupStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly notificacoes = inject(NotificationService);

  protected readonly situacoes = SITUACOES;
  protected readonly origens = ORIGENS;
  protected readonly situacao = situacaoMedida;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO;

  private readonly tem = (p: string) => computed(() => this.auth.currentUser()?.permissoes?.includes(p) ?? false);
  protected readonly podeEditar = this.tem('rh:medida-disciplinar:write');
  protected readonly podeCancelar = this.tem('rh:medida-disciplinar:cancelar');

  protected readonly tipos = signal<TipoMedidaDisciplinar[]>([]);
  protected readonly motivos = signal<MotivoMedidaDisciplinar[]>([]);
  protected readonly drawerAberto = signal(false);
  protected readonly emEdicao = signal<MedidaDisciplinar | null>(null);
  protected readonly colaboradorNovo = signal<ColaboradorMedida | null>(null);
  protected readonly origem = signal<OrigemMedidaRequest | null>(null);
  protected readonly preenchimento = signal<PreenchimentoMedida | null>(null);
  protected readonly preenchimentoIndisponivel = signal(false);

  protected readonly opcoesBase = computed<CesSelectOption<string>[]>(() =>
    this.lookups.operationalBases().map((b) => ({ label: b.label, value: b.value })));
  protected readonly opcoesTipo = computed<CesSelectOption<string>[]>(() => this.tipos().map((t) => ({ label: t.nome, value: t.id })));
  protected readonly opcoesMotivo = computed<CesSelectOption<string>[]>(() => this.motivos().map((m) => ({ label: m.nome, value: m.id })));

  protected readonly lista = cesListState({
    storageKey: 'rh-medidas-disciplinares',
    filters: {
      de: cesFilter.date(null, { label: 'Fato de' }),
      ate: cesFilter.date(null, { label: 'Fato até' }),
      idsBase: cesFilter.list<string>([], { label: 'Base', param: 'base', itemLabel: (id) => this.nome(this.opcoesBase(), id, 'base'), countLabel: (n) => `${n} selecionadas` }),
      idsTipo: cesFilter.list<string>([], { label: 'Tipo', param: 'tipo', itemLabel: (id) => this.nome(this.opcoesTipo(), id, 'tipo'), countLabel: (n) => `${n} selecionados` }),
      idsMotivo: cesFilter.list<string>([], { label: 'Motivo', param: 'motivo', itemLabel: (id) => this.nome(this.opcoesMotivo(), id, 'motivo'), countLabel: (n) => `${n} selecionados` }),
      situacoes: cesFilter.list<SituacaoMedidaDisciplinar>([], { label: 'Situação', param: 'situacao', itemLabel: (s) => ROTULO_SITUACAO_MEDIDA[s], countLabel: (n) => `${n} selecionadas` }),
      origens: cesFilter.list<OrigemMedidaDisciplinar>([], { label: 'Origem', param: 'origem', itemLabel: (o) => ROTULO_ORIGEM_MEDIDA[o], countLabel: (n) => `${n} selecionadas` })
    },
    sort: [{ key: 'dataFato', direction: 'desc' }]
  });
  private readonly idColaboradorFiltro = this.rota.snapshot.queryParamMap.get('colaborador');
  protected readonly resultado = this.lista.results<MedidaDisciplinar>(
    (pedido) => this.servico.listar(this.filtro(pedido.filters, pedido.query), paginaMedidas(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = (_evento: unknown, limite: number) =>
    this.servico.listar(this.filtro(this.lista.request().filters, this.lista.request().query),
      { ...paginaMedidas(this.lista.request()), page: 0, size: limite }).pipe(map((p) => p.content));

  protected readonly descricao = computed(() => {
    if (this.resultado.loading() && !this.resultado.total()) return undefined;
    const n = this.resultado.total();
    return n === 0 ? 'Nenhuma medida' : n === 1 ? '1 medida' : `${n} medidas`;
  });

  protected readonly colunas: CesDataTableColumn<MedidaDisciplinar>[] = [
    { key: 'colaborador', header: 'Colaborador', type: 'custom', priority: 1, value: (m) => m.colaboradorNome, display: (m) => `${m.colaboradorNome ?? ''} ${m.baseNome ?? ''}` },
    { key: 'medida', header: 'Medida', type: 'custom', priority: 1, value: (m) => m.tipoNome, display: (m) => `${m.tipoNome} · ${m.motivoNome}` },
    { key: 'dataFato', header: 'Fato', type: 'custom', priority: 1, sortField: 'dataFato', value: (m) => m.dataFato, display: (m) => m.dataFato },
    { key: 'dataAplicacao', header: 'Aplicação', type: 'custom', priority: 2, sortField: 'dataAplicacao', value: (m) => m.dataAplicacao, display: (m) => m.dataAplicacao },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (m) => m.situacao, display: (m) => situacaoMedida(m).rotulo }
  ];
  protected readonly chave = (m: MedidaDisciplinar) => m.id;
  protected readonly rotulo = (m: MedidaDisciplinar) => `${m.tipoNome.toLowerCase()} de ${m.colaboradorNome ?? 'colaborador'}`;

  constructor() {
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    this.servico.tipos(false).subscribe({ next: (t) => this.tipos.set(t), error: () => undefined });
    this.servico.motivos(false).subscribe({ next: (m) => this.motivos.set(m), error: () => undefined });
    const params = this.rota.snapshot.queryParamMap;
    const id = params.get('medida');
    if (id) this.servico.buscar(id).subscribe({ next: (m) => this.mostrar(m), error: (e) => this.notificacoes.error(getErrorMessage(e)) });
    const origem = params.get('origem');
    const origemId = params.get('origemId');
    if (origem && origemId && this.podeEditar()) this.abrirPorOrigem({ tipo: origem, id: origemId });
  }

  protected novo(): void {
    this.origem.set(null);
    this.preenchimento.set(null);
    this.preenchimentoIndisponivel.set(false);
    this.colaboradorNovo.set(null);
    this.emEdicao.set(null);
    this.drawerAberto.set(true);
  }

  /** O detalhe traz fatos, histórico e anexos, que a listagem não carrega. */
  protected abrir(m: MedidaDisciplinar): void {
    this.servico.buscar(m.id).subscribe({ next: (d) => this.mostrar(d), error: () => this.mostrar(m) });
  }

  protected aoSalvar(m: MedidaDisciplinar): void {
    if (this.drawerAberto()) this.emEdicao.set(m);
    if (this.origem()) {
      // Vinculada; a partir daqui é uma medida como as outras.
      this.origem.set(null);
      this.preenchimento.set(null);
      void this.router.navigate([], { relativeTo: this.rota, queryParams: { origem: null, origemId: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.lista.reload();
  }

  private mostrar(m: MedidaDisciplinar): void {
    this.origem.set(null);
    this.preenchimento.set(null);
    this.colaboradorNovo.set(null);
    this.emEdicao.set(m);
    this.drawerAberto.set(true);
  }

  private abrirPorOrigem(origem: OrigemMedidaRequest): void {
    this.emEdicao.set(null);
    this.colaboradorNovo.set(null);
    this.origem.set(origem);
    const carregar = PREENCHIMENTO_POR_ORIGEM[origem.tipo];
    if (!carregar) {
      this.preenchimento.set(null);
      this.preenchimentoIndisponivel.set(true);
      this.drawerAberto.set(true);
      return;
    }
    carregar(origem.id).subscribe({
      next: (p) => {
        this.preenchimento.set(p);
        this.preenchimentoIndisponivel.set(false);
        this.drawerAberto.set(true);
      },
      error: () => {
        this.preenchimento.set(null);
        this.preenchimentoIndisponivel.set(true);
        this.drawerAberto.set(true);
      }
    });
  }

  private nome(opcoes: CesSelectOption<string>[], id: string, padrao: string): string {
    return opcoes.find((o) => o.value === id)?.label ?? padrao;
  }

  private filtro(f: Record<string, unknown>, busca: string | null | undefined): FiltroMedidas {
    return {
      busca: busca || null,
      idColaborador: this.idColaboradorFiltro,
      de: f['de'] as string | null,
      ate: f['ate'] as string | null,
      idsBase: f['idsBase'] as string[],
      idsTipo: f['idsTipo'] as string[],
      idsMotivo: f['idsMotivo'] as string[],
      situacoes: f['situacoes'] as SituacaoMedidaDisciplinar[],
      origens: f['origens'] as OrigemMedidaDisciplinar[]
    };
  }
}
