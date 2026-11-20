import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GeoContentState, GeoDensity } from '../../core';
import { GeoAsyncStateComponent } from '../../feedback';

@Component({
  selector: 'geo-table-shell',
  standalone: true,
  imports: [GeoAsyncStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'geo-table-shell',
    '[attr.data-density]': 'density()',
    '[attr.data-state]': 'state()',
    '[attr.aria-busy]': "state() === 'loading' || state() === 'refreshing'"
  },
  styles: `
    :host {
      display: block;
      overflow: hidden;
      border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-lg);
      background: var(--geo-surface);
      box-shadow: var(--geo-shadow-sm);
    }

    .geo-table-shell__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.875rem 1rem;
      border-bottom: 1px solid var(--geo-border);
    }

    .geo-table-shell__heading {
      display: grid;
      min-width: 0;
      gap: 0.2rem;
    }

    .geo-table-shell__heading h2,
    .geo-table-shell__heading p {
      margin: 0;
    }

    .geo-table-shell__heading h2 {
      color: var(--geo-foreground);
      font-size: var(--geo-text-body);
      font-weight: var(--geo-font-weight-semibold, 600);
    }

    .geo-table-shell__heading p {
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption);
      line-height: 1.45;
    }

    .geo-table-shell__toolbar {
      min-width: min(100%, 18rem);
    }

    .geo-table-shell__notice {
      border-bottom: 1px solid var(--geo-border);
      background: var(--geo-surface-subtle);
    }

    .geo-table-shell__content {
      min-width: 0;
      overflow-x: auto;
    }

    .geo-table-shell__state {
      min-height: 12rem;
    }

    :host([data-density='comfortable']) .geo-table-shell__header {
      padding: 1rem 1.25rem;
    }

    @media (max-width: 48rem) {
      .geo-table-shell__header {
        align-items: stretch;
        flex-direction: column;
      }

      .geo-table-shell__toolbar {
        width: 100%;
      }
    }
  `,
  template: `
    @if (hasHeader()) {
      <header class="geo-table-shell__header">
        <div class="geo-table-shell__heading">
          @if (title()) {
            <h2>{{ title() }}</h2>
          }
          @if (description()) {
            <p>{{ description() }}</p>
          }
        </div>
        <div class="geo-table-shell__toolbar">
          <ng-content select="[table-toolbar]"></ng-content>
        </div>
      </header>
    }

    @if (noticeState()) {
      <div class="geo-table-shell__notice" aria-live="polite">
        <geo-async-state
          [state]="noticeState()!"
          [title]="stateTitle()"
          [description]="stateDescription()"
          [actionLabel]="stateActionLabel()"
          [actionIcon]="stateActionIcon()"
          [compact]="true"
          (action)="stateAction.emit()"
        ></geo-async-state>
      </div>
    }

    @if (blockingState()) {
      <div class="geo-table-shell__state" aria-live="polite">
        @if (blockingState() === 'empty') {
          <ng-content select="[table-empty]"></ng-content>
        } @else if (blockingState() === 'error') {
          <ng-content select="[table-error]"></ng-content>
        }

        @if (!customBlockingState()) {
          <geo-async-state
            [state]="blockingState()!"
            [title]="stateTitle()"
            [description]="stateDescription()"
            [actionLabel]="stateActionLabel()"
            [actionIcon]="stateActionIcon()"
            (action)="stateAction.emit()"
          ></geo-async-state>
        }
      </div>
    } @else {
      <div class="geo-table-shell__content">
        <ng-content></ng-content>
      </div>
    }

    <ng-content select="[table-footer]"></ng-content>
  `
})
export class GeoTableShellComponent {
  readonly title = input<string | undefined>();
  readonly description = input<string | undefined>();
  readonly state = input<GeoContentState>('ready');
  readonly density = input<GeoDensity>('compact');
  readonly customEmpty = input(false);
  readonly customError = input(false);
  readonly stateTitle = input<string | undefined>();
  readonly stateDescription = input<string | undefined>();
  readonly stateActionLabel = input<string | undefined>();
  readonly stateActionIcon = input<string | undefined>();

  readonly stateAction = output<void>();

  protected readonly hasHeader = computed(() => Boolean(this.title() || this.description()));
  protected readonly blockingState = computed(() => {
    const state = this.state();
    return state === 'loading' || state === 'empty' || state === 'error' ? state : undefined;
  });
  protected readonly noticeState = computed(() => {
    const state = this.state();
    return state === 'refreshing' || state === 'offline-cached' || state === 'stale'
      ? state
      : undefined;
  });
  protected readonly customBlockingState = computed(
    () =>
      (this.blockingState() === 'empty' && this.customEmpty()) ||
      (this.blockingState() === 'error' && this.customError())
  );
}
