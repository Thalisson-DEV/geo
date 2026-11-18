import { DestroyRef, Injectable, computed, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, ParamMap, Router } from '@angular/router';
import { GeoFilterChip, GeoSelectOption } from '@geo/ui';
import { filter, take } from 'rxjs';

import { LookupStore } from '../../../../core/lookup';
import { RecorteAlmox } from '../../../../core/models/almoxarifado-relatorios.models';
import { chipsDoRecorte } from '../../../../shared/components/dashboard/dashboard-filtros';
import { dataIso, dataLocal } from '../../../../shared/listagem/listagem';

export type PeriodoAlmox = '7d' | '30d' | 'mes' | 'mesAnterior' | '3m' | '6m' | '12m';

export const PERIODOS_ALMOX: { valor: PeriodoAlmox; rotulo: string }[] = [
  { valor: '7d', rotulo: '7 dias' },
  { valor: '30d', rotulo: '30 dias' },
  { valor: 'mes', rotulo: 'Mês atual' },
  { valor: 'mesAnterior', rotulo: 'Mês anterior' },
  { valor: '3m', rotulo: '3 meses' },
  { valor: '6m', rotulo: '6 meses' },
  { valor: '12m', rotulo: '12 meses' }
];

const PERIODO_PADRAO: PeriodoAlmox = '3m';

/** Chaves da URL do recorte comum: a navegação entre os relatórios leva o mesmo recorte. */
export const CHAVES_RECORTE_ALMOX = ['de', 'ate', 'base', 'processo', 'almox', 'equipe'] as const;

/** Algo que pode ser filtrado pelo recorte comum (movimentação, saldo ou solicitação). */
export interface Recortavel {
  idBase: string | null;
  idProcesso: string | null;
  idEquipe: string | null;
  /** Almoxarifados (estoques físicos) envolvidos. */
  almox: readonly (string | null)[];
}

/**
 * Recorte comum dos relatórios do almoxarifado: período, base, processo, almoxarifado e equipe. Cada
 * relatório fornece o seu (`providers: [RecorteAlmoxService]`), soma os filtros próprios e grava tudo na
 * URL. As opções de almoxarifado e equipe vêm dos próprios dados carregados.
 */
