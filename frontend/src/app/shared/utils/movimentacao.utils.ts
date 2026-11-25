import { GeoTone } from '@geo/ui';
import { MaterialResponse, MovimentacaoItemResponse, TipoMovimentacao } from '../../core/models/almoxarifado.models';

interface ApresentacaoTipo {
  readonly rotulo: string;
  readonly tom: GeoTone;
  readonly icone: string;
}

/** Rótulo, tom e ícone de cada tipo de movimentação: mesmos no relatório, no histórico e na prévia. */
export const TIPOS_MOVIMENTACAO: Record<TipoMovimentacao, ApresentacaoTipo> = {
  ENTRADA_AVULSA: { rotulo: 'Entrada avulsa', tom: 'success', icone: 'pi pi-plus-circle' },
  BAIXA_AVULSA: { rotulo: 'Baixa avulsa', tom: 'danger', icone: 'pi pi-trash' },
  TRANSFERENCIA: { rotulo: 'Transferência', tom: 'brand', icone: 'pi pi-arrow-right-arrow-left' },
  ENTREGA: { rotulo: 'Entrega', tom: 'info', icone: 'pi pi-truck' },
  DEVOLUCAO: { rotulo: 'Devolução', tom: 'brand', icone: 'pi pi-undo' },
  ESTORNO: { rotulo: 'Estorno', tom: 'warning', icone: 'pi pi-times-circle' },
  RETIRADA: { rotulo: 'Retirada', tom: 'info', icone: 'pi pi-sign-out' },
  APLICACAO: { rotulo: 'Aplicação', tom: 'neutral', icone: 'pi pi-wrench' }
};

export function rotuloTipoMovimentacao(tipo?: string | null): string {
  return TIPOS_MOVIMENTACAO[tipo as TipoMovimentacao]?.rotulo ?? (tipo ? tipo.replace(/_/g, ' ') : '—');
}

export function tomTipoMovimentacao(tipo?: string | null): GeoTone {
  return TIPOS_MOVIMENTACAO[tipo as TipoMovimentacao]?.tom ?? 'neutral';
}

export function iconeTipoMovimentacao(tipo?: string | null): string {
  return TIPOS_MOVIMENTACAO[tipo as TipoMovimentacao]?.icone ?? 'pi pi-tag';
}

/**
 * Nome do motivo para mostrar: o que veio do cadastro na resposta ({@code motivoRotulo}); sem ele, o código legível.
 * As opções dos formulários vêm do cadastro de motivos (ListasService), não daqui.
 */
export function rotuloMotivo(motivo?: string | null, rotulo?: string | null): string {
  if (rotulo) return rotulo;
  if (!motivo) return '—';
  const texto = motivo.replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const TOM_CONDICAO: Record<string, GeoTone> = {
  NOVO: 'neutral',
  USADO: 'info',
  RECUPERADO: 'brand',
  SUCATA: 'warning'
};

const ICONE_CONDICAO: Record<string, string> = {
  NOVO: 'pi-box',
  USADO: 'pi-history',
  RECUPERADO: 'pi-wrench',
  SUCATA: 'pi-trash'
};

/** Item sem condição é material novo (padrão do backend). */
export function rotuloCondicao(condicao?: string | null): string {
  const valor = condicao || 'NOVO';
  return valor.charAt(0) + valor.slice(1).toLowerCase();
}

export function iconeCondicao(condicao?: string | null): string {
  return ICONE_CONDICAO[condicao || 'NOVO'] ?? 'pi-box';
}

export function tomCondicao(condicao?: string | null): GeoTone {
  return TOM_CONDICAO[condicao || 'NOVO'] ?? 'neutral';
}

/**
 * Material de uma operação: o backend devolve um item por número de série, então um material
 * seriado vira várias linhas. Aqui elas viram uma só, com a quantidade somada e as séries juntas.
 */
export interface ItemMovimentacaoAgrupado {
  readonly chave: string;
  readonly material: MaterialResponse;
  readonly condicao: string;
  readonly quantidade: number;
  readonly series: readonly string[];
  readonly itens: readonly MovimentacaoItemResponse[];
  /** O que foi digitado em outra unidade (ex.: 30 KG), quando o grupo todo usou a mesma. */
  readonly quantidadeInformada?: number;
  readonly unidadeInformada?: string;
}

export function agruparItensPorMaterial(itens: readonly MovimentacaoItemResponse[] | null | undefined): ItemMovimentacaoAgrupado[] {
  const grupos = new Map<string, { material: MaterialResponse; condicao: string; quantidade: number; series: string[]; itens: MovimentacaoItemResponse[] }>();
  for (const item of itens ?? []) {
    const condicao = item.condicao || 'NOVO';
    const chave = `${item.material?.id ?? item.id}|${condicao}`;
    const grupo = grupos.get(chave) ?? { material: item.material, condicao, quantidade: 0, series: [], itens: [] };
    grupo.quantidade += item.quantidade || 0;
    if (item.numSerie) grupo.series.push(item.numSerie);
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return Array.from(grupos, ([chave, g]) => ({
    chave,
    material: g.material,
    condicao: g.condicao,
    quantidade: g.quantidade,
    series: [...g.series].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    itens: g.itens,
    ...informadoDoGrupo(g.itens)
  }));
}

/**
 * Quando todo o grupo foi digitado na mesma outra unidade (ex.: KG), soma o que foi digitado
 * para mostrar ao lado do convertido. Mistura de unidades não vira um número só.
 */
function informadoDoGrupo(itens: readonly MovimentacaoItemResponse[]): { quantidadeInformada?: number; unidadeInformada?: string } {
  const unidades = new Set(itens.map((i) => i.unidadeInformada ?? ''));
  if (unidades.size !== 1 || unidades.has('')) return {};
  const soma = itens.reduce((t, i) => t + (Number(i.quantidadeInformada) || 0), 0);
  return { quantidadeInformada: Math.round(soma * 1000) / 1000, unidadeInformada: [...unidades][0] };
}
