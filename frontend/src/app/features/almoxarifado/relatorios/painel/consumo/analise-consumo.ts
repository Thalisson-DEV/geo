import { GeoDataTableColumn } from '@geo/ui';

import { MovimentacaoRelatorio, MovimentacoesRelatorioResponse } from '../../../../../core/models/almoxarifado-relatorios.models';
import { DestaqueAnalise, VistaAnalise, chaveDoAlvo } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  Grupo,
  SEM,
  agrupar,
  alvo,
  dividir,
  eixoDoPeriodo,
  grafico,
  graficoGrupos,
  inteiro,
  linkMovimentacoesMaterial,
  linkObra,
  mediana,
  natureza,
  navegar,
  numero,
  origemMovimentacoes,
  pareto,
  pct,
  plural,
  priorizar,
  qtd,
  soma,
  taxaRetornoDe,
  textoVariacao
} from '../almox-analise-comum';

/** Quantas vezes a mediana das equipes do mesmo processo para o material ser "fora da curva". */
export const FATOR_FORA_CURVA = 2;
/** Mínimo de equipes do mesmo processo consumindo o material para comparar. */
const MIN_PARES = 3;

export type ClasseAbc = 'A' | 'B' | 'C';

export interface ConsumoMaterial {
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  saidas: number;
  entregue: number;
  retornado: number;
  liquido: number;
  aplicado: number;
  taxaRetorno: number | null;
  equipes: number;
  classe: ClasseAbc;
  entregueAnterior: number;
  linhas: MovimentacaoRelatorio[];
}

export interface ConsumoEquipe {
  chave: string;
  rotulo: string;
  base: string | null;
  processo: string | null;
  saidas: number;
  retornos: number;
  materiais: number;
  taxaRetorno: number | null;
  /** Quantidade aplicada em nota sobre a entregue (só faz sentido no comercial). */
  aplicacao: number | null;
  /** Sucata retirada em campo e devolvida ao almoxarifado. */
  sucataRetirada: number;
  sucataDevolvida: number;
  foraDaCurva: number;
  saidasAnterior: number;
  linhas: MovimentacaoRelatorio[];
}

export interface ForaDaCurva {
  chave: string;
  idEquipe: string;
  equipe: string;
  processo: string | null;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  medianaPares: number;
  fator: number;
}

export interface ModeloConsumo {
  r: MovimentacoesRelatorioResponse;
  linhas: MovimentacaoRelatorio[];
  saidas: MovimentacaoRelatorio[];
  retornos: MovimentacaoRelatorio[];
  saidasAnterior: number;
  materiais: ConsumoMaterial[];
  equipes: ConsumoEquipe[];
  obras: Grupo<MovimentacaoRelatorio>[];
  processos: Grupo<MovimentacaoRelatorio>[];
  bases: Grupo<MovimentacaoRelatorio>[];
  foraDaCurva: ForaDaCurva[];
  abc: Record<ClasseAbc, ConsumoMaterial[]>;
  paretoEquipes: { itens: number; total: number; fracao: number };
  taxaRetorno: number | null;
  serie: { chave: string; rotulo: string; saidas: number; retornos: number }[];
  unidadeSerie: string;
}

const ehSaida = (m: MovimentacaoRelatorio) => natureza(m) === 'atendimento' && m.condicao === 'NOVO';
const ehRetorno = (m: MovimentacaoRelatorio) => natureza(m) === 'retorno';


