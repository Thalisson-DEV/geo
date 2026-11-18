import { GeoDataTableColumn, GeoTone } from '@geo/ui';

import { MovimentacaoRelatorio, MovimentacoesRelatorioResponse } from '../../../../../core/models/almoxarifado-relatorios.models';
import {
  DestaqueAnalise,
  KpiAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  Eixo,
  Grupo,
  MOTIVOS_PERDA,
  NOMES_DIA,
  Natureza,
  ROTULO_MOTIVO,
  ROTULO_NATUREZA,
  ROTULO_TIPO_MOV,
  SEM,
  agrupar,
  alvo,
  priorizar,
  diaSemanaDe,
  dividir,
  eixoDoPeriodo,
  grafico,
  graficoGrupos,
  horaDe,
  idAlmox,
  inteiro,
  linkMovimentacoesMaterial,
  linkSaldoEstoque,
  natureza,
  navegar,
  nomeAlmox,
  origemMovimentacoes,
  pareto,
  pct,
  plural,
  sentido,
  qtd,
  rotulo,
  soma,
  taxaRetornoDe,
  textoVariacao,
  variacao
} from '../almox-analise-comum';

/** Ordem das naturezas nos gráficos (entradas, saídas, campo). */
export const NATUREZAS: Natureza[] = [
  'abastecimento', 'retorno', 'sucata-recebida', 'atendimento', 'baixa', 'remanejamento', 'aplicacao', 'retirada-campo', 'outros-campo'
];

/** Horário administrativo do almoxarifado (fora dele: madrugada, noite e fim de semana). */
const HORA_INICIO = 6;
const HORA_FIM = 20;

export interface FiltrosMov {
  naturezas: string[];
  tipos: string[];
  condicoes: string[];
  materiais: string[];
}

export interface MaterialMov {
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  movimentos: number;
  entregue: number;
  retornado: number;
  baixado: number;
  abastecido: number;
  aplicado: number;
  sucata: number;
  /** Entregue menos retornado: o que ficou com as equipes e obras. */
  liquido: number;
  /** Retornado sobre entregue (0–1). */
  taxaRetorno: number | null;
  estornos: number;
  linhas: MovimentacaoRelatorio[];
}

export interface ModeloMov {
  r: MovimentacoesRelatorioResponse;
  linhas: MovimentacaoRelatorio[];
  anteriores: MovimentacaoRelatorio[];
  eixo: Eixo;
  operacoes: number;
  operacoesAnt: number;
  porNatureza: Record<Natureza, MovimentacaoRelatorio[]>;
  porNaturezaAnt: Record<Natureza, number>;
  estornos: MovimentacaoRelatorio[];
  estornosAnt: number;
  entregas: MovimentacaoRelatorio[];
  /** Estornos sobre entregas (retrabalho). */
  taxaEstorno: number | null;
  taxaEstornoAnt: number | null;
  /** Itens retornados (novos) sobre itens atendidos. */
  taxaRetorno: number | null;
  perdas: MovimentacaoRelatorio[];
  avulsasSemMotivo: MovimentacaoRelatorio[];
  ajustes: MovimentacaoRelatorio[];
  /** Lançamentos do balcão (entradas, saídas e remanejamentos) fora do expediente. */
  foraDoHorario: MovimentacaoRelatorio[];
  /** Itens que passaram pelo balcão do almoxarifado. */
  noBalcao: number;
  materiais: MaterialMov[];
  almox: Grupo<MovimentacaoRelatorio>[];
  operadores: Grupo<MovimentacaoRelatorio>[];
  equipes: Grupo<MovimentacaoRelatorio>[];
  motivos: Grupo<MovimentacaoRelatorio>[];
  concentracaoOperador: number | null;
  serie: { chave: string; rotulo: string; porNatureza: Record<Natureza, number>; total: number }[];
  porHora: number[];
  porDiaSemana: number[];
  paretoMateriais: { itens: number; total: number; fracao: number };
}

const zeros = (): Record<Natureza, number> => Object.fromEntries(NATUREZAS.map((n) => [n, 0])) as Record<Natureza, number>;
const listas = (): Record<Natureza, MovimentacaoRelatorio[]> =>
  Object.fromEntries(NATUREZAS.map((n) => [n, [] as MovimentacaoRelatorio[]])) as Record<Natureza, MovimentacaoRelatorio[]>;
const operacoes = (l: readonly MovimentacaoRelatorio[]) => new Set(l.map((m) => m.idOperacao ?? m.id)).size;
const foraHorario = (m: MovimentacaoRelatorio) => {
  const h = horaDe(m.dataHora);
  const d = diaSemanaDe(m.dataHora);
  return d === 0 || d === 6 || h < HORA_INICIO || h >= HORA_FIM;
};

export function aceitaFiltros(f: FiltrosMov) {
  const nat = f.naturezas.length ? new Set(f.naturezas) : null;
  const tip = f.tipos.length ? new Set(f.tipos) : null;
  const cond = f.condicoes.length ? new Set(f.condicoes) : null;
  const mat = f.materiais.length ? new Set(f.materiais) : null;
  return (m: MovimentacaoRelatorio) =>
    (!nat || nat.has(natureza(m))) && (!tip || tip.has(m.tipo)) && (!cond || cond.has(m.condicao)) && (!mat || mat.has(m.idMaterial));
}

