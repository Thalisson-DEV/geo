import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesConfirmationService,
  CesDatepickerComponent,
  CesFormDrawerComponent,
  CesPageHeaderComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import {
  CampanhaAvaliacao,
  FacilidadeAvaliacao,
  OrigemAvaliacao,
  ProblemaAvaliacao,
  RespostaAvaliacao,
  ResumoAvaliacao,
  ROTULO_ESTRELAS,
  ROTULO_FACILIDADE,
  ROTULO_ORIGEM,
  ROTULO_PROBLEMA
} from '../../../core/models/avaliacao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { AvaliacaoService } from '../../../core/services/avaliacao.service';
import { DashboardMetricCardComponent } from '../../../shared/components/dashboard/dashboard-ui.components';

interface Barra {
  rotulo: string;
  valor: number;
  pct: number;
  tom?: string;
}

type FiltroOrigem = OrigemAvaliacao | null;

/**
 * Resultados da avaliação do aplicativo, para a administração.
 *
 * <p>Números no topo (quantos, nota média, quem achou fácil, quem adiou ou não quis), as
 * três distribuições lado a lado e, embaixo, o que cada pessoa escreveu — que é onde mora
 * o valor da pesquisa. Resposta anônima aparece como "Anônima", sem pista do autor.</p>
 */
