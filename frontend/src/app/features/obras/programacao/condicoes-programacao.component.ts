import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { GeoSelectComponent, GeoTextInputComponent, GeoTextareaComponent } from '@geo/ui';
import { SituacaoIntervencao, TurnoProgramacao } from '../../../core/models/obras-programacao.models';
import { SIM_NAO, SITUACOES_INTERVENCAO, TURNOS } from './programacao.logic';

/** Condições exigidas da programação. Linha viva, desligamento e demais começam sem resposta: ninguém confirma por omissão. */
@Component({
  selector: 'app-condicoes-programacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoSelectComponent, GeoTextInputComponent, GeoTextareaComponent],
  template: `
    <div class="geo-form-grid">
      <geo-select label="Linha viva" [required]="true" [options]="simNao" [(value)]="linhaViva" placeholder="Selecione"
        [error]="validar() && linhaViva() === null ? 'Informe se é em linha viva.' : undefined"></geo-select>
      <geo-select label="Desligamento" [required]="true" [options]="simNao" [(value)]="desligamento" placeholder="Selecione"
        [error]="validar() && desligamento() === null ? 'Informe se tem desligamento.' : undefined"></geo-select>
      @if (desligamento() === true) {
        <geo-text-input label="Início do desligamento" [showOptional]="true" placeholder="08:00" [maxlength]="5"
          description="Para a equipe se organizar." [(value)]="horaDesligamentoInicio"
          [error]="erroHora(horaDesligamentoInicio())"></geo-text-input>
        <geo-text-input label="Fim do desligamento" [showOptional]="true" placeholder="12:00" [maxlength]="5"
          [(value)]="horaDesligamentoFim" [error]="erroHora(horaDesligamentoFim()) ?? erroJanela()"></geo-text-input>
        <geo-text-input label="Número da manobra" [showOptional]="true" [maxlength]="50" [(value)]="numeroManobra"></geo-text-input>
      }
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
  readonly horaDesligamentoInicio = model('');
  readonly horaDesligamentoFim = model('');
  readonly numeroManobra = model('');

  protected readonly simNao = SIM_NAO;
  protected readonly turnos = TURNOS;
  protected readonly situacoes = SITUACOES_INTERVENCAO;

  protected erroHora(valor: string): string | undefined {
    return valor.trim() && !horaValida(valor) ? 'Use o formato 08:00.' : undefined;
  }

  protected erroJanela(): string | undefined {
    const [inicio, fim] = [this.horaDesligamentoInicio().trim(), this.horaDesligamentoFim().trim()];
    return horaValida(inicio) && horaValida(fim) && fim <= inicio ? 'O fim deve ser depois do início.' : undefined;
  }
}

/** HH:mm de 00:00 a 23:59. */
export function horaValida(valor: string | null | undefined): boolean {
  return !!valor && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor.trim());
}

/** Campos do desligamento para a API: só com desligamento e com hora válida. */
export function camposDesligamento(desligamento: boolean, inicio: string, fim: string, manobra: string) {
  return {
    horaDesligamentoInicio: desligamento && horaValida(inicio) ? inicio.trim() : null,
    horaDesligamentoFim: desligamento && horaValida(fim) ? fim.trim() : null,
    numeroManobra: desligamento && manobra.trim() ? manobra.trim() : null
  };
}