export function modeloConsumo(r: MovimentacoesRelatorioResponse, aceita: (m: MovimentacaoRelatorio) => boolean): ModeloConsumo {
  const todas = r.movimentacoes.filter(aceita);
  const linhas = todas.filter((m) => !m.anterior);
  const anteriores = todas.filter((m) => m.anterior);
  const saidas = linhas.filter(ehSaida);
  const retornos = linhas.filter(ehRetorno);

  // Materiais e curva ABC (pela frequência de saída: o que mais sai é o que mais pesa no balcão).
  const entAnt = new Map<string, number>();
  for (const m of anteriores.filter(ehSaida)) entAnt.set(m.idMaterial, (entAnt.get(m.idMaterial) ?? 0) + m.quantidade);
  const porMaterial = agrupar(linhas.filter((m) => ehSaida(m) || ehRetorno(m) || natureza(m) === 'aplicacao'), (m) => m.idMaterial, (m) => m.codigo);
  const materiais: ConsumoMaterial[] = porMaterial.map((g) => {
    const l = g.linhas;
    const s = l.filter(ehSaida);
    const entregue = soma(s, (m) => m.quantidade);
    const retornado = soma(l.filter(ehRetorno), (m) => m.quantidade);
    return {
      idMaterial: g.chave, codigo: l[0].codigo, descricao: l[0].descricao, unidade: l[0].unidade, saidas: s.length, entregue, retornado,
      liquido: entregue - retornado, aplicado: soma(l.filter((m) => natureza(m) === 'aplicacao'), (m) => m.quantidade),
      taxaRetorno: entregue > 0 ? Math.min(1, retornado / entregue) : null, equipes: new Set(s.map((m) => m.idEquipe).filter(Boolean)).size,
      classe: 'C' as ClasseAbc, entregueAnterior: entAnt.get(g.chave) ?? 0, linhas: l
    };
  }).filter((x) => x.saidas > 0).sort((a, b) => b.saidas - a.saidas);
  const total = soma(materiais, (x) => x.saidas);
  let acc = 0;
  for (const x of materiais) {
    acc += x.saidas;
    x.classe = acc - x.saidas < total * 0.8 ? 'A' : acc - x.saidas < total * 0.95 ? 'B' : 'C';
  }
  const abc = { A: materiais.filter((x) => x.classe === 'A'), B: materiais.filter((x) => x.classe === 'B'), C: materiais.filter((x) => x.classe === 'C') };

  // Fora da curva: equipe que leva o material muito acima das equipes do mesmo processo.
  const porEqMat = new Map<string, { m: MovimentacaoRelatorio; q: number }>();
  for (const m of saidas) {
    if (!m.idEquipe) continue;
    const k = `${m.idEquipe}|${m.idMaterial}`;
    const x = porEqMat.get(k);
    if (x) x.q += m.quantidade;
    else porEqMat.set(k, { m, q: m.quantidade });
  }
  const foraDaCurva: ForaDaCurva[] = [];
  const grupos = new Map<string, { m: MovimentacaoRelatorio; q: number }[]>();
  for (const x of porEqMat.values()) {
    const k = `${x.m.idProcesso ?? SEM}|${x.m.idMaterial}`;
    const l = grupos.get(k);
    if (l) l.push(x);
    else grupos.set(k, [x]);
  }
  for (const l of grupos.values()) {
    if (l.length < MIN_PARES) continue;
    for (const x of l) {
      const med = mediana(l.filter((y) => y !== x).map((y) => y.q));
      if (med && x.q >= med * FATOR_FORA_CURVA) {
        foraDaCurva.push({ chave: `${x.m.idEquipe}|${x.m.idMaterial}`, idEquipe: x.m.idEquipe!, equipe: x.m.equipe ?? 'Equipe', processo: x.m.processo,
          idMaterial: x.m.idMaterial, codigo: x.m.codigo, descricao: x.m.descricao, unidade: x.m.unidade, quantidade: x.q, medianaPares: med, fator: x.q / med });
      }
    }
  }
  foraDaCurva.sort((a, b) => b.fator - a.fator);

  const saidasAntPorEquipe = new Map<string, number>();
  for (const m of anteriores.filter(ehSaida)) if (m.idEquipe) saidasAntPorEquipe.set(m.idEquipe, (saidasAntPorEquipe.get(m.idEquipe) ?? 0) + 1);
  const equipes: ConsumoEquipe[] = agrupar(linhas.filter((m) => m.idEquipe), (m) => m.idEquipe, (m) => m.equipe ?? 'Equipe')
    .map((g) => {
      const l = g.linhas;
      const s = l.filter(ehSaida);
      const entregue = soma(s.filter((m) => m.tipoDestino === 'CAMPO'), (m) => m.quantidade);
      const aplicado = soma(l.filter((m) => natureza(m) === 'aplicacao'), (m) => m.quantidade);
      return {
        chave: g.chave, rotulo: g.rotulo, base: l[0].base, processo: l[0].processo, saidas: s.length, retornos: l.filter(ehRetorno).length,
        materiais: new Set(s.map((m) => m.idMaterial)).size, taxaRetorno: taxaRetornoDe(l),
        aplicacao: entregue > 0 ? aplicado / entregue : null,
        sucataRetirada: soma(l.filter((m) => natureza(m) === 'retirada-campo' && m.condicao === 'SUCATA'), (m) => m.quantidade),
        sucataDevolvida: soma(l.filter((m) => natureza(m) === 'sucata-recebida'), (m) => m.quantidade),
        foraDaCurva: foraDaCurva.filter((f) => f.idEquipe === g.chave).length,
        saidasAnterior: saidasAntPorEquipe.get(g.chave) ?? 0, linhas: l
      };
    })
    .filter((e) => e.saidas > 0 || e.sucataRetirada > 0)
    .sort((a, b) => b.saidas - a.saidas);

  const eixo = eixoDoPeriodo(r.de, r.ate);
  const indice = new Map(eixo.chaves.map((c, i) => [c, i]));
  const serie = eixo.chaves.map((chave, i) => ({ chave, rotulo: eixo.rotulos[i], saidas: 0, retornos: 0 }));
  for (const m of saidas) { const i = indice.get(eixo.chaveDe(m.dataHora)); if (i !== undefined) serie[i].saidas++; }
  for (const m of retornos) { const i = indice.get(eixo.chaveDe(m.dataHora)); if (i !== undefined) serie[i].retornos++; }

  return {
    r, linhas, saidas, retornos, saidasAnterior: anteriores.filter(ehSaida).length, materiais, equipes,
    obras: agrupar(saidas.filter((m) => m.idObra), (m) => m.idObra, (m) => (m.obra ? `Obra ${m.obra}` : m.destino)),
    processos: agrupar(saidas, (m) => m.idProcesso, (m) => m.processo, undefined, 'Sem processo'),
    bases: agrupar(saidas, (m) => m.idBase, (m) => m.base, undefined, 'Sem base'),
    foraDaCurva, abc, paretoEquipes: pareto(equipes.map((e) => e.saidas)),
    taxaRetorno: taxaRetornoDe(linhas),
    serie, unidadeSerie: eixo.unidade
  };
}

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoConsumo(m: ModeloConsumo): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const l: LeituraGerencial[] = [];
  if (m.foraDaCurva.length) {
    const f = m.foraDaCurva[0];
    l.push({ id: 'fora-curva', tom: 'warning', icone: 'pi pi-exclamation-triangle', titulo: 'Consumo fora da curva', valor: plural(m.foraDaCurva.length, 'caso', 'casos'),
      texto: `${f.equipe} levou ${qtd(f.quantidade, f.unidade)} de ${f.codigo} (${f.descricao.toLowerCase()}), ${numero(f.fator, 1)}× a mediana das equipes do mesmo processo. Confira a aplicação antes da próxima entrega.`,
      acao: { rotulo: 'Ver os casos', alvo: alvo('kpi', 'fora-curva') } });
  }
  const naoAplica = m.equipes.filter((e) => e.aplicacao != null && e.saidas >= 10 && e.aplicacao < 0.6).sort((a, b) => (a.aplicacao ?? 1) - (b.aplicacao ?? 1));
  if (naoAplica.length) {
    const e = naoAplica[0];
    l.push({ id: 'aplicacao', tom: 'warning', icone: 'pi pi-file-check', titulo: 'Recebe e não aplica em nota', valor: `${e.rotulo} · ${pct(e.aplicacao, 0)}`,
      texto: `Só ${pct(e.aplicacao, 0)} do que a equipe recebeu foi aplicado em nota${naoAplica.length > 1 ? ` (mais ${plural(naoAplica.length - 1, 'equipe', 'equipes')} abaixo de 60%)` : ''}. O resto está no carro ou foi usado sem registro.`,
      acao: { rotulo: 'Ver a equipe', alvo: alvo('equipe', e.chave) } });
  }
  const sucata = m.equipes.filter((e) => e.sucataRetirada >= 5 && e.sucataDevolvida / e.sucataRetirada < 0.5).sort((a, b) => b.sucataRetirada - a.sucataRetirada);
  if (sucata.length) {
    const e = sucata[0];
    l.push({ id: 'sucata', tom: 'warning', icone: 'pi pi-trash', titulo: 'Sucata que não volta', valor: e.rotulo,
      texto: `Retirou ${inteiro(e.sucataRetirada)} itens de sucata em campo e devolveu ${inteiro(e.sucataDevolvida)} ao almoxarifado. A concessionária cobra a sucata do que foi trocado.`,
      acao: { rotulo: 'Ver a equipe', alvo: alvo('equipe', e.chave) } });
  }
  const devolve = m.equipes.filter((e) => e.saidas >= 8 && e.taxaRetorno != null && m.taxaRetorno != null && e.taxaRetorno >= Math.max(0.3, m.taxaRetorno * 2))
    .sort((a, b) => (b.taxaRetorno ?? 0) - (a.taxaRetorno ?? 0));
  if (devolve.length) {
    const e = devolve[0];
    l.push({ id: 'devolve', tom: 'info', icone: 'pi pi-undo', titulo: 'Pede mais do que usa', valor: `${e.rotulo} · ${pct(e.taxaRetorno, 0)}`,
      texto: `Devolve ${pct(e.taxaRetorno, 0)} do que leva, contra ${pct(m.taxaRetorno, 0)} na média. Ajuste o pedido padrão da equipe.`,
      acao: { rotulo: 'Ver a equipe', alvo: alvo('equipe', e.chave) } });
  }
  const altas = m.materiais.filter((x) => x.entregueAnterior > 0 && x.saidas >= 5 && x.entregue / x.entregueAnterior >= 1.5)
    .sort((a, b) => b.entregue / b.entregueAnterior - a.entregue / a.entregueAnterior);
  if (altas.length) {
    const x = altas[0];
    l.push({ id: 'alta', tom: 'info', icone: 'pi pi-arrow-up-right', titulo: 'Consumo que disparou', valor: x.codigo,
      texto: `${x.descricao}: ${textoVariacao(x.entregue, x.entregueAnterior)} (${qtd(x.entregue, x.unidade)}). Antecipe a compra para não faltar.`,
      acao: { rotulo: 'Ver o material', alvo: alvo('material', x.idMaterial) } });
  }
  if (m.abc.A.length && m.materiais.length >= 5) {
    l.push({ id: 'abc', tom: 'info', icone: 'pi pi-chart-pie', titulo: 'Curva ABC', valor: `${m.abc.A.length} de ${m.materiais.length}`,
      texto: 'Materiais classe A fazem 80% das saídas: nunca podem faltar e merecem contagem semanal.',
      acao: { rotulo: 'Ver a classe A', alvo: alvo('abc', 'A') } });
  }
  const graves = l.filter((x) => x.tom === 'danger').length;
  const atencao = l.filter((x) => x.tom === 'warning').length;
  return {
    veredito: {
      tom: graves ? 'danger' : atencao ? 'warning' : 'success',
      rotulo: graves ? 'Agir agora' : atencao ? 'Acompanhar' : 'Sob controle',
      titulo: m.saidas.length ? `${plural(m.saidas.length, 'saída', 'saídas')} de material para ${plural(m.equipes.filter((e) => e.saidas).length, 'equipe', 'equipes')}` : 'Nenhuma saída no recorte',
      texto: m.saidas.length
        ? `${plural(m.materiais.length, 'material diferente', 'materiais diferentes')}; ${textoVariacao(m.saidas.length, m.saidasAnterior || null)}. ${m.paretoEquipes.itens} de ${m.paretoEquipes.total} equipes levam 80% do material; ${pct(m.taxaRetorno, 0)} volta ao almoxarifado.`
        : 'Amplie o período ou retire filtros.'
    },
    leituras: priorizar(l),
    pergunta: 'Faça a leitura gerencial do consumo de materiais: quem consome fora da curva, quem não aplica em nota, a sucata que não volta e o que muda no planejamento de compras.'
  };
}

