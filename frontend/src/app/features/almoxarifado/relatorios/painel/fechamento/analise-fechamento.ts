import { GeoDataTableColumn, GeoTone } from '@geo/ui';
import { of } from 'rxjs';

import { FechamentoRelatorio, FechamentoRelatorioResponse, SituacaoFechamento } from '../../../../../core/models/almoxarifado-relatorios.models';
import {
  DestaqueAnalise,
  DetalheRegistro,
  KpiAnalise,
  OrigemAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../../../shared/components/dashboard/dashboard-analise.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  Grupo,
  SEM,
  TIPOS_TECNICOS,
  agrupar,
  alvo,
  diaHora,
  dividir,
  grafico,
  graficoGrupos,
  inteiro,
  mediana,
  mesDe,
  mesesEntre,
  navegar,
  pct,
  plural,
  priorizar,
  qtd,
  rotulo,
  rotuloMes,
  tempo
} from '../almox-analise-comum';

export const ROTULO_SITUACAO_FECHAMENTO: Record<SituacaoFechamento, string> = {
  AGUARDANDO_RESERVA: 'Aguardando reserva',
  AGUARDANDO_MOVIMENTACAO: 'Aguardando movimentação',
  MOVIMENTADA_PARCIALMENTE: 'Movimentada em parte',
  MOVIMENTADA: 'Movimentada',
  CANCELADA: 'Cancelada'
};
export const SITUACOES_FECHAMENTO = Object.keys(ROTULO_SITUACAO_FECHAMENTO) as SituacaoFechamento[];
export const TAG_SITUACAO_FECHAMENTO: Record<SituacaoFechamento, { tom: GeoTone; icone: string }> = {
  AGUARDANDO_RESERVA: { tom: 'info', icone: 'pi pi-bookmark' },
  AGUARDANDO_MOVIMENTACAO: { tom: 'info', icone: 'pi pi-arrow-right-arrow-left' },
  MOVIMENTADA_PARCIALMENTE: { tom: 'warning', icone: 'pi pi-percentage' },
  MOVIMENTADA: { tom: 'success', icone: 'pi pi-check-circle' },
  CANCELADA: { tom: 'neutral', icone: 'pi pi-ban' }
};
export const TAG_PRAZO: Record<string, { tom: GeoTone; icone: string }> = {
  NO_PRAZO: { tom: 'success', icone: 'pi pi-clock' },
  VENCE_EM_BREVE: { tom: 'warning', icone: 'pi pi-hourglass' },
  ATRASADO: { tom: 'danger', icone: 'pi pi-calendar-times' },
  CUMPRIDO: { tom: 'success', icone: 'pi pi-check' },
  CUMPRIDO_COM_ATRASO: { tom: 'warning', icone: 'pi pi-history' }
};
export const TAG_OBRA: Record<string, { tom: GeoTone; icone: string; rotulo: string }> = {
  FINALIZADO: { tom: 'success', icone: 'pi pi-flag-fill', rotulo: 'Finalizado' },
  PARCIAL: { tom: 'warning', icone: 'pi pi-percentage', rotulo: 'Parcial' },
  PENDENTE: { tom: 'info', icone: 'pi pi-clock', rotulo: 'Pendente' },
  SEM_SOLICITACOES: { tom: 'neutral', icone: 'pi pi-minus', rotulo: 'Sem solicitações' }
};
export const ROTULO_PRAZO: Record<string, string> = {
  NO_PRAZO: 'No prazo', VENCE_EM_BREVE: 'Vence em breve', ATRASADO: 'Atrasado', CUMPRIDO: 'Cumprido', CUMPRIDO_COM_ATRASO: 'Cumprido com atraso'
};
export const ROTULO_TIPO_OBRA: Record<string, string> = { OBRA: 'Obra', CORRETIVA: 'Corretiva', PREVENTIVA: 'Preventiva', LPT: 'LPT' };

const HORA_MS = 3_600_000;
const horas = (de: string | null, ate: string | null) => (de && ate ? Math.max(0, (Date.parse(ate) - Date.parse(de)) / HORA_MS) : null);
export const emAndamento = (s: FechamentoRelatorio) =>
  s.situacao === 'AGUARDANDO_RESERVA' || s.situacao === 'AGUARDANDO_MOVIMENTACAO' || s.situacao === 'MOVIMENTADA_PARCIALMENTE';
