import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CesAsyncStateComponent, CesButtonComponent, CesCalloutComponent, CesIconButtonComponent, CesStatusComponent } from '@ces/ui';
import { catchError, of, switchMap, tap } from 'rxjs';

import { FechamentoFiltro, FechamentoResumo } from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { dataCivil, isoCivil } from '../../almoxarifado/solicitacoes-material/solicitacao-comercial-status';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { AGENDA, ItemAgenda, agendaDe, dataHora, quantidade, rotuloObra, tipoFechamento } from './fechamento-ui';

const LIMITE = 500;
const VISIVEIS_POR_DIA = 3;
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Dia {
  iso: string;
  numero: number;
  noMes: boolean;
  hoje: boolean;
  fimDeSemana: boolean;
  itens: FechamentoResumo[];
}

/**
 * Agenda do fechamento: cada solicitação aberta no dia em que vence o prazo em curso (reserva ou
 * movimentação) e cada movimentada no dia em que terminou.
 */
@Component({
  selector: 'app-fechamento-calendario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesAsyncStateComponent, CesButtonComponent, CesCalloutComponent, CesIconButtonComponent, CesStatusComponent],
  styleUrl: '../../almoxarifado/solicitacoes-material/solicitacoes-comerciais-calendario/solicitacoes-comerciais-calendario.component.css',
  template: `
    @if (erro()) {
      <ces-async-state type="error" title="Não foi possível carregar o calendário" [description]="erro()!" actionLabel="Tentar novamente" (actionPressed)="recarregar()" />
    } @else {
      @if (truncado()) {
        <ces-callout tone="warning" title="Mês com muitas solicitações">
          Mostrando {{ limite }} de {{ total() }}. Use os filtros ou os atalhos de status para reduzir o recorte.
        </ces-callout>
      }
      <div class="cal-shell">
        <section class="cal-card" aria-labelledby="calf-titulo">
          <header class="cal-head">
            <div class="cal-nav">
              <ces-icon-button icon="pi pi-chevron-left" label="Mês anterior" size="icon-sm" (pressed)="mudarMes(-1)" />
              <h2 id="calf-titulo" class="cal-title" aria-live="polite">{{ tituloMes() }}</h2>
              <ces-icon-button icon="pi pi-chevron-right" label="Próximo mês" size="icon-sm" (pressed)="mudarMes(1)" />
              <ces-button label="Hoje" variant="outline" size="sm" [disabled]="ehMesAtual()" (pressed)="irParaHoje()" />
            </div>
            <div class="cal-resumo" aria-live="polite">
              @if (carregando()) {
                <span><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Carregando…</span>
              } @else {
                <span>{{ doMes().length }} {{ doMes().length === 1 ? 'solicitação' : 'solicitações' }} no mês</span>
                @if (atrasadasNoMes() > 0) {
                  <ces-status tone="danger" icon="pi pi-exclamation-triangle">{{ atrasadasNoMes() }} {{ atrasadasNoMes() === 1 ? 'atrasada' : 'atrasadas' }}</ces-status>
                }
              }
            </div>
          </header>

          <div role="grid" [attr.aria-label]="'Prazos do encerramento em ' + tituloMes()" [attr.aria-busy]="carregando()">
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
                      <button type="button" class="cal-pill" [class.cal-pill--atrasada]="atrasada(s)" [attr.data-tone]="agenda(s).tone"
                        [attr.aria-label]="rotulo(s)" (click)="abrirItem(s, $event)">
                        <i [class]="'pi ' + agenda(s).icon" aria-hidden="true"></i>
                        <span class="cal-pill__tag">{{ s.tipo }}</span>
                        <span class="cal-pill__txt">{{ obra(s) }}</span>
                      </button>
                    }
                    @if (dia.itens.length > visiveis) {
                      <button type="button" class="cal-mais" (click)="selecionar(dia.iso, $event)">+{{ dia.itens.length - visiveis }} mais</button>
                    }
                    @if (dia.itens.length) {
                      <span class="cal-dots" aria-hidden="true">
                        @for (s of dia.itens.slice(0, 4); track s.id) { <i [attr.data-tone]="agenda(s).tone"></i> }
                      </span>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <footer class="cal-legenda" aria-label="Legenda">
            @for (s of legenda; track s.value) {
              <span [attr.data-tone]="s.tone"><i [class]="'pi ' + s.icon" aria-hidden="true"></i>{{ s.label }} <strong>{{ contagem().get(s.value) ?? 0 }}</strong></span>
            }
          </footer>
        </section>

        <aside class="cal-card cal-agenda" aria-labelledby="calf-agenda-titulo">
          <div class="cal-agenda__head">
            <p class="cal-agenda__eyebrow">{{ agendaDoDia().length }} {{ agendaDoDia().length === 1 ? 'solicitação' : 'solicitações' }}</p>
            <h3 id="calf-agenda-titulo" class="cal-agenda__title">{{ tituloDia() }}</h3>
          </div>
          <div class="cal-agenda__list">
            @for (s of agendaDoDia(); track s.id) {
              <button type="button" class="cal-agenda-item" [attr.data-tone]="agenda(s).tone" (click)="abrir.emit(s)" [attr.aria-label]="rotulo(s)">
                <span class="cal-agenda-item__top">
                  <span class="cal-agenda-item__codigo">
                    <span class="cal-agenda-item__tag">{{ s.tipo }}</span>
                    <span class="cal-agenda-item__id">#{{ s.id.substring(0, 8) }}</span>
                  </span>
                  <ces-status [tone]="agenda(s).tone" [icon]="'pi ' + agenda(s).icon">{{ agenda(s).label }}</ces-status>
                </span>
                <span class="cal-agenda-item__titulo">{{ obra(s) }}</span>
                <span class="cal-agenda-item__rota">{{ rota(s) }}</span>
                <span class="cal-agenda-item__meta">
                  <span><i class="pi pi-clock" aria-hidden="true"></i>{{ quando(s) }}</span>
                  <span><i class="pi pi-hashtag" aria-hidden="true"></i>{{ s.numeroReserva ? 'Reserva ' + s.numeroReserva : 'Sem reserva' }}</span>
                  <span><i class="pi pi-box" aria-hidden="true"></i>{{ quantidade(s.quantidadeMovimentada) }} de {{ quantidade(s.quantidadeSolicitada) }}</span>
                  @if (atrasada(s)) {
                    <span class="cal-agenda-item__alerta"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>Atrasada</span>
                  }
                  @if (s.possuiPendencia) {
                    <span><i class="pi pi-flag" aria-hidden="true"></i>Com pendência</span>
                  }
                </span>
              </button>
            } @empty {
              <p class="cal-agenda__vazio"><i class="pi pi-calendar" aria-hidden="true"></i>Nenhum prazo neste dia.</p>
            }
          </div>
        </aside>
      </div>
    }
  `
})
export class FechamentoCalendarioComponent {
  private readonly service = inject(FechamentoObraService);

