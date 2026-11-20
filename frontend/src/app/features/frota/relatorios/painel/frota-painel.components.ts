import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GeoDatepickerComponent, GeoMultiSelectComponent } from '@geo/ui';

import { RelatorioGerencialFrota } from '../../../../core/models/frota-relatorios.models';
import { PeriodoFrota, RecorteFrotaService } from './recorte-frota.service';

/** Os dashboards da frota, na ordem do menu. */
export const PAINEIS_FROTA = [
  { rota: '/frota/relatorios', rotulo: 'Visão geral', icone: 'pi pi-compass', exato: true },
  { rota: '/frota/relatorios/custos', rotulo: 'Custos', icone: 'pi pi-wallet', exato: false },
  { rota: '/frota/relatorios/manutencao', rotulo: 'Manutenção', icone: 'pi pi-wrench', exato: false },
  { rota: '/frota/relatorios/combustivel', rotulo: 'Combustível', icone: 'pi pi-gauge', exato: false },
  { rota: '/frota/relatorios/uso', rotulo: 'Uso e produtividade', icone: 'pi pi-map', exato: false },
  { rota: '/frota/relatorios/conformidade', rotulo: 'Conformidade e risco', icone: 'pi pi-shield', exato: false }
] as const;

/**
 * Campos do recorte comum, dentro do `geo-filter-grid` do painel (o host some do layout). O painel
 * acrescenta depois os filtros próprios.
 */
@Component({
  selector: 'app-frota-recorte-campos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoDatepickerComponent, GeoMultiSelectComponent],
  host: { style: 'display: contents' },
  template: `
    @let r = recorte;
    <geo-datepicker label="Início" [inputId]="prefixo() + '-inicio'" [value]="r.inicio()" (valueChange)="r.mudarData('inicio', $event)" [maxDate]="r.fim()"></geo-datepicker>
    <geo-datepicker label="Fim" [inputId]="prefixo() + '-fim'" [value]="r.fim()" (valueChange)="r.mudarData('fim', $event)" [minDate]="r.inicio()"></geo-datepicker>
    <geo-multiselect label="Base operacional" [inputId]="prefixo() + '-base'" placeholder="Todas" [options]="r.bases.opcoes()"
      [value]="r.idsBase()" (valueChange)="r.idsBase.set($event)"></geo-multiselect>
    @if (campos().includes('processo')) {
      <geo-multiselect label="Processo" [inputId]="prefixo() + '-processo'" placeholder="Todos" [options]="r.processos()"
        description="Pela equipe vinculada ao veículo." [value]="r.idsProcesso()" (valueChange)="r.idsProcesso.set($event)"></geo-multiselect>
    }
    @if (campos().includes('tipo')) {
      <geo-multiselect label="Tipo de veículo" [inputId]="prefixo() + '-tipo'" placeholder="Todos" [options]="r.tipos()"
        [value]="r.idsTipo()" (valueChange)="r.idsTipo.set($event)"></geo-multiselect>
    }
    @if (campos().includes('regime')) {
      <geo-multiselect label="Regime" [inputId]="prefixo() + '-regime'" placeholder="Próprios e locados" [options]="r.regimes" [filter]="false"
        [value]="r.regimesSel()" (valueChange)="r.regimesSel.set($event)"></geo-multiselect>
    }
    @if (campos().includes('situacao')) {
      <geo-multiselect label="Situação do veículo" [inputId]="prefixo() + '-situacao'" placeholder="Todas" [options]="r.situacoes" [filter]="false"
        [value]="r.situacoesSel()" (valueChange)="r.situacoesSel.set($event)"></geo-multiselect>
    }
    @if (campos().includes('veiculo')) {
      <geo-multiselect label="Veículos" [inputId]="prefixo() + '-veiculo'" placeholder="Todos" [options]="r.veiculosOpcoes()" [virtualScroll]="true"
        [value]="r.idsVeiculo()" (valueChange)="r.idsVeiculo.set($event)"></geo-multiselect>
    }
  `
})
export class FrotaRecorteCamposComponent {
  protected readonly recorte = inject(RecorteFrotaService);
  readonly prefixo = input.required<string>();
  readonly campos = input<readonly ('processo' | 'tipo' | 'regime' | 'situacao' | 'veiculo')[]>(['processo', 'tipo', 'regime', 'situacao', 'veiculo']);
}

/**
 * Faixa do topo dos dashboards da frota: atalhos de período, o recorte em uma linha e a navegação para
 * os outros painéis levando o mesmo recorte.
 */
@Component({
  selector: 'app-frota-painel-topo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  styles: `
    :host { display: block; margin-bottom: 1rem; }
    .fpt-linha { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .fpt-periodos { width: fit-content; max-width: 100%; }
    .fpt-recorte { margin: 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    /* Navegação entre os painéis: abas sublinhadas e neutras; o acento marca só a aba atual. */
    .fpt-paineis { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0 0 0.75rem; padding: 0; list-style: none; border-bottom: 1px solid var(--geo-border); }
    .fpt-painel {
      display: inline-flex; align-items: center; gap: 0.375rem; min-height: 2.25rem; padding: 0 0.75rem; margin-bottom: -1px;
      border-bottom: 2px solid transparent; color: var(--geo-foreground-muted);
      font-size: var(--geo-font-control); font-weight: 500; text-decoration: none;
      transition: color 150ms ease, border-color 150ms ease;
    }
    .fpt-painel:hover { color: var(--geo-foreground); }
    .fpt-painel:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: -2px; border-radius: var(--geo-radius-sm); }
    .fpt-painel.is-ativo { color: var(--geo-foreground); font-weight: 600; border-bottom-color: var(--geo-brand); }
    .fpt-painel i { font-size: var(--geo-font-caption); }
    @media (prefers-reduced-motion: reduce) { .fpt-painel { transition: none; } }
  `,
  template: `
    <nav aria-label="Painéis da frota">
      <ul class="fpt-paineis">
        @for (p of paineis; track p.rota) {
          <li>
            <a class="fpt-painel" [routerLink]="p.rota" [queryParams]="recorte.queryParams()" routerLinkActive="is-ativo"
              [routerLinkActiveOptions]="{ exact: p.exato }" ariaCurrentWhenActive="page">
              <i [class]="p.icone" aria-hidden="true"></i>{{ p.rotulo }}
            </a>
          </li>
        }
      </ul>
    </nav>
    <div class="fpt-linha">
      <div class="dash-tabs fpt-periodos" role="group" aria-label="Período rápido">
        @for (p of recorte.periodos; track p.valor) {
          <button type="button" class="dash-tab" [class.is-active]="recorte.periodoAtivo() === p.valor"
            [attr.aria-pressed]="recorte.periodoAtivo() === p.valor" (click)="periodo.emit(p.valor)">{{ p.rotulo }}</button>
        }
      </div>
      @if (dados(); as d) {
        <p class="fpt-recorte">{{ descricao() }} · {{ d.recorte.veiculos }} veículos no recorte ({{ d.recorte.emOperacao }} em operação, {{ d.recorte.locados }} locados)</p>
      }
    </div>
  `
})
export class FrotaPainelTopoComponent {
  protected readonly recorte = inject(RecorteFrotaService);
  protected readonly paineis = PAINEIS_FROTA;
  readonly dados = input<RelatorioGerencialFrota | null>(null);
  readonly periodo = output<PeriodoFrota>();
  protected readonly descricao = computed(() => this.recorte.descricaoPeriodo(this.dados()));
}