const devolucao = (s: FechamentoRelatorio) => s.tipo === '222' || s.tipo === '922';

/** Cumprimento de um prazo: nulo quando ainda corre. */
function cumpriu(limite: string | null, feitoEm: string | null): boolean | null {
  if (!limite || !feitoEm) return null;
  return Date.parse(feitoEm) <= Date.parse(limite);
}

export interface Prazos {
  total: number;
  noPrazo: number;
  atrasados: number;
  taxa: number | null;
  mediana: number | null;
}

function prazos(l: readonly FechamentoRelatorio[], etapa: 'reserva' | 'movimentacao'): Prazos {
  const feitos = l.map((s) => etapa === 'reserva'
    ? { ok: cumpriu(s.prazoReservaAte, s.reservaCumpridaEm), h: horas(s.criadaEm, s.reservaCumpridaEm) }
    : { ok: cumpriu(s.prazoMovimentacaoAte, s.movimentacaoConcluidaEm), h: horas(s.reservaCumpridaEm, s.movimentacaoConcluidaEm) })
    .filter((x) => x.ok !== null);
  const noPrazo = feitos.filter((x) => x.ok).length;
  return { total: feitos.length, noPrazo, atrasados: feitos.length - noPrazo, taxa: feitos.length ? noPrazo / feitos.length : null, mediana: mediana(feitos.map((x) => x.h)) };
}

export interface FiltrosFechamento {
  tipos: string[];
  situacoes: string[];
  prazos: string[];
  tiposObra: string[];
}

export function aceitaFechamento(f: FiltrosFechamento) {
  const t = f.tipos.length ? new Set(f.tipos) : null;
  const s = f.situacoes.length ? new Set(f.situacoes) : null;
  const p = f.prazos.length ? new Set(f.prazos) : null;
  const o = f.tiposObra.length ? new Set(f.tiposObra) : null;
  return (x: FechamentoRelatorio) => (!t || t.has(x.tipo)) && (!s || s.has(x.situacao)) && (!p || (!!x.situacaoPrazo && p.has(x.situacaoPrazo)))
    && (!o || (!!x.tipoObra && o.has(x.tipoObra)));
}

export interface ObraFechamento {
  chave: string;
  rotulo: string;
  titulo: string | null;
  tipoObra: string | null;
  situacaoObra: string | null;
  linhas: FechamentoRelatorio[];
  abertas: number;
  atrasadas: number;
  pendencias: number;
}

export interface ModeloFechamento {
  r: FechamentoRelatorioResponse;
  todas: FechamentoRelatorio[];
  periodo: FechamentoRelatorio[];
  abertas: FechamentoRelatorio[];
  atrasadas: FechamentoRelatorio[];
  venceEmBreve: FechamentoRelatorio[];
  canceladas: FechamentoRelatorio[];
  pendencias: FechamentoRelatorio[];
  reserva: Prazos;
  movimentacao: Prazos;
  /** Da criação à movimentação concluída. */
  cicloMediana: number | null;
  obras: ObraFechamento[];
  obrasFinalizadas: number;
  obrasEmAberto: number;
  porSolicitante: Grupo<FechamentoRelatorio>[];
  porSupervisor: Grupo<FechamentoRelatorio>[];
  porAlmox: Grupo<FechamentoRelatorio>[];
  meses: { mes: string; rotulo: string; reserva: Prazos; movimentacao: Prazos; criadas: number }[];
  devolucoes: number;
  adicoes: number;
}

