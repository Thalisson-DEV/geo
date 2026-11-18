import { NomeIcone } from '../../ui/icone.component';
import { Tom } from './almox-status';
import { AcaoSolicitacao, Estoque, ResumoSolicitacao, Solicitacao, SubEtapaKanban } from './almox.models';

/** Os quatro movimentos técnicos, no vocabulário do web. */
export interface DefTipoTecnico { codigo: string; nome: string; rotulo: string; adicao: boolean }

export const TIPOS_TECNICOS: readonly DefTipoTecnico[] = [
  { codigo: '221', nome: 'ADICAO_COMUM', rotulo: 'Adição comum', adicao: true },
  { codigo: '921', nome: 'ADICAO_CONCRETO', rotulo: 'Adição de concreto', adicao: true },
  { codigo: '222', nome: 'DEVOLUCAO_COMUM', rotulo: 'Devolução comum', adicao: false },
  { codigo: '922', nome: 'DEVOLUCAO_CONCRETO', rotulo: 'Devolução de concreto', adicao: false },
];

/** Aceita o código (221) ou o nome do enum (ADICAO_COMUM), como o backend devolve. */
export function defTipoTecnico(tipo?: string | null): DefTipoTecnico {
  const t = (tipo ?? '').toUpperCase();
  return TIPOS_TECNICOS.find(x => x.codigo === t || x.nome === t) ?? TIPOS_TECNICOS[0];
}

/** Atalhos da fila técnica: o que o almoxarifado tem para fazer, agrupando as subetapas do quadro. */
export type FilaTecnica = 'abertas' | 'separar' | 'separando' | 'entregar' | 'receber' | 'planejamento' | 'concluidas' | 'recusadas';

export interface DefFila { valor: FilaTecnica; rotulo: string; tom: Tom; icone: NomeIcone; subEtapas: readonly SubEtapaKanban[] }

export const FILAS: readonly DefFila[] = [
  { valor: 'separar', rotulo: 'Para separar', tom: 'atencao', icone: 'material', subEtapas: ['PRONTO_PARA_SEPARACAO'] },
  { valor: 'separando', rotulo: 'Em separação', tom: 'destaque', icone: 'relogio', subEtapas: ['EM_SEPARACAO'] },
  { valor: 'entregar', rotulo: 'Para entregar', tom: 'destaque', icone: 'caminhao', subEtapas: ['SEPARADO', 'PENDENTE_RETIRADA'] },
  { valor: 'receber', rotulo: 'Para receber', tom: 'atencao', icone: 'desfazer', subEtapas: ['PENDENTE_DEVOLUCAO'] },
  { valor: 'planejamento', rotulo: 'Em planejamento', tom: 'neutro', icone: 'calendario', subEtapas: ['PENDENTE_PLANEJAMENTO', 'PLANEJADO'] },
  { valor: 'concluidas', rotulo: 'Concluídas', tom: 'ok', icone: 'check', subEtapas: ['CONCLUIDO'] },
  { valor: 'recusadas', rotulo: 'Recusadas', tom: 'erro', icone: 'fechar', subEtapas: ['REJEITADO', 'CANCELADO'] },
];

/** "Em aberto": tudo o que ainda passa pelas mãos do almoxarifado. */
export const SUBETAPAS_ABERTAS: readonly SubEtapaKanban[] = ['PRONTO_PARA_SEPARACAO', 'EM_SEPARACAO', 'SEPARADO', 'PENDENTE_RETIRADA', 'PENDENTE_DEVOLUCAO'];

export function subEtapasDaFila(fila: FilaTecnica): readonly SubEtapaKanban[] {
  return fila === 'abertas' ? SUBETAPAS_ABERTAS : FILAS.find(f => f.valor === fila)?.subEtapas ?? SUBETAPAS_ABERTAS;
}

export interface DefEtapa { rotulo: string; tom: Tom; icone: NomeIcone }

