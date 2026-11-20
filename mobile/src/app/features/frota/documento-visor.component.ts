import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, untracked, viewChildren
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { formatarPlaca } from '../../core/frota/checklist-veiculo.models';
import { DocumentosVeiculoService } from '../../core/frota/documentos-veiculo.service';
import { DocumentoComArquivo, formatoArquivo, nomeDocumento, situacaoVencimento, temArquivo } from '../../core/frota/situacao-veiculo.models';
import { SituacaoVeiculoService } from '../../core/frota/situacao-veiculo.service';
import { DocumentoPdf, abrirPdf, desenhoCancelado } from '../../core/frota/visor-pdf';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { BarraTopoComponent, IconeComponent, VazioComponent } from '../../ui';

type Estado = 'carregando' | 'pronto' | 'sem-sinal' | 'nao-encontrado' | 'erro' | 'formato';

/**
 * Um documento do veículo aberto dentro do app (PDF ou foto), sem sair para outra guia: é o que a
 * pessoa mostra ao fiscal. Abre do aparelho quando já foi salvo; senão baixa (com sinal) e guarda.
 */
@Component({
  selector: 'app-documento-visor',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="titulo()" [subtitulo]="subtitulo()" (voltar)="voltar()">
      @if (estado() === 'pronto' && formato() !== 'outro') {
        <button type="button" class="geo-btn-icone" (click)="ampliado.set(!ampliado())" [attr.aria-pressed]="ampliado()"
          [attr.aria-label]="ampliado() ? 'Ajustar à tela' : 'Ampliar'">
          <geo-icone [nome]="ampliado() ? 'recolher' : 'expandir'" />
        </button>
      }
    </geo-barra-topo>

    @switch (estado()) {
      @case ('carregando') {
        <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Abrindo o documento">
          <div class="geo-esqueleto" style="height: 70vh"></div>
        </div>
      }
      @case ('sem-sinal') {
        <geo-vazio icone="nuvem" titulo="Documento ainda não está no aparelho" texto="Conecte à internet uma vez para baixar. Depois ele abre mesmo sem sinal." />
      }
      @case ('nao-encontrado') {
        <geo-vazio icone="documento" titulo="Documento não encontrado" texto="Ele pode ter sido trocado ou removido pelo gestor da frota. Volte e atualize a lista." />
      }
      @case ('formato') {
        <geo-vazio icone="documento" titulo="Este arquivo não abre no app" texto="O app mostra PDF e foto. Peça ao gestor da frota para anexar o documento em PDF." />
      }
      @case ('erro') {
        <geo-vazio icone="alerta" titulo="Não foi possível abrir o documento" texto="Confira a internet e tente de novo.">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="abrir()">Tentar de novo</button>
        </geo-vazio>
      }
      @default {
        <div class="folha" [class.folha--ampliada]="ampliado()">
          @if (formato() === 'imagem') {
            <img [src]="urlImagem()" [alt]="titulo()" class="pagina">
          } @else {
            @for (n of paginas(); track n) {
              <canvas #pagina class="pagina" [attr.aria-label]="'Página ' + n + ' de ' + paginas().length" role="img"></canvas>
            }
          }
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; background: var(--geo-fundo); }
    .folha { padding: var(--geo-e3); display: grid; gap: var(--geo-e3); justify-items: center; overflow-x: auto; }
    .folha--ampliada { justify-items: start; }
    .pagina { display: block; width: 100%; height: auto; background: #fff; border-radius: 4px; box-shadow: var(--geo-sombra-flutuante); }
    .folha--ampliada .pagina { width: 200%; max-width: none; }
    canvas.pagina { width: auto; }
  `],
})
export class DocumentoVisorComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly documentos = inject(DocumentosVeiculoService);
  private readonly situacao = inject(SituacaoVeiculoService);
  private readonly rede = inject(ConnectivityService);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly idVeiculo = this.rota.snapshot.queryParamMap.get('veiculo');
  private readonly idDocumento = this.rota.snapshot.paramMap.get('idDocumento');

  protected readonly estado = signal<Estado>('carregando');
  protected readonly documento = signal<DocumentoComArquivo | null>(null);
  protected readonly formato = computed(() => { const d = this.documento(); return d ? formatoArquivo(d) : 'outro'; });
  protected readonly ampliado = signal(false);
  protected readonly urlImagem = signal<string | null>(null);
  private readonly pdf = signal<DocumentoPdf | null>(null);
  protected readonly paginas = computed(() => Array.from({ length: this.pdf()?.paginas ?? 0 }, (_, i) => i + 1));
  private desenhos = 0;
  private readonly canvases = viewChildren<ElementRef<HTMLCanvasElement>>('pagina');

  protected readonly titulo = computed(() => { const d = this.documento(); return d ? nomeDocumento(d) : 'Documento'; });
  protected readonly subtitulo = computed(() => {
    const d = this.documento();
    if (!d) return null;
    const v = situacaoVencimento(d);
    return [d.doImplemento ? d.titular : formatarPlaca(d.titular), d.vencimento ? `${v.rotulo} · validade ${new Date(d.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}` : null]
      .filter(Boolean).join(' · ') || null;
  });

  constructor() {
    // Desenha as páginas quando os canvas existem e de novo ao ampliar ou reduzir.
    effect(() => {
      const pdf = this.pdf();
      const canvases = this.canvases();
      const ampliado = this.ampliado();
      if (!pdf || !canvases.length) return;
      untracked(() => void this.desenhar(pdf, canvases, ampliado));
    });
  }

  ngOnInit(): void {
    void this.abrir();
  }

  protected async abrir(): Promise<void> {
    if (!this.idVeiculo || !this.idDocumento) { this.estado.set('nao-encontrado'); return; }
    this.estado.set('carregando');
    const doc = await this.encontrar(this.idVeiculo, this.idDocumento);
    if (!doc) { this.estado.set(this.rede.isOnline() ? 'nao-encontrado' : 'sem-sinal'); return; }
    this.documento.set(doc);
    if (formatoArquivo(doc) === 'outro') { this.estado.set('formato'); return; }
    if (!this.rede.isOnline() && !(await this.documentos.noAparelho(doc))) { this.estado.set('sem-sinal'); return; }
    try {
      const blob = await this.documentos.arquivo(this.idVeiculo, doc);
      if (formatoArquivo(doc) === 'imagem') {
        this.liberarImagem();
        this.urlImagem.set(URL.createObjectURL(blob));
      } else {
        this.pdf()?.fechar();
        this.pdf.set(await abrirPdf(blob));
      }
      this.estado.set('pronto');
    } catch {
      this.estado.set(this.rede.isOnline() ? 'erro' : 'sem-sinal');
    }
  }

  /** A lista salva no aparelho; se o documento não está nela (ex.: link direto), busca com sinal. */
  private async encontrar(idVeiculo: string, id: string): Promise<DocumentoComArquivo | null> {
    const local = await this.documentos.listaLocal(idVeiculo).catch(() => null);
    let doc = local?.documentos.find((d) => d.id === id);
    if (!doc && this.rede.isOnline()) {
      const ficha = await this.situacao.situacao(idVeiculo).catch(() => null);
      doc = ficha?.documentosDoConjunto?.find((d) => d.id === id);
    }
    return doc && temArquivo(doc) ? doc : null;
  }

  private async desenhar(pdf: DocumentoPdf, canvases: readonly ElementRef<HTMLCanvasElement>[], ampliado: boolean): Promise<void> {
    const disponivel = (this.host.nativeElement as HTMLElement).clientWidth - 24;
    const largura = Math.max(280, disponivel) * (ampliado ? 2 : 1);
    const vez = ++this.desenhos;
    try {
      for (let i = 0; i < canvases.length && vez === this.desenhos; i++) {
        await pdf.desenhar(i + 1, canvases[i].nativeElement, largura);
      }
    } catch (e) {
      // Ampliar no meio do desenho cancela o anterior: só o desenho mais novo conta.
      if (!desenhoCancelado(e) && vez === this.desenhos) this.estado.set('erro');
    }
  }

  private liberarImagem(): void {
    const url = this.urlImagem();
    if (url) URL.revokeObjectURL(url);
  }

  protected voltar(): void {
    void this.router.navigate(['/frota/documentos'], { queryParams: { veiculo: this.idVeiculo, de: this.rota.snapshot.queryParamMap.get('de') } });
  }

  ngOnDestroy(): void {
    this.liberarImagem();
    this.pdf()?.fechar();
  }
}
