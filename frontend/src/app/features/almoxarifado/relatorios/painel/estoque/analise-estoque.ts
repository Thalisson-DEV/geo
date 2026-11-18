import { CesDataTableColumn, CesTone } from '@ces/ui';
import { of } from 'rxjs';

import {
  EstoqueRelatorioResponse,
  MovimentacaoRelatorio,
  MovimentacoesRelatorioResponse,
  SaldoRelatorio
} from '../../../../../core/models/almoxarifado-relatorios.models';
import {
  DestaqueAnalise,
  DetalheRegistro,
  KpiAnalise,
  LinkAnalise,
  OrigemAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  DIA_MS,
  Grupo,
  ROTULO_CONDICAO,
  ROTULO_TIPO_ESTOQUE,
  agrupar,
  alvo,
  dataBr,
  dias,
  diasEntre,
  dividir,
  grafico,
  graficoGrupos,
  inteiro,
  linkMovimentacoesMaterial,
  linkObra,
  linkSaldoEstoque,
  natureza,
  navegar,
  numero,
  origemMovimentacoes,
  pct,
  plural,
  priorizar,
  qtd,
  rotulo,
  soma
} from '../almox-analise-comum';

/** Sem saída há mais que isso: material parado. */
export const DIAS_PARADO = 90;
/** Com a equipe há mais que isso sem uso: material esquecido em campo. */
export const DIAS_EM_CAMPO = 30;

export type Faixa = 'ruptura' | 'critica' | 'baixa' | 'adequada' | 'excesso' | 'parado' | 'sem-consumo';

export const FAIXAS: { id: Faixa; rotulo: string; descricao: string; tom: CesTone; icone: string }[] = [
  { id: 'ruptura', rotulo: 'Ruptura', descricao: 'Teve saída no período e está sem saldo', tom: 'danger', icone: 'pi pi-ban' },
  { id: 'critica', rotulo: 'Menos de 7 dias', descricao: 'O saldo acaba em menos de uma semana no ritmo atual', tom: 'danger', icone: 'pi pi-hourglass' },
  { id: 'baixa', rotulo: '7 a 15 dias', descricao: 'Repor já para não faltar', tom: 'warning', icone: 'pi pi-arrow-down' },
  { id: 'adequada', rotulo: '15 a 90 dias', descricao: 'Cobertura saudável', tom: 'success', icone: 'pi pi-check-circle' },
  { id: 'excesso', rotulo: 'Mais de 90 dias', descricao: 'Saldo para mais de três meses: capital parado', tom: 'warning', icone: 'pi pi-database' },
  { id: 'sem-consumo', rotulo: 'Sem saída no período', descricao: 'Tem saldo, não saiu no período, mas saiu nos últimos 90 dias', tom: 'info', icone: 'pi pi-minus-circle' },
  { id: 'parado', rotulo: 'Parado', descricao: `Sem nenhuma saída há mais de ${DIAS_PARADO} dias`, tom: 'danger', icone: 'pi pi-pause-circle' }
];
export const ROTULO_FAIXA = Object.fromEntries(FAIXAS.map((f) => [f.id, f.rotulo])) as Record<Faixa, string>;

/** Um material num almoxarifado: saldo, consumo e cobertura. */
export interface PosicaoAlmox {
  chave: string;
  idEstoque: string;
  estoque: string;
  idBase: string | null;
  base: string | null;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  saldo: number;
  sucata: number;
  series: number;
  seriesReservadas: number;
  /** Saídas para equipes e obras no período (quantidade). */
  consumo: number;
  consumoDia: number;
  /** Dias de cobertura no ritmo do período; nulo sem consumo. */
  cobertura: number | null;
  ultimaEntrada: string | null;
  ultimaSaida: string | null;
  diasSemSaida: number | null;
  faixa: Faixa;
  movs: MovimentacaoRelatorio[];
}

/** Saldo em poder de uma equipe ou obra. */
export interface PosicaoCampo {
  chave: string;
  saldo: SaldoRelatorio;
  diasDesdeEntrada: number | null;
  diasSemSaida: number | null;
}

export interface FiltrosEstoque {
  tipos: string[];
  condicoes: string[];
  faixas: string[];
  materiais: string[];
}

export interface ModeloEstoque {
  e: EstoqueRelatorioResponse;
  mov: MovimentacoesRelatorioResponse;
  diasPeriodo: number;
  saldos: SaldoRelatorio[];
  almox: PosicaoAlmox[];
  porFaixa: Record<Faixa, PosicaoAlmox[]>;
  sucataAlmox: SaldoRelatorio[];
  campo: PosicaoCampo[];
  campoEsquecido: PosicaoCampo[];
  sucataCampo: SaldoRelatorio[];
  obras: SaldoRelatorio[];
  porAlmox: Grupo<PosicaoAlmox>[];
  porEquipe: Grupo<PosicaoCampo>[];
  porObra: Grupo<SaldoRelatorio>[];
  materiais: number;
  seriesReservadas: number;
  series: number;
}

const agora = (iso: string) => Date.parse(iso);
const diasDesde = (iso: string | null, ref: number) => (iso ? Math.max(0, (ref - Date.parse(iso)) / DIA_MS) : null);

export function aceitaFiltrosEstoque(f: FiltrosEstoque) {
  const tipos = f.tipos.length ? new Set(f.tipos) : null;
  const cond = f.condicoes.length ? new Set(f.condicoes) : null;
  const mat = f.materiais.length ? new Set(f.materiais) : null;
  return (s: { tipoEstoque: string; condicao: string; idMaterial: string }) =>
    (!tipos || tipos.has(s.tipoEstoque)) && (!cond || cond.has(s.condicao)) && (!mat || mat.has(s.idMaterial));
}

