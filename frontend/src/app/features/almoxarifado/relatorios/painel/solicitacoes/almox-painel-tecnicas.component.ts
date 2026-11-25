import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoChartComponent,
  GeoDataTableColumn,
  GeoCellDirective,
  GeoDataTableComponent,
  GeoDrillStateService,
  GeoFilterPanelComponent,
  GeoMultiSelectComponent,
  GeoPageHeaderComponent,
  GeoStatusComponent
} from '@geo/ui';

import { DashboardAnaliseComponent } from '../../../../../shared/components/dashboard/dashboard-analise.component';
import { NavegacaoAnaliseService } from '../../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardMetricCardComponent } from '../../../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardVisaoGerencialComponent } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent } from '../../../../copiloto/painel';
import { AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent } from '../almox-painel.components';
import { RecorteAlmoxService } from '../recorte-almox.service';
import { PainelSolicitacoesBase } from './painel-solicitacoes-base';
import { LinhaRanking, SEM_CHAVE, TIPOS_OBRA, ehDevolucao, ranking, rotuloTipo } from './solicitacoes-calculos';

/**
 * Relatório das solicitações técnicas: adições e devoluções das obras (221/921/222/922), do planejamento
 * à separação, retirada e devolução, por obra, tipo e equipe.
 */
@Component({
  selector: 'app-almox-painel-tecnicas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteAlmoxService, GeoDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, GeoAsyncStateComponent, GeoCellDirective, GeoStatusComponent, GeoButtonComponent, GeoCalloutComponent, GeoChartComponent, GeoDataTableComponent,
    GeoFilterPanelComponent, GeoMultiSelectComponent, GeoPageHeaderComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './almox-painel-tecnicas.component.html',
  styleUrl: '../painel-almox.css'
})
export class AlmoxPainelTecnicasComponent extends PainelSolicitacoesBase {
  protected readonly modo = 'TECNICO' as const;

  protected readonly porTipo = computed<LinhaRanking[]>(() => {
    const r = this.r();
    return r ? ranking(r.periodo, r.backlog, r.hoje, (l) => l.tipoTecnico, (l) => rotuloTipo(l.tipoTecnico)).sort((a, b) => a.chave.localeCompare(b.chave)) : [];
  });
  protected readonly porTipoObra = computed<LinhaRanking[]>(() => {
    const r = this.r();
    return r ? ranking(r.periodo, r.backlog, r.hoje, (l) => l.tipoObra, (l) => (l.tipoObra ? TIPOS_OBRA[l.tipoObra] ?? l.tipoObra : null)) : [];
  });
  /** Obras: adições, devoluções e fila de cada uma. */
  protected readonly obras = computed(() => {
    const r = this.r();
    if (!r) return [];
    const todas = [...r.periodo, ...r.backlog];
    return ranking(r.periodo, r.backlog, r.hoje, (l) => l.idObra, (l) => (l.numeroObra ? `Obra ${l.numeroObra}` : 'Obra'), (l) => (l.tipoObra ? TIPOS_OBRA[l.tipoObra] ?? l.tipoObra : null))
      .filter((o) => o.chave !== SEM_CHAVE)
      .map((o) => {
        const l = todas.filter((s) => s.idObra === o.chave && !s.anteriorAoPeriodo);
        const adicoes = l.filter((s) => !ehDevolucao(s)).length;
        const devolucoes = l.filter((s) => ehDevolucao(s)).length;
        return { ...o, adicoes, devolucoes, taxaDevolucao: adicoes ? devolucoes / adicoes : null };
      })
      .sort((a, b) => b.abertas - a.abertas || b.total - a.total);
  });
  protected readonly obrasTop = computed(() => this.obras().slice(0, 12));
  protected readonly graficoObras = computed(() => ({
    rotulos: this.obrasTop().map((o) => o.rotulo),
    series: [{ name: 'Adições', values: this.obrasTop().map((o) => o.adicoes) }, { name: 'Devoluções', values: this.obrasTop().map((o) => o.devolucoes) }]
  }));
  protected readonly graficoTipo = computed(() => ({
    rotulos: this.porTipo().map((t) => t.rotulo),
    series: [{ name: 'Concluídas', values: this.porTipo().map((t) => t.concluidas) }, { name: 'Em aberto', values: this.porTipo().map((t) => t.abertas) },
      { name: 'Recusadas', values: this.porTipo().map((t) => t.recusadas) }]
  }));
  protected readonly devolucoesPendentes = computed(() => this.r()?.abertas.filter((l) => l.etapa === 'PENDENTE_DEVOLUCAO').length ?? 0);
  protected readonly naSeparacao = computed(() => this.r()?.abertas.filter((l) => l.etapa === 'PRONTO_PARA_SEPARACAO' || l.etapa === 'EM_SEPARACAO').length ?? 0);
  protected readonly colObras: GeoDataTableColumn<LinhaRanking & { adicoes: number; devolucoes: number }>[] = [
    ...(this.colRanking.filter((c) => c.key !== 'detalhe' && c.key !== 'atendimento') as GeoDataTableColumn<LinhaRanking & { adicoes: number; devolucoes: number }>[]),
    { key: 'detalhe', header: 'Tipo de obra', priority: 3, value: (l) => l.detalhe ?? '—' },
    { key: 'adicoes', header: 'Adições', type: 'integer', priority: 2 },
    { key: 'devolucoes', header: 'Devoluções', type: 'integer', priority: 2 }
  ];

  protected analisarObra(i: number): void {
    this.selecionar(this.obrasTop(), i, 'obra', (o) => o.chave);
  }
  protected analisarTipo(i: number): void {
    this.selecionar(this.porTipo(), i, 'tipo', (t) => t.chave);
  }

  protected readonly contextoCopiloto = computed(() => this.contextoBase('almoxarifado.relatorios.tecnicas', 'Solicitações técnicas',
    'Retiradas e devoluções das obras: planejamento, separação, retirada, devoluções pendentes, obras, tipos e equipes.',
    '/almoxarifado/relatorios/solicitacoes-tecnicas'));

  constructor() {
    super();
    this.iniciar();
  }
}
