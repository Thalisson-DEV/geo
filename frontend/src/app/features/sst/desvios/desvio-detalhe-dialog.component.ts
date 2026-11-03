import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CesButtonComponent, CesCalloutComponent, CesDrawerComponent, CesStatusComponent, CesTone, NotificationService } from '@ces/ui';

import { DesvioDetalhadoResponse, ResumoColaborador } from '../../../core/models/desvio.models';
import { TratarMeuDesvioRequest } from '../../../core/models/meu-desvio.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { GRAVIDADE_LABELS, GravidadeDesvio, STATUS_DESVIO_LABELS, StatusDesvio } from '../../../core/models/sst.models';
import { AuthService } from '../../../core/services/auth.service';
import { SstService } from '../../../core/services/sst.service';
import { DesvioAnexosComponent } from '../inspecoes/desvio-anexos.component';
import { TratamentoMeuDesvioDialogComponent } from '../meus-desvios/tratamento-meu-desvio-dialog.component';
import { GRAVIDADE_ICONE, GRAVIDADE_TOM, STATUS_DESVIO_ICONE, STATUS_DESVIO_TOM } from '../sst-ui';

const DIA_MS = 86_400_000;

/** Dias inteiros entre hoje e a data (yyyy-MM-dd), no fuso local. Negativo = já passou. */
function diasAte(data: string): number {
  const [a, m, d] = data.substring(0, 10).split('-').map(Number);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d).getTime() - hoje.getTime()) / DIA_MS);
}

/**
 * Relatório de um desvio, aberto por cima da lista (gestão, meus desvios e painéis).
 * Só o inspetor que registrou a inspeção trata o desvio e mexe nas evidências; os demais acompanham.
 */