export function modeloFechamento(r: FechamentoRelatorioResponse, aceita: (s: FechamentoRelatorio) => boolean): ModeloFechamento {
  const todas = r.solicitacoes.filter(aceita);
  const periodo = todas.filter((s) => !s.anteriorAoPeriodo);
  const abertas = todas.filter(emAndamento);
  const obras = agrupar(todas.filter((s) => s.idObra), (s) => s.idObra, (s) => (s.numeroObra ? `Obra ${s.numeroObra}` : 'Obra'))
    .map<ObraFechamento>((g) => ({
      chave: g.chave, rotulo: g.rotulo, titulo: g.linhas[0].tituloObra, tipoObra: g.linhas[0].tipoObra, situacaoObra: g.linhas[0].situacaoObra, linhas: g.linhas,
      abertas: g.linhas.filter(emAndamento).length, atrasadas: g.linhas.filter((s) => s.situacaoPrazo === 'ATRASADO').length,
      pendencias: g.linhas.filter((s) => s.possuiPendencia && emAndamento(s)).length
    }))
    .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas || b.linhas.length - a.linhas.length);
  const meses = mesesEntre(r.de, r.ate).map((mes) => {
    const l = periodo.filter((s) => mesDe(s.criadaEm) === mes);
    return { mes, rotulo: rotuloMes(mes), reserva: prazos(l, 'reserva'), movimentacao: prazos(l, 'movimentacao'), criadas: l.length };
  });
  return {
    r, todas, periodo, abertas,
    atrasadas: abertas.filter((s) => s.situacaoPrazo === 'ATRASADO'),
    venceEmBreve: abertas.filter((s) => s.situacaoPrazo === 'VENCE_EM_BREVE'),
    canceladas: periodo.filter((s) => s.situacao === 'CANCELADA'),
    pendencias: abertas.filter((s) => s.possuiPendencia),
    reserva: prazos(periodo, 'reserva'),
    movimentacao: prazos(periodo, 'movimentacao'),
    cicloMediana: mediana(periodo.map((s) => horas(s.criadaEm, s.movimentacaoConcluidaEm))),
    obras,
    obrasFinalizadas: obras.filter((o) => o.situacaoObra === 'FINALIZADO').length,
    obrasEmAberto: obras.filter((o) => o.abertas > 0).length,
    porSolicitante: agrupar(todas, (s) => s.idSolicitante, (s) => s.solicitante, undefined, 'Sem solicitante'),
    porSupervisor: agrupar(todas, (s) => s.idSupervisor, (s) => s.supervisor, undefined, 'Sem supervisor'),
    porAlmox: agrupar(todas, (s) => s.idAlmoxarifado, (s) => s.almoxarifado, undefined, 'Sem almoxarifado'),
    meses,
    devolucoes: periodo.filter(devolucao).length,
    adicoes: periodo.filter((s) => !devolucao(s)).length
  };
}

// ── Visão gerencial ──────────────────────────────────────────────────────────────────────────────

