import { CesDataTableColumn, CesTone } from '@ces/ui';
import { of } from 'rxjs';

import {
  AbastecimentoDetalheFrota,
  DetalheCombustivelFrota,
  RelatorioGerencialFrota,
  VeiculoRelatorioFrota
} from '../../../../../core/models/frota-relatorios.models';
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
  NOMES_DIA,
  ROTULO_ALERTA,
  agrupar,
  alvo,
  dividir,
  grafico,
  inteiro,
  linkAbastecimento,
  linkVeiculo,
  media,
  mesDe,
  mesesDoPeriodo,
  moeda,
  navegar,
  numero,
  pct,
  plural,
  rotulo,
  rotuloMes,
  soma,
  textoVariacao
} from '../frota-analise-comum';

export interface FiltrosCombustivel {
  postos: string[];
  alertas: string[];
  condutores: string[];
}

export interface PostoCombustivel {
  id: string;
  nome: string;
  linhas: AbastecimentoDetalheFrota[];
  litros: number;
  valor: number;
  preco: number | null;
  /** Quanto se pagou a mais (ou a menos, negativo) contra o preço médio do recorte. */
  sobrepreco: number;
}

export interface VeiculoCombustivel {
  v: VeiculoRelatorioFrota;
  idVeiculo: string;
  placa: string;
  linhas: AbastecimentoDetalheFrota[];
  litros: number;
  valor: number;
  kmL: number | null;
  referencia: number | null;
  desvio: number | null;
  alertas: number;
  custoKm: number | null;
}

export interface CondutorCombustivel {
  chave: string;
  nome: string;
  linhas: AbastecimentoDetalheFrota[];
  litros: number;
  valor: number;
  alertas: number;
  veiculos: number;
}

export interface ModeloCombustivel {
  r: RelatorioGerencialFrota;
  filtrado: boolean;
  atual: AbastecimentoDetalheFrota[];
  anterior: AbastecimentoDetalheFrota[];
  litros: number;
  litrosAnterior: number;
  valor: number;
  valorAnterior: number;
  valorTotal: number;
  preco: number | null;
  precoAnterior: number | null;
  kmL: number | null;
  kmLAnterior: number | null;
  custoKm: number | null;
  comAlerta: AbastecimentoDetalheFrota[];
  fimDeSemana: AbastecimentoDetalheFrota[];
  aprovacaoHoras: number | null;
  meses: string[];
  mensal: { mes: string; litros: number; valor: number; preco: number | null; abastecimentos: number }[];
  postos: PostoCombustivel[];
  economiaPotencial: number;
  alertas: Grupo<AbastecimentoDetalheFrota>[];
  condutores: CondutorCombustivel[];
  veiculos: VeiculoCombustivel[];
  foraDoPadrao: VeiculoCombustivel[];
  porDia: number[];
}

const aceita = (sel: string[], v: string | null | undefined) => !sel.length || (v != null && sel.includes(v));
const kmLDe = (ls: AbastecimentoDetalheFrota[]) => {
  const validos = ls.filter((a) => a.kmPorLitro != null && a.kmDesdeAnterior != null && a.litros > 0);
  const litros = soma(validos, (a) => a.litros);
  return litros > 0 ? soma(validos, (a) => a.kmDesdeAnterior) / litros : null;
};
const ehFimDeSemana = (iso: string) => [0, 6].includes(new Date(iso).getDay());

