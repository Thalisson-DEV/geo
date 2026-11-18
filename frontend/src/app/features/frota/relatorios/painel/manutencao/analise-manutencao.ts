import { CesDataTableColumn, CesTone } from '@ces/ui';
import { of } from 'rxjs';

import {
  DetalheManutencaoFrota,
  OsAbertaDetalheFrota,
  OsDetalheFrota,
  RelatorioGerencialFrota
} from '../../../../../core/models/frota-relatorios.models';
import {
  DestaqueAnalise,
  DetalheRegistro,
  GraficoAnalise,
  KpiAnalise,
  OrigemAnalise,
  TabelaAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { LIMITES_FROTA } from '../../frota-relatorios-gerenciais.visao';
import {
  Grupo,
  ROTULO_CAUSA,
  ROTULO_CRITICIDADE,
  ROTULO_OFICINA,
  ROTULO_ORIGEM_OS,
  ROTULO_SITUACAO_OS,
  ROTULO_TIPO_MANUTENCAO,
  agrupar,
  alvo,
  dataBr,
  dividir,
  grafico,
  inteiro,
  linkOs,
  linkVeiculo,
  media,
  mesDe,
  mesesDoPeriodo,
  moeda,
  moedaCurta,
  navegar,
  numero,
  pct,
  plural,
  rotulo,
  rotuloMes,
  soma,
  textoVariacao
} from '../frota-analise-comum';

export interface FiltrosManutencao {
  tipo: string[];
  criticidade: string[];
  oficina: string[];
  origem: string[];
}

export const FAIXAS_FILA = [
  { chave: 'ate7', rotulo: 'Até 7 dias', aceita: (d: number) => d <= 7 },
  { chave: '8a30', rotulo: '8 a 30 dias', aceita: (d: number) => d > 7 && d <= 30 },
  { chave: 'acima30', rotulo: 'Mais de 30 dias', aceita: (d: number) => d > 30 }
] as const;

export interface ItemManutencao {
  item: string;
  tipo: string;
  os: OsDetalheFrota[];
  veiculos: number;
  retrabalhos: number;
  valor: number;
}

export interface OficinaManutencao {
  nome: string;
  os: OsDetalheFrota[];
  valor: number;
  ticket: number | null;
  horas: number | null;
  retrabalhos: number;
  corretivas: number;
}

export interface VeiculoManutencao {
  idVeiculo: string;
  placa: string;
  tipo: string | null;
  base: string | null;
  os: OsDetalheFrota[];
  corretivas: number;
  preventivas: number;
  valor: number;
  horasParado: number | null;
  disponibilidade: number | null;
  preventivasVencidas: number;
  abertas: number;
}

export interface ModeloManutencao {
  r: RelatorioGerencialFrota;
  filtrado: boolean;
  os: OsDetalheFrota[];
  anterior: OsDetalheFrota[];
  corretivas: OsDetalheFrota[];
  abertas: OsAbertaDetalheFrota[];
  valor: number;
  valorAnterior: number;
  percPreventiva: number | null;
  percPreventivaAnterior: number | null;
  mttr: number | null;
  mttrAnterior: number | null;
  mtbf: number | null;
  esperaInicio: number | null;
  ticket: number | null;
  ticketAnterior: number | null;
  pecas: number;
  servicos: number;
  baixaPendente: OsDetalheFrota[];
  retrabalho: OsDetalheFrota[];
  idsRetrabalho: Set<string>;
  meses: string[];
  mensal: { mes: string; corretivas: number; preventivas: number; valor: number }[];
  porCausa: Grupo<OsDetalheFrota>[];
  porOrigem: Grupo<OsDetalheFrota>[];
  oficinas: OficinaManutencao[];
  itens: ItemManutencao[];
  pecasTop: { descricao: string; quantidade: number; valor: number; os: number }[];
  mecanicos: { nome: string; servicos: number; valor: number; os: number }[];
  veiculos: VeiculoManutencao[];
  fila: { faixa: (typeof FAIXAS_FILA)[number]; abertas: OsAbertaDetalheFrota[] }[];
  atrasadas: OsAbertaDetalheFrota[];
  paradas: OsAbertaDetalheFrota[];
}

const aceita = (sel: string[], v: string | null | undefined) => !sel.length || (v != null && sel.includes(v));

export function modeloManutencao(r: RelatorioGerencialFrota, d: DetalheManutencaoFrota, f: FiltrosManutencao): ModeloManutencao {
  const passa = (o: { tipoManutencao: string; criticidade: string; tipoOficina: string; origem: string }) =>
    aceita(f.tipo, o.tipoManutencao) && aceita(f.criticidade, o.criticidade) && aceita(f.oficina, o.tipoOficina) && aceita(f.origem, o.origem);
  const os = d.concluidas.filter(passa);
  const anterior = d.concluidasAnterior.filter(passa);
  const abertas = d.abertas.filter(passa);
  const ids = new Set(os.map((o) => o.id));
  const itens = d.itens.filter((i) => ids.has(i.idOs));
  const idsRetrabalho = new Set(itens.filter((i) => i.retrabalho).map((i) => i.idOs));

  const corretivas = os.filter((o) => o.tipoManutencao === 'CORRETIVA');
  const corretivasAnt = anterior.filter((o) => o.tipoManutencao === 'CORRETIVA');
  const perc = (l: OsDetalheFrota[]) => (l.length ? l.filter((o) => o.tipoManutencao === 'PREVENTIVA').length / l.length : null);
  const valor = soma(os, (o) => o.valor);
  const valorAnterior = soma(anterior, (o) => o.valor);
  const dias = r.periodo.dias;

  const meses = mesesDoPeriodo(r);
  const mensal = meses.map((mes) => {
    const doMes = os.filter((o) => mesDe(o.fimReal) === mes);
    return { mes, corretivas: doMes.filter((o) => o.tipoManutencao === 'CORRETIVA').length,
      preventivas: doMes.filter((o) => o.tipoManutencao !== 'CORRETIVA').length, valor: soma(doMes, (o) => o.valor) };
  });

  const porItem = new Map<string, ItemManutencao>();
  const osPorId = new Map(os.map((o) => [o.id, o]));
  for (const i of itens) {
    let it = porItem.get(i.item);
    if (!it) porItem.set(i.item, (it = { item: i.item, tipo: i.tipo, os: [], veiculos: 0, retrabalhos: 0, valor: 0 }));
    const o = osPorId.get(i.idOs);
    if (o && !it.os.includes(o)) it.os.push(o);
    if (i.retrabalho) it.retrabalhos++;
  }
  for (const it of porItem.values()) {
    it.veiculos = new Set(it.os.map((o) => o.idVeiculo)).size;
    it.valor = soma(it.os, (o) => o.valor);
  }

  const oficinas = agrupar(os, (o) => o.oficina, (o) => o.oficina, (g) => soma(g.linhas, (o) => o.valor)).map((g) => ({
    nome: g.rotulo, os: g.linhas, valor: soma(g.linhas, (o) => o.valor), ticket: dividir(soma(g.linhas, (o) => o.valor), g.linhas.length),
    horas: media(g.linhas.map((o) => o.horasReparo)), retrabalhos: g.linhas.filter((o) => idsRetrabalho.has(o.id)).length,
    corretivas: g.linhas.filter((o) => o.tipoManutencao === 'CORRETIVA').length
  }));

  const pecasOs = d.pecas.filter((p) => ids.has(p.idOs));
  const pecasTop = agrupar(pecasOs, (p) => p.descricao.trim().toUpperCase(), (p) => p.descricao.trim(), (g) => soma(g.linhas, (p) => p.valor))
    .slice(0, 30).map((g) => ({ descricao: g.rotulo, quantidade: soma(g.linhas, (p) => p.quantidade), valor: soma(g.linhas, (p) => p.valor),
      os: new Set(g.linhas.map((p) => p.idOs)).size }));
  const servicosOs = d.servicos.filter((s) => ids.has(s.idOs));
  const mecanicos = agrupar(servicosOs, (s) => s.mecanico?.trim().toUpperCase() ?? null, (s) => s.mecanico?.trim() ?? 'Sem mecânico',
    (g) => g.linhas.length).map((g) => ({ nome: g.rotulo, servicos: g.linhas.length, valor: soma(g.linhas, (s) => s.valor),
      os: new Set(g.linhas.map((s) => s.idOs)).size }));

  const veiculos: VeiculoManutencao[] = r.veiculos.map((v) => {
    const doVeiculo = os.filter((o) => o.idVeiculo === v.idVeiculo);
    return {
      idVeiculo: v.idVeiculo, placa: v.placa, tipo: v.tipo, base: v.base, os: doVeiculo,
      corretivas: doVeiculo.filter((o) => o.tipoManutencao === 'CORRETIVA').length,
      preventivas: doVeiculo.filter((o) => o.tipoManutencao !== 'CORRETIVA').length,
      valor: soma(doVeiculo, (o) => o.valor), horasParado: v.horasParado, disponibilidade: v.disponibilidade,
      preventivasVencidas: v.preventivasVencidas, abertas: abertas.filter((o) => o.idVeiculo === v.idVeiculo).length
    };
  }).sort((a, b) => b.corretivas - a.corretivas || (b.horasParado ?? 0) - (a.horasParado ?? 0) || b.valor - a.valor);

  return {
    r, filtrado: !!(f.tipo.length || f.criticidade.length || f.oficina.length || f.origem.length),
    os, anterior, corretivas, abertas, valor, valorAnterior,
    percPreventiva: perc(os), percPreventivaAnterior: perc(anterior),
    mttr: media(corretivas.map((o) => o.horasReparo)), mttrAnterior: media(corretivasAnt.map((o) => o.horasReparo)),
    mtbf: corretivas.length && r.recorte.emOperacao ? (r.recorte.emOperacao * dias) / corretivas.length : null,
    esperaInicio: media(os.map((o) => o.diasAteInicio)),
    ticket: dividir(valor, os.length), ticketAnterior: dividir(valorAnterior, anterior.length),
    pecas: soma(os, (o) => o.valorPecas), servicos: soma(os, (o) => o.valorServicos),
    baixaPendente: os.filter((o) => o.baixaPendente),
    retrabalho: os.filter((o) => idsRetrabalho.has(o.id)), idsRetrabalho,
    meses, mensal,
    porCausa: agrupar(corretivas, (o) => o.causa ?? 'SEM_CAUSA', (o) => rotulo(ROTULO_CAUSA, o.causa ?? 'SEM_CAUSA')),
    porOrigem: agrupar(os, (o) => o.origem, (o) => rotulo(ROTULO_ORIGEM_OS, o.origem)),
    oficinas,
    itens: [...porItem.values()].sort((a, b) => b.os.length - a.os.length || b.valor - a.valor),
    pecasTop, mecanicos, veiculos,
    fila: FAIXAS_FILA.map((faixa) => ({ faixa, abertas: abertas.filter((o) => faixa.aceita(o.diasAberta)) })),
    atrasadas: abertas.filter((o) => o.atrasada),
    paradas: abertas.filter((o) => o.veiculoParado).sort((a, b) => b.diasAberta - a.diasAberta)
  };
}

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoManutencao(m: ModeloManutencao): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const l: LeituraGerencial[] = [];
  const disp = m.r.manutencao?.disponibilidade.atual ?? null;
  if (disp != null && disp < LIMITES_FROTA.disponibilidadeAtencao) {
    l.push({ id: 'disp', tom: disp < LIMITES_FROTA.disponibilidadeCritica ? 'danger' : 'warning', icone: 'pi pi-check-circle',
      titulo: 'Disponibilidade abaixo de 95%', valor: pct(disp),
      texto: `${plural(m.paradas.length, 'veículo parado', 'veículos parados')} agora por manutenção${m.paradas[0] ? `; o mais antigo é ${m.paradas[0].placa}, há ${m.paradas[0].diasAberta} dias` : ''}.`,
      acao: { rotulo: 'Ver os parados', alvo: alvo('kpi', 'parados') } });
  }
  if (m.percPreventiva != null && m.percPreventiva < LIMITES_FROTA.preventivaBoa && !m.filtrado) {
    const venc = m.r.manutencao?.preventivasVencidas ?? 0;
    l.push({ id: 'prev', tom: m.percPreventiva < LIMITES_FROTA.preventivaMinima ? 'warning' : 'info', icone: 'pi pi-calendar-clock',
      titulo: 'A frota está quebrando mais do que se cuidando', valor: pct(m.percPreventiva),
      texto: `Só ${pct(m.percPreventiva)} das OS foram preventivas (referência: 70%). ${venc ? `${plural(venc, 'preventiva está vencida', 'preventivas estão vencidas')} hoje.` : ''}`,
      acao: { rotulo: 'Ver corretivas', alvo: alvo('tipo', 'CORRETIVA') } });
  }
  const acima30 = m.fila.find((x) => x.faixa.chave === 'acima30')!.abertas;
  if (acima30.length) {
    l.push({ id: 'fila', tom: 'warning', icone: 'pi pi-inbox', titulo: 'OS paradas na fila', valor: inteiro(acima30.length),
      texto: `${plural(acima30.length, 'OS aberta', 'OS abertas')} há mais de 30 dias${m.atrasadas.length ? ` e ${plural(m.atrasadas.length, 'atrasada', 'atrasadas')} sobre a previsão` : ''}. Feche, cancele ou cobre a oficina.`,
      acao: { rotulo: 'Ver a fila', alvo: alvo('faixa', 'acima30') } });
  }
  if (m.retrabalho.length) {
    const ofi = [...m.oficinas].sort((a, b) => b.retrabalhos - a.retrabalhos)[0];
    l.push({ id: 'retrabalho', tom: 'warning', icone: 'pi pi-replay', titulo: 'Retrabalho em 30 dias', valor: inteiro(m.retrabalho.length),
      texto: `O mesmo item voltou no mesmo veículo em até 30 dias${ofi?.retrabalhos ? `; ${ofi.nome} concentra ${ofi.retrabalhos}` : ''}. ${moeda(soma(m.retrabalho, (o) => o.valor))} gastos de novo.`,
      acao: { rotulo: 'Ver o retrabalho', alvo: alvo('kpi', 'retrabalho') } });
  }
  const uso = m.porCausa.find((g) => g.chave === 'USO_INDEVIDO' || g.chave === 'AVARIA');
  if (uso && m.corretivas.length && uso.linhas.length / m.corretivas.length >= 0.15) {
    l.push({ id: 'causa', tom: 'warning', icone: 'pi pi-user', titulo: 'Corretivas por uso indevido ou avaria', valor: pct(uso.linhas.length / m.corretivas.length, 0),
      texto: `${plural(uso.linhas.length, 'corretiva causada', 'corretivas causadas')} pela operação (${moeda(soma(uso.linhas, (o) => o.valor))}). Pede conversa com as equipes e, se for o caso, medida disciplinar.`,
      acao: { rotulo: 'Ver as OS', alvo: alvo('causa', uso.chave) } });
  }
  const reincidente = m.veiculos.find((v) => v.corretivas >= 3);
  if (reincidente) {
    l.push({ id: 'reincidente', tom: 'warning', icone: 'pi pi-car', titulo: 'Veículo que não sai da oficina', valor: `${reincidente.corretivas} corretivas`,
      texto: `${reincidente.placa} teve ${reincidente.corretivas} corretivas (${moeda(reincidente.valor)}). Avalie diagnóstico, substituição ou devolução.`,
      acao: { rotulo: `Analisar ${reincidente.placa}`, alvo: alvo('veiculo', reincidente.idVeiculo) } });
  }
  if (m.mttr != null && m.mttr > 48) {
    const lenta = [...m.oficinas].filter((o) => o.horas != null && o.os.length >= 2).sort((a, b) => (b.horas ?? 0) - (a.horas ?? 0))[0];
    l.push({ id: 'mttr', tom: 'warning', icone: 'pi pi-stopwatch', titulo: 'Reparo demorado', valor: `${numero(m.mttr)} h`,
      texto: `Cada corretiva tira o veículo de operação por ${numero(m.mttr / 24)} dias em média.${lenta ? ` ${lenta.nome} é a mais lenta (${numero(lenta.horas)} h por OS).` : ''}`,
      acao: { rotulo: 'Ver o tempo de reparo', alvo: alvo('kpi', 'mttr') } });
  }
  if (m.esperaInicio != null && m.esperaInicio > 3) {
    l.push({ id: 'espera', tom: 'info', icone: 'pi pi-hourglass', titulo: 'Demora para começar', valor: `${numero(m.esperaInicio)} dias`,
      texto: 'Tempo médio entre abrir a OS e começar o serviço. Agendar mais rápido devolve o veículo antes.',
      acao: { rotulo: 'Ver a espera', alvo: alvo('kpi', 'espera') } });
  }
  const item = m.itens[0];
  if (item && item.os.length >= 3) {
    l.push({ id: 'item', tom: 'info', icone: 'pi pi-cog', titulo: 'Item que mais aparece', valor: `${item.os.length} OS`,
      texto: `${item.item} entrou em ${plural(item.os.length, 'OS', 'OS')} de ${plural(item.veiculos, 'veículo', 'veículos')}. Bom candidato a plano preventivo ou a compra em volume.`,
      acao: { rotulo: 'Analisar o item', alvo: alvo('item', item.item) } });
  }
  if (m.baixaPendente.length) {
    l.push({ id: 'baixa', tom: 'info', icone: 'pi pi-file-check', titulo: 'Concluídas com valores pendentes', valor: inteiro(m.baixaPendente.length),
      texto: 'OS concluídas com serviço ou peça ainda sem valor (o custo pode mudar).',
      acao: { rotulo: 'Ver as OS', alvo: alvo('kpi', 'baixa') } });
  }

  const tom: CesTone = disp != null && disp < LIMITES_FROTA.disponibilidadeCritica ? 'danger'
    : l.some((x) => x.tom === 'warning' || x.tom === 'danger') ? 'warning' : 'success';
  return {
    veredito: {
      tom, rotulo: tom === 'danger' ? 'Agir agora' : tom === 'warning' ? 'Acompanhar' : 'Sob controle',
      titulo: tom === 'danger' ? 'Muitos veículos parados' : tom === 'warning' ? 'Manutenção pede atenção' : 'Manutenção sob controle',
      texto: `${plural(m.os.length, 'OS concluída', 'OS concluídas')} (${moeda(m.valor)})${m.percPreventiva != null ? `, ${pct(m.percPreventiva)} preventivas` : ''}, `
        + `${plural(m.abertas.length, 'OS aberta', 'OS abertas')} e ${plural(m.paradas.length, 'veículo parado', 'veículos parados')} agora.`,
      progresso: disp != null ? { valor: disp * 100, rotulo: `Disponibilidade ${pct(disp)}`, marcador: 95, rotuloMarcador: 'Meta 95%' } : undefined
    },
    leituras: l,
    pergunta: 'Faça a leitura gerencial da manutenção da frota neste recorte: o que está tirando veículo de operação, quanto custa e as 3 ações prioritárias.'
  };
}

