import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { liveQuery } from 'dexie';
import {
  AbastecimentoLocal,
  emAndamento,
  formatarQuantidade,
  quantidadeAutorizada,
  ordenarParaEquipe,
  podeCancelar,
  podeRegistrarRealizado,
  situacaoParaEquipe
} from '../../core/frota/abastecimento.models';
import { AbastecimentoService } from '../../core/frota/abastecimento.service';
import { formatarPlaca } from '../../core/frota/checklist-veiculo.models';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { SyncService } from '../../core/sync/sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, EstadoEnvio, FolhaComponent, IconeComponent, IndicadorRedeComponent, StatusEnvioComponent, VazioComponent } from '../../ui';

/**
 * Pedidos de abastecimento do usuário e da equipe: o liberado para abastecer vem primeiro, com o
 * botão de registrar; depois os que esperam o gestor ou o administrativo, e o histórico recente.
 */
@Component({
  selector: 'app-abastecimento-lista',
  standalone: true,
  imports: [NgTemplateOutlet, BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, StatusEnvioComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-barra-topo titulo="Abastecimento" [subtitulo]="subtitulo()" (voltar)="voltar()">
      <button type="button" class="ces-btn-icone" [disabled]="atualizando()" (click)="atualizar()" aria-label="Atualizar a situação dos pedidos">
        <ces-icone nome="atualizar" [tamanho]="20" [class.girando]="atualizando()" />
      </button>
      <ces-indicador-rede />
    </ces-barra-topo>

    <div class="conteudo">
      @if (rascunho(); as r) {
        <section class="retomar" aria-label="Pedido não terminado">
          <span class="ces-selo ces-selo--destaque"><ces-icone nome="retomar" /></span>
          <span class="retomar__texto">
            <strong>Pedido não terminado</strong>
            <span>{{ r.placa ? placa(r.placa) : 'Veículo ainda não escolhido' }}{{ r.itens.length ? ' · ' + resumoItens(r) : '' }}</span>
          </span>
          <span class="retomar__acoes">
            <button type="button" class="ces-btn ces-btn--principal ces-btn--compacto" (click)="novo()">Continuar</button>
            <button type="button" class="ces-btn ces-btn--texto ces-btn--compacto" (click)="confirmarDescarte.set(true)">Descartar</button>
          </span>
        </section>
      }

      @if (!carregado()) {
        <div class="ces-esqueletos" aria-label="Carregando"><span class="ces-esqueleto"></span><span class="ces-esqueleto"></span></div>
      } @else if (!abertos().length && !historico().length && !rascunho()) {
        <ces-vazio icone="combustivel" titulo="Nenhum pedido de abastecimento"
          texto="Peça pelo app com a foto do painel. O gestor da placa aprova, o administrativo libera e avisa o posto, e você registra o abastecimento com o cupom." />
      }

      @if (abertos().length) {
        <h2 class="ces-secao"><span>Em andamento</span><span class="ces-num">{{ abertos().length }}</span></h2>
        <ul class="ces-grupo">
          @for (a of abertos(); track a.id) { <li class="pedido-item"><ng-container [ngTemplateOutlet]="cartao" [ngTemplateOutletContext]="{ $implicit: a }" /></li> }
        </ul>
      }

      @if (historico().length) {
        <h2 class="ces-secao"><span>Últimos dias</span><span class="ces-num">{{ historico().length }}</span></h2>
        <ul class="ces-grupo">
          @for (a of historico(); track a.id) { <li class="pedido-item"><ng-container [ngTemplateOutlet]="cartao" [ngTemplateOutletContext]="{ $implicit: a }" /></li> }
        </ul>
      }
      <div class="ces-respiro"></div>
    </div>

    <div class="doca">
      @if (rascunho()) {
        <button type="button" class="ces-btn ces-btn--principal ces-btn--bloco" (click)="novo()"><ces-icone nome="retomar" />Continuar pedido</button>
      } @else {
        <button type="button" class="ces-btn ces-btn--principal ces-btn--bloco" (click)="novo()"><ces-icone nome="mais" />Pedir abastecimento</button>
      }
    </div>

    <ng-template #cartao let-a>
      @let s = situacao(a);
      <button type="button" class="ces-linha ces-linha--acao pedido" (click)="abrir(a)" [attr.aria-label]="'Abrir o pedido do ' + placa(a.placa)">
        <span class="ces-selo" [class.ces-selo--ok]="s.tom === 'ok'" [class.ces-selo--atencao]="s.tom === 'atencao'"
          [class.ces-selo--erro]="s.tom === 'erro'" [class.ces-selo--destaque]="s.tom === 'destaque'"><ces-icone nome="combustivel" /></span>
        <span class="ces-linha__texto">
          <span class="pedido__topo">
            <span class="ces-linha__titulo ces-num">{{ placa(a.placa) }}</span>
            <span class="ces-etiqueta" [class.ces-etiqueta--ok]="s.tom === 'ok'" [class.ces-etiqueta--atencao]="s.tom === 'atencao'"
              [class.ces-etiqueta--erro]="s.tom === 'erro'" [class.ces-etiqueta--destaque]="s.tom === 'destaque'">{{ s.rotulo }}</span>
          </span>
          <span class="ces-linha__resumo">{{ resumoItens(a) }}</span>
          <span class="ces-linha__apoio">{{ a.servidor?.posto ?? a.postoNome }} · {{ quando(a) }}</span>
          <span class="pedido__situacao" [class.pedido__situacao--erro]="s.tom === 'erro'">{{ s.apoio }}</span>
          @if (a.aviso) { <span class="pedido__aviso"><ces-icone nome="info" [tamanho]="14" />{{ a.aviso }}</span> }
        </span>
        @if (estadoEnvio(a); as e) { <ces-status-envio [estado]="e" /> }
        <ces-icone class="pedido__abrir" nome="avancar" [tamanho]="18" />
      </button>
      @if (acoes(a); as ac) {
        @if (ac.length) {
          <div class="pedido__acoes">
            @for (acao of ac; track acao) {
              @switch (acao) {
                @case ('registrar') { <button type="button" class="ces-btn ces-btn--principal ces-btn--compacto" (click)="registrar(a)"><ces-icone nome="combustivel" [tamanho]="16" />Registrar abastecimento</button> }
                @case ('tentar') { <button type="button" class="ces-btn ces-btn--tonal ces-btn--compacto" (click)="tentarDeNovo(a)"><ces-icone nome="atualizar" [tamanho]="16" />Tentar de novo</button> }
                @case ('corrigir') { <button type="button" class="ces-btn ces-btn--tonal ces-btn--compacto" (click)="corrigir(a)"><ces-icone nome="editar" [tamanho]="16" />Corrigir e enviar</button> }
                @case ('descartar') { <button type="button" class="ces-btn ces-btn--texto ces-btn--compacto" (click)="descartarRecusado.set(a)">Descartar</button> }
                @case ('cancelar') { <button type="button" class="ces-btn ces-btn--texto ces-btn--compacto" (click)="abrirCancelamento(a)">Cancelar pedido</button> }
              }
            }
          </div>
        }
      }
    </ng-template>

    <ces-folha [aberta]="!!cancelando()" (fechar)="cancelando.set(null)" titulo="Cancelar o pedido?"
      [descricao]="cancelando() ? 'Pedido do ' + placa(cancelando()!.placa) + ' (' + resumoItens(cancelando()!) + ').' : null">
      <div class="motivo">
        <label class="ces-campo">
          <span class="ces-campo__rotulo">Motivo (opcional)</span>
          <textarea class="ces-input" rows="3" maxlength="500" placeholder="Ex.: o veículo foi para a oficina" [value]="motivo()"
            (input)="motivo.set($any($event.target).value)"></textarea>
        </label>
      </div>
      <div rodape class="ces-folha-rodape">
        <button type="button" class="ces-btn ces-btn--neutro" (click)="cancelando.set(null)">Manter</button>
        <button type="button" class="ces-btn ces-btn--perigo" [disabled]="salvando()" (click)="cancelar()">Cancelar pedido</button>
      </div>
    </ces-folha>

    <ces-folha [aberta]="!!descartarRecusado()" (fechar)="descartarRecusado.set(null)" titulo="Descartar o pedido recusado?"
      descricao="Ele sai do aparelho e não vai para o servidor. Se ainda precisar abastecer, faça um novo.">
      <div rodape class="ces-folha-rodape">
        <button type="button" class="ces-btn ces-btn--neutro" (click)="descartarRecusado.set(null)">Manter</button>
        <button type="button" class="ces-btn ces-btn--perigo" (click)="descartarErro()">Descartar</button>
      </div>
    </ces-folha>

    <ces-folha [aberta]="confirmarDescarte()" (fechar)="confirmarDescarte.set(false)" titulo="Descartar o pedido?"
      descricao="O que foi preenchido e a foto do painel saem do aparelho.">
      <div rodape class="ces-folha-rodape">
        <button type="button" class="ces-btn ces-btn--neutro" (click)="confirmarDescarte.set(false)">Manter</button>
        <button type="button" class="ces-btn ces-btn--perigo" (click)="descartar()">Descartar</button>
      </div>
    </ces-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .conteudo { flex: 1; }
    .girando { animation: girar 900ms linear infinite; }
    @keyframes girar { to { transform: rotate(360deg); } }
    .retomar { display: flex; align-items: center; gap: var(--ces-e3); margin: var(--ces-e2) var(--ces-e3); padding: var(--ces-e3) var(--ces-e4);
      background: var(--ces-superficie); border-radius: var(--ces-r-grupo); box-shadow: inset 4px 0 0 var(--ces-destaque); flex-wrap: wrap; }
    .retomar__texto { flex: 1; min-width: 12rem; display: grid; gap: 2px; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .retomar__texto strong { font: var(--ces-t-corpo-forte); color: var(--ces-texto); }
    .retomar__acoes { display: flex; gap: var(--ces-e2); }
    .pedido-item + .pedido-item { border-top: 1px solid var(--ces-linha); }
    .pedido { align-items: flex-start; }
    .pedido__abrir { flex: none; align-self: center; color: var(--ces-texto-3); }
    .pedido__topo { display: flex; align-items: center; justify-content: space-between; gap: var(--ces-e2); }
    .pedido__topo .ces-linha__titulo { font-size: 1rem; font-weight: 600; letter-spacing: .02em; }
    .pedido__situacao { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .pedido__situacao--erro { color: var(--ces-erro); font-weight: 600; }
    .pedido__aviso { display: flex; align-items: flex-start; gap: 4px; font: var(--ces-t-apoio); color: var(--ces-atencao); }
    .pedido__aviso ces-icone { flex: none; margin-top: 2px; }
    .pedido__acoes { display: flex; flex-wrap: wrap; gap: var(--ces-e2); padding: 0 var(--ces-e4) var(--ces-e3) calc(var(--ces-e4) + 40px + var(--ces-e3)); }
    .motivo { padding: 0 var(--ces-e4); }
    .motivo textarea { min-height: 88px; padding-top: var(--ces-e3); resize: vertical; }
    .doca { position: sticky; bottom: 0; padding: var(--ces-e3) var(--ces-e4) calc(var(--ces-e3) + var(--ces-safe-base)); background: var(--ces-fundo); }
  `]
})
export class AbastecimentoListaComponent implements OnInit {
  private readonly servico = inject(AbastecimentoService);
  private readonly router = inject(Router);
  private readonly sync = inject(SyncService);
  private readonly rede = inject(ConnectivityService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly todos = signal<AbastecimentoLocal[]>([]);
  protected readonly carregado = signal(false);
  protected readonly atualizando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly confirmarDescarte = signal(false);
  protected readonly descartarRecusado = signal<AbastecimentoLocal | null>(null);
  protected readonly cancelando = signal<AbastecimentoLocal | null>(null);
  protected readonly motivo = signal('');

  protected readonly rascunho = computed(() => this.todos().find((a) => a.statusSync === 'RASCUNHO') ?? null);
  private readonly enviados = computed(() => ordenarParaEquipe(this.todos().filter((a) => a.statusSync !== 'RASCUNHO')));
  /** Em andamento, e também o recusado que ainda dá para corrigir. */
  protected readonly abertos = computed(() => this.enviados().filter((a) => emAndamento(a) || (a.statusSync === 'ERRO' && !a.registrado)));
  protected readonly historico = computed(() => this.enviados().filter((a) => !this.abertos().includes(a)));
  protected readonly subtitulo = computed(() => {
    const liberados = this.abertos().filter((a) => podeRegistrarRealizado(a)).length;
    if (liberados) return liberados === 1 ? '1 liberado para abastecer' : `${liberados} liberados para abastecer`;
    const abertos = this.abertos().length;
    return abertos ? (abertos === 1 ? '1 pedido em andamento' : `${abertos} pedidos em andamento`) : 'Nada em andamento';
  });

  ngOnInit(): void {
    // A tela acompanha a fila e o servidor: na fila → enviado → aprovado → liberado sem reabrir.
    const assinatura = liveQuery(() => this.servico.listar()).subscribe({
      next: (todos) => {
        this.todos.set(todos);
        this.carregado.set(true);
      }
    });
    this.destroyRef.onDestroy(() => assinatura.unsubscribe());
    void this.atualizar(false);
  }

  protected situacao(a: AbastecimentoLocal) {
    return situacaoParaEquipe(a);
  }

  protected placa(placa: string | null): string {
    return formatarPlaca(placa);
  }

  protected resumoItens(a: AbastecimentoLocal): string {
    const itens = a.servidor?.itens.length
      ? a.servidor.itens.map((i) => {
          const q = i.quantidade ?? quantidadeAutorizada(i);
          return q == null ? (i.produto ?? i.produtoPedido) : `${i.produto ?? i.produtoPedido} ${formatarQuantidade(q, i.unidade)}`;
        })
      : a.itens.map((i) => (i.quantidade != null ? `${i.nome} ${formatarQuantidade(i.quantidade, i.unidade)}` : i.nome));
    return itens.join(' · ') || 'Sem itens';
  }

  protected quando(a: AbastecimentoLocal): string {
    const iso = a.solicitadoEm ?? a.criadoEm;
    const d = new Date(iso);
    const hoje = new Date().toDateString() === d.toDateString();
    return `${hoje ? 'Hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Estado da fila só enquanto algo deste pedido ainda não chegou ao servidor. */
  protected estadoEnvio(a: AbastecimentoLocal): EstadoEnvio | null {
    const pendente = [a.statusSync, a.realizado?.statusSync, a.cancelamento?.statusSync].find((s) => s === 'FILA' || s === 'ENVIANDO');
    return pendente === 'FILA' ? 'queued' : pendente === 'ENVIANDO' ? 'syncing' : null;
  }

  protected acoes(a: AbastecimentoLocal): ('registrar' | 'tentar' | 'corrigir' | 'descartar' | 'cancelar')[] {
    const acoes: ('registrar' | 'tentar' | 'corrigir' | 'descartar' | 'cancelar')[] = [];
    if (podeRegistrarRealizado(a)) acoes.push('registrar');
    if (a.statusSync === 'ERRO' && a.registrado) acoes.push('tentar');
    if (a.statusSync === 'ERRO' && !a.registrado) acoes.push('corrigir', 'descartar');
    else if (podeCancelar(a)) acoes.push('cancelar');
    return acoes;
  }

  protected async atualizar(avisar = true): Promise<void> {
    if (!this.rede.isOnline()) {
      if (avisar) this.toast.warning('Sem internet. A situação dos pedidos atualiza quando o sinal voltar.');
      return;
    }
    this.atualizando.set(true);
    try {
      await this.sync.syncOutbox().catch(() => undefined);
      await this.servico.atualizarDoServidor();
    } catch {
      if (avisar) this.toast.error('Não foi possível atualizar agora. Tente de novo.');
    } finally {
      this.atualizando.set(false);
    }
  }

  protected voltar(): void {
    void this.router.navigateByUrl('/frota');
  }

  protected novo(): void {
    void this.router.navigate(['/abastecimento/novo']);
  }

  protected abrir(a: AbastecimentoLocal): void {
    void this.router.navigate(['/abastecimento', a.id]);
  }

  protected registrar(a: AbastecimentoLocal): void {
    void this.router.navigate(['/abastecimento', a.id, 'realizado']);
  }

  protected abrirCancelamento(a: AbastecimentoLocal): void {
    this.motivo.set('');
    this.cancelando.set(a);
  }

  protected async cancelar(): Promise<void> {
    const a = this.cancelando();
    if (!a) return;
    this.salvando.set(true);
    try {
      await this.servico.cancelar(a, this.motivo().trim());
      this.cancelando.set(null);
      this.toast.success(a.registrado ? (this.rede.isOnline() ? 'Cancelamento enviado.' : 'Cancelamento salvo. Vai quando o sinal voltar.') : 'Pedido cancelado.');
      if (a.registrado && this.rede.isOnline()) void this.sync.syncOutbox().catch(() => undefined);
    } finally {
      this.salvando.set(false);
    }
  }

  protected async descartar(): Promise<void> {
    const r = this.rascunho();
    if (r) await this.servico.descartar(r.id);
    this.confirmarDescarte.set(false);
  }

  protected async corrigir(a: AbastecimentoLocal): Promise<void> {
    if (await this.servico.reabrir(a.id)) {
      void this.router.navigate(['/abastecimento/novo']);
      return;
    }
    this.toast.warning('Termine ou descarte o pedido não terminado antes de corrigir este.');
  }

  protected async tentarDeNovo(a: AbastecimentoLocal): Promise<void> {
    await this.servico.tentarDeNovo(a.id);
    void this.sync.syncOutbox().catch(() => undefined);
  }

  protected async descartarErro(): Promise<void> {
    const a = this.descartarRecusado();
    if (a) await this.servico.descartarRecusado(a.id);
    this.descartarRecusado.set(null);
  }
}
