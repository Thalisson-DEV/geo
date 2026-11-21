import { Page, Route, Request, BrowserContext, expect } from '@playwright/test';

/**
 * Backend falso para os E2E. Guarda o estado do "servidor" e registra toda escrita
 * recebida, para os testes afirmarem payload, cabeçalhos e (não) duplicação.
 *
 * Os formatos de resposta espelham o que `SyncService`/`TurnoService` consomem hoje
 * (characterization): mudar um formato aqui é mudar o contrato.
 */

export type Perfil = 'CAMPO' | 'ADMINISTRATIVO';

export interface EscritaRecebida {
  method: string;
  path: string;
  body: unknown;
  idempotencyKey: string | null;
  authorization: string | null;
}

export interface MockOptions {
  perfil?: Perfil;
  turnoAberto?: boolean;
  /** Token expira em N segundos (padrão: 8h). */
  expiraEmSegundos?: number;
  /** Execuções já registradas no servidor (histórico da equipe), espalhadas nos últimos dias. */
  /** Transferências já sincronizadas do estoque da equipe (histórico grande para os testes de lista). */
  transferencias?: number;
  /** Encarregado de equipe de Obras (perfil EQUIPE_OBRAS) ou supervisor de Obras (administrativo). */
  obras?: boolean;
}