export function modeloMov(r: MovimentacoesRelatorioResponse, aceita: (m: MovimentacaoRelatorio) => boolean): ModeloMov {
  const todas = r.movimentacoes.filter(aceita);
  const linhas = todas.filter((m) => !m.anterior);
  const anteriores = todas.filter((m) => m.anterior);
  const eixo = eixoDoPeriodo(r.de, r.ate);

  const porNatureza = listas();
  for (const m of linhas) porNatureza[natureza(m)].push(m);
  const porNaturezaAnt = zeros();
  for (const m of anteriores) porNaturezaAnt[natureza(m)]++;

  const entregas = linhas.filter((m) => m.tipo === 'ENTREGA');
  const estornos = linhas.filter((m) => m.tipo === 'ESTORNO');
  const entregasAnt = anteriores.filter((m) => m.tipo === 'ENTREGA').length;
  const estornosAnt = anteriores.filter((m) => m.tipo === 'ESTORNO').length;

  const avulsas = linhas.filter((m) => m.tipo === 'ENTRADA_AVULSA' || m.tipo === 'BAIXA_AVULSA');
  const perdas = linhas.filter((m) => m.tipo === 'BAIXA_AVULSA' && !!m.motivo && MOTIVOS_PERDA.has(m.motivo));

  // Materiais
  const porMaterial = agrupar(linhas, (m) => m.idMaterial, (m) => `${m.codigo} · ${m.descricao}`);
  const materiais: MaterialMov[] = porMaterial.map((g) => {
    const l = g.linhas;
    const de = (n: Natureza) => soma(l.filter((m) => natureza(m) === n), (m) => m.quantidade);
    const entregue = de('atendimento');
    const retornado = de('retorno');
    return {
      idMaterial: g.chave, codigo: l[0].codigo, descricao: l[0].descricao, unidade: l[0].unidade,
      movimentos: l.length, entregue, retornado, baixado: de('baixa'), abastecido: de('abastecimento'),
      aplicado: de('aplicacao'), sucata: de('sucata-recebida'), liquido: entregue - retornado,
      taxaRetorno: entregue > 0 ? Math.min(1, retornado / entregue) : null,
      estornos: l.filter((m) => m.tipo === 'ESTORNO').length,
      linhas: l
    };
  });

  const serie = eixo.chaves.map((chave, i) => ({ chave, rotulo: eixo.rotulos[i], porNatureza: zeros(), total: 0 }));
  const indice = new Map(eixo.chaves.map((c, i) => [c, i]));
  const porHora = Array.from({ length: 24 }, () => 0);
  const porDiaSemana = Array.from({ length: 7 }, () => 0);
  for (const m of linhas) {
    const i = indice.get(eixo.chaveDe(m.dataHora));
    if (i !== undefined) {
      serie[i].porNatureza[natureza(m)]++;
      serie[i].total++;
    }
    if (sentido(m) === 'campo') continue;
    porHora[horaDe(m.dataHora)]++;
    porDiaSemana[diaSemanaDe(m.dataHora)]++;
  }

  const operadores = agrupar(linhas, (m) => m.idOperador, (m) => m.operador ?? 'Operador sem nome', (g) => operacoes(g.linhas), 'Sem operador');
  const totalOps = operacoes(linhas);
  const atendidos = porNatureza.atendimento.length;
  return {
    r, linhas, anteriores, eixo,
    operacoes: totalOps,
    operacoesAnt: operacoes(anteriores),
    porNatureza, porNaturezaAnt,
    estornos, estornosAnt, entregas,
    taxaEstorno: entregas.length ? estornos.length / entregas.length : null,
    taxaEstornoAnt: entregasAnt ? estornosAnt / entregasAnt : null,
    taxaRetorno: atendidos ? taxaRetornoDe(linhas) : null,
    perdas,
    avulsasSemMotivo: avulsas.filter((m) => !m.motivo),
    ajustes: avulsas.filter((m) => m.motivo === 'AJUSTE_INVENTARIO'),
    foraDoHorario: linhas.filter((m) => sentido(m) !== 'campo' && foraHorario(m)),
    noBalcao: linhas.filter((m) => sentido(m) !== 'campo').length,
    materiais,
    almox: agrupar(linhas.filter((m) => idAlmox(m)), idAlmox, nomeAlmox),
    operadores,
    equipes: agrupar(linhas.filter((m) => m.idEquipe), (m) => m.idEquipe, (m) => m.equipe ?? 'Equipe'),
    motivos: agrupar(linhas.filter((m) => m.tipo === 'BAIXA_AVULSA' || m.tipo === 'ENTRADA_AVULSA'), (m) => m.motivo ?? 'SEM_MOTIVO',
      (m) => (m.motivo ? rotulo(ROTULO_MOTIVO, m.motivo) : 'Sem motivo informado')),
    concentracaoOperador: totalOps && operadores[0] && operadores[0].chave !== SEM ? operacoes(operadores[0].linhas) / totalOps : null,
    serie, porHora, porDiaSemana,
    paretoMateriais: pareto(materiais.map((x) => x.movimentos))
  };
}

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoMov(m: ModeloMov): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const leituras: LeituraGerencial[] = [];
  const vOps = variacao(m.operacoes, m.operacoesAnt);
  const atend = m.porNatureza.atendimento.length;

  if (m.perdas.length) {
    const mats = new Set(m.perdas.map((x) => x.idMaterial)).size;
    leituras.push({ id: 'perdas', tom: 'danger', icone: 'pi pi-exclamation-circle', titulo: 'Perdas registradas', valor: plural(m.perdas.length, 'baixa', 'baixas'),
      texto: `Baixas por perda, avaria, danificação ou obsolescência em ${plural(mats, 'material', 'materiais')}. Confira se há responsável e se o motivo se repete.`,
      acao: { rotulo: 'Ver as perdas', alvo: alvo('kpi', 'perdas') } });
  }
  if (m.taxaEstorno != null && m.taxaEstorno >= 0.1 && m.estornos.length >= 3) {
    leituras.push({ id: 'estornos', tom: 'warning', icone: 'pi pi-replay', titulo: 'Retrabalho nas entregas', valor: pct(m.taxaEstorno, 0),
      texto: `${plural(m.estornos.length, 'estorno', 'estornos')} para ${plural(m.entregas.length, 'entrega', 'entregas')}: material entregue e desfeito depois. Veja quem mais estorna e por quê.`,
      acao: { rotulo: 'Ver os estornos', alvo: alvo('kpi', 'estornos') } });
  }
  // Equipe que estorna muito acima da média: lançamento para a equipe errada ou pedido mal feito.
  const comEntregas = m.equipes.map(linhaGrupo).filter((g) => g.entregas >= 8);
  const foraEstorno = m.taxaEstorno ? comEntregas.filter((g) => g.estornos / g.entregas >= Math.max(0.1, m.taxaEstorno! * 2))
    .sort((a, b) => b.estornos / b.entregas - a.estornos / a.entregas) : [];
  if (foraEstorno.length) {
    const g = foraEstorno[0];
    leituras.push({ id: 'estorno-equipe', tom: 'warning', icone: 'pi pi-replay', titulo: `${g.rotulo} estorna demais`, valor: pct(g.estornos / g.entregas, 0),
      texto: `${plural(g.estornos, 'estorno', 'estornos')} em ${plural(g.entregas, 'entrega', 'entregas')}, contra ${pct(m.taxaEstorno, 0)} na média. Material lançado para a equipe errada ou pedido refeito: converse com o encarregado.`,
      acao: { rotulo: 'Ver a equipe', alvo: alvo('equipe', g.chave) } });
  }
  if (m.ajustes.length) {
    const repetidos = agrupar(m.ajustes, (x) => `${x.idMaterial}|${idAlmox(x) ?? ''}`, (x) => `${x.codigo} em ${nomeAlmox(x) ?? 'estoque'}`).filter((g) => g.linhas.length >= 2);
    const r = repetidos[0];
    leituras.push({ id: 'ajustes', tom: 'warning', icone: 'pi pi-sliders-h', titulo: r ? 'Ajuste que se repete' : 'Ajustes de inventário',
      valor: r ? `${r.linhas.length}× ${r.linhas[0].codigo}` : plural(m.ajustes.length, 'lançamento', 'lançamentos'),
      texto: r
        ? `${r.rotulo} foi ajustado ${r.linhas.length} vezes no período (${r.linhas[0].descricao}). Divergência que volta é falha de processo: confira as saídas sem registro desse item.`
        : 'Ajuste é sinal de divergência entre o sistema e a prateleira. Acompanhe se volta a acontecer no mesmo material.',
      acao: r ? { rotulo: 'Ver o material', alvo: alvo('material', r.linhas[0].idMaterial) } : { rotulo: 'Ver os ajustes', alvo: alvo('motivo', 'AJUSTE_INVENTARIO') } });
  }
  if (m.avulsasSemMotivo.length) {
    leituras.push({ id: 'sem-motivo', tom: 'warning', icone: 'pi pi-question-circle', titulo: 'Avulsas sem motivo', valor: inteiro(m.avulsasSemMotivo.length),
      texto: 'Entradas e baixas avulsas sem motivo não deixam rastro para auditoria. Cobre o motivo no lançamento.',
      acao: { rotulo: 'Ver os lançamentos', alvo: alvo('motivo', 'SEM_MOTIVO') } });
  }
  if (m.concentracaoOperador != null && m.concentracaoOperador >= 0.6 && m.operadores.length > 1) {
    const op = m.operadores[0];
    leituras.push({ id: 'operador', tom: 'info', icone: 'pi pi-user', titulo: 'Operação concentrada', valor: pct(m.concentracaoOperador, 0),
      texto: `${op.rotulo} lançou a maior parte das operações. Se essa pessoa faltar, o almoxarifado para: vale treinar outra pessoa.`,
      acao: { rotulo: 'Ver o operador', alvo: alvo('operador', op.chave) } });
  }
  if (m.foraDoHorario.length && m.noBalcao && m.foraDoHorario.length / m.noBalcao >= 0.03) {
    leituras.push({ id: 'horario', tom: 'info', icone: 'pi pi-moon', titulo: 'Balcão fora do horário', valor: pct(m.foraDoHorario.length / m.noBalcao, 0),
      texto: `Entradas e saídas do almoxarifado à noite, de madrugada ou no fim de semana (antes das ${HORA_INICIO}h ou a partir das ${HORA_FIM}h). Podem ser lançamentos atrasados ou operação sem acompanhamento.`,
      acao: { rotulo: 'Ver os lançamentos', alvo: alvo('kpi', 'fora-horario') } });
  }
  const voltaMuito = m.materiais.filter((x) => x.taxaRetorno != null && x.entregue > 0 && x.linhas.filter((y) => natureza(y) === 'atendimento').length >= 5
    && x.taxaRetorno >= Math.max(0.25, (m.taxaRetorno ?? 0) * 1.8)).sort((a, b) => b.linhas.length - a.linhas.length);
  if (voltaMuito.length) {
    const x = voltaMuito[0];
    leituras.push({ id: 'retorno', tom: 'warning', icone: 'pi pi-undo', titulo: 'Pedem mais do que usam', valor: `${pct(x.taxaRetorno, 0)} ${x.codigo}`,
      texto: `${pct(x.taxaRetorno, 0)} do ${x.descricao.toLowerCase()} entregue voltou ao almoxarifado${voltaMuito.length > 1 ? ` (e mais ${plural(voltaMuito.length - 1, 'material', 'materiais')} na mesma situação)` : ''}. Ajuste a quantidade padrão das solicitações desse item.`,
      acao: { rotulo: 'Ver o material', alvo: alvo('material', x.idMaterial) } });
  } else if (m.taxaRetorno != null && atend >= 10) {
    leituras.push({ id: 'retorno', tom: 'info', icone: 'pi pi-undo', titulo: 'Material que volta', valor: pct(m.taxaRetorno, 0),
      texto: 'Itens que voltam ao almoxarifado para cada item entregue às equipes. Nenhum material foge muito da média.',
      acao: { rotulo: 'Ver os retornos', alvo: alvo('natureza', 'retorno') } });
  }
  const topMat = m.materiais[0];
  if (topMat && m.paretoMateriais.total >= 5) {
    leituras.push({ id: 'pareto', tom: 'info', icone: 'pi pi-chart-pie', titulo: 'Onde está o giro', valor: `${m.paretoMateriais.itens} de ${m.paretoMateriais.total}`,
      texto: `Materiais que fazem 80% das movimentações. ${topMat.codigo} (${topMat.descricao}) é o que mais gira: mantenha esses itens perto da expedição.`,
      acao: { rotulo: 'Ver o material', alvo: alvo('material', topMat.idMaterial) } });
  }

  const graves = leituras.filter((l) => l.tom === 'danger').length;
  const atencao = leituras.filter((l) => l.tom === 'warning').length;
  const tom: GeoTone = graves ? 'danger' : atencao ? 'warning' : 'success';
  const ritmo = vOps == null ? '' : ` O volume ${vOps > 0.05 ? 'subiu' : vOps < -0.05 ? 'caiu' : 'ficou estável'} (${textoVariacao(m.operacoes, m.operacoesAnt)}).`;
  const veredito: VereditoGerencial = {
    tom,
    rotulo: graves ? 'Agir agora' : atencao ? 'Acompanhar' : 'Sob controle',
    titulo: m.linhas.length
      ? `${plural(m.operacoes, 'operação', 'operações')} e ${plural(m.linhas.length, 'item movimentado', 'itens movimentados')}`
      : 'Nenhuma movimentação no recorte',
    texto: m.linhas.length
      ? `${plural(atend, 'item saiu', 'itens saíram')} para equipes e obras, ${plural(m.porNatureza.retorno.length, 'voltou', 'voltaram')} e ${plural(m.porNatureza.baixa.length, 'foi baixado', 'foram baixados')}.${ritmo}`
      : 'Amplie o período ou retire filtros para ver o fluxo do almoxarifado.'
  };
  return {
    veredito,
    leituras: priorizar(leituras),
    pergunta: 'Faça a leitura gerencial das movimentações do almoxarifado neste recorte: o que preocupa (perdas, ajustes, estornos), o que mudou e o que fazer primeiro.'
  };
}

