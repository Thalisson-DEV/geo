import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, input, model } from '@angular/core';
import { CesBooleanControlComponent, CesButtonComponent, CesDatepickerComponent, CesNumberInputComponent, CesStatusComponent, CesTextareaComponent } from '@ces/ui';
import { EstruturaChecklist, GrupoChecklist, PerguntaChecklist } from '../../../core/models/obras-documentacao.models';
import {
  RespostaEmEdicao,
  RespostasEmEdicao,
  alternarOpcao,
  marcarRestantesComoConforme,
  naoConforme,
  progresso,
  respondida,
  respostaVazia,
  restantesConformes,
  temOpcoes
} from './checklist.logic';

/**
 * Preenchimento de um modelo de checklist: um bloco por seção, com o progresso dela, e as opções à vista para responder
 * com um toque. Quando o modelo diz a resposta conforme, mostra a não conformidade e oferece "marcar restantes como
 * conforme". `extra` entra embaixo de cada pergunta (as evidências da visita, por exemplo).
 */
@Component({
  selector: 'app-checklist-respostas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, CesBooleanControlComponent, CesButtonComponent, CesDatepickerComponent, CesNumberInputComponent, CesStatusComponent, CesTextareaComponent],
  template: `
    @for (grupo of estrutura().grupos; track $index; let gi = $index) {
      @let pr = progressoDo(grupo);
      @if (!somentePendentes() || pr.respondidas < pr.total) {
        <div class="cr-grupo" role="group" [attr.aria-labelledby]="'cr-g-' + gi" [class.cr-grupo--completo]="pr.respondidas === pr.total">
          <div class="cr-grupo__legenda">
            <h4 class="cr-grupo__titulo" [id]="'cr-g-' + gi">{{ grupo.titulo }}</h4>
            <span class="cr-grupo__contagem">{{ pr.respondidas }} de {{ pr.total }}<span class="ces-sr-only"> respondidas</span></span>
          </div>
          <div class="cr-barra" role="progressbar" [attr.aria-label]="'Progresso da seção ' + grupo.titulo" aria-valuemin="0" [attr.aria-valuemax]="pr.total" [attr.aria-valuenow]="pr.respondidas">
            <span class="cr-barra__valor" [style.width.%]="pr.total ? (pr.respondidas / pr.total) * 100 : 0"></span>
          </div>
          @if (conformesDo(grupo) > 0) {
            <ces-button class="cr-grupo__acao" variant="ghost" size="sm" icon="pi pi-check-square"
              [label]="'Marcar ' + conformesDo(grupo) + (conformesDo(grupo) === 1 ? ' restante como conforme' : ' restantes como conforme')"
              (pressed)="marcarConformes(grupo)"></ces-button>
          }
          @for (p of grupo.perguntas; track p.id) {
            @if (!somentePendentes() || !respondida(p, respostas()[p.id])) {
              <div class="cr-pergunta" [class.cr-pergunta--pendente]="pendente(p)" [class.cr-pergunta--nc]="naoConforme(p, respostas()[p.id])">
                <div class="cr-pergunta__topo">
                  <span class="cr-enunciado" [id]="'cr-' + p.id">{{ p.enunciado }}@if (p.obrigatoria) {<span class="cr-obrigatoria" aria-hidden="true"> *</span>}</span>
                  @if (naoConforme(p, respostas()[p.id])) {
                    <ces-status tone="warning" icon="pi-exclamation-triangle">Não conforme</ces-status>
                  }
                </div>
                @if (temOpcoes(p.tipo)) {
                  <div class="cr-opcoes" role="group" [attr.aria-labelledby]="'cr-' + p.id">
                    @for (o of p.opcoes ?? []; track o) {
                      @let marcada = r(p).selecionadas.includes(o);
                      <button type="button" class="cr-opcao" [class.cr-opcao--marcada]="marcada" [class.cr-opcao--alerta]="marcada && !!p.opcaoConforme && o !== p.opcaoConforme"
                        [attr.aria-pressed]="marcada" [disabled]="r(p).naoSeAplica" (click)="alternar(p, o)">
                        <i class="pi" [class.pi-check]="marcada" [class.pi-circle]="!marcada" aria-hidden="true"></i>
                        {{ o }}
                      </button>
                    }
                  </div>
                } @else if (p.tipo === 'NUMERO') {
                  <!-- Sem [required]: obrigatório, o campo vazio viraria 0 e pareceria respondido. -->
                  <ces-number-input [label]="p.enunciado" [labelVisible]="false" [value]="r(p).numero" [maxFractionDigits]="4" [useGrouping]="false"
                    [disabled]="r(p).naoSeAplica" (valueChange)="alterar(p, { numero: $event })"></ces-number-input>
                } @else if (p.tipo === 'DATA') {
                  <ces-datepicker [label]="p.enunciado" [labelVisible]="false" [value]="r(p).data" [disabled]="r(p).naoSeAplica"
                    (valueChange)="alterar(p, { data: $event })"></ces-datepicker>
                } @else {
                  <ces-textarea [label]="p.enunciado" [labelVisible]="false" [rows]="2" [maxlength]="2000" [value]="r(p).texto" [disabled]="r(p).naoSeAplica"
                    (valueChange)="alterar(p, { texto: $event })"></ces-textarea>
                }
                @if (p.aceitaNaoSeAplica) {
                  <ces-boolean-control label="Não se aplica" [inline]="true" [value]="r(p).naoSeAplica" (valueChange)="marcarNaoSeAplica(p, $event)"></ces-boolean-control>
                }
                @if (pendente(p)) {
                  <p class="cr-erro" role="alert"><i class="pi pi-exclamation-circle" aria-hidden="true"></i> Responda esta pergunta{{ p.aceitaNaoSeAplica ? ' ou marque "Não se aplica"' : '' }}.</p>
                }
                @if (extra(); as t) {
                  <ng-container [ngTemplateOutlet]="t" [ngTemplateOutletContext]="{ $implicit: p, naoConforme: naoConforme(p, respostas()[p.id]) }"></ng-container>
                }
              </div>
            }
          }
        </div>
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 1rem; }
    .cr-grupo { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; padding: 0.875rem 1rem 1rem; border: 1px solid var(--ces-border-strong); border-radius: var(--ces-radius-lg); background: var(--ces-surface-subtle); }
    .cr-grupo__legenda { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
    .cr-grupo__titulo { margin: 0; color: var(--ces-foreground); font-size: 0.9375rem; font-weight: 700; overflow-wrap: anywhere; }
    .cr-grupo__contagem { flex: none; color: var(--ces-foreground-muted); font-size: 0.8125rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .cr-grupo--completo .cr-grupo__contagem { color: var(--ces-success-text); }
    .cr-barra { display: block; height: 0.375rem; overflow: hidden; border-radius: 999px; background: var(--ces-surface-muted); }
    .cr-barra__valor { display: block; height: 100%; border-radius: inherit; background: var(--ces-brand); transition: width 160ms ease-out; }
    .cr-grupo--completo .cr-barra__valor { background: var(--ces-success); }
    .cr-grupo__acao { align-self: flex-start; }
    .cr-pergunta { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.875rem; border-top: 1px solid var(--ces-border); }
    .cr-grupo__acao + .cr-pergunta, .cr-barra + .cr-pergunta { padding-top: 0.25rem; border-top: 0; }
    .cr-pergunta--pendente { padding-left: 0.625rem; border-left: 3px solid var(--ces-danger-text); }
    .cr-pergunta--nc { padding-left: 0.625rem; border-left: 3px solid var(--ces-warning-text); }
    .cr-pergunta__topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.375rem 0.75rem; }
    .cr-enunciado { flex: 1 1 14rem; color: var(--ces-foreground); font-size: 0.875rem; font-weight: 500; overflow-wrap: anywhere; }
    .cr-obrigatoria { color: var(--ces-danger-text); }
    .cr-opcoes { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .cr-opcao { display: inline-flex; align-items: center; gap: 0.5rem; min-height: var(--ces-touch-target); padding: 0.375rem 0.875rem; border: 1px solid var(--ces-border-strong); border-radius: var(--ces-radius-md); background: var(--ces-surface); color: var(--ces-foreground); font: inherit; font-size: 0.875rem; cursor: pointer; transition: background-color 120ms ease-out, border-color 120ms ease-out; }
    .cr-opcao .pi { font-size: 0.75rem; color: var(--ces-foreground-subtle); }
    .cr-opcao:hover:not(:disabled) { border-color: var(--ces-brand); background: var(--ces-surface-muted); }
    .cr-opcao:active:not(:disabled) { background: var(--ces-brand-soft); }
    .cr-opcao:focus-visible { outline: 3px solid var(--ces-focus-ring); outline-offset: 2px; }
    .cr-opcao:disabled { opacity: 0.55; cursor: not-allowed; }
    .cr-opcao--marcada, .cr-opcao--marcada:hover:not(:disabled) { border-color: var(--ces-brand); background: var(--ces-brand-soft); box-shadow: inset 0 0 0 1px var(--ces-brand); color: var(--ces-foreground); font-weight: 700; }
    .cr-opcao--marcada .pi { color: var(--ces-brand); }
    .cr-opcao--alerta, .cr-opcao--alerta:hover:not(:disabled) { border-color: var(--ces-warning-text); background: var(--ces-warning-soft); box-shadow: inset 0 0 0 1px var(--ces-warning-text); }
    .cr-opcao--alerta .pi { color: var(--ces-warning-text); }
    .cr-erro { display: flex; gap: 0.375rem; align-items: center; margin: 0; color: var(--ces-danger-text); font-size: 0.8125rem; }
    @media (prefers-reduced-motion: reduce) { .cr-barra__valor, .cr-opcao { transition: none; } }
  `
})
export class ChecklistRespostasComponent {
  readonly estrutura = input.required<EstruturaChecklist>();
  readonly respostas = model.required<RespostasEmEdicao>();
  readonly mostrarPendencias = input(false);
  /** Esconde o que já foi respondido (e a seção inteira, quando completa). */
  readonly somentePendentes = input(false);
  /** Conteúdo extra embaixo de cada pergunta; contexto: a pergunta e se a resposta é não conforme. */
  readonly extra = input<TemplateRef<{ $implicit: PerguntaChecklist; naoConforme: boolean }> | null>(null);

