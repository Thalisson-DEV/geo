import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoChartComponent,
  GeoChartPointSelection,
  GeoChartSeries,
  GeoDatepickerComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTone
} from '@geo/ui';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { getErrorMessage } from '../../../core/models/shared.models';
import { BarraGantt, EquipePainelProgramacao, PainelProgramacao } from '../../../core/models/obras-programacao.models';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasProgramacaoService } from '../../../core/services/obras-programacao.service';
import { RhService } from '../../../core/services/rh.service';
import { DashboardMetricCardComponent, InsightTone } from '../../../shared/components/dashboard/dashboard-ui.components';
import { DashboardVisaoGerencialComponent, LeituraGerencial, VereditoGerencial } from '../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { dataIso } from '../../../shared/listagem/listagem';
import { formatarMoeda, parseDataBrParaDate } from '../obras-ui';
import { ProgramacaoDetalheComponent } from './programacao-detalhe.component';
import { SITUACAO_PROGRAMACAO, TIPO_EVENTO, formatarNumero } from './programacao.logic';
import { ProgramarDrawerComponent } from './programar-drawer.component';
import { LeituraPainel, PeriodoPainel, gerarLeituras, periodoRapido } from './programacao-painel.logic';

const PERIODOS: { valor: PeriodoPainel; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes-anterior', rotulo: 'Mês passado' },
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: 'proximos-30', rotulo: 'Próximos 30 dias' },
  { valor: 'ultimos-90', rotulo: 'Últimos 90 dias' }
];

function dataDaUrl(valor: string | null): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? '');
  return partes ? new Date(+partes[1], +partes[2] - 1, +partes[3]) : null;
}

const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Painel da programação para o gestor: se o que foi programado virou execução, o que mudou e por quê, quem está
 * ocupado ou livre nos próximos dias e o que falta programar. Cada número leva à agenda, ao histórico ou ao detalhe.
 */
const TOM_LEITURA: Record<InsightTone, GeoTone> = { critical: 'danger', warning: 'warning', positive: 'success', neutral: 'info' };
const ROTULO_VEREDITO: Record<GeoTone, string> = {
  danger: 'Agir agora', warning: 'Acompanhar', success: 'Em dia', info: 'Contexto', brand: 'Contexto', neutral: 'Contexto'
};

