import { Directive, Signal, computed, effect, inject, signal } from '@angular/core';
import { ParamMap } from '@angular/router';
import { CesFilterChip } from '@ces/ui';
import { Observable, Subscription } from 'rxjs';

import { RecorteAlmox } from '../../../../core/models/almoxarifado-relatorios.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { AlmoxarifadoRelatoriosService } from '../../../../core/services/almoxarifado-relatorios.service';
import { AlvoAnalise, VistaAnalise } from '../../../../shared/components/dashboard/dashboard-analise.models';
import { NavegacaoAnaliseService } from '../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { CopilotoPainelService } from '../../../copiloto/painel';
import { PeriodoAlmox, RecorteAlmoxService } from './recorte-almox.service';

export type FiltroAlmox = Required<Pick<RecorteAlmox, 'de' | 'ate'>> & RecorteAlmox;

/**
 * Base dos relatórios do almoxarifado: recorte comum + filtros próprios, carga dos dados de origem,
 * análise detalhada (`?drill=`) e perguntas à Bússola.
 *
 * Cada relatório fornece `providers: [RecorteAlmoxService, CesDrillStateService, NavegacaoAnaliseService]`.
 */
@Directive()
export abstract class PainelAlmoxBase<D> {
  protected readonly recorte = inject(RecorteAlmoxService);
  protected readonly analise = inject(NavegacaoAnaliseService);
  protected readonly relatorios = inject(AlmoxarifadoRelatoriosService);
  private readonly copiloto = inject(CopilotoPainelService);
  protected readonly copilotoDisponivel = this.copiloto.disponivelParaUsuario();

  readonly dados = signal<D | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  private carga: Subscription | null = null;

  /** Vista da análise aberta (resolvida pelo relatório). */
  protected abstract readonly vistaAnalise: Signal<VistaAnalise | null>;
  /** Chips dos filtros próprios aplicados. */
  protected abstract readonly chipsProprios: Signal<CesFilterChip[]>;

  protected readonly chips = computed(() => [...this.recorte.chips(), ...this.chipsProprios()]);

  constructor() {
    // Link de análise que não existe mais no recorte: fecha o painel.
    effect(() => {
      if (this.analise.alvo() && this.dados() && !this.carregando() && !this.vistaAnalise()) this.analise.fechar();
    });
  }

  /** Dados de origem do relatório para o período. */
  protected abstract carregar(filtro: FiltroAlmox): Observable<D>;
  /** Filtros próprios → parâmetros da URL. */
  protected abstract parametrosProprios(): Record<string, string | null>;
  protected abstract lerProprios(q: ParamMap): void;
  /** Fixa os filtros próprios aplicados (os números passam a usá-los). */
  protected abstract aplicarProprios(): void;
  protected abstract limparProprios(): void;
  /** Remove o chip de um filtro próprio. */
  protected abstract removerProprio(chave: string): void;

  /** Lê a URL e faz a primeira consulta. Chame no construtor do relatório. */
  protected iniciar(): void {
    const q = this.recorte.lerUrl();
    this.lerProprios(q);
    this.aplicar();
  }

  protected aplicar(): void {
    this.aplicarProprios();
    const filtro = this.recorte.aplicar(this.parametrosProprios());
    this.carga?.unsubscribe();
    this.carregando.set(true);
    this.erro.set(null);
    this.carga = this.carregar(filtro).subscribe({
      next: (d) => {
        this.dados.set(d);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
  }

  protected limpar(): void {
    this.recorte.limpar();
    this.limparProprios();
    this.aplicar();
  }

  protected removerFiltro(chave: string): void {
    if (!this.recorte.remover(chave)) this.removerProprio(chave);
    this.aplicar();
  }

  protected usarPeriodo(p: PeriodoAlmox): void {
    this.recorte.definirPeriodo(p);
    this.aplicar();
  }

  // ── Análise detalhada ────────────────────────────────────────────────────────────────────────

  protected analisar(dimension: string, value: string): void {
    this.analise.abrir(dimension, value);
  }

  protected aprofundar(alvo: AlvoAnalise): void {
    this.analise.aprofundar(alvo, this.vistaAnalise()?.titulo ?? '');
  }

  /** Clique numa categoria de gráfico do relatório. */
  protected selecionar<T>(lista: readonly T[], indice: number, dimensao: string, valor: (item: T) => string): void {
    const item = lista[indice];
    if (item !== undefined) this.analisar(dimensao, valor(item));
  }

  protected perguntarAnalise(vista: VistaAnalise): void {
    if (!vista.copiloto) return;
    this.analise.fechar();
    this.copiloto.perguntarSobre(vista.copiloto.foco, vista.copiloto.pergunta);
  }

  protected perguntarVisao(pergunta: string): void {
    this.copiloto.perguntarSobre({ tipo: 'secao', id: 'visaoGerencial', rotulo: 'Visão gerencial' }, pergunta);
  }
}
