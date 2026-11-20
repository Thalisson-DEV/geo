import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoAsyncStateComponent, GeoCalloutComponent, GeoStatusComponent, GeoTone } from '@geo/ui';

import {
  EventoTelemetria,
  ICONE_TIPO_EVENTO,
  SaidaForaExpediente,
  TOM_TIPO_EVENTO,
  TelemetriaVeiculo,
  UsoVeiculo,
  formatarConsumo,
  formatarMinutos,
  formatarMoeda,
  haQuanto
} from '../../../core/models/frota-telemetria.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { FrotaEventoTelemetriaDrawerComponent } from './frota-evento-telemetria-drawer.component';
import { FrotaMapaTelemetriaComponent, MarcadorMapa } from './frota-mapa-telemetria.component';

type Trajeto = '24h' | '7d';

const PERIODOS = [7, 30, 90] as const;

/**
 * Aba Uso da ficha do veículo: o que a telemetria diz do uso no período (km, média por dia útil,
 * motor ligado parado, custo por km), avisos só quando há algo a fazer (roda pouco, uso fora do
 * expediente), onde ele está agora e os eventos de condução. Nada de provedor ou rastreador.
 */
@Component({
  selector: 'app-frota-veiculo-telemetria',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, GeoAsyncStateComponent, GeoCalloutComponent, GeoStatusComponent,
    FrotaMapaTelemetriaComponent, FrotaEventoTelemetriaDrawerComponent],
  styles: `
    :host { display: grid; gap: 1.25rem; }
    .vu-topo { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .vu-topo p { margin: 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .vu-seg { display: inline-flex; padding: 2px; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .vu-seg button { min-height: calc(var(--geo-control-height-sm) - 4px); padding: 0 0.75rem; border: 0; border-radius: calc(var(--geo-radius-md) - 2px);
      background: transparent; color: var(--geo-foreground-muted); font: inherit; font-size: var(--geo-font-caption); font-weight: 600; cursor: pointer; }
    .vu-seg button:hover { color: var(--geo-foreground); }
    .vu-seg button[aria-pressed='true'] { background: var(--geo-surface); color: var(--geo-foreground); box-shadow: var(--geo-shadow-sm); }
    .vu-seg button:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .vu-avisos { display: grid; gap: 0.5rem; }
    .vu-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: 0.75rem; }
    .vu-card { display: grid; gap: 0.125rem; align-content: start; padding: 0.875rem 1rem; border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-lg); background: var(--geo-surface); }
    .vu-card__rotulo { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .vu-card__valor { font-size: 1.375rem; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
    .vu-card__apoio { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .vu-secao-topo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
    .vu-secao-topo h2 { margin: 0; }
    .vu-agora { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .vu-saidas { display: grid; grid-template-columns: minmax(0, 16rem) minmax(0, 1fr); gap: 0.75rem; align-items: start; }
    @media (max-width: 48rem) { .vu-saidas { grid-template-columns: 1fr; } }
    .vu-saidas ul { display: grid; gap: 0.375rem; margin: 0; padding: 0; list-style: none; max-height: 20rem; overflow: auto; }
    .vu-saida { display: grid; gap: 0.125rem; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--geo-border);
      border-radius: var(--geo-radius-md); background: var(--geo-surface); color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .vu-saida:hover { background: var(--geo-surface-subtle); }
    .vu-saida[aria-pressed='true'] { border-color: var(--geo-brand); box-shadow: inset 3px 0 0 var(--geo-brand); }
    .vu-saida:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .vu-saida strong { font-size: var(--geo-font-control); font-weight: 600; }
    .vu-saida span { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); font-variant-numeric: tabular-nums; }
    .vu-nota { margin: 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .vu-tipos { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .vu-eventos { display: grid; gap: 0.375rem; margin: 0; padding: 0; list-style: none; }
    .vu-evento { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.5rem; width: 100%; padding: 0.625rem 0.75rem;
      border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); color: inherit; font: inherit;
      text-align: left; cursor: pointer; }
    .vu-evento:hover { border-color: var(--geo-border-strong); }
    .vu-evento:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .vu-evento__texto { display: grid; gap: 0.125rem; min-width: 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .vu-evento__quando { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); white-space: nowrap; }
    .vu-skeleton { height: 18rem; border-radius: var(--geo-radius-lg); background: var(--geo-surface-muted); }
  `,
  template: `
    @if (erro()) {
      <geo-async-state state="error" title="Não foi possível carregar o uso" [description]="erro()!" [compact]="true"
        actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></geo-async-state>
    } @else if (!uso() || !telemetria()) {
      <div class="vu-skeleton" role="status" aria-label="Carregando o uso do veículo"></div>
    } @else if (!uso()!.rastreado) {
      <geo-async-state state="empty" title="Veículo sem rastreador" [compact]="true"
        description="O uso aparece aqui sozinho assim que o rastreador deste veículo mandar a primeira posição."></geo-async-state>
    } @else {
      @let u = uso()!;
      @let t = telemetria()!;
      <div class="vu-topo">
        <p>{{ u.medido ? 'De ' + (u.de | date: 'dd/MM') + ' a ' + (u.ate | date: 'dd/MM') + ' · expediente ' + u.expediente : 'Sem posição nesse período.' }}</p>
        <div class="vu-seg" role="group" aria-label="Período">
          @for (p of periodos; track p) {
            <button type="button" [attr.aria-pressed]="dias() === p" (click)="dias.set(p)">{{ p }} dias</button>
          }
        </div>
      </div>

      @if (u.rodaPouco || u.diasForaExpediente) {
        <div class="vu-avisos" aria-live="polite">
          @if (u.rodaPouco) {
            <geo-callout tone="warning" icon="pi pi-arrow-down-right" title="Roda pouco">
              Média de {{ u.kmPorDiaUtil | number: '1.0-1' }} km por dia útil, abaixo de {{ u.kmDiaRodaPouco }} km.
              {{ u.custo.locacao ? 'O aluguel no período foi ' + moeda(u.custo.locacao) + ': candidato a devolver ou remanejar.' : 'Candidato a remanejar para outra equipe.' }}
            </geo-callout>
          }
          @if (u.diasForaExpediente) {
            <geo-callout tone="warning" icon="pi pi-moon" title="Usado fora do expediente">
              {{ u.kmForaExpediente | number: '1.0-1' }} km em {{ u.diasForaExpediente }} {{ u.diasForaExpediente === 1 ? 'dia' : 'dias' }}. As saídas estão logo abaixo, com o trajeto.
            </geo-callout>
          }
        </div>
      }

      <div class="vu-cards" aria-label="Resumo do período">
        <div class="vu-card">
          <span class="vu-card__rotulo">Km rodado</span>
          <span class="vu-card__valor">{{ u.km | number: '1.0-0' }} km</span>
          <span class="vu-card__apoio">{{ u.diasUteisMedidos ? (u.kmPorDiaUtil | number: '1.0-1') + ' km por dia útil · ' + u.diasComUso + (u.diasComUso === 1 ? ' dia' : ' dias') + ' com uso' : 'Sem dia útil medido ainda' }}</span>
        </div>
        <div class="vu-card">
          <span class="vu-card__rotulo">Motor ligado parado</span>
          <span class="vu-card__valor">{{ horas(u.minutosLigadoParado) }}</span>
          <span class="vu-card__apoio">{{ u.minutosLigadoParado ? '≈ ' + (u.litrosOciosos | number: '1.0-0') + ' L' + (u.custo.custoOcioso ? ' · ' + moeda(u.custo.custoOcioso) : '') + ' de combustível parado' : 'Não ficou parado com o motor ligado' }}</span>
        </div>
        <div class="vu-card">
          <span class="vu-card__rotulo">Custo por km</span>
          <span class="vu-card__valor">{{ u.custo.porKm != null ? moeda(u.custo.porKm) : '—' }}</span>
          <span class="vu-card__apoio">{{ u.custo.total ? moeda(u.custo.total) + ' no período' + desdeTexto() : 'Sem custo lançado no período' }}</span>
        </div>
        <div class="vu-card">
          <span class="vu-card__rotulo">Consumo</span>
          <span class="vu-card__valor">{{ u.custo.kmPorLitro != null ? (u.custo.kmPorLitro | number: '1.0-1') + ' km/l' : consumo(t) }}</span>
          <span class="vu-card__apoio">{{ u.custo.kmPorLitro != null ? (u.custo.litros | number: '1.0-0') + ' l abastecidos' : 'Precisa de abastecimentos e km no período' }}</span>
        </div>
      </div>

      <section class="geo-sheet-section" aria-labelledby="vu-mapa">
        <div class="vu-secao-topo">
          <h2 id="vu-mapa"><i class="pi pi-map-marker" aria-hidden="true"></i> Onde está</h2>
          <div class="vu-seg" role="group" aria-label="Trajeto">
            <button type="button" [attr.aria-pressed]="trajetoDe() === '24h'" (click)="trajetoDe.set('24h')">Últimas 24 horas</button>
            <button type="button" [attr.aria-pressed]="trajetoDe() === '7d'" (click)="trajetoDe.set('7d')">7 dias</button>
          </div>
        </div>
        @if (t.rastreador; as r) {
          <p class="vu-agora">
            {{ r.velocidadeKmh && r.velocidadeKmh > 3 ? 'Andando a ' + (r.velocidadeKmh | number: '1.0-0') + ' km/h' : 'Parado' }}
            · posição {{ quanto(r.ultimaComunicacao) }}{{ r.condutor ? ' · ' + r.condutor : '' }}
          </p>
        }
        <app-frota-mapa-telemetria [marcadores]="marcadores()" [trajeto]="trajeto()" style="--mapa-altura: 320px"
          [descricao]="'Posição atual e trajeto de ' + (trajetoDe() === '24h' ? 'últimas 24 horas' : 'últimos 7 dias')"
          vazio="Ainda sem posição deste veículo."></app-frota-mapa-telemetria>
      </section>

      @if (u.saidas.length) {
        <section class="geo-sheet-section" aria-labelledby="vu-saidas">
          <h2 id="vu-saidas"><i class="pi pi-moon" aria-hidden="true"></i> Saídas fora do expediente</h2>
          @if (u.saidasRecortadas) { <p class="vu-nota">Mostrando as saídas dos últimos 31 dias.</p> }
          <div class="vu-saidas">
            <ul aria-label="Saídas">
              @for (s of u.saidas; track s.inicio) {
                <li>
                  <button type="button" class="vu-saida" [attr.aria-pressed]="saida() === s" (click)="saida.set(s)">
                    <strong>{{ s.diaSemana }} {{ s.inicio | date: 'dd/MM' }}, {{ s.inicio | date: 'HH:mm' }} às {{ s.fim | date: 'HH:mm' }}</strong>
                    <span>{{ s.km | number: '1.0-1' }} km · {{ horas(s.minutos) }}</span>
                  </button>
                </li>
              }
            </ul>
            <app-frota-mapa-telemetria [trajeto]="saida()?.trajeto ?? []" [marcadores]="marcadoresSaida()" style="--mapa-altura: 320px"
              descricao="Trajeto da saída fora do expediente"></app-frota-mapa-telemetria>
          </div>
        </section>
      }

      @if (u.custo.total) {
        <section class="geo-sheet-section" aria-labelledby="vu-custo">
          <h2 id="vu-custo"><i class="pi pi-calculator" aria-hidden="true"></i> Custo no período</h2>
          <dl class="geo-sheet">
            <div><dt>Combustível</dt><dd>{{ moeda(u.custo.combustivel) }}</dd></div>
            <div><dt>Manutenção</dt><dd>{{ moeda(u.custo.manutencao) }}</dd></div>
            <div><dt>Despesas</dt><dd>{{ moeda(u.custo.despesas) }}</dd></div>
            @if (u.custo.locacao != null) { <div><dt>Aluguel</dt><dd>{{ moeda(u.custo.locacao) }}</dd></div> }
            <div><dt>Total</dt><dd><strong>{{ moeda(u.custo.total) }}</strong></dd></div>
            <div><dt>Por km</dt><dd>{{ u.custo.porKm != null ? moeda(u.custo.porKm) : '—' }}</dd></div>
          </dl>
        </section>
      }

      <section class="geo-sheet-section" aria-labelledby="vu-eventos">
        <h2 id="vu-eventos"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> Eventos de condução</h2>
        @if (t.eventos30d.length) {
          <div class="vu-tipos" aria-label="Eventos nos últimos 30 dias">
            @for (c of t.eventos30d; track c.tipo) {
              <geo-status [tone]="tom[c.tipo]" [icon]="icone[c.tipo]">{{ c.total }} · {{ c.rotulo }}</geo-status>
            }
          </div>
          <ul class="vu-eventos">
            @for (e of t.ultimosEventos; track e.id) {
              <li>
                <button type="button" class="vu-evento" (click)="abrirEvento(e)" [attr.aria-label]="e.tipoRotulo + ' em ' + (e.ocorridoEm | date: 'dd/MM HH:mm')">
                  <span class="vu-evento__texto">
                    <geo-status [tone]="tom[e.tipo]" [icon]="icone[e.tipo]">{{ e.tipoRotulo }}</geo-status>
                    <span>{{ e.detalhe }}{{ e.condutor ? ' · ' + e.condutor : ' · condutor não identificado' }}</span>
                  </span>
                  <span class="vu-evento__quando">{{ e.ocorridoEm | date: 'dd/MM HH:mm' }}</span>
                </button>
              </li>
            }
          </ul>
          <a [routerLink]="['/frota/telemetria/eventos']" [queryParams]="{ busca: placaBusca() }">Ver todos os eventos deste veículo</a>
        } @else {
          <p class="vu-nota">Nenhum evento de condução nos últimos 30 dias.</p>
        }
      </section>
    }

    <app-frota-evento-telemetria-drawer [(visivel)]="eventoAberto" [evento]="eventoSelecionado()"></app-frota-evento-telemetria-drawer>
  `
})
export class FrotaVeiculoTelemetriaComponent {
  private readonly servico = inject(FrotaTelemetriaService);

