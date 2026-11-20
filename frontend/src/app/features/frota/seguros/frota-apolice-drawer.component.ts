import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoMultiSelectComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { Observable, catchError, concatMap, from, map, of, switchMap, toArray } from 'rxjs';
import { SolicitacaoFinanceira } from '../../../core/models/financeiro.models';
import {
  AnexoFrota,
  Apolice,
  ApoliceRequest,
  CoberturaApolice,
  CoberturaVeiculo,
  MOTIVOS_ENCERRAMENTO,
  MotivoEncerramentoCobertura,
  PapelSeguradora,
  ParcelaApolice,
  SeguradoraFrota,
  coberturaNaApolice,
  pagamentoParcela,
  rotuloVeiculoSeguro,
  vigenciaApolice
} from '../../../core/models/frota-seguro.models';
import { FornecedorFrota, PreenchimentoFinanceiro, deDataIso, formatarPlaca, paraDataIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { acessoFrota } from '../shared/frota-acesso';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';
import { FrotaAnexosComponent, salvarArquivo } from './frota-anexos.component';

/** Veículo como o formulário oferece. */
export interface VeiculoSeguro {
  idVeiculo: string;
  placa: string;
  modelo: string | null;
}


const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/**
 * Cadastro e acompanhamento da apólice num só painel: dados da apólice e, depois de salva, os
 * veículos cobertos por período, as parcelas (com o pedido de pagamento ao financeiro) e os anexos.
 * Veículos, parcelas e anexos gravam na hora; os dados da apólice, no Salvar. Renovar abre o
 * cadastro já com seguradora, corretor e os veículos que estavam cobertos no fim da vigência.
 */
@Component({
  selector: 'app-frota-apolice-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoMultiSelectComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    FrotaAnexosComponent
  ],
  styles: `
    .linhas { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .linha { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; padding: 0.5rem 0.75rem;
      border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .linha__texto { flex: 1; min-width: 12rem; display: grid; }
    .linha__texto strong { font-weight: 600; }
    .linha__texto span { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .linha__valor { font-weight: 600; font-variant-numeric: tabular-nums; }
    .linha--edicao { background: var(--geo-surface-subtle); }
    .acoes { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; }
    .acoes > * { flex: 1 1 10rem; }
    .acoes > geo-button { flex: 0 0 auto; }
    .acoes--linha { flex-basis: 100%; }
    .bloco { display: grid; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md);
      background: var(--geo-surface-subtle); }
    .bloco__titulo { font-weight: 600; }
    .bloco__texto { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); margin: 0; }
    .links { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; color: var(--geo-foreground-muted);
      font-size: var(--geo-font-caption); }
    .totais { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; font-size: var(--geo-font-caption);
      color: var(--geo-foreground-muted); }
    .totais strong { color: var(--geo-foreground); }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
  `,
  template: `
    <geo-form-drawer [(visible)]="visivel" [title]="titulo()" [description]="descricao()" [dirty]="alterado()" [loading]="salvando()" size="lg">

      @if (apolice(); as a) {
        @let v = vigencia(a);
        <geo-callout [tone]="v.tom" [icon]="v.icone" [dense]="true" [title]="v.rotulo">
          @if (a.diasParaComecar > 0) {
            {{ a.veiculos.length === 1 ? '1 veículo coberto' : a.veiculos.length + ' veículos cobertos' }} a partir de {{ dataBr(a.vigenciaInicio) }} ·
          } @else {
            {{ a.veiculosHoje === 1 ? '1 veículo coberto hoje' : a.veiculosHoje + ' veículos cobertos hoje' }} ·
          }
          parcelas somam {{ moeda(a.totalParcelas) }} de {{ moeda(a.valor) }}
          @if (a.renovadaPor) {
            . Renovada pela apólice {{ a.renovadaPor.numero }} a partir de {{ dataBr(a.renovadaPor.vigenciaInicio) }}: os veículos seguem cobertos.
          } @else if (a.situacao !== 'VIGENTE' && a.diasParaComecar <= 0) {
            . Renove antes do fim da vigência para os veículos não ficarem descobertos.
          }
        </geo-callout>
      } @else if (renovacaoDe(); as r) {
        <geo-callout tone="info" icon="pi pi-replay" [dense]="true" title="Renovação da apólice {{ r.numero }}">
          Seguradora, corretor, base, setor e os veículos cobertos no fim da vigência já vieram preenchidos. Confira o número, a vigência e o valor da nova apólice.
        </geo-callout>
      }

      <geo-form-section title="Apólice" icon="pi pi-shield">
        <div class="geo-form-grid">
          <geo-text-input label="Número da apólice" [required]="true" [(value)]="numero" [maxlength]="60" [disabled]="!podeEditar()" [error]="erro('numero')"></geo-text-input>
          <geo-select label="Seguradora" [required]="true" [options]="opcoesSeguradora()" [(value)]="seguradora" [filter]="true" [disabled]="!podeEditar()"
            [loading]="carregandoSeguradoras()" [error]="erro('seguradora')"></geo-select>
          <geo-select label="Corretor" [options]="opcoesCorretor()" [(value)]="corretor" [filter]="true" [clearable]="true" [showOptional]="true"
            [disabled]="!podeEditar()" [loading]="carregandoSeguradoras()"></geo-select>
          <geo-text-input label="Segurado" [(value)]="segurado" [maxlength]="150" [showOptional]="true" [disabled]="!podeEditar()"
            placeholder="Ex.: Nome da empresa"></geo-text-input>
        </div>
        @if (podeEditar() && !novoFornecedor()) {
          <div class="links">
            <span>Não está na lista?</span>
            <geo-button variant="link" size="sm" icon="pi pi-plus" label="Incluir seguradora" (pressed)="abrirNovoFornecedor('SEGURADORA')"></geo-button>
            <geo-button variant="link" size="sm" icon="pi pi-plus" label="Incluir corretora" (pressed)="abrirNovoFornecedor('CORRETORA')"></geo-button>
          </div>
        }
        @if (novoFornecedor(); as papel) {
          <div class="bloco">
            <span class="bloco__titulo">{{ papel === 'SEGURADORA' ? 'Incluir seguradora' : 'Incluir corretora' }}</span>
            @if (!fornecedorDoZero()) {
              <p class="bloco__texto">Escolha no cadastro de fornecedores do financeiro. Ela passa a aparecer em Cadastros › Seguradoras e corretoras.</p>
              <div class="acoes">
                <geo-select label="Fornecedor do financeiro" [required]="true" [options]="opcoesFornecedorNovo()" [(value)]="fornecedorEscolhido" [filter]="true"
                  filterPlaceholder="Nome do fornecedor" [loading]="carregandoFornecedores()"></geo-select>
                <geo-button variant="ghost" label="Cancelar" (pressed)="novoFornecedor.set(null)"></geo-button>
                <geo-button icon="pi pi-check" label="Incluir" [disabled]="!fornecedorEscolhido()" [loading]="gravandoFornecedor()"
                  (pressed)="incluirSeguradora(papel, fornecedorEscolhido()!)"></geo-button>
              </div>
              @if (podeCadastrarFornecedor()) {
                <div class="links">
                  <span>Não está no financeiro?</span>
                  <geo-button variant="link" size="sm" icon="pi pi-plus" label="Cadastrar fornecedor" (pressed)="fornecedorDoZero.set(true)"></geo-button>
                </div>
              }
            } @else {
              <p class="bloco__texto">Entra no cadastro de fornecedores do financeiro, que confere e homologa depois.</p>
              <div class="acoes">
                <geo-text-input label="Nome" [required]="true" [(value)]="fornecedorNome" [maxlength]="150"></geo-text-input>
                <geo-text-input label="CNPJ" [(value)]="fornecedorCnpj" [maxlength]="18" [showOptional]="true" placeholder="Só números"></geo-text-input>
                <geo-button variant="ghost" label="Voltar" (pressed)="fornecedorDoZero.set(false)"></geo-button>
                <geo-button icon="pi pi-check" label="Cadastrar" [disabled]="!fornecedorNome().trim()" [loading]="gravandoFornecedor()" (pressed)="cadastrarFornecedor(papel)"></geo-button>
              </div>
            }
          </div>
        }
        <div class="geo-form-grid">
          <geo-datepicker label="Início da vigência" [required]="true" [(value)]="inicio" [disabled]="!podeEditar()" [error]="erro('inicio')"></geo-datepicker>
          <geo-datepicker label="Fim da vigência" [required]="true" [(value)]="fim" [minDate]="inicio() ?? undefined" [disabled]="!podeEditar()"
            [error]="erro('fim')" description="O aviso de vencimento segue as faixas da frota."></geo-datepicker>
          <geo-number-input label="Valor (prêmio)" [required]="true" mode="currency" [(value)]="valor" [min]="0" [disabled]="!podeEditar()" [error]="erro('valor')"></geo-number-input>
          <geo-number-input label="Franquia" mode="currency" [(value)]="franquia" [min]="0" [showOptional]="true" [disabled]="!podeEditar()"></geo-number-input>
        </div>
        <div class="geo-form-grid">
          <geo-select label="Base" [required]="true" [options]="bases()" [(value)]="base" [filter]="true" [disabled]="!podeEditar()"
            description="Vai para o pagamento das parcelas." [error]="erro('base')"></geo-select>
          <geo-select label="Setor" [required]="true" [options]="processos()" description="Centro de custo do pagamento das parcelas." [(value)]="processo" [filter]="true"
            [disabled]="!podeEditar()" [error]="erro('processo')"></geo-select>
        </div>
        @if (!apolice()) {
          <geo-multiselect label="Veículos cobertos" [options]="opcoesVeiculo()" [(value)]="idsVeiculo" [filter]="true" [showOptional]="true"
            [maxSelectedLabels]="0" [selectedItemsLabel]="idsVeiculo().length === 1 ? '1 veículo' : '{0} veículos'"
            filterPlaceholder="Placa, modelo ou base" [description]="descricaoVeiculos()"></geo-multiselect>
        }
        <geo-textarea label="Observação" [(value)]="observacao" [rows]="2" [maxlength]="1000" [showOptional]="true" [disabled]="!podeEditar()"></geo-textarea>
      </geo-form-section>

      @if (apolice(); as a) {
        <geo-form-section title="Veículos cobertos" icon="pi pi-car" [description]="a.veiculos.length ? undefined : 'Nenhum veículo nesta apólice ainda.'">
          @if (a.veiculos.length) {
            <ul class="linhas">
              @for (c of a.veiculos; track c.id) {
                @let s = situacaoCobertura(c, a);
                <li class="linha" [class.linha--edicao]="encerrando()?.id === c.id">
                  <span class="linha__texto">
                    <strong>{{ placa(c.placa) }}{{ c.modelo ? ' · ' + c.modelo : '' }}</strong>
                    <span>{{ c.inicio | date: 'dd/MM/yyyy' }} a {{ c.fim ? (c.fim | date: 'dd/MM/yyyy') : 'fim da vigência' }}{{ c.motivoEncerramentoRotulo ? ' · ' + c.motivoEncerramentoRotulo : '' }}{{ c.observacaoEncerramento ? ': ' + c.observacaoEncerramento : '' }}</span>
                  </span>
                  <geo-status [tone]="s.tom" [icon]="s.icone">{{ s.rotulo }}</geo-status>
                  @if (podeEditar() && !c.motivoEncerramento) {
                    <geo-icon-button icon="pi pi-calendar-times" [label]="'Tirar o ' + placa(c.placa) + ' da apólice'" tooltip="Veículo saiu da apólice" size="icon-sm"
                      (pressed)="iniciarEncerramento(c)"></geo-icon-button>
                  }
                  @if (podeEditar()) {
                    <geo-icon-button icon="pi pi-trash" [label]="'Retirar ' + placa(c.placa) + ' da apólice'" tooltip="Retirar (lançado por engano)" size="icon-sm"
                      (pressed)="removerCobertura(c)"></geo-icon-button>
                  }
                  @if (encerrando()?.id === c.id) {
                    <div class="acoes acoes--linha">
                      <geo-select label="Motivo" [required]="true" [options]="motivos" [(value)]="motivoEncerramento"></geo-select>
                      <geo-datepicker label="Coberto até" [required]="true" [(value)]="fimCobertura" [minDate]="deData(c.inicio)" [maxDate]="deData(a.vigenciaFim)"></geo-datepicker>
                      <geo-text-input label="Detalhe" [(value)]="observacaoEncerramento" [maxlength]="300" [required]="motivoEncerramento() === 'OUTRO'"
                        [showOptional]="motivoEncerramento() !== 'OUTRO'"></geo-text-input>
                    </div>
                    <geo-callout class="acoes--linha" tone="info" icon="pi pi-info-circle" [dense]="true">
                      Peça à corretora o endosso de exclusão do {{ placa(c.placa) }}: pode haver devolução de parte do prêmio. Anexe o endosso nesta apólice.
                    </geo-callout>
                    <div class="acoes acoes--linha">
                      <span class="rodape__espaco"></span>
                      <geo-button variant="ghost" label="Cancelar" (pressed)="encerrando.set(null)"></geo-button>
                      <geo-button icon="pi pi-check" label="Confirmar saída" [loading]="gravandoItem()" (pressed)="encerrarCobertura(c)"></geo-button>
                    </div>
                  }
                </li>
              }
            </ul>
          }
          @if (podeEditar()) {
            <p class="bloco__texto">Incluir veículo: sem data, fica coberto desde o início da vigência.</p>
            <div class="acoes">
              <geo-select label="Incluir veículo" [options]="opcoesVeiculo()" [(value)]="novoVeiculo" [filter]="true" [clearable]="true"
                filterPlaceholder="Placa, modelo ou base"></geo-select>
              <geo-datepicker label="Desde" [(value)]="novoInicio" [minDate]="deData(a.vigenciaInicio)" [maxDate]="deData(a.vigenciaFim)"
                [clearable]="true"></geo-datepicker>
              <geo-button variant="outline" icon="pi pi-plus" label="Incluir" [disabled]="!novoVeiculo()" [loading]="gravandoItem()" (pressed)="incluirVeiculo()"></geo-button>
            </div>
          }
        </geo-form-section>

        <geo-form-section title="Parcelas" icon="pi pi-wallet" description="Cada parcela vira uma solicitação de pagamento no financeiro.">
          @if (a.parcelas.length) {
            <ul class="linhas">
              @for (p of a.parcelas; track p.id) {
                @let s = pagamento(p);
                <li class="linha" [class.linha--edicao]="editandoParcela()?.id === p.id">
                  <span class="linha__texto">
                    <strong>Parcela {{ p.numero }} · <span class="linha__valor">{{ moeda(p.valor) }}</span></strong>
                    <span>Vence em {{ p.vencimento | date: 'dd/MM/yyyy' }}{{ p.numeroSolicitacaoFinanceira ? ' · solicitação nº ' + p.numeroSolicitacaoFinanceira : '' }}
                      {{ p.motivoReprovacaoPagamento ? ' · ' + p.motivoReprovacaoPagamento : '' }}</span>
                  </span>
                  <geo-status [tone]="s.tom" [icon]="s.icone">{{ s.rotulo }}</geo-status>
                  @if (p.podePedirPagamento && podePedirPagamento() && !modeloPagamento()) {
                    <geo-icon-button icon="pi pi-send" [label]="'Pedir o pagamento da parcela ' + p.numero" tooltip="Pedir pagamento" size="icon-sm"
                      (pressed)="pedirPagamento(p)"></geo-icon-button>
                  }
                  @if (podeEditar() && !travada(p)) {
                    <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir a parcela ' + p.numero" tooltip="Corrigir" size="icon-sm" (pressed)="editarParcela(p)"></geo-icon-button>
                    <geo-icon-button icon="pi pi-trash" [label]="'Excluir a parcela ' + p.numero" tooltip="Excluir" size="icon-sm" (pressed)="removerParcela(p)"></geo-icon-button>
                  }
                </li>
              }
            </ul>
            <p class="totais"><span>Soma das parcelas: <strong>{{ moeda(a.totalParcelas) }}</strong></span>
              @if (a.totalParcelas !== a.valor) { <span>Diferença para o valor da apólice: <strong>{{ moeda(a.valor - a.totalParcelas) }}</strong></span> }</p>

            @if (podePedirPagamento() && opcoesParcelaPedido().length) {
              @if (modeloPagamento(); as m) {
                <div class="bloco">
                  <span class="bloco__titulo">Pedir pagamento sem sair daqui</span>
                  <p class="bloco__texto">Repete o que foi preenchido no pedido da parcela {{ m.numero }}{{ m.numeroSolicitacaoFinanceira ? ' (solicitação nº ' + m.numeroSolicitacaoFinanceira + ')' : '' }}:
                    forma de pagamento, dados bancários, solicitante, base e setor. Troca valor e vencimento e envia para aprovação. Anexe o boleto pela solicitação, se precisar.
                    Já vêm marcadas as vencidas e as que vencem em até 30 dias.</p>
                  <div class="acoes">
                    <geo-multiselect label="Parcelas" [options]="opcoesParcelaPedido()" [(value)]="parcelasPedido" [filter]="false"
                      [maxSelectedLabels]="0" [selectedItemsLabel]="parcelasPedido().length === 1 ? '1 parcela' : '{0} parcelas'"></geo-multiselect>
                    <geo-button icon="pi pi-send" [label]="rotuloPedido()" [disabled]="!parcelasPedido().length" [loading]="pedindo()" (pressed)="pedirEmLote(m)"></geo-button>
                  </div>
                </div>
              } @else {
                <span class="geo-cell-muted">O primeiro pedido abre o formulário do financeiro. Os seguintes repetem os mesmos dados e saem daqui mesmo.</span>
              }
            }
          }
          @if (podeEditar()) {
            @if (editandoParcela() || incluindoParcela()) {
              <div class="acoes">
                <geo-datepicker label="Vencimento" [required]="true" [(value)]="parcelaVencimento"></geo-datepicker>
                <geo-number-input label="Valor" [required]="true" mode="currency" [(value)]="parcelaValor" [min]="0.01"></geo-number-input>
                <geo-button variant="ghost" label="Cancelar" (pressed)="fecharParcela()"></geo-button>
                <geo-button icon="pi pi-check" [label]="editandoParcela() ? 'Salvar parcela ' + editandoParcela()!.numero : 'Incluir parcela'"
                  [loading]="gravandoItem()" (pressed)="salvarParcela()"></geo-button>
              </div>
            } @else if (!a.parcelas.some(enviada)) {
              <div class="acoes">
                <geo-number-input label="Quantidade" [(value)]="quantidade" [min]="1" [max]="24" [maxFractionDigits]="0"></geo-number-input>
                <geo-datepicker label="1º vencimento" [(value)]="primeiroVencimento"></geo-datepicker>
                <geo-button variant="outline" icon="pi pi-bolt" [label]="a.parcelas.length ? 'Gerar de novo' : 'Gerar parcelas'"
                  [disabled]="!quantidade() || !primeiroVencimento()" [loading]="gravandoItem()" (pressed)="gerarParcelas()"></geo-button>
              </div>
              <span class="geo-cell-muted">Divide {{ moeda(a.valor) }} em parcelas mensais; a diferença dos centavos fica na primeira.</span>
            } @else {
              <geo-button variant="outline" size="sm" icon="pi pi-plus" label="Incluir parcela" (pressed)="incluirParcela()"></geo-button>
            }
          }
        </geo-form-section>

        <geo-form-section title="Anexos" icon="pi pi-paperclip">
          <app-frota-anexos [anexos]="a.anexos" [podeEditar]="podeEditar()" [(arquivo)]="arquivo" rotulo="Apólice, endosso ou boleto"
            (baixar)="baixar($event)" (remover)="removerAnexo($event)"></app-frota-anexos>
        </geo-form-section>
      } @else {
        <geo-form-section title="Anexo" icon="pi pi-paperclip">
          <app-frota-anexos [podeEditar]="true" [(arquivo)]="arquivo" rotulo="Apólice"></app-frota-anexos>
        </geo-form-section>
      }

      <div drawer-footer class="rodape">
        @if (apolice() && podeEditar()) {
          <geo-button variant="ghost" icon="pi pi-trash" label="Excluir" (pressed)="excluir()"></geo-button>
          @if (!apolice()!.renovadaPor) {
            <geo-button variant="outline" icon="pi pi-replay" label="Renovar" (pressed)="pedirRenovacao()"></geo-button>
          }
        }
        <span class="rodape__espaco"></span>
        <geo-button variant="ghost" [label]="podeEditar() ? 'Cancelar' : 'Fechar'" (pressed)="visivel.set(false)"></geo-button>
        @if (podeEditar()) {
          <geo-button icon="pi pi-check" [label]="apolice() ? 'Salvar' : renovacaoDe() ? 'Cadastrar renovação' : 'Cadastrar apólice'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        }
      </div>
    </geo-form-drawer>
  `
})
export class FrotaApoliceDrawerComponent {
  private readonly servico = inject(FrotaSeguroService);
  private readonly financeiro = inject(FinanceiroService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly router = inject(Router);
  private readonly acesso = acessoFrota();

  readonly visivel = model(false);
  readonly apolice = input<Apolice | null>(null);
  /** Apólice que está sendo renovada: o cadastro novo vem preenchido a partir dela. */
  readonly renovacaoDe = input<Apolice | null>(null);
  readonly veiculos = input<VeiculoSeguro[]>([]);
  readonly fornecedores = input<FornecedorFrota[]>([]);
  readonly carregandoFornecedores = input(false);
  readonly bases = input<GeoSelectOption<string>[]>([]);
  readonly processos = input<GeoSelectOption<string>[]>([]);
  readonly podeEditar = input(false);
  readonly podePedirPagamento = input(false);
  /** Veículos já escolhidos no cadastro (aba Seguro da ficha, ou os sem seguro da lista). */
  readonly idsVeiculoIniciais = input<string[]>([]);
  readonly salva = output<Apolice>();
  readonly excluida = output<void>();
  /** Pediu para renovar a apólice aberta: quem abriu o painel troca para o cadastro da renovação. */
  readonly renovar = output<Apolice>();

  protected readonly moeda = moeda;
  protected readonly dataBr = dataBr;
  protected readonly placa = formatarPlaca;
  protected readonly vigencia = vigenciaApolice;
  protected readonly pagamento = pagamentoParcela;
  protected readonly situacaoCobertura = coberturaNaApolice;
  protected readonly motivos = MOTIVOS_ENCERRAMENTO;
  protected readonly deData = (iso: string) => deDataIso(iso) ?? undefined;
  protected readonly enviada = (p: ParcelaApolice) => p.situacaoPagamento !== null;
  protected readonly travada = (p: ParcelaApolice) => p.situacaoPagamento === 'SOLICITADO' || p.situacaoPagamento === 'APROVADO';
  protected readonly podeCadastrarFornecedor = computed(() => this.podeEditar() && this.acesso.cadastrarFornecedor());

  protected readonly numero = signal('');
  protected readonly seguradora = signal<string | null>(null);
  protected readonly corretor = signal<string | null>(null);
  protected readonly segurado = signal('');
  protected readonly inicio = signal<Date | null>(null);
  protected readonly fim = signal<Date | null>(null);
  protected readonly valor = signal<number | null>(null);
  protected readonly franquia = signal<number | null>(null);
  protected readonly base = signal<string | null>(null);
  protected readonly processo = signal<string | null>(null);
  protected readonly observacao = signal('');
  protected readonly idsVeiculo = signal<string[]>([]);
  protected readonly arquivo = signal<File | null>(null);
  protected readonly salvando = signal(false);
  protected readonly gravandoItem = signal(false);
  protected readonly tentou = signal(false);
  private readonly snapshot = signal('');

  protected readonly novoVeiculo = signal<string | null>(null);
  protected readonly novoInicio = signal<Date | null>(null);
  protected readonly encerrando = signal<CoberturaApolice | null>(null);
  protected readonly fimCobertura = signal<Date | null>(null);
  protected readonly motivoEncerramento = signal<MotivoEncerramentoCobertura | null>(null);
  protected readonly observacaoEncerramento = signal('');
  protected readonly quantidade = signal<number | null>(12);
  protected readonly primeiroVencimento = signal<Date | null>(null);
  protected readonly editandoParcela = signal<ParcelaApolice | null>(null);
  protected readonly incluindoParcela = signal(false);
  protected readonly parcelaVencimento = signal<Date | null>(null);
  protected readonly parcelaValor = signal<number | null>(null);
  protected readonly parcelasPedido = signal<string[]>([]);
  protected readonly pedindo = signal(false);

  protected readonly novoFornecedor = signal<PapelSeguradora | null>(null);
  protected readonly fornecedorDoZero = signal(false);
  protected readonly fornecedorEscolhido = signal<string | null>(null);
  /** Cadastro de seguradoras e corretoras: é dele que saem as opções da apólice. */
  private readonly seguradorasCadastro = signal<SeguradoraFrota[]>([]);
  protected readonly carregandoSeguradoras = signal(false);
  protected readonly fornecedorNome = signal('');
  protected readonly fornecedorCnpj = signal('');
  protected readonly gravandoFornecedor = signal(false);
  private readonly fornecedoresNovos = signal<FornecedorFrota[]>([]);

  /** Seguro de hoje de cada veículo, para a escolha mostrar base e cobertura. */
  private readonly coberturas = signal<Map<string, CoberturaVeiculo>>(new Map());

  protected readonly titulo = computed(() => {
    const a = this.apolice();
    if (a) return 'Apólice ' + a.numero;
    return this.renovacaoDe() ? 'Renovar apólice ' + this.renovacaoDe()!.numero : 'Cadastrar apólice';
  });
  protected readonly descricao = computed(() => {
    const a = this.apolice();
    return a
      ? `${a.seguradora ?? 'Seguradora'} · vigência ${dataBr(a.vigenciaInicio)} a ${dataBr(a.vigenciaFim)}`
      : 'Seguradora, vigência, valor e os veículos cobertos. Depois de salvar, lance as parcelas e anexe a apólice.';
  });
  private readonly todosFornecedores = computed(() => {
    const ids = new Set(this.fornecedores().map((f) => f.id));
    return [...this.fornecedores(), ...this.fornecedoresNovos().filter((f) => !ids.has(f.id))];
  });
  protected readonly opcoesSeguradora = computed(() => this.opcoesPapel('SEGURADORA', this.seguradora()));
  protected readonly opcoesCorretor = computed(() => this.opcoesPapel('CORRETORA', this.corretor()));
  /** Fornecedores que ainda não estão no papel que se quer incluir. */
  protected readonly opcoesFornecedorNovo = computed<GeoSelectOption<string>[]>(() => {
    const papel = this.novoFornecedor();
    const usados = new Set(this.seguradorasCadastro().filter((s) => s.ativo && s.papel === papel).map((s) => s.idFornecedor));
    return this.todosFornecedores().filter((f) => !usados.has(f.id)).map((f) => ({ label: f.nome, value: f.id }));
  });
  protected readonly opcoesVeiculo = computed<GeoSelectOption<string>[]>(() => {
    const coberturas = this.coberturas();
    return this.veiculos().map((v) => ({
      label: rotuloVeiculoSeguro(formatarPlaca(v.placa), v.modelo, coberturas.get(v.idVeiculo)),
      value: v.idVeiculo
    }));
  });
  protected readonly descricaoVeiculos = computed(() => {
    const ids = new Set(this.idsVeiculo());
    if (!ids.size) return 'Cobertos por toda a vigência. Depois de salvar, inclua ou tire veículos com o período certo.';
    return 'Escolhidos: ' + this.veiculos().filter((v) => ids.has(v.idVeiculo)).map((v) => formatarPlaca(v.placa)).join(', ') + '.';
  });

  /** Última parcela já pedida: o modelo dos próximos pedidos. */
  protected readonly modeloPagamento = computed(() =>
    [...(this.apolice()?.parcelas ?? [])].filter((p) => p.idSolicitacaoFinanceira).sort((x, y) => y.numero - x.numero)[0] ?? null);
  protected readonly opcoesParcelaPedido = computed<GeoSelectOption<string>[]>(() =>
    (this.apolice()?.parcelas ?? []).filter((p) => p.podePedirPagamento)
      .map((p) => ({ label: `Parcela ${p.numero} · ${moeda(p.valor)} · vence ${dataBr(p.vencimento)}`, value: p.id })));
  protected readonly rotuloPedido = computed(() => {
    const n = this.parcelasPedido().length;
    return n === 1 ? 'Pedir pagamento de 1 parcela' : `Pedir pagamento de ${n} parcelas`;
  });

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.numero().trim()) e['numero'] = 'Informe o número.';
    if (!this.seguradora()) e['seguradora'] = 'Escolha a seguradora.';
    if (!this.inicio()) e['inicio'] = 'Informe o início.';
    if (!this.fim()) e['fim'] = 'Informe o fim.';
    else if (this.inicio() && this.fim()! < this.inicio()!) e['fim'] = 'O fim não pode ser antes do início.';
    if (this.valor() === null || this.valor()! < 0) e['valor'] = 'Informe o valor.';
    if (!this.base()) e['base'] = 'Escolha a base: o pagamento das parcelas precisa dela.';
    if (!this.processo()) e['processo'] = 'Escolha o setor: o pagamento das parcelas precisa dele.';
    return e;
  });
  protected readonly alterado = computed(() => !!this.arquivo() || this.snapshot() !== JSON.stringify(this.request()));

  constructor() {
    effect(() => {
      if (this.visivel()) {
        const a = this.apolice();
        const renovacao = this.renovacaoDe();
        untracked(() => this.preencher(a, renovacao));
      }
    });
    effect(() => {
      if (this.visivel() && this.podeEditar()) untracked(() => (this.carregarCoberturas(), this.carregarSeguradoras()));
    });
  }

  protected erro(campo: string): string | undefined {
    return this.tentou() ? this.erros()[campo] : undefined;
  }

  protected salvar(): void {
    this.tentou.set(true);
    if (Object.keys(this.erros()).length) {
      this.notificacoes.warning('Revise os campos destacados antes de salvar.');
      return;
    }
    const existente = this.apolice();
    const arquivo = this.arquivo();
    this.salvando.set(true);
    this.servico.salvarApolice(this.request(), existente?.id)
      .pipe(switchMap((a) => (arquivo ? this.servico.anexarApolice(a.id, arquivo) : of(a))))
      .subscribe({
        next: (a) => {
          this.salvando.set(false);
          this.arquivo.set(null);
          this.snapshot.set(JSON.stringify(this.request()));
          this.notificacoes.success(existente ? 'Apólice atualizada.'
            : this.renovacaoDe() ? `Renovação cadastrada. A apólice ${this.renovacaoDe()!.numero} para de avisar o vencimento.`
              : 'Apólice cadastrada. Lance as parcelas para pagar pelo financeiro.');
          this.salva.emit(a);
          this.carregarCoberturas();
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
  }

  protected async pedirRenovacao(): Promise<void> {
    const a = this.apolice();
    if (!a) return;
    if (this.alterado()) {
      const ok = await this.confirmacao.confirm({
        title: 'Descartar alterações?',
        message: 'Há alterações nesta apólice que não foram salvas. Renovar descarta essas alterações.',
        variant: 'destructive'
      });
      if (!ok) return;
    }
    this.renovar.emit(a);
  }

  protected abrirNovoFornecedor(papel: PapelSeguradora): void {
    this.fornecedorNome.set('');
    this.fornecedorCnpj.set('');
    this.fornecedorEscolhido.set(null);
    this.fornecedorDoZero.set(false);
    this.novoFornecedor.set(papel);
  }

  /** Inclui o fornecedor no cadastro de seguradoras (ou corretoras) e já o escolhe na apólice. */
  protected incluirSeguradora(papel: PapelSeguradora, idFornecedor: string): void {
    this.gravandoFornecedor.set(true);
    this.servico.salvarSeguradora({ idFornecedor, papel, telefoneAssistencia: null, observacao: null }).subscribe({
      next: (s) => {
        this.gravandoFornecedor.set(false);
        this.seguradorasCadastro.update((lista) => [...lista, s]);
        (papel === 'SEGURADORA' ? this.seguradora : this.corretor).set(s.idFornecedor);
        this.novoFornecedor.set(null);
        this.notificacoes.success(`${s.nome} incluída como ${s.papelRotulo.toLowerCase()} e escolhida na apólice.`);
      },
      error: (e) => {
        this.gravandoFornecedor.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected cadastrarFornecedor(papel: PapelSeguradora): void {
    const nome = this.fornecedorNome().trim();
    if (!nome) return;
    const documento = this.fornecedorCnpj().replace(/\D/g, '') || null;
    this.gravandoFornecedor.set(true);
    this.financeiro.criarFornecedor({ nomeFantasia: nome, documento }).subscribe({
      next: (f) => {
        this.fornecedoresNovos.update((lista) => [...lista, { id: f.id, nome: f.nomeFantasia }]);
        this.incluirSeguradora(papel, f.id);
      },
      error: (e) => {
        this.gravandoFornecedor.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected incluirVeiculo(): void {
    const a = this.apolice();
    const idVeiculo = this.novoVeiculo();
    if (!a || !idVeiculo) return;
    this.executar(this.servico.incluirVeiculo(a.id, idVeiculo, paraDataIso(this.novoInicio()), null), 'Veículo incluído na apólice.', () => {
      this.novoVeiculo.set(null);
      this.novoInicio.set(null);
      this.carregarCoberturas();
    });
  }

  protected iniciarEncerramento(c: CoberturaApolice): void {
    this.encerrando.set(c);
    this.fimCobertura.set(new Date());
    this.motivoEncerramento.set(null);
    this.observacaoEncerramento.set('');
  }

  protected encerrarCobertura(c: CoberturaApolice): void {
    const a = this.apolice();
    const fim = paraDataIso(this.fimCobertura());
    const motivo = this.motivoEncerramento();
    const observacao = this.observacaoEncerramento().trim() || null;
    if (!a || !fim || !motivo) {
      this.notificacoes.warning('Informe o motivo e até quando o veículo ficou coberto.');
      return;
    }
    if (motivo === 'OUTRO' && !observacao) {
      this.notificacoes.warning('Descreva o motivo da saída do veículo.');
      return;
    }
    this.executar(this.servico.encerrarCobertura(a.id, c.id, fim, motivo, observacao),
      `O ${formatarPlaca(c.placa)} saiu da apólice. Lembre de pedir o endosso à corretora.`, () => {
        this.encerrando.set(null);
        this.carregarCoberturas();
      });
  }

  protected async removerCobertura(c: CoberturaApolice): Promise<void> {
    const a = this.apolice();
    if (!a) return;
    const ok = await this.confirmacao.confirm({
      title: 'Retirar veículo',
      message: `Retirar o ${formatarPlaca(c.placa)} desta apólice? Use só para lançamento por engano; se o veículo saiu do seguro, use "Veículo saiu da apólice".`,
      variant: 'destructive'
    });
    if (ok) this.executar(this.servico.removerCobertura(a.id, c.id), 'Veículo retirado da apólice.', () => this.carregarCoberturas());
  }

  protected gerarParcelas(): void {
    const a = this.apolice();
    const primeiro = paraDataIso(this.primeiroVencimento());
    if (!a || !primeiro || !this.quantidade()) return;
    this.executar(this.servico.gerarParcelas(a.id, this.quantidade()!, primeiro, null), 'Parcelas geradas.');
  }

  protected incluirParcela(): void {
    this.editandoParcela.set(null);
    this.incluindoParcela.set(true);
    this.parcelaVencimento.set(null);
    this.parcelaValor.set(null);
  }

  protected editarParcela(p: ParcelaApolice): void {
    this.incluindoParcela.set(false);
    this.editandoParcela.set(p);
    this.parcelaVencimento.set(deDataIso(p.vencimento));
    this.parcelaValor.set(p.valor);
  }

  protected fecharParcela(): void {
    this.editandoParcela.set(null);
    this.incluindoParcela.set(false);
  }

  protected salvarParcela(): void {
    const a = this.apolice();
    const vencimento = paraDataIso(this.parcelaVencimento());
    const valor = this.parcelaValor();
    if (!a || !vencimento || !valor) {
      this.notificacoes.warning('Informe o vencimento e o valor da parcela.');
      return;
    }
    const editando = this.editandoParcela();
    this.executar(this.servico.salvarParcela(a.id, vencimento, valor, editando?.id), editando ? 'Parcela corrigida.' : 'Parcela incluída.',
      () => this.fecharParcela());
  }

  protected async removerParcela(p: ParcelaApolice): Promise<void> {
    const a = this.apolice();
    if (!a) return;
    const ok = await this.confirmacao.confirm({ title: 'Excluir parcela', message: `Excluir a parcela ${p.numero} de ${moeda(p.valor)}?`, variant: 'destructive' });
    if (ok) this.executar(this.servico.removerParcela(a.id, p.id), 'Parcela excluída.');
  }

  /** Primeiro pedido: abre o pagamento no financeiro já preenchido com a parcela. */
  protected pedirPagamento(p: ParcelaApolice): void {
    this.visivel.set(false);
    navegarAposFecharDrawer(this.router, ['/financeiro', 'pagamentos', 'nova'], 1000, { queryParams: { origem: 'FROTA_SEGURO', origemId: p.id } });
  }

  /**
   * Pedidos seguintes: copia a solicitação da última parcela pedida, troca o que é da parcela
   * (valor, vencimento, observação) e envia cada uma para aprovação, uma de cada vez.
   */
  protected pedirEmLote(modelo: ParcelaApolice): void {
    const a = this.apolice();
    const ids = this.parcelasPedido();
    if (!a || !ids.length || !modelo.idSolicitacaoFinanceira) return;
    this.pedindo.set(true);
    this.financeiro.buscarSolicitacao('PAGAMENTO', modelo.idSolicitacaoFinanceira).pipe(
      switchMap((base) => from(ids).pipe(
        concatMap((id) => this.servico.preenchimentoFinanceiro(id).pipe(
          switchMap((pre) => this.financeiro.criarSolicitacao('PAGAMENTO', {
            formularioId: base.formulario.id,
            valores: mesclarValores(base, pre),
            origem: { tipo: 'FROTA_SEGURO', id }
          })),
          switchMap((nova) => this.financeiro.submeter('PAGAMENTO', nova.id).pipe(
            map(() => 'enviada' as const),
            catchError(() => of('rascunho' as const)))),
          catchError((e) => of({ erro: getErrorMessage(e) }))
        )),
        toArray()
      )),
      switchMap((resultados) => this.servico.buscarApolice(a.id).pipe(map((atualizada) => ({ resultados, atualizada }))))
    ).subscribe({
      next: ({ resultados, atualizada }) => {
        this.pedindo.set(false);
        const enviadas = resultados.filter((r) => r === 'enviada').length;
        const rascunhos = resultados.filter((r) => r === 'rascunho').length;
        const falhas = resultados.filter((r): r is { erro: string } => typeof r === 'object');
        if (enviadas) this.notificacoes.success(enviadas === 1 ? '1 pagamento enviado para aprovação.' : `${enviadas} pagamentos enviados para aprovação.`);
        if (rascunhos) this.notificacoes.warning(`${rascunhos} ficaram como rascunho no financeiro: abra a solicitação para completar e enviar.`);
        if (falhas.length) this.notificacoes.error(`${falhas.length} não foram pedidas: ${falhas[0].erro}`);
        this.salva.emit(atualizada);
      },
      error: (e) => {
        this.pedindo.set(false);
        this.notificacoes.error(`Não foi possível ler o pedido da parcela ${modelo.numero} para repetir: ${getErrorMessage(e)}`);
      }
    });
  }

  protected baixar(anexo: AnexoFrota): void {
    const a = this.apolice();
    if (!a) return;
    this.servico.baixarAnexoApolice(a.id, anexo.id).subscribe({
      next: (blob) => salvarArquivo(blob, anexo.nome),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async removerAnexo(anexo: AnexoFrota): Promise<void> {
    const a = this.apolice();
    if (!a) return;
    const ok = await this.confirmacao.confirm({ title: 'Remover anexo', message: `Remover ${anexo.nome} desta apólice?`, variant: 'destructive' });
    if (ok) this.executar(this.servico.removerAnexoApolice(a.id, anexo.id), 'Anexo removido.');
  }

  protected async excluir(): Promise<void> {
    const a = this.apolice();
    if (!a) return;
    const ok = await this.confirmacao.confirm({
      title: 'Excluir apólice',
      message: `Excluir a apólice ${a.numero}? Os veículos deixam de aparecer como cobertos por ela.`,
      variant: 'destructive'
    });
    if (!ok) return;
    this.servico.excluirApolice(a.id).subscribe({
      next: () => {
        this.notificacoes.success('Apólice excluída.');
        this.visivel.set(false);
        this.excluida.emit();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  /** As ativas do cadastro no papel; a já gravada na apólice continua na lista mesmo se saiu dele. */
  private opcoesPapel(papel: PapelSeguradora, atual: string | null): GeoSelectOption<string>[] {
    const opcoes = this.seguradorasCadastro()
      .filter((s) => s.ativo && s.papel === papel)
      .map((s) => ({ label: s.nome, value: s.idFornecedor }));
    if (atual && !opcoes.some((o) => o.value === atual)) {
      const nome = this.todosFornecedores().find((f) => f.id === atual)?.nome
        ?? (papel === 'SEGURADORA' ? this.apolice()?.seguradora : this.apolice()?.corretor) ?? 'Fornecedor';
      opcoes.unshift({ label: nome, value: atual });
    }
    return opcoes;
  }

  private carregarSeguradoras(): void {
    this.carregandoSeguradoras.set(true);
    this.servico.listarSeguradoras().subscribe({
      next: (lista) => (this.seguradorasCadastro.set(lista), this.carregandoSeguradoras.set(false)),
      error: () => this.carregandoSeguradoras.set(false)
    });
  }

  private carregarCoberturas(): void {
    this.servico.coberturaVeiculos().subscribe({
      next: (lista) => this.coberturas.set(new Map(lista.map((c) => [c.idVeiculo, c]))),
      error: () => undefined
    });
  }

  /** Ações que gravam na hora (veículos, parcelas, anexos) e devolvem a apólice atualizada. */
  private executar(operacao: Observable<Apolice>, mensagem: string, depois?: () => void): void {
    this.gravandoItem.set(true);
    operacao.subscribe({
      next: (a) => {
        this.gravandoItem.set(false);
        this.notificacoes.success(mensagem);
        depois?.();
        this.salva.emit(a);
      },
      error: (e) => {
        this.gravandoItem.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private preencher(a: Apolice | null, renovacao: Apolice | null): void {
    const origem = a ?? renovacao;
    this.tentou.set(false);
    this.novoFornecedor.set(null);
    this.numero.set(a?.numero ?? '');
    this.seguradora.set(origem?.idSeguradora ?? null);
    this.corretor.set(origem?.idCorretor ?? null);
    this.segurado.set(origem?.segurado ?? '');
    this.valor.set(origem?.valor ?? null);
    this.franquia.set(origem?.franquia ?? null);
    this.base.set(origem?.idBaseOperacional ?? null);
    this.processo.set(origem?.idProcesso ?? null);
    this.arquivo.set(null);
    this.encerrando.set(null);
    this.fecharParcela();
    if (a) {
      this.inicio.set(deDataIso(a.vigenciaInicio));
      this.fim.set(deDataIso(a.vigenciaFim));
      this.observacao.set(a.observacao ?? '');
      this.idsVeiculo.set([]);
      this.primeiroVencimento.set(deDataIso(a.vigenciaInicio));
      this.parcelasPedido.set(a.parcelas.filter((p) => p.podePedirPagamento && (p.pedirEmBreve || p.vencida)).map((p) => p.id));
    } else if (renovacao) {
      // A nova vigência começa no dia seguinte ao fim da atual e dura o mesmo ano.
      const inicio = deDataIso(renovacao.vigenciaFim)!;
      inicio.setDate(inicio.getDate() + 1);
      const fim = new Date(inicio);
      fim.setFullYear(fim.getFullYear() + 1);
      fim.setDate(fim.getDate() - 1);
      this.inicio.set(inicio);
      this.fim.set(fim);
      this.observacao.set(`Renovação da apólice ${renovacao.numero}.`);
      this.idsVeiculo.set([...new Set(renovacao.veiculos.filter((c) => (c.fim ?? renovacao.vigenciaFim) >= renovacao.vigenciaFim).map((c) => c.idVeiculo))]);
    } else {
      this.inicio.set(null);
      this.fim.set(null);
      this.observacao.set('');
      this.idsVeiculo.set([...this.idsVeiculoIniciais()]);
    }
    this.snapshot.set(JSON.stringify(this.request()));
  }

  private request(): ApoliceRequest {
    const texto = (v: string) => (v.trim() ? v.trim() : null);
    return {
      numero: this.numero().trim(),
      idSeguradora: this.seguradora() ?? '',
      idCorretor: this.corretor(),
      segurado: texto(this.segurado()),
      idBaseOperacional: this.base(),
      idProcesso: this.processo(),
      vigenciaInicio: paraDataIso(this.inicio()) ?? '',
      vigenciaFim: paraDataIso(this.fim()) ?? '',
      valor: this.valor() ?? 0,
      franquia: this.franquia(),
      observacao: texto(this.observacao()),
      ...(this.apolice() ? {} : { idsVeiculo: this.idsVeiculo() })
    };
  }
}

/**
 * Valores da nova solicitação: os da solicitação modelo, com o que é da parcela por cima. Só entram
 * as chaves que o formulário modelo tem (o preenchimento traz também a descrição, que ele não tem).
 */
function mesclarValores(modelo: SolicitacaoFinanceira, preenchimento: PreenchimentoFinanceiro): Record<string, unknown> {
  const valores: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(modelo.valores)) {
    if (v?.valor !== null && v?.valor !== undefined && v.valor !== '') valores[chave] = v.valor;
  }
  for (const chave of ['valor', 'vencimento', 'observacoes', 'fornecedorId', 'baseId', 'processoId']) {
    const novo = preenchimento.valores[chave];
    if (novo !== undefined && novo !== null && chave in modelo.valores) valores[chave] = novo;
  }
  return valores;
}
