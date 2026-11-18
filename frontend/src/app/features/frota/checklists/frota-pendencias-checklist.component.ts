import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoIconButtonComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  NotificationService
} from '@geo/ui';
import { PendenciaChecklist, SituacaoPendenciaChecklist } from '../../../core/models/frota-checklist.models';
import { formatarPlaca } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaJustificativaDrawerComponent } from '../shared/frota-justificativa-drawer.component';
import { FrotaChecklistDetalheDrawerComponent, ROTULO_PENDENCIA, TOM_PENDENCIA } from './frota-checklist-detalhe-drawer.component';
import { recorrente, textoHistorico } from './frota-checklist.util';
import { FrotaPendenciaDecisaoDrawerComponent, ModoDecisao } from './frota-pendencia-decisao-drawer.component';

/** Um checklist com Não OK: os problemas apontados juntos, decididos de uma vez. */
interface GrupoChecklist {
  idChecklist: string;
  idVeiculo: string;
  placa: string | null;
  baseNome: string | null;
  preenchidoEm: string;
  condutorNome: string | null;
  pendencias: PendenciaChecklist[];
  recorrentes: number;
  fotos: number;
  fotosAChegar: number;
}

type Agrupamento = 'checklist' | 'problema';
const AGRUPAMENTOS: GeoSelectOption<Agrupamento>[] = [
  { label: 'Por checklist', value: 'checklist' },
  { label: 'Por problema', value: 'problema' }
];
const CHAVE_AGRUPAMENTO = 'frota-checklist-pendencias-agrupamento';

function lerAgrupamento(): Agrupamento {
  try {
    return localStorage.getItem(CHAVE_AGRUPAMENTO) === 'problema' ? 'problema' : 'checklist';
  } catch {
    return 'checklist';
  }
}

const SITUACOES: GeoSelectOption<SituacaoPendenciaChecklist>[] = [
  { label: 'Aguardando o gestor', value: 'ABERTA' },
  { label: 'Com OS aberta', value: 'OS_ABERTA' },
  { label: 'Resolvidas na hora', value: 'RESOLVIDA_NA_HORA' },
  { label: 'Descartadas', value: 'DESCARTADA' }
];

/**
 * Fila de Não OK dos checklists. O gestor abre a OS (uma para vários problemas do mesmo veículo),
 * registra o que foi resolvido na hora ou descarta o que foi marcado por engano. O Não OK nunca vira OS sozinho.
 */
