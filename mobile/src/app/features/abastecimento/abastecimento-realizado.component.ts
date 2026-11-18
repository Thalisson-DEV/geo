import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AbastecimentoLocal,
  FotoAbastecimentoLocal,
  ItemRealizadoLocal,
  ItemServidor,
  RealizadoLocal,
  formatarMoeda,
  formatarQuantidade,
  novoRealizado,
  pendenciasRealizado,
  podeRegistrarRealizado,
  precoNoPosto,
  precoUnitario,
  quantidadeAutorizada,
  valorPeloPreco
} from '../../core/frota/abastecimento.models';
import { AbastecimentoService } from '../../core/frota/abastecimento.service';
import { erroTravaMedicao, formatarPlaca, intervaloAceito } from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { prepararEvidencia } from '../../core/sst/evidencia-foto.util';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { SyncService } from '../../core/sync/sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, OpcaoSeletor, SeletorComponent, VazioComponent } from '../../ui';

type Passo = 'valores' | 'fotos' | 'revisao';
const PASSOS: Passo[] = ['valores', 'fotos', 'revisao'];
const TITULOS: Record<Passo, string> = { valores: 'Litros e valores', fotos: 'Fotos', revisao: 'Conferir' };

/**
 * Registro do abastecimento feito no posto: o que foi entregue (o produto pode ter mudado no posto),
 * quantidade, valor e se encheu o tanque; a medição depois; a foto do painel e a do cupom.
 * Rascunho contínuo no aparelho e envio pela fila, como o pedido.
 */
