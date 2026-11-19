import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Cores do tema atual para bibliotecas que não leem CSS (chart.js, Leaflet, visualizador de PDF). */
export interface GeoPaletaTema {
  escuro: boolean;
  series: string[];
  grade: string;
  eixo: string;
  texto: string;
  textoSuave: string;
  superficie: string;
  borda: string;
  marca: string;
  destaque: string;
  sucesso: string;
  aviso: string;
  perigo: string;
  info: string;
  fonte: string;
}

const SERIES = Array.from({ length: 8 }, (_, i) => `--geo-chart-${i + 1}` as const);

/**
 * Lê os tokens `--geo-*` e recalcula quando o tema muda (classe `.app-dark` ou densidade no
 * `<html>`). Não depende do ThemeService: observa o documento, então vale também no catálogo e
 * nos testes.
 */
@Injectable({ providedIn: 'root' })
export class ThemeTokens {
  private readonly versao = signal(0);

  readonly paleta = computed<GeoPaletaTema>(() => {
    this.versao();
    return {
      escuro: document.documentElement.classList.contains('app-dark'),
      series: SERIES.map((nome) => this.ler(nome)),
      grade: this.ler('--geo-chart-grid'),
      eixo: this.ler('--geo-chart-axis'),
      texto: this.ler('--geo-foreground'),
      textoSuave: this.ler('--geo-foreground-muted'),
      superficie: this.ler('--geo-surface'),
      borda: this.ler('--geo-border'),
      marca: this.ler('--geo-brand'),
      destaque: this.ler('--geo-accent'),
      sucesso: this.ler('--geo-success-text'),
      aviso: this.ler('--geo-warning-text'),
      perigo: this.ler('--geo-danger-text'),
      info: this.ler('--geo-info-text'),
      fonte: this.ler('--geo-font-family-sans'),
    };
  });

  constructor() {
    if (typeof MutationObserver === 'undefined') return;
    const observador = new MutationObserver(() => this.versao.update((v) => v + 1));
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-geo-density', 'style'],
    });
    inject(DestroyRef).onDestroy(() => observador.disconnect());
  }

  /** Valor atual de um token, sem espaços. */
  ler(nome: `--geo-${string}`): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  }
}
