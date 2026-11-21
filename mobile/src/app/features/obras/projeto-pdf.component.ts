import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, input, output, signal, untracked, viewChild,
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

/** Níveis de aproximação: o projeto é uma prancha grande; no tablet a 1×, o desenho e os textos ficam pequenos. */
const NIVEIS = [1, 1.5, 2, 3, 4];

/**
 * O projeto em PDF (do aparelho) com os pontos coloridos pela execução: a fazer (neutro), parcial (âmbar), feito
 * (verde). Aproxima com os botões ou com dois dedos, arrasta para andar pela prancha e abre em tela cheia. Tocar num
 * ponto escolhe o ponto; o ponto escolhido na lista vem para o centro.
 */
@Component({
  selector: 'app-projeto-pdf',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.cheia]': 'telaCheia()', '[style.--marcador.px]': 'tamanhoMarcador()', '(document:keydown.escape)': 'telaCheia() && fecharTelaCheia()' },
  template: `
    <div class="barra" role="toolbar" aria-label="Projeto">
      @if (paginas() > 1) {
        <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="mudar(-1)" [disabled]="pagina() <= 1" aria-label="Página anterior"><geo-icone nome="voltar" /></button>
        <span class="geo-num pag">Folha {{ pagina() }} de {{ paginas() }}</span>
        <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="mudar(1)" [disabled]="pagina() >= paginas()" aria-label="Próxima página"><geo-icone nome="avancar" /></button>
      }
      <span class="espaco titulo">@if (telaCheia() && titulo()) { {{ titulo() }} }</span>
      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="aproximar(-1)" [disabled]="nivel() === 0" aria-label="Afastar"><geo-icone nome="menos" /></button>
      <span class="geo-num zoom" aria-live="polite">{{ zoomTexto() }}</span>
      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="aproximar(1)" [disabled]="nivel() === niveis.length - 1" aria-label="Aproximar"><geo-icone nome="mais" /></button>
      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="alternarTelaCheia()" [attr.aria-label]="telaCheia() ? 'Sair da tela cheia' : 'Abrir o projeto em tela cheia'"
        data-testid="projeto-tela-cheia"><geo-icone [nome]="telaCheia() ? 'recolher' : 'expandir'" /></button>
    </div>
    <div class="janela" #janela (pointerdown)="tocar($event)" (pointermove)="mover($event)" (pointerup)="soltar($event)" (pointercancel)="soltar($event)">
      <div class="folha" #folha [style.width.%]="zoom() * 100">
        <canvas #canvas aria-hidden="true"></canvas>
        @for (m of marcadoresDaPagina(); track m.id) {
          <button type="button" class="ponto" [attr.data-situacao]="m.situacao" [class.selecionado]="m.id === selecionado()" [class.proximo]="m.id === proximo()" [attr.data-ponto]="m.id"
            [style.left.%]="m.x * 100" [style.top.%]="m.y * 100" (click)="escolhido.emit(m.id)"
            [attr.aria-label]="'Ponto ' + m.numero + ': ' + rotulo(m.situacao) + (m.id === proximo() ? ', próximo' : '') + (m.pendencia ? ', com foto pendente' : '')">
            {{ m.numero }}@if (m.pendencia) { <i class="pendencia" aria-hidden="true"></i> }
          </button>
        }
        @if (estado() !== 'pronto') {
          <p class="estado" role="status">{{ estado() === 'carregando' ? 'Abrindo o projeto…' : estado() === 'sem' ? 'O projeto desta obra não está no aparelho. Abra o app com sinal para baixar.' : 'Não foi possível abrir o projeto.' }}</p>
        }
      </div>
    </div>
    <ul class="legenda" aria-label="Legenda">
      <li><i data-situacao="A_FAZER"></i>A fazer</li><li><i data-situacao="PARCIAL"></i>Parcial</li><li><i data-situacao="FEITO"></i>Feito</li>
      <li><i class="prox"></i>Próximo</li><li><i class="foto"></i>Foto pendente</li>
    </ul>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 0; }
    :host(.cheia) { position: fixed; inset: 0; z-index: 50; background: var(--geo-fundo); padding: var(--geo-safe-topo) 0 var(--geo-safe-base); }
    .barra { display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-margem) var(--geo-e2); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    :host(.cheia) .barra { padding-top: var(--geo-e2); }
    .espaco { flex: 1; min-width: 0; }
    .titulo { color: var(--geo-texto); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .zoom { min-width: 3.2em; text-align: center; }
    .janela { position: relative; margin: 0 var(--geo-margem); overflow: auto; border-radius: var(--geo-r-grupo); background: var(--geo-papel);
      box-shadow: var(--geo-sombra-cartao); touch-action: pan-x pan-y; overscroll-behavior: contain; max-height: var(--altura-projeto, 70vh); flex: 1; }
    :host(.cheia) .janela { flex: 1; max-height: none; margin: 0; border-radius: 0; }
    .folha { position: relative; min-height: 240px; }
    canvas { display: block; width: 100%; height: auto; }
    /* O marcador cresce com o zoom: a 100% a prancha inteira cabe e os pontos não se amontoam; aproximado, o alvo fica grande. */
    .ponto { position: absolute; transform: translate(-50%, -50%); min-width: var(--marcador, 40px); height: var(--marcador, 40px); padding: 0 4px;
      border-radius: var(--geo-r-pilula); border: 2px solid var(--geo-papel); font: 600 calc(var(--marcador, 40px) * .4)/1 var(--geo-fonte); font-variant-numeric: tabular-nums; cursor: pointer;
      background: var(--geo-superficie); color: var(--geo-texto); box-shadow: var(--geo-sombra-cartao); touch-action: manipulation; }
    .ponto::after { content: ''; position: absolute; inset: -6px; }
    /* A fazer: branco sobre o papel branco precisa de contorno para aparecer. */
    .ponto[data-situacao='A_FAZER'] { border-color: var(--geo-texto-2); }
    .ponto[data-situacao='PARCIAL'] { background: var(--geo-atencao); color: var(--geo-superficie); }
    .ponto[data-situacao='FEITO'] { background: var(--geo-ok); color: var(--geo-superficie); }
    .ponto.proximo { box-shadow: 0 0 0 4px var(--geo-destaque-suave), 0 0 0 6px var(--geo-destaque); }
    .ponto.selecionado { outline: 3px solid var(--geo-destaque); outline-offset: 3px; z-index: 1; }
    .pendencia { position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; border-radius: 50%; background: var(--geo-erro); border: 2px solid var(--geo-papel); }
    .estado { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: var(--geo-e4); text-align: center;
      font: var(--geo-t-apoio); color: var(--geo-texto-2); background: var(--geo-superficie); }
    .legenda { display: flex; flex-wrap: wrap; gap: var(--geo-e2) var(--geo-e4); justify-content: center; list-style: none; padding: var(--geo-e2) var(--geo-margem) 0; margin: 0;
      font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .legenda li { display: inline-flex; align-items: center; gap: var(--geo-e2); }
    .legenda i { width: 12px; height: 12px; border-radius: 50%; background: var(--geo-superficie-2); border: 1px solid var(--geo-borda-campo); }
    .legenda i[data-situacao='PARCIAL'] { background: var(--geo-atencao); border-color: transparent; }
    .legenda i[data-situacao='FEITO'] { background: var(--geo-ok); border-color: transparent; }
    .legenda i.foto { width: 10px; height: 10px; background: var(--geo-erro); border-color: transparent; }
    .legenda i.prox { background: var(--geo-superficie); border: 3px solid var(--geo-destaque); }
  `],
})
export class ProjetoPdfComponent implements OnDestroy {
  readonly arquivo = input<Blob | null>(null);
  readonly marcadores = input<MarcadorPonto[]>([]);
  readonly selecionado = input<string | null>(null);
  /** O ponto "próximo" da equipe, destacado no desenho. */
  readonly proximo = input<string | null>(null);
  /** Obra e progresso, mostrados na barra da tela cheia. */
  readonly titulo = input<string | null>(null);
  readonly escolhido = output<string>();

