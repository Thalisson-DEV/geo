import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlmoxService } from '../../core/almox/almox.service';
import { Motivo } from '../../core/almox/almox.models';
import { AuthService } from '../../core/auth/auth.service';
import { FechamentoDetalhe, ItemFechamento, MovimentacaoFechamento } from '../../core/fechamento/fechamento.models';
import {
  PRAZOS, SITUACOES, dataHora, hojeIso, iconeTipo, mensagemFalha, movimentacoesRecentes, nomePessoa, reservaValida, rotaFechamento, rotuloObra, situacaoItem, textoPrazo, tipoFechamento,
} from '../../core/fechamento/fechamento-ui';
import { FechamentoService } from '../../core/fechamento/fechamento.service';
import { ApiError } from '../../core/http/error.interceptor';
import { SessaoService } from '../../core/sessao/sessao.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, OpcaoSeletor, SeletorComponent, VazioComponent, numeroBr } from '../../ui';
import { BaseFechamento } from './fechamento.routes';
import { FolhaEstornoFechamentoComponent } from './folha-estorno-fechamento.component';

type Folha = 'mais' | 'reserva' | 'cancelar' | 'pendencia';

/**
 * Detalhe do fechamento: situação, prazo, caminho do material, materiais e movimentações.
 * Só aparecem as ações que o backend devolveu como permitidas para a pessoa e a situação.
 */
