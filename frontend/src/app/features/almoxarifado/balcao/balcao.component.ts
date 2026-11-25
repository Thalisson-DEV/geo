import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoAutocompleteComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoDatepickerComponent,
  GeoDateValue,
  GeoDrawerComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoPageHeaderComponent,
  GeoRowDetailDirective,
  GeoSegmentedComponent,
  GeoSegmentedOption,
  GeoSelectComponent,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService,
} from '@geo/ui';
import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RemoteLookup as CursorRemoteLookup } from '../../../core/lookup/store/remote-lookup';
import {
  AtendimentoEquipe,
  AtendimentoResumo,
  EquipeNoBalcao,
  PainelBalcao,
  PessoaBalcao,
  RetiradaObra,
} from '../../../core/models/balcao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { BalcaoService } from '../../../core/services/balcao.service';
import { SolicitacaoTecnicaAssinaturaComponent } from '../solicitacoes-material/solicitacao-tecnica-assinatura/solicitacao-tecnica-assinatura.component';
import {
  LinhaDevolucao,
  QuantidadesRetirada,
  chaveLinha,
  juntarFaltas,
  linhasDevolucao,
  montarDevolucao,
  montarRetirada,
  numeroBr,
  pendenciasComprovante,
  quantidadesIniciais,
  resumoRetirada,
} from './balcao.logic';
import { FotoCapturaComponent } from './foto-captura.component';
import { dataIso, dataLocal } from '../../../shared/listagem/listagem';
import { FaixaParte, FaixaSituacaoComponent } from '../rotina-ui/faixa-situacao.component';

type Modo = 'retirada' | 'devolucao';
type Visao = 'quadro' | 'fila' | 'registro';
type Atalho = 'todas' | 'retirar' | 'devolver' | 'negativo' | 'atendidas';
/** Situação da equipe no dia: o que falta (ou não) ela fazer no balcão. */
type SituacaoDia = 'atrasada' | 'retirar' | 'devolver' | 'concluida' | 'livre';

const ROTULO_DIA: Record<SituacaoDia, string> = {
  atrasada: 'Retirada atrasada',
  retirar: 'Vem retirar',
  devolver: 'Tem o que devolver',
  concluida: 'Atendida hoje',
  livre: 'Sem movimento',
};
const TOM_DIA: Record<SituacaoDia, FaixaParte['tom']> = {
  atrasada: 'warning',
  retirar: 'info',
  devolver: 'neutral',
  concluida: 'success',
  livre: 'subtle',
};
const ORDEM_DIA: SituacaoDia[] = ['atrasada', 'retirar', 'devolver', 'concluida', 'livre'];

/** Uma célula do quadro: o que a equipe tem a fazer naquele turno do balcão, ou o que já fez. */
interface Celula {
  estado: 'pendente' | 'feita' | 'nada';
  texto: string;
  detalhe: string | null;
  feito: AtendimentoResumo | null;
  alerta: string | null;
}

interface LinhaQuadro {
  equipe: EquipeNoBalcao;
  situacao: SituacaoDia;
  retirada: Celula;
  devolucao: Celula;
}

const CHAVE_ALMOX = 'geo.balcao.almoxarifado';

/**
 * Balcão do almoxarifado. A tela é o quadro do dia: uma linha por equipe com os dois momentos do balcão — a
 * retirada da manhã e a devolução do fim do dia. Atender abre a conferência ao lado, já preenchida pelo sistema,
 * em três passos: conferir o material, identificar quem retira (matrícula) e colher assinatura e foto.
 */
@Component({
  selector: 'app-balcao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    GeoAsyncStateComponent,
    GeoAutocompleteComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoDatepickerComponent,
    GeoDrawerComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoPageHeaderComponent,
    GeoRowDetailDirective,
    GeoSegmentedComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    FaixaSituacaoComponent,
    FotoCapturaComponent,
    SolicitacaoTecnicaAssinaturaComponent,
  ],
  templateUrl: './balcao.component.html',
  styleUrl: './balcao.component.css',
})
export class BalcaoComponent {
  private readonly balcao = inject(BalcaoService);
  private readonly almoxarifadoService = inject(AlmoxarifadoService);
  private readonly lookupStore = inject(LookupStore);
  private readonly notificacao = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly num = numeroBr;
  protected readonly hoje = new Date();

