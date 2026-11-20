import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlmoxService } from '../../../core/almox/almox.service';
import { Estoque, Solicitacao } from '../../../core/almox/almox.models';
import { idCurto } from '../../../core/almox/almox-status';
import { defTipoTecnico, nomeEquipe, nomeEstoque, podeTecnica, tituloTecnica } from '../../../core/almox/almox-tecnico';
import { extrairSerie } from '../../../core/almox/series';
import { Equivalencia, daBase, paraBase } from '../../../core/almox/unidade-material';
import { QuantidadeUnidadeComponent } from '../../../ui/quantidade-unidade.component';
import { ApiError } from '../../../core/http/error.interceptor';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import { ToastService } from '../../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, IndicadorRedeComponent, OpcaoSegmento, QuantidadeComponent, SegmentadoComponent, VazioComponent, numeroBr } from '../../../ui';

type CondicaoDev = 'NOVO' | 'SUCATA';

interface ItemDevolucao {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  detalhaSerie: boolean;
  pedido: number;
  pendente: number;
  quantidade: number;
  serie: string;
  condicao: CondicaoDev;
  guardar: boolean;
  equivalencias: Equivalencia[];
  /** Digitado em outra unidade (ex.: metros de cabo em KG); {@link quantidade} já vem convertida. */
  unidadeInformada: string | null;
  quantidadeInformada?: number;
}

const CONDICOES: OpcaoSegmento<CondicaoDev>[] = [
  { valor: 'NOVO', rotulo: 'Novo' },
  { valor: 'SUCATA', rotulo: 'Sucata' },
];

/**
 * Receber a devolução 222/922 de uma solicitação técnica: o que voltou de cada material,
 * em que condição e se fica guardado no almoxarifado ou sai em baixa na hora (sucata que não
 * volta ao estoque). Material com série volta uma unidade por linha, com a série informada.
 */
