import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GeoButtonComponent, GeoCalloutComponent, GeoStatusComponent, NotificationService } from '@geo/ui';
import {
  AlvoAnaliseIa,
  AnaliseIa,
  EstadoAnaliseIa,
  FotoAnaliseIa,
  ICONE_PARECER_IA,
  ICONE_RESULTADO_FOTO_IA,
  ROTULO_GRAVIDADE_IA,
  ROTULO_RESULTADO_FOTO_IA,
  TOM_GRAVIDADE_IA,
  TOM_PARECER_IA,
  TOM_RESULTADO_FOTO_IA
} from '../../../core/models/frota-analise-ia.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAnaliseIaService } from '../../../core/services/frota-analise-ia.service';

const ICONE_GRAVIDADE = { INFO: 'pi-info-circle', ATENCAO: 'pi-exclamation-triangle', CRITICO: 'pi-times-circle' } as const;

/**
 * Seção "Análise da Bússola" dos relatórios da frota. A Bússola lê as fotos e os dados do
 * registro e aponta o que confere e o que diverge; a decisão continua com o gestor. O parecer
 * fica sempre à vista; os detalhes (pontos, leitura de cada foto, sugestões) recolhem. A última
 * análise fica salva: abrir o relatório de novo não gasta outra chamada.
 */