// ── Análises ─────────────────────────────────────────────────────────────────────────────────────

const colOs: CesDataTableColumn<OsDetalheFrota>[] = [
  { key: 'numero', header: 'OS', type: 'custom', priority: 1, value: (o) => o.numero ?? 0, display: (o) => (o.numero ? `#${o.numero}` : '—') },
  { key: 'placa', header: 'Veículo', priority: 1, value: (o) => o.placa ?? '—' },
  { key: 'tipoManutencao', header: 'Tipo', priority: 2, value: (o) => rotulo(ROTULO_TIPO_MANUTENCAO, o.tipoManutencao) },
  { key: 'causa', header: 'Causa', priority: 3, value: (o) => (o.tipoManutencao === 'CORRETIVA' ? rotulo(ROTULO_CAUSA, o.causa ?? 'SEM_CAUSA') : '—') },
  { key: 'oficina', header: 'Oficina', priority: 3 },
  { key: 'fimReal', header: 'Concluída em', type: 'date', priority: 2 },
  { key: 'horasReparo', header: 'Horas', type: 'number', priority: 3 },
  { key: 'valor', header: 'Valor', type: 'currency', priority: 1 }
];

const colAbertas: CesDataTableColumn<OsAbertaDetalheFrota>[] = [
  { key: 'numero', header: 'OS', type: 'custom', priority: 1, value: (o) => o.numero ?? 0, display: (o) => (o.numero ? `#${o.numero}` : '—') },
  { key: 'placa', header: 'Veículo', priority: 1, value: (o) => o.placa ?? '—' },
  { key: 'situacao', header: 'Situação', priority: 2, value: (o) => rotulo(ROTULO_SITUACAO_OS, o.situacao) + (o.atrasada ? ' · atrasada' : '') },
  { key: 'criticidade', header: 'Criticidade', priority: 2, value: (o) => rotulo(ROTULO_CRITICIDADE, o.criticidade) },
  { key: 'diasAberta', header: 'Dias aberta', type: 'integer', priority: 1 },
  { key: 'veiculoParado', header: 'Veículo parado', type: 'custom', priority: 2, value: (o) => (o.veiculoParado ? 1 : 0), display: (o) => (o.veiculoParado ? 'Sim' : 'Não') }
];

