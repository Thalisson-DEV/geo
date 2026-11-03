import { ChangeDetectionStrategy, Component, computed, inject, signal, input } from '@angular/core';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesCellDirective,
  CesConfirmationService,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesMultiSelectComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { Observable } from 'rxjs';
import {
  CarteiraAprovacao,
  CategoriaProdutoAbastecimento,
  CombustivelPosto,
  PostoAbastecimento,
  ProdutoAbastecimento,
  ROTULO_CATEGORIA_PRODUTO,
  UnidadeProdutoAbastecimento
} from '../../../core/models/frota-abastecimento.models';
import { FornecedorFrota, VeiculoFrotaResumo, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { basesFrota } from '../shared/frota-lista';
import { formatarWhatsapp } from '../abastecimentos/frota-abastecimento.util';
import { FrotaPrecosPostoDrawerComponent } from './frota-precos-posto-drawer.component';

type Estado = 'loading' | 'ready' | 'empty';

const COMBUSTIVEIS: CesSelectOption<CombustivelPosto>[] = [
  { label: 'Diesel S10', value: 'DIESEL_S10' },
  { label: 'Diesel S500', value: 'DIESEL_S500' },
  { label: 'Gasolina', value: 'GASOLINA' },
  { label: 'Etanol', value: 'ETANOL' },
  { label: 'GNV', value: 'GNV' }
];

/**
 * Configuração do abastecimento: quem aprova cada placa, os postos (com o WhatsApp do aviso e o
 * fornecedor da fatura) e os produtos (combustíveis, ARLA, óleos e fluidos).
 */
@Component({
  selector: 'app-frota-config-abastecimento',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesButtonComponent,
    CesCalloutComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesMultiSelectComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent,
    CesTextareaComponent,
    FrotaPrecosPostoDrawerComponent
  ],
  styles: `
    .secoes { display: flex; flex-direction: column; gap: var(--ces-space-6, 1.5rem); }
    .placas { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
    .placa { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: 0.02em; }
    .mais { color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .apoio { color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .pessoa { display: flex; flex-direction: column; gap: 0.125rem; }
    .atalho-base { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; align-items: end; }
  `,
  template: `
    <div class="secoes">
      @if (mostra('aprovadores')) {
      @if (placasSemAprovador().length && !carregando()) {
        <ces-callout tone="warning" icon="pi pi-exclamation-triangle"
          [title]="placasSemAprovador().length === 1 ? '1 placa sem ninguém para aprovar' : placasSemAprovador().length + ' placas sem ninguém para aprovar'">
          Os pedidos dessas placas ficam parados na fila: {{ resumoSemAprovador() }}. Inclua-as na carteira de algum aprovador.
        </ces-callout>
      }

      <ces-data-table title="Quem aprova cada placa"
        description="Só quem tem a placa na carteira vê e aprova o pedido. Placa nova numa base não entra sozinha."
        storageKey="frota-abastecimento-carteiras" searchPlaceholder="Filtrar aprovadores" [columns]="colunasCarteira" [rows]="carteiras()"
        [rowKey]="chaveCarteira" [state]="estado(carteiras())" stateTitle="Ninguém aprova abastecimentos ainda"
        stateDescription="Dê a permissão de aprovar abastecimentos no perfil de acesso de quem aprova; a pessoa aparece aqui para receber as placas."
        [rowClickable]="acesso.configurarAbastecimento()" (rowActivate)="abrirCarteira($event)">
        <ng-template cesCell="nome" let-row>
          <span class="pessoa"><strong>{{ row.nome }}</strong>@if (row.login !== row.nome) { <span class="apoio">{{ row.login }}</span> }</span>
        </ng-template>
        <ng-template cesCell="placas" let-row>
          @if (row.placas.length) {
            <span class="placas">
              @for (p of row.placas.slice(0, 4); track p.idVeiculo) {
                <ces-status tone="neutral" emphasis="outline"><span class="placa">{{ placa(p.placa) }}</span></ces-status>
              }
              @if (row.placas.length > 4) { <span class="mais">e mais {{ row.placas.length - 4 }}</span> }
            </span>
          } @else {
            <ces-status tone="warning" emphasis="soft">Sem placas</ces-status>
          }
        </ng-template>
        <ng-template cesRowActions let-row>
          @if (acesso.configurarAbastecimento()) {
            <span class="ces-table-actions">
              <ces-icon-button icon="pi pi-pencil" [label]="'Placas de ' + row.nome" tooltip="Definir placas" size="icon-sm" (pressed)="abrirCarteira(row)"></ces-icon-button>
            </span>
          }
        </ng-template>
      </ces-data-table>

      }

      @if (mostra('postos')) {
      <ces-data-table title="Postos" description="Só postos externos. O WhatsApp recebe o aviso da liberação; o fornecedor recebe a fatura."
        storageKey="frota-abastecimento-postos" searchPlaceholder="Filtrar postos" [columns]="colunasPosto" [rows]="postos()"
        [rowKey]="chavePosto" [state]="estado(postos())" stateTitle="Nenhum posto cadastrado"
        stateDescription="Cadastre os postos credenciados de cada base para a equipe escolher no app."
        [rowClickable]="acesso.configurarAbastecimento()" (rowActivate)="abrirPosto($event)">
        <ng-container table-actions>
          @if (acesso.configurarAbastecimento()) {
            <ces-button size="sm" icon="pi pi-plus" label="Novo posto" (pressed)="abrirPosto(null)"></ces-button>
          }
        </ng-container>
        <ng-template cesCell="whatsapp" let-row>
          @if (row.whatsapp) { {{ whatsapp(row.whatsapp) }} }
          @else { <ces-status tone="warning" emphasis="soft">Sem WhatsApp</ces-status> }
        </ng-template>
        <ng-template cesCell="fornecedorNome" let-row>
          @if (row.fornecedorNome) { {{ row.fornecedorNome }} }
          @else { <ces-status tone="warning" emphasis="soft">Sem fornecedor</ces-status> }
        </ng-template>
        <ng-template cesCell="ativo" let-row>
          <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
        </ng-template>
        <ng-template cesRowActions let-row>
          <span class="ces-table-actions">
            <ces-icon-button icon="pi pi-tag" [label]="'Preços de ' + row.nome" tooltip="Preços do posto" size="icon-sm" (pressed)="abrirPrecos(row)"></ces-icon-button>
          </span>
          @if (acesso.configurarAbastecimento()) {
            <span class="ces-table-actions">
              <ces-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar posto" size="icon-sm" (pressed)="abrirPosto(row)"></ces-icon-button>
              <ces-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
                [tooltip]="row.ativo ? 'Desativar posto' : 'Reativar posto'" size="icon-sm" (pressed)="alternarPosto(row)"></ces-icon-button>
            </span>
          }
        </ng-template>
      </ces-data-table>

      }

      @if (mostra('produtos')) {
      <ces-data-table title="Produtos" description="O que a equipe pode pedir. Cada produto vira um item separado na solicitação."
        storageKey="frota-abastecimento-produtos" searchPlaceholder="Filtrar produtos" [columns]="colunasProduto" [rows]="produtos()"
        [rowKey]="chaveProduto" [state]="estado(produtos())" stateTitle="Nenhum produto cadastrado"
        stateDescription="Cadastre os combustíveis, o ARLA, os óleos e os fluidos que os postos fornecem."
        [rowClickable]="acesso.configurarAbastecimento()" (rowActivate)="abrirProduto($event)">
        <ng-container table-actions>
          @if (acesso.configurarAbastecimento()) {
            <ces-button size="sm" icon="pi pi-plus" label="Novo produto" (pressed)="abrirProduto(null)"></ces-button>
          }
        </ng-container>
        <ng-template cesCell="ativo" let-row>
          <ces-status [tone]="row.ativo ? 'success' : 'neutral'" [emphasis]="row.ativo ? 'soft' : 'outline'">{{ row.ativo ? 'Ativo' : 'Inativo' }}</ces-status>
        </ng-template>
        <ng-template cesRowActions let-row>
          @if (acesso.configurarAbastecimento()) {
            <span class="ces-table-actions">
              <ces-icon-button icon="pi pi-pencil" [label]="'Editar ' + row.nome" tooltip="Editar produto" size="icon-sm" (pressed)="abrirProduto(row)"></ces-icon-button>
              <ces-icon-button [icon]="row.ativo ? 'pi pi-ban' : 'pi pi-replay'" [label]="(row.ativo ? 'Desativar ' : 'Reativar ') + row.nome"
                [tooltip]="row.ativo ? 'Desativar produto' : 'Reativar produto'" size="icon-sm" (pressed)="alternarProduto(row)"></ces-icon-button>
            </span>
          }
        </ng-template>
      </ces-data-table>
      }
    </div>

    <!-- Carteira de placas -->
    <ces-form-drawer [(visible)]="carteiraAberta" [title]="'Placas de ' + (carteiraEmEdicao()?.nome ?? '')"
      description="O aprovador vê e aprova só os pedidos destas placas." [dirty]="carteiraAlterada()" [loading]="salvando()" size="md">
      <div class="ces-form-stack">
        <ces-form-section title="Incluir uma base inteira" icon="pi pi-building"
          description="Entram as placas ativas da base agora. Placa cadastrada depois precisa ser incluída aqui.">
          <div class="atalho-base">
            <ces-select label="Base" [options]="bases.opcoes()" [(value)]="baseAtalho" placeholder="Escolha a base"></ces-select>
            <ces-button variant="secondary" icon="pi pi-plus" label="Incluir placas" [disabled]="!baseAtalho()" (pressed)="incluirBase()"></ces-button>
          </div>
        </ces-form-section>
        <ces-form-section title="Placas da carteira" icon="pi pi-car" [description]="resumoCarteira()">
          <ces-multiselect label="Placas" [options]="opcoesVeiculo()" [(value)]="placasSelecionadas" display="chip" [maxSelectedLabels]="12"
            [loading]="!veiculos().length" placeholder="Escolha as placas" filterPlaceholder="Placa, modelo ou base"></ces-multiselect>
        </ces-form-section>
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="carteiraAberta.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Salvar placas" [loading]="salvando()" (pressed)="salvarCarteira()"></ces-button>
      </div>
    </ces-form-drawer>

    <!-- Posto -->
    <app-frota-precos-posto-drawer [(visible)]="precosAbertos" [posto]="postoDosPrecos()" [produtos]="produtos()"
      [podeEditar]="acesso.configurarAbastecimento() || acesso.liberarAbastecimento()"></app-frota-precos-posto-drawer>

    <ces-form-drawer [(visible)]="postoAberto" [title]="postoEmEdicao() ? 'Editar posto' : 'Novo posto'"
      [description]="postoEmEdicao()?.nome" [dirty]="!!nomePosto().trim()" [loading]="salvando()" size="md">
      <div class="ces-form-stack">
        <ces-form-section title="Identificação" icon="pi pi-map-marker">
          <ces-text-input label="Nome" [required]="true" [(value)]="nomePosto" [maxlength]="120" placeholder="Ex.: Posto Central"
            [error]="tentou() && !nomePosto().trim() ? 'Informe o nome do posto.' : undefined"></ces-text-input>
          <ces-text-input label="CNPJ" [(value)]="cnpj" [maxlength]="18" [showOptional]="true" placeholder="00.000.000/0000-00"></ces-text-input>
          <ces-select label="Base operacional" [options]="bases.opcoes()" [(value)]="basePosto" [clearable]="true" [showOptional]="true"
            description="O app sugere os postos da base do veículo."></ces-select>
        </ces-form-section>
        <ces-form-section title="Aviso da liberação" icon="pi pi-whatsapp">
          <ces-text-input label="WhatsApp do posto" [(value)]="whatsappPosto" [maxlength]="25" [showOptional]="true"
            placeholder="(74) 99999-0000" description="Na liberação, quem libera abre a conversa com a mensagem pronta."></ces-text-input>
        </ces-form-section>
        <ces-form-section title="Fatura" icon="pi pi-file">
          <ces-select label="Fornecedor no financeiro" [options]="opcoesFornecedor()" [(value)]="fornecedor" [clearable]="true" [showOptional]="true"
            [loading]="carregandoFornecedores()" description="Quem recebe o pagamento da fatura do posto."></ces-select>
          <ces-textarea label="Observação" [(value)]="observacaoPosto" [rows]="2" [maxlength]="500" [showOptional]="true"></ces-textarea>
        </ces-form-section>
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="postoAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="postoEmEdicao() ? 'Salvar alterações' : 'Cadastrar posto'" [loading]="salvando()" (pressed)="salvarPosto()"></ces-button>
      </div>
    </ces-form-drawer>

    <!-- Produto -->
    <ces-form-drawer [(visible)]="produtoAberto" [title]="produtoEmEdicao() ? 'Editar produto' : 'Novo produto'"
      [description]="produtoEmEdicao()?.nome" [dirty]="!!nomeProduto().trim()" [loading]="salvando()" size="sm">
      <div class="ces-form-stack">
        <ces-text-input label="Nome" [required]="true" [(value)]="nomeProduto" [maxlength]="80" placeholder="Ex.: Óleo do motor 15W40"
          [error]="tentou() && !nomeProduto().trim() ? 'Informe o nome do produto.' : undefined"></ces-text-input>
        <ces-select label="Categoria" [required]="true" [options]="opcoesCategoria" [(value)]="categoria"
          description="Cada categoria aparece separada no pedido e na fatura."></ces-select>
        <ces-select label="Unidade" [required]="true" [options]="opcoesUnidade" [(value)]="unidade"></ces-select>
        @if (categoria() === 'COMBUSTIVEL') {
          <ces-select label="Combustível do veículo" [options]="combustiveis" [(value)]="combustivel" [clearable]="true" [showOptional]="true"
            description="O app sugere este produto aos veículos com esse combustível na ficha (flex recebe a gasolina)."></ces-select>
        }
      </div>
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="produtoAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="produtoEmEdicao() ? 'Salvar alterações' : 'Cadastrar produto'" [loading]="salvando()" (pressed)="salvarProduto()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaConfigAbastecimentoComponent {

  /** Cada parte é um cadastro com rota própria; `todas` mantém a tela inteira. */
  readonly parte = input<'todas' | 'aprovadores' | 'postos' | 'produtos'>('todas');

  private readonly abastecimento = inject(FrotaAbastecimentoService);
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(CesConfirmationService);
  protected readonly acesso = acessoFrota();
  protected readonly bases = basesFrota();

  protected readonly carregando = signal(true);
  protected readonly carteiras = signal<CarteiraAprovacao[]>([]);
  protected readonly postos = signal<PostoAbastecimento[]>([]);
  protected readonly produtos = signal<ProdutoAbastecimento[]>([]);
  protected readonly precosAbertos = signal(false);
  protected readonly postoDosPrecos = signal<PostoAbastecimento | null>(null);
  protected readonly veiculos = signal<VeiculoFrotaResumo[]>([]);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly carregandoFornecedores = signal(false);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);

  // Carteira
  protected readonly carteiraAberta = signal(false);
  protected readonly carteiraEmEdicao = signal<CarteiraAprovacao | null>(null);
  protected readonly placasSelecionadas = signal<string[]>([]);
  protected readonly baseAtalho = signal<string | null>(null);
  protected readonly resumoCarteira = computed(() => {
    const n = this.placasSelecionadas().length;
    return n === 0 ? 'Nenhuma placa ainda: este aprovador não recebe pedidos.' : n === 1 ? '1 placa na carteira' : n + ' placas na carteira';
  });
  protected readonly carteiraAlterada = computed(() => {
    const original = new Set(this.carteiraEmEdicao()?.placas.map((p) => p.idVeiculo) ?? []);
    const atual = this.placasSelecionadas();
    return atual.length !== original.size || atual.some((id) => !original.has(id));
  });

  // Posto
  protected readonly postoAberto = signal(false);
  protected readonly postoEmEdicao = signal<PostoAbastecimento | null>(null);
  protected readonly nomePosto = signal('');
  protected readonly cnpj = signal('');
  protected readonly basePosto = signal<string | null>(null);
  protected readonly whatsappPosto = signal('');
  protected readonly fornecedor = signal<string | null>(null);
  protected readonly observacaoPosto = signal('');

  // Produto
  protected readonly produtoAberto = signal(false);
  protected readonly produtoEmEdicao = signal<ProdutoAbastecimento | null>(null);
  protected readonly nomeProduto = signal('');
  protected readonly categoria = signal<CategoriaProdutoAbastecimento>('COMBUSTIVEL');
  protected readonly unidade = signal<UnidadeProdutoAbastecimento>('L');
  protected readonly combustivel = signal<CombustivelPosto | null>(null);

  protected readonly combustiveis = COMBUSTIVEIS;
  protected readonly opcoesCategoria: CesSelectOption<CategoriaProdutoAbastecimento>[] = (
    Object.keys(ROTULO_CATEGORIA_PRODUTO) as CategoriaProdutoAbastecimento[]
  ).map((c) => ({ label: ROTULO_CATEGORIA_PRODUTO[c], value: c }));
  protected readonly opcoesUnidade: CesSelectOption<UnidadeProdutoAbastecimento>[] = [
    { label: 'Litro (l)', value: 'L' },
    { label: 'Unidade (un)', value: 'UN' }
  ];

  protected readonly opcoesVeiculo = computed<CesSelectOption<string>[]>(() =>
    this.veiculos().map((v) => ({
      label: `${formatarPlaca(v.placa)} · ${v.modelo ?? 'Sem modelo'}${v.baseOperacional ? ' · ' + v.baseOperacional : ''}`,
      value: v.idVeiculo
    }))
  );
  protected readonly opcoesFornecedor = computed<CesSelectOption<string>[]>(() =>
    this.fornecedores().map((f) => ({ label: f.nome, value: f.id }))
  );
  /** Insight: placas ativas que nenhum aprovador tem (os pedidos delas ficariam parados). */
  protected readonly placasSemAprovador = computed(() => {
    if (!this.carteiras().length) return [];
    const cobertas = new Set(this.carteiras().flatMap((c) => c.placas.map((p) => p.idVeiculo)));
    return this.veiculos().filter((v) => !cobertas.has(v.idVeiculo));
  });
  protected readonly resumoSemAprovador = computed(() => {
    const lista = this.placasSemAprovador().map((v) => formatarPlaca(v.placa));
    return lista.length > 6 ? `${lista.slice(0, 6).join(', ')} e mais ${lista.length - 6}` : lista.join(', ');
  });

  protected readonly colunasCarteira: CesDataTableColumn<CarteiraAprovacao>[] = [
    { key: 'nome', header: 'Aprovador', priority: 1, type: 'custom', value: (c) => c.nome, display: (c) => c.nome },
    { key: 'placas', header: 'Placas', priority: 1, type: 'custom', value: (c) => c.placas.length, display: (c) => `${c.placas.length} placas` },
    {
      key: 'bases',
      header: 'Bases',
      display: (c) => [...new Set(c.placas.map((p) => p.baseNome).filter((b): b is string => !!b))].join(', ') || '—'
    }
  ];
  protected readonly colunasPosto: CesDataTableColumn<PostoAbastecimento>[] = [
    { key: 'nome', header: 'Posto', priority: 1 },
    { key: 'baseNome', header: 'Base', priority: 1, display: (p) => p.baseNome ?? '—' },
    { key: 'whatsapp', header: 'WhatsApp', type: 'custom', value: (p) => p.whatsapp, display: (p) => (p.whatsapp ? formatarWhatsapp(p.whatsapp) : '') },
    { key: 'fornecedorNome', header: 'Fornecedor', type: 'custom', value: (p) => p.fornecedorNome, display: (p) => p.fornecedorNome ?? '' },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (p) => p.ativo, display: (p) => (p.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly colunasProduto: CesDataTableColumn<ProdutoAbastecimento>[] = [
    { key: 'nome', header: 'Produto', priority: 1 },
    { key: 'categoria', header: 'Categoria', priority: 1, display: (p) => ROTULO_CATEGORIA_PRODUTO[p.categoria] },
    { key: 'unidade', header: 'Unidade', display: (p) => (p.unidade === 'L' ? 'Litro' : 'Unidade') },
    { key: 'combustivel', header: 'Sugerido para', display: (p) => COMBUSTIVEIS.find((c) => c.value === p.combustivel)?.label ?? '—' },
    { key: 'ativo', header: 'Situação', type: 'custom', value: (p) => p.ativo, display: (p) => (p.ativo ? 'Ativo' : 'Inativo') }
  ];
  protected readonly chaveCarteira = (c: CarteiraAprovacao) => c.idUsuario;
  protected readonly chavePosto = (p: PostoAbastecimento) => p.id;
  protected readonly chaveProduto = (p: ProdutoAbastecimento) => p.id;

  constructor() {
    this.carregar();
    this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }).subscribe({
      next: (p) => this.veiculos.set(p.content.filter((v) => v.situacao !== 'BAIXADO')),
      error: () => undefined
    });
  }

  protected estado(lista: unknown[]): Estado {
    return this.carregando() ? 'loading' : lista.length ? 'ready' : 'empty';
  }

  protected placa(p: string): string {
    return formatarPlaca(p);
  }

  protected whatsapp(numero: string): string {
    return formatarWhatsapp(numero);
  }

  protected carregar(): void {
    this.carregando.set(true);
    let pendentes = 3;
    const fim = () => {
      if (--pendentes === 0) this.carregando.set(false);
    };
    const erro = (e: unknown) => {
      this.notificacoes.error(getErrorMessage(e));
      fim();
    };
    this.abastecimento.carteiras().subscribe({ next: (c) => (this.carteiras.set(c), fim()), error: erro });
    this.abastecimento.postos().subscribe({ next: (p) => (this.postos.set(p.content), fim()), error: erro });
    this.abastecimento.produtos().subscribe({ next: (p) => (this.produtos.set(p.content), fim()), error: erro });
  }

  // ── Carteira ─────────────────────────────────────────────────────────────
  protected abrirCarteira(carteira: CarteiraAprovacao): void {
    if (!this.acesso.configurarAbastecimento()) return;
    this.carteiraEmEdicao.set(carteira);
    this.placasSelecionadas.set(carteira.placas.map((p) => p.idVeiculo));
    this.baseAtalho.set(null);
    this.carteiraAberta.set(true);
  }

  /** O atalho só soma as placas da base à seleção; nada é gravado até salvar. */
  protected incluirBase(): void {
    const base = this.baseAtalho();
    if (!base) return;
    const daBase = this.veiculos().filter((v) => v.idBaseOperacional === base).map((v) => v.idVeiculo);
    const atuais = new Set(this.placasSelecionadas());
    const novas = daBase.filter((id) => !atuais.has(id));
    this.placasSelecionadas.set([...this.placasSelecionadas(), ...novas]);
    this.baseAtalho.set(null);
    this.notificacoes.info(
      novas.length
        ? `${novas.length === 1 ? '1 placa incluída' : novas.length + ' placas incluídas'} de ${this.bases.nome(base)}. Salve para gravar.`
        : `Todas as placas ativas de ${this.bases.nome(base)} já estavam na carteira.`
    );
  }

  protected salvarCarteira(): void {
    const carteira = this.carteiraEmEdicao();
    if (!carteira) return;
    this.salvando.set(true);
    this.abastecimento.definirPlacas(carteira.idUsuario, this.placasSelecionadas()).subscribe({
      next: (atualizada) => {
        this.salvando.set(false);
        this.carteiraAberta.set(false);
        this.carteiras.update((lista) => lista.map((c) => (c.idUsuario === atualizada.idUsuario ? atualizada : c)));
        this.notificacoes.success(`Carteira de ${atualizada.nome} com ${atualizada.placas.length} placas.`);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  // ── Posto ────────────────────────────────────────────────────────────────
  protected abrirPrecos(posto: PostoAbastecimento): void {
    this.postoDosPrecos.set(posto);
    this.precosAbertos.set(true);
  }

  protected abrirPosto(posto: PostoAbastecimento | null): void {
    if (!this.acesso.configurarAbastecimento()) return;
    this.postoEmEdicao.set(posto);
    this.nomePosto.set(posto?.nome ?? '');
    this.cnpj.set(posto?.cnpj ?? '');
    this.basePosto.set(posto?.idBaseOperacional ?? null);
    this.whatsappPosto.set(posto?.whatsapp ? formatarWhatsapp(posto.whatsapp) : '');
    this.fornecedor.set(posto?.idFornecedor ?? null);
    this.observacaoPosto.set(posto?.observacao ?? '');
    this.tentou.set(false);
    this.postoAberto.set(true);
    if (!this.fornecedores().length) {
      this.carregandoFornecedores.set(true);
      this.frota.fornecedoresOficina().subscribe({
        next: (f) => (this.fornecedores.set(f), this.carregandoFornecedores.set(false)),
        error: () => this.carregandoFornecedores.set(false)
      });
    }
  }

  protected salvarPosto(): void {
    this.tentou.set(true);
    if (!this.nomePosto().trim()) return;
    this.salvar(
      this.abastecimento.salvarPosto(
        {
          nome: this.nomePosto().trim(),
          cnpj: this.cnpj().trim() || null,
          idBaseOperacional: this.basePosto(),
          whatsapp: this.whatsappPosto().trim() || null,
          idFornecedor: this.fornecedor(),
          observacao: this.observacaoPosto().trim() || null
        },
        this.postoEmEdicao()?.id
      ),
      () => this.postoAberto.set(false),
      `Posto ${this.nomePosto().trim()} salvo.`
    );
  }

  protected async alternarPosto(posto: PostoAbastecimento): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: posto.ativo ? 'Desativar posto' : 'Reativar posto',
      message: posto.ativo
        ? `${posto.nome} sai das opções do app. Os abastecimentos já feitos continuam com ele.`
        : `${posto.nome} volta a aparecer no app.`,
      confirmLabel: posto.ativo ? 'Desativar' : 'Reativar',
      variant: posto.ativo ? 'destructive' : 'default'
    });
    if (ok) this.salvar(this.abastecimento.alternarPosto(posto), () => undefined, posto.ativo ? `${posto.nome} desativado.` : `${posto.nome} reativado.`);
  }

  // ── Produto ──────────────────────────────────────────────────────────────
  protected abrirProduto(produto: ProdutoAbastecimento | null): void {
    if (!this.acesso.configurarAbastecimento()) return;
    this.produtoEmEdicao.set(produto);
    this.nomeProduto.set(produto?.nome ?? '');
    this.categoria.set(produto?.categoria ?? 'COMBUSTIVEL');
    this.unidade.set(produto?.unidade ?? 'L');
    this.combustivel.set(produto?.combustivel ?? null);
    this.tentou.set(false);
    this.produtoAberto.set(true);
  }

  protected salvarProduto(): void {
    this.tentou.set(true);
    if (!this.nomeProduto().trim()) return;
    this.salvar(
      this.abastecimento.salvarProduto(
        {
          nome: this.nomeProduto().trim(),
          categoria: this.categoria(),
          unidade: this.unidade(),
          combustivel: this.categoria() === 'COMBUSTIVEL' ? this.combustivel() : null
        },
        this.produtoEmEdicao()?.id
      ),
      () => this.produtoAberto.set(false),
      `Produto ${this.nomeProduto().trim()} salvo.`
    );
  }

  protected async alternarProduto(produto: ProdutoAbastecimento): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: produto.ativo ? 'Desativar produto' : 'Reativar produto',
      message: produto.ativo
        ? `${produto.nome} deixa de aparecer no pedido. Os abastecimentos já feitos continuam com ele.`
        : `${produto.nome} volta a aparecer no pedido.`,
      confirmLabel: produto.ativo ? 'Desativar' : 'Reativar',
      variant: produto.ativo ? 'destructive' : 'default'
    });
    if (ok) this.salvar(this.abastecimento.alternarProduto(produto), () => undefined, produto.ativo ? `${produto.nome} desativado.` : `${produto.nome} reativado.`);
  }

  private salvar(operacao: Observable<unknown>, aoConcluir: () => void, mensagem: string): void {
    this.salvando.set(true);
    operacao.subscribe({
      next: () => {
        this.salvando.set(false);
        aoConcluir();
        this.notificacoes.success(mensagem);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected mostra(parte: 'aprovadores' | 'postos' | 'produtos'): boolean {
    return this.parte() === 'todas' || this.parte() === parte;
  }
}
