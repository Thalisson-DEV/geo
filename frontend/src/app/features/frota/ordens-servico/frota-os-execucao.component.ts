import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CesAutocompleteComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesCellDirective,
  CesConfirmationService,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFormDrawerComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesRowActionsDirective,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import { LookupStore } from '../../../core/lookup';
import {
  OpcoesFrota,
  OrdemServicoDetalhe,
  PecaOrdemServico,
  ServicoOrdemServico,
  osAberta
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { FrotaOsLancamentoComponent, TipoLancamento } from './frota-os-lancamento.component';

const moeda = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/**
 * Execução da OS: mão de obra com mecânico, peças com origem e os totais. Enquanto a OS
 * está aberta ou concluída com valores pendentes, quem executa ou opera inclui, edita e exclui;
 * com o último valor lançado ela fica finalizada e a aba só mostra.
 */
@Component({
  selector: 'app-frota-os-execucao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    CesAutocompleteComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFormDrawerComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesRowActionsDirective,
    CesStatusComponent,
    CesTextInputComponent,
    FrotaOsLancamentoComponent
  ],
  template: `
    @let d = detalhe();
    <div class="ces-form-stack">
      <!-- != null: o backend omite o total nulo (non_null), então ele chega como undefined. -->
      @if (valoresPendentes().length) {
        <ces-callout tone="warning" icon="pi pi-hourglass" title="Valores pendentes">
          Falta o valor de: {{ valoresPendentes().join('; ') }}. Edite a linha e informe o valor (ou marque como sem
          custo). Com o último valor, a OS fica finalizada sozinha.
        </ces-callout>
      }
      @if (!d.totais.calculado && d.totais.total != null) {
        <ces-callout tone="info" [dense]="true">
          Esta OS foi encerrada com o valor digitado ({{ d.totais.total | currency: 'BRL' }}), sem serviços nem peças lançados.
        </ces-callout>
      }

      <!-- Totais no topo: o valor da OS é o que mais se consulta na execução. -->
      <div class="ces-kpis" role="group" aria-label="Totais da execução">
        <div class="ces-kpi" data-tone="info">
          <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-wrench"></i></span>
          <span class="ces-kpi__body">
            <span class="ces-kpi__label">Mão de obra</span>
            <span class="ces-kpi__value">{{ d.totais.servicos | currency: 'BRL' }}</span>
            <span class="ces-kpi__detail">{{ d.servicos.length }} {{ d.servicos.length === 1 ? 'serviço' : 'serviços' }}</span>
          </span>
        </div>
        <div class="ces-kpi" data-tone="info">
          <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-box"></i></span>
          <span class="ces-kpi__body">
            <span class="ces-kpi__label">Peças</span>
            <span class="ces-kpi__value">{{ d.totais.pecas | currency: 'BRL' }}</span>
            <span class="ces-kpi__detail">{{ (d.totais.pecasEstoque ?? 0) > 0 ? moeda(d.totais.pecasEstoque) + ' do estoque, já comprado' : d.pecas.length + (d.pecas.length === 1 ? ' peça' : ' peças') }}</span>
          </span>
        </div>
        @if (editavel() && temLancamentos()) {
          <button type="button" class="ces-kpi" data-tone="neutral" (click)="abrirAjustes()">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-percentage"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Desconto e acréscimo</span>
              <span class="ces-kpi__value">{{ ajusteTexto() }}</span>
              <span class="ces-kpi__detail">Toque para ajustar</span>
            </span>
            <i class="pi pi-angle-right ces-kpi__go" aria-hidden="true"></i>
          </button>
        } @else if (d.totais.desconto || d.totais.acrescimo) {
          <div class="ces-kpi" data-tone="neutral">
            <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-percentage"></i></span>
            <span class="ces-kpi__body">
              <span class="ces-kpi__label">Desconto e acréscimo</span>
              <span class="ces-kpi__value">{{ ajusteTexto() }}</span>
            </span>
          </div>
        }
        <div class="ces-kpi" data-tone="success">
          <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-calculator"></i></span>
          <span class="ces-kpi__body">
            <span class="ces-kpi__label">Total da OS</span>
            <span class="ces-kpi__value">{{ moeda(d.totais.total) }}</span>
            <span class="ces-kpi__detail">{{ (d.totais.pecasEstoque ?? 0) > 0 ? 'A comprar no financeiro: ' + moeda(d.totais.aComprar) : 'Vai inteiro para a compra no financeiro' }}</span>
          </span>
        </div>
      </div>

      <ces-data-table
        title="Serviços (mão de obra)"
        [description]="interna() ? 'Oficina interna: cada serviço tem o colaborador que fez.' : 'Oficina externa: o mecânico é opcional, pelo nome.'"
        storageKey="frota-os-servicos"
        searchPlaceholder="Filtrar nesta lista"
        [columns]="colunasServicos"
        [rows]="d.servicos"
        [rowKey]="chave"
        [state]="d.servicos.length ? 'ready' : 'empty'"
        stateTitle="Nenhum serviço lançado"
        [stateDescription]="editavel() ? 'Use Adicionar serviço para lançar a mão de obra com o mecânico e o valor.' : 'A OS não teve mão de obra lançada.'"
      >
        <ng-container table-actions>
          @if (editavel() && d.servicos.length > 1) {
            <ces-button size="sm" variant="outline" icon="pi pi-users" label="Mesmo mecânico para todos" (pressed)="abrirMecanico()"></ces-button>
          }
          @if (editavel()) {
            <ces-button size="sm" icon="pi pi-plus" label="Adicionar serviço" (pressed)="novo('servico')"></ces-button>
          }
        </ng-container>
        <ng-template cesCell="descricao" let-row>
          <span class="ces-cell-strong">{{ row.descricao }}</span>
          @if (row.itemManutencao) {
            <span class="ces-cell-muted">{{ row.itemManutencao }}</span>
          }
        </ng-template>
        <ng-template cesCell="mecanico" let-row>
          @if (row.mecanico) {
            {{ row.mecanico }}
          } @else if (interna()) {
            <ces-status tone="warning" icon="pi-exclamation-triangle">Sem mecânico</ces-status>
          } @else {
            <span class="ces-cell-muted">Não informado</span>
          }
        </ng-template>
        <ng-template cesCell="quantidade" let-row><span class="ces-cell-num">{{ row.quantidade | number: '1.0-3' }}</span></ng-template>
        <ng-template cesCell="valorUnitario" let-row><span class="ces-cell-num">{{ row.valorUnitario | currency: 'BRL' }}</span></ng-template>
        <ng-template cesCell="subtotal" let-row>
          @if (!row.subtotal && row.semCusto) {
            <ces-status tone="neutral" emphasis="outline">Sem custo</ces-status>
          } @else if (!row.subtotal && !interna()) {
            <ces-status tone="warning" icon="pi-hourglass">Sem valor</ces-status>
          } @else {
            <span class="ces-cell-num ces-cell-strong">{{ row.subtotal | currency: 'BRL' }}</span>
          }
        </ng-template>
        <ng-template cesRowActions let-row>
          @if (editavel()) {
            <span class="ces-table-actions">
              <ces-icon-button icon="pi pi-pencil" [label]="'Editar serviço ' + row.descricao" tooltip="Editar" size="icon-sm"
                (pressed)="editarServico(row)"></ces-icon-button>
              <ces-icon-button icon="pi pi-trash" [label]="'Excluir serviço ' + row.descricao" tooltip="Excluir" size="icon-sm"
                (pressed)="excluirServico(row)"></ces-icon-button>
            </span>
          }
        </ng-template>
      </ces-data-table>

      <ces-data-table
        title="Peças e consumíveis"
        description="A peça do estoque sai do almoxarifado pelo custo médio, já foi comprada e não entra de novo na compra ao financeiro. A de compra entra no pedido."
        storageKey="frota-os-pecas"
        searchPlaceholder="Filtrar nesta lista"
        [columns]="colunasPecas"
        [rows]="d.pecas"
        [rowKey]="chavePeca"
        [state]="d.pecas.length ? 'ready' : 'empty'"
        stateTitle="Nenhuma peça lançada"
        [stateDescription]="editavel() ? 'Use Adicionar peça para lançar o que foi trocado.' : 'A OS não teve peças lançadas.'"
      >
        <ng-container table-actions>
          @if (editavel()) {
            <ces-button size="sm" icon="pi pi-plus" label="Adicionar peça" (pressed)="novo('peca')"></ces-button>
          }
        </ng-container>
        <ng-template cesCell="descricao" let-row>
          <span class="ces-cell-strong">{{ row.descricao }}</span>
          @if (row.codigo) {
            <span class="ces-cell-muted">Código {{ row.codigo }}</span>
          }
        </ng-template>
        <ng-template cesCell="origem" let-row>
          <ces-status [tone]="row.origem === 'COMPRA' ? 'info' : 'neutral'" emphasis="outline">{{ row.origemRotulo }}</ces-status>
          @if (row.estoque) {
            <span class="ces-cell-muted">{{ row.baixadaNoEstoque ? 'Baixada de ' : '' }}{{ row.estoque }}</span>
          }
        </ng-template>
        <ng-template cesCell="quantidade" let-row><span class="ces-cell-num">{{ row.quantidade | number: '1.0-3' }} {{ row.unidade }}</span></ng-template>
        <ng-template cesCell="valorUnitario" let-row><span class="ces-cell-num">{{ row.valorUnitario | currency: 'BRL' }}</span></ng-template>
        <ng-template cesCell="subtotal" let-row>
          @if (!row.subtotal && row.semCusto) {
            <ces-status tone="neutral" emphasis="outline">Sem custo</ces-status>
          } @else if (!row.subtotal) {
            <ces-status tone="warning" icon="pi-hourglass">Sem valor</ces-status>
          } @else {
            <span class="ces-cell-num ces-cell-strong">{{ row.subtotal | currency: 'BRL' }}</span>
          }
        </ng-template>
        <ng-template cesRowActions let-row>
          @if (editavel()) {
            <span class="ces-table-actions">
              <ces-icon-button icon="pi pi-pencil" [label]="'Editar peça ' + row.descricao" tooltip="Editar" size="icon-sm"
                (pressed)="editarPeca(row)"></ces-icon-button>
              <ces-icon-button icon="pi pi-trash" [label]="'Excluir peça ' + row.descricao" tooltip="Excluir" size="icon-sm"
                (pressed)="excluirPeca(row)"></ces-icon-button>
            </span>
          }
        </ng-template>
      </ces-data-table>

    </div>

    <app-frota-os-lancamento [(visivel)]="lancamentoAberto" [tipo]="tipoLancamento()" [detalhe]="d" [opcoes]="opcoes()"
      [servico]="servicoEmEdicao()" [peca]="pecaEmEdicao()" (salvo)="atualizado.emit($event)"></app-frota-os-lancamento>

    <ces-form-drawer [(visible)]="ajustesAberto" title="Desconto e acréscimo"
      [description]="'Sobre os ' + moeda(somaLancamentos()) + ' de serviços e peças.'" [loading]="salvandoAjustes()" size="sm">
      <div class="ces-form-stack">
        <ces-number-input label="Desconto" mode="currency" [(value)]="desconto" [min]="0" [error]="erroDesconto()"></ces-number-input>
        <ces-number-input label="Acréscimo" mode="currency" [(value)]="acrescimo" [min]="0"></ces-number-input>
        <ces-callout tone="neutral" [dense]="true">Total da OS: {{ moeda(totalPrevisto()) }}</ces-callout>
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="ajustesAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Aplicar" [loading]="salvandoAjustes()" (pressed)="salvarAjustes()"></ces-button>
      </div>
    </ces-form-drawer>

    <ces-form-drawer [(visible)]="mecanicoAberto" title="Mesmo mecânico para todos"
      [description]="'Aplica o mecânico aos ' + d.servicos.length + ' serviços desta OS.'" [loading]="salvandoMecanico()" size="sm">
      <div class="ces-form-stack">
        @if (interna()) {
          <ces-autocomplete label="Mecânico" [required]="true" [options]="opcoesMecanico()" [status]="statusBusca()"
            [loading]="statusBusca() === 'loading'" [ngModel]="idMecanico()" (ngModelChange)="idMecanico.set($event)"
            (search)="buscarMecanico($event)" [error]="erroMecanico()"></ces-autocomplete>
        } @else {
          <ces-text-input label="Mecânico" [required]="true" [(value)]="mecanicoNome" [maxlength]="120" [error]="erroMecanico()"></ces-text-input>
        }
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="mecanicoAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Aplicar a todos" [loading]="salvandoMecanico()" (pressed)="salvarMecanico()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaOsExecucaoComponent {
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);

  readonly detalhe = input.required<OrdemServicoDetalhe>();
  readonly opcoes = input<OpcoesFrota | null>(null);
  readonly podeEditar = input(false);
  readonly atualizado = output<OrdemServicoDetalhe>();

  protected readonly moeda = moeda;
  protected readonly editavel = computed(() => {
    const os = this.detalhe().ordem;
    return this.podeEditar() && (osAberta(os.situacao) || (os.situacao === 'CONCLUIDA' && !!os.baixaPendente));
  });
  protected readonly interna = computed(() => this.detalhe().ordem.tipoOficina === 'INTERNA');
  /** Só na OS concluída: os serviços e peças que ainda seguram a finalização. */
  protected readonly valoresPendentes = computed(() => {
    const d = this.detalhe();
    if (!d.ordem.baixaPendente) return [];
    return (d.pendencias ?? []).filter((p) => p.startsWith('Serviço: ') || p.startsWith('Peça: '))
      .map((p) => p.replace(/^(Serviço|Peça): /, ''));
  });
  protected readonly temLancamentos = computed(() => this.detalhe().servicos.length + this.detalhe().pecas.length > 0);
  /** "− R$ 300,00", "+ R$ 50,00" ou os dois; sem ajuste, "Nenhum". */
  protected readonly ajusteTexto = computed(() => {
    const t = this.detalhe().totais;
    const partes = [t.desconto ? '− ' + moeda(t.desconto) : '', t.acrescimo ? '+ ' + moeda(t.acrescimo) : ''].filter(Boolean);
    return partes.length ? partes.join(' ') : 'Nenhum';
  });
  protected readonly somaLancamentos = computed(() => this.detalhe().totais.servicos + this.detalhe().totais.pecas);

  protected readonly lancamentoAberto = signal(false);
  protected readonly tipoLancamento = signal<TipoLancamento>('servico');
  protected readonly servicoEmEdicao = signal<ServicoOrdemServico | null>(null);
  protected readonly pecaEmEdicao = signal<PecaOrdemServico | null>(null);

  protected readonly ajustesAberto = signal(false);
  protected readonly desconto = signal<number | null>(0);
  protected readonly acrescimo = signal<number | null>(0);
  protected readonly salvandoAjustes = signal(false);
  protected readonly totalPrevisto = computed(() => this.somaLancamentos() - (this.desconto() ?? 0) + (this.acrescimo() ?? 0));
  protected readonly erroDesconto = computed(() =>
    (this.desconto() ?? 0) > this.somaLancamentos() ? 'O desconto não pode passar do valor dos serviços e das peças.' : undefined
  );

  protected readonly mecanicoAberto = signal(false);
  protected readonly idMecanico = signal<string | null>(null);
  protected readonly mecanicoNome = signal('');
  protected readonly opcoesMecanico = signal<CesSelectOption<string>[]>([]);
  protected readonly statusBusca = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  protected readonly salvandoMecanico = signal(false);
  protected readonly tentouMecanico = signal(false);
  protected readonly erroMecanico = computed(() =>
    this.tentouMecanico() && !(this.interna() ? this.idMecanico() : this.mecanicoNome().trim()) ? 'Informe o mecânico.' : undefined
  );

  protected readonly colunasServicos: CesDataTableColumn<ServicoOrdemServico>[] = [
    { key: 'descricao', header: 'Serviço', type: 'custom', priority: 1, value: (r) => r.descricao, display: (r) => r.descricao },
    { key: 'mecanico', header: 'Mecânico', type: 'custom', value: (r) => r.mecanico ?? '', display: (r) => r.mecanico ?? '—' },
    { key: 'quantidade', header: 'Qtd. / horas', type: 'custom', value: (r) => r.quantidade, display: (r) => numero(r.quantidade) },
    { key: 'valorUnitario', header: 'Valor unit.', type: 'custom', value: (r) => r.valorUnitario, display: (r) => moeda(r.valorUnitario) },
    { key: 'subtotal', header: 'Subtotal', type: 'custom', priority: 1, value: (r) => r.subtotal, display: (r) => moeda(r.subtotal) }
  ];

  protected readonly colunasPecas: CesDataTableColumn<PecaOrdemServico>[] = [
    { key: 'descricao', header: 'Peça', type: 'custom', priority: 1, value: (r) => r.descricao, display: (r) => r.descricao },
    { key: 'origem', header: 'Origem', type: 'custom', value: (r) => r.origem, display: (r) => (r.estoque ? `${r.origemRotulo} ${r.estoque}` : r.origemRotulo) },
    { key: 'quantidade', header: 'Quantidade', type: 'custom', value: (r) => r.quantidade, display: (r) => `${numero(r.quantidade)} ${r.unidade}` },
    { key: 'valorUnitario', header: 'Valor unit.', type: 'custom', value: (r) => r.valorUnitario, display: (r) => moeda(r.valorUnitario) },
    { key: 'subtotal', header: 'Subtotal', type: 'custom', priority: 1, value: (r) => r.subtotal, display: (r) => moeda(r.subtotal) }
  ];

  protected readonly chave = (r: ServicoOrdemServico) => r.id;
  protected readonly chavePeca = (r: PecaOrdemServico) => r.id;

  protected novo(tipo: TipoLancamento): void {
    this.tipoLancamento.set(tipo);
    this.servicoEmEdicao.set(null);
    this.pecaEmEdicao.set(null);
    this.lancamentoAberto.set(true);
  }

  protected editarServico(servico: ServicoOrdemServico): void {
    this.tipoLancamento.set('servico');
    this.servicoEmEdicao.set(servico);
    this.pecaEmEdicao.set(null);
    this.lancamentoAberto.set(true);
  }

  protected editarPeca(peca: PecaOrdemServico): void {
    this.tipoLancamento.set('peca');
    this.pecaEmEdicao.set(peca);
    this.servicoEmEdicao.set(null);
    this.lancamentoAberto.set(true);
  }

  protected async excluirServico(servico: ServicoOrdemServico): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Excluir serviço',
      message: `${servico.descricao} (${moeda(servico.subtotal)}) sai da OS. A exclusão fica no histórico.`,
      confirmLabel: 'Excluir serviço',
      variant: 'destructive'
    });
    if (!ok) return;
    this.frota.excluirServicoOs(this.detalhe().ordem.id, servico.id).subscribe({
      next: (d) => {
        this.notificacoes.success('Serviço excluído.');
        this.atualizado.emit(d);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async excluirPeca(peca: PecaOrdemServico): Promise<void> {
    const devolve = !!peca.baixadaNoEstoque;
    const ok = await this.confirmacao.confirm({
      title: 'Excluir peça',
      message: devolve
        ? `${peca.descricao} (${moeda(peca.subtotal)}) sai da OS e ${numero(peca.quantidade)} ${peca.unidade} voltam ao ${peca.estoque ?? 'estoque'}. A exclusão fica no histórico.`
        : `${peca.descricao} (${moeda(peca.subtotal)}) sai da OS. A exclusão fica no histórico.`,
      confirmLabel: devolve ? 'Excluir e devolver' : 'Excluir peça',
      variant: 'destructive'
    });
    if (!ok) return;
    this.frota.excluirPecaOs(this.detalhe().ordem.id, peca.id).subscribe({
      next: (d) => {
        this.notificacoes.success(devolve ? `Peça excluída e devolvida ao ${peca.estoque ?? 'estoque'}.` : 'Peça excluída.');
        this.atualizado.emit(d);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected abrirAjustes(): void {
    this.desconto.set(this.detalhe().totais.desconto);
    this.acrescimo.set(this.detalhe().totais.acrescimo);
    this.ajustesAberto.set(true);
  }

  protected salvarAjustes(): void {
    if (this.erroDesconto()) return;
    this.salvandoAjustes.set(true);
    this.frota.definirAjustesOs(this.detalhe().ordem.id, this.desconto() ?? 0, this.acrescimo() ?? 0).subscribe({
      next: (d) => {
        this.salvandoAjustes.set(false);
        this.ajustesAberto.set(false);
        this.notificacoes.success('Desconto e acréscimo aplicados.');
        this.atualizado.emit(d);
      },
      error: (e) => {
        this.salvandoAjustes.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected abrirMecanico(): void {
    this.tentouMecanico.set(false);
    this.idMecanico.set(null);
    this.mecanicoNome.set('');
    this.opcoesMecanico.set([]);
    this.statusBusca.set('idle');
    this.mecanicoAberto.set(true);
  }

  protected buscarMecanico(termo: string): void {
    this.statusBusca.set('loading');
    this.lookups.searchCollaborators({ query: termo, limit: 20 }).subscribe({
      next: (pagina) => {
        this.opcoesMecanico.set(pagina.items.map((i) => ({ label: i.label, value: i.value })));
        this.statusBusca.set(pagina.items.length ? 'success' : 'empty');
      },
      error: () => this.statusBusca.set('error')
    });
  }

  protected salvarMecanico(): void {
    this.tentouMecanico.set(true);
    if (this.erroMecanico()) return;
    this.salvandoMecanico.set(true);
    const interna = this.interna();
    this.frota
      .definirMecanicoOs(this.detalhe().ordem.id, interna ? this.idMecanico() : null, interna ? null : this.mecanicoNome().trim())
      .subscribe({
        next: (d) => {
          this.salvandoMecanico.set(false);
          this.mecanicoAberto.set(false);
          this.notificacoes.success('Mecânico aplicado a todos os serviços.');
          this.atualizado.emit(d);
        },
        error: (e) => {
          this.salvandoMecanico.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
  }
}
