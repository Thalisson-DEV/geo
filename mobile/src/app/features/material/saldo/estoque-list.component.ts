import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { DbService } from '../../../core/db/db.service';
import { TokenService } from '../../../core/auth/token.service';
import { SyncService } from '../../../core/sync/sync.service';
import { SessaoService } from '../../../core/sessao/sessao.service';
import { SaldoObraLocal, SaldoSerieLocal } from '../../../core/db/models';
import { DIAS_PARADO, diasDesde, haDias, rotuloMaterialParado, rotuloSerieNoSaldo, tomTempoSaldo } from '../../../core/saldo/tempo-saldo';
import { BarraTopoComponent, ChipsComponent, FolhaComponent, IconeComponent, OpcaoChip, VazioComponent, dataCurta, hora, numeroBr } from '../../../ui';

interface SaldoLinha {
  id: string;
  idMaterial: string;
  quantidade: number;
  condicao: 'NOVO' | 'SUCATA';
  codigo: string;
  descricao: string;
  unidadeMedida: string;
  detalhaSerie: boolean;
  ultimaMovimentacao?: string | null;
  serieMaisAntiga?: string | null;
}

interface Linha extends SaldoLinha {
  /** Dias parado: material com série usa a série há mais tempo no caminhão. */
  dias: number | null;
}

type Filtro = 'todos' | 'NOVO' | 'SUCATA';
const FILTROS: OpcaoChip<Filtro>[] = [
  { valor: 'todos', rotulo: 'Tudo' },
  { valor: 'NOVO', rotulo: 'Novo' },
  { valor: 'SUCATA', rotulo: 'Sucata' },
];

interface EstadoTela { filtro?: Filtro; busca?: string; series?: string | null; soParados?: boolean }

