import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

import { SstService } from '../../../core/services/sst.service';
import {
  EVIDENCIA_ACCEPT,
  comprimirImagemAnexo,
  evidenciaRenderizavelNoBrowser,
  validarEvidenciaInspecao
} from '../../../core/models/sst.models';
import { getErrorMessage } from '../../../core/models/shared.models';

/** Uma foto na área de upload da tela de lançamento. */
interface EvidenciaUploadItem {
  idLocal: string;
  arquivo: File;
  nome: string;
  tamanhoBytes: number;
  /** `null` para HEIC/HEIF — o browser desktop não renderiza em `<img>`. */
  previewUrl: string | null;
  progresso: number;
  estado: 'ENVIANDO' | 'ENVIADA' | 'ERRO';
  /** Preenchido no 201 do upload; é o que vai em `evidencias[]` do lançamento. */
  idRemoto: string | null;
  isExistente?: boolean;
  erro?: string;
}

let seqEvidencia = 0;

/**
 * Área de upload das evidências fotográficas obrigatórias da inspeção.
 *
 * Cada foto sobe **antes** do lançamento, em requisição própria
 * (`POST /v1/sst/inspecoes/anexos`), e devolve um `id`. O lançamento carrega
 * apenas os IDs — assim uma queda no meio de um upload não derruba a inspeção
 * inteira e cada foto tem retentativa própria.
 *
 * Herda `MessageService` do componente pai (toasts no `<p-toast>` da tela).
 */
