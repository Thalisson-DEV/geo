import { DocumentoAsBuilt, StatusDocumentoAsBuilt } from './obras-documentacao.models';

/** Semáforo da entrega documental da obra. */
export type SituacaoDocumental = 'SEM_EXECUCAO' | 'BLOQUEADA' | 'PENDENTE' | 'PRONTA';
export type StatusAuditoria = 'OK' | 'PENDENTE' | 'ALERTA' | 'NAO_SE_APLICA';
export type SeveridadePendencia = 'BLOQUEIO' | 'AVISO';
/** Aba do book em que a pendência se resolve. */
export type DestinoBook = 'PONTOS' | 'GALERIA' | 'COMPARATIVO' | 'AUDITORIA' | 'ENTREGA' | 'ANEXOS';

export interface IndicadoresBook {
  pontos: number;
  pontosExecutados: number;
  pontosComFoto: number;
  pontosExecutadosSemFoto: number;
  pontosComFotosCompletas: number;
  fotos: number;
  fotosAntes: number;
  fotosDurante: number;
  fotosDepois: number;
  fotosSemEtapa: number;
  fotosComCoordenadas: number;
  itensObrigatorios: number;
  itensObrigatoriosFaltando: number;
  fichasCompletas: number;
  fichasIncompletas: number;
  fichasNaoIniciadas: number;
  equipamentos: number;
  visitas: number;
  projetoMestre: boolean;
  ultimaAtividade: string | null;
}

export interface PendenciaBook {
  codigo: string;
  severidade: SeveridadePendencia;
  titulo: string;
  detalhe: string;
  pontos: string[];
  destino: DestinoBook;
}

export interface ItemAuditoria {
  codigo: string;
  titulo: string;
  descricao: string;
  status: StatusAuditoria;
  /** Conta no percentual de pronto. */
  obrigatorio: boolean;
  /** Impede gerar o As Built enquanto não estiver em dia. */
  bloqueiaAsBuilt: boolean;
  progresso: number;
  detalhe: string;
  responsavel: string | null;
  data: string | null;
  destino: DestinoBook;
}

export interface UltimaVersaoDocumento {
  id: string;
  numeroVersao: number;
  status: StatusDocumentoAsBuilt;
  data: string;
  usuario: string | null;
  idAnexo: string | null;
  /** Gerada depois da última alteração em fichas, fotos e equipamentos. */
  atualizada: boolean;
}

export interface PainelBook {
  idObra: string;
  numero: string;
  titulo: string;
  status: string;
  situacao: SituacaoDocumental;
  percentualPronto: number;
  indicadores: IndicadoresBook;
  pendencias: PendenciaBook[];
  auditoria: ItemAuditoria[];
  asBuilt: UltimaVersaoDocumento | null;
  book: UltimaVersaoDocumento | null;
  documentos: DocumentoAsBuilt[];
}

export interface ResumoObraBook {
  idObra: string;
  numero: string;
  titulo: string;
  status: string;
  statusConcluido: boolean;
  situacao: SituacaoDocumental;
  percentualPronto: number;
  pontosExecutados: number;
  fichasCompletas: number;
  pontosComFotosCompletas: number;
  fotos: number;
  bloqueios: number;
  avisos: number;
  principalPendencia: string | null;
  asBuilt: UltimaVersaoDocumento | null;
  book: UltimaVersaoDocumento | null;
  ultimaAtividade: string | null;
}

export interface TotaisCarteiraBook {
  obras: number;
  prontas: number;
  pendentes: number;
  bloqueadas: number;
  semExecucao: number;
  fotos: number;
  fichasCompletas: number;
  pontosExecutados: number;
  percentualMedio: number;
  asBuiltDesatualizados: number;
}

export interface CarteiraBook {
  totais: TotaisCarteiraBook;
  obras: ResumoObraBook[];
}

// ---- Previsto x realizado ----

export type SituacaoItemComparativo = 'OK' | 'ABAIXO' | 'ACIMA' | 'NAO_EXECUTADO' | 'EXECUTADO_ANTES';
export type SituacaoGrupoComparativo = 'CONFORME' | 'DIVERGENTE' | 'EM_EXECUCAO' | 'NAO_INICIADO';

export interface ItemComparativo {
  id: string;
  tipo: 'SERVICO' | 'MATERIAL';
  codigo: string | null;
  descricao: string | null;
  kit: string;
  operacao: 'INSTALAR' | 'RETIRAR';
  unidade: string | null;
  previsto: number;
  executado: number;
  diferenca: number;
  percentual: number;
  status: string;
  situacao: SituacaoItemComparativo;
}

export interface GrupoComparativo {
  chave: string;
  idPonto: string | null;
  rotulo: string;
  vao: boolean;
  pagina: number;
  executado: boolean;
  ficha: string | null;
  fotos: number;
  equipamento: string | null;
  situacao: SituacaoGrupoComparativo;
  divergencias: string[];
  itens: ItemComparativo[];
}

export interface ResumoComparativo {
  grupos: number;
  gruposConformes: number;
  gruposDivergentes: number;
  gruposEmExecucao: number;
  gruposNaoIniciados: number;
  itens: number;
  itensOk: number;
  itensAbaixo: number;
  itensAcima: number;
  itensNaoExecutados: number;
  servicosPrevistos: number;
  servicosConcluidos: number;
  percentualServicos: number;
}

export interface ComparativoBook {
  resumo: ResumoComparativo;
  grupos: GrupoComparativo[];
}
