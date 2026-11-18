import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CesBooleanControlComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesFormDrawerComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import {
  FacilidadeAvaliacao,
  ProblemaAvaliacao,
  ROTULO_ESTRELAS,
  ROTULO_FACILIDADE,
  ROTULO_PROBLEMA
} from '../../../core/models/avaliacao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AvaliacaoConviteService } from '../../../core/services/avaliacao-convite.service';
import { AvaliacaoService } from '../../../core/services/avaliacao.service';
import { ConnectivityService } from '../../../core/services/connectivity.service';
import { VersaoAppService } from '../../../core/services/versao-app.service';
import { EstrelasAvaliacaoComponent } from './estrelas-avaliacao.component';

const FACILIDADES: FacilidadeAvaliacao[] = ['FACIL', 'RAZOAVEL', 'DIFICIL'];
const PROBLEMAS: ProblemaAvaliacao[] = ['LENTIDAO', 'SINCRONIZACAO', 'LOGIN', 'TELA_TRAVANDO', 'DADO_SUMIU', 'OUTRO'];

/**
 * O formulário da avaliação do GEO.
 *
 * <p>Só a nota é obrigatória: quem quer dizer só "está bom" responde em um toque, e quem
 * tem o que contar encontra onde. A escolha "enviar sem me identificar" explica o que
 * acontece de verdade — o nome não vai junto, e só fica registrado que a pessoa já
 * respondeu, para não ser perguntada de novo.</p>
 */