@Component({
  selector: 'app-frota-relatorio-analise-ia',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent, GeoCalloutComponent, GeoStatusComponent],
  styles: `
    :host { display: block; }
    .sp { border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg, 0.75rem); background: var(--geo-surface); overflow: hidden; }
    .sp__topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 1rem 1.25rem;
      background: linear-gradient(90deg, var(--geo-brand-soft), transparent 70%); border-bottom: 1px solid var(--geo-border); }
    .sp__marca { display: flex; align-items: center; gap: 0.875rem; min-width: 0; }
    .sp__avatar { width: 2.75rem; height: 2.75rem; flex-shrink: 0; border-radius: 50%; background: var(--geo-surface); object-fit: contain;
      box-shadow: 0 0 0 2px var(--geo-brand-soft), 0 0 0 3px var(--geo-brand); }
    .sp__titulo { display: grid; gap: 0.125rem; min-width: 0; }
    .sp__titulo strong { font-size: 0.9375rem; }
    .sp__titulo span { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .sp__acoes { display: flex; align-items: center; gap: 0.5rem; }
    .sp__corpo { display: grid; gap: 1rem; padding: 1.25rem; }

    .sp__fala { position: relative; display: grid; gap: 0.5rem; padding: 0.875rem 1rem 0.875rem 1.125rem; border-radius: var(--geo-radius-md, 0.5rem);
      border: 1px solid var(--geo-border); border-left: 4px solid var(--sp-tom, var(--geo-border-strong)); background: var(--sp-tom-soft, var(--geo-surface-subtle)); }
    .sp__fala[data-tom='success'] { --sp-tom: var(--geo-success); --sp-tom-soft: var(--geo-success-soft); }
    .sp__fala[data-tom='warning'] { --sp-tom: var(--geo-warning); --sp-tom-soft: var(--geo-warning-soft); }
    .sp__fala[data-tom='danger'] { --sp-tom: var(--geo-danger); --sp-tom-soft: var(--geo-danger-soft); }
    .sp__fala-topo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .sp__resumo { margin: 0; font-size: var(--geo-font-caption); line-height: 1.6; }
    .sp__contagens { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .sp__contagem { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: var(--geo-surface);
      border: 1px solid var(--geo-border); font-size: var(--geo-font-caption); font-weight: 600; color: var(--geo-foreground-muted); }
    .sp__contagem[data-tom='danger'] { color: var(--geo-danger-text); }
    .sp__contagem[data-tom='warning'] { color: var(--geo-warning-text); }
    .sp__contagem[data-tom='success'] { color: var(--geo-success-text); }

    .sp__alternar { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.625rem 0.75rem;
      border: 1px dashed var(--geo-border-strong); border-radius: var(--geo-radius-md, 0.5rem); background: transparent; color: var(--geo-brand);
      font: inherit; font-size: var(--geo-font-caption); font-weight: 600; cursor: pointer; }
    .sp__alternar:hover { background: var(--geo-brand-soft); border-style: solid; }
    .sp__alternar:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .sp__alternar .pi { transition: transform 0.2s ease; }
    .sp__alternar[aria-expanded='true'] .pi-chevron-down { transform: rotate(180deg); }

    .sp__detalhes { display: grid; gap: 1.25rem; }
    .sp__bloco { display: grid; gap: 0.625rem; }
    .sp__rotulo { font-size: var(--geo-font-caption); font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--geo-foreground-muted); }

    .sp__pontos { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md, 0.5rem); overflow: hidden; }
    .sp__ponto { display: grid; grid-template-columns: 1.75rem minmax(0, 1fr); gap: 0.625rem; padding: 0.75rem 0.875rem; }
    .sp__ponto + .sp__ponto { border-top: 1px solid var(--geo-border); }
    .sp__ponto-icone { display: flex; width: 1.75rem; height: 1.75rem; align-items: center; justify-content: center; border-radius: 50%; font-size: var(--geo-font-caption); }
    .sp__ponto-icone[data-tom='danger'] { background: var(--geo-danger-soft); color: var(--geo-danger-text); }
    .sp__ponto-icone[data-tom='warning'] { background: var(--geo-warning-soft); color: var(--geo-warning-text); }
    .sp__ponto-icone[data-tom='info'] { background: var(--geo-info-soft); color: var(--geo-info-text); }
    .sp__ponto-corpo { display: grid; gap: 0.25rem; min-width: 0; }
    .sp__ponto-corpo strong { font-size: var(--geo-font-caption); }
    .sp__ponto-corpo p { margin: 0; font-size: var(--geo-font-caption); line-height: 1.5; color: var(--geo-foreground-muted); }

    .sp__fotos { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); margin: 0; padding: 0; list-style: none; }
    .sp__foto { display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md, 0.5rem); overflow: hidden; background: var(--geo-surface); }
    .sp__foto-imagem { position: relative; display: flex; aspect-ratio: 16 / 10; align-items: center; justify-content: center; background: var(--geo-surface-subtle);
      color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .sp__foto-imagem img { width: 100%; height: 100%; object-fit: cover; }
    a.sp__foto-imagem:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: -2px; }
    .sp__ref { position: absolute; top: 0.5rem; left: 0.5rem; padding: 0.1rem 0.45rem; border-radius: var(--geo-radius-sm, 0.375rem);
      background: var(--geo-surface); font-size: var(--geo-font-caption); font-weight: 600; box-shadow: var(--geo-shadow-sm); }
    .sp__foto-corpo { display: grid; gap: 0.375rem; align-content: start; padding: 0.75rem; font-size: var(--geo-font-caption); }
    .sp__foto-topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.375rem; }
    .sp__foto-topo strong { font-size: var(--geo-font-caption); min-width: 0; }
    .sp__foto-corpo p { margin: 0; line-height: 1.5; }
    .sp__mudo { color: var(--geo-foreground-muted); }

    .sp__lista { margin: 0; padding-left: 1.125rem; display: grid; gap: 0.25rem; font-size: var(--geo-font-caption); line-height: 1.55; }
    .sp__rodape { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; padding: 0.75rem 1.25rem;
      border-top: 1px solid var(--geo-border); background: var(--geo-surface-subtle); font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .sp__carregando { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: var(--geo-radius-md, 0.5rem);
      background: var(--geo-brand-soft); font-size: var(--geo-font-caption); }
    .sp__carregando img { width: 2rem; height: 2rem; border-radius: 50%; background: var(--geo-surface); object-fit: contain; animation: sp-pulso 1.4s ease-in-out infinite; }
    @keyframes sp-pulso { 50% { transform: scale(0.92); opacity: 0.7; } }
    @media (prefers-reduced-motion: reduce) { .sp__carregando img { animation: none; } .sp__alternar .pi { transition: none; } }
    @media print {
      .sp__acoes, .sp__alternar { display: none !important; }
      .sp__detalhes { display: grid !important; }
      .sp__topo { background: transparent; }
      .sp { break-inside: avoid-page; }
    }
  `,
  template: `
    <section class="sp" aria-labelledby="sp-titulo">
      <header class="sp__topo">
        <div class="sp__marca">
          <img class="sp__avatar" src="icons/bussola.svg" alt="" aria-hidden="true" />
          <span class="sp__titulo">
            <strong id="sp-titulo">Bússola</strong>
            <span>Ela lê as fotos e confere com o que foi informado. A Bússola aponta; quem decide é o gestor.</span>
          </span>
        </div>
        @if (estado()?.disponivel) {
          <span class="sp__acoes">
            <geo-button
              [label]="analise() ? 'Analisar de novo' : 'Pedir análise à Bússola'"
              icon="pi pi-compass"
              [variant]="analise() ? 'outline' : 'primary'"
              size="sm"
              [loading]="analisando()"
              (pressed)="analisar()"
            />
          </span>
        }
      </header>

      <div class="sp__corpo" aria-live="polite">
        @if (carregando()) {
          <div class="sp__carregando"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Consultando a última análise…</div>
        } @else if (analisando()) {
          <div class="sp__carregando">
            <img src="icons/bussola.svg" alt="" aria-hidden="true" />
            A Bússola está lendo {{ fotosEsperadas() === 1 ? 'a foto' : fotosEsperadas() ? 'as ' + fotosEsperadas() + ' fotos' : 'os dados' }} deste registro. Leva até um minuto.
          </div>
        } @else if (erro()) {
          <geo-callout tone="danger" title="Não foi possível consultar a análise">{{ erro() }}</geo-callout>
        } @else if (analise(); as a) {
          <div class="sp__fala" [attr.data-tom]="tomParecer[a.parecer]">
            <span class="sp__fala-topo">
              <geo-status [tone]="tomParecer[a.parecer]" [icon]="'pi ' + iconeParecer[a.parecer]" emphasis="solid">{{ a.parecerRotulo }}</geo-status>
              <span>Bússola, {{ a.geradaEm | date: "dd/MM 'às' HH:mm" }}</span>
            </span>
            <p class="sp__resumo">{{ a.resumo }}</p>
            <span class="sp__contagens">
              @if (contagem().criticos) {
                <span class="sp__contagem" data-tom="danger"><i class="pi pi-times-circle" aria-hidden="true"></i>{{ contagem().criticos }} {{ contagem().criticos === 1 ? 'ponto crítico' : 'pontos críticos' }}</span>
              }
              @if (contagem().atencao) {
                <span class="sp__contagem" data-tom="warning"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>{{ contagem().atencao }} de atenção</span>
              }
              @if (a.fotos.length) {
                <span class="sp__contagem" [attr.data-tom]="contagem().divergem ? 'danger' : contagem().conferem === a.fotos.length ? 'success' : 'warning'">
                  <i class="pi pi-camera" aria-hidden="true"></i>{{ contagem().conferem }} de {{ a.fotos.length }} {{ a.fotos.length === 1 ? 'foto confere' : 'fotos conferem' }}
                </span>
              }
            </span>
          </div>

          @if (temDetalhes()) {
            <button type="button" class="sp__alternar" [attr.aria-expanded]="aberto()" aria-controls="sp-detalhes" (click)="aberto.set(!aberto())">
              <span>{{ aberto() ? 'Recolher os detalhes' : 'Ver os detalhes da análise' }} ({{ resumoDetalhes() }})</span>
              <i class="pi pi-chevron-down" aria-hidden="true"></i>
            </button>
          }

          <div id="sp-detalhes" class="sp__detalhes" [hidden]="!aberto()">
            @if (a.pontos.length) {
              <div class="sp__bloco">
                <span class="sp__rotulo">O que a Bússola apontou</span>
                <ul class="sp__pontos">
                  @for (p of a.pontos; track $index) {
                    <li class="sp__ponto">
                      <span class="sp__ponto-icone" [attr.data-tom]="tomGravidade[p.gravidade]" [attr.aria-label]="rotuloGravidade[p.gravidade]"><i class="pi {{ iconeGravidade[p.gravidade] }}" aria-hidden="true"></i></span>
                      <span class="sp__ponto-corpo">
                        <strong>{{ p.titulo }}</strong>
                        @if (p.detalhe) {
                          <p>{{ p.detalhe }}</p>
                        }
                      </span>
                    </li>
                  }
                </ul>
              </div>
            }

            @if (a.fotos.length) {
              <div class="sp__bloco">
                <span class="sp__rotulo">Leitura de cada foto</span>
                <ul class="sp__fotos">
                  @for (f of a.fotos; track f.ref) {
                    <li class="sp__foto">
                      @if (urls()[chave(f)]; as url) {
                        <a class="sp__foto-imagem" [href]="url" target="_blank" rel="noopener" [attr.aria-label]="'Abrir foto ' + f.ref + ': ' + f.rotulo">
                          <img [src]="url" [alt]="f.rotulo" loading="lazy" />
                          <span class="sp__ref">{{ f.ref }}</span>
                        </a>
                      } @else {
                        <div class="sp__foto-imagem">
                          <span class="sp__ref">{{ f.ref }}</span>
                          {{ falhas()[chave(f)] ? 'Foto indisponível' : 'Carregando…' }}
                        </div>
                      }
                      <div class="sp__foto-corpo">
                        <span class="sp__foto-topo">
                          <strong>{{ f.rotulo }}</strong>
                          <geo-status [tone]="tomResultado[f.resultado]" [icon]="'pi ' + iconeResultado[f.resultado]">{{ rotuloResultado[f.resultado] }}</geo-status>
                        </span>
                        @if (f.leitura) {
                          <p><span class="sp__mudo">Leu:</span> {{ f.leitura }}</p>
                        }
                        @if (f.observacao) {
                          <p class="sp__mudo">{{ f.observacao }}</p>
                        }
                      </div>
                    </li>
                  }
                </ul>
              </div>
            }

            @if (a.recomendacoes.length) {
              <div class="sp__bloco">
                <span class="sp__rotulo">Sugestões para o gestor</span>
                <ul class="sp__lista">
                  @for (r of a.recomendacoes; track $index) {
                    <li>{{ r }}</li>
                  }
                </ul>
              </div>
            }

            @if (a.fotosNaoLidas.length) {
              <geo-callout tone="info" title="Fotos que a Bússola não leu" [dense]="true">
                <ul class="sp__lista">
                  @for (n of a.fotosNaoLidas; track $index) {
                    <li>{{ n }}</li>
                  }
                </ul>
              </geo-callout>
            }
          </div>
        } @else if (estado(); as e) {
          @if (e.disponivel) {
            <geo-callout tone="info" title="Ainda não analisado" [dense]="true">
              Peça a análise para a Bússola ler {{ fotosEsperadas() === 1 ? 'a foto' : fotosEsperadas() ? 'as ' + fotosEsperadas() + ' fotos' : 'os dados' }}
              deste registro e apontar o que confere e o que diverge.
            </geo-callout>
          } @else {
            <geo-callout tone="neutral" title="Bússola sem leitura de fotos neste ambiente" [dense]="true">{{ e.motivoIndisponivel }}</geo-callout>
          }
        }
      </div>

      @if (!carregando() && !analisando() && analise(); as a) {
        <footer class="sp__rodape">
          <span>
            Analisado em {{ a.geradaEm | date: "dd/MM/yyyy 'às' HH:mm" }}{{ a.geradaPor ? ' a pedido de ' + a.geradaPor : '' }}
            · {{ a.fotosAnalisadas === 1 ? '1 foto lida' : a.fotosAnalisadas + ' fotos lidas' }}
          </span>
          <span>Modelo de visão: {{ nomeModelo(a.modelo) }}</span>
        </footer>
      }
    </section>
  `
})
export class FrotaRelatorioAnaliseIaComponent {
  readonly alvo = input.required<AlvoAnaliseIa>();
  readonly idAlvo = input.required<string>();
  /** Quantas fotos o registro tem, para o texto de espera. */
  readonly fotosEsperadas = input(0);

