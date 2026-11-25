import { GeoSelectOption, GeoTone } from '@geo/ui';

import {
  EfeitoEstoque,
  FechamentoDetalhe,
  FechamentoResumo,
  ItemFechamento,
  MovimentacaoFechamento,
  PessoaFechamento,
  PrazoFechamento,
  SituacaoFechamento,
  SituacaoFechamentoObra,
  SituacaoPrazo,
  TipoFechamento
} from '../../../core/models/fechamento-obra.models';

export interface Rotulo {
  label: string;
  tone: GeoTone;
  icon: string;
}

export const TIPOS_FECHAMENTO: { value: TipoFechamento; nome: string; descricao: string; adicao: boolean }[] = [
  { value: '221', nome: 'Retirada', descricao: 'Material que entrou na obra e não estava no orçamento', adicao: true },
  { value: '921', nome: 'Retirada · concreto', descricao: 'Concreto que entrou na obra e não estava no orçamento', adicao: true },
  { value: '222', nome: 'Devolução comum', descricao: 'Sobra da obra que volta para o almoxarifado', adicao: false },
  { value: '922', nome: 'Devolução concreto', descricao: 'Sobra de concreto que volta para o almoxarifado', adicao: false }
];

/** Adição é carrinho; devolução é lixeira. */
export function iconeTipo(tipo: TipoFechamento): string {
  return tipoFechamento(tipo).adicao ? 'pi pi-shopping-cart' : 'pi pi-trash';
}

export const OPCOES_TIPO: GeoSelectOption<TipoFechamento>[] = TIPOS_FECHAMENTO.map((t) => ({
  label: `${t.value} · ${t.nome}`,
  value: t.value
}));

export function tipoFechamento(tipo: TipoFechamento): { value: TipoFechamento; nome: string; descricao: string; adicao: boolean } {
  return TIPOS_FECHAMENTO.find((t) => t.value === tipo) ?? TIPOS_FECHAMENTO[0];
}

