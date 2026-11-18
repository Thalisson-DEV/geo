import { PainelSolicitacoesResponse, SolicitacaoDoPainel } from '../../../../../core/models/painel-solicitacoes.models';
import { LeituraGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { Recortavel } from '../recorte-almox.service';
import { priorizar } from '../almox-analise-comum';
import {
  ModoPainel,
  Recorte,
  SEM_CHAVE,
  aprovacaoHoras,
  ehDevolucao,
  idadeDias,
  indicadores,
  mediana,
  percentual,
  plural,
  ranking,
  situacao,
  tempo
} from './solicitacoes-calculos';
import { VisaoGerencial, visaoGerencial } from './solicitacoes-vistas';

/** Situação para o filtro próprio dos relatórios de solicitações. */
export type SituacaoFiltro = 'aberta' | 'atrasada' | 'concluida' | 'recusada';

export const SITUACOES_FILTRO: { valor: SituacaoFiltro; rotulo: string }[] = [
  { valor: 'aberta', rotulo: 'Em aberto' },
  { valor: 'atrasada', rotulo: 'Atrasadas' },
  { valor: 'concluida', rotulo: 'Concluídas' },
  { valor: 'recusada', rotulo: 'Rejeitadas ou canceladas' }
];

export const recortavelSolicitacao = (s: SolicitacaoDoPainel): Recortavel => ({
  idBase: s.idBaseOperacional ?? null,
  idProcesso: s.idProcesso ?? null,
  idEquipe: s.idEquipe,
  almox: [s.idAlmoxarifado]
});

/** Resposta do servidor só com as solicitações que passam no filtro. */
export function filtrarResposta(d: PainelSolicitacoesResponse, aceita: (s: SolicitacaoDoPainel) => boolean): PainelSolicitacoesResponse {
  return { ...d, solicitacoes: d.solicitacoes.filter(aceita) };
}

const DIAS_RETIRADA = 3;
const DIAS_SEPARACAO = 2;
const DIAS_PLANEJAMENTO = 5;
const DIAS_DEVOLUCAO = 7;

/**
 * Visão gerencial de um processo: as leituras comuns (fila, atrasos, ciclo, equipes, recusas) e as
 * próprias do processo, priorizadas pelo que pede ação.
 */
export function visaoDoProcesso(r: Recorte, modo: Exclude<ModoPainel, 'GERAL'>): VisaoGerencial {
  const base = visaoGerencial(r, modo);
  const extras = modo === 'COMERCIAL' ? leiturasComerciais(r) : leiturasTecnicas(r);
  return {
    ...base,
    leituras: priorizar([...extras, ...base.leituras]),
    pergunta: modo === 'COMERCIAL'
      ? 'Faça a leitura gerencial das solicitações comerciais: onde a fila trava (aprovação ou retirada), quais equipes não retiram, o que falta para atender e o que fazer primeiro.'
      : 'Faça a leitura gerencial das solicitações técnicas: planejamento, separação, retirada e devoluções; onde trava, quais obras pedem e devolvem demais e o que fazer primeiro.'
  };
}

function leiturasComerciais(r: Recorte): LeituraGerencial[] {
  const l: LeituraGerencial[] = [];
  // Material liberado que a equipe não veio buscar (nada saiu ainda).
  const retirada = r.abertas.filter((s) => s.etapa === 'PENDENTE_RETIRADA' && idadeDias(s, r.agora) >= DIAS_RETIRADA);
  const naoRetiradas = retirada.filter((s) => s.quantidadeAtendida <= 0);
  const saldoPendente = retirada.filter((s) => s.quantidadeAtendida > 0);
  if (naoRetiradas.length) {
    const eq = ranking([], naoRetiradas, r.hoje, (s) => s.idEquipe, (s) => s.equipe).filter((e) => e.chave !== SEM_CHAVE)[0];
    l.push({ id: 'nao-retiradas', tom: 'warning', icone: 'pi pi-truck', titulo: 'Aprovado e não retirado',
      valor: plural(naoRetiradas.length, 'pedido', 'pedidos'),
      texto: `Liberados há mais de ${DIAS_RETIRADA} dias e a equipe não veio buscar${eq ? `; ${eq.rotulo} concentra ${eq.abertas}` : ''}. Material reservado parado no balcão: cobre a retirada ou cancele.`,
      acao: eq ? { rotulo: 'Ver a equipe', alvo: { dimension: 'equipe', value: eq.chave } } : { rotulo: 'Ver a etapa', alvo: { dimension: 'etapa', value: 'PENDENTE_RETIRADA' } } });
  }
  if (saldoPendente.length) {
    l.push({ id: 'saldo-pendente', tom: 'warning', icone: 'pi pi-hourglass', titulo: 'Entregue em parte, esperando o resto',
      valor: plural(saldoPendente.length, 'pedido', 'pedidos'),
      texto: `A equipe levou parte e o restante aguarda há mais de ${DIAS_RETIRADA} dias. É falta de saldo no almoxarifado: confira a reposição dos materiais pendentes ou encerre o saldo.`,
      acao: { rotulo: 'Ver as pendências', alvo: { dimension: 'kpi', value: 'pendencias' } } });
  }
  // Aprovação lenta.
  const aprov = mediana(r.periodo.map(aprovacaoHoras).filter((h): h is number => h !== null));
  if (aprov !== null && aprov >= 8) {
    const almox = ranking(r.periodo, [], r.hoje, (s) => s.idAlmoxarifado, (s) => s.almoxarifado)
      .filter((a) => a.chave !== SEM_CHAVE && a.total >= 5)
      .map((a) => ({ a, h: mediana(r.periodo.filter((s) => (s.idAlmoxarifado ?? SEM_CHAVE) === a.chave).map(aprovacaoHoras).filter((h): h is number => h !== null)) }))
      .sort((x, y) => (y.h ?? 0) - (x.h ?? 0))[0];
    l.push({ id: 'aprovacao-lenta', tom: aprov >= 24 ? 'warning' : 'info', icone: 'pi pi-inbox', titulo: 'Aprovação demorada',
      valor: tempo(aprov),
      texto: `Metade dos pedidos espera mais que isso para ser aprovada${almox?.h ? `; em ${almox.a.rotulo} a mediana é ${tempo(almox.h)}` : ''}. Aprovação lenta empurra o saque e a equipe sai sem material.`,
      acao: { rotulo: 'Analisar a aprovação', alvo: { dimension: 'kpi', value: 'aprovacao' } } });
  }
  // Atendimento parcial: pediu e não levou tudo.
  const concluidas = r.periodo.filter((s) => situacao(s) === 'concluida');
  const parciais = concluidas.filter((s) => s.quantidadeAtendida < s.quantidadeSolicitada);
  if (concluidas.length >= 10 && parciais.length / concluidas.length >= 0.05) {
    l.push({ id: 'parciais', tom: 'warning', icone: 'pi pi-percentage', titulo: 'Entregas incompletas',
      valor: percentual((parciais.length / concluidas.length) * 100, 0),
      texto: `${plural(parciais.length, 'pedido concluído saiu', 'pedidos concluídos saíram')} com menos do que foi pedido. Falta de saldo vira serviço adiado em campo.`,
      acao: { rotulo: 'Ver o atendimento', alvo: { dimension: 'kpi', value: 'atendimento' } } });
  }
  return l;
}

function leiturasTecnicas(r: Recorte): LeituraGerencial[] {
  const l: LeituraGerencial[] = [];
  const parada = (etapas: string[], dias: number) => r.abertas.filter((s) => s.etapa && etapas.includes(s.etapa) && idadeDias(s, r.agora) >= dias);
  const separar = parada(['PRONTO_PARA_SEPARACAO', 'EM_SEPARACAO'], DIAS_SEPARACAO);
  if (separar.length) {
    l.push({ id: 'separacao', tom: 'warning', icone: 'pi pi-box', titulo: 'Separação atrasada', valor: plural(separar.length, 'solicitação', 'solicitações'),
      texto: `Prontas ou em separação há mais de ${DIAS_SEPARACAO} dias. É fila do almoxarifado: redistribua a separação ou reforce o turno.`,
      acao: { rotulo: 'Ver a etapa', alvo: { dimension: 'etapa', value: separar.some((s) => s.etapa === 'PRONTO_PARA_SEPARACAO') ? 'PRONTO_PARA_SEPARACAO' : 'EM_SEPARACAO' } } });
  }
  const retirada = parada(['SEPARADO', 'PENDENTE_RETIRADA'], DIAS_RETIRADA);
  const separadas = retirada.filter((s) => s.quantidadeAtendida <= 0);
  const parciais = retirada.filter((s) => s.quantidadeAtendida > 0);
  if (parciais.length) {
    l.push({ id: 'parcial', tom: 'warning', icone: 'pi pi-hourglass', titulo: 'Entregue em parte, esperando o resto', valor: plural(parciais.length, 'solicitação', 'solicitações'),
      texto: `A obra levou parte e o restante aguarda há mais de ${DIAS_RETIRADA} dias. Confira a reposição dos materiais pendentes ou encerre o saldo da solicitação.`,
      acao: { rotulo: 'Ver as pendências', alvo: { dimension: 'kpi', value: 'pendencias' } } });
  }
  if (separadas.length) {
    l.push({ id: 'separado-parado', tom: 'warning', icone: 'pi pi-truck', titulo: 'Separado e não retirado', valor: plural(separadas.length, 'solicitação', 'solicitações'),
      texto: `Material separado há mais de ${DIAS_RETIRADA} dias ocupando o balcão. A obra atrasou ou a equipe foi remanejada: confirme a data com o encarregado.`,
      acao: { rotulo: 'Ver a etapa', alvo: { dimension: 'etapa', value: separadas.some((s) => s.etapa === 'SEPARADO') ? 'SEPARADO' : 'PENDENTE_RETIRADA' } } });
  }
  const planejar = parada(['PENDENTE_PLANEJAMENTO'], DIAS_PLANEJAMENTO);
  if (planejar.length) {
    l.push({ id: 'planejamento', tom: 'info', icone: 'pi pi-calendar-plus', titulo: 'Sem data de retirada', valor: plural(planejar.length, 'solicitação', 'solicitações'),
      texto: `Aprovadas há mais de ${DIAS_PLANEJAMENTO} dias e ainda sem planejamento. Sem data, o almoxarifado não consegue separar com antecedência.`,
      acao: { rotulo: 'Ver a etapa', alvo: { dimension: 'etapa', value: 'PENDENTE_PLANEJAMENTO' } } });
  }
  const devolver = parada(['PENDENTE_DEVOLUCAO'], DIAS_DEVOLUCAO);
  if (devolver.length) {
    l.push({ id: 'devolucao', tom: 'warning', icone: 'pi pi-replay', titulo: 'Devolução que não chega', valor: plural(devolver.length, 'devolução', 'devoluções'),
      texto: `Registradas há mais de ${DIAS_DEVOLUCAO} dias e o material ainda não voltou ao almoxarifado. Risco de perda e de saldo errado na obra.`,
      acao: { rotulo: 'Ver a etapa', alvo: { dimension: 'etapa', value: 'PENDENTE_DEVOLUCAO' } } });
  }
  // Obras que devolvem muito do que pedem: planejamento de quantidade ruim.
  const porObra = new Map<string, { nome: string; adicoes: number; devolucoes: number }>();
  for (const s of r.periodo) {
    if (!s.idObra || situacao(s) === 'recusada') continue;
    const o = porObra.get(s.idObra) ?? { nome: s.numeroObra ? `Obra ${s.numeroObra}` : 'Obra', adicoes: 0, devolucoes: 0 };
    if (ehDevolucao(s)) o.devolucoes++;
    else o.adicoes++;
    porObra.set(s.idObra, o);
  }
  const devolvem = [...porObra.entries()].filter(([, o]) => o.adicoes >= 5 && o.devolucoes / o.adicoes >= 0.4)
    .sort(([, a], [, b]) => b.devolucoes / b.adicoes - a.devolucoes / a.adicoes);
  if (devolvem.length) {
    const [id, o] = devolvem[0];
    l.push({ id: 'obra-devolve', tom: 'warning', icone: 'pi pi-undo', titulo: 'Obra que devolve demais', valor: o.nome,
      texto: `${plural(o.devolucoes, 'devolução', 'devoluções')} para ${plural(o.adicoes, 'adição', 'adições')} no período. O orçamento de material da obra está acima do necessário: revise antes das próximas retiradas.`,
      acao: { rotulo: 'Ver a obra', alvo: { dimension: 'obra', value: id } } });
  }
  const ind = indicadores(r.periodo);
  if (ind.separacaoMediana !== null && ind.separacaoMediana >= 4) {
    l.push({ id: 'separacao-tempo', tom: 'info', icone: 'pi pi-stopwatch', titulo: 'Tempo de separação', valor: tempo(ind.separacaoMediana),
      texto: 'Tempo mediano entre começar e terminar a separação. Separação longa costuma ser material espalhado ou sem endereço na prateleira.',
      acao: { rotulo: 'Analisar a separação', alvo: { dimension: 'kpi', value: 'separacao' } } });
  }
  return l;
}

/** Filtros próprios aplicados sobre as solicitações (situação, etapa e, no técnico, tipos). */
export function aceitaSituacao(situacoes: string[], hoje: string) {
  if (!situacoes.length) return () => true;
  const set = new Set(situacoes);
  return (s: SolicitacaoDoPainel) => {
    const sit = situacao(s);
    const atrasada = sit === 'aberta' && !!s.dataPrevista && s.dataPrevista < hoje;
    return set.has(sit) || (atrasada && set.has('atrasada'));
  };
}
