import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { map } from 'rxjs';
import { GeoButtonComponent, GeoAsyncStateComponent, GeoIconButtonComponent, GeoStatusComponent, GeoTone } from '@geo/ui';
import { GeoCellDirective, GeoDataTableColumn, GeoDataTableComponent } from '@geo/ui/data';

import { FechamentoDetalhe, ItemFechamento, MovimentacaoFechamento } from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { NavigationHistoryService } from '../../../core/navigation/navigation-history.service';
import { AuthService } from '../../../core/services/auth.service';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { SaldoEstoqueDialogComponent } from '../../../shared/components/saldo-estoque-dialog/saldo-estoque-dialog.component';
import { SolicitacaoTecnicaHistoricoComponent } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-historico/solicitacao-tecnica-historico.component';
import { formatarAlmoxarifado } from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import { imprimirSempreNoTemaClaro } from '../../execucao/relatorios/relatorio-impressao';
import { AbaFechamento, FechamentoDetalheDrawerComponent } from './fechamento-detalhe-drawer.component';
import { FechamentoEstornoDrawerComponent } from './fechamento-estorno-drawer.component';
import { historicoFechamentoLegivel } from './fechamento-historico.util';
import { FechamentoOperacoesHistoricoComponent } from './fechamento-operacoes-historico.component';
import {
  SITUACOES,
  SITUACOES_OBRA,
  iconeTipo,
  movimentacoesRecentes,
  nomePessoa,
  prazo,
  quantidade,
  resumoItensMovimentacao,
  rotuloObra,
  situacaoItem,
  tipoFechamento,
  ultimaMovimentacao
} from './fechamento-ui';

interface FaixaSituacao {
  tom: GeoTone;
  icone: string;
  titulo: string;
  texto: string;
}

const DATA_HORA_LONGA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Relatório da solicitação de encerramento, no mesmo desenho do relatório comercial e do técnico:
 * cabeçalho institucional, faixa da situação, quadro de dados, resumo, itens e histórico. Não tem
 * termo nem assinaturas. Reserva e movimentação abrem o painel lateral da lista; o estorno abre
 * direto sobre o relatório.
 */
