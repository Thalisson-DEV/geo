import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesChartComponent,
  CesCellDirective,
  CesDataTableComponent,
  CesDrillStateService,
  CesFilterPanelComponent,
  CesMultiSelectComponent,
  CesPageHeaderComponent,
  CesStatusComponent
} from '@ces/ui';

import { DashboardAnaliseComponent } from '../../../../../shared/components/dashboard/dashboard-analise.component';
import { NavegacaoAnaliseService } from '../../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardMetricCardComponent } from '../../../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardVisaoGerencialComponent } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent } from '../../../../copiloto/painel';
import { AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent } from '../almox-painel.components';
import { RecorteAlmoxService } from '../recorte-almox.service';
import { PainelSolicitacoesBase } from './painel-solicitacoes-base';

/**
 * Relatório das solicitações comerciais: pedidos das equipes comerciais, da aprovação à retirada, com o
 * atendimento das quantidades, quem não retira e o que falta.
 */
@Component({
  selector: 'app-almox-painel-comerciais',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteAlmoxService, CesDrillStateService, NavegacaoAnaliseService],
  imports: [
    DatePipe, CesAsyncStateComponent, CesCellDirective, CesStatusComponent, CesButtonComponent, CesCalloutComponent, CesChartComponent, CesDataTableComponent,
    CesFilterPanelComponent, CesMultiSelectComponent, CesPageHeaderComponent, DashboardMetricCardComponent,
    DashboardVisaoGerencialComponent, DashboardAnaliseComponent, AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent,
    CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './almox-painel-comerciais.component.html',
  styleUrl: '../painel-almox.css'
})
export class AlmoxPainelComerciaisComponent extends PainelSolicitacoesBase {
  protected readonly modo = 'COMERCIAL' as const;

  /** Liberadas e não retiradas: quem segura material no balcão. */
  protected readonly aguardandoRetirada = computed(() => this.r()?.abertas.filter((l) => l.etapa === 'PENDENTE_RETIRADA' && l.quantidadeAtendida <= 0) ?? []);
  /** Entregues em parte, com saldo a entregar. */
  protected readonly comSaldoPendente = computed(() => this.r()?.abertas.filter((l) => l.etapa === 'PENDENTE_RETIRADA' && l.quantidadeAtendida > 0) ?? []);
  protected readonly menosAtendidos = computed(() =>
    this.listaMateriais().filter((m) => m.solicitacoes >= 3 && (m.atendimento ?? 100) < 100).sort((a, b) => (a.atendimento ?? 100) - (b.atendimento ?? 100)).slice(0, 12));
  protected readonly graficoMenosAtendidos = computed(() => ({
    rotulos: this.menosAtendidos().map((m) => `${m.codigo} · ${m.descricao}`),
    series: [{ name: '% atendido', values: this.menosAtendidos().map((m) => (m.atendimento ?? 0) / 100) }]
  }));

  protected readonly contextoCopiloto = computed(() => this.contextoBase('almoxarifado.relatorios.comerciais', 'Solicitações comerciais',
    'Pedidos de material das equipes comerciais: aprovação, retirada, atendimento das quantidades, prazos de saque, equipes e materiais.',
    '/almoxarifado/relatorios/solicitacoes-comerciais'));

  constructor() {
    super();
    this.iniciar();
  }
}
