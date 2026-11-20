import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DragDropModule } from 'primeng/dragdrop';
import { formatarSulco, tomSulco } from '../../../core/models/frota-pneu.models';

/** Pneu mostrado numa posição do diagrama. */
export interface PneuNoDiagrama {
  id: string;
  marcaFogo: string;
  medida: string | null;
  sulcoAtualMm: number | null;
  ultimaPressaoPsi?: number | null;
  alertas?: string[];
}

export interface PosicaoDiagrama {
  codigo: string;
  eixo: number;
  rotulo: string;
  estepe: boolean;
  pneu: PneuNoDiagrama | null;
  /** Mudou no rascunho da movimentação (ainda não gravado). */
  alterada?: boolean;
}

interface Roda {
  posicao: PosicaoDiagrama;
  lado: 'E' | 'D';
}

/** Escopo do arrastar e soltar de pneus (montagem). */
export const ESCOPO_PNEU = 'frota-pneu';

/**
 * Diagrama do veículo visto de cima: eixos da frente para trás, rodas simples ou duplas e os
 * estepes. Cada roda é um botão (clique, toque ou teclado) e, na montagem, também recebe o pneu
 * arrastado. O tom da faixa lateral mostra o sulco frente ao mínimo da frota.
 */
@Component({
  selector: 'app-frota-pneu-diagrama',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, DragDropModule],
  styles: `
    :host { display: block; }
    .veiculo { position: relative; display: grid; justify-items: center; gap: 1.1rem; padding: 3rem 0.75rem 1rem;
      border: 1px solid var(--geo-border); border-radius: var(--geo-radius-xl); background:
        radial-gradient(circle at 50% 0, var(--geo-brand-soft), transparent 60%), var(--geo-surface-subtle); }
    .frente { position: absolute; top: 0.6rem; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 0.35rem;
      font-size: var(--geo-font-caption); font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--geo-foreground-muted); }
    /* O chassi acompanha só os eixos: o estepe fica fora dele. */
    .eixos { position: relative; display: grid; justify-items: center; gap: 1.1rem; }
    .chassi { position: absolute; top: -0.2rem; bottom: -0.2rem; left: 50%; width: 3.2rem; transform: translateX(-50%);
      border-inline: 3px solid var(--geo-border-strong); border-radius: var(--geo-radius-md); opacity: 0.55; pointer-events: none; }
    .eixo { position: relative; display: flex; align-items: center; gap: 0.35rem; }
    .eixo__barra { width: clamp(2.5rem, 12vw, 5.5rem); height: 0.55rem; border-radius: 999px; background: var(--geo-border-strong); }
    .eixo__numero { position: absolute; top: -1.05rem; left: 50%; transform: translateX(-50%); font-size: var(--geo-font-caption); font-weight: 600;
      color: var(--geo-foreground-subtle); }
    .lado { display: flex; gap: 0.2rem; }
    /* Com eixo duplo no veículo, todo lado reserva o espaço de duas rodas: o pneu do eixo simples fica na borda de fora, alinhado ao externo do duplo. */
    .veiculo--com-duplo .lado { width: 6.4rem; }
    .veiculo--com-duplo .lado--direita { justify-content: flex-end; }
    .veiculo--com-duplo .eixo::before { content: ''; position: absolute; left: 1.5rem; right: 1.5rem; top: 50%; height: 0.55rem; transform: translateY(-50%);
      border-radius: 999px; background: var(--geo-border-strong); }
    .lado { position: relative; }
    .roda { position: relative; display: grid; place-items: center; width: 3.1rem; height: 5.2rem; padding: 0; border-radius: 0.8rem;
      border: 2px dashed var(--geo-border-strong); background: var(--geo-surface); color: var(--geo-foreground-muted); cursor: pointer;
      transition: transform var(--geo-duration-fast) var(--geo-ease-standard), box-shadow var(--geo-duration-fast) var(--geo-ease-standard),
        border-color var(--geo-duration-fast) var(--geo-ease-standard); }
    .roda:disabled { cursor: default; }
    .roda:not(:disabled):hover { border-color: var(--geo-brand); box-shadow: var(--geo-shadow-sm); }
    .roda:focus-visible { outline: none; box-shadow: var(--geo-focus-ring); }
    /* A borracha é sempre escura, nos dois temas: banda com sulcos longitudinais e cravos. */
    .roda--ocupada { border: 0; border-radius: 0.95rem 0.95rem 0.95rem 0.95rem / 0.7rem; color: var(--p-slate-50);
      background:
        linear-gradient(90deg, transparent 0 20%, var(--p-slate-950) 20% 23%, transparent 23% 48.5%, var(--p-slate-950) 48.5% 51.5%, transparent 51.5% 77%, var(--p-slate-950) 77% 80%, transparent 80%),
        repeating-linear-gradient(180deg, var(--p-slate-700) 0 0.42rem, var(--p-slate-900) 0.42rem 0.56rem);
      box-shadow: inset 3px 0 3px -1px var(--p-slate-500), inset -3px 0 3px -1px var(--p-slate-950), 0 2px 5px color-mix(in srgb, var(--p-slate-950) 45%, transparent); }
    .roda--alvo { border-color: var(--geo-brand); border-style: solid; background: var(--geo-brand-soft); transform: scale(1.04); }
    .roda--ocupada.roda--alvo { box-shadow: 0 0 0 3px var(--geo-brand); }
    .roda--ocupada:not(:disabled):hover { box-shadow: 0 0 0 2px var(--geo-brand), 0 2px 5px color-mix(in srgb, var(--p-slate-950) 45%, transparent); }
    .roda--selecionada { box-shadow: 0 0 0 3px var(--geo-brand), var(--geo-shadow-md); transform: translateY(-2px); }
    /* Enquanto um pneu está escolhido ou sendo arrastado, as posições mostram que recebem o pneu. */
    .roda--destino:not(.roda--ocupada) { border-color: var(--geo-brand); border-style: solid; background: var(--geo-brand-soft); color: var(--geo-brand); }
    .roda--destino.roda--ocupada { outline: 2px dashed var(--geo-brand); outline-offset: 2px; }
    .roda--selecionada:not(.roda--ocupada) { border-color: var(--geo-brand); border-style: solid; background: var(--geo-brand-soft); color: var(--geo-brand); }
    .roda--alterada::after { content: ''; position: absolute; top: -0.3rem; right: -0.3rem; width: 0.8rem; height: 0.8rem; border-radius: 50%;
      background: var(--geo-brand); border: 2px solid var(--geo-surface); }
    .roda__fogo { max-width: 2.7rem; padding: 0.1rem 0.25rem; border-radius: 0.3rem; background: var(--p-slate-950); font-size: var(--geo-font-caption); font-weight: 600;
      letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .roda__vazia { font-size: 0.9rem; }
    .roda__sulco { position: absolute; left: 0.5rem; right: 0.5rem; top: 0.3rem; height: 0.26rem; border-radius: 999px; }
    .roda__sulco[data-tom='danger'] { background: var(--geo-danger); }
    .roda__sulco[data-tom='warning'] { background: var(--geo-warning); }
    .roda__sulco[data-tom='success'] { background: var(--geo-success); }
    .roda__sulco[data-tom='neutral'] { background: var(--geo-foreground-subtle); }
    .roda__aviso { position: absolute; bottom: -0.35rem; right: -0.35rem; display: grid; place-items: center; width: 1.15rem; height: 1.15rem;
      border-radius: 50%; font-size: var(--geo-font-caption); font-weight: 600; line-height: 1; background: var(--geo-danger); color: var(--p-slate-50); border: 2px solid var(--geo-surface); }
    .estepes { display: grid; justify-items: center; gap: 0.35rem; margin-top: 0.35rem; padding-top: 0.75rem; border-top: 1px dashed var(--geo-border-strong);
      width: min(100%, 18rem); }
    .estepes__titulo { font-size: var(--geo-font-caption); font-weight: 600; color: var(--geo-foreground-muted); }
    .estepes__rodas { display: flex; gap: 0.5rem; }
    .legenda { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.35rem 0.9rem; margin-top: 0.6rem; font-size: var(--geo-font-caption);
      color: var(--geo-foreground-muted); }
    .legenda span { display: inline-flex; align-items: center; gap: 0.35rem; }
    .legenda i { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; }
    .legenda i[data-tom='danger'] { background: var(--geo-danger); }
    .legenda i[data-tom='warning'] { background: var(--geo-warning); }
    .legenda i[data-tom='success'] { background: var(--geo-success); }
    .legenda i[data-tom='brand'] { background: var(--geo-brand); }
    @media (prefers-reduced-motion: reduce) { .roda { transition: none; } .roda--alvo, .roda--selecionada { transform: none; } }
  `,
  template: `
    <div class="veiculo" [class.veiculo--com-duplo]="temDuplo()" role="group" [attr.aria-label]="'Diagrama de pneus' + (titulo() ? ' do ' + titulo() : '')">
      <span class="frente"><i class="pi pi-arrow-up" aria-hidden="true"></i> Frente</span>
      <div class="eixos">
        <span class="chassi" aria-hidden="true"></span>
        @for (eixo of eixos(); track eixo.numero) {
          <div class="eixo">
            <span class="eixo__numero" aria-hidden="true">{{ eixo.numero }}</span>
            <div class="lado lado--esquerda">
              @for (r of eixo.esquerda; track r.posicao.codigo) {
                <ng-container *ngTemplateOutlet="roda; context: { $implicit: r.posicao }"></ng-container>
              }
            </div>
            <span class="eixo__barra" aria-hidden="true"></span>
            <div class="lado lado--direita">
              @for (r of eixo.direita; track r.posicao.codigo) {
                <ng-container *ngTemplateOutlet="roda; context: { $implicit: r.posicao }"></ng-container>
              }
            </div>
          </div>
        }
      </div>
      @if (estepes().length) {
        <div class="estepes">
          <span class="estepes__titulo">{{ estepes().length === 1 ? 'Estepe' : 'Estepes' }}</span>
          <div class="estepes__rodas">
            @for (p of estepes(); track p.codigo) {
              <ng-container *ngTemplateOutlet="roda; context: { $implicit: p }"></ng-container>
            }
          </div>
        </div>
      }
    </div>
    @if (legenda()) {
      <div class="legenda" aria-hidden="true">
        <span><i data-tom="success"></i>Sulco bom</span>
        <span><i data-tom="warning"></i>Perto do mínimo</span>
        <span><i data-tom="danger"></i>No mínimo ({{ sulcoMinimo() }} mm)</span>
        @if (arrastavel()) { <span><i data-tom="brand"></i>Alterado, falta salvar</span> }
      </div>
    }

    <ng-template #roda let-p>
      @let pneu = p.pneu;
      <button type="button" class="roda" [class.roda--ocupada]="!!pneu" [class.roda--alvo]="alvo() === p.codigo"
        [class.roda--selecionada]="(!!pneu && pneu.id === selecionado()) || p.codigo === posicaoSelecionada()" [class.roda--alterada]="p.alterada"
        [class.roda--destino]="destacarDestinos() && !(pneu && pneu.id === selecionado())"
        [disabled]="!interativo() || (!pneu && !arrastavel())" [attr.aria-label]="descrever(p)" [attr.aria-pressed]="(!!pneu && pneu.id === selecionado()) || p.codigo === posicaoSelecionada()"
        [title]="descrever(p)"
        [pDroppableDisabled]="!arrastavel()" [pDroppable]="escopo"
        (onDragEnter)="alvo.set(p.codigo)" (onDragLeave)="sair(p.codigo)" (onDrop)="soltar(p.codigo)"
        [pDraggableDisabled]="!arrastavel() || !pneu" [pDraggable]="escopo"
        (onDragStart)="pneu && arrasteIniciado.emit(pneu.id)" (onDragEnd)="arrasteTerminado.emit()"
        (click)="posicaoAcionada.emit(p.codigo)">
        @if (pneu) {
          <span class="roda__sulco" [attr.data-tom]="tom(pneu.sulcoAtualMm)" aria-hidden="true"></span>
          <span class="roda__fogo" aria-hidden="true">{{ pneu.marcaFogo }}</span>
          @if (pneu.alertas?.includes('SULCO_BAIXO') || pneu.alertas?.includes('PRESSAO_FORA')) {
            <span class="roda__aviso" aria-hidden="true">!</span>
          }
        } @else if (arrastavel()) {
          <i class="pi pi-plus roda__vazia" aria-hidden="true"></i>
        }
      </button>
    </ng-template>
  `
})
export class FrotaPneuDiagramaComponent {
  readonly eixosTexto = input<string | null>(null, { alias: 'eixos' });
  readonly posicoes = input<PosicaoDiagrama[]>([]);
  readonly sulcoMinimo = input(3);
  readonly titulo = input<string | null>(null);
  /** Rodas clicáveis (montagem, inspeção, ficha). */
  readonly interativo = input(true);
  /** Arrastar e soltar habilitado (montagem). */
  readonly arrastavel = input(false);
  readonly selecionado = input<string | null>(null);
  /** Posição vazia escolhida antes do pneu (montagem por toque). */
  readonly posicaoSelecionada = input<string | null>(null);
  /** Realça as posições que podem receber o pneu escolhido ou arrastado. */
  readonly destacarDestinos = input(false);
  readonly legenda = input(true);

