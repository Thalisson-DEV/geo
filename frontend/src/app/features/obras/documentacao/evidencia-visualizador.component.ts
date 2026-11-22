import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoConfirmationService,
  GeoDialogShellComponent,
  GeoIconButtonComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { take } from 'rxjs';
import { EtapaEvidencia, EvidenciaPonto } from '../../../core/models/obras-documentacao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { InconformidadeFoto } from '../../../core/models/obras-revisao-fotos.models';
import { ObrasDocumentacaoService } from '../../../core/services/obras-documentacao.service';
import { ObrasRevisaoFotosService } from '../../../core/services/obras-revisao-fotos.service';
import { ObrasService } from '../../../core/services/obras.service';
import { ETAPAS, formatarBytes, formatarCoordenadas, linkDoMapa, rotuloEtapa } from '../book/book.logic';

const OPCOES_ETAPA: GeoSelectOption<EtapaEvidencia | 'SEM'>[] = [
  ...ETAPAS.map((e) => ({ label: e.label, value: e.value as EtapaEvidencia | 'SEM' })),
  { label: 'Sem etapa', value: 'SEM' }
];

/**
 * Foto do book em tamanho real, com os metadados (quando foi tirada e lançada, por quem, onde, item e etapa), a legenda
 * e a navegação entre as fotos. A lista pode ser de um ponto ou de um recorte da galeria; o título de cada foto diz o ponto.
 */
