import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { GeoAsyncStateComponent, GeoTone } from '@geo/ui';
import { catchError, forkJoin, map, Observable, of, switchMap, tap } from 'rxjs';

import { getErrorMessage } from '../../../../core/models/shared.models';
import { SolicitacaoMaterialFilter, SolicitacaoMaterialSummaryResponse, StatusSolicitacaoMaterial } from '../../../../core/models/solicitacao-material-tecnica.models';
import { SolicitacaoMaterialTecnicaService } from '../../../../core/services/solicitacao-material-tecnica.service';
import { isoCivil } from '../solicitacao-comercial-status';
import { AcaoCardComercial, SolicitacaoComercialKanbanCardComponent } from '../solicitacoes-comerciais-kanban/solicitacao-comercial-kanban-card.component';
import { tipoTecnicoEhAdicao } from '../solicitacao-tecnica-presentation';
import { statusTecnicoDef } from '../solicitacao-tecnica-situacao';

export type AgrupamentoQuadroTecnico = 'situacao' | 'pendencia' | 'prazo';
type ColunaId = 'PLANEJAMENTO' | 'SEPARACAO' | 'ENTREGA' | 'ENCERRADAS';
type Card = SolicitacaoMaterialSummaryResponse;

interface FaixaDef {
  id: string;
  label: string;
  tone: GeoTone;
  filtro: Partial<SolicitacaoMaterialFilter>;
  aberta: boolean;
}

interface ColunaDef {
  id: ColunaId;
  titulo: string;
  subtitulo: string;
  icon: string;
  tone: GeoTone;
  faixas: FaixaDef[];
  vazio: { icon: string; titulo: string; texto: string };
}

/** Colunas pela próxima ação do almoxarifado (mesmo modelo do quadro comercial). */
const COLUNAS: readonly ColunaDef[] = [
  {
    id: 'PLANEJAMENTO',
    titulo: 'Planejamento',
    subtitulo: 'Sem data de saque',
    icon: 'pi pi-calendar-plus',
    tone: 'warning',
    faixas: [{ id: 'PLANEJAR', label: 'A planejar', tone: 'warning', filtro: { etapa: 'AGUARDANDO_PLANEJAMENTO' } as never, aberta: true }],
    vazio: { icon: 'pi pi-check-circle', titulo: 'Nada para planejar', texto: 'Todas as solicitações deste recorte já têm data de saque.' }
  },
  {
    id: 'SEPARACAO',
    titulo: 'Separação',
    subtitulo: 'Planejadas, a separar no almoxarifado',
    icon: 'pi pi-box',
    tone: 'info',
    faixas: [
      { id: 'PRONTO_PARA_SEPARACAO', label: 'Aguardando separação', tone: 'info', filtro: { etapa: 'EM_SEPARACAO', statusSeparacao: 'PRONTO_PARA_SEPARACAO' } as never, aberta: true },
      { id: 'EM_SEPARACAO', label: 'Em separação', tone: 'warning', filtro: { etapa: 'EM_SEPARACAO', statusSeparacao: 'EM_SEPARACAO' } as never, aberta: true }
    ],
    vazio: { icon: 'pi pi-box', titulo: 'Nada para separar', texto: 'As solicitações planejadas aparecem aqui para a separação.' }
  },
  {
    id: 'ENTREGA',
    titulo: 'Entrega',
    subtitulo: 'Separadas para retirada e devoluções a receber',
    icon: 'pi pi-truck',
    tone: 'info',
    faixas: [{ id: 'ENTREGAR', label: 'A entregar', tone: 'info', filtro: { etapa: 'PENDENTE_ENTREGA' } as never, aberta: true }],
    vazio: { icon: 'pi pi-truck', titulo: 'Nada para entregar', texto: 'Quando a separação terminar, a solicitação aparece aqui.' }
  },
  {
    id: 'ENCERRADAS',
    titulo: 'Encerradas',
    subtitulo: 'Entregues, devolvidas, rejeitadas, estornadas ou canceladas',
    icon: 'pi pi-inbox',
    tone: 'neutral',
    faixas: (['ENTREGUE', 'DEVOLVIDO', 'REJEITADO', 'ESTORNADO', 'CANCELADO'] as StatusSolicitacaoMaterial[]).map((s) => ({
      id: s,
      label: statusTecnicoDef(s).label,
      tone: statusTecnicoDef(s).tone,
      filtro: { statuses: [s] },
      aberta: false
    })),
    vazio: { icon: 'pi pi-inbox', titulo: 'Nada encerrado ainda', texto: 'As solicitações concluídas deste recorte aparecem aqui.' }
  }
];

