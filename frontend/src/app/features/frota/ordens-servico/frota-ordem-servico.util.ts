import {
  OrdemServico,
  ROTULO_APROVACAO,
  ROTULO_CRITICIDADE,
  ROTULO_ORIGEM_OS,
  ROTULO_SITUACAO_OS,
  ROTULO_TIPO_MANUTENCAO,
  ROTULO_TIPO_OFICINA,
  formatarPlaca
} from '../../../core/models/frota.models';
import { ColunaPlanilha, dataHoraPlanilha, horasEntre } from '../shared/frota-planilha';

/**
 * Fim do dia de hoje, para o `maxDate` dos campos de data e hora da OS. Um "agora" fixado
 * quando o componente nasce fica para trás e faz o datepicker descartar o valor sugerido.
 */
export function fimDeHoje(): Date {
  const data = new Date();
  data.setHours(23, 59, 59, 999);
  return data;
}

const CAUSA_PLANILHA: Record<string, string> = {
  AVARIA: 'Avaria',
  DESGASTE_NATURAL: 'Desgaste natural',
  USO_INDEVIDO: 'Uso indevido',
  SERVICO_CORRETIVO: 'Serviço corretivo',
  SERVICO_PREVENTIVO: 'Serviço preventivo',
  ESTOQUE: 'Estoque',
  SUBSTITUICAO_PNEUS: 'Substituição de pneus'
};

/**
 * Colunas da planilha detalhada das OS: uma linha por OS, com o que dá para calcular direto
 * (custo, tempo de serviço, tempo parado, por oficina, base ou tipo).
 */
export function colunasPlanilhaOs(motivos: Map<string, string>): ColunaPlanilha<OrdemServico>[] {
  return [
    { titulo: 'OS', valor: (o) => o.numero },
    { titulo: 'Placa', valor: (o) => (o.placa ? formatarPlaca(o.placa) : '') },
    { titulo: 'Equipamento', valor: (o) => o.descricaoEquipamento ?? '' },
    { titulo: 'Base', valor: (o) => o.base ?? '' },
    { titulo: 'Tipo de manutenção', valor: (o) => ROTULO_TIPO_MANUTENCAO[o.tipoManutencao] },
    { titulo: 'Origem', valor: (o) => ROTULO_ORIGEM_OS[o.origem] },
    { titulo: 'Criticidade', valor: (o) => ROTULO_CRITICIDADE[o.criticidade] },
    { titulo: 'Situação', valor: (o) => ROTULO_SITUACAO_OS[o.situacao] },
    { titulo: 'Motivo', valor: (o) => (o.motivo ? (motivos.get(o.motivo) ?? o.motivo) : '') },
    { titulo: 'Causa', valor: (o) => (o.causa ? (CAUSA_PLANILHA[o.causa] ?? o.causa) : '') },
    { titulo: 'Itens de manutenção', valor: (o) => o.itens.join(', ') },
    { titulo: 'Problema relatado', valor: (o) => o.descricao },
    { titulo: 'Serviço realizado', valor: (o) => o.descricaoServico ?? '' },
    { titulo: 'Itens substituídos', valor: (o) => o.itensSubstituidos ?? '' },
    { titulo: 'Tipo de oficina', valor: (o) => ROTULO_TIPO_OFICINA[o.tipoOficina] },
    { titulo: 'Oficina / fornecedor', valor: (o) => o.oficina },
    { titulo: 'Condutor', valor: (o) => o.condutor ?? '' },
    { titulo: 'Aberta por', valor: (o) => o.usuarioAbertura ?? '' },
    { titulo: 'Abertura', valor: (o) => dataHoraPlanilha(o.abertaEm) },
    { titulo: 'Agendada para', valor: (o) => dataHoraPlanilha(o.agendadaPara) },
    { titulo: 'Início', valor: (o) => dataHoraPlanilha(o.inicioReal) },
    { titulo: 'Previsão de término', valor: (o) => dataHoraPlanilha(o.previsaoTermino) },
    { titulo: 'Fim', valor: (o) => dataHoraPlanilha(o.fimReal) },
    { titulo: 'Horas de serviço (início ao fim)', valor: (o) => horasEntre(o.inicioReal, o.fimReal) },
    { titulo: 'Horas da abertura ao fim', valor: (o) => horasEntre(o.abertaEm, o.fimReal) },
    { titulo: 'Veículo parado', valor: (o) => (o.veiculoParado ? 'Sim' : 'Não') },
    { titulo: 'Parado desde', valor: (o) => dataHoraPlanilha(o.paradoDesde) },
    { titulo: 'Liberado em', valor: (o) => dataHoraPlanilha(o.liberadoEm) },
    { titulo: 'Horas parado', valor: (o) => (o.veiculoParado ? horasEntre(o.paradoDesde, o.liberadoEm ?? new Date().toISOString()) : null) },
    { titulo: 'Prazo estourado', valor: (o) => (o.atrasada ? 'Sim' : 'Não') },
    { titulo: 'Repetição', valor: (o) => (o.temRepeticao ? 'Sim' : 'Não') },
    { titulo: 'Unidade de medição', valor: (o) => (o.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM') },
    { titulo: 'KM / horímetro na abertura', valor: (o) => o.kmAbertura },
    { titulo: 'KM / horímetro na entrega', valor: (o) => o.kmEncerramento },
    { titulo: 'Valor total (R$)', valor: (o) => o.valorTotal },
    { titulo: 'Orçamento', valor: (o) => ROTULO_APROVACAO[o.situacaoAprovacao] },
    { titulo: 'Solicitações no financeiro', valor: (o) => o.quantidadeOrcamentos },
    { titulo: 'Cancelada em', valor: (o) => dataHoraPlanilha(o.canceladaEm) },
    { titulo: 'Motivo do cancelamento', valor: (o) => o.motivoCancelamento ?? '' }
  ];
}