// ── Tabelas ──────────────────────────────────────────────────────────────────────────────────────

export const colMateriaisConsumo: GeoDataTableColumn<ConsumoMaterial>[] = [
  { key: 'classe', header: 'ABC', priority: 2 },
  { key: 'codigo', header: 'Código', priority: 1 },
  { key: 'descricao', header: 'Material', priority: 1 },
  { key: 'saidas', header: 'Saídas', type: 'integer', priority: 1 },
  { key: 'entregue', header: 'Entregue', type: 'custom', priority: 1, value: (x) => x.entregue, display: (x) => qtd(x.entregue, x.unidade) },
  { key: 'retornado', header: 'Voltou', type: 'custom', priority: 2, value: (x) => x.retornado, display: (x) => qtd(x.retornado, x.unidade) },
  { key: 'liquido', header: 'Consumo líquido', type: 'custom', priority: 1, value: (x) => x.liquido, display: (x) => qtd(x.liquido, x.unidade) },
  { key: 'aplicado', header: 'Aplicado em nota', type: 'custom', priority: 3, value: (x) => x.aplicado, display: (x) => (x.aplicado ? qtd(x.aplicado, x.unidade) : '—') },
  { key: 'equipes', header: 'Equipes', type: 'integer', priority: 3 },
  { key: 'variacao', header: 'Sobre o anterior', type: 'custom', priority: 3, value: (x) => (x.entregueAnterior ? x.entregue / x.entregueAnterior : -1),
    display: (x) => (x.entregueAnterior ? textoVariacao(x.entregue, x.entregueAnterior, '') : 'Novo') }
];