export function visaoFechamento(m: ModeloFechamento): { veredito: VereditoGerencial; leituras: LeituraGerencial[]; pergunta: string } {
  const l: LeituraGerencial[] = [];
  if (m.atrasadas.length) {
    const etapa = m.atrasadas.filter((s) => s.situacao === 'AGUARDANDO_RESERVA').length;
    l.push({ id: 'atrasadas', tom: 'danger', icone: 'pi pi-exclamation-triangle', titulo: 'Encerramentos com prazo vencido', valor: plural(m.atrasadas.length, 'solicitação', 'solicitações'),
      texto: `${etapa ? `${plural(etapa, 'esperando', 'esperando')} a reserva e ` : ''}${plural(m.atrasadas.length - etapa, 'esperando', 'esperando')} a movimentação além das 48 horas úteis.`,
      acao: { rotulo: 'Ver as atrasadas', alvo: alvo('kpi', 'atrasadas') } });
  }
  if (m.venceEmBreve.length) {
    l.push({ id: 'breve', tom: 'warning', icone: 'pi pi-hourglass', titulo: 'Vencem nas próximas horas', valor: plural(m.venceEmBreve.length, 'solicitação', 'solicitações'),
      texto: 'Menos de 12 horas úteis para o prazo. Priorize hoje para não entrar em atraso.',
      acao: { rotulo: 'Ver as que vencem', alvo: alvo('prazo', 'VENCE_EM_BREVE') } });
  }
  const pior = (p: Prazos, nome: string, id: string) => {
    if (p.taxa != null && p.total >= 5 && p.taxa < 0.85) {
      l.push({ id, tom: p.taxa < 0.7 ? 'danger' : 'warning', icone: 'pi pi-stopwatch', titulo: `${nome} fora do prazo`, valor: pct(1 - p.taxa, 0),
        texto: `${plural(p.atrasados, 'solicitação cumpriu', 'solicitações cumpriram')} a ${nome.toLowerCase()} depois das 48 horas úteis; mediana de ${tempo(p.mediana)}.`,
        acao: { rotulo: 'Analisar o prazo', alvo: alvo('kpi', id) } });
    }
  };
  pior(m.reserva, 'Reserva', 'reserva');
  pior(m.movimentacao, 'Movimentação', 'movimentacao');
  // Supervisor (ou solicitante) que mais atrasa a reserva.
  const lentos = m.porSupervisor.filter((g) => g.chave !== SEM)
    .map((g) => ({ g, p: prazos(g.linhas.filter((s) => !s.anteriorAoPeriodo), 'reserva') }))
    .filter((x) => x.p.total >= 4 && x.p.taxa != null && m.reserva.taxa != null && x.p.taxa < m.reserva.taxa - 0.15)
    .sort((a, b) => (a.p.taxa ?? 1) - (b.p.taxa ?? 1));
  if (lentos.length) {
    const x = lentos[0];
    l.push({ id: 'supervisor', tom: 'warning', icone: 'pi pi-user', titulo: `${x.g.rotulo} atrasa a reserva`, valor: `${pct(x.p.taxa, 0)} no prazo`,
      texto: `Contra ${pct(m.reserva.taxa, 0)} no recorte. A reserva é registrada pela equipe da obra: converse com o supervisor.`,
      acao: { rotulo: 'Ver o supervisor', alvo: alvo('supervisor', x.g.chave) } });
  }
  const obraLenta = m.obras.find((o) => o.atrasadas >= 2);
  if (obraLenta) {
    l.push({ id: 'obra', tom: 'warning', icone: 'pi pi-building', titulo: 'Obra travando o fechamento', valor: obraLenta.rotulo,
      texto: `${plural(obraLenta.atrasadas, 'solicitação atrasada', 'solicitações atrasadas')} e ${plural(obraLenta.abertas, 'em andamento', 'em andamento')}${obraLenta.titulo ? ` (${obraLenta.titulo})` : ''}. Sem fechar o saldo, a obra não encerra no SAP.`,
      acao: { rotulo: 'Ver a obra', alvo: alvo('obra', obraLenta.chave) } });
  }
  if (m.pendencias.length) {
    const motivo = agrupar(m.pendencias, (s) => s.motivoPendencia, (s) => s.motivoPendencia, undefined, 'Sem motivo')[0];
    l.push({ id: 'pendencias', tom: 'warning', icone: 'pi pi-flag', titulo: 'Com pendência registrada', valor: plural(m.pendencias.length, 'solicitação', 'solicitações'),
      texto: `Motivo mais comum: ${motivo.rotulo} (${motivo.linhas.length}).`,
      acao: { rotulo: 'Ver as pendências', alvo: alvo('kpi', 'pendencias') } });
  }
  if (m.canceladas.length && m.periodo.length >= 10 && m.canceladas.length / m.periodo.length >= 0.05) {
    l.push({ id: 'canceladas', tom: 'info', icone: 'pi pi-ban', titulo: 'Canceladas', valor: pct(m.canceladas.length / m.periodo.length, 0),
      texto: 'Solicitações abertas e canceladas pelo próprio solicitante. Muitas indicam lançamento duplicado ou feito antes da hora.',
      acao: { rotulo: 'Ver as canceladas', alvo: alvo('situacao', 'CANCELADA') } });
  }
  if (m.reserva.taxa != null && m.reserva.taxa >= 0.9 && m.movimentacao.taxa != null && m.movimentacao.taxa >= 0.9) {
    l.push({ id: 'bom', tom: 'success', icone: 'pi pi-check-circle', titulo: 'Prazos em dia', valor: pct(Math.min(m.reserva.taxa, m.movimentacao.taxa), 0),
      texto: 'Reserva e movimentação dentro das 48 horas úteis em pelo menos 90% dos casos.' });
  }
  const graves = l.filter((x) => x.tom === 'danger').length;
  const atencao = l.filter((x) => x.tom === 'warning').length;
  return {
    veredito: {
      tom: graves ? 'danger' : atencao ? 'warning' : 'success',
      rotulo: graves ? 'Agir agora' : atencao ? 'Acompanhar' : 'Sob controle',
      titulo: m.abertas.length ? `${plural(m.abertas.length, 'fechamento em andamento', 'fechamentos em andamento')}${m.atrasadas.length ? `, ${m.atrasadas.length} atrasados` : ''}`
        : 'Nenhum encerramento em andamento',
      texto: `${plural(m.periodo.length, 'solicitação aberta', 'solicitações abertas')} no período (${inteiro(m.adicoes)} adições e ${inteiro(m.devolucoes)} devoluções). `
        + `${m.obrasFinalizadas} de ${m.obras.length} obras com encerramento finalizado. Reserva no prazo em ${pct(m.reserva.taxa, 0)} e movimentação em ${pct(m.movimentacao.taxa, 0)}.`,
      progresso: m.obras.length ? { valor: (m.obrasFinalizadas / m.obras.length) * 100, rotulo: `${pct(m.obrasFinalizadas / m.obras.length, 0)} das obras finalizadas` } : undefined
    },
    leituras: priorizar(l),
    pergunta: 'Faça a leitura gerencial do encerramento de obras: prazos de reserva e movimentação, obras travadas, quem atrasa e o que fazer primeiro.'
  };
}

