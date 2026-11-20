import { iconeCondicao } from '../../../../shared/utils/movimentacao.utils';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, ViewChild, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Observable, Subject, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { GeoAsyncStateComponent, GeoContentState, GeoIconButtonComponent, GeoStatusComponent, GeoTone } from '@geo/ui';
import {
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoLazyLoadEvent,
  GeoRowActionsDirective,
  GeoRowDetailDirective,
  GeoSortRule
} from '@geo/ui/data';

import { NavigationHistoryService } from '../../../../core/navigation/navigation-history.service';
import { createUrlFilters, qp } from '../../../../core/navigation';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { RhService } from '../../../../core/services/rh.service';
import { EstoqueResponse, PageResponseSaldoResponse, SaldoResponse, SeriesAConferirResponse } from '../../../../core/models/almoxarifado.models';
import { EquipeResponse } from '../../../../core/models/rh.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { MovimentacoesMaterialDialogComponent } from '../../../../shared/components/movimentacoes-material-dialog/movimentacoes-material-dialog.component';
import { imprimirSempreNoTemaClaro } from '../../../execucao/relatorios/relatorio-impressao';
import { SaldoSeriaisPainelComponent } from '../../../../shared/components/saldo-seriais-painel/saldo-seriais-painel.component';
import { SeriesAConferirComponent } from './series-a-conferir.component';
import { processoMaterial } from '../../shared/processo-material';

/** Recorte rápido da tabela: todos os saldos, só os negativos ou só os em sucata. */
export type RecorteSaldo = 'todos' | 'negativos' | 'sucata';

/** Números do estoque inteiro (independem da busca e do recorte da tabela). */
export interface ResumoSaldo {
  itens: number | null;
  negativos: number | null;
  sucata: number | null;
  series: number | null;
}

/** Processo do cadastro que tem saldo neste estoque, para o recorte por processo. */
export interface ProcessoComSaldo {
  id: string;
  rotulo: string;
  icone: string;
  total: number;
}

interface PontoDeAtencao {
  tom: GeoTone;
  icone: string;
  titulo: string;
  texto: string;
}

const TAMANHO_PADRAO = 100;
const ORDENACAO_PADRAO = 'material.descricao,asc';

/**
 * Relatório de saldo de um estoque, no padrão dos relatórios de nota e de turno: cabeçalho
 * institucional, dados gerais, cards de resumo, pontos de atenção e a tabela de materiais.
 * Materiais seriados expandem na própria linha com os números de série.
 */
