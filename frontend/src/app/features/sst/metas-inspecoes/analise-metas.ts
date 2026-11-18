import { GeoDataTableColumn, GeoTone } from '@geo/ui';

import {
  AcompanhamentoMetaItem,
  AcompanhamentoMetasResponse,
  PERIODICIDADE_LABELS,
  STATUS_META_LABELS,
  StatusMeta,
  formatarDataBr
} from '../../../core/models/meta-inspecao.models';
import { SstService } from '../../../core/services/sst.service';
import {
  AlvoAnalise,
  DestaqueAnalise,
  GraficoAnalise,
  KpiAnalise,
  TabelaAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../shared/components/dashboard/dashboard-analise.models';
import { LinhaInspecao, alturaBarras, graficosDasInspecoes, graficosDosDesvios, nomeOu, origemDesvios, origemInspecoes, pct, plural } from '../dashboards/analise/analise-sst-comum';
import { IntervaloDrill, intervaloDoPonto } from '../dashboards/drill/inspecoes-drill.utils';

/**
 * Análises (drill-down) do acompanhamento de metas. Cada pessoa, base, função e o panorama viram uma
 * vista com o próprio contexto: ritmo, projeção, quem puxa o grupo para baixo e as inspeções que
 * compõem o realizado.
 */

export interface ContextoAnaliseMetas {
  readonly d: AcompanhamentoMetasResponse;
  readonly sst: SstService;
}

const TOM_STATUS: Record<StatusMeta, GeoTone> = { NAO_ATINGIDA: 'danger', EM_ANDAMENTO: 'warning', ATINGIDA: 'success' };
/** Inspeções que contam para a meta (as canceladas não contam). */
const STATUS_QUE_CONTAM = ['EM_ANDAMENTO', 'CONCLUIDA'] as const;
const DIA_MS = 86_400_000;

const alvo = (dimension: string, value: string): AlvoAnalise => ({ dimension, value });
const navegar = (dimension: string, value: string) => ({ tipo: 'navegar' as const, alvo: alvo(dimension, value) });

export const chavePessoa = (i: AcompanhamentoMetaItem): string => `${i.idMeta}~${i.idColaborador}`;
const nomePessoa = (i: AcompanhamentoMetaItem): string => nomeOu(i.nomeColaborador, 'Cadastro não disponível');
const SEM_GRUPO = 'sem';

function tomPercentual(valor: number): GeoTone {
  return valor >= 100 ? 'success' : valor >= 80 ? 'warning' : 'danger';
}

function num(valor: number, casas = 1): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.substring(0, 10).split('-').map(Number);
  const [a2, m2, d2] = ate.substring(0, 10).split('-').map(Number);
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / DIA_MS);
}

function intervaloDaJanela(i: AcompanhamentoMetaItem): IntervaloDrill {
  const de = i.janelaInicio.substring(0, 10);
  const ate = i.janelaFim.substring(0, 10);
  return { de, ate, inicio: intervaloDoPonto(de, 'DIA')!.inicio, fim: intervaloDoPonto(ate, 'DIA')!.fim };
}

/** Ritmo da pessoa no período: quanto fez por dia, quanto precisa fazer e onde termina se mantiver o passo. */
function ritmo(i: AcompanhamentoMetaItem, referencia: string) {
  const totalDias = diasEntre(i.janelaInicio, i.janelaFim) + 1;
  const encerrado = referencia.substring(0, 10) > i.janelaFim.substring(0, 10);
  const ref = encerrado ? i.janelaFim : referencia;
  const decorridos = Math.min(totalDias, Math.max(1, diasEntre(i.janelaInicio, ref) + 1));
  // Dias em que ainda dá para lançar, contando hoje.
  const restantes = encerrado ? 0 : totalDias - decorridos + 1;
  const porDia = i.realizado / decorridos;
  const necessarioPorDia = restantes > 0 ? i.saldo / restantes : null;
  const projecao = Math.round(porDia * totalDias);
  return { totalDias, decorridos, restantes, porDia, necessarioPorDia, projecao, encerrado };
}