@Injectable()
export class RecorteAlmoxService {
  private readonly lookups = inject(LookupStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private fechado = false;

  readonly periodos = PERIODOS_ALMOX;

  readonly inicio = signal<Date | null>(null);
  readonly fim = signal<Date | null>(null);
  readonly idsBase = signal<string[]>([]);
  readonly idsProcesso = signal<string[]>([]);
  readonly idsAlmox = signal<string[]>([]);
  readonly idsEquipe = signal<string[]>([]);
  readonly periodoAtivo = signal<PeriodoAlmox | null>(PERIODO_PADRAO);

  readonly bases = computed<GeoSelectOption<string>[]>(() =>
    this.lookups.operationalBases().map((b) => ({ label: b.label, value: String(b.value) }))
  );
  readonly processos = computed<GeoSelectOption<string>[]>(() =>
    this.lookups.processes().map((p) => ({ label: p.label, value: String(p.value) }))
  );
  private readonly almoxConhecidos = signal<Map<string, string>>(new Map());
  private readonly equipesConhecidas = signal<Map<string, string>>(new Map());
  readonly almoxOpcoes = computed<GeoSelectOption<string>[]>(() => opcoes(this.almoxConhecidos()));
  readonly equipeOpcoes = computed<GeoSelectOption<string>[]>(() => opcoes(this.equipesConhecidas()));

  /** Recorte da última consulta (é o que os números mostram). */
  readonly aplicado = signal<RecorteAlmox>({});

  readonly chips = computed<GeoFilterChip[]>(() => {
    const f = this.aplicado();
    return chipsDoRecorte(f as Record<string, unknown>, [
      { chave: 'idBase', rotulo: 'Base', opcoes: this.bases() },
      { chave: 'idProcesso', rotulo: 'Processo', opcoes: this.processos() },
      { chave: 'idAlmoxarifado', rotulo: 'Almoxarifado', opcoes: this.almoxOpcoes() },
      { chave: 'idEquipe', rotulo: 'Equipe', opcoes: this.equipeOpcoes() }
    ], { inicio: f.de ? `${f.de}T12:00:00` : null, fim: f.ate ? `${f.ate}T12:00:00` : null });
  });

  /** Parâmetros do recorte aplicado, para levar a outro relatório. */
  readonly queryParams = computed<Record<string, string | null>>(() => {
    const f = this.aplicado();
    const junta = (l?: string[]) => (l && l.length ? l.join(',') : null);
    return {
      de: f.de ?? null, ate: f.ate ?? null, base: junta(f.idBase), processo: junta(f.idProcesso),
      almox: junta(f.idAlmoxarifado), equipe: junta(f.idEquipe)
    };
  });

  /** Filtro do recorte comum aplicado sobre uma linha (o período já veio do servidor). */
  readonly aceita = computed(() => {
    const f = this.aplicado();
    const bases = conjunto(f.idBase);
    const processos = conjunto(f.idProcesso);
    const almox = conjunto(f.idAlmoxarifado);
    const equipes = conjunto(f.idEquipe);
    return (r: Recortavel): boolean =>
      (!bases || (!!r.idBase && bases.has(r.idBase))) &&
      (!processos || (!!r.idProcesso && processos.has(r.idProcesso))) &&
      (!equipes || (!!r.idEquipe && equipes.has(r.idEquipe))) &&
      (!almox || r.almox.some((a) => !!a && almox.has(a)));
  });

  constructor() {
    this.destroyRef.onDestroy(() => (this.fechado = true));
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
  }

  /** Almoxarifados e equipes vistos nos dados viram opções dos filtros. */
  conhecer(almox: Iterable<[string | null, string | null]>, equipes: Iterable<[string | null, string | null]>): void {
    this.almoxConhecidos.update((m) => juntar(m, almox));
    this.equipesConhecidas.update((m) => juntar(m, equipes));
  }

  /** Lê o recorte da URL; devolve o mapa para o relatório ler os filtros próprios. */
  lerUrl(): ParamMap {
    const q = this.route.snapshot.queryParamMap;
    const lista = (k: string) => (q.get(k) ? q.get(k)!.split(',').filter(Boolean) : []);
    const de = dataLocal(q.get('de'));
    const ate = dataLocal(q.get('ate'));
    if (de && ate) {
      this.inicio.set(de);
      this.fim.set(ate);
      this.periodoAtivo.set(this.periodoDe(de, ate));
    } else {
      this.definirPeriodo(PERIODO_PADRAO);
    }
    this.idsBase.set(lista('base'));
    this.idsProcesso.set(lista('processo'));
    this.idsAlmox.set(lista('almox'));
    this.idsEquipe.set(lista('equipe'));
    return q;
  }

  /** Fixa o recorte que vai para a consulta e grava na URL com os filtros próprios do relatório. */
  aplicar(extras: Record<string, string | null> = {}): Required<Pick<RecorteAlmox, 'de' | 'ate'>> & RecorteAlmox {
    if (!this.inicio() || !this.fim()) this.definirPeriodo(PERIODO_PADRAO);
    const filtro = {
      de: dataIso(this.inicio())!,
      ate: dataIso(this.fim())!,
      idBase: this.idsBase(),
      idProcesso: this.idsProcesso(),
      idAlmoxarifado: this.idsAlmox(),
      idEquipe: this.idsEquipe()
    };
    this.aplicado.set(filtro);
    const params = { ...this.queryParams(), ...extras };
    // Relatório já fechado (a pessoa foi para outro): gravar agora a levaria de volta.
    const gravar = () => {
      if (!this.fechado) void this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParamsHandling: 'merge', queryParams: params });
    };
    // Vindo de outro relatório, a navegação até aqui ainda está em curso: grava quando ela terminar.
    if (untracked(() => this.router.currentNavigation())) {
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd), take(1), takeUntilDestroyed(this.destroyRef)).subscribe(gravar);
    } else {
      gravar();
    }
    return filtro;
  }

  definirPeriodo(p: PeriodoAlmox): void {
    const [de, ate] = intervalo(p);
    this.inicio.set(de);
    this.fim.set(ate);
    this.periodoAtivo.set(p);
  }

  mudarData(qual: 'inicio' | 'fim', valor: unknown): void {
    (qual === 'inicio' ? this.inicio : this.fim).set(valor instanceof Date ? valor : null);
    this.periodoAtivo.set(null);
  }

  limpar(): void {
    this.idsBase.set([]);
    this.idsProcesso.set([]);
    this.idsAlmox.set([]);
    this.idsEquipe.set([]);
    this.definirPeriodo(PERIODO_PADRAO);
  }

  /** Remove um chip do recorte comum; devolve falso quando a chave é de um filtro do relatório. */
  remover(chave: string): boolean {
    const mapa: Record<string, () => void> = {
      periodo: () => this.definirPeriodo(PERIODO_PADRAO),
      idBase: () => this.idsBase.set([]),
      idProcesso: () => this.idsProcesso.set([]),
      idAlmoxarifado: () => this.idsAlmox.set([]),
      idEquipe: () => this.idsEquipe.set([])
    };
    if (!mapa[chave]) return false;
    mapa[chave]();
    return true;
  }

  /** "01/08/2026 a 10/11/2026 · comparado com …" */
  descricaoPeriodo(p: { de: string; ate: string; anteriorDe?: string; anteriorAte?: string } | null): string {
    if (!p) return '';
    const fmt = (iso: string) => dataLocal(iso)!.toLocaleDateString('pt-BR');
    const base = `${fmt(p.de)} a ${fmt(p.ate)}`;
    return p.anteriorDe && p.anteriorAte ? `${base} · comparado com ${fmt(p.anteriorDe)} a ${fmt(p.anteriorAte)}` : base;
  }

  private periodoDe(de: Date, ate: Date): PeriodoAlmox | null {
    for (const p of PERIODOS_ALMOX) {
      const [a, b] = intervalo(p.valor);
      if (dataIso(a) === dataIso(de) && dataIso(b) === dataIso(ate)) return p.valor;
    }
    return null;
  }
}

export function intervalo(p: PeriodoAlmox, hoje = new Date()): [Date, Date] {
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const menos = (n: number) => new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - n);
  const meses = (n: number) => new Date(dia.getFullYear(), dia.getMonth() - n, 1);
  switch (p) {
    case '7d': return [menos(6), dia];
    case '30d': return [menos(29), dia];
    case 'mes': return [meses(0), dia];
    case 'mesAnterior': return [meses(1), new Date(dia.getFullYear(), dia.getMonth(), 0)];
    case '3m': return [meses(2), dia];
    case '6m': return [meses(5), dia];
    case '12m': return [meses(11), dia];
  }
}

function conjunto(l?: string[]): Set<string> | null {
  return l && l.length ? new Set(l) : null;
}

function juntar(atual: Map<string, string>, novos: Iterable<[string | null, string | null]>): Map<string, string> {
  let mudou = false;
  const m = new Map(atual);
  for (const [id, nome] of novos) {
    if (id && nome && m.get(id) !== nome) {
      m.set(id, nome);
      mudou = true;
    }
  }
  return mudou ? m : atual;
}

function opcoes(m: Map<string, string>): GeoSelectOption<string>[] {
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
