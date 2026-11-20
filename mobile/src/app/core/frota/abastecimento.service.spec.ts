import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { OutboxItem } from '../db/models';
import { OutboxService } from '../sync/outbox.service';
import { AbastecimentoLocal, AbastecimentoServidor, novoRealizado } from './abastecimento.models';
import { ABASTECIMENTO_ENDPOINT, AbastecimentoService } from './abastecimento.service';

const API = `${environment.apiBaseUrl}/v1/frota/app/abastecimento`;

describe('AbastecimentoService', () => {
    let servico: AbastecimentoService;
    let http: HttpTestingController;

    function pedido(parcial: Partial<AbastecimentoLocal> = {}): AbastecimentoLocal {
        return {
            ...servico.novoRascunho(),
            idVeiculo: 'v1', placa: 'ABC1D23', idCondutor: 'c1', condutorNome: 'Condutor Teste', idPosto: 'p1', postoNome: 'Posto Teste',
            medicao: 1200, destino: 'Sobradinho', itens: [{ idProduto: 's10', nome: 'Diesel S10', categoria: 'COMBUSTIVEL', unidade: 'L' }],
            fotoPainel: { idFoto: 'f1', arquivo: new Blob(['x']), nomeArquivo: 'painel.jpg', enviada: false },
            ...parcial
        };
    }

    function resposta(a: AbastecimentoLocal, parcial: Partial<AbastecimentoServidor> = {}): AbastecimentoServidor {
        return {
            id: 's1', idAparelho: a.id, idVeiculo: 'v1', placa: 'ABC1D23', situacao: 'AGUARDANDO_APROVACAO', situacaoRotulo: 'Aguardando aprovação',
            idPosto: 'p1', posto: 'Posto Teste', condutor: 'Condutor Teste', medicaoSolicitacao: 1200, solicitadoEm: a.solicitadoEm ?? '',
            aprovadoEm: null, liberadoEm: null, venceEm: null, realizadoEm: null, motivoReprovacao: null, motivoCancelamento: null,
            itens: [{ id: 'i1', categoria: 'COMBUSTIVEL', idProdutoPedido: 's10', produtoPedido: 'Diesel S10', quantidadePedida: null, unidade: 'L',
                    quantidadeAprovada: 60, quantidadeLiberada: 60, quantidadeAutorizada: 60, idProduto: null, produto: null, quantidade: null, valorTotal: null, valorUnitario: null, tanqueCheio: null }],
            fotosPendentes: ['f1'], podeCancelar: true, medicaoValida: true, motivoMedicao: null, ...parcial
        };
    }

    const item = async (id: string, operacao: string) => (await db.outbox.get(`abastecimento:${id}:${operacao}`)) as OutboxItem;

    async function proxima(url: string) {
        for (let i = 0; i < 50; i++) {
            const achadas = http.match(url);
            if (achadas.length)
                return achadas[0];
            await new Promise((r) => setTimeout(r, 10));
        }
        return http.expectOne(url);
    }

    /** Pedido já aceito pelo servidor e liberado (para cancelar e registrar). */
    async function liberado(): Promise<AbastecimentoLocal> {
        const a = pedido({ statusSync: 'ENVIADO', registrado: true, solicitadoEm: '2026-10-16T08:00:00-03:00' });
        const salvo = { ...a, servidor: resposta(a, { situacao: 'LIBERADA', fotosPendentes: [] }) };
        await db.abastecimentos.put(salvo);
        return salvo;
    }

    beforeEach(async () => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), AbastecimentoService, OutboxService]
        });
        servico = TestBed.inject(AbastecimentoService);
        http = TestBed.inject(HttpTestingController);
        await Promise.all([db.abastecimentos.clear(), db.outbox.clear()]);
    });

    afterEach(() => http.verify());

    afterAll(async () => {
        await Promise.all([db.abastecimentos.clear(), db.outbox.clear()]);
    });

    it('enfileira o pedido e, na fila, envia uma vez, sobe a foto e libera o espaço', async () => {
        const a = pedido();
        await servico.enfileirarPedido(a);
        const fila = await item(a.id, 'solicitar');
        expect(fila.endpoint).toBe(ABASTECIMENTO_ENDPOINT);
        expect((await db.abastecimentos.get(a.id))?.statusSync).toBe('FILA');

        const envio = servico.processarEnvio(fila);
        const post = await proxima(`${API}/solicitacoes`);
        expect(post.request.body.idAparelho).toBe(a.id);
        expect(post.request.body.idFotoPainel).toBe('f1');
        post.flush(resposta(a, { medicaoValida: false, motivoMedicao: 'Menor que a anterior.' }));
        (await proxima(`${API}/solicitacoes/${a.id}/fotos/f1`)).flush(resposta(a, { fotosPendentes: [] }));
        await envio;

        const salvo = await db.abastecimentos.get(a.id);
        expect(salvo?.statusSync).toBe('ENVIADO');
        expect(salvo?.servidor?.situacao).toBe('AGUARDANDO_APROVACAO');
        expect(salvo?.aviso).toBe('Menor que a anterior.');
        expect(salvo?.fotoPainel?.arquivo.size).toBe(0);
        expect(await item(a.id, 'solicitar')).toBeUndefined();
    });

    it('recusa do servidor marca ERRO com o motivo; reabrir volta a rascunho fora da fila', async () => {
        const a = pedido();
        await servico.enfileirarPedido(a);
        const envio = servico.processarEnvio(await item(a.id, 'solicitar'));
        (await proxima(`${API}/solicitacoes`)).flush({ detail: 'O ABC1D23 ainda não tem checklist hoje.' }, { status: 422, statusText: 'Unprocessable' });
        await expect(envio).rejects.toThrow();
        const recusado = await db.abastecimentos.get(a.id);
        expect(recusado?.statusSync).toBe('ERRO');
        expect(recusado?.erro).toBe('O ABC1D23 ainda não tem checklist hoje.');

        expect(await servico.reabrir(a.id)).toBe(true);
        expect((await db.abastecimentos.get(a.id))?.statusSync).toBe('RASCUNHO');
        expect(await item(a.id, 'solicitar')).toBeUndefined();
    });

    it('sem rede, fica na fila; a foto que o servidor não reconhece (404) não trava o envio', async () => {
        const a = pedido();
        await servico.enfileirarPedido(a);
        const primeira = servico.processarEnvio(await item(a.id, 'solicitar'));
        (await proxima(`${API}/solicitacoes`)).flush(null, { status: 0, statusText: 'Sem rede' });
        await expect(primeira).rejects.toThrow();
        expect((await db.abastecimentos.get(a.id))?.statusSync).toBe('FILA');

        const segunda = servico.processarEnvio(await item(a.id, 'solicitar'));
        (await proxima(`${API}/solicitacoes`)).flush(resposta(a));
        (await proxima(`${API}/solicitacoes/${a.id}/fotos/f1`)).flush({ detail: 'Esta foto não faz parte do abastecimento.' }, { status: 404, statusText: 'Not Found' });
        await segunda;
        expect((await db.abastecimentos.get(a.id))?.statusSync).toBe('ENVIADO');
    });

    it('cancelar o que nem saiu do aparelho resolve aqui e tira da fila', async () => {
        const a = pedido();
        await servico.enfileirarPedido(a);
        await servico.cancelar((await db.abastecimentos.get(a.id))!, 'Desisti');
        const salvo = await db.abastecimentos.get(a.id);
        expect(salvo?.cancelamento).toEqual({ statusSync: 'ENVIADO', motivo: 'Desisti', erro: null });
        expect(await item(a.id, 'solicitar')).toBeUndefined();
        http.expectNone(`${API}/solicitacoes`);
    });

    it('cancelar o que já está no servidor vai pela fila com o motivo', async () => {
        const a = await liberado();
        await servico.cancelar(a, 'Veículo na oficina');
        const envio = servico.processarEnvio(await item(a.id, 'cancelar'));
        const post = await proxima(`${API}/solicitacoes/${a.id}/cancelamento`);
        expect(post.request.body).toEqual({ motivo: 'Veículo na oficina' });
        post.flush(resposta(a, { situacao: 'CANCELADA', motivoCancelamento: 'Veículo na oficina', podeCancelar: false }));
        await envio;
        const salvo = await db.abastecimentos.get(a.id);
        expect(salvo?.servidor?.situacao).toBe('CANCELADA');
        expect(salvo?.cancelamento?.statusSync).toBe('ENVIADO');
    });

    it('o registro do realizado envia uma vez e sobe as duas fotos', async () => {
        const a = await liberado();
        const r = { ...novoRealizado(a.servidor!), medicao: 1240,
            fotoPainel: { idFoto: 'f2', arquivo: new Blob(['p']), nomeArquivo: 'p.jpg', enviada: false },
            fotoCupom: { idFoto: 'f3', arquivo: new Blob(['c']), nomeArquivo: 'c.jpg', enviada: false } };
        r.itens[0] = { ...r.itens[0], quantidade: 58.4, valorTotal: 402.96, tanqueCheio: true };
        await servico.enfileirarRealizado(a, r);

        const envio = servico.processarEnvio(await item(a.id, 'realizar'));
        const post = await proxima(`${API}/solicitacoes/${a.id}/realizado`);
        expect(post.request.body.itens).toEqual([{ idItem: 'i1', idProduto: null, quantidade: 58.4, valorTotal: 402.96, tanqueCheio: true }]);
        post.flush(resposta(a, { situacao: 'REALIZADA', fotosPendentes: ['f2', 'f3'] }));
        (await proxima(`${API}/solicitacoes/${a.id}/fotos/f2`)).flush(resposta(a, { situacao: 'REALIZADA', fotosPendentes: ['f3'] }));
        (await proxima(`${API}/solicitacoes/${a.id}/fotos/f3`)).flush(resposta(a, { situacao: 'REALIZADA', fotosPendentes: [] }));
        await envio;

        const salvo = await db.abastecimentos.get(a.id);
        expect(salvo?.servidor?.situacao).toBe('REALIZADA');
        expect(salvo?.realizado?.statusSync).toBe('ENVIADO');
        expect(salvo?.realizado?.fotoCupom?.arquivo.size).toBe(0);
    });

    it('cancelamento de pedido que ainda não chegou ao servidor espera na fila (não é recusa)', async () => {
        const a = pedido({ statusSync: 'FILA' });
        await db.abastecimentos.put({ ...a, cancelamento: { statusSync: 'FILA', motivo: '' } });
        await db.outbox.put({ id: `abastecimento:${a.id}:cancelar`, endpoint: ABASTECIMENTO_ENDPOINT, method: 'POST',
            payload: { id: a.id, operacao: 'CANCELAR' }, status: 'PENDENTE', tentativas: 0, criadoEm: new Date() } as OutboxItem);
        await expect(servico.processarEnvio(await item(a.id, 'cancelar'))).rejects.toThrow();
        expect((await db.abastecimentos.get(a.id))?.cancelamento?.statusSync).toBe('FILA');
    });

    it('atualiza a situação pelo servidor e encontra o pedido aberto do veículo', async () => {
        const a = pedido({ statusSync: 'ENVIADO', registrado: true });
        await db.abastecimentos.put(a);
        const atualizar = servico.atualizarDoServidor();
        (await proxima(`${API}/solicitacoes`)).flush([resposta(a, { situacao: 'LIBERADA' }), resposta(pedido({ id: 'outro' }), { idAparelho: 'outro', situacao: 'REALIZADA' })]);
        await atualizar;
        expect((await db.abastecimentos.get(a.id))?.servidor?.situacao).toBe('LIBERADA');
        expect(await db.abastecimentos.get('outro')).toBeDefined();
        expect((await servico.abertoDoVeiculo('v1'))?.id).toBe(a.id);
        expect(await servico.abertoDoVeiculo('v1', a.id)).toBeUndefined();
    });
});
