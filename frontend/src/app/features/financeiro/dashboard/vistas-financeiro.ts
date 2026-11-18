import { map } from 'rxjs';
import { CesDataTableColumn } from '@ces/ui';

import { DashboardFinanceiroFilter, DashboardFinanceiroResponse } from '../../../core/models/financeiro-dashboard.models';
import { SolicitacaoFinanceiraFilter } from '../../../core/models/financeiro.models';
import { FinanceiroService } from '../../../core/services/financeiro.service';
import {
  AcaoAnalise,
  AlvoAnalise,
  DestaqueAnalise,
  DetalheRegistro,
  FiltroOrigem,
  GraficoAnalise,
  KpiAnalise,
  OrigemAnalise,
  VistaAnalise,
  chaveDoAlvo
} from '../../../shared/components/dashboard/dashboard-analise.models';
import {
  DIMENSOES_RANKING,
  DimensaoRanking,
  LIMIAR,
  LinhaSolicitacao,
  ROTA_LISTAGEM_GESTAO,
  dataBr,
  diaDe,
  filaDeDecisao,
  linhaSolicitacao,
  nomeDoItem,
  paramsDaListagem,
  rankingDe,
  recorteNaListagem,
  rotaDoRegistro,
  somarDias,
  textoVencimento
} from './analise-financeiro';
import {
  formatarMoeda,
  formatarMoedaCompacta as moeda,
  formatarPercentual as pct,
  formatarVariacao,
  plural,
  umaCasa
} from './financeiro-dashboard-insights';

/**
 * Análises (drill-down) do painel do financeiro: cada cartão, ponto de gráfico, faixa e item do
 * ranking vira uma vista com os indicadores do recorte, gráficos que aprofundam e a origem — as
 * solicitações que compõem o número, vindas da listagem com as mesmas permissões e filtros.
 */

export interface ContextoAnaliseFinanceiro {
  readonly d: DashboardFinanceiroResponse;
  readonly filtros: DashboardFinanceiroFilter;
  readonly financeiro: Pick<FinanceiroService, 'listarSolicitacoes'>;
  /** Dia de gestão (`AAAA-MM-DD`, São Paulo). */
  readonly hoje: string;
}

const LIMITE_ORIGEM = 200;
const navegar = (dimension: string, value: string): AcaoAnalise => ({ tipo: 'navegar', alvo: { dimension, value } });
const alturaBarras = (n: number) => Math.max(200, Math.min(n, 12) * 30 + 60);

// ------------------------------------------------------------------ origem: solicitações

const COL = {
  numero: { key: 'numero', header: 'Nº', type: 'integer', priority: 1, width: '4.5rem' },
  tipo: { key: 'tipoRotulo', header: 'Tipo', priority: 2 },
  fornecedor: { key: 'fornecedor', header: 'Fornecedor', priority: 1 },
  solicitante: { key: 'solicitante', header: 'Solicitante', priority: 2 },
  status: { key: 'statusRotulo', header: 'Situação', priority: 2 },
  valor: { key: 'valor', header: 'Pedido', type: 'currency', priority: 1 },
  autorizado: { key: 'valorAprovado', header: 'Autorizado', type: 'currency', priority: 1 },
  aberta: { key: 'abertaEm', header: 'Aberta em', type: 'date', priority: 3 },
  espera: {
    key: 'esperaDias', header: 'Esperando', type: 'custom', priority: 1,
    value: (l) => l.esperaDias ?? -1, display: (l) => (l.esperaDias === null ? '—' : plural(l.esperaDias, 'dia', 'dias'))
  },
  vencimento: { key: 'vencimento', header: 'Vencimento', type: 'custom', priority: 1, value: (l) => l.vencimento ?? '', display: textoVencimento },
  comprovante: { key: 'temComprovante', header: 'Comprovante', type: 'custom', priority: 2, value: (l) => Number(l.temComprovante), display: (l) => (l.temComprovante ? 'Anexado' : 'Falta') },
  fiscal: { key: 'temFiscal', header: 'Nota ou boleto', type: 'custom', priority: 2, value: (l) => Number(l.temFiscal), display: (l) => (l.temFiscal ? 'Anexado' : 'Falta') }
} satisfies Record<string, CesDataTableColumn<LinhaSolicitacao>>;

function detalheSolicitacao(l: LinhaSolicitacao): DetalheRegistro {
  return {
    titulo: `${l.tipoRotulo} nº ${l.numero}`,
    subtitulo: `${l.formulario} · ${l.statusRotulo}`,
    campos: [
      { rotulo: 'Fornecedor', valor: l.fornecedor, icone: 'pi pi-building' },
      { rotulo: 'Solicitante', valor: l.solicitante, icone: 'pi pi-user' },
      { rotulo: 'Valor pedido', valor: formatarMoeda(l.valor), icone: 'pi pi-money-bill' },
      { rotulo: 'Valor autorizado', valor: l.valorAprovado === null ? '—' : formatarMoeda(l.valorAprovado), icone: 'pi pi-check-circle' },
      { rotulo: 'Aberta em', valor: dataBr(diaDe(l.abertaEm)), icone: 'pi pi-calendar' },
      ...(l.esperaDias !== null ? [{ rotulo: 'Esperando decisão', valor: plural(l.esperaDias, 'dia', 'dias'), icone: 'pi pi-hourglass' }] : []),
      ...(l.vencimento ? [{ rotulo: 'Vencimento', valor: textoVencimento(l), icone: 'pi pi-calendar-clock' }] : []),
      { rotulo: 'Documentos', valor: `${l.documentos} · nota ou boleto: ${l.temFiscal ? 'sim' : 'não'} · comprovante: ${l.temComprovante ? 'sim' : 'não'}`, icone: 'pi pi-paperclip' }
    ],
    links: [{ rotulo: 'Abrir a solicitação', icone: 'pi pi-external-link', rota: rotaDoRegistro(l) }]
  };
}

