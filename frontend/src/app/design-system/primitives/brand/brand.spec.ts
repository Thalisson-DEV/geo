import { TestBed } from '@angular/core/testing';
import { GeoBussolaAvatarComponent } from './geo-bussola-avatar.component';
import { GeoLogoComponent } from './geo-logo.component';

describe('GeoLogoComponent', () => {
  it('desenha o G com nome acessível e ids únicos por instância', () => {
    const a = TestBed.createComponent(GeoLogoComponent);
    const b = TestBed.createComponent(GeoLogoComponent);
    a.detectChanges();
    b.detectChanges();
    const el = a.nativeElement as HTMLElement;
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('GEO');
    const idA = el.querySelector('linearGradient')?.id;
    const idB = (b.nativeElement as HTMLElement).querySelector('linearGradient')?.id;
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
  });

  it('variante mono usa a cor do texto', () => {
    const f = TestBed.createComponent(GeoLogoComponent);
    f.componentRef.setInput('variant', 'mono');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('path')?.getAttribute('stroke')).toBe('currentColor');
  });
});

describe('GeoBussolaAvatarComponent', () => {
  it('anuncia o estado e o expõe para a animação', () => {
    const f = TestBed.createComponent(GeoBussolaAvatarComponent);
    f.componentRef.setInput('estado', 'trabalhando');
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.dataset['estado']).toBe('trabalhando');
    expect(el.getAttribute('aria-label')).toBe('Bússola trabalhando');

    f.componentRef.setInput('estado', 'interrompido');
    f.detectChanges();
    expect(el.getAttribute('aria-label')).toBe('Bússola interrompida');
  });
});
