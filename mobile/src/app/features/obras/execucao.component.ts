import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AvisoTurnoFechadoComponent } from './aviso-turno-fechado.component';
import { map } from 'rxjs';
import {
  BarraTopoComponent, FolhaComponent, FotoExibida, FotosComponent, IconeComponent, LeitorCodigoComponent, QuantidadeComponent,
  SegmentadoComponent, VazioComponent,
} from '../../ui';
import { LayoutService } from '../../core/plataforma/layout.service';
import { ToastService } from '../../core/ui/toast.service';
import { TurnoService } from '../../core/turno/turno.service';
import { ArquivosCampoService } from '../../core/obras/arquivos-campo.service';
import { LocalizacaoService, Posicao } from '../../core/obras/localizacao.service';
import {
  PontoDaExecucao, VagaFoto, aprQueLibera, etapaDaFoto, fotoAtrasada, fotosQueTravam, textoFotosQueFaltam, nomeLocais, pendenciasDeFoto, proximaFoto, rotuloEtapaFoto, vagasDeFoto,
} from '../../core/obras/obras-regras';
import { EtapaFoto, ItemFoto } from '../../core/obras/obras.models';
import { Carimbo, montarCarimbo } from '../../core/fotos/carimbo';
import { TokenService } from '../../core/auth/token.service';
import { EvidenciaPreparada, prepararEvidencia } from '../../core/sst/evidencia-foto.util';
import { ObrasContexto } from './obras-contexto';
import { MarcadorPonto, ProjetoPdfComponent } from './projeto-pdf.component';

type Vista = 'pontos' | 'projeto';

/**
 * Execução sobre o projeto. Cada ponto mostra os itens programados; "Tudo feito" aponta o ponto inteiro com um toque e
 * "Parcial" abre as quantidades. As fotos do modelo aparecem na ordem do trabalho (antes, durante, depois), cada uma com
 * o seu momento (do modelo ou da situação do ponto), e o botão "Próxima foto" leva à que falta agora; a reprovada pelo
 * escritório vem primeiro, com o motivo. Foto faltando vira pendência; se o modelo trava (configurado no web), o "Tudo
 * feito" exige todas as obrigatórias e o "Parcial", as de antes. No tablet deitado: projeto
 * à esquerda e o ponto à direita; no celular, o ponto abre numa folha.
 */
