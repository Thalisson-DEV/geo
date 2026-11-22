import { ModeloChecklist, PerguntaChecklist } from './supervisao.service';

/** Resposta enquanto a visita é preenchida: opções em `selecionadas`; texto, número e data em `valor`. */
export interface RespostaVisita {
  valor?: string;
  selecionadas?: string[];
}

export type RespostasVisita = Record<string, RespostaVisita>;

export const NAO_SE_APLICA = 'Não se aplica';

export type SituacaoResposta = 'CONFORME' | 'NAO_CONFORME' | 'INFORMADO' | null;

export function opcoesDe(p: PerguntaChecklist): string[] {
  return p.aceitaNaoSeAplica ? [...p.opcoes, NAO_SE_APLICA] : p.opcoes;
}

export function temOpcoes(p: PerguntaChecklist): boolean {
  return p.tipo === 'ESCOLHA_UNICA' || p.tipo === 'MULTIPLA_ESCOLHA';
}

export function respondida(r: RespostaVisita | undefined): boolean {
  return !!(r?.valor?.toString().trim() || r?.selecionadas?.length);
}

/**
 * A mesma regra do web e do relatório: só é não conformidade quando o modelo diz qual é a resposta conforme e a marcada
 * é outra. "Não se aplica" nunca é não conformidade; pergunta sem resposta conforme só fica "informada".
 */
export function situacao(p: PerguntaChecklist, r: RespostaVisita | undefined): SituacaoResposta {
  if (!respondida(r)) return null;
  const marcadas = r?.selecionadas ?? (r?.valor ? [r.valor] : []);
  if (marcadas.includes(NAO_SE_APLICA) || r?.valor === NAO_SE_APLICA) return 'INFORMADO';
  if (!p.opcaoConforme || !temOpcoes(p)) return 'INFORMADO';
  return marcadas.includes(p.opcaoConforme) ? 'CONFORME' : 'NAO_CONFORME';
}

/** Clicar na marcada desmarca; na escolha única a nova substitui a anterior. "Não se aplica" é sempre exclusiva. */
export function alternar(p: PerguntaChecklist, r: RespostaVisita | undefined, opcao: string): RespostaVisita {
  const atuais = r?.selecionadas ?? [];
  if (atuais.includes(opcao)) return { selecionadas: atuais.filter(o => o !== opcao) };
  if (p.tipo === 'ESCOLHA_UNICA' || opcao === NAO_SE_APLICA) return { selecionadas: [opcao] };
  return { selecionadas: [...atuais.filter(o => o !== NAO_SE_APLICA), opcao] };
}

export function perguntas(m: ModeloChecklist): PerguntaChecklist[] {
  return m.estrutura.grupos.flatMap(g => g.perguntas);
}

export function faltando(ps: PerguntaChecklist[], rs: RespostasVisita): PerguntaChecklist[] {
  return ps.filter(p => p.obrigatoria && !respondida(rs[p.id]));
}

/** Perguntas sem resposta que o modelo sabe responder como conforme (escolha única com resposta conforme). */
export function restantesConformes(ps: PerguntaChecklist[], rs: RespostasVisita): PerguntaChecklist[] {
  return ps.filter(p => p.tipo === 'ESCOLHA_UNICA' && !!p.opcaoConforme && !respondida(rs[p.id]));
}

export function marcarRestantesComoConforme(ps: PerguntaChecklist[], rs: RespostasVisita): RespostasVisita {
  const novas = { ...rs };
  for (const p of restantesConformes(ps, rs)) novas[p.id] = { selecionadas: [p.opcaoConforme!] };
  return novas;
}

export interface NaoConformidadeVisita { grupo: string; pergunta: PerguntaChecklist; resposta: string }

export function naoConformidades(m: ModeloChecklist, rs: RespostasVisita): NaoConformidadeVisita[] {
  return m.estrutura.grupos.flatMap(g => g.perguntas
    .filter(p => situacao(p, rs[p.id]) === 'NAO_CONFORME')
    .map(p => ({ grupo: g.titulo, pergunta: p, resposta: (rs[p.id]?.selecionadas ?? []).join(', ') })));
}

/** Corpo da visita para o servidor: opções em `selecionadas`; "Não se aplica" vira a marca própria. */
export function montarRespostas(m: ModeloChecklist, rs: RespostasVisita): { idPergunta: string; valor: string | null; selecionadas: string[]; naoSeAplica: boolean }[] {
  return perguntas(m).map(p => {
    const r = rs[p.id] ?? {};
    const naoSeAplica = r.valor === NAO_SE_APLICA || !!r.selecionadas?.includes(NAO_SE_APLICA);
    const comOpcoes = temOpcoes(p);
    return {
      idPergunta: p.id,
      valor: naoSeAplica || comOpcoes ? null : r.valor?.trim() || null,
      selecionadas: comOpcoes && !naoSeAplica ? r.selecionadas ?? [] : [],
      naoSeAplica,
    };
  });
}
