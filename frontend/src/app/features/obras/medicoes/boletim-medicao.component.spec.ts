import { describe, expect, it } from 'vitest';
import { ItemMedido } from '../../../core/models/obras-medicoes.models';
import { resumirPorServico } from './boletim-medicao.component';

function item(parcial: Partial<ItemMedido>): ItemMedido {
  return {
    id: crypto.randomUUID(),
    idItem: crypto.randomUUID(),
    codigo: 'SV-0102',
    descricao: 'Implantar poste',
    unidade: 'UN',
    operacao: 'INSTALAR',
    codigoKit: 'PT-12',
    local: 'Folha 1 · 9',
    quantidade: 1,
    valorUnitario: 1350,
    valorTotal: 1350,
    concluidoEm: '01/10/2026',
    ...parcial
  };
}

describe('resumirPorServico', () => {
  it('soma o mesmo serviço de vários locais numa linha', () => {
    const linhas = resumirPorServico([item({ local: 'Folha 1 · 9' }), item({ local: 'Folha 1 · 10' })]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ codigo: 'SV-0102', quantidade: 2, valorTotal: 2700, locais: 2, operacao: 'Instalar' });
  });

  it('separa operação e preço diferentes e ordena pelo código', () => {
    const linhas = resumirPorServico([
      item({ codigo: 'SV-0301', unidade: 'M', quantidade: 207, valorUnitario: 6.8, valorTotal: 1407.6 }),
      item({ operacao: 'RETIRAR', valorUnitario: 300, valorTotal: 300 }),
      item({})
    ]);
    expect(linhas.map((l) => `${l.codigo} ${l.operacao}`)).toEqual(['SV-0102 Instalar', 'SV-0102 Retirar', 'SV-0301 Instalar']);
  });

  it('conta item sem valor como zero no total', () => {
    const [linha] = resumirPorServico([item({ valorTotal: null, valorUnitario: null })]);
    expect(linha.valorTotal).toBe(0);
    expect(linha.valorUnitario).toBeNull();
  });
});
