import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { GeoAsyncStateComponent, GeoTone } from '@geo/ui';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { FechamentoFiltro, FechamentoResumo, SituacaoFechamento, TipoFechamento } from '../../../core/models/fechamento-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import { AcaoFechamento, FechamentoKanbanCardComponent } from './fechamento-kanban-card.component';
import { SITUACOES, TIPOS_FECHAMENTO, tipoFechamento } from './fechamento-ui';

type Agrupamento = 'situacao' | 'tipo' | 'pendencia' | 'prazo';
type ColunaId = 'RESERVA' | 'MOVIMENTACAO' | 'PARCIAL' | 'ENCERRADAS';

interface FaixaDef {
  situacao: SituacaoFechamento;
  label: string;
  tone: GeoTone;
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

/** Colunas pelo que falta: reserva, movimentação, o restante e o que já saiu da fila. */
const COLUNAS: readonly ColunaDef[] = [
  {
    id: 'RESERVA',
    titulo: 'Reserva',
    subtitulo: 'Falta o número da reserva',
    icon: 'pi pi-hashtag',
    tone: 'warning',
    faixas: [{ situacao: 'AGUARDANDO_RESERVA', label: 'Aguardando reserva', tone: 'warning', aberta: true }],
    vazio: { icon: 'pi pi-check-circle', titulo: 'Nada sem reserva', texto: 'Todas as solicitações deste recorte já têm reserva.' }
  },
  {
    id: 'MOVIMENTACAO',
    titulo: 'Movimentação',
    subtitulo: 'Com reserva, aguardando o almoxarifado',
    icon: 'pi pi-arrow-right-arrow-left',
    tone: 'warning',
    faixas: [{ situacao: 'AGUARDANDO_MOVIMENTACAO', label: 'A movimentar', tone: 'warning', aberta: true }],
    vazio: { icon: 'pi pi-arrow-right-arrow-left', titulo: 'Nada para movimentar', texto: 'Com a reserva registrada, a solicitação aparece aqui.' }
  },
  {
    id: 'PARCIAL',
    titulo: 'Em parte',
    subtitulo: 'Movimentadas em parte, com restante pendente',
    icon: 'pi pi-percentage',
    tone: 'info',
    faixas: [{ situacao: 'MOVIMENTADA_PARCIALMENTE', label: 'Restante a movimentar', tone: 'info', aberta: true }],
    vazio: { icon: 'pi pi-percentage', titulo: 'Nada pela metade', texto: 'Quando uma movimentação for parcial, a solicitação aparece aqui.' }
  },
  {
    id: 'ENCERRADAS',
    titulo: 'Encerradas',
    subtitulo: 'Movimentadas ou canceladas',
    icon: 'pi pi-inbox',
    tone: 'neutral',
    faixas: [
      { situacao: 'MOVIMENTADA', label: SITUACOES.MOVIMENTADA.label, tone: 'success', aberta: false },
      { situacao: 'CANCELADA', label: SITUACOES.CANCELADA.label, tone: 'neutral', aberta: false }
    ],
    vazio: { icon: 'pi pi-inbox', titulo: 'Nada encerrado ainda', texto: 'As solicitações concluídas deste recorte aparecem aqui.' }
  }
];

const LIMITE_ABERTAS = 200;
const LIMITE_ENCERRADAS = 15;
const CHAVE_RECOLHIDOS = 'geo_kanban_fechamento_grupos_recolhidos';
const CHAVE_AGRUPAMENTO = 'geo_kanban_fechamento_agrupamento';

interface Faixa {
  def: FaixaDef;
  itens: FechamentoResumo[];
  total: number;
}

interface Grupo {
  id: string;
  label: string;
  tone: GeoTone;
  itens: FechamentoResumo[];
  total: number;
}

interface ColunaVisivel {
  def: ColunaDef;
  grupos: Grupo[];
  total: number;
  atrasadas: number;
  pendencias: number;
}

/**
 * Quadro do encerramento, no mesmo modelo dos quadros comercial e técnico: colunas pela próxima ação,
 * agrupamento e arrastar como atalho das mesmas ações dos botões.
 */
@Component({
  selector: 'app-fechamento-quadro',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoAsyncStateComponent, FechamentoKanbanCardComponent],
  styleUrl: '../../almoxarifado/solicitacoes-material/solicitacoes-comerciais-kanban/solicitacoes-comerciais-kanban.component.css',
  template: `
    <div class="kb-bar">
      <div class="kb-agrupar">
        <span id="kbf-agrupar-rotulo">Agrupar por</span>
        <div class="kb-seg" role="group" aria-labelledby="kbf-agrupar-rotulo">
          <button type="button" [attr.aria-pressed]="agrupamento() === 'situacao'" (click)="agrupar('situacao')"><i class="pi pi-sitemap" aria-hidden="true"></i>Situação</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'tipo'" (click)="agrupar('tipo')"><i class="pi pi-tags" aria-hidden="true"></i>Tipo</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'pendencia'" (click)="agrupar('pendencia')"><i class="pi pi-flag" aria-hidden="true"></i>Pendência</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'prazo'" (click)="agrupar('prazo')"><i class="pi pi-clock" aria-hidden="true"></i>Prazo</button>
        </div>
      </div>
      <span class="kb-dica"><i class="pi pi-arrows-alt" aria-hidden="true"></i>Arraste um cartão para registrar a reserva ou movimentar</span>
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
      <div class="kb-board" [class.kb-board--arrastando]="!!arrastando()" [class.kb-board--atualizando]="carregando()" role="region" aria-label="Quadro do encerramento de obras" (scroll)="aoRolarQuadro($event)">
        @for (col of colunas(); track col.def.id) {
          @let acao = acaoDeSoltar(col.def.id);
          <section
            class="kb-col"
            [id]="'kbf-col-' + col.def.id"
            [attr.data-tone]="col.def.tone"
            [class.kb-col--alvo]="!!acao"
            [class.kb-col--sobre]="!!acao && sobre() === col.def.id"
            [class.kb-col--inerte]="!!arrastando() && !acao && arrastando()!.de !== col.def.id"
            [attr.aria-labelledby]="'kbf-titulo-' + col.def.id"
            (dragover)="aoPassar($event, col.def.id)"
            (dragleave)="aoSair($event, col.def.id)"
            (drop)="aoSoltar($event, col.def.id)"
          >
            <header class="kb-col__head">
              <span class="kb-col__icone" aria-hidden="true"><i [class]="col.def.icon"></i></span>
              <div class="kb-col__titulos">
                <h3 [id]="'kbf-titulo-' + col.def.id">{{ col.def.titulo }} <span class="kb-col__total">{{ col.total }}</span></h3>
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
                            <app-fechamento-kanban-card
                              [style.--i]="i < 12 ? i : 12"
                              [item]="item"
                              [arrastando]="arrastando()?.item?.id === item.id"
                              [arrastavel]="arrastavel"
                              (cardClicked)="abrir.emit($event)"
                              (dragStarted)="iniciarArraste($event, col.def.id)"
                              (dragEnded)="encerrarArraste()"
                              (actionTriggered)="acao$.emit({ item: $event.item, acao: $event.action })"
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
export class FechamentoQuadroComponent {
  private readonly service = inject(FechamentoObraService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Recorte da tela, sem paginação. */
  readonly filtros = input<FechamentoFiltro>({});
  readonly abrir = output<FechamentoResumo>();
  /** Ação do cartão ou do arraste; a tela abre o painel lateral correspondente. */
  readonly acao$ = output<{ item: FechamentoResumo; acao: AcaoFechamento }>({ alias: 'acao' });
  readonly verNaTabela = output<void>();

  protected readonly agrupamento = signal<Agrupamento>(lerAgrupamento());
  private readonly recolhidos = signal<Record<string, boolean>>(lerRecolhidos());
  private readonly versao = signal(0);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly faixas = signal<Faixa[] | null>(null);

  protected readonly colunaVisivel = signal(0);
  protected readonly arrastavel = typeof matchMedia === 'function' ? matchMedia('(pointer: fine)').matches : true;
  protected readonly arrastando = signal<{ item: FechamentoResumo; de: ColunaId } | null>(null);
  protected readonly sobre = signal<ColunaId | null>(null);

  private readonly consulta = computed(() => ({ filtros: this.filtros(), versao: this.versao() }));

  protected readonly colunas = computed<ColunaVisivel[]>(() => {
    const agrupamento = this.agrupamento();
    const faixas = this.faixas() ?? [];
    return COLUNAS.map((def) => {
      const minhas = def.faixas.map((f) => faixas.find((x) => x.def.situacao === f.situacao) ?? { def: f, itens: [], total: 0 });
      const itens = minhas.flatMap((f) => f.itens);
      const encerrada = def.id === 'ENCERRADAS';
      const grupos =
        agrupamento === 'tipo'
          ? porTipo(itens)
          : agrupamento === 'situacao' || encerrada
            ? minhas.map((f) => ({ id: f.def.situacao, label: f.def.label, tone: f.def.tone, itens: f.itens, total: f.total }))
            : agrupamento === 'pendencia'
              ? porPendencia(itens)
              : porPrazo(itens);
      return {
        def,
        grupos,
        total: minhas.reduce((acc, f) => acc + f.total, 0),
        atrasadas: encerrada ? 0 : itens.filter((s) => s.prazoVigente.situacao === 'ATRASADO').length,
        pendencias: encerrada ? 0 : itens.filter((s) => s.possuiPendencia).length
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

  /** Uma consulta por situação: totais exatos por grupo, respeitando o recorte da tela. */
  private buscar(filtros: FechamentoFiltro): Observable<Faixa[]> {
    const faixas = COLUNAS.flatMap((c) => c.faixas).filter((f) => !filtros.situacoes?.length || filtros.situacoes.includes(f.situacao));
    if (!faixas.length) return of([]);
    return forkJoin(
      faixas.map((f) =>
        this.service
          .listar({
            ...filtros,
            situacoes: [f.situacao],
            page: 0,
            size: f.aberta ? LIMITE_ABERTAS : LIMITE_ENCERRADAS,
            ordenacao: f.aberta ? 'prazo' : 'solicitacao',
            direcao: f.aberta ? 'asc' : 'desc'
          })
          .pipe(map((r) => ({ def: f, itens: r.content ?? [], total: r.page?.totalElements ?? r.content?.length ?? 0 })))
      )
    );
  }

  protected agrupar(valor: Agrupamento): void {
    this.agrupamento.set(valor);
    salvar(CHAVE_AGRUPAMENTO, valor);
  }

  protected estaRecolhido(g: Grupo): boolean {
    return g.total === 0 || (this.recolhidos()[`${this.agrupamento()}:${g.id}`] ?? false);
  }

  protected alternarGrupo(g: Grupo): void {
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
    const alvo = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`#kbf-col-${id}`);
    alvo?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  }

