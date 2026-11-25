import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ItemComandoTecnicoRequest } from '../../../core/models/solicitacao-material-tecnica.models';
import { QuantidadeUnidadeComponent } from '../shared/quantidade-unidade.component';
import { daUnidadeBase, paraUnidadeBase } from '../shared/unidade-material';
import { TrocaOcorrenciaDrawerComponent } from './troca-ocorrencia-drawer.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import {
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoDrawerComponent,
  GeoFormDrawerComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTabItem,
  GeoTone,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';

import { MaterialResponse, MotivoPendenciaResponse } from '../../../core/models/almoxarifado.models';
import { ObraResponse } from '../../../core/models/obras.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import {
  AcaoPermitidaSolicitacao,
  ConfirmarDevolucaoTecnicaRequest,
  ConfirmarEntregaTecnicaRequest,
  ItemSolicitacaoTecnicaResponse,
  RegistrarReservaTecnicaRequest,
  OperacaoSolicitacaoTecnicaResponse,
  SolicitacaoMaterialDetalheResponse,
  TipoSolicitacaoTecnica
} from '../../../core/models/solicitacao-material-tecnica.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { ObrasService } from '../../../core/services/obras.service';
import { RhService } from '../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
import { UsuarioLookupService } from '../../../core/services/usuario-lookup.service';
import { navegarSaindoDoDrawer } from '../../../shared/utils/drawer-navegacao.utils';
import { SeriesSelecaoComponent } from './series-selecao/series-selecao.component';
import { prazoRelativo } from './solicitacao-comercial-status';
import { SolicitacaoPendenciaModalComponent } from './solicitacao-pendencia-modal.component';
import { SolicitacaoRejeicaoDialogComponent } from './solicitacao-rejeicao-dialog.component';
import { SolicitacaoTecnicaAssinaturaComponent } from './solicitacao-tecnica-assinatura/solicitacao-tecnica-assinatura.component';
import { SolicitacaoTecnicaHistoricoComponent } from './solicitacao-tecnica-historico/solicitacao-tecnica-historico.component';
import { possuiMovimentacaoAtendimento, separacaoLabel, separacaoTone, tipoTecnicoEhAdicao, tipoTecnicoIcon, tipoTecnicoLabel } from './solicitacao-tecnica-presentation';
import { AvisoSaldoNegativoEquipeComponent, SaldoNegativoMaterial, agruparSaldosNegativos } from '../shared/saldo-negativo-equipe';
import { situacaoAtual, statusTecnicoDef } from './solicitacao-tecnica-situacao';

const ehImagem = (valor: string) => valor.startsWith('data:image/');
const MINIMO_MOTIVO = 5;

interface EtapaFluxo {
  rotulo: string;
  estado: 'feito' | 'atual' | 'futuro' | 'interrompido';
  quando?: string | null;
  quem?: string | null;
  icone: string;
}

/** Abas do detalhe: as ações de planejar/editar e de entregar ficam dentro do próprio painel, como no comercial. */
export type AbaDetalheTecnico = 'itens' | 'planejamento' | 'entrega' | 'devolucao' | 'historico';

/** Decisão aberta por cima do detalhe assim que ele carrega (pedida pelo relatório). */
export type AcaoInicialDetalheTecnico = 'ENCERRAR_SALDO' | 'ESTORNAR' | 'RESERVA';

interface ItemPlano {
  idItem: string | null;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number | null;
  /** Já saiu material deste item: não pode ser removido nem ficar abaixo do entregue. */
  minimo: number;
}

interface ItemEntrega {
  idItemSolicitacao: string;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string;
  detalhaSerie: boolean;
  quantidadeSolicitada: number;
  quantidadePendente: number;
  /** Na unidade escolhida (a do material ou uma equivalente). */
  quantidadeAEntregar: number | null;
  /** Unidade escolhida; nula = unidade do material. */
  unidadeEscolhida?: string | null;
  material: MaterialResponse;
  series: string[];
}

/** Devolução (222/922): volta do estoque da obra para o almoxarifado, com a condição do material. */
interface ItemDevolucao {
  idItemSolicitacao: string;
  codigo: string;
  descricao: string;
  unidade: string;
  detalhaSerie: boolean;
  quantidadePendente: number;
  quantidade: number | null;
  condicao: 'NOVO' | 'SUCATA';
  /** Material seriado: uma série por linha. */
  series: string;
}

interface ItemEstorno {
  idItemOperacaoOriginal: string;
  codigo: string;
  descricao: string;
  numeroSerie: string | null;
  disponivel: number;
  quantidade: number | null;
}

/**
 * Detalhe da solicitação técnica no mesmo padrão do comercial: resumo, andamento, prazo e
 * atendimento, materiais e histórico. Planejar/editar e registrar a entrega são abas do próprio
 * painel; rejeitar, encerrar saldo e estornar abrem um painel de decisão por cima.
 */
