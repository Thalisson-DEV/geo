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
    <geo-barra-topo titulo="Abastecimento" [subtitulo]="subtitulo()" (voltar)="voltar()">
      <button type="button" class="geo-btn-icone" [disabled]="atualizando()" (click)="atualizar()" aria-label="Atualizar a situação dos pedidos">
        <geo-icone nome="atualizar" [tamanho]="20" [class.girando]="atualizando()" />
      </button>
      <geo-indicador-rede />
    </geo-barra-topo>

    <div class="conteudo">
      @if (rascunho(); as r) {
        <section class="retomar" aria-label="Pedido não terminado">
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="retomar" /></span>
          <span class="retomar__texto">
            <strong>Pedido não terminado</strong>
            <span>{{ r.placa ? placa(r.placa) : 'Veículo ainda não escolhido' }}{{ r.itens.length ? ' · ' + resumoItens(r) : '' }}</span>
          </span>
          <span class="retomar__acoes">
            <button type="button" class="geo-btn geo-btn--principal geo-btn--compacto" (click)="novo()">Continuar</button>
            <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="confirmarDescarte.set(true)">Descartar</button>
          </span>
        </section>
      }

      @if (!carregado()) {
        <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando"><span class="geo-esqueleto"></span><span class="geo-esqueleto"></span></div>
      } @else if (!abertos().length && !historico().length && !rascunho()) {
        <geo-vazio icone="combustivel" titulo="Nenhum pedido de abastecimento"
          texto="Peça pelo app com a foto do painel. O gestor da placa aprova, o administrativo libera e avisa o posto, e você registra o abastecimento com o cupom." />
      }

      @if (abertos().length) {
        <h2 class="geo-secao"><span>Em andamento</span><span class="geo-num">{{ abertos().length }}</span></h2>
        <ul class="geo-grupo">
          @for (a of abertos(); track a.id) { <li class="pedido-item"><ng-container [ngTemplateOutlet]="cartao" [ngTemplateOutletContext]="{ $implicit: a }" /></li> }
        </ul>
      }

      @if (historico().length) {
        <h2 class="geo-secao"><span>Últimos dias</span><span class="geo-num">{{ historico().length }}</span></h2>
        <ul class="geo-grupo">
          @for (a of historico(); track a.id) { <li class="pedido-item"><ng-container [ngTemplateOutlet]="cartao" [ngTemplateOutletContext]="{ $implicit: a }" /></li> }
        </ul>
      }
      <div class="geo-respiro"></div>
    </div>

    <div class="doca" data-acao-fixa>
      @if (rascunho()) {
        <button type="button" class="geo-btn geo-btn--principal geo-btn--bloco" (click)="novo()"><geo-icone nome="retomar" />Continuar pedido</button>
      } @else {
        <button type="button" class="geo-btn geo-btn--principal geo-btn--bloco" (click)="novo()"><geo-icone nome="mais" />Pedir abastecimento</button>
      }
    </div>

    <ng-template #cartao let-a>
      @let s = situacao(a);
      <button type="button" class="geo-linha geo-linha--acao pedido" (click)="abrir(a)" [attr.aria-label]="'Abrir o pedido do ' + placa(a.placa)">
        <span class="geo-selo" [class.geo-selo--ok]="s.tom === 'ok'" [class.geo-selo--atencao]="s.tom === 'atencao'"
          [class.geo-selo--erro]="s.tom === 'erro'" [class.geo-selo--destaque]="s.tom === 'destaque'"><geo-icone nome="combustivel" /></span>
        <span class="geo-linha__texto">
          <span class="pedido__topo">
            <span class="geo-linha__titulo geo-num">{{ placa(a.placa) }}</span>
            <span class="geo-etiqueta" [class.geo-etiqueta--ok]="s.tom === 'ok'" [class.geo-etiqueta--atencao]="s.tom === 'atencao'"
              [class.geo-etiqueta--erro]="s.tom === 'erro'" [class.geo-etiqueta--destaque]="s.tom === 'destaque'">{{ s.rotulo }}</span>
          </span>
          <span class="geo-linha__resumo">{{ resumoItens(a) }}</span>
          <span class="geo-linha__apoio">{{ a.servidor?.posto ?? a.postoNome }} · {{ quando(a) }}</span>
          <span class="pedido__situacao" [class.pedido__situacao--erro]="s.tom === 'erro'">{{ s.apoio }}</span>
          @if (a.aviso) { <span class="pedido__aviso"><geo-icone nome="info" [tamanho]="14" />{{ a.aviso }}</span> }
        </span>
        @if (estadoEnvio(a); as e) { <geo-status-envio [estado]="e" /> }
        <geo-icone class="pedido__abrir" nome="avancar" [tamanho]="18" />
      </button>
      @if (acoes(a); as ac) {
        @if (ac.length) {
          <div class="pedido__acoes">
            @for (acao of ac; track acao) {
              @switch (acao) {
                @case ('registrar') { <button type="button" class="geo-btn geo-btn--principal geo-btn--compacto" (click)="registrar(a)"><geo-icone nome="combustivel" [tamanho]="16" />Registrar abastecimento</button> }
                @case ('tentar') { <button type="button" class="geo-btn geo-btn--tonal geo-btn--compacto" (click)="tentarDeNovo(a)"><geo-icone nome="atualizar" [tamanho]="16" />Tentar de novo</button> }
                @case ('corrigir') { <button type="button" class="geo-btn geo-btn--tonal geo-btn--compacto" (click)="corrigir(a)"><geo-icone nome="editar" [tamanho]="16" />Corrigir e enviar</button> }
                @case ('descartar') { <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="descartarRecusado.set(a)">Descartar</button> }
                @case ('cancelar') { <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="abrirCancelamento(a)">Cancelar pedido</button> }
              }
            }
          </div>
        }
      }
    </ng-template>

    <geo-folha [aberta]="!!cancelando()" (fechar)="cancelando.set(null)" titulo="Cancelar o pedido?"
      [descricao]="cancelando() ? 'Pedido do ' + placa(cancelando()!.placa) + ' (' + resumoItens(cancelando()!) + ').' : null">
      <div class="motivo">
        <label class="geo-campo">
          <span class="geo-campo__rotulo">Motivo (opcional)</span>
          <textarea class="geo-input" rows="3" maxlength="500" placeholder="Ex.: o veículo foi para a oficina" [value]="motivo()"
            (input)="motivo.set($any($event.target).value)"></textarea>
        </label>
      </div>
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="cancelando.set(null)">Manter</button>
        <button type="button" class="geo-btn geo-btn--perigo" [disabled]="salvando()" (click)="cancelar()">Cancelar pedido</button>
      </div>
    </geo-folha>

    <geo-folha [aberta]="!!descartarRecusado()" (fechar)="descartarRecusado.set(null)" titulo="Descartar o pedido recusado?"
      descricao="Ele sai do aparelho e não vai para o servidor. Se ainda precisar abastecer, faça um novo.">
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="descartarRecusado.set(null)">Manter</button>
        <button type="button" class="geo-btn geo-btn--perigo" (click)="descartarErro()">Descartar</button>
      </div>
    </geo-folha>

    <geo-folha [aberta]="confirmarDescarte()" (fechar)="confirmarDescarte.set(false)" titulo="Descartar o pedido?"
      descricao="O que foi preenchido e a foto do painel saem do aparelho.">
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="confirmarDescarte.set(false)">Manter</button>
        <button type="button" class="geo-btn geo-btn--perigo" (click)="descartar()">Descartar</button>
      </div>
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .conteudo { flex: 1; }
    .girando { animation: girar 900ms linear infinite; }
    @keyframes girar { to { transform: rotate(360deg); } }
    .retomar { display: flex; align-items: center; gap: var(--geo-e3); margin: var(--geo-e2) var(--geo-e3); padding: var(--geo-e3) var(--geo-e4);
      background: var(--geo-superficie); border-radius: var(--geo-r-grupo); box-shadow: inset 4px 0 0 var(--geo-destaque); flex-wrap: wrap; }
    .retomar__texto { flex: 1; min-width: 12rem; display: grid; gap: 2px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .retomar__texto strong { font: var(--geo-t-corpo-forte); color: var(--geo-texto); }
    .retomar__acoes { display: flex; gap: var(--geo-e2); }
    .pedido-item + .pedido-item { border-top: 1px solid var(--geo-linha); }
    .pedido { align-items: flex-start; }
    .pedido__abrir { flex: none; align-self: center; color: var(--geo-texto-3); }
    .pedido__topo { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e2); }
    .pedido__topo .geo-linha__titulo { font-size: 1rem; font-weight: 600; letter-spacing: .02em; }
    .pedido__situacao { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .pedido__situacao--erro { color: var(--geo-erro); font-weight: 600; }
    .pedido__aviso { display: flex; align-items: flex-start; gap: 4px; font: var(--geo-t-apoio); color: var(--geo-atencao); }
    .pedido__aviso geo-icone { flex: none; margin-top: 2px; }
    .pedido__acoes { display: flex; flex-wrap: wrap; gap: var(--geo-e2); padding: 0 var(--geo-e4) var(--geo-e3) calc(var(--geo-e4) + 40px + var(--geo-e3)); }
    .motivo { padding: 0 var(--geo-e4); }
    .motivo textarea { min-height: 88px; padding-top: var(--geo-e3); resize: vertical; }
    .doca { position: sticky; bottom: 0; padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base)); background: var(--geo-fundo); }
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
