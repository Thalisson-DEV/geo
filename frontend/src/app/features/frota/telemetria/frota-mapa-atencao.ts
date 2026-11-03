import { Params } from '@angular/router';

import { VeiculoMapa } from '../../../core/models/frota-telemetria.models';

/**
 * Eventos de condução (excesso de velocidade, frenagem) são comuns: um ou outro só informa.
 * A partir deste total em 24 h o veículo passa a pedir atenção.
 */
export const EVENTOS_ATENCAO_24H = 15;

export type TomMotivo = 'danger' | 'warning' | 'info';

/** Um motivo para olhar o veículo agora, com o atalho para resolver onde isso se resolve. */
export interface MotivoMapa {
  chave: string;
  texto: string;
  tom: TomMotivo;
  icone: string;
  /** Ordena a lista: o mais grave primeiro. */
  peso: number;
  acao: { rotulo: string; rota: unknown[]; queryParams?: Params } | null;
}

/**
 * Tudo que pede uma decisão sobre o veículo, do mais grave ao mais leve. Perigo e aviso contam
 * como "pede atenção"; informação (OS em dia, abastecimento liberado) só aparece no cartão.
 */
export function motivosDoVeiculo(v: VeiculoMapa): MotivoMapa[] {
  const a = v.atencao;
  const ficha = ['/frota/veiculos', v.idVeiculo];
  const motivos: MotivoMapa[] = [];
  const andando = v.estado === 'EM_MOVIMENTO';

  if (andando && (v.situacaoOperacional === 'EM_MANUTENCAO' || v.situacaoOperacional === 'PARADO')) {
    const situacao = v.situacaoOperacional === 'EM_MANUTENCAO' ? 'em manutenção' : 'parado';
    motivos.push({ chave: 'rodando-parado', texto: `Rodando, mas a ficha diz que está ${situacao}`, tom: 'danger',
      icone: 'pi pi-exclamation-circle', peso: 100, acao: { rotulo: 'Ver manutenções', rota: ficha, queryParams: { aba: 'manutencoes' } } });
  } else if (andando && v.situacaoOperacional === 'RESERVA') {
    motivos.push({ chave: 'reserva-em-uso', texto: 'Veículo reserva rodando', tom: 'warning', icone: 'pi pi-car', peso: 55,
      acao: { rotulo: 'Ver ficha', rota: ficha } });
  }
  if (a?.cnhVencida) {
    motivos.push({ chave: 'cnh', texto: 'CNH do condutor vencida', tom: 'danger', icone: 'pi pi-id-card', peso: 90,
      acao: a.idCondutor ? { rotulo: 'Ver CNH', rota: ['/frota/condutores'], queryParams: { condutor: a.idCondutor } } : null });
  }
  if (a?.os?.atrasada) {
    motivos.push({ chave: 'os', texto: `OS ${a.os.numero} com prazo estourado`, tom: 'danger', icone: 'pi pi-wrench', peso: 80,
      acao: { rotulo: `Ver OS ${a.os.numero}`, rota: ['/frota/ordens-servico', a.os.id] } });
  }
  if (a?.foraDoExpediente) {
    motivos.push({ chave: 'expediente', texto: 'Rodando fora do expediente', tom: 'warning', icone: 'pi pi-moon', peso: 70,
      acao: { rotulo: 'Ver uso', rota: ficha, queryParams: { aba: 'telemetria' } } });
  }
  if (v.documentosVencidos) {
    motivos.push({ chave: 'documentos', texto: v.documentosVencidos === 1 ? '1 documento vencido' : `${v.documentosVencidos} documentos vencidos`,
      tom: 'danger', icone: 'pi pi-file', peso: 60, acao: { rotulo: 'Ver documentos', rota: ficha, queryParams: { aba: 'documentos' } } });
  }
  if (a?.semChecklistHoje) {
    motivos.push({ chave: 'checklist', texto: 'Usado hoje sem checklist', tom: 'warning', icone: 'pi pi-list-check', peso: 50,
      acao: { rotulo: 'Ver sem checklist', rota: ['/frota/checklists'], queryParams: { aba: 'sem-checklist', busca: v.placa } } });
  }
  if (a?.pendenciasChecklist) {
    motivos.push({ chave: 'pendencias', texto: a.pendenciasChecklist === 1 ? '1 problema do checklist sem decisão' : `${a.pendenciasChecklist} problemas do checklist sem decisão`,
      tom: 'warning', icone: 'pi pi-flag', peso: 45, acao: { rotulo: 'Decidir', rota: ['/frota/checklists'], queryParams: { aba: 'pendencias', busca: v.placa } } });
  }
  if (v.eventos24h) {
    const muitos = v.eventos24h >= EVENTOS_ATENCAO_24H;
    motivos.push({ chave: 'eventos', texto: v.eventos24h === 1 ? '1 evento de condução em 24 h' : `${v.eventos24h} eventos de condução em 24 h`,
      tom: muitos ? 'warning' : 'info', icone: 'pi pi-bolt', peso: muitos ? 40 : 5, acao: { rotulo: 'Ver eventos', rota: ['/frota/telemetria/eventos'], queryParams: { busca: v.placa } } });
  }
  if (a?.abastecimento?.situacao === 'AGUARDANDO_APROVACAO') {
    motivos.push({ chave: 'abastecimento', texto: 'Abastecimento aguardando aprovação', tom: 'warning', icone: 'pi pi-gauge', peso: 30,
      acao: { rotulo: 'Ver pedido', rota: ['/frota/abastecimentos'], queryParams: { abastecimento: a.abastecimento.id } } });
  } else if (a?.abastecimento) {
    motivos.push({ chave: 'abastecimento', texto: `Abastecimento ${a.abastecimento.situacaoRotulo.toLowerCase()}`, tom: 'info', icone: 'pi pi-gauge',
      peso: 10, acao: { rotulo: 'Ver pedido', rota: ['/frota/abastecimentos'], queryParams: { abastecimento: a.abastecimento.id } } });
  }
  if (a?.os && !a.os.atrasada) {
    const outras = a.osAbertas > 1 ? ` (+${a.osAbertas - 1})` : '';
    motivos.push({ chave: 'os', texto: `OS ${a.os.numero} ${a.os.situacaoRotulo.toLowerCase()}${a.os.veiculoParado ? ', veículo na oficina' : ''}${outras}`,
      tom: 'info', icone: 'pi pi-wrench', peso: 20, acao: { rotulo: `Ver OS ${a.os.numero}`, rota: ['/frota/ordens-servico', a.os.id] } });
  }
  return motivos.sort((x, y) => y.peso - x.peso);
}

/** Perigo ou aviso: entra no indicador "Pedem atenção" e sobe na lista. */
export function pedeAtencao(motivos: readonly MotivoMapa[]): boolean {
  return motivos.some((m) => m.tom !== 'info');
}
