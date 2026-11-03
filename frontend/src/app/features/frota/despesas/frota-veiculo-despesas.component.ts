import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesIconButtonComponent,
  CesRowActionsDirective,
  CesSelectOption,
  CesStatusComponent
} from '@ces/ui';
import { forkJoin } from 'rxjs';
import { LookupStore } from '../../../core/lookup';
import { DespesaVeiculo, ResumoDespesas, TipoDespesa, pagamentoDespesa } from '../../../core/models/frota-despesa.models';
import { FornecedorFrota, contar } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaDespesaService } from '../../../core/services/frota-despesa.service';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { basesFrota } from '../shared/frota-lista';
import { FrotaDespesaFormComponent, VeiculoDespesa } from './frota-despesa-form.component';

const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Aba Despesas da ficha do veículo: quanto o veículo já custou em lavagem, pedágio, mensalidade e
 * demais despesas, o que falta mandar ao financeiro e o lançamento com o veículo já escolhido.
 */
@Component({
  selector: 'app-frota-veiculo-despesas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesIconButtonComponent,
    CesRowActionsDirective,
    CesStatusComponent,
    FrotaDespesaFormComponent
  ],
  styles: `
    :host { display: grid; gap: 0.75rem; }
    .valor { font-weight: 700; font-variant-numeric: tabular-nums; }
  `,
  template: `
    <!-- Sem despesa, os cartões zerados só repetem o estado vazio da tabela. -->
    @if (resumo(); as r) {
      @if (r.quantidade) {
      <div class="ces-kpis" aria-label="Resumo das despesas do veículo">
        <div class="ces-kpi" data-tone="info">
          <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-wallet"></i></span>
          <span class="ces-kpi__body">
            <span class="ces-kpi__label">Total lançado</span>
            <span class="ces-kpi__value">{{ moeda(r.total) }}</span>
            <span class="ces-kpi__detail">{{ contar(r.quantidade, 'despesa', 'despesas', 'Nenhuma despesa') }}</span>
          </span>
        </div>
        <div class="ces-kpi" [attr.data-tone]="r.aPagarSemSolicitacao ? 'warning' : 'success'">
          <span class="ces-kpi__icon" aria-hidden="true"><i class="pi" [class.pi-clock]="r.aPagarSemSolicitacao" [class.pi-check-circle]="!r.aPagarSemSolicitacao"></i></span>
          <span class="ces-kpi__body">
            <span class="ces-kpi__label">Falta pedir o pagamento</span>
            <span class="ces-kpi__value">{{ moeda(r.valorAPagarSemSolicitacao) }}</span>
            <span class="ces-kpi__detail">{{ r.aPagarSemSolicitacao ? contar(r.aPagarSemSolicitacao, 'despesa sem solicitação', 'despesas sem solicitação', '') : 'Tudo o que é a pagar já foi ao financeiro' }}</span>
          </span>
        </div>
        <div class="ces-kpi" data-tone="info">
          <span class="ces-kpi__icon" aria-hidden="true"><i class="pi pi-chart-bar"></i></span>
          <span class="ces-kpi__body">
            <span class="ces-kpi__label">Maior gasto</span>
            @if (r.porTipo[0]; as t) {
              <span class="ces-kpi__value">{{ t.tipo }}</span>
              <span class="ces-kpi__detail">{{ moeda(t.total) }} · {{ porcento(r.total ? t.total / r.total : 0) }} do total</span>
            } @else {
              <span class="ces-kpi__value">—</span>
              <span class="ces-kpi__detail">Sem despesas lançadas</span>
            }
          </span>
        </div>
      </div>
      }
    }

    <ces-data-table title="Despesas do veículo" description="Lavagem, pedágio, estacionamento, mensalidade, taxa e outras, da mais recente para a mais antiga."
      storageKey="frota-veiculo-despesas" exportFileName="despesas-veiculo" searchPlaceholder="Filtrar nesta lista" [rowClickable]="true"
      [columns]="colunas" [rows]="despesas()" [rowKey]="chave" [state]="estado()"
      [stateTitle]="erro() ? 'Não foi possível carregar as despesas' : 'Nenhuma despesa lançada'"
      [stateDescription]="erro() ?? (podeLancar() ? 'Use Lançar despesa para registrar a lavagem, o pedágio ou outra despesa deste veículo.' : 'As despesas do veículo aparecem aqui.')"
      (rowActivate)="abrir($event)">
      <ng-container table-actions>
        @if (podeLancar()) {
          <ces-button size="sm" icon="pi pi-plus" label="Lançar despesa" (pressed)="novo()"></ces-button>
        }
      </ng-container>
      <ng-template cesCell="data" let-row>{{ row.data | date: 'dd/MM/yyyy' }}</ng-template>
      <ng-template cesCell="tipo" let-row>
        <span class="ces-cell-strong">{{ row.tipo }}{{ row.subtipo ? ' · ' + row.subtipo : '' }}</span>
        @if (row.descricao) { <span class="ces-cell-muted">{{ row.descricao }}</span> }
      </ng-template>
      <ng-template cesCell="valor" let-row><span class="valor">{{ moeda(row.valor) }}</span></ng-template>
      <ng-template cesCell="fornecedor" let-row>
        {{ row.fornecedorNome ?? '—' }}
        @if (row.documentoTipoRotulo) { <span class="ces-cell-muted">{{ row.documentoTipoRotulo }} {{ row.documentoNumero }}</span> }
      </ng-template>
      <ng-template cesCell="pagamento" let-row>
        @let p = pagamento(row);
        <ces-status [tone]="p.tom" [icon]="p.icone">{{ p.rotulo }}</ces-status>
        @if (row.numeroSolicitacaoFinanceira) { <span class="ces-cell-muted">Solicitação nº {{ row.numeroSolicitacaoFinanceira }}</span> }
      </ng-template>
      <ng-template cesRowActions let-row>
        <span class="ces-table-actions">
          @if (row.anexos.length) {
            <ces-icon-button icon="pi pi-paperclip" [label]="row.anexos.length + ' comprovante(s) de ' + rotulo(row)"
              [tooltip]="row.anexos.length === 1 ? '1 comprovante' : row.anexos.length + ' comprovantes'" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
          }
          @if (acesso.solicitarPagamento() && row.podePedirPagamento) {
            <ces-icon-button icon="pi pi-send" [label]="'Pedir o pagamento de ' + rotulo(row)" tooltip="Pedir pagamento" size="icon-sm"
              (pressed)="pedirPagamento(row)"></ces-icon-button>
          }
          <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir ' + rotulo(row)" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
        </span>
      </ng-template>
    </ces-data-table>

    <app-frota-despesa-form [(visivel)]="formularioAberto" [despesa]="emEdicao()" [idVeiculoFixo]="veiculo().idVeiculo" [veiculos]="[veiculo()]"
      [tipos]="tipos()" [fornecedores]="fornecedores()" [carregandoFornecedores]="carregandoFornecedores()" [bases]="bases.opcoes()"
      [processos]="processos()" [podePedirPagamento]="acesso.solicitarPagamento()" (salva)="aoSalvar($event)" (excluida)="carregar()"></app-frota-despesa-form>
  `
})
export class FrotaVeiculoDespesasComponent {
  private readonly servico = inject(FrotaDespesaService);
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  readonly veiculo = input.required<VeiculoDespesa>();
  readonly podeLancar = input(false);

