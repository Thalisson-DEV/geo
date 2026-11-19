import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { HomeComponent } from './home.component';

const TODAS = [
  'obras:obra:read',
  'estoque:solicitacao:read',
  'obras:turno:read',
  'frota:veiculo:read',
  'sst:inspecao:read',
  'desconto:read',
  'financeiro:compra:read',
  'chamado:read',
  'iam:usuario:read',
];

async function montar(permissoes: string[]): Promise<ComponentFixture<HomeComponent>> {
  const sessao = signal({ permissoes });
  await TestBed.configureTestingModule({
    imports: [HomeComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: computed(() => sessao()) } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();
  return fixture;
}

function cartoes(fixture: ComponentFixture<HomeComponent>): HTMLAnchorElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('a.module-card'));
}

describe('HomeComponent', () => {
  it('lista os módulos como links, com Obras primeiro', async () => {
    const fixture = await montar(TODAS);
    const links = cartoes(fixture);

    expect(links).toHaveLength(9);
    expect(links[0].textContent).toContain('Obras');
    expect(links[0].getAttribute('href')).toBe('/obras');
    expect(links[1].getAttribute('href')).toBe('/almoxarifado/solicitacoes-tecnicas');
  });

  it('mostra só os módulos que o perfil pode abrir', async () => {
    const fixture = await montar(['chamado:read', 'frota:veiculo:read']);
    const nomes = cartoes(fixture).map((a) => a.querySelector('strong')?.textContent);

    expect(nomes).toEqual(['Frota', 'Chamados']);
  });

  it('explica quando o perfil não tem nenhum módulo', async () => {
    const fixture = await montar([]);

    expect(cartoes(fixture)).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('não tem acesso a nenhum módulo');
  });

  it('nomeia a navegação pelo título da página', async () => {
    const fixture = await montar(TODAS);
    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;

    expect(nav.getAttribute('aria-labelledby')).toBe('home-title');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Módulos');
  });
});
