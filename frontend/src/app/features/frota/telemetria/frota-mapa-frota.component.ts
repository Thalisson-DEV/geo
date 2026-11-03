import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Params, Router, RouterLink } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesIconButtonComponent,
  CesMultiSelectComponent,
  CesStatusComponent,
  CesTextInputComponent
} from '@ces/ui';
import { interval } from 'rxjs';

import {
  ESTADOS_MAPA,
  EstadoMapa,
  EventoTelemetria,
  ICONE_TIPO_EVENTO,
  TOM_TIPO_EVENTO,
  VeiculoMapa,
  haQuanto
} from '../../../core/models/frota-telemetria.models';
import { formatarMedicao, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { desenharTrajeto, dividirTrajeto } from '../../../shared/utils/trajeto-mapa';
import { acessoFrota } from '../shared/frota-acesso';
import { basesFrota } from '../shared/frota-lista';
import { motivosDoVeiculo } from './frota-mapa-atencao';

// Leaflet é carregado globalmente (index.html), como nos demais mapas do CES.
declare const L: any;

/** O backend lê os rastreadores a cada 2 minutos; a tela confere a cada minuto. */
const ATUALIZACAO_MS = 60_000;
const CHAVE_PREFERENCIAS = 'ces_mapa_frota_preferencias';
/** Abaixo deste zoom, veículos próximos viram grupo com a contagem. */
const ZOOM_SEM_GRUPOS = 13;
/** Placas aparecem a partir deste zoom (antes, ficariam umas sobre as outras). */
const ZOOM_PLACAS = 12;
const GRADE_PX = 56;

interface AtalhoModulo {
  rotulo: string;
  icone: string;
  rota: unknown[];
  queryParams?: Params;
}

interface Preferencias {
  /** Busca e lista recolhidas: o mapa ocupa a largura toda. */
  painelRecolhido: boolean;
  placas: boolean;
  eventos: boolean;
  estados: EstadoMapa[];
}

/**
 * Mapa da frota: cada veículo rastreado onde está agora, na cor do estado (em movimento, ligado
 * parado, desligado, sem sinal), com a lista ao lado para buscar e filtrar. Clicar num veículo
 * abre o cartão com o que a frota sabe dele e o trajeto do dia. A camada de eventos mostra onde
 * aconteceram os eventos de condução das últimas 24 horas.
 */
@Component({
  selector: 'app-frota-mapa-frota',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, CesAsyncStateComponent, CesButtonComponent, CesIconButtonComponent, CesMultiSelectComponent,
    CesStatusComponent, CesTextInputComponent],
  styles: `
    .mf { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; }
    @media (min-width: 64rem) { .mf { grid-template-columns: 21rem minmax(0, 1fr); } }
    @media (min-width: 64rem) { .mf--recolhido { grid-template-columns: minmax(0, 1fr); } }
    .mf-painel__topo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: -0.25rem 0; }
    .mf-painel__titulo { margin: 0; font-size: var(--ces-font-control); font-weight: 700; }
    .mf-painel__titulo span { color: var(--ces-foreground-muted); font-weight: 600; }
    .mf-abrir { position: absolute; z-index: 500; top: 0.75rem; left: 3.5rem; }

    .mf-painel { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; padding: 0.875rem; border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-lg); background: var(--ces-surface); }
    @media (min-width: 64rem) { .mf-painel { height: var(--mf-altura); } }
    .mf-estados { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.375rem; }
    .mf-estado { display: flex; align-items: center; gap: 0.5rem; min-width: 0; padding: 0.5rem 0.625rem; border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-md); background: var(--ces-surface); color: var(--ces-foreground-muted); font: inherit;
      font-size: var(--ces-font-caption); text-align: left; cursor: pointer; }
    .mf-estado:hover { border-color: var(--ces-border-strong); }
    .mf-estado:focus-visible, .mf-item:focus-visible, .mf-camada:focus-within { outline: 2px solid var(--ces-focus-ring); outline-offset: 2px; }
    .mf-estado[aria-pressed='false'] { opacity: 0.55; }
    .mf-estado strong { margin-left: auto; color: var(--ces-foreground); font-size: var(--ces-font-control); font-variant-numeric: tabular-nums; }
    .mf-ponto { flex: none; width: 0.625rem; height: 0.625rem; border-radius: 999px; background: var(--mf-cor); }

    .mf-lista { display: grid; align-content: start; gap: 0.25rem; min-height: 0; margin: 0; padding: 0; overflow: auto; list-style: none; }
    @media (max-width: 63.99rem) { .mf-lista { max-height: 22rem; } }
    .mf-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.5rem; width: 100%; padding: 0.5rem 0.625rem;
      border: 1px solid transparent; border-radius: var(--ces-radius-md); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .mf-item:hover { background: var(--ces-surface-muted); }
    .mf-item[aria-current='true'] { border-color: var(--ces-brand); background: var(--ces-brand-soft); }
    .mf-item__texto { display: grid; min-width: 0; }
    .mf-item__placa { font-weight: 700; font-size: var(--ces-font-control); }
    .mf-item__apoio { overflow: hidden; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); text-overflow: ellipsis; white-space: nowrap; }
    .mf-item__lado { display: grid; justify-items: end; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); white-space: nowrap; }
    .mf-rodape { margin: 0; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .mf-rodape--acao { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .mf-limpar { padding: 0; border: 0; background: none; color: var(--ces-brand); font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; }
    .mf-limpar:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 2px; }

    .mf-mapa-area { position: relative; min-width: 0; height: var(--mf-altura); border: 1px solid var(--ces-border); border-radius: var(--ces-radius-lg);
      overflow: hidden; background: var(--ces-surface-muted); }
    .mf-mapa { position: absolute; inset: 0; }
    .mf-camadas { position: absolute; z-index: 500; top: 0.75rem; right: 0.75rem; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.375rem; }
    .mf-camada { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.375rem 0.625rem; border: 1px solid var(--ces-border);
      border-radius: 999px; background: var(--ces-surface); box-shadow: var(--ces-shadow-sm); font-size: var(--ces-font-caption); font-weight: 600; cursor: pointer; }
    .mf-camada input { margin: 0; accent-color: var(--ces-brand); }
    .mf-cartao { position: absolute; z-index: 500; left: 0.75rem; bottom: 0.75rem; display: grid; gap: 1rem; width: min(25rem, calc(100% - 1.5rem));
      max-height: calc(100% - 1.5rem); padding: 1.125rem 1.25rem 1.25rem; overflow: auto; border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-lg); background: var(--ces-surface); box-shadow: var(--ces-shadow-lg); }
    .mf-cartao__topo { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 0.75rem; }
    .mf-cartao__icone { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 999px; background: var(--mf-cor);
      color: var(--ces-surface); font-size: 1.125rem; }
    .mf-cartao__titulo { margin: 0; font-size: 1.25rem; font-weight: 700; line-height: 1.2; }
    .mf-cartao__sub { margin: 0.125rem 0 0; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); line-height: 1.4; }
    .mf-cartao__selos { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .mf-cartao dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.875rem 1rem; margin: 0; padding: 0.875rem 1rem;
      border-radius: var(--ces-radius-md); background: var(--ces-surface-muted); }
    .mf-cartao dt { margin-bottom: 0.125rem; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .mf-cartao dd { margin: 0; font-size: var(--ces-font-control); font-weight: 600; overflow-wrap: anywhere; }
    .mf-cartao dd.mf-cartao__velocidade { font-size: 1.5rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .mf-cartao dd.mf-cartao__velocidade small { margin-left: 0.25rem; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); font-weight: 600; }
    .mf-cartao__apoio { display: block; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); font-weight: 400; }
    .mf-cartao__acoes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
    .mf-cartao__trajeto { margin: -0.5rem 0 0; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .mf-secao__titulo { margin: 0 0 0.5rem; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.04em; }
    .mf-modulos__grade { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    .mf-atalho { display: grid; justify-items: center; gap: 0.375rem; padding: 0.75rem 0.25rem; border: 1px solid var(--ces-border);
      border-radius: var(--ces-radius-md); color: var(--ces-foreground); font-size: var(--ces-font-caption); font-weight: 600; text-align: center;
      text-decoration: none; }
    .mf-atalho .pi { color: var(--ces-brand); font-size: 1rem; }
    .mf-atalho:hover { border-color: var(--ces-border-strong); background: var(--ces-surface-muted); }
    .mf-atalho:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 2px; }
    .mf-fechar { display: inline-grid; place-items: center; width: 2rem; height: 2rem; border: 0; border-radius: var(--ces-radius-md);
      background: transparent; color: var(--ces-foreground-muted); cursor: pointer; }
    .mf-fechar:hover { background: var(--ces-surface-muted); color: var(--ces-foreground); }
    .mf-fechar:focus-visible { outline: 2px solid var(--ces-focus-ring); }
    .mf-aviso { position: absolute; z-index: 500; top: 0.75rem; left: var(--mf-aviso-esquerda, 3.5rem); right: 0.75rem; max-width: 28rem; display: flex; gap: 0.5rem;
      align-items: start; padding: 0.5rem 0.75rem; border: 1px solid var(--ces-warning); border-radius: var(--ces-radius-md);
      background: var(--ces-warning-soft); color: var(--ces-warning-text); font-size: var(--ces-font-caption); box-shadow: var(--ces-shadow-sm); }
    .mf-aviso .pi { margin-top: 0.125rem; }
    .mf-alertas { display: grid; gap: 0.625rem; margin: 0; padding: 0.75rem 0.875rem; border: 1px solid var(--ces-danger);
      border-radius: var(--ces-radius-md); background: var(--ces-danger-soft); list-style: none; }
    .mf-alertas li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 0.5rem; font-size: var(--ces-font-control); }
    .mf-alertas li .pi { font-size: 0.875rem; }
    .mf-alertas__perigo .pi { color: var(--ces-danger); }
    .mf-alertas__aviso .pi { color: var(--ces-warning); }
    .mf-alertas a { color: var(--ces-brand); font-size: var(--ces-font-caption); font-weight: 600; white-space: nowrap; }
    .mf-vazio { position: absolute; inset: 0; z-index: 400; display: grid; place-items: center; padding: 1rem; }
  `,
  host: { '[style.--mf-altura]': '"max(32rem, calc(100dvh - 17rem))"' },
  template: `
    <div class="mf" [class.mf--recolhido]="painelRecolhido()">
      @if (!painelRecolhido()) {
      <aside class="mf-painel" aria-label="Veículos no mapa">
        <div class="mf-painel__topo">
          <h2 class="mf-painel__titulo">Veículos <span>{{ visiveis().length }}</span></h2>
          <ces-icon-button icon="pi pi-angle-double-left" label="Recolher a lista de veículos" tooltip="Recolher a lista" size="icon-sm"
            (pressed)="alternarPainel()"></ces-icon-button>
        </div>
        <ces-text-input label="Buscar" [labelVisible]="false" placeholder="Placa, modelo ou condutor" [(value)]="busca"></ces-text-input>
        <ces-multiselect label="Base" [labelVisible]="false" [options]="bases.opcoes()" [(value)]="idsBase" placeholder="Todas as bases"></ces-multiselect>

        <div class="mf-estados" role="group" aria-label="Mostrar por estado">
          @for (e of estados; track e.value) {
            <button type="button" class="mf-estado" [style.--mf-cor]="'var(--ces-' + e.token + ')'"
              [attr.aria-pressed]="estadosVisiveis().includes(e.value)" (click)="alternarEstado(e.value)">
              <span class="mf-ponto" aria-hidden="true"></span>{{ e.label }}<strong>{{ contagem()[e.value] }}</strong>
            </button>
          }
        </div>

        @if (erro()) {
          <ces-async-state state="error" title="Não foi possível carregar o mapa" [description]="erro()!" [compact]="true"
            actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></ces-async-state>
        } @else {
          <ul class="mf-lista" aria-label="Veículos">
            @for (v of visiveis(); track v.idVeiculo) {
              <li>
                <button type="button" class="mf-item" [attr.aria-current]="selecionado()?.idVeiculo === v.idVeiculo" (click)="selecionar(v, true)"
                  [style.--mf-cor]="cor(v.estado)">
                  <span class="mf-ponto" aria-hidden="true"></span>
                  <span class="mf-item__texto">
                    <span class="mf-item__placa">{{ placa(v.placa) }}</span>
                    <span class="mf-item__apoio">{{ v.estadoRotulo }}{{ v.modelo ? ' · ' + v.modelo : '' }}{{ condutor(v) ? ' · ' + condutor(v) : '' }}</span>
                  </span>
                  <span class="mf-item__lado">
                    <span>{{ v.estado === 'EM_MOVIMENTO' ? (v.velocidadeKmh | number: '1.0-0') + ' km/h' : quanto(v.ultimaComunicacao) }}</span>
                    @if (v.eventos24h) { <span>{{ v.eventos24h }} evento{{ v.eventos24h === 1 ? '' : 's' }}</span> }
                  </span>
                </button>
              </li>
            } @empty {
              @if (carregando()) {
                <li class="mf-rodape">Carregando os veículos…</li>
              } @else {
                @if (veiculos().length) {
                  <li class="mf-rodape mf-rodape--acao">
                    <span>Nenhum veículo com esse recorte.</span>
                    <button type="button" class="mf-limpar" (click)="mostrarTodos()">Mostrar todos</button>
                  </li>
                } @else {
                  <li class="mf-rodape">Nenhum veículo rastreado com posição ainda.</li>
                }
              }
            }
          </ul>
        }
        <p class="mf-rodape" aria-live="polite">
          {{ visiveis().length }} de {{ veiculos().length }} no mapa{{ semPosicao() ? ' · ' + semPosicao() + ' sem posição' : '' }} ·
          atualizado {{ quanto(geradoEm()) }}, a cada minuto
        </p>
      </aside>
      }

      <div class="mf-mapa-area">
        <div #mapa class="mf-mapa" role="application" aria-label="Mapa da frota. Use a lista ao lado para escolher um veículo pelo teclado."></div>

        @if (painelRecolhido()) {
          <div class="mf-abrir">
            <ces-button size="sm" variant="secondary" icon="pi pi-list" [label]="'Veículos (' + visiveis().length + ')'"
              ariaLabel="Mostrar a busca e a lista de veículos" (pressed)="alternarPainel()"></ces-button>
          </div>
        }

        @if (atrasadasDesde(); as desde) {
          <div class="mf-aviso" role="status" [style.--mf-aviso-esquerda]="painelRecolhido() ? '11rem' : null">
            <i class="pi pi-clock" aria-hidden="true"></i>
            <span>Posições atrasadas desde {{ desde | date: "dd/MM 'às' HH:mm" }}. O mapa volta a se mover sozinho quando a leitura voltar.</span>
          </div>
        }
        <div class="mf-camadas">
          <label class="mf-camada"><input type="checkbox" [checked]="mostrarPlacas()" (change)="alternarPreferencia('placas')" />Placas</label>
          <label class="mf-camada"><input type="checkbox" [checked]="mostrarEventos()" (change)="alternarPreferencia('eventos')" />Eventos 24 h</label>
          <button type="button" class="mf-camada" (click)="enquadrar()"><i class="pi pi-expand" aria-hidden="true"></i>Ver todos</button>
        </div>

        @if (!carregando() && !erro() && !veiculos().length) {
          <div class="mf-vazio">
            <ces-async-state state="empty" title="Nenhum veículo no mapa" [compact]="true"
              description="Os veículos aparecem aqui assim que o rastreador de cada um manda a primeira posição."></ces-async-state>
          </div>
        }

        @if (selecionado(); as v) {
          <section class="mf-cartao" aria-labelledby="mf-cartao-titulo">
            <div class="mf-cartao__topo">
              <span class="mf-cartao__icone" [style.--mf-cor]="cor(v.estado)" aria-hidden="true"><i class="pi pi-car"></i></span>
              <div>
                <h2 id="mf-cartao-titulo" class="mf-cartao__titulo">{{ placa(v.placa) }}</h2>
                <p class="mf-cartao__sub">{{ [v.fabricante, v.modelo].filter(ok).join(' ') || 'Veículo' }}{{ v.tipoVeiculo ? ' · ' + v.tipoVeiculo : '' }}{{ v.base ? ' · ' + v.base : '' }}</p>
              </div>
              <button type="button" class="mf-fechar" aria-label="Fechar o cartão do veículo" (click)="fechar()"><i class="pi pi-times" aria-hidden="true"></i></button>
            </div>

            <div class="mf-cartao__selos">
              <ces-status [tone]="tom(v.estado)" [icon]="icone(v.estado)" [emphasis]="v.estado === 'DESLIGADO' ? 'soft' : 'solid'">{{ v.estadoRotulo }}</ces-status>
              @if (v.situacaoOperacional && v.situacaoOperacional !== 'ATIVO') { <ces-status tone="warning" icon="pi pi-wrench">Na ficha: {{ (v.situacaoOperacionalRotulo ?? '').toLowerCase() }}</ces-status> }
              @if (v.eventos24h) { <ces-status tone="warning" icon="pi pi-exclamation-triangle">{{ v.eventos24h }} evento{{ v.eventos24h === 1 ? '' : 's' }} em 24 h</ces-status> }
            </div>

            <dl>
              <div>
                <dt>Velocidade</dt>
                <dd class="mf-cartao__velocidade">{{ v.velocidadeKmh != null ? (v.velocidadeKmh | number: '1.0-0') : '—' }}<small>km/h</small></dd>
              </div>
              <div>
                <dt>{{ v.unidade === 'HORAS' ? 'Horímetro' : 'KM atual' }}</dt>
                <dd>{{ v.kmAtual != null ? medicao(v.kmAtual, v.unidade) : '—' }}
                  @if (v.ignicao != null) { <span class="mf-cartao__apoio">Ignição {{ v.ignicao ? 'ligada' : 'desligada' }}</span> }</dd>
              </div>
              <div><dt>Condutor</dt><dd>{{ condutor(v) ?? 'Não identificado' }}</dd></div>
              <div>
                <dt>Última posição</dt>
                <dd>{{ quanto(v.ultimaComunicacao) }}<span class="mf-cartao__apoio">{{ v.ultimaComunicacao | date: "dd/MM 'às' HH:mm" }}</span></dd>
              </div>
            </dl>

            @if (alertas().length) {
              <ul class="mf-alertas" aria-label="Pede atenção">
                @for (m of alertas(); track m.chave) {
                  <li [class]="m.tom === 'danger' ? 'mf-alertas__perigo' : 'mf-alertas__aviso'">
                    <i [class]="m.icone" aria-hidden="true"></i>
                    <span>{{ m.texto }}</span>
                    @if (m.acao) { <a [routerLink]="m.acao.rota" [queryParams]="m.acao.queryParams">{{ m.acao.rotulo }}</a> }
                  </li>
                }
              </ul>
            }

            <div class="mf-cartao__acoes">
              <ces-button size="sm" [fluid]="true" [variant]="trajetoDe() === v.idVeiculo ? 'primary' : 'outline'" icon="pi pi-share-alt"
                [label]="trajetoDe() === v.idVeiculo ? 'Ocultar trajeto' : 'Trajeto de hoje'" [loading]="carregandoTrajeto()" (pressed)="alternarTrajeto(v)"></ces-button>
              <ces-button size="sm" [fluid]="true" variant="outline" icon="pi pi-car" label="Ficha do veículo" (pressed)="ir(['/frota/veiculos', v.idVeiculo])"></ces-button>
            </div>
            @if (avisoTrajeto()) { <p class="mf-cartao__trajeto" role="status">{{ avisoTrajeto() }}</p> }

            @if (modulos().length) {
              <nav class="mf-modulos" aria-labelledby="mf-modulos-titulo">
                <h3 id="mf-modulos-titulo" class="mf-secao__titulo">Ver deste veículo</h3>
                <div class="mf-modulos__grade">
                  @for (m of modulos(); track m.rotulo) {
                    <a class="mf-atalho" [routerLink]="m.rota" [queryParams]="m.queryParams"><i [class]="m.icone" aria-hidden="true"></i>{{ m.rotulo }}</a>
                  }
                </div>
              </nav>
            }
          </section>
        }
      </div>
    </div>
  `
})
export class FrotaMapaFrotaComponent implements OnDestroy {
  private readonly servico = inject(FrotaTelemetriaService);
  private readonly router = inject(Router);
  private readonly acesso = acessoFrota();
  private readonly destroyRef = inject(DestroyRef);
  private readonly elemento = viewChild<ElementRef<HTMLDivElement>>('mapa');