export function modeloEstoque(e: EstoqueRelatorioResponse, mov: MovimentacoesRelatorioResponse,
                              aceitaSaldo: (s: SaldoRelatorio) => boolean, aceitaMov: (m: MovimentacaoRelatorio) => boolean,
                              faixas: string[]): ModeloEstoque {
  const ref = agora(e.geradoEm);
  const diasPeriodo = diasEntre(mov.de, mov.ate).length;
  const saldos = e.saldos.filter(aceitaSaldo);
  const movs = mov.movimentacoes.filter((m) => !m.anterior && aceitaMov(m));

  // Consumo: saídas do almoxarifado para equipes e obras, por almoxarifado e material.
  const saidas = new Map<string, MovimentacaoRelatorio[]>();
  for (const m of movs) {
    if (natureza(m) !== 'atendimento' || m.condicao !== 'NOVO' || !m.idOrigem) continue;
    const k = `${m.idOrigem}|${m.idMaterial}`;
    const l = saidas.get(k);
    if (l) l.push(m);
    else saidas.set(k, [m]);
  }

  const posicoes = new Map<string, PosicaoAlmox>();
  const fisicos = saldos.filter((s) => s.tipoEstoque === 'FISICO');
  for (const s of fisicos) {
    const k = `${s.idEstoque}|${s.idMaterial}`;
    let p = posicoes.get(k);
    if (!p) {
      posicoes.set(k, (p = {
        chave: k, idEstoque: s.idEstoque, estoque: s.estoque, idBase: s.idBase, base: s.base, idMaterial: s.idMaterial,
        codigo: s.codigo, descricao: s.descricao, unidade: s.unidade, saldo: 0, sucata: 0, series: 0, seriesReservadas: 0,
        consumo: 0, consumoDia: 0, cobertura: null, ultimaEntrada: s.ultimaEntrada, ultimaSaida: s.ultimaSaida, diasSemSaida: null,
        faixa: 'adequada', movs: []
      }));
    }
    if (s.condicao === 'SUCATA') p.sucata += s.quantidade;
    else p.saldo += s.quantidade;
    p.series += s.condicao === 'NOVO' ? s.series : 0;
    p.seriesReservadas += s.seriesReservadas;
  }
  // Rupturas: saiu no período e não há saldo novo (aceitas pelo recorte via a movimentação).
  for (const [k, l] of saidas) {
    if (posicoes.has(k) && posicoes.get(k)!.saldo > 0) continue;
    const m = l[0];
    if (!posicoes.has(k)) {
      posicoes.set(k, {
        chave: k, idEstoque: m.idOrigem!, estoque: m.origem ?? 'Almoxarifado', idBase: m.idBase, base: m.base, idMaterial: m.idMaterial,
        codigo: m.codigo, descricao: m.descricao, unidade: m.unidade, saldo: 0, sucata: 0, series: 0, seriesReservadas: 0,
        consumo: 0, consumoDia: 0, cobertura: null, ultimaEntrada: null, ultimaSaida: l[0].dataHora, diasSemSaida: null, faixa: 'ruptura', movs: []
      });
    }
  }
  for (const p of posicoes.values()) {
    const l = saidas.get(p.chave) ?? [];
    p.movs = movs.filter((m) => m.idMaterial === p.idMaterial && (m.idOrigem === p.idEstoque || m.idDestino === p.idEstoque));
    p.consumo = soma(l, (m) => m.quantidade);
    p.consumoDia = p.consumo / diasPeriodo;
    p.cobertura = p.consumoDia > 0 ? p.saldo / p.consumoDia : null;
    p.diasSemSaida = diasDesde(p.ultimaSaida, ref);
    p.faixa = faixaDe(p);
  }
  const filtroFaixa = faixas.length ? new Set(faixas) : null;
  // Só os pares com algo a dizer: saldo novo, sucata ou ruptura.
  const almox = [...posicoes.values()]
    .filter((p) => p.saldo > 0 || p.faixa === 'ruptura' || p.sucata > 0)
    .filter((p) => !filtroFaixa || filtroFaixa.has(p.faixa))
    .sort((a, b) => ordemFaixa(a.faixa) - ordemFaixa(b.faixa) || (a.cobertura ?? 1e9) - (b.cobertura ?? 1e9) || b.consumo - a.consumo);
  const porFaixa = Object.fromEntries(FAIXAS.map((f) => [f.id, [] as PosicaoAlmox[]])) as Record<Faixa, PosicaoAlmox[]>;
  for (const p of almox) if (p.saldo > 0 || p.faixa === 'ruptura') porFaixa[p.faixa].push(p);

  const campo: PosicaoCampo[] = saldos
    .filter((s) => s.tipoEstoque === 'CAMPO' && s.condicao === 'NOVO')
    .map((s) => ({ chave: `${s.idEstoque}|${s.idMaterial}`, saldo: s, diasDesdeEntrada: diasDesde(s.ultimaEntrada, ref), diasSemSaida: diasDesde(s.ultimaSaida ?? s.ultimaEntrada, ref) }));
  const obras = saldos.filter((s) => s.tipoEstoque === 'OBRA');
  return {
    e, mov, diasPeriodo, saldos, almox, porFaixa,
    sucataAlmox: saldos.filter((s) => s.tipoEstoque === 'FISICO' && s.condicao === 'SUCATA'),
    campo,
    campoEsquecido: campo.filter((c) => (c.diasSemSaida ?? 0) >= DIAS_EM_CAMPO).sort((a, b) => (b.diasSemSaida ?? 0) - (a.diasSemSaida ?? 0)),
    sucataCampo: saldos.filter((s) => s.tipoEstoque === 'CAMPO' && s.condicao === 'SUCATA'),
    obras,
    porAlmox: agrupar(almox, (p) => p.idEstoque, (p) => p.estoque),
    porEquipe: agrupar(campo, (c) => c.saldo.idEstoque, (c) => c.saldo.equipe ?? c.saldo.estoque),
    porObra: agrupar(obras, (s) => s.idEstoque, (s) => (s.obra ? `Obra ${s.obra}` : s.estoque)),
    materiais: new Set(saldos.map((s) => s.idMaterial)).size,
    seriesReservadas: soma(saldos, (s) => s.seriesReservadas),
    series: soma(saldos, (s) => s.series)
  };
}

