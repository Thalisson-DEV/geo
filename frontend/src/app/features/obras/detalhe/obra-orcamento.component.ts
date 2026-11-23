import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoCellDirective,
  GeoConfirmationService,
  GeoDataTableColumn,
  GeoDataTableComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoNumberInputComponent,
  GeoRowActionsDirective,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTabPanelDirective,
  GeoTabsComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { take } from 'rxjs';

import { MaterialResponse } from '../../../core/models/almoxarifado.models';
import { AcaoResponse } from '../../../core/models/contrato.models';
import {
  ItemOrcamentoObraResponse,
  OrcamentoObraResponse,
  RevisaoOrcamentoResponse,
  SituacaoItemOrcamento
} from '../../../core/models/obras.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { ContratoService } from '../../../core/services/contrato.service';
import { ObrasKitService } from '../../../core/services/obras-kit.service';
import { ObrasService } from '../../../core/services/obras.service';
import { RemoteLookup } from '../../../core/utils/remote-lookup.util';
import { ImportacaoPlanilhaObrasComponent } from '../importacao/importacao-planilha-obras.component';
import { COLUNAS_ORCAMENTO, fonteOrcamento } from '../importacao/importacoes-obras';
import { formatarDataHora, formatarMoeda } from '../obras-ui';
import {
  FiltroSituacao,
  ORIGEM_ORCAMENTO,
  SITUACAO_ORCAMENTO,
  contarSituacoes,
  itensDoTipo,
  percentual,
  resumoAtencao,
  saldoQuantidade
} from './obra-orcamento.logic';

type Carga<T> = { estado: 'loading' } | { estado: 'error'; mensagem: string } | { estado: 'ready'; dados: T };
type Tipo = 'SERVICO' | 'MATERIAL';
type Operacao = 'INSTALAR' | 'RETIRAR';

/**
 * Orçamento da obra na ficha: o orçado comparado com o planejado, o executado e o medido, por serviço e material.
 * Lança, ajusta e tira itens; gera uma revisão a partir do planejamento; importa a planilha; mostra as revisões.
 * Passar do orçado só gera aviso: nada é bloqueado.
 */