const COLUNAS_PESSOAS: GeoDataTableColumn<AcompanhamentoMetaItem>[] = [
  { key: 'nome', header: 'Pessoa', priority: 1, value: (i) => nomePessoa(i) },
  { key: 'realizado', header: 'Realizado', type: 'integer', priority: 1 },
  { key: 'meta', header: 'Meta', type: 'integer', priority: 2 },
  { key: 'percentualAtingimento', header: 'Atingimento', type: 'percent', priority: 1 },
  { key: 'saldo', header: 'Falta', type: 'integer', priority: 2 },
  { key: 'status', header: 'Situação', priority: 1, value: (i) => STATUS_META_LABELS[i.status] },
  { key: 'acesso', header: 'Usuário', priority: 3, value: (i) => (i.possuiUsuario ? 'Sim' : 'Sem usuário') }
];

function tabelaPessoas(itens: readonly AcompanhamentoMetaItem[], titulo = 'Pessoas deste recorte'): TabelaAnalise<AcompanhamentoMetaItem> {
  return {
    id: 'pessoas',
    titulo,
    descricao: 'Menor atingimento primeiro. Clique numa pessoa para ver o ritmo e as inspeções dela.',
    icone: 'pi pi-users',
    colunas: COLUNAS_PESSOAS,
    linhas: [...itens].sort((a, b) => a.percentualAtingimento - b.percentualAtingimento),
    chaveLinha: (i) => chavePessoa(i),
    rotuloLinha: (i) => nomePessoa(i),
    aoAtivar: (i) => navegar('pessoa', chavePessoa(i)),
    rotuloAcao: 'Analisar pessoa',
    nomeArquivo: 'metas-por-pessoa',
    vazio: 'Ninguém com meta neste recorte'
  };
}

/** Atingimento de cada pessoa, do mais distante da meta ao mais perto; clique abre a pessoa. */
function graficoAtingimento(itens: readonly AcompanhamentoMetaItem[]): GraficoAnalise {
  const ordem = [...itens].sort((a, b) => a.percentualAtingimento - b.percentualAtingimento);
  return {
    id: 'atingimento-pessoas',
    titulo: 'Atingimento por pessoa',
    descricao: 'Quanto da meta cada um já cumpriu. Clique para ver a pessoa.',
    tipo: 'bar-horizontal',
    rotulos: ordem.map(nomePessoa),
    series: [{ name: 'Atingimento', values: ordem.map((i) => Math.round(i.percentualAtingimento * 10) / 1000) }],
    formato: 'percent',
    altura: alturaBarras(ordem.length),
    aoSelecionar: (n) => navegar('pessoa', chavePessoa(ordem[n])),
    rotuloSelecao: 'Analisar pessoa'
  };
}

function graficoRealizadoMeta(itens: readonly AcompanhamentoMetaItem[]): GraficoAnalise {
  const ordem = [...itens].sort((a, b) => b.saldo - a.saldo);
  return {
    id: 'realizado-meta-pessoas',
    titulo: 'Realizado × meta',
    descricao: 'Quem mais deve inspeções aparece primeiro.',
    tipo: 'bar',
    rotulos: ordem.map(nomePessoa),
    series: [
      { name: 'Realizado', values: ordem.map((i) => i.realizado) },
      { name: 'Meta', values: ordem.map((i) => i.meta) }
    ],
    formato: 'integer',
    inteiro: ordem.length > 6,
    aoSelecionar: (n) => navegar('pessoa', chavePessoa(ordem[n])),
    rotuloSelecao: 'Analisar pessoa'
  };
}

interface ResumoGrupo {
  pessoas: number;
  meta: number;
  realizado: number;
  percentual: number;
  atingiram: number;
  emAndamento: number;
  naoAtingiram: number;
  semUsuario: number;
}

function resumir(itens: readonly AcompanhamentoMetaItem[]): ResumoGrupo {
  const meta = itens.reduce((s, i) => s + i.meta, 0);
  // O excedente de um não compensa a falta de outro.
  const realizado = itens.reduce((s, i) => s + Math.min(i.realizado, i.meta), 0);
  return {
    pessoas: itens.length,
    meta,
    realizado,
    percentual: meta ? (realizado / meta) * 100 : 0,
    atingiram: itens.filter((i) => i.status === 'ATINGIDA').length,
    emAndamento: itens.filter((i) => i.status === 'EM_ANDAMENTO').length,
    naoAtingiram: itens.filter((i) => i.status === 'NAO_ATINGIDA').length,
    semUsuario: itens.filter((i) => !i.possuiUsuario).length
  };
}

