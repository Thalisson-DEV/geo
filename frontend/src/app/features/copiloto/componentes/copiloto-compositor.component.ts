import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, output, viewChild } from '@angular/core';
import { GeoButtonComponent, GeoIconButtonComponent, GeoStatusComponent } from '@geo/ui';
import { GeoTextareaComponent } from '@geo/ui/forms';
import { AssistenteContexto } from '../../../core/models/assistente.models';
import { AnexoPendente, formatarTamanho } from '../copiloto.store';

const ACEITOS = '.pdf,.xlsx,.xlsm,.xls,.csv,.tsv,.json,.txt,.md,.log,.xml,.yml,.yaml,.sql,.html,.htm,.docx,.png,.jpg,.jpeg,.gif,.webp';

/**
 * Compositor de mensagens: texto com Enter para enviar (Shift+Enter quebra linha), anexos por botão,
 * colar ou arrastar, e botão de interromper durante a geração.
 */
@Component({
  selector: 'app-copiloto-compositor',
  standalone: true,
  imports: [GeoButtonComponent, GeoIconButtonComponent, GeoStatusComponent, GeoTextareaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="compositor" (submit)="$event.preventDefault(); enviarAgora()" [class.compositor--desabilitado]="!disponivel()">
      @if (contexto(); as ctx) {
        <div class="compositor__contexto">
          <geo-status tone="brand" icon="pi-map-marker">
            Contexto: {{ ctx.rotulo || ctx.pagina || ctx.entidadeTipo }}
          </geo-status>
        </div>
      }
      @if (anexos().length) {
        <ul class="compositor__anexos" aria-label="Anexos desta mensagem">
          @for (anexo of anexos(); track anexo.idLocal) {
            <li class="anexo" [attr.data-estado]="anexo.estado">
              <i
                class="pi"
                [class.pi-spinner]="anexo.estado === 'enviando'"
                [class.anexo__giro]="anexo.estado === 'enviando'"
                [class.pi-paperclip]="anexo.estado === 'pronto' && !anexo.erro"
                [class.pi-exclamation-triangle]="anexo.estado === 'erro' || !!anexo.erro"
                aria-hidden="true"
              ></i>
              <span class="anexo__nome">{{ anexo.nome }}</span>
              <span class="anexo__meta">
                @switch (anexo.estado) {
                  @case ('enviando') { Enviando {{ anexo.progresso }}% }
                  @case ('erro') { {{ anexo.erro || 'Falha no envio' }} }
                  @default { {{ anexo.erro ? 'Enviado; leitura automática falhou' : formatarTamanho(anexo.tamanho) }} }
                }
              </span>
              <geo-icon-button
                icon="pi pi-times"
                size="icon-sm"
                [label]="'Remover ' + anexo.nome"
                (pressed)="removerAnexo.emit(anexo.idLocal)"
              ></geo-icon-button>
            </li>
          }
        </ul>
      }
      <div class="compositor__campo" (keydown)="aoTeclar($event)" (paste)="aoColar($event)">
        <geo-textarea
          #campo
          label="Mensagem para a Bússola"
          [labelVisible]="false"
          inputId="copiloto-mensagem"
          [(value)]="valor"
          [rows]="2"
          [autoResize]="false"
          [maxlength]="20000"
          [placeholder]="placeholder()"
          [disabled]="!disponivel()"
        ></geo-textarea>
      </div>
      <div class="compositor__barra">
        <input
          #seletor
          type="file"
          multiple
          class="geo-sr-only"
          tabindex="-1"
          aria-hidden="true"
          [accept]="aceitos"
          (change)="aoSelecionar($event)"
        />
        <geo-icon-button
          icon="pi pi-paperclip"
          label="Anexar arquivos (PDF, planilhas, CSV, JSON, texto, DOCX ou imagens)"
          [disabled]="!disponivel()"
          (pressed)="seletor.click()"
        ></geo-icon-button>
        <span class="compositor__dica">Enter envia · Shift+Enter quebra linha</span>
        @if (transmitindo()) {
          <geo-button
            variant="secondary"
            icon="pi pi-stop-circle"
            label="Parar"
            ariaLabel="Parar a geração da resposta"
            [loading]="parando()"
            (pressed)="parar.emit()"
          ></geo-button>
        } @else {
          <geo-button
            type="submit"
            icon="pi pi-send"
            label="Enviar"
            [disabled]="!podeEnviar()"
            ariaLabel="Enviar mensagem"
          ></geo-button>
        }
      </div>
    </form>
  `,
  styles: `
    :host { display: block; }
    .compositor {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.6rem 0.7rem 0.55rem;
      border: 1px solid var(--geo-border-strong);
      border-radius: var(--geo-radius-lg);
      background: var(--geo-surface);
      box-shadow: var(--geo-shadow-md);
    }
    .compositor:focus-within { border-color: var(--geo-brand); }
    .compositor--desabilitado { opacity: 0.7; }
    .compositor__contexto { display: flex; }
    .compositor__campo { min-width: 0; }
    .compositor__barra { display: flex; align-items: center; gap: 0.5rem; }
    .compositor__dica {
      flex: 1;
      font-size: var(--geo-font-caption);
      color: var(--geo-foreground-subtle);
    }
    .compositor__anexos {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .anexo {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      max-width: 100%;
      padding: 0.15rem 0.2rem 0.15rem 0.6rem;
      border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-sm);
      background: var(--geo-surface-subtle);
      font-size: var(--geo-font-caption);
    }
    .anexo[data-estado='erro'] { border-color: var(--geo-danger-text); color: var(--geo-danger-text); }
    .anexo__nome { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--geo-foreground); }
    .anexo__meta { color: var(--geo-foreground-subtle); }
    .anexo__giro { color: var(--geo-brand); animation: anexo-giro 0.9s linear infinite; }
    @keyframes anexo-giro { to { transform: rotate(360deg); } }
    @media (max-width: 640px) { .compositor__dica { visibility: hidden; } }
    @media (prefers-reduced-motion: reduce) { .anexo__giro { animation: none; } }
  `,
})
export class CopilotoCompositorComponent {
  private readonly campo = viewChild<GeoTextareaComponent>('campo');
  private readonly seletor = viewChild<ElementRef<HTMLInputElement>>('seletor');

  readonly valor = model('');
  readonly anexos = input<readonly AnexoPendente[]>([]);
  readonly contexto = input<AssistenteContexto | null>(null);
  readonly transmitindo = input(false);
  readonly parando = input(false);
  readonly disponivel = input(true);
  readonly enviandoAnexos = input(false);

  readonly enviar = output<string>();
  readonly parar = output<void>();
  readonly anexar = output<File[]>();
  readonly removerAnexo = output<string>();

  protected readonly aceitos = ACEITOS;
  protected readonly formatarTamanho = formatarTamanho;
  protected readonly podeEnviar = computed(
    () => this.disponivel() && !this.transmitindo() && !this.enviandoAnexos() && this.valor().trim().length > 0,
  );
  protected readonly placeholder = computed(() =>
    this.disponivel()
      ? 'Pergunte à Bússola…'
      : 'A Bússola está indisponível no momento',
  );

  focar(): void {
    this.campo()?.focus();
  }

  protected enviarAgora(): void {
    if (!this.podeEnviar()) return;
    this.enviar.emit(this.valor().trim());
  }

  protected aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.isComposing && !evento.ctrlKey && !evento.altKey) {
      evento.preventDefault();
      this.enviarAgora();
    }
  }

  protected aoColar(evento: ClipboardEvent): void {
    const arquivos = [...(evento.clipboardData?.files ?? [])];
    if (arquivos.length) {
      evento.preventDefault();
      this.anexar.emit(arquivos);
    }
  }

  protected aoSelecionar(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivos = [...(entrada.files ?? [])];
    if (arquivos.length) this.anexar.emit(arquivos);
    entrada.value = '';
    this.seletor()?.nativeElement.blur();
  }
}