// ── Origem e análises ────────────────────────────────────────────────────────────────────────────

export const colFechamento: GeoDataTableColumn<FechamentoRelatorio>[] = [
  { key: 'criadaEm', header: 'Aberta em', type: 'custom', priority: 1, value: (s) => s.criadaEm, display: (s) => diaHora(s.criadaEm) },
  { key: 'obra', header: 'Obra', priority: 1, value: (s) => s.numeroObra ?? '—' },
  { key: 'tipo', header: 'Tipo', priority: 2, value: (s) => `${s.tipo} · ${TIPOS_TECNICOS[s.tipo] ?? ''}` },
  { key: 'situacao', header: 'Situação', priority: 1, value: (s) => ROTULO_SITUACAO_FECHAMENTO[s.situacao] },
  { key: 'prazo', header: 'Prazo', priority: 1, value: (s) => rotulo(ROTULO_PRAZO, s.situacaoPrazo, '—') },
  { key: 'prazoVigenteAte', header: 'Vence em', type: 'custom', priority: 2, value: (s) => s.prazoVigenteAte ?? '', display: (s) => (emAndamento(s) ? diaHora(s.prazoVigenteAte) : '—') },
  { key: 'reserva', header: 'Reserva', priority: 3, value: (s) => s.numeroReserva ?? '—' },
  { key: 'solicitante', header: 'Solicitante', priority: 3, value: (s) => s.solicitante ?? '—' },
  { key: 'supervisor', header: 'Supervisor', priority: 3, value: (s) => s.supervisor ?? '—' },
  { key: 'movimentado', header: 'Movimentado', type: 'custom', priority: 2, value: (s) => dividir(s.quantidadeMovimentada, s.quantidadeSolicitada) ?? 0,
    display: (s) => pct(dividir(s.quantidadeMovimentada, s.quantidadeSolicitada), 0) }
];

