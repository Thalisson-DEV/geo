import { describe, expect, it } from 'vitest';
import { AtendimentoEquipe, GrupoCaminhao, RegrasBalcao, RetiradaObra } from '../../../core/models/balcao.models';
import {
  juntarFaltas,
  linhasDevolucao,
  montarDevolucao,
  montarRetirada,
  pendenciasComprovante,
  pessoaPelaMatricula,
  quantidadesIniciais,
  resumoRetirada,
} from './balcao.logic';

const retirada = (over: Partial<RetiradaObra> = {}): RetiradaObra => ({
  idSolicitacao: 's1', versao: 1, idObra: 'o1', numeroObra: '430126363', tituloObra: 'Ligação nova', numeroProgramacao: 173,
  dataPrevista: '2026-11-24', atrasada: false, reserva: null, concreto: false, separacao: 'PRONTO_PARA_SEPARACAO',
  itens: [
    { idItem: 'i1', idMaterial: 'm1', codigo: '300013', descricao: 'Cabo', unidade: 'M', pedido: 60, entregue: 6, falta: 54, detalhaSerie: false, saldoAlmoxarifado: 500 },
    { idItem: 'i2', idMaterial: 'm2', codigo: '300117', descricao: 'Poste', unidade: 'UN', pedido: 3, entregue: 0, falta: 3, detalhaSerie: false, saldoAlmoxarifado: 10 },
  ],
  ...over,
});

const regras: RegrasBalcao = {
  separacaoObrigatoria: false, entregaAcimaPedido: true, devolucaoAcimaCaminhao: false,
  exigeAssinatura: true, exigeMatricula: true, exigeFoto: true,
};

describe('balcão', () => {
  it('sugere entregar tudo o que falta', () => {
    expect(quantidadesIniciais([retirada()])).toEqual({ i1: 54, i2: 3 });
  });

  it('conta itens, excedentes e obras sem reserva', () => {
    const r = resumoRetirada([retirada()], { i1: 60, i2: 0 }, {});
    expect(r).toEqual({ itens: 1, excedentes: 1, semReserva: ['430126363'] });
    expect(resumoRetirada([retirada()], { i1: 1 }, { s1: '123' }).semReserva).toEqual([]);
  });

  it('monta a retirada só com o que tem quantidade, com reserva e motivo do excedente', () => {
    const atendimento = { idAlmoxarifado: 'a1', retiradas: [retirada(), retirada({ idSolicitacao: 's2', reserva: '99', itens: [] })] } as unknown as AtendimentoEquipe;
    const req = montarRetirada(atendimento, { i1: 60, i2: 0 }, { s1: ' 5566 ' }, { i1: 'dois isoladores no campo' }, { matricula: '123' });
    expect(req.solicitacoes).toEqual([{
      idSolicitacao: 's1', numeroReserva: '5566',
      itens: [{ idItemSolicitacao: 'i1', quantidade: 60, motivoExcedente: 'dois isoladores no campo' }],
    }]);
  });

  it('sugere devolver tudo do caminhão, uma série por linha', () => {
    const caminhao: GrupoCaminhao[] = [
      { idObra: 'o1', numeroObra: '430126363', tituloObra: null, itens: [
        { idMaterial: 'm1', codigo: '300013', descricao: 'Cabo', unidade: 'M', condicao: 'NOVO', quantidade: 5, detalhaSerie: false, series: [] },
        { idMaterial: 'm9', codigo: '300999', descricao: 'Sucata de cabo', unidade: 'KG', condicao: 'SUCATA', quantidade: 2, detalhaSerie: false, series: [] },
      ] },
      { idObra: null, numeroObra: null, tituloObra: null, itens: [
        { idMaterial: 'm5', codigo: '500', descricao: 'Trafo', unidade: 'UN', condicao: 'NOVO', quantidade: 2, detalhaSerie: true, series: ['A1', 'A2'] },
      ] },
    ];
    const linhas = linhasDevolucao(caminhao);
    expect(linhas.map((l) => [l.codigo, l.quantidade, l.series[0] ?? null])).toEqual([
      ['300013', 5, null], ['300999', 2, null], ['500', 1, 'A1'], ['500', 1, 'A2'],
    ]);
    linhas[1].destino = 'DESCARTAR';
    linhas[2].quantidade = 0;
    const req = montarDevolucao('a1', linhas, {});
    expect(req.itens.map((i) => [i.idMaterial, i.quantidade, i.numeroSerie, i.destino, i.idObra])).toEqual([
      ['m1', 5, null, 'GUARDAR', 'o1'], ['m9', 2, null, 'DESCARTAR', 'o1'], ['m5', 1, 'A2', 'GUARDAR', null],
    ]);
  });

  it('diz o que falta para registrar', () => {
    expect(juntarFaltas(pendenciasComprovante(regras, {}, null))).toBe('quem retira, a assinatura e a foto');
    const semMatricula = { idColaborador: 'c1', nome: 'ELIENE', matricula: null, encarregado: false };
    expect(pendenciasComprovante(regras, { idColaborador: 'c1', assinatura: 'FISICA', foto: 'data:' }, semMatricula)).toEqual(['a matrícula no cadastro']);
    expect(pendenciasComprovante(regras, { idColaborador: 'c1', assinatura: 'FISICA', foto: 'data:' }, { ...semMatricula, deFora: true })).toEqual([]);
    expect(pendenciasComprovante(regras, { idColaborador: 'c1', assinatura: 'FISICA', foto: 'data:' }, { ...semMatricula, matricula: '1' })).toEqual([]);
  });

  it('acha a pessoa pela matrícula', () => {
    const pessoas = [{ idColaborador: 'c1', nome: 'ELIENE', matricula: 'AB12', encarregado: true }];
    expect(pessoaPelaMatricula(pessoas, ' ab12 ')?.nome).toBe('ELIENE');
    expect(pessoaPelaMatricula(pessoas, 'x')).toBeNull();
  });
});
