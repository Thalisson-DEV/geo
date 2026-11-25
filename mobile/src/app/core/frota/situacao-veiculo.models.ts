/** Situação do veículo para quem o usa (GET /v1/frota/app/veiculos/{id}/situacao). */
export type SituacaoOperacional = 'ATIVO' | 'EM_MANUTENCAO' | 'PARADO' | 'RESERVA' | 'BAIXADO';
export type SituacaoOrdem = 'PENDENTE' | 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
export type SituacaoPendencia = 'ABERTA' | 'OS_ABERTA' | 'RESOLVIDA_NA_HORA' | 'DESCARTADA';
export type SituacaoVencimento = 'SEM_VENCIMENTO' | 'VIGENTE' | 'A_VENCER' | 'VENCIDO';
export type Tom = 'ok' | 'atencao' | 'erro' | 'destaque' | 'neutro';

export interface OrdemVeiculo {
  id: string;
  numero: number;
  tipoManutencao: 'CORRETIVA' | 'PREVENTIVA';
  situacao: SituacaoOrdem;
  criticidade: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAIXA' | null;
  descricao: string | null;
  oficina: string | null;
  veiculoParado: boolean;
  abertaEm: string;
  agendadaPara: string | null;
  localAgendamento: string | null;
  previsaoTermino: string | null;
  fimReal: string | null;
}

export interface PendenciaVeiculo {
  id: string;
  item: string;
  situacao: SituacaoPendencia;
  numeroOrdem: number | null;
  desde: string;
}

export interface DocumentoVeiculo {
  tipo: string;
  /** Nome do tipo no cadastro do cliente; falta em pacote antigo. */
  tipoRotulo?: string | null;
  descricao: string | null;
  vencimento: string;
  situacao: SituacaoVencimento;
}

export interface SituacaoVeiculo {
  idVeiculo: string;
  placa: string;
  modelo: string | null;
  baseOperacional: string | null;
  situacao: SituacaoOperacional;
  medicaoAtual: number | null;
  medicaoAtualEm: string | null;
  unidadeMedicao: 'KM' | 'HORAS';
  condutorAtual: string | null;
  ordensAbertas: OrdemVeiculo[];
  ultimasConcluidas: OrdemVeiculo[];
  pendencias: PendenciaVeiculo[];
  documentos: DocumentoVeiculo[];
  /** As 5 lavagens mais recentes (sem valor), para o gestor conferir em campo. Ausente em respostas antigas. */
  ultimasLavagens?: { data: string; subtipo: string | null; lancadoPor: string | null }[];
  /** Planos preventivos próximos ou vencidos, do mais urgente para o menos. Ausente em respostas antigas. */
  preventivas?: PreventivaVeiculo[];
  /** Todos os documentos do veículo e dos implementos acoplados, com ou sem arquivo. Ausente em respostas antigas. */
  documentosDoConjunto?: DocumentoConjunto[];
}

/** CRLV, tacógrafo, laudo: o documento e, quando o escritório anexou, o arquivo para a fiscalização. */
export interface DocumentoConjunto {
  id: string;
  tipo: string;
  tipoRotulo?: string | null;
  descricao?: string | null;
  /** Placa do veículo ou identificação do implemento. */
  titular?: string | null;
  doImplemento?: boolean;
  vencimento?: string | null;
  situacao: SituacaoVencimento;
  /** Nulo quando o escritório não anexou o arquivo. */
  arquivoNome?: string | null;
  arquivoContentType?: string | null;
  arquivoTamanhoBytes?: number | null;
  /** Muda quando o arquivo é trocado; nulo sem arquivo. */
  versao?: string | null;
}

/** Documento que pode ser aberto no app (tem arquivo). */
export type DocumentoComArquivo = DocumentoConjunto & { arquivoNome: string; versao: string };

export function temArquivo(d: DocumentoConjunto): d is DocumentoComArquivo {
  return !!d.arquivoNome && !!d.versao;
}

/** PDF, imagem ou outro: decide como o visor mostra o arquivo. */
export function formatoArquivo(d: { arquivoNome?: string | null; arquivoContentType?: string | null }): 'pdf' | 'imagem' | 'outro' {
  const tipo = (d.arquivoContentType ?? '').toLowerCase();
  const nome = (d.arquivoNome ?? '').toLowerCase();
  if (tipo.includes('pdf') || nome.endsWith('.pdf')) return 'pdf';
  if (tipo.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/.test(nome)) return 'imagem';
  return 'outro';
}

/** Vencimento em palavras para qualquer documento (com ou sem data). */
export function situacaoVencimento(d: { vencimento?: string | null; situacao: SituacaoVencimento }): { rotulo: string; tom: Tom } {
  if (!d.vencimento || d.situacao === 'SEM_VENCIMENTO') return { rotulo: 'Sem vencimento', tom: 'neutro' };
  return situacaoDocumento({ tipo: '', descricao: null, vencimento: d.vencimento, situacao: d.situacao });
}