@Component({
  selector: 'app-desvio-detalhe-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CesButtonComponent, CesCalloutComponent, CesDrawerComponent, CesStatusComponent, DesvioAnexosComponent, TratamentoMeuDesvioDialogComponent],
  styleUrl: './desvio-detalhe-dialog.component.css',
  template: `
    <ces-drawer
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [eyebrow]="desvio() ? 'Desvio nº ' + numero() : 'Desvio'"
      [title]="desvio()?.pergunta || (carregando() ? 'Carregando…' : 'Desvio de segurança')"
      size="lg"
    >
      @if (carregando() && !desvio()) {
        <div class="dv-skeleton" role="status" aria-label="Carregando o desvio">
          <span></span><span></span><span></span><span></span>
        </div>
      } @else if (erro()) {
        <ces-callout tone="danger" title="Não foi possível abrir o desvio">{{ erro() }}</ces-callout>
      } @else if (desvio(); as d) {
        <div class="dv">
          <section class="dv-hero" [attr.data-tone]="statusTom(d.status)" aria-label="Resumo do desvio">
            <div class="dv-hero__topo">
              <ces-status [tone]="statusTom(d.status)" [icon]="statusIcone(d.status)" emphasis="solid">{{ statusLabel(d.status) }}</ces-status>
              <ces-status [tone]="gravidadeTom(d.gravidade)" [icon]="gravidadeIcone(d.gravidade)">Gravidade {{ gravidadeLabel(d.gravidade).toLowerCase() }}</ces-status>
              @if (d.vencido) {
                <ces-status tone="danger" icon="pi-clock">{{ d.diasEmAtraso ? 'Atrasado há ' + d.diasEmAtraso + (d.diasEmAtraso === 1 ? ' dia' : ' dias') : 'Prazo vencido' }}</ces-status>
              }
            </div>
            @if (d.grupo) {
              <p class="dv-hero__grupo"><i class="pi pi-folder" aria-hidden="true"></i> {{ d.grupo }}</p>
            }
            <p class="dv-hero__meta">
              Apontado por <strong>{{ d.inspetor || 'inspetor não identificado' }}</strong> em {{ d.dataInspecao | date: "dd/MM/yyyy 'às' HH:mm" }}
              @if (d.formulario) { · {{ d.formulario }} }
            </p>
          </section>

          @if (somenteLeitura() && d.status !== 'RESOLVIDO') {
            <ces-callout tone="info" title="Você está acompanhando este desvio">
              Quem trata é {{ d.inspetor || 'o inspetor que registrou a inspeção' }}. Ação corretiva, prazo e evidências só podem ser alterados por quem registrou a inspeção.
            </ces-callout>
          }

          <section class="dv-fatos" aria-label="Prazo e resolução">
            <div class="dv-fato">
              <span class="dv-label">Prazo</span>
              @if (d.prazo) {
                <strong [class.dv-texto-alerta]="d.vencido">{{ d.prazo | date: 'dd/MM/yyyy' }}</strong>
                <span class="dv-muted">{{ prazoRelativo() }}</span>
              } @else {
                <strong>Sem prazo</strong>
                <span class="dv-muted">{{ d.status === 'RESOLVIDO' ? 'Não foi preciso definir.' : 'Defina no tratamento.' }}</span>
              }
            </div>
            <div class="dv-fato">
              <span class="dv-label">Resolução</span>
              @if (d.dataResolucao) {
                <strong class="dv-texto-ok">{{ d.dataResolucao | date: 'dd/MM/yyyy' }}</strong>
                <span class="dv-muted">às {{ d.dataResolucao | date: 'HH:mm' }}</span>
              } @else {
                <strong>Pendente</strong>
                <span class="dv-muted">{{ d.dataUltimaAlteracao ? 'Última mudança em ' + (d.dataUltimaAlteracao | date: 'dd/MM/yyyy') : 'Ainda sem tratamento.' }}</span>
              }
            </div>
          </section>

          <section class="dv-secao" aria-labelledby="dv-encontrado">
            <h3 class="dv-titulo" id="dv-encontrado"><i class="pi pi-search" aria-hidden="true"></i> O que foi encontrado</h3>
            @if (d.opcaoResposta) {
              <p class="dv-resposta"><span class="dv-label">Resposta marcada</span><ces-status tone="danger" icon="pi-times-circle" emphasis="outline">{{ d.opcaoResposta }}</ces-status></p>
            }
            @if (d.descricao) {
              <blockquote class="dv-texto">{{ d.descricao }}</blockquote>
            } @else {
              <p class="dv-vazio">O inspetor não detalhou o desvio.</p>
            }
          </section>

          <section class="dv-secao" aria-labelledby="dv-acao">
            <h3 class="dv-titulo" id="dv-acao"><i class="pi pi-wrench" aria-hidden="true"></i> Ação corretiva</h3>
            @if (d.acaoCorretiva) {
              <blockquote class="dv-texto dv-texto--acao" [attr.data-tone]="statusTom(d.status)">{{ d.acaoCorretiva }}</blockquote>
            } @else {
              <p class="dv-vazio">Nenhuma ação corretiva registrada ainda.</p>
            }
          </section>

          <section class="dv-secao" aria-labelledby="dv-pessoas">
            <h3 class="dv-titulo" id="dv-pessoas"><i class="pi pi-users" aria-hidden="true"></i> Responsáveis <span class="dv-contagem">{{ d.colaboradores.length }}</span></h3>
            @if (d.colaboradores.length) {
              <ul class="dv-pessoas">
                @for (c of d.colaboradores; track c.id) {
                  <li class="dv-pessoa">
                    <span class="dv-avatar" aria-hidden="true">{{ iniciais(c.nomeCompleto) }}</span>
                    <span class="dv-pessoa__texto">
                      <strong>{{ c.nomeCompleto }}</strong>
                      <span class="dv-muted">{{ funcaoEBase(c) }}</span>
                    </span>
                    @if (!c.ativo) {
                      <ces-status tone="neutral">Inativo</ces-status>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="dv-vazio">Nenhum colaborador ligado a este desvio.</p>
            }
          </section>

          <section class="dv-secao" aria-labelledby="dv-onde">
            <h3 class="dv-titulo" id="dv-onde"><i class="pi pi-map-marker" aria-hidden="true"></i> Onde aconteceu</h3>
            <dl class="dv-dados">
              <div><dt>Base operacional</dt><dd>{{ d.baseOperacional?.nome || '—' }}</dd></div>
              <div><dt>Equipe</dt><dd>{{ d.equipe?.codigo || 'Individual' }}</dd></div>
              <div><dt>Veículo</dt><dd>{{ d.veiculo?.placa || '—' }}</dd></div>
              <div><dt>Processo da inspeção</dt><dd>{{ d.processo?.nome || '—' }}</dd></div>
              <div><dt>Processo do inspetor</dt><dd>{{ d.processoInspetor?.nome || '—' }}</dd></div>
              <div><dt>Data da inspeção</dt><dd>{{ d.dataInspecao | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
            </dl>
          </section>

          <section class="dv-secao" aria-label="Evidências">
            <app-desvio-anexos [idInspecao]="d.idInspecao" [idDesvio]="d.id" [anexos]="d.anexos || []" [canWrite]="podeTratar()"></app-desvio-anexos>
          </section>
        </div>
      }

      <div drawer-footer class="ces-actions-row">
        @if (desvio(); as d) {
          <ces-button variant="ghost" icon="pi pi-external-link" label="Abrir inspeção" (pressed)="abrirInspecao(d.idInspecao)"></ces-button>
          @if (podeTratar()) {
            <ces-button icon="pi pi-wrench" [label]="d.status === 'RESOLVIDO' ? 'Reabrir ou editar' : 'Tratar desvio'" (pressed)="abrirTratamento()"></ces-button>
          }
        }
      </div>
    </ces-drawer>

    <app-tratamento-meu-desvio-dialog #tratamento [loading]="salvando()" (salvar)="salvarTratamento($event)" />
  `
})
export class DesvioDetalheDialogComponent {
  /** Permissão de escrita em inspeções; o tratamento ainda exige ser o inspetor da inspeção. */
  readonly canWrite = input<boolean>(false);
  readonly alterado = output<string>();

