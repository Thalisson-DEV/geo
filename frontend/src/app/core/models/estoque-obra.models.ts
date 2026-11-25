/** Estoque por obra: o material de cada obra em caminhões e canteiros (change estoque-por-obra). */

export type CondicaoMaterial = 'NOVO' | 'SUCATA';

export interface LocalMaterialObra {
  idEstoque: string;
  nome: string;
  /** CAMPO (caminhão da equipe) ou CANTEIRO. */
  tipo: string;
  idEquipe?: string | null;
  condicao: CondicaoMaterial;
  quantidade: number;
}

export interface LinhaMaterialObra {
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade?: string | null;
  previsto: number;
  entregue: number;
  aplicado: number;
  comEquipes: number;
  devolvido: number;
  retirado: number;
  recebido: number;
  cedido: number;
  semMaterialDaObra: number;
  aplicadoSemSaldo: number;
  onde: LocalMaterialObra[];
}

export interface RastroEntreObras {
  id: string;
  dataHora: string;
  tipo: 'APLICACAO' | 'REMANEJAMENTO' | 'ESTORNO' | string;
  /** RECEBIDO/CEDIDO: entre obras; LIVRE: aplicado com material livre do caminhão; SEM_SALDO: sem o material no caminhão. */
  sentido: 'RECEBIDO' | 'CEDIDO' | 'LIVRE' | 'SEM_SALDO';
  codigo: string;
  descricao: string;
  unidade?: string | null;
  quantidade: number;
  idOutraObra?: string | null;
  numeroOutraObra?: string | null;
  local?: string | null;
  observacao?: string | null;
}

export interface MaterialDaObra {
  idObra: string;
  materiais: LinhaMaterialObra[];
  rastros: RastroEntreObras[];
}

export interface ParteDaObra {
  idObra: string;
  numero?: string | null;
  quantidade: number;
}

export interface MaterialNoLocal {
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade?: string | null;
  condicao: CondicaoMaterial;
  fisico: number;
  livre: number;
  obras: ParteDaObra[];
}

export interface SaldoPorObra {
  idEstoque: string;
  nome: string;
  tipo: string;
  idEquipe?: string | null;
  materiais: MaterialNoLocal[];
}

export interface ItemObraRequest {
  idMaterial: string;
  condicao?: CondicaoMaterial;
  idObra?: string | null;
  quantidade: number;
}

export interface DevolverSobraRequest {
  idOrigem: string;
  idAlmoxarifado: string;
  itens: ItemObraRequest[];
  observacao?: string | null;
}

export interface RemanejarRequest {
  idEstoque: string;
  idMaterial: string;
  condicao?: CondicaoMaterial;
  idObraOrigem?: string | null;
  idObraDestino?: string | null;
  quantidade: number;
  motivo: string;
}

export interface Canteiro {
  id: string;
  nome: string;
  idBaseOperacional: string;
  nomeBase?: string | null;
  referencia?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  materiais: number;
  ativo: boolean;
}

export interface CanteiroRequest {
  nome: string;
  idBaseOperacional: string;
  referencia?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface MovimentarCanteiroRequest {
  idEquipe: string;
  sentido: 'DEIXAR' | 'PEGAR';
  itens: ItemObraRequest[];
}
