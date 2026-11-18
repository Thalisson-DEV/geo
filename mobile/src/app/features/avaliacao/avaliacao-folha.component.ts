import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  AvaliacaoService,
  FacilidadeAvaliacao,
  ProblemaAvaliacao,
  ROTULO_ESTRELAS,
  ROTULO_FACILIDADE,
  ROTULO_PROBLEMA,
} from '../../core/avaliacao/avaliacao.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { FolhaComponent, IconeComponent } from '../../ui';
import { EstrelasComponent } from './estrelas.component';

const FACILIDADES: FacilidadeAvaliacao[] = ['FACIL', 'RAZOAVEL', 'DIFICIL'];
const PROBLEMAS: ProblemaAvaliacao[] = ['LENTIDAO', 'SINCRONIZACAO', 'LOGIN', 'TELA_TRAVANDO', 'DADO_SUMIU', 'OUTRO'];

/**
 * Formulário da avaliação no app de campo, numa folha que sobe de baixo.
 * Só a nota é obrigatória; o resto é toque em pílula ou texto opcional.
 */
@Component({
  selector: 'app-avaliacao-folha',
  standalone: true,
  imports: [FolhaComponent, IconeComponent, EstrelasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-folha [aberta]="aberta()" (fechar)="fechar()" [titulo]="titulo()" [descricao]="descricao()">
      @if (avaliacao.convite()?.jaRespondeu) {
        <div class="final">
          <span class="ces-selo ces-selo--ok"><ces-icone nome="check" /></span>
          <strong>Obrigado pela sua avaliação!</strong>
          <span>Você já respondeu nesta pesquisa.</span>
        </div>
      } @else if (!avaliacao.convite()) {
        <div class="final">
          <span class="ces-selo"><ces-icone nome="info" /></span>
          <strong>{{ rede.isOnline() ? 'Nenhuma pesquisa aberta agora' : 'Sem internet' }}</strong>
          <span>{{ rede.isOnline() ? 'Quando houver uma pesquisa, ela aparece aqui.' : 'Conecte para ver e responder a pesquisa.' }}</span>
        </div>
      } @else {
        <div class="campos">
          <div class="nota" [class.nota--erro]="tentou() && !estrelas()">
            <ces-estrelas [valor]="estrelas()" (escolher)="escolher($event)" />
            @if (tentou() && !estrelas()) {
              <span class="ces-campo__erro"><ces-icone nome="alerta" [tamanho]="16" />Escolha de 1 a 5 estrelas.</span>
            }
          </div>

          <!-- O resto do formulário fica recolhido no convite e se abre quando a pessoa decide
               responder: a folha cresce no lugar, sem trocar de tela. -->
          <div class="expansao" [class.expansao--aberta]="expandido()" [attr.inert]="expandido() ? null : ''">
          <div class="expansao__dentro">
          <div class="bloco">
            <span class="titulo" id="av-facilidade">Está fácil de usar? <em>opcional</em></span>
            <div class="pilulas" role="radiogroup" aria-labelledby="av-facilidade">
              @for (f of facilidades; track f) {
                <button type="button" role="radio" class="pilula" [attr.aria-checked]="facilidade() === f"
                  (click)="facilidade.set(facilidade() === f ? null : f)">{{ rotuloFacilidade[f] }}</button>
              }
            </div>
          </div>

          <div class="bloco">
            <span class="titulo" id="av-problemas">Algo dá problema com frequência? <em>marque quantos quiser</em></span>
            <div class="pilulas" role="group" aria-labelledby="av-problemas">
              <button type="button" class="pilula" [attr.aria-pressed]="nenhum()" (click)="marcarNenhum()">Nenhum</button>
              @for (p of problemasOpcoes; track p) {
                <button type="button" class="pilula" [attr.aria-pressed]="problemas().includes(p)" (click)="alternar(p)">{{ rotuloProblema[p] }}</button>
              }
            </div>
            @if (problemas().length) {
              <label class="ces-campo">
                <span class="ces-campo__rotulo">Conte o que acontece</span>
                <textarea class="ces-input texto" rows="3" maxlength="1000" [value]="problemaDetalhe()"
                  (input)="problemaDetalhe.set($any($event.target).value)" placeholder="Ex.: demora para enviar as fotos"></textarea>
              </label>
            }
          </div>

          <label class="ces-campo">
            <span class="titulo">Sugestão <em>opcional</em></span>
            <textarea class="ces-input texto" rows="3" maxlength="2000" [value]="sugestao()"
              (input)="sugestao.set($any($event.target).value)" placeholder="O que deixaria o app melhor para você?"></textarea>
          </label>

          <button type="button" role="switch" class="anonima" [attr.aria-checked]="anonima()" (click)="anonima.set(!anonima())">
            <span class="anonima__texto">
              <strong>Enviar sem me identificar</strong>
              <span>{{ anonima() ? 'Seu nome não vai junto. Só fica registrado que você já respondeu.' : 'A resposta vai com o seu nome.' }}</span>
            </span>
            <span class="trilho" aria-hidden="true"><span></span></span>
          </button>

          @if (!rede.isOnline()) {
            <p class="aviso"><ces-icone nome="alerta" [tamanho]="18" />Sem internet. A avaliação só é enviada com conexão; o que você preencheu continua aqui.</p>
          }
          </div>
          </div>
        </div>
      }

      <div rodape class="rodape-area">
        @if (podeResponder() && !expandido()) {
          <div class="ces-folha-rodape rodape">
            <button type="button" class="ces-btn ces-btn--neutro" (click)="avaliacao.adiar()">Responder depois</button>
            <button type="button" class="ces-btn ces-btn--principal" (click)="avaliacao.abrir(estrelas())">Avaliar agora</button>
          </div>
          @if (avaliacao.convite()?.ultimaVez) {
            <button type="button" class="recusar" (click)="avaliacao.recusar()">Não quero responder</button>
          }
        } @else if (podeResponder()) {
          <div class="ces-folha-rodape rodape">
            <button type="button" class="ces-btn ces-btn--neutro" (click)="fechar()" [disabled]="enviando()">Cancelar</button>
            <button type="button" class="ces-btn ces-btn--principal" (click)="enviar()" [disabled]="enviando() || !rede.isOnline()">
              {{ enviando() ? 'Enviando…' : 'Enviar avaliação' }}
            </button>
          </div>
        } @else {
          <div class="ces-folha-rodape rodape">
            <button type="button" class="ces-btn ces-btn--neutro" (click)="fechar()">Fechar</button>
          </div>
        }
      </div>
    </ces-folha>
  `,
  styles: [`
    .campos { display: grid; gap: var(--ces-e5, 24px); padding: var(--ces-e1) var(--ces-e4) var(--ces-e2); }
    .bloco { display: grid; gap: var(--ces-e3); }
    .titulo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font: 600 .9375rem/1.3 var(--ces-fonte); color: var(--ces-texto); }
    .titulo em { font: var(--ces-t-apoio); font-style: normal; color: var(--ces-texto-2); }

    /* A nota abre a folha, em destaque: é a única pergunta obrigatória. */
    /* Crescer no lugar: 0fr → 1fr anima a altura real do conteúdo, e a folha (presa embaixo) sobe junto. */
    .expansao { display: grid; grid-template-rows: 0fr; opacity: 0; margin-top: calc(var(--ces-e5, 24px) * -1);
      transition: grid-template-rows 360ms var(--ces-curva), opacity 240ms ease, margin-top 360ms var(--ces-curva); }
    .expansao--aberta { grid-template-rows: 1fr; opacity: 1; margin-top: 0; }
    .expansao__dentro { display: grid; gap: var(--ces-e5, 24px); min-height: 0; overflow: hidden; }
    .rodape-area { display: grid; }
    .recusar { justify-self: center; min-height: 40px; margin-top: var(--ces-e1); padding: 0 var(--ces-e3); border: 0; background: none;
      font: var(--ces-t-apoio); color: var(--ces-texto-2); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
    .nota { display: grid; justify-items: center; gap: var(--ces-e2); padding: var(--ces-e4) var(--ces-e3);
      border-radius: var(--ces-r-grupo); background: var(--ces-superficie-2); }
    .nota--erro { box-shadow: inset 0 0 0 1.5px var(--ces-erro); }

    .pilulas { display: flex; flex-wrap: wrap; gap: var(--ces-e2); }
    .pilula { min-height: 44px; padding: 0 16px; border-radius: var(--ces-r-pilula); border: 1.5px solid var(--ces-linha);
      background: var(--ces-superficie); color: var(--ces-texto); font: 500 .9375rem/1 var(--ces-fonte); cursor: pointer;
      -webkit-tap-highlight-color: transparent; transition: background-color var(--ces-m-entrar), border-color var(--ces-m-entrar); }
    .pilula:active { transform: scale(.97); }
    .pilula[aria-checked='true'], .pilula[aria-pressed='true'] { border-color: var(--ces-destaque); background: var(--ces-destaque-suave);
      color: var(--ces-destaque); font-weight: 600; }
    .pilula:focus-visible, .anonima:focus-visible { outline: 2px solid var(--ces-destaque); outline-offset: 2px; }
    .texto { min-height: 88px; padding: var(--ces-e3) var(--ces-e4); resize: vertical; }

    .anonima { display: flex; align-items: center; gap: var(--ces-e3); width: 100%; padding: var(--ces-e3) var(--ces-e4); text-align: left;
      border: 0; border-radius: var(--ces-r-grupo); background: var(--ces-superficie-2); color: inherit; font: inherit; cursor: pointer; }
    .anonima__texto { flex: 1; display: grid; gap: 2px; }
    .anonima__texto strong { font: var(--ces-t-corpo-forte); }
    .anonima__texto span { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .trilho { width: 48px; height: 28px; border-radius: 14px; background: var(--ces-linha-forte); position: relative; flex: none; transition: background-color var(--ces-m-entrar); }
    .trilho span { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform var(--ces-m-entrar) var(--ces-curva); }
    [aria-checked='true'] .trilho { background: var(--ces-destaque); }
    [aria-checked='true'] .trilho span { transform: translateX(20px); }

    .aviso { display: flex; gap: var(--ces-e2); align-items: flex-start; margin: 0; padding: var(--ces-e3) var(--ces-e4);
      border-radius: var(--ces-r-grupo); background: var(--ces-atencao-suave); font: var(--ces-t-apoio); }
    .final { display: grid; justify-items: center; gap: var(--ces-e2); padding: var(--ces-e4) var(--ces-e4) var(--ces-e5); text-align: center; }
    .final strong { font: var(--ces-t-corpo-forte); }
    .final span:last-child { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .rodape { display: flex; gap: var(--ces-e3); padding: var(--ces-e3) var(--ces-e4) 0; }
    .rodape .ces-btn { flex: 1; min-height: var(--ces-alvo-principal); }
    @media (prefers-reduced-motion: reduce) {
      .pilula, .expansao { transition: none; }
      .pilula:active { transform: none; }
    }
  `],
})
export class AvaliacaoFolhaComponent {
  protected readonly avaliacao = inject(AvaliacaoService);
  protected readonly rede = inject(ConnectivityService);
  private readonly toast = inject(ToastService);

  protected readonly facilidades = FACILIDADES;
  protected readonly problemasOpcoes = PROBLEMAS;
  protected readonly rotuloEstrelas = ROTULO_ESTRELAS;
  protected readonly rotuloFacilidade = ROTULO_FACILIDADE;
  protected readonly rotuloProblema = ROTULO_PROBLEMA;

  protected readonly estrelas = signal<number | null>(null);
  protected readonly facilidade = signal<FacilidadeAvaliacao | null>(null);
  protected readonly problemas = signal<ProblemaAvaliacao[]>([]);
  protected readonly nenhum = signal(false);
  protected readonly problemaDetalhe = signal('');
  protected readonly sugestao = signal('');
  protected readonly anonima = signal(false);
  protected readonly tentou = signal(false);
  protected readonly enviando = signal(false);

  /** A folha está no ar: o convite pequeno ou o formulário completo. */
  protected readonly aberta = computed(() => this.avaliacao.folhaAberta() || this.avaliacao.mostrarConvite());
  /** Formulário completo; falso = só o convite (pergunta, estrelas e dois botões). */
  protected readonly expandido = computed(() => this.avaliacao.folhaAberta());

  protected readonly titulo = computed(() =>
    this.avaliacao.convite()?.jaRespondeu || !this.avaliacao.convite() ? 'Avaliar o app' : 'Como está sendo usar o app?'
  );
  protected readonly descricao = computed(() => {
    if (!this.podeResponder()) return null;
    return this.expandido() ? 'Só a nota é obrigatória. O resto, se quiser contar.' : 'Leva menos de um minuto e ajuda a deixar o app mais fácil para todo mundo.';
  });

  protected readonly podeResponder = computed(() => !!this.avaliacao.convite() && !this.avaliacao.convite()!.jaRespondeu);

  constructor() {
    effect(() => {
      if (!this.avaliacao.folhaAberta()) return;
      const inicial = this.avaliacao.estrelasIniciais();
      untracked(() => {
        this.estrelas.set(inicial);
        this.facilidade.set(null);
        this.problemas.set([]);
        this.nenhum.set(false);
        this.problemaDetalhe.set('');
        this.sugestao.set('');
        this.anonima.set(false);
        this.tentou.set(false);
      });
    });
  }

  protected alternar(p: ProblemaAvaliacao): void {
    this.nenhum.set(false);
    this.problemas.update((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));
  }

  protected marcarNenhum(): void {
    this.nenhum.update((v) => !v);
    this.problemas.set([]);
    this.problemaDetalhe.set('');
  }

  /** No convite, tocar numa estrela já é começar a responder: a folha cresce com a nota marcada. */
  protected escolher(n: number): void {
    if (this.expandido()) this.estrelas.set(n);
    else this.avaliacao.abrir(n);
  }

  /** Véu, voltar do Android ou arrastar para baixo: no convite vale "responder depois". */
  protected fechar(): void {
    if (this.enviando()) return;
    if (this.expandido()) this.avaliacao.fecharFormulario();
    else void this.avaliacao.adiar();
  }

  protected async enviar(): Promise<void> {
    this.tentou.set(true);
    const estrelas = this.estrelas();
    if (!estrelas || this.enviando()) return;
    this.enviando.set(true);
    try {
      await this.avaliacao.responder({
        estrelas,
        facilidade: this.facilidade(),
        problemas: this.problemas(),
        problemaDetalhe: this.problemaDetalhe().trim() || null,
        sugestao: this.sugestao().trim() || null,
        anonima: this.anonima(),
      });
      this.avaliacao.folhaAberta.set(false);
      this.toast.success('Obrigado! Sua avaliação foi enviada.');
    } catch (erro) {
      const detalhe = erro instanceof HttpErrorResponse ? erro.error?.detail : null;
      this.toast.error(detalhe || 'Não foi possível enviar agora. Tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }
}
