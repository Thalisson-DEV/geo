/**
 * Obras no app de campo: o pacote offline que o servidor manda (`GET /v1/obras/campo/pacote`) e os registros que a equipe
 * lança no aparelho. Os nomes seguem o contrato do backend (`CampoObrasResponses`/`CampoObrasRequests`).
 */

export type TurnoProgramacao = 'DIA_TODO' | 'MANHA' | 'TARDE' | 'NOITE' | string;
export type SituacaoProgramacao = 'PROGRAMADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'ATRASADA' | 'CANCELADA';
export type StatusItemPlanejado = 'PENDENTE' | 'PROGRAMADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'MEDIDO';
export type TipoItem = 'SERVICO' | 'MATERIAL';

export interface ItemCampo {
  idItem: string;
  idPonto?: string | null;
  idVao?: string | null;
  local?: string | null;
  tipo: TipoItem;
  idMaterial?: string | null;
  codigo?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  kit?: string | null;
  quantidade: number;
  executada: number;
  status: StatusItemPlanejado;
}

export interface ProgramacaoCampo {
  id: string;
  numero: number;
  idObra: string;
  numeroObra?: string | null;
  inicio: string; // dd/MM/yyyy
  fim: string;
  descricao: string;
  turno: TurnoProgramacao;
  linhaViva: boolean;
  desligamento: boolean;
  horaDesligamentoInicio?: string | null;
  horaDesligamentoFim?: string | null;
  numeroManobra?: string | null;
  finalizaObra: boolean;
  situacaoIntervencao?: string | null;
  observacao?: string | null;
  situacao: SituacaoProgramacao;
  versao?: number | null;
  /** Execução avulsa: obra fora da agenda que a equipe começou pelo app (programação montada no aparelho). */
  avulsa?: boolean;
  itens: ItemCampo[];
}

export interface ProjetoPdf { idAnexo: string; nome: string; tamanhoBytes: number; hash: string }
export interface PontoCampo {
  id: string; numero: string; pagina?: number | null; x?: number | null; y?: number | null; tipo?: string | null;
  tipoExecucao?: string | null; temPoda: boolean; temAterramento: boolean;
}
export interface VaoCampo { id: string; idPontoA: string; idPontoB: string; metragem?: number | null }
export interface FotoCampo { id: string; idLocal?: string | null; idPonto: string; idVao?: string | null; idModelo?: string | null; idItem?: string | null; etapa?: string | null }
/** {@code motivoReprovacao}: o escritório reprovou a foto deste item ("Fora de foco ou escura: ...") e ela precisa ser refeita. */
export interface PendenciaFoto { idPonto: string; numeroPonto: string; idItem: string; titulo: string; motivoReprovacao?: string | null }

/** Recado da visita prévia: data (dd/MM/yyyy), quem visitou, observações e respostas que pedem atenção. */
export interface VisitaCampo {
  data: string;
  responsavel?: string | null;
  observacoes?: string | null;
  atencao: string[];
}

export interface ObraCampo {
  id: string;
  numero: string;
  titulo?: string | null;
  endereco?: string | null;
  referencia?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  municipio?: string | null;
  projeto?: ProjetoPdf | null;
  rotacoes?: Record<string, number>;
  pontos: PontoCampo[];
  vaos: VaoCampo[];
  idModeloFoto?: string | null;
  fotos: FotoCampo[];
  pendenciasFoto: PendenciaFoto[];
  /** Itens pendentes da obra fora de qualquer programação: o que a equipe pode fazer além do programado. */
  itensExtras?: ItemCampo[];
  /** Última visita prévia do supervisor (null = nenhuma; ausente = pacote antigo). */
  visitaPrevia?: VisitaCampo | null;
}

/** Obra em aberto da base, só para achar sem sinal (os pontos chegam quando houver sinal). */
export interface ObraResumo { id: string; numero: string; titulo?: string | null; municipio?: string | null }

export interface Sugestao { riscos: string[]; medidas: string[] }
export interface ModeloApr { riscos: string[]; medidas: string[]; verificacoes: string[]; sugestoes: Record<string, Sugestao> }
export type EtapaFoto = 'ANTES' | 'DURANTE' | 'DEPOIS';
/** {@code etapa}: o momento da foto definido no modelo; sem ele, vale a situação do ponto na hora da foto. */
export interface ItemFoto { id: string; titulo: string; obrigatoria: boolean; etapa?: EtapaFoto | null }
export interface ModeloFoto { id: string; titulo: string; itens: ItemFoto[] }
export interface AvisoProgramacao {
  id: string; tipo: 'CRIADA' | 'EDITADA' | 'REPROGRAMADA' | 'CANCELADA' | 'EXCLUIDA'; idProgramacao: string;
  numeroProgramacao?: number | null; idObra?: string | null; numeroObra?: string | null; texto: string; em: string;
}

