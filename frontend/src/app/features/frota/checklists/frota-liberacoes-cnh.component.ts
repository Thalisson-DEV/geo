import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { AptidaoConducao, CatalogoChecklist, LiberacaoCnh } from '../../../core/models/frota-checklist.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { dataIso } from '../../../shared/listagem/listagem';
import { acessoFrota } from '../shared/frota-acesso';

const JUSTIFICATIVA_MINIMA = 10;

/**
 * Liberações de CNH: o gestor deixa um condutor com CNH vencida ou de categoria insuficiente
 * abastecer um veículo, só naquele dia, com a justificativa registrada. O checklist não depende
 * disto: com a CNH irregular ele vale e só avisa (gestores, 23/10/2026).
 */
@Component({
  selector: 'app-frota-liberacoes-cnh',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoSelectComponent,
    GeoTextareaComponent
  ],
  template: `
    <geo-data-table title="Liberações de CNH"
      description="Valem só para o condutor, o veículo e o dia. A CNH vencida ou de categoria insuficiente bloqueia só o abastecimento; o checklist é aceito com aviso."
      storageKey="frota-liberacoes-cnh" searchPlaceholder="Filtrar nesta lista" [columns]="colunas" [rows]="liberacoes()" [rowKey]="chave"
      [state]="carregando() ? 'loading' : erro() ? 'error' : liberacoes().length ? 'ready' : 'empty'"
      [stateTitle]="erro() ? 'Não foi possível carregar as liberações' : 'Nenhuma liberação de CNH'"
      [stateDescription]="erro() ?? 'Quando um condutor estiver com a CNH vencida, libere aqui para ele dirigir hoje.'">
      <ng-container table-actions>
        @if (acesso.editarCondutor()) {
          <geo-button size="sm" icon="pi pi-unlock" label="Liberar condutor" (pressed)="abrir()"></geo-button>
        }
      </ng-container>
      <ng-template geoCell="dia" let-row>{{ row.dia | date: 'dd/MM/yyyy' }}</ng-template>
      <ng-template geoCell="liberadoPor" let-row>
        {{ row.liberadoPor ?? '—' }}
        <span class="geo-cell-muted">{{ row.liberadoEm | date: 'dd/MM HH:mm' }}</span>
      </ng-template>
    </geo-data-table>

    <geo-form-drawer [(visible)]="formularioAberto" title="Liberar condutor"
      description="Para o condutor pedir abastecimento no dia, mesmo com a CNH impedindo." [dirty]="!!justificativa().trim()"
      [loading]="salvando()" size="md">
      <div class="geo-form-stack">
        <geo-form-section title="Quem e qual veículo" icon="pi pi-id-card">
          <geo-select label="Condutor" [required]="true" [options]="opcoesCondutores()" [(value)]="idCondutor" [filter]="true"
            [loading]="!catalogo()" placeholder="Escolha o condutor" [error]="tentou() && !idCondutor() ? 'Escolha o condutor.' : undefined"></geo-select>
          <geo-select label="Veículo" [required]="true" [options]="opcoesVeiculos()" [(value)]="idVeiculo" [filter]="true"
            [loading]="!catalogo()" placeholder="Escolha o veículo" [error]="tentou() && !idVeiculo() ? 'Escolha o veículo.' : undefined"></geo-select>
          @if (aptidao(); as a) {
            <geo-callout [tone]="a.situacao === 'APTO' ? 'success' : 'warning'" [dense]="true">
              {{ a.situacao === 'APTO' ? 'A CNH permite conduzir este veículo; não é preciso liberar.' : a.mensagem }}
              @if (a.idLiberacao) {
                Já está liberado para hoje.
              }
            </geo-callout>
          }
        </geo-form-section>
        @if (aptidao()?.situacao !== 'APTO') {
        <geo-form-section title="Liberação" icon="pi pi-unlock">
          <geo-datepicker label="Dia" [required]="true" [(value)]="dia" [minDate]="hoje" description="Vale só para este dia."></geo-datepicker>
          <geo-textarea label="Justificativa" [required]="true" [(value)]="justificativa" [rows]="3" [maxlength]="1000"
            placeholder="Ex.: Renovação em andamento, protocolo 123." [error]="erroJustificativa()"></geo-textarea>
        </geo-form-section>
        }
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="formularioAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-unlock" label="Liberar" [loading]="salvando()" [disabled]="aptidao()?.situacao === 'APTO'" (pressed)="liberar()"></geo-button>
      </div>
    </geo-form-drawer>
  `
})
export class FrotaLiberacoesCnhComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly notificacoes = inject(NotificationService);
  protected readonly acesso = acessoFrota();

  protected readonly liberacoes = signal<LiberacaoCnh[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly catalogo = signal<CatalogoChecklist | null>(null);

  protected readonly formularioAberto = signal(false);
  protected readonly idCondutor = signal<string | null>(null);
  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly hoje = new Date(new Date().setHours(0, 0, 0, 0));
  protected readonly dia = signal<Date | null>(this.hoje);
  protected readonly justificativa = signal('');
  protected readonly aptidao = signal<AptidaoConducao | null>(null);
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);

  protected readonly opcoesCondutores = computed<GeoSelectOption<string>[]>(() =>
    (this.catalogo()?.condutores ?? []).map((c) => ({
      label: `${c.nome}${c.categoriaCnh ? ' · CNH ' + c.categoriaCnh : ''}`,
      value: c.idColaborador
    }))
  );
  protected readonly opcoesVeiculos = computed<GeoSelectOption<string>[]>(() =>
    (this.catalogo()?.veiculos ?? []).map((v) => ({
      label: `${formatarPlaca(v.placa)}${v.descricao ? ' · ' + v.descricao : ''}${v.categoriaCnhExigida ? ' · exige ' + v.categoriaCnhExigida : ''}`,
      value: v.idVeiculo
    }))
  );
  protected readonly erroJustificativa = computed(() => {
    if (!this.tentou()) return undefined;
    const t = this.justificativa().trim();
    if (!t) return 'Informe a justificativa.';
    return t.length < JUSTIFICATIVA_MINIMA ? `Descreva com pelo menos ${JUSTIFICATIVA_MINIMA} caracteres.` : undefined;
  });

  protected readonly colunas: GeoDataTableColumn<LiberacaoCnh>[] = [
    { key: 'dia', header: 'Dia', type: 'date', priority: 1, value: (l) => l.dia },
    { key: 'condutorNome', header: 'Condutor', priority: 1, display: (l) => l.condutorNome ?? '—' },
    { key: 'placa', header: 'Veículo', display: (l) => formatarPlaca(l.placa) },
    { key: 'justificativa', header: 'Justificativa' },
    { key: 'liberadoPor', header: 'Liberado por', type: 'custom', value: (l) => l.liberadoPor, display: (l) => l.liberadoPor ?? '' }
  ];
  protected readonly chave = (l: LiberacaoCnh) => l.id;

  /** Bases escolhidas no topo da página; vazio é todas. */
  readonly idsBase = input<string[]>([]);

  constructor() {
    effect(() => {
      this.idsBase();
      untracked(() => this.carregar());
    });
    effect(() => {
      const idCondutor = this.idCondutor();
      const idVeiculo = this.idVeiculo();
      this.aptidao.set(null);
      if (!idCondutor || !idVeiculo) return;
      this.checklist.aptidao(idCondutor, idVeiculo).subscribe({ next: (a) => this.aptidao.set(a), error: () => undefined });
    });
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.checklist.liberacoesCnh({ page: 0, size: 200 }, this.idsBase()).subscribe({
      next: (p) => {
        this.liberacoes.set(p.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected abrir(): void {
    this.idCondutor.set(null);
    this.idVeiculo.set(null);
    this.dia.set(this.hoje);
    this.justificativa.set('');
    this.tentou.set(false);
    this.formularioAberto.set(true);
    if (!this.catalogo()) {
      this.checklist.catalogo().subscribe({
        next: (c) => this.catalogo.set(c),
        error: (e) => this.notificacoes.error(getErrorMessage(e))
      });
    }
  }

  protected liberar(): void {
    this.tentou.set(true);
    if (!this.idCondutor() || !this.idVeiculo() || this.erroJustificativa() || !this.dia()) return;
    this.salvando.set(true);
    this.checklist.liberarCnh({
      idCondutor: this.idCondutor()!,
      idVeiculo: this.idVeiculo()!,
      dia: dataIso(this.dia()),
      justificativa: this.justificativa().trim()
    }).subscribe({
      next: (l) => {
        this.salvando.set(false);
        this.formularioAberto.set(false);
        this.notificacoes.success(`${l.condutorNome ?? 'Condutor'} liberado para ${formatarPlaca(l.placa)}.`);
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }
}
