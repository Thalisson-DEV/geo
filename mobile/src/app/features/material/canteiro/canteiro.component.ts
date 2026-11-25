import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { TokenService } from '../../../core/auth/token.service';
import { DbService } from '../../../core/db/db.service';
import { CanteiroLocal, SaldoObraLocal } from '../../../core/db/models';
import { OutboxService } from '../../../core/sync/outbox.service';
import { SyncService } from '../../../core/sync/sync.service';
import { ToastService } from '../../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, OpcaoSegmento, QuantidadeComponent, SegmentadoComponent, VazioComponent, numeroBr } from '../../../ui';

type Sentido = 'DEIXAR' | 'PEGAR';

const SENTIDOS: OpcaoSegmento<Sentido>[] = [
  { valor: 'DEIXAR', rotulo: 'Deixar no canteiro', icone: 'saida' },
  { valor: 'PEGAR', rotulo: 'Pegar do canteiro', icone: 'entrada' },
];

/**
 * Canteiro: a equipe deixa material perto da obra ou pega de volta. Cada material continua da mesma obra, então a
 * ficha da obra sabe onde ele está. Funciona sem sinal: vai pela fila e o saldo do aparelho muda na hora.
 */
@Component({
  selector: 'app-canteiro',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, QuantidadeComponent, SegmentadoComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Canteiro" [subtitulo]="canteiro()?.nome ?? 'Deixar ou pegar material'" (voltar)="voltar()" />

    @if (!canteiro()) {
      <h2 class="geo-secao">Qual canteiro?</h2>
      @if (canteiros().length) {
        <ul class="geo-grupo">
          @for (c of canteiros(); track c.id) {
            <li><button type="button" class="geo-linha geo-linha--acao" (click)="escolher(c)">
              <span class="geo-selo"><geo-icone nome="almox" /></span>
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ c.nome }}</span>
                <span class="geo-linha__apoio">{{ c.referencia || c.nomeBase || 'Sem referência' }}</span></span>
              <geo-icone nome="avancar" [tamanho]="18" /></button></li>
          }
        </ul>
      } @else {
        <geo-vazio icone="almox" titulo="Nenhum canteiro cadastrado" texto="O administrativo cadastra os canteiros no web. Depois de sincronizar, eles aparecem aqui." />
      }
    } @else {
      <div class="topo">
        <geo-segmentado rotulo="O que fazer" [opcoes]="sentidos" [valor]="sentido()" (valorChange)="trocarSentido($event)" />
        <p class="dica">{{ sentido() === 'DEIXAR' ? 'Do caminhão para o canteiro.' : 'Do canteiro para o caminhão.' }} O material continua da mesma obra.</p>
      </div>

      @if (disponiveis().length) {
        @for (grupo of grupos(); track grupo.chave) {
          <h2 class="geo-secao">{{ grupo.titulo }}</h2>
          <ul class="geo-grupo">
            @for (s of grupo.itens; track s.chave) {
              <li class="item" [class.item--marcado]="(qtd()[s.chave] ?? 0) > 0">
                <div class="geo-linha">
                  <span class="geo-linha__texto">
                    <span class="geo-linha__titulo">{{ s.descricao }}</span>
                    <span class="geo-linha__apoio geo-num">Cód. {{ s.codigo }} · {{ s.condicao === 'NOVO' ? 'Novo' : 'Sucata' }} · tem {{ num(s.quantidade) }} {{ s.unidadeMedida }}</span>
                  </span>
                  @if ((qtd()[s.chave] ?? 0) > 0) {
                    <geo-quantidade [valor]="qtd()[s.chave]!" (valorChange)="definir(s, $event)" [minimo]="0" [rotulo]="'Quantidade de ' + s.descricao" [unidade]="s.unidadeMedida ?? null" />
                  } @else {
                    <button type="button" class="geo-btn geo-btn--neutro incluir" (click)="definir(s, s.quantidade)">Incluir</button>
                  }
                </div>
              </li>
            }
          </ul>
        }
        @if (comSerie()) {
          <p class="dica dica--pe">{{ comSerie() }} {{ comSerie() === 1 ? 'material com número de série fica' : 'materiais com número de série ficam' }} fora daqui: use a transferência, que pede a série.</p>
        }
        <div class="geo-respiro"></div>
        <footer class="geo-rodape-acoes" data-acao-fixa>
          <button type="button" class="geo-btn geo-btn--neutro" (click)="canteiro.set(null)">Outro canteiro</button>
          <button type="button" class="geo-btn geo-btn--principal" [disabled]="!selecionados().length || enviando()" (click)="confirmar()">
            {{ sentido() === 'DEIXAR' ? 'Deixar' : 'Pegar' }}{{ selecionados().length ? ' ' + selecionados().length + (selecionados().length === 1 ? ' material' : ' materiais') : '' }}
          </button>
        </footer>
      } @else {
        <geo-vazio icone="estoque" [titulo]="sentido() === 'DEIXAR' ? 'Caminhão sem material' : 'Canteiro vazio'"
          [texto]="sentido() === 'DEIXAR' ? 'Não há material no caminhão para deixar.' : 'Não há material neste canteiro. Sincronize se alguém deixou agora.'" />
      }
    }
  `,
  styles: [`
    :host { display: block; min-height: 100%; }
    .topo { display: grid; gap: var(--geo-e2); margin: var(--geo-e2) var(--geo-margem) 0; }
    .dica { margin: 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .dica--pe { margin: var(--geo-e3) var(--geo-margem) 0; }
    .item--marcado .geo-linha { background: var(--geo-destaque-suave); }
    .incluir { min-height: 48px; padding: 0 var(--geo-e4); }
  `],
})
export class CanteiroComponent {
  private readonly db = inject(DbService);
  private readonly tokens = inject(TokenService);
  private readonly outbox = inject(OutboxService);
  private readonly sync = inject(SyncService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly sentidos = SENTIDOS;
  readonly canteiro = signal<CanteiroLocal | null>(null);
  readonly sentido = signal<Sentido>('DEIXAR');
  readonly qtd = signal<Record<string, number>>({});
  readonly enviando = signal(false);

  readonly canteiros = toSignal(from(liveQuery(() => this.db.getCanteiros())), { initialValue: [] as CanteiroLocal[] });

  private readonly caminhao = toSignal(from(liveQuery(() => {
    const id = this.tokens.estoqueId();
    return id ? this.db.getSaldosObra(id) : Promise.resolve([]);
  })), { initialValue: [] as SaldoObraLocal[] });

  private readonly noCanteiro = signal<SaldoObraLocal[]>([]);

  /** Materiais com série: andam pela transferência, que registra a série; o canteiro controla quantidade. */
  private readonly seriados = toSignal(from(liveQuery(async () =>
    new Set((await this.db.getMateriais()).filter(m => m.detalhaSerie).map(m => m.id)))), { initialValue: new Set<string>() });

  private readonly comSaldo = computed(() =>
    (this.sentido() === 'DEIXAR' ? this.caminhao() : this.noCanteiro()).filter(s => s.quantidade > 0));

  readonly disponiveis = computed(() => this.comSaldo().filter(s => !this.seriados().has(s.idMaterial)));
  readonly comSerie = computed(() => this.comSaldo().length - this.disponiveis().length);

  /** Agrupado por obra: a equipe pensa "o material da obra tal". O livre vai por último. */
  readonly grupos = computed(() => {
    const mapa = new Map<string, { chave: string; titulo: string; itens: SaldoObraLocal[] }>();
    for (const s of this.disponiveis()) {
      const chave = s.idObra ?? 'livre';
      const grupo = mapa.get(chave) ?? { chave, titulo: s.idObra ? (s.numeroObra ? 'Obra ' + s.numeroObra : 'Obra sem número') : 'Livre (sem obra)', itens: [] };
      grupo.itens.push(s);
      mapa.set(chave, grupo);
    }
    return [...mapa.values()].sort((a, b) => (a.chave === 'livre' ? 1 : 0) - (b.chave === 'livre' ? 1 : 0) || a.titulo.localeCompare(b.titulo));
  });

  readonly selecionados = computed(() => this.disponiveis().filter(s => (this.qtd()[s.chave] ?? 0) > 0));

  num(n: number): string {
    return numeroBr(n);
  }

  async escolher(c: CanteiroLocal): Promise<void> {
    this.canteiro.set(c);
    this.qtd.set({});
    this.noCanteiro.set(await this.db.getSaldosObra(c.id));
  }

  trocarSentido(s: Sentido): void {
    this.sentido.set(s);
    this.qtd.set({});
  }

  definir(s: SaldoObraLocal, valor: number): void {
    // Sem travar: a equipe pode estar com o saldo do aparelho desatualizado; o servidor registra o que for informado.
    this.qtd.update(atual => ({ ...atual, [s.chave]: Math.max(0, valor) }));
  }

  async confirmar(): Promise<void> {
    const canteiro = this.canteiro();
    const idEquipe = this.tokens.equipeId();
    const idCaminhao = this.tokens.estoqueId();
    if (!canteiro || !idEquipe || !idCaminhao || !this.selecionados().length) return;
    this.enviando.set(true);
    const deixar = this.sentido() === 'DEIXAR';
    const itens = this.selecionados().map(s => ({
      idMaterial: s.idMaterial, condicao: s.condicao, idObra: s.idObra, quantidade: this.qtd()[s.chave],
      codigo: s.codigo, descricao: s.descricao, unidadeMedida: s.unidadeMedida, numeroObra: s.numeroObra,
    }));
    try {
      await this.outbox.enqueue({
        endpoint: `/v1/estoque-obra/canteiros/${canteiro.id}/movimentos`,
        method: 'POST',
        payload: {
          idLocal: crypto.randomUUID(),
          idEquipe,
          sentido: this.sentido(),
          itens: itens.map(({ idMaterial, condicao, idObra, quantidade }) => ({ idMaterial, condicao, idObra, quantidade })),
        },
        operationType: 'CANTEIRO',
      });
      await this.db.moverSaldoObra(deixar ? idCaminhao : canteiro.id, deixar ? canteiro.id : idCaminhao, itens);
      this.toast.success(`${itens.length} ${itens.length === 1 ? 'material' : 'materiais'} ${deixar ? 'deixado' : 'pego'}${itens.length === 1 ? '' : 's'} no ${canteiro.nome}.`);
      void this.sync.syncOutbox().catch(() => {});
      void this.router.navigateByUrl('/material/saldo');
    } catch {
      this.toast.error('Não foi possível registrar no aparelho. Tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }

  voltar(): void {
    if (this.canteiro()) {
      this.canteiro.set(null);
      return;
    }
    void this.router.navigateByUrl('/material');
  }
}
