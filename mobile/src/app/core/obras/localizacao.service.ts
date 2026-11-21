import { Injectable } from '@angular/core';

export interface Posicao {
  latitude: number;
  longitude: number;
  precisao: number | null;
}

/**
 * GPS só no momento da ação (sem rastreio em segundo plano). Nunca trava: sem permissão, sem sinal de GPS ou demorando,
 * devolve nulo e o registro segue sem coordenada.
 */
@Injectable({ providedIn: 'root' })
export class LocalizacaoService {
  private ultima: { posicao: Posicao; em: number } | null = null;

  async agora(esperaMs = 6000): Promise<Posicao | null> {
    if (this.ultima && Date.now() - this.ultima.em < 60_000) return this.ultima.posicao;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise<Posicao | null>((resolver) => {
      const limite = setTimeout(() => resolver(this.ultima?.posicao ?? null), esperaMs + 500);
      try {
        navigator.geolocation.getCurrentPosition(
          (p) => {
            clearTimeout(limite);
            const posicao = { latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy ?? null };
            this.ultima = { posicao, em: Date.now() };
            resolver(posicao);
          },
          () => {
            clearTimeout(limite);
            resolver(this.ultima?.posicao ?? null);
          },
          { enableHighAccuracy: true, timeout: esperaMs, maximumAge: 60_000 },
        );
      } catch {
        clearTimeout(limite);
        resolver(null);
      }
    });
  }
}
