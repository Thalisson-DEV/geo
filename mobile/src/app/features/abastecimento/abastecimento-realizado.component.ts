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
      <geo-barra-topo titulo="Registrar abastecimento" [subtitulo]="titulos[passo()] + ' · ' + (indice() + 1) + ' de ' + passos.length"
        navegacao="fechar" (voltar)="fechar()">
        <span class="auto-salvo" role="status" aria-label="Salvo automaticamente"><geo-icone nome="check" [tamanho]="14" />Salvo</span>
      </geo-barra-topo>
      <div class="passos" aria-hidden="true">
        @for (p of passos; track p) { <i [class.feito]="$index <= indice()"></i> }
      </div>

      @if (carregado() && (!pedido() || !realizado())) {
        <geo-vazio icone="combustivel" titulo="Este pedido não está liberado"
          texto="Só dá para registrar o abastecimento depois que o administrativo liberar. Atualize a lista de pedidos." />
      } @else if (pedido(); as a) {
        @let r = realizado()!;
        <div class="cartao">
          <span class="geo-selo geo-selo--ok"><geo-icone nome="combustivel" /></span>
          <span class="cartao__texto">
            <strong class="geo-num">{{ placa(a.placa) }}</strong>
            <span>{{ a.servidor!.posto }} · liberado até as 23h59</span>
          </span>
        </div>

        <section class="conteudo" [attr.aria-label]="titulos[passo()]">
          @switch (passo()) {
            @case ('valores') {
              @for (i of r.itens; track i.idItem) {
                @let pedidoItem = itemDoPedido(i.idItem);
                <h2 class="geo-secao"><span>{{ nomeEntregue(i) }}</span><span class="geo-num">liberado {{ quantidadeTexto(autorizada(pedidoItem), pedidoItem.unidade) }}</span></h2>
                <div class="campos item">
                  @if (opcoesProduto(pedidoItem).length > 1) {
                    <geo-seletor rotulo="Produto entregue" [opcoes]="opcoesProduto(pedidoItem)" [valor]="i.idProduto ?? pedidoItem.idProdutoPedido"
                      (valorChange)="alterarItem(i.idItem, { idProduto: $event === pedidoItem.idProdutoPedido ? null : $event })"
                      [aberto]="seletorAberto() === i.idItem" (abertoChange)="seletorAberto.set($event ? i.idItem : null)" />
                    @if (i.idProduto) {
                      <p class="geo-faixa-estado geo-faixa-estado--atencao"><geo-icone nome="info" [tamanho]="18" /><span>Trocado no posto: o pedido era {{ pedidoItem.produtoPedido }}. Fica registrado para o gestor.</span></p>
                    }
                  }
                  <div class="par">
                    <label class="valor" [class.valor--erro]="tentou() && !i.quantidade">
                      <span class="valor__rotulo">{{ pedidoItem.unidade.toUpperCase() === 'L' ? 'Litros' : 'Quantidade' }}</span>
                      <span class="valor__linha">
                        <input class="geo-num" type="text" inputmode="decimal" autocomplete="off" placeholder="0,0" [value]="digitado(i.idItem + ':q', i.quantidade)"
                          (input)="alterarItem(i.idItem, { quantidade: numero($any($event.target).value, i.idItem + ':q') })" [attr.aria-label]="'Quantidade de ' + nomeEntregue(i)">
                        <span>{{ pedidoItem.unidade.toUpperCase() === 'L' ? 'l' : 'un' }}</span>
                      </span>
                    </label>
                    @if (i.precoPosto != null) {
                      <!-- Preço do cadastro do posto: a equipe não digita valor na correria (gestores, 23/10/2026). -->
                      <div class="valor valor--calculado" role="group" [attr.aria-label]="'Valor de ' + nomeEntregue(i)">
                        <span class="valor__rotulo">Valor</span>
                        <span class="valor__linha"><b class="geo-num">{{ moeda(i.valorTotal) }}</b></span>
                      </div>
                    } @else {
                      <label class="valor" [class.valor--erro]="tentou() && !!i.quantidade && !i.valorTotal">
                        <span class="valor__rotulo">Valor pago</span>
                        <span class="valor__linha">
                          <span>R$</span>
                          <input class="geo-num" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" [value]="digitado(i.idItem + ':v', i.valorTotal)"
                            (input)="alterarItem(i.idItem, { valorTotal: numero($any($event.target).value, i.idItem + ':v') })" [attr.aria-label]="'Valor pago por ' + nomeEntregue(i)">
                        </span>
                      </label>
                    }
                  </div>
                  @if (i.precoPosto != null) {
                    <p class="apoio">Pelo preço do posto: <b class="geo-num">R$ {{ i.precoPosto.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) }}</b> por {{ pedidoItem.unidade.toUpperCase() === 'L' ? 'litro' : 'unidade' }}. Se o tanque encheu antes, corrija só a quantidade.</p>
                  } @else {
                    <p class="geo-faixa-estado geo-faixa-estado--atencao"><geo-icone nome="info" [tamanho]="18" /><span>O posto não tem preço deste produto cadastrado: informe o valor do cupom. O administrativo é avisado.</span></p>
                    @if (preco(i); as p) {
                      <p class="apoio">Saiu a <b class="geo-num">R$ {{ p.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) }}</b> por {{ pedidoItem.unidade.toUpperCase() === 'L' ? 'litro' : 'unidade' }}. Confira com o cupom.</p>
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

              <h2 class="geo-secao">{{ horas() ? 'Horímetro depois' : 'KM depois de abastecer' }}</h2>
              <div class="campos">
                <label class="medida" [class.medida--erro]="(tentou() && r.medicao === null) || !!erroMedicao()">
                  <span class="geo-sr-only">{{ horas() ? 'Horas no horímetro' : 'KM no painel' }}</span>
                  <input class="medida__valor geo-num" type="text" inputmode="numeric" autocomplete="off" placeholder="0" [value]="r.medicao ?? ''"
                    (input)="definirMedicao($any($event.target).value)">
                  <span class="medida__unidade">{{ horas() ? 'h' : 'km' }}</span>
                </label>
                @if (tentou() && r.medicao === null) { <p class="falta" role="alert">Informe a medição que aparece no painel agora.</p> }
                @else if (erroMedicao(); as erro) {
                  <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" />
                    <span>{{ erro }} {{ intervalo() }}.</span></p>
                } @else if (a.servidor!.medicaoSolicitacao != null) {
                  <p class="apoio">No pedido: <b class="geo-num">{{ medicaoTexto(a.servidor!.medicaoSolicitacao) }}</b>{{ intervalo() ? ' · ' + intervalo() : '' }}</p>
                }
              </div>
            }

            @case ('fotos') {
              <p class="geo-faixa-estado"><geo-icone nome="camera" [tamanho]="18" /><span>As duas fotos comprovam o abastecimento. Toque em cada uma para fotografar.</span></p>
              <ul class="fotos">
                @for (f of fotos; track f.campo) {
                  <li>
                    <label class="foto" [class.foto--feita]="!!r[f.campo]" [class.foto--pendente]="tentou() && !r[f.campo]">
                      @if (r[f.campo] && previa(r[f.campo]!); as url) {
                        <img [src]="url" [alt]="f.rotulo">
                        <span class="foto__ok" aria-hidden="true"><geo-icone nome="check" [tamanho]="14" /></span>
                        <span class="foto__refazer">Refazer</span>
                      } @else {
                        <geo-icone [nome]="f.icone" [tamanho]="26" />
                        <span class="foto__tirar">Tirar foto</span>
                      }
                      <input type="file" accept="image/*" capture="environment" class="geo-sr-only" [attr.aria-label]="f.rotulo" (change)="fotografar($event, f.campo)">
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
                    <dd class="geo-num">{{ quantidadeTexto(i.quantidade, itemDoPedido(i.idItem).unidade) }} · {{ moeda(i.valorTotal) }}</dd>
                  </div>
                }
                <div><dt>Total</dt><dd class="geo-num total">{{ moeda(total()) }}</dd></div>
                <div><dt>{{ horas() ? 'Horímetro depois' : 'KM depois' }}</dt><dd class="geo-num">{{ r.medicao != null ? medicaoTexto(r.medicao) : '—' }}</dd></div>
              </dl>
              <div class="revisao-fotos">
                @for (f of fotos; track f.campo) {
                  @if (r[f.campo] && previa(r[f.campo]!); as url) { <figure><img [src]="url" [alt]="f.rotulo"><figcaption>{{ f.rotulo }}</figcaption></figure> }
                }
              </div>
              <p class="dica"><geo-icone nome="nuvem" [tamanho]="18" />Sem internet, fica salvo no aparelho com as fotos e vai sozinho quando o sinal voltar.</p>
            }
          }
        </section>
      }
    </div>

    @if (pedido() && realizado()) {
      <footer class="rodape">
        @if (indice() > 0) { <button type="button" class="geo-btn geo-btn--neutro" (click)="voltar()">Voltar</button> }
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="avancar()" [disabled]="salvando() || preparandoFoto()">
          @if (passo() === 'revisao') { {{ salvando() ? 'Salvando…' : 'Registrar abastecimento' }} }
          @else if (preparandoFoto()) { Preparando a foto… }
          @else { Continuar <geo-icone nome="seta" [tamanho]="18" /> }
        </button>
      </footer>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .auto-salvo { display: inline-flex; align-items: center; gap: 4px; font: 500 .75rem/1.2 var(--geo-fonte); color: var(--geo-ok); white-space: nowrap; }
    .passos { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 0 var(--geo-e5) var(--geo-e3); }
    .passos i { height: 4px; border-radius: var(--geo-r-pilula); background: var(--geo-linha); transition: background-color var(--geo-m-entrar); }
    .passos i.feito { background: var(--geo-destaque); }
    .conteudo { animation: entrar var(--geo-m-entrar) var(--geo-curva); }
    @keyframes entrar { from { opacity: 0; transform: translateY(6px); } }
    .cartao { display: flex; align-items: center; gap: var(--geo-e3); margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4);
      background: var(--geo-superficie); border-radius: var(--geo-r-grupo); }
    .cartao__texto { flex: 1; min-width: 0; display: grid; gap: 1px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .cartao__texto strong { font: 600 1.0625rem/1.3 var(--geo-fonte); letter-spacing: .02em; color: var(--geo-texto); }
    .campos { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--geo-e2); padding: 0 var(--geo-e3); }
    .geo-faixa-estado { margin: var(--geo-e3) var(--geo-e3) 0; }
    .campos .geo-faixa-estado { margin: 0; }
    .geo-faixa-estado span { flex: 1; font: var(--geo-t-apoio); font-size: .875rem; }
    .apoio, .dica { margin: 0; padding: 0 var(--geo-e1); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .dica { display: flex; gap: var(--geo-e2); margin: var(--geo-e5) var(--geo-e5) 0; padding: 0; }
    .falta { margin: 0; padding: 0 var(--geo-e1); color: var(--geo-erro); font: var(--geo-t-apoio); font-weight: 600; }
    .par { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--geo-e2); }
    .valor--calculado { background: var(--geo-fundo-2, var(--geo-superficie)); }
    .valor { display: grid; gap: 4px; padding: var(--geo-e2) var(--geo-e4); min-height: 64px; background: var(--geo-superficie);
      border: 1.5px solid var(--geo-linha); border-radius: var(--geo-r-campo); cursor: text; }
    .valor:focus-within { border-color: var(--geo-destaque); box-shadow: 0 0 0 3px var(--geo-destaque-suave); }
    .valor--erro { border-color: var(--geo-erro); }
    .valor__rotulo { font: 500 .75rem/1.2 var(--geo-fonte); color: var(--geo-texto-2); }
    .valor__linha { display: flex; align-items: baseline; gap: 4px; font: 500 .9375rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .valor__linha input { flex: 1; min-width: 0; width: 100%; padding: 0; border: 0; background: transparent; color: var(--geo-texto); font: 700 1.375rem/1.1 var(--geo-fonte); }
    .valor__linha input:focus { outline: none; }
    .medida { display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 64px; background: var(--geo-superficie);
      border: 1.5px solid var(--geo-linha); border-radius: var(--geo-r-campo); cursor: text; }
    .medida:focus-within { border-color: var(--geo-destaque); box-shadow: 0 0 0 3px var(--geo-destaque-suave); }
    .medida--erro { border-color: var(--geo-erro); }
    .medida--atencao { border-color: var(--geo-atencao); }
    .medida__valor { flex: 1; min-width: 0; width: 100%; align-self: stretch; padding: 0; border: 0; background: transparent; color: var(--geo-texto); font: 600 1.75rem/1 var(--geo-fonte); }
    .medida__valor:focus { outline: none; }
    .medida__unidade { font: 500 1rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .interruptor { display: flex; align-items: center; gap: var(--geo-e3); min-height: 56px; padding: var(--geo-e2) var(--geo-e4); border: 0; border-radius: var(--geo-r-grupo);
      background: var(--geo-superficie); color: var(--geo-texto); text-align: left; cursor: pointer; }
    .interruptor .txt { flex: 1; display: grid; gap: 2px; }
    .interruptor .txt span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .trilho { width: 48px; height: 28px; border-radius: 14px; background: var(--geo-linha-forte); position: relative; flex: none; transition: background-color var(--geo-m-entrar); }
    .trilho span { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform var(--geo-m-entrar) var(--geo-curva); }
    [aria-checked='true'] .trilho { background: var(--geo-ok); }
    [aria-checked='true'] .trilho span { transform: translateX(20px); }
    .fotos { list-style: none; margin: var(--geo-e3) 0 0; padding: 0 var(--geo-e3); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--geo-e3); }
    .fotos li { display: grid; gap: 4px; min-width: 0; }
    .foto { position: relative; display: grid; place-content: center; justify-items: center; gap: 6px; aspect-ratio: 3 / 4; overflow: hidden;
      border-radius: var(--geo-r-grupo); border: 1.5px dashed var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-destaque); cursor: pointer; }
    .foto:active { transform: scale(.98); }
    .foto--feita { border: 0; }
    .foto--pendente { border-color: var(--geo-erro); border-style: solid; background: var(--geo-erro-suave); }
    .foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .foto__tirar { font: 600 .875rem/1 var(--geo-fonte); }
    .foto__ok { position: absolute; top: 6px; left: 6px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--geo-ok); color: var(--geo-fundo); }
    .foto__refazer { position: absolute; right: 6px; bottom: 6px; padding: 4px 8px; border-radius: var(--geo-r-pilula); background: rgba(0, 0, 0, .6); color: #fff; font: 600 .6875rem/1 var(--geo-fonte); }
    .foto__rotulo { font: var(--geo-t-corpo-forte); font-size: .9375rem; color: var(--geo-texto); padding: 0 2px; }
    .foto__dica { font: var(--geo-t-apoio); color: var(--geo-texto-2); padding: 0 2px; }
    .resumo { margin: var(--geo-e3) var(--geo-e3) 0; padding: var(--geo-e1) var(--geo-e4); background: var(--geo-superficie); border-radius: var(--geo-r-grupo); }
    .resumo > div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--geo-e3); padding: var(--geo-e3) 0; border-bottom: 1px solid var(--geo-linha); }
    .resumo > div:last-child { border-bottom: 0; }
    .resumo dt { font: var(--geo-t-corpo); color: var(--geo-texto-2); }
    .resumo dd { margin: 0; font: var(--geo-t-corpo-forte); text-align: right; }
    .resumo .total { font-size: 1.125rem; }
    .revisao-fotos { display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e3) 0; }
    .revisao-fotos figure { margin: 0; display: grid; gap: 4px; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .revisao-fotos img { width: 88px; height: 66px; border-radius: 10px; object-fit: cover; }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .principal { flex: 1; min-height: var(--geo-alvo-principal); font-size: 1rem; }
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
