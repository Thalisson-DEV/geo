import type { Mock } from "vitest";
import { ChecklistVeiculoService } from '../frota/checklist-veiculo.service';
import { AbastecimentoService } from '../frota/abastecimento.service';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { SyncService, INSPECAO_ANEXO_ENDPOINT, INSPECAO_LANCAR_ENDPOINT, esperaPedidaMs, RETOMADA_SEM_REDE_BASE_MS, RETOMADA_SEM_REDE_MAX_MS, } from './sync.service';
import { TRAVA_FILA } from './sync.service';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { DbService } from '../db/db.service';
import { OutboxService } from './outbox.service';
import { OutboxItem } from '../db/models';
import { TurnoService } from '../turno/turno.service';
import { environment } from '../../../environments/environment';
import { BaseOperacionalService } from '../sst/base-operacional.service';

describe('SyncService', () => {
    beforeEach(() => {
        vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    let service: SyncService;
    let httpMock: HttpTestingController;

    let mockAuthService: {
        isAdministrativo: any;
        isCampo: any;
        podeAcessarInspecoes: any;
        podeAcessarLogistica: any;
        ehEquipeObras: any;
        ehSupervisorObras: any;
        currentUser: any;
        requireReauthentication: Mock;
        tokenAtualizado: Mock;
    };
    let mockDbService: any;
    let mockOutboxService: any;
    let mockTurnoService: any;
    let mockBaseOperacionalService: any;

    /** Etapas de catálogo espionadas para isolar o teste da camada HTTP. */
    const ETAPAS_CATALOGO = [
        'syncEquipeDoUsuario', 'syncMembrosEquipe', 'syncTodasEquipes', 'syncTodosColaboradores',
        'syncMunicipios', 'syncVeiculos', 'syncProcessos', 'syncFormularios', 'syncTiposInspecao',
        'syncMateriais', 'syncEstoques', 'syncSaldos', 'syncSeriais', 'syncSaldosPorObra', 'pullParcialData'
    ];

    function stubEtapas(): void {
        [...ETAPAS_CATALOGO, 'reaplicarDeducoesPendentes'].forEach(nome => vi.spyOn(service as any, nome).mockResolvedValue(undefined));
    }

    beforeEach(() => {
        mockAuthService = {
            isAdministrativo: signal(false),
            isCampo: signal(true),
            podeAcessarInspecoes: signal(false),
            podeAcessarLogistica: signal(true),
            ehEquipeObras: signal(false),
            ehSupervisorObras: signal(false),
            currentUser: signal({ id: '123', equipeId: '456' }),
            requireReauthentication: vi.fn().mockName('requireReauthentication'),
            tokenAtualizado: vi.fn().mockName('tokenAtualizado').mockResolvedValue('token-valido')
        };

        mockDbService = {
            getConfig: vi.fn().mockName("DbService.getConfig"),
            setConfig: vi.fn().mockName("DbService.setConfig"),
            saveEquipe: vi.fn().mockName("DbService.saveEquipe"),
            replaceEquipes: vi.fn().mockName("DbService.replaceEquipes"),
            replaceColaboradores: vi.fn().mockName("DbService.replaceColaboradores"),
            replaceMunicipios: vi.fn().mockName("DbService.replaceMunicipios"),
            replaceVeiculos: vi.fn().mockName("DbService.replaceVeiculos"),
            replaceProcessos: vi.fn().mockName("DbService.replaceProcessos"),
            replaceFormularios: vi.fn().mockName("DbService.replaceFormularios"),
            replaceTiposInspecao: vi.fn().mockName("DbService.replaceTiposInspecao"),
            replaceMateriais: vi.fn().mockName("DbService.replaceMateriais"),
            replaceEstoques: vi.fn().mockName("DbService.replaceEstoques"),
            bulkSaveMateriais: vi.fn().mockName("DbService.bulkSaveMateriais"),
            replaceSaldos: vi.fn().mockName("DbService.replaceSaldos"),
            replaceSaldosSeriais: vi.fn().mockName("DbService.replaceSaldosSeriais"),
            replaceTransferenciasSincronizadas: vi.fn().mockName("DbService.replaceTransferenciasSincronizadas"),
            replaceInspecoesSincronizadas: vi.fn().mockName("DbService.replaceInspecoesSincronizadas"),
            getInspecao: vi.fn().mockName("DbService.getInspecao"),
            deleteInspecao: vi.fn().mockName("DbService.deleteInspecao"),
            saveInspecao: vi.fn().mockName("DbService.saveInspecao"),
            getTransferenciaById: vi.fn().mockName("DbService.getTransferenciaById"),
            deleteTransferencia: vi.fn().mockName("DbService.deleteTransferencia"),
            saveTransferencia: vi.fn().mockName("DbService.saveTransferencia")
        };
        Object.values(mockDbService).forEach((spy: any) => spy?.mockResolvedValue(undefined));
        mockDbService.getConfig.mockResolvedValue(null);

        mockOutboxService = {
            getPendingItems: vi.fn().mockName("OutboxService.getPendingItems"),
            getErrorItems: vi.fn().mockName("OutboxService.getErrorItems"),
            discard: vi.fn().mockName("OutboxService.discard"),
            updateStatus: vi.fn().mockName("OutboxService.updateStatus"),
            incrementAttempt: vi.fn().mockName("OutboxService.incrementAttempt"),
            updateEndpoint: vi.fn().mockName("OutboxService.updateEndpoint"),
            updatePayload: vi.fn().mockName("OutboxService.updatePayload"),
            enqueue: vi.fn().mockName("OutboxService.enqueue"),
            adiarNovaTentativa: vi.fn().mockName("OutboxService.adiarNovaTentativa"),
            adiarPor: vi.fn().mockName("OutboxService.adiarPor"),
            proximoReenvioAgendado: vi.fn().mockName("OutboxService.proximoReenvioAgendado"),
            reivindicarParaEnvio: vi.fn().mockName("OutboxService.reivindicarParaEnvio")
        };
        // Por padrão a reivindicação devolve o item como a última leitura da fila o listou.
        mockOutboxService.reivindicarParaEnvio.mockImplementation(async (id: string) => {
            const listados = await vi.mocked(mockOutboxService.getPendingItems).mock.results.at(-1)?.value;
            return (listados as OutboxItem[] | undefined)?.find(i => i.id === id);
        });
        mockOutboxService.adiarNovaTentativa.mockResolvedValue(0);
        mockOutboxService.adiarPor.mockResolvedValue(0);
        mockOutboxService.proximoReenvioAgendado.mockResolvedValue(null);
        mockOutboxService.getPendingItems.mockResolvedValue([]);
        mockOutboxService.getErrorItems.mockResolvedValue([]);
        mockOutboxService.discard.mockResolvedValue(undefined);
        mockOutboxService.updateStatus.mockResolvedValue(undefined);
        mockOutboxService.incrementAttempt.mockResolvedValue(1);

        mockTurnoService = {
            syncTurnoAtivoComServidor: vi.fn().mockName("TurnoService.syncTurnoAtivoComServidor"),
            sincronizarComposicao: vi.fn().mockName("TurnoService.sincronizarComposicao")
        };
        mockTurnoService.sincronizarComposicao.mockResolvedValue({});
        mockTurnoService.syncTurnoAtivoComServidor.mockResolvedValue(undefined);

        mockBaseOperacionalService = {
            sincronizarAtivas: vi.fn().mockName("BaseOperacionalService.sincronizarAtivas")
        };
        mockBaseOperacionalService.sincronizarAtivas.mockResolvedValue([]);

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                // Relógio falso (fakeAsync) não avança o callback do Web Lock: trava de passagem.
                { provide: TRAVA_FILA, useValue: (fn: () => Promise<unknown>) => fn() },
                SyncService,
                { provide: AuthService, useValue: mockAuthService },
                { provide: DbService, useValue: mockDbService },
                { provide: OutboxService, useValue: mockOutboxService },
                {
                    provide: TokenService,
                    useValue: {
                        getDecodedPayload: () => ({ sub: 'user-1' }),
                        equipeId: signal('456'),
                        estoqueId: signal('est-1'),
                        usuarioId: signal('user-1'),
                        token: signal('token-valido'),
                        isTokenExpired: () => false,
                        reautenticacaoNecessaria: signal(false)
                    }
                },
                { provide: TurnoService, useValue: mockTurnoService },
                // Os catálogos do checklist e do abastecimento têm o próprio spec; aqui só a etapa existir já basta.
                { provide: ChecklistVeiculoService, useValue: { sincronizarCatalogo: () => Promise.resolve(), processarEnvio: () => Promise.resolve() } },
                { provide: AbastecimentoService, useValue: { sincronizarCatalogo: () => Promise.resolve(), processarEnvio: () => Promise.resolve() } },
                { provide: BaseOperacionalService, useValue: mockBaseOperacionalService }
            ]
        });

        service = TestBed.inject(SyncService);
        httpMock = TestBed.inject(HttpTestingController);
        // O estoque por obra tem teste próprio ("guarda o caminhão e os canteiros..."); nos demais só a etapa existir basta.
        vi.spyOn(service as any, 'syncSaldosPorObra').mockResolvedValue(undefined);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('guarda o caminhão e os canteiros separados por obra, com o livre à parte', async () => {
        vi.mocked((service as any).syncSaldosPorObra).mockRestore();
        mockDbService.replaceSaldosObra = vi.fn().mockResolvedValue(undefined);
        const base = `${environment.apiBaseUrl}/v1/estoque-obra`;

        const pedido = service.syncSaldosPorObra('est-1');
        httpMock.expectOne(`${base}/equipes/456/caminhao`).flush({
            idEstoque: 'est-1', materiais: [{ idMaterial: 'm1', codigo: '300117', descricao: 'Poste', unidade: 'UN', condicao: 'NOVO',
                fisico: 4, livre: 1, obras: [{ idObra: 'o1', numero: '430126363', quantidade: 3 }] }]
        });
        await Promise.resolve();
        httpMock.expectOne(`${base}/canteiros`).flush([{ id: 'c1', nome: 'CANTEIRO NORTE' }]);
        await new Promise(r => setTimeout(r));
        httpMock.expectOne(`${base}/estoques/c1`).flush({ idEstoque: 'c1', materiais: [] });
        await pedido;

        const [locais, linhas, canteiros] = mockDbService.replaceSaldosObra.mock.calls[0];
        expect(locais).toEqual(['est-1', 'c1']);
        expect(linhas.map((l: any) => [l.idObra, l.numeroObra, l.quantidade])).toEqual([['o1', '430126363', 3], [null, null, 1]]);
        expect(canteiros[0]).toEqual(expect.objectContaining({ id: 'c1', nome: 'CANTEIRO NORTE' }));
    });

    describe('syncTotal() — resiliência a permissões', () => {
        it('conclui o sync mesmo quando um catálogo responde 403', async () => {
            stubEtapas();
            (service as any).syncVeiculos.mockRejectedValue({ status: 403 });

            const result = await service.syncTotal();

            // O sync não aborta: as etapas seguintes continuam sendo executadas.
            expect((service as any).syncProcessos).toHaveBeenCalled();
            expect((service as any).syncMateriais).toHaveBeenCalled();
            expect(mockDbService.setConfig).toHaveBeenCalledWith('lastSyncAt', expect.any(String));

            expect(result.falhas.length).toBe(1);
            expect(result.falhas[0].etapa).toBe('Frota de veículos');
            expect(result.falhas[0].semPermissao).toBe(true);
            expect(service.falhasUltimoSync()).toEqual(result.falhas);
            expect(service.isSyncing()).toBe(false);
        });

        it('registra falha sem marcar semPermissao quando o erro não é 403', async () => {
            stubEtapas();
            (service as any).syncMateriais.mockRejectedValue({ status: 500, detail: 'Boom' });

            const result = await service.syncTotal();

            expect(result.falhas.length).toBe(1);
            expect(result.falhas[0]).toEqual({
                etapa: 'Catálogo de materiais',
                motivo: 'Boom',
                semPermissao: false,
                status: 500
            });
        });

        it('não sincroniza formulários quando o usuário não é administrativo', async () => {
            stubEtapas();

            await service.syncTotal();

            expect((service as any).syncFormularios).not.toHaveBeenCalled();
            expect((service as any).syncTiposInspecao).not.toHaveBeenCalled();
            expect((service as any).syncEquipeDoUsuario).toHaveBeenCalledWith('456');
        });

        it('sincroniza formulários e catálogos globais quando o usuário é administrativo', async () => {
            mockAuthService.isAdministrativo.set(true);
            mockAuthService.isCampo.set(false);
            mockAuthService.podeAcessarInspecoes.set(true);
            mockAuthService.podeAcessarLogistica.set(false);
            stubEtapas();

            await service.syncTotal();

            expect((service as any).syncFormularios).toHaveBeenCalled();
            expect((service as any).syncTiposInspecao).toHaveBeenCalled();
            expect((service as any).syncTodasEquipes).toHaveBeenCalled();
            expect((service as any).syncEquipeDoUsuario).not.toHaveBeenCalled();
        });

        it('não baixa catálogos de material para o perfil administrativo', async () => {
            mockAuthService.isAdministrativo.set(true);
            mockAuthService.isCampo.set(false);
            mockAuthService.podeAcessarInspecoes.set(true);
            mockAuthService.podeAcessarLogistica.set(false);
            stubEtapas();

            const result = await service.syncTotal();

            // Endpoints de logística respondem 403 para o administrativo: nem são chamados.
            expect((service as any).syncMateriais).not.toHaveBeenCalled();
            expect((service as any).syncEstoques).not.toHaveBeenCalled();
            expect((service as any).syncSaldos).not.toHaveBeenCalled();
            expect((service as any).syncSeriais).not.toHaveBeenCalled();
            expect((service as any).reaplicarDeducoesPendentes).not.toHaveBeenCalled();

            // Sem etapas negadas, o login não exibe o alerta de dados não carregados.
            expect(result.falhas).toEqual([]);
        });

        it('não repete o catálogo de materiais no pull final', async () => {
            stubEtapas();
            (service as any).pullParcialData.mockRestore();
            ['syncTransferencias']
                .forEach(nome => vi.spyOn(service as any, nome).mockResolvedValue(undefined));

            await service.syncTotal();

            expect((service as any).syncMateriais).toHaveBeenCalledTimes(1);
        });

        it('reaplica as deduções locais somente após saldos e seriais', async () => {
            stubEtapas();

            await service.syncTotal();

            const reaplicar = vi.mocked((service as any).reaplicarDeducoesPendentes);
            expect(reaplicar).toHaveBeenCalledWith('est-1');
            expect(Math.min(...vi.mocked((service as any).syncSaldos).mock.invocationCallOrder)).toBeLessThan(Math.min(...reaplicar.mock.invocationCallOrder));
            expect(Math.min(...vi.mocked((service as any).syncSeriais).mock.invocationCallOrder)).toBeLessThan(Math.min(...reaplicar.mock.invocationCallOrder));
        });
    });

    describe('composição da equipe', () => {
        it('sincroniza a composição e meta da equipe no sync total do usuário de campo', async () => {
            stubEtapas();

            await service.syncTotal();

            expect(mockTurnoService.sincronizarComposicao).toHaveBeenCalled();
        });
    });

    describe('escopo do usuário de campo', () => {
        it('não baixa inspeções de segurança para usuário de campo', async () => {
            vi.spyOn(service as any, 'syncMateriais').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncTransferencias').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncSaldos').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncSeriais').mockResolvedValue(undefined);
            const inspecoesSpy = vi.spyOn(service as any, 'syncInspecoes').mockResolvedValue(undefined);

            await (service as any).pullParcialData([]);

            expect(inspecoesSpy).not.toHaveBeenCalled();
        });

        it('baixa inspeções de segurança para usuário administrativo', async () => {
            mockAuthService.isAdministrativo.set(true);
            mockAuthService.isCampo.set(false);
            mockAuthService.podeAcessarInspecoes.set(true);
            mockAuthService.podeAcessarLogistica.set(false);

            vi.spyOn(service as any, 'syncMateriais').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncTransferencias').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncSaldos').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncSeriais').mockResolvedValue(undefined);
            const inspecoesSpy = vi.spyOn(service as any, 'syncInspecoes').mockResolvedValue(undefined);

            await (service as any).pullParcialData([]);

            expect(inspecoesSpy).toHaveBeenCalled();
        });

        it('não puxa listas de material no pull do perfil administrativo', async () => {
            mockAuthService.isAdministrativo.set(true);
            mockAuthService.isCampo.set(false);
            mockAuthService.podeAcessarInspecoes.set(true);
            mockAuthService.podeAcessarLogistica.set(false);

            vi.spyOn(service as any, 'syncMateriais').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncTransferencias').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncSaldos').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncSeriais').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'syncInspecoes').mockResolvedValue(undefined);
            vi.spyOn(service as any, 'reaplicarDeducoesPendentes').mockResolvedValue(undefined);

            const falhas: any[] = [];
            await (service as any).pullParcialData(falhas);

            expect((service as any).syncMateriais).not.toHaveBeenCalled();
            expect((service as any).syncTransferencias).not.toHaveBeenCalled();
            expect((service as any).syncSaldos).not.toHaveBeenCalled();
            expect((service as any).syncSeriais).not.toHaveBeenCalled();
            expect((service as any).reaplicarDeducoesPendentes).not.toHaveBeenCalled();
            expect(falhas).toEqual([]);
        });
    });

    describe('syncMunicipios() — preservação do cache local', () => {
        it('não apaga o catálogo local quando o endpoint responde 403', async () => {
            let erro: any = null;
            (service as any).syncMunicipios().catch((e: any) => erro = e);

            const req = httpMock.expectOne(r => r.url === `${environment.apiBaseUrl}/v1/municipios`);
            req.flush({ title: 'Acesso negado' }, { status: 403, statusText: 'Forbidden' });
            await vi.advanceTimersByTimeAsync(0);

            expect(erro).toBeTruthy();
            // Crítico: um replace com lista vazia limparia os municípios já cacheados.
            expect(mockDbService.replaceMunicipios).not.toHaveBeenCalled();
        });
    });

    describe('syncOutbox()', () => {
        it('mantém operação na fila quando o servidor responde 401', async () => {
            mockOutboxService.getPendingItems.mockResolvedValue([{
                    id: 'out-auth', endpoint: '/v1/teste', method: 'POST', payload: {},
                    status: 'PENDENTE', tentativas: 0, criadoEm: new Date()
                }]);

            let erro: any;
            service.syncOutbox({ reconciliar: false }).catch(e => erro = e);
            await vi.advanceTimersByTimeAsync(0);
            httpMock.expectOne(`${environment.apiBaseUrl}/v1/teste`)
                .flush(null, { status: 401, statusText: 'Unauthorized' });
            await vi.advanceTimersByTimeAsync(0);

            expect(erro.status).toBe(401);
            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('out-auth', 'PENDENTE', expect.stringMatching(/mesma conta/));
            expect(mockOutboxService.discard).not.toHaveBeenCalledWith('out-auth');
        });

        it('não envia a versão que foi corrigida depois de a fila ser lida', async () => {
            mockOutboxService.getPendingItems.mockResolvedValue([{
                    id: 'versao-antiga', endpoint: '/v1/solicitacoes-material', method: 'POST',
                    payload: { tempId: 'v1' },
                    status: 'PENDENTE', tentativas: 0, criadoEm: new Date()
                }]);
            // A correção retirou a versão da fila entre a leitura e o envio.
            mockOutboxService.reivindicarParaEnvio.mockResolvedValue(undefined);

            service.syncOutbox({ reconciliar: false });
            await vi.advanceTimersByTimeAsync(0);

            httpMock.expectNone(`${environment.apiBaseUrl}/v1/solicitacoes-material`);
            expect(mockOutboxService.reivindicarParaEnvio).toHaveBeenCalledWith('versao-antiga');
        });

        it('envia a transferência sem tempId e troca o id provisório pelo do servidor', async () => {
            const local = {
                id: 'temp-1', idEstoqueOrigem: 'origem', idEstoqueDestino: 'destino', itens: [], statusSync: 'PENDENTE'
            };
            mockDbService.getTransferenciaById.mockResolvedValue(local);
            mockOutboxService.getPendingItems.mockResolvedValue([{
                    id: 'out-transf', endpoint: '/v1/movimentacoes-estoque/transferencia', method: 'POST',
                    payload: { tempId: 'temp-1', idEstoqueOrigem: 'origem', idEstoqueDestino: 'destino', itens: [] },
                    status: 'PENDENTE', tentativas: 0, criadoEm: new Date()
                }]);

            service.syncOutbox({ reconciliar: false });
            await vi.advanceTimersByTimeAsync(0);

            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/movimentacoes-estoque/transferencia`);
            expect(req.request.body).toEqual({ idEstoqueOrigem: 'origem', idEstoqueDestino: 'destino', itens: [] });
            req.flush('server-1');
            await vi.advanceTimersByTimeAsync(0);

            expect(mockDbService.deleteTransferencia).toHaveBeenCalledWith('temp-1');
            expect(mockDbService.saveTransferencia).toHaveBeenCalledWith(expect.objectContaining({
                id: 'server-1', statusSync: 'SINCRONIZADO'
            }));
        });

        it('coalesces concurrent executions so the same item is sent only once', async () => {
            vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);

            mockOutboxService.getPendingItems.mockResolvedValue([
                {
                    id: 'out-concurrent',
                    endpoint: '/v1/teste-concorrente',
                    method: 'POST',
                    payload: { foo: 'bar' },
                    status: 'PENDENTE',
                    tentativas: 0,
                    criadoEm: new Date()
                }
            ]);

            let firstResult: any;
            let secondResult: any;
            service.syncOutbox({ reconciliar: false }).then(result => firstResult = result);
            service.syncOutbox({ reconciliar: false }).then(result => secondResult = result);
            await vi.advanceTimersByTimeAsync(0);

            const requests = httpMock.match(`${environment.apiBaseUrl}/v1/teste-concorrente`);
            expect(requests.length).toBe(1);
            requests[0].flush({ success: true });
            await vi.advanceTimersByTimeAsync(0);

            expect(firstResult.sincronizados).toBe(1);
            expect(secondResult).toEqual(firstResult);
            expect(mockOutboxService.discard).toHaveBeenCalledTimes(1);
            expect(mockOutboxService.discard).toHaveBeenCalledWith('out-concurrent');
        });

        it('processa no mesmo ciclo itens enfileirados durante a sincronização', async () => {
            const itemInspecao = {
                id: 'out-inspecao',
                endpoint: '/v1/teste-inspecao',
                method: 'POST',
                payload: { tipo: 'inspecao' },
                status: 'PENDENTE',
                tentativas: 0,
                criadoEm: new Date()
            };
            const itemAnexo = {
                id: 'out-anexo',
                endpoint: '/v1/teste-anexo',
                method: 'POST',
                payload: { tipo: 'anexo' },
                status: 'PENDENTE',
                tentativas: 0,
                criadoEm: new Date()
            };
            let leitura = 0;
            mockOutboxService.getPendingItems.mockImplementation(() => {
                leitura++;
                return Promise.resolve(leitura === 1 ? [itemInspecao] : [itemAnexo]);
            });

            let result: any;
            service.syncOutbox({ reconciliar: false }).then(value => result = value);
            await vi.advanceTimersByTimeAsync(0);

            const inspecao = httpMock.expectOne(`${environment.apiBaseUrl}/v1/teste-inspecao`);
            inspecao.flush({ success: true });
            await vi.advanceTimersByTimeAsync(0);

            const anexo = httpMock.expectOne(`${environment.apiBaseUrl}/v1/teste-anexo`);
            anexo.flush({ success: true });
            await vi.advanceTimersByTimeAsync(0);

            expect(result).toEqual({ sincronizados: 2, erros: 0, falhas: [] });
            expect(mockOutboxService.discard).toHaveBeenCalledWith('out-inspecao');
            expect(mockOutboxService.discard).toHaveBeenCalledWith('out-anexo');
        });

        it('processa um item pendente com sucesso', async () => {
            vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);

            mockOutboxService.getPendingItems.mockResolvedValue([
                {
                    id: 'out-1',
                    endpoint: '/v1/teste',
                    method: 'POST',
                    payload: { foo: 'bar' },
                    status: 'PENDENTE',
                    tentativas: 0,
                    criadoEm: new Date()
                }
            ]);

            let result: any;
            service.syncOutbox().then(r => result = r);
            await vi.advanceTimersByTimeAsync(0);

            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/teste`);
            expect(req.request.method).toBe('POST');
            expect(req.request.body).toEqual({ foo: 'bar' });
            req.flush({ success: true });
            await vi.advanceTimersByTimeAsync(0);

            expect(result.sincronizados).toBe(1);
            expect(result.erros).toBe(0);
            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('out-1', 'SINCRONIZADO');
            expect(mockOutboxService.discard).toHaveBeenCalledWith('out-1');
            expect((service as any).pullParcialData).toHaveBeenCalled();
        });

        it('não reconcilia quando reconciliar=false (evita pull duplicado)', async () => {
            vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);

            let result: any;
            service.syncOutbox({ reconciliar: false }).then(r => result = r);
            await vi.advanceTimersByTimeAsync(0);

            expect(result).toEqual({ sincronizados: 0, erros: 0, falhas: [] });
            expect((service as any).pullParcialData).not.toHaveBeenCalled();
        });

        it('preserva o detalhe do backend já normalizado pelo errorInterceptor', async () => {
            vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);

            mockOutboxService.getPendingItems.mockResolvedValue([
                {
                    id: 'out-err',
                    endpoint: '/v1/erro',
                    method: 'POST',
                    payload: {},
                    status: 'PENDENTE',
                    tentativas: 0,
                    criadoEm: new Date()
                }
            ]);

            let result: any;
            service.syncOutbox().then(r => result = r);
            await vi.advanceTimersByTimeAsync(0);

            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/erro`);
            req.flush({ detail: 'Item inválido' }, { status: 400, statusText: 'Bad Request' });
            await vi.advanceTimersByTimeAsync(0);

            expect(result.erros).toBe(1);
            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('out-err', 'ERRO', 'Item inválido');
            expect(mockOutboxService.incrementAttempt).not.toHaveBeenCalled();
        });

        it('429 mantém o item pendente, adia pelo Retry-After e para a rodada sem marcar erro', async () => {
            vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);
            const item = (id: string) => ({
                id, endpoint: `/v1/${id}`, method: 'POST', payload: {}, status: 'PENDENTE', tentativas: 0, criadoEm: new Date()
            });
            mockOutboxService.getPendingItems.mockResolvedValue([item('lim-1'), item('lim-2')]);

            service.syncOutbox();
            await vi.advanceTimersByTimeAsync(0);

            httpMock.expectOne(`${environment.apiBaseUrl}/v1/lim-1`).flush({ detail: 'Muitas requisições em pouco tempo. Tente de novo em 40 segundos.', retryAfter: 40 }, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '40' } });
            await vi.advanceTimersByTimeAsync(0);

            httpMock.expectNone(`${environment.apiBaseUrl}/v1/lim-2`);
            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('lim-1', 'PENDENTE', 'Muitos envios em pouco tempo. O app tenta de novo sozinho em instantes.');
            expect(mockOutboxService.adiarPor).toHaveBeenCalledWith('lim-1', 40000);
            expect(mockOutboxService.updateStatus).not.toHaveBeenCalledWith('lim-1', 'ERRO', expect.anything());
            expect(mockOutboxService.incrementAttempt).not.toHaveBeenCalled();
        });

        it('falha por rede agenda nova rodada sozinha, com espera crescente', async () => {
            // Relógio estrito: as esperas são conferidas ao milissegundo, sem o tempo real andar junto.
            vi.useRealTimers();
            vi.useFakeTimers();
            vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);
            const pendente = {
                id: 'rede-1', endpoint: '/v1/rede-1', method: 'POST', payload: {}, status: 'PENDENTE', tentativas: 0, criadoEm: new Date()
            };
            mockOutboxService.getPendingItems.mockResolvedValue([pendente]);
            // Sem rede: o envio cai e a consulta de recebimento também não acha o item.
            const falharPorRede = async () => {
                httpMock.expectOne(`${environment.apiBaseUrl}/v1/rede-1`).error(new ProgressEvent('error'), { status: 0 });
                await vi.advanceTimersByTimeAsync(0);
                httpMock.expectOne(r => r.url.endsWith('/operacoes/rede-1')).flush(null, { status: 404, statusText: 'Not Found' });
                await vi.advanceTimersByTimeAsync(0);
            };

            service.syncOutbox();
            await vi.advanceTimersByTimeAsync(0);
            await falharPorRede();
            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('rede-1', 'PENDENTE', expect.any(String));

            // Primeira retomada em 15 s, sem ninguém tocar em "Sincronizar".
            await vi.advanceTimersByTimeAsync(RETOMADA_SEM_REDE_BASE_MS - 1);
            httpMock.expectNone(`${environment.apiBaseUrl}/v1/rede-1`);
            await vi.advanceTimersByTimeAsync(1);
            await falharPorRede();

            // A segunda espera dobra; quando o envio passa, nada mais é agendado.
            await vi.advanceTimersByTimeAsync(2 * RETOMADA_SEM_REDE_BASE_MS);
            httpMock.expectOne(`${environment.apiBaseUrl}/v1/rede-1`).flush({ id: 'srv-1' });
            await vi.advanceTimersByTimeAsync(0);
            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('rede-1', 'SINCRONIZADO');
            await vi.advanceTimersByTimeAsync(RETOMADA_SEM_REDE_MAX_MS);
            httpMock.expectNone(`${environment.apiBaseUrl}/v1/rede-1`);
        });

        it('lê a espera do 429 no corpo ou no header e ignora valores inválidos', () => {
            expect(esperaPedidaMs({ status: 429, retryAfter: 12 })).toBe(12000);
            expect(esperaPedidaMs({ headers: { get: () => '5' } })).toBe(5000);
            expect(esperaPedidaMs({ retryAfter: 999999 })).toBe(15 * 60 * 1000);
            expect(esperaPedidaMs({ retryAfter: 'amanhã' })).toBeUndefined();
            expect(esperaPedidaMs(null)).toBeUndefined();
        });

        it('retém o item com mensagem acionável e sem retry quando recebe 403', async () => {
            vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);

            mockOutboxService.getPendingItems.mockResolvedValue([
                {
                    id: 'out-403',
                    endpoint: '/v1/proibido',
                    method: 'POST',
                    payload: {},
                    status: 'PENDENTE',
                    tentativas: 0,
                    criadoEm: new Date()
                }
            ]);

            service.syncOutbox();
            await vi.advanceTimersByTimeAsync(0);

            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/proibido`);
            req.flush(null, { status: 403, statusText: 'Forbidden' });
            await vi.advanceTimersByTimeAsync(0);

            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('out-403', 'ERRO', 'Seu perfil de acesso não permite enviar esta operação. Fale com o administrador do sistema.');
            expect(mockOutboxService.incrementAttempt).not.toHaveBeenCalled();
        });

        it('sair da conta no meio do envio deixa a fila pendente, sem erro de perfil', async () => {
            const pull = vi.spyOn(service as any, 'pullParcialData').mockResolvedValue(undefined);
            const token = TestBed.inject(TokenService).token as unknown as WritableSignal<string | null>;
            const item = (id: string) => ({
                id, endpoint: `/v1/${id}`, method: 'POST', payload: {}, status: 'PENDENTE', tentativas: 0, criadoEm: new Date()
            });
            mockOutboxService.getPendingItems.mockResolvedValue([item('nota-1'), item('nota-2')]);

            service.syncOutbox();
            await vi.advanceTimersByTimeAsync(0);

            // Logout: o token some enquanto o primeiro envio está no ar e o servidor responde 403 sem corpo.
            token.set(null);
            httpMock.expectOne(`${environment.apiBaseUrl}/v1/nota-1`).flush(null, { status: 403, statusText: 'Forbidden' });
            await vi.advanceTimersByTimeAsync(0);

            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('nota-1', 'PENDENTE', expect.any(String));
            expect(mockOutboxService.updateStatus).not.toHaveBeenCalledWith('nota-1', 'ERRO', expect.any(String));
            httpMock.expectNone(`${environment.apiBaseUrl}/v1/nota-2`);
            expect(pull).not.toHaveBeenCalled();
            token.set('token-valido');
        });
    });

    describe('syncFormularios()', () => {
        it('preserva o cache anterior quando qualquer detalhe de formulário falha', async () => {
            let erro: unknown;
            (service as any).syncFormularios().catch((e: unknown) => erro = e);
            await vi.advanceTimersByTimeAsync(0);

            const lista = httpMock.expectOne(request => request.url === `${environment.apiBaseUrl}/v1/sst/formularios-inspecao?ativo=true`);
            lista.flush({
                content: [{ id: 'form-1' }, { id: 'form-2' }],
                page: { totalPages: 1 }
            });
            await vi.advanceTimersByTimeAsync(0);

            const primeiro = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/formularios-inspecao/form-1`);
            primeiro.flush({ id: 'form-1', titulo: 'Formulário 1', grupos: [] });
            await vi.advanceTimersByTimeAsync(0);

            const segundo = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/formularios-inspecao/form-2`);
            segundo.flush(null, { status: 503, statusText: 'Service Unavailable' });
            await vi.advanceTimersByTimeAsync(0);

            expect(erro).toBeTruthy();
            expect(mockDbService.replaceFormularios).not.toHaveBeenCalled();
        });
    });

    describe('processarInspecaoLancamento', () => {
        /**
         * As evidências sobem antes do lançamento, então o `POST /inspecoes` só é
         * emitido depois de alguns `await`. Drena a fila de microtarefas antes de
         * checar a próxima requisição.
         */
        const drenarPendencias = () => new Promise<void>(resolve => setTimeout(resolve, 0));

        const novaEvidencia = (idLocal: string, idRemoto: string | null = null) => ({
            idLocal,
            arquivo: new File(['foto'], `${idLocal}.jpg`, { type: 'image/jpeg' }),
            nomeArquivo: `${idLocal}.jpg`,
            contentType: 'image/jpeg',
            idRemoto,
            estado: idRemoto ? 'ENVIADA' : 'LOCAL',
            tentativas: idRemoto ? 1 : 0,
        });

        it('envia somente o contrato aceito e grava a resposta canônica', async () => {
            const mockItem = {
                id: 'local-id',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz',
                        idProcesso: 'processo-1',
                        idBaseOperacional: 'base-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'],
                        respostas: [{ idPergunta: 'p1', opcoesSelecionadas: ['r1'] }],
                        desvios: [{
                                idPergunta: 'p1', idOpcaoResposta: 'r1', descricao: 'Teste',
                                colaboradores: ['c1'], gravidade: 'CRITICA', dataResolucao: 'indevida'
                            }]
                    },
                    anexosPendentes: [],
                    evidencias: [novaEvidencia('ev-1', 'remoto-1')]
                },
                status: 'PENDENTE'
            };

            mockDbService.getInspecao.mockResolvedValue({ id: 'local-id', status: 'EM_ANDAMENTO' });

            const processPromise = (service as any).processarInspecaoLancamento(mockItem);
            await drenarPendencias();

            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
            expect(req.request.method).toBe('POST');
            expect(req.request.body.idInspetor).toBeUndefined();
            expect(req.request.body.desvios[0].gravidade).toBeUndefined();
            expect(req.request.body.desvios[0].dataResolucao).toBeUndefined();
            expect(req.request.body.evidencias).toEqual(['remoto-1']);

            req.flush({
                id: 'real-server-id', idInspetor: 'inspetor-1', status: 'CONCLUIDA',
                dataRealizacao: '2026-07-31T08:30:01-03:00', observacoes: null,
                latitude: null, longitude: null, respostas: [], desvios: [],
                evidencias: [{ id: 'remoto-1', nomeArquivo: 'ev-1.jpg' }]
            });

            await processPromise;

            expect(mockOutboxService.updatePayload).toHaveBeenCalledWith('local-id', expect.objectContaining({
                respostaServidor: expect.objectContaining({ id: 'real-server-id' })
            }));
            expect(mockDbService.deleteInspecao).toHaveBeenCalledWith('local-id');
            expect(mockDbService.saveInspecao).toHaveBeenCalledWith(expect.objectContaining({
                id: 'real-server-id',
                status: 'CONCLUIDA',
                statusSync: 'SINCRONIZADO',
                erroDetalhes: undefined,
                // Blobs liberados só depois do 201 do lançamento.
                evidencias: [],
                evidenciasRemotas: [{ id: 'remoto-1', nomeArquivo: 'ev-1.jpg' }]
            }));
        });

        it('sobe as evidências antes do lançamento e persiste cada idRemoto no 201', async () => {
            const mockItem = {
                id: 'local-id',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz', idProcesso: 'processo-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'], respostas: [], desvios: []
                    },
                    anexosPendentes: [],
                    evidencias: [novaEvidencia('ev-1'), novaEvidencia('ev-2')]
                },
                status: 'PENDENTE'
            };
            mockDbService.getInspecao.mockResolvedValue(undefined);

            // O payload é gravado por referência: só uma cópia no momento da chamada
            // mostra o que estava persistido em cada etapa.
            const checkpoints: {
                idRemoto?: string | null;
                estado: string;
            }[][] = [];
            mockOutboxService.updatePayload.mockImplementation((_id: string, payload: any) => {
                checkpoints.push((payload.evidencias ?? []).map((evidencia: any) => ({
                    idRemoto: evidencia.idRemoto,
                    estado: evidencia.estado,
                })));
                return Promise.resolve();
            });

            const promise = (service as any).processarInspecaoLancamento(mockItem);
            await drenarPendencias();

            const url = `${environment.apiBaseUrl}/v1/sst/inspecoes/anexos`;
            const primeiro = httpMock.expectOne(url);
            expect(primeiro.request.body instanceof FormData).toBe(true);
            expect((primeiro.request.body.get('arquivo') as File).name).toBe('ev-1.jpg');
            // Uma foto por requisição: a segunda só sai depois do 201 da primeira.
            httpMock.expectNone(url);
            primeiro.flush({ id: 'remoto-1' });
            await drenarPendencias();

            const segundo = httpMock.expectOne(url);
            segundo.flush({ id: 'remoto-2' });
            await drenarPendencias();

            const lancamento = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
            expect(lancamento.request.body.evidencias).toEqual(['remoto-1', 'remoto-2']);
            lancamento.flush({
                id: 'inspecao-1', idInspetor: 'inspetor-1', status: 'CONCLUIDA',
                dataRealizacao: '2026-07-31T08:30:01-03:00', respostas: [], desvios: [],
                evidencias: [{ id: 'remoto-1' }, { id: 'remoto-2' }]
            });
            await promise;

            // O idRemoto da primeira foto já estava persistido enquanto a segunda
            // ainda nem tinha subido — é isso que evita reenviar foto já enviada.
            expect(checkpoints.length).toBeGreaterThanOrEqual(3);
            expect(checkpoints[0][0]).toEqual({ idRemoto: 'remoto-1', estado: 'ENVIADA' });
            expect(checkpoints[0][1].idRemoto).toBeFalsy();
            expect(checkpoints[1][1]).toEqual({ idRemoto: 'remoto-2', estado: 'ENVIADA' });
        });

        it('não reenvia a foto já enviada quando só o lançamento falhou', async () => {
            const mockItem = {
                id: 'local-id',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz', idProcesso: 'processo-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'], respostas: [], desvios: []
                    },
                    anexosPendentes: [],
                    evidencias: [novaEvidencia('ev-1', 'remoto-1')]
                },
                status: 'PENDENTE'
            };
            mockDbService.getInspecao.mockResolvedValue(undefined);

            const promise = (service as any).processarInspecaoLancamento(mockItem);
            await drenarPendencias();
            httpMock.expectNone(`${environment.apiBaseUrl}/v1/sst/inspecoes/anexos`);

            const lancamento = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
            lancamento.flush({
                id: 'inspecao-1', idInspetor: 'inspetor-1', status: 'CONCLUIDA',
                dataRealizacao: '2026-07-31T08:30:01-03:00', respostas: [], desvios: [],
                evidencias: []
            });

            await promise;
            expect(mockOutboxService.discard).toHaveBeenCalledWith('local-id');
        });

        it('reenvia o Blob e refaz o lançamento quando a evidência foi expurgada (404)', async () => {
            const mockItem = {
                id: 'local-id',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz', idProcesso: 'processo-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'], respostas: [], desvios: []
                    },
                    anexosPendentes: [],
                    evidencias: [novaEvidencia('ev-1', 'expurgado-1')]
                },
                status: 'PENDENTE'
            };
            mockDbService.getInspecao.mockResolvedValue(undefined);

            const promise = (service as any).processarInspecaoLancamento(mockItem);
            await drenarPendencias();

            const primeiroLancamento = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
            expect(primeiroLancamento.request.body.evidencias).toEqual(['expurgado-1']);
            primeiroLancamento.flush({ detail: 'Evidência não encontrada.' }, { status: 404, statusText: 'Not Found' });
            await drenarPendencias();

            const reenvio = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes/anexos`);
            reenvio.flush({ id: 'remoto-novo' });
            await drenarPendencias();

            const segundoLancamento = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
            expect(segundoLancamento.request.body.evidencias).toEqual(['remoto-novo']);
            segundoLancamento.flush({
                id: 'inspecao-1', idInspetor: 'inspetor-1', status: 'CONCLUIDA',
                dataRealizacao: '2026-07-31T08:30:01-03:00', respostas: [], desvios: [],
                evidencias: [{ id: 'remoto-novo' }]
            });

            await promise;
            expect(mockOutboxService.discard).toHaveBeenCalledWith('local-id');
        });

        it('não marca resultado incerto quando a rede cai durante o upload da foto', async () => {
            const item = {
                id: 'out-upload',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz', idProcesso: 'processo-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'], respostas: [], desvios: []
                    },
                    anexosPendentes: [],
                    evidencias: [novaEvidencia('ev-1')]
                },
                status: 'PENDENTE',
                tentativas: 0
            };
            mockOutboxService.getPendingItems.mockReturnValueOnce(Promise.resolve([item])).mockReturnValueOnce(Promise.resolve([]));
            mockDbService.getInspecao.mockResolvedValue(undefined);

            const promise = service.syncOutbox({ reconciliar: false });
            await drenarPendencias();

            httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes/anexos`)
                .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
            await promise;

            // A inspeção sequer chegou a ser criada: nada de "envio a confirmar".
            expect(mockOutboxService.updateStatus).not.toHaveBeenCalledWith('out-upload', 'RESULTADO_INCERTO', expect.anything());
            expect(mockOutboxService.updateStatus).toHaveBeenCalledWith('out-upload', 'PENDENTE', expect.any(String));
        });

        it('retém o item com mensagem acionável quando não há nenhuma evidência', async () => {
            const mockItem = {
                id: 'local-id',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz', idProcesso: 'processo-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'], respostas: [], desvios: []
                    },
                    anexosPendentes: [],
                    evidencias: []
                },
                status: 'PENDENTE'
            };

            await expect((service as any).processarInspecaoLancamento(mockItem)).rejects.toEqual(expect.objectContaining({ status: 400 }));
            httpMock.expectNone(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
        });

        it('retoma a reconciliação pelo checkpoint sem reenviar a inspeção', async () => {
            const respostaServidor = {
                id: 'real-server-id', idInspetor: 'inspetor-1', status: 'CONCLUIDA',
                dataRealizacao: '2026-07-31T08:30:01-03:00', observacoes: null,
                latitude: null, longitude: null, respostas: [], desvios: []
            };
            const mockItem = {
                id: 'local-id',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz',
                        idProcesso: 'processo-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'],
                        respostas: [],
                        desvios: []
                    },
                    anexosPendentes: [],
                    respostaServidor
                },
                status: 'PENDENTE'
            };
            mockDbService.getInspecao.mockResolvedValue({ id: 'local-id', status: 'CONCLUIDA' });

            await (service as any).processarInspecaoLancamento(mockItem);

            httpMock.expectNone(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
            expect(mockDbService.saveInspecao).toHaveBeenCalledWith(expect.objectContaining({
                id: 'real-server-id',
                statusSync: 'SINCRONIZADO'
            }));
            expect(mockOutboxService.discard).toHaveBeenCalledWith('local-id');
        });

        it('mapeia o anexo para o desvio criado pelo servidor', async () => {
            const arquivo = new File(['foto'], 'evidencia.jpg', { type: 'image/jpeg' });
            const anexo = {
                idLocal: 'anexo-1',
                chaveDesvioLocal: 'p1:r1',
                contexto: 'DESVIO',
                arquivo,
                nomeArquivo: 'evidencia.jpg',
                contentType: 'image/jpeg'
            };
            const mockItem = {
                id: 'local-id',
                endpoint: INSPECAO_LANCAR_ENDPOINT,
                method: 'POST',
                payload: {
                    request: {
                        idFormulario: 'form-xyz', idProcesso: 'processo-1',
                        dataRealizacao: '2026-07-31T08:30:00-03:00',
                        colaboradoresInspecionados: ['c1'], respostas: [], desvios: []
                    },
                    anexosPendentes: [anexo],
                    evidencias: [novaEvidencia('ev-1', 'remoto-1')]
                },
                status: 'PENDENTE'
            };
            mockDbService.getInspecao.mockResolvedValue(undefined);

            const promise = (service as any).processarInspecaoLancamento(mockItem);
            await drenarPendencias();
            const request = httpMock.expectOne(`${environment.apiBaseUrl}/v1/sst/inspecoes`);
            request.flush({
                id: 'inspecao-1', idInspetor: 'inspetor-1', status: 'CONCLUIDA',
                dataRealizacao: '2026-07-31T08:30:01-03:00', respostas: [],
                desvios: [{ id: 'desvio-1', idPergunta: 'p1', idOpcaoResposta: 'r1' }],
                evidencias: []
            });
            await promise;

            expect(mockOutboxService.enqueue).toHaveBeenCalledWith({
                endpoint: INSPECAO_ANEXO_ENDPOINT,
                method: 'POST',
                payload: { idInspecao: 'inspecao-1', idDesvio: 'desvio-1', anexo }
            });
        });
    });

    describe('processarAnexoInspecao', () => {
        it('envia o arquivo como multipart com nome e contexto preservados', async () => {
            const arquivo = new File(['foto'], 'camera.jpg', { type: 'image/jpeg' });
            const anexo = {
                idLocal: 'anexo-1', chaveDesvioLocal: 'p1:r1', contexto: 'DESVIO',
                arquivo, nomeArquivo: 'camera.jpg', contentType: 'image/jpeg'
            };
            const item = {
                id: 'out-anexo',
                endpoint: INSPECAO_ANEXO_ENDPOINT,
                method: 'POST',
                payload: {
                    idInspecao: 'inspecao-1',
                    idDesvio: 'desvio-1',
                    anexo
                },
                status: 'PENDENTE'
            };
            mockDbService.getInspecao.mockResolvedValue({
                id: 'inspecao-1',
                status: 'CONCLUIDA',
                statusSync: 'SINCRONIZADO',
                anexosPendentes: [anexo]
            });

            const promise = (service as any).processarAnexoInspecao(item);
            const request = httpMock.expectOne(req => req.url === `${environment.apiBaseUrl}/v1/sst/inspecoes/inspecao-1/desvios/desvio-1/anexos`
                && req.params.get('contexto') === 'DESVIO');
            expect(request.request.body instanceof FormData).toBe(true);
            const enviado = request.request.body.get('arquivo') as File;
            expect(enviado.name).toBe('camera.jpg');
            expect(enviado.type).toBe('image/jpeg');
            request.flush({ id: 'anexo-remoto-1' });
            await promise;

            expect(mockDbService.saveInspecao).toHaveBeenCalledWith(expect.objectContaining({
                id: 'inspecao-1',
                anexosPendentes: []
            }));
            expect(mockOutboxService.discard).toHaveBeenCalledWith('out-anexo');
        });
    });
});
