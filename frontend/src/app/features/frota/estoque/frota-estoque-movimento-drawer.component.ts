import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { Observable } from 'rxjs';
import {
  AlmoxarifadoFrota,
  MOTIVOS_ENTRADA,
  MOTIVOS_SAIDA,
  MotivoMovimentoFrota,
  PecaFrota,
  ROTULO_MOTIVO_MOVIMENTO,
  SaldoPecaFrota
} from '../../../core/models/frota-pneu.models';
import { FornecedorFrota, contar, paraInstanteIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaPecaDrawerComponent } from './frota-peca-drawer.component';
import { casasDecimais, moeda, numero } from './frota-estoque.util';

export type OperacaoEstoque = 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA' | 'AJUSTE';

interface Linha {
  chave: number;
  idMaterial: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
}

const TEXTOS: Record<OperacaoEstoque, { titulo: string; descricao: string; botao: string; icone: string; feito: string }> = {
  ENTRADA: { titulo: 'Entrada de peças', descricao: 'Compra, devolução ou saldo inicial. O valor unitário recalcula o custo médio de cada peça.', botao: 'Registrar entrada', icone: 'pi pi-arrow-down-left', feito: 'Entrada' },
  SAIDA: { titulo: 'Saída de peças', descricao: 'Sai pelo custo médio. A saída para uma OS é lançada na própria OS, nas peças.', botao: 'Registrar saída', icone: 'pi pi-arrow-up-right', feito: 'Saída' },
  TRANSFERENCIA: { titulo: 'Transferência entre almoxarifados', descricao: 'A peça leva o custo médio de origem para o destino.', botao: 'Transferir', icone: 'pi pi-arrow-right-arrow-left', feito: 'Transferência' },
  AJUSTE: { titulo: 'Ajuste de inventário', descricao: 'A quantidade contada substitui o saldo e a diferença fica registrada.', botao: 'Registrar ajuste', icone: 'pi pi-sliders-h', feito: 'Ajuste' }
};

