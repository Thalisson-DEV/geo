import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoIconButtonComponent, GeoStatusComponent, GeoTone } from '@geo/ui';
import { catchError, of, switchMap, tap } from 'rxjs';

import { SolicitacaoSummaryResponse } from '../../../../core/models/almoxarifado.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { dataCivil, isoCivil, prazoRelativo, saqueAtrasado, STATUS_COMERCIAIS, statusComercial } from '../solicitacao-comercial-status';

/** Limite de solicitações por mês exibido; acima disso o calendário pede para refinar o recorte. */
export const LIMITE_CALENDARIO = 500;
const VISIVEIS_POR_DIA = 3;
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Situação de um cartão (cor, ícone e rótulo). */
export interface SituacaoCalendario {
  label: string;
  tone: GeoTone;
  icon: string;
}

/** Conteúdo do cartão no painel do dia, quando o processo tem campos próprios (ex.: obra, OS/OC, reserva). */
export interface DetalheCalendario {
  codigo: string;
  titulo: string;
  linha?: string | null;
  etiqueta?: string | null;
  meta: { icon: string; texto: string }[];
}

interface DiaCalendario {
  iso: string;
  numero: number;
  noMes: boolean;
  hoje: boolean;
  fimDeSemana: boolean;
  itens: SolicitacaoSummaryResponse[];
}

/**
 * Agenda de saques previstos: grade mensal com as solicitações no dia em que a equipe deve retirar o
 * material. O dia selecionado lista tudo o que está previsto para ele.
 */