function kpisGrupo(r: ResumoGrupo): KpiAnalise[] {
  return [
    { rotulo: 'Execução', valor: pct(r.percentual), tom: tomPercentual(r.percentual), icone: 'pi pi-flag', detalhe: `${r.realizado} de ${r.meta} inspeções` },
    { rotulo: 'Atingiram', valor: String(r.atingiram), tom: r.atingiram ? 'success' : 'neutral', icone: 'pi pi-check-circle', detalhe: `de ${plural(r.pessoas, 'pessoa', 'pessoas')}` },
    { rotulo: 'A caminho', valor: String(r.emAndamento), tom: r.emAndamento ? 'warning' : 'neutral', icone: 'pi pi-clock' },
    { rotulo: 'Não atingiram', valor: String(r.naoAtingiram), tom: r.naoAtingiram ? 'danger' : 'neutral', icone: 'pi pi-times-circle' },
    { rotulo: 'Sem usuário', valor: String(r.semUsuario), tom: r.semUsuario ? 'warning' : 'neutral', icone: 'pi pi-user-minus' }
  ];
}

function destaquesGrupo(itens: readonly AcompanhamentoMetaItem[], r: ResumoGrupo): DestaqueAnalise[] {
  const destaques: DestaqueAnalise[] = [];
  const zerados = itens.filter((i) => i.realizado === 0 && i.possuiUsuario);
  if (r.semUsuario) {
    destaques.push({ tom: 'warning', icone: 'pi pi-user-minus', texto: r.semUsuario === 1 ? '1 pessoa não tem usuário no sistema e não consegue lançar inspeções.' : `${r.semUsuario} pessoas não têm usuário no sistema e não conseguem lançar inspeções.` });
  }
  if (zerados.length) {
    destaques.push({
      tom: 'danger',
      icone: 'pi pi-exclamation-circle',
      texto: `${plural(zerados.length, 'pessoa com acesso ainda não lançou', 'pessoas com acesso ainda não lançaram')} nenhuma inspeção: ${zerados.slice(0, 3).map(nomePessoa).join(', ')}${zerados.length > 3 ? '…' : ''}.`
    });
  }
  const maisLonge = [...itens].sort((a, b) => b.saldo - a.saldo)[0];
  if (maisLonge && maisLonge.saldo > 0 && itens.length > 1) {
    destaques.push({ tom: 'info', icone: 'pi pi-arrow-up', texto: `Quem mais deve é ${nomePessoa(maisLonge)}: faltam ${plural(maisLonge.saldo, 'inspeção', 'inspeções')}.` });
  }
  if (r.pessoas && r.atingiram === r.pessoas) {
    destaques.push({ tom: 'success', icone: 'pi pi-check-circle', texto: 'Todo mundo deste recorte já cumpriu a meta.' });
  }
  return destaques;
}

function vistaGrupo(a: AlvoAnalise, c: ContextoAnaliseMetas, tipo: 'base' | 'funcao'): VistaAnalise | null {
  const id = (i: AcompanhamentoMetaItem) => (tipo === 'base' ? i.idBaseOperacional : i.idFuncao) ?? SEM_GRUPO;
  const nome = (i: AcompanhamentoMetaItem) => (tipo === 'base' ? i.nomeBaseOperacional : i.nomeFuncao) ?? (tipo === 'base' ? 'Sem base' : 'Sem função');
  const itens = c.d.itens.filter((i) => id(i) === a.value);
  if (!itens.length) return null;
  const grupos = [...new Map(c.d.itens.map((i) => [id(i), nome(i)])).entries()].sort((x, y) => x[1].localeCompare(y[1]));
  const posicao = grupos.findIndex(([g]) => g === a.value);
  const anterior = grupos[posicao - 1];
  const proximo = grupos[posicao + 1];
  const r = resumir(itens);
  const rotulo = tipo === 'base' ? 'Base operacional' : 'Função';
  return {
    chave: chaveDoAlvo(a),
    eyebrow: rotulo,
    titulo: nome(itens[0]),
    descricao: `${plural(r.pessoas, 'pessoa com meta', 'pessoas com meta')} · referência ${formatarDataBr(c.d.dataReferencia)}`,
    icone: tipo === 'base' ? 'pi pi-building' : 'pi pi-briefcase',
    anterior: anterior ? { alvo: alvo(tipo, anterior[0]), rotulo: anterior[1] } : undefined,
    proximo: proximo ? { alvo: alvo(tipo, proximo[0]), rotulo: proximo[1] } : undefined,
    kpis: kpisGrupo(r),
    destaques: destaquesGrupo(itens, r),
    graficos: [graficoAtingimento(itens), graficoRealizadoMeta(itens)],
    tabelas: [tabelaPessoas(itens)],
    links: [{ rotulo: 'Ver no cadastro de metas', icone: 'pi pi-cog', rota: '/sst/metas-inspecao' }],
    copiloto: {
      foco: { tipo: 'tabela', id: `metas-${tipo}`, rotulo: `Metas de inspeção · ${nome(itens[0])}` },
      pergunta: `Analise as metas de inspeção de ${rotulo.toLowerCase()} ${nome(itens[0])}: quem está atrasado, o ritmo de cada pessoa e o que cobrar primeiro.`
    }
  };
}

