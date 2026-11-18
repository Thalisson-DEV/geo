import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GeoButtonComponent } from '@geo/ui';
import { AvaliacaoConviteService } from '../../../core/services/avaliacao-convite.service';
import { EstrelasAvaliacaoComponent } from './estrelas-avaliacao.component';

/**
 * O convite para avaliar o GEO.
 *
 * <p>Mora no mesmo canto do aviso de versão nova (rodapé no celular, canto inferior
 * direito no desktop), que tem prioridade sobre ele — quem decide isso é o serviço.
 * As estrelas do próprio convite já valem como resposta à primeira pergunta: tocar
 * numa delas abre o formulário com a nota marcada.</p>
 */
@Component({
  selector: 'app-avaliacao-convite',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoButtonComponent, EstrelasAvaliacaoComponent],
  template: `
    @if (servico.mostrarConvite()) {
      <aside class="av-convite" aria-labelledby="av-convite-titulo">
        <div class="av-cartao">
          <div class="av-topo">
            <span class="av-icone" aria-hidden="true"><i class="pi pi-comments"></i></span>
            <div class="av-textos">
              <h2 id="av-convite-titulo" class="av-titulo">Como está sendo usar o GEO?</h2>
              <p class="av-texto">Leva menos de um minuto e ajuda a deixar o sistema mais fácil para todo mundo.</p>
            </div>
          </div>

          <div class="av-nota">
            <app-estrelas-avaliacao [compacto]="true" rotuloGrupo="Dê uma nota de 1 a 5 estrelas" (escolher)="servico.abrir($event)" />
          </div>

          <div class="av-acoes">
            <geo-button label="Responder depois" variant="secondary" size="sm" [fluid]="true" (pressed)="servico.adiar()" />
            <geo-button label="Avaliar agora" icon="pi pi-arrow-right" iconPosition="right" size="sm" [fluid]="true" (pressed)="servico.abrir()" />
          </div>

          @if (servico.convite()?.ultimaVez) {
            <p class="av-ultima">
              Já perguntamos algumas vezes.
              <button type="button" class="av-recusar" (click)="servico.recusar()">Não quero responder</button>
            </p>
          }
        </div>
      </aside>
    }
  `,
  styles: `
    .av-convite {
      position: fixed; inset-inline: 0; bottom: 0; z-index: 59; padding: 1rem;
    }
    @media (min-width: 768px) {
      .av-convite { inset-inline: auto; right: 1.5rem; bottom: 6rem; padding: 0; width: 23.5rem; }
    }
    @media print { .av-convite { display: none; } }

    .av-cartao {
      display: grid; gap: 0.875rem; padding: 1.25rem;
      border: 1px solid var(--geo-border); border-radius: 1rem;
      background: var(--geo-surface); color: var(--geo-foreground);
      box-shadow: 0 20px 40px -16px rgb(15 23 42 / 0.25);
      animation: av-subir 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes av-subir {
      from { opacity: 0; transform: translateY(1rem) scale(0.98); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) { .av-cartao { animation: none; } }

    .av-topo { display: flex; align-items: flex-start; gap: 0.875rem; }
    .av-icone {
      display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center;
      width: 2.75rem; height: 2.75rem; border-radius: 999px;
      background: var(--geo-brand-soft); color: var(--geo-brand); font-size: 1.125rem;
    }
    .av-textos { display: grid; gap: 0.25rem; min-width: 0; }
    .av-titulo { margin: 0; font-size: var(--geo-font-body); font-weight: 700; letter-spacing: -0.01em; }
    .av-texto { margin: 0; font-size: var(--geo-font-caption); line-height: 1.5; color: var(--geo-foreground-muted); }

    .av-nota {
      padding: 0.75rem 0.5rem 0.5rem; border-radius: 0.875rem;
      background: var(--geo-surface-subtle); border: 1px solid var(--geo-border);
    }

    .av-ultima {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 0.375rem; margin: 0;
      font-size: var(--geo-font-caption); line-height: 1.5; color: var(--geo-foreground-muted);
    }
    .av-ultima .pi { margin-top: 0.125rem; font-size: 0.75rem; }

    .av-acoes { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
    .av-recusar {
      padding: 0; border: 0; background: none; font: inherit; font-weight: 600; cursor: pointer;
      color: var(--geo-foreground-muted); text-decoration: underline; text-underline-offset: 2px;
    }
    .av-recusar:hover { color: var(--geo-foreground); }
    .av-recusar:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; border-radius: 0.25rem; }
  `
})
export class AvaliacaoConviteComponent {
  protected readonly servico = inject(AvaliacaoConviteService);
}
