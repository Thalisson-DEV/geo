import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { CesButtonComponent } from '@ces/ui';

import { MovimentacaoFechamento } from '../../../core/models/fechamento-obra.models';
import { movimentacoesRecentes, nomePessoa } from './fechamento-ui';

/**
 * Histórico de operações do encerramento, no mesmo desenho do comercial e do técnico: um cartão por
 * movimentação, que abre nos materiais. No relatório é um painel recolhível; no painel lateral já
 * está numa aba e abre direto. Nos dois, traz a ação de estornar.
 */
@Component({
  selector: 'app-fechamento-operacoes-historico',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, CesButtonComponent],
  template: `
    <div class="rounded-xl border border-[var(--ces-border)] bg-[var(--ces-surface)] overflow-hidden" [class.shadow-sm]="recolhivel()">
      @if (recolhivel()) {
        <button
          type="button"
          (click)="painelExpandido.set(!painelExpandido())"
          class="w-full p-3 md:p-4 flex items-center justify-between gap-3 hover:bg-[var(--ces-surface-subtle)] transition-colors text-left cursor-pointer select-none border-b focus-visible:outline-2 focus-visible:outline-[var(--ces-focus-ring)]"
          [class.border-[var(--ces-border)]]="painelExpandido()"
          [class.border-transparent]="!painelExpandido()"
          [attr.aria-expanded]="painelExpandido()"
          aria-controls="historico-operacoes-fechamento-painel"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-lg bg-[var(--ces-brand-soft)] flex items-center justify-center shrink-0">
              <i class="pi pi-history text-[var(--ces-brand)] text-sm" aria-hidden="true"></i>
            </div>
            <div class="flex flex-col gap-0.5 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs md:text-sm font-bold text-[var(--ces-foreground)]">Histórico de Operações</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-[var(--ces-surface-muted)] text-[var(--ces-foreground)] font-semibold">
                  {{ operacoes().length }} {{ operacoes().length === 1 ? 'operação' : 'operações' }}
                </span>
              </div>
              <span class="text-xs text-[var(--ces-foreground-muted)] font-normal">{{ resumo() }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2.5 shrink-0 print:hidden">
            <span class="text-xs font-semibold text-[var(--ces-brand)]">{{ painelExpandido() ? 'Recolher' : 'Ver movimentações' }}</span>
            <i class="pi text-xs text-[var(--ces-brand)] transition-transform duration-200" [class.pi-chevron-up]="painelExpandido()" [class.pi-chevron-down]="!painelExpandido()" aria-hidden="true"></i>
          </div>
        </button>
      }

      <div id="historico-operacoes-fechamento-painel" [class.hidden]="!painelAberto()" class="p-3 md:p-4 flex flex-col gap-3 bg-[var(--ces-surface-subtle)]">
        @if (operacoes().length > 0) {
          <div class="flex items-center justify-between gap-2 pb-1 flex-wrap">
            <span class="text-xs text-[var(--ces-foreground-muted)]">
              {{ recolhivel() ? 'Clique em qualquer movimentação abaixo para visualizar os materiais:' : resumo() }}
            </span>
            <div class="flex items-center gap-2 shrink-0">
              <button type="button" (click)="expandirTodas()" class="text-xs font-semibold text-[var(--ces-brand)] hover:underline cursor-pointer">Expandir todas</button>
              <span class="text-[var(--ces-foreground-subtle)]" aria-hidden="true">·</span>
              <button type="button" (click)="expandidas.set([])" class="text-xs font-semibold text-[var(--ces-foreground-muted)] hover:underline cursor-pointer">Recolher todas</button>
            </div>
          </div>

          <div class="flex flex-col gap-2.5">
            @for (op of operacoes(); track op.id) {
              @let aberta = expandidas().includes(op.id);
              <div class="rounded-lg border border-[var(--ces-border)] bg-[var(--ces-surface)] overflow-hidden">
                <button
                  type="button"
                  (click)="alternar(op.id)"
                  class="w-full p-3 flex items-center justify-between gap-3 hover:bg-[var(--ces-surface-subtle)] transition-colors text-left cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-[var(--ces-focus-ring)]"
                  [attr.aria-expanded]="aberta"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div
                      class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      [class]="op.tipo === 'ESTORNO' ? 'bg-[var(--ces-warning-soft)] text-[var(--ces-warning-text)]' : 'bg-[var(--ces-success-soft)] text-[var(--ces-success-text)]'"
                    >
                      <i [class]="(op.tipo === 'ESTORNO' ? 'pi pi-undo' : 'pi pi-check-square') + ' text-sm'" aria-hidden="true"></i>
                    </div>
                    <div class="flex flex-col gap-0.5 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-bold text-[var(--ces-foreground)]">{{ titulo(op) }}</span>
                        <span class="text-xs text-[var(--ces-foreground-muted)] tabular-nums" [title]="op.id">#{{ op.id.slice(0, 8) }}</span>
                      </div>
                      <div class="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs text-[var(--ces-foreground-muted)]">
                        <span class="inline-flex items-center gap-1"><i class="pi pi-calendar text-xs" aria-hidden="true"></i> {{ op.realizadaEm | date: "dd/MM/yyyy 'às' HH:mm" }}</span>
                        <span aria-hidden="true">·</span>
                        <span class="inline-flex items-center gap-1"><i class="pi pi-user text-xs" aria-hidden="true"></i> <strong class="text-[var(--ces-foreground)] font-semibold">{{ nomePessoa(op.operador) }}</strong></span>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--ces-surface-muted)] text-[var(--ces-foreground)]">
                      {{ op.itens.length }} {{ op.itens.length === 1 ? 'material' : 'materiais' }}
                    </span>
                    <i class="pi text-xs text-[var(--ces-foreground-subtle)] transition-transform duration-200" [class.pi-chevron-up]="aberta" [class.pi-chevron-down]="!aberta" aria-hidden="true"></i>
                  </div>
                </button>

                <div [class.hidden]="!aberta" class="border-t border-[var(--ces-border)] p-3 bg-[var(--ces-surface-subtle)]">
                  @if (op.tipo === 'ESTORNO') {
                    <div class="mb-3 p-3 rounded-lg bg-[var(--ces-warning-soft)] text-[var(--ces-warning-text)] text-xs flex flex-col gap-1">
                      <div class="flex items-center gap-1.5 font-bold"><i class="pi pi-info-circle" aria-hidden="true"></i><span>Informação sobre esta correção</span></div>
                      <p>{{ op.efeitoEstoque === 'FISICO' ? 'As quantidades abaixo voltaram a ficar pendentes e o saldo foi desfeito.' : 'As quantidades abaixo voltaram a ficar pendentes, sem mexer no saldo.' }}</p>
                      @if (op.motivo) { <p>Motivo: {{ op.motivo }}</p> }
                    </div>
                  }
                  <div class="rounded-lg border border-[var(--ces-border)] overflow-x-auto bg-[var(--ces-surface)]">
                    <table class="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr class="bg-[var(--ces-surface-subtle)] border-b border-[var(--ces-border)] text-xs font-bold uppercase tracking-wider text-[var(--ces-foreground-muted)]">
                          <th class="py-2 px-3">Código</th>
                          <th class="py-2 px-3">Descrição do Material</th>
                          <th class="py-2 px-3 text-right">Quantidade</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-[var(--ces-border)] text-xs">
                        @for (item of op.itens; track item.id) {
                          <tr class="hover:bg-[var(--ces-surface-subtle)] transition-colors">
                            <td class="py-2 px-3 font-bold text-[var(--ces-foreground)]">{{ item.codigoMaterial }}</td>
                            <td class="py-2 px-3 text-[var(--ces-foreground)]">{{ item.descricaoMaterial }}</td>
                            <td class="py-2 px-3 text-right font-bold text-[var(--ces-foreground)] tabular-nums">{{ item.quantidade | number: '1.3-3' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (acoes() && op.podeEstornar) {
                    <div class="flex items-center justify-end gap-1.5 flex-wrap mt-2.5">
                      <ces-button size="sm" variant="ghost" icon="pi pi-undo" label="Estornar" (pressed)="estornar.emit(op)" />
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="py-6 text-center text-xs text-[var(--ces-foreground-muted)]">{{ textoVazio() }}</div>
        }
      </div>
    </div>
  `
})
export class FechamentoOperacoesHistoricoComponent {
  readonly movimentacoes = input<readonly MovimentacaoFechamento[]>([]);
  /** No relatório é um painel recolhível; no painel lateral já está numa aba e abre direto. */
  readonly recolhivel = input(true);
  /** Mostra estornar, quando a movimentação permite. */
  readonly acoes = input(false);
  readonly textoVazio = input('Nenhuma movimentação foi realizada nesta solicitação.');
  readonly estornar = output<MovimentacaoFechamento>();

