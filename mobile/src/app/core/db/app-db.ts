import Dexie, { Table } from 'dexie';
import { environment } from '../../../environments/environment';
import {
  EquipeLocal,
  BaseOperacionalLocal,
  ColaboradorLocal,
  MunicipioLocal,
  VeiculoLocal,
  MaterialLocal,
  EstoqueLocal,
  SaldoLocal,
  SaldoSerieLocal,
  ProcessoLocal,
  AcaoComercialLocal,
  TipoServicoLocal,
  SolicitacaoLocal,
  TransferenciaLocal,
  ExecucaoCampoLocal,
  TurnoLocal,
  OutboxItem,
  InspecaoLocal,
  FormularioLocal,
  TipoInspecaoLocal
} from './models';
import { ChecklistVeiculoLocal } from '../frota/checklist-veiculo.models';
import { AbastecimentoLocal } from '../frota/abastecimento.models';

export class AppDatabase extends Dexie {
  equipe!: Table<EquipeLocal>;
  basesOperacionais!: Table<BaseOperacionalLocal>;
  colaboradores!: Table<ColaboradorLocal>;
  municipios!: Table<MunicipioLocal>;
  veiculos!: Table<VeiculoLocal>;
  materiais!: Table<MaterialLocal>;
  estoque!: Table<EstoqueLocal>;
  saldos!: Table<SaldoLocal>;
  saldosSeriais!: Table<SaldoSerieLocal>;
  processos!: Table<ProcessoLocal>;
  acoes!: Table<AcaoComercialLocal>;
  tiposServico!: Table<TipoServicoLocal>;
  
  // Tabelas de operação offline
  solicitacoes!: Table<SolicitacaoLocal>;
  transferencias!: Table<TransferenciaLocal>;
  execucoesCampo!: Table<ExecucaoCampoLocal>;
  turnos!: Table<TurnoLocal>;
  inspecoes!: Table<InspecaoLocal>;
  tiposInspecao!: Table<TipoInspecaoLocal>;
  formularios!: Table<FormularioLocal>;
  /** Checklists do veículo: rascunho, fila e enviados (com as fotos até subirem). */
  checklistsVeiculo!: Table<ChecklistVeiculoLocal>;
  /** Pedidos de abastecimento: rascunho, fila, a situação do servidor e o realizado (com as fotos até subirem). */
  abastecimentos!: Table<AbastecimentoLocal>;
  outbox!: Table<OutboxItem>;
  config!: Table<{ key: string, value: any }>;

  constructor() {
    super(environment.dbName);
    this.version(environment.dbVersion).stores({
      equipe: 'id, codigo',
      basesOperacionais: 'id, nome',
      colaboradores: 'id, idUsuario, nomeCompleto, ativo',
      municipios: 'id, nome, ativo',
      veiculos: 'id, placa, ativo',
      materiais: 'id, codigo, descricao',
      estoque: 'id, nomeIdentificador',
      saldos: 'id, idEstoque, idMaterial, condicao',
      saldosSeriais: 'id, idEstoque, idMaterial, numSerie, condicao',
      processos: 'id, nome, ativo',
      acoes: 'id, codigo, nome, ativo',
      tiposServico: 'id, codigo, descricao, ativo',
      solicitacoes: 'id, status, idRequisitante, dataSolicitacao',
      transferencias: 'id, idEstoqueOrigem, idEstoqueDestino, dataTransferencia, statusSync',
      execucoesCampo: 'id, statusExecucao, idEquipe, idTurno, dataLancamento',
      turnos: 'id, idEquipe, status',
      eventosTurno: null,
      inspecoes: 'id, status, idInspetor, dataRealizacao, statusSync',
      tiposInspecao: 'id, nome, ordem, ativo',
      formularios: 'id, titulo, ativo',
      checklistsVeiculo: 'id, statusSync, idVeiculo, criadoEm',
      abastecimentos: 'id, statusSync, idVeiculo, criadoEm',
      outbox: 'id, status, criadoEm',
      config: 'key'
    }).upgrade(tx => tx.table('execucoesCampo').toCollection().modify(migrarExecucaoParaLancamentoUnico));
  }
}

/**
 * v8: o lançamento da nota passou a ser feito de uma só vez. Registros gravados por
 * versões anteriores trazem `dataInicio`/`dataFim` e localização de início/fim; aqui
 * viram `dataLancamento` e uma única localização, sem perder nada que ainda importe.
 * Exportada para teste.
 */
export function migrarExecucaoParaLancamentoUnico(execucao: Record<string, unknown>): void {
  if (execucao['dataLancamento'] === undefined) {
    execucao['dataLancamento'] = execucao['dataInicio'] ?? execucao['dataFim'];
  }
  if (execucao['latitude'] === undefined && execucao['latitudeInicio'] !== undefined) {
    execucao['latitude'] = execucao['latitudeInicio'];
  }
  if (execucao['longitude'] === undefined && execucao['longitudeInicio'] !== undefined) {
    execucao['longitude'] = execucao['longitudeInicio'];
  }
  for (const legado of ['dataInicio', 'dataFim', 'latitudeInicio', 'longitudeInicio', 'latitudeFim', 'longitudeFim']) {
    delete execucao[legado];
  }
}

export const db = new AppDatabase();
