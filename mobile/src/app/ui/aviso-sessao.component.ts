import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { ConnectivityService } from '../core/sync/connectivity.service';
import { IconeComponent } from './icone.component';

/**
 * Aviso de que o servidor encerrou a sessão do aparelho.
 *
 * Não bloqueia nada: o encarregado segue lançando e tudo fica salvo no aparelho. O aviso
 * só existe para que ele entre de novo quando tiver internet, e o envio volte a andar.
 * Sem rede, o botão não aparece — entrar precisa de conexão.
 */
@Component({
  selector: 'geo-aviso-sessao',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.reautenticacaoNecessaria()) {
      <section class="aviso" role="status" aria-live="polite">
        <geo-icone nome="alerta" [tamanho]="20" />
        <div class="texto">
          <strong>Entre novamente para enviar</strong>
          <span>
            Seus lançamentos estão salvos no aparelho.
            @if (rede.isOnline()) { Entre de novo para enviá-los. } @else { Quando tiver internet, entre de novo para enviá-los. }
          </span>
        </div>
        @if (rede.isOnline()) {
          <button type="button" class="geo-btn geo-btn--principal" (click)="auth.entrarNovamente()">Entrar</button>
        }
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .aviso { display: flex; align-items: center; gap: var(--geo-e3); margin: var(--geo-e3) var(--geo-e4) 0;
      padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-campo);
      background: var(--geo-atencao-suave); color: var(--geo-texto); }
    .aviso > geo-icone { color: var(--geo-atencao); flex: none; }
    .texto { flex: 1; display: grid; gap: 2px; font: var(--geo-t-corpo); }
    .texto span { color: var(--geo-texto-2); }
    button { flex: none; min-height: 48px; }
  `],
})
export class AvisoSessaoComponent {
  readonly auth = inject(AuthService);
  readonly rede = inject(ConnectivityService);
}