  // ── Quadro do dia ─────────────────────────────────────────────────────────
  protected readonly painel = signal<PainelBalcao | null>(null);
  protected readonly carregandoPainel = signal(true);
  protected readonly erroPainel = signal<string | null>(null);

  protected readonly almoxOpcoes = computed(() => (this.painel()?.almoxarifados ?? []).map((a) => ({ label: a.nome, value: a.id })));
  protected readonly feitosHoje = computed(() => this.painel()?.atendimentosHoje ?? []);
  protected readonly linhas = computed<LinhaQuadro[]>(() => {
    const p = this.painel();
    if (!p) return [];
    const feitos = p.atendimentosHoje;
    const ultimo = (idEquipe: string, tipo: 'RETIRADA' | 'DEVOLUCAO') =>
      feitos.filter((a) => a.idEquipe === idEquipe && a.tipo === tipo).sort((a, b) => b.realizadoEm.localeCompare(a.realizadoEm))[0] ?? null;
    return p.equipes
      .map((e) => {
        const retirada = this.celulaRetirada(e, ultimo(e.idEquipe, 'RETIRADA'));
        const devolucao = this.celulaDevolucao(e, ultimo(e.idEquipe, 'DEVOLUCAO'));
        return { equipe: e, retirada, devolucao, situacao: situacaoDia(retirada, devolucao) };
      })
      .sort((a, b) => ORDEM_DIA.indexOf(a.situacao) - ORDEM_DIA.indexOf(b.situacao) || a.equipe.codigo.localeCompare(b.equipe.codigo));
  });
  protected readonly contagem = computed(() => {
    const l = this.linhas();
    return {
      retirar: l.filter((x) => x.retirada.estado === 'pendente').length,
      devolver: l.filter((x) => x.devolucao.estado === 'pendente').length,
      atrasadas: l.filter((x) => x.equipe.retiradaAtrasada && x.retirada.estado === 'pendente').length,
      negativo: l.filter((x) => x.equipe.negativosNoCaminhao > 0).length,
      atendidas: l.filter((x) => x.retirada.feito || x.devolucao.feito).length,
    };
  });

  // ── Recorte do quadro (fica na URL) ─────────────────────────────────────────
  private readonly q = this.route.snapshot.queryParamMap;
  protected readonly visao = signal<Visao>(valorDe(this.q.get('visao'), ['quadro', 'fila', 'registro'], 'quadro'));
  protected readonly atalho = signal<Atalho>(valorDe(this.q.get('atalho'), ['todas', 'retirar', 'devolver', 'negativo', 'atendidas'], 'todas'));
  protected readonly situacao = signal<SituacaoDia | null>(valorDe(this.q.get('situacao'), ORDEM_DIA, null));
  protected readonly busca = signal('');

  protected readonly atalhos = computed(() => {
    const c = this.contagem();
    return [
      { valor: 'todas' as const, rotulo: 'Todas', total: this.linhas().length, icone: null, alerta: false },
      { valor: 'retirar' as const, rotulo: 'Para retirar', total: c.retirar, icone: 'pi pi-arrow-down', alerta: false },
      { valor: 'devolver' as const, rotulo: 'Para devolver', total: c.devolver, icone: 'pi pi-undo', alerta: false },
      { valor: 'negativo' as const, rotulo: 'Com negativo', total: c.negativo, icone: 'pi pi-exclamation-triangle', alerta: true },
      { valor: 'atendidas' as const, rotulo: 'Atendidas hoje', total: c.atendidas, icone: 'pi pi-check', alerta: false },
    ];
  });

  protected readonly linhasVisiveis = computed(() => {
    const a = this.atalho();
    const s = this.situacao();
    const termo = normalizar(this.busca());
    return this.linhas().filter((l) => {
      if (s && l.situacao !== s) return false;
      if (termo && !normalizar(`${l.equipe.codigo} ${l.equipe.encarregado ?? ''} ${l.equipe.base ?? ''}`).includes(termo)) return false;
      switch (a) {
        case 'retirar': return l.retirada.estado === 'pendente';
        case 'devolver': return l.devolucao.estado === 'pendente';
        case 'negativo': return l.equipe.negativosNoCaminhao > 0;
        case 'atendidas': return !!(l.retirada.feito || l.devolucao.feito);
        default: return true;
      }
    });
  });

