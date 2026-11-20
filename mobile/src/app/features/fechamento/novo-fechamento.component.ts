import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlmoxService } from '../../core/almox/almox.service';
import { Colaborador, Estoque, ObraResumo } from '../../core/almox/almox.models';
import { ehAlmoxarifado } from '../../core/almox/almox-tecnico';
import { CriarFechamentoRequest, TipoFechamento } from '../../core/fechamento/fechamento.models';
import { TIPOS_FECHAMENTO, falhaDeConexao, hojeIso, iconeTipo, mensagemFalha, reservaValida, tipoFechamento } from '../../core/fechamento/fechamento-ui';
import { FechamentoService, SupervisorFechamento } from '../../core/fechamento/fechamento.service';
import { ApiError } from '../../core/http/error.interceptor';
import { RascunhoService, VinculoRascunho } from '../../core/sessao/rascunho.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, IndicadorRedeComponent, OpcaoSeletor, SeletorComponent, dataCurta, numeroBr } from '../../ui';
import { BaseFechamento } from './fechamento.routes';
import { LinhaFechamento, LinhasFechamentoComponent } from './linhas-fechamento.component';

interface Bloco { tipo: TipoFechamento; reserva: string; dataReserva: string; linhas: LinhaFechamento[] }

interface Rascunho {
  passo: number;
  idObra: string | null;
  obra: string | null;
  idAlmoxarifado: string | null;
  almoxarifado: string | null;
  idEncarregado: string | null;
  encarregado: string | null;
  idSupervisor: string | null;
  supervisor: string | null;
  observacao: string;
  blocos: Bloco[];
  envio: { assinatura: string; chave: string } | null;
}

const PASSOS = ['Obra', 'Tipos e materiais', 'Responsáveis e reserva', 'Revisão'];
const SEM_RESPONSAVEL = '';

/** O rótulo guardado no rascunho mantém a escolha visível enquanto as listas não chegam (sem internet). */
function comEscolhido(opcoes: OpcaoSeletor[], valor: string | null, rotulo: string | null): OpcaoSeletor[] {
  return valor && rotulo && !opcoes.some(o => o.valor === valor) ? [{ valor, rotulo }, ...opcoes] : opcoes;
}

/**
 * Nova solicitação de encerramento em passos curtos: para uma obra, uma solicitação por tipo.
 * Tudo fica no rascunho do aparelho; só a confirmação precisa de internet.
 */
