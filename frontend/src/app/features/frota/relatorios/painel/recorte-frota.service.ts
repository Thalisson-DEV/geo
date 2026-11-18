import { DestroyRef, Injectable, computed, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, ParamMap, Router } from '@angular/router';
import { CesFilterChip, CesSelectOption } from '@ces/ui';
import { filter, take } from 'rxjs';

import { LookupStore } from '../../../../core/lookup';
import { FiltroRelatorioFrota, RelatorioGerencialFrota } from '../../../../core/models/frota-relatorios.models';
import { FrotaService } from '../../../../core/services/frota.service';
import { chipsDoRecorte } from '../../../../shared/components/dashboard/dashboard-filtros';
import { dataIso, dataLocal } from '../../../../shared/listagem/listagem';
import { sinalBaseFrota } from '../../shared/frota-base-compartilhada';
import { basesFrota } from '../../shared/frota-lista';

export type PeriodoFrota = 'mes' | 'mesAnterior' | '3m' | '6m' | '12m' | 'ano';

export const PERIODOS_FROTA: { valor: PeriodoFrota; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Mês atual' },
  { valor: 'mesAnterior', rotulo: 'Mês anterior' },
  { valor: '3m', rotulo: '3 meses' },
  { valor: '6m', rotulo: '6 meses' },
  { valor: '12m', rotulo: '12 meses' },
  { valor: 'ano', rotulo: 'Ano atual' }
];

export const REGIMES_FROTA: CesSelectOption<string>[] = [
  { label: 'Próprio', value: 'PROPRIO' },
  { label: 'Locado', value: 'LOCADO' }
];

export const SITUACOES_FROTA: CesSelectOption<string>[] = [
  { label: 'Ativo', value: 'ATIVO' },
  { label: 'Em manutenção', value: 'EM_MANUTENCAO' },
  { label: 'Parado', value: 'PARADO' },
  { label: 'Reserva', value: 'RESERVA' },
  { label: 'Baixado', value: 'BAIXADO' }
];

/** Chaves da URL do recorte comum: a navegação entre os painéis leva o mesmo recorte. */
export const CHAVES_RECORTE = ['de', 'ate', 'base', 'processo', 'tipo', 'regime', 'situacao', 'veiculo'] as const;

/**
 * Recorte comum dos dashboards da frota (período, base, processo, tipo, regime, situação e veículos).
 * Cada dashboard fornece o seu (`providers: [RecorteFrotaService]`), soma os filtros próprios e grava
 * tudo na URL; a base é lembrada entre as telas da frota.
 */
