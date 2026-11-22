import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TurnoService } from '../../core/turno/turno.service';

/**
 * Aviso no topo das telas que registram algo na obra (chegada, fotos, apontamento, ocorrência) quando o turno está fechado.
 * Antes, a pessoa só descobria no fim, depois de preencher tudo. O "Abrir turno" volta para esta mesma tela.
 */
@Component({
  selector: 'geo-aviso-turno-fechado',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!turno.turnoAtivo()) {
      <div class="turno-fechado" role="status">
        <span>{{ texto() }}</span>
        @if (botao()) {
          <a class="geo-btn geo-btn--compacto" [routerLink]="['/turno/abrir']" [queryParams]="{ volta: router.url }">Abrir turno</a>
        }
      </div>
    }
  `,
  styles: [`
    .turno-fechado { margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo);
      background: var(--geo-atencao-suave); font: var(--geo-t-apoio); display: flex; align-items: center; gap: var(--geo-e3); justify-content: space-between; }
  `],
})
export class AvisoTurnoFechadoComponent {
  readonly turno = inject(TurnoService);
  readonly router = inject(Router);
  /** Sem o botão quando a própria tela já oferece "Abrir turno" como ação principal (ficha da obra). */
  readonly botao = input(true);
  readonly texto = input('O turno está fechado. Abra o turno para registrar nesta obra; você volta para cá.');
}
