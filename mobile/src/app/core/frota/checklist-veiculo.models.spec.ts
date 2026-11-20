import { erroTravaMedicao, intervaloAceito, CatalogoChecklist, ChecklistVeiculoLocal, CondutorChecklist, ModeloChecklist, PerguntaChecklist, VeiculoChecklist, categoriaHabilita, decisaoPendencia, formatarMedicao, formatarPlaca, gruposDePerguntas, modelosDoVeiculo, montarRequest, pendenciaDaPergunta, respostaComProblema, resumoProblemas, situacaoCnh, textoRespostaLocal, todasAsFotos } from './checklist-veiculo.models';

function pergunta(parcial: Partial<PerguntaChecklist>): PerguntaChecklist {
    return { id: 'p1', ordem: 1, grupo: null, texto: 'Faróis', tipoResposta: 'OK_NOK', fotoNoNaoOk: false, opcoes: [], motivos: [], ...parcial };
}

function modelo(parcial: Partial<ModeloChecklist>): ModeloChecklist {
    return { id: 'm1', nome: 'Caminhonete', tipo: 'PRINCIPAL', instrucoes: null, exigeAssinatura: false, perguntas: [], fotosRecebimento: [], ...parcial };
}

const veiculo: VeiculoChecklist = {
    idVeiculo: 'v1', placa: 'ABC1234', descricao: 'Hilux', idBaseOperacional: null, baseNome: null, unidadeMedicao: 'KM',
    categoriaCnhExigida: 'C', medicaoAtual: 100, idsModelosPrincipais: ['m1', 'm2'], idsModelosAdicionais: ['a1'],
    idCondutorAtual: null, condutorAtualNome: null
};

const condutor: CondutorChecklist = { idColaborador: 'c1', nome: 'Condutor Teste', categoriaCnh: 'D', validadeCnh: '2028-12-31' };

