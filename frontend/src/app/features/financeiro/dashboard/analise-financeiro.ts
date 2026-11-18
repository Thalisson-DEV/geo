import { CesTone } from '@ces/ui';

import {
  DashboardFinanceiroFilter,
  DashboardFinanceiroResponse,
  PrioridadeFinanceiraItem,
  ROTULO_STATUS_SOLICITACAO,
  RankingFinanceiroItem,
  SeveridadePrioridade
} from '../../../core/models/financeiro-dashboard.models';
import {
  SolicitacaoFinanceira,
  SolicitacaoFinanceiraFilter,
  StatusSolicitacao,
  TipoSolicitacao
} from '../../../core/models/financeiro.models';
import { AlvoAnalise } from '../../../shared/components/dashboard/dashboard-analise.models';
import { MetricTone } from '../../../shared/components/dashboard/dashboard-ui.components';
import { LeituraGerencial, VereditoGerencial } from '../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import {
  formatarMoedaCompacta as moeda,
  formatarPercentual as pct,
  formatarVariacao,
  plural,
  umaCasa
} from './financeiro-dashboard-insights';

/**
 * Leitura de gestor do painel do financeiro, em funções puras: veredito, leituras, cartões, a lista
 * "o que pede ação" e as linhas das análises. O componente só liga isto à tela; o backend continua
 * dono dos percentuais e médias (nada aqui recalcula um número que ele já entrega).
 */

// ------------------------------------------------------------------ limiares

/** Espelham as regras do backend (`DashboardFinanceiroUseCases`), para tela e prioridades concordarem. */
export const LIMIAR = {
  /** Pedido esperando decisão passa a ser cobrado. */
  cobrarDecisao: 7,
  /** Pedido esperando decisão vira crítico. */
  escalarDecisao: 15,
  /** Cobertura de documento fiscal considerada boa / mínima aceitável. */
  coberturaBoa: 90,
  coberturaMinima: 70,
  /** Corte na aprovação que merece revisão da estimativa. */
  corteAlto: 15,
  /** P90 de dias até a decisão que indica casos travando. */
  p90Lento: 15,
  /** Fatia do autorizado num só fornecedor que pede decisão consciente. */
  concentracao: 40
} as const;

const LIMITE_LINHAS_ACAO = 10;

// ------------------------------------------------------------------ datas (dia de gestão em São Paulo)

const DIA_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Dia civil (`AAAA-MM-DD`) em São Paulo. Data pura (`2026-11-12`) fica como está. */
export function diaDe(valor: Date | string): string {
  if (typeof valor === 'string' && SO_DATA.test(valor)) return valor;
  return DIA_ISO.format(typeof valor === 'string' ? new Date(valor) : valor);
}

