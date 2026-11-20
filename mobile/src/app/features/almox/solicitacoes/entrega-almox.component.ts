import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { TokenService } from '../../../core/auth/token.service';
import { AlmoxService } from '../../../core/almox/almox.service';
import { Estoque, Solicitacao } from '../../../core/almox/almox.models';
import { idCurto, pode } from '../../../core/almox/almox-status';
import { nomeEstoque, tituloTecnica } from '../../../core/almox/almox-tecnico';
import { extrairSerie, normalizarSerie } from '../../../core/almox/series';
import { ComUnidade, Equivalencia, daBase, paraBase } from '../../../core/almox/unidade-material';
import { QuantidadeUnidadeComponent } from '../../../ui/quantidade-unidade.component';
import { ApiError } from '../../../core/http/error.interceptor';
import { RascunhoService, VinculoRascunho } from '../../../core/sessao/rascunho.service';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import { ToastService } from '../../../core/ui/toast.service';
import {
  AssinaturaComponent, BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, LeitorCodigoComponent, OpcaoSeletor,
  QuantidadeComponent, RetornoLeitura, SeletorComponent, VazioComponent, leitorPorCameraDisponivel, numeroBr,
} from '../../../ui';

interface ItemEntrega {
  id: string;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string;
  detalhaSerie: boolean;
  pedido: number;
  pendente: number;
  /** Quanto sai nesta entrega, na unidade do material (com série: 0 ou 1). */
  quantidade: number;
  serie: string;
  equivalencias: Equivalencia[];
  /** Digitado em outra unidade (ex.: 30 KG de cabo em MT); {@link quantidade} já vem convertida. */
  unidadeInformada: string | null;
  quantidadeInformada?: number;
}

interface RascunhoEntrega {
  passo: number;
  itens: { id: string; quantidade: number; serie: string; unidadeInformada?: string | null; quantidadeInformada?: number }[];
  foraEquipe: boolean;
  responsavel: string | null;
  /** Entrega técnica: reserva digitada e equipe escolhida (quando a solicitação não tem). */
  reserva?: string;
  equipe?: string | null;
}

const PASSOS = ['Materiais', 'Quem retira', 'Assinaturas', 'Conferir'];

/**
 * Registrar a entrega (total ou parcial) de uma solicitação aprovada. A assinatura é sempre
 * digital: quem entrega (almoxarifado) e quem retira assinam no aparelho. Itens com número de
 * série saem uma unidade por entrega (regra do backend); a série pode ser lida pela câmera e cai
 * sozinha no item certo.
 */
