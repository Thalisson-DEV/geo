import {
  FotoRecebimentoChecklist,
  ModeloChecklist,
  ModeloChecklistRequest,
  ModoFotoPergunta,
  PerguntaChecklist,
  TipoRespostaChecklist
} from '../../../core/models/frota-checklist.models';

export const ROTULO_RESPOSTA: Record<TipoRespostaChecklist, string> = {
  OK_NOK: 'OK / Não OK',
  OPCOES: 'Escolher uma opção',
  TEXTO: 'Texto livre'
};

/** Linhas não vazias de um texto colado, sem repetir. */
export function linhas(texto: string): string[] {
  const vistas = new Set<string>();
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !vistas.has(l.toLowerCase()) && vistas.add(l.toLowerCase()));
}

/** Modo da foto, aceitando a pergunta antiga que só trazia o "foto no Não OK". */
export function modoFoto(p: Pick<PerguntaChecklist, 'modoFoto' | 'fotoNoNaoOk'>): ModoFotoPergunta {
  return p.modoFoto ?? (p.fotoNoNaoOk ? 'NAO_OK' : 'NUNCA');
}

/** Pergunta nova do tipo OK / Não OK. */
export function perguntaNova(texto: string, grupo: string | null = null): PerguntaChecklist {
  return { id: null, grupo, texto, tipoResposta: 'OK_NOK', fotoNoNaoOk: false, modoFoto: 'NUNCA', opcoes: [], motivos: [] };
}

/** "OK / Não OK · motivos: Queimado, Quebrado" ou "Opções: Bom, Careca (problema)". */
export function resumoResposta(p: PerguntaChecklist): string {
  if (p.tipoResposta === 'OK_NOK') {
    return p.motivos.length ? `OK / Não OK · motivos: ${p.motivos.map((m) => m.texto).join(', ')}` : 'OK / Não OK';
  }
  if (p.tipoResposta === 'OPCOES') {
    return 'Opções: ' + p.opcoes.map((o) => (o.indicaProblema ? `${o.texto} (problema)` : o.texto)).join(', ');
  }
  return 'Texto livre';
}

/** Insere a pergunta logo depois da última do mesmo grupo, para o grupo ficar junto no app. */
export function inserirNoGrupo(perguntas: PerguntaChecklist[], nova: PerguntaChecklist): PerguntaChecklist[] {
  const ultima = perguntas.map((p) => p.grupo ?? '').lastIndexOf(nova.grupo ?? '');
  if (ultima < 0 || !nova.grupo) return [...perguntas, nova];
  return [...perguntas.slice(0, ultima + 1), nova, ...perguntas.slice(ultima + 1)];
}

/** Grupos já usados, na ordem em que aparecem. */
export function gruposDe(perguntas: PerguntaChecklist[]): string[] {
  return [...new Set(perguntas.map((p) => p.grupo).filter((g): g is string => !!g))];
}

/**
 * O modelo inteiro para o PUT, com as perguntas e as fotos informadas. O servidor mantém o que
 * vem com id e desativa o que não vem, sem mexer nos checklists já preenchidos.
 */
export function requestDe(
  m: ModeloChecklist,
  perguntas: PerguntaChecklist[] = m.perguntas,
  fotos: FotoRecebimentoChecklist[] = m.fotosRecebimento
): ModeloChecklistRequest {
  return {
    nome: m.nome,
    tipo: m.tipo,
    instrucoes: m.instrucoes,
    exigeAssinatura: m.exigeAssinatura,
    idsTiposVeiculo: m.tiposVeiculo.map((t) => t.valor),
    idsTiposImplemento: m.tiposImplemento.map((t) => t.valor),
    perguntas: perguntas.map((p) => ({
      id: p.id,
      grupo: p.grupo,
      texto: p.texto,
      tipoResposta: p.tipoResposta,
      fotoNoNaoOk: p.tipoResposta === 'OK_NOK' && modoFoto(p) === 'NAO_OK',
      modoFoto: p.tipoResposta !== 'OK_NOK' && modoFoto(p) === 'NAO_OK' ? 'NUNCA' : modoFoto(p),
      opcoes: p.tipoResposta === 'OPCOES' ? p.opcoes : [],
      motivos: p.tipoResposta === 'OK_NOK' ? p.motivos : []
    })),
    fotosRecebimento: m.tipo === 'PRINCIPAL' ? fotos : []
  };
}
