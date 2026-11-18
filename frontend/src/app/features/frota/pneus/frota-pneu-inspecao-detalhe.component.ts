import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoFormActionsComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoStatusComponent
} from '@geo/ui';
import { InspecaoPneu, formatarKm, formatarSulco } from '../../../core/models/frota-pneu.models';
import { formatarPlaca } from '../../../core/models/frota.models';

/** Uma inspeção registrada, só leitura: a medição de cada pneu e o que ficou fora do esperado. */
@Component({
  selector: 'app-frota-pneu-inspecao-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GeoButtonComponent, GeoCalloutComponent, GeoFormActionsComponent, GeoFormDrawerComponent, GeoFormSectionComponent, GeoStatusComponent],
  styles: `
    .itens { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .item { display: grid; gap: 0.35rem; padding: 0.6rem 0.7rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface); }
    .item__topo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .item__topo strong { display: block; }
    .item__topo span { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .item dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.25rem 1rem; margin: 0; }
    .item dt { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .item dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
    .avisos { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  `,
  template: `
    <geo-form-drawer #drawer [(visible)]="visivel" [title]="titulo()" [description]="descricao()" size="md">
      @if (inspecao(); as i) {
        @if (i.observacao) {
          <geo-callout tone="info" icon="pi pi-comment" [dense]="true" title="Observação">{{ i.observacao }}</geo-callout>
        }
        <geo-form-section title="Pneus medidos" icon="pi pi-gauge" [description]="(i.realizadaEm | date: 'dd/MM/yyyy HH:mm') ?? undefined">
          <ul class="itens">
            @for (item of i.itens; track item.idPneu) {
              <li class="item">
                <div class="item__topo">
                  <div><strong>{{ item.marcaFogo ?? 'Pneu' }}</strong><span>{{ item.posicaoRotulo }}</span></div>
                  <geo-button size="sm" variant="ghost" icon="pi pi-external-link" label="Abrir pneu" (pressed)="abrirPneu.emit(item.idPneu); visivel.set(false)"></geo-button>
                </div>
                <dl>
                  <div><dt>Pressão</dt><dd>{{ item.pressaoPsi != null ? item.pressaoPsi + ' psi' : '—' }}{{ item.pressaoRecomendadaPsi != null ? ' de ' + item.pressaoRecomendadaPsi : '' }}</dd></div>
                  <div><dt>Sulco</dt><dd>{{ sulco(item.sulcoMm) }}</dd></div>
                </dl>
                @if (item.pressaoFora || item.sulcoBaixo) {
                  <div class="avisos">
                    @if (item.pressaoFora) { <geo-status tone="warning" icon="pi pi-gauge">Pressão fora da faixa</geo-status> }
                    @if (item.sulcoBaixo) { <geo-status tone="danger" icon="pi pi-exclamation-triangle">Sulco no limite</geo-status> }
                  </div>
                }
              </li>
            }
          </ul>
        </geo-form-section>
      }
      <geo-form-actions drawer-footer [shortcut]="false" [showCancel]="false" submitLabel="Fechar" submitIcon="" (save)="visivel.set(false)"></geo-form-actions>
    </geo-form-drawer>
  `
})
export class FrotaPneuInspecaoDetalheComponent {
  readonly visivel = model(false);
  readonly inspecao = input<InspecaoPneu | null>(null);
  readonly abrirPneu = output<string>();

  protected readonly sulco = formatarSulco;
  protected readonly titulo = computed(() => {
    const i = this.inspecao();
    return i ? `Inspeção do ${formatarPlaca(i.placa)}` : 'Inspeção';
  });
  protected readonly descricao = computed(() => {
    const i = this.inspecao();
    if (!i) return undefined;
    const quem = i.responsavel ?? i.registradoPor;
    return [i.km != null ? formatarKm(i.km) : '', quem ? `por ${quem}` : ''].filter(Boolean).join(' · ') || undefined;
  });
}