  private readonly service = inject(FrotaAnaliseIaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly estado = signal<EstadoAnaliseIa | null>(null);
  protected readonly analise = signal<AnaliseIa | null>(null);
  protected readonly carregando = signal(true);
  protected readonly analisando = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** Detalhes abertos: fechados ao reabrir o relatório, abertos logo depois de uma análise nova. */
  protected readonly aberto = signal(false);
  protected readonly urls = signal<Record<string, string>>({});
  protected readonly falhas = signal<Record<string, boolean>>({});
  private readonly pedidas = new Set<string>();

  protected readonly tomParecer = TOM_PARECER_IA;
  protected readonly iconeParecer = ICONE_PARECER_IA;
  protected readonly tomGravidade = TOM_GRAVIDADE_IA;
  protected readonly rotuloGravidade = ROTULO_GRAVIDADE_IA;
  protected readonly iconeGravidade = ICONE_GRAVIDADE;
  protected readonly tomResultado = TOM_RESULTADO_FOTO_IA;
  protected readonly rotuloResultado = ROTULO_RESULTADO_FOTO_IA;
  protected readonly iconeResultado = ICONE_RESULTADO_FOTO_IA;

  protected readonly contagem = computed(() => {
    const a = this.analise();
    return {
      criticos: a?.pontos.filter((p) => p.gravidade === 'CRITICO').length ?? 0,
      atencao: a?.pontos.filter((p) => p.gravidade === 'ATENCAO').length ?? 0,
      conferem: a?.fotos.filter((f) => f.resultado === 'CONFERE').length ?? 0,
      divergem: a?.fotos.filter((f) => f.resultado === 'DIVERGE').length ?? 0
    };
  });

  protected readonly temDetalhes = computed(() => {
    const a = this.analise();
    return !!a && (a.pontos.length + a.fotos.length + a.recomendacoes.length + a.fotosNaoLidas.length > 0);
  });

  protected readonly resumoDetalhes = computed(() => {
    const a = this.analise();
    if (!a) return '';
    const partes: string[] = [];
    if (a.pontos.length) partes.push(a.pontos.length === 1 ? '1 ponto' : `${a.pontos.length} pontos`);
    if (a.fotos.length) partes.push(a.fotos.length === 1 ? '1 foto' : `${a.fotos.length} fotos`);
    if (a.recomendacoes.length) partes.push(a.recomendacoes.length === 1 ? '1 sugestão' : `${a.recomendacoes.length} sugestões`);
    return partes.join(' · ');
  });

  constructor() {
    effect(() => {
      const alvo = this.alvo();
      const id = this.idAlvo();
      untracked(() => this.carregar(alvo, id));
    });
    // As fotos só são baixadas quando os detalhes abrem (ou para imprimir, que abre tudo).
    effect(() => {
      const fotos = this.aberto() ? (this.analise()?.fotos ?? []) : [];
      untracked(() => fotos.forEach((f) => this.baixar(f)));
    });
    if (typeof window !== 'undefined') {
      const antesDeImprimir = () => this.aberto.set(true);
      window.addEventListener('beforeprint', antesDeImprimir);
      this.destroyRef.onDestroy(() => window.removeEventListener('beforeprint', antesDeImprimir));
    }
    this.destroyRef.onDestroy(() => Object.values(this.urls()).forEach((url) => URL.revokeObjectURL(url)));
  }

  protected chave(f: FotoAnaliseIa): string {
    return `${f.origem}-${f.idFoto}`;
  }

  protected analisar(): void {
    this.analisando.set(true);
    this.erro.set(null);
    this.service
      .analisar(this.alvo(), this.idAlvo())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => {
          this.analise.set(a);
          this.analisando.set(false);
          this.aberto.set(true);
          this.notificacoes.success(`Análise da Bússola concluída: ${a.parecerRotulo.toLowerCase()}.`);
        },
        error: (e) => {
          this.analisando.set(false);
          this.notificacoes.error(getErrorMessage(e), { title: 'A Bússola não concluiu a análise' });
        }
      });
  }

  /** "accounts/fireworks/models/kimi-k3" → "kimi-k3". */
  protected nomeModelo(modelo: string): string {
    return modelo.split('/').pop() || modelo;
  }

  private baixar(f: FotoAnaliseIa): void {
    const chave = this.chave(f);
    if (this.pedidas.has(chave)) return;
    this.pedidas.add(chave);
    this.service
      .foto(f)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => this.urls.update((u) => ({ ...u, [chave]: URL.createObjectURL(blob) })),
        error: () => this.falhas.update((u) => ({ ...u, [chave]: true }))
      });
  }

  private carregar(alvo: AlvoAnaliseIa, id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service
      .estado(alvo, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (e) => {
          this.estado.set(e);
          this.analise.set(e.ultima);
          this.carregando.set(false);
        },
        error: (e) => {
          this.erro.set(getErrorMessage(e));
          this.carregando.set(false);
        }
      });
  }
}