@Component({
  selector: 'app-novo-fechamento',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, IndicadorRedeComponent, LinhasFechamentoComponent, SeletorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo titulo="Novo fechamento" [subtitulo]="passos[passo() - 1] + ' · ' + passo() + ' de ' + passos.length" navegacao="fechar" (voltar)="fechar()">
        <geo-indicador-rede />
      </geo-barra-topo>
      <div class="geo-passos" [style.grid-template-columns]="'repeat(' + passos.length + ', 1fr)'" aria-hidden="true">
        @for (p of passos; track $index) { <i [class.feito]="$index < passo()"></i> }
      </div>

      <section class="conteudo" [attr.aria-label]="passos[passo() - 1]">
        @switch (passo()) {
          @case (1) {
            <p class="intro">Escolha a obra e o almoxarifado. Na adição, o material sai do almoxarifado para a obra; na devolução, volta para ele.</p>
            <div class="campos">
              <geo-seletor rotulo="Obra" [obrigatorio]="true" [opcoes]="opcoesObra()" [valor]="idObra()" (valorChange)="idObra.set($event)" (escolhido)="obra.set($event.rotulo)"
                [invalido]="tentou() && !idObra()" [placeholder]="obras().length ? 'Escolher' : rede.isOnline() ? 'Carregando…' : 'Precisa de internet'" />
              <geo-seletor rotulo="Almoxarifado" [obrigatorio]="true" [opcoes]="opcoesAlmoxarifado()" [valor]="idAlmoxarifado()" (valorChange)="idAlmoxarifado.set($event)" (escolhido)="almoxarifado.set($event.rotulo)"
                [invalido]="tentou() && !idAlmoxarifado()" [placeholder]="estoques().length ? 'Escolher' : rede.isOnline() ? 'Carregando…' : 'Precisa de internet'" />
            </div>
          }
          @case (2) {
            <p class="intro">Marque os tipos que a obra precisa. Cada tipo vira uma solicitação com os seus materiais.</p>
            <div class="tipos" role="group" aria-label="Tipos de solicitação">
              @for (t of tipos; track t.codigo) {
                <button type="button" class="tipo" [attr.aria-pressed]="tem(t.codigo)" (click)="alternarTipo(t.codigo)">
                  <geo-icone [nome]="icone(t.codigo)" /><span class="txt"><strong class="geo-num">{{ t.codigo }} · {{ t.nome }}</strong><span>{{ t.descricao }}</span></span>
                  <span class="marca" aria-hidden="true"><geo-icone nome="check" [tamanho]="16" /></span>
                </button>
              }
            </div>
            @if (tentou() && !blocos().length) { <p class="geo-campo__erro erro" role="alert"><geo-icone nome="alerta" [tamanho]="16" />Escolha ao menos um tipo.</p> }
            @for (b of blocos(); track b.tipo; let i = $index) {
              <h2 class="geo-secao"><span>{{ b.tipo }} · {{ nomeTipo(b.tipo) }}</span><span class="geo-num">{{ b.linhas.length }}</span></h2>
              <app-linhas-fechamento [rotulo]="'Materiais da ' + b.tipo" [linhas]="b.linhas" (linhasChange)="alterarBloco(i, { linhas: $event })" />
              @if (tentou() && !b.linhas.length) { <p class="geo-campo__erro erro" role="alert"><geo-icone nome="alerta" [tamanho]="16" />Inclua ao menos um material na {{ b.tipo }}.</p> }
            }
          }
          @case (3) {
            <p class="intro">Encarregado e supervisor são opcionais. Sem reserva, a solicitação tem 48 horas úteis para recebê-la.</p>
            <div class="campos">
              <geo-seletor rotulo="Encarregado" placeholder="Não informar" [opcoes]="opcoesEncarregado()" [valor]="idEncarregado() ?? semResponsavel" (valorChange)="idEncarregado.set($event || null)"
                (escolhido)="encarregado.set($event.valor ? $event.rotulo : null)" />
              <geo-seletor rotulo="Supervisor" placeholder="Não informar" [opcoes]="opcoesSupervisor()" [valor]="idSupervisor() ?? semResponsavel" (valorChange)="idSupervisor.set($event || null)"
                (escolhido)="supervisor.set($event.valor ? $event.rotulo : null)" />
              @if (coordenador()) { <p class="ajuda">Coordenador: {{ coordenador() }}</p> }
            </div>
            @for (b of blocos(); track b.tipo; let i = $index) {
              <h2 class="geo-secao"><span>Reserva da {{ b.tipo }}</span></h2>
              <div class="campos">
                <label class="geo-campo">
                  <span class="geo-campo__rotulo">Número da reserva</span>
                  <input class="geo-input mono" [value]="b.reserva" (input)="alterarBloco(i, { reserva: soDigitos($any($event.target)) })" inputmode="numeric" maxlength="20" autocomplete="off"
                    placeholder="Se já existir no SAP" [attr.aria-invalid]="tentou() && reservaInvalida(b)">
                  @if (tentou() && reservaInvalida(b)) { <span class="geo-campo__erro"><geo-icone nome="alerta" [tamanho]="16" />Só números, até 20 dígitos.</span> }
                </label>
                @if (b.reserva.trim()) {
                  <label class="geo-campo">
                    <span class="geo-campo__rotulo">Data da reserva</span>
                    <input class="geo-input" type="date" [max]="hoje" [value]="b.dataReserva" (input)="alterarBloco(i, { dataReserva: $any($event.target).value })">
                  </label>
                }
              </div>
            }
            <h2 class="geo-secao"><span>Observação</span></h2>
            <div class="campos">
              <label class="geo-campo">
                <span class="geo-sr-only">Observação para o almoxarifado</span>
                <textarea class="geo-input texto" rows="3" maxlength="1000" [value]="observacao()" (input)="observacao.set($any($event.target).value)" placeholder="Informação para o almoxarifado"></textarea>
              </label>
            </div>
          }
          @case (4) {
            <dl class="geo-dados">
              <div><dt>Obra</dt><dd>{{ obra() }}</dd></div>
              <div><dt>Almoxarifado</dt><dd>{{ almoxarifado() }}</dd></div>
              <div><dt>Encarregado</dt><dd>{{ encarregado() || 'Não informado' }}</dd></div>
              <div><dt>Supervisor</dt><dd>{{ supervisor() || 'Não informado' }}@if (coordenador()) { <span class="apoio"> · coordenador {{ coordenador() }}</span> }</dd></div>
              @if (observacao().trim()) { <div><dt>Observação</dt><dd>{{ observacao().trim() }}</dd></div> }
            </dl>
            @for (b of blocos(); track b.tipo) {
              <h2 class="geo-secao"><span>{{ b.tipo }} · {{ nomeTipo(b.tipo) }}</span><span class="geo-num">{{ b.linhas.length }}</span></h2>
              <ul class="geo-grupo">
                <li class="geo-linha"><span class="geo-linha__texto"><span class="geo-linha__apoio">Reserva</span>
                  <span class="geo-linha__titulo geo-num">{{ b.reserva.trim() ? b.reserva.trim() + (b.dataReserva ? ' · ' + dataCurta(b.dataReserva) : '') : 'Sem reserva: 48 horas úteis para informar' }}</span></span></li>
                @for (l of b.linhas; track l.idMaterial) {
                  <li class="geo-linha"><span class="geo-linha__texto"><span class="geo-linha__titulo">{{ l.descricao }}</span><span class="geo-linha__apoio geo-num">Cód. {{ l.codigo }}</span></span>
                    <span class="geo-qtd">{{ num(l.quantidade) }}<small>{{ l.unidade }}</small></span></li>
                }
              </ul>
            }
            @if (!rede.isOnline()) {
              <div class="geo-faixa-estado geo-faixa-estado--atencao"><geo-icone nome="sem_rede" /><p>Para criar é preciso internet. O que você preencheu fica guardado neste aparelho.</p></div>
            }
          }
        }
      </section>
    </div>

    <footer class="rodape" data-acao-fixa>
      @if (passo() > 1) { <button type="button" class="geo-btn geo-btn--neutro" (click)="voltarPasso()" [disabled]="enviando()">Voltar</button> }
      @if (passo() < passos.length) {
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="avancar()">Continuar</button>
      } @else {
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="criar()" [disabled]="enviando() || !rede.isOnline()">
          {{ enviando() ? 'Criando…' : !rede.isOnline() ? 'Sem internet' : blocos().length > 1 ? 'Criar as ' + blocos().length + ' solicitações' : 'Criar solicitação' }}</button>
      }
    </footer>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .intro { margin: var(--geo-e2) var(--geo-e5) var(--geo-e3); font: var(--geo-t-corpo); color: var(--geo-texto-2); }
    .campos { display: grid; gap: var(--geo-e2); padding: var(--geo-e2) var(--geo-e3); }
    .campos .geo-campo__rotulo, .campos .geo-campo__erro { padding-left: var(--geo-e4); }
    .ajuda { margin: 0; padding: 0 var(--geo-e4); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .apoio { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .erro { margin: var(--geo-e2) var(--geo-e5) 0; }
    .texto { min-height: 88px; padding: var(--geo-e3) var(--geo-e4); resize: vertical; }
    .mono { font-family: var(--geo-fonte-mono); }
    .tipos { display: grid; gap: var(--geo-e2); padding: 0 var(--geo-e3); }
    .tipo { display: flex; align-items: center; gap: var(--geo-e3); width: 100%; min-height: 72px; padding: var(--geo-e3) var(--geo-e4); border: 1.5px solid transparent; border-radius: var(--geo-r-grupo);
      background: var(--geo-superficie); color: var(--geo-texto); text-align: left; font: inherit; cursor: pointer; }
    .tipo:active { background: var(--geo-superficie-2); }
    .tipo[aria-pressed='true'] { border-color: var(--geo-destaque); }
    .tipo .txt { flex: 1; min-width: 0; display: grid; gap: 2px; }
    .tipo .txt strong { font: var(--geo-t-corpo-forte); }
    .tipo .txt span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .marca { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex: none; color: transparent; box-shadow: inset 0 0 0 2px var(--geo-linha-forte); }
    .tipo[aria-pressed='true'] .marca { background: var(--geo-destaque); box-shadow: none; color: var(--geo-destaque-texto); }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .geo-btn { flex: 1; min-height: var(--geo-alvo-principal); font-size: 1rem; }
    .rodape .principal { flex: 1.6; }
  `],
})
export class NovoFechamentoComponent {
  private readonly fechamento = inject(FechamentoService);
  private readonly almox = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rascunhos = inject(RascunhoService);
  private readonly injector = inject(Injector);
  readonly rede = inject(ConnectivityService);

  private readonly base = inject(ActivatedRoute).snapshot.data['base'] as BaseFechamento;
  readonly passos = PASSOS;
  readonly tipos = TIPOS_FECHAMENTO;
  readonly semResponsavel = SEM_RESPONSAVEL;
  readonly hoje = hojeIso();
  protected readonly dataCurta = dataCurta;

  readonly passo = signal(1);
  readonly idObra = signal<string | null>(null);
  readonly obra = signal<string | null>(null);
  readonly idAlmoxarifado = signal<string | null>(null);
  readonly almoxarifado = signal<string | null>(null);
  readonly idEncarregado = signal<string | null>(null);
  readonly encarregado = signal<string | null>(null);
  readonly idSupervisor = signal<string | null>(null);
  readonly supervisor = signal<string | null>(null);
  readonly observacao = signal('');
  readonly blocos = signal<Bloco[]>([]);
  private readonly envio = signal<Rascunho['envio']>(null);

  readonly obras = signal<ObraResumo[]>([]);
  readonly estoques = signal<Estoque[]>([]);
  readonly colaboradores = signal<Colaborador[]>([]);
  readonly supervisores = signal<SupervisorFechamento[]>([]);
  readonly tentou = signal(false);
  readonly enviando = signal(false);

  readonly opcoesObra = computed(() => comEscolhido(this.obras().map(o => ({ valor: o.id, rotulo: `${o.numero} · ${o.titulo}` })), this.idObra(), this.obra()));
  private readonly almoxarifados = computed(() => this.estoques().filter(ehAlmoxarifado));
  readonly opcoesAlmoxarifado = computed(() => comEscolhido(this.almoxarifados().map(e => ({ valor: e.id, rotulo: e.nomeIdentificador })), this.idAlmoxarifado(), this.almoxarifado()));
  readonly opcoesEncarregado = computed<OpcaoSeletor[]>(() => [
    { valor: SEM_RESPONSAVEL, rotulo: 'Não informar' },
    ...comEscolhido(this.colaboradores().map(c => ({ valor: c.id, rotulo: c.nomeCompleto })), this.idEncarregado(), this.encarregado()),
  ]);
  readonly opcoesSupervisor = computed<OpcaoSeletor[]>(() => [
    { valor: SEM_RESPONSAVEL, rotulo: 'Não informar' },
    ...comEscolhido(this.supervisores().map(s => ({ valor: s.id, rotulo: s.nomeColaborador, apoio: s.nomeCoordenador ? `Coordenador: ${s.nomeCoordenador}` : null })), this.idSupervisor(), this.supervisor()),
  ]);
  readonly coordenador = computed(() => this.supervisores().find(s => s.id === this.idSupervisor())?.nomeCoordenador ?? null);

  private readonly rascunho: VinculoRascunho = this.rascunhos.vincular<Rascunho>({
    chave: 'fechamento:novo',
    injector: this.injector,
    ler: () => ({
      passo: this.passo(), idObra: this.idObra(), obra: this.obra(), idAlmoxarifado: this.idAlmoxarifado(), almoxarifado: this.almoxarifado(), idEncarregado: this.idEncarregado(),
      encarregado: this.encarregado(), idSupervisor: this.idSupervisor(), supervisor: this.supervisor(), observacao: this.observacao(), blocos: this.blocos(), envio: this.envio(),
    }),
    aplicar: r => {
      this.passo.set(Math.min(Math.max(1, r.passo || 1), PASSOS.length));
      this.idObra.set(r.idObra);
      this.obra.set(r.obra);
      this.idAlmoxarifado.set(r.idAlmoxarifado);
      this.almoxarifado.set(r.almoxarifado);
      this.idEncarregado.set(r.idEncarregado);
      this.encarregado.set(r.encarregado);
      this.idSupervisor.set(r.idSupervisor);
      this.supervisor.set(r.supervisor);
      this.observacao.set(r.observacao ?? '');
      this.blocos.set(r.blocos ?? []);
      this.envio.set(r.envio ?? null);
    },
    titulo: () => `Fechamento${this.obra() ? ' · ' + this.obra() : ''}`,
    rota: () => `${this.base}/novo`,
    vazio: r => !r.idObra && !r.blocos.length,
  });

  constructor() {
    this.almox.obras().subscribe(o => this.obras.set(o));
    this.almox.colaboradores().subscribe({ next: c => this.colaboradores.set(c), error: () => undefined });
    this.fechamento.supervisores().subscribe(s => this.supervisores.set(s));
    // Depois do rascunho: um almoxarifado único só é sugerido se a pessoa ainda não tiver escolhido.
    void this.rascunho.restaurado.then(() => this.almox.estoques().subscribe(e => {
      this.estoques.set(e);
      const unico = this.almoxarifados().length === 1 ? this.almoxarifados()[0] : null;
      if (unico && !this.idAlmoxarifado()) { this.idAlmoxarifado.set(unico.id); this.almoxarifado.set(unico.nomeIdentificador); }
    }));
  }

  nomeTipo(tipo: TipoFechamento): string {
    return tipoFechamento(tipo).nome;
  }

  icone(tipo: TipoFechamento) {
    return iconeTipo(tipo);
  }

  num(n: number): string {
    return numeroBr(n);
  }

  tem(tipo: TipoFechamento): boolean {
    return this.blocos().some(b => b.tipo === tipo);
  }

  alternarTipo(tipo: TipoFechamento): void {
    const bloco = this.blocos().find(b => b.tipo === tipo);
    if (bloco) {
      if (bloco.linhas.length) this.toast.info(`A ${tipo} saiu com ${bloco.linhas.length} ${bloco.linhas.length === 1 ? 'material' : 'materiais'}.`);
      this.blocos.update(l => l.filter(b => b.tipo !== tipo));
      return;
    }
    const ordem = TIPOS_FECHAMENTO.map(t => t.codigo);
    this.blocos.update(l => [...l, { tipo, reserva: '', dataReserva: '', linhas: [] }].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo)));
  }

  alterarBloco(i: number, mudanca: Partial<Bloco>): void {
    this.blocos.update(l => l.map((b, k) => (k === i ? { ...b, ...mudanca } : b)));
  }

  soDigitos(campo: HTMLInputElement): string {
    const limpo = campo.value.replace(/\D/g, '').slice(0, 20);
    if (campo.value !== limpo) campo.value = limpo;
    return limpo;
  }

  reservaInvalida(b: Bloco): boolean {
    return !!b.reserva.trim() && !reservaValida(b.reserva);
  }

  private passoValido(passo: number): boolean {
    if (passo === 1) return !!this.idObra() && !!this.idAlmoxarifado();
    if (passo === 2) return !!this.blocos().length && this.blocos().every(b => b.linhas.length > 0 && b.linhas.every(l => l.quantidade > 0));
    if (passo === 3) return this.blocos().every(b => !this.reservaInvalida(b));
    return true;
  }

  avancar(): void {
    this.tentou.set(true);
    if (!this.passoValido(this.passo())) return;
    this.tentou.set(false);
    this.passo.update(p => p + 1);
  }

  voltarPasso(): void {
    this.tentou.set(false);
    this.passo.update(p => Math.max(1, p - 1));
  }

  private pedido(): CriarFechamentoRequest {
    return {
      idObra: this.idObra()!,
      idAlmoxarifadoAtendimento: this.idAlmoxarifado()!,
      idEncarregado: this.idEncarregado(),
      idSupervisor: this.idSupervisor(),
      observacao: this.observacao().trim() || null,
      solicitacoes: this.blocos().map(b => ({
        tipo: b.tipo,
        numeroReserva: b.reserva.trim() || null,
        dataReserva: b.reserva.trim() ? b.dataReserva || null : null,
        itens: b.linhas.map(l => ({ idMaterial: l.idMaterial, quantidade: l.quantidade })),
      })),
    };
  }

  async criar(): Promise<void> {
    if (this.enviando()) return;
    if (!this.rede.isOnline()) { this.toast.warning('Para criar é preciso internet. O rascunho fica guardado.'); return; }
    const pedido = this.pedido();
    const assinatura = JSON.stringify(pedido);
    // A chave fica no rascunho: mesmo com o app fechado no meio do envio, repetir não duplica.
    const envio = this.envio()?.assinatura === assinatura ? this.envio()! : { assinatura, chave: this.fechamento.novaChave() };
    this.envio.set(envio);
    await this.rascunho.gravarEstadoAtual();
    this.enviando.set(true);
    this.fechamento.criar(pedido, envio.chave).subscribe({
      next: async ({ ids }) => {
        await this.rascunho.concluir();
        this.enviando.set(false);
        this.toast.success(ids.length === 1 ? 'Solicitação de encerramento criada.' : `${ids.length} solicitações de encerramento criadas.`);
        void this.router.navigateByUrl(this.base, { replaceUrl: true });
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        if (!falhaDeConexao(e)) this.envio.set(null);
        this.toast.error(mensagemFalha(e, 'Não foi possível criar.'));
      },
    });
  }

  fechar(): void {
    void this.rascunho.gravarAgora();
    void this.router.navigateByUrl(this.base);
  }
}
