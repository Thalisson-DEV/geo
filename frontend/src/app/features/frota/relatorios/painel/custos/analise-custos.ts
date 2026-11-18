import { CesDataTableColumn, CesTone } from '@ces/ui';
import { of } from 'rxjs';

import { LancamentoFrota, RelatorioGerencialFrota, VeiculoRelatorioFrota } from '../../../../../core/models/frota-relatorios.models';
import {
  DestaqueAnalise,
  DetalheRegistro,
  GraficoAnalise,
  KpiAnalise,
  OrigemAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  Grupo,
  ROTULO_CATEGORIA,
  ROTULO_REGIME,
  agrupar,
  alvo,
  dataBr,
  dividir,
  grafico,
  inteiro,
  linkDespesa,
  linkOs,
  linkSinistro,
  linkAbastecimento,
  linkVeiculo,
  mediana,
  mesDe,
  mesesDoPeriodo,
  moeda,
  moedaCurta,
  navegar,
  numero,
  pareto,
  pct,
  plural,
  rotuloMes,
  soma,
  textoVariacao
} from '../frota-analise-comum';

export const PARTES = ['MANUTENCAO', 'COMBUSTIVEL', 'DESPESAS', 'SEGURO', 'LOCACAO', 'FRANQUIAS'] as const;
export type Parte = (typeof PARTES)[number];
const CAMPO: Record<Parte, keyof VeiculoRelatorioFrota> = {
  MANUTENCAO: 'manutencao', COMBUSTIVEL: 'combustivel', DESPESAS: 'despesas', SEGURO: 'seguro', LOCACAO: 'locacao', FRANQUIAS: 'franquias'
};
const CAMPO_MES = { MANUTENCAO: 'manutencao', COMBUSTIVEL: 'combustivel', DESPESAS: 'despesas', SEGURO: 'seguro', LOCACAO: 'locacao', FRANQUIAS: 'franquias' } as const;

/** Veículo com o custo das categorias escolhidas no painel. */
export interface VeiculoCusto extends VeiculoRelatorioFrota {
  custo: number;
  custoKm: number | null;
  /** Diferença sobre o período anterior (só com todas as categorias). */
  delta: number | null;
  /** R$/km sobre a mediana do tipo (1,5 = 50% acima). */
  sobreTipo: number | null;
}

export type DimensaoGrupo = 'base' | 'processo' | 'tipo' | 'regime';
export const ROTULO_DIMENSAO: Record<DimensaoGrupo, string> = { base: 'Base operacional', processo: 'Processo', tipo: 'Tipo de veículo', regime: 'Regime' };

export interface GrupoCusto {
  dimensao: DimensaoGrupo;
  id: string;
  nome: string;
  veiculos: VeiculoCusto[];
  custo: number;
  km: number;
  custoKm: number | null;
  anterior: number;
}

/** Tudo o que o painel de custos mostra, já com o filtro de categorias aplicado. */
export interface ModeloCustos {
  r: RelatorioGerencialFrota;
  categorias: Parte[];
  todas: boolean;
  total: number;
  anterior: number;
  custoKm: number | null;
  custoKmAnterior: number | null;
  veiculoMes: number | null;
  veiculoMesAnterior: number | null;
  veiculos: VeiculoCusto[];
  lancamentos: LancamentoFrota[];
  meses: string[];
  mensal: { mes: string; partes: Record<Parte, number>; total: number; km: number }[];
  porCategoria: { parte: Parte; rotulo: string; valor: number; anterior: number }[];
  grupos: Record<DimensaoGrupo, GrupoCusto[]>;
  concentracao: { itens: number; total: number; fracao: number };
  foraDaCurva: VeiculoCusto[];
  maioresAltas: VeiculoCusto[];
  despesasPorTipo: Grupo<LancamentoFrota>[];
}

const MIN_KM_EFICIENCIA = 300;
const LIMITE_SOBRE_TIPO = 1.5;