/** Revisão chegando: "Revisão 10 mil km" · "faltam 800 km"; com a OS já aberta, o número dela. */
export interface PreventivaVeiculo {
  plano: string;
  situacao: 'VENCIDA' | 'PROXIMA' | 'EM_DIA';
  falta: string;
  previsao: string | null;
  numeroOrdem: number | null;
}

const SITUACAO_VEICULO: Record<SituacaoOperacional, { rotulo: string; tom: Tom }> = {
  ATIVO: { rotulo: 'Liberado', tom: 'ok' },
  EM_MANUTENCAO: { rotulo: 'Em manutenção', tom: 'atencao' },
  PARADO: { rotulo: 'Parado', tom: 'erro' },
  RESERVA: { rotulo: 'Reserva', tom: 'neutro' },
  BAIXADO: { rotulo: 'Baixado', tom: 'erro' }
};

const TIPO_DOCUMENTO: Record<string, string> = {
  CRLV: 'CRLV', LICENCIAMENTO: 'Licenciamento', IPVA: 'IPVA', SEGURO: 'Seguro', TACOGRAFO: 'Aferição do tacógrafo', ANTT: 'ANTT',
  INSPECAO_VEICULAR: 'Inspeção veicular', LAUDO_IMPLEMENTO: 'Laudo do implemento', CONTRATO_LOCACAO: 'Contrato de locação', OUTRO: 'Outro'
};

/** Em palavras de quem dirige: o veículo está liberado, em manutenção ou parado (e por quê). */
export function resumoVeiculo(s: SituacaoVeiculo): { rotulo: string; tom: Tom; apoio: string } {
  const base = SITUACAO_VEICULO[s.situacao] ?? { rotulo: s.situacao, tom: 'neutro' as Tom };
  const parada = s.ordensAbertas.find((o) => o.veiculoParado && o.situacao !== 'CONCLUIDA');
  if (parada) {
    const previsao = parada.previsaoTermino ? ` · previsão ${quando(parada.previsaoTermino)}` : '';
    return { rotulo: 'Parado para manutenção', tom: 'erro', apoio: `OS ${parada.numero}${parada.oficina ? ' em ' + parada.oficina : ''}${previsao}` };
  }
  const vencidos = s.documentos.filter((d) => d.situacao === 'VENCIDO').length;
  if (vencidos && base.tom === 'ok') {
    return { rotulo: 'Documento vencido', tom: 'erro', apoio: `${vencidos} ${vencidos === 1 ? 'documento vencido' : 'documentos vencidos'}: avise o gestor da frota antes de sair.` };
  }
  const partes: string[] = [];
  if (s.ordensAbertas.length) partes.push(`${s.ordensAbertas.length} ${s.ordensAbertas.length === 1 ? 'manutenção em aberto' : 'manutenções em aberto'}`);
  const revisoes = (s.preventivas ?? []).filter((p) => p.situacao === 'VENCIDA' && !p.numeroOrdem).length;
  if (revisoes) partes.push(`${revisoes} ${revisoes === 1 ? 'revisão vencida' : 'revisões vencidas'}`);
  if (s.pendencias.length) partes.push(`${s.pendencias.length} ${s.pendencias.length === 1 ? 'problema apontado' : 'problemas apontados'}`);
  const tom: Tom = base.tom === 'ok' && partes.length ? 'atencao' : base.tom;
  return { rotulo: base.rotulo, tom, apoio: partes.length ? partes.join(' · ') : 'Nada em aberto para este veículo.' };
}

export function situacaoOrdem(o: OrdemVeiculo): { rotulo: string; tom: Tom; apoio: string } {
  switch (o.situacao) {
    case 'PENDENTE': return { rotulo: 'Aguardando agendamento', tom: 'atencao', apoio: `Aberta ${quando(o.abertaEm)}` };
    case 'AGENDADA': return {
      rotulo: 'Agendada', tom: 'destaque',
      apoio: [o.agendadaPara ? quando(o.agendadaPara) : null, o.localAgendamento ?? o.oficina].filter(Boolean).join(' · ')
    };
    case 'EM_ANDAMENTO': {
      const atrasada = !!o.previsaoTermino && new Date(o.previsaoTermino) < new Date();
      return {
        rotulo: atrasada ? 'Atrasada' : 'Em execução', tom: atrasada ? 'erro' : 'atencao',
        apoio: [o.oficina, o.previsaoTermino ? `previsão ${quando(o.previsaoTermino)}` : null].filter(Boolean).join(' · ')
      };
    }
    case 'CONCLUIDA': return { rotulo: 'Concluída', tom: 'ok', apoio: [o.fimReal ? quando(o.fimReal) : null, o.oficina].filter(Boolean).join(' · ') };
    default: return { rotulo: 'Cancelada', tom: 'neutro', apoio: '' };
  }
}

export function situacaoPendencia(p: PendenciaVeiculo): { rotulo: string; tom: Tom } {
  return p.situacao === 'OS_ABERTA'
    ? { rotulo: p.numeroOrdem ? `Na OS ${p.numeroOrdem}` : 'OS aberta', tom: 'destaque' }
    : { rotulo: 'Aguardando o gestor', tom: 'atencao' };
}