@Component({
  selector: 'app-execucao',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, FolhaComponent, FotosComponent, QuantidadeComponent, SegmentadoComponent,
    VazioComponent, LeitorCodigoComponent, ProjetoPdfComponent, RouterLink, NgTemplateOutlet, AvisoTurnoFechadoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.dividido]': 'layout.expandido()', '[class.geo-tela-larga]': 'layout.expandido()' },
  template: `
    @if (programacao(); as p) {
      <geo-barra-topo titulo="Pontos e projeto" [subtitulo]="'Obra ' + (p.numeroObra ?? '') + ' · ' + ctx.ref(p)" (voltar)="voltar()" />
      <geo-aviso-turno-fechado texto="O turno está fechado. Dá para ver os pontos e o projeto; para tirar fotos e marcar o que foi feito, abra o turno." />
      <div class="progresso" role="progressbar" [attr.aria-valuenow]="feitos()" aria-valuemin="0" [attr.aria-valuemax]="pontos().length"
        [attr.aria-label]="feitos() + ' de ' + pontos().length + ' ' + nomeLocais(pontos()) + ' feitos'">
        <span class="progresso__texto"><strong class="geo-num">{{ feitos() }} de {{ pontos().length }}</strong> {{ nomeLocais(pontos()) }} {{ pontos().length === 1 ? 'feito' : 'feitos' }}
          @if (proximo(); as prox) { · próximo: <strong>{{ prox.rotulo }}</strong> }</span>
        <span class="progresso__barra"><span [style.width.%]="pontos().length ? (feitos() / pontos().length) * 100 : 0"></span></span>
      </div>

      @if (liberacao() !== 'LIBERADA') {
        <div class="faixa" role="status">
          <geo-icone [nome]="liberacao() === 'IMPEDIDA' ? 'impedido' : 'escudo'" />
          <span>{{ liberacao() === 'IMPEDIDA' ? 'Registrado "sem condição de executar". Para voltar a executar nesta obra, conclua uma nova APR.' : 'Conclua a APR do dia antes de marcar o que foi feito.' }}</span>
          <a class="geo-btn geo-btn--principal geo-btn--compacto" [routerLink]="['/obras', p.id, 'apr']">{{ liberacao() === 'IMPEDIDA' ? 'Nova APR' : 'Fazer APR' }}</a>
        </div>
      }

      @if (!layout.expandido()) {
        <div class="vista"><geo-segmentado rotulo="Ver" [opcoes]="vistas" [(valor)]="vista" /></div>
      }

      <div class="colunas">
        @if (layout.expandido() || vista() === 'projeto') {
          <section class="projeto" aria-label="Projeto">
            <app-projeto-pdf [arquivo]="pdf()" [rotacoes]="obra()?.rotacoes" [marcadores]="marcadores()" [selecionado]="selecionado()" [proximo]="proximo()?.id ?? null"
              [titulo]="'Obra ' + (p.numeroObra ?? '') + ' · ' + feitos() + ' de ' + pontos().length + ' feitos' + (proximo() ? ' · próximo: ' + proximo()!.rotulo : '')"
              (escolhido)="escolher($event)" />
          </section>
        }
        @if (layout.expandido() || vista() === 'pontos') {
          <section class="lado" aria-label="Pontos">
            @if (layout.expandido() && pontoSelecionado(); as ponto) {
              <ng-container *ngTemplateOutlet="detalhe; context: { $implicit: ponto }" />
            } @else {
              <ul class="geo-grupo pontos">
                @for (ponto of pontos(); track ponto.id) {
                  <li class="geo-linha" [attr.data-testid]="'ponto-' + ponto.numero">
                    <button type="button" class="abrir" (click)="escolher(ponto.id)" [attr.aria-label]="'Abrir ' + ponto.rotulo">
                      <span class="geo-selo" [class.geo-selo--ok]="ponto.situacao === 'FEITO'" [class.geo-selo--atencao]="ponto.situacao === 'PARCIAL'">
                        <geo-icone [nome]="ponto.situacao === 'FEITO' ? 'check' : 'local'" /></span>
                      <span class="geo-linha__texto">
                        <span class="geo-linha__titulo">{{ ponto.rotulo }}
                          @if (ponto.id === proximo()?.id) { <span class="geo-etiqueta geo-etiqueta--destaque proximo">Próximo</span> }
                          @if (ponto.situacao === 'PARCIAL') { <span class="geo-etiqueta geo-etiqueta--atencao proximo">Parcial</span> }</span>
                        <span class="fazer">{{ oQueFazer(ponto) }}</span>
                        <span class="geo-linha__apoio">{{ resumoMateriais(ponto) }}
                          @if (refazerDoPonto(ponto.id); as n) { {{ resumoMateriais(ponto) ? ' · ' : '' }}<span class="refazer">{{ n === 1 ? '1 foto para refazer' : n + ' fotos para refazer' }}</span> }
                          @else if (pendenciasDoPonto(ponto.id)) { {{ (resumoMateriais(ponto) ? ' · ' : '') + fotosPendentes(pendenciasDoPonto(ponto.id)) }} }</span>
                      </span>
                    </button>
                    @if (ponto.situacao !== 'FEITO') {
                      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" [disabled]="liberacao() !== 'LIBERADA'"
                        (click)="tudoFeito(ponto)" [attr.data-testid]="'tudo-feito-' + ponto.numero">Tudo feito</button>
                    } @else {
                      <span class="geo-etiqueta geo-etiqueta--ok">Feito</span>
                    }
                  </li>
                }
              </ul>
              @if (!pontos().length) {
                @if (p.avulsa) {
                  <geo-vazio icone="sem_rede" titulo="Os pontos desta obra ainda não chegaram" texto="Eles chegam sozinhos quando houver sinal. Enquanto isso: chegada, APR e ocorrências já funcionam." />
                } @else {
                  <geo-vazio icone="local" titulo="Nenhum ponto nesta programação" />
                }
              }
              @if (!p.avulsa && extras() ; as n) {
                <ul class="geo-grupo alem">
                  <li><a class="geo-linha geo-linha--acao" [routerLink]="['/obras/nao-programada']" [queryParams]="{ obra: p.numeroObra, motivo: 'Além do programado' }" data-testid="alem-programado">
                    <span class="geo-selo"><geo-icone nome="mais" /></span>
                    <span class="geo-linha__texto"><span class="geo-linha__titulo">Ir além do programado</span>
                      <span class="geo-linha__apoio">{{ n === 1 ? '1 ponto desta obra' : n + ' pontos desta obra' }} ainda sem programação. Funciona sem sinal.</span></span>
                    <geo-icone nome="avancar" [tamanho]="18" /></a></li>
                </ul>
              }
              @if (pendencias().length) {
                <button type="button" class="nota" (click)="irParaPendencia()">
                  <geo-icone nome="camera" [tamanho]="16" />
                  <span>{{ refazerTotal() ? (refazerTotal() === 1 ? '1 foto reprovada para refazer' : refazerTotal() + ' fotos reprovadas para refazer') + ' · ' : '' }}{{ fotosPendentes(pendencias().length) }} do modelo. Não bloqueia o envio.</span>
                  <span class="nota__ir">Ver</span>
                </button>
              }
              <div class="geo-respiro"></div>
            }
          </section>
        }
      </div>

      @if (!layout.expandido()) {
        <geo-folha [aberta]="!!pontoSelecionado()" [titulo]="pontoSelecionado()?.rotulo ?? null" (fechar)="selecionado.set(null)">
          @if (pontoSelecionado(); as ponto) { <ng-container *ngTemplateOutlet="detalhe; context: { $implicit: ponto }" /> }
        </geo-folha>
      }

      <ng-template #detalhe let-ponto>
        <div class="detalhe" data-testid="detalhe-ponto">
          @if (layout.expandido()) {
            <div class="detalhe__topo">
              <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="selecionado.set(null)"><geo-icone nome="voltar" />Pontos</button>
              <h2>{{ ponto.rotulo }}</h2>
            </div>
          }
          <h3 class="geo-secao">O que fazer neste ponto</h3>
          <ul class="itens">
            @for (item of itensOrdenados(ponto); track item.idItem) {
              <li>
                <span class="geo-selo estado-item" [class.geo-selo--ok]="item.feito >= item.quantidade" aria-hidden="true">
                  <geo-icone [nome]="item.feito >= item.quantidade ? 'check' : item.tipo === 'MATERIAL' ? 'material' : 'ferramenta'" [tamanho]="18" /></span>
                <span class="item__texto"><strong>{{ item.descricao }}</strong>
                  <span class="geo-num">{{ item.tipo === 'MATERIAL' ? 'Material · ' : '' }}{{ num(item.feito) }} de {{ num(item.quantidade) }} {{ item.unidade ?? '' }}{{ item.kit ? ' · kit ' + item.kit : '' }}</span></span>
                @if (parcial()) {
                  <geo-quantidade [minimo]="0" [rotulo]="'Feito agora de ' + item.descricao" [unidade]="item.unidade ?? null" [valor]="quantidades()[item.idItem] ?? 0"
                    (valorChange)="definirQuantidade(item.idItem, $event, ponto)" />
                }
              </li>
            }
          </ul>
          @if (ponto.situacao !== 'FEITO' && liberacao() !== 'LIBERADA') {
            <div class="faixa faixa--detalhe" role="status">
              <geo-icone [nome]="liberacao() === 'IMPEDIDA' ? 'impedido' : 'escudo'" />
              <span>{{ liberacao() === 'IMPEDIDA' ? 'Registrado "sem condição de executar" nesta obra.' : 'Faça a APR do dia para marcar o que foi feito.' }}</span>
              <a class="geo-btn geo-btn--principal geo-btn--compacto" [routerLink]="['/obras', programacao()!.id, 'apr']">{{ liberacao() === 'IMPEDIDA' ? 'Nova APR' : 'Fazer APR' }}</a>
            </div>
          } @else if (ponto.situacao !== 'FEITO') {
            @if (ponto.situacao === 'A_FAZER' && antesQueFalta(); as v) {
              <p class="lembrete" role="status"><geo-icone nome="camera" [tamanho]="18" />Antes de começar, tire a foto “{{ v.item.titulo }}”: depois do serviço ela não dá mais para ser feita.</p>
            }
            @if (travaDeFoto(); as t) {
              <div class="faixa faixa--detalhe trava" role="alert" data-testid="trava-foto">
                <geo-icone nome="camera" />
                <span>{{ t }}</span>
              </div>
            }
            <div class="acoes">
              @if (!parcial()) {
                <button type="button" class="geo-btn geo-btn--principal" (click)="tudoFeito(ponto)" data-testid="tudo-feito">
                  <geo-icone nome="tudo_feito" />Tudo feito</button>
                <button type="button" class="geo-btn geo-btn--neutro" (click)="parcial.set(true)">Parcial</button>
              } @else {
                <button type="button" class="geo-btn geo-btn--principal" (click)="salvarParcial(ponto)" [disabled]="!temQuantidade()">Salvar parcial</button>
                <button type="button" class="geo-btn geo-btn--neutro" (click)="parcial.set(false)">Cancelar</button>
              }
            </div>
          }

          <h3 class="geo-secao fotos-titulo">Fotos do ponto
            @if (resumoFotos(); as r) { <span class="fotos-titulo__conta geo-num">{{ r }}</span> }</h3>
          @if (proxima(); as v) {
            <!-- Com outra ação principal na tela (APR, turno), o cartão fica suave: um botão forte por vez. -->
            <label class="proxima" [class.proxima--refazer]="v.situacao === 'REFAZER'" [class.proxima--suave]="outraAcaoPrincipal()"
              [class.processando]="preparando()" data-testid="proxima-foto">
              <input type="file" accept="image/*" capture="environment" [disabled]="preparando()" (change)="tirarProxima(ponto, v, $event)">
              <span class="proxima__icone"><geo-icone nome="camera" [tamanho]="26" /></span>
              <span class="proxima__texto">
                <span class="proxima__rotulo">{{ preparando() ? 'Preparando a foto…' : v.situacao === 'REFAZER' ? 'Refazer a foto' : 'Próxima foto' }}</span>
                <strong>{{ v.item.titulo }}</strong>
                <span class="proxima__apoio">{{ v.situacao === 'REFAZER' ? motivoLegivel(v.motivo)
                  : fotoAtrasada(v, ponto.situacao) ? 'Ficou faltando · era ' + rotuloEtapaFoto(v.etapa).toLowerCase() : rotuloEtapaFoto(etapaDaFoto(v.item, ponto.situacao)) }}</span>
              </span>
            </label>
          } @else if (vagas().length && !faltaAlguma()) {
            <p class="fotos-ok"><geo-icone nome="check" [tamanho]="18" />Todas as fotos pedidas neste ponto estão tiradas.</p>
          }
          @for (v of vagas(); track v.item.id) {
            <div class="foto-item" [class.foto-item--refazer]="v.situacao === 'REFAZER'">
              <div class="foto-item__titulo">
                <span class="foto-item__nome">{{ v.item.titulo }}
                  <span class="foto-item__momento">{{ rotuloEtapaFoto(v.etapa) }}{{ v.obrigatoria ? '' : ' · opcional' }}</span></span>
                @switch (v.situacao) {
                  @case ('REFAZER') { <span class="geo-etiqueta geo-etiqueta--erro">Refazer</span> }
                  @case ('FEITA') { <span class="geo-etiqueta geo-etiqueta--ok">{{ v.naFila ? 'Tirada · na fila' : 'Enviada' }}</span> }
                  @case ('FALTA') { @if (!v.cedo && (ponto.situacao !== 'A_FAZER' || v.etapa === 'ANTES')) { <span class="geo-etiqueta geo-etiqueta--atencao">Falta</span> } }
                }
              </div>
              @if (v.situacao === 'REFAZER' && proxima()?.item?.id !== v.item.id) { <p class="foto-item__motivo">Reprovada pelo escritório: {{ motivoLegivel(v.motivo) }}.</p> }
              @if (v.noServidor && !fotosDoItem(ponto.id, v.item.id).length) {
                <p class="foto-item__enviada"><geo-icone nome="check" [tamanho]="16" />{{ v.noServidor === 1 ? '1 foto já enviada' : v.noServidor + ' fotos já enviadas' }}. Tire outra só se precisar.</p>
              }
              <geo-fotos [rotulo]="v.item.titulo" [fotos]="fotosDoItem(ponto.id, v.item.id)" [rotuloCamera]="v.situacao === 'FEITA' ? 'Mais uma' : v.situacao === 'REFAZER' ? 'Outra foto' : 'Tirar foto'"
                [carimbo]="carimboNaHora(ponto, v.item.titulo, v.item)" [removivel]="false" [galeria]="false"
                (adicionada)="foto(ponto, v.item.id, $event, v.item)" (removida)="apagarFoto($event)" />
            </div>
          }
          <div class="foto-item">
            <div class="foto-item__titulo"><span class="foto-item__nome">Equipamento instalado (placa ou QR)
              <span class="foto-item__momento">Só quando houver equipamento</span></span></div>
            <geo-fotos rotulo="Equipamento instalado (placa ou QR)" [fotos]="fotosDoItem(ponto.id, 'EQUIPAMENTO')" [carimbo]="carimboNaHora(ponto, 'Equipamento ' + (serie() || ''), null)"
              [removivel]="false" (adicionada)="foto(ponto, 'EQUIPAMENTO', $event, null)" (removida)="apagarFoto($event)" />
            <div class="serie">
              <label class="geo-campo"><span>Série do equipamento</span>
                <input class="geo-input geo-num" [value]="serie()" (input)="serie.set($any($event.target).value)" maxlength="80" placeholder="Leia o QR ou digite"></label>
              <button type="button" class="geo-btn geo-btn--neutro" (click)="lendo.set(true)" aria-label="Ler série pelo QR"><geo-icone nome="qr" />Ler</button>
            </div>
          </div>
        </div>
      </ng-template>

      <geo-folha [aberta]="lendo()" titulo="Ler a série" (fechar)="lendo.set(false)">
        @if (lendo()) { <geo-leitor-codigo (lido)="serieLida($event)" /> }
      </geo-folha>
    } @else {
      <geo-barra-topo titulo="Execução" (voltar)="voltar()" />
      <geo-vazio icone="obra" titulo="Programação não está no aparelho" texto="Ela saiu da agenda (o dia passou, foi cancelada ou foi para outra equipe). O que já foi lançado continua salvo e é enviado.">
        <a class="geo-btn geo-btn--principal" routerLink="/hoje">Ir para Hoje</a>
      </geo-vazio>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .faixa { display: flex; gap: var(--geo-e3); align-items: center; margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); font: var(--geo-t-apoio); }
    .faixa span { flex: 1; }
    .faixa--detalhe { margin: var(--geo-e4) var(--geo-margem) 0; }
    .estado-item { flex: none; }
    .vista { padding: var(--geo-e3) var(--geo-margem) 0; }
    .colunas { flex: 1; display: block; padding-top: var(--geo-e3); }
    :host(.dividido) .colunas { display: grid; grid-template-columns: 3fr 2fr; gap: 0; min-height: 0; }
    :host(.dividido) .projeto, :host(.dividido) .lado { overflow-y: auto; }
    :host(.dividido) .projeto { display: flex; flex-direction: column; }
    :host(.dividido) .projeto app-projeto-pdf { flex: 1; --altura-projeto: none; }
    :host(.dividido) .lado { border-left: 1px solid var(--geo-linha); }
    .pontos .geo-linha { gap: var(--geo-e2); }
    .abrir { flex: 1; display: flex; align-items: center; gap: var(--geo-e3); min-width: 0; min-height: var(--geo-alvo); border: 0; background: none;
      color: inherit; text-align: left; font: inherit; cursor: pointer; padding: 0; }
    .progresso { display: grid; gap: 6px; margin: var(--geo-e2) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .progresso strong { color: var(--geo-texto); font-weight: 600; }
    .progresso__barra { height: 8px; border-radius: var(--geo-r-pilula); background: var(--geo-linha); overflow: hidden; }
    .progresso__barra span { display: block; height: 100%; background: var(--geo-ok); border-radius: inherit; transition: width 200ms var(--geo-curva); }
    .fazer { font: var(--geo-t-apoio); color: var(--geo-texto); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .proximo { margin-left: var(--geo-e2); vertical-align: middle; }
    .alem { margin-top: var(--geo-e3); }
    .nota { display: flex; align-items: center; gap: var(--geo-e2); margin: var(--geo-e3) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .detalhe { padding: 0 0 var(--geo-e6); }
    .detalhe__topo { display: flex; align-items: center; gap: var(--geo-e2); padding: var(--geo-e2) var(--geo-margem); }
    .detalhe__topo h2 { font: var(--geo-t-secao); }
    .itens { list-style: none; margin: 0; padding: 0 var(--geo-margem); display: grid; gap: var(--geo-e3); }
    .itens li { display: flex; align-items: center; gap: var(--geo-e3); min-height: var(--geo-alvo); }
    .item__texto { flex: 1; display: grid; gap: 2px; font: var(--geo-t-corpo); }
    .item__texto span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .acoes { display: flex; gap: var(--geo-e3); padding: var(--geo-e4) var(--geo-margem) 0; }
    .acoes .geo-btn { flex: 1; min-height: var(--geo-alvo-principal); }
    .nota { width: calc(100% - 2 * var(--geo-margem)); min-height: var(--geo-alvo); border: 0; border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave);
      padding: var(--geo-e2) var(--geo-e3); text-align: left; cursor: pointer; color: var(--geo-texto); touch-action: manipulation; }
    .nota span:first-of-type { flex: 1; }
    .nota__ir { font-weight: 600; color: var(--geo-destaque); }
    .refazer { color: var(--geo-erro); font-weight: 600; }
    .lembrete { display: flex; gap: var(--geo-e2); align-items: flex-start; margin: var(--geo-e4) var(--geo-margem) 0; padding: var(--geo-e3);
      border-radius: var(--geo-r-grupo); background: var(--geo-destaque-suave); font: var(--geo-t-apoio); color: var(--geo-texto); }
    .fotos-titulo { display: flex; align-items: baseline; justify-content: space-between; gap: var(--geo-e2); }
    .fotos-titulo__conta { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .proxima { position: relative; display: flex; align-items: center; gap: var(--geo-e3); margin: 0 var(--geo-margem); padding: var(--geo-e3) var(--geo-e4);
      min-height: calc(var(--geo-alvo) + var(--geo-e5)); border-radius: var(--geo-r-grupo); background: var(--geo-destaque); color: var(--geo-destaque-texto);
      cursor: pointer; -webkit-user-select: none; user-select: none; touch-action: manipulation; transition: transform 100ms var(--geo-curva); }
    .proxima:active { transform: scale(.98); }
    .proxima:focus-within { outline: 2px solid var(--geo-destaque); outline-offset: 3px; }
    .proxima--refazer { background: var(--geo-erro-forte); color: var(--geo-erro-forte-texto); }
    .proxima--suave { background: var(--geo-destaque-suave); color: var(--geo-destaque); border: 1.5px solid var(--geo-destaque); }
    .proxima--suave.proxima--refazer { background: var(--geo-erro-suave); color: var(--geo-erro); border-color: var(--geo-erro); }
    .proxima--suave .proxima__icone { background: var(--geo-superficie); }
    .proxima.processando { opacity: .7; cursor: progress; }
    .proxima input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .proxima__icone { flex: none; display: grid; place-items: center; width: var(--geo-alvo); height: var(--geo-alvo); border-radius: 50%;
      background: color-mix(in srgb, currentColor 18%, transparent); }
    .proxima__texto { display: grid; gap: 2px; min-width: 0; }
    .proxima__rotulo, .proxima__apoio { font: var(--geo-t-apoio); opacity: .92; }
    .proxima__texto strong { font: var(--geo-t-corpo-forte); }
    .fotos-ok { display: flex; align-items: center; gap: var(--geo-e2); margin: 0 var(--geo-margem); font: var(--geo-t-apoio); color: var(--geo-ok); }
    .foto-item { margin-top: var(--geo-e4); padding: 0 var(--geo-margem); }
    .foto-item--refazer { margin-left: var(--geo-margem); padding-left: calc(var(--geo-e3) - 3px); border-left: 3px solid var(--geo-erro); }
    .foto-item__titulo { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e2); margin-bottom: var(--geo-e2); font: var(--geo-t-corpo-forte); }
    .foto-item__nome { display: grid; gap: 2px; }
    .foto-item__momento { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .foto-item__motivo { margin: 0 0 var(--geo-e2); font: var(--geo-t-apoio); color: var(--geo-erro); }
    .foto-item__enviada { display: flex; align-items: center; gap: var(--geo-e2); margin: 0 0 var(--geo-e2); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .serie { display: flex; gap: var(--geo-e2); align-items: end; margin-top: var(--geo-e4); }
    .motivo { margin: var(--geo-e3) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .parcial { margin-left: var(--geo-e2); }
    .serie .geo-campo { flex: 1; margin: 0; }
  `],
})
export class ExecucaoComponent implements OnDestroy {
  readonly nomeLocais = nomeLocais;
  readonly ctx = inject(ObrasContexto);
  readonly layout = inject(LayoutService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly turno = inject(TurnoService);
  private readonly arquivos = inject(ArquivosCampoService);
  private readonly gps = inject(LocalizacaoService);
  private readonly tokens = inject(TokenService);

  readonly vistas = [{ valor: 'pontos' as Vista, rotulo: 'Pontos' }, { valor: 'projeto' as Vista, rotulo: 'Projeto' }];
  readonly vista = signal<Vista>('pontos');
  readonly rotuloEtapaFoto = rotuloEtapaFoto;
  readonly etapaDaFoto = etapaDaFoto;
  readonly fotoAtrasada = fotoAtrasada;
  readonly preparando = signal(false);
  readonly selecionado = signal<string | null>(null);
  readonly parcial = signal(false);
  readonly quantidades = signal<Record<string, number>>({});
  readonly serie = signal('');
  readonly lendo = signal(false);
  readonly pdf = signal<Blob | null>(null);
  readonly miniaturas = signal<Record<string, string>>({});
  private posicao: Posicao | null = null;

  readonly id = toSignal(this.rota.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly programacao = computed(() => this.ctx.pacote.programacao(this.id()));
  readonly obra = computed(() => this.ctx.pacote.obra(this.programacao()?.idObra));
  readonly pontos = computed(() => (this.programacao() ? this.ctx.pontos(this.programacao()!) : []));
  readonly feitos = computed(() => this.pontos().filter(p => p.situacao === 'FEITO').length);
  /** Pontos/vãos da obra com itens pendentes fora de qualquer programação (vêm no pacote). */
  readonly extras = computed(() => new Set((this.obra()?.itensExtras ?? []).map(i => i.idPonto ?? i.idVao)).size);
  /** O primeiro ponto ainda não feito, na ordem do projeto: o "próximo" que a equipe vê destacado. */
  readonly proximo = computed(() => this.pontos().find(p => p.situacao !== 'FEITO') ?? null);
  readonly liberacao = computed(() => (this.programacao() ? this.ctx.liberacao(this.programacao()!) : 'PENDENTE'));
  readonly pontoSelecionado = computed(() => this.pontos().find(p => p.id === this.selecionado()) ?? null);
  readonly itensFoto = computed(() => this.ctx.itensModelo(this.obra()));
  readonly pendencias = computed(() => {
    const obra = this.obra();
    if (!obra) return [];
    const feitos = this.pontos().filter(p => p.situacao !== 'A_FAZER').map(p => ({ id: p.id, rotulo: p.rotulo }));
    // Só os pontos desta tela: a obra pode ter pendências de outra programação (que aparecem lá).
    const daqui = new Set(this.pontos().map(p => p.id));
    return pendenciasDeFoto(obra, this.itensFoto(), feitos, this.ctx.registros.registros(), this.ctx.pacote.recebidoEm()).filter(x => daqui.has(x.idPonto));
  });
  /** Fotos do modelo do ponto aberto, na ordem do trabalho. */
  readonly vagas = computed<VagaFoto[]>(() => {
    const ponto = this.pontoSelecionado();
    if (!ponto) return [];
    return vagasDeFoto(ponto, this.itensFoto(), this.obra(), this.ctx.registros.registros(), this.pendencias());
  });
  readonly proxima = computed(() => {
    const ponto = this.pontoSelecionado();
    return ponto ? proximaFoto(this.vagas(), ponto.situacao) : null;
  });
  /** O modelo de fotos da obra trava o lançamento sem as obrigatórias (configurado no web, no modelo As Built). */
  readonly fotosTravam = computed(() => this.ctx.modeloFoto(this.obra())?.travaExecucao === true);
  /** Último "Tudo feito"/"Parcial" barrado pela trava; a mensagem some quando as fotos são tiradas ou o ponto muda. */
  private readonly barrado = signal<{ idPonto: string; lancamento: 'TUDO' | 'PARCIAL' } | null>(null);
  readonly travaDeFoto = computed(() => {
    const b = this.barrado();
    if (!b || b.idPonto !== this.selecionado() || !this.fotosTravam()) return null;
    const faltam = fotosQueTravam(this.vagas(), b.lancamento);
    if (!faltam.length) return null;
    return b.lancamento === 'TUDO'
      ? `Para marcar "Tudo feito", tire antes ${textoFotosQueFaltam(faltam)}.`
      : `Para salvar o parcial, tire antes ${textoFotosQueFaltam(faltam)}.`;
  });
  readonly faltaAlguma = computed(() => this.vagas().some(v => v.situacao === 'FALTA' || v.situacao === 'REFAZER'));
  /** "2 de 3 obrigatórias" no título da seção. */
  readonly resumoFotos = computed(() => {
    const obrigatorias = this.vagas().filter(v => v.obrigatoria);
    if (!obrigatorias.length) return '';
    return `${obrigatorias.filter(v => v.situacao === 'FEITA').length} de ${obrigatorias.length} ${obrigatorias.length === 1 ? 'obrigatória' : 'obrigatórias'}`;
  });
  /** Foto de "antes" que falta com o ponto ainda por fazer: o lembrete aparece junto do "Tudo feito". */
  readonly antesQueFalta = computed(() => this.vagas().find(v => v.etapa === 'ANTES' && v.situacao === 'FALTA') ?? null);
  /** Há outra ação forte na tela (APR a fazer ou turno fechado): o "Próxima foto" fica em versão suave. */
  readonly outraAcaoPrincipal = computed(() => this.liberacao() !== 'LIBERADA' || !this.turno.turnoAtivo());
  readonly refazerTotal = computed(() => this.pendencias().filter(p => p.motivoReprovacao).length);
  readonly marcadores = computed<MarcadorPonto[]>(() => {
    const doProjeto = new Map((this.obra()?.pontos ?? []).map(pt => [pt.id, pt]));
    const lista: MarcadorPonto[] = [];
    for (const p of this.pontos()) {
      if (p.ponto?.x != null && p.ponto?.y != null) {
        lista.push({ id: p.id, numero: p.ponto.numero, pagina: p.ponto.pagina ?? 1, x: Number(p.ponto.x), y: Number(p.ponto.y),
          situacao: p.situacao, pendencia: this.pendenciasDoPonto(p.id) > 0 });
      } else if (p.vao) {
        // Vão: marcador no meio dos dois pontos, para a equipe ver no projeto o que falta lançar.
        const a = doProjeto.get(p.vao.idPontoA);
        const b = doProjeto.get(p.vao.idPontoB);
        if (a?.x == null || a?.y == null || b?.x == null || b?.y == null || (a.pagina ?? 1) !== (b.pagina ?? 1)) continue;
        lista.push({ id: p.id, numero: `${a.numero}–${b.numero}`, pagina: a.pagina ?? 1, x: (Number(a.x) + Number(b.x)) / 2,
          y: (Number(a.y) + Number(b.y)) / 2, situacao: p.situacao, pendencia: false, vao: true });
      }
    }
    return lista;
  });
  readonly temQuantidade = computed(() => Object.values(this.quantidades()).some(v => v > 0));

  constructor() {
    effect(() => {
      const obra = this.obra();
      if (obra) untracked(() => void this.ctx.pacote.projeto(obra).then(b => this.pdf.set(b)));
    });
    effect(() => {
      // Miniaturas das fotos tiradas no aparelho e ainda não enviadas.
      const regs = this.ctx.registros.registros().filter(r => r.tipo === 'EVIDENCIA' && r.idProgramacao === this.id() && r.arquivo);
      untracked(() => void this.carregarMiniaturas(regs.map(r => ({ id: r.id, chave: r.arquivo!.chave }))));
    });
    effect(() => {
      const selecionado = this.selecionado();
      untracked(() => {
        // Ponto novo: posição nova para o carimbo (andando pela rede, a do ponto anterior pode estar a centenas de metros).
        if (selecionado) void this.gps.agora(5000).then(p => (this.posicao = p ?? this.posicao));
        this.parcial.set(false);
        this.quantidades.set({});
        this.materiaisAjustados.clear();
        this.serie.set('');
      });
    });
    void this.gps.agora(5000).then(p => (this.posicao = p));
    // Vindo de uma pendência (Hoje, aviso de foto reprovada): abre direto no ponto.
    const ponto = this.rota.snapshot.queryParamMap.get('ponto');
    if (ponto) this.selecionado.set(ponto);
  }

  ngOnDestroy(): void {
    Object.values(this.miniaturas()).forEach(u => URL.revokeObjectURL(u));
  }

  escolher(id: string): void {
    this.selecionado.set(id);
  }

  fotosPendentes(n: number): string {
    return n === 1 ? '1 foto pendente' : `${n} fotos pendentes`;
  }

  pendenciasDoPonto(id: string): number {
    return this.pendencias().filter(p => p.idPonto === id).length;
  }

  refazerDoPonto(id: string): number {
    return this.pendencias().filter(p => p.idPonto === id && p.motivoReprovacao).length;
  }

  /** O aviso de fotos pendentes leva ao primeiro ponto com foto reprovada ou faltando. */
  irParaPendencia(): void {
    const alvo = this.pendencias().find(p => p.motivoReprovacao) ?? this.pendencias()[0];
    if (alvo) this.selecionado.set(alvo.idPonto);
  }

  /** Os serviços do ponto em texto ("Instalar poste · Instalar cruzeta (3 UN)"): o que a equipe vai fazer ali. */
  oQueFazer(ponto: PontoDaExecucao): string {
    const servicos = ponto.itens.filter(i => i.tipo === 'SERVICO');
    if (!servicos.length) return 'Só material';
    return servicos.map(i => {
      const falta = Math.max(0, i.quantidade - i.feito);
      const qtd = i.feito > 0 && falta > 0 ? ` (faltam ${this.num(falta)}${i.unidade ? ' ' + i.unidade : ''})`
        : i.quantidade !== 1 ? ` (${this.num(i.quantidade)}${i.unidade ? ' ' + i.unidade : ''})` : '';
      return `${i.descricao}${qtd}`;
    }).join(' · ');
  }

  resumoMateriais(ponto: PontoDaExecucao): string {
    const n = ponto.itens.filter(i => i.tipo === 'MATERIAL').length;
    return n ? `${n} ${n === 1 ? 'material' : 'materiais'}` : '';
  }

  /** Serviços primeiro, depois materiais. */
  itensOrdenados(ponto: PontoDaExecucao) {
    return [...ponto.itens].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'SERVICO' ? -1 : 1));
  }