export const LIMITE_ABERTAS = 200;
export const LIMITE_ENCERRADAS = 15;
const CHAVE_RECOLHIDOS = 'geo_kanban_tecnico_grupos_recolhidos';
const CHAVE_AGRUPAMENTO = 'geo_kanban_tecnico_agrupamento';

interface Faixa {
  def: FaixaDef;
  itens: Card[];
  total: number;
}

interface GrupoKanban {
  id: string;
  label: string;
  tone: GeoTone;
  itens: Card[];
  total: number;
}

interface ColunaVisivel {
  def: ColunaDef;
  grupos: GrupoKanban[];
  total: number;
  atrasadas: number;
  pendencias: number;
}

/**
 * Quadro das solicitações técnicas, no mesmo modelo do quadro comercial: colunas pela próxima
 * ação (planejar, separar, entregar), agrupamento por situação, pendência ou prazo, e arrastar como
 * atalho das mesmas ações dos botões. Toda ação abre no painel lateral.
 */
@Component({
  selector: 'app-solicitacoes-tecnicas-quadro',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoAsyncStateComponent, SolicitacaoComercialKanbanCardComponent],
  styleUrl: '../solicitacoes-comerciais-kanban/solicitacoes-comerciais-kanban.component.css',
  template: `
    <div class="kb-bar">
      <div class="kb-agrupar">
        <span id="kbt-agrupar-rotulo">Agrupar por</span>
        <div class="kb-seg" role="group" aria-labelledby="kbt-agrupar-rotulo">
          <button type="button" [attr.aria-pressed]="agrupamento() === 'situacao'" (click)="agrupar('situacao')"><i class="pi pi-sitemap" aria-hidden="true"></i>Situação</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'pendencia'" (click)="agrupar('pendencia')"><i class="pi pi-flag" aria-hidden="true"></i>Pendência</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'prazo'" (click)="agrupar('prazo')"><i class="pi pi-calendar" aria-hidden="true"></i>Prazo de saque</button>
        </div>
      </div>
      <span class="kb-dica"><i class="pi pi-arrows-alt" aria-hidden="true"></i>Arraste um cartão para planejar, separar ou entregar</span>
    </div>

    <nav class="kb-atalhos" aria-label="Ir para a coluna">
      @for (col of colunas(); track col.def.id) {
        <button type="button" [attr.data-tone]="col.def.tone" [attr.aria-current]="colunaVisivel() === $index ? 'true' : null" (click)="irParaColuna(col.def.id)">
          <span class="kb-atalhos__dot" aria-hidden="true"></span>{{ col.def.titulo }}<strong>{{ col.total }}</strong>
        </button>
      }
    </nav>

    @if (erro()) {
      <geo-async-state type="error" title="Não foi possível carregar o quadro" [description]="erro()!" actionLabel="Tentar novamente" (actionPressed)="recarregar()" />
    } @else if (!faixas()) {
      <div class="kb-board" aria-busy="true" aria-label="Carregando o quadro">
        @for (c of [1, 2, 3, 4]; track c) {
          <div class="kb-col kb-col--skeleton">
            <span class="kb-sk kb-sk--head"></span>
            <span class="kb-sk kb-sk--bar"></span>
            <span class="kb-sk kb-sk--card"></span>
            <span class="kb-sk kb-sk--card"></span>
          </div>
        }
      </div>
    } @else {
      <div class="kb-board" [class.kb-board--arrastando]="!!arrastando()" [class.kb-board--atualizando]="carregando()" role="region" aria-label="Quadro de solicitações técnicas" (scroll)="aoRolarQuadro($event)">
        @for (col of colunas(); track col.def.id) {
          @let acao = acaoDeSoltar(col.def.id);
          <section
            class="kb-col"
            [id]="'kbt-col-' + col.def.id"
            [attr.data-tone]="col.def.tone"
            [class.kb-col--alvo]="!!acao"
            [class.kb-col--sobre]="!!acao && sobre() === col.def.id"
            [class.kb-col--inerte]="!!arrastando() && !acao && arrastando()!.de !== col.def.id"
            [attr.aria-labelledby]="'kbt-titulo-' + col.def.id"
            (dragover)="aoPassar($event, col.def.id)"
            (dragleave)="aoSair($event, col.def.id)"
            (drop)="aoSoltar($event, col.def.id)"
          >
            <header class="kb-col__head">
              <span class="kb-col__icone" aria-hidden="true"><i [class]="col.def.icon"></i></span>
              <div class="kb-col__titulos">
                <h3 [id]="'kbt-titulo-' + col.def.id">{{ col.def.titulo }} <span class="kb-col__total">{{ col.total }}</span></h3>
                <p>{{ col.def.subtitulo }}</p>
              </div>
            </header>

            @if (col.atrasadas || col.pendencias) {
              <div class="kb-col__alertas">
                @if (col.atrasadas) {
                  <span class="kb-alerta kb-alerta--perigo"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>{{ col.atrasadas }} {{ col.atrasadas === 1 ? 'atrasada' : 'atrasadas' }}</span>
                }
                @if (col.pendencias) {
                  <span class="kb-alerta kb-alerta--aviso"><i class="pi pi-flag" aria-hidden="true"></i>{{ col.pendencias }} com pendência</span>
                }
              </div>
            }

            @if (acao) {
              <div class="kb-drop" [attr.data-tone]="acao.tone" aria-hidden="true">
                <span class="kb-drop__icone"><i [class]="acao.icon"></i></span>
                {{ acao.texto }}
              </div>
            }

            <div class="kb-col__corpo">
              @if (col.total === 0) {
                <div class="kb-vazio">
                  <span class="kb-vazio__icone" aria-hidden="true"><i [class]="col.def.vazio.icon"></i></span>
                  <strong>{{ col.def.vazio.titulo }}</strong>
                  <span>{{ col.def.vazio.texto }}</span>
                </div>
              } @else {
                @for (g of col.grupos; track g.id) {
                  @let fechado = estaRecolhido(g);
                  <div class="kb-grupo" [attr.data-tone]="g.tone" [class.kb-grupo--fechado]="fechado" [class.kb-grupo--vazio]="g.total === 0">
                    <button type="button" class="kb-grupo__head" [attr.aria-expanded]="!fechado" [disabled]="g.total === 0" (click)="alternarGrupo(g)">
                      <i class="pi pi-chevron-down kb-grupo__seta" aria-hidden="true"></i>
                      <span class="kb-grupo__label">{{ g.label }}</span>
                      <span class="kb-grupo__count">{{ g.total }}</span>
                    </button>
                    @if (g.total > 0) {
                      <div class="kb-grupo__corpo" [attr.inert]="fechado ? '' : null">
                        <div class="kb-grupo__lista">
                          @for (item of g.itens; track item.id; let i = $index) {
                            <app-solicitacao-comercial-kanban-card
                              [style.--i]="i < 12 ? i : 12"
                              [item]="item"
                              [tecnico]="true"
                              [nomeObra]="nomeObra()(item.idObra)"
                              [arrastando]="arrastando()?.item?.id === item.id"
                              [arrastavel]="arrastavel"
                              (cardClicked)="abrir.emit($event)"
                              (dragStarted)="iniciarArraste($event, col.def.id)"
                              (dragEnded)="encerrarArraste()"
                              (actionTriggered)="aoAgir($event.item, $event.action)"
                            />
                          }
                          @if (g.total > g.itens.length) {
                            <button type="button" class="kb-mais" (click)="verNaTabela.emit()">
                              Ver todas as {{ g.total }} na tabela <i class="pi pi-arrow-right" aria-hidden="true"></i>
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              }
            </div>
          </section>
        }
      </div>
    }
  `
})
export class SolicitacoesTecnicasQuadroComponent {
  private readonly service = inject(SolicitacaoMaterialTecnicaService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Recorte da tela no formato do backend. */
  readonly filtros = input<Record<string, unknown>>({});
  /** Nome da obra pelo id (a tela já tem o cadastro carregado). */
  readonly nomeObra = input<(idObra?: string | null) => string | null>(() => null);
  readonly abrir = output<Card>();
  /** Ação do cartão ou do arraste; a tela abre o painel lateral correspondente. */
  readonly acao = output<{ item: Card; acao: string }>();
  readonly verNaTabela = output<void>();

  protected readonly agrupamento = signal<AgrupamentoQuadroTecnico>(lerAgrupamento());
  private readonly recolhidos = signal<Record<string, boolean>>(lerRecolhidos());
  private readonly versao = signal(0);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly faixas = signal<Faixa[] | null>(null);

  protected readonly colunaVisivel = signal(0);
  protected readonly arrastavel = typeof matchMedia === 'function' ? matchMedia('(pointer: fine)').matches : true;
  protected readonly arrastando = signal<{ item: Card; de: ColunaId } | null>(null);
  protected readonly sobre = signal<ColunaId | null>(null);

  private readonly consulta = computed(() => ({ filtros: this.filtros(), versao: this.versao() }));

  protected readonly colunas = computed<ColunaVisivel[]>(() => {
    const agrupamento = this.agrupamento();
    const faixas = this.faixas() ?? [];
    return COLUNAS.map((def) => {
      const minhas = def.faixas.map((f) => faixas.find((x) => x.def.id === f.id) ?? { def: f, itens: [], total: 0 });
      const itens = minhas.flatMap((f) => f.itens);
      const grupos =
        agrupamento === 'situacao' || def.id === 'ENCERRADAS'
          ? minhas.map((f) => ({ id: f.def.id, label: f.def.label, tone: f.def.tone, itens: f.itens, total: f.total }))
          : agrupamento === 'pendencia'
            ? porPendencia(itens)
            : porPrazo(itens);
      return {
        def,
        grupos,
        total: minhas.reduce((acc, f) => acc + f.total, 0),
        atrasadas: def.id === 'ENCERRADAS' ? 0 : itens.filter((s) => s.atrasada).length,
        pendencias: def.id === 'ENCERRADAS' ? 0 : itens.filter((s) => s.possuiPendencia).length
      };
    });
  });

  constructor() {
    toObservable(this.consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap(({ filtros }) =>
          this.buscar(filtros).pipe(
            catchError((err) => {
              this.erro.set(getErrorMessage(err));
              return of(null);
            })
          )
        ),
        takeUntilDestroyed()
      )
      .subscribe((faixas) => {
        this.carregando.set(false);
        if (faixas) this.faixas.set(faixas);
      });
  }

  recarregar(): void {
    this.versao.update((v) => v + 1);
  }

  /** Uma consulta por faixa: totais exatos por grupo, respeitando o recorte da tela. */
  private buscar(filtros: Record<string, unknown>): Observable<Faixa[]> {
    const { etapa, statuses, ...resto } = filtros as { etapa?: string; statuses?: StatusSolicitacaoMaterial[] };
    const faixas = COLUNAS.flatMap((c) => c.faixas).filter((f) => {
      const fe = (f.filtro as { etapa?: string }).etapa;
      if (etapa && fe !== etapa) return false;
      if (!etapa && statuses?.length && f.filtro.statuses && !f.filtro.statuses.some((s) => statuses.includes(s))) return false;
      return true;
    });
    if (!faixas.length) return of([]);
    return forkJoin(
      faixas.map((f) =>
        this.service
          .listar({
            ...resto,
            ...(statuses?.length && !f.filtro.statuses ? { statuses } : {}),
            ...f.filtro,
            page: 0,
            size: f.aberta ? LIMITE_ABERTAS : LIMITE_ENCERRADAS,
            sort: f.aberta ? 'dataPrevistaRetirada,asc' : 'dataSolicitacao,desc'
          } as SolicitacaoMaterialFilter)
          .pipe(map((r) => ({ def: f, itens: r.content ?? [], total: r.page?.totalElements ?? r.content?.length ?? 0 })))
      )
    );
  }

  protected agrupar(valor: AgrupamentoQuadroTecnico): void {
    this.agrupamento.set(valor);
    salvar(CHAVE_AGRUPAMENTO, valor);
  }

  protected estaRecolhido(g: GrupoKanban): boolean {
    return g.total === 0 || (this.recolhidos()[`${this.agrupamento()}:${g.id}`] ?? false);
  }

  protected alternarGrupo(g: GrupoKanban): void {
    const chave = `${this.agrupamento()}:${g.id}`;
    this.recolhidos.update((r) => ({ ...r, [chave]: !this.estaRecolhido(g) }));
    salvar(CHAVE_RECOLHIDOS, JSON.stringify(this.recolhidos()));
  }

  protected aoRolarQuadro(evento: Event): void {
    const quadro = evento.target as HTMLElement;
    const primeira = quadro.querySelector<HTMLElement>('.kb-col');
    if (!primeira) return;
    const passo = primeira.offsetWidth + parseFloat(getComputedStyle(quadro).columnGap || '0');
    this.colunaVisivel.set(Math.max(0, Math.min(COLUNAS.length - 1, Math.round(quadro.scrollLeft / passo))));
  }

  protected irParaColuna(id: ColunaId): void {
    const alvo = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`#kbt-col-${id}`);
    alvo?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  }

