import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFilterPanelComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoPageHeaderComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService,
  geoFilter,
  geoListState
} from '@geo/ui';
import { take } from 'rxjs';

import {
  FotoParaRevisao, InconformidadeFoto, LinhaRankingFotos, OpcaoInconformidade, RevisaoFoto
} from '../../../core/models/obras-revisao-fotos.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasRevisaoFotosService } from '../../../core/services/obras-revisao-fotos.service';
import { paginaPadrao } from '../../../shared/listagem/listagem';
import { ETAPAS, ROTULO_STATUS, TOM_STATUS, opcoesStatus } from './revisao-fotos.logic';

/**
 * Revisão das fotos de campo antes da medição. Aprovar libera a foto para a medição e o book; reprovar (com a
 * inconformidade) tira a foto da medição e devolve a pendência para a equipe, que vê o motivo no app.
 */
@Component({
  selector: 'app-revisao-fotos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, DecimalPipe, GeoButtonComponent, GeoCellDirective, GeoDataTableComponent, GeoFilterPanelComponent, GeoFormDrawerComponent,
    GeoFormSectionComponent, GeoIconButtonComponent, GeoPageHeaderComponent, GeoRowActionsDirective, GeoSelectComponent, GeoStatusComponent,
    GeoTabsComponent, GeoTabPanelDirective, GeoTextInputComponent, GeoTextareaComponent
  ],
  template: `
    <div class="geo-page">
      <geo-page-header title="Revisão de fotos" icon="pi pi-images"
        [breadcrumb]="[{ label: 'Obras' }, { label: 'Revisão de fotos' }]"
        description="Fotos que as equipes tiraram em campo. Só as aprovadas entram no relatório de medição detalhado; a reprovada volta como pendência para a equipe.">
      </geo-page-header>

      <geo-tabs [(value)]="aba" [tabs]="abas">
        <ng-template geoTabPanel="fila">
          <geo-filter-panel #painel storageKey="obras-revisao-fotos" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
            [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
            <div class="geo-filter-grid">
              <geo-select label="Situação" [options]="statusOpcoes" [(value)]="lista.filters.status"></geo-select>
              <geo-text-input label="Obra" placeholder="Número da obra" [(value)]="lista.filters.obra"></geo-text-input>
            </div>
          </geo-filter-panel>

          <geo-data-table title="Fotos" mode="server" storageKey="obras-revisao-fotos" [searchable]="false"
            noResultsTitle="Nenhuma foto com esse recorte."
            [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()" [rowLabel]="rotulo"
            [state]="resultado.state()"
            [stateTitle]="resultado.error() ? 'Não foi possível carregar as fotos' : 'Nenhuma foto para revisar'"
            [stateDescription]="resultado.error() ?? 'As fotos que as equipes mandam pelo app aparecem aqui para revisão.'"
            [filtered]="lista.filtered()"
            [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort"
            (lazyLoad)="lista.load($event)" (adjustFilters)="painel.expandAndFocus()" (clearFilters)="lista.reset()"
            (rowActivate)="abrir($event)">
            <ng-template geoCell="foto" let-row>
              @if (miniaturas()[row.id]; as url) {
                <img class="revisao-foto__mini" [src]="url" [alt]="'Foto do ponto ' + (row.numeroPonto ?? '')" />
              } @else {
                <span class="revisao-foto__mini revisao-foto__mini--vazia" aria-hidden="true"><i class="pi pi-image"></i></span>
              }
            </ng-template>
            <ng-template geoCell="status" let-row>
              <geo-status [tone]="tom(row.status)">{{ rotuloStatus(row.status) }}</geo-status>
              @if (row.rotuloInconformidade) { <span class="revisao-foto__motivo">{{ row.rotuloInconformidade }}{{ row.motivo ? ': ' + row.motivo : '' }}</span> }
            </ng-template>
            <ng-template geoRowActions let-row>
              @if (podeRevisar && row.status !== 'APROVADA') {
                <span class="geo-table-actions">
                  <geo-icon-button icon="pi pi-check" [label]="'Aprovar foto do ponto ' + (row.numeroPonto ?? '')" size="icon-sm" (pressed)="aprovar(row)"></geo-icon-button>
                  <geo-icon-button icon="pi pi-times" [label]="'Reprovar foto do ponto ' + (row.numeroPonto ?? '')" size="icon-sm" (pressed)="abrirReprovacao(row)"></geo-icon-button>
                </span>
              }
            </ng-template>
          </geo-data-table>
        </ng-template>

        <ng-template geoTabPanel="ranking">
          <geo-data-table title="Qualidade das fotos por equipe (últimos 30 dias)" [searchable]="false" [columns]="colunasRanking" [rows]="ranking()"
            [rowLabel]="rotuloRanking" [state]="estadoRanking()" stateTitle="Sem fotos revisadas no período"
            stateDescription="O ranking aparece quando houver fotos das equipes revisadas."></geo-data-table>
        </ng-template>
      </geo-tabs>
    </div>

    <geo-form-drawer [(visible)]="detalheAberto" [title]="'Foto do ponto ' + (foto()?.numeroPonto ?? '')"
      [description]="foto() ? 'Obra ' + (foto()!.numeroObra ?? '') + (foto()!.equipe ? ' · ' + foto()!.equipe : '') : undefined" size="md">
      @if (foto(); as f) {
        <geo-form-section title="Foto" icon="pi pi-image">
          @if (miniaturas()[f.id]; as url) { <img class="revisao-foto__grande" [class.revisao-foto__grande--menor]="reprovando()" [src]="url" [alt]="'Foto do ponto ' + (f.numeroPonto ?? '')" /> }
          <dl class="revisao-foto__dados">
            <div><dt>Item</dt><dd>{{ f.tituloItem ?? 'Foto avulsa' }}</dd></div>
            <div><dt>Etapa</dt><dd>{{ etapa(f.etapa) }}</dd></div>
            <div><dt>Tirada em</dt><dd>{{ f.dataFoto | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
            @if (f.latitude != null) { <div><dt>GPS</dt><dd>{{ f.latitude | number: '1.5-5' }}, {{ f.longitude | number: '1.5-5' }}</dd></div> }
            @if (f.legenda) { <div><dt>Legenda</dt><dd>{{ f.legenda }}</dd></div> }
          </dl>
        </geo-form-section>
        @if (reprovando()) {
          <geo-form-section title="Reprovar" icon="pi pi-times-circle" description="A equipe vê o motivo no app e tira outra foto.">
            <geo-select label="Inconformidade" [required]="true" [options]="opcoesInconformidade()" [(value)]="inconformidade"
              [error]="tentou() && !inconformidade() ? 'Escolha a inconformidade.' : undefined"></geo-select>
            <geo-textarea label="Motivo" [rows]="3" [maxlength]="500" [(value)]="motivo" [showOptional]="inconformidade() !== 'OUTRA'"
              [required]="inconformidade() === 'OUTRA'" [error]="tentou() && inconformidade() === 'OUTRA' && !motivo().trim() ? 'Descreva o motivo.' : undefined"></geo-textarea>
          </geo-form-section>
        }
      }
      <div drawer-footer class="geo-actions-row">
        @if (podeRevisar && foto(); as f) {
          @if (reprovando()) {
            <geo-button variant="ghost" label="Voltar" (pressed)="reprovando.set(false)"></geo-button>
            <geo-button variant="destructive" icon="pi pi-times" label="Reprovar foto" [loading]="salvando()" (pressed)="reprovar(f)"></geo-button>
          } @else {
            <geo-button variant="ghost" icon="pi pi-times" label="Reprovar" (pressed)="reprovando.set(true)"></geo-button>
            <geo-button icon="pi pi-check" label="Aprovar" [loading]="salvando()" (pressed)="aprovar(f)"></geo-button>
          }
        }
      </div>
    </geo-form-drawer>
  `,
  styles: [`
    .revisao-foto__mini { display: inline-grid; place-items: center; width: 3rem; height: 3rem; object-fit: cover; border-radius: var(--geo-radius-sm, 0.375rem);
      background: var(--p-content-hover-background); color: var(--p-text-muted-color); }
    .revisao-foto__grande { width: 100%; max-height: 22rem; object-fit: contain; border-radius: var(--geo-radius-sm, 0.375rem); background: var(--p-content-hover-background); }
    .revisao-foto__grande--menor { max-height: 12rem; }
    .revisao-foto__motivo { display: block; margin-top: 0.25rem; color: var(--p-text-muted-color); font-size: 0.75rem; }
    .revisao-foto__dados { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.5rem 1rem; margin: 0.75rem 0 0; }
    .revisao-foto__dados dt { color: var(--p-text-muted-color); font-size: 0.75rem; }
    .revisao-foto__dados dd { margin: 0; }
  `]
})
export class RevisaoFotosComponent {
  private readonly servico = inject(ObrasRevisaoFotosService);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly podeRevisar = inject(AuthService).currentUser()?.permissoes?.includes('obras:documentacao:write') ?? false;

