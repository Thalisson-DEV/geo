import { UnidadeMedicao } from './frota.models';

export type TipoModeloChecklist = 'PRINCIPAL' | 'ADICIONAL';
export type TipoRespostaChecklist = 'OK_NOK' | 'OPCOES' | 'TEXTO';
export type SituacaoPendenciaChecklist = 'ABERTA' | 'OS_ABERTA' | 'RESOLVIDA_NA_HORA' | 'DESCARTADA';
export type TipoFotoChecklist = 'RESPOSTA' | 'RECEBIMENTO' | 'GERAL';
export type SituacaoCnh = 'APTO' | 'SEM_CNH' | 'VENCIDA' | 'CATEGORIA_INSUFICIENTE';
/** Quando a pergunta exige foto. */
export type ModoFotoPergunta = 'NUNCA' | 'NAO_OK' | 'SEMPRE';
/** USO tem condutor; recebimento e devolução são registros sem condutor (administrativo). */
export type FinalidadeChecklist = 'USO' | 'RECEBIMENTO' | 'DEVOLUCAO';

export const ROTULO_MODO_FOTO: Record<ModoFotoPergunta, string> = {
  NUNCA: 'Sem foto',
  NAO_OK: 'Foto no Não OK',
  SEMPRE: 'Foto sempre'
};

export interface OpcaoTipo {
  valor: string;
  rotulo: string;
}

export interface AlternativaChecklist {
  id: string | null;
  texto: string;
  indicaProblema: boolean;
}

export interface PerguntaChecklist {
  id: string | null;
  ordem?: number;
  grupo: string | null;
  texto: string;
  tipoResposta: TipoRespostaChecklist;
  /** Legado; o servidor guarda {@link modoFoto}. */
  fotoNoNaoOk: boolean;
  modoFoto: ModoFotoPergunta;
  opcoes: AlternativaChecklist[];
  motivos: AlternativaChecklist[];
}

export interface FotoRecebimentoChecklist {
  id: string | null;
  descricao: string;
}

export interface ModeloChecklistResumo {
  id: string;
  nome: string;
  tipo: TipoModeloChecklist;
  tipoRotulo: string;
  tiposVeiculo: string[];
  tiposImplemento: string[];
  quantidadePerguntas: number;
  quantidadeFotosRecebimento: number;
  ativo: boolean;
}

export interface ModeloChecklist {
  id: string;
  nome: string;
  tipo: TipoModeloChecklist;
  tipoRotulo: string;
  instrucoes: string | null;
  exigeAssinatura: boolean;
  tiposVeiculo: OpcaoTipo[];
  tiposImplemento: OpcaoTipo[];
  perguntas: PerguntaChecklist[];
  fotosRecebimento: FotoRecebimentoChecklist[];
  ativo: boolean;
}

export interface ModeloChecklistRequest {
  nome: string;
  tipo: TipoModeloChecklist;
  instrucoes: string | null;
  exigeAssinatura: boolean;
  idsTiposVeiculo: string[];
  idsTiposImplemento: string[];
  perguntas: PerguntaChecklist[];
  fotosRecebimento: FotoRecebimentoChecklist[];
}

export interface FotoChecklist {
  id: string;
  tipo: TipoFotoChecklist;
  descricao: string | null;
  recebida: boolean;
}

export interface ChecklistResumo {
  id: string;
  preenchidoEm: string;
  idVeiculo: string;
  placa: string;
  baseNome: string | null;
  modeloNome: string;
  condutorNome: string | null;
  preenchidoPor: string | null;
  medicao: number | null;
  unidadeMedicao: UnidadeMedicao;
  passagemVeiculo: boolean;
  problemas: number;
  fotosAChegar: number;
  liberacaoCnh: boolean;
  finalidade: FinalidadeChecklist;
  finalidadeRotulo: string;
  /** CNH que não permitia dirigir, sem liberação: o checklist vale, o abastecimento não. */
  avisoCnh: string | null;
}

/** Histórico do item com problema no veículo. */
export interface HistoricoItemChecklist {
  problemaDesde: string | null;
  diasComProblema: number;
  checklistsSeguidos: number;
  vezes30Dias: number;
  ultimoOkEm: string | null;
}