export const colEquipesConsumo: GeoDataTableColumn<ConsumoEquipe>[] = [
  { key: 'rotulo', header: 'Equipe', priority: 1 },
  { key: 'processo', header: 'Processo', priority: 3, value: (e) => e.processo ?? '—' },
  { key: 'base', header: 'Base', priority: 3, value: (e) => e.base ?? '—' },
  { key: 'saidas', header: 'Saídas', type: 'integer', priority: 1 },
  { key: 'materiais', header: 'Materiais', type: 'integer', priority: 2 },
  { key: 'taxaRetorno', header: '% devolvido', type: 'custom', priority: 2, value: (e) => e.taxaRetorno ?? -1, display: (e) => pct(e.taxaRetorno, 0) },
  { key: 'aplicacao', header: 'Aplicado em nota', type: 'custom', priority: 2, value: (e) => e.aplicacao ?? -1, display: (e) => pct(e.aplicacao, 0) },
  { key: 'sucata', header: 'Sucata retirada / devolvida', type: 'custom', priority: 3, value: (e) => e.sucataRetirada - e.sucataDevolvida,
    display: (e) => (e.sucataRetirada || e.sucataDevolvida ? `${inteiro(e.sucataRetirada)} / ${inteiro(e.sucataDevolvida)}` : '—') },
  { key: 'foraDaCurva', header: 'Fora da curva', type: 'integer', priority: 1 }
];

