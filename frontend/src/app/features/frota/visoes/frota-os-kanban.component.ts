import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { GeoAsyncStateComponent, GeoTone, NotificationService } from '@geo/ui';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';

import {
  Criticidade,
  FiltroOrdensServico,
  OpcoesFrota,
  OrdemServico,
  OrdemServicoDetalhe,
  ROTULO_CRITICIDADE,
  SituacaoOrdemServico,
  rotuloOs
} from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';
import { acessoFrota } from '../shared/frota-acesso';
import { FrotaJustificativaDrawerComponent } from '../shared/frota-justificativa-drawer.component';
import { EtapaOrdemServico, FrotaOrdemServicoEtapaComponent } from '../ordens-servico/frota-ordem-servico-etapa.component';
import { FrotaOrdemServicoConclusaoComponent, ModoConclusao } from '../ordens-servico/frota-ordem-servico-conclusao.component';
import { AcaoCardOs, FrotaOsKanbanCardComponent } from './frota-os-kanban-card.component';

export type AgrupamentoQuadroOs = 'situacao' | 'criticidade' | 'oficina' | 'base';
export type ColunaQuadroOs = 'A_AGENDAR' | 'AGENDADAS' | 'EM_EXECUCAO' | 'CONCLUIDAS';

interface ColunaDef {
  id: ColunaQuadroOs;
  titulo: string;
  subtitulo: string;
  icon: string;
  tone: GeoTone;
  situacao: SituacaoOrdemServico;
  ordem: string;
  limite: number;
  vazio: { icon: string; titulo: string; texto: string };
}

/** Colunas pela próxima ação da gestão: agendar, iniciar, concluir; e o que fechou na semana. */
const COLUNAS: readonly ColunaDef[] = [
  {
    id: 'A_AGENDAR', titulo: 'A agendar', subtitulo: 'Abertas, esperando data', icon: 'pi pi-inbox', tone: 'warning',
    situacao: 'PENDENTE', ordem: 'abertaEm,asc', limite: 200,
    vazio: { icon: 'pi pi-check-circle', titulo: 'Nada para agendar', texto: 'Todas as OS abertas deste recorte já têm data.' }
  },
  {
    id: 'AGENDADAS', titulo: 'Agendadas', subtitulo: 'Com data marcada na oficina', icon: 'pi pi-calendar', tone: 'info',
    situacao: 'AGENDADA', ordem: 'agendadaPara,asc', limite: 200,
    vazio: { icon: 'pi pi-calendar', titulo: 'Nenhuma OS agendada', texto: 'Quando uma OS ganhar data, ela aparece aqui.' }
  },
  {
    id: 'EM_EXECUCAO', titulo: 'Em execução', subtitulo: 'Na oficina agora', icon: 'pi pi-cog', tone: 'brand',
    situacao: 'EM_ANDAMENTO', ordem: 'previsaoTermino,asc', limite: 200,
    vazio: { icon: 'pi pi-cog', titulo: 'Nada em execução', texto: 'As OS iniciadas aparecem aqui até a conclusão.' }
  },
  {
    id: 'CONCLUIDAS', titulo: 'Concluídas', subtitulo: 'Nos últimos 7 dias', icon: 'pi pi-check-circle', tone: 'success',
    situacao: 'CONCLUIDA', ordem: 'fimReal,desc', limite: 50,
    vazio: { icon: 'pi pi-inbox', titulo: 'Nada concluído na semana', texto: 'As OS concluídas nos últimos 7 dias aparecem aqui.' }
  }
];

const CHAVE_RECOLHIDOS = 'geo_kanban_frota_os_grupos_recolhidos';
const CHAVE_AGRUPAMENTO = 'geo_kanban_frota_os_agrupamento';

interface Faixa {
  coluna: ColunaQuadroOs;
  itens: OrdemServico[];
  total: number;
}

/** Tons do quadro: os do design system e as cores de criticidade (vermelho, laranja, amarelo, verde). */
type TomGrupo = GeoTone | 'crit-urgente' | 'crit-alta' | 'crit-media' | 'crit-baixa';

const TOM_GRUPO_CRITICIDADE: Record<Criticidade, TomGrupo> = {
  URGENTE: 'crit-urgente',
  ALTA: 'crit-alta',
  MEDIA: 'crit-media',
  BAIXA: 'crit-baixa'
};

