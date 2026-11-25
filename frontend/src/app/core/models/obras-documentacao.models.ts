export type FinalidadeChecklist = 'VISITA_PREVIA' | 'AS_BUILT';
export type TipoPerguntaChecklist = 'ESCOLHA_UNICA' | 'MULTIPLA_ESCOLHA' | 'TEXTO' | 'NUMERO' | 'DATA';
export type TipoEquipamento = 'RELIGADOR' | 'REGULADOR';
export type StatusDocumentoAsBuilt = 'PROCESSANDO' | 'CONCLUIDO' | 'ERRO';
/** As Built: plantas marcadas, fichas e fotos. Book: capa, sumário e as fotos de cada ponto. */
export type TipoDocumentoEntrega = 'AS_BUILT' | 'BOOK';
/** Momento da foto em relação à execução do ponto. */
export type EtapaEvidencia = 'ANTES' | 'DURANTE' | 'DEPOIS';

export interface PerguntaChecklist {
  id: string;
  enunciado: string;
  tipo: TipoPerguntaChecklist;
  obrigatoria: boolean;
  aceitaNaoSeAplica: boolean;
  opcoes: string[] | null;
  /** Só na escolha única: a resposta esperada. Outra opção marcada é não conformidade. */
  opcaoConforme?: string | null;
}

export interface GrupoChecklist {
  titulo: string;
  perguntas: PerguntaChecklist[];
}

export interface ItemEvidenciaModelo {
  id: string;
  titulo: string;
  obrigatoria: boolean;
  /** Momento da foto no ponto; sem ele, o app usa a situação do ponto na hora da foto. */
  etapa?: EtapaEvidencia | null;
}

export interface EstruturaChecklist {
  grupos: GrupoChecklist[];
  /** Fotos que o book pede em cada ponto; só no modelo de ficha As Built. */
  evidencias?: ItemEvidenciaModelo[];
}

export interface ModeloChecklistRequest {
  finalidade: FinalidadeChecklist;
  titulo: string;
  descricao: string | null;
  estrutura: EstruturaChecklist;
  fotosTravamExecucao?: boolean;
}

export interface ModeloChecklistResponse {
  id: string;
  finalidade: FinalidadeChecklist;
  titulo: string;
  descricao: string | null;
  estrutura: EstruturaChecklist;
  grupos: number;
  perguntas: number;
  emUso: boolean;
  ativo: boolean;
  /** Fotos obrigatórias travam o "Tudo feito" no app (e as de antes, o "Parcial"). */
  fotosTravamExecucao?: boolean;
}

export interface ModeloChecklistFilter {
  buscaGlobal?: string | null;
  finalidade?: FinalidadeChecklist | null;
  ativo?: boolean | null;
  page?: number;
  size?: number;
  sort?: string | string[];
}

export interface RespostaInformada {
  idPergunta: string;
  valor: string | null;
  selecionadas: string[];
  naoSeAplica: boolean;
}

export interface ItemResposta extends RespostaInformada {
  grupo: string;
  enunciado: string;
  tipo: TipoPerguntaChecklist;
  obrigatoria: boolean;
  /** Resposta esperada quando a visita foi feita; registro antigo vem sem ela. */
  opcaoConforme?: string | null;
}

export interface RespostasChecklist {
  itens: ItemResposta[];
}

/** Foto ou PDF da visita prévia. Sem pergunta, é evidência geral. Sempre opcional. */
export interface EvidenciaVisita {
  id: string;
  idPergunta: string | null;
  enunciadoPergunta: string | null;
  legenda: string | null;
  nomeArquivo: string;
  contentType: string;
  tamanhoBytes: number;
  foto: boolean;
  usuario: string | null;
  data: string;
}

export interface VisitaPrevia {
  id: string;
  idModelo: string;
  tituloModelo: string;
  dataVisita: string;
  /** Nulo em registro antigo, que ficou só com o nome. */
  idColaborador: string | null;
  /** Nome do responsável no momento da visita. */
  responsavel: string;
  observacoes: string | null;
  respostas: RespostasChecklist;
  naoConformidades: number;
  evidencias: EvidenciaVisita[];
  usuario: string | null;
  data: string;
}

export interface VisitaPreviaRequest {
  idModelo: string;
  dataVisita: string;
  idColaborador: string | null;
  /** Só vale sem colaborador, para manter o nome de um registro antigo. */
  responsavel: string | null;
  observacoes: string | null;
  respostas: RespostaInformada[];
}

export interface FichaAsBuilt {
  id: string;
  idModelo: string;
  tituloModelo: string;
  completa: boolean;
  pendencias: string[];
  respostas: RespostasChecklist;
  usuario: string | null;
  data: string;
}

export interface EvidenciaPonto {
  id: string;
  /** Sem item, é uma foto avulsa do ponto. */
  idItem: string | null;
  tituloItem: string | null;
  legenda: string | null;
  nomeArquivo: string;
  usuario: string | null;
  /** Quando foi lançada no sistema. */
  data: string;
  etapa: EtapaEvidencia | null;
  latitude: number | null;
  longitude: number | null;
  /** Quando foi tirada, se o app informou. */
  dataCaptura: string | null;
  tamanhoBytes: number;
  /** Revisão antes da medição: só a aprovada entra no relatório detalhado. */
  revisao?: 'PENDENTE' | 'APROVADA' | 'REPROVADA';
  rotuloInconformidade?: string | null;
  motivoReprovacao?: string | null;
  revisadaPor?: string | null;
  revisadaEm?: string | null;
  /** Código impresso no carimbo da foto pelo app ("7F3A-21C9"); foto enviada pelo web não tem. */
  codigo?: string | null;
}

export interface PontoDocumentacao {
  id: string;
  numero: string;
  pagina: number;
  tipo: string;
  executado: boolean;
  ficha: FichaAsBuilt | null;
  /** O da ficha ou, antes dela, o das fotos já lançadas. */
  idModelo: string | null;
  tituloModelo: string | null;
  itensEvidencia: ItemEvidenciaModelo[];
  evidencias: EvidenciaPonto[];
}

export interface DocumentoAsBuilt {
  id: string;
  tipo: TipoDocumentoEntrega;
  numeroVersao: number;
  status: StatusDocumentoAsBuilt;
  idAnexo: string | null;
  mensagemErro: string | null;
  usuario: string | null;
  data: string;
  totalPaginas: number | null;
  totalFotos: number | null;
}

export interface EquipamentoObra {
  id: string;
  idPonto: string;
  numeroPonto: string;
  pagina: number;
  tipo: TipoEquipamento;
  trafoAuxiliar: boolean;
  observacao: string | null;
}

export interface EquipamentoRequest {
  tipo: TipoEquipamento;
  trafoAuxiliar: boolean;
  observacao: string | null;
}

export interface DocumentacaoObra {
  visitaRealizada: boolean;
  visitas: VisitaPrevia[];
  temProjetoMestre: boolean;
  pontos: PontoDocumentacao[];
  asBuilt: { pontosExecutados: number; fichasCompletas: number; pontosPendentes: string[]; pontosSemEvidencia: string[] };
  documentos: DocumentoAsBuilt[];
  equipamentos: EquipamentoObra[];
}