  protected readonly estados = ESTADOS_MAPA;
  protected readonly placa = formatarPlaca;
  protected readonly quanto = haQuanto;
  protected readonly bases = basesFrota();
  protected readonly ok = (t: string | null) => !!t;

  protected readonly veiculos = signal<VeiculoMapa[]>([]);
  protected readonly semPosicao = signal(0);
  protected readonly geradoEm = signal<string | null>(null);
  protected readonly atrasadasDesde = signal<string | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly busca = signal('');
  protected readonly idsBase = signal<string[]>([]);
  private readonly preferencias = signal<Preferencias>(lerPreferencias());
  protected readonly estadosVisiveis = computed(() => this.preferencias().estados);
  protected readonly mostrarPlacas = computed(() => this.preferencias().placas);
  protected readonly painelRecolhido = computed(() => this.preferencias().painelRecolhido);
  protected readonly mostrarEventos = computed(() => this.preferencias().eventos);
  protected readonly selecionado = signal<VeiculoMapa | null>(null);
  protected readonly trajetoDe = signal<string | null>(null);
  protected readonly carregandoTrajeto = signal(false);
  protected readonly avisoTrajeto = signal<string | null>(null);
  private readonly eventos = signal<EventoTelemetria[]>([]);
  /** O veículo do cartão nos outros módulos da frota, só onde o usuário pode entrar. */
  protected readonly modulos = computed<AtalhoModulo[]>(() => {
    const v = this.selecionado();
    if (!v) return [];
    const ficha = ['/frota/veiculos', v.idVeiculo];
    const busca = { busca: v.placa };
    const a = this.acesso;
    return [
      ...(a.verOs() ? [{ rotulo: 'Manutenções', icone: 'pi pi-wrench', rota: ficha, queryParams: { aba: 'manutencoes' } }] : []),
      ...(a.verChecklist() ? [{ rotulo: 'Checklists', icone: 'pi pi-list-check', rota: ['/frota/checklists'], queryParams: { aba: 'preenchidos', veiculo: v.idVeiculo, placa: v.placa } }] : []),
      ...(a.verAbastecimento() ? [{ rotulo: 'Abastecimentos', icone: 'pi pi-gauge', rota: ['/frota/abastecimentos'], queryParams: { aba: 'todos', ...busca } }] : []),
      { rotulo: 'Documentos', icone: 'pi pi-file', rota: ficha, queryParams: { aba: 'documentos' } },
      ...(a.verTelemetria()
        ? [
            { rotulo: 'Eventos', icone: 'pi pi-exclamation-triangle', rota: ['/frota/telemetria/eventos'], queryParams: busca },
            { rotulo: 'Uso', icone: 'pi pi-chart-line', rota: ficha, queryParams: { aba: 'telemetria' } }
          ]
        : [])
    ];
  });
  /** O que pede decisão no veículo do cartão; os eventos já aparecem no selo acima. */
  protected readonly alertas = computed(() => {
    const v = this.selecionado();
    return v ? motivosDoVeiculo(v).filter((m) => m.tom !== 'info' && m.chave !== 'eventos') : [];
  });