// ── Análise detalhada ────────────────────────────────────────────────────────────────────────────

const colMateriais: GeoDataTableColumn<MaterialMov>[] = [
  { key: 'codigo', header: 'Código', priority: 1 },
  { key: 'descricao', header: 'Material', priority: 1 },
  { key: 'movimentos', header: 'Movimentos', type: 'integer', priority: 2 },
  { key: 'entregue', header: 'Entregue', type: 'custom', priority: 1, value: (x) => x.entregue, display: (x) => qtd(x.entregue, x.unidade) },
  { key: 'retornado', header: 'Retornou', type: 'custom', priority: 2, value: (x) => x.retornado, display: (x) => qtd(x.retornado, x.unidade) },
  { key: 'taxaRetorno', header: '% retorno', type: 'custom', priority: 3, value: (x) => x.taxaRetorno ?? -1, display: (x) => pct(x.taxaRetorno, 0) },
  { key: 'baixado', header: 'Baixado', type: 'custom', priority: 3, value: (x) => x.baixado, display: (x) => qtd(x.baixado, x.unidade) },
  { key: 'abastecido', header: 'Abastecido', type: 'custom', priority: 3, value: (x) => x.abastecido, display: (x) => qtd(x.abastecido, x.unidade) },
  { key: 'estornos', header: 'Estornos', type: 'integer', priority: 3 }
];
export const colunasMateriais = colMateriais;