/** Situação de uma solicitação técnica para o almoxarifado (cartão e detalhe). */
export function etapaTecnica(s: Pick<ResumoSolicitacao, 'status' | 'statusSeparacao' | 'etapaOperacional' | 'tecnico' | 'encerrada'> | Solicitacao | null | undefined): DefEtapa {
  if (!s) return { rotulo: '—', tom: 'neutro', icone: 'info' };
  if (s.status === 'REJEITADO') return { rotulo: 'Rejeitada', tom: 'erro', icone: 'fechar' };
  if (s.status === 'CANCELADO') return { rotulo: 'Cancelada', tom: 'neutro', icone: 'fechar' };
  const etapa = ('etapaOperacional' in s ? s.etapaOperacional : null) ?? s.tecnico?.etapaOperacional;
  const separacao = s.statusSeparacao ?? s.tecnico?.statusSeparacao;
  switch (etapa) {
    case 'PRONTO_PARA_SEPARACAO': return { rotulo: 'Para separar', tom: 'atencao', icone: 'material' };
    case 'EM_SEPARACAO': return { rotulo: 'Em separação', tom: 'destaque', icone: 'relogio' };
    case 'PENDENTE_ENTREGA':
      return s.status === 'ENTREGUE_PARCIAL' ? { rotulo: 'Entregue em parte', tom: 'atencao', icone: 'caminhao' } : { rotulo: 'Separada · para entregar', tom: 'destaque', icone: 'caminhao' };
    case 'PENDENTE_DEVOLUCAO':
      return s.status === 'DEVOLVIDO_PARCIAL' ? { rotulo: 'Recebida em parte', tom: 'atencao', icone: 'desfazer' } : { rotulo: 'Devolução a receber', tom: 'atencao', icone: 'desfazer' };
    case 'AGUARDANDO_PLANEJAMENTO': return { rotulo: separacao === 'SEPARADO' ? 'Separada' : 'Em planejamento', tom: 'neutro', icone: 'calendario' };
    case 'CONCLUIDA':
      if (s.status === 'DEVOLVIDO') return { rotulo: 'Devolvida', tom: 'ok', icone: 'check' };
      if (s.status === 'ESTORNADO') return { rotulo: 'Estornada', tom: 'neutro', icone: 'desfazer' };
      return s.encerrada && s.status !== 'ENTREGUE' ? { rotulo: 'Saldo encerrado', tom: 'neutro', icone: 'info' } : { rotulo: 'Entregue', tom: 'ok', icone: 'check' };
    default: return { rotulo: s.status, tom: 'neutro', icone: 'info' };
  }
}

/** Ações do técnico: sempre as que o backend autorizou para esta pessoa e este estado. */
export function podeTecnica(s: { acoesPermitidas?: AcaoSolicitacao[]; tecnico?: { acoesPermitidas?: AcaoSolicitacao[] } | null } | null | undefined, acao: AcaoSolicitacao): boolean {
  if (!s) return false;
  return (s.acoesPermitidas ?? s.tecnico?.acoesPermitidas ?? []).includes(acao);
}

/** "OBRA 3310 - CORRETIVA REDE BT" → número e título da obra, a partir do estoque da obra. */
export function obraDoEstoque(nome: string | null | undefined): { numero: string; titulo: string } | null {
  if (!nome) return null;
  const m = /^OBRA\s+(\S+)\s*-\s*(.+)$/i.exec(nome.trim());
  return m ? { numero: m[1], titulo: m[2] } : null;
}

/** Estoque da obra: destino na adição, origem na devolução. */
export function nomeEstoqueObra(s: ResumoSolicitacao | Solicitacao): string {
  const adicao = defTipoTecnico(s.tecnico?.tipoTecnico ?? s.tipoTecnico).adicao;
  if ('estoqueOrigemNome' in s || 'estoqueDestinoNome' in s) {
    const r = s as ResumoSolicitacao;
    return (adicao ? r.estoqueDestinoNome ?? r.estoqueDestinoNomeIdentificador : r.estoqueOrigemNome ?? r.estoqueOrigemNomeIdentificador) ?? '';
  }
  const d = s as Solicitacao;
  return (adicao ? d.estoqueDestino?.nomeIdentificador : d.estoqueOrigem?.nomeIdentificador) ?? '';
}

/** Título que o almoxarifado precisa ver primeiro: a OC/OS (quando há) junto da obra. */
export function tituloTecnica(s: ResumoSolicitacao | Solicitacao): { ocorrencia: string | null; obra: string } {
  const estoque = nomeEstoqueObra(s);
  const obra = obraDoEstoque(estoque);
  return {
    ocorrencia: s.tecnico?.ocorrencia?.codigo?.trim() || null,
    obra: obra ? `${obra.numero} · ${obra.titulo}` : estoque || 'Obra não informada',
  };
}

/** Nome da equipe: o estoque de campo dela (o app já tem a lista de estoques). */
export function nomeEquipe(estoques: readonly Estoque[], idEquipe: string | null | undefined): string | null {
  if (!idEquipe) return null;
  return estoques.find(e => e.idEquipe === idEquipe && e.ativo !== false)?.nomeIdentificador ?? null;
}

export function nomeEstoque(estoques: readonly Estoque[], id: string | null | undefined): string | null {
  if (!id) return null;
  return estoques.find(e => e.id === id)?.nomeIdentificador ?? null;
}

/** Almoxarifado físico (onde o material fica guardado). */
export function ehAlmoxarifado(e: Estoque): boolean {
  return e.ativo !== false && !e.idEquipe && (e.tipoEstoque?.nome ?? '').trim().toUpperCase() === 'FISICO';
}