function detalharOs(o: OsDetalheFrota): DetalheRegistro {
  return {
    titulo: `OS ${o.numero ? `#${o.numero}` : ''} · ${o.placa ?? ''}`, subtitulo: `${rotulo(ROTULO_TIPO_MANUTENCAO, o.tipoManutencao)} · ${o.oficina}`,
    campos: [
      { rotulo: 'Valor', valor: moeda(o.valor), icone: 'pi pi-wallet' },
      { rotulo: 'Peças / serviços', valor: `${moeda(o.valorPecas)} / ${moeda(o.valorServicos)}` },
      { rotulo: 'Aberta em', valor: dataBr(o.abertaEm) },
      { rotulo: 'Concluída em', valor: dataBr(o.fimReal) },
      { rotulo: 'Tempo de reparo', valor: o.horasReparo != null ? `${numero(o.horasReparo)} h` : '—' },
      { rotulo: 'Origem', valor: rotulo(ROTULO_ORIGEM_OS, o.origem) },
      { rotulo: 'Causa', valor: o.tipoManutencao === 'CORRETIVA' ? rotulo(ROTULO_CAUSA, o.causa ?? 'SEM_CAUSA') : '—' },
      { rotulo: 'Descrição', valor: o.descricao ?? '—' }
    ],
    links: [linkOs(o.id), linkVeiculo(o.idVeiculo, 'manutencoes')]
  };
}

