import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { GeoDensity } from '../../design-system/core';

/** Preferência de tema. "sistema" acompanha o sistema operacional sem recarregar. */
export type GeoTema = 'claro' | 'escuro' | 'sistema';
/** "automatico" segue o sistema operacional; "ligado" reduz sempre. */
export type GeoReduzirMovimento = 'automatico' | 'ligado';
/** "auto" escolhe pela forma de apontar: compacta com mouse, confortável no toque. */
export type GeoDensidadePreferida = GeoDensity | 'auto';

/** Mantido só para quem ainda lê a cor primária: ela é fixa no GEO. */
export type GeoPrimaryColor = 'blue';

/** Chaves do navegador. Os valores de tema seguem os já gravados ('light'/'dark') mais 'system'. */
export const CHAVE_TEMA = 'geo_theme_mode';
export const CHAVE_REDUZIR_MOVIMENTO = 'geo_reduzir_movimento';
export const CHAVE_DENSIDADE = 'geo_density';
/** Preferências antigas que deixaram de valer (cor primária e ripple). São apagadas ao abrir. */
const CHAVES_DESCONTINUADAS = ['geo_primary_color', 'geo_ripple_enabled'];

const CONSULTA_ESCURO = '(prefers-color-scheme: dark)';
const CONSULTA_MOVIMENTO = '(prefers-reduced-motion: reduce)';
const CONSULTA_TOQUE = '(pointer: coarse)';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly root = document.documentElement;

  /** Preferência escolhida pelo usuário. */
  readonly tema = signal<GeoTema>('sistema');
  readonly reduzirMovimento = signal<GeoReduzirMovimento>('automatico');
  readonly densidadePreferida = signal<GeoDensidadePreferida>('auto');

  private readonly sistemaEscuro = signal(consultar(CONSULTA_ESCURO));
  private readonly sistemaReduz = signal(consultar(CONSULTA_MOVIMENTO));
  private readonly toque = signal(consultar(CONSULTA_TOQUE));

  /** Tema efetivo na tela. */
  readonly isDarkMode = computed(() =>
    this.tema() === 'sistema' ? this.sistemaEscuro() : this.tema() === 'escuro'
  );
  /** Movimento efetivo: reduzido pela preferência ou pelo sistema. */
  readonly movimentoReduzido = computed(
    () => this.reduzirMovimento() === 'ligado' || this.sistemaReduz()
  );
  /** Densidade efetiva. */
  readonly density = computed<GeoDensity>(() => {
    const escolhida = this.densidadePreferida();
    if (escolhida !== 'auto') return escolhida;
    return this.toque() ? 'comfortable' : 'compact';
  });

  /** A cor primária é fixa; mantido para os gráficos que ainda a leem. */
  readonly primaryColor = signal<GeoPrimaryColor>('blue').asReadonly();

  constructor() {
    for (const chave of CHAVES_DESCONTINUADAS) remover(chave);

    this.tema.set(lerTema(ler(CHAVE_TEMA)));
    this.reduzirMovimento.set(ler(CHAVE_REDUZIR_MOVIMENTO) === 'ligado' ? 'ligado' : 'automatico');
    const densidade = ler(CHAVE_DENSIDADE);
    this.densidadePreferida.set(
      densidade === 'compact' || densidade === 'comfortable' ? densidade : 'auto'
    );

    this.escutar(CONSULTA_ESCURO, this.sistemaEscuro.set.bind(this.sistemaEscuro));
    this.escutar(CONSULTA_MOVIMENTO, this.sistemaReduz.set.bind(this.sistemaReduz));
    this.escutar(CONSULTA_TOQUE, this.toque.set.bind(this.toque));
    this.escutarImpressao();
    this.aplicar();
  }

  setTema(tema: GeoTema): void {
    this.tema.set(tema);
    gravar(CHAVE_TEMA, tema === 'sistema' ? 'system' : tema === 'escuro' ? 'dark' : 'light');
    this.aplicar();
  }

  /** Atalho do botão claro/escuro: grava a escolha explícita. */
  setDarkMode(isDark: boolean): void {
    this.setTema(isDark ? 'escuro' : 'claro');
  }

  /** Há escolha de tema gravada neste aparelho (senão vale a do perfil ou do sistema). */
  temTemaSalvo(): boolean {
    return ler(CHAVE_TEMA) !== null;
  }

  setReduzirMovimento(valor: GeoReduzirMovimento): void {
    this.reduzirMovimento.set(valor);
    gravar(CHAVE_REDUZIR_MOVIMENTO, valor);
    this.aplicar();
  }

  setDensity(density: GeoDensidadePreferida): void {
    this.densidadePreferida.set(density);
    gravar(CHAVE_DENSIDADE, density);
    this.aplicar();
  }

  private aplicar(): void {
    const escuro = this.isDarkMode();
    this.root.classList.toggle('app-dark', escuro);
    this.root.classList.toggle('dark', escuro);
    this.root.style.colorScheme = escuro ? 'dark' : 'light';
    this.root.dataset['motion'] = this.movimentoReduzido() ? 'reduced' : 'full';
    this.root.dataset['geoDensity'] = this.density();
  }

  private escutar(consulta: string, atualizar: (valor: boolean) => void): void {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(consulta) : null;
    if (!media?.addEventListener) return;
    const ouvinte = (evento: MediaQueryListEvent) => {
      atualizar(evento.matches);
      this.aplicar();
    };
    media.addEventListener('change', ouvinte);
    this.destroyRef.onDestroy(() => media.removeEventListener('change', ouvinte));
  }

  /** Impressão sai sempre no claro, inclusive componentes de terceiros. */
  private escutarImpressao(): void {
    const antes = () => {
      this.root.classList.remove('app-dark', 'dark');
      this.root.style.colorScheme = 'light';
    };
    const depois = () => this.aplicar();
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', depois);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', depois);
    });
  }
}

export function lerTema(valor: string | null): GeoTema {
  if (valor === 'dark' || valor === 'escuro') return 'escuro';
  if (valor === 'light' || valor === 'claro') return 'claro';
  return 'sistema';
}

function consultar(consulta: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches;
  } catch {
    return false;
  }
}

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento (modo privado): a escolha vale só nesta sessão.
  }
}

function remover(chave: string): void {
  try {
    localStorage.removeItem(chave);
  } catch {
    // idem
  }
}