@Component({
  selector: 'app-evidencia-visualizador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoDialogShellComponent, GeoIconButtonComponent, GeoSelectComponent, GeoStatusComponent, GeoTextInputComponent, GeoTextareaComponent],
  host: {
    '(document:keydown.arrowleft)': 'teclaNavegar($event, -1)',
    '(document:keydown.arrowright)': 'teclaNavegar($event, 1)'
  },
  template: `
    <geo-dialog-shell [visible]="!!atual()" (visibleChange)="$event || fechar.emit()" [title]="titulo()" size="xl">
      @if (atual(); as e) {
        <div class="ev">
          <div #palco class="ev-palco">
            <div class="ev-foto">
              @if (url(); as src) {
                <img [src]="src" [alt]="descricao()" (click)="emTelaCheia() || telaCheia()" />
              } @else if (erro()) {
                <geo-async-state state="error" [compact]="true" title="Não foi possível abrir a foto" [description]="erro()!" actionLabel="Tentar de novo" (action)="carregar()"></geo-async-state>
              } @else {
                <geo-async-state state="loading" [compact]="true" title="Abrindo a foto"></geo-async-state>
              }
            </div>
            <div class="ev-nav">
              <geo-icon-button icon="pi pi-chevron-left" label="Foto anterior" size="icon-sm" [disabled]="posicao() === 0" (pressed)="navegar.emit(posicao() - 1)"></geo-icon-button>
              <span aria-live="polite">Foto {{ posicao() + 1 }} de {{ evidencias().length }}</span>
              <geo-icon-button icon="pi pi-chevron-right" label="Próxima foto" size="icon-sm" [disabled]="posicao() === evidencias().length - 1" (pressed)="navegar.emit(posicao() + 1)"></geo-icon-button>
              @if (emTelaCheia() && podeRevisar() && e.revisao && e.revisao !== 'APROVADA') {
                <geo-button size="sm" icon="pi pi-check" label="Aprovar" [loading]="revisando()" (pressed)="aprovar(e)"></geo-button>
              }
              <geo-icon-button class="ev-nav__tela" [icon]="emTelaCheia() ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
                [label]="emTelaCheia() ? 'Sair da tela cheia' : 'Ver em tela cheia'" size="icon-sm" (pressed)="telaCheia()"></geo-icon-button>
            </div>
          </div>

          <aside class="ev-dados" aria-label="Dados da foto">
            <div class="ev-selos">
              <geo-status tone="brand" emphasis="outline" icon="pi-camera">{{ e.tituloItem ?? 'Outras evidências' }}</geo-status>
              <geo-status [tone]="e.etapa ? 'info' : 'neutral'" [emphasis]="e.etapa ? 'soft' : 'outline'" icon="pi-clock">{{ rotuloEtapa(e.etapa) }}</geo-status>
            </div>
            @if (e.revisao; as r) {
              <section class="ev-revisao" aria-label="Revisão da foto">
                <div class="ev-revisao__topo">
                  <span class="ev-revisao__rotulo">Revisão</span>
                  <geo-status [tone]="r === 'APROVADA' ? 'success' : r === 'REPROVADA' ? 'danger' : 'warning'">{{ rotuloRevisao(r) }}</geo-status>
                </div>
                @if (e.rotuloInconformidade) { <p class="ev-revisao__motivo">{{ e.rotuloInconformidade }}{{ e.motivoReprovacao ? ': ' + e.motivoReprovacao : '' }}</p> }
                @if (e.revisadaPor) { <p class="ev-revisao__quem">por {{ e.revisadaPor }}@if (e.revisadaEm) { em {{ e.revisadaEm | date: 'dd/MM/yyyy HH:mm' }} }</p> }
                @if (podeRevisar()) {
                  @if (reprovando()) {
                    <geo-select label="Inconformidade" [required]="true" [options]="opcoesInconformidade()" [(value)]="inconformidade"
                      [error]="tentou() && !inconformidade() ? 'Escolha a inconformidade.' : undefined"></geo-select>
                    <geo-textarea label="Motivo" [rows]="2" [maxlength]="500" [(value)]="motivo" [showOptional]="inconformidade() !== 'OUTRA'"
                      [required]="inconformidade() === 'OUTRA'" [error]="tentou() && inconformidade() === 'OUTRA' && !motivo().trim() ? 'Descreva o motivo.' : undefined"></geo-textarea>
                    <div class="ev-revisao__acoes">
                      <geo-button variant="ghost" size="sm" label="Voltar" (pressed)="reprovando.set(false)"></geo-button>
                      <geo-button variant="destructive" size="sm" icon="pi pi-times" label="Reprovar foto" [loading]="revisando()" (pressed)="reprovar(e)"></geo-button>
                    </div>
                  } @else {
                    <div class="ev-revisao__acoes">
                      <geo-button variant="ghost" size="sm" icon="pi pi-times" [label]="r === 'APROVADA' ? 'Reprovar mesmo assim' : 'Reprovar'" (pressed)="abrirReprovacao()"></geo-button>
                      @if (r !== 'APROVADA') {
                        <geo-button size="sm" icon="pi pi-check" label="Aprovar" [loading]="revisando()" (pressed)="aprovar(e)"></geo-button>
                      }
                    </div>
                  }
                }
              </section>
            }
            <dl class="ev-lista">
              <div>
                <dt>Tirada em</dt>
                <dd>@if (e.dataCaptura) { {{ e.dataCaptura | date: 'dd/MM/yyyy HH:mm' }} } @else { <span class="ev-sem">Não informada pelo app</span> }</dd>
              </div>
              <div>
                <dt>Lançada em</dt>
                <dd>{{ e.data | date: 'dd/MM/yyyy HH:mm' }}@if (e.usuario) { · {{ e.usuario }} }</dd>
              </div>
              <div>
                <dt>Coordenadas</dt>
                <dd>
                  @if (coordenadas(); as c) {
                    <a class="ev-mapa" [href]="mapa()!" target="_blank" rel="noopener noreferrer">{{ c }} <i class="pi pi-external-link" aria-hidden="true"></i><span class="geo-sr-only"> (abre o mapa em nova aba)</span></a>
                  } @else {
                    <span class="ev-sem">Sem GPS nesta foto</span>
                  }
                </dd>
              </div>
              <div>
                <dt>Arquivo</dt>
                <dd class="ev-arquivo">{{ e.nomeArquivo }} · {{ tamanho() }}</dd>
              </div>
            </dl>

            @if (podeEscrever()) {
              <geo-select label="Etapa" [options]="opcoesEtapa" [value]="e.etapa ?? 'SEM'" [disabled]="salvandoEtapa()" (valueChange)="classificar(e, $event)"></geo-select>
              <div class="ev-legenda">
                <geo-text-input class="ev-legenda__campo" label="Legenda" [maxlength]="500" [(value)]="legenda"></geo-text-input>
                <geo-button variant="outline" size="sm" label="Salvar legenda" [disabled]="legenda().trim() === (e.legenda ?? '')" [loading]="salvando()" (pressed)="salvarLegenda(e)"></geo-button>
              </div>
            } @else {
              <div class="ev-legenda-leitura">
                <span>Legenda</span>
                <p>{{ e.legenda || 'Sem legenda' }}</p>
              </div>
            }
          </aside>
        </div>
      }
      <div dialog-footer class="geo-actions-row">
        @if (podeEscrever() && atual(); as e) {
          <geo-button variant="ghost" icon="pi pi-trash" label="Remover foto" (pressed)="remover(e)"></geo-button>
        }
        <geo-button variant="outline" icon="pi pi-download" label="Baixar original" [disabled]="!blob()" (pressed)="baixar()"></geo-button>
        <geo-button label="Fechar" (pressed)="fechar.emit()"></geo-button>
      </div>
    </geo-dialog-shell>
  `,
  styles: `
    .ev { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
    @media (min-width: 900px) { .ev { grid-template-columns: minmax(0, 1fr) 18rem; } }
    .ev-palco { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
    .ev-foto { display: grid; place-items: center; min-height: 16rem; overflow: hidden; border-radius: var(--geo-radius-md); background: var(--geo-surface-muted); }
    .ev-foto img { display: block; max-width: 100%; max-height: 64vh; object-fit: contain; cursor: zoom-in; }
    .ev-nav__tela { margin-left: auto; }
    /* Tela cheia: só a foto e a barra de navegação. */
    .ev-palco:fullscreen { justify-content: center; padding: 1rem; background: var(--geo-surface-raised); }
    .ev-palco:fullscreen .ev-foto { flex: 1; min-height: 0; border-radius: 0; }
    .ev-palco:fullscreen .ev-foto img { max-height: calc(100vh - 5rem); cursor: default; }
    .ev-revisao { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.625rem 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); }
    .ev-revisao__topo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .ev-revisao__rotulo { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-weight: 600; }
    .ev-revisao__motivo, .ev-revisao__quem { margin: 0; font-size: var(--geo-font-caption); overflow-wrap: anywhere; }
    .ev-revisao__quem { color: var(--geo-foreground-muted); }
    .ev-revisao__acoes { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.375rem; }
    .ev-nav { display: flex; align-items: center; justify-content: center; gap: 0.75rem; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-variant-numeric: tabular-nums; }
    .ev-dados { display: flex; flex-direction: column; gap: 0.875rem; min-width: 0; }
    .ev-selos { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .ev-lista { display: flex; flex-direction: column; gap: 0.625rem; margin: 0; }
    .ev-lista div { display: flex; flex-direction: column; gap: 0.125rem; }
    .ev-lista dt { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-weight: 600; }
    .ev-lista dd { margin: 0; color: var(--geo-foreground); font-size: var(--geo-font-caption); overflow-wrap: anywhere; }
    .ev-sem { color: var(--geo-foreground-subtle); }
    .ev-arquivo { font-size: var(--geo-font-caption); }
    .ev-mapa { color: var(--geo-brand); font-variant-numeric: tabular-nums; text-decoration: none; }
    .ev-mapa:hover { text-decoration: underline; }
    .ev-mapa:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; border-radius: var(--geo-radius-sm); }
    .ev-mapa i { font-size: var(--geo-font-caption); }
    .ev-legenda { display: flex; flex-direction: column; align-items: stretch; gap: 0.5rem; }
    .ev-legenda__campo { min-width: 0; }
    .ev-legenda-leitura span { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-weight: 600; }
    .ev-legenda-leitura p { margin: 0.125rem 0 0; color: var(--geo-foreground); font-size: var(--geo-font-caption); overflow-wrap: anywhere; }
  `
})
export class EvidenciaVisualizadorComponent {
  private readonly servico = inject(ObrasDocumentacaoService);
  private readonly obras = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly revisao = inject(ObrasRevisaoFotosService);
  private readonly palco = viewChild<ElementRef<HTMLElement>>('palco');

