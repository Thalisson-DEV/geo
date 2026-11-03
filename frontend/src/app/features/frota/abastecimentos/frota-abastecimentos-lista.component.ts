import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesFilterPanelComponent,
  CesIconButtonComponent,
  CesMultiSelectComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesStatusComponent,
  CesTone,
  NotificationService,
  cesListState
} from '@ces/ui';
import {
  AbastecimentoResumo,
  FilaAbastecimento,
  OrigemAbastecimento,
  ROTULO_ALERTA,
  SituacaoAbastecimento,
  TipoAlertaAbastecimento
} from '../../../core/models/frota-abastecimento.models';
import { contar, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { acessoFrota } from '../shared/frota-acesso';
import { LIMITE_EXPORTACAO_FROTA, exportacaoFrota, paginaFrota } from '../shared/frota-lista';
import { FiltrosAbastecimento, OPCOES_ALERTA, OPCOES_ORIGEM, SITUACOES_ABASTECIMENTO } from './frota-abastecimentos-filtros';
import { ICONE_SITUACAO, TOM_SITUACAO, haQuantoTempo, moeda } from './frota-abastecimento.util';

export type ModoLista = 'aprovar' | 'liberar' | 'liberados' | 'todos';

const TEXTOS: Record<ModoLista, { titulo: string; vazio: string; vazioDescricao: string }> = {
  aprovar: {
    titulo: 'Pedidos para aprovar',
    vazio: 'Nenhum pedido esperando você',
    vazioDescricao: 'Os pedidos das placas da sua carteira aparecem aqui assim que a equipe pede pelo app.'
  },
  liberar: {
    titulo: 'Aprovados para liberar',
    vazio: 'Nada para liberar agora',
    vazioDescricao: 'Os pedidos aprovados pelos gestores aparecem aqui. Liberados, vão para a aba Liberados até serem usados.'
  },
  liberados: {
    titulo: 'Liberados para abastecer',
    vazio: 'Nenhum abastecimento liberado',
    vazioDescricao: 'Depois de liberado, o pedido fica aqui até a equipe registrar o abastecimento ou vencer à meia-noite.'
  },
  todos: {
    titulo: 'Abastecimentos',
    vazio: 'Nenhum abastecimento',
    vazioDescricao: 'Os pedidos feitos pelo app e os avulsos lançados na web aparecem aqui, com a situação de cada um.'
  }
};

/**
 * Lista do abastecimento em quatro recortes: a fila de aprovação (placas da carteira), a de
 * liberação, os liberados (com o aviso ao posto) e todos. A linha abre o detalhe.
 */
@Component({
  selector: 'app-frota-abastecimentos-lista',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesCellDirective,
    CesDataTableComponent,
    CesDatepickerComponent,
    CesFilterPanelComponent,
    CesIconButtonComponent,
    CesMultiSelectComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent
  ],
  styles: `
    .alertas { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .posto { display: inline-flex; align-items: center; gap: 0.375rem; }
    .posto .pi { color: var(--ces-brand); font-size: 0.8125rem; }
    .espera { display: block; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
  `,
  template: `
    <div class="ces-form-stack">
      @let f = filtros().estado;
      <ces-filter-panel storageKey="frota-abastecimentos" [activeCount]="ativos()" [summary]="resumo()"
        [loading]="resultado.loading()" (applied)="f.apply()" (cleared)="f.reset()" (chipRemoved)="f.remove($any($event))">
        <div class="ces-filter-grid">
          @if (modo() === 'todos') {
            <ces-multiselect label="Situação" [options]="situacoes" [(value)]="f.filters.situacoes" placeholder="Todas"></ces-multiselect>
          }
          <ces-multiselect label="Base" [options]="filtros().bases.opcoes()" [(value)]="f.filters.idsBase" placeholder="Todas"></ces-multiselect>
          <ces-select label="Posto" [options]="filtros().opcoesPosto()" [(value)]="f.filters.idPosto" placeholder="Todos" [filter]="true" [clearable]="true"></ces-select>
          <ces-datepicker label="De" [value]="dataLocal(f.filters.de())" [clearable]="true" (valueChange)="f.filters.de.set(dataIso($event))"></ces-datepicker>
          <ces-datepicker label="Até" [value]="dataLocal(f.filters.ate())" [clearable]="true" (valueChange)="f.filters.ate.set(dataIso($event))"></ces-datepicker>
          <ces-select label="Alertas" [options]="opcoesAlerta" [(value)]="f.filters.comAlerta"></ces-select>
          @if (modo() !== 'aprovar') {
            <ces-select label="Origem" [options]="opcoesOrigem" [(value)]="f.filters.origem"></ces-select>
          }
        </div>
      </ces-filter-panel>

      <ces-data-table [title]="textos().titulo" mode="server" [description]="descricao()" [searchable]="true" searchPlaceholder="Buscar placa"
        [storageKey]="'frota-abastecimentos-' + modo()" exportFileName="frota-abastecimentos" [columns]="colunas()" [rows]="resultado.rows()"
        [totalRecords]="resultado.total()" [rowKey]="chave" [rowLabel]="rotulo" [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar os abastecimentos' : textos().vazio"
        [stateDescription]="resultado.error() ?? textos().vazioDescricao"
        noResultsTitle="Nenhum abastecimento com esse recorte." [filtered]="ativos() > 0"
        [exportRows]="exportar" [exportLimit]="limiteExportacao"
        [(query)]="lista.query" [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
        (clearFilters)="f.reset()" [rowClickable]="true" (rowActivate)="abrir.emit($event.id)">
        <ng-template cesCell="solicitadoEm" let-row>
          {{ row.solicitadoEm | date: 'dd/MM HH:mm' }}
          @if (modo() === 'aprovar' || modo() === 'liberar') {
            <span class="espera">{{ espera(row.solicitadoEm) }}</span>
          }
        </ng-template>
        <ng-template cesCell="placa" let-row>
          <span class="ces-cell-strong">{{ placa(row.placa) }}</span>
          <span class="ces-cell-muted">{{ row.baseNome ?? 'Sem base' }}</span>
        </ng-template>
        <ng-template cesCell="posto" let-row>
          <span class="posto"><i class="pi pi-map-marker" aria-hidden="true"></i><span class="ces-cell-strong">{{ row.posto }}</span></span>
        </ng-template>
        <ng-template cesCell="itens" let-row>
          {{ row.itens }}
          @if (row.destino) { <span class="ces-cell-muted">Destino: {{ row.destino }}</span> }
          @if (row.origem === 'AVULSA') { <ces-status tone="neutral" icon="pi-bolt">Avulso</ces-status> }
        </ng-template>
        <ng-template cesCell="pessoas" let-row>
          {{ row.condutor ?? '—' }}
          @if (row.solicitante && row.solicitante !== row.condutor) {
            <span class="ces-cell-muted">Pedido por {{ row.solicitante }}</span>
          }
        </ng-template>
        <ng-template cesCell="alertas" let-row>
          @if (row.alertas.length) {
            <span class="alertas">
              @for (a of row.alertas; track a) {
                <ces-status tone="warning" icon="pi-exclamation-triangle">{{ rotuloAlerta(a) }}</ces-status>
              }
            </span>
          } @else {
            <span class="ces-cell-muted">Sem alerta</span>
          }
        </ng-template>
        <ng-template cesCell="situacao" let-row>
          <ces-status [tone]="tom(row.situacao)" [icon]="icone(row.situacao)">{{ row.situacaoRotulo }}</ces-status>
          @if (row.valorTotal != null) {
            <span class="ces-cell-muted">{{ dinheiro(row.valorTotal) }}</span>
          }
        </ng-template>
        <ng-template cesCell="avisoPosto" let-row>
          @if (row.avisoPosto === 'ENVIADO') {
            <ces-status tone="success" icon="pi-check">Posto avisado</ces-status>
          } @else {
            <ces-status tone="warning" icon="pi-whatsapp">Falta avisar</ces-status>
          }
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            @if (modo() === 'aprovar') {
              <ces-icon-button icon="pi pi-check" [label]="'Definir as quantidades e aprovar o pedido de ' + placa(row.placa)"
                tooltip="Definir as quantidades e aprovar" size="icon-sm" (pressed)="abrir.emit(row.id)"></ces-icon-button>
            }
            <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir o pedido de ' + placa(row.placa)" tooltip="Abrir" size="icon-sm" (pressed)="abrir.emit(row.id)"></ces-icon-button>
          </span>
        </ng-template>
      </ces-data-table>
    </div>
  `
})
export class FrotaAbastecimentosListaComponent {
  private readonly servico = inject(FrotaAbastecimentoService);
  private readonly notificacoes = inject(NotificationService);
  protected readonly acesso = acessoFrota();

