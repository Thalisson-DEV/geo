import { EstruturaApr } from '../../../core/models/sst-apr.models';
import { mover, problemaDaApr, removerMedida, riscosQueMarcam } from './apr.logic';

const base = (): EstruturaApr => ({
  riscos: [{ id: 'r1', texto: 'Choque elétrico', sugeridoEm: ['DESLIGAMENTO'], medidas: ['m1'] }],
  medidas: [{ id: 'm1', texto: 'EPI e EPC', sugeridaEm: ['SEMPRE'] }, { id: 'm2', texto: 'Desenergização', sugeridaEm: [] }],
  verificacoes: [{ id: 'v1', texto: 'EPI em bom estado', exigidaEm: [] }]
});

describe('cadastro da APR', () => {
  it('aceita a estrutura válida', () => {
    expect(problemaDaApr(base())).toBeNull();
  });

  it('avisa lista vazia, linha sem texto e texto repetido sem diferenciar maiúsculas', () => {
    expect(problemaDaApr({ ...base(), verificacoes: [] })).toContain('verificação');
    expect(problemaDaApr({ ...base(), riscos: [{ id: 'x', texto: '  ', sugeridoEm: [], medidas: [] }] })).toContain('risco');
    const repetida = { ...base(), medidas: [...base().medidas, { id: 'm3', texto: 'epi  e epc', sugeridaEm: [] }] };
    expect(problemaDaApr(repetida)).toContain('duas vezes');
  });

  it('remover a medida tira ela também dos riscos que a marcavam', () => {
    const e = removerMedida(base(), 'm1');
    expect(e.medidas.map(m => m.id)).toEqual(['m2']);
    expect(e.riscos[0].medidas).toEqual([]);
  });

  it('move na lista e mostra quais riscos marcam a medida', () => {
    expect(mover(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(mover(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(riscosQueMarcam(base(), 'm1')).toEqual(['Choque elétrico']);
  });
});
