import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoStatusComponent } from '@geo/ui';
import { ALERTA_PNEU, EVENTO_PNEU, EventoPneu, Pneu, VeiculoPneus, formatarKm, formatarSulco } from '../../../core/models/frota-pneu.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { FrotaPneuDiagramaComponent } from './frota-pneu-diagrama.component';

/** Aba Pneus da ficha do veículo: o diagrama com os pneus montados, o pneu escolhido e as últimas movimentações. */
@Component({
  selector: 'app-frota-veiculo-pneus',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoStatusComponent, FrotaPneuDiagramaComponent],
  styles: `
    .grade { display: grid; grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr); gap: 1rem; align-items: start; }
    .lado { display: grid; gap: 1rem; min-width: 0; }
    .topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem; }
    .cartao { display: grid; gap: 0.6rem; padding: 1rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface); }
    .cartao h3 { margin: 0; font-size: var(--geo-font-body); font-weight: 700; }
    .cartao__acao { justify-self: start; }
    .cartao dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    .cartao dt { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .cartao dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
    .alertas { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .eventos { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .eventos li { display: grid; gap: 0.25rem; justify-items: start; padding-bottom: 0.5rem; border-bottom: 1px solid var(--geo-border); }
    .eventos li:last-child { padding-bottom: 0; border-bottom: 0; }
    .eventos small { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .muted { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    @media (max-width: 900px) { .grade { grid-template-columns: minmax(0, 1fr); } }
  `,
  template: `
    @if (erro()) {
      <geo-callout tone="danger" icon="pi pi-exclamation-triangle" title="Não foi possível carregar os pneus">{{ erro() }}</geo-callout>
    } @else if (dados(); as d) {
      <div class="topo">
        <span class="muted">{{ d.eixos ? montados() + ' de ' + rodas() + ' rodas com pneu' : '' }}{{ d.ultimaInspecaoEm ? ' · última inspeção em ' + (d.ultimaInspecaoEm | date: 'dd/MM/yyyy') : '' }}</span>
        @if (d.eixos) {
          <geo-button size="sm" variant="outline" icon="pi pi-sitemap" label="Abrir na montagem" (pressed)="abrirMontagem()"></geo-button>
        }
      </div>
      @if (d.eixos) {
        <div class="grade">
          <app-frota-pneu-diagrama [eixos]="d.eixos" [posicoes]="d.posicoes" [sulcoMinimo]="d.sulcoMinimoMm" [titulo]="placa(d.placa)" [selecionado]="selecionado()?.id ?? null"
            (posicaoAcionada)="escolher($event)"></app-frota-pneu-diagrama>
          <div class="lado">
            @if (selecionado(); as p) {
              <section class="cartao" aria-label="Pneu escolhido">
                <h3>Pneu {{ p.marcaFogo }} · {{ p.posicaoRotulo }}</h3>
                <dl>
                  <div><dt>Marca</dt><dd>{{ p.marca }}{{ p.modelo ? ' ' + p.modelo : '' }}</dd></div>
                  <div><dt>Medida</dt><dd>{{ p.medida ?? '—' }}</dd></div>
                  <div><dt>Sulco</dt><dd>{{ sulco(p.sulcoAtualMm) }}</dd></div>
                  <div><dt>Última pressão</dt><dd>{{ p.ultimaPressaoPsi != null ? p.ultimaPressaoPsi + ' psi' : '—' }}</dd></div>
                  <div><dt>Km nesta vida</dt><dd>{{ km(p.kmVida) }}</dd></div>
                  <div><dt>Vida</dt><dd>{{ p.vida + 1 }}ª</dd></div>
                </dl>
                @if (p.alertas.length) {
                  <div class="alertas">@for (a of p.alertas; track a) { <geo-status [tone]="alerta(a).tom" [icon]="alerta(a).icone">{{ alerta(a).rotulo }}</geo-status> }</div>
                }
                <geo-button class="cartao__acao" size="sm" variant="ghost" icon="pi pi-external-link" label="Abrir pneu" (pressed)="abrirPneu(p.id)"></geo-button>
              </section>
            } @else {
              <p class="muted">Toque numa roda para ver o pneu.</p>
            }
            <section class="cartao" aria-label="Últimas movimentações">
              <h3>Últimas movimentações</h3>
              @if (eventos().length) {
                <ul class="eventos">
                  @for (e of eventos(); track e.id) {
                    <li><geo-status [tone]="evento(e).tom" [icon]="evento(e).icone">{{ evento(e).rotulo }}</geo-status><span>{{ e.descricao }}</span><small>Pneu {{ e.marcaFogo }} · {{ e.ocorridoEm | date: 'dd/MM/yyyy HH:mm' }}</small></li>
                  }
                </ul>
              } @else {
                <span class="muted">Nenhuma movimentação de pneu neste veículo.</span>
              }
            </section>
          </div>
        </div>
      } @else {
        <geo-async-state state="empty" icon="pi-sitemap" title="Diagrama de pneus ainda não definido"
          description="Escolha os eixos e os estepes do veículo para montar os pneus de cada posição." actionLabel="Definir o diagrama" actionIcon="pi pi-sitemap" (action)="abrirMontagem()"></geo-async-state>
      }
    } @else {
      <geo-async-state state="loading" [compact]="true" title="Carregando os pneus" description="Só um instante."></geo-async-state>
    }
  `
})
export class FrotaVeiculoPneusComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly router = inject(Router);

  readonly idVeiculo = input.required<string>();

  protected readonly dados = signal<VeiculoPneus | null>(null);
  protected readonly eventos = signal<EventoPneu[]>([]);
  protected readonly erro = signal<string | null>(null);
  protected readonly selecionado = signal<Pneu | null>(null);
  protected readonly sulco = formatarSulco;
  protected readonly placa = formatarPlaca;
  protected readonly km = (v: number) => formatarKm(v);
  protected readonly montados = computed(() => (this.dados()?.posicoes ?? []).filter((p) => p.pneu && !p.estepe).length);
  protected readonly rodas = computed(() => (this.dados()?.posicoes ?? []).filter((p) => !p.estepe).length);

  constructor() {
    effect(() => {
      const id = this.idVeiculo();
      untracked(() => this.carregar(id));
    });
  }

  protected escolher(codigo: string): void {
    this.selecionado.set(this.dados()?.posicoes.find((p) => p.codigo === codigo)?.pneu ?? null);
  }

  protected alerta(a: string) {
    return ALERTA_PNEU[a as keyof typeof ALERTA_PNEU];
  }

  protected evento(e: EventoPneu) {
    return EVENTO_PNEU[e.tipo];
  }

  protected abrirMontagem(): void {
    void this.router.navigate(['/frota/pneus'], { queryParams: { aba: 'montagem', veiculo: this.idVeiculo() } });
  }

  protected abrirPneu(id: string): void {
    void this.router.navigate(['/frota/pneus'], { queryParams: { pneu: id } });
  }

  private carregar(id: string): void {
    this.erro.set(null);
    this.servico.veiculo(id).subscribe({ next: (d) => this.dados.set(d), error: (e) => this.erro.set(getErrorMessage(e)) });
    this.servico.eventos({ idVeiculo: id }, { size: 8, sort: ['ocorridoEm,desc'] }).subscribe({ next: (p) => this.eventos.set(p.content), error: () => this.eventos.set([]) });
  }
}
