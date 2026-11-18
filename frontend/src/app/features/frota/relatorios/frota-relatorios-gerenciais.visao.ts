import { GeoTone } from '@geo/ui';
import { IndicadorFrota, RelatorioGerencialFrota } from '../../../core/models/frota-relatorios.models';
import { LeituraGerencial, VereditoGerencial } from '../../../shared/components/dashboard/dashboard-visao-gerencial.component';

/** Abas da tela; as leituras da visão gerencial levam a uma delas. */
export type AbaRelatorioFrota = 'geral' | 'custos' | 'manutencao' | 'combustivel' | 'uso' | 'conformidade';

/** Faixas usadas no veredito e nas leituras (design da change, seção "Veredito e leituras"). */
export const LIMITES_FROTA = {
  disponibilidadeCritica: 0.9,
  disponibilidadeAtencao: 0.95,
  preventivaMinima: 0.5,
  preventivaBoa: 0.7,
  aumentoCusto: 0.15,
  checklistMeta: 0.8,
  custoSobreFaturamentoAtencao: 0.25
} as const;

const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaCurtaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const inteiroFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const moeda = (v: number | null | undefined) => (v === null || v === undefined ? '—' : moedaFmt.format(v));
export const moedaCurta = (v: number | null | undefined) => (v === null || v === undefined ? '—' : moedaCurtaFmt.format(v));
export const numero = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });
export const inteiro = (v: number | null | undefined) => (v === null || v === undefined ? '—' : inteiroFmt.format(v));
/** Fração → "95,2%". */
export const pct = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;