@Component({
  selector: 'app-devolucao-tecnica-almox',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, IndicadorRedeComponent, QuantidadeComponent, QuantidadeUnidadeComponent, SegmentadoComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo titulo="Receber devolução" [subtitulo]="referencia()" navegacao="fechar" rotuloFechar="Fechar sem receber" (voltar)="fechar()">
        <geo-indicador-rede />
      </geo-barra-topo>

      @if (carregando()) {
        <div class="geo-esqueletos" aria-busy="true"><div class="geo-esqueleto" style="height: 96px"></div><div class="geo-esqueleto" style="height: 240px"></div></div>
      } @else if (erro()) {
        <geo-vazio icone="alerta" titulo="Não foi possível preparar a devolução" [texto]="erro()">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
        </geo-vazio>
      } @else if (det(); as d) {
        <section class="resumo" aria-label="Devolução">
          @if (titulo().ocorrencia; as oc) { <span class="rotulo">Ocorrência</span><strong class="oc geo-num">{{ oc }}</strong> }
          <span class="rotulo">Obra</span><strong class="obra">{{ titulo().obra }}</strong>
          <p class="rota"><span>Estoque da obra</span><geo-icone nome="seta" [tamanho]="16" /><strong>{{ almoxarifado() }}</strong></p>
          <span class="rotulo">Equipe</span><span>{{ equipe() }}</span>
          <span class="tipo geo-num">{{ tipo().codigo }} · {{ tipo().rotulo }}</span>
        </section>

        @if (pedeReserva()) {
          <label class="geo-campo reserva">
            <span class="geo-campo__rotulo">Número da reserva</span>
            <input class="geo-input mono" [value]="reserva()" (input)="reserva.set(soDigitos($any($event.target)))" inputmode="numeric" maxlength="20" autocomplete="off"
              placeholder="Opcional · só números">
            <span class="geo-campo__ajuda">Sem reserva, a devolução é recebida e fica com pendência de reserva.</span>
          </label>
        }

        <div class="barra-itens">
          <span class="geo-num"><strong>{{ marcados() }}</strong> de {{ itens().length }} {{ itens().length === 1 ? 'material' : 'materiais' }} nesta devolução</span>
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
              @if (it.detalhaSerie) {
                <input class="geo-input mono serie" [value]="it.serie" (change)="definirSerie(i, $any($event.target).value)" placeholder="Série devolvida"
                  autocapitalize="characters" autocomplete="off" spellcheck="false" [attr.aria-label]="'Série devolvida de ' + it.descricao">
              } @else {
                @if (it.equivalencias.length) {
                  <geo-quantidade-unidade [material]="{ unidadeMedida: it.unidade, equivalencias: it.equivalencias }" [minimo]="0"
                    [valor]="it.unidadeInformada ? (it.quantidadeInformada ?? 0) : it.quantidade" (valorChange)="definirQuantidade(i, $event)"
                    [unidade]="it.unidadeInformada" (unidadeChange)="definirUnidade(i, $event)" [rotulo]="'quantidade devolvida de ' + it.descricao" />
                } @else {
                  <geo-quantidade [valor]="it.quantidade" (valorChange)="definirQuantidade(i, $event)" [minimo]="0" [grande]="true" [unidade]="it.unidade"
                    [rotulo]="'quantidade devolvida de ' + it.descricao" />
                }
              }
              @if (it.quantidade) {
                <div class="opcoes">
                  <geo-segmentado [rotulo]="'Condição de ' + it.descricao" [opcoes]="condicoes" [valor]="it.condicao" (valorChange)="definirCondicao(i, $event)" />
                  <button type="button" class="alternar" role="switch" [attr.aria-checked]="it.guardar" (click)="alternarGuardar(i)">
                    <span class="txt"><strong>{{ it.guardar ? 'Guardar no almoxarifado' : 'Baixa na hora' }}</strong>
                      <span>{{ it.guardar ? 'Entra no saldo de ' + almoxarifado() : 'Recebido e baixado: não entra no saldo' }}</span></span>
                    <span class="trilho" aria-hidden="true"><i></i></span>
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </div>

    @if (det()) {
      <footer class="rodape">
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="confirmar()" [disabled]="enviando() || !marcados() || !rede.isOnline()">
          {{ enviando() ? 'Recebendo…' : !rede.isOnline() ? 'Sem internet' : confirmando() ? 'Toque de novo para confirmar' : 'Confirmar recebimento' }}</button>
      </footer>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .resumo { margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e4); border-radius: var(--geo-r-folha); background: var(--geo-superficie); display: grid; gap: 2px; }
    .resumo .rotulo { font: 500 .75rem/1.2 var(--geo-fonte); color: var(--geo-texto-2); }
    .resumo .rotulo:not(:first-child) { margin-top: var(--geo-e2); }
    .oc, .obra { font: 600 1.125rem/1.25 var(--geo-fonte); overflow-wrap: anywhere; }
    .rota { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: var(--geo-e3) 0 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .rota strong { color: var(--geo-texto); }
    .tipo { justify-self: start; margin-top: var(--geo-e2); padding: 2px 8px; border-radius: 6px; background: var(--geo-superficie-2); font: 600 .75rem/1.5 var(--geo-fonte); }
    .reserva { margin: var(--geo-e3) var(--geo-e3) 0; }
    .reserva .geo-campo__rotulo, .reserva .geo-campo__ajuda { padding-left: var(--geo-e4); }
    .barra-itens { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e2); flex-wrap: wrap; padding: var(--geo-e3) var(--geo-e3) var(--geo-e2) var(--geo-e5);
      font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .barra-itens strong { color: var(--geo-texto); }
    .botoes { display: flex; }
    .item { flex-wrap: wrap; row-gap: var(--geo-e2); }
    .item .geo-linha__texto { flex: 1 1 55%; }
    .item.zerado .geo-linha__titulo { color: var(--geo-texto-2); }
    .serie { flex: 1 1 100%; }
    .mono { font-family: var(--geo-fonte-mono); }
    .opcoes { flex-basis: 100%; display: grid; gap: var(--geo-e2); }
    .alternar { display: flex; align-items: center; gap: var(--geo-e3); width: 100%; padding: var(--geo-e2) var(--geo-e3); min-height: 56px; border: 0; border-radius: var(--geo-r-campo);
      background: var(--geo-superficie-2); color: var(--geo-texto); text-align: left; font: inherit; cursor: pointer; }
    .alternar .txt { flex: 1; display: grid; gap: 2px; }
    .alternar .txt strong { font: 600 .875rem/1.25 var(--geo-fonte); }
    .alternar .txt span { font: var(--geo-t-apoio); font-size: .75rem; color: var(--geo-texto-2); }
    .trilho { width: 44px; height: 26px; border-radius: 13px; background: var(--geo-linha-forte); position: relative; flex: none; transition: background var(--geo-m-entrar); }
    .trilho i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25);
      transition: transform var(--geo-m-entrar) var(--geo-curva); }
    [aria-checked='true'] .trilho { background: var(--geo-destaque); }
    [aria-checked='true'] .trilho i { transform: translateX(18px); }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .principal { flex: 1; min-height: var(--geo-alvo-principal); font-size: 1rem; }
  `],
})
export class DevolucaoTecnicaAlmoxComponent {
  private readonly almox = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly rede = inject(ConnectivityService);
  readonly id = signal(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');

  readonly condicoes = CONDICOES;
  readonly det = signal<Solicitacao | null>(null);
  readonly estoques = signal<Estoque[]>([]);
  readonly itens = signal<ItemDevolucao[]>([]);
  readonly reserva = signal('');
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly confirmando = signal(false);

  readonly titulo = computed(() => (this.det() ? tituloTecnica(this.det()!) : { ocorrencia: null, obra: '' }));
  readonly referencia = computed(() => this.titulo().ocorrencia ?? `#${idCurto(this.id())}`);
  readonly tipo = computed(() => defTipoTecnico(this.det()?.tecnico?.tipoTecnico ?? this.det()?.tipoTecnico));
  readonly idEquipe = computed(() => this.det()?.tecnico?.idEquipe ?? this.det()?.idEquipe ?? null);
  readonly equipe = computed(() => nomeEquipe(this.estoques(), this.idEquipe()) ?? 'Equipe');
  readonly almoxarifado = computed(() => nomeEstoque(this.estoques(), this.det()?.tecnico?.idAlmoxarifadoAtendimento) ?? 'Almoxarifado');
  readonly pedeReserva = computed(() => !this.det()?.tecnico?.reserva?.numero);
  readonly marcados = computed(() => this.itens().filter(i => i.quantidade > 0).length);

  constructor() {
    this.almox.estoques().subscribe(e => this.estoques.set(e));
    queueMicrotask(() => this.carregar());
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.almox.obterSolicitacao(this.id()).subscribe({
      next: d => {
        if (!podeTecnica(d, 'CONFIRMAR_DEVOLUCAO')) {
          this.toast.info('Esta solicitação não tem devolução a receber agora.');
          void this.router.navigate(['/almox/tecnicas', d.id], { replaceUrl: true });
          return;
        }
        this.det.set(d);
        this.itens.set(d.itens.map(i => {
          const pendente = Number(i.quantidadePendente ?? 0);
          return {
            id: i.id, codigo: i.material.codigo, descricao: i.material.descricao, unidade: i.material.unidadeMedida || 'UN', detalhaSerie: !!i.material.detalhaSerie,
            pedido: Number(i.quantidade), pendente, quantidade: i.material.detalhaSerie ? (i.numSerie ? 1 : 0) : pendente, serie: i.numSerie ?? '',
            condicao: 'NOVO' as CondicaoDev, guardar: true,
            equivalencias: i.material.detalhaSerie ? [] : (i.material.equivalencias ?? []), unidadeInformada: null,
          };
        }).filter(i => i.pendente > 0));
        this.carregando.set(false);
      },
      error: (e: ApiError) => { this.carregando.set(false); this.erro.set(e.status === 0 ? 'Sem conexão com o servidor.' : e.detail || 'Tente de novo.'); },
    });
  }

  num(n: number): string {
    return numeroBr(n);
  }

  /** Reserva é só número (1 a 20 dígitos, regra do backend). */
  soDigitos(campo: HTMLInputElement): string {
    const limpo = campo.value.replace(/\D/g, '').slice(0, 20);
    if (campo.value !== limpo) campo.value = limpo;
    return limpo;
  }

  private atualizar(i: number, m: Partial<ItemDevolucao>): void {
    this.itens.update(l => l.map((x, k) => (k === i ? { ...x, ...m } : x)));
    this.confirmando.set(false);
  }

  /** Com outra unidade escolhida, {@code q} vem nela; o que volta ao saldo é o convertido. */
  definirQuantidade(i: number, q: number): void {
    const it = this.itens()[i];
    const m = { unidadeMedida: it.unidade, equivalencias: it.equivalencias };
    const base = it.unidadeInformada ? paraBase(m, q, it.unidadeInformada) : q;
    if (base > it.pendente) {
      const naUnidade = it.unidadeInformada ? ` (${numeroBr(daBase(m, it.pendente, it.unidadeInformada))} ${it.unidadeInformada})` : '';
      this.toast.warning(`No máximo ${numeroBr(it.pendente)} ${it.unidade}${naUnidade}: é o que falta devolver.`);
      return;
    }
    this.atualizar(i, it.unidadeInformada
      ? { quantidade: Math.max(0, base), quantidadeInformada: Math.max(0, q) }
      : { quantidade: Math.max(0, q), quantidadeInformada: undefined });
  }

  /** Troca a unidade mantendo a mesma quantidade física. */
  definirUnidade(i: number, unidade: string | null): void {
    const it = this.itens()[i];
    const m = { unidadeMedida: it.unidade, equivalencias: it.equivalencias };
    this.atualizar(i, unidade
      ? { unidadeInformada: unidade, quantidadeInformada: daBase(m, it.quantidade, unidade) }
      : { unidadeInformada: null, quantidadeInformada: undefined });
  }

  definirSerie(i: number, bruta: string): void {
    const s = extrairSerie(bruta) ?? '';
    if (s && this.itens().some((x, k) => k !== i && x.serie === s)) { this.toast.warning(`A série ${s} já está em outro item.`); return; }
    this.atualizar(i, { serie: s, quantidade: s ? 1 : 0 });
  }

  definirCondicao(i: number, c: CondicaoDev): void {
    // Sucata costuma sair em baixa; novo, ficar guardado. A pessoa ainda pode trocar.
    this.atualizar(i, { condicao: c, guardar: c === 'NOVO' });
  }

  alternarGuardar(i: number): void {
    this.atualizar(i, { guardar: !this.itens()[i].guardar });
  }

  tudo(): void {
    this.itens.update(l => l.map(i => (i.detalhaSerie ? i : {
      ...i, quantidade: i.pendente,
      ...(i.unidadeInformada ? { quantidadeInformada: daBase({ unidadeMedida: i.unidade, equivalencias: i.equivalencias }, i.pendente, i.unidadeInformada) } : {}),
    })));
  }

  zerar(): void {
    this.itens.update(l => l.map(i => ({ ...i, quantidade: 0, serie: i.detalhaSerie ? '' : i.serie, ...(i.unidadeInformada ? { quantidadeInformada: 0 } : {}) })));
  }

  confirmar(): void {
    const d = this.det();
    const equipe = this.idEquipe();
    if (!d || this.enviando()) return;
    if (!equipe) { this.toast.error('A solicitação não tem equipe definida. Ajuste no sistema web.'); return; }
    if (!this.confirmando()) { this.confirmando.set(true); return; }
    const itens = this.itens().filter(i => i.quantidade > 0).map(i => ({
      idItemSolicitacao: i.id, numeroSerie: i.serie || null, condicao: i.condicao, guardarNoEstoque: i.guardar,
      // Digitado em outra unidade vai como foi digitado; o servidor converte e guarda os dois.
      ...(i.unidadeInformada && i.quantidadeInformada ? { quantidade: i.quantidadeInformada, unidade: i.unidadeInformada } : { quantidade: i.quantidade }),
    }));
    this.enviando.set(true);
    this.almox.receberDevolucaoTecnica(d.id, {
      versaoEsperada: d.tecnico?.versao ?? d.versao ?? 0, idEquipe: equipe, numeroReserva: this.pedeReserva() ? this.reserva().trim() || null : null, itens,
    }).subscribe({
      next: () => {
        this.enviando.set(false);
        const baixa = itens.filter(i => !i.guardarNoEstoque).length;
        this.toast.success(`Devolução recebida em ${this.almoxarifado()}.${baixa ? ` ${baixa} ${baixa === 1 ? 'item saiu' : 'itens saíram'} em baixa.` : ''}`);
        void this.router.navigate(['/almox/tecnicas', d.id], { replaceUrl: true });
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        this.confirmando.set(false);
        this.toast.error(e.status === 409 ? 'Outra pessoa alterou esta solicitação. Revise e confirme de novo.' : e.detail || 'Não foi possível receber a devolução.');
        if (e.status === 409) this.carregar();
      },
    });
  }

  fechar(): void {
    void this.router.navigate(['/almox/tecnicas', this.id()], { replaceUrl: true });
  }
}