  readonly posicaoAcionada = output<string>();
  readonly soltoNaPosicao = output<string>();
  readonly arrasteIniciado = output<string>();
  readonly arrasteTerminado = output<void>();

  protected readonly escopo = ESCOPO_PNEU;
  protected readonly alvo = signal<string | null>(null);

  protected readonly eixos = computed(() => {
    const porCodigo = new Map(this.posicoes().map((p) => [p.codigo, p]));
    const tipos = (this.eixosTexto() ?? '').split(',').filter(Boolean);
    return tipos.map((tipo, i) => {
      const n = i + 1;
      const codigos = tipo === 'D' ? { e: [`${n}EE`, `${n}EI`], d: [`${n}DI`, `${n}DE`] } : { e: [`${n}E`], d: [`${n}D`] };
      const roda = (c: string, lado: 'E' | 'D'): Roda => ({
        posicao: porCodigo.get(c) ?? { codigo: c, eixo: n, rotulo: c, estepe: false, pneu: null }, lado
      });
      return { numero: n, esquerda: codigos.e.map((c) => roda(c, 'E')), direita: codigos.d.map((c) => roda(c, 'D')) };
    });
  });
  protected readonly temDuplo = computed(() => (this.eixosTexto() ?? '').split(',').includes('D'));
  protected readonly estepes = computed(() => this.posicoes().filter((p) => p.estepe));

  protected tom(mm: number | null): string {
    return tomSulco(mm, this.sulcoMinimo());
  }

  protected descrever(p: PosicaoDiagrama): string {
    if (!p.pneu) return `${p.rotulo}: vazia`;
    const partes = [`${p.rotulo}: pneu ${p.pneu.marcaFogo}`];
    if (p.pneu.medida) partes.push(p.pneu.medida);
    partes.push(`sulco ${formatarSulco(p.pneu.sulcoAtualMm)}`);
    if (p.pneu.ultimaPressaoPsi) partes.push(`${p.pneu.ultimaPressaoPsi} psi`);
    if (p.alterada) partes.push('alterado, falta salvar');
    return partes.join(', ');
  }

  protected sair(codigo: string): void {
    if (this.alvo() === codigo) this.alvo.set(null);
  }

  protected soltar(codigo: string): void {
    this.alvo.set(null);
    this.soltoNaPosicao.emit(codigo);
  }
}
