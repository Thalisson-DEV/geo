import { apoioDaLinha } from './execucoes-list.component';

describe('apoioDaLinha', () => {
  it('omite o tipo quando ele repete o nome do serviço (sem diferenciar maiúsculas)', () => {
    expect(apoioDaLinha('LIGAÇÃO NOVA', ['Ligação nova'], '14:42')).toBe('1 serviço · 14:42');
  });

  it('mantém o tipo quando acrescenta informação', () => {
    expect(apoioDaLinha('CORTE', ['Corte no poste', 'Lacre'], '09:10')).toBe('CORTE · 2 serviços · 09:10');
  });

  it('sem tipo não mostra "Tipo não informado"', () => {
    expect(apoioDaLinha(undefined, ['Religação'], '14:02')).toBe('1 serviço · 14:02');
    expect(apoioDaLinha('  ', [], '08:00')).toBe('Sem serviço · 08:00');
  });
});
