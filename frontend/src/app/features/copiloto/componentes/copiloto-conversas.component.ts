import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { GeoButtonComponent, GeoIconButtonComponent } from '@geo/ui';
import { GeoAsyncStateComponent } from '@geo/ui/feedback';
import { GeoTextInputComponent } from '@geo/ui/forms';
import { GeoConfirmationService } from '@geo/ui/overlays';
import { ConversaResumo } from '../../../core/models/assistente.models';
import { GrupoConversas } from '../copiloto.store';

@Component({
  selector: 'app-copiloto-conversas',
  standalone: true,
  imports: [GeoButtonComponent, GeoIconButtonComponent, GeoAsyncStateComponent, GeoTextInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="conversas" aria-label="Conversas da Bússola">
      @if (mobile()) {
        <div class="conversas__cabecalho">
          <strong>Conversas</strong>
          <geo-icon-button icon="pi pi-times" label="Voltar à conversa" size="icon-sm" (pressed)="fechar.emit()"></geo-icon-button>
        </div>
      }
      <div class="conversas__topo">
        <geo-button icon="pi pi-plus" label="Nova conversa" [fluid]="true" (pressed)="nova.emit()"></geo-button>
        <geo-text-input
          label="Buscar conversas"
          inputId="copiloto-busca"
          placeholder="Buscar em títulos e mensagens"
          [value]="busca()"
          (valueChange)="aoBuscar($event)"
        ></geo-text-input>
      </div>

      <div class="conversas__lista">
        @if (carregando() && !grupos().length) {
          <geo-async-state state="loading" [compact]="true" title="Carregando conversas"></geo-async-state>
        } @else if (erro()) {
          <geo-async-state
            state="error"
            [compact]="true"
            title="Não foi possível carregar o histórico"
            [description]="erro() || undefined"
            actionLabel="Tentar novamente"
            actionIcon="pi pi-refresh"
            (action)="recarregar.emit()"
          ></geo-async-state>
        } @else if (!grupos().length) {
          <geo-async-state
            state="empty"
            [compact]="true"
            [title]="busca() ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'"
            [description]="busca() ? 'Tente outros termos.' : 'Suas conversas aparecerão aqui.'"
          ></geo-async-state>
        } @else {
          @for (grupo of grupos(); track grupo.rotulo) {
            <section class="grupo" [attr.aria-labelledby]="'grupo-' + $index">
              <h2 class="grupo__titulo" [id]="'grupo-' + $index">{{ grupo.rotulo }}</h2>
              <ul>
                @for (conversa of grupo.conversas; track conversa.id) {
                  <li class="item" [class.item--ativa]="conversa.id === ativa()">
                    @if (editando() === conversa.id) {
                      <form class="item__edicao" (submit)="$event.preventDefault(); confirmarRenomear(conversa)">
                        <label class="geo-sr-only" [for]="'renomear-' + conversa.id">Novo título da conversa</label>
                        <input
                          #campoTitulo
                          class="item__campo"
                          [id]="'renomear-' + conversa.id"
                          maxlength="160"
                          [value]="rascunhoTitulo()"
                          (input)="rascunhoTitulo.set($any($event.target).value)"
                          (keydown.escape)="cancelarEdicao()"
                          (blur)="confirmarRenomear(conversa)"
                        />
                      </form>
                    } @else {
                      <button
                        type="button"
                        class="item__abrir"
                        [attr.title]="conversa.titulo"
                        [attr.aria-current]="conversa.id === ativa() ? 'page' : null"
                        (click)="abrir.emit(conversa.id)"
                      >
                        <span class="item__linha">
                          @if (conversa.fixada) {
                            <i class="pi pi-thumbtack item__origem" aria-hidden="true"></i>
                            <span class="geo-sr-only">Fixada:</span>
                          }
                          @if (conversa.origem === 'DASHBOARD') {
                            <i class="pi pi-objects-column item__origem" aria-hidden="true" title="Iniciada em um dashboard"></i>
                            <span class="geo-sr-only">Iniciada em um dashboard:</span>
                          }
                          <span class="item__titulo">{{ conversa.titulo }}</span>
                        </span>
                        @if (conversa.emAndamento) {
                          <span class="item__andamento">
                            <i class="pi pi-spinner item__giro" aria-hidden="true"></i>
                            Respondendo{{ andamento(conversa) }}
                          </span>
                        }
                      </button>
                      <span class="item__acoes">
                        <geo-icon-button
                          icon="pi pi-thumbtack"
                          size="icon-sm"
                          [label]="(conversa.fixada ? 'Desafixar ' : 'Fixar no topo ') + conversa.titulo"
                          [tooltip]="conversa.fixada ? 'Desafixar' : 'Fixar no topo'"
                          (pressed)="fixar.emit({ id: conversa.id, fixada: !conversa.fixada })"
                        ></geo-icon-button>
                        <geo-icon-button
                          icon="pi pi-pencil"
                          size="icon-sm"
                          [label]="'Renomear ' + conversa.titulo"
                          tooltip="Renomear"
                          (pressed)="iniciarEdicao(conversa)"
                        ></geo-icon-button>
                        <geo-icon-button
                          icon="pi pi-trash"
                          size="icon-sm"
                          variant="ghost"
                          [label]="'Excluir ' + conversa.titulo"
                          tooltip="Excluir"
                          (pressed)="confirmarExclusao(conversa)"
                        ></geo-icon-button>
                      </span>
                    }
                  </li>
                }
              </ul>
            </section>
          }
        }
      </div>
    </nav>
  `,
  styles: `
    :host { display: flex; flex: 1 1 auto; min-width: 0; min-height: 0; height: 100%; }
    .conversas {
      display: flex;
      flex-direction: column;
      width: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--geo-surface);
    }
    .conversas__topo {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 0.85rem 0.8rem 0.6rem;
      border-bottom: 1px solid var(--geo-border);
    }
    .conversas__cabecalho {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 3.25rem;
      padding: 0.5rem 0.85rem;
      border-bottom: 1px solid var(--geo-border);
      font-size: var(--geo-font-body);
      color: var(--geo-foreground);
    }
    .conversas__lista {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
      padding: 0.4rem 0.45rem 1rem;
    }
    .grupo + .grupo { margin-top: 0.6rem; }
    .grupo__titulo {
      margin: 0.4rem 0.45rem 0.25rem;
      font-size: var(--geo-font-caption);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--geo-foreground-subtle);
    }
    ul { list-style: none; margin: 0; padding: 0; }
    .item {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      overflow: hidden;
      border-radius: var(--geo-radius-sm);
    }
    .item:hover { background: var(--geo-surface-muted); }
    .item--ativa { background: var(--geo-brand-soft); }
    .item--ativa .item__titulo { color: var(--geo-brand); font-weight: 600; }
    .item__abrir {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.15rem;
      padding: 0.5rem 0.5rem;
      border: 0;
      background: transparent;
      color: var(--geo-foreground);
      font: inherit;
      font-size: var(--geo-font-body);
      text-align: left;
      cursor: pointer;
      border-radius: var(--geo-radius-sm);
    }
    .item__abrir:focus-visible, .item__campo:focus-visible {
      outline: 2px solid var(--geo-focus-ring);
      outline-offset: -2px;
    }
    .item__linha { display: flex; align-items: flex-start; gap: 0.4rem; min-width: 0; }
    .item__linha .item__origem { margin-top: 0.3rem; }
    .item__titulo {
      flex: 1;
      min-width: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .item__andamento {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: var(--geo-font-caption);
      color: var(--geo-brand);
    }

    .item__giro { color: var(--geo-brand); font-size: 0.75rem; animation: item-giro 0.9s linear infinite; }
    @keyframes item-giro { to { transform: rotate(360deg); } }
    .item__origem { flex: 0 0 auto; color: var(--geo-foreground-subtle); font-size: 0.7rem; }
    .item__acoes { display: none; flex: 0 0 auto; padding-right: 0.15rem; }
    .item:hover .item__acoes, .item:focus-within .item__acoes, .item--ativa .item__acoes { display: inline-flex; }
    .item__edicao { flex: 1; padding: 0.25rem; }
    .item__campo {
      width: 100%;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--geo-brand);
      border-radius: var(--geo-radius-sm);
      background: var(--geo-surface);
      color: var(--geo-foreground);
      font: inherit;
      font-size: var(--geo-font-body);
    }
    @media (hover: none) { .item__acoes { display: inline-flex; } }
    @media (prefers-reduced-motion: reduce) { .item__giro { animation: none; } }
  `,
})
export class CopilotoConversasComponent {
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly campoTitulo = viewChild<ElementRef<HTMLInputElement>>('campoTitulo');

  readonly grupos = input.required<readonly GrupoConversas[]>();
  readonly ativa = input<string | null>(null);
  readonly carregando = input(false);
  readonly erro = input<string | null>(null);
  readonly busca = input('');
  readonly mobile = input(false);

  readonly nova = output<void>();
  readonly fechar = output<void>();
  readonly abrir = output<string>();
  readonly buscar = output<string>();
  readonly recarregar = output<void>();
  readonly renomear = output<{ id: string; titulo: string }>();
  readonly fixar = output<{ id: string; fixada: boolean }>();
  readonly excluir = output<string>();

  protected readonly editando = signal<string | null>(null);
  protected readonly rascunhoTitulo = signal('');
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  /** " · há 3 min" a partir da última atividade (o envio da pergunta). */
  protected andamento(conversa: ConversaResumo): string {
    const desde = Date.parse(conversa.ultimaAtividadeEm);
    if (!Number.isFinite(desde)) return '';
    const minutos = Math.floor((Date.now() - desde) / 60_000);
    return minutos >= 1 ? ` · há ${minutos} min` : '';
  }

  protected aoBuscar(termo: string): void {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.buscar.emit(termo), 300);
  }

  protected iniciarEdicao(conversa: ConversaResumo): void {
    this.rascunhoTitulo.set(conversa.titulo);
    this.editando.set(conversa.id);
    setTimeout(() => {
      const campo = this.campoTitulo()?.nativeElement;
      campo?.focus();
      campo?.select();
    });
  }

  protected cancelarEdicao(): void {
    this.editando.set(null);
  }

  protected confirmarRenomear(conversa: ConversaResumo): void {
    if (this.editando() !== conversa.id) return;
    const titulo = this.rascunhoTitulo().trim();
    this.editando.set(null);
    if (titulo && titulo !== conversa.titulo) this.renomear.emit({ id: conversa.id, titulo });
  }

  protected async confirmarExclusao(conversa: ConversaResumo): Promise<void> {
    const confirmado = await this.confirmacao.confirm({
      title: 'Excluir conversa?',
      message: `"${conversa.titulo}" sairá do seu histórico. Arquivos e artefatos gerados nela deixam de ficar acessíveis.`,
      variant: 'destructive',
    });
    if (confirmado) this.excluir.emit(conversa.id);
  }
}
