import { GeoDataTableColumn, GeoTone } from '@geo/ui';
import { of } from 'rxjs';

import {
  CnhDetalheFrota,
  DetalheConformidadeFrota,
  DocumentoDetalheFrota,
  PendenciaDetalheFrota,
  RelatorioGerencialFrota,
  VeiculoRelatorioFrota
} from '../../../../../core/models/frota-relatorios.models';
import { DestaqueAnalise, KpiAnalise, OrigemAnalise, TabelaAnalise, VistaAnalise, chaveDoAlvo } from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { LIMITES_FROTA } from '../../frota-relatorios-gerenciais.visao';
import {
  Grupo,
  ROTULO_DOCUMENTO,
  ROTULO_SINISTRO,
  ROTULO_TIPO_SINISTRO,
  agrupar,
  alvo,
  dataBr,
  grafico,
  inteiro,
  linkChecklist,
  linkSinistro,
  linkVeiculo,
  moeda,
  navegar,
  numero,
  pct,
  plural,
  rotulo,
  soma,
  textoVariacao
} from '../frota-analise-comum';

type Rel = RelatorioGerencialFrota;
type Sinistro = NonNullable<Rel['conformidade']['sinistros']>['lista'][number];

export interface GrupoChecklist {
  id: string;
  nome: string;
  veiculos: VeiculoRelatorioFrota[];
  cobertura: number | null;
  abaixo: number;
}

export interface ModeloConformidade {
  r: Rel;
  horizonte: number;
  documentos: DocumentoDetalheFrota[] | null;
  docVencidos: DocumentoDetalheFrota[];
  doc30: DocumentoDetalheFrota[];
  docSemArquivo: DocumentoDetalheFrota[];
  cnh: CnhDetalheFrota[] | null;
  cnhVencidas: CnhDetalheFrota[];
  cnh30: CnhDetalheFrota[];
  cnhRodando: CnhDetalheFrota[];
  cnhSemValidade: CnhDetalheFrota[];
  pendencias: PendenciaDetalheFrota[] | null;
  pendAntigas: PendenciaDetalheFrota[];
  pendSemOs: PendenciaDetalheFrota[];
  pendPorItem: Grupo<PendenciaDetalheFrota>[];
  checklistVeiculos: VeiculoRelatorioFrota[];
  checklistBases: GrupoChecklist[];
  veiculosVencidos: { idVeiculo: string; placa: string; docs: DocumentoDetalheFrota[] }[];
  semanas: { inicio: string; rotulo: string; docs: DocumentoDetalheFrota[]; cnh: CnhDetalheFrota[] }[];
  docsPorTipo: Grupo<DocumentoDetalheFrota>[];
  pontos: number;
}