export const colForaDaCurva: GeoDataTableColumn<ForaDaCurva>[] = [
  { key: 'equipe', header: 'Equipe', priority: 1 },
  { key: 'material', header: 'Material', priority: 1, value: (f) => `${f.codigo} · ${f.descricao}` },
  { key: 'quantidade', header: 'Levou', type: 'custom', priority: 1, value: (f) => f.quantidade, display: (f) => qtd(f.quantidade, f.unidade) },
  { key: 'medianaPares', header: 'Mediana das outras', type: 'custom', priority: 2, value: (f) => f.medianaPares, display: (f) => qtd(f.medianaPares, f.unidade) },
  { key: 'fator', header: 'Vezes', type: 'custom', priority: 1, value: (f) => f.fator, display: (f) => `${numero(f.fator, 1)}×` },
  { key: 'processo', header: 'Processo', priority: 3, value: (f) => f.processo ?? '—' }
];

// ── Análise detalhada ────────────────────────────────────────────────────────────────────────────

export function vistaConsumo(a: { dimension: string; value: string }, m: ModeloConsumo): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  switch (a.dimension) {
    case 'material': return vistaMaterial(a.value, m, chave);
    case 'equipe': return vistaEquipe(a.value, m, chave);
    case 'abc': {
      const l = m.abc[a.value as ClasseAbc];
      if (!l) return null;
      return {
        chave, eyebrow: 'Curva ABC', titulo: `Classe ${a.value}`, icone: 'pi pi-chart-pie',
        descricao: a.value === 'A' ? 'Os materiais que fazem 80% das saídas.' : a.value === 'B' ? 'Os 15% seguintes.' : 'A cauda: 5% das saídas.',
        kpis: [{ rotulo: 'Materiais', valor: inteiro(l.length) }, { rotulo: 'Saídas', valor: inteiro(soma(l, (x) => x.saidas)), detalhe: pct(dividir(soma(l, (x) => x.saidas), m.saidas.length), 0) + ' do total' }],
        graficos: [graficoGrupos('mat', 'Saídas por material', l.map((x) => ({ chave: x.idMaterial, rotulo: `${x.codigo} · ${x.descricao}`, linhas: x.linhas.filter(ehSaida) })),
          'Saídas', (g) => g.linhas.length, 'material', {}, 25)],
        tabelas: [{ id: 'abc', titulo: `Classe ${a.value}`, colunas: colMateriaisConsumo, linhas: l, chaveLinha: (x) => x.idMaterial,
          aoAtivar: (x) => navegar('material', x.idMaterial), rotuloAcao: 'Analisar', nomeArquivo: `consumo-classe-${a.value}` }]
      };
    }
    case 'obra':
    case 'processo':
    case 'base': {
      const gs = a.dimension === 'obra' ? m.obras : a.dimension === 'processo' ? m.processos : m.bases;
      const g = gs.find((x) => x.chave === a.value);
      if (!g) return null;
      const i = gs.indexOf(g);
      const mats = agrupar(g.linhas, (x) => x.idMaterial, (x) => `${x.codigo} · ${x.descricao}`);
      const eqs = agrupar(g.linhas.filter((x) => x.idEquipe), (x) => x.idEquipe, (x) => x.equipe);
      return {
        chave, eyebrow: a.dimension === 'obra' ? 'Obra' : a.dimension === 'processo' ? 'Processo' : 'Base', titulo: g.rotulo, icone: a.dimension === 'obra' ? 'pi pi-building' : 'pi pi-sitemap',
        kpis: [
          { rotulo: 'Saídas', valor: inteiro(g.linhas.length), detalhe: `${pct(dividir(g.linhas.length, m.saidas.length), 0)} do total` },
          { rotulo: 'Materiais', valor: inteiro(mats.length) },
          { rotulo: 'Equipes', valor: inteiro(eqs.length) }
        ],
        anterior: i > 0 ? { alvo: alvo(a.dimension, gs[i - 1].chave), rotulo: gs[i - 1].rotulo } : undefined,
        proximo: i < gs.length - 1 ? { alvo: alvo(a.dimension, gs[i + 1].chave), rotulo: gs[i + 1].rotulo } : undefined,
        graficos: [graficoGrupos('mat', 'Materiais', mats, 'Saídas', (x) => x.linhas.length, 'material'),
          ...(eqs.length ? [graficoGrupos('eq', 'Equipes', eqs, 'Saídas', (x) => x.linhas.length, 'equipe')] : [])],
        origem: origemMovimentacoes(`${a.dimension}-${a.value}`, `Saídas para ${g.rotulo}`, g.linhas),
        links: a.dimension === 'obra' ? [linkObra(a.value)] : undefined
      };
    }
    case 'periodo': {
      const i = m.serie.findIndex((x) => x.chave === a.value);
      if (i < 0) return null;
      const eixo = eixoDoPeriodo(m.r.de, m.r.ate);
      const l = m.saidas.filter((x) => eixo.chaveDe(x.dataHora) === a.value);
      return {
        chave, eyebrow: 'Período', titulo: m.serie[i].rotulo, icone: 'pi pi-calendar',
        kpis: [{ rotulo: 'Saídas', valor: inteiro(l.length) }, { rotulo: 'Retornos', valor: inteiro(m.serie[i].retornos) }],
        anterior: i > 0 ? { alvo: alvo('periodo', m.serie[i - 1].chave), rotulo: m.serie[i - 1].rotulo } : undefined,
        proximo: i < m.serie.length - 1 ? { alvo: alvo('periodo', m.serie[i + 1].chave), rotulo: m.serie[i + 1].rotulo } : undefined,
        graficos: [graficoGrupos('mat', 'Materiais', agrupar(l, (x) => x.idMaterial, (x) => `${x.codigo} · ${x.descricao}`), 'Saídas', (x) => x.linhas.length, 'material'),
          graficoGrupos('eq', 'Equipes', agrupar(l.filter((x) => x.idEquipe), (x) => x.idEquipe, (x) => x.equipe), 'Saídas', (x) => x.linhas.length, 'equipe')],
        origem: origemMovimentacoes(`periodo-${a.value}`, `Saídas de ${m.serie[i].rotulo}`, l)
      };
    }
    case 'kpi':
      if (a.value === 'fora-curva') {
        return {
          chave, eyebrow: 'Fora da curva', titulo: 'Equipes que levam muito mais que as outras', icone: 'pi pi-exclamation-triangle',
          descricao: `Quantidade de um material ${FATOR_FORA_CURVA}× ou mais a mediana das outras equipes do mesmo processo (ao menos ${MIN_PARES} equipes levando o material).`,
          kpis: [{ rotulo: 'Casos', valor: inteiro(m.foraDaCurva.length) }, { rotulo: 'Equipes', valor: inteiro(new Set(m.foraDaCurva.map((f) => f.idEquipe)).size) },
            { rotulo: 'Materiais', valor: inteiro(new Set(m.foraDaCurva.map((f) => f.idMaterial)).size) }],
          graficos: [graficoGrupos('eq', 'Casos por equipe', agrupar(m.foraDaCurva, (f) => f.idEquipe, (f) => f.equipe), 'Casos', (g) => g.linhas.length, 'equipe')],
          tabelas: [{ id: 'fora', titulo: 'Casos fora da curva', colunas: colForaDaCurva, linhas: m.foraDaCurva, chaveLinha: (f) => f.chave,
            aoAtivar: (f) => navegar('equipe', f.idEquipe), rotuloAcao: 'Analisar a equipe', nomeArquivo: 'consumo-fora-da-curva', vazio: 'Nenhum caso fora da curva.' }]
        };
      }
      if (a.value === 'saidas') {
        return {
          chave, eyebrow: 'Saídas', titulo: 'Material que saiu para equipes e obras', icone: 'pi pi-send',
          kpis: [{ rotulo: 'Saídas', valor: inteiro(m.saidas.length), detalhe: textoVariacao(m.saidas.length, m.saidasAnterior || null) },
            { rotulo: 'Materiais', valor: inteiro(m.materiais.length) }, { rotulo: 'Voltou', valor: pct(m.taxaRetorno, 0) }],
          graficos: [
            grafico('serie', `Saídas e retornos por ${m.unidadeSerie}`, 'bar', m.serie.map((x) => x.rotulo),
              [{ name: 'Saídas', values: m.serie.map((x) => x.saidas) }, { name: 'Retornos', values: m.serie.map((x) => x.retornos) }],
              { inteiro: true, aoSelecionar: (i) => (m.serie[i] ? navegar('periodo', m.serie[i].chave) : null), rotuloSelecao: 'Analisar o período' }),
            graficoGrupos('proc', 'Por processo', m.processos, 'Saídas', (g) => g.linhas.length, 'processo'),
            graficoGrupos('base', 'Por base', m.bases, 'Saídas', (g) => g.linhas.length, 'base')
          ],
          origem: origemMovimentacoes('saidas', 'Saídas do período', m.saidas)
        };
      }
      return null;
    default: return null;
  }
}

