import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDatepickerComponent,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoIconButtonComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  NotificationService
} from '@geo/ui';
import { LookupStore } from '../../../core/lookup';
import { Apolice, CoberturaApolice, CoberturaVeiculo, coberturaNaApolice, vigenciaApolice } from '../../../core/models/frota-seguro.models';
import { FornecedorFrota, deDataIso, formatarPlaca, paraDataIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { basesFrota } from '../shared/frota-lista';
import { FrotaApoliceDrawerComponent, VeiculoSeguro } from './frota-apolice-drawer.component';

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/**
 * Aba Seguro da ficha do veículo: a situação do seguro hoje, as apólices que cobrem (ou cobriram)
 * o veículo, com o período dele em cada uma, a inclusão numa apólice já cadastrada e o cadastro de
 * apólice nova com o veículo.
 */
@Component({
  selector: 'app-frota-veiculo-seguro',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoSelectComponent,
    GeoIconButtonComponent,
    GeoRowActionsDirective,
    GeoStatusComponent,
    FrotaApoliceDrawerComponent
  ],
  styles: `
    :host { display: grid; gap: 1rem; }
    .aviso { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
    .aviso__texto { flex: 1 1 18rem; min-width: 0; }
    .incluir { display: grid; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md);
      background: var(--geo-surface-subtle); }
    .incluir__titulo { font-weight: 600; }
    .incluir__texto { margin: 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .acoes { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
    .acoes > * { flex: 1 1 12rem; }
    .acoes > geo-button { flex: 0 0 auto; }
  `,
  template: `
    @if (situacao(); as s) {
      @if (s.cobertoHoje) {
        <geo-callout [tone]="s.perdeCoberturaEm ? 'warning' : 'success'" [icon]="s.perdeCoberturaEm ? 'pi pi-clock' : 'pi pi-check-circle'" [dense]="true"
          [title]="'Coberto pela apólice ' + s.numeroApolice">
          @if (s.perdeCoberturaEm) {
            Fica sem seguro a partir de {{ dataBr(s.perdeCoberturaEm) }}: renove a apólice ou inclua o veículo em outra.
          } @else {
            Seguro em dia até {{ dataBr(s.cobertoAte) }}.
          }
        </geo-callout>
      } @else {
        <geo-callout tone="danger" icon="pi pi-exclamation-triangle" [dense]="true" title="Sem seguro hoje">
          <div class="aviso">
            <span class="aviso__texto">
              @if (s.proximaCoberturaEm) {
                Fica coberto a partir de {{ dataBr(s.proximaCoberturaEm) }} pela apólice {{ s.numeroApolice }}.
              } @else if (s.ultimaCoberturaAte) {
                Sem cobertura desde {{ dataBr(s.ultimaCoberturaAte) }}. Inclua numa apólice existente ou cadastre uma nova.
              } @else {
                Nenhuma apólice cobre este veículo. Inclua numa apólice existente ou cadastre uma nova.
              }
            </span>
            @if (podeEditar() && !incluindo()) {
              <geo-button size="sm" variant="outline" icon="pi pi-link" label="Incluir numa apólice" (pressed)="abrirInclusao()"></geo-button>
            }
          </div>
        </geo-callout>
      }
    }

    @if (incluindo()) {
      <div class="incluir">
        <span class="incluir__titulo">Incluir o {{ placa(veiculo().placa) }} numa apólice existente</span>
        <p class="incluir__texto">
          @if (!carregandoApolices() && !opcoesApolice().length) {
            Nenhuma apólice em vigor ou futura sem este veículo. Cadastre uma nova.
          } @else {
            Aparecem as apólices em vigor ou que ainda vão começar. O veículo fica coberto da data escolhida (dentro da vigência) até o fim da apólice.
          }
        </p>
        <div class="acoes">
          <geo-select label="Apólice" [required]="true" [options]="opcoesApolice()" [(value)]="apoliceEscolhida" [filter]="true"
            [loading]="carregandoApolices()" filterPlaceholder="Número ou seguradora"></geo-select>
          <geo-datepicker label="Coberto desde" [required]="true" [(value)]="desde" [minDate]="minDesde()" [maxDate]="maxDesde()"></geo-datepicker>
          <geo-button variant="ghost" label="Cancelar" (pressed)="incluindo.set(false)"></geo-button>
          <geo-button icon="pi pi-check" label="Incluir" [disabled]="!apoliceEscolhida() || !desde()" [loading]="gravando()" (pressed)="incluir()"></geo-button>
        </div>
      </div>
    }

    <geo-data-table title="Apólices do veículo" description="Apólices que cobrem ou cobriram o veículo, com o período dele em cada uma."
      storageKey="frota-veiculo-seguro" exportFileName="seguros-veiculo" searchPlaceholder="Filtrar nesta lista" [rowClickable]="true"
      [columns]="colunas" [rows]="apolices()" [rowKey]="chave" [state]="estado()"
      [stateTitle]="erro() ? 'Não foi possível carregar as apólices' : 'Veículo sem seguro cadastrado'"
      [stateDescription]="erro() ?? (podeEditar() ? 'Cadastre a apólice ou inclua o veículo numa apólice existente.' : 'As apólices que cobrem o veículo aparecem aqui.')"
      (rowActivate)="abrir($event)">
      <ng-container table-actions>
        @if (podeEditar()) {
          @if (!incluindo() && situacao()?.cobertoHoje !== false) {
            <geo-button size="sm" variant="outline" icon="pi pi-link" label="Incluir numa apólice" (pressed)="abrirInclusao()"></geo-button>
          }
          <geo-button size="sm" icon="pi pi-plus" label="Cadastrar apólice" (pressed)="novo()"></geo-button>
        }
      </ng-container>
      <ng-template geoCell="apolice" let-row>
        <span class="geo-cell-strong">{{ row.numero }}</span>
        <span class="geo-cell-muted">{{ row.seguradora ?? 'Seguradora' }}</span>
      </ng-template>
      <ng-template geoCell="periodo" let-row>
        @let c = cobertura(row);
        @if (c) {
          @let s = situacaoCobertura(c, row);
          <geo-status [tone]="s.tom" [icon]="s.icone">{{ s.rotulo }}</geo-status>
          <span class="geo-cell-muted">{{ c.inicio | date: 'dd/MM/yyyy' }} a {{ (c.fim ?? row.vigenciaFim) | date: 'dd/MM/yyyy' }}</span>
        }
      </ng-template>
      <ng-template geoCell="vigencia" let-row>
        @let v = vigencia(row);
        <geo-status [tone]="v.tom" [icon]="v.icone">{{ v.rotulo }}</geo-status>
        <span class="geo-cell-muted">até {{ row.vigenciaFim | date: 'dd/MM/yyyy' }}{{ row.franquia ? ' · franquia ' + moeda(row.franquia) : '' }}</span>
      </ng-template>
      <ng-template geoRowActions let-row>
        <span class="geo-table-actions">
          <geo-icon-button icon="pi pi-angle-right" [label]="'Abrir a apólice ' + row.numero" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></geo-icon-button>
        </span>
      </ng-template>
    </geo-data-table>

    <app-frota-apolice-drawer [(visivel)]="painelAberto" [apolice]="emEdicao()" [renovacaoDe]="renovacao()" [veiculos]="veiculosDrawer()"
      [idsVeiculoIniciais]="[veiculo().idVeiculo]" (renovar)="renovar($event)"
      [fornecedores]="fornecedores()" [carregandoFornecedores]="carregandoFornecedores()" [bases]="bases.opcoes()" [processos]="processos()"
      [podeEditar]="podeEditar()" [podePedirPagamento]="acesso.solicitarPagamento()" (salva)="aoSalvar($event)" (excluida)="carregar()"></app-frota-apolice-drawer>
  `
})
export class FrotaVeiculoSeguroComponent {
  private readonly servico = inject(FrotaSeguroService);
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly lookups = inject(LookupStore);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  readonly veiculo = input.required<VeiculoSeguro>();
  readonly podeEditar = input(false);