export function modeloConformidade(r: Rel, d: DetalheConformidadeFrota, horizonte: number): ModeloConformidade {
  const docs = d.documentos ?? [];
  const cnh = d.cnh ?? [];
  const pend = d.pendencias ?? [];
  const docVencidos = docs.filter((x) => x.dias < 0);
  const cnhVencidas = cnh.filter((x) => x.dias != null && x.dias < 0);
  const checklistVeiculos = r.veiculos.filter((v) => v.coberturaChecklist != null).sort((a, b) => (a.coberturaChecklist ?? 0) - (b.coberturaChecklist ?? 0));
  const checklistBases = agrupar(checklistVeiculos, (v) => v.idBase, (v) => v.base ?? 'Sem base').map((g) => {
    const cob = g.linhas.map((v) => v.coberturaChecklist ?? 0);
    return { id: g.chave, nome: g.rotulo, veiculos: g.linhas, cobertura: cob.length ? cob.reduce((a, b) => a + b, 0) / cob.length : null,
      abaixo: g.linhas.filter((v) => (v.coberturaChecklist ?? 0) < LIMITES_FROTA.checklistMeta).length };
  }).sort((a, b) => (a.cobertura ?? 0) - (b.cobertura ?? 0));

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const semanas = Array.from({ length: Math.min(13, Math.ceil(horizonte / 7)) }, (_, i) => {
    const ini = new Date(hoje.getTime() + i * 7 * 86400000);
    const ate = i * 7 + 6;
    return { inicio: ini.toISOString().slice(0, 10), rotulo: i === 0 ? 'Esta semana' : ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      docs: docs.filter((x) => x.dias >= i * 7 && x.dias <= ate), cnh: cnh.filter((x) => x.dias != null && x.dias >= i * 7 && x.dias <= ate) };
  });

  const veiculosVencidos = agrupar(docVencidos, (x) => x.idVeiculo, (x) => x.placa ?? '—').map((g) => ({ idVeiculo: g.chave, placa: g.rotulo, docs: g.linhas }));
  const c = r.conformidade;
  const pontos = docVencidos.length * 3 + cnhVencidas.length * 3 + (c.semSeguro?.length ?? 0) * 3 + (c.sinistros?.comCulpaDoCondutor ?? 0) * 2
    + pend.filter((p) => p.dias > 7).length + c.veiculosChecklistAbaixoMeta;
  return {
    r, horizonte, documentos: d.documentos, docVencidos, doc30: docs.filter((x) => x.dias >= 0 && x.dias <= 30), docSemArquivo: docs.filter((x) => !x.comArquivo),
    cnh: d.cnh, cnhVencidas, cnh30: cnh.filter((x) => x.dias != null && x.dias >= 0 && x.dias <= 30),
    cnhRodando: cnhVencidas.filter((x) => x.placas.length), cnhSemValidade: cnh.filter((x) => x.validade == null),
    pendencias: d.pendencias, pendAntigas: pend.filter((p) => p.dias > 7), pendSemOs: pend.filter((p) => !p.idOrdemServico),
    pendPorItem: agrupar(pend, (p) => p.item, (p) => p.item),
    checklistVeiculos, checklistBases, veiculosVencidos, semanas,
    docsPorTipo: agrupar(docs, (x) => x.tipo, (x) => rotulo(ROTULO_DOCUMENTO, x.tipo)),
    pontos
  };
}

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoConformidade(m: ModeloConformidade): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const l: LeituraGerencial[] = [];
  const c = m.r.conformidade;
  if (m.cnhRodando.length) {
    l.push({ id: 'cnh-rodando', tom: 'danger', icone: 'pi pi-id-card', titulo: 'Dirigindo com CNH vencida', valor: inteiro(m.cnhRodando.length),
      texto: `${m.cnhRodando.slice(0, 3).map((x) => `${x.nome} (${x.placas.join(', ')})`).join('; ')}${m.cnhRodando.length > 3 ? '…' : ''}. Condutor vinculado a veículo com CNH vencida: risco legal e de seguro.`,
      acao: { rotulo: 'Ver as CNH', alvo: alvo('kpi', 'cnh') } });
  }
  if (m.docVencidos.length) {
    l.push({ id: 'docs', tom: 'danger', icone: 'pi pi-file', titulo: 'Documento de veículo vencido', valor: inteiro(m.docVencidos.length),
      texto: `${plural(m.veiculosVencidos.length, 'veículo rodando', 'veículos rodando')} com documento vencido (${m.veiculosVencidos.slice(0, 4).map((x) => x.placa).join(', ')}${m.veiculosVencidos.length > 4 ? '…' : ''}). Pode dar multa e apreensão.`,
      acao: { rotulo: 'Ver os documentos', alvo: alvo('kpi', 'documentos') } });
  }
  if (c.semSeguro?.length) {
    l.push({ id: 'seguro', tom: 'danger', icone: 'pi pi-shield', titulo: 'Veículos sem seguro', valor: inteiro(c.semSeguro.length),
      texto: `${c.semSeguro.slice(0, 4).map((v) => v.placa).join(', ')}${c.semSeguro.length > 4 ? '…' : ''} sem apólice vigente hoje. Um sinistro sai integral do caixa.`,
      acao: { rotulo: 'Ver os veículos', alvo: alvo('kpi', 'seguro') } });
  }
  const proximos = m.doc30.length + m.cnh30.length + (c.apolicesVencendo?.length ?? 0);
  if (proximos) {
    l.push({ id: 'vencendo', tom: 'warning', icone: 'pi pi-calendar', titulo: 'Vence em 30 dias', valor: inteiro(proximos),
      texto: `${plural(m.doc30.length, 'documento', 'documentos')}, ${plural(m.cnh30.length, 'CNH', 'CNH')} e ${plural(c.apolicesVencendo?.length ?? 0, 'apólice', 'apólices')}. Renovar agora evita parar veículo.`,
      acao: { rotulo: 'Ver a agenda', alvo: alvo('kpi', 'agenda') } });
  }
  if (c.coberturaChecklist?.atual != null && c.coberturaChecklist.atual < LIMITES_FROTA.checklistMeta) {
    const pior = m.checklistBases[0];
    l.push({ id: 'checklist', tom: 'warning', icone: 'pi pi-list-check', titulo: 'Checklist abaixo da meta', valor: pct(c.coberturaChecklist.atual),
      texto: `${plural(c.veiculosChecklistAbaixoMeta, 'veículo fez', 'veículos fizeram')} checklist em menos de 80% dos dias úteis.${pior ? ` ${pior.nome} é a base com menor cobertura (${pct(pior.cobertura)}).` : ''}`,
      acao: { rotulo: 'Ver o checklist', alvo: alvo('kpi', 'checklist') } });
  }
  if (m.pendAntigas.length) {
    const item = m.pendPorItem[0];
    l.push({ id: 'pendencias', tom: 'warning', icone: 'pi pi-exclamation-circle', titulo: 'Problema apontado e não resolvido', valor: inteiro(m.pendAntigas.length),
      texto: `Pendências de checklist abertas há mais de 7 dias${m.pendSemOs.length ? `, ${m.pendSemOs.length} sem OS` : ''}.${item ? ` O item mais apontado é "${item.rotulo}" (${item.linhas.length}).` : ''}`,
      acao: { rotulo: 'Ver as pendências', alvo: alvo('kpi', 'pendencias') } });
  }
  if (c.sinistros && c.sinistros.comCulpaDoCondutor) {
    l.push({ id: 'sinistros', tom: 'warning', icone: 'pi pi-exclamation-triangle', titulo: 'Sinistros com culpa do condutor', valor: inteiro(c.sinistros.comCulpaDoCondutor),
      texto: `De ${plural(c.sinistros.total.atual ?? 0, 'sinistro', 'sinistros')} no período (${textoVariacao(c.sinistros.total.atual, c.sinistros.total.anterior).toLowerCase()}), ${moeda(c.sinistros.franquias)} em franquias.`,
      acao: { rotulo: 'Ver os sinistros', alvo: alvo('kpi', 'sinistros') } });
  }
  if (c.eventosConducao && (c.eventosConducao.total.atual ?? 0) > 0) {
    const top = c.condutores?.[0];
    l.push({ id: 'eventos', tom: 'info', icone: 'pi pi-bolt', titulo: 'Eventos de condução', valor: `${numero(c.eventosConducao.por100Km.atual, 2)}/100 km`,
      texto: `${inteiro(c.eventosConducao.total.atual)} eventos (excesso de velocidade, frenagem e aceleração bruscas).${top ? ` ${top.nome} lidera com ${top.eventos}.` : ''}`,
      acao: { rotulo: 'Ver os eventos', alvo: alvo('kpi', 'eventos') } });
  }
  if (c.acidentes.total) {
    l.push({ id: 'sst', tom: 'warning', icone: 'pi pi-heart', titulo: 'Acidentes com veículo (SST)', valor: inteiro(c.acidentes.total),
      texto: `${plural(c.acidentes.diasPerdidos, 'dia perdido', 'dias perdidos')} registrados no SST.`, acao: { rotulo: 'Ver os registros', alvo: alvo('kpi', 'acidentes') } });
  }
  const criticos = m.docVencidos.length + m.cnhVencidas.length + (c.semSeguro?.length ?? 0);
  const tom: GeoTone = criticos ? 'danger' : l.some((x) => x.tom === 'warning') ? 'warning' : 'success';
  return {
    veredito: {
      tom, rotulo: tom === 'danger' ? 'Agir agora' : tom === 'warning' ? 'Acompanhar' : 'Em dia',
      titulo: tom === 'danger' ? `${plural(criticos, 'irregularidade pode', 'irregularidades podem')} parar a frota` : tom === 'warning' ? 'Conformidade pede atenção' : 'Frota em dia',
      texto: `${plural(m.docVencidos.length, 'documento vencido', 'documentos vencidos')}, ${plural(m.cnhVencidas.length, 'CNH vencida', 'CNH vencidas')}, `
        + `${plural(c.semSeguro?.length ?? 0, 'veículo sem seguro', 'veículos sem seguro')}; checklist em ${pct(c.coberturaChecklist?.atual)} dos dias úteis.`,
      progresso: c.coberturaChecklist?.atual != null
        ? { valor: c.coberturaChecklist.atual * 100, rotulo: `Checklist ${pct(c.coberturaChecklist.atual)}`, marcador: 80, rotuloMarcador: 'Meta 80%' } : undefined
    },
    leituras: l,
    pergunta: 'Faça a leitura de risco e conformidade da frota neste recorte: o que pode gerar multa, apreensão ou acidente agora e qual a ordem de ataque?'
  };
}