export function modeloCombustivel(r: RelatorioGerencialFrota, d: DetalheCombustivelFrota, f: FiltrosCombustivel): ModeloCombustivel {
  const passa = (a: AbastecimentoDetalheFrota) =>
    aceita(f.postos, a.idPosto) && aceita(f.condutores, a.idCondutor) && (!f.alertas.length || a.alertas.some((x) => f.alertas.includes(x)));
  const atual = d.atual.filter(passa);
  const anterior = d.anterior.filter(passa);
  const litros = soma(atual, (a) => a.litros);
  const valor = soma(atual, (a) => a.valorCombustivel);
  const litrosAnterior = soma(anterior, (a) => a.litros);
  const valorAnterior = soma(anterior, (a) => a.valorCombustivel);
  const preco = dividir(valor, litros);

  const postos = agrupar(atual, (a) => a.idPosto, (a) => a.posto, (g) => soma(g.linhas, (a) => a.valorCombustivel)).map((g) => {
    const l = soma(g.linhas, (a) => a.litros);
    const v = soma(g.linhas, (a) => a.valorCombustivel);
    const p = dividir(v, l);
    return { id: g.chave, nome: g.rotulo, linhas: g.linhas, litros: l, valor: v, preco: p, sobrepreco: p != null && preco != null ? (p - preco) * l : 0 };
  });
  const maisBarato = Math.min(...postos.filter((p) => p.preco != null && p.litros >= 50).map((p) => p.preco!));
  const economiaPotencial = Number.isFinite(maisBarato) ? soma(postos, (p) => (p.preco != null && p.preco > maisBarato ? (p.preco - maisBarato) * p.litros : 0)) : 0;

  const veiculos: VeiculoCombustivel[] = r.veiculos.map((v) => {
    const ls = atual.filter((a) => a.idVeiculo === v.idVeiculo);
    const kmL = v.kmPorLitro ?? kmLDe(ls);
    const ref = v.kmPorLitroReferencia;
    const val = soma(ls, (a) => a.valorCombustivel);
    return {
      v, idVeiculo: v.idVeiculo, placa: v.placa, linhas: ls, litros: soma(ls, (a) => a.litros), valor: val, kmL, referencia: ref,
      desvio: kmL != null && ref ? kmL / ref - 1 : null, alertas: ls.filter((a) => a.alertas.length).length,
      custoKm: v.km > 0 ? val / v.km : null
    };
  }).filter((x) => x.linhas.length > 0).sort((a, b) => b.valor - a.valor);

  const veiculosComKm = veiculos.filter((x) => x.v.km > 0);
  const condutores = agrupar(atual, (a) => a.idCondutor, (a) => a.condutor ?? 'Sem condutor', (g) => g.linhas.length).map((g) => ({
    chave: g.chave, nome: g.rotulo, linhas: g.linhas, litros: soma(g.linhas, (a) => a.litros), valor: soma(g.linhas, (a) => a.valorCombustivel),
    alertas: g.linhas.filter((a) => a.alertas.length).length, veiculos: new Set(g.linhas.map((a) => a.idVeiculo)).size
  }));

  const alertas = agrupar(atual.flatMap((a) => a.alertas.map((t) => ({ t, a }))), (x) => x.t, (x) => rotulo(ROTULO_ALERTA, x.t))
    .map((g) => ({ chave: g.chave, rotulo: g.rotulo, linhas: g.linhas.map((x) => x.a) }));

  const meses = mesesDoPeriodo(r);
  return {
    r, filtrado: !!(f.postos.length || f.alertas.length || f.condutores.length), atual, anterior,
    litros, litrosAnterior, valor, valorAnterior, valorTotal: soma(atual, (a) => a.valorTotal),
    preco, precoAnterior: dividir(valorAnterior, litrosAnterior),
    // Sem filtro próprio, o mesmo km/l da visão geral (km do odômetro ÷ litros); com filtro, pelo km entre abastecimentos.
    kmL: !(f.postos.length || f.alertas.length || f.condutores.length) && r.combustivel?.kmPorLitro.atual != null ? r.combustivel.kmPorLitro.atual : kmLDe(atual),
    kmLAnterior: !(f.postos.length || f.alertas.length || f.condutores.length) && r.combustivel ? r.combustivel.kmPorLitro.anterior : kmLDe(anterior),
    custoKm: veiculosComKm.length ? soma(veiculosComKm, (x) => x.valor) / soma(veiculosComKm, (x) => x.v.km) : null,
    comAlerta: atual.filter((a) => a.alertas.length),
    fimDeSemana: atual.filter((a) => ehFimDeSemana(a.realizadoEm)),
    aprovacaoHoras: media(atual.map((a) => a.horasAprovacao)),
    meses,
    mensal: meses.map((mes) => {
      const ls = atual.filter((a) => mesDe(a.realizadoEm) === mes);
      const l = soma(ls, (a) => a.litros);
      const v = soma(ls, (a) => a.valorCombustivel);
      return { mes, litros: l, valor: v, preco: dividir(v, l), abastecimentos: ls.length };
    }),
    postos, economiaPotencial, alertas, condutores, veiculos,
    foraDoPadrao: veiculos.filter((x) => x.desvio != null && x.desvio < -0.15).sort((a, b) => (a.desvio ?? 0) - (b.desvio ?? 0)),
    porDia: NOMES_DIA.map((_, i) => atual.filter((a) => new Date(a.realizadoEm).getDay() === i).length)
  };
}

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoCombustivel(m: ModeloCombustivel): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const l: LeituraGerencial[] = [];
  if (m.foraDoPadrao.length) {
    const pior = m.foraDoPadrao[0];
    l.push({ id: 'consumo', tom: 'warning', icone: 'pi pi-gauge', titulo: 'Consumo fora do padrão', valor: inteiro(m.foraDoPadrao.length),
      texto: `${plural(m.foraDoPadrao.length, 'veículo roda', 'veículos rodam')} abaixo de 85% do km/l de referência. ${pior.placa} faz ${numero(pior.kmL, 2)} km/l contra ${numero(pior.referencia, 2)} (${pct(-(pior.desvio ?? 0), 0)} a menos). Verifique abastecimento, manutenção e uso.`,
      acao: { rotulo: 'Ver os veículos', alvo: alvo('kpi', 'consumo') } });
  }
  if (m.economiaPotencial >= 100) {
    const caro = [...m.postos].sort((a, b) => b.sobrepreco - a.sobrepreco)[0];
    l.push({ id: 'postos', tom: 'warning', icone: 'pi pi-map-marker', titulo: 'Dinheiro deixado no posto', valor: moeda(m.economiaPotencial),
      texto: `Se todo o combustível fosse comprado no preço do posto mais barato do recorte, a frota economizaria ${moeda(m.economiaPotencial)}.${caro && caro.sobrepreco > 0 ? ` ${caro.nome} cobrou ${moeda(caro.preco)}/l, ${moeda(caro.sobrepreco)} acima da média.` : ''}`,
      acao: { rotulo: 'Comparar postos', alvo: alvo('kpi', 'postos') } });
  }
  if (m.comAlerta.length) {
    const a = m.alertas[0];
    l.push({ id: 'alertas', tom: m.comAlerta.length / (m.atual.length || 1) > 0.1 ? 'warning' : 'info', icone: 'pi pi-exclamation-triangle',
      titulo: 'Abastecimentos com alerta', valor: `${inteiro(m.comAlerta.length)} (${pct(m.comAlerta.length / (m.atual.length || 1), 0)})`,
      texto: `${a ? `O mais comum é "${a.rotulo}" (${a.linhas.length}). ` : ''}Alertas pedem conferência: medição, volume acima do tanque, foto repetida, longe do posto.`,
      acao: a ? { rotulo: 'Ver os alertas', alvo: alvo('alerta', a.chave) } : undefined });
  }
  const varPreco = m.preco != null && m.precoAnterior ? m.preco / m.precoAnterior - 1 : null;
  if (varPreco != null && Math.abs(varPreco) >= 0.03) {
    l.push({ id: 'preco', tom: varPreco > 0 ? 'warning' : 'success', icone: 'pi pi-tag', titulo: varPreco > 0 ? 'Litro mais caro' : 'Litro mais barato',
      valor: `${varPreco > 0 ? '+' : '−'}${pct(Math.abs(varPreco))}`,
      texto: `De ${moeda(m.precoAnterior)} para ${moeda(m.preco)} por litro. Sobre os ${inteiro(m.litros)} litros do período, ${moeda(Math.abs((m.preco! - m.precoAnterior!) * m.litros))} de diferença.`,
      acao: { rotulo: 'Ver o preço por mês', alvo: alvo('kpi', 'preco') } });
  }
  if (m.fimDeSemana.length && m.fimDeSemana.length / (m.atual.length || 1) >= 0.08) {
    l.push({ id: 'fds', tom: 'info', icone: 'pi pi-calendar', titulo: 'Abastecimento no fim de semana', valor: inteiro(m.fimDeSemana.length),
      texto: `${pct(m.fimDeSemana.length / (m.atual.length || 1), 0)} dos abastecimentos foram em sábado ou domingo. Confira se havia plantão ou escala.`,
      acao: { rotulo: 'Ver os abastecimentos', alvo: alvo('kpi', 'fim-de-semana') } });
  }
  const condutor = [...m.condutores].sort((a, b) => b.alertas - a.alertas)[0];
  if (condutor && condutor.alertas >= 3) {
    l.push({ id: 'condutor', tom: 'warning', icone: 'pi pi-user', titulo: 'Condutor com mais alertas', valor: `${condutor.alertas} alertas`,
      texto: `${condutor.nome} teve ${condutor.alertas} abastecimentos com alerta de ${condutor.linhas.length}.`,
      acao: { rotulo: 'Analisar o condutor', alvo: alvo('condutor', condutor.chave) } });
  }
  if (m.aprovacaoHoras != null && m.aprovacaoHoras > 4) {
    l.push({ id: 'aprovacao', tom: 'info', icone: 'pi pi-hourglass', titulo: 'Aprovação demorada', valor: `${numero(m.aprovacaoHoras)} h`,
      texto: 'Tempo médio entre o pedido e a aprovação do abastecimento. Equipe esperando é produção perdida.' });
  }
  const varLitros = m.litrosAnterior ? m.litros / m.litrosAnterior - 1 : null;
  const tom: CesTone = m.foraDoPadrao.length > 2 || (m.comAlerta.length / (m.atual.length || 1)) > 0.15 ? 'warning' : l.some((x) => x.tom === 'warning') ? 'warning' : 'success';
  return {
    veredito: {
      tom, rotulo: tom === 'warning' ? 'Acompanhar' : 'Sob controle',
      titulo: tom === 'warning' ? 'Combustível pede atenção' : 'Combustível sob controle',
      texto: `${inteiro(m.litros)} litros (${varLitros != null ? `${varLitros >= 0 ? '+' : '−'}${pct(Math.abs(varLitros), 0)} sobre o anterior` : 'sem base anterior'}) por ${moeda(m.valor)}, `
        + `${moeda(m.preco)}/l${m.kmL != null ? `, ${numero(m.kmL, 2)} km/l` : ''}${m.custoKm != null ? ` e ${moeda(m.custoKm)} de combustível por km` : ''}.`
    },
    leituras: l,
    pergunta: 'Faça a leitura gerencial do combustível da frota neste recorte: consumo, preço, postos e alertas. Onde há desperdício ou risco de fraude e o que fazer?'
  };
}

