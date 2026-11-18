import { CesDataTableColumn, CesTone } from '@ces/ui';

import { RelatorioGerencialFrota, VeiculoRelatorioFrota } from '../../../../../core/models/frota-relatorios.models';
import { DestaqueAnalise, LinkAnalise, VistaAnalise, chaveDoAlvo } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LIMITES_FROTA } from '../../frota-relatorios-gerenciais.visao';
import {
  agrupar,
  alvo,
  grafico,
  inteiro,
  linkVeiculo,
  media,
  mediana,
  moeda,
  navegar,
  numero,
  pct,
  plural,
  rotuloMes,
  soma,
  textoVariacao
} from '../frota-analise-comum';

/** Por que o veículo entrou na lista de atenção. */
export interface MotivoAtencao {
  texto: string;
  peso: number;
  painel: 'custos' | 'manutencao' | 'combustivel' | 'uso' | 'conformidade';
}

export interface VeiculoAtencao {
  v: VeiculoRelatorioFrota;
  idVeiculo: string;
  placa: string;
  pontos: number;
  motivos: MotivoAtencao[];
  resumo: string;
}

export interface BaseScore {
  id: string;
  nome: string;
  veiculos: VeiculoRelatorioFrota[];
  custo: number;
  km: number;
  custoKm: number | null;
  disponibilidade: number | null;
  checklist: number | null;
  foraConsumo: number;
  ociosos: number;
  corretivas: number;
  faturado: number;
  custoSobreFaturamento: number | null;
}

export interface ModeloGeral {
  r: RelatorioGerencialFrota;
  atencao: VeiculoAtencao[];
  bases: BaseScore[];
}

