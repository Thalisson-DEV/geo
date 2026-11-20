import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { db } from '../db/app-db';
import { OutboxItem } from '../db/models';
import { OutboxService } from '../sync/outbox.service';
import { ChecklistVeiculoLocal } from './checklist-veiculo.models';
import { CHECKLIST_LANCAR_ENDPOINT, ChecklistVeiculoService } from './checklist-veiculo.service';

const API = environment.apiBaseUrl;

describe('ChecklistVeiculoService', () => {
    let servico: ChecklistVeiculoService;
    let http: HttpTestingController;

    function checklist(parcial: Partial<ChecklistVeiculoLocal> = {}): ChecklistVeiculoLocal {
        return {
            ...servico.novoRascunho(),
            idVeiculo: 'v1', placa: 'ABC1234', idModelo: 'm1', idCondutor: 'c1', condutorNome: 'Condutor Teste', medicao: 135,
            respostas: [{ idPergunta: 'p1', conforme: false, fotos: [{ idFoto: 'f1', arquivo: new Blob(['x']), nomeArquivo: 'f.jpg', enviada: false }] }],
            ...parcial
        };
    }

    async function itemDaFila(id: string): Promise<OutboxItem> {
        return (await db.outbox.get(id))!;
    }

    /** Espera a próxima requisição sair (o serviço faz leituras no IndexedDB entre uma e outra). */
    async function proxima(url: string) {
        for (let i = 0; i < 50; i++) {
            const achadas = http.match(url);
            if (achadas.length)
                return achadas[0];
            await new Promise((r) => setTimeout(r, 10));
        }
        return http.expectOne(url);
    }

    beforeEach(async () => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), ChecklistVeiculoService, OutboxService]
        });
        servico = TestBed.inject(ChecklistVeiculoService);
        http = TestBed.inject(HttpTestingController);
        await Promise.all([db.checklistsVeiculo.clear(), db.outbox.clear()]);
    });

    afterEach(() => http.verify());

    afterAll(async () => {
        await Promise.all([db.checklistsVeiculo.clear(), db.outbox.clear()]);
    });

    it('enfileirar grava o checklist e o item da fila juntos', async () => {
        const c = checklist();
        await servico.enfileirar(c);
        const salvo = await db.checklistsVeiculo.get(c.id);
        expect(salvo?.statusSync).toBe('FILA');
        expect(salvo?.preenchidoEm).toBeTruthy();
        const item = await itemDaFila(c.id);
        expect(item.endpoint).toBe(CHECKLIST_LANCAR_ENDPOINT);
        expect(TestBed.inject(OutboxService).pendingCount()).toBe(1);
    });

    it('enfileirar leva a medição ao catálogo do aparelho, sem nunca baixar a última', async () => {
        const catalogo = { veiculos: [{ idVeiculo: 'v1', medicaoAtual: 100 }, { idVeiculo: 'v2', medicaoAtual: 500 }] };
        servico.catalogo.set(catalogo as never);
        await servico.enfileirar(checklist({ medicao: 135 }));
        expect(servico.catalogo()!.veiculos.find((v) => v.idVeiculo === 'v1')!.medicaoAtual).toBe(135);
        await servico.registrarMedicaoLocal('v2', 400);
        expect(servico.catalogo()!.veiculos.find((v) => v.idVeiculo === 'v2')!.medicaoAtual).toBe(500);
    });

    it('processarEnvio lança uma vez, sobe as fotos e libera o espaço no aparelho', async () => {
        const c = checklist();
        await servico.enfileirar(c);
        const envio = servico.processarEnvio(await itemDaFila(c.id));

        const lancamento = await proxima(`${API}/v1/frota/app/checklists`);
        expect(lancamento.request.body.idAparelho).toBe(c.id);
        lancamento.flush({ id: 's1', passagemVeiculo: false, medicaoValida: false, motivoMedicao: 'Menor que a anterior.', fotosPendentes: ['f1'] });
        (await proxima(`${API}/v1/frota/app/checklists/${c.id}/fotos/f1`)).flush({});
        await envio;

        const salvo = await db.checklistsVeiculo.get(c.id);
        expect(salvo?.statusSync).toBe('ENVIADO');
        expect(salvo?.idServidor).toBe('s1');
        expect(salvo?.aviso).toBe('Menor que a anterior.');
        expect(salvo?.respostas[0].fotos[0].arquivo.size).toBe(0);
        expect(await db.outbox.get(c.id)).toBeUndefined();
    });

    it('se a foto falha, o reenvio não lança de novo: só sobe a foto que faltou', async () => {
        const c = checklist();
        await servico.enfileirar(c);
        const primeira = servico.processarEnvio(await itemDaFila(c.id));
        (await proxima(`${API}/v1/frota/app/checklists`)).flush({ id: 's1', passagemVeiculo: false, medicaoValida: true, motivoMedicao: null, fotosPendentes: ['f1'] });
        (await proxima(`${API}/v1/frota/app/checklists/${c.id}/fotos/f1`)).flush(null, { status: 0, statusText: 'Sem rede' });
        await expect(primeira).rejects.toThrow();
        expect((await db.checklistsVeiculo.get(c.id))?.statusSync).toBe('FILA');

        const segunda = servico.processarEnvio(await itemDaFila(c.id));
        (await proxima(`${API}/v1/frota/app/checklists/${c.id}/fotos/f1`)).flush({});
        await segunda;
        http.expectNone(`${API}/v1/frota/app/checklists`);
        expect((await db.checklistsVeiculo.get(c.id))?.statusSync).toBe('ENVIADO');
    });

    it('foto de recebimento que o servidor não pediu não sobe (sem troca de condutor para ele)', async () => {
        const recebimento = { idFoto: 'r1', arquivo: new Blob(['r']), nomeArquivo: 'r.jpg', enviada: false };
        const c = checklist({ fotosRecebimento: [{ idFotoRecebimento: 'fr1', foto: recebimento }] });
        await servico.enfileirar(c);
        const envio = servico.processarEnvio(await itemDaFila(c.id));
        (await proxima(`${API}/v1/frota/app/checklists`)).flush({ id: 's1', passagemVeiculo: false, medicaoValida: true, motivoMedicao: null, fotosPendentes: ['f1'] });
        (await proxima(`${API}/v1/frota/app/checklists/${c.id}/fotos/f1`)).flush({});
        await envio;
        http.expectNone(`${API}/v1/frota/app/checklists/${c.id}/fotos/r1`);
        expect((await db.checklistsVeiculo.get(c.id))?.statusSync).toBe('ENVIADO');
    });

    it('gravado com falha na foto volta para a fila com "tentar de novo"', async () => {
        const c = checklist();
        await servico.enfileirar(c);
        await db.checklistsVeiculo.update(c.id, { statusSync: 'ERRO', registrado: true, erro: 'Falhou.' });
        await db.outbox.update(c.id, { status: 'ERRO', tentativas: 3 });
        await servico.tentarDeNovo(c.id);
        expect((await db.checklistsVeiculo.get(c.id))?.statusSync).toBe('FILA');
        const item = await itemDaFila(c.id);
        expect(item.status).toBe('PENDENTE');
        expect(item.tentativas).toBe(0);
    });

    it('recusa do servidor (4xx) marca ERRO com o motivo, e reabrir devolve como rascunho fora da fila', async () => {
        const c = checklist();
        await servico.enfileirar(c);
        const envio = servico.processarEnvio(await itemDaFila(c.id));
        (await proxima(`${API}/v1/frota/app/checklists`)).flush({ detail: 'A CNH venceu.' }, { status: 422, statusText: 'Unprocessable' });
        await expect(envio).rejects.toThrow();
        const recusado = await db.checklistsVeiculo.get(c.id);
        expect(recusado?.statusSync).toBe('ERRO');
        expect(recusado?.erro).toBe('A CNH venceu.');

        expect(await servico.reabrir(c.id)).toBe(true);
        expect((await db.checklistsVeiculo.get(c.id))?.statusSync).toBe('RASCUNHO');
        expect(await db.outbox.get(c.id)).toBeUndefined();
    });

    it('não reabre se já há outro rascunho em andamento', async () => {
        const recusado = checklist({ statusSync: 'ERRO' });
        await db.checklistsVeiculo.put(recusado);
        await servico.salvarRascunho(checklist());
        expect(await servico.reabrir(recusado.id)).toBe(false);
    });

    it('descartarRecusado tira do aparelho e da fila', async () => {
        const c = checklist();
        await servico.enfileirar(c);
        await db.checklistsVeiculo.update(c.id, { statusSync: 'ERRO' });
        await servico.descartarRecusado(c.id);
        expect(await db.checklistsVeiculo.get(c.id)).toBeUndefined();
        expect(await db.outbox.get(c.id)).toBeUndefined();
    });

    it('a consulta completa o id do servidor nos registros enviados antes de o app guardá-lo', async () => {
        const antigo = checklist({ statusSync: 'ENVIADO', registrado: true });
        await db.checklistsVeiculo.put(antigo);
        const consulta = servico.meusNoServidor();
        (await proxima(`${API}/v1/frota/app/checklists?dias=30`)).flush([
            { idAparelho: antigo.id, checklist: { id: 's9', placa: 'ABC1234', preenchidoEm: '2026-10-15T16:13:00-03:00', problemas: 1 } },
            { idAparelho: 'de-outro-aparelho', checklist: { id: 's10', placa: 'ABC1234', preenchidoEm: '2026-10-14T08:00:00-03:00', problemas: 0 } }
        ]);
        const itens = await consulta;

        expect(itens.length).toBe(2);
        expect((await db.checklistsVeiculo.get(antigo.id))?.idServidor).toBe('s9');
        expect(await db.checklistsVeiculo.get('de-outro-aparelho')).toBeUndefined();
    });
});

import { normalizarCatalogo } from './checklist-veiculo.service';

describe('normalizarCatalogo', () => {
  it('resposta sem as listas vira catálogo vazio (a abertura do turno não pode quebrar)', () => {
    const c = normalizarCatalogo({ content: [] } as never);
    expect(c.veiculos).toEqual([]);
    expect(c.modelos).toEqual([]);
    expect(c.condutores).toEqual([]);
    expect(c.liberacoesCnh).toEqual([]);
  });
});