  protected readonly temOpcoes = temOpcoes;
  protected readonly respondida = respondida;
  protected readonly naoConforme = naoConforme;

  protected r(p: PerguntaChecklist): RespostaEmEdicao {
    return this.respostas()[p.id] ?? respostaVazia();
  }

  protected progressoDo(grupo: GrupoChecklist) {
    return progresso(grupo.perguntas, this.respostas());
  }

  protected conformesDo(grupo: GrupoChecklist): number {
    return restantesConformes(grupo.perguntas, this.respostas()).length;
  }

  protected marcarConformes(grupo: GrupoChecklist): void {
    this.respostas.update((atuais) => marcarRestantesComoConforme(grupo.perguntas, atuais));
  }

  protected pendente(p: PerguntaChecklist): boolean {
    return this.mostrarPendencias() && p.obrigatoria && !respondida(p, this.respostas()[p.id]);
  }

  protected alternar(p: PerguntaChecklist, opcao: string): void {
    this.alterar(p, { selecionadas: alternarOpcao(p, this.r(p).selecionadas, opcao) });
  }

  protected marcarNaoSeAplica(p: PerguntaChecklist, marcado: boolean): void {
    this.alterar(p, marcado ? { ...respostaVazia(), naoSeAplica: true } : { naoSeAplica: false });
  }

  protected alterar(p: PerguntaChecklist, mudanca: Partial<RespostaEmEdicao>): void {
    this.respostas.update((atuais) => ({ ...atuais, [p.id]: { ...this.r(p), ...mudanca } }));
  }
}
