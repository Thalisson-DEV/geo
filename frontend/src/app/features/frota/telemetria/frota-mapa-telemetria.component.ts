import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';

import { desenharTrajeto } from '../../../shared/utils/trajeto-mapa';

// Leaflet é carregado globalmente (index.html), como nos demais mapas do GEO.
declare const L: any;

export interface MarcadorMapa {
  latitude: number;
  longitude: number;
  /** Texto do popup. */
  rotulo: string;
  /** Tom do marcador, lido dos tokens: brand (padrão), danger, warning, success, neutral. */
  tom?: 'brand' | 'danger' | 'warning' | 'success' | 'neutral';
  /** Raio do marcador em px (padrão 8). */
  tamanho?: number;
}

/** Área circular no mapa (ex.: o raio de atuação da base). */
export interface CirculoMapa {
  latitude: number;
  longitude: number;
  raioMetros: number;
  rotulo: string;
}

/** Linha tracejada entre dois pontos (ex.: a nota e onde estava o veículo). */
export interface LigacaoMapa {
  de: [number, number];
  para: [number, number];
  tom?: 'danger' | 'warning' | 'neutral';
}

/**
 * Mapa da telemetria: marcadores (posição atual, evento) e, quando houver, o trajeto do período.
 * As cores vêm dos tokens do tema, lidas no momento do desenho (o Leaflet precisa do valor).
 * Sem coordenada, mostra o aviso no lugar do mapa.
 */
@Component({
  selector: 'app-frota-mapa-telemetria',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .mapa { width: 100%; height: var(--mapa-altura, 280px); border: 1px solid var(--ces-border); border-radius: var(--ces-radius-lg);
      overflow: hidden; background: var(--ces-surface-muted); }
    .mapa__vazio { display: grid; place-items: center; gap: 0.25rem; height: var(--mapa-altura, 280px); padding: 1rem; text-align: center;
      border: 1px dashed var(--ces-border); border-radius: var(--ces-radius-lg); color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .mapa__vazio .pi { font-size: 1.25rem; }
  `,
  template: `
    @if (temPontos()) {
      <div #mapa class="mapa" role="img" [attr.aria-label]="descricao()"></div>
    } @else {
      <div class="mapa__vazio" role="note"><i class="pi pi-map" aria-hidden="true"></i><span>{{ vazio() }}</span></div>
    }
  `
})
export class FrotaMapaTelemetriaComponent implements OnDestroy {
  readonly marcadores = input<MarcadorMapa[]>([]);
  readonly trajeto = input<[number, number][]>([]);
  readonly circulos = input<CirculoMapa[]>([]);
  readonly ligacoes = input<LigacaoMapa[]>([]);
  readonly descricao = input('Mapa');
  readonly vazio = input('Sem posição registrada.');

  private readonly elemento = viewChild<ElementRef<HTMLDivElement>>('mapa');
  private mapa: any = null;

  constructor() {
    effect(() => {
      const el = this.elemento()?.nativeElement;
      const marcadores = this.marcadores();
      const trajeto = this.trajeto();
      const circulos = this.circulos();
      const ligacoes = this.ligacoes();
      this.destruir();
      if (el) this.desenhar(el, marcadores, trajeto, circulos, ligacoes);
    });
  }

  protected temPontos(): boolean {
    return this.marcadores().length > 0 || this.trajeto().length > 1;
  }

  ngOnDestroy(): void {
    this.destruir();
  }

  private desenhar(el: HTMLElement, marcadores: MarcadorMapa[], trajeto: [number, number][], circulos: CirculoMapa[],
                   ligacoes: LigacaoMapa[]): void {
    if (typeof L === 'undefined') return;
    const estilo = getComputedStyle(el);
    // Neutro não tem token próprio de cor cheia: usa o texto secundário.
    const cor = (tom: string) => estilo.getPropertyValue(`--ces-${tom === 'neutral' ? 'foreground-muted' : tom}`).trim() || 'currentColor';
    const borda = estilo.getPropertyValue('--ces-surface').trim() || 'white';
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mapa = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, zoomAnimation: !reduzido });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(this.mapa);
    const limites: [number, number][] = [
      ...(trajeto.length > 1 ? trajeto : []),
      ...circulos.map((c) => [c.latitude, c.longitude] as [number, number]),
      ...marcadores.map((m) => [m.latitude, m.longitude] as [number, number])
    ];
    // O enquadramento vem antes das camadas: um traço dentro de grupo, num mapa ainda sem posição, quebra o Leaflet.
    if (limites.length === 1) this.mapa.setView(limites[0], 15);
    else if (limites.length) this.mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 16 });
    if (trajeto.length > 1) {
      desenharTrajeto(this.mapa, trajeto, { tema: el, saida: 'Início do trajeto', chegada: 'Fim do trajeto' });
    }
    for (const c of circulos) {
      L.circle([c.latitude, c.longitude], { radius: c.raioMetros, color: cor('brand'), weight: 1.5, opacity: 0.7, fillOpacity: 0.08, dashArray: '4 4' })
        .addTo(this.mapa).bindTooltip(c.rotulo);
    }
    for (const l of ligacoes) {
      L.polyline([l.de, l.para], { color: cor(l.tom ?? 'neutral'), weight: 2, opacity: 0.9, dashArray: '5 5' }).addTo(this.mapa);
    }
    for (const m of marcadores) {
      L.circleMarker([m.latitude, m.longitude], {
        radius: m.tamanho ?? 8, fillColor: cor(m.tom ?? 'brand'), color: borda, weight: 2, opacity: 1, fillOpacity: 0.9
      }).addTo(this.mapa).bindPopup(m.rotulo);
    }
    setTimeout(() => this.mapa?.invalidateSize(), 150);
  }

  private destruir(): void {
    this.mapa?.remove();
    this.mapa = null;
  }
}