@Component({
  selector: 'app-solicitacoes-comerciais-calendario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoIconButtonComponent, GeoStatusComponent],
  styleUrl: './solicitacoes-comerciais-calendario.component.css',
  template: `
    @if (erro()) {
      <geo-async-state type="error" title="Não foi possível carregar o calendário" [description]="erro()!" actionLabel="Tentar novamente" (actionPressed)="recarregar()" />
    } @else {
      @if (truncado()) {
        <geo-callout tone="warning" title="Mês com muitas solicitações">
          Mostrando {{ limite }} de {{ total() }}. Use os filtros ou os atalhos de status para reduzir o recorte.
        </geo-callout>
      }
      <div class="cal-shell">
        <section class="cal-card" aria-labelledby="cal-titulo">
          <header class="cal-head">
            <div class="cal-nav">
              <geo-icon-button icon="pi pi-chevron-left" label="Mês anterior" size="icon-sm" (pressed)="mudarMes(-1)" />
              <h2 id="cal-titulo" class="cal-title" aria-live="polite">{{ tituloMes() }}</h2>
              <geo-icon-button icon="pi pi-chevron-right" label="Próximo mês" size="icon-sm" (pressed)="mudarMes(1)" />
              <geo-button label="Hoje" variant="outline" size="sm" [disabled]="ehMesAtual()" (pressed)="irParaHoje()" />
            </div>
            <div class="cal-resumo" aria-live="polite">
              @if (carregando()) {
                <span><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Carregando…</span>
              } @else {
                <span>{{ totalNoMes() }} {{ totalNoMes() === 1 ? 'saque previsto' : 'saques previstos' }} no mês</span>
                @if (atrasadasNoMes() > 0) {
                  <geo-status tone="danger" icon="pi pi-exclamation-triangle">{{ atrasadasNoMes() }} {{ atrasadasNoMes() === 1 ? 'atrasada' : 'atrasadas' }}</geo-status>
                }
              }
            </div>
          </header>

          <div role="grid" [attr.aria-label]="'Saques previstos em ' + tituloMes()" [attr.aria-busy]="carregando()">
            <div class="cal-weekdays" role="row">
              @for (d of diasSemana; track d) { <span role="columnheader">{{ d }}</span> }
            </div>
            @for (semana of semanas(); track $index) {
              <div class="cal-week" role="row">
                @for (dia of semana; track dia.iso) {
                  <div
                    role="gridcell"
                    class="cal-day"
                    [class.cal-day--fora]="!dia.noMes"
                    [class.cal-day--fds]="dia.fimDeSemana && dia.noMes"
                    [class.cal-day--hoje]="dia.hoje"
                    [class.cal-day--sel]="dia.iso === selecionado()"
                    [attr.aria-selected]="dia.iso === selecionado()"
                    (click)="selecionado.set(dia.iso)"
                  >
                    <button type="button" class="cal-num" [attr.aria-label]="rotuloDia(dia)" (click)="selecionar(dia.iso, $event)">{{ dia.numero }}</button>
                    @for (s of dia.itens.slice(0, visiveis); track s.id) {
                      <button
                        type="button"
                        class="cal-pill"
                        [class.cal-pill--atrasada]="atrasada(s)"
                        [attr.data-tone]="situacao(s).tone"
                        [attr.aria-label]="rotuloSolicitacao(s)"
                        (click)="abrirSolicitacao(s, $event)"
                      >
                        <i [class]="'pi ' + situacao(s).icon" aria-hidden="true"></i>
                        @if (detalhe(s)?.etiqueta; as etiqueta) {
                          <span class="cal-pill__tag">{{ etiqueta }}</span>
                        }
                        <span class="cal-pill__txt">{{ nomeItem()(s) }}</span>
                      </button>
                    }
                    @if (dia.itens.length > visiveis) {
                      <button type="button" class="cal-mais" (click)="selecionar(dia.iso, $event)">+{{ dia.itens.length - visiveis }} mais</button>
                    }
                    @if (dia.itens.length) {
                      <span class="cal-dots" aria-hidden="true">
                        @for (s of dia.itens.slice(0, 4); track s.id) { <i [attr.data-tone]="situacao(s).tone"></i> }
                      </span>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <footer class="cal-legenda" aria-label="Legenda">
            @for (s of legenda(); track s.value) {
              <span [attr.data-tone]="s.tone"><i [class]="'pi ' + s.icon" aria-hidden="true"></i>{{ s.label }}
                @if (contagemPorSituacao(); as contagem) { <strong>{{ contagem.get(s.label) ?? 0 }}</strong> }
              </span>
            }
          </footer>
        </section>

        <aside class="cal-card cal-agenda" aria-labelledby="cal-agenda-titulo">
          <div class="cal-agenda__head">
            <p class="cal-agenda__eyebrow">{{ agendaSelecionada().length }} {{ agendaSelecionada().length === 1 ? 'saque previsto' : 'saques previstos' }}</p>
            <h3 id="cal-agenda-titulo" class="cal-agenda__title">{{ tituloDiaSelecionado() }}</h3>
          </div>
          <div class="cal-agenda__list">
            @for (s of agendaSelecionada(); track s.id) {
              @if (detalhe(s); as d) {
                <button type="button" class="cal-agenda-item" [attr.data-tone]="situacao(s).tone" (click)="abrir.emit(s)" [attr.aria-label]="rotuloSolicitacao(s)">
                  <span class="cal-agenda-item__top">
                    <span class="cal-agenda-item__codigo">
                      @if (d.etiqueta) { <span class="cal-agenda-item__tag">{{ d.etiqueta }}</span> }
                      <span class="cal-agenda-item__id">{{ d.codigo }}</span>
                    </span>
                    <geo-status [tone]="situacao(s).tone" [icon]="'pi ' + situacao(s).icon">{{ situacao(s).label }}</geo-status>
                  </span>
                  <span class="cal-agenda-item__titulo">{{ d.titulo }}</span>
                  @if (d.linha) { <span class="cal-agenda-item__rota">{{ d.linha }}</span> }
                  <span class="cal-agenda-item__meta">
                    @for (m of d.meta; track m.texto) {
                      <span><i [class]="'pi ' + m.icon" aria-hidden="true"></i>{{ m.texto }}</span>
                    }
                    @if (atrasada(s)) {
                      <span class="cal-agenda-item__alerta"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>Atrasada {{ relativo(s) }}</span>
                    }
                    @if (s.possuiPendencia) {
                      <span><i class="pi pi-flag" aria-hidden="true"></i>Com pendência</span>
                    }
                  </span>
                </button>
              } @else {
              <button type="button" class="cal-agenda-item" [attr.data-tone]="status(s.status).tone" (click)="abrir.emit(s)" [attr.aria-label]="rotuloSolicitacao(s)">
                <span class="cal-agenda-item__top">
                  <span class="cal-agenda-item__id">#{{ s.id.substring(0, 8) }}</span>
                  <geo-status [tone]="status(s.status).tone" [icon]="'pi ' + status(s.status).icon">{{ status(s.status).label }}</geo-status>
                </span>
                <span class="cal-agenda-item__rota">{{ s.estoqueOrigemNome }} → <strong>{{ nomeItem()(s) }}</strong></span>
                <span class="cal-agenda-item__meta">
                  <span><i class="pi pi-box" aria-hidden="true"></i>{{ s.totalItens }} {{ s.totalItens === 1 ? 'item' : 'itens' }}</span>
                  @if (atrasada(s)) {
                    <span><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>Atrasada {{ relativo(s) }}</span>
                  }
                  @if (s.possuiPendencia) {
                    <span><i class="pi pi-flag" aria-hidden="true"></i>Com pendência</span>
                  }
                </span>
              </button>
              }
            } @empty {
              <p class="cal-agenda__vazio"><i [class]="'pi ' + iconeVazio()" aria-hidden="true"></i>Nenhum saque previsto neste dia.</p>
            }
          </div>
        </aside>
      </div>
    }
  `
})
export class SolicitacoesComerciaisCalendarioComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);

  /** Recorte da tela (já no formato do backend), sem paginação. */
  readonly filtros = input<Record<string, unknown>>({});
  readonly abrir = output<SolicitacaoSummaryResponse>();

  protected readonly diasSemana = DIAS_SEMANA;
  protected readonly visiveis = VISIVEIS_POR_DIA;
  protected readonly limite = LIMITE_CALENDARIO;
  /** Status de cada solicitação; o técnico passa o próprio vocabulário. */
  readonly statusDe = input<(valor: string) => { label: string; tone: GeoTone; icon: string }>((v) => statusComercial(v));
  /** Legenda do rodapé. */
  readonly legendaItens = input<readonly { value: string; label: string; tone: GeoTone; icon: string }[]>(STATUS_COMERCIAIS);
  /** Texto curto do cartão no dia (comercial: equipe de destino; técnico: obra). */
  readonly nomeItem = input<(s: SolicitacaoSummaryResponse) => string>((s) => s.estoqueDestinoNome || '#' + s.id.substring(0, 8));
  /** Situação do cartão a partir da solicitação inteira (o técnico usa a etapa: separar, retirar...). */
  readonly situacaoDe = input<((s: SolicitacaoSummaryResponse) => SituacaoCalendario) | null>(null);
  /** Cartão do painel do dia com os campos do processo; sem ele, mostra origem e destino. */
  readonly detalheDe = input<((s: SolicitacaoSummaryResponse) => DetalheCalendario) | null>(null);
  readonly iconeVazio = input('pi-calendar');
  protected readonly legenda = computed(() => this.legendaItens());
  /** Quantas solicitações do mês há em cada situação da legenda (só quando a situação vem do processo). */
  protected readonly contagemPorSituacao = computed(() => {
    if (!this.situacaoDe()) return null;
    const mapa = new Map<string, number>();
    for (const s of this.doMes()) {
      const label = this.situacao(s).label;
      mapa.set(label, (mapa.get(label) ?? 0) + 1);
    }
    return mapa;
  });

  private readonly hoje = isoCivil(new Date());
  protected readonly mes = signal(primeiroDoMes(new Date()));
  protected readonly selecionado = signal<string>(this.hoje);
  private readonly versao = signal(0);

  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly itens = signal<SolicitacaoSummaryResponse[]>([]);
  protected readonly total = signal(0);
  protected readonly truncado = computed(() => this.total() > this.itens().length);

  /** Domingo antes do dia 1 até completar 6 semanas. */
  private readonly inicioGrade = computed(() => {
    const m = this.mes();
    return new Date(m.getFullYear(), m.getMonth(), 1 - m.getDay());
  });
  private readonly fimGrade = computed(() => {
    const i = this.inicioGrade();
    return new Date(i.getFullYear(), i.getMonth(), i.getDate() + 41);
  });

  private readonly porDia = computed(() => {
    const mapa = new Map<string, SolicitacaoSummaryResponse[]>();
    for (const s of this.itens()) {
      if (!s.dataPrevista) continue;
      const dia = s.dataPrevista.substring(0, 10);
      mapa.set(dia, [...(mapa.get(dia) ?? []), s]);
    }
    return mapa;
  });

  protected readonly semanas = computed<DiaCalendario[][]>(() => {
    const inicio = this.inicioGrade();
    const mes = this.mes().getMonth();
    const porDia = this.porDia();
    const semanas: DiaCalendario[][] = [];
    for (let w = 0; w < 6; w++) {
      const semana: DiaCalendario[] = [];
      for (let d = 0; d < 7; d++) {
        const data = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + w * 7 + d);
        const iso = isoCivil(data);
        semana.push({ iso, numero: data.getDate(), noMes: data.getMonth() === mes, hoje: iso === this.hoje, fimDeSemana: d === 0 || d === 6, itens: porDia.get(iso) ?? [] });
      }
      semanas.push(semana);
    }
    return semanas;
  });

  private readonly doMes = computed(() => {
    const m = this.mes();
    const prefixo = isoCivil(m).substring(0, 7);
    return this.itens().filter((s) => s.dataPrevista?.startsWith(prefixo));
  });
  protected readonly totalNoMes = computed(() => this.doMes().length);
  protected readonly atrasadasNoMes = computed(() => this.doMes().filter((s) => this.atrasada(s)).length);
  protected readonly agendaSelecionada = computed(() => this.porDia().get(this.selecionado()) ?? []);

  protected readonly tituloMes = computed(() => inicial(this.mes().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })));
  protected readonly ehMesAtual = computed(() => isoCivil(this.mes()).substring(0, 7) === this.hoje.substring(0, 7));
  protected readonly tituloDiaSelecionado = computed(() =>
    inicial(dataCivil(this.selecionado()).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))
  );

  private readonly consulta = computed(() => ({ filtros: this.filtros(), inicio: isoCivil(this.inicioGrade()), fim: isoCivil(this.fimGrade()), versao: this.versao() }));

  constructor() {
    toObservable(this.consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap(({ filtros, inicio, fim }) =>
          this.almoxarifado
            .listarSolicitacoes({ ...filtros, previstaDe: inicio, previstaAte: fim, page: 0, size: LIMITE_CALENDARIO, sort: 'dataPrevistaRetirada,asc' })
            .pipe(
              catchError((err) => {
                this.erro.set(getErrorMessage(err));
                return of(null);
              })
            )
        ),
        takeUntilDestroyed()
      )
      .subscribe((res) => {
        this.carregando.set(false);
        if (!res) return;
        this.itens.set(res.content ?? []);
        this.total.set(res.page?.totalElements ?? res.content?.length ?? 0);
      });
  }

  recarregar(): void {
    this.versao.update((v) => v + 1);
  }

  protected mudarMes(delta: number): void {
    const m = this.mes();
    const novo = new Date(m.getFullYear(), m.getMonth() + delta, 1);
    this.mes.set(novo);
    this.selecionado.set(this.ehMesDe(this.hoje, novo) ? this.hoje : isoCivil(novo));
  }

  protected irParaHoje(): void {
    this.mes.set(primeiroDoMes(new Date()));
    this.selecionado.set(this.hoje);
  }

  protected selecionar(iso: string, evento: Event): void {
    evento.stopPropagation();
    this.selecionado.set(iso);
  }

  protected abrirSolicitacao(s: SolicitacaoSummaryResponse, evento: Event): void {
    evento.stopPropagation();
    this.selecionado.set(s.dataPrevista!.substring(0, 10));
    this.abrir.emit(s);
  }

  protected status(valor: string) {
    return this.statusDe()(valor);
  }

  protected situacao(s: SolicitacaoSummaryResponse): SituacaoCalendario {
    const fn = this.situacaoDe();
    return fn ? fn(s) : this.statusDe()(s.status);
  }

  protected detalhe(s: SolicitacaoSummaryResponse): DetalheCalendario | null {
    return this.detalheDe()?.(s) ?? null;
  }

  protected atrasada(s: SolicitacaoSummaryResponse): boolean {
    return saqueAtrasado(s);
  }

  protected relativo(s: SolicitacaoSummaryResponse): string {
    return s.dataPrevista ? prazoRelativo(s.dataPrevista) : '';
  }

  protected rotuloDia(dia: DiaCalendario): string {
    const data = dataCivil(dia.iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const n = dia.itens.length;
    return `${data}: ${n === 0 ? 'nenhum saque previsto' : n === 1 ? '1 saque previsto' : n + ' saques previstos'}`;
  }

  protected rotuloSolicitacao(s: SolicitacaoSummaryResponse): string {
    const partes = [`Solicitação ${this.detalhe(s)?.codigo ?? '#' + s.id.substring(0, 8)}`, `para ${this.nomeItem()(s)}`, this.situacao(s).label];
    if (this.atrasada(s)) partes.push('atrasada');
    return partes.join(', ');
  }

  private ehMesDe(iso: string, mes: Date): boolean {
    return iso.substring(0, 7) === isoCivil(mes).substring(0, 7);
  }
}

/** "outubro de 2026" → "Outubro de 2026". */
function inicial(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function primeiroDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}
