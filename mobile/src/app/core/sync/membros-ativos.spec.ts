import { idsMembrosAtivos } from './sync.service';

describe('membros ativos da equipe', () => {
  it('ignora vínculos encerrados e não repete quem trocou de função', () => {
    const historico = [
      { idColaborador: 'col-1', funcao: 'PARCEIRO', vinculoAtivo: false },
      { idColaborador: 'col-1', funcao: 'RESPONSAVEL', vinculoAtivo: true },
      { idColaborador: 'col-2', funcao: 'RESPONSAVEL', vinculoAtivo: false },
      { idColaborador: 'col-2', funcao: 'PARCEIRO', vinculoAtivo: true },
      { idColaborador: 'col-3', funcao: 'PARCEIRO', vinculoAtivo: false },
    ];
    expect(idsMembrosAtivos(historico)).toEqual(['col-1', 'col-2']);
  });

  it('aceita lista vazia ou ausente', () => {
    expect(idsMembrosAtivos(undefined)).toEqual([]);
    expect(idsMembrosAtivos([])).toEqual([]);
  });
});
