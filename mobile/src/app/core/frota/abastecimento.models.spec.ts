import { AbastecimentoLocal, AbastecimentoServidor, emAndamento, mesclarServidor, montarRealizado, montarSolicitacao, novoRealizado, ordenarParaEquipe, pendenciasPedido, pendenciasRealizado, podeCancelar, podeRegistrarRealizado, precoUnitario, situacaoParaEquipe } from './abastecimento.models';

const FOTO = { idFoto: 'f1', arquivo: new Blob(['x']), nomeArquivo: 'painel.jpg', enviada: false };

function pedido(parcial: Partial<AbastecimentoLocal> = {}): AbastecimentoLocal {
    return {
        id: 'a1', statusSync: 'FILA', passo: 5, idVeiculo: 'v1', placa: 'ABC1D23', idCondutor: 'c1', condutorNome: 'Condutor Teste',
        idPosto: 'p1', postoNome: 'Posto Teste', medicao: 1200, destino: ' Sobradinho ', observacao: ' tanque na reserva ',
        itens: [{ idProduto: 's10', nome: 'Diesel S10', categoria: 'COMBUSTIVEL', unidade: 'L' }],
        fotoPainel: FOTO, solicitadoEm: '2026-10-16T08:00:00-03:00', criadoEm: '2026-10-16T07:58:00-03:00', ...parcial
    };
}

function servidor(parcial: Partial<AbastecimentoServidor> = {}): AbastecimentoServidor {
    return {
        id: 's1', idAparelho: 'a1', idVeiculo: 'v1', placa: 'ABC1D23', situacao: 'AGUARDANDO_APROVACAO', situacaoRotulo: 'Aguardando aprovação',
        idPosto: 'p1', posto: 'Posto Teste', condutor: 'Condutor Teste', medicaoSolicitacao: 1200, solicitadoEm: '2026-10-16T08:00:00-03:00',
        aprovadoEm: null, liberadoEm: null, venceEm: null, realizadoEm: null, motivoReprovacao: null, motivoCancelamento: null,
        itens: [{ id: 'i1', categoria: 'COMBUSTIVEL', idProdutoPedido: 's10', produtoPedido: 'Diesel S10', quantidadePedida: null, unidade: 'L',
                quantidadeAprovada: 60, quantidadeLiberada: 60, quantidadeAutorizada: 60,
                idProduto: null, produto: null, quantidade: null, valorTotal: null, valorUnitario: null, tanqueCheio: null }],
        fotosPendentes: [], podeCancelar: true, medicaoValida: true, motivoMedicao: null, ...parcial
    };
}

