import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { GeoTone } from '@geo/ui';
import { Observable } from 'rxjs';

/** Uma foto do relatório; `carregar` busca a imagem com o token do interceptor. */
export interface FotoRelatorio {
  id: string;
  rotulo: string;
  detalhe?: string | null;
  recebida: boolean;
  carregar: () => Observable<Blob>;
  /** Selo opcional sobre a foto (ex.: leitura da IA). */
  selo?: { rotulo: string; tom: GeoTone; icone: string } | null;
}

/**
 * Grade de fotos com legenda. Foto que ainda não chegou do celular aparece como "a caminho",
 * nunca como erro. Clicar abre a imagem inteira em outra aba.
 */
@Component({
  selector: 'app-frota-relatorio-fotos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .fotos { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); margin: 0; padding: 0; list-style: none; }
    .foto { display: grid; gap: 0.375rem; margin: 0; }
    .foto__quadro { position: relative; display: flex; aspect-ratio: 4 / 3; align-items: center; justify-content: center; overflow: hidden;
      border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md, 0.5rem); background: var(--geo-surface-subtle);
      color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); text-align: center; }
    a.foto__quadro:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    a.foto__quadro:hover img { transform: scale(1.02); }
    .foto__quadro img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease; }
    .foto__selo { position: absolute; top: 0.375rem; left: 0.375rem; display: inline-flex; align-items: center; gap: 0.25rem;
      padding: 0.125rem 0.5rem; border-radius: 999px; background: var(--geo-surface); font-size: var(--geo-font-caption); font-weight: 600;
      box-shadow: var(--geo-shadow-sm); }
    .foto__selo[data-tom='success'] { color: var(--geo-success-text); }
    .foto__selo[data-tom='danger'] { color: var(--geo-danger-text); }
    .foto__selo[data-tom='warning'] { color: var(--geo-warning-text); }
    .foto__legenda { font-size: var(--geo-font-caption); font-weight: 600; line-height: 1.35; }
    .foto__detalhe { display: block; font-weight: 400; color: var(--geo-foreground-muted); }
    @media (prefers-reduced-motion: reduce) { .foto__quadro img { transition: none; } }
    @media print { .fotos { grid-template-columns: repeat(4, minmax(0, 1fr)); } .foto { break-inside: avoid; } }
  `,
  template: `
    <ul class="fotos">
      @for (f of fotos(); track f.id) {
        <li>
          <figure class="foto">
            @if (!f.recebida) {
              <div class="foto__quadro"><span><i class="pi pi-cloud-upload" aria-hidden="true"></i><br />A caminho do celular</span></div>
            } @else if (urls()[f.id]; as url) {
              <a class="foto__quadro" [href]="url" target="_blank" rel="noopener" [attr.aria-label]="'Abrir foto: ' + f.rotulo">
                <img [src]="url" [alt]="f.rotulo" loading="lazy" />
                @if (f.selo; as selo) {
                  <span class="foto__selo" [attr.data-tom]="selo.tom"><i class="pi {{ selo.icone }}" aria-hidden="true"></i>{{ selo.rotulo }}</span>
                }
              </a>
            } @else if (falhas()[f.id]) {
              <div class="foto__quadro">Não foi possível abrir a foto.</div>
            } @else {
              <div class="foto__quadro" aria-busy="true">Carregando…</div>
            }
            <figcaption class="foto__legenda">
              {{ f.rotulo }}
              @if (f.detalhe) {
                <span class="foto__detalhe">{{ f.detalhe }}</span>
              }
            </figcaption>
          </figure>
        </li>
      }
    </ul>
  `
})
export class FrotaRelatorioFotosComponent {
  readonly fotos = input.required<FotoRelatorio[]>();

  protected readonly urls = signal<Record<string, string>>({});
  protected readonly falhas = signal<Record<string, boolean>>({});
  private readonly pedidas = new Set<string>();

  constructor() {
    effect(() => {
      const fotos = this.fotos();
      untracked(() => {
        for (const f of fotos) {
          if (!f.recebida || this.pedidas.has(f.id)) continue;
          this.pedidas.add(f.id);
          f.carregar().subscribe({
            next: (blob) => this.urls.update((u) => ({ ...u, [f.id]: URL.createObjectURL(blob) })),
            error: () => this.falhas.update((u) => ({ ...u, [f.id]: true }))
          });
        }
      });
    });
    inject(DestroyRef).onDestroy(() => Object.values(this.urls()).forEach((url) => URL.revokeObjectURL(url)));
  }
}
