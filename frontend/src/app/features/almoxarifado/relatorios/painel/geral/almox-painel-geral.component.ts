import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesChartComponent,
  CesDataTableColumn,
  CesCellDirective,
  CesDataTableComponent,
  CesDrillStateService,
  CesFilterChip,
  CesFilterPanelComponent,
  CesPageHeaderComponent,
  CesStatusComponent
} from '@ces/ui';
import { Observable, catchError, forkJoin, of } from 'rxjs';

import { AuthService } from '../../../../../core/services/auth.service';
import { VistaAnalise } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { NavegacaoAnaliseService } from '../../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { DashboardMetricCardComponent } from '../../../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardVisaoGerencialComponent } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  CopilotoAreaComponent,
  CopilotoDashboardContext,
  CopilotoGatilhoComponent,
  CopilotoPerguntarComponent,
  metricaPainel,
  periodoPainel
} from '../../../../copiloto/painel';
import { conhecidosMov, dias, inteiro, pct, plural } from '../almox-analise-comum';
import { AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent } from '../almox-painel.components';
import { FiltroAlmox, PainelAlmoxBase } from '../painel-almox-base';
import { RecorteAlmoxService } from '../recorte-almox.service';
import { atrasada } from '../solicitacoes/solicitacoes-calculos';
import { AREAS, Area, FontesGeral, ModeloGeral, Pendencia, descricaoPendencia, modeloGeral, vereditoGeral } from './analise-geral';

/**
 * Visão geral do almoxarifado: o que pede ação hoje em todas as áreas, a saúde de cada uma e o fluxo do
 * balcão. Cada número leva ao relatório da área, com o mesmo recorte e a análise aberta.
 */
@Component({
  selector: 'app-almox-painel-geral',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RecorteAlmoxService, CesDrillStateService, NavegacaoAnaliseService],
  imports: [
    CesAsyncStateComponent, CesCellDirective, CesStatusComponent, CesButtonComponent, CesCalloutComponent, CesChartComponent, CesDataTableComponent,
    CesFilterPanelComponent, CesPageHeaderComponent, DashboardMetricCardComponent, DashboardVisaoGerencialComponent,
    AlmoxPainelTopoComponent, AlmoxRecorteCamposComponent, CopilotoAreaComponent, CopilotoGatilhoComponent, CopilotoPerguntarComponent
  ],
  templateUrl: './almox-painel-geral.component.html',
  styleUrl: '../painel-almox.css'
})
export class AlmoxPainelGeralComponent extends PainelAlmoxBase<FontesGeral> {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly inteiro = inteiro;
  protected readonly pct = pct;
  protected readonly dias = dias;
  protected readonly plural = plural;
  protected readonly areas = AREAS;

  /** Áreas que o perfil não pôde ler nesta consulta. */
  protected readonly semAcesso = signal<Area[]>([]);
  protected readonly chipsProprios = computed<CesFilterChip[]>(() => []);
  protected readonly vistaAnalise = computed<VistaAnalise | null>(() => null);

  protected readonly modelo = computed<ModeloGeral | null>(() => {
    const d = this.dados();
    return d ? modeloGeral(d, this.recorte.aceita(), this.recorte.aplicado().idAlmoxarifado) : null;
  });
  protected readonly veredito = computed(() => {
    const m = this.modelo();
    return m ? vereditoGeral(m) : null;
  });

  /** Fila em aberto por processo, separando o que está atrasado. */
  protected readonly filas = computed(() => {
    const m = this.modelo();
    if (!m) return null;
    const linhas: { area: Area; abertas: number; atrasadas: number }[] = [];
    if (m.comercial) linhas.push({ area: 'comerciais', abertas: m.comercial.abertas.length, atrasadas: m.comercial.abertas.filter((s) => atrasada(s, m.comercial!.hoje)).length });
    if (m.tecnico) linhas.push({ area: 'tecnicas', abertas: m.tecnico.abertas.length, atrasadas: m.tecnico.abertas.filter((s) => atrasada(s, m.tecnico!.hoje)).length });
    if (m.fechamento) linhas.push({ area: 'fechamento', abertas: m.fechamento.abertas.length, atrasadas: m.fechamento.atrasadas.length });
    return {
      linhas,
      rotulos: linhas.map((l) => AREAS[l.area].rotulo),
      series: [{ name: 'No prazo', values: linhas.map((l) => l.abertas - l.atrasadas) }, { name: 'Atrasadas', values: linhas.map((l) => l.atrasadas) }]
    };
  });

  protected readonly colPendencias: CesDataTableColumn<Pendencia>[] = [
    { key: 'area', header: 'Área', priority: 2, value: (p) => AREAS[p.area].curto },
    { key: 'situacao', header: 'Situação', priority: 1, value: (p) => p.situacao },
    { key: 'tipo', header: 'O quê', priority: 1 },
    { key: 'descricao', header: 'Detalhe', priority: 1 },
    { key: 'responsavel', header: 'Com quem', priority: 2 },
    { key: 'desde', header: 'Desde', type: 'custom', priority: 3, value: (p) => p.desde, display: descricaoPendencia },
    { key: 'atraso', header: 'Atraso', type: 'custom', priority: 1, value: (p) => p.atraso, display: (p) => (p.atraso ? plural(p.atraso, 'dia', 'dias') : '—') }
  ];
  protected readonly chavePendencia = (p: Pendencia) => p.chave;
  protected readonly areaDe = (p: unknown) => AREAS[(p as Pendencia).area];

