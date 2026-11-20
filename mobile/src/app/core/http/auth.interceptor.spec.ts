import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { TokenService } from '../auth/token.service';
import { AuthService } from '../auth/auth.service';

describe('authInterceptor (mobile)', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    const token = signal<string | null>('jwt');
    let vencido = false;
    let auth: any;

    const umTique = () => new Promise(resolve => setTimeout(resolve, 0));

    beforeEach(() => {
        token.set('jwt');
        vencido = false;
        auth = {
            podeRenovar: vi.fn().mockName("AuthService.podeRenovar"),
            renovarToken: vi.fn().mockName("AuthService.renovarToken"),
            tokenAtualizado: vi.fn().mockName("AuthService.tokenAtualizado")
        };
        auth.podeRenovar.mockReturnValue(true);

        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
                provideHttpClientTesting(),
                { provide: TokenService, useValue: { token, isTokenExpired: () => vencido } },
                { provide: AuthService, useValue: auth },
            ],
        });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('rotas de sessão vão com cookie e sem Bearer (o token pode estar vencido)', () => {
        http.post('/api/v1/auth/refresh', null).subscribe();

        const req = httpMock.expectOne('/api/v1/auth/refresh');
        expect(req.request.headers.has('Authorization')).toBe(false);
        expect(req.request.withCredentials).toBe(true);
        req.flush({ token: 'novo' });
    });

    it('em 401 de token vencido renova e repete a requisição', async () => {
        auth.renovarToken.mockResolvedValue('jwt-novo');
        const resposta = vi.fn().mockName('resposta');

        http.get('/api/v1/turnos').subscribe(resposta);
        httpMock.expectOne('/api/v1/turnos').flush({ code: 'TOKEN_EXPIRADO' }, { status: 401, statusText: 'Unauthorized' });
        await umTique();

        const repetida = httpMock.expectOne('/api/v1/turnos');
        expect(repetida.request.headers.get('Authorization')).toBe('Bearer jwt-novo');
        repetida.flush({ ok: true });
        expect(resposta).toHaveBeenCalledWith({ ok: true });
    });

    it('sem rede para renovar, devolve o 401 original (a fila guarda o item)', async () => {
        auth.renovarToken.mockRejectedValue({ status: 0 });
        const erro = vi.fn().mockName('erro');

        http.get('/api/v1/turnos').subscribe({ error: erro });
        httpMock.expectOne('/api/v1/turnos').flush({}, { status: 401, statusText: 'Unauthorized' });
        await umTique();

        expect(erro).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    });

    it('SESSAO_INVALIDA não tenta renovar', () => {
        http.get('/api/v1/turnos').subscribe({ error: () => { } });
        httpMock.expectOne('/api/v1/turnos').flush({ code: 'SESSAO_INVALIDA' }, { status: 401, statusText: 'Unauthorized' });

        expect(auth.renovarToken).not.toHaveBeenCalled();
    });

    it('token já vencido: renova antes de enviar', async () => {
        vencido = true;
        auth.tokenAtualizado.mockResolvedValue('jwt-novo');

        http.get('/api/v1/turnos').subscribe();
        await umTique();

        const req = httpMock.expectOne('/api/v1/turnos');
        expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-novo');
        req.flush({});
    });
});