  readonly idVeiculo = input.required<string>();
  readonly placa = input<string | null>(null);

  protected readonly periodos = PERIODOS;
  protected readonly tom: Record<string, GeoTone> = TOM_TIPO_EVENTO;
  protected readonly icone: Record<string, string> = ICONE_TIPO_EVENTO;
  protected readonly quanto = haQuanto;
  protected readonly horas = formatarMinutos;
  protected readonly moeda = formatarMoeda;

  protected readonly dias = signal<number>(30);
  protected readonly uso = signal<UsoVeiculo | null>(null);
  protected readonly telemetria = signal<TelemetriaVeiculo | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly trajetoDe = signal<Trajeto>('24h');
  protected readonly trajeto = signal<[number, number][]>([]);
  protected readonly saida = signal<SaidaForaExpediente | null>(null);
  protected readonly eventoAberto = signal(false);
  protected readonly eventoSelecionado = signal<EventoTelemetria | null>(null);

  protected readonly placaBusca = computed(() => (this.placa() ?? '').replace(/[^A-Za-z0-9]/g, ''));
  protected readonly marcadores = computed<MarcadorMapa[]>(() => {
    const r = this.telemetria()?.rastreador;
    return r?.latitude != null && r.longitude != null
      ? [{ latitude: r.latitude, longitude: r.longitude, rotulo: `Posição ${haQuanto(r.ultimaComunicacao)}`, tom: r.semComunicacao ? 'warning' : 'brand' }]
      : [];
  });
  protected readonly marcadoresSaida = computed<MarcadorMapa[]>(() => {
    const t = this.saida()?.trajeto ?? [];
    if (!t.length) return [];
    return [
      { latitude: t[0][0], longitude: t[0][1], rotulo: 'Início da saída', tom: 'warning', tamanho: 6 },
      { latitude: t[t.length - 1][0], longitude: t[t.length - 1][1], rotulo: 'Fim da saída', tom: 'danger', tamanho: 6 }
    ];
  });
  /** Rastreador ligado no meio do período: o custo conta só a partir dele. */
  protected readonly desdeTexto = computed(() => {
    const u = this.uso();
    if (!u || u.custo.desde <= u.de) return '';
    const [, m, d] = u.custo.desde.split('-');
    return ` · desde ${d}/${m}, quando o rastreador começou a medir`;
  });

