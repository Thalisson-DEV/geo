import { Location } from '@angular/common';
import { idAtual } from '../../../core/sync/ids-trocados';
import { ChangeDetectionStrategy, Component, OnInit, signal, inject, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DbService } from '../../../core/db/db.service';
import { OutboxService } from '../../../core/sync/outbox.service';
import { SyncService } from '../../../core/sync/sync.service';
import { ToastService } from '../../../core/ui/toast.service';
import { SessaoService } from '../../../core/sessao/sessao.service';
import { SolicitacaoLocal, OutboxItem } from '../../../core/db/models';
import { BarraTopoComponent, FolhaComponent, IconeComponent, VazioComponent, dataCurta, hora, numeroBr } from '../../../ui';
import { situacaoPedido } from '../situacao-pedido';

interface ItemEnriquecido {
  idMaterial: string;
  quantidade: number;
  descricao: string;
  codigo: string;
  unidadeMedida: string;
}

/** Detalhe de um pedido: situação em palavras simples, de onde/para onde, quem retira e materiais com quantidades. */
@Component({
  selector: 'app-solicitacao-detalhe',
  standalone: true,
  imports: [BarraTopoComponent, FolhaComponent, IconeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Pedido de material" [subtitulo]="quando()" (voltar)="goBack()" />

    @if (isLoading()) {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        <div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 140px"></div><div class="geo-esqueleto" style="height: 160px"></div>
      </div>
    } @else if (solicitacao(); as sol) {
      <section class="geo-faixa-estado" [class.geo-faixa-estado--atencao]="situacao().tom === 'atencao'" [class.geo-faixa-estado--erro]="situacao().tom === 'erro'" aria-live="polite">
        <span class="geo-etiqueta" [class]="'geo-etiqueta geo-etiqueta--' + situacao().tom">{{ situacao().rotulo }}</span>
        <p>{{ situacao().explicacao }}</p>
      </section>
      @if (sol.status === 'REJEITADO') {
        <div class="recusa">
          <strong>{{ sol.motivoRejeicao?.nome || 'Motivo não informado' }}</strong>
          <p>{{ sol.justificativaRejeicao || sol.motivoRejeicao?.descricao || 'O almoxarifado não detalhou a recusa.' }}</p>
        </div>
      }
      @if (outboxItem()?.serverOperationId) {
        <p class="protocolo geo-num">Protocolo #{{ outboxItem()?.serverOperationId }}</p>
      }

      <dl class="geo-dados">
        <div><dt>Retirar em</dt><dd>{{ estoqueOrigemNome() }}</dd></div>
        <div><dt>Vai para</dt><dd>{{ estoqueDestinoNome() }}</dd></div>
        <div><dt>Quem retira</dt><dd>{{ responsavelSaqueNome() }}</dd></div>
        @if (sol.dataPrevista) { <div><dt>Data prevista de retirada</dt><dd class="geo-num">{{ dataPrevista() }}</dd></div> }
      </dl>

      <h2 class="geo-secao geo-secao--marcada"><span class="geo-marca geo-marca--aplicado" aria-hidden="true"><geo-icone nome="material" [tamanho]="14" /></span>
        <span>Materiais pedidos</span><span class="geo-contagem">{{ itens().length }}</span></h2>
      <ul class="geo-grupo" aria-label="Materiais pedidos">
        @for (item of itens(); track item.idMaterial) {
          <li><div class="geo-linha">
            <span class="geo-linha__texto">
              <span class="geo-linha__titulo">{{ item.descricao }}</span>
              <span class="geo-linha__apoio geo-num">Cód. {{ item.codigo }}</span>
            </span>
            <span class="geo-qtd">{{ num(item.quantidade) }}<small>{{ item.unidadeMedida }}</small></span>
          </div></li>
        }
      </ul>
      <div class="geo-respiro"></div>

      @if (showActionsFooter()) {
        <footer class="geo-rodape-acoes">
          @if (isResultadoIncerto()) {
            <button type="button" class="geo-btn geo-btn--principal" (click)="reconciliar()" [disabled]="isReconciling()">
              <geo-icone nome="atualizar" [tamanho]="18" />{{ isReconciling() ? 'Conferindo…' : 'Conferir no servidor' }}
            </button>
          } @else {
            @if (canDiscard()) { <button type="button" class="geo-btn geo-btn--perigo" (click)="abrirDescarte()">Descartar</button> }
            @if (canEdit()) { <button type="button" class="geo-btn geo-btn--principal" (click)="corrigir()"><geo-icone nome="editar" [tamanho]="18" />Corrigir</button> }
          }
        </footer>
      }
    } @else {
      <geo-vazio icone="documento" titulo="Pedido não encontrado" texto="Ele não está mais neste aparelho.">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="goBack()">Ver pedidos</button>
      </geo-vazio>
    }

    <geo-folha [aberta]="showDiscardConfirmation()" (fechar)="fecharDescarte()" titulo="Descartar este pedido?"
      descricao="Ele ainda não saiu do aparelho. Descartar apaga o pedido e tira da fila de envio.">
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="fecharDescarte()">Manter</button>
        <button type="button" class="geo-btn geo-btn--perigo" (click)="discardSolicitacao()">Descartar</button>
      </div>
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    /* Nada encolhe: com conteúdo maior que a tela, a página rola (grupos com overflow:hidden eram cortados). */
    :host > * { flex-shrink: 0; }
    .recusa { margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo);
      background: var(--geo-superficie); border-left: 4px solid var(--geo-erro); }
    .recusa strong { font: var(--geo-t-corpo-forte); }
    .recusa p { margin: 4px 0 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .protocolo { margin: var(--geo-e2) var(--geo-e5) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
  `],
})
export class SolicitacaoDetalheComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dbService = inject(DbService);
  private readonly outboxService = inject(OutboxService);
  private readonly syncService = inject(SyncService);
  private readonly toastService = inject(ToastService);
  private readonly sessao = inject(SessaoService);

  id = this.route.snapshot.paramMap.get('id')!;
  private readonly location = inject(Location);
  readonly isLoading = signal(true);
  readonly isReconciling = signal(false);
  readonly solicitacao = signal<SolicitacaoLocal | null>(null);
  readonly outboxItem = signal<OutboxItem | null>(null);
  readonly itens = signal<ItemEnriquecido[]>([]);
  readonly responsavelSaqueNome = signal('Definido na entrega');

  readonly estoqueOrigemNome = signal('');
  readonly estoqueDestinoNome = signal('');

  readonly showDiscardConfirmation = signal(!!this.sessao.estadoTela<{ folha?: string }>().folha);

  // Só o que ainda não saiu do aparelho pode ser corrigido ou descartado: um pedido que já
  // está no almoxarifado voltaria na próxima sincronização.
  private readonly naFila = computed(() => !!this.outboxItem() && this.outboxItem()!.status !== 'SINCRONIZADO');
  readonly canDiscard = computed(() => this.naFila() && this.outboxService.canDiscard(this.outboxItem()));
  readonly canEdit = computed(() => this.naFila() && this.outboxService.canEdit(this.outboxItem()));
  readonly isEmTratamentoBackoffice = computed(() => this.outboxService.isEmTratamentoBackoffice(this.outboxItem()));
  readonly isResultadoIncerto = computed(() => this.outboxService.isResultadoIncerto(this.outboxItem()));
  readonly showActionsFooter = computed(() => this.canDiscard() || this.canEdit() || this.isResultadoIncerto());

  /** O registro foi aceito pelo servidor e ganhou id novo: segue com ele e corrige a URL. */
  private seguirIdNovo(): boolean {
    const novo = idAtual(this.id);
    if (!novo) return false;
    const antigo = this.id;
    this.id = novo;
    this.location.replaceState(this.location.path().replace(antigo, novo));
    return true;
  }

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      let sol = await this.dbService.getSolicitacaoById(this.id);
      if (!sol && this.seguirIdNovo()) sol = await this.dbService.getSolicitacaoById(this.id);
      if (!sol) {
        this.isLoading.set(false);
        return;
      }
      this.solicitacao.set(sol);
      if (sol.saqueForaEquipe) {
        this.responsavelSaqueNome.set('Alguém de fora da equipe (definido na entrega)');
      } else if (sol.idColaboradorSaque) {
        const colaboradores = await this.dbService.getColaboradoresAtivos();
        this.responsavelSaqueNome.set(colaboradores.find(c => c.id === sol.idColaboradorSaque)?.nomeCompleto || 'Colaborador indicado');
      }

      // Buscar item no outbox
      const outbox = await this.dbService.getOutboxItemBySolicitacaoId(this.id);
      this.outboxItem.set(outbox || null);

      // Buscar nomes dos estoques
      const [origem, destino] = await Promise.all([
        this.dbService.getEstoques().then(list => list.find(e => e.id === sol.idEstoqueOrigem)),
        this.dbService.getEstoques().then(list => list.find(e => e.id === sol.idEstoqueDestino))
      ]);

      this.estoqueOrigemNome.set(origem?.nomeIdentificador || 'Almoxarifado');
      this.estoqueDestinoNome.set(destino?.nomeIdentificador || 'Estoque da equipe');

      // Enriquecer itens com dados dos materiais
      const materiais = await this.dbService.getMateriais();
      const materiaisMap = new Map(materiais.map(m => [m.id, m]));

      const itensEnriquecidos = sol.itens.map(item => {
        const mat = materiaisMap.get(item.idMaterial);
        return {
          ...item,
          descricao: mat?.descricao || 'Material não encontrado',
          codigo: mat?.codigo || 'N/A',
          unidadeMedida: mat?.unidadeMedida || 'UN'
        };
      });
      this.itens.set(itensEnriquecidos);

    } catch (error) {
      console.error('Erro ao carregar detalhe da solicitação:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  readonly situacao = computed(() => situacaoPedido(this.solicitacao()!, this.outboxItem(), {
    backoffice: this.isEmTratamentoBackoffice(), incerto: this.isResultadoIncerto(),
  }));
  readonly quando = computed(() => {
    const d = this.solicitacao()?.dataSolicitacao;
    return d ? 'Pedido em ' + dataCurta(d) + ' às ' + hora(d) : '';
  });
  readonly dataPrevista = computed(() => dataCurta(this.solicitacao()?.dataPrevista));

  num(n: number): string {
    return numeroBr(n);
  }

  corrigir(): void {
    void this.router.navigate(['/solicitacoes/nova'], { queryParams: { editId: this.id } });
  }

  abrirDescarte(): void {
    this.showDiscardConfirmation.set(true);
    this.sessao.definirEstadoTela({ folha: 'descartar' });
  }

  fecharDescarte(): void {
    this.showDiscardConfirmation.set(false);
    this.sessao.definirEstadoTela({ folha: null });
  }

  async reconciliar() {
    try {
      this.isReconciling.set(true);
      await this.syncService.syncOutbox({ reconciliar: true });
      await this.loadData();
      this.toastService.success('Conferido com o servidor.');
    } catch (err) {
      console.error('Erro na reconciliação:', err);
      this.toastService.error('Não foi possível conferir agora. Tente de novo com internet.');
    } finally {
      this.isReconciling.set(false);
    }
  }

  async discardSolicitacao() {
    try {
      // 1. Remover do Outbox (se existir)
      const outbox = this.outboxItem();
      if (outbox) {
        const removed = await this.outboxService.discard(outbox.id);
        if (!removed) {
          this.toastService.error('Este pedido está com o escritório e não pode ser descartado.');
          return;
        }
      }

      // 2. Remover do IndexedDB (solicitacoes)
      await this.dbService.deleteSolicitacao(this.id);

      this.toastService.success('Pedido descartado.');

      // 3. Voltar para a lista
      this.router.navigate(['/solicitacoes']);
    } catch (error: any) {
      console.error('Erro ao descartar solicitação:', error);
      this.toastService.error(error?.message || 'Não foi possível descartar a solicitação.');
    } finally {
      this.fecharDescarte();
    }
  }

  goBack() {
    this.router.navigate(['/solicitacoes']);
  }
}
