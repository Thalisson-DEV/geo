import { describe, expect, it } from 'vitest';

import { AcompanhamentoMetaItem, AcompanhamentoMetasResponse } from '../../../core/models/meta-inspecao.models';
import { SstService } from '../../../core/services/sst.service';
import { chavePessoa, vistaMetas } from './analise-metas';

function item(parcial: Partial<AcompanhamentoMetaItem>): AcompanhamentoMetaItem {
  return {
    idMeta: 'meta-1',
    idTipoInspecao: 'tipo-campo',
    nomeTipoInspecao: 'Campo',
    origem: 'FUNCAO',
    idColaborador: 'colab-1',
    nomeColaborador: 'Ana Souza',
    possuiUsuario: true,
    idFuncao: 'funcao-1',
    nomeFuncao: 'Supervisor',
    idBaseOperacional: 'base-1',
    nomeBaseOperacional: 'Juazeiro',
    idCentroCusto: null,
    nomeCentroCusto: null,
    idProcesso: null,
    nomeProcesso: null,
    periodicidade: 'MENSAL',
    janelaInicio: '2026-10-01',
    janelaFim: '2026-10-31',
    diasRestantes: 1,
    meta: 40,
    realizado: 15,
    saldo: 25,
    percentualAtingimento: 37.5,
    status: 'EM_ANDAMENTO',
    idUsuario: 'usuario-1',
    ...parcial
  };
}

function contexto(itens: AcompanhamentoMetaItem[]) {
  const d: AcompanhamentoMetasResponse = {
    dataReferencia: '2026-10-30',
    totalColaboradores: itens.length,
    atingiram: 0,
    emAndamento: itens.length,
    naoAtingiram: 0,
    somaMetas: 0,
    somaRealizado: 0,
    percentualColaboradoresNaMeta: 0,
    percentualExecucaoGlobal: 0,
    itens
  };
  return { d, sst: {} as SstService };
}

describe('vistaMetas', () => {
  it('a pessoa mostra o ritmo, a projeção e o que falta por dia contando hoje', () => {
    const ana = item({});
    const vista = vistaMetas({ dimension: 'pessoa', value: chavePessoa(ana) }, contexto([ana]))!;

    expect(vista.titulo).toBe('Ana Souza');
    expect(vista.kpis.find((k) => k.rotulo === 'Realizado')?.valor).toBe('15 de 40');
    expect(vista.kpis.find((k) => k.rotulo === 'Termina')?.valor).toBe('Amanhã');
    // 15 em 30 dias = 0,5/dia → cerca de 16 no fim; faltam 25 em 2 dias (hoje e amanhã).
    expect(vista.destaques?.map((d) => d.texto)).toEqual([
      'No ritmo atual (0,5 por dia), termina o período com cerca de 16 de 40.',
      'Para fechar a meta, precisa de 12,5 inspeções por dia até o fim do período (hoje e amanhã).'
    ]);
    expect(vista.origem?.titulo).toBe('Inspeções de Ana Souza no período');
  });

  it('sem usuário não carrega inspeções e explica o zero', () => {
    const semAcesso = item({ possuiUsuario: false, idUsuario: null, realizado: 0, saldo: 40, percentualAtingimento: 0 });
    const vista = vistaMetas({ dimension: 'pessoa', value: chavePessoa(semAcesso) }, contexto([semAcesso]))!;

    expect(vista.origem).toBeUndefined();
    expect(vista.destaques?.[0].texto).toContain('não tem usuário no sistema');
  });

  it('a base resume as pessoas dela e leva a cada uma', () => {
    const ana = item({});
    const bia = item({ idColaborador: 'colab-2', nomeColaborador: 'Bia Lima', realizado: 40, saldo: 0, percentualAtingimento: 100, status: 'ATINGIDA' });
    const outraBase = item({ idColaborador: 'colab-3', idBaseOperacional: 'base-2', nomeBaseOperacional: 'Remanso' });
    const vista = vistaMetas({ dimension: 'base', value: 'base-1' }, contexto([ana, bia, outraBase]))!;

    expect(vista.titulo).toBe('Juazeiro');
    expect(vista.kpis[0].detalhe).toBe('55 de 80 inspeções');
    const tabela = vista.tabelas![0];
    expect(tabela.linhas.map((l) => l.nomeColaborador)).toEqual(['Ana Souza', 'Bia Lima']);
    expect(tabela.aoAtivar!(ana)).toEqual({ tipo: 'navegar', alvo: { dimension: 'pessoa', value: chavePessoa(ana) } });
    expect(vista.proximo?.rotulo).toBe('Remanso');
  });

  it('alvo que não está no recorte não abre análise', () => {
    expect(vistaMetas({ dimension: 'funcao', value: 'inexistente' }, contexto([item({})]))).toBeNull();
  });
});
