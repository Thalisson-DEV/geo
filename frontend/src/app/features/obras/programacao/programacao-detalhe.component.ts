import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { take } from 'rxjs';
import { getErrorMessage } from '../../../core/models/shared.models';
import { EquipeProjetada, EventoProgramacao, ItemProgramado, ProgramacaoDetalhe, SituacaoIntervencao, TurnoProgramacao } from '../../../core/models/obras-programacao.models';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasProgramacaoService } from '../../../core/services/obras-programacao.service';
import { formatarDataHora, formatarDataParaApi, formatarMoeda, parseDataBrParaDate } from '../obras-ui';
import { CondicoesProgramacaoComponent, camposDesligamento } from './condicoes-programacao.component';
import { EquipesProjecaoComponent } from './equipes-projecao.component';
import { ROTULO_INTERVENCAO, ROTULO_TURNO, SITUACAO_PROGRAMACAO, TIPO_EVENTO, formatarNumero, lerEvento } from './programacao.logic';

type Modo = 'ver' | 'editar' | 'reprogramar' | 'cancelar';

const UM_DIA_MS = 86_400_000;
const EVENTOS_NO_RESUMO = 4;

/** Valor de um item que já virou execução: o apontado até a quantidade programada, ao valor congelado. */
function realizadoDo(item: ItemProgramado): number {
  return item.valorUnitario == null ? 0 : item.valorUnitario * Math.min(item.quantidadeExecutada, item.quantidade);
}

/**
 * Detalhe de uma programação. A leitura vem primeiro: obra, situação, equipe, período e valor no topo; depois o
 * realizado contra o programado, os itens por local e o resumo do histórico. Editar, reprogramar, cancelar,
 * excluir e retirar item acontecem no mesmo painel.
 */
