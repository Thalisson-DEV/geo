import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesFilterPanelComponent,
  CesIconButtonComponent,
  CesListShortcutsDirective,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  cesFilter,
  cesListState
} from '@ces/ui';
import {
  FiltroSinistros,
  ROTULO_SITUACAO_SINISTRO,
  ROTULO_TIPO_SINISTRO,
  ResumoSinistros,
  Sinistro,
  situacaoSinistro
} from '../../../core/models/frota-seguro.models';
import { Condutor, OpcoesFrota, SituacaoSinistro, TipoSinistro, contar, formatarPlaca, rotuloOs } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { FrotaOrdemServicoFormComponent } from '../ordens-servico/frota-ordem-servico-form.component';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, basesFrota, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { VeiculoSeguro } from './frota-apolice-drawer.component';
import { FrotaSinistroDrawerComponent } from './frota-sinistro-drawer.component';

const TIPOS: CesSelectOption<TipoSinistro>[] = (Object.keys(ROTULO_TIPO_SINISTRO) as TipoSinistro[]).map((t) => ({ label: ROTULO_TIPO_SINISTRO[t], value: t }));
const SITUACOES: CesSelectOption<SituacaoSinistro>[] = (Object.keys(ROTULO_SITUACAO_SINISTRO) as SituacaoSinistro[])
  .map((s) => ({ label: ROTULO_SITUACAO_SINISTRO[s], value: s }));
const EM_ANDAMENTO: SituacaoSinistro[] = ['RASCUNHO', 'EM_OFICINA', 'SEGURADORA_ACIONADA'];
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Sinistros da frota: acidentes, furtos, assaltos e cargas avariadas, com a OS de reparo e a
 * seguradora acionada. Abre nos em andamento, com os totais do recorte por tipo e por condutor.
 */
