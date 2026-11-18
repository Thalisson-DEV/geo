import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GeoAsyncStateComponent, GeoStatusComponent } from '@geo/ui';
import { DescontoStatus, EventoDesconto, TipoEventoDesconto } from '../../../../core/models/desconto.models';

type Tom = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'brand';

const EVENTOS: Record<TipoEventoDesconto, { icone: string; tom: Tom; rotuloTexto: string }> = {
  LANCADO: { icone: 'pi pi-file-edit', tom: 'neutral', rotuloTexto: 'Lançamento' },
  DADOS_ALTERADOS: { icone: 'pi pi-pencil', tom: 'neutral', rotuloTexto: 'O que mudou' },
  ITEM_INCLUIDO: { icone: 'pi pi-plus', tom: 'neutral', rotuloTexto: 'Item' },
  ITEM_ALTERADO: { icone: 'pi pi-pencil', tom: 'neutral', rotuloTexto: 'Item' },
  ITEM_REMOVIDO: { icone: 'pi pi-minus', tom: 'neutral', rotuloTexto: 'Item' },
  ANEXO_INCLUIDO: { icone: 'pi pi-paperclip', tom: 'neutral', rotuloTexto: 'Arquivo' },
  ANEXO_REMOVIDO: { icone: 'pi pi-paperclip', tom: 'neutral', rotuloTexto: 'Arquivo' },
  VALIDADO: { icone: 'pi pi-check-square', tom: 'info', rotuloTexto: 'Observação' },
  REJEITADO: { icone: 'pi pi-times', tom: 'danger', rotuloTexto: 'Motivo' },
  BAIXADO: { icone: 'pi pi-wallet', tom: 'success', rotuloTexto: 'Observação' },
  FINALIZADO: { icone: 'pi pi-verified', tom: 'success', rotuloTexto: 'Termo' },
  DECISAO_DESFEITA: { icone: 'pi pi-undo', tom: 'warning', rotuloTexto: 'Motivo' }
};

const ETAPA_DESFEITA: Partial<Record<DescontoStatus, string>> = {
  VALIDADO: 'Era validação',
  REJEITADO: 'Era rejeição',
  BAIXADO: 'Era baixa',
  FINALIZADO: 'Era termo assinado'
};

/**
 * Linha do tempo do desconto: lançamento, alterações, decisões e decisões desfeitas,
 * com quem, quando e por quê. Mesmo desenho da linha do tempo da solicitação financeira.
 */
