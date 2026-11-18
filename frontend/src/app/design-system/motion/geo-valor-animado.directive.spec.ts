import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GeoValorAnimadoDirective } from './geo-valor-animado.directive';

@Component({
  imports: [GeoValorAnimadoDirective],
  template: `<strong [geoValorAnimado]="valor()">{{ valor() }}</strong>`,
})
class HostComponent {
  readonly valor = signal(10);
}

describe('GeoValorAnimadoDirective', () => {
  it('não anima o primeiro valor e realça cada mudança', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('strong')!;
    expect(el.classList.contains('geo-valor-animado--mudou')).toBe(false);

    fixture.componentInstance.valor.set(12);
    fixture.detectChanges();
    expect(el.classList.contains('geo-valor-animado--mudou')).toBe(true);

    el.dispatchEvent(Object.assign(new Event('animationend'), {}));
    expect(el.classList.contains('geo-valor-animado--mudou')).toBe(false);
  });

  it('valor igual não realça', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    fixture.componentInstance.valor.set(10);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('strong')!;
    expect(el.classList.contains('geo-valor-animado--mudou')).toBe(false);
  });
});