function faixaDe(p: PosicaoAlmox): Faixa {
  if (p.saldo <= 0) return p.consumo > 0 ? 'ruptura' : 'adequada';
  if (p.consumo <= 0) return (p.diasSemSaida ?? Infinity) > DIAS_PARADO ? 'parado' : 'sem-consumo';
  const c = p.cobertura ?? Infinity;
  return c < 7 ? 'critica' : c < 15 ? 'baixa' : c <= 90 ? 'adequada' : 'excesso';
}

const ordemFaixa = (f: Faixa) => FAIXAS.findIndex((x) => x.id === f);

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoEstoque(m: ModeloEstoque): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const l: LeituraGerencial[] = [];
  const f = m.porFaixa;
  if (f.ruptura.length) {
    const p = f.ruptura[0];
    l.push({ id: 'ruptura', tom: 'danger', icone: 'pi pi-ban', titulo: 'Material em falta', valor: plural(f.ruptura.length, 'item', 'itens'),
      texto: `Saiu no período e acabou. ${p.codigo} (${p.descricao}) em ${p.estoque} é o de maior consumo entre eles: as próximas solicitações vão ficar pendentes.`,
      acao: { rotulo: 'Ver as faltas', alvo: alvo('faixa', 'ruptura') } });
  }
  if (f.critica.length) {
    l.push({ id: 'critica', tom: 'danger', icone: 'pi pi-hourglass', titulo: 'Acaba em menos de 7 dias', valor: plural(f.critica.length, 'item', 'itens'),
      texto: 'No ritmo de saída do período, o saldo não chega à semana que vem. Peça reposição já.',
      acao: { rotulo: 'Ver os itens', alvo: alvo('faixa', 'critica') } });
  }
  if (f.parado.length) {
    l.push({ id: 'parado', tom: 'warning', icone: 'pi pi-pause-circle', titulo: 'Material parado', valor: plural(f.parado.length, 'item', 'itens'),
      texto: `Sem nenhuma saída há mais de ${DIAS_PARADO} dias. Avalie remanejar para outra base, devolver ao fornecedor ou baixar por obsolescência.`,
      acao: { rotulo: 'Ver o parado', alvo: alvo('faixa', 'parado') } });
  }
  if (f.excesso.length) {
    l.push({ id: 'excesso', tom: 'warning', icone: 'pi pi-database', titulo: 'Estoque acima do necessário', valor: plural(f.excesso.length, 'item', 'itens'),
      texto: 'Saldo para mais de 90 dias no ritmo atual. Segure as próximas compras desses itens ou remaneje para quem está em falta.',
      acao: { rotulo: 'Ver o excesso', alvo: alvo('faixa', 'excesso') } });
  }
  if (m.campoEsquecido.length) {
    const equipes = new Set(m.campoEsquecido.map((c) => c.saldo.idEstoque)).size;
    l.push({ id: 'campo', tom: 'warning', icone: 'pi pi-users', titulo: 'Material esquecido com as equipes', valor: plural(m.campoEsquecido.length, 'item', 'itens'),
      texto: `${plural(equipes, 'equipe tem', 'equipes têm')} material sem movimento há mais de ${DIAS_EM_CAMPO} dias. Cobre a aplicação ou a devolução.`,
      acao: { rotulo: 'Ver com as equipes', alvo: alvo('kpi', 'campo-esquecido') } });
  }
  if (m.sucataCampo.length) {
    const equipes = agrupar(m.sucataCampo, (s) => s.idEstoque, (s) => s.equipe ?? s.estoque);
    l.push({ id: 'sucata-campo', tom: 'warning', icone: 'pi pi-trash', titulo: 'Sucata retida em campo', valor: plural(equipes.length, 'equipe', 'equipes'),
      texto: `${equipes[0].rotulo} é quem mais segura sucata. Sucata em campo é risco de perda e de cobrança da concessionária: traga ao almoxarifado.`,
      acao: { rotulo: 'Ver a sucata', alvo: alvo('kpi', 'sucata-campo') } });
  }
  if (m.sucataAlmox.length) {
    l.push({ id: 'sucata-almox', tom: 'info', icone: 'pi pi-inbox', titulo: 'Sucata aguardando baixa', valor: plural(m.sucataAlmox.length, 'item', 'itens'),
      texto: 'Sucata no almoxarifado ocupa espaço e precisa ser destinada (baixa por sucateamento).',
      acao: { rotulo: 'Ver a sucata', alvo: alvo('kpi', 'sucata-almox') } });
  }
  if (m.obras.length) {
    l.push({ id: 'obras', tom: 'info', icone: 'pi pi-building', titulo: 'Material em custódia de obras', valor: plural(m.porObra.length, 'obra', 'obras'),
      texto: 'Saldo que está nas obras e ainda não foi aplicado nem devolvido. Confira antes do fechamento.',
      acao: { rotulo: 'Ver as obras', alvo: alvo('kpi', 'obras') } });
  }
  const graves = l.filter((x) => x.tom === 'danger').length;
  const atencao = l.filter((x) => x.tom === 'warning').length;
  const saudaveis = f.adequada.length;
  const comConsumo = m.almox.filter((p) => p.consumo > 0).length;
  return {
    veredito: {
      tom: graves ? 'danger' : atencao ? 'warning' : 'success',
      rotulo: graves ? 'Agir agora' : atencao ? 'Acompanhar' : 'Sob controle',
      titulo: graves ? `${plural(f.ruptura.length + f.critica.length, 'item em falta ou perto de faltar', 'itens em falta ou perto de faltar')}`
        : `${plural(m.almox.filter((p) => p.saldo > 0).length, 'item', 'itens')} com saldo nos almoxarifados`,
      texto: `${plural(m.materiais, 'material', 'materiais')} em estoque. ${comConsumo ? `${pct(dividir(saudaveis, comConsumo), 0)} dos itens que giraram estão com cobertura saudável (15 a 90 dias).` : 'Nenhum item teve saída no período.'}`,
      progresso: comConsumo ? { valor: (saudaveis / comConsumo) * 100, rotulo: `${pct(saudaveis / comConsumo, 0)} com cobertura saudável` } : undefined
    },
    leituras: priorizar(l),
    pergunta: 'Faça a leitura gerencial do estoque: o que vai faltar, o que está sobrando ou parado, o que está esquecido com as equipes e o que comprar ou remanejar primeiro.'
  };
}