  // --- Arrastar e soltar (atalho das mesmas ações dos botões) ---

  protected acaoDeSoltar(coluna: ColunaId): { texto: string; icon: string; tone: GeoTone; acao: AcaoFechamento } | null {
    const arraste = this.arrastando();
    if (!arraste || arraste.de === coluna) return null;
    const { registrarReserva, movimentar } = arraste.item.acoes;
    if (arraste.de === 'RESERVA' && coluna === 'MOVIMENTACAO' && registrarReserva)
      return { texto: 'Solte para registrar a reserva', icon: 'pi pi-hashtag', tone: 'info', acao: 'RESERVA' };
    if (arraste.de === 'MOVIMENTACAO' && coluna === 'PARCIAL' && movimentar)
      return { texto: 'Solte para movimentar uma parte', icon: 'pi pi-percentage', tone: 'info', acao: 'MOVIMENTAR' };
    if ((arraste.de === 'MOVIMENTACAO' || arraste.de === 'PARCIAL') && coluna === 'ENCERRADAS' && movimentar)
      return { texto: 'Solte para marcar como movimentado', icon: 'pi pi-check-square', tone: 'success', acao: 'MOVIMENTAR' };
    return null;
  }

  protected iniciarArraste(item: FechamentoResumo, de: ColunaId): void {
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
    if (acao && item) this.acao$.emit({ item, acao: acao.acao });
  }
}

