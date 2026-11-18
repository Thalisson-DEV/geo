import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDrawerComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  NotificationService
} from '@geo/ui';
import { Observable } from 'rxjs';

import {
  RastreadorTelemetria,
  TOM_SITUACAO_RASTREADOR,
  haQuanto
} from '../../../core/models/frota-telemetria.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaMapaTelemetriaComponent, MarcadorMapa } from './frota-mapa-telemetria.component';

/**
 * Rastreador de um provedor: último estado, mapa e o vínculo com o veículo. O caso comum é
 * automático (placa); aqui o gestor vincula o que não casou, ignora o que não é da frota ou
 * devolve um vínculo manual ao automático.
 */
@Component({
  selector: 'app-frota-rastreador-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, GeoButtonComponent, GeoCalloutComponent, GeoDrawerComponent, GeoSelectComponent,
    GeoStatusComponent, FrotaMapaTelemetriaComponent],
  styles: `
    .rd { display: grid; gap: 1rem; }
    .rd-topo { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .rd-vinculo { display: grid; gap: 0.5rem; padding: 0.875rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg);
      background: var(--geo-surface-muted); }
    .rd-vinculo p { margin: 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
  `,
  template: `
    <geo-drawer [(visible)]="visivel" eyebrow="Rastreador" [title]="titulo()" size="md">
      @if (rastreador(); as r) {
        <div class="rd">
          <div class="rd-topo">
            <geo-status [tone]="tom[r.situacao]" emphasis="solid">{{ r.situacaoRotulo }}</geo-status>
            <geo-status tone="neutral" icon="pi pi-wifi">{{ r.provedorRotulo }}</geo-status>
            @if (r.vinculoManual) { <geo-status tone="info" icon="pi pi-link">Vínculo manual</geo-status> }
            @if (r.semComunicacao) { <geo-status tone="warning" icon="pi pi-exclamation-triangle">Sem comunicação há mais de 24 h</geo-status> }
          </div>

          <app-frota-mapa-telemetria [marcadores]="marcadores()" [descricao]="'Última posição de ' + titulo()"
            vazio="O provedor ainda não mandou posição deste rastreador."></app-frota-mapa-telemetria>

          <section class="geo-sheet-section" aria-labelledby="rd-estado">
            <h2 id="rd-estado"><i class="pi pi-wave-pulse" aria-hidden="true"></i> Último estado</h2>
            <dl class="geo-sheet">
              <div><dt>Comunicação</dt><dd>{{ r.ultimaComunicacao ? (r.ultimaComunicacao | date: 'dd/MM/yyyy HH:mm') + ' · ' + quanto(r.ultimaComunicacao) : 'Nunca' }}</dd></div>
              <div><dt>Velocidade</dt><dd>{{ r.velocidadeKmh != null ? (r.velocidadeKmh | number: '1.0-0') + ' km/h' : '—' }}</dd></div>
              <div><dt>Ignição</dt><dd>{{ r.ignicao == null ? 'Não informada' : r.ignicao ? 'Ligada' : 'Desligada' }}</dd></div>
              <div><dt>Odômetro do rastreador</dt><dd>{{ r.odometroKm != null ? (r.odometroKm | number: '1.0-0') + ' km' : '—' }}</dd></div>
              @if (r.horimetroHoras != null) {
                <div><dt>Horímetro</dt><dd>{{ r.horimetroHoras | number: '1.0-1' }} h</dd></div>
              }
              <div class="geo-sheet__wide"><dt>Motorista informado</dt>
                <dd>{{ r.motoristaNome ?? 'Nenhum' }}{{ r.condutor ? ' · condutor ' + r.condutor : r.motoristaNome ? ' · não casou com um condutor da frota' : '' }}</dd></div>
            </dl>
          </section>

          <section class="geo-sheet-section" aria-labelledby="rd-provedor">
            <h2 id="rd-provedor"><i class="pi pi-server" aria-hidden="true"></i> No provedor</h2>
            <dl class="geo-sheet">
              <div><dt>Placa</dt><dd>{{ r.placaProvedor ?? '—' }}</dd></div>
              <div><dt>Nome</dt><dd>{{ r.nomeProvedor ?? '—' }}</dd></div>
              <div><dt>Id do rastreador</dt><dd>{{ r.idExterno }}</dd></div>
              <div><dt>Veículo da frota</dt>
                <dd>
                  @if (r.idVeiculo) {
                    <a [routerLink]="['/frota/veiculos', r.idVeiculo]" [queryParams]="{ aba: 'telemetria' }">{{ placa(r.placa) }}</a>{{ r.base ? ' · ' + r.base : '' }}
                  } @else { — }
                </dd>
              </div>
            </dl>
          </section>

          @if (acesso.editarTelemetria()) {
            <section class="rd-vinculo" aria-labelledby="rd-vinculo">
              <h2 id="rd-vinculo" class="geo-sr-only">Vínculo</h2>
              @switch (r.situacao) {
                @case ('IGNORADO') {
                  <p>Ignorado: a frota não usa os dados deste rastreador. Reative para voltar ao casamento pela placa.</p>
                }
                @case ('VINCULADO') {
                  <p>{{ r.vinculoManual ? 'Vinculado à mão. Desfaça para voltar ao casamento automático pela placa.' : 'Vinculado pela placa. Se a placa do provedor estiver errada, escolha o veículo certo.' }}</p>
                }
                @default {
                  <p>A placa do provedor não corresponde a um veículo da frota. Escolha o veículo ou ignore, se o rastreador não é da frota.</p>
                }
              }
              @if (r.situacao !== 'IGNORADO') {
                <geo-select label="Veículo" [options]="opcoesVeiculos()" [(value)]="idVeiculo" [filter]="true" [loading]="carregandoVeiculos()"
                  placeholder="Escolha o veículo"></geo-select>
              }
            </section>
          }

          @if (erroAcao()) {
            <geo-callout tone="danger" [dense]="true">{{ erroAcao() }}</geo-callout>
          }
        </div>
      }

      <div drawer-footer class="geo-actions-row">
        @if (rastreador(); as r) {
          @if (acesso.editarTelemetria()) {
            @if (r.situacao === 'IGNORADO') {
              <geo-button icon="pi pi-replay" label="Reativar" [loading]="processando()" (pressed)="agir(servico.reativar(r.id), 'Rastreador reativado.')"></geo-button>
            } @else {
              <geo-button variant="ghost" icon="pi pi-eye-slash" label="Ignorar" [disabled]="processando()"
                (pressed)="agir(servico.ignorar(r.id), 'Rastreador ignorado.')"></geo-button>
              @if (r.vinculoManual) {
                <geo-button variant="outline" icon="pi pi-undo" label="Desfazer vínculo manual" [disabled]="processando()"
                  (pressed)="agir(servico.desfazerVinculo(r.id), 'Vínculo desfeito. A placa volta a decidir na próxima sincronização.')"></geo-button>
              }
              <geo-button icon="pi pi-link" label="Vincular" [loading]="processando()" [disabled]="!idVeiculo() || idVeiculo() === r.idVeiculo"
                (pressed)="agir(servico.vincular(r.id, idVeiculo()!), 'Rastreador vinculado a ' + rotuloVeiculo() + '.')"></geo-button>
            }
          }
        }
      </div>
    </geo-drawer>
  `
})
export class FrotaRastreadorDrawerComponent {
  protected readonly servico = inject(FrotaTelemetriaService);
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  protected readonly acesso = acessoFrota();

