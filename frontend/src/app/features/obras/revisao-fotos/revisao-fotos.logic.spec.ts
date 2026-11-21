import { ETAPAS, ROTULO_STATUS, TOM_STATUS, opcoesStatus } from './revisao-fotos.logic';

describe('revisão de fotos', () => {
  it('rótulos e tons em caixa de frase para cada situação', () => {
    expect(ROTULO_STATUS.PENDENTE).toBe('Para revisar');
    expect(TOM_STATUS.REPROVADA).toBe('danger');
    expect(ETAPAS['DEPOIS']).toBe('Depois');
    expect(opcoesStatus().map((o) => o.value)).toEqual(['PENDENTE', 'APROVADA', 'REPROVADA']);
  });
});
