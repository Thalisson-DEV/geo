import { TestBed } from '@angular/core/testing';

import { GeoCalloutComponent } from './geo-callout.component';

describe('GeoCalloutComponent', () => {
  const criar = async () => {
    await TestBed.configureTestingModule({ imports: [GeoCalloutComponent] }).compileComponents();
    return TestBed.createComponent(GeoCalloutComponent);
  };

  it('anuncia o tom por rótulo textual, não apenas por cor', async () => {
    const fixture = await criar();
    fixture.componentRef.setInput('tone', 'warning');
    fixture.componentRef.setInput('title', 'Troca de senha obrigatória');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-tone')).toBe('warning');
    expect(host.textContent).toContain('Atenção');
    expect(host.textContent).toContain('Troca de senha obrigatória');
  });

  it('mantém o ícone decorativo fora da leitura assistiva', async () => {
    const fixture = await criar();
    fixture.detectChanges();

    const icone = (fixture.nativeElement as HTMLElement).querySelector('.geo-callout__icon');
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
    expect(icone?.querySelector('geo-icon')?.getAttribute('data-icon')).toBe('info');
  });

  it('permite rótulo e ícone próprios sem perder o tom semântico', async () => {
    const fixture = await criar();
    fixture.componentRef.setInput('tone', 'brand');
    fixture.componentRef.setInput('label', 'Regra de ouro');
    fixture.componentRef.setInput('icon', 'pi pi-star');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-tone')).toBe('brand');
    expect(host.textContent).toContain('Regra de ouro');
    expect(host.querySelector('.geo-callout__icon geo-icon')?.getAttribute('data-icon')).toBe('star');
  });
});