@Component({
  selector: 'app-frota-sinistros',
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
    CesSelectComponent,
    CesStatusComponent,
    FrotaOrdemServicoFormComponent,
    FrotaSinistroDrawerComponent
  ],
  styles: `
    .resumo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) repeat(2, minmax(0, 1.4fr)); gap: 0.75rem; }
    @media (max-width: 1100px) { .resumo { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .resumo { grid-template-columns: minmax(0, 1fr); } }
    .resumo__atalho[aria-pressed='true'] { border-color: var(--ces-warning); box-shadow: inset 3px 0 0 var(--ces-warning), var(--ces-shadow-sm); }
    .ranking { list-style: none; margin: 0.375rem 0 0; padding: 0; display: grid; gap: 0.125rem; font-size: var(--ces-font-caption); }
    .ranking li { display: flex; justify-content: space-between; gap: 0.75rem; }
    .ranking strong { font-variant-numeric: tabular-nums; }
  `,
  template: `
    <div class="ces-page" cesListShortcuts #atalhos="cesListShortcuts" [newAction]="acesso.editarSinistro()" (newRequested)="novo()">
      <ces-page-header title="Sinistros" icon="pi pi-exclamation-circle" [breadcrumb]="[{ label: 'Frota' }, { label: 'Sinistros' }]"
        description="Acidentes, furtos, assaltos e cargas avariadas com a OS de reparo e a seguradora acionada. O condutor vem do vínculo do veículo na hora do sinistro. Atalhos: / busca, F filtros, N novo sinistro.">
        <ng-container ngProjectAs="[actions]">
          @if (acesso.editarSinistro()) {
            <ces-button icon="pi pi-plus" label="Registrar sinistro" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></ces-button>
          }
        </ng-container>
      </ces-page-header>

      @if (resumo(); as r) {
        <section class="resumo" aria-label="Totais do recorte">
          <button type="button" class="ces-kpi resumo__atalho" [attr.data-tone]="r.emAndamento ? 'warning' : 'success'"
            [attr.aria-pressed]="soEmAndamento()" (click)="alternarEmAndamento()"
            [attr.aria-label]="soEmAndamento() ? 'Mostrar todos os sinistros' : 'Mostrar só os sinistros em andamento'">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-hourglass"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Em andamento</span>
              <span class="ces-kpi__value">{{ r.emAndamento }}</span>
              <span class="ces-kpi__detail">{{ contar(r.quantidade, 'sinistro', 'sinistros', 'Nenhum sinistro') }} no recorte</span>
            </span>
            <i class="pi pi-angle-right ces-kpi__go" aria-hidden="true"></i>
          </button>
          <div class="ces-kpi" [attr.data-tone]="r.comCulpaCondutor ? 'warning' : 'info'">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-user"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Com culpa do condutor</span>
              <span class="ces-kpi__value">{{ r.comCulpaCondutor }}</span>
              <span class="ces-kpi__detail">Franquias pagas: {{ moeda(r.franquiasPagas) }}</span>
            </span>
          </div>
          <div class="ces-kpi" data-tone="info">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-chart-bar"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Por tipo</span>
              @if (r.porTipo.length) {
                <ul class="ranking">@for (l of r.porTipo.slice(0, 4); track l.chave) { <li><span>{{ l.rotulo }}</span><strong>{{ l.quantidade }}</strong></li> }</ul>
              } @else { <span class="ces-kpi__detail">Sem sinistros no recorte.</span> }
            </span>
          </div>
          <div class="ces-kpi" data-tone="info">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-users"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Por condutor</span>
              @if (r.porCondutor.length) {
                <ul class="ranking">@for (l of r.porCondutor.slice(0, 4); track l.chave) { <li><span>{{ l.rotulo }}</span><strong>{{ l.quantidade }}</strong></li> }</ul>
              } @else { <span class="ces-kpi__detail">Sem sinistros no recorte.</span> }
            </span>
          </div>
        </section>
      }

      <ces-filter-panel #painel storageKey="frota-sinistros" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="ces-filter-grid">
          <ces-multiselect label="Situação" [options]="situacoes" [(value)]="lista.filters.situacoes" placeholder="Todas"></ces-multiselect>
          <ces-multiselect label="Tipo" [options]="tipos" [(value)]="lista.filters.tipos" placeholder="Todos"></ces-multiselect>
          <ces-multiselect label="Base" [options]="bases.opcoes()" [(value)]="lista.filters.idsBase" placeholder="Todas"></ces-multiselect>
          <ces-select label="Condutor" [options]="opcoesCondutor()" [(value)]="lista.filters.idCondutor" [filter]="true" [clearable]="true"></ces-select>
          <ces-datepicker label="De" [value]="dataLocal(lista.filters.de())" [clearable]="true" (valueChange)="lista.filters.de.set(dataIso($event))"></ces-datepicker>
          <ces-datepicker label="Até" [value]="dataLocal(lista.filters.ate())" [clearable]="true" (valueChange)="lista.filters.ate.set(dataIso($event))"></ces-datepicker>
        </div>
      </ces-filter-panel>

      <ces-data-table title="Sinistros" mode="server" [description]="descricao()" [searchable]="true" searchPlaceholder="Buscar placa"
        storageKey="frota-sinistros" exportFileName="frota-sinistros" [exportRows]="exportar" [exportLimit]="limiteExportacao"
        [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()" [rowKey]="chave" [rowLabel]="rotulo"
        [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os sinistros' : 'Nenhum sinistro em andamento'"
        [stateDescription]="resultado.error() ?? 'Registre o sinistro logo que souber; fotos, boletim e seguradora podem vir depois.'"
        [emptyActionLabel]="acesso.editarSinistro() ? 'Registrar sinistro' : undefined" (emptyAction)="novo()"
        noResultsTitle="Nenhum sinistro com esse recorte." [filtered]="lista.filtered()"
        [(query)]="lista.query" [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
        (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()" [rowClickable]="true" (rowActivate)="abrir($event)">
        <ng-template cesCell="ocorrido" let-row>
          <span class="ces-cell-strong">{{ row.ocorridoEm | date: 'dd/MM/yyyy HH:mm' }}</span>
          <span class="ces-cell-muted">Sinistro {{ row.numero }}</span>
        </ng-template>
        <ng-template cesCell="veiculo" let-row>
          <span class="ces-cell-strong">{{ placa(row.placa) }}</span>
          <span class="ces-cell-muted">{{ row.baseOperacional ?? 'Sem base' }}</span>
        </ng-template>
        <ng-template cesCell="tipo" let-row>
          <span class="ces-cell-strong">{{ row.tipoRotulo }}</span>
          @if (row.local) { <span class="ces-cell-muted">{{ row.local }}</span> }
        </ng-template>
        <ng-template cesCell="condutor" let-row>
          {{ row.condutor ?? 'Não identificado' }}
          @if (row.culpaCondutor) { <span class="ces-cell-muted">Com culpa</span> }
        </ng-template>
        <ng-template cesCell="situacao" let-row>
          @let st = situacao(row.situacao);
          <ces-status [tone]="st.tom" [icon]="st.icone">{{ st.rotulo }}</ces-status>
          @if (row.reparo) { <span class="ces-cell-muted">{{ rotuloOs(row.reparo.numero) }} · {{ row.reparo.situacaoRotulo }}</span> }
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            @if (row.anexos.length) {
              <ces-icon-button icon="pi pi-images" [label]="row.anexos.length + ' anexo(s) de ' + rotulo(row)"
                [tooltip]="row.anexos.length === 1 ? '1 anexo' : row.anexos.length + ' anexos'" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
            }
            <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir ' + rotulo(row)" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
          </span>
        </ng-template>
      </ces-data-table>
    </div>

    <app-frota-sinistro-drawer [(visivel)]="painelAberto" [sinistro]="emEdicao()" [veiculos]="veiculos()" [condutores]="condutores()"
      [podeEditar]="acesso.editarSinistro()" [podeAbrirOs]="acesso.editarOs()" (salvo)="aoSalvar($event)" (abrirOs)="abrirOs($event)"></app-frota-sinistro-drawer>

    <app-frota-ordem-servico-form [(visivel)]="osAberta" [sinistro]="sinistroDaOs()" [opcoes]="opcoes()"
      (sinistroAtualizado)="aoAbrirOs($event)"></app-frota-ordem-servico-form>
  `
})
export class FrotaSinistrosComponent {
  private readonly servico = inject(FrotaSeguroService);
  private readonly frota = inject(FrotaService);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  protected readonly tipos = TIPOS;
  protected readonly situacoes = SITUACOES;
  protected readonly moeda = moeda;
  protected readonly contar = contar;
  protected readonly placa = formatarPlaca;
  protected readonly rotuloOs = rotuloOs;
  protected readonly situacao = situacaoSinistro;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;

