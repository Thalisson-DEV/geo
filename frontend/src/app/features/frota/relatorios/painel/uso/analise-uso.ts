import { GeoDataTableColumn, GeoTone } from '@geo/ui';

import { DetalheUsoFrota, RelatorioGerencialFrota, VeiculoRelatorioFrota } from '../../../../../core/models/frota-relatorios.models';
import { DestaqueAnalise, KpiAnalise, TabelaAnalise, VistaAnalise, chaveDoAlvo } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { LIMITES_FROTA } from '../../frota-relatorios-gerenciais.visao';
import {
  ROTULO_REGIME,
  ROTULO_SITUACAO_VEICULO,
  agrupar,
  alvo,
  dividir,
  grafico,
  inteiro,
  linkVeiculo,
  mediana,
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

export type ClasseUso = 'OCIOSO' | 'SUBUTILIZADO' | 'NORMAL' | 'INTENSO';
export const ROTULO_CLASSE: Record<ClasseUso, string> = {
  OCIOSO: 'Ocioso', SUBUTILIZADO: 'Subutilizado', NORMAL: 'Uso normal', INTENSO: 'Uso intenso'
};

export const FAIXAS_KM = [
  { chave: 'zero', rotulo: 'Não rodou', aceita: (k: number) => k === 0 },
  { chave: 'ate500', rotulo: 'Até 500 km', aceita: (k: number) => k > 0 && k <= 500 },
  { chave: 'ate2000', rotulo: '501 a 2.000 km', aceita: (k: number) => k > 500 && k <= 2000 },
  { chave: 'ate5000', rotulo: '2.001 a 5.000 km', aceita: (k: number) => k > 2000 && k <= 5000 },
  { chave: 'acima5000', rotulo: 'Mais de 5.000 km', aceita: (k: number) => k > 5000 }
] as const;

export interface VeiculoUso extends VeiculoRelatorioFrota {
  classe: ClasseUso;
  /** km do veículo sobre a mediana do tipo. */
  sobreTipo: number | null;
  kmDiaUtil: number | null;
  faturadoKm: number | null;
}

export interface GrupoUso {
  id: string;
  nome: string;
  veiculos: VeiculoUso[];
  km: number;
  faturado: number;
  custo: number;
  custoSobreFaturamento: number | null;
  turnos: number;
  notas: number;
}

export interface ModeloUso {
  r: RelatorioGerencialFrota;
  filtrado: boolean;
  veiculos: VeiculoUso[];
  km: number;
  rodaram: number;
  faturado: number;
  custo: number;
  turnos: number;
  notas: number;
  custoSobreFaturamento: number | null;
  kmDiaUtil: number | null;
  faturadoKm: number | null;
  ociosos: VeiculoUso[];
  subutilizados: VeiculoUso[];
  intensos: VeiculoUso[];
  ligadoParado: number | null;
  foraExpediente: number | null;
  meses: string[];
  mensal: { mes: string; km: number; faturado: number; turnos: number; notas: number }[];
  porBase: GrupoUso[];
  porProcesso: GrupoUso[];
  faixas: { faixa: (typeof FAIXAS_KM)[number]; veiculos: VeiculoUso[] }[];
  kmMensal: DetalheUsoFrota['kmMensal'];
  producaoMensal: DetalheUsoFrota['producaoMensal'];
}

export function modeloUso(r: RelatorioGerencialFrota, d: DetalheUsoFrota, classes: string[]): ModeloUso {
  const diasUteis = r.periodo.diasUteis || 1;
  const medTipo = new Map<string, number | null>();
  for (const g of agrupar(r.veiculos.filter((v) => v.situacao !== 'BAIXADO' && v.km > 0), (v) => v.idTipo, (v) => v.tipo ?? '')) {
    medTipo.set(g.chave, mediana(g.linhas.map((v) => v.km)));
  }
  const todos: VeiculoUso[] = r.veiculos.map((v) => {
    const med = medTipo.get(v.idTipo ?? '—') ?? null;
    const sobreTipo = med ? v.km / med : null;
    const ocioso = r.uso.ociosos.some((o) => o.idVeiculo === v.idVeiculo);
    const classe: ClasseUso = ocioso ? 'OCIOSO' : sobreTipo != null && sobreTipo < 0.4 ? 'SUBUTILIZADO' : sobreTipo != null && sobreTipo > 1.8 ? 'INTENSO' : 'NORMAL';
    return { ...v, classe, sobreTipo, kmDiaUtil: v.km / diasUteis, faturadoKm: v.km > 0 && v.faturado > 0 ? v.faturado / v.km : null };
  }).sort((a, b) => b.km - a.km);
  const veiculos = classes.length ? todos.filter((v) => classes.includes(v.classe)) : todos;
  const ids = new Set(veiculos.map((v) => v.idVeiculo));
  const km = soma(veiculos, (v) => v.km);
  const faturado = soma(veiculos, (v) => v.faturado);
  const produtivos = veiculos.filter((v) => v.faturado > 0);
  const kmMensal = d.kmMensal.filter((x) => ids.has(x.idVeiculo));
  const producaoMensal = d.producaoMensal.filter((x) => ids.has(x.idVeiculo));
  const meses = mesesDoPeriodo(r);
  const emOperacao = veiculos.filter((v) => v.situacao !== 'BAIXADO').length;
  const comTel = veiculos.filter((v) => v.horasLigadoParado != null);

  const grupo = (id: (v: VeiculoUso) => string | null, nome: (v: VeiculoUso) => string): GrupoUso[] =>
    agrupar(veiculos, id, nome, (g) => soma(g.linhas, (v) => v.km)).map((g) => {
      const fat = soma(g.linhas, (v) => v.faturado);
      const custoProd = soma(g.linhas.filter((v) => v.faturado > 0), (v) => v.total);
      return { id: g.chave, nome: g.rotulo, veiculos: g.linhas, km: soma(g.linhas, (v) => v.km), faturado: fat, custo: soma(g.linhas, (v) => v.total),
        custoSobreFaturamento: fat > 0 ? custoProd / fat : null, turnos: soma(g.linhas, (v) => v.turnos), notas: soma(g.linhas, (v) => v.notas) };
    });

  return {
    r, filtrado: classes.length > 0, veiculos, km, rodaram: veiculos.filter((v) => v.km > 0).length, faturado,
    custo: soma(veiculos, (v) => v.total), turnos: soma(veiculos, (v) => v.turnos), notas: soma(veiculos, (v) => v.notas),
    custoSobreFaturamento: faturado > 0 ? soma(produtivos, (v) => v.total) / faturado : null,
    kmDiaUtil: emOperacao ? km / emOperacao / diasUteis : null,
    faturadoKm: dividir(faturado, soma(produtivos, (v) => v.km)),
    ociosos: veiculos.filter((v) => v.classe === 'OCIOSO'),
    subutilizados: veiculos.filter((v) => v.classe === 'SUBUTILIZADO').sort((a, b) => (a.sobreTipo ?? 0) - (b.sobreTipo ?? 0)),
    intensos: veiculos.filter((v) => v.classe === 'INTENSO'),
    ligadoParado: comTel.length ? soma(comTel, (v) => v.horasLigadoParado) : null,
    foraExpediente: comTel.length ? soma(comTel, (v) => v.kmForaExpediente) : null,
    meses,
    mensal: meses.map((mes) => {
      const p = producaoMensal.filter((x) => x.mes === mes);
      return { mes, km: soma(kmMensal.filter((x) => x.mes === mes), (x) => x.km), faturado: soma(p, (x) => x.faturado),
        turnos: soma(p, (x) => x.turnos), notas: soma(p, (x) => x.notas) };
    }),
    porBase: grupo((v) => v.idBase, (v) => v.base ?? 'Sem base'),
    porProcesso: grupo((v) => v.idProcesso, (v) => v.processo ?? 'Sem equipe vinculada'),
    faixas: FAIXAS_KM.map((faixa) => ({ faixa, veiculos: veiculos.filter((v) => v.situacao !== 'BAIXADO' && faixa.aceita(v.km)) })),
    kmMensal, producaoMensal
  };
}

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoUso(m: ModeloUso): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const l: LeituraGerencial[] = [];
  if (m.ociosos.length) {
    const locados = m.ociosos.filter((v) => v.regime === 'LOCADO');
    const custo = soma(m.ociosos, (v) => v.total);
    l.push({ id: 'ociosos', tom: 'warning', icone: 'pi pi-pause-circle', titulo: 'Veículos parados no pátio', valor: inteiro(m.ociosos.length),
      texto: `Sem km e sem turno no período, mas custaram ${moeda(custo)}.${locados.length ? ` ${plural(locados.length, 'é locado', 'são locados')}: candidatos a devolução.` : ' Candidatos a remanejamento ou venda.'}`,
      acao: { rotulo: 'Ver os ociosos', alvo: alvo('kpi', 'ociosos') } });
  }
  if (m.subutilizados.length) {
    l.push({ id: 'sub', tom: 'info', icone: 'pi pi-arrow-down', titulo: 'Rodam pouco para o tipo', valor: inteiro(m.subutilizados.length),
      texto: `${plural(m.subutilizados.length, 'veículo rodou', 'veículos rodaram')} menos de 40% da mediana do próprio tipo. Dá para juntar rotas ou reduzir a frota.`,
      acao: { rotulo: 'Ver os veículos', alvo: alvo('kpi', 'subutilizados') } });
  }
  if (m.custoSobreFaturamento != null) {
    const pior = [...m.porProcesso].filter((g) => g.custoSobreFaturamento != null).sort((a, b) => (b.custoSobreFaturamento ?? 0) - (a.custoSobreFaturamento ?? 0))[0];
    l.push({ id: 'csf', tom: m.custoSobreFaturamento > LIMITES_FROTA.custoSobreFaturamentoAtencao ? 'warning' : 'success', icone: 'pi pi-percentage',
      titulo: 'Custo da frota sobre o faturamento', valor: pct(m.custoSobreFaturamento),
      texto: `A cada R$ 100 faturados pelas equipes com veículo, R$ ${numero(m.custoSobreFaturamento * 100, 0)} vão para a frota.${pior && pior.custoSobreFaturamento! > m.custoSobreFaturamento * 1.2 ? ` ${pior.nome} é o mais pesado (${pct(pior.custoSobreFaturamento)}).` : ''}`,
      acao: { rotulo: 'Ver por processo', alvo: alvo('kpi', 'custo-faturamento') } });
  }
  if (m.ligadoParado != null && m.ligadoParado > 20) {
    const top = [...m.veiculos].sort((a, b) => (b.horasLigadoParado ?? 0) - (a.horasLigadoParado ?? 0))[0];
    l.push({ id: 'ligado', tom: 'warning', icone: 'pi pi-clock', titulo: 'Motor ligado parado', valor: `${numero(m.ligadoParado, 0)} h`,
      texto: `Combustível queimado sem produção.${top?.horasLigadoParado ? ` ${top.placa} soma ${numero(top.horasLigadoParado)} h.` : ''}`,
      acao: { rotulo: 'Ver a telemetria', alvo: alvo('kpi', 'telemetria') } });
  }
  if (m.foraExpediente != null && m.foraExpediente > 50) {
    l.push({ id: 'fora', tom: 'warning', icone: 'pi pi-moon', titulo: 'Rodagem fora do expediente', valor: `${inteiro(m.foraExpediente)} km`,
      texto: 'Km rodados fora do horário de trabalho. Confira escala e uso pessoal.', acao: { rotulo: 'Ver a telemetria', alvo: alvo('kpi', 'telemetria') } });
  }
  const varKm = m.r.uso.km.anterior ? (m.r.uso.km.atual ?? 0) / m.r.uso.km.anterior - 1 : null;
  if (!m.filtrado && varKm != null && Math.abs(varKm) >= 0.15) {
    l.push({ id: 'km', tom: 'info', icone: varKm > 0 ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right', titulo: varKm > 0 ? 'A frota rodou mais' : 'A frota rodou menos',
      valor: `${varKm > 0 ? '+' : '−'}${pct(Math.abs(varKm), 0)}`, texto: 'Comparado ao período anterior. Confira se a produção acompanhou.', acao: { rotulo: 'Ver por mês', alvo: alvo('kpi', 'km') } });
  }
  const tom: GeoTone = m.ociosos.length > 2 || (m.custoSobreFaturamento ?? 0) > LIMITES_FROTA.custoSobreFaturamentoAtencao ? 'warning' : 'success';
  return {
    veredito: {
      tom, rotulo: tom === 'warning' ? 'Acompanhar' : 'Sob controle',
      titulo: m.ociosos.length > 2 ? 'Frota maior do que o uso' : tom === 'warning' ? 'Uso pede atenção' : 'Frota bem usada',
      texto: `${inteiro(m.km)} km rodados por ${plural(m.rodaram, 'veículo', 'veículos')}${m.kmDiaUtil != null ? ` (${numero(m.kmDiaUtil, 0)} km por veículo/dia útil)` : ''}, `
        + `${inteiro(m.turnos)} turnos e ${moeda(m.faturado)} faturados${m.custoSobreFaturamento != null ? `; a frota custa ${pct(m.custoSobreFaturamento)} disso` : ''}.`
    },
    leituras: l,
    pergunta: 'Faça a leitura gerencial do uso da frota neste recorte: a frota está do tamanho certo? Quais veículos remanejar, devolver ou vender?'
  };
}