interface LinhaGrupo { chave: string; rotulo: string; itens: number; operacoes: number; entregas: number; retornos: number; estornos: number; baixas: number }
const colGrupo: GeoDataTableColumn<LinhaGrupo>[] = [
  { key: 'rotulo', header: 'Nome', priority: 1 },
  { key: 'operacoes', header: 'Operações', type: 'integer', priority: 1 },
  { key: 'itens', header: 'Itens', type: 'integer', priority: 2 },
  { key: 'entregas', header: 'Entregas', type: 'integer', priority: 2 },
  { key: 'retornos', header: 'Retornos', type: 'integer', priority: 3 },
  { key: 'estornos', header: 'Estornos', type: 'integer', priority: 3 },
  { key: 'baixas', header: 'Baixas', type: 'integer', priority: 3 }
];
export const colunasGrupo = colGrupo;

export function linhaGrupo(g: Grupo<MovimentacaoRelatorio>): LinhaGrupo {
  const l = g.linhas;
  return {
    chave: g.chave, rotulo: g.rotulo, itens: l.length, operacoes: operacoes(l),
    entregas: l.filter((m) => m.tipo === 'ENTREGA').length,
    retornos: l.filter((m) => natureza(m) === 'retorno').length,
    estornos: l.filter((m) => m.tipo === 'ESTORNO').length,
    baixas: l.filter((m) => m.tipo === 'BAIXA_AVULSA').length
  };
}

export function vistaMov(a: { dimension: string; value: string }, m: ModeloMov): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  switch (a.dimension) {
    case 'kpi': return vistaKpi(a.value, m, chave);
    case 'natureza': return vistaNatureza(a.value as Natureza, m, chave);
    case 'tipo': return vistaRecorte(chave, 'Tipo de movimentação', ROTULO_TIPO_MOV[a.value as keyof typeof ROTULO_TIPO_MOV] ?? a.value, 'pi pi-tag',
      m.linhas.filter((x) => x.tipo === a.value), m);
    case 'periodo': return vistaPeriodo(a.value, m, chave);
    case 'almox': return vistaAlmox(a.value, m, chave);
    case 'operador': return vistaGrupo(chave, 'Operador', m.operadores, a.value, 'operador', 'pi pi-user', m);
    case 'equipe': return vistaGrupo(chave, 'Equipe', m.equipes, a.value, 'equipe', 'pi pi-users', m);
    case 'motivo': return vistaMotivo(a.value, m, chave);
    case 'material': return vistaMaterial(a.value, m, chave);
    case 'hora': {
      const h = Number(a.value);
      return vistaRecorte(chave, 'Hora do dia', `Das ${h}h às ${h + 1}h`, 'pi pi-clock', m.linhas.filter((x) => sentido(x) !== 'campo' && horaDe(x.dataHora) === h), m,
        { anterior: h > 0 ? { alvo: alvo('hora', String(h - 1)), rotulo: `${h - 1}h` } : undefined,
          proximo: h < 23 ? { alvo: alvo('hora', String(h + 1)), rotulo: `${h + 1}h` } : undefined });
    }
    case 'semana': {
      const d = Number(a.value);
      return vistaRecorte(chave, 'Dia da semana', NOMES_DIA[d], 'pi pi-calendar', m.linhas.filter((x) => sentido(x) !== 'campo' && diaSemanaDe(x.dataHora) === d), m);
    }
    default: return null;
  }
}