interface OpcoesOrigem {
  readonly titulo: string;
  readonly descricao: string;
  readonly filtro: SolicitacaoFinanceiraFilter;
  /** Filtros que a origem define e que, por isso, não vêm do painel. */
  readonly sobrepor?: readonly (keyof SolicitacaoFinanceiraFilter)[];
  readonly ordem?: string;
  readonly colunas: readonly CesDataTableColumn<LinhaSolicitacao>[];
  readonly filtroInicial?: FiltroOrigem<LinhaSolicitacao>;
  readonly nomeArquivo: string;
  readonly vazio: string;
}

function origemSolicitacoes(c: ContextoAnaliseFinanceiro, o: OpcoesOrigem): OrigemAnalise<LinhaSolicitacao> {
  const recorte = recorteNaListagem(c.filtros, [...(o.sobrepor ?? []), ...(Object.keys(o.filtro) as (keyof SolicitacaoFinanceiraFilter)[])]);
  const filtro: SolicitacaoFinanceiraFilter = { ...recorte.filtro, ...o.filtro, page: 0, size: LIMITE_ORIGEM, sort: o.ordem ?? 'dataCriacao,desc' };
  const aviso = recorte.ignorados.length
    ? ' A listagem aceita um valor por filtro: filtros do painel com mais de um valor, solicitante e urgência não se aplicam aqui.'
    : '';
  return {
    chave: `solicitacoes:${recorte.tipo}:${JSON.stringify(filtro)}`,
    titulo: o.titulo,
    rotuloAba: 'Origem · solicitações',
    icone: 'pi pi-list',
    descricao: o.descricao + aviso,
    colunas: o.colunas,
    carregar: () => c.financeiro.listarSolicitacoes(recorte.tipo, filtro).pipe(
      map((pagina) => ({ linhas: pagina.content.map((s) => linhaSolicitacao(s, c.hoje)), total: pagina.page.totalElements }))
    ),
    chaveLinha: (l) => l.id,
    rotuloLinha: (l) => `${l.tipoRotulo} nº ${l.numero}`,
    filtroInicial: o.filtroInicial,
    detalhar: detalheSolicitacao,
    verTudo: { rotulo: 'Ver na listagem de solicitações', icone: 'pi pi-external-link', rota: ROTA_LISTAGEM_GESTAO, queryParams: paramsDaListagem(recorte, o.filtro) },
    nomeArquivo: o.nomeArquivo,
    vazio: o.vazio
  };
}

/** Período do painel para a listagem (instantes com fuso; o backend devolve o efetivo quando não há filtro). */
function periodo(c: ContextoAnaliseFinanceiro): Pick<SolicitacaoFinanceiraFilter, 'dataCriacaoInicio' | 'dataCriacaoFim'> {
  return { dataCriacaoInicio: c.filtros.inicio ?? c.d.inicio, dataCriacaoFim: c.filtros.fim ?? c.d.fim };
}

function rotuloPeriodo(c: ContextoAnaliseFinanceiro): string {
  const de = diaDe(c.d.inicio);
  const ate = diaDe(c.d.fim);
  return de === ate ? dataBr(de) : `${dataBr(de)} a ${dataBr(ate)}`;
}

const filtrarLinhas = (chave: string, rotulo: string, aceita: (l: LinhaSolicitacao) => boolean): FiltroOrigem<LinhaSolicitacao> => ({ chave, rotulo, aceita });
const SEM_COMPROVANTE = filtrarLinhas('sem-comprovante', 'Sem comprovante de pagamento', (l) => !l.temComprovante);
const SEM_FISCAL = filtrarLinhas('sem-fiscal', 'Sem nota, boleto ou recibo', (l) => !l.temFiscal);

// ------------------------------------------------------------------ gráficos reaproveitados

function graficoSerie(c: ContextoAnaliseFinanceiro): GraficoAnalise {
  const serie = c.d.serieTemporal;
  return {
    id: 'serie',
    titulo: 'Pedido × autorizado ao longo do período',
    descricao: 'Pedidos pela data de abertura, com o desfecho atual. Clique num período para analisá-lo.',
    tipo: 'bar',
    rotulos: serie.map((s) => s.rotulo),
    series: [{ name: 'Pedido', values: serie.map((s) => s.valorSolicitado) }, { name: 'Autorizado', values: serie.map((s) => s.valorAprovado) }],
    formato: 'currency',
    altura: 240,
    inteiro: true,
    aoSelecionar: (i) => navegar('periodo', serie[i].chave),
    rotuloSelecao: 'Analisar o período'
  };
}