@Component({
  selector: 'app-relatorio-saldo',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    GeoAsyncStateComponent,
    GeoStatusComponent,
    GeoIconButtonComponent,
    GeoDataTableComponent,
    GeoCellDirective,
    GeoRowDetailDirective,
    GeoRowActionsDirective,
    MovimentacoesMaterialDialogComponent,
    SaldoSeriaisPainelComponent,
    SeriesAConferirComponent
  ],
  templateUrl: './relatorio-saldo.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './relatorio-saldo.component.css'
})
export class RelatorioSaldoComponent implements OnInit {
  @ViewChild('movimentacoesDialog') movimentacoesDialog!: MovimentacoesMaterialDialogComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly almoxarifadoService = inject(AlmoxarifadoService);
  private readonly rhService = inject(RhService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly estoque = signal<EstoqueResponse | null>(null);
  protected readonly equipe = signal<EquipeResponse | null>(null);
  protected readonly resumo = signal<ResumoSaldo | null>(null);
  /** Séries aplicadas fora do caminhão da equipe; nulo enquanto carrega ou em estoque sem equipe. */
  protected readonly seriesAConferir = signal<SeriesAConferirResponse | null>(null);
  protected readonly totalSeriesAConferir = computed(() =>
    (this.seriesAConferir()?.materiais ?? []).reduce((total, m) => total + m.aplicadas.length, 0));
  protected readonly emitidoEm = new Date();

  protected readonly saldos = signal<SaldoResponse[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly tableState = signal<GeoContentState>('loading');
  protected readonly tableError = signal<string | undefined>(undefined);

  protected readonly recorte = signal<RecorteSaldo>('todos');
  /** Processo do material (Comercial, Obras...); nulo mostra todos. */
  protected readonly processo = signal<string | null>(null);
  protected readonly processos = signal<ProcessoComSaldo[]>([]);
  protected readonly processoVisual = processoMaterial;
  protected readonly busca = signal('');
  protected readonly pagina = signal(0);
  protected readonly tamanho = signal(TAMANHO_PADRAO);
  protected readonly ordenacao = signal<GeoSortRule[]>([]);
  protected readonly pageSizeOptions = [25, 50, 100, 500];

  protected idEstoque = '';
  private idEquipe = '';

  /** Busca, recorte, página, tamanho e ordenação na URL (replace), para voltar ao mesmo ponto. */
  private readonly estadoUrl = createUrlFilters<{
    buscaGlobal: string;
    recorte: string;
    processo: string;
    negativos: boolean;
    pagina: number;
    tamanho: number;
    ordenacao: string;
  }>({
    buscaGlobal: qp.text('buscaGlobal'),
    recorte: qp.text('recorte'),
    processo: qp.text('processo'),
    negativos: qp.boolean('negativos'),
    pagina: qp.number('pag'),
    tamanho: qp.number('tam'),
    ordenacao: qp.text('ord')
  });

  private readonly cargas = new Subject<GeoLazyLoadEvent>();
  private ultimaCarga: GeoLazyLoadEvent | null = null;

  protected readonly colunas: GeoDataTableColumn<SaldoResponse>[] = [
    { key: 'codigo', header: 'Código', priority: 1, width: '7rem', value: (s) => s.material.codigo, sortField: 'material.codigo' },
    { key: 'descricao', header: 'Descrição', priority: 1, value: (s) => s.material.descricao, sortField: 'material.descricao' },
    { key: 'processo', header: 'Processo', type: 'custom', priority: 2, value: (s) => s.material.processo?.nome, sortable: false },
    { key: 'unidade', header: 'Un.', priority: 2, width: '4rem', value: (s) => s.material.unidadeMedida, sortable: false },
    { key: 'avaliacao', header: 'Avaliação', priority: 2, value: (s) => s.material.avaliacaoTecnica?.nome, sortable: false },
    { key: 'suprMatr', header: 'SUPR/MATR', priority: 2, value: (s) => s.material.suprMatrFlag, sortable: false },
    { key: 'centro', header: 'Centro', priority: 2, value: (s) => s.material.centroInvestimento?.codigo, sortable: false },
    { key: 'condicao', header: 'Condição', type: 'custom', priority: 2, value: (s) => s.condicao, sortable: false },
    { key: 'quantidade', header: 'Quantidade', type: 'custom', priority: 1, width: '8rem', value: (s) => s.quantidade, sortField: 'quantidade' }
  ];

  protected readonly chaveSaldo = (saldo: SaldoResponse) => saldo.id;
  protected readonly rotuloSaldo = (saldo: SaldoResponse) => `${saldo.material.codigo} ${saldo.material.descricao}`;
  protected readonly ehSeriado = (saldo: SaldoResponse) => !!saldo.material.detalhaSerie;

  protected readonly situacao = computed<{ tom: GeoTone; rotulo: string; icone: string } | null>(() => {
    const r = this.resumo();
    if (!r || r.negativos === null) return null;
    if (r.negativos > 0) return { tom: 'danger', rotulo: 'Com saldo negativo', icone: 'pi-exclamation-circle' };
    if ((r.sucata ?? 0) > 0) return { tom: 'warning', rotulo: 'Com sucata', icone: 'pi-trash' };
    return { tom: 'success', rotulo: 'Regular', icone: 'pi-check-circle' };
  });

  protected readonly pontosDeAtencao = computed<PontoDeAtencao[]>(() => {
    const r = this.resumo();
    const e = this.estoque();
    if (!r) return [];
    const pontos: PontoDeAtencao[] = [];
    if (e && !e.ativo) {
      pontos.push({
        tom: 'info',
        icone: 'pi pi-power-off',
        titulo: 'Estoque inativo',
        texto: 'O saldo é histórico: o estoque não recebe novas movimentações.'
      });
    }
    if (r.negativos) {
      pontos.push({
        tom: 'danger',
        icone: 'pi pi-exclamation-triangle',
        titulo: `${r.negativos} ${r.negativos === 1 ? 'saldo negativo' : 'saldos negativos'}`,
        texto: 'Material aplicado além do saldo. Analise as movimentações e regularize o estoque.'
      });
    }
    const aConferir = this.totalSeriesAConferir();
    if (aConferir) {
      pontos.push({
        tom: 'warning',
        icone: 'pi pi-barcode',
        titulo: `${aConferir} ${aConferir === 1 ? 'série a conferir' : 'séries a conferir'}`,
        texto: 'A equipe aplicou séries que não estavam no caminhão. Confira abaixo qual série do caminhão foi usada.'
      });
    }
    if (r.sucata) {
      pontos.push({
        tom: 'warning',
        icone: 'pi pi-trash',
        titulo: `${r.sucata} ${r.sucata === 1 ? 'item em sucata' : 'itens em sucata'}`,
        texto: 'Material retirado de campo aguardando devolução ou descarte.'
      });
    }
    if (!pontos.length && r.negativos !== null) {
      pontos.push({
        tom: 'success',
        icone: 'pi pi-check-circle',
        titulo: 'Estoque sem pendências',
        texto: 'Nenhum saldo negativo nem material em sucata neste estoque.'
      });
    }
    return pontos;
  });

  protected readonly processoEscolhido = computed(() => this.processos().find((p) => p.id === this.processo()) ?? null);
  protected readonly filtrado = computed(() => this.recorte() !== 'todos' || !!this.processo());

  protected readonly descricaoRecorte = computed(() => {
    const filtros = [
      this.recorte() === 'negativos' ? 'somente negativos' : this.recorte() === 'sucata' ? 'somente sucata' : '',
      this.processoEscolhido() ? `processo ${this.processoEscolhido()!.rotulo}` : '',
      this.busca().trim() ? `busca "${this.busca().trim()}"` : ''
    ].filter(Boolean);
    return filtros.length ? filtros.join(' · ') : 'Todos os itens';
  });

  constructor() {
    imprimirSempreNoTemaClaro();
    this.cargas
      .pipe(
        switchMap((evento) =>
          this.almoxarifadoService.listarSaldos(this.parametros(evento)).pipe(
            map((res): PageResponseSaldoResponse | { erro: string } => res),
            catchError((err) => of({ erro: getErrorMessage(err) || 'Não foi possível carregar os itens do saldo.' }))
          )
        ),
        takeUntilDestroyed()
      )
      .subscribe((res) => {
        if ('erro' in res) {
          this.tableError.set(res.erro);
          this.tableState.set('error');
          return;
        }
        this.saldos.set(res.content);
        this.totalRecords.set(res.page.totalElements);
        this.tableError.set(undefined);
        this.tableState.set('ready');
      });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      // Mudança só no estado da tabela (escrito por esta tela com replace): nada a recarregar.
      if (this.idEstoque && params['idEstoque'] === this.idEstoque && params['idEquipe'] === this.idEquipe) return;
      this.idEstoque = params['idEstoque'];
      this.idEquipe = params['idEquipe'];
      this.restaurarEstado();

      if (this.idEstoque) {
        this.loadData();
      } else {
        this.error.set('Parâmetros de estoque não informados para o relatório.');
        this.loading.set(false);
      }
    });
  }