  resumoItens(ponto: PontoDaExecucao): string {
    const servicos = ponto.itens.filter(i => i.tipo === 'SERVICO').length;
    const materiais = ponto.itens.length - servicos;
    return [servicos ? `${servicos} ${servicos === 1 ? 'serviço' : 'serviços'}` : '', materiais ? `${materiais} ${materiais === 1 ? 'material' : 'materiais'}` : '']
      .filter(Boolean).join(' · ');
  }

  /** Com a trava ligada, barra o lançamento sem as fotos obrigatórias e abre o ponto na foto que falta. */
  private barradoPorFoto(ponto: PontoDaExecucao, lancamento: 'TUDO' | 'PARCIAL'): boolean {
    if (!this.fotosTravam() || ponto.vao) return false;
    const vagas = vagasDeFoto(ponto, this.itensFoto(), this.obra(), this.ctx.registros.registros(), this.pendencias());
    const faltam = fotosQueTravam(vagas, lancamento);
    if (!faltam.length) {
      this.barrado.set(null);
      return false;
    }
    if (this.selecionado() !== ponto.id) this.escolher(ponto.id);
    this.barrado.set({ idPonto: ponto.id, lancamento });
    return true;
  }

  async tudoFeito(ponto: PontoDaExecucao): Promise<void> {
    const p = this.programacao();
    if (!p || !this.podeApontar()) return;
    if (this.barradoPorFoto(ponto, 'TUDO')) return;
    const apr = aprQueLibera(p, this.ctx.hoje(), this.ctx.registros.registros());
    const r = await this.ctx.registros.registrar({
      tipo: 'APONTAMENTO', idObra: p.idObra, idProgramacao: p.id, idPonto: ponto.id, dependeDe: apr?.id ?? null,
      comando: { idProgramacao: p.id, idPonto: ponto.id, pontoInteiro: true, itens: null, idApr: apr?.id ?? null },
    });
    // Com o ponto pronto, o botão "Próxima foto" passa para as fotos de depois.
    const faltam = ponto.vao ? 0 : this.itensFoto().filter(i => i.obrigatoria && (i.etapa ?? 'DEPOIS') !== 'ANTES').length;
    this.toast.desfazer(`${ponto.rotulo}: tudo feito${faltam ? ' · agora as fotos de depois' : ''}`, () => void this.ctx.registros.desfazer(r.id));
  }

