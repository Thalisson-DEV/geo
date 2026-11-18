/** Avaliação do aplicativo: pesquisa temporária de satisfação (web e app de campo). */

export type OrigemAvaliacao = 'WEB' | 'CAMPO';
export type FacilidadeAvaliacao = 'FACIL' | 'RAZOAVEL' | 'DIFICIL';
export type ProblemaAvaliacao = 'LENTIDAO' | 'SINCRONIZACAO' | 'LOGIN' | 'TELA_TRAVANDO' | 'DADO_SUMIU' | 'OUTRO';

export interface ConviteAvaliacao {
  campanhaId: string;
  titulo: string;
  fim: string;
  /** Mostrar o convite agora. A decisão é do servidor e vale para todos os aparelhos. */
  convidar: boolean;
  jaRespondeu: boolean;
  /** O convite já foi adiado o máximo de vezes: esta aparição oferece "não quero responder". */
  ultimaVez: boolean;
}

export interface RespostaAvaliacaoRequest {
  origem: OrigemAvaliacao;
  estrelas: number;
  facilidade: FacilidadeAvaliacao | null;
  problemas: ProblemaAvaliacao[];
  problemaDetalhe: string | null;
  sugestao: string | null;
  anonima: boolean;
  versaoApp: string | null;
}

export interface CampanhaAvaliacao {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  encerradaEm: string | null;
  aberta: boolean;
  respostas: number;
}

export interface CampanhaAvaliacaoRequest {
  titulo: string;
  inicio: string;
  fim: string;
}

export interface ResumoAvaliacao {
  respostas: number;
  mediaEstrelas: number | null;
  porEstrelas: Record<string, number>;
  porFacilidade: Record<FacilidadeAvaliacao, number>;
  porProblema: Record<ProblemaAvaliacao, number>;
  porOrigem: Record<OrigemAvaliacao, number>;
  anonimas: number;
  comSugestao: number;
  adiaram: number;
  recusaram: number;
}

export interface RespostaAvaliacao {
  id: string;
  respondidaEm: string;
  origem: OrigemAvaliacao;
  estrelas: number;
  facilidade: FacilidadeAvaliacao | null;
  problemas: ProblemaAvaliacao[];
  problemaDetalhe: string | null;
  sugestao: string | null;
  versaoApp: string | null;
  /** Nulo = resposta anônima. */
  autor: string | null;
}

export const ROTULO_ESTRELAS: Record<number, string> = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Ótimo'
};

export const ROTULO_FACILIDADE: Record<FacilidadeAvaliacao, string> = {
  FACIL: 'Fácil',
  RAZOAVEL: 'Razoável',
  DIFICIL: 'Difícil'
};

export const ROTULO_PROBLEMA: Record<ProblemaAvaliacao, string> = {
  LENTIDAO: 'Lentidão',
  SINCRONIZACAO: 'Envio dos dados',
  LOGIN: 'Entrar no sistema',
  TELA_TRAVANDO: 'Tela travando',
  DADO_SUMIU: 'Informação sumiu',
  OUTRO: 'Outro'
};

export const ROTULO_ORIGEM: Record<OrigemAvaliacao, string> = {
  WEB: 'GEO web',
  CAMPO: 'App de campo'
};
