import { describe, expect, it } from 'vitest';
import { porPergunta, problemaDoArquivo } from './visita-evidencias.logic';

const arquivo = (nome: string, tipo: string, tamanho = 10) => new File([new Uint8Array(tamanho)], nome, { type: tipo });

describe('visita-evidencias.logic', () => {
  it('aceita foto e PDF e recusa outros formatos ou arquivo grande', () => {
    expect(problemaDoArquivo(arquivo('a.jpg', 'image/jpeg'))).toBeNull();
    expect(problemaDoArquivo(arquivo('a.pdf', 'application/pdf'))).toBeNull();
    expect(problemaDoArquivo(arquivo('IMG_1.JPG', ''))).toBeNull();
    expect(problemaDoArquivo(arquivo('a.gif', 'image/gif'))).toContain('JPG ou PNG');
    expect(problemaDoArquivo(arquivo('a.png', 'image/png', 30), 20)).toContain('passa de');
  });

  it('agrupa por pergunta, com as gerais na chave nula', () => {
    const mapa = porPergunta<{ idPergunta?: string | null }>([{ idPergunta: 'p1' }, { idPergunta: null }, { idPergunta: 'p1' }, {}]);
    expect(mapa.get('p1')).toHaveLength(2);
    expect(mapa.get(null)).toHaveLength(2);
  });
});
