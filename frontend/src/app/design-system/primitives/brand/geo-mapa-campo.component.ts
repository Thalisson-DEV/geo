import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Um morro do relevo: centro, raio do anel externo, quantidade de curvas e o "jeito" do contorno. */
interface Morro {
  readonly x: number;
  readonly y: number;
  readonly raio: number;
  readonly aneis: number;
  readonly fase: number;
}

/** Ponto da rede: uma equipe ou obra no mapa. */
export interface PontoDoMapa {
  readonly x: number;
  readonly y: number;
}

const MORROS: readonly Morro[] = [
  { x: 480, y: 230, raio: 250, aneis: 10, fase: 0.4 },
  { x: 110, y: 560, raio: 190, aneis: 7, fase: 2.1 },
  { x: 720, y: 690, raio: 150, aneis: 5, fase: 4.3 },
];

/** Traçado da rede já construída; o último trecho segue tracejado (programado). */
export const PONTOS_DA_REDE: readonly PontoDoMapa[] = [
  { x: 70, y: 150 },
  { x: 215, y: 250 },
  { x: 340, y: 215 },
  { x: 455, y: 330 },
  { x: 610, y: 300 },
];
const FIM_PROGRAMADO: PontoDoMapa = { x: 800, y: 395 };
/** Índice do ponto com a equipe em atividade (o único que pulsa). */
const PONTO_ATIVO = 3;

/**
 * Curva de nível fechada: anel de raio `r` deformado por duas ondas, para não parecer círculo.
 * Determinística: o mesmo desenho em todo carregamento.
 */