  /** Fila: duas raias na ordem de atendimento (atrasadas primeiro). */
  protected readonly raias = computed(() => {
    const l = this.linhasVisiveis();
    return [
      { modo: 'retirada' as const, titulo: 'Fila da retirada', icone: 'pi pi-arrow-down', vazio: 'Ninguém para retirar.',
        linhas: l.filter((x) => x.retirada.estado === 'pendente') },
      { modo: 'devolucao' as const, titulo: 'Fila da devolução', icone: 'pi pi-undo', vazio: 'Nenhum caminhão com material para devolver.',
        linhas: l.filter((x) => x.devolucao.estado === 'pendente').sort((a, b) => Number(!!b.devolucao.alerta) - Number(!!a.devolucao.alerta)) },
    ];
  });

  protected readonly partesFaixa = computed<FaixaParte[]>(() =>
    ORDEM_DIA.map((s) => ({ chave: s, rotulo: ROTULO_DIA[s], tom: TOM_DIA[s], total: this.linhas().filter((l) => l.situacao === s).length })),
  );
  protected readonly tituloFaixa = computed(() => {
    const n = this.linhas().length;
    const falta = this.linhas().filter((l) => l.situacao === 'atrasada' || l.situacao === 'retirar' || l.situacao === 'devolver').length;
    if (!n) return 'Nenhuma equipe neste almoxarifado';
    if (!falta) return 'Balcão em dia: nenhuma equipe esperando';
    return `${falta} de ${n} ${n === 1 ? 'equipe ainda passa' : 'equipes ainda passam'} no balcão hoje`;
  });
  protected readonly numerosDia = computed(() => {
    const hoje = this.feitosHoje();
    const ret = hoje.filter((a) => a.tipo === 'RETIRADA');
    const dev = hoje.filter((a) => a.tipo === 'DEVOLUCAO');
    return {
      retiradas: ret.length,
      devolucoes: dev.length,
      itensSaida: ret.reduce((s, a) => s + a.itens.length, 0),
      itensVolta: dev.reduce((s, a) => s + a.itens.length, 0),
    };
  });

  protected readonly visoes = computed<GeoSegmentedOption<Visao>[]>(() => [
    { value: 'quadro', label: 'Quadro', icon: 'pi pi-table' },
    { value: 'fila', label: 'Fila', icon: 'pi pi-list', count: this.contagem().retirar + this.contagem().devolver },
    { value: 'registro', label: 'Registrados', icon: 'pi pi-history', count: this.feitosHoje().length },
  ]);

