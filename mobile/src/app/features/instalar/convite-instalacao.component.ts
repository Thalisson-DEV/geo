import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PlataformaService } from '../../core/plataforma/plataforma.service';
import { IconeComponent } from '../../ui';

/**
 * Convite em tela cheia para instalar o app (decisão R2: sugerir, sem bloquear).
 * Aparece ao abrir pelo navegador; "Agora não" adia por 24 h.
 */
@Component({
  selector: 'app-convite-instalacao',
  standalone: true,
  imports: [IconeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (plataforma.sugerirInstalacao()) {
      <div class="tela" role="dialog" aria-modal="true" aria-labelledby="convite-titulo">
        <div class="topo">
          <img class="icone-app" src="icons/icon-192x192.png" alt="" width="84" height="84">
          <h1 id="convite-titulo">Instale o GEO Campo</h1>
          <p>Fica na tela inicial como os outros apps.</p>
        </div>

        <ul class="motivos">
          <li><span class="geo-selo geo-selo--destaque"><geo-icone nome="aparelho" /></span>Abre em tela cheia, sem a barra do navegador.</li>
          <li><span class="geo-selo geo-selo--destaque"><geo-icone nome="sem_rede" /></span>Funciona sem internet e envia quando o sinal voltar.</li>
          <li><span class="geo-selo geo-selo--destaque"><geo-icone nome="retomar" /></span>Volta exatamente de onde você parou.</li>
        </ul>

        <div class="acoes">
          @if (plataforma.podeInstalarDireto()) {
            <button type="button" class="geo-btn geo-btn--principal geo-btn--bloco" (click)="instalar()" [disabled]="instalando()">
              <geo-icone nome="baixar" />Instalar app
            </button>
          } @else {
            <div class="geo-passos" aria-live="polite">
              @switch (plataforma.plataforma) {
                @case ('ios') {
                  <p><b>No iPhone:</b> toque em <span class="tecla"><geo-icone nome="compartilhar_ios" [tamanho]="18" /> Compartilhar</span>
                    e depois em <span class="tecla">Adicionar à Tela de Início</span>.</p>
                }
                @default {
                  <p><b>No Chrome:</b> toque em <span class="tecla"><geo-icone nome="mais_opcoes" [tamanho]="18" /> Menu</span>
                    e depois em <span class="tecla">Instalar app</span>.</p>
                }
              }
              <p class="apoio">Já instalou? Abra pelo ícone <b>GEO Campo</b> na tela inicial.</p>
            </div>
          }
          <button type="button" class="geo-btn geo-btn--texto geo-btn--bloco" (click)="plataforma.adiar()">Agora não</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .tela { position: fixed; inset: 0; z-index: 90; background: var(--geo-fundo); overflow-y: auto; display: flex; flex-direction: column;
      gap: var(--geo-e8); padding: calc(var(--geo-safe-topo) + var(--geo-e8)) var(--geo-e6) calc(var(--geo-safe-base) + var(--geo-e5)); }
    .topo { display: grid; gap: var(--geo-e2); }
    .icone-app { width: 84px; height: 84px; border-radius: 22px; box-shadow: var(--geo-sombra-flutuante); }
    h1 { margin: var(--geo-e4) 0 0; font: var(--geo-t-titulo); letter-spacing: -.02em; text-wrap: balance; }
    .topo p { margin: 0; color: var(--geo-texto-2); }
    .motivos { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--geo-e4); }
    .motivos li { display: flex; align-items: center; gap: var(--geo-e3); font: var(--geo-t-corpo); }
    .acoes { margin-top: auto; display: grid; gap: var(--geo-e2); }
    .tecla { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 8px; background: var(--geo-superficie-2);
      font-weight: 600; white-space: nowrap; vertical-align: middle; }
  `],
})
export class ConviteInstalacaoComponent {
  readonly plataforma = inject(PlataformaService);
  readonly instalando = signal(false);

  async instalar(): Promise<void> {
    this.instalando.set(true);
    try {
      const aceito = await this.plataforma.instalar();
      if (!aceito) this.plataforma.adiar();
    } finally {
      this.instalando.set(false);
    }
  }
}