export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Dias corridos de `de` até `ate` (ambos `AAAA-MM-DD`); negativo quando `ate` vem antes. */
export function diasEntre(de: string, ate: string): number {
  const utc = (dia: string) => {
    const [a, m, d] = dia.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

export function dataBr(dia: string): string {
  return dia.split('-').reverse().join('/');
}

// ------------------------------------------------------------------ agregados de apoio

/** Fila histórica esperando decisão (o que o gráfico de idade mostra), não só a do período. */
export function filaDeDecisao(d: DashboardFinanceiroResponse) {
  const faixas = d.envelhecimento ?? [];
  const soma = (f: (x: (typeof faixas)[number]) => number) => faixas.reduce((t, x) => t + f(x), 0);
  return {
    quantidade: soma((x) => x.quantidade),
    valor: soma((x) => x.valor),
    acimaDoEscalonamento: soma((x) => (x.idadeMinimaDias > LIMIAR.escalarDecisao ? x.quantidade : 0)),
    maisAntigoDias: d.ciclo.idadeMaximaFilaDias
  };
}

export function totalALiquidar(d: DashboardFinanceiroResponse): number {
  return (d.vencimentos ?? []).reduce((t, f) => t + f.quantidade, 0);
}

// ------------------------------------------------------------------ cartões

export interface CartaoFinanceiro {
  readonly id: string;
  readonly rotulo: string;
  readonly valor: string;
  readonly detalhe: string;
  readonly icone: string;
  readonly tom: MetricTone;
  readonly progresso: number | null;
  readonly acao: string;
  readonly alvo: AlvoAnalise;
}

const kpi = (value: string): AlvoAnalise => ({ dimension: 'kpi', value });

/** Os quatro números que um gestor confere primeiro; cada um abre a análise que o sustenta. */
export function cartoesFinanceiros(d: DashboardFinanceiroResponse): CartaoFinanceiro[] {
  const { resumo, valores, conformidade } = d;
  const fila = filaDeDecisao(d);
  const variacao = valores.valorAprovadoPeriodoAnterior > 0
    ? `${formatarVariacao(valores.variacaoValorAprovado)} vs. período anterior`
    : 'sem período anterior para comparar';
  const semFiscal = conformidade.aprovadasSemDocumentoFiscal;

  return [
    {
      id: 'autorizacao',
      rotulo: 'Autorizado no período',
      valor: moeda(valores.valorAprovado),
      detalhe: resumo.total > 0
        ? `${pct(valores.taxaAutorizacao)} dos ${moeda(valores.valorSolicitado)} pedidos · ${variacao}`
        : 'Nenhum pedido aberto no período',
      icone: 'pi-check-circle',
      tom: 'primary',
      progresso: resumo.total > 0 ? valores.taxaAutorizacao : null,
      acao: 'Analisar',
      alvo: kpi('autorizacao')
    },
    {
      id: 'fila',
      rotulo: 'Esperando decisão',
      valor: plural(fila.quantidade, 'pedido', 'pedidos'),
      detalhe: fila.quantidade
        ? `${moeda(fila.valor)} parados · o mais antigo há ${plural(fila.maisAntigoDias, 'dia', 'dias')}`
        : 'Fila vazia: nada esperando aprovação',
      icone: 'pi-hourglass',
      tom: !fila.quantidade ? 'green' : fila.maisAntigoDias > LIMIAR.escalarDecisao ? 'red' : fila.maisAntigoDias > LIMIAR.cobrarDecisao ? 'amber' : 'slate',
      progresso: null,
      acao: 'Ver a fila',
      alvo: kpi('fila')
    },
    {
      id: 'vencimentos',
      rotulo: 'Vencido sem comprovante',
      valor: moeda(valores.valorVencido),
      detalhe: `${plural(valores.quantidadeVencida, 'despesa vencida', 'despesas vencidas')} · ${moeda(valores.valorAVencer)} vencem em 30 dias`,
      icone: 'pi-exclamation-triangle',
      tom: valores.quantidadeVencida ? 'red' : valores.quantidadeAVencer ? 'amber' : 'green',
      progresso: null,
      acao: 'Ver a agenda',
      alvo: kpi('vencimentos')
    },
    {
      id: 'documentacao',
      rotulo: 'Aprovadas com nota ou boleto',
      valor: resumo.aprovadas ? pct(conformidade.coberturaFiscal, 0) : 'Sem aprovações',
      detalhe: !resumo.aprovadas
        ? `Nenhuma aprovação no período · ${plural(conformidade.aguardandoConferencia, 'documento', 'documentos')} na conferência`
        : semFiscal
          ? `${plural(semFiscal, 'despesa', 'despesas')} sem documento fiscal (${moeda(conformidade.valorSemDocumentoFiscal)}) · ${conformidade.aguardandoConferencia} na conferência`
          : `Toda despesa aprovada tem documento · ${conformidade.aguardandoConferencia} na conferência`,
      icone: 'pi-receipt',
      tom: !resumo.aprovadas ? 'slate' : conformidade.coberturaFiscal >= LIMIAR.coberturaBoa ? 'green' : conformidade.coberturaFiscal >= LIMIAR.coberturaMinima ? 'amber' : 'red',
      progresso: resumo.aprovadas ? conformidade.coberturaFiscal : null,
      acao: 'Analisar',
      alvo: kpi('documentacao')
    }
  ];
}

// ------------------------------------------------------------------ leituras e veredito

const PESO_TOM: Record<CesTone, number> = { danger: 0, warning: 1, info: 2, brand: 2, neutral: 3, success: 4 };

/** Ordena pelo que pede ação primeiro (estável) e corta no limite. */
export function priorizar<T extends { tom: CesTone }>(itens: readonly T[], limite = 6): T[] {
  return itens.map((item, i) => ({ item, i }))
    .sort((a, b) => PESO_TOM[a.item.tom] - PESO_TOM[b.item.tom] || a.i - b.i)
    .slice(0, limite)
    .map(({ item }) => item);
}

/** Leituras de gestão: o que foi encontrado, por que importa e onde aprofundar. */
export function leiturasFinanceiras(d: DashboardFinanceiroResponse): LeituraGerencial[] {
  const { resumo, valores, ciclo, conformidade } = d;
  const fila = filaDeDecisao(d);
  const leituras: LeituraGerencial[] = [];

  if (valores.quantidadeVencida > 0) {
    const extremo = d.vencimentos.find((f) => f.faixa === 'VENCIDO')?.diasExtremo;
    leituras.push({
      id: 'vencido', tom: 'danger', icone: 'pi pi-exclamation-triangle', titulo: 'Vencido sem comprovante', valor: moeda(valores.valorVencido),
      texto: `${plural(valores.quantidadeVencida, 'despesa aprovada já venceu', 'despesas aprovadas já venceram')} sem comprovante de pagamento.`
        + (extremo ? ` A mais antiga venceu há ${plural(extremo, 'dia', 'dias')}.` : ''),
      acao: { rotulo: 'Ver as despesas', alvo: { dimension: 'vencimento', value: 'VENCIDO' } }
    });
  }

  if (fila.quantidade > 0) {
    leituras.push({
      id: 'fila',
      tom: fila.maisAntigoDias > LIMIAR.escalarDecisao ? 'danger' : fila.maisAntigoDias > LIMIAR.cobrarDecisao ? 'warning' : 'info',
      icone: 'pi pi-hourglass', titulo: 'Fila de aprovação', valor: plural(fila.quantidade, 'pedido', 'pedidos'),
      texto: `${moeda(fila.valor)} esperando decisão; o mais antigo há ${plural(fila.maisAntigoDias, 'dia', 'dias')}.`
        + (fila.acimaDoEscalonamento ? ` ${plural(fila.acimaDoEscalonamento, 'pedido passou', 'pedidos passaram')} de ${LIMIAR.escalarDecisao} dias.` : ''),
      acao: { rotulo: 'Ver a fila', alvo: kpi('fila') }
    });
  }

  if (valores.quantidadeAVencer > 0) {
    const semana = d.vencimentos.find((f) => f.faixa === '0-7');
    leituras.push({
      id: 'avencer', tom: semana?.quantidade ? 'warning' : 'info', icone: 'pi pi-calendar-clock', titulo: 'Vence nos próximos 30 dias', valor: moeda(valores.valorAVencer),
      texto: `${plural(valores.quantidadeAVencer, 'despesa aprovada a pagar', 'despesas aprovadas a pagar')}`
        + (semana?.quantidade ? `; ${plural(semana.quantidade, 'vence', 'vencem')} em até 7 dias (${moeda(semana.valor)}).` : '; nenhuma vence nesta semana.'),
      acao: { rotulo: 'Ver a agenda', alvo: kpi('vencimentos') }
    });
  }

  if (resumo.aprovadas > 0) {
    const boa = conformidade.coberturaFiscal >= LIMIAR.coberturaBoa;
    leituras.push({
      id: 'documentacao', tom: boa ? 'success' : 'warning', icone: 'pi pi-receipt',
      titulo: boa ? 'Despesa documentada' : 'Despesa sem documento fiscal', valor: pct(conformidade.coberturaFiscal, 0),
      texto: conformidade.aprovadasSemDocumentoFiscal
        ? `das aprovadas têm nota, boleto ou recibo. Faltam em ${plural(conformidade.aprovadasSemDocumentoFiscal, 'despesa', 'despesas')} (${moeda(conformidade.valorSemDocumentoFiscal)}).`
        : 'das aprovadas têm nota, boleto ou recibo guardado.',
      acao: boa ? undefined : { rotulo: 'Ver quem falta', alvo: kpi('documentacao') }
    });
  }

  if (valores.corteNaAprovacao > 0 && valores.percentualCorte > LIMIAR.corteAlto) {
    leituras.push({
      id: 'corte', tom: 'warning', icone: 'pi pi-percentage', titulo: 'Corte na aprovação', valor: pct(valores.percentualCorte),
      texto: `${moeda(valores.corteNaAprovacao)} pedidos não foram autorizados sem que o pedido fosse recusado: a estimativa de quem pede está acima do praticado.`,
      acao: { rotulo: 'Analisar a autorização', alvo: kpi('autorizacao') }
    });
  }

  if (ciclo.amostraDecisao > 0 && ciclo.p90DiasAteDecisao > LIMIAR.p90Lento) {
    leituras.push({
      id: 'tempo', tom: 'warning', icone: 'pi pi-clock', titulo: 'Parte das decisões trava', valor: `${umaCasa(ciclo.p90DiasAteDecisao)} dias`,
      texto: `9 em cada 10 decisões saem em até ${umaCasa(ciclo.p90DiasAteDecisao)} dias, mas a metade sai em ${umaCasa(ciclo.medianaDiasAteDecisao)}: poucos casos seguram a fila.`,
      acao: { rotulo: 'Ver a fila', alvo: kpi('fila') }
    });
  }

  if (ciclo.decisoesDesfeitas > 0) {
    leituras.push({
      id: 'desfeitas', tom: 'warning', icone: 'pi pi-undo', titulo: 'Decisões desfeitas', valor: String(ciclo.decisoesDesfeitas),
      texto: 'Aprovações ou rejeições que voltaram para a fila: retrabalho na análise ou no pedido.',
      acao: { rotulo: 'Analisar a autorização', alvo: kpi('autorizacao') }
    });
  }

  const maior = d.porFornecedor?.[0];
  if (maior && valores.valorAprovado > 0 && maior.valorAprovado > 0) {
    const concentrado = maior.percentualValor > LIMIAR.concentracao;
    leituras.push({
      id: 'fornecedor', tom: concentrado ? 'warning' : 'info', icone: 'pi pi-building', titulo: concentrado ? 'Dependência de um fornecedor' : 'Maior fornecedor',
      valor: maior.nome ?? 'Cadastro não disponível',
      texto: `${pct(maior.percentualValor)} do autorizado no período (${moeda(maior.valorAprovado)} em ${plural(maior.quantidade, 'pedido', 'pedidos')}).`,
      acao: { rotulo: 'Analisar o fornecedor', alvo: { dimension: 'ranking', value: `fornecedor~${maior.chave}` } }
    });
  }

  return priorizar(leituras, 6);
}

export function vereditoFinanceiro(d: DashboardFinanceiroResponse, leituras: readonly LeituraGerencial[]): VereditoGerencial {
  const { resumo, valores } = d;
  const fila = filaDeDecisao(d);
  const critica = valores.quantidadeVencida > 0 || d.prioridades.some((p) => p.severidade === 'CRITICA') || leituras.some((l) => l.tom === 'danger');
  const atencao = !critica && (leituras.some((l) => l.tom === 'warning') || d.prioridades.some((p) => p.severidade === 'ALTA' || p.severidade === 'MEDIA'));
  const semMovimento = resumo.total === 0 && fila.quantidade === 0 && totalALiquidar(d) === 0;

  let titulo: string;
  if (critica) {
    const primeira = d.prioridades.find((p) => p.severidade === 'CRITICA');
    titulo = valores.quantidadeVencida > 0
      ? `${moeda(valores.valorVencido)} vencidos sem comprovante`
      : fila.acimaDoEscalonamento > 0
        ? `${plural(fila.acimaDoEscalonamento, 'pedido parado', 'pedidos parados')} há mais de ${LIMIAR.escalarDecisao} dias na aprovação`
        : primeira?.titulo ?? 'Há pendências críticas no financeiro';
  } else if (atencao) {
    titulo = 'Financeiro com pontos de atenção';
  } else {
    titulo = semMovimento ? 'Sem movimento no recorte' : 'Financeiro sob controle';
  }

  const partes = [
    resumo.total > 0
      ? `${moeda(valores.valorAprovado)} autorizados de ${moeda(valores.valorSolicitado)} pedidos (${pct(valores.taxaAutorizacao)})`
      : 'Nenhum pedido aberto no período',
    fila.quantidade
      ? `${plural(fila.quantidade, 'pedido esperando', 'pedidos esperando')} decisão (o mais antigo há ${plural(fila.maisAntigoDias, 'dia', 'dias')})`
      : 'fila de aprovação vazia',
    `${moeda(valores.valorAVencer)} vencem nos próximos 30 dias`
  ];

  return {
    tom: critica ? 'danger' : atencao ? 'warning' : 'success',
    rotulo: critica ? 'Agir agora' : atencao ? 'Acompanhar' : 'Sob controle',
    titulo,
    texto: `${partes.join('; ')}.`,
    progresso: resumo.total > 0 ? { valor: valores.taxaAutorizacao, rotulo: `${pct(valores.taxaAutorizacao)} do valor pedido saiu autorizado` } : undefined
  };
}

// ------------------------------------------------------------------ recorte do painel na listagem

/** Filtros do painel que a listagem de solicitações aceita (um valor por dimensão). */
export const FILTROS_PAINEL_NA_LISTAGEM: readonly [keyof DashboardFinanceiroFilter, keyof SolicitacaoFinanceiraFilter][] = [
  ['idBase', 'baseId'], ['idProcesso', 'processoId'], ['idObra', 'obraId'], ['idFornecedor', 'fornecedorId'],
  ['idFormulario', 'formularioId'], ['status', 'status'], ['tipoDespesa', 'tipoDespesa']
];

export interface RecorteListagem {
  readonly tipo: TipoSolicitacao | 'AMBOS';
  readonly filtro: SolicitacaoFinanceiraFilter;
  /** Filtros do painel que a listagem não consegue reproduzir. */
  readonly ignorados: readonly string[];
}

/**
 * Recorte do painel traduzido para a listagem. `sobrepor` lista os filtros que o chamador define por
 * conta própria (ex.: o status da fila) e que, por isso, não vêm do painel.
 */
export function recorteNaListagem(f: DashboardFinanceiroFilter, sobrepor: readonly (keyof SolicitacaoFinanceiraFilter)[] = []): RecorteListagem {
  const filtro: Record<string, unknown> = {};
  const ignorados: string[] = [];
  for (const [painel, lista] of FILTROS_PAINEL_NA_LISTAGEM) {
    if (sobrepor.includes(lista)) continue;
    const selecao = (f[painel] as readonly string[] | null | undefined) ?? [];
    if (selecao.length === 1) filtro[lista] = selecao[0];
    else if (selecao.length > 1) ignorados.push(painel);
  }
  (['idSolicitante', 'prioridade'] as const).forEach((chave) => {
    if ((f[chave] as unknown[] | null | undefined)?.length) ignorados.push(chave);
  });
  return { tipo: f.tipo ?? 'AMBOS', filtro: filtro as SolicitacaoFinanceiraFilter, ignorados };
}

/** Parâmetros de URL da listagem de gestão (datas como `AAAA-MM-DD`, que é o que ela lê). */
export function paramsDaListagem(recorte: RecorteListagem, extra: SolicitacaoFinanceiraFilter = {}): Record<string, string> {
  const params: Record<string, string> = {};
  const DATAS = /^(dataCriacao|dataSubmissao|dataDecisao|vencimento)/;
  for (const [chave, valor] of Object.entries({ ...recorte.filtro, ...extra })) {
    if (valor === null || valor === undefined || valor === '' || ['page', 'size', 'sort'].includes(chave)) continue;
    params[chave] = DATAS.test(chave) ? diaDe(String(valor)) : String(valor);
  }
  if (recorte.tipo !== 'AMBOS') params['tipo'] = recorte.tipo;
  return params;
}

export const ROTA_LISTAGEM_GESTAO = '/financeiro/gestao/solicitacoes';

// ------------------------------------------------------------------ linhas de solicitação (origem das análises)

const FISCAIS = new Set(['NOTA_FISCAL', 'BOLETO', 'RECIBO']);

export interface LinhaSolicitacao {
  readonly id: string;
  readonly numero: number;
  readonly tipo: TipoSolicitacao;
  readonly tipoRotulo: string;
  readonly formulario: string;
  readonly fornecedor: string;
  readonly solicitante: string;
  readonly status: StatusSolicitacao;
  readonly statusRotulo: string;
  readonly valor: number;
  readonly valorAprovado: number | null;
  readonly abertaEm: string;
  readonly enviadaEm: string | null;
  /** Dias desde o envio para decisão (só para quem está aguardando). */
  readonly esperaDias: number | null;
  readonly vencimento: string | null;
  /** Dias até o vencimento; negativo = vencida. */
  readonly diasParaVencer: number | null;
  readonly documentos: number;
  readonly temFiscal: boolean;
  readonly temComprovante: boolean;
}

function lerDia(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const data = new Date(valor);
  return SO_DATA.test(valor.slice(0, 10)) ? valor.slice(0, 10) : Number.isNaN(data.getTime()) ? null : diaDe(data);
}

export function linhaSolicitacao(s: SolicitacaoFinanceira, hoje: string): LinhaSolicitacao {
  const tipo = s.formulario?.tipoSolicitacao ?? 'COMPRA';
  const vencimento = lerDia(s.valores?.['vencimento']?.valor);
  const tipos = new Set((s.documentos ?? []).map((doc) => doc.tipo));
  const enviadaEm = s.dataSubmissao ?? null;
  return {
    id: s.id,
    numero: s.numero,
    tipo,
    tipoRotulo: tipo === 'PAGAMENTO' ? 'Pagamento' : 'Compra',
    formulario: s.formulario?.titulo ?? s.formulario?.codigo ?? '—',
    fornecedor: s.fornecedor?.nome ?? s.fornecedor?.razaoSocial ?? '—',
    solicitante: s.nomeColaboradorSolicitante ?? s.usuarioSolicitante ?? '—',
    status: s.status,
    statusRotulo: ROTULO_STATUS_SOLICITACAO[s.status] ?? s.status,
    valor: s.valor ?? 0,
    valorAprovado: s.desfecho?.valorAprovado ?? null,
    abertaEm: s.dataCriacao,
    enviadaEm,
    esperaDias: s.status === 'SOLICITADO' ? Math.max(0, diasEntre(diaDe(enviadaEm ?? s.dataCriacao), hoje)) : null,
    vencimento,
    diasParaVencer: vencimento ? diasEntre(hoje, vencimento) : null,
    documentos: s.documentos?.length ?? 0,
    temFiscal: [...tipos].some((t) => FISCAIS.has(t)),
    temComprovante: tipos.has('COMPROVANTE_PAGAMENTO')
  };
}

export function rotaDoRegistro(l: Pick<LinhaSolicitacao, 'tipo' | 'id'>): unknown[] {
  return [l.tipo === 'PAGAMENTO' ? '/financeiro/pagamentos' : '/financeiro/compras', l.id];
}

export function textoVencimento(l: Pick<LinhaSolicitacao, 'vencimento' | 'diasParaVencer'>): string {
  if (!l.vencimento || l.diasParaVencer === null) return '—';
  const dia = dataBr(l.vencimento);
  if (l.diasParaVencer < 0) return `${dia} · venceu há ${plural(-l.diasParaVencer, 'dia', 'dias')}`;
  if (l.diasParaVencer === 0) return `${dia} · vence hoje`;
  return `${dia} · em ${plural(l.diasParaVencer, 'dia', 'dias')}`;
}

// ------------------------------------------------------------------ o que pede ação

export type DestinoPendencia =
  | { readonly tipo: 'rota'; readonly rota: readonly unknown[]; readonly queryParams?: Record<string, string> }
  | { readonly tipo: 'analise'; readonly alvo: AlvoAnalise };

export interface PendenciaFinanceira {
  readonly chave: string;
  readonly tom: CesTone;
  /** Ordem de gravidade: 0 crítica … 3 baixa. */
  readonly peso: number;
  readonly gravidade: string;
  readonly icone: string;
  readonly oQue: string;
  readonly detalhe: string;
  readonly valor: number | null;
  readonly prazo: string;
  /** Dias de atraso ou de espera, para ordenar dentro da mesma gravidade. */
  readonly dias: number;
  readonly proximoPasso: string;
  readonly agregada: boolean;
  readonly destino: DestinoPendencia;
}

/** Registros individuais que alimentam "o que pede ação"; `null` quando a consulta falhou ou não coube ao perfil. */
export interface RegistrosAcao {
  readonly parados: readonly SolicitacaoFinanceira[] | null;
  readonly vencidas: readonly SolicitacaoFinanceira[] | null;
}

const PESO_SEVERIDADE: Record<SeveridadePrioridade, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
const GRAVIDADE = ['Crítica', 'Alta', 'Média', 'Baixa'] as const;
const TOM_PESO: CesTone[] = ['danger', 'warning', 'warning', 'info'];
const ICONE_PESO = ['pi pi-exclamation-circle', 'pi pi-exclamation-triangle', 'pi pi-info-circle', 'pi pi-info-circle'];

interface ComoAgir {
  readonly oQue: string;
  readonly icone: string;
  readonly destino: (p: PrioridadeFinanceiraItem, recorte: RecorteListagem, hoje: string) => DestinoPendencia;
}

const listagem = (recorte: RecorteListagem, extra: SolicitacaoFinanceiraFilter): DestinoPendencia =>
  ({ tipo: 'rota', rota: [ROTA_LISTAGEM_GESTAO], queryParams: paramsDaListagem(recorte, extra) });

const COMO_AGIR: Record<string, ComoAgir> = {
  VENCIDO_SEM_COMPROVANTE: { oQue: 'Vencido sem comprovante', icone: 'pi pi-exclamation-triangle', destino: () => ({ tipo: 'analise', alvo: { dimension: 'vencimento', value: 'VENCIDO' } }) },
  APROVACAO_PARADA: {
    oQue: 'Fila de aprovação', icone: 'pi pi-hourglass',
    destino: (p, r, hoje) => listagem(r, { status: 'SOLICITADO', dataSubmissaoFim: somarDias(hoje, -Number(p.drilldown['diasParadoMinimo'] ?? LIMIAR.cobrarDecisao)) })
  },
  RASCUNHO_ESQUECIDO: {
    oQue: 'Rascunho esquecido', icone: 'pi pi-file-edit',
    destino: (p, r, hoje) => listagem(r, { status: 'RASCUNHO', dataCriacaoFim: somarDias(hoje, -Number(p.drilldown['diasParadoMinimo'] ?? 15)) })
  },
  VENCIMENTO_PROXIMO: { oQue: 'Vence nesta semana', icone: 'pi pi-calendar-clock', destino: () => ({ tipo: 'analise', alvo: { dimension: 'vencimento', value: '0-7' } }) },
  DOCUMENTO_DUPLICADO: { oQue: 'Documento repetido', icone: 'pi pi-clone', destino: () => ({ tipo: 'rota', rota: ['/financeiro/documentos'] }) },
  SEM_NOTA_FISCAL: { oQue: 'Sem documento fiscal', icone: 'pi pi-receipt', destino: () => ({ tipo: 'analise', alvo: kpi('documentacao') }) },
  DOCUMENTO_AGUARDANDO_CONFERENCIA: { oQue: 'Conferência parada', icone: 'pi pi-inbox', destino: () => ({ tipo: 'rota', rota: ['/financeiro/documentos'], queryParams: { aguardando: 'true' } }) },
  CORTE_ELEVADO: { oQue: 'Corte na aprovação', icone: 'pi pi-percentage', destino: () => ({ tipo: 'analise', alvo: kpi('autorizacao') }) },
  FORNECEDOR_NAO_HOMOLOGADO: { oQue: 'Fornecedor não homologado', icone: 'pi pi-building', destino: () => ({ tipo: 'rota', rota: ['/financeiro/admin/fornecedores'], queryParams: { status: 'PENDENTE' } }) },
  CONCENTRACAO_FORNECEDOR: {
    oQue: 'Dependência de fornecedor', icone: 'pi pi-chart-pie',
    destino: (p, r) => {
      const ids = p.drilldown['idFornecedor'];
      const id = Array.isArray(ids) && ids.length === 1 ? String(ids[0]) : null;
      return id ? { tipo: 'analise', alvo: { dimension: 'ranking', value: `fornecedor~${id}` } } : listagem(r, { status: 'APROVADO' });
    }
  }
};

/**
 * "O que pede ação hoje", do mais grave para o menos grave: as prioridades que o backend calcula
 * (cada uma leva à lista ou à análise que a reproduz) e, abaixo de cada uma, os registros que dá
 * para abrir direto — pedidos parados há mais tempo e despesas vencidas sem comprovante.
 */
export function pendenciasFinanceiras(
  d: DashboardFinanceiroResponse,
  filtros: DashboardFinanceiroFilter,
  registros: RegistrosAcao | null,
  hoje: string
): PendenciaFinanceira[] {
  const recorte = recorteNaListagem(filtros, ['status']);
  const itens: PendenciaFinanceira[] = d.prioridades.map((p, i) => {
    const peso = PESO_SEVERIDADE[p.severidade] ?? 3;
    const como = COMO_AGIR[p.tipo];
    return {
      chave: `p-${p.tipo}-${i}`,
      tom: TOM_PESO[peso],
      peso,
      gravidade: GRAVIDADE[peso],
      icone: como?.icone ?? ICONE_PESO[peso],
      oQue: como?.oQue ?? 'Pendência',
      detalhe: `${p.titulo}. ${p.evidencia}.`,
      valor: null,
      prazo: '—',
      dias: 0,
      proximoPasso: p.acaoSugerida,
      agregada: true,
      destino: como ? como.destino(p, recorte, hoje) : listagem(recorte, {})
    };
  });

  const vencidas = (registros?.vencidas ?? [])
    .map((s) => linhaSolicitacao(s, hoje))
    .filter((l) => l.status === 'APROVADO' && l.diasParaVencer !== null && l.diasParaVencer < 0 && !l.temComprovante)
    .sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0))
    .slice(0, LIMITE_LINHAS_ACAO);
  for (const l of vencidas) {
    const atraso = -(l.diasParaVencer ?? 0);
    itens.push({
      chave: `v-${l.id}`, tom: 'danger', peso: 0, gravidade: GRAVIDADE[0], icone: 'pi pi-calendar-times', oQue: 'Despesa vencida',
      detalhe: `${l.tipoRotulo} nº ${l.numero} · ${l.fornecedor} · pedida por ${l.solicitante}`,
      valor: l.valorAprovado ?? l.valor, prazo: `Venceu há ${plural(atraso, 'dia', 'dias')}`, dias: atraso,
      proximoPasso: 'Pagar e anexar o comprovante', agregada: false, destino: { tipo: 'rota', rota: rotaDoRegistro(l) }
    });
  }

  const parados = (registros?.parados ?? [])
    .map((s) => linhaSolicitacao(s, hoje))
    .filter((l) => l.status === 'SOLICITADO' && (l.esperaDias ?? 0) > LIMIAR.cobrarDecisao)
    .sort((a, b) => (b.esperaDias ?? 0) - (a.esperaDias ?? 0))
    .slice(0, LIMITE_LINHAS_ACAO);
  for (const l of parados) {
    const espera = l.esperaDias ?? 0;
    const peso = espera > LIMIAR.escalarDecisao ? 0 : 1;
    itens.push({
      chave: `s-${l.id}`, tom: TOM_PESO[peso], peso, gravidade: GRAVIDADE[peso], icone: 'pi pi-hourglass', oQue: 'Pedido parado na aprovação',
      detalhe: `${l.tipoRotulo} nº ${l.numero} · ${l.fornecedor} · pedida por ${l.solicitante}`,
      valor: l.valor, prazo: `Espera há ${plural(espera, 'dia', 'dias')}`, dias: espera,
      proximoPasso: 'Aprovar ou rejeitar', agregada: false, destino: { tipo: 'rota', rota: rotaDoRegistro(l) }
    });
  }

  // Ordenação estável: no empate, vale a ordem do backend (prioridades) e vencidas antes de paradas.
  return itens.sort((a, b) => a.peso - b.peso || Number(b.agregada) - Number(a.agregada) || b.dias - a.dias);
}

