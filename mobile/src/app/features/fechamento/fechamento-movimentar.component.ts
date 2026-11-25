import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { QuantidadeUnidadeComponent } from '../../ui/quantidade-unidade.component';
import { Equivalencia, daBase, paraBase } from '../../core/almox/unidade-material';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, debounceTime, of, switchMap } from 'rxjs';
import { FechamentoDetalhe, MovimentarFechamentoRequest, PreviaSaldo } from '../../core/fechamento/fechamento.models';
import { falhaDeConexao, mensagemFalha, rotaFechamento, rotuloObra, tipoFechamento } from '../../core/fechamento/fechamento-ui';
import { FechamentoService } from '../../core/fechamento/fechamento.service';
import { ApiError } from '../../core/http/error.interceptor';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, IndicadorRedeComponent, QuantidadeComponent, VazioComponent, numeroBr } from '../../ui';
import { BaseFechamento } from './fechamento.routes';
import { PreviaSaldoComponent } from './previa-saldo.component';

/** quantidade na unidade escolhida; pendente e pedido na unidade do material. */
interface ItemMovimentar { id: string; codigo: string; descricao: string; unidade: string; pedido: number; pendente: number; quantidade: number;
  equivalencias: Equivalencia[]; unidadeEscolhida: string | null }

/**
 * Marcar como movimentado: quanto de cada material (pode ser parte). Toda movimentação muda o
 * saldo (almoxarifado ↔ obra). Falta de saldo só avisa: o lado que perde fica negativo.
 */