  private restaurarEstado(): void {
    const estado = this.estadoUrl.read();
    this.busca.set(estado.buscaGlobal ?? '');
    const recorte = estado.recorte === 'negativos' || estado.recorte === 'sucata' ? estado.recorte : estado.negativos ? 'negativos' : 'todos';
    this.recorte.set(recorte);
    this.processo.set(estado.processo || null);
    this.tamanho.set(estado.tamanho && estado.tamanho > 0 ? estado.tamanho : TAMANHO_PADRAO);
    this.pagina.set(Math.max((estado.pagina ?? 1) - 1, 0));
    const [campo, direcao] = (estado.ordenacao ?? '').split(',');
    const coluna = this.colunas.find((c) => c.sortField === campo);
    this.ordenacao.set(coluna ? [{ key: coluna.key, direction: direcao === 'desc' ? 'desc' : 'asc' }] : []);
  }

  protected loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.almoxarifadoService.buscarEstoquePorId(this.idEstoque).subscribe({
      next: (res) => {
        this.estoque.set(res);
        const idEquipe = res.idEquipe || this.idEquipe;
        if (idEquipe) this.loadEquipe(idEquipe);
        this.loading.set(false);
        this.loadResumo();
        this.loadSeriesAConferir(res);
        // A tabela pede a primeira página (lazyLoad) assim que é exibida.
      },
      error: (err) => {
        this.error.set(getErrorMessage(err) || 'Não foi possível carregar as informações do estoque.');
        this.loading.set(false);
      }
    });
  }

  private loadEquipe(id: string): void {
    this.rhService.buscarEquipePorId(id).subscribe({ next: (res) => this.equipe.set(res) });
  }

  /** Contagens do estoque inteiro; cada uma falha sozinha sem derrubar o relatório. */
  private loadResumo(): void {
    const contar = (fonte: Observable<{ page: { totalElements: number } }>) =>
      fonte.pipe(
        map((res) => res.page.totalElements),
        catchError(() => of(null))
      );
    const base = { idEstoque: this.idEstoque, page: 0, size: 1 };
    forkJoin({
      itens: contar(this.almoxarifadoService.listarSaldos(base)),
      negativos: contar(this.almoxarifadoService.listarSaldos({ ...base, negativo: true })),
      sucata: contar(this.almoxarifadoService.listarSaldos({ ...base, condicao: 'SUCATA' })),
      series: contar(this.almoxarifadoService.listarSaldosSeriais({ ...base, ativo: true }))
    }).subscribe((resumo) => this.resumo.set(resumo));
    this.loadProcessos(base);
  }

  /** Só aparecem no recorte os processos que têm material neste estoque. */
  private loadProcessos(base: Record<string, unknown>): void {
    this.rhService
      .listarProcessosAtivos()
      .pipe(
        switchMap((res) => {
          const processos = res.content ?? [];
          if (!processos.length) return of([] as ProcessoComSaldo[]);
          return forkJoin(
            processos.map((p) =>
              this.almoxarifadoService.listarSaldos({ ...base, idProcesso: p.id }).pipe(
                map((r): ProcessoComSaldo | null => {
                  const visual = processoMaterial(p.nome);
                  return visual && r.page.totalElements > 0 ? { id: p.id, ...visual, total: r.page.totalElements } : null;
                }),
                catchError(() => of(null))
              )
            )
          ).pipe(map((lista) => lista.filter((p): p is ProcessoComSaldo => !!p).sort((a, b) => b.total - a.total)));
        }),
        catchError(() => of([] as ProcessoComSaldo[]))
      )
      .subscribe((lista) => this.processos.set(lista));
  }

  /** Só estoque de equipe tem aplicação em campo; falha aqui não derruba o relatório. */
  private loadSeriesAConferir(estoque: EstoqueResponse): void {
    this.seriesAConferir.set(null);
    if (!estoque.idEquipe) return;
    this.almoxarifadoService
      .listarSeriesAConferir(estoque.id)
      .pipe(catchError(() => of(null)))
      .subscribe((res) => this.seriesAConferir.set(res));
  }

  /** Uma série saiu do caminhão: atualiza a lista, os números do resumo e a tabela. */
  protected onSeriesConferidas(res: SeriesAConferirResponse): void {
    this.seriesAConferir.set(res);
    this.loadResumo();
    this.recarregarTabela();
  }

  protected onLazyLoad(evento: GeoLazyLoadEvent): void {
    this.ultimaCarga = evento;
    this.busca.set(evento.query);
    if (!this.saldos().length) this.tableState.set('loading');
    this.salvarEstadoNaUrl(evento);
    this.cargas.next(evento);
  }

  protected aplicarRecorte(recorte: RecorteSaldo): void {
    const proximo = this.recorte() === recorte ? 'todos' : recorte;
    this.recorte.set(proximo);
    this.pagina.set(0);
    const base = this.ultimaCarga ?? { page: 0, size: this.tamanho(), sort: [], query: this.busca(), filters: [] };
    this.onLazyLoad({ ...base, page: 0 });
  }

  protected aplicarProcesso(id: string | null): void {
    this.processo.set(this.processo() === id ? null : id);
    this.pagina.set(0);
    const base = this.ultimaCarga ?? { page: 0, size: this.tamanho(), sort: [], query: this.busca(), filters: [] };
    this.onLazyLoad({ ...base, page: 0 });
  }

  /** "Limpar filtros" no vazio por recorte: volta a todos os itens, sem busca. */
  protected limparRecorte(): void {
    this.recorte.set('todos');
    this.processo.set(null);
    this.busca.set('');
    this.pagina.set(0);
    const base = this.ultimaCarga ?? { page: 0, size: this.tamanho(), sort: [], query: '', filters: [] };
    this.onLazyLoad({ ...base, page: 0, query: '' });
  }

  protected recarregarTabela(): void {
    if (this.ultimaCarga) this.onLazyLoad(this.ultimaCarga);
  }

  private parametros(evento: GeoLazyLoadEvent): Record<string, unknown> {
    const regra = evento.sort[0];
    return {
      idEstoque: this.idEstoque,
      page: evento.page,
      size: evento.size,
      sort: regra ? `${regra.key},${regra.direction}` : ORDENACAO_PADRAO,
      buscaGlobal: evento.query.trim() || undefined,
      negativo: this.recorte() === 'negativos' ? true : undefined,
      condicao: this.recorte() === 'sucata' ? 'SUCATA' : undefined,
      idProcesso: this.processo() ?? undefined
    };
  }

  private salvarEstadoNaUrl(evento: GeoLazyLoadEvent): void {
    const regra = evento.sort[0];
    this.estadoUrl.write({
      buscaGlobal: evento.query.trim(),
      recorte: this.recorte() !== 'todos' ? this.recorte() : undefined,
      processo: this.processo() ?? undefined,
      negativos: undefined,
      pagina: evento.page > 0 ? evento.page + 1 : undefined,
      tamanho: evento.size !== TAMANHO_PADRAO ? evento.size : undefined,
      ordenacao: regra ? `${regra.key},${regra.direction}` : undefined
    });
  }

  protected readonly iconeCondicao = iconeCondicao;

  protected tomCondicao(condicao: string | undefined): GeoTone {
    return condicao === 'SUCATA' ? 'warning' : 'neutral';
  }

  protected rotuloCondicao(condicao: string | undefined): string {
    if (!condicao) return '—';
    return condicao.charAt(0) + condicao.slice(1).toLowerCase();
  }

  protected nomeColaborador(colaborador: unknown): string {
    const c = colaborador as
      | { colaborador?: { nomeCompleto?: string }; nomeCompleto?: string; nomeColaborador?: string; primeiroNome?: string; ultimoNome?: string }
      | null
      | undefined;
    if (!c) return '—';
    return (
      c.colaborador?.nomeCompleto ||
      c.nomeCompleto ||
      c.nomeColaborador ||
      [c.primeiroNome, c.ultimoNome].filter(Boolean).join(' ') ||
      '—'
    );
  }

  protected abrirMovimentacoes(saldo: SaldoResponse): void {
    if (this.idEstoque && saldo.material.id) {
      this.movimentacoesDialog.show(this.idEstoque, saldo.material.id, saldo.material.descricao);
    }
  }

  protected imprimir(): void {
    window.print();
  }

  protected voltar(): void {
    this.navegacao.back();
  }
}
