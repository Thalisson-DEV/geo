import { TestBed } from '@angular/core/testing';
import { ThemeService, lerTema } from './theme.service';

type Ouvinte = (evento: MediaQueryListEvent) => void;

/** matchMedia controlável: cada consulta guarda o estado e os ouvintes. */
function simularMatchMedia(inicial: Record<string, boolean>) {
  const estado = { ...inicial };
  const ouvintes: Record<string, Ouvinte[]> = {};
  window.matchMedia = ((consulta: string) => ({
    get matches() {
      return !!estado[consulta];
    },
    media: consulta,
    addEventListener: (_: string, fn: Ouvinte) => (ouvintes[consulta] ??= []).push(fn),
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  return (consulta: string, valor: boolean) => {
    estado[consulta] = valor;
    for (const fn of ouvintes[consulta] ?? []) fn({ matches: valor } as MediaQueryListEvent);
  };
}

describe('ThemeService', () => {
  const raiz = document.documentElement;
  const matchMediaOriginal = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    raiz.className = '';
    delete raiz.dataset['motion'];
    delete raiz.dataset['geoDensity'];
  });

  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
    TestBed.resetTestingModule();
  });

  it('segue o sistema por padrão e troca sem recarregar', () => {
    const mudar = simularMatchMedia({ '(prefers-color-scheme: dark)': false });
    const tema = TestBed.inject(ThemeService);

    expect(tema.tema()).toBe('sistema');
    expect(raiz.classList.contains('app-dark')).toBe(false);

    mudar('(prefers-color-scheme: dark)', true);
    expect(tema.isDarkMode()).toBe(true);
    expect(raiz.classList.contains('app-dark')).toBe(true);
    expect(raiz.style.colorScheme).toBe('dark');
  });

  it('grava a escolha explícita e ignora o sistema', () => {
    simularMatchMedia({ '(prefers-color-scheme: dark)': true });
    const tema = TestBed.inject(ThemeService);

    tema.setTema('claro');
    expect(localStorage.getItem('geo_theme_mode')).toBe('light');
    expect(raiz.classList.contains('app-dark')).toBe(false);

    tema.setDarkMode(true);
    expect(localStorage.getItem('geo_theme_mode')).toBe('dark');
    expect(raiz.classList.contains('app-dark')).toBe(true);

    tema.setTema('sistema');
    expect(localStorage.getItem('geo_theme_mode')).toBe('system');
  });

  it('apaga a cor primária e o ripple antigos sem erro', () => {
    simularMatchMedia({});
    localStorage.setItem('geo_primary_color', 'emerald');
    localStorage.setItem('geo_ripple_enabled', 'false');

    const tema = TestBed.inject(ThemeService);

    expect(tema.primaryColor()).toBe('blue');
    expect(localStorage.getItem('geo_primary_color')).toBeNull();
    expect(localStorage.getItem('geo_ripple_enabled')).toBeNull();
  });

  it('reduz o movimento pelo sistema ou pela preferência', () => {
    const mudar = simularMatchMedia({ '(prefers-reduced-motion: reduce)': false });
    const tema = TestBed.inject(ThemeService);
    expect(raiz.dataset['motion']).toBe('full');

    tema.setReduzirMovimento('ligado');
    expect(raiz.dataset['motion']).toBe('reduced');
    expect(localStorage.getItem('geo_reduzir_movimento')).toBe('ligado');

    tema.setReduzirMovimento('automatico');
    expect(raiz.dataset['motion']).toBe('full');
    mudar('(prefers-reduced-motion: reduce)', true);
    expect(raiz.dataset['motion']).toBe('reduced');
  });

  it('densidade automática: confortável no toque, compacta com mouse', () => {
    simularMatchMedia({ '(pointer: coarse)': true });
    const tema = TestBed.inject(ThemeService);
    expect(tema.density()).toBe('comfortable');
    expect(raiz.dataset['geoDensity']).toBe('comfortable');

    tema.setDensity('compact');
    expect(raiz.dataset['geoDensity']).toBe('compact');
  });

  it('lê os valores gravados de tema', () => {
    expect(lerTema('dark')).toBe('escuro');
    expect(lerTema('light')).toBe('claro');
    expect(lerTema('system')).toBe('sistema');
    expect(lerTema(null)).toBe('sistema');
  });
});
