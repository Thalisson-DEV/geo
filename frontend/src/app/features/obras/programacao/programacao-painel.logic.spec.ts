import { describe, expect, it } from 'vitest';
import { EventoProgramacao, PainelProgramacao } from '../../../core/models/obras-programacao.models';
import { PlanejamentoObra } from '../../../core/models/obras-planejamento.models';
import { gerarLeituras, periodoRapido } from './programacao-painel.logic';
import { lerEvento } from './programacao.logic';
import { locaisProgramaveis } from './programar.logic';

function evento(parcial: Partial<EventoProgramacao>): EventoProgramacao {
  return { id: '1', data: '2026-11-04T12:00:00Z', tipo: 'EDITADA', idProgramacao: 'p', numeroProgramacao: 10, idObra: 'o', ...parcial };
}

function painel(parcial: Partial<PainelProgramacao> = {}): PainelProgramacao {
  return {
    inicio: '01/11/2026', fim: '30/11/2026', geradoEm: '', agrupamentoSerie: 'DIA',
    totais: {
      programacoes: 10, programadas: 6, emAndamento: 1, atrasadas: 0, concluidas: 3, canceladas: 0, vencidas: 3, taxaCumprimento: 100,
      valorProgramado: 1000, valorRealizado: 500, percentualRealizado: 50, criadas: 10, edicoes: 0, reprogramacoes: 0, cancelamentos: 0,
      exclusoes: 0, equipes: 4, equipesLivres: 1, diasUteis: 20, ocupacaoMedia: 50, linhaViva: 0, desligamentos: 0
    },
    equipes: [], bases: [], serie: [], proximosDias: [], motivos: [], obrasInstaveis: [], atrasadas: [],
    obrasAProgramar: 0, valorAProgramar: 0, obrasAProgramarPrimeiras: [],
    ...parcial
  };
}

describe('lerEvento', () => {
  it('mostra a criação sem "antes"', () => {
    const lido = lerEvento(evento({ tipo: 'CRIADA', equipeDestino: 'EQ-01', inicioNovo: '03/11/2026', fimNovo: '05/11/2026', observacao: 'P1 — LMI' }));
    expect(lido.mudancas).toEqual([{ campo: 'Equipe', depois: 'EQ-01' }, { campo: 'Período', depois: '03/11/2026 a 05/11/2026' }]);
    expect(lido.motivo).toBe('P1 — LMI');
  });

  it('separa equipe e período na reprogramação e guarda o motivo', () => {
    const lido = lerEvento(evento({
      tipo: 'REPROGRAMADA', equipeOrigem: 'EQ-01', equipeDestino: 'EQ-02', inicioOriginal: '03/11/2026', fimOriginal: '03/11/2026',
      inicioNovo: '10/11/2026', fimNovo: '10/11/2026', observacao: 'Chuva forte'
    }));
    expect(lido.mudancas).toEqual([
      { campo: 'Equipe', antes: 'EQ-01', depois: 'EQ-02' },
      { campo: 'Período', antes: '03/11/2026', depois: '10/11/2026' }
    ]);
    expect(lido.motivo).toBe('Chuva forte');
  });

  it('desmonta as mudanças gravadas na edição', () => {
    const lido = lerEvento(evento({
      equipeOrigem: 'EQ-01', equipeDestino: 'EQ-01', inicioOriginal: '03/11/2026', fimOriginal: '03/11/2026', inicioNovo: '03/11/2026', fimNovo: '03/11/2026',
      observacao: 'Turno: Manhã → Dia todo; Observação: vazio → Cliente avisado'
    }));
    expect(lido.mudancas).toEqual([
      { campo: 'Turno', antes: 'Manhã', depois: 'Dia todo' },
      { campo: 'Observação', antes: null, depois: 'Cliente avisado' }
    ]);
    expect(lido.motivo).toBeNull();
  });
});

describe('locaisProgramaveis', () => {
  it('lista só os locais com serviço pendente e leva os itens pendentes do kit', () => {
    const item = (id: string, tipo: 'SERVICO' | 'MATERIAL', status: 'PENDENTE' | 'PROGRAMADO') =>
      ({ id, tipo, status, operacao: 'INSTALAR', quantidadePrevista: 1, quantidadeExecutada: 0, versao: 0 }) as never;
    const plano = {
      idObra: 'o', numeroObra: '1', tituloObra: 'T', rotacoes: {}, anotacoes: [], avancoKits: [], indicadores: {} as never,
      pontos: [{ id: 'p1', numero: '1' }, { id: 'p2', numero: '2' }] as never,
      vaos: [{ id: 'v1', idPontoA: 'p1', idPontoB: 'p2' }] as never,
      kits: [
        { id: 'k1', idPonto: 'p1', codigo: 'LMI', executadoAntes: false, itens: [item('s1', 'SERVICO', 'PENDENTE'), item('m1', 'MATERIAL', 'PENDENTE')] },
        { id: 'k2', idPonto: 'p2', codigo: 'LMJ', executadoAntes: false, itens: [item('s2', 'SERVICO', 'PROGRAMADO')] },
        { id: 'k3', idVao: 'v1', codigo: 'CABO', executadoAntes: false, itens: [item('s3', 'SERVICO', 'PENDENTE')] },
        { id: 'k4', idPonto: 'p2', codigo: 'ANT', executadoAntes: true, itens: [item('s4', 'SERVICO', 'PENDENTE')] }
      ] as never
    } as PlanejamentoObra;

    const locais = locaisProgramaveis(plano);

    expect(locais.map((l) => l.rotulo)).toEqual(['P1', 'Vão P1 — P2']);
    expect(locais[0].idsItens).toEqual(['s1', 'm1']);
    expect(locais[0].servicos).toBe(1);
  });
});

describe('painel da programação', () => {
  it('calcula os períodos rápidos', () => {
    const hoje = new Date(2026, 10, 4);
    expect(periodoRapido('mes', hoje)).toEqual({ inicio: new Date(2026, 10, 1), fim: new Date(2026, 10, 30) });
    expect(periodoRapido('mes-anterior', hoje)).toEqual({ inicio: new Date(2026, 9, 1), fim: new Date(2026, 9, 31) });
    expect(periodoRapido('proximos-30', hoje).fim).toEqual(new Date(2026, 11, 3));
  });

  it('põe atraso antes de tudo e limita a quatro leituras', () => {
    const leituras = gerarLeituras(painel({
      atrasadas: [{ id: 'a' } as never],
      obrasAProgramar: 3, valorAProgramar: 900,
      equipes: [{ codigo: 'EQ-1', sobreposicoes: 2 } as never],
      totais: { ...painel().totais, reprogramacoes: 4, cancelamentos: 1, taxaCumprimento: 40 }
    }));
    expect(leituras).toHaveLength(4);
    expect(leituras[0].tone).toBe('critical');
    expect(leituras[0].destino).toBe('atrasadas');
  });

  it('diz que a agenda está em dia quando não há o que apontar', () => {
    const leituras = gerarLeituras(painel({ totais: { ...painel().totais, vencidas: 0, taxaCumprimento: null } }));
    expect(leituras).toEqual([expect.objectContaining({ tone: 'positive', title: 'Agenda em dia' })]);
  });
});