function origemOs(chave: string, titulo: string, linhas: OsDetalheFrota[]): OrigemAnalise<OsDetalheFrota> {
  return {
    chave: `os:${chave}`, titulo, rotuloAba: 'Ordens de serviço', icone: 'pi pi-wrench', colunas: colOs,
    carregar: () => of({ linhas, total: linhas.length }), chaveLinha: (o) => o.id, rotuloLinha: (o) => `OS ${o.numero ?? ''} ${o.placa ?? ''}`,
    conferencia: { quantidadeEsperada: linhas.length, valorEsperado: soma(linhas, (o) => o.valor), somar: (o) => o.valor, formato: 'moeda' },
    derivados: (ls) => {
      const g = agrupar(ls, (o) => o.placa, (o) => o.placa ?? '—').slice(0, 10);
      return [grafico('os-veic', 'OS por veículo', 'bar-horizontal', g.map((x) => x.rotulo), [{ name: 'OS', values: g.map((x) => x.linhas.length) }], { formato: 'integer' })];
    },
    detalhar: detalharOs, nomeArquivo: `frota-os-${chave}`, vazio: 'Nenhuma OS neste recorte.'
  };
}

function origemAbertas(chave: string, titulo: string, linhas: OsAbertaDetalheFrota[]): OrigemAnalise<OsAbertaDetalheFrota> {
  return {
    id: 'abertas', chave: `abertas:${chave}`, titulo, rotuloAba: 'OS abertas', icone: 'pi pi-inbox', colunas: colAbertas,
    carregar: () => of({ linhas, total: linhas.length }), chaveLinha: (o) => o.id, rotuloLinha: (o) => `OS ${o.numero ?? ''} ${o.placa ?? ''}`,
    detalhar: (o) => ({
      titulo: `OS ${o.numero ? `#${o.numero}` : ''} · ${o.placa ?? ''}`, subtitulo: rotulo(ROTULO_SITUACAO_OS, o.situacao),
      campos: [
        { rotulo: 'Aberta há', valor: plural(o.diasAberta, 'dia', 'dias') },
        { rotulo: 'Criticidade', valor: rotulo(ROTULO_CRITICIDADE, o.criticidade) },
        { rotulo: 'Agendada para', valor: dataBr(o.agendadaPara) },
        { rotulo: 'Previsão de término', valor: dataBr(o.previsaoTermino) + (o.atrasada ? ' (atrasada)' : '') },
        { rotulo: 'Oficina', valor: o.oficina },
        { rotulo: 'Descrição', valor: o.descricao ?? '—' }
      ],
      links: [linkOs(o.id), linkVeiculo(o.idVeiculo, 'manutencoes')]
    }),
    nomeArquivo: `frota-os-abertas-${chave}`, vazio: 'Nenhuma OS aberta.'
  };
}

