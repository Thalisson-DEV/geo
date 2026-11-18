import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlmoxService } from '../../../core/almox/almox.service';
import { Estoque, ItemSolicitacao, OperacaoTecnica, Solicitacao } from '../../../core/almox/almox.models';
import { idCurto, prazoRelativo } from '../../../core/almox/almox-status';
import { defTipoTecnico, etapaTecnica, nomeEquipe, nomeEstoque, podeTecnica, tituloTecnica } from '../../../core/almox/almox-tecnico';
import { ApiError } from '../../../core/http/error.interceptor';
import { SessaoService } from '../../../core/sessao/sessao.service';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import { ToastService } from '../../../core/ui/toast.service';
import { BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, QuantidadeComponent, VazioComponent, dataCurta, hora, numeroBr } from '../../../ui';

interface ItemEstorno { id: string; descricao: string; unidade: string; serie: string | null; restante: number; quantidade: number; marcado: boolean }

const MINIMO_MOTIVO = 5;

/**
 * Detalhe de uma solicitação técnica para o almoxarifado: OC/OS e obra no topo, o caminho do
 * material, a separação, o que já saiu ou voltou e as ações liberadas pelo backend (separar,
 * entregar, receber a devolução e estornar uma operação).
 */
@Component({
  selector: 'app-tecnica-almox-detalhe',
  standalone: true,
  imports: [BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, QuantidadeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-barra-topo [titulo]="tituloBarra()" [subtitulo]="det() ? etapa().rotulo : 'Carregando…'" (voltar)="voltar()">
      <ces-indicador-rede />
      <button type="button" class="ces-btn-icone" (click)="carregar()" [disabled]="carregando()" aria-label="Atualizar"><ces-icone nome="atualizar" /></button>
    </ces-barra-topo>

    @if (carregando() && !det()) {
      <div class="ces-esqueletos" aria-busy="true" aria-label="Carregando a solicitação">
        <div class="ces-esqueleto" style="height: 160px"></div><div class="ces-esqueleto" style="height: 96px"></div><div class="ces-esqueleto" style="height: 220px"></div>
      </div>
    } @else if (erro()) {
      <ces-vazio icone="alerta" titulo="Não foi possível abrir a solicitação" [texto]="erro()">
        <button type="button" class="ces-btn ces-btn--tonal" (click)="carregar()">Tentar de novo</button>
      </ces-vazio>
    } @else if (det(); as d) {
      <div class="pagina" [class.atualizando]="carregando()">
        <section class="hero" aria-label="Resumo">
          <div class="selos">
            <span [class]="'ces-etiqueta ces-etiqueta--' + etapa().tom"><ces-icone [nome]="etapa().icone" [tamanho]="14" />{{ etapa().rotulo }}</span>
            <span class="ces-etiqueta ces-etiqueta--neutro tipo ces-num">{{ tipo().codigo }} · {{ tipo().rotulo }}</span>
            @if (d.tecnico?.atrasada) { <span class="ces-etiqueta ces-etiqueta--erro"><ces-icone nome="alerta" [tamanho]="14" />Saque atrasado</span> }
            @if (d.foraPrazoSaque) { <span class="ces-etiqueta ces-etiqueta--atencao"><ces-icone nome="relogio" [tamanho]="14" />Fora das 48h</span> }
            @if (d.possuiPendencia) { <span class="ces-etiqueta ces-etiqueta--atencao"><ces-icone nome="bandeira" [tamanho]="14" />Com pendência</span> }
          </div>
          <div class="titulo">
            @if (titulo().ocorrencia; as oc) {
              <span class="rotulo">Ocorrência</span>
              <strong class="oc ces-num">{{ oc }}</strong>
            }
            <span class="rotulo">Obra</span>
            <strong class="obra">{{ titulo().obra }}</strong>
          </div>
          <ol class="rota" aria-label="Caminho do material">
            <li><span class="marco" aria-hidden="true"></span><span class="ponta"><span class="rotulo">{{ tipo().adicao ? 'Sai de' : 'Sai da obra' }}</span>
              <span class="nome">{{ tipo().adicao ? almoxarifado() : titulo().obra }}</span></span></li>
            <li><span class="marco marco--fim" aria-hidden="true"></span><span class="ponta"><span class="rotulo">{{ tipo().adicao ? 'Vai para a obra' : 'Recebe' }}</span>
              <strong class="nome">{{ tipo().adicao ? titulo().obra : almoxarifado() }}</strong></span></li>
          </ol>
          <p class="quem ces-num">Pedida por <strong>{{ nome(d.idRequisitante) }}</strong> em {{ dataHora(d.dataSolicitacao) }}</p>
        </section>

        <dl class="ces-dados">
          <div><dt>Saque previsto</dt>
            <dd>@if (dataPrevista(); as p) { <span [class.alerta]="d.tecnico?.atrasada">{{ dataCurta(p.substring(0, 10)) }}</span><span class="apoio"> · {{ relativo(p) }}</span> } @else { Não agendado }</dd></div>
          <div><dt>Equipe</dt><dd>{{ equipe() }}</dd></div>
          <div><dt>Reserva</dt><dd>@if (d.tecnico?.reserva?.numero; as r) { <span class="ces-num">{{ r }}</span> } @else { <span class="apoio">Sem reserva</span> }</dd></div>
          @if (tipo().adicao) {
            <div><dt>Separação</dt><dd>{{ separacao() }}</dd></div>
          }
          <div><dt>Atendimento</dt>
            <dd>
              <span class="progresso" role="progressbar" [attr.aria-valuenow]="percentual()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="percentual() + '% atendido'"><i [style.width.%]="percentual()"></i></span>
              <span class="apoio ces-num"><strong>{{ num(totalAtendido()) }}</strong> de {{ num(totalPedido()) }} {{ tipo().adicao ? 'entregues' : 'recebidos' }} · {{ percentual() }}%</span>
            </dd></div>
        </dl>

        @if (d.status === 'REJEITADO' && d.motivoRejeicao) {
          <div class="aviso aviso--erro"><ces-icone nome="fechar" /><div><strong>Rejeitada: {{ d.motivoRejeicao.nome }}</strong><p>{{ d.justificativaRejeicao || 'Sem justificativa registrada.' }}</p></div></div>
        }
        @if (d.encerrada && d.motivoEncerramento) {
          <div class="aviso"><ces-icone nome="info" /><div><strong>Saldo pendente encerrado</strong><p>{{ d.motivoEncerramento }}</p></div></div>
        }
        @if (d.motivoPendencia) {
          <div class="aviso aviso--atencao"><ces-icone nome="bandeira" /><div><strong>Pendência: {{ d.motivoPendencia.nome }}</strong><p>{{ d.justificativaPendencia || 'Sem justificativa informada.' }}</p></div></div>
        }
        @if (d.tecnico?.observacao || d.observacao) {
          <blockquote class="obs"><span>Observação</span>{{ d.tecnico?.observacao || d.observacao }}</blockquote>
        }

        <h2 class="ces-secao"><span>Materiais</span><span class="ces-num">{{ d.itens.length }}</span></h2>
        <ul class="ces-grupo" aria-label="Materiais">
          @for (it of d.itens; track it.id) {
            <li class="ces-linha item">
              <span class="ces-linha__texto">
                <span class="ces-linha__titulo">{{ it.material.descricao }}</span>
                <span class="ces-linha__apoio ces-num">Cód. {{ it.material.codigo }} · {{ it.material.unidadeMedida || 'UN' }}{{ it.material.detalhaSerie ? ' · com nº de série' : '' }}</span>
                @if (it.motivoPendencia) { <span class="estado"><span class="ces-etiqueta ces-etiqueta--atencao"><ces-icone nome="bandeira" [tamanho]="13" />{{ it.motivoPendencia.nome }}</span></span> }
              </span>
              <span class="numeros ces-num" [attr.aria-label]="'Pedido ' + num(it.quantidade) + ', ' + rotuloFeito() + ' ' + num(atendido(it)) + ', falta ' + num(pendente(it))">
                <span><small>Pedido</small>{{ num(it.quantidade) }}</span>
                <span><small>{{ rotuloFeito() }}</small>{{ num(atendido(it)) }}</span>
                <span [class.falta]="pendente(it) > 0"><small>Falta</small>{{ num(pendente(it)) }}</span>
              </span>
            </li>
          }
        </ul>

        @if (operacoes().length) {
          <h2 class="ces-secao"><span>Histórico</span><span class="ces-num">{{ operacoes().length }}</span></h2>
          <ul class="ces-grupo">
            @for (op of operacoes(); track op.id) {
              <li class="ces-linha op">
                <span class="ces-selo" [class.ces-selo--ok]="op.tipo !== 'ESTORNO'"><ces-icone [nome]="iconeOp(op)" /></span>
                <span class="ces-linha__texto">
                  <span class="ces-linha__titulo">{{ rotuloOp(op) }} · <span class="ces-num">{{ dataHora(op.realizadaEm) }}</span></span>
                  <span class="ces-linha__apoio">Por {{ nome(op.idUsuarioOperador) }}{{ op.idColaboradorSaque ? ' · retirou ' + nome(op.idColaboradorSaque) : '' }}</span>
                  @if (op.motivo) { <span class="ces-linha__apoio">Motivo: {{ op.motivo }}</span> }
                  <ul class="op-itens">
                    @for (i of op.itens; track i.id) {
                      <li class="ces-num">{{ num(i.quantidade) }} × {{ i.descricaoMaterial }}@if (i.condicao === 'SUCATA') { <span class="serie">sucata</span> }@if (i.numeroSerie) { <span class="serie">{{ i.numeroSerie }}</span> }</li>
                    }
                  </ul>
                </span>
              </li>
            }
          </ul>
        }
        <div class="respiro"></div>
      </div>

      @if (rede.isOnline() && temAcao()) {
        <footer class="ces-rodape-acoes">
          @if (pode('ESTORNAR') && estornaveis().length) {
            <button type="button" class="ces-btn ces-btn--neutro" (click)="abrirEstorno()" [disabled]="executando()"><ces-icone nome="desfazer" [tamanho]="18" />Estornar</button>
          }
          @if (pode('PULAR_SEPARACAO')) {
            <button type="button" class="ces-btn ces-btn--neutro" (click)="separar('pular')" [disabled]="executando()">{{ confirmandoPular() ? 'Toque de novo' : 'Pular separação' }}</button>
          }
          @if (pode('INICIAR_SEPARACAO')) {
            <button type="button" class="ces-btn ces-btn--principal principal" (click)="separar('iniciar')" [disabled]="executando()">
              <ces-icone nome="material" [tamanho]="18" />{{ executando() ? 'Iniciando…' : 'Iniciar separação' }}</button>
          } @else if (pode('CONCLUIR_SEPARACAO')) {
            <button type="button" class="ces-btn ces-btn--principal principal" (click)="separar('concluir')" [disabled]="executando()">
              <ces-icone nome="check" [tamanho]="18" />{{ executando() ? 'Concluindo…' : 'Concluir separação' }}</button>
          } @else if (pode('ENTREGAR')) {
            <button type="button" class="ces-btn ces-btn--principal principal" (click)="ir('entrega')"><ces-icone nome="caminhao" [tamanho]="18" />Registrar entrega</button>
          } @else if (pode('CONFIRMAR_DEVOLUCAO')) {
            <button type="button" class="ces-btn ces-btn--principal principal" (click)="ir('devolucao')"><ces-icone nome="desfazer" [tamanho]="18" />Receber devolução</button>
          }
        </footer>
      }
    }

    <!-- Estorno de uma operação -->
    <ces-folha [aberta]="estornoAberto()" (fechar)="estornoAberto.set(false)" titulo="Estornar uma operação"
      descricao="Desfaz a entrega ou a devolução escolhida: o material volta pelo mesmo caminho. Não dá para desfazer o estorno.">
      <div class="campos">
        @if (estornaveis().length > 1) {
          <div class="ops" role="radiogroup" aria-label="Operação a estornar">
            @for (op of estornaveis(); track op.id) {
              <button type="button" role="radio" class="op-escolha" [attr.aria-checked]="opEstorno()?.id === op.id" (click)="escolherOperacao(op)">
                <ces-icone [nome]="iconeOp(op)" [tamanho]="18" /><span>{{ rotuloOp(op) }} · <span class="ces-num">{{ dataHora(op.realizadaEm) }}</span></span>
              </button>
            }
          </div>
        }
        <ul class="ces-grupo lista-estorno">
          @for (i of estorno(); track i.id; let idx = $index) {
            <li class="ces-linha estorno-linha">
              <button type="button" role="checkbox" class="caixa" [attr.aria-checked]="i.marcado" (click)="marcarEstorno(idx)" [attr.aria-label]="'Estornar ' + i.descricao">
                <ces-icone nome="check" [tamanho]="14" /></button>
              <span class="ces-linha__texto"><span class="ces-linha__titulo">{{ i.descricao }}</span>
                <span class="ces-linha__apoio ces-num">{{ i.serie ? 'Série ' + i.serie : 'Na operação ' + num(i.restante) + ' ' + i.unidade }}</span></span>
              @if (i.marcado && !i.serie) {
                <ces-quantidade [valor]="i.quantidade" (valorChange)="qtdEstorno(idx, $event)" [minimo]="0.001" [unidade]="i.unidade" [rotulo]="'quantidade a estornar de ' + i.descricao" />
              }
            </li>
          }
        </ul>
        <label class="ces-campo">
          <span class="ces-campo__rotulo">Motivo do estorno *</span>
          <textarea class="ces-input texto" rows="3" [value]="motivoEstorno()" (input)="motivoEstorno.set($any($event.target).value)"
            [attr.aria-invalid]="tentouEstorno() && motivoEstorno().trim().length < minimo" placeholder="Ex.: entregue para a equipe errada"></textarea>
          @if (tentouEstorno() && motivoEstorno().trim().length < minimo) { <span class="ces-campo__erro"><ces-icone nome="alerta" [tamanho]="16" />Escreva ao menos {{ minimo }} caracteres.</span> }
        </label>
      </div>
      <div rodape class="ces-folha-rodape">
        <button type="button" class="ces-btn ces-btn--neutro" (click)="estornoAberto.set(false)">Voltar</button>
        <button type="button" class="ces-btn ces-btn--perigo" (click)="confirmarEstorno()" [disabled]="executando() || !marcadosEstorno()">
          {{ executando() ? 'Estornando…' : confirmandoEstorno() ? 'Toque de novo para confirmar' : 'Estornar ' + marcadosEstorno() + (marcadosEstorno() === 1 ? ' item' : ' itens') }}</button>
      </div>
    </ces-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--ces-fundo); }
    :host > * { flex-shrink: 0; }
    .pagina { transition: opacity var(--ces-m-entrar); }
    .pagina.atualizando { opacity: .6; }
    .hero { margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e4); border-radius: var(--ces-r-folha); background: var(--ces-superficie); display: grid; gap: var(--ces-e3); }
    .selos { display: flex; flex-wrap: wrap; gap: 6px; }
    .tipo { font-family: var(--ces-fonte); }
    .titulo { display: grid; gap: 2px; }
    .titulo .rotulo { font: 500 .75rem/1.2 var(--ces-fonte); color: var(--ces-texto-2); }
    .titulo .rotulo:not(:first-child) { margin-top: var(--ces-e2); }
    .oc, .obra { font: 700 1.25rem/1.25 var(--ces-fonte); letter-spacing: -.01em; overflow-wrap: anywhere; }
    .rota { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ces-e3); }
    .rota li { position: relative; display: flex; gap: var(--ces-e3); align-items: flex-start; }
    .rota li:first-child::after { content: ''; position: absolute; left: 4px; top: 14px; bottom: calc(-1 * var(--ces-e3) - 2px); width: 2px; background: var(--ces-linha-forte); }
    .marco { width: 10px; height: 10px; margin-top: 4px; border-radius: 50%; box-shadow: inset 0 0 0 2px var(--ces-texto-3); flex: none; background: var(--ces-superficie); position: relative; z-index: 1; }
    .marco--fim { background: var(--ces-destaque); box-shadow: none; }
    .ponta { display: grid; gap: 1px; min-width: 0; }
    .ponta .rotulo { font: 500 .75rem/1.2 var(--ces-fonte); color: var(--ces-texto-2); }
    .ponta .nome { font: 500 .9375rem/1.3 var(--ces-fonte); overflow-wrap: break-word; word-break: break-word; }
    .ponta strong.nome { font-weight: 600; }
    .quem { margin: 0; font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .quem strong { color: var(--ces-texto); font-weight: 600; }
    .ces-dados .alerta { color: var(--ces-erro); }
    .apoio { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .progresso { display: block; height: 8px; margin: 6px 0; border-radius: var(--ces-r-pilula); background: var(--ces-linha); overflow: hidden; }
    .progresso i { display: block; height: 100%; border-radius: inherit; background: var(--ces-ok); transition: width var(--ces-m-folha) var(--ces-curva); }
    .aviso { display: flex; gap: var(--ces-e3); margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e3) var(--ces-e4); border-radius: var(--ces-r-grupo); background: var(--ces-superficie-2); }
    .aviso > ces-icone { margin-top: 1px; }
    .aviso div { display: grid; gap: 4px; justify-items: start; min-width: 0; }
    .aviso strong { font: var(--ces-t-corpo-forte); }
    .aviso p { margin: 0; font: var(--ces-t-apoio); font-size: .875rem; overflow-wrap: anywhere; }
    .aviso--erro { background: var(--ces-erro-suave); } .aviso--erro > ces-icone { color: var(--ces-erro); }
    .aviso--atencao { background: var(--ces-atencao-suave); } .aviso--atencao > ces-icone { color: var(--ces-atencao); }
    .obs { margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e3) var(--ces-e4); border-left: 3px solid var(--ces-linha-forte); border-radius: 0 var(--ces-r-grupo) var(--ces-r-grupo) 0;
      background: var(--ces-superficie); font: var(--ces-t-corpo); display: grid; gap: 2px; }
    .obs span { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .item { align-items: flex-start; }
    .estado { display: flex; gap: 4px; margin-top: 4px; }
    .numeros { display: grid; grid-template-columns: repeat(3, auto); gap: var(--ces-e3); text-align: right; font: 700 1rem/1.1 var(--ces-fonte); flex: none; }
    .numeros span { display: grid; gap: 2px; }
    .numeros small { font: 500 .6875rem/1 var(--ces-fonte); color: var(--ces-texto-2); }
    .numeros .falta { color: var(--ces-atencao); }
    .op { align-items: flex-start; }
    .op-itens { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; font: var(--ces-t-apoio); color: var(--ces-texto); }
    .serie { margin-left: 6px; padding: 1px 6px; border-radius: 6px; background: var(--ces-superficie-2); font: 600 .75rem/1.4 var(--ces-fonte-mono); }
    .respiro { height: 112px; }
    .ces-rodape-acoes .principal { flex: 1.6; }
    .campos { display: grid; gap: var(--ces-e3); padding: 0 var(--ces-e3) var(--ces-e2); }
    .ops { display: grid; gap: var(--ces-e2); }
    .op-escolha { display: flex; align-items: center; gap: var(--ces-e2); min-height: 48px; padding: 0 var(--ces-e4); border-radius: var(--ces-r-grupo); border: 1px solid var(--ces-linha-forte);
      background: var(--ces-superficie); color: var(--ces-texto); font: 500 .875rem/1.3 var(--ces-fonte); text-align: left; cursor: pointer; }
    .op-escolha[aria-checked='true'] { border-color: var(--ces-destaque); background: var(--ces-destaque-suave); color: var(--ces-destaque); font-weight: 600; }
    .texto { min-height: 88px; padding: var(--ces-e3) var(--ces-e4); resize: vertical; }
    .lista-estorno { margin: 0; background: var(--ces-fundo); }
    .estorno-linha { flex-wrap: wrap; }
    .caixa { width: 44px; height: 44px; margin: -10px -6px -10px -10px; border: 0; background: transparent; display: grid; place-items: center; cursor: pointer; color: transparent; }
    .caixa ces-icone { width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--ces-linha-forte); display: grid; place-items: center; box-sizing: border-box; }
    .caixa[aria-checked='true'] { color: var(--ces-destaque-texto); }
    .caixa[aria-checked='true'] ces-icone { background: var(--ces-destaque); border-color: var(--ces-destaque); }
    .campos .ces-campo__rotulo, .campos .ces-campo__erro { padding-left: var(--ces-e4); }
  `],
})
export class TecnicaAlmoxDetalheComponent {
  private readonly almox = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly sessao = inject(SessaoService);
  readonly rede = inject(ConnectivityService);
  readonly id = signal(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');

  readonly minimo = MINIMO_MOTIVO;
  readonly det = signal<Solicitacao | null>(null);
  readonly estoques = signal<Estoque[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly executando = signal(false);
  readonly confirmandoPular = signal(false);

  readonly estornoAberto = signal(false);
  readonly opEstorno = signal<OperacaoTecnica | null>(null);
  readonly estorno = signal<ItemEstorno[]>([]);
  readonly motivoEstorno = signal('');
  readonly tentouEstorno = signal(false);
  readonly confirmandoEstorno = signal(false);

  readonly titulo = computed(() => (this.det() ? tituloTecnica(this.det()!) : { ocorrencia: null, obra: '' }));
  readonly tituloBarra = computed(() => this.titulo().ocorrencia ?? `Solicitação #${idCurto(this.id())}`);
  readonly tipo = computed(() => defTipoTecnico(this.det()?.tecnico?.tipoTecnico ?? this.det()?.tipoTecnico));
  readonly etapa = computed(() => etapaTecnica(this.det()));
  readonly dataPrevista = computed(() => this.det()?.tecnico?.dataPrevista ?? this.det()?.dataPrevista ?? null);
  readonly equipe = computed(() => nomeEquipe(this.estoques(), this.det()?.tecnico?.idEquipe ?? this.det()?.idEquipe) ?? 'Equipe não definida');
  readonly almoxarifado = computed(() => nomeEstoque(this.estoques(), this.det()?.tecnico?.idAlmoxarifadoAtendimento) ?? 'Almoxarifado');
  readonly separacao = computed(() => ({
    AGUARDANDO_AGENDAMENTO: 'Aguardando a data de saque', PRONTO_PARA_SEPARACAO: 'Pronta para separar', EM_SEPARACAO: 'Em separação', SEPARADO: 'Separada',
  } as Record<string, string>)[this.det()?.tecnico?.statusSeparacao ?? this.det()?.statusSeparacao ?? ''] ?? '—');
  readonly rotuloFeito = computed(() => (this.tipo().adicao ? 'Entregue' : 'Recebido'));
  readonly totalPedido = computed(() => (this.det()?.itens ?? []).reduce((a, i) => a + Number(i.quantidade || 0), 0));
  readonly totalAtendido = computed(() => (this.det()?.itens ?? []).reduce((a, i) => a + this.atendido(i), 0));
  readonly percentual = computed(() => (this.totalPedido() > 0 ? Math.min(100, Math.round((this.totalAtendido() / this.totalPedido()) * 100)) : 0));
  readonly operacoes = computed(() => [...(this.det()?.tecnico?.operacoes ?? [])].sort((a, b) => b.realizadaEm.localeCompare(a.realizadaEm)));
  readonly temAcao = computed(() => ['INICIAR_SEPARACAO', 'CONCLUIR_SEPARACAO', 'PULAR_SEPARACAO', 'ENTREGAR', 'CONFIRMAR_DEVOLUCAO'].some(a => this.pode(a))
    || (this.pode('ESTORNAR') && this.estornaveis().length > 0));

  /** Entregas e devoluções com algo ainda não estornado. */
  readonly estornaveis = computed(() => {
    const ops = this.det()?.tecnico?.operacoes ?? [];
    return ops.filter(op => op.tipo !== 'ESTORNO' && this.restantes(op).some(r => r.restante > 0))
      .sort((a, b) => b.realizadaEm.localeCompare(a.realizadaEm));
  });
  readonly marcadosEstorno = computed(() => this.estorno().filter(i => i.marcado && i.quantidade > 0).length);

  constructor() {
    this.almox.carregarNomes();
    this.almox.estoques().subscribe(e => this.estoques.set(e));
    queueMicrotask(() => this.carregar());
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.almox.obterSolicitacao(this.id()).subscribe({
      next: d => {
        if (d.contexto && d.contexto !== 'TECNICO') { void this.router.navigate(['/almox/solicitacoes', d.id], { replaceUrl: true }); return; }
        this.det.set(d);
        this.carregando.set(false);
      },
      error: (e: ApiError) => {
        this.carregando.set(false);
        this.erro.set(e.status === 404 ? 'Esta solicitação não existe mais.' : e.status === 0 ? 'Sem conexão com o servidor.' : e.detail || 'Tente de novo.');
      },
    });
  }

  voltar(): void {
    const anterior = this.sessao.rotaAnterior();
    void this.router.navigateByUrl(anterior?.startsWith('/almox/tecnicas') && !/\/(entrega|devolucao)$/.test(anterior) ? anterior : '/almox/tecnicas');
  }

  pode(acao: string): boolean {
    return podeTecnica(this.det(), acao);
  }

  ir(passo: 'entrega' | 'devolucao'): void {
    void this.router.navigate(['/almox/tecnicas', this.id(), passo]);
  }

  nome(id?: string | null): string {
    return this.almox.nome(id);
  }

  num(n: number): string {
    return numeroBr(n);
  }

  relativo(d: string): string {
    return prazoRelativo(d);
  }

  dataHora(iso: string): string {
    return `${dataCurta(iso)} às ${hora(iso)}`;
  }

  protected readonly dataCurta = dataCurta;

  atendido(i: ItemSolicitacao): number {
    return Number((this.tipo().adicao ? i.quantidadeEntregaLiquida ?? i.quantidadeEntregue : i.quantidadeDevolucaoLiquida) ?? 0);
  }

  pendente(i: ItemSolicitacao): number {
    return Number(i.quantidadePendente ?? Math.max(0, i.quantidade - this.atendido(i)));
  }

  rotuloOp(op: OperacaoTecnica): string {
    if (op.tipo === 'ENTREGA') return 'Entrega';
    if (op.tipo === 'DEVOLUCAO') return 'Devolução recebida';
    return 'Estorno';
  }

  iconeOp(op: OperacaoTecnica): 'caminhao' | 'entrada' | 'desfazer' {
    return op.tipo === 'ENTREGA' ? 'caminhao' : op.tipo === 'DEVOLUCAO' ? 'entrada' : 'desfazer';
  }

  // ---------- separação ----------
  separar(acao: 'iniciar' | 'concluir' | 'pular'): void {
    const d = this.det();
    if (!d || this.executando()) return;
    if (acao === 'pular' && !this.confirmandoPular()) {
      this.confirmandoPular.set(true);
      setTimeout(() => this.confirmandoPular.set(false), 3000);
      return;
    }
    this.confirmandoPular.set(false);
    const versao = d.tecnico?.versao ?? d.versao ?? 0;
    const chamada = acao === 'iniciar' ? this.almox.iniciarSeparacao(d.id, versao) : acao === 'concluir' ? this.almox.concluirSeparacao(d.id, versao) : this.almox.pularSeparacao(d.id, versao);
    this.executando.set(true);
    chamada.subscribe({
      next: () => {
        this.executando.set(false);
        this.toast.success(acao === 'iniciar' ? 'Separação iniciada.' : 'Material separado. Agora aguarda a retirada pela equipe.');
        this.carregar();
      },
      error: (e: ApiError) => { this.executando.set(false); this.falha(e, 'Não foi possível atualizar a separação.'); },
    });
  }

  // ---------- estorno ----------
  /** Quanto de cada item da operação ainda não foi estornado. */
  private restantes(op: OperacaoTecnica): { item: OperacaoTecnica['itens'][number]; restante: number }[] {
    const estornos = (this.det()?.tecnico?.operacoes ?? []).filter(o => o.tipo === 'ESTORNO' && o.idOperacaoOriginal === op.id);
    return op.itens.map(item => {
      const desfeito = estornos.flatMap(e => e.itens).filter(e => e.idItemOperacaoOriginal === item.id).reduce((a, e) => a + Number(e.quantidade || 0), 0);
      return { item, restante: Math.max(0, Number(item.quantidade || 0) - desfeito) };
    });
  }

  abrirEstorno(): void {
    const primeira = this.estornaveis()[0];
    if (!primeira) return;
    this.motivoEstorno.set('');
    this.tentouEstorno.set(false);
    this.escolherOperacao(primeira);
    this.estornoAberto.set(true);
  }

  escolherOperacao(op: OperacaoTecnica): void {
    const material = new Map((this.det()?.itens ?? []).map(i => [i.id, i.material]));
    this.opEstorno.set(op);
    this.confirmandoEstorno.set(false);
    this.estorno.set(this.restantes(op).filter(r => r.restante > 0).map(r => ({
      id: r.item.id, descricao: r.item.descricaoMaterial, unidade: material.get(r.item.idItemSolicitacao)?.unidadeMedida || 'UN',
      serie: r.item.numeroSerie ?? null, restante: r.restante, quantidade: r.restante, marcado: true,
    })));
  }

  marcarEstorno(idx: number): void {
    this.estorno.update(l => l.map((i, k) => (k === idx ? { ...i, marcado: !i.marcado } : i)));
    this.confirmandoEstorno.set(false);
  }

  qtdEstorno(idx: number, q: number): void {
    const item = this.estorno()[idx];
    if (q > item.restante) { this.toast.warning(`No máximo ${numeroBr(item.restante)} ${item.unidade}.`); return; }
    this.estorno.update(l => l.map((i, k) => (k === idx ? { ...i, quantidade: q } : i)));
    this.confirmandoEstorno.set(false);
  }

  confirmarEstorno(): void {
    const d = this.det();
    const op = this.opEstorno();
    this.tentouEstorno.set(true);
    if (!d || !op || this.executando()) return;
    if (this.motivoEstorno().trim().length < MINIMO_MOTIVO) return;
    if (!this.confirmandoEstorno()) { this.confirmandoEstorno.set(true); return; }
    const itens = this.estorno().filter(i => i.marcado && i.quantidade > 0)
      .map(i => ({ idItemOperacaoOriginal: i.id, quantidade: i.quantidade, numeroSerie: i.serie }));
    this.executando.set(true);
    this.almox.estornarTecnica(d.id, {
      versaoEsperada: d.tecnico?.versao ?? d.versao ?? 0, idOperacaoOriginal: op.id, motivo: this.motivoEstorno().trim(), itens,
    }).subscribe({
      next: () => {
        this.executando.set(false);
        this.estornoAberto.set(false);
        this.toast.success(op.tipo === 'ENTREGA' ? 'Estorno feito. O material voltou para o almoxarifado.' : 'Estorno feito. O material voltou para a obra.');
        this.carregar();
      },
      error: (e: ApiError) => { this.executando.set(false); this.confirmandoEstorno.set(false); this.falha(e, 'Não foi possível estornar.'); },
    });
  }

  private falha(e: ApiError, padrao: string): void {
    if (e.status === 409) {
      this.toast.warning('Outra pessoa alterou esta solicitação. Os dados foram atualizados.');
      this.carregar();
    } else {
      this.toast.error(e.detail || padrao);
    }
  }
}