function vistaMaterial(id: string, m: ModeloConsumo, chave: string): VistaAnalise | null {
  const x = m.materiais.find((y) => y.idMaterial === id);
  if (!x) return null;
  const i = m.materiais.indexOf(x);
  const s = x.linhas.filter(ehSaida);
  const eqs = agrupar(s.filter((y) => y.idEquipe), (y) => y.idEquipe, (y) => y.equipe, (g) => soma(g.linhas, (y) => y.quantidade));
  const fora = m.foraDaCurva.filter((f) => f.idMaterial === id);
  const destaques: DestaqueAnalise[] = fora.map((f) => ({ icone: 'pi pi-exclamation-triangle', tom: 'warning' as const,
    texto: `${f.equipe} levou ${qtd(f.quantidade, f.unidade)}, ${numero(f.fator, 1)}× a mediana das outras equipes do processo.` }));
  if (x.taxaRetorno != null && x.taxaRetorno >= 0.3) destaques.push({ icone: 'pi pi-undo', tom: 'warning', texto: `${pct(x.taxaRetorno, 0)} do que saiu voltou.` });
  return {
    chave, eyebrow: `Material · classe ${x.classe}`, titulo: `${x.codigo} · ${x.descricao}`, icone: 'pi pi-box',
    kpis: [
      { rotulo: 'Entregue', valor: qtd(x.entregue, x.unidade), detalhe: textoVariacao(x.entregue, x.entregueAnterior || null) },
      { rotulo: 'Voltou', valor: qtd(x.retornado, x.unidade), detalhe: pct(x.taxaRetorno, 0) },
      { rotulo: 'Consumo líquido', valor: qtd(x.liquido, x.unidade) },
      { rotulo: 'Por equipe (mediana)', valor: qtd(mediana(eqs.map((g) => soma(g.linhas, (y) => y.quantidade))), x.unidade) }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('material', m.materiais[i - 1].idMaterial), rotulo: m.materiais[i - 1].codigo } : undefined,
    proximo: i < m.materiais.length - 1 ? { alvo: alvo('material', m.materiais[i + 1].idMaterial), rotulo: m.materiais[i + 1].codigo } : undefined,
    graficos: [graficoGrupos('eq', 'Quanto cada equipe levou', eqs, 'Quantidade', (g) => soma(g.linhas, (y) => y.quantidade), 'equipe', {}, 15),
      graficoGrupos('obra', 'Obras', agrupar(s.filter((y) => y.idObra), (y) => y.idObra, (y) => (y.obra ? `Obra ${y.obra}` : y.destino), (g) => soma(g.linhas, (y) => y.quantidade)),
        'Quantidade', (g) => soma(g.linhas, (y) => y.quantidade), 'obra')],
    origem: origemMovimentacoes(`consumo-material-${id}`, `Movimentações de ${x.codigo}`, x.linhas),
    links: [linkMovimentacoesMaterial(x.codigo)],
    copiloto: { foco: { tipo: 'secao', id: `consumo.${id}`, rotulo: x.codigo },
      pergunta: `Analise o consumo do material ${x.codigo} (${x.descricao}) por equipe e obra neste período. Há desperdício ou desvio?` }
  };
}

