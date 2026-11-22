import { describe, expect, it } from 'vitest';
import { ModeloChecklist, PerguntaChecklist } from './supervisao.service';
import { alternar, faltando, marcarRestantesComoConforme, montarRespostas, naoConformidades, situacao } from './visita-previa';

const acesso: PerguntaChecklist = { id: 'a', enunciado: 'Há acesso?', tipo: 'ESCOLHA_UNICA', obrigatoria: true, aceitaNaoSeAplica: true, opcoes: ['Sim', 'Não'], opcaoConforme: 'Sim' };
const zona: PerguntaChecklist = { id: 'z', enunciado: 'Zona', tipo: 'ESCOLHA_UNICA', obrigatoria: true, aceitaNaoSeAplica: false, opcoes: ['Urbana', 'Rural'] };
const km: PerguntaChecklist = { id: 'k', enunciado: 'Distância', tipo: 'NUMERO', obrigatoria: false, aceitaNaoSeAplica: false, opcoes: [] };
const modelo: ModeloChecklist = { id: 'm', titulo: 'Pré-vistoria', finalidade: 'VISITA_PREVIA', estrutura: { grupos: [{ titulo: 'Acesso', perguntas: [acesso, zona, km] }] } };

describe('visita prévia no app', () => {
  it('marca não conformidade só quando a resposta difere da conforme do modelo', () => {
    expect(situacao(acesso, { selecionadas: ['Não'] })).toBe('NAO_CONFORME');
    expect(situacao(acesso, { selecionadas: ['Sim'] })).toBe('CONFORME');
    expect(situacao(acesso, { selecionadas: ['Não se aplica'] })).toBe('INFORMADO');
    expect(situacao(zona, { selecionadas: ['Rural'] })).toBe('INFORMADO');
    expect(situacao(acesso, {})).toBeNull();
  });

  it('marca as restantes como conforme sem mexer no que já foi respondido', () => {
    const rs = marcarRestantesComoConforme([acesso, zona], { z: { selecionadas: ['Urbana'] } });
    expect(rs['a'].selecionadas).toEqual(['Sim']);
    expect(rs['z'].selecionadas).toEqual(['Urbana']);
  });

  it('desmarca ao tocar de novo e troca na escolha única', () => {
    expect(alternar(acesso, { selecionadas: ['Sim'] }, 'Sim').selecionadas).toEqual([]);
    expect(alternar(acesso, { selecionadas: ['Sim'] }, 'Não').selecionadas).toEqual(['Não']);
  });

  it('lista o que falta e as não conformidades, e monta o corpo do servidor', () => {
    const rs = { a: { selecionadas: ['Não'] }, k: { valor: ' 35 ' } };
    expect(faltando([acesso, zona, km], rs).map(p => p.id)).toEqual(['z']);
    expect(naoConformidades(modelo, rs)).toEqual([{ grupo: 'Acesso', pergunta: acesso, resposta: 'Não' }]);
    expect(montarRespostas(modelo, { a: { selecionadas: ['Não se aplica'] }, k: { valor: ' 35 ' } })).toEqual([
      { idPergunta: 'a', valor: null, selecionadas: [], naoSeAplica: true },
      { idPergunta: 'z', valor: null, selecionadas: [], naoSeAplica: false },
      { idPergunta: 'k', valor: '35', selecionadas: [], naoSeAplica: false },
    ]);
  });
});