// ── Tabelas ──────────────────────────────────────────────────────────────────────────────────────

export const colPosicao: CesDataTableColumn<PosicaoAlmox>[] = [
  { key: 'codigo', header: 'Código', priority: 1 },
  { key: 'descricao', header: 'Material', priority: 1 },
  { key: 'estoque', header: 'Almoxarifado', priority: 2 },
  { key: 'saldo', header: 'Saldo', type: 'custom', priority: 1, value: (p) => p.saldo, display: (p) => qtd(p.saldo, p.unidade) },
  { key: 'consumo', header: 'Saída no período', type: 'custom', priority: 2, value: (p) => p.consumo, display: (p) => qtd(p.consumo, p.unidade) },
  { key: 'consumoDia', header: 'Por dia', type: 'custom', priority: 3, value: (p) => p.consumoDia, display: (p) => numero(p.consumoDia, 2) },
  { key: 'cobertura', header: 'Cobertura', type: 'custom', priority: 1, value: (p) => p.cobertura ?? (p.saldo > 0 ? 1e9 : -1),
    display: (p) => (p.faixa === 'ruptura' ? 'Em falta' : p.cobertura == null ? '—' : dias(p.cobertura)) },
  { key: 'faixa', header: 'Situação', priority: 2, value: (p) => ROTULO_FAIXA[p.faixa] },
  { key: 'ultimaSaida', header: 'Última saída', type: 'custom', priority: 3, value: (p) => p.ultimaSaida ?? '', display: (p) => dataBr(p.ultimaSaida) },
  { key: 'sucata', header: 'Sucata', type: 'custom', priority: 3, value: (p) => p.sucata, display: (p) => (p.sucata ? qtd(p.sucata, p.unidade) : '—') }
];

export const colCampo: CesDataTableColumn<PosicaoCampo>[] = [
  { key: 'equipe', header: 'Equipe', priority: 1, value: (c) => c.saldo.equipe ?? c.saldo.estoque },
  { key: 'material', header: 'Material', priority: 1, value: (c) => `${c.saldo.codigo} · ${c.saldo.descricao}` },
  { key: 'quantidade', header: 'Saldo', type: 'custom', priority: 1, value: (c) => c.saldo.quantidade, display: (c) => qtd(c.saldo.quantidade, c.saldo.unidade) },
  { key: 'base', header: 'Base', priority: 3, value: (c) => c.saldo.base ?? '—' },
  { key: 'ultimaEntrada', header: 'Recebeu em', type: 'custom', priority: 3, value: (c) => c.saldo.ultimaEntrada ?? '', display: (c) => dataBr(c.saldo.ultimaEntrada) },
  { key: 'diasSemSaida', header: 'Sem movimento', type: 'custom', priority: 2, value: (c) => c.diasSemSaida ?? -1, display: (c) => dias(c.diasSemSaida) }
];

export const colSaldo: CesDataTableColumn<SaldoRelatorio>[] = [
  { key: 'estoque', header: 'Estoque', priority: 1, value: (s) => (s.obra ? `Obra ${s.obra}` : s.equipe ?? s.estoque) },
  { key: 'tipo', header: 'Tipo', priority: 3, value: (s) => rotulo(ROTULO_TIPO_ESTOQUE, s.tipoEstoque) },
  { key: 'material', header: 'Material', priority: 1, value: (s) => `${s.codigo} · ${s.descricao}` },
  { key: 'condicao', header: 'Condição', priority: 3, value: (s) => rotulo(ROTULO_CONDICAO, s.condicao) },
  { key: 'quantidade', header: 'Saldo', type: 'custom', priority: 1, value: (s) => s.quantidade, display: (s) => qtd(s.quantidade, s.unidade) },
  { key: 'ultimaEntrada', header: 'Última entrada', type: 'custom', priority: 3, value: (s) => s.ultimaEntrada ?? '', display: (s) => dataBr(s.ultimaEntrada) },
  { key: 'ultimaSaida', header: 'Última saída', type: 'custom', priority: 3, value: (s) => s.ultimaSaida ?? '', display: (s) => dataBr(s.ultimaSaida) }
];

function detalheSaldo(s: SaldoRelatorio): DetalheRegistro {
  const links: LinkAnalise[] = [linkSaldoEstoque(s.idEstoque)];
  if (s.idObra) links.push(linkObra(s.idObra));
  return {
    titulo: `${s.codigo} · ${s.descricao}`,
    subtitulo: s.obra ? `Obra ${s.obra}` : s.equipe ?? s.estoque,
    campos: [
      { rotulo: 'Saldo', valor: qtd(s.quantidade, s.unidade), icone: 'pi pi-box' },
      { rotulo: 'Condição', valor: rotulo(ROTULO_CONDICAO, s.condicao) },
      { rotulo: 'Estoque', valor: s.estoque },
      { rotulo: 'Tipo', valor: rotulo(ROTULO_TIPO_ESTOQUE, s.tipoEstoque) },
      { rotulo: 'Base', valor: s.base ?? '—' },
      { rotulo: 'Última entrada', valor: dataBr(s.ultimaEntrada) },
      { rotulo: 'Última saída', valor: dataBr(s.ultimaSaida) },
      ...(s.series ? [{ rotulo: 'Séries', valor: `${inteiro(s.series)} (${inteiro(s.seriesReservadas)} reservadas)` }] : [])
    ],
    links
  };
}

