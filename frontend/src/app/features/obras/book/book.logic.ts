import { CesTone } from '@ces/ui';
import {
  SituacaoDocumental,
  SituacaoGrupoComparativo,
  SituacaoItemComparativo,
  StatusAuditoria
} from '../../../core/models/obras-book.models';
import { EtapaEvidencia, EvidenciaPonto, PontoDocumentacao } from '../../../core/models/obras-documentacao.models';

export interface Aparencia {
  label: string;
  tone: CesTone;
  icon: string;
}

export const SITUACAO_DOCUMENTAL: Record<SituacaoDocumental, Aparencia & { descricao: string }> = {
  PRONTA: { label: 'Pronta para entrega', tone: 'success', icon: 'pi-check-circle', descricao: 'Tudo o que a entrega exige está em dia.' },
  PENDENTE: { label: 'Com pendências', tone: 'warning', icon: 'pi-exclamation-triangle', descricao: 'Já dá para gerar, mas ainda falta algo para entregar.' },
  BLOQUEADA: { label: 'Bloqueada', tone: 'danger', icon: 'pi-ban', descricao: 'Há item que impede gerar o As Built.' },
  SEM_EXECUCAO: { label: 'Aguardando execução', tone: 'neutral', icon: 'pi-clock', descricao: 'Nenhum ponto executado ainda.' }
};

export const STATUS_AUDITORIA: Record<StatusAuditoria, Aparencia> = {
  OK: { label: 'Em dia', tone: 'success', icon: 'pi-check-circle' },
  PENDENTE: { label: 'Pendente', tone: 'danger', icon: 'pi-times-circle' },
  ALERTA: { label: 'Atenção', tone: 'warning', icon: 'pi-exclamation-triangle' },
  NAO_SE_APLICA: { label: 'Não se aplica', tone: 'neutral', icon: 'pi-minus-circle' }
};

export const ETAPAS: { value: EtapaEvidencia; label: string; icon: string }[] = [
  { value: 'ANTES', label: 'Antes', icon: 'pi-step-backward' },
  { value: 'DURANTE', label: 'Durante', icon: 'pi-play' },
  { value: 'DEPOIS', label: 'Depois', icon: 'pi-step-forward' }
];

export function rotuloEtapa(etapa: EtapaEvidencia | null): string {
  return ETAPAS.find((e) => e.value === etapa)?.label ?? 'Sem etapa';
}

export const SITUACAO_GRUPO: Record<SituacaoGrupoComparativo, Aparencia> = {
  CONFORME: { label: 'Conforme', tone: 'success', icon: 'pi-check-circle' },
  DIVERGENTE: { label: 'Divergente', tone: 'danger', icon: 'pi-exclamation-circle' },
  EM_EXECUCAO: { label: 'Em execução', tone: 'info', icon: 'pi-spinner' },
  NAO_INICIADO: { label: 'Não iniciado', tone: 'neutral', icon: 'pi-circle' }
};

export const SITUACAO_ITEM: Record<SituacaoItemComparativo, Aparencia> = {
  OK: { label: 'Conforme', tone: 'success', icon: 'pi-check' },
  ABAIXO: { label: 'Abaixo do previsto', tone: 'warning', icon: 'pi-arrow-down' },
  ACIMA: { label: 'Acima do previsto', tone: 'danger', icon: 'pi-arrow-up' },
  NAO_EXECUTADO: { label: 'Não executado', tone: 'neutral', icon: 'pi-minus' },
  EXECUTADO_ANTES: { label: 'Executado antes', tone: 'info', icon: 'pi-history' }
};

export function formatarBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export function formatarCoordenadas(latitude: number | null, longitude: number | null): string | null {
  if (latitude == null || longitude == null) return null;
  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return `${f(latitude)}, ${f(longitude)}`;
}

/** Link de mapa aberto (sem chave) para conferir onde a foto foi tirada. */
export function linkDoMapa(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}

export function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// ---- Galeria ----

export type AgrupamentoGaleria = 'PONTO' | 'ETAPA' | 'ITEM';
export type FiltroEtapa = EtapaEvidencia | 'SEM' | 'TODAS';

export interface FotoDaGaleria {
  evidencia: EvidenciaPonto;
  ponto: PontoDocumentacao;
}

export interface GrupoDaGaleria {
  chave: string;
  titulo: string;
  subtitulo: string;
  fotos: FotoDaGaleria[];
  /** Itens obrigatórios do modelo sem foto, só no agrupamento por ponto. */
  faltando: string[];
  ponto: PontoDocumentacao | null;
}

