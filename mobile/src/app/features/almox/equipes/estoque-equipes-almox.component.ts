import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { numeroBr } from '../../../core/almox/balcao.logic';
import { EquipeNoBalcao, ItemNasEquipes } from '../../../core/almox/balcao.models';
import { BalcaoService } from '../../../core/almox/balcao.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/error.interceptor';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import {
  AbasSecaoComponent, ChipsComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, OpcaoChip, OpcaoSegmento, SegmentadoComponent,
  TituloGrandeComponent, VazioComponent,
} from '../../../ui';
import { abasAlmox } from '../almox-abas';
import {
  AtalhoEquipes, MaterialNasEquipes, atendeAtalho, normalizar, obrasDaEquipe, porMaterial, textoCaminhao,
} from './estoque-equipes.logic';

type Visao = 'equipes' | 'materiais';

/**
 * Estoque das equipes no app do almoxarifado: o que cada caminhão leva, por obra, com sucata e saldo negativo em destaque.
 * Duas visões (por equipe e por material), atalhos com contagem e busca. Tocar abre o detalhe numa folha; a equipe tem
 * atalho para o balcão. Precisa de internet: o saldo é o de agora, no servidor.
 */
@Component({
  selector: 'app-estoque-equipes-almox',
  standalone: true,
  imports: [AbasSecaoComponent, ChipsComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, SegmentadoComponent, TituloGrandeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-titulo-grande titulo="Almoxarifado" subtitulo="Estoque das equipes">
      <geo-indicador-rede />
      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="carregar()" aria-label="Atualizar">
        <geo-icone nome="atualizar" [tamanho]="18" />
      </button>
    </geo-titulo-grande>
    @if (abas().length > 1) { <geo-abas-secao rotulo="Almoxarifado" [abas]="abas()" /> }

    @if (!rede.isOnline()) {
      <geo-vazio icone="sem_rede" titulo="O estoque das equipes precisa de internet" texto="O saldo dos caminhões é o de agora, no servidor. Conecte e a lista aparece aqui." />
    } @else if (erro()) {
      <geo-vazio icone="alerta" titulo="Não foi possível abrir o estoque das equipes" [texto]="erro()">
        <button type="button" class="geo-btn geo-btn--principal" (click)="carregar()">Tentar de novo</button>
      </geo-vazio>
    } @else if (!carregado()) {
      <div class="geo-esqueletos" aria-busy="true" aria-label="Carregando o estoque das equipes">
        @for (i of [1, 2, 3, 4]; track i) { <div class="geo-esqueleto" style="height: 64px"></div> }
      </div>
    } @else {
      <section class="panorama" aria-label="Panorama dos caminhões">
        <p><strong class="geo-num">{{ panorama().comMaterial }}</strong> de {{ equipes().length }} equipes com material no caminhão</p>
        @if (panorama().negativos) {
          <p class="panorama__alerta"><geo-icone nome="alerta" [tamanho]="16" />{{ panorama().negativos }} {{ panorama().negativos === 1 ? 'equipe com saldo negativo' : 'equipes com saldo negativo' }}: acerte na devolução ou com o técnico.</p>
        }
      </section>

      <div class="barra">
        <geo-segmentado rotulo="Ver por" [opcoes]="visoes" [valor]="visao()" (valorChange)="visao.set($event)" />
        <div class="busca"><geo-icone nome="busca" [tamanho]="18" />
          <input type="search" [placeholder]="visao() === 'equipes' ? 'Equipe ou encarregado' : 'Material ou código'" enterkeyhint="search"
            aria-label="Buscar" [value]="busca()" (input)="busca.set($any($event.target).value)"></div>
      </div>

      @if (visao() === 'equipes') {
        <geo-chips rotulo="Mostrar equipes" [opcoes]="atalhos" [contagem]="contagem()" [valor]="atalho()" (valorChange)="atalho.set($any($event))" />
        @if (linhasEquipe().length) {
          <ul class="geo-grupo">
            @for (e of linhasEquipe(); track e.idEquipe) {
              <li><button type="button" class="geo-linha geo-linha--acao" (click)="aberta.set(e)">
                <span class="geo-selo" [class.geo-selo--erro]="e.negativosNoCaminhao" [class.geo-selo--destaque]="!e.negativosNoCaminhao && e.itensNoCaminhao"><geo-icone nome="caminhao" /></span>
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo geo-num">{{ e.codigo }}
                    @if (e.negativosNoCaminhao) { <span class="geo-etiqueta geo-etiqueta--erro">{{ e.negativosNoCaminhao }} negativo{{ e.negativosNoCaminhao > 1 ? 's' : '' }}</span> }
                    @if (e.itensRetirada) { <span class="geo-etiqueta">Retirada aberta</span> }
                  </span>
                  <span class="geo-linha__apoio">{{ e.encarregado ?? 'Sem encarregado' }}{{ e.base ? ' · ' + e.base : '' }}</span>
                  <span class="geo-linha__apoio">{{ caminhao(e) }}</span>
                </span>
                <geo-icone nome="avancar" [tamanho]="18" />
              </button></li>
            }
          </ul>
        } @else {
          <geo-vazio icone="check" titulo="Nenhuma equipe neste recorte" texto="Troque o atalho ou limpe a busca." />
        }
      } @else {
        @if (linhasMaterial().length) {
          <ul class="geo-grupo lista-material">
            @for (m of linhasMaterial(); track m.chave) {
              <li><button type="button" class="geo-linha geo-linha--acao" (click)="materialAberto.set(m)">
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo">{{ m.descricao }}
                    @if (m.condicao === 'SUCATA') { <span class="geo-etiqueta geo-etiqueta--atencao">Sucata</span> }
                  </span>
                  <span class="geo-linha__apoio geo-num">{{ m.codigo }} · {{ m.equipes }} {{ m.equipes === 1 ? 'equipe' : 'equipes' }}</span>
                </span>
                <span class="qtd">
                  <strong class="geo-num">{{ num(m.total) }}</strong><small>{{ m.unidade ?? '' }}</small>
                  @if (m.negativo < 0) { <span class="qtd__neg geo-num">{{ num(m.negativo) }} negativo</span> }
                </span>
              </button></li>
            }
          </ul>
        } @else {
          <geo-vazio icone="check" titulo="Nenhum material nos caminhões" [texto]="busca() ? 'Limpe a busca para ver tudo.' : null" />
        }
      }
    }

    <geo-folha [aberta]="!!aberta()" (fechar)="aberta.set(null)" [titulo]="aberta()?.codigo ?? null"
      [descricao]="aberta() ? (aberta()!.encarregado ?? 'Sem encarregado') + ' · ' + caminhao(aberta()!) : null">
      @for (g of obrasAbertas(); track g.chave) {
        <h3 class="grupo" [class.grupo--neg]="g.negativo">
          @if (g.negativo) { Saldo negativo } @else if (g.numeroObra) { Obra {{ g.numeroObra }} } @else { Sem obra }
          @if (g.tituloObra) { <small>{{ g.tituloObra }}</small> }
        </h3>
        <ul class="itens">
          @for (i of g.itens; track i.idMaterial + i.condicao) {
            <li><span class="itens__desc">{{ i.descricao }} @if (i.condicao === 'SUCATA') { <span class="geo-etiqueta geo-etiqueta--atencao">Sucata</span> }
              <small class="geo-num">{{ i.codigo }}</small></span>
              <span class="geo-num itens__qtd" [class.itens__qtd--neg]="i.quantidade < 0">{{ num(i.quantidade) }} {{ i.unidade ?? '' }}</span></li>
          }
        </ul>
      } @empty {
        <p class="vazio-folha">O caminhão desta equipe está vazio.</p>
      }
      @if (aberta() && auth.podeOperarBalcao()) {
        <div rodape class="rodape">
          <button type="button" class="geo-btn geo-btn--neutro geo-btn--bloco" [disabled]="!aberta()!.itensNoCaminhao && !aberta()!.negativosNoCaminhao"
            (click)="balcao(aberta()!, 'devolucao')"><geo-icone nome="entrada" />Devolução</button>
          <button type="button" class="geo-btn geo-btn--principal geo-btn--bloco" [disabled]="!aberta()!.itensRetirada"
            (click)="balcao(aberta()!, 'retirada')"><geo-icone nome="saida" />Retirada</button>
        </div>
      }
    </geo-folha>

    <geo-folha [aberta]="!!materialAberto()" (fechar)="materialAberto.set(null)" [titulo]="materialAberto()?.descricao ?? null"
      [descricao]="materialAberto() ? materialAberto()!.codigo + ' · ' + num(materialAberto()!.total) + ' ' + (materialAberto()!.unidade ?? '') + ' nos caminhões' : null">
      <ul class="itens">
        @for (l of materialAberto()?.linhas ?? []; track l.idEquipe + (l.idObra ?? '') + l.quantidade) {
          <li><span class="itens__desc"><span class="geo-num">{{ l.equipe }}</span>
            <small>{{ l.quantidade < 0 ? 'Saldo negativo' : l.numeroObra ? 'Obra ' + l.numeroObra : 'Sem obra' }}</small></span>
            <span class="geo-num itens__qtd" [class.itens__qtd--neg]="l.quantidade < 0">{{ num(l.quantidade) }} {{ l.unidade ?? '' }}</span></li>
        }
      </ul>
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .panorama { display: grid; gap: var(--geo-e1); margin: var(--geo-e3) var(--geo-margem) 0; }
    .panorama p { margin: 0; color: var(--geo-texto-2); font: var(--geo-t-corpo); }
    .panorama strong { color: var(--geo-texto); font-weight: 600; }
    .panorama__alerta { display: flex; align-items: center; gap: var(--geo-e2); color: var(--geo-erro); }
    .panorama .panorama__alerta { color: var(--geo-erro); }
    .barra { display: flex; flex-wrap: wrap; align-items: center; gap: var(--geo-e3); margin: var(--geo-e4) var(--geo-margem) 0; }
    .barra geo-segmentado { flex: 0 1 18rem; }
    .busca { flex: 1 1 14rem; display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 48px; border-radius: var(--geo-r-pilula);
      background: var(--geo-superficie); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .lista-material { margin-top: var(--geo-e3); }
    .geo-linha__titulo { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .qtd { display: grid; justify-items: end; flex: none; text-align: end; }
    .qtd strong { font: 600 1.0625rem/1.2 var(--geo-fonte); }
    .qtd small { color: var(--geo-texto-2); font: var(--geo-t-apoio); }
    .qtd__neg { color: var(--geo-erro); font: var(--geo-t-apoio); }
    .grupo { display: grid; gap: 2px; margin: var(--geo-e4) 0 var(--geo-e2); font: 600 .9375rem/1.3 var(--geo-fonte); }
    .grupo:first-child { margin-top: 0; }
    .grupo small { color: var(--geo-texto-2); font: var(--geo-t-apoio); }
    .grupo--neg { color: var(--geo-erro); }
    .itens { display: grid; margin: 0; padding: 0; list-style: none; border-radius: var(--geo-r-grupo); background: var(--geo-superficie); }
    .itens li { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4); }
    .itens li + li { border-top: 1px solid var(--geo-linha); }
    .itens__desc { display: grid; gap: 2px; min-width: 0; }
    .itens__desc small { color: var(--geo-texto-2); font: var(--geo-t-apoio); }
    .itens__qtd { flex: none; font-weight: 600; }
    .itens__qtd--neg { color: var(--geo-erro); }
    .vazio-folha { margin: 0; color: var(--geo-texto-2); }
    /* O corpo da folha não tem recuo: o conteúdo alinha com o título dela. */
    .grupo, .itens, .vazio-folha { margin-inline: var(--geo-margem); }
    .itens:last-child { margin-bottom: var(--geo-e4); }
    .rodape { display: grid; grid-template-columns: 1fr 1fr; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-margem) var(--geo-e4); }
  `],
})
export class EstoqueEquipesAlmoxComponent {
  private readonly service = inject(BalcaoService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly rede = inject(ConnectivityService);
  protected readonly abas = abasAlmox();

  protected readonly equipes = signal<EquipeNoBalcao[]>([]);
  protected readonly itens = signal<ItemNasEquipes[]>([]);
  protected readonly carregado = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly visao = signal<Visao>('equipes');
  protected readonly atalho = signal<AtalhoEquipes>('todas');
  protected readonly busca = signal('');
  protected readonly aberta = signal<EquipeNoBalcao | null>(null);
  protected readonly materialAberto = signal<MaterialNasEquipes | null>(null);

  protected readonly visoes: OpcaoSegmento<Visao>[] = [
    { valor: 'equipes', rotulo: 'Por equipe' },
    { valor: 'materiais', rotulo: 'Por material' },
  ];
  protected readonly atalhos: OpcaoChip[] = [
    { valor: 'todas', rotulo: 'Todas' },
    { valor: 'negativo', rotulo: 'Com negativo' },
    { valor: 'sucata', rotulo: 'Com sucata' },
    { valor: 'retirada', rotulo: 'Retirada aberta' },
  ];

  protected readonly contagem = computed(() => {
    const eq = this.equipes();
    return {
      negativo: eq.filter(e => atendeAtalho(e, 'negativo')).length,
      sucata: eq.filter(e => atendeAtalho(e, 'sucata')).length,
      retirada: eq.filter(e => atendeAtalho(e, 'retirada')).length,
    };
  });
  protected readonly panorama = computed(() => ({
    comMaterial: this.equipes().filter(e => e.itensNoCaminhao > 0).length,
    negativos: this.contagem().negativo,
  }));
  protected readonly linhasEquipe = computed(() => {
    const q = normalizar(this.busca().trim());
    return this.equipes()
      .filter(e => atendeAtalho(e, this.atalho()))
      .filter(e => !q || normalizar(`${e.codigo} ${e.encarregado ?? ''} ${e.base ?? ''}`).includes(q))
      .sort((a, b) => b.negativosNoCaminhao - a.negativosNoCaminhao || b.itensNoCaminhao - a.itensNoCaminhao || a.codigo.localeCompare(b.codigo));
  });
  private readonly materiais = computed(() => porMaterial(this.itens()));
  protected readonly linhasMaterial = computed(() => {
    const q = normalizar(this.busca().trim());
    return q ? this.materiais().filter(m => normalizar(`${m.descricao} ${m.codigo}`).includes(q)) : this.materiais();
  });
  protected readonly obrasAbertas = computed(() => {
    const e = this.aberta();
    return e ? obrasDaEquipe(this.itens(), e.idEquipe) : [];
  });

  constructor() {
    this.carregar();
  }

  protected carregar(): void {
    this.erro.set(null);
    forkJoin({ equipes: this.service.estoqueEquipes(), itens: this.service.itensDasEquipes() }).subscribe({
      next: ({ equipes, itens }) => {
        this.equipes.set(equipes);
        this.itens.set(itens);
        this.carregado.set(true);
      },
      error: (e: ApiError) => this.erro.set(e?.detail || 'Tente de novo em instantes.'),
    });
  }

  protected caminhao(e: EquipeNoBalcao): string {
    return textoCaminhao(e);
  }

  protected num(n: number): string {
    return numeroBr(n);
  }

  protected balcao(e: EquipeNoBalcao, modo: 'retirada' | 'devolucao'): void {
    this.aberta.set(null);
    void this.router.navigate(['/almox/balcao', e.idEquipe, modo]);
  }
}
