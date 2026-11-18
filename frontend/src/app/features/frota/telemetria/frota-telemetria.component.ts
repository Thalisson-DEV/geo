import { DatePipe } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDrawerComponent,
  GeoPageHeaderComponent,
  GeoStatusComponent
} from '@geo/ui';

import { SaudeRastreadores, SituacaoTelemetria, haQuanto } from '../../../core/models/frota-telemetria.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { FrotaMapaFrotaComponent } from './frota-mapa-frota.component';
import { FrotaTelemetriaEventosComponent } from './frota-telemetria-eventos.component';
import { FrotaTelemetriaRastreadoresComponent } from './frota-telemetria-rastreadores.component';

type Modo = 'mapa' | 'rastreadores' | 'eventos';

const CABECALHO: Record<Modo, { titulo: string; icone: string; trilha: string; descricao: string }> = {
  mapa: { titulo: 'Mapa da frota', icone: 'pi pi-map', trilha: 'Operação',
    descricao: 'Onde cada veículo está agora. Clique num carro para ver quem dirige, o km e o trajeto do dia.' },
  eventos: { titulo: 'Eventos de condução', icone: 'pi pi-exclamation-triangle', trilha: 'Operação',
    descricao: 'Excesso de velocidade, frenagens e outros eventos dos rastreadores, com quem dirigia.' },
  rastreadores: { titulo: 'Rastreadores', icone: 'pi pi-wifi', trilha: 'Cadastros',
    descricao: 'Cada rastreador casa sozinho com o veículo pela placa. Aqui ficam só as exceções: o que não casou, o que está sem sinal e o que está em dobro.' }
};

/** As posições chegam a cada 2 minutos; sem chegar há mais que isto, a tela avisa. */
const ATRASO_MINUTOS = 15;

/**
 * Telemetria em três telas, uma por rota (`data.modo`): o mapa e os eventos para quem opera, e os
 * rastreadores para quem administra o contrato. Nada de provedor, sincronização ou chave: tudo
 * chega sozinho, e a tela só fala quando há algo a fazer.
 */
@Component({
  selector: 'app-frota-telemetria',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, GeoButtonComponent, GeoCalloutComponent, GeoDrawerComponent, GeoPageHeaderComponent, GeoStatusComponent,
    FrotaMapaFrotaComponent, FrotaTelemetriaEventosComponent, FrotaTelemetriaRastreadoresComponent],
  styles: `
    .tl-acao { margin-top: 0.5rem; }
    .tl-dobro { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .tl-dobro li { display: grid; gap: 0.375rem; padding: 0.75rem 0; border-bottom: 1px solid var(--geo-border); }
    .tl-dobro li:last-child { border-bottom: 0; }
    .tl-dobro__placa { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
    .tl-dobro__placa strong { font-size: var(--geo-font-control); }
    .tl-dobro__placa span, .tl-dobro__rastreador span { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .tl-dobro__rastreador { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  `,
  template: `
    <div class="geo-page">
      <geo-page-header
        [title]="cabecalho.titulo"
        [icon]="cabecalho.icone"
        [breadcrumb]="[{ label: 'Frota' }, { label: cabecalho.trilha }, { label: cabecalho.titulo }]"
        [description]="cabecalho.descricao"
      ></geo-page-header>

      @if (modo === 'rastreadores') {
        @if (atrasadasDesde(); as desde) {
          <geo-callout tone="warning" icon="pi pi-clock" title="Posições atrasadas">
            Os rastreadores não atualizam desde {{ desde | date: "dd/MM 'às' HH:mm" }}. O mapa e o km automático voltam sozinhos quando a leitura voltar.
          </geo-callout>
        }
        @if (saude()?.duplicados?.length; as n) {
          <geo-callout tone="warning" icon="pi pi-clone" [title]="n === 1 ? '1 placa com dois rastreadores' : n + ' placas com dois rastreadores'">
            São dois equipamentos pagos no mesmo veículo. Fica o que comunica melhor; o outro pode ser cancelado no contrato.
            <div class="tl-acao"><geo-button variant="secondary" size="sm" icon="pi pi-list" label="Ver as placas" (pressed)="dobroAberto.set(true)"></geo-button></div>
          </geo-callout>
        }
        <app-frota-telemetria-rastreadores #rastreadores (alterado)="carregarSaude()"></app-frota-telemetria-rastreadores>
      } @else if (modo === 'eventos') {
        <app-frota-telemetria-eventos #eventos></app-frota-telemetria-eventos>
      } @else {
        <app-frota-mapa-frota></app-frota-mapa-frota>
      }
    </div>

    <geo-drawer [(visible)]="dobroAberto" eyebrow="Rastreadores" title="Placas com dois rastreadores" size="md"
      description="Fica o que comunica e informa o km; o outro é candidato a cancelar.">
      <ul class="tl-dobro">
        @for (d of saude()?.duplicados ?? []; track d.placa) {
          <li>
            <div class="tl-dobro__placa">
              @if (d.idVeiculo) {
                <a [routerLink]="['/frota/veiculos', d.idVeiculo]"><strong>{{ placa(d.placa) }}</strong></a>
              } @else { <strong>{{ placa(d.placa) }}</strong> }
              <span>{{ juntar(d.modelo, d.base) }}</span>
            </div>
            @for (r of d.rastreadores; track r.idRastreador) {
              <div class="tl-dobro__rastreador">
                <geo-status [tone]="r.manter ? 'success' : 'warning'" [icon]="r.manter ? 'pi pi-check' : 'pi pi-times'">
                  {{ r.manter ? 'Manter' : 'Cancelar' }} · {{ r.provedorRotulo }}
                </geo-status>
                <span>{{ r.ultimaComunicacao ? 'comunicou ' + haQuanto(r.ultimaComunicacao) : 'nunca comunicou' }}{{ r.comOdometro ? '' : ' · sem km' }}</span>
              </div>
            }
          </li>
        }
      </ul>
    </geo-drawer>
  `
})
export class FrotaTelemetriaComponent implements AfterViewInit {
  private readonly servico = inject(FrotaTelemetriaService);
  private readonly rota = inject(ActivatedRoute);