  // --- Arrastar e soltar (atalho das mesmas ações dos botões) ---

  protected acaoDeSoltar(coluna: ColunaId): { texto: string; icon: string; tone: GeoTone; acao: string } | null {
    const arraste = this.arrastando();
    if (!arraste || arraste.de === coluna) return null;
    const acoes = (arraste.item.acoesPermitidas ?? []) as string[];
    if (arraste.de === 'PLANEJAMENTO' && coluna === 'SEPARACAO' && acoes.includes('EDITAR_PLANEJAMENTO'))
      return { texto: 'Solte para planejar', icon: 'pi pi-calendar-plus', tone: 'info', acao: 'PLANEJAR' };
    if (arraste.de === 'SEPARACAO' && coluna === 'ENTREGA' && acoes.includes('CONCLUIR_SEPARACAO'))
      return { texto: 'Solte para concluir a separação', icon: 'pi pi-box', tone: 'success', acao: 'CONCLUIR_SEPARACAO' };
    if (arraste.de === 'SEPARACAO' && coluna === 'ENTREGA' && acoes.includes('PULAR_SEPARACAO'))
      return { texto: 'Solte para dispensar a separação', icon: 'pi pi-forward', tone: 'info', acao: 'PULAR_SEPARACAO' };
    if (arraste.de === 'ENTREGA' && coluna === 'ENCERRADAS' && acoes.includes('ENTREGAR'))
      return { texto: 'Solte para registrar a entrega', icon: 'pi pi-truck', tone: 'success', acao: 'ENTREGAR' };
    if (arraste.de === 'ENTREGA' && coluna === 'ENCERRADAS' && acoes.includes('CONFIRMAR_DEVOLUCAO'))
      return { texto: 'Solte para receber a devolução', icon: 'pi pi-undo', tone: 'success', acao: 'DEVOLVER' };
    if (coluna === 'ENCERRADAS' && acoes.includes('REJEITAR'))
      return { texto: 'Solte para rejeitar', icon: 'pi pi-times', tone: 'danger', acao: 'REJEITAR' };
    return null;
  }

