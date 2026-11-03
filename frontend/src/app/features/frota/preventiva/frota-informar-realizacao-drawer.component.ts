import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesDatepickerComponent,
  CesFormDrawerComponent,
  CesNumberInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { ControlePreventivo } from '../../../core/models/frota-preventiva.models';
import { formatarMedicao, formatarPlaca, rotuloValorAtual } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPreventivaService } from '../../../core/services/frota-preventiva.service';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';

/**
 * Revisão feita fora do sistema (concessionária, outra oficina): vira a base do plano no veículo e a
 * próxima conta a partir dela. Usado no acompanhamento e na ficha do veículo.
 */
@Component({
  selector: 'app-frota-informar-realizacao-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CesButtonComponent, CesCalloutComponent, CesDatepickerComponent, CesFormDrawerComponent, CesNumberInputComponent, CesTextareaComponent],
  styles: `
    .contexto { display: grid; gap: 0.125rem; padding: 0.75rem; border-radius: var(--ces-radius-md); background: var(--ces-surface-subtle); }
    .contexto__titulo { font-weight: 700; color: var(--ces-foreground); }
    .contexto__linha { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
  `,
  template: `
    <ces-form-drawer [(visible)]="visivel" title="Informar a última realização"
      [description]="controle() ? placa(controle()!.placa) + ' · ' + controle()!.plano : undefined"
      [dirty]="alterado()" [loading]="salvando()" size="sm">
      @if (controle(); as c) {
        <div class="ces-form-stack">
          <div class="contexto">
            <span class="contexto__titulo">Hoje conta a partir de {{ c.baseData | date: 'dd/MM/yyyy' }}{{ c.baseMedicao != null ? ' com ' + medicao(c.baseMedicao, c.unidade) : '' }}</span>
            <span class="contexto__linha">{{ c.baseOrigemRotulo }} · {{ rotuloAtual(c.unidade) }}: {{ medicao(c.medicaoAtual, c.unidade) }}</span>
          </div>
          <ces-callout tone="info" [dense]="true" icon="pi pi-info-circle">
            Para a revisão feita fora do sistema. Ela vira a base: a próxima conta a partir dela.
          </ces-callout>
          <ces-datepicker label="Quando foi feita" [required]="true" [value]="dataLocal(data())" [maxDate]="hoje"
            (valueChange)="data.set(dataIso($event))" [error]="tentou() && !data() ? 'Informe a data.' : undefined"></ces-datepicker>
          <ces-number-input [label]="c.unidade === 'HORAS' ? 'Horímetro na revisão' : 'KM na revisão'" [(value)]="valor" [min]="0"
            [suffix]="c.unidade === 'HORAS' ? ' h' : ' km'" [required]="exigeMedicao()"
            [showOptional]="!exigeMedicao()" [description]="descricaoMedicao()" [error]="erroMedicao()"></ces-number-input>
          <ces-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="1000" [showOptional]="true"
            placeholder="Ex.: Feita na concessionária, nota 1234"></ces-textarea>
        </div>
      }
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Registrar realização" [loading]="salvando()" (pressed)="registrar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaInformarRealizacaoDrawerComponent {
  private readonly preventiva = inject(FrotaPreventivaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly controle = input<ControlePreventivo | null>(null);
  /** A realização foi registrada: devolve o controle já recalculado. */
  readonly registrado = output<ControlePreventivo>();

  protected readonly placa = formatarPlaca;
  protected readonly medicao = formatarMedicao;
  protected readonly rotuloAtual = rotuloValorAtual;
  protected readonly dataIso = dataIso;
  protected readonly dataLocal = dataLocal;
  protected readonly hoje = new Date();

  protected readonly data = signal<string | null>(null);
  protected readonly valor = signal<number | null>(null);
  protected readonly observacao = signal('');
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);

  /** O backend exige a leitura quando o plano tem frequência pela medição do veículo. */
  protected readonly exigeMedicao = computed(() => {
    const c = this.controle();
    return !!c && (c.proximaMedicao != null || c.baseMedicao != null);
  });
  protected readonly alterado = computed(() => !!this.data() || this.valor() != null || !!this.observacao().trim());
  protected readonly descricaoMedicao = computed(() => {
    const c = this.controle();
    if (!c || c.medicaoAtual == null) return 'O valor do painel no dia, como aparece na nota da oficina.';
    return `O valor do painel no dia, como na nota da oficina. Até ${formatarMedicao(c.medicaoAtual, c.unidade)}, a leitura atual.`;
  });
  protected readonly erroMedicao = computed(() => {
    const c = this.controle();
    const v = this.valor();
    if (c && v != null && c.medicaoAtual != null && v > c.medicaoAtual) {
      return `Passa da leitura atual do veículo (${formatarMedicao(c.medicaoAtual, c.unidade)}).`;
    }
    return this.tentou() && this.exigeMedicao() && v == null ? 'Informe o valor do painel.' : undefined;
  });

  constructor() {
    // Cada abertura começa limpa.
    effect(() => {
      if (!this.visivel()) return;
      untracked(() => {
        this.data.set(null);
        this.valor.set(null);
        this.observacao.set('');
        this.tentou.set(false);
      });
    });
  }

  protected registrar(): void {
    const c = this.controle();
    if (!c) return;
    this.tentou.set(true);
    if (!this.data() || this.erroMedicao()) return;
    this.salvando.set(true);
    this.preventiva.informarRealizacao(c.id, {
      data: this.data()!,
      medicao: this.valor(),
      observacao: this.observacao().trim() || null
    }).subscribe({
      next: (atualizado) => {
        this.salvando.set(false);
        this.visivel.set(false);
        this.notificacoes.success(`${atualizado.plano} do ${formatarPlaca(atualizado.placa)}: ${atualizado.situacaoRotulo.toLowerCase()}, ${atualizado.falta}.`);
        this.registrado.emit(atualizado);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
