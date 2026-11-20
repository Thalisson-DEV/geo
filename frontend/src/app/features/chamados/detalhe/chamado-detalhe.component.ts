import { DatePipe, DecimalPipe, LowerCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoBooleanControlComponent,
  GeoBreadcrumbItem,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoDialogShellComponent,
  GeoFieldComponent,
  GeoPageHeaderComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextareaComponent,
  GeoTone,
  NotificationService
} from '@geo/ui';
import { SelectModule } from 'primeng/select';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AtualizarAtendimentoRequest,
  Chamado,
  ChamadoPrioridade,
  ChamadoStatus,
  EquipeChamado,
  EvidenciaChamado,
  InteracaoChamado,
  InteracaoChamadoTipo
} from '../../../core/models/chamado.models';
import { UsuarioResponse } from '../../../core/models/iam.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ChamadosService } from '../../../core/services/chamados.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { MencaoTextareaComponent } from '../../../shared/components/mencoes/mencao-textarea.component';
import {
  LIMITE_MARCACOES_POR_MENSAGEM,
  extrairMarcacoes
} from '../../../shared/components/mencoes/mencoes.util';
import { TextoMarcacoesComponent } from '../../../shared/components/mencoes/texto-marcacoes.component';
import {
  CHAMADO_PRIORIDADE_LABELS,
  CHAMADO_STATUS_LABELS,
  INTERACAO_LABELS,
  PRIORIDADE_OPTIONS,
  contagemSlaLabel,
  formatarBytes,
  prazoIcon,
  prazoTom,
  prioridadeTom,
  statusTom
} from '../chamados-ui';

import { NavigationHistoryService } from '../../../core/navigation/navigation-history.service';
const UMA_HORA = 3_600_000;
const UM_DIA = 24 * UMA_HORA;
const LIMITE_ANEXOS = 10;
const LIMITE_MENSAGEM = 5000;
const TAMANHO_MAXIMO_ANEXO = 15 * 1024 * 1024;
const EXTENSOES_ACEITAS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt', 'log', 'doc', 'docx', 'xls', 'xlsx'];
const ENCERRADOS: readonly ChamadoStatus[] = ['FECHADO', 'CANCELADO'];

/** Transições que a central pode aplicar a partir de cada status. */
const TRANSICOES: Partial<Record<ChamadoStatus, ChamadoStatus[]>> = {
  ABERTO: ['EM_ATENDIMENTO', 'CANCELADO'],
  EM_ATENDIMENTO: ['AGUARDANDO_SOLICITANTE', 'RESOLVIDO', 'CANCELADO'],
  AGUARDANDO_SOLICITANTE: ['EM_ATENDIMENTO', 'RESOLVIDO', 'CANCELADO'],
  RESOLVIDO: ['FECHADO', 'EM_ATENDIMENTO']
};

const ICONE_STATUS: Record<ChamadoStatus, string> = {
  ABERTO: 'pi-inbox',
  EM_ATENDIMENTO: 'pi-cog',
  AGUARDANDO_SOLICITANTE: 'pi-hourglass',
  RESOLVIDO: 'pi-check-circle',
  FECHADO: 'pi-lock',
  CANCELADO: 'pi-ban'
};

const ICONE_PRIORIDADE: Record<ChamadoPrioridade, string> = {
  BAIXA: 'pi-angle-down',
  NORMAL: 'pi-minus',
  ALTA: 'pi-angle-up',
  CRITICA: 'pi-angle-double-up'
};

const ICONE_INTERACAO: Record<InteracaoChamadoTipo, string> = {
  ABERTURA: 'pi pi-plus-circle',
  MENSAGEM_PUBLICA: 'pi pi-comment',
  COMENTARIO_INTERNO: 'pi pi-lock',
  ALTERACAO_STATUS: 'pi pi-sync',
  ALTERACAO_PRIORIDADE: 'pi pi-flag',
  ATRIBUICAO: 'pi pi-user',
  ENCAMINHAMENTO: 'pi pi-send',
  REABERTURA: 'pi pi-replay',
  CANCELAMENTO: 'pi pi-times-circle',
  EVIDENCIA_ADICIONADA: 'pi pi-paperclip'
};

/** Como cada transição aparece como ação da central (verbo, ícone, tom do botão). */
interface AcaoCentral {
  status: ChamadoStatus;
  label: string;
  icon: string;
  variant: 'primary' | 'secondary' | 'outline' | 'destructive' | 'success';
}

