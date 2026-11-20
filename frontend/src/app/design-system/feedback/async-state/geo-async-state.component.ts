import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { GeoContentState, GeoTone } from '../../core';
import { GeoButtonComponent } from '../../primitives/button';

interface StatePresentation {
  icon: string;
  tone: GeoTone;
  title: string;
  description: string;
}

@Component({
  selector: 'geo-async-state',
  standalone: true,
  imports: [ProgressSpinnerModule, GeoButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-async-state',
    '[attr.data-state]': 'state()',
    '[attr.data-tone]': 'presentation().tone',
    '[attr.aria-busy]': "state() === 'loading' || state() === 'refreshing'"
  },
  template: `
    @if (state() === 'loading' && !compact() && !title()) {
      <!-- Carregando sem mensagem própria: skeleton das linhas (skill: skeleton, não spinner). -->
      <div class="geo-async-state__skeleton" aria-hidden="true">
        @for (linha of linhasSkeleton; track linha) {
          <span class="geo-async-state__skeleton-linha" [style.inline-size]="linha"></span>
        }
      </div>
      <span class="geo-sr-only" role="status">{{ presentation().title }}</span>
    } @else {
      @if (state() === 'loading' || state() === 'refreshing') {
        <p-progress-spinner
          strokeWidth="4"
          [style]="{ width: '1.75rem', height: '1.75rem' }"
          ariaLabel="Carregando"
        ></p-progress-spinner>
      } @else {
        <span class="geo-async-state__icon" aria-hidden="true">
          <i class="pi {{ icon() || presentation().icon }}"></i>
        </span>
      }

      <div class="geo-async-state__copy">
        <strong>{{ title() || presentation().title }}</strong>
        <p>{{ description() || presentation().description }}</p>
      </div>

      @if (!carregando() && (actionLabel() || secondaryActionLabel())) {
        <div class="geo-async-state__actions">
          @if (actionLabel()) {
            <geo-button
              [label]="actionLabel()!"
              [icon]="actionIcon()"
              [variant]="state() === 'error' ? 'primary' : 'secondary'"
              size="sm"
              (pressed)="action.emit()"
            ></geo-button>
          }
          @if (secondaryActionLabel()) {
            <geo-button
              [label]="secondaryActionLabel()!"
              [icon]="secondaryActionIcon()"
              variant="ghost"
              size="sm"
              (pressed)="secondaryAction.emit()"
            ></geo-button>
          }
        </div>
      }
    }
  `,
  styles: [`
    .geo-async-state__skeleton { display: grid; gap: 10px; inline-size: 100%; padding: 4px 0; }
    .geo-async-state__skeleton-linha {
      display: block;
      block-size: 14px;
      border-radius: var(--geo-radius-xs);
      background: linear-gradient(90deg, var(--geo-surface-muted) 25%, var(--geo-surface-subtle) 50%, var(--geo-surface-muted) 75%);
      background-size: 200% 100%;
      animation: geo-skeleton 1.4s ease-in-out infinite;
    }
    @keyframes geo-skeleton { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    :host-context([data-motion='reduced']) .geo-async-state__skeleton-linha { animation: none; }
  `]
})
export class GeoAsyncStateComponent {
  readonly state = input<Exclude<GeoContentState, 'idle' | 'ready'>>('loading');
  readonly title = input<string | undefined>();
  readonly description = input<string | undefined>();
  readonly actionLabel = input<string | undefined>();
  readonly actionIcon = input<string | undefined>();
  readonly compact = input(false);
  /** Ícone (PrimeIcons, ex.: `pi-filter-slash`) no lugar do padrão do estado. */
  readonly icon = input<string | undefined>();
  /** Segunda ação, mais discreta (ex.: "Limpar filtros" ao lado de "Ajustar filtros"). */
  readonly secondaryActionLabel = input<string | undefined>();
  readonly secondaryActionIcon = input<string | undefined>();

  readonly action = output<void>();
  readonly secondaryAction = output<void>();

  protected readonly linhasSkeleton = ['100%', '92%', '96%', '88%', '94%', '78%'];
  /** Carregando: as ações não valem (quem chama decide o texto: título próprio ou skeleton). */
  protected readonly carregando = computed(() => this.state() === 'loading' || this.state() === 'refreshing');

  protected readonly presentation = computed<StatePresentation>(() => {
    const presentations: Record<Exclude<GeoContentState, 'idle' | 'ready'>, StatePresentation> = {
      loading: {
        icon: 'pi-spinner',
        tone: 'brand',
        title: 'Carregando dados',
        description: 'Aguarde enquanto buscamos as informações.'
      },
      refreshing: {
        icon: 'pi-sync',
        tone: 'brand',
        title: 'Atualizando dados',
        description: 'Os dados atuais continuam disponíveis durante a atualização.'
      },
      empty: {
        icon: 'pi-inbox',
        tone: 'neutral',
        title: 'Nenhum registro encontrado',
        description: 'Não há registros para mostrar neste recorte.'
      },
      error: {
        icon: 'pi-exclamation-triangle',
        tone: 'danger',
        title: 'Não foi possível carregar',
        description: 'Verifique a conexão e tente novamente.'
      },
      'offline-cached': {
        icon: 'pi-cloud-download',
        tone: 'warning',
        title: 'Dados disponíveis offline',
        description: 'Você está vendo a última versão salva neste dispositivo.'
      },
      stale: {
        icon: 'pi-clock',
        tone: 'warning',
        title: 'Dados aguardando atualização',
        description: 'A conexão será usada para atualizar estas informações assim que possível.'
      }
    };

    return presentations[this.state()];
  });
}