@Component({
  selector: 'app-programacao-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    CondicoesProgramacaoComponent,
    EquipesProjecaoComponent
  ],
  template: `
    <geo-form-drawer [(visible)]="aberto" [title]="tituloDrawer()" [description]="descricaoDrawer()" [dirty]="modo() !== 'ver'" size="lg">
      @if (erro(); as mensagem) {
        <geo-async-state state="error" title="Não foi possível abrir a programação" [description]="mensagem"></geo-async-state>
      } @else if (!p()) {
        <geo-async-state state="loading" title="Abrindo a programação" [compact]="true"></geo-async-state>
      } @else {
        @let programacao = p()!;
        @switch (modo()) {
          @case ('editar') {
            <geo-form-section title="Condições da intervenção" icon="pi pi-bolt">
              <geo-text-input label="Descrição do planejamento" [required]="true" [maxlength]="500" [(value)]="descricao"
                [error]="tentou() && !descricao().trim() ? 'Informe a descrição do planejamento.' : undefined"></geo-text-input>
              <app-condicoes-programacao [validar]="tentou()" [(linhaViva)]="linhaViva" [(desligamento)]="desligamento"
                [(finalizaObra)]="finalizaObra" [(turno)]="turno" [(situacaoIntervencao)]="situacaoIntervencao" [(observacao)]="observacao"
          [(horaDesligamentoInicio)]="horaDesligamentoInicio" [(horaDesligamentoFim)]="horaDesligamentoFim" [(numeroManobra)]="numeroManobra"></app-condicoes-programacao>
            </geo-form-section>
          }
          @case ('reprogramar') {
            <geo-callout tone="info" [dense]="true">Hoje: {{ programacao.codigoEquipe }}, {{ periodoDe(programacao) }}. A mudança fica no histórico com o motivo.</geo-callout>
            <geo-form-section title="Novo período" icon="pi pi-calendar">
              <div class="geo-form-grid">
                <geo-datepicker label="Início" [required]="true" [value]="inicio()" (valueChange)="inicio.set($any($event)); projetar()"></geo-datepicker>
                <geo-datepicker label="Fim" [required]="true" [value]="fim()" [minDate]="inicio()" (valueChange)="fim.set($any($event)); projetar()"></geo-datepicker>
              </div>
            </geo-form-section>
            <geo-form-section title="Equipe" icon="pi pi-users" description="O valor congelado na confirmação não muda.">
              <app-equipes-projecao [equipes]="equipes()" [carregando]="carregandoEquipes()" [turno]="programacao.turno" [(selecionada)]="idEquipe"></app-equipes-projecao>
            </geo-form-section>
            <geo-form-section title="Motivo" icon="pi pi-comment">
              <geo-textarea label="Motivo da reprogramação" [required]="true" [rows]="2" [maxlength]="1000" [(value)]="motivo" placeholder="Ex.: desligamento negado na data original"
                [error]="tentou() && !motivo().trim() ? 'Informe o motivo da reprogramação.' : undefined"></geo-textarea>
            </geo-form-section>
          }
          @case ('cancelar') {
            <geo-form-section title="Cancelar a programação" icon="pi pi-ban" description="Os itens sem execução voltam a pendentes e a obra volta para a lista do que falta programar.">
              <geo-textarea label="Motivo do cancelamento" [required]="true" [rows]="3" [maxlength]="1000" [(value)]="motivo"
                [error]="tentou() && !motivo().trim() ? 'Informe o motivo do cancelamento.' : undefined"></geo-textarea>
            </geo-form-section>
          }
          @default {
            <section class="pd-hero" [attr.data-tone]="situacao().tom" aria-label="Resumo da programação">
              <div class="pd-hero__topo">
                <geo-status [tone]="situacao().tom" [icon]="situacao().icone">{{ situacao().rotulo }}</geo-status>
                @if (programacao.criadoPor || programacao.criadoEm) {
                  <span class="pd-hero__autor">Programada{{ programacao.criadoPor ? ' por ' + programacao.criadoPor : '' }}{{ programacao.criadoEm ? ' em ' + dataHora(programacao.criadoEm) : '' }}</span>
                }
              </div>
              <a class="pd-hero__obra" [routerLink]="['/obras', programacao.idObra]">
                <strong>{{ programacao.numeroObra }}</strong>
                <span>{{ programacao.tituloObra }}</span>
                <i class="pi pi-arrow-up-right" aria-hidden="true"></i>
              </a>
              <dl class="pd-fatos">
                <div><dt><i class="pi pi-users" aria-hidden="true"></i> Equipe</dt><dd>{{ programacao.codigoEquipe ?? '—' }}</dd></div>
                <div><dt><i class="pi pi-calendar" aria-hidden="true"></i> Período</dt><dd>{{ periodoDe(programacao) }}<small>{{ duracao() }} · {{ rotuloTurno[programacao.turno] }}</small></dd></div>
                <div><dt><i class="pi pi-wallet" aria-hidden="true"></i> Valor congelado</dt><dd>{{ moeda(programacao.valor) }}<small>{{ execucao().servicos }} {{ execucao().servicos === 1 ? 'serviço' : 'serviços' }}</small></dd></div>
              </dl>
              <ul class="pd-tags" aria-label="Condições da intervenção">
                <li [attr.data-ativo]="programacao.linhaViva"><i class="pi pi-bolt" aria-hidden="true"></i> {{ programacao.linhaViva ? 'Linha viva' : 'Sem linha viva' }}</li>
                <li [attr.data-ativo]="programacao.desligamento"><i class="pi pi-power-off" aria-hidden="true"></i> {{ programacao.desligamento ? 'Com desligamento' : 'Sem desligamento' }}@if (programacao.desligamento && (programacao.horaDesligamentoInicio || programacao.numeroManobra)) {<span> ({{ programacao.horaDesligamentoInicio ?? '' }}{{ programacao.horaDesligamentoFim ? '–' + programacao.horaDesligamentoFim : '' }}{{ programacao.numeroManobra ? ' · manobra ' + programacao.numeroManobra : '' }})</span>}</li>
                @if (programacao.finalizaObra) { <li data-ativo="true"><i class="pi pi-flag" aria-hidden="true"></i> Finaliza a obra</li> }
                <li><i class="pi pi-file-check" aria-hidden="true"></i> Intervenção: {{ rotuloIntervencao[programacao.situacaoIntervencao] }}</li>
              </ul>
            </section>

            <nav class="pd-atalhos" aria-label="Atalhos da programação">
              <a class="pd-atalho" [routerLink]="['/obras', programacao.idObra]"><i class="pi pi-building" aria-hidden="true"></i> Abrir obra</a>
              <a class="pd-atalho" [routerLink]="['/obras', programacao.idObra, 'planejamento']"><i class="pi pi-map" aria-hidden="true"></i> Planejamento</a>
              <a class="pd-atalho" routerLink="/obras/programacao/historico" [queryParams]="{ programacao: programacao.numero }" (click)="aberto.set(false)"><i class="pi pi-history" aria-hidden="true"></i> Histórico completo</a>
              <button type="button" class="pd-atalho" (click)="copiarResumo(programacao)"><i class="pi pi-copy" aria-hidden="true"></i> Copiar para a equipe</button>
            </nav>

            @if (situacao().tom === 'danger') {
              <geo-callout tone="danger" [dense]="true">O período terminou em {{ programacao.fim }} sem a execução concluída. Reprograme ou cancele com o motivo.</geo-callout>
            }

            <geo-form-section title="Programado × realizado" icon="pi pi-chart-line" description="O realizado conta o que a equipe apontou pelo aplicativo, ao valor congelado.">
              @let ex = execucao();
              <div class="pd-execucao">
                <div class="pd-execucao__numeros">
                  <div><span>Realizado</span><strong>{{ moeda(ex.realizado) }}</strong></div>
                  <div><span>Programado</span><strong>{{ moeda(ex.programado) }}</strong></div>
                  <div><span>Serviços concluídos</span><strong>{{ ex.servicosConcluidos }} de {{ ex.servicos }}</strong></div>
                </div>
                <div class="pd-barra" role="meter" aria-label="Realizado sobre o programado" [attr.aria-valuenow]="ex.percentual" aria-valuemin="0" aria-valuemax="100"
                  [attr.aria-valuetext]="numero(ex.percentual) + '%'">
                  <span [style.width.%]="ex.percentual"></span>
                </div>
                <p class="pd-execucao__legenda">{{ numero(ex.percentual) }}% executado{{ ex.itensComExecucao ? ' · ' + ex.itensComExecucao + (ex.itensComExecucao === 1 ? ' item com apontamento' : ' itens com apontamento') : ' · nenhum apontamento ainda' }}</p>
              </div>
            </geo-form-section>

            <geo-form-section [title]="'Itens programados (' + programacao.itens.length + ')'" icon="pi pi-list">
              @if (!programacao.itens.length) {
                <geo-callout tone="info" [dense]="true">Os itens voltaram a pendentes.</geo-callout>
              }
              @for (g of grupos(); track g.local) {
                <div class="pd-grupo">
                  <h4 class="pd-grupo__titulo"><i class="pi pi-map-marker" aria-hidden="true"></i> {{ g.local }}<small>{{ moeda(g.valor) }}</small></h4>
                  <ul class="pd-itens">
                    @for (item of g.itens; track item.idItem) {
                      <li>
                        <span class="pd-tipo" [attr.data-material]="item.tipo === 'MATERIAL'" [title]="item.tipo === 'MATERIAL' ? 'Material' : 'Serviço'">{{ item.tipo === 'MATERIAL' ? 'M' : 'S' }}</span>
                        <span class="pd-item">
                          <strong>{{ item.descricao }}</strong>
                          <small>{{ numero(item.quantidade) }} {{ item.unidade }}@if (item.valorTotal != null) { · {{ moeda(item.valorTotal) }} }</small>
                          @if (item.quantidade > 0 && item.tipo === 'SERVICO') {
                            <span class="pd-item__progresso" [attr.aria-label]="numero(item.quantidadeExecutada) + ' de ' + numero(item.quantidade) + ' executado'">
                              <span class="pd-mini"><span [style.width.%]="progressoItem(item)"></span></span>
                              <small>{{ numero(item.quantidadeExecutada) }}/{{ numero(item.quantidade) }}</small>
                            </span>
                          }
                        </span>
                        @if (podeEditar && aberta() && !item.quantidadeExecutada) {
                          <geo-icon-button icon="pi pi-minus-circle" size="icon-sm" [label]="'Retirar ' + item.descricao + ' da programação'" tooltip="Retirar da programação" (pressed)="retirar(item)"></geo-icon-button>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </geo-form-section>

            <geo-form-section title="Notas" icon="pi pi-align-left">
              <dl class="pd-notas">
                <div><dt>Descrição</dt><dd>{{ programacao.descricao }}</dd></div>
                @if (programacao.observacao) { <div><dt>Observação</dt><dd>{{ programacao.observacao }}</dd></div> }
              </dl>
            </geo-form-section>

            <geo-form-section title="Histórico" icon="pi pi-history">
              @if (!eventos().length) {
                <p class="pd-vazio">Sem mudanças registradas.</p>
              } @else {
                <ol class="pd-linha">
                  @for (ev of eventosResumo(); track ev.e.id) {
                    <li [attr.data-tone]="tipoEvento[ev.e.tipo].tom">
                      <span class="pd-linha__marca" aria-hidden="true"><i [class]="tipoEvento[ev.e.tipo].icone"></i></span>
                      <div class="pd-linha__corpo">
                        <p class="pd-linha__titulo"><strong>{{ tipoEvento[ev.e.tipo].rotulo }}</strong> <small>{{ dataHora(ev.e.data) }}{{ ev.e.usuario ? ' · ' + ev.e.usuario : '' }}</small></p>
                        @for (m of ev.mudancas; track m.campo) {
                          <p class="pd-linha__mudanca"><span>{{ m.campo }}:</span>
                            @if (m.antes) { <del>{{ m.antes }}</del> <i class="pi pi-arrow-right" aria-label="para"></i> }
                            <ins>{{ m.depois ?? 'vazio' }}</ins></p>
                        }
                        @if (ev.motivo && ev.e.tipo !== 'CRIADA') { <p class="pd-linha__motivo">“{{ ev.motivo }}”</p> }
                      </div>
                    </li>
                  }
                </ol>
                @if (eventos().length > eventosNoResumo) {
                  <a class="pd-mais" routerLink="/obras/programacao/historico" [queryParams]="{ programacao: programacao.numero }" (click)="aberto.set(false)">
                    Ver os {{ eventos().length }} eventos no histórico <i class="pi pi-arrow-right" aria-hidden="true"></i>
                  </a>
                }
              }
            </geo-form-section>
          }
        }
      }

      <div drawer-footer class="geo-actions-row">
        @if (modo() === 'ver') {
          @if (podeEditar && p()) {
            <geo-button variant="ghost" icon="pi pi-trash" label="Excluir" (pressed)="excluir()"></geo-button>
            @if (aberta()) {
              <geo-button variant="ghost" icon="pi pi-ban" label="Cancelar programação" (pressed)="abrirModo('cancelar')"></geo-button>
              <geo-button variant="outline" icon="pi pi-pencil" label="Editar" (pressed)="abrirModo('editar')"></geo-button>
              <geo-button icon="pi pi-calendar-clock" label="Reprogramar" (pressed)="abrirModo('reprogramar')"></geo-button>
            }
          }
        } @else {
          <geo-button variant="ghost" label="Voltar" (pressed)="modo.set('ver')"></geo-button>
          <geo-button icon="pi pi-check" [label]="rotuloConfirmar()" [loading]="salvando()" (pressed)="confirmar()"></geo-button>
        }
      </div>
    </geo-form-drawer>
  `,
  styles: [`
    .pd-hero { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; border: 1px solid var(--geo-border); border-left-width: 4px; border-radius: var(--geo-radius-lg);
      background: var(--geo-surface-subtle); }
    .pd-hero[data-tone='info'] { border-left-color: var(--geo-info); }
    .pd-hero[data-tone='warning'] { border-left-color: var(--geo-warning); }
    .pd-hero[data-tone='danger'] { border-left-color: var(--geo-danger); }
    .pd-hero[data-tone='success'] { border-left-color: var(--geo-success); }
    .pd-hero[data-tone='neutral'] { border-left-color: var(--geo-border-strong, var(--geo-border)); }
    .pd-hero__topo { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: center; justify-content: space-between; }
    .pd-hero__autor { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-hero__obra { display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; align-items: baseline; color: var(--geo-foreground); font-size: 1.0625rem; line-height: 1.35; text-decoration: none; }
    .pd-hero__obra span { color: var(--geo-foreground-muted); font-weight: 500; }
    .pd-hero__obra .pi { color: var(--geo-brand); font-size: var(--geo-font-caption); }
    .pd-hero__obra:hover span { color: var(--geo-foreground); text-decoration: underline; }
    .pd-hero__obra:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; border-radius: var(--geo-radius-sm); }
    .pd-fatos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0; }
    .pd-fatos > div { padding: 0.5rem 0.625rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .pd-fatos dt { display: flex; gap: 0.375rem; align-items: center; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-weight: 600; text-transform: none; letter-spacing: 0.02em; }
    .pd-fatos dt .pi { font-size: var(--geo-font-caption); }
    .pd-fatos dd { display: flex; flex-direction: column; margin: 0.125rem 0 0; color: var(--geo-foreground); font-size: 0.9375rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .pd-fatos dd small { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); font-weight: 400; }
    .pd-tags { display: flex; flex-wrap: wrap; gap: 0.375rem; margin: 0; padding: 0; list-style: none; }
    .pd-tags li { display: inline-flex; gap: 0.375rem; align-items: center; padding: 0.1875rem 0.5rem; border: 1px solid var(--geo-border); border-radius: 999px;
      background: var(--geo-surface); color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-tags li[data-ativo='true'] { border-color: var(--geo-warning); background: var(--geo-warning-soft); color: var(--geo-warning-text); font-weight: 600; }
    .pd-tags .pi { font-size: var(--geo-font-caption); }
    .pd-atalhos { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .pd-atalho { display: inline-flex; gap: 0.375rem; align-items: center; min-height: 2rem; padding: 0 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md);
      background: var(--geo-surface); color: var(--geo-foreground); font: inherit; font-size: var(--geo-font-control); font-weight: 600; text-decoration: none; cursor: pointer; }
    .pd-atalho:hover { border-color: var(--geo-brand); color: var(--geo-brand); }
    .pd-atalho:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 1px; }
    .pd-atalho .pi { font-size: var(--geo-font-caption); }
    .pd-execucao { display: flex; flex-direction: column; gap: 0.5rem; }
    .pd-execucao__numeros { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    .pd-execucao__numeros span { display: block; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-execucao__numeros strong { font-size: 1rem; font-variant-numeric: tabular-nums; }
    .pd-barra { height: 0.625rem; overflow: hidden; border-radius: 999px; background: var(--geo-surface-muted); }
    .pd-barra span { display: block; height: 100%; border-radius: inherit; background: var(--geo-success); }
    .pd-execucao__legenda { margin: 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-grupo + .pd-grupo { margin-top: 0.75rem; }
    .pd-grupo__titulo { display: flex; gap: 0.375rem; align-items: center; margin: 0 0 0.25rem; color: var(--geo-foreground); font-size: var(--geo-font-control); font-weight: 600; }
    .pd-grupo__titulo .pi { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-grupo__titulo small { margin-left: auto; color: var(--geo-foreground-muted); font-weight: 600; font-variant-numeric: tabular-nums; }
    .pd-itens { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
    .pd-itens li { display: flex; gap: 0.5rem; align-items: center; padding: 0.375rem 0; border-bottom: 1px solid var(--geo-border); }
    .pd-tipo { flex: none; width: 1.125rem; border-radius: var(--geo-radius-sm); background: var(--geo-success-soft); color: var(--geo-success-text); font-size: var(--geo-font-caption); font-weight: 600; line-height: 1.125rem; text-align: center; }
    .pd-tipo[data-material='true'] { background: var(--geo-info-soft); color: var(--geo-info-text); }
    .pd-item { display: flex; flex: 1; flex-direction: column; min-width: 0; font-size: var(--geo-font-caption); }
    .pd-item small { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-item__progresso { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.125rem; }
    .pd-mini { width: 6rem; height: 0.3125rem; overflow: hidden; border-radius: 999px; background: var(--geo-surface-muted); }
    .pd-mini span { display: block; height: 100%; background: var(--geo-success); }
    .pd-notas { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; }
    .pd-notas dt { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-notas dd { margin: 0; font-size: var(--geo-font-caption); white-space: pre-line; }
    .pd-vazio { margin: 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-control); }
    .pd-linha { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
    .pd-linha li { position: relative; display: flex; gap: 0.625rem; padding-bottom: 0.875rem; }
    .pd-linha li:not(:last-child)::before { position: absolute; top: 1.75rem; bottom: 0; left: 0.8125rem; width: 1px; background: var(--geo-border); content: ''; }
    .pd-linha__marca { display: grid; flex: none; width: 1.75rem; height: 1.75rem; place-items: center; border-radius: 999px; background: var(--geo-surface-muted); color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-linha li[data-tone='info'] .pd-linha__marca { background: var(--geo-info-soft); color: var(--geo-info-text); }
    .pd-linha li[data-tone='warning'] .pd-linha__marca { background: var(--geo-warning-soft); color: var(--geo-warning-text); }
    .pd-linha li[data-tone='danger'] .pd-linha__marca { background: var(--geo-danger-soft); color: var(--geo-danger-text); }
    .pd-linha li[data-tone='success'] .pd-linha__marca { background: var(--geo-success-soft); color: var(--geo-success-text); }
    .pd-linha__corpo { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; font-size: var(--geo-font-caption); }
    .pd-linha__titulo { margin: 0.25rem 0 0; }
    .pd-linha__titulo small { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-linha__mudanca { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; margin: 0; }
    .pd-linha__mudanca > span { color: var(--geo-foreground-muted); }
    .pd-linha__mudanca del { color: var(--geo-foreground-muted); }
    .pd-linha__mudanca ins { font-weight: 600; text-decoration: none; }
    .pd-linha__mudanca .pi { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .pd-linha__motivo { margin: 0; color: var(--geo-foreground-muted); font-style: italic; }
    .pd-mais { display: inline-flex; gap: 0.375rem; align-items: center; color: var(--geo-brand); font-size: var(--geo-font-control); font-weight: 600; text-decoration: none; }
    .pd-mais:focus-visible { outline: 2px solid var(--geo-focus-ring); outline-offset: 2px; }
    @media (max-width: 40rem) {
      .pd-fatos, .pd-execucao__numeros { grid-template-columns: 1fr; }
    }
  `]
})
export class ProgramacaoDetalheComponent {
  private readonly api = inject(ObrasProgramacaoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  readonly aberto = model(false);
  readonly idProgramacao = input<string | null>(null);
  /** Avisa que a programação mudou ou deixou de existir, para a tela recarregar. */
  readonly alterada = output<void>();

  protected readonly podeEditar = (inject(AuthService).currentUser()?.permissoes ?? []).includes('obras:programacao:write');
  protected readonly rotuloTurno = ROTULO_TURNO;
  protected readonly rotuloIntervencao = ROTULO_INTERVENCAO;
  protected readonly moeda = formatarMoeda;
  protected readonly numero = formatarNumero;
  protected readonly dataHora = formatarDataHora;
  protected readonly tipoEvento = TIPO_EVENTO;
  protected readonly eventosNoResumo = EVENTOS_NO_RESUMO;
  protected readonly eventos = signal<EventoProgramacao[]>([]);

  protected readonly p = signal<ProgramacaoDetalhe | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly modo = signal<Modo>('ver');
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);

