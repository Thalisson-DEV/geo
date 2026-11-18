/** Medidas disciplinares do RH (dado restrito: `rh:medida-disciplinar:read`). */

/** A medida é lançada depois de aplicada e pode ser cancelada com justificativa. */
export type SituacaoMedidaDisciplinar = 'APLICADA' | 'CANCELADA';
export type OrigemMedidaDisciplinar = 'MANUAL' | 'FROTA_MULTA' | 'IMPORTACAO';
export type TipoEventoMedidaDisciplinar =
  | 'REGISTRADA'
  | 'EDITADA'
  | 'APLICADA'
  | 'CIENCIA_ASSINADA'
  | 'CIENCIA_RECUSADA'
  | 'CANCELADA'
  | 'ANEXO_INCLUIDO'
  | 'ANEXO_REMOVIDO';

export const ROTULO_SITUACAO_MEDIDA: Record<SituacaoMedidaDisciplinar, string> = {
  APLICADA: 'Aplicada',
  CANCELADA: 'Cancelada'
};

export const ROTULO_ORIGEM_MEDIDA: Record<OrigemMedidaDisciplinar, string> = {
  MANUAL: 'Manual',
  FROTA_MULTA: 'Multa da frota',
  IMPORTACAO: 'Importação'
};

export interface AnexoMedidaDisciplinar {
  id: string;
  nome: string;
  contentType: string | null;
  tamanhoBytes: number | null;
  sha256: string;
  enviadoEm: string;
}

export interface EventoMedidaDisciplinar {
  tipo: TipoEventoMedidaDisciplinar;
  tipoRotulo: string;
  descricao: string;
  usuarioNome: string | null;
  ocorridoEm: string;
}

export interface MedidaDisciplinar {
  id: string;
  idColaborador: string;
  colaboradorNome: string | null;
  colaboradorFuncao: string | null;
  idBaseOperacional: string | null;
  baseNome: string | null;
  idTipo: string;
  tipoNome: string;
  gravidade: number;
  exigePeriodo: boolean;
  idMotivo: string;
  motivoNome: string;
  dataFato: string;
  dataAplicacao: string;
  /** Só no detalhe; a listagem não traz os fatos. */
  descricao: string | null;
  diasSuspensao: number | null;
  inicioSuspensao: string | null;
  fimSuspensao: string | null;
  situacao: SituacaoMedidaDisciplinar;
  situacaoRotulo: string;
  aplicadaPorNome: string | null;
  aplicadaEm: string | null;
  origem: OrigemMedidaDisciplinar;
  origemRotulo: string;
  idOrigem: string | null;
  idExterno: string | null;
  canceladaEm: string | null;
  justificativaCancelamento: string | null;
  diasDesdeOFato: number;
  foraDaImediatidade: boolean;
  quantidadeAnexos: number;
  anexos: AnexoMedidaDisciplinar[];
  historico: EventoMedidaDisciplinar[];
  dataCriacao: string;
}

export interface OrigemMedidaRequest {
  tipo: string;
  id: string;
}

export interface MedidaDisciplinarRequest {
  idColaborador: string;
  idTipo: string;
  idMotivo: string;
  dataFato: string;
  /** Dia em que a medida foi aplicada ao colaborador. */
  dataAplicacao: string;
  descricao: string;
  diasSuspensao: number | null;
  inicioSuspensao: string | null;
  /** Só vale no lançamento. */
  origem?: OrigemMedidaRequest | null;
}

export interface FiltroMedidas {
  busca?: string | null;
  idColaborador?: string | null;
  idsBase?: string[];
  idsTipo?: string[];
  idsMotivo?: string[];
  situacoes?: SituacaoMedidaDisciplinar[];
  origens?: OrigemMedidaDisciplinar[];
  de?: string | null;
  ate?: string | null;
}

export interface ReincidenciaMedida {
  janelaMeses: number;
  diasImediatidade: number;
  anteriores: {
    id: string;
    tipoNome: string;
    gravidade: number;
    dataFato: string;
    dataAplicacao: string | null;
    situacaoRotulo: string;
  }[];
  gravidadeUltima: number | null;
  idTipoSugerido: string | null;
  tipoSugeridoNome: string | null;
}

export interface TipoMedidaDisciplinar {
  id: string;
  nome: string;
  gravidade: number;
  exigePeriodo: boolean;
  ativo: boolean;
}

export interface TipoMedidaDisciplinarRequest {
  nome: string;
  gravidade: number;
  exigePeriodo: boolean;
}

export interface MotivoMedidaDisciplinar {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface ParametrosRh {
  janelaReincidenciaMeses: number;
  diasImediatidade: number;
}

export type TomMedida = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

/** Como a situação aparece: rótulo, tom e ícone (o tom nunca é o único indicador). */
export function situacaoMedida(m: Pick<MedidaDisciplinar, 'situacao'>): {
  rotulo: string;
  tom: TomMedida;
  icone: string;
} {
  switch (m.situacao) {
    case 'APLICADA':
      return { rotulo: 'Aplicada', tom: 'success', icone: 'pi-check-circle' };
    case 'CANCELADA':
      return { rotulo: 'Cancelada', tom: 'neutral', icone: 'pi-ban' };
  }
}

/** Dias corridos entre duas datas `yyyy-MM-dd` (fim − início). */
export function diasEntre(inicio: string, fim: string): number {
  const [a, b] = [inicio, fim].map((d) => {
    const [ano, mes, dia] = d.substring(0, 10).split('-').map(Number);
    return Date.UTC(ano, mes - 1, dia);
  });
  return Math.round((b - a) / 86_400_000);
}