  constructor() {
    super();
    effect(() => {
      const d = this.dados();
      if (!d) return;
      const [almox, equipes] = d.mov ? conhecidosMov(d.mov.movimentacoes) : [[], []] as [Array<[string | null, string | null]>, Array<[string | null, string | null]>];
      for (const s of d.solicitacoes?.solicitacoes ?? []) {
        almox.push([s.idAlmoxarifado, s.almoxarifado]);
        equipes.push([s.idEquipe, s.equipe]);
      }
      this.recorte.conhecer(almox, equipes);
    });
    this.iniciar();
  }

  protected carregar(f: FiltroAlmox): Observable<FontesGeral> {
    const pode = (p: string) => !!this.auth.currentUser()?.permissoes?.includes(p);
    const faltou: Area[] = [];
    const fonte = <T>(permissao: string, areas: Area[], o: () => Observable<T>): Observable<T | null> => {
      if (!pode(permissao)) {
        faltou.push(...areas);
        return of(null);
      }
      return o().pipe(catchError(() => {
        faltou.push(...areas);
        return of(null);
      }));
    };
    const carga = forkJoin({
      mov: fonte('estoque:movimentacao:read', ['movimentacoes', 'consumo'], () => this.relatorios.movimentacoes(f.de, f.ate)),
      estoque: fonte('estoque:saldo:read', ['estoque'], () => this.relatorios.estoque()),
      solicitacoes: fonte('estoque:solicitacao:read', ['comerciais', 'tecnicas'], () => this.relatorios.solicitacoes(f.de, f.ate)),
      fechamento: fonte('obras:fechamento:read', ['fechamento'], () => this.relatorios.fechamento(f.de, f.ate))
    });
    return new Observable<FontesGeral>((o) => carga.subscribe({
      next: (v) => {
        this.semAcesso.set([...new Set(faltou)]);
        o.next(v);
      },
      error: (e) => o.error(e),
      complete: () => o.complete()
    }));
  }
  protected parametrosProprios() {
    return {};
  }
  protected lerProprios(): void {}
  protected aplicarProprios(): void {}
  protected limparProprios(): void {}
  protected removerProprio(): void {}

  /** Leituras e números levam ao relatório da área, com o recorte e a análise abertos. */
  protected ir(area: Area, drill?: string): void {
    void this.router.navigate([AREAS[area].rota], { queryParams: { ...this.recorte.queryParams(), ...(drill ? { drill } : {}) } });
  }
  protected abrirLeitura(alvo: { dimension: string; value: string }): void {
    if (alvo.dimension !== 'ir') return;
    const [area, drill] = alvo.value.split('|') as [Area, string];
    this.ir(area, drill);
  }
  protected abrirFila(i: number): void {
    const l = this.filas()?.linhas[i];
    if (l) this.ir(l.area, 'kpi:abertas');
  }
  protected abrirFluxo(i: number): void {
    const k = this.modelo()?.fluxo?.chaves[i];
    if (k) this.ir('movimentacoes', `periodo:${k}`);
  }
  protected abrirPendencia(p: Pendencia): void {
    if (p.queryParams) void this.router.navigate(p.rota, { queryParams: { ...this.recorte.queryParams(), ...p.queryParams } });
    else void this.router.navigate(p.rota);
  }
  protected acessivel(a: Area): boolean {
    return !this.semAcesso().includes(a);
  }

  protected readonly contextoCopiloto = computed<CopilotoDashboardContext | null>(() => {
    const m = this.modelo();
    const f = this.recorte.aplicado();
    return {
      id: 'almoxarifado.relatorios.geral',
      nome: 'Visão geral do almoxarifado',
      modulo: 'Almoxarifado',
      descricao: 'Resumo de todas as áreas do almoxarifado: solicitações comerciais e técnicas, encerramento de obras, movimentações, estoque e consumo.',
      rota: '/almoxarifado/relatorios',
      periodo: periodoPainel(f.de, f.ate),
      filtros: [],
      metricas: m ? [
        ...(m.comercial ? [metricaPainel('comercialAbertas', 'Pedidos comerciais em aberto', m.comercial.abertas.length, 'inteiro')] : []),
        ...(m.tecnico ? [metricaPainel('tecnicoAbertas', 'Solicitações técnicas em aberto', m.tecnico.abertas.length, 'inteiro')] : []),
        ...(m.fechamento ? [metricaPainel('fechamentoAtrasados', 'Encerramentos com prazo vencido', m.fechamento.atrasadas.length, 'inteiro')] : []),
        ...(m.estoque ? [metricaPainel('faltas', 'Materiais em falta', m.estoque.porFaixa.ruptura.length, 'inteiro')] : []),
        ...(m.mov ? [metricaPainel('perdas', 'Baixas por perda', m.mov.perdas.length, 'inteiro')] : []),
        metricaPainel('pendencias', 'Itens que pedem ação', m.pendencias.length, 'inteiro')
      ] : [],
      graficos: [],
      datasets: ['solicitacoes_material', 'movimentacoes', 'saldos'],
      sugestoes: [
        { rotulo: 'Prioridades do dia', icone: 'pi pi-list-check', requer: ['dados', 'analise'], pergunta: 'Quais são as 5 prioridades do almoxarifado hoje, em ordem, e quem cobrar em cada uma?' }
      ]
    };
  });
}
