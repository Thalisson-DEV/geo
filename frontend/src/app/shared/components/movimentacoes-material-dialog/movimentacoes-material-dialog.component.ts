import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, catchError, debounceTime, map, merge, of, skip, switchMap } from 'rxjs';
import {
  GeoButtonComponent,
  GeoContentState,
  GeoDatepickerComponent,
  GeoIconButtonComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTone
} from '@geo/ui';
import {
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoCellDirective,
  GeoLazyLoadEvent,
  GeoRowActionsDirective,
  GeoRowDetailDirective,
  GeoSortRule
} from '@geo/ui/data';
import { GeoDrawerComponent } from '@geo/ui/overlays';

import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import {
  MovimentacaoEstoqueFilter,
  MovimentacaoOperacaoSummaryResponse,
  PageResponseMovimentacaoOperacaoSummaryResponse,
  TipoMovimentacao
} from '../../../core/models/almoxarifado.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { TIPOS_MOVIMENTACAO, iconeTipoMovimentacao, rotuloTipoMovimentacao, tomTipoMovimentacao } from '../../utils/movimentacao.utils';
import { MovimentacaoMaterialItensComponent } from './movimentacao-material-itens.component';

/** Sentido da operação para o estoque consultado. */
interface Sentido {
  rotulo: string;
  tom: GeoTone;
  icone: string;
  contraparte: string;
}

const TAMANHO_PADRAO = 25;

/**
 * Histórico de movimentações de um material num estoque ("Ver movimentações"). Painel lateral
 * com filtros, a tabela padrão e, em cada operação, a quantidade e os números de série que ela
 * moveu do material, na própria linha.
 */