export function modeloCustos(r: RelatorioGerencialFrota, lancamentos: LancamentoFrota[], escolhidas: readonly string[]): ModeloCustos {
  const visiveis = r.custos.porCategoria.map((c) => c.categoria as Parte);
  const categorias = (escolhidas.length ? visiveis.filter((c) => escolhidas.includes(c)) : visiveis) as Parte[];
  const todas = categorias.length === visiveis.length;

  const custoDe = (v: VeiculoRelatorioFrota) => soma(categorias, (p) => v[CAMPO[p]] as number | null);
  const base = r.veiculos.map((v) => {
    const custo = custoDe(v);
    return { ...v, custo, custoKm: v.km > 0 ? custo / v.km : null, delta: todas ? v.total - v.totalAnterior : null, sobreTipo: null } as VeiculoCusto;
  });
  const medianaTipo = new Map<string, number | null>();
  for (const g of agrupar(base.filter((v) => v.km >= MIN_KM_EFICIENCIA && v.custoKm != null), (v) => v.idTipo, (v) => v.tipo ?? '')) {
    medianaTipo.set(g.chave, mediana(g.linhas.map((v) => v.custoKm)));
  }
  const veiculos = base.map((v) => {
    const m = medianaTipo.get(v.idTipo ?? '—');
    return { ...v, sobreTipo: v.km >= MIN_KM_EFICIENCIA && v.custoKm != null && m ? v.custoKm / m : null };
  }).sort((a, b) => b.custo - a.custo);

  const porCategoria = r.custos.porCategoria.filter((c) => categorias.includes(c.categoria as Parte))
    .map((c) => ({ parte: c.categoria as Parte, rotulo: c.rotulo, valor: c.valor, anterior: c.anterior }));
  const total = soma(porCategoria, (c) => c.valor);
  const anterior = soma(porCategoria, (c) => c.anterior);
  const comKm = veiculos.filter((v) => v.km > 0);
  const kmTotal = soma(comKm, (v) => v.km);
  const custoKm = kmTotal > 0 ? soma(comKm, (v) => v.custo) / kmTotal : null;
  const kmAnterior = soma(veiculos, (v) => v.kmAnterior);
  const custoKmAnterior = todas && kmAnterior > 0
    ? soma(veiculos.filter((v) => v.kmAnterior > 0), (v) => v.totalAnterior) / kmAnterior : null;
  const fatorMes = r.recorte.emOperacao * r.periodo.dias / 30;

  const lancs = lancamentos.filter((l) => categorias.includes(l.categoria as Parte));
  const meses = mesesDoPeriodo(r);
  const mensal = r.custos.mensal.map((m) => {
    const partes = Object.fromEntries(PARTES.map((p) => [p, categorias.includes(p) ? Number(m[CAMPO_MES[p]]) || 0 : 0])) as Record<Parte, number>;
    return { mes: m.mes, partes, total: soma(PARTES, (p) => partes[p]), km: m.km };
  });

  const grupoDe = (dim: DimensaoGrupo, id: (v: VeiculoCusto) => string | null, nome: (v: VeiculoCusto) => string): GrupoCusto[] =>
    agrupar(veiculos, id, nome, (g) => soma(g.linhas, (v) => v.custo)).map((g) => {
      const km = soma(g.linhas, (v) => v.km);
      const custoComKm = soma(g.linhas.filter((v) => v.km > 0), (v) => v.custo);
      return {
        dimensao: dim, id: g.chave, nome: g.rotulo, veiculos: g.linhas, custo: soma(g.linhas, (v) => v.custo), km,
        custoKm: km > 0 ? custoComKm / km : null, anterior: soma(g.linhas, (v) => v.totalAnterior)
      };
    });

  return {
    r, categorias, todas, total, anterior, custoKm, custoKmAnterior,
    veiculoMes: fatorMes > 0 ? total / fatorMes : null,
    veiculoMesAnterior: fatorMes > 0 ? anterior / fatorMes : null,
    veiculos, lancamentos: lancs, meses, mensal, porCategoria,
    grupos: {
      base: grupoDe('base', (v) => v.idBase, (v) => v.base ?? 'Sem base'),
      processo: grupoDe('processo', (v) => v.idProcesso, (v) => v.processo ?? 'Sem equipe vinculada'),
      tipo: grupoDe('tipo', (v) => v.idTipo, (v) => v.tipo ?? 'Sem tipo'),
      regime: grupoDe('regime', (v) => v.regime, (v) => ROTULO_REGIME[v.regime ?? ''] ?? 'Sem regime')
    },
    concentracao: pareto(veiculos.map((v) => v.custo)),
    foraDaCurva: veiculos.filter((v) => (v.sobreTipo ?? 0) >= LIMITE_SOBRE_TIPO).sort((a, b) => (b.sobreTipo ?? 0) - (a.sobreTipo ?? 0)),
    maioresAltas: todas ? veiculos.filter((v) => (v.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)) : [],
    despesasPorTipo: agrupar(lancs.filter((l) => l.categoria === 'DESPESAS'), (l) => tipoDespesa(l), (l) => tipoDespesa(l),
      (g) => soma(g.linhas, (l) => l.valor))
  };
}