  protected readonly veiculos = signal<VeiculoSeguro[]>([]);
  protected readonly condutores = signal<Condutor[]>([]);
  protected readonly opcoes = signal<OpcoesFrota | null>(null);
  protected readonly resumo = signal<ResumoSinistros | null>(null);
  protected readonly painelAberto = signal(false);
  protected readonly emEdicao = signal<Sinistro | null>(null);
  protected readonly osAberta = signal(false);
  protected readonly sinistroDaOs = signal<Sinistro | null>(null);
  protected readonly opcoesCondutor = computed<CesSelectOption<string>[]>(() =>
    this.condutores().map((c) => ({ label: c.nome ?? 'Sem nome', value: c.idColaborador })));

  protected readonly lista = cesListState({
    storageKey: 'frota-sinistros',
    rememberFilters: 'frota-sinistros',
    filters: {
      situacoes: cesFilter.list<SituacaoSinistro>(EM_ANDAMENTO, {
        label: 'Situação', param: 'situacao', itemLabel: (s) => ROTULO_SITUACAO_SINISTRO[s], countLabel: (n) => `${n} situações`
      }),
      tipos: cesFilter.list<TipoSinistro>([], { label: 'Tipo', param: 'tipo', itemLabel: (t) => ROTULO_TIPO_SINISTRO[t], countLabel: (n) => `${n} tipos` }),
      idsBase: cesFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => this.bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      idCondutor: cesFilter.value<string | null>(null, { label: 'Condutor', param: 'condutor', options: () => this.opcoesCondutor() }),
      de: cesFilter.date(null, { label: 'De' }),
      ate: cesFilter.date(null, { label: 'Até' })
    },
    sort: [{ key: 'ocorridoEm', direction: 'desc' }]
  });
  protected readonly resultado = this.lista.results<Sinistro>(
    (pedido) => this.servico.listarSinistros(this.filtro(pedido.filters, pedido.query), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.servico.listarSinistros(this.filtro(this.lista.request().filters, this.lista.request().query), pagina),
    () => this.lista.request()
  );
  protected readonly descricao = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'sinistro', 'sinistros', 'Nenhum sinistro'));
  protected readonly soEmAndamento = computed(() => {
    const atuais = this.lista.applied().situacoes;
    return atuais.length === EM_ANDAMENTO.length && EM_ANDAMENTO.every((s) => atuais.includes(s));
  });

  protected readonly colunas: CesDataTableColumn<Sinistro>[] = [
    { key: 'ocorrido', header: 'Quando', type: 'custom', priority: 1, sortField: 'ocorridoEm', value: (s) => s.ocorridoEm, display: (s) => s.ocorridoEm },
    { key: 'veiculo', header: 'Veículo', type: 'custom', priority: 1, sortField: 'placa', value: (s) => s.placa, display: (s) => formatarPlaca(s.placa) },
    { key: 'tipo', header: 'Tipo', type: 'custom', priority: 1, sortField: 'tipo', value: (s) => s.tipo, display: (s) => s.tipoRotulo },
    { key: 'condutor', header: 'Condutor', type: 'custom', priority: 2, value: (s) => s.condutor, display: (s) => s.condutor ?? 'Não identificado' },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, sortField: 'situacao', value: (s) => s.situacao, display: (s) => s.situacaoRotulo }
  ];
  protected readonly chave = (s: Sinistro) => s.id;
  protected readonly rotulo = (s: Sinistro) => `sinistro ${s.numero} do ${formatarPlaca(s.placa)}`;

  constructor() {
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => this.veiculos.set(p.content.map((v) => ({ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo }))),
      error: () => undefined
    });
    this.frota.listarCondutores({ ativo: true }, { ...PAGINA_OPCOES, sort: ['cnhValidade'] }).subscribe({
      next: (p) => this.condutores.set([...p.content].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''))),
      error: () => undefined
    });
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    // Os totais seguem o recorte aplicado (filtros e busca).
    effect(() => {
      const { filters, query } = this.lista.request();
      untracked(() => this.carregarResumo(filters, query));
    });
    // O aviso de sinistro registrado e a OS de reparo abrem o sinistro pelo link (?sinistro=).
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('sinistro');
    if (id) this.servico.buscarSinistro(id).subscribe({ next: (s) => this.abrir(s), error: () => undefined });
  }

  protected novo(): void {
    this.emEdicao.set(null);
    this.painelAberto.set(true);
  }

  protected abrir(s: Sinistro): void {
    this.emEdicao.set(s);
    this.painelAberto.set(true);
  }

  protected aoSalvar(s: Sinistro): void {
    if (this.painelAberto()) this.emEdicao.set(s);
    this.recarregar();
  }

  /** A OS de reparo abre por cima do sinistro; ao voltar, o sinistro já mostra a OS. */
  protected abrirOs(s: Sinistro): void {
    this.sinistroDaOs.set(s);
    this.painelAberto.set(false);
    this.osAberta.set(true);
  }

  protected aoAbrirOs(s: Sinistro): void {
    this.recarregar();
    this.abrir(s);
  }

  protected alternarEmAndamento(): void {
    if (this.soEmAndamento()) this.lista.set('situacoes', []);
    else this.lista.set('situacoes', EM_ANDAMENTO);
  }

  private recarregar(): void {
    this.lista.reload();
    this.carregarResumo(this.lista.request().filters, this.lista.request().query);
  }

  private carregarResumo(filters: Record<string, unknown>, query: string): void {
    this.servico.resumoSinistros(this.filtro(filters, query)).subscribe({ next: (r) => this.resumo.set(r), error: () => this.resumo.set(null) });
  }

  private filtro(f: Record<string, unknown>, busca: string | null | undefined): FiltroSinistros {
    return {
      busca: busca || null,
      situacoes: f['situacoes'] as SituacaoSinistro[],
      tipos: f['tipos'] as TipoSinistro[],
      idsBase: f['idsBase'] as string[],
      idCondutor: f['idCondutor'] as string | null,
      de: f['de'] as string | null,
      ate: f['ate'] as string | null
    };
  }
}
