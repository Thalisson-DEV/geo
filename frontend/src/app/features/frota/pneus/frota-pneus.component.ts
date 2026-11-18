import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFilterPanelComponent,
  CesIconButtonComponent,
  CesListShortcutsDirective,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTabItem,
  CesTabPanelDirective,
  CesTabsComponent,
  NotificationService,
  cesFilter,
  cesListState,
  cesUrlParam
} from '@ces/ui';
import {
  ALERTA_PNEU,
  AlmoxarifadoFrota,
  EVENTO_PNEU,
  EventoPneu,
  FiltroPneus,
  InspecaoPneu,
  Pneu,
  ResumoPneus,
  SITUACAO_PNEU,
  SituacaoPneu,
  formatarCustoKm,
  formatarKm,
  formatarSulco,
  tomSulco
} from '../../../core/models/frota-pneu.models';
import { FornecedorFrota, contar, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FrotaPneuDrawerComponent } from './frota-pneu-drawer.component';
import { FrotaPneuInspecaoDetalheComponent } from './frota-pneu-inspecao-detalhe.component';
import { FrotaPneuInspecaoDrawerComponent } from './frota-pneu-inspecao-drawer.component';
import { FrotaPneuMontagemComponent } from './frota-pneu-montagem.component';
import { FrotaPneuRodizioComponent } from './frota-pneu-rodizio.component';

type Aba = 'pneus' | 'montagem' | 'rodizio' | 'inspecoes' | 'historico';
const ABAS: Aba[] = ['pneus', 'montagem', 'rodizio', 'inspecoes', 'historico'];
const SITUACOES: CesSelectOption<SituacaoPneu>[] = (Object.keys(SITUACAO_PNEU) as SituacaoPneu[]).map((s) => ({ label: SITUACAO_PNEU[s].rotulo, value: s }));
const ATIVOS: SituacaoPneu[] = ['DISPONIVEL', 'EM_USO', 'EM_REPARO', 'EM_REFORMA'];
const SERVICO: SituacaoPneu[] = ['EM_REPARO', 'EM_REFORMA'];
const mesmaLista = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Pneus da frota: a lista com sulco, vida, km e custo por km; a montagem visual no veículo
 * (arrastar e soltar); as inspeções de calibragem e sulco; e o histórico de todas as movimentações.
 */
