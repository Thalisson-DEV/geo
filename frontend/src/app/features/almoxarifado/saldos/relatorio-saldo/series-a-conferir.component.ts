import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import {
  CesButtonComponent,
  CesCellDirective,
  CesDataTableColumn,
  CesDataTableComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesRowActionsDirective,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  NotificationService
} from '@ces/ui';

import {
  AplicacaoForaDoSaldo,
  MaterialAConferir,
  SeriesAConferirResponse
} from '../../../../core/models/almoxarifado.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';

interface AplicacaoEmConferencia {
  material: MaterialAConferir;
  aplicacao: AplicacaoForaDoSaldo;
}

/**
 * Séries que a equipe aplicou em campo sem que estivessem no caminhão. Para cada uma, o
 * almoxarifado diz qual série do caminhão foi usada (ela sai do saldo da equipe; a quantidade
 * não muda) ou que nenhuma corresponde. Só aparece quando há algo a conferir.
 */
@Component({
  selector: 'app-series-a-conferir',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    CesButtonComponent,
    CesCellDirective,
    CesDataTableComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesRowActionsDirective,
    CesSelectComponent,
    CesStatusComponent
  ],
  template: `
    <section class="mb-8 print:hidden" aria-labelledby="series-a-conferir-titulo">
      <div class="flex items-center gap-2 mb-1 border-l-2 border-amber-500 pl-3">
        <span id="series-a-conferir-titulo" class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Séries a conferir</span>
        <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">({{ totalAplicadas() }} {{ totalAplicadas() === 1 ? 'série' : 'séries' }})</span>
      </div>
      <p class="text-[11px] text-slate-600 dark:text-slate-400 mb-4 max-w-3xl">
        A equipe registrou nas notas séries que não estavam no caminhão dela, e o caminhão ficou com séries a mais.
        Para cada série abaixo, diga qual série do caminhão foi usada de verdade: ela sai do saldo da equipe e a quantidade não muda.
      </p>

      @for (material of dados().materiais; track material.idMaterial) {
        <div class="material rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 mb-4">
          <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                <span class="font-mono">{{ material.codigo }}</span> · <span class="uppercase">{{ material.descricao }}</span>
              </span>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                Saldo {{ material.quantidadeSaldo | number: '1.0-3' }} · {{ material.seriesNoSaldo }} {{ material.seriesNoSaldo === 1 ? 'série' : 'séries' }} no caminhão
              </span>
            </div>
            <ces-status tone="warning" icon="pi pi-barcode">
              {{ material.seriesSobrando }} {{ material.seriesSobrando === 1 ? 'série a mais' : 'séries a mais' }}
            </ces-status>
          </div>

          <ces-data-table
            [caption]="'Séries aplicadas fora do caminhão: ' + material.codigo"
            [searchable]="material.aplicadas.length > 10"
            searchPlaceholder="Buscar série"
            [columns]="colunas"
            [rows]="material.aplicadas"
            [rowKey]="chave"
            [rowLabel]="rotulo"
            [pageSizeOptions]="[10, 25, 50]"
          >
            <ng-template cesCell="numSerie" let-row>
              <span class="font-mono font-semibold">{{ row.numSerie }}</span>
            </ng-template>
            <ng-template cesCell="dataHora" let-row>
              {{ row.dataHora | date: 'dd/MM/yyyy HH:mm' }}
            </ng-template>
            <ng-template cesCell="sugestao" let-row>
              @if (row.sugestao) {
                <span class="inline-flex items-center gap-2">
                  <span class="font-mono">{{ row.sugestao }}</span>
                  <ces-status tone="info" icon="pi-search">Parecida</ces-status>
                </span>
              } @else {
                <span class="text-slate-400">Nenhuma parecida</span>
              }
            </ng-template>
            <ng-template cesRowActions let-row>
              <ces-button variant="outline" size="sm" icon="pi pi-check-square" label="Conferir"
                [ariaLabel]="'Conferir a série ' + row.numSerie" (pressed)="abrir(material, row)"></ces-button>
            </ng-template>
          </ces-data-table>
        </div>
      }
    </section>

    <ces-form-drawer [(visible)]="drawerAberto" title="Conferir série aplicada" [description]="descricaoDrawer()"
      [dirty]="false" [loading]="salvando()" size="md" (closed)="fechar()">
      @if (emConferencia(); as c) {
        <ces-form-section title="O que aconteceu" icon="pi pi-info-circle">
          <p class="text-sm text-slate-700 dark:text-slate-300 m-0">
            A equipe registrou a série <strong class="font-mono">{{ c.aplicacao.numSerie }}</strong> na nota de
            {{ c.aplicacao.dataHora | date: "dd/MM/yyyy 'às' HH:mm" }}, mas essa série não estava no caminhão.
            Na maioria das vezes é um número digitado errado.
          </p>
        </ces-form-section>

        <ces-form-section title="Série do caminhão" icon="pi pi-barcode">
          <ces-select label="Série usada" [required]="true" [options]="opcoes()" [(value)]="serieEscolhida"
            [filter]="opcoes().length > 8" filterPlaceholder="Buscar série" placeholder="Escolha a série"
            [description]="c.aplicacao.sugestao
              ? 'Sugerimos a série mais parecida com a digitada. Confira na etiqueta antes de confirmar.'
              : 'Nenhuma série do caminhão é parecida com a digitada. Confira a etiqueta do item instalado.'"></ces-select>
          <ul class="text-[12px] text-slate-600 dark:text-slate-400 m-0 pl-4 list-disc flex flex-col gap-1">
            <li>A série escolhida sai do saldo da equipe.</li>
            <li>A quantidade em saldo continua {{ c.material.quantidadeSaldo | number: '1.0-3' }}: a nota já descontou o item.</li>
            <li>Se nenhuma série do caminhão foi usada, escolha "Nenhuma corresponde": a série só sai desta lista.</li>
          </ul>
        </ces-form-section>
      }
      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Nenhuma corresponde" [disabled]="salvando()" (pressed)="confirmar(null)"></ces-button>
        <ces-button variant="ghost" label="Cancelar" [disabled]="salvando()" (pressed)="drawerAberto.set(false)"></ces-button>
        <ces-button icon="pi pi-check" label="Confirmar série" [loading]="salvando()" [disabled]="!serieEscolhida()"
          (pressed)="confirmar(serieEscolhida())"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class SeriesAConferirComponent {
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly notificacoes = inject(NotificationService);

  readonly idEstoque = input.required<string>();
  readonly dados = input.required<SeriesAConferirResponse>();
  /** Lista atualizada depois de cada conferência (o saldo serial da equipe mudou). */
  readonly atualizado = output<SeriesAConferirResponse>();

  protected readonly drawerAberto = signal(false);
  protected readonly emConferencia = signal<AplicacaoEmConferencia | null>(null);
  protected readonly serieEscolhida = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly totalAplicadas = computed(() =>
    this.dados().materiais.reduce((total, m) => total + m.aplicadas.length, 0));

  protected readonly colunas: CesDataTableColumn<AplicacaoForaDoSaldo>[] = [
    { key: 'numSerie', header: 'Série na nota', type: 'custom', priority: 1, value: (a) => a.numSerie },
    { key: 'dataHora', header: 'Aplicada em', type: 'custom', priority: 1, width: '10rem', value: (a) => a.dataHora },
    { key: 'sugestao', header: 'Série parecida no caminhão', type: 'custom', priority: 2, value: (a) => a.sugestao ?? '' }
  ];

  protected readonly chave = (a: AplicacaoForaDoSaldo) => a.idMovimentacao;
  protected readonly rotulo = (a: AplicacaoForaDoSaldo) => `Série ${a.numSerie}`;

  protected readonly descricaoDrawer = computed(() => {
    const c = this.emConferencia();
    return c ? `Série ${c.aplicacao.numSerie} · ${c.material.codigo}` : undefined;
  });

  /** Séries do caminhão, com a sugerida primeiro. */
  protected readonly opcoes = computed<CesSelectOption<string>[]>(() => {
    const c = this.emConferencia();
    if (!c) return [];
    const sugestao = c.aplicacao.sugestao;
    const series = sugestao ? [sugestao, ...c.material.seriesDisponiveis.filter((s) => s !== sugestao)] : c.material.seriesDisponiveis;
    return series.map((s) => ({ value: s, label: s === sugestao ? `${s} · parecida com a da nota` : s }));
  });

  protected abrir(material: MaterialAConferir, aplicacao: AplicacaoForaDoSaldo): void {
    this.emConferencia.set({ material, aplicacao });
    this.serieEscolhida.set(aplicacao.sugestao ?? null);
    this.drawerAberto.set(true);
  }

  protected fechar(): void {
    this.emConferencia.set(null);
    this.serieEscolhida.set(null);
  }

  protected confirmar(numSerieDoEstoque: string | null): void {
    const c = this.emConferencia();
    if (!c || this.salvando()) return;
    this.salvando.set(true);
    this.almoxarifado
      .conciliarSerieAplicada(this.idEstoque(), {
        idMovimentacaoAplicacao: c.aplicacao.idMovimentacao,
        numSerieDoEstoque
      })
      .subscribe({
        next: (res) => {
          this.salvando.set(false);
          this.drawerAberto.set(false);
          this.notificacoes.success(numSerieDoEstoque
            ? `Série ${numSerieDoEstoque} saiu do saldo da equipe.`
            : `Série ${c.aplicacao.numSerie} conferida sem correspondente no caminhão.`);
          this.atualizado.emit(res);
        },
        error: (e) => {
          this.salvando.set(false);
          this.notificacoes.error(getErrorMessage(e) || 'Não foi possível conferir a série.');
        }
      });
  }
}