// ── Análises ─────────────────────────────────────────────────────────────────────────────────────

const situacaoDias = (dias: number | null) => (dias == null ? 'Sem validade' : dias < 0 ? `Vencido há ${-dias} dias` : dias === 0 ? 'Vence hoje' : `Vence em ${dias} dias`);

const colDocs: GeoDataTableColumn<DocumentoDetalheFrota>[] = [
  { key: 'placa', header: 'Veículo', priority: 1, value: (d) => d.placa ?? '—' },
  { key: 'tipo', header: 'Documento', priority: 1, value: (d) => rotulo(ROTULO_DOCUMENTO, d.tipo) },
  { key: 'vencimento', header: 'Vencimento', type: 'date', priority: 2 },
  { key: 'dias', header: 'Situação', type: 'custom', priority: 1, value: (d) => d.dias, display: (d) => situacaoDias(d.dias) },
  { key: 'comArquivo', header: 'Arquivo', type: 'custom', priority: 3, value: (d) => (d.comArquivo ? 1 : 0), display: (d) => (d.comArquivo ? 'Anexado' : 'Sem arquivo') }
];
const colCnh: GeoDataTableColumn<CnhDetalheFrota>[] = [
  { key: 'nome', header: 'Condutor', priority: 1 },
  { key: 'categoria', header: 'Categoria', priority: 3, value: (c) => c.categoria ?? '—' },
  { key: 'validade', header: 'Validade', type: 'date', priority: 2 },
  { key: 'dias', header: 'Situação', type: 'custom', priority: 1, value: (c) => c.dias ?? -9999, display: (c) => situacaoDias(c.dias) },
  { key: 'placas', header: 'Veículo atual', type: 'custom', priority: 1, value: (c) => c.placas.join(', '), display: (c) => c.placas.join(', ') || '—' }
];
const colPend: GeoDataTableColumn<PendenciaDetalheFrota>[] = [
  { key: 'placa', header: 'Veículo', priority: 1, value: (p) => p.placa ?? '—' },
  { key: 'item', header: 'Item', priority: 1 },
  { key: 'abertaEm', header: 'Apontada em', type: 'date', priority: 2 },
  { key: 'dias', header: 'Dias', type: 'integer', priority: 1 },
  { key: 'idOrdemServico', header: 'OS', type: 'custom', priority: 2, value: (p) => (p.idOrdemServico ? 1 : 0), display: (p) => (p.idOrdemServico ? 'Com OS' : 'Sem OS') }
];
const colChecklist: GeoDataTableColumn<VeiculoRelatorioFrota>[] = [
  { key: 'placa', header: 'Veículo', priority: 1 },
  { key: 'base', header: 'Base', priority: 2, value: (v) => v.base ?? '' },
  { key: 'diasComChecklist', header: 'Dias com checklist', type: 'custom', priority: 2, value: (v) => v.diasComChecklist ?? 0, display: (v) => inteiro(v.diasComChecklist) },
  { key: 'coberturaChecklist', header: 'Cobertura', type: 'custom', priority: 1, value: (v) => v.coberturaChecklist ?? -1, display: (v) => pct(v.coberturaChecklist) },
  { key: 'pendenciasChecklist', header: 'Pendências', type: 'custom', priority: 1, value: (v) => v.pendenciasChecklist ?? 0, display: (v) => inteiro(v.pendenciasChecklist) }
];
const colSinistros: GeoDataTableColumn<Sinistro>[] = [
  { key: 'numero', header: 'Sinistro', type: 'custom', priority: 1, value: (s) => s.numero ?? 0, display: (s) => (s.numero ? `#${s.numero}` : '—') },
  { key: 'placa', header: 'Veículo', priority: 1 },
  { key: 'tipo', header: 'Tipo', priority: 1, value: (s) => rotulo(ROTULO_TIPO_SINISTRO, s.tipo) },
  { key: 'ocorridoEm', header: 'Data', type: 'date', priority: 2 },
  { key: 'culpaCondutor', header: 'Culpa do condutor', type: 'custom', priority: 2, value: (s) => (s.culpaCondutor ? 1 : 0),
    display: (s) => (s.culpaCondutor == null ? 'Não informado' : s.culpaCondutor ? 'Sim' : 'Não') },
  { key: 'franquia', header: 'Franquia', type: 'currency', priority: 2 },
  { key: 'situacao', header: 'Situação', priority: 3, value: (s) => rotulo(ROTULO_SINISTRO, s.situacao) }
];

