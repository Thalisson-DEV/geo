import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoBreadcrumbItem,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoPageHeaderComponent,
  GeoStatusComponent,
  GeoSurfaceComponent,
  GeoTabItem,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTone,
  NotificationService,
  geoUrlParam
} from '@geo/ui';
import { map } from 'rxjs';
import {
  HistoricoOrdemServico,
  ItemOrdemServico,
  OpcoesFrota,
  OrcamentoOrdemServico,
  OrdemServicoDetalhe,
  ROTULO_APROVACAO,
  ROTULO_CRITICIDADE,
  ROTULO_ORIGEM_OS,
  ROTULO_SITUACAO_OS,
  rotuloSituacaoOs,
  tomSituacaoOs,
  ROTULO_STATUS_FINANCEIRO,
  ROTULO_TIPO_MANUTENCAO,
  ROTULO_TIPO_OFICINA,
  TOM_APROVACAO,
  TOM_CRITICIDADE,
  TOM_SITUACAO_OS,
  TOM_STATUS_FINANCEIRO,
  formatarMedida,
  formatarPlaca,
  osAberta,
  rotuloOs,
  sufixoUnidade,
  identificacaoOs
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { NavigationHistoryService } from '../../../core/navigation';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaJustificativaDrawerComponent } from '../shared/frota-justificativa-drawer.component';
import { FrotaOrdemServicoConclusaoComponent, ModoConclusao } from './frota-ordem-servico-conclusao.component';
import { EtapaOrdemServico, FrotaOrdemServicoEtapaComponent } from './frota-ordem-servico-etapa.component';
import { FrotaOrdemServicoFormComponent } from './frota-ordem-servico-form.component';
import { FrotaOsDocumentosFiscaisComponent } from './frota-os-documentos-fiscais.component';
import { FrotaOsExecucaoComponent } from './frota-os-execucao.component';
import { FrotaOsHistoricoPlacaComponent } from './frota-os-historico-placa.component';
import { FrotaOsAnexosComponent } from './frota-os-anexos.component';

const ABAS = ['resumo', 'itens', 'execucao', 'documentos', 'orcamentos', 'placa', 'historico'] as const;
type Aba = (typeof ABAS)[number];