@Component({
  selector: 'app-solicitacao-tecnica-detalhe-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    QuantidadeUnidadeComponent,
    TrocaOcorrenciaDrawerComponent,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoDrawerComponent,
    GeoFormDrawerComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTabsComponent,
    GeoTabPanelDirective,
    GeoTextInputComponent,
    GeoTextareaComponent,
    SeriesSelecaoComponent,
    SolicitacaoPendenciaModalComponent,
    SolicitacaoRejeicaoDialogComponent,
    SolicitacaoTecnicaAssinaturaComponent,
    SolicitacaoTecnicaHistoricoComponent,
    AvisoSaldoNegativoEquipeComponent
  ],
  styleUrl: './solicitacao-comercial-detalhe.component.css',
  styles: `
    .dt-plano-item { display: grid; grid-template-columns: minmax(0, 1fr) 9rem auto; gap: 0.75rem; align-items: end; }
    .dt-adicionar { display: grid; grid-template-columns: minmax(0, 1fr) 9rem auto; gap: 0.75rem; align-items: end; padding-top: 0.25rem; }
    .dt-origem { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.375rem; margin: 0; font-size: 0.8125rem; color: var(--geo-foreground-muted); }
    .dt-origem strong { color: var(--geo-foreground); font-weight: 600; }
    .dt-form { display: grid; gap: 1rem; }
    .dt-estorno-item { display: grid; grid-template-columns: minmax(0, 1fr) 9rem; gap: 0.75rem; align-items: end; }
    .dt-devolucao-item { display: grid; grid-template-columns: minmax(0, 1fr) 10rem; gap: 0.75rem; align-items: end; }
    @media (max-width: 40rem) {
      .dt-plano-item, .dt-adicionar, .dt-estorno-item, .dt-devolucao-item { grid-template-columns: minmax(0, 1fr); }
    }
  `,
  template: `
    <geo-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      eyebrow="Solicitação técnica"
      [title]="tituloObra()"
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
              <geo-status [tone]="situacao().tone" [icon]="'pi ' + situacao().icon" emphasis="solid">{{ situacao().label }}</geo-status>
              @if (det.tecnico?.tipoTecnico; as tipo) {
                <geo-status tone="info" [icon]="tipoTecnicoIcon(tipo)">{{ tipoTecnicoLabel(tipo) }}</geo-status>
              }
              @if (det.tecnico?.atrasada) {
                <geo-status tone="danger" icon="pi pi-exclamation-triangle">Retirada atrasada</geo-status>
              }
              @if (det.possuiPendencia) {
                <geo-status tone="warning" icon="pi pi-flag">Com pendência</geo-status>
              }
            </div>
            <p class="dd-hero__rota">
              <i class="pi pi-building" aria-hidden="true"></i>
              <span>{{ almoxarifadoNome() }}</span>
              <i class="pi pi-arrow-right dd-hero__seta" aria-hidden="true"></i>
              <strong>{{ equipeNome() }}</strong>
              @if (obra()?.tipoObraNome) {
                <span class="dd-hero__tipo">{{ obra()!.tipoObraNome }}</span>
              }
            </p>
            <p class="dd-hero__meta"><span class="dd-hero__id">#{{ idCurto() }}</span> · Pedida por <strong>{{ nome(det.idRequisitante) }}</strong> em {{ det.dataSolicitacao | date: "dd/MM/yyyy 'às' HH:mm" }}@if (det.tecnico?.numeroProgramacao) { · gerada pela <strong>programação #{{ det.tecnico!.numeroProgramacao }}</strong> }</p>
          </section>

          @if (aba() !== 'entrega' && aba() !== 'planejamento') {
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
                @if (det.tecnico?.dataPrevista) {
                  <strong [class.dd-texto-alerta]="det.tecnico?.atrasada">{{ det.tecnico!.dataPrevista | date: 'dd/MM/yyyy' : 'UTC' }}</strong>
                  <span class="dd-muted">{{ relativo() }}</span>
                } @else {
                  <strong>A planejar</strong>
                  <span class="dd-muted">Defina a data no planejamento</span>
                }
              </div>
              <div class="dd-fato">
                <span class="dd-label">Quem retira</span>
                <strong>{{ det.tecnico?.idColaboradorSaque ? colaboradorNome() : 'Definido na entrega' }}</strong>
                @if (det.tecnico?.saqueForaEquipe) { <span class="dd-muted">Fora da equipe</span> }
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
              @if (det.tecnico?.reserva; as reserva) {
                <div class="dd-fato dd-fato--largo">
                  <span class="dd-label">Reserva</span>
                  <strong>{{ reserva.numero }}</strong>
                  <span class="dd-muted">
                    @if (reserva.dataCriacao) { Emitida em {{ reserva.dataCriacao | date: 'dd/MM/yyyy' : 'UTC' }} }
                    @if (reserva.nomeAgente) { · {{ reserva.nomeAgente }} }
                  </span>
                </div>
              }
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
          @if (det.tecnico?.observacao && aba() === 'itens') {
            <blockquote class="dd-obs"><span class="dd-label">Observação do requisitante</span>{{ det.tecnico!.observacao }}</blockquote>
          }

          <geo-tabs [(value)]="aba" [tabs]="abas()">
            <ng-template geoTabPanel="itens"><ng-container *ngTemplateOutlet="materiais" /></ng-template>

            @if (podePlanejar()) {
              <ng-template geoTabPanel="planejamento">
                <div class="dd-entrega">
                  <div class="dd-entrega__quem">
                    <div class="dd-grid-2">
                      <geo-datepicker
                        label="Retirada prevista"
                        [value]="planData()"
                        (valueChange)="planData.set($any($event))"
                        [required]="true"
                        [clearable]="!det.tecnico?.dataPrevista"
                        [error]="tentouPlanejar() && !planData() ? 'Defina a data da retirada.' : undefined"
                        description="Com a data, a solicitação vai para a separação."
                      />
                      <geo-select
                        label="Almoxarifado que atende"
                        [options]="opcoesAlmoxarifado()"
                        [(value)]="planAlmox"
                        [loading]="carregandoApoio()"
                        [filter]="true"
                        [required]="true"
                      />
                    </div>
                    @if (exigeOcorrencia()) {
                      <geo-text-input
                        [label]="'Número da ' + rotuloExecucao()"
                        [(value)]="planOcorrencia"
                        [maxlength]="100"
                        [required]="true"
                        [error]="tentouPlanejar() && !planOcorrencia().trim() ? 'Informe o número da ' + rotuloExecucao() + '.' : undefined"
                        [description]="'Obra ' + (obra()?.tipoObraNome || '') + ': o material é controlado por ' + rotuloExecucao() + '.'"
                      />
                    }
                    <div class="dd-grid-2">
                      <geo-select
                        label="Equipe"
                        placeholder="Definir depois"
                        [options]="opcoesEquipe()"
                        [value]="planEquipe()"
                        (valueChange)="trocarEquipePlano($event)"
                        [loading]="carregandoApoio()"
                        [filter]="true"
                        [clearable]="true"
                        description="Opcional no planejamento; obrigatória na entrega."
                      />
                      <geo-select
                        label="Quem retira"
                        placeholder="Definir na entrega"
                        [options]="planForaEquipe() ? colaboradoresGerais() : membrosPlano()"
                        [(value)]="planColaborador"
                        [loading]="carregandoColaboradores()"
                        [filter]="true"
                        [clearable]="true"
                        [disabled]="!planForaEquipe() && !planEquipe()"
                        [description]="!planForaEquipe() && !planEquipe() ? 'Escolha a equipe primeiro.' : 'Opcional.'"
                      />
                    </div>
                    <geo-boolean-control kind="toggle" label="Retirada por outra equipe"
                      description="Ligue quando quem retira não é da equipe." [value]="planForaEquipe()" (valueChange)="alternarForaEquipePlano($event)" />
                    <geo-textarea label="Observação" [(value)]="planObs" [rows]="2" [maxlength]="1000" placeholder="Informação para o almoxarifado e a equipe" />
                  </div>

                  <div class="dd-secao-topo">
                    <span class="dd-muted"><strong class="dd-forte">{{ planItens().length }}</strong> {{ planItens().length === 1 ? 'material' : 'materiais' }}</span>
                  </div>
                  <ul class="dd-entrega__lista">
                    @for (item of planItens(); track item.idMaterial + (item.idItem ?? 'novo'); let i = $index) {
                      <li class="dd-entrega__item">
                        <div class="dt-plano-item">
                          <div class="dd-material">
                            <strong>{{ item.descricao }}</strong>
                            <span class="dd-muted">{{ item.codigo }} · {{ item.unidade }}@if (item.minimo > 0) { · {{ item.minimo | number: '1.0-3' }} já entregue }</span>
                          </div>
                          <geo-number-input
                            label="Quantidade"
                            [suffix]="' ' + item.unidade"
                            [min]="item.minimo"
                            [maxFractionDigits]="3"
                            [value]="item.quantidade"
                            (valueChange)="definirQuantidadePlano(i, $event)"
                            [error]="tentouPlanejar() && !((item.quantidade ?? 0) > 0) ? 'Informe a quantidade.' : (item.quantidade ?? 0) < item.minimo ? 'Mínimo ' + item.minimo : undefined"
                          />
                          <geo-icon-button icon="pi pi-trash" [label]="'Tirar ' + item.codigo + ' da solicitação'" tooltip="Tirar da solicitação"
                            size="icon-sm" [disabled]="item.minimo > 0 || planItens().length === 1" (pressed)="removerItemPlano(i)" />
                        </div>
                      </li>
                    }
                  </ul>
                  <div class="dt-adicionar">
                    <geo-select label="Incluir material" placeholder="Buscar material" [options]="opcoesMaterial()" [(value)]="novoMaterial"
                      [loading]="carregandoMateriais()" [filter]="true" (opened)="carregarMateriais()" />
                    <geo-number-input label="Quantidade" [min]="0" [maxFractionDigits]="3" [(value)]="novaQuantidade" />
                    <geo-button label="Incluir" icon="pi pi-plus" variant="outline" [disabled]="!novoMaterial() || !((novaQuantidade() ?? 0) > 0)" (pressed)="incluirItemPlano()" />
                  </div>

                  @if (exigeMotivoAlteracao()) {
                    <geo-textarea
                      label="Motivo da alteração"
                      [(value)]="planJustificativa"
                      [rows]="2"
                      [maxlength]="500"
                      [required]="true"
                      description="A separação já começou: a alteração fica registrada no histórico."
                      [error]="tentouPlanejar() && planJustificativa().trim().length < minimoMotivo ? 'Explique a alteração (mínimo ' + minimoMotivo + ' caracteres).' : undefined"
                    />
                  }
                </div>
              </ng-template>
            }

            @if (podeEntregar()) {
              <ng-template geoTabPanel="entrega">
                <div class="dd-entrega">
                  <div class="dd-entrega__quem">
                    <p class="dt-origem"><span>Sai de</span><strong>{{ almoxarifadoNome() }}</strong><span>· para trocar, use Editar.</span></p>
                    @if (!det.tecnico?.idEquipe) {
                      <geo-select
                        label="Equipe"
                        placeholder="Selecione"
                        [options]="opcoesEquipe()"
                        [value]="entEquipe()"
                        (valueChange)="trocarEquipeEntrega($event)"
                        [loading]="carregandoApoio()"
                        [filter]="true"
                        [required]="true"
                        [error]="tentouEntregar() && !entEquipe() ? 'Escolha a equipe que recebe.' : undefined"
                        description="A solicitação foi planejada sem equipe."
                      />
                    }
                    <geo-boolean-control kind="toggle" label="Retirada por outra equipe"
                      description="Ligue quando quem retira não é da equipe." [value]="entForaEquipe()" (valueChange)="alternarForaEquipeEntrega($event)" />
                    <div class="dd-grid-2">
                      <geo-select
                        label="Quem retira"
                        placeholder="Selecione"
                        [options]="entForaEquipe() ? colaboradoresGerais() : membrosEntrega()"
                        [(value)]="entColaborador"
                        [loading]="carregandoColaboradores()"
                        [filter]="true"
                        [required]="true"
                        [error]="tentouEntregar() && !entColaborador() ? 'Escolha quem retira o material.' : undefined"
                        [description]="!entForaEquipe() && !membrosEntrega().length && !carregandoColaboradores() ? 'A equipe não tem membros ativos. Ligue a retirada por outra equipe.' : entForaEquipe() ? 'Qualquer colaborador ativo.' : 'Membros ativos da equipe.'"
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

                  <div class="dd-entrega__quem">
                    @if (det.tecnico?.reserva; as reserva) {
                      <p class="dt-origem"><span>Reserva</span><strong>{{ reserva.numero }}</strong>@if (reserva.nomeAgente) { <span>· {{ reserva.nomeAgente }}</span> }</p>
                    } @else {
                      <ng-container *ngTemplateOutlet="camposReserva; context: { erros: tentouEntregar(), obrigatoria: reservaObrigatoria() }" />
                    }
                  </div>

                  <app-aviso-saldo-negativo-equipe [saldosNegativos]="saldosNegativos()" [idsMateriais]="idsMateriaisEntrega()" [equipe]="equipeEntregaNome()" />

                  <div class="dd-secao-topo">
                    <span class="dd-muted"><strong class="dd-forte">{{ itensMarcados() }}</strong> de {{ itensEntrega().length }} itens nesta entrega</span>
                    <span class="dd-linha-botoes">
                      <geo-button label="Entregar tudo o que falta" icon="pi pi-check-square" variant="ghost" size="sm" (pressed)="preencherTudo()" />
                      <geo-button label="Zerar" icon="pi pi-eraser" variant="ghost" size="sm" (pressed)="zerarTudo()" />
                    </span>
                  </div>

                  <ul class="dd-entrega__lista">
                    @for (item of itensEntrega(); track item.idItemSolicitacao; let i = $index) {
                      <li class="dd-entrega__item" [class.dd-entrega__item--ok]="item.quantidadePendente <= 0">
                        <div class="dd-material">
                          <strong>{{ item.descricao }}</strong>
                          <span class="dd-muted">{{ item.codigo }} · falta {{ item.quantidadePendente | number: '1.0-3' }} {{ item.unidade }} de {{ item.quantidadeSolicitada | number: '1.0-3' }}</span>
                        </div>
                        @if (item.quantidadePendente > 0) {
                          @if (item.detalhaSerie) {
                            <div class="dd-entrega__series">
                              <app-series-selecao
                                [idSolicitacao]="det.id"
                                [origem]="{ id: idAlmoxarifado(), nome: almoxarifadoNome() }"
                                [material]="{ id: item.idMaterial, codigo: item.codigo, descricao: item.descricao }"
                                [maximo]="item.quantidadePendente"
                                [selecionadas]="item.series"
                                (selecionadasChange)="definirSeries(i, $event)"
                              />
                            </div>
                          } @else {
                            <div class="dd-entrega__campos">
                              <app-quantidade-unidade
                                label="Entregar agora"
                                [material]="item.material"
                                [maxBase]="item.quantidadePendente"
                                [value]="item.quantidadeAEntregar"
                                (valueChange)="definirQuantidade(i, $event)"
                                [unidade]="item.unidadeEscolhida ?? null"
                                (unidadeChange)="definirUnidadeEntrega(i, $event)"
                                [error]="aEntregar(item) > item.quantidadePendente ? 'Máximo ' + item.quantidadePendente + ' ' + item.unidade : undefined"
                              />
                            </div>
                          }
                        } @else {
                          <geo-status tone="success" icon="pi pi-check">Já entregue</geo-status>
                        }
                      </li>
                    }
                  </ul>
                </div>
              </ng-template>
            }

            @if (podeDevolver()) {
              <ng-template geoTabPanel="devolucao">
                <div class="dd-entrega">
                  <div class="dd-entrega__quem">
                    <p class="dt-origem"><span>Volta da obra para</span><strong>{{ almoxarifadoNome() }}</strong><span>· equipe {{ equipeNome() }}</span></p>
                    @if (!det.tecnico?.idEquipe) {
                      <geo-callout tone="warning" [dense]="true">Defina a equipe no planejamento antes de receber a devolução.</geo-callout>
                    }
                    @if (det.tecnico?.reserva; as reserva) {
                      <p class="dt-origem"><span>Reserva</span><strong>{{ reserva.numero }}</strong></p>
                    } @else {
                      <ng-container *ngTemplateOutlet="camposReserva; context: { erros: tentouDevolver(), obrigatoria: false }" />
                    }
                  </div>

                  <div class="dd-secao-topo">
                    <span class="dd-muted"><strong class="dd-forte">{{ itensDevolucaoMarcados() }}</strong> de {{ itensDevolucao().length }} itens nesta devolução</span>
                    <span class="dd-linha-botoes">
                      <geo-button label="Receber tudo o que falta" icon="pi pi-check-square" variant="ghost" size="sm" (pressed)="devolverTudo()" />
                    </span>
                  </div>

                  <ul class="dd-entrega__lista">
                    @for (item of itensDevolucao(); track item.idItemSolicitacao; let i = $index) {
                      <li class="dd-entrega__item" [class.dd-entrega__item--ok]="item.quantidadePendente <= 0">
                        <div class="dd-material">
                          <strong>{{ item.descricao }}</strong>
                          <span class="dd-muted">{{ item.codigo }} · falta {{ item.quantidadePendente | number: '1.0-3' }} {{ item.unidade }}</span>
                        </div>
                        @if (item.quantidadePendente > 0) {
                          <div class="dt-devolucao-item">
                            @if (item.detalhaSerie) {
                              <geo-textarea label="Números de série" [rows]="2" [value]="item.series" (valueChange)="definirSeriesDevolucao(i, $event)"
                                description="Uma série por linha." />
                            } @else {
                              <geo-number-input label="Receber agora" [suffix]="' ' + item.unidade" [min]="0" [max]="item.quantidadePendente" [maxFractionDigits]="3"
                                [value]="item.quantidade" (valueChange)="definirQuantidadeDevolucao(i, $event)"
                                [error]="(item.quantidade ?? 0) > item.quantidadePendente ? 'Máximo ' + item.quantidadePendente : undefined" />
                            }
                            <geo-select label="Condição" [options]="opcoesCondicao" [value]="item.condicao" (valueChange)="definirCondicaoDevolucao(i, $event)" />
                          </div>
                        } @else {
                          <geo-status tone="success" icon="pi pi-check">Já recebido</geo-status>
                        }
                      </li>
                    }
                  </ul>
                </div>
              </ng-template>
            }

            <ng-template geoTabPanel="historico">
              <app-solicitacao-tecnica-historico [idSolicitacao]="det.id" />
            </ng-template>
          </geo-tabs>

          <ng-template #materiais>
            <div class="dd-secao-topo">
              <span class="dd-muted">{{ det.itens.length }} {{ det.itens.length === 1 ? 'material' : 'materiais' }}</span>
              @if (podeRegistrarPendencia() && !det.motivoPendencia) {
                <geo-button label="Apontar pendência geral" icon="pi pi-flag" variant="ghost" size="sm" (pressed)="abrirPendenciaGeral()" />
              }
            </div>
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
          @if (pode('TROCAR_OCORRENCIA')) {
            <geo-icon-button icon="pi pi-pencil" [label]="'Trocar o número da ' + rotuloExecucao()" [tooltip]="'Trocar ' + rotuloExecucao()" (pressed)="trocaOcorrenciaAberta.set(true)" />
          }
          @if (podeReserva()) {
            <geo-icon-button icon="pi pi-bookmark" [label]="detalhe()?.tecnico?.reserva ? 'Alterar a reserva' : 'Registrar a reserva'"
              [tooltip]="detalhe()?.tecnico?.reserva ? 'Alterar reserva' : 'Registrar reserva'" (pressed)="abrirReserva()" />
          }
          @if (aba() === 'itens' || aba() === 'historico') {
            @if (pode('PULAR_SEPARACAO')) {
              <geo-icon-button icon="pi pi-forward" label="Dispensar a separação e ir direto para a entrega" tooltip="Dispensar separação" [disabled]="executando()" (pressed)="separar('PULAR_SEPARACAO')" />
            }
            @if (pode('ESTORNAR') && entregasEstornaveis().length) {
              <geo-icon-button icon="pi pi-replay" label="Estornar uma entrega" tooltip="Estornar entrega" (pressed)="abrirEstorno()" />
            }
            @if (pode('ENCERRAR_SALDO')) {
              <geo-icon-button icon="pi pi-lock" label="Encerrar o saldo que falta" tooltip="Encerrar saldo" (pressed)="abrirEncerramento()" />
            }
          }
        </span>
        <span class="dd-linha-botoes">
          @if (aba() === 'entrega' && podeEntregar()) {
            <geo-button label="Voltar" variant="ghost" (pressed)="aba.set('itens')" />
            <geo-button
              [label]="'Confirmar entrega' + (itensMarcados() ? ' (' + itensMarcados() + ')' : '')"
              icon="pi pi-check-circle"
              [loading]="salvando()"
              [disabled]="!itensMarcados()"
              (pressed)="confirmarEntrega()"
            />
          } @else if (aba() === 'devolucao' && podeDevolver()) {
            <geo-button label="Voltar" variant="ghost" (pressed)="aba.set('itens')" />
            <geo-button
              [label]="'Confirmar recebimento' + (itensDevolucaoMarcados() ? ' (' + itensDevolucaoMarcados() + ')' : '')"
              icon="pi pi-check-circle"
              [loading]="salvando()"
              [disabled]="!itensDevolucaoMarcados()"
              (pressed)="confirmarDevolucao()"
            />
          } @else if (aba() === 'planejamento' && podePlanejar()) {
            <geo-button label="Voltar" variant="ghost" (pressed)="aba.set('itens')" />
            <geo-button [label]="planejada() ? 'Salvar alterações' : 'Salvar planejamento'" icon="pi pi-check-circle" [loading]="salvando()" (pressed)="salvarPlanejamento()" />
          } @else {
            @if (pode('REJEITAR')) {
              <geo-button label="Rejeitar" icon="pi pi-times" variant="outline" [disabled]="executando()" (pressed)="rejeicaoAberta.set(true)" />
            }
            @if (podePlanejar()) {
              <geo-button [label]="planejada() ? 'Editar' : 'Planejar'" [icon]="planejada() ? 'pi pi-pencil' : 'pi pi-calendar-plus'"
                [variant]="planejada() ? 'outline' : 'primary'" (pressed)="aba.set('planejamento')" />
            }
            @if (pode('INICIAR_SEPARACAO')) {
              <geo-button label="Iniciar separação" icon="pi pi-play" [loading]="executando()" (pressed)="separar('INICIAR_SEPARACAO')" />
            } @else if (pode('CONCLUIR_SEPARACAO')) {
              <geo-button label="Concluir separação" icon="pi pi-box" [loading]="executando()" (pressed)="separar('CONCLUIR_SEPARACAO')" />
            } @else if (podeEntregar()) {
              <geo-button label="Registrar entrega" icon="pi pi-truck" (pressed)="aba.set('entrega')" />
            } @else if (podeDevolver()) {
              <geo-button label="Receber devolução" icon="pi pi-inbox" (pressed)="aba.set('devolucao')" />
            } @else if (planejada() || !podePlanejar()) {
              <geo-button label="Fechar" variant="ghost" (pressed)="visible.set(false)" />
            }
          }
        </span>
      </div>
    </geo-drawer>

    <app-troca-ocorrencia-drawer [(visible)]="trocaOcorrenciaAberta" [idSolicitacao]="detalhe()?.id ?? null" [versao]="detalhe()?.versao ?? null"
      [atual]="ocorrencia()" [rotulo]="rotuloExecucao()" [entregue]="totalEntregue() > 0" (trocada)="aoAlterar()" (conflito)="recarregar()" />

    <app-solicitacao-rejeicao-dialog [(visible)]="rejeicaoAberta" [idSolicitacao]="detalhe()?.id ?? null" [reprovar]="false" (rejeitada)="aoAlterar()" />

    <geo-form-drawer [(visible)]="encerramentoAberto" [title]="'Encerrar o saldo da solicitação #' + idCurto()"
      description="O que ainda falta entregar deixa de ser atendido. O que já saiu continua com a equipe." size="sm">
      <div class="dt-form">
        <geo-callout tone="warning" title="Não dá para desfazer">Depois de encerrada, a solicitação não recebe mais entregas.</geo-callout>
        <geo-textarea label="Motivo" [(value)]="motivoEncerramento" [rows]="4" [maxlength]="500" [required]="true"
          placeholder="Por que o restante não será entregue" [description]="'Mínimo de ' + minimoMotivo + ' caracteres.'"
          [error]="tentouEncerrar() && motivoEncerramento().trim().length < minimoMotivo ? 'Escreva ao menos ' + minimoMotivo + ' caracteres.' : undefined" />
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button label="Cancelar" variant="ghost" (pressed)="encerramentoAberto.set(false)" />
        <geo-button label="Encerrar saldo" icon="pi pi-lock" variant="destructive" [loading]="salvando()" (pressed)="confirmarEncerramento()" />
      </div>
    </geo-form-drawer>

    <geo-form-drawer [(visible)]="estornoAberto" [title]="'Estornar entrega da solicitação #' + idCurto()"
      description="O material volta da equipe para o almoxarifado que atendeu." size="md">
      <div class="dt-form">
        <geo-select label="Entrega" [options]="opcoesEstorno()" [value]="idOperacaoEstorno()" (valueChange)="escolherEntregaEstorno($event)" [required]="true" />
        @if (itensEstorno().length) {
          <ul class="dd-entrega__lista">
            @for (item of itensEstorno(); track item.idItemOperacaoOriginal + (item.numeroSerie ?? ''); let i = $index) {
              <li class="dd-entrega__item">
                <div class="dt-estorno-item">
                  <div class="dd-material">
                    <strong>{{ item.descricao }}</strong>
                    <span class="dd-muted">{{ item.codigo }}@if (item.numeroSerie) { · série {{ item.numeroSerie }} } · até {{ item.disponivel | number: '1.0-3' }}</span>
                  </div>
                  <geo-number-input label="Estornar" [min]="0" [max]="item.disponivel" [maxFractionDigits]="3" [value]="item.quantidade"
                    (valueChange)="definirQuantidadeEstorno(i, $event)"
                    [error]="(item.quantidade ?? 0) > item.disponivel ? 'Máximo ' + item.disponivel : undefined" />
                </div>
              </li>
            }
          </ul>
        }
        <geo-textarea label="Motivo" [(value)]="motivoEstorno" [rows]="3" [maxlength]="500" [required]="true"
          [error]="tentouEstornar() && motivoEstorno().trim().length < minimoMotivo ? 'Escreva ao menos ' + minimoMotivo + ' caracteres.' : undefined" />
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button label="Cancelar" variant="ghost" (pressed)="estornoAberto.set(false)" />
        <geo-button label="Estornar" icon="pi pi-replay" variant="destructive" [loading]="salvando()" (pressed)="confirmarEstorno()" />
      </div>
    </geo-form-drawer>

    <ng-template #camposReserva let-erros="erros" let-obrigatoria="obrigatoria">
      <div class="dd-grid-2">
        <geo-text-input
          label="Número da reserva"
          [value]="resNumero()"
          (valueChange)="resNumero.set($event)"
          [maxlength]="20"
          [required]="obrigatoria"
          [error]="erros ? erroNumeroReserva(obrigatoria) : undefined"
          [description]="obrigatoria ? 'Reserva da concessionária: até 20 dígitos.' : 'Opcional em obra com OS/OC.'"
        />
        <geo-datepicker
          label="Data da reserva"
          [value]="resData()"
          (valueChange)="resData.set($any($event))"
          [required]="obrigatoria || !!resNumero().trim()"
          [error]="erros && (obrigatoria || resNumero().trim()) && !resData() ? 'Informe a data de emissão da reserva.' : undefined"
        />
      </div>
      <geo-select
        label="Fiscal / agente da reserva"
        placeholder="Opcional"
        [options]="opcoesAgente()"
        [value]="resAgente()"
        (valueChange)="resAgente.set($event)"
        [loading]="carregandoAgentes()"
        [filter]="true"
        [clearable]="true"
        (opened)="carregarAgentes()"
      />
    </ng-template>

    <geo-form-drawer [(visible)]="reservaAberta" [title]="(detalhe()?.tecnico?.reserva ? 'Alterar a reserva da solicitação #' : 'Registrar a reserva da solicitação #') + idCurto()"
      description="Número e data da reserva da concessionária; o fiscal ou agente é opcional." size="sm">
      <div class="dt-form">
        <ng-container *ngTemplateOutlet="camposReserva; context: { erros: tentouReserva(), obrigatoria: true }" />
        @if (detalhe()?.tecnico?.reserva) {
          <geo-textarea label="Justificativa" [(value)]="resJustificativa" [rows]="3" [maxlength]="500" [required]="true"
            placeholder="Por que a reserva mudou"
            [error]="tentouReserva() && !resJustificativa().trim() ? 'Justifique a alteração da reserva.' : undefined" />
        }
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button label="Cancelar" variant="ghost" (pressed)="reservaAberta.set(false)" />
        <geo-button [label]="detalhe()?.tecnico?.reserva ? 'Salvar reserva' : 'Registrar reserva'" icon="pi pi-bookmark" [loading]="salvando()" (pressed)="confirmarReserva()" />
      </div>
    </geo-form-drawer>

    @if (detalhe(); as d) {
      <app-solicitacao-pendencia-modal
        [(visible)]="pendenciaAberta"
        [idSolicitacao]="d.id"
        [itens]="d.itens"
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
export class SolicitacaoTecnicaDetalheDrawerComponent {
  private readonly service = inject(SolicitacaoMaterialTecnicaService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly obras = inject(ObrasService);
  private readonly rh = inject(RhService);
  private readonly usuarios = inject(UsuarioLookupService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);

  readonly visible = model(false);
  readonly solicitacaoId = input<string | null>(null);
  readonly abaInicial = input<AbaDetalheTecnico>('itens');
  readonly acaoInicial = input<AcaoInicialDetalheTecnico | null>(null);
  private acaoPendente: AcaoInicialDetalheTecnico | null = null;
  /** Planejou, separou, entregou, rejeitou ou mexeu em pendência: quem abriu recarrega. */
  readonly alterado = output<void>();

  protected readonly minimoMotivo = MINIMO_MOTIVO;
  protected readonly detalhe = signal<SolicitacaoMaterialDetalheResponse | null>(null);
  protected readonly obra = signal<ObraResponse | null>(null);
  protected readonly colaboradorNome = signal('');
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly executando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly aba = signal<string>('itens');

  protected readonly rejeicaoAberta = signal(false);
  protected readonly pendenciaAberta = signal(false);
  protected readonly pendenciaItemId = signal<string | null>(null);
  protected readonly pendenciaItemRotulo = signal<string | null>(null);
  protected readonly pendenciaMotivo = signal<MotivoPendenciaResponse | null>(null);
  protected readonly pendenciaJustificativa = signal<string | null>(null);

  // Apoio (carregado uma vez): equipes, almoxarifados físicos, materiais
  private readonly equipes = signal<{ id: string; codigo: string }[]>([]);
  private readonly almoxarifados = signal<{ id: string; nome: string }[]>([]);
  private readonly materiais = signal<MaterialResponse[]>([]);
  protected readonly carregandoApoio = signal(false);
  protected readonly carregandoMateriais = signal(false);
  private apoioCarregado = false;

  protected readonly opcoesEquipe = computed<GeoSelectOption<string>[]>(() => this.equipes().map((e) => ({ label: e.codigo, value: e.id })));
  protected readonly opcoesAlmoxarifado = computed<GeoSelectOption<string>[]>(() => this.almoxarifados().map((e) => ({ label: e.nome, value: e.id })));
  protected readonly opcoesMaterial = computed<GeoSelectOption<string>[]>(() => {
    const usados = new Set(this.planItens().map((i) => i.idMaterial));
    return this.materiais()
      .filter((m) => !usados.has(m.id))
      .map((m) => ({ label: `${m.codigo} — ${m.descricao}`, value: m.id }));
  });

  // Colaboradores
  protected readonly membrosPlano = signal<GeoSelectOption<string>[]>([]);
  protected readonly membrosEntrega = signal<GeoSelectOption<string>[]>([]);
  protected readonly colaboradoresGerais = signal<GeoSelectOption<string>[]>([]);
  protected readonly carregandoColaboradores = signal(false);

  // Planejamento / edição
  protected readonly planData = signal<Date | null>(null);
  protected readonly planAlmox = signal<string | null>(null);
  protected readonly planOcorrencia = signal('');
  protected readonly planEquipe = signal<string | null>(null);
  protected readonly planColaborador = signal<string | null>(null);
  protected readonly planForaEquipe = signal(false);
  protected readonly planObs = signal('');
  protected readonly planJustificativa = signal('');
  protected readonly planItens = signal<ItemPlano[]>([]);
  protected readonly novoMaterial = signal<string | null>(null);
  protected readonly novaQuantidade = signal<number | null>(null);
  protected readonly tentouPlanejar = signal(false);

  // Reserva (GEO: número, data e fiscal/agente). Os mesmos campos servem à entrega, à devolução e à gaveta de reserva.
  protected readonly resNumero = signal('');
  protected readonly resData = signal<Date | null>(null);
  protected readonly resAgente = signal<string | null>(null);
  protected readonly resJustificativa = signal('');
  protected readonly reservaAberta = signal(false);
  protected readonly tentouReserva = signal(false);
  protected readonly opcoesAgente = signal<GeoSelectOption<string>[]>([]);
  protected readonly carregandoAgentes = signal(false);

  // Entrega
  protected readonly entEquipe = signal<string | null>(null);
  protected readonly entColaborador = signal<string | null>(null);
  protected readonly entForaEquipe = signal(false);
  /** Saldos negativos da equipe que recebe (só aviso, não impede a entrega). */
  protected readonly saldosNegativos = signal<Map<string, SaldoNegativoMaterial>>(new Map());
  protected readonly idsMateriaisEntrega = computed(() => this.itensEntrega().map((i) => i.idMaterial));
  protected readonly equipeEntregaNome = computed(() => this.equipes().find((e) => e.id === this.entEquipe())?.codigo ?? null);

  // Devolução
  protected readonly itensDevolucao = signal<ItemDevolucao[]>([]);
  protected readonly tentouDevolver = signal(false);
  protected readonly opcoesCondicao: GeoSelectOption<'NOVO' | 'SUCATA'>[] = [
    { label: 'Novo — volta ao estoque', value: 'NOVO' },
    { label: 'Sucata', value: 'SUCATA' }
  ];
  protected readonly itensDevolucaoMarcados = computed(() => this.itensDevolucao().filter((i) => this.aDevolver(i) > 0).length);
  protected readonly itensEntrega = signal<ItemEntrega[]>([]);
  protected readonly assinatura = signal<'FISICA' | 'DIGITAL'>('FISICA');
  protected readonly assinaturaAlmox = signal('');
  protected readonly assinaturaEquipe = signal('');
  protected readonly tentouEntregar = signal(false);
  protected readonly opcoesAssinatura: GeoSelectOption<'FISICA' | 'DIGITAL'>[] = [
    { label: 'Física — termo em papel', value: 'FISICA' },
    { label: 'Digital — no dispositivo', value: 'DIGITAL' }
  ];

  // Encerrar saldo
  protected readonly encerramentoAberto = signal(false);
  protected readonly trocaOcorrenciaAberta = signal(false);
  protected readonly motivoEncerramento = signal('');
  protected readonly tentouEncerrar = signal(false);

  // Estorno
  protected readonly estornoAberto = signal(false);
  protected readonly idOperacaoEstorno = signal<string | null>(null);
  protected readonly itensEstorno = signal<ItemEstorno[]>([]);
  protected readonly motivoEstorno = signal('');
  protected readonly tentouEstornar = signal(false);

  protected readonly tipoTecnicoLabel = tipoTecnicoLabel;
  protected readonly tipoTecnicoIcon = tipoTecnicoIcon;
  protected readonly separacaoLabel = separacaoLabel;
  protected readonly separacaoTone = separacaoTone;

  protected readonly idCurto = computed(() => (this.detalhe()?.id ?? this.solicitacaoId() ?? '').substring(0, 8));
  protected readonly status = computed(() => statusTecnicoDef(this.detalhe()?.status ?? ''));
  protected readonly planejada = computed(() => !!this.detalhe()?.tecnico?.dataPrevista);
  /** Selo principal: a etapa em que a solicitação está (técnica não tem aprovação). */
  protected readonly situacao = computed<{ label: string; tone: GeoTone; icon: string }>(() => {
    const d = this.detalhe();
    return d ? situacaoAtual(d.status, d.tecnico?.dataPrevista, d.statusSeparacao) : { label: '', tone: 'neutral', icon: 'pi-circle' };
  });
  protected readonly emAndamento = computed(() => ['APROVADO', 'PENDENTE', 'ENTREGUE_PARCIAL'].includes(this.detalhe()?.status ?? ''));
  protected readonly idAlmoxarifado = computed(() => this.detalhe()?.tecnico?.idAlmoxarifadoAtendimento ?? '');
  protected readonly almoxarifadoNome = computed(() => {
    const d = this.detalhe();
    const id = d?.tecnico?.idAlmoxarifadoAtendimento;
    if (d?.estoqueOrigem?.id === id && d?.estoqueOrigem?.nomeIdentificador) return d.estoqueOrigem.nomeIdentificador;
    return this.almoxarifados().find((a) => a.id === id)?.nome ?? 'Almoxarifado';
  });
  protected readonly equipeNome = computed(() => {
    const id = this.detalhe()?.tecnico?.idEquipe;
    if (!id) return 'Equipe a definir';
    return this.equipes().find((e) => e.id === id)?.codigo ?? 'Equipe';
  });
  /** A OS/OC vem primeiro e no título: é por ela que o almoxarifado separa e entrega. */
  protected readonly tituloObra = computed(() => {
    const o = this.obra();
    const oc = this.ocorrencia();
    if (o) return oc ? `${oc} · ${o.numero} · ${o.titulo}` : `${o.numero} · ${o.titulo}`;
    return this.detalhe() ? `Solicitação #${this.idCurto()}` : 'Carregando…';
  });
  protected readonly rotuloExecucao = computed(() => (this.obra()?.controleExecucao === 'OS' ? 'OS' : 'OC'));
  /** GEO: a OS/OC é exigida em obra corretiva ou preventiva e não se aplica a obra e LPT. */
  protected readonly exigeOcorrencia = computed(() => {
    const tipo = this.detalhe()?.tecnico?.tipoObra;
    return tipo === 'CORRETIVA' || tipo === 'PREVENTIVA';
  });
  /** GEO: fora de OS/OC, a entrega exige a reserva da concessionária. */
  protected readonly reservaObrigatoria = computed(() => !this.exigeOcorrencia() && !this.detalhe()?.tecnico?.ocorrencia?.codigo);
  /** "OC 88412" — sem repetir o prefixo quando o número já foi digitado com ele. */
  protected readonly ocorrencia = computed(() => {
    const codigo = this.detalhe()?.tecnico?.ocorrencia?.codigo?.trim();
    if (!codigo) return null;
    return /^(OS|OC)\b/i.test(codigo) ? codigo : `${this.rotuloExecucao()} ${codigo}`;
  });
  protected readonly relativo = computed(() => {
    const prevista = this.detalhe()?.tecnico?.dataPrevista;
    return prevista ? prazoRelativo(prevista.substring(0, 10)) : '';
  });

  protected readonly totalSolicitado = computed(() => (this.detalhe()?.itens ?? []).reduce((a, i) => a + (Number(i.quantidade) || 0), 0));
  protected readonly totalEntregue = computed(() => (this.detalhe()?.itens ?? []).reduce((a, i) => a + this.entregue(i), 0));
  protected readonly percentual = computed(() => {
    const total = this.totalSolicitado();
    return total > 0 ? Math.min(100, Math.round((this.totalEntregue() / total) * 100)) : 0;
  });
  protected readonly itensMarcados = computed(() => this.itensEntrega().filter((i) => (i.quantidadeAEntregar ?? 0) > 0).length);

  protected readonly podeRegistrarPendencia = computed(() => {
    const d = this.detalhe();
    return !!d && !d.encerrada && ['PENDENTE', 'APROVADO', 'ENTREGUE_PARCIAL'].includes(d.status);
  });
  /** Só solicitação aberta (não rejeitada, entregue ou encerrada) é planejada ou editada. */
  protected readonly podePlanejar = computed(() => {
    const d = this.detalhe();
    // GEO: depois que o material saiu (entrega ou devolução), o planejamento não muda mais.
    return this.pode('EDITAR_PLANEJAMENTO') && !!d && !d.encerrada && ['PENDENTE', 'APROVADO', 'ENTREGUE_PARCIAL'].includes(d.status)
      && !possuiMovimentacaoAtendimento(d);
  });
  protected readonly podeEntregar = computed(() => this.pode('ENTREGAR'));
  protected readonly podeDevolver = computed(() => this.pode('CONFIRMAR_DEVOLUCAO'));
  protected readonly podeReserva = computed(() => this.pode('REGISTRAR_RESERVA') || this.pode('ALTERAR_RESERVA'));
  /** Depois que a separação começou, o backend exige o motivo de qualquer alteração. */
  protected readonly exigeMotivoAlteracao = computed(() => {
    const d = this.detalhe();
    if (!d) return false;
    return d.statusSeparacao === 'EM_SEPARACAO' || d.statusSeparacao === 'SEPARADO' || (d.tecnico?.operacoes?.length ?? 0) > 0;
  });

  protected readonly abas = computed<readonly GeoTabItem[]>(() => {
    const d = this.detalhe();
    const abas: GeoTabItem[] = [{ value: 'itens', label: 'Materiais', icon: 'pi pi-box', badge: d?.itens.length || undefined }];
    if (this.podePlanejar()) abas.push({ value: 'planejamento', label: this.planejada() ? 'Editar' : 'Planejar', icon: this.planejada() ? 'pi pi-pencil' : 'pi pi-calendar-plus' });
    if (this.podeEntregar()) abas.push({ value: 'entrega', label: 'Registrar entrega', icon: 'pi pi-truck' });
    if (this.podeDevolver()) abas.push({ value: 'devolucao', label: 'Receber devolução', icon: 'pi pi-inbox' });
    abas.push({ value: 'historico', label: 'Histórico', icon: 'pi pi-history', badge: d?.tecnico?.operacoes?.length || undefined });
    return abas;
  });

  /** Entregas com saldo ainda não estornado. */
  protected readonly entregasEstornaveis = computed(() => {
    const ops = this.detalhe()?.tecnico?.operacoes ?? [];
    return ops.filter((op) => op.tipo === 'ENTREGA' && this.disponivelEstorno(op).some((i) => i.disponivel > 0));
  });
  protected readonly opcoesEstorno = computed<GeoSelectOption<string>[]>(() =>
    this.entregasEstornaveis().map((op) => ({
      label: `${new Date(op.realizadaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${op.itens.length} ${op.itens.length === 1 ? 'item' : 'itens'}`,
      value: op.id
    }))
  );

  protected readonly fluxo = computed<EtapaFluxo[]>(() => {
    const d = this.detalhe();
    if (!d) return [];
    const t = d.tecnico;
    const rejeitada = d.status === 'REJEITADO' || d.status === 'CANCELADO';
    const planejada = !!t?.dataPrevista;
    const concluida = d.status === 'ENTREGUE';
    const iniciada = concluida || d.status === 'ENTREGUE_PARCIAL' || d.status === 'ESTORNADO';
    const separada = d.statusSeparacao === 'SEPARADO' || iniciada;
    const etapas: EtapaFluxo[] = [{ rotulo: 'Solicitada', estado: 'feito', quando: d.dataSolicitacao, quem: this.nome(d.idRequisitante), icone: 'pi-send' }];
    if (rejeitada) {
      etapas.push({ rotulo: 'Rejeitada', estado: 'interrompido', quando: d.dataVerificacao, quem: d.idAprovador ? this.nome(d.idAprovador) : null, icone: 'pi-times' });
      return etapas;
    }
    etapas.push(planejada ? { rotulo: 'Planejada', estado: 'feito', icone: 'pi-calendar' } : { rotulo: 'A planejar', estado: 'atual', icone: 'pi-calendar-plus' });
    etapas.push({
      rotulo: separada ? 'Separada' : d.statusSeparacao === 'EM_SEPARACAO' ? 'Em separação' : 'Separação',
      estado: separada ? 'feito' : planejada ? 'atual' : 'futuro',
      icone: 'pi-box'
    });
    etapas.push({
      rotulo: concluida ? 'Entregue' : d.status === 'ESTORNADO' ? 'Estornada' : iniciada ? 'Entregue em parte' : 'Entrega',
      estado: concluida || d.status === 'ESTORNADO' ? 'feito' : separada ? 'atual' : 'futuro',
      quando: d.dataEntrega,
      quem: d.idEntregadorAlmox ? this.nome(d.idEntregadorAlmox) : null,
      icone: 'pi-truck'
    });
    return etapas;
  });

  constructor() {
    effect(() => {
      const id = this.solicitacaoId();
      if (!this.visible() || !id) return;
      const aba = this.abaInicial();
      const acao = this.acaoInicial();
      untracked(() => {
        this.aba.set(aba);
        this.acaoPendente = acao;
        this.carregarApoio();
        this.carregar(id);
      });
    });
  }

  pode(acao: AcaoPermitidaSolicitacao): boolean {
    return this.detalhe()?.acoesPermitidas?.includes(acao) ?? false;
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service.buscarPorId(id).subscribe({
      next: (d) => {
        this.detalhe.set(d);
        this.carregando.set(false);
        this.carregarContexto(d);
        this.prepararPlanejamento(d);
        this.prepararEntrega(d);
        this.prepararDevolucao(d);
        // As abas de ação só existem enquanto a ação é permitida.
        if (this.aba() === 'entrega' && !this.podeEntregar()) this.aba.set('itens');
        if (this.aba() === 'devolucao' && !this.podeDevolver()) this.aba.set('itens');
        if (this.aba() === 'planejamento' && !this.podePlanejar()) this.aba.set('itens');
        const pendente = this.acaoPendente;
        this.acaoPendente = null;
        if (pendente === 'ENCERRAR_SALDO' && this.pode('ENCERRAR_SALDO')) this.abrirEncerramento();
        if (pendente === 'ESTORNAR' && this.pode('ESTORNAR') && this.entregasEstornaveis().length) this.abrirEstorno();
        if (pendente === 'RESERVA' && this.podeReserva()) this.abrirReserva();
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  private carregarApoio(): void {
    if (this.apoioCarregado) return;
    this.apoioCarregado = true;
    this.carregandoApoio.set(true);
    this.rh.listarEquipes({ ativo: true, size: 1000, sort: 'codigo,asc' }).subscribe({
      next: (r) => this.equipes.set((r.content ?? []).map((e) => ({ id: e.id, codigo: e.codigo }))),
      error: () => (this.apoioCarregado = false)
    });
    this.almoxarifado.listarEstoquesAtivos().subscribe({
      next: (r) => {
        this.almoxarifados.set(
          (r.content ?? [])
            .filter((e) => e.ativo && e.tipoEstoque?.nome?.trim().toUpperCase() === 'FISICO')
            .map((e) => ({ id: e.id, nome: e.nomeIdentificador }))
        );
        this.carregandoApoio.set(false);
      },
      error: () => this.carregandoApoio.set(false)
    });
  }

  protected carregarMateriais(): void {
    if (this.materiais().length || this.carregandoMateriais()) return;
    this.carregandoMateriais.set(true);
    this.almoxarifado.listarMateriais({ ativo: true, size: 1000, sort: 'codigo,asc' }).subscribe({
      next: (r) => {
        this.materiais.set(r?.content ?? []);
        this.carregandoMateriais.set(false);
      },
      error: () => this.carregandoMateriais.set(false)
    });
  }

  private carregarContexto(d: SolicitacaoMaterialDetalheResponse): void {
    const t = d.tecnico;
    if (t?.idObra && this.obra()?.id !== t.idObra) {
      this.obras.buscarObraPorId(t.idObra).subscribe({ next: (o) => this.obra.set(o), error: () => this.obra.set(null) });
    }
    this.colaboradorNome.set('');
    if (t?.idColaboradorSaque) {
      this.rh.buscarColaboradorPorId(t.idColaboradorSaque).subscribe({ next: (c) => this.colaboradorNome.set(c.nomeCompleto), error: () => this.colaboradorNome.set('Não informado') });
    }
  }

  // ---------- Planejamento ----------

  private prepararPlanejamento(d: SolicitacaoMaterialDetalheResponse): void {
    const t = d.tecnico;
    this.tentouPlanejar.set(false);
    this.planData.set(t?.dataPrevista ? dataLocal(t.dataPrevista) : null);
    this.planAlmox.set(t?.idAlmoxarifadoAtendimento ?? null);
    this.planOcorrencia.set(t?.ocorrencia?.codigo ?? '');
    this.planEquipe.set(t?.idEquipe ?? null);
    this.planColaborador.set(t?.idColaboradorSaque ?? null);
    this.planForaEquipe.set(!!t?.saqueForaEquipe);
    this.planObs.set(t?.observacao ?? '');
    this.planJustificativa.set('');
    this.novoMaterial.set(null);
    this.novaQuantidade.set(null);
    this.planItens.set(
      d.itens.map((i) => ({
        idItem: i.id,
        idMaterial: i.material.id,
        codigo: i.material.codigo,
        descricao: i.material.descricao,
        unidade: i.material.unidadeMedida || 'UN',
        quantidade: i.quantidade,
        minimo: this.entregue(i)
      }))
    );
    if (this.planForaEquipe()) this.carregarColaboradoresGerais();
    else if (t?.idEquipe) this.carregarMembros(t.idEquipe, this.membrosPlano);
  }

  protected trocarEquipePlano(id: string | null): void {
    this.planEquipe.set(id);
    if (!this.planForaEquipe()) {
      this.planColaborador.set(null);
      this.membrosPlano.set([]);
      if (id) this.carregarMembros(id, this.membrosPlano);
    }
  }

  protected alternarForaEquipePlano(fora: boolean): void {
    this.planForaEquipe.set(fora);
    this.planColaborador.set(null);
    if (fora) this.carregarColaboradoresGerais();
    else if (this.planEquipe()) this.carregarMembros(this.planEquipe()!, this.membrosPlano);
  }

  protected definirQuantidadePlano(indice: number, valor: number | null): void {
    this.planItens.update((itens) => itens.map((it, i) => (i === indice ? { ...it, quantidade: valor } : it)));
  }

  protected removerItemPlano(indice: number): void {
    this.planItens.update((itens) => itens.filter((_, i) => i !== indice));
  }

  protected incluirItemPlano(): void {
    const material = this.materiais().find((m) => m.id === this.novoMaterial());
    const quantidade = this.novaQuantidade();
    if (!material || !quantidade || quantidade <= 0) return;
    this.planItens.update((itens) => [
      ...itens,
      { idItem: null, idMaterial: material.id, codigo: material.codigo, descricao: material.descricao, unidade: material.unidadeMedida || 'UN', quantidade, minimo: 0 }
    ]);
    this.novoMaterial.set(null);
    this.novaQuantidade.set(null);
  }

  protected salvarPlanejamento(): void {
    const d = this.detalhe();
    if (!d || !d.tecnico || this.salvando()) return;
    this.tentouPlanejar.set(true);
    const itens = this.planItens();
    if (!this.planData()) return this.notificacoes.warning('Defina a data prevista da retirada.');
    if (!this.planAlmox()) return this.notificacoes.warning('Escolha o almoxarifado que atende.');
    if (this.exigeOcorrencia() && !this.planOcorrencia().trim()) return this.notificacoes.warning(`Informe o número da ${this.rotuloExecucao()}.`);
    if (!itens.length || itens.some((i) => !((i.quantidade ?? 0) > 0) || (i.quantidade ?? 0) < i.minimo))
      return this.notificacoes.warning('Revise as quantidades dos materiais.');
    if (this.exigeMotivoAlteracao() && this.planJustificativa().trim().length < MINIMO_MOTIVO)
      return this.notificacoes.warning('Explique o motivo da alteração.');

    const tipo: TipoSolicitacaoTecnica = d.tecnico.tipoTecnico;
    this.salvando.set(true);
    this.service
      .substituirPlanejamento(d.id, {
        versaoEsperada: d.versao,
        idObra: d.tecnico.idObra,
        ocorrencia: this.exigeOcorrencia() ? this.planOcorrencia().trim() || null : null,
        idAlmoxarifadoAtendimento: this.planAlmox()!,
        idEquipe: this.planEquipe(),
        idColaboradorSaque: this.planColaborador(),
        saqueForaEquipe: this.planForaEquipe(),
        dataPrevista: dataIso(this.planData()),
        observacao: this.planObs().trim() || null,
        justificativa: this.planJustificativa().trim() || null,
        itens: itens.map((i) => ({ idItem: i.idItem, idMaterial: i.idMaterial, tipoMovimentacao: tipo, quantidade: i.quantidade! }))
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.notificacoes.success(this.planejada() ? 'Alterações salvas.' : 'Solicitação planejada. Ela já pode ser separada.');
          this.aba.set('itens');
          this.aoAlterar();
        },
        error: (e) => this.falha(e, 'Não foi possível salvar o planejamento')
      });
  }

  // ---------- Separação ----------

  protected separar(acao: 'INICIAR_SEPARACAO' | 'CONCLUIR_SEPARACAO' | 'PULAR_SEPARACAO'): void {
    const d = this.detalhe();
    if (!d || this.executando()) return;
    const corpo = { versaoEsperada: d.versao };
    const chamada: Observable<unknown> =
      acao === 'INICIAR_SEPARACAO' ? this.service.iniciarSeparacao(d.id, corpo)
        : acao === 'CONCLUIR_SEPARACAO' ? this.service.concluirSeparacao(d.id, corpo)
          : this.service.pularSeparacao(d.id, corpo);
    const sucesso =
      acao === 'INICIAR_SEPARACAO' ? 'Separação iniciada.'
        : acao === 'CONCLUIR_SEPARACAO' ? 'Separação concluída. A solicitação está pronta para entrega.'
          : 'Separação dispensada. A solicitação está pronta para entrega.';
    this.executando.set(true);
    chamada.subscribe({
      next: () => {
        this.executando.set(false);
        this.notificacoes.success(sucesso);
        this.aoAlterar();
      },
      error: (e) => {
        this.executando.set(false);
        this.falha(e, 'Não foi possível atualizar a separação');
      }
    });
  }

  // ---------- Entrega ----------

  private prepararEntrega(d: SolicitacaoMaterialDetalheResponse): void {
    const t = d.tecnico;
    this.tentouEntregar.set(false);
    this.trocarAssinatura('FISICA');
    this.limparReserva();
    this.itensEntrega.set(
      d.itens.map((i) => ({
        idItemSolicitacao: i.id,
        idMaterial: i.material.id,
        codigo: i.material.codigo,
        descricao: i.material.descricao,
        unidade: i.material.unidadeMedida || 'UN',
        detalhaSerie: !!i.material.detalhaSerie,
        quantidadeSolicitada: i.quantidade,
        quantidadePendente: this.pendente(i),
        quantidadeAEntregar: i.material.detalhaSerie ? 0 : this.pendente(i),
        material: i.material,
        series: []
      }))
    );
    this.entEquipe.set(t?.idEquipe ?? null);
    this.entColaborador.set(t?.idColaboradorSaque ?? null);
    this.entForaEquipe.set(!!t?.saqueForaEquipe);
    if (this.entForaEquipe()) this.carregarColaboradoresGerais();
    else if (t?.idEquipe) this.carregarMembros(t.idEquipe, this.membrosEntrega, this.entColaborador);
    if (this.pode('ENTREGAR')) this.carregarSaldosNegativos(t?.idEquipe ?? null);
  }

  protected trocarEquipeEntrega(id: string | null): void {
    this.entEquipe.set(id);
    this.carregarSaldosNegativos(id);
    if (!this.entForaEquipe()) {
      this.entColaborador.set(null);
      this.membrosEntrega.set([]);
      if (id) this.carregarMembros(id, this.membrosEntrega, this.entColaborador);
    }
  }

  protected alternarForaEquipeEntrega(fora: boolean): void {
    this.entForaEquipe.set(fora);
    this.entColaborador.set(null);
    if (fora) this.carregarColaboradoresGerais();
    else if (this.entEquipe()) this.carregarMembros(this.entEquipe()!, this.membrosEntrega, this.entColaborador);
  }

  protected trocarAssinatura(tipo: 'FISICA' | 'DIGITAL' | null): void {
    this.assinatura.set(tipo ?? 'FISICA');
    this.assinaturaAlmox.set('');
    this.assinaturaEquipe.set('');
  }

  protected definirQuantidade(indice: number, valor: number | null): void {
    this.itensEntrega.update((itens) => itens.map((it, i) => (i === indice ? { ...it, quantidadeAEntregar: valor } : it)));
  }

  /** Na unidade do material: é o que o servidor confere com o que falta. */
  protected aEntregar(item: ItemEntrega): number {
    return item.detalhaSerie ? item.series.length : (paraUnidadeBase(item.material, item.quantidadeAEntregar, item.unidadeEscolhida) ?? 0);
  }

  protected definirUnidadeEntrega(indice: number, unidade: string | null): void {
    this.itensEntrega.update((itens) => itens.map((it, i) => {
      if (i !== indice) return it;
      const base = this.aEntregar(it);
      return { ...it, unidadeEscolhida: unidade, quantidadeAEntregar: it.quantidadeAEntregar ? daUnidadeBase(it.material, base, unidade) : it.quantidadeAEntregar };
    }));
  }

  protected definirSeries(indice: number, series: string[]): void {
    this.itensEntrega.update((itens) => itens.map((it, i) => (i === indice ? { ...it, series, quantidadeAEntregar: series.length } : it)));
  }

  protected preencherTudo(): void {
    this.itensEntrega.update((itens) => itens.map((it) => (it.quantidadePendente <= 0 || it.detalhaSerie ? it : { ...it, unidadeEscolhida: null, quantidadeAEntregar: it.quantidadePendente })));
  }

  protected zerarTudo(): void {
    this.itensEntrega.update((itens) => itens.map((it) => ({ ...it, quantidadeAEntregar: 0, series: [] })));
  }

  protected confirmarEntrega(): void {
    const d = this.detalhe();
    if (!d || this.salvando()) return;
    this.tentouEntregar.set(true);
    const itens = this.itensEntrega().filter((i) => (i.quantidadeAEntregar ?? 0) > 0);
    const reservaNova = !d.tecnico?.reserva && !!this.resNumero().trim();
    if (!this.entEquipe()) return this.notificacoes.warning('Escolha a equipe que recebe.');
    if (!this.entColaborador()) return this.notificacoes.warning('Escolha quem retira o material.');
    if (!d.tecnico?.reserva) {
      const erro = this.erroNumeroReserva(this.reservaObrigatoria()) ?? ((this.reservaObrigatoria() || reservaNova) && !this.resData() ? 'Informe a data de emissão da reserva.' : undefined);
      if (erro) return this.notificacoes.warning(erro);
    }
    if (!itens.length) return this.notificacoes.warning('Informe a quantidade de ao menos um item.');
    const excedido = itens.find((i) => this.aEntregar(i) > i.quantidadePendente);
    if (excedido) return this.notificacoes.warning(`${excedido.codigo}: a quantidade passa do que falta entregar.`);
    const digital = this.assinatura() === 'DIGITAL';
    if (digital && !(ehImagem(this.assinaturaAlmox()) && ehImagem(this.assinaturaEquipe())))
      return this.notificacoes.warning('Colete as duas assinaturas digitais: almoxarifado e quem retira.');

    const pedido: ConfirmarEntregaTecnicaRequest = {
      versaoEsperada: d.versao,
      idEquipe: this.entEquipe()!,
      idColaboradorSaque: this.entColaborador(),
      saqueForaEquipe: this.entForaEquipe(),
      assinaturaAlmox: digital ? this.assinaturaAlmox() : 'FISICA',
      assinaturaEquipe: digital ? this.assinaturaEquipe() : 'FISICA',
      itens: itens.flatMap<ItemComandoTecnicoRequest>((i) =>
        i.detalhaSerie
          ? i.series.map((numeroSerie) => ({ idItemSolicitacao: i.idItemSolicitacao, quantidade: 1, numeroSerie }))
          : [{ idItemSolicitacao: i.idItemSolicitacao, quantidade: i.quantidadeAEntregar!, unidade: i.unidadeEscolhida || undefined }]
      ),
      ...(reservaNova ? this.reservaDoPedido() : {})
    };
    this.salvando.set(true);
    this.service.entregar(d.id, pedido).subscribe({
      next: () => {
        this.salvando.set(false);
        const completa = itens.length === this.itensEntrega().filter((i) => i.quantidadePendente > 0).length && itens.every((i) => this.aEntregar(i) === i.quantidadePendente);
        this.notificacoes.success(completa ? 'Entrega registrada. A solicitação foi concluída.' : 'Entrega parcial registrada. O saldo continua aguardando retirada.');
        this.aba.set('itens');
        this.aoAlterar();
      },
      error: (e) => this.falha(e, 'Não foi possível registrar a entrega')
    });
  }

  // ---------- Reserva (GEO) ----------

  private limparReserva(): void {
    this.resNumero.set('');
    this.resData.set(new Date());
    this.resAgente.set(null);
    this.resJustificativa.set('');
  }

  protected erroNumeroReserva(obrigatoria: boolean): string | undefined {
    const numero = this.resNumero().trim();
    if (!numero) return obrigatoria ? 'Informe o número da reserva da concessionária.' : undefined;
    return /^\d{1,20}$/.test(numero) ? undefined : 'Informe até 20 dígitos numéricos.';
  }

  private reservaDoPedido(): { numeroReserva: string; dataReserva: string; idAgenteReserva?: string } {
    return {
      numeroReserva: this.resNumero().trim(),
      dataReserva: dataIso(this.resData() ?? new Date())!,
      ...(this.resAgente() ? { idAgenteReserva: this.resAgente()! } : {})
    };
  }

  protected carregarAgentes(): void {
    if (this.opcoesAgente().length || this.carregandoAgentes()) return;
    this.carregandoAgentes.set(true);
    this.obras.listarAgentesAtivos().subscribe({
      next: (agentes) => {
        this.opcoesAgente.set(agentes.map((a) => ({ label: a.empresaOrgao ? `${a.nome} · ${a.empresaOrgao}` : a.nome, value: a.id })));
        this.carregandoAgentes.set(false);
      },
      error: () => this.carregandoAgentes.set(false)
    });
  }

  abrirReserva(): void {
    const reserva = this.detalhe()?.tecnico?.reserva;
    this.tentouReserva.set(false);
    this.resNumero.set(reserva?.numero ?? '');
    this.resData.set(reserva?.dataCriacao ? dataLocal(reserva.dataCriacao) : new Date());
    this.resAgente.set(reserva?.idAgenteResponsavel ?? null);
    this.resJustificativa.set('');
    if (reserva?.idAgenteResponsavel) this.carregarAgentes();
    this.reservaAberta.set(true);
  }

  protected confirmarReserva(): void {
    const d = this.detalhe();
    if (!d || this.salvando()) return;
    this.tentouReserva.set(true);
    const alterando = !!d.tecnico?.reserva;
    if (this.erroNumeroReserva(true) || !this.resData()) return;
    if (alterando && !this.resJustificativa().trim()) return;
    const pedido: RegistrarReservaTecnicaRequest = {
      versaoEsperada: d.tecnico?.versao ?? d.versao,
      numero: this.resNumero().trim(),
      dataCriacao: dataIso(this.resData())!,
      justificativa: this.resJustificativa().trim() || null,
      ...(this.resAgente() ? { idAgenteResponsavel: this.resAgente() } : {})
    };
    this.salvando.set(true);
    this.service.registrarReserva(d.id, pedido).subscribe({
      next: () => {
        this.salvando.set(false);
        this.reservaAberta.set(false);
        this.notificacoes.success(alterando ? 'Reserva alterada.' : 'Reserva registrada.');
        this.aoAlterar();
      },
      error: (e) => this.falha(e, 'Não foi possível salvar a reserva')
    });
  }

  // ---------- Devolução (GEO: do estoque da obra para o almoxarifado) ----------

  private prepararDevolucao(d: SolicitacaoMaterialDetalheResponse): void {
    this.tentouDevolver.set(false);
    if (tipoTecnicoEhAdicao(d.tecnico?.tipoTecnico)) {
      this.itensDevolucao.set([]);
      return;
    }
    this.itensDevolucao.set(
      d.itens.map((i) => ({
        idItemSolicitacao: i.id,
        codigo: i.material.codigo,
        descricao: i.material.descricao,
        unidade: i.material.unidadeMedida || 'UN',
        detalhaSerie: !!i.material.detalhaSerie,
        quantidadePendente: this.pendenteDevolucao(i),
        quantidade: i.material.detalhaSerie ? null : this.pendenteDevolucao(i),
        condicao: 'NOVO',
        series: ''
      }))
    );
  }

  private pendenteDevolucao(item: ItemSolicitacaoTecnicaResponse): number {
    return item.quantidadePendente ?? Math.max(0, item.quantidade - (item.quantidadeDevolucaoLiquida ?? 0));
  }

  private seriesDe(item: ItemDevolucao): string[] {
    return item.series.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  }

  protected aDevolver(item: ItemDevolucao): number {
    return item.detalhaSerie ? this.seriesDe(item).length : (item.quantidade ?? 0);
  }

  protected definirQuantidadeDevolucao(indice: number, valor: number | null): void {
    this.itensDevolucao.update((itens) => itens.map((it, i) => (i === indice ? { ...it, quantidade: valor } : it)));
  }

  protected definirSeriesDevolucao(indice: number, valor: string): void {
    this.itensDevolucao.update((itens) => itens.map((it, i) => (i === indice ? { ...it, series: valor } : it)));
  }

  protected definirCondicaoDevolucao(indice: number, valor: 'NOVO' | 'SUCATA' | null): void {
    this.itensDevolucao.update((itens) => itens.map((it, i) => (i === indice ? { ...it, condicao: valor ?? 'NOVO' } : it)));
  }

  protected devolverTudo(): void {
    this.itensDevolucao.update((itens) => itens.map((it) => (it.detalhaSerie || it.quantidadePendente <= 0 ? it : { ...it, quantidade: it.quantidadePendente })));
  }

  protected confirmarDevolucao(): void {
    const d = this.detalhe();
    if (!d || this.salvando()) return;
    this.tentouDevolver.set(true);
    const idEquipe = d.tecnico?.idEquipe;
    if (!idEquipe) return this.notificacoes.warning('Defina a equipe no planejamento antes de receber a devolução.');
    const itens = this.itensDevolucao().filter((i) => this.aDevolver(i) > 0);
    if (!itens.length) return this.notificacoes.warning('Informe a quantidade de ao menos um item.');
    const excedido = itens.find((i) => this.aDevolver(i) > i.quantidadePendente);
    if (excedido) return this.notificacoes.warning(`${excedido.codigo}: a quantidade passa do que falta devolver.`);
    const series = itens.flatMap((i) => (i.detalhaSerie ? this.seriesDe(i).map((s) => s.toUpperCase()) : []));
    if (new Set(series).size !== series.length) return this.notificacoes.warning('Não repita o mesmo número de série.');
    const reservaNova = !d.tecnico?.reserva && !!this.resNumero().trim();
    if (reservaNova) {
      const erro = this.erroNumeroReserva(false) ?? (!this.resData() ? 'Informe a data de emissão da reserva.' : undefined);
      if (erro) return this.notificacoes.warning(erro);
    }
    const pedido: ConfirmarDevolucaoTecnicaRequest = {
      versaoEsperada: d.versao,
      idEquipe,
      itens: itens.flatMap((i) =>
        i.detalhaSerie
          ? this.seriesDe(i).map((numeroSerie) => ({ idItemSolicitacao: i.idItemSolicitacao, quantidade: 1, numeroSerie, condicao: i.condicao }))
          : [{ idItemSolicitacao: i.idItemSolicitacao, quantidade: i.quantidade!, condicao: i.condicao }]
      ),
      ...(reservaNova ? this.reservaDoPedido() : {})
    };
    this.salvando.set(true);
    this.service.devolver(d.id, pedido).subscribe({
      next: () => {
        this.salvando.set(false);
        this.notificacoes.success('Devolução recebida. O material voltou ao almoxarifado.');
        this.aba.set('itens');
        this.aoAlterar();
      },
      error: (e) => this.falha(e, 'Não foi possível registrar a devolução')
    });
  }

  private carregarSaldosNegativos(idEquipe: string | null): void {
    this.saldosNegativos.set(new Map());
    if (!idEquipe) return;
    // Informativo: uma falha aqui não atrapalha a entrega.
    this.almoxarifado.listarSaldosNegativos({ idEquipe }).subscribe({
      next: (saldos) => {
        if (this.entEquipe() === idEquipe) this.saldosNegativos.set(agruparSaldosNegativos(saldos));
      },
      error: () => this.saldosNegativos.set(new Map())
    });
  }

  // ---------- Encerrar saldo ----------

  abrirEncerramento(): void {
    this.motivoEncerramento.set('');
    this.tentouEncerrar.set(false);
    this.encerramentoAberto.set(true);
  }

  protected confirmarEncerramento(): void {
    const d = this.detalhe();
    if (!d || this.salvando()) return;
    this.tentouEncerrar.set(true);
    if (this.motivoEncerramento().trim().length < MINIMO_MOTIVO) return;
    this.salvando.set(true);
    this.service.encerrar(d.id, { versaoEsperada: d.versao, motivo: this.motivoEncerramento().trim() }).subscribe({
      next: () => {
        this.salvando.set(false);
        this.encerramentoAberto.set(false);
        this.notificacoes.success('Saldo encerrado. O que faltava não será mais entregue.');
        this.aoAlterar();
      },
      error: (e) => this.falha(e, 'Não foi possível encerrar o saldo')
    });
  }

  // ---------- Estorno ----------

  private disponivelEstorno(op: OperacaoSolicitacaoTecnicaResponse): { id: string; disponivel: number }[] {
    const estornos = (this.detalhe()?.tecnico?.operacoes ?? []).filter((o) => o.tipo === 'ESTORNO' && o.idOperacaoOriginal === op.id);
    return op.itens.map((item) => {
      const estornado = estornos.flatMap((o) => o.itens).filter((i) => i.idItemOperacaoOriginal === item.id).reduce((a, i) => a + i.quantidade, 0);
      return { id: item.id, disponivel: Math.max(0, item.quantidade - estornado) };
    });
  }

  abrirEstorno(): void {
    this.motivoEstorno.set('');
    this.tentouEstornar.set(false);
    const primeira = this.entregasEstornaveis()[0];
    this.escolherEntregaEstorno(primeira?.id ?? null);
    this.estornoAberto.set(true);
  }

  protected escolherEntregaEstorno(id: string | null): void {
    this.idOperacaoEstorno.set(id);
    const op = this.entregasEstornaveis().find((o) => o.id === id);
    if (!op) return this.itensEstorno.set([]);
    const disponiveis = new Map(this.disponivelEstorno(op).map((d) => [d.id, d.disponivel]));
    this.itensEstorno.set(
      op.itens
        .filter((i) => (disponiveis.get(i.id) ?? 0) > 0)
        .map((i) => ({
          idItemOperacaoOriginal: i.id,
          codigo: i.codigoMaterial,
          descricao: i.descricaoMaterial,
          numeroSerie: i.numeroSerie ?? null,
          disponivel: disponiveis.get(i.id) ?? 0,
          quantidade: 0
        }))
    );
  }

  protected definirQuantidadeEstorno(indice: number, valor: number | null): void {
    this.itensEstorno.update((itens) => itens.map((it, i) => (i === indice ? { ...it, quantidade: valor } : it)));
  }

  protected confirmarEstorno(): void {
    const d = this.detalhe();
    if (!d || this.salvando()) return;
    this.tentouEstornar.set(true);
    const itens = this.itensEstorno().filter((i) => (i.quantidade ?? 0) > 0);
    if (!this.idOperacaoEstorno()) return this.notificacoes.warning('Escolha a entrega.');
    if (!itens.length) return this.notificacoes.warning('Informe a quantidade de ao menos um item.');
    if (itens.some((i) => (i.quantidade ?? 0) > i.disponivel)) return this.notificacoes.warning('Uma quantidade passa do que pode ser estornado.');
    if (this.motivoEstorno().trim().length < MINIMO_MOTIVO) return;
    this.salvando.set(true);
    this.service
      .estornar(d.id, {
        versaoEsperada: d.versao,
        idOperacaoOriginal: this.idOperacaoEstorno()!,
        motivo: this.motivoEstorno().trim(),
        itens: itens.map((i) => ({ idItemOperacaoOriginal: i.idItemOperacaoOriginal, quantidade: i.quantidade!, numeroSerie: i.numeroSerie }))
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.estornoAberto.set(false);
          this.notificacoes.success('Estorno registrado. O material voltou ao almoxarifado.');
          this.aoAlterar();
        },
        error: (e) => this.falha(e, 'Não foi possível estornar')
      });
  }

  // ---------- Apoio ----------

  private carregarMembros(equipe: string, destino: typeof this.membrosPlano, escolhido?: typeof this.entColaborador): void {
    this.carregandoColaboradores.set(true);
    this.rh.listarMembrosAtivos(equipe).subscribe({
      next: (membros) => {
        const opcoes = (membros ?? []).map((m) => ({ label: m.nomeColaborador, value: m.idColaborador }));
        destino.set(opcoes);
        if (escolhido && !escolhido() && opcoes.length === 1) escolhido.set(opcoes[0].value);
        this.carregandoColaboradores.set(false);
      },
      error: () => {
        destino.set([]);
        this.carregandoColaboradores.set(false);
      }
    });
  }

  private carregarColaboradoresGerais(): void {
    if (this.colaboradoresGerais().length) return;
    this.carregandoColaboradores.set(true);
    this.rh.listarColaboradores({ ativo: true, size: 200, sort: 'nomeCompleto,asc' }).subscribe({
      next: (res) => {
        this.colaboradoresGerais.set((res?.content ?? []).map((c) => ({ label: c.nomeCompleto, value: c.id })));
        this.carregandoColaboradores.set(false);
      },
      error: () => this.carregandoColaboradores.set(false)
    });
  }

  /** Conflito de versão: alguém mexeu antes. Recarrega e avisa, sem gravar nada. */
  private falha(e: unknown, titulo: string): void {
    this.salvando.set(false);
    const status = (e as { status?: number })?.status;
    if (status === 409) {
      this.notificacoes.warning('Alguém alterou esta solicitação enquanto você trabalhava. Os dados foram recarregados; confira e tente de novo.', { title: 'Nada foi gravado' });
      this.recarregar();
      return;
    }
    this.notificacoes.error(getErrorMessage(e), { title: titulo });
  }

  protected entregue(item: ItemSolicitacaoTecnicaResponse): number {
    return item.quantidadeEntregaLiquida ?? item.quantidadeEntregue ?? 0;
  }

  protected pendente(item: ItemSolicitacaoTecnicaResponse): number {
    return item.quantidadePendente ?? Math.max(0, item.quantidade - this.entregue(item));
  }

  protected nome(id?: string | null): string {
    return this.usuarios.resolverNome(id, 'Não informado');
  }

  protected abrirPendenciaGeral(): void {
    const d = this.detalhe();
    if (!d) return;
    this.pendenciaItemId.set(null);
    this.pendenciaItemRotulo.set(null);
    this.pendenciaMotivo.set(d.motivoPendencia ?? null);
    this.pendenciaJustificativa.set(d.justificativaPendencia ?? null);
    this.pendenciaAberta.set(true);
  }

  protected abrirPendenciaItem(item: ItemSolicitacaoTecnicaResponse): void {
    this.pendenciaItemId.set(item.id);
    this.pendenciaItemRotulo.set(`${item.material.codigo} — ${item.material.descricao}`);
    this.pendenciaMotivo.set(item.motivoPendencia ?? null);
    this.pendenciaJustificativa.set(item.justificativaPendencia ?? null);
    this.pendenciaAberta.set(true);
  }

  protected resolverPendenciaGeral(): void {
    const d = this.detalhe();
    if (!d || this.executando()) return;
    this.executando.set(true);
    this.almoxarifado.removerPendencia(d.id).subscribe({
      next: () => {
        this.executando.set(false);
        this.notificacoes.success('Pendência resolvida.');
        this.aoAlterar();
      },
      error: (e) => {
        this.executando.set(false);
        this.notificacoes.error(getErrorMessage(e), { title: 'Não foi possível resolver a pendência' });
      }
    });
  }

  /** Abre a rejeição por cima do detalhe (pedida de fora, ex.: linha da tabela). */
  abrirRejeicao(): void {
    this.rejeicaoAberta.set(true);
  }

  recarregar(): void {
    const d = this.detalhe();
    if (d) this.carregar(d.id);
  }

  protected aoAlterar(): void {
    this.recarregar();
    this.alterado.emit();
  }

  protected abrirRelatorio(): void {
    const id = this.detalhe()?.id ?? this.solicitacaoId();
    if (!id) return;
    this.visible.set(false);
    void navegarSaindoDoDrawer(() => this.router.navigate(['/almoxarifado/solicitacoes-tecnicas', id]));
  }

  protected imprimir(): void {
    const id = this.detalhe()?.id ?? this.solicitacaoId();
    if (!id) return;
    const url = this.router.serializeUrl(this.router.createUrlTree(['/almoxarifado/solicitacoes-tecnicas', id], { queryParams: { mode: 'print' } }));
    window.open(url, '_blank', 'noopener');
  }

  protected aoFechar(): void {
    this.detalhe.set(null);
    this.obra.set(null);
    this.erro.set(null);
  }
}

/** "2026-11-04" (ou ISO completo) → Date local à meia-noite, sem deslocar o dia. */
function dataLocal(valor: string): Date {
  const [a, m, d] = valor.substring(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

function dataIso(data: Date | null): string | null {
  if (!data) return null;
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const dd = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mm}-${dd}`;
}
