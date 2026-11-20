import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { PeriodFilter } from '../shared/components/filter-sheet/period-filter.util';
import { FolhaComponent } from './folha.component';
import { IconeComponent } from './icone.component';

/**
 * Peças comuns das listas (serviços, pedidos, transferências, inspeções, desvios):
 * filtro em chips, período em folha inferior e títulos de dia. Cada tela persiste
 * filtro, período e folha aberta no estado de tela da sessão.
 */

export interface OpcaoChip<T extends string = string> {
  valor: T;
  rotulo: string;
}

export const PERIODOS: { valor: PeriodFilter; rotulo: string; curto: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje', curto: 'Hoje' },
  { valor: '7dias', rotulo: 'Últimos 7 dias', curto: '7 dias' },
  { valor: '30dias', rotulo: 'Últimos 30 dias', curto: '30 dias' },
  { valor: 'todos', rotulo: 'Todo o período', curto: 'Tudo' },
];

/** Linha de chips de filtro (um escolhido), com contagem opcional em cada um. */
@Component({
  selector: 'geo-chips',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chips" role="radiogroup" [attr.aria-label]="rotulo()">
      @for (o of opcoes(); track o.valor) {
        <button type="button" role="radio" class="chip" [attr.aria-checked]="valor() === o.valor" (click)="valor.set(o.valor)">
          @if (valor() === o.valor) { <geo-icone nome="check" [tamanho]="16" /> }
          {{ o.rotulo }}
          @if (contagem()[o.valor]; as n) { <span class="geo-num conta">{{ n }}</span> }
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .chips { display: flex; gap: var(--geo-e2); overflow-x: auto; padding: var(--geo-e3) var(--geo-e4) var(--geo-e2); scrollbar-width: none;
      overscroll-behavior-x: contain; }
    .chips::-webkit-scrollbar { display: none; }
    /* 40 px visíveis, 48 px de toque (o pseudo-elemento estende 4 px para cima e para baixo). */
    .chip { position: relative; flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: var(--geo-r-pilula);
      -webkit-user-select: none; user-select: none; touch-action: manipulation;
      border: 1px solid var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-texto-2); font: 500 .875rem/1 var(--geo-fonte); cursor: pointer; }
    .chip::before { content: ''; position: absolute; inset: -4px 0; }
    .chip[aria-checked='true'] { background: var(--geo-destaque-suave); border-color: transparent; color: var(--geo-destaque); font-weight: 600; padding-left: 10px; }
    .conta { font-weight: 600; }
  `],
})
export class ChipsComponent {
  readonly opcoes = input.required<OpcaoChip[]>();
  readonly contagem = input<Partial<Record<string, number>>>({});
  readonly rotulo = input('Filtrar');
  readonly valor = model.required<string>();
}

/** Botão de período (para o canto do título) e a folha com as opções. */
@Component({
  selector: 'geo-periodo',
  standalone: true,
  imports: [FolhaComponent, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto botao" (click)="aberto.set(true)" [attr.aria-label]="'Período: ' + atual().rotulo">
      <geo-icone nome="filtro" [tamanho]="18" />{{ atual().curto }}
    </button>
    <geo-folha [aberta]="aberto()" (fechar)="aberto.set(false)" titulo="Período">
      <ul class="geo-grupo opcoes" role="radiogroup" aria-label="Período">
        @for (p of periodos; track p.valor) {
          <li>
            <button type="button" role="radio" class="geo-linha geo-linha--acao" [attr.aria-checked]="valor() === p.valor" (click)="escolher(p.valor)">
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ p.rotulo }}</span></span>
              @if (valor() === p.valor) { <geo-icone nome="check" /> }
            </button>
          </li>
        }
      </ul>
    </geo-folha>
  `,
  styles: [`
    :host { display: inline-flex; }
    .botao { color: var(--geo-texto); white-space: nowrap; flex: none; }
    .opcoes { background: var(--geo-fundo); }
    button.geo-linha { width: 100%; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; }
  `],
})
export class PeriodoComponent {
  readonly valor = model.required<PeriodFilter>();
  readonly aberto = model(false);
  readonly periodos = PERIODOS;
  readonly atual = computed(() => PERIODOS.find(p => p.valor === this.valor()) ?? PERIODOS[3]);

  escolher(p: PeriodFilter): void {
    this.valor.set(p);
    this.aberto.set(false);
  }
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function rotuloPeriodo(p: PeriodFilter): string {
  return PERIODOS.find(x => x.valor === p)?.rotulo ?? '';
}

/** "Hoje", "Ontem" ou "ter, 6 de out" — o título de grupo das listas. */
export function tituloDia(iso: string | Date): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}${d.getFullYear() !== hoje.getFullYear() ? ' de ' + d.getFullYear() : ''}`;
}

export function hora(iso: string | Date): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Data curta dd/mm/aaaa (ou dd/mm no ano corrente). */
export function dataCurta(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  // 'aaaa-mm-dd' sem hora é data do calendário, não instante: não converter fuso.
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
  const d = new Date(iso);
  const base = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base}/${d.getFullYear()}`;
}

/** Agrupa por dia mantendo a ordem de entrada. */
export function agruparPorDia<T>(itens: T[], data: (t: T) => string | Date): { titulo: string; itens: T[] }[] {
  const grupos = new Map<string, { titulo: string; itens: T[] }>();
  for (const i of itens) {
    const titulo = tituloDia(data(i));
    if (!grupos.has(titulo)) grupos.set(titulo, { titulo, itens: [] });
    grupos.get(titulo)!.itens.push(i);
  }
  return [...grupos.values()];
}

/** Número no formato brasileiro (vírgula decimal, sem zeros sobrando). */
export function numeroBr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}
