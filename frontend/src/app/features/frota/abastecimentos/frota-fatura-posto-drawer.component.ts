import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDrawerComponent,
  GeoIconButtonComponent,
  GeoStatusComponent,
  NotificationService
} from '@geo/ui';
import { ConferenciaFatura, FaturaPosto } from '../../../core/models/frota-abastecimento.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { navegarAposFecharDrawer } from '../shared/frota-navegacao';
import { ICONE_FATURA, TOM_FATURA, moeda, rotuloFatura, textoDiferenca } from './frota-abastecimento.util';

/**
 * Conferência da fatura do posto: marca os abastecimentos realizados no período que estão na
 * fatura e mostra na hora quanto falta ou sobra. Conferida, segue para o financeiro.
 */
@Component({
  selector: 'app-frota-fatura-posto-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoAsyncStateComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDrawerComponent,
    GeoIconButtonComponent,
    GeoStatusComponent
  ],
  styleUrls: ['./frota-abastecimento-detalhe-drawer.component.css'],
  styles: `
    /* Três classes: vence a grade da tabela de itens entregues (inclusive no celular) sem !important. */
    .dd-tabela .dd-tabela__linha.fat-linha { grid-template-columns: 2rem minmax(0, 1fr) 7rem; cursor: pointer; }
    .fat-linha--fora { background: var(--geo-surface-subtle); }
    .fat-linha--fora .dd-material strong { color: var(--geo-foreground-muted); }
    .dd-tabela .dd-tabela__linha.fat-cab { grid-template-columns: 2rem minmax(0, 1fr) 7rem; }
    .fat-acoes { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
    .fat-diferenca--ok strong { color: var(--geo-success-text, var(--geo-success)); }
    .fat-diferenca--aviso strong { color: var(--geo-warning-text); }
  `,
  template: `
    <geo-drawer [(visible)]="visible" eyebrow="Fatura do posto" [title]="titulo()" size="lg">
      @if (carregando() && !conferencia()) {
        <div class="dd-skeleton" role="status" aria-label="Carregando a fatura"><span></span><span></span><span></span></div>
      } @else if (erro()) {
        <geo-async-state state="error" title="Não foi possível carregar a fatura" [description]="erro()!" [compact]="true"
          actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></geo-async-state>
      } @else if (conferencia(); as c) {
        @let f = c.fatura;
        <div class="dd">
          <section class="dd-hero" [attr.data-tone]="tom[f.situacao]" aria-label="Resumo">
            <div class="dd-hero__topo">
              <geo-status [tone]="tom[f.situacao]" [icon]="'pi ' + icone[f.situacao]" emphasis="solid">{{ rotulo(f) }}</geo-status>
              @if (alterou()) {
                <geo-status tone="warning" icon="pi pi-pencil">Conferência não salva</geo-status>
              }
            </div>
            <p class="dd-hero__rota">
              <i class="pi pi-map-marker" aria-hidden="true"></i>
              <strong>{{ f.posto }}</strong>
              <span class="dd-hero__tipo">{{ f.periodoInicio | date: 'dd/MM' }} a {{ f.periodoFim | date: 'dd/MM/yyyy' }}</span>
            </p>
            <p class="dd-hero__meta">
              @if (f.conferidaEm) { Conferida em {{ f.conferidaEm | date: "dd/MM/yyyy 'às' HH:mm" }} } @else { Marque abaixo os abastecimentos que o posto cobrou. }
            </p>
          </section>

          <section class="dd-fatos" aria-label="Valores">
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">Valor da fatura</span>
              <strong>{{ dinheiro(f.valor) }}</strong>
              <span class="dd-muted">Cobrado pelo posto</span>
            </div>
            <div class="dd-fato dd-fato--destaque">
              <span class="dd-label">Marcados</span>
              <strong>{{ dinheiro(soma()) }}</strong>
              <span class="dd-muted">{{ marcados().length }} de {{ c.abastecimentos.length }} {{ c.abastecimentos.length === 1 ? 'abastecimento' : 'abastecimentos' }}</span>
            </div>
            <div class="dd-fato dd-fato--destaque" [class.fat-diferenca--ok]="bate()" [class.fat-diferenca--aviso]="!bate()" style="grid-column: 1 / -1">
              <span class="dd-label">Diferença</span>
              <strong>{{ textoDiferenca(diferenca()) }}</strong>
              <span class="dd-muted">
                @if (bate()) { A soma dos abastecimentos marcados é igual ao valor cobrado. }
                @else if (diferenca() > 0) { O posto cobrou mais do que os abastecimentos marcados. Confira se falta marcar algum ou peça o detalhamento ao posto. }
                @else { Os abastecimentos marcados somam mais do que a fatura. Confira se algum é de outra fatura. }
              </span>
            </div>
          </section>

          @if (f.situacao === 'CONFERIDA' && !bate() && !alterou()) {
            <geo-callout tone="warning" icon="pi pi-exclamation-triangle" [dense]="true" title="Vai ao financeiro com diferença">
              O pagamento sai com o valor cobrado ({{ dinheiro(f.valor) }}), {{ dinheiro(abs(diferenca())) }} {{ diferenca() > 0 ? 'acima' : 'abaixo' }} do que foi conferido. Se não concordar, peça ao posto uma fatura corrigida e edite o valor antes de enviar.
            </geo-callout>
          }

          @if (foraDoPeriodo()) {
            <geo-callout tone="info" icon="pi pi-info-circle" [dense]="true">
              {{ foraDoPeriodo() === 1 ? '1 abastecimento realizado' : foraDoPeriodo() + ' abastecimentos realizados' }} neste posto no período não {{ foraDoPeriodo() === 1 ? 'está marcado' : 'estão marcados' }}. Se não {{ foraDoPeriodo() === 1 ? 'entrar' : 'entrarem' }} nesta fatura, {{ foraDoPeriodo() === 1 ? 'fica' : 'ficam' }} para a próxima.
            </geo-callout>
          }

          <section aria-labelledby="fat-abastecimentos">
            <h3 id="fat-abastecimentos" class="dd-titulo-secao">
              <i class="pi pi-list-check" aria-hidden="true"></i>Abastecimentos do período
              <span class="dd-muted">Realizados no posto, sem outra fatura</span>
            </h3>
            @if (!c.abastecimentos.length) {
              <geo-async-state state="empty" [compact]="true" title="Nenhum abastecimento no período"
                description="Não há abastecimento realizado neste posto entre as datas da fatura. Confira o período ou o posto."></geo-async-state>
            } @else {
              @if (editavel()) {
                <div class="fat-acoes">
                  <span class="dd-muted"><strong class="dd-forte">{{ marcados().length }}</strong> marcados</span>
                  <span class="dd-linha-botoes">
                    <geo-button variant="ghost" size="sm" icon="pi pi-check-square" label="Marcar todos" (pressed)="marcarTodos(true)"></geo-button>
                    <geo-button variant="ghost" size="sm" icon="pi pi-stop" label="Desmarcar" (pressed)="marcarTodos(false)"></geo-button>
                  </span>
                </div>
              }
              <div class="dd-tabela" role="table" aria-label="Abastecimentos do período">
                <div class="dd-tabela__linha dd-tabela__cab fat-cab" role="row">
                  <span role="columnheader"><span class="dd-muted" style="position:absolute;width:1px;height:1px;overflow:hidden">Na fatura</span></span>
                  <span role="columnheader">Abastecimento</span>
                  <span role="columnheader" class="dd-num">Valor</span>
                </div>
                @for (a of c.abastecimentos; track a.id) {
                  <div class="dd-tabela__linha fat-linha" role="row" [class.fat-linha--fora]="!selecao().has(a.id)" (click)="editavel() && alternar(a.id)">
                    <span role="cell" (click)="$event.stopPropagation()">
                      <geo-boolean-control [label]="'Incluir na fatura: ' + placa(a.placa) + ' de ' + (a.realizadoEm | date: 'dd/MM')"
                        [value]="selecao().has(a.id)" [disabled]="!editavel()" (valueChange)="marcar(a.id, $event)"></geo-boolean-control>
                    </span>
                    <span role="cell" class="dd-material">
                      <strong>{{ placa(a.placa) }} · {{ a.realizadoEm | date: "dd/MM 'às' HH:mm" }}</strong>
                      <span class="dd-muted">{{ a.itens }}</span>
                    </span>
                    <span role="cell" class="dd-num"><strong>{{ dinheiro(a.valor) }}</strong></span>
                  </div>
                }
              </div>
            }
          </section>
        </div>
      }

      <div drawer-footer class="dd-rodape">
        <span class="dd-linha-botoes">
          @if (conferencia() && assistente()) {
            <geo-icon-button icon="pi pi-compass" label="Analisar esta fatura com a Bússola" tooltip="Analisar com a Bússola" (pressed)="analisarComAssistente()"></geo-icon-button>
          }
          @if (conferencia() && editavel()) {
            <geo-button variant="ghost" icon="pi pi-pencil" label="Editar fatura" (pressed)="editar.emit(conferencia()!.fatura)"></geo-button>
          }
        </span>
        <span class="dd-linha-botoes">
          @if (conferencia(); as c) {
            @if (editavel() && (c.fatura.situacao === 'RASCUNHO' || alterou())) {
              <geo-button icon="pi pi-check" [label]="c.fatura.situacao === 'RASCUNHO' ? 'Concluir conferência' : 'Salvar conferência'"
                [loading]="salvando()" [disabled]="!marcados().length" (pressed)="conferir()"></geo-button>
            } @else if (c.fatura.situacao === 'CONFERIDA') {
              <geo-button icon="pi pi-send" label="Enviar ao financeiro" (pressed)="enviarAoFinanceiro()"></geo-button>
            } @else {
              <geo-button variant="ghost" label="Fechar" (pressed)="visible.set(false)"></geo-button>
            }
          }
        </span>
      </div>
    </geo-drawer>
  `
})
export class FrotaFaturaPostoDrawerComponent {
  private readonly servico = inject(FrotaAbastecimentoService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);

