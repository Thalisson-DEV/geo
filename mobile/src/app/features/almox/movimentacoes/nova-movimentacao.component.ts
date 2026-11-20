import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, catchError, combineLatest, debounceTime, distinctUntilChanged, finalize, firstValueFrom, of, switchMap, tap } from 'rxjs';
import { AlmoxService } from '../../../core/almox/almox.service';
import { Condicao, DevolucaoComercialRequest, Estoque, ItemMovimentacaoRequest, Material, MovimentacaoRequest, ObraResumo, Saldo, SaldoSerie } from '../../../core/almox/almox.models';
import { CONDICOES, rotuloCondicao } from '../../../core/almox/almox-status';
import { ehAlmoxarifado } from '../../../core/almox/almox-tecnico';
import { contarSeries, extrairSerie } from '../../../core/almox/series';
import { ComUnidade, Equivalencia, daBase, paraBase } from '../../../core/almox/unidade-material';
import { QuantidadeUnidadeComponent } from '../../../ui/quantidade-unidade.component';
import { ApiError } from '../../../core/http/error.interceptor';
import { RascunhoService, VinculoRascunho } from '../../../core/sessao/rascunho.service';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import { ToastService } from '../../../core/ui/toast.service';
import {
  AssinaturaComponent, BarraTopoComponent, CapturaSeriesComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, LeitorCodigoComponent,
  NomeIcone, OpcaoSegmento, OpcaoSeletor, QuantidadeComponent, RetornoLeitura, SegmentadoComponent, SeletorComponent, VazioComponent, VerificadorSeries,
  leitorPorCameraDisponivel, numeroBr,
} from '../../../ui';

type Tipo = 'entrada' | 'saida' | 'transferencia' | 'devolucao';
type Processo = 'comercial' | 'tecnico';
type Fonte = 'saldo' | 'catalogo';

/** Material com série sai de uma em uma: equivalência não se aplica. */
const equivalenciasDe = (m: Material): Equivalencia[] => (m.detalhaSerie ? [] : (m.equivalencias ?? []));

interface ItemMov {
  chave: string;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string;
  detalhaSerie: boolean;
  condicao: Condicao;
  quantidade: number;
  series: string[];
  /** Saldo na origem (saída, transferência e devolução); null na entrada e no material fora do saldo. */
  saldo: number | null;
  /** Devolução: fica guardado no almoxarifado (padrão) ou sai em baixa na hora. */
  guardar?: boolean;
  /** Devolução técnica: 922 (concreto) em vez de 222 (comum). */
  concreto?: boolean;
  equivalencias?: Equivalencia[];
  /** Digitado em outra unidade (ex.: 30 KG de cabo em MT); {@link quantidade} já vem convertida. */
  unidadeInformada?: string | null;
  quantidadeInformada?: number;
}

interface RascunhoMov {
  passo: number; origem: string | null; destino: string | null; itens: ItemMov[];
  processo?: Processo; obra?: string | null; ocorrencia?: string;
}

interface DefTipo { titulo: string; verbo: string; icone: NomeIcone; passos: string[]; botao: string; sucesso: string; intro: string }

const TIPOS: Record<Tipo, DefTipo> = {
  entrada: { titulo: 'Entrada de material', verbo: 'entrada', icone: 'entrada', passos: ['Estoque', 'Materiais', 'Conferir'], botao: 'Confirmar entrada', sucesso: 'Entrada registrada. O saldo do estoque já foi atualizado.', intro: 'Escolha o estoque que recebe o material. Depois você busca os materiais no catálogo.' },
  saida: { titulo: 'Saída de material', verbo: 'saída', icone: 'saida', passos: ['Estoque', 'Materiais', 'Conferir'], botao: 'Confirmar baixa', sucesso: 'Saída registrada. O saldo foi debitado.', intro: 'Escolha o estoque de onde o material sai. Só aparece o que tem saldo nele.' },
  transferencia: { titulo: 'Transferência', verbo: 'transferência', icone: 'transferencia', passos: ['Estoques', 'Materiais', 'Conferir', 'Assinaturas'], botao: 'Confirmar transferência', sucesso: 'Transferência registrada. O material já está no destino.', intro: 'Escolha de onde sai e para onde vai. Quem entrega e quem recebe assinam no fim.' },
  devolucao: { titulo: 'Devolução de material', verbo: 'devolução', icone: 'desfazer', passos: ['Quem devolve', 'Materiais', 'Conferir'], botao: 'Confirmar devolução', sucesso: 'Devolução registrada. O almoxarifado já recebeu o material.', intro: 'A equipe devolve e o almoxarifado recebe na hora. Na devolução técnica (222/922), informe também a obra.' },
};

const PROCESSOS: OpcaoSegmento<Processo>[] = [
  { valor: 'comercial', rotulo: 'Comercial' },
  { valor: 'tecnico', rotulo: 'Técnica · 222/922' },
];
const FONTES: OpcaoSegmento<Fonte>[] = [
  { valor: 'saldo', rotulo: 'Com a equipe' },
  { valor: 'catalogo', rotulo: 'Catálogo' },
];

const chaveDe = (idMaterial: string, condicao: string) => `${idMaterial}|${condicao}`;

/**
 * Entrada, saída (baixa) e transferência entre estoques, no mesmo padrão do web e no jeito
 * do celular: um passo por tela, busca no saldo ou no catálogo, números de série em massa
 * (câmera, leitor, colar, sequência) e — na saída e na transferência — leitura direta: a série
 * lida encontra sozinha o material no estoque de origem. Transferência exige as duas assinaturas.
 */