function vistaEquipe(id: string, m: ModeloConsumo, chave: string): VistaAnalise | null {
  const e = m.equipes.find((x) => x.chave === id);
  if (!e) return null;
  const i = m.equipes.indexOf(e);
  const s = e.linhas.filter(ehSaida);
  const mats = agrupar(s, (y) => y.idMaterial, (y) => `${y.codigo} · ${y.descricao}`);
  const fora = m.foraDaCurva.filter((f) => f.idEquipe === id);
  const destaques: DestaqueAnalise[] = [];
  if (fora.length) destaques.push({ icone: 'pi pi-exclamation-triangle', tom: 'warning', texto: `${plural(fora.length, 'material', 'materiais')} acima do dobro das equipes do mesmo processo: ${fora.slice(0, 3).map((f) => f.codigo).join(', ')}.` });
  if (e.aplicacao != null && e.aplicacao < 0.6) destaques.push({ icone: 'pi pi-file-check', tom: 'warning', texto: `Só ${pct(e.aplicacao, 0)} do recebido foi aplicado em nota.` });
  if (e.sucataRetirada >= 5 && e.sucataDevolvida < e.sucataRetirada * 0.5) destaques.push({ icone: 'pi pi-trash', tom: 'warning', texto: `Retirou ${inteiro(e.sucataRetirada)} itens de sucata e devolveu ${inteiro(e.sucataDevolvida)}.` });
  return {
    chave, eyebrow: 'Equipe', titulo: e.rotulo, descricao: [e.processo, e.base].filter(Boolean).join(' · '), icone: 'pi pi-users',
    kpis: [
      { rotulo: 'Saídas', valor: inteiro(e.saidas), detalhe: textoVariacao(e.saidas, e.saidasAnterior || null) },
      { rotulo: 'Devolvido', valor: pct(e.taxaRetorno, 0), detalhe: `Média: ${pct(m.taxaRetorno, 0)}` },
      { rotulo: 'Aplicado em nota', valor: pct(e.aplicacao, 0), tom: e.aplicacao != null && e.aplicacao < 0.6 ? 'warning' : undefined },
      { rotulo: 'Fora da curva', valor: inteiro(fora.length), tom: fora.length ? 'warning' : undefined }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('equipe', m.equipes[i - 1].chave), rotulo: m.equipes[i - 1].rotulo } : undefined,
    proximo: i < m.equipes.length - 1 ? { alvo: alvo('equipe', m.equipes[i + 1].chave), rotulo: m.equipes[i + 1].rotulo } : undefined,
    graficos: [graficoGrupos('mat', 'O que a equipe levou (saídas)', mats, 'Saídas', (g) => g.linhas.length, 'material', {}, 15)],
    tabelas: fora.length ? [{ id: 'fora', titulo: 'Fora da curva', colunas: colForaDaCurva, linhas: fora, chaveLinha: (f) => f.chave,
      aoAtivar: (f) => navegar('material', f.idMaterial), rotuloAcao: 'Analisar o material' }] : undefined,
    origem: origemMovimentacoes(`consumo-equipe-${id}`, `Movimentações de ${e.rotulo}`, e.linhas),
    copiloto: { foco: { tipo: 'secao', id: `consumo.equipe.${id}`, rotulo: e.rotulo },
      pergunta: `Analise o consumo de material da equipe ${e.rotulo} neste período comparado às outras do mesmo processo. O que cobrar?` }
  };
}
