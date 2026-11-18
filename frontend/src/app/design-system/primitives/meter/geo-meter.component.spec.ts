import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GeoMeterComponent, geoAttainmentBand } from './geo-meter.component';

describe('GeoMeterComponent', () => {
  it('classifica faixas de atingimento', () => {
    expect(geoAttainmentBand(100)).toBe('success');
    expect(geoAttainmentBand(80)).toBe('warning');
    expect(geoAttainmentBand(79.9)).toBe('danger');
  });

  it('expõe meter acessível com texto da faixa e satura a barra em 100%', async () => {
    await TestBed.configureTestingModule({ imports: [GeoMeterComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GeoMeterComponent);
    fixture.componentRef.setInput('value', 125);
    fixture.componentRef.setInput('detail', '50/40');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.getAttribute('data-tone')).toBe('success');
    const meter = el.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toBe('125% — meta atingida');
    expect(el.textContent).toContain('50/40');

    fixture.componentRef.setInput('value', 42);
    fixture.detectChanges();
    expect(el.getAttribute('data-tone')).toBe('danger');
    expect(el.querySelector('.pi-times-circle')).not.toBeNull();
  });
});
