import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { Condutor, VinculoCondutor, paraInstanteIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';

/**
 * Troca o condutor responsável pelo veículo. Só aparecem condutores com CNH registrada;
 * o servidor confere validade e categoria e encerra o vínculo anterior no mesmo instante.
 */
@Component({
  selector: 'app-frota-vincular-condutor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent
  ],
  template: `
    <geo-form-drawer [(visible)]="visivel" title="Trocar condutor"
      [description]="'Veículo ' + placa() + '. A CNH e a categoria do novo condutor são conferidas ao salvar.'"
      [dirty]="!!idColaborador()" [loading]="salvando()" size="sm">
      <div class="geo-form-stack">
        @if (condutorAtual()) {
          <geo-callout tone="info" [dense]="true">
            Hoje o veículo está com {{ condutorAtual() }}. Esse vínculo é encerrado no início do novo.
          </geo-callout>
        }
        <geo-select label="Novo condutor" [required]="true" [options]="opcoes()" [(value)]="idColaborador" [filter]="true"
          [loading]="carregando()" description="Só aparecem colaboradores cadastrados em Condutores."
          [error]="erro()"></geo-select>
        <div class="geo-form-grid">
          <geo-datepicker label="Início" [required]="true" [(value)]="data" [maxDate]="hoje"></geo-datepicker>
          <geo-text-input label="Hora" [required]="true" [(value)]="hora" placeholder="HH:mm" [maxlength]="5"></geo-text-input>
        </div>
        <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="500" [showOptional]="true"></geo-textarea>
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></geo-button>
        <geo-button icon="pi pi-check" label="Confirmar troca" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaVincularCondutorComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly idVeiculo = input.required<string>();
  readonly placa = input('');
  readonly condutorAtual = input<string | null>(null);
  readonly vinculado = output<VinculoCondutor>();

  protected readonly hoje = new Date();
  protected readonly condutores = signal<Condutor[]>([]);
  protected readonly carregando = signal(false);
  protected readonly idColaborador = signal<string | null>(null);
  protected readonly data = signal<Date | null>(new Date());
  protected readonly hora = signal('');
  protected readonly observacao = signal('');
  protected readonly erro = signal<string | undefined>(undefined);
  protected readonly salvando = signal(false);

  protected readonly opcoes = computed<GeoSelectOption<string>[]>(() =>
    this.condutores().map((c) => ({
      label: `${c.nome ?? 'Sem nome'} — CNH ${c.cnhCategoria ?? '?'}${c.situacaoCnh === 'VENCIDO' ? ' (vencida)' : ''}`,
      value: c.idColaborador,
      disabled: c.situacaoCnh === 'VENCIDO'
    }))
  );

  constructor() {
    effect(() => {
      if (this.visivel()) {
        untracked(() => this.abrir());
      }
    });
  }

  private abrir(): void {
    const agora = new Date();
    this.idColaborador.set(null);
    this.data.set(agora);
    this.hora.set(`${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`);
    this.observacao.set('');
    this.erro.set(undefined);
    this.carregando.set(true);
    this.frota.listarCondutores({ ativo: true }, { ...PAGINA_OPCOES, sort: ['cnhValidade'] }).subscribe({
      next: (pagina) => {
        this.condutores.set(pagina.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected salvar(): void {
    const idColaborador = this.idColaborador();
    const data = this.data();
    const hora = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(this.hora().trim());
    if (!idColaborador) {
      this.erro.set('Escolha o condutor.');
      return;
    }
    if (!data || !hora) {
      this.erro.set('Informe data e hora (HH:mm) do início.');
      return;
    }
    const inicio = new Date(data);
    inicio.setHours(Number(hora[1]), Number(hora[2]), 0, 0);
    this.salvando.set(true);
    this.frota
      .vincularCondutor(this.idVeiculo(), {
        idColaborador,
        inicio: paraInstanteIso(inicio),
        observacao: this.observacao().trim() || null
      })
      .subscribe({
        next: (vinculo) => {
          this.salvando.set(false);
          this.notificacoes.success(`${vinculo.condutor ?? 'Condutor'} agora é o condutor do veículo.`);
          this.visivel.set(false);
          this.vinculado.emit(vinculo);
        },
        error: (e) => {
          this.salvando.set(false);
          this.erro.set(getErrorMessage(e));
        }
      });
  }
}