  protected readonly modo: Modo = (['mapa', 'eventos'] as Modo[]).includes(this.rota.snapshot.data['modo']) ? this.rota.snapshot.data['modo'] : 'rastreadores';
  protected readonly cabecalho = CABECALHO[this.modo];
  protected readonly situacao = signal<SituacaoTelemetria | null>(null);
  protected readonly saude = signal<SaudeRastreadores | null>(null);
  protected readonly dobroAberto = signal(false);
  protected readonly placa = formatarPlaca;
  protected readonly haQuanto = haQuanto;

  /** A última leitura que chegou, quando passou do normal; sem detalhe de provedor. */
  protected readonly atrasadasDesde = computed(() => {
    const limite = Date.now() - ATRASO_MINUTOS * 60_000;
    const atrasos = (this.situacao()?.provedores ?? [])
      .filter((p) => p.configurado && p.veiculos.ultimoSucesso && Date.parse(p.veiculos.ultimoSucesso) < limite)
      .map((p) => p.veiculos.ultimoSucesso!);
    return atrasos.sort()[0] ?? null;
  });

  private readonly listaRastreadores = viewChild<FrotaTelemetriaRastreadoresComponent>('rastreadores');
  private readonly listaEventos = viewChild<FrotaTelemetriaEventosComponent>('eventos');

  constructor() {
    if (this.modo === 'rastreadores') {
      this.servico.situacao().subscribe({ next: (s) => this.situacao.set(s), error: () => undefined });
      this.carregarSaude();
    }
  }

  ngAfterViewInit(): void {
    const params = this.rota.snapshot.queryParamMap;
    const evento = params.get('evento');
    const rastreador = params.get('rastreador');
    if (evento) this.listaEventos()?.abrirPorId(evento);
    if (rastreador) this.listaRastreadores()?.abrirPorId(rastreador);
  }

  carregarSaude(): void {
    this.servico.saude().subscribe({ next: (s) => this.saude.set(s), error: () => undefined });
  }

  protected juntar(...partes: (string | null)[]): string {
    return partes.filter((p) => !!p).join(' · ');
  }
}
