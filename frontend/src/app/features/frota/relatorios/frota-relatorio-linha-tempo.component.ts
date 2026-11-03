import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CesTone } from '@ces/ui';

/** Um passo do registro: quem fez o quê e quando. */
export interface EventoRelatorio {
  titulo: string;
  descricao?: string | null;
  usuario?: string | null;
  quando: string;
  icone: string;
  tom: CesTone;
}

/**
 * Histórico de movimentações do registro, no desenho do "Histórico de Operações" da
 * solicitação de material: cabeçalho recolhível com a contagem e a linha do tempo em ordem.
 * Na impressão sai sempre aberto.
 */
@Component({
  selector: 'app-frota-relatorio-linha-tempo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  styles: `
    .lt { border: 1px solid var(--ces-border); border-radius: var(--ces-radius-lg, 0.75rem); background: var(--ces-surface); overflow: hidden; }
    .lt__topo { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem;
      border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .lt__topo:hover { background: var(--ces-surface-subtle); }
    .lt__topo:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: -2px; }
    .lt__marca { display: flex; width: 2.25rem; height: 2.25rem; flex-shrink: 0; align-items: center; justify-content: center;
      border-radius: var(--ces-radius-md, 0.5rem); background: var(--ces-brand-soft); color: var(--ces-brand); }
    .lt__cab { display: flex; min-width: 0; align-items: center; gap: 0.75rem; }
    .lt__titulo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 700; }
    .lt__contagem { padding: 0.125rem 0.5rem; border-radius: 999px; background: var(--ces-surface-muted); font-size: 0.75rem; font-weight: 600; }
    .lt__resumo { font-size: 0.75rem; color: var(--ces-foreground-muted); }
    .lt__abrir { flex-shrink: 0; font-size: 0.75rem; font-weight: 600; color: var(--ces-brand); }
    .lt__lista { margin: 0; padding: 1rem 1rem 1rem 1.25rem; list-style: none; border-top: 1px solid var(--ces-border); background: var(--ces-surface-subtle); }
    .lt__item { position: relative; display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: 0.75rem; padding-bottom: 1rem; }
    .lt__item:last-child { padding-bottom: 0; }
    .lt__item:not(:last-child)::before { content: ''; position: absolute; top: 2rem; bottom: 0; left: 0.9375rem; width: 2px; background: var(--ces-border); }
    .lt__ponto { display: flex; width: 2rem; height: 2rem; align-items: center; justify-content: center; border-radius: 999px;
      border: 1px solid var(--ces-border); background: var(--ces-surface); font-size: 0.75rem; }
    .lt__ponto[data-tom='success'] { background: var(--ces-success-soft); color: var(--ces-success-text); }
    .lt__ponto[data-tom='warning'] { background: var(--ces-warning-soft); color: var(--ces-warning-text); }
    .lt__ponto[data-tom='danger'] { background: var(--ces-danger-soft); color: var(--ces-danger-text); }
    .lt__ponto[data-tom='info'] { background: var(--ces-info-soft); color: var(--ces-info-text); }
    .lt__ponto[data-tom='brand'] { background: var(--ces-brand-soft); color: var(--ces-brand); }
    .lt__corpo { display: grid; gap: 0.125rem; padding-top: 0.25rem; min-width: 0; }
    .lt__evento { font-size: 0.8125rem; font-weight: 700; }
    .lt__meta { display: flex; flex-wrap: wrap; gap: 0.375rem; font-size: 0.75rem; color: var(--ces-foreground-muted); }
    .lt__meta strong { color: var(--ces-foreground); font-weight: 600; }
    .lt__descricao { margin: 0.25rem 0 0; font-size: 0.75rem; line-height: 1.5; white-space: pre-line; }
    @media print { .lt__lista { display: block !important; background: transparent; } .lt__abrir { display: none; } }
  `,
  template: `
    <section class="lt">
      <button type="button" class="lt__topo" [attr.aria-expanded]="aberto()" aria-controls="rel-linha-tempo" (click)="aberto.set(!aberto())">
        <span class="lt__cab">
          <span class="lt__marca"><i class="pi pi-history" aria-hidden="true"></i></span>
          <span>
            <span class="lt__titulo">
              Histórico de movimentações
              <span class="lt__contagem">{{ ordenados().length }} {{ ordenados().length === 1 ? 'movimentação' : 'movimentações' }}</span>
            </span>
            <span class="lt__resumo">{{ resumo() }}</span>
          </span>
        </span>
        <span class="lt__abrir">
          {{ aberto() ? 'Recolher' : 'Ver movimentações' }}
          <i class="pi" [class.pi-chevron-up]="aberto()" [class.pi-chevron-down]="!aberto()" aria-hidden="true"></i>
        </span>
      </button>
      <ol id="rel-linha-tempo" class="lt__lista" [hidden]="!aberto()">
        @for (e of ordenados(); track $index) {
          <li class="lt__item">
            <span class="lt__ponto" [attr.data-tom]="e.tom"><i class="pi {{ e.icone }}" aria-hidden="true"></i></span>
            <div class="lt__corpo">
              <span class="lt__evento">{{ e.titulo }}</span>
              <span class="lt__meta">
                <span><i class="pi pi-calendar" aria-hidden="true"></i> {{ e.quando | date: "dd/MM/yyyy 'às' HH:mm" }}</span>
                @if (e.usuario) {
                  <span aria-hidden="true">·</span>
                  <span><i class="pi pi-user" aria-hidden="true"></i> <strong>{{ e.usuario }}</strong></span>
                }
              </span>
              @if (e.descricao) {
                <p class="lt__descricao">{{ e.descricao }}</p>
              }
            </div>
          </li>
        } @empty {
          <li class="lt__resumo">Nenhuma movimentação registrada.</li>
        }
      </ol>
    </section>
  `
})
export class FrotaRelatorioLinhaTempoComponent {
  readonly eventos = input.required<EventoRelatorio[]>();
  readonly aberto = signal(true);

  protected readonly ordenados = computed(() =>
    [...this.eventos()].sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime())
  );

  protected readonly resumo = computed(() => {
    const lista = this.ordenados();
    if (!lista.length) return 'Sem movimentações.';
    const ultima = lista[lista.length - 1];
    return `Última: ${ultima.titulo.toLowerCase()} em ${new Date(ultima.quando).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  });
}