function origemDocs(chave: string, titulo: string, linhas: DocumentoDetalheFrota[]): OrigemAnalise<DocumentoDetalheFrota> {
  return {
    chave: `docs:${chave}`, titulo, rotuloAba: 'Documentos', icone: 'pi pi-file', colunas: colDocs,
    carregar: () => of({ linhas, total: linhas.length }), chaveLinha: (d) => d.id, rotuloLinha: (d) => `${d.placa ?? ''} ${rotulo(ROTULO_DOCUMENTO, d.tipo)}`,
    detalhar: (d) => ({ titulo: `${rotulo(ROTULO_DOCUMENTO, d.tipo)} · ${d.placa ?? ''}`, subtitulo: situacaoDias(d.dias),
      campos: [{ rotulo: 'Vencimento', valor: dataBr(d.vencimento) }, { rotulo: 'Descrição', valor: d.descricao ?? '—' }, { rotulo: 'Arquivo', valor: d.comArquivo ? 'Anexado' : 'Sem arquivo' }],
      links: [{ ...linkVeiculo(d.idVeiculo, 'documentos'), rotulo: 'Documentos do veículo', icone: 'pi pi-file' }, { rotulo: 'Documentos e vencimentos', icone: 'pi pi-calendar', rota: '/frota/documentos' }] }),
    nomeArquivo: `frota-documentos-${chave}`, vazio: 'Nenhum documento neste recorte.'
  };
}

function origemPend(chave: string, titulo: string, linhas: PendenciaDetalheFrota[]): OrigemAnalise<PendenciaDetalheFrota> {
  return {
    chave: `pend:${chave}`, titulo, rotuloAba: 'Pendências', icone: 'pi pi-exclamation-circle', colunas: colPend,
    carregar: () => of({ linhas, total: linhas.length }), chaveLinha: (p) => p.id, rotuloLinha: (p) => `${p.placa ?? ''} ${p.item}`,
    detalhar: (p) => ({ titulo: p.item, subtitulo: `${p.placa ?? ''} · aberta há ${plural(p.dias, 'dia', 'dias')}`,
      campos: [{ rotulo: 'Grupo', valor: p.grupo ?? '—' }, { rotulo: 'Apontada em', valor: dataBr(p.abertaEm) }, { rotulo: 'Comentário', valor: p.comentario ?? '—' },
        { rotulo: 'OS', valor: p.idOrdemServico ? 'Já tem OS' : 'Sem OS' }],
      links: [linkChecklist(p.idChecklist), linkVeiculo(p.idVeiculo), ...(p.idOrdemServico ? [{ rotulo: 'Abrir a OS', icone: 'pi pi-wrench', rota: ['/frota/ordens-servico', p.idOrdemServico] }] : []),
        { rotulo: 'Pendências de checklist', icone: 'pi pi-list-check', rota: '/frota/checklists' }] }),
    nomeArquivo: `frota-pendencias-${chave}`, vazio: 'Nenhuma pendência aberta.'
  };
}

function tabelaCnh(linhas: CnhDetalheFrota[]): TabelaAnalise<CnhDetalheFrota> {
  return { id: 'cnh', titulo: 'CNH', colunas: colCnh, linhas, chaveLinha: (c) => c.idCondutor, vazio: 'Nenhuma CNH neste recorte.', nomeArquivo: 'frota-cnh' };
}