function origemSaldos(chave: string, titulo: string, linhas: readonly SaldoRelatorio[]): OrigemAnalise<SaldoRelatorio> {
  return {
    chave, titulo, rotuloAba: 'Saldos', icone: 'pi pi-database', colunas: colSaldo,
    carregar: () => of({ linhas: [...linhas], total: linhas.length }),
    chaveLinha: (s) => `${s.idEstoque}|${s.idMaterial}|${s.condicao}`,
    rotuloLinha: (s) => `${s.codigo} em ${s.equipe ?? s.estoque}`,
    detalhar: detalheSaldo,
    nomeArquivo: `almoxarifado-saldos-${chave}`,
    vazio: 'Nenhum saldo neste recorte.'
  };
}

// ── Análise detalhada ────────────────────────────────────────────────────────────────────────────

export function vistaEstoque(a: { dimension: string; value: string }, m: ModeloEstoque): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  switch (a.dimension) {
    case 'faixa': return vistaFaixa(a.value as Faixa, m, chave);
    case 'kpi': return vistaKpi(a.value, m, chave);
    case 'almox': return vistaAlmox(a.value, m, chave);
    case 'equipe': return vistaEquipe(a.value, m, chave);
    case 'obra': return vistaObra(a.value, m, chave);
    case 'posicao': return vistaPosicao(a.value, m, chave);
    case 'material': return vistaMaterial(a.value, m, chave);
    default: return null;
  }
}

function tabelaPosicoes(id: string, titulo: string, linhas: PosicaoAlmox[]) {
  return { id, titulo, colunas: colPosicao, linhas, chaveLinha: (p: PosicaoAlmox) => p.chave,
    aoAtivar: (p: PosicaoAlmox) => navegar('posicao', p.chave), rotuloAcao: 'Analisar', nomeArquivo: `almoxarifado-${id}` };
}

function vistaFaixa(f: Faixa, m: ModeloEstoque, chave: string): VistaAnalise | null {
  const def = FAIXAS.find((x) => x.id === f);
  if (!def) return null;
  const l = m.porFaixa[f];
  const presentes = FAIXAS.filter((x) => m.porFaixa[x.id].length);
  const j = presentes.findIndex((x) => x.id === f);
  const almox = agrupar(l, (p) => p.idEstoque, (p) => p.estoque);
  const destaques: DestaqueAnalise[] = [];
  if (f === 'ruptura' || f === 'critica') {
    const outros = l.filter((p) => m.almox.some((q) => q.idMaterial === p.idMaterial && q.idEstoque !== p.idEstoque && (q.faixa === 'excesso' || q.faixa === 'parado')));
    if (outros.length) destaques.push({ icone: 'pi pi-arrow-right-arrow-left', tom: 'success',
      texto: `${plural(outros.length, 'item tem', 'itens têm')} sobra em outro almoxarifado: dá para remanejar em vez de comprar.` });
  }
  return {
    chave, eyebrow: 'Cobertura', titulo: def.rotulo, descricao: def.descricao, icone: 'pi pi-gauge',
    kpis: [
      { rotulo: 'Itens', valor: inteiro(l.length), tom: def.tom === 'danger' && l.length ? 'danger' : undefined },
      { rotulo: 'Materiais', valor: inteiro(new Set(l.map((p) => p.idMaterial)).size) },
      { rotulo: 'Almoxarifados', valor: inteiro(almox.length) }
    ],
    destaques,
    anterior: j > 0 ? { alvo: alvo('faixa', presentes[j - 1].id), rotulo: presentes[j - 1].rotulo } : undefined,
    proximo: j >= 0 && j < presentes.length - 1 ? { alvo: alvo('faixa', presentes[j + 1].id), rotulo: presentes[j + 1].rotulo } : undefined,
    graficos: [
      graficoGrupos('alm', 'Por almoxarifado', almox, 'Itens', (g) => g.linhas.length, 'almox'),
      ...(f === 'parado'
        ? [grafico('dias', 'Dias sem saída', 'bar-horizontal', l.slice(0, 15).map((p) => `${p.codigo} · ${p.estoque}`),
          [{ name: 'Dias', values: l.slice(0, 15).map((p) => Math.round(p.diasSemSaida ?? 0)) }],
          { aoSelecionar: (i) => (l[i] ? navegar('posicao', l[i].chave) : null), rotuloSelecao: 'Analisar' })]
        : [grafico('cob', 'Saída no período (maiores)', 'bar-horizontal', [...l].sort((a, b) => b.consumo - a.consumo).slice(0, 15).map((p) => `${p.codigo} · ${p.estoque}`),
          [{ name: 'Saída', values: [...l].sort((a, b) => b.consumo - a.consumo).slice(0, 15).map((p) => p.consumo) }],
          { aoSelecionar: (i) => { const s = [...l].sort((a, b) => b.consumo - a.consumo)[i]; return s ? navegar('posicao', s.chave) : null; }, rotuloSelecao: 'Analisar' })])
    ],
    tabelas: [tabelaPosicoes(`faixa-${f}`, def.rotulo, l)]
  };
}