  protected readonly nomePessoa = nomePessoa;
  protected readonly painelExpandido = signal(false);
  protected readonly painelAberto = computed(() => !this.recolhivel() || this.painelExpandido());
  protected readonly expandidas = signal<string[]>([]);
  protected readonly operacoes = computed(() => movimentacoesRecentes(this.movimentacoes()));
  protected readonly resumo = computed(() => {
    const ops = this.operacoes();
    if (!ops.length) return 'Nenhuma movimentação realizada ainda';
    const estornos = ops.filter((o) => o.tipo === 'ESTORNO').length;
    const movimentacoes = ops.length - estornos;
    const partes: string[] = [];
    if (movimentacoes) partes.push(`${movimentacoes} ${movimentacoes > 1 ? 'movimentações realizadas' : 'movimentação realizada'}`);
    if (estornos) partes.push(`${estornos} ${estornos > 1 ? 'correções / estornos' : 'correção / estorno'}`);
    return partes.join(' · ');
  });

  constructor() {
    // Sem o painel recolhível, a operação mais recente já vem aberta.
    effect(() => {
      const maisRecente = this.operacoes()[0]?.id;
      if (this.recolhivel() || !maisRecente) return;
      untracked(() => {
        if (!this.expandidas().length) this.expandidas.set([maisRecente]);
      });
    });
  }

  protected titulo(op: MovimentacaoFechamento): string {
    if (op.tipo === 'ESTORNO') return 'Correção / Estorno de Movimentação';
    return 'Movimentação';
  }

  protected alternar(id: string): void {
    this.expandidas.update((ids) => (ids.includes(id) ? ids.filter((atual) => atual !== id) : [...ids, id]));
  }

  protected expandirTodas(): void {
    this.expandidas.set(this.operacoes().map((o) => o.id));
  }
}