export function vistaConformidade(a: { dimension: string; value: string }, m: ModeloConformidade): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  const v = a.value;
  const c = m.r.conformidade;
  switch (a.dimension) {
    case 'kpi': return vistaKpi(v, m, chave);
    case 'tipo-doc': {
      const g = m.docsPorTipo.find((x) => x.chave === v);
      return g ? { chave, eyebrow: 'Documento', titulo: g.rotulo, icone: 'pi pi-file',
        kpis: [{ rotulo: 'Vencidos', valor: inteiro(g.linhas.filter((x) => x.dias < 0).length), tom: g.linhas.some((x) => x.dias < 0) ? 'danger' : undefined },
          { rotulo: 'Vencem em 30 dias', valor: inteiro(g.linhas.filter((x) => x.dias >= 0 && x.dias <= 30).length) },
          { rotulo: `Até ${m.horizonte} dias`, valor: inteiro(g.linhas.length) }],
        graficos: [], origem: origemDocs(chave, g.rotulo, g.linhas) } : null;
    }
    case 'semana': {
      const i = m.semanas.findIndex((x) => x.inicio === v);
      if (i < 0) return null;
      const s = m.semanas[i];
      return { chave, eyebrow: 'Agenda de vencimentos', titulo: s.rotulo === 'Esta semana' ? 'Vence esta semana' : `Semana de ${s.rotulo}`, icone: 'pi pi-calendar',
        kpis: [{ rotulo: 'Documentos', valor: inteiro(s.docs.length) }, { rotulo: 'CNH', valor: inteiro(s.cnh.length) }],
        anterior: i > 0 ? { alvo: alvo('semana', m.semanas[i - 1].inicio), rotulo: m.semanas[i - 1].rotulo } : undefined,
        proximo: i < m.semanas.length - 1 ? { alvo: alvo('semana', m.semanas[i + 1].inicio), rotulo: m.semanas[i + 1].rotulo } : undefined,
        graficos: [], tabelas: s.cnh.length ? [tabelaCnh(s.cnh)] : undefined, origem: origemDocs(chave, 'Documentos da semana', s.docs) };
    }
    case 'base': {
      const g = m.checklistBases.find((x) => x.id === v);
      return g ? { chave, eyebrow: 'Checklist por base', titulo: g.nome, icone: 'pi pi-list-check',
        kpis: [{ rotulo: 'Cobertura média', valor: pct(g.cobertura), tom: (g.cobertura ?? 0) < LIMITES_FROTA.checklistMeta ? 'warning' : 'success' },
          { rotulo: 'Abaixo de 80%', valor: inteiro(g.abaixo) }, { rotulo: 'Veículos', valor: inteiro(g.veiculos.length) }],
        graficos: [grafico('cob', 'Cobertura por veículo', 'bar-horizontal', g.veiculos.map((x) => x.placa), [{ name: 'Cobertura', values: g.veiculos.map((x) => x.coberturaChecklist ?? 0) }],
          { formato: 'percent', aoSelecionar: (k) => (g.veiculos[k] ? navegar('veiculo', g.veiculos[k].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' })],
        tabelas: [{ id: 'veic', titulo: 'Veículos', colunas: colChecklist, linhas: g.veiculos, chaveLinha: (x) => x.idVeiculo, aoAtivar: (x) => navegar('veiculo', x.idVeiculo), rotuloAcao: 'Analisar' }] } : null;
    }
    case 'item': {
      const g = m.pendPorItem.find((x) => x.chave === v);
      return g ? { chave, eyebrow: 'Item do checklist', titulo: g.rotulo, icone: 'pi pi-exclamation-circle',
        kpis: [{ rotulo: 'Pendências abertas', valor: inteiro(g.linhas.length) }, { rotulo: 'Veículos', valor: inteiro(new Set(g.linhas.map((p) => p.idVeiculo)).size) },
          { rotulo: 'Sem OS', valor: inteiro(g.linhas.filter((p) => !p.idOrdemServico).length) }],
        graficos: [], origem: origemPend(chave, g.rotulo, g.linhas) } : null;
    }
    case 'tipo-sinistro': {
      const lista = (c.sinistros?.lista ?? []).filter((s) => s.tipo === v);
      return { chave, eyebrow: 'Sinistros', titulo: rotulo(ROTULO_TIPO_SINISTRO, v), icone: 'pi pi-exclamation-triangle',
        kpis: [{ rotulo: 'Sinistros', valor: inteiro(lista.length) }, { rotulo: 'Com culpa do condutor', valor: inteiro(lista.filter((s) => s.culpaCondutor).length) },
          { rotulo: 'Franquias', valor: moeda(soma(lista, (s) => s.franquia)) }],
        graficos: [], tabelas: [{ id: 'sin', titulo: 'Sinistros', colunas: colSinistros, linhas: lista, chaveLinha: (s) => s.id, aoAtivar: (s) => navegar('veiculo', s.idVeiculo), rotuloAcao: 'Analisar o veículo' }],
        links: [{ rotulo: 'Abrir sinistros', icone: 'pi pi-exclamation-circle', rota: '/frota/sinistros' }] };
    }
    case 'veiculo': return vistaVeiculo(v, m, chave);
    default: return null;
  }
}

function vistaKpi(qual: string, m: ModeloConformidade, chave: string): VistaAnalise | null {
  const c = m.r.conformidade;
  switch (qual) {
    case 'documentos':
    case 'agenda': {
      const docs = m.documentos ?? [];
      return { chave, eyebrow: 'Documentos', titulo: qual === 'agenda' ? `Agenda de vencimentos (${m.horizonte} dias)` : 'Documentos vencidos e a vencer', icone: 'pi pi-file',
        kpis: [
          { rotulo: 'Vencidos', valor: inteiro(m.docVencidos.length), tom: m.docVencidos.length ? 'danger' : 'success' },
          { rotulo: 'Vencem em 30 dias', valor: inteiro(m.doc30.length), tom: m.doc30.length ? 'warning' : undefined },
          { rotulo: `Até ${m.horizonte} dias`, valor: inteiro(docs.length) },
          { rotulo: 'Sem arquivo anexado', valor: inteiro(m.docSemArquivo.length), detalhe: 'Fiscalização sem sinal precisa do arquivo no app' }
        ],
        graficos: [
          grafico('semanas', 'Vencimentos por semana', 'bar-stacked', m.semanas.map((s) => s.rotulo),
            [{ name: 'Documentos', values: m.semanas.map((s) => s.docs.length) }, { name: 'CNH', values: m.semanas.map((s) => s.cnh.length) }],
            { formato: 'integer', inteiro: true, aoSelecionar: (i) => (m.semanas[i] ? navegar('semana', m.semanas[i].inicio) : null), rotuloSelecao: 'Ver a semana' }),
          grafico('tipos', 'Por tipo de documento', 'bar-horizontal', m.docsPorTipo.map((g) => g.rotulo), [{ name: 'Documentos', values: m.docsPorTipo.map((g) => g.linhas.length) }],
            { formato: 'integer', aoSelecionar: (i) => (m.docsPorTipo[i] ? navegar('tipo-doc', m.docsPorTipo[i].chave) : null), rotuloSelecao: 'Ver os documentos' })
        ],
        origem: origemDocs(chave, 'Documentos', docs),
        links: [{ rotulo: 'Abrir documentos e vencimentos', icone: 'pi pi-file', rota: '/frota/documentos' }] };
    }
    case 'cnh':
      return { chave, eyebrow: 'CNH', titulo: 'Habilitação dos condutores', icone: 'pi pi-id-card',
        kpis: [
          { rotulo: 'Vencidas', valor: inteiro(m.cnhVencidas.length), tom: m.cnhVencidas.length ? 'danger' : 'success' },
          { rotulo: 'Vencidas e com veículo', valor: inteiro(m.cnhRodando.length), tom: m.cnhRodando.length ? 'danger' : undefined },
          { rotulo: 'Vencem em 30 dias', valor: inteiro(m.cnh30.length) },
          { rotulo: 'Sem validade cadastrada', valor: inteiro(m.cnhSemValidade.length) }
        ],
        graficos: [], tabelas: [tabelaCnh(m.cnh ?? [])], links: [{ rotulo: 'Abrir condutores', icone: 'pi pi-id-card', rota: '/frota/condutores' }] };
    case 'checklist':
      return { chave, eyebrow: 'Checklist', titulo: 'Checklist nos dias úteis', icone: 'pi pi-list-check',
        kpis: [
          { rotulo: 'Cobertura', valor: pct(c.coberturaChecklist?.atual), detalhe: textoVariacao(c.coberturaChecklist?.atual ?? null, c.coberturaChecklist?.anterior ?? null, 'fracao') },
          { rotulo: 'Abaixo de 80%', valor: inteiro(c.veiculosChecklistAbaixoMeta), tom: c.veiculosChecklistAbaixoMeta ? 'warning' : 'success' },
          { rotulo: 'Pendências abertas', valor: inteiro(c.pendenciasAbertas) }
        ],
        graficos: [grafico('bases', 'Cobertura por base', 'bar-horizontal', m.checklistBases.map((g) => g.nome), [{ name: 'Cobertura', values: m.checklistBases.map((g) => g.cobertura ?? 0) }],
          { formato: 'percent', aoSelecionar: (i) => (m.checklistBases[i] ? navegar('base', m.checklistBases[i].id) : null), rotuloSelecao: 'Analisar a base' })],
        tabelas: [{ id: 'veic', titulo: 'Veículos, da menor cobertura para a maior', colunas: colChecklist, linhas: m.checklistVeiculos, chaveLinha: (v) => v.idVeiculo,
          aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar' }] };
    case 'pendencias': {
      const p = m.pendencias ?? [];
      return { chave, eyebrow: 'Pendências de checklist', titulo: 'Problemas apontados no checklist e ainda abertos', icone: 'pi pi-exclamation-circle',
        kpis: [{ rotulo: 'Abertas', valor: inteiro(p.length) }, { rotulo: 'Há mais de 7 dias', valor: inteiro(m.pendAntigas.length), tom: m.pendAntigas.length ? 'warning' : undefined },
          { rotulo: 'Sem OS', valor: inteiro(m.pendSemOs.length) }],
        graficos: [grafico('itens', 'Itens mais apontados', 'bar-horizontal', m.pendPorItem.slice(0, 12).map((g) => g.rotulo), [{ name: 'Pendências', values: m.pendPorItem.slice(0, 12).map((g) => g.linhas.length) }],
          { formato: 'integer', aoSelecionar: (i) => (m.pendPorItem[i] ? navegar('item', m.pendPorItem[i].chave) : null), rotuloSelecao: 'Ver as pendências' })],
        origem: origemPend(chave, 'Pendências abertas', [...p].sort((a, b) => b.dias - a.dias)) };
    }
    case 'seguro': {
      const colunas: GeoDataTableColumn<NonNullable<Rel['conformidade']['semSeguro']>[number]>[] = [
        { key: 'placa', header: 'Veículo', priority: 1 }, { key: 'tipo', header: 'Tipo', priority: 2, value: (v) => v.tipo ?? '' }, { key: 'base', header: 'Base', priority: 2, value: (v) => v.base ?? '' }];
      const apol: GeoDataTableColumn<NonNullable<Rel['conformidade']['apolicesVencendo']>[number]>[] = [
        { key: 'numero', header: 'Apólice', priority: 1 }, { key: 'seguradora', header: 'Seguradora', priority: 2, value: (a) => a.seguradora ?? '' },
        { key: 'vigenciaFim', header: 'Fim da vigência', type: 'date', priority: 1 }, { key: 'veiculos', header: 'Veículos', type: 'integer', priority: 1 }];
      return { chave, eyebrow: 'Seguro', titulo: 'Cobertura de seguro', icone: 'pi pi-shield',
        kpis: [{ rotulo: 'Sem seguro hoje', valor: inteiro(c.semSeguro?.length ?? 0), tom: c.semSeguro?.length ? 'danger' : 'success' },
          { rotulo: 'Apólices vencendo em 60 dias', valor: inteiro(c.apolicesVencendo?.length ?? 0) }],
        graficos: [],
        tabelas: [
          { id: 'sem', titulo: 'Veículos sem seguro', colunas, linhas: c.semSeguro ?? [], chaveLinha: (v) => v.idVeiculo, aoAtivar: (v) => navegar('veiculo', v.idVeiculo), rotuloAcao: 'Analisar', vazio: 'Todos têm seguro.' },
          { id: 'apol', titulo: 'Apólices vencendo', colunas: apol, linhas: c.apolicesVencendo ?? [], chaveLinha: (a) => a.id, vazio: 'Nenhuma apólice vencendo.' }
        ],
        links: [{ rotulo: 'Abrir seguros', icone: 'pi pi-shield', rota: '/frota/seguros' }] };
    }
    case 'sinistros': {
      const s = c.sinistros;
      if (!s) return null;
      return { chave, eyebrow: 'Sinistros', titulo: 'Sinistros do período', icone: 'pi pi-exclamation-triangle',
        kpis: [{ rotulo: 'Sinistros', valor: inteiro(s.total.atual), detalhe: textoVariacao(s.total.atual, s.total.anterior) },
          { rotulo: 'Com culpa do condutor', valor: inteiro(s.comCulpaDoCondutor), tom: s.comCulpaDoCondutor ? 'warning' : undefined },
          { rotulo: 'Franquias', valor: moeda(s.franquias) }],
        graficos: [grafico('tipos', 'Por tipo', 'bar-horizontal', s.porTipo.map((x) => x.rotulo), [{ name: 'Sinistros', values: s.porTipo.map((x) => x.total) }],
          { formato: 'integer', aoSelecionar: (i) => (s.porTipo[i] ? navegar('tipo-sinistro', s.porTipo[i].chave) : null), rotuloSelecao: 'Ver os sinistros' })],
        tabelas: [{ id: 'sin', titulo: 'Sinistros', colunas: colSinistros, linhas: s.lista, chaveLinha: (x) => x.id, aoAtivar: (x) => navegar('veiculo', x.idVeiculo), rotuloAcao: 'Analisar o veículo' }],
        links: [{ rotulo: 'Abrir sinistros', icone: 'pi pi-exclamation-circle', rota: '/frota/sinistros' }] };
    }
    case 'eventos': {
      const e = c.eventosConducao;
      if (!e) return null;
      const colunas: GeoDataTableColumn<NonNullable<Rel['conformidade']['condutores']>[number]>[] = [
        { key: 'nome', header: 'Condutor', priority: 1 }, { key: 'eventos', header: 'Eventos', type: 'integer', priority: 1 },
        { key: 'sinistros', header: 'Sinistros', type: 'integer', priority: 2 }, { key: 'sinistrosComCulpa', header: 'Com culpa', type: 'integer', priority: 2 }];
      const veic = [...m.r.veiculos].filter((v) => (v.eventosConducao ?? 0) > 0).sort((a, b) => (b.eventosConducao ?? 0) - (a.eventosConducao ?? 0)).slice(0, 12);
      return { chave, eyebrow: 'Condução', titulo: 'Eventos de condução', icone: 'pi pi-bolt',
        kpis: [{ rotulo: 'Eventos', valor: inteiro(e.total.atual), detalhe: textoVariacao(e.total.atual, e.total.anterior) },
          { rotulo: 'Por 100 km', valor: numero(e.por100Km.atual, 2), detalhe: textoVariacao(e.por100Km.atual, e.por100Km.anterior) }],
        graficos: [
          grafico('tipos', 'Por tipo', 'doughnut', e.porTipo.map((x) => x.rotulo), [{ name: 'Eventos', values: e.porTipo.map((x) => x.total) }], { formato: 'integer' }),
          grafico('veic', 'Por veículo', 'bar-horizontal', veic.map((v) => v.placa), [{ name: 'Eventos', values: veic.map((v) => v.eventosConducao ?? 0) }],
            { formato: 'integer', aoSelecionar: (i) => (veic[i] ? navegar('veiculo', veic[i].idVeiculo) : null), rotuloSelecao: 'Analisar o veículo' })
        ],
        tabelas: [{ id: 'cond', titulo: 'Condutores que pedem atenção', colunas, linhas: c.condutores ?? [], chaveLinha: (x) => x.nome, vazio: 'Sem eventos nem sinistros.' }],
        links: [{ rotulo: 'Abrir eventos de condução', icone: 'pi pi-exclamation-triangle', rota: '/frota/telemetria/eventos' }] };
    }
    case 'acidentes': {
      const ac = c.acidentes;
      const colunas: GeoDataTableColumn<Rel['conformidade']['acidentes']['lista'][number]>[] = [
        { key: 'placa', header: 'Veículo', priority: 1 }, { key: 'rotulo', header: 'Tipo', priority: 1 },
        { key: 'ocorridoEm', header: 'Data', type: 'date', priority: 1 }, { key: 'diasPerdidos', header: 'Dias perdidos', type: 'integer', priority: 2 }];
      return { chave, eyebrow: 'SST', titulo: 'Acidentes e danos com veículo', icone: 'pi pi-heart',
        kpis: [{ rotulo: 'Registros', valor: inteiro(ac.total) }, { rotulo: 'Dias perdidos', valor: inteiro(ac.diasPerdidos) }],
        graficos: [grafico('tipos', 'Por tipo', 'bar-horizontal', ac.porTipo.map((x) => x.rotulo), [{ name: 'Registros', values: ac.porTipo.map((x) => x.total) }], { formato: 'integer' })],
        tabelas: [{ id: 'ac', titulo: 'Registros', colunas, linhas: ac.lista, chaveLinha: (x) => x.idEvento, aoAtivar: (x) => navegar('veiculo', x.idVeiculo), rotuloAcao: 'Analisar o veículo', vazio: 'Nenhum registro.' }] };
    }
    default: return null;
  }
}

function vistaVeiculo(id: string, m: ModeloConformidade, chave: string): VistaAnalise | null {
  const v = m.r.veiculos.find((x) => x.idVeiculo === id);
  if (!v) return null;
  const c = m.r.conformidade;
  const docs = (m.documentos ?? []).filter((d) => d.idVeiculo === id);
  const pend = (m.pendencias ?? []).filter((p) => p.idVeiculo === id);
  const sin = (c.sinistros?.lista ?? []).filter((s) => s.idVeiculo === id);
  const semSeguro = c.semSeguro?.some((s) => s.idVeiculo === id);
  const destaques: DestaqueAnalise[] = [];
  if (docs.some((d) => d.dias < 0)) destaques.push({ icone: 'pi pi-file', tom: 'danger', texto: `Documento vencido: ${docs.filter((d) => d.dias < 0).map((d) => rotulo(ROTULO_DOCUMENTO, d.tipo)).join(', ')}.` });
  if (semSeguro) destaques.push({ icone: 'pi pi-shield', tom: 'danger', texto: 'Sem apólice de seguro vigente hoje.' });
  if ((v.coberturaChecklist ?? 1) < LIMITES_FROTA.checklistMeta) destaques.push({ icone: 'pi pi-list-check', tom: 'warning', texto: `Checklist em só ${pct(v.coberturaChecklist)} dos dias úteis.` });
  const kpis: KpiAnalise[] = [
    { rotulo: 'Checklist', valor: pct(v.coberturaChecklist), tom: (v.coberturaChecklist ?? 1) < LIMITES_FROTA.checklistMeta ? 'warning' : undefined },
    { rotulo: 'Pendências abertas', valor: inteiro(pend.length) },
    { rotulo: 'Documentos a tratar', valor: inteiro(docs.length), tom: docs.some((d) => d.dias < 0) ? 'danger' : undefined },
    { rotulo: 'Sinistros / eventos', valor: `${inteiro(sin.length)} / ${inteiro(v.eventosConducao)}` }
  ];
  return {
    chave, eyebrow: 'Veículo', titulo: v.placa, descricao: [v.tipo, v.base].filter(Boolean).join(' · '), icone: 'pi pi-car', kpis, destaques,
    graficos: [],
    tabelas: sin.length ? [{ id: 'sin', titulo: 'Sinistros', colunas: colSinistros, linhas: sin, chaveLinha: (s) => s.id, vazio: '' }] : undefined,
    origem: origemDocs(`veiculo-${id}`, `Documentos de ${v.placa}`, docs),
    origensExtras: pend.length ? [{ ...origemPend(`veiculo-${id}`, `Pendências de ${v.placa}`, pend), id: 'pendencias' }] : undefined,
    links: [{ ...linkVeiculo(id, 'documentos'), rotulo: 'Documentos do veículo', icone: 'pi pi-file' }, linkVeiculo(id),
      ...sin.slice(0, 1).map((s) => linkSinistro(s.id))],
    copiloto: { foco: { tipo: 'secao', id: `veiculo.${id}`, rotulo: v.placa }, pergunta: `O veículo ${v.placa} está regular para rodar? Liste o que falta (documentos, seguro, checklist, pendências) e a ordem para resolver.` }
  };
}