@Component({
  selector: 'app-movimentacoes-material-dialog',
  standalone: true,
  imports: [
    CommonModule,
    GeoDrawerComponent,
    GeoDataTableComponent,
    GeoCellDirective,
    GeoRowDetailDirective,
    GeoRowActionsDirective,
    GeoStatusComponent,
    GeoButtonComponent,
    GeoIconButtonComponent,
    GeoSelectComponent,
    GeoDatepickerComponent,
    GeoTextInputComponent,
    MovimentacaoMaterialItensComponent
  ],
  styles: [
    `
      .filtros {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        padding: 0.75rem;
        border: 1px solid var(--geo-border);
        border-radius: 0.75rem;
        background: var(--geo-surface-subtle);
      }

      @media (min-width: 40rem) {
        .filtros {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      .resumo {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: var(--geo-foreground-muted);
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <geo-drawer
      [(visible)]="visible"
      eyebrow="Histórico do material"
      [title]="materialNome() || 'Material'"
      description="Entradas e saídas deste material no estoque, da mais recente para a mais antiga."
      size="lg"
      (closed)="aoFechar()"
    >
      @if (visible()) {
        <div class="flex flex-col gap-4">
          <div class="filtros" role="group" aria-label="Filtros do histórico">
            <geo-select label="Tipo" [options]="tipos" [(value)]="tipo" placeholder="Todos os tipos" [clearable]="true" />
            <geo-text-input label="Nº de série" placeholder="Buscar série..." [(value)]="numSerie" />
            <geo-datepicker label="De" [(value)]="dataInicio" [maxDate]="dataFim()" [clearable]="true" />
            <geo-datepicker label="Até" [(value)]="dataFim" [minDate]="dataInicio()" [clearable]="true" />
          </div>

          <div class="resumo" aria-live="polite">
            <span>
              @if (estado() === 'ready') {
                <strong class="text-[var(--geo-foreground)]">{{ total() }}</strong> {{ total() === 1 ? 'operação' : 'operações' }}
                {{ filtrado() ? 'no recorte' : 'no histórico' }}
              } @else {
                Consultando o histórico...
              }
            </span>
            @if (filtrado()) {
              <geo-button label="Limpar filtros" icon="pi pi-filter-slash" size="sm" variant="ghost" (pressed)="limparFiltros()" />
            }
          </div>

          <geo-data-table
            mode="server"
            caption="Movimentações do material"
            [searchable]="false"
            noResultsTitle="Nenhuma movimentação com esse recorte."
            [stateTitle]="erro() ? 'Não foi possível carregar o histórico' : 'Sem movimentações'"
            [stateDescription]="erro() ?? 'Este material ainda não foi movimentado neste estoque.'"
            [columns]="colunas"
            [rows]="operacoes()"
            [totalRecords]="total()"
            [state]="estado()"
            [filtered]="filtrado()"
            [rowKey]="chave"
            [rowLabel]="rotuloLinha"
            [pageSizeOptions]="[10, 25, 50]"
            [(page)]="pagina"
            [(pageSize)]="tamanho"
            [(sort)]="ordenacao"
            (lazyLoad)="carregar($event)"
            (clearFilters)="limparFiltros()"
          >
            <ng-template geoCell="dataHora" let-op>
              <span class="flex flex-col leading-tight">
                <span class="font-semibold tabular-nums">{{ op.dataHora | date: 'dd/MM/yyyy' }}</span>
                <span class="text-[11px] text-[var(--geo-foreground-muted)] tabular-nums">{{ op.dataHora | date: 'HH:mm' }}</span>
              </span>
            </ng-template>
            <ng-template geoCell="tipo" let-op>
              <geo-status [tone]="tomTipo(op.tipo)" [icon]="iconeTipo(op.tipo)">{{ rotuloTipo(op.tipo) }}</geo-status>
            </ng-template>
            <ng-template geoCell="sentido" let-op>
              @let s = sentido(op);
              <span class="flex flex-col gap-0.5 min-w-0">
                <geo-status [tone]="s.tom" [icon]="s.icone">{{ s.rotulo }}</geo-status>
                <span class="text-[11px] text-[var(--geo-foreground-muted)] truncate" [title]="s.contraparte">{{ s.contraparte }}</span>
              </span>
            </ng-template>
            <ng-template geoRowActions let-op>
              <geo-icon-button
                icon="pi pi-external-link"
                [label]="'Abrir comprovante da operação #' + op.idReferenciaOperacao.slice(0, 8)"
                size="icon-sm"
                (pressed)="abrirComprovante(op)"
              ></geo-icon-button>
            </ng-template>
            <ng-template geoRowDetail let-op>
              <app-movimentacao-material-itens [idReferenciaOperacao]="op.idReferenciaOperacao" [idMaterial]="materialId()!" />
            </ng-template>
          </geo-data-table>
        </div>
      }
      <geo-button drawer-footer label="Fechar" variant="secondary" (pressed)="visible.set(false)" />
    </geo-drawer>
  `
})
export class MovimentacoesMaterialDialogComponent {
  private readonly service = inject(AlmoxarifadoService);
  private readonly router = inject(Router);

  protected readonly visible = signal(false);
  protected readonly estoqueId = signal<string | null>(null);
  protected readonly materialId = signal<string | null>(null);
  protected readonly materialNome = signal('');

  protected readonly tipo = signal<TipoMovimentacao | null>(null);
  protected readonly numSerie = signal('');
  protected readonly dataInicio = signal<Date | null>(null);
  protected readonly dataFim = signal<Date | null>(null);

  protected readonly operacoes = signal<MovimentacaoOperacaoSummaryResponse[]>([]);
  protected readonly total = signal(0);
  protected readonly estado = signal<GeoContentState>('loading');
  protected readonly erro = signal<string | null>(null);
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(TAMANHO_PADRAO);
  protected readonly ordenacao = signal<GeoSortRule[]>([]);

  protected readonly tipos: GeoSelectOption<TipoMovimentacao | null>[] = (Object.keys(TIPOS_MOVIMENTACAO) as TipoMovimentacao[]).map(
    (valor) => ({ label: TIPOS_MOVIMENTACAO[valor].rotulo, value: valor })
  );

  protected readonly rotuloTipo = rotuloTipoMovimentacao;
  protected readonly tomTipo = tomTipoMovimentacao;
  protected readonly iconeTipo = iconeTipoMovimentacao;
  protected readonly chave = (op: MovimentacaoOperacaoSummaryResponse) => op.idReferenciaOperacao;
  protected readonly rotuloLinha = (op: MovimentacaoOperacaoSummaryResponse) =>
    `${rotuloTipoMovimentacao(op.tipo)} de ${new Date(op.dataHora).toLocaleDateString('pt-BR')}`;

  protected readonly colunas: GeoDataTableColumn<MovimentacaoOperacaoSummaryResponse>[] = [
    { key: 'dataHora', header: 'Data', type: 'custom', priority: 1, width: '7rem', value: (op) => op.dataHora, sortField: 'dataHora' },
    { key: 'tipo', header: 'Tipo', type: 'custom', priority: 1, value: (op) => rotuloTipoMovimentacao(op.tipo), sortField: 'tipo' },
    { key: 'sentido', header: 'Sentido', type: 'custom', priority: 1, value: (op) => this.sentido(op).rotulo, sortable: false },
    { key: 'operador', header: 'Operador', priority: 2, value: (op) => op.operadorNome || 'Não identificado', sortable: false }
  ];

  protected readonly filtrado = computed(
    () => !!this.tipo() || !!this.numSerie().trim() || !!this.dataInicio() || !!this.dataFim()
  );

  private readonly cargas = new Subject<GeoLazyLoadEvent>();
  private ultimaCarga: GeoLazyLoadEvent | null = null;

  constructor() {
    this.cargas
      .pipe(
        switchMap((evento) =>
          this.service.listarMovimentacoes(this.parametros(evento)).pipe(
            map((res): PageResponseMovimentacaoOperacaoSummaryResponse | { erro: string } => res),
            catchError((err) => of({ erro: getErrorMessage(err) || 'Não foi possível carregar o histórico.' }))
          )
        ),
        takeUntilDestroyed()
      )
      .subscribe((res) => {
        if ('erro' in res) {
          this.erro.set(res.erro);
          this.estado.set('error');
          return;
        }
        this.operacoes.set(res.content);
        this.total.set(res.page.totalElements);
        this.erro.set(null);
        this.estado.set('ready');
      });

    // Mudou um filtro: volta para a primeira página (a série espera a digitação parar).
    merge(
      toObservable(this.tipo).pipe(skip(1)),
      toObservable(this.dataInicio).pipe(skip(1)),
      toObservable(this.dataFim).pipe(skip(1)),
      toObservable(this.numSerie).pipe(skip(1), debounceTime(400))
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.recarregarDoInicio());
  }

  show(estoqueId: string, materialId: string, materialNome: string): void {
    this.estoqueId.set(estoqueId);
    this.materialId.set(materialId);
    this.materialNome.set(materialNome);
    this.tipo.set(null);
    this.numSerie.set('');
    this.dataInicio.set(null);
    this.dataFim.set(null);
    this.operacoes.set([]);
    this.total.set(0);
    this.pagina.set(0);
    this.ordenacao.set([]);
    this.estado.set('loading');
    this.ultimaCarga = null;
    this.visible.set(true);
  }

  hide(): void {
    this.visible.set(false);
  }

  protected aoFechar(): void {
    this.operacoes.set([]);
  }

  protected carregar(evento: GeoLazyLoadEvent): void {
    if (!this.estoqueId() || !this.materialId()) return;
    this.ultimaCarga = evento;
    if (!this.operacoes().length) this.estado.set('loading');
    this.cargas.next(evento);
  }

  protected limparFiltros(): void {
    this.tipo.set(null);
    this.numSerie.set('');
    this.dataInicio.set(null);
    this.dataFim.set(null);
  }

  private recarregarDoInicio(): void {
    if (!this.visible()) return;
    this.pagina.set(0);
    const base = this.ultimaCarga ?? { page: 0, size: this.tamanho(), sort: [], query: '', filters: [] };
    this.carregar({ ...base, page: 0 });
  }

  private parametros(evento: GeoLazyLoadEvent): MovimentacaoEstoqueFilter & Record<string, unknown> {
    const regra = evento.sort[0];
    const inicio = this.dataInicio();
    const fim = this.dataFim();
    return {
      idEstoque: this.estoqueId(),
      idMaterial: this.materialId(),
      tipo: this.tipo() ?? undefined,
      numSerie: this.numSerie().trim() || undefined,
      dataInicio: inicio ? new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).toISOString() : undefined,
      dataFim: fim ? new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999).toISOString() : undefined,
      page: evento.page,
      size: evento.size,
      sort: regra ? `${regra.key},${regra.direction}` : 'dataHora,desc'
    };
  }

  /** Para o estoque consultado: entrou (destino), saiu (origem) ou ficou nele (ex.: aplicação). */
  protected sentido(op: MovimentacaoOperacaoSummaryResponse): Sentido {
    const id = this.estoqueId();
    if (op.estoqueDestino?.id === id && op.estoqueOrigem?.id !== id) {
      return {
        rotulo: 'Entrada',
        tom: 'success',
        icone: 'pi pi-arrow-down-left',
        contraparte: op.estoqueOrigem ? `de ${op.estoqueOrigem.nomeIdentificador}` : 'sem estoque de origem'
      };
    }
    if (op.estoqueOrigem?.id === id) {
      return {
        rotulo: 'Saída',
        tom: 'danger',
        icone: 'pi pi-arrow-up-right',
        contraparte: op.estoqueDestino ? `para ${op.estoqueDestino.nomeIdentificador}` : 'sem estoque de destino'
      };
    }
    return { rotulo: 'Neste estoque', tom: 'neutral', icone: 'pi pi-circle', contraparte: '—' };
  }

  protected abrirComprovante(op: MovimentacaoOperacaoSummaryResponse): void {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/almoxarifado/movimentacoes', op.idReferenciaOperacao]));
    window.open(url, '_blank');
  }
}
