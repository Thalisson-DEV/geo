import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import {
  GeoButtonComponent,
  GeoIconButtonComponent,
  GeoIconComponent,
  GeoLogoComponent,
  GeoMapaCampoComponent,
} from '@geo/ui';
import { GeoPasswordInputComponent, GeoTextInputComponent } from '@geo/ui/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LoginRequest } from '../../../core/models/auth.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { environment } from '../../../../environments/environment';

/**
 * Entrada do GEO: painel da marca com o mapa de campo (faixa no topo no celular e no tablet em pé)
 * e o formulário.
 * O erro do login aparece no próprio formulário, perto do botão, e não em aviso flutuante.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    GeoButtonComponent,
    GeoIconButtonComponent,
    GeoIconComponent,
    GeoLogoComponent,
    GeoMapaCampoComponent,
    GeoPasswordInputComponent,
    GeoTextInputComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sem encapsulamento para dar aos campos do formulário a altura de toque da entrada; tudo sob .geo-login.
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="geo-login">
      <aside class="geo-login__marca" aria-label="Sobre o GEO">
        <geo-mapa-campo class="geo-login__mapa" alinhamento="xMidYMin" />

        <div class="geo-login__identidade">
          <geo-logo size="2.25rem" label="GEO" />
          <div>
            <strong>GEO</strong>
            <span>Gestão de Equipes e Operações</span>
          </div>
        </div>

        <div class="geo-login__manchete">
          <p class="geo-login__titulo-marca">A operação inteira, do campo ao escritório.</p>
          <ul>
            <li>
              <geo-icon name="wifi-off" size="sm" />
              <span>Funciona sem sinal: o que a equipe lança fica no aparelho e sobe quando a conexão volta.</span>
            </li>
            <li>
              <geo-icon name="compass" size="sm" />
              <span>A Bússola responde sobre obras, estoque e equipes em linguagem simples.</span>
            </li>
            <li>
              <geo-icon name="shield-check" size="sm" />
              <span>Cada pessoa vê só o que o perfil dela permite.</span>
            </li>
          </ul>
        </div>

        <dl class="geo-login__legenda" aria-label="Legenda do mapa">
          <div><dt><span class="geo-login__simbolo geo-login__simbolo--equipe"></span></dt><dd>Equipe em campo</dd></div>
          <div><dt><span class="geo-login__simbolo geo-login__simbolo--rede"></span></dt><dd>Rede construída</dd></div>
          <div><dt><span class="geo-login__simbolo geo-login__simbolo--programada"></span></dt><dd>Programada</dd></div>
        </dl>
      </aside>

      <main class="geo-login__lado">
        <div class="geo-login__topo">
          <geo-icon-button
            variant="outline"
            [icon]="tema.isDarkMode() ? 'sun' : 'moon'"
            [label]="tema.isDarkMode() ? 'Usar tema claro' : 'Usar tema escuro'"
            tooltipPosition="left"
            (pressed)="tema.setDarkMode(!tema.isDarkMode())"
          />
        </div>

        <section class="geo-login__cartao" aria-labelledby="geo-login-titulo">
          <h1 id="geo-login-titulo">Entrar</h1>
          <p class="geo-login__subtitulo">Use o usuário e a senha que você recebeu.</p>

          @if (reautenticando) {
            <p class="geo-login__aviso geo-login__aviso--info" role="status">
              <geo-icon name="info" size="sm" />
              <span>Sua sessão terminou no servidor. Entre de novo para enviar os lançamentos que estão salvos neste aparelho.</span>
            </p>
          }

          <form class="geo-login__form" novalidate (submit)="entrar($event)">
            <geo-text-input
              label="Usuário"
              inputId="login"
              placeholder="Ex.: USR123456"
              autocomplete="username"
              [value]="login()"
              (valueChange)="definirLogin($event)"
              [error]="erroLogin()"
              [required]="true"
            />
            <geo-password-input
              label="Senha"
              inputId="senha"
              autocomplete="current-password"
              [value]="senha()"
              (valueChange)="senha.set($event); erro.set(null)"
              [error]="erroSenha()"
              [required]="true"
            />

            @if (erro(); as mensagem) {
              <p class="geo-login__aviso geo-login__aviso--erro" role="alert">
                <geo-icon name="circle-alert" size="sm" />
                <span>{{ mensagem }}</span>
              </p>
            }

            <geo-button
              type="submit"
              label="Entrar"
              icon="log-in"
              iconPosition="right"
              size="lg"
              [fluid]="true"
              [loading]="entrando()"
            />
          </form>

          @if (conectado()) {
            <p class="geo-login__nota">
              <geo-icon name="wifi-off" size="sm" />
              <span>Depois do primeiro acesso, o GEO abre neste aparelho mesmo sem sinal.</span>
            </p>
          } @else {
            <p class="geo-login__aviso geo-login__aviso--alerta" role="status">
              <geo-icon name="wifi-off" size="sm" />
              <span>Sem conexão. Para entrar, o GEO precisa de internet; depois disso ele abre mesmo sem sinal.</span>
            </p>
          }

          @if (statusConfigurado) {
            <button type="button" class="geo-login__status" (click)="abrirStatus()">
              <geo-icon name="activity" size="sm" />
              Status do sistema
            </button>
          }

          <nav class="geo-login__legal" aria-label="Documentos legais">
            <a routerLink="/privacidade">Política de privacidade</a>
            <a routerLink="/termos">Termos de uso</a>
          </nav>
        </section>
      </main>
    </div>
  `,
  styles: `
    app-login { display: block; min-block-size: 100dvh; background: var(--geo-canvas); }

    .geo-login { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; min-block-size: 100dvh; }
    @media (min-width: 1024px) {
      .geo-login { grid-template-columns: minmax(28rem, 1fr) minmax(0, 1fr); grid-template-rows: none; }
    }

    /*
     * Painel da marca: azul profundo da marca com o mapa de campo ao fundo. No celular e no tablet
     * em pé vira uma faixa no topo, com a marca e a manchete; a lista e a legenda ficam para a tela larga.
     */
    .geo-login__marca {
      --marca-fundo: var(--p-blue-950);
      --marca-texto: var(--p-blue-50);
      --marca-suave: var(--p-blue-200);
      position: relative; isolation: isolate; display: flex; flex-direction: column; 
      gap: 1.5rem; overflow: hidden; min-block-size: 12.5rem; padding: 1.25rem 1.25rem 1.5rem;
      background: var(--marca-fundo); color: var(--marca-suave);
    }
    @media (min-width: 640px) { .geo-login__marca { min-block-size: 15rem; padding: 1.5rem 2rem 1.75rem; } }
    @media (min-width: 1024px) { .geo-login__marca { gap: 2.5rem; padding: clamp(2rem, 4vw, 3.5rem); } }

    .geo-login__mapa {
      position: absolute; inset: 0; z-index: -1;
      color: color-mix(in srgb, var(--p-blue-300) 42%, transparent);
      --geo-mapa-rede: var(--p-blue-200);
      --geo-mapa-fundo: var(--marca-fundo);
    }
    /* Véu sob o texto: o mapa aparece inteiro no alto e esmaece onde a manchete se apoia. */
    .geo-login__marca::after {
      content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      background: linear-gradient(to top, var(--marca-fundo) 22%, color-mix(in srgb, var(--marca-fundo) 55%, transparent) 48%, transparent 66%);
    }

    /* Na faixa (tela estreita) o mapa fica quadrado e sobe, para a rede e as equipes entrarem no recorte. */
    @media (max-width: 1023.98px) {
      .geo-login__mapa { inset: 0 0 auto 30%; block-size: auto; aspect-ratio: 1; translate: 0 -16%; }
      .geo-login__marca::after { background: linear-gradient(to right, var(--marca-fundo) 28%, transparent 62%); }
    }
    .geo-login__identidade { display: flex; align-items: center; gap: 0.75rem; color: var(--marca-texto); }
    .geo-login__identidade div { display: flex; flex-direction: column; line-height: 1.25; }
    .geo-login__identidade strong { font-size: var(--geo-text-title-3); font-weight: var(--geo-font-weight-semibold); }
    .geo-login__identidade span { color: var(--marca-suave); font-size: var(--geo-text-body-sm); }

    .geo-login__manchete { max-inline-size: 32rem; margin-block-start: auto; }
    .geo-login__titulo-marca {
      margin: 0; color: var(--marca-texto);
      font-size: clamp(1.5rem, 1.1rem + 1.6vw, 2.5rem); font-weight: var(--geo-font-weight-semibold);
      line-height: 1.12; letter-spacing: -0.025em; text-wrap: balance;
    }
    .geo-login__manchete ul { display: none; gap: 0.75rem; margin: 1.75rem 0 0; padding: 0; list-style: none; }
    .geo-login__manchete li { display: flex; align-items: flex-start; gap: 0.75rem; max-inline-size: 26rem; font-size: var(--geo-text-body); line-height: 1.5; }
    .geo-login__manchete li geo-icon { flex: none; margin-block-start: 0.2rem; color: var(--p-amber-300); }

    .geo-login__legenda { display: none; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 0; font-size: var(--geo-text-caption); }
    .geo-login__legenda div { display: flex; align-items: center; gap: 0.5rem; }
    .geo-login__legenda dt, .geo-login__legenda dd { margin: 0; display: flex; }
    .geo-login__simbolo { display: inline-block; }
    .geo-login__simbolo--equipe { inline-size: 0.5rem; block-size: 0.5rem; border-radius: 50%; background: var(--p-amber-400); }
    .geo-login__simbolo--rede { inline-size: 1.25rem; border-block-start: 2px solid var(--p-blue-200); }
    .geo-login__simbolo--programada { inline-size: 1.25rem; border-block-start: 2px dotted var(--p-blue-200); }

    @media (min-width: 1024px) {
      .geo-login__manchete ul { display: grid; }
      .geo-login__legenda { display: flex; }
    }

    /* Lado do formulário: quieto, para a atenção ir aos campos. */
    .geo-login__lado { display: flex; flex-direction: column; min-inline-size: 0; padding: 1rem; }
    @media (min-width: 640px) { .geo-login__lado { padding: 1.5rem 2rem; } }
    .geo-login__topo { display: flex; justify-content: flex-end; }
    /* Tela estreita: o botão de tema sobe para o canto da faixa e o formulário começa logo abaixo dela. */
    @media (max-width: 1023.98px) {
      .geo-login__topo { position: absolute; inset-block-start: 1rem; inset-inline-end: 1rem; }
      .geo-login__lado .geo-login__cartao { margin: 0 auto; padding-block-start: 1rem; }
    }

    .geo-login__cartao {
      box-sizing: border-box; inline-size: 100%; max-inline-size: 24rem; margin: auto; padding-block: 1.5rem 2.5rem;
      animation: geo-rise-in var(--geo-motion-slow) var(--geo-ease-out) 0.15s both;
    }
    :root[data-motion='reduced'] .geo-login__cartao { animation: none; }
    @media (prefers-reduced-motion: reduce) { .geo-login__cartao { animation: none; } }

    .geo-login__cartao h1 {
      margin: 0; color: var(--geo-foreground);
      font-size: 1.75rem; font-weight: var(--geo-font-weight-semibold); line-height: 1.15; letter-spacing: -0.02em;
    }
    .geo-login__subtitulo { margin: 0.5rem 0 2rem; color: var(--geo-foreground-muted); font-size: var(--geo-text-body); }
    .geo-login__form { display: grid; gap: 1.125rem; }
    .geo-login__form input { min-block-size: 2.75rem; font-size: var(--geo-text-body); }
    .geo-login__form geo-button { margin-block-start: 0.5rem; }

    .geo-login__aviso {
      display: flex; align-items: flex-start; gap: 0.625rem; margin: 0 0 1.25rem; padding: 0.75rem 0.875rem;
      border: 1px solid; border-radius: var(--geo-radius-md); font-size: var(--geo-text-body-sm); line-height: 1.45;
    }
    .geo-login__aviso geo-icon { flex: none; margin-block-start: 0.1rem; }
    .geo-login__form .geo-login__aviso { margin: 0; }
    .geo-login__aviso--info { border-color: var(--geo-border); background: var(--geo-info-soft); color: var(--geo-info-text); }
    .geo-login__aviso--erro { border-color: var(--geo-danger-border); background: var(--geo-danger-soft); color: var(--geo-danger-text); }
    .geo-login__aviso--alerta { margin: 1.5rem 0 0; border-color: var(--geo-warning-border); background: var(--geo-warning-soft); color: var(--geo-warning-text); }

    .geo-login__nota { display: flex; align-items: flex-start; gap: 0.5rem; margin: 1.5rem 0 0; color: var(--geo-foreground-subtle); font-size: var(--geo-text-body-sm); line-height: 1.45; }
    .geo-login__nota geo-icon { flex: none; margin-block-start: 0.1rem; }

    .geo-login__legal {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 1rem; margin-block-start: 1.5rem; padding-block-start: 1rem;
      border-block-start: 1px solid var(--geo-border); font-size: var(--geo-text-caption);
    }
    .geo-login__legal a, .geo-login__status { color: var(--geo-foreground-muted); text-decoration: none; }
    .geo-login__status { display: inline-flex; margin-block-start: 1rem; align-items: center; gap: 0.375rem; padding: 0; border: 0; background: transparent; font: inherit; font-size: var(--geo-text-body-sm); cursor: pointer; }
    .geo-login__legal a:hover, .geo-login__status:hover { color: var(--geo-brand-text); text-decoration: underline; }
    .geo-login__legal a:focus-visible, .geo-login__status:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; border-radius: var(--geo-radius-sm); }
  `,
})
export class LoginComponent {
  protected readonly tema = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly conectividade = inject(ConnectivityService);

  protected readonly ano = new Date().getFullYear();
  protected readonly conectado = computed(() => this.conectividade.isOnline());
  protected readonly reautenticando = this.auth.reautenticacaoNecessaria();
  protected readonly statusConfigurado = environment.statusPageUrl.length > 0;

  protected readonly login = signal(this.reautenticando ? (this.auth.currentUser()?.login ?? '') : '');
  protected readonly senha = signal('');
  protected readonly entrando = signal(false);
  protected readonly erro = signal<string | null>(null);
  private readonly tentou = signal(false);

  protected readonly erroLogin = computed(() => {
    if (!this.tentou()) return undefined;
    const valor = this.login().trim();
    if (!valor) return 'Informe o usuário.';
    return valor.length < 6 ? 'O usuário tem pelo menos 6 caracteres, como USR123456.' : undefined;
  });
  protected readonly erroSenha = computed(() => {
    if (!this.tentou()) return undefined;
    const valor = this.senha();
    if (!valor) return 'Informe a senha.';
    return valor.length < 4 ? 'A senha tem pelo menos 4 caracteres.' : undefined;
  });

  protected definirLogin(valor: string): void {
    this.login.set(valor.toUpperCase());
    this.erro.set(null);
  }

  protected abrirStatus(): void {
    if (environment.statusPageUrl) window.open(environment.statusPageUrl, '_blank', 'noopener,noreferrer');
  }

  protected entrar(evento: Event): void {
    evento.preventDefault();
    this.tentou.set(true);
    if (this.entrando() || this.erroLogin() || this.erroSenha()) return;

    this.entrando.set(true);
    this.erro.set(null);
    const credenciais: LoginRequest = { login: this.login().trim(), senha: this.senha() };
    this.auth.login(credenciais).subscribe({
      next: () => this.entrando.set(false),
      error: (err) => {
        this.entrando.set(false);
        this.erro.set(mensagemDeErroDoLogin(err));
      },
    });
  }
}

/** Texto do erro do login, no guia de voz: o que houve e o que fazer. */
export function mensagemDeErroDoLogin(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  if (status === 0) return 'Sem conexão com o servidor. Para entrar, o GEO precisa de internet; tente quando houver sinal.';
  if (status === 429) return `Muitas tentativas seguidas. ${getErrorMessage(err)}`;
  if (status === 401 || status === 400) return 'Usuário ou senha não conferem. Confira e tente de novo.';
  if (status && status >= 500) return 'O servidor não respondeu agora. Tente de novo em alguns minutos.';
  return getErrorMessage(err);
}
