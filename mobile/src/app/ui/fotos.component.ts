import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, Injector, input, output, signal } from '@angular/core';
import { EvidenciaPreparada, prepararEvidencia } from '../core/sst/evidencia-foto.util';
import { FolhaComponent } from './folha.component';
import { IconeComponent } from './icone.component';
import { EstadoEnvio, StatusEnvioComponent } from './status-envio.component';

export interface FotoExibida {
  id: string;
  /** URL da miniatura (object URL do Blob no aparelho ou endereço do servidor). */
  url: string;
  legenda?: string;
  estado?: EstadoEnvio;
  /** Só esta foto pode ser apagada (ex.: ainda na fila do aparelho). Sem o campo, vale o `removivel` do componente. */
  removivel?: boolean;
}

/** Linhas do carimbo, ou uma função que as monta na hora da foto (hora e GPS do momento, não de quando a tela abriu). */
export type CarimboFoto = string[] | (() => string[]) | null;

/**
 * Fotos de evidência: abre a câmera direto (traseira), comprime, aplica o carimbo (contexto, data e
 * GPS) e entrega a foto pronta para a fila. A galeria só aparece quando o fluxo permite (algumas
 * evidências exigem foto tirada na hora). Tocar na foto abre em tela cheia, para conferir se ficou
 * nítida e se o carimbo dá para ler. Funciona sem rede: nada aqui depende do servidor.
 */
@Component({
  selector: 'geo-fotos',
  standalone: true,
  imports: [IconeComponent, StatusEnvioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'aoEsc()' },
  template: `
    <ul class="grade" [attr.aria-label]="rotulo()">
      @for (f of fotos(); track f.id) {
        <li class="foto">
          <button type="button" class="ver" (click)="ampliar(f, $event)" [attr.aria-label]="'Ver ' + (f.legenda || 'a foto') + ' em tela cheia'">
            <img [src]="f.url" alt="" loading="lazy" decoding="async">
          </button>
          @if (f.estado) { <span class="estado"><geo-status-envio [estado]="f.estado" [compacto]="true" /></span> }
          @if (f.removivel ?? removivel()) {
            <button type="button" class="remover" (click)="removida.emit(f.id)" [attr.aria-label]="'Apagar ' + (f.legenda || 'foto')">
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

    @if (ampliada(); as f) {
      <!-- Fecha só pelo botão, pelo Voltar e pelo Esc: toque no fundo (com luva, sob sol) fechava por engano. -->
      <div class="tela-cheia" role="dialog" aria-modal="true" [attr.aria-label]="rotulo() + (f.legenda ? ' · ' + f.legenda : '')" (keydown.tab)="prenderTab($event)">
        <img [src]="f.url" [alt]="rotulo() + (f.legenda ? ' · ' + f.legenda : '')">
        <div class="tela-cheia__barra">
          <span class="tela-cheia__legenda">{{ rotulo() }}{{ f.legenda ? ' · ' + f.legenda : '' }}</span>
          @if (f.removivel ?? removivel()) {
            <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="apagarAmpliada(f.id)"><geo-icone nome="lixeira" />Apagar</button>
          }
          <button type="button" class="geo-btn geo-btn--principal geo-btn--compacto tela-cheia__fechar" (click)="fecharAmpliada()"><geo-icone nome="fechar" />Fechar</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--geo-e2);
      margin: 0; padding: 0; list-style: none; }
    .foto { position: relative; aspect-ratio: 1; border-radius: var(--geo-r-campo); overflow: hidden; background: var(--geo-superficie-2); }
    .ver { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; touch-action: manipulation; }
    .ver:focus-visible { outline: 2px solid var(--geo-destaque); outline-offset: -2px; }
    .ver img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .estado { position: absolute; left: 6px; top: 6px; display: inline-grid; place-items: center; border-radius: 50%;
      background: var(--geo-superficie); pointer-events: none; }
    .remover { position: absolute; right: 2px; top: 2px; width: 44px; height: 44px; border: 0; background: transparent; cursor: pointer;
      display: grid; place-items: center; color: var(--geo-veu-foto-texto); touch-action: manipulation; }
    .remover::before { content: ''; position: absolute; width: 28px; height: 28px; border-radius: 50%; background: var(--geo-veu-foto); }
    .remover geo-icone { position: relative; }
    .legenda { position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 6px; font: 500 .75rem/1.2 var(--geo-fonte);
      color: var(--geo-veu-foto-texto); background: var(--geo-veu-foto); pointer-events: none;
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
    /* Tela cheia: fundo escuro de foto (independe do tema), a foto inteira e a barra no alcance do polegar. */
    .tela-cheia { position: fixed; inset: 0; z-index: 900; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      gap: var(--geo-e3); padding: calc(var(--geo-e3) + env(safe-area-inset-top)) var(--geo-e3) calc(var(--geo-e4) + env(safe-area-inset-bottom));
      background: var(--geo-camera-fundo); }
    .tela-cheia img { flex: 1; min-height: 0; width: 100%; object-fit: contain; }
    .tela-cheia__barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--geo-e3); width: 100%; }
    .tela-cheia__legenda { flex-basis: 100%; text-align: center; color: var(--geo-veu-foto-texto); font: var(--geo-t-apoio); }
  `],
})
export class FotosComponent {
  readonly fotos = input<FotoExibida[]>([]);
  readonly rotulo = input('Fotos');
  readonly rotuloCamera = input('Tirar foto');
  /** Mostra "Da galeria" além da câmera. Desligado quando a evidência precisa ser tirada na hora. */
  readonly galeria = input(false);
  /** Linhas do carimbo (ver `linhasDoCarimbo`), ou a função que as monta na hora da foto; sem carimbo a foto só é comprimida. */
  readonly carimbo = input<CarimboFoto>(null);
  readonly maximo = input<number | null>(null);
  readonly removivel = input(true);

