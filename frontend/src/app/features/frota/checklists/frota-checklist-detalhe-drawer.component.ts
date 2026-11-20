import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoDrawerComponent, GeoStatusComponent, GeoTone } from '@geo/ui';
import {
  ChecklistDetalhe,
  FotoChecklist,
  RespostaChecklistDetalhe,
  SituacaoPendenciaChecklist
} from '../../../core/models/frota-checklist.models';
import { formatarMedicao, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';
import { FrotaResumoAssistenteComponent } from '../shared/frota-resumo-assistente.component';
import { recorrente, textoHistorico } from './frota-checklist.util';

export const ROTULO_PENDENCIA: Record<SituacaoPendenciaChecklist, string> = {
  ABERTA: 'Aguardando o gestor',
  OS_ABERTA: 'OS aberta',
  RESOLVIDA_NA_HORA: 'Resolvido na hora',
  DESCARTADA: 'Descartado'
};
export const TOM_PENDENCIA: Record<SituacaoPendenciaChecklist, GeoTone> = {
  ABERTA: 'warning',
  OS_ABERTA: 'info',
  RESOLVIDA_NA_HORA: 'success',
  DESCARTADA: 'neutral'
};
const ICONE_PENDENCIA: Record<SituacaoPendenciaChecklist, string> = {
  ABERTA: 'pi-clock',
  OS_ABERTA: 'pi-wrench',
  RESOLVIDA_NA_HORA: 'pi-check',
  DESCARTADA: 'pi-ban'
};

interface Grupo {
  titulo: string;
  respostas: RespostaChecklistDetalhe[];
  problemas: number;
}

/**
 * Relatório do checklist preenchido, no desenho dos outros detalhes da frota: a abertura diz o
 * resultado (tudo OK ou quantos problemas e quantos já decididos), os fatos ficam em cartões, os
 * problemas vêm primeiro com motivo, fotos, histórico e decisão, e depois a folha completa por grupo.
 */
@Component({
  selector: 'app-frota-checklist-detalhe-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgTemplateOutlet, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoDrawerComponent, GeoStatusComponent,
    FrotaResumoAssistenteComponent],
  styleUrls: ['../abastecimentos/frota-abastecimento-detalhe-drawer.component.css'],
  styles: `
    .chk-problemas { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
    .chk-problema { display: grid; gap: 0.5rem; padding: 0.875rem 1rem; border: 1px solid var(--geo-border); border-left: 3px solid var(--geo-warning);
      border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .chk-problema[data-decidido='true'] { border-left-color: var(--geo-border-strong); }
    .chk-problema__topo { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
    .chk-problema__pergunta { display: grid; gap: 0.125rem; }
    .chk-problema__pergunta strong { font-size: var(--geo-font-body); }
    .chk-problema__motivo { color: var(--geo-warning-text); font-weight: 600; }
    .chk-problema__comentario { margin: 0; padding-left: 0.625rem; border-left: 2px solid var(--geo-border); color: var(--geo-foreground-muted); font-style: italic; }
    .chk-problema__historico { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; margin: 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .chk-problema__decisao { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;
      padding-top: 0.5rem; border-top: 1px dashed var(--geo-border); }
    .chk-problema__decisao a { font-weight: 600; }
    .chk-problema .dd-fotos { grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); }

    .chk-folha { display: grid; gap: 1rem; }
    .chk-grupo__titulo { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; margin: 0 0 0.375rem; }
    .chk-itens { list-style: none; margin: 0; padding: 0; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .chk-item { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.875rem; min-height: 2.5rem; }
    .chk-item + .chk-item { border-top: 1px solid var(--geo-border); }
    .chk-item__pergunta { min-width: 0; }
    .chk-item__texto { display: block; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); white-space: pre-line; }
    .chk-item[data-problema='true'] .chk-item__pergunta { font-weight: 600; }
    .chk-recebimento .dd-fotos { grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); }
  `,
  template: `
    <geo-drawer [(visible)]="visible" eyebrow="Checklist do veículo" [title]="titulo()" [description]="subtitulo()" size="lg">
      @if (carregando()) {
        <div class="dd-skeleton" role="status" aria-label="Carregando o checklist"><span></span><span></span><span></span><span></span></div>
      } @else if (erro()) {
        <geo-async-state state="error" title="Não foi possível carregar o checklist" [description]="erro()!" [compact]="true"
          actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></geo-async-state>
      } @else if (detalhe(); as d) {
        @let r = d.resumo;
        <div class="dd">
          <section class="dd-hero" [attr.data-tone]="resultado().tom" aria-label="Resultado">
            <div class="dd-hero__topo">
              <geo-status [tone]="resultado().tom" [icon]="'pi ' + resultado().icone" emphasis="solid">{{ resultado().rotulo }}</geo-status>
              @if (r.problemas) {
                <geo-status [tone]="decididos() === r.problemas ? 'success' : 'warning'" [icon]="decididos() === r.problemas ? 'pi pi-check-circle' : 'pi pi-clock'">
                  {{ decididos() === r.problemas ? 'Gestor decidiu todos' : decididos() + ' de ' + r.problemas + ' decididos' }}
                </geo-status>
              }
              @if (algumRecorrente()) { <geo-status tone="danger" icon="pi pi-history">Problema recorrente</geo-status> }
              @if (r.passagemVeiculo) { <geo-status tone="info" icon="pi pi-arrow-right-arrow-left">Recebeu o veículo</geo-status> }
              @if (r.finalidade !== 'USO') { <geo-status tone="neutral" icon="pi pi-clipboard">{{ r.finalidadeRotulo }}, sem condutor</geo-status> }
              @if (r.avisoCnh) { <geo-status tone="warning" icon="pi pi-id-card">CNH irregular</geo-status> }
            </div>
            <p class="dd-hero__rota">
              <i class="pi pi-car" aria-hidden="true"></i>
              <strong>{{ placa(r.placa) }}</strong>
              <span class="dd-hero__tipo">{{ r.modeloNome }}</span>
              <i class="pi pi-building" aria-hidden="true"></i>
              <span>{{ r.baseNome ?? 'Sem base' }}</span>
            </p>
            <p class="dd-hero__meta">
              Preenchido por <strong>{{ r.preenchidoPor ?? '—' }}</strong> em {{ r.preenchidoEm | date: "dd/MM/yyyy 'às' HH:mm" }}{{ d.assinado ? ' · confirmado com assinatura' : '' }}
            </p>
          </section>

          @if (r.fotosAChegar) {
            <geo-callout tone="info" icon="pi pi-mobile" [dense]="true">
              {{ r.fotosAChegar === 1 ? '1 foto ainda está' : r.fotosAChegar + ' fotos ainda estão' }} no celular de quem preencheu. {{ r.fotosAChegar === 1 ? 'Ela chega' : 'Elas chegam' }} assim que o celular tiver sinal.
            </geo-callout>
          }
          <app-frota-resumo-assistente alvo="CHECKLIST" [idAlvo]="r.id" [aguardando]="r.fotosAChegar > 0"
            (relatorio)="abrirRelatorio(r.id)"></app-frota-resumo-assistente>

          @if (r.avisoCnh) {
            <geo-callout tone="warning" icon="pi pi-id-card" [dense]="true" title="Assumiu o veículo com a CNH irregular">
              {{ r.avisoCnh }} O checklist vale e o condutor ficou vinculado; o abastecimento fica bloqueado até a renovação ou a liberação do gestor.
            </geo-callout>
          }
          @if (d.justificativaLiberacaoCnh) {
            <geo-callout tone="warning" icon="pi pi-id-card" [dense]="true" title="Dirigiu com liberação de CNH">{{ d.justificativaLiberacaoCnh }}</geo-callout>
          }

          <section class="dd-fatos" aria-label="Condutor, medição e itens">
            <div class="dd-fato">
              <span class="dd-label">Condutor</span>
              <strong>{{ r.finalidade === 'USO' ? (r.condutorNome ?? '—') : 'Sem condutor' }}</strong>
              <span class="dd-muted">{{ r.finalidade !== 'USO' ? r.finalidadeRotulo + ': registro, sem passagem' : r.passagemVeiculo ? 'Recebeu o veículo neste checklist' : 'Já estava com o veículo' }}</span>
            </div>
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">{{ r.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }} no painel</span>
              <strong>{{ medicao(r.medicao, r.unidadeMedicao) }}</strong>
              <span class="dd-muted">Lançado no histórico do veículo</span>
            </div>
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">Itens conferidos</span>
              <strong>{{ d.respostas.length }}</strong>
              <span class="dd-muted">{{ r.problemas ? (d.respostas.length - r.problemas) + ' OK · ' + r.problemas + ' com problema' : 'Todos OK' }}</span>
            </div>
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">Fotos</span>
              <strong>{{ totalFotos() }}</strong>
              <span class="dd-muted">{{ d.fotosRecebimento.length ? d.fotosRecebimento.length + ' do recebimento' : 'Sem fotos de recebimento' }}{{ r.fotosAChegar ? ' · ' + r.fotosAChegar + ' a chegar' : '' }}</span>
            </div>
          </section>

          @if (d.comentario) {
            <blockquote class="dd-obs"><span class="dd-label">Comentário de quem preencheu</span>{{ d.comentario }}</blockquote>
          }

          @if (problemas().length) {
            <section aria-labelledby="chk-problemas">
              <h3 id="chk-problemas" class="dd-titulo-secao">
                <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>Problemas apontados
                <span class="dd-muted">{{ problemas().length }} {{ problemas().length === 1 ? 'item' : 'itens' }}</span>
              </h3>
              <ul class="chk-problemas">
                @for (p of problemas(); track p.id) {
                  <li class="chk-problema" [attr.data-decidido]="!!p.situacaoPendencia && p.situacaoPendencia !== 'ABERTA'">
                    <div class="chk-problema__topo">
                      <span class="chk-problema__pergunta">
                        @if (p.grupo) { <span class="dd-label">{{ p.grupo }}</span> }
                        <strong>{{ p.pergunta }}</strong>
                      </span>
                      <geo-status tone="warning" icon="pi pi-exclamation-triangle">{{ rotuloResposta(p) }}</geo-status>
                    </div>
                    @if (motivo(p); as m) { <span class="chk-problema__motivo">{{ m }}</span> }
                    @if (p.comentario) { <p class="chk-problema__comentario">“{{ p.comentario }}”</p> }
                    @if (p.fotos.length) {
                      <div class="dd-fotos">
                        @for (f of p.fotos; track f.id) {
                          <ng-container [ngTemplateOutlet]="foto" [ngTemplateOutletContext]="{ $implicit: f, rotulo: p.pergunta, legenda: false }"></ng-container>
                        }
                      </div>
                    }
                    @if (textoHistorico(p.historico); as historico) {
                      <p class="chk-problema__historico">
                        <i class="pi pi-history" aria-hidden="true"></i><span>{{ historico }}</span>
                        @if (recorrente(p.historico)) { <geo-status tone="danger" emphasis="outline">Recorrente</geo-status> }
                      </p>
                    }
                    @if (p.situacaoPendencia; as s) {
                      <div class="chk-problema__decisao">
                        <geo-status [tone]="tomPendencia[s]" [icon]="'pi ' + iconePendencia[s]">{{ rotuloPendencia[s] }}</geo-status>
                        @if (p.idOrdemServico) {
                          <a [href]="'/frota/ordens-servico/' + p.idOrdemServico" (click)="$event.preventDefault(); abrirOs(p.idOrdemServico)">Ver a OS {{ p.numeroOrdemServico }} <i class="pi pi-arrow-right" aria-hidden="true"></i></a>
                        } @else if (s === 'ABERTA') {
                          <span class="dd-muted">Decida na aba Pendências</span>
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            </section>
          }

          <section aria-labelledby="chk-folha">
            <h3 id="chk-folha" class="dd-titulo-secao">
              <i class="pi pi-list-check" aria-hidden="true"></i>Folha do checklist
              <span class="dd-muted">{{ d.respostas.length }} {{ d.respostas.length === 1 ? 'item' : 'itens' }}</span>
            </h3>
            <div class="chk-folha">
              @for (g of grupos(); track g.titulo) {
                <div>
                  <div class="chk-grupo__titulo">
                    <span class="dd-label">{{ g.titulo || 'Itens' }}</span>
                    <span class="dd-muted">{{ g.problemas ? g.problemas + ' com problema' : 'Tudo OK' }}</span>
                  </div>
                  <ul class="chk-itens">
                    @for (i of g.respostas; track i.id) {
                      <li class="chk-item" [attr.data-problema]="i.problema">
                        <span class="chk-item__pergunta">
                          {{ i.pergunta }}
                          @if (i.tipoResposta === 'TEXTO') { <span class="chk-item__texto">{{ i.resposta }}</span> }
                          @else if (i.comentario && !i.problema) { <span class="chk-item__texto">“{{ i.comentario }}”</span> }
                        </span>
                        @if (i.tipoResposta !== 'TEXTO') {
                          <geo-status [tone]="i.problema ? 'warning' : i.conforme ? 'success' : 'neutral'"
                            [icon]="i.problema ? 'pi-exclamation-triangle' : i.conforme ? 'pi-check' : undefined">{{ i.problema ? rotuloResposta(i) : i.resposta }}</geo-status>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          </section>

          @if (d.fotosRecebimento.length) {
            <section class="chk-recebimento" aria-labelledby="chk-recebimento">
              <h3 id="chk-recebimento" class="dd-titulo-secao">
                <i class="pi pi-camera" aria-hidden="true"></i>Fotos do recebimento
                <span class="dd-muted">Estado do veículo na troca de condutor</span>
              </h3>
              <div class="dd-fotos">
                @for (f of d.fotosRecebimento; track f.id) {
                  <ng-container [ngTemplateOutlet]="foto" [ngTemplateOutletContext]="{ $implicit: f, rotulo: f.descricao ?? 'Recebimento', legenda: true }"></ng-container>
                }
              </div>
            </section>
          }
        </div>
      }
      @if (detalhe(); as d) {
        <div drawer-footer class="geo-actions-row">
          <geo-button variant="outline" icon="pi pi-file" label="Relatório completo" (pressed)="abrirRelatorio(d.resumo.id)"></geo-button>
          <geo-button variant="ghost" label="Fechar" (pressed)="visible.set(false)"></geo-button>
        </div>
      }
    </geo-drawer>

    <ng-template #foto let-f let-rotulo="rotulo" let-legenda="legenda">
      <figure class="dd-foto">
        @if (urls()[f.id]; as url) {
          <a class="dd-foto__quadro" [href]="url" target="_blank" rel="noopener" [attr.aria-label]="'Abrir a foto: ' + rotulo"><img [src]="url" [alt]="rotulo" /></a>
        } @else if (f.recebida) {
          <span class="dd-foto__quadro dd-foto__vazia"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i>Carregando</span>
        } @else {
          <span class="dd-foto__quadro dd-foto__vazia"><i class="pi pi-mobile" aria-hidden="true"></i>Ainda no celular<br />chega com sinal</span>
        }
        @if (legenda) { <figcaption>{{ rotulo }}</figcaption> }
      </figure>
    </ng-template>
  `
})
export class FrotaChecklistDetalheDrawerComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly router = inject(Router);

  readonly visible = model(false);
  readonly idChecklist = input<string | null>(null);

  protected readonly detalhe = signal<ChecklistDetalhe | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly urls = signal<Record<string, string>>({});
  protected readonly rotuloPendencia = ROTULO_PENDENCIA;
  protected readonly tomPendencia = TOM_PENDENCIA;
  protected readonly iconePendencia = ICONE_PENDENCIA;
  protected readonly medicao = formatarMedicao;
  protected readonly placa = formatarPlaca;
  protected readonly textoHistorico = textoHistorico;
  protected readonly recorrente = recorrente;

  protected readonly titulo = computed(() => {
    const d = this.detalhe();
    return d ? `${formatarPlaca(d.resumo.placa)} · ${d.resumo.modeloNome}` : 'Checklist';
  });
  protected readonly subtitulo = computed(() => {
    const d = this.detalhe();
    if (!d) return undefined;
    return `${d.resumo.condutorNome ?? 'Condutor não informado'} · ${new Date(d.resumo.preenchidoEm).toLocaleDateString('pt-BR')}`;
  });
  protected readonly problemas = computed(() => (this.detalhe()?.respostas ?? []).filter((r) => r.problema));
  protected readonly decididos = computed(() => this.problemas().filter((p) => p.situacaoPendencia && p.situacaoPendencia !== 'ABERTA').length);
  protected readonly algumRecorrente = computed(() => this.problemas().some((p) => recorrente(p.historico)));
  protected readonly totalFotos = computed(() => {
    const d = this.detalhe();
    return d ? d.respostas.reduce((n, r) => n + r.fotos.length, 0) + d.fotosRecebimento.length : 0;
  });
  /** Abertura no tom do resultado: verde sem problema, âmbar com algo a decidir, azul com tudo decidido. */
  protected readonly resultado = computed<{ rotulo: string; tom: GeoTone; icone: string }>(() => {
    const n = this.problemas().length;
    if (!n) return { rotulo: 'Tudo OK', tom: 'success', icone: 'pi-check-circle' };
    const rotulo = n === 1 ? '1 item com problema' : `${n} itens com problema`;
    return { rotulo, tom: this.decididos() === n ? 'info' : 'warning', icone: 'pi-exclamation-triangle' };
  });
  protected readonly grupos = computed<Grupo[]>(() => {
    const grupos: Grupo[] = [];
    for (const r of this.detalhe()?.respostas ?? []) {
      const titulo = r.grupo ?? '';
      const grupo = grupos.find((g) => g.titulo === titulo) ?? grupos[grupos.push({ titulo, respostas: [], problemas: 0 }) - 1];
      grupo.respostas.push(r);
      if (r.problema) grupo.problemas++;
    }
    return grupos;
  });

  constructor() {
    effect(() => {
      const id = this.idChecklist();
      if (this.visible() && id) untracked(() => this.carregar());
    });
    inject(DestroyRef).onDestroy(() => this.liberarUrls());
  }

  /** "Não OK — Queimado" vira a etiqueta "Não OK" e o motivo em destaque abaixo. */
  protected rotuloResposta(r: RespostaChecklistDetalhe): string {
    return r.tipoResposta === 'OK_NOK' ? (r.resposta.split(' — ')[0] || 'Não OK') : r.resposta;
  }

  protected motivo(r: RespostaChecklistDetalhe): string | null {
    if (r.tipoResposta !== 'OK_NOK') return null;
    const [, ...resto] = r.resposta.split(' — ');
    return resto.join(' — ') || null;
  }

  /** Fecha o painel antes de sair da tela, para a máscara não ficar presa. */
  protected abrirOs(id: string): void {
    this.visible.set(false);
    navegarAposFecharDrawer(this.router, ['/frota/ordens-servico', id]);
  }

  protected abrirRelatorio(id: string): void {
    this.visible.set(false);
    navegarAposFecharDrawer(this.router, ['/frota', 'checklists', id, 'relatorio']);
  }

  protected carregar(): void {
    const id = this.idChecklist();
    if (!id) return;
    this.liberarUrls();
    this.carregando.set(true);
    this.erro.set(null);
    this.checklist.checklist(id).subscribe({
      next: (d) => {
        this.detalhe.set(d);
        this.carregando.set(false);
        this.carregarFotos(id, [...d.respostas.flatMap((r) => r.fotos), ...d.fotosRecebimento]);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  /** As fotos vêm com o token pelo HttpClient e viram endereços locais do navegador. */
  private carregarFotos(id: string, fotos: FotoChecklist[]): void {
    for (const f of fotos.filter((x) => x.recebida)) {
      this.checklist.foto(id, f.id).subscribe({
        next: (blob) => this.urls.update((u) => ({ ...u, [f.id]: URL.createObjectURL(blob) })),
        error: () => undefined
      });
    }
  }

  private liberarUrls(): void {
    Object.values(this.urls()).forEach((u) => URL.revokeObjectURL(u));
    this.urls.set({});
  }
}
