import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { GeoButtonComponent, GeoDialogShellComponent, GeoTextareaComponent, NotificationService } from '@geo/ui';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ConclusaoObra, ConclusaoObraService } from '../../../core/services/conclusao-obra.service';

const SUGESTOES: Record<string, string[]> = {
  ALTERACAO_DE_PROJETO: ['Projeto revisado e planejamento atualizado', 'Mantido o projeto original', 'Executado conforme o campo, aceito pelo cliente'],
  OBRA_EXECUTADA_POR_TERCEIROS: ['Obra sai da carteira', 'Parte executada por terceiros, resto segue', 'Não procede: a equipe executa'],
};

/**
 * "Para concluir a obra": quando os serviços já foram executados (ou quase), mostra o que ainda segura a conclusão —
 * fotos obrigatórias que não chegaram e ocorrências de alteração de projeto ou obra feita por terceiros sem decisão.
 * Resolver a ocorrência registra a decisão; sem mais pendências, a obra conclui sozinha.
 */
@Component({
  selector: 'app-obra-conclusao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent, GeoDialogShellComponent, GeoTextareaComponent],
  template: `
    @if (visivel(); as c) {
      <section class="cc" aria-labelledby="cc-titulo">
        <header class="cc__cab">
          <i class="pi pi-flag" aria-hidden="true"></i>
          <div>
            <h2 id="cc-titulo">Para concluir a obra</h2>
            <p>{{ resumo() }}</p>
          </div>
        </header>
        <ul class="cc__lista">
          @for (o of c.ocorrencias; track o.id) {
            <li>
              <span class="cc__tipo cc__tipo--decisao">Decisão</span>
              <span class="cc__texto"><strong>{{ o.rotulo }}</strong> <span>{{ o.descricao }} · {{ o.registradaEm | date: 'dd/MM HH:mm' }}</span></span>
              @if (podeResolver()) { <geo-button size="sm" variant="secondary" label="Resolver" (pressed)="abrir(o)"></geo-button> }
            </li>
          }
          @for (f of fotosPorPonto(); track f.ponto) {
            <li>
              <span class="cc__tipo">Foto</span>
              <span class="cc__texto"><strong>Ponto {{ f.ponto }}</strong> <span>{{ f.titulos }}</span></span>
            </li>
          }
        </ul>
        @if (c.fotos.length) {
          <p class="cc__nota">As fotos tiradas sem sinal chegam quando o aparelho da equipe conectar; a obra conclui assim que a última chegar.</p>
        }
      </section>

      <geo-dialog-shell [(visible)]="dialogo" title="Resolver ocorrência" [description]="emResolucao()?.rotulo" size="sm" [loading]="salvando()">
        <p class="cc__desc">{{ emResolucao()?.descricao }}</p>
        <div class="cc__sugestoes" role="group" aria-label="Sugestões">
          @for (s of sugestoes(); track s) {
            <button type="button" class="geo-quick-filter" [attr.aria-pressed]="resolucao() === s" (click)="resolucao.set(s)">{{ s }}</button>
          }
        </div>
        <geo-textarea label="O que foi decidido" [value]="resolucao()" (valueChange)="resolucao.set($event ?? '')" [required]="true"></geo-textarea>
        <div dialog-footer class="geo-actions-row">
          <geo-button variant="ghost" label="Cancelar" (pressed)="dialogo.set(false)"></geo-button>
          <geo-button icon="pi pi-check" label="Registrar decisão" [disabled]="!resolucao().trim()" [loading]="salvando()" (pressed)="resolver()"></geo-button>
        </div>
      </geo-dialog-shell>
    }
  `,
  styles: `
    .cc { margin-bottom: var(--geo-space-4); padding: var(--geo-space-4); border: 1px solid var(--geo-warning); border-radius: var(--geo-radius-lg); background: var(--geo-warning-soft); }
    .cc__cab { display: flex; gap: var(--geo-space-3); align-items: flex-start; }
    .cc__cab > .pi { margin-top: 2px; color: var(--geo-warning-text); }
    .cc__cab h2 { margin: 0; font-size: var(--geo-font-body); font-weight: var(--geo-font-weight-semibold); }
    .cc__cab p, .cc__nota, .cc__desc { margin: 2px 0 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .cc__lista { display: grid; gap: 1px; margin: var(--geo-space-3) 0 0; padding: 0; list-style: none; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-border); overflow: hidden; }
    .cc__lista li { display: flex; align-items: center; gap: var(--geo-space-3); padding: var(--geo-space-2) var(--geo-space-3); background: var(--geo-surface); }
    .cc__tipo { flex: none; min-width: 4.5rem; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-weight: var(--geo-font-weight-semibold); }
    .cc__tipo--decisao { color: var(--geo-warning-text); }
    .cc__texto { flex: 1; min-width: 0; }
    .cc__texto span { color: var(--geo-foreground-muted); }
    .cc__nota { margin-top: var(--geo-space-2); }
    .cc__sugestoes { display: flex; flex-wrap: wrap; gap: var(--geo-space-2); margin: var(--geo-space-3) 0; }
  `,
})
export class ObraConclusaoComponent {
  private readonly service = inject(ConclusaoObraService);
  private readonly notificacao = inject(NotificationService);
  readonly idObra = input.required<string>();
  readonly podeResolver = input(false);
  /** A obra concluiu ao resolver: a ficha recarrega o status. */
  readonly concluiu = output<void>();