@Component({
  selector: 'app-avaliacao-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstrelasAvaliacaoComponent, CesBooleanControlComponent, CesButtonComponent, CesCalloutComponent, CesFormDrawerComponent, CesTextareaComponent],
  styleUrls: ['../../../features/almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao.css'],
  styles: `
    .av-nota { padding-block: 1.25rem 1rem; }
    .av-erro { margin: 0; text-align: center; font-size: var(--ces-font-caption); color: var(--ces-danger-text); }
    .av-agradecimento {
      display: grid; justify-items: center; gap: 0.75rem; padding: 2.5rem 1rem; text-align: center;
    }
    .av-agradecimento__icone {
      display: inline-flex; align-items: center; justify-content: center; width: 3.5rem; height: 3.5rem;
      border-radius: 999px; background: var(--ces-success-soft); color: var(--ces-success-text); font-size: 1.5rem;
    }
    .av-agradecimento h3 { margin: 0; font-size: var(--ces-font-body); font-weight: 700; color: var(--ces-foreground); }
    .av-agradecimento p { margin: 0; max-width: 22rem; font-size: var(--ces-font-caption); line-height: 1.6; color: var(--ces-foreground-muted); }
  `,
  template: `
    <ces-form-drawer
      [visible]="convite.formularioAberto()"
      (visibleChange)="convite.formularioAberto.set($event)"
      title="Avaliar o GEO"
      description="Conte o que você achou do sistema. Leva menos de um minuto."
      size="md"
      [dirty]="alterado() && !enviando()"
    >
      @if (jaRespondeu()) {
        <div class="av-agradecimento">
          <span class="av-agradecimento__icone" aria-hidden="true"><i class="pi pi-heart-fill"></i></span>
          <h3>Obrigado pela sua avaliação!</h3>
          <p>Você já respondeu nesta pesquisa. Suas respostas ajudam a decidir o que melhorar primeiro.</p>
        </div>
      } @else if (!convite.convite()) {
        <div class="av-agradecimento">
          <span class="av-agradecimento__icone" aria-hidden="true"><i class="pi pi-calendar-times"></i></span>
          <h3>Nenhuma pesquisa aberta agora</h3>
          <p>Quando houver uma nova pesquisa de avaliação, ela aparece aqui.</p>
        </div>
      } @else {
        <div class="ns">
          <section class="ns-secao" aria-labelledby="av-sec-nota">
            <h3 id="av-sec-nota" class="ns-secao__titulo"><i class="pi pi-star" aria-hidden="true"></i>Sua nota</h3>
            <div class="ns-cartao av-nota">
              <app-estrelas-avaliacao [valor]="estrelas()" (escolher)="estrelas.set($event)" />
              @if (tentou() && !estrelas()) {
                <p class="av-erro" role="alert">Escolha de 1 a 5 estrelas.</p>
              }
            </div>
          </section>

          <section class="ns-secao" aria-labelledby="av-sec-facilidade">
            <div class="ns-secao__topo">
              <h3 id="av-sec-facilidade" class="ns-secao__titulo"><i class="pi pi-compass" aria-hidden="true"></i>Está fácil de usar?</h3>
              <span class="ns-secao__dica">Opcional</span>
            </div>
            <div class="ns-pilulas" role="radiogroup" aria-labelledby="av-sec-facilidade">
              @for (f of facilidades; track f) {
                <button type="button" role="radio" class="ns-pilula" [attr.aria-checked]="facilidade() === f"
                  (click)="facilidade.set(facilidade() === f ? null : f)">{{ rotuloFacilidade[f] }}</button>
              }
            </div>
          </section>

          <section class="ns-secao" aria-labelledby="av-sec-problemas">
            <div class="ns-secao__topo">
              <h3 id="av-sec-problemas" class="ns-secao__titulo"><i class="pi pi-exclamation-circle" aria-hidden="true"></i>Algo dá problema com frequência?</h3>
              <span class="ns-secao__dica">Marque quantos quiser</span>
            </div>
            <div class="ns-pilulas" role="group" aria-labelledby="av-sec-problemas">
              <button type="button" class="ns-pilula" [attr.aria-pressed]="nenhumProblema()" (click)="marcarNenhum()">Nenhum</button>
              @for (p of problemasOpcoes; track p) {
                <button type="button" class="ns-pilula" [attr.aria-pressed]="problemas().includes(p)" (click)="alternarProblema(p)">
                  {{ rotuloProblema[p] }}
                </button>
              }
            </div>
            @if (problemas().length) {
              <ces-textarea
                label="Detalhes"
                placeholder="Conte o que acontece. Ex.: a lista de notas demora para abrir de manhã"
                [value]="problemaDetalhe()"
                (valueChange)="problemaDetalhe.set($event)"
                [rows]="3"
                [maxlength]="1000"
                  [showOptional]="true"
              />
            }
          </section>

          <section class="ns-secao" aria-labelledby="av-sec-sugestao">
            <div class="ns-secao__topo">
              <h3 id="av-sec-sugestao" class="ns-secao__titulo"><i class="pi pi-lightbulb" aria-hidden="true"></i>Sugestão</h3>
              <span class="ns-secao__dica">Opcional</span>
            </div>
            <ces-textarea
              label="Sugestão"
              [labelVisible]="false"
              placeholder="O que deixaria o GEO melhor para você? Uma tela, um botão, um relatório..."
              [value]="sugestao()"
              (valueChange)="sugestao.set($event)"
              [rows]="3"
              [maxlength]="2000"
            />
          </section>

          <section class="ns-secao" aria-labelledby="av-sec-identificacao">
            <h3 id="av-sec-identificacao" class="ns-secao__titulo"><i class="pi pi-eye-slash" aria-hidden="true"></i>Identificação</h3>
            <div class="ns-cartao">
              <ces-boolean-control
                kind="toggle"
                label="Anônimo"
                [value]="anonima()"
                (valueChange)="anonima.set($event)"
                [description]="anonima()
                  ? 'Seu nome não vai junto com a resposta. Só fica registrado que você já respondeu, para não perguntarmos de novo.'
                  : 'Sua resposta vai com o seu nome, e a equipe pode falar com você sobre o que contou.'"
              />
            </div>
          </section>

          @if (!connectivity.isOnline()) {
            <ces-callout tone="warning" title="Sem conexão">A avaliação precisa de internet para ser enviada. O que você preencheu continua aqui.</ces-callout>
          }
        </div>
      }

      <div drawer-footer class="ns-rodape">
        @if (podeResponder()) {
          <span class="ns-rodape__resumo">
            @if (estrelas(); as n) {
              <strong>{{ n }} {{ n === 1 ? 'estrela' : 'estrelas' }}</strong> · {{ rotuloEstrelas[n] }}
            } @else {
              Escolha uma nota para enviar
            }
          </span>
          <span class="ns-rodape__acoes">
            <ces-button label="Cancelar" variant="ghost" (pressed)="convite.formularioAberto.set(false)" />
            <ces-button label="Enviar avaliação" icon="pi pi-send" [loading]="enviando()"
              [disabled]="!connectivity.isOnline()" (pressed)="enviar()" />
          </span>
        } @else {
          <span class="ns-rodape__acoes">
            <ces-button label="Fechar" variant="ghost" (pressed)="convite.formularioAberto.set(false)" />
          </span>
        }
      </div>
    </ces-form-drawer>
  `
})
export class AvaliacaoDrawerComponent {
  protected readonly convite = inject(AvaliacaoConviteService);
  protected readonly connectivity = inject(ConnectivityService);
  private readonly api = inject(AvaliacaoService);
  private readonly versao = inject(VersaoAppService);
  private readonly notificacao = inject(NotificationService);