@Component({
  selector: 'app-abastecimento-realizado',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <ces-barra-topo titulo="Registrar abastecimento" [subtitulo]="titulos[passo()] + ' · ' + (indice() + 1) + ' de ' + passos.length"
        navegacao="fechar" (voltar)="fechar()">
        <span class="auto-salvo" role="status" aria-label="Salvo automaticamente"><ces-icone nome="check" [tamanho]="14" />Salvo</span>
      </ces-barra-topo>
      <div class="passos" aria-hidden="true">
        @for (p of passos; track p) { <i [class.feito]="$index <= indice()"></i> }
      </div>

      @if (carregado() && (!pedido() || !realizado())) {
        <ces-vazio icone="combustivel" titulo="Este pedido não está liberado"
          texto="Só dá para registrar o abastecimento depois que o administrativo liberar. Atualize a lista de pedidos." />
      } @else if (pedido(); as a) {
        @let r = realizado()!;
        <div class="cartao">
          <span class="ces-selo ces-selo--ok"><ces-icone nome="combustivel" /></span>
          <span class="cartao__texto">
            <strong class="ces-num">{{ placa(a.placa) }}</strong>
            <span>{{ a.servidor!.posto }} · liberado até as 23h59</span>
          </span>
        </div>

        <section class="conteudo" [attr.aria-label]="titulos[passo()]">
          @switch (passo()) {
            @case ('valores') {
              @for (i of r.itens; track i.idItem) {
                @let pedidoItem = itemDoPedido(i.idItem);
                <h2 class="ces-secao"><span>{{ nomeEntregue(i) }}</span><span class="ces-num">liberado {{ quantidadeTexto(autorizada(pedidoItem), pedidoItem.unidade) }}</span></h2>
                <div class="campos item">
                  @if (opcoesProduto(pedidoItem).length > 1) {
                    <ces-seletor rotulo="Produto entregue" [opcoes]="opcoesProduto(pedidoItem)" [valor]="i.idProduto ?? pedidoItem.idProdutoPedido"
                      (valorChange)="alterarItem(i.idItem, { idProduto: $event === pedidoItem.idProdutoPedido ? null : $event })"
                      [aberto]="seletorAberto() === i.idItem" (abertoChange)="seletorAberto.set($event ? i.idItem : null)" />
                    @if (i.idProduto) {
                      <p class="ces-faixa-estado ces-faixa-estado--atencao"><ces-icone nome="info" [tamanho]="18" /><span>Trocado no posto: o pedido era {{ pedidoItem.produtoPedido }}. Fica registrado para o gestor.</span></p>
                    }
                  }
                  <div class="par">
                    <label class="valor" [class.valor--erro]="tentou() && !i.quantidade">
                      <span class="valor__rotulo">{{ pedidoItem.unidade.toUpperCase() === 'L' ? 'Litros' : 'Quantidade' }}</span>
                      <span class="valor__linha">
                        <input class="ces-num" type="text" inputmode="decimal" autocomplete="off" placeholder="0,0" [value]="digitado(i.idItem + ':q', i.quantidade)"
                          (input)="alterarItem(i.idItem, { quantidade: numero($any($event.target).value, i.idItem + ':q') })" [attr.aria-label]="'Quantidade de ' + nomeEntregue(i)">
                        <span>{{ pedidoItem.unidade.toUpperCase() === 'L' ? 'l' : 'un' }}</span>
                      </span>
                    </label>
                    @if (i.precoPosto != null) {
                      <!-- Preço do cadastro do posto: a equipe não digita valor na correria (gestores, 23/10/2026). -->
                      <div class="valor valor--calculado" role="group" [attr.aria-label]="'Valor de ' + nomeEntregue(i)">
                        <span class="valor__rotulo">Valor</span>
                        <span class="valor__linha"><b class="ces-num">{{ moeda(i.valorTotal) }}</b></span>
                      </div>
                    } @else {
                      <label class="valor" [class.valor--erro]="tentou() && !!i.quantidade && !i.valorTotal">
                        <span class="valor__rotulo">Valor pago</span>
                        <span class="valor__linha">
                          <span>R$</span>
                          <input class="ces-num" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" [value]="digitado(i.idItem + ':v', i.valorTotal)"
                            (input)="alterarItem(i.idItem, { valorTotal: numero($any($event.target).value, i.idItem + ':v') })" [attr.aria-label]="'Valor pago por ' + nomeEntregue(i)">
                        </span>
                      </label>
                    }
                  </div>
                  @if (i.precoPosto != null) {
                    <p class="apoio">Pelo preço do posto: <b class="ces-num">R$ {{ i.precoPosto.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) }}</b> por {{ pedidoItem.unidade.toUpperCase() === 'L' ? 'litro' : 'unidade' }}. Se o tanque encheu antes, corrija só a quantidade.</p>
                  } @else {
                    <p class="ces-faixa-estado ces-faixa-estado--atencao"><ces-icone nome="info" [tamanho]="18" /><span>O posto não tem preço deste produto cadastrado: informe o valor do cupom. O administrativo é avisado.</span></p>
                    @if (preco(i); as p) {
                      <p class="apoio">Saiu a <b class="ces-num">R$ {{ p.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) }}</b> por {{ pedidoItem.unidade.toUpperCase() === 'L' ? 'litro' : 'unidade' }}. Confira com o cupom.</p>
                    }
                  }
                  @if (pedidoItem.categoria === 'COMBUSTIVEL') {
                    <button type="button" role="switch" class="interruptor" [attr.aria-checked]="i.tanqueCheio" (click)="alterarItem(i.idItem, { tanqueCheio: !i.tanqueCheio })">
                      <span class="txt"><b>Encheu o tanque</b><span>Com o tanque cheio o GEO calcula o consumo (km/l).</span></span>
                      <span class="trilho" aria-hidden="true"><span></span></span>
                    </button>
                  }
                </div>
              }

              <h2 class="ces-secao">{{ horas() ? 'Horímetro depois' : 'KM depois de abastecer' }}</h2>
              <div class="campos">
                <label class="medida" [class.medida--erro]="(tentou() && r.medicao === null) || !!erroMedicao()">
                  <span class="ces-sr-only">{{ horas() ? 'Horas no horímetro' : 'KM no painel' }}</span>
                  <input class="medida__valor ces-num" type="text" inputmode="numeric" autocomplete="off" placeholder="0" [value]="r.medicao ?? ''"
                    (input)="definirMedicao($any($event.target).value)">
                  <span class="medida__unidade">{{ horas() ? 'h' : 'km' }}</span>
                </label>
                @if (tentou() && r.medicao === null) { <p class="falta" role="alert">Informe a medição que aparece no painel agora.</p> }
                @else if (erroMedicao(); as erro) {
                  <p class="ces-faixa-estado ces-faixa-estado--erro" role="alert"><ces-icone nome="alerta" [tamanho]="18" />
                    <span>{{ erro }} {{ intervalo() }}.</span></p>
                } @else if (a.servidor!.medicaoSolicitacao != null) {
                  <p class="apoio">No pedido: <b class="ces-num">{{ medicaoTexto(a.servidor!.medicaoSolicitacao) }}</b>{{ intervalo() ? ' · ' + intervalo() : '' }}</p>
                }
              </div>
            }

            @case ('fotos') {
              <p class="ces-faixa-estado"><ces-icone nome="camera" [tamanho]="18" /><span>As duas fotos comprovam o abastecimento. Toque em cada uma para fotografar.</span></p>
              <ul class="fotos">
                @for (f of fotos; track f.campo) {
                  <li>
                    <label class="foto" [class.foto--feita]="!!r[f.campo]" [class.foto--pendente]="tentou() && !r[f.campo]">
                      @if (r[f.campo] && previa(r[f.campo]!); as url) {
                        <img [src]="url" [alt]="f.rotulo">
                        <span class="foto__ok" aria-hidden="true"><ces-icone nome="check" [tamanho]="14" /></span>
                        <span class="foto__refazer">Refazer</span>
                      } @else {
                        <ces-icone [nome]="f.icone" [tamanho]="26" />
                        <span class="foto__tirar">Tirar foto</span>
                      }
                      <input type="file" accept="image/*" capture="environment" class="ces-sr-only" [attr.aria-label]="f.rotulo" (change)="fotografar($event, f.campo)">
                    </label>
                    <span class="foto__rotulo">{{ f.rotulo }}</span>
                    <span class="foto__dica">{{ f.dica }}</span>
                  </li>
                }
              </ul>
            }

            @case ('revisao') {
              <dl class="resumo">
                @for (i of r.itens; track i.idItem) {
                  <div>
                    <dt>{{ nomeEntregue(i) }}{{ i.tanqueCheio ? ' · tanque cheio' : '' }}</dt>
                    <dd class="ces-num">{{ quantidadeTexto(i.quantidade, itemDoPedido(i.idItem).unidade) }} · {{ moeda(i.valorTotal) }}</dd>
                  </div>
                }
                <div><dt>Total</dt><dd class="ces-num total">{{ moeda(total()) }}</dd></div>
                <div><dt>{{ horas() ? 'Horímetro depois' : 'KM depois' }}</dt><dd class="ces-num">{{ r.medicao != null ? medicaoTexto(r.medicao) : '—' }}</dd></div>
              </dl>
              <div class="revisao-fotos">
                @for (f of fotos; track f.campo) {
                  @if (r[f.campo] && previa(r[f.campo]!); as url) { <figure><img [src]="url" [alt]="f.rotulo"><figcaption>{{ f.rotulo }}</figcaption></figure> }
                }
              </div>
              <p class="dica"><ces-icone nome="nuvem" [tamanho]="18" />Sem internet, fica salvo no aparelho com as fotos e vai sozinho quando o sinal voltar.</p>
            }
          }
        </section>
      }
    </div>

    @if (pedido() && realizado()) {
      <footer class="rodape">
        @if (indice() > 0) { <button type="button" class="ces-btn ces-btn--neutro" (click)="voltar()">Voltar</button> }
        <button type="button" class="ces-btn ces-btn--principal principal" (click)="avancar()" [disabled]="salvando() || preparandoFoto()">
          @if (passo() === 'revisao') { {{ salvando() ? 'Salvando…' : 'Registrar abastecimento' }} }
          @else if (preparandoFoto()) { Preparando a foto… }
          @else { Continuar <ces-icone nome="seta" [tamanho]="18" /> }
        </button>
      </footer>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--ces-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--ces-e5); }
    .auto-salvo { display: inline-flex; align-items: center; gap: 4px; font: 500 .75rem/1.2 var(--ces-fonte); color: var(--ces-ok); white-space: nowrap; }
    .passos { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 0 var(--ces-e5) var(--ces-e3); }
    .passos i { height: 4px; border-radius: var(--ces-r-pilula); background: var(--ces-linha); transition: background-color var(--ces-m-entrar); }
    .passos i.feito { background: var(--ces-destaque); }
    .conteudo { animation: entrar var(--ces-m-entrar) var(--ces-curva); }
    @keyframes entrar { from { opacity: 0; transform: translateY(6px); } }
    .cartao { display: flex; align-items: center; gap: var(--ces-e3); margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e3) var(--ces-e4);
      background: var(--ces-superficie); border-radius: var(--ces-r-grupo); }
    .cartao__texto { flex: 1; min-width: 0; display: grid; gap: 1px; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .cartao__texto strong { font: 600 1.0625rem/1.3 var(--ces-fonte); letter-spacing: .02em; color: var(--ces-texto); }
    .campos { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--ces-e2); padding: 0 var(--ces-e3); }
    .ces-faixa-estado { margin: var(--ces-e3) var(--ces-e3) 0; }
    .campos .ces-faixa-estado { margin: 0; }
    .ces-faixa-estado span { flex: 1; font: var(--ces-t-apoio); font-size: .875rem; }
    .apoio, .dica { margin: 0; padding: 0 var(--ces-e1); font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .dica { display: flex; gap: var(--ces-e2); margin: var(--ces-e5) var(--ces-e5) 0; padding: 0; }
    .falta { margin: 0; padding: 0 var(--ces-e1); color: var(--ces-erro); font: var(--ces-t-apoio); font-weight: 600; }
    .par { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ces-e2); }
    .valor--calculado { background: var(--ces-fundo-2, var(--ces-superficie)); }
    .valor { display: grid; gap: 4px; padding: var(--ces-e2) var(--ces-e4); min-height: 64px; background: var(--ces-superficie);
      border: 1.5px solid var(--ces-linha); border-radius: var(--ces-r-campo); cursor: text; }
    .valor:focus-within { border-color: var(--ces-destaque); box-shadow: 0 0 0 3px var(--ces-destaque-suave); }
    .valor--erro { border-color: var(--ces-erro); }
    .valor__rotulo { font: 500 .75rem/1.2 var(--ces-fonte); color: var(--ces-texto-2); }
    .valor__linha { display: flex; align-items: baseline; gap: 4px; font: 500 .9375rem/1 var(--ces-fonte); color: var(--ces-texto-2); }
    .valor__linha input { flex: 1; min-width: 0; width: 100%; padding: 0; border: 0; background: transparent; color: var(--ces-texto); font: 700 1.375rem/1.1 var(--ces-fonte); }
    .valor__linha input:focus { outline: none; }
    .medida { display: flex; align-items: center; gap: var(--ces-e2); padding: 0 var(--ces-e4); min-height: 64px; background: var(--ces-superficie);
      border: 1.5px solid var(--ces-linha); border-radius: var(--ces-r-campo); cursor: text; }
    .medida:focus-within { border-color: var(--ces-destaque); box-shadow: 0 0 0 3px var(--ces-destaque-suave); }
    .medida--erro { border-color: var(--ces-erro); }
    .medida--atencao { border-color: var(--ces-atencao); }
    .medida__valor { flex: 1; min-width: 0; width: 100%; align-self: stretch; padding: 0; border: 0; background: transparent; color: var(--ces-texto); font: 600 1.75rem/1 var(--ces-fonte); }
    .medida__valor:focus { outline: none; }
    .medida__unidade { font: 500 1rem/1 var(--ces-fonte); color: var(--ces-texto-2); }
    .interruptor { display: flex; align-items: center; gap: var(--ces-e3); min-height: 56px; padding: var(--ces-e2) var(--ces-e4); border: 0; border-radius: var(--ces-r-grupo);
      background: var(--ces-superficie); color: var(--ces-texto); text-align: left; cursor: pointer; }
    .interruptor .txt { flex: 1; display: grid; gap: 2px; }
    .interruptor .txt span { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .trilho { width: 48px; height: 28px; border-radius: 14px; background: var(--ces-linha-forte); position: relative; flex: none; transition: background-color var(--ces-m-entrar); }
    .trilho span { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform var(--ces-m-entrar) var(--ces-curva); }
    [aria-checked='true'] .trilho { background: var(--ces-ok); }
    [aria-checked='true'] .trilho span { transform: translateX(20px); }
    .fotos { list-style: none; margin: var(--ces-e3) 0 0; padding: 0 var(--ces-e3); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ces-e3); }
    .fotos li { display: grid; gap: 4px; min-width: 0; }
    .foto { position: relative; display: grid; place-content: center; justify-items: center; gap: 6px; aspect-ratio: 3 / 4; overflow: hidden;
      border-radius: var(--ces-r-grupo); border: 1.5px dashed var(--ces-linha-forte); background: var(--ces-superficie); color: var(--ces-destaque); cursor: pointer; }
    .foto:active { transform: scale(.98); }
    .foto--feita { border: 0; }
    .foto--pendente { border-color: var(--ces-erro); border-style: solid; background: var(--ces-erro-suave); }
    .foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .foto__tirar { font: 600 .875rem/1 var(--ces-fonte); }
    .foto__ok { position: absolute; top: 6px; left: 6px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--ces-ok); color: var(--ces-fundo); }
    .foto__refazer { position: absolute; right: 6px; bottom: 6px; padding: 4px 8px; border-radius: var(--ces-r-pilula); background: rgba(0, 0, 0, .6); color: #fff; font: 600 .6875rem/1 var(--ces-fonte); }
    .foto__rotulo { font: var(--ces-t-corpo-forte); font-size: .9375rem; color: var(--ces-texto); padding: 0 2px; }
    .foto__dica { font: var(--ces-t-apoio); color: var(--ces-texto-2); padding: 0 2px; }
    .resumo { margin: var(--ces-e3) var(--ces-e3) 0; padding: var(--ces-e1) var(--ces-e4); background: var(--ces-superficie); border-radius: var(--ces-r-grupo); }
    .resumo > div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--ces-e3); padding: var(--ces-e3) 0; border-bottom: 1px solid var(--ces-linha); }
    .resumo > div:last-child { border-bottom: 0; }
    .resumo dt { font: var(--ces-t-corpo); color: var(--ces-texto-2); }
    .resumo dd { margin: 0; font: var(--ces-t-corpo-forte); text-align: right; }
    .resumo .total { font-size: 1.125rem; }
    .revisao-fotos { display: flex; gap: var(--ces-e3); padding: var(--ces-e3) var(--ces-e3) 0; }
    .revisao-fotos figure { margin: 0; display: grid; gap: 4px; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .revisao-fotos img { width: 88px; height: 66px; border-radius: 10px; object-fit: cover; }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--ces-e3); padding: var(--ces-e3) var(--ces-e4) calc(var(--ces-e3) + var(--ces-safe-base));
      background: var(--ces-fundo); border-top: 1px solid var(--ces-linha); }
    .rodape .principal { flex: 1; min-height: var(--ces-alvo-principal); font-size: 1rem; }
  `]
})
export class AbastecimentoRealizadoComponent implements OnInit, OnDestroy {
  private readonly servico = inject(AbastecimentoService);
  private readonly frota = inject(ChecklistVeiculoService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rede = inject(ConnectivityService);
  private readonly sync = inject(SyncService);

  /** Id do pedido (id do aparelho), da rota. */
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly passos = PASSOS;
  protected readonly titulos = TITULOS;
  protected readonly moeda = formatarMoeda;
  protected readonly fotos = [
    { campo: 'fotoPainel' as const, rotulo: 'Painel depois', icone: 'camera' as const, dica: 'KM e o ponteiro do tanque cheio' },
    { campo: 'fotoCupom' as const, rotulo: 'Cupom ou nota', icone: 'documento' as const, dica: 'Litros, valor e o posto legíveis' }
  ];
  protected readonly pedido = signal<AbastecimentoLocal | null>(null);
  protected readonly realizado = signal<RealizadoLocal | null>(null);
  protected readonly carregado = signal(false);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly preparandoFoto = signal(false);
  protected readonly seletorAberto = signal<string | null>(null);
  protected readonly passoAtual = signal(0);
  private readonly previas = new Map<string, string>();

  protected readonly indice = computed(() => this.passoAtual());
  protected readonly passo = computed(() => PASSOS[this.indice()]);
  protected readonly horas = computed(() =>
    this.frota.catalogo()?.veiculos.find((v) => v.idVeiculo === this.pedido()?.idVeiculo)?.unidadeMedicao === 'HORAS');
  /** Referência da trava: a maior entre o último KM do veículo e o do pedido. */
  private readonly referencia = computed(() => {
    const veiculo = this.frota.catalogo()?.veiculos.find((v) => v.idVeiculo === this.pedido()?.idVeiculo);
    const pedido = this.pedido()?.servidor?.medicaoSolicitacao ?? null;
    const ultimo = veiculo?.medicaoAtual ?? null;
    const valor = ultimo == null ? pedido : pedido == null ? ultimo : Math.max(ultimo, pedido);
    return { valor, limite: veiculo?.limiteSalto ?? null, unidade: veiculo?.unidadeMedicao ?? 'KM' as const };
  });
  protected readonly erroMedicao = computed(() => {
    const ref = this.referencia();
    return erroTravaMedicao(this.realizado()?.medicao ?? null, ref.valor, ref.limite, ref.unidade);
  });
  protected readonly intervalo = computed(() => {
    const ref = this.referencia();
    return intervaloAceito(ref.valor, ref.limite, ref.unidade);
  });
  protected readonly total = computed(() => Math.round((this.realizado()?.itens.reduce((t, i) => t + (i.valorTotal ?? 0), 0) ?? 0) * 100) / 100);

  async ngOnInit(): Promise<void> {
    if (!this.servico.catalogo()) await this.servico.carregarCatalogoLocal();
    if (!this.frota.catalogo()) await this.frota.carregarCatalogoLocal();
    const a = (await this.servico.buscar(this.id)) ?? null;
    if (a && podeRegistrarRealizado(a)) {
      this.pedido.set(a);
      // Recusado volta a ser rascunho para corrigir; o que já foi preenchido continua.
      const r = a.realizado ? { ...a.realizado, statusSync: 'RASCUNHO' as const, erro: null } : novoRealizado(a.servidor!, this.servico.catalogo());
      this.realizado.set(r);
      if (a.realizado?.statusSync === 'ERRO') this.passoAtual.set(PASSOS.length - 1);
    }
    this.carregado.set(true);
  }

  ngOnDestroy(): void {
    this.previas.forEach((url) => URL.revokeObjectURL(url));
  }

  protected placa(placa: string | null): string {
    return formatarPlaca(placa);
  }

  protected itemDoPedido(idItem: string): ItemServidor {
    return this.pedido()!.servidor!.itens.find((i) => i.id === idItem)!;
  }

  protected nomeEntregue(i: ItemRealizadoLocal): string {
    const pedidoItem = this.itemDoPedido(i.idItem);
    if (!i.idProduto) return pedidoItem.produtoPedido;
    return this.servico.catalogo()?.produtos.find((p) => p.id === i.idProduto)?.nome ?? pedidoItem.produtoPedido;
  }

  /** Para trocar no posto: os produtos da mesma categoria (S10 por S500, outro óleo…). */
  protected opcoesProduto(item: ItemServidor): OpcaoSeletor[] {
    return (this.servico.catalogo()?.produtos ?? [])
      .filter((p) => p.categoria === item.categoria)
      .map((p) => ({ valor: p.id, rotulo: p.nome, apoio: p.id === item.idProdutoPedido ? 'O que foi pedido' : undefined }));
  }

  protected quantidadeTexto(valor: number | null, unidade: string): string {
    return formatarQuantidade(valor, unidade);
  }

  protected medicaoTexto(valor: number): string {
    return `${valor.toLocaleString('pt-BR')} ${this.horas() ? 'h' : 'km'}`;
  }

  protected preco(i: ItemRealizadoLocal): number | null {
    return precoUnitario(i);
  }

  /** O campo mostra o que a pessoa digitou ("79,80", "10,"); o número vai para o registro. */
  private readonly textos = new Map<string, string>();

  protected digitado(chave: string, valor: number | null): string {
    if (this.textos.has(chave)) return this.textos.get(chave)!;
    if (valor === null) return '';
    // Valor em reais sempre com duas casas, como no cupom.
    return (chave.endsWith(':v') ? valor.toFixed(2) : String(valor)).replace('.', ',');
  }

  protected numero(texto: string, chave: string): number | null {
    this.textos.set(chave, texto);
    const limpo = texto.replace(/[^\d,]/g, '');
    if (!limpo) return null;
    const n = Number(limpo.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  protected previa(f: FotoAbastecimentoLocal): string | null {
    if (!f.arquivo.size) return null;
    let url = this.previas.get(f.idFoto);
    if (!url) {
      url = URL.createObjectURL(f.arquivo);
      this.previas.set(f.idFoto, url);
    }
    return url;
  }

  private atualizar(mudanca: Partial<RealizadoLocal>): void {
    const novo = { ...this.realizado()!, ...mudanca };
    this.realizado.set(novo);
    void this.servico.salvarRealizado(this.pedido()!, novo);
  }

  protected autorizada(item: ItemServidor): number | null {
    return quantidadeAutorizada(item);
  }

  /** Com o preço do posto, o valor acompanha a quantidade e o produto entregue. */
  protected alterarItem(idItem: string, mudanca: Partial<ItemRealizadoLocal>): void {
    const s = this.pedido()!.servidor!;
    this.atualizar({ itens: this.realizado()!.itens.map((i) => {
      if (i.idItem !== idItem) return i;
      const novo = { ...i, ...mudanca };
      if ('idProduto' in mudanca) {
        const produto = novo.idProduto ?? this.itemDoPedido(idItem).idProdutoPedido;
        novo.precoPosto = precoNoPosto(this.servico.catalogo(), s.idPosto, produto);
      }
      if (novo.precoPosto != null) novo.valorTotal = valorPeloPreco(novo.quantidade, novo.precoPosto);
      return novo;
    }) });
  }

  protected definirMedicao(texto: string): void {
    const digitos = texto.replace(/\D/g, '');
    this.atualizar({ medicao: digitos ? Number(digitos) : null });
  }

  protected async fotografar(evento: Event, campo: 'fotoPainel' | 'fotoCupom'): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    this.preparandoFoto.set(true);
    try {
      const preparada = await prepararEvidencia(arquivo);
      this.atualizar({ [campo]: { idFoto: crypto.randomUUID(), arquivo: preparada.arquivo, nomeArquivo: preparada.nomeArquivo, enviada: false } });
    } catch {
      this.toast.error('Não foi possível ler a foto. Tente de novo.');
    } finally {
      this.preparandoFoto.set(false);
    }
  }

  protected voltar(): void {
    this.tentou.set(false);
    this.passoAtual.set(Math.max(0, this.indice() - 1));
  }

  protected async avancar(): Promise<void> {
    this.tentou.set(true);
    const pend = pendenciasRealizado(this.realizado()!);
    const p = this.passo();
    if ((p === 'valores' && (pend.valores || this.erroMedicao())) || (p === 'fotos' && pend.fotos)) return;
    this.tentou.set(false);
    if (p !== 'revisao') {
      this.passoAtual.set(this.indice() + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    this.salvando.set(true);
    try {
      await this.servico.enfileirarRealizado(this.pedido()!, { ...this.realizado()!, realizadoEm: new Date().toISOString() });
      this.toast.success(this.rede.isOnline() ? 'Abastecimento registrado. Enviando…' : 'Registro salvo no aparelho. Vai sozinho quando o sinal voltar.');
      if (this.rede.isOnline()) void this.sync.syncOutbox().catch(() => undefined);
      await this.router.navigate(['/abastecimento']);
    } finally {
      this.salvando.set(false);
    }
  }

  protected fechar(): void {
    void this.router.navigate(['/abastecimento']);
  }
}
