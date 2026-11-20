import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GeoStatusTagComponent, geoToneDaSeveridade } from './geo-status-tag.component';

describe('geo-status-tag', () => {
  it('mapeia a severidade do contrato para o tom do GEO', () => {
    expect(geoToneDaSeveridade('warn')).toBe('warning');
    expect(geoToneDaSeveridade('secondary')).toBe('neutral');
    expect(geoToneDaSeveridade('contrast')).toBe('brand');
    expect(geoToneDaSeveridade('qualquer')).toBe('neutral');
  });

  it('mostra o rótulo do StatusDto com o tom certo', () => {
    const fixture = TestBed.createComponent(GeoStatusTagComponent);
    fixture.componentRef.setInput('status', { code: 'ABERTO', label: 'Aberto', severity: 'info' });
    fixture.detectChanges();
    const tag = fixture.nativeElement.querySelector('geo-status') as HTMLElement;
    expect(tag.textContent).toContain('Aberto');
    expect(tag.getAttribute('data-tone')).toBe('info');
    expect(tag.getAttribute('data-code')).toBe('ABERTO');
  });

  it('mostra um traço sem status', () => {
    const fixture = TestBed.createComponent(GeoStatusTagComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('—');
  });
});