  /** Materiais que a equipe já ajustou à mão no parcial (o preenchimento automático não mexe neles). */
  private readonly materiaisAjustados = new Set<string>();

  definirQuantidade(idItem: string, valor: number, ponto?: PontoDaExecucao): void {
    const item = ponto?.itens.find(i => i.idItem === idItem);
    const novos: Record<string, number> = { [idItem]: valor };
    if (item?.tipo === 'MATERIAL') this.materiaisAjustados.add(idItem);
    // Serviço de um kit puxa o material do mesmo kit na mesma proporção (20 de 36,4 m de serviço → 20 m de cabo).
    if (item?.tipo === 'SERVICO' && item.kit && item.quantidade > 0) {
      for (const m of ponto!.itens.filter(i => i.tipo === 'MATERIAL' && i.kit === item.kit && !this.materiaisAjustados.has(i.idItem))) {
        const proporcional = Math.round((valor / item.quantidade) * m.quantidade * 100) / 100;
        novos[m.idItem] = Math.min(proporcional, Math.max(0, m.quantidade - m.feito));
      }
    }
    this.quantidades.update(q => ({ ...q, ...novos }));
  }

  async salvarParcial(ponto: PontoDaExecucao): Promise<void> {
    const p = this.programacao();
    if (!p || !this.podeApontar()) return;
    const itens = Object.entries(this.quantidades()).filter(([, q]) => q > 0).map(([idItem, quantidade]) => {
      const item = ponto.itens.find(i => i.idItem === idItem);
      const excede = item && item.feito + quantidade > item.quantidade;
      return { idItem, quantidade, justificativa: excede ? 'Executado além do previsto em campo.' : null };
    });
    if (!itens.length) return;
    if (this.barradoPorFoto(ponto, 'PARCIAL')) return;
    const apr = aprQueLibera(p, this.ctx.hoje(), this.ctx.registros.registros());
    const r = await this.ctx.registros.registrar({
      tipo: 'APONTAMENTO', idObra: p.idObra, idProgramacao: p.id, idPonto: ponto.id, dependeDe: apr?.id ?? null,
      comando: { idProgramacao: p.id, idPonto: ponto.id, pontoInteiro: false, itens, idApr: apr?.id ?? null },
    });
    this.parcial.set(false);
    this.quantidades.set({});
    this.materiaisAjustados.clear();
    this.toast.desfazer('Parcial registrado', () => void this.ctx.registros.desfazer(r.id));
  }

