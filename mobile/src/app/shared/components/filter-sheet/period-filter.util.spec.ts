import { isWithinPeriod, periodStartTime } from './period-filter.util';

/** Data local deslocada em `days` dias a partir de agora, no formato ISO. */
function isoDaysAgo(days: number, hours = 12): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hours, 0, 0, 0);
    return date.toISOString();
}

describe('period-filter.util', () => {
    describe('periodStartTime', () => {
        it('retorna null para "todos" (sem recorte de data)', () => {
            expect(periodStartTime('todos')).toBeNull();
        });

        it('retorna o início do dia local para "hoje"', () => {
            const start = new Date(periodStartTime('hoje')!);
            const hoje = new Date();

            expect(start.getHours()).toBe(0);
            expect(start.getMinutes()).toBe(0);
            expect(start.getDate()).toBe(hoje.getDate());
        });

        it('inclui o dia atual na contagem da janela', () => {
            const start = new Date(periodStartTime('7dias')!);
            const esperado = new Date();
            esperado.setHours(0, 0, 0, 0);
            esperado.setDate(esperado.getDate() - 6);

            expect(start.getTime()).toBe(esperado.getTime());
        });
    });

    describe('isWithinPeriod', () => {
        it('aceita qualquer data quando o período é "todos"', () => {
            expect(isWithinPeriod(isoDaysAgo(900), 'todos')).toBe(true);
            expect(isWithinPeriod(undefined, 'todos')).toBe(true);
            expect(isWithinPeriod('data-invalida', 'todos')).toBe(true);
        });

        it('mantém registros de hoje no filtro "hoje"', () => {
            expect(isWithinPeriod(isoDaysAgo(0, 0), 'hoje')).toBe(true);
            expect(isWithinPeriod(isoDaysAgo(0, 23), 'hoje')).toBe(true);
        });

        it('remove registros de ontem no filtro "hoje"', () => {
            expect(isWithinPeriod(isoDaysAgo(1), 'hoje')).toBe(false);
        });

        it('respeita os limites de 7 e 30 dias', () => {
            expect(isWithinPeriod(isoDaysAgo(6), '7dias')).toBe(true);
            expect(isWithinPeriod(isoDaysAgo(7), '7dias')).toBe(false);
            expect(isWithinPeriod(isoDaysAgo(29), '30dias')).toBe(true);
            expect(isWithinPeriod(isoDaysAgo(30), '30dias')).toBe(false);
        });

        it('mantém visível um registro com data futura (relógio adiantado)', () => {
            expect(isWithinPeriod(isoDaysAgo(-1), 'hoje')).toBe(true);
        });

        it('descarta registros sem data ou com data inválida em períodos limitados', () => {
            expect(isWithinPeriod(undefined, '30dias')).toBe(false);
            expect(isWithinPeriod(null, '30dias')).toBe(false);
            expect(isWithinPeriod('', '30dias')).toBe(false);
            expect(isWithinPeriod('nao-e-data', '30dias')).toBe(false);
        });

        it('aceita objetos Date além de strings ISO', () => {
            const ontem = new Date();
            ontem.setDate(ontem.getDate() - 1);
            expect(isWithinPeriod(ontem, '7dias')).toBe(true);
            expect(isWithinPeriod(ontem, 'hoje')).toBe(false);
        });

        it('reaproveita o startTime informado, evitando recalcular por item', () => {
            const start = periodStartTime('7dias');
            expect(isWithinPeriod(isoDaysAgo(3), '7dias', start)).toBe(true);
            expect(isWithinPeriod(isoDaysAgo(10), '7dias', start)).toBe(false);
        });
    });
});