export function modeloGeral(r: RelatorioGerencialFrota): ModeloGeral {
  const medKmTipo = new Map<string, number | null>();
  const medCustoKmTipo = new Map<string, number | null>();
  for (const g of agrupar(r.veiculos.filter((v) => v.km > 0), (v) => v.idTipo, (v) => v.tipo ?? '')) {
    medKmTipo.set(g.chave, mediana(g.linhas.map((v) => v.km)));
    medCustoKmTipo.set(g.chave, mediana(g.linhas.filter((v) => v.km >= 300).map((v) => v.custoPorKm)));
  }
  const ociosos = new Set(r.uso.ociosos.map((o) => o.idVeiculo));
  const docsVencidos = new Map<string, number>();
  r.conformidade.documentos.filter((d) => d.vencido).forEach((d) => docsVencidos.set(d.idVeiculo, (docsVencidos.get(d.idVeiculo) ?? 0) + 1));
  const semSeguro = new Set((r.conformidade.semSeguro ?? []).map((v) => v.idVeiculo));
  const parados = new Map((r.manutencao?.paradosAgora ?? []).map((p) => [p.idVeiculo, p]));

  const atencao: VeiculoAtencao[] = r.veiculos.filter((v) => v.situacao !== 'BAIXADO').map((v) => {
    const m: MotivoAtencao[] = [];
    if (docsVencidos.get(v.idVeiculo)) m.push({ texto: plural(docsVencidos.get(v.idVeiculo)!, 'documento vencido', 'documentos vencidos'), peso: 5, painel: 'conformidade' });
    if (semSeguro.has(v.idVeiculo)) m.push({ texto: 'Sem seguro vigente', peso: 5, painel: 'conformidade' });
    const p = parados.get(v.idVeiculo);
    if (p) m.push({ texto: `Parado há ${p.dias} dias`, peso: p.dias > 7 ? 4 : 2, painel: 'manutencao' });
    if (v.corretivas >= 3) m.push({ texto: `${v.corretivas} corretivas`, peso: 3, painel: 'manutencao' });
    if (v.preventivasVencidas) m.push({ texto: plural(v.preventivasVencidas, 'preventiva vencida', 'preventivas vencidas'), peso: 2, painel: 'manutencao' });
    const medCk = medCustoKmTipo.get(v.idTipo ?? '—');
    if (v.custoPorKm != null && medCk && v.km >= 300 && v.custoPorKm > medCk * 1.5) m.push({ texto: `R$/km ${numero(v.custoPorKm / medCk, 1)}× a mediana do tipo`, peso: 3, painel: 'custos' });
    if (v.kmPorLitro != null && v.kmPorLitroReferencia && v.kmPorLitro < v.kmPorLitroReferencia * 0.85) {
      m.push({ texto: `Consumo ${pct(1 - v.kmPorLitro / v.kmPorLitroReferencia, 0)} pior que a referência`, peso: 3, painel: 'combustivel' });
    }
    if (ociosos.has(v.idVeiculo)) m.push({ texto: 'Ocioso no período', peso: v.regime === 'LOCADO' ? 4 : 2, painel: 'uso' });
    if (v.coberturaChecklist != null && v.coberturaChecklist < LIMITES_FROTA.checklistMeta) m.push({ texto: `Checklist em ${pct(v.coberturaChecklist, 0)} dos dias`, peso: 1, painel: 'conformidade' });
    if ((v.pendenciasChecklist ?? 0) >= 3) m.push({ texto: plural(v.pendenciasChecklist ?? 0, 'pendência de checklist', 'pendências de checklist'), peso: 1, painel: 'conformidade' });
    if ((v.sinistros ?? 0) > 0) m.push({ texto: plural(v.sinistros ?? 0, 'sinistro', 'sinistros'), peso: 2, painel: 'conformidade' });
    m.sort((a, b) => b.peso - a.peso);
    return { v, idVeiculo: v.idVeiculo, placa: v.placa, pontos: soma(m, (x) => x.peso), motivos: m, resumo: m.map((x) => x.texto).join(' · ') };
  }).filter((x) => x.pontos > 0).sort((a, b) => b.pontos - a.pontos);

  const bases = agrupar(r.veiculos, (v) => v.idBase, (v) => v.base ?? 'Sem base', (g) => soma(g.linhas, (v) => v.total)).map((g) => {
    const km = soma(g.linhas, (v) => v.km);
    const fat = soma(g.linhas, (v) => v.faturado);
    return {
      id: g.chave, nome: g.rotulo, veiculos: g.linhas, custo: soma(g.linhas, (v) => v.total), km,
      custoKm: km > 0 ? soma(g.linhas.filter((v) => v.km > 0), (v) => v.total) / km : null,
      disponibilidade: media(g.linhas.map((v) => v.disponibilidade)), checklist: media(g.linhas.map((v) => v.coberturaChecklist)),
      foraConsumo: g.linhas.filter((v) => v.kmPorLitro != null && v.kmPorLitroReferencia && v.kmPorLitro < v.kmPorLitroReferencia * 0.85).length,
      ociosos: g.linhas.filter((v) => ociosos.has(v.idVeiculo)).length, corretivas: soma(g.linhas, (v) => v.corretivas), faturado: fat,
      custoSobreFaturamento: fat > 0 ? soma(g.linhas.filter((v) => v.faturado > 0), (v) => v.total) / fat : null
    };
  });
  return { r, atencao, bases };
}

const rotaPainel = (painel: string, filtros: Record<string, string | null>, drill?: string): LinkAnalise => ({
  rotulo: { custos: 'Abrir no painel de custos', manutencao: 'Abrir no painel de manutenção', combustivel: 'Abrir no painel de combustível',
    uso: 'Abrir no painel de uso', conformidade: 'Abrir no painel de conformidade' }[painel] ?? 'Abrir o painel',
  icone: { custos: 'pi pi-wallet', manutencao: 'pi pi-wrench', combustivel: 'pi pi-gauge', uso: 'pi pi-map', conformidade: 'pi pi-shield' }[painel] ?? 'pi pi-chart-bar',
  rota: `/frota/relatorios/${painel}`, queryParams: { ...filtros, ...(drill ? { drill } : {}) }
});

