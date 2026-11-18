import { CesChartSeries, CesDataTableColumn, CesTone } from '@ces/ui';

import { IndicadorFrota, RelatorioGerencialFrota, VeiculoRelatorioFrota } from '../../../../core/models/frota-relatorios.models';
import {
  AcaoAnalise,
  AlvoAnalise,
  GraficoAnalise,
  LinkAnalise,
  TabelaAnalise
} from '../../../../shared/components/dashboard/dashboard-analise.models';
import { dataLocal } from '../../../../shared/listagem/listagem';
import { inteiro, moeda, moedaCurta, numero, pct, rotuloMes, variacao } from '../frota-relatorios-gerenciais.visao';

export { comparacao, inteiro, moeda, moedaCurta, numero, pct, rotuloMes, variacao } from '../frota-relatorios-gerenciais.visao';

// ── Rótulos ──────────────────────────────────────────────────────────────────────────────────────

export const ROTULO_CATEGORIA: Record<string, string> = {
  MANUTENCAO: 'Manutenção', COMBUSTIVEL: 'Combustível', DESPESAS: 'Despesas', SEGURO: 'Seguro', LOCACAO: 'Locação',
  FRANQUIAS: 'Franquias de sinistro'
};
export const ROTULO_TIPO_MANUTENCAO: Record<string, string> = { CORRETIVA: 'Corretiva', PREVENTIVA: 'Preventiva', PREDITIVA: 'Preditiva' };
export const ROTULO_ORIGEM_OS: Record<string, string> = {
  VERBAL: 'Pedido verbal', CHECKLIST: 'Checklist', INSPECAO: 'Inspeção', PREVENTIVA: 'Plano preventivo', MANUAL: 'Lançamento manual',
  IMPORTACAO: 'Importação', SINISTRO: 'Sinistro'
};
export const ROTULO_CAUSA: Record<string, string> = {
  AVARIA: 'Avaria', DESGASTE_NATURAL: 'Desgaste natural', USO_INDEVIDO: 'Uso indevido', SERVICO_CORRETIVO: 'Serviço corretivo',
  SERVICO_PREVENTIVO: 'Serviço preventivo', ESTOQUE: 'Estoque', SUBSTITUICAO_PNEUS: 'Substituição de pneus', SEM_CAUSA: 'Sem causa informada'
};
export const ROTULO_CRITICIDADE: Record<string, string> = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica', URGENTE: 'Urgente' };
export const ROTULO_OFICINA: Record<string, string> = { INTERNA: 'Oficina interna', EXTERNA: 'Oficina externa' };
export const ROTULO_SITUACAO_OS: Record<string, string> = { PENDENTE: 'A agendar', AGENDADA: 'Agendada', EM_ANDAMENTO: 'Em execução' };
export const ROTULO_ALERTA: Record<string, string> = {
  MEDICAO_MENOR: 'Medição menor que a anterior', VOLUME_ACIMA_TANQUE: 'Volume acima do tanque',
  CONSUMO_FORA_PADRAO: 'Consumo fora do padrão', PRECO_ACIMA_MEDIA: 'Preço acima da média', FOTO_REPETIDA: 'Foto repetida',
  FREQUENCIA_ALTA: 'Frequência alta', POSTO_SEM_PRECO: 'Posto sem preço', SEM_CHECKLIST: 'Sem checklist', LONGE_DO_POSTO: 'Longe do posto'
};
export const ROTULO_DOCUMENTO: Record<string, string> = {
  CRLV: 'CRLV', LICENCIAMENTO: 'Licenciamento', IPVA: 'IPVA', SEGURO: 'Seguro', TACOGRAFO: 'Tacógrafo', ANTT: 'ANTT',
  INSPECAO_VEICULAR: 'Inspeção veicular', LAUDO_IMPLEMENTO: 'Laudo do implemento', CONTRATO_LOCACAO: 'Contrato de locação', OUTRO: 'Outro'
};
export const ROTULO_SITUACAO_VEICULO: Record<string, string> = {
  ATIVO: 'Ativo', EM_MANUTENCAO: 'Em manutenção', PARADO: 'Parado', RESERVA: 'Reserva', BAIXADO: 'Baixado'
};
export const ROTULO_REGIME: Record<string, string> = { PROPRIO: 'Próprio', LOCADO: 'Locado' };
export const ROTULO_SINISTRO: Record<string, string> = {
  RASCUNHO: 'Rascunho', EM_OFICINA: 'Em oficina', SEGURADORA_ACIONADA: 'Seguradora acionada', FINALIZADO: 'Finalizado'
};
export const ROTULO_TIPO_SINISTRO: Record<string, string> = {
  COLISAO_SEM_VITIMA: 'Colisão sem vítima', COLISAO_COM_VITIMA: 'Colisão com vítima', SEM_TERCEIROS: 'Sem terceiros',
  INTRAFROTA: 'Intrafrota', CARGA_AVARIADA: 'Carga avariada', FURTO: 'Furto', ASSALTO: 'Assalto'
};