// ── Análises ─────────────────────────────────────────────────────────────────────────────────────

const colAbastecimentos: CesDataTableColumn<AbastecimentoDetalheFrota>[] = [
  { key: 'realizadoEm', header: 'Data', type: 'date', priority: 1 },
  { key: 'placa', header: 'Veículo', priority: 1, value: (a) => a.placa ?? '—' },
  { key: 'posto', header: 'Posto', priority: 2 },
  { key: 'condutor', header: 'Condutor', priority: 3, value: (a) => a.condutor ?? '—' },
  { key: 'litros', header: 'Litros', type: 'number', priority: 2 },
  { key: 'precoLitro', header: 'R$/l', type: 'custom', priority: 2, value: (a) => a.precoLitro ?? 0, display: (a) => moeda(a.precoLitro) },
  { key: 'kmPorLitro', header: 'km/l', type: 'custom', priority: 3, value: (a) => a.kmPorLitro ?? -1, display: (a) => numero(a.kmPorLitro, 2) },
  { key: 'valorTotal', header: 'Valor', type: 'currency', priority: 1 },
  { key: 'alertas', header: 'Alertas', type: 'custom', priority: 2, value: (a) => a.alertas.length, display: (a) => a.alertas.map((t) => rotulo(ROTULO_ALERTA, t)).join(', ') || '—' }
];

