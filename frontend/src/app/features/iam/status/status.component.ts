import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GeoButtonComponent, GeoPageHeaderComponent, GeoStatusComponent, GeoTone } from '@geo/ui';
import { PublicStatusComponent, PublicStatus } from '../../../core/models/status.models';
import { PublicStatusStore } from '../../../core/services/public-status.store';

/** Leitura administrativa do dashboard público sanitizado do Gatus. */
@Component({
  selector: 'app-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent, GeoPageHeaderComponent, GeoStatusComponent],
  template: `
    <div class="geo-page">
      <geo-page-header title="Status do ecossistema" icon="pi pi-heart" [breadcrumb]="breadcrumbItems"
        description="Saúde dos serviços publicada pelo monitor independente (somente leitura).">
        @if (status.statusPageConfigured) {
          <geo-button actions label="Página pública" icon="pi-external-link" variant="outline" (pressed)="status.openStatusPage()"></geo-button>
        }
        <geo-button actions label="Atualizar" icon="pi-refresh" variant="secondary" [loading]="status.refreshing()" (pressed)="status.refresh()"></geo-button>
      </geo-page-header>

      <div class="status-page">
        <header class="status-page__header">
          <div>
            <span class="status-page__eyebrow">Observabilidade independente</span>
            <h1>Saúde dos serviços</h1>
            <p>Dados sanitizados publicados pelo Gatus. Esta tela é somente leitura.</p>
          </div>
          <geo-status [tone]="overallTone()" emphasis="solid" [icon]="overallIcon()">
            {{ overallLabel() }}
          </geo-status>
        </header>

        @if (status.sourceState() === 'loading' && !status.projection()) {
          <div class="status-page__state" role="status" aria-live="polite">
            <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
            <span>Consultando o monitor...</span>
          </div>
        } @else if (status.sourceError()) {
          <div class="status-page__state status-page__state--attention" role="status" aria-live="polite">
            <i class="pi pi-question-circle" aria-hidden="true"></i>
            <span>{{ sourceMessage() }}</span>
          </div>
        }

        <section aria-labelledby="status-components-title">
          <div class="status-page__section-heading">
            <div>
              <span class="status-page__eyebrow">Componentes monitorados</span>
              <h2 id="status-components-title">Estado atual</h2>
            </div>
            @if (status.projection(); as projection) {
              <span class="status-page__updated">Atualizado em {{ projection.generatedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</span>
            }
          </div>

          <div class="status-page__grid">
            @for (component of components(); track component.key) {
              <article class="status-page__component">
                <div class="status-page__component-heading">
                  <span class="status-page__component-name">{{ component.label }}</span>
                  <geo-status [tone]="componentTone(component.status)" [icon]="componentIcon(component.status)">
                    {{ statusLabel(component.status) }}
                  </geo-status>
                </div>
                <p>{{ component.message }}</p>
                <time [dateTime]="component.observedAt">Evidência em {{ component.observedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</time>
              </article>
            } @empty {
              <div class="status-page__empty">
                <i class="pi pi-info-circle" aria-hidden="true"></i>
                <span>Nenhum componente foi publicado pelo monitor.</span>
              </div>
            }
          </div>
        </section>

        <footer class="status-page__footer">
          <i class="pi pi-shield" aria-hidden="true"></i>
          <span>O monitor é independente da autenticação e da API de negócio do GEO.</span>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .status-page { display: flex; flex-direction: column; gap: 1.25rem; }
      .status-page__header, .status-page__section-heading, .status-page__component-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .status-page__header { padding: 1.25rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface); }
      .status-page__eyebrow { display: block; color: var(--geo-foreground-subtle); font-size: var(--geo-font-caption); font-weight: 600; letter-spacing: 0; text-transform: none; }
      .status-page h1, .status-page h2 { margin: 0.35rem 0 0; color: var(--geo-foreground); font-weight: 600; }
      .status-page h1 { font-size: 1.1rem; }
      .status-page h2 { font-size: 0.95rem; }
      .status-page__header p { margin: 0.35rem 0 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-body); }
      .status-page__section-heading { align-items: flex-end; padding: 0 0.25rem; }
      .status-page__updated, .status-page__component time { color: var(--geo-foreground-subtle); font-size: var(--geo-font-caption); }
      .status-page__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
      .status-page__component { min-width: 0; padding: 1rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
      .status-page__component-name { min-width: 0; overflow: hidden; color: var(--geo-foreground); font-size: var(--geo-font-body); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
      .status-page__component p { min-height: 2.2rem; margin: 0.75rem 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-control); line-height: 1.5; }
      .status-page__state, .status-page__empty, .status-page__footer { display: flex; align-items: center; gap: 0.65rem; color: var(--geo-foreground-muted); font-size: var(--geo-font-control); }
      .status-page__state { padding: 0.85rem 1rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
      .status-page__state--attention { color: var(--geo-warning); }
      .status-page__empty { justify-content: center; grid-column: 1 / -1; min-height: 8rem; padding: 1rem; border: 1px dashed var(--geo-border-strong); border-radius: var(--geo-radius-md); }
      .status-page__footer { padding: 0.75rem 0.25rem; border-top: 1px solid var(--geo-border); }
      @media (max-width: 640px) {
        .status-page__header, .status-page__section-heading { align-items: flex-start; flex-direction: column; }
        .status-page__header { padding: 1rem; }
      }
      @media print { .status-page__footer { display: none; } }
    `,
  ],
})
export class StatusComponent {
  protected readonly status = inject(PublicStatusStore);
  protected readonly breadcrumbItems = [
    { label: 'Administração' },
    { label: 'Sistema' },
    { label: 'Status' },
  ];

  protected readonly components = computed(() => this.status.projection()?.components ?? []);

  protected overallLabel(): string {
    if (this.status.sourceError()) return 'Fonte indisponível';
    return this.statusLabel(this.status.projection()?.overallStatus ?? 'UNKNOWN');
  }

  protected overallTone(): GeoTone {
    if (this.status.sourceError()) return 'neutral';
    return this.componentTone(this.status.projection()?.overallStatus ?? 'UNKNOWN');
  }

  protected overallIcon(): string {
    if (this.status.sourceError()) return 'pi-question-circle';
    return this.componentIcon(this.status.projection()?.overallStatus ?? 'UNKNOWN');
  }

  protected sourceMessage(): string {
    switch (this.status.sourceError()) {
      case 'offline': return 'Você está offline; não foi possível atualizar o status.';
      case 'stale': return 'A projeção do monitor está antiga. Aguarde uma nova evidência.';
      default: return 'Não foi possível consultar a fonte de status agora.';
    }
  }

  protected statusLabel(status: PublicStatus): string {
    switch (status) {
      case 'UP': return 'Operacional';
      case 'DOWN': return 'Indisponível';
      case 'DEGRADED': return 'Degradado';
      default: return 'Desconhecido';
    }
  }

  protected componentTone(status: PublicStatus): GeoTone {
    switch (status) {
      case 'UP': return 'success';
      case 'DOWN': return 'danger';
      case 'DEGRADED': return 'warning';
      default: return 'neutral';
    }
  }

  protected componentIcon(status: PublicStatus): string {
    switch (status) {
      case 'UP': return 'pi-check-circle';
      case 'DOWN': return 'pi-times-circle';
      case 'DEGRADED': return 'pi-exclamation-triangle';
      default: return 'pi-question-circle';
    }
  }
}