function graficoFila(c: ContextoAnaliseFinanceiro): GraficoAnalise {
  const faixas = c.d.envelhecimento;
  return {
    id: 'fila',
    titulo: 'Há quanto tempo esperam decisão',
    descricao: 'Desde a entrada na etapa atual, inclusive pedidos abertos antes do período. Clique numa faixa para ver os pedidos.',
    tipo: 'bar-stacked',
    rotulos: faixas.map((f) => `${f.faixa} dias`),
    series: [
      { name: 'Compras', values: faixas.map((f) => f.porTipo?.COMPRA ?? 0) },
      { name: 'Pagamentos', values: faixas.map((f) => f.porTipo?.PAGAMENTO ?? 0) }
    ],
    formato: 'integer',
    altura: 230,
    aoSelecionar: (i) => navegar('faixa', faixas[i].faixa),
    rotuloSelecao: 'Ver os pedidos'
  };
}

export function graficoVencimentos(d: DashboardFinanceiroResponse): GraficoAnalise {
  const faixas = d.vencimentos;
  return {
    id: 'vencimentos',
    titulo: 'O que vence a seguir',
    descricao: 'Aprovadas, com vencimento e ainda sem comprovante. Clique numa faixa para ver as despesas.',
    tipo: 'bar-stacked',
    rotulos: faixas.map((f) => f.rotulo),
    series: [
      { name: 'Vencido', values: faixas.map((f) => (f.faixa === 'VENCIDO' ? f.valor : 0)) },
      { name: 'A vencer', values: faixas.map((f) => (f.faixa === 'VENCIDO' ? 0 : f.valor)) }
    ],
    formato: 'currency',
    altura: 230,
    aoSelecionar: (i) => navegar('vencimento', faixas[i].faixa),
    rotuloSelecao: 'Ver as despesas'
  };
}

function graficoRanking(d: DashboardFinanceiroResponse, dimensao: DimensaoRanking, titulo?: string): GraficoAnalise | null {
  const itens = rankingDe(d, dimensao).filter((i) => i.valorAprovado > 0).slice(0, 10);
  if (!itens.length) return null;
  return {
    id: `ranking-${dimensao}`,
    titulo: titulo ?? `Autorizado por ${DIMENSOES_RANKING[dimensao].rotulo.toLowerCase()}`,
    descricao: 'Clique para analisar.',
    tipo: 'bar-horizontal',
    rotulos: itens.map(nomeDoItem),
    series: [{ name: 'Autorizado', values: itens.map((i) => i.valorAprovado) }],
    formato: 'currency',
    altura: alturaBarras(itens.length),
    aoSelecionar: (i) => navegar('ranking', `${dimensao}~${itens[i].chave}`),
    rotuloSelecao: 'Analisar'
  };
}

// ------------------------------------------------------------------ vistas

