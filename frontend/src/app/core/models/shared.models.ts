export interface PageMetadata {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface PagedResponse<T> {
  content: T[];
  page: PageMetadata;
}

export interface CampoAlterado {
  campo: string;
  valorAnterior?: any;
  valorNovo?: any;
}

export interface AlteracaoLog {
  logId: string;
  dataAlteracao: string;
  operacao: 'INSERT' | 'UPDATE' | 'DELETE';
  usuario: string;
  camposAlterados: CampoAlterado[];
}

export interface AuditLogResponse {
  registroId: string;
  tabela: string;
  alteracoes: AlteracaoLog[];
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** Contrato (RFC 9457): `[{ field, message, code }]`. O formato antigo (mapa) segue aceito. */
  errors?: { field: string; message: string; code?: string }[] | { [key: string]: string[] };
  erros?: Record<string, string>;
  code?: string;
  retryAfter?: number;
}

export function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;

  const problem = error?.error as ProblemDetails;

  // Contrato: lista de erros por campo. A mensagem do backend já diz o que corrigir; o nome
  // técnico do campo não ajuda quem lê o toast.
  if (Array.isArray(problem?.errors) && problem.errors.length > 0) {
    const [primeiro, ...outros] = problem.errors;
    if (primeiro?.message) {
      return outros.length > 0
        ? `${primeiro.message} (e mais ${outros.length} ${outros.length === 1 ? 'campo' : 'campos'})`
        : primeiro.message;
    }
  } else if (problem?.errors && !Array.isArray(problem.errors)) {
    const mapa = problem.errors as { [key: string]: string[] };
    const firstKey = Object.keys(mapa)[0];
    if (firstKey && mapa[firstKey].length > 0) {
      return `${firstKey}: ${mapa[firstKey][0]}`;
    }
  }

  if (problem?.erros) {
    const firstKey = Object.keys(problem.erros)[0];
    if (firstKey) return `${firstKey}: ${problem.erros[firstKey]}`;
  }

  // Status 0: a requisição nem chegou ao servidor. A mensagem do Angular ("Http failure response… 0 Unknown Error")
  // não diz nada a quem usa a tela.
  if (error?.status === 0) {
    return 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.';
  }

  return problem?.detail || problem?.title || error?.message || 'Ocorreu um erro inesperado.';
}

export function generateReferenceOptions(months: number = 24): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toLocaleString('pt-BR', { month: 'short' }).toUpperCase().replace('.', '');
    const year = d.getFullYear();
    const label = `${month}/${year}`;
    options.push({ label, value: label });
  }

  return options;
}