function graficoMensal(m: ModeloManutencao, os: OsDetalheFrota[]): GraficoAnalise {
  const c = m.meses.map((mes) => os.filter((o) => mesDe(o.fimReal) === mes && o.tipoManutencao === 'CORRETIVA').length);
  const p = m.meses.map((mes) => os.filter((o) => mesDe(o.fimReal) === mes && o.tipoManutencao !== 'CORRETIVA').length);
  return grafico('mensal', 'OS por mês', 'bar-stacked', m.meses.map(rotuloMes), [{ name: 'Corretivas', values: c }, { name: 'Preventivas', values: p }],
    { formato: 'integer', aoSelecionar: (i) => navegar('mes', m.meses[i]), rotuloSelecao: 'Analisar o mês' });
}

function graficoVeiculosOs(os: OsDetalheFrota[]): GraficoAnalise {
  const g = agrupar(os, (o) => o.idVeiculo, (o) => o.placa ?? '—').slice(0, 12);
  return grafico('veic', 'Veículos', 'bar-horizontal', g.map((x) => x.rotulo), [{ name: 'OS', values: g.map((x) => x.linhas.length) }],
    { formato: 'integer', altura: Math.max(200, g.length * 28), aoSelecionar: (i) => (g[i] ? navegar('veiculo', g[i].chave) : null), rotuloSelecao: 'Analisar o veículo' });
}

function vistaDeOs(chave: string, eyebrow: string, titulo: string, os: OsDetalheFrota[], m: ModeloManutencao, extra: Partial<VistaAnalise> = {}): VistaAnalise {
  const corr = os.filter((o) => o.tipoManutencao === 'CORRETIVA');
  const kpis: KpiAnalise[] = [
    { rotulo: 'OS', valor: inteiro(os.length), detalhe: `${corr.length} corretivas` },
    { rotulo: 'Valor', valor: moeda(soma(os, (o) => o.valor)), detalhe: `${pct(dividir(soma(os, (o) => o.valor), m.valor))} da manutenção` },
    { rotulo: 'Valor por OS', valor: moeda(dividir(soma(os, (o) => o.valor), os.length)) },
    { rotulo: 'Reparo médio', valor: media(corr.map((o) => o.horasReparo)) != null ? `${numero(media(corr.map((o) => o.horasReparo)))} h` : '—' }
  ];
  return {
    chave, eyebrow, titulo, icone: 'pi pi-wrench', kpis,
    graficos: [graficoMensal(m, os), graficoVeiculosOs(os)],
    origem: origemOs(chave, `OS: ${titulo}`, os),
    ...extra
  };
}

