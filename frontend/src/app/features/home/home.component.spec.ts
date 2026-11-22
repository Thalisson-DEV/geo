import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import {
  ADMINISTRACAO_DO_INICIO,
  HomeComponent,
  MODULOS_DO_INICIO,
  SUGESTOES_DA_BUSSOLA,
  primeiroNome,
  saudacaoPelaHora,
} from './home.component';

const TODAS = [
  ...MODULOS_DO_INICIO.flatMap((m) => [m.permissao, ...m.atalhos.map((a) => a.permissao)]),
  ...ADMINISTRACAO_DO_INICIO.map((d) => d.permissao),
];

async function montar(permissoes: string[], nome?: string, login = 'USR123456'): Promise<ComponentFixture<HomeComponent>> {
  const sessao = signal({ permissoes, nome, login });
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

const el = (f: ComponentFixture<HomeComponent>) => f.nativeElement as HTMLElement;
const cartoes = (f: ComponentFixture<HomeComponent>) =>
  Array.from(el(f).querySelectorAll<HTMLElement>('article.modulo:not(.modulo--sistema)'));
const nome = (cartao: HTMLElement) => cartao.querySelector('.modulo__nome')?.textContent?.trim();

describe('HomeComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('abre com Obras em destaque e um cartão por módulo', async () => {
    const fixture = await montar(TODAS);
    const lista = cartoes(fixture);

    expect(lista).toHaveLength(MODULOS_DO_INICIO.length);
    expect(nome(lista[0])).toBe('Obras');
    expect(lista[0].classList).toContain('modulo--destaque');
    expect(lista[0].querySelector('a.modulo__entrada')?.getAttribute('href')).toBe('/obras');
    expect(lista[0].querySelectorAll('.modulo__atalhos a')).toHaveLength(4);
  });

  it('mostra só os módulos e atalhos que o perfil pode abrir', async () => {
    const fixture = await montar(['frota:veiculo:read', 'frota:abastecimento:read', 'chamado:read']);
    const lista = cartoes(fixture);

    expect(lista.map(nome)).toEqual(['Frota', 'Chamados']);
    const atalhosFrota = Array.from(lista[0].querySelectorAll('.modulo__atalhos a')).map((a) => a.textContent?.trim());
    expect(atalhosFrota).toEqual(['Abastecimentos']);
  });

  it('leva o novo chamado direto ao formulário', async () => {
    const fixture = await montar(['chamado:read']);
    const novo = Array.from(el(fixture).querySelectorAll<HTMLAnchorElement>('.modulo__atalhos a'))
      .find((a) => a.textContent?.includes('Novo chamado'));

    expect(novo?.getAttribute('href')).toBe('/chamados/meus?novo=1');
  });

  it('mostra a administração por último, só para quem administra', async () => {
    const semAdmin = await montar(['obras:obra:read']);
    expect(el(semAdmin).querySelector('.modulo--sistema')).toBeNull();

    TestBed.resetTestingModule();
    const comAdmin = await montar(['iam:usuario:read']);
    const cartao = el(comAdmin).querySelector<HTMLElement>('.modulo--sistema')!;
    expect(cartao.querySelector('a.modulo__entrada')?.getAttribute('href')).toBe('/admin/cadastros/usuarios');
    expect(cartao.querySelectorAll('.modulo__atalhos a')).toHaveLength(1);
  });

  it('explica quando o perfil não tem nenhum módulo', async () => {
    const fixture = await montar([]);

    expect(cartoes(fixture)).toHaveLength(0);
    expect(el(fixture).querySelector('[role="status"]')?.textContent).toContain('Nenhum módulo liberado');
  });

  it('leva a pergunta digitada para a Bússola', async () => {
    const fixture = await montar([...TODAS, 'assistente:chat:use']);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const campo = el(fixture).querySelector<HTMLInputElement>('#inicio-pergunta')!;

    campo.value = '  Quais obras estão paradas?  ';
    el(fixture).querySelector('form.bussola')!.dispatchEvent(new Event('submit'));

    expect(navegar).toHaveBeenCalledWith(['/bussola'], { queryParams: { pergunta: 'Quais obras estão paradas?' } });
  });

  it('abre a Bússola com a sugestão escolhida, ou vazia quando nada foi digitado', async () => {
    const fixture = await montar(['assistente:chat:use']);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    el(fixture).querySelector<HTMLButtonElement>('.bussola__sugestoes button')!.click();
    expect(navegar).toHaveBeenLastCalledWith(['/bussola'], { queryParams: { pergunta: SUGESTOES_DA_BUSSOLA[0] } });

    el(fixture).querySelector('form.bussola')!.dispatchEvent(new Event('submit'));
    expect(navegar).toHaveBeenLastCalledWith(['/bussola'], {});
  });

  it('esconde a Bússola de quem não pode usá-la', async () => {
    const fixture = await montar(TODAS);

    expect(el(fixture).querySelector('form.bussola')).toBeNull();
    expect(el(fixture).querySelector('.bussola__sugestoes')).toBeNull();
  });

  it('cumprimenta pelo primeiro nome e nomeia a navegação pelo título da página', async () => {
    const fixture = await montar(TODAS, 'MARIA DA SILVA');

    expect(el(fixture).querySelector('h1')?.textContent).toMatch(/^(Bom dia|Boa tarde|Boa noite), Maria$/);
    expect(el(fixture).querySelector('nav')?.getAttribute('aria-labelledby')).toBe('inicio-titulo');

    TestBed.resetTestingModule();
    const tecnica = await montar(TODAS, 'USRADMIN', 'USRADMIN');
    expect(el(tecnica).querySelector('h1')?.textContent?.trim()).toMatch(/^(Bom dia|Boa tarde|Boa noite)$/);
  });
});

describe('saudação do início', () => {
  it('escolhe a saudação pela hora', () => {
    expect(saudacaoPelaHora(5)).toBe('Bom dia');
    expect(saudacaoPelaHora(11)).toBe('Bom dia');
    expect(saudacaoPelaHora(12)).toBe('Boa tarde');
    expect(saudacaoPelaHora(18)).toBe('Boa noite');
    expect(saudacaoPelaHora(2)).toBe('Boa noite');
  });

  it('usa só o primeiro nome, sem caixa alta', () => {
    expect(primeiroNome('  JOÃO  PEREIRA ')).toBe('João');
    expect(primeiroNome(undefined)).toBe('');
  });
});