  protected readonly descricao = signal('');
  protected readonly linhaViva = signal<boolean | null>(null);
  protected readonly desligamento = signal<boolean | null>(null);
  protected readonly horaDesligamentoInicio = signal('');
  protected readonly horaDesligamentoFim = signal('');
  protected readonly numeroManobra = signal('');
  protected readonly finalizaObra = signal<boolean | null>(null);
  protected readonly turno = signal<TurnoProgramacao | null>(null);
  protected readonly situacaoIntervencao = signal<SituacaoIntervencao | null>(null);
  protected readonly observacao = signal('');

  protected readonly inicio = signal<Date | null>(null);
  protected readonly fim = signal<Date | null>(null);
  protected readonly idEquipe = signal<string | null>(null);
  protected readonly motivo = signal('');
  protected readonly equipes = signal<EquipeProjetada[]>([]);
  protected readonly carregandoEquipes = signal(false);

  protected readonly situacao = computed(() => SITUACAO_PROGRAMACAO[this.p()?.situacao ?? 'PROGRAMADA']);
  protected readonly aberta = computed(() => this.p()?.situacao !== 'CANCELADA' && this.p()?.situacao !== 'CONCLUIDA');
  protected readonly tituloDrawer = computed(() => {
    const p = this.p();
    if (!p) return 'Programação';
    switch (this.modo()) {
      case 'editar': return `Editar a programação #${p.numero}`;
      case 'reprogramar': return `Reprogramar #${p.numero}`;
      case 'cancelar': return `Cancelar #${p.numero}`;
      default: return `Programação #${p.numero}`;
    }
  });
  protected readonly descricaoDrawer = computed(() => {
    const p = this.p();
    return p ? `${p.codigoEquipe ?? 'Sem equipe'} · ${this.periodoDe(p)}` : undefined;
  });
  protected readonly duracao = computed(() => {
    const p = this.p();
    const inicio = parseDataBrParaDate(p?.inicio);
    const fim = parseDataBrParaDate(p?.fim);
    if (!inicio || !fim) return '';
    const dias = Math.round((fim.getTime() - inicio.getTime()) / UM_DIA_MS) + 1;
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  });
  protected readonly execucao = computed(() => {
    const itens = this.p()?.itens ?? [];
    const servicos = itens.filter((i) => i.tipo === 'SERVICO');
    const programado = servicos.reduce((soma, i) => soma + (i.valorTotal ?? 0), 0);
    const realizado = servicos.reduce((soma, i) => soma + realizadoDo(i), 0);
    return {
      programado,
      realizado,
      percentual: programado ? Math.min(100, Math.round((realizado / programado) * 1000) / 10) : 0,
      servicos: servicos.length,
      servicosConcluidos: servicos.filter((i) => i.status === 'CONCLUIDO' || i.status === 'MEDIDO').length,
      itensComExecucao: itens.filter((i) => i.quantidadeExecutada > 0).length
    };
  });
  /** Itens por local, na ordem em que aparecem: é assim que a equipe percorre a obra. */
  protected readonly grupos = computed(() => {
    const grupos = new Map<string, { local: string; itens: ItemProgramado[]; valor: number }>();
    for (const item of this.p()?.itens ?? []) {
      const local = item.local ?? 'Sem local';
      const grupo = grupos.get(local) ?? { local, itens: [], valor: 0 };
      grupo.itens.push(item);
      grupo.valor += item.valorTotal ?? 0;
      grupos.set(local, grupo);
    }
    return [...grupos.values()];
  });
  protected readonly eventosResumo = computed(() => this.eventos().slice(0, EVENTOS_NO_RESUMO).map((e) => ({ e, ...lerEvento(e) })));
  protected readonly rotuloConfirmar = computed(() => {
    switch (this.modo()) {
      case 'editar': return 'Salvar alterações';
      case 'reprogramar': return 'Reprogramar';
      default: return 'Cancelar programação';
    }
  });