function detalhar(a: AbastecimentoDetalheFrota): DetalheRegistro {
  return {
    titulo: `Abastecimento · ${a.placa ?? ''}`, subtitulo: `${new Date(a.realizadoEm).toLocaleString('pt-BR')} · ${a.posto}`,
    campos: [
      { rotulo: 'Litros de combustível', valor: numero(a.litros, 2) },
      { rotulo: 'Preço do litro', valor: moeda(a.precoLitro) },
      { rotulo: 'Valor total', valor: moeda(a.valorTotal), icone: 'pi pi-wallet' },
      { rotulo: 'Produtos', valor: a.produtos ?? '—' },
      { rotulo: 'Medição', valor: a.medicao != null ? inteiro(a.medicao) : '—' },
      { rotulo: 'Km desde o anterior', valor: a.kmDesdeAnterior != null ? inteiro(a.kmDesdeAnterior) : '—' },
      { rotulo: 'km/l', valor: numero(a.kmPorLitro, 2) },
      { rotulo: 'Condutor', valor: a.condutor ?? '—' }
    ],
    listas: a.alertas.length ? [{ rotulo: 'Alertas', itens: a.alertas.map((t) => rotulo(ROTULO_ALERTA, t)) }] : undefined,
    links: [linkAbastecimento(a.id), { rotulo: 'Relatório do abastecimento', icone: 'pi pi-file', rota: ['/frota/abastecimentos', a.id, 'relatorio'] }, linkVeiculo(a.idVeiculo)]
  };
}

