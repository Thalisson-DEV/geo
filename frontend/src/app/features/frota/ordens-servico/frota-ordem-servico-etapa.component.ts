import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  CesButtonComponent,
  CesDatepickerComponent,
  CesFormDrawerComponent,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import { Observable } from 'rxjs';
import { OrdemServicoDetalhe, paraInstanteIso, rotuloOs } from '../../../core/models/frota.models';
import { fimDeHoje } from './frota-ordem-servico.util';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

export type EtapaOrdemServico = 'agendar' | 'iniciar' | 'previsao';

const TEXTOS: Record<EtapaOrdemServico, { titulo: string; descricao: string; botao: string; sucesso: string }> = {
  agendar: {
    titulo: 'Agendar manutenção',
    descricao: 'A oficina é avisada do agendamento. Reagendar substitui a data anterior.',
    botao: 'Agendar',
    sucesso: 'Manutenção agendada.'
  },
  iniciar: {
    titulo: 'Iniciar serviço',
    descricao: 'Registre quando o serviço começou de fato. A previsão de término alimenta o alerta de prazo.',
    botao: 'Iniciar serviço',
    sucesso: 'Serviço iniciado.'
  },
  previsao: {
    titulo: 'Alterar previsão de término',
    descricao: 'Uma nova previsão permite um novo aviso caso ela também seja ultrapassada.',
    botao: 'Salvar previsão',
    sucesso: 'Previsão atualizada.'
  }
};

/** Agendamento, início do serviço e nova previsão de término: etapas de uma ou duas datas. */
@Component({
  selector: 'app-frota-ordem-servico-etapa',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesButtonComponent, CesDatepickerComponent, CesFormDrawerComponent, CesTextInputComponent],
  styles: `.horarios { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: -0.25rem; }`,
  template: `
    <ces-form-drawer [(visible)]="visivel" [title]="textos().titulo"
      [description]="rotuloOs(ordem()?.ordem?.numero) + ' · ' + (ordem()?.ordem?.placa ?? '') + '. ' + textos().descricao"
      [dirty]="alterado()" [loading]="salvando()" size="sm">
      <!-- Só com o drawer aberto: fechar destrói os datepickers e o painel que eles anexam ao body. -->
      @if (visivel()) {
      <div class="ces-form-stack">
        @switch (etapa()) {
          @case ('agendar') {
            <ces-datepicker label="Data e hora" [required]="true" [(value)]="data" [showTime]="true" [error]="erro()"></ces-datepicker>
            <div class="horarios" role="group" aria-label="Horários rápidos">
              @for (s of sugestoes; track s.rotulo) {
                <ces-button size="sm" variant="outline" [label]="s.rotulo" (pressed)="data.set(s.data())"></ces-button>
              }
            </div>
            <ces-text-input label="Local" [(value)]="local" [maxlength]="200" [showOptional]="true"
              placeholder="Oficina, endereço ou base"></ces-text-input>
          }
          @case ('iniciar') {
            <ces-datepicker label="Início real" [required]="true" [(value)]="data" [showTime]="true" [maxDate]="agora" [error]="erro()"></ces-datepicker>
            <ces-datepicker label="Previsão de término" [(value)]="previsao" [showTime]="true" [clearable]="true" [showOptional]="true"></ces-datepicker>
          }
          @case ('previsao') {
            <ces-datepicker label="Nova previsão de término" [required]="true" [(value)]="previsao" [showTime]="true" [error]="erro()"></ces-datepicker>
          }
        }
      </div>
      }
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="textos().botao" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaOrdemServicoEtapaComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly etapa = input.required<EtapaOrdemServico>();
  readonly ordem = input<OrdemServicoDetalhe | null>(null);
  /** Agendar: data já escolhida fora do formulário (ex.: soltar a OS noutro dia do calendário). */
  readonly dataSugerida = input<Date | null>(null);
  readonly salvo = output<OrdemServicoDetalhe>();

  protected readonly rotuloOs = rotuloOs;
  /** Os horários mais comuns de levar à oficina, num clique. */
  protected readonly sugestoes = [
    { rotulo: 'Amanhã 08:00', data: () => proximoDia(1, 8) },
    { rotulo: 'Amanhã 13:00', data: () => proximoDia(1, 13) },
    { rotulo: 'Segunda 08:00', data: () => proximoDia(((8 - new Date().getDay()) % 7) || 7, 8) }
  ];
  /** Limite dos campos de data: o fim do dia de hoje (o servidor recusa o que estiver no futuro). */
  protected readonly agora = fimDeHoje();
  protected readonly textos = computed(() => TEXTOS[this.etapa()]);
  protected readonly data = signal<Date | null>(null);
  protected readonly previsao = signal<Date | null>(null);
  protected readonly local = signal('');
  protected readonly erro = signal<string | undefined>(undefined);
  protected readonly salvando = signal(false);
  private readonly assinatura = computed(() =>
    JSON.stringify([this.data()?.getTime() ?? null, this.previsao()?.getTime() ?? null, this.local().trim()])
  );
  private readonly inicial = signal('');
  protected readonly alterado = computed(() => this.assinatura() !== this.inicial());

  constructor() {
    effect(() => {
      if (this.visivel()) untracked(() => this.preparar());
    });
  }

  protected salvar(): void {
    const os = this.ordem()?.ordem;
    if (!os) return;
    let operacao: Observable<OrdemServicoDetalhe>;
    switch (this.etapa()) {
      case 'agendar':
        if (!this.data()) return this.erro.set('Informe a data do agendamento.');
        operacao = this.frota.agendarOrdemServico(os.id, paraInstanteIso(this.data()!), this.local().trim() || null);
        break;
      case 'iniciar':
        if (!this.data()) return this.erro.set('Informe o início real.');
        operacao = this.frota.iniciarOrdemServico(os.id, paraInstanteIso(this.data()!),
          this.previsao() ? paraInstanteIso(this.previsao()!) : null);
        break;
      default:
        if (!this.previsao()) return this.erro.set('Informe a nova previsão.');
        operacao = this.frota.alterarPrevisaoOrdemServico(os.id, paraInstanteIso(this.previsao()!));
    }
    this.erro.set(undefined);
    this.salvando.set(true);
    operacao.subscribe({
      next: (detalhe) => {
        this.salvando.set(false);
        this.inicial.set(this.assinatura());
        this.notificacoes.success(this.textos().sucesso);
        this.visivel.set(false);
        this.salvo.emit(detalhe);
      },
      error: (e) => {
        this.salvando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  private preparar(): void {
    const os = this.ordem()?.ordem;
    this.erro.set(undefined);
    // Sem local ainda, a oficina da OS é o lugar mais provável.
    this.local.set(os?.localAgendamento ?? os?.oficinaNome ?? '');
    switch (this.etapa()) {
      case 'agendar':
        this.data.set(this.dataSugerida() ?? (os?.agendadaPara ? new Date(os.agendadaPara) : null));
        break;
      case 'iniciar':
        this.data.set(new Date());
        this.previsao.set(null);
        break;
      default:
        this.previsao.set(os?.previsaoTermino ? new Date(os.previsaoTermino) : null);
    }
    this.inicial.set(this.assinatura());
  }
}

function proximoDia(dias: number, hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}