@Component({
  selector: 'app-evidencias-inspecao-upload',
  standalone: true,
  imports: [CommonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="rounded-lg border border-[var(--geo-border)] overflow-hidden">
      <!-- Cabeçalho do painel (mesmo padrão do bloco de inspecionados) -->
      <div class="flex items-center justify-between gap-2 bg-[var(--geo-surface-subtle)] border-b border-[var(--geo-border)] px-4 md:px-5 py-2.5">
        <div class="flex items-center gap-2 min-w-0">
          <i class="pi pi-camera text-[var(--geo-brand-text)]"></i>
          <span class="text-xs font-medium text-[var(--geo-foreground-muted)]">
            Evidências Fotográficas <span class="text-[var(--geo-danger-text)]">*</span>
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          @if (!temEvidencia()) {
            <span class="hidden sm:inline text-xs font-medium text-[var(--geo-warning-text)]">Ao menos 1 foto é obrigatória</span>
          }
          <span class="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-medium border border-transparent"
                [ngClass]="temEvidencia() ? 'bg-[var(--geo-brand-soft)] text-[var(--geo-brand-text)]' : 'bg-[var(--geo-warning-soft)] text-[var(--geo-warning-text)]'">
            {{ enviadas().length }}
          </span>
        </div>
      </div>

      <div class="p-4 md:p-5 flex flex-col gap-4 bg-[var(--geo-surface)]">
        <!-- Seleção e arrastar-e-soltar (mesmo empty-state tracejado das demais listas) -->
        <div
          (click)="escolherArquivos()"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
          class="flex flex-col items-center justify-center gap-2 py-8 text-center rounded-lg border border-dashed cursor-pointer transition-colors"
          [ngClass]="arrastando()
            ? 'border-[var(--geo-brand)] bg-[var(--geo-brand-soft)]'
            : 'border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] hover:bg-[var(--geo-surface-subtle)]'">
          <i class="pi pi-cloud-upload text-2xl text-[var(--geo-foreground-subtle)]"></i>
          <span class="text-xs font-medium text-[var(--geo-foreground-subtle)]">Arraste as fotos aqui ou clique para selecionar</span>
          <span class="text-xs text-[var(--geo-foreground-subtle)]">JPEG, PNG, WebP ou HEIC · até 15 MB por arquivo</span>
        </div>

        <span class="text-xs text-[var(--geo-foreground-subtle)] flex items-center gap-1">
          <i class="pi pi-info-circle"></i> A foto comprova que a inspeção aconteceu em campo.
        </span>

        <!-- Miniaturas (mesmo padrão das evidências de desvio) -->
        @if (itens().length) {
          <div class="flex items-center gap-2.5 flex-wrap pt-1 border-t border-[var(--geo-border)]">
            @for (item of itens(); track item.idLocal) {
              <div class="relative group w-16 mt-3">
                <div class="relative w-16 h-16 rounded-lg overflow-hidden border bg-[var(--geo-surface)]"
                     [ngClass]="item.estado === 'ERRO' ? 'border-[var(--geo-danger-border)]' : 'border-[var(--geo-border-strong)]'"
                     [pTooltip]="item.estado === 'ERRO' ? (item.erro || 'Falha no envio') : item.nome"
                     tooltipPosition="top">
                  @if (item.previewUrl) {
                    <img [src]="item.previewUrl" class="w-full h-full object-cover" [alt]="item.nome" />
                  } @else {
                    <div class="w-full h-full flex flex-col items-center justify-center gap-0.5 text-[var(--geo-foreground-subtle)]">
                      <i class="pi pi-image text-base"></i>
                      <span class="text-[8px] font-medium">HEIC</span>
                    </div>
                  }

                  @if (item.estado === 'ENVIANDO') {
                    <div class="absolute inset-0 bg-slate-900/50 flex items-center justify-center">
                      <span class="text-xs font-semibold text-white">{{ item.progresso }}%</span>
                    </div>
                  } @else if (item.estado === 'ERRO') {
                    <button type="button" (click)="reenviar(item)"
                      class="absolute inset-0 bg-[var(--geo-danger)] flex flex-col items-center justify-center gap-0.5 text-white">
                      <i class="pi pi-refresh text-xs"></i>
                      <span class="text-[8px] font-semibold">Tentar</span>
                    </button>
                  }

                  <button type="button" (click)="remover(item); $event.stopPropagation()" pTooltip="Remover evidência"
                    tooltipPosition="top"
                    class="absolute top-1 right-1 w-6 h-6 rounded-full bg-[var(--geo-danger)] text-white flex items-center justify-center ring-1 ring-white/70 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <i class="pi pi-trash text-xs"></i>
                  </button>
                </div>

                <!-- Barra de progresso individual -->
                <div class="h-1 w-full rounded-full bg-[var(--geo-surface-muted)] overflow-hidden mt-1">
                  <div class="h-full rounded-full transition-[width] duration-200"
                       [ngClass]="item.estado === 'ERRO' ? 'bg-[var(--geo-danger)]' : (item.estado === 'ENVIADA' ? 'bg-[var(--geo-success)]' : 'bg-[var(--geo-brand)]')"
                       [style.width.%]="item.estado === 'ERRO' ? 100 : item.progresso"></div>
                </div>
                <span class="block text-xs text-[var(--geo-foreground-subtle)] truncate mt-0.5" [title]="item.nome">
                  {{ formatarTamanho(item.tamanhoBytes) }}
                </span>
              </div>
            }
          </div>
        }
      </div>

      <input #fileInput type="file" [accept]="acceptAttr" multiple class="hidden"
        (change)="onArquivosSelecionados($event)" />
    </div>
  `
})
export class EvidenciasInspecaoUploadComponent implements OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private sst = inject(SstService);
  private messageService = inject(MessageService);
  private cdr = inject(ChangeDetectorRef);

  protected readonly acceptAttr = EVIDENCIA_ACCEPT;
  protected readonly itens = signal<EvidenciaUploadItem[]>([]);
  protected readonly arrastando = signal(false);

  /** Fotos com `idRemoto` — as únicas que podem entrar no lançamento. */
  readonly enviadas = computed(() => this.itens().filter((i) => i.estado === 'ENVIADA' && i.idRemoto));
  /** Há upload em andamento (o botão de lançar espera terminar). */
  readonly enviando = computed(() => this.itens().some((i) => i.estado === 'ENVIANDO'));
  /** Requisito mínimo da regra: ao menos uma foto já no servidor. */
  readonly temEvidencia = computed(() => this.enviadas().length > 0);

  /** IDs para `RegistrarInspecaoRequest.evidencias`. */
  ids(): string[] {
    return this.enviadas().map((i) => i.idRemoto!);
  }

  /**
   * Reenvia todos os blobs e devolve os novos IDs. Usado quando o lançamento
   * responde 404: a foto foi expurgada (mais de 72 h pendente) ou descartada, e
   * os arquivos originais continuam em memória.
   */
  async reenviarTodas(): Promise<string[]> {
    const alvos = this.itens().filter((i) => i.estado !== 'ENVIANDO');
    alvos.forEach((item) => this.atualizar(item.idLocal, { idRemoto: null }));
    await Promise.all(alvos.map((item) => this.enviar(item)));
    return this.ids();
  }

  /** Carrega evidências já existentes de uma inspeção em modo de edição */
  carregarExistentes(evidencias: { id: string; nomeArquivo: string; tamanhoBytes: number }[], idInspecao: string) {
    const novos: EvidenciaUploadItem[] = evidencias.map((ev) => ({
      idLocal: `existente-${ev.id}`,
      arquivo: new File([], ev.nomeArquivo),
      nome: ev.nomeArquivo,
      tamanhoBytes: ev.tamanhoBytes,
      previewUrl: null,
      progresso: 100,
      estado: 'ENVIADA',
      idRemoto: ev.id,
      isExistente: true
    }));
    this.itens.set(novos);

    // Carregar previews das fotos existentes assincronamente via blob autenticado
    novos.forEach((item) => {
      this.sst.baixarEvidenciaInspecao(idInspecao, item.idRemoto!).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.atualizar(item.idLocal, { previewUrl: url });
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    });
  }

  ngOnDestroy() {
    for (const item of this.itens()) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
  }

  protected escolherArquivos() {
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  protected onDragOver(event: DragEvent) {
    event.preventDefault();
    this.arrastando.set(true);
  }

  protected onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.arrastando.set(false);
  }

  protected onDrop(event: DragEvent) {
    event.preventDefault();
    this.arrastando.set(false);
    const arquivos = Array.from(event.dataTransfer?.files ?? []);
    if (arquivos.length) void this.adicionar(arquivos);
  }

  protected onArquivosSelecionados(event: Event) {
    const input = event.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []);
    input.value = '';
    if (arquivos.length) void this.adicionar(arquivos);
  }

  private async adicionar(arquivos: File[]) {
    for (const original of arquivos) {
      // Valida antes de gastar upload — o backend recusaria com 422 de qualquer forma.
      const erro = validarEvidenciaInspecao(original);
      if (erro) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Arquivo recusado',
          detail: `${original.name}: ${erro}`
        });
        continue;
      }

      // Fotos de celular passam fácil de 10 MB; recomprime mantendo a orientação EXIF.
      const arquivo = await comprimirImagemAnexo(original);
      const renderizavel = evidenciaRenderizavelNoBrowser(arquivo.type, arquivo.name);
      const item: EvidenciaUploadItem = {
        idLocal: `ev_${++seqEvidencia}`,
        arquivo,
        nome: arquivo.name,
        tamanhoBytes: arquivo.size,
        previewUrl: renderizavel ? URL.createObjectURL(arquivo) : null,
        progresso: 0,
        estado: 'ENVIANDO',
        idRemoto: null
      };
      this.itens.update((l) => [...l, item]);
      this.cdr.detectChanges();
      void this.enviar(item);
    }
  }

  /** Um `POST /anexos` por arquivo, em paralelo, com progresso individual. */
  private enviar(item: EvidenciaUploadItem): Promise<void> {
    this.atualizar(item.idLocal, { estado: 'ENVIANDO', progresso: 0, erro: undefined });
    return new Promise((resolve) => {
      this.sst.enviarEvidenciaPendente(item.arquivo).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.atualizar(item.idLocal, {
              progresso: Math.min(99, Math.round((event.loaded / event.total) * 100))
            });
            this.cdr.detectChanges();
          } else if (event.type === HttpEventType.Response && event.body) {
            this.atualizar(item.idLocal, {
              estado: 'ENVIADA',
              progresso: 100,
              idRemoto: event.body.id
            });
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          this.atualizar(item.idLocal, { estado: 'ERRO', erro: getErrorMessage(err) });
          this.cdr.detectChanges();
          this.messageService.add({
            severity: 'error',
            summary: 'Falha ao enviar evidência',
            detail: `${item.nome}: ${getErrorMessage(err)}`
          });
          resolve();
        },
        complete: () => resolve()
      });
    });
  }

  protected reenviar(item: EvidenciaUploadItem) {
    void this.enviar(item);
  }

  /** Remover antes do lançamento/salvamento = tirar da lista local + descartar no backend se for foto nova pendente. */
  protected remover(item: EvidenciaUploadItem) {
    this.itens.update((l) => l.filter((i) => i.idLocal !== item.idLocal));
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.idRemoto && !item.isExistente) {
      this.sst.descartarEvidenciaPendente(item.idRemoto).subscribe({
        error: (err) =>
          this.messageService.add({
            severity: 'warn',
            summary: 'Foto removida da lista',
            detail: `Não foi possível descartá-la no servidor: ${getErrorMessage(err)}`
          })
      });
    }
    this.cdr.detectChanges();
  }

  private atualizar(idLocal: string, patch: Partial<EvidenciaUploadItem>) {
    this.itens.update((l) => l.map((i) => (i.idLocal === idLocal ? { ...i, ...patch } : i)));
  }

  protected formatarTamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