export function vistaManutencao(a: { dimension: string; value: string }, m: ModeloManutencao): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  const v = a.value;
  switch (a.dimension) {
    case 'kpi': return vistaKpi(v, m, chave);
    case 'tipo': return vistaDeOs(chave, 'Tipo de manutenção', rotulo(ROTULO_TIPO_MANUTENCAO, v), m.os.filter((o) => o.tipoManutencao === v), m);
    case 'causa': {
      const g = m.porCausa.find((x) => x.chave === v);
      return g ? vistaDeOs(chave, 'Causa da corretiva', g.rotulo, g.linhas, m) : null;
    }
    case 'origem': {
      const g = m.porOrigem.find((x) => x.chave === v);
      return g ? vistaDeOs(chave, 'Origem da OS', g.rotulo, g.linhas, m, {
        destaques: v === 'CHECKLIST' || v === 'INSPECAO' ? [{ icone: 'pi pi-thumbs-up', tom: 'success', texto: 'Problema achado antes de quebrar: é o caminho certo.' }] : undefined
      }) : null;
    }
    case 'mes': {
      const i = m.meses.indexOf(v);
      if (i < 0) return null;
      return vistaDeOs(chave, 'Mês', rotuloMes(v), m.os.filter((o) => mesDe(o.fimReal) === v), m, {
        anterior: i > 0 ? { alvo: alvo('mes', m.meses[i - 1]), rotulo: rotuloMes(m.meses[i - 1]) } : undefined,
        proximo: i < m.meses.length - 1 ? { alvo: alvo('mes', m.meses[i + 1]), rotulo: rotuloMes(m.meses[i + 1]) } : undefined
      });
    }
    case 'oficina': {
      const o = m.oficinas.find((x) => x.nome === v);
      if (!o) return null;
      const vista = vistaDeOs(chave, 'Oficina', o.nome, o.os, m);
      const mediaFrota = m.mttr;
      return { ...vista, icone: 'pi pi-building',
        kpis: [...vista.kpis, { rotulo: 'Retrabalho', valor: inteiro(o.retrabalhos), tom: o.retrabalhos ? 'warning' : undefined,
          detalhe: o.corretivas ? `${pct(o.retrabalhos / o.corretivas)} das corretivas` : undefined }],
        destaques: o.horas != null && mediaFrota != null && o.horas > mediaFrota * 1.3
          ? [{ icone: 'pi pi-stopwatch', tom: 'warning', texto: `Demora ${pct(o.horas / mediaFrota - 1, 0)} mais que a média da frota por OS.` }] : undefined };
    }
    case 'item': {
      const it = m.itens.find((x) => x.item === v);
      if (!it) return null;
      const vista = vistaDeOs(chave, 'Item de manutenção', it.item, it.os, m);
      return { ...vista, icone: 'pi pi-cog', destaques: [
        { icone: 'pi pi-car', tom: 'info', texto: `Apareceu em ${plural(it.veiculos, 'veículo', 'veículos')}.` },
        ...(it.retrabalhos ? [{ icone: 'pi pi-replay', tom: 'warning' as CesTone, texto: `${plural(it.retrabalhos, 'vez voltou', 'vezes voltou')} em até 30 dias no mesmo veículo.` }] : [])
      ] };
    }
    case 'faixa': {
      const f = m.fila.find((x) => x.faixa.chave === v);
      if (!f) return null;
      return filaVista(chave, `Fila: ${f.faixa.rotulo.toLowerCase()}`, f.abertas);
    }
    case 'criticidade': {
      const ab = m.abertas.filter((o) => o.criticidade === v);
      return filaVista(chave, `Fila: criticidade ${rotulo(ROTULO_CRITICIDADE, v).toLowerCase()}`, ab);
    }
    case 'veiculo': return vistaVeiculo(v, m, chave);
    default: return null;
  }
}

function filaVista(chave: string, titulo: string, abertas: OsAbertaDetalheFrota[]): VistaAnalise {
  const crit = agrupar(abertas, (o) => o.criticidade, (o) => rotulo(ROTULO_CRITICIDADE, o.criticidade));
  const veic = agrupar(abertas, (o) => o.idVeiculo, (o) => o.placa ?? '—').slice(0, 12);
  return {
    chave, eyebrow: 'OS abertas', titulo, icone: 'pi pi-inbox',
    kpis: [
      { rotulo: 'OS abertas', valor: inteiro(abertas.length) },
      { rotulo: 'Atrasadas', valor: inteiro(abertas.filter((o) => o.atrasada).length), tom: abertas.some((o) => o.atrasada) ? 'warning' : undefined },
      { rotulo: 'Com veículo parado', valor: inteiro(abertas.filter((o) => o.veiculoParado).length) },
      { rotulo: 'Idade média', valor: `${numero(media(abertas.map((o) => o.diasAberta)))} dias` }
    ],
    graficos: [
      grafico('crit', 'Por criticidade', 'doughnut', crit.map((g) => g.rotulo), [{ name: 'OS', values: crit.map((g) => g.linhas.length) }], { formato: 'integer' }),
      grafico('veic', 'Por veículo', 'bar-horizontal', veic.map((g) => g.rotulo), [{ name: 'OS', values: veic.map((g) => g.linhas.length) }],
        { formato: 'integer', aoSelecionar: (i) => (veic[i] ? navegar('veiculo', veic[i].chave) : null), rotuloSelecao: 'Analisar o veículo' })
    ],
    origem: origemAbertas(chave, titulo, [...abertas].sort((a, b) => b.diasAberta - a.diasAberta))
  };
}

