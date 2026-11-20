import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GeoIconButtonComponent, GeoIconComponent } from '@geo/ui';
import { FocoPainel } from '../../../core/models/assistente.models';
import { CopilotoPainelService } from './copiloto-painel.service';

/**
 * Ação do cabeçalho do dashboard que mostra/oculta a Bússola contextual. Leva o avatar da Bússola
 * para ser reconhecido como a mesma funcionalidade do workspace (não é um widget de suporte externo).
 */
@Component({
  selector: 'app-copiloto-gatilho',
  standalone: true,
  imports: [GeoIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (painel.disponivelParaUsuario()) {
    <button
      type="button"
      class="gatilho"
      [class.gatilho--aberto]="painel.aberto()"
      [attr.aria-expanded]="painel.aberto()"
      [attr.aria-controls]="controla()"
      (click)="painel.alternar()"
    >
      <img src="icons/bussola.svg" alt="" aria-hidden="true" />
      <span class="gatilho__texto">{{ painel.aberto() ? 'Ocultar Bússola' : 'Perguntar à Bússola' }}</span>
      <geo-icon class="geo-icon--texto" name="compass"></geo-icon>
    </button>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    .gatilho {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: var(--geo-control-height-sm, 2rem);
      padding: 0.2rem 0.75rem 0.2rem 0.3rem;
      border: 1px solid var(--geo-border-strong);
      border-radius: var(--geo-radius-md);
      background: var(--geo-surface);
      color: var(--geo-foreground);
      font: inherit;
      font-size: var(--geo-font-body);
      font-weight: 500;
      cursor: pointer;
      transition: background var(--geo-duration-fast) var(--geo-ease-standard),
        border-color var(--geo-duration-fast) var(--geo-ease-standard);
    }
    .gatilho img { width: 1.4rem; height: 1.4rem; border-radius: 50%; object-fit: contain; }
    .gatilho geo-icon { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .gatilho:hover { background: var(--geo-surface-muted); }
    .gatilho:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .gatilho:active { transform: translateY(1px); }
    .gatilho--aberto { background: var(--geo-surface-muted); border-color: var(--geo-foreground-subtle); }
    @media (max-width: 480px) { .gatilho__texto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); } .gatilho { padding-right: 0.55rem; } }
  `,
})
export class CopilotoGatilhoComponent {
  protected readonly painel = inject(CopilotoPainelService);
  readonly controla = input<string | null>('copiloto-painel-contextual');
}

/**
 * Botão "Perguntar à Bússola" de um elemento do dashboard (gráfico, KPI, tabela): abre o painel já
 * focado nesse elemento; a pergunta leva `foco` no contexto (id, métrica, dimensão e dados já estão no
 * contexto do painel).
 */
@Component({
  selector: 'app-copiloto-perguntar',
  standalone: true,
  imports: [GeoIconButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (painel.disponivelParaUsuario()) {
      <geo-icon-button
        icon="compass"
        size="icon-sm"
        [label]="rotulo()"
        (pressed)="perguntar()"
      ></geo-icon-button>
    }
  `,
})
export class CopilotoPerguntarComponent {
  protected readonly painel = inject(CopilotoPainelService);
  readonly foco = input.required<FocoPainel>();
  /** Pergunta sugerida no compositor (o usuário pode editar antes de enviar). */
  readonly pergunta = input<string | undefined>();

  protected readonly rotulo = computed(() => `Perguntar à Bússola sobre ${this.foco().rotulo ?? 'este elemento'}`);

  protected perguntar(): void {
    const foco = this.foco();
    const nome = foco.rotulo ?? foco.id;
    const padrao = foco.tipo === 'grafico'
      ? `Explique o gráfico “${nome}”: o que ele mostra e o que explica esse resultado?`
      : foco.tipo === 'metrica'
        ? `O que explica o indicador “${nome}” neste recorte?`
        : `Analise “${nome}” neste recorte.`;
    this.painel.perguntarSobre(foco, this.pergunta() ?? padrao);
  }
}