  constructor() {
    effect(() => {
      this.idVeiculo();
      untracked(() => this.carregarTelemetria());
    });
    effect(() => {
      const dias = this.dias();
      this.idVeiculo();
      untracked(() => this.carregarUso(dias));
    });
    effect(() => {
      const de = this.trajetoDe();
      const rastreado = this.telemetria()?.rastreado;
      untracked(() => {
        if (rastreado) this.carregarTrajeto(de);
      });
    });
  }

  carregar(): void {
    this.erro.set(null);
    this.carregarTelemetria();
    this.carregarUso(this.dias());
  }

  protected consumo(t: TelemetriaVeiculo): string {
    return formatarConsumo(t.consumo30d, t.unidade);
  }

  protected abrirEvento(e: EventoTelemetria): void {
    this.eventoSelecionado.set(e);
    this.eventoAberto.set(true);
  }

  private carregarTelemetria(): void {
    this.servico.veiculo(this.idVeiculo()).subscribe({
      next: (t) => this.telemetria.set(t),
      error: (e) => this.erro.set(getErrorMessage(e))
    });
  }

  private carregarUso(dias: number): void {
    this.servico.uso(this.idVeiculo(), dias).subscribe({
      next: (u) => {
        this.uso.set(u);
        this.saida.set(u.saidas[0] ?? null);
      },
      error: (e) => this.erro.set(getErrorMessage(e))
    });
  }

  private carregarTrajeto(de: Trajeto): void {
    const ate = new Date();
    const inicio = new Date(ate.getTime() - (de === '24h' ? 1 : 7) * 86_400_000);
    this.servico.trajeto(this.idVeiculo(), inicio.toISOString(), ate.toISOString()).subscribe({
      next: (t) => this.trajeto.set(t.pontos.filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => [p.latitude!, p.longitude!] as [number, number])),
      error: () => this.trajeto.set([])
    });
  }
}