export interface FiltrosGaleria {
  busca: string;
  idPonto: string | null;
  etapa: FiltroEtapa;
  item: string | null;
  autor: string | null;
  soComFalta: boolean;
}

export const FILTROS_GALERIA_VAZIOS: FiltrosGaleria = { busca: '', idPonto: null, etapa: 'TODAS', item: null, autor: null, soComFalta: false };

export function faltandoNoPonto(ponto: PontoDocumentacao): string[] {
  const feitos = new Set(ponto.evidencias.map((e) => e.idItem).filter((id): id is string => !!id));
  return ponto.itensEvidencia.filter((i) => i.obrigatoria && !feitos.has(i.id)).map((i) => i.titulo);
}

function tituloDoItem(e: EvidenciaPonto): string {
  return e.tituloItem ?? 'Outras evidências';
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Aplica os filtros e agrupa as fotos. No agrupamento por ponto, pontos executados sem foto também aparecem (vazios). */
export function montarGaleria(pontos: PontoDocumentacao[], agrupamento: AgrupamentoGaleria, filtros: FiltrosGaleria): GrupoDaGaleria[] {
  const busca = normalizar(filtros.busca.trim());
  const passa = (f: FotoDaGaleria): boolean => {
    const e = f.evidencia;
    if (filtros.idPonto && f.ponto.id !== filtros.idPonto) return false;
    if (filtros.etapa === 'SEM' ? e.etapa !== null : filtros.etapa !== 'TODAS' && e.etapa !== filtros.etapa) return false;
    if (filtros.item && tituloDoItem(e) !== filtros.item) return false;
    if (filtros.autor && e.usuario !== filtros.autor) return false;
    if (busca) {
      const texto = normalizar([f.ponto.numero, tituloDoItem(e), e.legenda ?? '', e.usuario ?? '', e.nomeArquivo].join(' '));
      if (!texto.includes(busca)) return false;
    }
    return true;
  };
  const pontosVisiveis = pontos.filter((p) => (!filtros.idPonto || p.id === filtros.idPonto) && (!filtros.soComFalta || (p.executado && faltandoNoPonto(p).length > 0) || (p.executado && !p.evidencias.length)));
  const fotos: FotoDaGaleria[] = pontosVisiveis.flatMap((p) => p.evidencias.map((evidencia) => ({ evidencia, ponto: p }))).filter(passa);
  const semFiltroDeFoto = !busca && filtros.etapa === 'TODAS' && !filtros.item && !filtros.autor;

  if (agrupamento === 'PONTO') {
    return pontosVisiveis
      .map((p) => {
        const doPonto = fotos.filter((f) => f.ponto.id === p.id);
        const faltando = faltandoNoPonto(p);
        return {
          chave: p.id,
          titulo: `Ponto ${p.numero}`,
          subtitulo: `Folha ${p.pagina} · ${p.executado ? 'Executado' : 'Sem execução'}`,
          fotos: doPonto,
          faltando,
          ponto: p
        };
      })
      .filter((g) => g.fotos.length > 0 || (semFiltroDeFoto && g.ponto.executado));
  }
  const grupos = new Map<string, GrupoDaGaleria>();
  const ordem = agrupamento === 'ETAPA' ? ['ANTES', 'DURANTE', 'DEPOIS', 'SEM'] : [];
  for (const chave of ordem) {
    grupos.set(chave, { chave, titulo: chave === 'SEM' ? 'Sem etapa informada' : `${rotuloEtapa(chave as EtapaEvidencia)} da execução`, subtitulo: '', fotos: [], faltando: [], ponto: null });
  }
  for (const f of fotos) {
    const chave = agrupamento === 'ETAPA' ? (f.evidencia.etapa ?? 'SEM') : tituloDoItem(f.evidencia);
    if (!grupos.has(chave)) grupos.set(chave, { chave, titulo: chave, subtitulo: '', fotos: [], faltando: [], ponto: null });
    grupos.get(chave)!.fotos.push(f);
  }
  return [...grupos.values()]
    .filter((g) => g.fotos.length > 0)
    .map((g) => {
      const pontosDistintos = new Set(g.fotos.map((f) => f.ponto.id)).size;
      return { ...g, subtitulo: `${pontosDistintos === 1 ? '1 ponto' : `${pontosDistintos} pontos`}` };
    });
}

/** Rótulo de quantidade de fotos, no singular ou plural. */
export function quantasFotos(n: number): string {
  return n === 1 ? '1 foto' : `${n} fotos`;
}
