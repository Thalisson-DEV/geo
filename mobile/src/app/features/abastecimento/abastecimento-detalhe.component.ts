import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { liveQuery } from 'dexie';
import {
  AbastecimentoLocal,
  FotoAbastecimentoLocal,
  formatarMoeda,
  formatarQuantidade,
  quantidadeAutorizada,
  podeCancelar,
  podeRegistrarRealizado,
  situacaoParaEquipe
} from '../../core/frota/abastecimento.models';
import { AbastecimentoService } from '../../core/frota/abastecimento.service';
import { formatarPlaca } from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { SyncService } from '../../core/sync/sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, FolhaComponent, IconeComponent, VazioComponent } from '../../ui';

interface Etapa {
  rotulo: string;
  estado: 'feito' | 'atual' | 'futuro' | 'parou';
  apoio: string | null;
}

interface FotoTela {
  id: string;
  rotulo: string;
  /** Endereço local para mostrar (arquivo do aparelho ou baixado do servidor). */
  url: string | null;
  situacao: 'pronta' | 'carregando' | 'no-aparelho' | 'falhou';
}

interface ItemTela {
  id: string;
  nome: string;
  trocadoDe: string | null;
  pedido: string;
  entregue: string | null;
  valor: string | null;
  porUnidade: string | null;
  tanqueCheio: boolean;
}

/**
 * Detalhe do pedido de abastecimento: a situação em palavras simples, o andamento (pedido,
 * aprovação, liberação, abastecimento), veículo e posto, os itens pedidos e entregues e as fotos.
 * Daqui a equipe registra o abastecimento (liberado) ou cancela (antes da liberação).
 */