  readonly niveis = NIVEIS;
  readonly pagina = signal(1);
  readonly paginas = signal(1);
  readonly nivel = signal(0);
  readonly zoom = computed(() => NIVEIS[this.nivel()]);
  readonly zoomTexto = computed(() => `${Math.round(this.zoom() * 100)}%`);
  readonly tamanhoMarcador = computed(() => (this.zoom() >= 2 ? 40 : this.zoom() >= 1.5 ? 32 : 26));
  readonly telaCheia = signal(false);
  readonly estado = signal<'carregando' | 'pronto' | 'sem' | 'erro'>('carregando');
  readonly marcadoresDaPagina = signal<MarcadorPonto[]>([]);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly folha = viewChild.required<ElementRef<HTMLDivElement>>('folha');
  private readonly janela = viewChild.required<ElementRef<HTMLDivElement>>('janela');
  private doc: DocumentoPdf | null = null;
  private redesenho: ReturnType<typeof setTimeout> | null = null;
  /** Dedos na tela, para a pinça. */
  private readonly toques = new Map<number, { x: number; y: number }>();
  private distanciaInicial = 0;
  private nivelInicial = 0;

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
      // O ponto escolhido fora do projeto (na lista) leva à página dele e vem para o centro.
      const id = this.selecionado();
      const m = untracked(() => this.marcadores().find(x => x.id === id));
      if (!m) return;
      if (m.pagina && m.pagina !== untracked(() => this.pagina())) untracked(() => this.irPara(m.pagina));
      untracked(() => setTimeout(() => this.centralizar(m.id), 60));
    });
    effect(() => {
      this.zoom();
      this.telaCheia();
      untracked(() => this.agendarDesenho());
    });
  }

  mudar(delta: number): void {
    this.irPara(this.pagina() + delta);
  }

  aproximar(delta: number): void {
    this.mudarNivel(this.nivel() + delta);
  }

  /**
   * Tela cheia com uma entrada no histórico: o voltar do Android e o gesto de voltar do iPhone fecham a tela cheia em
   * vez de sair da execução. Abre ajustada à tela e com o ponto escolhido (ou o próximo) no centro.
   */
  alternarTelaCheia(): void {
    if (this.telaCheia()) {
      this.fecharTelaCheia();
      return;
    }
    this.telaCheia.set(true);
    this.nivel.set(0);
    history.pushState({ projetoCheio: true }, '');
    window.addEventListener('popstate', this.aoVoltar);
    const alvo = this.selecionado() ?? this.proximo();
    if (alvo) setTimeout(() => this.centralizar(alvo), 300);
  }

  fecharTelaCheia(): void {
    if (!this.telaCheia()) return;
    window.removeEventListener('popstate', this.aoVoltar);
    this.telaCheia.set(false);
    if ((history.state as { projetoCheio?: boolean } | null)?.projetoCheio) history.back();
  }

  private readonly aoVoltar = (): void => {
    window.removeEventListener('popstate', this.aoVoltar);
    this.telaCheia.set(false);
  };

  rotulo(s: SituacaoPonto): string {
    return s === 'FEITO' ? 'feito' : s === 'PARCIAL' ? 'parcial' : 'a fazer';
  }

  tocar(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.toques.size === 2) {
      this.distanciaInicial = this.distancia();
      this.nivelInicial = this.nivel();
    }
  }

  mover(e: PointerEvent): void {
    if (!this.toques.has(e.pointerId)) return;
    this.toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.toques.size !== 2 || !this.distanciaInicial) return;
    const fator = this.distancia() / this.distanciaInicial;
    const alvo = NIVEIS[this.nivelInicial] * fator;
    const mais = NIVEIS.reduce((melhor, n, i) => (Math.abs(n - alvo) < Math.abs(NIVEIS[melhor] - alvo) ? i : melhor), 0);
    if (mais !== this.nivel()) this.mudarNivel(mais);
  }

  soltar(e: PointerEvent): void {
    this.toques.delete(e.pointerId);
    if (this.toques.size < 2) this.distanciaInicial = 0;
  }

  ngOnDestroy(): void {
    window.removeEventListener('popstate', this.aoVoltar);
    if (this.redesenho) clearTimeout(this.redesenho);
    this.doc?.fechar();
  }

  private distancia(): number {
    const [a, b] = [...this.toques.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Muda o nível mantendo o centro da vista no mesmo lugar da prancha. */
  private mudarNivel(novo: number): void {
    const n = Math.max(0, Math.min(NIVEIS.length - 1, novo));
    if (n === this.nivel()) return;
    const j = this.janela().nativeElement;
    const largura = j.scrollWidth || 1;
    const altura = j.scrollHeight || 1;
    const cx = (j.scrollLeft + j.clientWidth / 2) / largura;
    const cy = (j.scrollTop + j.clientHeight / 2) / altura;
    this.nivel.set(n);
    requestAnimationFrame(() => {
      j.scrollLeft = cx * j.scrollWidth - j.clientWidth / 2;
      j.scrollTop = cy * j.scrollHeight - j.clientHeight / 2;
    });
  }

  private centralizar(id: string): void {
    const botao = this.folha().nativeElement.querySelector<HTMLElement>(`[data-ponto="${id}"]`);
    const j = this.janela().nativeElement;
    if (!botao) return;
    const caixa = botao.getBoundingClientRect();
    const vista = j.getBoundingClientRect();
    j.scrollBy({ left: caixa.left + caixa.width / 2 - (vista.left + vista.width / 2), top: caixa.top + caixa.height / 2 - (vista.top + vista.height / 2),
      behavior: 'smooth' });
  }

  private irPara(pagina: number): void {
    this.pagina.set(Math.max(1, Math.min(this.paginas(), pagina)));
    void this.desenhar();
  }

  private agendarDesenho(): void {
    if (this.redesenho) clearTimeout(this.redesenho);
    this.redesenho = setTimeout(() => void this.desenhar(), 120);
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
      const largura = (this.janela().nativeElement.clientWidth || 600) * this.zoom();
      await this.doc.desenhar(this.pagina(), this.canvas().nativeElement, largura);
      this.estado.set('pronto');
    } catch (e) {
      if (!desenhoCancelado(e)) this.estado.set('erro');
    }
  }
}