  protected readonly contagem = computed(() => {
    const c: Record<EstadoMapa, number> = { EM_MOVIMENTO: 0, LIGADO_PARADO: 0, DESLIGADO: 0, SEM_SINAL: 0 };
    for (const v of this.filtradosPorBusca()) c[v.estado]++;
    return c;
  });
  private readonly filtradosPorBusca = computed(() => {
    const termo = normalizar(this.busca());
    const base = this.veiculos();
    if (!termo) return base;
    return base.filter((v) =>
      normalizar([v.placa, v.modelo, v.fabricante, v.tipoVeiculo, v.condutor, v.condutorVinculado, v.base].join(' ')).includes(termo));
  });
  protected readonly visiveis = computed(() => this.filtradosPorBusca().filter((v) => this.estadosVisiveis().includes(v.estado)));

  private mapa: any = null;
  private camadaVeiculos: any = null;
  private camadaEventos: any = null;
  private camadaTrajeto: any = null;
  private observador: ResizeObserver | null = null;
  private enquadrado = false;

  constructor() {
    effect(() => {
      this.idsBase();
      untracked(() => this.carregar());
    });
    interval(ATUALIZACAO_MS).pipe(takeUntilDestroyed()).subscribe(() => this.carregar(true));
    effect(() => {
      const el = this.elemento()?.nativeElement;
      if (el && !this.mapa) untracked(() => this.criarMapa(el));
    });
    effect(() => {
      const visiveis = this.visiveis();
      const placas = this.mostrarPlacas();
      const selecionado = this.selecionado()?.idVeiculo ?? null;
      untracked(() => this.desenharVeiculos(visiveis, placas, selecionado));
    });
    effect(() => {
      const mostrar = this.mostrarEventos();
      const eventos = this.eventos();
      untracked(() => this.desenharEventos(mostrar ? eventos : []));
    });
    effect(() => {
      if (this.mostrarEventos()) untracked(() => this.carregarEventos());
    });
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    this.mapa?.remove();
    this.mapa = null;
  }

