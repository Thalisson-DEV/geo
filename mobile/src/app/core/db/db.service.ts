import { Injectable } from '@angular/core';
import { db } from './app-db';
import { maisAntiga, ordenarMaisAntigas } from '../saldo/tempo-saldo';
import { registrarIdTrocado } from '../sync/ids-trocados';
import {
  EquipeLocal,
  BaseOperacionalLocal,
  ColaboradorLocal,
  MunicipioLocal,
  VeiculoLocal,
  MaterialLocal,
  EstoqueLocal,
  ProcessoLocal,
  SaldoLocal,
  SaldoSerieLocal,
  TransferenciaLocal,
  TurnoLocal,
  OutboxItem,
  InspecaoLocal,
  TipoInspecaoLocal,
  ComposicaoEquipeLocal
} from './models';

@Injectable({
  providedIn: 'root'
})
export class DbService {
  // Facade simplificada para acesso ao IndexedDB via Dexie

  async clearAllData(): Promise<void> {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map(table => table.clear()));
    });
  }

  /** Impede que outra conta receba ou envie operações deixadas neste aparelho. */
  async prepareForLogin(nextUserId: string, currentUserId: string | null): Promise<void> {
    if (currentUserId === nextUserId) return;

    await db.transaction('rw', db.tables, async () => {
      const [outbox, turnos, transferencias, inspecoes] = await Promise.all([
        db.outbox.toArray(),
        db.turnos.toArray(),
        db.transferencias.toArray(),
        db.inspecoes.toArray(),
      ]);
      const hasPendingWork = outbox.some(item => item.status !== 'SINCRONIZADO') ||
        turnos.some(turno => turno.status === 'ABERTO') ||
        transferencias.some(transferencia => transferencia.statusSync !== 'SINCRONIZADO') ||
        inspecoes.some(inspecao => inspecao.statusSync !== 'SINCRONIZADO');

      if (hasPendingWork) {
        throw new Error('Este aparelho contém um turno ou operações pendentes de outra conta. Entre com a conta da equipe anterior e sincronize antes de trocar de usuário.');
      }

      await Promise.all(db.tables.map(table => table.clear()));
    });
  }

  // Equipe
  async saveEquipe(equipe: EquipeLocal): Promise<void> {
    await db.equipe.put(equipe);
  }
  async getEquipe(): Promise<EquipeLocal | undefined> {
    return db.equipe.toCollection().first();
  }
  async replaceEquipes(equipes: EquipeLocal[]): Promise<void> {
    await db.transaction('rw', db.equipe, async () => {
      await db.equipe.clear();
      await db.equipe.bulkPut(equipes);
    });
  }
  async getEquipes(): Promise<EquipeLocal[]> {
    return db.equipe.toArray();
  }

  // Bases operacionais
  async replaceBasesOperacionais(bases: BaseOperacionalLocal[]): Promise<void> {
    await db.transaction('rw', db.basesOperacionais, async () => {
      await db.basesOperacionais.clear();
      await db.basesOperacionais.bulkPut(bases);
    });
  }

  async getBasesOperacionaisAtivas(): Promise<BaseOperacionalLocal[]> {
    const bases = await db.basesOperacionais.filter(base => base.ativo).toArray();
    return bases.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Colaboradores
  async bulkSaveColaboradores(colaboradores: ColaboradorLocal[]): Promise<void> {
    await db.colaboradores.bulkPut(colaboradores);
  }
  async clearColaboradores(): Promise<void> {
    await db.colaboradores.clear();
  }
  async replaceColaboradores(colaboradores: ColaboradorLocal[]): Promise<void> {
    await db.transaction('rw', db.colaboradores, async () => {
      await db.colaboradores.clear();
      await db.colaboradores.bulkPut(colaboradores);
    });
  }
  async getColaboradoresAtivos(): Promise<ColaboradorLocal[]> {
    return db.colaboradores.filter(c => c.ativo).toArray();
  }

  async getMembrosEquipe(): Promise<ColaboradorLocal[]> {
    return db.colaboradores.toArray();
  }

  // Config/Sync stats
  async setConfig(key: string, value: any): Promise<void> {
    await db.config.put({ key, value });
  }

  async getConfig(key: string): Promise<any> {
    const item = await db.config.get(key);
    return item?.value;
  }

  // Municipios
  async bulkSaveMunicipios(municipios: MunicipioLocal[]): Promise<void> {
    await db.municipios.bulkPut(municipios);
  }
  async replaceMunicipios(municipios: MunicipioLocal[]): Promise<void> {
    await db.transaction('rw', db.municipios, async () => {
      await db.municipios.clear();
      await db.municipios.bulkPut(municipios);
    });
  }
  async getMunicipios(): Promise<MunicipioLocal[]> {
    // `ativo` é boolean — Dexie não indexa booleans, então filtramos em memória.
    return db.municipios.filter(m => m.ativo).toArray();
  }

  // Turnos
  async saveTurno(turno: TurnoLocal): Promise<void> {
    await db.turnos.put(turno);
  }

  async getTurnoAtivo(): Promise<TurnoLocal | undefined> {
    return db.turnos.where('status').equals('ABERTO').first();
  }

  async fecharTurnoLocal(
    id: string,
    dataFim: string,
    encerramento?: Pick<TurnoLocal, 'encerradoAutomaticamente' | 'motivoEncerramento'>
  ): Promise<void> {
    await db.turnos.update(id, { status: 'FECHADO', dataFim, ...encerramento });
  }

  /** Turno mais recente do aparelho (aberto ou fechado). */
  async getUltimoTurno(): Promise<TurnoLocal | undefined> {
    const turnos = await db.turnos.toArray();
    return turnos.sort((a, b) => b.dataInicio.localeCompare(a.dataInicio))[0];
  }

  async countInspecoesHoje(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    return db.inspecoes
      .filter(i => !!i.dataRealizacao && i.dataRealizacao.startsWith(today))
      .count();
  }

  async saveInspecao(inspecao: InspecaoLocal): Promise<void> {
    await db.inspecoes.put(inspecao);
  }

  async getInspecoes(): Promise<InspecaoLocal[]> {
    return db.inspecoes
      .orderBy('dataRealizacao')
      .reverse()
      .toArray();
  }

  async getInspecao(id: string): Promise<InspecaoLocal | undefined> {
    return db.inspecoes.get(id);
  }

  async deleteInspecao(id: string): Promise<void> {
    await db.inspecoes.delete(id);
  }

  async replaceInspecoesSincronizadas(novas: InspecaoLocal[]): Promise<void> {
    await db.transaction('rw', [db.inspecoes, db.outbox], async () => {
      const outbox = await db.outbox.toArray();
      const pendingIds = new Set(
        outbox
          .filter(o => o.status !== 'SINCRONIZADO' && o.endpoint?.includes('inspecoes'))
          .map(o => o.payload?.id || o.payload?.tempId)
          .filter(Boolean)
      );
      const serverIds = new Set(novas.map(e => e.id));

      const allLocal = await db.inspecoes.toArray();
      const toDelete = allLocal
        .filter(e => e.statusSync === 'SINCRONIZADO' && !pendingIds.has(e.id) && !serverIds.has(e.id))
        .map(e => e.id);

      if (toDelete.length > 0) {
        await db.inspecoes.bulkDelete(toDelete);
      }
      await db.inspecoes.bulkPut(novas);
    });
  }

  async countMembrosAtivos(): Promise<number> {
    return db.colaboradores.filter(c => c.ativo).count();
  }

  // Veiculos
  async bulkSaveVeiculos(veiculos: VeiculoLocal[]): Promise<void> {
    await db.veiculos.bulkPut(veiculos);
  }
  async replaceVeiculos(veiculos: VeiculoLocal[]): Promise<void> {
    await db.transaction('rw', db.veiculos, async () => {
      await db.veiculos.clear();
      await db.veiculos.bulkPut(veiculos);
    });
  }

  async getVeiculos(): Promise<VeiculoLocal[]> {
    return db.veiculos.toArray();
  }

  // Processos
  async bulkSaveProcessos(processos: ProcessoLocal[]): Promise<void> {
    await db.processos.bulkPut(processos);
  }
  async replaceProcessos(processos: ProcessoLocal[]): Promise<void> {
    await db.transaction('rw', db.processos, async () => {
      await db.processos.clear();
      await db.processos.bulkPut(processos);
    });
  }
  async getProcessos(): Promise<ProcessoLocal[]> {
    return db.processos.toArray();
  }

  // Materiais
  async bulkSaveMateriais(materiais: MaterialLocal[]): Promise<void> {
    await db.materiais.bulkPut(materiais);
  }
  async replaceMateriais(materiais: MaterialLocal[]): Promise<void> {
    await db.transaction('rw', db.materiais, async () => {
      await db.materiais.clear();
      await db.materiais.bulkPut(materiais);
    });
  }

  async getMateriais(): Promise<MaterialLocal[]> {
    return db.materiais.toArray();
  }

  // Estoques
  async bulkSaveEstoques(estoques: EstoqueLocal[]): Promise<void> {
    await db.estoque.bulkPut(estoques);
  }
  async replaceEstoques(estoques: EstoqueLocal[]): Promise<void> {
    await db.transaction('rw', db.estoque, async () => {
      await db.estoque.clear();
      await db.estoque.bulkPut(estoques);
    });
  }

  async getEstoques(): Promise<EstoqueLocal[]> {
    return db.estoque.toArray();
  }

  async getEstoquesDisponiveis(idEstoqueEquipe: string): Promise<EstoqueLocal[]> {
    return db.estoque
      .filter(e => e.id !== idEstoqueEquipe)
      .toArray();
  }

  /**
   * Registra uma transferência de estoque offline:
   * 1. Deduz o saldo local da equipe.
   * 2. Enfileira a operação no Outbox.
   */
  async registrarTransferenciaOffline(
    idEstoqueOrigem: string,
    idEstoqueDestino: string,
    itens: { idMaterial: string, quantidade: number, numSerie: string | null, condicao: 'NOVO' | 'SUCATA' }[],
    assinaturaEntregador?: string,
    assinaturaRecebedor?: string
  ): Promise<void> {
    const tempId = crypto.randomUUID();
    
    await db.transaction('rw', [db.saldos, db.saldosSeriais, db.outbox, db.transferencias], async () => {
      // 1. Deduzir saldos locais
      for (const item of itens) {
        await this.deduzirSaldoLocal(
          idEstoqueOrigem,
          item.idMaterial,
          item.quantidade,
          item.condicao,
          item.numSerie ? [item.numSerie] : []
        );
      }

      // 2. Criar registro local para histórico
      const local: TransferenciaLocal = {
        id: tempId,
        idEstoqueOrigem,
        idEstoqueDestino,
        dataTransferencia: new Date().toISOString(),
        itens,
        assinaturaEntregador,
        assinaturaRecebedor,
        statusSync: 'PENDENTE'
      };
      await db.transferencias.add(local);

      // 3. Criar item no Outbox
      const outboxItem: OutboxItem = {
        id: crypto.randomUUID(),
        endpoint: '/v1/movimentacoes-estoque/transferencia',
        method: 'POST',
        payload: {
          idEstoqueOrigem,
          idEstoqueDestino,
          itens,
          assinaturaEntregador,
          assinaturaRecebedor,
          tempId // Para vincular ao registro local no sync
        },
        status: 'PENDENTE',
        tentativas: 0,
        criadoEm: new Date()
      };

      await db.outbox.add(outboxItem);
    });
  }

  // Formulários de Inspeção
  async replaceFormularios(formularios: any[]): Promise<void> {
    await db.transaction('rw', db.formularios, async () => {
      await db.formularios.clear();
      await db.formularios.bulkPut(formularios);
    });
  }

  async getFormularios(): Promise<any[]> {
    return await db.formularios.toArray();
  }

  async getFormularioById(id: string): Promise<any | undefined> {
    return await db.formularios.get(id);
  }

  // Tipos de Inspeção
  async bulkSaveTiposInspecao(tipos: TipoInspecaoLocal[]): Promise<void> {
    await db.tiposInspecao.bulkPut(tipos);
  }

  async replaceTiposInspecao(tipos: TipoInspecaoLocal[]): Promise<void> {
    await db.transaction('rw', db.tiposInspecao, async () => {
      await db.tiposInspecao.clear();
      await db.tiposInspecao.bulkPut(tipos);
    });
  }

  async getTiposInspecao(): Promise<TipoInspecaoLocal[]> {
    const tipos = await db.tiposInspecao.toArray();
    return tipos.sort((a, b) => a.ordem - b.ordem);
  }

  async getTiposInspecaoAtivos(): Promise<TipoInspecaoLocal[]> {
    const tipos = await db.tiposInspecao.filter(t => t.ativo).toArray();
    return tipos.sort((a, b) => a.ordem - b.ordem);
  }

  async getTipoInspecaoById(id: string): Promise<TipoInspecaoLocal | undefined> {
    return db.tiposInspecao.get(id);
  }

  // Saldos
  async bulkSaveSaldos(saldos: SaldoLocal[]): Promise<void> {
    await db.saldos.bulkPut(saldos);
  }

  async clearSaldos(): Promise<void> {
    await db.saldos.clear();
  }

  /**
   * Substitui todos os saldos de forma atômica para evitar flicker na UI reativa.
   */
  async replaceSaldos(saldos: SaldoLocal[]): Promise<void> {
    await db.transaction('rw', db.saldos, async () => {
      await db.saldos.clear();
      await db.saldos.bulkPut(saldos);
    });
  }

  async getSaldos(): Promise<SaldoLocal[]> {
    return db.saldos.toArray();
  }

  // Saldos Seriais
  async bulkSaveSaldosSeriais(seriais: SaldoSerieLocal[]): Promise<void> {
    await db.saldosSeriais.bulkPut(seriais);
  }

  async clearSaldosSeriais(): Promise<void> {
    await db.saldosSeriais.clear();
  }

  /**
   * Substitui todos os seriais de forma atômica para evitar flicker na UI reativa.
   */
  async replaceSaldosSeriais(seriais: SaldoSerieLocal[]): Promise<void> {
    await db.transaction('rw', db.saldosSeriais, async () => {
      await db.saldosSeriais.clear();
      await db.saldosSeriais.bulkPut(seriais);
    });
  }

  async deduzirSaldoLocal(idEstoque: string, idMaterial: string, quantidade: number, condicao: 'NOVO' | 'SUCATA', numSeries?: string[]): Promise<void> {
    const saldos = await db.saldos
      .where('idEstoque').equals(idEstoque)
      .and(s => s.idMaterial === idMaterial && s.condicao === condicao)
      .toArray();

    if (saldos.length > 0) {
      const saldo = saldos[0];
      saldo.quantidade = Math.max(0, saldo.quantidade - quantidade);
      await db.saldos.put(saldo);
    }

    if (numSeries && numSeries.length > 0) {
      const seriais = await db.saldosSeriais
        .where('idEstoque').equals(idEstoque)
        .and(s => s.idMaterial === idMaterial && s.condicao === condicao && numSeries.includes(s.numSerie))
        .toArray();

      for (const serie of seriais) {
        await db.saldosSeriais.delete(serie.id);
      }
    }
  }

  /**
   * Devolve ao saldo local o material que saiu de uma nota alterada no aparelho. O
   * servidor faz o estorno de verdade; aqui é só a projeção até o próximo sync.
   */
  async devolverSaldoLocal(idEstoque: string, idMaterial: string, quantidade: number, condicao: 'NOVO' | 'SUCATA'): Promise<void> {
    const saldo = await db.saldos
      .where('idEstoque').equals(idEstoque)
      .and(s => s.idMaterial === idMaterial && s.condicao === condicao)
      .first();
    if (saldo) {
      saldo.quantidade = saldo.quantidade + quantidade;
      await db.saldos.put(saldo);
    }
  }

  async getSeriaisDoEstoque(idEstoque: string): Promise<SaldoSerieLocal[]> {
    return db.saldosSeriais.where('idEstoque').equals(idEstoque).toArray();
  }

  async getSeriaisPorMaterial(idEstoque: string, idMaterial: string, condicao?: 'NOVO' | 'SUCATA'): Promise<SaldoSerieLocal[]> {
    return db.saldosSeriais
      .where('idEstoque')
      .equals(idEstoque)
      .filter(s => s.idMaterial === idMaterial && s.ativo && (!condicao || s.condicao === condicao))
      .toArray()
      // A mais antiga primeiro: é a que deve sair antes.
      .then(ordenarMaisAntigas);
  }

  // Outbox
  async enqueueOutbox(item: OutboxItem): Promise<string> {
    return db.outbox.add(item) as Promise<string>;
  }
  async getPendingOutbox(): Promise<OutboxItem[]> {
    return db.outbox
      .where('status')
      .anyOf(['PENDENTE', 'ERRO', 'RESULTADO_INCERTO'])
      .toArray();
  }

  // Transferencias
  async getTransferencias(): Promise<TransferenciaLocal[]> {
    return db.transferencias
      .orderBy('dataTransferencia')
      .reverse()
      .toArray();
  }

  async getTransferenciaById(id: string): Promise<TransferenciaLocal | undefined> {
    return db.transferencias.get(id);
  }

  async saveTransferencia(transferencia: TransferenciaLocal): Promise<void> {
    await db.transferencias.put(transferencia);
  }

  async deleteTransferencia(id: string): Promise<void> {
    await db.transferencias.delete(id);
  }

  /**
   * Substitui as transferências sincronizadas pelo servidor, preservando as pendentes no outbox
   * e mantendo as assinaturas digitais já coletadas localmente.
   */
  async replaceTransferenciasSincronizadas(novas: TransferenciaLocal[]): Promise<void> {
    await db.transaction('rw', [db.transferencias, db.outbox], async () => {
      const outbox = await db.outbox.toArray();
      const pendingIds = new Set(
        outbox
          .filter(o => o.status !== 'SINCRONIZADO' && o.endpoint?.includes('movimentacoes-estoque/transferencia'))
          .map(o => o.payload?.id || o.payload?.tempId)
          .filter(Boolean)
      );
      const serverIds = new Set(novas.map(t => t.id));

      const allLocal = await db.transferencias.toArray();
      const localMap = new Map(allLocal.map(t => [t.id, t]));
      const unmappedLocals = allLocal.filter(l => !serverIds.has(l.id) && !pendingIds.has(l.id));

      const toDelete = allLocal
        .filter(t => t.statusSync === 'SINCRONIZADO' && !pendingIds.has(t.id) && !serverIds.has(t.id))
        .map(t => t.id);

      if (toDelete.length > 0) {
        await db.transferencias.bulkDelete(toDelete);
      }

      const mergedNovas = novas.map(nova => {
        let local = localMap.get(nova.id);
        if (!local) {
          local = unmappedLocals.find(u =>
            u.idEstoqueOrigem === nova.idEstoqueOrigem &&
            u.idEstoqueDestino === nova.idEstoqueDestino &&
            (u.assinaturaEntregador?.startsWith('data:image/') || u.assinaturaRecebedor?.startsWith('data:image/'))
          );
        }

        const assinaturaEntregador = (local?.assinaturaEntregador?.startsWith('data:image/') ? local.assinaturaEntregador : undefined)
          || nova.assinaturaEntregador
          || local?.assinaturaEntregador;
        const assinaturaRecebedor = (local?.assinaturaRecebedor?.startsWith('data:image/') ? local.assinaturaRecebedor : undefined)
          || nova.assinaturaRecebedor
          || local?.assinaturaRecebedor;

        return {
          ...nova,
          assinaturaEntregador,
          assinaturaRecebedor
        };
      });

      await db.transferencias.bulkPut(mergedNovas);
    });
  }

  async getOutboxItemByTransferenciaId(transferenciaId: string): Promise<OutboxItem | undefined> {
    return db.outbox
      .filter(item =>
        item.endpoint === '/v1/movimentacoes-estoque/transferencia' &&
        item.payload?.tempId === transferenciaId
      )
      .first();
  }

  // Saldos
  async getSaldosComMateriais(idEstoque: string): Promise<any[]> {
    const saldos = await db.saldos
      .where('idEstoque')
      .equals(idEstoque)
      .and(s => s.ativo && s.quantidade > 0)
      .toArray();

    const [materiais, seriais] = await Promise.all([
      db.materiais.toArray(),
      db.saldosSeriais.where('idEstoque').equals(idEstoque).filter(s => s.ativo).toArray(),
    ]);
    const materiaisMap = new Map(materiais.map(m => [m.id, m]));
    // Material com série: a idade que importa é a da série há mais tempo no caminhão.
    const datasSeries = new Map<string, (string | null | undefined)[]>();
    for (const s of seriais) {
      const chave = `${s.idMaterial}|${s.condicao}`;
      const datas = datasSeries.get(chave) ?? [];
      datas.push(s.noSaldoDesde);
      datasSeries.set(chave, datas);
    }

    return saldos.map(s => {
      const material = materiaisMap.get(s.idMaterial);
      return {
        id: s.id,
        idMaterial: s.idMaterial,
        quantidade: s.quantidade,
        condicao: s.condicao,
        ultimaMovimentacao: s.ultimaMovimentacao ?? null,
        serieMaisAntiga: maisAntiga(datasSeries.get(`${s.idMaterial}|${s.condicao}`) ?? []),
        codigo: material?.codigo || 'N/A',
        descricao: material?.descricao || 'Material não encontrado',
        unidadeMedida: material?.unidadeMedida || 'UN',
        detalhaSerie: material?.detalhaSerie || false
      };
    }).sort((a, b) => a.descricao.localeCompare(b.descricao) || a.condicao.localeCompare(b.condicao));
  }

  // Composição da equipe (conferência na abertura do turno)
  async saveComposicaoEquipe(composicao: ComposicaoEquipeLocal): Promise<void> {
    await this.setConfig('composicaoEquipe', composicao);
  }

  async getComposicaoEquipe(): Promise<ComposicaoEquipeLocal | undefined> {
    return this.getConfig('composicaoEquipe');
  }

  // ... Outros métodos serão adicionados conforme a necessidade das features
}

