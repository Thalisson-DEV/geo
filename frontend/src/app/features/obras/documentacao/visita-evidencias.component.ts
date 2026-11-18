import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { CesAsyncStateComponent, CesButtonComponent, CesDialogShellComponent, CesIconButtonComponent, NotificationService } from '@ces/ui';
import { Observable, take } from 'rxjs';
import { EvidenciaVisita } from '../../../core/models/obras-documentacao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ObrasDocumentacaoService } from '../../../core/services/obras-documentacao.service';
import { EvidenciaPendente, LIMITE_EVIDENCIA_BYTES, TIPOS_EVIDENCIA, descricaoDaEvidencia, problemaDoArquivo } from './visita-evidencias.logic';

/** Uma evidência na tela: já gravada ou ainda no aparelho, esperando a visita ser salva. */
type Entrada = { tipo: 'gravada'; evidencia: EvidenciaVisita } | { tipo: 'pendente'; pendente: EvidenciaPendente };

/**
 * Evidências opcionais da visita prévia, de uma pergunta ou gerais: miniaturas, câmera do celular, anexo de foto ou PDF,
 * visualização e remoção. Nunca bloqueia a visita: no máximo, oferece "adicionar evidência".
 */
@Component({
  selector: 'app-visita-evidencias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesAsyncStateComponent, CesButtonComponent, CesDialogShellComponent, CesIconButtonComponent],
  template: `
    @if (entradas().length) {
      <ul class="ve-lista" [attr.aria-label]="rotulo()">
        @for (en of entradas(); track chave(en)) {
          <li class="ve-item">
            <button type="button" class="ve-mini" [attr.aria-label]="'Ver ' + nomeDe(en)" [title]="nomeDe(en)" (click)="ver(en)">
              @if (miniaturaDe(en); as src) {
                <img [src]="src" alt="" />
              } @else if (ehPdf(en)) {
                <span class="ve-mini__pdf"><i class="pi pi-file-pdf" aria-hidden="true"></i><span>PDF</span></span>
              } @else {
                <i class="pi pi-image" aria-hidden="true"></i>
              }
              @if (en.tipo === 'pendente') {
                <span class="ve-mini__selo" title="Salvo no aparelho; vai junto quando a visita for salva">Ao salvar</span>
              }
            </button>
            @if (podeEscrever()) {
              <ces-icon-button class="ve-item__remover" icon="pi pi-times" [label]="'Remover ' + nomeDe(en)" size="icon-sm" variant="ghost" (pressed)="remover(en)"></ces-icon-button>
            }
          </li>
        }
      </ul>
    }
    @if (podeEscrever()) {
      <div class="ve-acoes" [class.ve-acoes--discreta]="discreto()">
        <input #arquivo type="file" class="ve-oculto" [accept]="tipos" multiple (change)="escolher($event)" />
        <input #camera type="file" class="ve-oculto" accept="image/*" capture="environment" (change)="escolher($event)" />
        <ces-button variant="ghost" size="sm" icon="pi pi-paperclip" [label]="discreto() && !entradas().length ? 'Adicionar evidência' : 'Anexar'" [ariaLabel]="'Anexar foto ou PDF' + (rotulo() ? ' em ' + rotulo() : '')" (pressed)="arquivo.click()"></ces-button>
        <ces-button variant="ghost" size="sm" icon="pi pi-camera" label="Tirar foto" [ariaLabel]="'Tirar foto com a câmera' + (rotulo() ? ' para ' + rotulo() : '')" (pressed)="camera.click()"></ces-button>
        @if (!discreto()) {
          <span class="ve-dica">JPG, PNG ou PDF, até 15 MB. Opcional.</span>
        }
      </div>
    } @else if (!entradas().length && !discreto()) {
      <p class="ve-dica">Nenhuma evidência anexada.</p>
    }

    <ces-dialog-shell [visible]="!!aberta()" (visibleChange)="$event || fecharFoto()" [title]="tituloAberta()" size="lg">
      <div class="ve-foto">
        @if (urlAberta(); as src) {
          <img [src]="src" [alt]="tituloAberta()" />
        } @else if (erroAberta()) {
          <ces-async-state state="error" [compact]="true" title="Não foi possível abrir a foto" [description]="erroAberta()!"></ces-async-state>
        } @else {
          <ces-async-state state="loading" [compact]="true" title="Abrindo a foto"></ces-async-state>
        }
      </div>
      <div dialog-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Fechar" (pressed)="fecharFoto()"></ces-button>
      </div>
    </ces-dialog-shell>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
    .ve-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.75rem, 1fr)); gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .ve-item { position: relative; min-width: 0; }
    .ve-mini { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 1; overflow: hidden; padding: 0; border: 1px solid var(--ces-border-strong); border-radius: var(--ces-radius-md); background: var(--ces-surface-muted); color: var(--ces-foreground-muted); cursor: zoom-in; }
    .ve-mini:hover { border-color: var(--ces-brand); }
    .ve-mini:focus-visible { outline: 3px solid var(--ces-focus-ring); outline-offset: 2px; }
    .ve-mini img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .ve-mini__pdf { display: flex; flex-direction: column; align-items: center; gap: 0.125rem; color: var(--ces-danger-text); font-size: 0.6875rem; font-weight: 700; }
    .ve-mini__pdf .pi { font-size: 1.25rem; }
    .ve-mini__selo { position: absolute; inset: auto 0 0 0; padding: 0.125rem 0.25rem; background: var(--ces-info-soft); color: var(--ces-info-text); font-size: 0.625rem; font-weight: 700; text-align: center; backdrop-filter: blur(4px); }
    .ve-item__remover { position: absolute; top: 0.125rem; right: 0.125rem; border-radius: 999px; background: var(--ces-surface); box-shadow: var(--ces-shadow-sm); }
    .ve-acoes { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; }
    .ve-acoes--discreta { margin-left: -0.5rem; }
    .ve-oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
    .ve-dica { margin: 0; color: var(--ces-foreground-muted); font-size: 0.75rem; }
    .ve-foto { display: grid; place-items: center; min-height: 14rem; overflow: hidden; border-radius: var(--ces-radius-md); background: var(--ces-surface-muted); }
    .ve-foto img { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; }
  `
})
export class VisitaEvidenciasComponent {
  private readonly servico = inject(ObrasDocumentacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly idObra = input.required<string>();
  readonly idVisita = input<string | null>(null);
  readonly gravadas = input<EvidenciaVisita[]>([]);
  readonly pendentes = input<EvidenciaPendente[]>([]);
  readonly podeEscrever = input(false);
  /** Na pergunta, só um botão "Adicionar evidência"; nas gerais, com a dica dos formatos. */
  readonly discreto = input(false);
  readonly rotulo = input('');

  readonly adicionar = output<File[]>();
  readonly removerGravada = output<EvidenciaVisita>();
  readonly removerPendente = output<EvidenciaPendente>();

  protected readonly tipos = TIPOS_EVIDENCIA.join(',');
  protected readonly entradas = computed<Entrada[]>(() => [
    ...this.gravadas().map((evidencia) => ({ tipo: 'gravada' as const, evidencia })),
    ...this.pendentes().map((pendente) => ({ tipo: 'pendente' as const, pendente }))
  ]);

  private readonly miniaturas = signal<Record<string, string>>({});
  private readonly pedidas = new Set<string>();
  protected readonly aberta = signal<Entrada | null>(null);
  protected readonly urlAberta = signal<string | null>(null);
  protected readonly erroAberta = signal<string | null>(null);
  private urlTemporaria: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      Object.values(this.miniaturas()).forEach((url) => URL.revokeObjectURL(url));
      if (this.urlTemporaria) URL.revokeObjectURL(this.urlTemporaria);
    });
  }

  protected chave(en: Entrada): string {
    return en.tipo === 'gravada' ? en.evidencia.id : en.pendente.chave;
  }

  protected nomeDe(en: Entrada): string {
    return en.tipo === 'gravada' ? descricaoDaEvidencia(en.evidencia) : en.pendente.arquivo.name;
  }

  protected ehPdf(en: Entrada): boolean {
    return en.tipo === 'gravada' ? !en.evidencia.foto : en.pendente.arquivo.type === 'application/pdf';
  }

  /** A foto gravada exige login, por isso vem como blob, e é pedida uma vez só. */
  protected miniaturaDe(en: Entrada): string | null {
    if (en.tipo === 'pendente') return en.pendente.url;
    const e = en.evidencia;
    if (!e.foto) return null;
    const pronta = this.miniaturas()[e.id];
    if (pronta) return pronta;
    const idVisita = this.idVisita();
    if (idVisita && !this.pedidas.has(e.id)) {
      this.pedidas.add(e.id);
      this.servico.miniaturaDaEvidenciaDaVisita(this.idObra(), idVisita, e.id).pipe(take(1)).subscribe({
        next: (blob) => this.miniaturas.update((m) => ({ ...m, [e.id]: URL.createObjectURL(blob) })),
        error: () => undefined
      });
    }
    return null;
  }

  protected escolher(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivos = Array.from(campo.files ?? []);
    campo.value = '';
    const aceitos: File[] = [];
    for (const arquivo of arquivos) {
      const problema = problemaDoArquivo(arquivo, LIMITE_EVIDENCIA_BYTES);
      if (problema) this.notificacoes.warning(problema);
      else aceitos.push(arquivo);
    }
    if (aceitos.length) this.adicionar.emit(aceitos);
  }

  protected remover(en: Entrada): void {
    if (en.tipo === 'gravada') this.removerGravada.emit(en.evidencia);
    else this.removerPendente.emit(en.pendente);
  }

  protected tituloAberta(): string {
    const en = this.aberta();
    return en ? this.nomeDe(en) : '';
  }

  /** Foto abre aqui; PDF abre em outra aba do navegador. */
  protected ver(en: Entrada): void {
    if (en.tipo === 'pendente') {
      if (this.ehPdf(en)) return this.abrirNaAba(new Observable<Blob>((s) => { s.next(en.pendente.arquivo); s.complete(); }));
      this.aberta.set(en);
      this.erroAberta.set(null);
      this.urlAberta.set(en.pendente.url);
      return;
    }
    const idVisita = this.idVisita();
    if (!idVisita) return;
    const pedido = this.servico.arquivoDaEvidenciaDaVisita(this.idObra(), idVisita, en.evidencia.id);
    if (!en.evidencia.foto) return this.abrirNaAba(pedido);
    this.aberta.set(en);
    this.erroAberta.set(null);
    this.urlAberta.set(null);
    pedido.pipe(take(1)).subscribe({
      next: (blob) => this.urlAberta.set(this.temporaria(blob)),
      error: (e) => this.erroAberta.set(getErrorMessage(e))
    });
  }

  protected fecharFoto(): void {
    this.aberta.set(null);
    this.urlAberta.set(null);
  }

  private abrirNaAba(pedido: Observable<Blob>): void {
    pedido.pipe(take(1)).subscribe({
      next: (blob) => {
        const url = this.temporaria(new Blob([blob], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private temporaria(blob: Blob): string {
    if (this.urlTemporaria) URL.revokeObjectURL(this.urlTemporaria);
    this.urlTemporaria = URL.createObjectURL(blob);
    return this.urlTemporaria;
  }
}
