import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CesAutocompleteComponent,
  CesBooleanControlComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesFormDrawerComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesTextInputComponent,
  NotificationService
} from '@ces/ui';
import { LookupStore } from '../../../core/lookup';
import { SaldoPecaFrota } from '../../../core/models/frota-pneu.models';
import {
  ItemManutencao,
  OpcoesFrota,
  OrdemServicoDetalhe,
  OrigemPeca,
  PecaOrdemServico,
  ServicoOrdemServico
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { FrotaService } from '../../../core/services/frota.service';
import { casasDecimais } from '../estoque/frota-estoque.util';
import { acessoFrota } from '../shared/frota-acesso';

export type TipoLancamento = 'servico' | 'peca';

/** Unidades mais comuns na oficina; a pessoa pode digitar outra. */
const UNIDADES = ['UN', 'L', 'KG', 'M', 'JG', 'PC', 'CX', 'KIT'];

/**
 * Inclusão e edição de um serviço (mão de obra) ou de uma peça da OS. Na oficina interna o
 * mecânico é escolhido entre os colaboradores; na externa é um nome livre opcional.
 */
@Component({
  selector: 'app-frota-os-lancamento',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    FormsModule,
    RouterLink,
    CesAutocompleteComponent,
    CesBooleanControlComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesFormDrawerComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesTextInputComponent,
    NgTemplateOutlet
  ],
  styles: `
    .catalogo-acao { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; margin-top: -0.5rem;
      font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
  `,
  template: `
    <ces-form-drawer [(visible)]="visivel" [title]="titulo()" [description]="descricao()"
      [dirty]="alterado()" [loading]="salvando()" size="sm">
      <div class="ces-form-stack">
        @if (tipo() === 'servico') {
          @if (usaCatalogo()) {
            <!-- Mão de obra da lista de itens de manutenção: o mesmo serviço não ganha nomes diferentes. -->
            <ces-select label="Serviço" [required]="true" [options]="opcoesItens()" [(value)]="idItemCatalogo" [filter]="true"
              filterPlaceholder="Procurar serviço" [loading]="carregandoItens()" [error]="erro('catalogo')"
              description="Itens de manutenção do tipo mão de obra."></ces-select>
            <ng-container *ngTemplateOutlet="naoAchou"></ng-container>
          } @else {
            <ces-text-input label="Serviço" [required]="true" [(value)]="nome" [maxlength]="300" [error]="erro('nome')"
              description="Lançado antes da lista de itens: o nome fica como foi digitado."></ces-text-input>
          }
          @if (interna()) {
            <ces-autocomplete label="Mecânico" [required]="true" [options]="opcoesMecanico()" [status]="statusBusca()"
              [loading]="statusBusca() === 'loading'" [ngModel]="idMecanico()" (ngModelChange)="idMecanico.set($event)"
              (search)="buscarMecanico($event)" [error]="erro('mecanico')"
              description="Oficina interna: escolha o colaborador que fez o serviço."></ces-autocomplete>
          } @else {
            <ces-text-input label="Mecânico" [(value)]="mecanicoNome" [maxlength]="120" [showOptional]="true"
              description="Oficina externa: o nome de quem fez, se a oficina informou."></ces-text-input>
          }
          <div class="ces-form-grid">
            <ces-number-input label="Horas / quantidade" [required]="true" [(value)]="quantidade" [min]="0"
              [maxFractionDigits]="3" [error]="erro('quantidade')"></ces-number-input>
            <ces-number-input label="Valor unitário" mode="currency" [required]="true" [(value)]="valorUnitario" [min]="0"
              [maxFractionDigits]="4" [error]="erro('valor')"></ces-number-input>
          </div>
        } @else {
          <ces-select label="Origem" [required]="true" [options]="origens()" [(value)]="origem"
            [description]="origem() === 'COMPRA' ? 'Entra na lista de peças da compra.' : usaAlmoxarifado() ? 'Sai do almoxarifado pelo custo médio. Tirar da OS devolve ao estoque.' : 'Só registra a origem; não dá baixa no estoque.'"></ces-select>
          @if (semSaldoNoEstoque()) {
            <ces-callout tone="warning" icon="pi pi-exclamation-triangle" [dense]="true" title="Nenhuma peça com saldo na oficina">
              Sem saldo, a peça abaixo fica só registrada na OS e não baixa do estoque. Lance a entrada em
              <a routerLink="/frota/estoque">Estoque da oficina</a> ou escolha a origem Compra.
            </ces-callout>
          }
          @if (usaAlmoxarifado()) {
            <ces-select label="Peça do almoxarifado" [required]="true" [options]="opcoesSaldo()" [(value)]="saldoEscolhido" [filter]="true"
              filterPlaceholder="Código, nome ou almoxarifado" [loading]="carregandoSaldos()" [error]="erro('saldo')" [description]="descricaoSaldo()"></ces-select>
            <ces-number-input label="Quantidade" [required]="true" [(value)]="quantidade" [min]="0"
              [maxFractionDigits]="casasSaldo()" [suffix]="saldoAtual() ? ' ' + saldoAtual()!.unidade : ''" [error]="erroQuantidadeSaldo()"></ces-number-input>
          } @else if (usaCatalogo()) {
            <!-- Peça da lista de itens de manutenção: a mesma peça não ganha cinco nomes diferentes. -->
            <ces-select label="Peça ou consumível" [required]="true" [options]="opcoesItens()" [(value)]="idItemCatalogo" [filter]="true"
              filterPlaceholder="Procurar peça" [loading]="carregandoItens()" [error]="erro('catalogo')"
              description="Itens de manutenção do tipo peça ou consumível."></ces-select>
            <ng-container *ngTemplateOutlet="naoAchou"></ng-container>
            <div class="ces-form-grid">
              <ces-number-input label="Quantidade" [required]="true" [(value)]="quantidade" [min]="0"
                [maxFractionDigits]="3" [error]="erro('quantidade')"></ces-number-input>
              <ces-select label="Unidade" [required]="true" [options]="unidades()" [(value)]="unidade" [filter]="true"
                [error]="erro('unidade')"></ces-select>
            </div>
            <ces-number-input label="Valor unitário" mode="currency" [required]="true" [(value)]="valorUnitario" [min]="0"
              [maxFractionDigits]="4" [error]="erro('valor')"></ces-number-input>
          } @else {
            <ces-text-input label="Peça ou consumível" [required]="true" [(value)]="nome" [maxlength]="300"
              placeholder="Ex.: filtro de óleo" [error]="erro('nome')"
              description="Lançada antes da lista de itens: o nome fica como foi digitado."></ces-text-input>
            <ces-text-input label="Código" [(value)]="codigo" [maxlength]="60" [showOptional]="true"></ces-text-input>
            <div class="ces-form-grid">
              <ces-number-input label="Quantidade" [required]="true" [(value)]="quantidade" [min]="0"
                [maxFractionDigits]="3" [error]="erro('quantidade')"></ces-number-input>
              <ces-select label="Unidade" [required]="true" [options]="unidades()" [(value)]="unidade" [filter]="true"
                [error]="erro('unidade')"></ces-select>
            </div>
            <ces-number-input label="Valor unitário" mode="currency" [required]="true" [(value)]="valorUnitario" [min]="0"
              [maxFractionDigits]="4" [error]="erro('valor')"></ces-number-input>
          }
        }
        @if (subtotal() !== null) {
          <ces-callout tone="neutral" [dense]="true">Subtotal: {{ subtotal() | currency: 'BRL' }}</ces-callout>
        }
        @if (pedeSemCusto()) {
          <ces-boolean-control kind="toggle" label="Sem custo" [(value)]="semCusto"
            [description]="semCusto() ? 'Garantia, cortesia ou doação: o valor zero é de propósito.' : 'Sem valor ainda: a OS concluída fica com valores pendentes até lançar o valor.'"></ces-boolean-control>
        }
        @if (erroServidor()) {
          <ces-callout tone="danger" [dense]="true">{{ erroServidor() }}</ces-callout>
        }
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="editando() ? 'Salvar alterações' : (tipo() === 'servico' ? 'Adicionar serviço' : 'Adicionar peça')"
          [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>

    <ng-template #naoAchou>
      <div class="catalogo-acao">
        @if (acesso.configurar()) {
          <span>Não achou?</span>
          <ces-button variant="link" size="sm" icon="pi pi-plus" [label]="tipo() === 'servico' ? 'Cadastrar mão de obra' : 'Cadastrar peça'"
            (pressed)="abrirCadastroItem()"></ces-button>
        } @else {
          <span>Não achou? Peça o cadastro a quem administra a frota.</span>
        }
      </div>
    </ng-template>

    <ces-form-drawer [(visible)]="cadastroItemAberto" [title]="tipo() === 'servico' ? 'Cadastrar mão de obra' : 'Cadastrar peça'"
      description="Entra nos itens de manutenção da frota e já fica escolhido aqui." [dirty]="!!novoItemNome().trim()"
      [loading]="salvandoItem()" size="sm">
      <div class="ces-form-stack">
        <ces-text-input label="Nome" [required]="true" [(value)]="novoItemNome" [maxlength]="120"
          [placeholder]="tipo() === 'servico' ? 'Ex.: Alinhamento e balanceamento' : 'Ex.: Fluido de freio DOT 4'"
          [error]="tentouItem() && !novoItemNome().trim() ? 'Informe o nome.' : undefined"
          description="Confira na lista antes: o mesmo item com outro nome atrapalha os relatórios."></ces-text-input>
        <ces-select label="Natureza" [required]="true" [options]="naturezas()" [(value)]="novoItemNatureza" [filter]="true"
          [error]="tentouItem() && !novoItemNatureza() ? 'Escolha a natureza.' : undefined"></ces-select>
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="cadastroItemAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Cadastrar" [loading]="salvandoItem()" (pressed)="cadastrarItem()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaOsLancamentoComponent {
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);
  private readonly estoque = inject(FrotaPneuService);
  protected readonly acesso = acessoFrota();

  readonly visivel = model(false);
  readonly tipo = input<TipoLancamento>('servico');
  readonly detalhe = input.required<OrdemServicoDetalhe>();
  readonly opcoes = input<OpcoesFrota | null>(null);
  /** Lançamento em edição; nulo inclui um novo. */
  readonly servico = input<ServicoOrdemServico | null>(null);
  readonly peca = input<PecaOrdemServico | null>(null);
  readonly salvo = output<OrdemServicoDetalhe>();

  /** As unidades comuns e, na edição, a unidade já gravada se ela for outra. */
  protected readonly unidades = computed<CesSelectOption<string>[]>(() => {
    const gravada = this.peca()?.unidade;
    const lista = gravada && !UNIDADES.includes(gravada) ? [...UNIDADES, gravada] : UNIDADES;
    return lista.map((u) => ({ label: u, value: u }));
  });

  protected readonly nome = signal('');
  protected readonly idItem = signal<string | null>(null);
  protected readonly idMecanico = signal<string | null>(null);
  protected readonly mecanicoNome = signal('');
  protected readonly codigo = signal('');
  protected readonly origem = signal<OrigemPeca | null>('ESTOQUE');
  protected readonly unidade = signal<string | null>('UN');
  protected readonly quantidade = signal<number | null>(1);
  protected readonly valorUnitario = signal<number | null>(null);
  /** Valor zero de propósito (garantia, cortesia): não deixa a OS com valores pendentes. */
  protected readonly semCusto = signal(false);
  protected readonly opcoesMecanico = signal<CesSelectOption<string>[]>([]);
  private readonly saldos = signal<SaldoPecaFrota[]>([]);
  protected readonly carregandoSaldos = signal(false);
  /** Chave idEstoque:idMaterial da peça escolhida no almoxarifado. */
  protected readonly saldoEscolhido = signal<string | null>(null);
  protected readonly statusBusca = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  protected readonly tentouSalvar = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erroServidor = signal<string | null>(null);
  private readonly snapshot = signal('');

  /** Itens de manutenção ativos: peça ou mão de obra, conforme o lançamento. */
  private readonly itensCadastro = signal<ItemManutencao[]>([]);
  protected readonly carregandoItens = signal(false);
  protected readonly idItemCatalogo = signal<string | null>(null);
  protected readonly itemCatalogo = computed(() => this.itensCadastro().find((i) => i.id === this.idItemCatalogo()) ?? null);
  protected readonly opcoesItens = computed<CesSelectOption<string>[]>(() => {
    const tipo = this.tipo() === 'servico' ? 'MAO_DE_OBRA' : 'PECA';
    return this.itensCadastro()
      .filter((i) => (i.tipo ?? 'MAO_DE_OBRA') === tipo && (i.ativo || i.id === this.idItemCatalogo()))
      .map((i) => ({ label: i.nome, value: i.id }));
  });
  /** Lançamento novo escolhe da lista; o antigo, sem item, segue com o nome digitado. */
  protected readonly usaCatalogo = computed(() => {
    if (this.tipo() === 'servico') {
      const atual = this.servico();
      return !atual || !!atual.idItemManutencao;
    }
    if (this.usaAlmoxarifado()) return false;
    const atual = this.peca();
    return !atual || !!atual.idItemManutencao;
  });
  protected readonly cadastroItemAberto = signal(false);
  protected readonly novoItemNome = signal('');
  protected readonly novoItemNatureza = signal<string | null>(null);
  protected readonly salvandoItem = signal(false);
  protected readonly tentouItem = signal(false);
  protected readonly naturezas = computed<CesSelectOption<string>[]>(() =>
    (this.opcoes()?.naturezasServico ?? []).map((n) => ({ label: n.rotulo, value: n.valor })));

  protected readonly saldoAtual = computed(() => this.saldos().find((s) => this.chaveSaldo(s) === this.saldoEscolhido()) ?? null);
  /** Peça do estoque sai do almoxarifado; o lançamento antigo, sem peça do catálogo, continua livre. */
  protected readonly usaAlmoxarifado = computed(() => {
    if (this.tipo() !== 'peca' || this.origem() !== 'ESTOQUE' || !this.acesso.verEstoque()) return false;
    const atual = this.peca();
    if (atual && !atual.idEstoque) return false;
    return this.saldos().length > 0 || this.carregandoSaldos() || !!atual;
  });
  /** Escolheu Estoque, mas não há nada para baixar: a pessoa precisa saber antes de lançar. */
  protected readonly semSaldoNoEstoque = computed(() =>
    this.tipo() === 'peca' && this.origem() === 'ESTOQUE' && this.acesso.verEstoque() && !this.peca() && !this.carregandoSaldos() && !this.saldos().some((s) => s.quantidade > 0));
  protected readonly opcoesSaldo = computed<CesSelectOption<string>[]>(() =>
    this.saldos().filter((s) => s.quantidade > 0 || this.chaveSaldo(s) === this.saldoEscolhido()).map((s) => ({
      label: `${s.codigo} · ${s.descricao} · ${s.estoque} · ${this.disponivel(s).toLocaleString('pt-BR')} ${s.unidade}`,
      value: this.chaveSaldo(s)
    }))
  );
  /** O que a peça escolhida tem à mão, com o que esta OS devolve na edição. */
  protected readonly descricaoSaldo = computed(() => {
    const s = this.saldoAtual();
    if (!s) return 'Peças com saldo nos almoxarifados da frota.';
    const custo = (s.custoMedio ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `${s.estoque}: ${this.disponivel(s).toLocaleString('pt-BR')} ${s.unidade} disponíveis · custo médio ${custo}`;
  });
  protected readonly casasSaldo = computed(() => {
    const s = this.saldoAtual();
    return s && Number.isInteger(s.quantidade) ? casasDecimais(s.unidade) : 3;
  });
  /** Passar do saldo aparece ao digitar; os demais erros, ao tentar salvar. */
  protected readonly erroQuantidadeSaldo = computed(() => {
    const s = this.saldoAtual();
    const q = this.quantidade();
    if (s && q != null && q > this.disponivel(s)) return this.erros()['quantidade'];
    return this.erro('quantidade');
  });
  protected readonly editando = computed(() => (this.tipo() === 'servico' ? this.servico() : this.peca()) !== null);
  protected readonly interna = computed(() => this.detalhe().ordem.tipoOficina === 'INTERNA');
  protected readonly titulo = computed(() =>
    this.tipo() === 'servico' ? (this.editando() ? 'Editar serviço' : 'Adicionar serviço') : this.editando() ? 'Editar peça' : 'Adicionar peça'
  );
  protected readonly descricao = computed(() => {
    const os = this.detalhe().ordem;
    return `OS ${os.numero} · ${os.veicular ? os.placa : os.descricaoEquipamento} · oficina ${this.interna() ? 'interna' : 'externa'}.`;
  });
  protected readonly itensOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.detalhe().itens.map((i) => ({ label: i.nome, value: i.idItem }))
  );
  protected readonly origens = computed<CesSelectOption<OrigemPeca>[]>(() =>
    (this.opcoes()?.origensPeca ?? [
      { valor: 'ESTOQUE' as OrigemPeca, rotulo: 'Estoque' },
      { valor: 'COMPRA' as OrigemPeca, rotulo: 'Compra' }
    ]).map((o) => ({ label: o.rotulo, value: o.valor }))
  );
  protected readonly subtotal = computed(() => {
    const q = this.quantidade();
    const v = this.usaAlmoxarifado() ? this.saldoAtual()?.custoMedio ?? null : this.valorUnitario();
    return q !== null && v !== null ? Math.round(q * v * 100) / 100 : null;
  });

  /**
   * "Sem custo" só aparece no lançamento de valor zero. A mão de obra da oficina interna pode ficar
   * zerada sem pendência (é da casa), então ali não pergunta.
   */
  protected readonly pedeSemCusto = computed(() =>
    this.subtotal() === 0 && !(this.tipo() === 'servico' && this.interna()));

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (this.usaAlmoxarifado()) {
      const saldo = this.saldoAtual();
      const qtd = this.quantidade();
      if (!saldo) e['saldo'] = 'Escolha a peça.';
      if (qtd === null || qtd <= 0) e['quantidade'] = 'A quantidade deve ser maior que zero.';
      else if (saldo && qtd > this.disponivel(saldo)) e['quantidade'] = `Maior que o saldo (${this.disponivel(saldo).toLocaleString('pt-BR')} ${saldo.unidade}).`;
      return e;
    }
    if (this.usaCatalogo()) {
      if (!this.itemCatalogo()) e['catalogo'] = this.tipo() === 'servico' ? 'Escolha o serviço na lista.' : 'Escolha a peça na lista.';
    } else if (!this.nome().trim()) {
      e['nome'] = this.tipo() === 'servico' ? 'Informe o serviço.' : 'Informe a peça.';
    }
    if (this.tipo() === 'servico' && this.interna() && !this.idMecanico()) e['mecanico'] = 'Escolha o mecânico.';
    const q = this.quantidade();
    if (q === null || q <= 0) e['quantidade'] = 'A quantidade deve ser maior que zero.';
    if (this.valorUnitario() === null) e['valor'] = 'Informe o valor unitário (pode ser zero).';
    if (this.tipo() === 'peca' && !this.unidade()) e['unidade'] = 'Escolha a unidade.';
    return e;
  });

  protected readonly alterado = computed(() => this.snapshot() !== this.estado());

  constructor() {
    effect(() => {
      if (this.visivel()) {
        untracked(() => this.preencher());
      }
    });
  }

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }

  protected buscarMecanico(termo: string): void {
    this.statusBusca.set('loading');
    this.lookups.searchCollaborators({ query: termo, limit: 20 }).subscribe({
      next: (pagina) => {
        this.opcoesMecanico.set(pagina.items.map((i) => ({ label: i.label, value: i.value })));
        this.statusBusca.set(pagina.items.length ? 'success' : 'empty');
      },
      error: () => this.statusBusca.set('error')
    });
  }

  protected abrirCadastroItem(): void {
    this.novoItemNome.set('');
    this.novoItemNatureza.set(null);
    this.tentouItem.set(false);
    this.cadastroItemAberto.set(true);
  }

  /** Item novo: entra no cadastro da frota com o tipo deste lançamento e já fica escolhido. */
  protected cadastrarItem(): void {
    this.tentouItem.set(true);
    if (!this.novoItemNome().trim() || !this.novoItemNatureza()) return;
    this.salvandoItem.set(true);
    this.frota.salvarItemManutencao({
      nome: this.novoItemNome().trim(),
      natureza: this.novoItemNatureza()!,
      descricao: null,
      diasRepeticao: null,
      tipo: this.tipo() === 'servico' ? 'MAO_DE_OBRA' : 'PECA'
    }).subscribe({
      next: (item) => {
        this.salvandoItem.set(false);
        this.itensCadastro.update((lista) => [...lista, item].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
        this.idItemCatalogo.set(item.id);
        this.cadastroItemAberto.set(false);
        this.notificacoes.success(`${item.nome} cadastrado nos itens de manutenção.`);
      },
      error: (e) => {
        this.salvandoItem.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private carregarItens(): void {
    this.carregandoItens.set(true);
    this.frota.itensManutencao().subscribe({
      next: (p) => (this.itensCadastro.set(p.content), this.carregandoItens.set(false)),
      error: () => (this.itensCadastro.set([]), this.carregandoItens.set(false))
    });
  }

  protected salvar(): void {
    this.tentouSalvar.set(true);
    this.erroServidor.set(null);
    if (Object.keys(this.erros()).length) return;
    const os = this.detalhe().ordem;
    this.salvando.set(true);
    const requisicao =
      this.tipo() === 'servico'
        ? this.salvarServico(os.id)
        : this.salvarPeca(os.id);
    requisicao.subscribe({
      next: (atualizada) => {
        this.salvando.set(false);
        const finalizou = !!os.baixaPendente && atualizada.ordem.situacao === 'CONCLUIDA' && !atualizada.ordem.baixaPendente;
        this.notificacoes.success(finalizou ? 'Último valor lançado: OS finalizada.' : this.mensagemSucesso());
        this.snapshot.set(this.estado());
        this.visivel.set(false);
        this.salvo.emit(atualizada);
      },
      error: (erro) => {
        this.salvando.set(false);
        this.erroServidor.set(getErrorMessage(erro));
      }
    });
  }

  private mensagemSucesso(): string {
    if (this.usaAlmoxarifado()) {
      return this.editando() ? 'Peça atualizada e estoque acertado.' : `Peça adicionada e baixada do ${this.saldoAtual()?.estoque ?? 'estoque'}.`;
    }
    return this.editando() ? 'Lançamento atualizado.' : this.tipo() === 'servico' ? 'Serviço adicionado.' : 'Peça adicionada.';
  }

  private salvarServico(idOs: string) {
    const item = this.usaCatalogo() ? this.itemCatalogo() : null;
    const request = {
      descricao: item ? item.nome : this.nome().trim(),
      idItemManutencao: item ? item.id : this.idItem(),
      idMecanico: this.interna() ? this.idMecanico() : null,
      mecanicoNome: this.interna() ? null : this.mecanicoNome().trim() || null,
      quantidade: this.quantidade()!,
      valorUnitario: this.valorUnitario()!,
      semCusto: this.pedeSemCusto() && this.semCusto()
    };
    const atual = this.servico();
    return atual ? this.frota.alterarServicoOs(idOs, atual.id, request) : this.frota.lancarServicoOs(idOs, request);
  }

  /** Na edição, a quantidade já lançada volta ao saldo antes da nova saída. */
  private devolvida(s: SaldoPecaFrota): number {
    const atual = this.peca();
    return atual?.idMaterial === s.idMaterial && atual?.idEstoque === s.idEstoque ? atual.quantidade : 0;
  }

  private disponivel(s: SaldoPecaFrota): number {
    return s.quantidade + this.devolvida(s);
  }

  private chaveSaldo(s: SaldoPecaFrota): string {
    return `${s.idEstoque}:${s.idMaterial}`;
  }

  private carregarSaldos(): void {
    if (!this.acesso.verEstoque()) return;
    this.carregandoSaldos.set(true);
    this.saldos.set([]);
    this.estoque.saldos(null).subscribe({
      next: (s) => (this.saldos.set(s), this.carregandoSaldos.set(false)),
      error: () => (this.saldos.set([]), this.carregandoSaldos.set(false))
    });
  }

  private salvarPeca(idOs: string) {
    const saldo = this.usaAlmoxarifado() ? this.saldoAtual() : null;
    const item = !saldo && this.usaCatalogo() ? this.itemCatalogo() : null;
    const request = item ? {
      descricao: item.nome,
      codigo: null,
      origem: this.origem() ?? 'COMPRA',
      quantidade: this.quantidade()!,
      unidade: this.unidade()!,
      valorUnitario: this.valorUnitario()!,
      idItemManutencao: item.id
    } : saldo ? {
      descricao: saldo.descricao,
      codigo: saldo.codigo,
      origem: 'ESTOQUE' as OrigemPeca,
      quantidade: this.quantidade()!,
      unidade: saldo.unidade,
      valorUnitario: null,
      idMaterial: saldo.idMaterial,
      idEstoque: saldo.idEstoque
    } : {
      descricao: this.nome().trim(),
      codigo: this.codigo().trim() || null,
      origem: this.origem() ?? 'ESTOQUE',
      quantidade: this.quantidade()!,
      unidade: this.unidade()!,
      valorUnitario: this.valorUnitario()!
    };
    const atual = this.peca();
    const comMarca = { ...request, semCusto: this.pedeSemCusto() && this.semCusto() };
    return atual ? this.frota.alterarPecaOs(idOs, atual.id, comMarca) : this.frota.lancarPecaOs(idOs, comMarca);
  }

  private preencher(): void {
    this.tentouSalvar.set(false);
    this.erroServidor.set(null);
    this.statusBusca.set('idle');
    const s = this.servico();
    const p = this.peca();
    this.carregarItens();
    if (this.tipo() === 'servico') {
      this.idItemCatalogo.set(s?.idItemManutencao ?? null);
      this.nome.set(s?.descricao ?? '');
      this.idItem.set(s?.idItemManutencao ?? (this.detalhe().itens.length === 1 ? this.detalhe().itens[0].idItem : null));
      this.idMecanico.set(s?.idMecanico ?? null);
      this.mecanicoNome.set(s && !s.idMecanico ? (s.mecanico ?? '') : '');
      this.opcoesMecanico.set(s?.idMecanico ? [{ label: s.mecanico ?? 'Mecânico', value: s.idMecanico }] : []);
      this.quantidade.set(s?.quantidade ?? 1);
      this.valorUnitario.set(s?.valorUnitario ?? null);
      this.semCusto.set(!!s?.semCusto);
    } else {
      this.carregarSaldos();
      this.saldoEscolhido.set(p?.idMaterial && p.idEstoque ? `${p.idEstoque}:${p.idMaterial}` : null);
      this.idItemCatalogo.set(p?.idItemManutencao ?? null);
      this.nome.set(p?.descricao ?? '');
      this.codigo.set(p?.codigo ?? '');
      this.origem.set(p?.origem ?? 'ESTOQUE');
      this.unidade.set(p?.unidade ?? 'UN');
      this.quantidade.set(p?.quantidade ?? 1);
      this.valorUnitario.set(p?.valorUnitario ?? null);
      this.semCusto.set(!!p?.semCusto);
    }
    this.snapshot.set(this.estado());
  }

  private estado(): string {
    return JSON.stringify([
      this.saldoEscolhido(), this.idItemCatalogo(), this.nome(), this.idItem(), this.idMecanico(), this.mecanicoNome(), this.codigo(), this.origem(),
      this.unidade(), this.quantidade(), this.valorUnitario(), this.semCusto()
    ]);
  }
}