export interface RespostaChecklistDetalhe {
  id: string;
  grupo: string | null;
  pergunta: string;
  tipoResposta: TipoRespostaChecklist;
  conforme: boolean | null;
  resposta: string;
  comentario: string | null;
  problema: boolean;
  fotos: FotoChecklist[];
  idPendencia: string | null;
  situacaoPendencia: SituacaoPendenciaChecklist | null;
  numeroOrdemServico: number | null;
  idOrdemServico: string | null;
  historico: HistoricoItemChecklist | null;
  /** Decisão do gestor sobre o problema (nulos enquanto aguarda). */
  decididaEm?: string | null;
  decididaPor?: string | null;
  justificativaDecisao?: string | null;
}

export interface ChecklistDetalhe {
  resumo: ChecklistResumo;
  comentario: string | null;
  assinado: boolean;
  justificativaLiberacaoCnh: string | null;
  respostas: RespostaChecklistDetalhe[];
  fotosRecebimento: FotoChecklist[];
}

export interface ChecklistFiltro {
  idVeiculo?: string | null;
  idsBase?: string[];
  idCondutor?: string | null;
  de?: string | null;
  ate?: string | null;
  comProblema?: boolean | null;
}

export interface VeiculoSemChecklist {
  idVeiculo: string;
  placa: string;
  idBaseOperacional: string | null;
  baseNome: string | null;
  motivo: string;
  ultimoChecklistEm: string | null;
  condutorAtualNome: string | null;
}

export interface PendenciaChecklist {
  id: string;
  situacao: SituacaoPendenciaChecklist;
  situacaoRotulo: string;
  idChecklist: string;
  preenchidoEm: string;
  idVeiculo: string;
  placa: string;
  baseNome: string | null;
  condutorNome: string | null;
  grupo: string | null;
  pergunta: string;
  resumo: string;
  comentario: string | null;
  fotos: FotoChecklist[];
  fotosAChegar: number;
  idOrdemServico: string | null;
  numeroOrdemServico: number | null;
  justificativa: string | null;
  decididaPor: string | null;
  decididaEm: string | null;
  historico: HistoricoItemChecklist | null;
}

export interface AbrirOsPendenciasRequest {
  idsPendencia: string[];
  idsItem: string[];
  criticidade: string | null;
  observacao: string | null;
  /** Oficina já na abertura (opcional): interna ou externa, com fornecedor ou nome. */
  tipoOficina?: 'INTERNA' | 'EXTERNA' | null;
  idFornecedor?: string | null;
  oficinaNome?: string | null;
}

export interface ResolverPendenciasRequest {
  idsPendencia: string[];
  idsItem: string[];
  descricaoServico: string;
  idExecutor: string | null;
  executorNome: string | null;
  idBaseOperacional: string | null;
  causa: string | null;
}

export interface AptidaoConducao {
  situacao: SituacaoCnh;
  mensagem: string;
  validade: string | null;
  categoriaExigida: string | null;
  categoriaAtual: string | null;
  idLiberacao: string | null;
}

export interface LiberacaoCnh {
  id: string;
  idCondutor: string;
  condutorNome: string | null;
  idVeiculo: string;
  placa: string | null;
  dia: string;
  justificativa: string;
  liberadoPor: string | null;
  liberadoEm: string;
}

export interface LiberacaoCnhRequest {
  idCondutor: string;
  idVeiculo: string;
  dia: string | null;
  justificativa: string;
}

/** Catálogo do app (o mesmo que o celular sincroniza); a web usa para escolher condutor e veículo. */
export interface CatalogoChecklist {
  geradoEm: string;
  modelos: ModeloChecklist[];
  veiculos: {
    idVeiculo: string;
    placa: string;
    descricao: string | null;
    idBaseOperacional: string | null;
    baseNome: string | null;
    unidadeMedicao: UnidadeMedicao;
    categoriaCnhExigida: string | null;
    medicaoAtual: number | null;
    idsModelosPrincipais: string[];
    idsModelosAdicionais: string[];
    idCondutorAtual: string | null;
    condutorAtualNome: string | null;
  }[];
  condutores: { idColaborador: string; nome: string; categoriaCnh: string | null; validadeCnh: string | null }[];
  liberacoesCnh: { idCondutor: string; idVeiculo: string; dia: string }[];
}