function vistaGeral(a: AlvoAnalise, c: ContextoAnaliseMetas): VistaAnalise {
  const itens = c.d.itens;
  const r = resumir(itens);
  const porGrupo = (chave: (i: AcompanhamentoMetaItem) => string, nome: (i: AcompanhamentoMetaItem) => string) => {
    const mapa = new Map<string, AcompanhamentoMetaItem[]>();
    itens.forEach((i) => mapa.set(chave(i), [...(mapa.get(chave(i)) ?? []), i]));
    return [...mapa.entries()].map(([id, l]) => ({ id, nome: nome(l[0]), ...resumir(l) })).sort((x, y) => x.percentual - y.percentual);
  };
  const bases = porGrupo((i) => i.idBaseOperacional ?? SEM_GRUPO, (i) => i.nomeBaseOperacional ?? 'Sem base');
  const funcoes = porGrupo((i) => i.idFuncao ?? SEM_GRUPO, (i) => i.nomeFuncao ?? 'Sem função');
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Metas de inspeção',
    titulo: `${pct(r.percentual)} das metas executadas`,
    descricao: `${plural(r.pessoas, 'pessoa com meta', 'pessoas com meta')} · referência ${formatarDataBr(c.d.dataReferencia)}`,
    icone: 'pi pi-flag',
    kpis: kpisGrupo(r),
    destaques: destaquesGrupo(itens, r),
    graficos: [
      {
        id: 'execucao-bases',
        titulo: 'Execução por base',
        descricao: 'Clique numa base para ver as pessoas dela.',
        tipo: 'bar-horizontal',
        rotulos: bases.map((b) => b.nome),
        series: [{ name: 'Execução', values: bases.map((b) => Math.round(b.percentual * 10) / 1000) }],
        formato: 'percent',
        altura: alturaBarras(bases.length),
        aoSelecionar: (n) => navegar('base', bases[n].id),
        rotuloSelecao: 'Analisar base'
      },
      {
        id: 'execucao-funcoes',
        titulo: 'Execução por função',
        descricao: 'Clique numa função para ver as pessoas dela.',
        tipo: 'bar-horizontal',
        rotulos: funcoes.map((f) => f.nome),
        series: [{ name: 'Execução', values: funcoes.map((f) => Math.round(f.percentual * 10) / 1000) }],
        formato: 'percent',
        altura: alturaBarras(funcoes.length),
        aoSelecionar: (n) => navegar('funcao', funcoes[n].id),
        rotuloSelecao: 'Analisar função'
      },
      graficoAtingimento(itens)
    ],
    tabelas: [tabelaPessoas(itens, 'Todas as pessoas com meta')],
    copiloto: {
      foco: { tipo: 'secao', id: 'metas-inspecao', rotulo: 'Acompanhamento das metas de inspeção' },
      pergunta: 'Analise o acompanhamento das metas de inspeção: quais bases e funções estão mais atrasadas e quem cobrar primeiro?'
    }
  };
}

