import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { environment } from '../../../environments/environment';
import { DbService } from '../db/db.service';

describe('AuthService', () => {
    let service: AuthService;
    let httpMock: HttpTestingController;
    let routerSpy: any;
    let tokenServiceSpy: any;
    let dbServiceSpy: any;

    beforeEach(() => {
        // Spies para as dependências
        const routerSpyObj = {
            navigate: vi.fn().mockName("Router.navigate")
        };
        localStorage.removeItem('geo_logout_pendente');
        const tokenSpyObj: any = {
            token: vi.fn().mockName("TokenService.token"),
            setToken: vi.fn().mockName("TokenService.setToken"),
            clearToken: vi.fn().mockName("TokenService.clearToken"),
            getDecodedPayload: vi.fn().mockName("TokenService.getDecodedPayload"),
            isTokenExpired: vi.fn().mockName("TokenService.isTokenExpired"),
            decodeToken: vi.fn().mockName("TokenService.decodeToken"),
            ownerId: vi.fn().mockName("TokenService.ownerId"),
            marcarReautenticacaoNecessaria: vi.fn().mockName("TokenService.marcarReautenticacaoNecessaria"),
            recarregar: vi.fn().mockName("TokenService.recarregar")
        };
        tokenSpyObj.reautenticacaoNecessaria = signal(false);
        const dbSpyObj = {
            prepareForLogin: vi.fn().mockName("DbService.prepareForLogin")
        };
        dbSpyObj.prepareForLogin.mockResolvedValue(undefined);
        tokenSpyObj.decodeToken.mockReturnValue({ sub: 'id-123' } as any);
        tokenSpyObj.ownerId.mockReturnValue('id-123');

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                AuthService,
                { provide: Router, useValue: routerSpyObj },
                { provide: TokenService, useValue: tokenSpyObj },
                { provide: DbService, useValue: dbSpyObj }
            ]
        });

        service = TestBed.inject(AuthService);
        httpMock = TestBed.inject(HttpTestingController);
        routerSpy = TestBed.inject(Router);
        tokenServiceSpy = TestBed.inject(TokenService);
        dbServiceSpy = TestBed.inject(DbService);
    });

    afterEach(() => {
        httpMock.verify(); // Verifica se não há requisições HTTP pendentes
        localStorage.removeItem('geo_logout_pendente');
    });

    /** O login espera um eventual logout pendente terminar antes de postar. */
    const umTique = () => new Promise(resolve => setTimeout(resolve, 0));

    /** A trava entre abas (Web Locks) libera o callback de forma assíncrona. */
    async function esperar(url: string) {
        for (let i = 0; i < 50; i++) {
            const achadas = httpMock.match(url);
            if (achadas.length)
                return achadas[0];
            await umTique();
        }
        return httpMock.expectOne(url);
    }

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    describe('login', () => {
        it('should call auth endpoint and set token on success', async () => {
            const mockCredentials = { login: 'user123', senha: 'password123' };
            const mockResponse = { token: 'mock-jwt-token' };

            const completed = new Promise<void>(resolve => service.login(mockCredentials).subscribe(response => {
                expect(response).toEqual(mockResponse);
                expect(tokenServiceSpy.setToken).toHaveBeenCalledWith('mock-jwt-token');
                resolve();
            }));

            await umTique();
            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/auth/login`);
            expect(req.request.method).toBe('POST');
            expect(req.request.withCredentials).toBe(true);
            expect(req.request.body).toEqual(mockCredentials);

            // Simula a resposta de sucesso do backend
            req.flush(mockResponse);
            await completed;
            expect(dbServiceSpy.prepareForLogin).toHaveBeenCalledWith('id-123', 'id-123');
        });

        it('should not set token and propagate error when login fails', async () => {
            const mockCredentials = { login: 'user123', senha: 'wrongpassword' };

            service.login(mockCredentials).subscribe({
                next: () => expect.fail('should have failed with the 401 error'),
                error: (error) => {
                    expect(error.status).toBe(401);
                    expect(tokenServiceSpy.setToken).not.toHaveBeenCalled();
                }
            });

            await umTique();
            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/auth/login`);

            // Simula a resposta de erro do backend (401 Unauthorized)
            req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
        });
    });

    describe('logout', () => {
        it('should clear token, navigate to login and end the server session', async () => {
            service.logout();

            expect(tokenServiceSpy.clearToken).toHaveBeenCalled();
            expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
            await umTique();
            const req = httpMock.expectOne(`${environment.apiBaseUrl}/v1/auth/logout`);
            expect(req.request.withCredentials).toBe(true);
            req.flush(null);
            await umTique();
            expect(localStorage.getItem('geo_logout_pendente')).toBeNull();
        });
    });

    describe('isAuthenticated (computed signal)', () => {
        it('should return false if token is null', () => {
            tokenServiceSpy.token.mockReturnValue(null);
            tokenServiceSpy.isTokenExpired.mockReturnValue(true);

            expect(service.isAuthenticated()).toBe(false);
        });

        it('token vencido NÃO desloga: a sessão continua no aparelho', () => {
            tokenServiceSpy.token.mockReturnValue('expired-token');
            tokenServiceSpy.isTokenExpired.mockReturnValue(true);

            expect(service.isAuthenticated()).toBe(true);
        });

        it('should return true if token exists and is not expired', () => {
            tokenServiceSpy.token.mockReturnValue('valid-token');
            tokenServiceSpy.isTokenExpired.mockReturnValue(false);

            expect(service.isAuthenticated()).toBe(true);
        });
    });

    describe('acesso offline', () => {
        it('em 401 de sessão encerrada marca a reautenticação sem sair da tela', () => {
            service.requireReauthentication();

            expect(tokenServiceSpy.marcarReautenticacaoNecessaria).toHaveBeenCalled();
            expect(routerSpy.navigate).not.toHaveBeenCalled();
        });

        it('renova o token pelo cookie da sessão', async () => {
            tokenServiceSpy.token.mockReturnValue('vencido');
            tokenServiceSpy.isTokenExpired.mockReturnValue(true);

            const renovacao = service.renovarToken('vencido');
            const req = await esperar(`${environment.apiBaseUrl}/v1/auth/refresh`);
            expect(req.request.withCredentials).toBe(true);
            expect(req.request.headers.has('Authorization')).toBe(false);
            req.flush({ token: 'novo' });

            expect(await renovacao).toBe('novo');
            expect(tokenServiceSpy.setToken).toHaveBeenCalledWith('novo');
        });

        it('renovações simultâneas fazem uma única chamada', async () => {
            tokenServiceSpy.token.mockReturnValue('vencido');
            tokenServiceSpy.isTokenExpired.mockReturnValue(true);

            const a = service.renovarToken('vencido');
            const b = service.renovarToken('vencido');
            (await esperar(`${environment.apiBaseUrl}/v1/auth/refresh`)).flush({ token: 'novo' });

            expect(await a).toBe(await b);
        });

        it('SESSAO_INVALIDA na renovação marca reautenticação e mantém a sessão local', async () => {
            tokenServiceSpy.token.mockReturnValue('vencido');
            tokenServiceSpy.isTokenExpired.mockReturnValue(true);

            const renovacao = service.renovarToken('vencido');
            (await esperar(`${environment.apiBaseUrl}/v1/auth/refresh`))
                .flush({ code: 'SESSAO_INVALIDA' }, { status: 401, statusText: 'Unauthorized' });

            await expect(renovacao).rejects.toThrow();
            expect(tokenServiceSpy.marcarReautenticacaoNecessaria).toHaveBeenCalled();
            expect(tokenServiceSpy.clearToken).not.toHaveBeenCalled();
        });

        it('não aceita, em silêncio, sessão renovada de outra conta', async () => {
            tokenServiceSpy.token.mockReturnValue('vencido');
            tokenServiceSpy.isTokenExpired.mockReturnValue(true);
            tokenServiceSpy.decodeToken.mockReturnValue({ sub: 'outra-conta' } as any);

            const renovacao = service.renovarToken('vencido');
            (await esperar(`${environment.apiBaseUrl}/v1/auth/refresh`)).flush({ token: 'de-outro' });

            await expect(renovacao).rejects.toThrow();
            expect(tokenServiceSpy.setToken).not.toHaveBeenCalled();
        });

        it('permite reabrir o app sem rede com a identidade previamente vinculada', () => {
            vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
            tokenServiceSpy.getDecodedPayload.mockReturnValue({ sub: 'id-123' } as any);
            tokenServiceSpy.ownerId.mockReturnValue('id-123');

            expect(service.canUseOffline()).toBe(true);
        });

        it('não libera dados locais para outra identidade', () => {
            vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
            tokenServiceSpy.getDecodedPayload.mockReturnValue({ sub: 'id-456' } as any);
            tokenServiceSpy.ownerId.mockReturnValue('id-123');

            expect(service.canUseOffline()).toBe(false);
        });
    });

    describe('currentUser (computed signal)', () => {
        it('should return null if payload is null', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue(null);

            expect(service.currentUser()).toBeNull();
        });

        it('should return User object correctly if payload exists', () => {
            const mockPayload = {
                sub: 'id-123',
                nome: 'João Silva',
                equipeId: 'eq-99',
                estoqueId: 'est-88',
                roles: ['ENCARREGADO'],
                exp: 9999999999
            };

            tokenServiceSpy.getDecodedPayload.mockReturnValue(mockPayload);

            const user = service.currentUser();

            expect(user).toBeTruthy();
            expect(user?.id).toBe('id-123');
            expect(user?.nome).toBe('João Silva');
            expect(user?.equipeId).toBe('eq-99');
            expect(user?.roles).toEqual(['ENCARREGADO']);
        });
    });

    describe('perfil de acesso', () => {
        it('should identify administrative user if tipoUsuario is ADMINISTRATIVO', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '123',
                nome: 'Admin User',
                roles: [],
                tipoUsuario: 'ADMINISTRATIVO',
                exp: 9999999999
            });

            expect(service.isAdministrativo()).toBe(true);
            expect(service.isCampo()).toBe(false);
        });

        it('should identify field user if tipoUsuario is CAMPO', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '456',
                nome: 'Campo User',
                roles: ['execucao:comercial:write'],
                tipoUsuario: 'CAMPO',
                exp: 9999999999
            });

            expect(service.isAdministrativo()).toBe(false);
            expect(service.isCampo()).toBe(true);
        });

        it('o campo não aprova abastecimento, mesmo com a permissão: só pede', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '456', nome: 'Campo User', roles: ['frota:abastecimento:aprovar'], tipoUsuario: 'CAMPO', exp: 9999999999
            });
            expect(service.podeAprovarAbastecimento()).toBe(false);
        });

        it('o administrativo com a permissão aprova abastecimento', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '123', nome: 'Admin User', roles: ['frota:abastecimento:aprovar'], tipoUsuario: 'ADMINISTRATIVO', exp: 9999999999
            });
            expect(service.podeAprovarAbastecimento()).toBe(true);
        });

        it('nega o módulo de logística ao usuário administrativo', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '123',
                nome: 'Admin User',
                roles: [],
                tipoUsuario: 'ADMINISTRATIVO',
                exp: 9999999999
            });

            expect(service.podeAcessarLogistica()).toBe(false);
        });

        it('libera o módulo de logística ao usuário de campo', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '456',
                nome: 'Campo User',
                roles: ['execucao:comercial:write'],
                tipoUsuario: 'CAMPO',
                exp: 9999999999
            });

            expect(service.podeAcessarLogistica()).toBe(true);
        });

        it('bloqueia inspeções e desvios para usuário de campo mesmo com permissões residuais no token', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '456',
                nome: 'Campo User',
                roles: ['ROLE_CAMPO'],
                authorities: ['sst:inspecao:read', 'sst:formulario:read'],
                permissions: ['sst:inspecao:write'],
                tipoUsuario: 'CAMPO',
                exp: 9999999999
            });

            expect(service.podeAcessarInspecoes()).toBe(false);
            expect(service.podeConsultarDesvios()).toBe(false);
            expect(service.podeTratarDesvios()).toBe(false);
        });

        it('libera inspeções e desvios apenas para usuário administrativo', () => {
            tokenServiceSpy.getDecodedPayload.mockReturnValue({
                sub: '123',
                nome: 'Admin User',
                roles: [],
                tipoUsuario: 'ADMINISTRATIVO',
                exp: 9999999999
            });

            expect(service.podeAcessarInspecoes()).toBe(true);
            expect(service.podeConsultarDesvios()).toBe(true);
            expect(service.podeTratarDesvios()).toBe(true);
        });
    });
});
