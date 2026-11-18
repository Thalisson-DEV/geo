import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDatepickerComponent,
  GeoFormActionsComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { InspecaoPneu, VeiculoPneus, formatarKm, formatarSulco, tomSulco } from '../../../core/models/frota-pneu.models';
import { formatarPlaca, paraInstanteIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';

interface Linha {
  idPneu: string;
  marcaFogo: string;
  posicao: string;
  rotulo: string;
  recomendada: number | null;
  sulcoAnterior: number | null;
  pressao: number | null;
  sulco: number | null;
}

/**
 * Inspeção dos pneus montados: pressão (calibragem) e sulco de cada posição. A pressão fora de
 * ±10% da recomendada e o sulco no mínimo aparecem na hora, antes de gravar.
 */
@Component({
  selector: 'app-frota-pneu-inspecao-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormActionsComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextareaComponent
  ],
  styles: `
    .linhas { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .linha { display: grid; grid-template-columns: minmax(9rem, 1.3fr) minmax(7rem, 1fr) minmax(7rem, 1fr); gap: 0.5rem 0.75rem; align-items: start;
      padding: 0.6rem 0.7rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .linha__pneu { display: grid; gap: 0.1rem; }
    .linha__pneu strong { font-size: var(--geo-font-body); }
    .linha__pneu span { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .linha__avisos { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .atalhos { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    @media (max-width: 640px) { .linha { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .linha__pneu { grid-column: 1 / -1; } }
  `,
  template: `
    <geo-form-drawer #drawer [(visible)]="visivel" title="Inspeção de pneus" size="lg" [dirty]="preenchidas() > 0" [loading]="salvando()"
      description="Calibragem e sulco de cada pneu montado. O sulco medido passa a ser o sulco atual do pneu.">
      <geo-form-section title="Veículo" icon="pi pi-car">
        <div class="geo-form-grid">
          <geo-select label="Veículo" [required]="true" [options]="veiculos()" [value]="idVeiculo()" (valueChange)="trocar($event)" [filter]="true"></geo-select>
          <geo-datepicker label="Quando" [(value)]="quando" [showTime]="true" [maxDate]="agora" description="Vazio: agora."></geo-datepicker>
          <geo-number-input [label]="veiculo()?.unidade === 'HORAS' ? 'Horímetro' : 'Km'" [(value)]="km" [min]="0" [showOptional]="true"
            [description]="veiculo()?.kmAtual != null ? 'Último: ' + formatarKm(veiculo()!.kmAtual, veiculo()!.unidade) : undefined"></geo-number-input>
        </div>
      </geo-form-section>

      @if (carregando()) {
        <geo-async-state state="loading" [compact]="true" title="Carregando os pneus" description="Só um instante."></geo-async-state>
      } @else if (!idVeiculo()) {
        <geo-async-state state="empty" [compact]="true" icon="pi-car" title="Escolha o veículo" description="Os pneus montados aparecem aqui, um por posição."></geo-async-state>
      } @else if (veiculo(); as v) {
        @if (!linhas().length) {
          <geo-callout tone="info" icon="pi pi-info-circle" title="Nenhum pneu montado neste veículo">
            Monte os pneus na aba Montagem para inspecionar.
          </geo-callout>
        } @else {
          <geo-form-section title="Pneus" icon="pi pi-gauge" [description]="'Sulco mínimo da frota: ' + v.sulcoMinimoMm + ' mm. Deixe em branco o que não mediu.'">
            <div class="atalhos">
              <geo-button size="sm" variant="outline" icon="pi pi-check" label="Calibrados na pressão recomendada" (pressed)="calibrarTodos()"
                [disabled]="!temRecomendada()"></geo-button>
            </div>
            <ul class="linhas">
              @for (l of linhas(); track l.idPneu) {
                <li class="linha">
                  <span class="linha__pneu"><strong>{{ l.marcaFogo }}</strong><span>{{ l.rotulo }}</span>
                    <span>Sulco anterior {{ sulco(l.sulcoAnterior) }}{{ l.recomendada ? ' · recomendado ' + l.recomendada + ' psi' : '' }}</span></span>
                  <geo-number-input label="Pressão (psi)" [value]="l.pressao" (valueChange)="alterar(l.idPneu, 'pressao', $event)" [min]="0" [max]="200"></geo-number-input>
                  <geo-number-input label="Sulco (mm)" [value]="l.sulco" (valueChange)="alterar(l.idPneu, 'sulco', $event)" [min]="0" [max]="40"
                    [minFractionDigits]="1" [maxFractionDigits]="1"></geo-number-input>
                  @if (fora(l) || baixo(l) || sulcoMaior(l)) {
                    <span class="linha__avisos">
                      @if (fora(l)) { <geo-status tone="warning" icon="pi pi-gauge">Pressão fora da faixa ({{ l.recomendada }} psi ±10%)</geo-status> }
                      @if (baixo(l)) { <geo-status tone="danger" icon="pi pi-exclamation-triangle">Sulco no limite: programe a troca</geo-status> }
                      @if (sulcoMaior(l)) { <geo-status tone="info" icon="pi pi-info-circle">Maior que o sulco anterior: confira a medida</geo-status> }
                    </span>
                  }
                </li>
              }
            </ul>
          </geo-form-section>
          <geo-form-section title="Observação" icon="pi pi-comment">
            <geo-textarea label="Observação" [labelVisible]="false" [(value)]="observacao" [rows]="2" [maxlength]="1000" [showOptional]="true"></geo-textarea>
          </geo-form-section>
        }
      }

      <geo-form-actions drawer-footer submitLabel="Registrar inspeção" savingLabel="Registrando…" [saving]="salvando()" [disabled]="!preenchidas()"
        (save)="salvar()" (cancel)="drawer.requestClose()">
        <span actions-start class="geo-cell-muted">{{ preenchidas() }} de {{ linhas().length }} pneus medidos</span>
      </geo-form-actions>
    </geo-form-drawer>
  `
})
export class FrotaPneuInspecaoDrawerComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly veiculos = input<GeoSelectOption<string>[]>([]);
  readonly idVeiculoInicial = input<string | null>(null);
  readonly registrada = output<InspecaoPneu>();

  protected readonly formatarKm = formatarKm;
  protected readonly sulco = formatarSulco;
  protected readonly agora = new Date();
  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly veiculo = signal<VeiculoPneus | null>(null);
  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly quando = signal<Date | null>(null);
  protected readonly km = signal<number | null>(null);
  protected readonly observacao = signal('');
  protected readonly linhas = signal<Linha[]>([]);
  protected readonly preenchidas = computed(() => this.linhas().filter((l) => l.pressao != null || l.sulco != null).length);
  protected readonly temRecomendada = computed(() => this.linhas().some((l) => l.recomendada));

  constructor() {
    effect(() => {
      if (!this.visivel()) return;
      const inicial = this.idVeiculoInicial();
      untracked(() => {
        this.quando.set(null);
        this.observacao.set('');
        this.idVeiculo.set(null);
        this.trocar(inicial);
      });
    });
  }

  protected trocar(id: string | null): void {
    if (id === this.idVeiculo() && this.veiculo()) return;
    this.idVeiculo.set(id);
    this.veiculo.set(null);
    this.linhas.set([]);
    if (!id) return;
    this.carregando.set(true);
    this.servico.veiculo(id).subscribe({
      next: (v) => {
        this.veiculo.set(v);
        this.km.set(v.kmAtual ?? null);
        this.linhas.set(v.posicoes.filter((p) => p.pneu).map((p) => ({
          idPneu: p.pneu!.id, marcaFogo: p.pneu!.marcaFogo, posicao: p.codigo, rotulo: p.rotulo, recomendada: p.pneu!.pressaoRecomendadaPsi,
          sulcoAnterior: p.pneu!.sulcoAtualMm, pressao: null, sulco: null
        })));
        this.carregando.set(false);
      },
      error: (e) => (this.carregando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  protected alterar(id: string, campo: 'pressao' | 'sulco', valor: number | null): void {
    this.linhas.update((lista) => lista.map((l) => (l.idPneu === id ? { ...l, [campo]: valor } : l)));
  }

  protected calibrarTodos(): void {
    this.linhas.update((lista) => lista.map((l) => (l.recomendada && l.pressao == null ? { ...l, pressao: l.recomendada } : l)));
  }

  protected fora(l: Linha): boolean {
    return l.pressao != null && !!l.recomendada && Math.abs(l.pressao - l.recomendada) > l.recomendada * 0.1;
  }

  protected sulcoMaior(l: Linha): boolean {
    return l.sulco != null && l.sulcoAnterior != null && l.sulco > l.sulcoAnterior;
  }

  protected baixo(l: Linha): boolean {
    return tomSulco(l.sulco, this.veiculo()?.sulcoMinimoMm ?? 3) === 'danger' && l.sulco != null;
  }

  protected salvar(): void {
    const v = this.veiculo();
    if (!v) return;
    this.salvando.set(true);
    this.servico.registrarInspecao({
      idVeiculo: v.idVeiculo, realizadaEm: this.quando() ? paraInstanteIso(this.quando()!) : null, km: this.km(), idResponsavel: null,
      observacao: this.observacao().trim() || null,
      itens: this.linhas().filter((l) => l.pressao != null || l.sulco != null).map((l) => ({ idPneu: l.idPneu, pressaoPsi: l.pressao, sulcoMm: l.sulco, observacao: null }))
    }).subscribe({
      next: (i) => {
        this.salvando.set(false);
        this.notificacoes.success(i.alertas ? `Inspeção do ${formatarPlaca(v.placa)} registrada com ${i.alertas === 1 ? '1 alerta' : i.alertas + ' alertas'}.` : `Inspeção do ${formatarPlaca(v.placa)} registrada.`);
        this.registrada.emit(i);
        this.visivel.set(false);
      },
      error: (e) => (this.salvando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }
}
