import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { LookupStore } from '../../../core/lookup';
import {
  Combustivel,
  OpcoesFrota,
  ProvedorTelemetria,
  RegimeVeiculo,
  SituacaoOperacional,
  ROTULO_UNIDADE,
  TipoVeiculo,
  UnidadeMedicao,
  VeiculoFrotaDetalhe,
  VeiculoFrotaRequest,
  deDataIso,
  paraDataIso
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

/** Cadastro e edição do veículo: dados do RH (placa, modelo, base) e ficha da frota. */
@Component({
  selector: 'app-frota-veiculo-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  template: `
    <geo-form-drawer
      [(visible)]="visivel"
      [title]="veiculo() ? 'Editar ficha' : 'Novo veículo'"
      [description]="(veiculo() ? 'Veículo ' + veiculo()!.placa + '. ' : '') + 'Placa, modelo e base ficam no cadastro geral de veículos; o restante é a ficha da frota.'"
      [dirty]="alterado()"
      [loading]="salvando()"
      size="lg"
    >
      <geo-form-section title="Identificação" icon="pi pi-car">
        <div class="geo-form-grid">
          <geo-text-input label="Placa" [required]="true" [(value)]="placa" placeholder="ABC1D23" [maxlength]="10"
            [error]="erro('placa')"></geo-text-input>
          <geo-text-input label="Marca / fabricante" [required]="true" [(value)]="fabricante" [maxlength]="50"
            [error]="erro('fabricante')"></geo-text-input>
          <geo-text-input label="Modelo" [required]="true" [(value)]="modelo" [maxlength]="100"
            [error]="erro('modelo')"></geo-text-input>
          <geo-select label="Base operacional" [required]="true" [options]="bases()" [(value)]="idBase" [filter]="true"
            [error]="erro('idBase')"></geo-select>
          <geo-select label="Tipo de veículo" [options]="tipos()" [(value)]="idTipo" [filter]="true" [clearable]="true"
            [showOptional]="true"></geo-select>
          <geo-select label="Situação" [options]="situacoes()" [(value)]="situacao"></geo-select>
        </div>
      </geo-form-section>

      <geo-form-section title="Dados do veículo" icon="pi pi-id-card">
        <div class="geo-form-grid">
          <geo-number-input label="Ano de fabricação" [(value)]="anoFabricacao" [useGrouping]="false" [min]="1950"
            [showOptional]="true"></geo-number-input>
          <geo-number-input label="Ano do modelo" [(value)]="anoModelo" [useGrouping]="false" [min]="1950"
            [showOptional]="true"></geo-number-input>
          <geo-text-input label="Chassi" [(value)]="chassi" [maxlength]="30" [showOptional]="true"></geo-text-input>
          <geo-text-input label="Renavam" [(value)]="renavam" [maxlength]="20" [showOptional]="true"></geo-text-input>
          <geo-text-input label="Cor" [(value)]="cor" [maxlength]="40" [showOptional]="true"></geo-text-input>
          <geo-select label="Combustível" [options]="combustiveis()" [(value)]="combustivel" [clearable]="true"
            [showOptional]="true"></geo-select>
          <geo-number-input label="Tanque (litros)" [(value)]="capacidadeTanque" [min]="0" [maxFractionDigits]="2"
            [showOptional]="true"></geo-number-input>
          <geo-number-input label="Consumo de referência (km/l)" [(value)]="consumoReferencia" [min]="0" [maxFractionDigits]="2"
            description="Usado para conferir se os abastecimentos estão coerentes." [showOptional]="true"></geo-number-input>
          <geo-select label="Controle de uso" [options]="unidades" [(value)]="unidadeMedicao"
            [disabled]="unidadeTravada()"
            [description]="unidadeTravada()
              ? 'O veículo já tem leituras. Para mudar entre km e horas, use Trocar painel na ficha.'
              : 'Compressores e retroescavadeiras costumam ser controlados por horas.'"></geo-select>
        </div>
      </geo-form-section>

      <geo-form-section title="Propriedade" icon="pi pi-briefcase">
        <div class="geo-form-grid">
          <geo-select label="Regime" [options]="regimes()" [(value)]="regime"></geo-select>
          @if (regime() === 'LOCADO') {
            <geo-text-input label="Locadora" [required]="true" [(value)]="locadora" [maxlength]="150"
              [error]="erro('locadora')"></geo-text-input>
            <geo-number-input label="Custo mensal da locação" mode="currency" [(value)]="custoLocacao" [min]="0"
              [showOptional]="true"></geo-number-input>
            <geo-datepicker label="Início da locação" [(value)]="inicioLocacao" [clearable]="true" [showOptional]="true"></geo-datepicker>
            <geo-datepicker label="Fim da locação" [(value)]="fimLocacao" [clearable]="true" [showOptional]="true"
              [error]="erro('fimLocacao')"></geo-datepicker>
          }
        </div>
      </geo-form-section>

      <geo-form-section title="Observação" icon="pi pi-comment">
        <geo-textarea label="Observação" [labelVisible]="false" [(value)]="observacao" [rows]="3" [maxlength]="1000"></geo-textarea>
      </geo-form-section>

      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></geo-button>
        <geo-button icon="pi pi-check" [label]="veiculo() ? 'Salvar alterações' : 'Cadastrar veículo'"
          [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaVeiculoFormComponent {
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly veiculo = input<VeiculoFrotaDetalhe | null>(null);
  readonly opcoes = input<OpcoesFrota | null>(null);
  readonly tiposVeiculo = input<TipoVeiculo[]>([]);
  readonly salvo = output<VeiculoFrotaDetalhe>();

  protected readonly placa = signal('');
  protected readonly modelo = signal('');
  protected readonly fabricante = signal('');
  protected readonly idBase = signal<string | null>(null);
  protected readonly idTipo = signal<string | null>(null);
  protected readonly situacao = signal<SituacaoOperacional | null>('ATIVO');
  protected readonly anoFabricacao = signal<number | null>(null);
  protected readonly anoModelo = signal<number | null>(null);
  protected readonly chassi = signal('');
  protected readonly renavam = signal('');
  protected readonly cor = signal('');
  protected readonly combustivel = signal<Combustivel | null>(null);
  protected readonly capacidadeTanque = signal<number | null>(null);
  protected readonly consumoReferencia = signal<number | null>(null);
  protected readonly regime = signal<RegimeVeiculo | null>('PROPRIO');
  protected readonly locadora = signal('');
  protected readonly custoLocacao = signal<number | null>(null);
  protected readonly inicioLocacao = signal<Date | null>(null);
  protected readonly fimLocacao = signal<Date | null>(null);
  /** O rastreador casa sozinho pela placa: não aparece no formulário, só volta como estava. */
  protected readonly provedor = signal<ProvedorTelemetria | null>(null);
  protected readonly idRastreador = signal('');
  protected readonly observacao = signal('');
  protected readonly unidadeMedicao = signal<UnidadeMedicao | null>('KM');
  protected readonly unidades: GeoSelectOption<UnidadeMedicao>[] = (['KM', 'HORAS'] as const).map((u) => ({
    label: ROTULO_UNIDADE[u],
    value: u
  }));
  /** Com leituras, a unidade só muda por troca de painel. */
  protected readonly unidadeTravada = computed(() => this.veiculo()?.kmAtual != null);

  protected readonly salvando = signal(false);
  protected readonly tentouSalvar = signal(false);
  private readonly snapshot = signal('');

  protected readonly bases = computed<GeoSelectOption<string>[]>(() =>
    this.lookups.operationalBases().map((b) => ({ label: b.label, value: b.value }))
  );
  protected readonly tipos = computed<GeoSelectOption<string>[]>(() =>
    this.tiposVeiculo()
      .filter((t) => t.ativo || t.id === this.veiculo()?.tipoVeiculo?.id)
      .map((t) => ({ label: t.nome, value: t.id }))
  );
  protected readonly situacoes = computed(() => this.paraOpcoes(this.opcoes()?.situacoes));
  protected readonly regimes = computed(() => this.paraOpcoes(this.opcoes()?.regimes));
  protected readonly combustiveis = computed(() => this.paraOpcoes(this.opcoes()?.combustiveis));

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.placa().trim()) e['placa'] = 'Informe a placa.';
    if (this.modelo().trim().length < 3) e['modelo'] = 'Informe o modelo (mínimo 3 caracteres).';
    if (this.fabricante().trim().length < 3) e['fabricante'] = 'Informe a marca (mínimo 3 caracteres).';
    if (!this.idBase()) e['idBase'] = 'Escolha a base operacional.';
    if (this.regime() === 'LOCADO' && !this.locadora().trim()) e['locadora'] = 'Informe a locadora do veículo locado.';
    const inicio = this.inicioLocacao();
    const fim = this.fimLocacao();
    if (inicio && fim && fim < inicio) e['fimLocacao'] = 'O fim não pode ser antes do início.';
    return e;
  });

  protected readonly alterado = computed(() => this.snapshot() !== JSON.stringify(this.montarRequest()));

  constructor() {
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    // Recarrega o formulário toda vez que o drawer abre.
    effect(() => {
      if (this.visivel()) {
        const veiculo = this.veiculo();
        untracked(() => this.preencher(veiculo));
      }
    });
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) {
      this.notificacoes.warning('Revise os campos destacados antes de salvar.');
      return;
    }
    this.salvando.set(true);
    this.frota.salvarVeiculo(this.montarRequest(), this.veiculo()?.idVeiculo).subscribe({
      next: (salvo) => {
        this.salvando.set(false);
        this.notificacoes.success(this.veiculo() ? 'Veículo atualizado.' : `Veículo ${salvo.placa} cadastrado.`);
        this.snapshot.set(JSON.stringify(this.montarRequest()));
        this.visivel.set(false);
        this.salvo.emit(salvo);
      },
      error: (erro) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(erro));
      }
    });
  }

  private preencher(v: VeiculoFrotaDetalhe | null): void {
    this.tentouSalvar.set(false);
    this.placa.set(v?.placa ?? '');
    this.modelo.set(v?.modelo ?? '');
    this.fabricante.set(v?.fabricante ?? '');
    this.idBase.set(v?.idBaseOperacional ?? null);
    this.idTipo.set(v?.tipoVeiculo?.id ?? null);
    this.situacao.set(v?.situacao ?? 'ATIVO');
    this.anoFabricacao.set(v?.anoFabricacao ?? null);
    this.anoModelo.set(v?.anoModelo ?? null);
    this.chassi.set(v?.chassi ?? '');
    this.renavam.set(v?.renavam ?? '');
    this.cor.set(v?.cor ?? '');
    this.combustivel.set(v?.combustivel ?? null);
    this.capacidadeTanque.set(v?.capacidadeTanqueLitros ?? null);
    this.consumoReferencia.set(v?.consumoReferenciaKmL ?? null);
    this.regime.set(v?.regime ?? 'PROPRIO');
    this.locadora.set(v?.locadora ?? '');
    this.custoLocacao.set(v?.custoMensalLocacao ?? null);
    this.inicioLocacao.set(deDataIso(v?.inicioLocacao));
    this.fimLocacao.set(deDataIso(v?.fimLocacao));
    this.provedor.set(v?.provedorTelemetria ?? null);
    this.idRastreador.set(v?.idRastreador ?? '');
    this.observacao.set(v?.observacao ?? '');
    this.unidadeMedicao.set(v?.unidadeMedicao ?? 'KM');
    this.snapshot.set(JSON.stringify(this.montarRequest()));
  }

  private montarRequest(): VeiculoFrotaRequest {
    const texto = (valor: string) => (valor.trim() ? valor.trim() : null);
    const locado = this.regime() === 'LOCADO';
    return {
      placa: this.placa().trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
      modelo: this.modelo().trim(),
      fabricante: this.fabricante().trim(),
      idBaseOperacional: this.idBase() ?? '',
      idTipoVeiculo: this.idTipo(),
      anoFabricacao: this.anoFabricacao(),
      anoModelo: this.anoModelo(),
      chassi: texto(this.chassi()),
      renavam: texto(this.renavam()),
      cor: texto(this.cor()),
      combustivel: this.combustivel(),
      capacidadeTanqueLitros: this.capacidadeTanque(),
      consumoReferenciaKmL: this.consumoReferencia(),
      situacao: this.situacao(),
      regime: this.regime(),
      locadora: locado ? texto(this.locadora()) : null,
      custoMensalLocacao: locado ? this.custoLocacao() : null,
      inicioLocacao: locado ? paraDataIso(this.inicioLocacao()) : null,
      fimLocacao: locado ? paraDataIso(this.fimLocacao()) : null,
      provedorTelemetria: this.provedor(),
      idRastreador: texto(this.idRastreador()),
      observacao: texto(this.observacao()),
      unidadeMedicao: this.unidadeTravada() ? null : this.unidadeMedicao()
    };
  }

  private paraOpcoes<T extends string>(lista?: { valor: T; rotulo: string }[]): GeoSelectOption<T>[] {
    return (lista ?? []).map((o) => ({ label: o.rotulo, value: o.valor }));
  }
}