  carregar(silencioso = false): void {
    if (!silencioso) this.carregando.set(true);
    this.servico.mapa(this.idsBase()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (m) => {
        this.carregando.set(false);
        this.erro.set(null);
        this.veiculos.set(m.veiculos);
        this.semPosicao.set(m.semPosicao);
        this.geradoEm.set(m.geradoEm);
        this.atrasadasDesde.set(m.posicoesAtrasadasDesde);
        const atual = this.selecionado();
        if (atual) this.selecionado.set(m.veiculos.find((v) => v.idVeiculo === atual.idVeiculo) ?? null);
        if (!this.enquadrado && m.veiculos.length) {
          this.enquadrado = true;
          setTimeout(() => this.enquadrar(), 0);
        }
        if (silencioso && this.mostrarEventos()) this.carregarEventos();
      },
      error: (e) => {
        this.carregando.set(false);
        if (!silencioso || !this.veiculos().length) this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected selecionar(v: VeiculoMapa, centralizar: boolean): void {
    this.selecionado.set(v);
    if (this.trajetoDe() && this.trajetoDe() !== v.idVeiculo) this.limparTrajeto();
    if (centralizar && this.mapa) this.mapa.flyTo([v.latitude, v.longitude], Math.max(this.mapa.getZoom(), 14), { duration: reduzido() ? 0 : 0.6 });
  }

  protected fechar(): void {
    this.selecionado.set(null);
    this.limparTrajeto();
  }

  protected alternarEstado(estado: EstadoMapa): void {
    this.salvarPreferencias({
      ...this.preferencias(),
      estados: this.estadosVisiveis().includes(estado) ? this.estadosVisiveis().filter((e) => e !== estado) : [...this.estadosVisiveis(), estado]
    });
  }

  protected alternarPainel(): void {
    this.alternarPreferencia('painelRecolhido');
  }

  protected ir(rota: unknown[], queryParams?: Params): void {
    void this.router.navigate(rota, { queryParams });
  }

  protected alternarPreferencia(chave: 'placas' | 'eventos' | 'painelRecolhido'): void {
    this.salvarPreferencias({ ...this.preferencias(), [chave]: !this.preferencias()[chave] });
  }

  /** Recorte que esconde todos: volta todos os estados e limpa a busca e as bases. */
  protected mostrarTodos(): void {
    this.busca.set('');
    this.idsBase.set([]);
    this.salvarPreferencias({ ...this.preferencias(), estados: ESTADOS_MAPA.map((e) => e.value) });
  }

  protected enquadrar(): void {
    const pontos = this.visiveis().map((v) => [v.latitude, v.longitude]);
    if (!this.mapa || !pontos.length) return;
    if (pontos.length === 1) this.mapa.setView(pontos[0], 14);
    else this.mapa.fitBounds(pontos, { padding: [40, 40], maxZoom: 15 });
  }

  protected alternarTrajeto(v: VeiculoMapa): void {
    if (this.trajetoDe() === v.idVeiculo) {
      this.limparTrajeto();
      return;
    }
    const ate = new Date();
    const de = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
    this.carregandoTrajeto.set(true);
    this.avisoTrajeto.set(null);
    this.servico.trajeto(v.idVeiculo, de.toISOString(), ate.toISOString()).subscribe({
      next: (t) => {
        this.carregandoTrajeto.set(false);
        const comPosicao = t.pontos.filter((p) => p.latitude != null && p.longitude != null);
        const pontos = comPosicao.map((p) => [p.latitude!, p.longitude!] as [number, number]);
        if (pontos.length < 2) {
          this.avisoTrajeto.set('Sem deslocamento registrado hoje.');
          return;
        }
        this.limparTrajeto();
        this.trajetoDe.set(v.idVeiculo);
        const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        this.camadaTrajeto = desenharTrajeto(this.mapa, pontos, {
          tema: this.elemento()!.nativeElement,
          saida: `Primeira posição de hoje, às ${hora(comPosicao[0].lidoEm)}`,
          chegada: `Última posição, às ${hora(comPosicao[comPosicao.length - 1].lidoEm)}`,
          instantes: comPosicao.map((p) => p.lidoEm)
        });
        this.mapa.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 16 });
        const km = dividirTrajeto(pontos, comPosicao.map((p) => p.lidoEm)).reduce((soma, t) => soma + distanciaKm(t), 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        this.avisoTrajeto.set(`Hoje: ${km} km desde ${hora(comPosicao[0].lidoEm)}`
          + (t.truncado ? ' · trajeto longo, mostrando os primeiros 3.000 pontos.' : '.'));
      },
      error: (e) => {
        this.carregandoTrajeto.set(false);
        this.avisoTrajeto.set(getErrorMessage(e));
      }
    });
  }

  protected condutor(v: VeiculoMapa): string | null {
    return v.condutor ?? v.condutorVinculado;
  }

  protected cor(estado: EstadoMapa): string {
    return `var(--ces-${ESTADOS_MAPA.find((e) => e.value === estado)!.token})`;
  }

  protected tom(estado: EstadoMapa) {
    return ({ EM_MOVIMENTO: 'success', LIGADO_PARADO: 'warning', DESLIGADO: 'neutral', SEM_SINAL: 'danger' } as const)[estado];
  }

  protected icone(estado: EstadoMapa): string {
    return ESTADOS_MAPA.find((e) => e.value === estado)!.icon;
  }

  protected medicao(valor: number, unidade: 'KM' | 'HORAS'): string {
    return formatarMedicao(valor, unidade);
  }

  // ── Leaflet ───────────────────────────────────────────────────────────────────

  private criarMapa(el: HTMLElement): void {
    if (typeof L === 'undefined') return;
    this.mapa = L.map(el, { zoomControl: true, attributionControl: true, zoomAnimation: !reduzido() }).setView([-12.97, -38.5], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(this.mapa);
    this.camadaVeiculos = L.layerGroup().addTo(this.mapa);
    this.camadaEventos = L.layerGroup().addTo(this.mapa);
    this.mapa.on('zoomend', () => this.desenharVeiculos(this.visiveis(), this.mostrarPlacas(), this.selecionado()?.idVeiculo ?? null));
    if (typeof ResizeObserver === 'function') {
      this.observador = new ResizeObserver(() => this.mapa?.invalidateSize({ animate: false }));
      this.observador.observe(el);
    } else {
      setTimeout(() => this.mapa?.invalidateSize(), 150);
    }
    this.desenharVeiculos(this.visiveis(), this.mostrarPlacas(), this.selecionado()?.idVeiculo ?? null);
    if (this.veiculos().length) this.enquadrar();
  }

  /**
   * Com o zoom afastado, veículos a menos de {@link GRADE_PX} pixels um do outro viram um grupo
   * com a contagem (clicar aproxima). As placas só aparecem quando cabem ({@link ZOOM_PLACAS}).
   * O veículo selecionado nunca entra em grupo.
   */
  private desenharVeiculos(visiveis: VeiculoMapa[], placas: boolean, selecionado: string | null): void {
    if (!this.mapa) return;
    this.camadaVeiculos.clearLayers();
    const zoom = this.mapa.getZoom();
    const agrupar = zoom < ZOOM_SEM_GRUPOS;
    const comPlaca = placas && zoom >= ZOOM_PLACAS;
    const grupos = new Map<string, VeiculoMapa[]>();
    for (const v of visiveis) {
      if (!agrupar || v.idVeiculo === selecionado) {
        this.marcadorVeiculo(v, comPlaca || v.idVeiculo === selecionado, v.idVeiculo === selecionado);
        continue;
      }
      const p = this.mapa.project([v.latitude, v.longitude], zoom);
      const chave = `${Math.floor(p.x / GRADE_PX)}:${Math.floor(p.y / GRADE_PX)}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), v]);
    }
    for (const membros of grupos.values()) {
      if (membros.length === 1) this.marcadorVeiculo(membros[0], comPlaca, false);
      else this.marcadorGrupo(membros);
    }
  }

  private marcadorVeiculo(v: VeiculoMapa, placa: boolean, selecionado: boolean): void {
    const marcador = L.marker([v.latitude, v.longitude], {
      icon: this.iconeVeiculo(v, placa, selecionado), title: `${formatarPlaca(v.placa)} · ${v.estadoRotulo}`,
      keyboard: false, riseOnHover: true, zIndexOffset: selecionado ? 1000 : 0
    });
    marcador.on('click', () => {
      const atual = this.veiculos().find((x) => x.idVeiculo === v.idVeiculo);
      if (atual) this.selecionar(atual, false);
    });
    marcador.addTo(this.camadaVeiculos);
  }

  /** Grupo: contagem no centro e um anel com a proporção de cada estado. */
  private marcadorGrupo(membros: VeiculoMapa[]): void {
    const lat = membros.reduce((s, v) => s + v.latitude, 0) / membros.length;
    const lng = membros.reduce((s, v) => s + v.longitude, 0) / membros.length;
    const tamanho = membros.length < 10 ? 38 : membros.length < 50 ? 46 : 54;
    const fundo = this.token('surface') || '#fff';
    const texto = this.token('foreground') || '#0f172a';
    let acumulado = 0;
    const fatias = ESTADOS_MAPA.map((e) => {
      const n = membros.filter((v) => v.estado === e.value).length;
      const inicio = acumulado;
      acumulado += (n / membros.length) * 360;
      return n ? `${this.token(e.token)} ${inicio}deg ${acumulado}deg` : null;
    }).filter(Boolean).join(',');
    const resumo = ESTADOS_MAPA.map((e) => [e.label, membros.filter((v) => v.estado === e.value).length] as const)
      .filter(([, n]) => n).map(([rotulo, n]) => `${n} ${rotulo.toLowerCase()}`).join(', ');
    const html = `<span style="display:grid;place-items:center;width:${tamanho}px;height:${tamanho}px;border-radius:999px;background:conic-gradient(${fatias});box-shadow:0 1px 5px rgba(0,0,0,.35)">`
      + `<span style="display:grid;place-items:center;width:${tamanho - 12}px;height:${tamanho - 12}px;border-radius:999px;background:${fundo};color:${texto};font:700 13px/1 system-ui,sans-serif">${membros.length}</span></span>`;
    const marcador = L.marker([lat, lng], {
      icon: L.divIcon({ html, className: '', iconSize: [tamanho, tamanho], iconAnchor: [tamanho / 2, tamanho / 2] }),
      title: `${membros.length} veículos: ${resumo}. Clique para aproximar.`, keyboard: false
    });
    marcador.on('click', () => this.mapa.fitBounds(membros.map((v) => [v.latitude, v.longitude]), { padding: [60, 60], maxZoom: ZOOM_SEM_GRUPOS }));
    marcador.addTo(this.camadaVeiculos);
  }

  private iconeVeiculo(v: VeiculoMapa, placa: boolean, selecionado: boolean): any {
    const cor = this.token(ESTADOS_MAPA.find((e) => e.value === v.estado)!.token);
    const fundo = this.token('surface') || '#fff';
    const texto = this.token('foreground') || '#0f172a';
    const tamanho = selecionado ? 38 : 30;
    const anel = selecionado ? `box-shadow:0 0 0 4px ${fundo},0 0 0 7px ${cor};` : `box-shadow:0 1px 4px rgba(0,0,0,.35);`;
    const rotulo = placa
      ? `<span style="position:absolute;top:${tamanho + 2}px;left:50%;transform:translateX(-50%);padding:1px 6px;border-radius:6px;background:${fundo};color:${texto};font:700 11px/1.4 system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25)">${esc(formatarPlaca(v.placa))}</span>`
      : '';
    const html = `<span style="position:relative;display:block;width:${tamanho}px;height:${tamanho}px">`
      + `<span style="display:grid;place-items:center;width:100%;height:100%;border:2px solid ${fundo};border-radius:999px;background:${cor};color:${fundo};${anel}">`
      + `<i class="pi pi-car" style="font-size:${selecionado ? 16 : 13}px"></i></span>${rotulo}</span>`;
    return L.divIcon({ html, className: '', iconSize: [tamanho, tamanho], iconAnchor: [tamanho / 2, tamanho / 2] });
  }

  private desenharEventos(eventos: EventoTelemetria[]): void {
    if (!this.camadaEventos) return;
    this.camadaEventos.clearLayers();
    for (const e of eventos) {
      if (e.latitude == null || e.longitude == null) continue;
      const tom = TOM_TIPO_EVENTO[e.tipo];
      const cor = this.token(tom === 'neutral' ? 'foreground-subtle' : tom);
      const fundo = this.token('surface') || '#fff';
      const icone = L.divIcon({
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: `<span style="display:grid;place-items:center;width:20px;height:20px;border:2px solid ${fundo};border-radius:5px;background:${cor};color:${fundo};transform:rotate(45deg);box-shadow:0 1px 3px rgba(0,0,0,.3)"><i class="${ICONE_TIPO_EVENTO[e.tipo]}" style="font-size:9px;transform:rotate(-45deg)"></i></span>`
      });
      const quando = new Date(e.ocorridoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      L.marker([e.latitude, e.longitude], { icon: icone, title: `${e.tipoRotulo} · ${formatarPlaca(e.placa)}`, keyboard: false })
        .bindPopup(`<strong>${esc(e.tipoRotulo)}</strong><br>${esc(formatarPlaca(e.placa))} · ${esc(quando)}<br>${esc(e.detalhe)}`
          + `${e.condutor ? '<br>' + esc(e.condutor) : ''}`)
        .addTo(this.camadaEventos);
    }
  }

  private carregarEventos(): void {
    const de = new Date(Date.now() - 86_400_000).toISOString();
    this.servico.listarEventos({ de, idsBase: this.idsBase() }, { page: 0, size: 500, sort: ['ocorridoEm,desc'] })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (p) => this.eventos.set(p.content), error: () => this.eventos.set([]) });
  }

  private limparTrajeto(): void {
    if (this.camadaTrajeto) this.mapa?.removeLayer(this.camadaTrajeto);
    this.camadaTrajeto = null;
    this.trajetoDe.set(null);
    this.avisoTrajeto.set(null);
  }

  private token(nome: string): string {
    const el = this.elemento()?.nativeElement;
    return el ? getComputedStyle(el).getPropertyValue(`--ces-${nome}`).trim() : '';
  }

  private salvarPreferencias(p: Preferencias): void {
    this.preferencias.set(p);
    try {
      localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p));
    } catch {
      /* preferência opcional */
    }
  }
}

function lerPreferencias(): Preferencias {
  const padrao: Preferencias = { painelRecolhido: false, placas: true, eventos: false, estados: ESTADOS_MAPA.map((e) => e.value) };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) ?? 'null') as Partial<Preferencias> | null;
    if (!salvo) return padrao;
    const estados = (salvo.estados ?? padrao.estados).filter((e) => ESTADOS_MAPA.some((x) => x.value === e));
    return { painelRecolhido: salvo.painelRecolhido ?? false, placas: salvo.placas ?? true, eventos: salvo.eventos ?? false, estados: estados.length ? estados : padrao.estados };
  } catch {
    return padrao;
  }
}

function distanciaKm(pontos: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) {
    const [a, b] = [pontos[i - 1], pontos[i]];
    const lat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
    total += Math.hypot((b[0] - a[0]) * 111.32, (b[1] - a[1]) * 111.32 * Math.cos(lat));
  }
  return total;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function esc(texto: string | null | undefined): string {
  return (texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function reduzido(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