  protected readonly facilidades = FACILIDADES;
  protected readonly problemasOpcoes = PROBLEMAS;
  protected readonly rotuloEstrelas = ROTULO_ESTRELAS;
  protected readonly rotuloFacilidade = ROTULO_FACILIDADE;
  protected readonly rotuloProblema = ROTULO_PROBLEMA;

  protected readonly estrelas = signal<number | null>(null);
  protected readonly facilidade = signal<FacilidadeAvaliacao | null>(null);
  protected readonly problemas = signal<ProblemaAvaliacao[]>([]);
  protected readonly nenhumProblema = signal(false);
  protected readonly problemaDetalhe = signal('');
  protected readonly sugestao = signal('');
  protected readonly anonima = signal(false);
  protected readonly tentou = signal(false);
  protected readonly enviando = signal(false);

  protected readonly jaRespondeu = computed(() => !!this.convite.convite()?.jaRespondeu);
  protected readonly podeResponder = computed(() => !!this.convite.convite() && !this.jaRespondeu());

  protected readonly alterado = computed(
    () =>
      this.podeResponder() &&
      (!!this.facilidade() ||
        this.problemas().length > 0 ||
        !!this.problemaDetalhe().trim() ||
        !!this.sugestao().trim() ||
        (!!this.estrelas() && this.estrelas() !== this.convite.estrelasIniciais()))
  );

  constructor() {
    // Cada abertura começa limpa, com a nota que a pessoa já tocou no convite (se tocou).
    effect(() => {
      if (!this.convite.formularioAberto()) return;
      const inicial = this.convite.estrelasIniciais();
      untracked(() => this.limpar(inicial));
    });
  }

  protected alternarProblema(p: ProblemaAvaliacao): void {
    this.nenhumProblema.set(false);
    this.problemas.update((lista) => (lista.includes(p) ? lista.filter((x) => x !== p) : [...lista, p]));
  }

  protected marcarNenhum(): void {
    this.nenhumProblema.update((v) => !v);
    this.problemas.set([]);
    this.problemaDetalhe.set('');
  }

  protected async enviar(): Promise<void> {
    this.tentou.set(true);
    const campanha = this.convite.convite();
    const estrelas = this.estrelas();
    if (!campanha || !estrelas || this.enviando()) return;

    this.enviando.set(true);
    try {
      await firstValueFrom(
        this.api.responder(campanha.campanhaId, {
          origem: 'WEB',
          estrelas,
          facilidade: this.facilidade(),
          problemas: this.problemas(),
          problemaDetalhe: this.problemaDetalhe().trim() || null,
          sugestao: this.sugestao().trim() || null,
          anonima: this.anonima(),
          versaoApp: this.versao.versaoEmExecucao
        })
      );
      this.convite.marcarRespondida();
      this.convite.formularioAberto.set(false);
      this.notificacao.success('Obrigado! Sua avaliação foi enviada.');
    } catch (erro) {
      this.notificacao.error(getErrorMessage(erro) || 'Não foi possível enviar a avaliação. Tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }

  private limpar(estrelas: number | null): void {
    this.estrelas.set(estrelas);
    this.facilidade.set(null);
    this.problemas.set([]);
    this.nenhumProblema.set(false);
    this.problemaDetalhe.set('');
    this.sugestao.set('');
    this.anonima.set(false);
    this.tentou.set(false);
  }
}