@Component({
  selector: 'app-frota-pneus',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFilterPanelComponent,
    CesIconButtonComponent,
    CesListShortcutsDirective,
    CesMultiSelectComponent,
    CesPageHeaderComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    CesTabPanelDirective,
    CesTabsComponent,
    FrotaPneuDrawerComponent,
    FrotaPneuInspecaoDetalheComponent,
    FrotaPneuInspecaoDrawerComponent,
    FrotaPneuMontagemComponent,
    FrotaPneuRodizioComponent
  ],
  styles: `
    .ces-kpi[aria-pressed='true'] { border-color: var(--ces-brand); box-shadow: inset 3px 0 0 var(--ces-brand), var(--ces-shadow-sm); }
    .barra { display: flex; height: 0.45rem; margin-top: 0.35rem; overflow: hidden; border-radius: 999px; background: var(--ces-surface-muted); }
    .barra span { display: block; height: 100%; }
    .barra [data-tom='info'] { background: var(--ces-info); }
    .barra [data-tom='success'] { background: var(--ces-success); }
    .barra [data-tom='warning'] { background: var(--ces-warning); }
    .sulco { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .sulco__ponto { width: 0.55rem; height: 0.55rem; border-radius: 50%; }
    .sulco__ponto[data-tom='danger'] { background: var(--ces-danger); }
    .sulco__ponto[data-tom='warning'] { background: var(--ces-warning); }
    .sulco__ponto[data-tom='success'] { background: var(--ces-success); }
    .sulco__ponto[data-tom='neutral'] { background: var(--ces-foreground-subtle); }
    .alertas { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .num { font-variant-numeric: tabular-nums; }
  `,
  template: `
    <div class="ces-page" cesListShortcuts #atalhos="cesListShortcuts" [newAction]="acesso.editarPneu() && aba() === 'pneus'" (newRequested)="novo()">
      <ces-page-header title="Pneus" icon="ces-icon-pneu" [breadcrumb]="[{ label: 'Frota' }, { label: 'Pneus' }]"
        description="Cada pneu pela marca de fogo: onde está, sulco, vida, km rodado e custo por km. Atalhos: / busca, F filtros, N novo pneu.">
        <ng-container ngProjectAs="[actions]">
          @if (acesso.editarPneu()) {
            <ces-button variant="outline" icon="pi pi-gauge" label="Registrar inspeção" (pressed)="inspecionar()"></ces-button>
            <ces-button icon="pi pi-plus" label="Cadastrar pneu" [keyShortcut]="atalhos.newShortcut()" (pressed)="novo()"></ces-button>
          }
        </ng-container>
      </ces-page-header>

      @let r = resumo();
      <section class="ces-kpis" aria-label="Totais dos pneus">
          <div class="ces-kpi" data-tone="info">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="ces-icon-pneu"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Pneus na frota</span>
              <span class="ces-kpi__value">{{ r?.total ?? '—' }}</span>
              @if (r) {
                <span class="barra" aria-hidden="true">
                  <span data-tom="info" [style.width.%]="pct(r.emUso, r.total)"></span>
                  <span data-tom="success" [style.width.%]="pct(r.disponiveis, r.total)"></span>
                  <span data-tom="warning" [style.width.%]="pct(r.emReparo + r.emReforma, r.total)"></span>
                </span>
                <span class="ces-kpi__detail">{{ r.emUso }} em uso · {{ r.disponiveis }} no estoque · {{ r.emReparo + r.emReforma }} no serviço</span>
              }
            </span>
          </div>
          <button type="button" class="ces-kpi" [attr.data-tone]="r?.disponiveis ? 'success' : 'neutral'" [attr.aria-pressed]="soDisponiveis()" (click)="filtrarSituacao(['DISPONIVEL'])"
            [attr.aria-label]="soDisponiveis() ? 'Mostrar todos os pneus' : 'Mostrar só os pneus disponíveis'">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-box"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Disponíveis</span>
              <span class="ces-kpi__value">{{ r?.disponiveis ?? '—' }}</span>
              <span class="ces-kpi__detail">Prontos para montar</span>
            </span>
            <i class="pi ces-kpi__go" [class.pi-angle-right]="!soDisponiveis()" [class.pi-times]="soDisponiveis()" aria-hidden="true"></i>
          </button>
          <button type="button" class="ces-kpi" [attr.data-tone]="r?.servicoAtrasado ? 'warning' : 'neutral'" [attr.aria-pressed]="soServico()" (click)="filtrarSituacao(situacoesServico)"
            [attr.aria-label]="soServico() ? 'Mostrar todos os pneus' : 'Mostrar os pneus no reparo e na reforma'">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-wrench"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">No reparo ou reforma</span>
              <span class="ces-kpi__value">{{ r ? r.emReparo + r.emReforma : '—' }}</span>
              @if (r) { <span class="ces-kpi__detail">{{ r.servicoAtrasado ? r.servicoAtrasado + ' há mais de 30 dias' : r.emReparo + ' reparo · ' + r.emReforma + ' reforma' }}</span> }
            </span>
            <i class="pi ces-kpi__go" [class.pi-angle-right]="!soServico()" [class.pi-times]="soServico()" aria-hidden="true"></i>
          </button>
          <button type="button" class="ces-kpi" [attr.data-tone]="r?.sulcoBaixo ? 'danger' : r?.sulcoAtencao ? 'warning' : 'neutral'"
            [attr.aria-pressed]="!!lista.applied().sulcoBaixo" (click)="alternarSulco()"
            [attr.aria-label]="lista.applied().sulcoBaixo ? 'Mostrar todos os pneus' : 'Mostrar só os pneus com sulco no limite'">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-exclamation-triangle"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Sulco no limite{{ r ? ' (≤ ' + r.sulcoMinimoMm + ' mm)' : '' }}</span>
              <span class="ces-kpi__value">{{ r?.sulcoBaixo ?? '—' }}</span>
              @if (r) { <span class="ces-kpi__detail">{{ r.sulcoAtencao ? r.sulcoAtencao + ' perto do limite' : 'Nenhum perto do limite' }}</span> }
            </span>
            <i class="pi ces-kpi__go" [class.pi-angle-right]="!lista.applied().sulcoBaixo" [class.pi-times]="!!lista.applied().sulcoBaixo" aria-hidden="true"></i>
          </button>
          <div class="ces-kpi" data-tone="info">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-dollar"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Custo médio por km</span>
              <span class="ces-kpi__value">{{ custoKm(r?.custoPorKm) }}</span>
              @if (r) { <span class="ces-kpi__detail">{{ moeda(r.custoTotal) }} em compra, reparos e reformas</span> }
            </span>
          </div>
      </section>

      <ces-tabs [tabs]="abas()" [value]="aba()" (valueChange)="trocarAba($any($event))" ariaLabel="Seções dos pneus">
        <ng-template cesTabPanel="pneus">
          <ces-filter-panel #painel storageKey="frota-pneus" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
            [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
            <div class="ces-filter-grid">
              <ces-multiselect label="Situação" [options]="situacoes" [(value)]="lista.filters.situacoes" placeholder="Todas"></ces-multiselect>
              <ces-select label="Veículo" [options]="opcoesVeiculo()" [(value)]="lista.filters.idVeiculo" [filter]="true" [clearable]="true"></ces-select>
              <ces-select label="Almoxarifado" [options]="opcoesAlmoxarifado()" [(value)]="lista.filters.idEstoque" [clearable]="true"></ces-select>
              <ces-select label="Marca" [options]="opcoesMarca()" [(value)]="lista.filters.marca" [clearable]="true"></ces-select>
            </div>
          </ces-filter-panel>

          <ces-data-table title="Pneus" mode="server" [description]="descricao()" [searchable]="true" searchPlaceholder="Buscar pneu ou placa"
            storageKey="frota-pneus" exportFileName="frota-pneus" [exportRows]="exportar" [exportLimit]="limiteExportacao"
            [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()" [rowKey]="chave" [rowLabel]="rotulo" [state]="resultado.state()"
            [stateTitle]="resultado.error() ? 'Não foi possível carregar os pneus' : 'Nenhum pneu cadastrado'"
            [stateDescription]="resultado.error() ?? 'Cadastre os pneus pela marca de fogo. Depois, monte no veículo pela aba Montagem.'"
            [emptyActionLabel]="acesso.editarPneu() ? 'Cadastrar pneu' : undefined" (emptyAction)="novo()"
            noResultsTitle="Nenhum pneu com esse recorte." [filtered]="lista.filtered()"
            [(query)]="lista.query" [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
            (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()" [rowClickable]="true" (rowActivate)="abrir($event)">
            <ng-template cesCell="pneu" let-row>
              <span class="ces-cell-strong">{{ row.marcaFogo }}</span>
              <span class="ces-cell-muted">{{ row.marca }}{{ row.modelo ? ' ' + row.modelo : '' }}{{ row.medida ? ' · ' + row.medida : '' }}</span>
            </ng-template>
            <ng-template cesCell="situacao" let-row>
              @let s = situacao(row.situacao);
              <ces-status [tone]="s.tom" [icon]="s.icone">{{ s.rotulo }}</ces-status>
              <span class="ces-cell-muted">{{ onde(row) }}</span>
            </ng-template>
            <ng-template cesCell="sulco" let-row>
              <span class="sulco"><span class="sulco__ponto" [attr.data-tom]="tom(row.sulcoAtualMm)" aria-hidden="true"></span>{{ sulco(row.sulcoAtualMm) }}</span>
              @if (row.sulcoInicialMm) { <span class="ces-cell-muted">de {{ sulco(row.sulcoInicialMm) }}</span> }
            </ng-template>
            <ng-template cesCell="vida" let-row>
              <span class="num">{{ row.vida === 0 ? 'Novo' : (row.vida + 1) + 'ª vida' }}</span>
              <span class="ces-cell-muted num">{{ km(row.kmVida) }} nesta vida</span>
            </ng-template>
            <ng-template cesCell="custo" let-row>
              <span class="num">{{ custoKm(row.custoPorKm) }}</span>
              <span class="ces-cell-muted num">{{ moeda(row.custoTotal) }} · {{ km(row.kmTotal) }}</span>
            </ng-template>
            <ng-template cesCell="alertas" let-row>
              <span class="alertas">
                @for (a of row.alertas; track a) { <ces-status [tone]="alerta(a).tom" [icon]="alerta(a).icone">{{ alerta(a).rotulo }}</ces-status> }
              </span>
            </ng-template>
            <ng-template cesRowActions let-row>
              <span class="ces-table-actions">
                @if (row.situacao === 'EM_USO') {
                  <ces-icon-button icon="pi pi-sitemap" [label]="'Ver ' + row.marcaFogo + ' no diagrama do ' + placa(row.placa)" tooltip="Ver no diagrama" size="icon-sm" (pressed)="verMontagem(row.idVeiculo)"></ces-icon-button>
                }
                <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir ' + rotulo(row)" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
              </span>
            </ng-template>
          </ces-data-table>
        </ng-template>

        <ng-template cesTabPanel="montagem">
          <app-frota-pneu-montagem #montagem [veiculos]="opcoesVeiculo()" [carregandoVeiculos]="carregandoVeiculos()" [almoxarifados]="almoxarifados()"
            [fornecedores]="fornecedores()" [podeEditar]="acesso.editarPneu()" [idVeiculoInicial]="veiculoMontagem()" [rascunhoEmOutraAba]="!!rodizio()?.temAlteracoes()"
            (veiculoTrocado)="veiculoMontagem.set($event)" (alterado)="aoAlterar(); rodizio()?.carregar()" (abrirPneu)="abrir($event)"></app-frota-pneu-montagem>
        </ng-template>

        <ng-template cesTabPanel="rodizio">
          <app-frota-pneu-rodizio #rodizio [veiculos]="opcoesVeiculo()" [carregandoVeiculos]="carregandoVeiculos()" [podeEditar]="acesso.editarPneu()" [idVeiculoInicial]="veiculoMontagem()"
            [rascunhoEmOutraAba]="!!montagem()?.temAlteracoes()"
            (veiculoTrocado)="veiculoMontagem.set($event)" (alterado)="aoAlterar(); montagem()?.carregar()" (irParaMontagem)="aba.set('montagem')"></app-frota-pneu-rodizio>
        </ng-template>

        <ng-template cesTabPanel="inspecoes">
          <ces-data-table title="Inspeções" [description]="contar(inspecoes().length, 'inspeção recente', 'inspeções recentes', 'Nenhuma inspeção')"
            storageKey="frota-pneus-inspecoes" exportFileName="frota-pneus-inspecoes" [rowClickable]="true" (rowActivate)="abrirInspecao($event)"
            [columns]="colunasInspecao" [rows]="inspecoes()" [rowKey]="chaveInspecao" [rowLabel]="rotuloInspecao" [state]="estadoInspecoes()" searchPlaceholder="Buscar placa"
            stateTitle="Nenhuma inspeção registrada" stateDescription="Registre a calibragem e o sulco dos pneus montados de cada veículo."
            [emptyActionLabel]="acesso.editarPneu() ? 'Registrar inspeção' : undefined" (emptyAction)="inspecionar()">
            <ng-template cesCell="quando" let-row>
              <span class="ces-cell-strong">{{ row.realizadaEm | date: 'dd/MM/yyyy HH:mm' }}</span>
              <span class="ces-cell-muted">{{ row.registradoPor ?? '' }}</span>
            </ng-template>
            <ng-template cesCell="veiculo" let-row>
              {{ placa(row.placa) }}
              @if (row.km != null) { <span class="ces-cell-muted">{{ km(row.km) }}</span> }
            </ng-template>
            <ng-template cesCell="medicoes" let-row>
              <span class="ces-cell-muted">{{ resumoInspecao(row) }}</span>
            </ng-template>
            <ng-template cesCell="alertas" let-row>
              @if (row.alertas) { <ces-status tone="warning" icon="pi pi-exclamation-triangle">{{ contar(row.alertas, 'alerta', 'alertas', '') }}</ces-status> }
              @else { <ces-status tone="success" icon="pi pi-check">Tudo certo</ces-status> }
            </ng-template>
            <ng-template cesRowActions let-row>
              <span class="ces-table-actions">
                <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir ' + rotuloInspecao(row)" tooltip="Abrir" size="icon-sm" (pressed)="abrirInspecao(row)"></ces-icon-button>
              </span>
            </ng-template>
          </ces-data-table>
        </ng-template>

        <ng-template cesTabPanel="historico">
          <ces-data-table title="Histórico" [description]="contar(eventos().length, 'movimentação recente', 'movimentações recentes', 'Nenhuma movimentação')"
            storageKey="frota-pneus-historico" exportFileName="frota-pneus-historico" [rowClickable]="true" (rowActivate)="abrirPorId($event.idPneu)"
            [columns]="colunasEvento" [rows]="eventos()" [rowKey]="chaveEvento" [state]="estadoEventos()" searchPlaceholder="Buscar pneu ou placa"
            stateTitle="Nenhuma movimentação" stateDescription="Montagens, rodízios, reparos, reformas e descartes aparecem aqui.">
            <ng-template cesCell="quando" let-row>
              <span class="ces-cell-strong">{{ row.ocorridoEm | date: 'dd/MM/yyyy HH:mm' }}</span>
              <span class="ces-cell-muted">{{ row.usuario ?? '' }}</span>
            </ng-template>
            <ng-template cesCell="tipo" let-row>
              @let t = evento(row);
              <ces-status [tone]="t.tom" [icon]="t.icone">{{ t.rotulo }}</ces-status>
            </ng-template>
            <ng-template cesCell="descricao" let-row>
              {{ row.descricao }}
              @if (row.kmRodado || row.valor) {
                <span class="ces-cell-muted">{{ row.kmRodado ? 'rodou ' + km(row.kmRodado) : '' }}{{ row.kmRodado && row.valor ? ' · ' : '' }}{{ row.valor ? moeda(row.valor) : '' }}</span>
              }
            </ng-template>
          </ces-data-table>
        </ng-template>
      </ces-tabs>
    </div>

    <app-frota-pneu-drawer [(visivel)]="painelAberto" [pneu]="emEdicao()" [almoxarifados]="almoxarifados()" [fornecedores]="fornecedores()"
      [marcas]="marcas()" [podeEditar]="acesso.editarPneu()" (salvo)="aoSalvar($event)" (abrirMontagem)="verMontagem($event)"></app-frota-pneu-drawer>
    <app-frota-pneu-inspecao-drawer [(visivel)]="inspecaoAberta" [veiculos]="opcoesVeiculo()" [idVeiculoInicial]="veiculoMontagem()"
      (registrada)="aoInspecionar()"></app-frota-pneu-inspecao-drawer>
    <app-frota-pneu-inspecao-detalhe [(visivel)]="detalheInspecaoAberto" [inspecao]="inspecaoEmDetalhe()" (abrirPneu)="abrirPorId($event)"></app-frota-pneu-inspecao-detalhe>
  `
})
export class FrotaPneusComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly frota = inject(FrotaService);
  protected readonly acesso = acessoFrota();
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly notificacoes = inject(NotificationService);
  protected readonly montagem = viewChild<FrotaPneuMontagemComponent>('montagem');
  protected readonly rodizio = viewChild<FrotaPneuRodizioComponent>('rodizio');

  protected readonly situacoes = SITUACOES;
  protected readonly situacoesServico = SERVICO;
  protected readonly moeda = moeda;
  protected readonly custoKm = formatarCustoKm;
  protected readonly contar = contar;
  protected readonly placa = formatarPlaca;
  protected readonly sulco = formatarSulco;
  protected readonly km = (v: number | null) => formatarKm(v);
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;

  protected readonly aba = cesUrlParam<Aba>({ values: ABAS, default: 'pneus' });
  protected readonly veiculoMontagem = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('veiculo'));
  protected readonly resumo = signal<ResumoPneus | null>(null);
  protected readonly almoxarifados = signal<AlmoxarifadoFrota[]>([]);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly marcas = signal<string[]>([]);
  private readonly veiculos = signal<{ idVeiculo: string; placa: string; modelo: string | null }[]>([]);
  protected readonly carregandoVeiculos = signal(true);
  protected readonly painelAberto = signal(false);
  protected readonly inspecaoAberta = signal(false);
  protected readonly detalheInspecaoAberto = signal(false);
  protected readonly inspecaoEmDetalhe = signal<InspecaoPneu | null>(null);
  protected readonly emEdicao = signal<Pneu | null>(null);
  protected readonly inspecoes = signal<InspecaoPneu[]>([]);
  protected readonly estadoInspecoes = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly eventos = signal<EventoPneu[]>([]);
  protected readonly estadoEventos = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');

  protected readonly abas = computed<CesTabItem[]>(() => [
    { value: 'pneus', label: 'Pneus', icon: 'pi pi-list' },
    { value: 'montagem', label: 'Montagem', icon: 'pi pi-sitemap', badge: this.montagem()?.quantasAlteracoes() || undefined },
    { value: 'rodizio', label: 'Rodízio', icon: 'pi pi-sync', badge: this.rodizio()?.quantasAlteracoes() || undefined },
    { value: 'inspecoes', label: 'Inspeções', icon: 'pi pi-gauge' },
    { value: 'historico', label: 'Histórico', icon: 'pi pi-history' }
  ]);
  protected readonly opcoesVeiculo = computed<CesSelectOption<string>[]>(() =>
    this.veiculos().map((v) => ({ label: `${formatarPlaca(v.placa)}${v.modelo ? ' · ' + v.modelo : ''}`, value: v.idVeiculo })));
  protected readonly opcoesAlmoxarifado = computed<CesSelectOption<string>[]>(() => this.almoxarifados().map((a) => ({ label: a.nome, value: a.id })));
  protected readonly opcoesMarca = computed<CesSelectOption<string>[]>(() => this.marcas().map((m) => ({ label: m, value: m })));

  protected readonly lista = cesListState({
    storageKey: 'frota-pneus',
    rememberFilters: 'frota-pneus',
    filters: {
      situacoes: cesFilter.list<SituacaoPneu>(ATIVOS, {
        label: 'Situação', param: 'situacao',
        format: (lista) => (!lista.length ? null : mesmaLista(lista, ATIVOS) ? 'Sem os descartados' : lista.map((s) => SITUACAO_PNEU[s].rotulo).join(', '))
      }),
      idVeiculo: cesFilter.value<string | null>(null, { label: 'Veículo', param: 'placa', options: () => this.opcoesVeiculo() }),
      idEstoque: cesFilter.value<string | null>(null, { label: 'Almoxarifado', param: 'almoxarifado', options: () => this.opcoesAlmoxarifado() }),
      marca: cesFilter.value<string | null>(null, { label: 'Marca', param: 'marca', options: () => this.opcoesMarca() }),
      sulcoBaixo: cesFilter.value<boolean | null>(null, { label: 'Sulco', param: 'sulco', options: () => [{ label: 'No limite', value: true }] })
    },
    sort: [{ key: 'marcaFogo', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<Pneu>(
    (pedido) => this.servico.listar(this.filtro(pedido.filters, pedido.query), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.servico.listar(this.filtro(this.lista.request().filters, this.lista.request().query), pagina),
    () => this.lista.request()
  );
  protected readonly descricao = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'pneu', 'pneus', 'Nenhum pneu'));

  protected readonly colunas: CesDataTableColumn<Pneu>[] = [
    { key: 'pneu', header: 'Pneu', type: 'custom', priority: 1, sortField: 'marcaFogo', value: (p) => p.marcaFogo, display: (p) => `${p.marcaFogo} ${p.marca} ${p.medida ?? ''}` },
    { key: 'situacao', header: 'Onde está', type: 'custom', priority: 1, sortField: 'situacao', value: (p) => p.situacao, display: (p) => `${p.situacaoRotulo}${this.onde(p)}` },
    { key: 'sulco', header: 'Sulco', type: 'custom', priority: 1, sortField: 'sulcoAtualMm', value: (p) => p.sulcoAtualMm, display: (p) => formatarSulco(p.sulcoAtualMm) },
    { key: 'vida', header: 'Vida', type: 'custom', priority: 2, sortField: 'vida', value: (p) => p.vida, display: (p) => `${p.vida + 1}ª vida, ${p.kmVida} km` },
    { key: 'custo', header: 'Custo por km', type: 'custom', priority: 3, value: (p) => p.custoPorKm, display: (p) => (p.custoPorKm != null ? String(p.custoPorKm) : '') },
    { key: 'alertas', header: 'Alertas', type: 'custom', priority: 2, value: (p) => p.alertas.length, display: (p) => p.alertas.map((a) => ALERTA_PNEU[a].rotulo).join(', ') }
  ];
  protected readonly colunasInspecao: CesDataTableColumn<InspecaoPneu>[] = [
    { key: 'quando', header: 'Quando', type: 'custom', priority: 1, value: (i) => i.realizadaEm, display: (i) => i.realizadaEm },
    { key: 'veiculo', header: 'Veículo', type: 'custom', priority: 1, value: (i) => i.placa, display: (i) => formatarPlaca(i.placa) },
    { key: 'medicoes', header: 'Medições', type: 'custom', priority: 2, value: (i) => i.itens.length, display: (i) => this.resumoInspecao(i) },
    { key: 'alertas', header: 'Resultado', type: 'custom', priority: 1, value: (i) => i.alertas, display: (i) => String(i.alertas) }
  ];
  protected readonly colunasEvento: CesDataTableColumn<EventoPneu>[] = [
    { key: 'quando', header: 'Quando', type: 'custom', priority: 1, value: (e) => e.ocorridoEm, display: (e) => e.ocorridoEm },
    { key: 'pneu', header: 'Pneu', type: 'text', priority: 1, value: (e) => e.marcaFogo ?? '', display: (e) => e.marcaFogo ?? '' },
    { key: 'tipo', header: 'O quê', type: 'custom', priority: 1, value: (e) => e.tipo, display: (e) => e.tipoRotulo },
    { key: 'placa', header: 'Veículo', type: 'text', priority: 2, value: (e) => formatarPlaca(e.placa), display: (e) => formatarPlaca(e.placa) },
    { key: 'descricao', header: 'Detalhe', type: 'custom', priority: 2, value: (e) => e.descricao, display: (e) => e.descricao }
  ];
  protected readonly chave = (p: Pneu) => p.id;
  protected readonly rotulo = (p: Pneu) => `pneu ${p.marcaFogo}`;
  protected readonly chaveInspecao = (i: InspecaoPneu) => i.id;
  protected readonly chaveEvento = (e: EventoPneu) => e.id;
  protected readonly rotuloInspecao = (i: InspecaoPneu) => `inspeção do ${formatarPlaca(i.placa)}`;
  protected readonly soDisponiveis = computed(() => mesmaLista(this.lista.applied().situacoes, ['DISPONIVEL']));
  protected readonly soServico = computed(() => mesmaLista(this.lista.applied().situacoes, SERVICO));

  /** Sair da tela com montagem ou rodízio por salvar pede confirmação (rota com `cesUnsavedChangesGuard`). */
  hasUnsavedChanges(): boolean {
    return !!this.montagem()?.temAlteracoes() || !!this.rodizio()?.temAlteracoes();
  }

  constructor() {
    this.carregarResumo();
    this.servico.almoxarifados().subscribe({ next: (a) => this.almoxarifados.set(a), error: () => undefined });
    this.servico.marcas().subscribe({ next: (m) => this.marcas.set(m), error: () => undefined });
    this.frota.fornecedoresOficina().subscribe({ next: (f) => this.fornecedores.set(f), error: () => undefined });
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => (this.veiculos.set(p.content.map((v) => ({ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo }))), this.carregandoVeiculos.set(false)),
      error: () => this.carregandoVeiculos.set(false)
    });
    effect(() => {
      const aba = this.aba();
      if (aba === 'inspecoes') this.carregarInspecoes();
      if (aba === 'historico') this.carregarEventos();
    });
    // O veículo em trabalho fica na URL: recarregar ou mandar o link abre no mesmo veículo.
    effect(() => {
      const veiculo = this.veiculoMontagem();
      untracked(() => {
        if (this.rota.snapshot.queryParamMap.get('veiculo') !== veiculo) {
          void this.router.navigate([], { relativeTo: this.rota, queryParams: { veiculo }, queryParamsHandling: 'merge', replaceUrl: true });
        }
      });
    });
    // Link direto para um pneu (ex.: a partir da ficha do veículo).
    const idPneu = this.rota.snapshot.queryParamMap.get('pneu');
    if (idPneu) {
      this.abrirPorId(idPneu);
      void this.router.navigate([], { relativeTo: this.rota, queryParams: { pneu: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  protected async trocarAba(aba: Aba): Promise<void> {
    this.aba.set(aba);
  }

  protected novo(): void {
    this.emEdicao.set(null);
    this.painelAberto.set(true);
  }

  protected abrir(p: Pneu): void {
    this.emEdicao.set(p);
    this.painelAberto.set(true);
  }

  protected abrirPorId(id: string): void {
    this.servico.buscar(id).subscribe({
      next: (p) => this.abrir(p),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected abrirInspecao(i: InspecaoPneu): void {
    this.inspecaoEmDetalhe.set(i);
    this.detalheInspecaoAberto.set(true);
  }

  protected inspecionar(): void {
    this.inspecaoAberta.set(true);
  }

  protected verMontagem(idVeiculo: string | null): void {
    this.painelAberto.set(false);
    this.veiculoMontagem.set(idVeiculo);
    this.aba.set('montagem');
  }

  protected aoSalvar(p: Pneu): void {
    if (this.painelAberto() && this.emEdicao()) this.emEdicao.set(p);
    this.aoAlterar();
    this.montagem()?.carregar();
    this.rodizio()?.carregar();
    if (this.aba() === 'historico') this.carregarEventos();
    this.servico.marcas().subscribe({ next: (m) => this.marcas.set(m), error: () => undefined });
  }

  protected aoAlterar(): void {
    this.lista.reload();
    this.carregarResumo();
  }

  protected aoInspecionar(): void {
    this.aoAlterar();
    if (this.aba() === 'inspecoes') this.carregarInspecoes();
    this.montagem()?.carregar();
    this.rodizio()?.carregar();
  }

  /** Atalho dos indicadores: tocar de novo no mesmo volta ao recorte padrão. */
  protected filtrarSituacao(situacoes: SituacaoPneu[]): void {
    this.aba.set('pneus');
    this.lista.set('situacoes', mesmaLista(this.lista.applied().situacoes, situacoes) ? ATIVOS : situacoes);
  }

  protected alternarSulco(): void {
    this.aba.set('pneus');
    this.lista.set('sulcoBaixo', this.lista.applied().sulcoBaixo ? null : true);
  }

  protected situacao(s: SituacaoPneu) {
    return SITUACAO_PNEU[s];
  }

  protected alerta(a: string) {
    return ALERTA_PNEU[a as keyof typeof ALERTA_PNEU];
  }

  protected evento(e: EventoPneu) {
    return EVENTO_PNEU[e.tipo];
  }

  protected tom(mm: number | null): string {
    return tomSulco(mm, this.resumo()?.sulcoMinimoMm ?? 3);
  }

  protected pct(parte: number, total: number): number {
    return total ? (parte / total) * 100 : 0;
  }

  protected onde(p: Pneu): string {
    switch (p.situacao) {
      case 'EM_USO': return `${formatarPlaca(p.placa)} · ${p.posicaoRotulo}`;
      case 'DISPONIVEL': return p.estoque ?? '';
      case 'EM_REPARO':
      case 'EM_REFORMA': return p.fornecedorServico ?? '';
      default: return p.motivoDescarte ?? '';
    }
  }

  protected resumoInspecao(i: InspecaoPneu): string {
    const pressoes = i.itens.filter((x) => x.pressaoPsi != null).length;
    const sulcos = i.itens.filter((x) => x.sulcoMm != null).length;
    return [pressoes ? `${pressoes} calibrados` : '', sulcos ? `${sulcos} sulcos medidos` : ''].filter(Boolean).join(' · ');
  }

  private carregarResumo(): void {
    this.servico.resumo().subscribe({ next: (r) => this.resumo.set(r), error: () => undefined });
  }

  private carregarInspecoes(): void {
    this.estadoInspecoes.set('loading');
    this.servico.inspecoes(null, { size: 200, sort: ['realizadaEm,desc'] }).subscribe({
      next: (p) => (this.inspecoes.set(p.content), this.estadoInspecoes.set(p.content.length ? 'ready' : 'empty')),
      error: () => this.estadoInspecoes.set('error')
    });
  }

  private carregarEventos(): void {
    this.estadoEventos.set('loading');
    this.servico.eventos({}, { size: 300, sort: ['ocorridoEm,desc'] }).subscribe({
      next: (p) => (this.eventos.set(p.content), this.estadoEventos.set(p.content.length ? 'ready' : 'empty')),
      error: () => this.estadoEventos.set('error')
    });
  }

  private filtro(f: Record<string, unknown>, busca: string | null | undefined): FiltroPneus {
    return {
      busca: busca || null,
      situacoes: f['situacoes'] as SituacaoPneu[],
      idVeiculo: f['idVeiculo'] as string | null,
      idEstoque: f['idEstoque'] as string | null,
      marca: f['marca'] as string | null,
      sulcoBaixo: f['sulcoBaixo'] as boolean | null
    };
  }
}