function origem(chave: string, titulo: string, linhas: AbastecimentoDetalheFrota[]): OrigemAnalise<AbastecimentoDetalheFrota> {
  return {
    chave: `abast:${chave}`, titulo, rotuloAba: 'Abastecimentos', icone: 'pi pi-gauge', colunas: colAbastecimentos,
    carregar: () => of({ linhas, total: linhas.length }), chaveLinha: (a) => a.id, rotuloLinha: (a) => `${a.placa ?? ''} ${a.posto}`,
    conferencia: { quantidadeEsperada: linhas.length, valorEsperado: soma(linhas, (a) => a.valorTotal), somar: (a) => a.valorTotal, formato: 'moeda' },
    detalhar, nomeArquivo: `frota-abastecimentos-${chave}`, vazio: 'Nenhum abastecimento neste recorte.'
  };
}

function kpisDe(ls: AbastecimentoDetalheFrota[], m: ModeloCombustivel): KpiAnalise[] {
  const l = soma(ls, (a) => a.litros);
  const v = soma(ls, (a) => a.valorCombustivel);
  const p = dividir(v, l);
  return [
    { rotulo: 'Abastecimentos', valor: inteiro(ls.length) },
    { rotulo: 'Litros', valor: inteiro(l), detalhe: `${pct(dividir(l, m.litros))} do recorte` },
    { rotulo: 'Gasto', valor: moeda(v) },
    { rotulo: 'R$/litro', valor: moeda(p), detalhe: m.preco != null && p != null ? `Média do recorte: ${moeda(m.preco)}` : undefined,
      tom: p != null && m.preco != null && p > m.preco * 1.03 ? 'warning' : undefined }
  ];
}

function graficoMensal(m: ModeloCombustivel, ls: AbastecimentoDetalheFrota[]): GraficoAnalise {
  return grafico('mensal', 'Litros por mês', 'bar', m.meses.map(rotuloMes),
    [{ name: 'Litros', values: m.meses.map((mes) => soma(ls.filter((a) => mesDe(a.realizadoEm) === mes), (a) => a.litros)) }],
    { formato: 'number', aoSelecionar: (i) => navegar('mes', m.meses[i]), rotuloSelecao: 'Analisar o mês' });
}

function graficoVeiculos(ls: AbastecimentoDetalheFrota[]): GraficoAnalise {
  const g = agrupar(ls, (a) => a.idVeiculo, (a) => a.placa ?? '—', (x) => soma(x.linhas, (a) => a.litros)).slice(0, 12);
  return grafico('veic', 'Litros por veículo', 'bar-horizontal', g.map((x) => x.rotulo), [{ name: 'Litros', values: g.map((x) => soma(x.linhas, (a) => a.litros)) }],
    { formato: 'number', aoSelecionar: (i) => (g[i] ? navegar('veiculo', g[i].chave) : null), rotuloSelecao: 'Analisar o veículo' });
}

function graficoPostos(ls: AbastecimentoDetalheFrota[]): GraficoAnalise {
  const g = agrupar(ls, (a) => a.idPosto, (a) => a.posto, (x) => soma(x.linhas, (a) => a.valorCombustivel)).slice(0, 10);
  return grafico('postos', 'Gasto por posto', 'bar-horizontal', g.map((x) => x.rotulo), [{ name: 'Gasto', values: g.map((x) => soma(x.linhas, (a) => a.valorCombustivel)) }],
    { formato: 'currency', aoSelecionar: (i) => (g[i] ? navegar('posto', g[i].chave) : null), rotuloSelecao: 'Analisar o posto' });
}

function vistaDe(chave: string, eyebrow: string, titulo: string, ls: AbastecimentoDetalheFrota[], m: ModeloCombustivel, extra: Partial<VistaAnalise> = {}): VistaAnalise {
  return {
    chave, eyebrow, titulo, icone: 'pi pi-gauge', kpis: kpisDe(ls, m),
    graficos: [graficoMensal(m, ls), graficoVeiculos(ls), graficoPostos(ls)],
    origem: origem(chave, `Abastecimentos: ${titulo}`, ls), ...extra
  };
}

