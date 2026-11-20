import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GeoStatusComponent, GeoIconComponent } from '@geo/ui';
import { GeoAsyncStateComponent, GeoCalloutComponent } from '@geo/ui/feedback';
import { AssistenteContexto, CapacidadesAssistente, ConversaResumo } from '../../../core/models/assistente.models';

@Component({
  selector: 'app-copiloto-boas-vindas',
  standalone: true,
  imports: [GeoIconComponent, GeoStatusComponent, GeoCalloutComponent, GeoAsyncStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="boas-vindas" aria-labelledby="copiloto-boas-vindas-titulo">
      <img class="boas-vindas__avatar" src="icons/bussola.svg" alt="" aria-hidden="true" />
      <h1 id="copiloto-boas-vindas-titulo" class="boas-vindas__titulo">O que vamos explorar hoje?</h1>
      <p class="boas-vindas__texto">
        Converse com os dados do GEO, investigue resultados e crie análises.
      </p>

      @if (contexto(); as ctx) {
        <geo-callout tone="info" icon="map-pin" title="Contexto desta conversa" [dense]="true">
          Você abriu a Bússola a partir de {{ ctx.rotulo || ctx.pagina || ctx.entidadeTipo }}. Perguntas como
          “analise isto” usam esse contexto.
        </geo-callout>
      }

      @if (capacidades(); as cap) {
        @if (!cap.disponivel) {
          <geo-callout tone="warning" icon="triangle-alert" title="Bússola indisponível" [dense]="true">
            {{ cap.motivoIndisponibilidade || 'O provedor de IA não está configurado neste ambiente.' }}
          </geo-callout>
        }
        <div class="boas-vindas__recursos" aria-label="Capacidades da Bússola">
          <h2 class="boas-vindas__subtitulo">O que posso fazer</h2>
          @if (capacidadesDisponiveis().length) {
            <p class="boas-vindas__estado">Disponível agora</p>
            <ul class="boas-vindas__capacidades" aria-label="Capacidades disponíveis agora">
              @for (capacidade of capacidadesDisponiveis(); track capacidade.label) {
                <li><geo-status tone="brand" [icon]="capacidade.icon">{{ capacidade.label }}</geo-status></li>
              }
            </ul>
          }
          @if (capacidadesIndisponiveis().length) {
            <p class="boas-vindas__estado">Indisponível nesta sessão</p>
            <ul class="boas-vindas__capacidades" aria-label="Capacidades indisponíveis nesta sessão">
              @for (capacidade of capacidadesIndisponiveis(); track capacidade.label) {
                <li><geo-status tone="neutral" [icon]="capacidade.icon">{{ capacidade.label }}</geo-status></li>
              }
            </ul>
          }
        </div>
        @if (continuar(); as conversa) {
          <button type="button" class="continuar" (click)="abrirConversa.emit(conversa.id)">
            <geo-icon class="geo-icon--texto continuar__icone" name="history"></geo-icon>
            <span class="continuar__texto">
              <span class="continuar__rotulo">Continuar de onde parou</span>
              <strong class="continuar__titulo">{{ conversa.titulo }}</strong>
            </span>
            <geo-icon class="geo-icon--texto continuar__seta" name="arrow-right"></geo-icon>
          </button>
        }
        @if (cap.sugestoes.length) {
          <h2 class="boas-vindas__subtitulo">Sugestões para o seu perfil</h2>
          <ul class="sugestoes">
            @for (sugestao of cap.sugestoes.slice(0, 6); track sugestao.titulo) {
              <li>
                <button type="button" class="sugestao" [disabled]="!cap.disponivel" (click)="escolher.emit(sugestao.pergunta)">
                  <geo-icon class="geo-icon--texto sugestao__icone" [name]="sugestao.icone"></geo-icon>
                  <span class="sugestao__texto">
                    <strong>{{ sugestao.titulo }}</strong>
                    @if (sugestao.descricao) {
                      <span class="sugestao__descricao">{{ sugestao.descricao }}</span>
                    }
                  </span>
                  <geo-icon class="geo-icon--texto sugestao__seta" name="arrow-up-right"></geo-icon>
                </button>
              </li>
            }
          </ul>
        }
      } @else if (erro()) {
        <geo-async-state state="error" [compact]="true" title="Não foi possível carregar as capacidades" [description]="erro() || undefined"></geo-async-state>
      } @else {
        <geo-async-state state="loading" [compact]="true" title="Preparando a Bússola"></geo-async-state>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .boas-vindas {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
      max-width: 44rem;
      margin: 0 auto;
      padding: 1.25rem 0.5rem 2rem;
      text-align: center;
    }
    .boas-vindas__avatar { width: 3.25rem; height: 3.25rem; border-radius: 999px; object-fit: cover; }
    .boas-vindas__titulo { margin: 0.3rem 0 0; font-size: clamp(1.35rem, 2vw, 1.7rem); font-weight: 650; color: var(--geo-foreground); line-height: 1.25; }
    .boas-vindas__texto { margin: 0; max-width: 34rem; color: var(--geo-foreground-muted); font-size: var(--geo-font-body); line-height: 1.5; }
    .boas-vindas__subtitulo {
      align-self: stretch;
      margin: 1.1rem 0 0;
      font-size: var(--geo-font-caption);
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--geo-foreground-subtle);
      text-align: left;
    }
    geo-callout { align-self: stretch; text-align: left; }
    .boas-vindas__recursos { align-self: stretch; margin-top: 0.4rem; }
    .boas-vindas__recursos .boas-vindas__subtitulo { margin: 0 0 0.35rem; }
    .boas-vindas__estado {
      margin: 0.7rem 0 0.4rem;
      color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption);
      text-align: left;
    }
    .boas-vindas__capacidades {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 0.4rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .sugestoes {
      list-style: none;
      margin: 0;
      padding: 0;
      align-self: stretch;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.6rem;
    }
    .sugestao {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
      height: 100%;
      min-height: 3.7rem;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-md);
      background: var(--geo-surface);
      color: var(--geo-foreground);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color var(--geo-duration-fast) var(--geo-ease-standard), box-shadow var(--geo-duration-fast) var(--geo-ease-standard);
    }
    .sugestao:hover:not(:disabled) { border-color: var(--geo-brand); box-shadow: var(--geo-shadow-sm); }
    .sugestao:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .sugestao:disabled { cursor: not-allowed; opacity: 0.6; }
    .sugestao__icone { color: var(--geo-brand); }
    .sugestao__texto { flex: 1; font-size: var(--geo-font-body); line-height: 1.35; }
    .sugestao__texto { display: flex; flex-direction: column; gap: 0.1rem; }
    .sugestao__texto strong { font-weight: 600; }
    .sugestao__descricao { font-size: var(--geo-font-caption); color: var(--geo-foreground-subtle); line-height: 1.35; }
    .continuar {
      align-self: stretch;
      display: flex;
      align-items: center;
      gap: 0.7rem;
      margin-top: 1rem;
      padding: 0.7rem 0.9rem;
      border: 1px solid color-mix(in srgb, var(--geo-brand) 30%, var(--geo-border));
      border-radius: var(--geo-radius-md);
      background: var(--geo-brand-soft);
      color: var(--geo-foreground);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .continuar:hover { border-color: var(--geo-brand); }
    .continuar:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .continuar__icone, .continuar__seta { color: var(--geo-brand); }
    .continuar__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .continuar__rotulo { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .continuar__titulo { font-size: var(--geo-font-body); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sugestao__seta { font-size: 0.7rem; color: var(--geo-foreground-subtle); }
    /* Telas baixas (notebooks 1366x768 com zoom, janelas divididas): tudo cabe sem rolar. */
    @media (max-height: 820px) {
      .boas-vindas { gap: 0.45rem; padding-top: 0.25rem; padding-bottom: 0.75rem; }
      .boas-vindas__avatar { width: 2.5rem; height: 2.5rem; }
      .boas-vindas__subtitulo { margin-top: 0.6rem; }
      .boas-vindas__estado { margin: 0.4rem 0 0.3rem; }
      .continuar { margin-top: 0.5rem; padding: 0.5rem 0.8rem; }
      .sugestoes li:nth-child(n + 5) { display: none; }
      .sugestao { min-height: 3.1rem; padding: 0.5rem 0.75rem; }
      .sugestao__descricao { display: none; }
    }
    @media (max-height: 680px) {
      .boas-vindas__avatar, .boas-vindas__texto { display: none; }
    }
    @media (max-width: 640px) {
      .boas-vindas { padding: 0.75rem 0 1.5rem; }
      .sugestoes { grid-template-columns: 1fr; }
      .sugestao { min-height: 3.2rem; }
    }
  `,
})
export class CopilotoBoasVindasComponent {
  readonly capacidades = input<CapacidadesAssistente | null>(null);
  readonly erro = input<string | null>(null);
  readonly contexto = input<AssistenteContexto | null>(null);
  /** Conversa mais recente, oferecida como atalho para continuar. */
  readonly continuar = input<ConversaResumo | null>(null);
  readonly escolher = output<string>();
  readonly abrirConversa = output<string>();

  private readonly catalogoCapacidades = computed(() => {
    const cap = this.capacidades();
    const tipos = new Set((cap?.ferramentas ?? []).map((ferramenta) => ferramenta.tipo));
    const disponivel = (habilitada: boolean) => !!cap?.disponivel && habilitada;
    return [
      { label: 'Consultar dados do GEO', icon: 'database', disponivel: disponivel(['CATALOG', 'DATA', 'SQL'].some((tipo) => tipos.has(tipo))) },
      { label: 'Analisar resultados', icon: 'chart-line', disponivel: disponivel(tipos.has('ANALYSIS')) },
      { label: 'Indicar caminhos', icon: 'compass', disponivel: disponivel(tipos.has('NAVIGATION')) },
      { label: 'Dashboards', icon: 'columns-3', disponivel: disponivel(tipos.has('ARTIFACT')) },
      { label: 'Relatórios PDF', icon: 'file-text', disponivel: disponivel(tipos.has('REPORT')) },
      { label: 'Planilhas', icon: 'file-spreadsheet', disponivel: disponivel(tipos.has('EXPORT')) },
      { label: 'Leitura de arquivos', icon: 'paperclip', disponivel: disponivel(tipos.has('FILE')) },
      { label: 'Python', icon: 'cpu', disponivel: disponivel(!!cap?.python) },
      { label: 'Pesquisa web', icon: 'globe', disponivel: disponivel(!!cap?.pesquisaWeb) },
      { label: 'Leitura de páginas', icon: 'external-link', disponivel: disponivel(!!cap?.leituraWeb) },
      { label: 'Competências', icon: 'sparkles', disponivel: disponivel(!!cap?.competencias?.length) },
      { label: 'Alterar dados do GEO', icon: 'pencil', disponivel: disponivel(tipos.has('WRITE')) },
    ];
  });

  protected readonly capacidadesDisponiveis = computed(() => this.catalogoCapacidades().filter((capacidade) => capacidade.disponivel));
  protected readonly capacidadesIndisponiveis = computed(() => this.catalogoCapacidades().filter((capacidade) => !capacidade.disponivel));
}