export function vistaFinanceiro(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise | null {
  switch (a.dimension) {
    case 'kpi':
      switch (a.value) {
        case 'autorizacao': return vistaAutorizacao(a, c);
        case 'fila': return vistaFila(a, c);
        case 'vencimentos': return vistaVencimentos(a, c);
        case 'documentacao': return vistaDocumentacao(a, c);
        default: return null;
      }
    case 'periodo': return vistaPeriodo(a, c);
    case 'faixa': return vistaFaixaFila(a, c);
    case 'vencimento': return vistaFaixaVencimento(a, c);
    case 'ranking': return vistaRanking(a, c);
    default: return null;
  }
}

function vistaAutorizacao(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise {
  const { resumo, valores, ciclo } = c.d;
  const destaques: DestaqueAnalise[] = [];
  if (valores.valorAprovadoPeriodoAnterior > 0) {
    destaques.push({
      tom: 'info', icone: valores.variacaoValorAprovado >= 0 ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right',
      texto: `${formatarVariacao(valores.variacaoValorAprovado)} de autorizado contra o período anterior (${moeda(valores.valorAprovadoPeriodoAnterior)}).`
    });
  }
  if (valores.percentualCorte > LIMIAR.corteAlto) {
    destaques.push({ tom: 'warning', icone: 'pi pi-percentage', texto: `${pct(valores.percentualCorte)} do valor das aprovadas foi cortado ao aprovar: a estimativa de quem pede está acima do praticado.` });
  }
  if (ciclo.decisoesDesfeitas > 0) {
    destaques.push({ tom: 'warning', icone: 'pi pi-undo', texto: `${plural(ciclo.decisoesDesfeitas, 'decisão foi desfeita e voltou', 'decisões foram desfeitas e voltaram')} para a fila.` });
  }
  if (resumo.pagamentos > 0) {
    destaques.push({ tom: 'info', icone: 'pi pi-link', texto: `${pct(resumo.percentualComCompraPrevia)} dos pagamentos vieram de uma compra aprovada (${resumo.pagamentosComCompraPrevia} de ${resumo.pagamentos}).` });
  }
  const etapas = c.d.funil.filter((e) => !e.vazamento);
  const graficos: GraficoAnalise[] = [graficoSerie(c)];
  if (etapas.length && resumo.total) {
    graficos.push({
      id: 'funil',
      titulo: 'Onde o pedido se perde',
      descricao: 'Valor que chegou a cada etapa. Rejeitados e cancelados saem do fluxo e aparecem nos indicadores.',
      tipo: 'bar-horizontal',
      rotulos: etapas.map((e) => e.rotulo),
      series: [{ name: 'Valor', values: etapas.map((e) => e.valor) }],
      formato: 'currency',
      altura: alturaBarras(etapas.length)
    });
  }
  const despesa = graficoRanking(c.d, 'tipoDespesa');
  if (despesa) graficos.push(despesa);

  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Autorização',
    titulo: `${moeda(valores.valorAprovado)} autorizados de ${moeda(valores.valorSolicitado)} pedidos`,
    descricao: `${rotuloPeriodo(c)} · pedidos pela data de abertura, com o desfecho atual.`,
    icone: 'pi pi-check-circle',
    kpis: [
      { rotulo: 'Autorizado', valor: moeda(valores.valorAprovado), detalhe: `${pct(valores.taxaAutorizacao)} do pedido`, tom: 'brand', icone: 'pi pi-check-circle' },
      { rotulo: 'Pedido', valor: moeda(valores.valorSolicitado), detalhe: plural(resumo.total, 'pedido', 'pedidos'), icone: 'pi pi-shopping-cart' },
      { rotulo: 'Cortado ao aprovar', valor: moeda(valores.corteNaAprovacao), detalhe: pct(valores.percentualCorte), tom: valores.percentualCorte > LIMIAR.corteAlto ? 'warning' : 'neutral', icone: 'pi pi-percentage' },
      { rotulo: 'Recusado por inteiro', valor: moeda(valores.valorRejeitado), detalhe: plural(resumo.rejeitadas, 'rejeitado', 'rejeitados'), icone: 'pi pi-times-circle' },
      { rotulo: 'Aprovação dos decididos', valor: resumo.decididas ? pct(resumo.taxaAprovacao) : '—', detalhe: plural(resumo.decididas, 'decidido', 'decididos'), icone: 'pi pi-thumbs-up' },
      { rotulo: 'Ticket médio autorizado', valor: formatarMoeda(valores.ticketMedioAprovado), detalhe: `pedido: ${formatarMoeda(valores.ticketMedioSolicitado)}`, icone: 'pi pi-tag' },
      { rotulo: 'Compras · pagamentos', valor: `${moeda(valores.valorAprovadoCompras)} · ${moeda(valores.valorAprovadoPagamentos)}`, detalhe: `${resumo.compras} · ${resumo.pagamentos} pedidos`, icone: 'pi pi-wallet' }
    ],
    destaques,
    graficos,
    origem: origemSolicitacoes(c, {
      titulo: 'Solicitações aprovadas no período',
      descricao: 'Aprovadas entre as abertas no período, com valor pedido e autorizado.',
      filtro: { status: 'APROVADO', ...periodo(c) },
      colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.solicitante, COL.valor, COL.autorizado, COL.aberta],
      nomeArquivo: 'aprovadas-periodo',
      vazio: 'Nenhuma aprovação no período'
    }),
    copiloto: {
      foco: { tipo: 'metrica', id: 'valorAprovado', rotulo: 'Autorizado no período' },
      pergunta: `Foram autorizados ${formatarMoeda(valores.valorAprovado)} de ${formatarMoeda(valores.valorSolicitado)} pedidos (${pct(valores.taxaAutorizacao)}). O que explica o corte e a variação, por fornecedor, centro de custo e tipo de despesa?`
    }
  };
}

function vistaFila(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise {
  const { ciclo } = c.d;
  const fila = filaDeDecisao(c.d);
  const graficos: GraficoAnalise[] = [];
  if (fila.quantidade) graficos.push(graficoFila(c));
  if (ciclo.amostraSubmissao || ciclo.amostraDecisao) {
    graficos.push({
      id: 'ciclo',
      titulo: 'Quanto cada etapa demora',
      descricao: 'Mediana (metade dos casos) ao lado do P90 (9 em cada 10). P90 muito acima da mediana: poucos casos travam a fila.',
      tipo: 'bar',
      rotulos: ['Preenchimento', 'Até a decisão', 'Do começo ao fim'],
      series: [
        { name: 'Mediana (dias)', values: [ciclo.medianaDiasAteSubmissao, ciclo.medianaDiasAteDecisao, ciclo.medianaDiasCicloTotal] },
        { name: 'P90 (dias)', values: [ciclo.p90DiasAteSubmissao, ciclo.p90DiasAteDecisao, ciclo.p90DiasCicloTotal] }
      ],
      formato: 'number',
      altura: 230,
      nota: `Amostra: ${ciclo.amostraSubmissao} enviados e ${ciclo.amostraDecisao} decididos no período.`
    });
  }
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Fila de aprovação',
    titulo: fila.quantidade ? `${plural(fila.quantidade, 'pedido esperando', 'pedidos esperando')} decisão` : 'Nenhum pedido esperando decisão',
    descricao: 'Todo o histórico em aberto, não só o período: quem está esperando continua esperando.',
    icone: 'pi pi-hourglass',
    kpis: [
      { rotulo: 'Na fila', valor: String(fila.quantidade), tom: fila.quantidade ? 'warning' : 'success', icone: 'pi pi-inbox' },
      { rotulo: 'Valor parado', valor: moeda(fila.valor), icone: 'pi pi-money-bill' },
      { rotulo: 'Mais antigo', valor: plural(fila.maisAntigoDias, 'dia', 'dias'), tom: fila.maisAntigoDias > LIMIAR.escalarDecisao ? 'danger' : fila.maisAntigoDias > LIMIAR.cobrarDecisao ? 'warning' : 'neutral', icone: 'pi pi-history' },
      { rotulo: `Acima de ${LIMIAR.escalarDecisao} dias`, valor: String(fila.acimaDoEscalonamento), tom: fila.acimaDoEscalonamento ? 'danger' : 'success', icone: 'pi pi-exclamation-circle' },
      { rotulo: 'Decisão (mediana · P90)', valor: `${umaCasa(ciclo.medianaDiasAteDecisao)} · ${umaCasa(ciclo.p90DiasAteDecisao)} dias`, icone: 'pi pi-clock' },
      { rotulo: 'Rascunhos parados', valor: `${umaCasa(ciclo.idadeMediaRascunhosDias)} dias`, detalhe: 'idade média', icone: 'pi pi-file-edit' }
    ],
    destaques: ciclo.decisoesDesfeitas
      ? [{ tom: 'warning', icone: 'pi pi-undo', texto: `${plural(ciclo.decisoesDesfeitas, 'decisão desfeita', 'decisões desfeitas')} no período: veja o motivo na linha do tempo de cada pedido.` }]
      : [],
    graficos,
    origem: origemSolicitacoes(c, {
      titulo: 'Pedidos aguardando decisão',
      descricao: 'Do que espera há mais tempo para o mais recente (pela data de envio).',
      filtro: { status: 'SOLICITADO' },
      ordem: 'dataSubmissao,asc',
      colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.solicitante, COL.valor, COL.espera],
      nomeArquivo: 'fila-aprovacao',
      vazio: 'Nenhum pedido aguardando decisão'
    }),
    copiloto: {
      foco: { tipo: 'grafico', id: 'filaDecisao', rotulo: 'Fila de aprovação' },
      pergunta: `Há ${fila.quantidade} pedidos esperando decisão (${formatarMoeda(fila.valor)}), o mais antigo há ${fila.maisAntigoDias} dias. Quem precisa decidir, quais pedidos destravar primeiro e por quê?`
    }
  };
}

