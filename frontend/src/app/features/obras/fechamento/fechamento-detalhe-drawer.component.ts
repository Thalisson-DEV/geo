import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  CesButtonComponent,
  CesCalloutComponent,
  CesDatepickerComponent,
  CesDrawerComponent,
  CesFormDrawerComponent,
  CesIconButtonComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTabItem,
  CesTabPanelDirective,
  CesTabsComponent,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { Observable } from 'rxjs';

import { MotivoPendenciaResponse } from '../../../core/models/almoxarifado.models';
import { FechamentoDetalhe, ItemFechamento, MovimentacaoFechamento } from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { navegarSaindoDoDrawer } from '../../../shared/utils/drawer-navegacao.utils';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { FechamentoEditarDrawerComponent } from './fechamento-editar-drawer.component';
import { FechamentoEstornoDrawerComponent } from './fechamento-estorno-drawer.component';
import { FechamentoMovimentarPainelComponent } from './fechamento-movimentar-painel.component';
import { FechamentoOperacoesHistoricoComponent } from './fechamento-operacoes-historico.component';
import {
  SITUACOES,
  dataHora,
  dataIsoLocal,
  iconeTipo,
  nomePessoa,
  prazo,
  quantidade,
  rotaFechamento,
  rotuloObra,
  situacaoItem,
  tipoFechamento,
  ultimaMovimentacao
} from './fechamento-ui';

/** `reserva` e `movimentar` abrem direto no formulário da ação. */
export type AbaFechamento = 'itens' | 'reserva' | 'movimentar' | 'movimentacoes';

interface EtapaFluxo {
  rotulo: string;
  estado: 'feito' | 'atual' | 'futuro' | 'interrompido';
  quando?: string | null;
  quem?: string | null;
  icone: string;
}

/**
 * Painel lateral da solicitação de encerramento, igual na tabela, no quadro, no calendário e no
 * relatório, no mesmo modelo da comercial e da técnica: reservar e movimentar são abas dele;
 * pendência, estorno, edição e cancelamento abrem por cima, sem sair da tela.
 */