  protected readonly abas = [{ value: 'fila', label: 'Para revisar', icon: 'pi pi-images' }, { value: 'ranking', label: 'Ranking por equipe', icon: 'pi pi-chart-bar' }];
  protected readonly aba = signal<string | number>('fila');
  protected readonly statusOpcoes = opcoesStatus();
  protected readonly lista = geoListState({
    storageKey: 'obras-revisao-fotos',
    filters: {
      status: geoFilter.value<RevisaoFoto | null>('PENDENTE', { label: 'Situação', param: 'situacao', options: () => opcoesStatus() }),
      obra: geoFilter.value<string>('', { label: 'Obra', param: 'obra' })
    },
    sort: [{ key: 'dataFoto', direction: 'asc' }]
  });
  protected readonly resultado = this.lista.results<FotoParaRevisao>(
    (pedido) => {
      const { filters } = this.lista.request();
      return this.servico.listar({
        status: filters.status ?? undefined,
        numeroObra: filters.obra?.trim() || undefined,
        ...(paginaPadrao(pedido) as { page: number; size: number; sort?: string })
      });
    },
    { errorMessage: getErrorMessage }
  );
  protected readonly colunas: GeoDataTableColumn<FotoParaRevisao>[] = [
    { key: 'foto', header: 'Foto', type: 'custom', width: '4.5rem' },
    { key: 'numeroObra', header: 'Obra', priority: 1 },
    { key: 'numeroPonto', header: 'Ponto', priority: 1, display: (f) => (f.numeroPonto ? `P${f.numeroPonto}` : '—') },
    { key: 'tituloItem', header: 'Item do modelo', priority: 1, display: (f) => f.tituloItem ?? 'Foto avulsa' },
    { key: 'etapa', header: 'Etapa', display: (f) => this.etapa(f.etapa) },
    { key: 'dataFoto', header: 'Tirada em', sortField: 'dataFoto', display: (f) => (f.dataFoto ? new Date(f.dataFoto).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—') },
    { key: 'equipe', header: 'Equipe', display: (f) => f.equipe ?? (f.doApp ? '—' : 'Escritório') },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1 }
  ];
  protected readonly rotulo = (f: FotoParaRevisao) => `Foto do ponto ${f.numeroPonto ?? ''} da obra ${f.numeroObra ?? ''}`;

  protected readonly ranking = signal<LinhaRankingFotos[]>([]);
  protected readonly estadoRanking = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly colunasRanking: GeoDataTableColumn<LinhaRankingFotos>[] = [
    { key: 'equipe', header: 'Equipe', priority: 1 },
    { key: 'total', header: 'Fotos', type: 'integer' },
    { key: 'aprovadas', header: 'Aprovadas', type: 'integer' },
    { key: 'reprovadas', header: 'Reprovadas', type: 'integer' },
    { key: 'pendentes', header: 'Para revisar', type: 'integer' },
    { key: 'percentualAprovacao', header: 'Aprovação', type: 'percent', priority: 1 },
    { key: 'principalInconformidade', header: 'Inconformidade mais comum', display: (l) => l.principalInconformidade ?? '—' }
  ];
  protected readonly rotuloRanking = (l: LinhaRankingFotos) => l.equipe;

  protected readonly miniaturas = signal<Record<string, string>>({});
  protected readonly opcoesInconformidade = signal<{ label: string; value: InconformidadeFoto }[]>([]);
  protected readonly detalheAberto = signal(false);
  protected readonly foto = signal<FotoParaRevisao | null>(null);
  protected readonly reprovando = signal(false);
  protected readonly inconformidade = signal<InconformidadeFoto | null>(null);
  protected readonly motivo = signal('');
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);

