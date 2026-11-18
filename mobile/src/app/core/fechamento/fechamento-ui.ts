import { isoCivil } from '../almox/almox-status';
import { NomeIcone } from '../../ui/icone.component';
import { dataCurta, hora, numeroBr } from '../../ui/lista.component';
import { ApiError } from '../http/error.interceptor';
import {
  EfeitoEstoque, FechamentoDetalhe, FechamentoFiltro, FechamentoResumo, ItemFechamento, MovimentacaoFechamento, PessoaFechamento, PrazoFechamento, SituacaoFechamento,
  SituacaoPrazo, TipoFechamento,
} from './fechamento.models';

export type TomFechamento = 'ok' | 'atencao' | 'erro' | 'destaque' | 'neutro';
export interface Rotulo { rotulo: string; tom: TomFechamento; icone: NomeIcone }

export interface DefTipoFechamento { codigo: TipoFechamento; nome: string; descricao: string; adicao: boolean }

export const TIPOS_FECHAMENTO: DefTipoFechamento[] = [
  { codigo: '221', nome: 'Adição comum', descricao: 'Material que entrou na obra e não estava no orçamento', adicao: true },
  { codigo: '921', nome: 'Adição concreto', descricao: 'Concreto que entrou na obra e não estava no orçamento', adicao: true },
  { codigo: '222', nome: 'Devolução comum', descricao: 'Sobra da obra que volta para o almoxarifado', adicao: false },
  { codigo: '922', nome: 'Devolução concreto', descricao: 'Sobra de concreto que volta para o almoxarifado', adicao: false },
];

export function tipoFechamento(tipo: TipoFechamento): DefTipoFechamento {
  return TIPOS_FECHAMENTO.find(t => t.codigo === tipo) ?? TIPOS_FECHAMENTO[0];
}

/** Adição é carrinho; devolução é lixeira. */
export function iconeTipo(tipo: TipoFechamento): NomeIcone {
  return tipoFechamento(tipo).adicao ? 'carrinho' : 'lixeira';
}

export const SITUACOES: Record<SituacaoFechamento, Rotulo> = {
  AGUARDANDO_RESERVA: { rotulo: 'Aguardando reserva', tom: 'atencao', icone: 'documento' },
  AGUARDANDO_MOVIMENTACAO: { rotulo: 'Aguardando movimentação', tom: 'atencao', icone: 'relogio' },
  MOVIMENTADA_PARCIALMENTE: { rotulo: 'Movimentada em parte', tom: 'destaque', icone: 'transferencia' },
  MOVIMENTADA: { rotulo: 'Movimentada', tom: 'ok', icone: 'check' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'neutro', icone: 'fechar' },
};

export const PRAZOS: Record<SituacaoPrazo, Rotulo> = {
  NO_PRAZO: { rotulo: 'No prazo', tom: 'ok', icone: 'relogio' },
  VENCE_EM_BREVE: { rotulo: 'Vence em breve', tom: 'atencao', icone: 'relogio' },
  ATRASADO: { rotulo: 'Atrasado', tom: 'erro', icone: 'alerta' },
  CUMPRIDO: { rotulo: 'Cumprido no prazo', tom: 'ok', icone: 'check' },
  CUMPRIDO_COM_ATRASO: { rotulo: 'Cumprido com atraso', tom: 'atencao', icone: 'check' },
};

export const EFEITOS: Record<EfeitoEstoque, { rotulo: string; descricao: string; icone: NomeIcone }> = {
  FISICO: { rotulo: 'Físico', descricao: 'Altera o saldo entre o almoxarifado e a obra', icone: 'transferencia' },
  VIRTUAL: { rotulo: 'Virtual', descricao: 'Só registra; nenhum saldo muda', icone: 'documento' },
};

export interface AtalhoFechamento { valor: string; rotulo: string; tom: TomFechamento; filtro: Pick<FechamentoFiltro, 'situacoes' | 'prazo'> }

/** Recortes acima da lista: o que falta fazer e como terminou. */
export const ATALHOS: AtalhoFechamento[] = [
  { valor: 'ABERTO', rotulo: 'Em aberto', tom: 'atencao', filtro: { situacoes: ['AGUARDANDO_RESERVA', 'AGUARDANDO_MOVIMENTACAO', 'MOVIMENTADA_PARCIALMENTE'] } },
  { valor: 'RESERVA', rotulo: 'Sem reserva', tom: 'atencao', filtro: { situacoes: ['AGUARDANDO_RESERVA'] } },
  { valor: 'MOVIMENTAR', rotulo: 'A movimentar', tom: 'atencao', filtro: { situacoes: ['AGUARDANDO_MOVIMENTACAO'] } },
  { valor: 'PARCIAL', rotulo: 'Em parte', tom: 'destaque', filtro: { situacoes: ['MOVIMENTADA_PARCIALMENTE'] } },
  { valor: 'ATRASADA', rotulo: 'Atrasadas', tom: 'erro', filtro: { prazo: 'ATRASADO' } },
  { valor: 'MOVIMENTADA', rotulo: 'Movimentadas', tom: 'ok', filtro: { situacoes: ['MOVIMENTADA'] } },
  { valor: 'CANCELADA', rotulo: 'Canceladas', tom: 'neutro', filtro: { situacoes: ['CANCELADA'] } },
];