  protected readonly moeda = moeda;
  protected readonly contar = contar;
  protected readonly pagamento = pagamentoDespesa;
  protected readonly porcento = (fatia: number) => `${Math.round(fatia * 100)}%`;

  protected readonly despesas = signal<DespesaVeiculo[]>([]);
  protected readonly resumo = signal<ResumoDespesas | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly tipos = signal<TipoDespesa[]>([]);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly carregandoFornecedores = signal(true);
  protected readonly formularioAberto = signal(false);
  protected readonly emEdicao = signal<DespesaVeiculo | null>(null);
  protected readonly processos = computed<CesSelectOption<string>[]>(() => this.lookups.processes().map((p) => ({ label: p.label, value: p.value })));
  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.erro() ? 'error' : this.despesas().length ? 'ready' : 'empty'));

  protected readonly colunas: CesDataTableColumn<DespesaVeiculo>[] = [
    { key: 'data', header: 'Data', type: 'custom', priority: 1, value: (d) => d.data, display: (d) => d.data },
    { key: 'tipo', header: 'Despesa', type: 'custom', priority: 1, value: (d) => d.tipo, display: (d) => `${d.tipo}${d.subtipo ? ' ' + d.subtipo : ''}` },
    { key: 'valor', header: 'Valor', type: 'custom', priority: 1, value: (d) => d.valor, display: (d) => moeda(d.valor) },
    { key: 'fornecedor', header: 'Quem recebeu', type: 'custom', priority: 2, value: (d) => d.fornecedorNome, display: (d) => d.fornecedorNome ?? '' },
    { key: 'pagamento', header: 'Pagamento', type: 'custom', priority: 1, value: (d) => d.situacaoPagamento ?? d.formaPagamento, display: (d) => pagamentoDespesa(d).rotulo }
  ];
  protected readonly chave = (d: DespesaVeiculo) => d.id;
  protected readonly rotulo = (d: DespesaVeiculo) => d.tipo.toLowerCase();

  constructor() {
    effect(() => {
      if (this.veiculo().idVeiculo) untracked(() => this.carregar());
    });
  }

  protected carregar(): void {
    const idVeiculo = this.veiculo().idVeiculo;
    this.carregando.set(true);
    this.erro.set(null);
    forkJoin({
      lista: this.servico.listar({ idVeiculo }, { size: 200, sort: ['data,desc'] }),
      resumo: this.servico.resumo({ idVeiculo })
    }).subscribe({
      next: ({ lista, resumo }) => {
        this.despesas.set(lista.content);
        this.resumo.set(resumo);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
  }

  protected novo(): void {
    this.carregarCatalogos();
    this.emEdicao.set(null);
    this.formularioAberto.set(true);
  }

  protected abrir(d: DespesaVeiculo): void {
    this.carregarCatalogos();
    this.emEdicao.set(d);
    this.formularioAberto.set(true);
  }

  protected aoSalvar(d: DespesaVeiculo): void {
    if (this.formularioAberto()) this.emEdicao.set(d);
    this.carregar();
  }

  /** Atalho da linha: abre o pagamento no financeiro já preenchido com a despesa. */
  protected pedirPagamento(d: DespesaVeiculo): void {
    void this.router.navigate(['/financeiro', 'pagamentos', 'nova'], { queryParams: { origem: 'FROTA_DESPESA', origemId: d.id } });
  }

  /** Tipos, fornecedores e setores só quando a pessoa vai lançar ou abrir uma despesa. */
  private carregarCatalogos(): void {
    if (this.tipos().length) return;
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    this.servico.tipos(false).subscribe({ next: (t) => this.tipos.set(t), error: () => undefined });
    this.frota.fornecedoresOficina().subscribe({
      next: (f) => (this.fornecedores.set(f), this.carregandoFornecedores.set(false)),
      error: () => this.carregandoFornecedores.set(false)
    });
  }
}
