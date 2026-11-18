import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CesTone } from '../../core';
import { CES_STATUS_ICONE_PADRAO, CesStatusComponent } from './ces-status.component';

@Component({
  standalone: true,
  imports: [CesStatusComponent],
  template: `<ces-status [tone]="tone()" [icon]="icon()">Rótulo</ces-status>`
})
class HostComponent {
  readonly tone = signal<CesTone>('neutral');
  readonly icon = signal<string | undefined>(undefined);
}

describe('CesStatusComponent', () => {
  function montar(tone: CesTone, icon?: string) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.tone.set(tone);
    fixture.componentInstance.icon.set(icon);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.ces-status__icon') as HTMLElement | null;
  }

  it.each(Object.entries(CES_STATUS_ICONE_PADRAO) as [CesTone, string][])(
    'sem ícone informado, a tag %s usa o ícone do tom',
    (tone, icone) => {
      const el = montar(tone);
      expect(el).not.toBeNull();
      expect(el!.classList).toContain('pi');
      expect(el!.classList).toContain(icone);
      expect(el!.getAttribute('aria-hidden')).toBe('true');
    }
  );

  it('ícone vazio não deixa a tag sem ícone', () => {
    expect(montar('success', '  ')!.classList).toContain('pi-check-circle');
  });

  it('usa o ícone informado, com ou sem o prefixo pi', () => {
    expect(montar('info', 'pi-truck')!.className).toBe('ces-status__icon pi pi-truck');
    expect(montar('info', 'pi pi-ban')!.className).toBe('ces-status__icon pi pi-ban');
  });
});
