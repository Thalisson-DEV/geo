import { EventoSstResponse, TipoEventoSst } from '../../../core/models/sst-evento.models';

/**
 * Regras de leitura do relatório de evento: gravidade na pirâmide de Bird, região do corpo
 * atingida e o nome do documento conforme o tipo. Puras, para testar sem montar a tela.
 */

// ---------- Gravidade (mesma regra da pirâmide do painel de acidentalidade) ----------

export type GrauEvento = 'INCIDENTE' | 'SEM_AFASTAMENTO' | 'COM_AFASTAMENTO' | 'FATALIDADE';

export interface DegrauGravidade {
  chave: GrauEvento;
  rotulo: string;
  descricao: string;
}

/** Do topo (mais grave) para a base, como na pirâmide de Bird. */
export const DEGRAUS_GRAVIDADE: DegrauGravidade[] = [
  { chave: 'FATALIDADE', rotulo: 'Fatalidade', descricao: 'CAT de óbito' },
  { chave: 'COM_AFASTAMENTO', rotulo: 'Com afastamento', descricao: 'lesão com dias perdidos' },
  { chave: 'SEM_AFASTAMENTO', rotulo: 'Sem afastamento', descricao: 'lesão sem dias perdidos' },
  { chave: 'INCIDENTE', rotulo: 'Incidente', descricao: 'sem lesão' }
];

/**
 * Espelha `DashboardEventosSstUseCases.piramide`: óbito pela CAT, depois lesão com ou sem
 * dias perdidos; sem lesão é incidente (inclui dano material e quase-acidente).
 */
export function grauDoEvento(e: Pick<EventoSstResponse, 'tipoCat' | 'comLesao' | 'diasPerdidos'>): GrauEvento {
  if (e.tipoCat === 'COMUNICACAO_OBITO') return 'FATALIDADE';
  if (!e.comLesao) return 'INCIDENTE';
  return (e.diasPerdidos ?? 0) > 0 ? 'COM_AFASTAMENTO' : 'SEM_AFASTAMENTO';
}

// ---------- Nome do documento ----------

const TITULO_POR_TIPO: Record<TipoEventoSst, string> = {
  ACIDENTE_TIPICO: 'Relatório de Investigação de Acidente',
  ACIDENTE_TRAJETO: 'Relatório de Investigação de Acidente de Trajeto',
  INCIDENTE_SEM_LESAO: 'Relatório de Investigação de Incidente',
  DANO_MATERIAL: 'Relatório de Investigação de Dano Material',
  DOENCA_OCUPACIONAL: 'Relatório de Investigação de Doença Ocupacional'
};

export function tituloDoRelatorio(tipo: TipoEventoSst): string {
  return TITULO_POR_TIPO[tipo] ?? 'Relatório de Investigação de Evento';
}

// ---------- Região do corpo ----------

export type RegiaoCentral = 'cabeca' | 'pescoco' | 'torax' | 'abdome' | 'quadril';
export type RegiaoLateral = 'ombro' | 'braco' | 'antebraco' | 'mao' | 'coxa' | 'joelho' | 'perna' | 'pe';
/** Regiões laterais levam o lado do corpo: `mao-d` é a mão direita do acidentado. */
export type RegiaoCorpo = RegiaoCentral | `${RegiaoLateral}-${'d' | 'e'}`;

const LATERAIS: RegiaoLateral[] = ['ombro', 'braco', 'antebraco', 'mao', 'coxa', 'joelho', 'perna', 'pe'];
const CENTRAIS: RegiaoCentral[] = ['cabeca', 'pescoco', 'torax', 'abdome', 'quadril'];

/** Do mais específico para o mais genérico: "antebraço" antes de "braço", "dedo do pé" antes de "mão". */
const REGRAS: Array<[RegExp, Array<RegiaoCentral | RegiaoLateral>]> = [
  [/partes multiplas do corpo/, [...CENTRAIS, ...LATERAIS]],
  [/membros superiores/, ['ombro', 'braco', 'antebraco', 'mao']],
  [/membros inferiores/, ['coxa', 'joelho', 'perna', 'pe']],
  [/cabeca|cranio|face|olho|nariz|boca|ouvido|mandibula/, ['cabeca']],
  [/pescoco/, ['pescoco']],
  [/ombro/, ['ombro']],
  [/antebraco|punho/, ['antebraco']],
  [/braco - total/, ['braco', 'antebraco']],
  [/braco|cotovelo/, ['braco']],
  [/dedo do pe/, ['pe']],
  [/dedo da mao|\bmao\b/, ['mao']],
  [/dorso|coluna|tronco/, ['torax', 'abdome']],
  [/torax|respiratorio|circulatorio/, ['torax']],
  [/abdome|digestivo|geniturinario/, ['abdome']],
  [/quadri|pelve/, ['quadril']],
  // "Perna - abaixo do joelho" é perna: a perna vem antes do joelho.
  [/perna - total/, ['coxa', 'joelho', 'perna']],
  [/perna/, ['perna']],
  [/coxa/, ['coxa']],
  [/joelho/, ['joelho']],
  [/tornozelo|\bpe\b/, ['pe']]
];

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Regiões do corpo a destacar para o local da lesão do catálogo. Sem lado informado, marca
 * os dois. Locais sistêmicos ("Sistema nervoso") ou não especificados não têm região.
 */
export function regioesDaLesao(localLesao: string | null | undefined): RegiaoCorpo[] {
  if (!localLesao) return [];
  const texto = normalizar(localLesao);
  const regra = REGRAS.find(([padrao]) => padrao.test(texto));
  if (!regra) return [];
  const lados: Array<'d' | 'e'> = /direit/.test(texto) ? ['d'] : /esquerd/.test(texto) ? ['e'] : ['d', 'e'];
  const regioes: RegiaoCorpo[] = [];
  for (const regiao of regra[1]) {
    if ((CENTRAIS as string[]).includes(regiao)) regioes.push(regiao as RegiaoCentral);
    else for (const lado of lados) regioes.push(`${regiao as RegiaoLateral}-${lado}`);
  }
  return regioes;
}

// ---------- Tempo ----------

/**
 * Distância entre o fato e um marco, como se lê numa investigação: "+ 6 h", "+ 10 dias".
 * Marco só com data (a emissão da CAT) conta em dias de calendário, sem hora inventada.
 */
export function tempoDesdeOFato(fato: string, marco: string | null, soData = false): string {
  if (!marco) return '';
  if (soData) {
    const inicio = new Date(fato);
    const diaDoFato = Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const [a, m, d] = marco.slice(0, 10).split('-').map(Number);
    const dias = Math.round((Date.UTC(a, m - 1, d) - diaDoFato) / 86_400_000);
    return dias <= 0 ? 'no mesmo dia' : dias === 1 ? '+ 1 dia' : `+ ${dias} dias`;
  }
  const horas = Math.round((new Date(marco).getTime() - new Date(fato).getTime()) / 3_600_000);
  if (horas <= 0) return 'no ato';
  if (horas < 48) return `+ ${horas} h`;
  const dias = Math.round(horas / 24);
  return `+ ${dias} dias`;
}