@Component({
  selector: 'app-fechamento-detalhe-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesButtonComponent,
    CesCalloutComponent,
    CesDatepickerComponent,
    CesDrawerComponent,
    CesFormDrawerComponent,
    CesIconButtonComponent,
    CesSelectComponent,
    CesStatusComponent,
    CesTabPanelDirective,
    CesTabsComponent,
    CesTextInputComponent,
    CesTextareaComponent,
    FechamentoEditarDrawerComponent,
    FechamentoEstornoDrawerComponent,
    FechamentoMovimentarPainelComponent,
    FechamentoOperacoesHistoricoComponent
  ],
  styleUrls: ['../../almoxarifado/solicitacoes-material/solicitacao-comercial-detalhe.component.css', './fechamento.css'],
  template: `
    <ces-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      eyebrow="Solicitação de encerramento"
      [title]="titulo()"
      size="lg"
      (closed)="aoFechar()"
    >
      @if (carregando() && !detalhe()) {
        <div class="dd-skeleton" role="status" aria-label="Carregando a solicitação">
          <span></span><span></span><span></span><span></span>
        </div>
      } @else if (erro()) {
        <ces-callout tone="danger" title="Não foi possível carregar a solicitação">{{ erro() }}</ces-callout>
      } @else if (detalhe(); as det) {
        <div class="dd">
          <section class="dd-hero" [attr.data-tone]="situacao().tone" aria-label="Resumo">
            <div class="dd-hero__topo">
              <ces-status [tone]="situacao().tone" [icon]="situacao().icon" emphasis="solid">{{ situacao().label }}</ces-status>
              <ces-status [tone]="tipoDe(det).adicao ? 'info' : 'neutral'" [icon]="iconeTipo(det.tipo)" [title]="tipoDe(det).nome">{{ det.tipo }}</ces-status>
              @if (det.prazoVigente.situacao === 'ATRASADO') {
                <ces-status tone="danger" icon="pi pi-exclamation-triangle">Prazo atrasado</ces-status>
              } @else if (det.prazoVigente.situacao === 'VENCE_EM_BREVE') {
                <ces-status tone="warning" icon="pi pi-hourglass">Vence em breve</ces-status>
              }
              @if (det.possuiPendencia) {
                <ces-status tone="warning" icon="pi pi-flag">Com pendência</ces-status>
              }
            </div>
            <p class="dd-hero__rota">
              <i class="pi pi-building" aria-hidden="true"></i>
              <span>{{ rota().de }}</span>
              <i class="pi pi-arrow-right dd-hero__seta" aria-hidden="true"></i>
              <strong>{{ rota().para }}</strong>
              <span class="dd-hero__tipo">{{ tipoDe(det).nome }}</span>
            </p>
            <p class="dd-hero__meta"><span class="dd-hero__id">#{{ idCurto() }}</span> · Pedida por <strong>{{ nomePessoa(det.solicitante) }}</strong> em {{ det.criadaEm | date: "dd/MM/yyyy 'às' HH:mm" }}</p>
          </section>

          @if (aba() !== 'movimentar' && aba() !== 'reserva') {
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
                <span class="dd-label">{{ det.situacao === 'AGUARDANDO_RESERVA' ? 'Prazo da reserva' : 'Prazo para movimentar' }}</span>
                @if (det.prazoVigente.limite) {
                  <strong [class.dd-texto-alerta]="det.prazoVigente.situacao === 'ATRASADO'">{{ det.prazoVigente.limite | date: "dd/MM/yyyy 'às' HH:mm" }}</strong>
                  <span class="dd-muted">{{ prazo(det.prazoVigente.situacao)?.label }} · 48 horas úteis</span>
                } @else if (det.movimentacaoConcluidaEm) {
                  <strong>{{ det.movimentacaoConcluidaEm | date: "dd/MM/yyyy 'às' HH:mm" }}</strong>
                  <span class="dd-muted">{{ prazo(det.prazoMovimentacao?.situacao)?.label ?? 'Concluída' }}</span>
                } @else {
                  <strong>Sem prazo correndo</strong>
                }
              </div>
              <div class="dd-fato">
                <span class="dd-label">Reserva</span>
                @if (det.reserva; as reserva) {
                  <strong>{{ reserva.numero }}</strong>
                  <span class="dd-muted">Criada em {{ reserva.dataCriacao | date: 'dd/MM/yyyy' : 'UTC' }}</span>
                } @else {
                  <strong>Sem reserva</strong>
                  <span class="dd-muted">Informe o número da reserva do SAP</span>
                }
              </div>
              <div class="dd-fato dd-fato--largo">
                <span class="dd-label">Movimentação</span>
                <div class="dd-progresso" role="progressbar" [attr.aria-valuenow]="percentual()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="percentual() + '% movimentado'">
                  <span [style.width.%]="percentual()"></span>
                </div>
                <span class="dd-muted">
                  <strong class="dd-forte">{{ quantidade(totalMovimentado()) }}</strong> de {{ quantidade(totalSolicitado()) }} movimentados · {{ percentual() }}%
                </span>
              </div>
            </section>
          }

          @if (det.situacao === 'CANCELADA') {
            <ces-callout tone="neutral" title="Solicitação cancelada">Cancelada em {{ dataHora(det.canceladaEm) }}. Motivo: {{ det.motivoCancelamento }}</ces-callout>
          }
          @if (det.pendenciaGeral; as p) {
            <ces-callout tone="warning" [title]="'Pendência: ' + p.motivo">
              <div class="dd-callout-linha">
                <span>{{ p.justificativa || 'Sem justificativa informada.' }}</span>
                @if (det.acoes.pendencias) {
                  <ces-button label="Resolver pendência" icon="pi pi-check" variant="outline" size="sm" [loading]="processando()" (pressed)="removerPendencia(null)" />
                }
              </div>
            </ces-callout>
          }
          @if (det.observacao && aba() === 'itens') {
            <blockquote class="dd-obs"><span class="dd-label">Observação do solicitante</span>{{ det.observacao }}</blockquote>
          }

          <ces-tabs [(value)]="aba" [tabs]="abas()" ariaLabel="Seções da solicitação de encerramento">
            <ng-template cesTabPanel="itens">
              <div class="dd-secao-topo">
                <span class="dd-muted">{{ det.itens.length }} {{ det.itens.length === 1 ? 'material' : 'materiais' }}</span>
                @if (det.acoes.pendencias && !det.pendenciaGeral) {
                  <span class="dd-linha-botoes">
                    <ces-button label="Apontar pendência geral" icon="pi pi-flag" variant="ghost" size="sm" (pressed)="abrirPendencia(null)" />
                  </span>
                }
              </div>
              <div class="dd-tabela" role="table" aria-label="Materiais solicitados">
                <div class="dd-tabela__linha dd-tabela__cab" role="row">
                  <span role="columnheader">Material</span>
                  <span role="columnheader" class="dd-num">Pedido</span>
                  <span role="columnheader" class="dd-num">Movim.</span>
                  <span role="columnheader" class="dd-num">Falta</span>
                  <span role="columnheader"><span class="dd-sr">Ações</span></span>
                </div>
                @for (item of det.itens; track item.id) {
                  @let s = situacaoDoItem(item);
                  <div class="dd-tabela__linha" role="row">
                    <span role="cell" class="dd-material">
                      <strong>{{ item.descricaoMaterial }}</strong>
                      <span class="dd-muted">{{ item.codigoMaterial }} · {{ item.unidade || 'UN' }}</span>
                      <ces-status [tone]="s.tone" [icon]="s.icon">{{ s.label }}</ces-status>
                    </span>
                    <span role="cell" class="dd-num">{{ quantidade(item.quantidade) }}</span>
                    <span role="cell" class="dd-num">{{ quantidade(item.quantidadeMovimentada) }}</span>
                    <span role="cell" class="dd-num" [class.dd-texto-aviso]="item.quantidadePendente > 0">{{ quantidade(item.quantidadePendente) }}</span>
                    <span role="cell" class="dd-acao">
                      @if (det.acoes.pendencias) {
                        <ces-icon-button
                          [icon]="item.pendencia ? 'pi pi-exclamation-triangle' : 'pi pi-flag'"
                          [label]="(item.pendencia ? 'Ver ou resolver a pendência de ' : 'Apontar pendência em ') + item.codigoMaterial"
                          [tooltip]="item.pendencia ? 'Ver ou resolver pendência' : 'Apontar pendência'"
                          size="icon-sm"
                          (pressed)="abrirPendencia(item)"
                        />
                      }
                    </span>
                  </div>
                }
              </div>
            </ng-template>

            @if (podeReserva()) {
              <ng-template cesTabPanel="reserva">
                <div class="dd-entrega">
                  <div class="dd-entrega__quem">
                    <div class="dd-grid-2">
                      <ces-text-input label="Número da reserva" [(value)]="reservaNumero" [maxlength]="20" [required]="true"
                        [error]="tentouReserva() && !reservaValida() ? 'Só números, até 20 dígitos.' : undefined" />
                      <ces-datepicker label="Data da reserva" [(value)]="reservaData" [maxDate]="hoje" [clearable]="true" description="Se vazia, vale hoje." />
                    </div>
                    <span class="dd-muted">
                      {{ det.reserva ? 'Só enquanto nada estiver movimentado. O prazo de movimentação não recomeça.' : 'Com a reserva, o almoxarifado tem 48 horas úteis para movimentar.' }}
                    </span>
                  </div>
                </div>
              </ng-template>
            }

            @if (det.acoes.movimentar) {
              <ng-template cesTabPanel="movimentar">
                <app-fechamento-movimentar-painel #painelMovimentar [solicitacao]="det" (movimentada)="aoMovimentar($event)" (conflito)="recarregar()" />
              </ng-template>
            }

            <ng-template cesTabPanel="movimentacoes">
              <app-fechamento-operacoes-historico [movimentacoes]="det.movimentacoes" [recolhivel]="false" [acoes]="true"
                [textoVazio]="det.reserva ? 'Nada movimentado ainda. Use Marcar movimentado quando o SAP estiver movimentado.' : 'Nada movimentado ainda. Primeiro a reserva precisa ser registrada.'"
                (estornar)="abrirEstorno($event)" />
            </ng-template>
          </ces-tabs>
        </div>
      }

      <div drawer-footer class="dd-rodape">
        <span class="dd-linha-botoes">
          <ces-icon-button icon="pi pi-external-link" label="Abrir relatório completo" tooltip="Relatório completo" (pressed)="abrirRelatorio()" />
          <ces-icon-button icon="pi pi-print" label="Imprimir a solicitação" tooltip="Imprimir" (pressed)="imprimir()" />
          @if (aba() === 'itens' || aba() === 'movimentacoes') {
            @if (detalhe()?.acoes?.editar) {
              <ces-icon-button icon="pi pi-pencil" label="Editar a solicitação" tooltip="Editar" (pressed)="edicaoAberta.set(true)" />
            }
            @if (detalhe()?.acoes?.cancelar) {
              <ces-icon-button icon="pi pi-ban" label="Cancelar a solicitação" tooltip="Cancelar solicitação" (pressed)="abrirCancelamento()" />
            }
          }
        </span>
        <span class="dd-linha-botoes">
          @if (aba() === 'movimentar' && detalhe()?.acoes?.movimentar) {
            <ces-button label="Voltar" variant="ghost" (pressed)="aba.set('itens')" />
            <ces-button
              [label]="painelMovimentar()?.pendenteEnvio() ? 'Tentar novamente' : 'Confirmar movimentação' + (painelMovimentar()?.itensMarcados() ? ' (' + painelMovimentar()!.itensMarcados() + ')' : '')"
              icon="pi pi-check-circle"
              [loading]="painelMovimentar()?.salvando() ?? false"
              [disabled]="!painelMovimentar()?.itensMarcados()"
              (pressed)="painelMovimentar()?.confirmar()"
            />
          } @else if (aba() === 'reserva' && podeReserva()) {
            <ces-button label="Voltar" variant="ghost" (pressed)="aba.set('itens')" />
            <ces-button icon="pi pi-check" label="Salvar reserva" [loading]="processando()" (pressed)="salvarReserva()" />
          } @else if (detalhe()?.acoes?.registrarReserva) {
            <ces-button label="Registrar reserva" icon="pi pi-hashtag" (pressed)="aba.set('reserva')" />
          } @else if (detalhe()?.acoes?.movimentar) {
            <ces-button label="Marcar movimentado" icon="pi pi-check-square" (pressed)="aba.set('movimentar')" />
          } @else {
            <ces-button label="Fechar" variant="ghost" (pressed)="visible.set(false)" />
          }
        </span>
      </div>
    </ces-drawer>

    @if (detalhe(); as det) {
      <app-fechamento-estorno-drawer [(visible)]="estornoAberto" [solicitacao]="det" [movimentacao]="movimentacaoSelecionada()"
        (estornada)="atualizar($event)" (conflito)="recarregar()" />
      <app-fechamento-editar-drawer [(visible)]="edicaoAberta" [solicitacao]="det" (salva)="atualizar($event)" (conflito)="recarregar()" />

      <ces-form-drawer [(visible)]="pendenciaAberta" [title]="tituloPendencia()" size="sm"
        [description]="pendenciaAtual() ? undefined : 'Pendência não impede a movimentação; serve para registrar o que falta resolver.'">
        @if (pendenciaAtual(); as p) {
          <ces-callout tone="warning" [title]="p.motivo">{{ p.justificativa || 'Sem justificativa informada.' }}</ces-callout>
        } @else {
          <div class="fx-form">
            <ces-select label="Motivo" [options]="opcoesMotivo()" [(value)]="pendenciaMotivo" [filter]="true" [required]="true"
              [error]="pendenciaTentou() && !pendenciaMotivo() ? 'Escolha o motivo.' : undefined" />
            <ces-textarea label="Justificativa" [(value)]="pendenciaJustificativa" [rows]="3" [maxlength]="2000"
              [error]="pendenciaJustificativa().trim() && pendenciaJustificativa().trim().length < 5 ? 'Escreva ao menos 5 caracteres ou deixe em branco.' : undefined" />
          </div>
        }
        <div drawer-footer class="ces-actions-row">
          <ces-button variant="ghost" label="Voltar" (pressed)="pendenciaAberta.set(false)" />
          @if (pendenciaAtual()) {
            <ces-button icon="pi pi-check" label="Resolver pendência" [loading]="processando()" (pressed)="removerPendencia(pendenciaItem()?.id ?? null)" />
          } @else {
            <ces-button icon="pi pi-flag" label="Registrar pendência" [loading]="processando()" (pressed)="salvarPendencia()" />
          }
        </div>
      </ces-form-drawer>

      <ces-form-drawer [(visible)]="cancelamentoAberto" title="Cancelar solicitação" size="sm"
        description="A solicitação deixa de contar para o encerramento da obra. Não dá para desfazer.">
        <ces-textarea label="Motivo" [(value)]="cancelamentoMotivo" [rows]="3" [maxlength]="500" [required]="true"
          [error]="cancelamentoTentou() && !cancelamentoMotivo().trim() ? 'Informe o motivo.' : undefined" />
        <div drawer-footer class="ces-actions-row">
          <ces-button variant="ghost" label="Voltar" (pressed)="cancelamentoAberto.set(false)" />
          <ces-button variant="destructive" icon="pi pi-ban" label="Cancelar solicitação" [loading]="processando()" (pressed)="cancelar()" />
        </div>
      </ces-form-drawer>

    }
  `
})
export class FechamentoDetalheDrawerComponent {
  private readonly service = inject(FechamentoObraService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);

