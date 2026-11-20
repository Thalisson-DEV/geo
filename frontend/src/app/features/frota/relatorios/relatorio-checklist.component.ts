import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { GeoAsyncStateComponent, GeoStatusComponent, GeoTone } from '@geo/ui';
import { map } from 'rxjs/operators';
import { ChecklistDetalhe, FotoChecklist, RespostaChecklistDetalhe, SituacaoPendenciaChecklist } from '../../../core/models/frota-checklist.models';
import { formatarMedicao, formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { ROTULO_PENDENCIA, TOM_PENDENCIA } from '../checklists/frota-checklist-detalhe-drawer.component';
import { recorrente, textoHistorico } from '../checklists/frota-checklist.util';
import { AnalisarComCopilotoComponent } from '../../../shared/components/analisar-com-copiloto/analisar-com-copiloto.component';
import { FrotaRelatorioAnaliseIaComponent } from './frota-relatorio-analise-ia.component';
import { FrotaRelatorioCabecalhoComponent } from './frota-relatorio-cabecalho.component';
import { FotoRelatorio, FrotaRelatorioFotosComponent } from './frota-relatorio-fotos.component';
import { EventoRelatorio, FrotaRelatorioLinhaTempoComponent } from './frota-relatorio-linha-tempo.component';

const EVENTO_DECISAO: Record<SituacaoPendenciaChecklist, { titulo: string; icone: string; tom: GeoTone }> = {
  ABERTA: { titulo: 'Aguardando o gestor', icone: 'pi-clock', tom: 'warning' },
  OS_ABERTA: { titulo: 'OS aberta', icone: 'pi-wrench', tom: 'info' },
  RESOLVIDA_NA_HORA: { titulo: 'Resolvido na hora', icone: 'pi-check', tom: 'success' },
  DESCARTADA: { titulo: 'Problema descartado', icone: 'pi-ban', tom: 'neutral' }
};

interface Grupo {
  titulo: string;
  respostas: RespostaChecklistDetalhe[];
}

/**
 * Relatório do checklist no padrão do relatório da solicitação de material: veículo, preenchimento e
 * envolvidos; problemas com fotos, histórico e decisão; folha completa; fotos do recebimento;
 * análise da IA e histórico de movimentações (preenchimento e decisões do gestor).
 */
@Component({
  selector: 'app-relatorio-checklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoAsyncStateComponent,
    GeoStatusComponent,
    AnalisarComCopilotoComponent,
    FrotaRelatorioAnaliseIaComponent,
    FrotaRelatorioCabecalhoComponent,
    FrotaRelatorioFotosComponent,
    FrotaRelatorioLinhaTempoComponent
  ],
  styleUrls: ['./frota-relatorio.css'],
  template: `
    @if (carregando()) {
      <div class="rel-estado">
        <geo-async-state state="loading" title="Carregando o checklist..." description="Consultando respostas, fotos e decisões."></geo-async-state>
      </div>
    } @else if (erro()) {
      <div class="rel-estado">
        <geo-async-state state="error" title="Relatório indisponível" [description]="erro()!" actionLabel="Tentar novamente" (action)="carregar(id())"></geo-async-state>
      </div>
    } @else if (detalhe(); as d) {
      <article class="rel">
        <app-frota-relatorio-cabecalho area="Checklist do veículo" [titulo]="'Checklist · ' + placa()">
          <geo-status [tone]="problemas().length ? 'warning' : 'success'" [icon]="problemas().length ? 'pi pi-exclamation-triangle' : 'pi pi-check'">
            {{ problemas().length ? problemas().length + (problemas().length === 1 ? ' problema' : ' problemas') : 'Tudo OK' }}
          </geo-status>
          <span>·</span>
          <span><strong>{{ d.resumo.modeloNome }}</strong></span>
          <span>·</span>
          <span>Preenchido em <strong>{{ d.resumo.preenchidoEm | date: 'dd/MM/yyyy HH:mm' }}</strong></span>
          <app-analisar-com-copiloto acoes-titulo origem="Checklist da frota" tipo="frota_checklist" [entidade]="d.resumo.id"
            [rotulo]="'Checklist ' + placa()" size="sm"
            pergunta="Analise este checklist para apoiar a decisão: problemas encontrados, recorrência no veículo, pendências e o que priorizar." />
        </app-frota-relatorio-cabecalho>

        <section class="rel-dados" aria-label="Dados gerais do checklist">
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-car" aria-hidden="true"></i>Veículo</div>
            <div class="kv"><span class="kv-l">Placa</span><span class="kv-v">{{ placa() }}</span></div>
            <div class="kv"><span class="kv-l">Base</span><span class="kv-v">{{ d.resumo.baseNome ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Modelo</span><span class="kv-v" [title]="d.resumo.modeloNome">{{ d.resumo.modeloNome }}</span></div>
            <div class="kv"><span class="kv-l">{{ d.resumo.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }}</span>
              <span class="kv-v">{{ formatarMedicao(d.resumo.medicao, d.resumo.unidadeMedicao) }}</span></div>
          </div>
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-list-check" aria-hidden="true"></i>Preenchimento</div>
            <div class="kv"><span class="kv-l">Data</span><span class="kv-v">{{ d.resumo.preenchidoEm | date: 'dd/MM/yyyy HH:mm' }}</span></div>
            <div class="kv"><span class="kv-l">Motivo</span><span class="kv-v">{{ d.resumo.passagemVeiculo ? 'Troca de condutor' : 'Primeiro uso do dia' }}</span></div>
            <div class="kv"><span class="kv-l">Itens</span><span class="kv-v">{{ d.respostas.length }} respondidos</span></div>
            <div class="kv"><span class="kv-l">Decididos</span>
              <span class="kv-v" [class.kv-v--alerta]="decididos() < problemas().length">{{ problemas().length ? decididos() + ' de ' + problemas().length : '—' }}</span></div>
            <div class="kv"><span class="kv-l">Fotos</span>
              <span class="kv-v" [class.kv-v--alerta]="d.resumo.fotosAChegar > 0">{{ d.resumo.fotosAChegar ? d.resumo.fotosAChegar + ' a caminho' : 'Todas recebidas' }}</span></div>
          </div>
          <div class="rel-dados__grupo">
            <div class="rel-dados__titulo"><i class="pi pi-users" aria-hidden="true"></i>Envolvidos</div>
            <div class="kv"><span class="kv-l">Condutor</span><span class="kv-v">{{ d.resumo.condutorNome ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Preenchido por</span><span class="kv-v">{{ d.resumo.preenchidoPor ?? '—' }}</span></div>
            <div class="kv"><span class="kv-l">Assinatura</span><span class="kv-v">{{ d.assinado ? 'Assinado no app' : 'Sem assinatura' }}</span></div>
            <div class="kv"><span class="kv-l">CNH</span>
              <span class="kv-v" [class.kv-v--alerta]="d.resumo.liberacaoCnh">{{ d.resumo.liberacaoCnh ? 'Liberado pelo gestor' : 'Regular' }}</span></div>
          </div>
        </section>

        @if (d.resumo.liberacaoCnh) {
          <div class="rel-destaque" data-tom="warning">
            <span class="rel-destaque__icone"><i class="pi pi-id-card" aria-hidden="true"></i></span>
            <div class="rel-destaque__corpo">
              <span class="rel-destaque__titulo">Preenchido com liberação de CNH</span>
              <p class="rel-texto">{{ d.justificativaLiberacaoCnh || 'Sem justificativa registrada.' }}</p>
            </div>
          </div>
        }

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Problemas encontrados</h2><span>{{ problemas().length }}</span></div>
          @if (problemas().length) {
            <div class="rel-tabela-rolagem">
              <table class="rel-tabela">
                <thead><tr><th>Item</th><th>Resposta</th><th>Histórico no veículo</th><th>Decisão do gestor</th></tr></thead>
                <tbody>
                  @for (r of problemas(); track r.id) {
                    <tr>
                      <td><strong>{{ r.pergunta }}</strong>@if (r.grupo) {<span class="rel-tabela__sub">{{ r.grupo }}</span>}</td>
                      <td>{{ r.resposta }}@if (r.comentario) {<span class="rel-tabela__sub">"{{ r.comentario }}"</span>}</td>
                      <td>
                        @if (recorrente(r.historico)) {
                          <geo-status tone="danger" icon="pi pi-replay">Recorrente</geo-status>
                        }
                        <span class="rel-tabela__sub">{{ textoHistorico(r.historico) ?? '—' }}</span>
                      </td>
                      <td>
                        @if (r.situacaoPendencia; as s) {
                          <geo-status [tone]="tomPendencia[s]">{{ rotuloPendencia[s] }}{{ r.numeroOrdemServico ? ' · OS ' + r.numeroOrdemServico : '' }}</geo-status>
                          @if (r.decididaPor) {
                            <span class="rel-tabela__sub">{{ r.decididaPor }} em {{ r.decididaEm | date: 'dd/MM/yyyy HH:mm' }}</span>
                          }
                          @if (r.justificativaDecisao) {
                            <span class="rel-tabela__sub">"{{ r.justificativaDecisao }}"</span>
                          }
                        } @else {
                          —
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (fotosProblemas().length) {
              <div style="margin-top: 0.75rem"><app-frota-relatorio-fotos [fotos]="fotosProblemas()" /></div>
            }
          } @else {
            <p class="rel-vazio">Nenhum item marcado como Não OK.</p>
          }
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Folha completa</h2><span>{{ d.respostas.length }} itens</span></div>
          <div class="rel-tabela-rolagem">
            <table class="rel-tabela">
              <thead><tr><th>Item</th><th>Resposta</th><th>Situação</th></tr></thead>
              @for (g of grupos(); track g.titulo) {
                <tbody>
                  <tr><td colspan="3" style="background: var(--geo-surface-subtle); font-weight: 600">{{ g.titulo }}</td></tr>
                  @for (r of g.respostas; track r.id) {
                    <tr>
                      <td>{{ r.pergunta }}</td>
                      <td>{{ r.resposta }}@if (r.comentario) {<span class="rel-tabela__sub">"{{ r.comentario }}"</span>}</td>
                      <td>
                        @if (r.problema) {
                          <geo-status tone="warning" icon="pi pi-exclamation-triangle">Não OK</geo-status>
                        } @else if (r.conforme) {
                          <geo-status tone="success" icon="pi pi-check">OK</geo-status>
                        } @else {
                          <span class="rel-tabela__sub">Informado</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              }
            </table>
          </div>
        </section>

        @if (fotosRecebimento().length) {
          <section class="rel-secao">
            <div class="rel-secao__titulo"><h2>Fotos do recebimento</h2><span>{{ fotosRecebimento().length }}</span></div>
            <app-frota-relatorio-fotos [fotos]="fotosRecebimento()" />
          </section>
        }

        @if (d.comentario) {
          <section class="rel-secao">
            <div class="rel-secao__titulo"><h2>Comentário de quem preencheu</h2></div>
            <div class="rel-caixa"><p class="rel-texto">{{ d.comentario }}</p></div>
          </section>
        }

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Análise da Bússola</h2></div>
          <app-frota-relatorio-analise-ia alvo="CHECKLIST" [idAlvo]="d.resumo.id" [fotosEsperadas]="totalFotos()" />
        </section>

        <section class="rel-secao">
          <app-frota-relatorio-linha-tempo [eventos]="eventos()" />
        </section>

        <section class="rel-secao">
          <div class="rel-secao__titulo"><h2>Termo de vistoria e assinaturas</h2></div>
          <div class="rel-caixa" style="display: grid; gap: 1rem">
            <p class="rel-texto">
              Declaro que vistoriei o veículo {{ placa() }} nas condições registradas acima e que os problemas apontados foram
              comunicados à gestão da frota.
            </p>
            <div class="rel-assinaturas">
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Condutor</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">{{ d.resumo.condutorNome ?? d.resumo.preenchidoPor ?? 'Condutor' }}</span>
                <span class="rel-assinatura__data">{{ d.resumo.preenchidoEm | date: 'dd/MM/yyyy HH:mm' }}</span>
              </div>
              <div class="rel-assinatura">
                <span class="rel-assinatura__papel">Gestão de Frota</span>
                <span class="rel-assinatura__linha"></span>
                <span class="rel-assinatura__nome">{{ ultimoDecisor() ?? 'Gestor da frota' }}</span>
                <span class="rel-assinatura__data">Conferência</span>
              </div>
            </div>
          </div>
        </section>

        <footer class="rel-rodape">
          <span>Preenchido em <strong>{{ d.resumo.preenchidoEm | date: 'dd/MM/yyyy HH:mm' }}</strong> por <strong>{{ d.resumo.preenchidoPor ?? '—' }}</strong></span>
          <span class="rel-rodape__marca">Documento emitido eletronicamente via Sistema GEO · Frota</span>
        </footer>
      </article>

      <div class="rel-acoes" role="toolbar" aria-label="Ações do relatório">
        <div class="rel-acoes__linha">
          <button type="button" class="rel-acao rel-acao--so-desktop" (click)="voltar()"><i class="pi pi-arrow-left" aria-hidden="true"></i>Voltar</button>
          <button type="button" class="rel-acao rel-acao--forte rel-acao--so-desktop" (click)="imprimir()"><i class="pi pi-print" aria-hidden="true"></i>Imprimir</button>
          @if (d.respostas.some(r => r.situacaoPendencia === 'ABERTA')) {
            <button type="button" class="rel-acao rel-acao--primaria" (click)="decidirPendencias()"><i class="pi pi-flag" aria-hidden="true"></i>Decidir pendências</button>
          }
        </div>
      </div>
    }
  `
})
export class RelatorioChecklistComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  private readonly service = inject(FrotaChecklistService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly detalhe = signal<ChecklistDetalhe | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly rotuloPendencia = ROTULO_PENDENCIA;
  protected readonly tomPendencia = TOM_PENDENCIA;
  protected readonly formatarMedicao = formatarMedicao;
  protected readonly recorrente = recorrente;
  protected readonly textoHistorico = textoHistorico;

  protected readonly placa = computed(() => formatarPlaca(this.detalhe()?.resumo.placa));
  protected readonly problemas = computed(() => (this.detalhe()?.respostas ?? []).filter((r) => r.problema));
  protected readonly decididos = computed(() => this.problemas().filter((r) => r.situacaoPendencia && r.situacaoPendencia !== 'ABERTA').length);
  protected readonly ultimoDecisor = computed(
    () =>
      this.problemas()
        .filter((r) => r.decididaEm)
        .sort((a, b) => (b.decididaEm ?? '').localeCompare(a.decididaEm ?? ''))[0]?.decididaPor ?? null
  );

  protected readonly grupos = computed<Grupo[]>(() => {
    const grupos = new Map<string, RespostaChecklistDetalhe[]>();
    for (const r of this.detalhe()?.respostas ?? []) {
      const titulo = r.grupo || 'Geral';
      grupos.set(titulo, [...(grupos.get(titulo) ?? []), r]);
    }
    return [...grupos].map(([titulo, respostas]) => ({ titulo, respostas }));
  });

  protected readonly fotosProblemas = computed<FotoRelatorio[]>(() =>
    this.problemas().flatMap((r) => r.fotos.map((f) => this.foto(f, r.pergunta, r.resposta)))
  );

  protected readonly fotosRecebimento = computed<FotoRelatorio[]>(() =>
    (this.detalhe()?.fotosRecebimento ?? []).map((f) => this.foto(f, f.descricao ?? 'Foto do veículo'))
  );

  protected readonly totalFotos = computed(() => this.fotosProblemas().length + this.fotosRecebimento().length);

  protected readonly eventos = computed<EventoRelatorio[]>(() => {
    const d = this.detalhe();
    if (!d) return [];
    const eventos: EventoRelatorio[] = [
      {
        titulo: d.resumo.passagemVeiculo ? 'Checklist de troca de condutor' : 'Checklist preenchido',
        descricao: this.problemas().length
          ? `${this.problemas().length} ${this.problemas().length === 1 ? 'item Não OK' : 'itens Não OK'}: ${this.problemas().map((r) => r.pergunta).join(', ')}`
          : 'Todos os itens OK.',
        usuario: d.resumo.preenchidoPor,
        quando: d.resumo.preenchidoEm,
        icone: 'pi-list-check',
        tom: this.problemas().length ? 'warning' : 'success'
      }
    ];
    if (d.resumo.liberacaoCnh) {
      eventos.push({
        titulo: 'Preenchido com liberação de CNH',
        descricao: d.justificativaLiberacaoCnh,
        quando: d.resumo.preenchidoEm,
        icone: 'pi-id-card',
        tom: 'warning'
      });
    }
    for (const r of this.problemas()) {
      if (!r.decididaEm || !r.situacaoPendencia) continue;
      const evento = EVENTO_DECISAO[r.situacaoPendencia];
      eventos.push({
        titulo: `${evento.titulo}${r.numeroOrdemServico ? ' (OS ' + r.numeroOrdemServico + ')' : ''}: ${r.pergunta}`,
        descricao: r.justificativaDecisao,
        usuario: r.decididaPor,
        quando: r.decididaEm,
        icone: evento.icone,
        tom: evento.tom
      });
    }
    return eventos;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) untracked(() => this.carregar(id));
    });
  }

  protected carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service
      .checklist(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.detalhe.set(d);
          this.carregando.set(false);
          document.title = `Checklist ${formatarPlaca(d.resumo.placa)} · Relatório · GEO`;
        },
        error: (e) => {
          this.erro.set(getErrorMessage(e));
          this.carregando.set(false);
        }
      });
  }

  protected voltar(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/frota', 'checklists']);
  }

  /** Pendências abertas se decidem na fila de pendências do checklist. */
  protected decidirPendencias(): void {
    void this.router.navigate(['/frota', 'checklists'], { queryParams: { aba: 'pendencias' } });
  }

  protected imprimir(): void {
    window.print();
  }

  private foto(f: FotoChecklist, rotulo: string, detalhe?: string): FotoRelatorio {
    const idChecklist = this.detalhe()!.resumo.id;
    return { id: f.id, rotulo, detalhe, recebida: f.recebida, carregar: () => this.service.foto(idChecklist, f.id) };
  }
}
