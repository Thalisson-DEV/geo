import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { EvidenciaPreparada, prepararEvidencia } from '../core/sst/evidencia-foto.util';
import { IconeComponent } from './icone.component';
import { EstadoEnvio, StatusEnvioComponent } from './status-envio.component';

export interface FotoExibida {
  id: string;
  /** URL da miniatura (object URL do Blob no aparelho ou endereço do servidor). */
  url: string;
  legenda?: string;
  estado?: EstadoEnvio;
}

/**
 * Fotos de evidência: abre a câmera direto (traseira), comprime, aplica o carimbo (contexto, data e
 * GPS) e entrega a foto pronta para a fila. A galeria só aparece quando o fluxo permite (algumas
 * evidências exigem foto tirada na hora). Funciona sem rede: nada aqui depende do servidor.
 */
@Component({
  selector: 'geo-fotos',
  standalone: true,
  imports: [IconeComponent, StatusEnvioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="grade" [attr.aria-label]="rotulo()">
      @for (f of fotos(); track f.id) {
        <li class="foto">
          <img [src]="f.url" [alt]="f.legenda || 'Foto'" loading="lazy" decoding="async">
          @if (f.estado) { <span class="estado"><geo-status-envio [estado]="f.estado" [compacto]="true" /></span> }
          @if (removivel()) {
            <button type="button" class="remover" (click)="removida.emit(f.id)" [attr.aria-label]="'Remover ' + (f.legenda || 'foto')">
              <geo-icone nome="fechar" [tamanho]="16" />
            </button>
          }
          @if (f.legenda) { <span class="legenda">{{ f.legenda }}</span> }
        </li>
      }
      @if (podeAdicionar()) {
        <li>
          <label class="adicionar" [class.processando]="processando()">
            <input type="file" accept="image/*" capture="environment" (change)="escolher($event)" [disabled]="processando()">
            <geo-icone nome="camera" [tamanho]="26" />
            <span>{{ processando() ? 'Preparando…' : rotuloCamera() }}</span>
          </label>
        </li>
        @if (galeria()) {
          <li>
            <label class="adicionar secundario" [class.processando]="processando()">
              <input type="file" accept="image/*" (change)="escolher($event)" [disabled]="processando()">
              <geo-icone nome="imagem" [tamanho]="24" />
              <span>Da galeria</span>
            </label>
          </li>
        }
      }
    </ul>
  `,
  styles: [`
    :host { display: block; }
    .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--geo-e2);
      margin: 0; padding: 0; list-style: none; }
    .foto { position: relative; aspect-ratio: 1; border-radius: var(--geo-r-campo); overflow: hidden; background: var(--geo-superficie-2); }
    .foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .estado { position: absolute; left: 6px; top: 6px; display: inline-grid; place-items: center; border-radius: 50%;
      background: var(--geo-superficie); }
    .remover { position: absolute; right: 2px; top: 2px; width: 44px; height: 44px; border: 0; background: transparent; cursor: pointer;
      display: grid; place-items: center; color: var(--geo-veu-foto-texto); touch-action: manipulation; }
    .remover::before { content: ''; position: absolute; width: 28px; height: 28px; border-radius: 50%; background: var(--geo-veu-foto); }
    .remover geo-icone { position: relative; }
    .legenda { position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 6px; font: 500 .75rem/1.2 var(--geo-fonte);
      color: var(--geo-veu-foto-texto); background: var(--geo-veu-foto);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .adicionar { position: relative; aspect-ratio: 1; display: grid; place-content: center; justify-items: center; gap: 6px;
      border-radius: var(--geo-r-campo); border: 1.5px dashed var(--geo-borda-campo); background: var(--geo-destaque-suave);
      color: var(--geo-destaque); font: 600 .8125rem/1.2 var(--geo-fonte); text-align: center; cursor: pointer;
      -webkit-user-select: none; user-select: none; touch-action: manipulation; transition: transform 100ms var(--geo-curva); }
    .adicionar.secundario { background: var(--geo-superficie); color: var(--geo-texto-2); }
    .adicionar:active { transform: scale(.97); }
    .adicionar.processando { opacity: .6; cursor: progress; }
    .adicionar input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .adicionar:focus-within { outline: 2px solid var(--geo-destaque); outline-offset: 2px; }
  `],
})
export class FotosComponent {
  readonly fotos = input<FotoExibida[]>([]);
  readonly rotulo = input('Fotos');
  readonly rotuloCamera = input('Tirar foto');
  /** Mostra "Da galeria" além da câmera. Desligado quando a evidência precisa ser tirada na hora. */
  readonly galeria = input(false);
  /** Linhas do carimbo (ver `linhasDoCarimbo`); sem carimbo a foto só é comprimida. */
  readonly carimbo = input<string[] | null>(null);
  readonly maximo = input<number | null>(null);
  readonly removivel = input(true);

  readonly adicionada = output<EvidenciaPreparada>();
  readonly removida = output<string>();

  readonly processando = signal(false);
  readonly podeAdicionar = computed(() => this.maximo() == null || this.fotos().length < this.maximo()!);

  async escolher(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    entrada.value = '';
    if (!arquivo) return;
    this.processando.set(true);
    try {
      this.adicionada.emit(await prepararEvidencia(arquivo, { carimbo: this.carimbo() ?? undefined }));
    } finally {
      this.processando.set(false);
    }
  }
}
