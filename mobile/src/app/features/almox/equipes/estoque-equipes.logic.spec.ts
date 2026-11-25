import { describe, expect, it } from 'vitest';
import { EquipeNoBalcao, ItemNasEquipes } from '../../../core/almox/balcao.models';
import { atendeAtalho, obrasDaEquipe, porMaterial, textoCaminhao } from './estoque-equipes.logic';

const item = (p: Partial<ItemNasEquipes>): ItemNasEquipes => ({
  idEquipe: 'e1', equipe: 'CON-01', idObra: 'o1', numeroObra: '100', tituloObra: 'Rede', idMaterial: 'm1', codigo: '10',
  descricao: 'Cabo', unidade: 'M', condicao: 'NOVO', quantidade: 5, ...p,
});

const equipe = (p: Partial<EquipeNoBalcao>): EquipeNoBalcao => ({
  idEquipe: 'e1', codigo: 'CON-01', base: null, encarregado: null, solicitacoesRetirada: 0, obrasRetirada: 0, itensRetirada: 0,
  retiradaAtrasada: false, aguardandoSeparacao: false, itensNoCaminhao: 0, obrasNoCaminhao: 0, sucatasNoCaminhao: 0,
  negativosNoCaminhao: 0, ultimaRetirada: null, ultimaDevolucao: null, ...p,
});

describe('estoque das equipes no app', () => {
  it('agrupa o caminhão por obra com o saldo negativo primeiro', () => {
    const grupos = obrasDaEquipe([
      item({ idObra: 'o2', numeroObra: '200' }),
      item({ idObra: null, numeroObra: null, quantidade: -2, idMaterial: 'm2' }),
      item({}),
      item({ idEquipe: 'e2' }),
    ], 'e1');
    expect(grupos.map(g => g.negativo ? 'neg' : g.numeroObra)).toEqual(['neg', '100', '200']);
  });

  it('soma o material entre caminhões e separa o negativo', () => {
    const [m] = porMaterial([item({}), item({ idEquipe: 'e2', quantidade: 3 }), item({ idEquipe: 'e3', quantidade: -1, idObra: null })]);
    expect(m.total).toBe(8);
    expect(m.negativo).toBe(-1);
    expect(m.equipes).toBe(3);
  });

  it('atalhos e texto do caminhão', () => {
    const e = equipe({ itensNoCaminhao: 3, obrasNoCaminhao: 2, sucatasNoCaminhao: 1, negativosNoCaminhao: 1 });
    expect(atendeAtalho(e, 'negativo')).toBe(true);
    expect(atendeAtalho(e, 'retirada')).toBe(false);
    expect(textoCaminhao(e)).toBe('3 materiais em 2 obras · 1 de sucata');
    expect(textoCaminhao(equipe({}))).toBe('Caminhão vazio');
  });
});
