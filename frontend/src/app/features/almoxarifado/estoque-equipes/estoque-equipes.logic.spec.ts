import { EquipeNoBalcao, ItemNasEquipes } from '../../../core/models/balcao.models';
import { caminhaoDaEquipe, porMaterial, porObra, situacaoDaEquipe } from './estoque-equipes.logic';

const item = (p: Partial<ItemNasEquipes>): ItemNasEquipes => ({
  idEquipe: 'e1', equipe: 'CON-01', idObra: 'o1', numeroObra: '100', tituloObra: 'Rua A', idMaterial: 'm1', codigo: '1',
  descricao: 'Cabo', unidade: 'm', condicao: 'NOVO', quantidade: 10, ...p,
});

describe('estoque das equipes', () => {
  it('soma o material de todas as equipes e marca negativo', () => {
    const linhas = porMaterial([
      item({}),
      item({ idEquipe: 'e2', equipe: 'CON-02', quantidade: 5.5 }),
      item({ idMaterial: 'm2', descricao: 'Poste', quantidade: -1, idObra: null }),
    ]);
    expect(linhas[0].descricao).toBe('Poste');
    expect(linhas[0].negativo).toBe(true);
    const cabo = linhas.find((l) => l.idMaterial === 'm1')!;
    expect(cabo.total).toBe(15.5);
    expect(cabo.equipes.map((e) => e.equipe)).toEqual(['CON-01', 'CON-02']);
    expect(cabo.obras).toBe(1);
  });

  it('agrupa por obra com o material solto por último', () => {
    const linhas = porObra([item({ idObra: null, numeroObra: null }), item({ condicao: 'SUCATA' }), item({}), item({ quantidade: -2 })]);
    expect(linhas.map((l) => l.id)).toEqual(['o1', 'livre']);
    expect(linhas[0].materiais).toBe(2);
    expect(linhas[0].sucatas).toBe(1);
  });

  it('caminhão da equipe põe os negativos primeiro', () => {
    const grupos = caminhaoDaEquipe([item({}), item({ quantidade: -3, idObra: null }), item({ idEquipe: 'e2' })], 'e1');
    expect(grupos.map((g) => g.id)).toEqual(['negativos', 'o1']);
  });

  it('a situação é a pendência mais grave', () => {
    const base = { negativosNoCaminhao: 0, retiradaAtrasada: false, itensRetirada: 0, sucatasNoCaminhao: 0 } as EquipeNoBalcao;
    expect(situacaoDaEquipe({ ...base, sucatasNoCaminhao: 2, itensRetirada: 1 })).toBe('retirar');
    expect(situacaoDaEquipe({ ...base, negativosNoCaminhao: 1, retiradaAtrasada: true })).toBe('negativo');
    expect(situacaoDaEquipe(base)).toBe('ok');
  });
});
