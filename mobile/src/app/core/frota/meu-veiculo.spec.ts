import { PistasVeiculo, sugerirVeiculo, veiculoAtual } from './meu-veiculo';

describe('sugerirVeiculo', () => {
    const veiculos = [
        { idVeiculo: 'turno', idCondutorAtual: null },
        { idVeiculo: 'equipe', idCondutorAtual: null },
        { idVeiculo: 'vinculado', idCondutorAtual: 'eu' },
        { idVeiculo: 'ultimo', idCondutorAtual: 'outro' }
    ];
    const nada: PistasVeiculo = { idVeiculoTurno: null, idVeiculoEquipe: null, idColaborador: null, idVeiculoUltimoChecklist: null };

    it('o veículo do turno aberto vem primeiro', () => {
        expect(sugerirVeiculo(veiculos, { idVeiculoTurno: 'turno', idVeiculoEquipe: 'equipe', idColaborador: 'eu', idVeiculoUltimoChecklist: 'ultimo' })).toBe('turno');
    });

    it('sem turno, o veículo da equipe', () => {
        expect(sugerirVeiculo(veiculos, { ...nada, idVeiculoEquipe: 'equipe', idColaborador: 'eu' })).toBe('equipe');
    });

    it('sem equipe, o único veículo vinculado à pessoa como condutor', () => {
        expect(sugerirVeiculo(veiculos, { ...nada, idColaborador: 'eu', idVeiculoUltimoChecklist: 'ultimo' })).toBe('vinculado');
    });

    it('com mais de um vínculo não escolhe por vínculo e cai no último checklist', () => {
        const dois = [...veiculos, { idVeiculo: 'segundo', idCondutorAtual: 'eu' }];
        expect(sugerirVeiculo(dois, { ...nada, idColaborador: 'eu', idVeiculoUltimoChecklist: 'ultimo' })).toBe('ultimo');
    });

    it('ignora veículo fora do catálogo da frota e, sem pista, não sugere nada', () => {
        expect(sugerirVeiculo(veiculos, { ...nada, idVeiculoTurno: 'fora', idVeiculoEquipe: 'fora' })).toBeNull();
        expect(sugerirVeiculo(veiculos, nada)).toBeNull();
    });

    it('diz de onde veio o veículo (o administrativo sem equipe usa o vínculo de condutor)', () => {
        expect(veiculoAtual(veiculos, { ...nada, idVeiculoTurno: 'turno' })?.origem).toBe('TURNO');
        expect(veiculoAtual(veiculos, { ...nada, idVeiculoEquipe: 'equipe' })?.origem).toBe('EQUIPE');
        expect(veiculoAtual(veiculos, { ...nada, idColaborador: 'eu' })?.origem).toBe('CONDUTOR');
        expect(veiculoAtual(veiculos, { ...nada, idVeiculoUltimoChecklist: 'ultimo' })?.origem).toBe('ULTIMO_CHECKLIST');
    });
});