  readonly modo = input<ModoLista>('todos');
  /** Recorte da página, o mesmo nas quatro abas. */
  readonly filtros = input.required<FiltrosAbastecimento>();
  readonly abrir = output<string>();
  readonly alterou = output<void>();

  protected readonly situacoes = SITUACOES_ABASTECIMENTO;
  protected readonly opcoesAlerta = OPCOES_ALERTA;
  protected readonly opcoesOrigem = OPCOES_ORIGEM;
  protected rotuloAlerta(tipo: TipoAlertaAbastecimento): string {
    return ROTULO_ALERTA[tipo];
  }

  protected tom(situacao: SituacaoAbastecimento): CesTone {
    return TOM_SITUACAO[situacao];
  }

  protected icone(situacao: SituacaoAbastecimento): string {
    return ICONE_SITUACAO[situacao];
  }
  protected readonly placa = formatarPlaca;
  protected readonly dinheiro = moeda;
  protected readonly espera = haQuantoTempo;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly limiteExportacao = LIMITE_EXPORTACAO_FROTA;
  protected readonly aprovando = signal<string | null>(null);
  protected readonly textos = computed(() => TEXTOS[this.modo()]);

  /** Nesta aba só a página, o tamanho, a ordenação e a busca; o recorte vem da página. */
  protected readonly lista = cesListState({ storageKey: 'frota-abastecimentos', url: false, filters: {}, sort: [{ key: 'solicitadoEm', direction: 'desc' }] });
  /** A situação só recorta a aba Todos; nas filas ela já é a da etapa. */
  protected readonly resumo = computed(() => this.filtros().estado.summary().filter((c) => this.modo() === 'todos' || c.key !== 'situacoes'));
  protected readonly ativos = computed(() => this.resumo().filter((c) => c.removable).length);
  protected readonly resultado = this.lista.results<AbastecimentoResumo>(
    (pedido) => this.servico.listar(this.filtro(this.filtros().estado.applied(), pedido.query), paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly exportar = exportacaoFrota(
    (pagina) => this.servico.listar(this.filtro(this.filtros().estado.applied(), this.lista.request().query), pagina),
    () => this.lista.request()
  );
  protected readonly descricao = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'pedido', 'pedidos', 'Nenhum pedido')
  );

