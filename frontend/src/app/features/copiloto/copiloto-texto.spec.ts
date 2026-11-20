import { describe, expect, it } from 'vitest';
import {
  CITACAO_RESULTADOS,
  codigosResultado,
  separarProximosPassos,
  tempoDecorrido,
  ultimasVersoes,
} from './copiloto-texto';

describe('separarProximosPassos', () => {
  it('tira o bloco final de próximos passos e devolve os pedidos limpos', () => {
    const texto = [
      'Encontrei 9 notas suspeitas.',
      '',
      '**Próximos passos**',
      '- Detalhe as 9 notas de **R$ 1.860,06** por equipe',
      '- "Gere o relatório em PDF"',
    ].join('\n');

    const resultado = separarProximosPassos(texto);

    expect(resultado.corpo).toBe('Encontrei 9 notas suspeitas.');
    expect(resultado.passos).toEqual(['Detalhe as 9 notas de R$ 1.860,06 por equipe', 'Gere o relatório em PDF']);
  });

  it('aceita título com ### e lista numerada', () => {
    const resultado = separarProximosPassos('Pronto.\n\n### Próximos passos:\n1. Exportar em Excel\n2) Comparar com outubro');
    expect(resultado.passos).toEqual(['Exportar em Excel', 'Comparar com outubro']);
  });

  it('não mexe quando há texto solto depois da lista', () => {
    const texto = 'A.\n\n**Próximos passos**\n- Exportar\n\nQuer que eu faça isso?';
    expect(separarProximosPassos(texto)).toEqual({ corpo: texto, passos: [] });
  });

  it('sem o bloco a resposta fica como veio', () => {
    expect(separarProximosPassos('Só texto.').passos).toEqual([]);
  });
});

describe('citações de resultados', () => {
  it('reconhece os formatos que o modelo usa', () => {
    const texto = 'Total de R$ 10 (r2, r6, r17) e média (r3 e r7) no mês (r19).';
    expect(texto.match(CITACAO_RESULTADOS)).toEqual([' (r2, r6, r17)', ' (r3 e r7)', ' (r19)']);
    expect(codigosResultado('(r2, r6, r2)')).toEqual(['r2', 'r6']);
  });

  it('não confunde parênteses comuns', () => {
    expect('Bonfim (88) e Juazeiro (r)'.match(CITACAO_RESULTADOS)).toBeNull();
  });
});

describe('ultimasVersoes', () => {
  it('fica com a última versão de cada nome, na posição dela', () => {
    const itens = [
      { id: '1', nome: 'a.pdf' },
      { id: '2', nome: 'b.xlsx' },
      { id: '3', nome: 'a.pdf' },
    ];
    expect(ultimasVersoes(itens, (item) => item.nome).map((item) => item.id)).toEqual(['2', '3']);
  });
});

describe('tempoDecorrido', () => {
  it('formata segundos, minutos e horas', () => {
    expect(tempoDecorrido(45_000)).toBe('45 s');
    expect(tempoDecorrido(185_000)).toBe('3 min 05 s');
    expect(tempoDecorrido(3_720_000)).toBe('1 h 02 min');
  });
});

describe('agruparConversas', () => {
  it('conversas fixadas ficam num grupo próprio no topo', async () => {
    const { agruparConversas } = await import('./copiloto.store');
    const agora = new Date('2026-11-19T12:00:00');
    const base = { dataCriacao: '2026-11-01T10:00:00', emAndamento: false };
    const grupos = agruparConversas([
      { ...base, id: '1', titulo: 'Hoje', ultimaAtividadeEm: '2026-11-19T09:00:00' },
      { ...base, id: '2', titulo: 'Antiga fixada', ultimaAtividadeEm: '2026-09-01T09:00:00', fixada: true },
    ], agora);
    expect(grupos.map((grupo) => grupo.rotulo)).toEqual(['Fixadas', 'Hoje']);
    expect(grupos[0].conversas[0].id).toBe('2');
  });
});

describe('semIdentificadores', () => {
  it('tira colunas de UUID e mantém o número da nota', async () => {
    const { semIdentificadores } = await import('./componentes/copiloto-dados.component');
    const dados = semIdentificadores({
      codigo: 'r1', titulo: 'Notas', natureza: 'INTERNO', total: 1, truncado: false,
      colunas: [{ nome: 'execucao_id', tipo: 'TEXTO' }, { nome: 'numero_nota', tipo: 'TEXTO' }, { nome: 'valor', tipo: 'NUMERO' }],
      linhas: [['8314693f-0000-4000-8000-000000000001', '4605155202', 10]],
    });
    expect(dados.colunas.map((coluna) => coluna.nome)).toEqual(['numero_nota', 'valor']);
    expect(dados.linhas[0]).toEqual(['4605155202', 10]);
  });
});
