import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoCalloutComponent, GeoDrawerComponent, GeoStatusComponent } from '@geo/ui';

import {
  EventoTelemetria,
  ICONE_TIPO_EVENTO,
  TOM_TIPO_EVENTO
} from '../../../core/models/frota-telemetria.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { FrotaMapaTelemetriaComponent, MarcadorMapa } from './frota-mapa-telemetria.component';

/** Evento de condução: o que houve, onde (mapa), o veículo e quem dirigia, com a origem do condutor. */
@Component({
  selector: 'app-frota-evento-telemetria-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, GeoCalloutComponent, GeoDrawerComponent, GeoStatusComponent, FrotaMapaTelemetriaComponent],
  styles: `
    .ed { display: grid; gap: 1rem; }
    .ed-topo { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .ed-destaque { margin: 0; font-size: var(--geo-font-title, 1.25rem); font-weight: 600; color: var(--geo-foreground); }
  `,
  template: `
    <geo-drawer [(visible)]="visivel" eyebrow="Evento de condução" [title]="titulo()" size="md">
      @if (evento(); as e) {
        <div class="ed">
          <div class="ed-topo">
            <geo-status [tone]="tom[e.tipo]" [icon]="icone[e.tipo]" emphasis="solid">{{ e.tipoRotulo }}</geo-status>
          </div>
          @if (e.detalhe) {
            <p class="ed-destaque">{{ e.detalhe }}</p>
          }

          <app-frota-mapa-telemetria [marcadores]="marcadores()" [descricao]="'Local do evento: ' + (e.endereco ?? titulo())"
            [vazio]="e.endereco ? 'Só o endereço deste evento é conhecido.' : 'O local deste evento não foi informado.'">
          </app-frota-mapa-telemetria>

          <section class="geo-sheet-section" aria-labelledby="ed-fatos">
            <h2 id="ed-fatos"><i class="pi pi-info-circle" aria-hidden="true"></i> Ocorrência</h2>
            <dl class="geo-sheet">
              <div><dt>Quando</dt><dd>{{ e.ocorridoEm | date: "dd/MM/yyyy 'às' HH:mm" }}</dd></div>
              <div><dt>Veículo</dt>
                <dd>
                  @if (e.idVeiculo) {
                    <a [routerLink]="['/frota/veiculos', e.idVeiculo]" [queryParams]="{ aba: 'telemetria' }">{{ placa(e.placa) }}</a>
                  } @else { {{ placa(e.placa) || '—' }} }
                  {{ e.base ? ' · ' + e.base : '' }}
                </dd>
              </div>
              @if (e.velocidadeKmh != null) {
                <div><dt>Velocidade</dt><dd>{{ e.velocidadeKmh | number: '1.0-0' }} km/h{{ e.limiteKmh != null ? ' (limite ' + (e.limiteKmh | number: '1.0-0') + ')' : '' }}</dd></div>
              }
              @if (e.duracaoSegundos) {
                <div><dt>Duração</dt><dd>{{ duracao(e.duracaoSegundos) }}</dd></div>
              }
              @if (e.endereco) {
                <div class="geo-sheet__wide"><dt>Endereço</dt><dd>{{ e.endereco }}</dd></div>
              }
            </dl>
          </section>

          <section class="geo-sheet-section" aria-labelledby="ed-condutor">
            <h2 id="ed-condutor"><i class="pi pi-user" aria-hidden="true"></i> Condutor</h2>
            @if (e.condutor) {
              <dl class="geo-sheet">
                <div><dt>Quem dirigia</dt><dd>{{ e.condutor }}</dd></div>
              </dl>
            } @else {
              <geo-callout tone="warning" [dense]="true">
                Não havia condutor vinculado ao veículo nesse horário. Ele passa a ser identificado quando a equipe faz o checklist do veículo.
              </geo-callout>
            }
          </section>
        </div>
      }
    </geo-drawer>
  `
})
export class FrotaEventoTelemetriaDrawerComponent {
  readonly visivel = model(false);
  readonly evento = input<EventoTelemetria | null>(null);

  protected readonly tom = TOM_TIPO_EVENTO;
  protected readonly icone = ICONE_TIPO_EVENTO;
  protected readonly placa = formatarPlaca;

  protected readonly titulo = computed(() => {
    const e = this.evento();
    return e ? `${e.tipoRotulo}${e.placa ? ' · ' + formatarPlaca(e.placa) : ''}` : 'Evento';
  });
  protected readonly marcadores = computed<MarcadorMapa[]>(() => {
    const e = this.evento();
    return e?.latitude != null && e.longitude != null
      ? [{ latitude: e.latitude, longitude: e.longitude, rotulo: this.titulo(), tom: this.tom[e.tipo] === 'danger' ? 'danger' : 'warning' }]
      : [];
  });

  protected duracao(segundos: number): string {
    const minutos = Math.round(segundos / 60);
    return minutos < 60 ? `${Math.max(1, minutos)} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  }
}
