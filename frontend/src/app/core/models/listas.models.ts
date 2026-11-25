/** Listas de opções que cada cliente ajusta no próprio cadastro (motivos, tipos, causas, naturezas). */
export type ListaConfiguravel =
  | 'OCORRENCIA_TURNO'
  | 'MOTIVO_MOVIMENTACAO_ESTOQUE'
  | 'TIPO_DOCUMENTO_VEICULO'
  | 'CAUSA_MANUTENCAO'
  | 'NATUREZA_SERVICO_FROTA';

export interface ContextoLista { codigo: string; rotulo: string }

export interface ListaConfiguravelResponse {
  lista: ListaConfiguravel;
  rotulo: string;
  descricao: string;
  /** Onde as opções podem valer (ex.: entrada e baixa avulsa); vazio quando a lista atende um formulário só. */
  contextos: ContextoLista[];
}

export interface OpcaoListaResponse {
  id: string;
  lista: ListaConfiguravel;
  codigo: string;
  rotulo: string;
  descricao?: string | null;
  ordem: number;
  /** Usada por regra do sistema: o nome muda, mas não pode ser desativada. */
  sistema: boolean;
  ativo: boolean;
  contextos: string[];
}

export interface OpcaoListaRequest { rotulo: string; descricao?: string; contextos?: string[] }

export interface OpcaoListaFilter { buscaGlobal?: string; ativo?: boolean; page?: number; size?: number; sort?: string }

/** Opção ativa para montar escolhas; {@code contextos} vazio vale em todos. */
export interface OpcaoAtiva { codigo: string; rotulo: string; contextos: string[] }

export function valeEm(opcao: OpcaoAtiva, contexto: string): boolean {
  return !opcao.contextos?.length || opcao.contextos.includes(contexto);
}

/**
 * Nome de cada código das listas configuráveis, usado por painéis e relatórios. Nasce com os nomes padrão (para
 * funcionar sem rede) e é completado pelo cadastro do cliente ao abrir o sistema ({@code ListasService.carregarRotulos}).
 * Os objetos são os mesmos o tempo todo: quem guardou a referência (ex.: ROTULO_MOTIVO) vê os nomes novos.
 */
export const ROTULOS_LISTAS: Record<ListaConfiguravel, Record<string, string>> = {
  OCORRENCIA_TURNO: {
    SEGURANCA: 'Segurança', CLIMA: 'Clima', MATERIAL: 'Falta de material', EQUIPAMENTO: 'Veículo ou equipamento',
    ACESSO: 'Acesso ao local', DESLIGAMENTO: 'Desligamento', TERCEIROS: 'Terceiros ou clientes',
    OBRA_EXECUTADA_POR_TERCEIROS: 'Obra já executada por terceiros', ALTERACAO_DE_PROJETO: 'Alteração de projeto pendente', OUTROS: 'Outros'
  },
  MOTIVO_MOVIMENTACAO_ESTOQUE: {
    AJUSTE_INVENTARIO: 'Ajuste de inventário', DEVOLUCAO_CAMPO: 'Devolução de campo', AQUISICAO_EXTRA: 'Aquisição extra',
    DOACAO_BONIFICACAO: 'Doação ou bonificação', PERDA_AVARIA: 'Perda ou avaria', DANIFICACAO: 'Danificação',
    SUCATEAMENTO: 'Sucateamento', OBSOLESCENCIA: 'Obsolescência', OUTROS: 'Outros'
  },
  TIPO_DOCUMENTO_VEICULO: {
    CRLV: 'CRLV', LICENCIAMENTO: 'Licenciamento', IPVA: 'IPVA', SEGURO: 'Seguro', TACOGRAFO: 'Aferição do tacógrafo', ANTT: 'ANTT',
    INSPECAO_VEICULAR: 'Inspeção veicular', LAUDO_IMPLEMENTO: 'Laudo do implemento', CONTRATO_LOCACAO: 'Contrato de locação', OUTRO: 'Outro'
  },
  CAUSA_MANUTENCAO: {
    AVARIA: 'Avaria', DESGASTE_NATURAL: 'Desgaste natural', USO_INDEVIDO: 'Uso indevido', SERVICO_CORRETIVO: 'Serviço corretivo',
    SERVICO_PREVENTIVO: 'Serviço preventivo', ESTOQUE: 'Estoque', SUBSTITUICAO_PNEUS: 'Substituição de pneus', SEM_CAUSA: 'Sem causa informada'
  },
  NATUREZA_SERVICO_FROTA: {
    COMPRA_E_REFORMA_DE_PNEUS: 'Compra e reforma de pneus', SUSPENSAO_FREIOS: 'Suspensão / freios', ARREFECIMENTO: 'Arrefecimento',
    TRANSMISSAO: 'Transmissão', ELETRICA: 'Elétrica', CHAPARIA_E_PINTURA: 'Chaparia e pintura', GUINCHO: 'Guincho', HIDRAULICA: 'Hidráulica',
    TAPECARIA: 'Tapeçaria', LAVAGEM_E_LUBRIFICACAO: 'Lavagem e lubrificação', ACESSORIOS: 'Acessórios', BATERIA: 'Bateria',
    BORRACHARIA: 'Borracharia', MECANICA: 'Mecânica', PNEUMATICA: 'Pneumática', POSTO_DE_MOLAS: 'Posto de molas',
    REFRIGERACAO_E_CLIMATIZACAO: 'Refrigeração e climatização', TACOGRAFO: 'Tacógrafo', TORNEADORA: 'Torneadora'
  }
};

/** Nome do código na lista; sem cadastro, o código legível. */
export function rotuloDaLista(lista: ListaConfiguravel, codigo: string | null | undefined): string {
  if (!codigo) return '—';
  const nome = ROTULOS_LISTAS[lista][codigo];
  if (nome) return nome;
  const texto = codigo.replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Opções de filtro (rótulo, código) de uma lista, mantidas no mesmo array: quem guardou a referência vê as opções do
 * cadastro assim que elas chegam.
 */
export const OPCOES_FILTRO_LISTAS: Record<ListaConfiguravel, { label: string; value: string }[]> = {
  OCORRENCIA_TURNO: [], MOTIVO_MOVIMENTACAO_ESTOQUE: [], TIPO_DOCUMENTO_VEICULO: [], CAUSA_MANUTENCAO: [], NATUREZA_SERVICO_FROTA: []
};
for (const lista of Object.keys(ROTULOS_LISTAS) as ListaConfiguravel[]) {
  OPCOES_FILTRO_LISTAS[lista].push(...Object.entries(ROTULOS_LISTAS[lista]).filter(([c]) => c !== 'SEM_CAUSA').map(([c, r]) => ({ label: r, value: c })));
}
