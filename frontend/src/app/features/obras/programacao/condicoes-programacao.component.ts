import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { GeoSelectComponent, GeoTextareaComponent } from '@geo/ui';
import { SituacaoIntervencao, TurnoProgramacao } from '../../../core/models/obras-programacao.models';
import { SIM_NAO, SITUACOES_INTERVENCAO, TURNOS } from './programacao.logic';

/** Condições exigidas da programação. Linha viva, desligamento e demais começam sem resposta: ninguém confirma por omissão. */
@Component({
  selector: 'app-condicoes-programacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoSelectComponent, GeoTextareaComponent],
  template: `
    <div class="geo-form-grid">
      <geo-select label="Linha viva" [required]="true" [options]="simNao" [(value)]="linhaViva" placeholder="Selecione"
        [error]="validar() && linhaViva() === null ? 'Informe se é em linha viva.' : undefined"></geo-select>
      <geo-select label="Desligamento" [required]="true" [options]="simNao" [(value)]="desligamento" placeholder="Selecione"
        [error]="validar() && desligamento() === null ? 'Informe se tem desligamento.' : undefined"></geo-select>
      <geo-select label="Finaliza obra" [required]="true" [options]="simNao" [(value)]="finalizaObra" placeholder="Selecione"
        [error]="validar() && finalizaObra() === null ? 'Informe se finaliza a obra.' : undefined"></geo-select>
      <geo-select label="Turno" [required]="true" [options]="turnos" [(value)]="turno" placeholder="Selecione"
        [error]="validar() && !turno() ? 'Informe o turno.' : undefined"></geo-select>
      <geo-select label="Situação da intervenção" [required]="true" [options]="situacoes" [(value)]="situacaoIntervencao" placeholder="Selecione"
        [error]="validar() && !situacaoIntervencao() ? 'Informe a situação da intervenção.' : undefined"></geo-select>
      <geo-textarea class="condicoes__larga" label="Observação" [showOptional]="true" [rows]="2" [maxlength]="1000" [(value)]="observacao"></geo-textarea>
    </div>
  `,
  styles: [`.condicoes__larga { grid-column: 1 / -1; }`]
})
export class CondicoesProgramacaoComponent {
  readonly validar = input(false);
  readonly linhaViva = model<boolean | null>(null);
  readonly desligamento = model<boolean | null>(null);
  readonly finalizaObra = model<boolean | null>(null);
  readonly turno = model<TurnoProgramacao | null>(null);
  readonly situacaoIntervencao = model<SituacaoIntervencao | null>(null);
  readonly observacao = model('');

  protected readonly simNao = SIM_NAO;
  protected readonly turnos = TURNOS;
  protected readonly situacoes = SITUACOES_INTERVENCAO;
}