  protected readonly colunas = computed<CesDataTableColumn<AbastecimentoResumo>[]>(() => {
    const modo = this.modo();
    const colunas: CesDataTableColumn<AbastecimentoResumo>[] = [
      { key: 'solicitadoEm', header: 'Pedido', type: 'custom', priority: 1, sortField: 'solicitadoEm', value: (a) => a.solicitadoEm, display: (a) => a.solicitadoEm },
      { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, value: (a) => a.placa, display: (a) => formatarPlaca(a.placa) },
      { key: 'posto', header: 'Posto', type: 'custom', priority: 1, value: (a) => a.posto, display: (a) => a.posto },
      { key: 'itens', header: 'Itens', type: 'custom', priority: 2, value: (a) => a.itens, display: (a) => a.itens },
      { key: 'pessoas', header: 'Condutor', type: 'custom', value: (a) => a.condutor, display: (a) => a.condutor ?? '' },
      { key: 'alertas', header: 'Alertas', type: 'custom', priority: modo === 'aprovar' ? 1 : 2, value: (a) => a.alertas.length,
        display: (a) => a.alertas.map((t) => ROTULO_ALERTA[t]).join(', ') }
    ];
    if (modo === 'liberados') {
      colunas.push({ key: 'avisoPosto', header: 'Aviso ao posto', type: 'custom', priority: 1, value: (a) => a.avisoPosto,
        display: (a) => (a.avisoPosto === 'ENVIADO' ? 'Posto avisado' : 'Falta avisar') });
    }
    if (modo === 'todos') {
      colunas.push({ key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (a) => a.situacao, display: (a) => a.situacaoRotulo });
    }
    return colunas;
  });
  constructor() {
    // Aberta com ?busca= (o atalho do mapa da frota leva a placa): a lista já vem buscando por ela.
    const busca = inject(ActivatedRoute).snapshot.queryParamMap.get('busca');
    if (busca) this.lista.query.set(busca);
    // Recorte aplicado em qualquer aba: esta volta à primeira página com ele.
    let primeira = true;
    effect(() => {
      this.filtros().estado.applied();
      if (primeira) {
        primeira = false;
        return;
      }
      untracked(() => {
        this.lista.page.set(0);
        this.lista.reload();
      });
    });
  }

  protected readonly chave = (a: AbastecimentoResumo) => a.id;
  protected readonly rotulo = (a: AbastecimentoResumo) => `pedido de ${formatarPlaca(a.placa)}`;

  recarregar(): void {
    this.lista.reload();
  }


  private filtro(f: Record<string, unknown>, busca: string | null | undefined) {
    const modo = this.modo();
    return {
      fila: modo === 'aprovar' ? ('APROVAR' as FilaAbastecimento) : modo === 'liberar' ? ('LIBERAR' as FilaAbastecimento) : null,
      busca: busca || null,
      situacoes: modo === 'liberados' ? (['LIBERADA'] as SituacaoAbastecimento[]) : modo === 'todos' ? (f['situacoes'] as SituacaoAbastecimento[]) : [],
      idsBase: f['idsBase'] as string[],
      idPosto: f['idPosto'] as string | null,
      de: f['de'] as string | null,
      ate: f['ate'] as string | null,
      comAlerta: f['comAlerta'] as boolean | null,
      origem: modo === 'aprovar' ? null : (f['origem'] as OrigemAbastecimento | null)
    };
  }
}