  constructor() {
    this.servico.inconformidades().pipe(take(1)).subscribe({
      next: (lista: OpcaoInconformidade[]) => this.opcoesInconformidade.set(lista.map((o) => ({ label: o.rotulo, value: o.valor })))
    });
    this.carregarRanking();
    // Miniaturas das fotos da página (blob: a requisição leva o token).
    effect(() => {
      const linhas = this.resultado.rows();
      untracked(() => this.carregarMiniaturas(linhas));
    });
    this.destroyRef.onDestroy(() => Object.values(this.miniaturas()).forEach((u) => URL.revokeObjectURL(u)));
  }

  protected tom(status: RevisaoFoto) {
    return TOM_STATUS[status];
  }

  protected rotuloStatus(status: RevisaoFoto): string {
    return ROTULO_STATUS[status];
  }

  protected etapa(etapa?: string | null): string {
    return etapa ? ETAPAS[etapa] ?? etapa : '—';
  }

  protected abrir(foto: FotoParaRevisao): void {
    this.foto.set(foto);
    this.reprovando.set(false);
    this.inconformidade.set(null);
    this.motivo.set('');
    this.tentou.set(false);
    this.detalheAberto.set(true);
  }

  protected abrirReprovacao(foto: FotoParaRevisao): void {
    this.abrir(foto);
    this.reprovando.set(true);
  }