/** Linha acumulada do realizado contra o ritmo ideal até bater a meta. */
function graficoRitmo(i: AcompanhamentoMetaItem, linhas: readonly LinhaInspecao[]): GraficoAnalise | null {
  const total = diasEntre(i.janelaInicio, i.janelaFim) + 1;
  if (total < 2 || total > 400) return null;
  const [a, m, d] = i.janelaInicio.substring(0, 10).split('-').map(Number);
  const dias = Array.from({ length: total }, (_, n) => new Date(a, m - 1, d + n));
  const chave = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const porDia = new Map<string, number>();
  linhas.forEach((l) => porDia.set(l.dia, (porDia.get(l.dia) ?? 0) + 1));
  const hoje = chave(new Date());
  let acumulado = 0;
  return {
    id: 'ritmo',
    titulo: 'Ritmo no período',
    descricao: 'Inspeções acumuladas contra o passo necessário para chegar à meta no último dia.',
    tipo: 'line',
    rotulos: dias.map((dt) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`),
    series: [
      { name: 'Realizado acumulado', values: dias.map((dt) => (chave(dt) > hoje ? null : (acumulado += porDia.get(chave(dt)) ?? 0))) },
      { name: 'Passo ideal', values: dias.map((_, n) => Math.round(((i.meta * (n + 1)) / total) * 10) / 10) }
    ],
    formato: 'number',
    inteiro: true
  };
}

function vistaPessoa(a: AlvoAnalise, c: ContextoAnaliseMetas): VistaAnalise | null {
  const itens = [...c.d.itens].sort((x, y) => x.percentualAtingimento - y.percentualAtingimento);
  const n = itens.findIndex((i) => chavePessoa(i) === a.value);
  if (n < 0) return null;
  const i = itens[n];
  const nome = nomePessoa(i);
  const rt = ritmo(i, c.d.dataReferencia);
  const intervalo = intervaloDaJanela(i);
  const periodo = `${formatarDataBr(i.janelaInicio)} a ${formatarDataBr(i.janelaFim)}`;
  const anterior = itens[n - 1];
  const proximo = itens[n + 1];

  const destaques: DestaqueAnalise[] = [];
  if (!i.possuiUsuario) {
    destaques.push({ tom: 'danger', icone: 'pi pi-user-minus', texto: `${nome} não tem usuário no sistema: não consegue lançar inspeções. O zero é falta de acesso, não de trabalho.` });
  } else if (i.status === 'ATINGIDA') {
    destaques.push({ tom: 'success', icone: 'pi pi-check-circle', texto: `Meta cumprida: ${i.realizado} de ${i.meta} inspeções.` });
  } else if (rt.encerrado) {
    destaques.push({ tom: 'danger', icone: 'pi pi-times-circle', texto: `O período terminou com ${i.realizado} de ${i.meta} inspeções: faltaram ${i.saldo}.` });
  } else {
    if (rt.projecao < i.meta) {
      destaques.push({ tom: 'warning', icone: 'pi pi-chart-line', texto: `No ritmo atual (${num(rt.porDia)} por dia), termina o período com cerca de ${rt.projecao} de ${i.meta}.` });
    } else {
      destaques.push({ tom: 'success', icone: 'pi pi-chart-line', texto: `No ritmo atual (${num(rt.porDia)} por dia), chega à meta antes do fim do período.` });
    }
    if (rt.necessarioPorDia != null && i.saldo > 0) {
      destaques.push({ tom: 'info', icone: 'pi pi-calendar', texto: `Para fechar a meta, precisa de ${num(rt.necessarioPorDia)} ${rt.necessarioPorDia === 1 ? 'inspeção' : 'inspeções'} por dia até o fim do período (${rt.restantes === 1 ? 'só hoje' : rt.restantes === 2 ? 'hoje e amanhã' : `${rt.restantes} dias, contando hoje`}).` });
    }
    if (i.realizado === 0) {
      destaques.push({ tom: 'danger', icone: 'pi pi-exclamation-circle', texto: `Nenhuma inspeção lançada em ${plural(rt.decorridos, 'dia', 'dias')} de período.` });
    }
  }

  const kpis: KpiAnalise[] = [
    { rotulo: 'Realizado', valor: `${i.realizado} de ${i.meta}`, tom: TOM_STATUS[i.status], icone: 'pi pi-clipboard', detalhe: STATUS_META_LABELS[i.status] },
    { rotulo: 'Atingimento', valor: pct(i.percentualAtingimento, 0), tom: tomPercentual(i.percentualAtingimento), icone: 'pi pi-flag' },
    { rotulo: 'Falta', valor: String(i.saldo), tom: i.saldo ? 'warning' : 'success', icone: 'pi pi-hourglass', detalhe: i.saldo ? plural(i.saldo, 'inspeção', 'inspeções') : 'Nada' },
    { rotulo: 'Termina', valor: rt.encerrado ? 'Já terminou' : rt.restantes === 1 ? 'Hoje' : rt.restantes === 2 ? 'Amanhã' : `Em ${rt.restantes - 1} dias`, icone: 'pi pi-calendar', detalhe: periodo },
    { rotulo: 'Ritmo atual', valor: `${num(rt.porDia)}/dia`, icone: 'pi pi-chart-line', detalhe: rt.necessarioPorDia != null && i.saldo > 0 ? `Precisa de ${num(rt.necessarioPorDia)}/dia` : undefined }
  ];

  const filtrosInspecoes = {
    idInspetor: i.idUsuario ? [i.idUsuario] : [],
    idTipoInspecao: [i.idTipoInspecao],
    status: [...STATUS_QUE_CONTAM],
    dataRealizacaoDe: intervalo.inicio,
    dataRealizacaoAte: intervalo.fim
  };

  return {
    chave: chaveDoAlvo(a),
    eyebrow: `Meta ${i.origem === 'COLABORADOR' ? 'individual' : 'da função'} · ${i.nomeTipoInspecao ?? 'todos os tipos'} · ${PERIODICIDADE_LABELS[i.periodicidade].toLowerCase()}`,
    titulo: nome,
    descricao: `${[i.nomeFuncao, i.nomeBaseOperacional].filter(Boolean).join(' · ') || 'Sem função e base'} · período ${periodo}`,
    icone: 'pi pi-user',
    anterior: anterior ? { alvo: alvo('pessoa', chavePessoa(anterior)), rotulo: nomePessoa(anterior) } : undefined,
    proximo: proximo ? { alvo: alvo('pessoa', chavePessoa(proximo)), rotulo: nomePessoa(proximo) } : undefined,
    kpis,
    destaques,
    graficos: [],
    origem: i.idUsuario
      ? origemInspecoes({
          sst: c.sst,
          filtros: filtrosInspecoes,
          titulo: `Inspeções de ${nome} no período`,
          descricao: 'As inspeções que contam para a meta: do tipo da meta, lançadas por esta pessoa dentro do período. Clique numa inspeção para ver o detalhe.',
          quantidadeEsperada: i.realizado,
          derivados: (l) => [graficoRitmo(i, l), ...graficosDasInspecoes(l, { inspetor: false })].filter((g): g is GraficoAnalise => !!g),
          verTudo: {
            rotulo: 'Ver na listagem de inspeções',
            icone: 'pi pi-external-link',
            rota: '/sst/inspecoes',
            queryParams: { realizacao: `${intervalo.de}~${intervalo.ate}`, idInspetor: i.idUsuario, idTipoInspecao: i.idTipoInspecao }
          },
          nomeArquivo: `inspecoes-meta-${nome}`
        })
      : undefined,
    origensExtras: i.idUsuario
      ? [
          origemDesvios({
            sst: c.sst,
            filtros: { idInspetor: [i.idUsuario], dataInspecaoDe: intervalo.inicio, dataInspecaoAte: intervalo.fim },
            titulo: `Desvios apontados por ${nome} no período`,
            rotuloAba: 'Desvios apontados',
            derivados: (l) => graficosDosDesvios(l, 'desvios'),
            nomeArquivo: `desvios-${nome}`
          })
        ]
      : undefined,
    links: [{ rotulo: 'Ver no cadastro de metas', icone: 'pi pi-cog', rota: '/sst/metas-inspecao' }],
    copiloto: {
      foco: { tipo: 'metrica', id: 'meta-pessoa', rotulo: `Meta de inspeção de ${nome}` },
      pergunta: `Analise a meta de inspeção de ${nome} (${i.realizado} de ${i.meta} no período ${periodo}): ritmo, projeção e o que fazer para fechar a meta.`
    }
  };
}

/** Resolve a análise aberta (`?drill=`) contra o acompanhamento em tela. */
export function vistaMetas(a: AlvoAnalise, c: ContextoAnaliseMetas): VistaAnalise | null {
  switch (a.dimension) {
    case 'pessoa': return vistaPessoa(a, c);
    case 'base': return vistaGrupo(a, c, 'base');
    case 'funcao': return vistaGrupo(a, c, 'funcao');
    case 'geral': return vistaGeral(a, c);
    default: return null;
  }
}
