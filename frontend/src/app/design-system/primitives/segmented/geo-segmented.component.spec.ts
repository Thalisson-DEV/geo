import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GeoSegmentedComponent, GeoSegmentedOption } from './geo-segmented.component';

@Component({
  standalone: true,
  imports: [GeoSegmentedComponent],
  template: `<geo-segmented label="Forma de visualizar" [options]="opcoes" [(value)]="valor"></geo-segmented>`,
})
class HostComponent {
  readonly opcoes: GeoSegmentedOption<'a' | 'b'>[] = [
    { value: 'a', label: 'Quadro', count: 3 },
    { value: 'b', label: 'Fila' },
  ];
  readonly valor = signal<'a' | 'b' | null>('a');
}

describe('GeoSegmentedComponent', () => {
  it('marca a opção escolhida com aria-pressed e troca no clique', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement.querySelector('geo-segmented');
    expect(host.getAttribute('role')).toBe('group');
    expect(host.getAttribute('aria-label')).toBe('Forma de visualizar');
    const botoes = host.querySelectorAll('button');
    expect(botoes[0].getAttribute('aria-pressed')).toBe('true');
    expect(botoes[0].textContent).toContain('3');
    botoes[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.valor()).toBe('b');
    expect(botoes[1].getAttribute('aria-pressed')).toBe('true');
  });
});