@Component({
  selector: 'app-fechamento-movimentar',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, IndicadorRedeComponent, PreviaSaldoComponent, QuantidadeComponent, QuantidadeUnidadeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo titulo="Movimentar" [subtitulo]="det() ? tipo().nome : 'Carregando…'" navegacao="fechar" rotuloFechar="Fechar sem movimentar" (voltar)="fechar()">
        <geo-indicador-rede />
      </geo-barra-topo>

      @if (carregando()) {
        <div class="geo-esqueletos" aria-busy="true"><div class="geo-esqueleto" style="height: 96px"></div><div class="geo-esqueleto" style="height: 240px"></div></div>
      } @else if (erro()) {
        <geo-vazio icone="alerta" titulo="Não foi possível preparar a movimentação" [texto]="erro()">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
        </geo-vazio>
      } @else if (det(); as d) {
        <section class="resumo" aria-label="Solicitação">
          <span class="rotulo">Obra</span><strong class="obra">{{ obra() }}</strong>
          @if (d.reserva?.numero; as r) { <span class="rotulo">Reserva</span><strong class="geo-num">{{ r }}</strong> }
        </section>

        <div class="barra-itens">
          <span class="geo-num"><strong>{{ marcados() }}</strong> de {{ itens().length }} {{ itens().length === 1 ? 'material' : 'materiais' }}</span>
          <span class="botoes">
            <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="tudo()">Tudo o que falta</button>
            <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="zerar()" [disabled]="!marcados()">Zerar</button>
          </span>
        </div>
        <ul class="geo-grupo itens">
          @for (it of itens(); track it.id; let i = $index) {
            <li class="geo-linha item" [class.zerado]="!it.quantidade">
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo">{{ it.descricao }}</span>
                <span class="geo-linha__apoio geo-num">Cód. {{ it.codigo }} · falta {{ num(it.pendente) }} de {{ num(it.pedido) }} {{ it.unidade }}</span>
              </span>
              @if (it.equivalencias.length) {
                <geo-quantidade-unidade [material]="{ unidadeMedida: it.unidade, equivalencias: it.equivalencias }" [valor]="it.quantidade" (valorChange)="definirQuantidade(i, $event)"
                  [unidade]="it.unidadeEscolhida" (unidadeChange)="definirUnidade(i, $event)" [minimo]="0" [rotulo]="'quantidade a movimentar de ' + it.descricao" />
              } @else {
                <geo-quantidade [valor]="it.quantidade" (valorChange)="definirQuantidade(i, $event)" [minimo]="0" [grande]="true" [unidade]="it.unidade"
                  [rotulo]="'quantidade a movimentar de ' + it.descricao" />
              }
            </li>
          }
        </ul>

        <h2 class="geo-secao"><span>Para onde vai o material</span></h2>
        <p class="rota geo-num"><span>{{ rota().de }}</span><geo-icone nome="seta" [tamanho]="16" /><strong>{{ rota().para }}</strong></p>
        <p class="rota-dica">O saldo do GEO muda junto, igual ao SAP.</p>
        <div #aviso class="previa"><app-previa-saldo [previa]="previa()" /></div>
      }
    </div>

    @if (det()) {
      <footer class="rodape" data-acao-fixa>
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="confirmar()" [disabled]="enviando() || !marcados() || !rede.isOnline()">
          {{ enviando() ? 'Movimentando…' : !rede.isOnline() ? 'Sem internet' : confirmando() ? 'Toque de novo para confirmar' : 'Confirmar movimentação' }}</button>
      </footer>
    }
  `,
  styles: [`
    .rota-dica { margin: var(--geo-e1) var(--geo-e5) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .resumo { margin: var(--geo-e2) var(--geo-margem) 0; padding: var(--geo-e4); border-radius: var(--geo-r-folha); background: var(--geo-superficie); display: grid; gap: 2px; }
    .resumo .rotulo { font: 500 .75rem/1.2 var(--geo-fonte); color: var(--geo-texto-2); }
    .resumo .rotulo:not(:first-child) { margin-top: var(--geo-e2); }
    .obra { font: 600 1.125rem/1.25 var(--geo-fonte); overflow-wrap: anywhere; }
    .barra-itens { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e2); flex-wrap: wrap; padding: var(--geo-e3) var(--geo-e3) var(--geo-e2) var(--geo-e5);
      font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .barra-itens strong { color: var(--geo-texto); }
    .botoes { display: flex; }
    .item { flex-wrap: wrap; row-gap: var(--geo-e2); }
    .item .geo-linha__texto { flex: 1 1 55%; }
    .item.zerado .geo-linha__titulo { color: var(--geo-texto-2); }
    .rota { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: var(--geo-e3) var(--geo-e5) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .rota strong { color: var(--geo-texto); }
    .previa { margin: var(--geo-e3) var(--geo-margem) 0; }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .principal { flex: 1; min-height: var(--geo-alvo-principal); font-size: 1rem; }
  `],
})
export class FechamentoMovimentarComponent {
  private readonly fechamento = inject(FechamentoService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rota$ = inject(ActivatedRoute).snapshot;
  readonly rede = inject(ConnectivityService);

  private readonly base = this.rota$.data['base'] as BaseFechamento;
  readonly id = this.rota$.paramMap.get('id') ?? '';

  readonly det = signal<FechamentoDetalhe | null>(null);
  readonly itens = signal<ItemMovimentar[]>([]);
  readonly previa = signal<PreviaSaldo | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly confirmando = signal(false);
  /** Mantida até a resposta: repetir depois de a conexão cair não movimenta em dobro. */
  private envio: { assinatura: string; chave: string } | null = null;

  private readonly aviso = viewChild<ElementRef<HTMLElement>>('aviso');

  readonly tipo = computed(() => tipoFechamento(this.det()?.tipo ?? '221'));
  readonly obra = computed(() => (this.det() ? rotuloObra(this.det()!.obra) : ''));
  readonly rota = computed(() => (this.det() ? rotaFechamento(this.det()!) : { de: '', para: '' }));
  readonly marcados = computed(() => this.itens().filter(i => i.quantidade > 0).length);
  private readonly pedido = computed<MovimentarFechamentoRequest | null>(() => {
    const d = this.det();
    const itens = this.itens().filter(i => i.quantidade > 0).map(i => ({ idItem: i.id, quantidade: i.quantidade, ...(i.unidadeEscolhida ? { unidade: i.unidadeEscolhida } : {}) }));
    return d && itens.length ? { versaoEsperada: d.versao, itens } : null;
  });

  constructor() {
    queueMicrotask(() => this.carregar());
    toObservable(this.pedido).pipe(
      debounceTime(350),
      switchMap(p => (p ? this.fechamento.previaMovimentacao(this.id, p).pipe(catchError(() => of(null))) : of(null))),
      takeUntilDestroyed(),
    ).subscribe(p => {
      this.previa.set(p);
      // O aviso nasce abaixo do rodapé fixo: leva até ele para não passar despercebido.
      if (p?.deixaSaldoNegativo) setTimeout(() => this.aviso()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    });
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.fechamento.detalhe(this.id).subscribe({
      next: d => {
        if (!d.acoes.movimentar) {
          this.toast.info('Esta solicitação não tem nada a movimentar agora.');
          void this.router.navigate([this.base, d.id], { replaceUrl: true });
          return;
        }
        this.det.set(d);
        this.itens.set(d.itens.filter(i => i.quantidadePendente > 0).map(i => ({
          id: i.id, codigo: i.codigoMaterial, descricao: i.descricaoMaterial, unidade: i.unidade || 'UN', pedido: i.quantidade, pendente: i.quantidadePendente, quantidade: i.quantidadePendente,
          equivalencias: i.equivalencias ?? [], unidadeEscolhida: null,
        })));
        this.carregando.set(false);
      },
      error: (e: ApiError) => { this.carregando.set(false); this.erro.set(e.status === 0 ? 'Sem conexão com o servidor.' : e.detail || 'Tente de novo.'); },
    });
  }

  num(n: number): string {
    return numeroBr(n);
  }

  definirQuantidade(i: number, q: number): void {
    const it = this.itens()[i];
    if (paraBase({ unidadeMedida: it.unidade, equivalencias: it.equivalencias }, q, it.unidadeEscolhida) > it.pendente) { this.toast.warning(`No máximo ${numeroBr(it.pendente)} ${it.unidade}: é o que falta movimentar.`); return; }
    this.itens.update(l => l.map((x, k) => (k === i ? { ...x, quantidade: Math.max(0, q) } : x)));
    this.confirmando.set(false);
  }

  /** Mesma quantidade física, mostrada na nova unidade. */
  definirUnidade(i: number, unidade: string | null): void {
    this.itens.update(l => l.map((x, k) => {
      if (k !== i) return x;
      const material = { unidadeMedida: x.unidade, equivalencias: x.equivalencias };
      const base = paraBase(material, x.quantidade, x.unidadeEscolhida);
      return { ...x, unidadeEscolhida: unidade, quantidade: daBase(material, base, unidade) };
    }));
    this.confirmando.set(false);
  }

  tudo(): void {
    this.itens.update(l => l.map(i => ({ ...i, quantidade: i.pendente, unidadeEscolhida: null })));
    this.confirmando.set(false);
  }

  zerar(): void {
    this.itens.update(l => l.map(i => ({ ...i, quantidade: 0 })));
    this.confirmando.set(false);
  }

  confirmar(): void {
    const pedido = this.pedido();
    if (!pedido || this.enviando()) return;
    if (!this.confirmando()) { this.confirmando.set(true); return; }
    const assinatura = JSON.stringify(pedido);
    if (this.envio?.assinatura !== assinatura) this.envio = { assinatura, chave: this.fechamento.novaChave() };
    this.enviando.set(true);
    this.fechamento.movimentar(this.id, pedido, this.envio.chave).subscribe({
      next: d => {
        this.enviando.set(false);
        this.toast.success('Movimentação registrada. O saldo já foi atualizado.');
        void this.router.navigate([this.base, d.id], { replaceUrl: true });
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        this.confirmando.set(false);
        if (!falhaDeConexao(e)) this.envio = null;
        this.toast.error(mensagemFalha(e, 'Não foi possível movimentar.'));
        if (e.status === 409) this.carregar();
      },
    });
  }

  fechar(): void {
    void this.router.navigate([this.base, this.id], { replaceUrl: true });
  }
}
