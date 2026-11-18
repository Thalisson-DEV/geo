import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, model, output, signal } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextInputComponent
} from '@geo/ui';
import { EXEMPLO_CADASTRO, EXEMPLOS_PERGUNTA, PROVEDORES, ProvedorIa, copiarTexto } from './conectar-ia.util';

/**
 * Passo a passo para conectar uma IA ao GEO: copiar o endereço, seguir os cliques no
 * assistente escolhido e testar com uma pergunta.
 */
@Component({
  selector: 'app-guia-conectar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoTabPanelDirective,
    GeoTabsComponent,
    GeoTextInputComponent
  ],
  styleUrl: './guia-conectar.component.css',
  template: `
    <geo-drawer [(visible)]="visivel" title="Conectar uma IA" size="lg" eyebrow="Passo a passo"
      description="Leva uns dois minutos. Depois você pergunta sobre o GEO direto no seu assistente.">
      <geo-form-section title="1. Copie o endereço do GEO" icon="pi pi-link"
        description="É por ele que o seu assistente encontra o GEO. Você vai colar no passo 2.">
        @if (erroEndereco()) {
          <geo-callout tone="danger" [dense]="true">Não foi possível carregar o endereço. Feche e abra este passo a passo de novo.</geo-callout>
        } @else {
          <div class="guia-copiar">
            <geo-text-input label="Endereço do GEO" [labelVisible]="false" [readonly]="true"
              [value]="endereco() || 'Carregando...'"></geo-text-input>
            <geo-button [variant]="copiado() === 'endereco' ? 'success' : 'primary'"
              [icon]="copiado() === 'endereco' ? 'pi pi-check' : 'pi pi-copy'"
              [label]="copiado() === 'endereco' ? 'Copiado' : 'Copiar endereço'"
              [disabled]="!endereco()" (pressed)="copiar('endereco', endereco())"></geo-button>
          </div>
        }
      </geo-form-section>

      <geo-form-section title="2. Siga os passos no seu assistente" icon="pi pi-list-check"
        description="Escolha qual você usa. Os nomes em destaque são os botões que aparecem na tela dele.">
        <geo-tabs [tabs]="abas" [(value)]="provedor" ariaLabel="Qual assistente você usa" [lazy]="false">
          @for (p of provedores; track p.id) {
            <ng-template [geoTabPanel]="p.id">
              <p class="guia-onde">{{ p.onde }}</p>
              <ol class="guia-passos">
                @for (passo of p.passos; track $index) {
                  <li>
                    <span class="guia-passos__numero" aria-hidden="true">{{ $index + 1 }}</span>
                    <div class="guia-passos__texto">
                      <p>@for (t of passo.trechos; track $index) {@if (t.botao) {<strong class="guia-botao">{{ t.texto }}</strong>} @else {<span>{{ t.texto }}</span>}}</p>
                      @if (passo.dica) { <p class="guia-dica"><i class="pi pi-info-circle" aria-hidden="true"></i>{{ passo.dica }}</p> }
                    </div>
                  </li>
                }
              </ol>
              @if (p.id === 'outros') {
                <div class="guia-outros">
                  <geo-button variant="outline" icon="pi pi-key" label="Gerar chave de acesso" (pressed)="gerarChave.emit()"></geo-button>
                </div>
              }
            </ng-template>
          }
        </geo-tabs>
      </geo-form-section>

      <geo-form-section title="3. Teste com uma pergunta" icon="pi pi-comment"
        description="Copie uma destas e cole numa conversa nova do seu assistente.">
        <ul class="guia-exemplos">
          @for (e of exemplos(); track e) {
            <li>
              <span>{{ e }}</span>
              <geo-icon-button size="icon-sm" [icon]="copiado() === e ? 'pi pi-check' : 'pi pi-copy'"
                [label]="copiado() === e ? 'Pergunta copiada' : 'Copiar pergunta'" [tooltip]="copiado() === e ? 'Copiada' : 'Copiar'"
                (pressed)="copiar(e, e)"></geo-icon-button>
            </li>
          }
        </ul>
      </geo-form-section>

      <geo-form-section title="O que a sua IA pode fazer" icon="pi pi-shield">
        <div class="guia-copiloto">
          <img src="icons/bussola.svg" alt="" width="40" height="40" />
          <p>A sua IA usa as mesmas consultas da <strong>Bússola</strong> e age sempre como você: enxerga só o que o seu perfil já enxerga no GEO.</p>
        </div>
        <div class="guia-limites">
          <div>
            <h3><i class="pi pi-check-circle" aria-hidden="true"></i>Pode</h3>
            <ul>
              <li>Consultar estoque, solicitações, obras e o que mais o seu perfil acessa.</li>
              <li>Resumir e comparar os dados para você.</li>
              @if (podeEscrever()) { <li>Cadastrar, alterar e aprovar o que espera por você, se você permitir ao conectar.</li> }
            </ul>
          </div>
          <div>
            <h3><i class="pi pi-ban" aria-hidden="true"></i>Não pode</h3>
            <ul>
              <li>Ver o que o seu perfil não vê.</li>
              <li>Cadastrar ou aprovar nada sem a sua permissão.</li>
              <li>Continuar usando o GEO depois que você desconectar.</li>
            </ul>
          </div>
        </div>
      </geo-form-section>

      <p class="geo-sr-only" aria-live="polite">{{ copiado() ? 'Copiado para a área de transferência.' : '' }}</p>

      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Fechar" (pressed)="visivel.set(false)"></geo-button>
      </div>
    </geo-drawer>
  `
})
export class GuiaConectarComponent {
  readonly visivel = model(false);
  readonly endereco = input('');
  readonly erroEndereco = input(false);
  readonly podeEscrever = input(false);
  readonly gerarChave = output<void>();

  protected readonly provedores = PROVEDORES;
  protected readonly abas: GeoTabItem[] = PROVEDORES.map((p) => ({ value: p.id, label: p.nome, icon: p.icone }));
  protected readonly provedor = signal<ProvedorIa>('claude');
  protected readonly copiado = signal<string | null>(null);
  protected exemplos(): string[] {
    return this.podeEscrever() ? [...EXEMPLOS_PERGUNTA, EXEMPLO_CADASTRO] : EXEMPLOS_PERGUNTA;
  }

  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.temporizador));
  }

  protected async copiar(chave: string, texto: string): Promise<void> {
    if (!texto || !(await copiarTexto(texto))) return;
    this.copiado.set(chave);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.copiado.set(null), 2500);
  }
}
