import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GeoRankBadgeComponent } from './geo-rank-badge.component';

describe('GeoRankBadgeComponent', () => {
  it('destaca o pódio com ícone e sempre anuncia a posição em texto', async () => {
    await TestBed.configureTestingModule({ imports: [GeoRankBadgeComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GeoRankBadgeComponent);
    fixture.componentRef.setInput('position', 1);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.getAttribute('data-podium')).toBe('1');
    expect(el.querySelector('.pi-trophy')).not.toBeNull();
    expect(el.querySelector('.geo-sr-only')!.textContent).toBe('1º lugar');

    fixture.componentRef.setInput('position', 7);
    fixture.detectChanges();
    expect(el.getAttribute('data-podium')).toBeNull();
    expect(el.textContent).toContain('7');
  });
});