export function vistaCombustivel(a: { dimension: string; value: string }, m: ModeloCombustivel): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  const v = a.value;
  switch (a.dimension) {
    case 'kpi': return vistaKpi(v, m, chave);
    case 'mes': {
      const i = m.meses.indexOf(v);
      if (i < 0) return null;
      return vistaDe(chave, 'Mês', rotuloMes(v), m.atual.filter((x) => mesDe(x.realizadoEm) === v), m, {
        anterior: i > 0 ? { alvo: alvo('mes', m.meses[i - 1]), rotulo: rotuloMes(m.meses[i - 1]) } : undefined,
        proximo: i < m.meses.length - 1 ? { alvo: alvo('mes', m.meses[i + 1]), rotulo: rotuloMes(m.meses[i + 1]) } : undefined
      });
    }
    case 'posto': {
      const p = m.postos.find((x) => x.id === v);
      if (!p) return null;
      const i = m.postos.indexOf(p);
      const destaques: DestaqueAnalise[] = [];
      if (p.sobrepreco > 50) destaques.push({ icone: 'pi pi-tag', tom: 'warning', texto: `Pagou ${moeda(p.sobrepreco)} acima do preço médio do recorte.` });
      if (p.sobrepreco < -50) destaques.push({ icone: 'pi pi-thumbs-up', tom: 'success', texto: `Economizou ${moeda(-p.sobrepreco)} contra o preço médio do recorte.` });
      return vistaDe(chave, 'Posto', p.nome, p.linhas, m, { icone: 'pi pi-map-marker', destaques,
        anterior: i > 0 ? { alvo: alvo('posto', m.postos[i - 1].id), rotulo: m.postos[i - 1].nome } : undefined,
        proximo: i < m.postos.length - 1 ? { alvo: alvo('posto', m.postos[i + 1].id), rotulo: m.postos[i + 1].nome } : undefined,
        graficos: [grafico('preco', 'Preço do litro por mês', 'line', m.meses.map(rotuloMes), [
          { name: p.nome, values: m.meses.map((mes) => { const ls = p.linhas.filter((x) => mesDe(x.realizadoEm) === mes); return dividir(soma(ls, (x) => x.valorCombustivel), soma(ls, (x) => x.litros)); }) },
          { name: 'Média do recorte', values: m.mensal.map((x) => x.preco) }], { formato: 'currency', inteiro: true }),
          graficoVeiculos(p.linhas)] });
    }
    case 'alerta': {
      const g = m.alertas.find((x) => x.chave === v);
      return g ? vistaDe(chave, 'Alerta', g.rotulo, g.linhas, m, { icone: 'pi pi-exclamation-triangle' }) : null;
    }
    case 'condutor': {
      const c = m.condutores.find((x) => x.chave === v);
      if (!c) return null;
      return vistaDe(chave, 'Condutor', c.nome, c.linhas, m, { icone: 'pi pi-user',
        destaques: c.alertas ? [{ icone: 'pi pi-exclamation-triangle', tom: 'warning', texto: `${plural(c.alertas, 'abastecimento com alerta', 'abastecimentos com alerta')} de ${c.linhas.length}.` }] : undefined });
    }
    case 'dia': {
      const dia = Number(v);
      return vistaDe(chave, 'Dia da semana', NOMES_DIA[dia] ?? v, m.atual.filter((x) => new Date(x.realizadoEm).getDay() === dia), m);
    }
    case 'veiculo': return vistaVeiculo(v, m, chave);
    default: return null;
  }
}

