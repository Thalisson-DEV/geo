import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesDatepickerComponent,
  CesFormDrawerComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import {
  LeituraOdometro,
  ROTULO_UNIDADE,
  UnidadeMedicao,
  formatarMedicao,
  nomeMedidor,
  paraInstanteIso,
  sufixoUnidade
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

/**
 * Troca do painel (odômetro ou horímetro). Fecha o painel antigo com o último valor e abre o
 * novo; as leituras seguintes só são comparadas com o painel novo e o acumulado é mantido.
 */
@Component({
  selector: 'app-frota-trocar-painel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCalloutComponent,
    CesDatepickerComponent,
    CesFormDrawerComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesTextInputComponent,
    CesTextareaComponent
  ],
  template: `
    <ces-form-drawer [(visible)]="visivel" title="Trocar painel"
      [description]="'Veículo ' + placa() + '. Use quando o ' + nomeMedidor(unidadeAtual()).toLowerCase() + ' for trocado ou zerado.'"
      [dirty]="alterado()" [loading]="salvando()" size="sm">
      <div class="ces-form-stack">
        <ces-callout tone="info" [dense]="true">
          As leituras depois da troca são comparadas só com o painel novo. O histórico antigo continua valendo
          e o acumulado do veículo soma o que o painel antigo já marcava.
        </ces-callout>
        <ces-number-input label="Último valor do painel antigo" [required]="true" [(value)]="fechamento" [min]="0"
          [suffix]="' ' + sufixoUnidade(unidadeAtual())" [error]="erroFechamento()"
          [description]="valorAtual() != null ? 'Última leitura válida: ' + formatarMedicao(valorAtual(), unidadeAtual()) + '.' : undefined"></ces-number-input>
        <ces-select label="Unidade do painel novo" [options]="unidades" [(value)]="unidadeNova"
          [description]="mudaUnidade() ? 'O acumulado recomeça na unidade nova.' : undefined"></ces-select>
        <ces-number-input label="Valor inicial do painel novo" [required]="true" [(value)]="inicial" [min]="0"
          [suffix]="' ' + sufixoUnidade(unidadeNova())" [error]="erroInicial()"></ces-number-input>
        <div class="ces-form-grid">
          <ces-datepicker label="Data da troca" [required]="true" [(value)]="data" [maxDate]="hoje"></ces-datepicker>
          <ces-text-input label="Hora" [required]="true" [(value)]="hora" placeholder="HH:mm" [maxlength]="5" [error]="erroHora()"></ces-text-input>
        </div>
        <ces-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="300" [showOptional]="true"
          placeholder="Ex.: painel queimado, trocado na oficina da base"></ces-textarea>
        @if (acumuladoPrevisto() != null) {
          <ces-callout tone="neutral" [dense]="true">
            Depois da troca, o acumulado do veículo será {{ formatarMedicao(acumuladoPrevisto(), unidadeNova()) }}.
          </ces-callout>
        }
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Registrar troca" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaTrocarPainelComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly idVeiculo = input.required<string>();
  readonly placa = input('');
  readonly unidadeAtual = input<UnidadeMedicao>('KM');
  readonly valorAtual = input<number | null>(null);
  readonly acumuladoAtual = input<number | null>(null);
  readonly registrado = output<LeituraOdometro>();

  protected readonly hoje = new Date();
  protected readonly nomeMedidor = nomeMedidor;
  protected readonly sufixoUnidade = sufixoUnidade;
  protected readonly formatarMedicao = formatarMedicao;
  protected readonly unidades: CesSelectOption<UnidadeMedicao>[] = (['KM', 'HORAS'] as const).map((u) => ({
    label: ROTULO_UNIDADE[u],
    value: u
  }));

  protected readonly fechamento = signal<number | null>(null);
  protected readonly inicial = signal<number | null>(0);
  protected readonly unidadeNova = signal<UnidadeMedicao | null>('KM');
  protected readonly data = signal<Date | null>(new Date());
  protected readonly hora = signal('');
  protected readonly observacao = signal('');
  protected readonly tentouSalvar = signal(false);
  protected readonly erroServidor = signal<string | undefined>(undefined);
  protected readonly salvando = signal(false);

  protected readonly mudaUnidade = computed(() => this.unidadeNova() !== this.unidadeAtual());

  private readonly erros = computed(() => {
    const fechamento = this.fechamento();
    const inicial = this.inicial();
    const atual = this.valorAtual();
    return {
      fechamento:
        fechamento === null
          ? 'Informe o último valor do painel antigo.'
          : atual != null && fechamento < atual
            ? `Não pode ser menor que a última leitura válida (${formatarMedicao(atual, this.unidadeAtual())}).`
            : undefined,
      inicial:
        inicial === null
          ? 'Informe o valor inicial do painel novo.'
          : !this.mudaUnidade() && fechamento !== null && inicial > fechamento
            ? 'O painel novo não pode começar acima do último valor do antigo.'
            : undefined,
      hora: /^([01]\d|2[0-3]):([0-5]\d)$/.test(this.hora().trim()) ? undefined : 'Use o formato HH:mm.'
    };
  });

  protected readonly erroFechamento = computed(() =>
    this.tentouSalvar() ? (this.erros().fechamento ?? this.erroServidor()) : this.erroServidor()
  );
  protected readonly erroInicial = computed(() => (this.tentouSalvar() ? this.erros().inicial : undefined));
  protected readonly erroHora = computed(() => (this.tentouSalvar() ? this.erros().hora : undefined));

  /** Acumulado logo depois da troca: o que o veículo já tinha mais o que o painel antigo rodou além da última leitura. */
  protected readonly acumuladoPrevisto = computed(() => {
    const fechamento = this.fechamento();
    const inicial = this.inicial();
    if (fechamento === null || inicial === null || this.erros().fechamento || this.erros().inicial) return null;
    if (this.mudaUnidade()) return inicial;
    const acumulado = this.acumuladoAtual() ?? this.valorAtual() ?? 0;
    const valor = this.valorAtual() ?? 0;
    return acumulado + (fechamento - valor);
  });

  protected readonly alterado = computed(
    () => this.fechamento() !== this.valorAtual() || this.inicial() !== 0 || !!this.observacao().trim()
  );

  constructor() {
    effect(() => {
      if (this.visivel()) {
        untracked(() => {
          const agora = new Date();
          this.fechamento.set(this.valorAtual());
          this.inicial.set(0);
          this.unidadeNova.set(this.unidadeAtual());
          // Só o dia: o datepicker descarta um instante posterior ao maxDate criado na abertura da tela.
          this.data.set(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()));
          this.hora.set(`${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`);
          this.observacao.set('');
          this.tentouSalvar.set(false);
          this.erroServidor.set(undefined);
        });
      }
    });
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    this.erroServidor.set(undefined);
    const e = this.erros();
    const fechamento = this.fechamento();
    const inicial = this.inicial();
    const data = this.data();
    const hora = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(this.hora().trim());
    if (e.fechamento || e.inicial || e.hora || fechamento === null || inicial === null || !data || !hora) return;
    const instante = new Date(data);
    instante.setHours(Number(hora[1]), Number(hora[2]), 0, 0);
    this.salvando.set(true);
    this.frota
      .trocarPainel(this.idVeiculo(), {
        valorFechamento: fechamento,
        valorInicial: inicial,
        unidade: this.unidadeNova(),
        lidoEm: paraInstanteIso(instante),
        observacao: this.observacao().trim() || null
      })
      .subscribe({
        next: (troca) => {
          this.salvando.set(false);
          this.notificacoes.success('Troca de painel registrada.');
          this.visivel.set(false);
          this.registrado.emit(troca);
        },
        error: (erro) => {
          this.salvando.set(false);
          this.erroServidor.set(getErrorMessage(erro));
        }
      });
  }
}