/** Com a OS aberta, a revisão já está encaminhada; sem ela, vencida pede atenção do gestor. */
export function situacaoPreventiva(p: PreventivaVeiculo): { rotulo: string; tom: Tom } {
  if (p.numeroOrdem) return { rotulo: `Na OS ${p.numeroOrdem}`, tom: 'destaque' };
  return p.situacao === 'VENCIDA' ? { rotulo: 'Vencida', tom: 'erro' } : { rotulo: 'Próxima', tom: 'atencao' };
}

export function situacaoDocumento(d: DocumentoVeiculo): { rotulo: string; tom: Tom } {
  const dias = Math.round((new Date(d.vencimento + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  if (d.situacao === 'VENCIDO') return { rotulo: dias === -1 ? 'Venceu ontem' : `Vencido há ${-dias} dias`, tom: 'erro' };
  if (d.situacao === 'A_VENCER') return { rotulo: dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`, tom: 'atencao' };
  return { rotulo: 'Em dia', tom: 'ok' };
}

export function nomeDocumento(d: { tipo: string; descricao?: string | null; tipoRotulo?: string | null }): string {
  return d.tipo === 'OUTRO' && d.descricao ? d.descricao : d.tipoRotulo ?? TIPO_DOCUMENTO[d.tipo] ?? d.tipo;
}

export function formatarMedicao(valor: number | null, unidade: 'KM' | 'HORAS'): string {
  if (valor == null) return '—';
  return `${valor.toLocaleString('pt-BR')} ${unidade === 'HORAS' ? 'h' : 'km'}`;
}

/** "Hoje às 14:30", "Amanhã às 08:00" ou "24/10 às 08:00". */
export function quando(iso: string): string {
  const data = new Date(iso);
  const dia = (d: Date) => d.toDateString();
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 86_400_000);
  const ontem = new Date(hoje.getTime() - 86_400_000);
  const rotulo = dia(data) === dia(hoje) ? 'hoje' : dia(data) === dia(amanha) ? 'amanhã' : dia(data) === dia(ontem) ? 'ontem'
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${rotulo} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Uma linha curta sobre os documentos, com o pior caso: "CRLV vencido", "IPVA vence em 5 dias", senão "3 em dia". */
export function resumoDocumentos(docs: DocumentoConjunto[]): { texto: string; tom: Tom } {
  if (!docs.length) return { texto: 'Nenhum documento cadastrado', tom: 'neutro' };
  const vencidos = docs.filter((d) => d.situacao === 'VENCIDO');
  if (vencidos.length) {
    return { texto: vencidos.length === 1 ? `${nomeDocumento(vencidos[0])} vencido` : `${vencidos.length} documentos vencidos`, tom: 'erro' };
  }
  const aVencer = docs.filter((d) => d.situacao === 'A_VENCER' && d.vencimento)
    .sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? ''));
  if (aVencer.length) {
    return { texto: `${nomeDocumento(aVencer[0])} ${situacaoVencimento(aVencer[0]).rotulo.toLowerCase()}`, tom: 'atencao' };
  }
  return { texto: docs.length === 1 ? '1 documento em dia' : `${docs.length} documentos em dia`, tom: 'ok' };
}

/** OS em aberto com o que ela já resolve: os problemas do checklist e a revisão que entraram nela. */
export interface OrdemNaFicha {
  ordem: OrdemVeiculo;
  problemas: PendenciaVeiculo[];
  revisoes: PreventivaVeiculo[];
}

/**
 * Ficha sem repetição: problema ou revisão que já está numa OS aberta aparece dentro da OS, e não
 * de novo nas listas de baixo. Nas listas ficam só os que ainda esperam decisão do gestor (ou cuja
 * OS não está entre as abertas, que continuam com o número dela).
 */
export function organizarFicha(s: SituacaoVeiculo): { ordens: OrdemNaFicha[]; problemas: PendenciaVeiculo[]; revisoes: PreventivaVeiculo[] } {
  const numeros = new Set(s.ordensAbertas.map((o) => o.numero));
  const naOrdem = (n: number | null) => n != null && numeros.has(n);
  const preventivas = s.preventivas ?? [];
  // A OS aberta a partir do checklist ou do plano já cita o item na descrição: não repete embaixo.
  const citado = (ordem: OrdemVeiculo, texto: string) => (ordem.descricao ?? '').toLowerCase().includes(texto.toLowerCase());
  // Quem deixa o veículo parado vem primeiro: é o que decide se ele pode rodar.
  const ordens = [...s.ordensAbertas].sort((a, b) => Number(b.veiculoParado) - Number(a.veiculoParado));
  return {
    ordens: ordens.map((ordem) => ({
      ordem,
      problemas: s.pendencias.filter((p) => p.numeroOrdem === ordem.numero && !citado(ordem, p.item)),
      revisoes: preventivas.filter((p) => p.numeroOrdem === ordem.numero && !citado(ordem, p.plano))
    })),
    problemas: s.pendencias.filter((p) => !naOrdem(p.numeroOrdem)),
    revisoes: preventivas.filter((p) => !naOrdem(p.numeroOrdem))
  };
}