  protected iniciarArraste(item: Card, de: ColunaId): void {
    this.arrastando.set({ item, de });
  }

  protected encerrarArraste(): void {
    this.arrastando.set(null);
    this.sobre.set(null);
  }

  protected aoPassar(evento: DragEvent, coluna: ColunaId): void {
    if (!this.acaoDeSoltar(coluna)) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    this.sobre.set(coluna);
  }

  protected aoSair(evento: DragEvent, coluna: ColunaId): void {
    const destino = evento.relatedTarget as Node | null;
    if (destino && (evento.currentTarget as HTMLElement).contains(destino)) return;
    if (this.sobre() === coluna) this.sobre.set(null);
  }

  protected aoSoltar(evento: DragEvent, coluna: ColunaId): void {
    evento.preventDefault();
    const acao = this.acaoDeSoltar(coluna);
    const item = this.arrastando()?.item;
    this.encerrarArraste();
    if (acao && item) this.acao.emit({ item, acao: acao.acao });
  }

  protected aoAgir(item: Card, acao: AcaoCardComercial): void {
    if (acao === 'DETALHAR') this.abrir.emit(item);
    else this.acao.emit({ item, acao });
  }
}

function porPendencia(itens: Card[]): GrupoKanban[] {
  const com = itens.filter((i) => i.possuiPendencia);
  const sem = itens.filter((i) => !i.possuiPendencia);
  return [
    { id: 'PEND:SIM', label: 'Com pendência', tone: 'warning' as GeoTone, itens: com, total: com.length },
    { id: 'PEND:NAO', label: 'Sem pendência', tone: 'success' as GeoTone, itens: sem, total: sem.length }
  ].filter((g) => g.total > 0);
}