  readonly adicionada = output<EvidenciaPreparada>();
  readonly removida = output<string>();

  readonly processando = signal(false);
  readonly ampliada = signal<FotoExibida | null>(null);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private fecharCamada: (() => void) | null = null;
  private focoAnterior: HTMLElement | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.ampliada()) this.fecharAmpliada(); });
  }

  /**
   * Tela cheia como camada: o Voltar do Android e o Esc fecham a foto, não a folha do ponto por baixo. O foco vai para o
   * "Fechar" e volta para a miniatura; a página de trás não rola enquanto a foto está aberta.
   */
  ampliar(f: FotoExibida, evento: Event): void {
    this.focoAnterior = evento.currentTarget as HTMLElement;
    this.ampliada.set(f);
    this.fecharCamada = FolhaComponent.abrirCamada(() => this.fecharAmpliada(false));
    document.body.style.overflow = 'hidden';
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.tela-cheia__fechar')?.focus(), { injector: this.injector });
  }

  /** @param pelaTela fechou pelo botão/Esc (consome o histórico); falso quando foi o Voltar. */
  fecharAmpliada(pelaTela = true): void {
    if (!this.ampliada()) return;
    this.ampliada.set(null);
    const fechar = this.fecharCamada;
    this.fecharCamada = null;
    if (pelaTela) fechar?.();
    document.body.style.overflow = '';
    this.focoAnterior?.focus?.({ preventScroll: true });
  }

  /** Esc fecha a foto depois que a folha (se houver) já viu que existe camada aberta. */
  aoEsc(): void {
    if (this.ampliada()) queueMicrotask(() => this.fecharAmpliada());
  }

  /** O Tab fica entre os botões da tela cheia. */
  prenderTab(evento: Event): void {
    const botoes = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.tela-cheia button')];
    if (botoes.length < 2) { evento.preventDefault(); botoes[0]?.focus(); return; }
    const ev = evento as KeyboardEvent;
    const atual = botoes.indexOf(document.activeElement as HTMLElement);
    const proximo = ev.shiftKey ? (atual <= 0 ? botoes.length - 1 : atual - 1) : (atual >= botoes.length - 1 ? 0 : atual + 1);
    ev.preventDefault();
    botoes[proximo].focus();
  }
  readonly podeAdicionar = computed(() => this.maximo() == null || this.fotos().length < this.maximo()!);

  async escolher(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    entrada.value = '';
    if (!arquivo) return;
    this.processando.set(true);
    try {
      const carimbo = this.carimbo();
      const linhas = typeof carimbo === 'function' ? carimbo() : carimbo;
      this.adicionada.emit(await prepararEvidencia(arquivo, { carimbo: linhas ?? undefined }));
    } finally {
      this.processando.set(false);
    }
  }

  apagarAmpliada(id: string): void {
    this.fecharAmpliada();
    this.removida.emit(id);
  }
}
