/** Balcão do almoxarifado: retirada da manhã e devolução do fim do dia de cada equipe. */

export type CondicaoBalcao = 'NOVO' | 'SUCATA';
export type DestinoDevolucao = 'GUARDAR' | 'DESCARTAR';

export interface RegrasBalcao {
  separacaoObrigatoria: boolean;
  entregaAcimaPedido: boolean;
  devolucaoAcimaCaminhao: boolean;
  exigeAssinatura: boolean;
  exigeMatricula: boolean;
  exigeFoto: boolean;
}

export interface AlmoxarifadoBalcao {
  id: string;
  nome: string;
}

export interface EquipeNoBalcao {
  idEquipe: string;
  codigo: string;
  base: string | null;
  encarregado: string | null;
  solicitacoesRetirada: number;
  obrasRetirada: number;
  itensRetirada: number;
  retiradaAtrasada: boolean;
  aguardandoSeparacao: boolean;
  itensNoCaminhao: number;
  obrasNoCaminhao: number;
  sucatasNoCaminhao: number;
  negativosNoCaminhao: number;
  ultimaRetirada: string | null;
  ultimaDevolucao: string | null;
}

export interface ItemAtendimento {
  codigo: string;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  condicao: CondicaoBalcao;
  numeroObra: string | null;
  numeroSerie: string | null;
  destino: DestinoDevolucao | null;
  excedente: number | null;
  motivoExcedente: string | null;
}

export interface AtendimentoResumo {
  id: string;
  tipo: 'RETIRADA' | 'DEVOLUCAO';
  idEquipe: string;
  equipe: string | null;
  nomeColaborador: string | null;
  matricula: string | null;
  realizadoEm: string;
  operador: string | null;
  temAssinatura: boolean;
  assinaturaFisica: boolean;
  temFoto: boolean;
  observacao: string | null;
  itens: ItemAtendimento[];
}

export interface PainelBalcao {
  idAlmoxarifado: string | null;
  almoxarifado: string | null;
  data: string;
  almoxarifados: AlmoxarifadoBalcao[];
  parametros: RegrasBalcao;
  equipes: EquipeNoBalcao[];
  atendimentosHoje: AtendimentoResumo[];
}

export interface PessoaBalcao {
  idColaborador: string;
  nome: string;
  matricula: string | null;
  encarregado: boolean;
  /** Escolhida fora da equipe (busca de colaboradores): a matrícula é conferida no registro. */
  deFora?: boolean;
}

export interface ItemRetirada {
  idItem: string;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  pedido: number;
  entregue: number;
  falta: number;
  detalhaSerie: boolean;
  saldoAlmoxarifado: number;
}

export interface RetiradaObra {
  idSolicitacao: string;
  versao: number;
  idObra: string | null;
  numeroObra: string | null;
  tituloObra: string | null;
  numeroProgramacao: number | null;
  dataPrevista: string;
  atrasada: boolean;
  reserva: string | null;
  concreto: boolean;
  separacao: string | null;
  itens: ItemRetirada[];
}

export interface ItemCaminhao {
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  condicao: CondicaoBalcao;
  quantidade: number;
  detalhaSerie: boolean;
  series: string[];
}

/** Uma linha do inventário dos caminhões: equipe × obra × material (negativa = saldo negativo). */
export interface ItemNasEquipes {
  idEquipe: string;
  equipe: string;
  idObra: string | null;
  numeroObra: string | null;
  tituloObra: string | null;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  condicao: CondicaoBalcao;
  quantidade: number;
}

export interface GrupoCaminhao {
  idObra: string | null;
  numeroObra: string | null;
  tituloObra: string | null;
  itens: ItemCaminhao[];
}

export interface AtendimentoEquipe {
  idEquipe: string;
  codigo: string;
  base: string | null;
  idAlmoxarifado: string;
  almoxarifado: string;
  parametros: RegrasBalcao;
  pessoas: PessoaBalcao[];
  retiradas: RetiradaObra[];
  caminhao: GrupoCaminhao[];
  recentes: AtendimentoResumo[];
}

export interface ComprovanteBalcao {
  idColaborador?: string | null;
  matricula?: string | null;
  assinatura?: string | null;
  foto?: string | null;
  observacao?: string | null;
}

export interface RegistrarRetiradaRequest {
  idAlmoxarifado: string;
  comprovante: ComprovanteBalcao;
  solicitacoes: {
    idSolicitacao: string;
    versaoEsperada?: number | null;
    numeroReserva?: string | null;
    itens: { idItemSolicitacao: string; quantidade: number; numeroSerie?: string | null; motivoExcedente?: string | null }[];
  }[];
}

export interface RegistrarDevolucaoRequest {
  idAlmoxarifado: string;
  comprovante: ComprovanteBalcao;
  itens: {
    idMaterial: string;
    condicao: CondicaoBalcao;
    idObra: string | null;
    quantidade: number;
    numeroSerie?: string | null;
    destino: DestinoDevolucao;
  }[];
}
