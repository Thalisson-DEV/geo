import { CommonModule } from '@angular/common';
import { TrocaOcorrenciaDrawerComponent } from '../troca-ocorrencia-drawer.component';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { GeoAsyncStateComponent, GeoConfirmationService, GeoIconButtonComponent, GeoStatusComponent, GeoTone, NotificationService } from '@geo/ui';
import { GeoCellDirective, GeoDataTableColumn, GeoDataTableComponent, GeoRowDetailDirective } from '@geo/ui/data';

import { ItemSolicitacaoResponse, MotivoPendenciaResponse, OperacaoSolicitacaoComercialResponse } from '../../../../core/models/almoxarifado.models';
import { ObraResponse } from '../../../../core/models/obras.models';
import { EquipeResponse } from '../../../../core/models/rh.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AcaoPermitidaSolicitacao, SolicitacaoMaterialDetalheResponse } from '../../../../core/models/solicitacao-material-tecnica.models';
import { NavigationHistoryService } from '../../../../core/navigation/navigation-history.service';
import { AlmoxarifadoService } from '../../../../core/services/almoxarifado.service';
import { ConnectivityService } from '../../../../core/services/connectivity.service';
import { ObrasService } from '../../../../core/services/obras.service';
import { RhService } from '../../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../../core/services/solicitacao-material-tecnica.service';
import { UsuarioLookupService } from '../../../../core/services/usuario-lookup.service';
import { novaChaveIdempotencia } from '../../../../core/utils/idempotencia.util';
import { SaldoEstoqueDialogComponent } from '../../../../shared/components/saldo-estoque-dialog/saldo-estoque-dialog.component';
import { SerieGradeItem, SeriesGradeComponent } from '../../../../shared/components/series-grade/series-grade.component';
import { GrupoItemSolicitacao, SITUACOES, agruparItensSolicitacao, situacaoDoGrupo } from '../relatorio-solicitacao-material/itens-solicitacao.util';
import { AbaDetalheTecnico, AcaoInicialDetalheTecnico, SolicitacaoTecnicaDetalheDrawerComponent } from '../solicitacao-tecnica-detalhe-drawer.component';
import { SolicitacaoTecnicaHistoricoComponent } from '../solicitacao-tecnica-historico/solicitacao-tecnica-historico.component';
import { SolicitacaoOperacoesHistoricoComponent } from '../solicitacao-operacoes-historico/solicitacao-operacoes-historico.component';
import { SolicitacaoPendenciaModalComponent } from '../solicitacao-pendencia-modal.component';
import { SolicitacaoPendenciasComponent } from '../solicitacao-pendencias.component';
import { SolicitacaoRejeicaoDialogComponent } from '../solicitacao-rejeicao-dialog.component';
import { possuiMovimentacaoAtendimento, tipoTecnicoIcon, tipoTecnicoLabel } from '../solicitacao-tecnica-presentation';
import { situacaoAtual } from '../solicitacao-tecnica-situacao';

type Separacao = 'INICIAR_SEPARACAO' | 'CONCLUIR_SEPARACAO';

interface FaixaSituacao {
  tom: GeoTone;
  icone: string;
  titulo: string;
  texto: string;
}

/**
 * Relatório da solicitação técnica (221/921), no mesmo desenho do relatório comercial, do turno e da
 * nota: cabeçalho institucional, faixa da situação, quadro de dados, resumo, itens, histórico e termo.
 * As ações abrem o mesmo painel lateral da lista; só a separação acontece aqui mesmo.
 */