describe('Regras do abastecimento no app', () => {
    it('aponta o que falta em cada passo do pedido', () => {
        const vazio = pedido({ idVeiculo: null, idCondutor: null, idPosto: null, medicao: null, itens: [], fotoPainel: null });
        expect(pendenciasPedido(vazio)).toEqual({
            veiculo: 'Escolha o veículo.',
            inicio: 'Escolha quem vai dirigir.',
            itens: 'Escolha o que precisa abastecer.',
            foto: 'Tire a foto do painel mostrando a medição e o tanque.'
        });
        // A equipe não informa quantidade (gestores, 23/10/2026), mas diz o destino.
        expect(pendenciasPedido(pedido({ destino: '  ' })).inicio).toBe('Informe o destino.');
        expect(pendenciasPedido(pedido())).toEqual({ veiculo: null, inicio: null, itens: null, foto: null });
    });

    it('monta o pedido e o realizado do servidor sem os arquivos', () => {
        expect(montarSolicitacao(pedido())).toEqual({
            idAparelho: 'a1', idVeiculo: 'v1', idCondutor: 'c1', idPosto: 'p1', medicao: 1200, destino: 'Sobradinho', observacao: 'tanque na reserva',
            solicitadoEm: '2026-10-16T08:00:00-03:00', itens: [{ idProduto: 's10' }], idFotoPainel: 'f1'
        });
        const r = { ...novoRealizado(servidor({ situacao: 'LIBERADA' })), medicao: 1240, realizadoEm: '2026-10-16T10:00:00-03:00',
            fotoPainel: { ...FOTO, idFoto: 'f2' }, fotoCupom: { ...FOTO, idFoto: 'f3' } };
        r.itens[0] = { ...r.itens[0], idProduto: 's500', quantidade: 58.4, valorTotal: 402.96, tanqueCheio: true };
        expect(montarRealizado(r)).toEqual({
            medicao: 1240, realizadoEm: '2026-10-16T10:00:00-03:00',
            itens: [{ idItem: 'i1', idProduto: 's500', quantidade: 58.4, valorTotal: 402.96, tanqueCheio: true }],
            idFotoPainel: 'f2', idFotoCupom: 'f3'
        });
        expect(precoUnitario(r.itens[0])).toBe(6.9);
        expect(pendenciasRealizado(r)).toEqual({ valores: null, fotos: null });
    });

    it('o realizado começa com o liberado e o valor pelo preço do posto', () => {
        const catalogo = { geradoEm: '', produtos: [], preferidos: [],
            postos: [{ id: 'p1', nome: 'Posto Teste', idBaseOperacional: null, baseNome: null, precos: [{ idProduto: 's10', precoUnitario: 6.19 }] }] };
        const r = novoRealizado(servidor(), catalogo);
        expect(r.itens).toEqual([{ idItem: 'i1', idProduto: null, quantidade: 60, precoPosto: 6.19, valorTotal: 371.4, tanqueCheio: false }]);
        expect(montarRealizado({ ...r, medicao: 1240 }).itens[0].valorTotal).toBeNull();
        expect(pendenciasRealizado({ ...r, medicao: 1240 }).valores).toBeNull();
    });

    it('sem preço do posto, o realizado cobra o valor, a medição e as duas fotos', () => {
        const r = novoRealizado(servidor());
        expect(r.itens).toEqual([{ idItem: 'i1', idProduto: null, quantidade: 60, precoPosto: null, valorTotal: null, tanqueCheio: false }]);
        expect(pendenciasRealizado(r)).toEqual({ valores: 'Informe a medição do painel depois de abastecer.', fotos: 'Tire a foto do painel depois de abastecer.' });
        expect(pendenciasRealizado({ ...r, medicao: 10 }).valores).toBe('O posto não tem preço deste produto cadastrado: informe o valor pago.');
        expect(pendenciasRealizado({ ...r, fotoPainel: FOTO }).fotos).toBe('Tire a foto do cupom ou da nota.');
    });

    it('em andamento bloqueia outro pedido do veículo; concluído, cancelado ou recusado não', () => {
        expect(emAndamento(pedido())).toBe(true);
        expect(emAndamento(pedido({ statusSync: 'RASCUNHO' }))).toBe(false);
        expect(emAndamento(pedido({ statusSync: 'ERRO' }))).toBe(false);
        expect(emAndamento(pedido({ servidor: servidor({ situacao: 'LIBERADA' }) }))).toBe(true);
        expect(emAndamento(pedido({ servidor: servidor({ situacao: 'REPROVADA' }) }))).toBe(false);
        expect(emAndamento(pedido({ servidor: servidor({ situacao: 'LIBERADA' }), cancelamento: { statusSync: 'FILA', motivo: '' } }))).toBe(false);
        expect(emAndamento(pedido({ servidor: servidor({ situacao: 'LIBERADA' }), realizado: { ...novoRealizado(servidor()), statusSync: 'FILA' } }))).toBe(false);
    });

    it('registra só o liberado; cancela antes da liberação, depois só com a palavra do servidor', () => {
        expect(podeRegistrarRealizado(pedido({ servidor: servidor({ situacao: 'APROVADA' }) }))).toBe(false);
        expect(podeRegistrarRealizado(pedido({ servidor: servidor({ situacao: 'LIBERADA' }) }))).toBe(true);
        expect(podeCancelar(pedido())).toBe(true);
        expect(podeCancelar(pedido({ servidor: servidor({ situacao: 'LIBERADA', podeCancelar: false }) }))).toBe(false);
        expect(podeCancelar(pedido({ servidor: servidor(), cancelamento: { statusSync: 'FILA', motivo: '' } }))).toBe(false);
    });

    it('a situação diz à equipe o que acontece agora', () => {
        expect(situacaoParaEquipe(pedido()).rotulo).toBe('Na fila');
        expect(situacaoParaEquipe(pedido({ statusSync: 'ERRO', erro: 'Sem checklist hoje.' }))).toEqual({ rotulo: 'Recusado', tom: 'erro', apoio: 'Sem checklist hoje.' });
        expect(situacaoParaEquipe(pedido({ servidor: servidor({ situacao: 'LIBERADA' }) })).apoio).toBe('Pode abastecer no Posto Teste até as 23h59.');
        expect(situacaoParaEquipe(pedido({ servidor: servidor({ situacao: 'REPROVADA', motivoReprovacao: 'Refaça a foto.' }) })).apoio).toBe('Refaça a foto.');
        expect(situacaoParaEquipe(pedido({ statusSync: 'ENVIADO', cancelamento: { statusSync: 'ENVIADO', motivo: 'Oficina.' } })).rotulo).toBe('Cancelado');
    });

    it('mescla o servidor sem perder o rascunho do realizado e cria o pedido feito em outro aparelho', () => {
        const rascunho = { ...novoRealizado(servidor()), medicao: 1250 };
        const local = pedido({ servidor: servidor(), realizado: rascunho });
        const mesclado = mesclarServidor(local, servidor({ situacao: 'LIBERADA' }));
        expect(mesclado.servidor?.situacao).toBe('LIBERADA');
        expect(mesclado.realizado?.medicao).toBe(1250);
        expect(mesclado.fotoPainel).toBe(FOTO);

        const deOutro = mesclarServidor(undefined, servidor({ idAparelho: 'outro', situacao: 'REALIZADA' }));
        expect(deOutro.id).toBe('outro');
        expect(deOutro.statusSync).toBe('ENVIADO');
        expect(deOutro.itens).toEqual([{ idProduto: 's10', nome: 'Diesel S10', categoria: 'COMBUSTIVEL', unidade: 'L', quantidade: 60 }]);
    });

    it('ordena o liberado primeiro, depois o que espera, depois o histórico', () => {
        const liberado = pedido({ id: 'l', servidor: servidor({ situacao: 'LIBERADA' }), solicitadoEm: '2026-10-15T08:00:00-03:00' });
        const esperando = pedido({ id: 'e', servidor: servidor(), solicitadoEm: '2026-10-16T09:00:00-03:00' });
        const feito = pedido({ id: 'f', servidor: servidor({ situacao: 'REALIZADA' }), solicitadoEm: '2026-10-16T10:00:00-03:00' });
        expect(ordenarParaEquipe([feito, esperando, liberado]).map((a) => a.id)).toEqual(['l', 'e', 'f']);
    });
});