@Component({
  selector: 'app-nova-movimentacao',
  standalone: true,
  imports: [
    AssinaturaComponent, BarraTopoComponent, CapturaSeriesComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, LeitorCodigoComponent, QuantidadeComponent, QuantidadeUnidadeComponent,
    SegmentadoComponent, SeletorComponent, VazioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo [titulo]="def.titulo" [subtitulo]="def.passos[passo() - 1] + ' · ' + passo() + ' de ' + def.passos.length" navegacao="fechar" (voltar)="fechar()">
        <geo-indicador-rede />
      </geo-barra-topo>
      <div class="geo-passos" [style.grid-template-columns]="'repeat(' + def.passos.length + ', 1fr)'" aria-hidden="true">
        @for (p of def.passos; track $index) { <i [class.feito]="$index < passo()"></i> }
      </div>

      <section class="conteudo" [attr.aria-label]="def.passos[passo() - 1]">
        @switch (passo()) {
          @case (1) {
            <p class="intro">{{ def.intro }}</p>
            @if (tipo === 'devolucao') {
              <div class="campos">
                <geo-segmentado rotulo="Processo da devolução" [opcoes]="processos" [valor]="processo()" (valorChange)="trocarProcesso($event)" />
                <geo-seletor rotulo="Equipe que devolve" [obrigatorio]="true" [opcoes]="opcoesEquipe()" [valor]="origem()" (valorChange)="trocarOrigem($event)"
                  [invalido]="tentou() && !origem()" [placeholder]="estoques().length ? 'Escolher' : 'Carregando…'" />
                <geo-seletor rotulo="Almoxarifado que recebe" [obrigatorio]="true" [opcoes]="opcoesAlmoxarifado()" [valor]="destino()" (valorChange)="destino.set($event)"
                  [invalido]="tentou() && !destino()" [placeholder]="estoques().length ? 'Escolher' : 'Carregando…'" />
                @if (processo() === 'tecnico') {
                  <geo-seletor rotulo="Obra" [obrigatorio]="true" [opcoes]="opcoesObra()" [valor]="obra()" (valorChange)="trocarObra($event)"
                    [invalido]="tentou() && !obra()" [placeholder]="obras().length ? 'Escolher' : 'Carregando…'" />
                  @if (exigeOcorrencia()) {
                    <label class="geo-campo">
                      <span class="geo-campo__rotulo">Número da {{ rotuloExecucao() }} *</span>
                      <input class="geo-input mono" [value]="ocorrencia()" (input)="ocorrencia.set($any($event.target).value)" autocapitalize="characters" autocomplete="off"
                        spellcheck="false" [placeholder]="'Ex.: ' + rotuloExecucao() + '-88412'" [attr.aria-invalid]="tentou() && !ocorrencia().trim()">
                      @if (tentou() && !ocorrencia().trim()) { <span class="geo-campo__erro"><geo-icone nome="alerta" [tamanho]="16" />A obra é controlada por {{ rotuloExecucao() }}: informe o número.</span> }
                    </label>
                  }
                }
                @if (itens().length) { <p class="ajuda">Trocar a equipe tira os {{ itens().length }} itens já escolhidos.</p> }
              </div>
            } @else {
            <div class="campos">
              @if (tipo !== 'entrada') {
                <geo-seletor [rotulo]="tipo === 'saida' ? 'Estoque de onde sai' : 'Sai de'" [obrigatorio]="true" [opcoes]="opcoesEstoque()" [valor]="origem()"
                  (valorChange)="trocarOrigem($event)" [invalido]="tentou() && !origem()" [placeholder]="estoques().length ? 'Escolher' : 'Carregando…'" />
              }
              @if (tipo !== 'saida') {
                <geo-seletor [rotulo]="tipo === 'entrada' ? 'Estoque onde entra' : 'Vai para'" [obrigatorio]="true" [opcoes]="opcoesDestino()" [valor]="destino()"
                  (valorChange)="destino.set($event)" [invalido]="tentou() && !destino()" [placeholder]="estoques().length ? 'Escolher' : 'Carregando…'" />
              }
              @if (tipo === 'transferencia' && origem() && destino()) {
                <p class="resumo-rota"><geo-icone nome="transferencia" [tamanho]="18" />{{ nomeEstoque(origem()) }} → {{ nomeEstoque(destino()) }}</p>
              }
              @if (itens().length) { <p class="ajuda">Trocar o estoque de origem tira os {{ itens().length }} itens já escolhidos.</p> }
            </div>
            }
          }
          @case (2) {
            @if (itens().length || tipo !== 'entrada') {
            <div class="totais geo-num"><span><strong>{{ itens().length }}</strong> {{ itens().length === 1 ? 'material' : 'materiais' }}</span>
              @if (totalSeries()) { <span>· {{ contar(totalSeries()) }}</span> }
              @if (tipo !== 'entrada') { <span class="de">de {{ nomeEstoque(origem()) }}</span> }</div>
            }

            @if (itens().length) {
              <h2 class="geo-secao"><span>Nesta {{ def.verbo }}</span>
                <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="tirarTudo()">{{ confirmandoTirar() ? 'Toque de novo' : 'Tirar todos' }}</button></h2>
              <ul class="geo-grupo escolhidos">
                @for (it of itens(); track it.chave; let i = $index) {
                  <li class="geo-linha item">
                    <span class="geo-linha__texto">
                      <span class="geo-linha__titulo">{{ it.descricao }}</span>
                      <span class="geo-linha__apoio geo-num">Cód. {{ it.codigo }}
                        @if (tipo === 'entrada' || (tipo === 'devolucao' && it.saldo === null)) {
                          · <button type="button" class="cond" (click)="condicaoDe.set(i)" [attr.aria-label]="'Condição: ' + rotuloCondicao(it.condicao) + '. Trocar'">{{ rotuloCondicao(it.condicao) }} ▾</button>
                        } @else {
                          · <span class="geo-cond" [class.geo-cond--sucata]="it.condicao !== 'NOVO'">{{ rotuloCondicao(it.condicao) }}</span> · saldo {{ num(it.saldo ?? 0) }}
                        }
                      </span>
                    </span>
                    @if (it.detalhaSerie) {
                      <button type="button" class="series" [class.vazia]="!it.series.length" (click)="seriesDe.set(it.chave)">
                        <geo-icone nome="codigo_barras" [tamanho]="18" />{{ it.series.length ? contar(it.series.length) : 'Informar séries' }}</button>
                    } @else {
                      @if (it.equivalencias?.length) {
                        <geo-quantidade-unidade [material]="{ unidadeMedida: it.unidade, equivalencias: it.equivalencias }"
                          [valor]="it.unidadeInformada ? (it.quantidadeInformada ?? it.quantidade) : it.quantidade" (valorChange)="definirQuantidade(i, $event)"
                          [unidade]="it.unidadeInformada ?? null" (unidadeChange)="definirUnidade(i, $event)" [rotulo]="'quantidade de ' + it.descricao" />
                      } @else {
                        <geo-quantidade [valor]="it.quantidade" (valorChange)="definirQuantidade(i, $event)" [minimo]="0.001" [grande]="true" [unidade]="it.unidade"
                          [rotulo]="'quantidade de ' + it.descricao" />
                      }
                    }
                    <button type="button" class="geo-btn-icone tirar" (click)="remover(i)" [attr.aria-label]="'Tirar ' + it.descricao"><geo-icone nome="lixeira" [tamanho]="20" /></button>
                    @if (tipo === 'devolucao') {
                      <div class="extras">
                        @if (processo() === 'tecnico') {
                          <button type="button" class="extra geo-num" (click)="alternarConcreto(i)" [attr.aria-label]="'Tipo ' + (it.concreto ? '922, concreto' : '222, comum') + '. Trocar'">
                            {{ it.concreto ? '922 · Concreto' : '222 · Comum' }}</button>
                        }
                        <button type="button" class="extra" role="switch" [attr.aria-checked]="it.guardar !== false" [class.baixa]="it.guardar === false" (click)="alternarGuardar(i)">
                          <geo-icone [nome]="it.guardar === false ? 'saida' : 'estoque'" [tamanho]="15" />{{ it.guardar === false ? 'Baixa na hora' : 'Guardar no almox' }}</button>
                      </div>
                    }
                  </li>
                }
              </ul>
            }

            @if (tipo === 'devolucao' && processo() === 'tecnico') {
              <div class="fonte"><geo-segmentado rotulo="De onde escolher o material" [opcoes]="fontes" [valor]="fonte()" (valorChange)="fonte.set($event)" /></div>
              @if (fonte() === 'catalogo') { <p class="ajuda ajuda--fonte">Material fora do saldo da equipe também pode voltar. A devolução sai do estoque da obra, que pode ficar negativo.</p> }
            }
            <h2 class="geo-secao"><span>{{ usaCatalogo() ? 'Catálogo de materiais' : tipo === 'devolucao' ? 'Saldo da equipe' : 'Saldo do estoque' }}</span>
              @if (!usaCatalogo() && saldosFiltrados().length) { <span class="geo-num">{{ saldosFiltrados().length }}</span> }</h2>
            <div class="ferramentas">
              <div class="busca"><geo-icone nome="busca" [tamanho]="18" />
                <input type="search" placeholder="Nome ou código" enterkeyhint="search" [attr.aria-label]="usaCatalogo() ? 'Buscar no catálogo' : 'Buscar no saldo'"
                  [value]="busca()" (input)="busca.set($any($event.target).value)"></div>
              @if (!usaCatalogo()) {
                <button type="button" class="geo-btn geo-btn--tonal ler" (click)="leitorAberto.set(true)" aria-label="Ler série pela câmera ou leitor"><geo-icone nome="codigo_barras" /></button>
              }
            </div>
            @if (tipo === 'transferencia' && saldos().length && !busca()) {
              <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto tudo" (click)="adicionarTudo()"><geo-icone nome="mais" [tamanho]="16" />Transferir todo o saldo sem série</button>
            }

            @if (usaCatalogo()) {
              @if (buscando() && !catalogo().length) {
                <div class="geo-esqueletos">@for (i of [1, 2, 3]; track i) { <div class="geo-esqueleto" style="height: 60px"></div> }</div>
              } @else if (catalogo().length) {
                <ul class="geo-grupo" [class.atualizando]="buscando()">
                  @for (m of catalogo(); track m.id) {
                    <li><button type="button" class="geo-linha geo-linha--acao" (click)="adicionarMaterial(m)">
                      <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ m.descricao }}</span>
                        <span class="geo-linha__apoio geo-num">Cód. {{ m.codigo }} · {{ m.unidadeMedida || 'UN' }}{{ m.detalhaSerie ? ' · com nº de série' : '' }}</span></span>
                      @if (temMaterial(m.id)) { <span class="geo-etiqueta geo-etiqueta--ok"><geo-icone nome="check" [tamanho]="13" />Na lista</span> }
                      @else { <span class="geo-btn geo-btn--tonal geo-btn--compacto" aria-hidden="true">Adicionar</span> }
                    </button></li>
                  }
                </ul>
                @if (temMaisCatalogo()) {
                  <button type="button" class="geo-btn geo-btn--neutro geo-btn--bloco mais" (click)="maisCatalogo()" [disabled]="buscando()">{{ buscando() ? 'Carregando…' : 'Mostrar mais' }}</button>
                }
              } @else {
                <geo-vazio icone="busca" [titulo]="busca() ? 'Nenhum material encontrado' : 'Busque o material'" [texto]="busca() ? 'Confira o nome ou o código.' : 'Digite o nome ou o código para ver o catálogo.'" />
              }
            } @else {
              @if (carregandoSaldos()) {
                <div class="geo-esqueletos">@for (i of [1, 2, 3]; track i) { <div class="geo-esqueleto" style="height: 64px"></div> }</div>
              } @else if (saldosFiltrados().length) {
                <ul class="geo-grupo">
                  @for (s of saldosFiltrados(); track s.id) {
                    @let escolhido = temChave(chave(s));
                    <li class="geo-linha-lista"><button type="button" class="geo-linha geo-linha--acao" (click)="adicionarSaldo(s)" [disabled]="escolhido && !s.material.detalhaSerie">
                      <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ s.material.descricao }}</span>
                        <span class="geo-linha__apoio geo-num">Cód. {{ s.material.codigo }} · <span class="geo-cond" [class.geo-cond--sucata]="(s.condicao || 'NOVO') !== 'NOVO'">{{ rotuloCondicao(s.condicao) }}</span>{{ s.material.detalhaSerie ? ' · com série' : '' }}</span></span>
                      <span class="saldo geo-num"><strong>{{ num(s.quantidade) }}</strong><small>{{ s.material.unidadeMedida || 'UN' }}</small></span>
                      @if (escolhido) { <geo-icone nome="check" class="ok" /> }
                    </button></li>
                  }
                </ul>
              } @else {
                <geo-vazio icone="estoque" [titulo]="busca() ? 'Nada encontrado no saldo' : tipo === 'devolucao' ? 'A equipe não tem saldo' : 'Estoque sem saldo'"
                  [texto]="busca() ? 'Confira o nome ou o código.' : tipo === 'devolucao' && processo() === 'tecnico' ? 'Busque no catálogo o material que está voltando.' : 'Não há material com saldo para movimentar.'" />
              }
            }
          }
          @case (3) {
            <div class="rota-final">
              @if (tipo === 'devolucao' && processo() === 'tecnico') {
                @if (ocorrencia().trim() && exigeOcorrencia()) { <span><small>{{ rotuloExecucao() }}</small><strong class="geo-num">{{ ocorrencia().trim().toUpperCase() }}</strong></span> }
                <span><small>Obra</small><strong>{{ nomeObra() }}</strong></span>
              }
              @if (tipo !== 'entrada') { <span><small>{{ tipo === 'devolucao' ? 'Quem devolve' : 'Sai de' }}</small>{{ nomeEstoque(origem()) }}</span> }
              @if (tipo !== 'saida') { <span><small>{{ tipo === 'entrada' ? 'Entra em' : tipo === 'devolucao' ? 'Recebe' : 'Vai para' }}</small><strong>{{ nomeEstoque(destino()) }}</strong></span> }
            </div>
            @if (tipo === 'devolucao' && emBaixa()) {
              <div class="perigo"><geo-icone nome="alerta" /><p><strong>{{ emBaixa() }} {{ emBaixa() === 1 ? 'item sai' : 'itens saem' }} em baixa.</strong> É recebido e baixado na hora: não entra no saldo do almoxarifado.</p></div>
            }
            @if (tipo === 'saida') {
              <div class="perigo"><geo-icone nome="alerta" /><p><strong>Baixa definitiva.</strong> O saldo é debitado na hora e a saída não pode ser desfeita.</p></div>
            }
            <h2 class="geo-secao"><span>Materiais</span><span class="geo-num">{{ itens().length }}</span></h2>
            <ul class="geo-grupo">
              @for (it of itens(); track it.chave) {
                <li class="geo-linha conferir">
                  <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ it.descricao }}</span>
                    <span class="geo-linha__apoio geo-num">Cód. {{ it.codigo }} · {{ rotuloCondicao(it.condicao) }}@if (tipo === 'devolucao') {
                      @if (processo() === 'tecnico') { · {{ it.concreto ? '922' : '222' }} }@if (it.guardar === false) { · baixa na hora }@if (it.saldo === null) { · pelo catálogo } }</span>
                    @if (it.series.length) { <span class="lista-series">@for (s of it.series.slice(0, 12); track s) { <span>{{ s }}</span> }@if (it.series.length > 12) { <span>+{{ it.series.length - 12 }}</span> }</span> }
                  </span>
                  <span class="geo-qtd">{{ num(qtd(it)) }}<small>{{ it.unidade }}</small>@if (it.unidadeInformada && !it.detalhaSerie) {<small class="informado">{{ num(it.quantidadeInformada ?? 0) }} {{ it.unidadeInformada }} informados</small>}</span>
                </li>
              }
            </ul>
          }
          @case (4) {
            <p class="intro">Quem entrega e quem recebe assinam no aparelho. As duas assinaturas são obrigatórias.</p>
            <div class="assinaturas">
              <geo-assinatura rotulo="Quem entrega" [quem]="nomeEstoque(origem())" [valor]="assinaturaEntregador()" (valorChange)="assinaturaEntregador.set($event)" [invalida]="tentou()" />
              <geo-assinatura rotulo="Quem recebe" [quem]="nomeEstoque(destino())" [valor]="assinaturaRecebedor()" (valorChange)="assinaturaRecebedor.set($event)" [invalida]="tentou()" />
            </div>
          }
        }
      </section>
    </div>

    <footer class="rodape" data-acao-fixa>
      @if (passo() > 1) { <button type="button" class="geo-btn geo-btn--neutro" (click)="passo.set(passo() - 1)" [disabled]="enviando()">Voltar</button> }
      <button type="button" class="geo-btn principal" [class.geo-btn--perigo]="ultimo() && tipo === 'saida'" [class.geo-btn--principal]="!(ultimo() && tipo === 'saida')"
        (click)="avancar()" [disabled]="enviando() || conferindoSeries() || (ultimo() && !rede.isOnline())">
        @if (ultimo()) { {{ enviando() ? 'Registrando…' : rede.isOnline() ? def.botao : 'Sem internet' }} }
        @else if (conferindoSeries()) { Conferindo séries… }
        @else { Continuar <geo-icone nome="seta" [tamanho]="18" /> }
      </button>
    </footer>

    <geo-captura-series [aberta]="!!seriesDe()" (abertaChange)="!$event && seriesDe.set(null)" [titulo]="itemSeries()?.descricao ?? ''"
      [disponiveis]="tipo === 'entrada' || $safeNavigationMigration(itemSeries()?.saldo) === null ? null : seriesDisponiveis()" [nomeEstoque]="nomeEstoque(origem())"
      [series]="itemSeries()?.series ?? []" (seriesChange)="definirSeries($event)" [verificar]="tipo === 'entrada' ? verificarSeries : null" />

    <geo-folha [aberta]="condicaoDe() !== null" (fechar)="condicaoDe.set(null)" titulo="Condição do material">
      <ul class="geo-grupo lista" role="radiogroup" aria-label="Condição">
        @for (c of condicoesDisponiveis(); track c.valor) {
          <li role="none"><button type="button" role="radio" class="geo-linha geo-linha--acao" [attr.aria-checked]="itemCondicao()?.condicao === c.valor" (click)="definirCondicao(c.valor)">
            <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ c.rotulo }}</span></span>
            @if (itemCondicao()?.condicao === c.valor) { <geo-icone nome="check" /> }</button></li>
        }
      </ul>
    </geo-folha>

    <geo-folha [aberta]="leitorAberto()" (fechar)="leitorAberto.set(false)" titulo="Ler séries" [descricao]="'Cada série lida entra no material certo, a partir do saldo de ' + nomeEstoque(origem()) + '.'">
      <div class="leitor">
        @if (temCamera) {
          <geo-leitor-codigo [ativo]="leitorAberto()" [retorno]="retorno()" (lido)="lerSerie($event)" />
        } @else {
          <p class="ajuda">Este navegador não lê pela câmera. Use um leitor de código conectado: ele digita aqui e confirma sozinho.</p>
        }
        <form class="digitar" (submit)="$event.preventDefault(); lerSerie(digitada()); digitada.set('')">
          <input class="geo-input mono" [value]="digitada()" (input)="digitada.set($any($event.target).value)" placeholder="Ou digite a série" aria-label="Série"
            autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="send">
          <button type="submit" class="geo-btn geo-btn--principal" [disabled]="!digitada().trim() || localizando()" aria-label="Adicionar série"><geo-icone nome="mais" /></button>
        </form>
        @if (lidas().length) {
          <ul class="lidas" aria-label="Últimas leituras">
            @for (l of lidas(); track l.serie + l.em) { <li [attr.data-tom]="l.tom"><span class="mono">{{ l.serie }}</span><span>{{ l.texto }}</span></li> }
          </ul>
        }
      </div>
      <div rodape class="geo-folha-rodape"><button type="button" class="geo-btn geo-btn--principal" (click)="leitorAberto.set(false)">Pronto · {{ contar(totalSeries()) }}</button></div>
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .conteudo { animation: entrar var(--geo-m-entrar) var(--geo-curva); }
    @keyframes entrar { from { opacity: 0; transform: translateY(6px); } }
    .campos { display: grid; gap: var(--geo-e2); padding: var(--geo-e2) var(--geo-e3); }
    .resumo-rota { display: flex; align-items: center; gap: var(--geo-e2); margin: var(--geo-e2) var(--geo-e2) 0; font: var(--geo-t-corpo-forte); color: var(--geo-texto-2); }
    .ajuda { margin: var(--geo-e1) var(--geo-e2) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .totais { display: flex; flex-wrap: wrap; gap: 4px; padding: var(--geo-e2) var(--geo-e5) 0; font: var(--geo-t-apoio); font-size: .875rem; color: var(--geo-texto-2); }
    .totais strong { color: var(--geo-texto); }
    .totais .de { flex-basis: 100%; }
    .geo-secao .geo-btn { margin: -10px -8px -10px 0; color: var(--geo-erro); }
    .item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; row-gap: var(--geo-e2); column-gap: var(--geo-e2); }
    .item .geo-linha__texto { grid-column: 1; grid-row: 1; }
    .item .tirar { grid-column: 2; grid-row: 1; margin: -8px -10px -8px 0; color: var(--geo-texto-3); }
    .informado { display: block; font: var(--geo-t-apoio); font-size: .75rem; color: var(--geo-texto-2); text-align: right; }
    .item > geo-quantidade, .item > geo-quantidade-unidade, .item > .series { grid-column: 1 / -1; grid-row: 2; justify-self: start; }
    .extras { grid-column: 1 / -1; grid-row: 3; display: flex; flex-wrap: wrap; gap: var(--geo-e2); }
    .extra { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: var(--geo-r-pilula); border: 1px solid var(--geo-linha-forte);
      background: var(--geo-superficie); color: var(--geo-texto); font: 600 .8125rem/1 var(--geo-fonte); cursor: pointer; }
    .extra geo-icone { color: var(--geo-ok); }
    .extra.baixa { border-color: transparent; background: var(--geo-erro-suave); color: var(--geo-erro); }
    .extra.baixa geo-icone { color: var(--geo-erro); }
    .fonte { padding: var(--geo-e3) var(--geo-e3) 0; }
    .ajuda--fonte { margin: var(--geo-e2) var(--geo-e5) 0; }
    .cond { border: 0; padding: 2px 6px; margin: -2px 0; border-radius: 6px; background: var(--geo-superficie-2); color: var(--geo-texto); font: 600 .8125rem/1.2 var(--geo-fonte); cursor: pointer; }
    .series { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: var(--geo-r-pilula); border: 1.5px solid var(--geo-ok);
      background: transparent; color: var(--geo-texto); font: 600 .875rem/1 var(--geo-fonte); cursor: pointer; }
    .series geo-icone { color: var(--geo-ok); }
    .series.vazia { border-style: dashed; border-color: var(--geo-linha-forte); color: var(--geo-destaque); }
    .series.vazia geo-icone { color: var(--geo-destaque); }
    .ferramentas { display: flex; gap: var(--geo-e2); padding: 0 var(--geo-e3) var(--geo-e2); }
    .busca { flex: 1; display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 48px; border-radius: var(--geo-r-pilula);
      background: var(--geo-superficie); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .ler { width: 48px; padding: 0; border-radius: 50%; }
    .tudo { margin: 0 var(--geo-margem) var(--geo-e2); gap: 4px; }
    .atualizando { opacity: .6; }
    .mais { margin: var(--geo-e3) var(--geo-margem) 0; width: calc(100% - 24px); }
    .saldo { display: grid; justify-items: end; font: 600 1.125rem/1.1 var(--geo-fonte); }
    .saldo small { font: 500 .75rem/1 var(--geo-fonte); color: var(--geo-texto-2); }
    .ok { color: var(--geo-ok); }
    button.geo-linha:disabled { opacity: .6; }
    .rota-final { display: grid; gap: var(--geo-e2); margin: var(--geo-e2) var(--geo-margem) 0; padding: var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-superficie); }
    .rota-final span { display: grid; font: var(--geo-t-corpo); }
    .rota-final small { font: 500 .75rem/1.3 var(--geo-fonte); color: var(--geo-texto-2); }
    .perigo { display: flex; gap: var(--geo-e3); margin: var(--geo-e2) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-erro-suave); }
    .perigo > geo-icone { color: var(--geo-erro); }
    .perigo p { margin: 0; font: var(--geo-t-apoio); font-size: .875rem; }
    .conferir { align-items: flex-start; }
    .lista-series { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .lista-series span { padding: 2px 6px; border-radius: 6px; background: var(--geo-superficie-2); font: 600 .6875rem/1.4 var(--geo-fonte-mono); }
    .intro { margin: var(--geo-e2) var(--geo-e5) var(--geo-e3); font: var(--geo-t-apoio); font-size: .875rem; color: var(--geo-texto-2); }
    .assinaturas { display: grid; gap: var(--geo-e3); padding: 0 var(--geo-e3); }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .geo-btn { min-height: var(--geo-alvo-principal); }
    .rodape .principal { flex: 1; font-size: 1rem; }
    .lista { background: var(--geo-fundo); }
    .mono { font-family: var(--geo-fonte-mono); }
    .leitor { display: grid; gap: var(--geo-e3); padding: 0 var(--geo-e4); }
    .digitar { display: flex; gap: var(--geo-e2); }
    .digitar .geo-input { flex: 1; min-width: 0; }
    .digitar .geo-btn { width: 54px; padding: 0; }
    .lidas { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .lidas li { display: flex; justify-content: space-between; gap: var(--geo-e2); padding: var(--geo-e2) var(--geo-e3); border-radius: var(--geo-r-campo); background: var(--geo-superficie-2);
      font: var(--geo-t-apoio); animation: entrar 160ms var(--geo-curva); }
    .lidas li span:last-child { text-align: right; color: var(--geo-texto-2); }
    .lidas li[data-tom='ok'] { background: var(--geo-ok-suave); }
    .lidas li[data-tom='erro'] { background: var(--geo-erro-suave); }
    .lidas li[data-tom='atencao'] { background: var(--geo-atencao-suave); }
  `],
})
export class NovaMovimentacaoComponent {
  private readonly almox = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rascunhos = inject(RascunhoService);
  private readonly injector = inject(Injector);
  readonly rede = inject(ConnectivityService);

  readonly tipo: Tipo = lerTipo(inject(ActivatedRoute).snapshot.paramMap.get('tipo'));
  readonly def = TIPOS[this.tipo];
  readonly condicoes = CONDICOES;
  readonly rotuloCondicao = rotuloCondicao;
  readonly temCamera = leitorPorCameraDisponivel();

  readonly passo = signal(1);
  readonly tentou = signal(false);
  readonly enviando = signal(false);
  readonly estoques = signal<Estoque[]>([]);
  readonly origem = signal<string | null>(null);
  readonly destino = signal<string | null>(null);
  readonly itens = signal<ItemMov[]>([]);
  readonly busca = signal('');
  readonly confirmandoTirar = signal(false);

  readonly saldos = signal<Saldo[]>([]);
  readonly carregandoSaldos = signal(false);
  private saldosDe: string | null = null;
  private readonly seriesPorChave = signal<Record<string, string[]>>({});

  readonly catalogo = signal<Material[]>([]);
  readonly buscando = signal(false);
  readonly temMaisCatalogo = signal(false);
  private readonly paginaCatalogo = signal(0);

  readonly seriesDe = signal<string | null>(null);
  readonly condicaoDe = signal<number | null>(null);
  readonly leitorAberto = signal(false);
  readonly localizando = signal(false);
  /** Leituras que chegaram enquanto a anterior era localizada: nenhuma se perde. */
  private filaLeitura: string[] = [];
  readonly conferindoSeries = signal(false);

  /** Entrada: séries que já estão ativas em algum estoque (o servidor recusaria a entrada inteira). */
  readonly verificarSeries: VerificadorSeries = async series => {
    const achadas = await firstValueFrom(this.almox.verificarSeries(series).pipe(catchError(() => of([] as SaldoSerie[]))));
    return new Map(achadas.map(s => [s.numSerie.toUpperCase(), `Já está cadastrada${s.estoque?.nomeIdentificador ? ' em ' + s.estoque.nomeIdentificador : ' no sistema'}.`]));
  };
  readonly digitada = signal('');
  readonly retorno = signal<RetornoLeitura | null>(null);
  readonly lidas = signal<{ serie: string; texto: string; tom: string; em: number }[]>([]);

  readonly assinaturaEntregador = signal<string | null>(null);
  readonly assinaturaRecebedor = signal<string | null>(null);
  private rascunho: VinculoRascunho | null = null;

  // ---------- devolução ----------
  readonly processos = PROCESSOS;
  readonly fontes = FONTES;
  readonly processo = signal<Processo>('comercial');
  readonly fonte = signal<Fonte>('saldo');
  readonly obras = signal<ObraResumo[]>([]);
  readonly obra = signal<string | null>(null);
  readonly ocorrencia = signal('');
  readonly obraEscolhida = computed(() => this.obras().find(o => o.id === this.obra()) ?? null);
  readonly exigeOcorrencia = computed(() => ['OS', 'OC'].includes(this.obraEscolhida()?.controleExecucao ?? ''));
  readonly rotuloExecucao = computed(() => (this.obraEscolhida()?.controleExecucao === 'OS' ? 'OS' : 'OC'));
  readonly nomeObra = computed(() => (this.obraEscolhida() ? `${this.obraEscolhida()!.numero} · ${this.obraEscolhida()!.titulo}` : '—'));
  readonly opcoesObra = computed<OpcaoSeletor[]>(() => this.obras().map(o => ({ valor: o.id, rotulo: `${o.numero} · ${o.titulo}`, apoio: o.tipoObraNome ?? undefined })));
  readonly opcoesEquipe = computed<OpcaoSeletor[]>(() => this.estoques().filter(e => !!e.idEquipe && e.ativo !== false)
    .map(e => ({ valor: e.id, rotulo: e.nomeIdentificador, apoio: e.tipoEstoque?.nome })));
  readonly opcoesAlmoxarifado = computed<OpcaoSeletor[]>(() => this.estoques().filter(ehAlmoxarifado).map(e => ({ valor: e.id, rotulo: e.nomeIdentificador })));
  readonly condicoesDisponiveis = computed(() => (this.tipo === 'devolucao' ? CONDICOES.filter(c => c.valor === 'NOVO' || c.valor === 'SUCATA') : CONDICOES));
  /** Entrada sempre busca no catálogo; a devolução técnica também, quando o material não está no saldo da equipe. */
  readonly usaCatalogo = computed(() => this.tipo === 'entrada' || (this.tipo === 'devolucao' && this.processo() === 'tecnico' && this.fonte() === 'catalogo'));
  /** Devolução técnica sai do estoque da obra: o saldo da equipe aqui só ajuda a escolher o material. */
  readonly limitaSaldo = computed(() => !(this.tipo === 'devolucao' && this.processo() === 'tecnico'));
  readonly emBaixa = computed(() => this.itens().filter(i => i.guardar === false).length);

  readonly ultimo = computed(() => this.passo() === this.def.passos.length);
  readonly opcoesEstoque = computed<OpcaoSeletor[]>(() => this.estoques().map(e => ({ valor: e.id, rotulo: e.nomeIdentificador, apoio: e.tipoEstoque?.nome })));
  readonly opcoesDestino = computed<OpcaoSeletor[]>(() => this.opcoesEstoque().filter(o => o.valor !== this.origem()));
  readonly totalSeries = computed(() => this.itens().reduce((a, i) => a + i.series.length, 0));
  readonly itemSeries = computed(() => this.itens().find(i => i.chave === this.seriesDe()) ?? null);
  readonly itemCondicao = computed(() => (this.condicaoDe() !== null ? this.itens()[this.condicaoDe()!] : null));
  readonly seriesDisponiveis = computed(() => (this.seriesDe() ? this.seriesPorChave()[this.seriesDe()!] ?? [] : []));
  readonly saldosFiltrados = computed(() => {
    const q = normalizar(this.busca());
    return q ? this.saldos().filter(s => normalizar(`${s.material.descricao} ${s.material.codigo}`).includes(q)) : this.saldos();
  });

  constructor() {
    this.almox.estoques().subscribe(e => this.estoques.set(e));
    if (this.tipo === 'entrada' || this.tipo === 'devolucao') {
      combineLatest([toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()), toObservable(this.usaCatalogo)]).pipe(
        tap(([, catalogo]) => { this.paginaCatalogo.set(0); this.buscando.set(catalogo); }),
        switchMap(([q, catalogo]) => (catalogo ? this.almox.buscarMateriais(q, 0).pipe(catchError(() => of(null))) : of(null))),
        takeUntilDestroyed(),
      ).subscribe(r => {
        this.buscando.set(false);
        this.catalogo.set(r?.content ?? []);
        this.temMaisCatalogo.set(!!r && (r.page?.number ?? 0) + 1 < (r.page?.totalPages ?? 0));
      });
    }
    if (this.tipo === 'devolucao') this.almox.obras().subscribe(o => this.obras.set(o));
    void this.vincularRascunho();
  }

  trocarProcesso(p: Processo): void {
    if (p === this.processo()) return;
    this.processo.set(p);
    this.fonte.set('saldo');
    // Fora do saldo só vale na técnica; o tipo 222/922 só existe nela.
    if (p === 'comercial') {
      const fora = this.itens().filter(i => i.saldo === null).length;
      this.itens.update(l => l.filter(i => i.saldo !== null).map(i => ({ ...i, concreto: false })));
      if (fora) this.toast.info(`${fora} ${fora === 1 ? 'material fora do saldo saiu' : 'materiais fora do saldo saíram'}: a devolução comercial só aceita o que está com a equipe.`);
    }
  }

  trocarObra(id: string | null): void {
    this.obra.set(id);
    if (!this.exigeOcorrencia()) this.ocorrencia.set('');
  }

  alternarConcreto(i: number): void {
    this.itens.update(l => l.map((x, k) => (k === i ? { ...x, concreto: !x.concreto } : x)));
  }

  alternarGuardar(i: number): void {
    this.itens.update(l => l.map((x, k) => (k === i ? { ...x, guardar: x.guardar === false } : x)));
  }

  private async vincularRascunho(): Promise<void> {
    this.rascunho = this.rascunhos.vincular<RascunhoMov>({
      chave: `almox:mov:${this.tipo}`,
      injector: this.injector,
      // Assinaturas ficam fora do rascunho: se o app fechar, colhe de novo.
      ler: () => ({
        passo: Math.min(this.passo(), 3), origem: this.origem(), destino: this.destino(), itens: this.itens(),
        processo: this.processo(), obra: this.obra(), ocorrencia: this.ocorrencia(),
      }),
      aplicar: r => {
        this.origem.set(r.origem);
        this.destino.set(r.destino);
        this.itens.set(r.itens ?? []);
        if (r.processo) this.processo.set(r.processo);
        this.obra.set(r.obra ?? null);
        this.ocorrencia.set(r.ocorrencia ?? '');
        this.passo.set(Math.min(Math.max(1, r.passo || 1), 3));
        if (this.passo() >= 2) this.carregarSaldos();
      },
      titulo: () => `${this.def.titulo} · ${this.itens().length} ${this.itens().length === 1 ? 'material' : 'materiais'}`,
      rota: () => `/almox/movimentacoes/nova/${this.tipo}`,
      vazio: r => !r.itens.length && !r.origem && !r.destino,
    });
    await this.rascunho.restaurado;
  }

  nomeEstoque(id: string | null): string {
    return this.estoques().find(e => e.id === id)?.nomeIdentificador ?? '—';
  }

  num(n: number): string {
    return numeroBr(n);
  }

  contar(n: number): string {
    return contarSeries(n);
  }

  chave(s: Saldo): string {
    return chaveDe(s.material.id, s.condicao || 'NOVO');
  }

  temChave(c: string): boolean {
    return this.itens().some(i => i.chave === c);
  }

  temMaterial(id: string): boolean {
    return this.itens().some(i => i.idMaterial === id);
  }

  qtd(it: ItemMov): number {
    return it.detalhaSerie ? it.series.length : it.quantidade;
  }

  trocarOrigem(id: string | null): void {
    if (id === this.origem()) return;
    this.origem.set(id);
    if (this.destino() === id) this.destino.set(null);
    if (this.itens().length) { this.itens.set([]); this.toast.info('Os itens escolhidos saíram: o estoque de origem mudou.'); }
    this.saldos.set([]);
    this.saldosDe = null;
    this.seriesPorChave.set({});
  }

  // ---------- itens ----------
  private carregarSaldos(): void {
    if (this.tipo === 'entrada' || !this.origem() || this.saldosDe === this.origem()) return;
    const origem = this.origem()!;
    this.saldosDe = origem;
    this.carregandoSaldos.set(true);
    this.almox.listarSaldos(origem).subscribe({
      next: s => {
        // Devolução só leva material novo ou sucata (o que o almoxarifado recebe de volta).
        const aceitos = this.tipo === 'devolucao' ? s.filter(x => (x.condicao || 'NOVO') === 'NOVO' || x.condicao === 'SUCATA') : s;
        this.saldos.set([...aceitos].sort((a, b) => a.material.descricao.localeCompare(b.material.descricao, 'pt-BR')));
        this.carregandoSaldos.set(false);
        // Saldo pode ter mudado desde o rascunho: ajusta o limite de cada item.
        this.itens.update(l => l.map(i => (i.saldo === null ? i : { ...i, saldo: this.saldoDe(i.chave) })));
      },
      error: () => { this.carregandoSaldos.set(false); this.saldosDe = null; this.toast.error('Não foi possível carregar o saldo do estoque.'); },
    });
  }

  private saldoDe(chave: string): number {
    return Number(this.saldos().find(s => this.chave(s) === chave)?.quantidade ?? 0);
  }

  adicionarSaldo(s: Saldo): void {
    const c = this.chave(s);
    if (!this.temChave(c)) {
      this.itens.update(l => [...l, {
        chave: c, idMaterial: s.material.id, codigo: s.material.codigo, descricao: s.material.descricao, unidade: s.material.unidadeMedida || 'UN',
        detalhaSerie: !!s.material.detalhaSerie, condicao: (s.condicao || 'NOVO') as Condicao, quantidade: s.material.detalhaSerie ? 0 : Math.min(1, Number(s.quantidade)),
        series: [], saldo: Number(s.quantidade), ...this.padraoDevolucao(s.condicao), equivalencias: equivalenciasDe(s.material),
      }]);
    }
    if (s.material.detalhaSerie) this.abrirSeries(c);
  }

  adicionarTudo(): void {
    const novos = this.saldos().filter(s => !s.material.detalhaSerie && !this.temChave(this.chave(s)));
    if (!novos.length) { this.toast.info('Todo o saldo sem série já está na lista.'); return; }
    this.itens.update(l => [...l, ...novos.map(s => ({
      chave: this.chave(s), idMaterial: s.material.id, codigo: s.material.codigo, descricao: s.material.descricao, unidade: s.material.unidadeMedida || 'UN',
      detalhaSerie: false, condicao: (s.condicao || 'NOVO') as Condicao, quantidade: Number(s.quantidade), series: [], saldo: Number(s.quantidade),
      equivalencias: equivalenciasDe(s.material),
    }))]);
    const comSerie = this.saldos().filter(s => s.material.detalhaSerie).length;
    this.toast.success(`${novos.length} ${novos.length === 1 ? 'material entrou' : 'materiais entraram'} com todo o saldo.${comSerie ? ' Os com série escolha ou leia à parte.' : ''}`);
  }

  adicionarMaterial(m: Material): void {
    const c = chaveDe(m.id, 'NOVO');
    if (!this.temChave(c)) {
      this.itens.update(l => [...l, {
        chave: c, idMaterial: m.id, codigo: m.codigo, descricao: m.descricao, unidade: m.unidadeMedida || 'UN', detalhaSerie: !!m.detalhaSerie,
        condicao: 'NOVO', quantidade: m.detalhaSerie ? 0 : 1, series: [], saldo: null, ...this.padraoDevolucao('NOVO'), equivalencias: equivalenciasDe(m),
      }]);
    }
    if (m.detalhaSerie) this.abrirSeries(c);
  }

  maisCatalogo(): void {
    const p = this.paginaCatalogo() + 1;
    this.buscando.set(true);
    this.almox.buscarMateriais(this.busca(), p).pipe(catchError(() => of(null))).subscribe(r => {
      this.buscando.set(false);
      if (!r) return;
      this.paginaCatalogo.set(p);
      this.catalogo.update(l => [...l, ...(r.content ?? [])]);
      this.temMaisCatalogo.set((r.page?.number ?? 0) + 1 < (r.page?.totalPages ?? 0));
    });
  }

  /** Na devolução: guarda no almoxarifado, e a sucata já sugere a baixa na hora. */
  private padraoDevolucao(condicao?: string | null): Partial<ItemMov> {
    return this.tipo === 'devolucao' ? { guardar: (condicao || 'NOVO') !== 'SUCATA', concreto: false } : {};
  }

  private abrirSeries(chave: string): void {
    this.seriesDe.set(chave);
    if (this.tipo === 'entrada' || this.seriesPorChave()[chave]) return;
    const it = this.itens().find(i => i.chave === chave);
    if (!it || it.saldo === null || !this.origem()) return;
    this.almox.listarSeries(this.origem()!, it.idMaterial, it.condicao).pipe(catchError(() => of([]))).subscribe(s => {
      this.seriesPorChave.update(m => ({ ...m, [chave]: s.map(x => x.numSerie) }));
    });
  }

  definirSeries(series: string[]): void {
    const c = this.seriesDe();
    if (!c) return;
    this.itens.update(l => l.map(i => (i.chave === c ? { ...i, series, quantidade: series.length } : i)));
  }

  /** Com outra unidade escolhida, {@code q} vem nela; o saldo recebe (ou perde) o convertido. */
  definirQuantidade(i: number, q: number): void {
    const it = this.itens()[i];
    const base = it.unidadeInformada ? paraBase(this.materialDe(it), q, it.unidadeInformada) : q;
    if (it.saldo !== null && base > it.saldo && this.limitaSaldo()) {
      const naUnidade = it.unidadeInformada ? ` (${numeroBr(daBase(this.materialDe(it), it.saldo, it.unidadeInformada))} ${it.unidadeInformada})` : '';
      this.toast.warning(`O saldo é ${numeroBr(it.saldo)} ${it.unidade}${naUnidade}.`);
      return;
    }
    this.itens.update(l => l.map((x, k) => (k !== i ? x : x.unidadeInformada
      ? { ...x, quantidade: base, quantidadeInformada: q }
      : { ...x, quantidade: q, quantidadeInformada: undefined })));
  }

  /** Troca a unidade mantendo a mesma quantidade física (ex.: 126 MT viram 30 KG). */
  definirUnidade(i: number, unidade: string | null): void {
    this.itens.update(l => l.map((x, k) => (k !== i ? x : unidade
      ? { ...x, unidadeInformada: unidade, quantidadeInformada: daBase(this.materialDe(x), x.quantidade, unidade) }
      : { ...x, unidadeInformada: null, quantidadeInformada: undefined })));
  }

  private materialDe(it: ItemMov): ComUnidade {
    return { unidadeMedida: it.unidade, equivalencias: it.equivalencias };
  }

  /** O que foi digitado em outra unidade vai como foi digitado; o servidor converte e guarda os dois. */
  private informado(i: ItemMov): { quantidade: number; unidade?: string } {
    return i.unidadeInformada && i.quantidadeInformada ? { quantidade: i.quantidadeInformada, unidade: i.unidadeInformada } : { quantidade: i.quantidade };
  }

  definirCondicao(c: Condicao): void {
    const i = this.condicaoDe();
    if (i === null) return;
    const it = this.itens()[i];
    const nova = chaveDe(it.idMaterial, c);
    if (nova !== it.chave && this.temChave(nova)) { this.toast.warning(`${it.descricao} já está na lista como ${rotuloCondicao(c)}.`); return; }
    this.itens.update(l => l.map((x, k) => (k === i ? { ...x, condicao: c, chave: nova, ...(this.tipo === 'devolucao' ? { guardar: c !== 'SUCATA' } : {}) } : x)));
    this.condicaoDe.set(null);
  }

  remover(i: number): void {
    this.itens.update(l => l.filter((_, k) => k !== i));
  }

  tirarTudo(): void {
    if (!this.confirmandoTirar()) { this.confirmandoTirar.set(true); setTimeout(() => this.confirmandoTirar.set(false), 3000); return; }
    this.itens.set([]);
    this.confirmandoTirar.set(false);
  }

  /** Leitura direta (saída e transferência): a série lida encontra o material no saldo da origem. */
  lerSerie(bruta: string): void {
    const s = extrairSerie(bruta);
    const origem = this.origem();
    if (!s || !origem) return;
    if (this.localizando()) {
      if (!this.filaLeitura.includes(s)) this.filaLeitura.push(s);
      return;
    }
    const registrar = (texto: string, tom: 'ok' | 'erro' | 'atencao') => {
      this.retorno.set({ texto: `${s}: ${texto}`, tom });
      this.lidas.update(l => [{ serie: s, texto, tom, em: Date.now() }, ...l].slice(0, 8));
    };
    if (this.itens().some(i => i.series.includes(s))) { registrar('já está na lista', 'atencao'); return; }
    this.localizando.set(true);
    this.almox.localizarSerie(origem, s).pipe(catchError(() => of(null)), finalize(() => {
      this.localizando.set(false);
      const proxima = this.filaLeitura.shift();
      if (proxima) this.lerSerie(proxima);
    })).subscribe(serie => {
      if (!serie) { registrar(`não está em ${this.nomeEstoque(origem)}`, 'erro'); return; }
      const c = chaveDe(serie.material.id, serie.condicao || 'NOVO');
      const saldo = this.saldos().find(x => this.chave(x) === c);
      if (!this.temChave(c)) {
        this.itens.update(l => [...l, {
          chave: c, idMaterial: serie.material.id, codigo: serie.material.codigo, descricao: serie.material.descricao, unidade: serie.material.unidadeMedida || 'UN',
          detalhaSerie: true, condicao: (serie.condicao || 'NOVO') as Condicao, quantidade: 0, series: [], saldo: Number(saldo?.quantidade ?? 0),
        }]);
      }
      this.itens.update(l => l.map(i => (i.chave === c ? { ...i, series: [...i.series, s], quantidade: i.series.length + 1 } : i)));
      registrar(serie.material.descricao, 'ok');
    });
  }

  // ---------- fluxo ----------
  avancar(): void {
    this.tentou.set(true);
    const p = this.passo();
    if (p === 1) {
      if ((this.tipo !== 'entrada' && !this.origem()) || (this.tipo !== 'saida' && !this.destino())) {
        this.toast.warning(this.tipo === 'devolucao' ? 'Escolha a equipe e o almoxarifado para continuar.' : 'Escolha o estoque para continuar.');
        return;
      }
      if (this.tipo === 'devolucao' && this.processo() === 'tecnico') {
        if (!this.obra()) { this.toast.warning('Escolha a obra da devolução.'); return; }
        if (this.exigeOcorrencia() && !this.ocorrencia().trim()) { this.toast.warning(`Informe o número da ${this.rotuloExecucao()}.`); return; }
      }
      this.carregarSaldos();
    }
    if (p === 2) {
      if (!this.itens().length) { this.toast.warning('Adicione ao menos um material.'); return; }
      const semSerie = this.itens().find(i => i.detalhaSerie && !i.series.length);
      if (semSerie) { this.toast.warning(`Informe as séries de ${semSerie.descricao}.`); this.abrirSeries(semSerie.chave); return; }
      const excedido = this.limitaSaldo() ? this.itens().find(i => i.saldo !== null && this.qtd(i) > i.saldo) : undefined;
      if (excedido) { this.toast.warning(`${excedido.descricao}: passa do saldo (${numeroBr(excedido.saldo!)} ${excedido.unidade}).`); return; }
      const zerado = this.itens().find(i => this.qtd(i) <= 0);
      if (zerado) { this.toast.warning(`Informe a quantidade de ${zerado.descricao}.`); return; }
      if (this.tipo === 'entrada' && this.itens().some(i => i.series.length)) { void this.conferirSeriesEAvancar(); return; }
    }
    if (p === 4 && !(this.assinaturaEntregador() && this.assinaturaRecebedor())) { this.toast.warning('Colha as duas assinaturas para confirmar.'); return; }
    if (this.ultimo()) { this.confirmar(); return; }
    this.tentou.set(false);
    this.passo.set(p + 1);
  }

  /** Antes de seguir na entrada: série que já está no sistema faria o servidor recusar tudo no fim. */
  private async conferirSeriesEAvancar(): Promise<void> {
    if (this.conferindoSeries()) return;
    this.conferindoSeries.set(true);
    const todas = this.itens().flatMap(i => i.series);
    const achadas = await this.verificarSeries(todas);
    this.conferindoSeries.set(false);
    const item = this.itens().find(i => i.series.some(s => achadas.has(s)));
    if (item) {
      const repetidas = item.series.filter(s => achadas.has(s));
      this.toast.warning(`${repetidas.length === 1 ? `A série ${repetidas[0]} já está` : `${repetidas.length} séries de ${item.descricao} já estão`} no sistema. Confira a lista.`);
      this.abrirSeries(item.chave);
      return;
    }
    this.tentou.set(false);
    this.passo.update(p => p + 1);
  }

  private registrarDevolucao(): Observable<unknown> {
    const equipe = this.estoques().find(e => e.id === this.origem())?.idEquipe;
    if (!equipe) throw new Error('equipe');
    const condicao = (c: Condicao) => (c === 'SUCATA' ? 'SUCATA' : 'NOVO') as 'NOVO' | 'SUCATA';
    if (this.processo() === 'tecnico') {
      return this.almox.registrarDevolucaoTecnica({
        idObra: this.obra()!, ocorrencia: this.exigeOcorrencia() ? this.ocorrencia().trim().toUpperCase() : null, idEquipe: equipe, idAlmoxarifado: this.destino()!,
        itens: this.itens().map(i => ({
          idMaterial: i.idMaterial, tipoMovimentacao: i.concreto ? 'DEVOLUCAO_CONCRETO' : 'DEVOLUCAO_COMUM',
          ...(i.detalhaSerie ? { quantidade: this.qtd(i) } : this.informado(i)), condicao: condicao(i.condicao),
          numerosSerie: i.detalhaSerie ? i.series : undefined, guardarNoEstoque: i.guardar !== false,
        })),
      });
    }
    return this.almox.registrarDevolucaoComercial({
      idEquipe: equipe, idEstoqueDestino: this.destino()!,
      itens: this.itens().flatMap<DevolucaoComercialRequest['itens'][number]>(i => (i.detalhaSerie
        ? i.series.map(numSerie => ({ idMaterial: i.idMaterial, quantidade: 1, numSerie, condicao: condicao(i.condicao), guardarNoEstoque: i.guardar !== false }))
        : [{ idMaterial: i.idMaterial, ...this.informado(i), condicao: condicao(i.condicao), guardarNoEstoque: i.guardar !== false }])),
    });
  }

  private confirmar(): void {
    if (this.enviando()) return;
    if (this.tipo === 'devolucao') {
      let chamadaDev: Observable<unknown>;
      try { chamadaDev = this.registrarDevolucao(); } catch { this.toast.error('Este estoque não está ligado a uma equipe. Escolha o estoque de campo da equipe.'); return; }
      this.enviar(chamadaDev);
      return;
    }
    const itens = this.itens().flatMap<ItemMovimentacaoRequest>(i => (i.detalhaSerie
      ? i.series.map(numSerie => ({ idMaterial: i.idMaterial, quantidade: 1, numSerie, condicao: i.condicao }))
      : [{ idMaterial: i.idMaterial, ...this.informado(i), condicao: i.condicao }]));
    const pedido: MovimentacaoRequest = {
      idEstoqueOrigem: this.tipo !== 'entrada' ? this.origem()! : undefined,
      idEstoqueDestino: this.tipo !== 'saida' ? this.destino()! : undefined,
      itens,
      assinaturaEntregador: this.tipo === 'transferencia' ? this.assinaturaEntregador()! : undefined,
      assinaturaRecebedor: this.tipo === 'transferencia' ? this.assinaturaRecebedor()! : undefined,
    };
    const chamada = this.tipo === 'entrada' ? this.almox.registrarEntrada(pedido) : this.tipo === 'saida' ? this.almox.registrarSaida(pedido) : this.almox.registrarTransferencia(pedido);
    this.enviar(chamada);
  }

  private enviar(chamada: Observable<unknown>): void {
    this.enviando.set(true);
    chamada.subscribe({
      next: async () => {
        this.enviando.set(false);
        await this.rascunho?.concluir();
        this.toast.success(this.def.sucesso);
        void this.router.navigate(['/almox/movimentacoes'], { replaceUrl: true });
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        this.toast.error(e.detail || `Não foi possível registrar a ${this.def.verbo}. Os dados continuam aqui.`);
        // Saldo pode ter mudado: recarrega para a próxima tentativa.
        this.saldosDe = null;
        this.carregarSaldos();
      },
    });
  }

  fechar(): void {
    void this.rascunho?.gravarEstadoAtual();
    if (this.itens().length) this.toast.info('Rascunho guardado. Continue por Movimentações.');
    void this.router.navigate(['/almox/movimentacoes'], { replaceUrl: true });
  }
}

function lerTipo(v: string | null): Tipo {
  return v === 'saida' || v === 'transferencia' || v === 'devolucao' ? v : 'entrada';
}

function normalizar(v: string): string {
  return (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