function kpisBase(l: readonly MovimentacaoRelatorio[]): KpiAnalise[] {
  return [
    { rotulo: 'Operações', valor: inteiro(operacoes(l)), icone: 'pi pi-file' },
    { rotulo: 'Itens movimentados', valor: inteiro(l.length), icone: 'pi pi-list' },
    { rotulo: 'Materiais', valor: inteiro(new Set(l.map((x) => x.idMaterial)).size), icone: 'pi pi-box' },
    { rotulo: 'Equipes', valor: inteiro(new Set(l.filter((x) => x.idEquipe).map((x) => x.idEquipe)).size), icone: 'pi pi-users' }
  ];
}

function graficosPadrao(l: readonly MovimentacaoRelatorio[], semNatureza = false) {
  const nat = NATUREZAS.map((n) => ({ n, v: l.filter((x) => natureza(x) === n).length })).filter((x) => x.v > 0);
  const mats = agrupar(l, (x) => x.idMaterial, (x) => `${x.codigo} · ${x.descricao}`);
  const eq = agrupar(l.filter((x) => x.idEquipe), (x) => x.idEquipe, (x) => x.equipe);
  return [
    ...(semNatureza || nat.length < 2 ? [] : [grafico('nat', 'Por natureza', 'doughnut', nat.map((x) => ROTULO_NATUREZA[x.n]), [{ name: 'Itens', values: nat.map((x) => x.v) }],
      { aoSelecionar: (i) => (nat[i] ? navegar('natureza', nat[i].n) : null), rotuloSelecao: 'Analisar a natureza' })]),
    graficoGrupos('mat', 'Materiais mais movimentados', mats, 'Itens', (g) => g.linhas.length, 'material'),
    ...(eq.length ? [graficoGrupos('eq', 'Equipes envolvidas', eq, 'Itens', (g) => g.linhas.length, 'equipe')] : [])
  ];
}

function vistaRecorte(chave: string, eyebrow: string, titulo: string, icone: string, l: MovimentacaoRelatorio[], m: ModeloMov,
                      extra: Partial<VistaAnalise> = {}): VistaAnalise | null {
  return {
    chave, eyebrow, titulo, icone,
    kpis: kpisBase(l),
    graficos: graficosPadrao(l),
    origem: origemMovimentacoes(chave.replace(/[^a-z0-9-]/gi, '-'), titulo, l),
    ...extra
  };
}

function vistaKpi(qual: string, m: ModeloMov, chave: string): VistaAnalise | null {
  if (qual === 'operacoes') {
    return {
      chave, eyebrow: 'Volume', titulo: 'Tudo o que se moveu no período', icone: 'pi pi-arrow-right-arrow-left',
      kpis: [...kpisBase(m.linhas).slice(0, 2),
        { rotulo: 'Período anterior', valor: inteiro(m.operacoesAnt), detalhe: textoVariacao(m.operacoes, m.operacoesAnt) }],
      graficos: [
        grafico('serie', `Itens por ${m.eixo.unidade}`, 'bar-stacked', m.serie.map((x) => x.rotulo),
          NATUREZAS.filter((n) => m.porNatureza[n].length).map((n) => ({ name: ROTULO_NATUREZA[n], values: m.serie.map((x) => x.porNatureza[n]) })),
          { inteiro: true, aoSelecionar: (i) => (m.serie[i] ? navegar('periodo', m.serie[i].chave) : null), rotuloSelecao: 'Analisar o período' }),
        ...graficosPadrao(m.linhas)
      ],
      origem: origemMovimentacoes('todas', 'Movimentações do período', m.linhas)
    };
  }
  if (qual === 'estornos') {
    const porOp = agrupar(m.estornos, (x) => x.idOperador, (x) => x.operador ?? 'Sem nome');
    const porEq = agrupar(m.estornos.filter((x) => x.idEquipe), (x) => x.idEquipe, (x) => x.equipe);
    return {
      chave, eyebrow: 'Retrabalho', titulo: 'Estornos de entrega', icone: 'pi pi-replay',
      descricao: 'Estorno desfaz uma entrega já lançada: material registrado para a equipe ou obra errada, quantidade errada ou entrega cancelada.',
      kpis: [
        { rotulo: 'Estornos', valor: inteiro(m.estornos.length), detalhe: textoVariacao(m.estornos.length, m.estornosAnt) },
        { rotulo: 'Entregas', valor: inteiro(m.entregas.length) },
        { rotulo: 'Taxa de estorno', valor: pct(m.taxaEstorno, 1), detalhe: m.taxaEstornoAnt != null ? `Anterior: ${pct(m.taxaEstornoAnt, 1)}` : undefined,
          tom: m.taxaEstorno != null && m.taxaEstorno >= 0.1 ? 'warning' : undefined }
      ],
      destaques: porOp[0] && m.estornos.length >= 3 ? [{ icone: 'pi pi-user', tom: 'info',
        texto: `${porOp[0].rotulo} lançou ${pct(porOp[0].linhas.length / m.estornos.length, 0)} dos estornos.` }] : [],
      graficos: [
        graficoGrupos('op', 'Por operador', porOp, 'Estornos', (g) => g.linhas.length, 'operador'),
        graficoGrupos('eq', 'Por equipe', porEq, 'Estornos', (g) => g.linhas.length, 'equipe'),
        graficoGrupos('mat', 'Por material', agrupar(m.estornos, (x) => x.idMaterial, (x) => `${x.codigo} · ${x.descricao}`), 'Estornos', (g) => g.linhas.length, 'material')
      ],
      origem: origemMovimentacoes('estornos', 'Estornos do período', m.estornos)
    };
  }
  if (qual === 'perdas') {
    const porMotivo = agrupar(m.perdas, (x) => x.motivo, (x) => rotulo(ROTULO_MOTIVO, x.motivo));
    return {
      chave, eyebrow: 'Perdas', titulo: 'Material perdido, avariado ou obsoleto', icone: 'pi pi-exclamation-circle',
      descricao: 'Baixas avulsas com motivo de perda, avaria, danificação ou obsolescência. Sucateamento comum fica de fora.',
      kpis: [
        { rotulo: 'Baixas por perda', valor: inteiro(m.perdas.length), tom: m.perdas.length ? 'danger' : 'success' },
        { rotulo: 'Materiais', valor: inteiro(new Set(m.perdas.map((x) => x.idMaterial)).size) },
        { rotulo: 'Baixas no total', valor: inteiro(m.porNatureza.baixa.length) }
      ],
      graficos: [
        graficoGrupos('mot', 'Por motivo', porMotivo, 'Baixas', (g) => g.linhas.length, 'motivo'),
        graficoGrupos('mat', 'Por material', agrupar(m.perdas, (x) => x.idMaterial, (x) => `${x.codigo} · ${x.descricao}`), 'Baixas', (g) => g.linhas.length, 'material'),
        graficoGrupos('alm', 'Por almoxarifado', agrupar(m.perdas, idAlmox, nomeAlmox), 'Baixas', (g) => g.linhas.length, 'almox')
      ],
      origem: origemMovimentacoes('perdas', 'Baixas por perda', m.perdas)
    };
  }
  if (qual === 'fora-horario') {
    const l = m.foraDoHorario;
    return {
      chave, eyebrow: 'Horário', titulo: 'Lançamentos fora do horário', icone: 'pi pi-moon',
      descricao: `Entradas e saídas do almoxarifado antes das ${HORA_INICIO}h, a partir das ${HORA_FIM}h ou no sábado e domingo. Aplicações e retiradas em campo ficam de fora.`,
      kpis: [
        { rotulo: 'Itens', valor: inteiro(l.length), detalhe: `${pct(dividir(l.length, m.noBalcao), 0)} do balcão` },
        { rotulo: 'Operações', valor: inteiro(operacoes(l)) },
        { rotulo: 'Operadores', valor: inteiro(new Set(l.map((x) => x.idOperador)).size) }
      ],
      graficos: [
        graficoGrupos('op', 'Por operador', agrupar(l, (x) => x.idOperador, (x) => x.operador ?? 'Sem nome'), 'Itens', (g) => g.linhas.length, 'operador'),
        grafico('dia', 'Por dia da semana', 'bar', NOMES_DIA, [{ name: 'Itens', values: NOMES_DIA.map((_, d) => l.filter((x) => diaSemanaDe(x.dataHora) === d).length) }],
          { aoSelecionar: (d) => navegar('semana', String(d)), rotuloSelecao: 'Analisar o dia' })
      ],
      origem: origemMovimentacoes('fora-horario', 'Lançamentos fora do horário', l)
    };
  }
  if (qual === 'materiais') {
    const p = m.paretoMateriais;
    return {
      chave, eyebrow: 'Materiais', titulo: `${p.itens} de ${p.total} materiais fazem 80% do giro`, icone: 'pi pi-box',
      kpis: [
        { rotulo: 'Materiais movimentados', valor: inteiro(m.materiais.length) },
        { rotulo: 'Fazem 80% do giro', valor: inteiro(p.itens), detalhe: pct(p.fracao, 0) + ' dos materiais' },
        { rotulo: 'Mais movimentado', valor: m.materiais[0]?.codigo ?? '—', detalhe: m.materiais[0]?.descricao }
      ],
      graficos: [graficoGrupos('top', 'Materiais por número de movimentos', m.materiais.map((x) => ({ chave: x.idMaterial, rotulo: `${x.codigo} · ${x.descricao}`, linhas: x.linhas })),
        'Movimentos', (g) => g.linhas.length, 'material', { inteiro: true }, 20)],
      tabelas: [{ id: 'mat', titulo: 'Materiais', colunas: colMateriais, linhas: m.materiais, chaveLinha: (x) => x.idMaterial,
        aoAtivar: (x) => navegar('material', x.idMaterial), rotuloAcao: 'Analisar', nomeArquivo: 'almoxarifado-materiais-movimentados' }]
    };
  }
  return null;
}

