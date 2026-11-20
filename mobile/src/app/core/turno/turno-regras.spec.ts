import { corteDoTurno, turnoVencido } from './turno-regras';

describe('corte do turno', () => {
  it('vale até as 22h do dia da abertura, no horário de Brasília', () => {
    expect(corteDoTurno('2026-10-20T09:10:00-03:00').toISOString()).toBe('2026-10-21T01:00:00.000Z');
  });

  it('turno aberto depois das 22h vale até as 22h do dia seguinte', () => {
    expect(corteDoTurno('2026-10-20T22:30:00-03:00').toISOString()).toBe('2026-10-22T01:00:00.000Z');
  });

  it('o turno de ontem está vencido na manhã seguinte', () => {
    const abertura = '2026-10-20T09:10:00-03:00';
    expect(turnoVencido(abertura, new Date('2026-10-20T21:59:00-03:00'))).toBe(false);
    expect(turnoVencido(abertura, new Date('2026-10-20T22:00:00-03:00'))).toBe(false);
    expect(turnoVencido(abertura, new Date('2026-10-21T09:48:00-03:00'))).toBe(true);
  });
});