export interface PacoteObras {
  geradoEm: string;
  desde?: string | null;
  idEquipe: string;
  codigoEquipe?: string | null;
  inicioJanela: string;
  fimJanela: string;
  programacoes: ProgramacaoCampo[];
  programacoesRemovidas: string[];
  obras: ObraCampo[];
  modeloApr: ModeloApr;
  modelosFoto: ModeloFoto[];
  avisos: AvisoProgramacao[];
  /** APRs concluídas e "sem condição" da equipe hoje, de qualquer aparelho. */
  liberacaoDoDia?: LiberacaoDia[];
  obrasAbertas?: ObraResumo[];
}

export interface LiberacaoDia { tipo: 'APR' | 'IMPEDIMENTO'; idObra: string; idLocal?: string | null; em: string }

// ---------- Registros da equipe no aparelho ----------

/** Estado de envio de um registro de Obras, como a equipe vê. */
export type EnvioObra = 'NO_APARELHO' | 'ENVIANDO' | 'ENVIADO' | 'CONFLITO' | 'AGUARDANDO';

export type TipoRegistroObra = 'APR' | 'APR_CONCLUSAO' | 'OCORRENCIA' | 'ATIVIDADE' | 'APONTAMENTO' | 'PRESENCA' | 'EVIDENCIA' | 'RELATORIO';

export interface CampoDoAparelho {
  idLocal: string;
  idTurno?: string | null;
  instante: string; // ISO com offset
  latitude?: number | null;
  longitude?: number | null;
  precisao?: number | null;
}

/** Um registro lançado no aparelho: o comando que vai ao servidor e o que a tela mostra enquanto isso. */
export interface RegistroObraLocal {
  id: string; // = campo.idLocal
  tipo: TipoRegistroObra;
  idObra?: string | null;
  idProgramacao?: string | null;
  idPonto?: string | null;
  /** Registro de que este depende (a APR de um apontamento): só sai depois dele. */
  dependeDe?: string | null;
  comando: Record<string, unknown> & { campo: CampoDoAparelho };
  /** Foto (evidência) guardada em arquivo: a chave no armazenamento de arquivos. */
  arquivo?: { chave: string; nome: string; tipo: string } | null;
  envio: EnvioObra;
  motivo?: string | null;
  criadoEm: string;
  enviadoEm?: string | null;
  /** Dia (aaaa-mm-dd, horário local) para agrupar no Hoje e no relatório. */
  dia: string;
}

/** Rascunho da APR em andamento (o app pode morrer no meio: volta ao mesmo passo). */
export interface AprRascunho {
  passo: number;
  riscos: string[];
  outroRisco: string;
  medidas: string[];
  medidasAdicionais: string;
  verificacoes: Record<string, 'SIM' | 'NAO' | 'NAO_SE_APLICA' | undefined>;
  participantes: string[];
  assinaturas: Record<string, string>; // idColaborador -> PNG base64
}

/** Registro idêntico ao comando do backend `CampoObrasRequests.Apr`. */
export interface FormularioApr {
  local?: string | null;
  riscos: string[];
  outroRisco?: string | null;
  medidas: string[];
  medidasAdicionais?: string | null;
  verificacoes: { pergunta: string; resposta: 'SIM' | 'NAO' | 'NAO_SE_APLICA' }[];
  idsParticipantes: string[];
}

export type TipoOcorrencia = 'SEGURANCA' | 'CLIMA' | 'MATERIAL' | 'EQUIPAMENTO' | 'ACESSO' | 'DESLIGAMENTO' | 'TERCEIROS' | 'OUTROS';

export const TIPOS_OCORRENCIA: { valor: TipoOcorrencia; rotulo: string }[] = [
  { valor: 'CLIMA', rotulo: 'Clima' },
  { valor: 'MATERIAL', rotulo: 'Falta de material' },
  { valor: 'ACESSO', rotulo: 'Acesso' },
  { valor: 'DESLIGAMENTO', rotulo: 'Desligamento' },
  { valor: 'SEGURANCA', rotulo: 'Segurança' },
  { valor: 'EQUIPAMENTO', rotulo: 'Equipamento' },
  { valor: 'TERCEIROS', rotulo: 'Terceiros' },
  { valor: 'OUTROS', rotulo: 'Outros' },
];