@Component({
  selector: 'app-entrega-almox',
  standalone: true,
  imports: [AssinaturaComponent, BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, LeitorCodigoComponent, QuantidadeComponent, QuantidadeUnidadeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo titulo="Registrar entrega" [subtitulo]="referencia() + ' · ' + PASSOS[passo() - 1] + ' · ' + passo() + ' de 4'" navegacao="fechar"
        rotuloFechar="Fechar a entrega" (voltar)="fechar()">
        <geo-indicador-rede />
      </geo-barra-topo>
      <div class="geo-passos" aria-hidden="true">@for (s of [1, 2, 3, 4]; track s) { <i [class.feito]="s <= passo()"></i> }</div>

      @if (carregando()) {
        <div class="geo-esqueletos" aria-busy="true"><div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 220px"></div></div>
      } @else if (erro()) {
        <geo-vazio icone="alerta" titulo="Não foi possível preparar a entrega" [texto]="erro()">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
        </geo-vazio>
      } @else if (det(); as d) {
        <section class="conteudo" [attr.aria-label]="PASSOS[passo() - 1]">
          @switch (passo()) {
            @case (1) {
              <div class="rota"><span class="origem">{{ nomeOrigem() }}</span><geo-icone nome="seta" [tamanho]="16" /><strong class="destino">{{ nomeDestino() }}</strong></div>
              @if (pedeReserva()) {
                <label class="geo-campo reserva">
                  <span class="geo-campo__rotulo">Número da reserva *</span>
                  <input class="geo-input mono" [value]="reserva()" (input)="reserva.set(soDigitos($any($event.target)))" inputmode="numeric" maxlength="20" autocomplete="off"
                    placeholder="Só números, até 20 dígitos" [attr.aria-invalid]="tentou() && !reserva().trim()">
                  @if (tentou() && !reserva().trim()) { <span class="geo-campo__erro"><geo-icone nome="alerta" [tamanho]="16" />A entrega técnica precisa do número da reserva.</span> }
                  @else { <span class="geo-campo__ajuda">A solicitação ainda não tem reserva: ela é registrada junto com a entrega.</span> }
                </label>
              }
              <div class="barra-itens">
                <span class="geo-num"><strong>{{ marcados() }}</strong> de {{ itens().length }} {{ itens().length === 1 ? 'material' : 'materiais' }} nesta entrega</span>
                <span class="botoes">
                  <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="preencherTudo()">Tudo o que falta</button>
                  <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="zerar()" [disabled]="!marcados()">Zerar</button>
                </span>
              </div>
              @if (temSerie()) {
                <button type="button" class="geo-btn geo-btn--tonal geo-btn--bloco ler" (click)="leitorAberto.set(true)">
                  <geo-icone nome="codigo_barras" />Ler as séries pela câmera
                </button>
              }
              <ul class="geo-grupo itens">
                @for (it of itens(); track it.id; let i = $index) {
                  <li class="geo-linha item" [class.zerado]="!it.quantidade">
                    <span class="geo-linha__texto">
                      <span class="geo-linha__titulo">{{ it.descricao }}</span>
                      <span class="geo-linha__apoio geo-num">Cód. {{ it.codigo }} · falta {{ num(it.pendente) }} de {{ num(it.pedido) }} {{ it.unidade }}</span>
                    </span>
                    @if (it.detalhaSerie) {
                      <button type="button" class="serie" [class.escolhida]="!!it.serie" (click)="escolherSerie(i)" [attr.aria-label]="it.serie ? 'Série ' + it.serie + ', trocar' : 'Escolher a série de ' + it.descricao">
                        <geo-icone [nome]="it.serie ? 'check' : 'codigo_barras'" [tamanho]="18" />
                        <span class="geo-num">{{ it.serie || 'Escolher série' }}</span>
                      </button>
                      <span class="nota">Sai 1 unidade por entrega · {{ (series()[it.idMaterial] ?? []).length }} na origem</span>
                    } @else {
                      @if (it.equivalencias.length) {
                        <geo-quantidade-unidade [material]="{ unidadeMedida: it.unidade, equivalencias: it.equivalencias }" [minimo]="0"
                          [valor]="it.unidadeInformada ? (it.quantidadeInformada ?? 0) : it.quantidade" (valorChange)="definirQuantidade(i, $event)"
                          [unidade]="it.unidadeInformada" (unidadeChange)="definirUnidade(i, $event)"
                          [rotulo]="'quantidade de ' + it.descricao + ' nesta entrega'" />
                      } @else {
                        <geo-quantidade [valor]="it.quantidade" (valorChange)="definirQuantidade(i, $event)" [minimo]="0" [grande]="true" [unidade]="it.unidade"
                          [rotulo]="'quantidade de ' + it.descricao + ' nesta entrega'" />
                      }
                    }
                  </li>
                }
              </ul>
            }
            @case (2) {
              <div class="campos">
                @if (escolheEquipe()) {
                  <geo-seletor rotulo="Equipe que retira o material" [obrigatorio]="true" [opcoes]="opcoesEquipe()" [valor]="equipeEscolhida()"
                    (valorChange)="escolherEquipe($event)" [invalido]="tentou() && !idEquipe()" placeholder="Escolher" />
                  <p class="ajuda">A solicitação não tem equipe definida. O material vai para o estoque da obra; a equipe fica registrada como quem retirou.</p>
                }
                <button type="button" class="alternar" role="switch" [attr.aria-checked]="foraEquipe()" (click)="alternarForaEquipe()" [disabled]="!idEquipe()">
                  <span class="txt"><strong>Retirada por alguém de fora da equipe</strong>
                    <span>{{ idEquipe() ? 'Ligue quando quem retira não é da equipe de destino.' : 'O estoque de destino não tem equipe: escolha qualquer colaborador.' }}</span></span>
                  <span class="geo-interruptor" aria-hidden="true"><i></i></span>
                </button>
                @if (carregandoPessoas()) {
                  <div class="geo-esqueleto" style="height: 64px"></div>
                } @else if (!foraEquipe() && membros().length && membros().length <= 8) {
                  <h3 class="geo-secao">Membros da equipe</h3>
                  <ul class="geo-grupo" role="radiogroup" aria-label="Quem retira">
                    @for (m of membros(); track m.valor) {
                      <li role="none"><button type="button" role="radio" class="geo-linha geo-linha--acao" [attr.aria-checked]="responsavel() === m.valor" (click)="responsavel.set(m.valor)">
                        <span class="geo-selo" [class.geo-selo--destaque]="responsavel() === m.valor"><geo-icone nome="conta" /></span>
                        <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ m.rotulo }}</span></span>
                        @if (responsavel() === m.valor) { <geo-icone nome="check" /> }
                      </button></li>
                    }
                  </ul>
                } @else {
                  <geo-seletor rotulo="Quem retira" [obrigatorio]="true" [opcoes]="foraEquipe() ? colaboradores() : membros()" [valor]="responsavel()" (valorChange)="responsavel.set($event)"
                    [invalido]="tentou() && !responsavel()" [placeholder]="(foraEquipe() ? colaboradores() : membros()).length ? 'Escolher' : 'Ninguém encontrado'" />
                  @if (!foraEquipe() && !membros().length) { <p class="ajuda">A equipe de destino não tem membros ativos. Ligue a retirada por alguém de fora.</p> }
                }
              </div>
            }
            @case (3) {
              <p class="intro">As duas assinaturas são obrigatórias e ficam guardadas com a entrega.</p>
              <div class="assinaturas">
                <geo-assinatura rotulo="Almoxarifado — quem entrega" [quem]="meuNome()" [valor]="assinaturaAlmox()" (valorChange)="assinaturaAlmox.set($event)" [invalida]="tentou()" />
                <geo-assinatura rotulo="Quem retira" [quem]="nomeResponsavel()" [valor]="assinaturaEquipe()" (valorChange)="assinaturaEquipe.set($event)" [invalida]="tentou()" />
              </div>
            }
            @case (4) {
              <div class="rota"><span class="origem">{{ nomeOrigem() }}</span><geo-icone nome="seta" [tamanho]="16" /><strong class="destino">{{ nomeDestino() }}</strong></div>
              <dl class="geo-dados">
                @if (tecnica() && ocorrencia()) { <div><dt>Ocorrência</dt><dd class="geo-num">{{ ocorrencia() }}</dd></div> }
                @if (pedeReserva()) { <div><dt>Reserva</dt><dd class="geo-num">{{ reserva().trim() }}</dd></div> }
                <div><dt>Quem retira</dt><dd>{{ nomeResponsavel() }}{{ foraEquipe() ? ' · de fora da equipe' : '' }}</dd></div>
                <div><dt>Resultado</dt><dd>{{ completa() ? 'Entrega total: a solicitação será concluída' : 'Entrega parcial: o saldo continua aguardando retirada' }}</dd></div>
              </dl>
              <h3 class="geo-secao"><span>Nesta entrega</span><span class="geo-num">{{ marcados() }}</span></h3>
              <ul class="geo-grupo">
                @for (it of itensMarcados(); track it.id) {
                  <li class="geo-linha"><span class="geo-linha__texto"><span class="geo-linha__titulo">{{ it.descricao }}</span>
                    <span class="geo-linha__apoio geo-num">{{ it.serie ? 'Série ' + it.serie : 'Cód. ' + it.codigo }}{{ it.quantidade < it.pendente ? ' · fica faltando ' + num(it.pendente - it.quantidade) : '' }}</span></span>
                    <span class="geo-qtd">{{ num(it.quantidade) }}<small>{{ it.unidade }}</small>@if (it.unidadeInformada) {<small class="informado">{{ num(it.quantidadeInformada ?? 0) }} {{ it.unidadeInformada }} informados</small>}</span></li>
                }
              </ul>
              <div class="assinadas">
                @if (assinaturaAlmox(); as a) { <figure><img [src]="a" alt="Assinatura do almoxarifado"><figcaption>Almoxarifado</figcaption></figure> }
                @if (assinaturaEquipe(); as b) { <figure><img [src]="b" alt="Assinatura de quem retira"><figcaption>{{ nomeResponsavel() }}</figcaption></figure> }
              </div>
            }
          }
        </section>
      }
    </div>

    @if (det()) {
      <footer class="rodape" data-acao-fixa>
        @if (passo() > 1) { <button type="button" class="geo-btn geo-btn--neutro" (click)="passo.set(passo() - 1)" [disabled]="enviando()">Voltar</button> }
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="avancar()" [disabled]="enviando() || (passo() === 4 && !rede.isOnline())">
          @if (passo() === 4) { {{ enviando() ? 'Registrando…' : rede.isOnline() ? 'Confirmar entrega' : 'Sem internet' }} }
          @else { Continuar <geo-icone nome="seta" [tamanho]="18" /> }
        </button>
      </footer>
    }

    <!-- Série de um item -->
    <geo-folha [aberta]="serieDe() !== null" (fechar)="serieDe.set(null)" [titulo]="itemSerie()?.descricao ?? ''" descricao="Séries novas no estoque de origem. Sai uma por entrega.">
      @if (itemSerie(); as it) {
        <div class="busca"><geo-icone nome="busca" [tamanho]="18" />
          <input type="search" placeholder="Buscar ou digitar a série" enterkeyhint="search" aria-label="Buscar série" [value]="buscaSerie()" (input)="buscaSerie.set($any($event.target).value)"></div>
        <ul class="geo-grupo lista" role="radiogroup" [attr.aria-label]="'Séries de ' + it.descricao">
          @if (it.serie) {
            <li role="none"><button type="button" class="geo-linha geo-linha--acao" (click)="definirSerie(serieDe()!, '')"><span class="geo-selo"><geo-icone nome="fechar" /></span>
              <span class="geo-linha__texto"><span class="geo-linha__titulo">Não entregar agora</span></span></button></li>
          }
          @for (s of seriesFiltradas(); track s) {
            <li role="none"><button type="button" role="radio" class="geo-linha geo-linha--acao" [attr.aria-checked]="it.serie === s" (click)="definirSerie(serieDe()!, s)">
              <span class="geo-linha__texto"><span class="geo-linha__titulo mono">{{ s }}</span></span>
              @if (it.serie === s) { <geo-icone nome="check" /> }
            </button></li>
          } @empty {
            <li role="none"><div class="geo-linha"><span class="geo-linha__apoio">{{ buscaSerie() ? 'Nenhuma série com esse trecho na origem' : 'Nenhuma série nova disponível na origem' }}</span></div></li>
          }
        </ul>
      }
    </geo-folha>

    <!-- Leitura das séries -->
    <geo-folha [aberta]="leitorAberto()" (fechar)="leitorAberto.set(false)" titulo="Ler séries" [descricao]="descricaoLeitor()">
      <div class="leitor">
        @if (temCamera) {
          <geo-leitor-codigo [ativo]="leitorAberto()" [pausado]="!faltamSeries()" motivoPausa="Todos os itens com série têm série" [retorno]="retorno()" (lido)="lerSerie($event)" />
        } @else {
          <p class="ajuda">Este navegador não lê pela câmera. Use um leitor de código conectado: ele digita aqui e confirma sozinho.</p>
        }
        <form class="digitar" (submit)="$event.preventDefault(); lerSerie(digitada()); digitada.set('')">
          <input class="geo-input mono" [value]="digitada()" (input)="digitada.set($any($event.target).value)" placeholder="Ou digite a série" aria-label="Série"
            autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="send">
          <button type="submit" class="geo-btn geo-btn--principal" [disabled]="!digitada().trim()" aria-label="Usar esta série"><geo-icone nome="mais" /></button>
        </form>
        <ul class="geo-grupo lidas">
          @for (it of itensComSerie(); track it.id) {
            <li class="geo-linha"><span class="geo-selo" [class.geo-selo--ok]="!!it.serie"><geo-icone [nome]="it.serie ? 'check' : 'codigo_barras'" /></span>
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ it.descricao }}</span><span class="geo-linha__apoio mono">{{ it.serie || 'Aguardando leitura' }}</span></span></li>
          }
        </ul>
      </div>
      <div rodape class="geo-folha-rodape"><button type="button" class="geo-btn geo-btn--principal" (click)="leitorAberto.set(false)">Pronto</button></div>
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .conteudo { animation: entrar var(--geo-m-entrar) var(--geo-curva); }
    @keyframes entrar { from { opacity: 0; transform: translateY(6px); } }
    .rota { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: var(--geo-e2) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-superficie); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .rota geo-icone { color: var(--geo-texto-3); }
    .rota .destino { font: 600 .9375rem/1.3 var(--geo-fonte); color: var(--geo-texto); }
    .reserva { margin: var(--geo-e3) var(--geo-margem) 0; }
    .reserva .geo-campo__rotulo, .reserva .geo-campo__erro, .reserva .geo-campo__ajuda { padding-left: var(--geo-e4); }
    .barra-itens { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e2); flex-wrap: wrap; padding: var(--geo-e3) var(--geo-e3) var(--geo-e2) var(--geo-e5);
      font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .barra-itens strong { color: var(--geo-texto); }
    .botoes { display: flex; }
    .ler { margin: 0 var(--geo-margem) var(--geo-e2); width: calc(100% - 24px); }
    .item { flex-wrap: wrap; row-gap: var(--geo-e2); }
    .item .geo-linha__texto { flex: 1 1 55%; }
    .item.zerado .geo-linha__titulo { color: var(--geo-texto-2); }
    .serie { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: var(--geo-r-pilula); border: 1.5px dashed var(--geo-linha-forte);
      background: transparent; color: var(--geo-destaque); font: 600 .875rem/1 var(--geo-fonte); cursor: pointer; }
    .serie.escolhida { border-style: solid; border-color: var(--geo-ok); color: var(--geo-texto); font-family: var(--geo-fonte-mono); }
    .serie.escolhida geo-icone { color: var(--geo-ok); }
    .nota { flex-basis: 100%; font: var(--geo-t-apoio); font-size: .75rem; color: var(--geo-texto-2); }
    .informado { display: block; font: var(--geo-t-apoio); font-size: .75rem; color: var(--geo-texto-2); text-align: right; }
    .campos { display: grid; gap: var(--geo-e3); padding: var(--geo-e2) var(--geo-e3); }
    .alternar { display: flex; align-items: center; gap: var(--geo-e3); width: 100%; padding: var(--geo-e3) var(--geo-e4); min-height: 72px; border: 0; border-radius: var(--geo-r-grupo);
      background: var(--geo-superficie); color: var(--geo-texto); text-align: left; font: inherit; cursor: pointer; }
    .alternar:disabled { opacity: .75; cursor: default; }
    .alternar .txt { flex: 1; display: grid; gap: 2px; }
    .alternar .txt span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .campos .geo-secao { padding-left: var(--geo-e2); }
    .campos .geo-grupo { margin: 0; }
    .ajuda { margin: 0 var(--geo-e2); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .intro { margin: var(--geo-e2) var(--geo-e5) var(--geo-e3); font: var(--geo-t-apoio); font-size: .875rem; color: var(--geo-texto-2); }
    .assinaturas { display: grid; gap: var(--geo-e3); padding: 0 var(--geo-e3); }
    .assinadas { display: grid; grid-template-columns: 1fr 1fr; gap: var(--geo-e2); margin: var(--geo-e3) var(--geo-margem) 0; }
    figure { margin: 0; padding: var(--geo-e2); border-radius: var(--geo-r-grupo); background: var(--geo-superficie); display: grid; gap: 4px; }
    figure img { width: 100%; height: 64px; object-fit: contain; background: #fff; border-radius: 8px; }
    figcaption { font: var(--geo-t-apoio); font-size: .75rem; color: var(--geo-texto-2); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .geo-btn { min-height: var(--geo-alvo-principal); }
    .rodape .principal { flex: 1; font-size: 1rem; }
    .busca { margin: 0 var(--geo-margem) var(--geo-e3); display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 48px;
      border-radius: var(--geo-r-pilula); background: var(--geo-superficie-2); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .lista { background: var(--geo-fundo); }
    .mono { font-family: var(--geo-fonte-mono); }
    .leitor { display: grid; gap: var(--geo-e3); padding: 0 var(--geo-e4); }
    .digitar { display: flex; gap: var(--geo-e2); }
    .digitar .geo-input { flex: 1; min-width: 0; }
    .digitar .geo-btn { width: 54px; padding: 0; }
    .lidas { margin: 0; background: var(--geo-fundo); }
  `],
})
export class EntregaAlmoxComponent {
  protected readonly PASSOS = PASSOS;
  private readonly almox = inject(AlmoxService);
  private readonly auth = inject(AuthService);
  private readonly tokens = inject(TokenService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rascunhos = inject(RascunhoService);
  private readonly injector = inject(Injector);
  readonly rede = inject(ConnectivityService);
  readonly id = signal(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');

  readonly temCamera = leitorPorCameraDisponivel();
  readonly passo = signal(1);
  readonly det = signal<Solicitacao | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly itens = signal<ItemEntrega[]>([]);
  readonly series = signal<Partial<Record<string, string[]>>>({});
  readonly foraEquipe = signal(false);
  readonly responsavel = signal<string | null>(null);
  readonly membros = signal<OpcaoSeletor[]>([]);
  readonly colaboradores = signal<OpcaoSeletor[]>([]);
  readonly carregandoPessoas = signal(false);
  readonly assinaturaAlmox = signal<string | null>(null);
  readonly assinaturaEquipe = signal<string | null>(null);
  readonly tentou = signal(false);
  readonly enviando = signal(false);
  readonly serieDe = signal<number | null>(null);
  readonly buscaSerie = signal('');
  readonly leitorAberto = signal(false);
  readonly retorno = signal<RetornoLeitura | null>(null);
  readonly digitada = signal('');
  private rascunho: VinculoRascunho | null = null;

  /** A mesma tela atende a entrega técnica (221/921): muda a origem, a equipe e o comando enviado. */
  readonly base = this.router.url.startsWith('/almox/tecnicas') ? '/almox/tecnicas' : '/almox/solicitacoes';
  readonly estoques = signal<Estoque[]>([]);
  readonly reserva = signal('');
  readonly idCurto = computed(() => idCurto(this.id()));
  readonly tecnica = computed(() => this.det()?.contexto === 'TECNICO');
  readonly ocorrencia = computed(() => this.det()?.tecnico?.ocorrencia?.codigo ?? null);
  readonly referencia = computed(() => (this.tecnica() && this.ocorrencia() ? this.ocorrencia()! : '#' + this.idCurto()));
  readonly pedeReserva = computed(() => this.tecnica() && !this.det()?.tecnico?.reserva?.numero);
  readonly idOrigem = computed(() => (this.tecnica() ? this.det()?.tecnico?.idAlmoxarifadoAtendimento ?? null : this.det()?.estoqueOrigem?.id ?? null));
  readonly nomeOrigem = computed(() => (this.tecnica() ? nomeEstoque(this.estoques(), this.idOrigem()) ?? 'Almoxarifado' : this.det()?.estoqueOrigem?.nomeIdentificador ?? ''));
  readonly nomeDestino = computed(() => (this.tecnica() && this.det() ? tituloTecnica(this.det()!).obra : this.det()?.estoqueDestino?.nomeIdentificador ?? ''));
  readonly equipeEscolhida = signal<string | null>(null);
  /** Técnica sem equipe definida: quem entrega escolhe para qual equipe o material vai. */
  readonly escolheEquipe = computed(() => this.tecnica() && !this.det()?.tecnico?.idEquipe && !this.det()?.idEquipe);
  readonly opcoesEquipe = computed<OpcaoSeletor[]>(() => this.estoques().filter(e => !!e.idEquipe && e.ativo !== false)
    .map(e => ({ valor: e.idEquipe!, rotulo: e.nomeIdentificador })));
  readonly idEquipe = computed(() => (this.tecnica() ? this.det()?.tecnico?.idEquipe || this.equipeEscolhida() : null)
    || this.det()?.idEquipe || (this.tecnica() ? null : this.det()?.estoqueDestino?.idEquipe) || null);
  readonly marcados = computed(() => this.itens().filter(i => i.quantidade > 0).length);
  readonly itensMarcados = computed(() => this.itens().filter(i => i.quantidade > 0));
  readonly temSerie = computed(() => this.itens().some(i => i.detalhaSerie));
  readonly itensComSerie = computed(() => this.itens().filter(i => i.detalhaSerie));
  readonly faltamSeries = computed(() => this.itensComSerie().some(i => !i.serie));
  readonly itemSerie = computed(() => (this.serieDe() !== null ? this.itens()[this.serieDe()!] : null));
  readonly completa = computed(() => this.itens().every(i => i.quantidade >= i.pendente));
  readonly meuNome = computed(() => this.almox.nome(this.tokens.usuarioId(), this.tokens.nomeUsuario() ?? 'Você'));
  readonly nomeResponsavel = computed(() => {
    const id = this.responsavel();
    return [...this.membros(), ...this.colaboradores()].find(o => o.valor === id)?.rotulo ?? (id ? this.almox.nome(id) : 'Não escolhido');
  });
  readonly descricaoLeitor = computed(() => {
    const n = this.itensComSerie().filter(i => i.serie).length;
    return `${n} de ${this.itensComSerie().length} itens com série. Cada série lida vai para o item do mesmo material.`;
  });
  /** Séries da origem para o item, sem as já usadas em outra linha. */
  readonly seriesFiltradas = computed(() => {
    const it = this.itemSerie();
    if (!it) return [];
    const usadas = new Set(this.itens().filter(x => x.id !== it.id && x.serie).map(x => x.serie));
    const q = normalizarSerie(this.buscaSerie());
    return (this.series()[it.idMaterial] ?? []).filter(s => !usadas.has(s) && (!q || s.includes(q)));
  });

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
        if (!pode(d, 'ENTREGAR')) {
          const motivo = d.contexto === 'TECNICO' ? 'falta separar ou não há saldo a entregar' : d.status === 'PENDENTE' ? 'falta aprovar' : 'sem saldo a entregar';
          this.toast.info(`A solicitação #${this.idCurto()} não aceita entrega agora (${motivo}).`);
          void this.router.navigate([this.base, d.id], { replaceUrl: true });
          return;
        }
        this.det.set(d);
        this.itens.set(d.itens.map(i => {
          const entregue = Number(i.quantidadeEntregaLiquida ?? i.quantidadeEntregue ?? 0);
          const pendente = Number(i.quantidadePendente ?? Math.max(0, i.quantidade - entregue));
          return {
            id: i.id, idMaterial: i.material.id, codigo: i.material.codigo, descricao: i.material.descricao, unidade: i.material.unidadeMedida || 'UN',
            detalhaSerie: !!i.material.detalhaSerie, pedido: Number(i.quantidade), pendente,
            quantidade: i.material.detalhaSerie ? 0 : pendente, serie: '',
            equivalencias: i.material.detalhaSerie ? [] : (i.material.equivalencias ?? []), unidadeInformada: null,
          };
        }).filter(i => i.pendente > 0));
        this.carregarSeries(d);
        this.prepararPessoas(d);
        this.carregando.set(false);
        void this.vincularRascunho();
      },
      error: (e: ApiError) => { this.carregando.set(false); this.erro.set(e.status === 0 ? 'Sem conexão com o servidor.' : e.detail || 'Tente de novo.'); },
    });
  }

  private async vincularRascunho(): Promise<void> {
    if (this.rascunho) return;
    this.rascunho = this.rascunhos.vincular<RascunhoEntrega>({
      chave: `almox:entrega:${this.id()}`,
      injector: this.injector,
      // Assinaturas não entram no rascunho: são colhidas de novo se o app fechar.
      ler: () => ({
        passo: Math.min(this.passo(), 2), itens: this.itens().map(i => ({ id: i.id, quantidade: i.quantidade, serie: i.serie, unidadeInformada: i.unidadeInformada, quantidadeInformada: i.quantidadeInformada })), foraEquipe: this.foraEquipe(),
        responsavel: this.responsavel(), reserva: this.reserva(), equipe: this.equipeEscolhida(),
      }),
      aplicar: r => {
        this.reserva.set(r.reserva ?? '');
        if (r.equipe && this.escolheEquipe()) this.escolherEquipe(r.equipe);
        const porId = new Map(r.itens.map(i => [i.id, i]));
        this.itens.update(l => l.map(i => {
          const s = porId.get(i.id);
          if (!s) return i;
          if (i.detalhaSerie) return { ...i, serie: s.serie, quantidade: s.serie ? 1 : 0 };
          const quantidade = Math.min(i.pendente, Math.max(0, s.quantidade));
          const manteve = !!s.unidadeInformada && i.equivalencias.some(e => e.unidade === s.unidadeInformada) && quantidade === s.quantidade;
          return manteve
            ? { ...i, quantidade, unidadeInformada: s.unidadeInformada!, quantidadeInformada: s.quantidadeInformada ?? daBase(this.materialDe(i), quantidade, s.unidadeInformada) }
            : { ...i, quantidade, unidadeInformada: null, quantidadeInformada: undefined };
        }));
        if (r.foraEquipe !== this.foraEquipe()) this.alternarForaEquipe();
        this.responsavel.set(r.responsavel);
        this.passo.set(Math.min(Math.max(1, r.passo || 1), 2));
      },
      titulo: () => `Entrega da solicitação ${this.referencia()}`,
      rota: () => `${this.base}/${this.id()}/entrega`,
      vazio: r => r.passo === 1 && !r.responsavel,
    });
    await this.rascunho.restaurado;
  }

  private carregarSeries(_d: Solicitacao): void {
    const materiais = [...new Set(this.itens().filter(i => i.detalhaSerie).map(i => i.idMaterial))];
    const origem = this.idOrigem();
    if (!materiais.length || !origem) return;
    forkJoin(materiais.map(m => this.almox.listarSeries(origem, m, 'NOVO').pipe(
      map(r => [m, r.map(s => s.numSerie)] as const), catchError(() => of([m, [] as string[]] as const)),
    ))).subscribe(pares => this.series.set(Object.fromEntries(pares)));
  }

  private prepararPessoas(d: Solicitacao): void {
    this.responsavel.set(d.idColaboradorSaque ?? d.tecnico?.idColaboradorSaque ?? null);
    const fora = !!d.saqueForaEquipe || !!d.tecnico?.saqueForaEquipe || !this.idEquipe();
    this.foraEquipe.set(fora);
    if (fora) this.carregarColaboradores();
    else this.carregarMembros();
  }

  private carregarMembros(): void {
    const equipe = this.idEquipe();
    if (!equipe) return;
    this.carregandoPessoas.set(true);
    this.almox.membrosEquipe(equipe).subscribe({
      next: m => {
        const opcoes = m.map(x => ({ valor: x.idColaborador, rotulo: x.nomeColaborador }));
        this.membros.set(opcoes);
        if (!this.responsavel() && opcoes.length === 1) this.responsavel.set(opcoes[0].valor);
        this.carregandoPessoas.set(false);
      },
      error: () => { this.membros.set([]); this.carregandoPessoas.set(false); },
    });
  }

  private carregarColaboradores(): void {
    if (this.colaboradores().length) return;
    this.carregandoPessoas.set(true);
    this.almox.colaboradores().subscribe({
      next: c => { this.colaboradores.set(c.map(x => ({ valor: x.id, rotulo: x.nomeCompleto }))); this.carregandoPessoas.set(false); },
      error: () => { this.colaboradores.set([]); this.carregandoPessoas.set(false); },
    });
  }

  /** Reserva é só número (1 a 20 dígitos, regra do backend): o campo descarta o resto. */
  soDigitos(campo: HTMLInputElement): string {
    const limpo = campo.value.replace(/\D/g, '').slice(0, 20);
    if (campo.value !== limpo) campo.value = limpo;
    return limpo;
  }

  escolherEquipe(id: string | null): void {
    this.equipeEscolhida.set(id);
    this.responsavel.set(null);
    this.membros.set([]);
    if (id) { this.foraEquipe.set(false); this.carregarMembros(); }
  }

  alternarForaEquipe(): void {
    if (!this.idEquipe()) return;
    const fora = !this.foraEquipe();
    this.foraEquipe.set(fora);
    this.responsavel.set(null);
    if (fora) this.carregarColaboradores();
    else if (!this.membros().length) this.carregarMembros();
  }

  num(n: number): string {
    return numeroBr(n);
  }

  /** Com outra unidade escolhida, {@code q} vem nela; o que sai do saldo é o convertido. */
  definirQuantidade(i: number, q: number): void {
    const it = this.itens()[i];
    const base = it.unidadeInformada ? paraBase(this.materialDe(it), q, it.unidadeInformada) : q;
    if (base > it.pendente) {
      const naUnidade = it.unidadeInformada ? ` (${numeroBr(daBase(this.materialDe(it), it.pendente, it.unidadeInformada))} ${it.unidadeInformada})` : '';
      this.toast.warning(`No máximo ${numeroBr(it.pendente)} ${it.unidade}${naUnidade}: é o que falta entregar.`);
      return;
    }
    this.itens.update(l => l.map((x, k) => (k !== i ? x : x.unidadeInformada
      ? { ...x, quantidade: Math.max(0, base), quantidadeInformada: Math.max(0, q) }
      : { ...x, quantidade: Math.max(0, q), quantidadeInformada: undefined })));
  }

  /** Troca a unidade mantendo a mesma quantidade física (ex.: 126 MT viram 30 KG). */
  definirUnidade(i: number, unidade: string | null): void {
    this.itens.update(l => l.map((x, k) => (k !== i ? x : unidade
      ? { ...x, unidadeInformada: unidade, quantidadeInformada: daBase(this.materialDe(x), x.quantidade, unidade) }
      : { ...x, unidadeInformada: null, quantidadeInformada: undefined })));
  }

  private materialDe(it: ItemEntrega): ComUnidade {
    return { unidadeMedida: it.unidade, equivalencias: it.equivalencias };
  }

  /** O que foi digitado em outra unidade vai como foi digitado; o servidor converte e guarda os dois. */
  private informado(i: ItemEntrega): { quantidade: number; unidade?: string } {
    return i.unidadeInformada && i.quantidadeInformada ? { quantidade: i.quantidadeInformada, unidade: i.unidadeInformada } : { quantidade: i.quantidade };
  }

  escolherSerie(i: number): void {
    this.buscaSerie.set('');
    this.serieDe.set(i);
  }

  definirSerie(i: number, s: string): void {
    this.itens.update(l => l.map((x, k) => (k === i ? { ...x, serie: s, quantidade: s ? 1 : 0 } : x)));
    this.serieDe.set(null);
  }

  /** Série lida/digitada: vai para o primeiro item sem série do mesmo material que a tem na origem. */
  lerSerie(bruta: string): void {
    const s = extrairSerie(bruta);
    if (!s) return;
    if (this.itens().some(i => i.serie === s)) { this.retorno.set({ texto: `${s} já está na entrega`, tom: 'atencao' }); return; }
    const idx = this.itens().findIndex(i => i.detalhaSerie && !i.serie && (this.series()[i.idMaterial] ?? []).includes(s));
    if (idx < 0) {
      const existe = this.itens().some(i => i.detalhaSerie && (this.series()[i.idMaterial] ?? []).includes(s));
      this.retorno.set({ texto: existe ? `${s}: o item desse material já tem série` : `${s} não está na origem para estes materiais`, tom: 'erro' });
      return;
    }
    this.itens.update(l => l.map((x, k) => (k === idx ? { ...x, serie: s, quantidade: 1 } : x)));
    this.retorno.set({ texto: `${s} → ${this.itens()[idx].descricao}`, tom: 'ok' });
  }

  preencherTudo(): void {
    const usadas = new Set<string>();
    this.itens.update(l => l.map(it => {
      if (!it.detalhaSerie) return { ...it, quantidade: it.pendente, ...(it.unidadeInformada ? { quantidadeInformada: daBase(this.materialDe(it), it.pendente, it.unidadeInformada) } : {}) };
      const s = it.serie || (this.series()[it.idMaterial] ?? []).find(n => !usadas.has(n)) || '';
      if (s) usadas.add(s);
      return { ...it, serie: s, quantidade: s ? 1 : 0 };
    }));
  }

  zerar(): void {
    this.itens.update(l => l.map(i => ({ ...i, quantidade: 0, serie: '', ...(i.unidadeInformada ? { quantidadeInformada: 0 } : {}) })));
  }

  avancar(): void {
    this.tentou.set(true);
    const p = this.passo();
    if (p === 1 && !this.marcados()) { this.toast.warning('Informe ao menos um material para entregar.'); return; }
    if (p === 1 && this.pedeReserva() && !this.reserva().trim()) { this.toast.warning('Informe o número da reserva.'); return; }
    if (p === 2 && this.tecnica() && !this.idEquipe()) { this.toast.warning('Escolha a equipe que recebe o material.'); return; }
    if (p === 2 && !this.responsavel()) { this.toast.warning('Escolha quem retira o material.'); return; }
    if (p === 3 && !(this.assinaturaAlmox() && this.assinaturaEquipe())) { this.toast.warning('Colha as duas assinaturas para continuar.'); return; }
    if (p === 4 && this.pedeReserva() && !this.reserva().trim()) { this.toast.warning('Informe o número da reserva.'); this.passo.set(1); return; }
    if (p === 4) { this.confirmar(); return; }
    this.tentou.set(false);
    this.passo.set(p + 1);
  }

  private confirmar(): void {
    const d = this.det();
    if (!d || this.enviando()) return;
    const itens = this.itensMarcados();
    this.enviando.set(true);
    const chamada = this.tecnica()
      ? this.almox.entregarTecnica(d.id, {
        versaoEsperada: d.tecnico?.versao ?? d.versao ?? 0,
        idEquipe: this.idEquipe()!,
        idColaboradorSaque: this.responsavel()!,
        saqueForaEquipe: this.foraEquipe(),
        assinaturaAlmox: this.assinaturaAlmox()!,
        assinaturaEquipe: this.assinaturaEquipe()!,
        itens: itens.map(i => ({ idItemSolicitacao: i.id, ...this.informado(i), numeroSerie: i.serie || null })),
        numeroReserva: this.pedeReserva() ? this.reserva().trim() : null,
      })
      : this.almox.entregar(d.id, {
        assinaturaAlmox: this.assinaturaAlmox()!,
        assinaturaEquipe: this.assinaturaEquipe()!,
        idColaboradorSaque: this.responsavel()!,
        saqueForaEquipe: this.foraEquipe(),
        itens: itens.map(i => ({ idItemSolicitacao: i.id, ...this.informado(i), novaQuantidadeSolicitada: i.pedido, numSerie: i.serie || undefined })),
      });
    chamada.subscribe({
      next: async () => {
        this.enviando.set(false);
        await this.rascunho?.concluir();
        this.toast.success(this.completa() ? 'Entrega registrada. A solicitação foi concluída.' : 'Entrega parcial registrada. O saldo continua aguardando retirada.');
        void this.router.navigate([this.base, d.id], { replaceUrl: true });
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        this.toast.error(e.status === 409 ? 'Outra pessoa alterou esta solicitação. Revise e confirme de novo.' : e.detail || 'Não foi possível registrar a entrega.');
        if (e.status === 409) this.carregar();
      },
    });
  }

  fechar(): void {
    void this.rascunho?.gravarEstadoAtual();
    void this.router.navigate([this.base, this.id()], { replaceUrl: true });
  }

  protected readonly podeGerir = this.auth.podeGerirSolicitacoesAlmox;
}
