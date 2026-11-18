import { GeoDataTableColumn } from '@geo/ui';
import { NotaDoRecorte } from '../../../../core/models/dashboard.models';
import { nomeMes } from '../../../../core/models/meta-fisica.models';
import { DashboardService } from '../../../../core/services/dashboard.service';
import {
  AlvoAnalise,
  DestaqueAnalise,
  GraficoAnalise,
  KpiAnalise,
  OrigemAnalise,
  TabelaAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { dataLocal, diaMes, percentual, tomDaMeta } from '../execucao-dashboards.utils';
import { linkListagemNotas, origemNotas, plural } from '../analise/analise-comum';
import {
  Apuracao,
  CelulaFisica,
  DiaFisico,
  EquipeFisica,
  FiltroCelula,
  GrupoFisico,
  MesHistorico,
  ModeloMetaFisica,
  SITUACAO_FISICA,
  diarioDe,
  equipesDe,
  historicoDe,
  inteiro,
  notas,
  ordenarPorAtencao,
  umaCasa
} from './meta-fisica-calculos';

/**
 * Visão gerencial e análises (drill-down) do painel da meta física. Cada número clicável abre uma
 * `VistaAnalise` com o que ele significa, os gráficos que o explicam e as notas que o compõem.
 */

export interface ContextoMetaFisica {
  readonly m: ModeloMetaFisica;
  readonly service: DashboardService;
}

const alvo = (dimension: string, value: string): AlvoAnalise => ({ dimension, value });
const navegar = (dimension: string, value: string) => ({ tipo: 'navegar' as const, alvo: alvo(dimension, value) });

function diaPorExtenso(iso: string): string {
  return dataLocal(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function alturaBarras(n: number): number {
  return Math.max(220, Math.min(n, 30) * 30 + 60);
}

/** Texto curto do atingimento de uma apuração, conforme o mês. */
export function leituraApuracao(a: Apuracao, m: ModeloMetaFisica): string {
  const base = `${inteiro(a.realizado)} de ${notas(a.meta)} (${percentual(a.pct)})`;
  if (m.estado === 'futuro') return `Meta de ${notas(a.meta)}; o mês ainda não começou.`;
  if (m.estado === 'encerrado') return `${base} no mês.`;
  const partes = [base];
  if (a.falta > 0 && a.necessarioPorDia != null) partes.push(`faltam ${notas(a.falta)}, ${umaCasa(a.necessarioPorDia)} por dia útil`);
  return partes.join(' · ');
}

// ------------------------------------------------------------------ visão gerencial

export interface VisaoMetaFisica {
  readonly veredito: VereditoGerencial;
  readonly leituras: LeituraGerencial[];
  readonly pergunta: string;
}

export function visaoMetaFisica(m: ModeloMetaFisica): VisaoMetaFisica {
  const g = m.geral;
  const d = m.d;
  const mes = nomeMes(d.competencia).toLowerCase();
  let veredito: VereditoGerencial;

  if (m.estado === 'futuro') {
    veredito = {
      tom: 'neutral',
      rotulo: 'Planejamento',
      titulo: `Meta de ${notas(g.meta)} para ${mes}`,
      texto: `São ${d.diasUteis} dias úteis: ${umaCasa(d.diasUteis ? g.meta / d.diasUteis : null)} notas por dia útil somando as bases do recorte.`
    };
  } else {
    const referencia = m.estado === 'andamento' && g.pctProjecao != null ? g.pctProjecao : (g.pct ?? 0);
    const tom = referencia >= 100 ? 'success' : referencia >= 90 ? 'warning' : 'danger';
    const titulo =
      m.estado === 'andamento'
        ? referencia >= 100 ? 'No ritmo para bater a meta física' : referencia >= 90 ? 'Meta física em risco' : 'Ritmo insuficiente para a meta física'
        : referencia >= 100 ? 'Meta física do mês batida' : referencia >= 90 ? 'Meta física quase batida' : 'Meta física do mês não atingida';
    const partes = [`As bases executaram ${inteiro(g.realizado)} de ${notas(g.meta)} (${percentual(g.pct)}).`];
    if (m.estado === 'andamento' && g.projecao != null) {
      partes.push(`No ritmo dos ${plural(d.diasUteisEncerrados, 'dia útil encerrado', 'dias úteis encerrados')} (${umaCasa(g.ritmo)} por dia), fecham em ${notas(g.projecao)}: ${percentual(g.pctProjecao)} da meta.`);
    }
    if (m.estado === 'andamento' && g.falta > 0 && g.necessarioPorDia != null) {
      partes.push(`Faltam ${notas(g.falta)} em ${plural(d.diasUteisRestantes, 'dia útil', 'dias úteis')}: ${umaCasa(g.necessarioPorDia)} por dia.`);
    }
    veredito = {
      tom,
      rotulo: tom === 'success' ? 'Dentro do plano' : tom === 'warning' ? 'Atenção' : 'Agir agora',
      titulo,
      texto: partes.join(' '),
      progresso: {
        valor: g.pct ?? 0,
        rotulo: `${percentual(g.pct)} da meta do mês`,
        ...(m.estado === 'andamento' && g.pctEsperado != null
          ? { marcador: g.pctEsperado, rotuloMarcador: `esperado até ontem: ${percentual(g.pctEsperado)}` }
          : {})
      }
    };
  }

  const leituras: LeituraGerencial[] = [];
  if (m.estado !== 'futuro') {
    const abaixo = m.celulas.filter((c) => c.situacao === 'ABAIXO' || c.situacao === 'NAO_ATINGIDA');
    leituras.push({
      id: 'abaixo',
      tom: abaixo.length ? 'warning' : 'success',
      icone: 'pi pi-flag',
      titulo: m.estado === 'encerrado' ? 'Base e serviço sem meta batida' : 'Base e serviço abaixo do ritmo',
      valor: `${abaixo.length} de ${m.celulas.length}`,
      texto: abaixo.length
        ? `${abaixo.slice(0, 3).map((c) => `${c.base} · ${c.servico}`).join(', ')}${abaixo.length > 3 ? ' e outras' : ''}.`
        : 'Todas as combinações de base e serviço estão no ritmo ou já bateram a meta.',
      acao: { rotulo: 'Ver quem e quanto falta', alvo: alvo('kpi', 'ritmo') }
    });

    const piorBase = ordenarPorAtencao(m.bases)[0];
    if (piorBase && m.bases.length > 1) {
      leituras.push({
        id: 'base',
        tom: SITUACAO_FISICA[piorBase.situacao].tom,
        icone: 'pi pi-building',
        titulo: 'Base que mais precisa de atenção',
        valor: piorBase.nome,
        texto: leituraApuracao(piorBase, m) + '.',
        acao: { rotulo: 'Analisar a base', alvo: alvo('base', piorBase.id) }
      });
    }

    const piorServico = ordenarPorAtencao(m.servicos)[0];
    if (piorServico && m.servicos.length > 1) {
      leituras.push({
        id: 'servico',
        tom: SITUACAO_FISICA[piorServico.situacao].tom,
        icone: 'pi pi-tag',
        titulo: 'Serviço mais atrasado',
        valor: piorServico.nome,
        texto: leituraApuracao(piorServico, m) + '.',
        acao: { rotulo: 'Analisar o serviço', alvo: alvo('servico', piorServico.id) }
      });
    }

    if (m.estado === 'andamento' && g.ritmo != null && g.necessarioPorDia != null && g.falta > 0) {
      const precisa = g.necessarioPorDia / (g.ritmo || 1);
      leituras.push({
        id: 'ritmo',
        tom: g.ritmo >= g.necessarioPorDia ? 'success' : precisa <= 1.15 ? 'warning' : 'danger',
        icone: 'pi pi-gauge',
        titulo: 'Ritmo necessário',
        valor: `${umaCasa(g.necessarioPorDia)} por dia`,
        texto:
          g.ritmo >= g.necessarioPorDia
            ? `O ritmo atual (${umaCasa(g.ritmo)} por dia útil) já cobre o que falta.`
            : `Hoje o ritmo é ${umaCasa(g.ritmo)} por dia útil: é preciso ${percentual((precisa - 1) * 100)} a mais até o fim do mês.`,
        acao: { rotulo: 'Ver a projeção', alvo: alvo('kpi', 'projecao') }
      });
    }

    const metaHoje = d.diasUteis ? g.meta / d.diasUteis : 0;
    const hojeUtil = d.calendario.find((c) => c.data === d.hoje)?.util;
    if (m.estado === 'andamento' && hojeUtil) {
      leituras.push({
        id: 'hoje',
        tom: g.notasHoje >= metaHoje ? 'success' : 'info',
        icone: 'pi pi-clock',
        titulo: 'Hoje até agora',
        valor: notas(g.notasHoje),
        texto: `A meta distribuída pede ${umaCasa(metaHoje)} notas por dia útil; para recuperar o atraso, ${umaCasa(g.necessarioPorDia)}.`,
        acao: { rotulo: 'Analisar o dia', alvo: alvo('dia', d.hoje) }
      });
    }
  }

  const anteriores = m.historico.filter((h) => h.competencia < d.competencia);
  const ultimo = anteriores[anteriores.length - 1];
  if (ultimo) {
    leituras.push({
      id: 'historico',
      tom: (ultimo.pct ?? 0) >= 100 ? 'success' : 'info',
      icone: 'pi pi-history',
      titulo: `Em ${nomeMes(ultimo.competencia).toLowerCase()}`,
      valor: percentual(ultimo.pct),
      texto: `${inteiro(ultimo.realizado)} de ${notas(ultimo.meta)} executadas no mês anterior com meta.`,
      acao: { rotulo: 'Comparar meses', alvo: alvo('mes', ultimo.competencia) }
    });
  }

  return {
    veredito,
    leituras,
    pergunta: `Leia a meta física de ${mes}: quais bases e serviços estão abaixo do ritmo, quantas notas por dia útil cada um precisa para fechar o mês e quais equipes podem puxar o resultado?`
  };
}

// ------------------------------------------------------------------ peças das análises

function kpisApuracao(a: Apuracao, m: ModeloMetaFisica): KpiAnalise[] {
  const kpis: KpiAnalise[] = [
    { rotulo: 'Meta do mês', valor: notas(a.meta), detalhe: `${umaCasa(m.d.diasUteis ? a.meta / m.d.diasUteis : null)} por dia útil`, icone: 'pi pi-bullseye' },
    { rotulo: 'Executadas', valor: notas(a.realizado), detalhe: `${percentual(a.pct)} da meta`, tom: tomDaMeta(a.pct), icone: 'pi pi-file-check' }
  ];
  if (m.estado === 'andamento') {
    kpis.push(
      { rotulo: 'Esperado até ontem', valor: notas(a.esperado), detalhe: a.saldo >= 0 ? `${inteiro(a.saldo)} acima` : `${inteiro(-a.saldo)} abaixo`, tom: a.saldo >= 0 ? 'success' : 'warning', icone: 'pi pi-calendar-clock' },
      { rotulo: 'Por dia útil até o fim', valor: umaCasa(a.necessarioPorDia), detalhe: `ritmo atual ${umaCasa(a.ritmo)}`, icone: 'pi pi-gauge' },
      { rotulo: 'Projeção', valor: notas(a.projecao), detalhe: `${percentual(a.pctProjecao)} da meta`, tom: tomDaMeta(a.pctProjecao), icone: 'pi pi-chart-line' }
    );
  } else if (m.estado === 'encerrado') {
    kpis.push({ rotulo: a.falta > 0 ? 'Faltaram' : 'Acima da meta', valor: notas(a.falta > 0 ? a.falta : a.realizado - a.meta), icone: 'pi pi-flag' });
  }
  return kpis;
}

function destaquesApuracao(a: Apuracao, m: ModeloMetaFisica): DestaqueAnalise[] {
  const s = SITUACAO_FISICA[a.situacao];
  const destaques: DestaqueAnalise[] = [{ texto: `${s.rotulo}: ${leituraApuracao(a, m)}.`, icone: s.icone, tom: s.tom }];
  if (m.estado === 'andamento' && a.ritmo != null && a.necessarioPorDia != null && a.falta > 0) {
    destaques.push(
      a.ritmo >= a.necessarioPorDia
        ? { texto: `O ritmo atual (${umaCasa(a.ritmo)} por dia útil) cobre o que falta.`, icone: 'pi pi-check', tom: 'success' }
        : { texto: `Precisa subir de ${umaCasa(a.ritmo)} para ${umaCasa(a.necessarioPorDia)} notas por dia útil.`, icone: 'pi pi-arrow-up', tom: 'warning' }
    );
  }
  return destaques;
}

const rotulosDias = (dias: readonly DiaFisico[]) => dias.map((x) => diaMes(x.data));

function graficoAcumulado(dias: readonly DiaFisico[], titulo = 'Executado × meta distribuída nos dias úteis'): GraficoAnalise {
  const temProjecao = dias.some((x) => x.projecaoAcumulada != null);
  return {
    id: 'acumulado',
    titulo,
    descricao: 'A meta sobe só nos dias úteis. A distância entre as linhas é o atraso (ou a folga) acumulado.',
    tipo: 'line',
    rotulos: rotulosDias(dias),
    series: [
      { name: 'Meta acumulada', values: dias.map((x) => Math.round(x.metaAcumulada * 10) / 10) },
      { name: 'Executado acumulado', values: dias.map((x) => x.realizadoAcumulado) },
      ...(temProjecao ? [{ name: 'Projeção', values: dias.map((x) => (x.projecaoAcumulada == null ? null : Math.round(x.projecaoAcumulada))) }] : [])
    ],
    formato: 'integer',
    inteiro: true,
    altura: 280,
    aoSelecionar: (i) => navegar('dia', dias[i].data),
    rotuloSelecao: 'Analisar dia'
  };
}

function graficoDiario(dias: readonly DiaFisico[]): GraficoAnalise {
  return {
    id: 'diario',
    titulo: 'Notas por dia',
    descricao: 'Executado em cada dia contra a meta do dia útil.',
    tipo: 'bar',
    rotulos: rotulosDias(dias),
    series: [
      { name: 'Executado', values: dias.map((x) => x.realizado) },
      { name: 'Meta do dia', values: dias.map((x) => Math.round(x.metaDia * 10) / 10) }
    ],
    formato: 'number',
    inteiro: true,
    altura: 240,
    aoSelecionar: (i) => navegar('dia', dias[i].data),
    rotuloSelecao: 'Analisar dia'
  };
}

function graficoGrupos(id: string, titulo: string, grupos: readonly (Apuracao & { nome: string })[], aoSelecionar: (i: number) => ReturnType<typeof navegar>, rotuloSelecao: string): GraficoAnalise {
  return {
    id,
    titulo,
    descricao: 'Executado, esperado até ontem e meta do mês.',
    tipo: 'bar-horizontal',
    rotulos: grupos.map((g) => g.nome),
    series: [
      { name: 'Executado', values: grupos.map((g) => g.realizado) },
      { name: 'Esperado até ontem', values: grupos.map((g) => Math.round(g.esperado)) },
      { name: 'Meta do mês', values: grupos.map((g) => g.meta) }
    ],
    formato: 'integer',
    altura: alturaBarras(grupos.length * 1.6),
    aoSelecionar,
    rotuloSelecao
  };
}

function graficoHistorico(historico: readonly MesHistorico[]): GraficoAnalise | null {
  if (historico.length < 2) return null;
  return {
    id: 'historico',
    titulo: 'Meses anteriores',
    descricao: 'Meta e executado em cada mês com meta cadastrada.',
    tipo: 'bar',
    rotulos: historico.map((h) => nomeMes(h.competencia)),
    series: [
      { name: 'Meta', values: historico.map((h) => h.meta) },
      { name: 'Executado', values: historico.map((h) => h.realizado) }
    ],
    formato: 'integer',
    altura: 240,
    aoSelecionar: (i) => navegar('mes', historico[i].competencia),
    rotuloSelecao: 'Analisar mês'
  };
}

const colunasCelulas = (m: ModeloMetaFisica): GeoDataTableColumn<CelulaFisica>[] => [
  { key: 'base', header: 'Base', priority: 1 },
  { key: 'servico', header: 'Serviço', priority: 1 },
  { key: 'situacao', header: 'Situação', priority: 1, value: (c) => SITUACAO_FISICA[c.situacao].rotulo },
  { key: 'meta', header: 'Meta', type: 'integer', priority: 2 },
  { key: 'realizado', header: 'Executado', type: 'integer', priority: 1 },
  { key: 'pct', header: '% da meta', priority: 2, value: (c) => c.pct, display: (c) => percentual(c.pct) },
  ...(m.estado === 'andamento'
    ? ([
        { key: 'esperado', header: 'Esperado até ontem', priority: 3, value: (c) => c.esperado, display: (c) => inteiro(c.esperado) },
        { key: 'saldo', header: 'Saldo', priority: 2, value: (c) => c.saldo, display: (c) => (c.saldo >= 0 ? '+' : '−') + inteiro(Math.abs(c.saldo)) },
        { key: 'necessarioPorDia', header: 'Por dia útil', priority: 2, value: (c) => c.necessarioPorDia, display: (c) => umaCasa(c.necessarioPorDia) },
        { key: 'projecao', header: 'Projeção', priority: 3, value: (c) => c.projecao, display: (c) => inteiro(c.projecao) }
      ] satisfies GeoDataTableColumn<CelulaFisica>[])
    : [{ key: 'falta', header: 'Faltam', type: 'integer', priority: 2 } satisfies GeoDataTableColumn<CelulaFisica>])
];

function tabelaCelulas(m: ModeloMetaFisica, celulas: readonly CelulaFisica[], titulo: string, descricao: string): TabelaAnalise<CelulaFisica> {
  return {
    id: 'celulas',
    titulo,
    descricao,
    icone: 'pi pi-table',
    colunas: colunasCelulas(m),
    linhas: celulas,
    chaveLinha: (c) => c.chave,
    rotuloLinha: (c) => `${c.base} · ${c.servico}`,
    aoAtivar: (c) => navegar('celula', c.chave),
    rotuloAcao: 'Analisar',
    nomeArquivo: `meta-fisica-${m.d.competencia}`
  };
}

function tabelaEquipes(m: ModeloMetaFisica, equipes: readonly EquipeFisica[], idsTipos: readonly string[]): TabelaAnalise<EquipeFisica> {
  const tipos = m.d.tipos.filter((t) => idsTipos.includes(t.id));
  return {
    id: 'equipes',
    titulo: 'Equipes',
    descricao: 'Notas que cada equipe executou no recorte, por serviço. Clique para ver as notas da equipe na listagem.',
    icone: 'pi pi-users',
    colunas: [
      { key: 'codigo', header: 'Equipe', priority: 1 },
      { key: 'base', header: 'Base', priority: 2 },
      { key: 'notas', header: 'Notas', type: 'integer', priority: 1 },
      ...tipos.map((t) => ({ key: `tipo-${t.id}`, header: t.descricao, type: 'integer' as const, priority: 2 as const, value: (e: EquipeFisica) => e.porTipo[t.id] ?? 0 })),
      { key: 'diasComNota', header: 'Dias com nota', type: 'integer', priority: 3 },
      { key: 'media', header: 'Por dia com nota', priority: 3, value: (e) => (e.diasComNota ? e.notas / e.diasComNota : null), display: (e) => umaCasa(e.diasComNota ? e.notas / e.diasComNota : null) }
    ],
    linhas: equipes,
    chaveLinha: (e) => e.id,
    rotuloLinha: (e) => `Equipe ${e.codigo}`,
    nomeArquivo: `meta-fisica-equipes-${m.d.competencia}`,
    vazio: 'Nenhuma equipe executou notas deste recorte no mês.'
  };
}

/** Notas que compõem a célula base × serviço (ou um serviço em várias bases). */
function origemDoServico(
  c: ContextoMetaFisica,
  idTipo: string,
  idsBases: readonly string[],
  esperado: number,
  periodo: { inicio: string; fim: string } = { inicio: c.m.d.inicio, fim: c.m.d.fim },
  extra?: { id: string; rotuloAba: string }
): OrigemAnalise<NotaDoRecorte> {
  const servico = c.m.servicos.find((s) => s.id === idTipo)?.nome ?? 'serviço';
  const origem = origemNotas({
    service: c.service,
    filtros: { ...periodo, idBaseOperacional: [...idsBases], idTipoServico: idTipo, apenasProdutivas: true },
    titulo: `Notas de ${servico.toLowerCase()} que contam para a meta`,
    descricao: 'Notas concluídas das equipes das bases do recorte, uma por nota. Notas só com serviços improdutivos (serviço não efetuado) ficam de fora. Clique numa nota para ver os serviços executados nela.',
    mostrarEquipe: true,
    nomeArquivo: `notas-${servico.toLowerCase().replace(/\s+/g, '-')}-${periodo.inicio}-a-${periodo.fim}`
  });
  return {
    ...origem,
    ...(extra ?? {}),
    conferencia: { quantidadeEsperada: esperado, valorEsperado: null, somar: (n: NotaDoRecorte) => n.valor ?? 0, formato: 'inteiro' }
  };
}

function origensPorServico(c: ContextoMetaFisica, celulas: readonly CelulaFisica[], contar: (idTipo: string) => number, periodo?: { inicio: string; fim: string }): OrigemAnalise[] {
  const porTipo = new Map<string, string[]>();
  for (const cel of celulas) porTipo.set(cel.idTipo, [...(porTipo.get(cel.idTipo) ?? []), cel.idBase]);
  return [...porTipo.entries()].map(([idTipo, bases]) => {
    const nome = c.m.servicos.find((s) => s.id === idTipo)?.nome ?? 'Serviço';
    return origemDoServico(c, idTipo, bases, contar(idTipo), periodo, { id: `notas-${idTipo}`, rotuloAba: `Notas · ${nome}` });
  });
}

const filtroDe = (celulas: readonly CelulaFisica[]): FiltroCelula => {
  const chaves = new Set(celulas.map((x) => x.chave));
  return (b, t) => chaves.has(`${b}|${t}`);
};

// ------------------------------------------------------------------ vistas

export function vistaMetaFisica(a: AlvoAnalise, c: ContextoMetaFisica): VistaAnalise | null {
  switch (a.dimension) {
    case 'kpi':
      return a.value === 'ritmo' ? vistaRitmo(a, c) : a.value === 'projecao' ? vistaProjecao(a, c) : vistaExecutado(a, c);
    case 'base':
      return vistaGrupo(a, c, c.m.bases.find((b) => b.id === a.value), 'base');
    case 'servico':
      return vistaGrupo(a, c, c.m.servicos.find((s) => s.id === a.value), 'servico');
    case 'celula':
      return vistaCelula(a, c);
    case 'dia':
      return vistaDia(a, c);
    case 'mes':
      return vistaMes(a, c);
    default:
      return null;
  }
}

function vistaExecutado(a: AlvoAnalise, c: ContextoMetaFisica): VistaAnalise {
  const { m } = c;
  const g = m.geral;
  const historico = graficoHistorico(m.historico);
  return {
    chave: chaveDoAlvo(a),
    eyebrow: `Meta física · ${nomeMes(m.d.competencia)}`,
    titulo: 'Notas executadas',
    descricao: 'Cada nota conta uma vez, pelo tipo de serviço informado no lançamento, para a base da equipe que a lançou. Notas só com serviços improdutivos (serviço não efetuado) não contam.',
    icone: 'pi pi-file-check',
    kpis: kpisApuracao(g, m),
    destaques: destaquesApuracao(g, m),
    graficos: [
      graficoAcumulado(m.diario),
      graficoGrupos('por-servico', 'Por serviço', m.servicos, (i) => navegar('servico', m.servicos[i].id), 'Analisar serviço'),
      graficoGrupos('por-base', 'Por base', m.bases, (i) => navegar('base', m.bases[i].id), 'Analisar base'),
      ...(historico ? [historico] : [])
    ],
    tabelas: [tabelaCelulas(m, ordenarPorAtencao(m.celulas), 'Base e serviço', 'Cada combinação com a sua meta. Clique para analisar.')],
    origensExtras: origensPorServico(c, m.celulas, (t) => m.servicos.find((s) => s.id === t)?.realizado ?? 0),
    copiloto: {
      foco: { tipo: 'metrica', id: 'executadas', rotulo: 'Notas executadas' },
      pergunta: `Foram ${inteiro(g.realizado)} notas de ${inteiro(g.meta)} da meta física. Quais bases e serviços puxam o resultado para baixo e o que muda se cada um mantiver o ritmo atual?`
    }
  };
}

function vistaRitmo(a: AlvoAnalise, c: ContextoMetaFisica): VistaAnalise {
  const { m } = c;
  const celulas = ordenarPorAtencao(m.celulas);
  const atrasadas = celulas.filter((x) => x.saldo < 0 && x.situacao !== 'ATINGIDA');
  const deficit = atrasadas.reduce((t, x) => t - x.saldo, 0);
  return {
    chave: chaveDoAlvo(a),
    eyebrow: `Meta física · ${nomeMes(m.d.competencia)}`,
    titulo: m.estado === 'encerrado' ? 'Onde a meta não fechou' : 'Quem está abaixo do ritmo',
    descricao: 'O ritmo compara o executado com a meta esperada até o último dia útil encerrado.',
    icone: 'pi pi-flag',
    kpis: [
      { rotulo: 'Abaixo do ritmo', valor: `${atrasadas.length} de ${celulas.length}`, detalhe: 'combinações base × serviço', tom: atrasadas.length ? 'warning' : 'success', icone: 'pi pi-exclamation-triangle' },
      { rotulo: 'Atraso somado', valor: notas(deficit), detalhe: 'frente ao esperado até ontem', icone: 'pi pi-arrow-down' },
      { rotulo: 'Por dia útil até o fim', valor: umaCasa(m.geral.necessarioPorDia), detalhe: `ritmo atual ${umaCasa(m.geral.ritmo)}`, icone: 'pi pi-gauge' }
    ],
    destaques: atrasadas.slice(0, 3).map((x) => ({
      texto: `${x.base} · ${x.servico}: ${inteiro(-x.saldo)} abaixo do esperado; precisa de ${umaCasa(x.necessarioPorDia)} por dia útil.`,
      icone: 'pi pi-exclamation-triangle',
      tom: 'warning' as const
    })),
    graficos: [
      {
        id: 'saldo',
        titulo: 'Saldo frente ao esperado até ontem',
        descricao: 'Negativo é atraso. Clique para analisar a base e o serviço.',
        tipo: 'bar-horizontal',
        rotulos: celulas.map((x) => `${x.base} · ${x.servico}`),
        series: [{ name: 'Saldo de notas', values: celulas.map((x) => Math.round(x.saldo)) }],
        formato: 'integer',
        inteiro: true,
        altura: alturaBarras(celulas.length),
        aoSelecionar: (i) => navegar('celula', celulas[i].chave),
        rotuloSelecao: 'Analisar'
      }
    ],
    tabelas: [tabelaCelulas(m, celulas, 'Base e serviço', 'Da mais atrasada para a mais adiantada.')],
    copiloto: {
      foco: { tipo: 'tabela', id: 'matriz', rotulo: 'Base e serviço' },
      pergunta: 'Quais combinações de base e serviço estão abaixo do ritmo da meta física e quantas notas por dia útil cada uma precisa para fechar o mês?'
    }
  };
}

function vistaProjecao(a: AlvoAnalise, c: ContextoMetaFisica): VistaAnalise {
  const { m } = c;
  const g = m.geral;
  const celulas = [...m.celulas].sort((x, y) => (x.pctProjecao ?? 0) - (y.pctProjecao ?? 0));
  return {
    chave: chaveDoAlvo(a),
    eyebrow: `Meta física · ${nomeMes(m.d.competencia)}`,
    titulo: 'Projeção do mês',
    descricao: 'Executado até ontem mais o ritmo dos dias úteis encerrados aplicado aos dias úteis que faltam (de hoje ao fim do mês).',
    icone: 'pi pi-chart-line',
    kpis: kpisApuracao(g, m),
    destaques: destaquesApuracao(g, m),
    graficos: [
      graficoAcumulado(m.diario),
      {
        id: 'projecao-celulas',
        titulo: 'Projeção por base e serviço',
        descricao: 'Em % da meta do mês.',
        tipo: 'bar-horizontal',
        rotulos: celulas.map((x) => `${x.base} · ${x.servico}`),
        series: [{ name: 'Projeção (% da meta)', values: celulas.map((x) => (x.pctProjecao == null ? null : Math.round(x.pctProjecao * 10) / 1000)) }],
        formato: 'percent',
        inteiro: true,
        altura: alturaBarras(celulas.length),
        aoSelecionar: (i) => navegar('celula', celulas[i].chave),
        rotuloSelecao: 'Analisar'
      }
    ],
    tabelas: [tabelaCelulas(m, celulas, 'Base e serviço', 'Da menor projeção para a maior.')],
    copiloto: {
      foco: { tipo: 'metrica', id: 'projecao', rotulo: 'Projeção do mês' },
      pergunta: 'A projeção da meta física fecha o mês? Onde está o maior risco e o que precisaria mudar no ritmo diário?'
    }
  };
}

function vistaGrupo(a: AlvoAnalise, c: ContextoMetaFisica, grupo: GrupoFisico | undefined, tipo: 'base' | 'servico'): VistaAnalise | null {
  if (!grupo) return null;
  const { m } = c;
  const filtro = filtroDe(grupo.celulas);
  const dias = diarioDe(m.d, grupo.meta, filtro, grupo.ritmo);
  const equipes = equipesDe(m.d, filtro);
  const historico = graficoHistorico(historicoDe(m.d, (b, t) => (tipo === 'base' ? b === grupo.id : t === grupo.id)));
  const lista = tipo === 'base' ? m.bases : m.servicos;
  const indice = lista.findIndex((x) => x.id === grupo.id);
  const vizinho = (i: number) => (lista[i] ? { alvo: alvo(tipo, lista[i].id), rotulo: lista[i].nome } : undefined);
  const idsTipos = [...new Set(grupo.celulas.map((x) => x.idTipo))];
  const porCelula = graficoGrupos(
    'por-celula',
    tipo === 'base' ? 'Por serviço' : 'Por base',
    grupo.celulas.map((x) => ({ ...x, nome: tipo === 'base' ? x.servico : x.base })),
    (i) => navegar('celula', grupo.celulas[i].chave),
    'Analisar'
  );
  return {
    chave: chaveDoAlvo(a),
    eyebrow: tipo === 'base' ? 'Base operacional' : 'Tipo de serviço',
    titulo: grupo.nome,
    descricao: `${nomeMes(m.d.competencia)} · ${tipo === 'base' ? grupo.celulas.map((x) => x.servico).join(', ') : plural(grupo.celulas.length, 'base', 'bases')}`,
    icone: tipo === 'base' ? 'pi pi-building' : 'pi pi-tag',
    anterior: vizinho(indice - 1),
    proximo: vizinho(indice + 1),
    kpis: kpisApuracao(grupo, m),
    destaques: destaquesApuracao(grupo, m),
    graficos: [graficoAcumulado(dias), porCelula, graficoDiario(dias), ...(historico ? [historico] : [])],
    tabelas: [tabelaEquipes(m, equipes, idsTipos)],
    origensExtras: origensPorServico(c, grupo.celulas, (t) => grupo.celulas.filter((x) => x.idTipo === t).reduce((s, x) => s + x.realizado, 0)),
    links: [{ rotulo: 'Ver as metas cadastradas', icone: 'pi pi-bullseye', rota: '/execucao/metas-fisicas', queryParams: { mes: m.d.competencia, ...(tipo === 'base' ? { base: grupo.id } : { servico: grupo.id }) } }],
    copiloto: {
      foco: { tipo: 'secao', id: tipo === 'base' ? 'bases' : 'servicos', rotulo: grupo.nome },
      pergunta: `Como está a meta física de ${grupo.nome} em ${nomeMes(m.d.competencia).toLowerCase()}? Quais equipes e serviços explicam o resultado e quantas notas por dia útil faltam?`
    }
  };
}

function vistaCelula(a: AlvoAnalise, c: ContextoMetaFisica): VistaAnalise | null {
  const { m } = c;
  const cel = m.celulas.find((x) => x.chave === a.value);
  if (!cel) return null;
  const filtro = filtroDe([cel]);
  const dias = diarioDe(m.d, cel.meta, filtro, cel.ritmo);
  const equipes = equipesDe(m.d, filtro);
  const historico = graficoHistorico(historicoDe(m.d, filtro));
  const indice = m.celulas.findIndex((x) => x.chave === cel.chave);
  const vizinho = (i: number) => (m.celulas[i] ? { alvo: alvo('celula', m.celulas[i].chave), rotulo: `${m.celulas[i].base} · ${m.celulas[i].servico}` } : undefined);
  return {
    chave: chaveDoAlvo(a),
    eyebrow: `${cel.base} · ${nomeMes(m.d.competencia)}`,
    titulo: cel.servico,
    descricao: 'Meta da base neste serviço, distribuída pelos dias úteis do mês.',
    icone: 'pi pi-tag',
    anterior: vizinho(indice - 1),
    proximo: vizinho(indice + 1),
    kpis: kpisApuracao(cel, m),
    destaques: destaquesApuracao(cel, m),
    graficos: [
      graficoAcumulado(dias),
      graficoDiario(dias),
      {
        id: 'equipes',
        titulo: 'Notas por equipe',
        tipo: 'bar-horizontal',
        rotulos: equipes.map((e) => e.codigo),
        series: [{ name: 'Notas', values: equipes.map((e) => e.notas) }],
        formato: 'integer',
        altura: alturaBarras(equipes.length)
      },
      ...(historico ? [historico] : [])
    ],
    tabelas: [tabelaEquipes(m, equipes, [cel.idTipo])],
    origem: origemDoServico(c, cel.idTipo, [cel.idBase], cel.realizado),
    links: equipes.length === 1 ? [linkListagemNotas({ idEquipe: equipes[0].id, inicio: m.d.inicio, fim: m.d.fim, tipo: cel.idTipo })] : undefined,
    copiloto: {
      foco: { tipo: 'tabela', id: 'matriz', rotulo: `${cel.base} · ${cel.servico}` },
      pergunta: `Como está a meta de ${cel.servico.toLowerCase()} em ${cel.base}? Quais equipes executam esse serviço e qual ritmo diário fecha o mês?`
    }
  };
}

function vistaDia(a: AlvoAnalise, c: ContextoMetaFisica): VistaAnalise | null {
  const { m } = c;
  const dia = m.diario.find((x) => x.data === a.value);
  if (!dia) return null;
  const doDia = m.d.producao.filter((p) => p.data === dia.data && m.celulas.some((x) => x.idBase === p.idBaseOperacional && x.idTipo === p.idTipoServico));
  const porCelula = m.celulas.map((x) => ({
    ...x,
    doDia: doDia.filter((p) => p.idBaseOperacional === x.idBase && p.idTipoServico === x.idTipo).reduce((t, p) => t + p.notas, 0),
    metaDoDia: dia.util && m.d.diasUteis ? x.meta / m.d.diasUteis : 0
  }));
  const indice = m.diario.findIndex((x) => x.data === dia.data);
  const vizinho = (i: number) => (m.diario[i] ? { alvo: alvo('dia', m.diario[i].data), rotulo: diaMes(m.diario[i].data) } : undefined);
  const futuro = dia.data > m.d.hoje;
  return {
    chave: chaveDoAlvo(a),
    eyebrow: `Meta física · ${nomeMes(m.d.competencia)}`,
    titulo: diaPorExtenso(dia.data),
    descricao: dia.util ? 'Dia útil: a meta do mês é distribuída igualmente pelos dias úteis.' : 'Fim de semana ou feriado: não tem meta, mas as notas executadas contam.',
    icone: 'pi pi-calendar',
    anterior: vizinho(indice - 1),
    proximo: vizinho(indice + 1),
    kpis: [
      { rotulo: 'Executadas no dia', valor: futuro ? '—' : notas(dia.realizado), icone: 'pi pi-file-check' },
      { rotulo: 'Meta do dia', valor: dia.util ? umaCasa(dia.metaDia) : 'Sem meta', icone: 'pi pi-bullseye' },
      { rotulo: 'Acumulado até o dia', valor: dia.realizadoAcumulado == null ? '—' : notas(dia.realizadoAcumulado), detalhe: `meta acumulada ${umaCasa(dia.metaAcumulada)}`, icone: 'pi pi-chart-line' }
    ],
    graficos: [
      {
        id: 'dia-celulas',
        titulo: 'Por base e serviço',
        tipo: 'bar-horizontal',
        rotulos: porCelula.map((x) => `${x.base} · ${x.servico}`),
        series: [
          { name: 'Executado no dia', values: porCelula.map((x) => x.doDia) },
          ...(dia.util ? [{ name: 'Meta do dia', values: porCelula.map((x) => Math.round(x.metaDoDia * 10) / 10) }] : [])
        ],
        formato: 'number',
        inteiro: true,
        altura: alturaBarras(porCelula.length * 1.4),
        aoSelecionar: (i) => navegar('celula', porCelula[i].chave),
        rotuloSelecao: 'Analisar'
      }
    ],
    origensExtras: futuro
      ? []
      : origensPorServico(c, m.celulas, (t) => porCelula.filter((x) => x.idTipo === t).reduce((s, x) => s + x.doDia, 0), { inicio: dia.data, fim: dia.data }),
    copiloto: {
      foco: { tipo: 'grafico', id: 'acumulado', rotulo: `Dia ${diaMes(dia.data)}` },
      pergunta: `Como foi a execução da meta física em ${diaMes(dia.data)} frente à meta do dia, por base e serviço?`
    }
  };
}

function vistaMes(a: AlvoAnalise, c: ContextoMetaFisica): VistaAnalise | null {
  const { m } = c;
  const mes = m.historico.find((h) => h.competencia === a.value);
  if (!mes) return null;
  const linhas = m.d.historico
    .filter((h) => h.competencia === mes.competencia && h.meta != null)
    .map((h) => ({
      chave: `${h.idBaseOperacional}|${h.idTipoServico}`,
      base: m.d.bases.find((b) => b.id === h.idBaseOperacional)?.nome ?? '—',
      servico: m.d.tipos.find((t) => t.id === h.idTipoServico)?.descricao ?? '—',
      meta: h.meta!,
      realizado: h.realizado,
      pct: h.meta ? (h.realizado / h.meta) * 100 : null
    }))
    .sort((x, y) => (x.pct ?? 0) - (y.pct ?? 0));
  type Linha = (typeof linhas)[number];
  const historico = graficoHistorico(m.historico);
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Meta física · comparação',
    titulo: nomeMes(mes.competencia),
    descricao: 'Meta e executado do mês por base e serviço.',
    icone: 'pi pi-history',
    kpis: [
      { rotulo: 'Meta do mês', valor: notas(mes.meta), icone: 'pi pi-bullseye' },
      { rotulo: 'Executadas', valor: notas(mes.realizado), detalhe: `${percentual(mes.pct)} da meta`, tom: tomDaMeta(mes.pct), icone: 'pi pi-file-check' },
      { rotulo: mes.realizado >= mes.meta ? 'Acima da meta' : 'Faltaram', valor: notas(Math.abs(mes.meta - mes.realizado)), icone: 'pi pi-flag' }
    ],
    graficos: historico ? [historico] : [],
    tabelas: [
      {
        id: 'mes-celulas',
        titulo: 'Base e serviço',
        icone: 'pi pi-table',
        colunas: [
          { key: 'base', header: 'Base', priority: 1 },
          { key: 'servico', header: 'Serviço', priority: 1 },
          { key: 'meta', header: 'Meta', type: 'integer', priority: 2 },
          { key: 'realizado', header: 'Executado', type: 'integer', priority: 1 },
          { key: 'pct', header: '% da meta', priority: 1, value: (l: Linha) => l.pct, display: (l: Linha) => percentual(l.pct) }
        ],
        linhas,
        chaveLinha: (l: Linha) => l.chave,
        nomeArquivo: `meta-fisica-${mes.competencia}`
      } satisfies TabelaAnalise<Linha>
    ],
    links:
      mes.competencia !== m.d.competencia
        ? [{ rotulo: `Abrir o painel de ${nomeMes(mes.competencia).toLowerCase()}`, icone: 'pi pi-external-link', rota: '/execucao/dashboard-meta-fisica', queryParams: { mes: mes.competencia } }]
        : undefined
  };
}
