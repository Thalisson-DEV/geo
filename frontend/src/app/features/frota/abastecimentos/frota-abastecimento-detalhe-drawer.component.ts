import { DatePipe, NgTemplateOutlet, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesDrawerComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import {
  AbastecimentoDetalhe,
  AvisoPosto,
  FotoAbastecimento,
  ItemAbastecimento,
  PostoAbastecimento,
  ROTULO_CATEGORIA_PRODUTO,
  SugestaoPrecoPosto
} from '../../../core/models/frota-abastecimento.models';
import { FrotaResumoAssistenteComponent } from '../shared/frota-resumo-assistente.component';
import { acessoFrota } from '../shared/frota-acesso';
import { ConsumoAbastecimentoTelemetria, LocalAbastecimento, formatarConsumo, formatarRodado } from '../../../core/models/frota-telemetria.models';
import { CirculoMapa, FrotaMapaTelemetriaComponent, LigacaoMapa, MarcadorMapa } from '../telemetria/frota-mapa-telemetria.component';
import { FrotaTelemetriaService } from '../../../core/services/frota-telemetria.service';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';
import {
  ICONE_SITUACAO,
  TOM_SITUACAO,
  formatarWhatsapp,
  haQuantoTempo,
  moeda,
  precoUnitario,
  produtoTrocado,
  quantidade
} from './frota-abastecimento.util';

type Formulario = 'aprovar' | 'reprovar' | 'liberar' | 'cancelar' | null;

interface EtapaFluxo {
  rotulo: string;
  estado: 'feito' | 'atual' | 'futuro' | 'interrompido';
  icone: string;
  quando: string | null;
  quem: string | null;
}

interface Prazo {
  rotulo: string;
  valor: string;
  apoio: string | null;
  aviso: boolean;
}

/**
 * Abastecimento para decidir, no mesmo desenho do detalhe da solicitação de material: abertura no
 * tom da situação, fluxo das quatro etapas, o que conferir, fatos em cartões, itens, aviso ao posto
 * e fotos. As decisões ficam no rodapé, conforme a permissão.
 */
@Component({
  selector: 'app-frota-abastecimento-detalhe-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    FrotaMapaTelemetriaComponent,
    CesAsyncStateComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesDrawerComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesStatusComponent,
    CesTextareaComponent,
    FrotaResumoAssistenteComponent
  ],
  styleUrl: './frota-abastecimento-detalhe-drawer.component.css',
  template: `
    <ces-drawer [(visible)]="visible" eyebrow="Abastecimento" [title]="titulo()" size="lg">
      @if (carregando() && !detalhe()) {
        <div class="dd-skeleton" role="status" aria-label="Carregando o abastecimento">
          <span></span><span></span><span></span><span></span>
        </div>
      } @else if (erro()) {
        <ces-async-state state="error" title="Não foi possível carregar o abastecimento" [description]="erro()!" [compact]="true"
          actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></ces-async-state>
      } @else if (detalhe(); as d) {
        <div class="dd">
          <section class="dd-hero" [attr.data-tone]="tom[d.situacao]" aria-label="Resumo">
            <div class="dd-hero__topo">
              <ces-status [tone]="tom[d.situacao]" [icon]="'pi ' + icone[d.situacao]" emphasis="solid">{{ d.situacaoRotulo }}</ces-status>
              @if (d.alertas.length) {
                <ces-status tone="warning" icon="pi pi-exclamation-triangle">{{ d.alertas.length === 1 ? '1 ponto para conferir' : d.alertas.length + ' pontos para conferir' }}</ces-status>
              }
              @if (consumoTelemetria()?.local; as l) {
            @if (l.longeDoPosto) {
              <section class="dd-local" aria-labelledby="abs-local">
                <h3 id="abs-local" class="dd-titulo-secao"><i class="pi pi-map-marker" aria-hidden="true"></i>Onde estava o veículo</h3>
                <app-frota-mapa-telemetria style="--mapa-altura: 220px" [marcadores]="marcadoresLocal(l)" [circulos]="circuloPosto(l)"
                  [ligacoes]="ligacaoLocal(l)" descricao="Posição do veículo no horário do abastecimento e o lugar do posto"></app-frota-mapa-telemetria>
                <p class="dd-muted">Em vermelho, o veículo no horário do abastecimento; em azul, onde ele costuma abastecer neste posto.</p>
              </section>
            }
          }

          @if (avisoPendente()) {
                <ces-status tone="warning" icon="pi pi-whatsapp">Falta avisar o posto</ces-status>
              }
              @if (d.itens.some(trocado)) {
                <ces-status tone="info" icon="pi pi-sync">Produto trocado no posto</ces-status>
              }
              @if (d.origem === 'AVULSA') {
                <ces-status tone="neutral" icon="pi pi-bolt">Avulso, lançado na web</ces-status>
              }
            </div>
            @if (d.destino) {
              <p class="dd-hero__rota">
                <i class="pi pi-map" aria-hidden="true"></i>
                <span>Destino</span>
                <strong>{{ d.destino }}</strong>
              </p>
            }
            <p class="dd-hero__rota">
              <i class="pi pi-building" aria-hidden="true"></i>
              <span>{{ d.baseNome ?? 'Sem base' }}</span>
              <i class="pi pi-arrow-right dd-hero__seta" aria-hidden="true"></i>
              <strong>{{ d.posto }}</strong>
              @if (d.postoWhatsapp) {
                <span class="dd-hero__tipo">{{ whatsapp(d.postoWhatsapp) }}</span>
              }
            </p>
            <p class="dd-hero__meta">
              {{ d.origem === 'AVULSA' ? 'Lançado' : 'Pedido' }} por <strong>{{ d.solicitante ?? 'alguém da equipe' }}</strong> em {{ d.solicitadoEm | date: "dd/MM/yyyy 'às' HH:mm" }} · {{ espera(d.solicitadoEm) }}
            </p>
          </section>

          <app-frota-resumo-assistente alvo="ABASTECIMENTO" [idAlvo]="d.id" [aguardando]="fotosNoCelular() > 0"
            (relatorio)="abrirRelatorio(d.id)"></app-frota-resumo-assistente>

          <ol class="dd-fluxo" aria-label="Andamento">
            @for (e of fluxo(); track e.rotulo) {
              <li class="dd-fluxo__etapa" [attr.data-estado]="e.estado" [attr.aria-current]="e.estado === 'atual' ? 'step' : null">
                <span class="dd-fluxo__marca"><i [class]="'pi ' + e.icone" aria-hidden="true"></i></span>
                <span class="dd-fluxo__texto">
                  <strong>{{ e.rotulo }}</strong>
                  @if (e.quando) { <span>{{ e.quando }}</span> }
                  @if (e.quem) { <span>{{ e.quem }}</span> }
                </span>
              </li>
            }
          </ol>

          @switch (d.situacao) {
            @case ('REPROVADA') {
              <ces-callout tone="danger" icon="pi pi-times" [title]="'Reprovado por ' + (d.aprovador ?? 'gestor')">{{ d.motivoReprovacao }}</ces-callout>
            }
            @case ('CANCELADA') {
              <ces-callout tone="neutral" icon="pi pi-ban" [title]="'Cancelado por ' + (d.cancelador ?? '—')">
                {{ d.motivoCancelamento ?? 'Sem motivo informado.' }}
                @if (semAvisoNecessario()) { <span class="dd-nota">O posto não chegou a ser avisado da liberação, então não precisa avisar o cancelamento.</span> }
              </ces-callout>
            }
            @case ('VENCIDA') {
              <ces-callout tone="neutral" icon="pi pi-hourglass" title="Venceu sem uso">Não foi usado até as 23h59 do dia. Se ainda precisar, a equipe pede de novo.</ces-callout>
            }
          }

          @if (d.alertas.length) {
            <ces-callout tone="warning" icon="pi pi-exclamation-triangle" [title]="tituloAlertas()">
              <ul class="dd-alertas">
                @for (a of d.alertas; track a.tipo + a.etapa) {
                  <li><strong>{{ a.tipoRotulo }}</strong><span>{{ a.mensagem }}</span></li>
                }
              </ul>
            </ces-callout>
          }

          @if (avisoPendente()) {
            <ng-container [ngTemplateOutlet]="avisos" [ngTemplateOutletContext]="{ $implicit: d }"></ng-container>
          }

          <section class="dd-fatos" aria-label="Veículo e prazo">
            <div class="dd-fato">
              <span class="dd-label">Condutor</span>
              <strong>{{ d.condutor ?? '—' }}</strong>
              @if (d.solicitante && d.solicitante !== d.condutor) { <span class="dd-muted">{{ d.origem === 'AVULSA' ? 'Lançado' : 'Pedido' }} por {{ d.solicitante }}</span> }
            </div>
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">{{ d.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }} no pedido</span>
              <strong>{{ d.medicaoSolicitacao == null ? 'Não informado' : medicao(d.medicaoSolicitacao, d.unidadeMedicao) }}</strong>
              @if (d.medicaoRealizado != null) {
                <span class="dd-muted">No posto: {{ medicao(d.medicaoRealizado, d.unidadeMedicao) }}</span>
              } @else if (d.origem === 'AVULSA') {
                <span class="dd-muted">{{ d.medicaoSolicitacao == null ? 'O avulso não pede KM' : 'Informado por quem lançou' }}</span>
              } @else {
                <span class="dd-muted">Conferir com a foto do painel</span>
              }
            </div>
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">{{ prazo().rotulo }}</span>
              <strong [class.dd-texto-aviso]="prazo().aviso">{{ prazo().valor }}</strong>
              @if (prazo().apoio) { <span class="dd-muted">{{ prazo().apoio }}</span> }
            </div>
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">Tanque</span>
              <strong>{{ d.capacidadeTanque ? qtd(d.capacidadeTanque, 'l') : 'Não informado' }}</strong>
              <span class="dd-muted">{{ d.capacidadeTanque ? 'Capacidade da ficha do veículo' : 'Cadastre na ficha para checar o volume' }}</span>
            </div>
            @if (consumoTelemetria(); as c) {
              <div class="dd-fato dd-fato--destaque">
                <span class="dd-label">Pela telemetria</span>
                @if (c.disponivel) {
                  <strong>{{ consumo(c.consumo, c.unidade) }}{{ c.consumo != null ? ' (estimado)' : '' }}</strong>
                  <span class="dd-muted">{{ rodado(c.rodado, c.unidade) }} rodados desde o abastecimento de {{ c.anteriorEm | date: 'dd/MM' }}</span>
                } @else {
                  <strong>Sem número</strong>
                  <span class="dd-muted">{{ c.motivo }}</span>
                }
              </div>
            }
          </section>

          @if (d.observacao) {
            <blockquote class="dd-obs"><span class="dd-label">Observação da equipe</span>{{ d.observacao }}</blockquote>
          }

          <section aria-labelledby="abs-itens">
            <h3 id="abs-itens" class="dd-titulo-secao">
              <i class="pi pi-shopping-bag" aria-hidden="true"></i>{{ entregue() ? 'Pedido e entregue' : 'Pedido' }}
              <span class="dd-muted">{{ d.itens.length }} {{ d.itens.length === 1 ? 'item' : 'itens' }}</span>
            </h3>
            <div class="dd-tabela" [class.dd-tabela--entregue]="entregue()" role="table" aria-label="Itens do abastecimento">
              <div class="dd-tabela__linha dd-tabela__cab" role="row">
                <span role="columnheader">Produto</span>
                <span role="columnheader" class="dd-num">Autorizado</span>
                @if (entregue()) {
                  <span role="columnheader" class="dd-num">Entregue</span>
                  <span role="columnheader" class="dd-num">Valor</span>
                }
              </div>
              @for (i of d.itens; track i.id) {
                <div class="dd-tabela__linha" role="row">
                  <span role="cell" class="dd-material">
                    <strong>{{ i.produto ?? i.produtoPedido }}</strong>
                    <span class="dd-muted">{{ categoria[i.categoria] }}@if (i.tanqueCheio) { · completou o tanque }</span>
                    @if (trocado(i)) {
                      <ces-status tone="info" icon="pi pi-sync">Pedido: {{ i.produtoPedido }}</ces-status>
                    }
                  </span>
                  <span role="cell" class="dd-num">
                    <strong>{{ autorizado(i) }}</strong>
                    @if (ajusteLiberacao(i); as ajuste) { <span class="dd-muted">{{ ajuste }}</span> }
                  </span>
                  @if (entregue()) {
                    <span role="cell" class="dd-num">{{ qtd(i.quantidade, i.unidade) }}</span>
                    <span role="cell" class="dd-num">
                      <strong>{{ dinheiro(i.valorTotal) }}</strong>
                      <span class="dd-muted">{{ preco(i.valorUnitario, i.unidade) }}</span>
                    </span>
                  }
                </div>
              }
              @if (d.valorTotal != null && d.itens.length > 1) {
                <div class="dd-tabela__linha dd-tabela__total" role="row">
                  <span role="cell">Total</span>
                  @if (entregue()) { <span role="cell"></span><span role="cell"></span> }
                  <span role="cell" class="dd-num">{{ dinheiro(d.valorTotal) }}</span>
                </div>
              }
            </div>
          </section>

          @if (d.sugestoesPreco.length) {
            <section aria-labelledby="abs-precos">
              <h3 id="abs-precos" class="dd-titulo-secao"><i class="pi pi-tag" aria-hidden="true"></i>Preço lido no cupom</h3>
              @for (s of d.sugestoesPreco; track s.id) {
                <div class="dd-aviso">
                  <div class="dd-aviso__topo">
                    <span class="dd-aviso__para">
                      <i class="pi pi-tag" aria-hidden="true"></i>
                      <span>
                        <strong>{{ s.produto }} no {{ s.posto }}</strong>
                        <span class="dd-muted">Cadastro: {{ s.precoCadastrado == null ? 'sem preço' : preco(s.precoCadastrado, 'l') }} · Cupom de {{ s.dataCupom | date: 'dd/MM' }}: {{ preco(s.precoCupom, 'l') }}</span>
                      </span>
                    </span>
                    <ces-status [tone]="s.situacao === 'PENDENTE' ? 'warning' : s.situacao === 'CONFIRMADA' ? 'success' : 'neutral'">{{ s.situacaoRotulo }}</ces-status>
                  </div>
                  @if (s.situacao === 'PENDENTE') {
                    <p class="dd-aviso__mensagem">O Assistente leu um preço diferente do cadastrado. Confira o cupom: ao confirmar, o novo preço vale a partir do dia do cupom.</p>
                    <div class="dd-aviso__acoes">
                      <ces-button size="sm" icon="pi pi-check" label="Atualizar o preço do posto" [loading]="salvando()" (pressed)="decidirPreco(s, true)"></ces-button>
                      <ces-button variant="ghost" size="sm" icon="pi pi-times" label="Manter o atual" (pressed)="decidirPreco(s, false)"></ces-button>
                    </div>
                  } @else if (s.decididoPor) {
                    <p class="dd-aviso__mensagem">Decidido por {{ s.decididoPor }} em {{ s.decididoEm | date: "dd/MM 'às' HH:mm" }}.</p>
                  }
                </div>
              }
            </section>
          }

          @if (avisosVisiveis().length && !avisoPendente()) {
            <ng-container [ngTemplateOutlet]="avisos" [ngTemplateOutletContext]="{ $implicit: d }"></ng-container>
          }

          @if (d.fotos.length) {
          <section aria-labelledby="abs-fotos">
            <h3 id="abs-fotos" class="dd-titulo-secao">
              <i class="pi pi-camera" aria-hidden="true"></i>Fotos
              @if (fotosNoCelular()) { <span class="dd-muted">{{ fotosNoCelular() === 1 ? '1 ainda no celular' : fotosNoCelular() + ' ainda no celular' }}</span> }
            </h3>
            <div class="dd-fotos">
              @for (f of d.fotos; track f.id) {
                <figure class="dd-foto">
                  @if (urls()[f.id]; as url) {
                    <a class="dd-foto__quadro" [href]="url" target="_blank" rel="noopener" [attr.aria-label]="'Abrir a foto: ' + f.tipoRotulo"><img [src]="url" [alt]="f.tipoRotulo" /></a>
                  } @else if (f.recebida) {
                    <span class="dd-foto__quadro dd-foto__vazia"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i>Carregando</span>
                  } @else {
                    <span class="dd-foto__quadro dd-foto__vazia"><i class="pi pi-mobile" aria-hidden="true"></i>Ainda no celular<br />chega com sinal</span>
                  }
                  <figcaption>{{ f.tipoRotulo }}</figcaption>
                </figure>
              }
            </div>
          </section>
          }
        </div>
      }

      <ng-template #avisos let-d>
        <section aria-labelledby="abs-avisos">
          <h3 id="abs-avisos" class="dd-titulo-secao"><i class="pi pi-whatsapp" aria-hidden="true"></i>Aviso ao posto</h3>
          @for (a of avisosVisiveis(); track a.id) {
            <div class="dd-aviso">
              <div class="dd-aviso__topo">
                <span class="dd-aviso__para">
                  <i class="pi pi-whatsapp" aria-hidden="true"></i>
                  <span>
                    <strong>{{ a.motivo === 'LIBERACAO' ? 'Liberação' : 'Cancelamento' }} para {{ d.posto }}</strong>
                    <span class="dd-muted">{{ d.postoWhatsapp ? whatsapp(d.postoWhatsapp) : 'Sem WhatsApp cadastrado' }}</span>
                  </span>
                </span>
                @if (a.situacao === 'ENVIADO') {
                  <ces-status tone="success" icon="pi pi-check">Aberto por {{ a.abertoPor ?? '—' }} às {{ a.abertoEm | date: 'HH:mm' }}</ces-status>
                } @else {
                  <ces-status tone="warning" icon="pi pi-clock">Falta avisar</ces-status>
                }
              </div>
              <p class="dd-aviso__mensagem">{{ a.mensagem }}</p>
              <div class="dd-aviso__acoes">
                @if (a.linkWhatsapp) {
                  <ces-button [variant]="a.situacao === 'ENVIADO' ? 'outline' : 'primary'" size="sm" icon="pi pi-whatsapp"
                    [label]="a.situacao === 'ENVIADO' ? 'Abrir de novo' : 'Avisar no WhatsApp'" (pressed)="avisar(a)"></ces-button>
                }
                <ces-button variant="ghost" size="sm" icon="pi pi-copy" label="Copiar mensagem" (pressed)="copiar(a)"></ces-button>
              </div>
            </div>
          }
        </section>
      </ng-template>

      <div drawer-footer class="dd-rodape">
        <span class="dd-linha-botoes">
          @if (detalhe(); as d) {
            <ces-button variant="outline" icon="pi pi-file" label="Relatório" (pressed)="abrirRelatorio(d.id)"></ces-button>
          }
          @if (detalhe() && assistente()) {
            <ces-icon-button icon="pi pi-sparkles" label="Analisar este abastecimento com o Assistente" tooltip="Analisar com o Assistente" (pressed)="analisarComAssistente()"></ces-icon-button>
          }
        </span>
        <span class="dd-linha-botoes">
          @if (detalhe(); as d) {
            @if (d.podeCancelar) {
              <ces-button variant="ghost" icon="pi pi-ban" label="Cancelar pedido" (pressed)="abrirFormulario('cancelar')"></ces-button>
            }
            @if (d.podeAprovar) {
              <ces-button variant="outline" icon="pi pi-times" label="Reprovar" (pressed)="abrirFormulario('reprovar')"></ces-button>
              <ces-button icon="pi pi-check" label="Aprovar" (pressed)="abrirFormulario('aprovar')"></ces-button>
            } @else if (d.podeLiberar) {
              <ces-button icon="pi pi-send" label="Liberar" (pressed)="abrirFormulario('liberar')"></ces-button>
            } @else if (!d.podeCancelar) {
              <ces-button variant="ghost" label="Fechar" (pressed)="visible.set(false)"></ces-button>
            }
          }
        </span>
      </div>
    </ces-drawer>

    <ces-form-drawer [visible]="formulario() !== null" (visibleChange)="!$event && formulario.set(null)" [title]="tituloFormulario()"
      [description]="titulo()" [dirty]="!!motivo().trim()" [loading]="salvando()" size="sm">
      @if (detalhe(); as d) {
        <div class="ces-form-stack">
          @switch (formulario()) {
            @case ('aprovar') {
              @if (d.destino) {
                <ces-callout tone="info" [dense]="true" icon="pi pi-map" title="Destino informado pela equipe">{{ d.destino }}</ces-callout>
              }
              <ces-form-section title="Quantidade de cada item" icon="pi pi-sliders-h"
                description="A equipe pede só o produto. Defina quanto abastecer pelo destino; zero tira o item.">
                @for (i of d.itens; track i.id) {
                  <div class="item-liberar">
                    <span>{{ i.produtoPedido }}<span class="dd-muted"> · {{ categoria[i.categoria] }}</span></span>
                    <ces-number-input [label]="'Quantidade de ' + i.produtoPedido" [labelVisible]="false" [value]="quantidades()[i.id]"
                      (valueChange)="ajustar(i.id, $event)" [min]="0" [maxFractionDigits]="2" [suffix]="' ' + i.unidade"></ces-number-input>
                  </div>
                }
              </ces-form-section>
              @if (acimaDoTanque(); as aviso) {
                <ces-callout tone="warning" [dense]="true" icon="pi pi-exclamation-triangle">{{ aviso }}</ces-callout>
              } @else if (d.capacidadeTanque) {
                <ces-callout tone="neutral" [dense]="true" icon="pi pi-info-circle">Tanque de {{ qtd(d.capacidadeTanque, 'l') }} pela ficha do veículo.</ces-callout>
              }
              <ces-callout tone="info" [dense]="true">A aprovação vale até as 23h59 de hoje. A liberação ainda pode ajustar as quantidades.</ces-callout>
            }
            @case ('reprovar') {
              <ces-textarea label="Motivo" [required]="true" [(value)]="motivo" [rows]="3" [maxlength]="400"
                placeholder="Ex.: Abasteceu ontem e o painel mostra mais da metade do tanque."
                description="A equipe vê o motivo no app e pode pedir de novo."
                [error]="tentou() && motivo().trim().length < 5 ? 'Explique o motivo (ao menos 5 letras).' : undefined"></ces-textarea>
            }
            @case ('cancelar') {
              @if (d.situacao === 'LIBERADA') {
                <ces-callout tone="warning" [dense]="true">O posto já pode ter sido avisado. Ao cancelar, o C.E.S prepara a mensagem de cancelamento para o posto.</ces-callout>
              }
              <ces-textarea label="Motivo" [required]="d.situacao === 'LIBERADA'" [showOptional]="d.situacao !== 'LIBERADA'" [(value)]="motivo" [rows]="3" [maxlength]="500"
                placeholder="Ex.: Veículo quebrou antes de chegar ao posto."
                [error]="tentou() && d.situacao === 'LIBERADA' && !motivo().trim() ? 'Informe o motivo do cancelamento.' : undefined"></ces-textarea>
            }
            @case ('liberar') {
              <ces-form-section title="Posto" icon="pi pi-map-marker">
                <ces-select label="Onde vai abastecer" [options]="opcoesPosto()" [(value)]="postoLiberacao" [loading]="!postos().length"
                  description="Troque se o posto pedido não puder atender."></ces-select>
              </ces-form-section>
              <ces-form-section title="Quantidades" icon="pi pi-sliders-h"
                description="Partem do aprovado. Ajuste se precisar; o posto recebe estes valores e o aprovado continua guardado.">
                @for (i of d.itens; track i.id) {
                  <div class="item-liberar">
                    <span>{{ i.produtoPedido }}@if (i.quantidadeAprovada != null) {<span class="dd-muted"> · aprovado {{ qtd(i.quantidadeAprovada, i.unidade) }}</span>}</span>
                    <ces-number-input [label]="'Quantidade de ' + i.produtoPedido" [labelVisible]="false" [value]="quantidades()[i.id]"
                      (valueChange)="ajustar(i.id, $event)" [min]="0" [maxFractionDigits]="2" [suffix]="' ' + i.unidade"></ces-number-input>
                  </div>
                }
              </ces-form-section>
              <ces-callout tone="info" [dense]="true" icon="pi pi-whatsapp">
                Depois de liberar, o C.E.S mostra a mensagem pronta para avisar o posto no WhatsApp. Vale até as 23h59 de hoje.
              </ces-callout>
            }
          }
        </div>
      }
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Voltar" (pressed)="formulario.set(null)"></ces-button>
        <ces-button [variant]="formulario() === 'liberar' || formulario() === 'aprovar' ? 'primary' : 'destructive'" [icon]="iconeConfirmar()" [label]="rotuloConfirmar()"
          [loading]="salvando()" (pressed)="confirmar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaAbastecimentoDetalheDrawerComponent {
  private readonly servico = inject(FrotaAbastecimentoService);
  private readonly telemetria = inject(FrotaTelemetriaService);
  private readonly acesso = acessoFrota();
  protected marcadoresLocal(l: LocalAbastecimento): MarcadorMapa[] {
    const lista: MarcadorMapa[] = [{ latitude: l.latitude, longitude: l.longitude, tom: 'danger', rotulo: 'Veículo no horário do abastecimento' }];
    if (l.latitudePosto != null && l.longitudePosto != null) {
      lista.push({ latitude: l.latitudePosto, longitude: l.longitudePosto, tom: 'brand', rotulo: 'Onde costuma abastecer neste posto' });
    }
    return lista;
  }

  protected circuloPosto(l: LocalAbastecimento): CirculoMapa[] {
    return l.latitudePosto != null && l.longitudePosto != null
      ? [{ latitude: l.latitudePosto, longitude: l.longitudePosto, raioMetros: 500, rotulo: 'Até 500 m do posto' }] : [];
  }

  protected ligacaoLocal(l: LocalAbastecimento): LigacaoMapa[] {
    return l.latitudePosto != null && l.longitudePosto != null
      ? [{ de: [l.latitude, l.longitude], para: [l.latitudePosto, l.longitudePosto], tom: 'danger' }] : [];
  }

  /** Km rodado e consumo pela telemetria desde o abastecimento anterior (só realizado e com permissão). */
  protected readonly consumoTelemetria = signal<ConsumoAbastecimentoTelemetria | null>(null);
  protected readonly consumo = formatarConsumo;
  protected readonly rodado = formatarRodado;
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);

  readonly visible = model(false);
  readonly idAbastecimento = input<string | null>(null);
  readonly assistente = input(false);
  readonly alterado = output<AbastecimentoDetalhe>();
  readonly analisar = output<{ id: string; rotulo: string; pergunta: string }>();

  protected readonly detalhe = signal<AbastecimentoDetalhe | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly urls = signal<Record<string, string>>({});
  protected readonly salvando = signal(false);
  protected readonly formulario = signal<Formulario>(null);
  protected readonly motivo = signal('');
  protected readonly tentou = signal(false);
  protected readonly postos = signal<PostoAbastecimento[]>([]);
  protected readonly postoLiberacao = signal<string | null>(null);
  protected readonly quantidades = signal<Record<string, number | null>>({});

  protected readonly tom = TOM_SITUACAO;
  protected readonly icone = ICONE_SITUACAO;
  protected readonly qtd = quantidade;
  protected readonly dinheiro = moeda;
  protected readonly preco = precoUnitario;
  protected readonly trocado = produtoTrocado;
  protected readonly whatsapp = formatarWhatsapp;
  protected readonly espera = haQuantoTempo;
  protected readonly categoria = ROTULO_CATEGORIA_PRODUTO;

  protected readonly titulo = computed(() => {
    const d = this.detalhe();
    return d ? `${formatarPlaca(d.placa)}${d.veiculoDescricao ? ' · ' + d.veiculoDescricao : ''}` : 'Abastecimento';
  });
  /**
   * Avisos que fazem sentido agora. Concluído: só os enviados. Cancelado: o da liberação só aparece se chegou ao posto, e o do
   * cancelamento só quando o posto sabia da liberação (avisar um cancelamento do que ele nem soube confunde).
   */
  protected readonly avisosVisiveis = computed(() => {
    const d = this.detalhe();
    if (!d) return [];
    // Abastecido, vencido ou reprovado: o aviso pendente perdeu o sentido; fica só o histórico do que foi enviado.
    if (d.situacao === 'REALIZADA' || d.situacao === 'VENCIDA' || d.situacao === 'REPROVADA') return d.avisos.filter((a) => a.situacao === 'ENVIADO');
    if (d.situacao !== 'CANCELADA') return d.avisos;
    const postoSabia = d.avisos.some((a) => a.motivo === 'LIBERACAO' && a.situacao === 'ENVIADO');
    return d.avisos.filter((a) => (a.motivo === 'LIBERACAO' ? a.situacao === 'ENVIADO' : postoSabia));
  });
  protected readonly avisoPendente = computed(() => this.avisosVisiveis().some((a) => a.situacao !== 'ENVIADO'));
  /** Cancelado depois de liberar, sem o posto ter sido avisado: nada a avisar. */
  protected readonly semAvisoNecessario = computed(() => {
    const d = this.detalhe();
    return d?.situacao === 'CANCELADA' && !!d.liberadoEm && !this.avisosVisiveis().length;
  });
  protected readonly opcoesPosto = computed<CesSelectOption<string>[]>(() =>
    this.postos().filter((p) => p.ativo).map((p) => ({ label: p.baseNome ? `${p.nome} · ${p.baseNome}` : p.nome, value: p.id }))
  );
  protected readonly tituloAlertas = computed(() => {
    const d = this.detalhe();
    const n = d?.alertas.length ?? 0;
    const decidindo = d?.podeAprovar || d?.podeLiberar;
    if (decidindo) return n === 1 ? 'Confira antes de decidir' : `${n} pontos para conferir antes de decidir`;
    return n === 1 ? 'Ponto apontado pelo C.E.S' : `${n} pontos apontados pelo C.E.S`;
  });
  protected readonly entregue = computed(() => this.detalhe()?.situacao === 'REALIZADA');
  /** Combustível aprovado acima do tanque da ficha: o alerta aparece antes de confirmar. */
  protected readonly acimaDoTanque = computed(() => {
    const d = this.detalhe();
    if (!d?.capacidadeTanque || this.formulario() !== 'aprovar') return null;
    const combustivel = d.itens.find((i) => i.categoria === 'COMBUSTIVEL');
    const litros = combustivel ? this.quantidades()[combustivel.id] : null;
    return litros && litros > d.capacidadeTanque
      ? `${this.qtd(litros, 'l')} passa a capacidade do tanque (${this.qtd(d.capacidadeTanque, 'l')}).`
      : null;
  });
  protected readonly fotosNoCelular = computed(() => this.detalhe()?.fotos.filter((f) => !f.recebida).length ?? 0);

  /** Pedido, aprovação, liberação e abastecimento; reprovação, cancelamento e vencimento interrompem onde pararam. */
  protected readonly fluxo = computed<EtapaFluxo[]>(() => {
    const d = this.detalhe();
    if (!d) return [];
    const etapas: EtapaFluxo[] = [
      d.origem === 'AVULSA'
        ? { rotulo: 'Lançado avulso', estado: 'feito', icone: 'pi-desktop', quando: this.hora(d.solicitadoEm), quem: d.solicitante }
        : { rotulo: 'Pedido', estado: 'feito', icone: 'pi-mobile', quando: this.hora(d.solicitadoEm), quem: d.solicitante },
      d.aprovadoEm && d.situacao !== 'REPROVADA'
        ? { rotulo: 'Aprovado', estado: 'feito', icone: 'pi-check', quando: this.hora(d.aprovadoEm), quem: d.aprovador }
        : { rotulo: 'Aprovação', estado: 'futuro', icone: 'pi-user', quando: null, quem: 'Gestor da placa' },
      d.liberadoEm
        ? { rotulo: 'Liberado', estado: 'feito', icone: 'pi-send', quando: this.hora(d.liberadoEm), quem: d.liberador }
        : { rotulo: 'Liberação', estado: 'futuro', icone: 'pi-send', quando: null, quem: 'Administrativo' },
      d.realizadoEm
        ? { rotulo: 'Abastecido', estado: 'feito', icone: 'pi-check-circle', quando: this.hora(d.realizadoEm), quem: d.condutor }
        : { rotulo: 'Abastecimento', estado: 'futuro', icone: 'pi-gauge', quando: null, quem: 'Equipe no posto' }
    ];
    const atual = etapas.findIndex((e) => e.estado !== 'feito');
    if (atual < 0) return etapas;
    const anterior = [d.solicitadoEm, d.aprovadoEm, d.liberadoEm][atual - 1] ?? d.solicitadoEm;
    switch (d.situacao) {
      case 'REPROVADA':
        etapas[atual] = { rotulo: 'Reprovado', estado: 'interrompido', icone: 'pi-times', quando: this.hora(d.aprovadoEm), quem: d.aprovador };
        break;
      case 'CANCELADA':
        etapas[atual] = { rotulo: 'Cancelado', estado: 'interrompido', icone: 'pi-ban', quando: this.hora(d.canceladoEm), quem: d.cancelador };
        break;
      case 'VENCIDA':
        etapas[atual] = { rotulo: 'Venceu', estado: 'interrompido', icone: 'pi-hourglass', quando: this.hora(d.venceEm), quem: 'Sem uso no dia' };
        break;
      default:
        etapas[atual] = { ...etapas[atual], estado: 'atual', quando: this.espera(anterior) === 'agora' ? 'Começa agora' : `Esperando ${this.espera(anterior)}` };
    }
    return etapas;
  });

  /** O cartão que muda com a situação: há quanto tempo espera, até quando vale ou quanto custou. */
  protected readonly prazo = computed<Prazo>(() => {
    const d = this.detalhe();
    if (!d) return { rotulo: '', valor: '', apoio: null, aviso: false };
    if (d.situacao === 'AGUARDANDO_APROVACAO') {
      const horas = (Date.now() - new Date(d.solicitadoEm).getTime()) / 3_600_000;
      return { rotulo: 'Esperando', valor: this.espera(d.solicitadoEm).replace(/^há /, ''), apoio: `Desde ${this.hora(d.solicitadoEm)}`, aviso: horas >= 2 };
    }
    if ((d.situacao === 'APROVADA' || d.situacao === 'LIBERADA') && d.venceEm) {
      const fim = new Date(d.venceEm).getTime();
      const horas = Math.max(0, (fim - Date.now()) / 3_600_000);
      const restante = horas < 1 ? `Falta ${Math.max(1, Math.round(horas * 60))} min` : `Faltam ${Math.floor(horas)} h`;
      return { rotulo: 'Vale até', valor: `23h59 de ${formatDate(fim - 60_000, 'dd/MM', 'pt-BR')}`, apoio: `${restante}; depois vence`, aviso: horas < 3 };
    }
    if (d.situacao === 'REALIZADA') {
      return { rotulo: 'Total pago', valor: this.dinheiro(d.valorTotal), apoio: d.realizadoEm ? `Abastecido ${this.hora(d.realizadoEm)}` : null, aviso: false };
    }
    return { rotulo: 'Base', valor: d.baseNome ?? 'Sem base', apoio: null, aviso: false };
  });

  protected readonly tituloFormulario = computed(() =>
    ({ aprovar: 'Aprovar o pedido', reprovar: 'Reprovar o pedido', cancelar: 'Cancelar o abastecimento', liberar: 'Liberar o abastecimento' })[this.formulario() ?? 'liberar']
  );
  protected readonly rotuloConfirmar = computed(() =>
    ({ aprovar: 'Aprovar', reprovar: 'Reprovar', cancelar: 'Cancelar abastecimento', liberar: 'Liberar' })[this.formulario() ?? 'liberar']
  );
  protected readonly iconeConfirmar = computed(() =>
    ({ aprovar: 'pi pi-check', reprovar: 'pi pi-times', cancelar: 'pi pi-ban', liberar: 'pi pi-send' })[this.formulario() ?? 'liberar']
  );

  constructor() {
    effect(() => {
      const id = this.idAbastecimento();
      if (this.visible() && id) untracked(() => this.carregar());
    });
    inject(DestroyRef).onDestroy(() => this.liberarUrls());
    effect(() => {
      const d = this.detalhe();
      untracked(() => {
        this.consumoTelemetria.set(null);
        if (!d || d.situacao !== 'REALIZADA' || !this.acesso.verTelemetria()) return;
        this.telemetria.consumoAbastecimento(d.id).subscribe({
          next: (c) => {
            if (this.detalhe()?.id === d.id) this.consumoTelemetria.set(c);
          },
          error: () => undefined
        });
      });
    });
  }

  private hora(iso: string | null): string | null {
    return iso ? formatDate(iso, "dd/MM 'às' HH:mm", 'pt-BR') : null;
  }

  /** Quantidade que vale no posto; antes da aprovação, só o produto foi pedido. */
  protected autorizado(i: ItemAbastecimento): string {
    if (i.quantidade != null && this.entregue()) return this.qtd(i.quantidadeAutorizada ?? i.quantidadePedida, i.unidade);
    if (i.quantidadeAutorizada != null) return i.quantidadeAutorizada === 0 ? 'Retirado' : this.qtd(i.quantidadeAutorizada, i.unidade);
    if (i.quantidadePedida != null) return this.qtd(i.quantidadePedida, i.unidade);
    return 'A definir';
  }

  /** "Aprovado 80 l" quando a liberação mudou a quantidade. */
  protected ajusteLiberacao(i: ItemAbastecimento): string | null {
    return i.quantidadeLiberada != null && i.quantidadeAprovada != null && i.quantidadeLiberada !== i.quantidadeAprovada
      ? `Aprovado ${this.qtd(i.quantidadeAprovada, i.unidade)}`
      : null;
  }

  protected decidirPreco(s: SugestaoPrecoPosto, confirmar: boolean): void {
    this.salvando.set(true);
    const operacao = confirmar ? this.servico.confirmarSugestaoPreco(s.id) : this.servico.descartarSugestaoPreco(s.id);
    operacao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.notificacoes.success(confirmar ? `Preço de ${s.produto} atualizado no ${s.posto}.` : 'Preço do posto mantido.');
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected medicao(valor: number, unidade: 'KM' | 'HORAS'): string {
    return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unidade === 'HORAS' ? 'h' : 'km'}`;
  }

  protected carregar(): void {
    const id = this.idAbastecimento();
    if (!id) return;
    if (this.detalhe()?.id !== id) {
      this.detalhe.set(null);
      this.liberarUrls();
    }
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.detalhar(id).subscribe({
      next: (d) => this.aplicar(d),
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }


  protected abrirFormulario(tipo: Exclude<Formulario, null>): void {
    const d = this.detalhe();
    if (!d) return;
    this.motivo.set('');
    this.tentou.set(false);
    if (tipo === 'aprovar') {
      this.quantidades.set(Object.fromEntries(d.itens.map((i) => [i.id, i.quantidadePedida])));
    }
    if (tipo === 'liberar') {
      this.postoLiberacao.set(d.idPosto);
      this.quantidades.set(Object.fromEntries(d.itens.map((i) => [i.id, i.quantidadeAutorizada ?? i.quantidadePedida])));
      if (!this.postos().length) {
        this.servico.postos(true).subscribe({ next: (p) => this.postos.set(p.content), error: () => undefined });
      }
    }
    this.formulario.set(tipo);
  }

  protected ajustar(idItem: string, valor: number | null): void {
    this.quantidades.update((q) => ({ ...q, [idItem]: valor }));
  }

  protected confirmar(): void {
    const d = this.detalhe();
    const tipo = this.formulario();
    if (!d || !tipo) return;
    this.tentou.set(true);
    const placa = formatarPlaca(d.placa);
    if (tipo === 'reprovar') {
      if (this.motivo().trim().length < 5) return;
      this.executar(this.servico.reprovar(d.id, this.motivo().trim()), `Pedido de ${placa} reprovado.`);
    } else if (tipo === 'cancelar') {
      if (d.situacao === 'LIBERADA' && !this.motivo().trim()) return;
      this.executar(this.servico.cancelar(d.id, this.motivo().trim() || null), `Abastecimento de ${placa} cancelado.`);
    } else if (tipo === 'aprovar') {
      const q = this.quantidades();
      if (d.itens.some((i) => q[i.id] == null || q[i.id]! < 0)) {
        this.notificacoes.warning('Informe a quantidade de cada item (zero tira o item).');
        return;
      }
      if (d.itens.every((i) => !q[i.id])) {
        this.notificacoes.warning('Aprove ao menos um item com quantidade. Se nada deve ser abastecido, reprove.');
        return;
      }
      this.executar(this.servico.aprovar(d.id, Object.fromEntries(d.itens.map((i) => [i.id, q[i.id]!]))),
        `Abastecimento de ${placa} aprovado.`);
    } else {
      const q = this.quantidades();
      if (d.itens.some((i) => q[i.id] == null || q[i.id]! < 0)) {
        this.notificacoes.warning('Informe a quantidade de cada item (zero tira o item).');
        return;
      }
      const ajustes = Object.fromEntries(d.itens.filter((i) => q[i.id] !== (i.quantidadeAutorizada ?? i.quantidadePedida)).map((i) => [i.id, q[i.id]!]));
      const posto = this.postoLiberacao() !== d.idPosto ? this.postoLiberacao() : null;
      this.executar(this.servico.liberar(d.id, { idPosto: posto, quantidades: Object.keys(ajustes).length ? ajustes : null }),
        `Liberado. Agora avise o posto pelo WhatsApp.`);
    }
  }

  /** Abre o WhatsApp do posto com a mensagem e registra que o aviso foi aberto. */
  protected avisar(aviso: AvisoPosto): void {
    const d = this.detalhe();
    if (!d || !aviso.linkWhatsapp) return;
    window.open(aviso.linkWhatsapp, '_blank', 'noopener');
    if (aviso.situacao === 'ENVIADO') return;
    this.servico.marcarAvisoAberto(d.id, aviso.id).subscribe({
      next: (atualizado) => {
        this.aplicar(atualizado);
        this.alterado.emit(atualizado);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected copiar(aviso: AvisoPosto): void {
    void navigator.clipboard?.writeText(aviso.mensagem).then(
      () => this.notificacoes.success('Mensagem copiada.'),
      () => this.notificacoes.warning('Não foi possível copiar. Selecione o texto da mensagem.')
    );
  }

  protected analisarComAssistente(): void {
    const d = this.detalhe();
    if (!d) return;
    const placa = formatarPlaca(d.placa);
    const alertas = d.alertas.length ? ` Os alertas apontados foram: ${d.alertas.map((a) => a.tipoRotulo.toLowerCase()).join(', ')}.` : '';
    this.analisar.emit({
      id: d.id,
      rotulo: `Abastecimento de ${placa}`,
      pergunta: `Analise o pedido de abastecimento do ${placa} (${d.situacaoRotulo.toLowerCase()}, ${d.itens.map((i) => i.produtoPedido).join(' e ')} no ${d.posto}). `
        + `Compare com o histórico de abastecimentos dessa placa (intervalo, litros, consumo e preço) e diga se há algo fora do padrão.${alertas}`
    });
  }

  private executar(operacao: Observable<AbastecimentoDetalhe>, mensagem: string): void {
    this.salvando.set(true);
    operacao.subscribe({
      next: (d) => {
        this.salvando.set(false);
        this.formulario.set(null);
        this.aplicar(d);
        this.notificacoes.success(mensagem);
        this.alterado.emit(d);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private aplicar(d: AbastecimentoDetalhe): void {
    this.detalhe.set(d);
    this.carregando.set(false);
    this.carregarFotos(d.id, d.fotos);
  }

  /** As fotos vêm com o token pelo HttpClient e viram endereços locais do navegador. */
  private carregarFotos(id: string, fotos: FotoAbastecimento[]): void {
    for (const f of fotos.filter((x) => x.recebida && !this.urls()[x.id])) {
      this.servico.foto(id, f.id).subscribe({
        next: (blob) => this.urls.update((u) => ({ ...u, [f.id]: URL.createObjectURL(blob) })),
        error: () => undefined
      });
    }
  }

  private liberarUrls(): void {
    Object.values(this.urls()).forEach((u) => URL.revokeObjectURL(u));
    this.urls.set({});
  }

  protected abrirRelatorio(id: string): void {
    this.visible.set(false);
    navegarAposFecharDrawer(this.router, ['/frota', 'abastecimentos', id, 'relatorio']);
  }
}
