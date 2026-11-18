import { Observable } from 'rxjs';
import { GeoTone } from '../../core';

/** Identificador de item no navegador */
export type GeoReportNavigatorItemId = string | number;

/** Opção de seletor segmentado (escopo/tipo) ou ordenação */
export interface GeoReportNavigatorOption<T = unknown> {
  label: string;
  value: T;
  icon?: string;
}

/** Chip de filtro rápido de status */
export interface GeoReportNavigatorChip<T = unknown> {
  label: string;
  value: T | null;
  tone?: GeoTone;
  icon?: string;
}

/** Configuração visual e comportamental do navegador */
export interface GeoReportNavigatorConfig {
  /** Título do navegador quando expandido (string ou função reativa aos critérios) */
  title: string | ((criteria: GeoReportNavigatorCriteria) => string);
  /** Eyebrow no header (padrão: "Navegador") */
  eyebrow?: string;
  /** Ícone do cabeçalho (classe CSS PrimeIcons ou função reativa) */
  icon: string | ((criteria: GeoReportNavigatorCriteria) => string);
  /** Opções de seletor de tipo / escopo (ex: Ambos, Compras, Pagamentos) */
  scopeOptions?: readonly GeoReportNavigatorOption[];
  /** Placeholder do campo de busca */
  searchPlaceholder?: string;
  /** Label de acessibilidade do campo de busca */
  searchLabel?: string;
  /** Chips de filtro rápido (status) */
  statusChips?: readonly GeoReportNavigatorChip[];
  /** Opções de ordenação */
  sortOptions?: readonly GeoReportNavigatorOption<string>[];
  /** Habilitar toggle "Minhas" */
  showMineToggle?: boolean;
  /** Label do toggle "Minhas" (default: "Minhas") */
  mineToggleLabel?: string;
  /** Título/Tooltip do toggle "Minhas" */
  mineToggleTitle?: string;
  /** Label do botão de limpar filtros (default: "Limpar") */
  clearFiltersLabel?: string;
  /** Label do link para listagem completa (default: "Ver todas") */
  listAllLabel?: string;
  /** Tooltip do link para listagem completa (default: "Abrir página completa com tabela") */
  listAllTooltip?: string;
  /** Função de formatação do total de registros */
  totalLabel?: (total: number) => string;
}

/** Critérios de busca e filtros passados ao data source */
export interface GeoReportNavigatorCriteria {
  search: string;
  scope?: unknown;
  status?: unknown;
  sort?: string;
  mine?: boolean;
}

/** Página de itens retornada pelo data source */
export interface GeoReportNavigatorPage<T = unknown> {
  items: T[];
  totalElements: number;
}

/** Estrutura normalizada para renderizar um card no navegador */
export interface GeoReportNavigatorItem {
  id: GeoReportNavigatorItemId;
  /** Identificador curto / número (Linha 1, ex: "#1024", "OB-001") */
  number?: string;
  /** Pill opcional no topo (Linha 1, ex: "Compra", "Adição", "Entrada") */
  typePill?: {
    label: string;
    icon?: string;
    variant?: 'compra' | 'pagamento' | 'info' | 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | string;
  };
  /** Valor monetário ou destaque à direita (Linha 1, ex: "R$ 1.500,00", "45 itens") */
  value?: string | number | null;
  /** Título principal / Descrição (Linha 2) */
  title: string;
  /** Status exibido com GeoStatus (Linha 3) */
  status?: {
    label: string;
    tone?: GeoTone;
    /** Ícone da situação (PrimeIcons). Sem ele, a tag usa o ícone do tom. */
    icon?: string;
  };
  /** Autor / Solicitante / Equipe (Linha 3) */
  metaAuthor?: {
    label: string;
    icon?: string;
    title?: string;
  };
  /** Data / Hora (Linha 3) */
  metaDate?: {
    date: string | Date | null | undefined;
    format?: string;
    title?: string;
  };
  /** Metadado adicional opcional (Linha 3) */
  metaExtra?: {
    label: string;
    icon?: string;
    title?: string;
  };
  /** Objeto bruto do domínio original */
  raw?: unknown;
}

/** Contrato que todo data source de relatório implementa */
export interface GeoReportNavigatorDataSource<T = unknown> {
  /** Configuração declarativa do cabeçalho, filtros e botões */
  readonly config: GeoReportNavigatorConfig;
  /** Valores iniciais opcionais dos critérios */
  readonly initialCriteria?: Partial<GeoReportNavigatorCriteria>;
  /** Carrega uma página de dados baseada nos critérios informados */
  load(criteria: GeoReportNavigatorCriteria): Observable<GeoReportNavigatorPage<T>>;
  /** Converte a entidade de domínio para a representação do card */
  toItem(raw: T): GeoReportNavigatorItem;
  /** Retorna os comandos do Router para navegar ao item selecionado */
  getRouteForItem(item: GeoReportNavigatorItem | T): any[] | string;
  /** Retorna os comandos do Router para o botão "Ver todas" */
  getListRoute(): any[] | string;
  /** Busca item específico por ID caso precise ser injetado fora da 1ª página (opcional) */
  loadById?(id: GeoReportNavigatorItemId): Observable<T | null>;
}
