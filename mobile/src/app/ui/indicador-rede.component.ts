import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { ConnectivityService } from '../core/sync/connectivity.service';
import { IconeComponent } from './icone.component';

/** Pílula discreta de conexão. Sem rede não é erro: o app segue salvando no aparelho. */
@Component({
  selector: 'geo-indicador-rede',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="pilula" [class.off]="!online()" (click)="tocar.emit()"
      [attr.aria-label]="'Conexão: ' + texto()">
      @if (online()) { <span class="ponto" aria-hidden="true"></span> } @else { <geo-icone nome="sem_rede" [tamanho]="16" /> }
      <span class="texto" aria-hidden="true">{{ texto() }}</span>
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }
    /* Tela estreita e tudo bem: só o ponto verde. Sem rede, o texto volta (é quando importa). */
    @media (max-width: 430px) {
      .pilula:not(.off) { width: 36px; padding: 0; justify-content: center; }
      .pilula:not(.off) .texto { display: none; }
    }
    .pilula { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: var(--geo-r-pilula);
      border: 1px solid var(--geo-linha); background: var(--geo-superficie); color: var(--geo-texto-2);
      font: 500 .8125rem/1 var(--geo-fonte); white-space: nowrap; cursor: pointer; }
    .pilula.off { color: var(--geo-atencao); border-color: transparent; background: var(--geo-atencao-suave); }
    .ponto { width: 8px; height: 8px; border-radius: 50%; background: var(--geo-ok); }
  `],
})
export class IndicadorRedeComponent {
  private readonly rede = inject(ConnectivityService);
  readonly tocar = output<void>();
  readonly online = computed(() => this.rede.isOnline());
  readonly texto = computed(() => {
    switch (this.rede.statusConexao()) {
      case 'online': return 'Online';
      case 'dados_moveis_bloqueados': return 'Só Wi-Fi';
      case 'offline_manual': return 'Modo offline';
      default: return 'Sem internet';
    }
  });
}
