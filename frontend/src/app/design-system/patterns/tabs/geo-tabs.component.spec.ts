import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';

import { GeoTabPanelDirective } from './geo-tab-panel.directive';
import { GeoTabsComponent } from './geo-tabs.component';

@Component({
  standalone: true,
  imports: [GeoTabsComponent, GeoTabPanelDirective],
  template: `
    <geo-tabs
      [(value)]="active"
      [tabs]="tabs"
      [showNavigators]="false"
      [scrollable]="false"
    >
      <ng-template geoTabPanel="details">Dados principais</ng-template>
      <ng-template geoTabPanel="history">Histórico do registro</ng-template>
    </geo-tabs>
  `
})
class HostComponent {
  active: string | number | undefined = 'details';
  readonly tabs = [
    { value: 'details', label: 'Dados', icon: 'pi pi-file' },
    { value: 'history', label: 'Histórico', badge: 3 }
  ];
}

describe('GeoTabsComponent', () => {
  it('preserva a semântica e o conteúdo do painel ativo', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [providePrimeNG()]
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const tabList = fixture.nativeElement.querySelector('[role="tablist"]');
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabList).toBeTruthy();
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Dados principais');
    expect(fixture.nativeElement.textContent).toContain('3');
  });

  it('atualiza o model ao selecionar outra aba', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [providePrimeNG()]
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    (tabs[1] as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.active).toBe('history');
    expect(fixture.nativeElement.textContent).toContain('Histórico do registro');
  });
});