/** Saldo do caminhão: o que a equipe tem agora, com quantidade em destaque e séries em folha. */
@Component({
  selector: 'app-estoque-list',
  standalone: true,
  imports: [BarraTopoComponent, ChipsComponent, FolhaComponent, IconeComponent, NgTemplateOutlet, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Saldo do caminhão" [subtitulo]="subtitulo()" (voltar)="goBack()" />

    <div class="busca">
      <geo-icone nome="busca" [tamanho]="18" />
      <input type="search" placeholder="Nome ou código" enterkeyhint="search" aria-label="Buscar no saldo"
        [value]="busca()" (input)="definirBusca($any($event.target).value)">
    </div>
    <geo-chips rotulo="Condição" [opcoes]="filtros" [contagem]="contagem()" [valor]="filtro()" (valorChange)="definirFiltro($any($event))" />

    @if (parados() || soParados()) {
      <button type="button" class="parados" [attr.aria-pressed]="soParados()" (click)="alternarParados()">
        <geo-icone nome="relogio" [tamanho]="20" />
        <span class="parados__texto">
          @if (soParados()) {
            <strong>Mostrando só os parados</strong><span>Toque para ver todo o saldo</span>
          } @else {
            <strong>{{ parados() }} {{ parados() === 1 ? 'material parado' : 'materiais parados' }} há {{ diasParado }} dias ou mais</strong>
            <span>Aplique ou devolva ao almoxarifado. Toque para ver.</span>
          }
        </span>
        <geo-icone [nome]="soParados() ? 'fechar' : 'avancar'" [tamanho]="18" />
      </button>
    }

    @if (materiais() === undefined) {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        @for (i of [1, 2, 3, 4]; track i) { <div class="geo-esqueleto" style="height: 64px"></div> }
      </div>
    } @else if (filtrados().length) {
      <ul class="geo-grupo lista" aria-label="Materiais no caminhão">
        @for (m of filtrados(); track m.id) {
          <li class="geo-linha-lista">
            @if (m.detalhaSerie) {
              <button type="button" class="geo-linha geo-linha--acao" (click)="abrirSeries(m)" [attr.aria-label]="m.descricao + ', ' + num(m.quantidade) + ' ' + m.unidadeMedida + ', ver séries'">
                <ng-container *ngTemplateOutlet="conteudo; context: { $implicit: m }" />
                <geo-icone nome="avancar" [tamanho]="18" />
              </button>
            } @else {
              <div class="geo-linha"><ng-container *ngTemplateOutlet="conteudo; context: { $implicit: m }" /></div>
            }
          </li>
        }
      </ul>
      <div class="geo-respiro"></div>
    } @else {
      <geo-vazio icone="estoque" [titulo]="busca() || filtro() !== 'todos' || soParados() ? 'Nada encontrado' : 'Caminhão sem saldo'"
        [texto]="busca() || filtro() !== 'todos' || soParados() ? 'Confira o nome, o código ou o filtro.' : 'Quando o almoxarifado entregar material, ele aparece aqui.'" />
    }

    <ng-template #conteudo let-m>
      <span class="geo-linha__texto">
        <span class="geo-linha__titulo">{{ m.descricao }}</span>
        <span class="geo-linha__apoio geo-num"><span class="geo-cond" [class.geo-cond--sucata]="m.condicao !== 'NOVO'">{{ m.condicao === 'NOVO' ? 'Novo' : 'Sucata' }}</span> · Cód. {{ m.codigo }}</span>
        @if (m.dias != null) {
          <span class="tempo" [attr.data-tom]="tom(m.dias)"><geo-icone nome="relogio" [tamanho]="14" />{{ rotuloTempo(m) }}</span>
        }
        @if (obrasDe(m); as obras) {
          @if (obras.length) {
            <span class="obras"><span class="geo-sr-only">De qual obra é:</span>
              @for (o of obras; track o.chave) {
                <span class="obra" [class.obra--livre]="!o.idObra">{{ o.idObra ? (o.numeroObra ? 'Obra ' + o.numeroObra : 'Obra sem número') : 'Livre' }} · {{ num(o.quantidade) }}</span>
              }
            </span>
          }
        }
      </span>
      <span class="geo-qtd">{{ num(m.quantidade) }}<small>{{ m.unidadeMedida }}</small></span>
    </ng-template>

    <geo-folha [aberta]="!!seriesDe()" (fechar)="fecharSeries()" [titulo]="seriesDe()?.descricao ?? ''"
      [descricao]="descricaoSeries()">
      @if (carregandoSeries()) {
        <div class="geo-esqueletos"><div class="geo-esqueleto" style="height: 48px"></div><div class="geo-esqueleto" style="height: 48px"></div></div>
      } @else {
        <ul class="geo-grupo series" aria-label="Séries">
          @for (s of seriais(); track s.id) {
            <li><div class="geo-linha"><span class="geo-linha__texto"><span class="geo-linha__titulo geo-num">{{ s.numSerie }}</span>
              <span class="tempo" [attr.data-tom]="tom(dias(s.noSaldoDesde))"><geo-icone nome="relogio" [tamanho]="14" />{{ rotuloSerie(s.noSaldoDesde) }}</span></span></div></li>
          } @empty { <li><div class="geo-linha"><span class="geo-linha__apoio">Nenhuma série registrada</span></div></li> }
        </ul>
      }
    </geo-folha>
  `,
  styles: [`
    :host { display: block; min-height: 100%; }
    .busca { margin: var(--geo-e1) var(--geo-margem) 0; display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 48px;
      border-radius: var(--geo-r-pilula); background: var(--geo-superficie); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .lista { margin-top: var(--geo-e2); }
    .series { background: var(--geo-fundo); }
    .tempo { display: inline-flex; align-items: center; gap: 4px; margin-top: 2px; font: 600 .8125rem/1.3 var(--geo-fonte); color: var(--geo-texto-2); }
    .tempo[data-tom='atencao'] { color: var(--geo-atencao); }
    .tempo[data-tom='erro'] { color: var(--geo-erro); }
    .parados { display: flex; align-items: center; gap: var(--geo-e3); width: calc(100% - 2 * var(--geo-e3)); min-height: 56px; margin: var(--geo-e2) var(--geo-margem) 0;
      padding: var(--geo-e2) var(--geo-e4); border: 0; border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); color: var(--geo-atencao);
      text-align: left; cursor: pointer; transition: transform var(--geo-m-entrar); }
    .parados:active { transform: scale(.98); }
    .parados[aria-pressed='true'] { background: var(--geo-superficie); color: var(--geo-texto-2); }
    .parados__texto { flex: 1; min-width: 0; display: grid; gap: 2px; }
    .parados__texto strong { font: 600 .9375rem/1.3 var(--geo-fonte); color: var(--geo-texto); }
    .parados__texto span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .obras { display: flex; flex-wrap: wrap; gap: var(--geo-e1); margin-top: var(--geo-e1); }
    .obra { padding: 0 var(--geo-e2); border-radius: var(--geo-r-pilula); background: var(--geo-destaque-suave); color: var(--geo-destaque-texto);
      font: var(--geo-t-apoio); font-weight: 600; }
    .obra--livre { background: var(--geo-superficie-2); color: var(--geo-texto-2); }
  `],
})
export class EstoqueListComponent {
  private readonly dbService = inject(DbService);
  private readonly tokenService = inject(TokenService);
  private readonly syncService = inject(SyncService);
  private readonly sessao = inject(SessaoService);
  private readonly router = inject(Router);

  // Consulta reativa ao IndexedDB: a cada alteração no banco, a lista atualiza sozinha.
  private readonly saldos = toSignal(from(liveQuery(() => {
    const idEstoque = this.tokenService.estoqueId();
    return idEstoque ? this.dbService.getSaldosComMateriais(idEstoque) : Promise.resolve([]);
  })), { initialValue: undefined }) as () => SaldoLinha[] | undefined;

  /** De qual obra é cada material do caminhão (vem da sincronização; muda na hora ao deixar/pegar no canteiro). */
  private readonly saldosObra = toSignal(from(liveQuery(() => {
    const idEstoque = this.tokenService.estoqueId();
    return idEstoque ? this.dbService.getSaldosObra(idEstoque) : Promise.resolve([]);
  })), { initialValue: [] as SaldoObraLocal[] });

  private readonly obrasPorMaterial = computed(() => {
    const mapa = new Map<string, SaldoObraLocal[]>();
    for (const s of this.saldosObra()) {
      if (s.quantidade <= 0) continue;
      const chave = `${s.idMaterial}|${s.condicao}`;
      mapa.set(chave, [...(mapa.get(chave) ?? []), s]);
    }
    // A obra primeiro, o livre por último.
    mapa.forEach(lista => lista.sort((a, b) => (a.idObra ? 0 : 1) - (b.idObra ? 0 : 1) || b.quantidade - a.quantidade));
    return mapa;
  });

  obrasDe(m: SaldoLinha): SaldoObraLocal[] {
    return this.obrasPorMaterial().get(`${m.idMaterial}|${m.condicao}`) ?? [];
  }

  readonly materiais = computed<Linha[] | undefined>(() => this.saldos()?.map(m => ({
    ...m,
    dias: diasDesde(m.detalhaSerie && m.serieMaisAntiga ? m.serieMaisAntiga : m.ultimaMovimentacao),
  })));
  readonly diasParado = DIAS_PARADO;

  readonly filtros = FILTROS;
  private readonly estadoTela = this.sessao.estadoTela<EstadoTela>();
  readonly filtro = signal<Filtro>(this.estadoTela.filtro ?? 'todos');
  readonly busca = signal(this.estadoTela.busca ?? '');
  readonly soParados = signal(this.estadoTela.soParados ?? false);
  readonly seriesDe = signal<Linha | null>(null);
  readonly seriais = signal<SaldoSerieLocal[]>([]);
  readonly carregandoSeries = signal(false);
  private seriesPendente = this.estadoTela.series ?? null;

  readonly filtrados = computed(() => {
    const q = this.busca().toLowerCase().trim();
    const f = this.filtro();
    const lista = this.materiais() ?? [];
    this.restaurarSeries(lista);
    const parados = this.soParados();
    const filtrada = lista.filter(m => (f === 'todos' || m.condicao === f) && (!q || m.descricao.toLowerCase().includes(q) || m.codigo.toLowerCase().includes(q))
      && (!parados || (m.dias ?? 0) >= DIAS_PARADO));
    // Só os parados: o mais antigo primeiro, que é o que precisa de atenção.
    return parados ? filtrada.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)) : filtrada;
  });

  readonly parados = computed(() => (this.materiais() ?? []).filter(m => (m.dias ?? 0) >= DIAS_PARADO).length);

  readonly descricaoSeries = computed(() => {
    if (!this.seriesDe()) return null;
    const n = this.seriais().length;
    const total = `${n} ${n === 1 ? 'série' : 'séries'} no caminhão`;
    const dias = diasDesde(this.seriais()[0]?.noSaldoDesde);
    return dias ? `${total} · a mais antiga chegou ${haDias(dias)}` : total;
  });

  readonly contagem = computed(() => {
    const c: Partial<Record<string, number>> = {};
    for (const m of this.materiais() ?? []) c[m.condicao] = (c[m.condicao] ?? 0) + 1;
    return c;
  });

  readonly subtitulo = computed(() => {
    const n = this.materiais()?.length ?? 0;
    const em = this.syncService.lastSyncAt();
    const atualizado = em ? ` · atualizado ${dataCurta(em)} ${hora(em)}` : '';
    return `${n} ${n === 1 ? 'material' : 'materiais'}${atualizado}`;
  });

  num(n: number): string {
    return numeroBr(n);
  }

  definirFiltro(f: Filtro): void {
    this.filtro.set(f);
    this.sessao.definirEstadoTela({ filtro: f });
  }

  alternarParados(): void {
    this.soParados.update(v => !v);
    this.sessao.definirEstadoTela({ soParados: this.soParados() });
  }

  dias(iso: string | null | undefined): number | null {
    return diasDesde(iso);
  }

  tom(dias: number | null): string {
    return tomTempoSaldo(dias);
  }

  rotuloTempo(m: Linha): string {
    if (m.detalhaSerie && m.serieMaisAntiga) return m.dias === 0 ? 'Chegou hoje' : `A mais antiga está com você ${haDias(m.dias ?? 0)}`;
    return rotuloMaterialParado(m.dias);
  }

  rotuloSerie(iso: string | null | undefined): string {
    return rotuloSerieNoSaldo(diasDesde(iso));
  }

  definirBusca(q: string): void {
    this.busca.set(q);
    this.sessao.definirEstadoTela({ busca: q });
  }

  async abrirSeries(m: Linha): Promise<void> {
    this.seriesDe.set(m);
    this.sessao.definirEstadoTela({ series: m.id });
    this.carregandoSeries.set(true);
    this.seriais.set([]);
    try {
      const idEstoque = this.tokenService.estoqueId();
      if (idEstoque) this.seriais.set(await this.dbService.getSeriaisPorMaterial(idEstoque, m.idMaterial, m.condicao));
    } catch (error) {
      console.error('Erro ao buscar séries:', error);
    } finally {
      this.carregandoSeries.set(false);
    }
  }

  fecharSeries(): void {
    this.seriesDe.set(null);
    this.sessao.definirEstadoTela({ series: null });
  }

  goBack(): void {
    const anterior = this.sessao.rotaAnterior();
    void this.router.navigateByUrl(anterior && !anterior.startsWith('/material/saldo') ? anterior : '/material');
  }

  /** Folha de séries aberta antes do app fechar: reabre quando o saldo chega. */
  private restaurarSeries(lista: Linha[]): void {
    if (!this.seriesPendente || !lista.length) return;
    const alvo = lista.find(m => m.id === this.seriesPendente);
    this.seriesPendente = null;
    if (alvo) queueMicrotask(() => void this.abrirSeries(alvo));
  }
}