@Component({
  selector: 'app-frota-pendencias-checklist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoIconButtonComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    FrotaChecklistDetalheDrawerComponent,
    FrotaJustificativaDrawerComponent,
    FrotaPendenciaDecisaoDrawerComponent
  ],
  template: `
    @if (agrupamento() === 'checklist') {
      <geo-data-table title="Pendências do checklist" [description]="descricaoGrupos()" storageKey="frota-checklist-pendencias-grupos"
        searchPlaceholder="Filtrar nesta lista" [(query)]="busca" [columns]="colunasGrupo" [rows]="grupos()" [rowKey]="chaveGrupo"
        [state]="carregando() ? 'loading' : erro() ? 'error' : grupos().length ? 'ready' : 'empty'"
        [stateTitle]="erro() ? 'Não foi possível carregar as pendências' : situacao() === 'ABERTA' ? 'Nenhum checklist esperando decisão' : 'Nenhuma pendência nessa situação'"
        [stateDescription]="erro() ?? (situacao() === 'ABERTA' ? 'Os checklists com Não OK aparecem aqui para você abrir a OS, registrar o que foi resolvido ou descartar.' : undefined)"
        rowActionLabel="Ver o checklist" (rowActivate)="verChecklistDoGrupo($event)">
        <ng-container table-actions>
          <geo-select label="Agrupar" [labelVisible]="false" [options]="agrupamentos" [value]="agrupamento()" (valueChange)="agrupar($event)"></geo-select>
          <geo-select label="Situação" [labelVisible]="false" [options]="situacoes" [value]="situacao()" (valueChange)="situacao.set($event ?? 'ABERTA')"></geo-select>
        </ng-container>
        <ng-template geoCell="placa" let-row>
          <span class="geo-cell-strong">{{ placa(row.placa) }}</span>
          <span class="geo-cell-muted">{{ row.baseNome ?? 'Sem base' }}</span>
        </ng-template>
        <ng-template geoCell="problemas" let-row>
          <span class="geo-cell-strong">{{ row.pendencias.length }} {{ row.pendencias.length === 1 ? 'problema' : 'problemas' }}</span>
          <span class="geo-cell-muted">{{ resumos(row) }}</span>
          @if (row.recorrentes) {
            <geo-status tone="danger" emphasis="outline" icon="pi-history">{{ row.recorrentes === 1 ? '1 recorrente' : row.recorrentes + ' recorrentes' }}</geo-status>
          }
        </ng-template>
        <ng-template geoCell="preenchidoEm" let-row>
          {{ row.preenchidoEm | date: 'dd/MM HH:mm' }}
          <span class="geo-cell-muted">{{ row.condutorNome ?? '—' }}</span>
        </ng-template>
        <ng-template geoCell="fotos" let-row>
          @if (row.fotosAChegar) {
            <geo-status tone="info" icon="pi-mobile">{{ row.fotosAChegar === 1 ? '1 no celular' : row.fotosAChegar + ' no celular' }}</geo-status>
          } @else if (row.fotos) {
            <geo-status tone="neutral" icon="pi-camera">{{ row.fotos }}</geo-status>
          } @else {
            <span class="geo-cell-muted">—</span>
          }
        </ng-template>
        <ng-template geoRowActions let-row>
          <span class="geo-table-actions">
            @if (abertas(row).length && acesso.editarOs()) {
              <geo-icon-button icon="pi pi-wrench" [label]="'Abrir uma OS para os problemas de ' + placa(row.placa)" tooltip="Abrir uma OS para todos" size="icon-sm"
                (pressed)="decidir(abertas(row), 'os')"></geo-icon-button>
              <geo-icon-button icon="pi pi-check" [label]="'Resolvidos na hora: problemas de ' + placa(row.placa)" tooltip="Todos resolvidos na hora" size="icon-sm"
                (pressed)="decidir(abertas(row), 'hora')"></geo-icon-button>
            }
            <geo-icon-button icon="pi pi-list" [label]="'Ver cada problema de ' + placa(row.placa)" tooltip="Ver cada problema" size="icon-sm"
              (pressed)="verProblemas(row)"></geo-icon-button>
          </span>
        </ng-template>
      </geo-data-table>
    } @else {
    <geo-data-table title="Pendências do checklist" [description]="descricao()" storageKey="frota-checklist-pendencias"
      searchPlaceholder="Filtrar nesta lista" [(query)]="busca" [columns]="colunasVisiveis()" [rows]="pendencias()" [rowKey]="chave"
      [state]="carregando() ? 'loading' : erro() ? 'error' : pendencias().length ? 'ready' : 'empty'"
      [stateTitle]="erro() ? 'Não foi possível carregar as pendências' : situacao() === 'ABERTA' ? 'Nenhum problema esperando decisão' : 'Nenhuma pendência nessa situação'"
      [stateDescription]="erro() ?? (situacao() === 'ABERTA' ? 'Os Não OK dos checklists aparecem aqui para você abrir a OS, registrar o que foi resolvido ou descartar.' : undefined)"
      [selectable]="situacao() === 'ABERTA' && acesso.editarOs()" [(selection)]="selecionadas"
      [rowClickable]="true" (rowActivate)="verChecklist($event)">
      <ng-container table-actions>
        <geo-select label="Agrupar" [labelVisible]="false" [options]="agrupamentos" [value]="agrupamento()" (valueChange)="agrupar($event)"></geo-select>
        <geo-select label="Situação" [labelVisible]="false" [options]="situacoes" [value]="situacao()" (valueChange)="situacao.set($event ?? 'ABERTA')"></geo-select>
      </ng-container>
      <geo-button selection-actions size="sm" icon="pi pi-wrench" label="Abrir uma OS" (pressed)="decidirSelecionadas('os')"></geo-button>
      <geo-button selection-actions size="sm" variant="outline" icon="pi pi-check" label="Resolvido na hora" (pressed)="decidirSelecionadas('hora')"></geo-button>

      <ng-template geoCell="placa" let-row>
        <span class="geo-cell-strong">{{ placa(row.placa) }}</span>
        <span class="geo-cell-muted">{{ row.baseNome ?? 'Sem base' }}</span>
      </ng-template>
      <ng-template geoCell="resumo" let-row>
        <span class="geo-cell-strong">{{ row.resumo }}</span>
        @if (row.comentario) {
          <span class="geo-cell-muted">{{ row.comentario }}</span>
        }
      </ng-template>
      <ng-template geoCell="historico" let-row>
        @if (recorrente(row.historico)) {
          <geo-status tone="danger" emphasis="outline" icon="pi-history">Recorrente</geo-status>
        }
        <span class="geo-cell-muted">{{ textoHistorico(row.historico) ?? '—' }}</span>
      </ng-template>
      <ng-template geoCell="preenchidoEm" let-row>
        {{ row.preenchidoEm | date: 'dd/MM HH:mm' }}
        <span class="geo-cell-muted">{{ row.condutorNome ?? '—' }}</span>
      </ng-template>
      <ng-template geoCell="fotos" let-row>
        @if (row.fotosAChegar) {
          <geo-status tone="info" icon="pi-mobile">{{ row.fotosAChegar === 1 ? '1 no celular' : row.fotosAChegar + ' no celular' }}</geo-status>
        } @else if (row.fotos.length) {
          <geo-status tone="neutral" icon="pi-camera">{{ row.fotos.length }}</geo-status>
        } @else {
          <span class="geo-cell-muted">—</span>
        }
      </ng-template>
      <ng-template geoCell="decisao" let-row>
        <geo-status [tone]="tomDe(row.situacao)" emphasis="outline">{{ rotuloDe(row.situacao) }}</geo-status>
        @if (row.numeroOrdemServico) {
          <span class="geo-cell-muted">OS {{ row.numeroOrdemServico }}{{ row.decididaPor ? ' · ' + row.decididaPor : '' }}</span>
        } @else if (row.justificativa) {
          <span class="geo-cell-muted">{{ row.justificativa }}</span>
        }
      </ng-template>
      <ng-template geoRowActions let-row>
        <span class="geo-table-actions">
          @if (row.situacao === 'ABERTA' && acesso.editarOs()) {
            <geo-icon-button icon="pi pi-wrench" [label]="'Abrir OS para ' + row.resumo" tooltip="Abrir OS" size="icon-sm" (pressed)="decidir([row], 'os')"></geo-icon-button>
            <geo-icon-button icon="pi pi-check" [label]="'Resolvido na hora: ' + row.resumo" tooltip="Resolvido na hora" size="icon-sm" (pressed)="decidir([row], 'hora')"></geo-icon-button>
            <geo-icon-button icon="pi pi-times" [label]="'Descartar ' + row.resumo" tooltip="Descartar (marcado por engano)" size="icon-sm" (pressed)="pedirDescarte(row)"></geo-icon-button>
          } @else if (row.idOrdemServico) {
            <geo-icon-button icon="pi pi-external-link" [label]="'Ver a OS ' + row.numeroOrdemServico" tooltip="Ver a OS" size="icon-sm" (pressed)="verOs(row.idOrdemServico)"></geo-icon-button>
          }
        </span>
      </ng-template>
    </geo-data-table>
    }

    <app-frota-pendencia-decisao-drawer [(visible)]="decisaoAberta" [modo]="modo()" [pendencias]="emDecisao()" (concluido)="aposDecidir()"></app-frota-pendencia-decisao-drawer>

    <app-frota-justificativa-drawer [(visivel)]="descarteAberto" titulo="Descartar pendência"
      [descricao]="emDecisao()[0] ? placa(emDecisao()[0].placa) + ': ' + emDecisao()[0].resumo + '. Use só para o Não OK marcado por engano.' : undefined"
      rotuloConfirmar="Descartar" [destrutivo]="true" [processando]="descartando()" (confirmado)="descartar($event)"></app-frota-justificativa-drawer>

    <app-frota-checklist-detalhe-drawer [(visible)]="checklistAberto" [idChecklist]="idChecklist()"></app-frota-checklist-detalhe-drawer>
  `
})
export class FrotaPendenciasChecklistComponent {
  private readonly checklist = inject(FrotaChecklistService);
  private readonly notificacoes = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly acesso = acessoFrota();
  /** A fila mudou (decisão tomada): a página reconta o que pede atenção. */
  readonly alterou = output<void>();
  /** Bases escolhidas no topo da página; vazio é todas. */
  readonly idsBase = input<string[]>([]);