@Component({
  selector: 'app-solicitacao-tecnica-detalhe',
  standalone: true,
  imports: [
    TrocaOcorrenciaDrawerComponent,
    CommonModule,
    RouterLink,
    ButtonModule,
    AccordionModule,
    GeoAsyncStateComponent,
    GeoDataTableComponent,
    GeoCellDirective,
    GeoRowDetailDirective,
    GeoIconButtonComponent,
    GeoStatusComponent,
    SaldoEstoqueDialogComponent,
    SeriesGradeComponent,
    SolicitacaoTecnicaDetalheDrawerComponent,
    SolicitacaoTecnicaHistoricoComponent,
    SolicitacaoOperacoesHistoricoComponent,
    SolicitacaoPendenciasComponent,
    SolicitacaoPendenciaModalComponent,
    SolicitacaoRejeicaoDialogComponent
  ],
  templateUrl: './solicitacao-tecnica-detalhe.component.html',
  styleUrl: './solicitacao-tecnica-detalhe.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SolicitacaoTecnicaDetalheComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly service = inject(SolicitacaoMaterialTecnicaService);
  private readonly obrasService = inject(ObrasService);
  private readonly almoxarifadoService = inject(AlmoxarifadoService);
  private readonly rhService = inject(RhService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly notifications = inject(NotificationService);
  private readonly confirmations = inject(GeoConfirmationService);
  private readonly userLookup = inject(UsuarioLookupService);

  @ViewChild('saldoDialog') private saldoDialog?: SaldoEstoqueDialogComponent;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly erro = signal<string | null>(null);
  protected readonly detail = signal<SolicitacaoMaterialDetalheResponse | null>(null);
  protected readonly obra = signal<ObraResponse | null>(null);
  protected readonly equipes = signal<EquipeResponse[]>([]);
  protected readonly almoxarifados = signal<{ id: string; nomeIdentificador: string }[]>([]);
  protected readonly responsavelSaqueNome = signal('');
  protected readonly assinaturaAlmoxUrl = signal<string | null>(null);
  protected readonly assinaturaEquipeUrl = signal<string | null>(null);
  protected readonly executando = signal(false);
  protected readonly isOnline = this.connectivity.isOnline;
  private imprimirAoCarregar = false;

  // Painel lateral (o mesmo da lista), rejeição e pendência
  protected readonly painelAberto = signal(false);
  protected readonly painelAba = signal<AbaDetalheTecnico>('itens');
  protected readonly painelAcao = signal<AcaoInicialDetalheTecnico | null>(null);
  protected readonly rejeicaoAberta = signal(false);
  protected readonly trocaOcorrenciaAberta = signal(false);
  protected readonly pendenciaModalVisible = signal(false);
  protected readonly pendenciaModalItemId = signal<string | null>(null);
  protected readonly pendenciaModalItemLabel = signal<string | null>(null);
  protected readonly pendenciaModalMotivoAtual = signal<MotivoPendenciaResponse | null>(null);
  protected readonly pendenciaModalJustificativaAtual = signal<string | null>(null);

  protected readonly timelineValue = signal<string | number | string[] | number[] | null | undefined>(undefined);
  protected readonly isTimelineOpen = computed(() => {
    const val = this.timelineValue();
    return val === 'timeline' || (Array.isArray(val) && (val as unknown[]).includes('timeline'));
  });

  protected readonly technical = computed(() => this.detail()?.tecnico ?? null);

  protected readonly situacao = computed(() => {
    const d = this.detail();
    return situacaoAtual(d?.status, d?.tecnico?.dataPrevista, d?.tecnico?.statusSeparacao ?? d?.statusSeparacao);
  });

  protected readonly rotuloExecucao = computed(() => (this.obra()?.controleExecucao === 'OS' ? 'OS' : 'OC'));
  protected readonly ocorrencia = computed(() => {
    const codigo = this.technical()?.ocorrencia?.codigo?.trim();
    if (!codigo) return null;
    return /^(OS|OC)\b/i.test(codigo) ? codigo : `${this.rotuloExecucao()} ${codigo}`;
  });

  protected readonly almoxarifadoNome = computed(() => {
    const id = this.technical()?.idAlmoxarifadoAtendimento;
    return this.detail()?.estoqueOrigem?.nomeIdentificador ?? this.almoxarifados().find((a) => a.id === id)?.nomeIdentificador ?? 'Não informado';
  });
  protected readonly almoxarifadoId = computed(() => this.detail()?.estoqueOrigem?.id ?? this.technical()?.idAlmoxarifadoAtendimento ?? null);

  protected readonly equipeNome = computed(() => {
    const id = this.technical()?.idEquipe;
    if (!id) return null;
    const e = this.equipes().find((x) => x.id === id);
    return e ? (e.tipoEquipe ? `${e.codigo} · ${e.tipoEquipe.nome}` : e.codigo) : (this.detail()?.estoqueDestino?.nomeIdentificador ?? id.slice(0, 8));
  });

  // Itens: um material por linha, com as séries juntas (como no comercial)
  protected readonly grupos = computed(() => agruparItensSolicitacao(this.detail()?.itens as unknown as ItemSolicitacaoResponse[]));
  protected readonly totais = computed(() => {
    const t = this.technical()?.totais;
    const grupos = this.grupos();
    const solicitada = t?.solicitada ?? grupos.reduce((s, g) => s + g.solicitada, 0);
    const entregaLiquida = t?.entregaLiquida ?? grupos.reduce((s, g) => s + g.entregue, 0);
    return {
      solicitada,
      entregaBruta: t?.entregaBruta ?? entregaLiquida,
      entregaEstornada: t?.entregaEstornada ?? 0,
      entregaLiquida,
      pendente: t?.pendente ?? grupos.reduce((s, g) => s + g.pendente, 0)
    };
  });
  protected readonly materiaisPendentes = computed(() => this.grupos().filter((g) => g.pendente > 0).length);
  protected readonly resumoSeries = computed(() => {
    const grupos = this.grupos();
    return {
      entregues: grupos.reduce((t, g) => t + g.seriesEntregues.length, 0),
      materiais: grupos.filter((g) => g.material.detalhaSerie).length
    };
  });

  protected readonly operacoes = computed(() => (this.technical()?.operacoes ?? []) as unknown as OperacaoSolicitacaoComercialResponse[]);
  protected readonly dataEntrega = computed(() => {
    const d = this.detail();
    if (d?.dataEntrega) return d.dataEntrega;
    return [...(this.technical()?.operacoes ?? [])].reverse().find((o) => o.tipo === 'ENTREGA')?.realizadaEm ?? null;
  });
  protected readonly entreguePor = computed(() => {
    const entrega = [...(this.technical()?.operacoes ?? [])].reverse().find((o) => o.tipo === 'ENTREGA');
    const id = entrega?.idUsuarioOperador ?? this.detail()?.idEntregadorAlmox;
    return id ? this.nome(id) : 'Responsável Almoxarifado';
  });
  protected readonly encerrada = computed(() => !!(this.technical()?.encerrada || this.technical()?.encerradaEm || this.detail()?.encerrada));

  protected readonly faixa = computed<FaixaSituacao>(() => {
    const d = this.detail();
    const t = this.technical();
    const totais = this.totais();
    const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const equipe = this.equipeNome() ?? 'a equipe';
    const pendentes = this.materiaisPendentes();
    const materiais = (n: number) => `${n} ${n === 1 ? 'material' : 'materiais'}`;
    if (!d || !t) return { tom: 'neutral', icone: 'pi pi-file', titulo: 'Solicitação técnica', texto: '' };
    if (this.encerrada()) {
      return { tom: 'neutral', icone: 'pi pi-lock', titulo: 'Saldo encerrado', texto: t.motivoEncerramento || d.motivoEncerramento || 'O que faltava entregar não sai mais por esta solicitação.' };
    }
    switch (d.status) {
      case 'REJEITADO':
        return { tom: 'danger', icone: 'pi pi-times-circle', titulo: 'Solicitação rejeitada', texto: d.motivoRejeicao?.nome ?? 'Nada foi entregue.' };
      case 'CANCELADO':
        return { tom: 'neutral', icone: 'pi pi-times-circle', titulo: 'Solicitação cancelada', texto: 'Nada sai do almoxarifado por esta solicitação.' };
      case 'ESTORNADO':
        return { tom: 'neutral', icone: 'pi pi-replay', titulo: 'Entrega estornada', texto: `O material voltou para ${this.almoxarifadoNome()}.` };
      case 'ENTREGUE': {
        const quando = this.dataEntrega() ? ' · última entrega em ' + new Date(this.dataEntrega()!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
        return { tom: 'success', icone: 'pi pi-check-circle', titulo: 'Solicitação entregue', texto: `${fmt(totais.entregaLiquida)} entregues para ${equipe}${quando}.` };
      }
      case 'ENTREGUE_PARCIAL':
        return { tom: 'warning', icone: 'pi pi-truck', titulo: 'Entrega parcial', texto: `Saíram ${fmt(totais.entregaLiquida)} de ${fmt(totais.solicitada)}; faltam ${fmt(totais.pendente)} em ${materiais(pendentes)}.` };
    }
    switch (this.situacao().label) {
      case 'A planejar':
        return { tom: 'warning', icone: 'pi pi-calendar-plus', titulo: 'A planejar', texto: `Defina a data do saque${t.idEquipe ? '' : ' e, se já souber, a equipe'} para liberar a separação.` };
      case 'Em separação':
        return { tom: 'info', icone: 'pi pi-box', titulo: 'Em separação', texto: `O almoxarifado está separando ${materiais(pendentes)}; ao concluir, fica pronta para a retirada.` };
      case 'A entregar':
        return { tom: 'brand', icone: 'pi pi-truck', titulo: 'Separada, aguardando retirada', texto: `${materiais(pendentes)} prontos para ${equipe} · saque previsto em ${this.dataCurta(t.dataPrevista)}.` };
      default:
        return { tom: 'info', icone: 'pi pi-calendar', titulo: 'Planejada, a separar', texto: `Saque previsto em ${this.dataCurta(t.dataPrevista)} para ${equipe}; falta separar ${materiais(pendentes)}.` };
    }
  });

  protected readonly planejada = computed(() => !!this.technical()?.dataPrevista);
  /** Manual ou gerada pela programação da obra. */
  protected readonly origem = computed(() => {
    const numero = this.technical()?.numeroProgramacao;
    return numero ? `Programação #${numero} da obra` : 'Manual';
  });
  /** GEO: o planejamento só muda enquanto nenhum material saiu (entrega ou devolução). */
  protected readonly podePlanejar = computed(() => this.can('EDITAR_PLANEJAMENTO') && !possuiMovimentacaoAtendimento(this.detail()));
  protected readonly podeReserva = computed(() => this.can('REGISTRAR_RESERVA') || this.can('ALTERAR_RESERVA'));
  protected readonly podePendencia = computed(() => {
    const d = this.detail();
    return !!d && this.isOnline() && !this.encerrada() && !['REJEITADO', 'CANCELADO', 'ENTREGUE', 'ESTORNADO'].includes(d.status);
  });

  protected readonly colunasItens: GeoDataTableColumn<GrupoItemSolicitacao>[] = [
    { key: 'codigo', header: 'Código', priority: 1, width: '7rem', value: (g) => g.material.codigo },
    {
      key: 'descricao',
      header: 'Material / Descrição',
      type: 'custom',
      priority: 1,
      searchable: true,
      value: (g) => g.material.descricao,
      display: (g) => [g.material.descricao, ...g.seriesEntregues].join(' ')
    },
    { key: 'unidade', header: 'Un.', priority: 2, width: '4rem', value: (g) => g.material.unidadeMedida },
    { key: 'solicitada', header: 'Solicitado', type: 'number', priority: 1, width: '7rem', value: (g) => g.solicitada },
    { key: 'entregue', header: 'Entregue', type: 'number', priority: 1, width: '7rem', value: (g) => g.entregue },
    { key: 'pendente', header: 'Pendente', type: 'number', priority: 1, width: '7rem', value: (g) => g.pendente },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 2, width: '11rem', value: (g) => this.situacaoItem(g).rotulo }
  ];
  protected readonly chaveGrupo = (g: GrupoItemSolicitacao) => g.chave;
  protected readonly rotuloGrupo = (g: GrupoItemSolicitacao) => `${g.material.codigo} ${g.material.descricao}`;
  protected readonly grupoExpansivel = (g: GrupoItemSolicitacao) => g.seriesEntregues.length > 0;

  protected readonly tipoLabel = tipoTecnicoLabel;
  protected readonly tipoIcon = tipoTecnicoIcon;

  ngOnInit(): void {
    this.imprimirAoCarregar = this.route.snapshot?.queryParamMap?.get('mode') === 'print';
    this.carregarApoio();
    const inicial = this.route.snapshot?.paramMap?.get('id') ?? '';
    if (inicial) this.load(inicial);
    this.route.paramMap?.subscribe((params) => {
      const id = params.get('id');
      if (id && id !== inicial) this.load(id);
    });
  }

  ngOnDestroy(): void {
    this.liberarAssinaturas();
  }

  protected can(acao: AcaoPermitidaSolicitacao): boolean {
    return (this.technical()?.acoesPermitidas ?? this.detail()?.acoesPermitidas ?? []).includes(acao);
  }

  protected reload(): void {
    this.load(this.detail()?.id ?? this.route.snapshot.paramMap.get('id') ?? '');
  }

  protected voltar(): void {
    this.navegacao.back(['/almoxarifado/solicitacoes-tecnicas']);
  }

  protected imprimir(): void {
    window.print();
  }

  protected abrirPainel(aba: AbaDetalheTecnico, acao: AcaoInicialDetalheTecnico | null = null): void {
    this.painelAberto.set(false);
    this.painelAba.set(aba);
    this.painelAcao.set(acao);
    setTimeout(() => this.painelAberto.set(true));
  }

  protected abrirSaldo(id: string | null | undefined, nome: string | null | undefined): void {
    if (id && nome) this.saldoDialog?.show(id, nome);
  }

  protected abrirModalPendenciaSolicitacao(): void {
    const d = this.detail();
    if (!d) return;
    this.pendenciaModalItemId.set(null);
    this.pendenciaModalItemLabel.set(null);
    this.pendenciaModalMotivoAtual.set(d.motivoPendencia ?? null);
    this.pendenciaModalJustificativaAtual.set(d.justificativaPendencia ?? null);
    this.pendenciaModalVisible.set(true);
  }

  protected abrirModalPendenciaItem(g: GrupoItemSolicitacao): void {
    const item = g.itemComPendencia ?? g.itemPendente;
    if (!item) return;
    this.pendenciaModalItemId.set(item.id);
    this.pendenciaModalItemLabel.set(`${g.material.codigo} — ${g.material.descricao}`);
    this.pendenciaModalMotivoAtual.set(item.motivoPendencia ?? null);
    this.pendenciaModalJustificativaAtual.set(item.justificativaPendencia ?? null);
    this.pendenciaModalVisible.set(true);
  }

  protected async separar(acao: Separacao): Promise<void> {
    const d = this.detail();
    const t = this.technical();
    if (!d || !t || this.executando()) return;
    const iniciar = acao === 'INICIAR_SEPARACAO';
    const ok = await this.confirmations.confirm({
      title: iniciar ? 'Iniciar a separação?' : 'Concluir a separação?',
      message: iniciar
        ? 'A solicitação passa para "Em separação" enquanto o almoxarifado confere o material.'
        : 'Confirma que o material está separado? A solicitação fica pronta para a retirada.',
      confirmLabel: iniciar ? 'Iniciar separação' : 'Concluir separação'
    });
    if (!ok) return;
    this.executando.set(true);
    const req = { versaoEsperada: t.versao };
    const chave = novaChaveIdempotencia();
    const chamada = iniciar ? this.service.iniciarSeparacao(d.id, req, chave) : this.service.concluirSeparacao(d.id, req, chave);
    chamada.pipe(finalize(() => this.executando.set(false))).subscribe({
      next: () => {
        this.notifications.success(iniciar ? 'Separação iniciada.' : 'Separação concluída: pronta para a retirada.');
        this.reload();
      },
      error: (e) => this.notifications.error(getErrorMessage(e), { title: 'Separação não atualizada' })
    });
  }

  protected situacaoItem(g: GrupoItemSolicitacao) {
    return SITUACOES[situacaoDoGrupo(g)];
  }

  protected grade(series: readonly string[]): SerieGradeItem[] {
    return series.map((numSerie) => ({ numSerie }));
  }

  protected nome(id?: string | null): string {
    return this.userLookup.resolverNome(id, 'Não informado');
  }

  protected dataCurta(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, dia] = iso.slice(0, 10).split('-');
    return `${dia}/${m}/${a}`;
  }

  private load(id: string): void {
    if (!id) {
      this.state.set('error');
      return;
    }
    if (!this.detail()) this.state.set('loading');
    this.service.buscarPorId(id).subscribe({
      next: (d) => {
        if (!d.tecnico) {
          this.erro.set('Esta solicitação não é técnica.');
          this.state.set('error');
          return;
        }
        this.detail.set(d);
        this.state.set('ready');
        if (this.obra()?.id !== d.tecnico.idObra) {
          this.obrasService.buscarObraPorId(d.tecnico.idObra).subscribe({ next: (o) => this.obra.set(o), error: () => this.obra.set(null) });
        }
        this.resolverResponsavelSaque();
        this.carregarAssinaturas(id);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.state.set('error');
      }
    });
  }

  private carregarApoio(): void {
    this.almoxarifadoService.listarEstoquesAtivos().subscribe({ next: (r) => this.almoxarifados.set(r.content ?? []), error: () => {} });
    this.rhService.listarEquipes({ ativo: true, size: 500 }).subscribe({ next: (r) => this.equipes.set(r.content ?? []), error: () => {} });
  }

  private resolverResponsavelSaque(): void {
    const t = this.technical();
    const entrega = [...(t?.operacoes ?? [])].reverse().find((o) => o.tipo === 'ENTREGA' && o.idColaboradorSaque);
    const id = entrega?.idColaboradorSaque ?? t?.idColaboradorSaque;
    if (!id) {
      this.responsavelSaqueNome.set('');
      return;
    }
    this.rhService.buscarColaboradorPorId(id).subscribe({
      next: (c) => this.responsavelSaqueNome.set(c.nomeCompleto),
      error: () => this.responsavelSaqueNome.set('')
    });
  }

  private carregarAssinaturas(id: string): void {
    this.liberarAssinaturas();
    forkJoin({
      almox: this.almoxarifadoService.buscarAssinaturaSolicitacao(id, 'ALMOX').pipe(catchError(() => of(null))),
      equipe: this.almoxarifadoService.buscarAssinaturaSolicitacao(id, 'EQUIPE').pipe(catchError(() => of(null)))
    })
      .pipe(finalize(() => this.imprimirSePedido()))
      .subscribe(({ almox, equipe }) => {
        if (almox?.size) this.assinaturaAlmoxUrl.set(URL.createObjectURL(almox));
        if (equipe?.size) this.assinaturaEquipeUrl.set(URL.createObjectURL(equipe));
      });
  }

  private imprimirSePedido(): void {
    if (!this.imprimirAoCarregar) return;
    this.imprimirAoCarregar = false;
    window.setTimeout(() => window.print(), 300);
  }

  private liberarAssinaturas(): void {
    for (const url of [this.assinaturaAlmoxUrl(), this.assinaturaEquipeUrl()]) if (url) URL.revokeObjectURL(url);
    this.assinaturaAlmoxUrl.set(null);
    this.assinaturaEquipeUrl.set(null);
  }
}
