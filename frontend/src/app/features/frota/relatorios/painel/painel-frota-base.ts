import { Directive, Signal, computed, effect, inject, signal } from '@angular/core';
import { ParamMap } from '@angular/router';
import { GeoFilterChip } from '@geo/ui';
import { Observable, forkJoin, of } from 'rxjs';

import { FiltroRelatorioFrota, RelatorioGerencialFrota } from '../../../../core/models/frota-relatorios.models';
import { getErrorMessage } from '../../../../core/models/shared.models';
import { FrotaRelatoriosService } from '../../../../core/services/frota-relatorios.service';
import { AlvoAnalise, VistaAnalise } from '../../../../shared/components/dashboard/dashboard-analise.models';
import { NavegacaoAnaliseService } from '../../../../shared/components/dashboard/dashboard-analise.navegacao';
import { CopilotoPainelService } from '../../../copiloto/painel';
import { PeriodoFrota, RecorteFrotaService } from './recorte-frota.service';

/**
 * Base dos dashboards da frota: recorte comum + filtros próprios, carga do relatório gerencial com os
 * registros de origem do painel, análise detalhada (`?drill=`) e perguntas à Bússola.
 *
 * Cada painel fornece `providers: [RecorteFrotaService, GeoDrillStateService, NavegacaoAnaliseService]`.
 */
@Directive()
export abstract class PainelFrotaBase<D> {
  protected readonly recorte = inject(RecorteFrotaService);
  protected readonly analise = inject(NavegacaoAnaliseService);
  protected readonly relatorios = inject(FrotaRelatoriosService);
  private readonly copiloto = inject(CopilotoPainelService);
  protected readonly copilotoDisponivel = this.copiloto.disponivelParaUsuario();

  readonly gerencial = signal<RelatorioGerencialFrota | null>(null);
  readonly detalhe = signal<D | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  /** Vista da análise aberta (resolvida pelo painel). */
  protected abstract readonly vistaAnalise: Signal<VistaAnalise | null>;
  /** Chips dos filtros próprios aplicados. */
  protected abstract readonly chipsProprios: Signal<GeoFilterChip[]>;

  protected readonly chips = computed(() => [...this.recorte.chips(), ...this.chipsProprios()]);

  constructor() {
    // Link de análise que não existe mais no recorte: fecha o painel.
    effect(() => {
      if (this.analise.alvo() && this.gerencial() && this.detalhe() && !this.carregando() && !this.vistaAnalise()) this.analise.fechar();
    });
  }

  /** Registros de origem do painel (nulo quando o painel só usa o relatório gerencial). */
  protected abstract carregarDetalhe(filtro: FiltroRelatorioFrota): Observable<D>;
  /** Filtros próprios → parâmetros da URL. */
  protected abstract parametrosProprios(): Record<string, string | null>;
  protected abstract lerProprios(q: ParamMap): void;
  /** Fixa os filtros próprios aplicados (os números passam a usá-los). */
  protected abstract aplicarProprios(): void;
  protected abstract limparProprios(): void;
  /** Remove o chip de um filtro próprio. */
  protected abstract removerProprio(chave: string): void;

  /** Lê a URL e faz a primeira consulta. Chame no construtor do painel. */
  protected iniciar(): void {
    const q = this.recorte.lerUrl();
    this.lerProprios(q);
    this.aplicar();
  }

  protected aplicar(): void {
    this.aplicarProprios();
    const filtro = this.recorte.aplicar(this.parametrosProprios());
    this.carregando.set(true);
    this.erro.set(null);
    forkJoin({ g: this.relatorios.gerencial(filtro), d: this.carregarDetalhe(filtro) ?? of(null as D) }).subscribe({
      next: ({ g, d }) => {
        this.gerencial.set(g);
        this.detalhe.set(d);
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

  protected usarPeriodo(p: PeriodoFrota): void {
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

  /** Clique numa categoria de gráfico do painel. */
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
