/** Condição do serviço que o app reconhece sozinho na programação do dia. */
export type CondicaoApr = 'SEMPRE' | 'DESLIGAMENTO' | 'LINHA_VIVA' | 'PODA' | 'ATERRAMENTO' | 'POSTE' | 'TRAFEGO';

export interface RiscoApr { id: string; texto: string; sugeridoEm: CondicaoApr[]; medidas: string[] }
export interface MedidaApr { id: string; texto: string; sugeridaEm: CondicaoApr[] }
/** {@code exigidaEm} vazio: a pergunta aparece em todo serviço. */
export interface VerificacaoApr { id: string; texto: string; exigidaEm: CondicaoApr[] }

export interface EstruturaApr { riscos: RiscoApr[]; medidas: MedidaApr[]; verificacoes: VerificacaoApr[] }

export interface ModeloAprResponse {
  estrutura: EstruturaApr;
  condicoes: { valor: CondicaoApr; rotulo: string }[];
  alteradoEm?: string | null;
  alteradoPor?: string | null;
}
