import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Location } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  DOCUMENTOS_LEGAIS,
  DocumentoLegal,
  DocumentoLegalId,
  trechosLegais
} from './documentos-legais.data';

/**
 * Página pública da Política de Privacidade e dos Termos de Uso (`/privacidade`, `/termos`).
 * Fica fora do shell e sem login, para ser aberta da tela de entrada e por quem recebe o link.
 */
@Component({
  selector: 'app-documento-legal',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let doc = documento();
    <div class="legal-pagina">
      <header class="legal-topo">
        <a routerLink="/login" class="legal-marca" aria-label="GEO, ir para a entrada">
          <img src="assets/logo.svg" alt="" width="36" height="36" />
          <span>GEO</span>
        </a>
        <nav class="legal-abas" aria-label="Documentos legais">
          <a routerLink="/privacidade" [class.ativo]="doc.id === 'privacidade'"
             [attr.aria-current]="doc.id === 'privacidade' ? 'page' : null">Privacidade</a>
          <a routerLink="/termos" [class.ativo]="doc.id === 'termos'"
             [attr.aria-current]="doc.id === 'termos' ? 'page' : null">Termos de uso</a>
        </nav>
      </header>

      <main class="legal-corpo">
        <article class="legal-documento" [attr.aria-labelledby]="'legal-titulo'">
          <h1 id="legal-titulo">{{ doc.titulo }}</h1>
          <p class="legal-meta">
            Versão {{ doc.versao }} · Vigente desde
            @for (t of trechos(doc.vigencia); track $index) {
              @if (t.pendente) { <mark>{{ t.texto }}</mark> } @else { {{ t.texto }} }
            }
          </p>
          <p class="legal-resumo">{{ doc.resumo }}</p>

          <nav class="legal-sumario" aria-label="Nesta página">
            <p class="legal-sumario-titulo">Nesta página</p>
            <ol>
              @for (secao of doc.secoes; track secao.id) {
                <li>
                  <button type="button" (click)="irPara(secao.id)">{{ secao.titulo }}</button>
                </li>
              }
            </ol>
          </nav>

          @for (secao of doc.secoes; track secao.id; let i = $index) {
            <section class="legal-secao" [id]="'secao-' + secao.id">
              <h2>{{ i + 1 }}. {{ secao.titulo }}</h2>
              @for (p of secao.paragrafos ?? []; track $index) {
                <p>
                  @for (t of trechos(p); track $index) {
                    @if (t.pendente) { <mark>{{ t.texto }}</mark> } @else { {{ t.texto }} }
                  }
                </p>
              }
              @if (secao.itens?.length) {
                <ul>
                  @for (item of secao.itens; track $index) {
                    <li>
                      @for (t of trechos(item); track $index) {
                        @if (t.pendente) { <mark>{{ t.texto }}</mark> } @else { {{ t.texto }} }
                      }
                    </li>
                  }
                </ul>
              }
              @for (p of secao.fechamento ?? []; track $index) {
                <p>
                  @for (t of trechos(p); track $index) {
                    @if (t.pendente) { <mark>{{ t.texto }}</mark> } @else { {{ t.texto }} }
                  }
                </p>
              }
            </section>
          }

          <footer class="legal-rodape">
            <button type="button" class="legal-voltar" (click)="voltar()">Voltar</button>
            @if (doc.id === 'privacidade') {
              <a routerLink="/termos">Ler os Termos de Uso</a>
            } @else {
              <a routerLink="/privacidade">Ler a Política de Privacidade</a>
            }
          </footer>
        </article>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .legal-pagina {
      min-height: 100dvh;
      background: var(--geo-canvas);
      color: var(--geo-foreground);
    }
    .legal-topo {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem clamp(1rem, 4vw, 2rem);
      background: var(--geo-surface);
      border-bottom: 1px solid var(--geo-border);
    }
    .legal-marca {
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
      font-weight: 600;
      font-size: 1.125rem;
      color: var(--geo-foreground);
      text-decoration: none;
    }
    .legal-abas { display: flex; gap: 0.25rem; }
    .legal-abas a {
      padding: 0.5rem 0.875rem;
      border-radius: var(--geo-radius-md);
      font-size: var(--geo-font-control);
      font-weight: 600;
      color: var(--geo-foreground-muted);
      text-decoration: none;
    }
    .legal-abas a.ativo {
      background: var(--geo-brand-soft);
      color: var(--geo-brand);
    }
    .legal-corpo { padding: clamp(1.5rem, 5vw, 3rem) clamp(1rem, 4vw, 2rem) 4rem; }
    .legal-documento {
      max-width: 48rem;
      margin: 0 auto;
      background: var(--geo-surface);
      border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-xl);
      padding: clamp(1.25rem, 5vw, 3rem);
      box-shadow: var(--geo-shadow-sm);
    }
    h1 {
      font-size: clamp(1.75rem, 4vw, 2.25rem);
      font-weight: 600;
      line-height: 1.15;
      margin: 0;
    }
    .legal-meta {
      margin: 0.5rem 0 0;
      font-size: var(--geo-font-caption);
      color: var(--geo-foreground-subtle);
    }
    .legal-resumo {
      margin: 1.25rem 0 0;
      font-size: 1.0625rem;
      line-height: 1.6;
      color: var(--geo-foreground-muted);
    }
    .legal-sumario {
      margin: 2rem 0;
      padding: 1rem 1.25rem;
      background: var(--geo-surface-muted);
      border-radius: var(--geo-radius-lg);
    }
    .legal-sumario-titulo {
      margin: 0 0 0.5rem;
      font-size: var(--geo-font-caption);
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
      color: var(--geo-foreground-subtle);
    }
    .legal-sumario ol {
      margin: 0;
      padding-left: 1.25rem;
      columns: 2 16rem;
      column-gap: 2rem;
    }
    .legal-sumario li { break-inside: avoid; padding: 0.125rem 0; }
    .legal-sumario button {
      background: none;
      border: 0;
      padding: 0.125rem 0;
      font: inherit;
      font-size: var(--geo-font-body);
      color: var(--geo-brand);
      text-align: left;
      cursor: pointer;
    }
    .legal-sumario button:hover { text-decoration: underline; }
    .legal-secao { scroll-margin-top: 5rem; margin-top: 2rem; }
    h2 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; }
    .legal-secao p, .legal-secao li {
      font-size: 1rem;
      line-height: 1.7;
      color: var(--geo-foreground);
    }
    .legal-secao p { margin: 0 0 0.75rem; }
    .legal-secao ul { margin: 0 0 0.75rem; padding-left: 1.25rem; list-style: disc; }
    .legal-sumario ol { list-style: decimal; }
    .legal-documento { overflow-wrap: break-word; }
    .legal-secao li { margin-bottom: 0.375rem; }
    mark {
      background: var(--geo-warning-soft);
      color: var(--geo-warning-text);
      border-radius: var(--geo-radius-sm);
      padding: 0 0.25rem;
      font-weight: 600;
    }
    .legal-rodape {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--geo-border);
    }
    .legal-rodape a { color: var(--geo-brand); font-weight: 600; }
    .legal-voltar {
      min-height: var(--geo-touch-target);
      padding: 0 1.25rem;
      border-radius: var(--geo-radius-md);
      border: 1px solid var(--geo-border-strong);
      background: var(--geo-surface);
      color: var(--geo-foreground);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    a:focus-visible, button:focus-visible {
      outline: 2px solid var(--geo-focus-ring);
      outline-offset: 2px;
    }
    @media print {
      .legal-topo, .legal-sumario, .legal-rodape { display: none; }
      .legal-documento { border: 0; box-shadow: none; padding: 0; }
    }
  `]
})
export class DocumentoLegalComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  private readonly id = toSignal(
    this.route.data.pipe(map(data => (data['documento'] as DocumentoLegalId) ?? 'privacidade')),
    { initialValue: (this.route.snapshot.data['documento'] as DocumentoLegalId) ?? 'privacidade' }
  );

  protected readonly documento = computed<DocumentoLegal>(() => DOCUMENTOS_LEGAIS[this.id()]);
  protected readonly trechos = trechosLegais;

  protected irPara(secaoId: string): void {
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('secao-' + secaoId)
      ?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
  }

  /** Volta para a tela de onde veio; aberta direto pelo link, vai para a entrada. */
  protected voltar(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigateByUrl('/login');
    }
  }
}