function porTipo(itens: FechamentoResumo[]): Grupo[] {
  return TIPOS_FECHAMENTO.map((t): Grupo => {
    const lista = itens.filter((i) => i.tipo === t.value);
    return { id: `TIPO:${t.value}`, label: rotuloTipo(t.value), tone: t.adicao ? 'info' : 'neutral', itens: lista, total: lista.length };
  }).filter((g) => g.total > 0);
}

function rotuloTipo(tipo: TipoFechamento): string {
  return `${tipo} · ${tipoFechamento(tipo).nome}`;
}

function porPendencia(itens: FechamentoResumo[]): Grupo[] {
  const com = itens.filter((i) => i.possuiPendencia);
  const sem = itens.filter((i) => !i.possuiPendencia);
  return [
    { id: 'PEND:SIM', label: 'Com pendência', tone: 'warning' as GeoTone, itens: com, total: com.length },
    { id: 'PEND:NAO', label: 'Sem pendência', tone: 'success' as GeoTone, itens: sem, total: sem.length }
  ].filter((g) => g.total > 0);
}

function porPrazo(itens: FechamentoResumo[]): Grupo[] {
  const faixas: { id: string; label: string; tone: GeoTone; teste: (s: FechamentoResumo) => boolean }[] = [
    { id: 'PRAZO:ATRASADO', label: 'Atrasadas', tone: 'danger', teste: (s) => s.prazoVigente.situacao === 'ATRASADO' },
    { id: 'PRAZO:BREVE', label: 'Vencem em breve', tone: 'warning', teste: (s) => s.prazoVigente.situacao === 'VENCE_EM_BREVE' },
    { id: 'PRAZO:OK', label: 'No prazo', tone: 'success', teste: () => true }
  ];
  const restantes = new Set(itens);
  return faixas
    .map((f): Grupo => {
      const lista = [...restantes].filter(f.teste);
      lista.forEach((s) => restantes.delete(s));
      return { id: f.id, label: f.label, tone: f.tone, itens: lista, total: lista.length };
    })
    .filter((g) => g.total > 0);
}

function salvar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* preferência opcional */
  }
}

function lerAgrupamento(): Agrupamento {
  try {
    const v = localStorage.getItem(CHAVE_AGRUPAMENTO);
    return v === 'tipo' || v === 'pendencia' || v === 'prazo' ? v : 'situacao';
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
