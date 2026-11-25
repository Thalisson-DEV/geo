import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { QuantidadeUnidadeComponent } from '../shared/quantidade-unidade.component';
import { daUnidadeBase } from '../shared/unidade-material';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoDrawerComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  NotificationService
} from '@geo/ui';
import { GeoAutocompleteComponent } from '@geo/ui/forms';

import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup as CursorRemoteLookup } from '../../../core/lookup/store/remote-lookup';
import {
  ConsumoAnteriorItem,
  EntregaSolicitacaoRequest,
  ItemSolicitacaoResponse,
  MaterialResponse,
  MotivoPendenciaResponse,
  SolicitacaoResponse
} from '../../../core/models/almoxarifado.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { RhService } from '../../../core/services/rh.service';
import { UsuarioLookupService } from '../../../core/services/usuario-lookup.service';
import { prazoRelativo, saqueAtrasado, statusComercial } from './solicitacao-comercial-status';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { navegarSaindoDoDrawer } from '../../../shared/utils/drawer-navegacao.utils';
import {
  ItemEntregaRascunho,
  montarEntregaDoRelatorio,
  quantidadeDaLinha,
  rascunhoDaEntrega
} from './relatorio-solicitacao-material/itens-solicitacao.util';
import {
  LinhaAprovacao,
  QUANTIDADE_MINIMA,
  linhaAlterada,
  montarAjustesAprovacao,
  problemaDaAprovacao,
  rascunhoDaAprovacao
} from './aprovacao-ajustes.util';
import { SeriesSelecaoComponent } from './series-selecao/series-selecao.component';
import { ConsumoAnteriorLinhaComponent } from './solicitacao-consumo-anterior/solicitacao-consumo-anterior.component';
import { ConsumoAnteriorOperacoesComponent } from './solicitacao-consumo-anterior/solicitacao-consumo-operacoes.component';
import { SolicitacaoOperacoesHistoricoComponent } from './solicitacao-operacoes-historico/solicitacao-operacoes-historico.component';
import { SolicitacaoPendenciaModalComponent } from './solicitacao-pendencia-modal.component';
import { SolicitacaoRejeicaoDialogComponent } from './solicitacao-rejeicao-dialog.component';
import { SolicitacaoTecnicaAssinaturaComponent } from './solicitacao-tecnica-assinatura/solicitacao-tecnica-assinatura.component';

const ehImagem = (valor: string) => valor.startsWith('data:image/');

/** `aprovacao` abre nos materiais, já ajustando o que a equipe pediu antes de aprovar. */
export type AbaDetalheComercial = 'itens' | 'entrega' | 'historico' | 'aprovacao';

interface EtapaFluxo {
  rotulo: string;
  estado: 'feito' | 'atual' | 'futuro' | 'interrompido';
  quando?: string | null;
  quem?: string | null;
  icone: string;
}

/**
 * Detalhe rápido de uma solicitação comercial, aberto a partir do quadro, da tabela ou do
 * calendário: fluxo, prazo, itens e as ações de quem aprova e de quem entrega, sem sair da tela.
 */