@Component({
  selector: 'app-fechamento-detalhe',
  standalone: true,
  imports: [
    BarraTopoComponent, FolhaComponent, FolhaEstornoFechamentoComponent, IconeComponent, IndicadorRedeComponent, SeletorComponent, VazioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="det() ? det()!.tipo + ' · ' + tipo().nome : 'Encerramento'" [subtitulo]="det() ? $safeNavigationMigration(situacao()?.rotulo) : 'Carregando…'" (voltar)="voltar()">
      <geo-indicador-rede />
      <button type="button" class="geo-btn-icone" (click)="carregar()" [disabled]="carregando()" aria-label="Atualizar"><geo-icone nome="atualizar" /></button>
    </geo-barra-topo>

    @if (carregando() && !det()) {
      <div class="geo-esqueletos" aria-busy="true" aria-label="Carregando a solicitação">
        <div class="geo-esqueleto" style="height: 160px"></div><div class="geo-esqueleto" style="height: 96px"></div><div class="geo-esqueleto" style="height: 220px"></div>
      </div>
    } @else if (erro()) {
      <geo-vazio icone="alerta" titulo="Não foi possível abrir a solicitação" [texto]="erro()">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
      </geo-vazio>
    } @else if (det(); as d) {
      <div class="pagina" [class.atualizando]="carregando()">
        <section class="hero" aria-label="Resumo">
          <div class="selos">
            @if (situacao(); as s) { <span [class]="'geo-etiqueta geo-etiqueta--' + s.tom"><geo-icone [nome]="s.icone" [tamanho]="14" />{{ s.rotulo }}</span> }
            <span class="geo-etiqueta geo-etiqueta--neutro geo-num"><geo-icone [nome]="iconeDoTipo()" [tamanho]="14" />{{ d.tipo }}</span>
            @if (prazo(); as p) { <span [class]="'geo-etiqueta geo-etiqueta--' + p.tom"><geo-icone [nome]="p.icone" [tamanho]="14" />{{ p.rotulo }}</span> }
            @if (d.possuiPendencia) { <span class="geo-etiqueta geo-etiqueta--atencao"><geo-icone nome="bandeira" [tamanho]="14" />Com pendência</span> }
          </div>
          <div class="titulo"><span class="rotulo">Obra</span><strong class="obra">{{ obra() }}</strong></div>
          <ol class="rota" aria-label="Caminho do material">
            <li><span class="marco" aria-hidden="true"></span><span class="ponta"><span class="rotulo">Sai de</span><span class="nome">{{ rota().de }}</span></span></li>
            <li><span class="marco marco--fim" aria-hidden="true"></span><span class="ponta"><span class="rotulo">Vai para</span><strong class="nome">{{ rota().para }}</strong></span></li>
          </ol>
          <p class="quem geo-num">Pedida por <strong>{{ pessoa(d.solicitante) }}</strong> em {{ quando(d.criadaEm) }}</p>
        </section>

        <dl class="geo-dados">
          @if (textoDoPrazo(); as t) { <div><dt>Prazo</dt><dd class="geo-num">{{ t }}</dd></div> }
          <div><dt>Reserva</dt><dd>@if (d.reserva; as r) { <span class="geo-num">{{ r.numero }}</span> } @else { <span class="apoio">Sem reserva</span> }</dd></div>
          <div><dt>Movimentado</dt>
            <dd>
              <span class="progresso" role="progressbar" [attr.aria-valuenow]="percentual()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="percentual() + '% movimentado'"><i [style.width.%]="percentual()"></i></span>
              <span class="apoio geo-num"><strong>{{ num(totalMovimentado()) }}</strong> de {{ num(totalPedido()) }} · {{ percentual() }}%</span>
            </dd></div>
          <div><dt>Encarregado</dt><dd>{{ pessoa(d.encarregado) }}</dd></div>
          <div><dt>Supervisor</dt><dd>{{ pessoa(d.supervisor) }}@if (d.coordenador) { <span class="apoio"> · coordenador {{ pessoa(d.coordenador) }}</span> }</dd></div>
        </dl>

        @if (d.canceladaEm) {
          <div class="aviso"><geo-icone nome="info" /><div><strong>Cancelada em {{ quando(d.canceladaEm) }}</strong><p>{{ d.motivoCancelamento || 'Sem motivo registrado.' }}</p></div></div>
        }
        @if (d.pendenciaGeral; as p) {
          <div class="aviso aviso--atencao"><geo-icone nome="bandeira" /><div><strong>Pendência: {{ p.motivo }}</strong><p>{{ p.justificativa || 'Sem justificativa informada.' }}</p></div></div>
        }
        @if (d.observacao) { <blockquote class="obs"><span>Observação</span>{{ d.observacao }}</blockquote> }

        <h2 class="geo-secao"><span>Materiais</span><span class="geo-num">{{ d.itens.length }}</span></h2>
        <ul class="geo-grupo" aria-label="Materiais">
          @for (it of d.itens; track it.id) {
            <li>
              <button type="button" class="geo-linha item" [class.geo-linha--acao]="podePendencia()" [disabled]="!podePendencia()" (click)="abrirPendencia(it)"
                [attr.aria-label]="it.descricaoMaterial + ', pedido ' + num(it.quantidade) + ', movimentado ' + num(it.quantidadeMovimentada) + ', falta ' + num(it.quantidadePendente) + (podePendencia() ? '. Registrar pendência.' : '')">
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo">{{ it.descricaoMaterial }}</span>
                  <span class="geo-linha__apoio geo-num">Cód. {{ it.codigoMaterial }} · {{ it.unidade || 'UN' }}</span>
                  <span class="estado"><span [class]="'geo-etiqueta geo-etiqueta--' + situacaoDe(it).tom"><geo-icone [nome]="situacaoDe(it).icone" [tamanho]="13" />{{ situacaoDe(it).rotulo }}</span></span>
                </span>
                <span class="numeros geo-num" aria-hidden="true">
                  <span><small>Pedido</small>{{ num(it.quantidade) }}</span>
                  <span><small>Feito</small>{{ num(it.quantidadeMovimentada) }}</span>
                  <span [class.falta]="it.quantidadePendente > 0"><small>Falta</small>{{ num(it.quantidadePendente) }}</span>
                </span>
              </button>
            </li>
          }
        </ul>

        @if (movimentacoes().length) {
          <h2 class="geo-secao"><span>Movimentações</span><span class="geo-num">{{ movimentacoes().length }}</span></h2>
          <ul class="geo-grupo">
            @for (m of movimentacoes(); track m.id) {
              <li class="geo-linha op">
                <span class="geo-selo" [class.geo-selo--ok]="m.tipo !== 'ESTORNO'"><geo-icone [nome]="m.tipo === 'ESTORNO' ? 'desfazer' : 'transferencia'" /></span>
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo">{{ m.tipo === 'ESTORNO' ? 'Estorno' : 'Movimentação' }} · <span class="geo-num">{{ quando(m.realizadaEm) }}</span></span>
                  <span class="geo-linha__apoio">Por {{ pessoa(m.operador) }}</span>
                  @if (m.motivo) { <span class="geo-linha__apoio">Motivo: {{ m.motivo }}</span> }
                  <ul class="op-itens">@for (i of m.itens; track i.id) { <li class="geo-num">{{ num(i.quantidade) }} × {{ i.descricaoMaterial }}</li> }</ul>
                  @if (rede.isOnline() && auth.podeMovimentarFechamento() && m.podeEstornar) {
                    <span class="op-acoes">
                      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="estornoDe.set(m)"><geo-icone nome="desfazer" [tamanho]="18" />Estornar</button>
                    </span>
                  }
                </span>
              </li>
            }
          </ul>
        }
        <div class="respiro"></div>
      </div>

      @if (rede.isOnline() && (principal() || temMais())) {
        <footer class="geo-rodape-acoes">
          @if (temMais()) { <button type="button" class="geo-btn geo-btn--neutro" (click)="folha.set('mais')"><geo-icone nome="mais_opcoes" [tamanho]="18" />Mais ações</button> }
          @if (principal() === 'movimentar') {
            <button type="button" class="geo-btn geo-btn--principal principal" (click)="irPara('movimentar')"><geo-icone nome="transferencia" [tamanho]="18" />Movimentar</button>
          } @else if (principal() === 'reserva') {
            <button type="button" class="geo-btn geo-btn--principal principal" (click)="abrirReserva()"><geo-icone nome="documento" [tamanho]="18" />Registrar reserva</button>
          }
        </footer>
      }

      <geo-folha [aberta]="folha() === 'mais'" (fechar)="folha.set(null)" titulo="Mais ações">
        <ul class="geo-grupo mais">
          @if (d.acoes.alterarReserva) { <li><button type="button" class="geo-linha geo-linha--acao" (click)="abrirReserva()"><span class="geo-selo"><geo-icone nome="documento" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Corrigir a reserva</span><span class="geo-linha__apoio">Número e data da reserva</span></span></button></li> }
          @if (d.acoes.editar) { <li><button type="button" class="geo-linha geo-linha--acao" (click)="irPara('editar')"><span class="geo-selo"><geo-icone nome="editar" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Editar a solicitação</span><span class="geo-linha__apoio">Materiais, quantidades e responsáveis</span></span></button></li> }
          @if (podePendencia()) { <li><button type="button" class="geo-linha geo-linha--acao" (click)="abrirPendencia(null)"><span class="geo-selo"><geo-icone nome="bandeira" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ d.pendenciaGeral ? 'Ver a pendência geral' : 'Registrar pendência geral' }}</span><span class="geo-linha__apoio">Para um material só, toque nele na lista</span></span></button></li> }
          @if (d.acoes.cancelar) { <li><button type="button" class="geo-linha geo-linha--acao" (click)="abrirCancelar()"><span class="geo-selo"><geo-icone nome="fechar" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Cancelar a solicitação</span><span class="geo-linha__apoio">Pede o motivo</span></span></button></li> }
        </ul>
      </geo-folha>

      <geo-folha [aberta]="folha() === 'reserva'" (fechar)="folha.set(null)" [titulo]="d.reserva ? 'Corrigir a reserva' : 'Registrar reserva'"
        descricao="Depois da reserva, o almoxarifado tem 48 horas úteis para movimentar.">
        <div class="campos">
          <label class="geo-campo">
            <span class="geo-campo__rotulo">Número da reserva *</span>
            <input class="geo-input mono" [value]="numeroReserva()" (input)="numeroReserva.set(soDigitos($any($event.target)))" inputmode="numeric" maxlength="20" autocomplete="off"
              placeholder="Só números" [attr.aria-invalid]="tentou() && !reservaOk()">
            @if (tentou() && !reservaOk()) { <span class="geo-campo__erro"><geo-icone nome="alerta" [tamanho]="16" />Informe só números, até 20 dígitos.</span> }
          </label>
          <label class="geo-campo">
            <span class="geo-campo__rotulo">Data da reserva</span>
            <input class="geo-input" type="date" [max]="hoje" [value]="dataReserva()" (input)="dataReserva.set($any($event.target).value)">
            <span class="geo-campo__ajuda">Sem data, vale a de hoje.</span>
          </label>
        </div>
        <div rodape class="geo-folha-rodape">
          <button type="button" class="geo-btn geo-btn--neutro" (click)="folha.set(null)">Voltar</button>
          <button type="button" class="geo-btn geo-btn--principal" (click)="salvarReserva()" [disabled]="executando()">{{ executando() ? 'Salvando…' : 'Salvar reserva' }}</button>
        </div>
      </geo-folha>

      <geo-folha [aberta]="folha() === 'cancelar'" (fechar)="folha.set(null)" titulo="Cancelar a solicitação" descricao="Ela sai da fila do almoxarifado. Não dá para desfazer.">
        <div class="campos">
          <label class="geo-campo">
            <span class="geo-campo__rotulo">Motivo do cancelamento *</span>
            <textarea class="geo-input texto" rows="3" maxlength="500" [value]="motivoCancelar()" (input)="motivoCancelar.set($any($event.target).value)"
              [attr.aria-invalid]="tentou() && !motivoCancelar().trim()" placeholder="Ex.: pedido em duplicidade"></textarea>
            @if (tentou() && !motivoCancelar().trim()) { <span class="geo-campo__erro"><geo-icone nome="alerta" [tamanho]="16" />Informe o motivo.</span> }
          </label>
        </div>
        <div rodape class="geo-folha-rodape">
          <button type="button" class="geo-btn geo-btn--neutro" (click)="folha.set(null)">Voltar</button>
          <button type="button" class="geo-btn geo-btn--perigo" (click)="cancelar()" [disabled]="executando()">{{ executando() ? 'Cancelando…' : 'Cancelar solicitação' }}</button>
        </div>
      </geo-folha>

      <geo-folha [aberta]="folha() === 'pendencia'" (fechar)="folha.set(null)" [titulo]="pendenciaItem() ? 'Pendência do material' : 'Pendência geral'" [descricao]="pendenciaItem()?.descricaoMaterial ?? 'Vale para a solicitação inteira.'">
        <div class="campos">
          <geo-seletor rotulo="Motivo" [obrigatorio]="true" [opcoes]="opcoesMotivo()" [valor]="motivoPendencia()" (valorChange)="motivoPendencia.set($event)"
            [invalido]="tentou() && !motivoPendencia()" [placeholder]="motivos().length ? 'Escolher' : 'Carregando…'" />
          <label class="geo-campo">
            <span class="geo-campo__rotulo">Justificativa</span>
            <textarea class="geo-input texto" rows="3" maxlength="500" [value]="justificativa()" (input)="justificativa.set($any($event.target).value)" placeholder="Explique o que está faltando"></textarea>
          </label>
        </div>
        <div rodape class="geo-folha-rodape">
          @if (pendenciaAtual()) {
            <button type="button" class="geo-btn geo-btn--neutro" (click)="resolverPendencia()" [disabled]="executando()">Resolver</button>
          } @else {
            <button type="button" class="geo-btn geo-btn--neutro" (click)="folha.set(null)">Voltar</button>
          }
          <button type="button" class="geo-btn geo-btn--principal" (click)="salvarPendencia()" [disabled]="executando()">{{ executando() ? 'Salvando…' : 'Salvar pendência' }}</button>
        </div>
      </geo-folha>

      <app-folha-estorno-fechamento [solicitacao]="d" [movimentacao]="estornoDe()" (fechar)="estornoDe.set(null)" (concluido)="aplicar($event)" (recarregar)="estornoDe.set(null); carregar()" />
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .pagina { transition: opacity var(--geo-m-entrar); }
    .pagina.atualizando { opacity: .6; }
    .hero { margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e4); border-radius: var(--geo-r-folha); background: var(--geo-superficie); display: grid; gap: var(--geo-e3); }
    .selos { display: flex; flex-wrap: wrap; gap: 6px; }
    .titulo { display: grid; gap: 2px; }
    .titulo .rotulo, .ponta .rotulo { font: 500 .75rem/1.2 var(--geo-fonte); color: var(--geo-texto-2); }
    .obra { font: 700 1.25rem/1.25 var(--geo-fonte); letter-spacing: -.01em; overflow-wrap: anywhere; }
    .rota { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--geo-e3); }
    .rota li { position: relative; display: flex; gap: var(--geo-e3); align-items: flex-start; }
    .rota li:first-child::after { content: ''; position: absolute; left: 4px; top: 14px; bottom: calc(-1 * var(--geo-e3) - 2px); width: 2px; background: var(--geo-linha-forte); }
    .marco { width: 10px; height: 10px; margin-top: 4px; border-radius: 50%; box-shadow: inset 0 0 0 2px var(--geo-texto-3); flex: none; background: var(--geo-superficie); position: relative; z-index: 1; }
    .marco--fim { background: var(--geo-destaque); box-shadow: none; }
    .ponta { display: grid; gap: 1px; min-width: 0; }
    .ponta .nome { font: 500 .9375rem/1.3 var(--geo-fonte); overflow-wrap: anywhere; }
    .ponta strong.nome { font-weight: 600; }
    .quem { margin: 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .quem strong { color: var(--geo-texto); font-weight: 600; }
    .apoio { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .progresso { display: block; height: 8px; margin: 6px 0; border-radius: var(--geo-r-pilula); background: var(--geo-linha); overflow: hidden; }
    .progresso i { display: block; height: 100%; border-radius: inherit; background: var(--geo-ok); transition: width var(--geo-m-folha) var(--geo-curva); }
    .aviso { display: flex; gap: var(--geo-e3); margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-superficie-2); }
    .aviso > geo-icone { margin-top: 1px; }
    .aviso div { display: grid; gap: 4px; min-width: 0; }
    .aviso strong { font: var(--geo-t-corpo-forte); }
    .aviso p { margin: 0; font: var(--geo-t-apoio); font-size: .875rem; overflow-wrap: anywhere; }
    .aviso--atencao { background: var(--geo-atencao-suave); } .aviso--atencao > geo-icone { color: var(--geo-atencao); }
    .obs { margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4); border-left: 3px solid var(--geo-linha-forte); border-radius: 0 var(--geo-r-grupo) var(--geo-r-grupo) 0;
      background: var(--geo-superficie); font: var(--geo-t-corpo); display: grid; gap: 2px; overflow-wrap: anywhere; }
    .obs span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    button.geo-linha { width: 100%; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; }
    .item { align-items: flex-start; }
    .estado { display: flex; gap: 4px; margin-top: 4px; }
    .numeros { display: grid; grid-template-columns: repeat(3, auto); gap: var(--geo-e3); text-align: right; font: 700 1rem/1.1 var(--geo-fonte); flex: none; }
    .numeros span { display: grid; gap: 2px; }
    .numeros small { font: 500 .6875rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .numeros .falta { color: var(--geo-atencao); }
    .op { align-items: flex-start; }
    .op-itens { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; font: var(--geo-t-apoio); color: var(--geo-texto); }
    .op-acoes { display: flex; flex-wrap: wrap; gap: var(--geo-e2); margin-top: var(--geo-e2); }
    .respiro { height: 112px; }
    .geo-rodape-acoes .geo-btn { white-space: nowrap; }
    .geo-rodape-acoes .principal { flex: 1.6; }
    .mais { background: var(--geo-fundo); }
    .campos { display: grid; gap: var(--geo-e3); padding: 0 var(--geo-e3) var(--geo-e2); }
    .campos geo-seletor { box-shadow: inset 0 0 0 1px var(--geo-linha); border-radius: var(--geo-r-grupo); }
    .campos .geo-campo__rotulo, .campos .geo-campo__erro, .campos .geo-campo__ajuda { padding-left: var(--geo-e4); }
    .texto { min-height: 88px; padding: var(--geo-e3) var(--geo-e4); resize: vertical; }
    .mono { font-family: var(--geo-fonte-mono); }
  `],
})
export class FechamentoDetalheComponent {
  private readonly fechamento = inject(FechamentoService);
  private readonly almox = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly sessao = inject(SessaoService);
  private readonly rotaAtual = inject(ActivatedRoute).snapshot;
  readonly auth = inject(AuthService);
  readonly rede = inject(ConnectivityService);

  private readonly base = this.rotaAtual.data['base'] as BaseFechamento;
  readonly id = this.rotaAtual.paramMap.get('id') ?? '';
  private abrirReservaAoCarregar = this.rotaAtual.queryParamMap.get('acao') === 'reserva';

  readonly hoje = hojeIso();
  readonly det = signal<FechamentoDetalhe | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly executando = signal(false);
  readonly tentou = signal(false);
  readonly folha = signal<Folha | null>(null);
  readonly estornoDe = signal<MovimentacaoFechamento | null>(null);

  readonly numeroReserva = signal('');
  readonly dataReserva = signal('');
  readonly motivoCancelar = signal('');
  readonly motivos = signal<Motivo[]>([]);
  readonly pendenciaItem = signal<ItemFechamento | null>(null);
  readonly motivoPendencia = signal<string | null>(null);
  readonly justificativa = signal('');

  readonly tipo = computed(() => tipoFechamento(this.det()?.tipo ?? '221'));
  readonly iconeDoTipo = computed(() => iconeTipo(this.det()?.tipo ?? '221'));
  readonly situacao = computed(() => (this.det() ? SITUACOES[this.det()!.situacao] : null));
  readonly prazo = computed(() => { const s = this.det()?.prazoVigente?.situacao; return s ? PRAZOS[s] : null; });
  readonly textoDoPrazo = computed(() => (this.det() ? textoPrazo(this.det()!.situacao, this.det()!.prazoVigente) : ''));
  readonly obra = computed(() => (this.det() ? rotuloObra(this.det()!.obra) : ''));
  readonly rota = computed(() => (this.det() ? rotaFechamento(this.det()!) : { de: '', para: '' }));
  readonly movimentacoes = computed(() => movimentacoesRecentes(this.det()?.movimentacoes ?? []));
  readonly totalPedido = computed(() => (this.det()?.itens ?? []).reduce((a, i) => a + Number(i.quantidade || 0), 0));
  readonly totalMovimentado = computed(() => (this.det()?.itens ?? []).reduce((a, i) => a + Number(i.quantidadeMovimentada || 0), 0));
  readonly percentual = computed(() => (this.totalPedido() > 0 ? Math.min(100, Math.round((this.totalMovimentado() / this.totalPedido()) * 100)) : 0));

  readonly podePendencia = computed(() => !!this.det()?.acoes.pendencias && this.rede.isOnline());
  readonly principal = computed<'movimentar' | 'reserva' | null>(() => {
    const a = this.det()?.acoes;
    return a?.movimentar ? 'movimentar' : a?.registrarReserva ? 'reserva' : null;
  });
  readonly temMais = computed(() => {
    const a = this.det()?.acoes;
    return !!a && (a.alterarReserva || a.editar || a.pendencias || a.cancelar);
  });
  readonly pendenciaAtual = computed(() => (this.pendenciaItem() ? this.pendenciaItem()!.pendencia : this.det()?.pendenciaGeral) ?? null);
  readonly reservaOk = computed(() => reservaValida(this.numeroReserva()));
  readonly opcoesMotivo = computed<OpcaoSeletor[]>(() => this.motivos().map(m => ({ valor: m.id, rotulo: m.nome })));

  constructor() {
    queueMicrotask(() => this.carregar());
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.fechamento.detalhe(this.id).subscribe({
      next: d => {
        this.det.set(d);
        this.carregando.set(false);
        if (this.abrirReservaAoCarregar) {
          this.abrirReservaAoCarregar = false;
          if (d.acoes.registrarReserva || d.acoes.alterarReserva) this.abrirReserva();
        }
      },
      error: (e: ApiError) => {
        this.carregando.set(false);
        this.erro.set(e.status === 404 ? 'Esta solicitação não existe mais.' : e.status === 0 ? 'Sem conexão com o servidor.' : e.detail || 'Tente de novo.');
      },
    });
  }

  /** Resposta de um comando: já traz a solicitação atualizada, sem nova consulta. */
  aplicar(d: FechamentoDetalhe): void {
    this.det.set(d);
    this.folha.set(null);
    this.estornoDe.set(null);
  }

  voltar(): void {
    const anterior = this.sessao.rotaAnterior();
    void this.router.navigateByUrl(anterior?.startsWith(this.base) && !/\/(movimentar|editar|novo)$/.test(anterior) && !anterior.includes(this.id) ? anterior : this.base);
  }

  irPara(passo: 'movimentar' | 'editar'): void {
    void this.router.navigate([this.base, this.id, passo]);
  }

  num(n: number): string {
    return numeroBr(n);
  }

  quando(iso: string): string {
    return dataHora(iso);
  }

  pessoa(p: { nome: string | null } | null | undefined): string {
    return nomePessoa(p);
  }

  situacaoDe(i: ItemFechamento) {
    return situacaoItem(i);
  }

  soDigitos(campo: HTMLInputElement): string {
    const limpo = campo.value.replace(/\D/g, '').slice(0, 20);
    if (campo.value !== limpo) campo.value = limpo;
    return limpo;
  }

  abrirReserva(): void {
    const r = this.det()?.reserva;
    this.numeroReserva.set(r?.numero ?? '');
    this.dataReserva.set(r?.dataCriacao?.substring(0, 10) ?? '');
    this.tentou.set(false);
    this.folha.set('reserva');
  }

  salvarReserva(): void {
    const d = this.det();
    this.tentou.set(true);
    if (!d || this.executando() || !this.reservaOk()) return;
    this.comando(this.fechamento.registrarReserva(d.id, d.versao, this.numeroReserva().trim(), this.dataReserva() || null), 'Reserva salva.', 'Não foi possível salvar a reserva.');
  }

  abrirCancelar(): void {
    this.motivoCancelar.set('');
    this.tentou.set(false);
    this.folha.set('cancelar');
  }

  cancelar(): void {
    const d = this.det();
    this.tentou.set(true);
    if (!d || this.executando() || !this.motivoCancelar().trim()) return;
    this.comando(this.fechamento.cancelar(d.id, d.versao, this.motivoCancelar().trim()), 'Solicitação cancelada.', 'Não foi possível cancelar.');
  }

  abrirPendencia(item: ItemFechamento | null): void {
    if (!this.podePendencia()) return;
    this.almox.motivosPendencia().subscribe(m => this.motivos.set(m));
    const atual = (item ? item.pendencia : this.det()?.pendenciaGeral) ?? null;
    this.pendenciaItem.set(item);
    this.motivoPendencia.set(atual?.idMotivo ?? null);
    this.justificativa.set(atual?.justificativa ?? '');
    this.tentou.set(false);
    this.folha.set('pendencia');
  }

  salvarPendencia(): void {
    const d = this.det();
    const motivo = this.motivoPendencia();
    this.tentou.set(true);
    if (!d || !motivo || this.executando()) return;
    this.comando(this.fechamento.registrarPendencia(d.id, this.pendenciaItem()?.id ?? null, motivo, this.justificativa().trim() || null), 'Pendência registrada.', 'Não foi possível registrar a pendência.');
  }

  resolverPendencia(): void {
    const d = this.det();
    if (!d || this.executando()) return;
    this.comando(this.fechamento.removerPendencia(d.id, this.pendenciaItem()?.id ?? null), 'Pendência resolvida.', 'Não foi possível resolver a pendência.');
  }

  private comando(chamada: ReturnType<FechamentoService['detalhe']>, sucesso: string, padrao: string): void {
    this.executando.set(true);
    chamada.subscribe({
      next: d => {
        this.executando.set(false);
        this.toast.success(sucesso);
        this.aplicar(d);
      },
      error: (e: ApiError) => {
        this.executando.set(false);
        this.toast.error(mensagemFalha(e, padrao));
        if (e.status === 409) { this.folha.set(null); this.carregar(); }
      },
    });
  }
}
