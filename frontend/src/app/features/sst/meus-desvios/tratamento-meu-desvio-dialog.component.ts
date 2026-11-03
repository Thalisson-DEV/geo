import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesDatepickerComponent,
  CesFormDrawerComponent,
  CesStatusComponent,
  CesTextareaComponent,
  CesTone
} from '@ces/ui';

import { TratarMeuDesvioRequest } from '../../../core/models/meu-desvio.models';
import { GRAVIDADE_LABELS, GravidadeDesvio, StatusDesvio } from '../../../core/models/sst.models';
import { GRAVIDADE_ICONE, GRAVIDADE_TOM } from '../sst-ui';
import { formatarDataLocal, parsearDataLocal } from './meus-desvios.utils';

/** O que o tratamento precisa saber do desvio (vale para "meu desvio" e para o desvio da gestão). */
export interface DesvioEmTratamento {
  pergunta?: string | null;
  descricao?: string | null;
  gravidade?: GravidadeDesvio | null;
  status?: StatusDesvio | null;
  acaoCorretiva?: string | null;
  prazo?: string | null;
  vencido?: boolean | null;
}

type Situacao = { valor: StatusDesvio; rotulo: string; detalhe: string; icone: string; tom: CesTone };

const SITUACOES: Situacao[] = [
  { valor: 'RESOLVIDO', rotulo: 'Já corrigido', detalhe: 'O problema foi resolvido.', icone: 'pi pi-check-circle', tom: 'success' },
  { valor: 'EM_TRATAMENTO', rotulo: 'Em tratamento', detalhe: 'Tem plano e prazo para corrigir.', icone: 'pi pi-wrench', tom: 'warning' },
  { valor: 'ABERTO', rotulo: 'Ainda em aberto', detalhe: 'Nada foi feito ainda.', icone: 'pi pi-exclamation-circle', tom: 'danger' }
];

/** Limite do tratamento em lote no servidor. */
const LIMITE_LOTE = 100;

