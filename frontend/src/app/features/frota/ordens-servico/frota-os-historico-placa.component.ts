import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesStatusComponent,
  CesTone
} from '@ces/ui';
import {
  OrdemServico,
  ROTULO_SITUACAO_OS,
  ROTULO_TIPO_MANUTENCAO,
  TOM_SITUACAO_OS,
  rotuloOs
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

/** Quantas OS anteriores da placa a aba traz: cobre anos de manutenção de um veículo. */
const LIMITE = 200;

/**
 * Histórico de manutenções da placa dentro da OS: as outras OS do mesmo veículo, das mais
 * novas para as mais antigas, com o que foi feito, onde e quanto custou. Serve para
 * conferir garantia (bateria trocada há 8 meses) antes de mandar fazer de novo.
 */
@Component({
  selector: 'app-frota-os-historico-placa',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, CesCellDirective, CesDataTableComponent, CesStatusComponent],
  template: `
    <ces-data-table
      [title]="'Manutenções de ' + placa()"
      [description]="descricao()"
      storageKey="frota-os-historico-placa"
      searchPlaceholder="Buscar item, serviço ou oficina (ex.: bateria)"
      rowActionLabel="Abrir a OS"
      [columns]="colunas"
      [rows]="linhas()"
      [rowKey]="chave"
      [state]="estado()"
      [stateTitle]="erro() ? 'Não foi possível carregar o histórico' : 'Primeira manutenção desta placa'"
      [stateDescription]="erro() ?? 'Nenhuma outra OS foi aberta para este veículo.'"
      (rowActivate)="abrir($event)"
    >
      <ng-template cesCell="numero" let-row>
        <span class="ces-cell-strong">{{ rotuloOs(row.numero) }}</span>
        <span class="ces-cell-muted">{{ rotuloTipo[row.tipoManutencao] }}</span>
      </ng-template>
      <ng-template cesCell="quando" let-row>
        {{ (row.fimReal ?? row.abertaEm) | date: 'dd/MM/yyyy' }}
        <span class="ces-cell-muted">{{ row.fimReal ? 'Concluída' : 'Aberta' }} há {{ diasDesde(row.fimReal ?? row.abertaEm) }}</span>
      </ng-template>
      <ng-template cesCell="itens" let-row>
        {{ row.itens.join(', ') || '—' }}
        @if (emComum(row).length) {
          <ces-status tone="warning" icon="pi-replay">Mesmo item desta OS: {{ emComum(row).join(', ') }}</ces-status>
        }
      </ng-template>
      <ng-template cesCell="servico" let-row>
        {{ row.descricaoServico ?? row.descricao }}
        @if (row.itensSubstituidos) {
          <span class="ces-cell-muted">Substituídos: {{ row.itensSubstituidos }}</span>
        }
      </ng-template>
      <ng-template cesCell="situacao" let-row>
        <ces-status [tone]="tomSituacao[row.situacao]">{{ rotuloSituacao[row.situacao] }}</ces-status>
      </ng-template>
      <ng-template cesCell="valorTotal" let-row>
        <span class="ces-cell-num">{{ row.valorTotal != null ? (row.valorTotal | currency: 'BRL') : '—' }}</span>
      </ng-template>
    </ces-data-table>
  `
})
export class FrotaOsHistoricoPlacaComponent {
  private readonly frota = inject(FrotaService);
  private readonly router = inject(Router);

  readonly idOrdem = input.required<string>();
  readonly idVeiculo = input.required<string>();
  readonly placa = input.required<string>();
  /** Itens da OS aberta na tela, para destacar a repetição no histórico. */
  readonly itensAtuais = input<string[]>([]);

  protected readonly rotuloOs = rotuloOs;
  protected readonly rotuloTipo: Record<string, string> = ROTULO_TIPO_MANUTENCAO;
  protected readonly rotuloSituacao: Record<string, string> = ROTULO_SITUACAO_OS;
  protected readonly tomSituacao: Record<string, CesTone> = TOM_SITUACAO_OS;

  private readonly ordens = signal<OrdemServico[] | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly linhas = computed(() => (this.ordens() ?? []).filter((o) => o.id !== this.idOrdem()));
  protected readonly estado = computed(() =>
    this.erro() ? 'error' : this.ordens() === null ? 'loading' : this.linhas().length ? 'ready' : 'empty'
  );
  protected readonly descricao = computed(() => {
    const concluidas = this.linhas().filter((o) => o.situacao === 'CONCLUIDA');
    if (!concluidas.length) return 'Outras OS deste veículo, das mais novas para as mais antigas.';
    const ano = Date.now() - 365 * 864e5;
    const doAno = concluidas.filter((o) => o.fimReal && new Date(o.fimReal).getTime() >= ano);
    const gasto = doAno.reduce((soma, o) => soma + (o.valorTotal ?? 0), 0);
    const moeda = gasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `${doAno.length} ${doAno.length === 1 ? 'manutenção concluída' : 'manutenções concluídas'} nos últimos 12 meses (${moeda}). Busque pelo item para conferir garantia antes de trocar de novo.`;
  });

  protected readonly colunas: CesDataTableColumn<OrdemServico>[] = [
    { key: 'numero', header: 'OS', type: 'custom', priority: 1, value: (r) => r.numero, display: (r) => rotuloOs(r.numero) },
    { key: 'quando', header: 'Data', type: 'custom', priority: 1, value: (r) => r.fimReal ?? r.abertaEm, display: (r) => r.fimReal ?? r.abertaEm },
    { key: 'itens', header: 'Itens', type: 'custom', priority: 1, value: (r) => r.itens.join(', '), display: (r) => r.itens.join(', ') },
    { key: 'servico', header: 'Serviço realizado', type: 'custom', value: (r) => r.descricaoServico ?? r.descricao, display: (r) => `${r.descricaoServico ?? r.descricao} ${r.itensSubstituidos ?? ''}` },
    { key: 'oficina', header: 'Oficina', display: (r) => r.oficina },
    { key: 'situacao', header: 'Situação', type: 'custom', value: (r) => r.situacao, display: (r) => ROTULO_SITUACAO_OS[r.situacao] },
    { key: 'valorTotal', header: 'Valor', type: 'custom', value: (r) => r.valorTotal ?? 0, display: (r) => String(r.valorTotal ?? '') }
  ];
  protected readonly chave = (r: OrdemServico) => r.id;

  constructor() {
    effect(() => {
      const veiculo = this.idVeiculo();
      if (veiculo) this.carregar(veiculo);
    });
  }

  protected emComum(os: OrdemServico): string[] {
    const atuais = new Set(this.itensAtuais());
    return os.itens.filter((i) => atuais.has(i));
  }

  protected diasDesde(data: string): string {
    const dias = Math.max(0, Math.floor((Date.now() - new Date(data).getTime()) / 864e5));
    if (dias >= 60) return `${Math.round(dias / 30)} meses`;
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }

  protected abrir(os: OrdemServico): void {
    void this.router.navigate(['/frota/ordens-servico', os.id]);
  }

  private carregar(idVeiculo: string): void {
    this.ordens.set(null);
    this.erro.set(null);
    this.frota.listarOrdensServico({ idVeiculo }, { page: 0, size: LIMITE, sort: ['abertaEm,desc'] }).subscribe({
      next: (pagina) => this.ordens.set(pagina.content),
      error: (e) => this.erro.set(getErrorMessage(e))
    });
  }
}