  readonly idObra = input.required<string>();
  /** Título fixo (ex.: "Ponto 12"); sem ele, use {@link titulos}. */
  readonly tituloPonto = input('');
  /** Título por foto, quando a lista mistura pontos (galeria). */
  readonly titulos = input<string[] | null>(null);
  readonly evidencias = input<EvidenciaPonto[]>([]);
  readonly indice = input<number>(0);
  readonly aberto = input(false);
  readonly podeEscrever = input(false);
  /** Aprovar ou reprovar a foto ali mesmo (permissão de documentação). */
  readonly podeRevisar = input(false);
  readonly navegar = output<number>();
  readonly fechar = output<void>();
  readonly alterado = output<void>();

  protected readonly opcoesEtapa = OPCOES_ETAPA;
  protected readonly rotuloEtapa = rotuloEtapa;

  /** Depois de remover a última foto da lista, fica na anterior. */
  protected readonly posicao = computed(() => Math.min(this.indice(), this.evidencias().length - 1));
  protected readonly atual = computed(() => (this.aberto() ? (this.evidencias()[this.posicao()] ?? null) : null));
  private readonly idAtual = computed(() => this.atual()?.id ?? null);
  protected readonly titulo = computed(() => {
    const e = this.atual();
    if (!e) return '';
    const doPonto = this.titulos()?.[this.posicao()] ?? this.tituloPonto();
    return `${doPonto} · ${e.tituloItem ?? 'Outras evidências'}`;
  });
  protected readonly descricao = computed(() => {
    const e = this.atual();
    return e?.legenda ? `${e.tituloItem ?? 'Outras evidências'}, ${e.legenda}` : (e?.tituloItem ?? 'Outras evidências');
  });
  protected readonly coordenadas = computed(() => {
    const e = this.atual();
    return e ? formatarCoordenadas(e.latitude, e.longitude) : null;
  });
  protected readonly mapa = computed(() => {
    const e = this.atual();
    return e && e.latitude != null && e.longitude != null ? linkDoMapa(e.latitude, e.longitude) : null;
  });
  protected readonly tamanho = computed(() => formatarBytes(this.atual()?.tamanhoBytes));

