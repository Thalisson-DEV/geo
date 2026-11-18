import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { Router } from '@angular/router';
import { CesButtonComponent, CesCalloutComponent, CesDrawerComponent, CesStatusComponent, CesTone } from '@ces/ui';
import { ComunicadoMuralResponse } from '../../../core/models/notificacao.models';
import { MuralStore } from '../../../core/services/mural-store.service';
import { TIPO_COMUNICADO_ICONES, TOM_TIPO_COMUNICADO, formatarDataHora } from '../../../features/notificacoes/notificacoes-ui';
import { ComunicadoConteudoComponent } from '../comunicado-conteudo/comunicado-conteudo.component';

/**
 * Leitura de um comunicado fora do fluxo de modal-ao-entrar (banner expandido, cartão do mural).
 * Fechar aqui não dispensa nada: a dispensa é sempre uma ação rotulada.
 */
@Component({
  selector: 'app-comunicado-detalhe-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesButtonComponent, CesCalloutComponent, CesDrawerComponent, CesStatusComponent, ComunicadoConteudoComponent],
  styles: `
    .cd { display: grid; gap: 1rem; }
    .cd-hero {
      display: grid;
      gap: 0.5rem;
      padding: 0.875rem 1rem;
      border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-lg);
      background: var(--ces-surface-subtle);
    }
    .cd-hero__topo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
    .cd-hero__resumo { margin: 0; color: var(--ces-foreground); font-size: var(--ces-font-body); font-weight: 500; line-height: 1.5; }
    .cd-hero__meta { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .cd-hero__meta span { display: inline-flex; align-items: center; gap: 0.3rem; }
    .cd-rodape { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; width: 100%; }
  `,
  template: `
    @if (comunicado(); as item) {
      <ces-drawer [visible]="true" (visibleChange)="!$event && comunicado.set(null)" [eyebrow]="item.tipoRotulo" [title]="item.titulo" size="lg">
        <div class="cd">
          <section class="cd-hero" aria-label="Resumo do comunicado">
            <div class="cd-hero__topo">
              <ces-status [tone]="tom(item)" [icon]="icone(item)" emphasis="solid">{{ item.tipoRotulo }}</ces-status>
              @if (item.fixado) {
                <ces-status tone="neutral" icon="pi pi-thumbtack">Fixado</ces-status>
              }
              @if (item.exigeConfirmacao) {
                @if (item.confirmado) {
                  <ces-status tone="success" icon="pi pi-verified">Leitura confirmada</ces-status>
                } @else {
                  <ces-status tone="warning" icon="pi pi-exclamation-circle">Exige confirmação de leitura</ces-status>
                }
              }
            </div>
            @if (item.resumo) {
              <p class="cd-hero__resumo">{{ item.resumo }}</p>
            }
            <p class="cd-hero__meta">
              @if (item.dataInicio) {
                <span><i class="pi pi-calendar" aria-hidden="true"></i>Publicado em {{ quando(item.dataInicio) }}</span>
              }
              @if (item.dataFim) {
                <span><i class="pi pi-hourglass" aria-hidden="true"></i>No ar até {{ quando(item.dataFim) }}</span>
              }
            </p>
          </section>

          <app-comunicado-conteudo [comunicado]="item"></app-comunicado-conteudo>

          @if (item.exigeConfirmacao && !item.confirmado) {
            <ces-callout tone="warning" [dense]="true">Ao confirmar, sua leitura fica registrada como prova de comunicação.</ces-callout>
          }
        </div>

        <div drawer-footer class="cd-rodape">
          @if (item.acaoRotulo && item.acaoDeeplink) {
            <ces-button variant="outline" icon="pi pi-arrow-up-right" [label]="item.acaoRotulo" (pressed)="executarAcao(item)"></ces-button>
          }
          @if (item.exigeConfirmacao && !item.confirmado) {
            <ces-button variant="success" icon="pi pi-check" label="Li e entendi" (pressed)="confirmar(item)"></ces-button>
          } @else {
            <ces-button variant="ghost" label="Fechar" (pressed)="comunicado.set(null)"></ces-button>
          }
        </div>
      </ces-drawer>
    }
  `
})
export class ComunicadoDetalheDialogComponent {
  private readonly mural = inject(MuralStore);
  private readonly router = inject(Router);

  readonly comunicado = model<ComunicadoMuralResponse | null>(null);

  protected confirmar(item: ComunicadoMuralResponse): void {
    this.mural.confirmar(item);
    this.comunicado.set(null);
  }

  protected executarAcao(item: ComunicadoMuralResponse): void {
    if (!item.acaoDeeplink) return;
    this.comunicado.set(null);
    void this.router.navigateByUrl(item.acaoDeeplink);
  }

  protected icone(item: ComunicadoMuralResponse): string {
    return TIPO_COMUNICADO_ICONES[item.tipo] ?? 'pi pi-megaphone';
  }

  protected tom(item: ComunicadoMuralResponse): CesTone {
    return TOM_TIPO_COMUNICADO[item.tipo] ?? 'neutral';
  }

  protected quando(valor: string | null): string {
    return formatarDataHora(valor);
  }
}
