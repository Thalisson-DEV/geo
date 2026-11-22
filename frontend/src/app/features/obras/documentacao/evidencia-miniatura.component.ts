import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal } from '@angular/core';
import { take } from 'rxjs';
import { EvidenciaPonto } from '../../../core/models/obras-documentacao.models';
import { ObrasDocumentacaoService } from '../../../core/services/obras-documentacao.service';

/** Miniatura de uma foto do book. A foto exige login, por isso vem como blob, e só é pedida quando aparece na tela. */
@Component({
  selector: 'app-evidencia-miniatura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="em" [attr.aria-label]="'Ver a foto: ' + descricao()" [title]="descricao()" (click)="abrir.emit()">
      @if (url(); as src) {
        <img [src]="src" alt="" />
      } @else if (falhou()) {
        <i class="pi pi-image" aria-hidden="true"></i>
      }
      @if (selo(); as s) { <span class="em-selo" [attr.data-tom]="s.tom" [title]="s.texto"><i [class]="'pi ' + s.icone" aria-hidden="true"></i></span> }
    </button>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .em { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 1; overflow: hidden; padding: 0; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); color: var(--geo-foreground-muted); cursor: zoom-in; }
    .em:hover { border-color: var(--geo-brand); }
    .em:focus-visible { outline: 3px solid var(--geo-focus-ring); outline-offset: 2px; }
    .em img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .em-selo { position: absolute; top: 0.25rem; right: 0.25rem; display: grid; place-items: center; width: 1.125rem; height: 1.125rem; border-radius: 999px;
      font-size: 0.625rem; color: var(--geo-surface-raised); box-shadow: 0 0 0 2px var(--geo-surface-raised); }
    .em-selo[data-tom='success'] { background: var(--geo-success); }
    .em-selo[data-tom='danger'] { background: var(--geo-danger); }
    .em-selo[data-tom='warning'] { background: var(--geo-warning); }
  `
})
export class EvidenciaMiniaturaComponent {
  private readonly servico = inject(ObrasDocumentacaoService);
  private readonly elemento = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly idObra = input.required<string>();
  readonly evidencia = input.required<EvidenciaPonto>();
  readonly abrir = output<void>();

  protected readonly url = signal<string | null>(null);
  protected readonly falhou = signal(false);

  protected descricao(): string {
    const e = this.evidencia();
    const item = e.tituloItem ?? 'Outras evidências';
    const base = e.legenda ? `${item}, ${e.legenda}` : item;
    const selo = this.selo();
    return selo ? `${base} (${selo.texto.toLowerCase()})` : base;
  }

  /** Situação da revisão no canto da miniatura: dá para ver de longe o que falta revisar ou refazer. */
  protected selo(): { tom: 'success' | 'danger' | 'warning'; icone: string; texto: string } | null {
    switch (this.evidencia().revisao) {
      case 'APROVADA': return { tom: 'success', icone: 'pi-check', texto: 'Aprovada' };
      case 'REPROVADA': return { tom: 'danger', icone: 'pi-times', texto: 'Reprovada' };
      case 'PENDENTE': return { tom: 'warning', icone: 'pi-clock', texto: 'Para revisar' };
      default: return null;
    }
  }

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        this.carregar();
        return;
      }
      const observador = new IntersectionObserver((entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          observador.disconnect();
          this.carregar();
        }
      }, { rootMargin: '200px' });
      observador.observe(this.elemento.nativeElement);
      this.destroyRef.onDestroy(() => observador.disconnect());
    });
    this.destroyRef.onDestroy(() => {
      const atual = this.url();
      if (atual) URL.revokeObjectURL(atual);
    });
  }

  private carregar(): void {
    this.servico.baixarMiniatura(this.idObra(), this.evidencia().id).pipe(take(1)).subscribe({
      next: (blob) => this.url.set(URL.createObjectURL(blob)),
      error: () => this.falhou.set(true)
    });
  }
}
