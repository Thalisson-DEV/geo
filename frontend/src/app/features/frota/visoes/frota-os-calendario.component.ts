import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesIconButtonComponent,
  CesStatusComponent,
  CesTone,
  NotificationService
} from '@ces/ui';
import { catchError, of, switchMap, tap } from 'rxjs';

import { EventoAgendaFrota, OrdemServicoDetalhe, TipoEventoAgendaFrota, rotuloOs } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaOrdemServicoEtapaComponent } from '../ordens-servico/frota-ordem-servico-etapa.component';

const VISIVEIS_POR_DIA = 3;
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Guarda os tipos escondidos: um tipo novo na agenda aparece ligado para quem já usava. */
const CHAVE_TIPOS_OCULTOS = 'ces_calendario_frota_tipos_ocultos';
/** Formato antigo (tipos ligados), convertido na primeira leitura. Só conhecia estes quatro tipos. */
const CHAVE_TIPOS_ANTIGA = 'ces_calendario_frota_tipos';
const TIPOS_DO_FORMATO_ANTIGO = ['OS_AGENDADA', 'OS_PREVISAO_TERMINO', 'DOCUMENTO_VENCIMENTO', 'CNH_VENCIMENTO'];

const TIPOS: { value: TipoEventoAgendaFrota; label: string; icon: string; tone: CesTone }[] = [
  { value: 'OS_AGENDADA', label: 'OS agendada', icon: 'pi-calendar', tone: 'info' },
  { value: 'OS_PREVISAO_TERMINO', label: 'Previsão de término', icon: 'pi-clock', tone: 'warning' },
  { value: 'DOCUMENTO_VENCIMENTO', label: 'Documento vencendo', icon: 'pi-file', tone: 'neutral' },
  { value: 'CNH_VENCIMENTO', label: 'CNH vencendo', icon: 'pi-id-card', tone: 'neutral' },
  { value: 'PREVENTIVA_PREVISTA', label: 'Preventiva prevista', icon: 'pi-calendar-clock', tone: 'warning' },
  { value: 'APOLICE_VENCIMENTO', label: 'Apólice vencendo', icon: 'pi-shield', tone: 'neutral' }
];
const ICONE: Record<TipoEventoAgendaFrota, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.icon])) as Record<TipoEventoAgendaFrota, string>;

interface DiaCalendario {
  iso: string;
  numero: number;
  noMes: boolean;
  hoje: boolean;
  fimDeSemana: boolean;
  itens: EventoAgendaFrota[];
}

/**
 * Calendário da frota no padrão do calendário das solicitações comerciais: grade do mês com a
 * agenda do dia ao lado, abrindo em "Hoje". Mostra OS agendadas, previsões de término (destacadas
 * quando atrasadas) e vencimentos de documentos, CNH e apólices. Arrastar uma OS agendada para outro dia abre
 * o reagendamento já preenchido; nada é gravado sem confirmar.
 */
