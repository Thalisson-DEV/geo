import {
  AprRascunho, FormularioApr, ItemCampo, ModeloApr, ObraCampo, PontoCampo, ProgramacaoCampo, RegistroObraLocal, VaoCampo,
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

export interface PendenciaLocal { idPonto: string; rotuloPonto: string; idItem: string; titulo: string }

/**
 * Fotos obrigatórias que faltam nos pontos já executados: o que o servidor apontou, menos as fotos tiradas no aparelho
 * desde então, mais os pontos feitos no aparelho que ainda não têm a foto.
 */
export function pendenciasDeFoto(obra: ObraCampo, itensModelo: { id: string; titulo: string; obrigatoria: boolean }[],
                                 pontosFeitos: { id: string; rotulo: string }[], registros: RegistroObraLocal[]): PendenciaLocal[] {
  const tiradas = new Set(registros.filter(r => r.tipo === 'EVIDENCIA' && r.idObra === obra.id)
    .map(r => `${r.idPonto}|${(r.comando as { idItem?: string }).idItem}`));
  for (const f of obra.fotos) tiradas.add(`${f.idVao ?? f.idPonto}|${f.idItem}`);
  const lista = new Map<string, PendenciaLocal>();
  for (const p of obra.pendenciasFoto) {
    const chave = `${p.idPonto}|${p.idItem}`;
    if (!tiradas.has(chave)) lista.set(chave, { idPonto: p.idPonto, rotuloPonto: `Ponto ${p.numeroPonto}`, idItem: p.idItem, titulo: p.titulo });
  }
  for (const ponto of pontosFeitos) {
    for (const item of itensModelo.filter(i => i.obrigatoria)) {
      const chave = `${ponto.id}|${item.id}`;
      if (!tiradas.has(chave) && !lista.has(chave)) lista.set(chave, { idPonto: ponto.id, rotuloPonto: ponto.rotulo, idItem: item.id, titulo: item.titulo });
    }
  }
  return [...lista.values()];
}

// ---------- APR ----------

export type CondicaoApr = 'SEMPRE' | 'DESLIGAMENTO' | 'LINHA_VIVA' | 'PODA' | 'ATERRAMENTO';

/** Condições do serviço que puxam sugestões na APR. */
export function condicoesDaProgramacao(p: ProgramacaoCampo, obra?: ObraCampo): CondicaoApr[] {
  const ids = new Set(p.itens.map(i => i.idPonto).filter(Boolean));
  const pontos = (obra?.pontos ?? []).filter(pt => ids.has(pt.id));
  const c: CondicaoApr[] = ['SEMPRE'];
  if (p.desligamento) c.push('DESLIGAMENTO');
  if (p.linhaViva) c.push('LINHA_VIVA');
  if (pontos.some(pt => pt.temPoda)) c.push('PODA');
  if (pontos.some(pt => pt.temAterramento)) c.push('ATERRAMENTO');
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

export interface MaterialPrevisto { idMaterial: string | null; codigo?: string | null; descricao: string; unidade?: string | null; previsto: number; saldo: number | null; falta: number }

/** Material a instalar previsto pela programação (o restante) contra o saldo do caminhão. */
export function materialPrevisto(programacoes: ProgramacaoCampo[], saldoPorMaterial: Map<string, number>): MaterialPrevisto[] {
  const soma = new Map<string, MaterialPrevisto>();
  for (const p of programacoes) {
    for (const i of p.itens.filter(x => x.tipo === 'MATERIAL')) {
      const restante = Math.max(0, i.quantidade - i.executada);
      if (!restante) continue;
      const chave = i.idMaterial ?? `${i.codigo}|${i.descricao}`;
      const atual = soma.get(chave) ?? { idMaterial: i.idMaterial ?? null, codigo: i.codigo, descricao: i.descricao ?? 'Material', unidade: i.unidade, previsto: 0, saldo: null, falta: 0 };
      atual.previsto += restante;
      soma.set(chave, atual);
    }
  }
  return [...soma.values()].map(m => {
    const saldo = m.idMaterial ? (saldoPorMaterial.get(m.idMaterial) ?? 0) : null;
    return { ...m, saldo, falta: saldo == null ? 0 : Math.max(0, arred(m.previsto - saldo)) };
  }).sort((a, b) => b.falta - a.falta || a.descricao.localeCompare(b.descricao));
}

function arred(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ---------- Relatório do dia ----------

/** Texto do relatório diário montado com o que a equipe lançou; o encarregado revisa e completa. */
export function relatorioDoDia(programacoes: ProgramacaoCampo[], registros: RegistroObraLocal[], dia: string,
                               pontosFeitos: (p: ProgramacaoCampo) => string[], pendenciasFoto: number): string {
  const doDia = registros.filter(r => r.dia === dia);
  const linhas: string[] = [];
  const atendidas = programacoes.filter(p => doDia.some(r => r.idProgramacao === p.id || r.idObra === p.idObra));
  for (const p of atendidas) {
    const feitos = pontosFeitos(p);
    const tipo = !p.avulsa ? `programação #${p.numero}` : ehAlemDoProgramado(p) ? 'além do programado'
      : `execução avulsa${p.observacao ? ' — ' + p.observacao : ''}`;
    linhas.push(`Obra ${p.numeroObra ?? ''} (${tipo}): ${feitos.length ? `pontos feitos ${feitos.join(', ')}` : 'sem pontos concluídos'}.`);
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