  protected aprovar(foto: FotoParaRevisao): void {
    this.decidir(foto, { aprovar: true }, 'Foto aprovada.');
  }

  protected reprovar(foto: FotoParaRevisao): void {
    this.tentou.set(true);
    const inconformidade = this.inconformidade();
    if (!inconformidade || (inconformidade === 'OUTRA' && !this.motivo().trim())) return;
    this.decidir(foto, { aprovar: false, inconformidade, motivo: this.motivo().trim() || null }, 'Foto reprovada: a equipe vê o motivo no app.');
  }

  /** Recarregado a cada decisão: senão a aba de ranking mostra os números de quando a tela abriu. */
  private carregarRanking(): void {
    this.servico.ranking().pipe(take(1)).subscribe({
      next: (linhas) => {
        this.ranking.set(linhas);
        this.estadoRanking.set(linhas.length ? 'ready' : 'empty');
      },
      error: () => this.estadoRanking.set('error')
    });
  }

  private decidir(foto: FotoParaRevisao, decisao: { aprovar: boolean; inconformidade?: InconformidadeFoto | null; motivo?: string | null }, mensagem: string): void {
    this.salvando.set(true);
    this.servico.revisar(foto.id, decisao).pipe(take(1)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.detalheAberto.set(false);
        this.notificacoes.success(mensagem);
        this.lista.reload();
        this.carregarRanking();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private carregarMiniaturas(linhas: readonly FotoParaRevisao[]): void {
    for (const f of linhas.filter((x) => !this.miniaturas()[x.id])) {
      this.servico.miniatura(f.idObra, f.id).pipe(take(1)).subscribe({
        next: (blob) => this.miniaturas.update((m) => ({ ...m, [f.id]: URL.createObjectURL(blob) }))
      });
    }
  }
}