  // ── Registrados (qualquer dia) ─────────────────────────────────────────────
  protected readonly dataRegistro = signal<string | null>(null);
  protected readonly tipoRegistro = signal<'todos' | 'RETIRADA' | 'DEVOLUCAO'>('todos');
  private readonly registrosDoDia = signal<AtendimentoResumo[] | null>(null);
  protected readonly carregandoRegistro = signal(false);
  protected readonly dataRegistroLocal = computed(() => dataLocal(this.dataRegistro()) ?? this.hoje);
  private readonly baseRegistro = computed(() => (this.dataRegistro() ? this.registrosDoDia() ?? [] : this.feitosHoje()));
  protected readonly tiposRegistro = computed<GeoSegmentedOption<'todos' | 'RETIRADA' | 'DEVOLUCAO'>[]>(() => {
    const b = this.baseRegistro();
    return [
      { value: 'todos', label: 'Tudo', count: b.length },
      { value: 'RETIRADA', label: 'Retiradas', count: b.filter((a) => a.tipo === 'RETIRADA').length },
      { value: 'DEVOLUCAO', label: 'Devoluções', count: b.filter((a) => a.tipo === 'DEVOLUCAO').length },
    ];
  });
  protected readonly registros = computed(() => {
    const t = this.tipoRegistro();
    return [...this.baseRegistro()].filter((a) => t === 'todos' || a.tipo === t).sort((a, b) => b.realizadoEm.localeCompare(a.realizadoEm));
  });
  protected readonly chaveRegistro = (a: AtendimentoResumo) => a.id;
  protected readonly colunasRegistro: GeoDataTableColumn<AtendimentoResumo>[] = [
    { key: 'hora', header: 'Hora', type: 'custom', value: (a) => a.realizadoEm, display: (a) => hora(a.realizadoEm), width: '5rem', priority: 1 },
    { key: 'equipe', header: 'Equipe', type: 'text', width: '9rem', priority: 1 },
    { key: 'tipo', header: 'Atendimento', type: 'custom', value: (a) => a.tipo, display: (a) => (a.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução'), width: '9rem', priority: 1 },
    { key: 'quem', header: 'Quem', type: 'custom', value: (a) => a.nomeColaborador ?? '', display: (a) => `${a.nomeColaborador ?? ''} ${a.matricula ?? ''}` },
    { key: 'materiais', header: 'Materiais', type: 'integer', value: (a) => a.itens.length, width: '7rem' },
    { key: 'comprovantes', header: 'Comprovantes', type: 'custom', sortable: false, searchable: false,
      display: (a) => [a.assinaturaFisica ? 'papel' : a.temAssinatura ? 'assinatura' : '', a.temFoto ? 'foto' : ''].filter(Boolean).join(', ') },
  ];

  // ── Atendimento: seletores ─────────────────────────────────────────────────
  protected readonly destinos: GeoSegmentedOption<'GUARDAR' | 'DESCARTAR'>[] = [
    { value: 'GUARDAR', label: 'Estoque', description: 'Volta para o estoque do almoxarifado' },
    { value: 'DESCARTAR', label: 'Descarte', description: 'Sai do estoque como baixa (sucata sem uso)' },
  ];

  // ── Atendimento ───────────────────────────────────────────────────────────
  protected readonly aberto = signal(false);
  protected readonly idEquipe = signal<string | null>(null);
  protected readonly modo = signal<Modo>('retirada');
  protected readonly atendimento = signal<AtendimentoEquipe | null>(null);
  protected readonly carregandoAtendimento = signal(false);
  protected readonly erroAtendimento = signal<string | null>(null);
  protected readonly quantidades = signal<QuantidadesRetirada>({});
  protected readonly reservas = signal<Record<string, string>>({});
  protected readonly motivos = signal<Record<string, string>>({});
  protected readonly linhasDev = signal<LinhaDevolucao[]>([]);
  protected readonly idPessoa = signal<string | null>(null);
  protected readonly assinatura = signal<string>('');
  protected readonly foto = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly erroEnvio = signal<string | null>(null);
  protected readonly concluido = signal<AtendimentoResumo | null>(null);

  protected readonly regras = computed(() => this.atendimento()?.parametros ?? this.painel()?.parametros ?? null);
  protected readonly pessoa = computed<PessoaBalcao | null>(
    () => (this.atendimento()?.pessoas ?? []).find((p) => p.idColaborador === this.idPessoa()) ?? this.deFora(),
  );
  protected readonly resumo = computed(() => resumoRetirada(this.atendimento()?.retiradas ?? [], this.quantidades(), this.reservas()));
  protected readonly itensDevolucao = computed(() => this.linhasDev().filter((l) => (l.quantidade ?? 0) > 0).length);
  protected readonly gruposDevolucao = computed(() => {
    const grupos = new Map<string, { titulo: string; subtitulo: string | null; linhas: LinhaDevolucao[] }>();
    const titulos = new Map((this.atendimento()?.caminhao ?? []).map((g) => [g.idObra ?? 'livre', g.tituloObra]));
    for (const l of this.linhasDev()) {
      const chave = l.incluida ? 'incluida' : l.idObra ?? 'livre';
      if (!grupos.has(chave)) {
        grupos.set(chave, {
          titulo: l.incluida ? 'Fora do caminhão' : l.idObra ? `Obra ${l.numeroObra ?? 'sem número'}` : 'Sem obra',
          subtitulo: l.incluida ? 'Incluído agora, no balcão' : l.idObra ? titulos.get(l.idObra) ?? null : 'Material da equipe que não é de nenhuma obra',
          linhas: [],
        });
      }
      grupos.get(chave)!.linhas.push(l);
    }
    return [...grupos.entries()].map(([chave, g]) => ({ chave, ...g }));
  });
  protected readonly modos = computed<GeoSegmentedOption<Modo>[]>(() => {
    const a = this.atendimento();
    return [
      { value: 'retirada', label: 'Retirada', icon: 'pi pi-arrow-down', count: a?.retiradas.length ?? 0,
        description: a?.retiradas.length ? `${a.retiradas.length} solicitação(ões) para entregar` : 'Nada pendente para retirar' },
      { value: 'devolucao', label: 'Devolução', icon: 'pi pi-undo', count: this.linhasDev().length,
        description: this.linhasDev().length ? `${this.linhasDev().length} materiais no caminhão` : 'Caminhão vazio' },
    ];
  });
  protected readonly quantosItens = computed(() => (this.modo() === 'retirada' ? this.resumo().itens : this.itensDevolucao()));
  protected readonly bloqueio = computed(() => {
    if (this.modo() === 'retirada') {
      if (!this.resumo().itens) return 'Nenhum material para entregar.';
      if (this.resumo().semReserva.length) return `Falta a reserva da obra ${this.resumo().semReserva.join(', ')}.`;
    } else if (!this.itensDevolucao()) {
      return 'Nenhum material voltando.';
    }
    const r = this.regras();
    const faltas = r ? pendenciasComprovante(r, this.comprovanteAtual(), this.pessoa()) : [];
    return faltas.length ? `Falta ${juntarFaltas(faltas)}.` : null;
  });
  protected readonly dicaMatricula = computed(() => {
    const p = this.pessoa();
    if (p && !p.deFora && !p.matricula && this.regras()?.exigeMatricula) {
      return `${p.nome} não tem matrícula no cadastro. Cadastre a matrícula e escolha de novo.`;
    }
    return null;
  });

  // ── Quem retira de fora da equipe ─────────────────────────────────────────
  protected readonly deFora = signal<PessoaBalcao | null>(null);
  private readonly colaboradorLookup = new CursorRemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchCollaborators({ query, cursor }),
    selectedValues: () => {
      const id = this.deFora()?.idColaborador;
      return id ? [id] : [];
    },
    destroyRef: this.destroyRef,
  });
  protected readonly colaboradores = this.colaboradorLookup.items;
  protected readonly colaboradoresCarregando = this.colaboradorLookup.loading;
  protected readonly colaboradoresStatus = this.colaboradorLookup.status;