  readonly visivel = model(false);
  readonly rastreador = input<RastreadorTelemetria | null>(null);
  /** O rastreador mudou (a lista recarrega). */
  readonly alterado = output<RastreadorTelemetria>();

  protected readonly tom = TOM_SITUACAO_RASTREADOR;
  protected readonly placa = formatarPlaca;
  protected readonly quanto = haQuanto;
  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly processando = signal(false);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly carregandoVeiculos = signal(false);
  protected readonly opcoesVeiculos = signal<GeoSelectOption<string>[]>([]);

  protected readonly titulo = computed(() => {
    const r = this.rastreador();
    if (!r) return 'Rastreador';
    return r.placa ? formatarPlaca(r.placa) : r.placaProvedor ?? r.nomeProvedor ?? `Rastreador ${r.idExterno}`;
  });
  protected readonly marcadores = computed<MarcadorMapa[]>(() => {
    const r = this.rastreador();
    return r?.latitude != null && r.longitude != null
      ? [{ latitude: r.latitude, longitude: r.longitude, rotulo: this.titulo(), tom: r.semComunicacao ? 'warning' : 'brand' }]
      : [];
  });
  protected readonly rotuloVeiculo = computed(() => this.opcoesVeiculos().find((o) => o.value === this.idVeiculo())?.label ?? 'o veículo');

  constructor() {
    effect(() => {
      const r = this.rastreador();
      const aberto = this.visivel();
      untracked(() => {
        this.erroAcao.set(null);
        this.idVeiculo.set(r?.idVeiculo ?? null);
        if (aberto && this.acesso.editarTelemetria() && !this.opcoesVeiculos().length) this.carregarVeiculos();
      });
    });
  }

  protected agir(acao: Observable<RastreadorTelemetria>, sucesso: string): void {
    this.processando.set(true);
    this.erroAcao.set(null);
    acao.subscribe({
      next: (r) => {
        this.processando.set(false);
        this.notificacoes.success(sucesso);
        this.alterado.emit(r);
      },
      error: (e) => {
        this.processando.set(false);
        this.erroAcao.set(getErrorMessage(e));
      }
    });
  }

  private carregarVeiculos(): void {
    this.carregandoVeiculos.set(true);
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => {
        this.carregandoVeiculos.set(false);
        this.opcoesVeiculos.set(p.content.map((v) => ({
          label: `${formatarPlaca(v.placa)}${v.modelo ? ' · ' + v.modelo : ''}${v.baseOperacional ? ' · ' + v.baseOperacional : ''}`,
          value: v.idVeiculo
        })));
      },
      error: () => this.carregandoVeiculos.set(false)
    });
  }
}