function vistaNatureza(n: Natureza, m: ModeloMov, chave: string): VistaAnalise | null {
  const l = m.porNatureza[n];
  if (!l) return null;
  const i = NATUREZAS.indexOf(n);
  const vizinhas = NATUREZAS.filter((x) => m.porNatureza[x].length);
  const j = vizinhas.indexOf(n);
  const tipos = agrupar(l, (x) => x.tipo, (x) => ROTULO_TIPO_MOV[x.tipo]);
  return {
    chave, eyebrow: 'Natureza', titulo: ROTULO_NATUREZA[n], icone: 'pi pi-sitemap',
    descricao: DESCRICAO_NATUREZA[n],
    kpis: [
      { rotulo: 'Itens', valor: inteiro(l.length), detalhe: textoVariacao(l.length, m.porNaturezaAnt[n]) },
      { rotulo: 'Operações', valor: inteiro(operacoes(l)) },
      { rotulo: 'Materiais', valor: inteiro(new Set(l.map((x) => x.idMaterial)).size) },
      { rotulo: 'Participação', valor: pct(dividir(l.length, m.linhas.length), 0) }
    ],
    anterior: j > 0 ? { alvo: alvo('natureza', vizinhas[j - 1]), rotulo: ROTULO_NATUREZA[vizinhas[j - 1]] } : undefined,
    proximo: j >= 0 && j < vizinhas.length - 1 ? { alvo: alvo('natureza', vizinhas[j + 1]), rotulo: ROTULO_NATUREZA[vizinhas[j + 1]] } : undefined,
    graficos: [
      grafico('serie', `Itens por ${m.eixo.unidade}`, 'bar', m.serie.map((x) => x.rotulo), [{ name: ROTULO_NATUREZA[n], values: m.serie.map((x) => x.porNatureza[n]) }],
        { inteiro: true, aoSelecionar: (k) => (m.serie[k] ? navegar('periodo', m.serie[k].chave) : null), rotuloSelecao: 'Analisar o período' }),
      ...(tipos.length > 1 ? [graficoGrupos('tipo', 'Por tipo', tipos, 'Itens', (g) => g.linhas.length, 'tipo')] : []),
      ...graficosPadrao(l, true)
    ],
    origem: origemMovimentacoes(`nat-${i}`, ROTULO_NATUREZA[n], l)
  };
}

