import {
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  input,
  model
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { GeoTabPanelDirective, GeoTabValue } from './geo-tab-panel.directive';
import { GeoIconComponent } from '../../icons/geo-icon.component';

export interface GeoTabItem {
  value: GeoTabValue;
  label: string;
  icon?: string;
  badge?: string | number;
  disabled?: boolean;
}

@Component({
  selector: 'geo-tabs',
  standalone: true,
  imports: [NgTemplateOutlet, Tabs, TabList, Tab, TabPanels, TabPanel, GeoIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-tabs' },
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .geo-tabs__label {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-weight: var(--geo-font-weight-semibold);
    }

    .geo-tabs__badge {
      min-width: 1.35rem;
      border-radius: 999px;
      padding: 0.15rem 0.4rem;
      background: var(--geo-surface-muted);
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption);
      line-height: 1.1;
      text-align: center;
    }

    .geo-tabs__empty-panel {
      padding: 1rem;
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-body);
    }
  `,
  template: `
    <p-tabs
      [value]="value()"
      (valueChange)="value.set($event)"
      [scrollable]="scrollable()"
      [lazy]="lazy()"
      [selectOnFocus]="selectOnFocus()"
      [showNavigators]="showNavigators()"
    >
      <p-tablist [attr.aria-label]="ariaLabel()">
        @for (tab of tabs(); track tab.value) {
          <p-tab [value]="tab.value" [disabled]="tab.disabled || false">
            <span class="geo-tabs__label">
              @if (tab.icon) {
                <geo-icon class="geo-icon--texto" [name]="tab.icon" />
              }
              <span>{{ tab.label }}</span>
              @if (tab.badge !== undefined) {
                <span class="geo-tabs__badge">{{ tab.badge }}</span>
              }
            </span>
          </p-tab>
        }
      </p-tablist>

      <p-tabpanels>
        @for (tab of tabs(); track tab.value) {
          <p-tabpanel [value]="tab.value" [lazy]="lazy()">
            @if (panelFor(tab.value); as panel) {
              <ng-container [ngTemplateOutlet]="panel.template"></ng-container>
            } @else {
              <div class="geo-tabs__empty-panel">
                Nenhum conteúdo foi definido para {{ tab.label }}.
              </div>
            }
          </p-tabpanel>
        }
      </p-tabpanels>
    </p-tabs>
  `
})
export class GeoTabsComponent {
  readonly value = model<GeoTabValue | undefined>(undefined);
  readonly tabs = input.required<readonly GeoTabItem[]>();
  readonly ariaLabel = input('Seções do conteúdo');
  readonly lazy = input(true);
  readonly scrollable = input(true);
  readonly selectOnFocus = input(false);
  readonly showNavigators = input(true);

  private readonly panels = contentChildren(GeoTabPanelDirective);

  protected panelFor(value: GeoTabValue): GeoTabPanelDirective | undefined {
    return this.panels().find((panel) => panel.value() === value);
  }
}
