import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type GeoBussolaEstado = 'repouso' | 'trabalhando' | 'concluido' | 'interrompido';

let sequencia = 0;

const ROTULOS: Record<GeoBussolaEstado, string> = {
  repouso: 'Bússola',
  trabalhando: 'Bússola trabalhando',
  concluido: 'Bússola concluiu',
  interrompido: 'Bússola interrompida',
};

/**
 * Avatar da Bússola, a assistente do GEO. A agulha oscila enquanto ela trabalha, dá uma pequena
 * reação ao concluir e volta ao repouso na hora quando é interrompida. Com "reduzir movimento",
 * a agulha fica parada e o estado continua no rótulo acessível.
 */
@Component({
  selector: 'geo-bussola-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-bussola-avatar',
    role: 'img',
    '[attr.aria-label]': 'rotulo()',
    '[attr.data-estado]': 'estado()',
    '[style.--geo-bussola-size]': 'size()',
  },
  template: `
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="ids.fundo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2563EB" />
          <stop offset="1" stop-color="#1E3A8A" />
        </linearGradient>
        <linearGradient [attr.id]="ids.aro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FCD34D" />
          <stop offset="1" stop-color="#F59E0B" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" [attr.fill]="'url(#' + ids.fundo + ')'" />
      <circle cx="50" cy="17" r="5" [attr.stroke]="'url(#' + ids.aro + ')'" stroke-width="3.2" />
      <g class="geo-bussola-avatar__corpo">
        <circle cx="50" cy="55" r="31" [attr.fill]="'url(#' + ids.aro + ')'" />
        <circle cx="50" cy="55" r="25.5" fill="#FFFBEB" />
        <path d="M50 32.5V36.5M50 73.5V77.5M27.5 55H31.5M68.5 55H72.5" stroke="#CBD5E1" stroke-width="2.2" stroke-linecap="round" />
        <path class="geo-bussola-avatar__agulha" d="M50 36L54.2 47H45.8Z" fill="#F97316" />
        <ellipse cx="41" cy="54" rx="3" ry="4.3" fill="#1E293B" />
        <ellipse cx="59" cy="54" rx="3" ry="4.3" fill="#1E293B" />
        <circle cx="42.1" cy="52.4" r="1.1" fill="#FFFFFF" />
        <circle cx="60.1" cy="52.4" r="1.1" fill="#FFFFFF" />
        <circle cx="35.5" cy="61" r="2.6" fill="#FB923C" opacity=".4" />
        <circle cx="64.5" cy="61" r="2.6" fill="#FB923C" opacity=".4" />
        <path d="M45 62Q50 66.5 55 62" stroke="#1E293B" stroke-width="2.2" stroke-linecap="round" />
      </g>
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        inline-size: var(--geo-bussola-size, 2rem);
        block-size: var(--geo-bussola-size, 2rem);
      }
      svg {
        inline-size: 100%;
        block-size: 100%;
        overflow: visible;
      }
      .geo-bussola-avatar__agulha,
      .geo-bussola-avatar__corpo {
        transform-box: view-box;
        transform-origin: 50px 55px;
        transition: transform var(--geo-motion-base) var(--geo-ease-out);
      }
      :host([data-estado='trabalhando']) .geo-bussola-avatar__agulha {
        animation: geo-bussola-oscilar 1.6s var(--geo-ease-emphasis) infinite;
      }
      :host([data-estado='concluido']) .geo-bussola-avatar__corpo {
        animation: geo-bussola-concluir var(--geo-motion-slow) var(--geo-ease-out) 1;
      }
      :host([data-estado='interrompido']) .geo-bussola-avatar__agulha {
        animation: none;
        transition: none;
        transform: rotate(0deg);
      }
      @keyframes geo-bussola-oscilar {
        0%, 100% { transform: rotate(-28deg); }
        50% { transform: rotate(28deg); }
      }
      @keyframes geo-bussola-concluir {
        0% { transform: scale(1); }
        45% { transform: scale(1.06); }
        100% { transform: scale(1); }
      }
      :host-context([data-motion='reduced']) .geo-bussola-avatar__agulha,
      :host-context([data-motion='reduced']) .geo-bussola-avatar__corpo {
        animation: none;
      }
    `,
  ],
})
export class GeoBussolaAvatarComponent {
  readonly estado = input<GeoBussolaEstado>('repouso');
  readonly size = input<string>('2rem');

  protected readonly rotulo = computed(() => ROTULOS[this.estado()]);
  protected readonly ids = (() => {
    const n = ++sequencia;
    return { fundo: `geo-bussola-fundo-${n}`, aro: `geo-bussola-aro-${n}` };
  })();
}