describe('checklist-veiculo.models', () => {
    describe('categoriaHabilita', () => {
        it('segue a hierarquia do CTB', () => {
            expect(categoriaHabilita('D', 'C')).toBe(true);
            expect(categoriaHabilita('AE', 'B')).toBe(true);
            expect(categoriaHabilita('B', 'C')).toBe(false);
            expect(categoriaHabilita('B', 'A')).toBe(false);
            expect(categoriaHabilita(null, 'B')).toBe(false);
            expect(categoriaHabilita(null, null)).toBe(true);
        });
    });

    describe('situacaoCnh', () => {
        it('em dia e com categoria suficiente fica apto', () => {
            expect(situacaoCnh(condutor, veiculo, [], '2026-10-15').situacao).toBe('APTO');
        });

        it('vencida bloqueia, a menos que o gestor tenha liberado no dia', () => {
            const vencida = { ...condutor, validadeCnh: '2026-01-01' };
            const sem = situacaoCnh(vencida, veiculo, [], '2026-10-15');
            expect(sem.situacao).toBe('VENCIDA');
            expect(sem.liberado).toBe(false);
            const com = situacaoCnh(vencida, veiculo, [{ idCondutor: 'c1', idVeiculo: 'v1', dia: '2026-10-15' }], '2026-10-15');
            expect(com.liberado).toBe(true);
            const outroDia = situacaoCnh(vencida, veiculo, [{ idCondutor: 'c1', idVeiculo: 'v1', dia: '2026-10-14' }], '2026-10-15');
            expect(outroDia.liberado).toBe(false);
        });

        it('sem CNH registrada e categoria insuficiente', () => {
            expect(situacaoCnh(undefined, veiculo, [], '2026-10-15').situacao).toBe('SEM_CNH');
            expect(situacaoCnh({ ...condutor, categoriaCnh: 'B' }, veiculo, [], '2026-10-15').situacao).toBe('CATEGORIA_INSUFICIENTE');
        });
    });

    describe('modelosDoVeiculo e gruposDePerguntas', () => {
        const catalogo: CatalogoChecklist = {
            geradoEm: '', condutores: [], liberacoesCnh: [], veiculos: [veiculo],
            modelos: [
                modelo({ id: 'm1', perguntas: [pergunta({ id: 'b', ordem: 2, grupo: 'Iluminação' }), pergunta({ id: 'a', ordem: 1, grupo: 'Iluminação' })] }),
                modelo({ id: 'm2', nome: 'Geral' }),
                modelo({ id: 'a1', nome: 'Cesto aéreo', tipo: 'ADICIONAL', perguntas: [pergunta({ id: 'c', grupo: null })] })
            ]
        };

        it('usa o principal escolhido, ou o primeiro', () => {
            expect(modelosDoVeiculo(catalogo, veiculo).principal?.id).toBe('m1');
            expect(modelosDoVeiculo(catalogo, veiculo, 'm2').principal?.id).toBe('m2');
            expect(modelosDoVeiculo(catalogo, veiculo, 'sumiu').principal?.id).toBe('m1');
            expect(modelosDoVeiculo(catalogo, veiculo).adicionais.map((m) => m.id)).toEqual(['a1']);
        });

        it('agrupa na ordem do modelo; o adicional sem grupo entra com o nome dele', () => {
            const { principal, adicionais } = modelosDoVeiculo(catalogo, veiculo);
            const grupos = gruposDePerguntas(principal!, adicionais);
            expect(grupos.map((g) => g.titulo)).toEqual(['Iluminação', 'Cesto aéreo']);
            expect(grupos[0].perguntas.map((p) => p.id)).toEqual(['a', 'b']);
        });
    });

    describe('respostas', () => {
        it('Não OK exige foto quando a pergunta pede', () => {
            const p = pergunta({ fotoNoNaoOk: true });
            expect(pendenciaDaPergunta(p, undefined)).toBe('Marque OK ou Não OK.');
            expect(pendenciaDaPergunta(p, { idPergunta: 'p1', conforme: false, fotos: [] })).toBe('Tire a foto do problema.');
            const foto = { idFoto: 'f1', arquivo: new Blob(), nomeArquivo: 'f.jpg', enviada: false };
            expect(pendenciaDaPergunta(p, { idPergunta: 'p1', conforme: false, fotos: [foto] })).toBeNull();
            expect(pendenciaDaPergunta(p, { idPergunta: 'p1', conforme: true, fotos: [] })).toBeNull();
        });

        it('opção que indica problema conta como problema; texto nunca', () => {
            const p = pergunta({ tipoResposta: 'OPCOES', opcoes: [{ id: 'bom', texto: 'Bom', indicaProblema: false }, { id: 'careca', texto: 'Careca', indicaProblema: true }] });
            expect(respostaComProblema(p, { idPergunta: 'p1', idAlternativa: 'careca', fotos: [] })).toBe(true);
            expect(respostaComProblema(p, { idPergunta: 'p1', idAlternativa: 'bom', fotos: [] })).toBe(false);
            expect(pendenciaDaPergunta(p, { idPergunta: 'p1', fotos: [] })).toBe('Escolha uma opção.');
            const texto = pergunta({ tipoResposta: 'TEXTO' });
            expect(pendenciaDaPergunta(texto, { idPergunta: 'p1', texto: '   ', fotos: [] })).toBe('Escreva a resposta.');
            expect(respostaComProblema(texto, { idPergunta: 'p1', texto: 'x', fotos: [] })).toBe(false);
        });
    });

    describe('montarRequest', () => {
        it('manda os ids das fotos (os arquivos sobem depois) e limpa textos vazios', () => {
            const foto = { idFoto: 'f1', arquivo: new Blob(['x']), nomeArquivo: 'f.jpg', enviada: false };
            const receb = { idFoto: 'f2', arquivo: new Blob(['y']), nomeArquivo: 'r.jpg', enviada: false };
            const c: ChecklistVeiculoLocal = {
                id: 'ap1', statusSync: 'FILA', passo: 5, idVeiculo: 'v1', placa: 'ABC1234', idModelo: 'm1', idsModelosAdicionais: [],
                idCondutor: 'c1', condutorNome: 'Condutor Teste', preenchidoEm: '2026-10-15T10:00:00Z', medicao: 135, comentario: '  ', assinado: false,
                respostas: [{ idPergunta: 'p1', conforme: false, comentario: ' apagado ', fotos: [foto] }],
                fotosRecebimento: [{ idFotoRecebimento: 'fr1', foto: receb }], criadoEm: ''
            };
            const req = montarRequest(c);
            expect(req.idAparelho).toBe('ap1');
            expect(req.comentario).toBeNull();
            expect(req.respostas[0]).toEqual({ idPergunta: 'p1', conforme: false, idAlternativa: null, texto: null, comentario: 'apagado', idsFotos: ['f1'] });
            expect(req.fotosRecebimento).toEqual([{ idFotoRecebimento: 'fr1', idFoto: 'f2' }]);
            expect(todasAsFotos(c).map((f) => f.idFoto)).toEqual(['f1', 'f2']);
        });
    });

    it('formatarPlaca segue a web', () => {
        expect(formatarPlaca('abc1234')).toBe('ABC-1234');
        expect(formatarPlaca('RET0T01')).toBe('RET0T01');
        expect(formatarPlaca(null)).toBe('');
    });

    it('decisão do gestor em palavras de campo, com o número da OS quando foi para a oficina', () => {
        expect(decisaoPendencia('ABERTA', null)).toEqual({ texto: 'Aguardando o gestor', tom: 'atencao' });
        expect(decisaoPendencia('OS_ABERTA', 42)?.texto).toBe('Foi para a OS nº 42');
        expect(decisaoPendencia('RESOLVIDA_NA_HORA', null)?.tom).toBe('ok');
        expect(decisaoPendencia('DESCARTADA', null)?.texto).toBe('Gestor descartou');
        expect(decisaoPendencia(null, null)).toBeNull();
    });

    it('resposta do aparelho no mesmo texto do servidor: OK, Não OK com o motivo, a opção ou o texto', () => {
        const farois = pergunta({ motivos: [{ id: 'q', texto: 'Queimado', indicaProblema: false }] });
        expect(textoRespostaLocal(farois, { idPergunta: 'p1', conforme: true, fotos: [] })).toBe('OK');
        expect(textoRespostaLocal(farois, { idPergunta: 'p1', conforme: false, idAlternativa: 'q', fotos: [] })).toBe('Não OK — Queimado');
        expect(textoRespostaLocal(farois, undefined)).toBe('Sem resposta');
        const pneus = pergunta({ tipoResposta: 'OPCOES', opcoes: [{ id: 'c', texto: 'Careca', indicaProblema: true }] });
        expect(textoRespostaLocal(pneus, { idPergunta: 'p1', idAlternativa: 'c', fotos: [] })).toBe('Careca');
        const obs = pergunta({ tipoResposta: 'TEXTO' });
        expect(textoRespostaLocal(obs, { idPergunta: 'p1', texto: '  Banco rasgado ', fotos: [] })).toBe('Banco rasgado');
    });

    it('resumo dos problemas e medição na unidade do veículo', () => {
        expect(resumoProblemas(0)).toBe('Tudo OK');
        expect(resumoProblemas(1)).toBe('1 item com problema');
        expect(resumoProblemas(3)).toBe('3 itens com problema');
        expect(formatarMedicao(15000, 'KM')).toBe('15.000 km');
        expect(formatarMedicao(320, 'HORAS')).toBe('320 h');
        expect(formatarMedicao(null, 'KM')).toBe('—');
    });
    it('trava o KM menor que o último e o salto acima do limite', () => {
        expect(erroTravaMedicao(45100, 45120, 2000, 'KM')).toContain('Menor que o último');
        expect(erroTravaMedicao(5509615, 550961, 2000, 'KM')).toContain('casa decimal');
        expect(erroTravaMedicao(47120, 45120, 2000, 'KM')).toBeNull();
        expect(erroTravaMedicao(90000, 45120, null, 'KM')).toBeNull();
        expect(intervaloAceito(45120, 2000, 'KM')).toBe('Aceita de 45.120 a 47.120 km');
    });

    it('a foto "sempre" é pedida mesmo com OK, e o recebimento vai sem condutor', () => {
        const extintor = pergunta({ modoFoto: 'SEMPRE' });
        expect(pendenciaDaPergunta(extintor, { idPergunta: 'p1', conforme: true, fotos: [] })).toBe('Tire a foto do item.');
        expect(pendenciaDaPergunta(extintor, { idPergunta: 'p1', conforme: true, fotos: [{ idFoto: 'f', arquivo: new Blob(), nomeArquivo: 'f.jpg', enviada: false }] })).toBeNull();
        const base = { id: 'c1', statusSync: 'FILA' as const, passo: 5, idVeiculo: 'v1', placa: 'ABC1D23', idModelo: 'm1', idsModelosAdicionais: [],
            idCondutor: 'x', condutorNome: null, preenchidoEm: '2026-10-23T08:00:00-03:00', medicao: 100, comentario: '', assinado: false,
            respostas: [], fotosRecebimento: [], criadoEm: '' };
        expect(montarRequest({ ...base, finalidade: 'RECEBIMENTO' })).toEqual(expect.objectContaining({ finalidade: 'RECEBIMENTO', idCondutor: null }));
        expect(montarRequest(base)).toEqual(expect.objectContaining({ finalidade: 'USO', idCondutor: 'x' }));
    });
});