@Component({
  selector: 'app-programacao-painel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoChartComponent,
    GeoDatepickerComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    DashboardVisaoGerencialComponent,
    DashboardMetricCardComponent,
    ProgramacaoDetalheComponent,
    ProgramarDrawerComponent
  ],
  templateUrl: './programacao-painel.component.html',
  styleUrl: './programacao-painel.component.css'
})
export class ProgramacaoPainelComponent {
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ObrasProgramacaoService);
  private readonly rh = inject(RhService);
  protected readonly podeEditar = (inject(AuthService).currentUser()?.permissoes ?? []).includes('obras:programacao:write');

  protected readonly periodos = PERIODOS;
  protected readonly moeda = formatarMoeda;
  protected readonly numero = formatarNumero;
  protected readonly situacoes = SITUACAO_PROGRAMACAO;
  protected readonly tipoEvento = TIPO_EVENTO;

  private readonly params = this.rota.snapshot.queryParamMap;
  protected readonly periodoAtivo = signal<PeriodoPainel | null>((this.params.get('periodo') as PeriodoPainel) || (this.params.get('inicio') ? null : 'mes'));
  protected readonly inicio = signal<Date>(dataDaUrl(this.params.get('inicio')) ?? periodoRapido('mes').inicio);
  protected readonly fim = signal<Date>(dataDaUrl(this.params.get('fim')) ?? periodoRapido('mes').fim);
  protected readonly idBase = signal<string | null>(this.params.get('base'));
  protected readonly idTipoEquipe = signal<string | null>(this.params.get('tipo'));
  protected readonly bases = signal<GeoSelectOption<string>[]>([]);
  protected readonly tipos = signal<GeoSelectOption<string>[]>([]);
  private readonly recarga = signal(0);

  protected readonly estado = signal<{ carregando: boolean; erro: string | null; painel: PainelProgramacao | null }>({ carregando: true, erro: null, painel: null });
  protected readonly d = computed(() => this.estado().painel);

  protected readonly detalheAberto = signal(false);
  protected readonly idDetalhe = signal<string | null>(null);
  protected readonly programarAberto = signal(false);
  protected readonly equipeSugerida = signal<string | null>(null);
  protected readonly obraSugerida = signal<string | null>(null);
  protected readonly dataSugerida = signal<Date | null>(null);
  protected readonly ordemEquipes = signal<'ocupacao' | 'valor' | 'atrasadas'>('ocupacao');

  private readonly consulta = computed(() => ({
    inicio: dataIso(this.inicio())!,
    fim: dataIso(this.fim())!,
    idBase: this.idBase(),
    idTipoEquipe: this.idTipoEquipe(),
    recarga: this.recarga()
  }));

  protected readonly leituras = computed<LeituraPainel[]>(() => {
    const d = this.d();
    return d ? gerarLeituras(d) : [];
  });

  /** Veredito do período no formato da visão gerencial dos dashboards (mesma peça do dashboard operacional). */
  protected readonly veredito = computed<VereditoGerencial>(() => {
    const d = this.d();
    const primeira = this.leituras()[0];
    const tom = primeira ? TOM_LEITURA[primeira.tone] : 'success';
    return {
      tom,
      rotulo: ROTULO_VEREDITO[tom],
      titulo: primeira ? 'O que pede atenção na programação' : 'Programação sem pontos de atenção',
      texto: d ? `De ${d.inicio} a ${d.fim}: ${d.totais.programacoes} programações ativas em ${d.totais.equipes} equipes.` : ''
    };
  });

  protected readonly leiturasGerenciais = computed<LeituraGerencial[]>(() =>
    this.leituras().map((l, i) => ({
      id: `${l.destino}-${i}`,
      tom: TOM_LEITURA[l.tone],
      icone: 'pi ' + l.icon,
      titulo: l.title,
      texto: l.description,
      acao: { rotulo: l.action, alvo: { dimension: 'painel', value: l.destino } }
    }))
  );

  protected readonly serieTempo = computed(() => {
    const d = this.d();
    if (!d) return { rotulos: [] as string[], series: [] as GeoChartSeries[] };
    const semanal = d.agrupamentoSerie === 'SEMANA';
    return {
      rotulos: d.serie.map((p) => (semanal ? 'Sem. ' : '') + p.data.slice(0, 5)),
      series: [
        { name: 'Programado', values: d.serie.map((p) => p.valorProgramado) },
        { name: 'Realizado', values: d.serie.map((p) => p.valorRealizado) }
      ]
    };
  });

  protected readonly serieSituacao = computed(() => {
    const t = this.d()?.totais;
    if (!t) return { rotulos: [] as string[], series: [] as GeoChartSeries[] };
    const pares: [string, number][] = [
      [SITUACAO_PROGRAMACAO.PROGRAMADA.rotulo, t.programadas],
      [SITUACAO_PROGRAMACAO.EM_ANDAMENTO.rotulo, t.emAndamento],
      [SITUACAO_PROGRAMACAO.ATRASADA.rotulo, t.atrasadas],
      [SITUACAO_PROGRAMACAO.CONCLUIDA.rotulo, t.concluidas],
      [SITUACAO_PROGRAMACAO.CANCELADA.rotulo, t.canceladas]
    ];
    return { rotulos: pares.map(([r]) => r), series: [{ name: 'Programações', values: pares.map(([, v]) => v) }] };
  });

  protected readonly serieBases = computed(() => {
    const bases = this.d()?.bases ?? [];
    return {
      rotulos: bases.map((b) => b.base),
      series: [
        { name: 'Programado', values: bases.map((b) => b.valorProgramado) },
        { name: 'Realizado', values: bases.map((b) => b.valorRealizado) }
      ]
    };
  });

  protected readonly equipesOrdenadas = computed<EquipePainelProgramacao[]>(() => {
    const equipes = [...(this.d()?.equipes ?? [])];
    switch (this.ordemEquipes()) {
      case 'valor': return equipes.sort((a, b) => b.valorProgramado - a.valorProgramado);
      case 'atrasadas': return equipes.sort((a, b) => b.atrasadas - a.atrasadas || b.reprogramacoes - a.reprogramacoes);
      default: return equipes.sort((a, b) => (b.ocupacao ?? -1) - (a.ocupacao ?? -1) || a.codigo.localeCompare(b.codigo, 'pt-BR'));
    }
  });

  protected readonly alturaBases = computed(() => Math.max(180, (this.d()?.bases.length ?? 0) * 56));
  protected readonly maiorMotivo = computed(() => Math.max(1, ...(this.d()?.motivos ?? []).map((m) => m.quantidade)));
  protected readonly maiorDia = computed(() => Math.max(1, ...(this.d()?.proximosDias ?? []).map((x) => x.equipesOcupadas + x.equipesLivres)));

  constructor() {
    toObservable(this.consulta)
      .pipe(
        switchMap(({ recarga: _recarga, ...filtro }) => this.api.painel(filtro).pipe(
          map((painel) => ({ carregando: false, erro: null as string | null, painel })),
          catchError((e) => of({ carregando: false, erro: getErrorMessage(e), painel: null })),
          startWith({ carregando: true, erro: null as string | null, painel: this.estado().painel })
        )),
        takeUntilDestroyed()
      )
      .subscribe((estado) => this.estado.set(estado));

    this.rh.listarBasesOperacionaisAtivas().pipe(takeUntilDestroyed(), catchError(() => of({ content: [] }))).subscribe((r) =>
      this.bases.set((r?.content ?? []).map((b: { id: string; nome: string }) => ({ value: b.id, label: b.nome })))
    );
    this.rh.listarTiposEquipeAtivos().pipe(takeUntilDestroyed(), catchError(() => of({ content: [] }))).subscribe((r) =>
      this.tipos.set((r?.content ?? []).map((t: { id: string; nome: string }) => ({ value: t.id, label: t.nome })))
    );
  }

  private gravarNaUrl(): void {
    const periodo = this.periodoAtivo();
    void this.router.navigate([], {
      relativeTo: this.rota,
      replaceUrl: true,
      queryParams: {
        periodo: periodo ?? null,
        inicio: periodo ? null : dataIso(this.inicio()),
        fim: periodo ? null : dataIso(this.fim()),
        base: this.idBase(),
        tipo: this.idTipoEquipe()
      }
    });
  }

  protected usarPeriodo(periodo: PeriodoPainel): void {
    const { inicio, fim } = periodoRapido(periodo);
    this.periodoAtivo.set(periodo);
    this.inicio.set(inicio);
    this.fim.set(fim);
    this.gravarNaUrl();
  }

  protected definirData(ponta: 'inicio' | 'fim', data: Date | null): void {
    if (!data) return;
    this.periodoAtivo.set(null);
    if (ponta === 'inicio') {
      this.inicio.set(data);
      if (this.fim() < data) this.fim.set(data);
    } else {
      this.fim.set(data);
      if (this.inicio() > data) this.inicio.set(data);
    }
    this.gravarNaUrl();
  }

  protected definirBase(id: string | null): void {
    this.idBase.set(id);
    this.gravarNaUrl();
  }

  protected definirTipo(id: string | null): void {
    this.idTipoEquipe.set(id);
    this.gravarNaUrl();
  }

  protected atualizar(): void {
    this.recarga.update((n) => n + 1);
  }

  protected abrir(id: string): void {
    this.idDetalhe.set(id);
    this.detalheAberto.set(true);
  }

  protected novaProgramacao(sugestao: { idEquipe?: string | null; idObra?: string | null; data?: string | null } = {}): void {
    this.equipeSugerida.set(sugestao.idEquipe ?? null);
    this.obraSugerida.set(sugestao.idObra ?? null);
    this.dataSugerida.set(parseDataBrParaDate(sugestao.data ?? null));
    this.programarAberto.set(true);
  }

  /** Abre a agenda da semana já no recorte: a equipe, a base e o dia de onde veio o clique. */
  protected irParaAgenda(extra: { equipe?: string; data?: string } = {}): void {
    const data = extra.data ? parseDataBrParaDate(extra.data) : this.inicio();
    void this.router.navigate(['/obras/programacao/semana'], {
      queryParams: { data: dataIso(data), base: this.idBase() ?? undefined, tipo: this.idTipoEquipe() ?? undefined, equipe: extra.equipe }
    });
  }

  protected irParaHistorico(tipo?: string): void {
    void this.router.navigate(['/obras/programacao/historico'], {
      queryParams: { tipo, periodo: `${dataIso(this.inicio())}~${dataIso(this.fim())}` }
    });
  }

  protected selecionarDiaDaSerie(evento: GeoChartPointSelection): void {
    const ponto = this.d()?.serie[evento.index];
    if (ponto) this.irParaAgenda({ data: ponto.data });
  }

  protected selecionarBase(evento: GeoChartPointSelection): void {
    const nome = this.d()?.bases[evento.index]?.base;
    const base = this.bases().find((b) => b.label === nome);
    if (base) this.definirBase(base.value);
  }

  protected rolarPara(id: string): void {
    const alvo = document.getElementById(id);
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    alvo?.focus({ preventScroll: true });
  }

  protected diaSemana(data: string): string {
    const d = parseDataBrParaDate(data);
    return d ? SEMANA_CURTA[d.getDay()] : '';
  }

  protected ehHoje(data: string): boolean {
    const d = parseDataBrParaDate(data);
    const hoje = new Date();
    return !!d && d.toDateString() === hoje.toDateString();
  }

  protected diasDeAtraso(barra: BarraGantt): number {
    const fim = parseDataBrParaDate(barra.fim);
    if (!fim) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((hoje.getTime() - fim.getTime()) / 86_400_000));
  }

  protected tomOcupacao(ocupacao: number | null | undefined): string {
    if (ocupacao == null) return 'neutral';
    if (ocupacao > 100) return 'danger';
    if (ocupacao >= 70) return 'success';
    if (ocupacao >= 40) return 'info';
    return 'warning';
  }

  protected percentual(valor: number | null | undefined): string {
    return valor == null ? '—' : `${formatarNumero(valor)}%`;
  }

  protected aoProgramar(): void {
    this.atualizar();
  }
}
