import { TestBed } from '@angular/core/testing';
import { OutboxService } from './outbox.service';
import { db } from '../db/app-db';
import { OutboxItem } from '../db/models';

function intencao(tempId: string) {
    return { endpoint: '/v1/movimentacoes-estoque/transferencia', method: 'POST' as const, payload: { tempId } };
}

/**
 * Versões substituídas deixadas na fila por versões anteriores do app: nunca são enviadas
 * (mandar as duas duplicava o registro no servidor).
 */
describe('OutboxService — versões substituídas na fila', () => {
    let outbox: OutboxService;

    beforeEach(async () => {
        await db.outbox.clear();
        TestBed.configureTestingModule({});
        outbox = TestBed.inject(OutboxService);
    });

    afterAll(async () => {
        await db.outbox.clear();
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