export const SITUACOES: Record<SituacaoFechamento, Rotulo> = {
  AGUARDANDO_RESERVA: { label: 'Aguardando reserva', tone: 'warning', icon: 'pi pi-hashtag' },
  AGUARDANDO_MOVIMENTACAO: { label: 'Aguardando movimentação', tone: 'warning', icon: 'pi pi-clock' },
  MOVIMENTADA_PARCIALMENTE: { label: 'Movimentada em parte', tone: 'info', icon: 'pi pi-percentage' },
  MOVIMENTADA: { label: 'Movimentada', tone: 'success', icon: 'pi pi-check-circle' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral', icon: 'pi pi-ban' }
};

export const OPCOES_SITUACAO: GeoSelectOption<SituacaoFechamento>[] = (Object.keys(SITUACOES) as SituacaoFechamento[]).map((s) => ({
  label: SITUACOES[s].label,
  value: s
}));

/** Atalho de status acima da lista: o que falta fazer e como terminou. */
export interface AtalhoFechamento {
  value: string;
  atalho: string;
  descricao: string;
  tone: GeoTone;
  icon: string;
  situacoes?: SituacaoFechamento[];
  prazo?: 'ATRASADO';
}

export const ATALHO_EM_ABERTO: AtalhoFechamento = {
  value: 'ABERTO',
  atalho: 'Em aberto',
  descricao: 'Sem reserva, a movimentar e movimentadas em parte: tudo o que ainda exige ação.',
  tone: 'warning',
  icon: 'pi pi-inbox',
  situacoes: ['AGUARDANDO_RESERVA', 'AGUARDANDO_MOVIMENTACAO', 'MOVIMENTADA_PARCIALMENTE']
};

export const ATALHOS: readonly AtalhoFechamento[] = [
  { value: 'RESERVA', atalho: 'Sem reserva', descricao: 'Falta informar o número da reserva.', tone: 'warning', icon: 'pi pi-hashtag', situacoes: ['AGUARDANDO_RESERVA'] },
  { value: 'MOVIMENTAR', atalho: 'A movimentar', descricao: 'Com reserva, aguardando o almoxarifado marcar como movimentado.', tone: 'warning', icon: 'pi pi-clock', situacoes: ['AGUARDANDO_MOVIMENTACAO'] },
  { value: 'PARCIAL', atalho: 'Em parte', descricao: 'Movimentadas em parte: o restante ainda está pendente.', tone: 'info', icon: 'pi pi-percentage', situacoes: ['MOVIMENTADA_PARCIALMENTE'] },
  { value: 'ATRASADA', atalho: 'Atrasadas', descricao: 'Passaram das 48 horas úteis do prazo em curso.', tone: 'danger', icon: 'pi pi-exclamation-circle', prazo: 'ATRASADO' },
  { value: 'MOVIMENTADA', atalho: 'Movimentadas', descricao: 'Tudo movimentado.', tone: 'success', icon: 'pi pi-check-circle', situacoes: ['MOVIMENTADA'] },
  { value: 'CANCELADA', atalho: 'Canceladas', descricao: 'Fora da fila.', tone: 'neutral', icon: 'pi pi-ban', situacoes: ['CANCELADA'] }
];

export function atalhoFechamento(valor?: string | null): AtalhoFechamento | undefined {
  return valor === ATALHO_EM_ABERTO.value ? ATALHO_EM_ABERTO : ATALHOS.find((a) => a.value === valor);
}

/** O que cai em cada dia do calendário: o prazo em curso ou a conclusão. */
export const AGENDA = {
  RESERVA: { value: 'RESERVA', label: 'Prazo da reserva', tone: 'warning', icon: 'pi-hashtag' },
  MOVIMENTAR: { value: 'MOVIMENTAR', label: 'Prazo de movimentação', tone: 'warning', icon: 'pi-clock' },
  PARCIAL: { value: 'PARCIAL', label: 'Restante a movimentar', tone: 'info', icon: 'pi-percentage' },
  CONCLUIDA: { value: 'CONCLUIDA', label: 'Movimentada', tone: 'success', icon: 'pi-check-circle' }
} as const satisfies Record<string, { value: string; label: string; tone: GeoTone; icon: string }>;

export type ItemAgenda = (typeof AGENDA)[keyof typeof AGENDA];

export function agendaDe(r: FechamentoResumo): ItemAgenda {
  switch (r.situacao) {
    case 'AGUARDANDO_RESERVA':
      return AGENDA.RESERVA;
    case 'MOVIMENTADA_PARCIALMENTE':
      return AGENDA.PARCIAL;
    case 'MOVIMENTADA':
      return AGENDA.CONCLUIDA;
    default:
      return AGENDA.MOVIMENTAR;
  }
}

export const SITUACOES_OBRA: Record<SituacaoFechamentoObra, Rotulo> = {
  SEM_SOLICITACOES: { label: 'Sem solicitações', tone: 'neutral', icon: 'pi pi-minus-circle' },
  PENDENTE: { label: 'Encerramento pendente', tone: 'warning', icon: 'pi pi-clock' },
  PARCIAL: { label: 'Encerramento parcial', tone: 'info', icon: 'pi pi-percentage' },
  FINALIZADO: { label: 'Encerramento finalizado', tone: 'success', icon: 'pi pi-check-circle' }
};

export const OPCOES_SITUACAO_OBRA: GeoSelectOption<SituacaoFechamentoObra>[] = (['PENDENTE', 'PARCIAL', 'FINALIZADO'] as const).map((s) => ({
  label: SITUACOES_OBRA[s].label,
  value: s
}));

export const PRAZOS: Record<SituacaoPrazo, Rotulo> = {
  NO_PRAZO: { label: 'No prazo', tone: 'success', icon: 'pi pi-clock' },
  VENCE_EM_BREVE: { label: 'Vence em breve', tone: 'warning', icon: 'pi pi-hourglass' },
  ATRASADO: { label: 'Atrasado', tone: 'danger', icon: 'pi pi-exclamation-circle' },
  CUMPRIDO: { label: 'Cumprido no prazo', tone: 'success', icon: 'pi pi-check' },
  CUMPRIDO_COM_ATRASO: { label: 'Cumprido com atraso', tone: 'warning', icon: 'pi pi-check' }
};

export const OPCOES_PRAZO: GeoSelectOption<'NO_PRAZO' | 'VENCE_EM_BREVE' | 'ATRASADO'>[] = [
  { label: PRAZOS.NO_PRAZO.label, value: 'NO_PRAZO' },
  { label: PRAZOS.VENCE_EM_BREVE.label, value: 'VENCE_EM_BREVE' },
  { label: PRAZOS.ATRASADO.label, value: 'ATRASADO' }
];

export const EFEITOS: Record<EfeitoEstoque, { label: string; descricao: string; icon: string }> = {
  FISICO: { label: 'Físico', descricao: 'Altera o saldo entre o almoxarifado e a obra', icon: 'pi pi-arrow-right-arrow-left' },
  VIRTUAL: { label: 'Virtual', descricao: 'Só registra; nenhum saldo muda', icon: 'pi pi-file' }
};

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const QUANTIDADE = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** Quem não tem colaborador vinculado (ex.: conta administrativa) não aparece pelo login. */
export const SEM_COLABORADOR = 'Sem colaborador vinculado';

export function nomePessoa(pessoa: Pick<PessoaFechamento, 'nome'> | null | undefined, vazio = '—'): string {
  if (!pessoa) return vazio;
  return pessoa.nome ?? SEM_COLABORADOR;
}

export function rotuloObra(obra: { numero: string | null; titulo: string | null }): string {
  return [obra.numero, obra.titulo].filter(Boolean).join(' · ') || 'Obra não informada';
}

export function dataHora(valor: string | null | undefined): string {
  return valor ? DATA_HORA.format(new Date(valor)).replace(',', ' às') : '—';
}

export function quantidade(valor: number | null | undefined): string {
  return QUANTIDADE.format(Number(valor ?? 0));
}

/** Prazo em curso: o que falta (reserva ou movimentação) e até quando. */
export function textoPrazo(situacao: SituacaoFechamento, prazo: PrazoFechamento | null): string {
  if (!prazo?.limite || !prazo.situacao) return situacao === 'MOVIMENTADA' ? 'Concluído' : '—';
  const alvo = situacao === 'AGUARDANDO_RESERVA' ? 'Reserva' : 'Movimentar';
  return `${alvo} até ${dataHora(prazo.limite)}`;
}

export function prazo(situacao: SituacaoPrazo | null | undefined): Rotulo | null {
  return situacao ? PRAZOS[situacao] : null;
}

/** Situação de um material: a pendência vem antes do andamento. */
export function situacaoItem(item: ItemFechamento): Rotulo {
  if (item.pendencia && item.quantidadePendente > 0) return { label: item.pendencia.motivo, tone: 'warning', icon: 'pi pi-flag' };
  if (item.quantidadePendente <= 0) return { label: 'Movimentado', tone: 'success', icon: 'pi pi-check' };
  if (item.quantidadeMovimentada > 0) return { label: 'Em parte', tone: 'info', icon: 'pi pi-percentage' };
  return { label: 'A movimentar', tone: 'neutral', icon: 'pi pi-clock' };
}

/** Da mais recente para a mais antiga, sem depender da ordem da resposta. */
export function movimentacoesRecentes(movimentacoes: readonly MovimentacaoFechamento[]): MovimentacaoFechamento[] {
  return [...movimentacoes].sort((a, b) => new Date(b.realizadaEm).getTime() - new Date(a.realizadaEm).getTime());
}

/** A movimentação mais recente: quem operou por último é o almoxarife do relatório. */
export function ultimaMovimentacao(movimentacoes: readonly MovimentacaoFechamento[]): MovimentacaoFechamento | null {
  return movimentacoesRecentes(movimentacoes).find((m) => m.tipo === 'MOVIMENTACAO') ?? null;
}

export function resumoItensMovimentacao(m: MovimentacaoFechamento): string {
  return m.itens.map((i) => `${i.codigoMaterial} × ${quantidade(i.quantidade)}`).join(', ');
}

/** Almoxarifado → obra na adição; obra → almoxarifado na devolução. */
export function rotaFechamento(d: FechamentoDetalhe, almoxarifado: string): { de: string; para: string } {
  const obra = d.estoqueObra?.nome ?? `Obra ${d.obra.numero ?? ''}`.trim();
  return tipoFechamento(d.tipo).adicao ? { de: almoxarifado, para: obra } : { de: obra, para: almoxarifado };
}

export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dataIsoLocal(valor: Date | string | null): string | null {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.substring(0, 10);
  return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
}