@Component({
  selector: 'app-fechamento-relatorio',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    AccordionModule,
    GeoButtonComponent,
    GeoAsyncStateComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoIconButtonComponent,
    GeoStatusComponent,
    FechamentoDetalheDrawerComponent,
    FechamentoEstornoDrawerComponent,
    FechamentoOperacoesHistoricoComponent,
    SaldoEstoqueDialogComponent,
    SolicitacaoTecnicaHistoricoComponent
  ],
  templateUrl: './fechamento-relatorio.component.html',
  styleUrl: '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-detalhe/solicitacao-tecnica-detalhe.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FechamentoRelatorioComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly service = inject(FechamentoObraService);
  private readonly permissoes = inject(AuthService).currentUser()?.permissoes ?? [];

  @ViewChild('saldoDialog') private saldoDialog?: SaldoEstoqueDialogComponent;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly erro = signal<string | null>(null);
  protected readonly detail = signal<FechamentoDetalhe | null>(null);
  private imprimirAoCarregar = false;

  protected readonly painelAberto = signal(false);
  protected readonly painelAba = signal<AbaFechamento>('itens');

  protected readonly estornoAberto = signal(false);
  protected readonly movimentacaoSelecionada = signal<MovimentacaoFechamento | null>(null);

  protected readonly timelineValue = signal<string | number | (string | number)[] | null | undefined>(undefined);
  protected readonly isTimelineOpen = computed(() => {
    const val = this.timelineValue();
    return val === 'timeline' || (Array.isArray(val) && (val as unknown[]).includes('timeline'));
  });

  /** A linha do tempo é a mesma do técnico e do comercial; só a origem dos eventos muda. */
  protected readonly fonteHistorico = (id: string) => this.service.historico(id).pipe(map(historicoFechamentoLegivel));

  protected readonly podeVerSaldo = this.permissoes.includes('estoque:saldo:read');
  protected readonly situacoes = SITUACOES;
  protected readonly situacoesObra = SITUACOES_OBRA;
  protected readonly quantidade = quantidade;
  protected readonly prazo = prazo;
  protected readonly nomePessoa = nomePessoa;
  protected readonly rotuloObra = rotuloObra;
  protected readonly iconeTipo = iconeTipo;
  protected readonly tipo = tipoFechamento;
  protected readonly situacaoDoItem = situacaoItem;
  protected readonly resumoItens = resumoItensMovimentacao;
  protected readonly nomeAlmoxarifado = formatarAlmoxarifado;

  protected readonly totais = computed(() => {
    const itens = this.detail()?.itens ?? [];
    return {
      solicitada: itens.reduce((t, i) => t + Number(i.quantidade), 0),
      movimentada: itens.reduce((t, i) => t + Number(i.quantidadeMovimentada), 0),
      pendente: itens.reduce((t, i) => t + Number(i.quantidadePendente), 0)
    };
  });
  protected readonly materiaisPendentes = computed(() => (this.detail()?.itens ?? []).filter((i) => i.quantidadePendente > 0).length);
  protected readonly movimentacoes = computed(() => movimentacoesRecentes(this.detail()?.movimentacoes ?? []));
  protected readonly resumoMovimentacoes = computed(() => {
    const todas = this.detail()?.movimentacoes ?? [];
    const movimentacoes = todas.filter((m) => m.tipo === 'MOVIMENTACAO').length;
    return { movimentacoes, estornos: todas.length - movimentacoes };
  });
  protected readonly ultimoOperador = computed(() => {
    const ultima = ultimaMovimentacao(this.detail()?.movimentacoes ?? []);
    return ultima ? nomePessoa(ultima.operador) : null;
  });
  protected readonly itensComPendencia = computed(() => (this.detail()?.itens ?? []).filter((i) => !!i.pendencia));

  protected readonly faixa = computed<FaixaSituacao>(() => {
    const d = this.detail();
    const t = this.totais();
    const materiais = (n: number) => `${n} ${n === 1 ? 'material' : 'materiais'}`;
    const quando = (v: string | null | undefined) => (v ? DATA_HORA_LONGA.format(new Date(v)) : '—');
    switch (d?.situacao) {
      case 'AGUARDANDO_RESERVA':
        return { tom: 'warning', icone: 'pi pi-hashtag', titulo: 'Aguardando reserva', texto: `Falta o número da reserva do SAP · prazo até ${quando(d.prazoVigente.limite)}.` };
      case 'AGUARDANDO_MOVIMENTACAO':
        return { tom: 'brand', icone: 'pi pi-clock', titulo: 'Reservada, aguardando movimentação', texto: `Reserva ${d.reserva?.numero ?? '—'} · ${materiais(this.materiaisPendentes())} a movimentar até ${quando(d.prazoVigente.limite)}.` };
      case 'MOVIMENTADA_PARCIALMENTE':
        return { tom: 'warning', icone: 'pi pi-percentage', titulo: 'Movimentada em parte', texto: `Movimentados ${quantidade(t.movimentada)} de ${quantidade(t.solicitada)}; faltam ${quantidade(t.pendente)} em ${materiais(this.materiaisPendentes())}.` };
      case 'MOVIMENTADA':
        return { tom: 'success', icone: 'pi pi-check-circle', titulo: 'Solicitação movimentada', texto: `${quantidade(t.movimentada)} movimentados · concluída em ${quando(d.movimentacaoConcluidaEm)}.` };
      case 'CANCELADA':
        return { tom: 'neutral', icone: 'pi pi-ban', titulo: 'Solicitação cancelada', texto: d.motivoCancelamento || 'Não conta para o encerramento da obra.' };
      default:
        return { tom: 'neutral', icone: 'pi pi-file', titulo: 'Solicitação de encerramento', texto: '' };
    }
  });

  protected readonly colunasItens: GeoDataTableColumn<ItemFechamento>[] = [
    { key: 'codigo', header: 'Código', priority: 1, width: '7rem', value: (i) => i.codigoMaterial },
    { key: 'descricao', header: 'Material / Descrição', type: 'custom', priority: 1, searchable: true, value: (i) => i.descricaoMaterial, display: (i) => i.descricaoMaterial },
    { key: 'unidade', header: 'Un.', priority: 2, width: '4rem', value: (i) => i.unidade || 'UN' },
    { key: 'solicitada', header: 'Solicitado', type: 'number', priority: 1, width: '7rem', value: (i) => i.quantidade },
    { key: 'movimentada', header: 'Movimentado', type: 'number', priority: 1, width: '8rem', value: (i) => i.quantidadeMovimentada },
    { key: 'pendente', header: 'Pendente', type: 'number', priority: 1, width: '7rem', value: (i) => i.quantidadePendente },
    { key: 'situacao', header: 'Situação', type: 'custom', priority: 2, width: '11rem', value: (i) => situacaoItem(i).label }
  ];
  protected readonly chaveItem = (i: ItemFechamento) => i.id;
  protected readonly rotuloItem = (i: ItemFechamento) => `${i.codigoMaterial} ${i.descricaoMaterial}`;

  constructor() {
    imprimirSempreNoTemaClaro();
  }

  ngOnInit(): void {
    this.imprimirAoCarregar = this.route.snapshot?.queryParamMap?.get('mode') === 'print';
    const inicial = this.route.snapshot?.paramMap?.get('id') ?? '';
    if (inicial) this.load(inicial);
    this.route.paramMap?.subscribe((params) => {
      const id = params.get('id');
      if (id && id !== this.detail()?.id && id !== inicial) this.load(id);
    });
  }

  protected reload(): void {
    this.load(this.detail()?.id ?? this.route.snapshot.paramMap.get('id') ?? '');
  }

  protected voltar(): void {
    this.navegacao.back(['/obras/encerramento']);
  }

  protected imprimir(): void {
    window.print();
  }

  protected abrirPainel(aba: AbaFechamento): void {
    this.painelAberto.set(false);
    this.painelAba.set(aba);
    setTimeout(() => this.painelAberto.set(true));
  }

  protected abrirEstorno(m: MovimentacaoFechamento): void {
    this.movimentacaoSelecionada.set(m);
    this.estornoAberto.set(true);
  }

  protected abrirSaldo(id: string, nome: string): void {
    this.saldoDialog?.show(id, nome);
  }

  private load(id: string): void {
    if (!id) {
      this.state.set('error');
      return;
    }
    if (!this.detail()) this.state.set('loading');
    this.service.detalhe(id).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.state.set('ready');
        this.imprimirSePedido();
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.state.set('error');
      }
    });
  }

  private imprimirSePedido(): void {
    if (!this.imprimirAoCarregar) return;
    this.imprimirAoCarregar = false;
    window.setTimeout(() => window.print(), 300);
  }
}
