import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { ChaveIaCriada } from '../../../core/models/conexoes-ia.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ConexoesIaService } from '../../../core/services/conexoes-ia.service';
import { copiarTexto } from './conectar-ia.util';

/**
 * Gera uma chave de acesso para assistentes que pedem chave em vez do login. A chave aparece uma
 * única vez, no mesmo painel, com o botão de copiar.
 */
@Component({
  selector: 'app-chave-acesso-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoSelectComponent,
    GeoTextInputComponent
  ],
  styles: `
    .chave-copiar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.5rem; }
    .chave-copiar geo-text-input { flex: 1 1 16rem; min-width: 0; }
    .chave-uso { display: grid; gap: 0.5rem; margin: 0; padding-left: 1.25rem; list-style: decimal; color: var(--geo-foreground); line-height: 1.55; }
  `,
  template: `
    <geo-form-drawer #drawer [(visible)]="visivel" [title]="criada() ? 'Chave de acesso criada' : 'Gerar chave de acesso'"
      [description]="criada() ? criada()!.conexao.nome : 'Para assistentes que pedem uma chave em vez do seu login.'"
      [dirty]="pendente()" [loading]="salvando()" [discardMessage]="aviso()" size="md" (closed)="limpar()">
      @if (criada(); as c) {
        <geo-form-section title="Sua chave" icon="pi pi-key">
          <div class="geo-form-stack">
            <geo-callout tone="warning" icon="pi pi-exclamation-triangle" title="Copie agora">
              Por segurança, a chave aparece só desta vez. Se perder, é só gerar outra.
            </geo-callout>
            <div class="chave-copiar">
              <geo-text-input label="Chave de acesso" [labelVisible]="false" [readonly]="true" [value]="c.chave"></geo-text-input>
              <geo-button [variant]="copiada() ? 'success' : 'primary'" [icon]="copiada() ? 'pi pi-check' : 'pi pi-copy'"
                [label]="copiada() ? 'Copiada' : 'Copiar chave'" (pressed)="copiar(c.chave)"></geo-button>
            </div>
            <p class="geo-sr-only" aria-live="polite">{{ copiada() ? 'Chave copiada para a área de transferência.' : '' }}</p>
          </div>
        </geo-form-section>
        <geo-form-section title="Como usar" icon="pi pi-list-check">
          <ol class="chave-uso">
            <li>No seu assistente, adicione o GEO com o endereço <strong>{{ endereco() }}</strong>.</li>
            <li>Quando ele pedir a chave, cole a que você copiou.</li>
            <li>Se ele pedir o nome do campo, use <strong>Authorization</strong> e escreva <strong>Bearer</strong> e um espaço antes da chave.</li>
          </ol>
        </geo-form-section>
      } @else {
        <geo-form-section title="Sobre a chave" icon="pi pi-key"
          description="Claude e ChatGPT conectam pelo seu login e não precisam de chave.">
          <div class="geo-form-stack">
            <geo-text-input label="Nome" [required]="true" [(value)]="nome" [maxlength]="80"
              placeholder="Ex.: Cursor do notebook" description="Para você reconhecer depois na lista." [error]="erroNome()"></geo-text-input>
            <div class="geo-form-grid">
              <geo-select label="O que pode fazer" [options]="permissoes()" [(value)]="escrita"
                [description]="podeEscrever() ? (escrita() ? 'O assistente vai poder consultar, cadastrar, alterar e aprovar.' : 'O assistente só lê e responde; não cadastra nem aprova nada.') : 'O seu perfil só permite consultar.'"></geo-select>
              <geo-select label="Vale por" [options]="validades" [(value)]="validade"></geo-select>
            </div>
          </div>
        </geo-form-section>
      }

      <div drawer-footer class="geo-actions-row">
        @if (criada()) {
          <geo-button icon="pi pi-check" label="Concluir" (pressed)="drawer.requestClose()"></geo-button>
        } @else {
          <geo-button variant="ghost" label="Cancelar" [disabled]="salvando()" (pressed)="drawer.requestClose()"></geo-button>
          <geo-button icon="pi pi-key" label="Gerar chave" [loading]="salvando()" (pressed)="gerar()"></geo-button>
        }
      </div>
    </geo-form-drawer>
  `
})
export class ChaveAcessoDrawerComponent {
  private readonly service = inject(ConexoesIaService);
  private readonly notificacao = inject(NotificationService);

  readonly visivel = model(false);
  readonly endereco = input('');
  readonly podeEscrever = input(false);
  readonly criou = output<void>();

  protected readonly nome = signal('');
  protected readonly escrita = signal<boolean | null>(false);
  protected readonly validade = signal<number | null>(90);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly criada = signal<ChaveIaCriada | null>(null);
  protected readonly copiada = signal(false);

  protected readonly permissoes = computed<GeoSelectOption<boolean>[]>(() => [
    { label: 'Só consultar', value: false },
    ...(this.podeEscrever() ? [{ label: 'Consultar, cadastrar e aprovar', value: true }] : [])
  ]);
  protected readonly validades: GeoSelectOption<number>[] = [
    { label: '30 dias', value: 30 },
    { label: '90 dias', value: 90 },
    { label: '6 meses', value: 180 },
    { label: '1 ano', value: 365 }
  ];
  protected readonly erroNome = computed(() => (this.tentou() && !this.nome().trim() ? 'Dê um nome para a chave.' : undefined));
  protected readonly pendente = computed(() => (this.criada() ? !this.copiada() : !!this.nome().trim()));
  protected readonly aviso = computed(() =>
    this.criada() ? 'Você ainda não copiou a chave. Depois de fechar, ela não aparece de novo.' : 'O que você preencheu será perdido.'
  );

  constructor() {
    effect(() => {
      if (this.visivel() && !this.criada()) this.tentou.set(false);
    });
  }

  protected gerar(): void {
    this.tentou.set(true);
    if (this.erroNome()) return;
    this.salvando.set(true);
    this.service
      .criarChave({ nome: this.nome().trim(), permiteEscrita: !!this.escrita(), validadeDias: this.validade() ?? 90 })
      .subscribe({
        next: (criada) => {
          this.salvando.set(false);
          this.criada.set(criada);
          this.criou.emit();
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacao.error(getErrorMessage(e));
        }
      });
  }

  protected async copiar(chave: string): Promise<void> {
    if (await copiarTexto(chave)) this.copiada.set(true);
  }

  protected limpar(): void {
    this.nome.set('');
    this.escrita.set(false);
    this.validade.set(90);
    this.tentou.set(false);
    this.criada.set(null);
    this.copiada.set(false);
  }
}