const DESCRICAO_NATUREZA: Record<Natureza, string> = {
  abastecimento: 'Entradas avulsas no almoxarifado: compras, aquisições extras, doações e ajustes de inventário para mais.',
  retorno: 'Material novo que volta ao almoxarifado: devoluções de obra e de equipe, estornos e transferências de volta.',
  'sucata-recebida': 'Sucata que chega ao almoxarifado vinda das equipes e das obras.',
  atendimento: 'Material que sai do almoxarifado para equipes e obras: entregas das solicitações e transferências.',
  baixa: 'Material que sai do almoxarifado sem ir para campo: perda, avaria, sucateamento, obsolescência e ajuste.',
  remanejamento: 'Transferências entre almoxarifados.',
  aplicacao: 'Material aplicado nas notas de serviço (consumo confirmado em campo).',
  'retirada-campo': 'Material retirado da rede em campo (sucata ou devolução) lançado no estoque da equipe ou da obra.',
  'outros-campo': 'Movimentos entre equipe e obra e estornos que não passam pelo almoxarifado.'
};

function vistaPeriodo(k: string, m: ModeloMov, chave: string): VistaAnalise | null {
  const i = m.serie.findIndex((x) => x.chave === k);
  if (i < 0) return null;
  const s = m.serie[i];
  const l = m.linhas.filter((x) => m.eixo.chaveDe(x.dataHora) === k);
  const media = m.serie.length ? m.linhas.length / m.serie.length : 0;
  const destaques: DestaqueAnalise[] = media && s.total > media * 1.5
    ? [{ icone: 'pi pi-arrow-up', tom: 'info', texto: `${pct(s.total / media - 1, 0)} acima da média por ${m.eixo.unidade} do período.` }] : [];
  return {
    chave, eyebrow: m.eixo.unidade === 'dia' ? 'Dia' : m.eixo.unidade === 'semana' ? 'Semana' : 'Mês', titulo: s.rotulo, icone: 'pi pi-calendar',
    kpis: kpisBase(l), destaques,
    anterior: i > 0 ? { alvo: alvo('periodo', m.serie[i - 1].chave), rotulo: m.serie[i - 1].rotulo } : undefined,
    proximo: i < m.serie.length - 1 ? { alvo: alvo('periodo', m.serie[i + 1].chave), rotulo: m.serie[i + 1].rotulo } : undefined,
    graficos: graficosPadrao(l),
    origem: origemMovimentacoes(`periodo-${k}`, `Movimentações de ${s.rotulo}`, l)
  };
}

function vistaAlmox(id: string, m: ModeloMov, chave: string): VistaAnalise | null {
  const g = m.almox.find((x) => x.chave === id);
  if (!g) return null;
  const l = g.linhas;
  const entradas = l.filter((x) => x.idDestino === id);
  const saidas = l.filter((x) => x.idOrigem === id);
  const i = m.almox.indexOf(g);
  return {
    chave, eyebrow: 'Almoxarifado', titulo: g.rotulo, icone: 'pi pi-warehouse',
    kpis: [
      { rotulo: 'Operações', valor: inteiro(operacoes(l)) },
      { rotulo: 'Entradas', valor: inteiro(entradas.length), detalhe: 'Itens que chegaram' },
      { rotulo: 'Saídas', valor: inteiro(saidas.length), detalhe: 'Itens que saíram' },
      { rotulo: 'Operadores', valor: inteiro(new Set(l.map((x) => x.idOperador)).size) }
    ],
    anterior: i > 0 ? { alvo: alvo('almox', m.almox[i - 1].chave), rotulo: m.almox[i - 1].rotulo } : undefined,
    proximo: i < m.almox.length - 1 ? { alvo: alvo('almox', m.almox[i + 1].chave), rotulo: m.almox[i + 1].rotulo } : undefined,
    graficos: [
      graficoGrupos('op', 'Por operador', agrupar(l, (x) => x.idOperador, (x) => x.operador ?? 'Sem nome'), 'Itens', (x) => x.linhas.length, 'operador'),
      ...graficosPadrao(l)
    ],
    origem: origemMovimentacoes(`almox-${id}`, `Movimentações de ${g.rotulo}`, l),
    links: [linkSaldoEstoque(id)]
  };
}

function vistaGrupo(chave: string, eyebrow: string, grupos: Grupo<MovimentacaoRelatorio>[], id: string, dim: string, icone: string,
                    m: ModeloMov): VistaAnalise | null {
  const g = grupos.find((x) => x.chave === id);
  if (!g) return null;
  const i = grupos.indexOf(g);
  const l = g.linhas;
  const lg = linhaGrupo(g);
  const destaques: DestaqueAnalise[] = [];
  if (lg.entregas >= 5 && lg.estornos / lg.entregas >= 0.15) {
    destaques.push({ icone: 'pi pi-replay', tom: 'warning', texto: `${pct(lg.estornos / lg.entregas, 0)} das entregas foram estornadas (média do recorte: ${pct(m.taxaEstorno, 0)}).` });
  }
  return {
    chave, eyebrow, titulo: g.rotulo, icone,
    kpis: [
      { rotulo: 'Operações', valor: inteiro(lg.operacoes), detalhe: `${pct(dividir(lg.operacoes, m.operacoes), 0)} do período` },
      { rotulo: 'Entregas', valor: inteiro(lg.entregas) },
      { rotulo: 'Retornos', valor: inteiro(lg.retornos) },
      { rotulo: 'Estornos', valor: inteiro(lg.estornos), tom: destaques.length ? 'warning' : undefined }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo(dim, grupos[i - 1].chave), rotulo: grupos[i - 1].rotulo } : undefined,
    proximo: i < grupos.length - 1 ? { alvo: alvo(dim, grupos[i + 1].chave), rotulo: grupos[i + 1].rotulo } : undefined,
    graficos: graficosPadrao(l),
    origem: origemMovimentacoes(`${dim}-${id}`, `Movimentações de ${g.rotulo}`, l)
  };
}

