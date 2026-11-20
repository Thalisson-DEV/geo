import { SituacaoVeiculo, formatoArquivo, organizarFicha, resumoDocumentos, resumoVeiculo, situacaoPreventiva } from './situacao-veiculo.models';

const VEICULO: SituacaoVeiculo = {
    idVeiculo: 'v1', placa: 'ABC1D23', modelo: 'HILUX', baseOperacional: 'JUAZEIRO', situacao: 'ATIVO', medicaoAtual: 50120,
    medicaoAtualEm: null, unidadeMedicao: 'KM', condutorAtual: null, ordensAbertas: [], ultimasConcluidas: [], pendencias: [], documentos: []
};

describe('situação do veículo com a preventiva', () => {
    it('revisão vencida sem OS entra no resumo e deixa o veículo em atenção', () => {
        const r = resumoVeiculo({ ...VEICULO, preventivas: [
                { plano: 'Revisão 10 mil km', situacao: 'VENCIDA', falta: 'passou 120 km', previsao: null, numeroOrdem: null }
            ] });
        expect(r.tom).toBe('atencao');
        expect(r.apoio).toBe('1 revisão vencida');
    });

    it('com a OS aberta a revisão não conta como pendência e mostra o número da OS', () => {
        const comOs = { plano: 'Revisão 10 mil km', situacao: 'VENCIDA' as const, falta: 'passou 120 km', previsao: null, numeroOrdem: 1009 };
        expect(resumoVeiculo({ ...VEICULO, preventivas: [comOs] }).apoio).toBe('Nada em aberto para este veículo.');
        expect(situacaoPreventiva(comOs)).toEqual({ rotulo: 'Na OS 1009', tom: 'destaque' });
        expect(situacaoPreventiva({ ...comOs, numeroOrdem: null, situacao: 'PROXIMA' })).toEqual({ rotulo: 'Próxima', tom: 'atencao' });
    });

    it('resposta antiga, sem preventivas, continua funcionando', () => {
        expect(resumoVeiculo(VEICULO).apoio).toBe('Nada em aberto para este veículo.');
    });
});

describe('ficha sem repetição', () => {
    const os = { id: 'o1', numero: 77, tipoManutencao: 'CORRETIVA' as const, situacao: 'AGENDADA' as const, criticidade: null, descricao: null,
        oficina: null, veiculoParado: false, abertaEm: '2026-11-01T10:00:00Z', agendadaPara: null, localAgendamento: null, previsaoTermino: null, fimReal: null };

    it('problema e revisão que já estão numa OS aberta aparecem dentro dela, não nas listas', () => {
        const f = organizarFicha({ ...VEICULO, ordensAbertas: [os],
            pendencias: [
                { id: 'p1', item: 'Faróis — Queimado', situacao: 'OS_ABERTA', numeroOrdem: 77, desde: '2026-11-01T09:00:00Z' },
                { id: 'p2', item: 'Pneu — Careca', situacao: 'ABERTA', numeroOrdem: null, desde: '2026-11-02T09:00:00Z' }
            ],
            preventivas: [
                { plano: 'Revisão 10 mil km', situacao: 'VENCIDA', falta: 'passou 50 km', previsao: null, numeroOrdem: 77 },
                { plano: 'Troca de óleo', situacao: 'PROXIMA', falta: 'faltam 800 km', previsao: null, numeroOrdem: null }
            ] });
        expect(f.ordens[0].problemas.map((p) => p.id)).toEqual(['p1']);
        expect(f.ordens[0].revisoes.map((p) => p.plano)).toEqual(['Revisão 10 mil km']);
        expect(f.problemas.map((p) => p.id)).toEqual(['p2']);
        expect(f.revisoes.map((p) => p.plano)).toEqual(['Troca de óleo']);
    });

    it('não repete o item que a descrição da OS já cita e põe a OS com o veículo parado primeiro', () => {
        const citada = { ...os, descricao: 'Faróis — Queimado: farol esquerdo apagado' };
        const parada = { ...os, id: 'o2', numero: 80, veiculoParado: true };
        const f = organizarFicha({ ...VEICULO, ordensAbertas: [citada, parada],
            pendencias: [{ id: 'p1', item: 'Faróis — Queimado', situacao: 'OS_ABERTA', numeroOrdem: 77, desde: '2026-11-01T09:00:00Z' }] });
        expect(f.ordens.map((o) => o.ordem.numero)).toEqual([80, 77]);
        expect(f.ordens[1].problemas).toEqual([]);
        expect(f.problemas).toEqual([]);
    });

    it('problema numa OS que não está entre as abertas continua na lista, com o número dela', () => {
        const f = organizarFicha({ ...VEICULO, pendencias: [{ id: 'p1', item: 'Faróis', situacao: 'OS_ABERTA', numeroOrdem: 12, desde: '2026-11-01T09:00:00Z' }] });
        expect(f.problemas.length).toBe(1);
    });
});

describe('resumo dos documentos', () => {
    const doc = (tipo: string, situacao: 'VIGENTE' | 'A_VENCER' | 'VENCIDO' | 'SEM_VENCIMENTO', vencimento: string | null) => ({ id: tipo, tipo, situacao, vencimento });

    it('vencido vem primeiro e pede atenção vermelha', () => {
        expect(resumoDocumentos([doc('CRLV', 'VENCIDO', '2026-01-01'), doc('SEGURO', 'VIGENTE', '2027-01-01')]))
            .toEqual({ texto: 'CRLV vencido', tom: 'erro' });
    });

    it('todos em dia', () => {
        expect(resumoDocumentos([doc('CRLV', 'VIGENTE', '2027-01-01'), doc('OUTRO', 'SEM_VENCIMENTO', null)]))
            .toEqual({ texto: '2 documentos em dia', tom: 'ok' });
    });

    it('sem documentos', () => {
        expect(resumoDocumentos([]).tom).toBe('neutro');
    });

    it('formato do arquivo decide como o visor mostra', () => {
        expect(formatoArquivo({ arquivoNome: 'crlv.PDF', arquivoContentType: null })).toBe('pdf');
        expect(formatoArquivo({ arquivoNome: 'foto.jpg', arquivoContentType: 'image/jpeg' })).toBe('imagem');
        expect(formatoArquivo({ arquivoNome: 'planilha.xlsx', arquivoContentType: 'application/vnd.ms-excel' })).toBe('outro');
    });
});