export function atalhoFechamento(valor: string | null | undefined): AtalhoFechamento {
  return ATALHOS.find(a => a.valor === valor) ?? ATALHOS[0];
}

/** Quem não tem colaborador vinculado (conta administrativa) não aparece pelo login. */
export function nomePessoa(pessoa: Pick<PessoaFechamento, 'nome'> | null | undefined, vazio = 'Não informado'): string {
  if (!pessoa) return vazio;
  return pessoa.nome ?? 'Sem colaborador vinculado';
}

export function rotuloObra(obra: { numero: string | null; titulo: string | null }): string {
  return [obra.numero, obra.titulo].filter(Boolean).join(' · ') || 'Obra não informada';
}

export function dataHora(valor: string | null | undefined): string {
  return valor ? `${dataCurta(valor)} às ${hora(valor)}` : '';
}

/** Prazo em curso: o que falta (reserva ou movimentação) e até quando. */
export function textoPrazo(situacao: SituacaoFechamento, prazo: PrazoFechamento | null | undefined): string {
  if (!prazo?.limite || !prazo.situacao) return situacao === 'MOVIMENTADA' ? 'Concluído' : '';
  return `${situacao === 'AGUARDANDO_RESERVA' ? 'Reserva' : 'Movimentar'} até ${dataHora(prazo.limite)}`;
}

/** Situação de um material: a pendência vem antes do andamento. */
export function situacaoItem(item: ItemFechamento): Rotulo {
  if (item.pendencia && item.quantidadePendente > 0) return { rotulo: item.pendencia.motivo, tom: 'atencao', icone: 'bandeira' };
  if (item.quantidadePendente <= 0) return { rotulo: 'Movimentado', tom: 'ok', icone: 'check' };
  if (item.quantidadeMovimentada > 0) return { rotulo: 'Em parte', tom: 'destaque', icone: 'transferencia' };
  return { rotulo: 'A movimentar', tom: 'neutro', icone: 'relogio' };
}

/** Da mais recente para a mais antiga, sem depender da ordem da resposta. */
export function movimentacoesRecentes(movimentacoes: readonly MovimentacaoFechamento[]): MovimentacaoFechamento[] {
  return [...movimentacoes].sort((a, b) => b.realizadaEm.localeCompare(a.realizadaEm));
}

/** Almoxarifado → obra na adição; obra → almoxarifado na devolução. */
export function rotaFechamento(d: Pick<FechamentoDetalhe, 'tipo' | 'obra' | 'almoxarifadoAtendimento' | 'estoqueObra'>): { de: string; para: string } {
  const almoxarifado = d.almoxarifadoAtendimento?.nome ?? 'Almoxarifado';
  const obra = d.estoqueObra?.nome ?? `Obra ${d.obra.numero ?? ''}`.trim();
  return tipoFechamento(d.tipo).adicao ? { de: almoxarifado, para: obra } : { de: obra, para: almoxarifado };
}

export type MarcaAgenda = 'atraso' | 'aberta' | 'encerrada';

/** Dia da solicitação no calendário: quando o prazo em curso vence ou quando foi concluída. */
export function diaAgenda(s: Pick<FechamentoResumo, 'prazoVigente' | 'movimentacaoConcluidaEm'>): string | null {
  const valor = s.prazoVigente?.limite ?? s.movimentacaoConcluidaEm;
  return valor ? isoCivil(new Date(valor)) : null;
}

export function marcaAgenda(s: Pick<FechamentoResumo, 'situacao' | 'prazoVigente'>): MarcaAgenda {
  if (s.situacao === 'MOVIMENTADA' || s.situacao === 'CANCELADA') return 'encerrada';
  return s.prazoVigente?.situacao === 'ATRASADO' ? 'atraso' : 'aberta';
}

export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Reserva é só número, até 20 dígitos (regra do backend). */
export function reservaValida(valor: string): boolean {
  return /^\d{1,20}$/.test(valor.trim());
}

/** A conexão caiu antes da resposta: o envio pode ser repetido com a mesma chave. */
export function falhaDeConexao(e: ApiError): boolean {
  return !e.status || e.status === 502 || e.status === 503 || e.status === 504;
}

export function mensagemFalha(e: ApiError, padrao: string): string {
  if (e.status === 409) return 'Outra pessoa alterou esta solicitação. Os dados foram atualizados.';
  if (falhaDeConexao(e)) return 'A conexão caiu antes da resposta. Tente de novo: nada será feito em dobro.';
  const campos = Object.values(e.erros ?? {}).flat();
  return campos[0] || e.detail || padrao;
}

/**
 * Recusa do backend que pertence a um material: pelo campo (`itens[2].quantidade`) ou, quando
 * a quantidade ficou abaixo do que já foi movimentado, pelo mínimo que a mensagem informa.
 */
export function erroPorItem(e: ApiError, quantidades: readonly number[]): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const [campo, valor] of Object.entries(e.erros ?? {})) {
    const indice = /^itens\[(\d+)]/.exec(campo)?.[1];
    if (indice !== undefined) mapa.set(Number(indice), Array.isArray(valor) ? valor[0] : valor);
  }
  const minimo = /quantidade mínima é ([\d.]+)/i.exec(e.detail ?? '')?.[1];
  if (minimo) quantidades.forEach((q, i) => { if (q < Number(minimo)) mapa.set(i, `A quantidade mínima é ${numeroBr(Number(minimo))}: já foi movimentado.`); });
  return mapa;
}