function vistaFaixaFila(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise | null {
  const faixas = c.d.envelhecimento;
  const i = faixas.findIndex((f) => f.faixa === a.value);
  if (i < 0) return null;
  const f = faixas[i];
  const max = f.idadeMaximaDias ?? Infinity;
  const vizinho = (j: number) => (faixas[j] ? { alvo: { dimension: 'faixa', value: faixas[j].faixa }, rotulo: `${faixas[j].faixa} dias` } : undefined);
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Fila por idade',
    titulo: `${plural(f.quantidade, 'pedido parado', 'pedidos parados')} há ${f.faixa} dias`,
    descricao: 'A idade na tela da lista conta desde o envio; o painel conta desde a entrada na etapa atual, por isso pode haver pequenas diferenças.',
    icone: 'pi pi-hourglass',
    kpis: [
      { rotulo: 'Pedidos', valor: String(f.quantidade), tom: f.idadeMinimaDias > LIMIAR.escalarDecisao ? 'danger' : f.idadeMinimaDias > LIMIAR.cobrarDecisao ? 'warning' : 'neutral', icone: 'pi pi-inbox' },
      { rotulo: 'Valor', valor: moeda(f.valor), icone: 'pi pi-money-bill' },
      { rotulo: 'Compras · pagamentos', valor: `${f.porTipo?.COMPRA ?? 0} · ${f.porTipo?.PAGAMENTO ?? 0}`, icone: 'pi pi-wallet' }
    ],
    anterior: vizinho(i - 1),
    proximo: vizinho(i + 1),
    graficos: [],
    origem: origemSolicitacoes(c, {
      titulo: 'Pedidos aguardando decisão',
      descricao: 'Fila completa, já filtrada pela faixa de espera.',
      filtro: { status: 'SOLICITADO' },
      ordem: 'dataSubmissao,asc',
      colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.solicitante, COL.valor, COL.espera],
      filtroInicial: filtrarLinhas(`faixa-${f.faixa}`, `Esperando ${f.faixa} dias`, (l) => (l.esperaDias ?? -1) >= f.idadeMinimaDias && (l.esperaDias ?? -1) <= max),
      nomeArquivo: `fila-${f.faixa}`,
      vazio: 'Nenhum pedido nesta faixa'
    })
  };
}

function vistaVencimentos(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise {
  const { valores } = c.d;
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Agenda de pagamentos',
    titulo: valores.quantidadeVencida ? `${moeda(valores.valorVencido)} vencidos sem comprovante` : `${moeda(valores.valorAVencer)} vencem nos próximos 30 dias`,
    descricao: 'Só entra o que foi aprovado, tem vencimento e ainda não tem comprovante de pagamento. Conta paga é histórico, não compromisso.',
    icone: 'pi pi-calendar-clock',
    kpis: [
      { rotulo: 'Vencido', valor: moeda(valores.valorVencido), detalhe: plural(valores.quantidadeVencida, 'despesa', 'despesas'), tom: valores.quantidadeVencida ? 'danger' : 'success', icone: 'pi pi-exclamation-triangle' },
      { rotulo: 'Vence em 30 dias', valor: moeda(valores.valorAVencer), detalhe: plural(valores.quantidadeAVencer, 'despesa', 'despesas'), tom: valores.quantidadeAVencer ? 'warning' : 'neutral', icone: 'pi pi-calendar' }
    ],
    graficos: c.d.vencimentos.some((f) => f.quantidade) ? [graficoVencimentos(c.d)] : [],
    origem: origemSolicitacoes(c, {
      titulo: 'Aprovadas com vencimento até 30 dias',
      descricao: 'Vencidas e a vencer em até 30 dias. A lista abre só com as que ainda não têm comprovante anexado.',
      filtro: { status: 'APROVADO', vencimentoFim: somarDias(c.hoje, 30) },
      colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.autorizado, COL.vencimento, COL.comprovante],
      filtroInicial: SEM_COMPROVANTE,
      nomeArquivo: 'agenda-pagamentos',
      vazio: 'Nada aprovado com vencimento nos próximos 30 dias'
    }),
    copiloto: {
      foco: { tipo: 'grafico', id: 'vencimentos', rotulo: 'O que vence a seguir' },
      pergunta: `Há ${formatarMoeda(valores.valorVencido)} vencidos sem comprovante e ${formatarMoeda(valores.valorAVencer)} vencendo em 30 dias. Quais pagar primeiro e quais fornecedores concentram o atraso?`
    }
  };
}