function vistaKpi(qual: string, m: ModeloManutencao, chave: string): VistaAnalise | null {
  switch (qual) {
    case 'os':
      return vistaDeOs(chave, 'OS concluídas', 'Todas as OS concluídas no período', m.os, m, {
        kpis: [
          { rotulo: 'OS', valor: inteiro(m.os.length), detalhe: textoVariacao(m.os.length, m.anterior.length || null) },
          { rotulo: 'Corretivas', valor: inteiro(m.corretivas.length) },
          { rotulo: 'Preventivas', valor: inteiro(m.os.length - m.corretivas.length), detalhe: pct(m.percPreventiva) },
          { rotulo: 'Valor', valor: moeda(m.valor), detalhe: textoVariacao(m.valor, m.valorAnterior || null, 'moeda') }
        ]
      });
    case 'custo': {
      const porTipo = agrupar(m.os, (o) => o.tipoManutencao, (o) => rotulo(ROTULO_TIPO_MANUTENCAO, o.tipoManutencao), (g) => soma(g.linhas, (o) => o.valor));
      const vista = vistaDeOs(chave, 'Custo de manutenção', 'Para onde vai o dinheiro da oficina', [...m.os].sort((a, b) => b.valor - a.valor), m);
      return { ...vista, kpis: [
        { rotulo: 'Valor', valor: moeda(m.valor), detalhe: textoVariacao(m.valor, m.valorAnterior || null, 'moeda') },
        { rotulo: 'Valor por OS', valor: moeda(m.ticket), detalhe: textoVariacao(m.ticket, m.ticketAnterior, 'moeda') },
        { rotulo: 'Peças', valor: moeda(m.pecas), detalhe: pct(dividir(m.pecas, m.pecas + m.servicos)) },
        { rotulo: 'Serviços', valor: moeda(m.servicos), detalhe: pct(dividir(m.servicos, m.pecas + m.servicos)) }
      ], graficos: [
        grafico('tipo', 'Por tipo de manutenção', 'doughnut', porTipo.map((g) => g.rotulo), [{ name: 'Valor', values: porTipo.map((g) => soma(g.linhas, (o) => o.valor)) }],
          { formato: 'currency', aoSelecionar: (i) => (porTipo[i] ? navegar('tipo', porTipo[i].chave) : null), rotuloSelecao: 'Analisar o tipo' }),
        grafico('ofi', 'Por oficina', 'bar-horizontal', m.oficinas.slice(0, 10).map((o) => o.nome), [{ name: 'Valor', values: m.oficinas.slice(0, 10).map((o) => o.valor) }],
          { formato: 'currency', aoSelecionar: (i) => (m.oficinas[i] ? navegar('oficina', m.oficinas[i].nome) : null), rotuloSelecao: 'Analisar a oficina' })
      ] };
    }
    case 'mttr': {
      const corr = m.corretivas.filter((o) => o.horasReparo != null).sort((a, b) => (b.horasReparo ?? 0) - (a.horasReparo ?? 0));
      const ofi = m.oficinas.filter((o) => o.horas != null);
      return {
        chave, eyebrow: 'Tempo médio de reparo (MTTR)', titulo: 'Quanto tempo cada corretiva tira o veículo de operação', icone: 'pi pi-stopwatch',
        descricao: 'Do veículo parado até a liberação (ou do início ao fim do serviço, quando não houve parada).',
        kpis: [
          { rotulo: 'MTTR', valor: m.mttr != null ? `${numero(m.mttr)} h` : '—', detalhe: textoVariacao(m.mttr, m.mttrAnterior) },
          { rotulo: 'Corretivas medidas', valor: inteiro(corr.length) },
          { rotulo: 'Mais longa', valor: corr[0] ? `${numero(corr[0].horasReparo)} h` : '—', detalhe: corr[0]?.placa ?? undefined }
        ],
        graficos: [grafico('ofi', 'Horas por OS, por oficina', 'bar-horizontal', ofi.map((o) => o.nome), [{ name: 'Horas', values: ofi.map((o) => o.horas ?? 0) }],
          { formato: 'number', aoSelecionar: (i) => (ofi[i] ? navegar('oficina', ofi[i].nome) : null), rotuloSelecao: 'Analisar a oficina' })],
        origem: origemOs('mttr', 'Corretivas da mais longa para a mais curta', corr)
      };
    }
    case 'mtbf':
      return vistaDeOs(chave, 'Tempo entre falhas (MTBF)', 'Com que frequência a frota quebra', m.corretivas, m, {
        descricao: 'Dias de operação da frota ÷ corretivas. Quanto maior, melhor.',
        kpis: [
          { rotulo: 'MTBF', valor: m.mtbf != null ? `${numero(m.mtbf)} dias` : '—' },
          { rotulo: 'Corretivas', valor: inteiro(m.corretivas.length) },
          { rotulo: 'Veículos em operação', valor: inteiro(m.r.recorte.emOperacao) }
        ]
      });
    case 'espera': {
      const os = m.os.filter((o) => o.diasAteInicio != null).sort((a, b) => (b.diasAteInicio ?? 0) - (a.diasAteInicio ?? 0));
      return vistaDeOs(chave, 'Espera para começar', 'Da abertura ao início do serviço', os, m, {
        kpis: [
          { rotulo: 'Espera média', valor: m.esperaInicio != null ? `${numero(m.esperaInicio)} dias` : '—' },
          { rotulo: 'Acima de 7 dias', valor: inteiro(os.filter((o) => (o.diasAteInicio ?? 0) > 7).length) },
          { rotulo: 'Maior espera', valor: os[0] ? `${numero(os[0].diasAteInicio)} dias` : '—', detalhe: os[0]?.placa ?? undefined }
        ]
      });
    }
    case 'retrabalho':
      return vistaDeOs(chave, 'Retrabalho', 'Itens que voltaram em até 30 dias', m.retrabalho, m, {
        destaques: [{ icone: 'pi pi-replay', tom: 'warning', texto: 'Cobre garantia da oficina ou reveja o diagnóstico: o mesmo item no mesmo veículo voltou em menos de 30 dias.' }]
      });
    case 'baixa':
      return vistaDeOs(chave, 'Valores pendentes', 'Concluídas com valores pendentes', m.baixaPendente, m);
    case 'fila':
      return filaVista(chave, 'Todas as OS abertas', m.abertas);
    case 'parados':
      return filaVista(chave, 'Veículos parados agora', m.paradas);
    case 'atrasadas':
      return filaVista(chave, 'OS atrasadas sobre a previsão', m.atrasadas);
    case 'preventiva': {
      const venc = m.veiculos.filter((v) => v.preventivasVencidas > 0).sort((a, b) => b.preventivasVencidas - a.preventivasVencidas);
      const tabela: TabelaAnalise<VeiculoManutencao> = {
        id: 'venc', titulo: 'Veículos com preventiva vencida', linhas: venc, chaveLinha: (v) => v.idVeiculo,
        colunas: [{ key: 'placa', header: 'Veículo', priority: 1 }, { key: 'tipo', header: 'Tipo', priority: 2, value: (v) => v.tipo ?? '' },
          { key: 'preventivasVencidas', header: 'Vencidas', type: 'integer', priority: 1 }, { key: 'corretivas', header: 'Corretivas no período', type: 'integer', priority: 2 }],
        aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', vazio: 'Nenhuma preventiva vencida.'
      };
      return {
        chave, eyebrow: 'Preventiva', titulo: 'Preventivas vencidas e a proporção do período', icone: 'pi pi-calendar-clock',
        kpis: [
          { rotulo: 'OS preventivas', valor: pct(m.percPreventiva), detalhe: textoVariacao(m.percPreventiva, m.percPreventivaAnterior, 'fracao') },
          { rotulo: 'Vencidas hoje', valor: inteiro(m.r.manutencao?.preventivasVencidas ?? 0), tom: m.r.manutencao?.preventivasVencidas ? 'warning' : 'success' },
          { rotulo: 'Vencem em breve', valor: inteiro(m.r.manutencao?.preventivasProximas ?? 0) }
        ],
        destaques: venc.filter((v) => v.corretivas > 0).length
          ? [{ icone: 'pi pi-exclamation-triangle', tom: 'warning', texto: `${plural(venc.filter((v) => v.corretivas > 0).length, 'veículo com preventiva vencida também quebrou', 'veículos com preventiva vencida também quebraram')} no período.` }] : undefined,
        graficos: [graficoMensal(m, m.os)],
        tabelas: [tabela],
        links: [{ rotulo: 'Abrir a preventiva', icone: 'pi pi-calendar-clock', rota: '/frota/preventiva' }]
      };
    }
    default: return null;
  }
}