export const tipoDespesa = (l: LancamentoFrota) => (l.descricao ?? 'Despesa').split(' · ')[0];

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoCustos(m: ModeloCustos): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const leituras: LeituraGerencial[] = [];
  const varTotal = m.anterior > 0 ? (m.total - m.anterior) / m.anterior : null;

  if (varTotal !== null && Math.abs(varTotal) >= 0.1) {
    const maior = [...m.porCategoria].sort((a, b) => Math.abs(b.valor - b.anterior) - Math.abs(a.valor - a.anterior))[0];
    leituras.push({
      id: 'variacao', tom: varTotal > 0 ? 'warning' : 'success', icone: varTotal > 0 ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right',
      titulo: varTotal > 0 ? 'Custo subiu' : 'Custo caiu', valor: `${varTotal > 0 ? '+' : '−'}${pct(Math.abs(varTotal))}`,
      texto: maior
        ? `${maior.rotulo} foi o que mais mexeu: ${moeda(maior.anterior)} → ${moeda(maior.valor)} (${maior.valor >= maior.anterior ? '+' : '−'}${moeda(Math.abs(maior.valor - maior.anterior))}).`
        : 'Comparado ao período anterior de mesma duração.',
      acao: maior ? { rotulo: `Analisar ${maior.rotulo.toLowerCase()}`, alvo: alvo('categoria', maior.parte) } : undefined
    });
  }
  if (m.concentracao.total >= 5) {
    const c = m.concentracao;
    leituras.push({
      id: 'concentracao', tom: c.fracao <= 0.2 ? 'warning' : 'info', icone: 'pi pi-chart-pie',
      titulo: 'Onde está o dinheiro', valor: `${c.itens} de ${c.total}`,
      texto: `${plural(c.itens, 'veículo responde', 'veículos respondem')} por 80% do custo. ${m.veiculos[0] ? `O maior é ${m.veiculos[0].placa}, com ${moeda(m.veiculos[0].custo)} (${pct(m.veiculos[0].custo / (m.total || 1))} do total).` : ''}`,
      acao: { rotulo: 'Ver a concentração', alvo: alvo('kpi', 'concentracao') }
    });
  }
  if (m.foraDaCurva.length) {
    const v = m.foraDaCurva[0];
    leituras.push({
      id: 'fora-curva', tom: 'warning', icone: 'pi pi-exclamation-triangle',
      titulo: 'Custo por km fora da curva', valor: inteiro(m.foraDaCurva.length),
      texto: `${plural(m.foraDaCurva.length, 'veículo custa', 'veículos custam')} 50% ou mais por km do que a mediana do próprio tipo. ${v.placa} chega a ${numero(v.sobreTipo, 1)}× (${moeda(v.custoKm)}/km).`,
      acao: { rotulo: 'Ver os veículos', alvo: alvo('kpi', 'fora-da-curva') }
    });
  }
  if (m.maioresAltas.length && m.maioresAltas[0].delta! > 0) {
    const v = m.maioresAltas[0];
    leituras.push({
      id: 'maior-alta', tom: 'warning', icone: 'pi pi-car', titulo: 'Maior alta por veículo', valor: `+${moedaCurta(v.delta)}`,
      texto: `${v.placa} foi de ${moeda(v.totalAnterior)} para ${moeda(v.total)}. ${m.maioresAltas.length > 1 ? `Outros ${m.maioresAltas.length - 1} veículos também subiram.` : ''}`,
      acao: { rotulo: `Analisar ${v.placa}`, alvo: alvo('veiculo', v.idVeiculo) }
    });
  }
  const proprio = m.grupos.regime.find((g) => g.id === 'PROPRIO');
  const locado = m.grupos.regime.find((g) => g.id === 'LOCADO');
  if (proprio?.custoKm && locado?.custoKm) {
    const rel = locado.custoKm / proprio.custoKm;
    leituras.push({
      id: 'regime', tom: Math.abs(rel - 1) >= 0.25 ? 'warning' : 'info', icone: 'pi pi-arrow-right-arrow-left',
      titulo: 'Locado × próprio', valor: `${numero(rel, 2)}×`,
      texto: `O km do locado sai a ${moeda(locado.custoKm)} e o do próprio a ${moeda(proprio.custoKm)}. ${rel > 1.25 ? 'Vale rever contratos de locação ou a alocação desses veículos.' : rel < 0.8 ? 'Os próprios estão mais caros: idade e manutenção pesam.' : 'Os dois estão próximos.'}`,
      acao: { rotulo: 'Comparar os regimes', alvo: alvo('grupo', 'regime~LOCADO') }
    });
  }
  const base = m.grupos.base.filter((g) => g.custoKm != null && g.km > 1000);
  if (base.length >= 2) {
    const ordenadas = [...base].sort((a, b) => (b.custoKm ?? 0) - (a.custoKm ?? 0));
    const cara = ordenadas[0];
    const barata = ordenadas[ordenadas.length - 1];
    if (cara.custoKm! > barata.custoKm! * 1.3) {
      leituras.push({
        id: 'bases', tom: 'info', icone: 'pi pi-building', titulo: 'Base mais cara por km', valor: moeda(cara.custoKm),
        texto: `${cara.nome} roda a ${moeda(cara.custoKm)}/km; ${barata.nome}, a ${moeda(barata.custoKm)}/km. Mesmo serviço, custo ${pct(cara.custoKm! / barata.custoKm! - 1, 0)} maior.`,
        acao: { rotulo: `Analisar ${cara.nome}`, alvo: alvo('grupo', `base~${cara.id}`) }
      });
    }
  }
  const despesa = m.despesasPorTipo[0];
  if (despesa && m.total > 0) {
    const valor = soma(despesa.linhas, (l) => l.valor);
    if (valor / m.total >= 0.05) {
      leituras.push({
        id: 'despesa', tom: 'info', icone: 'pi pi-receipt', titulo: 'Despesa que mais pesa', valor: moedaCurta(valor),
        texto: `${despesa.rotulo}: ${plural(despesa.linhas.length, 'lançamento', 'lançamentos')}, ${pct(valor / m.total)} do custo do período.`,
        acao: { rotulo: 'Ver os lançamentos', alvo: alvo('despesa', despesa.chave) }
      });
    }
  }
  if (m.r.resumo.aguardandoFinanceiro > 0) {
    leituras.push({
      id: 'financeiro', tom: 'info', icone: 'pi pi-hourglass', titulo: 'Aguardando o financeiro', valor: moedaCurta(m.r.resumo.aguardandoFinanceiro),
      texto: 'Despesas e parcelas de seguro com pagamento solicitado e ainda sem decisão. Ainda não estão no custo pago.',
    });
  }

  const tom: CesTone = varTotal !== null && varTotal > 0.15 ? 'warning' : m.foraDaCurva.length > 2 ? 'warning' : 'success';
  const veredito: VereditoGerencial = {
    tom,
    rotulo: tom === 'warning' ? 'Acompanhar' : 'Sob controle',
    titulo: varTotal === null ? `A frota custou ${moeda(m.total)}` : varTotal > 0.15 ? `Custo ${pct(varTotal, 0)} acima do período anterior`
      : varTotal < -0.05 ? `Custo ${pct(-varTotal, 0)} abaixo do período anterior` : 'Custo estável',
    texto: `${moeda(m.total)} no período${m.custoKm != null ? `, ${moeda(m.custoKm)} por km` : ''}${m.veiculoMes != null ? ` e ${moeda(m.veiculoMes)} por veículo/mês` : ''}.`
      + `${m.todas ? '' : ` Só ${m.categorias.map((c) => ROTULO_CATEGORIA[c].toLowerCase()).join(', ')}.`}`
  };
  return {
    veredito, leituras,
    pergunta: `Analise os custos da frota neste recorte (${veredito.texto}) e diga onde está o desperdício e as 3 ações que mais reduzem custo.`
  };
}

// ── Análises (drill-down) ────────────────────────────────────────────────────────────────────────