  readonly visible = model(false);
  readonly idFatura = input<string | null>(null);
  readonly assistente = input(false);
  readonly alterada = output<FaturaPosto>();
  readonly editar = output<FaturaPosto>();
  readonly analisar = output<{ id: string; rotulo: string; pergunta: string }>();

  protected readonly conferencia = signal<ConferenciaFatura | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly selecao = signal<ReadonlySet<string>>(new Set());

  protected readonly tom = TOM_FATURA;
  protected readonly icone = ICONE_FATURA;
  protected readonly dinheiro = moeda;
  protected readonly placa = formatarPlaca;
  protected readonly textoDiferenca = textoDiferenca;
  protected readonly rotulo = rotuloFatura;
  protected readonly abs = Math.abs;

  protected readonly titulo = computed(() => {
    const f = this.conferencia()?.fatura;
    return f ? `Fatura nº ${f.numero}` : 'Fatura do posto';
  });
  protected readonly editavel = computed(() => this.conferencia()?.fatura.situacao !== 'ENVIADA_AO_FINANCEIRO');
  protected readonly marcados = computed(() => (this.conferencia()?.abastecimentos ?? []).filter((a) => this.selecao().has(a.id)));
  protected readonly soma = computed(() => Math.round(this.marcados().reduce((t, a) => t + a.valor, 0) * 100) / 100);
  protected readonly diferenca = computed(() => Math.round(((this.conferencia()?.fatura.valor ?? 0) - this.soma()) * 100) / 100);
  protected readonly bate = computed(() => Math.abs(this.diferenca()) < 0.005);
  protected readonly foraDoPeriodo = computed(() => (this.conferencia()?.abastecimentos.length ?? 0) - this.marcados().length);
  /** A seleção difere do que foi salvo na última conferência. */
  protected readonly alterou = computed(() => {
    const c = this.conferencia();
    if (!c || c.fatura.situacao === 'RASCUNHO') return false;
    return c.abastecimentos.some((a) => a.incluido !== this.selecao().has(a.id));
  });