  readonly visible = model(false);
  readonly solicitacaoId = input<string | null>(null);
  readonly abaInicial = input<AbaFechamento>('itens');
  /** Reservou, movimentou, estornou ou mexeu em pendência: quem abriu recarrega. */
  readonly alterado = output<void>();

  protected readonly iconeTipo = iconeTipo;
  protected readonly nomePessoa = nomePessoa;
  protected readonly prazo = prazo;
  protected readonly dataHora = dataHora;
  protected readonly quantidade = quantidade;
  protected readonly situacaoDoItem = situacaoItem;
  protected readonly tipoDe = (d: FechamentoDetalhe) => tipoFechamento(d.tipo);
  protected readonly hoje = new Date();

  protected readonly detalhe = signal<FechamentoDetalhe | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly processando = signal(false);
  protected readonly aba = signal<string>('itens');
  protected readonly painelMovimentar = viewChild<FechamentoMovimentarPainelComponent>('painelMovimentar');

  protected readonly reservaNumero = signal('');
  protected readonly reservaData = signal<Date | null>(null);
  protected readonly tentouReserva = signal(false);
  protected readonly reservaValida = computed(() => /^\d{1,20}$/.test(this.reservaNumero().trim()));

  protected readonly edicaoAberta = signal(false);
  protected readonly estornoAberto = signal(false);
  protected readonly movimentacaoSelecionada = signal<MovimentacaoFechamento | null>(null);