@Component({
  selector: 'app-desconto-historico',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoAsyncStateComponent, GeoStatusComponent],
  template: `
    @if (carregando()) {
      <geo-async-state state="loading" title="Carregando a linha do tempo..."></geo-async-state>
    } @else if (erro()) {
      <geo-async-state state="error" title="Linha do tempo indisponível" [description]="erro()!"
        actionLabel="Tentar novamente" (action)="recarregar.emit()"></geo-async-state>
    } @else if (!eventos().length) {
      <p class="apoio">Nenhuma movimentação registrada.</p>
    } @else {
      <ol class="linha" aria-label="Linha do tempo do desconto">
        @for (ev of eventos(); track ev.id; let ultimo = $last) {
          <li class="item">
            <div class="trilho" aria-hidden="true">
              <span class="ponto" [attr.data-tom]="evento(ev.tipo).tom"><i [class]="evento(ev.tipo).icone"></i></span>
              @if (!ultimo) { <span class="conector"></span> }
            </div>
            <div class="conteudo">
              <div class="cabeca">
                <span class="titulo">{{ automatico(ev) ? 'Finalizado pelo sistema' : ev.rotulo }}</span>
                @if (ev.tipo === 'DECISAO_DESFEITA' && ev.statusAnterior) {
                  <geo-status tone="warning" icon="pi-undo">{{ etapaDesfeita(ev.statusAnterior) }}</geo-status>
                }
                <time class="quando" [attr.datetime]="ev.ocorridoEm">{{ ev.ocorridoEm | date: 'dd/MM/yyyy · HH:mm' }}</time>
              </div>
              <p class="meta"><i class="pi pi-user" aria-hidden="true"></i> {{ ev.usuario || (automatico(ev) ? 'Sistema' : 'Não identificado') }}</p>

              @switch (ev.tipo) {
                @case ('VALIDADO') { <p class="mudanca">Valor validado: <strong>{{ moeda(ev.valor) }}</strong></p> }
                @case ('BAIXADO') { <p class="mudanca">Valor baixado em folha: <strong>{{ moeda(ev.valor) }}</strong></p> }
                @case ('ITEM_INCLUIDO') { <p class="mudanca">{{ ev.texto }} · <strong>{{ moeda(ev.valor) }}</strong></p> }
                @case ('ITEM_ALTERADO') { <p class="mudanca">{{ ev.texto }} · agora <strong>{{ moeda(ev.valor) }}</strong></p> }
                @case ('ITEM_REMOVIDO') { <p class="mudanca"><span class="antes">{{ ev.texto }} · {{ moeda(ev.valor) }}</span></p> }
                @case ('ANEXO_INCLUIDO') { <p class="mudanca">{{ ev.texto }}</p> }
                @case ('ANEXO_REMOVIDO') { <p class="mudanca"><span class="antes">{{ ev.texto }}</span></p> }
                @case ('FINALIZADO') {
                  @if (automatico(ev)) {
                    <p class="mudanca">{{ ev.texto }}</p>
                  } @else {
                    <p class="mudanca">Termo assinado pelo colaborador: <strong>{{ ev.texto }}</strong></p>
                  }
                }
                @case ('DADOS_ALTERADOS') { <p class="mudanca">{{ ev.texto }}</p> }
                @case ('LANCADO') { @if (ev.texto) { <p class="mudanca">{{ ev.texto }}</p> } }
                @case ('DECISAO_DESFEITA') {
                  <p class="mudanca">
                    @if (ev.valor != null) { Deixou de valer o valor de <span class="antes">{{ moeda(ev.valor) }}</span>; }
                    {{ voltouPara(ev.statusNovo) }}
                  </p>
                }
              }

              @if (ev.texto && (ev.tipo === 'REJEITADO' || ev.tipo === 'DECISAO_DESFEITA')) {
                <p class="motivo">
                  <i class="pi pi-comment" aria-hidden="true"></i>
                  <span><strong>{{ evento(ev.tipo).rotuloTexto }}:</strong> {{ ev.texto }}</span>
                </p>
              }
            </div>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    :host { display: block; }
    .linha { list-style: none; margin: 0; padding: 0; display: grid; }
    .item { display: grid; grid-template-columns: 2.25rem minmax(0, 1fr); min-height: 3.5rem; break-inside: avoid; }
    .trilho { display: flex; flex-direction: column; align-items: center; padding-top: 0.1rem; }
    .ponto { width: 1.75rem; height: 1.75rem; border-radius: 50%; display: grid; place-items: center; font-size: 0.75rem;
      border: 2px solid var(--geo-border); background: var(--geo-surface); color: var(--geo-foreground-muted); }
    .ponto[data-tom='success'] { border-color: var(--geo-success); color: var(--geo-success); background: var(--geo-success-soft); }
    .ponto[data-tom='warning'] { border-color: var(--geo-warning); color: var(--geo-warning); background: var(--geo-warning-soft); }
    .ponto[data-tom='info'] { border-color: var(--geo-info); color: var(--geo-info); background: var(--geo-info-soft); }
    .ponto[data-tom='danger'] { border-color: var(--geo-danger); color: var(--geo-danger); background: var(--geo-danger-soft); }
    .ponto[data-tom='brand'] { border-color: var(--geo-brand); color: var(--geo-brand); background: var(--geo-brand-soft); }
    .conector { flex: 1; width: 2px; background: var(--geo-border); margin: 0.25rem 0; min-height: 1rem; }
    .conteudo { padding: 0 0 1.25rem 0.5rem; min-width: 0; display: grid; gap: 0.35rem; }
    .cabeca { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .titulo { font-weight: 700; font-size: 0.875rem; color: var(--geo-foreground); }
    .quando { margin-left: auto; font-size: 0.75rem; color: var(--geo-foreground-muted); font-variant-numeric: tabular-nums; }
    .meta, .apoio, .mudanca { margin: 0; font-size: 0.75rem; color: var(--geo-foreground-muted); overflow-wrap: anywhere; }
    .mudanca { color: var(--geo-foreground); }
    .antes { text-decoration: line-through; color: var(--geo-foreground-muted); }
    .motivo { margin: 0; display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.5rem 0.75rem; border-radius: var(--geo-radius-md);
      background: var(--geo-surface-muted); border: 1px solid var(--geo-border); font-size: 0.8125rem; color: var(--geo-foreground);
      white-space: pre-line; overflow-wrap: anywhere; }
    .motivo i { margin-top: 0.15rem; color: var(--geo-foreground-muted); }
    @media print {
      .item { min-height: 0; }
      .conteudo { padding-bottom: 0.5rem; gap: 0.15rem; }
      .ponto { width: 1.25rem; height: 1.25rem; font-size: 0.6rem; }
      .titulo { font-size: 9.5px; }
      .meta, .quando, .apoio, .mudanca, .motivo { font-size: 8.5px; }
      .titulo, .mudanca, .motivo { color: #0f172a !important; }
      .meta, .quando, .apoio { color: #475569 !important; }
      .motivo { background: #ffffff !important; border-color: #cbd5e1 !important; padding: 0.25rem 0.5rem; }
    }
  `
})
export class DescontoHistoricoComponent {
  readonly eventos = input<EventoDesconto[]>([]);
  readonly carregando = input(false);
  readonly erro = input<string | null>(null);
  readonly recarregar = output<void>();

  protected evento(tipo: TipoEventoDesconto) {
    return EVENTOS[tipo] ?? EVENTOS.LANCADO;
  }

  /** Finalização feita pela migração: descontos baixados antes da exigência do termo. */
  protected automatico(ev: EventoDesconto): boolean {
    return ev.tipo === 'FINALIZADO' && !ev.idAnexo && !ev.usuario;
  }

  protected etapaDesfeita(status: DescontoStatus): string {
    return ETAPA_DESFEITA[status] ?? 'Decisão desfeita';
  }

  protected voltouPara(status: DescontoStatus): string {
    switch (status) {
      case 'SOLICITADO': return 'voltou a aguardar validação.';
      case 'VALIDADO': return 'voltou a aguardar a baixa em folha.';
      case 'BAIXADO': return 'voltou a aguardar o termo assinado.';
      default: return '';
    }
  }

  /** O backend omite campos nulos: o valor pode chegar ausente, não só nulo. */
  protected moeda(valor: number | null | undefined): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