export const rotulo = (mapa: Record<string, string>, chave: string | null | undefined, vazio = 'Não informado') =>
  chave ? (mapa[chave] ?? chave) : vazio;

// ── Alvos e ações ────────────────────────────────────────────────────────────────────────────────

export const alvo = (dimension: string, value: string): AlvoAnalise => ({ dimension, value });
export const navegar = (dimension: string, value: string): AcaoAnalise => ({ tipo: 'navegar', alvo: alvo(dimension, value) });

// ── Números ──────────────────────────────────────────────────────────────────────────────────────

export const soma = <T>(linhas: readonly T[], fn: (l: T) => number | null | undefined) =>
  linhas.reduce((s, l) => s + (Number(fn(l)) || 0), 0);

export function media(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function mediana(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export const dividir = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || !b ? null : a / b;

export const ind = (atual: number | null, anterior: number | null): IndicadorFrota => ({ atual, anterior });

export const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`;

/** "+12% sobre o período anterior" ou o equivalente em pontos para frações. */
export function textoVariacao(atual: number | null, anterior: number | null, formato: 'moeda' | 'numero' | 'fracao' = 'numero'): string {
  if (atual == null) return 'Sem dados no período';
  if (anterior == null) return 'Sem base no período anterior';
  if (formato === 'fracao') {
    const pp = (atual - anterior) * 100;
    return Math.abs(pp) < 0.05 ? 'Igual ao período anterior' : `${pp > 0 ? '+' : '−'}${numero(Math.abs(pp))} p.p. sobre o anterior`;
  }
  const v = variacao({ atual, anterior });
  if (v === null) return `Anterior: ${formato === 'moeda' ? moeda(anterior) : numero(anterior)}`;
  return Math.abs(v) < 0.005 ? 'Igual ao período anterior' : `${v > 0 ? '+' : '−'}${pct(Math.abs(v))} sobre o anterior`;
}

// ── Datas e meses ────────────────────────────────────────────────────────────────────────────────

/** "2026-03-01" do mês de um instante ISO, no fuso do navegador. */
export function mesDe(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = iso.length === 10 ? dataLocal(iso) : new Date(iso);
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Meses do período do relatório, em ordem ("2026-05-01", …). */
export function mesesDoPeriodo(r: RelatorioGerencialFrota): string[] {
  const de = dataLocal(r.periodo.de)!;
  const ate = dataLocal(r.periodo.ate)!;
  const meses: string[] = [];
  for (let d = new Date(de.getFullYear(), de.getMonth(), 1); d <= ate; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  return meses;
}

export const dataBr = (iso: string | null | undefined) =>
  !iso ? '—' : (iso.length === 10 ? dataLocal(iso)! : new Date(iso)).toLocaleDateString('pt-BR');

export const diaDaSemana = (iso: string) => new Date(iso).getDay();
export const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// ── Agrupamento ──────────────────────────────────────────────────────────────────────────────────

export interface Grupo<T> {
  chave: string;
  rotulo: string;
  linhas: T[];
}

/** Agrupa e ordena pelo critério (padrão: quantidade de linhas, decrescente). */
export function agrupar<T>(linhas: readonly T[], chave: (l: T) => string | null | undefined, nome: (l: T) => string,
                           ordem: (g: Grupo<T>) => number = (g) => g.linhas.length): Grupo<T>[] {
  const mapa = new Map<string, Grupo<T>>();
  for (const l of linhas) {
    const k = chave(l) ?? '—';
    let g = mapa.get(k);
    if (!g) mapa.set(k, (g = { chave: k, rotulo: nome(l), linhas: [] }));
    g.linhas.push(l);
  }
  return [...mapa.values()].sort((a, b) => ordem(b) - ordem(a));
}

/** Rótulos e uma série a partir de grupos (para `ces-chart`). */
export function serieDeGrupos<T>(grupos: readonly Grupo<T>[], nome: string, valor: (g: Grupo<T>) => number, limite = 12) {
  const g = grupos.slice(0, limite);
  return { rotulos: g.map((x) => x.rotulo), series: [{ name: nome, values: g.map(valor) }] as CesChartSeries[], grupos: g };
}

/** Pareto: quantos itens (do maior para o menor) somam `corte` do total. */
export function pareto(valores: readonly number[], corte = 0.8): { itens: number; total: number; fracao: number } {
  const ordenados = [...valores].filter((v) => v > 0).sort((a, b) => b - a);
  const total = ordenados.reduce((a, b) => a + b, 0);
  let acumulado = 0;
  let itens = 0;
  for (const v of ordenados) {
    acumulado += v;
    itens++;
    if (acumulado >= total * corte) break;
  }
  return { itens, total: ordenados.length, fracao: ordenados.length ? itens / ordenados.length : 0 };
}

// ── Gráficos e tabelas da análise ────────────────────────────────────────────────────────────────

export function grafico(id: string, titulo: string, tipo: GraficoAnalise['tipo'], rotulos: readonly string[],
                        series: readonly CesChartSeries[], extra: Partial<GraficoAnalise> = {}): GraficoAnalise {
  const altura = extra.altura ?? (tipo === 'bar-horizontal' ? Math.max(200, rotulos.length * 30) : undefined);
  return { id, titulo, tipo, rotulos, series, ...extra, ...(altura ? { altura } : {}) };
}

export function tabela<T>(t: TabelaAnalise<T>): TabelaAnalise<T> {
  return t;
}

export const colPlaca = <T extends { placa: string | null }>(): CesDataTableColumn<T> =>
  ({ key: 'placa', header: 'Veículo', priority: 1, value: (v) => v.placa ?? '—' });

// ── Links para os registros de origem ────────────────────────────────────────────────────────────

export const linkVeiculo = (id: string, aba?: string): LinkAnalise =>
  ({ rotulo: 'Abrir a ficha do veículo', icone: 'pi pi-car', rota: ['/frota/veiculos', id], queryParams: aba ? { aba } : undefined });
export const linkOs = (id: string): LinkAnalise => ({ rotulo: 'Abrir a OS', icone: 'pi pi-wrench', rota: ['/frota/ordens-servico', id] });
export const linkAbastecimento = (id: string): LinkAnalise =>
  ({ rotulo: 'Abrir o abastecimento', icone: 'pi pi-gauge', rota: ['/frota/abastecimentos'], queryParams: { abastecimento: id } });
export const linkDespesa = (id: string): LinkAnalise =>
  ({ rotulo: 'Abrir a despesa', icone: 'pi pi-receipt', rota: ['/frota/despesas'], queryParams: { despesa: id } });
export const linkSinistro = (id: string): LinkAnalise =>
  ({ rotulo: 'Abrir o sinistro', icone: 'pi pi-exclamation-circle', rota: ['/frota/sinistros'], queryParams: { sinistro: id } });
export const linkChecklist = (id: string): LinkAnalise =>
  ({ rotulo: 'Abrir o checklist', icone: 'pi pi-list-check', rota: ['/frota/checklists', id, 'relatorio'] });

/** Linha de veículo do relatório pelo id (para as análises cruzarem com os números do painel). */
export function veiculoDo(r: RelatorioGerencialFrota, id: string): VeiculoRelatorioFrota | undefined {
  return r.veiculos.find((v) => v.idVeiculo === id);
}

/** Tom de um número contra uma referência ("menor é melhor" por padrão). */
export function tomContra(valor: number | null, referencia: number | null, tolerancia = 0.15, menorMelhor = true): CesTone {
  if (valor == null || referencia == null || referencia === 0) return 'neutral';
  const desvio = valor / referencia - 1;
  const ruim = menorMelhor ? desvio > tolerancia : desvio < -tolerancia;
  const bom = menorMelhor ? desvio < -tolerancia : desvio > tolerancia;
  return ruim ? 'warning' : bom ? 'success' : 'neutral';
}