/** "Mar/26" a partir de "2026-03-01". */
export function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split('-').map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${String(ano).slice(2)}`;
}

/** Variação relativa do indicador (null quando não há base de comparação). */
export function variacao(ind: IndicadorFrota | null | undefined): number | null {
  if (!ind || ind.atual == null || ind.anterior == null || ind.anterior === 0) return null;
  return (ind.atual - ind.anterior) / Math.abs(ind.anterior);
}

/**
 * Texto da comparação com o período anterior. `menorMelhor` inverte a leitura (custo subir é ruim).
 * Para frações (disponibilidade, % preventiva) a diferença sai em pontos percentuais.
 */
export function comparacao(ind: IndicadorFrota | null | undefined, formato: 'moeda' | 'numero' | 'fracao' = 'numero'): string {
  // O backend omite campos nulos (non_null): ausente e null significam o mesmo.
  if (!ind || ind.atual == null) return 'Sem dados no período';
  if (ind.anterior == null) return 'Sem base no período anterior';
  if (formato === 'fracao') {
    const pp = (ind.atual - ind.anterior) * 100;
    if (Math.abs(pp) < 0.05) return 'Igual ao período anterior';
    return `${pp > 0 ? '+' : '−'}${numero(Math.abs(pp))} p.p. sobre o período anterior`;
  }
  const v = variacao(ind);
  if (v === null) return `Período anterior: ${formato === 'moeda' ? moeda(ind.anterior) : numero(ind.anterior)}`;
  if (Math.abs(v) < 0.005) return 'Igual ao período anterior';
  return `${v > 0 ? '+' : '−'}${pct(Math.abs(v))} sobre o período anterior`;
}

const PESO: Record<GeoTone, number> = { danger: 0, warning: 1, info: 2, brand: 2, neutral: 3, success: 4 };

export interface VisaoRelatorioFrota {
  veredito: VereditoGerencial;
  leituras: (LeituraGerencial & { aba: AbaRelatorioFrota })[];
}

/** Veredito do período e as leituras que pedem ação, cada uma levando à aba que a sustenta. */
export function visaoRelatorioFrota(r: RelatorioGerencialFrota): VisaoRelatorioFrota {
  const leituras: VisaoRelatorioFrota['leituras'] = [];
  const disp = r.resumo.disponibilidade?.atual ?? null;
  const prev = r.resumo.percentualPreventiva?.atual ?? null;
  const varCusto = variacao(r.resumo.custoTotal);
  const c = r.conformidade;
  const vencidos = c.documentosVencidos + c.cnhVencidas;

  if (disp !== null && disp < LIMITES_FROTA.disponibilidadeAtencao) {
    const parados = r.manutencao?.paradosAgora.length ?? 0;
    leituras.push({
      id: 'disponibilidade', aba: 'manutencao', icone: 'pi pi-wrench',
      tom: disp < LIMITES_FROTA.disponibilidadeCritica ? 'danger' : 'warning',
      titulo: 'Disponibilidade abaixo de 95%', valor: pct(disp),
      texto: `${parados ? `${parados} veículo${parados > 1 ? 's' : ''} parado${parados > 1 ? 's' : ''} agora. ` : ''}`
        + `MTTR de ${numero(r.manutencao?.mttrHoras.atual)} h por corretiva.`,
      acao: { rotulo: 'Ver manutenção', alvo: { dimension: 'aba', value: 'manutencao' } }
    });
  }
  if (vencidos > 0) {
    leituras.push({
      id: 'vencidos', aba: 'conformidade', icone: 'pi pi-calendar-times', tom: 'danger',
      titulo: 'Documentos ou CNH vencidos', valor: inteiro(vencidos),
      texto: `${c.documentosVencidos} documento(s) de veículo e ${c.cnhVencidas} CNH vencidos hoje. Veículo com documento vencido não deveria rodar.`,
      acao: { rotulo: 'Ver vencimentos', alvo: { dimension: 'aba', value: 'conformidade' } }
    });
  }
  if (prev !== null && prev < LIMITES_FROTA.preventivaBoa) {
    leituras.push({
      id: 'preventiva', aba: 'manutencao', icone: 'pi pi-calendar-clock',
      tom: prev < LIMITES_FROTA.preventivaMinima ? 'warning' : 'info',
      titulo: 'Pouca preventiva', valor: pct(prev),
      texto: `A referência é 70% das OS serem preventivas. ${r.manutencao?.preventivasVencidas ?? 0} preventiva(s) vencida(s) hoje.`,
      acao: { rotulo: 'Ver manutenção', alvo: { dimension: 'aba', value: 'manutencao' } }
    });
  }
  if (varCusto !== null && varCusto > LIMITES_FROTA.aumentoCusto) {
    const maior = [...r.custos.porCategoria].sort((a, b) => (b.valor - b.anterior) - (a.valor - a.anterior))[0];
    leituras.push({
      id: 'custo', aba: 'custos', icone: 'pi pi-arrow-up-right', tom: 'warning',
      titulo: 'Custo subiu', valor: `+${pct(varCusto)}`,
      texto: maior ? `O que mais cresceu foi ${maior.rotulo.toLowerCase()}: ${moeda(maior.valor - maior.anterior)} a mais.` : 'Comparado ao período anterior.',
      acao: { rotulo: 'Ver custos', alvo: { dimension: 'aba', value: 'custos' } }
    });
  }
  const top = r.veiculos[0];
  const total = r.resumo.custoTotal.atual ?? 0;
  if (top && total > 0 && r.veiculos.length >= 5) {
    const tres = r.veiculos.slice(0, 3).reduce((s, v) => s + v.total, 0);
    leituras.push({
      id: 'concentracao', aba: 'custos', icone: 'pi pi-car', tom: 'info',
      titulo: 'Onde está o dinheiro', valor: pct(tres / total, 0),
      texto: `Os 3 veículos que mais custaram somam ${pct(tres / total, 0)} do total. O maior é ${top.placa}, com ${moeda(top.total)}.`,
      acao: { rotulo: 'Ver custos por veículo', alvo: { dimension: 'aba', value: 'custos' } }
    });
  }
  if (r.combustivel && r.combustivel.veiculosForaDoPadrao > 0) {
    leituras.push({
      id: 'consumo', aba: 'combustivel', icone: 'pi pi-gauge', tom: 'warning',
      titulo: 'Consumo fora do padrão', valor: inteiro(r.combustivel.veiculosForaDoPadrao),
      texto: 'Veículos rodando abaixo de 85% do km/l de referência: verificar abastecimento, manutenção ou uso.',
      acao: { rotulo: 'Ver combustível', alvo: { dimension: 'aba', value: 'combustivel' } }
    });
  }
  const retrabalho = r.manutencao?.retrabalho.length ?? 0;
  if (retrabalho > 0) {
    leituras.push({
      id: 'retrabalho', aba: 'manutencao', icone: 'pi pi-replay', tom: 'warning',
      titulo: 'Retrabalho em 30 dias', valor: inteiro(retrabalho),
      texto: 'O mesmo item voltou a quebrar no mesmo veículo em até 30 dias. Cobre a oficina ou reveja o diagnóstico.',
      acao: { rotulo: 'Ver retrabalho', alvo: { dimension: 'aba', value: 'manutencao' } }
    });
  }
  if (c.coberturaChecklist?.atual !== null && c.coberturaChecklist?.atual !== undefined
      && c.coberturaChecklist.atual < LIMITES_FROTA.checklistMeta) {
    leituras.push({
      id: 'checklist', aba: 'conformidade', icone: 'pi pi-list-check', tom: 'warning',
      titulo: 'Checklist abaixo da meta', valor: pct(c.coberturaChecklist.atual),
      texto: `${c.veiculosChecklistAbaixoMeta} veículo(s) com checklist em menos de 80% dos dias úteis.`,
      acao: { rotulo: 'Ver conformidade', alvo: { dimension: 'aba', value: 'conformidade' } }
    });
  }
  if (c.semSeguro && c.semSeguro.length > 0) {
    leituras.push({
      id: 'seguro', aba: 'conformidade', icone: 'pi pi-shield', tom: 'warning',
      titulo: 'Veículos sem seguro', valor: inteiro(c.semSeguro.length),
      texto: `${c.semSeguro.slice(0, 4).map((v) => v.placa).join(', ')}${c.semSeguro.length > 4 ? '…' : ''} sem apólice vigente hoje.`,
      acao: { rotulo: 'Ver conformidade', alvo: { dimension: 'aba', value: 'conformidade' } }
    });
  }
  if (r.uso.ociosos.length > 0) {
    leituras.push({
      id: 'ociosos', aba: 'uso', icone: 'pi pi-pause-circle', tom: 'info',
      titulo: 'Veículos ociosos', valor: inteiro(r.uso.ociosos.length),
      texto: 'Sem km e sem turno no período. Candidatos a remanejamento ou devolução (locados).',
      acao: { rotulo: 'Ver uso', alvo: { dimension: 'aba', value: 'uso' } }
    });
  }
  const csf = r.resumo.custoSobreFaturamento.atual;
  if (csf !== null) {
    leituras.push({
      id: 'faturamento', aba: 'uso', icone: 'pi pi-wallet',
      tom: csf > LIMITES_FROTA.custoSobreFaturamentoAtencao ? 'warning' : 'success',
      titulo: 'Custo da frota sobre o faturamento', valor: pct(csf),
      texto: `A frota custou ${moeda(total)} para ${moeda(r.uso.faturado.atual)} faturados pelas equipes com veículo.`,
      acao: { rotulo: 'Ver uso e produção', alvo: { dimension: 'aba', value: 'uso' } }
    });
  }

  leituras.sort((a, b) => PESO[a.tom] - PESO[b.tom]);
  return { veredito: veredito(r, disp, prev, varCusto, vencidos), leituras };
}

function veredito(r: RelatorioGerencialFrota, disp: number | null, prev: number | null, varCusto: number | null,
                  vencidos: number): VereditoGerencial {
  const total = moeda(r.resumo.custoTotal.atual);
  const custoKm = r.resumo.custoPorKm.atual != null ? ` (${moeda(r.resumo.custoPorKm.atual)}/km)` : '';
  const base = `A frota de ${r.recorte.emOperacao} veículos em operação custou ${total}${custoKm} no período.`;
  const progresso = disp !== null
    ? { valor: disp * 100, rotulo: `Disponibilidade ${pct(disp)}`, marcador: 95, rotuloMarcador: 'Meta 95%' }
    : undefined;
  if ((disp !== null && disp < LIMITES_FROTA.disponibilidadeCritica) || vencidos > 0) {
    return {
      tom: 'danger', rotulo: 'Agir agora',
      titulo: vencidos > 0 ? 'Há vencimentos em aberto' : 'Disponibilidade crítica',
      texto: `${base} ${vencidos > 0 ? `${vencidos} documento(s) ou CNH vencidos pedem regularização imediata.` : 'Muitos veículos parados por manutenção.'}`,
      progresso
    };
  }
  if ((disp !== null && disp < LIMITES_FROTA.disponibilidadeAtencao) || (prev !== null && prev < LIMITES_FROTA.preventivaMinima)
      || (varCusto !== null && varCusto > LIMITES_FROTA.aumentoCusto)) {
    return { tom: 'warning', rotulo: 'Acompanhar', titulo: 'Período pede atenção', texto: `${base} Veja as leituras abaixo.`, progresso };
  }
  return { tom: 'success', rotulo: 'Sob controle', titulo: 'Frota sob controle', texto: base, progresso };
}
