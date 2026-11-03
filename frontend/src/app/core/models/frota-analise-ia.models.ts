import { CesTone } from '@ces/ui';

/** Registro da frota que a IA analisa no relatório. */
export type AlvoAnaliseIa = 'ORDEM_SERVICO' | 'CHECKLIST' | 'ABASTECIMENTO';
export type ParecerAnaliseIa = 'SEM_RESSALVAS' | 'ATENCAO' | 'CRITICO';
export type GravidadePontoIa = 'INFO' | 'ATENCAO' | 'CRITICO';
export type ResultadoFotoIa = 'CONFERE' | 'DIVERGE' | 'ILEGIVEL' | 'SEM_RELACAO';
/** Onde a foto mora, para a tela buscar a imagem. */
/** ABASTECIMENTO_ANTERIOR: painel do pedido anterior do veículo, enviado só para comparar. */
export type OrigemFotoIa = 'CHECKLIST' | 'ABASTECIMENTO' | 'ABASTECIMENTO_ANTERIOR' | 'DOCUMENTO_FISCAL';

export interface PontoAnaliseIa {
  titulo: string;
  detalhe: string;
  gravidade: GravidadePontoIa;
}

export interface FotoAnaliseIa {
  ref: string;
  origem: OrigemFotoIa;
  idOrigem: string;
  idFoto: string;
  rotulo: string;
  leitura: string | null;
  resultado: ResultadoFotoIa;
  observacao: string | null;
}

export interface AnaliseIa {
  id: string;
  alvo: AlvoAnaliseIa;
  idAlvo: string;
  parecer: ParecerAnaliseIa;
  parecerRotulo: string;
  resumo: string;
  pontos: PontoAnaliseIa[];
  fotos: FotoAnaliseIa[];
  recomendacoes: string[];
  fotosAnalisadas: number;
  /** Fotos que não foram para a IA, com o motivo. */
  fotosNaoLidas: string[];
  modelo: string;
  geradaEm: string;
  geradaPor: string | null;
}

export interface EstadoAnaliseIa {
  disponivel: boolean;
  motivoIndisponivel: string | null;
  ultima: AnaliseIa | null;
}

export const TOM_PARECER_IA: Record<ParecerAnaliseIa, CesTone> = {
  SEM_RESSALVAS: 'success',
  ATENCAO: 'warning',
  CRITICO: 'danger'
};

export const ICONE_PARECER_IA: Record<ParecerAnaliseIa, string> = {
  SEM_RESSALVAS: 'pi-check-circle',
  ATENCAO: 'pi-exclamation-triangle',
  CRITICO: 'pi-times-circle'
};

export const TOM_GRAVIDADE_IA: Record<GravidadePontoIa, CesTone> = {
  INFO: 'info',
  ATENCAO: 'warning',
  CRITICO: 'danger'
};

export const ROTULO_GRAVIDADE_IA: Record<GravidadePontoIa, string> = {
  INFO: 'Informação',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico'
};

export const TOM_RESULTADO_FOTO_IA: Record<ResultadoFotoIa, CesTone> = {
  CONFERE: 'success',
  DIVERGE: 'danger',
  ILEGIVEL: 'warning',
  SEM_RELACAO: 'neutral'
};

export const ROTULO_RESULTADO_FOTO_IA: Record<ResultadoFotoIa, string> = {
  CONFERE: 'Confere',
  DIVERGE: 'Diverge',
  ILEGIVEL: 'Ilegível',
  SEM_RELACAO: 'Sem relação'
};

export const ICONE_RESULTADO_FOTO_IA: Record<ResultadoFotoIa, string> = {
  CONFERE: 'pi-check',
  DIVERGE: 'pi-times',
  ILEGIVEL: 'pi-eye-slash',
  SEM_RELACAO: 'pi-minus'
};
