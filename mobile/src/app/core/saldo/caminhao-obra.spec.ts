import { describe, expect, it } from 'vitest';
import { SaldoObraLocal } from '../db/models';
import { caminhaoPorObra, resumoCaminhao } from './caminhao-obra';

const saldo = (over: Partial<SaldoObraLocal>): SaldoObraLocal => ({
  chave: Math.random().toString(), idEstoque: 'cam', idMaterial: 'm1', codigo: '300013', descricao: 'Cabo', unidadeMedida: 'M',
  condicao: 'NOVO', idObra: 'o1', numeroObra: '430126363', quantidade: 5, ...over,
});

describe('caminhão por obra', () => {
  it('põe as obras de hoje primeiro, depois as outras, o livre e a sucata', () => {
    const grupos = caminhaoPorObra([
      saldo({ idObra: 'o2', numeroObra: '440216437', idMaterial: 'm2', descricao: 'Poste' }),
      saldo({ idObra: null, numeroObra: null, idMaterial: 'm3', descricao: 'Alça' }),
      saldo({ condicao: 'SUCATA', idMaterial: 'm4', descricao: 'Cabo velho' }),
      saldo({}),
      saldo({ quantidade: 0, idMaterial: 'm9' }),
    ], new Set(['o1']));
    expect(grupos.map(g => [g.titulo, g.hoje, g.itens.length])).toEqual([
      ['Obra 430126363', true, 1],
      ['Obra 440216437', false, 1],
      ['Sem obra', false, 1],
      ['Sucata para devolver', false, 1],
    ]);
    expect(resumoCaminhao(grupos)).toEqual({ materiais: 3, obras: 2, sucatas: 1 });
  });

  it('junta a sucata de várias obras num só bloco', () => {
    const grupos = caminhaoPorObra([
      saldo({ condicao: 'SUCATA', quantidade: 2 }),
      saldo({ condicao: 'SUCATA', idObra: 'o2', quantidade: 1.5 }),
    ], new Set());
    expect(grupos).toHaveLength(1);
    expect(grupos[0].itens[0].quantidade).toBe(3.5);
  });
});