@Component({
  selector: 'app-abastecimento-detalhe',
  standalone: true,
  imports: [BarraTopoComponent, FolhaComponent, IconeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Abastecimento" [subtitulo]="subtitulo()" (voltar)="voltar()" />

    @if (!carregado()) {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        <div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 160px"></div><div class="geo-esqueleto" style="height: 140px"></div>
      </div>
    } @else if (pedido(); as a) {
      @let s = situacao();
      <section class="geo-faixa-estado" [class.geo-faixa-estado--atencao]="s.tom === 'atencao'" [class.geo-faixa-estado--erro]="s.tom === 'erro'" aria-live="polite">
        <span class="geo-etiqueta" [class]="'geo-etiqueta geo-etiqueta--' + tomEtiqueta()">{{ s.rotulo }}</span>
        <p>{{ s.apoio }}</p>
      </section>
      @if (a.aviso) {
        <p class="aviso"><geo-icone nome="info" [tamanho]="16" />{{ a.aviso }}</p>
      }

      <h2 class="geo-secao">Andamento</h2>
      <ol class="andamento" aria-label="Andamento do pedido">
        @for (e of etapas(); track e.rotulo) {
          <li [attr.data-estado]="e.estado" [attr.aria-current]="e.estado === 'atual' ? 'step' : null">
            <span class="andamento__marca" aria-hidden="true">
              @switch (e.estado) {
                @case ('feito') { <geo-icone nome="check" [tamanho]="14" /> }
                @case ('parou') { <geo-icone nome="fechar" [tamanho]="14" /> }
                @case ('atual') { <i></i> }
              }
            </span>
            <span class="andamento__texto">
              <strong>{{ e.rotulo }}</strong>
              @if (e.apoio) { <span>{{ e.apoio }}</span> }
            </span>
          </li>
        }
      </ol>

      <dl class="geo-dados">
        <div><dt>Veículo</dt><dd class="geo-num">{{ placa(a.placa) }}</dd></div>
        <div><dt>Condutor</dt><dd>{{ a.servidor?.condutor ?? a.condutorNome ?? '—' }}</dd></div>
        <div><dt>Posto</dt><dd>{{ a.servidor?.posto ?? a.postoNome ?? '—' }}</dd></div>
        @if (a.servidor?.destino ?? a.destino; as destino) { <div><dt>Destino</dt><dd>{{ destino }}</dd></div> }
        <div><dt>Medição no pedido</dt><dd class="geo-num">{{ medicao(a.servidor?.medicaoSolicitacao ?? a.medicao) }}</dd></div>
        @if (a.realizado?.medicao != null) { <div><dt>Medição depois</dt><dd class="geo-num">{{ medicao(a.realizado!.medicao) }}</dd></div> }
        @if (a.observacao.trim()) { <div><dt>Observação</dt><dd>{{ a.observacao }}</dd></div> }
      </dl>

      <h2 class="geo-secao geo-secao--marcada"><span class="geo-marca geo-marca--aplicado" aria-hidden="true"><geo-icone nome="combustivel" [tamanho]="14" /></span>
        <span>{{ entregue() ? 'Pedido e entregue' : 'Pedido' }}</span><span class="geo-contagem">{{ itens().length }}</span></h2>
      <ul class="geo-grupo" aria-label="Itens do pedido">
        @for (i of itens(); track i.id) {
          <li><div class="geo-linha item">
            <span class="geo-linha__texto">
              <span class="geo-linha__titulo">{{ i.nome }}</span>
              @if (i.trocadoDe) { <span class="trocado">Trocado no posto: pedido {{ i.trocadoDe }}</span> }
              @if (i.entregue) {
                <span class="geo-linha__apoio">Autorizado: {{ i.pedido }}{{ i.tanqueCheio ? ' · encheu o tanque' : '' }}</span>
              }
              @if (i.porUnidade) { <span class="geo-linha__apoio geo-num">{{ i.porUnidade }}</span> }
            </span>
            <span class="item__valores">
              <span class="geo-qtd">{{ i.entregue ?? i.pedido }}</span>
              @if (i.valor) { <span class="item__valor geo-num">{{ i.valor }}</span> }
            </span>
          </div></li>
        }
        @if (total(); as t) {
          <li><div class="geo-linha total"><span class="geo-linha__titulo">Total pago</span><span class="geo-qtd">{{ t }}</span></div></li>
        }
      </ul>

      @if (fotos().length) {
        <h2 class="geo-secao"><span>Fotos</span><span class="geo-num">{{ fotos().length }}</span></h2>
        <ul class="fotos" aria-label="Fotos do pedido">
          @for (f of fotos(); track f.id) {
            <li>
              @if (f.url) {
                <button type="button" class="foto foto--pronta" (click)="ampliar.set(f)" [attr.aria-label]="'Ampliar a foto: ' + f.rotulo">
                  <img [src]="f.url" [alt]="f.rotulo">
                  <span class="foto__lupa" aria-hidden="true"><geo-icone nome="busca" [tamanho]="14" /></span>
                </button>
              } @else {
                <span class="foto" [class.foto--falhou]="f.situacao === 'falhou'">
                  @switch (f.situacao) {
                    @case ('carregando') { <span class="geo-esqueleto foto__esqueleto"></span> }
                    @case ('no-aparelho') { <geo-icone nome="nuvem" [tamanho]="22" /><span>Ainda não enviada</span> }
                    @default { <geo-icone nome="alerta" [tamanho]="22" /><span>Sem sinal para abrir</span> }
                  }
                </span>
              }
              <span class="foto__rotulo">{{ f.rotulo }}</span>
            </li>
          }
        </ul>
      }
      <div class="geo-respiro"></div>

      @if (acoes().registrar || acoes().cancelar) {
        <footer class="geo-rodape-acoes" data-acao-fixa>
          @if (acoes().cancelar) {
            <button type="button" class="geo-btn" [class.geo-btn--neutro]="acoes().registrar" [class.geo-btn--perigo]="!acoes().registrar"
              (click)="abrirCancelamento()">Cancelar pedido</button>
          }
          @if (acoes().registrar) {
            <button type="button" class="geo-btn geo-btn--principal" (click)="registrar()"><geo-icone nome="combustivel" [tamanho]="18" />Registrar abastecimento</button>
          }
        </footer>
      }
    } @else {
      <geo-vazio icone="combustivel" titulo="Pedido não encontrado" texto="Ele não está mais neste aparelho. Atualize a lista de pedidos.">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="voltar()">Ver pedidos</button>
      </geo-vazio>
    }

    <geo-folha [aberta]="cancelando()" (fechar)="cancelando.set(false)" titulo="Cancelar o pedido?"
      [descricao]="pedido() ? 'Pedido do ' + placa(pedido()!.placa) + '. O gestor e o administrativo deixam de ver o pedido para decidir.' : null">
      <div class="motivo">
        <label class="geo-campo">
          <span class="geo-campo__rotulo">Motivo (opcional)</span>
          <textarea class="geo-input" rows="3" maxlength="500" placeholder="Ex.: o veículo foi para a oficina" [value]="motivo()"
            (input)="motivo.set($any($event.target).value)"></textarea>
        </label>
      </div>
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="cancelando.set(false)">Manter</button>
        <button type="button" class="geo-btn geo-btn--perigo" [disabled]="salvando()" (click)="cancelar()">{{ salvando() ? 'Cancelando…' : 'Cancelar pedido' }}</button>
      </div>
    </geo-folha>

    <geo-folha [aberta]="!!ampliar()" (fechar)="ampliar.set(null)" [titulo]="ampliar()?.rotulo ?? null">
      @if (ampliar()?.url; as url) { <img class="ampliada" [src]="url" [alt]="ampliar()!.rotulo"> }
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .aviso { display: flex; align-items: flex-start; gap: 6px; margin: var(--geo-e2) var(--geo-e5) 0; font: var(--geo-t-apoio); color: var(--geo-atencao); }
    .aviso geo-icone { flex: none; margin-top: 2px; }

    /* Andamento: linha vertical que liga as etapas, como uma entrega rastreada. */
    .andamento { list-style: none; margin: 0 var(--geo-margem); padding: var(--geo-e3) var(--geo-e4); background: var(--geo-superficie); border-radius: var(--geo-r-grupo); }
    .andamento li { position: relative; display: flex; gap: var(--geo-e3); padding-bottom: var(--geo-e4); }
    .andamento li:last-child { padding-bottom: 0; }
    .andamento li:not(:last-child)::before { content: ''; position: absolute; left: 11px; top: 26px; bottom: 2px; width: 2px; background: var(--geo-linha); }
    .andamento li[data-estado='feito']:not(:last-child)::before { background: var(--geo-ok); }
    .andamento__marca { width: 24px; height: 24px; border-radius: 50%; flex: none; display: grid; place-items: center;
      border: 2px solid var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-fundo); }
    [data-estado='feito'] .andamento__marca { border-color: var(--geo-ok); background: var(--geo-ok); }
    [data-estado='parou'] .andamento__marca { border-color: var(--geo-erro); background: var(--geo-erro); }
    [data-estado='atual'] .andamento__marca { border-color: var(--geo-destaque); box-shadow: 0 0 0 4px var(--geo-destaque-suave); }
    [data-estado='atual'] .andamento__marca i { width: 8px; height: 8px; border-radius: 50%; background: var(--geo-destaque); }
    .andamento__texto { display: grid; gap: 2px; padding-top: 1px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .andamento__texto strong { font: var(--geo-t-corpo-forte); color: var(--geo-texto); }
    [data-estado='futuro'] .andamento__texto strong { color: var(--geo-texto-2); font-weight: 500; }

    .item { align-items: flex-start; }
    .trocado { font: var(--geo-t-apoio); color: var(--geo-atencao); font-weight: 600; }
    .item__valores { display: grid; justify-items: end; gap: 4px; flex: none; }
    .item__valor { font: var(--geo-t-corpo-forte); }
    .total .geo-linha__titulo { flex: 1; }

    .fotos { list-style: none; margin: 0; padding: 0 var(--geo-e3); display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--geo-e3); }
    .fotos li { display: grid; gap: 6px; min-width: 0; }
    .foto { position: relative; display: grid; place-content: center; justify-items: center; gap: 4px; aspect-ratio: 4 / 3; overflow: hidden; padding: 0;
      border-radius: var(--geo-r-grupo); border: 1.5px dashed var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-texto-2);
      font: var(--geo-t-apoio); text-align: center; }
    .foto--pronta { border: 0; cursor: pointer; }
    .foto--pronta:active { transform: scale(.98); }
    .foto--falhou { color: var(--geo-atencao); }
    .foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .foto__lupa { position: absolute; right: 6px; bottom: 6px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
      background: var(--geo-veu-foto); color: var(--geo-veu-foto-texto); }
    .foto__esqueleto { position: absolute; inset: 0; border-radius: 0; }
    .foto__rotulo { font: var(--geo-t-apoio); color: var(--geo-texto); font-weight: 500; padding: 0 2px; }
    .ampliada { display: block; width: calc(100% - 2 * var(--geo-e4)); margin: 0 var(--geo-e4); max-height: 70vh; object-fit: contain; border-radius: var(--geo-r-grupo); }
    .motivo { padding: 0 var(--geo-e4); }
    .motivo textarea { min-height: 88px; padding-top: var(--geo-e3); resize: vertical; }
  `]
})
export class AbastecimentoDetalheComponent implements OnInit, OnDestroy {
  private readonly servico = inject(AbastecimentoService);
  private readonly frota = inject(ChecklistVeiculoService);
  private readonly router = inject(Router);
  private readonly rede = inject(ConnectivityService);
  private readonly sync = inject(SyncService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly pedido = signal<AbastecimentoLocal | null>(null);
  protected readonly carregado = signal(false);
  protected readonly cancelando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly motivo = signal('');
  protected readonly ampliar = signal<FotoTela | null>(null);
  /** Fotos baixadas do servidor nesta visita (id → endereço local). */
  private readonly baixadas = signal<Record<string, string | 'carregando' | 'falhou'>>({});
  private readonly locais = new Map<string, string>();

  protected readonly situacao = computed(() => situacaoParaEquipe(this.pedido()!));
  protected readonly tomEtiqueta = computed(() => {
    const tom = this.situacao().tom;
    return tom === 'neutro' ? 'neutro' : tom;
  });
  protected readonly subtitulo = computed(() => {
    const a = this.pedido();
    if (!a) return '';
    const d = new Date(a.solicitadoEm ?? a.criadoEm);
    return `${formatarPlaca(a.placa)} · ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  });
  protected readonly entregue = computed(() => this.pedido()?.servidor?.situacao === 'REALIZADA');
  protected readonly acoes = computed(() => {
    const a = this.pedido();
    return { registrar: !!a && podeRegistrarRealizado(a), cancelar: !!a && podeCancelar(a) };
  });

  /** Pedido → aprovação → liberação → abastecimento; reprovação, cancelamento e vencimento param onde estavam. */
  protected readonly etapas = computed<Etapa[]>(() => {
    const a = this.pedido();
    if (!a) return [];
    const s = a.servidor;
    const etapas: Etapa[] = [
      { rotulo: s ? 'Pedido enviado' : 'Pedido no aparelho', estado: s ? 'feito' : 'atual', apoio: quando(a.solicitadoEm ?? a.criadoEm) },
      s?.aprovadoEm && s.situacao !== 'REPROVADA'
        ? { rotulo: 'Aprovado', estado: 'feito', apoio: [s.aprovador, quando(s.aprovadoEm)].filter(Boolean).join(' · ') }
        : { rotulo: 'Aprovação do gestor', estado: 'futuro', apoio: null },
      s?.liberadoEm
        ? { rotulo: 'Liberado', estado: 'feito', apoio: [s.liberador, quando(s.liberadoEm)].filter(Boolean).join(' · ') }
        : { rotulo: 'Liberação e aviso ao posto', estado: 'futuro', apoio: null },
      s?.realizadoEm
        ? { rotulo: 'Abastecido', estado: 'feito', apoio: quando(s.realizadoEm) }
        : { rotulo: 'Abastecimento no posto', estado: 'futuro', apoio: null }
    ];
    const atual = etapas.findIndex((e) => e.estado !== 'feito');
    if (atual < 0) return etapas;
    const cancelado = s?.situacao === 'CANCELADA' || a.cancelamento?.statusSync === 'ENVIADO';
    if (s?.situacao === 'REPROVADA') etapas[atual] = { rotulo: 'Reprovado', estado: 'parou', apoio: [s.aprovador, quando(s.aprovadoEm)].filter(Boolean).join(' · ') };
    else if (cancelado) etapas[atual] = { rotulo: 'Cancelado', estado: 'parou', apoio: s?.motivoCancelamento ?? a.cancelamento?.motivo ?? null };
    else if (s?.situacao === 'VENCIDA') etapas[atual] = { rotulo: 'Venceu sem uso', estado: 'parou', apoio: 'Não foi usado até as 23h59' };
    else if (a.realizado && a.realizado.statusSync !== 'RASCUNHO' && atual === 3) etapas[atual] = { rotulo: 'Abastecido', estado: 'feito', apoio: 'Registro vai com o sinal' };
    else if (atual > 0 || s) etapas[atual] = { ...etapas[atual], estado: 'atual' };
    return etapas;
  });

  protected readonly itens = computed<ItemTela[]>(() => {
    const a = this.pedido();
    if (!a) return [];
    const s = a.servidor;
    if (!s?.itens.length) {
      return a.itens.map((i) => ({ id: i.idProduto, nome: i.nome, trocadoDe: null,
        pedido: i.quantidade != null ? formatarQuantidade(i.quantidade, i.unidade) : 'a definir pelo gestor',
        entregue: null, valor: null, porUnidade: null, tanqueCheio: false }));
    }
    return s.itens.map((i) => ({
      id: i.id,
      nome: i.produto ?? i.produtoPedido,
      trocadoDe: i.idProduto && i.idProduto !== i.idProdutoPedido ? i.produtoPedido : null,
      pedido: quantidadeAutorizada(i) != null ? formatarQuantidade(quantidadeAutorizada(i), i.unidade) : 'a definir pelo gestor',
      entregue: i.quantidade != null ? formatarQuantidade(i.quantidade, i.unidade) : null,
      valor: i.valorTotal != null ? formatarMoeda(i.valorTotal) : null,
      porUnidade: i.valorUnitario != null
        ? `R$ ${i.valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} por ${i.unidade.toUpperCase() === 'L' ? 'litro' : 'unidade'}`
        : null,
      tanqueCheio: !!i.tanqueCheio
    }));
  });
  protected readonly total = computed(() => {
    const itens = this.pedido()?.servidor?.itens ?? [];
    const soma = itens.reduce((t, i) => t + (i.valorTotal ?? 0), 0);
    return itens.length > 1 && soma > 0 ? formatarMoeda(soma) : null;
  });

  /** Fotos do pedido e do realizado: a do aparelho enquanto existir; senão, a do servidor. */
  protected readonly fotos = computed<FotoTela[]>(() => {
    const a = this.pedido();
    if (!a) return [];
    const locais: { foto: FotoAbastecimentoLocal | null | undefined; tipo: string; rotulo: string }[] = [
      { foto: a.fotoPainel, tipo: 'PAINEL_ANTES', rotulo: 'Painel antes' },
      { foto: a.realizado?.fotoPainel, tipo: 'PAINEL_DEPOIS', rotulo: 'Painel depois' },
      { foto: a.realizado?.fotoCupom, tipo: 'CUPOM', rotulo: 'Cupom ou nota' }
    ];
    const doServidor = a.servidor?.fotos ?? [];
    const lista: FotoTela[] = [];
    for (const l of locais) {
      const s = doServidor.find((f) => f.tipo === l.tipo);
      const id = s?.idFoto ?? l.foto?.idFoto;
      if (!id) continue;
      const local = l.foto && l.foto.arquivo.size ? this.urlLocal(l.foto) : null;
      const baixada = this.baixadas()[id];
      if (local) lista.push({ id, rotulo: s?.tipoRotulo ?? l.rotulo, url: local, situacao: 'pronta' });
      else if (baixada && baixada !== 'carregando' && baixada !== 'falhou') lista.push({ id, rotulo: s?.tipoRotulo ?? l.rotulo, url: baixada, situacao: 'pronta' });
      else if (s?.recebida) lista.push({ id, rotulo: s.tipoRotulo, url: null, situacao: baixada === 'falhou' ? 'falhou' : 'carregando' });
      else lista.push({ id, rotulo: s?.tipoRotulo ?? l.rotulo, url: null, situacao: 'no-aparelho' });
    }
    return lista;
  });

  ngOnInit(): void {
    // Acompanha a fila e a atualização pelo servidor sem precisar reabrir.
    const assinatura = liveQuery(() => this.servico.buscar(this.id)).subscribe({
      next: (a) => {
        this.pedido.set(a ?? null);
        this.carregado.set(true);
        if (a) this.baixarFotos(a);
      }
    });
    this.destroyRef.onDestroy(() => assinatura.unsubscribe());
    if (this.rede.isOnline()) void this.servico.atualizarDoServidor().catch(() => undefined);
  }

  ngOnDestroy(): void {
    this.locais.forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.baixadas()).forEach((url) => url.startsWith('blob:') && URL.revokeObjectURL(url));
  }

  protected placa(p: string | null): string {
    return formatarPlaca(p);
  }

  /** Na unidade do veículo (KM ou horímetro), como no painel. */
  protected medicao(valor: number | null | undefined): string {
    if (valor == null) return '—';
    const horas = this.frota.catalogo()?.veiculos.find((v) => v.idVeiculo === this.pedido()?.idVeiculo)?.unidadeMedicao === 'HORAS';
    return `${valor.toLocaleString('pt-BR')} ${horas ? 'h' : 'km'}`;
  }

  protected voltar(): void {
    void this.router.navigate(['/abastecimento']);
  }

  protected registrar(): void {
    void this.router.navigate(['/abastecimento', this.id, 'realizado']);
  }

  protected abrirCancelamento(): void {
    this.motivo.set('');
    this.cancelando.set(true);
  }

  protected async cancelar(): Promise<void> {
    const a = this.pedido();
    if (!a) return;
    this.salvando.set(true);
    try {
      await this.servico.cancelar(a, this.motivo().trim());
      this.cancelando.set(false);
      this.toast.success(a.registrado ? (this.rede.isOnline() ? 'Cancelamento enviado.' : 'Cancelamento salvo. Vai quando o sinal voltar.') : 'Pedido cancelado.');
      if (a.registrado && this.rede.isOnline()) void this.sync.syncOutbox().catch(() => undefined);
    } finally {
      this.salvando.set(false);
    }
  }

  private urlLocal(f: FotoAbastecimentoLocal): string {
    let url = this.locais.get(f.idFoto);
    if (!url) {
      url = URL.createObjectURL(f.arquivo);
      this.locais.set(f.idFoto, url);
    }
    return url;
  }

  /** Baixa uma vez as fotos que já estão no servidor e não estão mais no aparelho. */
  private baixarFotos(a: AbastecimentoLocal): void {
    if (!this.rede.isOnline() || !a.registrado) return;
    const noAparelho = new Set([a.fotoPainel, a.realizado?.fotoPainel, a.realizado?.fotoCupom]
      .filter((f): f is FotoAbastecimentoLocal => !!f && f.arquivo.size > 0).map((f) => f.idFoto));
    for (const f of a.servidor?.fotos ?? []) {
      if (!f.recebida || noAparelho.has(f.idFoto) || this.baixadas()[f.idFoto]) continue;
      this.baixadas.update((b) => ({ ...b, [f.idFoto]: 'carregando' }));
      this.servico.baixarFoto(a.id, f.idFoto).then(
        (blob) => this.baixadas.update((b) => ({ ...b, [f.idFoto]: URL.createObjectURL(blob) })),
        () => this.baixadas.update((b) => ({ ...b, [f.idFoto]: 'falhou' }))
      );
    }
  }
}

function quando(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return `${hoje ? 'Hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