@Component({
  selector: 'app-solicitacao-comercial-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    QuantidadeUnidadeComponent,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    FormsModule,
    GeoAutocompleteComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoDrawerComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTabsComponent,
    GeoTabPanelDirective,
    ConsumoAnteriorLinhaComponent,
    ConsumoAnteriorOperacoesComponent,
    SeriesSelecaoComponent,
    SolicitacaoOperacoesHistoricoComponent,
    SolicitacaoPendenciaModalComponent,
    SolicitacaoRejeicaoDialogComponent,
    SolicitacaoTecnicaAssinaturaComponent
  ],
  styleUrl: './solicitacao-comercial-detalhe.component.css',
  template: `
    <geo-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      eyebrow="Solicitação comercial"
      [title]="detalhe()?.estoqueDestino?.nomeIdentificador ?? 'Carregando…'"
      size="lg"
      (closed)="aoFechar()"
    >
      @if (carregando() && !detalhe()) {
        <div class="dd-skeleton" role="status" aria-label="Carregando a solicitação">
          <span></span><span></span><span></span><span></span>
        </div>
      } @else if (erro()) {
        <geo-callout tone="danger" title="Não foi possível carregar a solicitação">{{ erro() }}</geo-callout>
      } @else if (detalhe(); as det) {
        <div class="dd">
          <section class="dd-hero" [attr.data-tone]="status().tone" aria-label="Resumo">
            <div class="dd-hero__topo">
              <geo-status [tone]="status().tone" [icon]="'pi ' + status().icon" emphasis="solid">{{ status().label }}</geo-status>
              @if (atrasada()) {
                <geo-status tone="danger" icon="pi pi-exclamation-triangle">Retirada atrasada</geo-status>
              }
              @if (det.foraPrazoSaque) {
                <geo-status tone="warning" icon="pi pi-clock">Fora do prazo de 48h</geo-status>
              }
              @if (det.possuiPendencia) {
                <geo-status tone="warning" icon="pi pi-flag">Com pendência</geo-status>
              }
            </div>
            <p class="dd-hero__rota">
              <i class="pi pi-building" aria-hidden="true"></i>
              <span>{{ det.estoqueOrigem.nomeIdentificador }}</span>
              <i class="pi pi-arrow-right dd-hero__seta" aria-hidden="true"></i>
              <strong>{{ det.estoqueDestino.nomeIdentificador }}</strong>
              @if (det.estoqueDestino.tipoEstoque.nome) {
                <span class="dd-hero__tipo">{{ det.estoqueDestino.tipoEstoque.nome }}</span>
              }
            </p>
            <p class="dd-hero__meta"><span class="dd-hero__id">#{{ idCurto() }}</span> · Pedida por <strong>{{ nome(det.idRequisitante) }}</strong> em {{ det.dataSolicitacao | date: "dd/MM/yyyy 'às' HH:mm" }}</p>
          </section>

          @if (aba() !== 'entrega' && !ajustando()) {
          <ol class="dd-fluxo" aria-label="Andamento">
            @for (etapa of fluxo(); track etapa.rotulo) {
              <li class="dd-fluxo__etapa" [attr.data-estado]="etapa.estado">
                <span class="dd-fluxo__marca"><i [class]="'pi ' + etapa.icone" aria-hidden="true"></i></span>
                <span class="dd-fluxo__texto">
                  <strong>{{ etapa.rotulo }}</strong>
                  @if (etapa.quando) { <span>{{ etapa.quando | date: 'dd/MM/yy HH:mm' }}</span> }
                  @if (etapa.quem) { <span class="dd-muted">{{ etapa.quem }}</span> }
                </span>
              </li>
            }
          </ol>

          <section class="dd-fatos" aria-label="Prazo e atendimento">
            <div class="dd-fato">
              <span class="dd-label">Retirada prevista</span>
              @if (det.dataPrevista) {
                <strong [class.dd-texto-alerta]="atrasada()">{{ det.dataPrevista | date: 'dd/MM/yyyy' }}</strong>
                <span class="dd-muted">{{ relativo() }}</span>
              } @else {
                <strong>Não agendado</strong>
              }
            </div>
            <div class="dd-fato">
              <span class="dd-label">Quem retira</span>
              <strong>{{ det.idColaboradorSaque ? nome(det.idColaboradorSaque) : 'Definido na entrega' }}</strong>
              @if (det.saqueForaEquipe) { <span class="dd-muted">Fora da equipe de destino</span> }
            </div>
            <div class="dd-fato dd-fato--largo">
              <span class="dd-label">Atendimento</span>
              <div class="dd-progresso" role="progressbar" [attr.aria-valuenow]="percentual()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="percentual() + '% entregue'">
                <span [style.width.%]="percentual()"></span>
              </div>
              <span class="dd-muted">
                <strong class="dd-forte">{{ totalEntregue() | number: '1.0-3' }}</strong> de {{ totalSolicitado() | number: '1.0-3' }} entregues · {{ percentual() }}%
              </span>
            </div>
          </section>
          }

          @if (det.encerrada && det.motivoEncerramento && det.status !== 'ENTREGUE') {
            <geo-callout tone="info" title="Saldo pendente encerrado">{{ det.motivoEncerramento }}</geo-callout>
          }
          @if (det.status === 'REJEITADO' && det.motivoRejeicao) {
            <geo-callout tone="danger" [title]="'Rejeitada: ' + det.motivoRejeicao.nome">{{ det.justificativaRejeicao || 'Sem justificativa registrada.' }}</geo-callout>
          }
          @if (det.motivoPendencia) {
            <geo-callout tone="warning" [title]="'Pendência: ' + det.motivoPendencia.nome">
              <div class="dd-callout-linha">
                <span>{{ det.justificativaPendencia || 'Sem justificativa informada.' }}</span>
                @if (podeRegistrarPendencia()) {
                  <geo-button label="Resolver pendência" icon="pi pi-check" variant="outline" size="sm" [loading]="executando()" (pressed)="resolverPendenciaGeral()" />
                }
              </div>
            </geo-callout>
          }
          @if (det.observacao) {
            <blockquote class="dd-obs"><span class="dd-label">Observação do requisitante</span>{{ det.observacao }}</blockquote>
          }

          @if (abas().length > 1) {
            <geo-tabs [(value)]="aba" [tabs]="abas()">
              <ng-template geoTabPanel="itens"><ng-container *ngTemplateOutlet="materiais" /></ng-template>

              @if (podeEntregar()) {
                <ng-template geoTabPanel="entrega">
                  <div class="dd-entrega">
                    <div class="dd-entrega__quem">
                      <geo-select
                        label="Sai de"
                        [options]="opcoesOrigem()"
                        [value]="origemEntrega().id"
                        (valueChange)="trocarOrigem($event)"
                        (opened)="carregarOrigens()"
                        [loading]="carregandoOrigens()"
                        [filter]="true"
                        [disabled]="!podeTrocarOrigem()"
                        [description]="podeTrocarOrigem() ? 'Almoxarifado de onde o material sai nesta entrega.' : 'Já saiu material daqui: a origem não muda mais, porque o estorno volta para ela.'"
                      />
                      @if (origemTrocada()) {
                        <geo-callout tone="warning" [title]="'Sai de ' + origemEntrega().nome + ' em vez de ' + det.estoqueOrigem.nomeIdentificador">
                          A solicitação passa a ser atendida por {{ origemEntrega().nome }}.@if (temSeriesReservadas()) { As séries definidas na origem anterior não valem aqui: escolha as séries de novo. }
                        </geo-callout>
                      }
                      <geo-boolean-control kind="toggle" label="Retirada por outra equipe"
                      description="Ligue quando quem retira não é da equipe de destino." [value]="saqueForaEquipe()" (valueChange)="alternarForaEquipe($event)" />
                      <div class="dd-grid-2">
                        <geo-select
                          label="Quem retira"
                          placeholder="Selecione"
                          [options]="saqueForaEquipe() ? colaboradoresGerais() : membrosEquipe()"
                          [(value)]="responsavelId"
                          [loading]="carregandoColaboradores()"
                          [filter]="true"
                          [required]="true"
                          [error]="tentouEntregar() && !responsavelId() ? 'Escolha quem retira o material.' : undefined"
                          [description]="!saqueForaEquipe() && !membrosEquipe().length && !carregandoColaboradores() ? 'A equipe de destino não tem membros ativos. Ligue a retirada por outra equipe.' : saqueForaEquipe() ? 'Qualquer colaborador ativo.' : 'Membros ativos da equipe de destino.'"
                        />
                        <geo-select label="Assinatura" [options]="opcoesAssinatura" [value]="assinatura()" (valueChange)="trocarAssinatura($event)" [required]="true" />
                      </div>
                      @if (assinatura() === 'DIGITAL') {
                        <div class="dd-assinaturas">
                          <app-solicitacao-tecnica-assinatura label="Almoxarifado (quem entrega)" [value]="assinaturaAlmox()" (valueChanged)="assinaturaAlmox.set($event)" />
                          <app-solicitacao-tecnica-assinatura label="Quem retira" [value]="assinaturaEquipe()" (valueChanged)="assinaturaEquipe.set($event)" />
                        </div>
                      }
                    </div>

                    <div class="dd-secao-topo">
                      <span class="dd-muted">{{ resumoEntrega() }}</span>
                      <span class="dd-linha-botoes">
                        <geo-button label="Entregar tudo o que falta" icon="pi pi-check-square" variant="ghost" size="sm" (pressed)="preencherTudo()" />
                        <geo-button label="Zerar" icon="pi pi-eraser" variant="ghost" size="sm" (pressed)="zerarTudo()" />
                      </span>
                    </div>

                    <ul class="dd-entrega__lista" aria-label="Materiais desta entrega">
                      @for (l of itensEntrega(); track l.chave; let i = $index) {
                        <li class="dd-entrega__item dd-aprov__item" [class.dd-aprov__item--removido]="l.removido">
                          <div class="dd-material">
                            <strong>{{ l.material.descricao }}</strong>
                            <span class="dd-muted">
                              {{ l.material.codigo }}
                              @if (l.idItem) { · falta {{ l.pendente | number: '1.0-3' }} {{ l.material.unidadeMedida || 'UN' }} de {{ l.solicitada | number: '1.0-3' }} }
                              @else { · {{ l.material.unidadeMedida || 'UN' }} }
                              @if (l.material.detalhaSerie) { · com nº de série }
                            </span>
                            @if (!l.idItem) {
                              <geo-status tone="brand" icon="pi pi-plus">Incluído nesta entrega</geo-status>
                            } @else if (l.removido) {
                              <geo-status tone="danger" icon="pi pi-trash">Sai da solicitação</geo-status>
                            }
                          </div>
                          <div class="dd-aprov__campos">
                            @if (!l.removido && !l.material.detalhaSerie) {
                              <app-quantidade-unidade
                                class="dd-aprov__quantidade"
                                [label]="'Quantidade de ' + l.material.codigo + ' que sai agora'"
                                [labelVisible]="false"
                                [material]="l.material"
                                [maxBase]="l.idItem ? l.pendente : undefined"
                                [value]="l.quantidade"
                                (valueChange)="definirQuantidade(i, $event)"
                                [unidade]="l.unidade ?? null"
                                (unidadeChange)="definirUnidade(i, $event)"
                                [error]="l.idItem && quantidadeDaLinha(l) > l.pendente ? 'Máximo ' + l.pendente + ' ' + (l.material.unidadeMedida || 'UN') : undefined"
                              />
                            }
                            @if (!l.idItem || podeTirarDaSolicitacao(l)) {
                              <geo-icon-button
                                [icon]="l.removido ? 'pi pi-undo' : 'pi pi-trash'"
                                [label]="(l.removido ? 'Manter ' : l.idItem ? 'Tirar da solicitação ' : 'Descartar ') + l.material.codigo"
                                [tooltip]="l.removido ? 'Manter na solicitação' : l.idItem ? 'Tirar da solicitação' : 'Descartar'"
                                size="icon-sm"
                                (pressed)="alternarRemocaoEntrega(i)"
                              />
                            }
                          </div>
                          @if (l.material.detalhaSerie && !l.removido) {
                            <div class="dd-entrega__series">
                              <app-series-selecao
                                [idSolicitacao]="det.id"
                                [origem]="origemEntrega()"
                                [material]="{ id: l.material.id, codigo: l.material.codigo, descricao: l.material.descricao }"
                                [maximo]="l.idItem ? l.pendente : (l.quantidade ?? 1)"
                                [selecionadas]="l.series"
                                (selecionadasChange)="definirSeries(i, $event)"
                              />
                            </div>
                          }
                        </li>
                      } @empty {
                        <li class="dd-muted">Nada falta entregar. Inclua um material abaixo para entregar a mais.</li>
                      }
                    </ul>

                    <ng-container *ngTemplateOutlet="adicionar; context: { $implicit: 'Sai junto nesta entrega e entra na solicitação.' }" />
                  </div>
                </ng-template>
              }

              @if (det.operacoes?.length) {
                <ng-template geoTabPanel="historico">
                  <app-solicitacao-operacoes-historico [operacoes]="det.operacoes!" [equipeNome]="det.estoqueDestino.nomeIdentificador" [recolhivel]="false" />
                </ng-template>
              }
            </geo-tabs>
          } @else {
            <section aria-labelledby="dd-materiais-titulo">
              <h3 id="dd-materiais-titulo" class="dd-titulo-secao"><i class="pi pi-box" aria-hidden="true"></i>Materiais</h3>
              <ng-container *ngTemplateOutlet="materiais" />
            </section>
          }

          <ng-template #materiais>
            @if (ajustando()) {
              <div class="dd-entrega__quem dd-aprov__data">
                <geo-datepicker
                  label="Data prevista do saque"
                  [value]="dataPrevistaAprovacao()"
                  (valueChange)="dataPrevistaAprovacao.set($event)"
                  [description]="dataAlterada() ? 'Antes: ' + (det.dataPrevista ? (det.dataPrevista | date: 'dd/MM/yyyy' : 'UTC') : 'não agendado') : 'Quando a equipe retira o material no almoxarifado.'"
                />
              </div>
              <div class="dd-secao-topo">
                <span class="dd-muted">{{ resumoAjustes() }}</span>
                <span class="dd-linha-botoes">
                  <geo-button label="Desfazer ajustes" icon="pi pi-undo" variant="ghost" size="sm" [disabled]="!temAjustes()" (pressed)="iniciarAjustes()" />
                  @if (podeRegistrarPendencia() && !det.motivoPendencia) {
                    <geo-button label="Apontar pendência geral" icon="pi pi-flag" variant="ghost" size="sm" (pressed)="abrirPendenciaGeral()" />
                  }
                </span>
              </div>
              <ul class="dd-entrega__lista" aria-label="Materiais em aprovação">
                @for (linha of rascunhoAprovacao(); track linha.chave; let i = $index) {
                  <li class="dd-entrega__item dd-aprov__item" [class.dd-aprov__item--removido]="linha.removido">
                    <div class="dd-material">
                      <strong>{{ linha.material.descricao }}</strong>
                      <span class="dd-muted">
                        {{ linha.material.codigo }} · {{ linha.material.unidadeMedida || 'UN' }}
                        @if (linha.material.detalhaSerie) { · com nº de série }
                        @if (linha.idItem) { · pedido {{ linha.pedido | number: '1.0-3' }} }
                      </span>
                      @if (!linha.idItem) {
                        <geo-status tone="brand" icon="pi pi-plus">Incluído na aprovação</geo-status>
                      } @else if (linha.removido) {
                        <geo-status tone="danger" icon="pi pi-trash">Sai da solicitação</geo-status>
                      } @else if (linha.quantidade !== linha.pedido) {
                        <geo-status tone="warning" icon="pi pi-pencil">Quantidade ajustada</geo-status>
                      }
                      @if (linha.idItem && !erroConsumo()) {
                        <app-consumo-anterior-linha
                          [consumo]="consumoPorMaterial()[linha.material.id] ?? null"
                          [unidade]="linha.material.unidadeMedida || 'UN'"
                          [carregando]="carregandoConsumo()"
                          [idControlado]="'dd-aprov-ops-' + linha.chave"
                          [aberto]="consumoAberto().has(linha.material.id)"
                          (alternar)="alternarConsumo(linha.material.id)"
                        />
                      }
                    </div>
                    <div class="dd-aprov__campos">
                      @if (!linha.removido) {
                        <geo-number-input
                          class="dd-aprov__quantidade"
                          [label]="'Quantidade aprovada de ' + linha.material.codigo"
                          [labelVisible]="false"
                          [suffix]="' ' + (linha.material.unidadeMedida || 'UN')"
                          [min]="0"
                          [maxFractionDigits]="3"
                          [value]="linha.quantidade"
                          (valueChange)="definirQuantidadeAprovada(i, $event)"
                          [error]="tentouAprovar() && (linha.quantidade ?? 0) < quantidadeMinima ? 'Informe a quantidade' : undefined"
                        />
                      }
                      <geo-icon-button
                        [icon]="linha.removido ? 'pi pi-undo' : 'pi pi-trash'"
                        [label]="(linha.removido ? 'Manter ' : 'Tirar da solicitação ') + linha.material.codigo"
                        [tooltip]="linha.removido ? 'Manter na solicitação' : 'Tirar da solicitação'"
                        size="icon-sm"
                        (pressed)="alternarRemocao(i)"
                      />
                    </div>
                    @if (linha.idItem && consumoAberto().has(linha.material.id)) {
                      <div class="dd-consumo-ops" [id]="'dd-aprov-ops-' + linha.chave">
                        <app-consumo-anterior-operacoes [idSolicitacao]="det.id" [idMaterial]="linha.material.id" [unidade]="linha.material.unidadeMedida || 'UN'" />
                      </div>
                    }
                  </li>
                }
              </ul>

              <ng-container *ngTemplateOutlet="adicionar; context: { $implicit: 'Entra na solicitação ao aprovar.' }" />
            } @else {
              <div class="dd-secao-topo">
                <span class="dd-muted">{{ det.itens.length }} {{ det.itens.length === 1 ? 'material' : 'materiais' }}</span>
                <span class="dd-linha-botoes">
                  @if (podeAprovar()) {
                    <geo-button label="Ajustar materiais e data" icon="pi pi-pencil" variant="ghost" size="sm" (pressed)="iniciarAjustes()" />
                  }
                  @if (podeRegistrarPendencia() && !det.motivoPendencia) {
                    <geo-button label="Apontar pendência geral" icon="pi pi-flag" variant="ghost" size="sm" (pressed)="abrirPendenciaGeral()" />
                  }
                </span>
              </div>
              <ng-container *ngTemplateOutlet="tabelaMateriais" />
            }
          </ng-template>

          <!-- Incluir material: o mesmo bloco na aprovação e na entrega -->
          <ng-template #adicionar let-dica>
              <div class="dd-aprov__adicionar">
                <span class="dd-label"><i class="pi pi-plus-circle" aria-hidden="true"></i> Adicionar material <span class="dd-aprov__dica">· {{ dica }}</span></span>
                <div class="dd-aprov__adicionar-campos">
                  <geo-autocomplete
                    class="dd-aprov__material"
                    label="Material a adicionar"
                    [labelVisible]="false"
                    [(ngModel)]="materialNovoId"
                    (ngModelChange)="selecionarMaterialNovo($event)"
                    [options]="materiaisOpcoes()"
                    [loading]="materiaisCarregando()"
                    [status]="materiaisStatus()"
                    [error]="materiaisErro()"
                    [minLength]="2"
                    [virtualScroll]="true"
                    [virtualScrollItemSize]="42"
                    [clearable]="true"
                    placeholder="Código ou descrição do material"
                    appendTo="body"
                    (search)="buscarMateriais($event)"
                    (loadMore)="carregarMaisMateriais()"
                    (retry)="tentarMateriaisDeNovo()"
                  />
                  <geo-number-input
                    class="dd-aprov__quantidade"
                    label="Quantidade a adicionar"
                    [labelVisible]="false"
                    placeholder="Qtd."
                    [min]="0"
                    [maxFractionDigits]="3"
                    [suffix]="materialNovo() ? ' ' + (materialNovo()!.unidadeMedida || 'UN') : ''"
                    [value]="quantidadeNova()"
                    (valueChange)="quantidadeNova.set($event)"
                  />
                  <geo-button label="Adicionar" icon="pi pi-plus" size="sm" variant="outline" [disabled]="!materialNovo() || (quantidadeNova() ?? 0) < quantidadeMinima" (pressed)="adicionarMaterial()" />
                </div>
                @if (materialNovo(); as m) {
                  <span class="dd-muted" aria-live="polite">
                    {{ m.codigo }} · {{ m.descricao }}
                    @if (saldoOrigemNovo() === undefined) {
                      · consultando o saldo em {{ origemDaInclusao().nome }}…
                    } @else if (saldoOrigemNovo() !== null) {
                      · {{ origemDaInclusao().nome }} tem <strong class="dd-forte">{{ saldoOrigemNovo() | number: '1.0-3' }} {{ m.unidadeMedida || 'UN' }}</strong>
                    }
                    @if (m.detalhaSerie && !ajustando()) { · escolha as séries na linha do material }
                  </span>
                }
              </div>
          </ng-template>

          <ng-template #tabelaMateriais>
              <div class="dd-tabela" role="table" aria-label="Materiais solicitados">
                <div class="dd-tabela__linha dd-tabela__cab" role="row">
                  <span role="columnheader">Material</span>
                  <span role="columnheader" class="dd-num">Pedido</span>
                  <span role="columnheader" class="dd-num">Entregue</span>
                  <span role="columnheader" class="dd-num">Falta</span>
                  <span role="columnheader"><span class="dd-sr">Ações</span></span>
                </div>
                @for (item of det.itens; track item.id) {
                  <div class="dd-tabela__linha" role="row">
                    <span role="cell" class="dd-material">
                      <strong>{{ item.material.descricao }}</strong>
                      <span class="dd-muted">
                        {{ item.material.codigo }} · {{ item.material.unidadeMedida || 'UN' }}
                        @if (item.material.detalhaSerie) { · com nº de série }
                      </span>
                      @if (item.motivoPendencia) {
                        <geo-status tone="warning" icon="pi pi-flag">{{ item.motivoPendencia.nome }}</geo-status>
                      } @else if (entregue(item) >= item.quantidade) {
                        <geo-status tone="success" icon="pi pi-check">Atendido</geo-status>
                      } @else if (entregue(item) > 0) {
                        <geo-status tone="warning" icon="pi pi-truck">Parcial</geo-status>
                      }
                      @if (podeDefinirSeries(item)) {
                        <span class="dd-reserva">
                          @if (item.seriesReservadas?.length) {
                            <geo-status tone="brand" icon="pi pi-lock">{{ item.seriesReservadas!.length }} de {{ pendente(item) | number: '1.0-0' }} {{ pendente(item) === 1 ? 'série definida' : 'séries definidas' }}</geo-status>
                          }
                          <button type="button" class="dd-reserva__botao" [attr.aria-expanded]="reservaAberta() === item.id" [attr.aria-controls]="'dd-reserva-' + item.id" (click)="alternarReserva(item)">
                            {{ reservaAberta() === item.id ? 'Fechar' : item.seriesReservadas?.length ? 'Alterar séries' : 'Definir séries' }}
                            <i class="pi" [class.pi-chevron-up]="reservaAberta() === item.id" [class.pi-chevron-down]="reservaAberta() !== item.id" aria-hidden="true"></i>
                          </button>
                        </span>
                      }
                      @if (!erroConsumo()) {
                        <app-consumo-anterior-linha
                          [consumo]="consumoPorMaterial()[item.material.id] ?? null"
                          [unidade]="item.material.unidadeMedida || 'UN'"
                          [carregando]="carregandoConsumo()"
                          [idControlado]="'dd-ops-' + item.id"
                          [aberto]="consumoAberto().has(item.material.id)"
                          (alternar)="alternarConsumo(item.material.id)"
                        />
                      }
                    </span>
                    <span role="cell" class="dd-num">{{ item.quantidade | number: '1.0-3' }}</span>
                    <span role="cell" class="dd-num">{{ entregue(item) | number: '1.0-3' }}</span>
                    <span role="cell" class="dd-num" [class.dd-texto-aviso]="pendente(item) > 0">{{ pendente(item) | number: '1.0-3' }}</span>
                    <span role="cell" class="dd-acao">
                      @if (podeRegistrarPendencia()) {
                        <geo-icon-button
                          [icon]="item.motivoPendencia ? 'pi pi-exclamation-triangle' : 'pi pi-flag'"
                          [label]="(item.motivoPendencia ? 'Ver ou resolver a pendência de ' : 'Apontar pendência em ') + item.material.codigo"
                          [tooltip]="item.motivoPendencia ? 'Ver ou resolver pendência' : 'Apontar pendência'"
                          size="icon-sm"
                          (pressed)="abrirPendenciaItem(item)"
                        />
                      }
                    </span>
                    @if (reservaAberta() === item.id) {
                      <div class="dd-consumo-ops dd-reserva__painel" role="cell" [id]="'dd-reserva-' + item.id">
                        <p class="dd-muted dd-reserva__texto">
                          As séries definidas ficam reservadas para esta solicitação: não saem de {{ det.estoqueOrigem.nomeIdentificador }} por outro caminho. Na entrega, é só confirmar.
                        </p>
                        <app-series-selecao
                          [idSolicitacao]="det.id"
                          [origem]="{ id: det.estoqueOrigem.id, nome: det.estoqueOrigem.nomeIdentificador }"
                          [material]="{ id: item.material.id, codigo: item.material.codigo, descricao: item.material.descricao }"
                          [maximo]="pendente(item)"
                          [(selecionadas)]="reservaRascunho"
                        />
                        <span class="dd-linha-botoes dd-reserva__acoes">
                          <geo-button label="Cancelar" variant="ghost" size="sm" (pressed)="reservaAberta.set(null)" />
                          <geo-button label="Salvar séries" icon="pi pi-lock" size="sm" [loading]="salvandoReserva()" (pressed)="salvarReserva(item)" />
                        </span>
                      </div>
                    }
                    @if (consumoAberto().has(item.material.id)) {
                      <div class="dd-consumo-ops" role="cell" [id]="'dd-ops-' + item.id">
                        <app-consumo-anterior-operacoes [idSolicitacao]="det.id" [idMaterial]="item.material.id" [unidade]="item.material.unidadeMedida || 'UN'" />
                      </div>
                    }
                  </div>
                }
              </div>
          </ng-template>
        </div>
      }

      <div drawer-footer class="dd-rodape">
        <span class="dd-linha-botoes">
          <geo-icon-button icon="pi pi-external-link" label="Abrir relatório completo" tooltip="Relatório completo" (pressed)="abrirRelatorio()" />
          <geo-icon-button icon="pi pi-print" label="Imprimir a solicitação" tooltip="Imprimir" (pressed)="imprimir()" />
          @if (copiloto()) {
            <geo-icon-button icon="pi pi-compass" label="Analisar esta solicitação com a Bússola" tooltip="Analisar com a Bússola" (pressed)="pedirAnalise()" />
          }
        </span>
        <span class="dd-linha-botoes">
          @if (aba() === 'entrega' && podeEntregar()) {
            <geo-button label="Voltar" variant="ghost" (pressed)="aba.set('itens')" />
            <geo-button
              [label]="'Confirmar entrega' + (itensMarcados() ? ' (' + itensMarcados() + ')' : '')"
              icon="pi pi-check-circle"
              [loading]="salvandoEntrega()"
              [disabled]="!itensMarcados()"
              (pressed)="confirmarEntrega()"
            />
          } @else if (ajustando()) {
            <geo-button label="Cancelar ajustes" variant="ghost" [disabled]="executando()" (pressed)="sairDosAjustes()" />
            <geo-button [label]="temAjustes() ? 'Aprovar com ajustes' : 'Aprovar'" icon="pi pi-check" [loading]="executando()" (pressed)="aprovar()" />
          } @else {
            @if (podeRejeitar()) {
              <geo-button [label]="detalhe()?.status === 'PENDENTE' ? 'Reprovar' : 'Rejeitar'" icon="pi pi-times" variant="outline" [disabled]="executando()" (pressed)="rejeicaoAberta.set(true)" />
            }
            @if (podeAprovar()) {
              <geo-button label="Aprovar" icon="pi pi-check" [loading]="executando()" (pressed)="aprovar()" />
            } @else if (podeEntregar()) {
              <geo-button label="Registrar entrega" icon="pi pi-truck" (pressed)="irParaEntrega()" />
            } @else {
              <geo-button label="Fechar" variant="ghost" (pressed)="visible.set(false)" />
            }
          }
        </span>
      </div>
    </geo-drawer>

    <app-solicitacao-rejeicao-dialog [(visible)]="rejeicaoAberta" [idSolicitacao]="detalhe()?.id ?? null" [reprovar]="detalhe()?.status === 'PENDENTE'" (rejeitada)="aoAlterar()" />

    @if (detalhe(); as det) {
      <app-solicitacao-pendencia-modal
        [(visible)]="pendenciaAberta"
        [idSolicitacao]="det.id"
        [idItem]="pendenciaItemId()"
        [itemLabel]="pendenciaItemRotulo()"
        [motivoAtual]="pendenciaMotivo()"
        [justificativaAtual]="pendenciaJustificativa()"
        (pendenciaSalva)="aoAlterar()"
        (pendenciaResolvida)="aoAlterar()"
      />
    }
  `
})
export class SolicitacaoComercialDetalheComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly rh = inject(RhService);
  private readonly usuarios = inject(UsuarioLookupService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly lookupStore = inject(LookupStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  readonly solicitacaoId = input<string | null>(null);
  readonly abaInicial = input<AbaDetalheComercial>('itens');
  /** Aprovou, rejeitou, entregou ou mexeu em pendência: quem abriu recarrega. */
  readonly alterado = output<void>();
  /** Mostra o atalho de análise quando o usuário pode usar a Bússola. */
  readonly copiloto = input(false);
  /** "Analisar": a tela abre a Bússola ao lado com o contexto desta solicitação. */
  readonly analisar = output<{ id: string; rotulo: string; pergunta: string }>();

  protected readonly detalhe = signal<SolicitacaoResponse | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly executando = signal(false);
  protected readonly aba = signal<string>('itens');

  protected readonly rejeicaoAberta = signal(false);
  protected readonly pendenciaAberta = signal(false);
  protected readonly pendenciaItemId = signal<string | null>(null);
  protected readonly pendenciaItemRotulo = signal<string | null>(null);
  protected readonly pendenciaMotivo = signal<MotivoPendenciaResponse | null>(null);
  protected readonly pendenciaJustificativa = signal<string | null>(null);

  /** Gestor ajustando o que a equipe pediu antes de aprovar. */
  protected readonly ajustando = signal(false);
  /** Aberto pelo "Aprovar" do quadro ou do relatório: entra direto nos ajustes. */
  private ajustarAoCarregar = false;
  /** Data prevista do saque escolhida na aprovação. */
  protected readonly dataPrevistaAprovacao = signal<Date | null>(null);
  protected readonly dataAlterada = computed(() => {
    const escolhida = dataIso(this.dataPrevistaAprovacao());
    return !!escolhida && escolhida !== (this.detalhe()?.dataPrevista?.substring(0, 10) ?? null);
  });
  protected readonly rascunhoAprovacao = signal<LinhaAprovacao[]>([]);
  protected readonly tentouAprovar = signal(false);
  protected readonly quantidadeMinima = QUANTIDADE_MINIMA;
  protected readonly materialNovoId = signal<string | null>(null);
  protected readonly materialNovo = signal<MaterialResponse | null>(null);
  protected readonly quantidadeNova = signal<number | null>(null);
  /** Saldo do material escolhido na origem; `undefined` enquanto consulta, `null` se falhou. */
  protected readonly saldoOrigemNovo = signal<number | null | undefined>(undefined);
  protected readonly temAjustes = computed(() => this.dataAlterada() || this.rascunhoAprovacao().some(linhaAlterada));
  protected readonly resumoAjustes = computed(() => {
    const linhas = this.rascunhoAprovacao();
    const partes: string[] = [];
    const ajustadas = linhas.filter((l) => l.idItem && !l.removido && l.quantidade !== l.pedido).length;
    const incluidas = linhas.filter((l) => !l.idItem).length;
    const retiradas = linhas.filter((l) => l.removido).length;
    if (ajustadas) partes.push(`${ajustadas} ${ajustadas === 1 ? 'quantidade ajustada' : 'quantidades ajustadas'}`);
    if (incluidas) partes.push(`${incluidas} ${incluidas === 1 ? 'material incluído' : 'materiais incluídos'}`);
    if (retiradas) partes.push(`${retiradas} ${retiradas === 1 ? 'material retirado' : 'materiais retirados'}`);
    if (this.dataAlterada()) partes.push('data da retirada alterada');
    const resumo = partes.join(' · ');
    return resumo ? resumo.charAt(0).toUpperCase() + resumo.slice(1) : 'Antes de aprovar, mude a data ou a quantidade, tire um material pela lixeira ou inclua outro abaixo.';
  });
  private readonly materialLookup = new CursorRemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchMaterials({ query, cursor }),
    selectedValues: () => {
      const id = this.materialNovoId();
      return id ? [id] : [];
    },
    destroyRef: this.destroyRef
  });
  protected readonly materiaisOpcoes = this.materialLookup.items;
  protected readonly materiaisCarregando = this.materialLookup.loading;
  protected readonly materiaisStatus = this.materialLookup.status;
  protected readonly materiaisErro = computed(() => {
    const erro = this.materialLookup.error();
    return erro ? getErrorMessage(erro) : undefined;
  });

  /** Consumo de cada material desde a última solicitação do mesmo estoque (por id do material). */
  protected readonly consumoPorMaterial = signal<Record<string, ConsumoAnteriorItem>>({});
  protected readonly carregandoConsumo = signal(false);
  protected readonly erroConsumo = signal(false);
  /** Item com o painel de definir séries aberto e o rascunho das séries escolhidas. */
  protected readonly reservaAberta = signal<string | null>(null);
  protected readonly reservaRascunho = signal<string[]>([]);
  protected readonly salvandoReserva = signal(false);

  /** Material com série, ainda com saldo a entregar, em solicitação que aceita entrega. */
  protected podeDefinirSeries(item: ItemSolicitacaoResponse): boolean {
    return !!item.material.detalhaSerie && this.pendente(item) > 0 && this.podeEntregar();
  }

  protected alternarReserva(item: ItemSolicitacaoResponse): void {
    if (this.reservaAberta() === item.id) return this.reservaAberta.set(null);
    this.reservaRascunho.set([...(item.seriesReservadas ?? [])]);
    this.reservaAberta.set(item.id);
  }

  protected salvarReserva(item: ItemSolicitacaoResponse): void {
    const det = this.detalhe();
    if (!det || this.salvandoReserva()) return;
    this.salvandoReserva.set(true);
    this.almoxarifado.definirSeriesReservadas(det.id, item.id, this.reservaRascunho()).subscribe({
      next: (series) => {
        this.salvandoReserva.set(false);
        this.reservaAberta.set(null);
        this.notificacoes.success(
          series.length
            ? `${series.length} ${series.length === 1 ? 'série reservada' : 'séries reservadas'} para ${item.material.codigo}. Na entrega, é só confirmar.`
            : `Séries de ${item.material.codigo} liberadas.`
        );
        this.aoAlterar();
      },
      error: (err) => {
        this.salvandoReserva.set(false);
        this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível salvar as séries' });
      }
    });
  }

  /** Materiais com as operações do consumo abertas abaixo do item. */
  protected readonly consumoAberto = signal<ReadonlySet<string>>(new Set());

  /** O que sai nesta entrega: o que falta de cada material, mais o que o almoxarifado incluir. */
  protected readonly itensEntrega = signal<ItemEntregaRascunho[]>([]);
  protected readonly quantidadeDaLinha = quantidadeDaLinha;
  protected readonly responsavelId = signal<string | null>(null);
  protected readonly saqueForaEquipe = signal(false);
  protected readonly assinatura = signal<'FISICA' | 'DIGITAL'>('FISICA');
  protected readonly membrosEquipe = signal<GeoSelectOption<string>[]>([]);
  protected readonly colaboradoresGerais = signal<GeoSelectOption<string>[]>([]);
  protected readonly carregandoColaboradores = signal(false);
  protected readonly salvandoEntrega = signal(false);
  protected readonly tentouEntregar = signal(false);
  /** Assinaturas desenhadas no dispositivo (PNG em data URL), quando a entrega é digital. */
  protected readonly assinaturaAlmox = signal('');
  protected readonly assinaturaEquipe = signal('');

  // Quem entrega pode trocar o almoxarifado que atende, antes da primeira saída
  private readonly origensCarregadas = signal<GeoSelectOption<string>[]>([]);
  protected readonly carregandoOrigens = signal(false);
  protected readonly idOrigemEntrega = signal<string | null>(null);
  protected readonly origemEntrega = computed(() => {
    const atual = this.detalhe()?.estoqueOrigem;
    const id = this.idOrigemEntrega() ?? atual?.id ?? '';
    if (id === atual?.id) return { id, nome: atual.nomeIdentificador };
    return { id, nome: this.origensCarregadas().find((o) => o.value === id)?.label ?? '' };
  });
  /** Antes de abrir a lista, o select mostra só a origem atual. */
  protected readonly opcoesOrigem = computed<GeoSelectOption<string>[]>(() => {
    const atual = this.detalhe()?.estoqueOrigem;
    if (this.origensCarregadas().length) return this.origensCarregadas();
    return atual ? [{ label: atual.nomeIdentificador, value: atual.id }] : [];
  });
  protected readonly origemTrocada = computed(() => this.origemEntrega().id !== this.detalhe()?.estoqueOrigem?.id);
  /** O estorno devolve à origem da solicitação: depois da primeira saída ela não muda mais. */
  protected readonly podeTrocarOrigem = computed(() => !(this.detalhe()?.itens ?? []).some((i) => this.entregue(i) > 0));
  protected readonly temSeriesReservadas = computed(() => (this.detalhe()?.itens ?? []).some((i) => i.seriesReservadas?.length));

  protected carregarOrigens(): void {
    if (this.origensCarregadas().length || this.carregandoOrigens()) return;
    this.carregandoOrigens.set(true);
    this.almoxarifado.listarEstoquesAtivos().subscribe({
      next: (res) => {
        const idDestino = this.detalhe()?.estoqueDestino?.id;
        this.origensCarregadas.set(
          (res.content ?? [])
            .filter((e) => e.ativo && e.tipoEstoque?.nome?.toUpperCase() === 'FISICO' && e.id !== idDestino)
            .map((e) => ({ label: e.nomeIdentificador, value: e.id }))
        );
        this.carregandoOrigens.set(false);
      },
      error: () => this.carregandoOrigens.set(false)
    });
  }

  protected trocarOrigem(id: string | null): void {
    if (!id || id === this.origemEntrega().id) return;
    this.idOrigemEntrega.set(id);
    // As séries escolhidas eram da origem anterior.
    this.itensEntrega.update((itens) => itens.map((it) => (it.series.length ? { ...it, series: [] } : it)));
  }

  protected trocarAssinatura(tipo: 'FISICA' | 'DIGITAL' | null): void {
    this.assinatura.set(tipo ?? 'FISICA');
    this.assinaturaAlmox.set('');
    this.assinaturaEquipe.set('');
  }

  protected readonly opcoesAssinatura: GeoSelectOption<'FISICA' | 'DIGITAL'>[] = [
    { label: 'Física — termo em papel', value: 'FISICA' },
    { label: 'Digital — no dispositivo', value: 'DIGITAL' }
  ];

  protected readonly idCurto = computed(() => (this.detalhe()?.id ?? this.solicitacaoId() ?? '').substring(0, 8));
  protected readonly status = computed(() => statusComercial(this.detalhe()?.status));
  protected readonly atrasada = computed(() => saqueAtrasado(this.detalhe()));
  protected readonly relativo = computed(() => {
    const prevista = this.detalhe()?.dataPrevista;
    return prevista ? prazoRelativo(prevista) : '';
  });

  protected readonly totalSolicitado = computed(() => (this.detalhe()?.itens ?? []).reduce((a, i) => a + (Number(i.quantidade) || 0), 0));
  protected readonly totalEntregue = computed(() => (this.detalhe()?.itens ?? []).reduce((a, i) => a + this.entregue(i), 0));
  protected readonly percentual = computed(() => {
    const total = this.totalSolicitado();
    return total > 0 ? Math.min(100, Math.round((this.totalEntregue() / total) * 100)) : 0;
  });
  protected readonly itensMarcados = computed(() => this.itensEntrega().filter((l) => quantidadeDaLinha(l) > 0).length);
  protected readonly resumoEntrega = computed(() => {
    const linhas = this.itensEntrega();
    const naLista = linhas.filter((l) => !l.removido).length;
    const partes = [`${this.itensMarcados()} de ${naLista} ${naLista === 1 ? 'material sai' : 'materiais saem'} agora`];
    const incluidos = linhas.filter((l) => !l.idItem).length;
    const retirados = linhas.filter((l) => l.removido).length;
    if (incluidos) partes.push(`${incluidos} ${incluidos === 1 ? 'incluído' : 'incluídos'}`);
    if (retirados) partes.push(`${retirados} ${retirados === 1 ? 'tirado' : 'tirados'} da solicitação`);
    return partes.join(' · ');
  });
  /** De onde sai o material incluído: a origem da solicitação na aprovação, a da entrega no balcão. */
  protected readonly origemDaInclusao = computed(() => {
    const origem = this.detalhe()?.estoqueOrigem;
    return this.ajustando() ? { id: origem?.id ?? '', nome: origem?.nomeIdentificador ?? '' } : this.origemEntrega();
  });

  /** A política de ações do backend é a fonte de verdade; sem ela, cai na regra pelo status. */
  private pode(acao: string, status: string[]): boolean {
    const det = this.detalhe();
    if (!det) return false;
    if (det.acoesPermitidas) return det.acoesPermitidas.includes(acao);
    return !det.encerrada && status.includes(det.status);
  }
  protected readonly podeAprovar = computed(() => this.pode('APROVAR', ['PENDENTE']));
  protected readonly podeRejeitar = computed(() => this.pode('REJEITAR', ['PENDENTE', 'APROVADO']));
  protected readonly podeEntregar = computed(() => this.pode('ENTREGAR', ['APROVADO', 'ENTREGUE_PARCIAL']));
  protected readonly podeRegistrarPendencia = computed(() => {
    const det = this.detalhe();
    return !!det && !det.encerrada && ['PENDENTE', 'APROVADO', 'ENTREGUE_PARCIAL'].includes(det.status);
  });

  protected readonly abas = computed<readonly GeoTabItem[]>(() => {
    const det = this.detalhe();
    const abas: GeoTabItem[] = [{ value: 'itens', label: 'Materiais', icon: 'pi pi-box', badge: det?.itens.length || undefined }];
    if (this.podeEntregar()) abas.push({ value: 'entrega', label: 'Registrar entrega', icon: 'pi pi-truck' });
    if (det?.operacoes?.length) abas.push({ value: 'historico', label: 'Histórico', icon: 'pi pi-history', badge: det.operacoes.length });
    return abas;
  });

  protected readonly fluxo = computed<EtapaFluxo[]>(() => {
    const det = this.detalhe();
    if (!det) return [];
    const rejeitada = det.status === 'REJEITADO';
    const aprovada = !!det.dataVerificacao && !rejeitada;
    const entregueTotal = det.status === 'ENTREGUE';
    const entregaIniciada = entregueTotal || det.status === 'ENTREGUE_PARCIAL' || det.status === 'ESTORNADO';
    const etapas: EtapaFluxo[] = [
      { rotulo: 'Solicitada', estado: 'feito', quando: det.dataSolicitacao, quem: this.nome(det.idRequisitante), icone: 'pi-send' },
      rejeitada
        ? { rotulo: 'Rejeitada', estado: 'interrompido', quando: det.dataVerificacao, quem: det.idAprovador ? this.nome(det.idAprovador) : null, icone: 'pi-times' }
        : aprovada
          ? { rotulo: 'Aprovada', estado: 'feito', quando: det.dataVerificacao, quem: det.idAprovador ? this.nome(det.idAprovador) : null, icone: 'pi-check' }
          : { rotulo: 'Aguardando aprovação', estado: 'atual', icone: 'pi-clock' }
    ];
    if (!rejeitada) {
      etapas.push({
        rotulo: entregueTotal ? 'Entregue' : det.status === 'ESTORNADO' ? 'Estornada' : entregaIniciada ? 'Entregue em parte' : aprovada ? 'Aguardando retirada' : 'Entrega',
        estado: entregueTotal || det.status === 'ESTORNADO' ? 'feito' : aprovada ? 'atual' : 'futuro',
        quando: det.dataEntrega,
        quem: det.idEntregadorAlmox ? this.nome(det.idEntregadorAlmox) : null,
        icone: det.status === 'ESTORNADO' ? 'pi-replay' : 'pi-truck'
      });
    }
    return etapas;
  });

  protected readonly perguntaCopiloto = computed(() => {
    const det = this.detalhe();
    return det
      ? `Analisar status, disponibilidade e o consumo desde a última solicitação dos materiais da solicitação comercial #${this.idCurto()} de ${det.estoqueOrigem.nomeIdentificador} para ${det.estoqueDestino.nomeIdentificador}`
      : '';
  });

  constructor() {
    effect(() => {
      const id = this.solicitacaoId();
      if (!this.visible() || !id) return;
      const aba = this.abaInicial();
      untracked(() => {
        this.ajustarAoCarregar = aba === 'aprovacao';
        this.aba.set(aba === 'aprovacao' ? 'itens' : aba);
        this.carregar(id);
      });
    });
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.carregarConsumo(id);
    this.almoxarifado.buscarSolicitacaoPorId(id).subscribe({
      next: (det) => {
        this.detalhe.set(det);
        this.prepararEntrega(det);
        this.carregando.set(false);
        // A aba de entrega só existe enquanto há saldo a entregar.
        if (this.aba() === 'entrega' && !this.podeEntregar()) this.aba.set('itens');
        if (this.ajustarAoCarregar && this.podeAprovar()) this.iniciarAjustes();
        this.ajustarAoCarregar = false;
      },
      error: (err) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(err));
      }
    });
  }

  protected alternarConsumo(idMaterial: string): void {
    this.consumoAberto.update((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(idMaterial)) proximo.add(idMaterial);
      return proximo;
    });
  }

  private carregarConsumo(id: string): void {
    this.consumoAberto.set(new Set());
    this.carregandoConsumo.set(true);
    this.erroConsumo.set(false);
    this.almoxarifado.buscarConsumoAnterior(id).subscribe({
      next: (r) => {
        this.consumoPorMaterial.set(Object.fromEntries((r.itens ?? []).map((i) => [i.idMaterial, i])));
        this.carregandoConsumo.set(false);
      },
      // Informação de apoio: sem ela o detalhe segue normal.
      error: () => {
        this.consumoPorMaterial.set({});
        this.erroConsumo.set(true);
        this.carregandoConsumo.set(false);
      }
    });
  }

  protected entregue(item: ItemSolicitacaoResponse): number {
    return item.quantidadeEntregaLiquida ?? item.quantidadeEntregue ?? 0;
  }

  protected pendente(item: ItemSolicitacaoResponse): number {
    return item.quantidadePendente ?? Math.max(0, item.quantidade - this.entregue(item));
  }

  protected nome(id?: string | null): string {
    return this.usuarios.resolverNome(id, 'Não informado');
  }

  private prepararEntrega(det: SolicitacaoResponse): void {
    this.tentouEntregar.set(false);
    this.idOrigemEntrega.set(null);
    this.trocarAssinatura('FISICA');
    this.itensEntrega.set(rascunhoDaEntrega(det.itens));
    this.responsavelId.set(det.idColaboradorSaque ?? null);
    const equipe = det.idEquipe || det.estoqueDestino?.idEquipe;
    this.saqueForaEquipe.set(!!det.saqueForaEquipe || !equipe);
    if (this.saqueForaEquipe()) this.carregarColaboradoresGerais();
    else if (equipe) this.carregarMembros(equipe);
  }

  protected irParaEntrega(): void {
    this.aba.set('entrega');
  }

  protected definirQuantidade(indice: number, valor: number | null): void {
    this.itensEntrega.update((itens) =>
      itens.map((l, i) => {
        if (i !== indice) return l;
        const nova = { ...l, quantidade: valor };
        return l.idItem ? nova : { ...nova, solicitada: quantidadeDaLinha(nova), pendente: quantidadeDaLinha(nova) };
      })
    );
  }

  protected definirUnidade(indice: number, unidade: string | null): void {
    this.itensEntrega.update((itens) =>
      itens.map((l, i) => {
        if (i !== indice) return l;
        // A mesma quantidade física, mostrada na nova unidade.
        const base = quantidadeDaLinha(l);
        const nova = { ...l, unidade, quantidade: l.quantidade ? daUnidadeBase(l.material, base, unidade) : l.quantidade };
        return l.idItem ? nova : { ...nova, solicitada: quantidadeDaLinha(nova), pendente: quantidadeDaLinha(nova) };
      })
    );
  }

  protected definirSeries(indice: number, series: string[]): void {
    this.itensEntrega.update((itens) => itens.map((l, i) => (i === indice ? { ...l, series } : l)));
  }

  /** Entrega todo o saldo do material comum; o material com série sai com as séries já escolhidas. */
  protected preencherTudo(): void {
    this.itensEntrega.update((itens) => itens.map((l) => (l.material.detalhaSerie || l.removido || !l.idItem ? l : { ...l, quantidade: l.pendente })));
  }

  protected zerarTudo(): void {
    this.itensEntrega.update((itens) => itens.map((l) => (l.idItem ? { ...l, quantidade: 0, series: [] } : l)));
  }

  /** Só sai da solicitação o material que ainda não teve entrega nenhuma. */
  protected podeTirarDaSolicitacao(l: ItemEntregaRascunho): boolean {
    return !!l.idItem && l.jaEntregue <= 0;
  }

  /** O incluído na hora sai da lista; o que a equipe pediu fica marcado e pode voltar. */
  protected alternarRemocaoEntrega(indice: number): void {
    this.itensEntrega.update((itens) =>
      itens[indice]?.idItem ? itens.map((l, i) => (i === indice ? { ...l, removido: !l.removido } : l)) : itens.filter((_, i) => i !== indice)
    );
  }

  protected alternarForaEquipe(fora: boolean): void {
    const det = this.detalhe();
    const equipe = det?.idEquipe || det?.estoqueDestino?.idEquipe;
    if (!fora && !equipe) {
      this.notificacoes.warning('O estoque de destino não tem equipe vinculada; o saque precisa ser por alguém de fora.');
      return;
    }
    this.saqueForaEquipe.set(fora);
    this.responsavelId.set(null);
    if (fora && !this.colaboradoresGerais().length) this.carregarColaboradoresGerais();
    if (!fora && equipe && !this.membrosEquipe().length) this.carregarMembros(equipe);
  }

  private carregarMembros(equipe: string): void {
    this.carregandoColaboradores.set(true);
    this.rh.listarMembrosAtivos(equipe).subscribe({
      next: (membros) => {
        const opcoes = (membros ?? []).map((m) => ({ label: m.nomeColaborador, value: m.idColaborador }));
        this.membrosEquipe.set(opcoes);
        if (!this.responsavelId() && opcoes.length === 1) this.responsavelId.set(opcoes[0].value);
        this.carregandoColaboradores.set(false);
      },
      error: () => {
        this.membrosEquipe.set([]);
        this.carregandoColaboradores.set(false);
      }
    });
  }

  private carregarColaboradoresGerais(): void {
    this.carregandoColaboradores.set(true);
    this.rh.listarColaboradores({ ativo: true, size: 200, sort: 'nomeCompleto,asc' }).subscribe({
      next: (res) => {
        this.colaboradoresGerais.set((res?.content ?? []).map((c) => ({ label: c.nomeCompleto, value: c.id })));
        this.carregandoColaboradores.set(false);
      },
      error: () => {
        this.colaboradoresGerais.set([]);
        this.carregandoColaboradores.set(false);
      }
    });
  }

  // --- Aprovação com ajustes: quantidades, inclusão e retirada de materiais ---

  protected iniciarAjustes(): void {
    this.rascunhoAprovacao.set(rascunhoDaAprovacao(this.detalhe()?.itens));
    this.dataPrevistaAprovacao.set(dataLocal(this.detalhe()?.dataPrevista));
    this.tentouAprovar.set(false);
    this.limparMaterialNovo();
    this.ajustando.set(true);
  }

  protected sairDosAjustes(): void {
    this.ajustando.set(false);
    this.rascunhoAprovacao.set([]);
    this.dataPrevistaAprovacao.set(null);
    this.tentouAprovar.set(false);
    this.limparMaterialNovo();
  }

  protected definirQuantidadeAprovada(indice: number, valor: number | null): void {
    this.rascunhoAprovacao.update((linhas) => linhas.map((l, i) => (i === indice ? { ...l, quantidade: valor } : l)));
  }

  /** O incluído na hora sai da lista; o que a equipe pediu fica marcado e pode voltar. */
  protected alternarRemocao(indice: number): void {
    this.rascunhoAprovacao.update((linhas) =>
      linhas[indice]?.idItem ? linhas.map((l, i) => (i === indice ? { ...l, removido: !l.removido } : l)) : linhas.filter((_, i) => i !== indice)
    );
  }

  protected selecionarMaterialNovo(id: string | null): void {
    this.materialNovo.set(null);
    this.saldoOrigemNovo.set(undefined);
    const origem = this.origemDaInclusao().id;
    if (!id) return;
    this.almoxarifado.buscarMaterialPorId(id).subscribe({
      next: (material) => {
        if (this.materialNovoId() === id) this.materialNovo.set(material);
      },
      error: () => {
        if (this.materialNovoId() === id) this.materialNovo.set(null);
      }
    });
    if (!origem) return this.saldoOrigemNovo.set(null);
    this.almoxarifado
      .listarSaldos({ idEstoque: origem, idMaterial: id, condicao: 'NOVO', ativo: true, size: 1 })
      .pipe(
        map((res) => Number(res.content?.[0]?.quantidade ?? 0)),
        catchError(() => of(null))
      )
      .subscribe((saldo) => {
        if (this.materialNovoId() === id) this.saldoOrigemNovo.set(saldo);
      });
  }

  protected adicionarMaterial(): void {
    const material = this.materialNovo();
    const quantidade = this.quantidadeNova();
    if (!material || quantidade === null || quantidade < QUANTIDADE_MINIMA) {
      return this.notificacoes.warning('Escolha o material e informe a quantidade.');
    }
    if (!this.ajustando()) return this.incluirNaEntrega(material, quantidade);
    const existente = this.rascunhoAprovacao().find((l) => l.material.id === material.id);
    if (existente && !existente.removido) {
      return this.notificacoes.warning(`${material.codigo} já está na solicitação: ajuste a quantidade na linha dele.`);
    }
    if (existente) {
      // Estava marcado para sair: volta com a quantidade informada.
      this.rascunhoAprovacao.update((linhas) => linhas.map((l) => (l === existente ? { ...l, removido: false, quantidade } : l)));
    } else {
      this.rascunhoAprovacao.update((linhas) => [
        ...linhas,
        { chave: `novo-${material.id}`, idItem: null, material, pedido: 0, quantidade, removido: false }
      ]);
    }
    this.limparMaterialNovo();
  }

  private incluirNaEntrega(material: MaterialResponse, quantidade: number): void {
    const existente = this.itensEntrega().find((l) => l.material.id === material.id);
    if (existente && !existente.removido) {
      return this.notificacoes.warning(`${material.codigo} já está na entrega: ajuste a quantidade na linha dele.`);
    }
    if (existente) {
      // Estava marcado para sair da solicitação: volta com a quantidade informada.
      this.itensEntrega.update((itens) => itens.map((l) => (l === existente ? { ...l, removido: false, quantidade: Math.min(quantidade, l.pendente) } : l)));
    } else {
      this.itensEntrega.update((itens) => [
        ...itens,
        { chave: `novo-${material.id}`, idItem: null, material, solicitada: quantidade, jaEntregue: 0, pendente: quantidade, quantidade, series: [] }
      ]);
    }
    this.limparMaterialNovo();
  }

  private limparMaterialNovo(): void {
    this.materialNovoId.set(null);
    this.materialNovo.set(null);
    this.quantidadeNova.set(null);
    this.saldoOrigemNovo.set(undefined);
  }

  protected buscarMateriais(termo: string): void {
    this.materialLookup.search(termo);
  }

  protected carregarMaisMateriais(): void {
    this.materialLookup.loadNext();
  }

  protected tentarMateriaisDeNovo(): void {
    this.materialLookup.retry();
  }

  protected aprovar(): void {
    const det = this.detalhe();
    if (!det || this.executando()) return;
    const comAjustes = this.ajustando() && this.temAjustes();
    if (this.ajustando()) {
      this.tentouAprovar.set(true);
      const problema = problemaDaAprovacao(this.rascunhoAprovacao());
      if (problema) return this.notificacoes.warning(problema);
    }
    this.executando.set(true);
    const pedido = comAjustes
      ? { ...montarAjustesAprovacao(this.rascunhoAprovacao()), ...(this.dataAlterada() ? { dataPrevista: dataIso(this.dataPrevistaAprovacao())! } : {}) }
      : {};
    this.almoxarifado.aprovarSolicitacao(det.id, pedido).subscribe({
      next: () => {
        this.executando.set(false);
        this.sairDosAjustes();
        this.notificacoes.success(
          comAjustes
            ? `Solicitação #${this.idCurto()} aprovada com os ajustes. Ela agora aguarda retirada.`
            : `Solicitação #${this.idCurto()} aprovada. Ela agora aguarda retirada.`
        );
        this.aoAlterar();
      },
      error: (err) => {
        this.executando.set(false);
        this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível aprovar' });
      }
    });
  }

  protected confirmarEntrega(): void {
    const det = this.detalhe();
    if (!det || this.salvandoEntrega()) return;
    this.tentouEntregar.set(true);
    const linhas = this.itensEntrega();
    if (!this.responsavelId()) return this.notificacoes.warning('Escolha quem retira o material.');
    const incluidoVazio = linhas.find((l) => !l.idItem && quantidadeDaLinha(l) <= 0);
    if (incluidoVazio) {
      return this.notificacoes.warning(
        `${incluidoVazio.material.codigo}: ${incluidoVazio.material.detalhaSerie ? 'escolha as séries' : 'informe a quantidade'} ou descarte o material incluído.`
      );
    }
    if (!this.itensMarcados()) return this.notificacoes.warning('Informe a quantidade de ao menos um item.');
    const excedido = linhas.find((l) => l.idItem && quantidadeDaLinha(l) > l.pendente);
    if (excedido) return this.notificacoes.warning(`${excedido.material.codigo}: a quantidade passa do que falta entregar.`);

    const digital = this.assinatura() === 'DIGITAL';
    if (digital && !(ehImagem(this.assinaturaAlmox()) && ehImagem(this.assinaturaEquipe())))
      return this.notificacoes.warning('Colete as duas assinaturas digitais: almoxarifado e quem retira.');

    const pedido: EntregaSolicitacaoRequest = {
      assinaturaAlmox: digital ? this.assinaturaAlmox() : 'FISICA',
      assinaturaEquipe: digital ? this.assinaturaEquipe() : 'FISICA',
      idColaboradorSaque: this.responsavelId()!,
      saqueForaEquipe: this.saqueForaEquipe(),
      ...montarEntregaDoRelatorio(linhas),
      ...(this.origemTrocada() ? { idEstoqueOrigem: this.origemEntrega().id } : {})
    };
    this.salvandoEntrega.set(true);
    this.almoxarifado.registrarEntrega(det.id, pedido).subscribe({
      next: () => {
        this.salvandoEntrega.set(false);
        const completa = linhas.filter((l) => l.idItem && !l.removido).every((l) => quantidadeDaLinha(l) >= l.pendente);
        this.notificacoes.success(completa ? 'Entrega registrada. A solicitação foi concluída.' : 'Entrega parcial registrada. O saldo continua aguardando retirada.');
        this.aba.set('itens');
        this.aoAlterar();
      },
      error: (err) => {
        this.salvandoEntrega.set(false);
        this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível registrar a entrega' });
      }
    });
  }

  protected abrirPendenciaGeral(): void {
    const det = this.detalhe();
    if (!det) return;
    this.pendenciaItemId.set(null);
    this.pendenciaItemRotulo.set(null);
    this.pendenciaMotivo.set(det.motivoPendencia ?? null);
    this.pendenciaJustificativa.set(det.justificativaPendencia ?? null);
    this.pendenciaAberta.set(true);
  }

  protected abrirPendenciaItem(item: ItemSolicitacaoResponse): void {
    this.pendenciaItemId.set(item.id);
    this.pendenciaItemRotulo.set(`${item.material.codigo} — ${item.material.descricao}`);
    this.pendenciaMotivo.set(item.motivoPendencia ?? null);
    this.pendenciaJustificativa.set(item.justificativaPendencia ?? null);
    this.pendenciaAberta.set(true);
  }

  protected resolverPendenciaGeral(): void {
    const det = this.detalhe();
    if (!det || this.executando()) return;
    this.executando.set(true);
    this.almoxarifado.removerPendencia(det.id).subscribe({
      next: () => {
        this.executando.set(false);
        this.notificacoes.success('Pendência resolvida.');
        this.aoAlterar();
      },
      error: (err) => {
        this.executando.set(false);
        this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível resolver a pendência' });
      }
    });
  }

  /** Recarrega o detalhe e avisa quem abriu para atualizar a lista/quadro/calendário. */
  protected aoAlterar(): void {
    const det = this.detalhe();
    if (det) this.carregar(det.id);
    this.alterado.emit();
  }

  protected pedirAnalise(): void {
    const det = this.detalhe();
    if (det) this.analisar.emit({ id: det.id, rotulo: `Solicitação #${this.idCurto()}`, pergunta: this.perguntaCopiloto() });
  }

  protected abrirRelatorio(): void {
    const id = this.detalhe()?.id ?? this.solicitacaoId();
    if (!id) return;
    this.visible.set(false);
    void navegarSaindoDoDrawer(() => this.router.navigate(['/almoxarifado/solicitacoes', id]));
  }

  protected imprimir(): void {
    const id = this.detalhe()?.id ?? this.solicitacaoId();
    if (!id) return;
    const url = this.router.serializeUrl(this.router.createUrlTree(['/almoxarifado/solicitacoes', id], { queryParams: { mode: 'print' } }));
    window.open(url, '_blank', 'noopener');
  }

  protected aoFechar(): void {
    this.sairDosAjustes();
    this.detalhe.set(null);
    this.consumoPorMaterial.set({});
    this.consumoAberto.set(new Set());
    this.erro.set(null);
  }
}

