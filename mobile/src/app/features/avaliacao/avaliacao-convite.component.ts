import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, input } from '@angular/core';
import { AvaliacaoService } from '../../core/avaliacao/avaliacao.service';

/**
 * Marca a tela Hoje como lugar onde o convite da avaliação pode subir.
 *
 * <p>Não desenha nada: o convite é a própria folha da avaliação (no shell), que sobe pequena
 * e cresce até o formulário quando a pessoa decide responder. Este marcador existe para que
 * ela só suba no Hoje — nunca no meio de uma execução, de uma solicitação ou de um
 * formulário — e não suba quando há lançamento pela metade para retomar.</p>
 */
@Component({
  selector: 'app-avaliacao-convite',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class AvaliacaoConviteComponent implements OnDestroy {
  private readonly avaliacao = inject(AvaliacaoService);

  /** Falso quando a tela tem algo mais urgente (lançamento pela metade). */
  readonly ativo = input(true);

  constructor() {
    effect(() => this.avaliacao.conviteNaTela.set(this.ativo()));
  }

  ngOnDestroy(): void {
    this.avaliacao.conviteNaTela.set(false);
  }
}