// ── Análises ─────────────────────────────────────────────────────────────────────────────────────

const colVeiculos: GeoDataTableColumn<VeiculoUso>[] = [
  { key: 'placa', header: 'Veículo', priority: 1 },
  { key: 'tipo', header: 'Tipo', priority: 3, value: (v) => v.tipo ?? '' },
  { key: 'classe', header: 'Uso', priority: 2, value: (v) => ROTULO_CLASSE[v.classe] },
  { key: 'km', header: 'Km', type: 'integer', priority: 1 },
  { key: 'turnos', header: 'Turnos', type: 'integer', priority: 2 },
  { key: 'faturado', header: 'Faturado', type: 'currency', priority: 2 },
  { key: 'total', header: 'Custo', type: 'currency', priority: 1 }
];

function tabelaVeiculos(id: string, titulo: string, linhas: VeiculoUso[], vazio = 'Nenhum veículo.'): TabelaAnalise<VeiculoUso> {
  return { id, titulo, colunas: colVeiculos, linhas, chaveLinha: (v) => v.idVeiculo, aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', vazio, nomeArquivo: `frota-uso-${id}` };
}

function kpisVeiculos(vs: VeiculoUso[], m: ModeloUso): KpiAnalise[] {
  const fat = soma(vs, (v) => v.faturado);
  return [
    { rotulo: 'Veículos', valor: inteiro(vs.length) },
    { rotulo: 'Km', valor: inteiro(soma(vs, (v) => v.km)), detalhe: `${pct(dividir(soma(vs, (v) => v.km), m.km))} do recorte` },
    { rotulo: 'Faturado', valor: moeda(fat) },
    { rotulo: 'Custo da frota', valor: moeda(soma(vs, (v) => v.total)), detalhe: fat > 0 ? `${pct(soma(vs.filter((v) => v.faturado > 0), (v) => v.total) / fat)} do faturado` : undefined }
  ];
}

function graficoVeiculosKm(vs: VeiculoUso[]) {
  const top = vs.slice(0, 15);
  return grafico('km', 'Km por veículo', 'bar-horizontal', top.map((v) => v.placa), [{ name: 'Km', values: top.map((v) => v.km) }],
    { formato: 'integer', aoSelecionar: (i) => (top[i] ? navegar('veiculo', top[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' });
}

export function vistaUso(a: { dimension: string; value: string }, m: ModeloUso): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  const v = a.value;
  switch (a.dimension) {
    case 'kpi': return vistaKpi(v, m, chave);
    case 'mes': {
      const i = m.meses.indexOf(v);
      if (i < 0) return null;
      const x = m.mensal[i];
      const kmV = agrupar(m.kmMensal.filter((k) => k.mes === v), (k) => k.idVeiculo, (k) => m.veiculos.find((w) => w.idVeiculo === k.idVeiculo)?.placa ?? '—',
        (g) => soma(g.linhas, (k) => k.km)).slice(0, 15);
      return {
        chave, eyebrow: 'Mês', titulo: rotuloMes(v), icone: 'pi pi-calendar',
        kpis: [{ rotulo: 'Km', valor: inteiro(x.km) }, { rotulo: 'Turnos', valor: inteiro(x.turnos) }, { rotulo: 'Notas concluídas', valor: inteiro(x.notas) },
          { rotulo: 'Faturado', valor: moeda(x.faturado), detalhe: x.km ? `${moeda(x.faturado / x.km)} por km` : undefined }],
        anterior: i > 0 ? { alvo: alvo('mes', m.meses[i - 1]), rotulo: rotuloMes(m.meses[i - 1]) } : undefined,
        proximo: i < m.meses.length - 1 ? { alvo: alvo('mes', m.meses[i + 1]), rotulo: rotuloMes(m.meses[i + 1]) } : undefined,
        graficos: [grafico('km', 'Km por veículo no mês', 'bar-horizontal', kmV.map((g) => g.rotulo), [{ name: 'Km', values: kmV.map((g) => soma(g.linhas, (k) => k.km)) }],
          { formato: 'integer', aoSelecionar: (k) => (kmV[k] ? navegar('veiculo', kmV[k].chave) : null), rotuloSelecao: 'Analisar o veículo' })]
      };
    }
    case 'grupo': {
      const [dim, id] = v.split('~');
      const lista = dim === 'base' ? m.porBase : m.porProcesso;
      const g = lista.find((x) => x.id === id);
      if (!g) return null;
      const i = lista.indexOf(g);
      return {
        chave, eyebrow: dim === 'base' ? 'Base operacional' : 'Processo', titulo: g.nome, icone: 'pi pi-sitemap', kpis: kpisVeiculos(g.veiculos, m),
        anterior: i > 0 ? { alvo: alvo('grupo', `${dim}~${lista[i - 1].id}`), rotulo: lista[i - 1].nome } : undefined,
        proximo: i < lista.length - 1 ? { alvo: alvo('grupo', `${dim}~${lista[i + 1].id}`), rotulo: lista[i + 1].nome } : undefined,
        destaques: g.veiculos.filter((x) => x.classe === 'OCIOSO').length
          ? [{ icone: 'pi pi-pause-circle', tom: 'warning', texto: `${plural(g.veiculos.filter((x) => x.classe === 'OCIOSO').length, 'veículo ocioso', 'veículos ociosos')} aqui.` }] : undefined,
        graficos: [graficoVeiculosKm(g.veiculos)],
        tabelas: [tabelaVeiculos('grupo', 'Veículos', g.veiculos)]
      };
    }
    case 'faixa': {
      const f = m.faixas.find((x) => x.faixa.chave === v);
      return f ? { chave, eyebrow: 'Faixa de km', titulo: f.faixa.rotulo, icone: 'pi pi-map', kpis: kpisVeiculos(f.veiculos, m),
        graficos: [graficoVeiculosKm(f.veiculos)], tabelas: [tabelaVeiculos('faixa', 'Veículos', f.veiculos)] } : null;
    }
    case 'classe': {
      const vs = m.veiculos.filter((x) => x.classe === v);
      return { chave, eyebrow: 'Uso', titulo: ROTULO_CLASSE[v as ClasseUso] ?? v, icone: 'pi pi-map', kpis: kpisVeiculos(vs, m),
        graficos: [graficoVeiculosKm(vs)], tabelas: [tabelaVeiculos('classe', 'Veículos', vs)] };
    }
    case 'veiculo': return vistaVeiculo(v, m, chave);
    default: return null;
  }
}

function vistaKpi(qual: string, m: ModeloUso, chave: string): VistaAnalise | null {
  switch (qual) {
    case 'km':
      return {
        chave, eyebrow: 'Km rodado', titulo: 'Quanto e quem rodou', icone: 'pi pi-map',
        kpis: [
          { rotulo: 'Km', valor: inteiro(m.km), detalhe: m.filtrado ? undefined : textoVariacao(m.r.uso.km.atual, m.r.uso.km.anterior) },
          { rotulo: 'Rodaram', valor: `${m.rodaram} de ${m.veiculos.length}` },
          { rotulo: 'Por veículo/dia útil', valor: m.kmDiaUtil != null ? `${numero(m.kmDiaUtil, 0)} km` : '—' }
        ],
        graficos: [
          grafico('mensal', 'Km por mês', 'bar', m.meses.map(rotuloMes), [{ name: 'Km', values: m.mensal.map((x) => x.km) }],
            { formato: 'integer', aoSelecionar: (i) => navegar('mes', m.meses[i]), rotuloSelecao: 'Analisar o mês' }),
          graficoVeiculosKm(m.veiculos)
        ],
        tabelas: [tabelaVeiculos('km', 'Km por veículo', m.veiculos)]
      };
    case 'producao':
    case 'custo-faturamento': {
      const proc = m.porProcesso.filter((g) => g.custoSobreFaturamento != null);
      const colunas: GeoDataTableColumn<GrupoUso>[] = [
        { key: 'nome', header: 'Processo', priority: 1 },
        { key: 'turnos', header: 'Turnos', type: 'integer', priority: 2 },
        { key: 'faturado', header: 'Faturado', type: 'currency', priority: 1 },
        { key: 'custo', header: 'Custo da frota', type: 'currency', priority: 2 },
        { key: 'custoSobreFaturamento', header: 'Custo/faturamento', type: 'custom', priority: 1, value: (g) => g.custoSobreFaturamento ?? -1, display: (g) => pct(g.custoSobreFaturamento) }
      ];
      return {
        chave, eyebrow: 'Produção', titulo: 'Quanto a frota ajuda a faturar', icone: 'pi pi-briefcase',
        descricao: 'Turnos e notas vêm da execução, pelo veículo confirmado na abertura do turno.',
        kpis: [
          { rotulo: 'Faturado', valor: moeda(m.faturado), detalhe: m.filtrado ? undefined : textoVariacao(m.r.uso.faturado.atual, m.r.uso.faturado.anterior, 'moeda') },
          { rotulo: 'Turnos', valor: inteiro(m.turnos) },
          { rotulo: 'Notas concluídas', valor: inteiro(m.notas) },
          { rotulo: 'Custo/faturamento', valor: pct(m.custoSobreFaturamento), tom: (m.custoSobreFaturamento ?? 0) > LIMITES_FROTA.custoSobreFaturamentoAtencao ? 'warning' : undefined }
        ],
        graficos: [
          grafico('mensal', 'Faturado por mês', 'bar', m.meses.map(rotuloMes), [{ name: 'Faturado', values: m.mensal.map((x) => x.faturado) }],
            { formato: 'currency', aoSelecionar: (i) => navegar('mes', m.meses[i]), rotuloSelecao: 'Analisar o mês' }),
          grafico('proc', 'Custo/faturamento por processo', 'bar-horizontal', proc.map((g) => g.nome), [{ name: 'Custo/faturamento', values: proc.map((g) => g.custoSobreFaturamento ?? 0) }],
            { formato: 'percent', aoSelecionar: (i) => (proc[i] ? navegar('grupo', `processo~${proc[i].id}`) : null), rotuloSelecao: 'Analisar o processo' })
        ],
        tabelas: [{ id: 'proc', titulo: 'Por processo', colunas, linhas: m.porProcesso, chaveLinha: (g) => g.id, aoAtivar: (g) => navegar('grupo', `processo~${g.id}`), rotuloAcao: 'Analisar' }]
      };
    }
    case 'ociosos':
      return { chave, eyebrow: 'Ociosos', titulo: 'Sem km e sem turno no período', icone: 'pi pi-pause-circle', kpis: kpisVeiculos(m.ociosos, m),
        destaques: [{ icone: 'pi pi-lightbulb', tom: 'info', texto: 'Locado ocioso é dinheiro saindo todo mês: devolva. Próprio ocioso: remaneje para uma base que precisa ou venda.' }],
        graficos: [], tabelas: [tabelaVeiculos('ociosos', 'Veículos ociosos', m.ociosos, 'Nenhum veículo ocioso.')] };
    case 'subutilizados':
      return { chave, eyebrow: 'Subutilizados', titulo: 'Rodaram menos de 40% da mediana do tipo', icone: 'pi pi-arrow-down', kpis: kpisVeiculos(m.subutilizados, m),
        graficos: [graficoVeiculosKm(m.subutilizados)], tabelas: [tabelaVeiculos('sub', 'Veículos subutilizados', m.subutilizados, 'Nenhum veículo subutilizado.')] };
    case 'telemetria': {
      const tel = m.veiculos.filter((v) => v.horasLigadoParado != null).sort((a, b) => (b.horasLigadoParado ?? 0) - (a.horasLigadoParado ?? 0));
      const fora = [...tel].sort((a, b) => (b.kmForaExpediente ?? 0) - (a.kmForaExpediente ?? 0)).slice(0, 15);
      const colunas: GeoDataTableColumn<VeiculoUso>[] = [
        { key: 'placa', header: 'Veículo', priority: 1 },
        { key: 'horasLigadoParado', header: 'Motor ligado parado (h)', type: 'number', priority: 1 },
        { key: 'kmForaExpediente', header: 'Km fora do expediente', type: 'number', priority: 1 },
        { key: 'eventosConducao', header: 'Eventos de condução', type: 'custom', priority: 2, value: (v) => v.eventosConducao ?? 0, display: (v) => inteiro(v.eventosConducao) }
      ];
      return {
        chave, eyebrow: 'Telemetria', titulo: 'Motor ligado parado e rodagem fora do expediente', icone: 'pi pi-wifi',
        kpis: [
          { rotulo: 'Veículos com rastreador', valor: inteiro(tel.length) },
          { rotulo: 'Motor ligado parado', valor: m.ligadoParado != null ? `${numero(m.ligadoParado, 0)} h` : '—' },
          { rotulo: 'Fora do expediente', valor: m.foraExpediente != null ? `${inteiro(m.foraExpediente)} km` : '—' }
        ],
        graficos: [
          grafico('ligado', 'Horas de motor ligado parado', 'bar-horizontal', tel.slice(0, 15).map((v) => v.placa), [{ name: 'Horas', values: tel.slice(0, 15).map((v) => v.horasLigadoParado ?? 0) }],
            { formato: 'number', aoSelecionar: (i) => (tel[i] ? navegar('veiculo', tel[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' }),
          grafico('fora', 'Km fora do expediente', 'bar-horizontal', fora.map((v) => v.placa), [{ name: 'Km', values: fora.map((v) => v.kmForaExpediente ?? 0) }],
            { formato: 'number', aoSelecionar: (i) => (fora[i] ? navegar('veiculo', fora[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' })
        ],
        tabelas: [{ id: 'tel', titulo: 'Telemetria por veículo', colunas, linhas: tel, chaveLinha: (v) => v.idVeiculo, aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', vazio: 'Nenhum veículo com rastreador.' }],
        links: [{ rotulo: 'Abrir o mapa da frota', icone: 'pi pi-map', rota: '/frota/telemetria/mapa' }]
      };
    }
    default: return null;
  }
}

function vistaVeiculo(id: string, m: ModeloUso, chave: string): VistaAnalise | null {
  const v = m.veiculos.find((x) => x.idVeiculo === id);
  if (!v) return null;
  const i = m.veiculos.indexOf(v);
  const km = m.meses.map((mes) => soma(m.kmMensal.filter((k) => k.idVeiculo === id && k.mes === mes), (k) => k.km));
  const fat = m.meses.map((mes) => soma(m.producaoMensal.filter((k) => k.idVeiculo === id && k.mes === mes), (k) => k.faturado));
  const destaques: DestaqueAnalise[] = [];
  if (v.classe === 'OCIOSO') destaques.push({ icone: 'pi pi-pause-circle', tom: 'warning', texto: `Não rodou nem abriu turno no período e custou ${moeda(v.total)}.${v.regime === 'LOCADO' ? ' Por ser locado, avalie devolver.' : ''}` });
  if (v.classe === 'SUBUTILIZADO') destaques.push({ icone: 'pi pi-arrow-down', tom: 'info', texto: `Rodou ${pct(v.sobreTipo, 0)} da mediana dos ${v.tipo ?? 'veículos do mesmo tipo'}.` });
  if ((v.kmForaExpediente ?? 0) > 50) destaques.push({ icone: 'pi pi-moon', tom: 'warning', texto: `${inteiro(v.kmForaExpediente)} km fora do expediente.` });
  return {
    chave, eyebrow: 'Veículo', titulo: v.placa, icone: 'pi pi-car',
    descricao: [v.tipo, v.base, v.processo, rotulo(ROTULO_REGIME, v.regime, ''), rotulo(ROTULO_SITUACAO_VEICULO, v.situacao, '')].filter(Boolean).join(' · '),
    kpis: [
      { rotulo: 'Km', valor: inteiro(v.km), detalhe: v.kmAnterior ? textoVariacao(v.km, v.kmAnterior) : undefined },
      { rotulo: 'Uso', valor: ROTULO_CLASSE[v.classe], detalhe: v.sobreTipo != null ? `${numero(v.sobreTipo, 2)}× a mediana do tipo` : undefined },
      { rotulo: 'Turnos / notas', valor: `${inteiro(v.turnos)} / ${inteiro(v.notas)}` },
      { rotulo: 'Faturado', valor: moeda(v.faturado), detalhe: v.custoSobreFaturamento != null ? `Custo: ${pct(v.custoSobreFaturamento)} do faturado` : undefined }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('veiculo', m.veiculos[i - 1].idVeiculo), rotulo: m.veiculos[i - 1].placa } : undefined,
    proximo: i < m.veiculos.length - 1 ? { alvo: alvo('veiculo', m.veiculos[i + 1].idVeiculo), rotulo: m.veiculos[i + 1].placa } : undefined,
    graficos: [
      grafico('km', 'Km por mês', 'bar', m.meses.map(rotuloMes), [{ name: 'Km', values: km }], { formato: 'integer' }),
      grafico('fat', 'Faturado por mês', 'bar', m.meses.map(rotuloMes), [{ name: 'Faturado', values: fat }], { formato: 'currency' })
    ],
    links: [linkVeiculo(id), { ...linkVeiculo(id, 'telemetria'), rotulo: 'Uso do veículo (telemetria)', icone: 'pi pi-chart-line' }],
    copiloto: { foco: { tipo: 'secao', id: `veiculo.${id}`, rotulo: v.placa },
      pergunta: `O veículo ${v.placa} está bem aproveitado? Rodou ${inteiro(v.km)} km, ${inteiro(v.turnos)} turnos e ${moeda(v.faturado)} faturados no período. Manter, remanejar ou devolver?` }
  };
}