  private readonly sst = inject(SstService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly tratamento = viewChild.required<TratamentoMeuDesvioDialogComponent>('tratamento');

  protected readonly visible = signal(false);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly desvio = signal<DesvioDetalhadoResponse | null>(null);
  protected readonly salvando = signal(false);

  protected readonly numero = computed(() => this.desvio()?.id.substring(0, 8).toUpperCase() ?? '');
  protected readonly ehInspetor = computed(() => {
    const d = this.desvio();
    const usuario = this.auth.currentUser();
    return Boolean(d && usuario && d.idInspetor === usuario.id);
  });
  protected readonly podeTratar = computed(() => this.canWrite() && this.ehInspetor());
  protected readonly somenteLeitura = computed(() => !this.ehInspetor());
  protected readonly prazoRelativo = computed(() => {
    const d = this.desvio();
    if (!d?.prazo) return '';
    if (d.status === 'RESOLVIDO') return 'Desvio já resolvido.';
    const dias = diasAte(d.prazo);
    if (dias === 0) return 'Vence hoje.';
    if (dias === 1) return 'Vence amanhã.';
    if (dias > 1) return `Faltam ${dias} dias.`;
    return dias === -1 ? 'Venceu ontem.' : `Venceu há ${-dias} dias.`;
  });

  protected readonly gravidadeTom = (g: GravidadeDesvio): CesTone => GRAVIDADE_TOM[g];
  protected readonly gravidadeIcone = (g: GravidadeDesvio) => GRAVIDADE_ICONE[g];
  protected readonly gravidadeLabel = (g: GravidadeDesvio) => GRAVIDADE_LABELS[g] ?? g;
  protected readonly statusTom = (s: StatusDesvio): CesTone => STATUS_DESVIO_TOM[s];
  protected readonly statusIcone = (s: StatusDesvio) => STATUS_DESVIO_ICONE[s];
  protected readonly statusLabel = (s: StatusDesvio) => STATUS_DESVIO_LABELS[s] ?? s;

  open(idDesvio: string): void {
    this.visible.set(true);
    this.carregar(idDesvio, true);
  }

  close(): void {
    this.visible.set(false);
  }

  private carregar(idDesvio: string, limpar: boolean): void {
    this.carregando.set(true);
    this.erro.set(null);
    if (limpar) this.desvio.set(null);
    this.sst.buscarDesvioPorId(idDesvio).subscribe({
      next: (d) => {
        this.desvio.set(d);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e) || 'Tente de novo em instantes.');
        this.carregando.set(false);
      }
    });
  }

  protected funcaoEBase(c: ResumoColaborador): string {
    return [c.funcao, c.baseOperacional].filter(Boolean).join(' · ') || 'Sem função cadastrada';
  }

  protected iniciais(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  }

  protected abrirInspecao(idInspecao: string): void {
    this.close();
    void this.router.navigate(['/sst/inspecoes', idInspecao]);
  }

  protected abrirTratamento(): void {
    const d = this.desvio();
    if (d && this.podeTratar()) this.tratamento().open(d);
  }

  protected salvarTratamento(request: TratarMeuDesvioRequest): void {
    const d = this.desvio();
    if (!d || this.salvando()) return;
    this.salvando.set(true);
    this.sst.tratarDesvio(d.idInspecao, d.id, { status: request.status, acaoCorretiva: request.acaoCorretiva || undefined, prazo: request.prazo }).subscribe({
      next: () => {
        this.salvando.set(false);
        this.tratamento().close();
        this.notificacoes.success('Tratamento registrado.');
        this.alterado.emit(d.id);
        this.carregar(d.id, false);
      },
      error: (e) => {
        // O formulário continua aberto para a pessoa não perder o que escreveu.
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
