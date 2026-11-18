import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeoDrawerComponent } from './geo-drawer.component';

@Component({
  standalone: true,
  imports: [GeoDrawerComponent],
  template: `
    <geo-drawer [(visible)]="aberto" title="Inspeções em 14/09/2026" eyebrow="Detalhe do dia" description="Recorte com os filtros do painel">
      <p class="conteudo">Lista</p>
      <button drawer-footer class="rodape">Ver tudo</button>
    </geo-drawer>
  `,
})
class HostComponent {
  readonly aberto = signal(true);
}

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function montar() {
  await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('GeoDrawerComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.querySelectorAll('.p-drawer').forEach((el) => el.remove());
  });

  it('abre à direita no desktop com título rotulando o conteúdo e rodapé projetado', async () => {
    mockMatchMedia(false);
    await montar();
    const drawer = document.body.querySelector('.p-drawer') as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(drawer.className).toContain('p-drawer-right');
    const titulo = drawer.querySelector('h2.geo-drawer__title') as HTMLElement;
    expect(titulo.textContent).toContain('Inspeções em 14/09/2026');
    const corpo = drawer.querySelector('.geo-drawer__body')!;
    expect(corpo.getAttribute('aria-labelledby')).toBe(titulo.id);
    expect(drawer.querySelector('.conteudo')).not.toBeNull();
    expect(drawer.querySelector('.geo-drawer__footer .rodape')).not.toBeNull();
    expect(drawer.querySelector('.geo-drawer__handle')).toBeNull();
    // Superfície pelos tokens GEO (o overlay do preset fica claro no tema escuro).
    expect(drawer.getAttribute('style')).toContain('var(--geo-surface)');
    expect(drawer.getAttribute('style')).toContain('var(--geo-foreground)');
  });

  it('vira folha inferior com alça em telas compactas', async () => {
    mockMatchMedia(true);
    await montar();
    const drawer = document.body.querySelector('.p-drawer') as HTMLElement;
    expect(drawer.className).toContain('p-drawer-bottom');
    expect(drawer.querySelector('.geo-drawer__handle')).not.toBeNull();
  });

  it('fechar e sair da tela no mesmo instante não deixa a máscara presa na página', async () => {
    mockMatchMedia(false);
    const fixture = await montar();
    expect(document.body.querySelector('.p-drawer-mask')).not.toBeNull();

    // "Abrir completa": fecha o drawer e navega antes de a animação de saída terminar.
    fixture.componentInstance.aberto.set(false);
    fixture.detectChanges();
    fixture.destroy();

    expect(document.body.querySelector('.p-drawer-mask')).toBeNull();
    expect(document.body.classList.contains('p-overflow-hidden')).toBe(false);
  });
});
