import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoIconButtonComponent,
  GeoPageHeaderComponent,
  GeoRowDetailDirective,
  GeoSegmentedComponent,
  GeoSegmentedOption,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTone,
} from '@geo/ui';
import { EquipeNoBalcao, ItemNasEquipes } from '../../../core/models/balcao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { BalcaoService } from '../../../core/services/balcao.service';
import { numeroBr } from '../balcao/balcao.logic';
import { FaixaParte, FaixaSituacaoComponent } from '../rotina-ui/faixa-situacao.component';
import {
  LinhaMaterial,
  LinhaObra,
  ORDEM_SITUACAO,
  ROTULO_SITUACAO,
  SituacaoEquipe,
  TOM_SITUACAO,
  caminhaoDaEquipe,
  porMaterial,
  porObra,
  situacaoDaEquipe,
} from './estoque-equipes.logic';

type Visao = 'equipes' | 'materiais' | 'obras';
type Atalho = 'todas' | 'negativo' | 'retirada' | 'sucata' | 'hoje';
type Condicao = 'todas' | 'NOVO' | 'SUCATA';

interface LinhaEquipe extends EquipeNoBalcao {
  id: string;
  situacao: SituacaoEquipe;
}

/**
 * Estoque das equipes: o inventário dos caminhões em três formas de ver — por equipe (o que cada caminhão leva),
 * por material (onde está cada material) e por obra (o material de cada obra espalhado pelas equipes). A faixa
 * de situação e os atalhos filtram as três visões ao mesmo tempo; o recorte fica no endereço da página.
 */