  /** Recorte da tela, sem paginação. */
  readonly filtros = input<FechamentoFiltro>({});
  readonly abrir = output<FechamentoResumo>();

  protected readonly diasSemana = DIAS_SEMANA;
  protected readonly visiveis = VISIVEIS_POR_DIA;
  protected readonly limite = LIMITE;
  protected readonly legenda: readonly ItemAgenda[] = Object.values(AGENDA);
  protected readonly agenda = agendaDe;
  protected readonly obra = (s: FechamentoResumo) => rotuloObra(s.obra);
  protected readonly quantidade = quantidade;

  private readonly hoje = isoCivil(new Date());
  protected readonly mes = signal(primeiroDoMes(new Date()));
  protected readonly selecionado = signal(this.hoje);
  private readonly versao = signal(0);

  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly itens = signal<FechamentoResumo[]>([]);
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
    const mapa = new Map<string, FechamentoResumo[]>();
    for (const s of this.itens()) {
      const dia = diaDe(s);
      if (dia) mapa.set(dia, [...(mapa.get(dia) ?? []), s]);
    }
    return mapa;
  });

  protected readonly semanas = computed<Dia[][]>(() => {
    const inicio = this.inicioGrade();
    const mes = this.mes().getMonth();
    const porDia = this.porDia();
    const semanas: Dia[][] = [];
    for (let w = 0; w < 6; w++) {
      const semana: Dia[] = [];
      for (let d = 0; d < 7; d++) {
        const data = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + w * 7 + d);
        const iso = isoCivil(data);
        semana.push({ iso, numero: data.getDate(), noMes: data.getMonth() === mes, hoje: iso === this.hoje, fimDeSemana: d === 0 || d === 6, itens: porDia.get(iso) ?? [] });
      }
      semanas.push(semana);
    }
    return semanas;
  });

  protected readonly doMes = computed(() => {
    const prefixo = isoCivil(this.mes()).substring(0, 7);
    return this.itens().filter((s) => diaDe(s)?.startsWith(prefixo));
  });
  protected readonly atrasadasNoMes = computed(() => this.doMes().filter((s) => this.atrasada(s)).length);
  protected readonly contagem = computed(() => {
    const mapa = new Map<string, number>();
    for (const s of this.doMes()) mapa.set(agendaDe(s).value, (mapa.get(agendaDe(s).value) ?? 0) + 1);
    return mapa;
  });
  protected readonly agendaDoDia = computed(() => this.porDia().get(this.selecionado()) ?? []);

  protected readonly tituloMes = computed(() => inicial(this.mes().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })));
  protected readonly ehMesAtual = computed(() => isoCivil(this.mes()).substring(0, 7) === this.hoje.substring(0, 7));
  protected readonly tituloDia = computed(() => inicial(dataCivil(this.selecionado()).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })));

  private readonly consulta = computed(() => ({ filtros: this.filtros(), inicio: isoCivil(this.inicioGrade()), fim: isoCivil(this.fimGrade()), versao: this.versao() }));

  constructor() {
    toObservable(this.consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap(({ filtros, inicio, fim }) =>
          this.service.listar({ ...filtros, agendaDe: inicio, agendaAte: fim, page: 0, size: LIMITE, ordenacao: 'prazo', direcao: 'asc' }).pipe(
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

  protected abrirItem(s: FechamentoResumo, evento: Event): void {
    evento.stopPropagation();
    this.abrir.emit(s);
  }

  protected atrasada(s: FechamentoResumo): boolean {
    return s.prazoVigente.situacao === 'ATRASADO';
  }

  protected rota(s: FechamentoResumo): string {
    const almoxarifado = formatarAlmoxarifado(s.almoxarifadoAtendimento?.nome);
    return `${tipoFechamento(s.tipo).adicao ? `${almoxarifado} → obra` : `Obra → ${almoxarifado}`} · ${tipoFechamento(s.tipo).nome}`;
  }

  protected quando(s: FechamentoResumo): string {
    return s.situacao === 'MOVIMENTADA' ? `Concluída ${dataHora(s.movimentacaoConcluidaEm)}` : `Vence ${dataHora(s.prazoVigente.limite)}`;
  }

  protected rotuloDia(dia: Dia): string {
    const data = dataCivil(dia.iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const n = dia.itens.length;
    return `${data}: ${n === 0 ? 'nenhuma solicitação' : n === 1 ? '1 solicitação' : n + ' solicitações'}`;
  }

  protected rotulo(s: FechamentoResumo): string {
    const partes = [`Solicitação ${s.tipo} de ${rotuloObra(s.obra)}`, agendaDe(s).label];
    if (this.atrasada(s)) partes.push('atrasada');
    return partes.join(', ');
  }
}

/** Dia em que a solicitação cai: o prazo em curso ou, se terminou, a conclusão. */
function diaDe(s: FechamentoResumo): string | null {
  const valor = s.prazoVigente.limite ?? s.movimentacaoConcluidaEm;
  return valor ? isoCivil(new Date(valor)) : null;
}

function inicial(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function primeiroDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}