/** Entrada, saída, transferência e ajuste no mesmo painel, com várias peças por vez (menos o ajuste). */
@Component({
  selector: 'app-frota-estoque-movimento-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    FrotaPecaDrawerComponent
  ],
  styles: `
    .linhas { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .linha { display: grid; grid-template-columns: minmax(12rem, 2fr) minmax(6.5rem, 1fr) auto; gap: 0.5rem 0.75rem; align-items: start;
      padding: 0.6rem 0.7rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .linha--valor { grid-template-columns: minmax(12rem, 2fr) minmax(6.5rem, 1fr) minmax(7.5rem, 1fr) auto; }
    .linha__remover { padding-top: 1.55rem; min-width: 2rem; }
    .linha__info { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted);
      font-variant-numeric: tabular-nums; }
    .acoes { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .acoes__botoes { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .total { font-weight: 700; font-variant-numeric: tabular-nums; }
    .links { display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.25rem; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .bloco { display: grid; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .bloco__titulo { font-weight: 600; }
    .bloco__texto { margin: 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .bloco__campos { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
    .bloco__campos > * { flex: 1 1 12rem; }
    .bloco__campos > geo-button { flex: 0 0 auto; }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
    @media (max-width: 640px) {
      .linha, .linha--valor { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .linha__peca { grid-column: 1 / -1; }
      .linha:not(.linha--valor) .linha__remover { padding-top: 1.55rem; }
      .linha--valor .linha__remover { grid-column: 1 / -1; padding-top: 0; justify-self: end; }
    }
  `,
  template: `
    <geo-form-drawer [(visible)]="visivel" [title]="textos().titulo" [description]="textos().descricao" [dirty]="alterado()" [loading]="salvando()" size="lg">
      <geo-form-section title="Onde" icon="pi pi-box">
        <div class="geo-form-grid">
          <geo-select [label]="operacao() === 'TRANSFERENCIA' ? 'Almoxarifado de origem' : 'Almoxarifado'" [required]="true" [options]="opcoesAlmoxarifado()"
            [value]="idEstoque()" (valueChange)="escolherAlmoxarifado($event)" [error]="erro(!idEstoque(), 'Escolha o almoxarifado.')"></geo-select>
          @if (operacao() === 'TRANSFERENCIA') {
            <geo-select label="Almoxarifado de destino" [required]="true" [options]="opcoesDestino()" [(value)]="idDestino" [error]="erro(!idDestino(), 'Escolha o destino.')"></geo-select>
          }
          @if (operacao() === 'ENTRADA' || operacao() === 'SAIDA') {
            <geo-select label="Motivo" [required]="true" [options]="opcoesMotivo()" [(value)]="motivo"></geo-select>
          }
          @if (operacao() === 'SAIDA' && motivo() === 'VEICULO') {
            <geo-select label="Veículo" [required]="true" [options]="veiculos()" [(value)]="idVeiculo" [filter]="true" filterPlaceholder="Placa ou modelo" [error]="erro(!idVeiculo(), 'Escolha o veículo.')"></geo-select>
          }
          @if (operacao() === 'ENTRADA') {
            @if (motivo() !== 'SALDO_INICIAL') {
              <geo-text-input label="Nota fiscal ou recibo" [(value)]="documento" [maxlength]="60" [showOptional]="true"></geo-text-input>
              <geo-select label="Fornecedor" [options]="opcoesFornecedor()" [(value)]="idFornecedor" [filter]="true" [clearable]="true" [showOptional]="true" [disabled]="novoFornecedor()"></geo-select>
            }
            <geo-datepicker label="Data da entrada" [(value)]="dataHora" [showTime]="true" [maxDate]="agora" description="Em branco, vale agora."></geo-datepicker>
          }
        </div>
        @if (operacao() === 'ENTRADA' && motivo() !== 'SALDO_INICIAL' && acesso.cadastrarFornecedor()) {
          @if (novoFornecedor()) {
            <div class="bloco">
              <span class="bloco__titulo">Novo fornecedor</span>
              <p class="bloco__texto">Entra no cadastro de fornecedores do financeiro, que confere e homologa depois.</p>
              <div class="bloco__campos">
                <geo-text-input label="Nome" [required]="true" [(value)]="fornecedorNome" [maxlength]="150"></geo-text-input>
                <geo-text-input label="CNPJ" [(value)]="fornecedorCnpj" [maxlength]="18" [showOptional]="true" placeholder="Só números"></geo-text-input>
                <geo-button variant="ghost" label="Cancelar" (pressed)="novoFornecedor.set(false)"></geo-button>
                <geo-button icon="pi pi-check" label="Cadastrar" [disabled]="!fornecedorNome().trim()" [loading]="gravandoFornecedor()" (pressed)="cadastrarFornecedor()"></geo-button>
              </div>
            </div>
          } @else {
            <div class="links">
              <span>Fornecedor novo?</span>
              <geo-button variant="link" size="sm" icon="pi pi-plus" label="Cadastrar fornecedor" (pressed)="abrirNovoFornecedor()"></geo-button>
            </div>
          }
        }
      </geo-form-section>

      <geo-form-section title="Peças" icon="pi pi-wrench">
        @if (semSaldoNaOrigem()) {
          <geo-callout tone="warning" icon="pi pi-exclamation-triangle" [dense]="true" title="Nada para retirar">
            Este almoxarifado não tem peça com saldo. Escolha outro ou lance uma entrada.
          </geo-callout>
        } @else if (!catalogo().length) {
          <geo-callout tone="info" icon="pi pi-info-circle" [dense]="true" title="Nenhuma peça no catálogo">
            Cadastre a primeira peça para continuar.
          </geo-callout>
        }
        <ul class="linhas">
          @for (l of linhas(); track l.chave) {
            @let info = infoLinha(l);
            <li class="linha" [class.linha--valor]="operacao() === 'ENTRADA'">
              <div class="linha__peca">
                <geo-select label="Peça" [required]="true" [options]="opcoesDaLinha(l)" [value]="l.idMaterial" (valueChange)="alterar(l.chave, 'idMaterial', $event)" [filter]="true"
                  filterPlaceholder="Código ou nome" [disabled]="faltaOrigem()" [description]="saldoTexto(l)" [error]="erro(!l.idMaterial, 'Escolha a peça.')"></geo-select>
              </div>
              <geo-number-input [label]="operacao() === 'AJUSTE' ? 'Quantidade contada' : 'Quantidade'" [required]="true" [value]="l.quantidade" (valueChange)="alterar(l.chave, 'quantidade', $event)"
                [min]="0" [maxFractionDigits]="casas(l)" [suffix]="unidadeLinha(l) ? ' ' + unidadeLinha(l) : ''" [error]="erroQuantidade(l)"></geo-number-input>
              @if (operacao() === 'ENTRADA') {
                <geo-number-input label="Valor unitário" [required]="true" mode="currency" [value]="l.valorUnitario" (valueChange)="alterar(l.chave, 'valorUnitario', $event)"
                  [min]="0" [error]="erro(l.valorUnitario == null, 'Informe o valor.')"></geo-number-input>
              }
              <span class="linha__remover">
                @if (linhas().length > 1) {
                  <geo-icon-button icon="pi pi-trash" label="Remover peça" tooltip="Remover" size="icon-sm" (pressed)="remover(l.chave)"></geo-icon-button>
                }
              </span>
              @if (info) {
                <p class="linha__info" aria-live="polite">
                  <span>{{ info.texto }}</span>
                  @if (info.aviso) { <geo-status tone="warning" icon="pi pi-exclamation-triangle">{{ info.aviso }}</geo-status> }
                </p>
              }
            </li>
          }
        </ul>
        <div class="acoes">
          <div class="acoes__botoes">
            @if (operacao() !== 'AJUSTE') {
              <geo-button size="sm" variant="outline" icon="pi pi-plus" label="Adicionar peça" [disabled]="!podeAdicionar()" (pressed)="adicionar()"></geo-button>
            }
            @if (operacao() === 'ENTRADA') {
              <geo-button size="sm" variant="link" icon="pi pi-wrench" label="Peça nova? Cadastrar" (pressed)="novaPecaAberta.set(true)"></geo-button>
            }
          </div>
          @if (operacao() !== 'AJUSTE' && total() > 0) {
            <span class="total">{{ contar(linhasPreenchidas(), 'peça', 'peças') }} · Total {{ moeda(total()) }}</span>
          }
        </div>
      </geo-form-section>

      <geo-form-section title="Observação" icon="pi pi-comment">
        <geo-textarea [label]="operacao() === 'AJUSTE' ? 'Por que o ajuste' : 'Observação'" [required]="operacao() === 'AJUSTE'" [(value)]="observacao" [rows]="2" [maxlength]="500"
          [showOptional]="operacao() !== 'AJUSTE'" [error]="erro(operacao() === 'AJUSTE' && !observacao().trim(), 'Explique o ajuste.')"></geo-textarea>
      </geo-form-section>

      <div drawer-footer class="rodape">
        <span class="rodape__espaco"></span>
        <geo-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></geo-button>
        <geo-button [icon]="textos().icone" [label]="textos().botao" [loading]="salvando()" (pressed)="salvar()"></geo-button>
      </div>
    </geo-form-drawer>

    <app-frota-peca-drawer [(visivel)]="novaPecaAberta" [grupos]="grupos()" [podeEditar]="true" (salva)="pecaNova($event)"></app-frota-peca-drawer>
  `
})
export class FrotaEstoqueMovimentoDrawerComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly financeiro = inject(FinanceiroService);
  private readonly notificacoes = inject(NotificationService);
  protected readonly acesso = acessoFrota();

  readonly visivel = model(false);
  readonly operacao = input<OperacaoEstoque>('ENTRADA');
  readonly almoxarifados = input<AlmoxarifadoFrota[]>([]);
  readonly pecas = input<PecaFrota[]>([]);
  /** Saldos de todos os almoxarifados: a pessoa pode escolher um diferente do filtrado na tela. */
  readonly saldos = input<readonly SaldoPecaFrota[]>([]);
  readonly fornecedores = input<FornecedorFrota[]>([]);
  readonly veiculos = input<GeoSelectOption<string>[]>([]);
  readonly grupos = input<string[]>([]);
  readonly idEstoqueInicial = input<string | null>(null);
  readonly idMaterialInicial = input<string | null>(null);
  readonly registrado = output<void>();
  readonly pecaCadastrada = output<void>();

  protected readonly moeda = moeda;
  protected readonly contar = contar;
  protected readonly agora = new Date();
  protected readonly salvando = signal(false);
  private readonly tentou = signal(false);
  protected readonly idEstoque = signal<string | null>(null);
  protected readonly idDestino = signal<string | null>(null);
  protected readonly motivo = signal<MotivoMovimentoFrota | null>(null);
  protected readonly documento = signal('');
  protected readonly idFornecedor = signal<string | null>(null);
  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly dataHora = signal<Date | null>(null);
  protected readonly observacao = signal('');
  protected readonly linhas = signal<Linha[]>([]);
  private proximaChave = 1;
  private readonly inicial = signal('');

  protected readonly novaPecaAberta = signal(false);
  /** Peças cadastradas agora: valem na linha antes de o catálogo recarregar. */
  private readonly pecasNovas = signal<PecaFrota[]>([]);
  protected readonly novoFornecedor = signal(false);
  protected readonly fornecedorNome = signal('');
  protected readonly fornecedorCnpj = signal('');
  protected readonly gravandoFornecedor = signal(false);
  private readonly fornecedoresNovos = signal<FornecedorFrota[]>([]);

  protected readonly textos = computed(() => TEXTOS[this.operacao()]);
  protected readonly opcoesAlmoxarifado = computed<GeoSelectOption<string>[]>(() =>
    this.almoxarifados().filter((a) => a.ativo).map((a) => ({ label: a.nome, value: a.id })));
  protected readonly opcoesDestino = computed(() => this.opcoesAlmoxarifado().filter((o) => o.value !== this.idEstoque()));
  protected readonly opcoesFornecedor = computed<GeoSelectOption<string>[]>(() =>
    [...this.fornecedores(), ...this.fornecedoresNovos()].map((f) => ({ label: f.nome, value: f.id })));
  protected readonly opcoesMotivo = computed<GeoSelectOption<MotivoMovimentoFrota>[]>(() =>
    (this.operacao() === 'ENTRADA' ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA).map((m) => ({ label: ROTULO_MOTIVO_MOVIMENTO[m], value: m })));
  protected readonly catalogo = computed(() => {
    const novas = this.pecasNovas().filter((n) => !this.pecas().some((p) => p.id === n.id));
    return [...this.pecas(), ...novas].filter((p) => p.ativo);
  });
  private readonly retira = computed(() => this.operacao() === 'SAIDA' || this.operacao() === 'TRANSFERENCIA');
  /** Na saída e na transferência, só o que tem saldo na origem, já com a quantidade à vista. */
  protected readonly opcoesCatalogo = computed<GeoSelectOption<string>[]>(() =>
    this.catalogo()
      .filter((p) => !this.retira() || (this.saldoDe(p.id)?.quantidade ?? 0) > 0)
      .map((p) => {
        const saldo = this.saldoDe(p.id);
        const resto = this.retira() && saldo ? ` · ${numero(saldo.quantidade)} ${saldo.unidade}` : '';
        return { label: `${p.codigo} · ${p.descricao}${resto}`, value: p.id };
      }));
  /** Na saída e na transferência, o que pode sair depende da origem: ela vem primeiro. */
  protected readonly faltaOrigem = computed(() => this.retira() && !this.idEstoque());
  protected readonly semSaldoNaOrigem = computed(() => this.retira() && !!this.idEstoque() && !this.opcoesCatalogo().length);
  protected readonly podeAdicionar = computed(() => this.linhas().length < this.opcoesCatalogo().length);
  protected readonly linhasPreenchidas = computed(() => this.linhas().filter((l) => !!l.idMaterial && (l.quantidade ?? 0) > 0).length);
  /** Entrada pelo valor digitado; saída e transferência pelo custo médio da origem. */
  protected readonly total = computed(() => this.linhas().reduce((soma, l) => {
    const valor = this.operacao() === 'ENTRADA' ? l.valorUnitario : this.saldoDe(l.idMaterial)?.custoMedio;
    return soma + (l.quantidade ?? 0) * (valor ?? 0);
  }, 0));
  protected readonly alterado = computed(() => this.foto() !== this.inicial());

  constructor() {
    effect(() => {
      if (!this.visivel()) return;
      const estoque = this.idEstoqueInicial();
      const material = this.idMaterialInicial();
      const operacao = this.operacao();
      untracked(() => this.preparar(operacao, estoque, material));
    });
  }

  private saldoDe(idMaterial: string | null): SaldoPecaFrota | undefined {
    return this.saldos().find((s) => s.idEstoque === this.idEstoque() && s.idMaterial === idMaterial);
  }

  private pecaDe(idMaterial: string | null): PecaFrota | undefined {
    return this.catalogo().find((p) => p.id === idMaterial);
  }

  protected unidadeLinha(l: Linha): string {
    return this.pecaDe(l.idMaterial)?.unidade ?? '';
  }

  /** A mesma peça não pode repetir: as escolhidas em outras linhas saem da lista. */
  protected opcoesDaLinha(l: Linha): GeoSelectOption<string>[] {
    const usadas = new Set(this.linhas().filter((o) => o.chave !== l.chave).map((o) => o.idMaterial));
    return this.opcoesCatalogo().filter((o) => !usadas.has(o.value));
  }

  /** Quantidade em peça contada por unidade é inteira. O saldo fracionado antigo continua ajustável. */
  protected casas(l: Linha): number {
    const saldo = this.saldoDe(l.idMaterial)?.quantidade ?? 0;
    return Number.isInteger(saldo) ? casasDecimais(this.unidadeLinha(l)) : 3;
  }

  protected saldoTexto(l: Linha): string | undefined {
    if (this.faltaOrigem()) return 'Escolha o almoxarifado primeiro.';
    if (!l.idMaterial || !this.idEstoque()) return undefined;
    const s = this.saldoDe(l.idMaterial);
    if (!s) return 'Sem saldo neste almoxarifado.';
    return `Saldo ${numero(s.quantidade)} ${s.unidade}${s.custoMedio != null ? ' · custo médio ' + moeda(s.custoMedio) : ''}`;
  }

  /** O efeito do lançamento antes de confirmar: como a peça fica depois dele. */
  protected infoLinha(l: Linha): { texto: string; aviso?: string } | null {
    if (!l.idMaterial || l.quantidade == null || !this.idEstoque()) return null;
    const s = this.saldoDe(l.idMaterial);
    const unidade = this.unidadeLinha(l);
    const saldo = s?.quantidade ?? 0;
    const q = l.quantidade;
    if (this.operacao() === 'AJUSTE') {
      const diferenca = q - saldo;
      if (diferenca === 0) return this.tentou() ? null : { texto: 'Igual ao saldo: nada muda.' };
      const sinal = diferenca > 0 ? '+' : '−';
      return { texto: `Diferença de ${sinal}${numero(Math.abs(diferenca))} ${unidade} · ${sinal}${moeda(Math.abs(diferenca) * (s?.custoMedio ?? 0))}` };
    }
    if (q <= 0) return null;
    if (this.operacao() === 'ENTRADA') {
      if (l.valorUnitario == null) return null;
      const custo = (saldo * (s?.custoMedio ?? 0) + q * l.valorUnitario) / (saldo + q);
      return { texto: `Subtotal ${moeda(q * l.valorUnitario)} · saldo vai a ${numero(saldo + q)} ${unidade} · custo médio ${moeda(custo)}` };
    }
    if (q > saldo) return null;
    const resto = saldo - q;
    const abaixo = s?.estoqueMinimo != null && resto < s.estoqueMinimo;
    return { texto: `Fica com ${numero(resto)} ${unidade} · ${moeda(q * (s?.custoMedio ?? 0))} pelo custo médio`, aviso: abaixo ? `Abaixo do mínimo de ${numero(s!.estoqueMinimo)}` : undefined };
  }

  protected erro(condicao: boolean, mensagem: string): string | undefined {
    return this.tentou() && condicao ? mensagem : undefined;
  }

  protected erroQuantidade(l: Linha): string | undefined {
    const q = l.quantidade;
    if (this.operacao() === 'AJUSTE') {
      if (q == null) return this.erro(true, 'Informe a quantidade.');
      if (l.idMaterial && q === (this.saldoDe(l.idMaterial)?.quantidade ?? 0)) return this.erro(true, 'Igual ao saldo: não há o que ajustar.');
      return undefined;
    }
    if (this.tentou() && (q == null || q <= 0)) return 'Informe uma quantidade maior que zero.';
    if (q != null && this.retira() && l.idMaterial) {
      const s = this.saldoDe(l.idMaterial);
      if (q > (s?.quantidade ?? 0)) return `Maior que o saldo (${numero(s?.quantidade ?? 0)} ${this.unidadeLinha(l)}).`;
    }
    return undefined;
  }

  protected escolherAlmoxarifado(id: string | null): void {
    this.idEstoque.set(id);
    if (this.idDestino() === id) this.idDestino.set(null);
    this.sugerirDestino();
    // A peça sem saldo na nova origem não pode continuar escolhida.
    const validas = new Set(this.opcoesCatalogo().map((o) => o.value));
    this.linhas.update((lista) => lista.map((l) => (l.idMaterial && !validas.has(l.idMaterial) ? { ...l, idMaterial: null } : l)));
  }

  /** Com dois almoxarifados, o destino só pode ser o outro. */
  private sugerirDestino(): void {
    if (this.operacao() !== 'TRANSFERENCIA' || !this.idEstoque()) return;
    const destinos = this.opcoesDestino();
    if (destinos.length === 1) this.idDestino.set(destinos[0].value);
  }

  protected alterar(chave: number, campo: 'idMaterial' | 'quantidade' | 'valorUnitario', valor: string | number | null): void {
    this.linhas.update((lista) => lista.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  protected adicionar(): void {
    this.linhas.update((lista) => [...lista, this.novaLinha(null)]);
  }

  protected remover(chave: number): void {
    this.linhas.update((lista) => lista.filter((l) => l.chave !== chave));
  }

  /** A peça recém-cadastrada entra na primeira linha vazia, ou em uma nova. */
  protected pecaNova(peca: PecaFrota | null): void {
    if (!peca) return;
    this.pecasNovas.update((lista) => [...lista, peca]);
    const vazia = this.linhas().find((l) => !l.idMaterial);
    if (vazia) this.alterar(vazia.chave, 'idMaterial', peca.id);
    else this.linhas.update((lista) => [...lista, this.novaLinha(peca.id)]);
    this.pecaCadastrada.emit();
  }

  protected abrirNovoFornecedor(): void {
    this.fornecedorNome.set('');
    this.fornecedorCnpj.set('');
    this.novoFornecedor.set(true);
  }

  protected cadastrarFornecedor(): void {
    const nome = this.fornecedorNome().trim();
    if (!nome) return;
    this.gravandoFornecedor.set(true);
    this.financeiro.criarFornecedor({ nomeFantasia: nome, documento: this.fornecedorCnpj().replace(/\D/g, '') || null }).subscribe({
      next: (f) => {
        this.gravandoFornecedor.set(false);
        this.fornecedoresNovos.update((lista) => [...lista, { id: f.id, nome: f.nomeFantasia }]);
        this.idFornecedor.set(f.id);
        this.novoFornecedor.set(false);
        this.notificacoes.success(`${nome} cadastrado no financeiro.`);
      },
      error: (e) => (this.gravandoFornecedor.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (!this.valido()) return;
    const estoque = this.idEstoque()!;
    const observacao = this.observacao().trim() || null;
    const saidaItens = () => this.linhas().map((l) => ({ idMaterial: l.idMaterial!, quantidade: l.quantidade! }));
    const saldoInicial = this.motivo() === 'SALDO_INICIAL';
    let acao: Observable<unknown>;
    switch (this.operacao()) {
      case 'ENTRADA':
        acao = this.servico.entrada({
          idEstoque: estoque, motivo: this.motivo()!, documento: saldoInicial ? null : this.documento().trim() || null, idFornecedor: saldoInicial ? null : this.idFornecedor(), observacao,
          dataHora: this.dataHora() ? paraInstanteIso(this.dataHora()!) : null,
          itens: this.linhas().map((l) => ({ idMaterial: l.idMaterial!, quantidade: l.quantidade!, valorUnitario: l.valorUnitario! }))
        });
        break;
      case 'SAIDA':
        acao = this.servico.saida({ idEstoque: estoque, motivo: this.motivo()!, idVeiculo: this.motivo() === 'VEICULO' ? this.idVeiculo() : null, observacao, itens: saidaItens() });
        break;
      case 'TRANSFERENCIA':
        acao = this.servico.transferencia({ idOrigem: estoque, idDestino: this.idDestino()!, observacao, itens: saidaItens() });
        break;
      default:
        acao = this.servico.ajuste({ idEstoque: estoque, idMaterial: this.linhas()[0].idMaterial!, quantidadeContada: this.linhas()[0].quantidade!, observacao: observacao! });
    }
    this.salvando.set(true);
    acao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.notificacoes.success(this.mensagemSucesso());
        this.inicial.set(this.foto());
        this.registrado.emit();
        this.visivel.set(false);
      },
      error: (e) => (this.salvando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  private mensagemSucesso(): string {
    if (this.operacao() === 'AJUSTE') return `Ajuste de ${this.pecaDe(this.linhas()[0].idMaterial)?.descricao ?? 'peça'} registrado.`;
    const quantidade = contar(this.linhas().length, 'peça', 'peças');
    return `${this.textos().feito} de ${quantidade} registrada: ${moeda(this.total())}.`;
  }

  private valido(): boolean {
    const op = this.operacao();
    if (!this.idEstoque() || !this.linhas().length) return false;
    if (op === 'TRANSFERENCIA' && !this.idDestino()) return false;
    if (op === 'SAIDA' && this.motivo() === 'VEICULO' && !this.idVeiculo()) return false;
    if (op === 'AJUSTE' && !this.observacao().trim()) return false;
    return this.linhas().every((l) => !!l.idMaterial && !this.erroQuantidade(l) && (op !== 'ENTRADA' || l.valorUnitario != null));
  }

  private preparar(operacao: OperacaoEstoque, estoque: string | null, material: string | null): void {
    this.tentou.set(false);
    const ativos = this.almoxarifados().filter((a) => a.ativo);
    this.idEstoque.set(estoque ?? (ativos.length === 1 ? ativos[0].id : null));
    this.idDestino.set(null);
    this.motivo.set(operacao === 'ENTRADA' ? 'COMPRA' : operacao === 'SAIDA' ? 'USO_OFICINA' : null);
    this.documento.set('');
    this.idFornecedor.set(null);
    this.idVeiculo.set(null);
    this.dataHora.set(null);
    this.observacao.set('');
    this.novoFornecedor.set(false);
    this.pecasNovas.set([]);
    this.fornecedoresNovos.set([]);
    this.linhas.set([this.novaLinha(material)]);
    this.sugerirDestino();
    this.inicial.set(this.foto());
  }

  private novaLinha(idMaterial: string | null): Linha {
    return { chave: this.proximaChave++, idMaterial, quantidade: null, valorUnitario: null };
  }

  private foto(): string {
    return JSON.stringify([
      this.idEstoque(), this.idDestino(), this.motivo(), this.documento(), this.idFornecedor(), this.idVeiculo(), this.dataHora()?.getTime() ?? null, this.observacao(),
      this.linhas().map((l) => [l.idMaterial, l.quantidade, l.valorUnitario])
    ]);
  }
}