function porPrazo(itens: Card[]): GrupoKanban[] {
  const hoje = new Date();
  const hojeIso = isoCivil(hoje);
  const semana = isoCivil(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7));
  const dia = (s: Card) => s.dataPrevista?.substring(0, 10) ?? '';
  const faixas: { id: string; label: string; tone: GeoTone; teste: (s: Card) => boolean }[] = [
    { id: 'PRAZO:ATRASADAS', label: 'Atrasadas', tone: 'danger', teste: (s) => !!s.atrasada },
    { id: 'PRAZO:HOJE', label: 'Saque hoje', tone: 'warning', teste: (s) => dia(s) === hojeIso },
    { id: 'PRAZO:SEMANA', label: 'Próximos 7 dias', tone: 'info', teste: (s) => !!dia(s) && dia(s) > hojeIso && dia(s) <= semana },
    { id: 'PRAZO:DEPOIS', label: 'Mais adiante', tone: 'neutral', teste: (s) => !!dia(s) && dia(s) > semana },
    { id: 'PRAZO:SEM', label: 'Sem data de saque', tone: 'neutral', teste: () => true }
  ];
  const restantes = new Set(itens);
  return faixas
    .map((f): GrupoKanban => {
      const lista = [...restantes].filter(f.teste);
      lista.forEach((s) => restantes.delete(s));
      return { id: f.id, label: f.label, tone: f.tone, itens: lista, total: lista.length };
    })
    .filter((g) => g.total > 0);
}

/** Devolução sem data também entra no fluxo; usado para não confundir os filtros. */
export function ehDevolucaoTecnica(item: Card): boolean {
  return !tipoTecnicoEhAdicao(item.tipo);
}

function salvar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* preferência opcional */
  }
}

function lerAgrupamento(): AgrupamentoQuadroTecnico {
  try {
    const v = localStorage.getItem(CHAVE_AGRUPAMENTO);
    return v === 'pendencia' || v === 'prazo' ? v : 'situacao';
  } catch {
    return 'situacao';
  }
}

function lerRecolhidos(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_RECOLHIDOS) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
