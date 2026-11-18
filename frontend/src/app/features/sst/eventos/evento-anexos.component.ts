import { CommonModule, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { GeoButtonComponent, GeoConfirmationService, GeoStatusComponent, GeoTone, NotificationService } from '@geo/ui';

import { getErrorMessage } from '../../../core/models/shared.models';
import {
  AnexoEventoResponse,
  CONTEXTO_ANEXO_EVENTO_LABELS,
  ContextoAnexoEvento
} from '../../../core/models/sst-evento.models';
import { SstService } from '../../../core/services/sst.service';

interface OrigemAnexo {
  contexto: ContextoAnexoEvento;
  rotulo: string;
  icone: string;
  tom: GeoTone;
  /** O que se espera em cada origem, para o botão de anexar e o estado vazio. */
  dica: string;
  acao: string;
}

const ORIGENS: OrigemAnexo[] = [
  { contexto: 'EVENTO', rotulo: 'Ocorrência', icone: 'pi-camera', tom: 'danger', dica: 'Fotos do local, boletim de ocorrência, croqui', acao: 'Foto da ocorrência' },
  { contexto: 'CAT', rotulo: 'CAT', icone: 'pi-file-check', tom: 'info', dica: 'Comunicação de Acidente de Trabalho emitida', acao: 'Documento da CAT' },
  { contexto: 'TRATATIVA', rotulo: 'Tratativa', icone: 'pi-wrench', tom: 'success', dica: 'Comprovação das medidas adotadas', acao: 'Evidência da tratativa' }
];

/**
 * Seção **Fotos & Evidências** do relatório do evento, no mesmo desenho da galeria das
 * inspeções: um cartão por arquivo, marcado com a origem (ocorrência, CAT ou tratativa).
 * Entra na impressão, porque a foto dá valor probatório ao relatório.
 *
 * O envio é **pós-registro**: o acidente é registrado da base, depois do fato. Evento
 * concluído ou cancelado não aceita anexo nem remoção; a tela desabilita antes do 422.
 *
 * Os arquivos não têm URL pública: cada um é buscado com o JWT e exibido por ObjectURL,
 * revogado ao destruir o componente.
 */
@Component({
  selector: 'app-evento-anexos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DatePipe, DialogModule, TooltipModule, GeoButtonComponent, GeoStatusComponent],
  template: `
    <div class="mb-8 print:mb-3">
      <div class="flex items-center justify-between gap-3 mb-3 print:mb-2 flex-wrap">
        <div class="flex items-center gap-2 border-l-2 border-primary-500 pl-3">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 print:text-black">Fotos &amp; Evidências</span>
          @if (!carregando()) {
            <span class="text-[11px] text-slate-500 dark:text-slate-400 print:text-slate-600 font-medium">({{ lista().length }})</span>
          }
        </div>
        @if (canWrite()) {
          <div class="flex items-center gap-2 flex-wrap print:hidden">
            @for (o of origens; track o.contexto) {
              <geo-button variant="outline" size="sm" [icon]="'pi ' + o.icone" [label]="o.acao"
                [loading]="enviando() === o.contexto" [disabled]="!!enviando()" (pressed)="escolherArquivo(o.contexto)"></geo-button>
            }
          </div>
        }
      </div>

      @if (carregando()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 print:hidden">
          @for (i of [1, 2, 3]; track i) { <div class="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 animate-pulse"></div> }
        </div>
      } @else if (!lista().length) {
        <div class="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3">
          <i class="pi pi-info-circle text-slate-400 dark:text-slate-500 text-xs"></i>
          <span class="text-[11px] text-slate-500 dark:text-slate-400">
            Nenhuma foto ou documento anexado ao evento.{{ canWrite() ? ' Anexe fotos do local, o boletim de ocorrência, a CAT e as evidências das medidas adotadas.' : '' }}
          </span>
        </div>
      } @else {
        <!-- Contagem por origem; na tela também filtra a galeria. -->
        <div class="flex items-center gap-2 flex-wrap mb-3 print:mb-2" role="group" aria-label="Filtrar evidências por origem">
          <button type="button" class="filtro" [class.filtro--ativo]="filtro() === null" [attr.aria-pressed]="filtro() === null" (click)="filtro.set(null)">
            Todas <strong>{{ lista().length }}</strong>
          </button>
          @for (o of origens; track o.contexto) {
            <button type="button" class="filtro" [class.filtro--ativo]="filtro() === o.contexto" [attr.aria-pressed]="filtro() === o.contexto"
              [disabled]="!contagem()[o.contexto]" (click)="filtro.set(o.contexto)">
              <i class="pi" [class]="'pi ' + o.icone" aria-hidden="true"></i> {{ o.rotulo }} <strong>{{ contagem()[o.contexto] }}</strong>
            </button>
          }
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 print:grid-cols-3">
          @for (anexo of visiveis(); track anexo.id) {
            @let o = origem(anexo.contexto);
            <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col break-inside-avoid print:border-slate-300 print:shadow-none">
              @if (anexo.tipo === 'FOTO' && renderizavel(anexo)) {
                <button type="button" (click)="ampliar(anexo)" class="relative h-44 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-zoom-in group print:cursor-default"
                  [attr.aria-label]="'Ampliar ' + anexo.nomeArquivo">
                  @if (thumbs()[anexo.id]; as url) {
                    <img [src]="url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 print:scale-100" [alt]="anexo.nomeArquivo" />
                    <span class="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center print:hidden">
                      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--geo-surface)] text-[var(--geo-foreground)] text-xs font-semibold shadow">
                        <i class="pi pi-search-plus"></i> Ampliar
                      </span>
                    </span>
                  } @else {
                    <span class="w-full h-full flex flex-col items-center justify-center gap-2">
                      <i class="pi pi-spin pi-spinner text-slate-400 text-xl"></i>
                      <span class="text-[10px] text-slate-400 font-medium">Carregando imagem...</span>
                    </span>
                  }
                </button>
              } @else {
                <div class="h-44 w-full bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center gap-2.5 px-3 text-center">
                  <div class="w-14 h-14 rounded-xl flex items-center justify-center border border-[var(--geo-border)] bg-[var(--geo-surface)] text-[var(--geo-foreground-muted)]">
                    <i [class]="iconeArquivo(anexo)" class="text-2xl"></i>
                  </div>
                  <span class="text-[11px] font-medium text-slate-600 dark:text-slate-300 break-all line-clamp-2">{{ anexo.nomeArquivo }}</span>
                  <button type="button" (click)="baixar(anexo)" class="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary-700 dark:text-primary-400 hover:underline print:hidden">
                    <i class="pi pi-download text-[10px]"></i> {{ anexo.tipo === 'FOTO' ? 'Baixar para visualizar' : 'Abrir documento' }}
                  </button>
                </div>
              }

              <div class="p-3.5 flex flex-col gap-1.5 flex-1 bg-white dark:bg-slate-900">
                <div class="flex items-center justify-between gap-1">
                  <geo-status [tone]="o.tom" [icon]="o.icone">{{ o.rotulo }}</geo-status>
                  <span class="text-[10px] text-slate-400 font-medium">{{ formatarTamanho(anexo.tamanhoBytes) }}</span>
                </div>
                <span class="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug mt-1" [title]="anexo.nomeArquivo">{{ anexo.nomeArquivo }}</span>
                <span class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{{ anexo.tipo === 'FOTO' ? 'Foto' : 'Documento' }} · {{ o.dica }}</span>
                <div class="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span class="text-[10px] text-slate-400 truncate">Anexado em {{ anexo.dataCriacao | date: 'dd/MM/yy HH:mm' }}</span>
                  <span class="flex items-center gap-0.5 print:hidden shrink-0">
                    <button type="button" (click)="baixar(anexo)" pTooltip="Baixar arquivo original" tooltipPosition="top" [attr.aria-label]="'Baixar ' + anexo.nomeArquivo"
                      class="inline-flex items-center px-2 py-1 rounded-md text-slate-400 hover:text-[var(--geo-brand)] hover:bg-[var(--geo-surface-muted)] transition-colors">
                      <i class="pi pi-download text-[10px]"></i>
                    </button>
                    @if (canWrite()) {
                      <button type="button" (click)="confirmarRemocao(anexo)" pTooltip="Remover evidência" tooltipPosition="top" [attr.aria-label]="'Remover ' + anexo.nomeArquivo"
                        class="inline-flex items-center px-2 py-1 rounded-md text-slate-400 hover:text-[var(--geo-danger-text)] hover:bg-[var(--geo-danger-soft)] transition-colors">
                        <i class="pi pi-trash text-[10px]"></i>
                      </button>
                    }
                  </span>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <input #fileInput type="file" [accept]="accept" multiple class="hidden" (change)="onArquivosSelecionados($event)" />
    </div>

    <p-dialog [visible]="!!ampliada()" (visibleChange)="!$event && ampliada.set(null)" [modal]="true" appendTo="body" [dismissableMask]="true"
      header="Evidência fotográfica" [style]="{ width: '90vw', maxWidth: '850px' }" styleClass="overflow-hidden rounded-2xl print:hidden">
      @if (ampliada(); as anexo) {
        <div class="flex flex-col gap-4">
          <div class="w-full max-h-[72vh] flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden">
            <img [src]="thumbs()[anexo.id] || ''" class="max-h-[72vh] w-auto object-contain" [alt]="anexo.nomeArquivo" />
          </div>
          <div class="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between gap-3">
              <geo-status [tone]="origem(anexo.contexto).tom" [icon]="origem(anexo.contexto).icone">{{ origem(anexo.contexto).rotulo }}</geo-status>
              <span class="text-[11px] text-slate-400 font-medium shrink-0">{{ formatarTamanho(anexo.tamanhoBytes) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-slate-200/60 dark:border-slate-800">
              <span class="text-[11px] text-slate-500 dark:text-slate-400 truncate">{{ anexo.nomeArquivo }} · {{ anexo.dataCriacao | date: 'dd/MM/yyyy HH:mm' }}</span>
              <button type="button" (click)="baixar(anexo)" class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-400 shrink-0">
                <i class="pi pi-external-link text-xs"></i> Baixar arquivo original
              </button>
            </div>
          </div>
        </div>
      }
    </p-dialog>
  `,
  styles: `
    .filtro {
      display: inline-flex; align-items: center; gap: 0.375rem;
      padding: 0.25rem 0.625rem; border-radius: 999px;
      border: 1px solid var(--geo-border); background: var(--geo-surface);
      font-size: 11px; font-weight: 600; color: var(--geo-foreground-muted);
      cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease;
    }
    .filtro i { font-size: 10px; }
    .filtro strong { color: var(--geo-foreground); font-variant-numeric: tabular-nums; }
    .filtro:hover:not(:disabled) { background: var(--geo-surface-muted); color: var(--geo-foreground); }
    .filtro:focus-visible { outline: none; box-shadow: var(--geo-focus-ring); }
    .filtro:disabled { opacity: 0.45; cursor: not-allowed; }
    .filtro--ativo { border-color: var(--geo-brand); background: var(--geo-brand-soft); color: var(--geo-brand); }
    .filtro--ativo strong { color: var(--geo-brand); }
    @media print {
      .filtro { cursor: default; background: #ffffff !important; }
      .filtro--ativo { border-color: #cbd5e1 !important; color: #334155 !important; }
    }
  `
})
export class EventoAnexosComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly sst = inject(SstService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(GeoConfirmationService);

  readonly idEvento = input.required<string>();
  readonly canWrite = input(false);
  readonly anexosChange = output<AnexoEventoResponse[]>();

  protected readonly origens = ORIGENS;
  protected readonly lista = signal<AnexoEventoResponse[]>([]);
  protected readonly carregando = signal(true);
  protected readonly thumbs = signal<Record<string, string>>({});
  /** Origem do envio em andamento (o botão dela mostra o carregando). */
  protected readonly enviando = signal<ContextoAnexoEvento | null>(null);
  protected readonly filtro = signal<ContextoAnexoEvento | null>(null);
  protected readonly ampliada = signal<AnexoEventoResponse | null>(null);

  protected readonly accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.doc,.docx';

  /** Ocorrência, depois CAT, depois tratativa; dentro de cada uma, na ordem do envio. */
  private readonly ordenada = computed(() => {
    const ordem: Record<ContextoAnexoEvento, number> = { EVENTO: 0, CAT: 1, TRATATIVA: 2 };
    return [...this.lista()].sort((a, b) => ordem[a.contexto] - ordem[b.contexto] || a.dataCriacao.localeCompare(b.dataCriacao));
  });

  /** O filtro só vale na tela: o papel leva todas as evidências. */
  protected readonly visiveis = computed(() => {
    const f = this.filtro();
    return f && !this.imprimindo() ? this.ordenada().filter((a) => a.contexto === f) : this.ordenada();
  });

  protected readonly contagem = computed(() => {
    const total: Record<ContextoAnexoEvento, number> = { EVENTO: 0, CAT: 0, TRATATIVA: 0 };
    for (const a of this.lista()) total[a.contexto]++;
    return total;
  });

  private readonly imprimindo = signal(false);
  private contextoAlvo: ContextoAnexoEvento = 'EVENTO';
  private readonly antesDeImprimir = () => this.imprimindo.set(true);
  private readonly depoisDeImprimir = () => this.imprimindo.set(false);

  ngOnInit(): void {
    window.addEventListener('beforeprint', this.antesDeImprimir);
    window.addEventListener('afterprint', this.depoisDeImprimir);
    this.sst.listarAnexosEvento(this.idEvento()).subscribe({
      next: (anexos) => {
        this.lista.set(anexos);
        this.carregando.set(false);
        this.anexosChange.emit(anexos);
        this.carregarThumbs();
      },
      error: () => this.carregando.set(false)
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeprint', this.antesDeImprimir);
    window.removeEventListener('afterprint', this.depoisDeImprimir);
    Object.values(this.thumbs()).forEach((url) => URL.revokeObjectURL(url));
  }

  protected origem(contexto: ContextoAnexoEvento): OrigemAnexo {
    return ORIGENS.find((o) => o.contexto === contexto) ?? ORIGENS[0];
  }

  /** HEIC/HEIF não renderiza em <img> no desktop: vira cartão com download. */
  protected renderizavel(anexo: AnexoEventoResponse): boolean {
    return !/hei[cf]/i.test(anexo.contentType || anexo.nomeArquivo);
  }

  protected iconeArquivo(anexo: AnexoEventoResponse): string {
    if (anexo.tipo === 'FOTO') return 'pi pi-image';
    if (/pdf/i.test(anexo.contentType) || /\.pdf$/i.test(anexo.nomeArquivo)) return 'pi pi-file-pdf';
    if (/\.docx?$/i.test(anexo.nomeArquivo)) return 'pi pi-file-word';
    return 'pi pi-file';
  }

  protected ampliar(anexo: AnexoEventoResponse): void {
    if (this.thumbs()[anexo.id]) this.ampliada.set(anexo);
  }

  protected escolherArquivo(contexto: ContextoAnexoEvento): void {
    this.contextoAlvo = contexto;
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  protected async onArquivosSelecionados(evento: Event): Promise<void> {
    const arquivos = Array.from((evento.target as HTMLInputElement).files ?? []);
    const contexto = this.contextoAlvo;
    for (const arquivo of arquivos) {
      if (arquivo.size > 15 * 1024 * 1024) {
        this.notifications.warning(`${arquivo.name} passa do limite de 15 MB por arquivo.`, { title: 'Arquivo muito grande' });
        continue;
      }
      await this.enviar(arquivo, contexto);
    }
  }

  private enviar(arquivo: File, contexto: ContextoAnexoEvento): Promise<void> {
    this.enviando.set(contexto);
    return new Promise((resolve) => {
      this.sst.anexarEvidenciaEvento(this.idEvento(), contexto, arquivo).subscribe({
        next: (anexo) => {
          this.enviando.set(null);
          this.lista.update((atual) => [...atual, anexo]);
          this.anexosChange.emit(this.lista());
          this.carregarThumbs();
          this.notifications.success(`${anexo.nomeArquivo} anexado em ${CONTEXTO_ANEXO_EVENTO_LABELS[anexo.contexto]}.`, { title: 'Evidência anexada' });
          resolve();
        },
        error: (err) => {
          this.enviando.set(null);
          this.notifications.error(getErrorMessage(err), { title: `Não foi possível anexar ${arquivo.name}` });
          resolve();
        }
      });
    });
  }

  protected async confirmarRemocao(anexo: AnexoEventoResponse): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Remover evidência',
      message: `Deseja remover a evidência "${anexo.nomeArquivo}"?`,
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      variant: 'destructive'
    });
    if (confirmed) this.remover(anexo);
  }

  private remover(anexo: AnexoEventoResponse): void {
    this.sst.removerAnexoEvento(this.idEvento(), anexo.id).subscribe({
      next: () => {
        this.lista.update((atual) => atual.filter((item) => item.id !== anexo.id));
        this.anexosChange.emit(this.lista());
        if (this.filtro() && !this.contagem()[this.filtro()!]) this.filtro.set(null);
        this.notifications.success(`Evidência "${anexo.nomeArquivo}" removida.`);
      },
      error: (err) => this.notifications.error(getErrorMessage(err), { title: 'Não foi possível remover' })
    });
  }

  protected baixar(anexo: AnexoEventoResponse): void {
    this.sst.baixarAnexoEvento(this.idEvento(), anexo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (err) => this.notifications.error(getErrorMessage(err), { title: 'Não foi possível baixar' })
    });
  }

  /** As miniaturas passam pelo backend porque o objeto armazenado não tem URL pública. */
  private carregarThumbs(): void {
    this.lista()
      .filter((anexo) => anexo.tipo === 'FOTO' && this.renderizavel(anexo) && !this.thumbs()[anexo.id])
      .forEach((anexo) => {
        this.sst.baixarAnexoEvento(this.idEvento(), anexo.id).subscribe({
          next: (blob) => this.thumbs.update((atual) => ({ ...atual, [anexo.id]: URL.createObjectURL(blob) })),
          error: () => undefined
        });
      });
  }

  protected formatarTamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