function vistaVeiculo(id: string, m: ModeloManutencao, chave: string): VistaAnalise | null {
  const v = m.veiculos.find((x) => x.idVeiculo === id);
  if (!v) return null;
  const i = m.veiculos.indexOf(v);
  const abertas = m.abertas.filter((o) => o.idVeiculo === id);
  const destaques: DestaqueAnalise[] = [];
  if (v.corretivas >= 3) destaques.push({ icone: 'pi pi-exclamation-triangle', tom: 'warning', texto: `${v.corretivas} corretivas no período: avalie diagnóstico, substituição ou devolução.` });
  if (v.preventivasVencidas) destaques.push({ icone: 'pi pi-calendar-times', tom: 'warning', texto: `${plural(v.preventivasVencidas, 'preventiva vencida', 'preventivas vencidas')} hoje.` });
  const retr = v.os.filter((o) => m.idsRetrabalho.has(o.id));
  if (retr.length) destaques.push({ icone: 'pi pi-replay', tom: 'warning', texto: `${plural(retr.length, 'OS com retrabalho', 'OS com retrabalho')}.` });
  const itens = m.itens.filter((it) => it.os.some((o) => o.idVeiculo === id)).slice(0, 10);
  return {
    chave, eyebrow: 'Veículo', titulo: v.placa, descricao: [v.tipo, v.base].filter(Boolean).join(' · '), icone: 'pi pi-car',
    kpis: [
      { rotulo: 'OS no período', valor: inteiro(v.os.length), detalhe: `${v.corretivas} corretivas, ${v.preventivas} preventivas` },
      { rotulo: 'Valor', valor: moeda(v.valor) },
      { rotulo: 'Horas parado', valor: v.horasParado != null ? `${numero(v.horasParado)} h` : '—' },
      { rotulo: 'Disponibilidade', valor: pct(v.disponibilidade), tom: v.disponibilidade != null && v.disponibilidade < 0.9 ? 'warning' : undefined }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('veiculo', m.veiculos[i - 1].idVeiculo), rotulo: m.veiculos[i - 1].placa } : undefined,
    proximo: i < m.veiculos.length - 1 ? { alvo: alvo('veiculo', m.veiculos[i + 1].idVeiculo), rotulo: m.veiculos[i + 1].placa } : undefined,
    graficos: [
      graficoMensal(m, v.os),
      grafico('itens', 'Itens trocados ou reparados', 'bar-horizontal', itens.map((x) => x.item), [{ name: 'OS', values: itens.map((x) => x.os.filter((o) => o.idVeiculo === id).length) }],
        { formato: 'integer', aoSelecionar: (k) => (itens[k] ? navegar('item', itens[k].item) : null), rotuloSelecao: 'Analisar o item' })
    ],
    origem: origemOs(`veiculo-${id}`, `OS de ${v.placa}`, v.os),
    origensExtras: abertas.length ? [origemAbertas(`veiculo-${id}`, `OS abertas de ${v.placa}`, abertas)] : undefined,
    links: [linkVeiculo(id, 'manutencoes'), { ...linkVeiculo(id, 'preventiva'), rotulo: 'Preventiva do veículo', icone: 'pi pi-calendar-clock' }],
    copiloto: { foco: { tipo: 'secao', id: `veiculo.${id}`, rotulo: v.placa },
      pergunta: `Faça o histórico de manutenção do veículo ${v.placa} no período (${v.corretivas} corretivas, ${moeda(v.valor)}). Vale manter, substituir ou devolver?` }
  };
}

export { moedaCurta };