@Component({
  selector: 'app-estoque-equipes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoIconButtonComponent,
    GeoPageHeaderComponent,
    GeoRowDetailDirective,
    GeoSegmentedComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    FaixaSituacaoComponent,
  ],
  template: `
    <div class="geo-page">
      <geo-page-header title="Estoque das equipes" icon="pi pi-truck"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Estoque das equipes' }]"
        description="O que está em cada caminhão agora, de qual obra é e o que precisa voltar ao almoxarifado.">
        <geo-button actions variant="outline" icon="pi pi-inbox" label="Balcão" routerLink="/almoxarifado/balcao"></geo-button>
        <geo-icon-button actions icon="pi pi-refresh" label="Atualizar" (pressed)="carregar()"></geo-icon-button>
      </geo-page-header>

      @if (carregando() && !equipes().length) {
        <geo-async-state state="loading" title="Lendo os caminhões"></geo-async-state>
      } @else if (erro()) {
        <geo-async-state state="error" title="Não foi possível ler os caminhões" [description]="erro() ?? undefined"
          actionLabel="Tentar de novo" (action)="carregar()"></geo-async-state>
      } @else if (!equipes().length) {
        <geo-async-state state="empty" title="Nenhuma equipe com material"
          description="As equipes aparecem aqui quando retiram material no balcão."></geo-async-state>
      } @else {
        <section class="ee-panorama" aria-label="Panorama dos caminhões">
          <app-faixa-situacao class="ee-panorama__faixa" [titulo]="tituloFaixa()" [apoio]="apoioFaixa()" [partes]="partesFaixa()"
            [ativo]="situacao()" rotuloGrupo="Filtrar as equipes pela situação" (escolher)="definirSituacao($event)"></app-faixa-situacao>
          <dl class="ee-panorama__numeros">
            <div><dt>Materiais nos caminhões</dt><dd>{{ totais().materiais }}</dd></div>
            <div><dt>Obras com material</dt><dd>{{ totais().obras }}</dd></div>
            <div [class.ee-alerta]="totais().sucatas"><dt>Sucata a devolver</dt><dd>{{ totais().sucatas }}</dd></div>
            <div [class.ee-perigo]="totais().negativos"><dt>Saldos negativos</dt><dd>{{ totais().negativos }}</dd></div>
          </dl>
        </section>

        <div class="ee-barra">
          <div class="geo-quick-filters ee-atalhos" role="group" aria-label="Atalhos">
            @for (a of atalhos(); track a.valor) {
              <button type="button" class="geo-quick-filter" [attr.aria-pressed]="atalho() === a.valor" (click)="definirAtalho(a.valor)">
                @if (a.tom) { <span class="ee-tom" [attr.data-tom]="a.tom" aria-hidden="true"></span> }
                {{ a.rotulo }} <span class="ee-contagem">{{ a.total }}</span>
              </button>
            }
          </div>
          <div class="ee-barra__dir">
            @if (bases().length > 1) {
              <geo-select class="ee-base" label="Base" [labelVisible]="false" [options]="bases()" [value]="base()" [clearable]="true"
                placeholder="Todas as bases" (valueChange)="definirBase($event)"></geo-select>
            }
            <geo-segmented label="Forma de visualizar" [options]="visoes()" [value]="visao()" (valueChange)="definirVisao($event)"></geo-segmented>
          </div>
        </div>

        @switch (visao()) {
          @case ('materiais') {
            <geo-data-table title="Materiais nos caminhões" [columns]="colunasMaterial" [rows]="linhasMaterial()" [rowKey]="chave"
              storageKey="estoque-equipes-materiais" searchPlaceholder="Material ou código" exportFileName="materiais-nos-caminhoes"
              [state]="itensCarregando() ? 'loading' : 'ready'" stateTitle="Nenhum material neste recorte" [filtered]="filtrado()"
              (clearFilters)="limpar()">
              <div table-filters>
                <geo-segmented label="Condição" [options]="condicoes" [value]="condicao()" (valueChange)="definirCondicao($event)"></geo-segmented>
              </div>
              <ng-template geoCell="material" let-m>
                <span class="geo-cell-strong">{{ m.descricao }}</span>
                <span class="geo-cell-muted">{{ m.codigo }}@if (m.condicao === 'SUCATA') { · sucata }</span>
              </ng-template>
              <ng-template geoCell="total" let-m>
                <span class="ee-qtd" [class.ee-qtd--neg]="m.total < 0">{{ num(m.total) }} <small>{{ m.unidade }}</small></span>
                @if (m.negativo) { <geo-status tone="danger">Negativo</geo-status> }
              </ng-template>
              <ng-template geoCell="equipes" let-m>
                <span class="ee-chips">
                  @for (e of m.equipes; track e.idEquipe) {
                    <span class="ee-chip" [class.ee-chip--neg]="e.quantidade < 0"><b>{{ e.equipe }}</b> {{ num(e.quantidade) }}</span>
                  }
                </span>
              </ng-template>
              <ng-template geoRowDetail let-m>
                <table class="ee-det">
                  <thead><tr><th scope="col">Equipe</th><th scope="col">Obra</th><th scope="col" class="ee-num">Quantidade</th></tr></thead>
                  <tbody>
                    @for (i of m.itens; track $index) {
                      <tr>
                        <td>{{ i.equipe }}</td>
                        <td>@if (i.idObra) { <a [routerLink]="['/obras', i.idObra, 'material']">Obra {{ i.numeroObra }}</a> <span class="geo-cell-muted">{{ i.tituloObra }}</span> } @else { <span class="geo-cell-muted">{{ i.quantidade < 0 ? 'Saldo negativo' : 'Sem obra' }}</span> }</td>
                        <td class="ee-num" [class.ee-qtd--neg]="i.quantidade < 0">{{ num(i.quantidade) }} {{ i.unidade }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </ng-template>
            </geo-data-table>
          }
          @case ('obras') {
            <geo-data-table title="Obras com material nos caminhões" [columns]="colunasObra" [rows]="linhasObra()" [rowKey]="chave"
              storageKey="estoque-equipes-obras" searchPlaceholder="Número da obra, endereço ou equipe" exportFileName="obras-nos-caminhoes"
              [state]="itensCarregando() ? 'loading' : 'ready'" stateTitle="Nenhuma obra neste recorte" [filtered]="filtrado()"
              (clearFilters)="limpar()">
              <div table-filters>
                <geo-segmented label="Condição" [options]="condicoes" [value]="condicao()" (valueChange)="definirCondicao($event)"></geo-segmented>
              </div>
              <ng-template geoCell="obra" let-o>
                @if (o.idObra) {
                  <a class="geo-cell-strong" [routerLink]="['/obras', o.idObra, 'material']">Obra {{ o.numeroObra ?? 'sem número' }}</a>
                  <span class="geo-cell-muted">{{ o.tituloObra }}</span>
                } @else {
                  <span class="geo-cell-strong">Sem obra</span>
                  <span class="geo-cell-muted">Material da equipe que não é de nenhuma obra</span>
                }
              </ng-template>
              <ng-template geoCell="equipes" let-o>
                <span class="ee-chips">@for (e of o.equipes; track e) { <span class="ee-chip"><b>{{ e }}</b></span> }</span>
              </ng-template>
              <ng-template geoCell="sucatas" let-o>
                @if (o.sucatas) { <geo-status tone="warning">{{ o.sucatas }} de sucata</geo-status> } @else { <span class="geo-cell-muted">—</span> }
              </ng-template>
              <ng-template geoRowDetail let-o>
                <table class="ee-det">
                  <thead><tr><th scope="col">Material</th><th scope="col">Equipe</th><th scope="col" class="ee-num">Quantidade</th></tr></thead>
                  <tbody>
                    @for (i of o.itens; track $index) {
                      <tr>
                        <td>{{ i.descricao }} <span class="geo-cell-muted">{{ i.codigo }}</span>@if (i.condicao === 'SUCATA') { <geo-status tone="warning">Sucata</geo-status> }</td>
                        <td>{{ i.equipe }}</td>
                        <td class="ee-num">{{ num(i.quantidade) }} {{ i.unidade }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </ng-template>
            </geo-data-table>
          }
          @default {
            <geo-data-table title="Caminhões" [columns]="colunasEquipe" [rows]="linhasEquipe()" [rowKey]="chave"
              storageKey="estoque-equipes" searchPlaceholder="Equipe, base ou encarregado" exportFileName="estoque-das-equipes"
              stateTitle="Nenhuma equipe neste recorte" [filtered]="filtrado()" (clearFilters)="limpar()">
              <ng-template geoCell="equipe" let-e>
                <span class="geo-cell-strong ee-nowrap">{{ e.codigo }}</span>
                <span class="geo-cell-muted">{{ e.base ?? 'Sem base' }}@if (e.encarregado) {, {{ e.encarregado }} }</span>
              </ng-template>
              <ng-template geoCell="situacao" let-e>
                <geo-status [tone]="tomDe(e)">{{ rotuloDe(e) }}</geo-status>
              </ng-template>
              <ng-template geoCell="caminhao" let-e>
                <span class="ee-carga">
                  <span class="ee-carga__barra" aria-hidden="true"><span [style.width.%]="cargaRelativa(e)"></span></span>
                  <span class="ee-carga__num">{{ e.itensNoCaminhao }}</span>
                </span>
              </ng-template>
              <ng-template geoCell="negativos" let-e>
                @if (e.negativosNoCaminhao) { <span class="ee-qtd--neg ee-forte">{{ e.negativosNoCaminhao }}</span> } @else { <span class="geo-cell-muted">—</span> }
              </ng-template>
              <ng-template geoCell="sucatas" let-e>
                @if (e.sucatasNoCaminhao) { <span class="ee-alerta-txt ee-forte">{{ e.sucatasNoCaminhao }}</span> } @else { <span class="geo-cell-muted">—</span> }
              </ng-template>
              <ng-template geoCell="hoje" let-e>
                <span class="ee-hoje">
                  @if (e.itensRetirada) { <span>{{ e.itensRetirada }} a retirar</span> }
                  @if (ehHoje(e.ultimaRetirada)) { <span class="geo-cell-muted">retirou {{ e.ultimaRetirada | date: 'HH:mm' }}</span> }
                  @if (ehHoje(e.ultimaDevolucao)) { <span class="geo-cell-muted">devolveu {{ e.ultimaDevolucao | date: 'HH:mm' }}</span> }
                  @if (!e.itensRetirada && !ehHoje(e.ultimaRetirada) && !ehHoje(e.ultimaDevolucao)) { <span class="geo-cell-muted">—</span> }
                </span>
              </ng-template>
              <ng-template geoRowDetail let-e>
                <div class="ee-cam">
                  <div class="ee-cam__topo">
                    <span class="geo-cell-muted">Caminhão de {{ e.codigo }}, por obra</span>
                    <span class="ee-cam__acoes">
                      @if (e.itensRetirada) { <geo-button size="sm" icon="pi pi-arrow-down" label="Atender retirada" (pressed)="balcao(e, 'retirada')"></geo-button> }
                      @if (e.itensNoCaminhao || e.negativosNoCaminhao) { <geo-button size="sm" variant="secondary" icon="pi pi-undo" label="Receber devolução" (pressed)="balcao(e, 'devolucao')"></geo-button> }
                    </span>
                  </div>
                  @if (itensCarregando()) {
                    <geo-async-state state="loading" [compact]="true" title="Abrindo o caminhão"></geo-async-state>
                  } @else {
                    @for (g of caminhao(e.idEquipe); track g.id) {
                      <table class="ee-det">
                        <caption>
                          @if (g.id === 'negativos') { <span class="ee-qtd--neg">Saldo negativo</span> <span class="geo-cell-muted">acertar no balcão ou com ajuste</span> }
                          @else if (g.idObra) { <a [routerLink]="['/obras', g.idObra, 'material']">Obra {{ g.numeroObra ?? 'sem número' }}</a> <span class="geo-cell-muted">{{ g.tituloObra }}</span> }
                          @else { Sem obra <span class="geo-cell-muted">material da equipe que não é de nenhuma obra</span> }
                        </caption>
                        <tbody>
                          @for (i of g.itens; track $index) {
                            <tr>
                              <td>{{ i.descricao }}@if (i.condicao === 'SUCATA') { <geo-status tone="warning">Sucata</geo-status> }</td>
                              <td class="ee-cod">{{ i.codigo }}</td>
                              <td class="ee-num" [class.ee-qtd--neg]="i.quantidade < 0">{{ num(i.quantidade) }} <small>{{ i.unidade }}</small></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    } @empty {
                      <p class="geo-cell-muted">Caminhão vazio.</p>
                    }
                  }
                </div>
              </ng-template>
            </geo-data-table>
          }
        }
      }
    </div>
  `,
  styles: `
    .ee-panorama {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--geo-space-4) var(--geo-space-6);
      padding: var(--geo-space-4); border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface);
    }
    .ee-panorama__numeros { display: flex; gap: var(--geo-space-6); margin: 0; }
    .ee-panorama__numeros div { display: grid; gap: 2px; padding-left: var(--geo-space-4); border-left: 1px solid var(--geo-border); }
    .ee-panorama__numeros dt { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); white-space: nowrap; }
    .ee-panorama__numeros dd { margin: 0; font-size: var(--geo-font-title); font-weight: var(--geo-font-weight-semibold); font-variant-numeric: tabular-nums; }
    .ee-alerta dd, .ee-alerta-txt { color: var(--geo-warning-text); }
    .ee-perigo dd, .ee-qtd--neg { color: var(--geo-danger-text); }
    .ee-forte { font-weight: var(--geo-font-weight-semibold); }

    .ee-barra { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-space-3); flex-wrap: wrap; }
    .ee-barra__dir { display: flex; align-items: center; gap: var(--geo-space-2); }
    .ee-base { width: 12rem; }
    .ee-contagem {
      min-width: 1.375rem; padding: 0 0.375rem; border-radius: 999px; background: var(--geo-surface-muted); color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption); font-variant-numeric: tabular-nums; text-align: center;
    }
    .geo-quick-filter[aria-pressed='true'] .ee-contagem { background: var(--geo-surface); color: var(--geo-foreground); }
    .ee-tom { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--ee-tom); }
    .ee-tom[data-tom='danger'] { --ee-tom: var(--geo-danger); }
    .ee-tom[data-tom='warning'] { --ee-tom: var(--geo-warning); }
    .ee-tom[data-tom='info'] { --ee-tom: var(--geo-info); }

    .ee-nowrap { white-space: nowrap; }
    .ee-qtd { font-weight: var(--geo-font-weight-semibold); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .ee-qtd small, .ee-det small { color: var(--geo-foreground-muted); font-weight: var(--geo-font-weight-regular); }
    .ee-chips { display: flex; flex-wrap: wrap; gap: var(--geo-space-1); }
    .ee-chip {
      display: inline-flex; gap: var(--geo-space-1); padding: 1px var(--geo-space-2); border: 1px solid var(--geo-border); border-radius: var(--geo-radius-sm);
      background: var(--geo-surface-subtle); font-size: var(--geo-font-caption); font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .ee-chip b { font-weight: var(--geo-font-weight-semibold); }
    .ee-chip--neg { border-color: var(--geo-danger); color: var(--geo-danger-text); }
    .ee-carga { display: inline-flex; align-items: center; justify-content: flex-end; gap: var(--geo-space-2); width: 100%; }
    .ee-carga__barra { width: 4.5rem; height: 0.375rem; overflow: hidden; border-radius: 999px; background: var(--geo-surface-muted); }
    .ee-carga__barra span { display: block; height: 100%; border-radius: inherit; background: var(--geo-brand); }
    .ee-carga__num { min-width: 2ch; font-weight: var(--geo-font-weight-semibold); font-variant-numeric: tabular-nums; text-align: right; }
    .ee-hoje { display: flex; flex-wrap: wrap; gap: 0 var(--geo-space-2); }

    .ee-cam { display: grid; gap: var(--geo-space-3); }
    .ee-cam__topo { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-space-3); flex-wrap: wrap; }
    .ee-cam__acoes { display: inline-flex; gap: var(--geo-space-2); }
    .ee-det { width: 100%; border-collapse: collapse; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); font-size: var(--geo-font-table); }
    .ee-det caption { padding: var(--geo-space-2) 0 var(--geo-space-1); font-weight: var(--geo-font-weight-semibold); text-align: left; }
    .ee-det caption .geo-cell-muted { margin-left: var(--geo-space-2); font-weight: var(--geo-font-weight-regular); }
    .ee-det th { padding: var(--geo-space-1) var(--geo-space-3); background: var(--geo-surface-subtle); color: var(--geo-foreground-muted); font-size: var(--geo-font-table-meta); font-weight: var(--geo-font-weight-medium); text-align: left; }
    .ee-det td { padding: var(--geo-space-1) var(--geo-space-3); border-top: 1px solid var(--geo-border); overflow-wrap: anywhere; }
    .ee-det td geo-status { margin-left: var(--geo-space-2); }
    .ee-num, .ee-det .ee-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .ee-det .ee-num { width: 9rem; }
    .ee-cod { width: 7rem; color: var(--geo-foreground-muted); font-size: var(--geo-font-table-meta); font-variant-numeric: tabular-nums; }

    @media (max-width: 64rem) {
      .ee-panorama { grid-template-columns: minmax(0, 1fr); }
      .ee-panorama__numeros { flex-wrap: wrap; gap: var(--geo-space-3); }
      .ee-panorama__numeros div:first-child { padding-left: 0; border-left: 0; }
    }
    @media (max-width: 40rem) {
      .ee-barra, .ee-barra__dir { display: grid; grid-template-columns: minmax(0, 1fr); }
      .ee-atalhos { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
      .ee-atalhos .geo-quick-filter { flex: none; }
      .ee-base { width: 100%; }
    }
  `,
})
export class EstoqueEquipesComponent {
  private readonly service = inject(BalcaoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly num = numeroBr;
  protected readonly chave = (l: { id: string }) => l.id;

  protected readonly equipes = signal<EquipeNoBalcao[]>([]);
  protected readonly itens = signal<ItemNasEquipes[]>([]);
  protected readonly carregando = signal(true);
  protected readonly itensCarregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  // Recorte (fica na URL).
  private readonly q = this.route.snapshot.queryParamMap;
  protected readonly visao = signal<Visao>(valorDe(this.q.get('visao'), ['equipes', 'materiais', 'obras'], 'equipes'));
  protected readonly atalho = signal<Atalho>(valorDe(this.q.get('atalho'), ['todas', 'negativo', 'retirada', 'sucata', 'hoje'], 'todas'));
  protected readonly situacao = signal<SituacaoEquipe | null>(valorDe(this.q.get('situacao'), ORDEM_SITUACAO, null));
  protected readonly base = signal<string | null>(this.q.get('base'));
  protected readonly condicao = signal<Condicao>(valorDe(this.q.get('condicao'), ['todas', 'NOVO', 'SUCATA'], 'todas'));

  protected readonly condicoes: GeoSegmentedOption<Condicao>[] = [
    { value: 'todas', label: 'Tudo' },
    { value: 'NOVO', label: 'Novo' },
    { value: 'SUCATA', label: 'Sucata' },
  ];

  private readonly todas = computed<LinhaEquipe[]>(() =>
    this.equipes()
      .map((e) => ({ ...e, id: e.idEquipe, situacao: situacaoDaEquipe(e) }))
      .sort((a, b) => ORDEM_SITUACAO.indexOf(a.situacao) - ORDEM_SITUACAO.indexOf(b.situacao) || a.codigo.localeCompare(b.codigo)),
  );
  private readonly daBase = computed(() => {
    const b = this.base();
    return b ? this.todas().filter((e) => (e.base ?? 'Sem base') === b) : this.todas();
  });

  protected readonly bases = computed(() =>
    [...new Set(this.todas().map((e) => e.base ?? 'Sem base'))].sort().map((b) => ({ label: b, value: b })),
  );

  protected readonly atalhos = computed(() => {
    const l = this.daBase();
    const hoje = (e: EquipeNoBalcao) => this.ehHoje(e.ultimaRetirada) || this.ehHoje(e.ultimaDevolucao);
    return [
      { valor: 'todas' as const, rotulo: 'Todas', total: l.length, tom: null },
      { valor: 'negativo' as const, rotulo: 'Com negativo', total: l.filter((e) => e.negativosNoCaminhao).length, tom: 'danger' },
      { valor: 'retirada' as const, rotulo: 'Retirada aberta', total: l.filter((e) => e.itensRetirada).length, tom: 'info' },
      { valor: 'sucata' as const, rotulo: 'Com sucata', total: l.filter((e) => e.sucatasNoCaminhao).length, tom: 'warning' },
      { valor: 'hoje' as const, rotulo: 'Passou no balcão hoje', total: l.filter(hoje).length, tom: null },
    ];
  });

  protected readonly linhasEquipe = computed(() => {
    const s = this.situacao();
    const a = this.atalho();
    return this.daBase().filter((e) => {
      if (s && e.situacao !== s) return false;
      switch (a) {
        case 'negativo': return e.negativosNoCaminhao > 0;
        case 'retirada': return e.itensRetirada > 0;
        case 'sucata': return e.sucatasNoCaminhao > 0;
        case 'hoje': return this.ehHoje(e.ultimaRetirada) || this.ehHoje(e.ultimaDevolucao);
        default: return true;
      }
    });
  });

  /** Os itens das equipes do recorte (as visões por material e por obra seguem a faixa, os atalhos e a base). */
  private readonly itensDoRecorte = computed(() => {
    const ids = new Set(this.linhasEquipe().map((e) => e.idEquipe));
    const c = this.condicao();
    return this.itens().filter((i) => ids.has(i.idEquipe) && (c === 'todas' || i.condicao === c));
  });
  protected readonly linhasMaterial = computed<LinhaMaterial[]>(() => porMaterial(this.itensDoRecorte()));
  protected readonly linhasObra = computed<LinhaObra[]>(() => porObra(this.itensDoRecorte()));

  protected readonly visoes = computed<GeoSegmentedOption<Visao>[]>(() => [
    { value: 'equipes', label: 'Por equipe', icon: 'pi pi-users', count: this.linhasEquipe().length },
    { value: 'materiais', label: 'Por material', icon: 'pi pi-box', count: this.itensCarregando() ? null : this.linhasMaterial().length },
    { value: 'obras', label: 'Por obra', icon: 'pi pi-building', count: this.itensCarregando() ? null : this.linhasObra().length },
  ]);

  protected readonly totais = computed(() => {
    const l = this.daBase();
    const ids = new Set(l.map((e) => e.idEquipe));
    const itens = this.itens().filter((i) => ids.has(i.idEquipe));
    return {
      materiais: new Set(itens.filter((i) => i.quantidade > 0).map((i) => `${i.idMaterial}:${i.condicao}`)).size,
      obras: new Set(itens.filter((i) => i.quantidade > 0 && i.idObra).map((i) => i.idObra)).size,
      sucatas: l.reduce((s, e) => s + e.sucatasNoCaminhao, 0),
      negativos: l.reduce((s, e) => s + e.negativosNoCaminhao, 0),
    };
  });

  protected readonly partesFaixa = computed<FaixaParte[]>(() =>
    ORDEM_SITUACAO.map((s) => ({ chave: s, rotulo: ROTULO_SITUACAO[s], tom: TOM_SITUACAO[s], total: this.daBase().filter((e) => e.situacao === s).length })),
  );
  protected readonly tituloFaixa = computed(() => {
    const n = this.daBase().length;
    const pend = this.daBase().filter((e) => e.situacao !== 'ok').length;
    return pend ? `${pend} de ${n} ${n === 1 ? 'equipe pede' : 'equipes pedem'} atenção` : `${n} ${n === 1 ? 'equipe' : 'equipes'} em dia`;
  });
  protected readonly apoioFaixa = computed(() => (this.situacao() ? 'Clique de novo para ver todas' : 'Clique numa situação para filtrar'));

  protected readonly filtrado = computed(() => this.atalho() !== 'todas' || !!this.situacao() || !!this.base() || this.condicao() !== 'todas');
  private readonly maxCarga = computed(() => Math.max(1, ...this.todas().map((e) => e.itensNoCaminhao)));

  protected readonly colunasEquipe: GeoDataTableColumn<LinhaEquipe>[] = [
    { key: 'equipe', header: 'Equipe', type: 'custom', value: (e) => e.codigo, display: (e) => `${e.codigo} ${e.base ?? ''} ${e.encarregado ?? ''}`, priority: 1, width: '16rem' },
    { key: 'situacao', header: 'Situação', type: 'custom', value: (e) => ORDEM_SITUACAO.indexOf(e.situacao), display: (e) => ROTULO_SITUACAO[e.situacao], priority: 1, width: '11rem' },
    { key: 'caminhao', header: 'No caminhão', type: 'custom', value: (e) => e.itensNoCaminhao, display: (e) => String(e.itensNoCaminhao), align: 'end', width: '9rem' },
    { key: 'obrasNoCaminhao', header: 'Obras', type: 'integer', width: '6rem' },
    { key: 'sucatas', header: 'Sucata', type: 'custom', value: (e) => e.sucatasNoCaminhao, display: (e) => String(e.sucatasNoCaminhao), align: 'end', width: '6rem' },
    { key: 'negativos', header: 'Negativos', type: 'custom', value: (e) => e.negativosNoCaminhao, display: (e) => String(e.negativosNoCaminhao), align: 'end', width: '7rem' },
    { key: 'hoje', header: 'Balcão hoje', type: 'custom', value: (e) => e.itensRetirada, display: (e) => (e.itensRetirada ? `${e.itensRetirada} a retirar` : ''), searchable: false },
  ];

  protected readonly colunasMaterial: GeoDataTableColumn<LinhaMaterial>[] = [
    { key: 'material', header: 'Material', type: 'custom', value: (m) => m.descricao, display: (m) => `${m.descricao} ${m.codigo}`, priority: 1 },
    { key: 'total', header: 'Total nas equipes', type: 'custom', value: (m) => m.total, display: (m) => `${numeroBr(m.total)} ${m.unidade ?? ''}`, align: 'end', priority: 1, width: '12rem' },
    { key: 'equipes', header: 'Com quem está', type: 'custom', value: (m) => m.equipes.length, display: (m) => m.equipes.map((e) => `${e.equipe} ${numeroBr(e.quantidade)}`).join(', '), searchable: true },
    { key: 'obras', header: 'Obras', type: 'integer', width: '6rem' },
  ];

  protected readonly colunasObra: GeoDataTableColumn<LinhaObra>[] = [
    { key: 'obra', header: 'Obra', type: 'custom', value: (o) => o.numeroObra ?? 'zzz', display: (o) => (o.idObra ? `Obra ${o.numeroObra ?? ''} ${o.tituloObra ?? ''}` : 'Sem obra'), priority: 1 },
    { key: 'equipes', header: 'Equipes', type: 'custom', value: (o) => o.equipes.length, display: (o) => o.equipes.join(', '), searchable: true, width: '16rem' },
    { key: 'materiais', header: 'Materiais', type: 'integer', width: '7rem' },
    { key: 'sucatas', header: 'Sucata', type: 'custom', value: (o) => o.sucatas, display: (o) => String(o.sucatas), width: '9rem' },
  ];

  constructor() {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.itensCarregando.set(true);
    this.erro.set(null);
    forkJoin({ equipes: this.service.estoqueDasEquipes(), itens: this.service.itensDasEquipes() }).subscribe({
      next: ({ equipes, itens }) => {
        this.equipes.set(equipes);
        this.itens.set(itens);
        this.carregando.set(false);
        this.itensCarregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
        this.itensCarregando.set(false);
      },
    });
  }

  protected tomDe(e: LinhaEquipe): GeoTone {
    return TOM_SITUACAO[e.situacao];
  }

  protected rotuloDe(e: LinhaEquipe): string {
    return ROTULO_SITUACAO[e.situacao];
  }

  protected caminhao(idEquipe: string): LinhaObra[] {
    return caminhaoDaEquipe(this.itens(), idEquipe);
  }

  protected cargaRelativa(e: EquipeNoBalcao): number {
    return Math.round((e.itensNoCaminhao / this.maxCarga()) * 100);
  }

  protected ehHoje(iso: string | null): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    const h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
  }

