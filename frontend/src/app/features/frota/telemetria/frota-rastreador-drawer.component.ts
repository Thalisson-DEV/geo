import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesDrawerComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  NotificationService
} from '@ces/ui';
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
  imports: [DatePipe, DecimalPipe, RouterLink, CesButtonComponent, CesCalloutComponent, CesDrawerComponent, CesSelectComponent,
    CesStatusComponent, FrotaMapaTelemetriaComponent],
  styles: `
    .rd { display: grid; gap: 1rem; }
    .rd-topo { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .rd-vinculo { display: grid; gap: 0.5rem; padding: 0.875rem; border: 1px solid var(--ces-border); border-radius: var(--ces-radius-lg);
      background: var(--ces-surface-muted); }
    .rd-vinculo p { margin: 0; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
  `,
  template: `
    <ces-drawer [(visible)]="visivel" eyebrow="Rastreador" [title]="titulo()" size="md">
      @if (rastreador(); as r) {
        <div class="rd">
          <div class="rd-topo">
            <ces-status [tone]="tom[r.situacao]" emphasis="solid">{{ r.situacaoRotulo }}</ces-status>
            <ces-status tone="neutral" icon="pi pi-wifi">{{ r.provedorRotulo }}</ces-status>
            @if (r.vinculoManual) { <ces-status tone="info" icon="pi pi-link">Vínculo manual</ces-status> }
            @if (r.semComunicacao) { <ces-status tone="warning" icon="pi pi-exclamation-triangle">Sem comunicação há mais de 24 h</ces-status> }
          </div>

          <app-frota-mapa-telemetria [marcadores]="marcadores()" [descricao]="'Última posição de ' + titulo()"
            vazio="O provedor ainda não mandou posição deste rastreador."></app-frota-mapa-telemetria>

          <section class="ces-sheet-section" aria-labelledby="rd-estado">
            <h2 id="rd-estado"><i class="pi pi-wave-pulse" aria-hidden="true"></i> Último estado</h2>
            <dl class="ces-sheet">
              <div><dt>Comunicação</dt><dd>{{ r.ultimaComunicacao ? (r.ultimaComunicacao | date: 'dd/MM/yyyy HH:mm') + ' · ' + quanto(r.ultimaComunicacao) : 'Nunca' }}</dd></div>
              <div><dt>Velocidade</dt><dd>{{ r.velocidadeKmh != null ? (r.velocidadeKmh | number: '1.0-0') + ' km/h' : '—' }}</dd></div>
              <div><dt>Ignição</dt><dd>{{ r.ignicao == null ? 'Não informada' : r.ignicao ? 'Ligada' : 'Desligada' }}</dd></div>
              <div><dt>Odômetro do rastreador</dt><dd>{{ r.odometroKm != null ? (r.odometroKm | number: '1.0-0') + ' km' : '—' }}</dd></div>
              @if (r.horimetroHoras != null) {
                <div><dt>Horímetro</dt><dd>{{ r.horimetroHoras | number: '1.0-1' }} h</dd></div>
              }
              <div class="ces-sheet__wide"><dt>Motorista informado</dt>
                <dd>{{ r.motoristaNome ?? 'Nenhum' }}{{ r.condutor ? ' · condutor ' + r.condutor : r.motoristaNome ? ' · não casou com um condutor da frota' : '' }}</dd></div>
            </dl>
          </section>

          <section class="ces-sheet-section" aria-labelledby="rd-provedor">
            <h2 id="rd-provedor"><i class="pi pi-server" aria-hidden="true"></i> No provedor</h2>
            <dl class="ces-sheet">
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
              <h2 id="rd-vinculo" class="ces-sr-only">Vínculo</h2>
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
                <ces-select label="Veículo" [options]="opcoesVeiculos()" [(value)]="idVeiculo" [filter]="true" [loading]="carregandoVeiculos()"
                  placeholder="Escolha o veículo"></ces-select>
              }
            </section>
          }

          @if (erroAcao()) {
            <ces-callout tone="danger" [dense]="true">{{ erroAcao() }}</ces-callout>
          }
        </div>
      }

      <div drawer-footer class="ces-actions-row">
        @if (rastreador(); as r) {
          @if (acesso.editarTelemetria()) {
            @if (r.situacao === 'IGNORADO') {
              <ces-button icon="pi pi-replay" label="Reativar" [loading]="processando()" (pressed)="agir(servico.reativar(r.id), 'Rastreador reativado.')"></ces-button>
            } @else {
              <ces-button variant="ghost" icon="pi pi-eye-slash" label="Ignorar" [disabled]="processando()"
                (pressed)="agir(servico.ignorar(r.id), 'Rastreador ignorado.')"></ces-button>
              @if (r.vinculoManual) {
                <ces-button variant="outline" icon="pi pi-undo" label="Desfazer vínculo manual" [disabled]="processando()"
                  (pressed)="agir(servico.desfazerVinculo(r.id), 'Vínculo desfeito. A placa volta a decidir na próxima sincronização.')"></ces-button>
              }
              <ces-button icon="pi pi-link" label="Vincular" [loading]="processando()" [disabled]="!idVeiculo() || idVeiculo() === r.idVeiculo"
                (pressed)="agir(servico.vincular(r.id, idVeiculo()!), 'Rastreador vinculado a ' + rotuloVeiculo() + '.')"></ces-button>
            }
          }
        }
      </div>
    </ces-drawer>
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
  protected readonly opcoesVeiculos = signal<CesSelectOption<string>[]>([]);

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
