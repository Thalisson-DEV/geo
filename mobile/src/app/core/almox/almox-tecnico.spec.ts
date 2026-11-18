import { ResumoSolicitacao } from './almox.models';
import { defTipoTecnico, etapaTecnica, obraDoEstoque, podeTecnica, subEtapasDaFila, tituloTecnica } from './almox-tecnico';

const resumo = (extra: Partial<ResumoSolicitacao>): ResumoSolicitacao => ({
  id: 'b6d3c0c7-625e-4c6e-90a1-444cb1cc2219', status: 'APROVADO', dataSolicitacao: '2026-11-04T20:00:00Z', totalItens: 2, ...extra,
});

describe('almox-tecnico', () => {
  it('aceita o tipo técnico pelo código ou pelo nome do enum', () => {
    expect(defTipoTecnico('221').rotulo).toBe('Adição comum');
    expect(defTipoTecnico('DEVOLUCAO_CONCRETO').codigo).toBe('922');
    expect(defTipoTecnico('922').adicao).toBeFalse();
  });

  it('separa número e título da obra pelo nome do estoque da obra', () => {
    expect(obraDoEstoque('OBRA 3310 - CORRETIVA REDE BT JUAZEIRO')).toEqual({ numero: '3310', titulo: 'CORRETIVA REDE BT JUAZEIRO' });
    expect(obraDoEstoque('ALMOXARIFADO_JUAZEIRO')).toBeNull();
  });

  it('põe a OC/OS em destaque e usa o destino na adição e a origem na devolução', () => {
    const adicao = tituloTecnica(resumo({
      tipoTecnico: '921', estoqueDestinoNome: 'OBRA 3310 - CORRETIVA REDE BT JUAZEIRO',
      tecnico: { versao: 1, tipoTecnico: '921', ocorrencia: { id: 'x', codigo: 'OC-88412' } },
    }));
    expect(adicao).toEqual({ ocorrencia: 'OC-88412', obra: '3310 · CORRETIVA REDE BT JUAZEIRO' });

    const devolucao = tituloTecnica(resumo({ tipoTecnico: '222', estoqueOrigemNome: 'OBRA 4120 - KIT MEDICAO', tecnico: { versao: 1, tipoTecnico: '222' } }));
    expect(devolucao).toEqual({ ocorrencia: null, obra: '4120 · KIT MEDICAO' });
  });

  it('descreve a etapa do ponto de vista do almoxarifado', () => {
    expect(etapaTecnica(resumo({ etapaOperacional: 'PRONTO_PARA_SEPARACAO' })).rotulo).toBe('Para separar');
    expect(etapaTecnica(resumo({ etapaOperacional: 'PENDENTE_ENTREGA', status: 'ENTREGUE_PARCIAL' })).rotulo).toBe('Entregue em parte');
    expect(etapaTecnica(resumo({ etapaOperacional: 'PENDENTE_DEVOLUCAO', status: 'DEVOLVIDO_PARCIAL' })).rotulo).toBe('Recebida em parte');
    expect(etapaTecnica(resumo({ status: 'REJEITADO' })).tom).toBe('erro');
  });

  it('só libera a ação que o backend autorizou', () => {
    expect(podeTecnica(resumo({ acoesPermitidas: ['ENTREGAR'] }), 'ENTREGAR')).toBeTrue();
    expect(podeTecnica(resumo({ acoesPermitidas: [] , tecnico: { versao: 1, acoesPermitidas: ['ENTREGAR'] } }), 'ENTREGAR')).toBeFalse();
    expect(podeTecnica(resumo({ tecnico: { versao: 1, acoesPermitidas: ['CONFIRMAR_DEVOLUCAO'] } }), 'CONFIRMAR_DEVOLUCAO')).toBeTrue();
  });

  it('"Em aberto" junta separar, separando, entregar e receber', () => {
    expect(subEtapasDaFila('abertas')).toEqual(['PRONTO_PARA_SEPARACAO', 'EM_SEPARACAO', 'SEPARADO', 'PENDENTE_RETIRADA', 'PENDENTE_DEVOLUCAO']);
    expect(subEtapasDaFila('entregar')).toEqual(['SEPARADO', 'PENDENTE_RETIRADA']);
  });
});
