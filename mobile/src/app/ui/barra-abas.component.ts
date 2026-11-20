import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { IconeComponent, NomeIcone } from './icone.component';

export interface Aba {
  rota: string;
  rotulo: string;
  icone: NomeIcone;
  /** Número pequeno sobre o ícone (ex.: pendências). */
  marcador?: number;
  /** Outras rotas que pertencem a esta aba (ex.: Material → /solicitacoes, /transferencias). */
  ativaEm?: string[];
}

/** Onde a navegação fica: barra de abas embaixo (celular, tablet em pé) ou barra lateral (tablet deitado). */
export type ModoNavegacao = 'inferior' | 'lateral';

/**
 * Navegação principal (Material 3): 3 a 5 destinos, rótulo sempre visível, pílula no ativo.
 * No modo lateral vira o "navigation rail": coluna estreita à esquerda com a marca no topo,
 * ao alcance do polegar com o tablet deitado nas duas mãos.
 */
@Component({
  selector: 'geo-barra-abas',
  standalone: true,
  imports: [RouterLink, IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.lateral]': "modo() === 'lateral'" },
  template: `
    <nav class="barra" aria-label="Navegação principal">
      @if (modo() === 'lateral') {
        <img class="marca" src="logo_vertical.svg" alt="" width="40" height="40">
      }
      @for (aba of abas(); track aba.rota) {
        <a class="aba" [routerLink]="aba.rota" [class.ativa]="ativa(aba)" [attr.aria-current]="ativa(aba) ? 'page' : null">
          <span class="pilula">
            <geo-icone [nome]="aba.icone" />
            @if (aba.marcador) {
              <span class="marcador geo-num" aria-hidden="true">{{ aba.marcador > 99 ? '99+' : aba.marcador }}</span>
              <span class="geo-sr-only">, {{ aba.marcador }} aguardando envio</span>
            }
          </span>
          <span class="rotulo">{{ aba.rotulo }}</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    :host { display: block; flex: none; }
    .barra { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; background: var(--geo-superficie);
      border-top: 1px solid var(--geo-linha); padding: 6px max(4px, var(--geo-recuo-coluna)) calc(6px + var(--geo-safe-base)); }
    .aba { display: grid; justify-items: center; align-content: start; gap: 4px; min-height: 56px; padding-top: 4px;
      text-decoration: none; color: var(--geo-texto-2); font: 500 .75rem/1.2 var(--geo-fonte);
      -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
    .pilula { position: relative; width: 60px; height: 32px; border-radius: var(--geo-r-pilula); display: grid; place-items: center;
      transition: background-color var(--geo-m-entrar) var(--geo-curva), transform 100ms var(--geo-curva); }
    .aba.ativa { color: var(--geo-texto); font-weight: 600; }
    .aba.ativa .pilula { background: var(--geo-destaque-suave); color: var(--geo-destaque); }
    .aba:active .pilula { background: var(--geo-superficie-2); transform: scale(.96); }
    .aba:focus-visible { outline: none; }
    .aba:focus-visible .pilula { outline: 2px solid var(--geo-destaque); outline-offset: 2px; }
    .marcador { position: absolute; top: -2px; left: 34px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
      border-radius: 9px; background: var(--geo-destaque); color: var(--geo-destaque-texto); font: 600 .6875rem/18px var(--geo-fonte);
      text-align: center; }

    /* Barra lateral: coluna à esquerda, destinos empilhados a partir do topo (logo do app em cima). */
    :host(.lateral) { height: 100%; width: var(--geo-nav-lateral); }
    :host(.lateral) .barra { height: 100%; grid-auto-flow: row; grid-auto-rows: max-content; grid-auto-columns: auto;
      align-content: start; justify-items: stretch; gap: var(--geo-e3);
      border-top: 0; border-right: 1px solid var(--geo-linha);
      padding: calc(var(--geo-e4) + var(--geo-safe-topo)) 0 calc(var(--geo-e4) + var(--geo-safe-base)); }
    :host(.lateral) .marca { display: block; justify-self: center; margin-bottom: var(--geo-e4); border-radius: 11px; }
    :host(.lateral) .aba { min-height: 64px; padding-top: 0; }
  `],
})
export class BarraAbasComponent {
  private readonly router = inject(Router);
  readonly abas = input.required<Aba[]>();
  readonly modo = input<ModoNavegacao>('inferior');
  private readonly url = signal(this.router.url);

  constructor() {
    const sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => this.url.set((e as NavigationEnd).urlAfterRedirects));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  ativa(aba: Aba): boolean {
    const caminho = this.url().split('?')[0];
    return [aba.rota, ...(aba.ativaEm ?? [])].some(r => caminho === r || caminho.startsWith(r + '/'));
  }
}
