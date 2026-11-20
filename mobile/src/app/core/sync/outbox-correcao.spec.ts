import { TestBed } from '@angular/core/testing';
import { CorrecaoRecusadaError, OutboxService } from './outbox.service';
import { db } from '../db/app-db';
import { OutboxItem, SolicitacaoLocal } from '../db/models';

function intencao(tempId: string) {
    return { endpoint: '/v1/solicitacoes-material', method: 'POST' as const, payload: { tempId } };
}

/**
 * Correção de registro na fila offline: a versão corrigida substitui a anterior, e nunca as
 * duas são enviadas (em campo, uma correção enviada junto com a anterior duplicou o registro).
 */
describe('OutboxService — correção de registro na fila', () => {
    let outbox: OutboxService;

    beforeEach(async () => {
        await Promise.all([db.outbox.clear(), db.solicitacoes.clear()]);
        TestBed.configureTestingModule({});
        outbox = TestBed.inject(OutboxService);
    });

    afterAll(async () => {
        await Promise.all([db.outbox.clear(), db.solicitacoes.clear()]);
    });

    it('pedido de material só é corrigido enquanto está na fila', async () => {
        const pedido = (id: string): SolicitacaoLocal => ({
            id, idEstoqueOrigem: 'o', idEstoqueDestino: 'd', idRequisitante: 'u', status: 'PENDENTE', itens: [],
        });
        const fila = (id: string) => ({ endpoint: '/v1/solicitacoes-material', method: 'POST' as const, payload: { tempId: id } });
        // Já sincronizado: está no aparelho com o id do servidor, fora da fila.
        await db.solicitacoes.put(pedido('id-servidor'));

        await expect(outbox.enqueueSolicitacao(fila('p2'), pedido('p2'), 'id-servidor')).rejects.toThrowError(CorrecaoRecusadaError);

        const original = await outbox.enqueueSolicitacao(fila('p1'), pedido('p1'));
        const novo = await outbox.enqueueSolicitacao(fila('p3'), pedido('p3'), 'p1', original);
        expect((await outbox.getPendingItems()).map(i => i.id)).toEqual([novo]);
    });

    describe('filas deixadas por versões anteriores do app', () => {
        function substituida(id: string, tentativas: number): OutboxItem {
            return {
                id, ...intencao(id), status: 'PENDENTE', receiptStatus: 'CONFLICT', tentativas, criadoEm: new Date(),
                erroDetalhes: 'Intenção substituída por uma nova versão local.',
            };
        }

        it('versão substituída nunca é enviada', async () => {
            await db.outbox.add(substituida('velha', 0));
            expect(await outbox.getPendingItems()).toEqual([]);
            expect(await outbox.reivindicarParaEnvio('velha')).toBeUndefined();
        });

        it('versão substituída que nunca foi tentada sai da fila', async () => {
            await db.outbox.add(substituida('velha', 0));
            await outbox.migrateLegacyItems();
            expect(await db.outbox.get('velha')).toBeUndefined();
        });

        it('versão substituída que já foi tentada fica retida para o administrativo conferir', async () => {
            await db.outbox.add(substituida('tentada', 1));
            await outbox.migrateLegacyItems();
            const item = await db.outbox.get('tentada');
            expect(item?.status).toBe('ERRO');
            expect(item?.erroDetalhes).toContain('duplicado');
        });
    });
});