function vistaKpi(qual: string, m: ModeloEstoque, chave: string): VistaAnalise | null {
  if (qual === 'campo' || qual === 'campo-esquecido') {
    const l = qual === 'campo' ? m.campo : m.campoEsquecido;
    const eq = agrupar(l, (c) => c.saldo.idEstoque, (c) => c.saldo.equipe ?? c.saldo.estoque);
    return {
      chave, eyebrow: 'Em campo', titulo: qual === 'campo' ? 'Material em poder das equipes' : `Sem movimento há mais de ${DIAS_EM_CAMPO} dias com as equipes`,
      icone: 'pi pi-users',
      descricao: 'Saldo novo nos estoques das equipes: foi entregue e ainda não foi aplicado em nota nem devolvido.',
      kpis: [
        { rotulo: 'Itens', valor: inteiro(l.length) },
        { rotulo: 'Equipes', valor: inteiro(eq.length) },
        { rotulo: 'Materiais', valor: inteiro(new Set(l.map((c) => c.saldo.idMaterial)).size) },
        { rotulo: 'Mais antigo', valor: dias(Math.max(0, ...l.map((c) => c.diasSemSaida ?? 0))) }
      ],
      graficos: [graficoGrupos('eq', 'Por equipe', eq, 'Itens', (g) => g.linhas.length, 'equipe')],
      tabelas: [{ id: 'campo', titulo: 'Itens com as equipes', colunas: colCampo, linhas: l, chaveLinha: (c) => c.chave,
        aoAtivar: (c) => navegar('equipe', c.saldo.idEstoque), rotuloAcao: 'Analisar a equipe', nomeArquivo: 'almoxarifado-material-com-equipes' }]
    };
  }
  if (qual === 'sucata-campo' || qual === 'sucata-almox') {
    const l = qual === 'sucata-campo' ? m.sucataCampo : m.sucataAlmox;
    const g = agrupar(l, (s) => s.idEstoque, (s) => s.equipe ?? s.estoque, (x) => x.linhas.length);
    return {
      chave, eyebrow: 'Sucata', titulo: qual === 'sucata-campo' ? 'Sucata retida com as equipes' : 'Sucata no almoxarifado aguardando baixa', icone: 'pi pi-trash',
      kpis: [
        { rotulo: 'Itens', valor: inteiro(l.length) },
        { rotulo: qual === 'sucata-campo' ? 'Equipes' : 'Almoxarifados', valor: inteiro(g.length) },
        { rotulo: 'Materiais', valor: inteiro(new Set(l.map((s) => s.idMaterial)).size) }
      ],
      graficos: [graficoGrupos('onde', qual === 'sucata-campo' ? 'Por equipe' : 'Por almoxarifado', g, 'Itens', (x) => x.linhas.length,
        qual === 'sucata-campo' ? 'equipe' : 'almox')],
      origem: origemSaldos(qual, 'Saldos de sucata', l)
    };
  }
  if (qual === 'obras') {
    return {
      chave, eyebrow: 'Obras', titulo: 'Material em custódia das obras', icone: 'pi pi-building',
      descricao: 'Saldo nos estoques de obra: entregue para a obra e ainda não aplicado nem devolvido.',
      kpis: [
        { rotulo: 'Obras com saldo', valor: inteiro(m.porObra.length) },
        { rotulo: 'Itens', valor: inteiro(m.obras.length) },
        { rotulo: 'Materiais', valor: inteiro(new Set(m.obras.map((s) => s.idMaterial)).size) }
      ],
      graficos: [graficoGrupos('obras', 'Itens por obra', m.porObra, 'Itens', (g) => g.linhas.length, 'obra')],
      origem: origemSaldos('obras', 'Saldos das obras', m.obras)
    };
  }
  if (qual === 'itens') {
    return {
      chave, eyebrow: 'Posição', titulo: 'Tudo o que está nos almoxarifados', icone: 'pi pi-warehouse',
      kpis: [
        { rotulo: 'Itens com saldo', valor: inteiro(m.almox.filter((p) => p.saldo > 0).length) },
        { rotulo: 'Materiais', valor: inteiro(new Set(m.almox.map((p) => p.idMaterial)).size) },
        { rotulo: 'Com sucata', valor: inteiro(m.almox.filter((p) => p.sucata > 0).length) }
      ],
      graficos: [
        grafico('faixas', 'Itens por situação de cobertura', 'bar', FAIXAS.map((f) => f.rotulo), [{ name: 'Itens', values: FAIXAS.map((f) => m.porFaixa[f.id].length) }],
          { aoSelecionar: (i) => navegar('faixa', FAIXAS[i].id), rotuloSelecao: 'Analisar a situação' }),
        graficoGrupos('alm', 'Por almoxarifado', m.porAlmox, 'Itens', (g) => g.linhas.length, 'almox')
      ],
      tabelas: [tabelaPosicoes('posicao', 'Posição por material e almoxarifado', m.almox)]
    };
  }
  if (qual === 'series') {
    const l = m.saldos.filter((s) => s.series > 0);
    return {
      chave, eyebrow: 'Números de série', titulo: 'Séries em estoque', icone: 'pi pi-qrcode',
      kpis: [
        { rotulo: 'Séries', valor: inteiro(m.series) },
        { rotulo: 'Reservadas', valor: inteiro(m.seriesReservadas), detalhe: pct(dividir(m.seriesReservadas, m.series), 0) },
        { rotulo: 'Materiais', valor: inteiro(new Set(l.map((s) => s.idMaterial)).size) }
      ],
      graficos: [graficoGrupos('onde', 'Séries por estoque', agrupar(l, (s) => s.idEstoque, (s) => s.equipe ?? s.estoque, (g) => soma(g.linhas, (s) => s.series)),
        'Séries', (g) => soma(g.linhas, (s) => s.series), null)],
      origem: origemSaldos('series', 'Saldos com número de série', l)
    };
  }
  return null;
}