  protected readonly dados = signal<ConclusaoObra | null>(null);
  protected readonly dialogo = signal(false);
  protected readonly emResolucao = signal<ConclusaoObra['ocorrencias'][number] | null>(null);
  protected readonly resolucao = signal('');
  protected readonly salvando = signal(false);

  protected readonly visivel = computed(() => {
    const c = this.dados();
    return c && !c.concluida && (c.fotos.length || c.ocorrencias.length) ? c : null;
  });
  protected readonly fotosPorPonto = computed(() => {
    const mapa = new Map<string, string[]>();
    for (const f of this.dados()?.fotos ?? []) {
      const p = f.numeroPonto ?? '?';
      mapa.set(p, [...(mapa.get(p) ?? []), f.motivoReprovacao ? `${f.titulo} (refazer)` : f.titulo]);
    }
    return [...mapa.entries()].map(([ponto, t]) => ({ ponto, titulos: t.join(', ') }));
  });
  protected readonly resumo = computed(() => {
    const c = this.dados();
    if (!c) return '';
    const partes: string[] = [];
    if (c.ocorrencias.length) partes.push(`${c.ocorrencias.length} ${c.ocorrencias.length === 1 ? 'ocorrência espera' : 'ocorrências esperam'} decisão do escritório`);
    if (c.fotos.length) partes.push(`${c.fotos.length} ${c.fotos.length === 1 ? 'foto obrigatória falta' : 'fotos obrigatórias faltam'}`);
    const servicos = c.servicosAbertos ? `Ainda há ${c.servicosAbertos} ${c.servicosAbertos === 1 ? 'serviço' : 'serviços'} em aberto. ` : 'Os serviços planejados foram executados. ';
    return servicos + partes.join(' e ') + '.';
  });
  protected readonly sugestoes = computed(() => SUGESTOES[this.emResolucao()?.tipo ?? ''] ?? []);

  constructor() {
    effect(() => {
      const id = this.idObra();
      untracked(() => this.carregar(id));
    });
  }

  private carregar(id: string): void {
    this.service.consultar(id).subscribe({
      next: (c: ConclusaoObra) => {
        if (id === this.idObra()) this.dados.set(c);
      },
      error: () => this.dados.set(null),
    });
  }

  protected abrir(o: ConclusaoObra['ocorrencias'][number]): void {
    this.emResolucao.set(o);
    this.resolucao.set('');
    this.dialogo.set(true);
  }

  protected resolver(): void {
    const o = this.emResolucao();
    if (!o || !this.resolucao().trim()) return;
    this.salvando.set(true);
    this.service.resolver(this.idObra(), o.id, this.resolucao().trim()).subscribe({
      next: (c: ConclusaoObra) => {
        this.salvando.set(false);
        this.dialogo.set(false);
        this.dados.set(c);
        this.notificacao.success(c.concluida ? 'Decisão registrada. A obra foi concluída.' : 'Decisão registrada.');
        if (c.concluida) this.concluiu.emit();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacao.error(getErrorMessage(e));
      },
    });
  }
}
