import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesDatepickerComponent,
  CesFilterPanelComponent,
  CesFormDrawerComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  CesTone,
  NotificationService,
  cesFilter,
  cesListState
} from '@ces/ui';
import { FaturaPosto, SituacaoFaturaPosto } from '../../../core/models/frota-abastecimento.models';
import { contar } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { paginaFrota } from '../shared/frota-lista';
import { FrotaFaturaPostoDrawerComponent } from './frota-fatura-posto-drawer.component';
import { FiltrosAbastecimento } from './frota-abastecimentos-filtros';
import { ICONE_FATURA, TOM_FATURA, moeda, rotuloFatura, textoDiferenca } from './frota-abastecimento.util';

const SITUACOES: CesSelectOption<SituacaoFaturaPosto | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Falta conferir', value: 'RASCUNHO' },
  { label: 'Conferida', value: 'CONFERIDA' },
  { label: 'Enviada ao financeiro', value: 'ENVIADA_AO_FINANCEIRO' }
];

/**
 * Faturas do posto: o administrativo lança a fatura que o posto mandou, confere contra os
 * abastecimentos realizados no período e envia ao financeiro como pagamento.
 */
@Component({
  selector: 'app-frota-faturas-posto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesDatepickerComponent,
    CesFilterPanelComponent,
    CesFormDrawerComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent,
    FrotaFaturaPostoDrawerComponent
  ],
  styles: `
    .diferenca--ok { color: var(--ces-success-text, var(--ces-success)); }
    .diferenca--aviso { color: var(--ces-warning-text); font-weight: 600; }
    .periodo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
    @media (max-width: 40rem) { .periodo { grid-template-columns: minmax(0, 1fr); } }
  `,
  template: `
    <div class="ces-form-stack">
      <ces-filter-panel storageKey="frota-faturas-posto" [activeCount]="lista.activeCount()" [summary]="lista.summary()"
        [loading]="resultado.loading()" (applied)="lista.apply()" (cleared)="lista.reset()" (chipRemoved)="lista.remove($any($event))">
        <div class="ces-filter-grid">
          <ces-select label="Posto" [options]="filtros().opcoesPosto()" [(value)]="lista.filters.idPosto" placeholder="Todos" [filter]="true" [clearable]="true"></ces-select>
          <ces-select label="Situação" [options]="situacoes" [(value)]="lista.filters.situacao"></ces-select>
        </div>
      </ces-filter-panel>

      <ces-data-table title="Faturas do posto" mode="server" [description]="descricao()" [searchable]="false"
        storageKey="frota-faturas-posto" exportFileName="frota-faturas-posto" [columns]="colunas" [rows]="resultado.rows()" [totalRecords]="resultado.total()"
        [rowKey]="chave" [rowLabel]="rotulo" [state]="resultado.state()"
        [stateTitle]="resultado.error() ? 'Não foi possível carregar as faturas' : 'Nenhuma fatura lançada'"
        [stateDescription]="resultado.error() ?? 'Lance a fatura que o posto mandou e confira contra os abastecimentos realizados no período.'"
        emptyActionLabel="Lançar fatura" (emptyAction)="novo()"
        noResultsTitle="Nenhuma fatura com esse recorte." [filtered]="lista.filtered()" (clearFilters)="lista.reset()"
        [(page)]="lista.page" [(pageSize)]="lista.pageSize" [(sort)]="lista.sort" (lazyLoad)="lista.load($event)"
        [rowClickable]="true" (rowActivate)="abrir($event.id)">
        <ng-container table-actions>
          <ces-button size="sm" icon="pi pi-plus" label="Lançar fatura" (pressed)="novo()"></ces-button>
        </ng-container>
        <ng-template cesCell="numero" let-row>
          <span class="ces-cell-strong">Nº {{ row.numero }}</span>
          <span class="ces-cell-muted">{{ row.periodoInicio | date: 'dd/MM' }} a {{ row.periodoFim | date: 'dd/MM/yyyy' }}</span>
        </ng-template>
        <ng-template cesCell="posto" let-row>
          <span class="ces-cell-strong">{{ row.posto }}</span>
        </ng-template>
        <ng-template cesCell="valor" let-row>
          <span class="ces-cell-strong">{{ dinheiro(row.valor) }}</span>
        </ng-template>
        <ng-template cesCell="conferido" let-row>
          @if (row.situacao === 'RASCUNHO') {
            <span class="ces-cell-muted">—</span>
          } @else {
            {{ dinheiro(row.valorAbastecimentos) }}
            <span class="ces-cell-muted">{{ row.quantidadeAbastecimentos }} {{ row.quantidadeAbastecimentos === 1 ? 'abastecimento' : 'abastecimentos' }}</span>
            <span [class.diferenca--ok]="bate(row)" [class.diferenca--aviso]="!bate(row)" class="ces-cell-muted">{{ diferenca(row.diferenca) }}</span>
          }
        </ng-template>
        <ng-template cesCell="situacao" let-row>
          <ces-status [tone]="tom(row.situacao)" [icon]="icone(row.situacao)">{{ situacao(row) }}</ces-status>
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir a fatura ' + row.numero" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row.id)"></ces-icon-button>
          </span>
        </ng-template>
      </ces-data-table>
    </div>

    <app-frota-fatura-posto-drawer [(visible)]="detalheAberto" [idFatura]="selecionada()" [assistente]="assistente()"
      (alterada)="lista.reload()" (editar)="editar($event)" (analisar)="detalheAberto.set(false); analisar.emit($event)"></app-frota-fatura-posto-drawer>

    <ces-form-drawer [(visible)]="formAberto" [title]="emEdicao() ? 'Editar fatura' : 'Lançar fatura'"
      description="Como veio do posto. Depois de salvar, confira contra os abastecimentos do período." [dirty]="sujo()" [loading]="salvando()" size="sm">
      <div class="ces-form-stack">
        <ces-select label="Posto" [required]="true" [options]="filtros().opcoesPosto()" [(value)]="posto" [filter]="true" [disabled]="!!emEdicao()"
          [error]="tentou() && !posto() ? 'Escolha o posto.' : undefined"></ces-select>
        <ces-text-input label="Número" [required]="true" [(value)]="numero" [maxlength]="40" placeholder="Ex.: 2026-0915"
          [error]="tentou() && !numero().trim() ? 'Informe o número da fatura.' : undefined"></ces-text-input>
        <div class="periodo">
          <ces-datepicker label="Início" [required]="true" [value]="dataLocal(inicio())" (valueChange)="inicio.set(dataIso($event))"
            [error]="tentou() && !inicio() ? 'Informe o início.' : undefined"></ces-datepicker>
          <ces-datepicker label="Fim" [required]="true" [value]="dataLocal(fim())" (valueChange)="fim.set(dataIso($event))"
            [error]="tentou() ? (erroFim() ?? undefined) : undefined"></ces-datepicker>
        </div>
        <ces-number-input label="Valor" [required]="true" mode="currency" [(value)]="valor" [min]="0.01"
          description="O total cobrado pelo posto no período."
          [error]="tentou() && !(valor() && valor()! > 0) ? 'Informe o valor da fatura.' : undefined"></ces-number-input>
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="formAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="emEdicao() ? 'Salvar' : 'Lançar e conferir'" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaFaturasPostoComponent {
  private readonly servico = inject(FrotaAbastecimentoService);
  private readonly notificacoes = inject(NotificationService);

  readonly filtros = input.required<FiltrosAbastecimento>();
  readonly assistente = input(false);
  readonly analisar = output<{ id: string; rotulo: string; pergunta: string }>();

  protected readonly situacoes = SITUACOES;
  protected readonly dinheiro = moeda;
  protected readonly diferenca = textoDiferenca;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;

  /** Recorte próprio, fora da URL: o posto da fatura não se mistura com o filtro dos pedidos. */
  protected readonly lista = cesListState({
    storageKey: 'frota-faturas-posto',
    rememberFilters: 'frota-faturas-posto',
    url: false,
    filters: {
      idPosto: cesFilter.value<string | null>(null, { label: 'Posto', options: () => this.filtros().opcoesPosto() }),
      situacao: cesFilter.value<SituacaoFaturaPosto | null>(null, { label: 'Situação', options: () => SITUACOES })
    }
  });
  protected readonly resultado = this.lista.results<FaturaPosto>(
    (pedido) => this.servico.faturas(pedido.filters.idPosto, pedido.filters.situacao, paginaFrota(pedido)),
    { errorMessage: getErrorMessage }
  );
  protected readonly descricao = computed(() =>
    this.resultado.loading() && !this.resultado.total() ? undefined : contar(this.resultado.total(), 'fatura', 'faturas', 'Nenhuma fatura')
  );
  protected readonly colunas: CesDataTableColumn<FaturaPosto>[] = [
    { key: 'numero', header: 'Fatura', type: 'custom', priority: 1, value: (f) => f.numero, display: (f) => `Nº ${f.numero}` },
    { key: 'posto', header: 'Posto', type: 'custom', priority: 1, value: (f) => f.posto, display: (f) => f.posto },
    { key: 'valor', header: 'Valor', type: 'custom', priority: 1, value: (f) => f.valor, display: (f) => moeda(f.valor) },
    { key: 'conferido', header: 'Conferido', type: 'custom', priority: 2, value: (f) => f.valorAbastecimentos, display: (f) => moeda(f.valorAbastecimentos) },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (f) => f.situacao, display: (f) => rotuloFatura(f) }
  ];
  protected readonly chave = (f: FaturaPosto) => f.id;
  protected readonly rotulo = (f: FaturaPosto) => `fatura ${f.numero}`;

  protected readonly detalheAberto = signal(false);
  protected readonly selecionada = signal<string | null>(null);

  protected readonly formAberto = signal(false);
  protected readonly emEdicao = signal<FaturaPosto | null>(null);
  protected readonly posto = signal<string | null>(null);
  protected readonly numero = signal('');
  protected readonly inicio = signal<string | null>(null);
  protected readonly fim = signal<string | null>(null);
  protected readonly valor = signal<number | null>(null);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly sujo = computed(() => {
    const f = this.emEdicao();
    if (!f) return !!(this.posto() || this.numero().trim() || this.inicio() || this.fim() || this.valor());
    return this.numero() !== f.numero || this.inicio() !== f.periodoInicio || this.fim() !== f.periodoFim || this.valor() !== f.valor;
  });
  protected readonly erroFim = computed(() => {
    if (!this.fim()) return 'Informe o fim.';
    return this.inicio() && this.fim()! < this.inicio()! ? 'O fim não pode ser antes do início.' : null;
  });

  constructor() {
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('fatura');
    if (id) this.abrir(id);
  }

  protected tom(s: SituacaoFaturaPosto): CesTone {
    return TOM_FATURA[s];
  }

  protected icone(s: SituacaoFaturaPosto): string {
    return ICONE_FATURA[s];
  }

  protected situacao(f: FaturaPosto): string {
    return rotuloFatura(f);
  }

  protected bate(f: FaturaPosto): boolean {
    return Math.abs(f.diferenca) < 0.005;
  }

  protected abrir(id: string): void {
    this.selecionada.set(id);
    this.detalheAberto.set(true);
  }

  protected novo(): void {
    this.preencher(null);
  }

  protected editar(fatura: FaturaPosto): void {
    this.detalheAberto.set(false);
    this.preencher(fatura);
  }

  protected salvar(): void {
    this.tentou.set(true);
    const posto = this.posto();
    const valor = this.valor();
    if (!posto || !this.numero().trim() || !this.inicio() || this.erroFim() || !valor || valor <= 0) return;
    const edicao = this.emEdicao();
    this.salvando.set(true);
    this.servico
      .salvarFatura({ idPosto: posto, numero: this.numero().trim(), periodoInicio: this.inicio()!, periodoFim: this.fim()!, valor }, edicao?.id)
      .subscribe({
        next: (f) => {
          this.salvando.set(false);
          this.formAberto.set(false);
          this.notificacoes.success(edicao ? `Fatura ${f.numero} atualizada. Confira de novo.` : `Fatura ${f.numero} lançada. Agora marque os abastecimentos dela.`);
          this.lista.reload();
          this.abrir(f.id);
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
  }

  private preencher(f: FaturaPosto | null): void {
    this.emEdicao.set(f);
    this.posto.set(f?.idPosto ?? this.lista.applied().idPosto ?? null);
    this.numero.set(f?.numero ?? '');
    this.inicio.set(f?.periodoInicio ?? null);
    this.fim.set(f?.periodoFim ?? null);
    this.valor.set(f?.valor ?? null);
    this.tentou.set(false);
    this.formAberto.set(true);
  }
}
