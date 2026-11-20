import { OutboxItem } from '../db/models';
import { descreverItemFila, tipoDoItem } from './item-fila';

describe('itens da fila de envio', () => {
    describe('descreverItemFila', () => {
        const agora = new Date(2026, 9, 8, 15, 0);
        function item(over: Partial<OutboxItem>): OutboxItem {
            return {
                id: 'i-1', endpoint: '/v1/solicitacoes-material', method: 'POST',
                payload: { tempId: 't' },
                status: 'PENDENTE', tentativas: 0, criadoEm: new Date(2026, 9, 8, 11, 58), ...over,
            };
        }

        it('mostra o tipo e a hora', () => {
            const d = descreverItemFila(item({}), false, agora);
            expect(d.titulo).toBe('Pedido de material');
            expect(d.detalhe).toBe('11:58');
            expect(d.estado).toBe('queued');
        });

        it('item de outro dia mostra a data', () => {
            expect(descreverItemFila(item({ criadoEm: new Date(2026, 9, 6, 9, 5) }), false, agora).detalhe).toBe('06/10 09:05');
        });

        it('resultado incerto vira conflito com orientação', () => {
            const d = descreverItemFila(item({ status: 'RESULTADO_INCERTO' }), false, agora);
            expect(d.estado).toBe('conflict');
            expect(d.motivo).toContain('Confira');
        });

        it('erro recebido pelo escritório fala em análise, não em falha', () => {
            const d = descreverItemFila(item({ status: 'ERRO', receiptStatus: 'RECEIVED' }), false, agora);
            expect(d.estado).toBe('error');
            expect(d.motivo).toBe('Chegou ao escritório e está em análise.');
        });

        it('adiado por espera crescente avisa que tenta sozinho', () => {
            const d = descreverItemFila(item({ tentativas: 2, proximaTentativaEm: agora.getTime() + 60000 }), false, agora);
            expect(d.motivo).toContain('Tenta de novo sozinho');
        });

        it('identifica o tipo pelo endpoint', () => {
            expect(tipoDoItem('/v1/solicitacoes-material')).toBe('pedido');
            expect(tipoDoItem('/v1/movimentacoes-estoque/transferencia')).toBe('transferencia');
            expect(tipoDoItem('/_orchestrator/inspecao/anexo')).toBe('anexo');
            expect(tipoDoItem('/_orchestrator/inspecao/lancar')).toBe('inspecao');
            expect(tipoDoItem('/v1/turnos/abrir')).toBe('turno');
            expect(descreverItemFila(item({ endpoint: '/v1/solicitacoes-material', payload: {} }), false, agora).titulo).toBe('Pedido de material');
        });
    });
});