@Injectable()
export class RecorteFrotaService {
  private readonly lookups = inject(LookupStore);
  private readonly frota = inject(FrotaService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private fechado = false;

  readonly bases = basesFrota();
  readonly periodos = PERIODOS_FROTA;
  readonly regimes = REGIMES_FROTA;
  readonly situacoes = SITUACOES_FROTA;

  readonly inicio = signal<Date | null>(null);
  readonly fim = signal<Date | null>(null);
  readonly idsBase = sinalBaseFrota();
  readonly idsProcesso = signal<string[]>([]);
  readonly idsTipo = signal<string[]>([]);
  readonly regimesSel = signal<string[]>([]);
  readonly situacoesSel = signal<string[]>([]);
  readonly idsVeiculo = signal<string[]>([]);
  readonly periodoAtivo = signal<PeriodoFrota | null>('6m');

  readonly tipos = signal<CesSelectOption<string>[]>([]);
  readonly veiculosOpcoes = signal<CesSelectOption<string>[]>([]);
  readonly processos = computed<CesSelectOption<string>[]>(() =>
    this.lookups.processes().map((p) => ({ label: p.label, value: p.value }))
  );

  /** Recorte da última consulta (é o que os números mostram). */
  readonly aplicado = signal<FiltroRelatorioFrota>({});

  readonly chips = computed<CesFilterChip[]>(() => {
    const f = this.aplicado();
    return chipsDoRecorte(f as Record<string, unknown>, [
      { chave: 'idBase', rotulo: 'Base', opcoes: this.bases.opcoes() },
      { chave: 'idProcesso', rotulo: 'Processo', opcoes: this.processos() },
      { chave: 'idTipoVeiculo', rotulo: 'Tipo', opcoes: this.tipos() },
      { chave: 'regime', rotulo: 'Regime', opcoes: REGIMES_FROTA },
      { chave: 'situacao', rotulo: 'Situação', opcoes: SITUACOES_FROTA },
      { chave: 'idVeiculo', rotulo: 'Veículo', opcoes: this.veiculosOpcoes() }
    ], { inicio: f.de, fim: f.ate });
  });

  /** Parâmetros do recorte aplicado, para levar a outro painel ou a uma lista. */
  readonly queryParams = computed<Record<string, string | null>>(() => {
    const f = this.aplicado();
    const junta = (l?: string[]) => (l && l.length ? l.join(',') : null);
    return {
      de: f.de ?? null, ate: f.ate ?? null, base: junta(f.idBase), processo: junta(f.idProcesso), tipo: junta(f.idTipoVeiculo),
      regime: junta(f.regime), situacao: junta(f.situacao), veiculo: junta(f.idVeiculo)
    };
  });

  constructor() {
    this.destroyRef.onDestroy(() => (this.fechado = true));
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    this.frota.tiposVeiculo(true).subscribe({
      next: (p) => this.tipos.set(p.content.map((t) => ({ label: t.nome, value: t.id }))),
      error: () => undefined
    });
    this.frota.listarVeiculos({ ativo: null }, { page: 0, size: 2000, sort: ['placa,asc'] }).subscribe({
      next: (p) => this.veiculosOpcoes.set(p.content.map((v) => ({ label: v.placa, value: v.idVeiculo }))),
      error: () => undefined
    });
  }

  /** Lê o recorte da URL; devolve o mapa para o dashboard ler os filtros próprios. */
  lerUrl(): ParamMap {
    const q = this.route.snapshot.queryParamMap;
    const lista = (k: string) => (q.get(k) ? q.get(k)!.split(',').filter(Boolean) : []);
    const de = dataLocal(q.get('de'));
    const ate = dataLocal(q.get('ate'));
    if (de && ate) {
      this.inicio.set(de);
      this.fim.set(ate);
      this.periodoAtivo.set(null);
    } else {
      this.definirPeriodo('6m');
    }
    // Sem base no link, vale a última escolhida nas telas da frota.
    if (q.has('base')) this.idsBase.set(lista('base'));
    this.idsProcesso.set(lista('processo'));
    this.idsTipo.set(lista('tipo'));
    this.regimesSel.set(lista('regime'));
    this.situacoesSel.set(lista('situacao'));
    this.idsVeiculo.set(lista('veiculo'));
    return q;
  }

  /** Fixa o recorte que vai para a consulta e grava na URL com os filtros próprios do painel. */
  aplicar(extras: Record<string, string | null> = {}): FiltroRelatorioFrota {
    if (!this.inicio() || !this.fim()) this.definirPeriodo('6m');
    const filtro: FiltroRelatorioFrota = {
      de: dataIso(this.inicio()),
      ate: dataIso(this.fim()),
      idBase: this.idsBase(),
      idProcesso: this.idsProcesso(),
      idTipoVeiculo: this.idsTipo(),
      regime: this.regimesSel(),
      situacao: this.situacoesSel(),
      idVeiculo: this.idsVeiculo()
    };
    this.aplicado.set(filtro);
    const params = { ...this.queryParams(), ...extras };
    // Painel já fechado (a pessoa foi para outro): gravar agora a levaria de volta.
    const gravar = () => {
      if (!this.fechado) void this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParamsHandling: 'merge', queryParams: params });
    };
    // Ao chegar de outro painel, a navegação até aqui ainda está em curso: gravar agora a atropelaria
    // (o destaque da navegação ficaria no painel anterior). Grava quando ela terminar.
    if (untracked(() => this.router.currentNavigation())) {
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd), take(1), takeUntilDestroyed(this.destroyRef)).subscribe(gravar);
    } else {
      gravar();
    }
    return filtro;
  }

  definirPeriodo(p: PeriodoFrota): void {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const meses = (n: number) => new Date(hoje.getFullYear(), hoje.getMonth() - n, 1);
    const [de, ate] = {
      mes: [inicioMes, hoje],
      mesAnterior: [meses(1), new Date(hoje.getFullYear(), hoje.getMonth(), 0)],
      '3m': [meses(2), hoje],
      '6m': [meses(5), hoje],
      '12m': [meses(11), hoje],
      ano: [new Date(hoje.getFullYear(), 0, 1), hoje]
    }[p];
    this.inicio.set(de);
    this.fim.set(ate);
    this.periodoAtivo.set(p);
  }

  mudarData(qual: 'inicio' | 'fim', valor: unknown): void {
    (qual === 'inicio' ? this.inicio : this.fim).set(valor instanceof Date ? valor : null);
    this.periodoAtivo.set(null);
  }

  /** Limpa o recorte comum (o período volta a 6 meses). */
  limpar(): void {
    this.idsBase.set([]);
    this.idsProcesso.set([]);
    this.idsTipo.set([]);
    this.regimesSel.set([]);
    this.situacoesSel.set([]);
    this.idsVeiculo.set([]);
    this.definirPeriodo('6m');
  }

  /** Remove um chip do recorte comum; devolve falso quando a chave é de um filtro do painel. */
  remover(chave: string): boolean {
    const mapa: Record<string, () => void> = {
      periodo: () => this.definirPeriodo('6m'),
      idBase: () => this.idsBase.set([]),
      idProcesso: () => this.idsProcesso.set([]),
      idTipoVeiculo: () => this.idsTipo.set([]),
      regime: () => this.regimesSel.set([]),
      situacao: () => this.situacoesSel.set([]),
      idVeiculo: () => this.idsVeiculo.set([])
    };
    if (!mapa[chave]) return false;
    mapa[chave]();
    return true;
  }

  /** "01/05/2026 a 10/11/2026 · comparado com …" */
  descricaoPeriodo(d: RelatorioGerencialFrota | null): string {
    if (!d) return '';
    const fmt = (iso: string) => dataLocal(iso)!.toLocaleDateString('pt-BR');
    return `${fmt(d.periodo.de)} a ${fmt(d.periodo.ate)} · comparado com ${fmt(d.periodo.anteriorDe)} a ${fmt(d.periodo.anteriorAte)}`;
  }

  nomeBase(id: string | null | undefined): string {
    return id ? (this.bases.opcoes().find((b) => b.value === id)?.label ?? 'Base') : 'Sem base';
  }
}
