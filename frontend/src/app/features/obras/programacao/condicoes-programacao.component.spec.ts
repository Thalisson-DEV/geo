import { camposDesligamento, horaValida } from './condicoes-programacao.component';

describe('condições da programação: desligamento', () => {
  it('aceita só HH:mm válido', () => {
    expect(horaValida('08:00')).toBe(true);
    expect(horaValida('23:59')).toBe(true);
    expect(horaValida('24:00')).toBe(false);
    expect(horaValida('8:00')).toBe(false);
    expect(horaValida('')).toBe(false);
  });

  it('manda horário e manobra só com desligamento', () => {
    expect(camposDesligamento(true, '08:00', '12:00', ' 2026-1 ')).toEqual({
      horaDesligamentoInicio: '08:00', horaDesligamentoFim: '12:00', numeroManobra: '2026-1'
    });
    expect(camposDesligamento(false, '08:00', '12:00', '1')).toEqual({
      horaDesligamentoInicio: null, horaDesligamentoFim: null, numeroManobra: null
    });
    expect(camposDesligamento(true, '8h', '', '')).toEqual({
      horaDesligamentoInicio: null, horaDesligamentoFim: null, numeroManobra: null
    });
  });
});