@Component({
  selector: 'app-obra-orcamento',
  standalone: true,
  imports: [
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoCellDirective,
    GeoDataTableComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoNumberInputComponent,
    GeoRowActionsDirective,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTabPanelDirective,
    GeoTabsComponent,
    GeoTextareaComponent,
    ImportacaoPlanilhaObrasComponent,
    NgTemplateOutlet
  ],
  templateUrl: './obra-orcamento.component.html',
  styleUrl: './obra-orcamento.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ObraOrcamentoComponent {
  private readonly obras = inject(ObrasService);
  private readonly kits = inject(ObrasKitService);
  private readonly contratos = inject(ContratoService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly notificacao = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly idObra = input.required<string>();
  readonly carga = input.required<Carga<OrcamentoObraResponse>>();
  readonly podeEditar = input(false);
  /** Sem contrato na obra, o serviço lançado precisa do valor unitário. */
  readonly temContrato = input(true);
  /** O orçamento mudou: a ficha atualiza os valores previstos e os pontos de atenção. */
  readonly atualizado = output<OrcamentoObraResponse>();
  readonly recarregar = output<void>();

  protected readonly moeda = formatarMoeda;
  protected readonly dataHora = formatarDataHora;
  protected readonly situacoes = SITUACAO_ORCAMENTO;
  protected readonly origens = ORIGEM_ORCAMENTO;
  protected readonly percentual = percentual;
  protected readonly saldo = saldoQuantidade;

  protected readonly orcamento = computed(() => {
    const c = this.carga();
    return c.estado === 'ready' ? c.dados : null;
  });
  protected readonly atencao = computed(() => resumoAtencao(this.orcamento()));
  /** Sem orçamento, o que o planejamento já prevê (para oferecer gerar a partir dele). */
  protected readonly planejadoSemOrcamento = computed(() => {
    const o = this.orcamento();
    if (!o || o.possuiOrcamento) return null;
    const servicos = o.itens.filter((i) => i.tipo === 'SERVICO').length;
    const materiais = o.itens.filter((i) => i.tipo === 'MATERIAL').length;
    return servicos + materiais ? { servicos, materiais, valor: o.totais.planejadoServicos, materiaisValor: o.totais.planejadoMateriais } : null;
  });

  /** O planejamento tem kits: só assim faz sentido gerar o orçamento a partir dele. */
  protected readonly temPlanejado = computed(() => (this.orcamento()?.itens ?? []).some((i) => (i.planejadoQuantidade ?? 0) > 0));

  protected plural(n: number | null | undefined, um: string, varios: string): string {
    return `${n ?? 0} ${n === 1 ? um : varios}`;
  }

  /** Materiais que o orçamento traz (os do planejamento sem orçado não contam). */
  protected readonly materiaisOrcados = computed(
    () => (this.orcamento()?.itens ?? []).filter((i) => i.tipo === 'MATERIAL' && i.orcadoQuantidade != null).length
  );

  /** Card de materiais: o que o orçamento traz e o que só o planejamento tem, sem contradizer a aba. */
  protected readonly detalheMateriais = computed(() => {
    const o = this.orcamento();
    const noPlanejamento = contarSituacoes(o, 'MATERIAL').TODOS - this.materiaisOrcados();
    if (!this.materiaisOrcados()) return noPlanejamento ? `${noPlanejamento} só no planejamento` : 'O orçamento só tem serviços';
    if (noPlanejamento) return `${noPlanejamento} só no planejamento`;
    return o?.totais.orcadoMateriais ? this.plural(this.materiaisOrcados(), 'item', 'itens') : 'Só quantidades';
  });

  // ── Abas e filtro ──────────────────────────────────────────────────────
  protected readonly aba = signal<Tipo>('SERVICO');
  protected readonly filtro = signal<FiltroSituacao>('TODOS');
  protected readonly abas = computed(() => {
    const o = this.orcamento();
    return [
      { value: 'SERVICO', label: 'Serviços', icon: 'pi pi-wrench', badge: contarSituacoes(o, 'SERVICO').TODOS },
      { value: 'MATERIAL', label: 'Materiais', icon: 'pi pi-box', badge: contarSituacoes(o, 'MATERIAL').TODOS }
    ];
  });
  protected readonly contagem = computed(() => contarSituacoes(this.orcamento(), this.aba()));
  protected readonly filtros = computed(() => {
    const c = this.contagem();
    return (['TODOS', 'ACIMA', 'FORA_DO_ORCAMENTO', 'NAO_PLANEJADO', 'DENTRO', 'SEM_ORCADO'] as FiltroSituacao[])
      .filter((f) => f === 'TODOS' || c[f] > 0)
      .map((f) => ({ valor: f, rotulo: f === 'TODOS' ? 'Todos' : SITUACAO_ORCAMENTO[f].rotulo, total: c[f] }));
  });
  protected readonly linhas = computed(() => itensDoTipo(this.orcamento(), this.aba(), this.filtro()));

  protected trocarAba(valor: unknown): void {
    this.aba.set(valor === 'MATERIAL' ? 'MATERIAL' : 'SERVICO');
    this.filtro.set('TODOS');
  }

  protected readonly colunas: GeoDataTableColumn<ItemOrcamentoObraResponse>[] = [
    { key: 'codigo', header: 'Item', type: 'custom', priority: 1, value: (i) => i.codigo, display: (i) => `${i.codigo} ${i.descricao ?? ''}` },
    { key: 'orcado', header: 'Orçado', type: 'custom', align: 'end', width: '7.5rem', value: (i) => i.orcadoQuantidade ?? -1 },
    { key: 'planejado', header: 'Planejado', type: 'custom', align: 'end', width: '5.75rem', value: (i) => i.planejadoQuantidade ?? 0 },
    { key: 'executado', header: 'Executado', type: 'custom', align: 'end', width: '5.75rem', priority: 3, value: (i) => i.executadoQuantidade ?? 0 },
    { key: 'medido', header: 'Medido', type: 'custom', align: 'end', width: '5.75rem', value: (i) => i.medidoQuantidade ?? 0 },
    { key: 'saldo', header: 'Saldo a medir', type: 'custom', align: 'end', width: '8rem', priority: 3, value: (i) => saldoQuantidade(i) ?? 0 },
    { key: 'situacao', header: 'Situação', type: 'custom', width: '9.5rem', priority: 1, value: (i) => SITUACAO_ORCAMENTO[i.situacao].rotulo }
  ];
  protected sit(situacao: string) {
    return SITUACAO_ORCAMENTO[situacao as SituacaoItemOrcamento] ?? SITUACAO_ORCAMENTO.DENTRO;
  }

  protected readonly chave = (i: ItemOrcamentoObraResponse) => `${i.tipo}|${i.codigo}|${i.operacao}`;

  protected qtd(valor: number | null | undefined, unidade?: string | null): string {
    if (valor == null) return '—';
    return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${unidade ? ' ' + unidade.toLowerCase() : ''}`;
  }

  // ── Lançar e ajustar item ──────────────────────────────────────────────
  protected readonly itemAberto = signal(false);
  protected readonly emEdicao = signal<ItemOrcamentoObraResponse | null>(null);
  protected readonly tipo = signal<Tipo>('SERVICO');
  protected readonly referencia = signal<string | null>(null);
  protected readonly operacao = signal<Operacao>('INSTALAR');
  protected readonly quantidade = signal<number | null>(1);
  protected readonly valorUnitario = signal<number | null>(null);
  protected readonly salvando = signal(false);
  protected readonly tentouSalvar = signal(false);
  /** Rótulo da referência vinda de "Incluir no orçamento", antes de a busca carregar. */
  private readonly rotuloInicial = signal<{ id: string; label: string } | null>(null);

  protected readonly tiposItem: GeoSelectOption<Tipo>[] = [
    { label: 'Serviço (Ação do contrato)', value: 'SERVICO' },
    { label: 'Material do catálogo', value: 'MATERIAL' }
  ];
  protected readonly operacoes: GeoSelectOption<Operacao>[] = [
    { label: 'Instalar', value: 'INSTALAR' },
    { label: 'Retirar', value: 'RETIRAR' }
  ];

  protected readonly acoes = new RemoteLookup<AcaoResponse>(
    {
      identify: (a) => a.id,
      selectedKeys: () => (this.tipo() === 'SERVICO' && this.referencia() ? [this.referencia()!] : []),
      load: ({ query, page, size }) => this.contratos.listarAcoes({ ativo: true, buscaGlobal: query || undefined, page, size, sort: 'codigo,asc' })
    },
    this.destroyRef
  );
  protected readonly materiais = new RemoteLookup<MaterialResponse>(
    {
      identify: (m) => m.id,
      selectedKeys: () => (this.tipo() === 'MATERIAL' && this.referencia() ? [this.referencia()!] : []),
      load: ({ query, page, size }) => this.almoxarifado.listarMateriais({ ativo: true, buscaGlobal: query || undefined, page, size, sort: 'codigo,asc' })
    },
    this.destroyRef
  );
  protected readonly opcoesReferencia = computed<GeoSelectOption<string>[]>(() => {
    const opcoes = this.tipo() === 'SERVICO'
      ? this.acoes.items().map((a) => ({ label: `${a.codigo} · ${a.nome}`, value: a.id }))
      : this.materiais.items().map((m) => ({ label: `${m.codigo} · ${m.descricao}`, value: m.id }));
    const inicial = this.rotuloInicial();
    return inicial && !opcoes.some((o) => o.value === inicial.id) ? [{ label: inicial.label, value: inicial.id }, ...opcoes] : opcoes;
  });

  protected readonly tituloItem = computed(() => {
    const item = this.emEdicao();
    return item ? `Ajustar ${item.codigo}` : 'Lançar item no orçamento';
  });
  protected readonly totalPrevisto = computed(() => {
    const q = this.quantidade();
    const v = this.valorUnitario() ?? this.emEdicao()?.valorUnitario ?? null;
    return q != null && v != null ? q * v : null;
  });
  protected readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.emEdicao() && !this.referencia()) e['referencia'] = this.tipo() === 'SERVICO' ? 'Escolha o serviço.' : 'Escolha o material.';
    if (this.quantidade() == null || this.quantidade()! < 0) e['quantidade'] = 'Informe a quantidade (zero ou maior).';
    if (this.valorObrigatorio() && this.valorUnitario() == null) e['valorUnitario'] = 'Informe o valor unitário: a obra não tem contrato.';
    return e;
  });
  protected readonly valorObrigatorio = computed(() => !this.emEdicao() && this.tipo() === 'SERVICO' && !this.temContrato());
  protected readonly ajudaValor = computed(() => {
    if (this.tipo() === 'MATERIAL') return 'Opcional para material.';
    if (this.emEdicao()) return undefined;
    return this.temContrato() ? 'Vazio: usa o valor vigente do contrato da obra.' : 'A obra não tem contrato: informe o valor.';
  });

  protected erro(campo: string): string | undefined {
    return this.tentouSalvar() ? this.erros()[campo] : undefined;
  }
  protected readonly alterado = computed(() => {
    const item = this.emEdicao();
    if (!item) return !!this.referencia();
    return this.quantidade() !== item.orcadoQuantidade || this.operacao() !== item.operacao
      || (this.valorUnitario() ?? null) !== (item.valorUnitario ?? null);
  });

  protected lancar(): void {
    this.prepararItem(null);
    this.itemAberto.set(true);
  }

  protected ajustar(item: ItemOrcamentoObraResponse): void {
    this.prepararItem(item);
    this.itemAberto.set(true);
  }

  /** Item fora do orçamento: abre o lançamento já com o serviço ou material e a quantidade planejada. */
  protected incluir(item: ItemOrcamentoObraResponse): void {
    this.prepararItem(null);
    const id = item.tipo === 'SERVICO' ? item.idAcao : item.idMaterial;
    this.tipo.set(item.tipo);
    this.operacao.set(item.operacao);
    this.quantidade.set(Math.max(item.planejadoQuantidade ?? 0, item.executadoQuantidade ?? 0, item.medidoQuantidade ?? 0) || 1);
    if (id) {
      this.referencia.set(id);
      this.rotuloInicial.set({ id, label: `${item.codigo} · ${item.descricao ?? ''}` });
    }
    this.itemAberto.set(true);
  }

  protected trocarTipo(tipo: Tipo | null): void {
    this.tipo.set(tipo ?? 'SERVICO');
    this.referencia.set(null);
    this.rotuloInicial.set(null);
  }

  private prepararItem(item: ItemOrcamentoObraResponse | null): void {
    this.emEdicao.set(item);
    this.tentouSalvar.set(false);
    this.rotuloInicial.set(null);
    this.tipo.set(item?.tipo ?? this.aba());
    this.referencia.set(null);
    this.operacao.set(item?.operacao ?? 'INSTALAR');
    this.quantidade.set(item?.orcadoQuantidade ?? 1);
    this.valorUnitario.set(item?.valorUnitario ?? null);
  }

  protected salvarItem(): void {
    this.tentouSalvar.set(true);
    if (Object.keys(this.erros()).length) return;
    const item = this.emEdicao();
    const pedido = item?.id
      ? this.obras.alterarItemOrcamento(this.idObra(), item.id, {
          operacao: this.operacao(),
          quantidade: this.quantidade()!,
          valorUnitario: this.valorUnitario()
        })
      : this.obras.adicionarItemOrcamento(this.idObra(), {
          tipo: this.tipo(),
          idReferencia: this.referencia()!,
          operacao: this.operacao(),
          quantidade: this.quantidade()!,
          valorUnitario: this.valorUnitario()
        });
    this.salvando.set(true);
    pedido.pipe(take(1)).subscribe({
      next: (orcamento) => {
        this.salvando.set(false);
        this.itemAberto.set(false);
        this.notificacao.success(item ? 'Item do orçamento ajustado.' : 'Item lançado no orçamento.');
        this.atualizado.emit(orcamento);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacao.error(getErrorMessage(e));
      }
    });
  }

  protected async remover(item: ItemOrcamentoObraResponse): Promise<void> {
    if (!item.id) return;
    const ok = await this.confirmacao.confirm({
      title: `Tirar ${item.codigo} do orçamento?`,
      message: 'O item sai da revisão atual do orçamento. O planejamento, a execução e as medições não mudam.',
      confirmLabel: 'Tirar do orçamento',
      variant: 'destructive'
    });
    if (!ok) return;
    this.obras.removerItemOrcamento(this.idObra(), item.id).pipe(take(1)).subscribe({
      next: (orcamento) => {
        this.notificacao.success('Item retirado do orçamento.');
        this.atualizado.emit(orcamento);
      },
      error: (e) => this.notificacao.error(getErrorMessage(e))
    });
  }

  // ── Gerar do planejamento ──────────────────────────────────────────────
  protected readonly gerarAberto = signal(false);
  protected readonly observacao = signal('');
  protected readonly gerando = signal(false);

  protected abrirGerar(): void {
    this.observacao.set('');
    this.gerarAberto.set(true);
  }

  protected gerar(): void {
    this.gerando.set(true);
    this.obras.gerarOrcamentoDoPlanejamento(this.idObra(), this.observacao().trim() || null).pipe(take(1)).subscribe({
      next: (orcamento) => {
        this.gerando.set(false);
        this.gerarAberto.set(false);
        this.notificacao.success(`Revisão ${orcamento.revisao?.numero ?? ''} do orçamento gerada do planejamento.`);
        this.atualizado.emit(orcamento);
      },
      error: (e) => {
        this.gerando.set(false);
        this.notificacao.error(getErrorMessage(e));
      }
    });
  }

  // ── Importar ───────────────────────────────────────────────────────────
  protected readonly importacaoAberta = signal(false);
  protected readonly colunasImportacao = COLUNAS_ORCAMENTO;
  protected readonly fonteImportacao = fonteOrcamento(this.kits);

  /** A planilha é processada em segundo plano: fecha a gaveta e relê o orçamento quando o processamento termina. */
  protected importacaoEnviada(): void {
    this.importacaoAberta.set(false);
    for (const atraso of [1500, 5000]) {
      const timer = setTimeout(() => this.recarregar.emit(), atraso);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    }
  }

  /** Quem mexeu por último; processamento automático (sem usuário) não aparece. */
  protected autor(r: RevisaoOrcamentoResponse): string | null {
    const quem = r.usuarioUltimaAlteracao || r.usuarioCriacao;
    return quem && quem !== 'SYSTEM' ? quem : null;
  }

  // ── Revisões ───────────────────────────────────────────────────────────
  protected readonly revisoesAberto = signal(false);
  protected readonly revisoes = signal<Carga<RevisaoOrcamentoResponse[]>>({ estado: 'loading' });

  protected abrirRevisoes(): void {
    this.revisoesAberto.set(true);
    this.revisoes.set({ estado: 'loading' });
    this.obras.listarRevisoesOrcamento(this.idObra()).pipe(take(1)).subscribe({
      next: (dados) => this.revisoes.set({ estado: 'ready', dados }),
      error: (e) => this.revisoes.set({ estado: 'error', mensagem: getErrorMessage(e) })
    });
  }

  protected listaRevisoes(): RevisaoOrcamentoResponse[] {
    const r = this.revisoes();
    return r.estado === 'ready' ? r.dados : [];
  }

  protected mensagem(c: Carga<unknown>): string {
    return c.estado === 'error' ? c.mensagem : '';
  }
}
