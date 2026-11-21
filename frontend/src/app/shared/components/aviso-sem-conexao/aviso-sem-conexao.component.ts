import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { LeiturasOfflineService } from '../../../core/offline/leituras-offline.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';

const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Aviso de rede para o administrativo: aparece em qualquer tela, inclusive as de tela cheia (ficha da obra), quando o
 * navegador perde a conexão ou quando a tela está mostrando consultas guardadas. Diz o que continua valendo (o que já
 * foi aberto) e o que não (nada é salvo sem rede), para ninguém achar que gravou.
 */
@Component({
  selector: 'app-aviso-sem-conexao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (texto(); as t) {
      <div class="aviso" role="status" aria-live="polite">
        <i class="pi pi-wifi aviso__icone" aria-hidden="true"></i>
        <span><strong>{{ t.titulo }}</strong> {{ t.detalhe }}</span>
      </div>
    }
  `,
  styles: `
    .aviso {
      position: fixed;
      left: 50%;
      bottom: 1rem;
      z-index: 70;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 0.5rem;
      max-width: min(40rem, calc(100vw - 2rem));
      padding: 0.5rem 0.875rem;
      border: 1px solid var(--geo-warning-border);
      border-radius: var(--geo-radius-lg);
      /* No escuro o tom suave é translúcido: a base opaca evita o texto da tela aparecer por baixo. */
      background: linear-gradient(var(--geo-warning-soft), var(--geo-warning-soft)), var(--geo-surface-raised);
      color: var(--geo-warning-text);
      font-size: 0.8125rem;
      line-height: 1.4;
      box-shadow: 0 6px 20px color-mix(in srgb, var(--geo-foreground) 12%, transparent);
    }

    .aviso__icone {
      flex-shrink: 0;
    }

    @media print {
      .aviso {
        display: none;
      }
    }
  `
})
export class AvisoSemConexaoComponent {
  private readonly rede = inject(ConnectivityService);
  private readonly leituras = inject(LeiturasOfflineService);

  protected readonly texto = computed(() => {
    const desde = this.leituras.mostrandoDesde();
    const semRede = !this.rede.hardwareOnline();
    if (!semRede && !desde) return null;
    const quando = desde ? (desde.toDateString() === new Date().toDateString() ? `às ${hora.format(desde)}` : `em ${diaHora.format(desde)}`) : null;
    const titulo = semRede ? 'Sem conexão.' : 'O servidor não respondeu.';
    const detalhe = quando
      ? `Mostrando o que foi carregado ${quando}. Nada é salvo até a conexão voltar.`
      : 'O que já está aberto continua na tela; nada é salvo até a conexão voltar.';
    return { titulo, detalhe };
  });
}
