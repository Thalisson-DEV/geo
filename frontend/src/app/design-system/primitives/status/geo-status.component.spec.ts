import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GeoTone } from '../../core';
import { resolverIcone } from '../../icons/geo-icons';
import { GEO_STATUS_ICONE_PADRAO, GeoStatusComponent } from './geo-status.component';

@Component({
  standalone: true,
  imports: [GeoStatusComponent],
  template: `<geo-status [tone]="tone()" [icon]="icon()">Rótulo</geo-status>`
})
class HostComponent {
  readonly tone = signal<GeoTone>('neutral');
  readonly icon = signal<string | undefined>(undefined);
}

describe('GeoStatusComponent', () => {
  function montar(tone: GeoTone, icon?: string) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.tone.set(tone);
    fixture.componentInstance.icon.set(icon);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.geo-status__icon') as HTMLElement | null;
  }

  it.each(Object.entries(GEO_STATUS_ICONE_PADRAO) as [GeoTone, string][])(
    'sem ícone informado, a tag %s usa o ícone do tom',
    (tone, icone) => {
      const el = montar(tone);
      expect(el).not.toBeNull();
      expect(el!.dataset['icon']).toBe(resolverIcone(icone)?.nome);
      expect(el!.querySelector('svg')).not.toBeNull();
      expect(el!.getAttribute('aria-hidden')).toBe('true');
    }
  );

  it('ícone vazio não deixa a tag sem ícone', () => {
    expect(montar('success', '  ')!.dataset['icon']).toBe('circle-check');
  });

  it('usa o ícone informado, com ou sem o prefixo pi', () => {
    expect(montar('info', 'pi-truck')!.dataset['icon']).toBe('truck');
    expect(montar('info', 'pi pi-ban')!.dataset['icon']).toBe('ban');
  });
});