interface Grupo {
  id: string;
  label: string;
  tone: TomGrupo;
  itens: OrdemServico[];
  total: number;
}

interface ColunaVisivel {
  def: ColunaDef;
  grupos: Grupo[];
  total: number;
  carregados: number;
  atrasadas: number;
  parados: number;
}

interface AcaoSoltar {
  texto: string;
  icon: string;
  tone: GeoTone;
  acao: 'AGENDAR' | 'INICIAR' | 'CONCLUIR' | 'REABRIR';
}

/**
 * Quadro das OS pela próxima ação, no padrão do quadro das solicitações comerciais. Arrastar não
 * muda a situação: abre o mesmo formulário da ficha da OS (agendar, iniciar ou concluir) e a OS só
 * muda ao salvar. No toque, o botão do cartão faz a mesma coisa.
 */
@Component({
  selector: 'app-frota-os-kanban',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoAsyncStateComponent, FrotaOsKanbanCardComponent, FrotaOrdemServicoEtapaComponent, FrotaOrdemServicoConclusaoComponent, FrotaJustificativaDrawerComponent],
  styleUrl: './frota-os-kanban.component.css',
  template: `
    <div class="kb-bar">
      <div class="kb-agrupar">
        <span id="kb-os-agrupar">Agrupar por</span>
        <div class="kb-seg" role="group" aria-labelledby="kb-os-agrupar">
          <button type="button" [attr.aria-pressed]="agrupamento() === 'situacao'" (click)="agrupar('situacao')"><i class="pi pi-sitemap" aria-hidden="true"></i>Prazo</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'criticidade'" (click)="agrupar('criticidade')"><i class="pi pi-flag" aria-hidden="true"></i>Criticidade</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'oficina'" (click)="agrupar('oficina')"><i class="pi pi-wrench" aria-hidden="true"></i>Oficina</button>
          <button type="button" [attr.aria-pressed]="agrupamento() === 'base'" (click)="agrupar('base')"><i class="pi pi-map-marker" aria-hidden="true"></i>Base</button>
        </div>
      </div>
      @if (podeArrastar()) {
        <span class="kb-dica"><i class="pi pi-arrows-alt" aria-hidden="true"></i>Arraste um cartão para agendar, iniciar ou concluir</span>
      }
    </div>

    <nav class="kb-atalhos" aria-label="Ir para a coluna">
      @for (col of colunas(); track col.def.id) {
        <button type="button" [attr.data-tone]="col.def.tone" [attr.aria-current]="colunaVisivel() === $index ? 'true' : null" (click)="irParaColuna(col.def.id)">
          <span class="kb-atalhos__dot" aria-hidden="true"></span>{{ col.def.titulo }}<strong>{{ col.total }}</strong>
        </button>
      }
    </nav>

    <p class="kb-sr" aria-live="polite">{{ anuncio() }}</p>

    @if (erro()) {
      <geo-async-state state="error" title="Não foi possível carregar o quadro" [description]="erro()!" actionLabel="Tentar novamente" (action)="recarregar()" />
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
      <div class="kb-board" [class.kb-board--arrastando]="!!arrastando()" [class.kb-board--atualizando]="carregando()" role="region" aria-label="Quadro de ordens de serviço" (scroll)="aoRolarQuadro($event)">
        @for (col of colunas(); track col.def.id) {
          @let acao = acaoDeSoltar(col.def.id);
          <section
            class="kb-col"
            [id]="'kb-os-col-' + col.def.id"
            [attr.data-tone]="col.def.tone"
            [class.kb-col--alvo]="!!acao"
            [class.kb-col--sobre]="!!acao && sobre() === col.def.id"
            [class.kb-col--inerte]="!!arrastando() && !acao && arrastando()!.de !== col.def.id"
            [attr.aria-labelledby]="'kb-os-titulo-' + col.def.id"
            (dragover)="aoPassar($event, col.def.id)"
            (dragleave)="aoSair($event, col.def.id)"
            (drop)="aoSoltar($event, col.def.id)"
          >
            <header class="kb-col__head">
              <span class="kb-col__icone" aria-hidden="true"><i [class]="col.def.icon"></i></span>
              <div class="kb-col__titulos">
                <h3 [id]="'kb-os-titulo-' + col.def.id">{{ col.def.titulo }} <span class="kb-col__total">{{ col.total }}</span></h3>
                <p>{{ col.def.subtitulo }}</p>
              </div>
            </header>

            @if (col.atrasadas || col.parados) {
              <div class="kb-col__alertas">
                @if (col.atrasadas) {
                  <span class="kb-alerta kb-alerta--perigo"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>{{ col.atrasadas }} {{ col.atrasadas === 1 ? 'atrasada' : 'atrasadas' }}</span>
                }
                @if (col.parados) {
                  <span class="kb-alerta kb-alerta--aviso"><i class="pi pi-stop-circle" aria-hidden="true"></i>{{ col.parados }} {{ col.parados === 1 ? 'veículo parado' : 'veículos parados' }}</span>
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
                  @let fechado = estaRecolhido(col.def.id, g);
                  <div class="kb-grupo" [attr.data-tone]="g.tone" [class.kb-grupo--fechado]="fechado" [class.kb-grupo--vazio]="g.total === 0">
                    <button type="button" class="kb-grupo__head" [attr.aria-expanded]="!fechado" [disabled]="g.total === 0" (click)="alternarGrupo(col.def.id, g)">
                      <i class="pi pi-chevron-down kb-grupo__seta" aria-hidden="true"></i>
                      <span class="kb-grupo__label">{{ g.label }}</span>
                      <span class="kb-grupo__count">{{ g.total }}</span>
                    </button>
                    @if (g.total > 0) {
                      <div class="kb-grupo__corpo" [attr.inert]="fechado ? '' : null">
                        <div class="kb-grupo__lista">
                          @for (item of g.itens; track item.id; let i = $index) {
                            <app-frota-os-kanban-card
                              [style.--i]="i < 12 ? i : 12"
                              [item]="item"
                              [arrastando]="arrastando()?.item?.id === item.id"
                              [arrastavel]="arrastavel && podeArrastar() && (col.def.id !== 'CONCLUIDAS' || acesso.executarOs())"
                              [podeAgir]="podeAgir(item)"
                              [podeCancelar]="acesso.editarOs()"
                              [podeReabrir]="acesso.executarOs()"
                              (cardClicked)="abrir.emit($event)"
                              (dragStarted)="iniciarArraste($event, col.def.id)"
                              (dragEnded)="encerrarArraste()"
                              (actionTriggered)="aoAgir($event.item, $event.action)"
                            />
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
                @if (col.total > col.carregados) {
                  <button type="button" class="kb-mais" (click)="verNaTabela.emit(col.def.situacao)">
                    Ver todas as {{ col.total }} na tabela <i class="pi pi-arrow-right" aria-hidden="true"></i>
                  </button>
                }
              }
            </div>
          </section>
        }
      </div>
    }

    <app-frota-ordem-servico-etapa [(visivel)]="etapaAberta" [etapa]="etapa()" [ordem]="ordemSelecionada()" (salvo)="aoSalvar($event)"></app-frota-ordem-servico-etapa>
    <app-frota-ordem-servico-conclusao [(visivel)]="conclusaoAberta" [ordem]="ordemSelecionada()" [opcoes]="opcoes()" [modo]="modoConclusao()" (salvo)="aoSalvar($event)"></app-frota-ordem-servico-conclusao>
    @if (reabrindo(); as alvo) {
      <app-frota-justificativa-drawer
        [(visivel)]="reaberturaAberta"
        [titulo]="'Voltar ' + rotuloOs(alvo.numero) + ' para em andamento'"
        descricao="A OS sai de Concluídas, a data de fim é apagada e o veículo volta a contar como parado. Se ela já estava finalizada, volta a aceitar lançamentos até a nova conclusão."
        rotuloCampo="O que aconteceu"
        placeholder="Ex.: no teste o freio voltou a fazer barulho"
        rotuloConfirmar="Voltar para em andamento"
        [processando]="processandoReabertura()"
        (confirmado)="reabrir(alvo, $event)"
      ></app-frota-justificativa-drawer>
    }
    @if (cancelando(); as alvo) {
      <app-frota-justificativa-drawer
        [(visivel)]="cancelamentoAberto"
        [titulo]="'Cancelar ' + rotuloOs(alvo.numero)"
        descricao="A OS sai do quadro e o veículo é liberado se estava parado por ela. Compras em aberto no financeiro precisam ser canceladas antes."
        rotuloConfirmar="Cancelar OS"
        [destrutivo]="true"
        [processando]="processandoCancelamento()"
        (confirmado)="cancelar(alvo, $event)"
      ></app-frota-justificativa-drawer>
    }
  `
})
export class FrotaOsKanbanComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly acesso = acessoFrota();

  /** Recorte da tela no formato do backend; a situação é dada pelas colunas. */
  readonly filtros = input<FiltroOrdensServico>({});
  readonly opcoes = input<OpcoesFrota | null>(null);
  readonly abrir = output<OrdemServico>();
  /** OS concluída com valores pendentes: abre a ficha na aba Execução. */
  readonly lancarValores = output<OrdemServico>();
  /** Abre o relatório de uma OS concluída. */
  readonly relatorio = output<OrdemServico>();
  /** "Ver todas": a tela troca para a tabela nessa situação. */
  readonly verNaTabela = output<SituacaoOrdemServico>();
  /** Uma etapa foi salva (a tela atualiza os indicadores). */
  readonly alterado = output<void>();

  protected readonly agrupamento = signal<AgrupamentoQuadroOs>(lerAgrupamento());
  private readonly recolhidos = signal<Record<string, boolean>>(lerRecolhidos());
  private readonly versao = signal(0);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly faixas = signal<Faixa[] | null>(null);
  protected readonly anuncio = signal('');
  protected readonly colunaVisivel = signal(0);

  protected readonly arrastavel = typeof matchMedia === 'function' ? matchMedia('(pointer: fine)').matches : true;
  protected readonly arrastando = signal<{ item: OrdemServico; de: ColunaQuadroOs } | null>(null);
  protected readonly sobre = signal<ColunaQuadroOs | null>(null);

  protected readonly etapa = signal<EtapaOrdemServico>('agendar');
  protected readonly etapaAberta = signal(false);
  protected readonly conclusaoAberta = signal(false);
  protected readonly modoConclusao = signal<ModoConclusao>('concluir');
  protected readonly reabrindo = signal<OrdemServico | null>(null);
  protected readonly reaberturaAberta = signal(false);
  protected readonly processandoReabertura = signal(false);
  protected readonly ordemSelecionada = signal<OrdemServicoDetalhe | null>(null);
  protected readonly cancelando = signal<OrdemServico | null>(null);
  protected readonly cancelamentoAberto = signal(false);
  protected readonly processandoCancelamento = signal(false);
  protected readonly rotuloOs = rotuloOs;

  protected readonly podeArrastar = computed(() => this.acesso.executarOs() || this.acesso.editarOs());

  private readonly consulta = computed(() => ({ filtros: this.filtros(), versao: this.versao() }));

  protected readonly colunas = computed<ColunaVisivel[]>(() => {
    const agrupamento = this.agrupamento();
    const faixas = this.faixas() ?? [];
    return COLUNAS.map((def) => {
      const faixa = faixas.find((f) => f.coluna === def.id) ?? { coluna: def.id, itens: [], total: 0 };
      const itens = faixa.itens;
      const grupos =
        agrupamento === 'situacao' ? porPrazo(def.id, itens)
          : agrupamento === 'criticidade' ? porCriticidade(itens)
            : porTexto(itens, agrupamento === 'oficina' ? (o) => o.oficina : (o) => o.base ?? 'Sem base');
      return {
        def,
        grupos,
        total: faixa.total,
        carregados: itens.length,
        atrasadas: def.id === 'CONCLUIDAS' ? 0 : itens.filter((o) => atrasada(o)).length,
        parados: def.id === 'CONCLUIDAS' ? 0 : itens.filter((o) => o.paradaEmCurso).length
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

  /** Uma consulta por coluna: total exato e o mesmo recorte da tabela. */
  private buscar(filtros: FiltroOrdensServico): Observable<Faixa[]> {
    const { situacoes: _ignorada, ...resto } = filtros;
    const semana = new Date();
    semana.setDate(semana.getDate() - 7);
    return forkJoin(
      COLUNAS.map((def) =>
        this.frota
          .listarOrdensServico(
            { ...resto, situacoes: [def.situacao], ...(def.id === 'CONCLUIDAS' ? { concluidaDe: semana.toISOString() } : {}) },
            { page: 0, size: def.limite, sort: [def.ordem] }
          )
          .pipe(map((r) => ({ coluna: def.id, itens: r.content ?? [], total: r.page?.totalElements ?? r.content?.length ?? 0 })))
      )
    );
  }

  protected agrupar(valor: AgrupamentoQuadroOs): void {
    this.agrupamento.set(valor);
    salvar(CHAVE_AGRUPAMENTO, valor);
  }

  protected estaRecolhido(coluna: ColunaQuadroOs, g: Grupo): boolean {
    return g.total === 0 || (this.recolhidos()[`${this.agrupamento()}:${coluna}:${g.id}`] ?? false);
  }

  protected alternarGrupo(coluna: ColunaQuadroOs, g: Grupo): void {
    const chave = `${this.agrupamento()}:${coluna}:${g.id}`;
    this.recolhidos.update((r) => ({ ...r, [chave]: !this.estaRecolhido(coluna, g) }));
    salvar(CHAVE_RECOLHIDOS, JSON.stringify(this.recolhidos()));
  }

  protected aoRolarQuadro(evento: Event): void {
    const quadro = evento.target as HTMLElement;
    const primeira = quadro.querySelector<HTMLElement>('.kb-col');
    if (!primeira) return;
    const passo = primeira.offsetWidth + parseFloat(getComputedStyle(quadro).columnGap || '0');
    this.colunaVisivel.set(Math.max(0, Math.min(COLUNAS.length - 1, Math.round(quadro.scrollLeft / passo))));
  }

  protected irParaColuna(id: ColunaQuadroOs): void {
    const alvo = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`#kb-os-col-${id}`);
    alvo?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  }

  protected podeAgir(os: OrdemServico): boolean {
    if (os.situacao === 'CONCLUIDA') return true;
    if (os.situacao === 'PENDENTE') return this.acesso.editarOs() || this.acesso.executarOs();
    return this.acesso.executarOs();
  }

  // --- Arrastar e soltar (atalho das mesmas ações dos botões) ---

  protected acaoDeSoltar(coluna: ColunaQuadroOs): AcaoSoltar | null {
    const arraste = this.arrastando();
    if (!arraste || arraste.de === coluna) return null;
    const executar = this.acesso.executarOs();
    if (arraste.de === 'A_AGENDAR' && coluna === 'AGENDADAS' && (executar || this.acesso.editarOs())) {
      return { texto: 'Solte para agendar', icon: 'pi pi-calendar', tone: 'info', acao: 'AGENDAR' };
    }
    if ((arraste.de === 'A_AGENDAR' || arraste.de === 'AGENDADAS') && coluna === 'EM_EXECUCAO' && executar) {
      return { texto: 'Solte para iniciar o serviço', icon: 'pi pi-play', tone: 'brand', acao: 'INICIAR' };
    }
    if (arraste.de !== 'CONCLUIDAS' && coluna === 'CONCLUIDAS' && executar) {
      return { texto: 'Solte para concluir', icon: 'pi pi-check', tone: 'success', acao: 'CONCLUIR' };
    }
    if (arraste.de === 'CONCLUIDAS' && coluna === 'EM_EXECUCAO' && executar) {
      return { texto: 'Solte para voltar para em andamento', icon: 'pi pi-replay', tone: 'warning', acao: 'REABRIR' };
    }
    return null;
  }

  protected iniciarArraste(item: OrdemServico, de: ColunaQuadroOs): void {
    this.arrastando.set({ item, de });
  }

  protected encerrarArraste(): void {
    this.arrastando.set(null);
    this.sobre.set(null);
  }

  protected aoPassar(evento: DragEvent, coluna: ColunaQuadroOs): void {
    if (!this.acaoDeSoltar(coluna)) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    this.sobre.set(coluna);
  }

  protected aoSair(evento: DragEvent, coluna: ColunaQuadroOs): void {
    const destino = evento.relatedTarget as Node | null;
    if (destino && (evento.currentTarget as HTMLElement).contains(destino)) return;
    if (this.sobre() === coluna) this.sobre.set(null);
  }

  protected aoSoltar(evento: DragEvent, coluna: ColunaQuadroOs): void {
    evento.preventDefault();
    const acao = this.acaoDeSoltar(coluna);
    const item = this.arrastando()?.item;
    this.encerrarArraste();
    if (!acao || !item) return;
    this.aoAgir(item, acao.acao);
  }

  protected aoAgir(item: OrdemServico, acao: AcaoCardOs): void {
    if (acao === 'DETALHAR') return this.abrir.emit(item);
    if (acao === 'LANCAR_VALORES') return this.lancarValores.emit(item);
    if (acao === 'RELATORIO') return this.relatorio.emit(item);
    if (acao === 'CANCELAR') {
      this.cancelando.set(item);
      this.cancelamentoAberto.set(true);
      return;
    }
    if (acao === 'REABRIR') {
      this.reabrindo.set(item);
      this.reaberturaAberta.set(true);
      return;
    }
    // Os formulários recebem o detalhe completo, como na ficha da OS.
    this.frota.detalharOrdemServico(item.id).subscribe({
      next: (detalhe) => {
        // Outra pessoa já moveu a OS: abrir a etapa pelo cartão antigo pularia ou repetiria um passo.
        if (detalhe.ordem.situacao !== item.situacao) return this.conflito(item);
        this.ordemSelecionada.set(detalhe);
        if (acao === 'CONCLUIR') {
          this.modoConclusao.set('concluir');
          this.conclusaoAberta.set(true);
        } else {
          this.etapa.set(acao === 'AGENDAR' ? 'agendar' : 'iniciar');
          this.etapaAberta.set(true);
        }
      },
      error: (err) => this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível abrir a OS' })
    });
  }

  protected cancelar(item: OrdemServico, motivo: string): void {
    this.processandoCancelamento.set(true);
    this.frota.cancelarOrdemServico(item.id, motivo).subscribe({
      next: (detalhe) => {
        this.processandoCancelamento.set(false);
        this.cancelamentoAberto.set(false);
        this.cancelando.set(null);
        this.notificacoes.success(`${rotuloOs(detalhe.ordem.numero)} cancelada.`);
        this.anuncio.set(`${rotuloOs(detalhe.ordem.numero)} cancelada e retirada do quadro.`);
        this.recarregar();
        this.alterado.emit();
      },
      error: (err: unknown) => {
        this.processandoCancelamento.set(false);
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.cancelamentoAberto.set(false);
          this.cancelando.set(null);
          return this.conflito(item);
        }
        this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível cancelar a OS' });
      }
    });
  }

  protected reabrir(item: OrdemServico, motivo: string): void {
    this.processandoReabertura.set(true);
    this.frota.reabrirOrdemServico(item.id, motivo).subscribe({
      next: (detalhe) => {
        this.processandoReabertura.set(false);
        this.reaberturaAberta.set(false);
        this.reabrindo.set(null);
        this.notificacoes.success(`${rotuloOs(detalhe.ordem.numero)} voltou para em andamento.`);
        this.aoSalvar(detalhe);
      },
      error: (err: unknown) => {
        this.processandoReabertura.set(false);
        this.notificacoes.error(getErrorMessage(err), { title: 'Não foi possível voltar a OS' });
      }
    });
  }

  /** O cartão estava desatualizado: recarrega o quadro e explica por que nada foi aberto. */
  private conflito(item: OrdemServico): void {
    this.notificacoes.warning(`${rotuloOs(item.numero)} foi alterada por outra pessoa. O quadro foi atualizado; confira a OS antes de seguir.`,
      { title: 'A OS mudou' });
    this.recarregar();
  }

  protected aoSalvar(detalhe: OrdemServicoDetalhe): void {
    const destino = COLUNAS.find((c) => c.situacao === detalhe.ordem.situacao)?.titulo ?? 'a nova coluna';
    this.anuncio.set(`${rotuloOs(detalhe.ordem.numero)} movida para ${destino}.`);
    this.recarregar();
    this.alterado.emit();
  }
}

function atrasada(o: OrdemServico, agora = Date.now()): boolean {
  if (o.situacao === 'EM_ANDAMENTO') return o.atrasada;
  if (o.situacao === 'AGENDADA') return !!o.agendadaPara && new Date(o.agendadaPara).getTime() < agora;
  return false;
}

function inicioDoDia(data: Date): number {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

/** Grupos pela urgência de cada coluna (o agrupamento padrão). */
function porPrazo(coluna: ColunaQuadroOs, itens: OrdemServico[]): Grupo[] {
  const hoje = inicioDoDia(new Date());
  const amanha = hoje + 86_400_000;
  const depoisDeAmanha = hoje + 2 * 86_400_000;
  const faixas: { id: string; label: string; tone: TomGrupo; teste: (o: OrdemServico) => boolean }[] = {
    // Uma faixa por criticidade: o orçamento em andamento aparece no cartão.
    A_AGENDAR: (['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'] as Criticidade[]).map((c) => ({
      id: c, label: ROTULO_CRITICIDADE[c], tone: TOM_GRUPO_CRITICIDADE[c], teste: (o: OrdemServico) => o.criticidade === c
    })),
    // Hoje para o acompanhamento do dia, amanhã para o planejamento.
    AGENDADAS: [
      { id: 'PASSADA', label: 'Data passada', tone: 'danger' as TomGrupo, teste: (o: OrdemServico) => !!o.agendadaPara && new Date(o.agendadaPara).getTime() < Date.now() },
      { id: 'HOJE', label: 'Hoje', tone: 'warning' as TomGrupo, teste: (o: OrdemServico) => !!o.agendadaPara && new Date(o.agendadaPara).getTime() < amanha },
      { id: 'AMANHA', label: 'Amanhã', tone: 'info' as TomGrupo, teste: (o: OrdemServico) => !!o.agendadaPara && new Date(o.agendadaPara).getTime() < depoisDeAmanha },
      { id: 'DEMAIS', label: 'Demais', tone: 'neutral' as TomGrupo, teste: () => true }
    ],
    EM_EXECUCAO: [
      { id: 'ESTOURADO', label: 'Prazo estourado', tone: 'danger' as TomGrupo, teste: (o: OrdemServico) => o.atrasada },
      {
        id: 'HOJE', label: 'Termina hoje', tone: 'warning' as TomGrupo,
        teste: (o: OrdemServico) => !!o.previsaoTermino && new Date(o.previsaoTermino).getTime() < amanha
      },
      { id: 'NO_PRAZO', label: 'No prazo ou sem previsão', tone: 'success' as TomGrupo, teste: () => true }
    ],
    CONCLUIDAS: []
  }[coluna];
  if (coluna === 'CONCLUIDAS') return porDiaDeConclusao(itens);
  const restantes = new Set(itens);
  return faixas
    .map((f): Grupo => {
      const lista = [...restantes].filter(f.teste);
      lista.forEach((o) => restantes.delete(o));
      return { id: f.id, label: f.label, tone: f.tone, itens: lista, total: lista.length };
    })
    .filter((g) => g.total > 0);
}

function porDiaDeConclusao(itens: OrdemServico[]): Grupo[] {
  const pendentes = itens.filter((o) => o.baixaPendente);
  const grupos = new Map<string, OrdemServico[]>();
  for (const o of itens.filter((i) => !i.baixaPendente)) {
    const dia = o.fimReal ? new Date(o.fimReal).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : 'Sem data';
    grupos.set(dia, [...(grupos.get(dia) ?? []), o]);
  }
  const porDia = [...grupos].map(([dia, lista]) => ({ id: dia, label: dia.charAt(0).toUpperCase() + dia.slice(1), tone: 'success' as TomGrupo, itens: lista, total: lista.length }));
  // Com valor faltando, a OS fica no topo, para ninguém esquecer de lançar.
  return pendentes.length
    ? [{ id: 'BAIXA_PENDENTE', label: 'Valores pendentes', tone: 'warning' as TomGrupo, itens: pendentes, total: pendentes.length }, ...porDia]
    : porDia;
}

function porCriticidade(itens: OrdemServico[]): Grupo[] {
  return (['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'] as Criticidade[])
    .map((c) => {
      const lista = itens.filter((o) => o.criticidade === c);
      return { id: c, label: ROTULO_CRITICIDADE[c], tone: TOM_GRUPO_CRITICIDADE[c], itens: lista, total: lista.length };
    })
    .filter((g) => g.total > 0);
}

function porTexto(itens: OrdemServico[], chave: (o: OrdemServico) => string): Grupo[] {
  const grupos = new Map<string, OrdemServico[]>();
  for (const o of itens) grupos.set(chave(o), [...(grupos.get(chave(o)) ?? []), o]);
  return [...grupos]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([nome, lista]) => ({ id: nome, label: nome, tone: 'neutral' as GeoTone, itens: lista, total: lista.length }));
}

function salvar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* preferência opcional */
  }
}

function lerAgrupamento(): AgrupamentoQuadroOs {
  try {
    const v = localStorage.getItem(CHAVE_AGRUPAMENTO);
    return v === 'criticidade' || v === 'oficina' || v === 'base' ? v : 'situacao';
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
