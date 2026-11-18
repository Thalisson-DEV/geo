import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CesDatepickerComponent, CesMultiSelectComponent } from '@ces/ui';

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
 * Campos do recorte comum, dentro do `ces-filter-grid` do painel (o host some do layout). O painel
 * acrescenta depois os filtros próprios.
 */
@Component({
  selector: 'app-frota-recorte-campos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CesDatepickerComponent, CesMultiSelectComponent],
  host: { style: 'display: contents' },
  template: `
    @let r = recorte;
    <ces-datepicker label="Início" [inputId]="prefixo() + '-inicio'" [value]="r.inicio()" (valueChange)="r.mudarData('inicio', $event)" [maxDate]="r.fim()"></ces-datepicker>
    <ces-datepicker label="Fim" [inputId]="prefixo() + '-fim'" [value]="r.fim()" (valueChange)="r.mudarData('fim', $event)" [minDate]="r.inicio()"></ces-datepicker>
    <ces-multiselect label="Base operacional" [inputId]="prefixo() + '-base'" placeholder="Todas" [options]="r.bases.opcoes()"
      [value]="r.idsBase()" (valueChange)="r.idsBase.set($event)"></ces-multiselect>
    @if (campos().includes('processo')) {
      <ces-multiselect label="Processo" [inputId]="prefixo() + '-processo'" placeholder="Todos" [options]="r.processos()"
        description="Pela equipe vinculada ao veículo." [value]="r.idsProcesso()" (valueChange)="r.idsProcesso.set($event)"></ces-multiselect>
    }
    @if (campos().includes('tipo')) {
      <ces-multiselect label="Tipo de veículo" [inputId]="prefixo() + '-tipo'" placeholder="Todos" [options]="r.tipos()"
        [value]="r.idsTipo()" (valueChange)="r.idsTipo.set($event)"></ces-multiselect>
    }
    @if (campos().includes('regime')) {
      <ces-multiselect label="Regime" [inputId]="prefixo() + '-regime'" placeholder="Próprios e locados" [options]="r.regimes" [filter]="false"
        [value]="r.regimesSel()" (valueChange)="r.regimesSel.set($event)"></ces-multiselect>
    }
    @if (campos().includes('situacao')) {
      <ces-multiselect label="Situação do veículo" [inputId]="prefixo() + '-situacao'" placeholder="Todas" [options]="r.situacoes" [filter]="false"
        [value]="r.situacoesSel()" (valueChange)="r.situacoesSel.set($event)"></ces-multiselect>
    }
    @if (campos().includes('veiculo')) {
      <ces-multiselect label="Veículos" [inputId]="prefixo() + '-veiculo'" placeholder="Todos" [options]="r.veiculosOpcoes()" [virtualScroll]="true"
        [value]="r.idsVeiculo()" (valueChange)="r.idsVeiculo.set($event)"></ces-multiselect>
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
    .fpt-recorte { margin: 0.5rem 0 0; color: var(--ces-foreground-muted); font-size: 0.8rem; }
    .fpt-paineis { display: flex; flex-wrap: wrap; gap: 0.375rem; margin: 0 0 0.875rem; padding: 0; list-style: none; }
    .fpt-painel {
      display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.25rem; padding: 0.35rem 0.8rem;
      border: 1px solid var(--ces-border); border-radius: 999px; color: var(--ces-foreground-muted);
      font-size: 0.8125rem; font-weight: 600; text-decoration: none; background: var(--ces-surface);
      transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    }
    .fpt-painel:hover { color: var(--ces-foreground); border-color: var(--ces-border-strong); }
    .fpt-painel:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 2px; }
    .fpt-painel.is-ativo { color: var(--ces-brand); background: var(--ces-brand-soft); border-color: var(--ces-brand); }
    .fpt-painel i { font-size: 0.8rem; }
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
    </div>
    @if (dados(); as d) {
      <p class="fpt-recorte">{{ descricao() }} · {{ d.recorte.veiculos }} veículos no recorte ({{ d.recorte.emOperacao }} em operação, {{ d.recorte.locados }} locados)</p>
    }
  `
})
export class FrotaPainelTopoComponent {
  protected readonly recorte = inject(RecorteFrotaService);
  protected readonly paineis = PAINEIS_FROTA;
  readonly dados = input<RelatorioGerencialFrota | null>(null);
  readonly periodo = output<PeriodoFrota>();
  protected readonly descricao = computed(() => this.recorte.descricaoPeriodo(this.dados()));
}