/** Intervalo de vencimento de cada faixa da régua. */
function intervaloVencimento(faixa: string, hoje: string): Pick<SolicitacaoFinanceiraFilter, 'vencimentoInicio' | 'vencimentoFim'> | null {
  switch (faixa) {
    case 'VENCIDO': return { vencimentoFim: somarDias(hoje, -1) };
    case '0-7': return { vencimentoInicio: hoje, vencimentoFim: somarDias(hoje, 7) };
    case '8-15': return { vencimentoInicio: somarDias(hoje, 8), vencimentoFim: somarDias(hoje, 15) };
    case '16-30': return { vencimentoInicio: somarDias(hoje, 16), vencimentoFim: somarDias(hoje, 30) };
    case '>30': return { vencimentoInicio: somarDias(hoje, 31) };
    default: return null;
  }
}

function vistaFaixaVencimento(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise | null {
  const faixas = c.d.vencimentos;
  const i = faixas.findIndex((f) => f.faixa === a.value);
  const intervalo = intervaloVencimento(a.value, c.hoje);
  if (i < 0 || !intervalo) return null;
  const f = faixas[i];
  const vencida = f.faixa === 'VENCIDO';
  const vizinho = (j: number) => (faixas[j] ? { alvo: { dimension: 'vencimento', value: faixas[j].faixa }, rotulo: faixas[j].rotulo } : undefined);
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Agenda de pagamentos',
    titulo: `${f.rotulo}: ${moeda(f.valor)}`,
    descricao: vencida
      ? `${plural(f.quantidade, 'despesa aprovada', 'despesas aprovadas')} já vencida(s), sem comprovante. A mais antiga venceu há ${plural(f.diasExtremo, 'dia', 'dias')}.`
      : `${plural(f.quantidade, 'despesa aprovada', 'despesas aprovadas')} a pagar. A mais próxima vence em ${plural(f.diasExtremo, 'dia', 'dias')}.`,
    icone: vencida ? 'pi pi-exclamation-triangle' : 'pi pi-calendar-clock',
    kpis: [
      { rotulo: vencida ? 'Vencido' : 'A pagar', valor: moeda(f.valor), tom: vencida ? 'danger' : 'warning', icone: 'pi pi-money-bill' },
      { rotulo: 'Despesas', valor: String(f.quantidade), icone: 'pi pi-list' },
      { rotulo: 'Do total a liquidar', valor: pct(f.percentualValor), icone: 'pi pi-percentage' }
    ],
    anterior: vizinho(i - 1),
    proximo: vizinho(i + 1),
    graficos: [],
    origem: origemSolicitacoes(c, {
      titulo: vencida ? 'Despesas vencidas' : `Despesas que vencem ${f.rotulo.toLowerCase()}`,
      descricao: 'Aprovadas nesta faixa de vencimento. A lista abre só com as que ainda não têm comprovante anexado.',
      filtro: { status: 'APROVADO', ...intervalo },
      colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.solicitante, COL.autorizado, COL.vencimento, COL.comprovante],
      filtroInicial: SEM_COMPROVANTE,
      nomeArquivo: `vencimentos-${f.faixa === '>30' ? 'acima-30' : f.faixa.toLowerCase()}`,
      vazio: 'Nenhuma despesa nesta faixa'
    }),
    copiloto: {
      foco: { tipo: 'grafico', id: 'vencimentos', rotulo: 'O que vence a seguir' },
      pergunta: `${f.rotulo}: ${plural(f.quantidade, 'despesa', 'despesas')} somando ${formatarMoeda(f.valor)}. Quais pagar primeiro e por quê?`
    }
  };
}