  constructor() {
    effect(() => {
      const id = this.idProgramacao();
      if (this.aberto() && id) untracked(() => this.carregar(id));
    });
  }

  protected periodoDe(p: ProgramacaoDetalhe): string {
    return p.inicio === p.fim ? p.inicio : `${p.inicio} a ${p.fim}`;
  }

  protected progressoItem(item: ItemProgramado): number {
    return item.quantidade > 0 ? Math.min(100, (item.quantidadeExecutada / item.quantidade) * 100) : 0;
  }

  private carregar(id: string): void {
    this.p.set(null);
    this.erro.set(null);
    this.modo.set('ver');
    this.api.buscar(id).pipe(take(1)).subscribe({
      next: (programacao) => this.p.set(programacao),
      error: (e) => this.erro.set(getErrorMessage(e))
    });
    this.carregarEventos(id);
  }

  private carregarEventos(id: string): void {
    this.api.eventosDa(id).pipe(take(1)).subscribe({
      next: (pagina) => this.eventos.set(pagina.content ?? []),
      error: () => this.eventos.set([])
    });
  }

  /** Texto pronto para mandar à equipe pelo aplicativo de mensagens. */
  protected copiarResumo(p: ProgramacaoDetalhe): void {
    const servicos = p.itens.filter((i) => i.tipo === 'SERVICO');
    const materiais = p.itens.filter((i) => i.tipo === 'MATERIAL');
    const linha = (i: ItemProgramado) => `- ${i.local}: ${i.descricao} (${formatarNumero(i.quantidade)} ${i.unidade ?? ''})`.replace(' )', ')');
    const texto = [
      `Programação #${p.numero} - ${p.codigoEquipe}`,
      `Obra ${p.numeroObra} - ${p.tituloObra}`,
      `Período: ${p.inicio} a ${p.fim} (${ROTULO_TURNO[p.turno]})`,
      `Linha viva: ${p.linhaViva ? 'Sim' : 'Não'} | Desligamento: ${p.desligamento ? 'Sim' : 'Não'}`,
      p.descricao,
      p.observacao ? `Obs.: ${p.observacao}` : null,
      servicos.length ? `\nServiços:\n${servicos.map(linha).join('\n')}` : null,
      materiais.length ? `\nMateriais:\n${materiais.map(linha).join('\n')}` : null
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(texto).then(
      () => this.notificacoes.success('Resumo copiado. É só colar na mensagem para a equipe.'),
      () => this.notificacoes.error('Não foi possível copiar. O navegador bloqueou o acesso à área de transferência.')
    );
  }

  protected abrirModo(modo: Modo): void {
    const p = this.p();
    if (!p) return;
    this.tentou.set(false);
    this.motivo.set('');
    if (modo === 'editar') {
      this.descricao.set(p.descricao);
      this.linhaViva.set(p.linhaViva);
      this.desligamento.set(p.desligamento);
      this.horaDesligamentoInicio.set(p.horaDesligamentoInicio ?? '');
      this.horaDesligamentoFim.set(p.horaDesligamentoFim ?? '');
      this.numeroManobra.set(p.numeroManobra ?? '');
      this.finalizaObra.set(p.finalizaObra);
      this.turno.set(p.turno);
      this.situacaoIntervencao.set(p.situacaoIntervencao);
      this.observacao.set(p.observacao ?? '');
    }
    if (modo === 'reprogramar') {
      this.inicio.set(parseDataBrParaDate(p.inicio));
      this.fim.set(parseDataBrParaDate(p.fim));
      this.idEquipe.set(p.idEquipe);
      this.projetar();
    }
    this.modo.set(modo);
  }

  protected projetar(): void {
    const p = this.p();
    const inicio = this.inicio();
    const fim = this.fim();
    if (!p || !inicio || !fim || fim < inicio) return;
    this.carregandoEquipes.set(true);
    this.api.previa(p.idObra, { inicio: formatarDataParaApi(inicio)!, fim: formatarDataParaApi(fim)!, idProgramacao: p.id }).pipe(take(1)).subscribe({
      next: (previa) => {
        this.carregandoEquipes.set(false);
        this.equipes.set(previa.equipes);
      },
      error: (e) => {
        this.carregandoEquipes.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected confirmar(): void {
    this.tentou.set(true);
    const p = this.p();
    if (!p) return;
    switch (this.modo()) {
      case 'editar': return this.salvarEdicao(p);
      case 'reprogramar': return this.salvarReprogramacao(p);
      default: return this.salvarCancelamento(p);
    }
  }

  private salvarEdicao(p: ProgramacaoDetalhe): void {
    const [linhaViva, desligamento, finalizaObra, turno, situacao] =
      [this.linhaViva(), this.desligamento(), this.finalizaObra(), this.turno(), this.situacaoIntervencao()];
    if (!this.descricao().trim() || linhaViva === null || desligamento === null || finalizaObra === null || !turno || !situacao) return;
    this.gravar(this.api.editar(p.id, {
      descricao: this.descricao().trim(), linhaViva, desligamento, finalizaObra, turno,
      situacaoIntervencao: situacao, observacao: this.observacao().trim() || null,
      ...camposDesligamento(desligamento, this.horaDesligamentoInicio(), this.horaDesligamentoFim(), this.numeroManobra())
    }, p.versao), 'Programação atualizada.');
  }

  private salvarReprogramacao(p: ProgramacaoDetalhe): void {
    const [inicio, fim, idEquipe] = [this.inicio(), this.fim(), this.idEquipe()];
    if (!inicio || !fim || fim < inicio || !idEquipe || !this.motivo().trim()) return;
    if (idEquipe === p.idEquipe && formatarDataParaApi(inicio) === p.inicio && formatarDataParaApi(fim) === p.fim) {
      this.notificacoes.warning('Nada mudou: escolha outra equipe ou outro período para reprogramar.');
      return;
    }
    this.gravar(this.api.reprogramar(p.id, {
      idEquipe, inicio: formatarDataParaApi(inicio)!, fim: formatarDataParaApi(fim)!, observacao: this.motivo().trim(), versao: p.versao
    }), 'Programação reprogramada.');
  }

  private salvarCancelamento(p: ProgramacaoDetalhe): void {
    if (!this.motivo().trim()) return;
    this.gravar(this.api.cancelar(p.id, this.motivo().trim(), p.versao), 'Programação cancelada.');
  }

  private gravar(comando: ReturnType<ObrasProgramacaoService['buscar']>, mensagem: string): void {
    this.salvando.set(true);
    comando.pipe(take(1)).subscribe({
      next: (atualizada) => {
        this.salvando.set(false);
        this.p.set(atualizada);
        this.modo.set('ver');
        this.notificacoes.success(mensagem);
        this.carregarEventos(atualizada.id);
        this.alterada.emit();
      },
      error: (e) => this.tratarErro(e)
    });
  }

  private tratarErro(e: { status?: number }): void {
    this.salvando.set(false);
    if (e?.status === 409 && this.p()) {
      this.notificacoes.warning('Outra pessoa alterou esta programação. Atualizei a tela: confira e tente de novo.');
      this.carregar(this.p()!.id);
      return;
    }
    this.notificacoes.error(getErrorMessage(e));
  }

  protected async excluir(): Promise<void> {
    const p = this.p();
    if (!p) return;
    const ok = await this.confirmacao.confirm({
      title: `Excluir a programação #${p.numero}?`,
      message: 'Os itens voltam a pendentes e a exclusão fica no histórico.',
      variant: 'destructive'
    });
    if (!ok) return;
    this.api.excluir(p.id, null, p.versao).pipe(take(1)).subscribe({
      next: () => {
        this.notificacoes.success(`Programação #${p.numero} excluída.`);
        this.aberto.set(false);
        this.alterada.emit();
      },
      error: (e) => this.tratarErro(e)
    });
  }

  protected async retirar(item: ItemProgramado): Promise<void> {
    const p = this.p();
    if (!p) return;
    const ultimo = p.itens.length === 1;
    const ok = await this.confirmacao.confirm({
      title: 'Retirar o item da programação?',
      message: ultimo
        ? `${item.descricao} volta a pendente. É o último item, então a programação #${p.numero} será excluída.`
        : `${item.descricao} volta a pendente. Sem serviço do kit na programação, os materiais dele saem junto.`,
      variant: 'destructive'
    });
    if (!ok) return;
    this.api.retirarItem(p.id, item.idItem).pipe(take(1)).subscribe({
      next: (atualizada) => {
        this.notificacoes.success('Item retirado da programação.');
        if (atualizada) {
          this.p.set(atualizada);
          this.carregarEventos(atualizada.id);
        } else {
          this.aberto.set(false);
        }
        this.alterada.emit();
      },
      error: (e) => this.tratarErro(e)
    });
  }
}
