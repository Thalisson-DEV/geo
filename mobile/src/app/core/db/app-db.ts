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
  TransferenciaLocal,
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
  
  // Tabelas de operação offline
  transferencias!: Table<TransferenciaLocal>;
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
      // v12: o fluxo comercial (notas, ações, tipos de serviço) saiu do app.
      acoes: null,
      tiposServico: null,
      // v13: a equipe de campo não pede material (vem da programação ou de solicitação manual).
      solicitacoes: null,
      transferencias: 'id, idEstoqueOrigem, idEstoqueDestino, dataTransferencia, statusSync',
      execucoesCampo: null,
      turnos: 'id, idEquipe, status',
      eventosTurno: null,
      inspecoes: 'id, status, idInspetor, dataRealizacao, statusSync',
      tiposInspecao: 'id, nome, ordem, ativo',
      formularios: 'id, titulo, ativo',
      checklistsVeiculo: 'id, statusSync, idVeiculo, criadoEm',
      abastecimentos: 'id, statusSync, idVeiculo, criadoEm',
      outbox: 'id, status, criadoEm',
      config: 'key'
    });
  }
}

export const db = new AppDatabase();