  /**
   * O carimbo é montado na hora da foto (a função roda quando a câmera devolve a imagem): hora e posição daquele
   * momento, não de quando a tela abriu. A etapa é a do modelo ou a da situação do ponto.
   */
  carimboNaHora(ponto: PontoDaExecucao, titulo: string, item: ItemFoto | null): () => Promise<Carimbo> {
    return async () => {
      // Sem posição ainda (tela recém-aberta), espera um pouco pelo GPS; sem sinal de satélite, o carimbo diz que não houve.
      if (!this.posicao) this.posicao = await this.gps.agora(3000);
      const etapa = { ANTES: 'Antes da execução', DURANTE: 'Durante a execução', DEPOIS: 'Depois da execução' }[etapaDaFoto(item, ponto.situacao)];
      return montarCarimbo({
        titulo: `Obra ${this.programacao()?.numeroObra ?? ''} · ${ponto.rotulo}`, detalhe: `${titulo} · ${etapa}`,
        data: new Date(), latitude: this.posicao?.latitude, longitude: this.posicao?.longitude, precisao: this.posicao?.precisao,
        autoria: this.autoria(), id: crypto.randomUUID(),
      });
    };
  }

  /** "CON-BNF-01 · DIEGO FERNANDES ARAÚJO": a equipe do turno e quem está no aparelho. */
  private autoria(): string {
    return [this.ctx.pacote.codigoEquipe() ?? this.turno.composicao()?.codigo, this.tokens.nomeUsuario()].filter(Boolean).join(' · ');
  }