const colAtencao: CesDataTableColumn<VeiculoAtencao>[] = [
  { key: 'placa', header: 'Veículo', priority: 1 },
  { key: 'pontos', header: 'Pontos', type: 'integer', priority: 2 },
  { key: 'resumo', header: 'Por quê', priority: 1 }
];

export function vistaGeral(a: { dimension: string; value: string }, m: ModeloGeral, filtros: Record<string, string | null>): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  const r = m.r;
  if (a.dimension === 'veiculo') {
    const x = m.atencao.find((v) => v.idVeiculo === a.value);
    const v = x?.v ?? r.veiculos.find((w) => w.idVeiculo === a.value);
    if (!v) return null;
    const paineis = [...new Set((x?.motivos ?? []).map((mo) => mo.painel))];
    const destaques: DestaqueAnalise[] = (x?.motivos ?? []).map((mo) => ({ icone: 'pi pi-exclamation-circle', tom: (mo.peso >= 4 ? 'danger' : mo.peso >= 3 ? 'warning' : 'info') as CesTone, texto: mo.texto }));
    return {
      chave, eyebrow: 'Veículo', titulo: v.placa, descricao: [v.tipo, v.base, v.processo].filter(Boolean).join(' · '), icone: 'pi pi-car',
      kpis: [
        { rotulo: 'Custo', valor: moeda(v.total), detalhe: textoVariacao(v.total, v.totalAnterior || null, 'moeda') },
        { rotulo: 'Km / R$ por km', valor: `${inteiro(v.km)} / ${moeda(v.custoPorKm)}` },
        { rotulo: 'Disponibilidade', valor: pct(v.disponibilidade) },
        { rotulo: 'km/l', valor: numero(v.kmPorLitro, 2), detalhe: v.kmPorLitroReferencia ? `Referência: ${numero(v.kmPorLitroReferencia, 2)}` : undefined }
      ],
      destaques,
      graficos: [grafico('partes', 'Composição do custo', 'doughnut', ['Manutenção', 'Combustível', 'Despesas', 'Seguro', 'Locação', 'Franquias'],
        [{ name: 'Custo', values: [v.manutencao, v.combustivel, v.despesas, v.seguro, v.locacao, v.franquias].map((n) => n ?? 0) }], { formato: 'currency' })],
      links: [linkVeiculo(v.idVeiculo), ...(paineis.length ? paineis : ['custos'] as const).map((p) => rotaPainel(p, filtros, `veiculo:${v.idVeiculo}`))],
      copiloto: { foco: { tipo: 'secao', id: `veiculo.${v.idVeiculo}`, rotulo: v.placa }, pergunta: `Faça o raio-x do veículo ${v.placa} neste período (custo, manutenção, consumo, uso e conformidade) e diga o que fazer com ele.` }
    };
  }
  if (a.dimension === 'base') {
    const b = m.bases.find((x) => x.id === a.value);
    if (!b) return null;
    const f = { ...filtros, base: b.id === '—' ? filtros['base'] : b.id };
    const at = m.atencao.filter((x) => b.veiculos.some((v) => v.idVeiculo === x.idVeiculo));
    return {
      chave, eyebrow: 'Base operacional', titulo: b.nome, icone: 'pi pi-building',
      kpis: [
        { rotulo: 'Custo', valor: moeda(b.custo), detalhe: `${pct(b.custo / (r.resumo.custoTotal.atual || 1))} da frota` },
        { rotulo: 'R$/km', valor: moeda(b.custoKm), detalhe: `Frota: ${moeda(r.resumo.custoPorKm.atual)}` },
        { rotulo: 'Disponibilidade', valor: pct(b.disponibilidade) },
        { rotulo: 'Checklist', valor: pct(b.checklist) }
      ],
      destaques: [
        ...(b.ociosos ? [{ icone: 'pi pi-pause-circle', tom: 'warning' as CesTone, texto: `${plural(b.ociosos, 'veículo ocioso', 'veículos ociosos')}.` }] : []),
        ...(b.foraConsumo ? [{ icone: 'pi pi-gauge', tom: 'warning' as CesTone, texto: `${plural(b.foraConsumo, 'veículo com consumo fora do padrão', 'veículos com consumo fora do padrão')}.` }] : [])
      ],
      graficos: [grafico('veic', 'Custo por veículo', 'bar-horizontal', b.veiculos.slice(0, 15).map((v) => v.placa), [{ name: 'Custo', values: b.veiculos.slice(0, 15).map((v) => v.total) }],
        { formato: 'currency', aoSelecionar: (i) => (b.veiculos[i] ? navegar('veiculo', b.veiculos[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' })],
      tabelas: [{ id: 'atencao', titulo: 'Veículos que pedem atenção', colunas: colAtencao, linhas: at, chaveLinha: (x) => x.idVeiculo,
        aoAtivar: (x) => navegar('veiculo', x.idVeiculo), rotuloAcao: 'Analisar', vazio: 'Nenhum veículo pedindo atenção nesta base.' }],
      links: (['custos', 'manutencao', 'combustivel', 'uso', 'conformidade'] as const).map((p) => rotaPainel(p, f))
    };
  }
  if (a.dimension === 'mes') {
    const i = r.custos.mensal.findIndex((x) => x.mes === a.value);
    if (i < 0) return null;
    const x = r.custos.mensal[i];
    const partes = [['Manutenção', x.manutencao], ['Combustível', x.combustivel], ['Despesas', x.despesas], ['Seguro', x.seguro], ['Locação', x.locacao], ['Franquias', x.franquias]] as const;
    return {
      chave, eyebrow: 'Mês', titulo: rotuloMes(x.mes), icone: 'pi pi-calendar',
      kpis: [{ rotulo: 'Custo', valor: moeda(x.total) }, { rotulo: 'Km', valor: inteiro(x.km) }, { rotulo: 'R$/km', valor: moeda(x.km ? x.total / x.km : null) }],
      anterior: i > 0 ? { alvo: alvo('mes', r.custos.mensal[i - 1].mes), rotulo: rotuloMes(r.custos.mensal[i - 1].mes) } : undefined,
      proximo: i < r.custos.mensal.length - 1 ? { alvo: alvo('mes', r.custos.mensal[i + 1].mes), rotulo: rotuloMes(r.custos.mensal[i + 1].mes) } : undefined,
      graficos: [grafico('partes', 'Composição', 'doughnut', partes.map((p) => p[0]), [{ name: 'Custo', values: partes.map((p) => p[1]) }], { formato: 'currency' })],
      links: [rotaPainel('custos', filtros, `mes:${x.mes}`)]
    };
  }
  if (a.dimension === 'kpi' && a.value === 'atencao') {
    return {
      chave, eyebrow: 'Atenção', titulo: 'Veículos que pedem decisão', icone: 'pi pi-flag',
      descricao: 'Pontuação somando documento vencido, sem seguro, parado, corretivas, consumo, custo por km, ociosidade e checklist.',
      kpis: [{ rotulo: 'Veículos', valor: inteiro(m.atencao.length) }, { rotulo: 'Com algo crítico', valor: inteiro(m.atencao.filter((x) => x.motivos.some((mo) => mo.peso >= 4)).length) }],
      graficos: [grafico('pontos', 'Pontuação', 'bar-horizontal', m.atencao.slice(0, 15).map((x) => x.placa), [{ name: 'Pontos', values: m.atencao.slice(0, 15).map((x) => x.pontos) }],
        { formato: 'integer', aoSelecionar: (i) => (m.atencao[i] ? navegar('veiculo', m.atencao[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' })],
      tabelas: [{ id: 'atencao', titulo: 'Veículos', colunas: colAtencao, linhas: m.atencao, chaveLinha: (x) => x.idVeiculo, aoAtivar: (x) => navegar('veiculo', x.idVeiculo), rotuloAcao: 'Analisar' }]
    };
  }
  return null;
}
