/** Revisão das fotos de campo antes da medição (`/v1/obras/evidencias`). */
export type RevisaoFoto = 'PENDENTE' | 'APROVADA' | 'REPROVADA';
export type InconformidadeFoto = 'FORA_DE_FOCO' | 'ITEM_ERRADO' | 'ANGULO_RUIM' | 'PONTO_ERRADO' | 'SEM_CARIMBO' | 'OUTRA';

export interface FotoParaRevisao {
  id: string;
  idObra: string;
  numeroObra?: string | null;
  idPonto: string;
  numeroPonto?: string | null;
  tituloItem?: string | null;
  etapa?: 'ANTES' | 'DURANTE' | 'DEPOIS' | null;
  legenda?: string | null;
  dataFoto?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  idEquipe?: string | null;
  equipe?: string | null;
  doApp: boolean;
  status: RevisaoFoto;
  inconformidade?: InconformidadeFoto | null;
  rotuloInconformidade?: string | null;
  motivo?: string | null;
  revisadaPor?: string | null;
  revisadaEm?: string | null;
}

export interface RevisaoFotoFilter {
  status?: RevisaoFoto;
  numeroObra?: string;
  de?: string;
  ate?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export interface DecisaoFoto {
  aprovar: boolean;
  inconformidade?: InconformidadeFoto | null;
  motivo?: string | null;
}

export interface LinhaRankingFotos {
  idEquipe: string;
  equipe: string;
  total: number;
  aprovadas: number;
  reprovadas: number;
  pendentes: number;
  percentualAprovacao?: number | null;
  principalInconformidade?: string | null;
}

export interface OpcaoInconformidade {
  valor: InconformidadeFoto;
  rotulo: string;
}