  protected readonly situacoes = SITUACOES;
  protected readonly agrupamentos = AGRUPAMENTOS;
  /** Por checklist (padrão): o gestor decide o checklist inteiro; por problema, item a item. */
  protected readonly agrupamento = signal<Agrupamento>(lerAgrupamento());
  protected readonly rotuloDe = (s: SituacaoPendenciaChecklist) => ROTULO_PENDENCIA[s];
  protected readonly tomDe = (s: SituacaoPendenciaChecklist) => TOM_PENDENCIA[s];
  protected readonly placa = formatarPlaca;
  protected readonly textoHistorico = textoHistorico;
  protected readonly recorrente = recorrente;

  protected readonly situacao = signal<SituacaoPendenciaChecklist>('ABERTA');
  /** Aberta com ?busca= (o mapa da frota leva a placa): a lista já vem filtrada. */
  protected readonly busca = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('busca') ?? '');
  protected readonly pendencias = signal<PendenciaChecklist[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly selecionadas = signal<readonly PendenciaChecklist[]>([]);

  protected readonly decisaoAberta = signal(false);
  protected readonly modo = signal<ModoDecisao>('os');
  protected readonly emDecisao = signal<readonly PendenciaChecklist[]>([]);
  protected readonly descarteAberto = signal(false);
  protected readonly descartando = signal(false);
  protected readonly checklistAberto = signal(false);
  protected readonly idChecklist = signal<string | null>(null);

  protected readonly descricao = computed(() => {
    const n = this.pendencias().length;
    if (this.carregando() && !n) return undefined;
    const recorrentes = this.pendencias().filter((p) => recorrente(p.historico)).length;
    const base = n ? `${n} ${n === 1 ? 'problema' : 'problemas'}` : 'Nenhum problema';
    return recorrentes ? `${base} · ${recorrentes} ${recorrentes === 1 ? 'recorrente' : 'recorrentes'}` : base;
  });

  protected readonly colunas: GeoDataTableColumn<PendenciaChecklist>[] = [
    { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, value: (p) => p.placa, display: (p) => formatarPlaca(p.placa) },
    { key: 'resumo', header: 'Problema', type: 'custom', priority: 1, value: (p) => p.resumo, display: (p) => `${p.resumo} ${p.comentario ?? ''}` },
    { key: 'historico', header: 'Há quanto tempo', type: 'custom', priority: 1, value: (p) => p.historico?.diasComProblema ?? 0, display: (p) => textoHistorico(p.historico) ?? '' },
    { key: 'preenchidoEm', header: 'Apontado em', type: 'custom', value: (p) => p.preenchidoEm, display: (p) => `${p.preenchidoEm} ${p.condutorNome ?? ''}` },
    { key: 'fotos', header: 'Fotos', type: 'custom', value: (p) => p.fotos.length, display: (p) => String(p.fotos.length) },
    { key: 'decisao', header: 'Decisão', type: 'custom', value: (p) => p.situacao, display: (p) => ROTULO_PENDENCIA[p.situacao] }
  ];
  /** Na fila aberta a decisão é sempre a mesma: a coluna só aparece nas já decididas. */
  protected readonly colunasVisiveis = computed(() =>
    this.situacao() === 'ABERTA' ? this.colunas.filter((c) => c.key !== 'decisao') : this.colunas
  );
  protected readonly chave = (p: PendenciaChecklist) => p.id;
  protected readonly chaveGrupo = (g: GrupoChecklist) => g.idChecklist;

  protected readonly grupos = computed<GrupoChecklist[]>(() => {
    const porChecklist = new Map<string, GrupoChecklist>();
    for (const p of this.pendencias()) {
      let g = porChecklist.get(p.idChecklist);
      if (!g) {
        g = {
          idChecklist: p.idChecklist,
          idVeiculo: p.idVeiculo,
          placa: p.placa,
          baseNome: p.baseNome ?? null,
          preenchidoEm: p.preenchidoEm,
          condutorNome: p.condutorNome ?? null,
          pendencias: [],
          recorrentes: 0,
          fotos: 0,
          fotosAChegar: 0
        };
        porChecklist.set(p.idChecklist, g);
      }
      g.pendencias.push(p);
      if (recorrente(p.historico)) g.recorrentes++;
      g.fotos += p.fotos.length;
      g.fotosAChegar += p.fotosAChegar ?? 0;
    }
    return [...porChecklist.values()];
  });

  protected readonly descricaoGrupos = computed(() => {
    if (this.carregando() && !this.pendencias().length) return undefined;
    const g = this.grupos().length;
    const n = this.pendencias().length;
    return g ? `${g} ${g === 1 ? 'checklist' : 'checklists'} · ${n} ${n === 1 ? 'problema' : 'problemas'}` : 'Nenhum checklist';
  });

  protected readonly colunasGrupo: GeoDataTableColumn<GrupoChecklist>[] = [
    { key: 'placa', header: 'Veículo', type: 'custom', priority: 1, value: (g) => g.placa, display: (g) => `${formatarPlaca(g.placa)} ${g.baseNome ?? ''}` },
    { key: 'problemas', header: 'Problemas apontados', type: 'custom', priority: 1, value: (g) => g.pendencias.length, display: (g) => this.resumos(g) },
    { key: 'preenchidoEm', header: 'Checklist de', type: 'custom', priority: 1, value: (g) => g.preenchidoEm, display: (g) => `${g.preenchidoEm} ${g.condutorNome ?? ''}` },
    { key: 'fotos', header: 'Fotos', type: 'custom', value: (g) => g.fotos, display: (g) => String(g.fotos) }
  ];

  protected resumos(g: GrupoChecklist): string {
    return g.pendencias.map((p) => p.resumo).join(' · ');
  }

  /** Só os ainda sem decisão entram na OS ou no "resolvido na hora". */
  protected abertas(g: GrupoChecklist): PendenciaChecklist[] {
    return g.pendencias.filter((p) => p.situacao === 'ABERTA');
  }

  protected agrupar(valor: Agrupamento | null): void {
    const escolhido = valor ?? 'checklist';
    this.agrupamento.set(escolhido);
    this.selecionadas.set([]);
    try {
      localStorage.setItem(CHAVE_AGRUPAMENTO, escolhido);
    } catch {
      // Sem armazenamento (aba anônima): a escolha vale só nesta visita.
    }
  }

  /** Abre a lista item a item já filtrada pela placa do checklist. */
  protected verProblemas(g: GrupoChecklist): void {
    this.busca.set(formatarPlaca(g.placa));
    this.agrupar('problema');
  }

  protected verChecklistDoGrupo(g: GrupoChecklist): void {
    this.idChecklist.set(g.idChecklist);
    this.checklistAberto.set(true);
  }

  constructor() {
    effect(() => {
      this.situacao();
      this.idsBase();
      untracked(() => this.carregar());
    });
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.selecionadas.set([]);
    this.checklist.pendencias(this.situacao(), this.idsBase(), { page: 0, size: 200, sort: ['dataCriacao,desc'] }).subscribe({
      next: (p) => {
        this.pendencias.set(p.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected decidir(pendencias: readonly PendenciaChecklist[], modo: ModoDecisao): void {
    this.emDecisao.set(pendencias);
    this.modo.set(modo);
    this.decisaoAberta.set(true);
  }

  /** Uma OS vale para um veículo: a seleção precisa ser de uma placa só. */
  protected decidirSelecionadas(modo: ModoDecisao): void {
    const selecionadas = this.selecionadas();
    if (new Set(selecionadas.map((p) => p.idVeiculo)).size > 1) {
      this.notificacoes.warning('Escolha problemas de um único veículo para a mesma OS.');
      return;
    }
    this.decidir(selecionadas, modo);
  }

  protected aposDecidir(): void {
    this.carregar();
    this.alterou.emit();
  }

  protected pedirDescarte(p: PendenciaChecklist): void {
    this.emDecisao.set([p]);
    this.descarteAberto.set(true);
  }

  protected descartar(justificativa: string): void {
    const p = this.emDecisao()[0];
    this.descartando.set(true);
    this.checklist.descartar(p.id, justificativa).subscribe({
      next: () => {
        this.descartando.set(false);
        this.descarteAberto.set(false);
        this.notificacoes.success('Pendência descartada.');
        this.aposDecidir();
      },
      error: (e) => {
        this.descartando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected verChecklist(p: PendenciaChecklist): void {
    this.idChecklist.set(p.idChecklist);
    this.checklistAberto.set(true);
  }

  protected verOs(id: string): void {
    void this.router.navigate(['/frota/ordens-servico', id]);
  }
}
