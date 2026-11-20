import { migrarChavesGeo } from './migrar-chaves-geo';

class ArmazenamentoEmMemoria implements Storage {
  private readonly dados = new Map<string, string>();
  get length() { return this.dados.size; }
  clear() { this.dados.clear(); }
  getItem(chave: string) { return this.dados.has(chave) ? this.dados.get(chave)! : null; }
  key(indice: number) { return [...this.dados.keys()][indice] ?? null; }
  removeItem(chave: string) { this.dados.delete(chave); }
  setItem(chave: string, valor: string) { this.dados.set(chave, valor); }
}

// renomear-geo: manter a linha seguinte (chaves antigas de propósito)
const ANTIGAS = { sessao: 'ces_session_enc', segredo: 'ces_key_segredo', tabela: 'ces.table.obras.rows', reload: 'ces:reload-versao-obsoleta' };

describe('migrarChavesGeo', () => {
  let armazenamento: ArmazenamentoEmMemoria;

  beforeEach(() => {
    armazenamento = new ArmazenamentoEmMemoria();
  });

  it('copia as chaves antigas para geo e apaga as antigas', () => {
    armazenamento.setItem(ANTIGAS.sessao, 'sessao-cifrada');
    armazenamento.setItem(ANTIGAS.segredo, 'segredo');
    armazenamento.setItem(ANTIGAS.tabela, '25');
    armazenamento.setItem(ANTIGAS.reload, '123');
    armazenamento.setItem('outra_chave', 'fica');

    const resultado = migrarChavesGeo(armazenamento);

    expect(resultado).toEqual({ migradas: 4, descartadas: 0 });
    expect(armazenamento.getItem('geo_session_enc')).toBe('sessao-cifrada');
    expect(armazenamento.getItem('geo_key_segredo')).toBe('segredo');
    expect(armazenamento.getItem('geo.table.obras.rows')).toBe('25');
    expect(armazenamento.getItem('geo:reload-versao-obsoleta')).toBe('123');
    expect(armazenamento.getItem('outra_chave')).toBe('fica');
    expect(armazenamento.getItem(ANTIGAS.sessao)).toBeNull();
    expect(armazenamento.length).toBe(5);
  });

  it('não sobrescreve uma chave nova com o valor antigo', () => {
    armazenamento.setItem('geo_session_enc', 'sessao-nova');
    armazenamento.setItem(ANTIGAS.sessao, 'sessao-velha');

    const resultado = migrarChavesGeo(armazenamento);

    expect(resultado).toEqual({ migradas: 0, descartadas: 1 });
    expect(armazenamento.getItem('geo_session_enc')).toBe('sessao-nova');
    expect(armazenamento.getItem(ANTIGAS.sessao)).toBeNull();
  });

  it('é idempotente', () => {
    armazenamento.setItem(ANTIGAS.sessao, 'sessao');
    migrarChavesGeo(armazenamento);

    const segunda = migrarChavesGeo(armazenamento);

    expect(segunda).toEqual({ migradas: 0, descartadas: 0 });
    expect(armazenamento.getItem('geo_session_enc')).toBe('sessao');
  });

  it('ignora palavras que só começam com "ces"', () => {
    armazenamento.setItem('cessao', 'x');
    armazenamento.setItem('cesto', 'y');

    migrarChavesGeo(armazenamento);

    expect(armazenamento.getItem('cessao')).toBe('x');
    expect(armazenamento.getItem('cesto')).toBe('y');
  });
});
