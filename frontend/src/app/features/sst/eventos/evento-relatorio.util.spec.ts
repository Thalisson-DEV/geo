import { describe, expect, it } from 'vitest';

import { grauDoEvento, regioesDaLesao, tempoDesdeOFato, tituloDoRelatorio } from './evento-relatorio.util';

describe('evento-relatorio.util', () => {
  it('gravidade segue a pirâmide do painel: óbito, com e sem afastamento, incidente', () => {
    expect(grauDoEvento({ tipoCat: 'COMUNICACAO_OBITO', comLesao: true, diasPerdidos: 0 })).toBe('FATALIDADE');
    expect(grauDoEvento({ tipoCat: 'INICIAL', comLesao: true, diasPerdidos: 3 })).toBe('COM_AFASTAMENTO');
    expect(grauDoEvento({ tipoCat: null, comLesao: true, diasPerdidos: null })).toBe('SEM_AFASTAMENTO');
    expect(grauDoEvento({ tipoCat: null, comLesao: false, diasPerdidos: null })).toBe('INCIDENTE');
  });

  it('nomeia o documento pelo tipo do evento', () => {
    expect(tituloDoRelatorio('ACIDENTE_TIPICO')).toBe('Relatório de Investigação de Acidente');
    expect(tituloDoRelatorio('DANO_MATERIAL')).toBe('Relatório de Investigação de Dano Material');
  });

  it('marca a região do corpo do catálogo, respeitando o lado', () => {
    expect(regioesDaLesao('Mão direita')).toEqual(['mao-d']);
    expect(regioesDaLesao('Mão')).toEqual(['mao-d', 'mao-e']);
    expect(regioesDaLesao('Dedo do pé')).toEqual(['pe-d', 'pe-e']);
    expect(regioesDaLesao('Antebraço')).toEqual(['antebraco-d', 'antebraco-e']);
    expect(regioesDaLesao('Perna - abaixo do joelho')).toEqual(['perna-d', 'perna-e']);
    expect(regioesDaLesao('Olho')).toEqual(['cabeca']);
    expect(regioesDaLesao('Dorso e coluna')).toEqual(['torax', 'abdome']);
    expect(regioesDaLesao('Sistema nervoso')).toEqual([]);
    expect(regioesDaLesao(null)).toEqual([]);
  });

  it('mede o tempo de cada marco a partir do fato', () => {
    const fato = '2026-09-28T10:00:00Z';
    expect(tempoDesdeOFato(fato, '2026-09-28T10:00:00Z')).toBe('no ato');
    expect(tempoDesdeOFato(fato, '2026-09-28T16:00:00Z')).toBe('+ 6 h');
    expect(tempoDesdeOFato(fato, '2026-10-08T15:15:00Z')).toBe('+ 10 dias');
    // CAT só tem data: conta em dias, sem hora inventada.
    expect(tempoDesdeOFato('2026-10-27T12:15:00Z', '2026-10-28', true)).toBe('+ 1 dia');
    expect(tempoDesdeOFato('2026-10-27T12:15:00Z', '2026-10-27', true)).toBe('no mesmo dia');
  });
});