  protected definirVisao(v: Visao | null): void {
    if (v) { this.visao.set(v); this.sincronizar(); }
  }
  protected definirAtalho(a: Atalho): void {
    this.atalho.set(this.atalho() === a ? 'todas' : a);
    this.sincronizar();
  }
  protected definirSituacao(s: string | null): void {
    this.situacao.set(s as SituacaoEquipe | null);
    this.sincronizar();
  }
  protected definirBase(b: string | null): void {
    this.base.set(b);
    this.sincronizar();
  }
  protected definirCondicao(c: Condicao | null): void {
    if (c) { this.condicao.set(c); this.sincronizar(); }
  }
  protected limpar(): void {
    this.atalho.set('todas');
    this.situacao.set(null);
    this.base.set(null);
    this.condicao.set('todas');
    this.sincronizar();
  }

  protected balcao(e: EquipeNoBalcao, modo: 'retirada' | 'devolucao'): void {
    void this.router.navigate(['/almoxarifado/balcao'], { queryParams: { equipe: e.idEquipe, modo } });
  }

  private sincronizar(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        visao: this.visao() === 'equipes' ? null : this.visao(),
        atalho: this.atalho() === 'todas' ? null : this.atalho(),
        situacao: this.situacao(),
        base: this.base(),
        condicao: this.condicao() === 'todas' ? null : this.condicao(),
      },
    });
  }
}

function valorDe<T extends string, D extends T | null>(v: string | null, validos: readonly T[], padrao: D): T | D {
  return v && (validos as readonly string[]).includes(v) ? (v as T) : padrao;
}
