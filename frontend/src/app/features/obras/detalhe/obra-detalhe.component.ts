import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoDialogShellComponent,
  GeoFileInputComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  GeoTextareaComponent,
  GeoTone,
  NotificationService
} from '@geo/ui';
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';

import { CLASSES_TENSAO, ClasseTensao } from '../../../core/models/obras-kit.models';
import {
  AnexoObraResponse,
  CarteiraObraRequest,
  HistoricoStatusObraResponse,
  ItemOrcamentoObraResponse,
  ObraProximaResponse,
  ObraResponse,
  ObraResumoResponse,
  OrcamentoObraResponse,
  PRIORIDADES_OBRA,
  PrioridadeObra,
  StatusObraResponse,
  SubprojetoResponse,
  TipoVinculoSubprojeto
} from '../../../core/models/obras.models';
import { EquipeResponse } from '../../../core/models/rh.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { MovimentacaoResumoObra, ProjecaoObraSolicitacoesResponse, SolicitacaoResumoObra } from '../../../core/models/solicitacao-material-tecnica.models';
import { AuthService } from '../../../core/services/auth.service';
import { ContratoService } from '../../../core/services/contrato.service';
import { ObrasService } from '../../../core/services/obras.service';
import { ObraDocumentacaoComponent } from '../documentacao/obra-documentacao.component';
import { RhService } from '../../../core/services/rh.service';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
import { DevolucaoTecnicaFormComponent } from '../../almoxarifado/solicitacoes-material/devolucao-tecnica-form/devolucao-tecnica-form.component';
import { NovaSolicitacaoTecnicaDrawerComponent } from '../../almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao-tecnica-drawer.component';
import { ObraFormComponent } from '../form/obra-form.component';
import { CargaSaldoObra, ObraMateriaisComponent } from './obra-materiais.component';
import { ThemeService } from '../../../core/services/theme.service';
import { AnalisarComCopilotoComponent } from '../../../shared/components/analisar-com-copiloto/analisar-com-copiloto.component';
import {
  statusLabel as statusSolicitacaoLabel,
  statusTone as statusSolicitacaoTone,
  tipoTecnicoEhAdicao,
  tipoTecnicoIcon,
  tipoTecnicoLabel
} from '../../almoxarifado/solicitacoes-material/solicitacao-tecnica-presentation';
import {
  TIPO_VINCULO_OPTIONS,
  formatarBytes,
  formatarDataHora,
  formatarDataParaApi,
  formatarMoeda,
  parseDataBrParaDate,
  statusIcon,
  statusTone
} from '../obras-ui';
import { AcaoInsightObra, insightsDaObra } from './obra-insights';
import { ProgramacaoDetalhe, ResumoPlanejamentoObra } from '../../../core/models/obras-programacao.models';
import { ObrasProgramacaoService } from '../../../core/services/obras-programacao.service';
import { ProgramacaoDetalheComponent } from '../programacao/programacao-detalhe.component';
import { ROTULO_TURNO, SITUACAO_PROGRAMACAO, formatarNumero } from '../programacao/programacao.logic';
import { ObraFechamentosComponent } from '../fechamento/obra-fechamentos.component';
import { MedicaoDaObra, MedicaoDetalhe } from '../../../core/models/obras-medicoes.models';
import { ObrasMedicoesService } from '../../../core/services/obras-medicoes.service';
import { MedirObraDrawerComponent } from '../medicoes/medir-obra-drawer.component';
import { STATUS_MEDICAO, TIPO_MEDICAO, rotuloCompetencia } from '../medicoes/medicoes.logic';

declare var L: any;

/** dd/MM/yyyy -> yyyyMMdd, para ordenar. */
function dataOrdenavel(data: string | null | undefined): string {
  const [d, m, a] = (data ?? '').split('/');
  return a && m && d ? `${a}${m}${d}` : '';
}

type Carga<T> = { estado: 'loading' } | { estado: 'error'; mensagem: string } | { estado: 'ready'; dados: T };

const RAIOS: GeoSelectOption<number>[] = [
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '20 km', value: 20 },
  { label: '50 km', value: 50 }
];
const DIA_MS = 86_400_000;
const INSIGHTS_VISIVEIS = 6;
/** Escurece os tiles claros do mapa no tema escuro. */
const FILTRO_TILES_ESCURO = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)';

type EstadoEtapa = 'feito' | 'andamento' | 'atencao' | 'pendente';

/** Etapa do ciclo da obra, do cadastro ao encerramento. `alvo` é o id do título da seção correspondente. */
export interface EtapaCiclo {
  id: string;
  rotulo: string;
  detalhe: string;
  estado: EstadoEtapa;
  alvo: string;
}

type AcaoPasso = 'visita' | 'planejar' | 'solicitar' | 'medir' | 'status' | 'encerramento';

/** A ação que destrava a obra agora, na ordem do ciclo. */
export interface ProximoPasso {
  texto: string;
  rotulo: string;
  icone: string;
  acao: AcaoPasso;
}

/** Marco da linha do tempo do prazo, em % do intervalo exibido. */
interface MarcoPrazo {
  rotulo: string;
  data: string;
  posicao: number;
  tipo: 'inicio' | 'hoje' | 'previsao' | 'regulado' | 'conclusao';
}

/**
 * Relatório da obra: tudo o que se sabe sobre ela numa página de aplicação (não A4). Cabeçalho com situação e
 * prazo, indicadores financeiros e de deslocamento, dados de cadastro e carteira, solicitações de material,
 * orçamento previsto, anexos, subprojetos, mapa com obras próximas, histórico do status e equipes.
 */