/** Ficha da OS: situação, próximos passos, itens com repetição, orçamentos do financeiro e histórico. */
@Component({
  selector: 'app-frota-ordem-servico-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoPageHeaderComponent,
    GeoStatusComponent,
    GeoSurfaceComponent,
    GeoTabPanelDirective,
    GeoTabsComponent,
    FrotaJustificativaDrawerComponent,
    FrotaOrdemServicoConclusaoComponent,
    FrotaOrdemServicoEtapaComponent,
    FrotaOrdemServicoFormComponent,
    FrotaOsDocumentosFiscaisComponent,
    FrotaOsExecucaoComponent,
    FrotaOsHistoricoPlacaComponent,
    FrotaOsAnexosComponent
  ],
  styles: `
    .roteiro { display: grid; gap: 0.375rem; margin-bottom: 0.75rem; }
    .roteiro__titulo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0; font-weight: 600; color: var(--geo-foreground); }
    .roteiro__tarefas { margin: 0; padding-inline-start: 1.5rem; display: grid; gap: 0.25rem; color: var(--geo-foreground); }
    .roteiro__tarefas li::marker { font-weight: 600; color: var(--geo-foreground-subtle); }
    .roteiro__vazio { margin: 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
  `,
  template: `
    <div class="geo-page">
      @if (carregando() && !detalhe()) {
        <geo-async-state state="loading" title="Carregando a ordem de serviço"></geo-async-state>
      } @else if (erro()) {
        <geo-async-state state="error" title="Não foi possível carregar a OS" [description]="erro()!"
          actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></geo-async-state>
      } @else if (detalhe(); as d) {
        <geo-page-header
          [title]="rotuloOs(d.ordem.numero) + ' · ' + identificacao(d.ordem)"
          icon="pi pi-wrench"
          [breadcrumb]="trilha(d)"
          [description]="(d.ordem.base ?? 'Sem base') + ' · ' + rotuloTipo[d.ordem.tipoManutencao] + ' · ' + d.itens.length + (d.itens.length === 1 ? ' item' : ' itens')"
        >
          <ng-container status>
            <geo-status [tone]="tomSituacaoOs(d.ordem)">{{ rotuloSituacaoOs(d.ordem) }}</geo-status>
            <geo-status [tone]="tomCriticidade[d.ordem.criticidade]" emphasis="outline">{{ rotuloCriticidade[d.ordem.criticidade] }}</geo-status>
            @if (d.ordem.atrasada) {
              <geo-status tone="danger" icon="pi-clock">Prazo estourado</geo-status>
            }
          </ng-container>
          <ng-container actions>
            <geo-button variant="outline" icon="pi pi-file" label="Relatório" (pressed)="abrirRelatorio(d.ordem.id)"></geo-button>
            @if (aberta()) {
              <!-- Folha para imprimir e entregar ao mecânico: roteiro e itens para marcar, com as assinaturas. -->
              <geo-button variant="outline" icon="pi pi-print" label="Checklist da oficina" (pressed)="abrirChecklist(d.ordem.id)"></geo-button>
            }
            @if (aberta()) {
              <!-- Uma ação primária por etapa: pendente agenda, agendada inicia, em andamento conclui. -->
              @if (podeAgendar()) {
                <geo-button [variant]="proximaEtapa() === 'agendar' ? 'primary' : 'outline'" icon="pi pi-calendar"
                  [label]="d.ordem.situacao === 'AGENDADA' ? 'Reagendar' : 'Agendar'" (pressed)="abrirEtapa('agendar')"></geo-button>
              }
              @if (acesso.executarOs() && d.ordem.situacao !== 'EM_ANDAMENTO') {
                <geo-button [variant]="proximaEtapa() === 'iniciar' ? 'primary' : 'outline'" icon="pi pi-play" label="Iniciar serviço"
                  (pressed)="abrirEtapa('iniciar')"></geo-button>
              }
              @if (acesso.executarOs() && d.ordem.situacao === 'EM_ANDAMENTO') {
                <geo-button variant="outline" icon="pi pi-history" label="Alterar previsão" (pressed)="abrirEtapa('previsao')"></geo-button>
              }
              @if (acesso.executarOs()) {
                <geo-button [variant]="proximaEtapa() === 'concluir' ? 'primary' : 'outline'" icon="pi pi-check" label="Concluir"
                  (pressed)="abrirConclusao('concluir')"></geo-button>
              }
              @if (acesso.editarOs()) {
                <geo-button variant="ghost" icon="pi pi-pencil" label="Editar" (pressed)="formularioAberto.set(true)"></geo-button>
                <geo-button variant="ghost" icon="pi pi-times" label="Cancelar OS" (pressed)="cancelamentoAberto.set(true)"></geo-button>
              }
            }
            @if (d.ordem.situacao === 'CONCLUIDA' && acesso.executarOs()) {
              @if (d.ordem.baixaPendente) {
                <geo-button icon="pi pi-dollar" label="Lançar valores" (pressed)="aba.set('execucao')"></geo-button>
                <geo-button variant="outline" icon="pi pi-pencil" label="Completar conclusão" (pressed)="abrirConclusao('completar')"></geo-button>
              }
              <!-- Deu problema no teste: a OS volta para a oficina sem abrir outra. -->
              <geo-button variant="ghost" icon="pi pi-replay" label="Voltar para em andamento" (pressed)="reaberturaAberta.set(true)"></geo-button>
            }
          </ng-container>
        </geo-page-header>

        @for (aviso of avisos(); track aviso) {
          <geo-callout tone="warning" [dense]="true">{{ aviso }}</geo-callout>
        }
        <!-- Na aba Execução o aviso já aparece junto das linhas sem valor. -->
        @if (d.ordem.baixaPendente && aba() !== 'execucao') {
          <geo-callout tone="warning" icon="pi pi-hourglass" title="Valores pendentes">
            O serviço foi concluído, mas ainda falta: {{ (d.pendencias ?? []).join('; ') || 'o valor da OS' }}.
            Lance os valores na aba Execução (ou marque como sem custo); com o último valor, a OS fica finalizada sozinha.
          </geo-callout>
        }

        <div class="geo-kpis">
          <div class="geo-kpi" [attr.data-tone]="d.ordem.atrasada ? 'danger' : 'info'">
            <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-clock"></i></span>
            <span class="geo-kpi__body">
              <span class="geo-kpi__label">Execução</span>
              <span class="geo-kpi__value">{{ execucaoTitulo() }}</span>
              <span class="geo-kpi__detail">{{ execucaoDetalhe() }}</span>
            </span>
          </div>
          <button type="button" class="geo-kpi" [attr.data-tone]="tomAprovacao[d.ordem.situacaoAprovacao]" (click)="aba.set('orcamentos')">
            <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-dollar"></i></span>
            <span class="geo-kpi__body">
              <span class="geo-kpi__label">Orçamento</span>
              <span class="geo-kpi__value">{{ !aberta() && d.ordem.situacaoAprovacao === 'SEM_ORCAMENTO' ? 'Sem orçamento' : rotuloAprovacao[d.ordem.situacaoAprovacao] }}</span>
              <span class="geo-kpi__detail">{{ d.orcamentos.length ? d.orcamentos.length + (d.orcamentos.length === 1 ? ' solicitação no financeiro' : ' solicitações no financeiro') : 'Nenhuma solicitação no financeiro' }}</span>
            </span>
            <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
          </button>
          <div class="geo-kpi" [attr.data-tone]="d.ordem.paradaEmCurso ? 'danger' : 'success'">
            <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-stop-circle"></i></span>
            <span class="geo-kpi__body">
              <span class="geo-kpi__label">Veículo</span>
              <span class="geo-kpi__value">{{ d.ordem.paradaEmCurso ? 'Parado' : d.ordem.veiculoParado ? 'Liberado' : 'Operando' }}</span>
              <span class="geo-kpi__detail">{{ paradaDetalhe() }}</span>
            </span>
          </div>
          @if (d.ordem.tipoManutencao !== 'PREVENTIVA') {
          <button type="button" class="geo-kpi" [attr.data-tone]="itensRepetidos() ? 'warning' : 'success'" (click)="aba.set('itens')">
            <span class="geo-kpi__icon" aria-hidden="true"><i class="pi pi-replay"></i></span>
            <span class="geo-kpi__body">
              <span class="geo-kpi__label">Repetição</span>
              <span class="geo-kpi__value">{{ itensRepetidos() ? itensRepetidos() + (itensRepetidos() === 1 ? ' item' : ' itens') : 'Nenhuma' }}</span>
              <span class="geo-kpi__detail">Mesmo item feito na placa dentro da janela</span>
            </span>
            <i class="pi pi-angle-right geo-kpi__go" aria-hidden="true"></i>
          </button>
          }
        </div>

        <geo-tabs [tabs]="abas()" [(value)]="aba" ariaLabel="Seções da ordem de serviço">
          <ng-template geoTabPanel="resumo">
            <geo-surface>
              <section class="geo-sheet-section" aria-labelledby="os-abertura">
                <h2 id="os-abertura"><i class="pi pi-inbox" aria-hidden="true"></i> Abertura</h2>
                <dl class="geo-sheet">
                  <div><dt>Aberta em</dt><dd>{{ d.ordem.abertaEm | date: 'dd/MM/yyyy HH:mm' }}{{ d.ordem.usuarioAbertura ? ' por ' + d.ordem.usuarioAbertura : '' }}</dd></div>
                  <div><dt>Origem</dt><dd>{{ rotuloOrigem[d.ordem.origem] }}
                    @if (d.sinistro; as sin) {
                      · <a [routerLink]="['/frota/sinistros']" [queryParams]="{ sinistro: sin.id }">Sinistro {{ sin.numero }}</a>
                      <span class="geo-cell-muted">{{ sin.tipo }} · {{ sin.situacao }}</span>
                    }
                  </dd></div>
                  <div><dt>Motivo</dt><dd>{{ rotuloMotivo(d.ordem.motivo) }}</dd></div>
                  <div><dt>Condutor no momento</dt><dd>{{ d.ordem.condutor ?? 'Sem condutor vinculado' }}</dd></div>
                  <div><dt>{{ d.ordem.unidadeMedicao === 'HORAS' ? 'Horímetro na abertura' : 'KM na abertura' }}</dt><dd>{{ medida(d.ordem.kmAbertura, sufixo(d.ordem.unidadeMedicao)) }}</dd></div>
                  <div><dt>{{ d.ordem.unidadeMedicao === 'HORAS' ? 'Horímetro atual do veículo' : 'KM atual do veículo' }}</dt><dd>{{ medida(d.kmAtualVeiculo, sufixo(d.ordem.unidadeMedicao)) }}</dd></div>
                  <div class="geo-sheet__wide"><dt>{{ d.preventivas.length ? 'Planos' : 'Problema relatado' }}</dt><dd>{{ problemaRelatado(d) }}</dd></div>
                </dl>
              </section>

              @if (d.preventivas.length) {
                <section class="geo-sheet-section" aria-labelledby="os-preventiva">
                  <h2 id="os-preventiva"><i class="pi pi-calendar-clock" aria-hidden="true"></i> {{ d.preventivas.length === 1 ? 'Plano preventivo' : 'Planos preventivos' }}</h2>
                  @for (p of d.preventivas; track p.idControle) {
                    <div class="roteiro">
                      <p class="roteiro__titulo">{{ p.plano }} @let sp = situacaoPlano(p.situacaoRotulo, d.ordem.situacao);
                        <geo-status [tone]="sp.tom" emphasis="outline">{{ sp.rotulo }}</geo-status></p>
                      @if (tarefas(p.roteiro).length) {
                        <ol class="roteiro__tarefas" [attr.aria-label]="'Roteiro de inspeção de ' + p.plano">
                          @for (t of tarefas(p.roteiro); track $index) { <li>{{ t }}</li> }
                        </ol>
                      } @else {
                        <p class="roteiro__vazio">Plano sem roteiro de inspeção: siga os itens de manutenção.</p>
                      }
                    </div>
                  }
                  <p class="roteiro__vazio">Ao concluir esta OS, o ciclo do plano recomeça com o {{ d.ordem.unidadeMedicao === 'HORAS' ? 'horímetro' : 'KM' }} da entrega.</p>
                </section>
              }

              <section class="geo-sheet-section" aria-labelledby="os-execucao">
                <h2 id="os-execucao"><i class="pi pi-wrench" aria-hidden="true"></i> Oficina e execução</h2>
                <dl class="geo-sheet">
                  <div><dt>Oficina</dt><dd>{{ d.ordem.oficina === rotuloOficina[d.ordem.tipoOficina] ? d.ordem.oficina + ' (a definir)' : rotuloOficina[d.ordem.tipoOficina] + ' · ' + d.ordem.oficina }}</dd></div>
                  <div><dt>Agendada para</dt><dd>{{ (d.ordem.agendadaPara | date: 'dd/MM/yyyy HH:mm') ?? '—' }}{{ d.ordem.localAgendamento ? ' · ' + d.ordem.localAgendamento : '' }}</dd></div>
                  <div><dt>Início real</dt><dd>{{ (d.ordem.inicioReal | date: 'dd/MM/yyyy HH:mm') ?? '—' }}</dd></div>
                  <div><dt>Previsão de término</dt><dd>{{ (d.ordem.previsaoTermino | date: 'dd/MM/yyyy HH:mm') ?? '—' }}</dd></div>
                  <div><dt>Fim real</dt><dd>{{ (d.ordem.fimReal | date: 'dd/MM/yyyy HH:mm') ?? '—' }}</dd></div>
                  <div>
                    <dt>Veículo parado</dt>
                    <dd>
                      {{ paradaDetalhe() }}
                      @if (aberta() && (acesso.editarOs() || acesso.executarOs())) {
                        <span class="geo-section-actions">
                          <geo-button size="sm" variant="outline" [icon]="d.ordem.paradaEmCurso ? 'pi pi-play' : 'pi pi-stop-circle'"
                            [label]="d.ordem.paradaEmCurso ? 'Liberar veículo' : 'Marcar como parado'" [loading]="alterandoParada()"
                            (pressed)="alternarParada()"></geo-button>
                        </span>
                      }
                    </dd>
                  </div>
                </dl>
              </section>

              @if (d.ordem.situacao === 'CONCLUIDA') {
                <section class="geo-sheet-section" aria-labelledby="os-encerramento">
                  <h2 id="os-encerramento"><i class="pi pi-check-circle" aria-hidden="true"></i> Encerramento</h2>
                  <dl class="geo-sheet">
                    <div><dt>Valor total</dt><dd>{{ d.ordem.valorTotal != null ? (d.ordem.valorTotal | currency: 'BRL') : '—' }}</dd></div>
                    <div><dt>{{ d.ordem.unidadeMedicao === 'HORAS' ? 'Horímetro na entrega' : 'KM na entrega' }}</dt><dd>{{ medida(d.ordem.kmEncerramento, sufixo(d.ordem.unidadeMedicao)) }}</dd></div>
                    <div class="geo-sheet__wide"><dt>Serviço realizado</dt><dd>{{ d.ordem.descricaoServico || (d.ordem.baixaPendente ? 'Falta informar' : '—') }}</dd></div>
                    <div class="geo-sheet__wide"><dt>Itens substituídos</dt><dd>{{ d.ordem.itensSubstituidos || '—' }}</dd></div>
                  </dl>
                </section>
              }
              @if (d.ordem.situacao === 'CANCELADA') {
                <section class="geo-sheet-section" aria-labelledby="os-cancelamento">
                  <h2 id="os-cancelamento"><i class="pi pi-ban" aria-hidden="true"></i> Cancelamento</h2>
                  <dl class="geo-sheet">
                    <div><dt>Cancelada em</dt><dd>{{ d.ordem.canceladaEm | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
                    <div class="geo-sheet__wide"><dt>Motivo</dt><dd>{{ d.ordem.motivoCancelamento }}</dd></div>
                  </dl>
                </section>
              }
            </geo-surface>
          </ng-template>

          <ng-template geoTabPanel="itens">
            <geo-data-table
              title="Itens de manutenção"
              [description]="aberta() ? 'A repetição mostrada considera as OS concluídas desta placa até agora.' : 'A repetição foi registrada no encerramento da OS.'"
              storageKey="frota-os-itens"
              searchPlaceholder="Filtrar nesta lista"
              [columns]="colunasItens"
              [rows]="d.itens"
              [rowKey]="chaveItem"
              [state]="d.itens.length ? 'ready' : 'empty'"
              stateTitle="Nenhum item"
            >
              <ng-template geoCell="repeticao" let-row>
                @if (row.repeticao; as r) {
                  <geo-status tone="warning" icon="pi-replay">Repete a {{ rotuloOs(r.numeroOsAnterior) }}</geo-status>
                  <span class="geo-cell-muted">
                    {{ r.diasDesdeAnterior }} dias depois{{ r.fimRealAnterior ? ' (concluída em ' + (r.fimRealAnterior | date: 'dd/MM/yyyy') + ')' : '' }} · janela de {{ r.janelaDias }} dias
                  </span>
                } @else {
                  <geo-status tone="success" icon="pi-check">Sem repetição</geo-status>
                }
              </ng-template>
            </geo-data-table>
          </ng-template>

          <ng-template geoTabPanel="execucao">
            <app-frota-os-execucao [detalhe]="d" [opcoes]="opcoes()" [podeEditar]="acesso.editarOs() || acesso.executarOs()"
              (atualizado)="aplicar($event)"></app-frota-os-execucao>
          </ng-template>

          <ng-template geoTabPanel="documentos">
            <div class="geo-form-stack">
              <app-frota-os-anexos [ordem]="d.ordem" [podeEditar]="acesso.editarOs() || acesso.executarOs()"></app-frota-os-anexos>
              <app-frota-os-documentos-fiscais [ordem]="d.ordem" [podeEditar]="acesso.editarOs() || acesso.executarOs()"></app-frota-os-documentos-fiscais>
            </div>
          </ng-template>

          <ng-template geoTabPanel="orcamentos">
            <geo-data-table
              title="Orçamentos no financeiro"
              description="Compras e pagamentos abertos a partir desta OS. A aprovação acontece no financeiro; a situação aqui é atualizada a cada consulta."
              storageKey="frota-os-orcamentos"
              searchPlaceholder="Filtrar nesta lista"
              rowActionLabel="Abrir no financeiro"
              [columns]="colunasOrcamentos"
              [rows]="d.orcamentos"
              [rowKey]="chaveOrcamento"
              [state]="d.orcamentos.length ? 'ready' : 'empty'"
              stateTitle="Nenhuma solicitação no financeiro"
              [stateDescription]="aceitaOrcamento() ? 'Use Solicitar compra para lançar o orçamento, antes ou depois do serviço. Os dados da OS já vão preenchidos.' : 'A OS foi cancelada sem orçamento no financeiro.'"
              (rowActivate)="abrirSolicitacao($event)"
            >
              <ng-container table-actions>
                @if (aceitaOrcamento() && acesso.solicitarCompra()) {
                  <geo-button size="sm" icon="pi pi-shopping-cart" label="Solicitar compra" (pressed)="solicitar('COMPRA')"></geo-button>
                }
                @if (aceitaOrcamento() && acesso.solicitarPagamento()) {
                  <geo-button size="sm" variant="outline" icon="pi pi-credit-card" label="Solicitar pagamento" (pressed)="solicitar('PAGAMENTO')"></geo-button>
                }
              </ng-container>
              <ng-template geoCell="numero" let-row>
                <span class="geo-cell-strong">{{ row.tipo === 'COMPRA' ? 'Compra' : 'Pagamento' }} nº {{ row.numero }}</span>
                <span class="geo-cell-muted">{{ row.fornecedor ?? 'Fornecedor não informado' }}</span>
              </ng-template>
              <ng-template geoCell="status" let-row>
                <geo-status [tone]="tomFinanceiro[row.status]">{{ rotuloFinanceiro[row.status] }}</geo-status>
                @if (row.motivoRejeicao) {
                  <span class="geo-cell-muted">{{ row.motivoRejeicao }}</span>
                }
              </ng-template>
              <ng-template geoCell="valor" let-row>
                <span class="geo-cell-num">{{ row.valor != null ? (row.valor | currency: 'BRL') : '—' }}</span>
                @if (row.valorAprovado != null && row.valorAprovado !== row.valor) {
                  <span class="geo-cell-muted">Aprovado {{ row.valorAprovado | currency: 'BRL' }}</span>
                }
              </ng-template>
            </geo-data-table>
          </ng-template>

          <ng-template geoTabPanel="placa">
            @if (d.ordem.idVeiculo) {
              <app-frota-os-historico-placa [idOrdem]="d.ordem.id" [idVeiculo]="d.ordem.idVeiculo" [placa]="placa(d.ordem.placa)"
                [itensAtuais]="nomesItens()"></app-frota-os-historico-placa>
            }
          </ng-template>

          <ng-template geoTabPanel="historico">
            <geo-data-table
              title="Histórico"
              description="Tudo o que aconteceu com a OS, com quem fez e quando."
              storageKey="frota-os-historico"
              searchPlaceholder="Filtrar nesta lista"
              [columns]="colunasHistorico"
              [rows]="d.historico"
              [rowKey]="chaveHistorico"
              [state]="d.historico.length ? 'ready' : 'empty'"
              stateTitle="Sem registros"
            >
              <ng-template geoCell="ocorridoEm" let-row>{{ row.ocorridoEm | date: 'dd/MM/yyyy HH:mm' }}</ng-template>
            </geo-data-table>
          </ng-template>
        </geo-tabs>

        <app-frota-ordem-servico-form [(visivel)]="formularioAberto" [ordem]="d" [opcoes]="opcoes()" (salvo)="aplicar($event)"></app-frota-ordem-servico-form>
        <app-frota-ordem-servico-etapa [(visivel)]="etapaAberta" [etapa]="etapa()" [ordem]="d" (salvo)="aplicar($event)"></app-frota-ordem-servico-etapa>
        <app-frota-ordem-servico-conclusao [(visivel)]="conclusaoAberta" [ordem]="d" [opcoes]="opcoes()" [modo]="modoConclusao()" (salvo)="aplicar($event)"></app-frota-ordem-servico-conclusao>
        <app-frota-justificativa-drawer
          [(visivel)]="reaberturaAberta"
          [titulo]="'Voltar ' + rotuloOs(d.ordem.numero) + ' para em andamento'"
          descricao="A data de fim é apagada e o veículo volta a contar como parado. Se ela já estava finalizada, volta a aceitar lançamentos até a nova conclusão."
          rotuloCampo="O que aconteceu"
          placeholder="Ex.: no teste o freio voltou a fazer barulho"
          rotuloConfirmar="Voltar para em andamento"
          [processando]="reabrindo()"
          (confirmado)="reabrir($event)"
        ></app-frota-justificativa-drawer>
        <app-frota-justificativa-drawer
          [(visivel)]="cancelamentoAberto"
          [titulo]="'Cancelar ' + rotuloOs(d.ordem.numero)"
          descricao="A OS sai do painel e o veículo é liberado se estava parado por ela. Compras em aberto no financeiro precisam ser canceladas antes."
          rotuloConfirmar="Cancelar OS"
          [destrutivo]="true"
          [processando]="cancelando()"
          (confirmado)="cancelar($event)"
        ></app-frota-justificativa-drawer>
      }
    </div>
  `
})
export class FrotaOrdemServicoDetalheComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly historicoNavegacao = inject(NavigationHistoryService);
  protected readonly acesso = acessoFrota();
  /** Recorte da lista de onde a pessoa veio, para a trilha voltar a ele. */
  private readonly origem =
    this.recorteDaLista(this.historicoNavegacao.currentEntry()?.url) ??
    this.recorteDaLista(this.historicoNavegacao.previousEntry()?.url);

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  protected readonly placa = formatarPlaca;
  protected readonly identificacao = identificacaoOs;
  protected readonly medida = formatarMedida;
  protected readonly sufixo = sufixoUnidade;
  protected readonly rotuloOs = rotuloOs;
  protected readonly tomSituacao: Record<string, GeoTone> = TOM_SITUACAO_OS;
  protected readonly rotuloSituacao: Record<string, string> = ROTULO_SITUACAO_OS;
  protected readonly tomCriticidade: Record<string, GeoTone> = TOM_CRITICIDADE;
  protected readonly rotuloCriticidade: Record<string, string> = ROTULO_CRITICIDADE;
  protected readonly tomAprovacao: Record<string, GeoTone> = TOM_APROVACAO;
  protected readonly rotuloAprovacao: Record<string, string> = ROTULO_APROVACAO;
  protected readonly tomFinanceiro: Record<string, GeoTone> = TOM_STATUS_FINANCEIRO;
  protected readonly rotuloFinanceiro: Record<string, string> = ROTULO_STATUS_FINANCEIRO;
  protected readonly rotuloTipo: Record<string, string> = ROTULO_TIPO_MANUTENCAO;
  protected readonly rotuloOrigem: Record<string, string> = ROTULO_ORIGEM_OS;
  protected readonly rotuloOficina: Record<string, string> = ROTULO_TIPO_OFICINA;

  protected readonly detalhe = signal<OrdemServicoDetalhe | null>(null);
  protected readonly avisos = signal<string[]>([]);
  protected readonly opcoes = signal<OpcoesFrota | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly formularioAberto = signal(false);
  protected readonly etapaAberta = signal(false);
  protected readonly etapa = signal<EtapaOrdemServico>('agendar');
  protected readonly conclusaoAberta = signal(false);
  protected readonly modoConclusao = signal<ModoConclusao>('concluir');
  protected readonly reaberturaAberta = signal(false);
  protected readonly reabrindo = signal(false);
  protected readonly rotuloSituacaoOs = rotuloSituacaoOs;
  protected readonly tomSituacaoOs = tomSituacaoOs;
  protected readonly cancelamentoAberto = signal(false);
  protected readonly cancelando = signal(false);
  protected readonly alterandoParada = signal(false);

  protected readonly aba = geoUrlParam<Aba>({ values: ABAS, default: 'resumo' });
  protected readonly aberta = computed(() => !!this.detalhe() && osAberta(this.detalhe()!.ordem.situacao));
  /** A ação que a OS pede agora, destacada no cabeçalho. */
  protected readonly proximaEtapa = computed<'agendar' | 'iniciar' | 'concluir'>(() => {
    switch (this.detalhe()?.ordem.situacao) {
      case 'PENDENTE': return this.podeAgendar() ? 'agendar' : 'iniciar';
      case 'AGENDADA': return 'iniciar';
      default: return 'concluir';
    }
  });

  /** Na preventiva a descrição traz o roteiro, que já aparece organizado abaixo: aqui fica só "Preventiva: A, B." */
  protected problemaRelatado(d: OrdemServicoDetalhe): string {
    if (!d.preventivas.length) return d.ordem.descricao;
    const corte = d.ordem.descricao.indexOf('\n\nRoteiro');
    return corte > 0 ? d.ordem.descricao.slice(0, corte) : d.ordem.descricao;
  }

  /** Antes de a oficina começar, o plano está aguardando — "em execução" só depois do início. */
  protected situacaoPlano(rotulo: string, situacaoOs: string): { rotulo: string; tom: GeoTone } {
    if (rotulo === 'Realizada') return { rotulo, tom: 'success' };
    if (rotulo === 'Cancelada') return { rotulo, tom: 'neutral' };
    return situacaoOs === 'EM_ANDAMENTO' ? { rotulo, tom: 'info' } : { rotulo: 'Aguardando a oficina', tom: 'neutral' };
  }

  protected readonly podeAgendar = computed(() => {
    const s = this.detalhe()?.ordem.situacao;
    return (s === 'PENDENTE' || s === 'AGENDADA') && (this.acesso.editarOs() || this.acesso.executarOs());
  });
  protected readonly nomesItens = computed(() => this.detalhe()?.itens.map((i) => i.nome) ?? []);
  /** Compra e pagamento valem antes ou depois do serviço; só a OS cancelada não recebe. */
  protected readonly aceitaOrcamento = computed(() => !!this.detalhe() && this.detalhe()!.ordem.situacao !== 'CANCELADA');
  protected readonly itensRepetidos = computed(() => this.detalhe()?.itens.filter((i) => i.repeticao).length ?? 0);

  protected readonly abas = computed<GeoTabItem[]>(() => {
    const d = this.detalhe();
    return [
      { value: 'resumo', label: 'Resumo', icon: 'pi pi-file' },
      { value: 'itens', label: 'Itens', icon: 'pi pi-list', badge: d?.itens.length || undefined },
      { value: 'execucao', label: 'Execução', icon: 'pi pi-wrench', badge: (d ? d.servicos.length + d.pecas.length : 0) || undefined },
      { value: 'documentos', label: 'Anexos e notas', icon: 'pi pi-paperclip' },
      { value: 'orcamentos', label: 'Orçamentos', icon: 'pi pi-dollar', badge: d?.orcamentos.length || undefined },
      // A OS sem veículo (ferramental, oficina) não tem placa para buscar o histórico.
      ...(d?.ordem.idVeiculo ? [{ value: 'placa', label: 'Manutenções da placa', icon: 'pi pi-car' }] : []),
      { value: 'historico', label: 'Histórico da OS', icon: 'pi pi-history' }
    ];
  });

  protected readonly execucaoTitulo = computed(() => {
    const os = this.detalhe()?.ordem;
    if (!os) return '';
    switch (os.situacao) {
      case 'PENDENTE': return 'Aguardando agenda';
      case 'AGENDADA': return 'Agendada';
      case 'EM_ANDAMENTO': return os.atrasada ? 'Prazo estourado' : 'Em andamento';
      case 'CONCLUIDA': return os.baixaPendente ? 'Concluída, valores pendentes' : 'Finalizada';
      default: return 'Cancelada';
    }
  });

  protected readonly execucaoDetalhe = computed(() => {
    const os = this.detalhe()?.ordem;
    if (!os) return '';
    const f = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
    switch (os.situacao) {
      case 'PENDENTE': return `Aberta em ${f(os.abertaEm)}`;
      case 'AGENDADA': return `Para ${f(os.agendadaPara)}${os.localAgendamento ? ' · ' + os.localAgendamento : ''}`;
      case 'EM_ANDAMENTO': return os.previsaoTermino ? `Previsão ${f(os.previsaoTermino)}` : `Desde ${f(os.inicioReal)}, sem previsão`;
      case 'CONCLUIDA': return `De ${f(os.inicioReal)} a ${f(os.fimReal)}`;
      default: return `Em ${f(os.canceladaEm)}`;
    }
  });

  protected readonly paradaDetalhe = computed(() => {
    const os = this.detalhe()?.ordem;
    if (!os || !os.veiculoParado) return 'A OS não parou o veículo';
    const desde = os.paradoDesde ? new Date(os.paradoDesde) : null;
    const ate = os.liberadoEm ? new Date(os.liberadoEm) : new Date();
    const horas = desde ? Math.max(0, Math.round((ate.getTime() - desde.getTime()) / 36e5)) : 0;
    const duracao = horas >= 48 ? `${Math.round(horas / 24)} dias` : `${horas} h`;
    return os.liberadoEm ? `Ficou parado ${duracao}` : `Parado há ${duracao}`;
  });

  protected readonly colunasItens: GeoDataTableColumn<ItemOrdemServico>[] = [
    { key: 'nome', header: 'Item', priority: 1 },
    { key: 'naturezaRotulo', header: 'Natureza' },
    { key: 'repeticao', header: 'Repetição', type: 'custom', priority: 1, value: (r) => r.repeticao?.diasDesdeAnterior ?? 9999, display: (r) => (r.repeticao ? `Repete a OS ${r.repeticao.numeroOsAnterior}` : 'Sem repetição') }
  ];

  protected readonly colunasOrcamentos: GeoDataTableColumn<OrcamentoOrdemServico>[] = [
    { key: 'numero', header: 'Solicitação', type: 'custom', priority: 1, value: (r) => r.numero, display: (r) => `${r.tipo} ${r.numero}` },
    { key: 'status', header: 'Situação', type: 'custom', priority: 1, value: (r) => r.status, display: (r) => ROTULO_STATUS_FINANCEIRO[r.status] },
    { key: 'valor', header: 'Valor', type: 'custom', value: (r) => r.valor, display: (r) => String(r.valor ?? '') },
    { key: 'descricao', header: 'Descrição', display: (r) => r.descricao ?? '—' }
  ];

  protected readonly colunasHistorico: GeoDataTableColumn<HistoricoOrdemServico>[] = [
    { key: 'ocorridoEm', header: 'Quando', type: 'custom', priority: 1, value: (r) => r.ocorridoEm, display: (r) => r.ocorridoEm },
    { key: 'tipoRotulo', header: 'Evento', priority: 1 },
    { key: 'descricao', header: 'Detalhe', display: (r) => r.descricao ?? '' },
    { key: 'usuario', header: 'Por', display: (r) => r.usuario ?? '—' }
  ];

  protected readonly chaveItem = (r: ItemOrdemServico) => r.idItem;
  protected readonly chaveOrcamento = (r: OrcamentoOrdemServico) => r.idSolicitacao;
  /** Roteiro copiado na abertura ("1. Trocar o óleo"), sem a numeração: a lista numera. */
  protected tarefas(roteiro: string | null): string[] {
    return (roteiro ?? '').split('\n').map((l) => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
  }

  protected readonly chaveHistorico = (r: HistoricoOrdemServico) => `${r.ocorridoEm}-${r.tipo}-${r.descricao}`;

  constructor() {
    this.frota.opcoes().subscribe({ next: (o) => this.opcoes.set(o), error: () => undefined });
    effect(() => {
      if (this.id()) this.carregar();
    });
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.frota.detalharOrdemServico(this.id()).subscribe({
      next: (d) => {
        this.detalhe.set(d);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
  }

  /** Resposta de uma ação: mostra a OS atualizada e os avisos que a ação gerou. */
  protected aplicar(detalhe: OrdemServicoDetalhe): void {
    this.detalhe.set(detalhe);
    this.avisos.set(detalhe.avisos);
  }

  protected abrirEtapa(etapa: EtapaOrdemServico): void {
    this.etapa.set(etapa);
    this.etapaAberta.set(true);
  }

  protected alternarParada(): void {
    const os = this.detalhe()?.ordem;
    if (!os) return;
    this.alterandoParada.set(true);
    this.frota.alterarParadaOrdemServico(os.id, !os.paradaEmCurso).subscribe({
      next: (d) => {
        this.alterandoParada.set(false);
        this.aplicar(d);
        this.notificacoes.success(d.ordem.paradaEmCurso ? 'Veículo marcado como parado.' : 'Veículo liberado.');
      },
      error: (e) => {
        this.alterandoParada.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected abrirConclusao(modo: ModoConclusao): void {
    this.modoConclusao.set(modo);
    this.conclusaoAberta.set(true);
  }

  protected reabrir(motivo: string): void {
    const os = this.detalhe()?.ordem;
    if (!os) return;
    this.reabrindo.set(true);
    this.frota.reabrirOrdemServico(os.id, motivo).subscribe({
      next: (d) => {
        this.reabrindo.set(false);
        this.reaberturaAberta.set(false);
        this.aplicar(d);
        this.notificacoes.success(`${rotuloOs(d.ordem.numero)} voltou para em andamento.`);
      },
      error: (e) => {
        this.reabrindo.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected cancelar(motivo: string): void {
    const os = this.detalhe()?.ordem;
    if (!os) return;
    this.cancelando.set(true);
    this.frota.cancelarOrdemServico(os.id, motivo).subscribe({
      next: (d) => {
        this.cancelando.set(false);
        this.cancelamentoAberto.set(false);
        this.aplicar(d);
        this.notificacoes.success(`${rotuloOs(d.ordem.numero)} cancelada.`);
      },
      error: (e) => {
        this.cancelando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Leva ao formulário do financeiro já preenchido com os dados da OS. */
  protected solicitar(tipo: 'COMPRA' | 'PAGAMENTO'): void {
    const os = this.detalhe()?.ordem;
    if (!os) return;
    void this.router.navigate(['/financeiro', tipo === 'COMPRA' ? 'compras' : 'pagamentos', 'nova'], {
      queryParams: { origem: 'FROTA_OS', origemId: os.id }
    });
  }

  protected abrirRelatorio(id: string): void {
    void this.router.navigate(['/frota', 'ordens-servico', id, 'relatorio']);
  }

  protected abrirChecklist(id: string): void {
    void this.router.navigate(['/frota', 'ordens-servico', id, 'checklist']);
  }

  protected abrirSolicitacao(orcamento: OrcamentoOrdemServico): void {
    void this.router.navigate(['/financeiro', orcamento.tipo === 'COMPRA' ? 'compras' : 'pagamentos', orcamento.idSolicitacao]);
  }

  protected rotuloMotivo(valor: string | null): string {
    if (!valor) return '—';
    return this.opcoes()?.motivosServico.find((m) => m.valor === valor)?.rotulo ?? valor;
  }

  protected trilha(d: OrdemServicoDetalhe): GeoBreadcrumbItem[] {
    return [
      { label: 'Frota' },
      { label: 'Ordens de serviço', route: '/frota/ordens-servico', queryParams: this.origem },
      { label: rotuloOs(d.ordem.numero) }
    ];
  }

  private recorteDaLista(url: string | undefined): Params | null {
    if (!url) return null;
    const arvore = this.router.parseUrl(url);
    const caminho = arvore.root.children['primary']?.segments.map((s) => s.path).join('/');
    return caminho === 'frota/ordens-servico' ? arvore.queryParams : null;
  }
}