  // ── Incluir material na devolução ─────────────────────────────────────────
  protected readonly idMaterialNovo = signal<string | null>(null);
  protected readonly condicaoNova = signal<'NOVO' | 'SUCATA'>('SUCATA');
  protected readonly condicoes = [
    { label: 'Sucata', value: 'SUCATA' as const },
    { label: 'Novo', value: 'NOVO' as const },
  ];
  private readonly materialLookup = new CursorRemoteLookup<string>({
    loader: ({ query, cursor }) => this.lookupStore.searchMaterials({ query, cursor }),
    selectedValues: () => {
      const id = this.idMaterialNovo();
      return id ? [id] : [];
    },
    destroyRef: this.destroyRef,
  });
  protected readonly materiais = this.materialLookup.items;
  protected readonly materiaisCarregando = this.materialLookup.loading;
  protected readonly materiaisStatus = this.materialLookup.status;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const idAlmox = params.get('almoxarifado') ?? localStorage.getItem(CHAVE_ALMOX);
    const equipe = params.get('equipe');
    const modo = params.get('modo') === 'devolucao' ? 'devolucao' : 'retirada';
    this.carregarPainel(idAlmox, equipe ? { equipe, modo } : null);
  }

  // ── Quadro ────────────────────────────────────────────────────────────────

  protected carregarPainel(idAlmoxarifado?: string | null, abrir?: { equipe: string; modo: Modo } | null): void {
    this.carregandoPainel.set(true);
    this.erroPainel.set(null);
    this.balcao.painel(idAlmoxarifado).subscribe({
      next: (painel) => {
        this.painel.set(painel);
        this.carregandoPainel.set(false);
        if (painel.idAlmoxarifado) localStorage.setItem(CHAVE_ALMOX, painel.idAlmoxarifado);
        if (abrir) this.atender(abrir.equipe, abrir.modo);
        else this.sincronizarUrl();
      },
      error: (erro) => {
        this.erroPainel.set(getErrorMessage(erro));
        this.carregandoPainel.set(false);
      },
    });
  }

  protected definirVisao(v: Visao | null): void {
    if (!v) return;
    this.visao.set(v);
    this.sincronizarUrl();
  }

  protected definirAtalho(a: Atalho): void {
    this.atalho.set(this.atalho() === a ? 'todas' : a);
    this.sincronizarUrl();
  }

  protected definirSituacao(s: string | null): void {
    this.situacao.set(s as SituacaoDia | null);
    this.sincronizarUrl();
  }

  protected limpar(): void {
    this.atalho.set('todas');
    this.situacao.set(null);
    this.busca.set('');
    this.sincronizarUrl();
  }

  protected definirDataRegistro(valor: GeoDateValue): void {
    const d = valor instanceof Date ? dataIso(valor) : null;
    const hojeIso = dataIso(this.hoje);
    this.dataRegistro.set(d && d !== hojeIso ? d : null);
    this.registrosDoDia.set(null);
    const almox = this.painel()?.idAlmoxarifado;
    if (!this.dataRegistro() || !almox) return;
    this.carregandoRegistro.set(true);
    const dia = this.dataRegistro();
    this.balcao.painel(almox, dia).subscribe({
      next: (p) => {
        if (this.dataRegistro() !== dia) return;
        this.registrosDoDia.set(p.atendimentosHoje.filter((a) => dataIso(new Date(a.realizadoEm)) === dia));
        this.carregandoRegistro.set(false);
      },
      error: (erro) => {
        this.carregandoRegistro.set(false);
        this.notificacao.error(getErrorMessage(erro));
      },
    });
  }

  protected trocarAlmoxarifado(id: string | null): void {
    if (!id || id === this.painel()?.idAlmoxarifado) return;
    this.fechar();
    this.carregarPainel(id);
  }

  protected atender(idEquipe: string, modo: Modo): void {
    const almox = this.painel()?.idAlmoxarifado;
    if (!almox) return;
    this.idEquipe.set(idEquipe);
    this.modo.set(modo);
    this.concluido.set(null);
    this.aberto.set(true);
    this.sincronizarUrl();
    this.carregarAtendimento(idEquipe, almox);
  }

  protected fechar(): void {
    this.aberto.set(false);
    this.idEquipe.set(null);
    this.atendimento.set(null);
    this.concluido.set(null);
    this.sincronizarUrl();
  }

  protected abrirTermo(a: AtendimentoResumo): void {
    void this.router.navigate(['/almoxarifado/balcao/atendimentos', a.id]);
  }

  // ── Atendimento ───────────────────────────────────────────────────────────

  private carregarAtendimento(idEquipe: string, idAlmoxarifado: string): void {
    this.carregandoAtendimento.set(true);
    this.erroAtendimento.set(null);
    this.balcao.atendimento(idEquipe, idAlmoxarifado).subscribe({
      next: (a) => {
        if (this.idEquipe() !== idEquipe) return;
        this.atendimento.set(a);
        this.carregandoAtendimento.set(false);
        this.prepararFormulario(a);
      },
      error: (erro) => {
        this.erroAtendimento.set(getErrorMessage(erro));
        this.carregandoAtendimento.set(false);
      },
    });
  }

  protected recarregarAtendimento(): void {
    const id = this.idEquipe();
    const almox = this.painel()?.idAlmoxarifado;
    if (id && almox) this.carregarAtendimento(id, almox);
  }

  protected trocarModo(modo: Modo): void {
    this.modo.set(modo);
    this.erroEnvio.set(null);
    this.concluido.set(null);
    this.sincronizarUrl();
  }

  protected definirQuantidade(idItem: string, valor: number | null): void {
    this.quantidades.update((q) => ({ ...q, [idItem]: valor }));
  }

  protected entregarTudo(r?: RetiradaObra): void {
    const alvo = r ? [r] : this.atendimento()?.retiradas ?? [];
    this.quantidades.update((q) => ({ ...q, ...quantidadesIniciais(alvo) }));
  }

  protected zerar(r?: RetiradaObra): void {
    const alvo = r ? [r] : this.atendimento()?.retiradas ?? [];
    this.quantidades.update((q) => {
      const novo = { ...q };
      for (const ret of alvo) for (const i of ret.itens) novo[i.idItem] = 0;
      return novo;
    });
  }

  protected definirReserva(idSolicitacao: string, valor: string): void {
    this.reservas.update((r) => ({ ...r, [idSolicitacao]: valor }));
  }

  protected definirMotivo(idItem: string, valor: string): void {
    this.motivos.update((m) => ({ ...m, [idItem]: valor }));
  }

  protected excede(idItem: string, falta: number): boolean {
    return (this.quantidades()[idItem] ?? 0) > falta;
  }

  protected definirQuantidadeDevolucao(chave: string, valor: number | null): void {
    this.linhasDev.update((ls) => ls.map((l) => (l.chave === chave ? { ...l, quantidade: valor } : l)));
  }

  protected definirDestino(chave: string, destino: 'GUARDAR' | 'DESCARTAR'): void {
    this.linhasDev.update((ls) => ls.map((l) => (l.chave === chave ? { ...l, destino } : l)));
  }

  protected devolverGrupo(chave: string, tudo: boolean): void {
    this.linhasDev.update((ls) =>
      ls.map((l) => ((l.incluida ? 'incluida' : l.idObra ?? 'livre') === chave ? { ...l, quantidade: tudo ? l.noCaminhao || l.quantidade : 0 } : l)),
    );
  }

  protected removerLinha(chave: string): void {
    this.linhasDev.update((ls) => ls.filter((l) => l.chave !== chave));
  }

  protected buscarMateriais(termo: string): void {
    this.materialLookup.search(termo);
  }

  protected incluirMaterial(id: string | null): void {
    this.idMaterialNovo.set(id);
    if (!id) return;
    this.almoxarifadoService.buscarMaterialPorId(id).subscribe({
      next: (m) => {
        const condicao = this.condicaoNova();
        const chave = chaveLinha(m.id, condicao, null) + '|incluida';
        this.linhasDev.update((ls) =>
          ls.some((l) => l.chave === chave)
            ? ls
            : [...ls, {
                chave, idMaterial: m.id, codigo: m.codigo, descricao: m.descricao, unidade: m.unidadeMedida ?? null,
                condicao, idObra: null, numeroObra: null, noCaminhao: 0, quantidade: null, destino: 'GUARDAR',
                detalhaSerie: false, series: [], incluida: true,
              }],
        );
        this.idMaterialNovo.set(null);
      },
      error: (erro) => this.notificacao.error(getErrorMessage(erro)),
    });
  }

  protected escolherPessoa(p: PessoaBalcao): void {
    this.idPessoa.set(p.idColaborador);
    this.deFora.set(null);
  }

  protected buscarColaboradores(termo: string): void {
    this.colaboradorLookup.search(termo);
  }

  protected escolherDeFora(id: string | null): void {
    if (!id) {
      this.deFora.set(null);
      return;
    }
    const daEquipe = (this.atendimento()?.pessoas ?? []).find((p) => p.idColaborador === id);
    if (daEquipe) {
      this.escolherPessoa(daEquipe);
      return;
    }
    const nome = this.colaboradores().find((c) => c.value === id)?.label ?? 'Colaborador';
    this.idPessoa.set(null);
    this.deFora.set({ idColaborador: id, nome, matricula: null, encarregado: false, deFora: true });
  }

  protected primeiro(nome: string): string {
    return primeiroNome(nome);
  }

  protected registrar(): void {
    const a = this.atendimento();
    if (!a || this.bloqueio() || this.enviando()) return;
    this.enviando.set(true);
    this.erroEnvio.set(null);
    const comprovante = this.comprovanteAtual();
    const chamada = this.modo() === 'retirada'
      ? this.balcao.registrarRetirada(a.idEquipe, montarRetirada(a, this.quantidades(), this.reservas(), this.motivos(), comprovante))
      : this.balcao.registrarDevolucao(a.idEquipe, montarDevolucao(a.idAlmoxarifado, this.linhasDev(), comprovante));
    chamada.subscribe({
      next: (resumo) => {
        this.enviando.set(false);
        this.concluido.set(resumo);
        // O resultado aparece no topo do painel; sem isso ele ficaria fora da vista, abaixo do formulário.
        queueMicrotask(() => document.querySelector('.at')?.scrollIntoView({ block: 'start' }));
        const n = resumo.itens.length;
        this.notificacao.success(`${resumo.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução'} de ${a.codigo} registrada: ${n} ${n === 1 ? 'material' : 'materiais'}.`);
        this.carregarPainel(this.painel()?.idAlmoxarifado);
        this.recarregarAtendimento();
      },
      error: (erro) => {
        this.enviando.set(false);
        this.erroEnvio.set(getErrorMessage(erro));
      },
    });
  }

  /** Passo que ainda falta (o rodapé leva até ele quando o formulário é longo). */
  protected readonly passoPendente = computed(() => {
    const r = this.regras();
    if (!r || !this.bloqueio()) return null;
    const faltas = pendenciasComprovante(r, this.comprovanteAtual(), this.pessoa());
    if (faltas.includes('a matrícula no cadastro') || faltas.includes('quem retira')) return 'balcao-passo-2';
    return faltas.length ? 'balcao-passo-3' : null;
  });

  protected irPara(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected pessoasResumo(a: AtendimentoEquipe): string {
    const enc = a.pessoas.find((p) => p.encarregado);
    const base = a.base ? `base ${a.base}` : null;
    return [enc ? `Encarregado ${enc.nome}` : null, base, a.almoxarifado].filter(Boolean).join(', ');
  }

  protected rotuloSeparacao(s: string | null): string | null {
    if (!s || s === 'SEPARADO') return null;
    return s === 'EM_SEPARACAO' ? 'Em separação' : 'Não separado';
  }

  // ── Apoio ─────────────────────────────────────────────────────────────────

  private celulaRetirada(e: EquipeNoBalcao, feito: AtendimentoResumo | null): Celula {
    if (e.itensRetirada > 0) {
      return {
        estado: 'pendente',
        texto: `${e.itensRetirada} ${e.itensRetirada === 1 ? 'material' : 'materiais'} de ${e.obrasRetirada} ${e.obrasRetirada === 1 ? 'obra' : 'obras'}`,
        detalhe: feito ? `Já retirou parte às ${hora(feito.realizadoEm)}` : e.aguardandoSeparacao ? 'Ainda sem separação' : null,
        feito,
        alerta: e.retiradaAtrasada ? 'Atrasada' : null,
      };
    }
    if (feito) return { estado: 'feita', texto: `Retirou às ${hora(feito.realizadoEm)}`, detalhe: feito.nomeColaborador ? primeiroNome(feito.nomeColaborador) : null, feito, alerta: null };
    return { estado: 'nada', texto: 'Nada para retirar hoje', detalhe: null, feito: null, alerta: null };
  }

  private celulaDevolucao(e: EquipeNoBalcao, feito: AtendimentoResumo | null): Celula {
    if (e.itensNoCaminhao > 0 || e.negativosNoCaminhao > 0) {
      const partes = [`${e.itensNoCaminhao} ${e.itensNoCaminhao === 1 ? 'material' : 'materiais'} no caminhão`];
      if (e.sucatasNoCaminhao) partes.push(`${e.sucatasNoCaminhao} de sucata`);
      return {
        estado: 'pendente',
        texto: partes.join(', '),
        detalhe: feito ? `Devolveu parte às ${hora(feito.realizadoEm)}` : null,
        feito,
        alerta: e.negativosNoCaminhao ? `${e.negativosNoCaminhao} negativo${e.negativosNoCaminhao > 1 ? 's' : ''}` : null,
      };
    }
    if (feito) return { estado: 'feita', texto: `Devolveu às ${hora(feito.realizadoEm)}`, detalhe: feito.nomeColaborador ? primeiroNome(feito.nomeColaborador) : null, feito, alerta: null };
    return { estado: 'nada', texto: 'Caminhão vazio', detalhe: null, feito: null, alerta: null };
  }

  private comprovanteAtual() {
    return {
      idColaborador: this.pessoa()?.idColaborador ?? null,
      matricula: null,
      assinatura: this.assinatura() || null,
      foto: this.foto(),
      observacao: null,
    };
  }

  private prepararFormulario(a: AtendimentoEquipe): void {
    this.quantidades.set(quantidadesIniciais(a.retiradas));
    this.reservas.set({});
    this.motivos.set({});
    this.linhasDev.set(linhasDevolucao(a.caminhao));
    this.erroEnvio.set(null);
    this.foto.set(null);
    this.assinatura.set(a.parametros.exigeAssinatura ? '' : 'FISICA');
    const encarregado = a.pessoas.find((p) => p.encarregado) ?? null;
    this.idPessoa.set(encarregado?.idColaborador ?? null);
    this.deFora.set(null);
  }

  private sincronizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        almoxarifado: this.painel()?.idAlmoxarifado ?? null,
        visao: this.visao() === 'quadro' ? null : this.visao(),
        atalho: this.atalho() === 'todas' ? null : this.atalho(),
        situacao: this.situacao(),
        equipe: this.aberto() ? this.idEquipe() : null,
        modo: this.aberto() ? this.modo() : null,
      },
      replaceUrl: true,
    });
  }
}

function situacaoDia(retirada: Celula, devolucao: Celula): SituacaoDia {
  if (retirada.estado === 'pendente') return retirada.alerta ? 'atrasada' : 'retirar';
  if (devolucao.estado === 'pendente') return 'devolver';
  if (retirada.feito || devolucao.feito) return 'concluida';
  return 'livre';
}

function normalizar(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function valorDe<T extends string, D extends T | null>(v: string | null, validos: readonly T[], padrao: D): T | D {
  return v && (validos as readonly string[]).includes(v) ? (v as T) : padrao;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0];
}