  private readonly motivos = signal<MotivoPendenciaResponse[]>([]);
  protected readonly pendenciaAberta = signal(false);
  protected readonly pendenciaItem = signal<ItemFechamento | null>(null);
  protected readonly pendenciaMotivo = signal<string | null>(null);
  protected readonly pendenciaJustificativa = signal('');
  protected readonly pendenciaTentou = signal(false);

  protected readonly cancelamentoAberto = signal(false);
  protected readonly cancelamentoMotivo = signal('');
  protected readonly cancelamentoTentou = signal(false);

  protected readonly idCurto = computed(() => (this.detalhe()?.id ?? this.solicitacaoId() ?? '').substring(0, 8));
  protected readonly titulo = computed(() => {
    const d = this.detalhe();
    return d ? rotuloObra(d.obra) : 'Carregando…';
  });
  protected readonly situacao = computed(() => SITUACOES[this.detalhe()?.situacao ?? 'AGUARDANDO_RESERVA']);
  protected readonly rota = computed(() => {
    const d = this.detalhe();
    return d ? rotaFechamento(d, formatarAlmoxarifado(d.almoxarifadoAtendimento.nome)) : { de: '', para: '' };
  });
  protected readonly podeReserva = computed(() => {
    const acoes = this.detalhe()?.acoes;
    return !!acoes && (acoes.registrarReserva || acoes.alterarReserva);
  });
  protected readonly totalSolicitado = computed(() => (this.detalhe()?.itens ?? []).reduce((t, i) => t + Number(i.quantidade), 0));
  protected readonly totalMovimentado = computed(() => (this.detalhe()?.itens ?? []).reduce((t, i) => t + Number(i.quantidadeMovimentada), 0));
  protected readonly percentual = computed(() => {
    const total = this.totalSolicitado();
    return total > 0 ? Math.min(100, Math.round((this.totalMovimentado() / total) * 100)) : 0;
  });