  protected readonly url = signal<string | null>(null);
  protected readonly blob = signal<Blob | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly legenda = signal('');
  protected readonly salvando = signal(false);
  protected readonly salvandoEtapa = signal(false);
  protected readonly emTelaCheia = signal(false);
  protected readonly reprovando = signal(false);
  protected readonly revisando = signal(false);
  protected readonly tentou = signal(false);
  protected readonly inconformidade = signal<InconformidadeFoto | null>(null);
  protected readonly motivo = signal('');
  protected readonly opcoesInconformidade = signal<GeoSelectOption<InconformidadeFoto>[]>([]);

  constructor() {
    const aoTrocarTelaCheia = () => this.emTelaCheia.set(!!document.fullscreenElement && document.fullscreenElement === this.palco()?.nativeElement);
    document.addEventListener('fullscreenchange', aoTrocarTelaCheia);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('fullscreenchange', aoTrocarTelaCheia));
    effect(() => {
      if (!this.podeRevisar() || this.opcoesInconformidade().length) return;
      untracked(() => this.revisao.inconformidades().pipe(take(1)).subscribe({
        next: (lista) => this.opcoesInconformidade.set(lista.map((o) => ({ label: o.rotulo, value: o.valor })))
      }));
    });
    effect((onCleanup) => {
      const id = this.idAtual();
      untracked(() => {
        this.reprovando.set(false);
        this.tentou.set(false);
        this.legenda.set(this.atual()?.legenda ?? '');
        if (id) this.carregar();
      });
      onCleanup(() => this.limpar());
    });
  }

  protected carregar(): void {
    const id = this.idAtual();
    if (!id) return;
    this.erro.set(null);
    this.servico.baixarFoto(this.idObra(), id).pipe(take(1)).subscribe({
      next: (blob) => {
        // A pessoa pode ter passado para outra foto enquanto esta vinha.
        if (this.idAtual() !== id) return;
        this.limpar();
        this.blob.set(blob);
        this.url.set(URL.createObjectURL(blob));
      },
      error: (e) => {
        if (this.idAtual() === id) this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected rotuloRevisao(r: 'PENDENTE' | 'APROVADA' | 'REPROVADA'): string {
    return r === 'APROVADA' ? 'Aprovada' : r === 'REPROVADA' ? 'Reprovada' : 'Para revisar';
  }

  protected async telaCheia(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    await this.palco()?.nativeElement.requestFullscreen?.().catch(() => undefined);
  }

  protected abrirReprovacao(): void {
    this.inconformidade.set(null);
    this.motivo.set('');
    this.tentou.set(false);
    this.reprovando.set(true);
  }

  protected aprovar(evidencia: EvidenciaPonto): void {
    this.decidir(evidencia, { aprovar: true }, 'Foto aprovada.');
  }

  protected reprovar(evidencia: EvidenciaPonto): void {
    this.tentou.set(true);
    const inconformidade = this.inconformidade();
    if (!inconformidade || (inconformidade === 'OUTRA' && !this.motivo().trim())) return;
    this.decidir(evidencia, { aprovar: false, inconformidade, motivo: this.motivo().trim() || null }, 'Foto reprovada: a equipe vê o motivo no app.');
  }

  private decidir(evidencia: EvidenciaPonto, decisao: { aprovar: boolean; inconformidade?: InconformidadeFoto | null; motivo?: string | null }, mensagem: string): void {
    this.revisando.set(true);
    this.revisao.revisar(evidencia.id, decisao).pipe(take(1)).subscribe({
      next: () => {
        this.revisando.set(false);
        this.reprovando.set(false);
        this.notificacoes.success(mensagem);
        this.alterado.emit();
      },
      error: (e) => {
        this.revisando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected teclaNavegar(evento: Event, direcao: number): void {
    const alvo = evento.target as HTMLElement | null;
    if (!this.atual() || alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA') return;
    const destino = this.posicao() + direcao;
    if (destino >= 0 && destino < this.evidencias().length) this.navegar.emit(destino);
  }

  protected classificar(evidencia: EvidenciaPonto, valor: string | null): void {
    const etapa = !valor || valor === 'SEM' ? null : (valor as EtapaEvidencia);
    if (etapa === evidencia.etapa) return;
    this.salvandoEtapa.set(true);
    this.servico.classificarEtapa(this.idObra(), evidencia.id, etapa).pipe(take(1)).subscribe({
      next: () => {
        this.salvandoEtapa.set(false);
        this.notificacoes.success(etapa ? `Foto marcada como "${rotuloEtapa(etapa).toLowerCase()}".` : 'Etapa retirada da foto.');
        this.alterado.emit();
      },
      error: (e) => {
        this.salvandoEtapa.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected salvarLegenda(evidencia: EvidenciaPonto): void {
    this.salvando.set(true);
    this.servico.alterarLegenda(this.idObra(), evidencia.id, this.legenda().trim() || null).pipe(take(1)).subscribe({
      next: () => {
        this.salvando.set(false);
        this.notificacoes.success('Legenda salva.');
        this.alterado.emit();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async remover(evidencia: EvidenciaPonto): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: 'Remover esta foto?',
      message: 'Ela sai do book e das próximas versões do As Built e do Book. As versões já geradas continuam como estão.',
      confirmLabel: 'Remover'
    });
    if (!ok) return;
    this.servico.removerEvidencia(this.idObra(), evidencia.id).pipe(take(1)).subscribe({
      next: () => {
        this.notificacoes.success('Foto removida.');
        this.alterado.emit();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected baixar(): void {
    const blob = this.blob();
    const e = this.atual();
    if (blob && e) this.obras.baixarArquivoBlob(blob, e.nomeArquivo);
  }

  private limpar(): void {
    const atual = this.url();
    if (atual) URL.revokeObjectURL(atual);
    this.url.set(null);
    this.blob.set(null);
  }
}