function curva(morro: Morro, r: number): string {
  const passos = 96;
  const pontos: string[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = (i / passos) * Math.PI * 2;
    const deform = 1 + 0.11 * Math.sin(3 * t + morro.fase) + 0.06 * Math.sin(5 * t + morro.fase * 1.7) + 0.03 * Math.cos(7 * t);
    const x = morro.x + Math.cos(t) * r * deform;
    const y = morro.y + Math.sin(t) * r * deform * 0.86;
    pontos.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pontos.join('') + 'Z';
}

const CURVAS = MORROS.flatMap((morro) =>
  Array.from({ length: morro.aneis }, (_, k) => ({
    d: curva(morro, (morro.raio * (k + 1)) / morro.aneis),
    /** As curvas mais altas (miolo do morro) chegam por último. */
    ordem: morro.aneis - k,
    mestra: (k + 1) % 4 === 0,
  })),
);

const REDE = PONTOS_DA_REDE.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join('');
const ULTIMO = PONTOS_DA_REDE[PONTOS_DA_REDE.length - 1];
const PROGRAMADO = `M${ULTIMO.x} ${ULTIMO.y}L${FIM_PROGRAMADO.x} ${FIM_PROGRAMADO.y}`;

/**
 * Mapa de campo da marca GEO: curvas de nível com a rede da obra e as equipes (pontos âmbar).
 * Decorativo (aria-hidden). Cores por variáveis no host:
 * `--geo-mapa-linha` (relevo), `--geo-mapa-rede` (traçado) e `--geo-mapa-ponto` (equipes).
 * Desenha-se uma vez ao aparecer (a equipe ativa pulsa três vezes e para); com movimento reduzido, já surge pronto.
 */
@Component({
  selector: 'geo-mapa-campo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'geo-mapa-campo', 'aria-hidden': 'true', '[class.geo-mapa-campo--animado]': 'animar()' },
  template: `
    <svg viewBox="0 0 800 800" [attr.preserveAspectRatio]="alinhamento() + ' slice'" focusable="false">
      <g class="relevo" fill="none">
        @for (c of curvas; track $index) {
          <path [attr.d]="c.d" pathLength="1" [class.mestra]="c.mestra" [style.--ordem]="c.ordem" />
        }
      </g>
      <g class="rede" fill="none">
        <path class="rede__feita" [attr.d]="rede" pathLength="1" />
        <path class="rede__programada" [attr.d]="programado" />
      </g>
      <g class="equipes">
        @for (p of pontos; track $index) {
          <g class="equipe" [class.equipe--ativa]="$index === ativo" [style.--ordem]="$index">
            @if ($index === ativo) {
              <circle class="equipe__halo" [attr.cx]="p.x" [attr.cy]="p.y" r="7" />
            }
            <circle class="equipe__ponto" [attr.cx]="p.x" [attr.cy]="p.y" r="6" />
          </g>
        }
      </g>
    </svg>
  `,
  styles: `
    :host {
      --geo-mapa-linha: currentColor;
      --geo-mapa-rede: currentColor;
      --geo-mapa-ponto: var(--p-amber-400);
      display: block;
      overflow: hidden;
      pointer-events: none;
    }
    svg { display: block; inline-size: 100%; block-size: 100%; }

    .relevo path { stroke: var(--geo-mapa-linha); stroke-width: 0.9; opacity: 0.5; }
    .relevo path.mestra { stroke-width: 1.4; opacity: 0.8; }

    .rede path { stroke: var(--geo-mapa-rede); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .rede__programada { stroke-dasharray: 2 7; opacity: 0.7; }

    .equipe__ponto { fill: var(--geo-mapa-ponto); stroke: var(--geo-mapa-fundo, transparent); stroke-width: 3; }
    .equipe__halo { fill: none; stroke: var(--geo-mapa-ponto); stroke-width: 2; transform-box: fill-box; transform-origin: center; opacity: 0; }

    /* Entrada única: o relevo se desenha, a rede corre sobre ele e as equipes aparecem em sequência. */
    :host(.geo-mapa-campo--animado) .relevo path {
      stroke-dasharray: 1.5 1.5;
      animation: geo-mapa-traco 1.6s cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-delay: calc(var(--ordem) * 70ms);
    }
    :host(.geo-mapa-campo--animado) .rede__feita {
      stroke-dasharray: 1.5 1.5;
      animation: geo-mapa-traco 1.1s cubic-bezier(0.65, 0, 0.35, 1) 0.7s both;
    }
    :host(.geo-mapa-campo--animado) .rede__programada { animation: geo-mapa-surge 0.4s ease-out 1.8s both; }
    :host(.geo-mapa-campo--animado) .equipe {
      transform-box: fill-box; transform-origin: center;
      animation: geo-mapa-ponto 0.42s cubic-bezier(0.34, 1.4, 0.64, 1) both;
      animation-delay: calc(0.9s + var(--ordem) * 180ms);
    }
    :host(.geo-mapa-campo--animado) .equipe__halo { animation: geo-mapa-pulso 2.8s ease-out 2.2s 3; }

    /* Traço e vão de 1,5 (com pathLength 1): o Chrome arredonda o comprimento e um traço de 1 não fecha a linha. */
    @keyframes geo-mapa-traco { from { stroke-dashoffset: 1.5; } to { stroke-dashoffset: 0; } }
    @keyframes geo-mapa-surge { from { opacity: 0; } }
    @keyframes geo-mapa-ponto { from { opacity: 0; transform: scale(0.2); } }
    @keyframes geo-mapa-pulso {
      0% { opacity: 0.7; transform: scale(1); }
      70%, 100% { opacity: 0; transform: scale(3.4); }
    }

    /* Mesma especificidade das regras acima e declaradas depois: vencem sem precisar de prioridade. */
    @media (prefers-reduced-motion: reduce) {
      :host(.geo-mapa-campo--animado) .relevo path,
      :host(.geo-mapa-campo--animado) .rede__feita,
      :host(.geo-mapa-campo--animado) .rede__programada,
      :host(.geo-mapa-campo--animado) .equipe,
      :host(.geo-mapa-campo--animado) .equipe__halo { animation: none; }
    }
    :host-context([data-motion='reduced']) .relevo path,
    :host-context([data-motion='reduced']) .rede__feita,
    :host-context([data-motion='reduced']) .rede__programada,
    :host-context([data-motion='reduced']) .equipe,
    :host-context([data-motion='reduced']) .equipe__halo { animation: none; }
  `,
})
export class GeoMapaCampoComponent {
  /** Como recortar o mapa no espaço disponível (sempre preenche). */
  readonly alinhamento = input<'xMidYMid' | 'xMaxYMid' | 'xMinYMid' | 'xMidYMin'>('xMidYMid');
  /** Desenha o mapa ao aparecer. Desligue onde ele reaparece com frequência. */
  readonly animar = input(true);

  protected readonly curvas = CURVAS;
  protected readonly rede = REDE;
  protected readonly programado = PROGRAMADO;
  protected readonly pontos = PONTOS_DA_REDE;
  protected readonly ativo = PONTO_ATIVO;
}
