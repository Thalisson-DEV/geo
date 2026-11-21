import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { DocumentoPdf, abrirPdf, desenhoCancelado } from '../../core/frota/visor-pdf';
import { IconeComponent } from '../../ui';
import { SituacaoPonto } from '../../core/obras/obras-regras';

export interface MarcadorPonto {
  id: string;
  numero: string;
  pagina: number;
  x: number;
  y: number;
  situacao: SituacaoPonto;
  pendencia: boolean;
}

/**
 * O projeto em PDF (do aparelho) com os pontos coloridos pela execução: a fazer (neutro), parcial (âmbar), feito
 * (verde). Tocar num ponto escolhe o ponto. Página a página, com troca de página quando o projeto tem mais de uma.
 */
@Component({
  selector: 'app-projeto-pdf',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (paginas() > 1) {
      <div class="paginas" role="group" aria-label="Páginas do projeto">
        <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="mudar(-1)" [disabled]="pagina() <= 1" aria-label="Página anterior"><geo-icone nome="voltar" /></button>
        <span class="geo-num">Página {{ pagina() }} de {{ paginas() }}</span>
        <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="mudar(1)" [disabled]="pagina() >= paginas()" aria-label="Próxima página"><geo-icone nome="avancar" /></button>
      </div>
    }
    <div class="folha" #folha>
      <canvas #canvas aria-hidden="true"></canvas>
      @for (m of marcadoresDaPagina(); track m.id) {
        <button type="button" class="ponto" [attr.data-situacao]="m.situacao" [class.selecionado]="m.id === selecionado()"
          [style.left.%]="m.x * 100" [style.top.%]="m.y * 100" (click)="escolhido.emit(m.id)"
          [attr.aria-label]="'Ponto ' + m.numero + ': ' + rotulo(m.situacao)">
          {{ m.numero }}@if (m.pendencia) { <i class="pendencia" aria-hidden="true"></i> }
        </button>
      }
      @if (estado() !== 'pronto') {
        <p class="estado" role="status">{{ estado() === 'carregando' ? 'Abrindo o projeto…' : estado() === 'sem' ? 'Projeto não está no aparelho.' : 'Não foi possível abrir o projeto.' }}</p>
      }
    </div>
    <ul class="legenda" aria-label="Legenda">
      <li><i data-situacao="A_FAZER"></i>A fazer</li><li><i data-situacao="PARCIAL"></i>Parcial</li><li><i data-situacao="FEITO"></i>Feito</li>
    </ul>
  `,
  styles: [`
    :host { display: block; }
    .paginas { display: flex; align-items: center; justify-content: center; gap: var(--geo-e3); padding: var(--geo-e2) 0; font: var(--geo-t-apoio); }
    .folha { position: relative; margin: 0 var(--geo-margem); background: var(--geo-superficie); border-radius: var(--geo-r-grupo); overflow: hidden; min-height: 240px; box-shadow: var(--geo-sombra-cartao); }
    canvas { display: block; width: 100%; height: auto; }
    .ponto { position: absolute; transform: translate(-50%, -50%); min-width: 36px; height: 36px; padding: 0 6px; border-radius: var(--geo-r-pilula);
      border: 2px solid var(--geo-superficie); font: 600 .8125rem/1 var(--geo-fonte); font-variant-numeric: tabular-nums; cursor: pointer;
      background: var(--geo-superficie-2); color: var(--geo-texto); box-shadow: var(--geo-sombra-cartao); touch-action: manipulation; }
    .ponto::after { content: ''; position: absolute; inset: -8px; }
    .ponto[data-situacao='PARCIAL'] { background: var(--geo-atencao); color: var(--geo-superficie); }
    .ponto[data-situacao='FEITO'] { background: var(--geo-ok); color: var(--geo-superficie); }
    .ponto.selecionado { outline: 3px solid var(--geo-destaque); outline-offset: 2px; }
    .pendencia { position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; border-radius: 50%; background: var(--geo-erro); border: 2px solid var(--geo-superficie); }
    .estado { position: absolute; inset: 0; display: grid; place-items: center; font: var(--geo-t-apoio); color: var(--geo-texto-2); background: var(--geo-superficie); }
    .legenda { display: flex; gap: var(--geo-e4); justify-content: center; list-style: none; padding: var(--geo-e2) 0 0; margin: 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .legenda li { display: inline-flex; align-items: center; gap: 6px; }
    .legenda i { width: 12px; height: 12px; border-radius: 50%; background: var(--geo-superficie-2); border: 1px solid var(--geo-borda-campo); }
    .legenda i[data-situacao='PARCIAL'] { background: var(--geo-atencao); border-color: transparent; }
    .legenda i[data-situacao='FEITO'] { background: var(--geo-ok); border-color: transparent; }
  `],
})
export class ProjetoPdfComponent implements OnDestroy {
  readonly arquivo = input<Blob | null>(null);
  readonly marcadores = input<MarcadorPonto[]>([]);
  readonly selecionado = input<string | null>(null);
  readonly escolhido = output<string>();

  readonly pagina = signal(1);
  readonly paginas = signal(1);
  readonly estado = signal<'carregando' | 'pronto' | 'sem' | 'erro'>('carregando');
  readonly marcadoresDaPagina = signal<MarcadorPonto[]>([]);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly folha = viewChild.required<ElementRef<HTMLDivElement>>('folha');
  private doc: DocumentoPdf | null = null;

  constructor() {
    effect(() => {
      const blob = this.arquivo();
      untracked(() => void this.abrir(blob));
    });
    effect(() => {
      const pagina = this.pagina();
      this.marcadoresDaPagina.set(this.marcadores().filter(m => (m.pagina || 1) === pagina));
    });
    effect(() => {
      // O ponto escolhido fora do projeto (na lista) leva à página dele.
      const id = this.selecionado();
      const m = untracked(() => this.marcadores().find(x => x.id === id));
      if (m && m.pagina && m.pagina !== untracked(() => this.pagina())) untracked(() => this.irPara(m.pagina));
    });
  }

  mudar(delta: number): void {
    this.irPara(this.pagina() + delta);
  }

  rotulo(s: SituacaoPonto): string {
    return s === 'FEITO' ? 'feito' : s === 'PARCIAL' ? 'parcial' : 'a fazer';
  }

  ngOnDestroy(): void {
    this.doc?.fechar();
  }

  private irPara(pagina: number): void {
    this.pagina.set(Math.max(1, Math.min(this.paginas(), pagina)));
    void this.desenhar();
  }

  private async abrir(blob: Blob | null): Promise<void> {
    this.doc?.fechar();
    this.doc = null;
    if (!blob) {
      this.estado.set('sem');
      return;
    }
    this.estado.set('carregando');
    try {
      this.doc = await abrirPdf(blob);
      this.paginas.set(this.doc.paginas);
      await this.desenhar();
    } catch {
      this.estado.set('erro');
    }
  }

  private async desenhar(): Promise<void> {
    if (!this.doc) return;
    try {
      await this.doc.desenhar(this.pagina(), this.canvas().nativeElement, this.folha().nativeElement.clientWidth || 600);
      this.estado.set('pronto');
    } catch (e) {
      if (!desenhoCancelado(e)) this.estado.set('erro');
    }
  }
}
