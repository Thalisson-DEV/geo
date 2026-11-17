import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CesButtonComponent, CesStatusComponent } from '@ces/ui';
import {
  AlvoAnaliseIa,
  EstadoAnaliseIa,
  ICONE_PARECER_IA,
  TOM_PARECER_IA
} from '../../../core/models/frota-analise-ia.models';
import { FrotaAnaliseIaService } from '../../../core/services/frota-analise-ia.service';

/**
 * O que a Bússola apontou, no topo do detalhe: a análise roda sozinha quando o registro chega
 * com as fotos, então o gestor já abre o drawer com o parecer. Os detalhes ficam no relatório.
 * Sem modelo de visão no ambiente, não aparece.
 */
@Component({
  selector: 'app-frota-resumo-assistente',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CesButtonComponent, CesStatusComponent],
  styles: `
    :host { display: block; }
    .rs { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); gap: 0.75rem; align-items: start; padding: 0.875rem 1rem;
      border: 1px solid var(--ces-border); border-left: 4px solid var(--rs-tom, var(--ces-brand)); border-radius: var(--ces-radius-lg, 0.75rem);
      background: linear-gradient(90deg, var(--ces-brand-soft), transparent 75%); }
    .rs[data-tom='success'] { --rs-tom: var(--ces-success); }
    .rs[data-tom='warning'] { --rs-tom: var(--ces-warning); }
    .rs[data-tom='danger'] { --rs-tom: var(--ces-danger); }
    .rs__avatar { width: 2.5rem; height: 2.5rem; border-radius: 50%; background: var(--ces-surface); object-fit: contain;
      box-shadow: 0 0 0 2px var(--ces-brand-soft), 0 0 0 3px var(--ces-brand); }
    .rs__corpo { display: grid; gap: 0.375rem; min-width: 0; }
    .rs__topo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .rs__topo strong { font-size: 0.875rem; }
    .rs__quando { font-size: 0.72rem; color: var(--ces-foreground-muted); }
    .rs__texto { margin: 0; font-size: 0.8125rem; line-height: 1.55; }
    .rs__pontos { margin: 0; padding-left: 1.1rem; font-size: 0.8125rem; display: grid; gap: 0.2rem; }
    .rs__acoes { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .rs__espera { font-size: 0.8125rem; color: var(--ces-foreground-muted); margin: 0; }
  `,
  template: `
    @if (estado(); as e) {
      @if (e.ultima; as a) {
        <section class="rs" [attr.data-tom]="tom[a.parecer]" aria-label="O que a Bússola apontou">
          <img class="rs__avatar" src="icons/bussola.svg" alt="" aria-hidden="true" />
          <div class="rs__corpo">
            <div class="rs__topo">
              <strong>A Bússola</strong>
              <ces-status [tone]="tom[a.parecer]" [icon]="'pi ' + icone[a.parecer]">{{ a.parecerRotulo }}</ces-status>
              <span class="rs__quando">{{ a.geradaEm | date: "dd/MM 'às' HH:mm" }}{{ a.geradaPor ? '' : ' · automática' }}</span>
            </div>
            <p class="rs__texto">{{ a.resumo }}</p>
            @if (pontosAtencao().length) {
              <ul class="rs__pontos">
                @for (p of pontosAtencao(); track p.titulo) { <li><strong>{{ p.titulo }}:</strong> {{ p.detalhe }}</li> }
              </ul>
            }
            <div class="rs__acoes">
              <ces-button variant="ghost" size="sm" icon="pi pi-file" label="Ver a análise completa" (pressed)="relatorio.emit()"></ces-button>
            </div>
            <p class="rs__espera">A Bússola só aponta; quem decide é você.</p>
          </div>
        </section>
      } @else if (e.disponivel) {
        <section class="rs" aria-label="Análise da Bússola">
          <img class="rs__avatar" src="icons/bussola.svg" alt="" aria-hidden="true" />
          <div class="rs__corpo">
            <div class="rs__topo"><strong>A Bússola</strong></div>
            <p class="rs__espera">{{ aguardando() ? 'Analisando as fotos assim que chegarem. Pode levar alguns minutos.' : 'Ainda não analisou este registro.' }}</p>
            <div class="rs__acoes">
              <ces-button variant="ghost" size="sm" icon="pi pi-refresh" label="Atualizar" (pressed)="carregar()"></ces-button>
              <ces-button variant="ghost" size="sm" icon="pi pi-file" label="Pedir no relatório" (pressed)="relatorio.emit()"></ces-button>
            </div>
          </div>
        </section>
      }
    }
  `
})
export class FrotaResumoAssistenteComponent {
  private readonly servico = inject(FrotaAnaliseIaService);

  readonly alvo = input.required<AlvoAnaliseIa>();
  readonly idAlvo = input<string | null>(null);
  /** Fotos ainda a caminho: a análise sai quando elas chegarem. */
  readonly aguardando = input(false);
  readonly relatorio = output<void>();

  protected readonly estado = signal<EstadoAnaliseIa | null>(null);
  protected readonly tom = TOM_PARECER_IA;
  protected readonly icone = ICONE_PARECER_IA;
  protected readonly pontosAtencao = computed(() =>
    (this.estado()?.ultima?.pontos ?? []).filter((p) => p.gravidade !== 'INFO').slice(0, 3)
  );

  constructor() {
    effect(() => {
      const id = this.idAlvo();
      untracked(() => {
        this.estado.set(null);
        if (id) this.carregar();
      });
    });
  }

  protected carregar(): void {
    const id = this.idAlvo();
    if (!id) return;
    this.servico.estado(this.alvo(), id).subscribe({ next: (e) => this.estado.set(e), error: () => this.estado.set(null) });
  }
}