const colLancamentos: CesDataTableColumn<LancamentoFrota>[] = [
  { key: 'data', header: 'Data', type: 'date', priority: 1 },
  { key: 'placa', header: 'Veículo', priority: 1, value: (l) => l.placa ?? '—' },
  { key: 'categoria', header: 'Categoria', priority: 2, value: (l) => ROTULO_CATEGORIA[l.categoria] ?? l.categoria },
  { key: 'descricao', header: 'Descrição', priority: 2, value: (l) => (l.numero ? `#${l.numero} · ` : '') + (l.descricao ?? '') },
  { key: 'contraparte', header: 'Fornecedor / posto', priority: 3, value: (l) => l.contraparte ?? '—' },
  { key: 'valor', header: 'Valor', type: 'currency', priority: 1 }
];

const colVeiculos: CesDataTableColumn<VeiculoCusto>[] = [
  { key: 'placa', header: 'Veículo', priority: 1 },
  { key: 'tipo', header: 'Tipo', priority: 2, value: (v) => v.tipo ?? '' },
  { key: 'base', header: 'Base', priority: 3, value: (v) => v.base ?? '' },
  { key: 'custo', header: 'Custo', type: 'currency', priority: 1 },
  { key: 'km', header: 'Km', type: 'integer', priority: 2 },
  { key: 'custoKm', header: 'R$/km', type: 'custom', priority: 1, value: (v) => v.custoKm ?? -1, display: (v) => moeda(v.custoKm) }
];

function detalharLancamento(l: LancamentoFrota): DetalheRegistro {
  const link = l.categoria === 'MANUTENCAO' ? linkOs(l.id) : l.categoria === 'COMBUSTIVEL' ? linkAbastecimento(l.id)
    : l.categoria === 'DESPESAS' ? linkDespesa(l.id) : linkSinistro(l.id);
  return {
    titulo: `${ROTULO_CATEGORIA[l.categoria]}${l.numero ? ` #${l.numero}` : ''}`,
    subtitulo: `${l.placa ?? ''} · ${dataBr(l.data)}`,
    campos: [
      { rotulo: 'Valor', valor: moeda(l.valor), icone: 'pi pi-wallet' },
      { rotulo: 'Descrição', valor: l.descricao ?? '—' },
      { rotulo: 'Fornecedor / posto', valor: l.contraparte ?? '—' }
    ],
    links: [link, linkVeiculo(l.idVeiculo)]
  };
}

function origemLancamentos(chave: string, titulo: string, linhas: LancamentoFrota[], esperado?: number): OrigemAnalise<LancamentoFrota> {
  return {
    chave: `lanc:${chave}`, titulo, rotuloAba: 'Lançamentos', icone: 'pi pi-list',
    descricao: 'Cada OS, despesa, abastecimento e franquia que compõe o número. Seguro e locação são rateios e não aparecem aqui.',
    colunas: colLancamentos, carregar: () => of({ linhas, total: linhas.length }), chaveLinha: (l) => `${l.categoria}:${l.id}`,
    rotuloLinha: (l) => `${l.placa ?? ''} ${ROTULO_CATEGORIA[l.categoria]}`,
    conferencia: esperado != null ? { quantidadeEsperada: linhas.length, valorEsperado: esperado, somar: (l) => l.valor, formato: 'moeda' } : undefined,
    detalhar: detalharLancamento, nomeArquivo: `frota-lancamentos-${chave}`, vazio: 'Nenhum lançamento neste recorte.'
  };
}

function graficoVeiculos(id: string, titulo: string, veiculos: VeiculoCusto[], valor: (v: VeiculoCusto) => number, formato: 'currency' | 'number' = 'currency', limite = 12): GraficoAnalise {
  const top = veiculos.slice(0, limite);
  return grafico(id, titulo, 'bar-horizontal', top.map((v) => v.placa), [{ name: titulo, values: top.map(valor) }], {
    formato, altura: Math.max(200, top.length * 28), aoSelecionar: (i) => (top[i] ? navegar('veiculo', top[i].idVeiculo) : null),
    rotuloSelecao: 'Analisar o veículo'
  });
}

function graficoCategorias(id: string, titulo: string, v: VeiculoRelatorioFrota, categorias: Parte[]): GraficoAnalise {
  const partes = categorias.filter((p) => Number(v[CAMPO[p]]) > 0);
  return grafico(id, titulo, 'doughnut', partes.map((p) => ROTULO_CATEGORIA[p]), [{ name: 'Custo', values: partes.map((p) => Number(v[CAMPO[p]])) }], {
    formato: 'currency', aoSelecionar: (i) => (partes[i] ? navegar('categoria', partes[i]) : null), rotuloSelecao: 'Analisar a categoria'
  });
}

/** Resolve o alvo do `?drill=` numa vista do painel de custos. */
export function vistaCustos(a: { dimension: string; value: string }, m: ModeloCustos): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  switch (a.dimension) {
    case 'kpi':
      return vistaKpi(a.value, m, chave);
    case 'mes':
      return vistaMes(a.value, m, chave);
    case 'categoria':
      return vistaCategoria(a.value as Parte, m, chave);
    case 'grupo': {
      const [dim, id] = a.value.split('~') as [DimensaoGrupo, string];
      return vistaGrupo(dim, id, m, chave);
    }
    case 'veiculo':
      return vistaVeiculo(a.value, m, chave);
    case 'despesa':
      return vistaDespesa(a.value, m, chave);
    default:
      return null;
  }
}

