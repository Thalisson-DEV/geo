import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';
import { TokenService } from '../auth/token.service';
import { SyncService } from './sync.service';

describe('ConnectivityService (Mobile)', () => {
    let service: ConnectivityService;
    let tokenServiceSpy: any;
    let syncServiceSpy: any;

    beforeEach(() => {
        localStorage.removeItem('geo_mobile_usar_redes_moveis');

        tokenServiceSpy = {
            token: vi.fn().mockName("TokenService.token"),
            isTokenExpired: vi.fn().mockName("TokenService.isTokenExpired"),
            getDecodedPayload: vi.fn().mockName("TokenService.getDecodedPayload")
        };
        tokenServiceSpy.token.mockReturnValue('valid-token');
        tokenServiceSpy.isTokenExpired.mockReturnValue(false);
        tokenServiceSpy.getDecodedPayload.mockReturnValue({
            sub: 'colab-1',
            nome: 'Encarregado Campo',
            roles: ['ENCARREGADO'],
            tipoUsuario: 'CAMPO',
            exp: 9999999999,
        });

        syncServiceSpy = {
            syncOutbox: vi.fn().mockName("SyncService.syncOutbox")
        };
        syncServiceSpy.syncOutbox.mockResolvedValue({ sincronizados: 0, erros: 0, falhas: [] });

        TestBed.configureTestingModule({
            providers: [
                ConnectivityService,
                { provide: TokenService, useValue: tokenServiceSpy },
                { provide: SyncService, useValue: syncServiceSpy },
            ],
        });

        service = TestBed.inject(ConnectivityService);
    });

    afterEach(() => {
        localStorage.removeItem('geo_mobile_usar_redes_moveis');
    });

    it('deve ser instanciado corretamente', () => {
        expect(service).toBeTruthy();
    });

    it('deve inicializar com usarRedesMoveis false por padrão para usuários do tipo CAMPO', () => {
        expect(service.usarRedesMoveis()).toBe(false);
    });

    it('deve ficar offline e marcar isBloqueadoPorDadosMoveis quando estiver em rede celular e usarRedesMoveis for false', () => {
        service.setSimulatedHardwareOnline(true);
        service.setUsarRedesMoveis(false);
        service.setSimulatedCellular(true);

        expect(service.isOnline()).toBe(false);
        expect(service.isBloqueadoPorDadosMoveis()).toBe(true);
        expect(service.statusConexao()).toBe('dados_moveis_bloqueados');
    });

    it('deve voltar a ficar online se o usuário ativar usarRedesMoveis', () => {
        service.setSimulatedHardwareOnline(true);
        service.setSimulatedCellular(true);
        service.setUsarRedesMoveis(false);
        expect(service.isOnline()).toBe(false);

        service.setUsarRedesMoveis(true);
        expect(service.isOnline()).toBe(true);
        expect(service.isBloqueadoPorDadosMoveis()).toBe(false);
        expect(service.statusConexao()).toBe('online');
        expect(localStorage.getItem('geo_mobile_usar_redes_moveis')).toBe('true');
    });

    it('deve ficar offline imediatamente quando o modo forcarOffline for ativado', () => {
        service.setSimulatedHardwareOnline(true);
        service.setSimulatedCellular(false);
        expect(service.isOnline()).toBe(true);

        service.setForcarOffline(true);
        expect(service.isOnline()).toBe(false);
        expect(service.statusConexao()).toBe('offline_manual');

        service.setForcarOffline(false);
        expect(service.isOnline()).toBe(true);
    });

    it('envia a fila ao voltar ao app, mesmo sem o estado da rede ter mudado', () => {
        (tokenServiceSpy as any).reautenticacaoNecessaria = () => false;
        service.setSimulatedCellular(false);
        service.setSimulatedHardwareOnline(true);
        syncServiceSpy.syncOutbox.mockClear();

        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));

        expect(syncServiceSpy.syncOutbox).toHaveBeenCalledTimes(1);
    });

    it('não envia a fila ao voltar ao app sem rede liberada', () => {
        (tokenServiceSpy as any).reautenticacaoNecessaria = () => false;
        service.setSimulatedHardwareOnline(false);
        syncServiceSpy.syncOutbox.mockClear();

        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));

        expect(syncServiceSpy.syncOutbox).not.toHaveBeenCalled();
    });

    it('deve ficar offline quando o hardware perder sinal completamente', () => {
        service.setSimulatedCellular(false);
        service.setSimulatedHardwareOnline(false);

        expect(service.isOnline()).toBe(false);
        expect(service.statusConexao()).toBe('offline_sem_rede');
    });
});