@Component({
  selector: 'app-obra-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ObraDocumentacaoComponent,
    ObraFechamentosComponent,
    MedirObraDrawerComponent,
    DevolucaoTecnicaFormComponent,
    ObraFormComponent,
    NovaSolicitacaoTecnicaDrawerComponent,
    DatePipe,
    ObraMateriaisComponent,
    ProgramacaoDetalheComponent,
    RouterLink,
    MenuModule,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoDialogShellComponent,
    GeoFileInputComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    AnalisarComCopilotoComponent
  ],
  templateUrl: './obra-detalhe.component.html',
  styleUrl: './obra-detalhe.component.css'
})
export class ObraDetalheComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ObrasService);
  private readonly contratos = inject(ContratoService);
  private readonly rhService = inject(RhService);
  private readonly solicitacaoService = inject(SolicitacaoMaterialTecnicaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly tema = inject(ThemeService);
  private readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapa');
  private leafletMap: any = null;

  protected readonly editando = signal(false);
  protected readonly solicitando = signal(false);
  protected readonly devolvendo = signal(false);
  private readonly permissoes = inject(AuthService).currentUser()?.permissoes ?? [];
  protected readonly podeEscrever = this.permissoes.includes('obras:obra:write');
  protected readonly podeDevolver = this.permissoes.includes('estoque:movimentacao:write');
  private readonly podeVerSaldo = this.permissoes.includes('estoque:saldo:read');
  protected readonly podePlanejar = this.permissoes.includes('obras:planejamento:read');
  protected readonly podeVerProgramacao = this.permissoes.includes('obras:programacao:read');
  protected readonly podeVerDocumentacao = this.permissoes.includes('obras:documentacao:read');
  protected readonly podeVerEncerramento = this.permissoes.includes('obras:fechamento:read');
  protected readonly podeCriarEncerramento = this.podeVerEncerramento && this.permissoes.includes('obras:fechamento:create');
  private readonly apiProgramacao = inject(ObrasProgramacaoService);
  protected readonly programacoes = signal<ProgramacaoDetalhe[]>([]);
  protected readonly resumoPlanejamento = signal<ResumoPlanejamentoObra | null>(null);
  protected readonly programacaoAberta = signal(false);
  protected readonly idProgramacao = signal<string | null>(null);
  protected readonly situacaoProgramacao = SITUACAO_PROGRAMACAO;
  protected readonly rotuloTurno = ROTULO_TURNO;
  protected readonly numeroProgramacao = formatarNumero;
  protected readonly podeAnexar = this.permissoes.includes('obras:anexos:write');
  protected readonly podeVerMedicao = this.permissoes.includes('obras:medicao:read');
  protected readonly podeMedir = this.podeVerMedicao && this.permissoes.includes('obras:medicao:write');
  private readonly apiMedicoes = inject(ObrasMedicoesService);
  protected readonly medicao = signal<Carga<MedicaoDaObra>>({ estado: 'loading' });
  protected readonly medindo = signal(false);
  protected readonly statusMedicao = STATUS_MEDICAO;
  protected readonly tipoMedicao = TIPO_MEDICAO;
  protected readonly competencia = rotuloCompetencia;
  protected readonly medicoesAtivas = computed(() => (this.dados(this.medicao())?.medicoes ?? []).filter((m) => m.status === 'GERADA').length);
  /** Mais recente primeiro, pela data de início (a ordem do número não acompanha as reprogramações). */
  protected readonly programacoesOrdenadas = computed(() =>
    [...this.programacoes()].sort((a, b) => dataOrdenavel(b.inicio).localeCompare(dataOrdenavel(a.inicio)) || b.numero - a.numero)
  );

  // Helpers de template
  protected readonly moeda = formatarMoeda;
  protected readonly bytes = formatarBytes;
  protected readonly dataHora = formatarDataHora;
  protected readonly statusTone = statusTone;
  protected readonly statusIcon = statusIcon;
  protected readonly statusSolicitacaoLabel = statusSolicitacaoLabel;
  protected readonly statusSolicitacaoTone = statusSolicitacaoTone;
  protected readonly tipoTecnicoLabel = tipoTecnicoLabel;
  protected readonly tipoTecnicoIcon = tipoTecnicoIcon;
  protected readonly tipoTecnicoEhAdicao = tipoTecnicoEhAdicao;
  protected readonly raios = RAIOS;
  protected readonly tensoes = CLASSES_TENSAO;
  protected readonly prioridades = PRIORIDADES_OBRA;
  protected readonly tiposVinculo: GeoSelectOption<TipoVinculoSubprojeto>[] = TIPO_VINCULO_OPTIONS.map((t) => ({ label: t.label, value: t.value }));
  protected readonly emissao = new Date();

  // ═══════════════════════════════════════════════════════════════════════
  // Estado principal
  // ═══════════════════════════════════════════════════════════════════════

  protected readonly obra = signal<ObraResponse | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly equipes = signal<EquipeResponse[]>([]);
  protected readonly statusList = signal<StatusObraResponse[]>([]);
  protected readonly tiposAnexo = signal<GeoSelectOption<string>[]>([]);
  protected readonly solicitacoes = signal<Carga<ProjecaoObraSolicitacoesResponse | null>>({ estado: 'loading' });
  protected readonly saldoObra = signal<CargaSaldoObra>(null);
  protected readonly historico = signal<Carga<HistoricoStatusObraResponse[]>>({ estado: 'loading' });
  protected readonly proximas = signal<Carga<ObraProximaResponse[]>>({ estado: 'loading' });
  protected readonly orcamento = signal<Carga<OrcamentoObraResponse>>({ estado: 'loading' });
  protected readonly raio = signal(10);
  /** A lista lateral mostra as mais próximas; o mapa já mostra todas. */
  protected readonly proximasVisiveis = 5;
  protected readonly todasProximas = signal(false);
  protected readonly proximasExibidas = computed(() => {
    const lista = this.dados(this.proximas()) ?? [];
    return this.todasProximas() ? lista : lista.slice(0, this.proximasVisiveis);
  });
  protected readonly recalculando = signal(false);

  protected readonly contratoOpcoes = toSignal(
    this.contratos.listarContratosAtivos().pipe(
      map((p) => p.content.map((c) => ({ label: `${c.numeroContrato} · ${c.cliente}`, value: c.id }))),
      catchError(() => of([] as GeoSelectOption<string>[]))
    ),
    { initialValue: [] as GeoSelectOption<string>[] }
  );

  protected readonly carteira = computed(() => this.obra()?.carteira ?? null);
  protected readonly temCoordenadas = computed(() => this.obra()?.latitude != null && this.obra()?.longitude != null);
  protected readonly nomeContrato = computed(() => {
    const id = this.carteira()?.idContrato;
    if (!id) return null;
    return this.contratoOpcoes().find((o) => o.value === id)?.label ?? 'Contrato inativo';
  });
  protected readonly rotuloPrioridade = computed(() => PRIORIDADES_OBRA.find((p) => p.value === this.carteira()?.prioridade)?.label ?? null);
  protected readonly tomPrioridade = computed<GeoTone>(() => {
    const p = this.carteira()?.prioridade;
    return p === 'URGENTE' ? 'danger' : p === 'ALTA' ? 'warning' : p === 'NORMAL' ? 'info' : 'neutral';
  });

  /** Solicitações de material num formato plano (obras corretivas/preventivas agrupam por ocorrência). */
  protected readonly listaSolicitacoes = computed<(SolicitacaoResumoObra & { ocorrencia?: string | null })[]>(() => {
    const carga = this.solicitacoes();
    if (carga.estado !== 'ready' || !carga.dados) return [];
    const proj = carga.dados;
    if (proj.ocorrencias?.length) {
      return proj.ocorrencias.flatMap((oc) => oc.solicitacoes.map((s) => ({ ...s, ocorrencia: oc.codigo || 'Geral' })));
    }
    return proj.solicitacoes ?? [];
  });

  protected readonly listaMovimentacoes = computed<MovimentacaoResumoObra[]>(() => {
    const carga = this.solicitacoes();
    return carga.estado === 'ready' ? (carga.dados?.movimentacoes ?? []) : [];
  });
  protected readonly movimentacoesTruncadas = computed(() => {
    const carga = this.solicitacoes();
    return carga.estado === 'ready' && !!carga.dados?.movimentacoesTruncadas;
  });

  /** Linha do tempo do prazo: início, hoje, previsão de fim, prazo regulado e conclusão. */
  protected readonly prazo = computed(() => {
    const o = this.obra();
    if (!o) return null;
    const inicio = parseDataBrParaDate(o.dataInicio);
    const previsao = parseDataBrParaDate(o.dataPrevisaoFim);
    if (!inicio || !previsao) return null;
    const regulado = parseDataBrParaDate(this.carteira()?.prazoRegulado);
    const conclusao = parseDataBrParaDate(o.dataFimEfetiva);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const datas = [inicio, previsao, regulado, conclusao, hoje].filter((d): d is Date => !!d).map((d) => d.getTime());
    const min = Math.min(...datas);
    const max = Math.max(...datas);
    const pos = (d: Date) => (max === min ? 0 : ((d.getTime() - min) / (max - min)) * 100);
    const marcos: MarcoPrazo[] = [
      { rotulo: 'Início', data: o.dataInicio, posicao: pos(inicio), tipo: 'inicio' },
      { rotulo: 'Previsão', data: o.dataPrevisaoFim, posicao: pos(previsao), tipo: 'previsao' }
    ];
    if (regulado) marcos.push({ rotulo: 'Prazo regulado', data: this.carteira()!.prazoRegulado!, posicao: pos(regulado), tipo: 'regulado' });
    if (conclusao) marcos.push({ rotulo: 'Conclusão', data: o.dataFimEfetiva!, posicao: pos(conclusao), tipo: 'conclusao' });
    else marcos.push({ rotulo: 'Hoje', data: hoje.toLocaleDateString('pt-BR'), posicao: pos(hoje), tipo: 'hoje' });

    const limite = regulado && regulado < previsao ? regulado : previsao;
    const dias = Math.round((limite.getTime() - hoje.getTime()) / DIA_MS);
    const total = Math.max(DIA_MS, previsao.getTime() - inicio.getTime());
    const decorrido = Math.min(100, Math.max(0, ((hoje.getTime() - inicio.getTime()) / total) * 100));
    let situacao: { texto: string; tom: GeoTone; icone: string };
    if (conclusao) situacao = { texto: `Concluída em ${o.dataFimEfetiva}`, tom: 'success', icone: 'pi-check-circle' };
    else if (dias < 0) situacao = { texto: `${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'} de atraso`, tom: 'danger', icone: 'pi-exclamation-circle' };
    else if (dias <= 15) situacao = { texto: `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`, tom: 'warning', icone: 'pi-clock' };
    else situacao = { texto: `Faltam ${dias} dias`, tom: 'info', icone: 'pi-calendar' };
    return { marcos, situacao, decorrido: Math.round(decorrido), preenchimento: conclusao ? pos(conclusao) : pos(hoje) };
  });

  /** Pontos de atenção entre os indicadores e os dados; cargas em andamento não geram insight. */
  protected readonly insights = computed(() => {
    const obra = this.obra();
    if (!obra) return [];
    return insightsDaObra({
      obra,
      hoje: this.hoje,
      orcamento: this.dados(this.orcamento()),
      totalSolicitacoes: this.solicitacoes().estado === 'ready' ? this.listaSolicitacoes().length : null,
      totalProximas: this.dados(this.proximas())?.length ?? null,
      raioKm: this.raio(),
      dataUltimoStatus: this.dados(this.historico())?.[0]?.data ?? null,
      visitaRealizada: this.visitaRealizada()
    }).map((i) => (i.acao && !this.podeAcionar(i.acao.tipo) ? { ...i, acao: undefined } : i));
  });
  /** Do cadastro ao encerramento: a situação de cada etapa com o que já se sabe da obra. */
  protected readonly ciclo = computed<EtapaCiclo[]>(() => {
    const o = this.obra();
    if (!o) return [];
    const etapas: EtapaCiclo[] = [
      { id: 'cadastro', rotulo: 'Cadastro', detalhe: o.dataInicio ? `Início em ${o.dataInicio}` : 'Cadastrada', estado: 'feito', alvo: 'dados-titulo' }
    ];

    const carregandoOrcamento = this.orcamento().estado === 'loading';
    const orc = this.dados(this.orcamento());
    etapas.push({
      id: 'orcamento',
      rotulo: 'Orçamento',
      alvo: 'orcamento-titulo',
      detalhe: carregandoOrcamento ? 'Carregando' : orc?.importado ? this.moeda(orc.totalServicosImportados) : 'Não importado',
      estado: orc?.importado ? 'feito' : 'pendente'
    });

    if (this.podeVerDocumentacao) {
      const visita = this.visitaRealizada();
      etapas.push({
        id: 'visita',
        rotulo: 'Visita prévia',
        alvo: 'documentacao-titulo',
        detalhe: visita === null ? 'Carregando' : visita ? 'Realizada' : 'Não realizada',
        estado: visita ? 'feito' : 'pendente'
      });
    }

    const plan = this.resumoPlanejamento();
    if (this.podeVerProgramacao) {
      const programado = plan ? Math.min(100, plan.percentualConcluido + plan.percentualProgramado) : 0;
      etapas.push({
        id: 'programacao',
        rotulo: 'Programação',
        alvo: 'programacao-titulo',
        detalhe: !plan?.temKits ? 'Sem kits planejados' : `${formatarNumero(programado)}% programado`,
        estado: !plan?.temKits ? 'pendente' : programado >= 100 ? 'feito' : programado > 0 ? 'andamento' : 'pendente'
      });
    }

    const solicitacoes = this.solicitacoes().estado === 'ready' ? this.listaSolicitacoes().length : null;
    etapas.push({
      id: 'materiais',
      rotulo: 'Materiais',
      alvo: 'solicitacoes-titulo',
      detalhe: solicitacoes === null ? 'Carregando' : solicitacoes ? `${solicitacoes} ${solicitacoes === 1 ? 'solicitação' : 'solicitações'}` : 'Nada solicitado',
      estado: solicitacoes ? 'feito' : 'pendente'
    });

    if (this.podeVerProgramacao && plan?.temKits) {
      etapas.push({
        id: 'execucao',
        rotulo: 'Execução',
        alvo: this.podeVerMedicao ? 'medicao-titulo' : 'programacao-titulo',
        detalhe: `${formatarNumero(plan.percentualConcluido)}% concluído`,
        estado: plan.percentualConcluido >= 100 ? 'feito' : plan.percentualConcluido > 0 ? 'andamento' : 'pendente'
      });
    }

    if (this.podeVerMedicao) {
      const med = this.dados(this.medicao());
      let detalhe = 'Carregando';
      let estado: EstadoEtapa = 'pendente';
      if (med && med.valorPendente > 0) {
        detalhe = `${this.moeda(med.valorPendente)} a medir`;
        estado = 'atencao';
      } else if (med && med.valorMedido > 0) {
        detalhe = `${this.moeda(med.valorMedido)} medido`;
        estado = o.statusConcluida ? 'feito' : 'andamento';
      } else if (med) {
        detalhe = 'Nada medido';
      }
      etapas.push({ id: 'medicao', rotulo: 'Medição', alvo: 'medicao-titulo', detalhe, estado });
    }

    etapas.push({
      id: 'encerramento',
      rotulo: 'Encerramento',
      alvo: this.podeVerEncerramento ? 'encerramento-titulo' : 'historico-titulo',
      detalhe: o.statusConcluida ? (o.dataFimEfetiva ? `Concluída em ${o.dataFimEfetiva}` : 'Concluída') : 'Em aberto',
      estado: o.statusConcluida ? 'feito' : 'pendente'
    });
    return etapas;
  });

  /** A primeira etapa que pede ação de quem está vendo, na ordem do ciclo. Sem permissão para agir, não sugere. */
  protected readonly proximoPasso = computed<ProximoPasso | null>(() => {
    const o = this.obra();
    if (!o) return null;
    const plan = this.resumoPlanejamento();
    const med = this.dados(this.medicao());
    if (this.podeVerDocumentacao && this.visitaRealizada() === false && !plan?.percentualConcluido) {
      return { texto: 'a visita prévia ainda não foi registrada.', rotulo: 'Registrar visita', icone: 'pi pi-map-marker', acao: 'visita' };
    }
    if (this.podePlanejar && plan?.temKits && plan.valorPendente > 0) {
      return { texto: `${this.moeda(plan.valorPendente)} em serviços ainda sem programação.`, rotulo: 'Programar', icone: 'pi pi-calendar-plus', acao: 'planejar' };
    }
    if (!o.statusConcluida && this.solicitacoes().estado === 'ready' && !this.listaSolicitacoes().length && (plan?.percentualProgramado ?? 0) > 0) {
      return { texto: 'há programação, mas nenhum material foi solicitado para a obra.', rotulo: 'Solicitar materiais', icone: 'pi pi-cart-plus', acao: 'solicitar' };
    }
    if (this.podeMedir && med && med.pendentes.length) {
      return { texto: `${this.moeda(med.valorPendente)} executados esperando medição.`, rotulo: 'Medir', icone: 'pi pi-calculator', acao: 'medir' };
    }
    if (this.podeEscrever && !o.statusConcluida && plan?.temKits && plan.percentualConcluido >= 100) {
      return { texto: 'todos os serviços planejados foram executados. Registre a conclusão da obra.', rotulo: 'Registrar status', icone: 'pi pi-sync', acao: 'status' };
    }
    if (this.podeCriarEncerramento && o.statusConcluida && med && !med.pendentes.length) {
      return { texto: 'obra concluída e medida. Regularize o saldo de material.', rotulo: 'Solicitar encerramento', icone: 'pi pi-flag', acao: 'encerramento' };
    }
    return null;
  });

  protected executarPasso(acao: AcaoPasso): void {
    switch (acao) {
      case 'visita':
        return this.irParaSecao('documentacao-titulo');
      case 'planejar':
        return this.planejar();
      case 'solicitar':
        return this.solicitarMateriais();
      case 'medir':
        return this.medindo.set(true);
      case 'status':
        return this.abrirStatus();
      case 'encerramento':
        return this.novoEncerramento();
    }
  }

  protected irParaSecao(idTitulo: string): void {
    const titulo = document.getElementById(idTitulo);
    const alvo = titulo?.closest('section') ?? titulo;
    alvo?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  protected aoMedir(m: MedicaoDetalhe): void {
    this.carregarMedicao();
    void this.router.navigate(['/obras/medicoes', m.medicao.id]);
  }

  protected readonly todosInsights = signal(false);
  /** Vem do card de documentação técnica quando ele carrega. */
  protected readonly visitaRealizada = signal<boolean | null>(null);
  protected readonly insightsExibidos = computed(() => (this.todosInsights() ? this.insights() : this.insights().slice(0, INSIGHTS_VISIVEIS)));
  protected readonly insightsOcultos = computed(() => this.insights().length - INSIGHTS_VISIVEIS);
  protected readonly resumoInsights = computed(() => {
    const lista = this.insights();
    const graves = lista.filter((i) => i.tom === 'danger').length;
    const avisos = lista.filter((i) => i.tom === 'warning').length;
    return [graves && `${graves} ${graves === 1 ? 'crítico' : 'críticos'}`, avisos && `${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}`]
      .filter(Boolean)
      .join(' · ');
  });

  /** O que dá para atualizar na obra, conforme as permissões. Fica num só botão para não lotar a barra. */
  protected readonly acoesAtualizar = computed<MenuItem[]>(() => {
    const o = this.obra();
    const itens: MenuItem[] = [];
    if (this.podeEscrever) {
      itens.push(
        { label: 'Registrar status', icon: 'pi pi-sync', command: () => this.abrirStatus() },
        { label: 'Editar carteira', icon: 'pi pi-briefcase', command: () => this.abrirCarteira() },
        { label: 'Editar cadastro e equipes', icon: 'pi pi-pencil', command: () => this.editar() }
      );
    }
    if (this.podeAnexar) itens.push({ label: 'Adicionar anexo', icon: 'pi pi-paperclip', command: () => this.abrirAnexo() });
    if (this.podeEscrever && !o?.obraPaiId && !o?.statusConcluida) {
      itens.push({ label: 'Vincular subprojeto', icon: 'pi pi-sitemap', command: () => this.abrirVinculo() });
    }
    return itens;
  });

  protected readonly colunasOrcamento: GeoDataTableColumn<ItemOrcamentoObraResponse>[] = [
    { key: 'codigo', header: 'Serviço', type: 'custom', priority: 1, value: (i) => i.codigo, display: (i) => `${i.codigo} ${i.descricao ?? ''}` },
    { key: 'quantidade', header: 'Qtd.', width: '7rem', value: (i) => i.quantidade, display: (i) => `${i.quantidade.toLocaleString('pt-BR')} ${i.unidade ?? ''}` },
    { key: 'valorUnitario', header: 'Unitário', type: 'currency', width: '8rem' },
    { key: 'valorTotal', header: 'Total', type: 'currency', priority: 1, width: '9rem' }
  ];
  protected readonly chave = (r: { id: string }) => r.id;

  // ═══════════════════════════════════════════════════════════════════════
  // Drawers
  // ═══════════════════════════════════════════════════════════════════════

  // Status operacional
  protected readonly statusAberto = signal(false);
  protected readonly salvandoStatus = signal(false);
  protected readonly novoStatusId = signal<string | null>(null);
  protected readonly novaDataFim = signal<Date | null>(null);
  protected readonly observacaoStatus = signal('');
  protected readonly opcoesStatus = computed(() => this.statusList().map((s) => ({ label: s.nome, value: s.id })));
  protected readonly statusConcluido = computed(() => this.statusList().find((s) => s.id === this.novoStatusId())?.concluida ?? false);
  protected readonly hoje = new Date();

  // Carteira
  protected readonly carteiraAberta = signal(false);
  protected readonly salvandoCarteira = signal(false);
  protected readonly cIdContrato = signal<string | null>(null);
  protected readonly cTensao = signal<ClasseTensao | null>(null);
  protected readonly cPrioridade = signal<PrioridadeObra | null>(null);
  protected readonly cPrazoRegulado = signal<Date | null>(null);
  protected readonly cLote = signal('');
  protected readonly cValorProjeto = signal<number | null>(null);
  protected readonly cMaterial = signal<number | null>(null);
  protected readonly cServico = signal<number | null>(null);
  private carteiraOriginal = '';
  protected readonly carteiraAlterada = computed(() => this.assinaturaCarteira() !== this.carteiraOriginal);

  // Anexo
  protected readonly anexoAberto = signal(false);
  protected readonly enviandoAnexo = signal(false);
  protected readonly anexoTipo = signal<string | null>(null);
  protected readonly anexoArquivo = signal<File | null>(null);
  protected readonly anexoObservacao = signal('');

  // Subprojeto
  protected readonly vinculoAberto = signal(false);
  protected readonly vinculando = signal(false);
  protected readonly obraFilha = signal<string | null>(null);
  protected readonly tipoVinculo = signal<TipoVinculoSubprojeto>(TipoVinculoSubprojeto.KIT);
  protected readonly obrasParaVinculo = signal<ObraResumoResponse[]>([]);
  protected readonly buscandoObras = signal(false);
  protected readonly opcoesObrasVinculo = computed(() => this.obrasParaVinculo().map((o) => ({ label: `${o.numero} · ${o.titulo}`, value: o.id })));
  private readonly buscaObras$ = new Subject<string>();

  // Pré-visualização de anexo
  protected readonly previewAberto = signal(false);
  protected readonly previewNome = signal('');
  protected readonly previewTipo = signal<'pdf' | 'image' | 'other'>('other');
  protected readonly carregandoPreview = signal(false);
  private readonly previewBruto = signal<string | null>(null);
  protected readonly previewUrl = signal<SafeResourceUrl | null>(null);

  constructor() {
    this.carregarLookups();
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id === 'novo' || id === 'nova') {
        void this.router.navigate(['/obras/nova']);
      } else if (id) {
        this.carregarObra(id);
      } else {
        void this.router.navigate(['/obras']);
      }
    });
    // Recarrega as obras próximas ao trocar o raio.
    effect(() => {
      const raio = this.raio();
      untracked(() => {
        const o = this.obra();
        if (o && this.temCoordenadas() && this.proximas().estado !== 'loading') this.carregarProximas(o.id, raio);
      });
    });
    this.buscaObras$
      .pipe(
        debounceTime(300),
        switchMap((termo) => {
          this.buscandoObras.set(true);
          return this.service.listarObras({ buscaGlobal: termo || undefined, apenasPrincipais: true, size: 20 }).pipe(catchError(() => of(null)));
        })
      )
      .subscribe((res) => {
        this.buscandoObras.set(false);
        const o = this.obra();
        const jaVinculadas = new Set((o?.subprojetos ?? []).map((s) => s.id));
        this.obrasParaVinculo.set((res?.content ?? []).filter((x) => x.id !== o?.id && !jaVinculadas.has(x.id)));
      });
    // O mapa acompanha o tema: tiles e cores dos marcadores são definidos ao desenhar.
    effect(() => {
      this.tema.isDarkMode();
      untracked(() => {
        if (this.leafletMap) setTimeout(() => this.renderizarMapa(), 0);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.fecharPreview();
      this.destruirMapa();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Carga
  // ═══════════════════════════════════════════════════════════════════════

  protected carregarObra(id: string, silencioso = false): void {
    if (!silencioso) this.carregando.set(true);
    this.erro.set(null);
    this.service.buscarObraPorId(id).subscribe({
      next: (dados) => {
        this.obra.set(dados);
        this.carregando.set(false);
        this.carregarEquipes(dados.equipes ?? []);
        this.carregarSolicitacoes(dados.id);
        this.carregarHistorico(dados.id);
        this.carregarOrcamento(dados.id);
        this.carregarProgramacoes(dados.id);
        this.carregarMedicao(dados.id);
        if (dados.latitude != null && dados.longitude != null) {
          this.carregarProximas(dados.id, this.raio());
        } else {
          this.proximas.set({ estado: 'ready', dados: [] });
          this.destruirMapa();
        }
      },
      error: (e) => {
        this.carregando.set(false);
        this.erro.set(getErrorMessage(e));
      }
    });
  }

  protected recarregar(): void {
    const id = this.obra()?.id;
    if (id) this.carregarObra(id, true);
  }

  protected carregarProgramacoes(id = this.obra()!.id): void {
    if (!this.podeVerProgramacao) return;
    this.apiProgramacao.listarDaObra(id).pipe(catchError(() => of([]))).subscribe((lista) => this.programacoes.set(lista));
    this.apiProgramacao.resumos([id]).pipe(catchError(() => of([]))).subscribe(([resumo]) => this.resumoPlanejamento.set(resumo ?? null));
  }

  protected carregarMedicao(id = this.obra()!.id): void {
    if (!this.podeVerMedicao) return;
    if (!this.dados(this.medicao())) this.medicao.set({ estado: 'loading' });
    this.apiMedicoes.daObra(id).subscribe({
      next: (dados) => this.medicao.set({ estado: 'ready', dados }),
      error: (e) => this.medicao.set({ estado: 'error', mensagem: getErrorMessage(e) })
    });
  }

  protected abrirProgramacao(id: string): void {
    this.idProgramacao.set(id);
    this.programacaoAberta.set(true);
  }

  protected carregarSolicitacoes(id = this.obra()!.id): void {
    this.solicitacoes.set({ estado: 'loading' });
    this.solicitacaoService.obterProjecaoObra(id).subscribe({
      next: (dados) => this.solicitacoes.set({ estado: 'ready', dados }),
      error: (e) => this.solicitacoes.set({ estado: 'error', mensagem: getErrorMessage(e) })
    });
    this.carregarSaldo(id);
  }

  protected carregarSaldo(id = this.obra()!.id): void {
    if (!this.podeVerSaldo) return;
    this.saldoObra.set({ estado: 'loading' });
    this.solicitacaoService.obterSaldoObra(id).subscribe({
      next: (dados) => this.saldoObra.set({ estado: 'ready', dados }),
      error: (e) => this.saldoObra.set({ estado: 'error', mensagem: getErrorMessage(e) })
    });
  }

  protected carregarHistorico(id = this.obra()!.id): void {
    this.historico.set({ estado: 'loading' });
    this.service.listarHistoricoStatus(id).subscribe({
      next: (dados) => this.historico.set({ estado: 'ready', dados }),
      error: (e) => this.historico.set({ estado: 'error', mensagem: getErrorMessage(e) })
    });
  }

  protected carregarOrcamento(id = this.obra()!.id): void {
    this.orcamento.set({ estado: 'loading' });
    this.service.buscarOrcamento(id).subscribe({
      next: (dados) => this.orcamento.set({ estado: 'ready', dados }),
      error: (e) => this.orcamento.set({ estado: 'error', mensagem: getErrorMessage(e) })
    });
  }

  protected carregarProximas(id = this.obra()!.id, raio = this.raio()): void {
    this.proximas.set({ estado: 'loading' });
    this.service.listarObrasProximas(id, raio).subscribe({
      next: (dados) => {
        this.proximas.set({ estado: 'ready', dados });
        setTimeout(() => this.renderizarMapa(), 0);
      },
      error: (e) => {
        this.proximas.set({ estado: 'error', mensagem: getErrorMessage(e) });
        setTimeout(() => this.renderizarMapa(), 0);
      }
    });
  }

  private carregarEquipes(ids: string[]): void {
    if (!ids.length) {
      this.equipes.set([]);
      return;
    }
    this.rhService.listarEquipes({ ativo: true, size: 200 }).subscribe({
      next: (res) => {
        const set = new Set(ids);
        this.equipes.set((res.content ?? []).filter((e) => set.has(e.id)));
      }
    });
  }

  private carregarLookups(): void {
    this.service.listarStatusAtivos().subscribe({ next: (r) => this.statusList.set(r) });
    this.service.listarTiposAnexosAtivos().subscribe({ next: (r) => this.tiposAnexo.set(r.map((t) => ({ label: t.nome, value: t.id }))) });
  }

  protected dados<T>(carga: Carga<T>): T | null {
    return carga.estado === 'ready' ? carga.dados : null;
  }

  protected mensagem(carga: Carga<unknown>): string | undefined {
    return carga.estado === 'error' ? carga.mensagem : undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Formatação
  // ═══════════════════════════════════════════════════════════════════════

  protected km(valor?: number | null): string {
    return valor == null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
  }

  protected duracao(minutos?: number | null): string {
    if (minutos == null) return '—';
    const h = Math.floor(minutos / 60);
    return h ? `${h} h ${String(minutos % 60).padStart(2, '0')} min` : `${minutos} min`;
  }

  protected iconeArquivo(nome: string): string {
    const n = nome.toLowerCase();
    if (n.endsWith('.pdf')) return 'pi-file-pdf';
    if (/\.(png|jpe?g|webp|gif|svg)$/.test(n)) return 'pi-image';
    if (/\.(xlsx?|csv)$/.test(n)) return 'pi-file-excel';
    if (/\.(docx?)$/.test(n)) return 'pi-file-word';
    return 'pi-file';
  }

  protected iniciais(texto?: string | null): string {
    return (texto ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Ações gerais
  // ═══════════════════════════════════════════════════════════════════════

  protected editar(): void {
    if (this.obra()) this.editando.set(true);
  }

  protected planejar(): void {
    const id = this.obra()?.id;
    if (id) void this.router.navigate(['/obras', id, 'planejamento']);
  }

  protected voltar(): void {
    void this.router.navigate(['/obras']);
  }

  /** Lista do encerramento já no recorte desta obra. */
  protected verEncerramento(): void {
    const o = this.obra();
    if (o) void this.router.navigate(['/obras/encerramento'], { queryParams: { obra: o.id } });
  }

  /** Nova solicitação de encerramento com a obra já escolhida. */
  protected novoEncerramento(): void {
    const o = this.obra();
    if (o) void this.router.navigate(['/obras/encerramento'], { queryParams: { obra: o.id, novaParaObra: o.id } });
  }

  protected abrirEncerramento(id: string): void {
    const o = this.obra();
    void this.router.navigate(['/obras/encerramento'], { queryParams: { obra: o?.id, abrir: id } });
  }

  protected imprimirEncerramento(id: string): void {
    void this.router.navigate(['/obras/encerramento', id]);
  }

  protected solicitarMateriais(): void {
    if (this.obra()) this.solicitando.set(true);
  }

  protected imprimir(): void {
    window.print();
  }

  private podeAcionar(tipo: AcaoInsightObra): boolean {
    if (tipo === 'anexo') return this.podeAnexar;
    if (tipo === 'visita') return this.podeVerDocumentacao;
    return tipo === 'solicitar' || this.podeEscrever;
  }

  protected acionarInsight(tipo: AcaoInsightObra): void {
    switch (tipo) {
      case 'carteira':
        return this.abrirCarteira();
      case 'cadastro':
        return this.editar();
      case 'anexo':
        return this.abrirAnexo();
      case 'solicitar':
        return this.solicitarMateriais();
      case 'status':
        return this.abrirStatus();
      case 'visita':
        return this.irParaDocumentacao();
    }
  }

  protected recalcularDeslocamento(): void {
    const id = this.obra()?.id;
    if (!id) return;
    this.recalculando.set(true);
    this.service.recalcularDeslocamento(id).subscribe({
      next: (c) => {
        this.recalculando.set(false);
        this.notificacoes.success(c.deslocamentoEstimado ? 'Deslocamento estimado (provedor de rotas indisponível).' : 'Deslocamento recalculado.');
        this.recarregar();
      },
      error: (e) => {
        this.recalculando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Status operacional
  // ═══════════════════════════════════════════════════════════════════════

  protected abrirStatus(): void {
    const o = this.obra();
    if (!o) return;
    this.novoStatusId.set(o.statusId);
    this.novaDataFim.set(parseDataBrParaDate(o.dataFimEfetiva));
    this.observacaoStatus.set('');
    this.statusAberto.set(true);
  }

  protected salvarStatus(): void {
    const o = this.obra();
    const idStatus = this.novoStatusId();
    if (!o || !idStatus) return;
    this.salvandoStatus.set(true);
    this.service
      .informarStatusOperacional(o.id, {
        idStatusObra: idStatus,
        observacao: this.observacaoStatus().trim() || null,
        dataFimEfetiva: (this.statusConcluido() && formatarDataParaApi(this.novaDataFim())) || null
      })
      .subscribe({
        next: () => {
          this.salvandoStatus.set(false);
          this.statusAberto.set(false);
          const nome = this.statusList().find((s) => s.id === idStatus)?.nome ?? o.statusNome;
          this.notificacoes.success(`Status registrado como "${nome}".`);
          this.recarregar();
        },
        error: (e) => {
          this.salvandoStatus.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Carteira
  // ═══════════════════════════════════════════════════════════════════════

  protected abrirCarteira(): void {
    const o = this.obra();
    if (!o) return;
    const c = o.carteira;
    this.cIdContrato.set(c?.idContrato ?? null);
    this.cTensao.set(c?.classeTensao ?? null);
    this.cPrioridade.set(c?.prioridade ?? null);
    this.cPrazoRegulado.set(parseDataBrParaDate(c?.prazoRegulado));
    this.cLote.set(c?.lotePrevisto ?? '');
    this.cValorProjeto.set(o.valorProjeto ?? null);
    this.cMaterial.set(c?.valorMaterialPrevisto ?? null);
    this.cServico.set(c?.valorServicoPrevisto ?? null);
    this.carteiraOriginal = this.assinaturaCarteira();
    this.carteiraAberta.set(true);
  }

  private assinaturaCarteira(): string {
    return JSON.stringify([
      this.cIdContrato(), this.cTensao(), this.cPrioridade(), formatarDataParaApi(this.cPrazoRegulado()) ?? null,
      this.cLote(), this.cValorProjeto(), this.cMaterial(), this.cServico()
    ]);
  }

  protected salvarCarteira(): void {
    const id = this.obra()?.id;
    if (!id) return;
    const request: CarteiraObraRequest = {
      idContrato: this.cIdContrato(),
      classeTensao: this.cTensao(),
      prioridade: this.cPrioridade(),
      prazoRegulado: formatarDataParaApi(this.cPrazoRegulado()) ?? null,
      lotePrevisto: this.cLote().trim() || null,
      valorProjeto: this.cValorProjeto(),
      valorMaterialPrevisto: this.cMaterial(),
      valorServicoPrevisto: this.cServico()
    };
    this.salvandoCarteira.set(true);
    this.service.informarCarteira(id, request).subscribe({
      next: () => {
        this.salvandoCarteira.set(false);
        this.carteiraAberta.set(false);
        this.notificacoes.success('Carteira da obra atualizada.');
        this.recarregar();
      },
      error: (e) => {
        this.salvandoCarteira.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Subprojetos
  // ═══════════════════════════════════════════════════════════════════════

  protected abrirVinculo(): void {
    this.obraFilha.set(null);
    this.tipoVinculo.set(TipoVinculoSubprojeto.KIT);
    this.obrasParaVinculo.set([]);
    this.vinculoAberto.set(true);
    this.buscarObrasVinculo('');
  }

  protected buscarObrasVinculo(termo: string): void {
    this.buscaObras$.next(termo.trim());
  }

  protected vincular(): void {
    const paiId = this.obra()?.id;
    const filhaId = this.obraFilha();
    if (!paiId || !filhaId) return;
    const filha = this.obrasParaVinculo().find((o) => o.id === filhaId);
    this.vinculando.set(true);
    this.service.vincularSubprojeto(paiId, { idObraFilha: filhaId, tipoVinculo: this.tipoVinculo() }).subscribe({
      next: () => {
        this.vinculando.set(false);
        this.vinculoAberto.set(false);
        this.notificacoes.success(`Obra ${filha?.numero ?? ''} vinculada como subprojeto ${this.tipoVinculo()}.`);
        this.recarregar();
      },
      error: (e) => {
        this.vinculando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected async desvincular(sub: SubprojetoResponse): Promise<void> {
    const paiId = this.obra()?.id;
    if (!paiId) return;
    const ok = await this.confirmacao.confirm({
      title: 'Desvincular subprojeto',
      message: `${sub.numero} deixa de ser subprojeto desta obra. A obra continua cadastrada.`,
      confirmLabel: 'Desvincular',
      variant: 'destructive'
    });
    if (!ok) return;
    this.service.desvincularSubprojeto(paiId, sub.id).subscribe({
      next: () => {
        this.notificacoes.success(`Subprojeto ${sub.numero} desvinculado.`);
        this.recarregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Anexos
  // ═══════════════════════════════════════════════════════════════════════

  private irParaDocumentacao(): void {
    this.irParaSecao('documentacao-titulo');
  }

  protected abrirAnexo(): void {
    this.anexoArquivo.set(null);
    this.anexoTipo.set(this.tiposAnexo()[0]?.value ?? null);
    this.anexoObservacao.set('');
    this.anexoAberto.set(true);
  }

  protected salvarAnexo(): void {
    const id = this.obra()?.id;
    const arquivo = this.anexoArquivo();
    const tipo = this.anexoTipo();
    if (!id || !arquivo || !tipo) return;
    this.enviandoAnexo.set(true);
    this.service.anexarArquivo(id, tipo, arquivo, this.anexoObservacao()).subscribe({
      next: () => {
        this.enviandoAnexo.set(false);
        this.anexoAberto.set(false);
        this.notificacoes.success(`${arquivo.name} anexado.`);
        this.recarregar();
      },
      error: (e) => {
        this.enviandoAnexo.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected visualizarAnexo(anexo: AnexoObraResponse): void {
    const id = this.obra()?.id;
    if (!id) return;
    const nome = anexo.nomeArquivo.toLowerCase();
    const pdf = nome.endsWith('.pdf');
    const imagem = /\.(png|jpe?g|webp|svg|gif)$/.test(nome);
    this.previewNome.set(anexo.nomeArquivo);
    this.previewTipo.set(pdf ? 'pdf' : imagem ? 'image' : 'other');
    this.carregandoPreview.set(true);
    this.previewAberto.set(true);
    this.service.baixarAnexo(id, anexo.id, anexo.nomeArquivo).subscribe({
      next: (resposta) => {
        if (resposta.body) {
          let tipo = resposta.body.type;
          if (!tipo || tipo === 'application/octet-stream') {
            tipo = pdf ? 'application/pdf' : imagem ? (nome.endsWith('.png') ? 'image/png' : 'image/jpeg') : tipo;
          }
          const url = URL.createObjectURL(new Blob([resposta.body], { type: tipo }));
          this.previewBruto.set(url);
          this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        }
        this.carregandoPreview.set(false);
      },
      error: (e) => {
        this.carregandoPreview.set(false);
        this.previewAberto.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected fecharPreview(): void {
    this.previewAberto.set(false);
    const url = this.previewBruto();
    if (url) URL.revokeObjectURL(url);
    this.previewBruto.set(null);
    this.previewUrl.set(null);
  }

  protected abrirPreviewNovaAba(): void {
    const url = this.previewBruto();
    if (url) window.open(url, '_blank');
  }

  protected baixarAnexo(anexo: AnexoObraResponse): void {
    const id = this.obra()?.id;
    if (!id) return;
    this.service.baixarAnexo(id, anexo.id, anexo.nomeArquivo).subscribe({
      next: (resposta) => {
        if (resposta.body) {
          this.service.baixarArquivoBlob(resposta.body, this.service.extrairNomeArquivoDeResponse(resposta, anexo.nomeArquivo));
        }
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async removerAnexo(anexo: AnexoObraResponse): Promise<void> {
    const id = this.obra()?.id;
    if (!id) return;
    const ok = await this.confirmacao.confirm({
      title: 'Remover anexo',
      message: `${anexo.nomeArquivo} será removido da obra.`,
      confirmLabel: 'Remover',
      variant: 'destructive'
    });
    if (!ok) return;
    this.service.removerAnexo(id, anexo.id).subscribe({
      next: () => {
        this.notificacoes.success('Anexo removido.');
        this.recarregar();
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mapa: a obra em destaque e as obras próximas
  // ═══════════════════════════════════════════════════════════════════════

  private renderizarMapa(): void {
    const el = this.mapEl()?.nativeElement;
    const o = this.obra();
    if (!el || !o || o.latitude == null || o.longitude == null || typeof L === 'undefined') return;
    this.destruirMapa();
    const estilo = getComputedStyle(document.documentElement);
    const marca = estilo.getPropertyValue('--geo-brand').trim() || 'currentColor';
    const neutro = estilo.getPropertyValue('--geo-foreground-muted').trim() || 'gray';
    const superficie = estilo.getPropertyValue('--geo-surface').trim() || 'white';
    try {
      this.leafletMap = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: false });
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this.leafletMap);
      const pontos: [number, number][] = [[o.latitude, o.longitude]];
      for (const p of this.dados(this.proximas()) ?? []) {
        pontos.push([p.latitude, p.longitude]);
        L.circleMarker([p.latitude, p.longitude], { radius: 6, fillColor: neutro, color: superficie, weight: 2, fillOpacity: 0.85 })
          .addTo(this.leafletMap)
          .bindTooltip(`${p.numero} · ${this.km(p.distanciaKm)}`);
      }
      L.circleMarker([o.latitude, o.longitude], { radius: 10, fillColor: marca, color: superficie, weight: 3, fillOpacity: 1 })
        .addTo(this.leafletMap)
        .bindTooltip(`Obra ${o.numero}`);
      if (pontos.length > 1) this.leafletMap.fitBounds(pontos, { padding: [24, 24], maxZoom: 15 });
      else this.leafletMap.setView([o.latitude, o.longitude], 15);
      // O contêiner dos tiles só existe depois que o mapa tem posição.
      if (this.tema.isDarkMode()) tiles.getContainer().style.filter = FILTRO_TILES_ESCURO;
      // Os controles do Leaflet ficam fora do encapsulamento do componente: recebem os tokens aqui.
      for (const botao of Array.from<HTMLElement>(this.leafletMap.zoomControl.getContainer().querySelectorAll('a'))) {
        botao.style.background = superficie;
        botao.style.color = estilo.getPropertyValue('--geo-foreground').trim();
        botao.style.borderColor = estilo.getPropertyValue('--geo-border').trim();
      }
      setTimeout(() => this.leafletMap?.invalidateSize(), 200);
    } catch {
      // Sem Leaflet carregado: o card mostra as coordenadas.
    }
  }

  private destruirMapa(): void {
    this.leafletMap?.remove();
    this.leafletMap = null;
  }
}