function vistaKpi(qual: string, m: ModeloCombustivel, chave: string): VistaAnalise | null {
  switch (qual) {
    case 'litros':
    case 'gasto':
      return vistaDe(chave, qual === 'litros' ? 'Litros' : 'Gasto', 'Todos os abastecimentos do período', m.atual, m, {
        kpis: [
          { rotulo: 'Litros', valor: inteiro(m.litros), detalhe: textoVariacao(m.litros, m.litrosAnterior || null) },
          { rotulo: 'Gasto com combustível', valor: moeda(m.valor), detalhe: textoVariacao(m.valor, m.valorAnterior || null, 'moeda') },
          { rotulo: 'Gasto total (com ARLA e óleo)', valor: moeda(m.valorTotal) },
          { rotulo: 'Abastecimentos', valor: inteiro(m.atual.length), detalhe: textoVariacao(m.atual.length, m.anterior.length || null) }
        ]
      });
    case 'preco':
      return vistaDe(chave, 'Preço do litro', 'Como o preço se comportou', m.atual, m, {
        kpis: [
          { rotulo: 'Preço médio', valor: moeda(m.preco), detalhe: textoVariacao(m.preco, m.precoAnterior, 'moeda') },
          { rotulo: 'Mais caro', valor: moeda(Math.max(...m.atual.map((a) => a.precoLitro ?? 0))) },
          { rotulo: 'Mais barato', valor: moeda(Math.min(...m.atual.filter((a) => a.precoLitro).map((a) => a.precoLitro!))) }
        ],
        graficos: [grafico('preco', 'Preço médio do litro por mês', 'line', m.meses.map(rotuloMes), [{ name: 'R$/l', values: m.mensal.map((x) => x.preco) }],
          { formato: 'currency', inteiro: true, aoSelecionar: (i) => navegar('mes', m.meses[i]), rotuloSelecao: 'Analisar o mês' }), graficoPostos(m.atual)]
      });
    case 'postos': {
      const colunas: CesDataTableColumn<PostoCombustivel>[] = [
        { key: 'nome', header: 'Posto', priority: 1 },
        { key: 'abastecimentos', header: 'Abastecimentos', type: 'custom', priority: 2, value: (p) => p.linhas.length, display: (p) => inteiro(p.linhas.length) },
        { key: 'litros', header: 'Litros', type: 'number', priority: 2 },
        { key: 'preco', header: 'R$/l', type: 'custom', priority: 1, value: (p) => p.preco ?? 0, display: (p) => moeda(p.preco) },
        { key: 'sobrepreco', header: 'Contra a média', type: 'custom', priority: 1, value: (p) => p.sobrepreco,
          display: (p) => `${p.sobrepreco >= 0 ? '+' : '−'}${moeda(Math.abs(p.sobrepreco))}` }
      ];
      const porPreco = [...m.postos].filter((p) => p.preco != null).sort((a, b) => (b.preco ?? 0) - (a.preco ?? 0));
      return {
        chave, eyebrow: 'Postos', titulo: 'Quanto cada posto cobrou', icone: 'pi pi-map-marker',
        kpis: [
          { rotulo: 'Postos usados', valor: inteiro(m.postos.length) },
          { rotulo: 'Preço médio', valor: moeda(m.preco) },
          { rotulo: 'Economia possível', valor: moeda(m.economiaPotencial), detalhe: 'Comprando tudo no preço do mais barato', tom: m.economiaPotencial > 100 ? 'warning' : undefined }
        ],
        graficos: [grafico('preco', 'R$/litro por posto', 'bar-horizontal', porPreco.map((p) => p.nome), [{ name: 'R$/l', values: porPreco.map((p) => p.preco ?? 0) }],
          { formato: 'currency', aoSelecionar: (i) => (porPreco[i] ? navegar('posto', porPreco[i].id) : null), rotuloSelecao: 'Analisar o posto' })],
        tabelas: [{ id: 'postos', titulo: 'Postos', colunas, linhas: m.postos, chaveLinha: (p) => p.id, aoAtivar: (p) => navegar('posto', p.id), rotuloAcao: 'Analisar' }]
      };
    }
    case 'consumo': {
      const colunas: CesDataTableColumn<VeiculoCombustivel>[] = [
        { key: 'placa', header: 'Veículo', priority: 1 },
        { key: 'kmL', header: 'km/l', type: 'custom', priority: 1, value: (x) => x.kmL ?? -1, display: (x) => numero(x.kmL, 2) },
        { key: 'referencia', header: 'Referência', type: 'custom', priority: 2, value: (x) => x.referencia ?? -1, display: (x) => numero(x.referencia, 2) },
        { key: 'desvio', header: 'Desvio', type: 'custom', priority: 1, value: (x) => x.desvio ?? 0, display: (x) => (x.desvio == null ? '—' : `${x.desvio >= 0 ? '+' : '−'}${pct(Math.abs(x.desvio), 0)}`) },
        { key: 'litros', header: 'Litros', type: 'number', priority: 2 }
      ];
      const comRef = m.veiculos.filter((x) => x.desvio != null).sort((a, b) => (a.desvio ?? 0) - (b.desvio ?? 0));
      const desperdicio = soma(m.foraDoPadrao, (x) => (x.referencia && x.kmL ? x.litros - (x.litros * x.kmL) / x.referencia : 0));
      return {
        chave, eyebrow: 'Consumo', titulo: 'km/l de cada veículo contra a referência da ficha', icone: 'pi pi-gauge',
        descricao: 'km pelo odômetro ÷ litros de combustível. Fora do padrão: abaixo de 85% da referência.',
        kpis: [
          { rotulo: 'Consumo médio', valor: m.kmL != null ? `${numero(m.kmL, 2)} km/l` : '—', detalhe: textoVariacao(m.kmL, m.kmLAnterior) },
          { rotulo: 'Fora do padrão', valor: inteiro(m.foraDoPadrao.length), tom: m.foraDoPadrao.length ? 'warning' : 'success' },
          { rotulo: 'Litros a mais', valor: inteiro(desperdicio), detalhe: m.preco != null ? `≈ ${moeda(desperdicio * m.preco)}` : undefined }
        ],
        graficos: [grafico('desvio', 'Desvio sobre a referência', 'bar-horizontal', comRef.map((x) => x.placa), [{ name: 'Desvio', values: comRef.map((x) => x.desvio ?? 0) }],
          { formato: 'percent', aoSelecionar: (i) => (comRef[i] ? navegar('veiculo', comRef[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' })],
        tabelas: [{ id: 'consumo', titulo: 'Consumo por veículo', colunas, linhas: comRef, chaveLinha: (x) => x.idVeiculo,
          aoAtivar: (x) => navegar('veiculo', x.idVeiculo), rotuloAcao: 'Analisar', vazio: 'Nenhum veículo com referência na ficha.' }]
      };
    }
    case 'alertas': {
      const g = m.alertas;
      return vistaDe(chave, 'Alertas', 'Abastecimentos com alerta', m.comAlerta, m, {
        icone: 'pi pi-exclamation-triangle',
        graficos: [grafico('tipos', 'Por tipo de alerta', 'bar-horizontal', g.map((x) => x.rotulo), [{ name: 'Abastecimentos', values: g.map((x) => x.linhas.length) }],
          { formato: 'integer', aoSelecionar: (i) => (g[i] ? navegar('alerta', g[i].chave) : null), rotuloSelecao: 'Ver os abastecimentos' }), graficoVeiculos(m.comAlerta)]
      });
    }
    case 'fim-de-semana':
      return vistaDe(chave, 'Fim de semana', 'Abastecimentos em sábado ou domingo', m.fimDeSemana, m, { icone: 'pi pi-calendar' });
    default: return null;
  }
}

function vistaVeiculo(id: string, m: ModeloCombustivel, chave: string): VistaAnalise | null {
  const x = m.veiculos.find((v) => v.idVeiculo === id);
  if (!x) return null;
  const i = m.veiculos.indexOf(x);
  const destaques: DestaqueAnalise[] = [];
  if (x.desvio != null && x.desvio < -0.15) destaques.push({ icone: 'pi pi-gauge', tom: 'warning', texto: `Consome ${pct(-x.desvio, 0)} mais do que a referência da ficha.` });
  if (x.alertas) destaques.push({ icone: 'pi pi-exclamation-triangle', tom: 'warning', texto: `${plural(x.alertas, 'abastecimento com alerta', 'abastecimentos com alerta')}.` });
  const ls = [...x.linhas].sort((a, b) => a.realizadoEm.localeCompare(b.realizadoEm));
  return {
    chave, eyebrow: 'Veículo', titulo: x.placa, descricao: [x.v.tipo, x.v.base].filter(Boolean).join(' · '), icone: 'pi pi-car',
    kpis: [
      { rotulo: 'Litros', valor: inteiro(x.litros), detalhe: `${plural(x.linhas.length, 'abastecimento', 'abastecimentos')}` },
      { rotulo: 'Gasto', valor: moeda(x.valor) },
      { rotulo: 'km/l', valor: numero(x.kmL, 2), detalhe: x.referencia ? `Referência: ${numero(x.referencia, 2)}` : 'Sem referência na ficha',
        tom: x.desvio != null && x.desvio < -0.15 ? 'warning' : undefined },
      { rotulo: 'Combustível por km', valor: moeda(x.custoKm) }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('veiculo', m.veiculos[i - 1].idVeiculo), rotulo: m.veiculos[i - 1].placa } : undefined,
    proximo: i < m.veiculos.length - 1 ? { alvo: alvo('veiculo', m.veiculos[i + 1].idVeiculo), rotulo: m.veiculos[i + 1].placa } : undefined,
    graficos: [
      grafico('kml', 'km/l a cada abastecimento', 'line', ls.map((a) => new Date(a.realizadoEm).toLocaleDateString('pt-BR')),
        [{ name: 'km/l', values: ls.map((a) => a.kmPorLitro) }, ...(x.referencia ? [{ name: 'Referência', values: ls.map(() => x.referencia) }] : [])],
        { formato: 'number', inteiro: true }),
      graficoPostos(x.linhas)
    ],
    origem: origem(`veiculo-${id}`, `Abastecimentos de ${x.placa}`, x.linhas),
    links: [linkVeiculo(id)],
    copiloto: { foco: { tipo: 'secao', id: `veiculo.${id}`, rotulo: x.placa },
      pergunta: `Analise o consumo de combustível do veículo ${x.placa} (${numero(x.kmL, 2)} km/l, referência ${numero(x.referencia, 2)}). Há sinal de problema mecânico, de uso ou de fraude?` }
  };
}