function vistaMotivo(motivo: string, m: ModeloMov, chave: string): VistaAnalise | null {
  const g = m.motivos.find((x) => x.chave === motivo);
  if (!g) return null;
  const l = g.linhas;
  const baixas = l.filter((x) => x.tipo === 'BAIXA_AVULSA');
  const entradas = l.filter((x) => x.tipo === 'ENTRADA_AVULSA');
  const mats = agrupar(l, (x) => x.idMaterial, (x) => `${x.codigo} · ${x.descricao}`);
  const repetidos = mats.filter((x) => x.linhas.length >= 2);
  return {
    chave, eyebrow: 'Motivo da avulsa', titulo: g.rotulo, icone: 'pi pi-tag',
    kpis: [
      { rotulo: 'Lançamentos', valor: inteiro(l.length) },
      { rotulo: 'Entradas', valor: inteiro(entradas.length) },
      { rotulo: 'Baixas', valor: inteiro(baixas.length) },
      { rotulo: 'Materiais', valor: inteiro(mats.length) }
    ],
    destaques: repetidos.length ? [{ icone: 'pi pi-refresh', tom: 'warning',
      texto: `${plural(repetidos.length, 'material aparece', 'materiais aparecem')} mais de uma vez com esse motivo: ${repetidos.slice(0, 3).map((x) => x.rotulo.split(' · ')[0]).join(', ')}.` }] : [],
    graficos: [
      graficoGrupos('mat', 'Por material', mats, 'Lançamentos', (x) => x.linhas.length, 'material'),
      graficoGrupos('op', 'Por operador', agrupar(l, (x) => x.idOperador, (x) => x.operador ?? 'Sem nome'), 'Lançamentos', (x) => x.linhas.length, 'operador'),
      graficoGrupos('alm', 'Por almoxarifado', agrupar(l, idAlmox, nomeAlmox), 'Lançamentos', (x) => x.linhas.length, 'almox')
    ],
    origem: origemMovimentacoes(`motivo-${motivo}`, `Avulsas: ${g.rotulo}`, l)
  };
}

function vistaMaterial(id: string, m: ModeloMov, chave: string): VistaAnalise | null {
  const x = m.materiais.find((y) => y.idMaterial === id);
  if (!x) return null;
  const i = m.materiais.indexOf(x);
  const l = x.linhas;
  const porPeriodo = m.serie.map((s) => ({
    entregue: soma(l.filter((y) => natureza(y) === 'atendimento' && m.eixo.chaveDe(y.dataHora) === s.chave), (y) => y.quantidade),
    retornado: soma(l.filter((y) => natureza(y) === 'retorno' && m.eixo.chaveDe(y.dataHora) === s.chave), (y) => y.quantidade)
  }));
  const destaques: DestaqueAnalise[] = [];
  if (x.taxaRetorno != null && x.taxaRetorno >= 0.3 && x.entregue > 0) {
    destaques.push({ icone: 'pi pi-undo', tom: 'warning', texto: `${pct(x.taxaRetorno, 0)} do que foi entregue voltou: as solicitações pedem mais do que se usa.` });
  }
  if (x.estornos >= 2) destaques.push({ icone: 'pi pi-replay', tom: 'warning', texto: `${plural(x.estornos, 'estorno', 'estornos')} no período.` });
  const ajustes = l.filter((y) => y.motivo === 'AJUSTE_INVENTARIO');
  if (ajustes.length >= 2) {
    destaques.push({ icone: 'pi pi-sliders-h', tom: 'warning',
      texto: `${plural(ajustes.length, 'ajuste', 'ajustes')} de inventário no período (${qtd(soma(ajustes.filter((y) => y.tipo === 'BAIXA_AVULSA'), (y) => y.quantidade), x.unidade)} baixado por divergência). Confira as saídas sem registro.` });
  }
  if (x.baixado > 0) destaques.push({ icone: 'pi pi-minus-circle', tom: 'info', texto: `${qtd(x.baixado, x.unidade)} baixado do almoxarifado no total.` });
  const eq = agrupar(l.filter((y) => natureza(y) === 'atendimento' && y.idEquipe), (y) => y.idEquipe, (y) => y.equipe, (g) => soma(g.linhas, (y) => y.quantidade));
  return {
    chave, eyebrow: 'Material', titulo: `${x.codigo} · ${x.descricao}`, icone: 'pi pi-box',
    kpis: [
      { rotulo: 'Entregue', valor: qtd(x.entregue, x.unidade) },
      { rotulo: 'Retornou', valor: qtd(x.retornado, x.unidade), detalhe: x.taxaRetorno != null ? `${pct(x.taxaRetorno, 0)} do entregue` : undefined },
      { rotulo: 'Ficou em campo', valor: qtd(x.liquido, x.unidade), detalhe: 'Entregue menos retornado' },
      { rotulo: 'Abastecido', valor: qtd(x.abastecido, x.unidade) }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('material', m.materiais[i - 1].idMaterial), rotulo: m.materiais[i - 1].codigo } : undefined,
    proximo: i < m.materiais.length - 1 ? { alvo: alvo('material', m.materiais[i + 1].idMaterial), rotulo: m.materiais[i + 1].codigo } : undefined,
    graficos: [
      grafico('fluxo', `Entregue × retornado por ${m.eixo.unidade}`, 'bar', m.serie.map((s) => s.rotulo),
        [{ name: 'Entregue', values: porPeriodo.map((p) => p.entregue) }, { name: 'Retornou', values: porPeriodo.map((p) => p.retornado) }],
        { inteiro: true }),
      graficoGrupos('eq', 'Quem recebeu (quantidade)', eq, 'Quantidade', (g) => soma(g.linhas, (y) => y.quantidade), 'equipe'),
      graficoGrupos('tipo', 'Por tipo de movimentação', agrupar(l, (y) => y.tipo, (y) => ROTULO_TIPO_MOV[y.tipo]), 'Itens', (g) => g.linhas.length, 'tipo')
    ],
    origem: origemMovimentacoes(`material-${id}`, `Movimentações de ${x.codigo}`, l),
    links: [linkMovimentacoesMaterial(x.codigo)],
    copiloto: { foco: { tipo: 'secao', id: `material.${id}`, rotulo: x.codigo },
      pergunta: `Analise o fluxo do material ${x.codigo} (${x.descricao}) no almoxarifado neste período: entregas, retornos, estornos e baixas. Há algo fora do normal?` }
  };
}