function detalhe(s: FechamentoRelatorio): DetalheRegistro {
  return {
    titulo: `${s.numeroObra ? 'Obra ' + s.numeroObra : 'Encerramento'} · ${s.tipo}`,
    subtitulo: s.tituloObra ?? undefined,
    campos: [
      { rotulo: 'Situação', valor: ROTULO_SITUACAO_FECHAMENTO[s.situacao] },
      { rotulo: 'Prazo', valor: rotulo(ROTULO_PRAZO, s.situacaoPrazo, '—') },
      { rotulo: 'Aberta em', valor: diaHora(s.criadaEm), icone: 'pi pi-calendar' },
      { rotulo: 'Prazo da reserva', valor: diaHora(s.prazoReservaAte) },
      { rotulo: 'Reserva registrada', valor: diaHora(s.reservaCumpridaEm) },
      { rotulo: 'Prazo da movimentação', valor: diaHora(s.prazoMovimentacaoAte) },
      { rotulo: 'Movimentação concluída', valor: diaHora(s.movimentacaoConcluidaEm) },
      { rotulo: 'Reserva', valor: s.numeroReserva ?? '—' },
      { rotulo: 'Itens', valor: `${inteiro(s.itens)} (${qtd(s.quantidadeMovimentada)} de ${qtd(s.quantidadeSolicitada)} movimentados)` },
      { rotulo: 'Solicitante', valor: s.solicitante ?? '—', icone: 'pi pi-user' },
      { rotulo: 'Encarregado', valor: s.encarregado ?? '—' },
      { rotulo: 'Supervisor', valor: s.supervisor ?? '—' },
      { rotulo: 'Almoxarifado', valor: s.almoxarifado ?? '—' },
      ...(s.possuiPendencia ? [{ rotulo: 'Pendência', valor: s.motivoPendencia ?? 'Registrada' }] : [])
    ],
    links: [
      { rotulo: 'Abrir o fechamento', icone: 'pi pi-file', rota: ['/obras/encerramento', s.id] },
      ...(s.idObra ? [{ rotulo: 'Abrir a obra', icone: 'pi pi-building', rota: ['/obras', s.idObra] }] : [])
    ]
  };
}

function origem(chave: string, titulo: string, l: readonly FechamentoRelatorio[]): OrigemAnalise<FechamentoRelatorio> {
  const ordenadas = [...l].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
  return {
    chave, titulo, rotuloAba: 'Solicitações', icone: 'pi pi-list', colunas: colFechamento,
    carregar: () => of({ linhas: ordenadas, total: ordenadas.length }),
    chaveLinha: (s) => s.id,
    rotuloLinha: (s) => `Encerramento da obra ${s.numeroObra ?? ''} de ${diaHora(s.criadaEm)}`,
    detalhar: detalhe,
    nomeArquivo: `fechamento-${chave}`,
    vazio: 'Nenhuma solicitação de encerramento neste recorte.'
  };
}

function kpisDe(l: readonly FechamentoRelatorio[]): KpiAnalise[] {
  const doPeriodo = l.filter((s) => !s.anteriorAoPeriodo);
  const res = prazos(doPeriodo, 'reserva');
  const mov = prazos(doPeriodo, 'movimentacao');
  const atr = l.filter((s) => s.situacaoPrazo === 'ATRASADO').length;
  return [
    { rotulo: 'Solicitações', valor: inteiro(l.length), icone: 'pi pi-inbox' },
    { rotulo: 'Em andamento', valor: inteiro(l.filter(emAndamento).length), detalhe: atr ? `${atr} atrasadas` : 'nenhuma atrasada', tom: atr ? 'warning' : undefined },
    { rotulo: 'Reserva no prazo', valor: pct(res.taxa, 0), detalhe: `mediana ${tempo(res.mediana)}` },
    { rotulo: 'Movimentação no prazo', valor: pct(mov.taxa, 0), detalhe: `mediana ${tempo(mov.mediana)}` }
  ];
}

function graficosDe(l: readonly FechamentoRelatorio[]) {
  const sit = SITUACOES_FECHAMENTO.map((s) => ({ s, n: l.filter((x) => x.situacao === s).length })).filter((x) => x.n);
  const obras = agrupar(l.filter((s) => s.idObra), (s) => s.idObra, (s) => (s.numeroObra ? `Obra ${s.numeroObra}` : 'Obra'));
  return [
    grafico('sit', 'Por situação', 'doughnut', sit.map((x) => ROTULO_SITUACAO_FECHAMENTO[x.s]), [{ name: 'Solicitações', values: sit.map((x) => x.n) }],
      { aoSelecionar: (i) => (sit[i] ? navegar('situacao', sit[i].s) : null), rotuloSelecao: 'Analisar a situação' }),
    ...(obras.length > 1 ? [graficoGrupos('obras', 'Por obra', obras, 'Solicitações', (g) => g.linhas.length, 'obra')] : [])
  ];
}

function vistaDe(chave: string, eyebrow: string, titulo: string, icone: string, l: FechamentoRelatorio[], extra: Partial<VistaAnalise> = {}): VistaAnalise {
  return { chave, eyebrow, titulo, icone, kpis: kpisDe(l), graficos: graficosDe(l), origem: origem(chave.replace(/[^a-z0-9]+/gi, '-'), titulo, l), ...extra };
}