export const IDS = {
  usuario: 'u-encarregado-1',
  equipe: 'e-1',
  estoque: 'est-1',
  turno: 't-1',
  veiculo: 'v-1',
  colaboradores: ['c-1', 'c-2'],
  materiais: ['m-cabo', 'm-medidor'],
} as const;

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** JWT não assinado: o app só decodifica (jwt-decode), quem valida é o backend. */
export function fakeJwt(perfil: Perfil, expiraEmSegundos = 8 * 3600, permissions: string[] = []): string {
  const payload = {
    permissions,
    sub: IDS.usuario,
    nome: perfil === 'CAMPO' ? 'José Encarregado' : 'Ana Técnica SST',
    equipeId: perfil === 'CAMPO' ? IDS.equipe : undefined,
    estoqueId: perfil === 'CAMPO' ? IDS.estoque : undefined,
    roles: [],
    tipoUsuario: perfil,
    exp: Math.floor(Date.now() / 1000) + expiraEmSegundos,
  };
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.assinatura-falsa`;
}

const page = <T>(content: T[]) => ({
  content,
  page: { size: 500, number: 0, totalElements: content.length, totalPages: 1 },
});

export class MockApi {
  readonly escritas: EscritaRecebida[] = [];
  perfil: Perfil;
  turnoAberto: boolean;
  /** Quando true, toda chamada /api responde como falha de rede. */
  offline = false;
  /** Inspeções aceitas pelo POST; o GET /minhas devolve as mesmas, como o servidor real. */
  readonly inspecoesCriadas: Record<string, unknown>[] = [];
  /** Desvios atribuídos ao usuário (tela Desvios, consulta online). */
  readonly desvios: { id: string; status: string; [campo: string]: unknown }[] = [
    { id: 'dv-a', idInspecao: 'ins-1', dataInspecao: '2026-10-01', processo: { id: 'pr-1', nome: 'Comercial' },
      baseOperacional: { id: 'b-1', nome: 'Base Fortaleza' }, equipe: { id: 'e-1', codigo: 'EQ-101', nome: 'Equipe 101' },
      idPergunta: 'p-1', pergunta: 'Usa capacete com jugular?', gravidade: 'ALTA', descricao: 'Capacete sem jugular',
      acaoCorretiva: null, prazo: '2026-10-05', status: 'ABERTO', dataResolucao: null, vencido: true, anexos: [] },
    { id: 'dv-b', idInspecao: 'ins-1', dataInspecao: '2026-10-01', processo: { id: 'pr-1', nome: 'Comercial' },
      baseOperacional: { id: 'b-1', nome: 'Base Fortaleza' }, equipe: { id: 'e-1', codigo: 'EQ-101', nome: 'Equipe 101' },
      idPergunta: 'p-2', pergunta: 'Luvas isolantes em bom estado?', gravidade: 'CRITICA', descricao: 'Luva com furo',
      acaoCorretiva: 'Trocar a luva', prazo: '2099-12-31', status: 'EM_TRATAMENTO', dataResolucao: null, vencido: false, anexos: [] },
  ];
  /**
   * Token de acesso vencido no servidor: chamadas autenticadas com o token antigo recebem
   * 401 TOKEN_EXPIRADO. Um token obtido em /v1/auth/refresh volta a ser aceito.
   */
  sessaoExpirada = false;
  /** A sessão do aparelho acabou no servidor: /v1/auth/refresh responde SESSAO_INVALIDA. */
  sessaoEncerrada = false;
  /** Último token emitido pela renovação (aceito mesmo com `sessaoExpirada`). */
  private tokenRenovado: string | null = null;
  /** Há cookie de sessão no navegador (houve login e não houve logout), como no backend real. */
  private cookieDeSessao = false;
  private renovacoes = 0;
  private readonly expiraEm: number;
  private readonly transferencias: number;
  private readonly recebidas = new Map<string, unknown>();

  constructor(opts: MockOptions = {}) {
    this.perfil = opts.perfil ?? 'CAMPO';
    this.turnoAberto = opts.turnoAberto ?? true;
    this.expiraEm = opts.expiraEmSegundos ?? 8 * 3600;
    this.transferencias = opts.transferencias ?? 0;
    this.obras = opts.obras ?? false;
  }

  /** Transferências sincronizadas, 1 a cada 20 min para trás (formato do resumo de /v1/movimentacoes-estoque). */
  private transferenciasHistorico() {
    const agora = Date.now();
    return Array.from({ length: this.transferencias }, (_, i) => ({
      idReferenciaOperacao: `tr-${i}`,
      estoqueOrigem: { id: IDS.estoque },
      estoqueDestino: { id: 'est-dep' },
      dataHora: new Date(agora - (i + 1) * 20 * 60_000).toISOString(),
      itens: [{ material: { id: 'm-cabo' }, quantidade: (i % 5) + 1, condicao: 'NOVO', numSerie: null }],
    }));
  }

  get token(): string {
    return fakeJwt(this.perfil, this.expiraEm, this.permissoes());
  }

  private permissoes(): string[] {
    if (!this.obras) return [];
    return this.perfil === 'CAMPO'
      ? ['obras:turno:read', 'obras:turno:write', 'obras:execucao:write', 'obras:campo:read']
      : ['obras:campo:read', 'obras:central:read', 'obras:documentacao:write'];
  }

  /** Registros de Obras recebidos pelo envio durável, na ordem de chegada (um por id do aparelho). */
  readonly operacoesObras: { tipo: string; payload: Record<string, unknown>; anexos: unknown[] }[] = [];
  private readonly respostasObras = new Map<string, unknown>();
  /** Recusa do servidor por tipo de registro (ex.: programação cancelada enquanto a equipe estava sem sinal). */
  recusarObras: Partial<Record<string, string>> = {};
  /** O pacote devolve a programação #12 como cancelada (removida da agenda). */
  programacaoCancelada = false;
  readonly obras: boolean;

  escritasEm(path: string | RegExp): EscritaRecebida[] {
    return this.escritas.filter(e => (typeof path === 'string' ? e.path === path : path.test(e.path)));
  }

  /**
   * @param conviteInstalacao `false` (padrão): o convite "Instale o app" já vem adiado,
   *   porque os testes rodam no navegador e ele cobriria a tela. Specs do convite passam `true`.
   */
  async install(target: Page | BrowserContext, { conviteInstalacao = false } = {}): Promise<void> {
    if (!conviteInstalacao) {
      await target.addInitScript(() => {
        try { localStorage.setItem('geo_instalar_adiado_em', String(Date.now())); } catch { /* sem storage */ }
      });
    }
    await target.route('**/api/**', (route, request) => this.handle(route, request));
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  }

  private async handle(route: Route, request: Request): Promise<void> {
    if (this.offline) return route.abort('internetdisconnected');

    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (method !== 'GET') {
      let body: unknown = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      this.escritas.push({
        method,
        path,
        body,
        idempotencyKey: request.headers()['idempotency-key'] ?? null,
        authorization: request.headers()['authorization'] ?? null,
      });
    }

    if (path === '/v1/auth/login') {
      this.sessaoExpirada = false;
      this.sessaoEncerrada = false;
      this.tokenRenovado = null;
      this.cookieDeSessao = true;
      return this.json(route, 200, { token: this.token });
    }
    if (path === '/v1/auth/logout') {
      this.cookieDeSessao = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/v1/auth/refresh') {
      if (this.sessaoEncerrada || !this.cookieDeSessao) {
        return this.json(route, 401, { title: 'Sessão Encerrada', detail: 'Sua sessão expirou. Entre novamente.', code: 'SESSAO_INVALIDA' });
      }
      this.renovacoes++;
      this.tokenRenovado = fakeJwt(this.perfil, 8 * 3600 + this.renovacoes, this.permissoes());
      return this.json(route, 200, { token: this.tokenRenovado });
    }
    const autorizacao = request.headers()['authorization'] ?? '';
    if (this.sessaoExpirada && autorizacao !== `Bearer ${this.tokenRenovado}`) {
      return this.json(route, 401, { title: 'Token Expirado', detail: 'O token de acesso expirou.', code: 'TOKEN_EXPIRADO' });
    }

    // ---------- Turno ----------
    if (path === `/v1/turnos/equipe/${IDS.equipe}/ativo`) {
      return this.turnoAberto
        ? this.json(route, 200, {
            id: IDS.turno, idEquipe: IDS.equipe, idUsuarioAbertura: IDS.usuario,
            dataInicio: new Date().toISOString(), status: 'ABERTO',
          })
        : this.json(route, 404, { title: 'Sem turno', detail: 'Nenhum turno aberto.' });
    }
    if (path === '/v1/turnos/abrir' && method === 'POST') {
      this.turnoAberto = true;
      return this.json(route, 201, {
        id: IDS.turno, idEquipe: IDS.equipe, idUsuarioAbertura: IDS.usuario,
        dataInicio: new Date().toISOString(), idVeiculo: IDS.veiculo, idsColaboradores: [...IDS.colaboradores],
      });
    }
    if (/^\/v1\/turnos\/[^/]+\/fechar$/.test(path)) {
      this.turnoAberto = false;
      return this.json(route, 200, { id: IDS.turno, status: 'FECHADO' });
    }
    if (path === '/v1/turnos/minha-equipe/composicao') {
      return this.json(route, 200, {
        composicao: {
          idEquipe: IDS.equipe, codigo: 'EQ-101',
          veiculo: { id: IDS.veiculo, placa: 'ABC1D23', modelo: 'Strada' },
          membros: [
            { idColaborador: 'c-1', nome: 'José Encarregado', funcao: 'Encarregado', responsavel: true },
            { idColaborador: 'c-2', nome: 'Maria Eletricista', funcao: 'Eletricista', responsavel: false },
          ],
          },
        usuarioResponsavel: true,
        opcoes: {
          colaboradores: [
            { id: 'c-1', nome: 'José Encarregado', funcao: 'Encarregado', equipeAtual: 'EQ-101', responsavelEmOutraEquipe: false },
            { id: 'c-2', nome: 'Maria Eletricista', funcao: 'Eletricista', equipeAtual: 'EQ-101', responsavelEmOutraEquipe: false },
            { id: 'c-3', nome: 'Pedro Ajudante', funcao: 'Ajudante', equipeAtual: 'EQ-200', responsavelEmOutraEquipe: false },
            { id: 'c-4', nome: 'Rita Líder', funcao: 'Encarregada', equipeAtual: 'EQ-300', responsavelEmOutraEquipe: true },
          ],
          veiculos: [{ id: IDS.veiculo, placa: 'ABC1D23', modelo: 'Strada' }, { id: 'v-2', placa: 'XYZ9K87', modelo: 'Saveiro' }],
        },
      });
    }

    // ---------- Equipe ----------
    if (path === `/v1/equipes/${IDS.equipe}`) {
      return this.json(route, 200, {
        id: IDS.equipe, codigo: 'EQ-101', tipoEquipe: { nome: 'Leve' }, processo: { nome: 'Obras' },
        baseOperacional: { id: 'b-1', nome: 'Base Fortaleza' }, veiculo: { id: IDS.veiculo },
        membros: [{ idColaborador: 'c-1' }, { idColaborador: 'c-2' }],
      });
    }
    if (path === `/v1/equipes/${IDS.equipe}/membros`) {
      return this.json(route, 200, [
        { idColaborador: 'c-1', idUsuario: IDS.usuario, nomeColaborador: 'José Encarregado', funcao: { nome: 'Encarregado' }, vinculoAtivo: true },
        { idColaborador: 'c-2', idUsuario: 'u-2', nomeColaborador: 'Maria Eletricista', funcao: { nome: 'Eletricista' }, vinculoAtivo: true },
      ]);
    }

    // ---------- Catálogos ----------
    if (path === '/v1/materiais') {
      return this.json(route, 200, page([
        { id: 'm-cabo', codigo: 'CB-10', descricao: 'Cabo concêntrico 10mm', unidadeMedida: 'M', detalhaSerie: false },
        { id: 'm-medidor', codigo: 'MD-01', descricao: 'Medidor monofásico', unidadeMedida: 'UN', detalhaSerie: true },
      ]));
    }
    if (path === '/v1/estoques') {
      return this.json(route, 200, page([
        { id: IDS.estoque, nomeIdentificador: 'Caminhão EQ-101', tipoEstoque: { nome: 'CAMPO' }, idEquipe: IDS.equipe, ativo: true },
        { id: 'est-dep', nomeIdentificador: 'Almoxarifado Central', tipoEstoque: { nome: 'FISICO' }, ativo: true },
        { id: 'est-dep2', nomeIdentificador: 'Almoxarifado Caucaia', tipoEstoque: { nome: 'FISICO' }, ativo: true },
      ]));
    }
    if (path === '/v1/saldos') {
      return this.json(route, 200, page([
        { id: 's-1', estoque: { id: IDS.estoque }, material: { id: 'm-cabo', codigo: 'CB-10', descricao: 'Cabo concêntrico 10mm', unidadeMedida: 'M', detalhaSerie: false }, quantidade: 100, ativo: true, condicao: 'NOVO' },
        { id: 's-2', estoque: { id: IDS.estoque }, material: { id: 'm-medidor', codigo: 'MD-01', descricao: 'Medidor monofásico', unidadeMedida: 'UN', detalhaSerie: true }, quantidade: 2, ativo: true, condicao: 'NOVO' },
      ]));
    }
    if (path === '/v1/saldos/seriais') {
      return this.json(route, 200, page([
        { id: 'ss-1', estoque: { id: IDS.estoque }, material: { id: 'm-medidor' }, numSerie: 'SN-0001', ativo: true, condicao: 'NOVO' },
        { id: 'ss-2', estoque: { id: IDS.estoque }, material: { id: 'm-medidor' }, numSerie: 'SN-0002', ativo: true, condicao: 'NOVO' },
      ]));
    }

    if (path === '/v1/movimentacoes-estoque' && method === 'GET' && url.searchParams.get('tipo') === 'TRANSFERENCIA') {
      return this.json(route, 200, page(this.transferenciasHistorico()));
    }

    // ---------- SST (técnico administrativo) ----------
    if (path === '/v1/sst/tipos-inspecao/opcoes') {
      return this.json(route, 200, [{ id: 'ti-1', nome: 'Campo', ordem: 1, ativo: true }, { id: 'ti-2', nome: 'Base', ordem: 2, ativo: true }]);
    }
    if (path === '/v1/sst/formularios-inspecao') {
      return this.json(route, 200, page([{ id: 'f-1', titulo: 'Checklist de EPI', descricao: 'Uso de equipamentos de proteção', ativo: true, totalPerguntas: 2 }]));
    }
    if (path === '/v1/sst/formularios-inspecao/f-1') {
      return this.json(route, 200, {
        id: 'f-1', titulo: 'Checklist de EPI', descricao: 'Uso de equipamentos de proteção', ativo: true, emUso: true,
        grupos: [{ id: 'g-1', titulo: 'Proteção individual', ordem: 1, perguntas: [
          { id: 'p-1', enunciado: 'Capacete em uso?', tipoResposta: 'MULTIPLA_ESCOLHA', obrigatoria: true, ordem: 1, opcoes: [
            { id: 'o-sim', texto: 'Sim', geraDesvio: false, gravidade: null, ordem: 1 },
            { id: 'o-nao', texto: 'Não', geraDesvio: true, gravidade: 'ALTA', ordem: 2 },
          ] },
          { id: 'p-2', enunciado: 'Observação do inspetor', tipoResposta: 'TEXTO', obrigatoria: false, ordem: 2, opcoes: [] },
        ] }],
      });
    }
    if (path === '/v1/bases-operacionais') {
      return this.json(route, 200, page([{ id: 'b-1', nome: 'Base Fortaleza', latitude: -3.73, longitude: -38.52, raio: 500, ativo: true }]));
    }
    if (path === '/v1/equipes') {
      return this.json(route, 200, page([{ id: IDS.equipe, codigo: 'EQ-101', tipoEquipe: { nome: 'Leve' }, processo: { nome: 'Obras' },
        baseOperacional: { id: 'b-1', nome: 'Base Fortaleza' }, veiculo: { id: IDS.veiculo }, membros: [{ idColaborador: 'c-1' }, { idColaborador: 'c-2' }] }]));
    }
    if (path === '/v1/rh/colaboradores') {
      return this.json(route, 200, page([
        { id: 'c-1', nomeCompleto: 'José Encarregado', funcao: { nome: 'Encarregado' }, ativo: true },
        { id: 'c-2', nomeCompleto: 'Maria Eletricista', funcao: { nome: 'Eletricista' }, ativo: true },
      ]));
    }
    if (path === '/v1/processos-negocio') {
      return this.json(route, 200, page([{ id: 'pr-1', nome: 'Comercial', ativo: true }, { id: 'pr-2', nome: 'Manutenção', ativo: true }]));
    }
    if (path === '/v1/veiculos') {
      return this.json(route, 200, page([{ id: IDS.veiculo, placa: 'ABC1D23', modelo: 'Strada', fabricante: 'Fiat', ativo: true }]));
    }
    // ---------- Meus desvios (consulta online) ----------
    if (path === '/v1/sst/desvios/meus' && method === 'GET') {
      const pendentes = url.searchParams.get('apenasPendentes') === 'true';
      const status = url.searchParams.get('status');
      const lista = this.desvios.filter(d => (!pendentes || d.status !== 'RESOLVIDO') && (!status || d.status === status));
      return this.json(route, 200, { content: lista, page: { size: 20, number: 0, totalElements: lista.length, totalPages: 1 } });
    }
    const tratar = /^\/v1\/sst\/desvios\/meus\/([^/]+)\/tratamento$/.exec(path);
    if (tratar && method === 'PUT') {
      const d = this.desvios.find(x => x.id === tratar[1]);
      if (!d) return this.json(route, 404, { title: 'Não encontrado' });
      const corpo = this.escritas.at(-1)?.body as { status: string; acaoCorretiva?: string; prazo?: string };
      Object.assign(d, { status: corpo.status, acaoCorretiva: corpo.acaoCorretiva ?? d.acaoCorretiva, prazo: corpo.prazo ?? d.prazo });
      return this.json(route, 200, d);
    }
    if (path === '/v1/sst/inspecoes/minhas' && method === 'GET') {
      return this.json(route, 200, { content: this.inspecoesCriadas, page: { size: 50, number: 0, totalElements: this.inspecoesCriadas.length, totalPages: 1 } });
    }
    if (path === '/v1/sst/inspecoes/anexos' && method === 'POST') {
      const n = this.escritasEm('/v1/sst/inspecoes/anexos').length - 1;
      return this.json(route, 201, { id: `ev-${n}`, nomeArquivo: 'foto.jpg', contentType: 'image/jpeg', tamanhoBytes: 1000 });
    }
    if (path === '/v1/sst/inspecoes' && method === 'POST') {
      const corpo = (this.escritas.at(-1)?.body ?? {}) as {
        desvios?: { idPergunta: string; idOpcaoResposta: string; acaoCorretiva?: string; status?: string }[]; respostas?: unknown[];
        idFormulario?: string; idTipoInspecao?: string; idBaseOperacional?: string;
      };
      const criada = {
        id: 'insp-1', idInspetor: IDS.usuario, status: 'CONCLUIDA', dataRealizacao: new Date().toISOString(),
        formulario: { id: corpo.idFormulario }, tipoInspecao: { id: corpo.idTipoInspecao, nome: 'Checklist de EPI' },
        baseOperacional: { id: corpo.idBaseOperacional, nome: 'Base Fortaleza' },
        respostas: corpo.respostas ?? [], evidencias: [],
        desvios: (corpo.desvios ?? []).map((d, i) => ({ ...d, id: `dv-${i}`, status: d.status ?? 'ABERTO' })),
      };
      this.inspecoesCriadas.push(criada);
      return this.json(route, 201, criada);
    }

    // ---------- Escritas operacionais ----------
    if (path === '/v1/telemetria/mobile' && method === 'POST') {
      const lote = (this.escritas.at(-1)?.body ?? {}) as { eventos?: unknown[] };
      return this.json(route, 202, { recebidos: lote.eventos?.length ?? 0, descartados: 0 });
    }
    // ---------- Obras (app de campo) ----------
    if (path === '/v1/obras/campo/pacote') {
      return this.json(route, 200, pacoteObras(url.searchParams.get('desde'), this.programacaoCancelada));
    }
    if (/^\/v1\/obras\/campo\/obras\/[^/]+\/projeto$/.test(path)) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdfMinimo() });
    }
    if (path === '/v1/obras/campo/status-equipes') {
      return this.json(route, 200, [
        { idEquipe: IDS.equipe, codigo: 'EQ-101', status: 'EM_EXECUCAO', rotulo: 'Executando', idObraAtual: 'o-1', numeroObraAtual: '7000001',
          programacoesHoje: 1, concluidas: 0, aprsPendentes: 0, ocorrenciasImpeditivas: 0, ultimaAtividade: new Date().toISOString(), lider: 'José Encarregado' },
        { idEquipe: 'e-2', codigo: 'EQ-202', status: 'IMPEDIDA', rotulo: 'Sem condição de executar', programacoesHoje: 2, concluidas: 0,
          aprsPendentes: 1, ocorrenciasImpeditivas: 1, lider: 'Rita Líder' },
      ]);
    }
    if (path === '/v1/sincronizacao/operacoes' && method === 'POST') {
      const corpo = (this.escritas.at(-1)?.body ?? {}) as { idOperacaoLocal: string; tipo: string; payload: Record<string, unknown>; anexos?: unknown[] };
      if (corpo.tipo?.startsWith('OBRA_')) {
        const repetida = this.respostasObras.get(corpo.idOperacaoLocal);
        if (repetida) return this.json(route, 200, repetida);
        this.operacoesObras.push({ tipo: corpo.tipo, payload: corpo.payload, anexos: corpo.anexos ?? [] });
        const motivo = this.recusarObras[corpo.tipo];
        const resposta = motivo
          ? { idOperacaoLocal: corpo.idOperacaoLocal, tipo: corpo.tipo, status: 'EM_TRATAMENTO', backofficeInformado: true, idCaso: 'caso-obra', motivo, idsRegistros: [] }
          : { idOperacaoLocal: corpo.idOperacaoLocal, tipo: corpo.tipo, status: 'RESOLVIDO', backofficeInformado: false, idsRegistros: [`srv-${this.operacoesObras.length}`] };
        this.respostasObras.set(corpo.idOperacaoLocal, resposta);
        return this.json(route, motivo ? 201 : 202, resposta);
      }
    }
    if (path.startsWith('/v1/sincronizacao/operacoes')) {
      return method === 'GET' ? this.json(route, 404, { title: 'Não encontrada' }) : this.json(route, 201, { idCaso: 'caso-1' });
    }

    // Listas e catálogos não usados nos fluxos cobertos: vazio paginado.
    if (method === 'GET') return this.json(route, 200, page([]));
    return this.json(route, 501, { title: 'Sem mock', detail: `${method} ${path}` });
  }
}

/** Hoje em dd/MM/yyyy no fuso dos testes (Fortaleza). */
export function diaBr(somarDias = 0): string {
  const d = new Date(Date.now() + somarDias * 86_400_000);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** Pacote offline da equipe EQ-101: a programação #12 hoje (obra 7000001, 2 pontos) e a #13 amanhã. */
export function pacoteObras(desde: string | null, cancelada = false) {
  const hoje = diaBr();
  const amanha = diaBr(1);
  const p12 = {
    id: 'p-12', numero: 12, idObra: 'o-1', numeroObra: '7000001', inicio: hoje, fim: hoje, descricao: 'Implantar rede de baixa tensão',
    turno: 'DIA_TODO', linhaViva: false, desligamento: true, horaDesligamentoInicio: '08:00', horaDesligamentoFim: '12:00', numeroManobra: '4471',
    finalizaObra: false, situacaoIntervencao: 'CRIADO', observacao: null, situacao: 'PROGRAMADA', versao: 1,
    itens: [
      { idItem: 'i-1', idPonto: 'pt-4', local: 'P4', tipo: 'SERVICO', codigo: 'S1', descricao: 'Instalar poste', unidade: 'UN', kit: 'LMI-0168', quantidade: 1, executada: 0, status: 'PROGRAMADO' },
      { idItem: 'i-2', idPonto: 'pt-4', local: 'P4', tipo: 'MATERIAL', idMaterial: 'm-medidor', codigo: 'MD-01', descricao: 'Medidor monofásico', unidade: 'UN', kit: 'LMI-0168', quantidade: 4, executada: 0, status: 'PROGRAMADO' },
      { idItem: 'i-3', idPonto: 'pt-5', local: 'P5', tipo: 'SERVICO', codigo: 'S2', descricao: 'Lançar cabo', unidade: 'M', kit: 'LMI-0200', quantidade: 30, executada: 10, status: 'EM_ANDAMENTO' },
    ],
  };
  const p13 = { ...p12, id: 'p-13', numero: 13, inicio: amanha, fim: amanha, descricao: 'Ligação de ramal', desligamento: false,
    horaDesligamentoInicio: null, horaDesligamentoFim: null, numeroManobra: null,
    itens: [{ idItem: 'i-9', idPonto: 'pt-5', local: 'P5', tipo: 'SERVICO', codigo: 'S9', descricao: 'Ligar ramal', unidade: 'UN', quantidade: 1, executada: 0, status: 'PROGRAMADO' }] };
  return {
    geradoEm: new Date().toISOString(), desde, idEquipe: IDS.equipe, codigoEquipe: 'EQ-101', inicioJanela: hoje, fimJanela: diaBr(7),
    programacoes: cancelada ? [p13] : [p12, p13],
    programacoesRemovidas: cancelada ? ['p-12'] : [],
    obras: [{
      id: 'o-1', numero: '7000001', titulo: 'Rede Vila Nova', endereco: 'Rua das Flores, 100 - Vila Nova', referencia: 'Ao lado da escola',
      latitude: -3.7319, longitude: -38.5267, municipio: 'Fortaleza', projeto: { idAnexo: 'an-1', nome: 'projeto.pdf', tamanhoBytes: 900, hash: 'h1' },
      rotacoes: {}, idModeloFoto: 'mf-1', fotos: [], pendenciasFoto: [],
      pontos: [
        { id: 'pt-4', numero: '4', pagina: 1, x: 0.3, y: 0.4, tipo: 'POSTE', tipoExecucao: null, temPoda: false, temAterramento: false },
        { id: 'pt-5', numero: '5', pagina: 1, x: 0.6, y: 0.5, tipo: 'POSTE', tipoExecucao: null, temPoda: false, temAterramento: false },
      ],
      vaos: [],
    }],
    modeloApr: {
      riscos: ['Choque elétrico', 'Arco elétrico', 'Queda de altura', 'Queda de materiais ou ferramentas'],
      medidas: ['Desenergização', 'Bloqueio e aterramento', 'Sinalização e isolamento da área', 'EPI e EPC'],
      verificacoes: ['Conversa sobre os riscos feita com a equipe', 'Área sinalizada', 'Desligamento confirmado'],
      sugestoes: {
        SEMPRE: { riscos: ['Queda de materiais ou ferramentas'], medidas: ['Sinalização e isolamento da área', 'EPI e EPC'] },
        DESLIGAMENTO: { riscos: ['Choque elétrico', 'Arco elétrico'], medidas: ['Desenergização', 'Bloqueio e aterramento'] },
      },
    },
    modelosFoto: [{ id: 'mf-1', titulo: 'Book padrão', itens: [{ id: 'depois', titulo: 'Poste instalado', obrigatoria: true }] }],
    avisos: cancelada
      ? [{ id: 'ev-1', tipo: 'CANCELADA', idProgramacao: 'p-12', numeroProgramacao: 12, idObra: 'o-1', numeroObra: '7000001',
          texto: 'Programação #12 da obra 7000001 foi cancelada: desligamento negado.', em: new Date().toISOString() }]
      : [],
  };
}

/** PDF de uma página (A4 deitado) com uma linha, válido para o pdf.js. */
export function pdfMinimo(): Buffer {
  const conteudo = '0 0 1 RG 4 w 100 100 m 742 495 l S';
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
  ];
  let corpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((o, i) => { offsets.push(corpo.length); corpo += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
}

/**
 * Coloca o app no estado "usuário logado e sincronizado" pelo caminho real
 * (tela de login → /sync → dashboard), sem atalhos no IndexedDB.
 */
export async function loginPelaUi(p: Page, usuario = 'encarregado', timeout = 20_000): Promise<void> {
  await p.goto('/login');
  // A splash animada (~3 s na abertura a frio) cobre a tela e intercepta toques.
  await expect(p.locator('app-splash-screen > div')).toHaveCount(0, { timeout: 15_000 });
  await p.locator('#login').fill(usuario);
  await p.locator('#senha').fill('senha-secreta');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.waitForURL('**/hoje', { timeout });
}
