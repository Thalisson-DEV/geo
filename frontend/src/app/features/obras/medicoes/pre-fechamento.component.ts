import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoIconButtonComponent,
  GeoListShortcutsDirective,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoStatusComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { LinhaPreFechamento } from '../../../core/models/obras-medicoes.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasMedicoesService } from '../../../core/services/obras-medicoes.service';
import { AjudaListagemComponent } from '../../../shared/listagem/ajuda-listagem.component';
import {
  EXECUCOES,
  ExecucaoPonto,
  PENDENCIAS,
  PRIORIDADES,
  PendenciaLevantamento,
  SITUACOES_LEVANTAMENTO,
  SituacaoLevantamento,
  codigoSituacao,
  noRecortePreFechamento,
  opcoesDistintas,
  pendenciasLevantamento,
  situacaoLevantamento
} from './medicoes.logic';
import { AJUSTE_TEXTO_LISTAGEM } from '../obras-ui';

/**
 * Pré-fechamento do levantamento: por obra em aberto, o que foi lançado no planejamento, o que falta (ponto ou vão sem
 * kit, ponto sem vão) e quem levantou. Concluir só é oferecido quando não falta nada; a pendência leva ao planejamento.
 */
@Component({
  selector: 'app-pre-fechamento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFilterPanelComponent,
    GeoIconButtonComponent,
    GeoListShortcutsDirective,
    GeoMultiSelectComponent,
    GeoPageHeaderComponent,
    GeoRowActionsDirective,
    GeoStatusComponent,
    AjudaListagemComponent
  ],
  template: `
    <div class="geo-page" geoListShortcuts>
      <geo-page-header title="Pré-fechamento" icon="pi pi-clipboard"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Medições' }, { label: 'Pré-fechamento' }]"
        description="Situação do levantamento de cada obra em aberto: o que foi lançado no planejamento, o que ainda está sem kit e quem levantou."
        helpLabel="Ajuda sobre o pré-fechamento" (help)="ajuda.show()">
      </geo-page-header>

      <geo-filter-panel #painel storageKey="obras-pre-fechamento" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="carregando()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="geo-filter-grid">
          <geo-multiselect label="Situação do levantamento" [options]="situacoesOpcoes" [(value)]="lista.filters.situacao" [clearable]="true"
            selectedItemsLabel="{0} situações" [maxSelectedLabels]="2" placeholder="Todas, inclusive concluídas"></geo-multiselect>
          <geo-multiselect label="Pendência" [options]="pendenciasOpcoes" [(value)]="lista.filters.pendencias" [clearable]="true" placeholder="Qualquer"></geo-multiselect>
          <geo-multiselect label="Base operacional" [options]="opcoes().bases" [(value)]="lista.filters.bases" [clearable]="true" [filter]="true"
            selectedItemsLabel="{0} bases" [maxSelectedLabels]="2" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Município" [options]="opcoes().municipios" [(value)]="lista.filters.municipios" [clearable]="true" [filter]="true"
            selectedItemsLabel="{0} municípios" [maxSelectedLabels]="2" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Supervisor" [options]="opcoes().supervisores" [(value)]="lista.filters.supervisores" [clearable]="true" [filter]="true"
            selectedItemsLabel="{0} supervisores" [maxSelectedLabels]="2" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Status da obra" [options]="opcoes().status" [(value)]="lista.filters.status" [clearable]="true" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Prioridade" [options]="prioridadesOpcoes" [(value)]="lista.filters.prioridades" [clearable]="true" placeholder="Todas"></geo-multiselect>
          <geo-multiselect label="Levantador" [options]="opcoes().levantadores" [(value)]="lista.filters.levantadores" [clearable]="true" [filter]="true"
            selectedItemsLabel="{0} levantadores" [maxSelectedLabels]="2" placeholder="Todos"></geo-multiselect>
          <geo-multiselect label="Tipo de execução" [options]="execucoesOpcoes" [(value)]="lista.filters.execucoes" [clearable]="true" placeholder="Qualquer"
            description="Obras com algum ponto desse tipo."></geo-multiselect>
        </div>
      </geo-filter-panel>

      <section class="geo-kpis pre-kpis" aria-label="Indicadores do levantamento" aria-live="polite">
        <button type="button" class="geo-kpi" data-tone="info" [attr.aria-pressed]="!lista.applied().situacao.length" (click)="lista.set('situacao', [])">
          <span class="geo-kpi__icon"><i class="pi pi-building" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Obras em aberto</span>
            <span class="geo-kpi__value">{{ ind().obras }}</span>
            <span class="geo-kpi__detail">{{ ind().concluidas }} com levantamento concluído</span></span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="ind().pendentes ? 'warning' : 'success'" [attr.aria-pressed]="soPendentes()" (click)="lista.set('situacao', pendentesPadrao)">
          <span class="geo-kpi__icon"><i class="pi pi-clock" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Levantamento pendente</span>
            <span class="geo-kpi__value">{{ ind().pendentes }}</span>
            <span class="geo-kpi__detail">Mostra só as pendentes</span></span>
        </button>
        <button type="button" class="geo-kpi" [attr.data-tone]="ind().prontas ? 'info' : 'neutral'" [attr.aria-pressed]="soProntas()" (click)="lista.set('situacao', ['PRONTO'])">
          <span class="geo-kpi__icon"><i class="pi pi-flag" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Prontas para concluir</span>
            <span class="geo-kpi__value">{{ ind().prontas }}</span>
            <span class="geo-kpi__detail">Com pontos e nada sem kit</span></span>
        </button>
        <div class="geo-kpi" [attr.data-tone]="ind().pontosSemKit ? 'warning' : 'neutral'">
          <span class="geo-kpi__icon"><i class="pi pi-map-marker" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Pontos sem kit</span>
            <span class="geo-kpi__value">{{ ind().pontosSemKit }}</span>
            <span class="geo-kpi__detail">Nas obras pendentes</span></span>
        </div>
        <div class="geo-kpi" [attr.data-tone]="ind().vaosSemKit ? 'warning' : 'neutral'">
          <span class="geo-kpi__icon"><i class="pi pi-arrows-h" aria-hidden="true"></i></span>
          <span class="geo-kpi__body"><span class="geo-kpi__label">Vãos sem kit</span>
            <span class="geo-kpi__value">{{ ind().vaosSemKit }}</span>
            <span class="geo-kpi__detail">Nas obras pendentes</span></span>
        </div>
      </section>

      <geo-data-table [textFit]="ajusteTexto" title="Obras" storageKey="obras-pre-fechamento" exportFileName="pre-fechamento"
        searchPlaceholder="Obra, título, município ou levantador" rowActionLabel="Abrir planejamento" rowActionIcon="pi pi-map"
        noResultsTitle="Nenhuma obra encontrada com essa busca."
        [columns]="colunas" [rows]="linhas()" [rowKey]="chave" [rowLabel]="rotulo" [state]="estado()"
        [stateTitle]="erro() ? 'Não foi possível carregar o pré-fechamento' : soPendentes() ? 'Nenhum levantamento pendente' : 'Nenhuma obra em aberto'"
        [stateDescription]="erro() ?? (soPendentes() ? 'Todas as obras em aberto do recorte já têm o levantamento concluído.' : 'As obras em aberto aparecem aqui.')"
        [filtered]="lista.filtered()" (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()" (rowActivate)="abrirPlanejamento($event)">
        <ng-template geoCell="obra" let-row>
          <a class="geo-cell-strong" [routerLink]="['/obras', row.idObra]" [attr.aria-label]="'Abrir a ficha da obra ' + row.numero">{{ row.numero }}</a>
          <span class="geo-cell-muted">{{ row.titulo }}</span>
        </ng-template>
        <ng-template geoCell="local" let-row>
          <span>{{ row.contexto?.municipio ?? '—' }}</span>
          <span class="geo-cell-muted">{{ local(row) }}</span>
        </ng-template>
        <ng-template geoCell="pendencias" let-row>
          @if (pendencias(row); as texto) {
            <geo-status [tone]="row.pontos ? 'warning' : 'neutral'" [icon]="row.pontos ? 'pi-exclamation-triangle' : 'pi-minus-circle'">{{ texto }}</geo-status>
          } @else { <span class="geo-cell-muted">—</span> }
          @if (row.pontosSemVao) { <span class="geo-cell-muted">{{ row.pontosSemVao === 1 ? '1 ponto sem vão' : row.pontosSemVao + ' pontos sem vão' }}</span> }
        </ng-template>
        <ng-template geoCell="execucao" let-row>
          <span class="pre-execucao">
            @if (row.semDesligamento) { <geo-status tone="success" icon="pi-bolt" [emphasis]="'outline'">{{ row.semDesligamento }} sem deslig.</geo-status> }
            @if (row.comDesligamento) { <geo-status tone="danger" icon="pi-power-off" [emphasis]="'outline'">{{ row.comDesligamento }} com deslig.</geo-status> }
            @if (row.naoDefinido) { <geo-status tone="neutral" icon="pi-question-circle" [emphasis]="'outline'">{{ row.naoDefinido }} não definido</geo-status> }
            @if (!row.pontos) { <span class="geo-cell-muted">—</span> }
          </span>
        </ng-template>
        <ng-template geoCell="levantadores" let-row>
          @if (row.levantadores.length) { <span [title]="row.levantadores.join(', ')">{{ row.levantadores.join(', ') }}</span> } @else { <span class="geo-cell-muted">—</span> }
        </ng-template>
        <ng-template geoCell="situacao" let-row>
          <geo-status [tone]="situacao(row).tom" [icon]="situacao(row).icone">{{ situacao(row).rotulo }}</geo-status>
          @if (row.concluido) { <span class="geo-cell-muted">{{ row.concluidoPor }} · {{ row.concluidoEm | date: 'dd/MM/yyyy' }}</span> }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (podeConcluir) {
              @if (row.concluido) {
                <geo-icon-button icon="pi pi-replay" size="icon-sm" [label]="'Reabrir o levantamento da obra ' + row.numero" tooltip="Reabrir levantamento"
                  [loading]="emAndamento() === row.idObra" (pressed)="reabrir(row)"></geo-icon-button>
              } @else {
                <geo-icon-button icon="pi pi-check-circle" size="icon-sm" [label]="'Concluir o levantamento da obra ' + row.numero"
                  [tooltip]="row.prontoParaConcluir ? 'Concluir levantamento' : 'Há pendências: abra o planejamento'"
                  [disabled]="!row.prontoParaConcluir" [loading]="emAndamento() === row.idObra" (pressed)="concluir(row)"></geo-icon-button>
              }
            }
            <geo-icon-button icon="pi pi-building" size="icon-sm" [label]="'Abrir a ficha da obra ' + row.numero" tooltip="Ficha da obra" (pressed)="abrirFicha(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    </div>

    <app-ajuda-listagem #ajuda titulo="Pré-fechamento" entidadePlural="obras" busca="obra, título, município ou levantador" [podeCriar]="false">
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-clipboard"></i> O que é</h4>
        <p class="help-text-desc">O pré-fechamento confere o levantamento antes de programar e medir. Uma obra só tem o levantamento concluído quando tem pontos e nenhum ponto ou vão sem kit: assim o valor planejado está completo.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-map"></i> Resolvendo pendências</h4>
        <p class="help-text-desc">Clique na obra para abrir o planejamento sobre o PDF e aplicar os kits que faltam. "Ponto sem vão" só avisa: um ponto isolado, como um poste novo sem rede, pode ser correto.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-users"></i> Levantadores</h4>
        <p class="help-text-desc">São os usuários que lançaram pontos, vãos ou kits no planejamento da obra.</p>
      </div>
      <div class="help-section">
        <h4 class="help-section-title"><i class="pi pi-filter"></i> Filtros e indicadores</h4>
        <p class="help-text-desc">A tela abre nas obras com levantamento pendente. Base, município, supervisor, status, prioridade, levantador, pendência e tipo de execução formam o recorte e mudam os indicadores. A situação do levantamento só filtra a tabela: clicar em "Obras em aberto", "Levantamento pendente" ou "Prontas para concluir" troca a situação sem mudar os números.</p>
      </div>
    </app-ajuda-listagem>
  `,
  styles: `
    .pre-kpis { margin-bottom: 1rem; }
    .pre-execucao { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  `
})
export class PreFechamentoComponent {
  protected readonly ajusteTexto = AJUSTE_TEXTO_LISTAGEM;
  private readonly api = inject(ObrasMedicoesService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly podeConcluir = (inject(AuthService).currentUser()?.permissoes ?? []).includes('obras:planejamento:write');
  protected readonly situacao = situacaoLevantamento;
  protected readonly pendencias = pendenciasLevantamento;
  protected readonly situacoesOpcoes = SITUACOES_LEVANTAMENTO;
  protected readonly pendenciasOpcoes = PENDENCIAS;
  protected readonly execucoesOpcoes = EXECUCOES;
  protected readonly prioridadesOpcoes = PRIORIDADES;
  protected readonly pendentesPadrao: SituacaoLevantamento[] = ['PENDENTE', 'PRONTO', 'SEM_LEVANTAMENTO'];

  private readonly todas = signal<LinhaPreFechamento[]>([]);
  private readonly carregado = signal(false);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly emAndamento = signal<string | null>(null);

  protected readonly lista = geoListState({
    storageKey: 'obras-pre-fechamento',
    filters: {
      situacao: geoFilter.list<SituacaoLevantamento>(['PENDENTE', 'PRONTO', 'SEM_LEVANTAMENTO'], {
        label: 'Levantamento', param: 'situacao',
        itemLabel: (v) => SITUACOES_LEVANTAMENTO.find((s) => s.value === v)?.label ?? v,
        format: (v): string | null => (!v.length ? 'todas, inclusive concluídas' : v.length === 3 && !v.includes('CONCLUIDO') ? 'pendentes' : v.map((s) => SITUACOES_LEVANTAMENTO.find((o) => o.value === s)?.label ?? s).join(', '))
      }),
      pendencias: geoFilter.list<PendenciaLevantamento>([], { label: 'Pendência', param: 'pendencia', itemLabel: (v) => PENDENCIAS.find((p) => p.value === v)?.label ?? v }),
      bases: geoFilter.list<string>([], { label: 'Base', param: 'base', itemLabel: (id) => this.nome(this.opcoes().bases, id), countLabel: (n) => `${n} bases` }),
      municipios: geoFilter.list<string>([], { label: 'Município', param: 'municipio', itemLabel: (id) => this.nome(this.opcoes().municipios, id), countLabel: (n) => `${n} municípios` }),
      supervisores: geoFilter.list<string>([], { label: 'Supervisor', param: 'supervisor', itemLabel: (id) => this.nome(this.opcoes().supervisores, id), countLabel: (n) => `${n} supervisores` }),
      status: geoFilter.list<string>([], { label: 'Status da obra', param: 'status', countLabel: (n) => `${n} status` }),
      prioridades: geoFilter.list<string>([], { label: 'Prioridade', param: 'prioridade', itemLabel: (v) => PRIORIDADES.find((p) => p.value === v)?.label ?? v }),
      levantadores: geoFilter.list<string>([], { label: 'Levantador', param: 'levantador', countLabel: (n) => `${n} levantadores` }),
      execucoes: geoFilter.list<ExecucaoPonto>([], { label: 'Execução', param: 'execucao', itemLabel: (v) => EXECUCOES.find((e) => e.value === v)?.label ?? v })
    }
  });

  /** Opções a partir das obras carregadas: só aparece o que existe no pré-fechamento. */
  protected readonly opcoes = computed(() => {
    const linhas = this.todas();
    return {
      bases: opcoesDistintas(linhas, (l) => l.contexto?.idBaseOperacional, (l) => l.contexto?.baseOperacional),
      municipios: opcoesDistintas(linhas, (l) => l.contexto?.idMunicipio, (l) => l.contexto?.municipio),
      supervisores: opcoesDistintas(linhas, (l) => l.contexto?.idSupervisor, (l) => l.contexto?.supervisor),
      status: opcoesDistintas(linhas, (l) => l.contexto?.statusObra, (l) => l.contexto?.statusObra),
      levantadores: opcoesDistintas(linhas.flatMap((l) => l.levantadores), (u) => u, (u) => u)
    };
  });

  /** Recorte sem a situação: é sobre ele que os indicadores contam. */
  private readonly recortadas = computed(() => {
    const f = this.lista.applied();
    return this.todas().filter((l) => noRecortePreFechamento(l, f));
  });
  protected readonly linhas = computed(() => {
    const situacoes = this.lista.applied().situacao;
    return this.recortadas().filter((l) => !situacoes.length || situacoes.includes(codigoSituacao(l)));
  });
  protected readonly ind = computed(() => {
    const linhas = this.recortadas();
    const abertas = linhas.filter((l) => !l.concluido);
    return {
      obras: linhas.length,
      concluidas: linhas.length - abertas.length,
      pendentes: abertas.length,
      prontas: abertas.filter((l) => l.prontoParaConcluir).length,
      pontosSemKit: abertas.reduce((t, l) => t + l.pontosSemKit, 0),
      vaosSemKit: abertas.reduce((t, l) => t + l.vaosSemKit, 0)
    };
  });
  protected readonly soPendentes = computed(() => {
    const s = this.lista.applied().situacao;
    return s.length === 3 && !s.includes('CONCLUIDO');
  });
  protected readonly soProntas = computed(() => {
    const s = this.lista.applied().situacao;
    return s.length === 1 && s[0] === 'PRONTO';
  });
  protected readonly estado = computed(() => (!this.carregado() ? (this.erro() ? 'error' : 'loading') : this.linhas().length ? 'ready' : 'empty'));

  protected readonly colunas: GeoDataTableColumn<LinhaPreFechamento>[] = [
    { key: 'obra', header: 'Obra', type: 'custom', priority: 1, value: (l) => l.numero, display: (l) => `${l.numero} ${l.titulo}` },
    { key: 'local', header: 'Município', type: 'custom', value: (l) => l.contexto?.municipio, display: (l) => [l.contexto?.municipio, this.local(l)].filter(Boolean).join(' · ') },
    { key: 'pontos', header: 'Pontos', type: 'integer', value: (l) => l.pontos },
    { key: 'vaos', header: 'Vãos', type: 'integer', value: (l) => l.vaos },
    { key: 'pendencias', header: 'Pendências', type: 'custom', priority: 1, value: (l) => l.pontosSemKit + l.vaosSemKit, display: (l) => pendenciasLevantamento(l) ?? '' },
    { key: 'execucao', header: 'Execução', type: 'custom', value: (l) => l.comDesligamento, display: (l) => `${l.semDesligamento} SL · ${l.comDesligamento} DL · ${l.naoDefinido} N/D` },
    { key: 'levantadores', header: 'Levantadores', type: 'custom', value: (l) => l.levantadores.join(', '), display: (l) => l.levantadores.join(', ') },
    { key: 'situacao', header: 'Levantamento', type: 'custom', priority: 1, value: (l) => (l.concluido ? 2 : l.prontoParaConcluir ? 1 : 0), display: (l) => situacaoLevantamento(l).rotulo }
  ];
  protected readonly chave = (l: LinhaPreFechamento) => l.idObra;
  protected readonly rotulo = (l: LinhaPreFechamento) => `obra ${l.numero}`;

  constructor() {
    this.carregar();
  }

  /** Carrega todas as obras em aberto uma vez; os filtros rodam na tela, sobre o que veio. */
  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.api
      .preFechamento({ apenasPendentes: false })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.todas.set(d.linhas);
          this.carregado.set(true);
          this.carregando.set(false);
        },
        error: (e) => {
          this.erro.set(getErrorMessage(e));
          this.carregando.set(false);
        }
      });
  }

  protected local(l: LinhaPreFechamento): string {
    return [l.contexto?.baseOperacional, l.contexto?.supervisor].filter(Boolean).join(' · ');
  }

  private nome(opcoes: readonly { label: string; value: string }[], id: string): string {
    return opcoes.find((o) => o.value === id)?.label ?? 'selecionado';
  }

  protected async concluir(l: LinhaPreFechamento): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: `Concluir o levantamento da obra ${l.numero}?`,
      message: `${l.pontos} pontos e ${l.vaos} vãos, todos com kit. O levantamento pode ser reaberto depois, se precisar.`,
      confirmLabel: 'Concluir levantamento'
    });
    if (!ok) return;
    this.executar(l, this.api.concluirLevantamento(l.idObra), `Levantamento da obra ${l.numero} concluído.`);
  }

  protected async reabrir(l: LinhaPreFechamento): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: `Reabrir o levantamento da obra ${l.numero}?`,
      message: 'A obra volta para a lista de pendentes até ser concluída de novo.',
      confirmLabel: 'Reabrir levantamento'
    });
    if (!ok) return;
    this.executar(l, this.api.reabrirLevantamento(l.idObra), `Levantamento da obra ${l.numero} reaberto.`);
  }

  private executar(l: LinhaPreFechamento, pedido: ReturnType<ObrasMedicoesService['concluirLevantamento']>, sucesso: string): void {
    this.emAndamento.set(l.idObra);
    pedido.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.emAndamento.set(null);
        this.notificacoes.success(sucesso);
        this.carregar();
      },
      error: (e) => {
        this.emAndamento.set(null);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected abrirPlanejamento(l: LinhaPreFechamento): void {
    void this.router.navigate(['/obras', l.idObra, 'planejamento']);
  }

  protected abrirFicha(l: LinhaPreFechamento): void {
    void this.router.navigate(['/obras', l.idObra]);
  }
}