function vistaDocumentacao(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise {
  const { conformidade: cf, resumo } = c.d;
  const graficos: GraficoAnalise[] = [];
  const situacoes = c.d.documentosPorSituacao.filter((s) => s.quantidade > 0);
  if (situacoes.length) {
    graficos.push({
      id: 'situacao', titulo: 'Documentos por situação', tipo: 'bar-horizontal',
      rotulos: situacoes.map((s) => s.rotulo), series: [{ name: 'Documentos', values: situacoes.map((s) => s.quantidade) }],
      formato: 'integer', altura: alturaBarras(situacoes.length)
    });
  }
  const tipos = c.d.documentosPorTipo.filter((t) => t.quantidade > 0);
  if (tipos.length) {
    graficos.push({
      id: 'tipo', titulo: 'O que chegou, por natureza', tipo: 'doughnut',
      rotulos: tipos.map((t) => t.rotulo), series: [{ name: 'Documentos', values: tipos.map((t) => t.quantidade) }],
      formato: 'integer', altura: 230
    });
  }
  const descobertos = c.d.porFornecedor.filter((f) => f.aprovadas > 0 && f.percentualComDocumentoFiscal < 100)
    .sort((x, y) => x.percentualComDocumentoFiscal - y.percentualComDocumentoFiscal).slice(0, 10);
  if (descobertos.length) {
    graficos.push({
      id: 'fornecedores-sem-documento', titulo: 'Fornecedores com menos documento', descricao: 'Percentual das aprovadas com nota ou boleto. Clique para analisar o fornecedor.',
      tipo: 'bar-horizontal', rotulos: descobertos.map(nomeDoItem), series: [{ name: 'Com documento fiscal', values: descobertos.map((f) => f.percentualComDocumentoFiscal) }],
      formato: 'percent', altura: alturaBarras(descobertos.length), inteiro: true,
      aoSelecionar: (i) => navegar('ranking', `fornecedor~${descobertos[i].chave}`), rotuloSelecao: 'Analisar'
    });
  }
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Documentação',
    titulo: resumo.aprovadas ? `${pct(cf.coberturaFiscal, 0)} das aprovadas têm nota ou boleto` : 'Nenhuma aprovação no período',
    descricao: `${rotuloPeriodo(c)} · a fila de conferência considera todo o histórico em aberto.`,
    icone: 'pi pi-receipt',
    kpis: [
      { rotulo: 'Sem documento fiscal', valor: String(cf.aprovadasSemDocumentoFiscal), detalhe: moeda(cf.valorSemDocumentoFiscal), tom: cf.aprovadasSemDocumentoFiscal ? 'warning' : 'success', icone: 'pi pi-receipt' },
      { rotulo: 'Esperando conferência', valor: String(cf.aguardandoConferencia), detalhe: `mais antigo há ${plural(cf.idadeMaximaFilaDias, 'dia', 'dias')}`, tom: cf.aguardandoConferencia ? 'warning' : 'success', icone: 'pi pi-inbox' },
      { rotulo: 'Devolvidos com pendência', valor: String(cf.comPendencia), tom: cf.comPendencia ? 'warning' : 'neutral', icone: 'pi pi-replay' },
      { rotulo: 'Arquivos repetidos', valor: String(cf.duplicados), tom: cf.duplicados ? 'danger' : 'neutral', icone: 'pi pi-clone' },
      { rotulo: 'Notas e boletos sem número', valor: String(cf.semIdentificacao), icone: 'pi pi-hashtag' },
      { rotulo: 'Sem pedido correspondente', valor: String(cf.avulsosSemVinculo), icone: 'pi pi-unlock' }
    ],
    graficos,
    origem: origemSolicitacoes(c, {
      titulo: 'Solicitações aprovadas no período',
      descricao: 'A lista abre só com as aprovadas que ainda não têm nota, boleto ou recibo.',
      filtro: { status: 'APROVADO', ...periodo(c) },
      colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.solicitante, COL.autorizado, COL.fiscal],
      filtroInicial: SEM_FISCAL,
      nomeArquivo: 'aprovadas-sem-documento',
      vazio: 'Nenhuma aprovação no período'
    }),
    links: [{ rotulo: 'Abrir o repositório de documentos', icone: 'pi pi-folder-open', rota: '/financeiro/documentos' }],
    copiloto: {
      foco: { tipo: 'metrica', id: 'coberturaFiscal', rotulo: 'Aprovadas com nota ou boleto' },
      pergunta: 'Quais despesas aprovadas deste recorte estão sem nota ou boleto, e quais fornecedores concentram essa pendência?'
    }
  };
}

function vistaPeriodo(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise | null {
  const serie = c.d.serieTemporal;
  const i = serie.findIndex((s) => s.chave === a.value);
  if (i < 0) return null;
  const p = serie[i];
  const fimPeriodo = serie[i + 1]?.inicio ?? (c.filtros.fim ?? c.d.fim);
  const inicio = i === 0 ? (c.filtros.inicio ?? c.d.inicio) : p.inicio;
  // O próximo intervalo começa no instante seguinte; a listagem usa limite inclusivo.
  const fim = serie[i + 1] ? new Date(Date.parse(fimPeriodo) - 1).toISOString() : fimPeriodo;
  const vizinho = (j: number) => (serie[j] ? { alvo: { dimension: 'periodo', value: serie[j].chave }, rotulo: serie[j].rotulo } : undefined);
  return {
    chave: chaveDoAlvo(a),
    eyebrow: 'Período',
    titulo: p.rotulo,
    descricao: 'Pedidos abertos neste intervalo, com o desfecho que têm hoje.',
    icone: 'pi pi-calendar',
    kpis: [
      { rotulo: 'Pedidos', valor: String(p.abertas), detalhe: moeda(p.valorSolicitado), icone: 'pi pi-shopping-cart' },
      { rotulo: 'Autorizado', valor: moeda(p.valorAprovado), detalhe: `${pct(p.taxaAutorizacao)} do pedido`, tom: 'brand', icone: 'pi pi-check-circle' },
      { rotulo: 'Aprovados · rejeitados', valor: `${p.aprovadas} · ${p.rejeitadas}`, detalhe: `recusado: ${moeda(p.valorRejeitado)}`, icone: 'pi pi-check-square' },
      { rotulo: 'Sem desfecho', valor: String(p.pendentes), detalhe: `${p.canceladas} cancelado(s)`, tom: p.pendentes ? 'warning' : 'neutral', icone: 'pi pi-hourglass' }
    ],
    anterior: vizinho(i - 1),
    proximo: vizinho(i + 1),
    graficos: [],
    origem: origemSolicitacoes(c, {
      titulo: `Pedidos abertos em ${p.rotulo}`,
      descricao: 'Mesma coorte do gráfico, com os filtros do painel.',
      filtro: { dataCriacaoInicio: inicio, dataCriacaoFim: fim },
      colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.solicitante, COL.status, COL.valor, COL.autorizado],
      nomeArquivo: `pedidos-${p.chave}`,
      vazio: 'Nenhum pedido aberto neste período'
    }),
    copiloto: {
      foco: { tipo: 'grafico', id: 'pedidoAutorizado', rotulo: 'Pedido × autorizado' },
      pergunta: `Em ${p.rotulo} foram ${p.abertas} pedidos (${formatarMoeda(p.valorSolicitado)}) e ${formatarMoeda(p.valorAprovado)} autorizados. O que se destaca neste período?`
    }
  };
}

