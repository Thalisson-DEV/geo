import { iconeCondicao } from '../../../../shared/utils/movimentacao.utils';
import { DecimalPipe } from '@angular/common';
import { QuantidadeUnidadeComponent } from '../../shared/quantidade-unidade.component';
import { paraUnidadeBase } from '../../shared/unidade-material';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  GeoAutocompleteComponent,
  GeoButtonComponent,
  GeoConfirmationService,
  GeoDialogShellComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { Observable } from 'rxjs';

import { RemoteLookup } from '../../../../core/lookup/store/remote-lookup';
import { LookupStore } from '../../../../core/lookup/store/lookup.store';
import { EstoqueResponse, MaterialResponse, MotivoMovimentacao, ItemMovimentacaoRequest, MovimentacaoBulkRequest, SaldoResponse } from '../../../../core/models/almoxarifado.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { createFormDraft } from '../../../../core/navigation';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { rotuloCondicao, tomCondicao } from '../../../../shared/utils/movimentacao.utils';
import { ListasService } from '../../../../core/services/listas.service';
import { valeEm } from '../../../../core/models/listas.models';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { SolicitacaoTecnicaAssinaturaComponent } from '../../solicitacoes-material/solicitacao-tecnica-assinatura/solicitacao-tecnica-assinatura.component';

export type TipoOperacaoEstoque = 'ENTRADA' | 'BAIXA' | 'TRANSFERENCIA';
type Condicao = 'NOVO' | 'SUCATA';

interface LinhaOperacao {
  chave: number;
  material: MaterialResponse;
  condicao: Condicao;
  /** Quantidade na unidade escolhida (a do material ou uma equivalente). */
  quantidade: number | null;
  /** Unidade escolhida; nula = unidade do material. */
  unidade?: string | null;
  series: string[];
}

interface Rascunho {
  tipo: TipoOperacaoEstoque;
  idOrigem: string | null;
  idDestino: string | null;
  motivo: MotivoMovimentacao | null;
  observacao: string;
  linhas: LinhaOperacao[];
}

const TEXTOS: Record<TipoOperacaoEstoque, { titulo: string; descricao: string; acao: string; sucesso: string }> = {
  ENTRADA: {
    titulo: 'Entrada avulsa',
    descricao: 'Ajuste positivo, suprimento ou bonificação. O saldo entra na hora no estoque escolhido.',
    acao: 'Registrar entrada',
    sucesso: 'Entrada registrada.'
  },
  BAIXA: {
    titulo: 'Baixa avulsa',
    descricao: 'Perda, avaria, sucata ou ajuste negativo. A baixa é definitiva e tira o saldo na hora.',
    acao: 'Registrar baixa',
    sucesso: 'Baixa registrada.'
  },
  TRANSFERENCIA: {
    titulo: 'Transferência entre estoques',
    descricao: 'Move o saldo de um estoque para outro, com a assinatura de quem entrega e de quem recebe.',
    acao: 'Registrar transferência',
    sucesso: 'Transferência registrada.'
  }
};
const CONDICOES: GeoSelectOption<Condicao>[] = [
  { label: 'Novo', value: 'NOVO' },
  { label: 'Sucata', value: 'SUCATA' }
];
const TAMANHO_OBSERVACAO = 1000;

