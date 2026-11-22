import {
  AprRascunho, EtapaFoto, FormularioApr, ItemCampo, ItemFoto, ModeloApr, ObraCampo, PontoCampo, ProgramacaoCampo, RegistroObraLocal, VaoCampo,
} from './obras.models';

/** Regras puras de Obras no app (sem Angular), testadas em `obras-regras.spec.ts`. */

/** dd/MM/yyyy → aaaa-mm-dd. */
export function isoDeBr(data: string): string {
  const [d, m, a] = data.split('/');
  return `${a}-${m}-${d}`;
}

/** Dia local de hoje (aaaa-mm-dd). */
export function hojeLocal(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** Programações que valem para o dia, na ordem da agenda (início, número). */
export function programacoesDoDia(programacoes: ProgramacaoCampo[], dia: string): ProgramacaoCampo[] {
  return programacoes
    .filter(p => p.situacao !== 'CANCELADA' && isoDeBr(p.inicio) <= dia && isoDeBr(p.fim) >= dia)
    .sort((a, b) => isoDeBr(a.inicio).localeCompare(isoDeBr(b.inicio)) || a.numero - b.numero);
}

// ---------- Situação de execução, aplicando o que a equipe já lançou no aparelho ----------

/** Quantidade executada de cada item, somando o servidor e os apontamentos ainda no aparelho. */
/**
 * Executado por item: o que o pacote trouxe mais o que o aparelho lançou e o pacote ainda não reflete. Enviado antes de o
 * último pacote chegar já vem em `executada`; enviado depois (com sinal, sai na hora) ainda conta aqui, senão o ponto
 * "desmarcava" logo depois do "Tudo feito".
 */
export function executadoPorItem(programacao: ProgramacaoCampo, registros: RegistroObraLocal[], pacoteRecebidoEm?: string | null): Map<string, number> {
  const mapa = new Map<string, number>(programacao.itens.map(i => [i.idItem, i.executada]));
  // A avulsa é montada no aparelho e o pacote nunca a atualiza: tudo o que foi lançado nela conta.
  const noPacote = (r: RegistroObraLocal) => !programacao.avulsa && r.envio === 'ENVIADO'
    && (!r.enviadoEm || !pacoteRecebidoEm || r.enviadoEm <= pacoteRecebidoEm);
  for (const r of registros) {
    if (r.tipo !== 'APONTAMENTO' || r.idProgramacao !== programacao.id || r.envio === 'CONFLITO' || noPacote(r)) continue;
    const c = r.comando as { pontoInteiro?: boolean; idPonto?: string; itens?: { idItem: string; quantidade: number }[] };
    if (c.pontoInteiro) {
      for (const i of programacao.itens) {
        if (i.idPonto === c.idPonto || i.idVao === c.idPonto) mapa.set(i.idItem, Math.max(mapa.get(i.idItem) ?? 0, i.quantidade));
      }
    } else {
      for (const l of c.itens ?? []) mapa.set(l.idItem, (mapa.get(l.idItem) ?? 0) + l.quantidade);
    }
  }
  return mapa;
}

export type SituacaoPonto = 'A_FAZER' | 'PARCIAL' | 'FEITO' | 'FORA';

export interface PontoDaExecucao {
  id: string;
  numero: string;
  rotulo: string;
  ponto?: PontoCampo;
  vao?: VaoCampo;
  itens: (ItemCampo & { feito: number })[];
  situacao: SituacaoPonto;
  pendenciasFoto: number;
}

/** Pontos (e vãos) com itens nesta programação, coloridos pela execução. */
export function pontosDaExecucao(programacao: ProgramacaoCampo, obra: ObraCampo | undefined, registros: RegistroObraLocal[],
                                 pendencias: PendenciaLocal[] = [], pacoteRecebidoEm?: string | null): PontoDaExecucao[] {
  const feito = executadoPorItem(programacao, registros, pacoteRecebidoEm);
  const grupos = new Map<string, (ItemCampo & { feito: number })[]>();
  for (const item of programacao.itens) {
    const id = item.idPonto ?? item.idVao;
    if (!id) continue;
    grupos.set(id, [...(grupos.get(id) ?? []), { ...item, feito: feito.get(item.idItem) ?? 0 }]);
  }
  const pontos = new Map((obra?.pontos ?? []).map(p => [p.id, p]));
  const vaos = new Map((obra?.vaos ?? []).map(v => [v.id, v]));
  return [...grupos.entries()].map(([id, itens]) => {
    const ponto = pontos.get(id);
    const vao = vaos.get(id);
    const rotulo = ponto ? `Ponto ${ponto.numero}` : vao
      ? `Vão ${pontos.get(vao.idPontoA)?.numero ?? '?'}–${pontos.get(vao.idPontoB)?.numero ?? '?'}`
      : itens[0]?.local ?? 'Local';
    const completo = itens.every(i => i.feito >= i.quantidade);
    const algum = itens.some(i => i.feito > 0);
    return {
      id, numero: ponto?.numero ?? rotulo, rotulo, ponto, vao, itens,
      situacao: completo ? 'FEITO' : algum ? 'PARCIAL' : 'A_FAZER',
      pendenciasFoto: pendencias.filter(p => p.idPonto === id).length,
    } satisfies PontoDaExecucao;
  }).sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
}

/** Resumo para o Hoje e a ficha: "3 de 5 pontos feitos". */
export function progressoDaProgramacao(pontos: PontoDaExecucao[]): { feitos: number; total: number } {
  return { feitos: pontos.filter(p => p.situacao === 'FEITO').length, total: pontos.length };
}

// ---------- Fotos: pendências do modelo ----------

export interface PendenciaLocal {
  idPonto: string; rotuloPonto: string; idItem: string; titulo: string;
  /** Presente quando o escritório reprovou a foto: o que estava errado, para a equipe refazer certo. */
  motivoReprovacao?: string | null;
}

/**
 * Fotos obrigatórias que faltam nos pontos já executados: o que o servidor apontou, menos as fotos tiradas no aparelho
 * desde então, mais os pontos feitos no aparelho que ainda não têm a foto.
 *
 * Foto que já tinha sido enviada quando o pacote chegou ({@code recebidoEm}) não cobre a pendência do servidor: se ele
 * ainda a pede, é porque o escritório reprovou aquela foto, e a equipe precisa ver isso (com o motivo) para refazer.
 */
export function pendenciasDeFoto(obra: ObraCampo, itensModelo: { id: string; titulo: string; obrigatoria: boolean }[],
                                 pontosFeitos: { id: string; rotulo: string }[], registros: RegistroObraLocal[],
                                 recebidoEm: string | null = null): PendenciaLocal[] {
  const fotosDaObra = registros.filter(r => r.tipo === 'EVIDENCIA' && r.idObra === obra.id);
  const chave = (r: RegistroObraLocal) => `${r.idPonto}|${(r.comando as { idItem?: string }).idItem}`;
  const tiradas = new Set(fotosDaObra.map(chave));
  for (const f of obra.fotos) tiradas.add(`${f.idVao ?? f.idPonto}|${f.idItem}`);
  // Para o que o servidor pede: só vale foto ainda não enviada ou enviada depois que o pacote chegou.
  const recebido = recebidoEm ? Date.parse(recebidoEm) : NaN;
  const depoisDoPacote = new Set(fotosDaObra
    .filter(r => r.envio !== 'ENVIADO' || Number.isNaN(recebido) || !r.enviadoEm || Date.parse(r.enviadoEm) >= recebido)
    .map(chave));
  const lista = new Map<string, PendenciaLocal>();
  for (const p of obra.pendenciasFoto) {
    const k = `${p.idPonto}|${p.idItem}`;
    if (!depoisDoPacote.has(k)) {
      lista.set(k, { idPonto: p.idPonto, rotuloPonto: `Ponto ${p.numeroPonto}`, idItem: p.idItem, titulo: p.titulo,
        ...(p.motivoReprovacao ? { motivoReprovacao: p.motivoReprovacao } : {}) });
    }
  }
  for (const ponto of pontosFeitos) {
    for (const item of itensModelo.filter(i => i.obrigatoria)) {
      const k = `${ponto.id}|${item.id}`;
      if (!tiradas.has(k) && !lista.has(k)) lista.set(k, { idPonto: ponto.id, rotuloPonto: ponto.rotulo, idItem: item.id, titulo: item.titulo });
    }
  }
  return [...lista.values()];
}

// ---------- Fotos do ponto: o que tirar, em que momento e o que já foi ----------

const ORDEM_ETAPA: Record<EtapaFoto, number> = { ANTES: 0, DURANTE: 1, DEPOIS: 2 };
const FASE_DO_PONTO: Record<SituacaoPonto, number> = { A_FAZER: 0, FORA: 0, PARCIAL: 1, FEITO: 2 };

/** O momento da foto que a pessoa vai tirar agora: o do modelo ou, sem ele, o da situação do ponto. */
export function etapaDaFoto(item: { etapa?: EtapaFoto | null } | null, situacao: SituacaoPonto): EtapaFoto {
  if (item?.etapa) return item.etapa;
  return situacao === 'FEITO' ? 'DEPOIS' : situacao === 'PARCIAL' ? 'DURANTE' : 'ANTES';
}

export type SituacaoVagaFoto = 'FEITA' | 'REFAZER' | 'FALTA' | 'OPCIONAL';

export interface VagaFoto {
  item: ItemFoto;
  /** Momento do modelo (nulo = qualquer momento). */
  etapa: EtapaFoto | null;
  obrigatoria: boolean;
  situacao: SituacaoVagaFoto;
  /** Por que o escritório reprovou a foto anterior. */
  motivo?: string | null;
  /** Fotos deste item no aparelho (ainda não enviadas ou enviadas há pouco) e as que o servidor já tem. */
  noAparelho: number;
  noServidor: number;
  /** Fotos deste item ainda esperando envio. */
  naFila: number;
  /** O momento desta foto ainda não chegou (foto de depois com o ponto por fazer). */
  cedo: boolean;
}

/**
 * As fotos do modelo para um ponto, na ordem do trabalho (antes, durante, depois, qualquer momento), com o que já foi
 * tirado e o que falta. Vão não tem foto obrigatória. Reprovada vem como "refazer", com o motivo.
 */
export function vagasDeFoto(ponto: { id: string; situacao: SituacaoPonto; vao?: unknown }, itens: ItemFoto[], obra: ObraCampo | undefined,
                            registros: RegistroObraLocal[], pendencias: PendenciaLocal[]): VagaFoto[] {
  const fase = FASE_DO_PONTO[ponto.situacao];
  return itens.map((item, ordem) => {
    const doItem = registros.filter(r => r.tipo === 'EVIDENCIA' && r.idPonto === ponto.id && (r.comando as { idItem?: string }).idItem === item.id);
    const noAparelho = doItem.length;
    const naFila = doItem.filter(r => r.envio !== 'ENVIADO').length;
    const noServidor = (obra?.fotos ?? []).filter(f => (f.idVao ?? f.idPonto) === ponto.id && f.idItem === item.id).length;
    const pendencia = pendencias.find(p => p.idPonto === ponto.id && p.idItem === item.id);
    const obrigatoria = item.obrigatoria && !ponto.vao;
    const etapa = item.etapa ?? null;
    const situacao: SituacaoVagaFoto = pendencia?.motivoReprovacao ? 'REFAZER'
      : noAparelho + noServidor > 0 ? 'FEITA' : obrigatoria ? 'FALTA' : 'OPCIONAL';
    return { item, etapa, obrigatoria, situacao, motivo: pendencia?.motivoReprovacao ?? null, noAparelho, noServidor, naFila,
      cedo: etapa != null && ORDEM_ETAPA[etapa] > fase, ordem };
  }).sort((a, b) => (a.etapa ? ORDEM_ETAPA[a.etapa] : 3) - (b.etapa ? ORDEM_ETAPA[b.etapa] : 3) || a.ordem - b.ordem)
    .map(({ ordem: _ordem, ...vaga }) => vaga);
}

/**
 * A foto que a equipe deve tirar agora: primeiro a reprovada; depois a obrigatória que falta no momento atual (a de
 * "antes" enquanto o ponto está por fazer, a de "depois" quando ficou pronto); por fim a que ficou para trás (momento já
 * passou), para não sumir da vista: melhor tirar agora do que ficar sem. A do momento que ainda não chegou espera.
 */
export function proximaFoto(vagas: VagaFoto[], situacao: SituacaoPonto): VagaFoto | null {
  const refazer = vagas.find(v => v.situacao === 'REFAZER');
  if (refazer) return refazer;
  const fase = FASE_DO_PONTO[situacao];
  return vagas.find(v => v.situacao === 'FALTA' && (v.etapa == null ? fase > 0 : ORDEM_ETAPA[v.etapa] === fase))
    ?? vagas.find(v => v.situacao === 'FALTA' && v.etapa != null && ORDEM_ETAPA[v.etapa] < fase)
    ?? null;
}

/** A foto do momento que já passou (ex.: a de "durante" com o ponto pronto). */
export function fotoAtrasada(vaga: VagaFoto, situacao: SituacaoPonto): boolean {
  return vaga.etapa != null && ORDEM_ETAPA[vaga.etapa] < FASE_DO_PONTO[situacao];
}

/** Rótulo do momento para a equipe. */
export function rotuloEtapaFoto(etapa: EtapaFoto | null): string {
  return etapa === 'ANTES' ? 'Antes de começar' : etapa === 'DURANTE' ? 'Durante o serviço' : etapa === 'DEPOIS' ? 'Depois de pronto' : 'Qualquer momento';
}

/** Nome do que se conta na execução: "pontos e vãos" quando há vão, senão "ponto(s)". */
/** "3 pontos", "1 vão", "2 pontos e 5 vãos": cabo é lançado em vão, estrutura fica no ponto. */
export function contarLocais(pontos: number, vaos: number): string {
  const p = pontos === 1 ? '1 ponto' : `${pontos} pontos`;
  const v = vaos === 1 ? '1 vão' : `${vaos} vãos`;
  if (pontos && vaos) return `${p} e ${v}`;
  return vaos ? v : p;
}

export function nomeLocais(locais: { vao?: unknown }[]): string {
  if (locais.some(l => !!l.vao)) return 'pontos e vãos';
  return locais.length === 1 ? 'ponto' : 'pontos';
}

// ---------- APR ----------

export type CondicaoApr = 'SEMPRE' | 'DESLIGAMENTO' | 'LINHA_VIVA' | 'PODA' | 'ATERRAMENTO' | 'POSTE' | 'TRAFEGO';

/** Condições do serviço que puxam sugestões na APR. */
export function condicoesDaProgramacao(p: ProgramacaoCampo, obra?: ObraCampo): CondicaoApr[] {
  const ids = new Set(p.itens.map(i => i.idPonto).filter(Boolean));
  const pontos = (obra?.pontos ?? []).filter(pt => ids.has(pt.id));
  const c: CondicaoApr[] = ['SEMPRE'];
  if (p.desligamento) c.push('DESLIGAMENTO');
  if (p.linhaViva) c.push('LINHA_VIVA');
  if (pontos.some(pt => pt.temPoda)) c.push('PODA');
  if (pontos.some(pt => pt.temAterramento)) c.push('ATERRAMENTO');
  // Serviço de poste (implantar, retirar, substituir) puxa içamento, cava e altura.
  if (p.itens.some(i => i.tipo === 'SERVICO' && /\bposte\b/i.test(i.descricao ?? ''))) c.push('POSTE');
  // A visita prévia apontou fluxo de veículos ou interdição da via.
  if ((obra?.visitaPrevia?.atencao ?? []).some(a => /fluxo de ve[ií]culos|tr[aá]fego|interditar/i.test(a))) c.push('TRAFEGO');
  return c;
}

/** Riscos e medidas já marcados para conferir, a partir das condições. */
export function sugestoesApr(modelo: ModeloApr, condicoes: CondicaoApr[]): { riscos: string[]; medidas: string[] } {
  const riscos = new Set<string>();
  const medidas = new Set<string>();
  for (const c of condicoes) {
    const s = modelo.sugestoes[c];
    s?.riscos.forEach(r => riscos.add(r));
    s?.medidas.forEach(m => medidas.add(m));
  }
  return { riscos: modelo.riscos.filter(r => riscos.has(r)), medidas: modelo.medidas.filter(m => medidas.has(m)) };
}

/** Medida que cada risco pede: ao marcar o risco na APR, a medida vem marcada junto (dá para desmarcar). */
const MEDIDAS_DO_RISCO: Record<string, string[]> = {
  'Queda de altura': ['Inspeção de escada e cinto'],
  'Movimentação de carga': ['Plano de içamento', 'Sinalização e isolamento da área'],
  'Tráfego de veículos': ['Sinalização e isolamento da área'],
  'Escavação': ['Sinalização e isolamento da área'],
  'Calor ou esforço físico': ['Revezamento e hidratação'],
  'Choque elétrico': ['EPI e EPC'],
  'Arco elétrico': ['EPI e EPC'],
};

/** Medidas do modelo que o risco pede (só as que existem no modelo). */
export function medidasDoRisco(modelo: Pick<ModeloApr, 'medidas'>, risco: string): string[] {
  return (MEDIDAS_DO_RISCO[risco] ?? []).filter(m => modelo.medidas.includes(m));
}

/** Verificações que fazem sentido: "Desligamento confirmado" só com desligamento. */
export function verificacoesDaApr(modelo: ModeloApr, condicoes: CondicaoApr[]): string[] {
  return modelo.verificacoes.filter(v => !/desligamento/i.test(v) || condicoes.includes('DESLIGAMENTO'));
}

/** O que falta para concluir a APR; vazio = pode concluir. "Não" impede, como no servidor. */
export function faltasDaApr(r: AprRascunho, verificacoes: string[]): string[] {
  const faltas: string[] = [];
  if (!r.riscos.length && !r.outroRisco.trim()) faltas.push('Marque ao menos um risco.');
  if (!r.medidas.length && !r.medidasAdicionais.trim()) faltas.push('Marque ao menos uma medida de controle.');
  const naoRespondidas = verificacoes.filter(v => !r.verificacoes[v]);
  if (naoRespondidas.length) faltas.push(`Responda: ${naoRespondidas.join(', ')}.`);
  const nao = verificacoes.filter(v => r.verificacoes[v] === 'NAO');
  if (nao.length) faltas.push(`"${nao.join('", "')}" está como Não: corrija antes de executar ou registre "Sem condição de executar".`);
  if (!r.participantes.length) faltas.push('Marque quem participou.');
  const semAssinatura = r.participantes.filter(p => !r.assinaturas[p]);
  if (semAssinatura.length) faltas.push('Falta a assinatura de ' + (semAssinatura.length === 1 ? 'um participante.' : `${semAssinatura.length} participantes.`));
  return faltas;
}

export function formularioDaApr(r: AprRascunho, verificacoes: string[], local?: string | null): FormularioApr {
  return {
    local: local ?? null,
    riscos: r.riscos,
    outroRisco: r.outroRisco.trim() || null,
    medidas: r.medidas,
    medidasAdicionais: r.medidasAdicionais.trim() || null,
    verificacoes: verificacoes.map(v => ({ pergunta: v, resposta: r.verificacoes[v] ?? 'NAO_SE_APLICA' })),
    idsParticipantes: r.participantes,
  };
}

/** Como a equipe vê a referência da programação: "#12" ou "avulsa". */
export function referenciaProgramacao(p: Pick<ProgramacaoCampo, 'numero' | 'avulsa' | 'observacao'>): string {
  if (p.avulsa) return ehAlemDoProgramado(p) ? 'além do programado' : 'avulsa';
  return `#${p.numero}`;
}

/** Avulsa começada pelo "Ir além do programado" (mesma obra da agenda). */
export function ehAlemDoProgramado(p: Pick<ProgramacaoCampo, 'avulsa' | 'observacao'>): boolean {
  return !!p.avulsa && !!p.observacao?.startsWith('Além do programado');
}

// ---------- Liberação no aparelho ----------

export type LiberacaoLocal = 'PENDENTE' | 'EM_PREENCHIMENTO' | 'LIBERADA' | 'IMPEDIDA';

function aprsConcluidas(dia: string, registros: RegistroObraLocal[]): RegistroObraLocal[] {
  return registros.filter(r => r.tipo === 'APR' && r.dia === dia && r.envio !== 'CONFLITO' && (r.comando as { concluir?: boolean }).concluir);
}

/**
 * Mesma regra do servidor, sobre o que está no aparelho: uma APR concluída no dia libera todos os serviços da equipe
 * (outras APRs no dia são permitidas). "Sem condição de executar" numa obra a bloqueia até uma APR dessa obra
 * concluída depois.
 */
export function liberacaoLocal(p: Pick<ProgramacaoCampo, 'idObra'>, dia: string, registros: RegistroObraLocal[], temRascunho = false): LiberacaoLocal {
  const aprs = aprsConcluidas(dia, registros);
  const impedimento = registros.filter(r => r.dia === dia && r.idObra === p.idObra && r.envio !== 'CONFLITO' && r.tipo === 'OCORRENCIA'
    && (r.comando as { impedeExecucao?: boolean }).impedeExecucao).map(r => r.comando.campo.instante).sort().at(-1);
  if (impedimento) {
    const daObra = aprs.filter(r => r.idObra === p.idObra).map(r => r.comando.campo.instante).sort().at(-1);
    if (!daObra || daObra < impedimento) return 'IMPEDIDA';
  }
  if (aprs.length) return 'LIBERADA';
  return temRascunho ? 'EM_PREENCHIMENTO' : 'PENDENTE';
}

/** A APR que libera o apontamento (para ele depender dela na fila): a última da obra, senão a última do dia. */
export function aprQueLibera(p: Pick<ProgramacaoCampo, 'idObra'>, dia: string, registros: RegistroObraLocal[]): RegistroObraLocal | undefined {
  const aprs = aprsConcluidas(dia, registros).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  return aprs.filter(r => r.idObra === p.idObra).at(-1) ?? aprs.at(-1);
}

// ---------- Hoje guiado ----------

export interface PassoDoDia {
  /** Rótulo do botão único do Hoje. */
  rotulo: string;
  rota: string;
  icone: string;
  /** Explicação curta ("Programação #12 · obra 7000001"). */
  apoio?: string;
}

export interface EstadoDoDia {
  turnoAberto: boolean;
  /** O dia já foi fechado (relatório registrado hoje). */
  diaFechado?: boolean;
  checklistFeito: boolean;
  programacoes: ProgramacaoCampo[];
  registros: RegistroObraLocal[];
  dia: string;
  /** Pontos feitos (todos) por programação. */
  concluida: (p: ProgramacaoCampo) => boolean;
  temRascunhoApr: (p: ProgramacaoCampo) => boolean;
}

/** Programação "da vez": a primeira do dia não concluída nem impedida. */
export function programacaoDaVez(e: EstadoDoDia): ProgramacaoCampo | undefined {
  return e.programacoes.find(p => !e.concluida(p) && liberacaoLocal(p, e.dia, e.registros) !== 'IMPEDIDA');
}

/**
 * O próximo passo do dia, na ordem real: turno → chegar → APR → executar → fechar o dia. O checklist do veículo é
 * cobrado pela abertura do turno quando a frota exige.
 */
export function proximoPasso(e: EstadoDoDia): PassoDoDia {
  if (!e.turnoAberto && e.diaFechado) {
    return { rotulo: 'Ver a agenda', rota: '/obras', icone: 'check', apoio: 'Dia fechado. Bom descanso!' };
  }
  if (!e.turnoAberto) {
    return { rotulo: 'Abrir turno', rota: '/turno/abrir', icone: 'relogio', apoio: e.checklistFeito ? undefined : 'Faça o checklist do veículo antes de sair' };
  }
  const p = programacaoDaVez(e);
  if (!p) {
    return e.programacoes.length
      ? { rotulo: 'Fechar o dia', rota: '/obras/relatorio', icone: 'check', apoio: 'Tudo da agenda de hoje foi feito ou registrado' }
      : { rotulo: 'Execução avulsa', rota: '/obras/nao-programada', icone: 'mais', apoio: 'Nenhuma obra na agenda de hoje' };
  }
  const apoio = `${p.avulsa ? 'Execução avulsa' : `Programação #${p.numero}`}${p.numeroObra ? ` · obra ${p.numeroObra}` : ''}`;
  const chegou = e.registros.some(r => r.tipo === 'PRESENCA' && r.dia === e.dia && r.idObra === p.idObra
    && (r.comando as { tipo?: string }).tipo === 'CHEGADA');
  if (!chegou) return { rotulo: 'Ir para a obra', rota: `/obras/${p.id}`, icone: 'mapa', apoio };
  const lib = liberacaoLocal(p, e.dia, e.registros, e.temRascunhoApr(p));
  if (lib !== 'LIBERADA') return { rotulo: lib === 'EM_PREENCHIMENTO' ? 'Continuar a APR' : 'Fazer a APR', rota: `/obras/${p.id}/apr`, icone: 'escudo', apoio };
  return { rotulo: 'Executar', rota: `/obras/${p.id}/execucao`, icone: 'ferramenta', apoio };
}

// ---------- Material previsto × saldo do caminhão ----------

export interface MaterialPrevisto {
  idMaterial: string | null; codigo?: string | null; descricao: string; unidade?: string | null;
  /** Total previsto na programação. */
  previsto: number;
  /** Já lançado como usado pela equipe (servidor + o que está no aparelho). */
  usado: number;
  saldo: number | null;
  /** O que ainda falta usar e não está no caminhão. */
  falta: number;
}

/**
 * Material previsto pela programação, o que a equipe já lançou como usado e o saldo do caminhão. O saldo só baixa no
 * fechamento técnico da obra, então "usado" mostra o andamento no dia.
 */
export function materialPrevisto(programacoes: ProgramacaoCampo[], saldoPorMaterial: Map<string, number>,
                                 executado: (p: ProgramacaoCampo) => Map<string, number> = p => new Map(p.itens.map(i => [i.idItem, i.executada]))): MaterialPrevisto[] {
  const soma = new Map<string, MaterialPrevisto>();
  for (const p of programacoes) {
    const feito = executado(p);
    for (const i of p.itens.filter(x => x.tipo === 'MATERIAL')) {
      const chave = i.idMaterial ?? `${i.codigo}|${i.descricao}`;
      const atual = soma.get(chave) ?? { idMaterial: i.idMaterial ?? null, codigo: i.codigo, descricao: i.descricao ?? 'Material', unidade: i.unidade, previsto: 0, usado: 0, saldo: null, falta: 0 };
      atual.previsto += i.quantidade;
      atual.usado += Math.min(i.quantidade, feito.get(i.idItem) ?? i.executada);
      soma.set(chave, atual);
    }
  }
  return [...soma.values()].map(m => {
    const saldo = m.idMaterial ? (saldoPorMaterial.get(m.idMaterial) ?? 0) : null;
    const aUsar = Math.max(0, arred(m.previsto - m.usado));
    return { ...m, previsto: arred(m.previsto), usado: arred(m.usado), saldo, falta: saldo == null ? 0 : Math.max(0, arred(aUsar - saldo)) };
  }).sort((a, b) => b.falta - a.falta || a.descricao.localeCompare(b.descricao));
}

function arred(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------- Relatório do dia ----------

/** Texto do relatório diário montado com o que a equipe lançou; o encarregado revisa e completa. */
export function relatorioDoDia(programacoes: ProgramacaoCampo[], registros: RegistroObraLocal[], dia: string,
                               pontosFeitos: (p: ProgramacaoCampo) => string[], pendenciasFoto: number,
                               pontosParciais: (p: ProgramacaoCampo) => string[] = () => []): string {
  const doDia = registros.filter(r => r.dia === dia);
  const linhas: string[] = [];
  const atendidas = programacoes.filter(p => doDia.some(r => r.idProgramacao === p.id || r.idObra === p.idObra));
  for (const p of atendidas) {
    const feitos = pontosFeitos(p);
    const tipo = !p.avulsa ? `programação #${p.numero}` : ehAlemDoProgramado(p) ? 'além do programado'
      : `execução avulsa${p.observacao ? ' — ' + p.observacao : ''}`;
    const parciais = pontosParciais(p);
    linhas.push(`Obra ${p.numeroObra ?? ''} (${tipo}): ${feitos.length ? `pontos feitos ${feitos.join(', ')}` : 'sem pontos concluídos'}`
      + `${parciais.length ? `; parcial em ${parciais.join(', ')}` : ''}.`);
  }
  // Atividade fora da agenda sem a avulsa no aparelho (registro antigo): fica a linha com o motivo.
  for (const r of doDia.filter(x => x.tipo === 'ATIVIDADE' && !atendidas.some(p => p.avulsa && p.idObra === x.idObra))) {
    linhas.push(`Obra fora da agenda: ${(r.comando as { motivo?: string }).motivo ?? ''}`.trim());
  }
  const numeroDa = (idObra?: string | null) => programacoes.find(p => p.idObra === idObra)?.numeroObra;
  const ocorrencias = doDia.filter(r => r.tipo === 'OCORRENCIA');
  for (const o of ocorrencias) {
    const c = o.comando as { tipo?: string; descricao?: string; impedeExecucao?: boolean };
    const obra = numeroDa(o.idObra);
    linhas.push(`${c.impedeExecucao ? 'Sem condição de executar' : 'Ocorrência'}${obra ? ` na obra ${obra}` : ''} (${(c.tipo ?? '').toLowerCase()}): ${c.descricao ?? ''}`);
  }
  if (pendenciasFoto) linhas.push(`Fotos pendentes: ${pendenciasFoto}.`);
  if (!linhas.length) linhas.push('Sem lançamentos no dia.');
  return linhas.join('\n');
}

/** "Como chegar": abre o app de mapas do aparelho pela coordenada, ou pelo endereço. */
export function linkComoChegar(obra: Pick<ObraCampo, 'latitude' | 'longitude' | 'endereco' | 'municipio'>, apple = false): string | null {
  if (obra.latitude != null && obra.longitude != null) {
    return apple
      ? `https://maps.apple.com/?daddr=${obra.latitude},${obra.longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${obra.latitude},${obra.longitude}`;
  }
  if (obra.endereco) {
    const destino = encodeURIComponent([obra.endereco, obra.municipio].filter(Boolean).join(', '));
    return apple ? `https://maps.apple.com/?daddr=${destino}` : `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
  }
  return null;
}

/** Distância em metros entre duas coordenadas (haversine), para sugerir "Cheguei". */
export function distanciaMetros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function aprVazia(sugestao: { riscos: string[]; medidas: string[] }, participantes: string[]): AprRascunho {
  return { passo: 0, riscos: [...sugestao.riscos], outroRisco: '', medidas: [...sugestao.medidas], medidasAdicionais: '',
    verificacoes: {}, participantes: [...participantes], assinaturas: {} };
}

/**
 * Posição do ponto (em [0,1] da página do PDF) na folha girada no sentido horário, a mesma conta do planejamento no
 * web: o projeto que o técnico deixou de pé lá aparece de pé no tablet, com os pontos no lugar.
 */
export function pontoNaFolhaGirada(x: number, y: number, rotacao: number): { x: number; y: number } {
  switch ((((rotacao % 360) + 360) % 360)) {
    case 90: return { x: 1 - y, y: x };
    case 180: return { x: 1 - x, y: 1 - y };
    case 270: return { x: y, y: 1 - x };
    default: return { x, y };
  }
}

/**
 * De quando é a agenda guardada no aparelho. "Pronto para trabalhar sem sinal" sozinho não diz se o pacote é de hoje:
 * sem rede desde ontem, a equipe sairia com uma agenda que o escritório pode ter mudado.
 */
export function idadeDaAgenda(recebidoEm: string | null, agora = new Date()): { quando: string; antiga: boolean } | null {
  if (!recebidoEm) return null;
  const recebido = new Date(recebidoEm);
  if (Number.isNaN(recebido.getTime())) return null;
  const hora = `${String(recebido.getHours()).padStart(2, '0')}:${String(recebido.getMinutes()).padStart(2, '0')}`;
  if (recebido.toDateString() === agora.toDateString()) return { quando: `das ${hora}`, antiga: false };
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  const dia = recebido.toDateString() === ontem.toDateString()
    ? 'ontem'
    : `${String(recebido.getDate()).padStart(2, '0')}/${String(recebido.getMonth() + 1).padStart(2, '0')}`;
  return { quando: `de ${dia} às ${hora}`, antiga: true };
}
