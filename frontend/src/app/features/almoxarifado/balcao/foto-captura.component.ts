import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { GeoButtonComponent } from '@geo/ui';

const LADO_MAXIMO = 720;

/**
 * Foto de quem retira ou devolve: câmera do aparelho (webcam no computador, câmera frontal no tablet) ou, sem
 * câmera, um arquivo. Sai em JPEG reduzido (até 720 px) para não pesar no envio. Serve só para consulta.
 */
@Component({
  selector: 'app-foto-captura',
  standalone: true,
  imports: [GeoButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="fc" [attr.aria-label]="rotulo()">
      <header class="fc__topo">
        <strong>{{ rotulo() }}</strong>
        <span>Só para consulta, se alguém contestar a retirada.</span>
      </header>
      <div class="fc__quadro" [class.fc__quadro--vazio]="!foto() && !aoVivo()">
        @if (foto()) {
          <img [src]="foto()" alt="Foto de quem retira" />
        } @else {
          <video #video [hidden]="!aoVivo()" autoplay playsinline muted></video>
          @if (!aoVivo()) {
            <span class="fc__vazio"><i class="pi pi-camera" aria-hidden="true"></i>{{ erro() ?? 'Sem foto' }}</span>
          }
        }
      </div>
      <footer class="fc__acoes">
        @if (foto()) {
          <geo-button variant="ghost" size="sm" icon="pi pi-refresh" label="Tirar outra" (pressed)="refazer()" />
        } @else if (aoVivo()) {
          <geo-button size="sm" icon="pi pi-camera" label="Fotografar" (pressed)="capturar()" />
          <geo-button variant="ghost" size="sm" label="Cancelar" (pressed)="pararCamera()" />
        } @else {
          <geo-button variant="secondary" size="sm" icon="pi pi-camera" label="Abrir câmera" (pressed)="abrirCamera()" />
          <geo-button variant="ghost" size="sm" icon="pi pi-upload" label="Escolher arquivo" (pressed)="arquivo.click()" />
        }
        <input #arquivo type="file" accept="image/*" capture="user" hidden (change)="aoEscolherArquivo($event)" />
      </footer>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .fc { display: grid; gap: var(--geo-space-2); }
    .fc__topo { display: grid; gap: 2px; }
    .fc__topo strong { font-weight: var(--geo-font-weight-semibold); }
    .fc__topo span { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .fc__quadro { position: relative; aspect-ratio: 4 / 3; max-height: 13rem; border-radius: var(--geo-radius-md);
      overflow: hidden; background: var(--geo-surface-muted); border: 1px solid var(--geo-border); display: grid; place-items: center; }
    .fc__quadro--vazio { border-style: dashed; }
    .fc__quadro img, .fc__quadro video { width: 100%; height: 100%; object-fit: cover; }
    .fc__vazio { display: inline-flex; align-items: center; gap: var(--geo-space-2); color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption); padding: var(--geo-space-3); text-align: center; }
    .fc__acoes { display: flex; flex-wrap: wrap; gap: var(--geo-space-2); }
  `,
})
export class FotoCapturaComponent {
  readonly rotulo = input('Foto de quem retira');
  readonly foto = input<string | null>(null);
  readonly fotoChange = output<string | null>();

  protected readonly aoVivo = signal(false);
  protected readonly erro = signal<string | null>(null);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pararCamera());
  }

  protected async abrirCamera(): Promise<void> {
    this.erro.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.erro.set('Este aparelho não liberou a câmera. Escolha um arquivo.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
      this.aoVivo.set(true);
      queueMicrotask(() => {
        const el = this.video()?.nativeElement;
        if (el) el.srcObject = this.stream;
      });
    } catch {
      this.erro.set('Câmera bloqueada ou indisponível. Libere no navegador ou escolha um arquivo.');
    }
  }

  protected capturar(): void {
    const el = this.video()?.nativeElement;
    if (!el || !el.videoWidth) return;
    this.fotoChange.emit(reduzir(el, el.videoWidth, el.videoHeight));
    this.pararCamera();
  }

  protected pararCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.aoVivo.set(false);
  }

  protected refazer(): void {
    this.fotoChange.emit(null);
  }

  protected aoEscolherArquivo(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      this.fotoChange.emit(reduzir(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      this.erro.set('Não foi possível ler a imagem.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
}

function reduzir(fonte: CanvasImageSource, largura: number, altura: number): string {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  canvas.getContext('2d')?.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