@Component({
  selector: 'app-frota-os-calendario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CesAsyncStateComponent, CesButtonComponent, CesCalloutComponent, CesIconButtonComponent, CesStatusComponent, FrotaOrdemServicoEtapaComponent],
  styles: `
    :host { display: block; }
    .cal-shell { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr) 20rem; align-items: start; }
    .cal-card { border: 1px solid var(--ces-border); border-radius: var(--ces-radius-xl); background: var(--ces-surface); box-shadow: var(--ces-shadow-sm); overflow: hidden; }
    .cal-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; padding: 0.75rem 1rem; border-bottom: 1px solid var(--ces-border); }
    .cal-nav { display: flex; align-items: center; gap: 0.25rem; }
    .cal-title { margin: 0 0.5rem; font-size: var(--ces-font-title); font-weight: 700; color: var(--ces-foreground); min-width: 11rem; }
    .cal-resumo { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .cal-weekdays, .cal-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .cal-weekdays { background: var(--ces-surface-subtle); border-bottom: 1px solid var(--ces-border); }
    .cal-weekdays span { padding: 0.5rem; font-size: var(--ces-font-caption); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ces-foreground-muted); }
    .cal-week + .cal-week { border-top: 1px solid var(--ces-border); }
    .cal-day { position: relative; display: flex; flex-direction: column; gap: 0.25rem; min-height: 7.25rem; min-width: 0; padding: 0.375rem;
      border-left: 1px solid var(--ces-border); cursor: pointer; transition: background var(--ces-duration-fast) var(--ces-ease-standard); }
    .cal-day:first-child { border-left: 0; }
    .cal-day:hover { background: var(--ces-surface-subtle); }
    /* Fim de semana mais apagado nos dois temas: surface-subtle escurece no escuro e acinzenta no claro. */
    .cal-day--fds { background: color-mix(in srgb, var(--ces-surface-subtle) 55%, transparent); }
    .cal-day--fora { background: var(--ces-surface-subtle); }
    .cal-day--fora .cal-num { color: var(--ces-foreground-subtle); }
    .cal-day--sel { background: var(--ces-brand-soft); box-shadow: inset 0 0 0 2px var(--ces-brand); }
    .cal-day--alvo { background: var(--ces-info-soft); box-shadow: inset 0 0 0 2px var(--ces-info); }
    .cal-num { display: inline-flex; align-items: center; justify-content: center; align-self: flex-start; min-width: 1.75rem; height: 1.75rem; padding: 0 0.375rem;
      border: 0; border-radius: 999px; background: transparent; color: var(--ces-foreground); font: inherit; font-size: var(--ces-font-control); font-weight: 600; cursor: pointer; }
    .cal-num:focus-visible, .cal-pill:focus-visible, .cal-mais:focus-visible, .cal-agenda-item:focus-visible, .cal-filtro:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 2px; }
    .cal-day--hoje .cal-num { background: var(--p-primary-600); color: #fff; }
    .cal-pill { display: flex; align-items: center; gap: 0.375rem; width: 100%; min-width: 0; padding: 0.2rem 0.4rem; border: 1px solid var(--ces-status-border);
      border-radius: var(--ces-radius-sm); background: var(--ces-status-soft); color: var(--ces-status-ink); font: inherit; font-size: 0.72rem; font-weight: 600; text-align: left; cursor: pointer; }
    .cal-pill[draggable='true'] { cursor: grab; }
    .cal-pill:hover { filter: brightness(0.97); border-color: var(--ces-status-color); }
    .cal-pill .pi { font-size: 0.65rem; flex: none; }
    .cal-pill__txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cal-pill--atrasada { box-shadow: inset 3px 0 0 var(--ces-danger); }
    .cal-mais { align-self: flex-start; padding: 0.1rem 0.3rem; border: 0; border-radius: var(--ces-radius-sm); background: transparent; color: var(--ces-brand);
      font: inherit; font-size: 0.72rem; font-weight: 700; cursor: pointer; }
    .cal-mais:hover { background: var(--ces-brand-soft); }
    .cal-dots { display: none; }
    [data-tone='warning'] { --ces-status-color: var(--ces-warning); --ces-status-soft: var(--ces-warning-soft); --ces-status-ink: var(--ces-warning-text); --ces-status-border: color-mix(in srgb, var(--ces-warning) 35%, transparent); }
    [data-tone='info'] { --ces-status-color: var(--ces-info); --ces-status-soft: var(--ces-info-soft); --ces-status-ink: var(--ces-info-text); --ces-status-border: color-mix(in srgb, var(--ces-info) 35%, transparent); }
    [data-tone='success'] { --ces-status-color: var(--ces-success); --ces-status-soft: var(--ces-success-soft); --ces-status-ink: var(--ces-success-text); --ces-status-border: color-mix(in srgb, var(--ces-success) 35%, transparent); }
    [data-tone='danger'] { --ces-status-color: var(--ces-danger); --ces-status-soft: var(--ces-danger-soft); --ces-status-ink: var(--ces-danger-text); --ces-status-border: color-mix(in srgb, var(--ces-danger) 35%, transparent); }
    [data-tone='neutral'] { --ces-status-color: var(--ces-foreground-muted); --ces-status-soft: var(--ces-surface-muted); --ces-status-ink: var(--ces-foreground); --ces-status-border: var(--ces-border); }
    .cal-legenda { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.625rem 1rem; border-top: 1px solid var(--ces-border); font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); align-items: center; }
    .cal-filtro { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.625rem; border: 1px solid var(--ces-border); border-radius: 999px;
      background: var(--ces-surface); color: var(--ces-foreground-muted); font: inherit; font-size: var(--ces-font-caption); font-weight: 600; cursor: pointer; }
    .cal-filtro .pi { font-size: 0.7rem; color: var(--ces-status-color); }
    .cal-filtro[aria-pressed='true'] { border-color: var(--ces-status-color); background: var(--ces-status-soft); color: var(--ces-status-ink); }
    .cal-filtro[aria-pressed='false'] { text-decoration: line-through; opacity: 0.7; }
    .cal-agenda { position: sticky; top: 1rem; display: flex; flex-direction: column; max-height: calc(100vh - 8rem); }
    .cal-agenda__head { padding: 0.875rem 1rem; border-bottom: 1px solid var(--ces-border); }
    .cal-agenda__eyebrow { margin: 0; font-size: var(--ces-font-caption); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ces-foreground-muted); }
    .cal-agenda__title { margin: 0.125rem 0 0; font-size: var(--ces-font-title); font-weight: 700; color: var(--ces-foreground); }
    .cal-agenda__list { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; overflow-y: auto; }
    .cal-agenda__vazio { padding: 2rem 1rem; text-align: center; color: var(--ces-foreground-muted); font-size: var(--ces-font-control); }
    .cal-agenda__vazio .pi { display: block; margin-bottom: 0.5rem; font-size: 1.5rem; color: var(--ces-foreground-subtle); }
    .cal-agenda-item { display: grid; gap: 0.3rem; width: 100%; padding: 0.625rem 0.75rem; border: 1px solid var(--ces-border); border-left: 3px solid var(--ces-status-color);
      border-radius: var(--ces-radius-md); background: var(--ces-surface); color: var(--ces-foreground); font: inherit; text-align: left; cursor: pointer; }
    .cal-agenda-item:hover { background: var(--ces-surface-subtle); border-color: var(--ces-border-strong); border-left-color: var(--ces-status-color); }
    .cal-agenda-item__top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.375rem 0.5rem; min-width: 0; }
    .cal-agenda-item__titulo { min-width: 0; font-weight: 700; font-size: var(--ces-font-control); overflow-wrap: anywhere; }
    .cal-agenda-item__detalhe { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .cal-agenda-item__meta { display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
    .cal-agenda-item__meta .pi { font-size: 0.7rem; margin-right: 0.2rem; }
    @media (max-width: 64rem) { .cal-shell { grid-template-columns: minmax(0, 1fr); } .cal-agenda { position: static; max-height: none; } }
    @media (max-width: 40rem) {
      .cal-day { min-height: 3.25rem; padding: 0.25rem; align-items: center; }
      .cal-num { align-self: center; }
      .cal-pill, .cal-mais { display: none; }
      .cal-dots { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
      .cal-dots i { width: 6px; height: 6px; border-radius: 999px; background: var(--ces-status-color); }
      .cal-weekdays span { text-align: center; padding: 0.375rem 0; }
      .cal-title { min-width: 0; }
    }
    @media (prefers-reduced-motion: reduce) { .cal-day { transition: none; } }
  `,
  template: `
    @if (erro()) {
      <ces-async-state state="error" title="Não foi possível carregar o calendário" [description]="erro()!" actionLabel="Tentar novamente" (action)="recarregar()" />
    } @else {
      @if (truncado()) {
        <ces-callout tone="warning" title="Mês com muitos eventos">Mostrando os primeiros mil. Escolha uma base ou desligue algum tipo de evento.</ces-callout>
      }
      <div class="cal-shell">
        <section class="cal-card" aria-labelledby="cal-frota-titulo">
          <header class="cal-head">
            <div class="cal-nav">
              <ces-icon-button icon="pi pi-chevron-left" label="Mês anterior" size="icon-sm" (pressed)="mudarMes(-1)" />
              <h2 id="cal-frota-titulo" class="cal-title" aria-live="polite">{{ tituloMes() }}</h2>
              <ces-icon-button icon="pi pi-chevron-right" label="Próximo mês" size="icon-sm" (pressed)="mudarMes(1)" />
              <ces-button label="Hoje" variant="outline" size="sm" [disabled]="ehMesAtual()" (pressed)="irParaHoje()" />
            </div>
            <div class="cal-resumo" aria-live="polite">
              @if (carregando()) {
                <span><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Carregando…</span>
              } @else {
                <span>{{ totalNoMes() }} {{ totalNoMes() === 1 ? 'evento' : 'eventos' }} no mês</span>
                @if (atrasadosNoMes() > 0) {
                  <ces-status tone="danger" icon="pi pi-exclamation-triangle">{{ atrasadosNoMes() }} {{ atrasadosNoMes() === 1 ? 'atrasado ou vencido' : 'atrasados ou vencidos' }}</ces-status>
                }
              }
            </div>
          </header>

          <div role="grid" [attr.aria-label]="'Agenda da frota em ' + tituloMes()" [attr.aria-busy]="carregando()">
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
                    [class.cal-day--alvo]="!!arrastando() && sobre() === dia.iso"
                    [attr.aria-selected]="dia.iso === selecionado()"
                    (click)="selecionado.set(dia.iso)"
                    (dragover)="aoPassar($event, dia.iso)"
                    (dragleave)="sobre() === dia.iso && sobre.set(null)"
                    (drop)="aoSoltar($event, dia.iso)"
                  >
                    <button type="button" class="cal-num" [attr.aria-label]="rotuloDia(dia)" (click)="selecionar(dia.iso, $event)">{{ dia.numero }}</button>
                    @for (e of dia.itens.slice(0, visiveis); track e.tipo + e.idReferencia) {
                      <button
                        type="button"
                        class="cal-pill"
                        [class.cal-pill--atrasada]="e.atrasado"
                        [attr.data-tone]="e.tom"
                        [attr.draggable]="reagendavel(e) ? 'true' : null"
                        [attr.aria-label]="rotuloEvento(e)"
                        [title]="e.titulo + (e.detalhe ? ' · ' + e.detalhe : '')"
                        (dragstart)="iniciarArraste($event, e)"
                        (dragend)="encerrarArraste()"
                        (click)="abrirEvento(e, $event)"
                      >
                        <i [class]="'pi ' + icone[e.tipo]" aria-hidden="true"></i>
                        <span class="cal-pill__txt">{{ e.titulo }}</span>
                      </button>
                    }
                    @if (dia.itens.length > visiveis) {
                      <button type="button" class="cal-mais" (click)="selecionar(dia.iso, $event)">+{{ dia.itens.length - visiveis }} mais</button>
                    }
                    @if (dia.itens.length) {
                      <span class="cal-dots" aria-hidden="true">
                        @for (e of dia.itens.slice(0, 4); track e.tipo + e.idReferencia) { <i [attr.data-tone]="e.tom"></i> }
                      </span>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <footer class="cal-legenda" aria-label="Tipos de evento">
            <span>Mostrar:</span>
            @for (t of tipos; track t.value) {
              <button type="button" class="cal-filtro" [attr.data-tone]="t.tone" [attr.aria-pressed]="tiposAtivos().includes(t.value)" (click)="alternarTipo(t.value)">
                <i [class]="'pi ' + t.icon" aria-hidden="true"></i>{{ t.label }}
              </button>
            }
          </footer>
        </section>

        <aside class="cal-card cal-agenda" aria-labelledby="cal-frota-agenda-titulo">
          <div class="cal-agenda__head">
            <p class="cal-agenda__eyebrow">{{ agendaSelecionada().length }} {{ agendaSelecionada().length === 1 ? 'evento' : 'eventos' }}</p>
            <h3 id="cal-frota-agenda-titulo" class="cal-agenda__title">{{ tituloDiaSelecionado() }}</h3>
          </div>
          <div class="cal-agenda__list">
            @for (e of agendaSelecionada(); track e.tipo + e.idReferencia) {
              <button type="button" class="cal-agenda-item" [attr.data-tone]="e.tom" (click)="abrirEvento(e, $event)" [attr.aria-label]="rotuloEvento(e)">
                <span class="cal-agenda-item__top">
                  <span class="cal-agenda-item__titulo">{{ e.titulo }}</span>
                  <ces-status [tone]="e.tom" [icon]="'pi ' + icone[e.tipo]">{{ e.tipoRotulo }}</ces-status>
                </span>
                @if (e.detalhe) {
                  <span class="cal-agenda-item__detalhe">{{ e.detalhe }}</span>
                }
                <span class="cal-agenda-item__meta">
                  @if (e.instante) {
                    <span><i class="pi pi-clock" aria-hidden="true"></i>{{ e.instante | date: 'HH:mm' }}</span>
                  }
                  @if (e.base) {
                    <span><i class="pi pi-map-marker" aria-hidden="true"></i>{{ e.base }}</span>
                  }
                  @if (e.atrasado) {
                    <span><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>{{ e.tipo === 'OS_AGENDADA' ? 'Não iniciada' : e.tipo === 'OS_PREVISAO_TERMINO' ? 'Prazo estourado' : e.tipo === 'PREVENTIVA_PREVISTA' || e.tipo === 'APOLICE_VENCIMENTO' ? 'Vencida' : 'Vencido' }}</span>
                  }
                </span>
              </button>
            } @empty {
              <p class="cal-agenda__vazio"><i class="pi pi-calendar" aria-hidden="true"></i>Nada marcado neste dia.</p>
            }
          </div>
        </aside>
      </div>
    }

    <app-frota-ordem-servico-etapa [(visivel)]="etapaAberta" etapa="agendar" [ordem]="ordemSelecionada()" [dataSugerida]="dataSugerida()" (salvo)="aoReagendar($event)"></app-frota-ordem-servico-etapa>
  `
})
export class FrotaOsCalendarioComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly acesso = acessoFrota();

  readonly idsBase = input<string[]>([]);
  readonly abrirOs = output<string>();
  readonly abrirDocumentos = output<void>();
  readonly abrirCondutores = output<void>();
  readonly alterado = output<void>();

  protected readonly diasSemana = DIAS_SEMANA;
  protected readonly visiveis = VISIVEIS_POR_DIA;
  protected readonly tipos = TIPOS;
  protected readonly icone = ICONE;

  private readonly hoje = isoCivil(new Date());
  protected readonly mes = signal(primeiroDoMes(new Date()));
  protected readonly selecionado = signal<string>(this.hoje);
  protected readonly tiposAtivos = signal<TipoEventoAgendaFrota[]>(lerTipos());
  private readonly versao = signal(0);

  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly eventos = signal<EventoAgendaFrota[]>([]);
  protected readonly truncado = signal(false);

  protected readonly arrastando = signal<EventoAgendaFrota | null>(null);
  protected readonly sobre = signal<string | null>(null);
  protected readonly etapaAberta = signal(false);
  protected readonly ordemSelecionada = signal<OrdemServicoDetalhe | null>(null);
  protected readonly dataSugerida = signal<Date | null>(null);

  private readonly inicioGrade = computed(() => {
    const m = this.mes();
    return new Date(m.getFullYear(), m.getMonth(), 1 - m.getDay());
  });
  private readonly fimGrade = computed(() => {
    const i = this.inicioGrade();
    return new Date(i.getFullYear(), i.getMonth(), i.getDate() + 41);
  });

  private readonly visiveisNoFiltro = computed(() => {
    const ativos = this.tiposAtivos();
    return this.eventos().filter((e) => ativos.includes(e.tipo));
  });

  private readonly porDia = computed(() => {
    const mapa = new Map<string, EventoAgendaFrota[]>();
    for (const e of this.visiveisNoFiltro()) mapa.set(e.data, [...(mapa.get(e.data) ?? []), e]);
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
    const prefixo = isoCivil(this.mes()).substring(0, 7);
    return this.visiveisNoFiltro().filter((e) => e.data.startsWith(prefixo));
  });
  protected readonly totalNoMes = computed(() => this.doMes().length);
  protected readonly atrasadosNoMes = computed(() => this.doMes().filter((e) => e.atrasado).length);
  protected readonly agendaSelecionada = computed(() => this.porDia().get(this.selecionado()) ?? []);
  protected readonly tituloMes = computed(() => inicial(this.mes().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })));
  protected readonly ehMesAtual = computed(() => isoCivil(this.mes()).substring(0, 7) === this.hoje.substring(0, 7));
  protected readonly tituloDiaSelecionado = computed(() =>
    inicial(dataCivil(this.selecionado()).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))
  );

  private readonly consulta = computed(() => ({
    idsBase: this.idsBase(),
    inicio: isoCivil(this.inicioGrade()),
    fim: isoCivil(this.fimGrade()),
    versao: this.versao()
  }));

  constructor() {
    toObservable(this.consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap(({ idsBase, inicio, fim }) =>
          this.frota.agenda(inicio, fim, idsBase).pipe(
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
        this.eventos.set(res.eventos);
        this.truncado.set(res.truncado);
      });
  }

  recarregar(): void {
    this.versao.update((v) => v + 1);
  }

  protected mudarMes(delta: number): void {
    const m = this.mes();
    const novo = new Date(m.getFullYear(), m.getMonth() + delta, 1);
    this.mes.set(novo);
    this.selecionado.set(this.hoje.substring(0, 7) === isoCivil(novo).substring(0, 7) ? this.hoje : isoCivil(novo));
  }

  protected irParaHoje(): void {
    this.mes.set(primeiroDoMes(new Date()));
    this.selecionado.set(this.hoje);
  }

  protected selecionar(iso: string, evento: Event): void {
    evento.stopPropagation();
    this.selecionado.set(iso);
  }

  protected alternarTipo(tipo: TipoEventoAgendaFrota): void {
    const atual = this.tiposAtivos();
    const novo = atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo];
    this.tiposAtivos.set(novo);
    try {
      localStorage.setItem(CHAVE_TIPOS_OCULTOS, JSON.stringify(TIPOS.map((t) => t.value).filter((t) => !novo.includes(t))));
    } catch {
      /* preferência opcional */
    }
  }

  protected abrirEvento(e: EventoAgendaFrota, evento: Event): void {
    evento.stopPropagation();
    this.selecionado.set(e.data);
    if (e.tipo === 'OS_AGENDADA' || e.tipo === 'OS_PREVISAO_TERMINO') this.abrirOs.emit(e.idReferencia);
    else if (e.tipo === 'DOCUMENTO_VENCIMENTO') this.abrirDocumentos.emit();
    // Na preventiva a referência é o veículo: abre a aba Preventiva da ficha.
    else if (e.tipo === 'PREVENTIVA_PREVISTA') void this.router.navigate(['/frota/veiculos', e.idReferencia], { queryParams: { aba: 'preventiva' } });
    // Na apólice a referência é a própria apólice.
    else if (e.tipo === 'APOLICE_VENCIMENTO') void this.router.navigate(['/frota/seguros'], { queryParams: { apolice: e.idReferencia } });
    else this.abrirCondutores.emit();
  }

  protected reagendavel(e: EventoAgendaFrota): boolean {
    return e.tipo === 'OS_AGENDADA' && (this.acesso.editarOs() || this.acesso.executarOs());
  }

  protected iniciarArraste(evento: DragEvent, e: EventoAgendaFrota): void {
    if (!this.reagendavel(e)) return;
    evento.dataTransfer?.setData('text/plain', e.idReferencia);
    if (evento.dataTransfer) evento.dataTransfer.effectAllowed = 'move';
    this.arrastando.set(e);
  }

  protected encerrarArraste(): void {
    this.arrastando.set(null);
    this.sobre.set(null);
  }

  protected aoPassar(evento: DragEvent, iso: string): void {
    const e = this.arrastando();
    if (!e || e.data === iso) return;
    evento.preventDefault();
    this.sobre.set(iso);
  }

  /** Soltar noutro dia abre o reagendamento com a nova data e o horário original. */
  protected aoSoltar(evento: DragEvent, iso: string): void {
    evento.preventDefault();
    const e = this.arrastando();
    this.encerrarArraste();
    if (!e || e.data === iso) return;
    const original = e.instante ? new Date(e.instante) : null;
    const nova = dataCivil(iso);
    if (original) nova.setHours(original.getHours(), original.getMinutes(), 0, 0);
    else nova.setHours(8, 0, 0, 0);
    this.frota.detalharOrdemServico(e.idReferencia).subscribe({
      next: (detalhe) => {
        // Já iniciada ou cancelada por outra pessoa: o evento estava velho.
        if (detalhe.ordem.situacao !== 'AGENDADA') {
          this.notificacoes.warning(`${rotuloOs(detalhe.ordem.numero)} não está mais agendada. O calendário foi atualizado.`, { title: 'A OS mudou' });
          return this.recarregar();
        }
        this.ordemSelecionada.set(detalhe);
        this.dataSugerida.set(nova);
        this.etapaAberta.set(true);
      },
      error: (err) => this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível abrir a OS' })
    });
  }

  protected aoReagendar(detalhe: OrdemServicoDetalhe): void {
    this.dataSugerida.set(null);
    if (detalhe.ordem.agendadaPara) this.selecionado.set(isoCivil(new Date(detalhe.ordem.agendadaPara)));
    this.notificacoes.success(`${rotuloOs(detalhe.ordem.numero)} reagendada.`);
    this.recarregar();
    this.alterado.emit();
  }

  protected rotuloDia(dia: DiaCalendario): string {
    const data = dataCivil(dia.iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const n = dia.itens.length;
    return `${data}: ${n === 0 ? 'nada marcado' : n === 1 ? '1 evento' : n + ' eventos'}`;
  }

  protected rotuloEvento(e: EventoAgendaFrota): string {
    return [e.tipoRotulo, e.titulo, e.detalhe, e.atrasado ? 'atrasado' : null].filter(Boolean).join(', ');
  }
}

function isoCivil(data: Date): string {
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${m}-${d}`;
}

function dataCivil(iso: string): Date {
  const [a, m, d] = iso.substring(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

function inicial(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function primeiroDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

function lerTipos(): TipoEventoAgendaFrota[] {
  try {
    const ocultos = JSON.parse(localStorage.getItem(CHAVE_TIPOS_OCULTOS) ?? 'null');
    if (Array.isArray(ocultos)) return TIPOS.map((t) => t.value).filter((t) => !ocultos.includes(t));
    const ligados = JSON.parse(localStorage.getItem(CHAVE_TIPOS_ANTIGA) ?? 'null');
    if (Array.isArray(ligados)) {
      return TIPOS.map((t) => t.value).filter((t) => ligados.includes(t) || !TIPOS_DO_FORMATO_ANTIGO.includes(t));
    }
  } catch {
    /* preferência opcional */
  }
  return TIPOS.map((t) => t.value);
}
