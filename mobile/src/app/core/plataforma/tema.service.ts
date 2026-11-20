import { Injectable, computed, signal } from '@angular/core';

export type Tema = 'claro' | 'escuro' | 'sistema';
export type Contraste = 'normal' | 'alto';

const CHAVE_TEMA = 'geo_tema';
const CHAVE_CONTRASTE = 'geo_contraste';
/** Cor da barra de status: o fundo do topo do app em cada esquema (tokens --geo-fundo). */
const COR_BARRA: Record<'claro' | 'escuro', string> = { claro: '#F4F4F5', escuro: '#09090B' };
const CONSULTA_ESCURO = '(prefers-color-scheme: dark)';

/**
 * Tema do app. CLARO por padrão, mesmo com o celular em modo escuro (decisão do dono do produto:
 * em campo, sob sol, o claro lê melhor). Escuro, "seguir o sistema" e alto contraste (sol forte) são
 * escolhas do usuário em Conta. O index.html aplica a escolha antes do Angular carregar, para não piscar.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly tema = signal<Tema>(lerTema());
  readonly contraste = signal<Contraste>(ler(CHAVE_CONTRASTE) === 'alto' ? 'alto' : 'normal');
  private readonly sistemaEscuro = signal(consultaEscuro()?.matches ?? false);
  /** Esquema realmente aplicado na tela. */
  readonly esquema = computed<'claro' | 'escuro'>(() => {
    const tema = this.tema();
    if (tema === 'sistema') return this.sistemaEscuro() ? 'escuro' : 'claro';
    return tema;
  });

  constructor() {
    // Com "seguir o sistema", acompanha a troca do aparelho (ex.: modo escuro automático à noite).
    consultaEscuro()?.addEventListener('change', (e) => {
      this.sistemaEscuro.set(e.matches);
      if (this.tema() === 'sistema') this.aplicar();
    });
  }

  definirTema(tema: Tema): void {
    this.tema.set(tema);
    gravar(CHAVE_TEMA, tema);
    this.aplicar();
  }

  definirContraste(contraste: Contraste): void {
    this.contraste.set(contraste);
    gravar(CHAVE_CONTRASTE, contraste);
    this.aplicar();
  }

  aplicar(): void {
    if (typeof document === 'undefined') return;
    const raiz = document.documentElement;
    const esquema = this.esquema();
    if (esquema === 'escuro') raiz.setAttribute('data-tema', 'escuro');
    else raiz.removeAttribute('data-tema');
    if (this.contraste() === 'alto') raiz.setAttribute('data-contraste', 'alto');
    else raiz.removeAttribute('data-contraste');
    const meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]');
    if (meta) meta.content = COR_BARRA[esquema];
  }
}

function lerTema(): Tema {
  const salvo = ler(CHAVE_TEMA);
  return salvo === 'escuro' || salvo === 'sistema' ? salvo : 'claro';
}

function consultaEscuro(): MediaQueryList | null {
  try {
    return typeof matchMedia === 'function' ? matchMedia(CONSULTA_ESCURO) : null;
  } catch {
    return null;
  }
}

function ler(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}

function gravar(chave: string, valor: string): void {
  try { localStorage.setItem(chave, valor); } catch { /* modo privado: vale só nesta sessão */ }
}
