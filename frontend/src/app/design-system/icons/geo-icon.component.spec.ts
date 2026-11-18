import { TestBed } from '@angular/core/testing';
import { GeoIconComponent } from './geo-icon.component';
import { GEO_ICONES, PI_PARA_LUCIDE, resolverIcone } from './geo-icons';

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(GeoIconComponent);
  for (const [chave, valor] of Object.entries(inputs)) fixture.componentRef.setInput(chave, valor);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('GeoIconComponent', () => {
  it('desenha o SVG do Lucide pelo nome e é decorativo sem rótulo', () => {
    const el = render({ name: 'check' });
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.dataset['icon']).toBe('check');
  });

  it('aceita a classe do PrimeIcons durante a migração', () => {
    const el = render({ name: 'pi pi-exclamation-triangle' });
    expect(el.dataset['icon']).toBe('triangle-alert');
  });

  it('gira quando a classe pede pi-spin', () => {
    const el = render({ name: 'pi pi-spinner pi-spin' });
    expect(el.classList.contains('geo-icon--spin')).toBe(true);
  });

  it('é anunciado quando recebe rótulo', () => {
    const el = render({ name: 'bell', label: 'Notificações' });
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Notificações');
    expect(el.hasAttribute('aria-hidden')).toBe(false);
  });

  it('não desenha nada para nome desconhecido', () => {
    const el = render({ name: 'nao-existe' });
    expect(el.querySelector('svg')).toBeNull();
  });
});

describe('registro de ícones', () => {
  it('todo PrimeIcons mapeado aponta para um ícone registrado', () => {
    for (const [pi, lucide] of Object.entries(PI_PARA_LUCIDE)) {
      expect(GEO_ICONES[lucide], `pi-${pi} -> ${lucide}`).toBeDefined();
    }
  });

  it('resolve nome Lucide e classe PrimeIcons', () => {
    expect(resolverIcone('house')?.nome).toBe('house');
    expect(resolverIcone('pi pi-home')?.nome).toBe('house');
    expect(resolverIcone('')).toBeUndefined();
  });
});