// ------------------------------------------------------------------ onde o dinheiro vai

export const DIMENSOES_RANKING = {
  fornecedor: { rotulo: 'Fornecedor', aba: 'Fornecedores', campo: 'porFornecedor', filtro: 'fornecedorId' },
  centroCusto: { rotulo: 'Centro de custo', aba: 'Centros de custo', campo: 'porCentroCusto', filtro: null },
  obra: { rotulo: 'Obra', aba: 'Obras', campo: 'porObra', filtro: 'obraId' },
  base: { rotulo: 'Base', aba: 'Bases', campo: 'porBase', filtro: 'baseId' },
  tipoDespesa: { rotulo: 'Tipo de despesa', aba: 'Tipos de despesa', campo: 'porTipoDespesa', filtro: 'tipoDespesa' },
  solicitante: { rotulo: 'Solicitante', aba: 'Solicitantes', campo: 'porSolicitante', filtro: null }
} as const satisfies Record<string, { rotulo: string; aba: string; campo: keyof DashboardFinanceiroResponse; filtro: keyof SolicitacaoFinanceiraFilter | null }>;

export type DimensaoRanking = keyof typeof DIMENSOES_RANKING;

export function rankingDe(d: DashboardFinanceiroResponse, dimensao: DimensaoRanking): RankingFinanceiroItem[] {
  return (d[DIMENSOES_RANKING[dimensao].campo] as RankingFinanceiroItem[] | undefined) ?? [];
}

export function nomeDoItem(item: Pick<RankingFinanceiroItem, 'nome'>): string {
  return item.nome?.trim() || 'Cadastro não disponível';
}