@Component({
  selector: 'app-avaliacoes-painel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    CesAsyncStateComponent,
    CesButtonComponent,
    CesDatepickerComponent,
    CesFormDrawerComponent,
    CesPageHeaderComponent,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent,
    DashboardMetricCardComponent
  ],
  styleUrls: ['../../almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao.css', './avaliacoes-painel.component.css'],
  template: `
    <main class="dash-page">
      <div class="dash-shell">
        <ces-page-header
          title="Avaliação do aplicativo"
          icon="pi pi-star"
          [breadcrumb]="[{ label: 'Admin' }, { label: 'Sistema' }, { label: 'Avaliação do app' }]"
          description="O que quem usa o GEO, no web e no app de campo, está achando do sistema."
        >
          @if (podeGerenciar()) {
            @if (campanha()?.aberta) {
              <ces-button actions label="Encerrar pesquisa" icon="pi pi-stop-circle" variant="secondary" (pressed)="encerrar()" />
            }
            <ces-button actions label="Nova pesquisa" icon="pi pi-plus" (pressed)="abrirNova()" />
          }
        </ces-page-header>

        @if (carregandoCampanhas() && !campanhas().length) {
          <ces-async-state state="loading" title="Carregando as avaliações" description="Pesquisas, notas e comentários." />
        } @else if (erro()) {
          <ces-async-state state="error" title="Não foi possível carregar as avaliações" [description]="erro()!"
            actionLabel="Tentar de novo" actionIcon="pi pi-refresh" (action)="carregarCampanhas()" />
        } @else if (!campanhas().length) {
          <ces-async-state state="empty" icon="pi pi-star" title="Nenhuma pesquisa de avaliação ainda"
            description="Abra uma pesquisa para convidar quem usa o GEO a dar uma nota e contar o que acha." />
        } @else {
          <section class="ap-barra" aria-label="Pesquisa e filtros">
            <ces-select class="ap-barra__pesquisa" label="Pesquisa" [options]="opcoesCampanha()" [value]="campanhaId()"
              (valueChange)="trocarCampanha($event)" [loading]="carregandoCampanhas()" />
            <div class="ap-barra__origem">
              <span class="ap-barra__rotulo" id="ap-origem">Onde respondeu</span>
              <div class="ns-pilulas" role="radiogroup" aria-labelledby="ap-origem">
                @for (o of origens; track o.label) {
                  <button type="button" role="radio" class="ns-pilula" [attr.aria-checked]="origem() === o.value" (click)="trocarOrigem(o.value)">
                    <i [class]="o.icone" aria-hidden="true"></i>{{ o.label }}
                  </button>
                }
              </div>
            </div>
            @if (campanha(); as c) {
              <div class="ap-barra__periodo">
                <ces-status [tone]="c.aberta ? 'success' : 'neutral'" [icon]="c.aberta ? 'pi pi-circle-fill' : 'pi pi-lock'">
                  {{ c.aberta ? 'Aberta' : 'Encerrada' }}
                </ces-status>
                <span>{{ c.inicio | date: 'dd/MM' }} a {{ (c.encerradaEm ?? c.fim) | date: 'dd/MM/yyyy' }}</span>
              </div>
            }
          </section>

          @if (carregando() || !resumo()) {
            <ces-async-state state="loading" title="Lendo as respostas" />
          } @else if (resumo(); as r) {
            <div class="dash-metrics">
              <app-dashboard-metric-card label="Respostas" icon="pi-users" tone="primary" [value]="r.respostas"
                [detail]="plural(r.anonimas, 'anônima', 'anônimas') + ' · ' + plural(r.comSugestao, 'com sugestão', 'com sugestão')" />
              <app-dashboard-metric-card label="Nota média" icon="pi-star-fill" tone="amber"
                [value]="r.mediaEstrelas != null ? (r.mediaEstrelas | number: '1.1-1') + ' de 5' : '—'"
                [progress]="r.mediaEstrelas != null ? (r.mediaEstrelas / 5) * 100 : null"
                [detail]="r.mediaEstrelas != null ? rotuloEstrelas[arredondar(r.mediaEstrelas)] + ', em média' : 'Sem notas ainda'" />
              <app-dashboard-metric-card label="Acham fácil de usar" icon="pi-compass" [tone]="(pctFacil() ?? 100) < 50 ? 'amber' : 'green'"
                [value]="pctFacil() === null ? '—' : pctFacil() + '%'" [progress]="pctFacil()"
                detail="Entre quem respondeu essa pergunta" />
              <app-dashboard-metric-card label="Ainda não responderam" icon="pi-clock" tone="slate" [value]="r.adiaram"
                [detail]="'Pediram para responder depois · ' + plural(r.recusaram, 'não quis', 'não quiseram')" />
            </div>

            @if (!r.respostas) {
              <ces-async-state state="empty" icon="pi pi-inbox" title="Ninguém respondeu ainda"
                description="O convite aparece para cada pessoa depois de alguns minutos de uso, no web e no app de campo. As respostas chegam aqui na hora." />
            } @else {
              <section class="dash-grid" aria-label="Distribuições">
                <article class="dash-panel dash-col-4">
                  <header class="dash-panel__header">
                    <div><span class="dash-eyebrow">Satisfação</span><h2>Como avaliaram</h2></div>
                  </header>
                  <div class="ap-media">
                    <strong>{{ r.mediaEstrelas | number: '1.1-1' }}</strong>
                    <div>
                      <span class="ap-estrelas ap-estrelas--grande" aria-hidden="true">
                        @for (n of [1, 2, 3, 4, 5]; track n) {
                          <i class="pi pi-star-fill" [class.ap-estrela--acesa]="n <= arredondar(r.mediaEstrelas ?? 0)"></i>
                        }
                      </span>
                      <span class="ap-media__base">{{ plural(r.respostas, 'avaliação', 'avaliações') }}</span>
                    </div>
                  </div>
                  <ul class="ap-barras">
                    @for (b of barrasEstrelas(); track b.rotulo) {
                      <li class="ap-linha">
                        <span class="ap-linha__rotulo ap-linha__rotulo--estrela">{{ b.rotulo }} <i class="pi pi-star-fill ap-estrela--acesa" aria-hidden="true"></i></span>
                        <span class="ap-trilho" role="img" [attr.aria-label]="b.rotulo + ' estrelas: ' + b.valor"><span class="ap-trilho__barra" data-tom="estrela" [style.width.%]="b.pct"></span></span>
                        <span class="ap-linha__num">{{ b.valor }}</span>
                      </li>
                    }
                  </ul>
                </article>

                <article class="dash-panel dash-col-4">
                  <header class="dash-panel__header">
                    <div><span class="dash-eyebrow">Facilidade</span><h2>Está fácil de usar?</h2></div>
                  </header>
                  <ul class="ap-barras ap-barras--folgada">
                    @for (b of barrasFacilidade(); track b.rotulo) {
                      <li class="ap-linha">
                        <span class="ap-linha__rotulo">{{ b.rotulo }}</span>
                        <span class="ap-trilho" role="img" [attr.aria-label]="b.rotulo + ': ' + b.valor"><span class="ap-trilho__barra" [attr.data-tom]="b.tom" [style.width.%]="b.pct"></span></span>
                        <span class="ap-linha__num">{{ b.valor }}</span>
                      </li>
                    }
                  </ul>
                </article>

                <article class="dash-panel dash-col-4">
                  <header class="dash-panel__header">
                    <div><span class="dash-eyebrow">Problemas</span><h2>O que se repete</h2></div>
                  </header>
                  @if (!temProblema()) {
                    <p class="ap-nada"><i class="pi pi-check-circle" aria-hidden="true"></i>Ninguém apontou problema que se repete.</p>
                  } @else {
                    <ul class="ap-barras">
                      @for (b of barrasProblema(); track b.rotulo) {
                        <li class="ap-linha" [class.ap-linha--zero]="!b.valor">
                          <span class="ap-linha__rotulo">{{ b.rotulo }}</span>
                          <span class="ap-trilho" role="img" [attr.aria-label]="b.rotulo + ': ' + b.valor"><span class="ap-trilho__barra" data-tom="problema" [style.width.%]="b.pct"></span></span>
                          <span class="ap-linha__num">{{ b.pct }}%</span>
                        </li>
                      }
                    </ul>
                  }
                </article>
              </section>

              <article class="dash-panel">
                <header class="dash-panel__header">
                  <div>
                    <span class="dash-eyebrow">Comentários</span>
                    <h2>O que disseram</h2>
                  </div>
                  <div class="dash-panel__tools ns-pilulas" role="group" aria-label="Filtrar respostas">
                    <button type="button" class="ns-pilula ns-pilula--pequena" [attr.aria-pressed]="soComTexto()" (click)="soComTexto.set(!soComTexto())">
                      <i class="pi pi-comment" aria-hidden="true"></i>Só com comentário
                    </button>
                    <button type="button" class="ns-pilula ns-pilula--pequena" [attr.aria-pressed]="soNotasBaixas()" (click)="soNotasBaixas.set(!soNotasBaixas())">
                      <i class="pi pi-thumbs-down" aria-hidden="true"></i>Notas 1 e 2
                    </button>
                  </div>
                </header>

                @if (!respostasFiltradas().length) {
                  <div class="ns-vazio">
                    <i class="pi pi-filter-slash" aria-hidden="true"></i>
                    <span>Nenhuma resposta com esses filtros.</span>
                  </div>
                } @else {
                  <ul class="ap-lista">
                    @for (r of respostasFiltradas(); track r.id) {
                      <li class="ap-resposta">
                        <span class="ap-avatar" [class.ap-avatar--anonimo]="!r.autor" aria-hidden="true">
                          @if (r.autor) { {{ r.autor.charAt(0) }} } @else { <i class="pi pi-eye-slash"></i> }
                        </span>
                        <div class="ap-resposta__corpo">
                          <div class="ap-resposta__topo">
                            <strong class="ap-resposta__autor">{{ r.autor ?? 'Anônima' }}</strong>
                            <span class="ap-estrelas" role="img" [attr.aria-label]="r.estrelas + ' de 5 estrelas'">
                              @for (n of [1, 2, 3, 4, 5]; track n) {
                                <i class="pi pi-star-fill" [class.ap-estrela--acesa]="n <= r.estrelas" aria-hidden="true"></i>
                              }
                            </span>
                            <span class="ap-resposta__meta">{{ rotuloEstrelas[r.estrelas] }} · {{ r.respondidaEm | date: 'dd/MM/yyyy' }}</span>
                          </div>
                          <div class="ap-resposta__tags">
                            <ces-status [tone]="r.origem === 'CAMPO' ? 'info' : 'brand'" [icon]="r.origem === 'CAMPO' ? 'pi pi-mobile' : 'pi pi-desktop'">
                              {{ rotuloOrigem[r.origem] }}
                            </ces-status>
                            @if (r.facilidade) {
                              <ces-status [tone]="tomFacilidade(r.facilidade)" icon="pi pi-compass">{{ rotuloFacilidade[r.facilidade] }}</ces-status>
                            }
                            @for (p of r.problemas; track p) {
                              <ces-status tone="warning" icon="pi pi-exclamation-circle">{{ rotuloProblema[p] }}</ces-status>
                            }
                          </div>
                          @if (r.problemaDetalhe) {
                            <blockquote class="ap-citacao ap-citacao--problema"><span>O que acontece</span>{{ r.problemaDetalhe }}</blockquote>
                          }
                          @if (r.sugestao) {
                            <blockquote class="ap-citacao"><span>Sugestão</span>{{ r.sugestao }}</blockquote>
                          }
                        </div>
                      </li>
                    }
                  </ul>
                }
              </article>
            }
          }
        }
      </div>
    </main>

    <ces-form-drawer
      [visible]="novaAberta()"
      (visibleChange)="novaAberta.set($event)"
      title="Nova pesquisa de avaliação"
      description="Durante o período, todos os usuários são convidados uma vez a avaliar o GEO."
      size="sm"
    >
      <div class="ns">
        <section class="ns-secao" aria-labelledby="ap-nova-dados">
          <h3 id="ap-nova-dados" class="ns-secao__titulo"><i class="pi pi-calendar" aria-hidden="true"></i>Período</h3>
          <div class="ns-cartao">
            <ces-text-input label="Nome" [(value)]="novoTitulo" [maxlength]="120" [required]="true"
              [error]="tentouNova() && !novoTitulo().trim() ? 'Dê um nome para a pesquisa.' : undefined" />
            <div class="ns-grade">
              <ces-datepicker label="Começa em" [(value)]="novoInicio" [required]="true"
                [error]="tentouNova() && !novoInicio() ? 'Informe o início.' : undefined" />
              <ces-datepicker label="Termina em" [(value)]="novoFim" [required]="true"
                [error]="tentouNova() ? (erroFim() ?? undefined) : undefined" />
            </div>
            <p class="ns-info"><i class="pi pi-info-circle" aria-hidden="true"></i><span>Quem respondeu uma pesquisa anterior é convidado de novo na nova.</span></p>
          </div>
        </section>
      </div>
      <div drawer-footer class="ns-rodape">
        <span class="ns-rodape__acoes">
          <ces-button label="Cancelar" variant="ghost" (pressed)="novaAberta.set(false)" />
          <ces-button label="Abrir pesquisa" icon="pi pi-check" [loading]="salvandoNova()" (pressed)="salvarNova()" />
        </span>
      </div>
    </ces-form-drawer>
  `
})
export class AvaliacoesPainelComponent {
  private readonly api = inject(AvaliacaoService);
  private readonly auth = inject(AuthService);
  private readonly notificacao = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);

  protected readonly rotuloEstrelas = ROTULO_ESTRELAS;
  protected readonly rotuloFacilidade = ROTULO_FACILIDADE;
  protected readonly rotuloProblema = ROTULO_PROBLEMA;
  protected readonly rotuloOrigem = ROTULO_ORIGEM;
  protected readonly origens: { label: string; value: FiltroOrigem; icone: string }[] = [
    { label: 'Todos', value: null, icone: 'pi pi-th-large' },
    { label: ROTULO_ORIGEM.WEB, value: 'WEB', icone: 'pi pi-desktop' },
    { label: ROTULO_ORIGEM.CAMPO, value: 'CAMPO', icone: 'pi pi-mobile' }
  ];

  protected readonly campanhas = signal<CampanhaAvaliacao[]>([]);
  protected readonly campanhaId = signal<string | null>(null);
  protected readonly origem = signal<FiltroOrigem>(null);
  protected readonly resumo = signal<ResumoAvaliacao | null>(null);
  protected readonly respostas = signal<RespostaAvaliacao[]>([]);
  protected readonly carregandoCampanhas = signal(true);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly soComTexto = signal(false);
  protected readonly soNotasBaixas = signal(false);

  protected readonly novaAberta = signal(false);
  protected readonly novoTitulo = signal('');
  protected readonly novoInicio = signal<Date | null>(null);
  protected readonly novoFim = signal<Date | null>(null);
  protected readonly tentouNova = signal(false);
  protected readonly salvandoNova = signal(false);

  protected readonly podeGerenciar = computed(() => !!this.auth.currentUser()?.permissoes?.includes('avaliacao:manage'));
  protected readonly campanha = computed(() => this.campanhas().find((c) => c.id === this.campanhaId()) ?? null);

  protected readonly opcoesCampanha = computed<CesSelectOption<string>[]>(() =>
    this.campanhas().map((c) => ({
      label: `${c.titulo} · ${c.respostas} ${c.respostas === 1 ? 'resposta' : 'respostas'}${c.aberta ? ' · aberta' : ''}`,
      value: c.id
    }))
  );

  protected readonly pctFacil = computed(() => {
    const f = this.resumo()?.porFacilidade;
    if (!f) return null;
    const total = f.FACIL + f.RAZOAVEL + f.DIFICIL;
    return total ? Math.round((f.FACIL / total) * 100) : null;
  });

  protected readonly barrasEstrelas = computed<Barra[]>(() => {
    const r = this.resumo();
    if (!r) return [];
    return barras([5, 4, 3, 2, 1].map((n) => [String(n), r.porEstrelas[n] ?? 0]));
  });

  protected readonly barrasFacilidade = computed<Barra[]>(() => {
    const r = this.resumo();
    if (!r) return [];
    const ordem: FacilidadeAvaliacao[] = ['FACIL', 'RAZOAVEL', 'DIFICIL'];
    const tons: Record<FacilidadeAvaliacao, string> = { FACIL: 'bom', RAZOAVEL: 'neutro', DIFICIL: 'ruim' };
    return barras(ordem.map((f) => [ROTULO_FACILIDADE[f], r.porFacilidade[f] ?? 0])).map((b, i) => ({ ...b, tom: tons[ordem[i]] }));
  });

  protected readonly barrasProblema = computed<Barra[]>(() => {
    const r = this.resumo();
    if (!r) return [];
    const itens = (Object.keys(ROTULO_PROBLEMA) as ProblemaAvaliacao[])
      .map((p) => [ROTULO_PROBLEMA[p], r.porProblema[p] ?? 0] as [string, number])
      .sort((a, b) => b[1] - a[1]);
    return barras(itens, r.respostas);
  });

  protected readonly temProblema = computed(() => this.barrasProblema().some((b) => b.valor > 0));

  protected readonly respostasFiltradas = computed(() =>
    this.respostas().filter(
      (r) => (!this.soComTexto() || !!r.sugestao || !!r.problemaDetalhe) && (!this.soNotasBaixas() || r.estrelas <= 2)
    )
  );

  protected readonly erroFim = computed(() => {
    const inicio = this.novoInicio();
    const fim = this.novoFim();
    if (!fim) return 'Informe o fim.';
    if (inicio && fim <= inicio) return 'O fim precisa ser depois do início.';
    return null;
  });

  constructor() {
    void this.carregarCampanhas();
  }

  protected async carregarCampanhas(): Promise<void> {
    this.carregandoCampanhas.set(true);
    this.erro.set(null);
    try {
      const lista = await firstValueFrom(this.api.listarCampanhas());
      this.campanhas.set(lista);
      const atual = lista.find((c) => c.id === this.campanhaId()) ?? lista.find((c) => c.aberta) ?? lista[0];
      this.campanhaId.set(atual?.id ?? null);
      if (atual) await this.carregarDados();
    } catch (e) {
      this.erro.set(getErrorMessage(e) || 'Não foi possível carregar as pesquisas.');
    } finally {
      this.carregandoCampanhas.set(false);
    }
  }

  protected trocarCampanha(id: string | null): void {
    if (!id || id === this.campanhaId()) return;
    this.campanhaId.set(id);
    void this.carregarDados();
  }

  protected trocarOrigem(origem: FiltroOrigem): void {
    if (origem === this.origem()) return;
    this.origem.set(origem);
    void this.carregarDados();
  }

  protected plural(n: number, um: string, varios: string): string {
    return `${n} ${n === 1 ? um : varios}`;
  }

  protected arredondar(media: number): number {
    return Math.min(5, Math.max(1, Math.round(media)));
  }

  protected tomFacilidade(f: FacilidadeAvaliacao): 'success' | 'neutral' | 'danger' {
    return f === 'FACIL' ? 'success' : f === 'DIFICIL' ? 'danger' : 'neutral';
  }

  protected async encerrar(): Promise<void> {
    const c = this.campanha();
    if (!c) return;
    const ok = await this.confirmacao.confirm({
      title: 'Encerrar pesquisa',
      message: 'O convite deixa de aparecer para todos agora, e ninguém mais consegue responder. As respostas já recebidas continuam aqui.',
      confirmLabel: 'Encerrar',
      variant: 'destructive'
    });
    if (!ok) return;
    try {
      const atualizada = await firstValueFrom(this.api.encerrarCampanha(c.id));
      this.campanhas.update((lista) => lista.map((x) => (x.id === atualizada.id ? atualizada : x)));
      this.notificacao.success('Pesquisa encerrada.');
    } catch (e) {
      this.notificacao.error(getErrorMessage(e) || 'Não foi possível encerrar a pesquisa.');
    }
  }

  protected abrirNova(): void {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + 30);
    this.novoTitulo.set('Avaliação do GEO');
    this.novoInicio.set(hoje);
    this.novoFim.set(fim);
    this.tentouNova.set(false);
    this.novaAberta.set(true);
  }

  protected async salvarNova(): Promise<void> {
    this.tentouNova.set(true);
    const inicio = this.novoInicio();
    const fim = this.novoFim();
    if (!this.novoTitulo().trim() || !inicio || !fim || this.erroFim()) return;
    // O fim é o dia inteiro: a pesquisa vai até 23:59 do último dia escolhido.
    const fimDoDia = new Date(fim);
    fimDoDia.setHours(23, 59, 59, 0);
    this.salvandoNova.set(true);
    try {
      const nova = await firstValueFrom(
        this.api.abrirCampanha({ titulo: this.novoTitulo().trim(), inicio: inicio.toISOString(), fim: fimDoDia.toISOString() })
      );
      this.novaAberta.set(false);
      this.campanhaId.set(nova.id);
      this.notificacao.success('Pesquisa aberta. O convite começa a aparecer para todos os usuários.');
      await this.carregarCampanhas();
    } catch (e) {
      this.notificacao.error(getErrorMessage(e) || 'Não foi possível abrir a pesquisa.');
    } finally {
      this.salvandoNova.set(false);
    }
  }

  private async carregarDados(): Promise<void> {
    const id = this.campanhaId();
    if (!id) return;
    this.carregando.set(true);
    try {
      const [resumo, respostas] = await Promise.all([
        firstValueFrom(this.api.resumo(id, this.origem())),
        firstValueFrom(this.api.respostas(id, this.origem()))
      ]);
      this.resumo.set(resumo);
      this.respostas.set(respostas);
    } catch (e) {
      this.notificacao.error(getErrorMessage(e) || 'Não foi possível carregar os resultados.');
    } finally {
      this.carregando.set(false);
    }
  }
}

/** Barras proporcionais ao maior valor (ou a um total informado, para percentuais de "quantos citaram"). */
function barras(itens: [string, number][], base?: number): Barra[] {
  const maior = base ?? Math.max(...itens.map(([, v]) => v), 0);
  return itens.map(([rotulo, valor]) => ({ rotulo, valor, pct: maior ? Math.round((valor / maior) * 100) : 0 }));
}