/** Entrada, baixa e transferência em uma tela só: estoque, materiais com saldo e séries, e um botão para registrar. */
@Component({
  selector: 'app-operacao-estoque-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    QuantidadeUnidadeComponent,
    DecimalPipe,
    FormsModule,
    GeoAutocompleteComponent,
    GeoButtonComponent,
    GeoDialogShellComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextareaComponent,
    SolicitacaoTecnicaAssinaturaComponent
  ],
  styleUrl: '../../solicitacoes-material/nova-solicitacao/nova-solicitacao.css',
  styles: `
    .op-estoques { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.875rem; }
    .op-estoques--dois { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: end; }
    .op-inverter { padding-bottom: 0.25rem; }
    .op-acoes { display: inline-flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .op-item + .op-item { border-top: 1px solid var(--geo-border); }
    .op-item .ns-item { grid-template-columns: minmax(0, 1fr) minmax(9.5rem, auto) auto; }
    .op-qtd-unidade { max-width: 15rem; }
    .op-item--erro { box-shadow: inset 3px 0 0 var(--geo-danger); }
    .op-saldo { display: inline-flex; align-items: center; gap: 0.25rem; font-variant-numeric: tabular-nums; }
    .op-saldo .pi { font-size: var(--geo-font-caption); }
    .op-saldo strong { color: var(--geo-foreground); }
    .op-qtd { font-size: var(--geo-font-control); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
    .op-erro { margin: 0; padding: 0 0.875rem 0.75rem; font-size: var(--geo-font-caption); color: var(--geo-danger-text, var(--geo-danger)); }
    .op-series { display: grid; gap: 0.625rem; padding: 0.75rem 0.875rem; border-top: 1px dashed var(--geo-border); background: var(--geo-surface-subtle); }
    .op-series__topo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .op-chips { display: flex; flex-wrap: wrap; gap: 0.375rem; max-height: 10rem; overflow-y: auto; }
    .op-chips .pi { font-size: var(--geo-font-caption); }
    .op-colar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; align-items: end; }
    .op-assinaturas { display: grid; gap: 1rem; }
    @media (max-width: 40rem) {
      .op-estoques--dois, .op-colar { grid-template-columns: minmax(0, 1fr); }
      .op-inverter { justify-self: center; padding: 0; }
    }
  `,
  template: `
    <geo-form-drawer #drawer [visible]="visible()" (visibleChange)="visible.set($event)" [title]="textos().titulo" [description]="textos().descricao"
      size="lg" [resizable]="true" [dirty]="alterado()" discardMessage="Os materiais e dados desta operação serão perdidos.">
      <div class="ns">
        <section class="ns-secao" aria-labelledby="op-estoque">
          <h3 id="op-estoque" class="ns-secao__titulo"><i class="pi pi-warehouse" aria-hidden="true"></i>{{ tipo() === 'TRANSFERENCIA' ? 'Origem e destino' : 'Estoque' }}</h3>
          <div class="ns-cartao">
            <div class="op-estoques" [class.op-estoques--dois]="tipo() === 'TRANSFERENCIA'">
              @if (tipo() !== 'ENTRADA') {
                <geo-select [label]="tipo() === 'BAIXA' ? 'Estoque' : 'Estoque de origem'" placeholder="Selecione" [options]="opcoesEstoque()" [value]="idOrigem()"
                  (valueChange)="trocarOrigem($event)" [filter]="true" [required]="true" [error]="tentou() && !idOrigem() ? 'Escolha o estoque.' : undefined" />
              }
              @if (tipo() === 'TRANSFERENCIA') {
                <span class="op-inverter">
                  <geo-icon-button icon="pi pi-arrow-right-arrow-left" label="Inverter origem e destino" tooltip="Inverter origem e destino" [disabled]="!idOrigem() || !idDestino()" (pressed)="inverter()" />
                </span>
              }
              @if (tipo() !== 'BAIXA') {
                <geo-select [label]="tipo() === 'ENTRADA' ? 'Estoque' : 'Estoque de destino'" placeholder="Selecione" [options]="opcoesDestino()" [value]="idDestino()"
                  (valueChange)="idDestino.set($event)" [filter]="true" [required]="true" [error]="tentou() && !idDestino() ? 'Escolha o estoque.' : undefined" />
              }
            </div>
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="op-materiais">
          <div class="ns-secao__topo">
            <h3 id="op-materiais" class="ns-secao__titulo"><i class="pi pi-box" aria-hidden="true"></i>Materiais</h3>
            <span class="op-acoes">
              @if (tipo() === 'TRANSFERENCIA') {
                <geo-button label="Transferir tudo" icon="pi pi-clone" variant="outline" size="sm" [disabled]="!opcoesSaldo().length" (pressed)="transferirTudo()" />
              }
              <geo-button label="Importar planilha" icon="pi pi-upload" variant="ghost" size="sm" (pressed)="importar.emit()" />
            </span>
          </div>

          @if (tipo() === 'ENTRADA') {
            <geo-autocomplete label="Incluir material" placeholder="Digite o código ou a descrição" [options]="busca.items()" [ngModel]="escolhido()" (ngModelChange)="escolherMaterial($event)"
              [loading]="busca.loading() || buscandoMaterial()" [status]="busca.status()" [minLength]="2" [clearable]="true" (search)="busca.search($event)" (loadMore)="busca.loadNext()" (retry)="busca.retry()"></geo-autocomplete>
          } @else {
            <geo-select label="Incluir material" [placeholder]="idOrigem() ? 'Buscar no saldo do estoque' : 'Escolha o estoque primeiro'" [options]="opcoesSaldo()" [value]="escolhido()"
              (valueChange)="escolherSaldo($event)" [filter]="true" [loading]="carregandoSaldos()" [disabled]="!idOrigem()"
              [description]="idOrigem() && !carregandoSaldos() && !saldos().length ? 'Este estoque não tem saldo.' : undefined" />
          }

          @if (linhas().length) {
            <ul class="ns-lista" aria-label="Materiais da operação">
              @for (linha of linhas(); track linha.chave) {
                <li class="op-item" [class.op-item--erro]="acimaDoSaldo(linha)" [attr.data-op-linha]="linha.chave">
                  <div class="ns-item">
                    <div class="ns-item__material">
                      <span class="ns-item__nome" [title]="linha.material.descricao">{{ linha.material.descricao }}</span>
                      <span class="ns-item__meta">
                        <span>{{ linha.material.codigo }} · {{ unidade(linha) }}</span>
                        @if (tipo() !== 'ENTRADA') {
                          <geo-status [tone]="tomCondicao(linha.condicao)" [icon]="iconeCondicao(linha.condicao)">{{ rotuloCondicao(linha.condicao) }}</geo-status>
                        }
                        <span class="op-saldo" [class.ns-item__saldo--falta]="acimaDoSaldo(linha)">
                          Saldo {{ saldo(linha) | number: '1.0-3' }} <i class="pi pi-arrow-right" aria-label="fica"></i> <strong>{{ saldoDepois(linha) | number: '1.0-3' }}</strong>
                        </span>
                      </span>
                      @if (tipo() === 'ENTRADA') {
                        <div class="ns-pilulas" role="radiogroup" [attr.aria-label]="'Condição de ' + linha.material.codigo">
                          @for (c of condicoes; track c.value) {
                            <button type="button" class="ns-pilula ns-pilula--pequena" role="radio" [attr.aria-checked]="linha.condicao === c.value" (click)="trocarCondicao(linha, c.value)">{{ c.label }}</button>
                          }
                        </div>
                      }
                    </div>
                    @if (linha.material.detalhaSerie) {
                      <span class="ns-item__qtd op-qtd">{{ linha.series.length }} {{ linha.series.length === 1 ? 'série' : 'séries' }}</span>
                    } @else {
                      <app-quantidade-unidade class="ns-item__qtd op-qtd-unidade" [material]="linha.material" [label]="'Quantidade de ' + linha.material.codigo" [labelVisible]="false"
                        [value]="linha.quantidade" (valueChange)="alterar(linha, { quantidade: $event })"
                        [unidade]="linha.unidade ?? null" (unidadeChange)="alterar(linha, { unidade: $event })"
                        [error]="tentou() && !(quantidade(linha) > 0) ? 'Informe a quantidade.' : undefined" />
                    }
                    <geo-icon-button icon="pi pi-trash" [label]="'Tirar ' + linha.material.codigo + ' da operação'" tooltip="Tirar da operação" size="icon-sm" (pressed)="remover(linha)" />
                  </div>
                  @if (acimaDoSaldo(linha)) {
                    <p class="op-erro" role="alert">A quantidade passa do saldo disponível.</p>
                  }

                  @if (linha.material.detalhaSerie) {
                    <div class="op-series">
                      @if (tipo() === 'ENTRADA') {
                        @if (linha.series.length) {
                          <div class="op-chips">
                            @for (serie of linha.series; track serie) {
                              <button type="button" class="ns-pilula ns-pilula--pequena" aria-pressed="true" [attr.aria-label]="'Remover a série ' + serie" (click)="alternarSerie(linha, serie)">
                                <i class="pi pi-barcode" aria-hidden="true"></i>{{ serie }}<i class="pi pi-times" aria-hidden="true"></i>
                              </button>
                            }
                          </div>
                        }
                      } @else {
                        <div class="op-series__topo">
                          <span class="ns-secao__dica"><strong>{{ linha.series.length }}</strong> de {{ disponiveis(linha).length }} {{ disponiveis(linha).length === 1 ? 'série' : 'séries' }}</span>
                          <geo-button [label]="linha.series.length === disponiveis(linha).length ? 'Limpar' : 'Marcar todas'" variant="ghost" size="sm" [disabled]="!disponiveis(linha).length" (pressed)="marcarTodas(linha)" />
                        </div>
                        <div class="op-chips" role="group" [attr.aria-label]="'Séries de ' + linha.material.codigo">
                          @for (serie of disponiveis(linha); track serie) {
                            <button type="button" class="ns-pilula ns-pilula--pequena" [attr.aria-pressed]="linha.series.includes(serie)" (click)="alternarSerie(linha, serie)">
                              <i class="pi pi-barcode" aria-hidden="true"></i>{{ serie }}
                            </button>
                          }
                        </div>
                      }
                      <div class="op-colar">
                        <geo-textarea [label]="tipo() === 'ENTRADA' ? 'Números de série' : 'Colar séries'" [rows]="2" placeholder="Uma por linha, ou separadas por vírgula" [value]="textoSeries()[linha.chave] ?? ''" (valueChange)="digitarSeries(linha, $event)"
                          [error]="tentou() && !linha.series.length ? 'Informe ao menos uma série.' : undefined" />
                        <geo-button [label]="tipo() === 'ENTRADA' ? 'Incluir' : 'Marcar'" icon="pi pi-plus" variant="outline" [disabled]="!(textoSeries()[linha.chave] ?? '').trim()" (pressed)="incluirSeries(linha)" />
                      </div>
                    </div>
                  }
                </li>
              }
            </ul>
          } @else {
            <div class="ns-vazio">
              <i class="pi pi-box" aria-hidden="true"></i>
              <span>Nenhum material ainda. Busque acima para incluir e veja o saldo antes e depois.</span>
            </div>
          }
        </section>

        <section class="ns-secao" aria-labelledby="op-motivo">
          <h3 id="op-motivo" class="ns-secao__titulo"><i class="pi pi-comment" aria-hidden="true"></i>{{ tipo() === 'TRANSFERENCIA' ? 'Observação' : 'Motivo e observação' }}</h3>
          <div class="ns-cartao">
            @if (tipo() !== 'TRANSFERENCIA') {
              <geo-select label="Motivo" placeholder="Selecione" [options]="motivos()" [value]="motivo()" (valueChange)="motivo.set($event)" [required]="true"
                [error]="tentou() && !motivo() ? 'Escolha o motivo.' : undefined" />
            }
            <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="tamanhoObservacao" [required]="tipo() === 'BAIXA'"
              [placeholder]="tipo() === 'BAIXA' ? 'O que aconteceu com o material' : 'Nota fiscal, processo ou outro detalhe'"
              [error]="tentou() && tipo() === 'BAIXA' && !observacao().trim() ? 'Conte o que aconteceu com o material.' : undefined" />
          </div>
        </section>
      </div>

      <div drawer-footer class="ns-rodape">
        <span class="ns-rodape__resumo" aria-live="polite">
          @if (linhas().length) {
            <strong>{{ linhas().length }}</strong> {{ linhas().length === 1 ? 'material' : 'materiais' }} · total {{ total() | number: '1.0-3' }}
          }
        </span>
        <span class="ns-rodape__acoes">
          <geo-button label="Cancelar" variant="ghost" (pressed)="drawer.requestClose()" />
          <geo-button label="Registrar e fazer outra" variant="outline" [disabled]="!linhas().length || salvando()" (pressed)="registrar(true)" />
          <geo-button [label]="textos().acao" icon="pi pi-check-circle" [loading]="salvando()" [disabled]="!linhas().length" (pressed)="registrar(false)" />
        </span>
      </div>
    </geo-form-drawer>

    <geo-dialog-shell title="Assinaturas da transferência" size="md" [visible]="assinando()" (visibleChange)="assinando.set($event)">
      @if (assinando()) {
        <div class="op-assinaturas">
          <app-solicitacao-tecnica-assinatura label="Quem entrega" [value]="assinaturaEntregador()" (valueChanged)="assinaturaEntregador.set($event)" />
          <app-solicitacao-tecnica-assinatura label="Quem recebe" [value]="assinaturaRecebedor()" (valueChanged)="assinaturaRecebedor.set($event)" />
        </div>
      }
      <div dialog-footer class="geo-actions-row">
        <geo-button label="Voltar" variant="ghost" size="sm" (pressed)="assinando.set(false)" />
        <geo-button label="Confirmar transferência" icon="pi pi-check-circle" size="sm" [loading]="salvando()" [disabled]="!assinaturaEntregador() || !assinaturaRecebedor()" (pressed)="enviar()" />
      </div>
    </geo-dialog-shell>
  `
})
export class OperacaoEstoqueDrawerComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  /** Motivos do cadastro do cliente; cada um marca se vale na entrada, na baixa ou nas duas. */
  private readonly opcoesMotivo = toSignal(inject(ListasService).ativas('MOTIVO_MOVIMENTACAO_ESTOQUE').pipe(catchError(() => of([]))), { initialValue: [] });
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly drawer = viewChild(GeoFormDrawerComponent);

  readonly visible = model(false);
  readonly tipo = input<TipoOperacaoEstoque>('ENTRADA');
  readonly estoques = input<EstoqueResponse[]>([]);
  /** Operação gravada: quem abriu atualiza a lista. */
  readonly registrada = output<void>();
  /** Pediu a importação por planilha. */
  readonly importar = output<void>();

  protected readonly condicoes = CONDICOES;
  protected readonly tamanhoObservacao = TAMANHO_OBSERVACAO;
  protected readonly rotuloCondicao = rotuloCondicao;
  protected readonly tomCondicao = tomCondicao;
  protected readonly iconeCondicao = iconeCondicao;

  protected readonly idOrigem = signal<string | null>(null);
  protected readonly idDestino = signal<string | null>(null);
  protected readonly motivo = signal<MotivoMovimentacao | null>(null);
  protected readonly observacao = signal('');
  protected readonly linhas = signal<LinhaOperacao[]>([]);
  protected readonly saldos = signal<SaldoResponse[]>([]);
  private readonly series = signal<Record<string, string[]>>({});
  protected readonly textoSeries = signal<Partial<Record<number, string>>>({});
  protected readonly escolhido = signal<string | null>(null);
  protected readonly carregandoSaldos = signal(false);
  protected readonly buscandoMaterial = signal(false);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly assinando = signal(false);
  protected readonly assinaturaEntregador = signal('FISICA');
  protected readonly assinaturaRecebedor = signal('FISICA');
  private fazerOutra = false;
  private proximaChave = 1;
  private estavaAberto = false;
  private consultaSaldos = 0;
  private tipoRestaurado: TipoOperacaoEstoque | null = null;

  protected readonly busca: RemoteLookup<string> = new RemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchMaterials({ query, cursor }),
    selectedValues: () => [this.escolhido()].filter((id): id is string => !!id),
    destroyRef: this.destroyRef
  });

  /** Só em memória: as linhas podem trazer números de série (dado sensível). */
  private readonly rascunho = createFormDraft<Rascunho>({
    id: 'operacao-estoque',
    route: '/almoxarifado/movimentacoes',
    persist: false,
    read: () => ({
      tipo: this.tipo(),
      idOrigem: this.idOrigem(),
      idDestino: this.idDestino(),
      motivo: this.motivo(),
      observacao: this.observacao(),
      linhas: this.linhas()
    }),
    write: (valor) => {
      this.tipoRestaurado = valor.tipo;
      this.idOrigem.set(valor.idOrigem);
      this.idDestino.set(valor.idDestino);
      this.motivo.set(valor.motivo);
      this.observacao.set(valor.observacao);
      this.linhas.set(valor.linhas ?? []);
      this.proximaChave = Math.max(0, ...(valor.linhas ?? []).map((l) => l.chave)) + 1;
    }
  });

  protected readonly textos = computed(() => TEXTOS[this.tipo()]);
  protected readonly motivos = computed(() => {
    const contexto = this.tipo() === 'BAIXA' ? 'BAIXA' : 'ENTRADA';
    return this.opcoesMotivo().filter((o) => valeEm(o, contexto)).map((o) => ({ label: o.rotulo, value: o.codigo }));
  });
  protected readonly opcoesEstoque = computed<GeoSelectOption<string>[]>(() => this.estoques().map((e) => ({ label: e.nomeIdentificador, value: e.id })));
  protected readonly opcoesDestino = computed(() => this.opcoesEstoque().filter((o) => this.tipo() !== 'TRANSFERENCIA' || o.value !== this.idOrigem()));
  /** O saldo mostrado é o do estoque que perde (baixa e transferência) ou ganha (entrada) material. */
  private readonly idEstoqueDoSaldo = computed(() => (this.tipo() === 'ENTRADA' ? this.idDestino() : this.idOrigem()));
  /** Saldos com quantidade que ainda não estão na operação. */
  protected readonly opcoesSaldo = computed<GeoSelectOption<string>[]>(() =>
    this.saldos()
      .filter((s) => s.quantidade > 0 && !this.temLinha(s.material.id, condicaoDe(s)))
      .map((s) => ({ label: `${s.material.codigo} — ${s.material.descricao} · ${rotuloCondicao(s.condicao)} · saldo ${formatar(s.quantidade)}`, value: s.id }))
  );
  protected readonly total = computed(() => this.linhas().reduce((soma, l) => soma + this.quantidade(l), 0));
  protected readonly alterado = computed(() => !!this.linhas().length || !!this.observacao().trim() || !!this.motivo() || !!this.idOrigem() || !!this.idDestino());

  constructor() {
    this.rascunho.restore();
    effect(() => {
      const aberto = this.visible();
      const tipo = this.tipo();
      untracked(() => {
        if (aberto && !this.estavaAberto) {
          if (this.tipoRestaurado !== tipo) this.limpar();
          this.tipoRestaurado = null;
        } else if (!aberto && this.estavaAberto) {
          this.limpar();
          this.rascunho.clear();
        }
        this.estavaAberto = aberto;
      });
    });
    effect(() => {
      const id = this.idEstoqueDoSaldo();
      untracked(() => this.carregarSaldos(id));
    });
  }

  private limpar(): void {
    this.idOrigem.set(null);
    this.idDestino.set(null);
    this.motivo.set(null);
    this.limparItens();
  }

  private limparItens(): void {
    this.observacao.set('');
    this.linhas.set([]);
    this.textoSeries.set({});
    this.series.set({});
    this.tentou.set(false);
    this.assinaturaEntregador.set('FISICA');
    this.assinaturaRecebedor.set('FISICA');
  }

  private carregarSaldos(id: string | null): void {
    const consulta = ++this.consultaSaldos;
    this.saldos.set([]);
    if (!id) return this.carregandoSaldos.set(false);
    this.carregandoSaldos.set(true);
    this.almoxarifado.listarSaldos({ idEstoque: id, size: 1000 }).subscribe({
      next: (r) => {
        if (consulta !== this.consultaSaldos) return;
        this.saldos.set(r.content ?? []);
        this.carregandoSaldos.set(false);
        if (this.tipo() !== 'ENTRADA') this.linhas().filter((l) => l.material.detalhaSerie).forEach((l) => this.carregarSeries(l));
      },
      error: () => {
        if (consulta !== this.consultaSaldos) return;
        this.carregandoSaldos.set(false);
        this.notificacoes.warning('Não foi possível carregar o saldo do estoque.');
      }
    });
  }

  private chaveSeries(l: Pick<LinhaOperacao, 'material' | 'condicao'>): string {
    return `${l.material.id}|${l.condicao}`;
  }

  private carregarSeries(linha: LinhaOperacao, marcarTodas = false): void {
    const chave = this.chaveSeries(linha);
    const marcar = (lista: string[]) => {
      if (marcarTodas) this.alterar(linha, { series: lista });
    };
    const conhecidas = this.series()[chave];
    if (conhecidas) return marcar(conhecidas);
    this.almoxarifado.listarSeriais({ idEstoque: this.idOrigem(), idMaterial: linha.material.id, condicao: linha.condicao, ativo: true, size: 1000 }).subscribe({
      next: (r) => {
        const lista = (r.content ?? [])
          .filter((s) => !s.condicao || s.condicao === linha.condicao)
          .map((s) => s.numSerie)
          .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        this.series.update((atual) => ({ ...atual, [chave]: lista }));
        marcar(lista);
      },
      error: () => this.notificacoes.warning(`Não foi possível carregar as séries de ${linha.material.codigo}.`)
    });
  }

  /** As linhas dependem do saldo da origem: trocar o estoque começa a lista de novo. */
  protected trocarOrigem(id: string | null): void {
    if (id === this.idOrigem()) return;
    if (this.linhas().length) this.notificacoes.info('Os materiais saíram da lista porque o estoque mudou.');
    this.idOrigem.set(id);
    if (id === this.idDestino()) this.idDestino.set(null);
    this.linhas.set([]);
    this.series.set({});
  }

  protected inverter(): void {
    const origem = this.idOrigem();
    this.trocarOrigem(this.idDestino());
    this.idDestino.set(origem);
  }

  private temLinha(idMaterial: string, condicao: Condicao): boolean {
    return this.linhas().some((l) => l.material.id === idMaterial && l.condicao === condicao);
  }

  private incluirLinha(material: MaterialResponse, condicao: Condicao, quantidade: number | null = null): LinhaOperacao {
    const linha: LinhaOperacao = { chave: this.proximaChave++, material, condicao, quantidade, series: [] };
    this.linhas.update((ls) => [...ls, linha]);
    return linha;
  }

  /** Foca a linha nova: escolher o material e digitar a quantidade não precisa de mouse. */
  private focar(linha: LinhaOperacao): void {
    afterNextRender(() => document.querySelector<HTMLElement>(`[data-op-linha="${linha.chave}"] input, [data-op-linha="${linha.chave}"] textarea`)?.focus(), { injector: this.injector });
  }

  /** O campo volta a ficar vazio depois de escolher, pronto para o próximo material. */
  private esvaziarEscolha(valor: string): void {
    this.escolhido.set(valor);
    setTimeout(() => this.escolhido.set(null));
  }

  protected escolherSaldo(id: string | null): void {
    const saldo = this.saldos().find((s) => s.id === id);
    if (!id || !saldo) return;
    this.esvaziarEscolha(id);
    const linha = this.incluirLinha(saldo.material, condicaoDe(saldo));
    if (linha.material.detalhaSerie) this.carregarSeries(linha);
    this.focar(linha);
  }

  protected escolherMaterial(id: string | null): void {
    if (!id) return;
    this.esvaziarEscolha(id);
    this.buscandoMaterial.set(true);
    this.almoxarifado.buscarMaterialPorId(id).subscribe({
      next: (material) => {
        this.buscandoMaterial.set(false);
        if (this.temLinha(material.id, 'NOVO')) return this.notificacoes.warning(`${material.codigo} já está na lista.`);
        this.focar(this.incluirLinha(material, 'NOVO'));
      },
      error: (e) => {
        this.buscandoMaterial.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected transferirTudo(): void {
    for (const saldo of this.saldos().filter((s) => s.quantidade > 0 && !this.temLinha(s.material.id, condicaoDe(s)))) {
      const linha = this.incluirLinha(saldo.material, condicaoDe(saldo), saldo.material.detalhaSerie ? null : saldo.quantidade);
      if (linha.material.detalhaSerie) this.carregarSeries(linha, true);
    }
  }

  protected alterar(linha: LinhaOperacao, mudanca: Partial<LinhaOperacao>): void {
    this.linhas.update((ls) => ls.map((l) => (l.chave === linha.chave ? { ...l, ...mudanca } : l)));
  }

  protected trocarCondicao(linha: LinhaOperacao, condicao: Condicao | null): void {
    const nova = condicao ?? 'NOVO';
    if (nova === linha.condicao) return;
    if (this.temLinha(linha.material.id, nova)) return this.notificacoes.warning(`${linha.material.codigo} já está na lista como ${rotuloCondicao(nova).toLowerCase()}.`);
    this.alterar(linha, { condicao: nova });
  }

  protected remover(linha: LinhaOperacao): void {
    this.linhas.update((ls) => ls.filter((l) => l.chave !== linha.chave));
  }

  protected unidade(l: LinhaOperacao): string {
    return l.material.unidadeMedida || 'UN';
  }

  protected quantidade(l: LinhaOperacao): number {
    // Sempre na unidade do material: é assim que o saldo e o servidor contam.
    return l.material.detalhaSerie ? l.series.length : (paraUnidadeBase(l.material, l.quantidade, l.unidade) ?? 0);
  }

  protected saldo(l: LinhaOperacao): number {
    return this.saldos()
      .filter((s) => s.material.id === l.material.id && condicaoDe(s) === l.condicao)
      .reduce((soma, s) => soma + s.quantidade, 0);
  }

  protected saldoDepois(l: LinhaOperacao): number {
    return this.saldo(l) + (this.tipo() === 'ENTRADA' ? this.quantidade(l) : -this.quantidade(l));
  }

  protected acimaDoSaldo(l: LinhaOperacao): boolean {
    return this.tipo() !== 'ENTRADA' && !this.carregandoSaldos() && this.quantidade(l) > this.saldo(l);
  }

  protected disponiveis(l: LinhaOperacao): string[] {
    return this.series()[this.chaveSeries(l)] ?? [];
  }

  protected alternarSerie(linha: LinhaOperacao, serie: string): void {
    const series = linha.series.includes(serie) ? linha.series.filter((s) => s !== serie) : [...linha.series, serie];
    this.alterar(linha, { series });
  }

  protected marcarTodas(linha: LinhaOperacao): void {
    const todas = this.disponiveis(linha);
    this.alterar(linha, { series: linha.series.length === todas.length ? [] : [...todas] });
  }

  protected digitarSeries(linha: LinhaOperacao, valor: string | null): void {
    this.textoSeries.update((atual) => ({ ...atual, [linha.chave]: valor ?? '' }));
  }

  /** Entrada: as séries são novas. Baixa e transferência: só marca as que estão no estoque. */
  protected incluirSeries(linha: LinhaOperacao): void {
    const digitadas = [...new Set((this.textoSeries()[linha.chave] ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
    const jaUsadas = new Set(this.linhas().flatMap((l) => l.series).map((s) => s.toUpperCase()));
    const repetidas = digitadas.filter((s) => jaUsadas.has(s.toUpperCase()));
    const novas = digitadas.filter((s) => !jaUsadas.has(s.toUpperCase()));
    const noEstoque = new Map(this.disponiveis(linha).map((s) => [s.toUpperCase(), s]));
    const entrada = this.tipo() === 'ENTRADA';
    const aceitas = entrada ? novas : novas.flatMap((s) => noEstoque.get(s.toUpperCase()) ?? []);
    const fora = entrada ? [] : novas.filter((s) => !noEstoque.has(s.toUpperCase()));

    this.alterar(linha, { series: [...linha.series, ...aceitas] });
    this.digitarSeries(linha, fora.join('\n'));
    if (repetidas.length) this.notificacoes.warning(`Já na lista: ${repetidas.join(', ')}.`);
    if (fora.length) this.notificacoes.warning(`Fora deste estoque: ${fora.join(', ')}.`);
  }

  private problema(): string | null {
    const tipo = this.tipo();
    if (tipo !== 'ENTRADA' && !this.idOrigem()) return 'Escolha o estoque.';
    if (tipo !== 'BAIXA' && !this.idDestino()) return 'Escolha o estoque.';
    if (tipo !== 'TRANSFERENCIA' && !this.motivo()) return 'Escolha o motivo.';
    if (tipo === 'BAIXA' && !this.observacao().trim()) return 'Conte o que aconteceu com o material.';
    for (const l of this.linhas()) {
      if (!(this.quantidade(l) > 0)) return `${l.material.codigo}: informe ${l.material.detalhaSerie ? 'as séries' : 'a quantidade'}.`;
      if (this.acimaDoSaldo(l)) return `${l.material.codigo}: a quantidade passa do saldo disponível.`;
    }
    return null;
  }

  protected async registrar(fazerOutra: boolean): Promise<void> {
    if (this.salvando()) return;
    this.tentou.set(true);
    const problema = this.problema();
    if (problema) return this.notificacoes.warning(problema);
    this.fazerOutra = fazerOutra;

    if (this.tipo() === 'TRANSFERENCIA') return this.assinando.set(true);
    if (this.tipo() === 'BAIXA') {
      const n = this.linhas().length;
      const ok = await this.confirmacao.confirm({
        title: 'Registrar baixa',
        message: `A baixa é definitiva: ${n} ${n === 1 ? 'material sai' : 'materiais saem'} do saldo agora.`,
        confirmLabel: 'Registrar baixa',
        variant: 'destructive'
      });
      if (!ok) return;
    }
    this.enviar();
  }

  private pedido(): MovimentacaoBulkRequest {
    const transferencia = this.tipo() === 'TRANSFERENCIA';
    return {
      idEstoqueOrigem: this.tipo() === 'ENTRADA' ? undefined : this.idOrigem()!,
      idEstoqueDestino: this.tipo() === 'BAIXA' ? undefined : this.idDestino()!,
      itens: this.linhas().flatMap((l) =>
        l.material.detalhaSerie
          ? l.series.map((numSerie): ItemMovimentacaoRequest => ({ idMaterial: l.material.id, quantidade: 1, numSerie, condicao: l.condicao }))
          : [{ idMaterial: l.material.id, quantidade: l.quantidade!, condicao: l.condicao, unidade: l.unidade || undefined } as ItemMovimentacaoRequest]
      ),
      motivo: this.motivo() ?? undefined,
      observacao: this.observacao().trim() || undefined,
      assinaturaEntregador: transferencia ? this.assinaturaEntregador() : undefined,
      assinaturaRecebedor: transferencia ? this.assinaturaRecebedor() : undefined
    };
  }

  protected enviar(): void {
    if (this.salvando()) return;
    this.salvando.set(true);
    const pedido = this.pedido();
    const envio: Observable<unknown> =
      this.tipo() === 'ENTRADA'
        ? this.almoxarifado.registrarEntradaLote(pedido)
        : this.tipo() === 'BAIXA'
          ? this.almoxarifado.registrarBaixaLote(pedido)
          : this.almoxarifado.registrarTransferenciaLote(pedido);
    envio.subscribe({
      next: () => {
        this.salvando.set(false);
        this.assinando.set(false);
        this.notificacoes.success(this.textos().sucesso);
        this.registrada.emit();
        if (!this.fazerOutra) return this.visible.set(false);
        this.limparItens();
        this.carregarSaldos(this.idEstoqueDoSaldo());
        this.drawer()?.focusFirstField();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e), { title: `Não foi possível registrar: ${this.textos().titulo.toLowerCase()}` });
      }
    });
  }
}

function condicaoDe(saldo: SaldoResponse): Condicao {
  return saldo.condicao === 'SUCATA' ? 'SUCATA' : 'NOVO';
}

function formatar(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