interface Situacao {
  tom: GeoTone;
  icone: string;
  titulo: string;
  texto: string;
}

interface CartaoResumo {
  rotulo: string;
  icone: string;
  valor: string;
  legenda: string;
  tom: GeoTone;
}

interface EventoTimeline {
  id: string;
  tipo: InteracaoChamadoTipo;
  rotulo: string;
  icone: string;
  interno: boolean;
  data: string;
  mensagem?: string | null;
  detalhe: string | null;
  autor: string;
}

/**
 * Detalhe do chamado, no padrão dos relatórios do GEO: cabeçalho com a situação, faixa do que
 * se espera de quem lê, cartões de prazo, dados gerais, linha do tempo, conversa, evidências e as
 * ações da central. Serve às rotas `/chamados/meus/:id` (solicitante) e `/chamados/fila/:id`
 * (central, `data.modo = 'central'`).
 */
@Component({
  selector: 'app-chamado-detalhe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    LowerCasePipe,
    FormsModule,
    SelectModule,
    GeoAsyncStateComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDialogShellComponent,
    GeoFieldComponent,
    GeoPageHeaderComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextareaComponent,
    MencaoTextareaComponent,
    TextoMarcacoesComponent
  ],
  templateUrl: './chamado-detalhe.component.html',
  styleUrl: './chamado-detalhe.component.css'
})
export class ChamadoDetalheComponent {
  private readonly service = inject(ChamadosService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly arquivoInput = viewChild<ElementRef<HTMLInputElement>>('arquivoInput');
  private requisicaoAtual = 0;

  private readonly equipeLookup = new RemoteLookup<EquipeChamado>(
    {
      identify: (equipe) => equipe.id,
      selectedKeys: () => {
        const id = this.equipeAtendimentoId();
        return id ? [id] : [];
      },
      load: ({ query, page, size }) =>
        this.service.listarEquipes({ ativo: true, buscaGlobal: query, page, size, sort: 'nome,asc' })
    },
    this.destroyRef
  );
  private readonly usuarioLookup = new RemoteLookup<UsuarioResponse>(
    {
      identify: (usuario) => usuario.id,
      selectedKeys: () => {
        const id = this.responsavelAtendimentoId();
        return id ? [id] : [];
      },
      load: ({ query, page, size }) =>
        this.usuariosService.listarUsuarios({ ativo: true, buscaGlobal: query, page, size, sort: 'login,asc' })
    },
    this.destroyRef
  );

  protected readonly modoCentral = this.route.snapshot.data['modo'] === 'central';
  protected readonly rotaLista = this.modoCentral ? '/chamados/fila' : '/chamados/meus';
  protected readonly breadcrumb: GeoBreadcrumbItem[] = [
    { label: 'Chamados' },
    { label: this.modoCentral ? 'Fila da central' : 'Meus chamados', route: this.rotaLista },
    { label: 'Detalhe' }
  ];

  // ── Estado de dados ───────────────────────────────────────────────────────────
  protected readonly chamado = signal<Chamado | null>(null);
  protected readonly interacoes = signal<InteracaoChamado[]>([]);
  protected readonly carregando = signal(true);
  /** Falha da última carga. Sem dados, vira estado de erro; com dados, aviso de desatualização. */
  protected readonly erro = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly equipes = this.equipeLookup.items;
  protected readonly equipesLoading = this.equipeLookup.loading;
  protected readonly usuarios = this.usuarioLookup.items;
  protected readonly usuariosLoading = this.usuarioLookup.loading;

  // ── Composer ──────────────────────────────────────────────────────────────────
  protected readonly mensagem = signal('');
  protected readonly interno = signal(false);
  /** `detail` do 422 de marcação — fica junto ao composer, sem limpar o que foi digitado. */
  protected readonly erroMarcacao = signal<string | null>(null);

  // ── Diálogos ──────────────────────────────────────────────────────────────────
  protected readonly dialogAtendimento = signal(false);
  protected readonly dialogReabertura = signal(false);
  protected readonly statusAtendimento = signal<ChamadoStatus | null>(null);
  protected readonly prioridadeAtendimento = signal<ChamadoPrioridade | null>(null);
  protected readonly equipeAtendimentoId = signal<string | null>(null);
  protected readonly responsavelAtendimentoId = signal<string | null>(null);
  protected readonly solucao = signal('');
  protected readonly erroSolucao = signal<string | undefined>(undefined);
  protected readonly motivoReabertura = signal('');

  protected readonly prioridadeOptions: GeoSelectOption<ChamadoPrioridade>[] = PRIORIDADE_OPTIONS;
  protected readonly limiteAnexos = LIMITE_ANEXOS;
  protected readonly limiteMensagem = LIMITE_MENSAGEM;
  protected readonly extensoesAceitas = EXTENSOES_ACEITAS.map((ext) => `.${ext}`).join(',');
  protected readonly formatarBytes = formatarBytes;
  protected readonly statusLabel = (status: ChamadoStatus) => CHAMADO_STATUS_LABELS[status];
  protected readonly statusTom = statusTom;
  protected readonly statusIcone = (status: ChamadoStatus) => ICONE_STATUS[status];
  protected readonly prioridadeLabel = (prioridade: ChamadoPrioridade) => CHAMADO_PRIORIDADE_LABELS[prioridade];
  protected readonly prioridadeTom = prioridadeTom;
  protected readonly prioridadeIcone = (prioridade: ChamadoPrioridade) => ICONE_PRIORIDADE[prioridade];

  // ── Regras de exibição ────────────────────────────────────────────────────────

  protected readonly podeResponder = computed(() => {
    const status = this.chamado()?.status;
    if (!status) return false;
    if (this.modoCentral) return !ENCERRADOS.includes(status);
    return status === 'ABERTO' || status === 'EM_ATENDIMENTO' || status === 'AGUARDANDO_SOLICITANTE';
  });

  protected readonly podeAnexar = computed(() => {
    const item = this.chamado();
    return !!item && !ENCERRADOS.includes(item.status) && item.anexos.length < LIMITE_ANEXOS;
  });

  protected readonly podeCancelarMeu = computed(() => {
    const status = this.chamado()?.status;
    return !this.modoCentral && (status === 'ABERTO' || status === 'AGUARDANDO_SOLICITANTE');
  });

  /** Fim da janela de reabertura do solicitante; `null` quando não se aplica. */
  protected readonly limiteReabertura = computed<Date | null>(() => {
    const item = this.chamado();
    if (this.modoCentral || item?.status !== 'RESOLVIDO' || !item.dataResolucao) return null;
    return new Date(new Date(item.dataResolucao).getTime() + item.prazoReaberturaHoras * UMA_HORA);
  });

  protected readonly podeReabrirMeu = computed(() => {
    const limite = this.limiteReabertura();
    return !!limite && Date.now() <= limite.getTime();
  });

  /**
   * Comentário interno: texto de circulação restrita.
   *
   * Vale tanto para o envio quanto para o autocomplete de `@` — com ele ligado, só aparece quem
   * tem `chamado:manage` e conseguiria abrir o texto.
   */
  protected readonly modoInterno = computed(
    () => this.modoCentral && (this.chamado()?.status === 'RESOLVIDO' || this.interno())
  );

  protected readonly statusDisponiveis = computed<GeoSelectOption<ChamadoStatus>[]>(() => {
    const status = this.chamado()?.status;
    return (status ? TRANSICOES[status] ?? [] : []).map((value) => ({
      value,
      label: CHAMADO_STATUS_LABELS[value]
    }));
  });

  /** As transições disponíveis apresentadas como verbos, na ordem de uso mais provável. */
  protected readonly acoesCentral = computed<AcaoCentral[]>(() => {
    if (!this.modoCentral) return [];
    const atual = this.chamado()?.status;
    return this.statusDisponiveis().map(({ value }) => {
      switch (value) {
        case 'EM_ATENDIMENTO':
          return atual === 'ABERTO'
            ? { status: value, label: 'Iniciar atendimento', icon: 'pi pi-play', variant: 'primary' }
            : { status: value, label: 'Retomar atendimento', icon: 'pi pi-replay', variant: 'outline' };
        case 'AGUARDANDO_SOLICITANTE':
          return { status: value, label: 'Aguardar solicitante', icon: 'pi pi-hourglass', variant: 'outline' };
        case 'RESOLVIDO':
          return { status: value, label: 'Resolver chamado', icon: 'pi pi-check', variant: 'success' };
        case 'FECHADO':
          return { status: value, label: 'Fechar chamado', icon: 'pi pi-lock', variant: 'primary' };
        default:
          return { status: value, label: 'Cancelar chamado', icon: 'pi pi-ban', variant: 'destructive' };
      }
    });
  });

  protected readonly tituloAtendimento = computed(() => {
    const status = this.statusAtendimento();
    const acao = status && this.acoesCentral().find((item) => item.status === status);
    return acao ? acao.label : 'Atualizar atendimento';
  });

  protected readonly responsaveisDisponiveis = computed(() => {
    const equipe = this.equipes().find((item) => item.id === this.equipeAtendimentoId());
    const usuarios = this.usuarios();
    if (!equipe?.membros?.length) return usuarios;
    return usuarios.filter((usuario) => equipe.membros.includes(usuario.id));
  });

  private readonly loginPorId = computed(
    () => new Map(this.usuarios().map((usuario) => [usuario.id, usuario.login]))
  );

  /** O que está acontecendo agora e o que se espera de quem lê. */
  protected readonly situacao = computed<Situacao | null>(() => {
    const item = this.chamado();
    if (!item) return null;
    const equipe = item.equipeAtendimento.nome;
    const central = this.modoCentral;
    switch (item.status) {
      case 'ABERTO':
        return {
          tom: 'info',
          icone: 'pi-inbox',
          titulo: 'Aguardando atendimento',
          texto: central
            ? `Na fila da equipe ${equipe}. Inicie o atendimento ou encaminhe para outra equipe.`
            : `Seu chamado está na fila da equipe ${equipe}. Você será avisado quando houver resposta.`
        };
      case 'EM_ATENDIMENTO':
        return {
          tom: 'brand',
          icone: 'pi-cog',
          titulo: 'Em atendimento',
          texto: central
            ? `Responsável: ${this.nomeUsuario(item.usuarioResponsavelId)}. Registre o andamento na conversa abaixo.`
            : `A equipe ${equipe} está trabalhando no seu chamado. Acompanhe e complemente pela conversa abaixo.`
        };
      case 'AGUARDANDO_SOLICITANTE':
        return {
          tom: 'warning',
          icone: 'pi-hourglass',
          titulo: central ? 'Aguardando o solicitante' : 'A equipe aguarda sua resposta',
          texto:
            (central
              ? 'O atendimento depende de um retorno de quem abriu o chamado.'
              : 'Responda na conversa abaixo para que o atendimento continue.') +
            (item.slaPausado ? ' A contagem do prazo está pausada.' : '')
        };
      case 'RESOLVIDO': {
        const resolvido = `Resolvido em ${this.dataHora(item.dataResolucao)}.`;
        if (central) {
          return {
            tom: 'success',
            icone: 'pi-check-circle',
            titulo: 'Resolvido',
            texto: `${resolvido} Feche o chamado ou retome o atendimento. Nesta etapa só cabem comentários internos.`
          };
        }
        const limite = this.limiteReabertura();
        return {
          tom: 'success',
          icone: 'pi-check-circle',
          titulo: 'Resolvido',
          texto: this.podeReabrirMeu() && limite
            ? `${resolvido} Se o problema voltar, você pode reabrir até ${this.dataHora(limite.toISOString())}.`
            : `${resolvido} O prazo para reabrir já terminou; se precisar, abra um novo chamado.`
        };
      }
      case 'FECHADO':
        return {
          tom: 'neutral',
          icone: 'pi-lock',
          titulo: 'Fechado',
          texto: `Encerrado em ${this.dataHora(item.dataFechamento ?? item.dataResolucao)}. Não aceita novas mensagens nem evidências.`
        };
      default:
        return {
          tom: 'neutral',
          icone: 'pi-ban',
          titulo: 'Cancelado',
          texto: 'Este chamado foi cancelado e não aceita novas mensagens nem evidências.'
        };
    }
  });

  /** Prazo de resolução estourado em chamado ainda aberto — merece destaque próprio. */
  protected readonly prazoEstourado = computed(() => {
    const item = this.chamado();
    return !!item && item.slaResolucaoVencido && !['RESOLVIDO', ...ENCERRADOS].includes(item.status);
  });

  protected readonly cartoes = computed<CartaoResumo[]>(() => {
    const item = this.chamado();
    if (!item) return [];
    return [this.cartaoPrimeiraResposta(item), this.cartaoResolucao(item), this.cartaoTempo(item)];
  });

  protected readonly eventos = computed<EventoTimeline[]>(() =>
    this.interacoes().map((interacao) => ({
      id: interacao.id,
      tipo: interacao.tipo,
      rotulo: INTERACAO_LABELS[interacao.tipo],
      icone: ICONE_INTERACAO[interacao.tipo] ?? 'pi pi-circle',
      interno: interacao.interno,
      data: interacao.dataEvento,
      mensagem: interacao.mensagem,
      detalhe: this.detalheInteracao(interacao),
      autor: this.nomeUsuario(interacao.usuarioAutorId)
    }))
  );

  protected readonly resumoEventos = computed(() => {
    const total = this.interacoes().length;
    const internos = this.modoCentral ? this.interacoes().filter((item) => item.interno).length : 0;
    const base = total === 1 ? '1 evento' : `${total} eventos`;
    return internos ? `${base} · ${internos} interno${internos === 1 ? '' : 's'}` : base;
  });

  constructor() {
    this.carregar();
    if (this.modoCentral) {
      this.equipeLookup.open();
      this.usuarioLookup.open();
    }
  }

  // ── Carga ─────────────────────────────────────────────────────────────────────

  protected carregar(): void {
    const requisicao = ++this.requisicaoAtual;
    this.carregando.set(true);
    forkJoin({
      chamado: this.service.buscar(this.id),
      interacoes: this.service.listarInteracoes(this.id)
    }).subscribe({
      next: ({ chamado, interacoes }) => {
        if (requisicao !== this.requisicaoAtual) return;
        this.chamado.set(chamado);
        this.interacoes.set(interacoes);
        this.erro.set(null);
        this.carregando.set(false);
        this.semearEquipe(chamado);
        this.carregarUsuariosPorIds([
          chamado.usuarioSolicitanteId,
          chamado.usuarioResponsavelId ?? '',
          ...interacoes.flatMap((interacao) => [
            interacao.usuarioAutorId,
            interacao.responsavelAnteriorId ?? '',
            interacao.responsavelNovoId ?? ''
          ])
        ]);
      },
      error: (error) => {
        if (requisicao !== this.requisicaoAtual) return;
        this.carregando.set(false);
        this.erro.set(getErrorMessage(error));
      }
    });
  }

  protected voltar(): void {
    this.navegacao.back([this.rotaLista]);
  }

  // ── Conversa ──────────────────────────────────────────────────────────────────

  protected enviarMensagem(): void {
    const texto = this.mensagem().trim();
    if (!texto || this.saving()) return;
    if (texto.length > LIMITE_MENSAGEM) {
      this.notificacoes.warning('Use no máximo 5.000 caracteres.', { title: 'Mensagem muito longa' });
      return;
    }
    // O servidor recusa a mensagem inteira acima do teto; barrar aqui poupa a ida e volta.
    if (extrairMarcacoes(texto).length > LIMITE_MARCACOES_POR_MENSAGEM) {
      this.erroMarcacao.set(`Marque no máximo ${LIMITE_MARCACOES_POR_MENSAGEM} pessoas por mensagem.`);
      return;
    }
    const interno = this.modoInterno();
    this.erroMarcacao.set(null);
    this.saving.set(true);
    const request = this.modoCentral
      ? this.service.adicionarInteracao(this.id, { mensagem: texto, interno })
      : this.service.responderComoSolicitante(this.id, texto);
    request.subscribe({
      next: () => {
        this.mensagem.set('');
        this.interno.set(false);
        this.saving.set(false);
        this.notificacoes.success(interno ? 'Comentário interno registrado.' : 'Mensagem enviada.');
        this.carregar();
      },
      error: (error) => {
        // 422 é a invariante de marcação (visibilidade restrita ou teto de 10). Nada foi gravado:
        // preserve o texto para a pessoa remover ou trocar o `@` e reenviar.
        if (error?.status === 422) {
          this.saving.set(false);
          this.erroMarcacao.set(getErrorMessage(error));
          return;
        }
        this.tratarErro(error, 'Não foi possível enviar a mensagem');
      }
    });
  }

  // ── Atendimento (central) ─────────────────────────────────────────────────────

  protected abrirAtendimento(status?: ChamadoStatus): void {
    const item = this.chamado();
    if (!item) return;
    this.statusAtendimento.set(status ?? null);
    this.prioridadeAtendimento.set(item.prioridade);
    this.equipeAtendimentoId.set(item.equipeAtendimento.id);
    this.responsavelAtendimentoId.set(item.usuarioResponsavelId ?? null);
    this.solucao.set(status === 'RESOLVIDO' ? item.solucao ?? '' : '');
    this.erroSolucao.set(undefined);
    this.carregarEquipeCompleta(item.equipeAtendimento.id);
    this.dialogAtendimento.set(true);
  }

  protected salvarAtendimento(): void {
    const item = this.chamado();
    if (!item || this.saving()) return;
    const status = this.statusAtendimento();
    if (status === 'RESOLVIDO' && !this.solucao().trim()) {
      this.erroSolucao.set('Descreva a solução antes de resolver o chamado.');
      return;
    }
    const request: AtualizarAtendimentoRequest = {};
    const prioridade = this.prioridadeAtendimento();
    const equipeId = this.equipeAtendimentoId();
    const responsavelId = this.responsavelAtendimentoId();
    if (status) request.status = status;
    if (prioridade && prioridade !== item.prioridade) request.prioridade = prioridade;
    if (equipeId && equipeId !== item.equipeAtendimento.id) request.equipeId = equipeId;
    if (responsavelId && responsavelId !== item.usuarioResponsavelId) request.responsavelId = responsavelId;
    if (status === 'RESOLVIDO') request.solucao = this.solucao().trim();
    if (!Object.keys(request).length) {
      this.notificacoes.warning('Altere ao menos um dado do atendimento.', { title: 'Nenhuma alteração' });
      return;
    }
    this.saving.set(true);
    this.service.atualizarAtendimento(this.id, request).subscribe({
      next: () => {
        this.saving.set(false);
        this.fecharAtendimento();
        this.notificacoes.success('Atendimento atualizado.');
        this.carregar();
      },
      error: (error) => this.tratarErro(error, 'Não foi possível atualizar o atendimento')
    });
  }

  protected definirSolucao(valor: string): void {
    this.solucao.set(valor);
    if (valor.trim()) this.erroSolucao.set(undefined);
  }

  protected fecharAtendimento(): void {
    this.dialogAtendimento.set(false);
    this.statusAtendimento.set(null);
    this.prioridadeAtendimento.set(null);
    this.equipeAtendimentoId.set(null);
    this.responsavelAtendimentoId.set(null);
    this.solucao.set('');
    this.erroSolucao.set(undefined);
  }

  protected openEquipes(): void {
    this.equipeLookup.open();
  }

  protected searchEquipes(event: { filter?: string }): void {
    this.equipeLookup.search(event.filter ?? '');
  }

  protected loadMoreEquipes(): void {
    this.equipeLookup.loadNext();
  }

  protected selecionarEquipe(id: string | null): void {
    this.equipeAtendimentoId.set(id);
    if (!id) return;
    const equipe = this.equipes().find((item) => item.id === id);
    if (equipe?.membros?.length) this.carregarUsuariosPorIds(equipe.membros);
    else this.carregarEquipeCompleta(id);
  }

  protected openUsuarios(): void {
    this.usuarioLookup.open();
  }

  protected searchUsuarios(event: { filter?: string }): void {
    this.usuarioLookup.search(event.filter ?? '');
  }

  protected loadMoreUsuarios(): void {
    this.usuarioLookup.loadNext();
  }

  // ── Ações do solicitante ──────────────────────────────────────────────────────

  protected async confirmarCancelamento(): Promise<void> {
    const item = this.chamado();
    if (!item) return;
    const confirmado = await this.confirmacao.confirm({
      title: 'Cancelar chamado',
      message: `O chamado ${item.protocolo} será cancelado e não poderá ser reaberto. Deseja continuar?`,
      confirmLabel: 'Cancelar chamado',
      cancelLabel: 'Voltar',
      variant: 'destructive'
    });
    if (confirmado) this.cancelarMeu();
  }

  protected abrirReabertura(): void {
    this.motivoReabertura.set('');
    this.dialogReabertura.set(true);
  }

  protected reabrirMeu(): void {
    const motivo = this.motivoReabertura().trim();
    if (!motivo || this.saving()) return;
    this.saving.set(true);
    this.service.reabrirMeu(this.id, motivo).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogReabertura.set(false);
        this.motivoReabertura.set('');
        this.notificacoes.success('Chamado reaberto.');
        this.carregar();
      },
      error: (error) => this.tratarErro(error, 'Não foi possível reabrir o chamado')
    });
  }

  // ── Evidências ────────────────────────────────────────────────────────────────

  protected escolherArquivo(): void {
    this.arquivoInput()?.nativeElement.click();
  }

  protected selecionarAnexo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    const erro = this.validarArquivo(arquivo);
    if (erro) {
      this.notificacoes.warning(erro, { title: 'Arquivo não aceito' });
      return;
    }
    this.uploading.set(true);
    this.service.anexar(this.id, arquivo).subscribe({
      next: () => {
        this.uploading.set(false);
        this.notificacoes.success(`Evidência “${arquivo.name}” adicionada.`);
        this.carregar();
      },
      error: (error) => {
        this.uploading.set(false);
        this.tratarErro(error, 'Não foi possível anexar a evidência');
      }
    });
  }

  protected baixar(anexo: EvidenciaChamado): void {
    this.service.baixarAnexo(this.id, anexo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = anexo.nomeArquivo;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (error) => this.tratarErro(error, 'Não foi possível baixar a evidência')
    });
  }

  protected iconeArquivo(anexo: EvidenciaChamado): string {
    const tipo = anexo.contentType ?? '';
    if (tipo.startsWith('image/')) return 'pi pi-image';
    if (tipo === 'application/pdf') return 'pi pi-file-pdf';
    if (tipo.includes('sheet') || tipo.includes('excel')) return 'pi pi-file-excel';
    if (tipo.includes('word')) return 'pi pi-file-word';
    return 'pi pi-file';
  }

  // ── Apoio ─────────────────────────────────────────────────────────────────────

  protected nomeUsuario(id?: string | null): string {
    if (!id) return 'Não atribuído';
    return this.loginPorId().get(id) ?? id;
  }

  private detalheInteracao(interacao: InteracaoChamado): string | null {
    if (interacao.statusAnterior && interacao.statusNovo) {
      return `${CHAMADO_STATUS_LABELS[interacao.statusAnterior]} → ${CHAMADO_STATUS_LABELS[interacao.statusNovo]}`;
    }
    if (this.modoCentral && interacao.responsavelNovoId) {
      const anterior = interacao.responsavelAnteriorId ? this.nomeUsuario(interacao.responsavelAnteriorId) : 'sem responsável';
      return `Responsável: ${anterior} → ${this.nomeUsuario(interacao.responsavelNovoId)}`;
    }
    return null;
  }

  private cartaoPrimeiraResposta(item: Chamado): CartaoResumo {
    const base = { rotulo: 'Primeira resposta', icone: 'pi pi-reply' };
    if (item.dataPrimeiraResposta) {
      return {
        ...base,
        valor: this.dataHora(item.dataPrimeiraResposta),
        legenda: item.slaPrimeiraRespostaVencido ? 'Respondido fora do prazo' : 'Respondido no prazo',
        tom: item.slaPrimeiraRespostaVencido ? 'danger' : 'success'
      };
    }
    if (item.status === 'CANCELADO') {
      return { ...base, valor: '—', legenda: 'Cancelado sem resposta', tom: 'neutral' };
    }
    return {
      ...base,
      valor: this.dataHora(item.dataLimitePrimeiraResposta),
      legenda: item.slaPrimeiraRespostaVencido
        ? `Prazo estourado ${this.relativo(item.dataLimitePrimeiraResposta)}`
        : `Prazo · ${this.relativo(item.dataLimitePrimeiraResposta)}`,
      tom: item.slaPrimeiraRespostaVencido ? 'danger' : 'neutral'
    };
  }

  private cartaoResolucao(item: Chamado): CartaoResumo {
    const concluido = item.status === 'RESOLVIDO' || item.status === 'FECHADO';
    const emCurso = !concluido && item.status !== 'CANCELADO' && !item.slaPausado;
    return {
      rotulo: 'Resolução',
      icone: prazoIcon(item),
      valor: this.dataHora(item.dataLimiteResolucao),
      legenda: emCurso
        ? `${contagemSlaLabel(item)} · ${this.relativo(item.dataLimiteResolucao)}`
        : contagemSlaLabel(item),
      tom: prazoTom(item)
    };
  }

  private cartaoTempo(item: Chamado): CartaoResumo {
    const fim = item.dataResolucao ?? item.dataFechamento ?? null;
    const cancelado = item.status === 'CANCELADO' && !fim;
    const referencia = fim ? new Date(fim).getTime() : Date.now();
    const pausa = item.totalSegundosPausaSla / 3600;
    const textoPausa = pausa >= 0.1 ? `${pausa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h em pausa` : 'sem pausas';
    return {
      rotulo: fim ? 'Tempo até resolver' : cancelado ? 'Tempo de atendimento' : 'Aberto há',
      icone: 'pi pi-stopwatch',
      valor: cancelado ? '—' : this.duracao(referencia - new Date(item.dataAbertura).getTime()),
      legenda: item.slaPausado ? `Contagem pausada · ${textoPausa}` : textoPausa,
      tom: 'neutral'
    };
  }

  /** Busca a equipe com os membros para restringir a lista de responsáveis. */
  private carregarEquipeCompleta(equipeId: string): void {
    this.service.buscarEquipe(equipeId).subscribe({
      next: (equipe) => {
        this.equipeLookup.setSeed([equipe]);
        if (equipe.membros?.length) this.carregarUsuariosPorIds(equipe.membros);
      },
      error: () => {}
    });
  }

  private semearEquipe(chamado: Chamado): void {
    const resumo = chamado.equipeAtendimento;
    if (!this.equipes().some((equipe) => equipe.id === resumo.id)) {
      this.equipeLookup.setSeed([
        { id: resumo.id, codigo: resumo.codigo, nome: resumo.nome, membros: [], ativo: true, dataCriacao: '' }
      ]);
    }
    if (this.modoCentral) this.carregarEquipeCompleta(resumo.id);
  }

  private carregarUsuariosPorIds(ids: readonly string[]): void {
    const carregados = new Set(this.usuarios().map((usuario) => usuario.id));
    const faltantes = [...new Set(ids)].filter((id) => id && !carregados.has(id));
    if (!faltantes.length) return;
    forkJoin(
      faltantes.map((id) => this.usuariosService.buscarUsuarioPorId(id).pipe(catchError(() => of(null))))
    ).subscribe((usuarios) =>
      this.usuarioLookup.setSeed(usuarios.filter((usuario): usuario is UsuarioResponse => usuario !== null))
    );
  }

  private cancelarMeu(): void {
    this.saving.set(true);
    this.service.cancelarMeu(this.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.notificacoes.success('Chamado cancelado.');
        this.carregar();
      },
      error: (error) => this.tratarErro(error, 'Não foi possível cancelar o chamado')
    });
  }

  private tratarErro(error: any, titulo: string): void {
    this.saving.set(false);
    if (error?.status === 409) {
      this.fecharAtendimento();
      this.carregar();
      this.notificacoes.warning('Os dados foram recarregados. Revise antes de tentar novamente.', {
        title: 'O chamado foi atualizado por outra pessoa'
      });
      return;
    }
    this.notificacoes.error(getErrorMessage(error), { title: titulo });
  }

  private validarArquivo(file: File): string | null {
    if (file.size > TAMANHO_MAXIMO_ANEXO) return 'O tamanho máximo por arquivo é 15 MB.';
    const extensao = file.name.split('.').pop()?.toLowerCase();
    return extensao && EXTENSOES_ACEITAS.includes(extensao) ? null : 'Este formato não é permitido.';
  }

  private dataHora(valor?: string | null): string {
    return valor
      ? new Date(valor).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '—';
  }

  /** "faltam 3 h" / "há 2 dias" em relação a agora. */
  private relativo(valor: string): string {
    const diferenca = new Date(valor).getTime() - Date.now();
    const texto = this.duracao(Math.abs(diferenca));
    return diferenca >= 0 ? `faltam ${texto}` : `há ${texto}`;
  }

  private duracao(ms: number): string {
    if (ms < UMA_HORA) {
      const minutos = Math.max(1, Math.round(ms / 60_000));
      return `${minutos} min`;
    }
    if (ms < UM_DIA) return `${Math.floor(ms / UMA_HORA)} h`;
    const dias = Math.floor(ms / UM_DIA);
    const horas = Math.floor((ms % UM_DIA) / UMA_HORA);
    const textoDias = dias === 1 ? '1 dia' : `${dias} dias`;
    return horas ? `${textoDias} e ${horas} h` : textoDias;
  }
}
