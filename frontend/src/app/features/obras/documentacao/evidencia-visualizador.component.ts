import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesConfirmationService,
  CesDialogShellComponent,
  CesIconButtonComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import { take } from 'rxjs';
import { EtapaEvidencia, EvidenciaPonto } from '../../../core/models/obras-documentacao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ObrasDocumentacaoService } from '../../../core/services/obras-documentacao.service';
import { ObrasService } from '../../../core/services/obras.service';
import { ETAPAS, formatarBytes, formatarCoordenadas, linkDoMapa, rotuloEtapa } from '../book/book.logic';

const OPCOES_ETAPA: CesSelectOption<EtapaEvidencia | 'SEM'>[] = [
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
  imports: [DatePipe, CesAsyncStateComponent, CesButtonComponent, CesDialogShellComponent, CesIconButtonComponent, CesSelectComponent, CesStatusComponent, CesTextInputComponent],
  host: {
    '(document:keydown.arrowleft)': 'teclaNavegar($event, -1)',
    '(document:keydown.arrowright)': 'teclaNavegar($event, 1)'
  },
  template: `
    <ces-dialog-shell [visible]="!!atual()" (visibleChange)="$event || fechar.emit()" [title]="titulo()" size="xl">
      @if (atual(); as e) {
        <div class="ev">
          <div class="ev-palco">
            <div class="ev-foto">
              @if (url(); as src) {
                <img [src]="src" [alt]="descricao()" />
              } @else if (erro()) {
                <ces-async-state state="error" [compact]="true" title="Não foi possível abrir a foto" [description]="erro()!" actionLabel="Tentar de novo" (action)="carregar()"></ces-async-state>
              } @else {
                <ces-async-state state="loading" [compact]="true" title="Abrindo a foto"></ces-async-state>
              }
            </div>
            <div class="ev-nav">
              <ces-icon-button icon="pi pi-chevron-left" label="Foto anterior" size="icon-sm" [disabled]="posicao() === 0" (pressed)="navegar.emit(posicao() - 1)"></ces-icon-button>
              <span aria-live="polite">Foto {{ posicao() + 1 }} de {{ evidencias().length }}</span>
              <ces-icon-button icon="pi pi-chevron-right" label="Próxima foto" size="icon-sm" [disabled]="posicao() === evidencias().length - 1" (pressed)="navegar.emit(posicao() + 1)"></ces-icon-button>
            </div>
          </div>

          <aside class="ev-dados" aria-label="Dados da foto">
            <div class="ev-selos">
              <ces-status tone="brand" emphasis="outline" icon="pi-camera">{{ e.tituloItem ?? 'Outras evidências' }}</ces-status>
              <ces-status [tone]="e.etapa ? 'info' : 'neutral'" [emphasis]="e.etapa ? 'soft' : 'outline'" icon="pi-clock">{{ rotuloEtapa(e.etapa) }}</ces-status>
            </div>
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
                    <a class="ev-mapa" [href]="mapa()!" target="_blank" rel="noopener noreferrer">{{ c }} <i class="pi pi-external-link" aria-hidden="true"></i><span class="ces-sr-only"> (abre o mapa em nova aba)</span></a>
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
              <ces-select label="Etapa" [options]="opcoesEtapa" [value]="e.etapa ?? 'SEM'" [disabled]="salvandoEtapa()" (valueChange)="classificar(e, $event)"></ces-select>
              <div class="ev-legenda">
                <ces-text-input class="ev-legenda__campo" label="Legenda" [maxlength]="500" [(value)]="legenda"></ces-text-input>
                <ces-button variant="outline" size="sm" label="Salvar legenda" [disabled]="legenda().trim() === (e.legenda ?? '')" [loading]="salvando()" (pressed)="salvarLegenda(e)"></ces-button>
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
      <div dialog-footer class="ces-actions-row">
        @if (podeEscrever() && atual(); as e) {
          <ces-button variant="ghost" icon="pi pi-trash" label="Remover foto" (pressed)="remover(e)"></ces-button>
        }
        <ces-button variant="outline" icon="pi pi-download" label="Baixar original" [disabled]="!blob()" (pressed)="baixar()"></ces-button>
        <ces-button label="Fechar" (pressed)="fechar.emit()"></ces-button>
      </div>
    </ces-dialog-shell>
  `,
  styles: `
    .ev { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
    @media (min-width: 900px) { .ev { grid-template-columns: minmax(0, 1fr) 18rem; } }
    .ev-palco { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
    .ev-foto { display: grid; place-items: center; min-height: 16rem; overflow: hidden; border-radius: var(--ces-radius-md); background: var(--ces-surface-muted); }
    .ev-foto img { display: block; max-width: 100%; max-height: 64vh; object-fit: contain; }
    .ev-nav { display: flex; align-items: center; justify-content: center; gap: 0.75rem; color: var(--ces-foreground-muted); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
    .ev-dados { display: flex; flex-direction: column; gap: 0.875rem; min-width: 0; }
    .ev-selos { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .ev-lista { display: flex; flex-direction: column; gap: 0.625rem; margin: 0; }
    .ev-lista div { display: flex; flex-direction: column; gap: 0.125rem; }
    .ev-lista dt { color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); font-weight: 600; }
    .ev-lista dd { margin: 0; color: var(--ces-foreground); font-size: 0.875rem; overflow-wrap: anywhere; }
    .ev-sem { color: var(--ces-foreground-subtle); }
    .ev-arquivo { font-size: 0.8125rem; }
    .ev-mapa { color: var(--ces-brand); font-variant-numeric: tabular-nums; text-decoration: none; }
    .ev-mapa:hover { text-decoration: underline; }
    .ev-mapa:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 2px; border-radius: var(--ces-radius-sm); }
    .ev-mapa i { font-size: 0.6875rem; }
    .ev-legenda { display: flex; flex-direction: column; align-items: stretch; gap: 0.5rem; }
    .ev-legenda__campo { min-width: 0; }
    .ev-legenda-leitura span { color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); font-weight: 600; }
    .ev-legenda-leitura p { margin: 0.125rem 0 0; color: var(--ces-foreground); font-size: 0.875rem; overflow-wrap: anywhere; }
  `
})
export class EvidenciaVisualizadorComponent {
  private readonly servico = inject(ObrasDocumentacaoService);
  private readonly obras = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);

  readonly idObra = input.required<string>();
  /** Título fixo (ex.: "Ponto 12"); sem ele, use {@link titulos}. */
  readonly tituloPonto = input('');
  /** Título por foto, quando a lista mistura pontos (galeria). */
  readonly titulos = input<string[] | null>(null);
  readonly evidencias = input<EvidenciaPonto[]>([]);
  readonly indice = input<number>(0);
  readonly aberto = input(false);
  readonly podeEscrever = input(false);
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

  constructor() {
    effect((onCleanup) => {
      const id = this.idAtual();
      untracked(() => {
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