function vistaAlmox(id: string, m: ModeloEstoque, chave: string): VistaAnalise | null {
  const g = m.porAlmox.find((x) => x.chave === id);
  if (!g) return null;
  const i = m.porAlmox.indexOf(g);
  const l = g.linhas;
  const cont = (f: Faixa) => l.filter((p) => p.faixa === f).length;
  const presentes = FAIXAS.filter((f) => cont(f.id));
  return {
    chave, eyebrow: 'Almoxarifado', titulo: g.rotulo, icone: 'pi pi-warehouse',
    kpis: [
      { rotulo: 'Itens com saldo', valor: inteiro(l.filter((p) => p.saldo > 0).length) },
      { rotulo: 'Em falta', valor: inteiro(cont('ruptura')), tom: cont('ruptura') ? 'danger' : undefined },
      { rotulo: 'Menos de 15 dias', valor: inteiro(cont('critica') + cont('baixa')), tom: cont('critica') ? 'warning' : undefined },
      { rotulo: 'Parados', valor: inteiro(cont('parado')), tom: cont('parado') ? 'warning' : undefined }
    ],
    anterior: i > 0 ? { alvo: alvo('almox', m.porAlmox[i - 1].chave), rotulo: m.porAlmox[i - 1].rotulo } : undefined,
    proximo: i < m.porAlmox.length - 1 ? { alvo: alvo('almox', m.porAlmox[i + 1].chave), rotulo: m.porAlmox[i + 1].rotulo } : undefined,
    graficos: [grafico('faixas', 'Itens por situação', 'doughnut', presentes.map((f) => f.rotulo), [{ name: 'Itens', values: presentes.map((f) => cont(f.id)) }],
      { aoSelecionar: (k) => (presentes[k] ? navegar('faixa', presentes[k].id) : null), rotuloSelecao: 'Analisar a situação' })],
    tabelas: [tabelaPosicoes(`almox-${id}`, `Posição de ${g.rotulo}`, l)],
    links: [linkSaldoEstoque(id)]
  };
}

function vistaEquipe(idEstoque: string, m: ModeloEstoque, chave: string): VistaAnalise | null {
  const g = m.porEquipe.find((x) => x.chave === idEstoque);
  const sucata = m.sucataCampo.filter((s) => s.idEstoque === idEstoque);
  if (!g && !sucata.length) return null;
  const l = g?.linhas ?? [];
  const nome = g?.rotulo ?? sucata[0].equipe ?? sucata[0].estoque;
  const i = g ? m.porEquipe.indexOf(g) : -1;
  const velhos = l.filter((c) => (c.diasSemSaida ?? 0) >= DIAS_EM_CAMPO);
  const destaques: DestaqueAnalise[] = [];
  if (velhos.length) destaques.push({ icone: 'pi pi-clock', tom: 'warning', texto: `${plural(velhos.length, 'item parado', 'itens parados')} há mais de ${DIAS_EM_CAMPO} dias com a equipe.` });
  if (sucata.length) destaques.push({ icone: 'pi pi-trash', tom: 'warning', texto: `Tem ${plural(sucata.length, 'item', 'itens')} de sucata para devolver.` });
  return {
    chave, eyebrow: 'Equipe', titulo: nome, icone: 'pi pi-users',
    kpis: [
      { rotulo: 'Itens novos', valor: inteiro(l.length) },
      { rotulo: 'Parados há +30 dias', valor: inteiro(velhos.length), tom: velhos.length ? 'warning' : undefined },
      { rotulo: 'Itens de sucata', valor: inteiro(sucata.length), tom: sucata.length ? 'warning' : undefined }
    ],
    destaques,
    anterior: i > 0 ? { alvo: alvo('equipe', m.porEquipe[i - 1].chave), rotulo: m.porEquipe[i - 1].rotulo } : undefined,
    proximo: i >= 0 && i < m.porEquipe.length - 1 ? { alvo: alvo('equipe', m.porEquipe[i + 1].chave), rotulo: m.porEquipe[i + 1].rotulo } : undefined,
    graficos: [grafico('dias', 'Dias sem movimento por item', 'bar-horizontal', l.slice(0, 15).map((c) => c.saldo.codigo),
      [{ name: 'Dias', values: l.slice(0, 15).map((c) => Math.round(c.diasSemSaida ?? 0)) }])],
    origem: origemSaldos(`equipe-${idEstoque}`, `Saldos de ${nome}`, [...l.map((c) => c.saldo), ...sucata]),
    links: [linkSaldoEstoque(idEstoque, 'Abrir os saldos da equipe')]
  };
}

function vistaObra(idEstoque: string, m: ModeloEstoque, chave: string): VistaAnalise | null {
  const g = m.porObra.find((x) => x.chave === idEstoque);
  if (!g) return null;
  const i = m.porObra.indexOf(g);
  const l = g.linhas;
  const ref = Date.parse(m.e.geradoEm);
  const idade = Math.max(0, ...l.map((s) => diasDesde(s.ultimaEntrada, ref) ?? 0));
  return {
    chave, eyebrow: 'Obra', titulo: g.rotulo, icone: 'pi pi-building',
    kpis: [
      { rotulo: 'Itens', valor: inteiro(l.length) },
      { rotulo: 'Materiais', valor: inteiro(new Set(l.map((s) => s.idMaterial)).size) },
      { rotulo: 'Entrega mais antiga', valor: dias(idade) }
    ],
    anterior: i > 0 ? { alvo: alvo('obra', m.porObra[i - 1].chave), rotulo: m.porObra[i - 1].rotulo } : undefined,
    proximo: i < m.porObra.length - 1 ? { alvo: alvo('obra', m.porObra[i + 1].chave), rotulo: m.porObra[i + 1].rotulo } : undefined,
    graficos: [],
    origem: origemSaldos(`obra-${idEstoque}`, `Saldos de ${g.rotulo}`, l),
    links: [...(l[0]?.idObra ? [linkObra(l[0].idObra)] : []), linkSaldoEstoque(idEstoque, 'Abrir os saldos da obra')]
  };
}