  /** "Próxima foto": a câmera abre direto para o item que falta agora. */
  async tirarProxima(ponto: PontoDaExecucao, vaga: VagaFoto, evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0];
    entrada.value = '';
    if (!arquivo) return;
    this.preparando.set(true);
    try {
      const preparada = await prepararEvidencia(arquivo, { carimbo: await this.carimboNaHora(ponto, vaga.item.titulo, vaga.item)() });
      await this.foto(ponto, vaga.item.id, preparada, vaga.item);
    } finally {
      this.preparando.set(false);
    }
  }

  /**
   * Apaga a foto que ainda está na fila (tirada errada, borrada, do ponto errado). Desfazer devolve a mesma foto.
   * Foto que já começou a ser enviada não sai do aparelho por aqui.
   */
  async apagarFoto(id: string): Promise<void> {
    const r = this.ctx.registros.registros().find(x => x.id === id);
    if (!r) return;
    // Cópia em memória: o arquivo lido do aparelho é uma referência que deixa de valer quando ele é apagado.
    const lido = r.arquivo ? await this.arquivos.ler(r.arquivo.chave) : null;
    const blob = lido ? new Blob([await lido.arrayBuffer()], { type: r.arquivo!.tipo }) : null;
    if (!(await this.ctx.registros.desfazer(id))) {
      this.toast.warning('Esta foto já está sendo enviada; não dá mais para apagar.');
      return;
    }
    const { campo: _campo, ...comando } = r.comando;
    this.toast.desfazer('Foto apagada', () => {
      if (!blob || !r.arquivo) return;
      void this.ctx.registros.registrar({
        tipo: 'EVIDENCIA', idObra: r.idObra ?? undefined, idProgramacao: r.idProgramacao ?? undefined, idPonto: r.idPonto ?? undefined,
        posicao: this.posicao, comando, arquivo: { blob, nome: r.arquivo.nome, tipo: r.arquivo.tipo }, id: r.id,
      });
    });
  }

  /** "Fora de foco ou escura: carimbo ilegível" → "Fora de foco ou escura · carimbo ilegível". */
  motivoLegivel(motivo: string | null | undefined): string {
    return (motivo ?? '').replace(': ', ' · ');
  }

  /** Fotos tiradas no aparelho que ainda têm o arquivo (as enviadas saem do aparelho). */
  fotosDoItem(idPonto: string, idItem: string): FotoExibida[] {
    return this.registrosDaFoto(idPonto, idItem)
      .filter(r => !!this.miniaturas()[r.id])
      .map(r => ({ id: r.id, url: this.miniaturas()[r.id],
        estado: r.envio === 'ENVIADO' ? 'synced' : r.envio === 'CONFLITO' ? 'conflict' : r.envio === 'ENVIANDO' ? 'syncing' : 'queued',
        // Na fila do aparelho ainda dá para apagar (foto errada); enviada, não.
        removivel: r.envio === 'NO_APARELHO' } as FotoExibida));
  }

  private registrosDaFoto(idPonto: string, idItem: string) {
    const equipamento = idItem === 'EQUIPAMENTO';
    return this.ctx.registros.registros().filter(r => r.tipo === 'EVIDENCIA' && r.idPonto === idPonto
      && (equipamento ? !!(r.comando as { legenda?: string }).legenda?.startsWith('Equipamento') : (r.comando as { idItem?: string }).idItem === idItem));
  }

  async foto(ponto: PontoDaExecucao, idItem: string, foto: EvidenciaPreparada, item: ItemFoto | null = null): Promise<void> {
    const p = this.programacao();
    if (!p) return;
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de registrar fotos.');
      return;
    }
    const equipamento = idItem === 'EQUIPAMENTO';
    const modelo = this.ctx.modeloFoto(this.obra());
    const apontamento = this.ctx.registros.registros().filter(r => r.tipo === 'APONTAMENTO' && r.idPonto === ponto.id).at(-1);
    await this.ctx.registros.registrar({
      tipo: 'EVIDENCIA', idObra: p.idObra, idProgramacao: p.id, idPonto: ponto.id, posicao: this.posicao,
      comando: {
        idObra: p.idObra, idPonto: ponto.ponto ? ponto.id : null, idVao: ponto.vao ? ponto.id : null, idProgramacao: p.id,
        idApontamento: apontamento?.id ?? null, idModelo: equipamento ? null : modelo?.id ?? null, idItem: equipamento ? null : idItem,
        etapa: etapaDaFoto(item, ponto.situacao) satisfies EtapaFoto, legenda: equipamento ? `Equipamento${this.serie() ? ' · série ' + this.serie() : ''}` : null,
      },
      arquivo: { blob: foto.arquivo, nome: foto.nomeArquivo, tipo: foto.contentType },
      id: foto.idLocal,
    });
    // Avisa qual é a próxima, para a equipe seguir sem procurar.
    const proxima = this.proxima();
    this.toast.success(proxima && proxima.item.id !== idItem ? `Foto guardada · próxima: ${proxima.item.titulo}` : 'Foto guardada');
    void this.gps.agora(5000).then(p => (this.posicao = p ?? this.posicao));
  }

  serieLida(codigo: string): void {
    this.serie.set(codigo.trim());
    this.lendo.set(false);
    this.toast.info(`Série ${codigo.trim()} lida. Tire a foto da placa para registrar.`);
  }

  voltar(): void {
    void this.router.navigate(['/obras', this.id()]);
  }

  num(n: number): string {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  private podeApontar(): boolean {
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de apontar.');
      return false;
    }
    if (this.liberacao() !== 'LIBERADA') {
      this.toast.warning('Conclua a APR antes de marcar o que foi feito.');
      return false;
    }
    return true;
  }

  private async carregarMiniaturas(itens: { id: string; chave: string }[]): Promise<void> {
    const atuais = { ...this.miniaturas() };
    let mudou = false;
    for (const { id, chave } of itens) {
      if (atuais[id]) continue;
      const blob = await this.arquivos.ler(chave);
      if (blob) {
        atuais[id] = URL.createObjectURL(blob);
        mudou = true;
      }
    }
    if (mudou) this.miniaturas.set(atuais);
  }
}