  constructor() {
    effect(() => {
      const id = this.idFatura();
      if (this.visible() && id) untracked(() => this.carregar());
    });
  }

  protected carregar(): void {
    const id = this.idFatura();
    if (!id) return;
    if (this.conferencia()?.fatura.id !== id) this.conferencia.set(null);
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.conferencia(id).subscribe({
      next: (c) => this.aplicar(c),
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected alternar(id: string): void {
    this.marcar(id, !this.selecao().has(id));
  }

  protected marcar(id: string, incluir: boolean): void {
    const nova = new Set(this.selecao());
    if (incluir) nova.add(id);
    else nova.delete(id);
    this.selecao.set(nova);
  }

  protected marcarTodos(incluir: boolean): void {
    this.selecao.set(new Set(incluir ? (this.conferencia()?.abastecimentos ?? []).map((a) => a.id) : []));
  }

  protected conferir(): void {
    const c = this.conferencia();
    if (!c) return;
    this.salvando.set(true);
    this.servico.conferir(c.fatura.id, [...this.selecao()]).subscribe({
      next: (f) => {
        this.salvando.set(false);
        this.notificacoes.success(Math.abs(f.diferenca) < 0.005
          ? `Fatura ${f.numero} conferida: bate com os abastecimentos.`
          : `Fatura ${f.numero} conferida com diferença de ${moeda(Math.abs(f.diferenca))}.`);
        this.alterada.emit(f);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Abre o pagamento no financeiro já preenchido com o posto, a base e o valor da fatura. */
  protected enviarAoFinanceiro(): void {
    const f = this.conferencia()?.fatura;
    if (!f) return;
    this.visible.set(false);
    navegarAposFecharDrawer(this.router, ['/financeiro', 'pagamentos', 'nova'], 1000, { queryParams: { origem: 'FROTA_FATURA_POSTO', origemId: f.id } });
  }

  protected analisarComAssistente(): void {
    const c = this.conferencia();
    if (!c) return;
    const f = c.fatura;
    this.analisar.emit({
      id: f.id,
      rotulo: `Fatura ${f.numero} do ${f.posto}`,
      pergunta: `Analise a fatura nº ${f.numero} do ${f.posto} (${moeda(f.valor)}, de ${f.periodoInicio} a ${f.periodoFim}). `
        + `Os abastecimentos marcados somam ${moeda(this.soma())} (diferença: ${textoDiferenca(this.diferenca())}). `
        + 'Compare os preços por litro com a média da base e diga se algum abastecimento merece conferência antes do pagamento.'
    });
  }

  private aplicar(c: ConferenciaFatura): void {
    this.conferencia.set(c);
    this.carregando.set(false);
    // Rascunho sem nada marcado: sugere todos do período, que é o caso comum.
    const incluidos = c.abastecimentos.filter((a) => a.incluido).map((a) => a.id);
    this.selecao.set(new Set(c.fatura.situacao === 'RASCUNHO' && !incluidos.length ? c.abastecimentos.map((a) => a.id) : incluidos));
  }
}