export function vistaFechamento(a: { dimension: string; value: string }, m: ModeloFechamento): VistaAnalise | null {
  const chave = chaveDoAlvo(a);
  const grupo = (gs: Grupo<FechamentoRelatorio>[], eyebrow: string, icone: string) => {
    const g = gs.find((x) => x.chave === a.value);
    if (!g) return null;
    const i = gs.indexOf(g);
    return vistaDe(chave, eyebrow, g.rotulo, icone, g.linhas, {
      anterior: i > 0 ? { alvo: alvo(a.dimension, gs[i - 1].chave), rotulo: gs[i - 1].rotulo } : undefined,
      proximo: i < gs.length - 1 ? { alvo: alvo(a.dimension, gs[i + 1].chave), rotulo: gs[i + 1].rotulo } : undefined
    });
  };
  switch (a.dimension) {
    case 'situacao':
      return vistaDe(chave, 'Situação', ROTULO_SITUACAO_FECHAMENTO[a.value as SituacaoFechamento] ?? a.value, 'pi pi-tag', m.todas.filter((s) => s.situacao === a.value));
    case 'prazo':
      return vistaDe(chave, 'Prazo', ROTULO_PRAZO[a.value] ?? a.value, 'pi pi-hourglass', m.todas.filter((s) => s.situacaoPrazo === a.value));
    case 'tipo':
      return vistaDe(chave, 'Tipo', `${a.value} · ${TIPOS_TECNICOS[a.value] ?? ''}`, 'pi pi-tags', m.todas.filter((s) => s.tipo === a.value));
    case 'solicitante': return grupo(m.porSolicitante, 'Solicitante', 'pi pi-user');
    case 'supervisor': return grupo(m.porSupervisor, 'Supervisor', 'pi pi-user');
    case 'almox': return grupo(m.porAlmox, 'Almoxarifado', 'pi pi-warehouse');
    case 'obra': {
      const o = m.obras.find((x) => x.chave === a.value);
      if (!o) return null;
      const i = m.obras.indexOf(o);
      const destaques: DestaqueAnalise[] = [];
      if (o.situacaoObra) destaques.push({ icone: 'pi pi-flag', tom: o.situacaoObra === 'FINALIZADO' ? 'success' : 'info',
        texto: `Encerramento da obra: ${({ PENDENTE: 'pendente', PARCIAL: 'parcial', FINALIZADO: 'finalizado', SEM_SOLICITACOES: 'sem solicitações' } as Record<string, string>)[o.situacaoObra] ?? o.situacaoObra}.` });
      return vistaDe(chave, 'Obra', o.rotulo, 'pi pi-building', o.linhas, {
        descricao: [o.titulo, rotulo(ROTULO_TIPO_OBRA, o.tipoObra, '')].filter(Boolean).join(' · '),
        destaques,
        anterior: i > 0 ? { alvo: alvo('obra', m.obras[i - 1].chave), rotulo: m.obras[i - 1].rotulo } : undefined,
        proximo: i < m.obras.length - 1 ? { alvo: alvo('obra', m.obras[i + 1].chave), rotulo: m.obras[i + 1].rotulo } : undefined,
        links: [{ rotulo: 'Abrir a obra', icone: 'pi pi-building', rota: ['/obras', o.chave] }, { rotulo: 'Encerramentos da obra', icone: 'pi pi-list', rota: ['/obras/encerramento'], queryParams: { idObra: o.chave } }]
      });
    }
    case 'mes': {
      const x = m.meses.find((y) => y.mes === a.value);
      if (!x) return null;
      return vistaDe(chave, 'Mês', rotuloMes(a.value), 'pi pi-calendar', m.periodo.filter((s) => mesDe(s.criadaEm) === a.value));
    }
    case 'kpi':
      switch (a.value) {
        case 'periodo': return vistaDe(chave, 'Volume', 'Solicitações de encerramento do período', 'pi pi-inbox', m.periodo, {
          graficos: [grafico('mes', 'Por mês', 'bar', m.meses.map((x) => x.rotulo), [{ name: 'Solicitações', values: m.meses.map((x) => x.criadas) }],
            { aoSelecionar: (i) => (m.meses[i] ? navegar('mes', m.meses[i].mes) : null), rotuloSelecao: 'Analisar o mês' }), ...graficosDe(m.periodo)] });
        case 'abertas': return vistaDe(chave, 'Fila', 'Encerramentos em andamento', 'pi pi-clock', m.abertas);
        case 'atrasadas': return vistaDe(chave, 'Prazo', 'Encerramentos com prazo vencido', 'pi pi-exclamation-triangle', m.atrasadas);
        case 'pendencias': {
          const motivos = agrupar(m.pendencias, (s) => s.motivoPendencia, (s) => s.motivoPendencia, undefined, 'Sem motivo');
          return vistaDe(chave, 'Pendências', 'Em andamento com pendência', 'pi pi-flag', m.pendencias, {
            graficos: [graficoGrupos('mot', 'Por motivo', motivos, 'Solicitações', (g) => g.linhas.length, null), ...graficosDe(m.pendencias)] });
        }
        case 'reserva':
        case 'movimentacao': {
          const etapa = a.value as 'reserva' | 'movimentacao';
          const p = etapa === 'reserva' ? m.reserva : m.movimentacao;
          const fora = m.periodo.filter((s) => (etapa === 'reserva' ? cumpriu(s.prazoReservaAte, s.reservaCumpridaEm) : cumpriu(s.prazoMovimentacaoAte, s.movimentacaoConcluidaEm)) === false);
          const porSup = agrupar(fora, (s) => s.idSupervisor, (s) => s.supervisor, undefined, 'Sem supervisor');
          return {
            chave, eyebrow: 'Prazo de 48 horas úteis', titulo: etapa === 'reserva' ? 'Registro da reserva' : 'Movimentação no almoxarifado', icone: 'pi pi-stopwatch',
            descricao: etapa === 'reserva' ? 'Da abertura da solicitação até o registro da reserva.' : 'Do registro da reserva até a movimentação concluída.',
            kpis: [
              { rotulo: 'No prazo', valor: pct(p.taxa, 0), tom: (p.taxa ?? 1) < 0.85 ? 'warning' : 'success' },
              { rotulo: 'Cumpridas com atraso', valor: inteiro(p.atrasados) },
              { rotulo: 'Tempo mediano', valor: tempo(p.mediana), detalhe: 'em horas corridas' }
            ],
            graficos: [
              grafico('mes', 'No prazo por mês', 'bar-stacked', m.meses.map((x) => x.rotulo),
                [{ name: 'No prazo', values: m.meses.map((x) => (etapa === 'reserva' ? x.reserva : x.movimentacao).noPrazo) },
                  { name: 'Com atraso', values: m.meses.map((x) => (etapa === 'reserva' ? x.reserva : x.movimentacao).atrasados) }],
                { inteiro: true, aoSelecionar: (i) => (m.meses[i] ? navegar('mes', m.meses[i].mes) : null), rotuloSelecao: 'Analisar o mês' }),
              graficoGrupos('sup', 'Atrasos por supervisor', porSup, 'Atrasos', (g) => g.linhas.length, 'supervisor')
            ],
            origem: origem(`prazo-${etapa}`, 'Cumpridas com atraso', fora)
          };
        }
        case 'obras': return {
          chave, eyebrow: 'Obras', titulo: 'Encerramento por obra', icone: 'pi pi-building',
          kpis: [
            { rotulo: 'Obras', valor: inteiro(m.obras.length) },
            { rotulo: 'Finalizadas', valor: inteiro(m.obrasFinalizadas), tom: 'success' },
            { rotulo: 'Com encerramento em andamento', valor: inteiro(m.obrasEmAberto) }
          ],
          graficos: [graficoGrupos('obras', 'Solicitações em andamento por obra', m.obras, 'Em andamento', (g) => (g as unknown as ObraFechamento).abertas, 'obra')],
          origem: origem('obras', 'Solicitações das obras', m.todas)
        };
        default: return null;
      }
    default: return null;
  }
}

export function tomTaxa(t: number | null): GeoTone {
  return t == null ? 'neutral' : t >= 0.9 ? 'success' : t >= 0.75 ? 'warning' : 'danger';
}
