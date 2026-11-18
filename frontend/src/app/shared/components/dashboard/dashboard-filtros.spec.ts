import { describe, expect, it } from 'vitest';
import { chipsDoRecorte } from './dashboard-filtros';

describe('chipsDoRecorte — período', () => {
  // Em fuso negativo (Brasília), "2025-11-01" lido como UTC cairia em 31/10.
  it('mostra as datas do recorte sem perder um dia', () => {
    const [chip] = chipsDoRecorte({}, [], { inicio: '2025-11-01', fim: '2026-10-31' });
    expect(chip.label).toBe('Período: 01/11/2025 a 31/10/2026');
  });

  it('período aberto de um lado', () => {
    expect(chipsDoRecorte({}, [], { inicio: '2026-03-01' })[0].label).toBe('Período: a partir de 01/03/2026');
    expect(chipsDoRecorte({}, [], { fim: '2026-03-31' })[0].label).toBe('Período: até 31/03/2026');
  });
});
