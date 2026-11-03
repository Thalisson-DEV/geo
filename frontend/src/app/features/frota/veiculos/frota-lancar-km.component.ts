import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesDatepickerComponent,
  CesFormDrawerComponent,
  CesNumberInputComponent,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { LeituraOdometro, UnidadeMedicao, formatarMedicao, paraInstanteIso, sufixoUnidade } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

/** Lançamento manual de quilometragem ou de horas. O servidor recusa valor incoerente com o histórico. */
@Component({
  selector: 'app-frota-lancar-km',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCalloutComponent,
    CesDatepickerComponent,
    CesFormDrawerComponent,
    CesNumberInputComponent,
    CesTextInputComponent,
    CesTextareaComponent
  ],
  template: `
    <ces-form-drawer [(visible)]="visivel" [title]="horas() ? 'Lançar horas' : 'Lançar KM'"
      [description]="'Veículo ' + placa() + (horas() ? '. Informe as horas do horímetro' : '. Informe a quilometragem do painel') + '; valor incoerente com o histórico é recusado.'"
      [dirty]="km() !== null" [loading]="salvando()" size="sm">
      <div class="ces-form-stack">
        @if (kmAtual() != null) {
          <ces-callout tone="info" [dense]="true">{{ horas() ? 'Horímetro atual' : 'KM atual' }} registrado: {{ formatarMedicao(kmAtual(), unidade()) }}.</ces-callout>
        }
        <ces-number-input [label]="horas() ? 'Horas no horímetro' : 'Quilometragem'" [required]="true" [(value)]="km" [min]="0"
          [suffix]="' ' + sufixoUnidade(unidade())" [error]="erroKm()"></ces-number-input>
        <div class="ces-form-grid">
          <ces-datepicker label="Data da leitura" [required]="true" [(value)]="data" [maxDate]="hoje"></ces-datepicker>
          <ces-text-input label="Hora" [required]="true" [(value)]="hora" placeholder="HH:mm" [maxlength]="5" [error]="erroHora()"></ces-text-input>
        </div>
        @if (pedeJustificativa()) {
          <ces-callout tone="warning" [dense]="true" icon="pi pi-exclamation-triangle">
            O valor passa o último registrado mais que a trava do campo. Se está certo (ex.: viagem longa sem lançamentos), justifique para registrar.
          </ces-callout>
          <ces-textarea label="Justificativa" [required]="true" [(value)]="justificativa" [rows]="2" [maxlength]="400"
            placeholder="Ex.: Viagem a Salvador sem abastecimento no sistema."></ces-textarea>
        }
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Registrar leitura" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaLancarKmComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly idVeiculo = input.required<string>();
  readonly placa = input('');
  readonly kmAtual = input<number | null>(null);
  readonly unidade = input<UnidadeMedicao>('KM');
  readonly registrado = output<LeituraOdometro>();

  protected readonly hoje = new Date();
  protected readonly horas = computed(() => this.unidade() === 'HORAS');
  protected readonly formatarMedicao = formatarMedicao;
  protected readonly sufixoUnidade = sufixoUnidade;
  protected readonly km = signal<number | null>(null);
  protected readonly data = signal<Date | null>(new Date());
  protected readonly hora = signal('');
  protected readonly erroKm = signal<string | undefined>(undefined);
  protected readonly erroHora = signal<string | undefined>(undefined);
  protected readonly salvando = signal(false);
  protected readonly justificativa = signal('');
  /** O servidor pediu justificativa: o salto passa a trava, e o gestor confirma que está certo. */
  protected readonly pedeJustificativa = signal(false);

  constructor() {
    effect(() => {
      if (this.visivel()) {
        untracked(() => {
          const agora = new Date();
          this.km.set(null);
          // Só o dia: o datepicker descarta um instante posterior ao maxDate criado na abertura da tela.
          this.data.set(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()));
          this.hora.set(`${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`);
          this.erroKm.set(undefined);
          this.erroHora.set(undefined);
          this.justificativa.set('');
          this.pedeJustificativa.set(false);
        });
      }
    });
  }

  protected salvar(): void {
    const km = this.km();
    const data = this.data();
    const hora = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(this.hora().trim());
    this.erroKm.set(km === null ? (this.horas() ? 'Informe as horas do horímetro.' : 'Informe a quilometragem.') : undefined);
    this.erroHora.set(hora ? undefined : 'Use o formato HH:mm.');
    if (km === null || !data || !hora) return;
    const instante = new Date(data);
    instante.setHours(Number(hora[1]), Number(hora[2]), 0, 0);
    this.salvando.set(true);
    const justificativa = this.justificativa().trim() || null;
    if (this.pedeJustificativa() && !justificativa) {
      this.erroKm.set('Justifique o salto para registrar.');
      return;
    }
    this.frota.registrarLeitura(this.idVeiculo(), { km, lidoEm: paraInstanteIso(instante), justificativa }).subscribe({
      next: (leitura) => {
        this.salvando.set(false);
        this.notificacoes.success('Leitura registrada.');
        this.km.set(null);
        this.visivel.set(false);
        this.registrado.emit(leitura);
      },
      error: (erro) => {
        this.salvando.set(false);
        const mensagem = getErrorMessage(erro);
        if (/justificativa/i.test(mensagem)) this.pedeJustificativa.set(true);
        this.erroKm.set(mensagem);
      }
    });
  }
}