  protected readonly abas = computed<readonly CesTabItem[]>(() => {
    const d = this.detalhe();
    const abas: CesTabItem[] = [{ value: 'itens', label: 'Materiais', icon: 'pi pi-box', badge: d?.itens.length || undefined }];
    if (this.podeReserva()) abas.push({ value: 'reserva', label: d?.reserva ? 'Corrigir reserva' : 'Registrar reserva', icon: 'pi pi-hashtag' });
    if (d?.acoes.movimentar) abas.push({ value: 'movimentar', label: 'Movimentar', icon: 'pi pi-check-square' });
    abas.push({ value: 'movimentacoes', label: 'Movimentações', icon: 'pi pi-arrow-right-arrow-left', badge: d?.movimentacoes.length || undefined });
    return abas;
  });

  protected readonly fluxo = computed<EtapaFluxo[]>(() => {
    const d = this.detalhe();
    if (!d) return [];
    const cancelada = d.situacao === 'CANCELADA';
    const concluida = d.situacao === 'MOVIMENTADA';
    const iniciada = concluida || d.situacao === 'MOVIMENTADA_PARCIALMENTE';
    const ultima = ultimaMovimentacao(d.movimentacoes);
    const etapas: EtapaFluxo[] = [
      { rotulo: 'Solicitada', estado: 'feito', quando: d.criadaEm, quem: nomePessoa(d.solicitante), icone: 'pi-send' },
      d.reserva
        ? { rotulo: 'Reserva registrada', estado: 'feito', quando: d.reserva.registradaEm, quem: d.reserva.numero, icone: 'pi-hashtag' }
        : { rotulo: 'Aguardando reserva', estado: cancelada ? 'futuro' : 'atual', icone: 'pi-hashtag' }
    ];
    if (cancelada) {
      etapas.push({ rotulo: 'Cancelada', estado: 'interrompido', quando: d.canceladaEm, icone: 'pi-ban' });
      return etapas;
    }
    etapas.push({
      rotulo: concluida ? 'Movimentada' : iniciada ? 'Movimentada em parte' : d.reserva ? 'Aguardando movimentação' : 'Movimentação',
      estado: concluida ? 'feito' : d.reserva ? 'atual' : 'futuro',
      quando: concluida ? d.movimentacaoConcluidaEm : ultima?.realizadaEm,
      quem: ultima ? nomePessoa(ultima.operador) : null,
      icone: 'pi-check-square'
    });
    return etapas;
  });