  protected readonly vigencia = vigenciaApolice;
  protected readonly dataBr = dataBr;
  protected readonly placa = formatarPlaca;
  /** Seguro do veículo hoje (somando as renovações já cadastradas). */
  protected readonly situacao = signal<CoberturaVeiculo | null>(null);
  protected readonly incluindo = signal(false);
  protected readonly gravando = signal(false);
  protected readonly carregandoApolices = signal(false);
  /** Apólices em vigor ou futuras, para incluir o veículo. */
  private readonly candidatas = signal<Apolice[]>([]);
  protected readonly apoliceEscolhida = signal<string | null>(null);
  protected readonly desde = signal<Date | null>(null);
  protected readonly opcoesApolice = computed<GeoSelectOption<string>[]>(() =>
    this.candidatas().map((a) => ({
      label: `${a.numero} · ${a.seguradora ?? 'Seguradora'} · ${dataBr(a.vigenciaInicio)} a ${dataBr(a.vigenciaFim)}`,
      value: a.id
    })));
  private readonly escolhida = computed(() => this.candidatas().find((a) => a.id === this.apoliceEscolhida()) ?? null);
  protected readonly minDesde = computed(() => (this.escolhida() ? deDataIso(this.escolhida()!.vigenciaInicio) ?? undefined : undefined));
  protected readonly maxDesde = computed(() => (this.escolhida() ? deDataIso(this.escolhida()!.vigenciaFim) ?? undefined : undefined));
  protected readonly situacaoCobertura = coberturaNaApolice;
  protected readonly renovacao = signal<Apolice | null>(null);
  /** Toda a frota ativa (a renovação leva os outros veículos da apólice); até carregar, só este. */
  private readonly frotaAtiva = signal<VeiculoSeguro[]>([]);
  protected readonly veiculosDrawer = computed(() => (this.frotaAtiva().length ? this.frotaAtiva() : [this.veiculo()]));
  protected readonly moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  protected readonly apolices = signal<Apolice[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly carregandoFornecedores = signal(true);
  protected readonly painelAberto = signal(false);
  protected readonly emEdicao = signal<Apolice | null>(null);
  protected readonly processos = computed<GeoSelectOption<string>[]>(() => this.lookups.processes().map((p) => ({ label: p.label, value: p.value })));
  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.erro() ? 'error' : this.apolices().length ? 'ready' : 'empty'));

  protected readonly colunas: GeoDataTableColumn<Apolice>[] = [
    { key: 'apolice', header: 'Apólice', type: 'custom', priority: 1, value: (a) => a.numero, display: (a) => `${a.numero} ${a.seguradora ?? ''}` },
    { key: 'periodo', header: 'Este veículo', type: 'custom', priority: 1, value: (a) => this.cobertura(a)?.inicio, display: (a) => this.cobertura(a)?.inicio ?? '' },
    { key: 'vigencia', header: 'Vigência', type: 'custom', priority: 1, value: (a) => a.vigenciaFim, display: (a) => vigenciaApolice(a).rotulo }
  ];
  protected readonly chave = (a: Apolice) => a.id;

  constructor() {
    effect(() => {
      if (this.veiculo().idVeiculo) untracked(() => this.carregar());
    });
    // Ao escolher a apólice, a data sugerida é hoje (ou o início da vigência, se ela ainda não começou).
    effect(() => {
      const a = this.escolhida();
      untracked(() => {
        if (!a) return;
        const inicio = deDataIso(a.vigenciaInicio)!;
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        this.desde.set(inicio > hoje ? inicio : hoje);
      });
    });
  }

  protected abrirInclusao(): void {
    this.incluindo.set(true);
    this.apoliceEscolhida.set(null);
    this.desde.set(null);
    this.carregandoApolices.set(true);
    // Vigentes e a vencer (as vencidas não aceitam inclusão de hoje em diante).
    this.servico.listarApolices({}, { size: 100, sort: ['vigenciaFim,desc'] }).subscribe({
      next: (p) => {
        const hoje = paraDataIso(new Date())!;
        const id = this.veiculo().idVeiculo;
        this.candidatas.set(p.content.filter((a) => a.vigenciaFim >= hoje
          && !a.veiculos.some((c) => c.idVeiculo === id && (c.fim ?? a.vigenciaFim) >= hoje)));
        this.carregandoApolices.set(false);
      },
      error: (e) => {
        this.carregandoApolices.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected incluir(): void {
    const id = this.apoliceEscolhida();
    const desde = paraDataIso(this.desde());
    if (!id || !desde) return;
    this.gravando.set(true);
    this.servico.incluirVeiculo(id, this.veiculo().idVeiculo, desde, null).subscribe({
      next: (a) => {
        this.gravando.set(false);
        this.incluindo.set(false);
        this.notificacoes.success(`${formatarPlaca(this.veiculo().placa)} incluído na apólice ${a.numero} a partir de ${dataBr(desde)}.`);
        this.carregar();
      },
      error: (e) => {
        this.gravando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Período do veículo na apólice: o mais recente, se ele entrou e saiu mais de uma vez. */
  protected cobertura(a: Apolice): CoberturaApolice | undefined {
    return a.veiculos.filter((c) => c.idVeiculo === this.veiculo().idVeiculo).sort((x, y) => y.inicio.localeCompare(x.inicio))[0];
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    const id = this.veiculo().idVeiculo;
    this.servico.coberturaVeiculos().subscribe({
      next: (lista) => this.situacao.set(lista.find((c) => c.idVeiculo === id) ?? null),
      error: () => this.situacao.set(null)
    });
    this.servico.listarApolices({ idVeiculo: this.veiculo().idVeiculo }, { size: 100, sort: ['vigenciaFim,desc'] }).subscribe({
      next: (p) => {
        this.apolices.set(p.content);
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
    this.renovacao.set(null);
    this.emEdicao.set(null);
    this.painelAberto.set(true);
  }

  protected abrir(a: Apolice): void {
    this.carregarCatalogos();
    this.renovacao.set(null);
    this.emEdicao.set(a);
    this.painelAberto.set(true);
  }

  protected renovar(a: Apolice): void {
    this.emEdicao.set(null);
    this.renovacao.set(a);
  }

  protected aoSalvar(a: Apolice): void {
    if (this.painelAberto()) {
      this.renovacao.set(null);
      this.emEdicao.set(a);
    }
    this.carregar();
  }

  /** Seguradoras e setores só quando a pessoa vai cadastrar ou abrir uma apólice. */
  private carregarCatalogos(): void {
    if (this.fornecedores().length) return;
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => this.frotaAtiva.set(p.content.map((v) => ({ idVeiculo: v.idVeiculo, placa: v.placa, modelo: v.modelo }))),
      error: () => undefined
    });
    this.frota.fornecedoresOficina().subscribe({
      next: (f) => (this.fornecedores.set(f), this.carregandoFornecedores.set(false)),
      error: () => this.carregandoFornecedores.set(false)
    });
  }
}
