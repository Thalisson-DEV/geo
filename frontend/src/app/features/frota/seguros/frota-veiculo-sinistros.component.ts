import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesIconButtonComponent,
  CesRowActionsDirective,
  CesStatusComponent
} from '@ces/ui';
import { Sinistro, situacaoSinistro } from '../../../core/models/frota-seguro.models';
import { Condutor, OpcoesFrota, rotuloOs } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { FrotaOrdemServicoFormComponent } from '../ordens-servico/frota-ordem-servico-form.component';
import { acessoFrota } from '../shared/frota-acesso';
import { VeiculoSeguro } from './frota-apolice-drawer.component';
import { FrotaSinistroDrawerComponent } from './frota-sinistro-drawer.component';

/** Aba Sinistros da ficha do veículo: o histórico do veículo e o registro com ele já escolhido. */
@Component({
  selector: 'app-frota-veiculo-sinistros',
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
    FrotaOrdemServicoFormComponent,
    FrotaSinistroDrawerComponent
  ],
  template: `
    <ces-data-table title="Sinistros do veículo" description="Do mais recente para o mais antigo, com a OS de reparo de cada um."
      storageKey="frota-veiculo-sinistros" exportFileName="sinistros-veiculo" searchPlaceholder="Filtrar nesta lista" [rowClickable]="true"
      [columns]="colunas" [rows]="sinistros()" [rowKey]="chave" [state]="estado()"
      [stateTitle]="erro() ? 'Não foi possível carregar os sinistros' : 'Nenhum sinistro registrado'"
      [stateDescription]="erro() ?? 'Acidentes, furtos, assaltos e cargas avariadas deste veículo aparecem aqui.'"
      (rowActivate)="abrir($event)">
      <ng-container table-actions>
        @if (podeRegistrar()) {
          <ces-button size="sm" icon="pi pi-plus" label="Registrar sinistro" (pressed)="novo()"></ces-button>
        }
      </ng-container>
      <ng-template cesCell="ocorrido" let-row>
        <span class="ces-cell-strong">{{ row.ocorridoEm | date: 'dd/MM/yyyy HH:mm' }}</span>
        <span class="ces-cell-muted">Sinistro {{ row.numero }}</span>
      </ng-template>
      <ng-template cesCell="tipo" let-row>
        <span class="ces-cell-strong">{{ row.tipoRotulo }}</span>
        <span class="ces-cell-muted">{{ row.condutor ?? 'Condutor não identificado' }}{{ row.culpaCondutor ? ' · com culpa' : '' }}</span>
      </ng-template>
      <ng-template cesCell="situacao" let-row>
        @let st = situacao(row.situacao);
        <ces-status [tone]="st.tom" [icon]="st.icone">{{ st.rotulo }}</ces-status>
        @if (row.reparo) { <span class="ces-cell-muted">{{ rotuloOs(row.reparo.numero) }} · {{ row.reparo.situacaoRotulo }}</span> }
      </ng-template>
      <ng-template cesRowActions let-row>
        <span class="ces-table-actions">
          <ces-icon-button icon="pi pi-angle-right" [label]="'Abrir o sinistro ' + row.numero" tooltip="Abrir" size="icon-sm" (pressed)="abrir(row)"></ces-icon-button>
        </span>
      </ng-template>
    </ces-data-table>

    <app-frota-sinistro-drawer [(visivel)]="painelAberto" [sinistro]="emEdicao()" [veiculos]="[veiculo()]" [idVeiculoFixo]="veiculo().idVeiculo"
      [condutores]="condutores()" [podeEditar]="acesso.editarSinistro()" [podeAbrirOs]="acesso.editarOs()"
      (salvo)="aoSalvar($event)" (abrirOs)="abrirOs($event)"></app-frota-sinistro-drawer>

    <app-frota-ordem-servico-form [(visivel)]="osAberta" [sinistro]="sinistroDaOs()" [opcoes]="opcoes()"
      (sinistroAtualizado)="aoAbrirOs($event)"></app-frota-ordem-servico-form>
  `
})
export class FrotaVeiculoSinistrosComponent {
  private readonly servico = inject(FrotaSeguroService);
  private readonly frota = inject(FrotaService);
  protected readonly acesso = acessoFrota();

  readonly veiculo = input.required<VeiculoSeguro>();
  readonly podeRegistrar = input(false);

  protected readonly situacao = situacaoSinistro;
  protected readonly rotuloOs = rotuloOs;
  protected readonly sinistros = signal<Sinistro[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly condutores = signal<Condutor[]>([]);
  protected readonly opcoes = signal<OpcoesFrota | null>(null);
  protected readonly painelAberto = signal(false);
  protected readonly emEdicao = signal<Sinistro | null>(null);
  protected readonly osAberta = signal(false);
  protected readonly sinistroDaOs = signal<Sinistro | null>(null);
  protected readonly estado = computed(() => (this.carregando() ? 'loading' : this.erro() ? 'error' : this.sinistros().length ? 'ready' : 'empty'));

  protected readonly colunas: CesDataTableColumn<Sinistro>[] = [
    { key: 'ocorrido', header: 'Quando', type: 'custom', priority: 1, value: (s) => s.ocorridoEm, display: (s) => s.ocorridoEm },
    { key: 'tipo', header: 'Tipo e condutor', type: 'custom', priority: 1, value: (s) => s.tipo, display: (s) => s.tipoRotulo },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 1, value: (s) => s.situacao, display: (s) => s.situacaoRotulo }
  ];
  protected readonly chave = (s: Sinistro) => s.id;

  constructor() {
    effect(() => {
      if (this.veiculo().idVeiculo) untracked(() => this.carregar());
    });
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.listarSinistros({ idVeiculo: this.veiculo().idVeiculo }, { size: 100, sort: ['ocorridoEm,desc'] }).subscribe({
      next: (p) => {
        this.sinistros.set(p.content);
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
    this.painelAberto.set(true);
  }

  protected abrir(s: Sinistro): void {
    this.carregarCatalogos();
    this.emEdicao.set(s);
    this.painelAberto.set(true);
  }

  protected aoSalvar(s: Sinistro): void {
    if (this.painelAberto()) this.emEdicao.set(s);
    this.carregar();
  }

  protected abrirOs(s: Sinistro): void {
    this.sinistroDaOs.set(s);
    this.painelAberto.set(false);
    this.osAberta.set(true);
  }

  protected aoAbrirOs(s: Sinistro): void {
    this.carregar();
    this.abrir(s);
  }

  /** Condutores e listas da OS só quando a pessoa vai registrar ou abrir um sinistro. */
  private carregarCatalogos(): void {
    if (this.opcoes()) return;
    this.frota.listarCondutores({ ativo: true }, { ...PAGINA_OPCOES, sort: ['cnhValidade'] }).subscribe({
      next: (p) => this.condutores.set([...p.content].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''))),
      error: () => undefined
    });
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
  }
}