function vistaKpi(qual: string, m: ModeloCustos, chave: string): VistaAnalise | null {
  const kpisBase: KpiAnalise[] = [
    { rotulo: 'Custo total', valor: moeda(m.total), detalhe: textoVariacao(m.total, m.anterior || null, 'moeda'), icone: 'pi pi-wallet' },
    { rotulo: 'R$/km', valor: moeda(m.custoKm), detalhe: textoVariacao(m.custoKm, m.custoKmAnterior, 'moeda'), icone: 'pi pi-directions' },
    { rotulo: 'Por veículo/mês', valor: moeda(m.veiculoMes), detalhe: `${inteiro(m.r.recorte.emOperacao)} veículos em operação`, icone: 'pi pi-car' }
  ];
  if (qual === 'total') {
    return {
      chave, eyebrow: 'Custo total', titulo: 'De onde vem o custo do período', icone: 'pi pi-wallet', kpis: kpisBase,
      destaques: destaquesTotal(m),
      graficos: [
        grafico('mensal', 'Custo por mês', 'bar-stacked', m.mensal.map((x) => rotuloMes(x.mes)),
          m.categorias.map((p) => ({ name: ROTULO_CATEGORIA[p], values: m.mensal.map((x) => x.partes[p]) })),
          { formato: 'currency', inteiro: true, aoSelecionar: (i) => (m.mensal[i] ? navegar('mes', m.mensal[i].mes) : null), rotuloSelecao: 'Analisar o mês' }),
        graficoVeiculos('top', 'Veículos que mais custaram', m.veiculos.filter((v) => v.custo > 0), (v) => v.custo)
      ],
      origem: origemLancamentos('total', 'Lançamentos do período', m.lancamentos)
    };
  }
  if (qual === 'km' || qual === 'veiculo-mes') {
    const efic = m.veiculos.filter((v) => v.custoKm != null).sort((a, b) => (b.custoKm ?? 0) - (a.custoKm ?? 0));
    const tipos = Object.values(m.grupos.tipo).filter((g) => g.custoKm != null);
    return {
      chave, eyebrow: qual === 'km' ? 'Custo por km' : 'Custo por veículo/mês', titulo: 'Eficiência do custo', icone: 'pi pi-directions',
      descricao: 'R$/km = custo dos veículos que rodaram ÷ km rodado. Veículo com pouco km fica caro por km: olhe junto com o uso.',
      kpis: [...kpisBase, { rotulo: 'Mediana por veículo', valor: moeda(mediana(efic.map((v) => v.custoKm))), detalhe: 'Metade dos veículos fica abaixo' }],
      graficos: [
        graficoVeiculos('rkm', 'R$/km por veículo (mais caros)', efic, (v) => v.custoKm ?? 0),
        grafico('tipos', 'R$/km por tipo de veículo', 'bar-horizontal', tipos.map((g) => g.nome), [{ name: 'R$/km', values: tipos.map((g) => g.custoKm ?? 0) }],
          { formato: 'currency', aoSelecionar: (i) => (tipos[i] ? navegar('grupo', `tipo~${tipos[i].id}`) : null), rotuloSelecao: 'Analisar o tipo' })
      ],
      tabelas: [{ id: 'efic', titulo: 'R$/km por veículo', colunas: colVeiculos, linhas: efic, chaveLinha: (v) => v.idVeiculo,
        aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', nomeArquivo: 'frota-custo-por-km' }]
    };
  }
  if (qual === 'concentracao') {
    const comCusto = m.veiculos.filter((v) => v.custo > 0);
    let acc = 0;
    const acumulado = comCusto.map((v) => (acc += v.custo) / (m.total || 1));
    const c = m.concentracao;
    return {
      chave, eyebrow: 'Concentração', titulo: `${c.itens} de ${c.total} veículos fazem 80% do custo`, icone: 'pi pi-chart-pie', kpis: [
        { rotulo: 'Veículos com custo', valor: inteiro(c.total) },
        { rotulo: 'Fazem 80% do custo', valor: inteiro(c.itens), detalhe: pct(c.fracao) + ' da frota com custo' },
        { rotulo: 'Maior custo', valor: moeda(comCusto[0]?.custo), detalhe: comCusto[0]?.placa }
      ],
      destaques: [{ icone: 'pi pi-lightbulb', tom: 'info', texto: c.fracao <= 0.3
        ? 'Poucos veículos concentram o custo: atacar esses casos (manutenção recorrente, substituição, devolução) tem retorno rápido.'
        : 'O custo está espalhado pela frota: o ganho vem de regras gerais (preço de combustível, preventiva, política de despesas).' }],
      graficos: [
        grafico('pareto', 'Custo acumulado (%) do maior para o menor', 'line', comCusto.map((v) => v.placa), [{ name: '% acumulado', values: acumulado }],
          { formato: 'percent', inteiro: true, aoSelecionar: (i) => (comCusto[i] ? navegar('veiculo', comCusto[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' })
      ],
      tabelas: [{ id: 'top', titulo: 'Veículos do maior para o menor custo', colunas: colVeiculos, linhas: comCusto, chaveLinha: (v) => v.idVeiculo,
        aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', nomeArquivo: 'frota-concentracao-custo' }]
    };
  }
  if (qual === 'fora-da-curva') {
    const colunas: CesDataTableColumn<VeiculoCusto>[] = [
      ...colVeiculos,
      { key: 'sobreTipo', header: 'Sobre a mediana do tipo', type: 'custom', priority: 1, value: (v) => v.sobreTipo ?? 0, display: (v) => `${numero(v.sobreTipo, 2)}×` }
    ];
    return {
      chave, eyebrow: 'Fora da curva', titulo: 'Veículos caros para o próprio tipo', icone: 'pi pi-exclamation-triangle',
      descricao: `R$/km 50% ou mais acima da mediana do tipo, com ao menos ${MIN_KM_EFICIENCIA} km no período.`,
      kpis: [
        { rotulo: 'Veículos', valor: inteiro(m.foraDaCurva.length), tom: m.foraDaCurva.length ? 'warning' : 'success' },
        { rotulo: 'Custo deles', valor: moeda(soma(m.foraDaCurva, (v) => v.custo)) },
        { rotulo: 'Excesso estimado', valor: moeda(soma(m.foraDaCurva, (v) => v.custo - v.custo / (v.sobreTipo || 1))),
          detalhe: 'Se rodassem na mediana do tipo' }
      ],
      graficos: [graficoVeiculos('sobre', 'Quantas vezes a mediana do tipo', m.foraDaCurva, (v) => v.sobreTipo ?? 0, 'number')],
      tabelas: [{ id: 'fora', titulo: 'Veículos fora da curva', colunas, linhas: m.foraDaCurva, chaveLinha: (v) => v.idVeiculo,
        aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', vazio: 'Nenhum veículo fora da curva.' }]
    };
  }
  if (qual === 'altas') {
    const colunas: CesDataTableColumn<VeiculoCusto>[] = [
      { key: 'placa', header: 'Veículo', priority: 1 },
      { key: 'totalAnterior', header: 'Anterior', type: 'currency', priority: 2 },
      { key: 'total', header: 'Atual', type: 'currency', priority: 1 },
      { key: 'delta', header: 'Diferença', type: 'currency', priority: 1 }
    ];
    const altas = m.maioresAltas;
    return {
      chave, eyebrow: 'Variação por veículo', titulo: 'Quem mais subiu sobre o período anterior', icone: 'pi pi-arrow-up-right',
      kpis: [
        { rotulo: 'Veículos que subiram', valor: inteiro(altas.length) },
        { rotulo: 'Soma das altas', valor: moeda(soma(altas, (v) => v.delta)) },
        { rotulo: 'Variação da frota', valor: textoVariacao(m.total, m.anterior || null, 'moeda') }
      ],
      graficos: [graficoVeiculos('altas', 'Aumento de custo (R$)', altas, (v) => v.delta ?? 0)],
      tabelas: [{ id: 'altas', titulo: 'Veículos com alta', colunas, linhas: altas, chaveLinha: (v) => v.idVeiculo,
        aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', vazio: 'Nenhum veículo subiu.' }]
    };
  }
  return null;
}

function destaquesTotal(m: ModeloCustos): DestaqueAnalise[] {
  const d: DestaqueAnalise[] = [];
  const maior = [...m.porCategoria].sort((a, b) => b.valor - a.valor)[0];
  if (maior && m.total) d.push({ icone: 'pi pi-chart-pie', tom: 'info', texto: `${maior.rotulo} é ${pct(maior.valor / m.total)} do custo.` });
  const mesMaior = [...m.mensal].sort((a, b) => b.total - a.total)[0];
  const mediaMes = m.mensal.length ? m.total / m.mensal.length : 0;
  if (mesMaior && mediaMes && mesMaior.total > mediaMes * 1.3) {
    d.push({ icone: 'pi pi-calendar', tom: 'warning', texto: `${rotuloMes(mesMaior.mes)} foi o mês mais caro: ${moeda(mesMaior.total)}, ${pct(mesMaior.total / mediaMes - 1, 0)} acima da média mensal.` });
  }
  return d;
}

function vistaMes(mes: string, m: ModeloCustos, chave: string): VistaAnalise | null {
  const i = m.mensal.findIndex((x) => x.mes === mes);
  if (i < 0) return null;
  const x = m.mensal[i];
  const lancs = m.lancamentos.filter((l) => mesDe(l.data) === mes);
  const porVeiculo = agrupar(lancs, (l) => l.idVeiculo, (l) => l.placa ?? '—', (g) => soma(g.linhas, (l) => l.valor)).slice(0, 12);
  const partes = m.categorias.filter((p) => x.partes[p] > 0);
  const mediaMes = m.mensal.length ? m.total / m.mensal.length : 0;
  return {
    chave, eyebrow: 'Mês', titulo: `Custo de ${rotuloMes(mes)}`, icone: 'pi pi-calendar',
    kpis: [
      { rotulo: 'Custo do mês', valor: moeda(x.total), detalhe: mediaMes ? `${x.total >= mediaMes ? '+' : '−'}${pct(Math.abs(x.total / mediaMes - 1))} sobre a média mensal` : undefined },
      { rotulo: 'Km rodado', valor: inteiro(x.km) },
      { rotulo: 'R$/km do mês', valor: moeda(dividir(x.total, x.km)) },
      { rotulo: 'Lançamentos', valor: inteiro(lancs.length) }
    ],
    anterior: i > 0 ? { alvo: alvo('mes', m.mensal[i - 1].mes), rotulo: rotuloMes(m.mensal[i - 1].mes) } : undefined,
    proximo: i < m.mensal.length - 1 ? { alvo: alvo('mes', m.mensal[i + 1].mes), rotulo: rotuloMes(m.mensal[i + 1].mes) } : undefined,
    graficos: [
      grafico('cat', 'Por categoria', 'doughnut', partes.map((p) => ROTULO_CATEGORIA[p]), [{ name: 'Custo', values: partes.map((p) => x.partes[p]) }],
        { formato: 'currency', aoSelecionar: (k) => (partes[k] ? navegar('categoria', partes[k]) : null), rotuloSelecao: 'Analisar a categoria' }),
      grafico('veic', 'Veículos do mês', 'bar-horizontal', porVeiculo.map((g) => g.rotulo), [{ name: 'Custo', values: porVeiculo.map((g) => soma(g.linhas, (l) => l.valor)) }],
        { formato: 'currency', aoSelecionar: (k) => (porVeiculo[k] ? navegar('veiculo', porVeiculo[k].chave) : null), rotuloSelecao: 'Analisar o veículo' })
    ],
    origem: origemLancamentos(`mes-${mes}`, `Lançamentos de ${rotuloMes(mes)}`, lancs)
  };
}

function vistaCategoria(parte: Parte, m: ModeloCustos, chave: string): VistaAnalise | null {
  const c = m.porCategoria.find((x) => x.parte === parte) ?? m.r.custos.porCategoria.find((x) => x.categoria === parte) as never;
  if (!c) return null;
  const campo = CAMPO[parte];
  const veiculos = m.veiculos.filter((v) => Number(v[campo]) > 0).sort((a, b) => Number(b[campo]) - Number(a[campo]));
  const lancs = m.lancamentos.filter((l) => l.categoria === parte);
  const valor = (c as { valor: number }).valor;
  const anterior = (c as { anterior: number }).anterior;
  const rateio = parte === 'SEGURO' || parte === 'LOCACAO';
  return {
    chave, eyebrow: 'Categoria', titulo: ROTULO_CATEGORIA[parte], icone: 'pi pi-tag',
    descricao: rateio ? 'Valor rateado por dia de vigência (seguro) ou de contrato (locação).' : undefined,
    kpis: [
      { rotulo: 'No período', valor: moeda(valor), detalhe: textoVariacao(valor, anterior || null, 'moeda') },
      { rotulo: 'Participação', valor: pct(dividir(valor, m.total)) },
      { rotulo: 'Veículos', valor: inteiro(veiculos.length) },
      { rotulo: 'Por veículo', valor: moeda(dividir(valor, veiculos.length)) }
    ],
    graficos: [
      grafico('mensal', 'Por mês', 'bar', m.mensal.map((x) => rotuloMes(x.mes)), [{ name: ROTULO_CATEGORIA[parte], values: m.r.custos.mensal.map((x) => Number(x[CAMPO_MES[parte]])) }],
        { formato: 'currency', aoSelecionar: (i) => (m.mensal[i] ? navegar('mes', m.mensal[i].mes) : null), rotuloSelecao: 'Analisar o mês' }),
      graficoVeiculos('veic', 'Veículos que mais gastaram', veiculos as VeiculoCusto[], (v) => Number(v[campo]))
    ],
    tabelas: rateio ? [{ id: 'veic', titulo: 'Por veículo', colunas: colVeiculos, linhas: veiculos, chaveLinha: (v: VeiculoCusto) => v.idVeiculo,
      aoAtivar: (v: VeiculoCusto) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar' }] : undefined,
    origem: rateio ? undefined : origemLancamentos(`cat-${parte}`, `Lançamentos de ${ROTULO_CATEGORIA[parte].toLowerCase()}`, lancs)
  };
}

function vistaGrupo(dim: DimensaoGrupo, id: string, m: ModeloCustos, chave: string): VistaAnalise | null {
  const grupos = m.grupos[dim];
  const g = grupos.find((x) => x.id === id);
  if (!g) return null;
  const i = grupos.indexOf(g);
  const ids = new Set(g.veiculos.map((v) => v.idVeiculo));
  const lancs = m.lancamentos.filter((l) => ids.has(l.idVeiculo));
  const partes = m.categorias.map((p) => ({ p, v: soma(g.veiculos, (v) => v[CAMPO[p]] as number | null) })).filter((x) => x.v > 0);
  const frota = m.custoKm;
  const veic = [...g.veiculos].sort((a, b) => b.custo - a.custo);
  return {
    chave, eyebrow: ROTULO_DIMENSAO[dim], titulo: g.nome, icone: 'pi pi-sitemap',
    kpis: [
      { rotulo: 'Custo', valor: moeda(g.custo), detalhe: m.todas ? textoVariacao(g.custo, g.anterior || null, 'moeda') : `${pct(dividir(g.custo, m.total))} da frota` },
      { rotulo: 'Veículos', valor: inteiro(g.veiculos.length) },
      { rotulo: 'Km rodado', valor: inteiro(g.km) },
      { rotulo: 'R$/km', valor: moeda(g.custoKm), detalhe: frota != null ? `Frota: ${moeda(frota)}` : undefined,
        tom: g.custoKm != null && frota != null && g.custoKm > frota * 1.2 ? 'warning' : undefined }
    ],
    anterior: i > 0 ? { alvo: alvo('grupo', `${dim}~${grupos[i - 1].id}`), rotulo: grupos[i - 1].nome } : undefined,
    proximo: i < grupos.length - 1 ? { alvo: alvo('grupo', `${dim}~${grupos[i + 1].id}`), rotulo: grupos[i + 1].nome } : undefined,
    graficos: [
      grafico('cat', 'Por categoria', 'doughnut', partes.map((x) => ROTULO_CATEGORIA[x.p]), [{ name: 'Custo', values: partes.map((x) => x.v) }],
        { formato: 'currency', aoSelecionar: (k) => (partes[k] ? navegar('categoria', partes[k].p) : null), rotuloSelecao: 'Analisar a categoria' }),
      graficoVeiculos('veic', 'Veículos do grupo', veic.filter((v) => v.custo > 0), (v) => v.custo)
    ],
    tabelas: [{ id: 'veic', titulo: 'Veículos', colunas: colVeiculos, linhas: veic, chaveLinha: (v) => v.idVeiculo,
      aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', nomeArquivo: `frota-custo-${dim}` }],
    origem: origemLancamentos(`grupo-${dim}-${id}`, `Lançamentos de ${g.nome}`, lancs)
  };
}

function vistaVeiculo(id: string, m: ModeloCustos, chave: string): VistaAnalise | null {
  const v = m.veiculos.find((x) => x.idVeiculo === id);
  if (!v) return null;
  const i = m.veiculos.indexOf(v);
  const lancs = m.lancamentos.filter((l) => l.idVeiculo === id);
  const porMes = m.meses.map((mes) => soma(lancs.filter((l) => mesDe(l.data) === mes), (l) => l.valor));
  const mesmoTipo = m.veiculos.filter((x) => x.idTipo === v.idTipo && x.custoKm != null);
  const medTipo = mediana(mesmoTipo.map((x) => x.custoKm));
  const destaques: DestaqueAnalise[] = [];
  if (v.sobreTipo != null && v.sobreTipo >= LIMITE_SOBRE_TIPO) {
    destaques.push({ icone: 'pi pi-exclamation-triangle', tom: 'warning', texto: `Custa ${numero(v.sobreTipo, 2)}× a mediana dos ${v.tipo ?? 'veículos do mesmo tipo'} por km.` });
  }
  if (v.km === 0 && v.custo > 0) destaques.push({ icone: 'pi pi-pause-circle', tom: 'warning', texto: 'Teve custo e não rodou no período: candidato a remanejamento ou devolução.' });
  if (v.custoSobreFaturamento != null) destaques.push({ icone: 'pi pi-percentage', tom: v.custoSobreFaturamento > 0.25 ? 'warning' : 'info', texto: `O custo do veículo é ${pct(v.custoSobreFaturamento)} do que a equipe dele faturou.` });
  return {
    chave, eyebrow: 'Veículo', titulo: v.placa, descricao: [v.tipo, v.base, v.processo, ROTULO_REGIME[v.regime ?? '']].filter(Boolean).join(' · '),
    icone: 'pi pi-car',
    kpis: [
      { rotulo: 'Custo', valor: moeda(v.custo), detalhe: m.todas ? textoVariacao(v.total, v.totalAnterior || null, 'moeda') : undefined },
      { rotulo: 'Km rodado', valor: inteiro(v.km), detalhe: textoVariacao(v.km, v.kmAnterior || null) },
      { rotulo: 'R$/km', valor: moeda(v.custoKm), detalhe: medTipo != null ? `Mediana do tipo: ${moeda(medTipo)}` : undefined,
        tom: v.sobreTipo != null && v.sobreTipo >= LIMITE_SOBRE_TIPO ? 'warning' : undefined },
      { rotulo: 'Posição no ranking', valor: `${i + 1}º de ${m.veiculos.length}` }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('veiculo', m.veiculos[i - 1].idVeiculo), rotulo: m.veiculos[i - 1].placa } : undefined,
    proximo: i < m.veiculos.length - 1 ? { alvo: alvo('veiculo', m.veiculos[i + 1].idVeiculo), rotulo: m.veiculos[i + 1].placa } : undefined,
    graficos: [
      graficoCategorias('cat', 'Composição do custo', v, m.categorias),
      grafico('mes', 'Lançamentos por mês', 'bar', m.meses.map(rotuloMes), [{ name: 'Valor', values: porMes }], { formato: 'currency' })
    ],
    origem: origemLancamentos(`veiculo-${id}`, `Lançamentos de ${v.placa}`, lancs),
    links: [linkVeiculo(id), { ...linkVeiculo(id, 'manutencoes'), rotulo: 'Manutenções do veículo', icone: 'pi pi-wrench' },
      { ...linkVeiculo(id, 'despesas'), rotulo: 'Despesas do veículo', icone: 'pi pi-receipt' }],
    copiloto: { foco: { tipo: 'secao', id: `veiculo.${id}`, rotulo: v.placa },
      pergunta: `Por que o veículo ${v.placa} custou ${moeda(v.custo)} no período (${moeda(v.custoKm)}/km)? O que fazer com ele?` }
  };
}

function vistaDespesa(tipo: string, m: ModeloCustos, chave: string): VistaAnalise | null {
  const g = m.despesasPorTipo.find((x) => x.chave === tipo);
  if (!g) return null;
  const valor = soma(g.linhas, (l) => l.valor);
  const porVeiculo = agrupar(g.linhas, (l) => l.idVeiculo, (l) => l.placa ?? '—', (x) => soma(x.linhas, (l) => l.valor)).slice(0, 12);
  const porFornecedor = agrupar(g.linhas, (l) => l.contraparte ?? '—', (l) => l.contraparte ?? 'Sem fornecedor', (x) => soma(x.linhas, (l) => l.valor)).slice(0, 10);
  return {
    chave, eyebrow: 'Despesa', titulo: tipo, icone: 'pi pi-receipt',
    kpis: [
      { rotulo: 'Valor', valor: moeda(valor), detalhe: `${pct(dividir(valor, m.total))} do custo` },
      { rotulo: 'Lançamentos', valor: inteiro(g.linhas.length) },
      { rotulo: 'Valor médio', valor: moeda(dividir(valor, g.linhas.length)) },
      { rotulo: 'Veículos', valor: inteiro(porVeiculo.length) }
    ],
    graficos: [
      grafico('veic', 'Por veículo', 'bar-horizontal', porVeiculo.map((x) => x.rotulo), [{ name: 'Valor', values: porVeiculo.map((x) => soma(x.linhas, (l) => l.valor)) }],
        { formato: 'currency', aoSelecionar: (k) => (porVeiculo[k] ? navegar('veiculo', porVeiculo[k].chave) : null), rotuloSelecao: 'Analisar o veículo' }),
      grafico('forn', 'Por fornecedor', 'bar-horizontal', porFornecedor.map((x) => x.rotulo), [{ name: 'Valor', values: porFornecedor.map((x) => soma(x.linhas, (l) => l.valor)) }],
        { formato: 'currency' })
    ],
    origem: origemLancamentos(`despesa-${tipo}`, `Lançamentos de ${tipo}`, g.linhas, valor)
  };
}

export const gruposParaGrafico = (g: GrupoCusto[]) => g.filter((x) => x.custo > 0).slice(0, 12);