function vistaRanking(a: AlvoAnalise, c: ContextoAnaliseFinanceiro): VistaAnalise | null {
  const [dimensao, chave] = a.value.split('~') as [DimensaoRanking, string];
  const def = DIMENSOES_RANKING[dimensao];
  if (!def || !chave) return null;
  const itens = rankingDe(c.d, dimensao);
  const item = itens.find((x) => x.chave === chave);
  if (!item) return null;
  const nome = nomeDoItem(item);
  const kpis: KpiAnalise[] = [
    { rotulo: 'Autorizado', valor: moeda(item.valorAprovado), detalhe: `${pct(item.percentualValor)} do autorizado no painel`, tom: 'brand', icone: 'pi pi-check-circle' },
    { rotulo: 'Pedido', valor: moeda(item.valorSolicitado), detalhe: plural(item.quantidade, 'pedido', 'pedidos'), icone: 'pi pi-shopping-cart' },
    { rotulo: 'Esperando decisão', valor: String(item.pendentes), tom: item.pendentes ? 'warning' : 'neutral', icone: 'pi pi-hourglass' },
    { rotulo: 'Aprovação', valor: item.aprovadas + item.rejeitadas ? pct(item.taxaAprovacao) : '—', detalhe: `${item.aprovadas} aprovado(s) · ${item.rejeitadas} rejeitado(s)`, icone: 'pi pi-thumbs-up' },
    { rotulo: 'Com nota ou boleto', valor: item.aprovadas ? pct(item.percentualComDocumentoFiscal, 0) : '—', tom: item.aprovadas && item.percentualComDocumentoFiscal < LIMIAR.coberturaMinima ? 'warning' : 'neutral', icone: 'pi pi-receipt' },
    { rotulo: 'Ticket médio', valor: formatarMoeda(item.ticketMedio), icone: 'pi pi-tag' }
  ];
  const destaques: DestaqueAnalise[] = [];
  if (dimensao === 'fornecedor' && item.percentualValor > LIMIAR.concentracao) {
    destaques.push({ tom: 'warning', icone: 'pi pi-chart-pie', texto: `Concentra ${pct(item.percentualValor)} do autorizado: confirme que a dependência é intencional e mantenha alternativa homologada.` });
  }
  const indice = itens.indexOf(item);
  const vizinho = (j: number) => (itens[j] ? { alvo: { dimension: 'ranking', value: `${dimensao}~${itens[j].chave}` }, rotulo: nomeDoItem(itens[j]) } : undefined);
  const filtroDim = def.filtro;
  return {
    chave: chaveDoAlvo(a),
    eyebrow: `Onde o dinheiro vai · ${def.rotulo}`,
    titulo: nome,
    descricao: `${rotuloPeriodo(c)} · pedidos abertos no período, com os filtros do painel.`,
    icone: 'pi pi-sitemap',
    kpis,
    destaques,
    anterior: vizinho(indice - 1),
    proximo: vizinho(indice + 1),
    graficos: [{
      id: 'desfecho', titulo: 'Desfecho dos pedidos', tipo: 'doughnut',
      rotulos: ['Aprovados', 'Rejeitados', 'Esperando decisão'],
      series: [{ name: 'Pedidos', values: [item.aprovadas, item.rejeitadas, item.pendentes] }],
      formato: 'integer', altura: 220
    }],
    origem: filtroDim
      ? origemSolicitacoes(c, {
          titulo: `Pedidos de ${nome}`,
          descricao: 'Pedidos abertos no período para este item.',
          filtro: { ...periodo(c), [filtroDim]: item.chave },
          colunas: [COL.numero, COL.tipo, COL.fornecedor, COL.solicitante, COL.status, COL.valor, COL.autorizado],
          nomeArquivo: `pedidos-${dimensao}`,
          vazio: 'Nenhum pedido aberto no período para este item'
        })
      : undefined,
    copiloto: {
      foco: { tipo: 'grafico', id: `ranking.${dimensao}`, rotulo: `Onde o dinheiro vai — ${def.rotulo.toLowerCase()}` },
      pergunta: `${nome} recebeu ${formatarMoeda(item.valorAprovado)} autorizados (${pct(item.percentualValor)} do painel) em ${item.quantidade} pedidos. O que explica esse volume e há algo a corrigir?`
    }
  };
}