@Component({
  selector: 'app-tratamento-meu-desvio-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CesButtonComponent, CesCalloutComponent, CesDatepickerComponent, CesFormDrawerComponent, CesStatusComponent, CesTextareaComponent],
  styles: `
    .td-resumo {
      display: grid;
      gap: 0.375rem;
      padding: 0.75rem 0.875rem;
      border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-md);
      background: var(--ces-surface-subtle);
    }
    .td-resumo__topo {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .td-resumo__pergunta {
      margin: 0;
      color: var(--ces-foreground);
      font-size: var(--ces-font-body);
      font-weight: 700;
      line-height: 1.35;
    }
    .td-resumo__texto,
    .td-resumo__prazo {
      margin: 0;
      color: var(--ces-foreground-muted);
      font-size: var(--ces-font-caption);
      line-height: 1.45;
    }
    .td-resumo__prazo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.375rem;
    }
    .td-pergunta {
      margin: 0 0 0.5rem;
      color: var(--ces-foreground);
      font-size: var(--ces-font-control);
      font-weight: 600;
    }
    .td-situacoes {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
    }
    @media (max-width: 30rem) {
      .td-situacoes {
        grid-template-columns: 1fr;
      }
    }
    .td-situacao {
      --td-tom: var(--ces-foreground-subtle);
      display: grid;
      gap: 0.25rem;
      align-content: start;
      min-height: var(--ces-touch-target, 2.75rem);
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-md);
      background: var(--ces-surface);
      color: var(--ces-foreground);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition:
        border-color var(--ces-duration-fast) var(--ces-ease-standard),
        background-color var(--ces-duration-fast) var(--ces-ease-standard);
    }
    .td-situacao[data-tone='success'] { --td-tom: var(--ces-success); }
    .td-situacao[data-tone='warning'] { --td-tom: var(--ces-warning); }
    .td-situacao[data-tone='danger'] { --td-tom: var(--ces-danger); }
    .td-situacao:hover {
      border-color: color-mix(in srgb, var(--td-tom) 55%, var(--ces-border));
    }
    .td-situacao:focus-visible {
      outline: 2px solid var(--ces-focus-ring);
      outline-offset: 2px;
    }
    .td-situacao[aria-checked='true'] {
      border-color: var(--td-tom);
      background: color-mix(in srgb, var(--td-tom) 12%, var(--ces-surface));
      box-shadow: inset 0 0 0 1px var(--td-tom);
    }
    .td-situacao__rotulo {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: var(--ces-font-control);
      font-weight: 700;
    }
    .td-situacao__rotulo .pi {
      color: var(--td-tom);
    }
    .td-situacao__detalhe {
      color: var(--ces-foreground-muted);
      font-size: var(--ces-font-caption);
      line-height: 1.35;
    }
  `,
  template: `
    <ces-form-drawer
      [(visible)]="visible"
      [title]="modoLote() ? 'Tratar ' + quantidade() + ' desvios' : 'Tratar desvio'"
      [description]="modoLote() ? 'O mesmo status, ação e prazo valem para todos os selecionados.' : 'Conte o que foi feito ou o que será feito para corrigir.'"
      [dirty]="alterado()"
      size="md"
    >
      @if (!modoLote() && item(); as d) {
        <div class="td-resumo">
          <div class="td-resumo__topo">
            <p class="td-resumo__pergunta">{{ d.pergunta || 'Pergunta não identificada' }}</p>
            @if (d.gravidade) {
              <ces-status [tone]="gravidadeTom(d.gravidade)" [icon]="gravidadeIcone(d.gravidade)">{{ gravidadeLabel(d.gravidade) }}</ces-status>
            }
          </div>
          @if (d.descricao) {
            <p class="td-resumo__texto">{{ d.descricao }}</p>
          }
          @if (d.prazo) {
            <p class="td-resumo__prazo">
              <i class="pi pi-calendar" aria-hidden="true"></i> Prazo atual: <strong>{{ d.prazo | date: 'dd/MM/yyyy' }}</strong>
              @if (d.vencido) {
                <ces-status tone="danger" icon="pi-clock">Vencido</ces-status>
              }
            </p>
          }
        </div>
      }

      <div>
        <p class="td-pergunta" id="td-situacao-titulo">Como está este desvio agora?</p>
        <div class="td-situacoes" role="radiogroup" aria-labelledby="td-situacao-titulo">
          @for (s of situacoes; track s.valor) {
            <button
              type="button"
              role="radio"
              class="td-situacao"
              [attr.data-tone]="s.tom"
              [attr.aria-checked]="status() === s.valor"
              [attr.tabindex]="status() === s.valor ? 0 : -1"
              (click)="status.set(s.valor)"
              (keydown)="navegar($event)"
            >
              <span class="td-situacao__rotulo"><i [class]="s.icone" aria-hidden="true"></i>{{ s.rotulo }}</span>
              <span class="td-situacao__detalhe">{{ s.detalhe }}</span>
            </button>
          }
        </div>
      </div>

      @switch (status()) {
        @case ('RESOLVIDO') {
          <ces-callout tone="success" label="Ao salvar" [dense]="true">O desvio é encerrado com a data e a hora de agora.</ces-callout>
          <ces-textarea
            label="O que foi feito"
            [required]="true"
            [rows]="4"
            [autoResize]="true"
            placeholder="Ex.: o cinto foi trocado e a equipe foi orientada."
            [error]="tentouSalvar() && !acao().trim() ? 'Descreva o que foi feito.' : undefined"
            [(value)]="acao"
          ></ces-textarea>
        }
        @case ('EM_TRATAMENTO') {
          <ces-textarea
            label="Plano de correção"
            [showOptional]="true"
            [rows]="4"
            [autoResize]="true"
            placeholder="Ex.: comprar luvas novas e trocar na próxima saída da equipe."
            [(value)]="acao"
          ></ces-textarea>
          <ces-datepicker
            label="Prazo para corrigir"
            [(value)]="prazo"
            [clearable]="true"
            description="Data limite para concluir a correção."
          ></ces-datepicker>
        }
        @default {
          <ces-callout tone="info" label="Ao salvar" [dense]="true">O desvio continua na lista de pendências até alguém começar a tratar.</ces-callout>
          <ces-textarea label="Anotações" [showOptional]="true" [rows]="3" [autoResize]="true" [(value)]="acao"></ces-textarea>
          <ces-datepicker label="Prazo estimado" [showOptional]="true" [(value)]="prazo" [clearable]="true"></ces-datepicker>
        }
      }

      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="close()"></ces-button>
        <ces-button
          icon="pi pi-check"
          [label]="modoLote() ? 'Salvar nos ' + quantidade() : 'Salvar tratamento'"
          [loading]="loading()"
          [disabled]="loteInvalido()"
          (pressed)="confirmar()"
        ></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class TratamentoMeuDesvioDialogComponent {
  readonly loading = input(false);
  readonly salvar = output<TratarMeuDesvioRequest>();

  protected readonly situacoes = SITUACOES;
  protected readonly visible = signal(false);
  protected readonly item = signal<DesvioEmTratamento | null>(null);
  protected readonly modoLote = computed(() => this.item() === null);
  protected readonly quantidade = signal(0);
  protected readonly status = signal<StatusDesvio>('EM_TRATAMENTO');
  protected readonly acao = signal('');
  protected readonly prazo = signal<Date | null>(null);
  protected readonly tentouSalvar = signal(false);
  private inicial: { status: StatusDesvio; acao: string; prazo: string | null } = { status: 'EM_TRATAMENTO', acao: '', prazo: null };

  protected readonly alterado = computed(
    () => this.status() !== this.inicial.status || this.acao() !== this.inicial.acao || formatarDataLocal(this.prazo()) !== this.inicial.prazo
  );
  protected readonly loteInvalido = computed(() => this.modoLote() && (this.quantidade() < 1 || this.quantidade() > LIMITE_LOTE));

  protected readonly gravidadeTom = (g: GravidadeDesvio) => GRAVIDADE_TOM[g];
  protected readonly gravidadeIcone = (g: GravidadeDesvio) => GRAVIDADE_ICONE[g];
  protected readonly gravidadeLabel = (g: GravidadeDesvio) => GRAVIDADE_LABELS[g] ?? g;

  open(item: DesvioEmTratamento | null, quantidade = 0): void {
    // Desvio ainda aberto já pede tratamento: a sugestão inicial é "Em tratamento".
    const status = item?.status && item.status !== 'ABERTO' ? item.status : 'EM_TRATAMENTO';
    this.item.set(item);
    this.quantidade.set(quantidade);
    this.status.set(status);
    this.acao.set(item?.acaoCorretiva ?? '');
    this.prazo.set(parsearDataLocal(item?.prazo ?? null));
    this.tentouSalvar.set(false);
    this.inicial = { status, acao: this.acao(), prazo: formatarDataLocal(this.prazo()) };
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }

  /** Setas trocam a situação, como num grupo de rádio nativo. */
  protected navegar(evento: KeyboardEvent): void {
    const passo = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[evento.key];
    if (!passo) return;
    evento.preventDefault();
    const atual = SITUACOES.findIndex((s) => s.valor === this.status());
    this.status.set(SITUACOES[(atual + passo + SITUACOES.length) % SITUACOES.length].valor);
    const grupo = (evento.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => grupo?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }

  protected confirmar(): void {
    this.tentouSalvar.set(true);
    const acao = this.acao().trim();
    if (this.loteInvalido() || (this.status() === 'RESOLVIDO' && !acao)) return;

    const request: TratarMeuDesvioRequest = { status: this.status() };
    if (acao) request.acaoCorretiva = acao;
    // Corrigido não leva prazo futuro.
    const prazo = formatarDataLocal(this.prazo());
    if (this.status() !== 'RESOLVIDO' && prazo) request.prazo = prazo;
    this.salvar.emit(request);
  }
}