  protected readonly opcoesMotivo = computed<CesSelectOption<string>[]>(() => this.motivos().map((m) => ({ label: m.nome, value: m.id })));
  protected readonly pendenciaAtual = computed(() => {
    const item = this.pendenciaItem();
    return item ? (this.detalhe()?.itens.find((i) => i.id === item.id)?.pendencia ?? null) : (this.detalhe()?.pendenciaGeral ?? null);
  });
  protected readonly tituloPendencia = computed(() => {
    const item = this.pendenciaItem();
    return item ? `Pendência em ${item.codigoMaterial}` : 'Pendência geral da solicitação';
  });

  constructor() {
    effect(() => {
      const id = this.solicitacaoId();
      if (!this.visible() || !id) return;
      const aba = this.abaInicial();
      untracked(() => {
        this.aba.set(aba);
        this.carregar(id);
      });
    });
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service.detalhe(id).subscribe({
      next: (d) => {
        if (this.solicitacaoId() !== id) return;
        this.carregando.set(false);
        this.definirDetalhe(d);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected recarregar(): void {
    const id = this.detalhe()?.id ?? this.solicitacaoId();
    if (id) this.carregar(id);
  }

  /** Solicitação nova ou atualizada; se a aba aberta deixou de valer, volta para os materiais. */
  private definirDetalhe(d: FechamentoDetalhe): void {
    this.detalhe.set(d);
    this.reservaNumero.set(d.reserva?.numero ?? '');
    this.reservaData.set(d.reserva ? new Date(`${d.reserva.dataCriacao}T00:00:00`) : null);
    this.tentouReserva.set(false);
    const aba = this.aba();
    if ((aba === 'reserva' && !this.podeReserva()) || (aba === 'movimentar' && !d.acoes.movimentar)) this.aba.set('itens');
  }

  protected atualizar(d: FechamentoDetalhe): void {
    this.definirDetalhe(d);
    this.alterado.emit();
  }

  protected aoMovimentar(d: FechamentoDetalhe): void {
    this.aba.set('itens');
    this.atualizar(d);
  }

  protected salvarReserva(): void {
    const d = this.detalhe();
    if (!d || this.processando()) return;
    this.tentouReserva.set(true);
    if (!this.reservaValida()) return;
    this.executar(
      this.service.registrarReserva(d.id, d.versao, this.reservaNumero().trim(), dataIsoLocal(this.reservaData())),
      d.reserva ? 'Reserva corrigida.' : 'Reserva registrada. O prazo de movimentação começou.',
      () => this.aba.set('itens')
    );
  }

  protected abrirPendencia(item: ItemFechamento | null): void {
    if (!this.motivos().length) this.almoxarifado.listarMotivosPendencia(true).subscribe({ next: (m) => this.motivos.set(m), error: () => undefined });
    this.pendenciaItem.set(item);
    this.pendenciaMotivo.set(null);
    this.pendenciaJustificativa.set('');
    this.pendenciaTentou.set(false);
    this.pendenciaAberta.set(true);
  }

  protected salvarPendencia(): void {
    const d = this.detalhe();
    if (!d || this.processando()) return;
    this.pendenciaTentou.set(true);
    const justificativa = this.pendenciaJustificativa().trim();
    if (!this.pendenciaMotivo() || (justificativa && justificativa.length < 5)) return;
    this.executar(this.service.registrarPendencia(d.id, this.pendenciaItem()?.id ?? null, this.pendenciaMotivo()!, justificativa || null), 'Pendência registrada.', () =>
      this.pendenciaAberta.set(false)
    );
  }

  protected removerPendencia(idItem: string | null): void {
    const d = this.detalhe();
    if (!d || this.processando()) return;
    this.executar(this.service.removerPendencia(d.id, idItem), 'Pendência resolvida.', () => this.pendenciaAberta.set(false));
  }

  protected abrirCancelamento(): void {
    this.cancelamentoMotivo.set('');
    this.cancelamentoTentou.set(false);
    this.cancelamentoAberto.set(true);
  }

  protected cancelar(): void {
    const d = this.detalhe();
    if (!d || this.processando()) return;
    this.cancelamentoTentou.set(true);
    if (!this.cancelamentoMotivo().trim()) return;
    this.executar(this.service.cancelar(d.id, d.versao, this.cancelamentoMotivo().trim()), 'Solicitação cancelada.', () => this.cancelamentoAberto.set(false));
  }

  protected abrirEstorno(m: MovimentacaoFechamento): void {
    this.movimentacaoSelecionada.set(m);
    this.estornoAberto.set(true);
  }

  private executar(pedido: Observable<FechamentoDetalhe>, sucesso: string, depois?: () => void): void {
    this.processando.set(true);
    pedido.subscribe({
      next: (d) => {
        this.processando.set(false);
        this.notificacoes.success(sucesso);
        depois?.();
        this.atualizar(d);
      },
      error: (e) => {
        this.processando.set(false);
        if (e?.status === 409) {
          this.notificacoes.warning('Alguém alterou esta solicitação. Os dados foram atualizados; confira e tente de novo.');
          this.recarregar();
          return;
        }
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected abrirRelatorio(): void {
    const id = this.detalhe()?.id ?? this.solicitacaoId();
    if (!id) return;
    this.visible.set(false);
    void navegarSaindoDoDrawer(() => this.router.navigate(['/obras/encerramento', id]));
  }

  protected imprimir(): void {
    const id = this.detalhe()?.id ?? this.solicitacaoId();
    if (!id) return;
    const url = this.router.serializeUrl(this.router.createUrlTree(['/obras/encerramento', id], { queryParams: { mode: 'print' } }));
    window.open(url, '_blank', 'noopener');
  }

  protected aoFechar(): void {
    this.detalhe.set(null);
    this.erro.set(null);
  }
}