function vistaPosicao(k: string, m: ModeloEstoque, chave: string): VistaAnalise | null {
  const p = m.almox.find((x) => x.chave === k);
  if (!p) return null;
  const outros = m.almox.filter((x) => x.idMaterial === p.idMaterial && x.chave !== k);
  const destaques: DestaqueAnalise[] = [];
  const doadores = outros.filter((x) => x.faixa === 'excesso' || x.faixa === 'parado' || x.faixa === 'sem-consumo');
  if ((p.faixa === 'ruptura' || p.faixa === 'critica' || p.faixa === 'baixa') && doadores.length) {
    destaques.push({ icone: 'pi pi-arrow-right-arrow-left', tom: 'success',
      texto: `${doadores[0].estoque} tem ${qtd(doadores[0].saldo, p.unidade)} com ${doadores[0].cobertura == null ? 'saída nenhuma no período' : dias(doadores[0].cobertura) + ' de cobertura'}: transfira em vez de comprar.` });
  }
  if (p.faixa === 'parado') destaques.push({ icone: 'pi pi-pause-circle', tom: 'warning', texto: `Última saída há ${dias(p.diasSemSaida)}.` });
  const saidaPorEquipe = agrupar(p.movs.filter((x) => natureza(x) === 'atendimento' && x.idOrigem === p.idEstoque), (x) => x.idEquipe ?? x.idObra, (x) => x.equipe ?? (x.obra ? `Obra ${x.obra}` : x.destino),
    (g) => soma(g.linhas, (x) => x.quantidade));
  return {
    chave, eyebrow: p.estoque, titulo: `${p.codigo} · ${p.descricao}`, icone: 'pi pi-box',
    descricao: FAIXAS.find((f) => f.id === p.faixa)?.descricao,
    kpis: [
      { rotulo: 'Saldo', valor: qtd(p.saldo, p.unidade), tom: p.faixa === 'ruptura' ? 'danger' : undefined },
      { rotulo: 'Saída no período', valor: qtd(p.consumo, p.unidade), detalhe: `${numero(p.consumoDia, 2)} por dia` },
      { rotulo: 'Cobertura', valor: p.faixa === 'ruptura' ? 'Em falta' : p.cobertura == null ? '—' : dias(p.cobertura),
        tom: p.faixa === 'critica' || p.faixa === 'ruptura' ? 'danger' : p.faixa === 'baixa' || p.faixa === 'excesso' ? 'warning' : undefined },
      { rotulo: 'Última saída', valor: dataBr(p.ultimaSaida) }
    ],
    destaques,
    graficos: [
      graficoGrupos('quem', 'Para quem saiu', saidaPorEquipe, 'Quantidade', (g) => soma(g.linhas, (x) => x.quantidade), null),
      ...(outros.length ? [grafico('outros', 'Saldo nos outros almoxarifados', 'bar-horizontal', outros.map((x) => x.estoque),
        [{ name: 'Saldo', values: outros.map((x) => x.saldo) }], { aoSelecionar: (i) => (outros[i] ? navegar('posicao', outros[i].chave) : null), rotuloSelecao: 'Analisar' })] : [])
    ],
    origem: origemMovimentacoes(`posicao-${k.replace('|', '-')}`, `Movimentações de ${p.codigo} em ${p.estoque}`, p.movs),
    links: [linkSaldoEstoque(p.idEstoque), linkMovimentacoesMaterial(p.codigo)],
    copiloto: { foco: { tipo: 'secao', id: `posicao.${k}`, rotulo: p.codigo },
      pergunta: `O material ${p.codigo} (${p.descricao}) em ${p.estoque} tem saldo ${qtd(p.saldo, p.unidade)} e saída de ${qtd(p.consumo, p.unidade)} no período. Quanto e quando repor, ou remanejar?` }
  };
}

function vistaMaterial(id: string, m: ModeloEstoque, chave: string): VistaAnalise | null {
  const l = m.almox.filter((p) => p.idMaterial === id);
  const s = m.saldos.filter((x) => x.idMaterial === id);
  if (!l.length && !s.length) return null;
  const ex = l[0] ?? s[0];
  return {
    chave, eyebrow: 'Material', titulo: `${ex.codigo} · ${ex.descricao}`, icone: 'pi pi-box',
    kpis: [
      { rotulo: 'Nos almoxarifados', valor: qtd(soma(l, (p) => p.saldo), ex.unidade) },
      { rotulo: 'Com as equipes', valor: qtd(soma(s.filter((x) => x.tipoEstoque === 'CAMPO' && x.condicao === 'NOVO'), (x) => x.quantidade), ex.unidade) },
      { rotulo: 'Nas obras', valor: qtd(soma(s.filter((x) => x.tipoEstoque === 'OBRA'), (x) => x.quantidade), ex.unidade) },
      { rotulo: 'Saída no período', valor: qtd(soma(l, (p) => p.consumo), ex.unidade) }
    ],
    graficos: [grafico('onde', 'Saldo por estoque', 'bar-horizontal', s.slice(0, 15).map((x) => x.equipe ?? (x.obra ? `Obra ${x.obra}` : x.estoque)),
      [{ name: 'Saldo', values: s.slice(0, 15).map((x) => x.quantidade) }])],
    tabelas: l.length ? [tabelaPosicoes(`material-${id}`, 'Nos almoxarifados', l)] : undefined,
    origem: origemSaldos(`material-${id}`, 'Todos os saldos do material', s),
    links: [linkMovimentacoesMaterial(ex.codigo)]
  };
}
