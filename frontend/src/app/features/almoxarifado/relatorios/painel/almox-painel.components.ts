import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GeoDatepickerComponent, GeoMultiSelectComponent } from '@geo/ui';

import { PeriodoAlmox, RecorteAlmoxService } from './recorte-almox.service';

/** Os relatórios do almoxarifado, na ordem do menu. */
export const PAINEIS_ALMOX = [
  { rota: '/almoxarifado/relatorios', rotulo: 'Visão geral', icone: 'pi pi-compass', exato: true },
  { rota: '/almoxarifado/relatorios/solicitacoes-comerciais', rotulo: 'Solicitações comerciais', icone: 'pi pi-shopping-cart', exato: false },
  { rota: '/almoxarifado/relatorios/solicitacoes-tecnicas', rotulo: 'Solicitações técnicas', icone: 'pi pi-wrench', exato: false },
  { rota: '/almoxarifado/relatorios/fechamento', rotulo: 'Encerramento de obras', icone: 'pi pi-flag', exato: false },
  { rota: '/almoxarifado/relatorios/movimentacoes', rotulo: 'Movimentações', icone: 'pi pi-arrow-right-arrow-left', exato: false },
  { rota: '/almoxarifado/relatorios/estoque', rotulo: 'Estoque e saldos', icone: 'pi pi-box', exato: false },
  { rota: '/almoxarifado/relatorios/consumo', rotulo: 'Consumo de materiais', icone: 'pi pi-chart-bar', exato: false }
] as const;

export type CampoRecorteAlmox = 'periodo' | 'base' | 'processo' | 'almox' | 'equipe';

/**
 * Campos do recorte comum, dentro do `geo-filter-grid` do relatório (o host some do layout). O relatório
 * acrescenta depois os filtros próprios.
 */
@Component({
  selector: 'app-almox-recorte-campos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoDatepickerComponent, GeoMultiSelectComponent],
  host: { style: 'display: contents' },
  template: `
    @let r = recorte;
    @if (campos().includes('periodo')) {
      <geo-datepicker label="Início" [inputId]="prefixo() + '-inicio'" [value]="r.inicio()" (valueChange)="r.mudarData('inicio', $event)" [maxDate]="r.fim()"></geo-datepicker>
      <geo-datepicker label="Fim" [inputId]="prefixo() + '-fim'" [value]="r.fim()" (valueChange)="r.mudarData('fim', $event)" [minDate]="r.inicio()"></geo-datepicker>
    }
    @if (campos().includes('base')) {
      <geo-multiselect label="Base operacional" [inputId]="prefixo() + '-base'" placeholder="Todas" [options]="r.bases()"
        [value]="r.idsBase()" (valueChange)="r.idsBase.set($event)"></geo-multiselect>
    }
    @if (campos().includes('almox')) {
      <geo-multiselect label="Almoxarifado" [inputId]="prefixo() + '-almox'" placeholder="Todos" [options]="r.almoxOpcoes()"
        [value]="r.idsAlmox()" (valueChange)="r.idsAlmox.set($event)"></geo-multiselect>
    }
    @if (campos().includes('processo')) {
      <geo-multiselect label="Processo" [inputId]="prefixo() + '-processo'" placeholder="Todos" [options]="r.processos()"
        description="Pela equipe envolvida." [value]="r.idsProcesso()" (valueChange)="r.idsProcesso.set($event)"></geo-multiselect>
    }
    @if (campos().includes('equipe')) {
      <geo-multiselect label="Equipe" [inputId]="prefixo() + '-equipe'" placeholder="Todas" [options]="r.equipeOpcoes()" [virtualScroll]="true"
        [value]="r.idsEquipe()" (valueChange)="r.idsEquipe.set($event)"></geo-multiselect>
    }
  `
})
export class AlmoxRecorteCamposComponent {
  protected readonly recorte = inject(RecorteAlmoxService);
  readonly prefixo = input.required<string>();
  readonly campos = input<readonly CampoRecorteAlmox[]>(['periodo', 'base', 'almox', 'processo', 'equipe']);
}

/**
 * Faixa do topo dos relatórios do almoxarifado: a navegação para os outros relatórios levando o mesmo
 * recorte, os atalhos de período e a descrição do período comparado.
 */
@Component({
  selector: 'app-almox-painel-topo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  styles: `
    :host { display: block; margin-bottom: 1rem; }
    .apt-periodos { width: fit-content; max-width: 100%; overflow-x: auto; }
    .apt-recorte { margin: 0.5rem 0 0; color: var(--geo-foreground-muted); font-size: 0.8rem; }
    .apt-paineis { display: flex; flex-wrap: wrap; gap: 0.375rem; margin: 0 0 0.875rem; padding: 0; list-style: none; }
    .apt-painel {
      display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.25rem; padding: 0.35rem 0.8rem;
      border: 1px solid var(--geo-border); border-radius: 999px; color: var(--geo-foreground-muted);
      font-size: 0.8125rem; font-weight: 600; text-decoration: none; background: var(--geo-surface);
      transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    }
    .apt-painel:hover { color: var(--geo-foreground); border-color: var(--geo-border-strong); }
    .apt-painel:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    .apt-painel.is-ativo { color: var(--geo-brand); background: var(--geo-brand-soft); border-color: var(--geo-brand); }
    .apt-painel i { font-size: 0.8rem; }
    @media (prefers-reduced-motion: reduce) { .apt-painel { transition: none; } }
  `,
  template: `
    <nav aria-label="Relatórios do almoxarifado">
      <ul class="apt-paineis">
        @for (p of paineis; track p.rota) {
          <li>
            <a class="apt-painel" [routerLink]="p.rota" [queryParams]="recorte.queryParams()" routerLinkActive="is-ativo"
              [routerLinkActiveOptions]="{ exact: p.exato }" ariaCurrentWhenActive="page">
              <i [class]="p.icone" aria-hidden="true"></i>{{ p.rotulo }}
            </a>
          </li>
        }
      </ul>
    </nav>
    @if (comPeriodo()) {
      <div class="dash-tabs apt-periodos" role="group" aria-label="Período rápido">
        @for (p of recorte.periodos; track p.valor) {
          <button type="button" class="dash-tab" [class.is-active]="recorte.periodoAtivo() === p.valor"
            [attr.aria-pressed]="recorte.periodoAtivo() === p.valor" (click)="periodo.emit(p.valor)">{{ p.rotulo }}</button>
        }
      </div>
    }
    @if (descricao()) {
      <p class="apt-recorte">{{ descricao() }}</p>
    }
  `
})
export class AlmoxPainelTopoComponent {
  protected readonly recorte = inject(RecorteAlmoxService);
  protected readonly paineis = PAINEIS_ALMOX;
  readonly descricao = input<string>('');
  readonly comPeriodo = input(true);
  readonly periodo = output<PeriodoAlmox>();
}
